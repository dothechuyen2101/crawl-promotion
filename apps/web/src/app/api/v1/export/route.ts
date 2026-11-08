import ExcelJS from 'exceljs';
import { NextResponse, type NextRequest } from 'next/server';
import { checkApiKey, searchParamsRecord } from '@/lib/apikey';
import { listPromotions, parseFilter, type PromoListItem } from '@/lib/promotions';
import { adminClient } from '@/lib/supabase/admin';

const MAX_ROWS = 5000;
const COLUMNS: (keyof PromoListItem)[] = [
  'id', 'platform', 'type', 'title', 'code', 'discount_type', 'discount_value', 'max_discount', 'min_spend',
  'sale_price', 'original_price', 'discount_pct', 'start_at', 'end_at', 'shop_name', 'url', 'affiliate_url',
];

const csvCell = (v: unknown) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** GET /api/v1/export?format=csv|xlsx (+ cùng bộ lọc như /api/v1/promotions), tối đa 5000 dòng. */
export async function GET(req: NextRequest) {
  const auth = await checkApiKey(req);
  if (!auth.ok) return auth.res;
  const sp = searchParamsRecord(req);
  const format = sp.format === 'xlsx' ? 'xlsx' : 'csv';
  const f = parseFilter(sp);
  const rows: PromoListItem[] = [];
  for (let page = 1; rows.length < MAX_ROWS; page++) {
    const { items } = await listPromotions(adminClient(), { ...f, page, pageSize: 1000 });
    rows.push(...items);
    if (items.length < 1000) break;
  }
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    const body = '﻿' + [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(','))].join('\r\n');
    return new NextResponse(body, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="khuyen-mai-${stamp}.csv"`,
      },
    });
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Khuyến mãi');
  ws.columns = COLUMNS.map((c) => ({ header: c, key: c, width: c === 'title' ? 60 : c.includes('url') ? 40 : 16 }));
  ws.addRows(rows.map((r) => Object.fromEntries(COLUMNS.map((c) => [c, r[c] as unknown]))));
  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="khuyen-mai-${stamp}.xlsx"`,
    },
  });
}
