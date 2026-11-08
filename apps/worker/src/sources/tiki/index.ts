import type { Listing } from '@cp/shared';
import { httpJson, httpText } from '../../core/http.ts';
import type { CrawlContext, SearchAdapter, Source } from '../../core/types.ts';
import { extractNextData, htmlTitle, titleFromSlug } from '../common.ts';
import {
  bannerToCampaign,
  COUPON_HUB_URL,
  couponBlocks,
  couponToPromotion,
  flashDealToPromotion,
  itemToDeal,
  itemToListing,
  TIKI,
  type TikiBanner,
  type TikiCoupon,
  type TikiProductItem,
} from './parse.ts';

const opt = (ctx: CrawlContext) => ({ platform: 'tiki' as const, priority: ctx.priority, signal: ctx.signal });

export async function tikiSearch(query: string, ctx: CrawlContext, limit = 40): Promise<TikiProductItem[]> {
  const res = await httpJson<{ data?: TikiProductItem[] }>(`${TIKI}/api/v2/products`, {
    ...opt(ctx),
    query: { limit, q: query, page: 1 },
  });
  return res.data ?? [];
}

/** Trang tổng hợp mã → danh sách mã → chi tiết từng nhóm mã. */
const voucher: Source = {
  id: 'tiki.voucher',
  platform: 'tiki',
  type: 'voucher',
  schedule: '*/30 * * * *',
  description: 'Mã giảm giá trên trang tổng hợp mã của Tiki',
  async *run(ctx) {
    const html = await httpText(COUPON_HUB_URL, opt(ctx));
    const blocks = couponBlocks(extractNextData(html));
    ctx.log.debug({ blocks: blocks.length }, 'tiki coupon blocks');
    for (const b of blocks) {
      const res = await httpJson<{ data?: TikiCoupon[] }>(`${TIKI}/api/v2/events/coupon/v2`, {
        ...opt(ctx),
        query: { codes: b.codes.join(','), id: b.id },
      });
      for (const c of res.data ?? []) {
        const p = couponToPromotion(c);
        if (p) yield p;
      }
    }
  },
};

interface DealsCollection {
  data?: Record<string, unknown>[];
  filters?: { times?: { values?: { query_value: string; from_date: string; to_date: string; active: boolean }[] } };
  paging?: { last_page?: number };
}

const flashSale: Source = {
  id: 'tiki.flash_sale',
  platform: 'tiki',
  type: 'flash_sale',
  schedule: '*/15 * * * *',
  description: 'Flash deal theo khung giờ của Tiki',
  // Tiki có lúc không chạy flash deal nào
  allowEmpty: true,
  async *run(ctx) {
    const base = `https://api.tiki.vn/flashsale/v2/widget/deals/collection`;
    const first = await httpJson<DealsCollection>(base, { ...opt(ctx), query: { per_page: 50, page: 1 } });
    const slots = first.filters?.times?.values ?? [];
    for (const slot of slots.length ? slots : [undefined]) {
      for (let page = 1; page <= 10; page++) {
        const res = await httpJson<DealsCollection>(base, {
          ...opt(ctx),
          query: { per_page: 50, page, time_id: slot?.query_value },
        });
        for (const raw of res.data ?? []) {
          const p = flashDealToPromotion(raw, { from: slot?.from_date, to: slot?.to_date });
          if (p) yield p;
        }
        if (!res.data?.length || page >= (res.paging?.last_page ?? 1)) break;
      }
    }
  },
};

const deal: Source = {
  id: 'tiki.deal',
  platform: 'tiki',
  type: 'deal',
  schedule: '7 */3 * * *',
  description: 'Top Deals của Tiki + sản phẩm giảm ≥30% theo từ khoá theo dõi',
  async *run(ctx) {
    const top = await httpJson<{ items?: TikiProductItem[] }>(`https://api.tiki.vn/raiden/v3/widgets/top_choise`, {
      ...opt(ctx),
      query: { version: 2, _v: 2 },
    });
    for (const it of top.items ?? []) {
      const p = itemToDeal(it);
      if (p) yield p;
    }
    for (const w of await ctx.watchQueries('product')) {
      if (w.platform && w.platform !== 'tiki') continue;
      for (const it of await tikiSearch(w.query, ctx)) {
        const p = itemToDeal(it, 30);
        if (p) yield { ...p, conditions: { ...p.conditions, watchQuery: w.query } };
      }
    }
  },
};

const campaign: Source = {
  id: 'tiki.campaign',
  platform: 'tiki',
  type: 'campaign',
  schedule: '20 7,19 * * *',
  description: 'Banner chiến dịch trên trang chủ Tiki',
  async *run(ctx) {
    const groups = ['banner_carousel_2_8', 'desktop_flash_sale'];
    const seen = new Set<string>();
    for (const group of groups) {
      const res = await httpJson<{ data?: { banners?: TikiBanner[] }[] }>(`https://tka.tiki.vn/widget/api/v1/banners-group`, {
        ...opt(ctx),
        query: { group, platform: 'desktop' },
      });
      for (const b of res.data?.flatMap((g) => g.banners ?? []) ?? []) {
        if (!b.url || seen.has(b.url)) continue;
        seen.add(b.url);
        let title: string | null = null;
        try {
          title = htmlTitle(await httpText(b.url, opt(ctx)))?.replace(/\s*\|\s*Tiki.*$/i, '') ?? null;
        } catch {
          title = titleFromSlug(b.url);
        }
        const p = bannerToCampaign(b, title);
        if (p) yield p;
      }
    }
  },
};

export const tikiSources: Source[] = [voucher, flashSale, deal, campaign];

export const tikiSearchAdapter: SearchAdapter = {
  platform: 'tiki',
  kinds: ['product'],
  async search(query, ctx, opts) {
    const items = await tikiSearch(query, ctx, opts.limit ?? 20);
    return items.filter((it) => it.price > 0).map(itemToListing);
  },
  async resolveUrl(url, ctx) {
    const m = url.match(/tiki\.vn\/.*-p(\d+)\.html/);
    if (!m) return null;
    const spid = new URL(url).searchParams.get('spid') ?? undefined;
    const p = await httpJson<Record<string, any>>(`${TIKI}/api/v2/products/${m[1]}`, {
      ...opt(ctx),
      query: { platform: 'web', spid, version: 3 },
    });
    const seller = p.current_seller ?? {};
    const listing: Listing = itemToListing({
      id: p.id,
      name: p.name,
      url_path: p.url_path,
      price: p.price,
      original_price: p.original_price ?? p.list_price,
      thumbnail_url: p.thumbnail_url,
      seller_id: seller.id,
      seller_name: seller.name,
      seller_product_id: seller.product_id ? Number(seller.product_id) : undefined,
      primary_category_name: p.categories?.name,
    });
    return listing;
  },
  // Tiki chưa có API công khai cho mã của từng shop; dùng mã sàn/freeship đã crawl trong DB.
  async listingVouchers() {
    return [];
  },
};
