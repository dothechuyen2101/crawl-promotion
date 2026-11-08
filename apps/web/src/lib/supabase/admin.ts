import { createClient } from '@supabase/supabase-js';
import type { Database } from '@cp/shared/database';

let client: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Client dùng secret key (bỏ qua RLS). CHỈ dùng phía server (route handler, server action).
 * Không bao giờ import file này từ component 'use client'.
 */
export function adminClient() {
  if (typeof window !== 'undefined') throw new Error('adminClient chỉ dùng phía server');
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Thiếu SUPABASE_SECRET_KEY');
  client ??= createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
