import { NormalizedPromotionSchema, type NormalizedPromotion } from '@cp/shared';
import { hasDatabase } from '../config.ts';
import { logger } from '../logger.ts';
import { db, must } from './db.ts';
import { upsertProductsFrom, upsertPromotions } from './store.ts';
import { alertAdmin, escapeHtml } from './telegram.ts';
import type { CrawlContext, Source } from './types.ts';

const FLUSH_SIZE = 200;
/** Gửi cảnh báo khi một nguồn lỗi liên tiếp đủ số lần này. */
const ALERT_AFTER_FAILURES = 3;

export interface RunSummary {
  sourceId: string;
  status: 'success' | 'error' | 'skipped';
  found: number;
  invalid: number;
  inserted: number;
  updated: number;
  durationMs: number;
  error?: string;
  /** Chỉ có khi dryRun. */
  items?: NormalizedPromotion[];
}

export interface RunOptions {
  dryRun?: boolean;
  /** Dừng sau khi lấy đủ số bản ghi này (dùng để thử nhanh). */
  limit?: number;
}

async function isEnabled(sourceId: string): Promise<boolean> {
  const { data } = await db().from('source_settings').select('enabled').eq('source_id', sourceId).maybeSingle();
  return data?.enabled ?? true;
}

export async function runSource(source: Source, ctx: CrawlContext, opts: RunOptions = {}): Promise<RunSummary> {
  const started = Date.now();
  const log = ctx.log.child({ source: source.id });
  const persist = !opts.dryRun && hasDatabase;
  const summary: RunSummary = {
    sourceId: source.id, status: 'success', found: 0, invalid: 0, inserted: 0, updated: 0, durationMs: 0,
  };

  const disabled = source.disabledReason?.();
  if (disabled) {
    log.debug({ reason: disabled }, 'source disabled');
    return { ...summary, status: 'skipped', error: disabled };
  }
  if (persist && !(await isEnabled(source.id))) {
    return { ...summary, status: 'skipped', error: 'tắt trong dashboard' };
  }

  let runId: number | null = null;
  if (persist) {
    const row = must(
      await db().from('crawl_runs').insert({ source_id: source.id }).select('id').single(),
      'insert crawl_runs',
    );
    runId = row.id;
  }

  const collected: NormalizedPromotion[] = [];
  let buffer: NormalizedPromotion[] = [];
  const flush = async () => {
    if (!buffer.length) return;
    const batch = buffer;
    buffer = [];
    if (persist) {
      const s = await upsertPromotions(batch, source.id);
      summary.inserted += s.inserted;
      summary.updated += s.updated;
      await upsertProductsFrom(batch);
    }
  };

  try {
    for await (const raw of source.run(ctx)) {
      const parsed = NormalizedPromotionSchema.safeParse(raw);
      if (!parsed.success) {
        summary.invalid++;
        if (summary.invalid <= 3) log.warn({ issues: parsed.error.issues.slice(0, 3), raw: { ...raw, raw: undefined } }, 'invalid item');
        continue;
      }
      summary.found++;
      if (opts.dryRun) collected.push(parsed.data);
      buffer.push(parsed.data);
      if (buffer.length >= FLUSH_SIZE) await flush();
      if (opts.limit && summary.found >= opts.limit) break;
    }
    await flush();
    if (summary.found === 0 && !source.allowEmpty) {
      throw new Error(`Không lấy được bản ghi nào (${summary.invalid} bản ghi không hợp lệ) — có thể sàn đã đổi API hoặc chặn`);
    }
  } catch (err) {
    summary.status = 'error';
    summary.error = err instanceof Error ? err.message : String(err);
    log.error({ err }, 'source failed');
  }

  summary.durationMs = Date.now() - started;
  if (opts.dryRun) summary.items = collected;

  if (persist && runId != null) {
    await db()
      .from('crawl_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: summary.status === 'error' ? 'error' : 'success',
        found: summary.found,
        inserted: summary.inserted,
        updated: summary.updated,
        invalid: summary.invalid,
        error: summary.error ?? null,
      })
      .eq('id', runId);
    await recordHealth(source, summary);
  }
  log.info(
    { status: summary.status, found: summary.found, inserted: summary.inserted, updated: summary.updated, ms: summary.durationMs },
    'source finished',
  );
  return summary;
}

async function recordHealth(source: Source, summary: RunSummary) {
  const { data: prev } = await db()
    .from('source_settings')
    .select('consecutive_failures')
    .eq('source_id', source.id)
    .maybeSingle();
  const failures = summary.status === 'error' ? (prev?.consecutive_failures ?? 0) + 1 : 0;
  await db()
    .from('source_settings')
    .upsert({
      source_id: source.id,
      consecutive_failures: failures,
      ...(summary.status === 'success' ? { last_success_at: new Date().toISOString(), last_error: null } : { last_error: summary.error }),
      updated_at: new Date().toISOString(),
    });
  if (failures === ALERT_AFTER_FAILURES || (failures > ALERT_AFTER_FAILURES && failures % 20 === 0)) {
    logger.warn({ source: source.id, failures }, 'alerting admin');
    await alertAdmin(
      `⚠️ <b>${escapeHtml(source.id)}</b> lỗi ${failures} lần liên tiếp\n<code>${escapeHtml((summary.error ?? '').slice(0, 500))}</code>`,
    );
  }
}
