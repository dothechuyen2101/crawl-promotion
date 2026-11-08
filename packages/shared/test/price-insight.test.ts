import { describe, expect, it } from 'vitest';
import { priceInsight } from '../src/index.ts';

const NOW = new Date('2026-12-01T00:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

describe('priceInsight', () => {
  it('chưa đủ 3 ngày dữ liệu thì không kết luận', () => {
    const r = priceInsight([{ price: 500_000, at: daysAgo(1) }], 400_000, 800_000, { now: NOW });
    expect(r.quality).toBeNull();
    expect(r.isLowest).toBe(false);
  });

  it('giá giữ 500k suốt 20 ngày rồi giảm còn 400k → giảm thật, thấp nhất 30 ngày', () => {
    const r = priceInsight(
      [
        { price: 500_000, at: daysAgo(20) },
        { price: 400_000, at: daysAgo(1) },
      ],
      400_000,
      500_000,
      { now: NOW },
    );
    // Trung vị theo thời gian là 500k (giữ 19/20 ngày), không phải trung bình 2 điểm.
    expect(r.median).toBe(500_000);
    expect(r.quality).toBe('real');
    expect(r.isLowest).toBe(true);
  });

  it('giá gốc niêm yết bị nâng nhưng giá bán không đổi → giá ảo', () => {
    const r = priceInsight([{ price: 300_000, at: daysAgo(15) }], 299_000, 600_000, { now: NOW });
    expect(r.median).toBe(300_000);
    expect(r.quality).toBe('inflated');
  });

  it('tăng giá rồi "giảm" về đúng giá cũ → không phải giảm thật', () => {
    const r = priceInsight(
      [
        { price: 200_000, at: daysAgo(25) },
        { price: 350_000, at: daysAgo(3) },
        { price: 200_000, at: daysAgo(1) },
      ],
      200_000,
      350_000,
      { now: NOW },
    );
    expect(r.median).toBe(200_000);
    expect(r.quality).not.toBe('real');
    expect(r.isLowest).toBe(false);
  });

  it('điểm trước cửa sổ 30 ngày vẫn được tính từ đầu cửa sổ', () => {
    const r = priceInsight(
      [
        { price: 1_000_000, at: daysAgo(90) },
        { price: 800_000, at: daysAgo(2) },
      ],
      800_000,
      1_000_000,
      { now: NOW },
    );
    expect(r.spanDays).toBe(30);
    expect(r.median).toBe(1_000_000);
    expect(r.quality).toBe('real');
  });

  it('không có lịch sử', () => {
    expect(priceInsight([], 100, null, { now: NOW })).toMatchObject({ median: null, quality: null });
  });
});
