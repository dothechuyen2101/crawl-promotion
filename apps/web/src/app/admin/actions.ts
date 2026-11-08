'use server';
import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { PLATFORMS, SEARCH_KINDS, type Platform, type SearchKind } from '@cp/shared';
import { serverClient } from '@/lib/supabase/server';

/** Mọi action dùng phiên người dùng; RLS chỉ cho admin ghi các bảng này. */
async function db() {
  const client = await serverClient();
  const { data } = await client.rpc('is_admin');
  if (!data) redirect('/login');
  return client;
}

export async function toggleSource(form: FormData) {
  const sourceId = String(form.get('source_id'));
  const enabled = form.get('enabled') === 'true';
  const client = await db();
  await client.from('source_settings').upsert({ source_id: sourceId, enabled, updated_at: new Date().toISOString() });
  revalidatePath('/admin');
}

export async function addWatchQuery(form: FormData) {
  const query = String(form.get('query') ?? '').trim().slice(0, 100);
  if (query.length < 2) return;
  const p = String(form.get('platform') ?? '');
  const k = String(form.get('kind') ?? 'product');
  const client = await db();
  await client.from('watch_queries').insert({
    query,
    platform: PLATFORMS.includes(p as Platform) ? (p as Platform) : null,
    kind: SEARCH_KINDS.includes(k as SearchKind) ? (k as SearchKind) : 'product',
  });
  revalidatePath('/admin');
}

export async function toggleWatchQuery(form: FormData) {
  const client = await db();
  await client.from('watch_queries').update({ enabled: form.get('enabled') === 'true' }).eq('id', Number(form.get('id')));
  revalidatePath('/admin');
}

export async function deleteWatchQuery(form: FormData) {
  const client = await db();
  await client.from('watch_queries').delete().eq('id', Number(form.get('id')));
  revalidatePath('/admin');
}

export interface ApiKeyState {
  key?: string;
  error?: string;
}

export async function createApiKey(_prev: ApiKeyState, form: FormData): Promise<ApiKeyState> {
  const name = String(form.get('name') ?? '').trim().slice(0, 60);
  if (!name) return { error: 'Nhập tên cho key' };
  const key = `cp_${randomBytes(24).toString('base64url')}`;
  const client = await db();
  const { error } = await client.from('api_keys').insert({ name, key_hash: createHash('sha256').update(key).digest('hex') });
  if (error) return { error: error.message };
  revalidatePath('/admin');
  return { key };
}

export async function revokeApiKey(form: FormData) {
  const client = await db();
  await client.from('api_keys').update({ revoked: true }).eq('id', Number(form.get('id')));
  revalidatePath('/admin');
}

export async function logout() {
  const client = await serverClient();
  await client.auth.signOut();
  redirect('/login');
}
