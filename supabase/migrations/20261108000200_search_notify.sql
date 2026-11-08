-- Yêu cầu tìm giá từ bot Telegram: worker gửi kết quả về chat này khi xong.
alter table public.search_requests add column notify_chat_id bigint;

-- Không lộ chat id qua API công khai: anon/authenticated chỉ được đọc các cột cần thiết.
revoke select on public.search_requests from anon, authenticated;
grant select (id, query, input_url, kind, district, cache_key, status, platforms_done, error, created_at, started_at, finished_at)
  on public.search_requests to anon, authenticated;
