import { load } from 'cheerio';
import { foldVietnamese, parseMinSpend, parseVnd } from '@cp/shared';

/** Unix giây (hoặc mili giây) → Date; 0/null → null. */
export function fromEpoch(v: number | string | null | undefined): Date | null {
  const n = typeof v === 'string' ? Number(v) : v;
  if (!n || !Number.isFinite(n)) return null;
  return new Date(n > 1e12 ? n : n * 1000);
}

const TRACKING_PARAMS = /^(utm_|itm_|tmsx$|spm$|scm$|from$|_rf$|clear$|sp_atk$|xptdk$|trackingId$)/i;

/** Bỏ các tham số tracking khỏi URL để làm external_id/link sạch. */
export function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k);
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

/** "https://x/khuyen-mai/mot-sach-tiki" → "Mot sach tiki" (dùng khi không lấy được tiêu đề). */
export function titleFromSlug(url: string): string {
  try {
    const slug = new URL(url).pathname.split('/').filter(Boolean).pop() ?? url;
    const s = slug.replace(/\.html?$/, '').replace(/[-_]+/g, ' ').trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch {
    return url;
  }
}

/** Lấy JSON trong <script id="__NEXT_DATA__"> của trang Next.js. */
export function extractNextData(html: string): unknown {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]!);
  } catch {
    return null;
  }
}

/** Lấy <title> (hoặc og:title) của trang HTML. */
export function htmlTitle(html: string): string | null {
  const $ = load(html);
  const t = $('meta[property="og:title"]').attr('content') || $('title').first().text();
  return t?.trim() || null;
}

/** Duyệt mọi object trong cây JSON. */
export function* walkJson(node: unknown): Generator<Record<string, unknown>> {
  const stack: unknown[] = [node];
  while (stack.length) {
    const cur = stack.pop();
    if (Array.isArray(cur)) stack.push(...cur);
    else if (cur && typeof cur === 'object') {
      yield cur as Record<string, unknown>;
      stack.push(...Object.values(cur));
    }
  }
}

export const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

export const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);

/** Đảm bảo URL tuyệt đối https. */
export function absUrl(u: string | null | undefined, base: string): string | null {
  if (!u) return null;
  try {
    return new URL(u.startsWith('//') ? `https:${u}` : u, base).toString();
  } catch {
    return null;
  }
}

export interface ParsedDiscount {
  discountType: 'percent' | 'fixed' | 'freeship' | null;
  discountValue: number | null;
  maxDiscount: number | null;
  minSpend: number | null;
}

/**
 * Đọc mức giảm từ câu mô tả tiếng Việt, vd:
 * "Giảm 10% tối đa 50K đơn từ 199K", "Giảm 30.000đ cho đơn từ 150K", "Freeship 15K", "giảm đến 100K".
 */
export function parseDiscountText(text: string | null | undefined): ParsedDiscount {
  const out: ParsedDiscount = { discountType: null, discountValue: null, maxDiscount: null, minSpend: null };
  if (!text) return out;
  const t = foldVietnamese(text).replace(/\s+/g, ' ');
  const money = String.raw`(\d+(?:[.,]\d+)*\s*(?:k|tr|trieu|ngan|nghin|d|vnd)?)`;

  out.minSpend = parseMinSpend(text);
  const max = t.match(new RegExp(String.raw`(?:toi da|giam den|len den|max)\s*${money}`));
  const freeship = /(free\s*ship|mien phi van chuyen|giam phi (?:van chuyen|ship|giao)|ma van chuyen)/.test(t);
  const pct = t.match(/(?:giam|hoan|discount|off)?\s*(\d{1,2}(?:[.,]\d+)?)\s*%/);

  if (freeship) {
    out.discountType = 'freeship';
    const v = t.match(new RegExp(String.raw`(?:free\s*ship|giam|toi da)\s*${money}`));
    out.discountValue = v ? parseVnd(v[1]) : 0;
  } else if (pct) {
    out.discountType = 'percent';
    out.discountValue = Number.parseFloat(pct[1]!.replace(',', '.'));
    out.maxDiscount = max ? parseVnd(max[1]) : null;
  } else {
    const fixed = t.match(new RegExp(String.raw`(?:giam|tang|voucher|ma)\s*(?:ngay\s*)?${money}`));
    if (fixed && /\d/.test(fixed[1]!) && /(k|tr|d|vnd|\d{4,})/.test(fixed[1]!)) {
      out.discountType = 'fixed';
      out.discountValue = parseVnd(fixed[1]);
    } else if (max) {
      // "giảm đến 100K" mà không rõ % → coi như tối đa 100K, không đủ để tính giá
      out.maxDiscount = parseVnd(max[1]);
    }
  }
  return out;
}

/** "2026-11-30" (giờ VN) → cuối ngày đó. */
export function endOfDayVN(d: string | null | undefined): Date | null {
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) return null;
  return d.length > 10 ? new Date(d) : new Date(`${d}T23:59:59+07:00`);
}

export function startOfDayVN(d: string | null | undefined): Date | null {
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) return null;
  return d.length > 10 ? new Date(d) : new Date(`${d}T00:00:00+07:00`);
}
