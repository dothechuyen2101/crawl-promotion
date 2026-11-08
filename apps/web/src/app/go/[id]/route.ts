import { NextResponse, type NextRequest } from 'next/server';
import { adminClient } from '@/lib/supabase/admin';

/**
 * Chuyển hướng tới sàn (ưu tiên link affiliate) và ghi nhận click.
 * id dạng uuid = khuyến mãi; id dạng số = kết quả tìm giá.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  let target: string | null = null;
  let row: { promotion_id?: string; search_result_id?: number; platform?: string } = {};

  if (/^\d+$/.test(id)) {
    const { data } = await db.from('search_results').select('id, url, platform').eq('id', Number(id)).maybeSingle();
    if (data) {
      target = data.url;
      row = { search_result_id: data.id, platform: data.platform };
    }
  } else if (/^[0-9a-f-]{36}$/i.test(id)) {
    const { data } = await db.from('promotions').select('id, url, affiliate_url, platform').eq('id', id).maybeSingle();
    if (data) {
      target = data.affiliate_url ?? data.url;
      row = { promotion_id: data.id, platform: data.platform };
    }
  }
  if (!target || !/^https?:\/\//.test(target)) return NextResponse.redirect(new URL('/', req.url));

  await db.from('clicks').insert({
    promotion_id: row.promotion_id ?? null,
    search_result_id: row.search_result_id ?? null,
    platform: (row.platform as never) ?? null,
    target_url: target,
    referrer: req.headers.get('referer')?.slice(0, 500) ?? null,
  });
  return NextResponse.redirect(target, 302);
}
