-- Nhóm sản phẩm (slug theo packages/shared/src/categories.ts), do worker phân loại.
alter table public.promotions add column category_slug text;
alter table public.products add column category_slug text;
-- Người dùng Telegram theo dõi theo nhóm (rỗng = mọi nhóm)
alter table public.subscriptions add column categories text[] not null default '{}';

create index promotions_category_idx on public.promotions (category_slug, type, first_seen_at desc) where status = 'active';

-- Số khuyến mãi đang hiệu lực theo nhóm (cho thanh lọc trên web). Chạy với quyền người gọi → tuân theo RLS.
create or replace function public.category_counts(p_type public.promo_type default null, p_platform public.platform default null)
returns table (slug text, n bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(category_slug, 'khac') as slug, count(*) as n
    from public.promotions
   where status = 'active'
     and (p_type is null or type = p_type)
     and (p_platform is null or platform = p_platform)
   group by 1;
$$;
grant execute on function public.category_counts(public.promo_type, public.platform) to anon, authenticated;
