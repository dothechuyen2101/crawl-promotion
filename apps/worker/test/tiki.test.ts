import { readFileSync } from 'node:fs';
import { NormalizedPromotionSchema } from '@cp/shared';
import { describe, expect, it } from 'vitest';
import { extractNextData } from '../src/sources/common.ts';
import {
  couponBlocks,
  couponToPromotion,
  flashDealToPromotion,
  itemToDeal,
  itemToListing,
  type TikiCoupon,
} from '../src/sources/tiki/parse.ts';

const fx = (name: string) => readFileSync(new URL(`./fixtures/tiki/${name}`, import.meta.url), 'utf8');

describe('tiki coupon hub', () => {
  it('tìm được các nhóm mã trong __NEXT_DATA__', () => {
    const blocks = couponBlocks(extractNextData(fx('coupon-hub.html')));
    expect(blocks.length).toBeGreaterThan(5);
    expect(blocks[0]!.codes.length).toBeGreaterThan(0);
  });

  it('chuẩn hoá mã freeship, đọc đơn tối thiểu từ mô tả', () => {
    const data = JSON.parse(fx('coupon-api.json')).data as TikiCoupon[];
    const fs = data.find((c) => c.coupon_type === 'SHIPPING_COUPON' && c.status === 'active')!;
    const p = NormalizedPromotionSchema.parse(couponToPromotion(fs));
    expect(p.discountType).toBe('freeship');
    expect(p.discountValue).toBe(50_000);
    expect(p.minSpend).toBe(45_000);
    expect(p.scope).toBe('freeship');
    expect(p.endAt).toBeInstanceOf(Date);
  });

  it('mã giảm theo %, giữ giảm tối đa và cờ người dùng mới', () => {
    const p = couponToPromotion({
      coupon_code: 'X1', status: 'active', coupon_type: 'TIKI_COUPON', simple_action: 'by_percent',
      discount_amount: 20, discount_max: 50_000, min_amount: 0, label: 'Giảm 20%',
      short_description: 'Cho đơn hàng từ 249K', tags: ['KH mới'], expired_at: 1796057999,
    })!;
    expect(p).toMatchObject({ discountType: 'percent', discountValue: 20, maxDiscount: 50_000, minSpend: 249_000, newUserOnly: true, scope: 'platform' });
  });

  it('bỏ qua mã không active hoặc hết lượt', () => {
    expect(couponToPromotion({ coupon_code: 'A', status: 'inactive' })).toBeNull();
    expect(couponToPromotion({ coupon_code: 'B', status: 'active', out_of_stock: true })).toBeNull();
  });

  it('mã yêu cầu hạng thành viên bị đánh dấu restricted', () => {
    const p = couponToPromotion({ coupon_code: 'V', status: 'active', coupon_type: 'TIKI_COUPON', simple_action: 'cart_fixed', discount_amount: 30_000, tags: ['Vàng'] })!;
    expect(p.conditions).toMatchObject({ restricted: true, memberRank: 'Vàng' });
  });
});

describe('tiki products', () => {
  it('chuyển kết quả tìm kiếm thành listing', () => {
    const items = JSON.parse(fx('search.json')).data;
    const l = itemToListing(items[0]);
    expect(l.platform).toBe('tiki');
    expect(l.url).toMatch(/^https:\/\/tiki\.vn\/.+spid=\d+/);
    expect(l.price).toBeGreaterThan(0);
    expect(l.shopId).toBe('1');
  });

  it('top deals → deal hợp lệ, bỏ sản phẩm không giảm', () => {
    const items = JSON.parse(fx('top-deals.json')).items;
    const deals = items.map((i: any) => itemToDeal(i)).filter(Boolean);
    for (const d of deals) {
      const p = NormalizedPromotionSchema.parse(d);
      expect(p.salePrice!).toBeLessThan(p.originalPrice!);
    }
    expect(itemToDeal({ id: 1, name: 'x', price: 100, original_price: 100 })).toBeNull();
  });

  it('flash deal dạng lồng product', () => {
    const p = flashDealToPromotion(
      { deal_id: 9, special_price: 99_000, special_to_date: 1794142800, progress: { percent: 40 }, product: { id: 5, name: 'Nồi chiên', list_price: 200_000, url_path: 'noi-chien-p5.html?spid=6', seller_product_id: 6 } },
      { from: '2026-11-08 16:00:00', to: '2026-11-08 20:00:00' },
    )!;
    expect(NormalizedPromotionSchema.parse(p)).toMatchObject({ type: 'flash_sale', externalId: '9', productExternalId: '5-6', salePrice: 99_000, originalPrice: 200_000 });
    expect(p.startAt).toEqual(new Date('2026-11-08T09:00:00Z'));
  });
});
