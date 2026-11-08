-- Nhóm của shop có thể do AI đoán từ tên shop/thương hiệu (khi chưa thấy sản phẩm nào của shop).
-- 'products': suy ra từ sản phẩm đã thấy (đáng tin hơn, luôn ghi đè 'ai').
-- 'ai': model đoán; category_slug = 'khac' nghĩa là AI không nhận ra → thử lại sau một thời gian.
alter table public.shop_categories
  add column source text not null default 'products' check (source in ('products', 'ai')),
  add column model text;

create index shop_categories_source_idx on public.shop_categories (source, updated_at);
