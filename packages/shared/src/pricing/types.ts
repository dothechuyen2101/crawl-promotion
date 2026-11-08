import type { DiscountType, Platform, VoucherScope } from '../enums.ts';

export interface PricingVoucher {
  id: string;
  title: string;
  code?: string | null;
  scope: VoucherScope;
  /** Ghi đè nhóm stacking mặc định của scope (hiếm khi cần). */
  stackGroup?: string | null;
  discountType: DiscountType;
  /** percent: 0–100; fixed: số tiền VND; freeship: mức giảm ship tối đa VND (0 = miễn toàn bộ). */
  discountValue: number;
  maxDiscount?: number | null;
  minSpend?: number | null;
  /** Hoàn xu/hoàn tiền: không giảm số tiền phải trả ngay. */
  isCashback?: boolean;
  shopId?: string | null;
  /** Dùng để khớp mã shop khi nguồn không có shop id (vd AccessTrade). */
  shopName?: string | null;
  applicableCategories?: string[] | null;
  paymentMethod?: string | null;
  newUserOnly?: boolean | null;
  startAt?: Date | string | null;
  endAt?: Date | string | null;
  /** Phải bấm "Lưu" voucher trước khi dùng. */
  requiresCollect?: boolean | null;
  /** Có điều kiện riêng theo tài khoản (hạng thành viên, chỉ trên app...). Mặc định không tính. */
  restricted?: boolean | null;
}

export interface PricingOptions {
  /** Các ví/ngân hàng người dùng có (vd ['shopeepay', 'vpbank']). Mặc định: không tính voucher thanh toán. */
  paymentMethods?: string[];
  isNewUser?: boolean;
  now?: Date;
  /** Trừ tiền hoàn (xu/cashback) vào giá hiệu dụng khi xếp hạng. */
  countCashback?: boolean;
  /** Tính cả mã có điều kiện riêng (hạng thành viên...). */
  includeRestricted?: boolean;
}

export interface PricingInput {
  platform: Platform;
  unitPrice: number;
  quantity?: number;
  /** null/undefined = chưa biết phí ship, tính như 0. */
  shippingFee?: number | null;
  shopId?: string | null;
  shopName?: string | null;
  category?: string | null;
  vouchers: PricingVoucher[];
  options?: PricingOptions;
}

export interface AppliedVoucher {
  voucher: PricingVoucher;
  group: string;
  /** Số tiền giảm (hoặc hoàn nếu cashback) thực tế, VND. */
  amount: number;
  cashback: boolean;
}

export interface PricingResult {
  quantity: number;
  subtotal: number;
  shippingFee: number;
  shippingKnown: boolean;
  applied: AppliedVoucher[];
  itemDiscount: number;
  shippingDiscount: number;
  paymentDiscount: number;
  cashback: number;
  /** Số tiền phải thanh toán. */
  finalPrice: number;
  /** finalPrice trừ cashback (nếu countCashback), dùng để xếp hạng. */
  effectivePrice: number;
  perUnit: number;
  /** (subtotal + ship) - effectivePrice */
  savings: number;
}

export type SkipReason =
  | 'expired'
  | 'not_started'
  | 'new_user_only'
  | 'payment_not_selected'
  | 'other_shop'
  | 'category_mismatch'
  | 'restricted'
  | 'invalid';

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  expired: 'Đã hết hạn',
  not_started: 'Chưa bắt đầu',
  new_user_only: 'Chỉ cho người dùng mới',
  payment_not_selected: 'Cần phương thức thanh toán bạn chưa chọn',
  other_shop: 'Mã của shop khác',
  category_mismatch: 'Không áp dụng cho ngành hàng này',
  restricted: 'Có điều kiện riêng (hạng thành viên, chỉ trên app...)',
  invalid: 'Dữ liệu mã không hợp lệ',
};
