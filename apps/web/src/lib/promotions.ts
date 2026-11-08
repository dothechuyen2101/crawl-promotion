import { normalizeText, PLATFORMS, PROMO_TYPES, type Platform, type PromoType } from '@cp/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@cp/shared/database';

export const PROMO_COLUMNS =
  'id, platform, type, title, description, code, discount_type, discount_value, max_discount, min_spend, is_cashback, sale_price, original_price, discount_pct, start_at, end_at, url, affiliate_url, image_url, shop_name, category, scope, payment_method, new_user_only, requires_collect, conditions, status, first_seen_at' as const;

export type PromoRow = Database['public']['Tables']['promotions']['Row'];
export type PromoListItem = Pick<
  PromoRow,
  | 'id' | 'platform' | 'type' | 'title' | 'description' | 'code' | 'discount_type' | 'discount_value' | 'max_discount'
  | 'min_spend' | 'is_cashback' | 'sale_price' | 'original_price' | 'discount_pct' | 'start_at' | 'end_at' | 'url'
  | 'affiliate_url' | 'image_url' | 'shop_name' | 'category' | 'scope' | 'payment_method' | 'new_user_only'
  | 'requires_collect' | 'conditions' | 'status' | 'first_seen_at'
>;

export const SORTS = { moi: 'Mới nhất', giam: 'Giảm nhiều', 'sap-het': 'Sắp hết hạn' } as const;
export type Sort = keyof typeof SORTS;

export interface PromoFilter {
  type?: PromoType;
  platform?: Platform;
  q?: string;
  sort?: Sort;
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
    q: first(sp.q)?.trim().slice(0, 100) || undefined,
    sort: sx && sx in SORTS ? (sx as Sort) : 'moi',
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 500) : 1,
  };
}

export async function listPromotions(db: SupabaseClient<Database>, f: PromoFilter) {
  const size = f.pageSize ?? 30;
  const page = f.page ?? 1;
  let q = db.from('promotions').select(PROMO_COLUMNS, { count: 'exact' }).eq('status', 'active');
  if (f.type) q = q.eq('type', f.type);
  if (f.platform) q = q.eq('platform', f.platform);
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
