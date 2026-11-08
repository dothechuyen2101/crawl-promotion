const DAY = 86_400_000;

export type DealQuality = 'real' | 'normal' | 'inflated';

export interface PricePoint {
  price: number;
  /** Thời điểm giá bắt đầu có hiệu lực (lịch sử chỉ ghi khi giá đổi). */
  at: Date | string;
}

export interface PriceInsight {
  /** Giá "thường" trong cửa sổ: trung vị có trọng số theo thời gian mỗi mức giá được giữ. */
  median: number | null;
  /** Giá thấp nhất trong cửa sổ (gồm cả giá hiện tại). */
  min: number | null;
  /** Số ngày có dữ liệu trong cửa sổ. */
  spanDays: number;
  /** Giá hiện tại thấp hơn mọi mức giá khác đã thấy trong cửa sổ. */
  isLowest: boolean;
  /** null = chưa đủ dữ liệu để kết luận. */
  quality: DealQuality | null;
}

export interface InsightOptions {
  now?: Date;
  windowDays?: number;
  /** Cần ít nhất bấy nhiêu ngày dữ liệu mới đánh giá. */
  minSpanDays?: number;
  /** current ≤ median × realRatio → giảm thật. */
  realRatio?: number;
  /** original ≥ median × inflatedRatio và current ≈ median → giá gốc bị nâng. */
  inflatedRatio?: number;
}

/**
 * Phân tích lịch sử giá của 1 sản phẩm để phân biệt "giảm thật" với "giá gốc ảo".
 * Lịch sử chỉ có điểm khi giá thay đổi, nên mỗi mức giá được tính theo thời gian nó tồn tại.
 */
export function priceInsight(
  history: PricePoint[],
  current: number,
  original: number | null | undefined,
  opts: InsightOptions = {},
): PriceInsight {
  const now = (opts.now ?? new Date()).getTime();
  const windowStart = now - (opts.windowDays ?? 30) * DAY;
  const minSpan = opts.minSpanDays ?? 3;
  const pts = history
    .map((p) => ({ price: Number(p.price), t: new Date(p.at).getTime() }))
    .filter((p) => Number.isFinite(p.price) && p.price > 0 && Number.isFinite(p.t) && p.t <= now)
    .sort((a, b) => a.t - b.t);

  // Mỗi điểm giữ giá tới điểm kế tiếp (điểm cuối giữ tới hiện tại), cắt theo cửa sổ.
  const segs: { price: number; dur: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const start = Math.max(pts[i]!.t, windowStart);
    const end = i + 1 < pts.length ? pts[i + 1]!.t : now;
    if (end > start) segs.push({ price: pts[i]!.price, dur: end - start });
  }
  const empty: PriceInsight = { median: null, min: null, spanDays: 0, isLowest: false, quality: null };
  if (segs.length === 0) return empty;

  const total = segs.reduce((s, x) => s + x.dur, 0);
  const sorted = [...segs].sort((a, b) => a.price - b.price);
  let acc = 0;
  let median = sorted[sorted.length - 1]!.price;
  for (const s of sorted) {
    acc += s.dur;
    if (acc >= total / 2) {
      median = s.price;
      break;
    }
  }
  const spanDays = total / DAY;
  const others = segs.slice(0, -1).map((s) => s.price);
  const min = Math.min(current, ...segs.map((s) => s.price));
  const isLowest = spanDays >= minSpan && others.length > 0 && current < Math.min(...others);

  let quality: DealQuality | null = null;
  if (spanDays >= minSpan) {
    if (current <= median * (opts.realRatio ?? 0.9)) quality = 'real';
    else if (original != null && original >= median * (opts.inflatedRatio ?? 1.2) && current >= median * 0.97) quality = 'inflated';
    else quality = 'normal';
  }
  return { median, min, spanDays: Math.round(spanDays * 10) / 10, isLowest, quality };
}
