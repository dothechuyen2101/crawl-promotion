import { categoryLabel, PLATFORM_LABELS, PROMO_TYPE_LABELS, normalizeText, type Platform, type PromoType } from '@cp/shared';
import { env, hasDatabase } from '../config.ts';
import { logger } from '../logger.ts';
import { db, must } from './db.ts';
import { escapeHtml, sendTelegram, telegramEnabled } from './telegram.ts';

/** Tối đa số tin gửi cho 1 người trong 1 lần chạy (phần còn lại gộp thành 1 dòng). */
const MAX_PER_CHAT = 8;

interface PromoRow {
  id: string;
  platform: Platform;
  type: PromoType;
  title: string;
  code: string | null;
  discount_type: string | null;
  discount_value: number | null;
  max_discount: number | null;
  min_spend: number | null;
  sale_price: number | null;
  original_price: number | null;
  discount_pct: number | null;
  end_at: string | null;
  url: string;
  affiliate_url: string | null;
  search_text: string;
  deal_quality: string | null;
  is_lowest_30d: boolean;
  category_slug: string | null;
}

interface SubRow {
  telegram_chat_id: number;
  keywords: string[];
  platforms: Platform[];
  types: PromoType[];
  categories: string[];
  min_discount_pct: number;
}

const vnd = (n: number | null) => (n == null ? '' : `${Number(n).toLocaleString('vi-VN')}đ`);

export function matches(sub: SubRow, p: PromoRow): boolean {
  // Không báo deal có dấu hiệu nâng giá gốc để "giảm ảo".
  if (p.deal_quality === 'inflated') return false;
  if (sub.platforms.length && !sub.platforms.includes(p.platform)) return false;
  if (sub.types.length && !sub.types.includes(p.type)) return false;
  if (sub.categories.length && !sub.categories.includes(p.category_slug ?? 'khac')) return false;
  const pct = p.discount_pct ?? (p.discount_type === 'percent' ? Number(p.discount_value) : null);
  if (sub.min_discount_pct > 0 && (pct == null || pct < sub.min_discount_pct)) return false;
  if (sub.keywords.length === 0) {
    return sub.min_discount_pct > 0 || sub.platforms.length > 0 || sub.types.length > 0 || sub.categories.length > 0;
  }
  return sub.keywords.some((k) => p.search_text.includes(normalizeText(k)));
}

export function formatPromo(p: PromoRow): string {
  const link = env.PUBLIC_SITE_URL ? `${env.PUBLIC_SITE_URL.replace(/\/$/, '')}/km/${p.id}` : p.affiliate_url ?? p.url;
  const cat = categoryLabel(p.category_slug);
  const lines = [`<b>${PLATFORM_LABELS[p.platform]}</b> · ${PROMO_TYPE_LABELS[p.type]}${cat ? ` · ${cat}` : ''}`, escapeHtml(p.title)];
  if (p.sale_price != null) {
    lines.push(`💰 ${vnd(p.sale_price)}${p.original_price ? ` <s>${vnd(p.original_price)}</s>` : ''}${p.discount_pct ? ` (-${p.discount_pct}%)` : ''}`);
    if (p.deal_quality === 'real') lines.push(p.is_lowest_30d ? '✅ Giảm thật · thấp nhất 30 ngày' : '✅ Giảm thật so với giá 30 ngày qua');
  }
  if (p.code) {
    const what =
      p.discount_type === 'percent'
        ? `giảm ${p.discount_value}%${p.max_discount ? ` tối đa ${vnd(p.max_discount)}` : ''}`
        : p.discount_type === 'freeship'
          ? `freeship ${p.discount_value ? vnd(p.discount_value) : ''}`
          : p.discount_value
            ? `giảm ${vnd(p.discount_value)}`
            : '';
    lines.push(`🎟 <code>${escapeHtml(p.code)}</code> ${what}${p.min_spend ? ` · đơn từ ${vnd(p.min_spend)}` : ''}`);
  }
  if (p.end_at) lines.push(`⏰ HSD: ${new Date(p.end_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`);
  lines.push(`<a href="${escapeHtml(link)}">Xem chi tiết</a>`);
  return lines.join('\n');
}

/** Gửi khuyến mãi mới (chưa thông báo) cho các người theo dõi khớp bộ lọc. */
export async function notifyNewPromotions(): Promise<number> {
  if (!hasDatabase || !telegramEnabled()) return 0;
  const since = new Date(Date.now() - 6 * 3600_000).toISOString();
  const promos = must(
    await db()
      .from('promotions')
      .select('id, platform, type, title, code, discount_type, discount_value, max_discount, min_spend, sale_price, original_price, discount_pct, end_at, url, affiliate_url, search_text, deal_quality, is_lowest_30d, category_slug')
      .is('notified_at', null)
      .eq('status', 'active')
      .gte('first_seen_at', since)
      .order('first_seen_at')
      .limit(500),
    'select new promotions',
  ) as PromoRow[];
  if (!promos.length) return 0;

  const subs = must(
    await db().from('subscriptions').select('telegram_chat_id, keywords, platforms, types, categories, min_discount_pct').eq('active', true),
    'select subscriptions',
  ) as SubRow[];

  let sent = 0;
  const perChat = new Map<number, { sent: number; skipped: number }>();
  for (const p of promos) {
    for (const s of subs) {
      if (!matches(s, p)) continue;
      const stat = perChat.get(s.telegram_chat_id) ?? { sent: 0, skipped: 0 };
      perChat.set(s.telegram_chat_id, stat);
      // Ghi log trước để không gửi trùng nếu chạy song song.
      const { data } = await db()
        .from('notification_log')
        .upsert({ promotion_id: p.id, chat_id: s.telegram_chat_id }, { onConflict: 'promotion_id,chat_id', ignoreDuplicates: true })
        .select('promotion_id');
      if (!data?.length) continue;
      if (stat.sent >= MAX_PER_CHAT) {
        stat.skipped++;
        continue;
      }
      if (await sendTelegram(s.telegram_chat_id, formatPromo(p))) {
        stat.sent++;
        sent++;
      }
    }
  }
  for (const [chat, stat] of perChat) {
    if (stat.skipped > 0) {
      const more = env.PUBLIC_SITE_URL ? ` Xem tất cả: ${env.PUBLIC_SITE_URL}` : '';
      await sendTelegram(chat, `… và ${stat.skipped} khuyến mãi khác khớp bộ lọc của bạn.${more}`);
    }
  }
  await db()
    .from('promotions')
    .update({ notified_at: new Date().toISOString() })
    .in('id', promos.map((p) => p.id));
  if (sent) logger.info({ sent, promos: promos.length }, 'notifications sent');
  return sent;
}
