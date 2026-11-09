-- Xoá voucher đã hết hạn (các loại khuyến mãi khác vẫn theo cleanup_transient: xoá sau 60 ngày).
-- Mốc tính là thời điểm muộn nhất giữa hạn dùng và lần cuối worker còn thấy mã trên sàn:
--   * sàn vẫn trả về mã đã quá hạn thì chưa xoá (xoá xong, lượt crawl sau lại thêm vào);
--   * mã không có hạn dùng (hết hiệu lực khi 1 ngày không thấy) tính từ lần cuối thấy.
-- Chờ thêm 3 ngày để nguồn crawl lỗi tạm thời rồi chạy lại không làm mã cũ thành "mã mới" (gửi Telegram lại).
-- Xoá theo: notification_log (cascade); clicks giữ lại, promotion_id = null.
-- Chạy tay: select public.purge_expired_vouchers();  -- trả về số voucher đã xoá
create or replace function public.purge_expired_vouchers()
returns integer
language sql
security definer
set search_path = ''
as $$
  with deleted as (
    delete from public.promotions
     where type = 'voucher'
       and status = 'expired'
       and greatest(end_at, last_seen_at) < now() - interval '3 days'
    returning 1
  )
  select count(*)::integer from deleted;
$$;

revoke execute on function public.purge_expired_vouchers() from public, anon, authenticated;

-- 03:30 giờ VN mỗi ngày. cron.schedule cùng tên sẽ cập nhật job nên migration chạy lại được.
select cron.schedule('purge-expired-vouchers', '30 20 * * *', $$ select public.purge_expired_vouchers() $$);
