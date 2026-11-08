import type { Platform, VoucherScope } from '../enums.ts';

export interface StackRule {
  /** scope → nhóm stacking. Mỗi nhóm dùng tối đa 1 voucher. */
  groupOf: Record<VoucherScope, string>;
  /** Thứ tự áp dụng các nhóm (nhóm sau tính trên số tiền còn lại). */
  order: string[];
  /** Nhóm tính trên tổng tiền gồm cả ship. */
  totalGroups: string[];
  note: string;
}

/** Sàn TMĐT: 1 mã shop + 1 mã sàn + 1 mã freeship + 1 ưu đãi thanh toán. */
const ECOMMERCE: StackRule = {
  groupOf: { shop: 'shop', platform: 'platform', category: 'platform', freeship: 'freeship', payment: 'payment' },
  order: ['shop', 'platform', 'freeship', 'payment'],
  totalGroups: ['payment'],
  note: '1 mã shop + 1 mã sàn + 1 mã freeship + 1 ưu đãi thanh toán',
};

/**
 * Đồ ăn: khuyến mãi của quán tự áp + chỉ 1 mã của sàn (giảm món HOẶC giảm phí giao) + ưu đãi thanh toán.
 * Mã freeship và mã giảm món dùng chung nhóm "code".
 */
const FOOD: StackRule = {
  groupOf: { shop: 'shop', platform: 'code', category: 'code', freeship: 'code', payment: 'payment' },
  order: ['shop', 'code', 'payment'],
  totalGroups: ['payment'],
  note: 'Khuyến mãi quán + 1 mã của sàn (giảm món hoặc phí giao) + ưu đãi thanh toán',
};

export const STACKING_RULES: Record<Platform, StackRule> = {
  shopee: ECOMMERCE,
  lazada: ECOMMERCE,
  tiki: ECOMMERCE,
  tiktok: ECOMMERCE,
  grabfood: FOOD,
  be: FOOD,
};
