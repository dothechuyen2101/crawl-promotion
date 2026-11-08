import type { NormalizedPromotion, Platform } from '@cp/shared';
import { shopKey, VOUCHER_COLUMNS, voucherFromRow, type PricingVoucher, type VoucherRow } from '@cp/shared/pricing';
import { hasDatabase } from '../config.ts';
import { db } from '../core/db.ts';
import { logger } from '../logger.ts';

/** Promotion đã chuẩn hoá (từ adapter) → voucher cho engine tính giá. */
export function fromNormalized(p: NormalizedPromotion, id: string): PricingVoucher | null {
  if (p.type !== 'voucher' || !p.discountType || p.discountValue == null) return null;
  return {
    id,
    title: p.title,
    code: p.code ?? null,
    scope: p.scope ?? 'platform',
    stackGroup: p.stackGroup ?? null,
    discountType: p.discountType,
    discountValue: p.discountValue,
    maxDiscount: p.maxDiscount ?? null,
    minSpend: p.minSpend ?? null,
    isCashback: p.isCashback,
    shopId: p.shopId ?? null,
    shopName: p.shopName ?? null,
    applicableCategories: p.applicableCategories,
    paymentMethod: p.paymentMethod ?? null,
    newUserOnly: p.newUserOnly,
    startAt: p.startAt?.toISOString() ?? null,
    endAt: p.endAt?.toISOString() ?? null,
    requiresCollect: p.requiresCollect,
    restricted: Boolean(p.conditions?.restricted),
  };
}

/**
 * Voucher cấp sàn (mã sàn, freeship, thanh toán, ngành hàng) đã crawl sẵn trong DB.
 * Mã shop không lấy ở đây vì phải khớp đúng shop của từng listing.
 */
export async function loadPlatformVouchers(platforms: Platform[]): Promise<Map<Platform, PricingVoucher[]>> {
  const out = new Map<Platform, PricingVoucher[]>();
  if (!hasDatabase || platforms.length === 0) return out;
  const { data, error } = await db()
    .from('promotions')
    .select(VOUCHER_COLUMNS)
    .eq('type', 'voucher')
    .eq('status', 'active')
    .in('platform', platforms)
    .or('scope.is.null,scope.in.(platform,freeship,payment,category)')
    .limit(2000);
  if (error) {
    logger.warn({ error: error.message }, 'load platform vouchers failed');
    return out;
  }
  for (const r of data as (VoucherRow & { platform: Platform; city: string | null })[]) {
    // Đồ ăn: chỉ dùng mã toàn quốc hoặc của Hà Nội
    if (r.city && r.city !== 'Hà Nội') continue;
    const v = voucherFromRow(r);
    if (!v) continue;
    out.set(r.platform, [...(out.get(r.platform) ?? []), v]);
  }
  return out;
}

/**
 * Mã shop đã crawl sẵn (vd từ AccessTrade, chỉ có tên shop) cho các shop xuất hiện trong kết quả tìm.
 * Trả về map theo `${platform}|${shopKey(tên shop)}`.
 */
export async function loadShopVouchers(shops: { platform: Platform; shopName: string }[]): Promise<Map<string, PricingVoucher[]>> {
  const out = new Map<string, PricingVoucher[]>();
  if (!hasDatabase || shops.length === 0) return out;
  const byPlatform = new Map<Platform, Set<string>>();
  for (const s of shops) byPlatform.set(s.platform, (byPlatform.get(s.platform) ?? new Set()).add(s.shopName));
  for (const [platform, names] of byPlatform) {
    const { data, error } = await db()
      .from('promotions')
      .select(VOUCHER_COLUMNS)
      .eq('type', 'voucher')
      .eq('status', 'active')
      .eq('scope', 'shop')
      .eq('platform', platform)
      .in('shop_name', [...names])
      .limit(1000);
    if (error) {
      logger.warn({ error: error.message }, 'load shop vouchers failed');
      continue;
    }
    for (const r of data as VoucherRow[]) {
      const v = voucherFromRow(r);
      if (!v || !r.shop_name) continue;
      const key = `${platform}|${shopKey(r.shop_name)}`;
      out.set(key, [...(out.get(key) ?? []), v]);
    }
  }
  return out;
}
