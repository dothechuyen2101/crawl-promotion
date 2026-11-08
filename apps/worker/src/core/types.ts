import type { HanoiDistrict, Listing, NormalizedPromotionInput, Platform, PromoType, SearchKind } from '@cp/shared';
import type { Logger } from '../logger.ts';
import type { BrowserPool } from './browser.ts';

export interface WatchQuery {
  platform: Platform | null;
  query: string;
  kind: SearchKind;
}

export interface CrawlContext {
  log: Logger;
  browser: BrowserPool;
  signal: AbortSignal;
  /** Độ ưu tiên trong hàng đợi của sàn: crawl định kỳ = 0, tìm giá theo yêu cầu = 10. */
  priority: number;
  watchQueries(kind?: SearchKind): Promise<WatchQuery[]>;
}

/** Một nguồn crawl định kỳ (vd "tiki.flash_sale"). */
export interface Source {
  id: string;
  platform: Platform;
  type: PromoType;
  /** cron expression, giờ Việt Nam */
  schedule: string;
  description: string;
  /** Nguồn có thể hợp lệ khi trả 0 bản ghi (vd sàn không có chương trình nào lúc đó). */
  allowEmpty?: boolean;
  /** Bỏ qua khi thiếu cấu hình (vd chưa có ACCESSTRADE_TOKEN). Trả lý do nếu bị tắt. */
  disabledReason?: () => string | null;
  run(ctx: CrawlContext): AsyncIterable<NormalizedPromotionInput>;
  /** Dọn dẹp sau một lượt chạy thành công có ghi DB (không gọi khi --dry-run). */
  afterRun?(ctx: CrawlContext): Promise<void>;
}

export interface SearchOptions {
  district?: HanoiDistrict;
  limit?: number;
}

/** Adapter cho tính năng tìm giá rẻ nhất. */
export interface SearchAdapter {
  platform: Platform;
  kinds: SearchKind[];
  search(query: string, ctx: CrawlContext, opts: SearchOptions): Promise<Listing[]>;
  /** Nhận diện và lấy listing từ link người dùng dán vào. */
  resolveUrl?(url: string, ctx: CrawlContext): Promise<Listing | null>;
  /** Voucher shop/quán (và voucher sàn riêng cho listing) lấy trực tiếp lúc tìm. */
  listingVouchers(listing: Listing, ctx: CrawlContext): Promise<NormalizedPromotionInput[]>;
}
