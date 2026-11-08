-- =====================================================================
-- crawl-promotion: schema khởi tạo
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------- enums ----------
create type public.platform as enum ('shopee', 'tiktok', 'lazada', 'tiki', 'grabfood', 'be');
create type public.promo_type as enum ('voucher', 'flash_sale', 'deal', 'campaign');
create type public.discount_type as enum ('percent', 'fixed', 'freeship');
create type public.voucher_scope as enum ('platform', 'shop', 'freeship', 'payment', 'category');
create type public.promo_status as enum ('active', 'expired', 'upcoming');
create type public.search_kind as enum ('product', 'food');
create type public.search_status as enum ('pending', 'running', 'done', 'partial', 'error');
create type public.run_status as enum ('running', 'success', 'error');

-- ---------- admin ----------
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

-- ---------- promotions ----------
create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  platform public.platform not null,
  type public.promo_type not null,
  external_id text not null,
  source text not null,
  title text not null,
  description text,
  code text,
  discount_type public.discount_type,
  discount_value numeric,
  max_discount numeric,
  min_spend numeric,
  is_cashback boolean not null default false,
  sale_price numeric,
  original_price numeric,
  discount_pct numeric generated always as (
    case
      when original_price > 0 and sale_price is not null and sale_price <= original_price
        then round((1 - sale_price / original_price) * 100, 1)
    end
  ) stored,
  start_at timestamptz,
  end_at timestamptz,
  url text not null,
  affiliate_url text,
  image_url text,
  shop_id text,
  shop_name text,
  category text,
  city text,
  product_external_id text,
  scope public.voucher_scope,
  stack_group text,
  applicable_categories text[] not null default '{}',
  payment_method text,
  new_user_only boolean not null default false,
  usage_left_pct numeric,
  requires_collect boolean not null default false,
  conditions jsonb not null default '{}',
  raw jsonb,
  -- tiêu đề + shop đã bỏ dấu, do worker điền, dùng cho tìm kiếm
  search_text text not null default '',
  status public.promo_status not null default 'active',
  content_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notified_at timestamptz,
  unique (platform, type, external_id)
);

create index promotions_feed_idx on public.promotions (status, type, platform, first_seen_at desc);
create index promotions_end_idx on public.promotions (end_at) where status <> 'expired';
create index promotions_shop_idx on public.promotions (platform, shop_id) where shop_id is not null;
create index promotions_scope_idx on public.promotions (platform, scope) where type = 'voucher';
create index promotions_search_idx on public.promotions using gin (search_text extensions.gin_trgm_ops);
create index promotions_notify_idx on public.promotions (first_seen_at) where notified_at is null;

-- ---------- products & price history ----------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  platform public.platform not null,
  external_id text not null,
  title text not null,
  url text not null,
  image_url text,
  shop_id text,
  shop_name text,
  category text,
  current_price numeric,
  original_price numeric,
  search_text text not null default '',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (platform, external_id)
);
create index products_search_idx on public.products using gin (search_text extensions.gin_trgm_ops);

create table public.price_history (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products (id) on delete cascade,
  price numeric not null,
  original_price numeric,
  captured_at timestamptz not null default now()
);
create index price_history_product_idx on public.price_history (product_id, captured_at desc);

-- ---------- crawl config & monitoring ----------
create table public.watch_queries (
  id bigint generated always as identity primary key,
  platform public.platform,            -- null = mọi sàn TMĐT
  query text not null,
  kind public.search_kind not null default 'product',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.source_settings (
  source_id text primary key,
  enabled boolean not null default true,
  consecutive_failures int not null default 0,
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create table public.crawl_runs (
  id bigint generated always as identity primary key,
  source_id text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status public.run_status not null default 'running',
  found int not null default 0,
  inserted int not null default 0,
  updated int not null default 0,
  invalid int not null default 0,
  error text
);
create index crawl_runs_source_idx on public.crawl_runs (source_id, started_at desc);

create table public.worker_heartbeat (
  worker_id text primary key,
  last_seen_at timestamptz not null default now(),
  version text,
  info jsonb not null default '{}'
);

-- ---------- tìm giá rẻ nhất ----------
create table public.search_requests (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  input_url text,
  kind public.search_kind not null default 'product',
  district text,
  cache_key text not null,
  status public.search_status not null default 'pending',
  platforms_done public.platform[] not null default '{}',
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index search_requests_cache_idx on public.search_requests (cache_key, created_at desc);
create index search_requests_pending_idx on public.search_requests (created_at) where status = 'pending';

create table public.search_results (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.search_requests (id) on delete cascade,
  platform public.platform not null,
  listing_id text not null,
  title text not null,
  image_url text,
  url text not null,
  shop_id text,
  shop_name text,
  category text,
  price numeric not null,
  original_price numeric,
  shipping_fee numeric,
  -- mọi voucher có thể liên quan, để web tính lại khi người dùng đổi tuỳ chọn
  vouchers jsonb not null default '[]',
  best_combo jsonb not null default '{}',
  final_price numeric not null,
  match_score numeric not null default 0,
  is_outlier boolean not null default false,
  computed_at timestamptz not null default now(),
  unique (request_id, platform, listing_id)
);
create index search_results_request_idx on public.search_results (request_id, final_price);

create table public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (bucket, window_start)
);

-- Tăng bộ đếm và trả về true nếu còn trong hạn mức. Chỉ service role gọi.
create or replace function public.hit_rate_limit(p_bucket text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count int;
begin
  insert into public.rate_limits as r (bucket, window_start, count)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set count = r.count + 1
  returning count into v_count;
  return v_count <= p_limit;
end;
$$;
revoke execute on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;

-- ---------- thông báo ----------
create table public.subscriptions (
  id bigint generated always as identity primary key,
  telegram_chat_id bigint not null unique,
  keywords text[] not null default '{}',
  platforms public.platform[] not null default '{}',   -- rỗng = mọi sàn
  types public.promo_type[] not null default '{}',      -- rỗng = mọi loại
  min_discount_pct numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_log (
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  chat_id bigint not null,
  sent_at timestamptz not null default now(),
  primary key (promotion_id, chat_id)
);

-- ---------- clicks & API keys ----------
create table public.clicks (
  id bigint generated always as identity primary key,
  promotion_id uuid references public.promotions (id) on delete set null,
  search_result_id bigint references public.search_results (id) on delete set null,
  platform public.platform,
  target_url text not null,
  referrer text,
  created_at timestamptz not null default now()
);
create index clicks_created_idx on public.clicks (created_at desc);

create table public.api_keys (
  id bigint generated always as identity primary key,
  name text not null,
  key_hash text not null unique,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.admins enable row level security;
alter table public.promotions enable row level security;
alter table public.products enable row level security;
alter table public.price_history enable row level security;
alter table public.watch_queries enable row level security;
alter table public.source_settings enable row level security;
alter table public.crawl_runs enable row level security;
alter table public.worker_heartbeat enable row level security;
alter table public.search_requests enable row level security;
alter table public.search_results enable row level security;
alter table public.rate_limits enable row level security;
alter table public.subscriptions enable row level security;
alter table public.notification_log enable row level security;
alter table public.clicks enable row level security;
alter table public.api_keys enable row level security;

-- Công khai: chỉ đọc khuyến mãi còn hiệu lực, sản phẩm, lịch sử giá, kết quả tìm giá.
create policy "public read live promotions" on public.promotions
  for select to anon, authenticated using (status <> 'expired' or (select public.is_admin()));
create policy "public read products" on public.products for select to anon, authenticated using (true);
create policy "public read price history" on public.price_history for select to anon, authenticated using (true);
create policy "public read search requests" on public.search_requests for select to anon, authenticated using (true);
create policy "public read search results" on public.search_results for select to anon, authenticated using (true);
-- Trạng thái worker online/offline hiển thị công khai trên trang tìm giá.
create policy "public read heartbeat" on public.worker_heartbeat for select to anon, authenticated using (true);

-- Admin
create policy "admin read admins" on public.admins for select to authenticated using ((select public.is_admin()));
create policy "admin all watch_queries" on public.watch_queries for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin all source_settings" on public.source_settings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin read crawl_runs" on public.crawl_runs for select to authenticated using ((select public.is_admin()));
create policy "admin read subscriptions" on public.subscriptions for select to authenticated using ((select public.is_admin()));
create policy "admin read clicks" on public.clicks for select to authenticated using ((select public.is_admin()));
create policy "admin all api_keys" on public.api_keys for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- =====================================================================
-- Realtime: worker nghe search_requests mới, web nghe search_results.
-- =====================================================================
alter publication supabase_realtime add table public.search_requests, public.search_results;

-- =====================================================================
-- Bảo trì định kỳ
-- =====================================================================
create or replace function public.refresh_promotion_status()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.promotions set status = 'active', updated_at = now()
   where status = 'upcoming' and start_at <= now() and (end_at is null or end_at > now());
  update public.promotions set status = 'expired', updated_at = now()
   where status <> 'expired'
     and (
       end_at < now()
       -- không có hạn dùng: hết hiệu lực khi worker không còn thấy trong 1 ngày
       or (end_at is null and last_seen_at < now() - interval '1 day')
     );
$$;

create or replace function public.compact_price_history()
returns void
language sql
security definer
set search_path = ''
as $$
  -- Sau 7 ngày chỉ giữ giá thấp nhất mỗi ngày; sau 90 ngày xoá.
  delete from public.price_history ph
   using (
     select id, row_number() over (
       partition by product_id, date_trunc('day', captured_at) order by price asc, captured_at asc
     ) as rn
       from public.price_history
      where captured_at < now() - interval '7 days'
   ) d
   where ph.id = d.id and d.rn > 1;
  delete from public.price_history where captured_at < now() - interval '90 days';
$$;

create or replace function public.cleanup_transient()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.search_requests where created_at < now() - interval '2 days';
  delete from public.rate_limits where window_start < now() - interval '1 day';
  delete from public.crawl_runs where started_at < now() - interval '30 days';
  delete from public.promotions where status = 'expired' and updated_at < now() - interval '60 days';
$$;

revoke execute on function public.refresh_promotion_status() from public, anon, authenticated;
revoke execute on function public.compact_price_history() from public, anon, authenticated;
revoke execute on function public.cleanup_transient() from public, anon, authenticated;
