import { normalizeText } from '../text.ts';
import { STACKING_RULES } from './rules.ts';
import type {
  AppliedVoucher,
  PricingInput,
  PricingResult,
  PricingVoucher,
  SkipReason,
} from './types.ts';

/** Số voucher tối đa giữ lại mỗi nhóm trước khi duyệt tổ hợp (giới hạn độ phức tạp). */
const MAX_PER_GROUP = 12;

const toTime = (d: Date | string | null | undefined): number | null => {
  if (d == null) return null;
  const t = d instanceof Date ? d.getTime() : Date.parse(d);
  return Number.isFinite(t) ? t : null;
};

const SHOP_SUFFIX = /\b(official store|official|flagship store|flagship|store|shop|mall|chinh hang|viet nam|vietnam|vn)\b/g;

/** Chuẩn hoá tên shop để so khớp: bỏ dấu, bỏ các hậu tố hay gặp ("Official Store", "VN"...). */
export function shopKey(name: string): string {
  return normalizeText(name).replace(SHOP_SUFFIX, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Mã shop chỉ áp cho đúng shop của listing: ưu tiên so shop id; nếu nguồn mã không có id
 * thì so tên shop đã chuẩn hoá. Thiếu thông tin thì không áp (thà báo giá cao hơn còn hơn báo sai).
 */
function sameShop(v: PricingVoucher, input: PricingInput): boolean {
  if (v.shopId && input.shopId) return v.shopId === input.shopId;
  if (!v.shopId && v.shopName && input.shopName) {
    const a = shopKey(v.shopName);
    return a.length >= 2 && a === shopKey(input.shopName);
  }
  return false;
}

/** Lý do một voucher không thể dùng cho listing (không xét min_spend), hoặc null nếu dùng được. */
export function voucherSkipReason(v: PricingVoucher, input: PricingInput): SkipReason | null {
  const opts = input.options ?? {};
  const now = (opts.now ?? new Date()).getTime();
  if (!Number.isFinite(v.discountValue) || v.discountValue < 0) return 'invalid';
  if (v.discountType === 'percent' && v.discountValue > 100) return 'invalid';
  const start = toTime(v.startAt);
  const end = toTime(v.endAt);
  if (end != null && end < now) return 'expired';
  if (start != null && start > now) return 'not_started';
  if (v.newUserOnly && !opts.isNewUser) return 'new_user_only';
  if (v.restricted && !opts.includeRestricted) return 'restricted';
  if (v.scope === 'payment') {
    const methods = opts.paymentMethods ?? [];
    if (!v.paymentMethod || !methods.includes(v.paymentMethod)) return 'payment_not_selected';
  }
  if (v.scope === 'shop' && !sameShop(v, input)) return 'other_shop';
  const cats = v.applicableCategories ?? [];
  if (cats.length > 0) {
    // Không biết ngành hàng của listing thì không áp (thà báo giá cao hơn còn hơn báo sai).
    if (!input.category || !cats.includes(input.category)) return 'category_mismatch';
  }
  return null;
}

/** Số tiền giảm của 1 voucher trên `base` (tiền hàng) hoặc `shippingLeft` (với freeship). */
export function voucherAmount(v: PricingVoucher, base: number, shippingLeft: number): number {
  const cap = v.maxDiscount != null && v.maxDiscount > 0 ? v.maxDiscount : Infinity;
  let amount: number;
  switch (v.discountType) {
    case 'freeship': {
      const limit = v.discountValue > 0 ? v.discountValue : Infinity;
      amount = Math.min(shippingLeft, limit, cap);
      break;
    }
    case 'percent':
      amount = Math.min((base * v.discountValue) / 100, cap, base);
      break;
    case 'fixed':
      amount = Math.min(v.discountValue, cap, base);
      break;
  }
  return Math.max(0, Math.floor(amount));
}

function groupOf(v: PricingVoucher, input: PricingInput): string {
  return v.stackGroup ?? STACKING_RULES[input.platform].groupOf[v.scope];
}

type Combo = Map<string, PricingVoucher>;

function evaluate(input: PricingInput, combo: Combo, order: string[], totalGroups: Set<string>): PricingResult | null {
  const quantity = Math.max(1, Math.floor(input.quantity ?? 1));
  const subtotal = Math.round(input.unitPrice * quantity);
  const shippingKnown = input.shippingFee != null;
  const shippingFee = Math.max(0, input.shippingFee ?? 0);

  let items = subtotal;
  let shippingLeft = shippingFee;
  let paymentDiscount = 0;
  let cashback = 0;
  const applied: AppliedVoucher[] = [];

  for (const group of order) {
    const v = combo.get(group);
    if (!v) continue;
    const onTotal = totalGroups.has(group);
    const base = onTotal ? items + shippingLeft - paymentDiscount : items;
    if (v.minSpend != null && base < v.minSpend) return null;

    const amount = voucherAmount(v, base, shippingLeft);
    // Voucher không đem lại gì thì tổ hợp "không dùng" đã bao trường hợp này.
    if (amount <= 0) return null;

    if (v.isCashback) {
      cashback += amount;
    } else if (v.discountType === 'freeship') {
      shippingLeft -= amount;
    } else if (onTotal) {
      paymentDiscount += amount;
    } else {
      items -= amount;
    }
    applied.push({ voucher: v, group, amount, cashback: !!v.isCashback });
  }

  const finalPrice = Math.max(0, items + shippingLeft - paymentDiscount);
  const effectivePrice = Math.max(0, finalPrice - (input.options?.countCashback ? cashback : 0));
  return {
    quantity,
    subtotal,
    shippingFee,
    shippingKnown,
    applied,
    itemDiscount: subtotal - items,
    shippingDiscount: shippingFee - shippingLeft,
    paymentDiscount,
    cashback,
    finalPrice,
    effectivePrice,
    perUnit: Math.round(effectivePrice / quantity),
    savings: subtotal + shippingFee - effectivePrice,
  };
}

function better(a: PricingResult, b: PricingResult): boolean {
  if (a.effectivePrice !== b.effectivePrice) return a.effectivePrice < b.effectivePrice;
  if (a.finalPrice !== b.finalPrice) return a.finalPrice < b.finalPrice;
  // Hoà giá: ưu tiên ít mã hơn, rồi ít mã phải "Lưu" trước hơn.
  if (a.applied.length !== b.applied.length) return a.applied.length < b.applied.length;
  const collect = (r: PricingResult) => r.applied.filter((x) => x.voucher.requiresCollect).length;
  return collect(a) < collect(b);
}

/** Tìm tổ hợp voucher cho giá hiệu dụng thấp nhất theo luật stacking của sàn. */
export function bestPrice(input: PricingInput): PricingResult {
  const rule = STACKING_RULES[input.platform];
  const quantity = Math.max(1, Math.floor(input.quantity ?? 1));
  const subtotal = Math.round(input.unitPrice * quantity);
  const shippingFee = Math.max(0, input.shippingFee ?? 0);

  const byGroup = new Map<string, PricingVoucher[]>();
  for (const v of input.vouchers) {
    if (voucherSkipReason(v, input) !== null) continue;
    const g = groupOf(v, input);
    const list = byGroup.get(g) ?? [];
    list.push(v);
    byGroup.set(g, list);
  }

  const order = [...rule.order, ...[...byGroup.keys()].filter((g) => !rule.order.includes(g))];
  const totalGroups = new Set(rule.totalGroups);

  // Giữ lại các voucher có giá trị đơn lẻ cao nhất mỗi nhóm.
  const candidates: [string, (PricingVoucher | null)[]][] = order
    .filter((g) => byGroup.has(g))
    .map((g) => {
      const scored = byGroup
        .get(g)!
        .map((v) => ({ v, value: voucherAmount(v, subtotal + (totalGroups.has(g) ? shippingFee : 0), shippingFee) }))
        .filter((x) => x.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, MAX_PER_GROUP)
        .map((x) => x.v);
      return [g, [null, ...scored]];
    });

  let best = evaluate(input, new Map(), order, totalGroups)!;
  const combo: Combo = new Map();
  const walk = (i: number) => {
    if (i === candidates.length) {
      const r = evaluate(input, combo, order, totalGroups);
      if (r && better(r, best)) best = r;
      return;
    }
    const [group, list] = candidates[i]!;
    for (const v of list) {
      if (v) combo.set(group, v);
      else combo.delete(group);
      walk(i + 1);
    }
    combo.delete(group);
  };
  walk(0);
  return best;
}

export interface QuantityAdvice {
  single: PricingResult;
  best: PricingResult;
  /** true nếu mua nhiều hơn 1 cho giá mỗi cái rẻ hơn ít nhất 1%. */
  suggestMore: boolean;
}

/** So sánh mua 1..maxQty cái để gợi ý "mua thêm để đạt đơn tối thiểu". */
export function adviseQuantity(input: PricingInput, maxQty = 3): QuantityAdvice {
  const single = bestPrice({ ...input, quantity: 1 });
  let best = single;
  for (let q = 2; q <= maxQty; q++) {
    const r = bestPrice({ ...input, quantity: q });
    if (r.perUnit < best.perUnit) best = r;
  }
  const suggestMore = best.quantity > 1 && best.perUnit < single.perUnit * 0.99;
  return { single, best: suggestMore ? best : single, suggestMore };
}

/** Liệt kê từng voucher kèm lý do không áp được (để hiển thị cho người dùng). */
export function explainVouchers(input: PricingInput): { voucher: PricingVoucher; reason: SkipReason | null }[] {
  return input.vouchers.map((voucher) => ({ voucher, reason: voucherSkipReason(voucher, input) }));
}
