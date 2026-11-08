import type { NormalizedPromotionInput, Platform } from '@cp/shared';
import { env } from '../../config.ts';
import { check, db } from '../../core/db.ts';
import { HttpError, httpJson } from '../../core/http.ts';
import { sleep } from '../../core/limiter.ts';
import type { CrawlContext, Source } from '../../core/types.ts';
import { endOfDayVN, parseDiscountText, startOfDayVN, str } from '../common.ts';

/**
 * AccessTrade (mạng affiliate VN): API chính thức trả về khuyến mãi + mã giảm giá của các sàn,
 * kèm link affiliate sẵn. Tài liệu: developers.accesstrade.vn → "Get promotional information".
 * Cần ACCESSTRADE_TOKEN (pub.accesstrade.vn → thông tin cá nhân → access key).
 */
const API = 'https://api.accesstrade.vn/v1/offers_informations';
const CAMPAIGNS_API = 'https://api.accesstrade.vn/v1/campaigns';

/** Lọc theo domain; TikTok Shop không có domain riêng nên lọc theo merchant của chiến dịch "TIKTOK SHOP CPS". */
const TARGETS: { platform: Platform; query: Record<string, string> }[] = [
  { platform: 'shopee', query: { domain: 'shopee.vn' } },
  { platform: 'tiki', query: { domain: 'tiki.vn' } },
  { platform: 'lazada', query: { domain: 'lazada.vn' } },
  { platform: 'tiktok', query: { merchant: 'tiktok_cps' } },
];
const PAGE_SIZE = 50; // API giới hạn tối đa 50
const MAX_ATTEMPTS = 6;

/**
 * API AccessTrade thỉnh thoảng trả 403 "Invalid token" với key hợp lệ (thường khi gọi dồn dập);
 * gọi lại sau vài giây là được. Chỉ thử lại với lỗi này, 429 và 5xx.
 */
async function atGet<T>(ctx: CrawlContext, url: string, platform: Platform, query: Record<string, string | number>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await httpJson<T>(url, {
        platform,
        priority: ctx.priority,
        signal: ctx.signal,
        retries: 0,
        timeoutMs: 45_000,
        headers: { authorization: `Token ${env.ACCESSTRADE_TOKEN}` },
        query,
      });
    } catch (err) {
      if (ctx.signal.aborted) throw err;
      const timeout = err instanceof Error && (err.name === 'TimeoutError' || /timeout/i.test(err.message));
      const retryable =
        timeout ||
        (err instanceof HttpError && (err.status === 429 || err.status >= 500 || (err.status === 403 && /invalid token/i.test(err.body))));
      if (!retryable || attempt >= MAX_ATTEMPTS) throw err;
      await sleep(attempt * 3000, ctx.signal);
    }
  }
}

const fetchOffers = (ctx: CrawlContext, platform: Platform, query: Record<string, string>, page: number) =>
  atGet<{ data?: AtOffer[] }>(ctx, API, platform, { ...query, limit: PAGE_SIZE, page });

const merchantKey = (m: string | null | undefined) => (m ?? '').trim().toLowerCase();

/**
 * Merchant (shopee, tikivn, lazada_kol, tiktok_cps…) của các chiến dịch publisher đã được duyệt.
 * Link affiliate của chiến dịch chưa duyệt (approval = unregistered/pending) không chuyển hướng được
 * (isclix trả 404/500), nên chỉ offer có merchant trong tập này mới được gắn link affiliate.
 * So theo merchant vì số trong aff_link (go.isclix.com/deep_link/<số>) không phải mã chiến dịch.
 * Lỗi API → dùng kết quả lần trước (mặc định rỗng = không gắn link affiliate, đi thẳng link gốc của sàn).
 */
let lastApproved = new Set<string>();
/** Đã đọc được danh sách chiến dịch ít nhất 1 lần (chưa đọc được thì không dọn link). */
let approvedKnown = false;
async function approvedMerchants(ctx: CrawlContext): Promise<Set<string>> {
  try {
    const merchants = new Set<string>();
    for (let page = 1; page <= 20; page++) {
      const res = await atGet<{ data?: { merchant?: string; approval?: string }[]; total_page?: number }>(ctx, CAMPAIGNS_API, 'shopee', {
        limit: PAGE_SIZE,
        page,
      });
      for (const c of res.data ?? []) if (c.merchant && c.approval === 'successful') merchants.add(merchantKey(c.merchant));
      if ((res.data ?? []).length < PAGE_SIZE || page >= (res.total_page ?? 1)) break;
      await sleep(1000, ctx.signal);
    }
    lastApproved = merchants;
    approvedKnown = true;
  } catch (err) {
    if (ctx.signal.aborted) throw err;
    ctx.log.warn({ err: String(err).slice(0, 200) }, 'accesstrade campaigns failed, dùng danh sách cũ');
  }
  return lastApproved;
}

/** "[HPS - Phụ kiện công nghệ]-Giảm 20,000 VNĐ…" → { shop: "HPS", category: "Phụ kiện công nghệ", rest: "Giảm 20,000 VNĐ…" } */
export function splitOfferName(name: string): { shop: string | null; category: string | null; rest: string } {
  const m = name.trim().match(/^\[([^\]]+)\]\s*-?\s*(.*)$/s);
  if (!m) return { shop: null, category: null, rest: name.trim() };
  const [shop, ...cat] = m[1]!.split(' - ');
  return { shop: shop!.trim() || null, category: cat.join(' - ').trim() || null, rest: m[2]!.trim() || name.trim() };
}

export interface AtOffer {
  id: string;
  name: string;
  content?: string | null;
  link?: string | null;
  aff_link?: string | null;
  image?: string | null;
  merchant?: string | null;
  domain?: string | null;
  categories?: unknown[];
  start_time?: string | null;
  end_time?: string | null;
  /** Định dạng phần tử không có trong tài liệu: chấp nhận chuỗi hoặc object có coupon_code/code. */
  coupons?: unknown[];
}

function couponCodes(raw: unknown[] | undefined): { code: string; desc: string | null }[] {
  const out: { code: string; desc: string | null }[] = [];
  for (const c of raw ?? []) {
    if (typeof c === 'string' && c.trim()) out.push({ code: c.trim(), desc: null });
    else if (c && typeof c === 'object') {
      const o = c as Record<string, unknown>;
      const code = str(o.coupon_code) ?? str(o.code) ?? str(o.coupon);
      if (code) out.push({ code, desc: str(o.coupon_desc) ?? str(o.description) ?? str(o.desc) });
    }
  }
  return out;
}

const catName = (c: unknown) =>
  typeof c === 'string' ? c : c && typeof c === 'object' ? (str((c as Record<string, unknown>).category_name_show) ?? str((c as Record<string, unknown>).category_name)) : null;

/** approved: merchant của các chiến dịch đã duyệt — chỉ khi đó mới giữ aff_link (xem approvedMerchants). */
export function offerToPromotions(o: AtOffer, platform: Platform, approved: ReadonlySet<string> = new Set()): NormalizedPromotionInput[] {
  const affiliateUrl = o.aff_link && approved.has(merchantKey(o.merchant)) ? o.aff_link : null;
  const url = o.link || affiliateUrl;
  if (!o.id || !o.name || !url) return [];
  const { shop, category: shopCategory } = splitOfferName(o.name);
  const base = {
    platform,
    title: o.name.trim(),
    shopName: shop,
    description: o.content?.trim() || null,
    url,
    affiliateUrl,
    imageUrl: o.image || null,
    startAt: startOfDayVN(o.start_time),
    endAt: endOfDayVN(o.end_time),
    category: shopCategory ?? (o.categories ?? []).map(catName).find((c) => c && c !== 'Other') ?? null,
    conditions: { source: 'accesstrade', merchant: o.merchant ?? null },
  };
  const codes = couponCodes(o.coupons);
  const fromName = parseDiscountText(`${o.name}\n${o.content ?? ''}`);

  if (codes.length === 0) {
    // Không có mã: là chương trình khuyến mãi; nếu đọc được mức giảm thì vẫn giữ lại thông tin.
    return [{ ...base, type: 'campaign', externalId: `at-${o.id}`, conditions: { ...base.conditions, ...fromName } }];
  }
  return codes.map(({ code, desc }) => {
    const d = desc ? parseDiscountText(desc) : fromName;
    const parsed = d.discountType ? d : fromName;
    return {
      ...base,
      type: 'voucher' as const,
      externalId: `at-${o.id}-${code}`,
      code,
      description: [desc, base.description].filter(Boolean).join('\n') || null,
      discountType: parsed.discountType,
      discountValue: parsed.discountValue,
      maxDiscount: parsed.maxDiscount,
      minSpend: parsed.minSpend,
      // Tên dạng "[Shop]-..." là mã của shop đó; còn lại coi là mã sàn.
      scope: parsed.discountType === 'freeship' ? ('freeship' as const) : shop ? ('shop' as const) : ('platform' as const),
      conditions: { ...base.conditions, parsedFrom: desc ? 'coupon_desc' : 'name' },
    };
  });
}

const accesstrade: Source = {
  id: 'accesstrade.offers',
  platform: 'shopee',
  type: 'voucher',
  // ~2,5 phút mỗi lượt và API hay chập chờn → 1 lần/giờ
  schedule: '10 * * * *',
  description: 'Mã giảm giá & khuyến mãi Shopee/Lazada/Tiki/TikTok qua API AccessTrade',
  disabledReason: () => (env.ACCESSTRADE_TOKEN ? null : 'chưa có ACCESSTRADE_TOKEN'),
  async *run(ctx) {
    const failures: string[] = [];
    const approved = await approvedMerchants(ctx);
    ctx.log.info({ approved: [...approved] }, 'accesstrade approved campaigns');
    for (const { platform, query } of TARGETS) {
      try {
        for (let page = 1; page <= 20; page++) {
          const items = (await fetchOffers(ctx, platform, query, page)).data ?? [];
          for (const o of items) yield* offerToPromotions(o, platform, approved);
          if (items.length < PAGE_SIZE) break;
          await sleep(1500, ctx.signal);
        }
      } catch (err) {
        // Một sàn lỗi không làm hỏng các sàn còn lại.
        failures.push(`${platform}: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`);
        ctx.log.warn({ platform, err: String(err).slice(0, 200) }, 'accesstrade platform failed');
      }
    }
    if (failures.length === TARGETS.length) throw new Error(`AccessTrade lỗi toàn bộ: ${failures.join('; ')}`);
  },
  /**
   * Mã không còn trong API (AccessTrade xoay vòng danh sách) nhưng chưa hết hạn vẫn giữ link affiliate cũ →
   * bỏ link của các chiến dịch chưa duyệt để nút "Dùng mã" đi thẳng link gốc của sàn.
   */
  async afterRun(ctx) {
    if (!approvedKnown) return;
    const stale: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db()
        .from('promotions')
        .select('id, conditions')
        .eq('source', accesstrade.id)
        .not('affiliate_url', 'is', null)
        .neq('status', 'expired')
        .order('id')
        .range(from, from + 999);
      if (error) throw new Error(`select promotions: ${error.message}`);
      for (const p of data ?? []) {
        const merchant = (p.conditions as { merchant?: string } | null)?.merchant;
        if (!lastApproved.has(merchantKey(merchant))) stale.push(p.id);
      }
      if ((data ?? []).length < 1000) break;
    }
    for (let i = 0; i < stale.length; i += 300) {
      check(await db().from('promotions').update({ affiliate_url: null }).in('id', stale.slice(i, i + 300)), 'clear affiliate_url');
    }
    if (stale.length) ctx.log.info({ cleared: stale.length }, 'accesstrade: bỏ link affiliate của chiến dịch chưa duyệt');
  },
};

export const accesstradeSources: Source[] = [accesstrade];
