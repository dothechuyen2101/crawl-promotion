import PQueue from 'p-queue';
import type { Platform } from '@cp/shared';

/**
 * Mỗi sàn một hàng đợi: tối đa `concurrency` việc song song và `intervalCap` request mỗi `interval` ms.
 * Việc của tính năng tìm giá chạy với priority cao hơn crawl định kỳ.
 */
const LIMITS: Record<Platform, { concurrency: number; intervalCap: number; interval: number }> = {
  shopee: { concurrency: 1, intervalCap: 6, interval: 10_000 },
  tiktok: { concurrency: 1, intervalCap: 6, interval: 10_000 },
  lazada: { concurrency: 1, intervalCap: 8, interval: 10_000 },
  tiki: { concurrency: 2, intervalCap: 15, interval: 10_000 },
  grabfood: { concurrency: 1, intervalCap: 8, interval: 10_000 },
  be: { concurrency: 1, intervalCap: 8, interval: 10_000 },
};

const queues = new Map<Platform, PQueue>();

export function queueFor(platform: Platform): PQueue {
  let q = queues.get(platform);
  if (!q) {
    q = new PQueue(LIMITS[platform]);
    queues.set(platform, q);
  }
  return q;
}

export function queueStats(): Record<string, { size: number; pending: number }> {
  return Object.fromEntries([...queues].map(([p, q]) => [p, { size: q.size, pending: q.pending }]));
}

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(signal.reason);
    }, { once: true });
  });

/** Ngủ ngẫu nhiên trong khoảng [min, max] ms để request trông tự nhiên hơn. */
export const jitter = (min = 300, max = 1200, signal?: AbortSignal) =>
  sleep(min + Math.random() * (max - min), signal);
