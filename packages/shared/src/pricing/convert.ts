import type { DiscountType, VoucherScope } from '../enums.ts';
import type { PricingVoucher } from './types.ts';

/** Các cột của bảng promotions cần để tính giá. */
export const VOUCHER_COLUMNS =
  'id, platform, title, code, scope, stack_group, discount_type, discount_value, max_discount, min_spend, is_cashback, shop_id, shop_name, applicable_categories, payment_method, new_user_only, start_at, end_at, requires_collect, conditions, city' as const;

export interface VoucherRow {
  id: string;
  title: string;
  code: string | null;
  scope: VoucherScope | null;
  stack_group: string | null;
  discount_type: DiscountType | null;
  discount_value: number | null;
  max_discount: number | null;
  min_spend: number | null;
  is_cashback: boolean;
  shop_id: string | null;
  shop_name: string | null;
  applicable_categories: string[];
  payment_method: string | null;
  new_user_only: boolean;
  start_at: string | null;
  end_at: string | null;
  requires_collect: boolean;
  conditions: unknown;
}

/** Dòng promotions (DB) → voucher cho engine; null nếu thiếu mức giảm. */
export function voucherFromRow(r: VoucherRow): PricingVoucher | null {
  if (!r.discount_type || r.discount_value == null) return null;
  const cond = (r.conditions && typeof r.conditions === 'object' ? r.conditions : {}) as Record<string, unknown>;
  return {
    id: r.id,
    title: r.title,
    code: r.code,
    scope: r.scope ?? 'platform',
    stackGroup: r.stack_group,
    discountType: r.discount_type,
    discountValue: Number(r.discount_value),
    maxDiscount: r.max_discount != null ? Number(r.max_discount) : null,
    minSpend: r.min_spend != null ? Number(r.min_spend) : null,
    isCashback: r.is_cashback,
    shopId: r.shop_id,
    shopName: r.shop_name,
    applicableCategories: r.applicable_categories,
    paymentMethod: r.payment_method,
    newUserOnly: r.new_user_only,
    startAt: r.start_at,
    endAt: r.end_at,
    requiresCollect: r.requires_collect,
    restricted: Boolean(cond.restricted),
  };
}

/** Tên hiển thị cho mã phương thức thanh toán. */
export const PAYMENT_LABELS: Record<string, string> = {
  shopeepay: 'ShopeePay',
  momo: 'MoMo',
  zalopay: 'ZaloPay',
  vnpay: 'VNPAY',
  vpbank: 'VPBank',
  acb: 'ACB',
  cake: 'Cake',
  vietinbank: 'VietinBank',
  techcombank: 'Techcombank',
  tpbank: 'TPBank',
  mbbank: 'MB Bank',
  hdsaison: 'HD SAISON',
  applepay: 'Apple Pay',
  bepaylater: 'bePaylater',
};
export const paymentLabel = (slug: string) => PAYMENT_LABELS[slug] ?? slug.toUpperCase();
