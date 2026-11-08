import type { SearchKind } from '@cp/shared';
import { hasDatabase } from '../config.ts';
import { logger } from '../logger.ts';
import { BrowserPool } from './browser.ts';
import { db } from './db.ts';
import type { CrawlContext, WatchQuery } from './types.ts';

/** Dùng khi chưa có DB (chạy thử --dry-run). */
const DEFAULT_WATCH: WatchQuery[] = [
  { platform: null, query: 'tai nghe bluetooth', kind: 'product' },
  { platform: null, query: 'nồi chiên không dầu', kind: 'product' },
  { platform: 'grabfood', query: 'trà sữa', kind: 'food' },
];

let cache: { at: number; list: WatchQuery[] } | null = null;

async function loadWatchQueries(): Promise<WatchQuery[]> {
  if (!hasDatabase) return DEFAULT_WATCH;
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.list;
  const { data, error } = await db().from('watch_queries').select('platform, query, kind').eq('enabled', true);
  if (error) {
    logger.warn({ error: error.message }, 'load watch_queries failed, dùng mặc định');
    return DEFAULT_WATCH;
  }
  cache = { at: Date.now(), list: data as WatchQuery[] };
  return cache.list;
}

export function createContext(browser: BrowserPool, opts: { priority?: number; signal?: AbortSignal } = {}): CrawlContext {
  return {
    log: logger,
    browser,
    signal: opts.signal ?? new AbortController().signal,
    priority: opts.priority ?? 0,
    async watchQueries(kind?: SearchKind) {
      const list = await loadWatchQueries();
      return kind ? list.filter((q) => q.kind === kind) : list;
    },
  };
}
