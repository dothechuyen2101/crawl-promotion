import { NextResponse, type NextRequest } from 'next/server';
import { checkApiKey, searchParamsRecord } from '@/lib/apikey';
import { listPromotions, parseFilter } from '@/lib/promotions';
import { adminClient } from '@/lib/supabase/admin';

/**
 * GET /api/v1/promotions?loai=voucher&san=shopee&q=tai+nghe&sx=giam&trang=1&limit=50
 * loai: voucher|flash_sale|deal|campaign · san: shopee|tiktok|lazada|tiki|grabfood|be · sx: moi|giam|sap-het
 */
export async function GET(req: NextRequest) {
  const auth = await checkApiKey(req);
  if (!auth.ok) return auth.res;
  const sp = searchParamsRecord(req);
  const f = parseFilter(sp);
  const limit = Math.min(Math.max(Number(sp.limit ?? 50) || 50, 1), 200);
  const { items, total, page, pageSize } = await listPromotions(adminClient(), { ...f, pageSize: limit });
  return NextResponse.json({ data: items, page, pageSize, total });
}
