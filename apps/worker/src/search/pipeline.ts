import {
  matchScore,
  NormalizedPromotionSchema,
  priceOutliers,
  type HanoiDistrict,
  type Listing,
  type Platform,
  type SearchKind,
} from '@cp/shared';
import { bestPrice, shopKey, type PricingResult, type PricingVoucher } from '@cp/shared/pricing';
import type { CrawlContext, SearchAdapter } from '../core/types.ts';
import { SEARCH_ADAPTERS } from '../sources/index.ts';
import { fromNormalized, loadPlatformVouchers, loadShopVouchers } from './vouchers.ts';

/** Thời gian tối đa cho mỗi sàn. */
const PLATFORM_TIMEOUT_MS = 25_000;
/** Số listing khớp nhất mỗi sàn được lấy thêm mã shop và tính giá. */
const TOP_PER_PLATFORM = 8;
/** Điểm khớp tối thiểu để vào nhóm "khớp cao". */
export const HIGH_MATCH = 0.6;

export interface SearchInput {
  query: string;
  inputUrl?: string | null;
  kind: SearchKind;
  district?: HanoiDistrict | null;
  platforms?: Platform[];
}

export interface RankedResult {
  listing: Listing;
  vouchers: PricingVoucher[];
  best: PricingResult;
  matchScore: number;
  isOutlier: boolean;
}

export interface SearchHooks {
  onPlatformDone?: (platform: Platform, count: number, error?: string) => void;
  onResults?: (platform: Platform, results: RankedResult[]) => Promise<void> | void;
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what}: quá ${ms / 1000}s`)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

export function rankResults(results: RankedResult[]): RankedResult[] {
  const high = results.filter((r) => r.matchScore >= HIGH_MATCH);
  const flags = priceOutliers(high.map((r) => r.listing.price));
  high.forEach((r, i) => (r.isOutlier = flags[i]!));
  return [...results].sort((a, b) => {
    const ga = a.matchScore >= HIGH_MATCH && !a.isOutlier ? 0 : 1;
    const gb = b.matchScore >= HIGH_MATCH && !b.isOutlier ? 0 : 1;
    if (ga !== gb) return ga - gb;
    return a.best.effectivePrice - b.best.effectivePrice;
  });
}

async function searchPlatform(
  adapter: SearchAdapter,
  input: SearchInput,
  query: string,
  platformVouchers: PricingVoucher[],
  ctx: CrawlContext,
  pinned: Listing | null,
): Promise<RankedResult[]> {
  let listings = await adapter.search(query, ctx, { district: input.district ?? undefined, limit: 20 });
  if (pinned && pinned.platform === adapter.platform) {
    listings = [pinned, ...listings.filter((l) => l.listingId !== pinned.listingId)];
  }
  const scored = listings
    .map((l) => ({ l, s: pinned?.listingId === l.listingId ? 1 : matchScore(query, l.title).score }))
    .sort((a, b) => b.s - a.s || a.l.price - b.l.price)
    .slice(0, TOP_PER_PLATFORM);

  const now = new Date();
  const out: RankedResult[] = [];
  const knownShopVouchers = await loadShopVouchers(
    scored.filter(({ l }) => l.shopName).map(({ l }) => ({ platform: l.platform, shopName: l.shopName! })),
  );
  for (const { l, s } of scored) {
    let shopVouchers: PricingVoucher[] = [];
    try {
      const raw = await adapter.listingVouchers(l, ctx);
      shopVouchers = raw
        .map((r, i) => {
          const parsed = NormalizedPromotionSchema.safeParse(r);
          return parsed.success ? fromNormalized(parsed.data, `${l.platform}:${l.listingId}:${parsed.data.externalId ?? i}`) : null;
        })
        .filter((v): v is PricingVoucher => v !== null);
    } catch (err) {
      ctx.log.warn({ platform: l.platform, listing: l.listingId, err: String(err) }, 'listingVouchers failed');
    }
    const dbShopVouchers = l.shopName ? (knownShopVouchers.get(`${l.platform}|${shopKey(l.shopName)}`) ?? []) : [];
    const vouchers = [...platformVouchers, ...dbShopVouchers, ...shopVouchers];
    const best = bestPrice({
      platform: l.platform,
      unitPrice: l.price,
      shippingFee: l.shippingFee,
      shopId: l.shopId,
      shopName: l.shopName,
      category: l.category,
      vouchers,
      options: { now },
    });
    out.push({ listing: l, vouchers, best, matchScore: s, isOutlier: false });
  }
  return out;
}

/** Tìm listing trên các sàn, tính tổ hợp voucher tốt nhất và xếp hạng theo giá cuối. */
export async function runSearch(input: SearchInput, ctx: CrawlContext, hooks: SearchHooks = {}): Promise<RankedResult[]> {
  const adapters = SEARCH_ADAPTERS.filter(
    (a) => a.kinds.includes(input.kind) && (!input.platforms?.length || input.platforms.includes(a.platform)),
  );

  // Người dùng dán link: lấy đúng sản phẩm đó và dùng tiêu đề của nó để tìm ở sàn khác.
  let pinned: Listing | null = null;
  let query = input.query.trim();
  if (input.inputUrl) {
    for (const a of adapters) {
      if (!a.resolveUrl) continue;
      try {
        pinned = await a.resolveUrl(input.inputUrl, ctx);
      } catch (err) {
        ctx.log.warn({ platform: a.platform, err: String(err) }, 'resolveUrl failed');
      }
      if (pinned) break;
    }
    if (pinned && !query) query = pinned.title;
  }
  if (!query) return [];

  const vouchersByPlatform = await loadPlatformVouchers(adapters.map((a) => a.platform));
  const all: RankedResult[] = [];
  await Promise.all(
    adapters.map(async (a) => {
      try {
        const results = await withTimeout(
          searchPlatform(a, input, query, vouchersByPlatform.get(a.platform) ?? [], ctx, pinned),
          PLATFORM_TIMEOUT_MS,
          a.platform,
        );
        all.push(...results);
        await hooks.onResults?.(a.platform, results);
        hooks.onPlatformDone?.(a.platform, results.length);
      } catch (err) {
        hooks.onPlatformDone?.(a.platform, 0, err instanceof Error ? err.message : String(err));
      }
    }),
  );
  return rankResults(all);
}
