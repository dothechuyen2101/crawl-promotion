'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { hashKey, requestSearch, SearchInputSchema, splitUrl } from '@/lib/search';

export interface SearchFormState {
  error?: string;
}

export async function createSearch(_prev: SearchFormState, form: FormData): Promise<SearchFormState> {
  const { query, inputUrl } = splitUrl(String(form.get('q') ?? ''), undefined);
  const parsed = SearchInputSchema.safeParse({
    query,
    inputUrl,
    kind: form.get('kind') ?? 'product',
    district: form.get('district') || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' };

  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
  const res = await requestSearch(parsed.data, { rateKey: `web:${hashKey(ip)}` });
  if ('error' in res) return { error: res.error };
  redirect(`/tim-gia/${res.id}`);
}
