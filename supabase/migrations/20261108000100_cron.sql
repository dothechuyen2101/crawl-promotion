-- pg_cron: bảo trì định kỳ (trên Supabase cloud cần bật extension pg_cron, migration này tự bật).
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('refresh-promotion-status', '*/10 * * * *', $$ select public.refresh_promotion_status() $$);
select cron.schedule('compact-price-history', '15 20 * * *', $$ select public.compact_price_history() $$); -- 03:15 giờ VN
select cron.schedule('cleanup-transient', '45 * * * *', $$ select public.cleanup_transient() $$);
