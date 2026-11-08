import { join } from 'node:path';
import { chromium, type BrowserContext, type Page, type Response } from 'playwright';
import type { Platform } from '@cp/shared';
import { env, headless, proxyFor } from '../config.ts';
import { logger } from '../logger.ts';
import { queueFor } from './limiter.ts';

const IDLE_CLOSE_MS = 10 * 60_000;

interface Entry {
  ctx: BrowserContext;
  lastUsed: number;
  open: number;
}

/**
 * Mỗi sàn một Chrome profile riêng (persistent context) để giữ cookie/phiên đăng nhập
 * giữa các lần chạy. Profile nằm trong DATA_DIR/profiles/<sàn>.
 */
export class BrowserPool {
  private entries = new Map<Platform, Entry>();
  private launching = new Map<Platform, Promise<Entry>>();
  private sweeper = setInterval(() => void this.sweep(), 60_000).unref();

  profileDir(platform: Platform) {
    return join(env.DATA_DIR, 'profiles', platform);
  }

  private async launch(platform: Platform): Promise<Entry> {
    const proxy = proxyFor(platform);
    const ctx = await chromium.launchPersistentContext(this.profileDir(platform), {
      headless,
      channel: env.BROWSER_CHANNEL,
      locale: 'vi-VN',
      timezoneId: 'Asia/Ho_Chi_Minh',
      viewport: { width: 1366, height: 820 },
      proxy: proxy ? { server: proxy } : undefined,
      args: ['--no-default-browser-check'],
    });
    ctx.on('close', () => this.entries.delete(platform));
    logger.debug({ platform }, 'browser launched');
    return { ctx, lastUsed: Date.now(), open: 0 };
  }

  async context(platform: Platform): Promise<Entry> {
    const existing = this.entries.get(platform);
    if (existing) return existing;
    let p = this.launching.get(platform);
    if (!p) {
      p = this.launch(platform).finally(() => this.launching.delete(platform));
      this.launching.set(platform, p);
    }
    const entry = await p;
    this.entries.set(platform, entry);
    return entry;
  }

  /** Mở 1 tab, chạy `fn`, đóng tab. Đi qua hàng đợi của sàn để giới hạn số tab song song. */
  async withPage<T>(platform: Platform, fn: (page: Page) => Promise<T>, opts: { priority?: number } = {}): Promise<T> {
    return queueFor(platform).add(
      async () => {
        const entry = await this.context(platform);
        entry.open++;
        entry.lastUsed = Date.now();
        const page = await entry.ctx.newPage();
        try {
          return await fn(page);
        } finally {
          entry.open--;
          entry.lastUsed = Date.now();
          await page.close().catch(() => {});
        }
      },
      { priority: opts.priority ?? 0 },
    );
  }

  private async sweep() {
    const now = Date.now();
    for (const [platform, e] of this.entries) {
      if (e.open === 0 && now - e.lastUsed > IDLE_CLOSE_MS) {
        this.entries.delete(platform);
        await e.ctx.close().catch(() => {});
        logger.debug({ platform }, 'browser closed (idle)');
      }
    }
  }

  async closeAll() {
    clearInterval(this.sweeper);
    await Promise.all([...this.entries.values()].map((e) => e.ctx.close().catch(() => {})));
    this.entries.clear();
  }
}

export interface CapturedJson {
  url: string;
  status: number;
  data: unknown;
}

/**
 * Bắt các response JSON có URL khớp `match` trong khi chạy `action` (thường là page.goto/cuộn trang).
 * Đây là cách lấy dữ liệu từ sàn chống bot: để trình duyệt thật tự ký request, ta chỉ đọc kết quả.
 */
export async function captureJson(
  page: Page,
  match: (url: string) => boolean,
  action: () => Promise<unknown>,
  opts: { settleMs?: number; timeoutMs?: number; minCount?: number } = {},
): Promise<CapturedJson[]> {
  const out: CapturedJson[] = [];
  const pending: Promise<void>[] = [];
  const onResponse = (res: Response) => {
    const url = res.url();
    if (!match(url)) return;
    pending.push(
      res
        .json()
        .then((data) => void out.push({ url, status: res.status(), data }))
        .catch(() => {}),
    );
  };
  page.on('response', onResponse);
  try {
    await action();
    const deadline = Date.now() + (opts.timeoutMs ?? 15_000);
    const minCount = opts.minCount ?? 1;
    while (out.length < minCount && Date.now() < deadline) {
      await page.waitForTimeout(250);
      await Promise.all(pending);
    }
    if (opts.settleMs) await page.waitForTimeout(opts.settleMs);
    await Promise.all(pending);
  } finally {
    page.off('response', onResponse);
  }
  return out;
}

/** Cuộn trang từ từ để kích hoạt lazy-load. */
export async function autoScroll(page: Page, steps = 6, stepPx = 900, delayMs = 600) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, stepPx);
    await page.waitForTimeout(delayMs + Math.random() * 300);
  }
}
