import { normalizeText, priceInsight, type CategorySlug, type NormalizedPromotion, type Platform, type PromoType } from '@cp/shared';
import type { Json } from '@cp/shared/database';
import { categorize, shopCategoryMap } from './categories.ts';
import { check, db, must } from './db.ts';
import { contentHash } from './hash.ts';

const CHUNK = 200;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

function statusOf(p: NormalizedPromotion, now: Date): 'active' | 'expired' | 'upcoming' {
  if (p.endAt && p.endAt < now) return 'expired';
  if (p.startAt && p.startAt > now) return 'upcoming';
  return 'active';
}

export function promotionRow(p: NormalizedPromotion, sourceId: string, now = new Date(), shops: Map<string, CategorySlug> = new Map()) {
  const content = {
    title: p.title,
    description: p.description ?? null,
    code: p.code ?? null,
    discount_type: p.discountType ?? null,
    discount_value: p.discountValue ?? null,
    max_discount: p.maxDiscount ?? null,
    min_spend: p.minSpend ?? null,
    is_cashback: p.isCashback,
    sale_price: p.salePrice ?? null,
    original_price: p.originalPrice ?? null,
    start_at: iso(p.startAt),
    end_at: iso(p.endAt),
    url: p.url,
    affiliate_url: p.affiliateUrl ?? null,
    image_url: p.imageUrl ?? null,
    shop_id: p.shopId ?? null,
    shop_name: p.shopName ?? null,
    category: p.category ?? null,
    city: p.city ?? null,
    product_external_id: p.productExternalId ?? null,
    scope: p.scope ?? null,
    stack_group: p.stackGroup ?? null,
    applicable_categories: p.applicableCategories,
    payment_method: p.paymentMethod ?? null,
    new_user_only: p.newUserOnly,
    usage_left_pct: p.usageLeftPct ?? null,
    requires_collect: p.requiresCollect,
    conditions: p.conditions as { [key: string]: Json | undefined },
  };
  return {
    platform: p.platform,
    type: p.type,
    external_id: p.externalId,
    source: sourceId,
    ...content,
    raw: (p.raw ?? null) as Json,
    search_text: normalizeText([p.title, p.shopName, p.code].filter(Boolean).join(' ')),
    category_slug: categorize(
      { title: p.title, category: p.category, shopName: p.shopName, description: p.description, platform: p.platform, scope: p.scope, paymentMethod: p.paymentMethod, type: p.type },
      shops,
    ),
    status: statusOf(p, now),
    content_hash: contentHash(content),
    last_seen_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
}

export interface UpsertStats {
  inserted: number;
  updated: number;
  unchanged: number;
}

/** Upsert theo (platform, type, external_id); đếm bản ghi mới/thay đổi để báo cáo. */
export async function upsertPromotions(items: NormalizedPromotion[], sourceId: string): Promise<UpsertStats> {
  const stats: UpsertStats = { inserted: 0, updated: 0, unchanged: 0 };
  // Gộp trùng trong cùng lô (bản sau thắng).
  const byKey = new Map<string, NormalizedPromotion>();
  for (const p of items) byKey.set(`${p.platform}|${p.type}|${p.externalId}`, p);
  const shops = await shopCategoryMap();
  const now = new Date();
  const rows = [...byKey.values()].map((p) => promotionRow(p, sourceId, now, shops));

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    // Lấy hash hiện có để biết bản ghi nào mới / đổi nội dung.
    const groups = new Map<string, { platform: Platform; type: PromoType; list: typeof chunk }>();
    for (const r of chunk) {
      const k = `${r.platform}|${r.type}`;
      const g = groups.get(k) ?? { platform: r.platform, type: r.type, list: [] };
      g.list.push(r);
      groups.set(k, g);
    }
    const existing = new Map<string, string>();
    for (const [k, { platform, type, list }] of groups) {
      const data = must(
        await db()
          .from('promotions')
          .select('external_id, content_hash')
          .eq('platform', platform)
          .eq('type', type)
          .in('external_id', list.map((r) => r.external_id)),
        'select promotions',
      );
      for (const d of data) existing.set(`${k}|${d.external_id}`, d.content_hash);
    }
    for (const r of chunk) {
      const prev = existing.get(`${r.platform}|${r.type}|${r.external_id}`);
      if (prev === undefined) stats.inserted++;
      else if (prev !== r.content_hash) stats.updated++;
      else stats.unchanged++;
    }
    check(
      await db().from('promotions').upsert(chunk, { onConflict: 'platform,type,external_id' }),
      'upsert promotions',
    );
  }
  return stats;
}

/**
 * Lưu sản phẩm (từ flash sale / giảm sâu) và ghi lịch sử giá khi giá thay đổi.
 * Dùng để phân biệt "giảm sâu thật" với giá ảo.
 */
export async function upsertProductsFrom(items: NormalizedPromotion[]): Promise<number> {
  const products = new Map<string, NormalizedPromotion>();
  for (const p of items) {
    if ((p.type === 'flash_sale' || p.type === 'deal') && p.productExternalId && p.salePrice != null) {
      products.set(`${p.platform}|${p.productExternalId}`, p);
    }
  }
  if (products.size === 0) return 0;
  const list = [...products.values()];
  const shops = await shopCategoryMap();
  let historyRows = 0;
  const now = new Date().toISOString();

  for (let i = 0; i < list.length; i += CHUNK) {
    const chunk = list.slice(i, i + CHUNK);
    const byPlatform = new Map<Platform, NormalizedPromotion[]>();
    for (const p of chunk) byPlatform.set(p.platform, [...(byPlatform.get(p.platform) ?? []), p]);

    for (const [platform, ps] of byPlatform) {
      const before = must(
        await db()
          .from('products')
          .select('external_id, current_price')
          .eq('platform', platform)
          .in('external_id', ps.map((p) => p.productExternalId!)),
        'select products',
      );
      const prevPrice = new Map(before.map((b) => [b.external_id as string, b.current_price as number | null]));

      const upserted = must(
        await db()
          .from('products')
          .upsert(
            ps.map((p) => ({
              platform: p.platform,
              external_id: p.productExternalId!,
              title: p.title,
              url: p.url,
              image_url: p.imageUrl ?? null,
              shop_id: p.shopId ?? null,
              shop_name: p.shopName ?? null,
              category: p.category ?? null,
              current_price: p.salePrice,
              original_price: p.originalPrice ?? null,
              search_text: normalizeText([p.title, p.shopName].filter(Boolean).join(' ')),
              category_slug: categorize({ title: p.title, category: p.category, shopName: p.shopName, platform: p.platform }, shops),
              last_seen_at: now,
            })),
            { onConflict: 'platform,external_id' },
          )
          .select('id, external_id, current_price, original_price'),
        'upsert products',
      );

      const history = upserted.flatMap((u) => {
        const prev = prevPrice.get(u.external_id);
        if (u.current_price == null || (prev !== undefined && Number(prev) === Number(u.current_price))) return [];
        return [{ product_id: u.id, price: u.current_price, original_price: u.original_price }];
      });
      if (history.length) {
        check(await db().from('price_history').insert(history), 'insert price_history');
        historyRows += history.length;
      }
      await refreshDealQuality(platform, upserted, ps);
    }
  }
  return historyRows;
}

/**
 * Tính "giảm thật / giá gốc ảo / thấp nhất 30 ngày" cho các sản phẩm vừa cập nhật
 * từ lịch sử giá, rồi ghi vào các promotion deal/flash_sale tương ứng (1 lệnh RPC).
 */
async function refreshDealQuality(
  platform: Platform,
  products: { id: string; external_id: string }[],
  promos: NormalizedPromotion[],
) {
  if (!products.length) return;
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data: rows, error } = await db()
    .from('price_history')
    .select('product_id, price, captured_at')
    .in('product_id', products.map((p) => p.id))
    .gte('captured_at', since)
    .order('captured_at')
    .limit(20_000);
  if (error) throw new Error(`select price_history: ${error.message}`);
  const byProduct = new Map<string, { price: number; at: string }[]>();
  for (const r of rows ?? []) byProduct.set(r.product_id, [...(byProduct.get(r.product_id) ?? []), { price: Number(r.price), at: r.captured_at }]);
  const promoByExt = new Map(promos.map((p) => [p.productExternalId!, p]));

  const items = products.flatMap((p) => {
    const promo = promoByExt.get(p.external_id);
    if (!promo || promo.salePrice == null) return [];
    const ins = priceInsight(byProduct.get(p.id) ?? [], promo.salePrice, promo.originalPrice);
    return [{
      platform,
      product_external_id: p.external_id,
      median: ins.median,
      min_price: ins.min,
      is_lowest: ins.isLowest,
      quality: ins.quality,
    }];
  });
  if (items.length) check(await db().rpc('apply_deal_quality', { items }), 'apply_deal_quality');
}
