import { load } from 'cheerio';
import { normalizeText, type NormalizedPromotionInput } from '@cp/shared';
import { httpText } from '../../core/http.ts';
import type { SearchAdapter, Source } from '../../core/types.ts';
import { parseDiscountText } from '../common.ts';

export const BE_PROMO_URL = 'https://be.com.vn/chuong-trinh-khuyen-mai/';

/** Đối tác thanh toán hay gặp trong tiêu đề "be x VPBank ..." → mã phương thức thanh toán. */
const PAYMENT_PARTNERS: [RegExp, string][] = [
  [/vpbank/, 'vpbank'],
  [/\bacb\b/, 'acb'],
  [/\bcake\b/, 'cake'],
  [/vietinbank/, 'vietinbank'],
  [/techcombank/, 'techcombank'],
  [/\btpbank\b/, 'tpbank'],
  [/\bmb ?bank\b/, 'mbbank'],
  [/hd ?saison/, 'hdsaison'],
  [/\bmomo\b/, 'momo'],
  [/zalopay/, 'zalopay'],
  [/apple pay/, 'applepay'],
  [/paylater/, 'bepaylater'],
];

export function paymentPartner(title: string): string | null {
  const t = normalizeText(title);
  return PAYMENT_PARTNERS.find(([re]) => re.test(t))?.[1] ?? null;
}

/**
 * Trang "Chương trình khuyến mãi" của Be: danh sách thẻ (tiêu đề, ảnh, ngày đăng, link chi tiết).
 * Nội dung chi tiết (mã, điều kiện) chỉ có trong app nên chỉ lưu dạng chiến dịch, kèm đối tác thanh toán
 * và mức giảm đọc được từ tiêu đề.
 */
export function parseBePromoList(html: string): NormalizedPromotionInput[] {
  const $ = load(html);
  const out: NormalizedPromotionInput[] = [];
  const seen = new Set<string>();
  $('.smallnews').each((_, el) => {
    const card = $(el);
    const a = card.find('h3 a').first();
    const title = a.text().replace(/\s+/g, ' ').trim();
    const href = a.attr('href');
    if (!title || !href) return;
    const id = new URL(href, BE_PROMO_URL).searchParams.get('id') ?? href;
    if (seen.has(id)) return;
    seen.add(id);
    const style = card.find('.thumb a').attr('style') ?? '';
    const image = style.match(/url\(['"]?([^'")]+)['"]?\)/)?.[1] ?? null;
    const posted = card.find('.date').text().trim();
    const partner = paymentPartner(title);
    const d = parseDiscountText(title);
    out.push({
      platform: 'be',
      type: 'campaign',
      externalId: `be-${id}`,
      title,
      url: new URL(href, BE_PROMO_URL).toString(),
      imageUrl: image,
      city: null,
      scope: partner ? 'payment' : null,
      paymentMethod: partner,
      conditions: {
        postedAt: posted || null,
        detailInApp: true,
        maxDiscount: d.maxDiscount,
        discountType: d.discountType,
        discountValue: d.discountValue,
      },
    });
  });
  return out;
}

const campaign: Source = {
  id: 'be.campaign',
  platform: 'be',
  type: 'campaign',
  schedule: '35 * * * *',
  description: 'Chương trình khuyến mãi trên be.com.vn (chủ yếu ưu đãi thanh toán qua ngân hàng/ví)',
  async *run(ctx) {
    const html = await httpText(BE_PROMO_URL, { platform: 'be', priority: ctx.priority, signal: ctx.signal });
    yield* parseBePromoList(html);
  },
};

export const beSources: Source[] = [campaign];

/**
 * Be không có web đặt món nên chưa tìm được món/quán. Adapter trả rỗng để pipeline vẫn chạy
 * (mã chung của Be vẫn hiện ở trang chiến dịch).
 */
export const beSearchAdapter: SearchAdapter = {
  platform: 'be',
  kinds: [],
  async search() {
    return [];
  },
  async listingVouchers() {
    return [];
  },
};
