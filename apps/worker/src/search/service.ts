import { HANOI_DISTRICTS, type HanoiDistrict, type Platform } from '@cp/shared';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Json } from '@cp/shared/database';
import { check, db } from '../core/db.ts';
import type { CrawlContext } from '../core/types.ts';
import { escapeHtml, sendTelegram } from '../core/telegram.ts';
import { env } from '../config.ts';
import { logger } from '../logger.ts';
import { HIGH_MATCH, runSearch, type RankedResult } from './pipeline.ts';

const POLL_MS = 3000;

const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')}đ`;

/** Tin nhắn trả kết quả tìm giá cho người dùng bot Telegram (top 5 khớp cao). */
export function formatSearchReply(req: { id: string; query: string }, ranked: RankedResult[]): string {
  const top = ranked.filter((r) => r.matchScore >= HIGH_MATCH && !r.isOutlier).slice(0, 5);
  const link = env.PUBLIC_SITE_URL ? `${env.PUBLIC_SITE_URL.replace(/\/$/, '')}/tim-gia/${req.id}` : null;
  if (!top.length) {
    return `Không tìm thấy kết quả khớp cho "<b>${escapeHtml(req.query)}</b>".${link ? `\n<a href="${link}">Xem tất cả kết quả</a>` : ''}`;
  }
  const lines = [`🔎 Giá tốt nhất cho "<b>${escapeHtml(req.query)}</b>":`, ''];
  top.forEach((r, i) => {
    const codes = r.best.applied.map((a) => a.voucher.code ?? a.voucher.title).filter(Boolean);
    lines.push(
      `${i + 1}. <b>${vnd(r.best.effectivePrice)}</b> · ${escapeHtml(r.listing.platform)} · ${escapeHtml(r.listing.title.slice(0, 70))}`,
      `   Giá ${vnd(r.listing.price)}${codes.length ? ` · mã: <code>${escapeHtml(codes.join(', '))}</code>` : ''}`,
      `   <a href="${escapeHtml(r.listing.url)}">Mở sản phẩm</a>`,
    );
  });
  lines.push('', '<i>Giá ước tính; voucher có thể hết lượt hoặc có điều kiện riêng.</i>');
  if (link) lines.push(`<a href="${link}">Xem đầy đủ & tuỳ chọn ví/ngân hàng</a>`);
  return lines.join('\n');
}
/** Số yêu cầu tìm giá xử lý song song. */
const CONCURRENCY = 2;

interface RequestRow {
  id: string;
  query: string;
  input_url: string | null;
  kind: 'product' | 'food';
  district: string | null;
  notify_chat_id: number | null;
}

function toRow(requestId: string, r: RankedResult) {
  return {
    request_id: requestId,
    platform: r.listing.platform,
    listing_id: r.listing.listingId,
    title: r.listing.title,
    image_url: r.listing.imageUrl ?? null,
    url: r.listing.url,
    shop_id: r.listing.shopId ?? null,
    shop_name: r.listing.shopName ?? null,
    category: r.listing.category ?? null,
    price: r.listing.price,
    original_price: r.listing.originalPrice ?? null,
    shipping_fee: r.listing.shippingFee ?? null,
    vouchers: r.vouchers as unknown as Json[],
    best_combo: {
      applied: r.best.applied.map((a) => ({ id: a.voucher.id, group: a.group, amount: a.amount, cashback: a.cashback })),
      subtotal: r.best.subtotal,
      shippingFee: r.best.shippingFee,
      finalPrice: r.best.finalPrice,
      effectivePrice: r.best.effectivePrice,
      savings: r.best.savings,
    } as unknown as { [key: string]: Json },
    final_price: r.best.effectivePrice,
    match_score: r.matchScore,
    is_outlier: r.isOutlier,
  };
}

/**
 * Nhận yêu cầu tìm giá từ web (bảng search_requests), chạy pipeline và ghi kết quả dần theo từng sàn.
 * Lắng nghe Realtime để phản hồi ngay; polling làm dự phòng khi mất kết nối.
 */
export class SearchService {
  private running = new Set<string>();
  private channel: RealtimeChannel | null = null;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(private ctx: CrawlContext) {}

  start() {
    this.channel = db()
      .channel('search-requests')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'search_requests' }, () => void this.poll())
      .subscribe((status) => logger.info({ status }, 'search realtime'));
    this.timer = setInterval(() => void this.poll(), POLL_MS);
    void this.poll();
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.channel) await db().removeChannel(this.channel);
  }

  private async poll() {
    if (this.stopped || this.running.size >= CONCURRENCY) return;
    const { data } = await db()
      .from('search_requests')
      .select('id')
      .eq('status', 'pending')
      .order('created_at')
      .limit(CONCURRENCY - this.running.size);
    for (const { id } of data ?? []) {
      if (this.running.has(id)) continue;
      // Nhận việc nguyên tử: chỉ 1 worker đổi được pending → running.
      const { data: claimed } = await db()
        .from('search_requests')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'pending')
        .select('id, query, input_url, kind, district, notify_chat_id')
        .maybeSingle();
      if (!claimed) continue;
      this.running.add(id);
      void this.handle(claimed as RequestRow).finally(() => {
        this.running.delete(id);
        void this.poll();
      });
    }
  }

  private async handle(req: RequestRow) {
    const log = logger.child({ search: req.id, q: req.query });
    const started = Date.now();
    const done: Platform[] = [];
    const errors: string[] = [];
    const district = req.district && req.district in HANOI_DISTRICTS ? (req.district as HanoiDistrict) : null;
    try {
      const ranked = await runSearch({ query: req.query, inputUrl: req.input_url, kind: req.kind, district }, this.ctx, {
        onResults: async (platform, results) => {
          if (results.length) {
            check(
              await db().from('search_results').upsert(results.map((r) => toRow(req.id, r)), { onConflict: 'request_id,platform,listing_id' }),
              'insert search_results',
            );
          }
          done.push(platform);
          await db().from('search_requests').update({ platforms_done: done }).eq('id', req.id);
        },
        onPlatformDone: (platform, n, err) => {
          if (err) errors.push(`${platform}: ${err}`);
          log.debug({ platform, n, err }, 'platform done');
        },
      });
      await db()
        .from('search_requests')
        .update({
          status: errors.length === 0 ? 'done' : done.length > 0 ? 'partial' : 'error',
          error: errors.join('; ') || null,
          finished_at: new Date().toISOString(),
        })
        .eq('id', req.id);
      log.info({ ms: Date.now() - started, platforms: done.length, errors: errors.length }, 'search finished');
      if (req.notify_chat_id) await sendTelegram(req.notify_chat_id, formatSearchReply(req, ranked));
    } catch (err) {
      log.error({ err }, 'search failed');
      await db()
        .from('search_requests')
        .update({ status: 'error', error: String(err).slice(0, 500), finished_at: new Date().toISOString() })
        .eq('id', req.id);
    }
  }
}
