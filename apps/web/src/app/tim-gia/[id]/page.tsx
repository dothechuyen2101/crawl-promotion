import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SearchForm } from '@/components/search-form';
import { SearchResults, type SearchRequestInfo } from '@/components/search-results';
import { fallbackResults } from '@/lib/fallback';
import { RESULT_COLUMNS, toResultRow, type ResultRow } from '@/lib/results';
import { workerOnline } from '@/lib/search';
import { serverClient } from '@/lib/supabase/server';

type Props = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await serverClient();
  const { data } = await db
    .from('search_requests')
    .select('id, query, input_url, kind, district, status, platforms_done, error')
    .eq('id', id)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await load((await params).id);
  return { title: r ? `Giá rẻ nhất: ${r.query}` : 'Tìm giá rẻ nhất', robots: { index: false } };
}

export default async function SearchResultPage({ params }: Props) {
  const { id } = await params;
  const req = await load(id);
  if (!req) notFound();
  const db = await serverClient();
  const [{ data: results }, online] = await Promise.all([
    db.from('search_results').select(RESULT_COLUMNS).eq('request_id', id),
    workerOnline().catch(() => false),
  ]);
  let rows: ResultRow[] = (results ?? []).map((r) => toResultRow(r as Record<string, unknown>));
  let fallback = false;
  if (!online && rows.length === 0 && req.kind === 'product') {
    rows = await fallbackResults(req.query);
    fallback = true;
  }

  const info: SearchRequestInfo = {
    id: req.id,
    query: req.query,
    kind: req.kind,
    status: req.status,
    platforms_done: req.platforms_done,
    error: req.error,
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 py-2">
      <div className="space-y-1">
        <Link href="/tim-gia" className="text-sm text-muted hover:text-fg">
          ← Tìm sản phẩm khác
        </Link>
        <h1 className="text-xl font-bold">
          Giá rẻ nhất cho “{req.query}”
        </h1>
        {req.input_url && (
          <p className="truncate text-xs text-muted">
            Từ link: <a href={req.input_url} className="underline" rel="nofollow noopener" target="_blank">{req.input_url}</a>
          </p>
        )}
      </div>
      <SearchResults request={info} initialResults={rows} online={online} fallback={fallback} />
      <div className="border-t border-line pt-5">
        <SearchForm compact />
      </div>
    </div>
  );
}
