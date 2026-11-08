import { normalizeText, parseMinSpend, parseVnd, type Listing, type NormalizedPromotionInput } from '@cp/shared';
import { cleanUrl, fromEpoch, num, str, walkJson } from '../common.ts';

export const TIKI = 'https://tiki.vn';
export const COUPON_HUB_URL = `${TIKI}/khuyen-mai/ma-giam-gia`;

const RANK_TAGS = ['Bạc', 'Vàng', 'Bạch kim', 'Kim cương'];

/** Các block COUPON trong __NEXT_DATA__ của trang tổng hợp mã. */
export function couponBlocks(nextData: unknown): { id: number; codes: string[] }[] {
  const out: { id: number; codes: string[] }[] = [];
  for (const o of walkJson(nextData)) {
    if (o.type !== 'COUPON' || typeof o.payload !== 'string') continue;
    if (o.hidden === 1 || o.status === 0) continue;
    try {
      const payload = JSON.parse(o.payload) as { codes?: unknown };
      const codes = Array.isArray(payload.codes) ? payload.codes.filter((c): c is string => typeof c === 'string' && c.length > 0) : [];
      if (codes.length && typeof o.id === 'number') out.push({ id: o.id, codes });
    } catch {
      /* payload hỏng: bỏ qua */
    }
  }
  return out;
}

export interface TikiCoupon {
  coupon_code: string;
  coupon_id?: number;
  label?: string;
  short_title?: string;
  short_description?: string | null;
  long_description?: string | null;
  status?: string;
  out_of_stock?: boolean;
  coupon_type?: string; // TIKI_COUPON | SHIPPING_COUPON | SELLER_COUPON ...
  simple_action?: string | null; // by_percent | cart_fixed | by_fixed
  rule_type?: string | null;
  discount_amount?: number;
  discount_max?: number | null;
  min_amount?: number;
  expired_at?: number;
  seller_id?: number;
  seller_name?: string | null;
  payment?: unknown;
  tags?: string[];
  web_url?: string | null;
  icon_url?: string | null;
}

function paymentSlug(payment: unknown): string | null {
  if (!payment) return null;
  const name =
    typeof payment === 'string'
      ? payment
      : typeof payment === 'object'
        ? str((payment as Record<string, unknown>).code) ?? str((payment as Record<string, unknown>).name)
        : null;
  return name ? normalizeText(name).replace(/ /g, '-') : 'khac';
}

export function couponToPromotion(c: TikiCoupon): NormalizedPromotionInput | null {
  if (!c.coupon_code || c.status !== 'active' || c.out_of_stock) return null;
  const tags = c.tags ?? [];
  const desc = [c.short_description, c.long_description].filter(Boolean).join('\n');
  const shipping = c.coupon_type === 'SHIPPING_COUPON';
  const sellerId = c.seller_id && c.seller_id > 0 ? String(c.seller_id) : null;
  const payment = paymentSlug(c.payment);
  const minSpend = (c.min_amount ?? 0) > 0 ? c.min_amount! : parseMinSpend(desc);

  let discountType: 'percent' | 'fixed' | 'freeship';
  let discountValue: number | null;
  let maxDiscount: number | null = null;
  if (shipping) {
    discountType = 'freeship';
    discountValue = (c.discount_amount ?? 0) > 0 ? c.discount_amount! : parseVnd(c.label) ?? 0;
  } else if (c.simple_action === 'by_percent') {
    discountType = 'percent';
    discountValue = c.discount_amount ?? null;
    maxDiscount = c.discount_max ?? null;
  } else {
    discountType = 'fixed';
    discountValue = (c.discount_amount ?? 0) > 0 ? c.discount_amount! : parseVnd(c.label);
  }
  if (discountValue == null) return null;

  const rank = tags.find((t) => RANK_TAGS.includes(t)) ?? null;
  const label = c.label ?? c.short_title ?? c.coupon_code;
  return {
    platform: 'tiki',
    type: 'voucher',
    externalId: c.coupon_code,
    title: c.short_description ? `${label} – ${c.short_description}` : label,
    description: c.long_description ?? null,
    code: c.coupon_code,
    discountType,
    discountValue,
    maxDiscount,
    minSpend,
    endAt: fromEpoch(c.expired_at),
    url: c.web_url || COUPON_HUB_URL,
    imageUrl: c.icon_url || null,
    shopId: sellerId,
    shopName: c.seller_name ?? null,
    scope: payment ? 'payment' : shipping ? 'freeship' : sellerId ? 'shop' : 'platform',
    paymentMethod: payment,
    newUserOnly: tags.includes('KH mới'),
    conditions: {
      tags,
      appOnly: tags.includes('Chỉ cho App'),
      memberRank: rank,
      // Mã yêu cầu hạng thành viên cao: không tính vào giá mặc định
      restricted: Boolean(rank),
      ruleType: c.rule_type ?? null,
    },
    raw: c,
  };
}

/** Sản phẩm trong API tìm kiếm / widget của Tiki. */
export interface TikiProductItem {
  id: number;
  name: string;
  url_path?: string;
  url_key?: string;
  price: number;
  original_price?: number;
  list_price?: number;
  discount_rate?: number;
  thumbnail_url?: string;
  seller_id?: number;
  seller_name?: string;
  seller_product_id?: number;
  primary_category_name?: string;
  rating_average?: number;
  quantity_sold?: { value?: number } | null;
}

export function productUrl(it: Pick<TikiProductItem, 'url_path' | 'url_key' | 'id'>): string {
  if (it.url_path) return `${TIKI}/${it.url_path.replace(/^\//, '')}`;
  if (it.url_key) return `${TIKI}/${it.url_key}.html`;
  return `${TIKI}/p${it.id}.html`;
}

const spidOf = (it: TikiProductItem): string | null => {
  if (it.seller_product_id) return String(it.seller_product_id);
  const m = it.url_path?.match(/spid=(\d+)/);
  return m ? m[1]! : null;
};

export function listingId(it: TikiProductItem): string {
  const spid = spidOf(it);
  return spid ? `${it.id}-${spid}` : String(it.id);
}

export function itemToListing(it: TikiProductItem): Listing {
  return {
    platform: 'tiki',
    kind: 'product',
    listingId: listingId(it),
    title: it.name,
    url: productUrl(it),
    imageUrl: it.thumbnail_url || null,
    shopId: it.seller_id ? String(it.seller_id) : null,
    shopName: it.seller_name ?? null,
    price: it.price,
    originalPrice: it.original_price ?? it.list_price ?? null,
    shippingFee: null,
    category: it.primary_category_name ?? null,
    rating: it.rating_average ?? null,
    sold: it.quantity_sold?.value ?? null,
  };
}

/** Sản phẩm giảm giá → promotion loại deal (kèm thông tin để lưu lịch sử giá). */
export function itemToDeal(it: TikiProductItem, minDiscountPct = 5): NormalizedPromotionInput | null {
  const original = it.original_price ?? it.list_price ?? null;
  if (!original || !it.price || it.price >= original) return null;
  const pct = it.discount_rate ?? Math.round((1 - it.price / original) * 100);
  if (pct < minDiscountPct) return null;
  const id = listingId(it);
  return {
    platform: 'tiki',
    type: 'deal',
    externalId: id,
    productExternalId: id,
    title: it.name,
    salePrice: it.price,
    originalPrice: original,
    url: productUrl(it),
    imageUrl: it.thumbnail_url || null,
    shopId: it.seller_id ? String(it.seller_id) : null,
    shopName: it.seller_name ?? null,
    category: it.primary_category_name ?? null,
    conditions: { sold: it.quantity_sold?.value ?? null, rating: it.rating_average ?? null },
  };
}

/**
 * Item flash sale (api deals/collection). Định dạng có thể là { product: {...}, special_price, ... }
 * hoặc phẳng; parse phòng thủ cả hai.
 */
export function flashDealToPromotion(raw: Record<string, unknown>, slot?: { from?: string; to?: string }): NormalizedPromotionInput | null {
  const product = (raw.product && typeof raw.product === 'object' ? raw.product : raw) as Record<string, unknown>;
  const id = num(product.id);
  const name = str(product.name);
  const price = num(raw.special_price) ?? num(product.price);
  const original = num(product.list_price) ?? num(product.original_price) ?? num(raw.list_price);
  if (!id || !name || !price) return null;
  const spid = num(product.seller_product_id) ?? num(raw.seller_product_id);
  const pid = spid ? `${id}-${spid}` : String(id);
  const progress = (raw.progress ?? {}) as Record<string, unknown>;
  const toVN = (s?: string) => (s ? new Date(`${s.replace(' ', 'T')}+07:00`) : null);
  return {
    platform: 'tiki',
    type: 'flash_sale',
    externalId: `${num(raw.deal_id) ?? pid}`,
    productExternalId: pid,
    title: name,
    salePrice: price,
    originalPrice: original && original > price ? original : null,
    startAt: fromEpoch(num(raw.special_from_date)) ?? toVN(slot?.from),
    endAt: fromEpoch(num(raw.special_to_date)) ?? toVN(slot?.to),
    url: productUrl({ id, url_path: str(product.url_path) ?? undefined, url_key: str(product.url_key) ?? undefined }),
    imageUrl: str(product.thumbnail_url),
    shopId: num(product.seller_id) ? String(product.seller_id) : null,
    shopName: str(product.seller_name),
    conditions: {
      soldPct: num(progress.percent) ?? null,
      qty: num(progress.qty) ?? num(raw.qty) ?? null,
    },
  };
}

export interface TikiBanner {
  id: number;
  title?: string;
  url?: string;
  image_url?: string;
}

export function bannerToCampaign(b: TikiBanner, title: string | null): NormalizedPromotionInput | null {
  if (!b.url || !/tiki\.vn/.test(b.url)) return null;
  const url = cleanUrl(b.url);
  return {
    platform: 'tiki',
    type: 'campaign',
    externalId: String(b.id),
    title: title ?? url,
    url,
    imageUrl: b.image_url || null,
  };
}
