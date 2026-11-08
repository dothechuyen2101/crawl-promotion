# crawl-promotion

Hệ thống thu thập khuyến mãi đa sàn (Shopee, TikTok Shop, Lazada, Tiki, GrabFood, Be) và **tìm giá rẻ nhất** (tự tính tổ hợp voucher tốt nhất cho từng nơi bán).

```
apps/worker      Crawler + scheduler + xử lý yêu cầu tìm giá (chạy trên máy cá nhân, Docker)
apps/web         Web Next.js trên Vercel: feed khuyến mãi, tìm giá rẻ nhất, /admin, API, webhook Telegram
packages/shared  Kiểu dữ liệu, schema zod, engine tính giá, so khớp sản phẩm
supabase/        Migration Postgres (schema, RLS, pg_cron), seed
```

## Chạy local

Yêu cầu: Node ≥ 24, pnpm 10, Docker.

```bash
pnpm install
pnpm db:start                         # Supabase local trên cổng 553xx (Studio: http://127.0.0.1:55323)
cp .env.example .env                  # điền khoá Supabase (worker đọc .env ở thư mục gốc)
# apps/web/.env.local: các biến NEXT_PUBLIC_... + SUPABASE_SECRET_KEY (xem .env.example)
cd apps/worker && npx playwright install chromium && cd ../..

pnpm test                             # unit test (engine giá, parser từng sàn)
pnpm worker cli list                  # danh sách nguồn crawl
pnpm worker cli run --source tiki.voucher --dry-run   # chạy thử 1 nguồn, in kết quả, không ghi DB
pnpm worker cli run --all             # chạy tất cả, ghi vào DB
pnpm worker cli search "nồi chiên không dầu"          # thử tìm giá rẻ nhất
pnpm worker start                     # chạy worker liên tục (scheduler + tìm giá + heartbeat)
```

Chạy nền bằng Docker: `docker compose up -d --build worker`.

Web: `pnpm web dev` (http://localhost:3000). Trang chính: `/`, `/voucher`, `/flash-sale`, `/giam-sau`, `/chien-dich`,
`/tim-gia`, `/admin`. Kiểm thử nhanh trang admin: `node apps/web/scripts/admin-smoke.mjs` (tạo admin tạm rồi xoá).

## Giảm thật hay giảm ảo?

Worker lưu lịch sử giá sản phẩm (flash sale, giảm sâu) và tính **giá thường 30 ngày** = trung vị có trọng số theo thời gian
mỗi mức giá được giữ (`packages/shared/src/price-insight.ts`). Khi đủ ≥ 3 ngày dữ liệu:
- giá hiện tại ≤ 90% giá thường → **Giảm thật** (kèm "thấp nhất 30 ngày" nếu rẻ hơn mọi mức giá khác);
- giá gốc niêm yết ≥ 120% giá thường mà giá bán ≈ giá thường → **Giá gốc có thể bị nâng** (không gửi thông báo Telegram).

Trang Giảm sâu / Flash sale có bộ lọc "Chỉ giảm thật" (`?that=1`).

## API (header `x-api-key`, tạo key trong /admin)

| Endpoint | Mô tả |
|---|---|
| `GET /api/v1/promotions?loai=voucher&san=shopee&q=...&sx=moi\|giam\|sap-het&trang=1&limit=50` | Danh sách khuyến mãi |
| `GET /api/v1/export?format=csv\|xlsx` (+ bộ lọc như trên) | Xuất file, tối đa 5000 dòng |
| `GET /api/v1/best-price?q=...&kind=product\|food&district=cau-giay` | Tạo yêu cầu tìm giá → `{ id }` |
| `GET /api/v1/best-price?id=<id>` | Trạng thái + kết quả (khớp cao trước, rồi theo giá cuối) |

## Bot Telegram

`/theodoi <từ khoá>`, `/bo`, `/san shopee,tiki`, `/loai voucher`, `/giam 50`, `/caidat`, `/tatthongbao`, `/batthongbao`,
`/timgia <tên hoặc link>`, `/timmon <món> [quận]`. Khuyến mãi mới khớp bộ lọc do worker gửi; kết quả `/timgia` cũng do worker gửi khi tìm xong.

## Trạng thái từng nguồn

| Nguồn | Trạng thái | Ghi chú |
|---|---|---|
| Tiki: mã giảm giá, deal, chiến dịch, flash sale, tìm giá | ✅ chạy thật | API web công khai. Flash sale hiện trống phía Tiki (parser đã có test) |
| Be: chương trình khuyến mãi | ✅ chạy thật | Chỉ có danh sách trên be.com.vn; chi tiết mã nằm trong app |
| AccessTrade: mã shop Shopee, Tiki | ✅ chạy thật | ~1.000 mã, có link affiliate. Lazada/TikTok hiện chưa có mã (cần đăng ký chiến dịch `lazada_kol`, `tiktok_cps`). API hay trả nhầm 403 "Invalid token" → source tự thử lại |
| Shopee, Lazada, TikTok Shop, GrabFood | ⛔ chưa làm | Các sàn này chặn truy cập tự động; hướng đề xuất: API affiliate chính thức (AccessTrade, Shopee/Lazada Affiliate) |

## Đưa lên môi trường thật

Hiện tại: web **https://crawl-promotion.vercel.app** (Vercel project `crawl-promotion`, hàm chạy ở `syd1` cạnh Supabase `ap-southeast-2`).
Deploy lại: `npx vercel deploy --prod` ở thư mục gốc. Vùng chạy hàm đặt bằng
`echo '{"resourceConfig":{"functionDefaultRegions":["syd1"]}}' | npx vercel api /v9/projects/crawl-promotion -X PATCH --input -`
(trường `regions` trong `vercel.json` bị bỏ qua).

1. **Supabase** (đã làm cho project `crawl-promotion`): `npx supabase link --project-ref <ref>` → `npx supabase db push --remote --include-seed`.
2. **Vercel**: `npx vercel login` → ở thư mục gốc chạy `npx vercel link` (Root Directory = `apps/web`) → thêm các biến ở mục
   web trong `.env.example` (Settings → Environment Variables) → `npx vercel deploy --prod`.
   Gói Hobby không cho phép dùng thương mại (web có affiliate cần gói Pro).
3. **Supabase Auth** → URL Configuration: Site URL = URL Vercel; Redirect URLs thêm `https://<app>.vercel.app/auth/callback`
   và `http://localhost:3000/auth/callback`.
4. **Tài khoản quản trị**: `pnpm worker cli make-admin <email>` rồi đăng nhập ở `/login` bằng link gửi qua email.
5. **Telegram**: tạo bot ở @BotFather → điền `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (chuỗi ngẫu nhiên) vào `.env`
   và Vercel → `pnpm worker cli telegram-webhook https://<app>.vercel.app`.
6. **Worker** chạy liên tục trên máy cá nhân: `docker compose up -d --build worker` (hoặc `pnpm worker start`).
