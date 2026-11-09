# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A promotion crawler for Vietnamese shopping and food platforms, plus a "best price" finder that works out the best voucher combination for each seller. The live sources are Tiki, Be, and the AccessTrade affiliate API (shop vouchers for Shopee and Tiki). Shopee, Lazada, TikTok Shop and GrabFood block automated access, so they have no scrapers. It is a pnpm monorepo using Node ≥ 24, TypeScript 7, zod 4 and vitest.

- `apps/worker`: a long-running crawler, scheduler and search processor. It runs on a personal machine or in Docker.
- `apps/web`: a Next.js 16 App Router site on Vercel. It has the feeds, `/tim-gia`, `/admin`, `/api/v1/*` and the Telegram webhook.
- `packages/shared`: types, zod schemas, the pricing engine, product matching and categories. Both apps use it.
- `supabase/`: Postgres migrations (schema, RLS, pg_cron) and `seed.sql`.

## Commands

```bash
pnpm install
pnpm test                                   # all vitest suites (shared + worker)
pnpm typecheck                              # tsc in every package (there is no linter)
pnpm worker test tiki                       # one worker test file (extra args go to `vitest run`)
pnpm --filter @cp/shared test -t "shopKey"  # tests by name
pnpm web dev                                # http://localhost:3000
pnpm web build

pnpm db:start     # local Supabase: API 55321, DB 55322, Studio http://127.0.0.1:55323
pnpm db:reset     # re-apply migrations + seed.sql
pnpm db:types     # regenerate packages/shared/src/database.types.ts from the local DB

pnpm worker cli list
pnpm worker cli run --source tiki.voucher --dry-run [--limit N] [--json]  # no DB writes; works without Supabase
pnpm worker cli run --all
pnpm worker cli search "nồi chiên không dầu" [--kind food --district cau-giay] [--platforms tiki]
pnpm worker cli recon <url> [--match <substr>]  # print a page's JSON XHRs; use when a site changes its API
pnpm worker cli login <platform>                # sign in using the worker's persistent browser profile
pnpm worker cli reclassify                      # run after editing category keywords
pnpm worker cli ai-classify [--dry-run]
pnpm worker start                               # scheduler + search service + heartbeat
```

The worker needs Playwright's Chromium: `cd apps/worker && npx playwright install chromium`. To smoke-test `/admin`, run `node apps/web/scripts/admin-smoke.mjs out.png` while `pnpm web dev` is running. It needs `apps/web/.env.local`, and it creates a temporary admin and deletes it afterwards.

## No build step

Nothing is compiled ahead of time. The worker runs through `tsx`. `@cp/shared` exports raw `.ts` files (`.`, `./pricing`, `./database`), and Next transpiles them via `transpilePackages`. In the worker and shared packages, relative imports **must include the `.ts` extension** (nodenext + `allowImportingTsExtensions`), and type-only imports need `import type` because `verbatimModuleSyntax` is on. The web app uses the `@/…` alias with extensionless imports. `noUncheckedIndexedAccess` is enabled everywhere.

## Architecture

### Web and worker communicate only through Supabase

Neither app ever calls the other directly.

- **Best-price search.** The web side (`/tim-gia`, `/api/v1/best-price`, Telegram `/timgia` and `/timmon`) calls `requestSearch` in `apps/web/src/lib/search.ts`. That function reuses a request with the same `cache_key` from the last 30 minutes. Otherwise it applies a rate limit through the `hit_rate_limit` RPC and inserts a pending `search_requests` row.
  - The worker's `SearchService` (`apps/worker/src/search/service.ts`) wakes on a Realtime INSERT, with 3-second polling as a fallback. It claims a request atomically by updating it only while `status='pending'`, then runs the pipeline. As each platform finishes, it upserts that platform's `search_results` and updates `platforms_done`. The final status is `done`, `partial` or `error`.
  - `components/search-results.tsx` follows the results over Realtime. If `worker_heartbeat` is older than 3 minutes, the web treats the worker as offline and builds stale results from DB products (`lib/fallback.ts`).
- **Telegram.** The web webhook (`apps/web/src/app/api/telegram/webhook/route.ts`) handles incoming commands, which write `subscriptions` rows or search requests. The worker sends every outgoing message: new promotions that match subscriptions, `/timgia` results, and admin alerts (`core/notifier.ts`, `core/telegram.ts`).
- **Admin.** Server actions in `/admin` toggle `source_settings.enabled`, edit `watch_queries` and issue API keys. The worker reads those tables.

### Worker crawl pipeline

- **Sources.** A `Source` (`apps/worker/src/core/types.ts`) is an async generator that yields `NormalizedPromotionInput`. It has a cron `schedule` (Asia/Ho_Chi_Minh time) and can set `disabledReason()` (missing config), `allowEmpty` and `afterRun`. Register sources in `SOURCES` and search adapters in `SEARCH_ADAPTERS`, both in `src/sources/index.ts`. At startup the worker triggers every job once, then follows cron. A separate hourly job, `maintenance.categories`, also runs.
- **Runner.** `core/runner.ts` validates every item with `NormalizedPromotionSchema`. Invalid items are counted but don't stop the run. Valid items are flushed to `core/store.ts` in batches of 200. A run that yields zero valid items fails unless the source sets `allowEmpty`, because an empty result usually means the site changed or blocked us. The runner records `crawl_runs` and `source_settings` health, and 3 failures in a row send an admin alert on Telegram.
- **Store.** `core/store.ts` upserts on `(platform, type, external_id)`, so `externalId` must stay stable across runs. `content_hash` tells inserted, updated and unchanged items apart, and `inserted > 0` triggers notifications.
  - `deal` and `flash_sale` items that have both `productExternalId` and `salePrice` also upsert `products` and append to `price_history` when the price changes. Deal quality is then computed with `priceInsight` (shared) and written through the `apply_deal_quality` RPC: "giảm thật" (real discount) or "inflated" (original price padded).
- **Status lifecycle.** Status changes happen in the database. pg_cron (`supabase/migrations/*_cron.sql`) moves promotions from upcoming to active to expired every 10 minutes. A promotion with no end date expires once it has gone unseen for a day. Expired vouchers are deleted nightly by `purge_expired_vouchers()` 3 days after `greatest(end_at, last_seen_at)`. Measuring from `last_seen_at` stops it deleting a voucher the platform still returns, which the next crawl would just re-insert. Other expired types are deleted after 60 days by `cleanup_transient()`.
- **Layout of a source.** Pure parse functions live in `sources/<name>/parse.ts` (or are exported from its `index.ts`). They are tested against saved responses in `apps/worker/test/fixtures/<name>/`. Network code lives in `index.ts`. Shared helpers are in `sources/common.ts`: `parseDiscountText` reads Vietnamese discount phrases like "Giảm 10% tối đa 50K đơn từ 199K", and there are also `extractNextData`, `cleanUrl`, and helpers for Vietnamese day boundaries.
- **Network.** All network access goes through `core/http.ts` (`httpJson`/`httpText`) or `core/browser.ts`. `BrowserPool` keeps one persistent Chrome profile per platform in `DATA_DIR/profiles/<platform>`. Both paths go through the per-platform `p-queue` rate limits in `core/limiter.ts`. Crawls run at priority 0 and searches at priority 10. A per-platform proxy can be set with `PROXY_URL_<PLATFORM>`.

### Best-price pipeline and pricing engine

- **Pipeline.** In `search/pipeline.ts`, each `SearchAdapter` runs a search with a 25-second timeout per platform and keeps the top 8 listings by `matchScore`. It then gathers vouchers from the adapter's `listingVouchers` and from the DB platform and shop vouchers (`search/vouchers.ts`), and runs `bestPrice` from `@cp/shared/pricing`. Ranking puts listings with a high match score (≥ `HIGH_MATCH` = 0.6) that aren't price outliers first, then sorts by effective price.
- **Engine.** In `packages/shared/src/pricing/`, `rules.ts` defines stacking rules per platform:
  - E-commerce: 1 shop + 1 platform + 1 freeship + 1 payment voucher.
  - Food: the shop's own promotion + 1 platform code (on the food or the delivery fee) + 1 payment offer.
- **Core rule.** When information is missing (shop id or name, category, payment method), the engine does **not** apply the voucher. Overstating a price is better than reporting a wrong low price. Payment, new-user-only and restricted vouchers are left out unless the options include them.

### Categories

There are 22 categories in `packages/shared/src/categories.ts` (`classifyCategory`, `classifyQuery`). They use weighted keywords matched against accent-stripped text, so a keyword has to be a phrase that stays unambiguous without accents ("giày" (shoes) and "giấy" (paper) both fold to "giay").

The worker's `core/categories.ts` adds `shop_categories`: a shop gets the majority category of the products seen from it (`source='products'`). Shops with no products seen yet get a guess from AI (`source='ai'`, `core/ai.ts`: Claude through APIMart, with output forced through a tool call and checked by zod). A `products` entry always overrides an `ai` entry. After changing keywords, run `pnpm worker cli reclassify`.

### Database and auth

- **RLS.** Anonymous users can read active promotions, products, price history, search requests and results, and the heartbeat. Everything else is admin-only through `public.is_admin()`, backed by the `admins` table. Grant admin with `pnpm worker cli make-admin <email>`.
- **Web clients** (`apps/web/src/lib/supabase/`):
  - `serverClient()` uses the user's session and obeys RLS. Admin server actions use it together with an `is_admin` check.
  - `adminClient()` uses the secret key, bypasses RLS and is server-only. API routes, the webhook and search use it.
  - `browserClient()` is for Realtime in client components.
- **Session refresh.** `src/proxy.ts` is Next 16's middleware. It refreshes the Supabase session for `/admin`, `/login` and `/auth`.
- **Worker database access.** The worker uses the service-role key (`core/db.ts`), and `SUPABASE_SECRET_KEY` is accepted in place of `SUPABASE_SERVICE_ROLE_KEY`.
- **Schema changes.** Add a new timestamped file to `supabase/migrations/`, then run `pnpm db:reset` and `pnpm db:types`, and commit the regenerated types.

### Web

- **Routes.** Route slugs are Vietnamese (`/voucher`, `/flash-sale`, `/giam-sau`, `/chien-dich`, `/danh-muc`, `/tim-gia`, `/km/[id]`), and so are the query params:

  | Param | Meaning |
  |---|---|
  | `san` | platform |
  | `loai` | promotion type |
  | `nhom` | category |
  | `sx` | sort |
  | `trang` | page |
  | `q` | search text |
  | `that=1` | real discounts only |

  `parseFilter` in `lib/promotions.ts` parses them, and the API uses the same params. Feed pages share `components/feed-page.tsx`.
- **Outbound links.** These go through `/go/[id]`, where a uuid means a promotion and a number means a search result. The route logs a row in `clicks` and prefers `affiliate_url`.
- **AccessTrade affiliate links.** AccessTrade sets `affiliateUrl` only for campaigns whose approval is `successful`, because links for unapproved campaigns return 404. The approval state is kept in `DATA_DIR/accesstrade-approved.json`.
- **API auth.** `/api/v1/*` requires an `x-api-key` header, checked against sha256 hashes in `api_keys`.

## Environment and deploy

- **Worker config.** The worker loads `apps/worker/.env` first, then the root `.env` (zod-validated in `src/config.ts`). A missing optional key turns off its feature instead of crashing:
  - No `ACCESSTRADE_TOKEN`: the AccessTrade source is disabled.
  - No `APIMART_API_KEY`: no AI classification.
  - No Supabase: only the dry-run and search CLI commands work.
- **Web config.** The web app reads `apps/web/.env.local` locally and Vercel env vars in production. See the web section of `.env.example`.
- **Deploying the web app.** Run `npx vercel deploy --prod` from the **repo root** (the Vercel Root Directory is `apps/web`). The function region `syd1` (next to Supabase `ap-southeast-2`) is set through the Vercel API, because `regions` in `vercel.json` is ignored. The README has the command.
- **Running the worker.** Use `docker compose up -d --build worker`. It runs on the host network, with `./apps/worker/data` mounted at `/data`; that directory holds browser profiles with login sessions, so never commit it.

## Conventions

- UI text, code comments, error messages and commit messages are written in Vietnamese. A commit message is a short summary line followed by `-` bullets explaining what changed and why.
- Money is integer VND. Dates and schedules use Asia/Ho_Chi_Minh; use `endOfDayVN` and `startOfDayVN` for date-only strings.
- Text matching uses `normalizeText` and `foldVietnamese` from shared (accent-stripped, lowercase), and the result is stored as `search_text`.
