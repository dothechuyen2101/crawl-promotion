import { describe, expect, it } from 'vitest';
import { adviseQuantity, bestPrice, explainVouchers, type PricingVoucher } from '../src/pricing/index.ts';

const NOW = new Date('2026-11-08T10:00:00+07:00');
let seq = 0;
const v = (p: Partial<PricingVoucher> & Pick<PricingVoucher, 'scope' | 'discountType' | 'discountValue'>): PricingVoucher => ({
  id: `v${++seq}`,
  title: p.title ?? `voucher ${seq}`,
  ...p,
});

describe('bestPrice', () => {
  it('không áp mã khi chưa đạt đơn tối thiểu', () => {
    const r = bestPrice({
      platform: 'shopee',
      unitPrice: 90_000,
      vouchers: [v({ scope: 'platform', discountType: 'fixed', discountValue: 20_000, minSpend: 100_000 })],
      options: { now: NOW },
    });
    expect(r.applied).toHaveLength(0);
    expect(r.finalPrice).toBe(90_000);
  });

  it('giới hạn theo giảm tối đa', () => {
    const r = bestPrice({
      platform: 'shopee',
      unitPrice: 1_000_000,
      vouchers: [v({ scope: 'platform', discountType: 'percent', discountValue: 10, maxDiscount: 50_000 })],
      options: { now: NOW },
    });
    expect(r.itemDiscount).toBe(50_000);
    expect(r.finalPrice).toBe(950_000);
  });

  it('bỏ qua mã hết hạn hoặc chưa bắt đầu', () => {
    const vouchers = [
      v({ scope: 'platform', discountType: 'fixed', discountValue: 30_000, endAt: '2026-11-07T00:00:00Z' }),
      v({ scope: 'platform', discountType: 'fixed', discountValue: 40_000, startAt: '2026-11-11T00:00:00Z' }),
    ];
    const input = { platform: 'tiki' as const, unitPrice: 200_000, vouchers, options: { now: NOW } };
    expect(bestPrice(input).applied).toHaveLength(0);
    expect(explainVouchers(input).map((x) => x.reason)).toEqual(['expired', 'not_started']);
  });

  it('freeship không giảm quá phí ship', () => {
    const r = bestPrice({
      platform: 'shopee',
      unitPrice: 200_000,
      shippingFee: 18_000,
      vouchers: [v({ scope: 'freeship', discountType: 'freeship', discountValue: 30_000 })],
      options: { now: NOW },
    });
    expect(r.shippingDiscount).toBe(18_000);
    expect(r.finalPrice).toBe(200_000);
  });

  it('chỉ dùng 1 mã mỗi nhóm và cộng dồn các nhóm khác nhau', () => {
    const r = bestPrice({
      platform: 'shopee',
      unitPrice: 500_000,
      shippingFee: 30_000,
      shopId: 's1',
      vouchers: [
        v({ scope: 'shop', shopId: 's1', discountType: 'fixed', discountValue: 20_000 }),
        v({ scope: 'shop', shopId: 's1', discountType: 'fixed', discountValue: 50_000 }),
        v({ scope: 'platform', discountType: 'percent', discountValue: 10, maxDiscount: 40_000 }),
        v({ scope: 'freeship', discountType: 'freeship', discountValue: 0 }),
      ],
      options: { now: NOW },
    });
    // 500k - 50k (shop) = 450k; -10% tối đa 40k = 410k; ship 30k được miễn
    expect(r.applied.map((a) => a.group)).toEqual(['shop', 'platform', 'freeship']);
    expect(r.finalPrice).toBe(410_000);
  });

  it('cân nhắc đánh đổi khi mã shop làm mất điều kiện mã sàn', () => {
    const r = bestPrice({
      platform: 'lazada',
      unitPrice: 300_000,
      shopId: 's1',
      vouchers: [
        v({ scope: 'shop', shopId: 's1', discountType: 'fixed', discountValue: 10_000 }),
        v({ scope: 'platform', discountType: 'fixed', discountValue: 60_000, minSpend: 300_000 }),
      ],
      options: { now: NOW },
    });
    // Dùng mã shop thì còn 290k < 300k nên mất mã sàn 60k → tối ưu là chỉ dùng mã sàn.
    expect(r.finalPrice).toBe(240_000);
    expect(r.applied).toHaveLength(1);
  });

  it('bỏ qua mã của shop khác', () => {
    const r = bestPrice({
      platform: 'tiki',
      unitPrice: 300_000,
      shopId: 's1',
      vouchers: [v({ scope: 'shop', shopId: 's2', discountType: 'fixed', discountValue: 50_000 })],
      options: { now: NOW },
    });
    expect(r.applied).toHaveLength(0);
  });

  it('khớp mã shop theo tên khi nguồn mã không có shop id', () => {
    const vouchers = [v({ scope: 'shop', shopName: 'BG Việt Nam Official Store', discountType: 'fixed', discountValue: 30_000 })];
    const base = { platform: 'tiki' as const, unitPrice: 300_000, shopId: '123', vouchers, options: { now: NOW } };
    expect(bestPrice({ ...base, shopName: 'BG VIET NAM' }).finalPrice).toBe(270_000);
    expect(bestPrice({ ...base, shopName: 'Shop khác' }).finalPrice).toBe(300_000);
    expect(bestPrice({ ...base, shopName: null }).finalPrice).toBe(300_000);
  });

  it('voucher thanh toán chỉ tính khi người dùng chọn ví/ngân hàng đó', () => {
    const vouchers = [v({ scope: 'payment', paymentMethod: 'shopeepay', discountType: 'fixed', discountValue: 15_000 })];
    const base = { platform: 'shopee' as const, unitPrice: 200_000, vouchers };
    expect(bestPrice({ ...base, options: { now: NOW } }).finalPrice).toBe(200_000);
    expect(bestPrice({ ...base, options: { now: NOW, paymentMethods: ['shopeepay'] } }).finalPrice).toBe(185_000);
  });

  it('voucher người dùng mới chỉ áp khi bật tuỳ chọn', () => {
    const vouchers = [v({ scope: 'platform', newUserOnly: true, discountType: 'fixed', discountValue: 30_000 })];
    const base = { platform: 'tiktok' as const, unitPrice: 100_000, vouchers };
    expect(bestPrice({ ...base, options: { now: NOW } }).finalPrice).toBe(100_000);
    expect(bestPrice({ ...base, options: { now: NOW, isNewUser: true } }).finalPrice).toBe(70_000);
  });

  it('đồ ăn: mã freeship và mã giảm món dùng chung 1 lượt', () => {
    const r = bestPrice({
      platform: 'grabfood',
      unitPrice: 120_000,
      shippingFee: 25_000,
      shopId: 'm1',
      vouchers: [
        v({ scope: 'shop', shopId: 'm1', discountType: 'percent', discountValue: 20, maxDiscount: 30_000 }),
        v({ scope: 'freeship', discountType: 'freeship', discountValue: 15_000 }),
        v({ scope: 'platform', discountType: 'fixed', discountValue: 20_000, minSpend: 80_000 }),
      ],
      options: { now: NOW },
    });
    // 120k - 24k (quán) = 96k; mã giảm món 20k tốt hơn freeship 15k; chỉ được 1 trong 2.
    expect(r.applied.map((a) => a.group)).toEqual(['shop', 'code']);
    expect(r.finalPrice).toBe(96_000 - 20_000 + 25_000);
  });

  it('cashback chỉ trừ vào giá hiệu dụng khi bật countCashback', () => {
    const vouchers = [v({ scope: 'platform', isCashback: true, discountType: 'percent', discountValue: 10, maxDiscount: 100_000 })];
    const base = { platform: 'shopee' as const, unitPrice: 500_000, vouchers };
    const off = bestPrice({ ...base, options: { now: NOW } });
    expect(off.effectivePrice).toBe(500_000);
    const on = bestPrice({ ...base, options: { now: NOW, countCashback: true } });
    expect(on.finalPrice).toBe(500_000);
    expect(on.cashback).toBe(50_000);
    expect(on.effectivePrice).toBe(450_000);
  });

  it('không bao giờ ra giá âm', () => {
    const r = bestPrice({
      platform: 'tiki',
      unitPrice: 10_000,
      vouchers: [v({ scope: 'platform', discountType: 'fixed', discountValue: 50_000 })],
      options: { now: NOW },
    });
    expect(r.finalPrice).toBe(0);
  });
});

describe('adviseQuantity', () => {
  it('gợi ý mua 2 khi mua 2 rẻ hơn mỗi cái', () => {
    const a = adviseQuantity({
      platform: 'shopee',
      unitPrice: 150_000,
      shippingFee: 20_000,
      vouchers: [
        v({ scope: 'platform', discountType: 'fixed', discountValue: 100_000, minSpend: 300_000 }),
        v({ scope: 'freeship', discountType: 'freeship', discountValue: 0, minSpend: 0 }),
      ],
      options: { now: NOW },
    });
    expect(a.single.perUnit).toBe(150_000);
    expect(a.suggestMore).toBe(true);
    expect(a.best.quantity).toBe(2);
    expect(a.best.perUnit).toBe(100_000);
  });

  it('không gợi ý khi mua 1 đã tốt nhất', () => {
    const a = adviseQuantity({
      platform: 'tiki',
      unitPrice: 150_000,
      vouchers: [v({ scope: 'platform', discountType: 'fixed', discountValue: 20_000 })],
      options: { now: NOW },
    });
    expect(a.suggestMore).toBe(false);
    expect(a.best.quantity).toBe(1);
  });
});
