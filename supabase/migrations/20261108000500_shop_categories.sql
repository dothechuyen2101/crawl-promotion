-- Nhóm suy ra cho từng shop (từ sản phẩm/kết quả tìm kiếm đã thấy của shop đó).
-- Dùng khi mã giảm giá chỉ có tên shop, không có tên sản phẩm (vd mã shop từ AccessTrade).
create table public.shop_categories (
  platform public.platform not null,
  shop_key text not null,
  shop_name text not null,
  category_slug text not null,
  samples int not null,
  share numeric not null,
  updated_at timestamptz not null default now(),
  primary key (platform, shop_key)
);
alter table public.shop_categories enable row level security;
create policy "admin read shop_categories" on public.shop_categories for select to authenticated using ((select public.is_admin()));
