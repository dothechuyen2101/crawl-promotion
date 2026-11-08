import { createHash } from 'node:crypto';
import { HANOI_DISTRICTS, normalizeText, type HanoiDistrict, type SearchKind } from '@cp/shared';
import { z } from 'zod';
import { adminClient } from './supabase/admin';

export const CACHE_MINUTES = 30;
export const SEARCH_LIMIT_PER_HOUR = 10;
/** Worker coi là offline nếu không có heartbeat trong khoảng này. */
export const WORKER_STALE_MS = 3 * 60_000;

export const SearchInputSchema = z
  .object({
    query: z.string().trim().max(200).default(''),
    inputUrl: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .transform((v) => (v ? v : undefined))
      .refine((v) => !v || /^https?:\/\//.test(v), 'Link không hợp lệ'),
    kind: z.enum(['product', 'food']).default('product'),
    district: z
      .string()
      .optional()
      .transform((v) => (v && v in HANOI_DISTRICTS ? (v as HanoiDistrict) : undefined)),
  })
  .refine((v) => v.query.length >= 2 || v.inputUrl, { message: 'Nhập tên sản phẩm (ít nhất 2 ký tự) hoặc dán link' });

export type SearchInput = z.output<typeof SearchInputSchema>;

/** Nếu người dùng dán link vào ô tìm kiếm thì tách ra thành inputUrl. */
export function splitUrl(query: string, inputUrl?: string) {
  if (!inputUrl && /^https?:\/\//.test(query.trim())) return { query: '', inputUrl: query.trim() };
  return { query, inputUrl };
}

export function cacheKey(i: { query: string; inputUrl?: string; kind: SearchKind; district?: string }) {
  return [i.kind, i.district ?? '', normalizeText(i.query), i.inputUrl ?? ''].join('|');
}

export function hashKey(s: string) {
  return createHash('sha256').update(`${process.env.RATE_LIMIT_SALT ?? 'crawl-promotion'}|${s}`).digest('hex').slice(0, 32);
}

export type RequestSearchResult = { id: string; cached: boolean } | { error: string };

/**
 * Tạo yêu cầu tìm giá cho worker. Dùng lại kết quả của cùng truy vấn trong 30 phút
 * (không tính lượt), sau đó mới kiểm tra giới hạn lượt theo `rateKey`.
 */
export async function requestSearch(
  input: SearchInput,
  opts: { rateKey: string; limit?: number; notifyChatId?: number; skipCache?: boolean },
): Promise<RequestSearchResult> {
  const db = adminClient();
  const key = cacheKey(input);
  if (!opts.skipCache) {
    const since = new Date(Date.now() - CACHE_MINUTES * 60_000).toISOString();
    const { data: hit } = await db
      .from('search_requests')
      .select('id')
      .eq('cache_key', key)
      .in('status', ['pending', 'running', 'done', 'partial'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (hit) return { id: hit.id, cached: true };
  }

  const { data: allowed, error: rlError } = await db.rpc('hit_rate_limit', {
    p_bucket: opts.rateKey,
    p_limit: opts.limit ?? SEARCH_LIMIT_PER_HOUR,
    p_window_seconds: 3600,
  });
  if (rlError) return { error: 'Không kiểm tra được giới hạn lượt, thử lại sau.' };
  if (!allowed) return { error: `Bạn đã tìm quá ${opts.limit ?? SEARCH_LIMIT_PER_HOUR} lần trong 1 giờ. Vui lòng thử lại sau.` };

  const { data, error } = await db
    .from('search_requests')
    .insert({
      query: input.query || input.inputUrl || '',
      input_url: input.inputUrl ?? null,
      kind: input.kind,
      district: input.district ?? null,
      cache_key: key,
      notify_chat_id: opts.notifyChatId ?? null,
    })
    .select('id')
    .single();
  if (error || !data) return { error: 'Không tạo được yêu cầu tìm kiếm.' };
  return { id: data.id, cached: false };
}

export async function workerOnline(): Promise<boolean> {
  const { data } = await adminClient()
    .from('worker_heartbeat')
    .select('last_seen_at')
    .order('last_seen_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return !!data && Date.now() - new Date(data.last_seen_at).getTime() < WORKER_STALE_MS;
}
