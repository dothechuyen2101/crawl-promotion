import { classifyCategory, type CategorySlug, type ClassifyInput, type Platform } from '@cp/shared';
import { shopKey } from '@cp/shared/pricing';
import { hasDatabase } from '../config.ts';
import { logger } from '../logger.ts';
import { check, db } from './db.ts';

/** Shop cần ít nhất bấy nhiêu sản phẩm đã phân loại, và nhóm chiếm ≥ SHARE, mới suy ra nhóm của shop. */
const MIN_SAMPLES = 2;
const MIN_SHARE = 0.6;
const CACHE_MS = 10 * 60_000;

let cache: { at: number; map: Map<string, CategorySlug> } | null = null;

const key = (platform: Platform, shopName: string) => `${platform}|${shopKey(shopName)}`;

/** Bảng shop → nhóm (đọc từ shop_categories, cache 10 phút). */
export async function shopCategoryMap(force = false): Promise<Map<string, CategorySlug>> {
  if (!hasDatabase) return new Map();
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.map;
  const map = new Map<string, CategorySlug>();
  const { data, error } = await db().from('shop_categories').select('platform, shop_key, category_slug').limit(20_000);
  if (error) logger.warn({ error: error.message }, 'load shop_categories failed');
  for (const r of data ?? []) map.set(`${r.platform}|${r.shop_key}`, r.category_slug as CategorySlug);
  cache = { at: Date.now(), map };
  return map;
}

/** Phân loại theo từ khoá; nếu không đủ tín hiệu thì dùng nhóm đã suy ra của shop. */
export function categorize(input: ClassifyInput & { platform: Platform }, shops: Map<string, CategorySlug>): CategorySlug {
  const r = classifyCategory(input);
  if (r.slug !== 'khac' || !input.shopName) return r.slug;
  return shops.get(key(input.platform, input.shopName)) ?? 'khac';
}

/**
 * Suy ra nhóm của từng shop từ sản phẩm (deal/flash sale) và kết quả tìm giá 30 ngày gần đây:
 * nhóm chiếm đa số (≥ 60%, ≥ 2 sản phẩm) được ghi vào shop_categories.
 */
export async function refreshShopCategories(): Promise<number> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const samples: { platform: Platform; shopName: string; slug: CategorySlug }[] = [];

  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from('products').select('platform, shop_name, title, category').not('shop_name', 'is', null).range(from, from + 999);
    if (error) throw new Error(`select products: ${error.message}`);
    for (const p of data ?? []) {
      samples.push({ platform: p.platform, shopName: p.shop_name!, slug: classifyCategory({ title: p.title, category: p.category, platform: p.platform }).slug });
    }
    if ((data ?? []).length < 1000) break;
  }
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db()
      .from('search_results')
      .select('platform, shop_name, title, category')
      .not('shop_name', 'is', null)
      .gte('computed_at', since)
      .range(from, from + 999);
    if (error) throw new Error(`select search_results: ${error.message}`);
    for (const p of data ?? []) {
      samples.push({ platform: p.platform, shopName: p.shop_name!, slug: classifyCategory({ title: p.title, category: p.category, platform: p.platform }).slug });
    }
    if ((data ?? []).length < 1000) break;
  }

  const byShop = new Map<string, { platform: Platform; shopName: string; counts: Map<CategorySlug, number>; total: number }>();
  for (const s of samples) {
    if (s.slug === 'khac') continue;
    const k = key(s.platform, s.shopName);
    const e = byShop.get(k) ?? { platform: s.platform, shopName: s.shopName, counts: new Map(), total: 0 };
    e.counts.set(s.slug, (e.counts.get(s.slug) ?? 0) + 1);
    e.total++;
    byShop.set(k, e);
  }
  const rows = [...byShop.values()].flatMap((e) => {
    const [slug, n] = [...e.counts].sort((a, b) => b[1] - a[1])[0]!;
    const share = n / e.total;
    if (e.total < MIN_SAMPLES || share < MIN_SHARE) return [];
    return [{ platform: e.platform, shop_key: shopKey(e.shopName), shop_name: e.shopName, category_slug: slug, samples: e.total, share: Math.round(share * 100) / 100, updated_at: new Date().toISOString() }];
  });
  for (let i = 0; i < rows.length; i += 500) {
    check(await db().from('shop_categories').upsert(rows.slice(i, i + 500), { onConflict: 'platform,shop_key' }), 'upsert shop_categories');
  }
  cache = null;
  return rows.length;
}

/** Phân loại lại toàn bộ khuyến mãi & sản phẩm (sau khi đổi bộ từ khoá hoặc có thêm dữ liệu shop). */
export async function reclassifyAll(): Promise<{ promotions: number; products: number }> {
  const shops = await shopCategoryMap(true);
  const result = { promotions: 0, products: 0 };

  const apply = async (table: 'promotions' | 'products', changes: Map<CategorySlug, string[]>) => {
    for (const [slug, ids] of changes) {
      for (let i = 0; i < ids.length; i += 300) {
        check(await db().from(table).update({ category_slug: slug }).in('id', ids.slice(i, i + 300)), `update ${table}`);
      }
    }
  };

  const promoChanges = new Map<CategorySlug, string[]>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db()
      .from('promotions')
      .select('id, platform, type, title, category, shop_name, description, scope, payment_method, category_slug')
      .neq('status', 'expired')
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(`select promotions: ${error.message}`);
    for (const p of data ?? []) {
      const slug = categorize(
        { title: p.title, category: p.category, shopName: p.shop_name, description: p.description, platform: p.platform, scope: p.scope, paymentMethod: p.payment_method, type: p.type },
        shops,
      );
      if (slug !== p.category_slug) {
        promoChanges.set(slug, [...(promoChanges.get(slug) ?? []), p.id]);
        result.promotions++;
      }
    }
    if ((data ?? []).length < 1000) break;
  }
  await apply('promotions', promoChanges);

  const productChanges = new Map<CategorySlug, string[]>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from('products').select('id, platform, title, category, shop_name, category_slug').order('id').range(from, from + 999);
    if (error) throw new Error(`select products: ${error.message}`);
    for (const p of data ?? []) {
      const slug = categorize({ title: p.title, category: p.category, shopName: p.shop_name, platform: p.platform }, shops);
      if (slug !== p.category_slug) {
        productChanges.set(slug, [...(productChanges.get(slug) ?? []), p.id]);
        result.products++;
      }
    }
    if ((data ?? []).length < 1000) break;
  }
  await apply('products', productChanges);
  return result;
}
