import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { adminClient } from './supabase/admin';

export type ApiAuth = { ok: true; keyId: number } | { ok: false; res: NextResponse };

/** Xác thực header x-api-key (lưu dạng sha256 trong bảng api_keys). */
export async function checkApiKey(req: NextRequest): Promise<ApiAuth> {
  const key = req.headers.get('x-api-key');
  if (!key) return { ok: false, res: NextResponse.json({ error: 'Thiếu header x-api-key' }, { status: 401 }) };
  const db = adminClient();
  const { data } = await db
    .from('api_keys')
    .select('id, revoked')
    .eq('key_hash', createHash('sha256').update(key).digest('hex'))
    .maybeSingle();
  if (!data || data.revoked) return { ok: false, res: NextResponse.json({ error: 'API key không hợp lệ' }, { status: 401 }) };
  void db.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id).then(() => {});
  return { ok: true, keyId: data.id };
}

export const searchParamsRecord = (req: NextRequest) => Object.fromEntries(new URL(req.url).searchParams) as Record<string, string>;
