import type { Platform } from '@cp/shared';

export const vnd = (n: number | null | undefined) =>
  n == null ? '—' : `${Math.round(Number(n)).toLocaleString('vi-VN')}đ`;

/** "50K", "1,5Tr" — gọn cho nhãn. */
export function shortVnd(n: number | null | undefined): string {
  if (n == null) return '';
  const v = Number(n);
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}Tr`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return `${v}đ`;
}

export interface DiscountFields {
  discount_type: 'percent' | 'fixed' | 'freeship' | null;
  discount_value: number | null;
  max_discount: number | null;
  min_spend: number | null;
  is_cashback?: boolean;
}

export function discountLabel(p: DiscountFields): string | null {
  if (!p.discount_type || p.discount_value == null) return null;
  const v = Number(p.discount_value);
  const prefix = p.is_cashback ? 'Hoàn' : 'Giảm';
  let s: string;
  if (p.discount_type === 'percent') s = `${prefix} ${v}%${p.max_discount ? ` tối đa ${shortVnd(p.max_discount)}` : ''}`;
  else if (p.discount_type === 'freeship') s = v > 0 ? `Freeship ${shortVnd(v)}` : 'Miễn phí vận chuyển';
  else s = `${prefix} ${shortVnd(v)}`;
  if (p.min_spend && Number(p.min_spend) > 1) s += ` · đơn từ ${shortVnd(p.min_spend)}`;
  return s;
}

/** "Còn 2 ngày", "Còn 5 giờ", "Hết hạn". */
export function timeLeft(end: string | null | undefined, now = Date.now()): string | null {
  if (!end) return null;
  const ms = new Date(end).getTime() - now;
  if (ms <= 0) return 'Hết hạn';
  const h = ms / 3_600_000;
  if (h < 1) return `Còn ${Math.max(1, Math.round(ms / 60_000))} phút`;
  if (h < 48) return `Còn ${Math.round(h)} giờ`;
  return `Còn ${Math.round(h / 24)} ngày`;
}

export const dateVN = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }) : '—';

/** Màu nhận diện từng sàn (dùng cho nhãn). */
export const PLATFORM_STYLE: Record<Platform, string> = {
  shopee: 'bg-[#ee4d2d] text-white',
  tiktok: 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900',
  lazada: 'bg-[#0f146d] text-white',
  tiki: 'bg-[#1a94ff] text-white',
  grabfood: 'bg-[#00b14f] text-white',
  be: 'bg-[#fbc400] text-neutral-900',
};
