import { z } from 'zod';
import { DISCOUNT_TYPES, PLATFORMS, PROMO_TYPES, SEARCH_KINDS, VOUCHER_SCOPES } from './enums.ts';

const money = z.number().finite().nonnegative();

/** Dữ liệu khuyến mãi đã chuẩn hoá mà mọi source phải trả ra. */
export const NormalizedPromotionSchema = z.object({
  platform: z.enum(PLATFORMS),
  type: z.enum(PROMO_TYPES),
  externalId: z.string().min(1).max(300),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).nullish(),
  code: z.string().max(100).nullish(),
  discountType: z.enum(DISCOUNT_TYPES).nullish(),
  discountValue: money.nullish(),
  maxDiscount: money.nullish(),
  minSpend: money.nullish(),
  isCashback: z.boolean().default(false),
  salePrice: money.nullish(),
  originalPrice: money.nullish(),
  startAt: z.coerce.date().nullish(),
  endAt: z.coerce.date().nullish(),
  url: z.url(),
  affiliateUrl: z.url().nullish(),
  imageUrl: z.url().nullish(),
  shopId: z.string().nullish(),
  shopName: z.string().nullish(),
  category: z.string().nullish(),
  city: z.string().nullish(),
  productExternalId: z.string().nullish(),
  scope: z.enum(VOUCHER_SCOPES).nullish(),
  stackGroup: z.string().nullish(),
  applicableCategories: z.array(z.string()).default([]),
  paymentMethod: z.string().nullish(),
  newUserOnly: z.boolean().default(false),
  usageLeftPct: z.number().min(0).max(100).nullish(),
  requiresCollect: z.boolean().default(false),
  conditions: z.record(z.string(), z.unknown()).default({}),
  raw: z.unknown().optional(),
});
export type NormalizedPromotion = z.output<typeof NormalizedPromotionSchema>;
export type NormalizedPromotionInput = z.input<typeof NormalizedPromotionSchema>;

/** Một nơi bán (sản phẩm trên sàn hoặc món ở quán) trả về từ tính năng tìm giá. */
export const ListingSchema = z.object({
  platform: z.enum(PLATFORMS),
  kind: z.enum(SEARCH_KINDS),
  listingId: z.string().min(1),
  title: z.string().min(1),
  url: z.url(),
  imageUrl: z.url().nullish(),
  shopId: z.string().nullish(),
  shopName: z.string().nullish(),
  price: money,
  originalPrice: money.nullish(),
  /** null = không biết phí ship */
  shippingFee: money.nullish(),
  category: z.string().nullish(),
  rating: z.number().nullish(),
  sold: z.number().nullish(),
});
export type Listing = z.output<typeof ListingSchema>;
