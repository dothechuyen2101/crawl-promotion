import { matchScore, normalizeText, type Platform } from '@cp/shared';
import { VOUCHER_COLUMNS, voucherFromRow, type PricingVoucher, type VoucherRow } from '@cp/shared/pricing';
import type { ResultRow } from './results';
import { adminClient } from './supabase/admin';

/**
 * Khi máy quét offline: dựng kết quả tạm từ sản phẩm đã lưu trong DB (deal/flash sale đã crawl)
 * cộng mã sàn đang có. Chỉ là dữ liệu cũ, không thay được tìm kiếm trực tiếp.
 */
export async function fallbackResults(query: string): Promise<ResultRow[]> {
  const q = normalizeText(query);
  if (q.length < 2) return [];
  const db = adminClient();
  const words = q.split(' ').filter((w) => w.length > 1).slice(0, 4);
  let pq = db.from('products').select('id, platform, external_id, title, url, image_url, shop_id, shop_name, category, current_price, original_price').not('current_price', 'is', null);
  for (const w of words) pq = pq.ilike('search_text', `%${w}%`);
  const { data: products } = await pq.order('last_seen_at', { ascending: false }).limit(30);
  if (!products?.length) return [];

  const platforms = [...new Set(products.map((p) => p.platform))];
  const { data: vrows } = await db
    .from('promotions')
    .select(VOUCHER_COLUMNS)
    .eq('type', 'voucher')
    .eq('status', 'active')
    .in('platform', platforms)
    .or('scope.is.null,scope.in.(platform,freeship,payment,category)')
    .limit(1000);
  const byPlatform = new Map<Platform, PricingVoucher[]>();
  for (const r of (vrows ?? []) as (VoucherRow & { platform: Platform })[]) {
    const v = voucherFromRow(r);
    if (v) byPlatform.set(r.platform, [...(byPlatform.get(r.platform) ?? []), v]);
  }

  return products.map((p) => ({
    id: `db-${p.id}`,
    platform: p.platform,
    listing_id: p.external_id,
    title: p.title,
    image_url: p.image_url,
    url: p.url,
    shop_id: p.shop_id,
    shop_name: p.shop_name,
    category: p.category,
    price: Number(p.current_price),
    original_price: p.original_price != null ? Number(p.original_price) : null,
    shipping_fee: null,
    vouchers: byPlatform.get(p.platform) ?? [],
    match_score: matchScore(query, p.title).score,
    is_outlier: false,
  }));
}
