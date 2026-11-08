import { parseArgs } from 'node:util';
import { HANOI_DISTRICTS, PLATFORMS, type HanoiDistrict, type Platform, type SearchKind } from '@cp/shared';
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';
import { fetch } from 'undici';
import { env } from './config.ts';
import { db } from './core/db.ts';
import { BrowserPool } from './core/browser.ts';
import { reclassifyAll, refreshShopCategories } from './core/categories.ts';
import { createContext } from './core/context.ts';
import { runSource } from './core/runner.ts';
import { logger } from './logger.ts';
import { runSearch } from './search/pipeline.ts';
import { SOURCES } from './sources/index.ts';

const HELP = `Cách dùng: pnpm worker cli <lệnh> [tuỳ chọn]

  list                                   Liệt kê các nguồn crawl
  run --source <id> [--dry-run] [--limit N] [--json]
                                         Chạy 1 nguồn (hoặc --all để chạy tất cả)
  search "<từ khoá>" [--kind product|food] [--district cau-giay] [--platforms tiki,shopee] [--json]
                                         Chạy thử tính năng tìm giá rẻ nhất (in kết quả, không ghi DB)
  login <sàn>                            Mở trình duyệt thật bằng profile của worker để bạn đăng nhập
                                         (dùng tài khoản phụ). Đóng cửa sổ khi xong.
  recon <url> [--match <chuỗi>]          Mở trang và in các request JSON (để tìm API khi sàn đổi giao diện)
  reclassify                             Suy ra nhóm của shop rồi phân loại lại toàn bộ khuyến mãi & sản phẩm
  make-admin <email>                     Tạo (nếu chưa có) tài khoản và cấp quyền quản trị cho /admin
  telegram-webhook <url-web>             Đăng ký webhook bot Telegram (vd https://ten-app.vercel.app)
`;

const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('vi-VN') + 'đ');

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      source: { type: 'string', short: 's' },
      all: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      limit: { type: 'string' },
      json: { type: 'boolean' },
      kind: { type: 'string' },
      district: { type: 'string' },
      platforms: { type: 'string' },
      match: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const [cmd, arg] = positionals;
  if (!cmd || values.help) {
    console.log(HELP);
    return;
  }

  const browser = new BrowserPool();
  try {
    switch (cmd) {
      case 'list': {
        for (const s of SOURCES) {
          const off = s.disabledReason?.();
          console.log(`${s.id.padEnd(28)} ${s.schedule.padEnd(16)} ${s.description}${off ? `  [tắt: ${off}]` : ''}`);
        }
        break;
      }
      case 'run': {
        const targets = values.all ? SOURCES : SOURCES.filter((s) => s.id === values.source);
        if (!targets.length) throw new Error(`Không tìm thấy nguồn "${values.source}". Gõ "list" để xem danh sách.`);
        const ctx = createContext(browser);
        for (const source of targets) {
          const r = await runSource(source, ctx, {
            dryRun: values['dry-run'],
            limit: values.limit ? Number(values.limit) : undefined,
          });
          if (values.json) {
            console.log(JSON.stringify(r, null, 2));
            continue;
          }
          console.log(`\n== ${r.sourceId}: ${r.status} — ${r.found} hợp lệ, ${r.invalid} lỗi, ${r.inserted} mới, ${r.updated} cập nhật (${r.durationMs}ms)`);
          if (r.error) console.log(`   lỗi: ${r.error}`);
          for (const it of (r.items ?? []).slice(0, 15)) {
            const price = it.salePrice != null ? `${fmt(it.salePrice)} (gốc ${fmt(it.originalPrice)})` : '';
            const disc = it.discountType ? `${it.discountType} ${it.discountValue}${it.maxDiscount ? ` max ${fmt(it.maxDiscount)}` : ''}${it.minSpend ? ` từ ${fmt(it.minSpend)}` : ''}` : '';
            console.log(`   • [${it.type}] ${it.title.slice(0, 70)} ${it.code ? `(${it.code}) ` : ''}${price}${disc}`);
          }
          if ((r.items?.length ?? 0) > 15) console.log(`   … và ${r.items!.length - 15} bản ghi khác`);
        }
        break;
      }
      case 'search': {
        if (!arg) throw new Error('Thiếu từ khoá');
        const kind = (values.kind ?? 'product') as SearchKind;
        const district = values.district as HanoiDistrict | undefined;
        if (district && !(district in HANOI_DISTRICTS)) throw new Error(`Quận không hợp lệ. Có: ${Object.keys(HANOI_DISTRICTS).join(', ')}`);
        const platforms = values.platforms?.split(',') as Platform[] | undefined;
        const ctx = createContext(browser, { priority: 10 });
        const results = await runSearch({ query: arg, kind, district, platforms }, ctx, {
          onPlatformDone: (p, n, err) => console.error(`  ${p}: ${err ? `lỗi — ${err}` : `${n} kết quả`}`),
        });
        if (values.json) {
          console.log(JSON.stringify(results, null, 2));
          break;
        }
        console.log(`\nKết quả cho "${arg}" (xếp theo giá cuối ước tính):`);
        for (const r of results.slice(0, 20)) {
          const codes = r.best.applied.map((a) => `${a.voucher.code ?? a.voucher.title} -${fmt(a.amount)}`).join(', ');
          console.log(
            `${r.isOutlier ? '?' : r.matchScore >= 0.7 ? '★' : ' '} ${r.listing.platform.padEnd(8)} ${fmt(r.best.finalPrice).padStart(13)}  (giá ${fmt(r.listing.price)}${r.listing.shippingFee != null ? ` + ship ${fmt(r.listing.shippingFee)}` : ''})  ${r.listing.title.slice(0, 60)}`,
          );
          if (codes) console.log(`             mã: ${codes}`);
        }
        break;
      }
      case 'login': {
        const platform = arg as Platform;
        if (!PLATFORMS.includes(platform)) throw new Error(`Sàn không hợp lệ: ${PLATFORMS.join(', ')}`);
        const home: Record<Platform, string> = {
          shopee: 'https://shopee.vn/buyer/login',
          lazada: 'https://member.lazada.vn/user/login',
          tiktok: 'https://www.tiktok.com/login',
          tiki: 'https://tiki.vn',
          grabfood: 'https://food.grab.com/vn/vi/',
          be: 'https://be.com.vn',
        };
        const ctx = await chromium.launchPersistentContext(browser.profileDir(platform), {
          headless: false,
          channel: env.BROWSER_CHANNEL,
          locale: 'vi-VN',
          timezoneId: 'Asia/Ho_Chi_Minh',
          viewport: null,
        });
        const page = ctx.pages()[0] ?? (await ctx.newPage());
        await page.goto(home[platform]);
        console.log(`Đã mở ${platform}. Đăng nhập xong thì đóng cửa sổ trình duyệt để lưu phiên.`);
        await new Promise<void>((resolve) => ctx.on('close', () => resolve()));
        break;
      }
      case 'recon': {
        if (!arg) throw new Error('Thiếu URL');
        const pool = new BrowserPool();
        const platform = (PLATFORMS.find((p) => arg.includes(p === 'grabfood' ? 'grab' : p)) ?? 'tiki') as Platform;
        await pool.withPage(platform, async (page) => {
          page.on('response', async (res) => {
            const ct = res.headers()['content-type'] ?? '';
            if (!ct.includes('json')) return;
            if (values.match && !res.url().includes(values.match)) return;
            const body = await res.text().catch(() => '');
            console.log(`${res.status()} ${res.request().method()} ${res.url().slice(0, 200)}  [${body.length}B] ${body.slice(0, 160).replace(/\s+/g, ' ')}`);
          });
          await page.goto(arg, { waitUntil: 'domcontentloaded', timeout: 45_000 });
          for (let i = 0; i < 8; i++) {
            await page.mouse.wheel(0, 1000);
            await page.waitForTimeout(800);
          }
          await page.waitForTimeout(3000);
        });
        await pool.closeAll();
        break;
      }
      case 'reclassify': {
        const shops = await refreshShopCategories();
        const changed = await reclassifyAll();
        console.log(`Shop đã suy ra nhóm: ${shops} · khuyến mãi đổi nhóm: ${changed.promotions} · sản phẩm đổi nhóm: ${changed.products}`);
        break;
      }
      case 'make-admin': {
        const email = arg?.trim().toLowerCase();
        if (!email || !email.includes('@')) throw new Error('Thiếu email');
        let userId: string | undefined;
        for (let page = 1; page <= 20 && !userId; page++) {
          const { data, error } = await db().auth.admin.listUsers({ page, perPage: 200 });
          if (error) throw error;
          userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id;
          if (data.users.length < 200) break;
        }
        if (!userId) {
          const { data, error } = await db().auth.admin.createUser({ email, email_confirm: true });
          if (error) throw error;
          userId = data.user.id;
          console.log(`Đã tạo tài khoản ${email}`);
        }
        const { error } = await db().from('admins').upsert({ user_id: userId });
        if (error) throw error;
        console.log(`${email} đã là quản trị. Đăng nhập tại <web>/login bằng link gửi qua email.`);
        break;
      }
      case 'telegram-webhook': {
        if (!env.TELEGRAM_BOT_TOKEN) throw new Error('Thiếu TELEGRAM_BOT_TOKEN trong .env');
        if (!arg?.startsWith('https://')) throw new Error('Cần URL https của web, vd https://ten-app.vercel.app');
        const secret = env.TELEGRAM_WEBHOOK_SECRET;
        if (!secret) {
          console.log(`Thiếu TELEGRAM_WEBHOOK_SECRET. Thêm dòng sau vào .env (worker) VÀ biến môi trường của web trên Vercel rồi chạy lại:\nTELEGRAM_WEBHOOK_SECRET=${randomBytes(24).toString('hex')}`);
          break;
        }
        const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: `${arg.replace(/\/$/, '')}/api/telegram/webhook`, secret_token: secret, allowed_updates: ['message'] }),
        });
        console.log(await res.text());
        break;
      }
      default:
        console.log(HELP);
    }
  } finally {
    await browser.closeAll();
  }
}

main().catch((err) => {
  logger.error({ err }, 'cli failed');
  process.exitCode = 1;
});
