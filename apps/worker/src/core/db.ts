import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@cp/shared/database';
import { env, hasDatabase } from '../config.ts';

export type Db = SupabaseClient<Database>;
let client: Db | null = null;

/** Supabase client dùng service role (bỏ qua RLS). Chỉ tồn tại trên máy chạy worker. */
export function db(): Db {
  if (!hasDatabase) {
    throw new Error('Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY trong apps/worker/.env');
  }
  client ??= createClient<Database>(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/** Ném lỗi nếu response của supabase-js có error hoặc không có data. */
export function must<R extends { data: unknown; error: { message: string } | null }>(res: R, what: string): NonNullable<R['data']> {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data == null) throw new Error(`${what}: không có dữ liệu`);
  return res.data as NonNullable<R['data']>;
}

/** Ném lỗi nếu response có error (dùng cho insert/update không select). */
export function check(res: { error: { message: string } | null }, what: string): void {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
}
