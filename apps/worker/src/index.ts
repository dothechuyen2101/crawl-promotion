import { Cron } from 'croner';
import { env, hasDatabase } from './config.ts';
import { BrowserPool } from './core/browser.ts';
import { createContext } from './core/context.ts';
import { db } from './core/db.ts';
import { queueStats } from './core/limiter.ts';
import { notifyNewPromotions } from './core/notifier.ts';
import { runSource } from './core/runner.ts';
import { logger } from './logger.ts';
import { SearchService } from './search/service.ts';
import { SOURCES } from './sources/index.ts';

const VERSION = '0.1.0';

async function heartbeat() {
  await db()
    .from('worker_heartbeat')
    .upsert({
      worker_id: env.WORKER_ID,
      last_seen_at: new Date().toISOString(),
      version: VERSION,
      info: { queues: queueStats(), uptimeSec: Math.round(process.uptime()), sources: SOURCES.length },
    });
}

async function main() {
  if (!hasDatabase) {
    logger.error('Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Dùng "pnpm worker cli run --dry-run" để chạy thử không cần DB.');
    process.exit(1);
  }
  const abort = new AbortController();
  const browser = new BrowserPool();
  const crawlCtx = createContext(browser, { priority: 0, signal: abort.signal });
  const searchCtx = createContext(browser, { priority: 10, signal: abort.signal });

  const jobs: Cron[] = [];
  for (const source of SOURCES) {
    const off = source.disabledReason?.();
    if (off) {
      logger.warn({ source: source.id, reason: off }, 'source disabled');
      continue;
    }
    jobs.push(
      new Cron(source.schedule, { name: source.id, timezone: 'Asia/Ho_Chi_Minh', protect: true }, async () => {
        const r = await runSource(source, crawlCtx);
        if (r.inserted > 0) await notifyNewPromotions().catch((err) => logger.warn({ err }, 'notify failed'));
      }),
    );
  }
  logger.info({ jobs: jobs.map((j) => `${j.name} → ${j.nextRun()?.toISOString()}`) }, 'scheduler started');

  // Lần khởi động: chạy mỗi nguồn 1 lần (cách nhau vài giây) để có dữ liệu ngay.
  void (async () => {
    for (const j of jobs) {
      if (abort.signal.aborted) return;
      await j.trigger();
      await new Promise((r) => setTimeout(r, 3000));
    }
  })();

  const search = new SearchService(searchCtx);
  search.start();

  await heartbeat().catch((err) => logger.warn({ err }, 'heartbeat failed'));
  const hb = setInterval(() => void heartbeat().catch((err) => logger.warn({ err }, 'heartbeat failed')), 60_000);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    abort.abort();
    clearInterval(hb);
    jobs.forEach((j) => j.stop());
    await search.stop();
    await browser.closeAll();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'worker crashed');
  process.exit(1);
});
