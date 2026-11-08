import { isModelToken, joinModelCodes, normalizeText, tokenize } from './text.ts';

/** Từ khoá thường gặp ở phụ kiện, dùng để hạ điểm khi người dùng không tìm phụ kiện. */
const ACCESSORY_WORDS = [
  'op lung', 'case', 'bao da', 'mieng dan', 'kinh cuong luc', 'cuong luc', 'day deo', 'day sac', 'cap sac',
  'cu sac', 'tui dung', 'hop dung', 'nut tai', 'mut tai', 'dem tai', 'skin', 'sticker', 'gia do', 'tay cam',
  'phu kien', 'thay the', 'linh kien', 'vo boc',
];

export interface MatchScore {
  /** 0..1 */
  score: number;
  accessory: boolean;
}

/**
 * Điểm khớp giữa truy vấn và tiêu đề listing.
 * Token mã model (có cả chữ và số) được tính trọng số gấp đôi; thiếu mã model thì phạt nặng.
 */
export function matchScore(query: string, title: string): MatchScore {
  const qTokens = [...new Set(tokenize(query))];
  if (qTokens.length === 0) return { score: 0, accessory: false };
  const tNorm = normalizeText(joinModelCodes(title));
  const tTokens = new Set(tokenize(title));
  const tCompact = tNorm.replace(/\s+/g, '');

  let total = 0;
  let hit = 0;
  let missingModel = false;
  for (const tok of qTokens) {
    const w = isModelToken(tok) ? 2 : 1;
    total += w;
    if (tTokens.has(tok) || tCompact.includes(tok)) hit += w;
    else if (w === 2) missingModel = true;
  }
  let score = hit / total;
  if (missingModel) score *= 0.5;

  const qNorm = normalizeText(query);
  const accessory = ACCESSORY_WORDS.some((w) => tNorm.includes(w) && !qNorm.includes(w));
  if (accessory) score *= 0.4;
  return { score: Math.round(score * 100) / 100, accessory };
}

/**
 * Đánh dấu listing có giá thấp bất thường so với trung vị nhóm khớp cao
 * (thường là phụ kiện hoặc hàng khác loại lọt vào kết quả).
 */
export function priceOutliers(prices: number[], ratio = 0.35): boolean[] {
  const sorted = prices.filter((p) => p > 0).sort((a, b) => a - b);
  if (sorted.length < 3) return prices.map(() => false);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return prices.map((p) => p > 0 && p < median * ratio);
}
