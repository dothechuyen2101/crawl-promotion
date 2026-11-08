/** Bỏ dấu tiếng Việt và đưa về chữ thường, giữ nguyên dấu câu. */
export function foldVietnamese(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();
}

/** Bỏ dấu tiếng Việt, đưa về chữ thường, gộp khoảng trắng. Dùng cho tìm kiếm và so khớp. */
export function normalizeText(input: string): string {
  return foldVietnamese(input)
    .replace(/[^a-z0-9.+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  'chinh', 'hang', 'chinh hang', 'gia', 're', 'tot', 'moi', 'hot', 'sale', 'freeship', 'mien', 'phi',
  'cho', 'va', 'cua', 'voi', 'loai', 'ban', 'san', 'pham', 'the', 'and', 'for', 'new',
]);

/** Ghép mã model có gạch nối thành 1 token: "WH-1000XM5" → "wh1000xm5", "SM-A556" → "sma556". */
export function joinModelCodes(input: string): string {
  return foldVietnamese(input).replace(/\b([a-z]{1,5})-(?=[a-z0-9]*\d)/g, '$1');
}

/** Tách token đã chuẩn hoá, bỏ stopword và token 1 ký tự (trừ số). */
export function tokenize(input: string): string[] {
  return normalizeText(joinModelCodes(input))
    .split(' ')
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => t.length > 0 && !STOPWORDS.has(t) && (t.length > 1 || /\d/.test(t)));
}

/** Token mang tính "mã model" (vd wh-1000xm5 → 1000xm5, iphone15, 256gb). */
export function isModelToken(token: string): boolean {
  return (/\d/.test(token) && /[a-z]/.test(token)) || /^\d{3,}$/.test(token);
}

/**
 * Đọc số tiền VND từ chuỗi kiểu "45K", "1.5 triệu", "1,5tr", "99.000đ", "1đ", "2 TRIỆU".
 * Trả null nếu không đọc được.
 */
export function parseVnd(input: string | null | undefined): number | null {
  if (!input) return null;
  const s = foldVietnamese(input).replace(/\s+/g, '');
  const m = s.match(/(\d+(?:[.,]\d+)*)(k|ngan|nghin|tr|trieu|m|d|vnd)?/);
  if (!m) return null;
  let num = m[1]!;
  const unit = m[2];
  if (unit === 'k' || unit === 'ngan' || unit === 'nghin' || unit === 'tr' || unit === 'trieu' || unit === 'm') {
    // "1.5tr" / "1,5tr" là số thập phân
    num = num.replace(',', '.');
    const v = Number.parseFloat(num);
    if (!Number.isFinite(v)) return null;
    const mul = unit === 'k' || unit === 'ngan' || unit === 'nghin' ? 1_000 : 1_000_000;
    return Math.round(v * mul);
  }
  // "99.000" / "99,000" là dấu phân cách hàng nghìn
  const v = Number.parseInt(num.replace(/[.,]/g, ''), 10);
  return Number.isFinite(v) ? v : null;
}

/** Tìm số tiền đơn tối thiểu trong mô tả kiểu "Cho đơn hàng từ 99K", "Đơn tối thiểu 150.000đ". */
export function parseMinSpend(text: string | null | undefined): number | null {
  if (!text) return null;
  const n = foldVietnamese(text);
  const m = n.match(/(?:tu|toi thieu|min|tren|it nhat)\s*(\d+(?:[.,]\d+)*\s*(?:k|ngan|nghin|tr|trieu|m|d|vnd)?)/);
  return m ? parseVnd(m[1]) : null;
}
