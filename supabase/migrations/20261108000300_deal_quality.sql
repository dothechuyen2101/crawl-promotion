-- Đánh giá chất lượng deal từ lịch sử giá 30 ngày (worker tính, xem packages/shared/src/price-insight.ts).
alter table public.promotions
  add column price_median_30d numeric,
  add column price_min_30d numeric,
  add column is_lowest_30d boolean not null default false,
  add column deal_quality text check (deal_quality in ('real', 'normal', 'inflated'));

create index promotions_deal_quality_idx on public.promotions (deal_quality)
  where type in ('deal', 'flash_sale') and status = 'active';

-- Cập nhật theo lô: items = [{platform, product_external_id, median, min_price, is_lowest, quality}]
create or replace function public.apply_deal_quality(items jsonb)
returns integer
language sql
security definer
set search_path = ''
as $$
  with x as (
    select *
      from jsonb_to_recordset(items) as t(
        platform public.platform, product_external_id text, median numeric, min_price numeric, is_lowest boolean, quality text
      )
  ), u as (
    update public.promotions p
       set price_median_30d = x.median,
           price_min_30d = x.min_price,
           is_lowest_30d = coalesce(x.is_lowest, false),
           deal_quality = x.quality
      from x
     where p.platform = x.platform
       and p.product_external_id = x.product_external_id
       and p.type in ('deal', 'flash_sale')
    returning 1
  )
  select count(*)::int from u;
$$;
revoke execute on function public.apply_deal_quality(jsonb) from public, anon, authenticated;
