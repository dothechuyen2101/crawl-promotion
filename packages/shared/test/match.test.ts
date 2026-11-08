import { describe, expect, it } from 'vitest';
import { matchScore, normalizeText, priceOutliers } from '../src/index.ts';

describe('normalizeText', () => {
  it('bỏ dấu tiếng Việt và chữ đ', () => {
    expect(normalizeText('Tai Nghe Đầu Bluetooth  Chống Ồn')).toBe('tai nghe dau bluetooth chong on');
  });
});

describe('matchScore', () => {
  it('khớp cao khi đủ token và mã model', () => {
    const s = matchScore('tai nghe sony wh-1000xm5', 'Tai nghe chống ồn Sony WH-1000XM5 chính hãng');
    expect(s.score).toBeGreaterThanOrEqual(0.9);
    expect(s.accessory).toBe(false);
  });

  it('phạt khi thiếu mã model', () => {
    const s = matchScore('tai nghe sony wh-1000xm5', 'Tai nghe Sony WH-1000XM4');
    expect(s.score).toBeLessThan(0.5);
  });

  it('phân biệt mã model gần giống (WH-1000XM5 vs WF-1000XM5)', () => {
    const s = matchScore('tai nghe sony wh-1000xm5', 'Tai nghe Bluetooth True Wireless Sony WF-1000XM5');
    expect(s.score).toBeLessThan(0.6);
    expect(matchScore('sony wh-1000xm5', 'Sony WH1000XM5 chống ồn').score).toBe(1);
  });

  it('phạt phụ kiện khi người dùng không tìm phụ kiện', () => {
    const s = matchScore('sony wh-1000xm5', 'Hộp đựng tai nghe cho Sony WH-1000XM5');
    expect(s.accessory).toBe(true);
    expect(s.score).toBeLessThan(0.5);
  });

  it('không phạt khi chính người dùng tìm phụ kiện', () => {
    const s = matchScore('ốp lưng iphone 15', 'Ốp lưng iPhone 15 silicon');
    expect(s.accessory).toBe(false);
    expect(s.score).toBeGreaterThan(0.9);
  });
});

describe('priceOutliers', () => {
  it('đánh dấu giá thấp bất thường so với trung vị', () => {
    expect(priceOutliers([8_000_000, 7_500_000, 7_900_000, 150_000])).toEqual([false, false, false, true]);
  });
});

import { parseMinSpend, parseVnd } from '../src/index.ts';

describe('parseVnd', () => {
  it.each([
    ['45K', 45_000],
    ['Giảm 50K', 50_000],
    ['1.5 triệu', 1_500_000],
    ['1,5tr', 1_500_000],
    ['99.000đ', 99_000],
    ['1đ', 1],
    ['2 TRIỆU', 2_000_000],
    ['', null],
  ])('%s → %s', (input, expected) => {
    expect(parseVnd(input)).toBe(expected);
  });
});

describe('parseMinSpend', () => {
  it.each([
    ['Cho đơn hàng từ 99K', 99_000],
    ['Đơn tối thiểu 150.000đ', 150_000],
    ['Cho đơn hàng từ 1đ', 1],
    ['Số lượng có hạn', null],
  ])('%s → %s', (input, expected) => {
    expect(parseMinSpend(input)).toBe(expected);
  });
});
