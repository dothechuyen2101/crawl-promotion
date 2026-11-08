import { NextResponse, type NextRequest } from 'next/server';
import { checkApiKey, searchParamsRecord } from '@/lib/apikey';
import { HIGH_MATCH, RESULT_COLUMNS } from '@/lib/results';
import { requestSearch, SearchInputSchema, splitUrl } from '@/lib/search';
import { adminClient } from '@/lib/supabase/admin';

/**
 * Tạo yêu cầu:  GET /api/v1/best-price?q=tai+nghe+sony&kind=product   → 202 { id, status }
 * Lấy kết quả:  GET /api/v1/best-price?id=<id>                          → { status, results[] } (xếp theo final_price)
 */
export async function GET(req: NextRequest) {
  const auth = await checkApiKey(req);
  if (!auth.ok) return auth.res;
  const sp = searchParamsRecord(req);
  const db = adminClient();

  if (sp.id) {
    const { data: r } = await db
      .from('search_requests')
      .select('id, query, kind, district, status, platforms_done, error, created_at, finished_at')
      .eq('id', sp.id)
      .maybeSingle();
    if (!r) return NextResponse.json({ error: 'Không tìm thấy yêu cầu' }, { status: 404 });
    const { data: results } = await db
      .from('search_results')
      .select(`${RESULT_COLUMNS}, best_combo, final_price`)
      .eq('request_id', sp.id);
    // Nhóm khớp cao (match_score ≥ 0.6, giá không bất thường) lên trước, trong nhóm xếp theo giá cuối.
    const ranked = (results ?? [])
      .map((x) => ({ ...x, good: Number(x.match_score) >= HIGH_MATCH && !x.is_outlier }))
      .sort((a, b) => Number(b.good) - Number(a.good) || Number(a.final_price) - Number(b.final_price));
    return NextResponse.json({ ...r, results: ranked });
  }

  const { query, inputUrl } = splitUrl(sp.q ?? '', sp.url);
  const parsed = SearchInputSchema.safeParse({ query, inputUrl, kind: sp.kind, district: sp.district });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  const res = await requestSearch(parsed.data, { rateKey: `api:${auth.keyId}`, limit: 60 });
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: 429 });
  return NextResponse.json(
    { id: res.id, cached: res.cached, poll: `/api/v1/best-price?id=${res.id}` },
    { status: res.cached ? 200 : 202 },
  );
}
