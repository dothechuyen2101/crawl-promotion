export const PLATFORMS = ['shopee', 'tiktok', 'lazada', 'tiki', 'grabfood', 'be'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const ECOMMERCE_PLATFORMS = ['shopee', 'tiktok', 'lazada', 'tiki'] as const satisfies readonly Platform[];
export const FOOD_PLATFORMS = ['grabfood', 'be'] as const satisfies readonly Platform[];

export const PLATFORM_LABELS: Record<Platform, string> = {
  shopee: 'Shopee',
  tiktok: 'TikTok Shop',
  lazada: 'Lazada',
  tiki: 'Tiki',
  grabfood: 'GrabFood',
  be: 'Be',
};

/** voucher = mã giảm giá; flash_sale = sản phẩm flash sale; deal = sản phẩm/quán giảm sâu; campaign = chiến dịch lớn */
export const PROMO_TYPES = ['voucher', 'flash_sale', 'deal', 'campaign'] as const;
export type PromoType = (typeof PROMO_TYPES)[number];

export const PROMO_TYPE_LABELS: Record<PromoType, string> = {
  voucher: 'Mã giảm giá',
  flash_sale: 'Flash sale',
  deal: 'Giảm sâu',
  campaign: 'Chiến dịch',
};

export const DISCOUNT_TYPES = ['percent', 'fixed', 'freeship'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

/**
 * Phạm vi áp dụng của voucher, dùng cho engine tính giá.
 * category = voucher sàn nhưng giới hạn theo ngành hàng.
 */
export const VOUCHER_SCOPES = ['platform', 'shop', 'freeship', 'payment', 'category'] as const;
export type VoucherScope = (typeof VOUCHER_SCOPES)[number];

export const PROMO_STATUSES = ['active', 'expired', 'upcoming'] as const;
export type PromoStatus = (typeof PROMO_STATUSES)[number];

export const SEARCH_KINDS = ['product', 'food'] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

/** Các quận Hà Nội dùng cho GrabFood/Be (toạ độ gần trung tâm quận). */
export const HANOI_DISTRICTS = {
  'hoan-kiem': { name: 'Hoàn Kiếm', lat: 21.0285, lng: 105.8542 },
  'ba-dinh': { name: 'Ba Đình', lat: 21.0341, lng: 105.8146 },
  'dong-da': { name: 'Đống Đa', lat: 21.0136, lng: 105.8262 },
  'hai-ba-trung': { name: 'Hai Bà Trưng', lat: 21.0059, lng: 105.8576 },
  'cau-giay': { name: 'Cầu Giấy', lat: 21.0362, lng: 105.7906 },
  'thanh-xuan': { name: 'Thanh Xuân', lat: 20.9937, lng: 105.8114 },
  'tay-ho': { name: 'Tây Hồ', lat: 21.0702, lng: 105.8188 },
  'hoang-mai': { name: 'Hoàng Mai', lat: 20.9746, lng: 105.8634 },
  'long-bien': { name: 'Long Biên', lat: 21.0466, lng: 105.8946 },
  'nam-tu-liem': { name: 'Nam Từ Liêm', lat: 21.0129, lng: 105.7655 },
  'bac-tu-liem': { name: 'Bắc Từ Liêm', lat: 21.0697, lng: 105.7728 },
  'ha-dong': { name: 'Hà Đông', lat: 20.9714, lng: 105.7788 },
} as const satisfies Record<string, { name: string; lat: number; lng: number }>;
export type HanoiDistrict = keyof typeof HANOI_DISTRICTS;
