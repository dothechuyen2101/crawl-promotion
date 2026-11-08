import type { Platform } from '@cp/shared';
import type { PricingVoucher } from '@cp/shared/pricing';

/** Một dòng kết quả tìm giá (từ bảng search_results hoặc dựng tạm từ DB khi worker offline). */
export interface ResultRow {
  id: number | string;
  platform: Platform;
  listing_id: string;
  title: string;
  image_url: string | null;
  url: string;
  shop_id: string | null;
  shop_name: string | null;
  category: string | null;
  price: number;
  original_price: number | null;
  shipping_fee: number | null;
  vouchers: PricingVoucher[];
  match_score: number;
  is_outlier: boolean;
}

/** Điểm khớp tối thiểu để vào nhóm "khớp cao" (giống worker). */
export const HIGH_MATCH = 0.6;

export const RESULT_COLUMNS =
  'id, platform, listing_id, title, image_url, url, shop_id, shop_name, category, price, original_price, shipping_fee, vouchers, match_score, is_outlier' as const;

export function toResultRow(r: Record<string, unknown>): ResultRow {
  return {
    ...(r as unknown as ResultRow),
    price: Number(r.price),
    original_price: r.original_price != null ? Number(r.original_price) : null,
    shipping_fee: r.shipping_fee != null ? Number(r.shipping_fee) : null,
    match_score: Number(r.match_score ?? 0),
    vouchers: Array.isArray(r.vouchers) ? (r.vouchers as PricingVoucher[]) : [],
  };
}
