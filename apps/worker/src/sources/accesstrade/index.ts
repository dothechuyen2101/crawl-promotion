import type { NormalizedPromotionInput, Platform } from '@cp/shared';
import { env } from '../../config.ts';
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
async function fetchOffers(ctx: CrawlContext, platform: Platform, query: Record<string, string>, page: number) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await httpJson<{ data?: AtOffer[] }>(API, {
        platform,
        priority: ctx.priority,
        signal: ctx.signal,
        retries: 0,
        timeoutMs: 45_000,
        headers: { authorization: `Token ${env.ACCESSTRADE_TOKEN}` },
        query: { ...query, limit: PAGE_SIZE, page },
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

export function offerToPromotions(o: AtOffer, platform: Platform): NormalizedPromotionInput[] {
  const url = o.link || o.aff_link;
  if (!o.id || !o.name || !url) return [];
  const { shop, category: shopCategory } = splitOfferName(o.name);
  const base = {
    platform,
    title: o.name.trim(),
    shopName: shop,
    description: o.content?.trim() || null,
    url,
    affiliateUrl: o.aff_link || null,
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
    for (const { platform, query } of TARGETS) {
      try {
        for (let page = 1; page <= 20; page++) {
          const items = (await fetchOffers(ctx, platform, query, page)).data ?? [];
          for (const o of items) yield* offerToPromotions(o, platform);
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
};

export const accesstradeSources: Source[] = [accesstrade];
