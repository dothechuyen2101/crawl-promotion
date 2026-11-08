import { classifyQuery, isCategorySlug, normalizeText, PLATFORMS, PROMO_TYPES, type CategorySlug, type Platform, type PromoType } from '@cp/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@cp/shared/database';

export const PROMO_COLUMNS =
  'id, platform, type, title, description, code, discount_type, discount_value, max_discount, min_spend, is_cashback, sale_price, original_price, discount_pct, start_at, end_at, url, affiliate_url, image_url, shop_name, category, scope, payment_method, new_user_only, requires_collect, conditions, status, first_seen_at, deal_quality, is_lowest_30d, price_median_30d, price_min_30d, category_slug' as const;

export type PromoRow = Database['public']['Tables']['promotions']['Row'];
export type PromoListItem = Pick<
  PromoRow,
  | 'id' | 'platform' | 'type' | 'title' | 'description' | 'code' | 'discount_type' | 'discount_value' | 'max_discount'
  | 'min_spend' | 'is_cashback' | 'sale_price' | 'original_price' | 'discount_pct' | 'start_at' | 'end_at' | 'url'
  | 'affiliate_url' | 'image_url' | 'shop_name' | 'category' | 'scope' | 'payment_method' | 'new_user_only'
  | 'requires_collect' | 'conditions' | 'status' | 'first_seen_at'
  | 'deal_quality' | 'is_lowest_30d' | 'price_median_30d' | 'price_min_30d' | 'category_slug'
>;

export const SORTS = { moi: 'Mới nhất', giam: 'Giảm nhiều', 'sap-het': 'Sắp hết hạn' } as const;
export type Sort = keyof typeof SORTS;

export interface PromoFilter {
  type?: PromoType;
  platform?: Platform;
  /** Nhóm sản phẩm (?nhom=quan-ao) */
  category?: CategorySlug;
  q?: string;
  sort?: Sort;
  /** Chỉ deal giảm thật so với giá 30 ngày (?that=1). */
  realOnly?: boolean;
  page?: number;
  pageSize?: number;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Đọc bộ lọc từ query string (?san=shopee&q=...&sx=giam&trang=2), bỏ giá trị không hợp lệ. */
export function parseFilter(sp: Record<string, string | string[] | undefined>, fixedType?: PromoType): PromoFilter {
  const san = first(sp.san);
  const loai = first(sp.loai);
  const sx = first(sp.sx);
  const page = Number(first(sp.trang) ?? 1);
  return {
    type: fixedType ?? (PROMO_TYPES.includes(loai as PromoType) ? (loai as PromoType) : undefined),
    platform: PLATFORMS.includes(san as Platform) ? (san as Platform) : undefined,
    category: isCategorySlug(first(sp.nhom)) ? (first(sp.nhom) as CategorySlug) : undefined,
    q: first(sp.q)?.trim().slice(0, 100) || undefined,
    sort: sx && sx in SORTS ? (sx as Sort) : 'moi',
    realOnly: first(sp.that) === '1',
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 500) : 1,
  };
}

export async function listPromotions(db: SupabaseClient<Database>, f: PromoFilter) {
  const size = f.pageSize ?? 30;
  const page = f.page ?? 1;
  let q = db.from('promotions').select(PROMO_COLUMNS, { count: 'exact' }).eq('status', 'active');
  if (f.type) q = q.eq('type', f.type);
  if (f.platform) q = q.eq('platform', f.platform);
  if (f.realOnly) q = q.eq('deal_quality', 'real');
  if (f.category) q = f.category === 'khac' ? q.or('category_slug.eq.khac,category_slug.is.null') : q.eq('category_slug', f.category);
  if (f.q) q = q.ilike('search_text', `%${normalizeText(f.q).replace(/[%_]/g, '')}%`);
  if (f.sort === 'giam') {
    q = q.order('discount_pct', { ascending: false, nullsFirst: false }).order('discount_value', { ascending: false, nullsFirst: false });
  } else if (f.sort === 'sap-het') {
    q = q.not('end_at', 'is', null).order('end_at', { ascending: true });
  } else {
    q = q.order('first_seen_at', { ascending: false });
  }
  const { data, count, error } = await q.order('id').range((page - 1) * size, page * size - 1);
  if (error) throw new Error(error.message);
  return { items: (data ?? []) as PromoListItem[], total: count ?? 0, page, pageSize: size };
}

/** Số khuyến mãi đang hiệu lực theo nhóm (cho thanh lọc). */
export async function categoryCounts(db: SupabaseClient<Database>, f: Pick<PromoFilter, 'type' | 'platform'>) {
  const { data } = await db.rpc('category_counts', { p_type: f.type, p_platform: f.platform });
  const map = new Map<string, number>();
  for (const r of data ?? []) map.set(r.slug, Number(r.n));
  return map;
}

export interface RelatedVouchers {
  /** Nhóm suy ra từ câu tìm (vd "trà sữa" → tra-sua); undefined nếu không đoán được. */
  category?: CategorySlug;
  /** Câu tìm chỉ là tên nhóm/mặt hàng chung chung (vd "trà sữa") chứ không phải một sản phẩm cụ thể. */
  generic: boolean;
  items: PromoListItem[];
  /** Tổng số mã của nhóm (để hiện "xem tất cả"). */
  categoryTotal: number;
  /** Số mã toàn sàn đang hiệu lực (dùng được cho mọi đơn). */
  platformWide: number;
}

/**
 * Mã giảm giá liên quan tới câu tìm giá: mã có chữ khớp câu tìm (vd tên shop "Gong Cha") trước,
 * rồi tới mã cùng nhóm sản phẩm (vd "trà sữa" → mọi mã nhóm Trà sữa & đồ uống). Giảm nhiều xếp trước.
 */
export async function relatedVouchers(db: SupabaseClient<Database>, query: string, limit = 12): Promise<RelatedVouchers> {
  const text = query.trim().slice(0, 100);
  const { slug } = classifyQuery(text);
  const category = slug === 'khac' || slug === 'toan-san' || slug === 'thanh-toan' ? undefined : slug;
  const words = normalizeText(text).split(' ').filter(Boolean);
  const generic = Boolean(category) && words.length <= 3 && !/\d/.test(text);

  const [byText, byCat, wide] = await Promise.all([
    text.length >= 2 ? listPromotions(db, { type: 'voucher', q: text, sort: 'giam', pageSize: limit }) : null,
    category ? listPromotions(db, { type: 'voucher', category, sort: 'giam', pageSize: limit }) : null,
    listPromotions(db, { type: 'voucher', category: 'toan-san', pageSize: 1 }),
  ]);
  const seen = new Set<string>();
  const items = [...(byText?.items ?? []), ...(byCat?.items ?? [])].filter((p) => !seen.has(p.id) && seen.add(p.id)).slice(0, limit);
  return { category, generic, items, categoryTotal: byCat?.total ?? 0, platformWide: wide.total };
}
