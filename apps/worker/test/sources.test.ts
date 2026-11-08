import { readFileSync } from 'node:fs';
import { NormalizedPromotionSchema } from '@cp/shared';
import { describe, expect, it } from 'vitest';
import { diffApprovals, offerToPromotions, splitOfferName, type AtOffer } from '../src/sources/accesstrade/index.ts';
import { paymentPartner, parseBePromoList } from '../src/sources/be/index.ts';
import { endOfDayVN, parseDiscountText } from '../src/sources/common.ts';

describe('parseDiscountText', () => {
  it.each([
    ['Giảm 10% tối đa 50K đơn từ 199K', { discountType: 'percent', discountValue: 10, maxDiscount: 50_000, minSpend: 199_000 }],
    ['Giảm 30.000đ cho đơn hàng từ 150K', { discountType: 'fixed', discountValue: 30_000, minSpend: 150_000 }],
    ['Freeship 15K đơn từ 0đ', { discountType: 'freeship', discountValue: 15_000 }],
    ['be x ACB giảm đến 100K', { discountType: null, maxDiscount: 100_000 }],
    ['Chương trình Bay chung giảm khủng', { discountType: null, discountValue: null }],
  ])('%s', (text, expected) => {
    expect(parseDiscountText(text)).toMatchObject(expected);
  });
});

describe('accesstrade', () => {
  const base = {
    id: '123', name: 'Mã Shopee giảm 15% tối đa 30K đơn từ 99K', content: 'Áp dụng toàn sàn',
    link: 'https://shopee.vn/m/ma-giam-gia', aff_link: 'https://go.isclix.com/deep_link/7108777448622344019?url=x',
    image: 'https://static.accesstrade.vn/a.png', merchant: 'shopee', domain: 'shopee.vn',
    start_time: '2026-11-01', end_time: '2026-11-30', categories: [],
  };

  it('offer có mã → voucher; chiến dịch đã duyệt thì kèm link affiliate', () => {
    const offer = { ...base, coupons: [{ coupon_code: 'SPXX15', coupon_desc: 'Giảm 15% tối đa 30K đơn từ 99K' }] };
    const [p] = offerToPromotions(offer, 'shopee', new Set(['shopee']));
    const v = NormalizedPromotionSchema.parse(p);
    expect(v).toMatchObject({ type: 'voucher', scope: 'platform', code: 'SPXX15', discountType: 'percent', discountValue: 15, maxDiscount: 30_000, minSpend: 99_000 });
    expect(v.affiliateUrl).toContain('isclix');
    expect(v.endAt).toEqual(endOfDayVN('2026-11-30'));
  });

  it('chiến dịch chưa duyệt → bỏ link affiliate (isclix trả 404), đi thẳng link gốc của sàn', () => {
    const [p] = offerToPromotions({ ...base, coupons: ['SPXX15'] }, 'shopee', new Set(['tiktok_cps']));
    expect(p!.affiliateUrl).toBeNull();
    expect(p!.url).toBe('https://shopee.vn/m/ma-giam-gia');
  });

  it('phát hiện chiến dịch mới được duyệt / bị bỏ duyệt', () => {
    const prev = { tiktok_cps: 'TIKTOK SHOP CPS', lazada_kol: 'Lazada Việt Nam' };
    const current = new Map([
      ['tiktok_cps', 'TIKTOK SHOP CPS'],
      ['shopee', 'Shopee Việt Nam Smartlink cho tất cả thiết bị'],
    ]);
    expect(diffApprovals(prev, current)).toEqual({
      added: [['shopee', 'Shopee Việt Nam Smartlink cho tất cả thiết bị']],
      removed: [['lazada_kol', 'Lazada Việt Nam']],
    });
    expect(diffApprovals({ tiktok_cps: 'x' }, new Map([['tiktok_cps', 'x']]))).toEqual({ added: [], removed: [] });
  });

  it('so merchant không phân biệt hoa thường', () => {
    const [p] = offerToPromotions({ ...base, merchant: 'Shopee', coupons: ['SPXX15'] }, 'shopee', new Set(['shopee']));
    expect(p!.affiliateUrl).toContain('isclix');
  });

  it('offer không có mã → chiến dịch', () => {
    const [p] = offerToPromotions({ ...base, coupons: [] }, 'shopee');
    expect(p!.type).toBe('campaign');
  });

  it('dữ liệu thật: mã shop dạng "[Shop - Ngành]-Giảm ..."', () => {
    const offers = JSON.parse(readFileSync(new URL('./fixtures/accesstrade/offers.json', import.meta.url), 'utf8')).data as AtOffer[];
    const all = offers.flatMap((o) => offerToPromotions(o, o.domain === 'tiki.vn' ? 'tiki' : 'shopee').map((p) => NormalizedPromotionSchema.parse(p)));
    expect(all.length).toBe(offers.length);
    const first = all[0]!;
    expect(first).toMatchObject({ type: 'voucher', scope: 'shop', shopName: 'HPS', category: 'Phụ kiện công nghệ', code: 'NHIM210', discountType: 'fixed', discountValue: 20_000, minSpend: 80_000 });
    const pct = all.find((p) => p.discountType === 'percent')!;
    expect(pct.maxDiscount).toBeGreaterThan(0);
    for (const p of all) expect(p.discountValue).not.toBeNull();
  });

  it('tách tên shop và ngành hàng', () => {
    expect(splitOfferName('[Therabody Việt Nam]-Giảm 12%-tối đa 2,000,000 VNĐ')).toMatchObject({ shop: 'Therabody Việt Nam', category: null, rest: 'Giảm 12%-tối đa 2,000,000 VNĐ' });
    expect(splitOfferName('Mã giảm 10%')).toMatchObject({ shop: null, rest: 'Mã giảm 10%' });
  });

  it('chấp nhận mã dạng chuỗi', () => {
    expect(offerToPromotions({ ...base, coupons: ['ABC', 'DEF'] }, 'lazada')).toHaveLength(2);
  });
});

describe('be', () => {
  it('đọc danh sách chương trình', () => {
    const html = readFileSync(new URL('./fixtures/be/promo-list.html', import.meta.url), 'utf8');
    const items = parseBePromoList(html);
    expect(items.length).toBeGreaterThan(3);
    for (const i of items) NormalizedPromotionSchema.parse(i);
    expect(items[0]!.imageUrl).toMatch(/^https:\/\/media\.be\.com\.vn/);
  });

  it('nhận diện đối tác thanh toán', () => {
    expect(paymentPartner('be x VPBank NEO 20%')).toBe('vpbank');
    expect(paymentPartner('be x HD SAISON ưu đãi đến 80K')).toBe('hdsaison');
    expect(paymentPartner('Mừng sinh nhật LynkID 5 tuổi')).toBeNull();
  });
});
