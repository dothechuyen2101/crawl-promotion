import { classifyCategory, type CategorySlug, type ClassifyInput, type Platform } from '@cp/shared';
import { shopKey } from '@cp/shared/pricing';
import { env, hasAI, hasDatabase } from '../config.ts';
import { logger } from '../logger.ts';
import { classifyShops, type AiUsage } from './ai.ts';
import { check, db } from './db.ts';

/** Shop cần ít nhất bấy nhiêu sản phẩm đã phân loại, và nhóm chiếm ≥ SHARE, mới suy ra nhóm của shop. */
const MIN_SAMPLES = 2;
const MIN_SHARE = 0.6;
const CACHE_MS = 10 * 60_000;
/** Shop mà AI không nhận ra ('khac') được hỏi lại sau bấy nhiêu ngày. */
const AI_RETRY_UNKNOWN_DAYS = 14;

let cache: { at: number; map: Map<string, CategorySlug> } | null = null;

const key = (platform: Platform, shopName: string) => `${platform}|${shopKey(shopName)}`;

type ShopCategoryRow = { platform: Platform; shop_key: string; category_slug: string; source: string; updated_at: string };

async function loadShopCategories(): Promise<ShopCategoryRow[]> {
  const rows: ShopCategoryRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db()
      .from('shop_categories')
      .select('platform, shop_key, category_slug, source, updated_at')
      .order('platform')
      .order('shop_key')
      .range(from, from + 999);
    if (error) throw new Error(`select shop_categories: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

/** Bảng shop → nhóm (đọc từ shop_categories, cache 10 phút). */
export async function shopCategoryMap(force = false): Promise<Map<string, CategorySlug>> {
  if (!hasDatabase) return new Map();
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.map;
  const map = new Map<string, CategorySlug>();
  try {
    for (const r of await loadShopCategories()) map.set(`${r.platform}|${r.shop_key}`, r.category_slug as CategorySlug);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, 'load shop_categories failed');
    if (cache) return cache.map;
  }
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
    return [
      {
        platform: e.platform,
        shop_key: shopKey(e.shopName),
        shop_name: e.shopName,
        category_slug: slug,
        samples: e.total,
        share: Math.round(share * 100) / 100,
        // Dữ liệu sản phẩm thật luôn ghi đè nhóm do AI đoán.
        source: 'products',
        model: null,
        updated_at: new Date().toISOString(),
      },
    ];
  });
  for (let i = 0; i < rows.length; i += 500) {
    check(await db().from('shop_categories').upsert(rows.slice(i, i + 500), { onConflict: 'platform,shop_key' }), 'upsert shop_categories');
  }
  cache = null;
  return rows.length;
}

export interface AiClassifyResult {
  asked: number;
  classified: number;
  unknown: number;
  usage: AiUsage;
  decisions: { platform: Platform; shopName: string; vouchers: number; slug: CategorySlug | null }[];
}

/**
 * Hỏi AI nhóm của các shop có mã đang ở "Khác" mà chưa có trong shop_categories
 * (hoặc AI từng trả 'khac' quá AI_RETRY_UNKNOWN_DAYS ngày). Shop nhiều mã được hỏi trước.
 */
export async function aiClassifyShops(opts: { limit?: number; dryRun?: boolean } = {}): Promise<AiClassifyResult> {
  const empty: AiClassifyResult = { asked: 0, classified: 0, unknown: 0, usage: { requests: 0, inputTokens: 0, outputTokens: 0 }, decisions: [] };
  if (!hasAI) return empty;

  const pending = new Map<string, { platform: Platform; shopName: string; samples: Set<string>; vouchers: number }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db()
      .from('promotions')
      .select('platform, shop_name, title, description')
      .eq('category_slug', 'khac')
      .not('shop_name', 'is', null)
      .neq('status', 'expired')
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(`select promotions: ${error.message}`);
    for (const p of data ?? []) {
      const k = key(p.platform, p.shop_name!);
      const e = pending.get(k) ?? { platform: p.platform, shopName: p.shop_name!, samples: new Set<string>(), vouchers: 0 };
      e.vouchers++;
      if (e.samples.size < 2) e.samples.add(p.description && p.description.length > p.title.length ? p.description : p.title);
      pending.set(k, e);
    }
    if ((data ?? []).length < 1000) break;
  }

  const retryBefore = Date.now() - AI_RETRY_UNKNOWN_DAYS * 86_400_000;
  for (const r of await loadShopCategories()) {
    const retry = r.source === 'ai' && r.category_slug === 'khac' && Date.parse(r.updated_at) < retryBefore;
    if (!retry) pending.delete(`${r.platform}|${r.shop_key}`);
  }

  const list = [...pending.values()].sort((a, b) => b.vouchers - a.vouchers).slice(0, opts.limit ?? env.AI_MAX_SHOPS_PER_RUN);
  if (!list.length) return empty;

  const { slugs, usage } = await classifyShops(list.map((s) => ({ platform: s.platform, shopName: s.shopName, samples: [...s.samples] })));
  const decisions = list.map((s, i) => ({ platform: s.platform, shopName: s.shopName, vouchers: s.vouchers, slug: slugs[i] ?? null }));
  const now = new Date().toISOString();
  const rows = decisions.flatMap((d) =>
    d.slug
      ? [{ platform: d.platform, shop_key: shopKey(d.shopName), shop_name: d.shopName, category_slug: d.slug, samples: 0, share: 0, source: 'ai', model: env.AI_MODEL, updated_at: now }]
      : [],
  );
  if (!opts.dryRun) {
    for (let i = 0; i < rows.length; i += 500) {
      check(await db().from('shop_categories').upsert(rows.slice(i, i + 500), { onConflict: 'platform,shop_key' }), 'upsert shop_categories (ai)');
    }
    cache = null;
  }
  return {
    asked: list.length,
    classified: rows.filter((r) => r.category_slug !== 'khac').length,
    unknown: rows.filter((r) => r.category_slug === 'khac').length,
    usage,
    decisions,
  };
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
