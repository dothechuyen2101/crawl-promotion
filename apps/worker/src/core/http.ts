import { fetch, ProxyAgent, type Dispatcher } from 'undici';
import type { Platform } from '@cp/shared';
import { proxyFor } from '../config.ts';
import { jitter, queueFor, sleep } from './limiter.ts';

export const DESKTOP_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: string,
  ) {
    super(`HTTP ${status} ${url}: ${body.slice(0, 200)}`);
  }
}

export interface HttpOptions {
  platform: Platform;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  json?: unknown;
  body?: string;
  timeoutMs?: number;
  retries?: number;
  priority?: number;
  signal?: AbortSignal;
}

const agents = new Map<string, Dispatcher>();
function dispatcherFor(platform: Platform): Dispatcher | undefined {
  const proxy = proxyFor(platform);
  if (!proxy) return undefined;
  let a = agents.get(proxy);
  if (!a) {
    a = new ProxyAgent(proxy);
    agents.set(proxy, a);
  }
  return a;
}

function buildUrl(url: string, query?: HttpOptions['query']): string {
  if (!query) return url;
  const u = new URL(url);
  for (const [k, v] of Object.entries(query)) if (v !== undefined) u.searchParams.set(k, String(v));
  return u.toString();
}

async function request(url: string, opts: HttpOptions): Promise<string> {
  const full = buildUrl(url, opts.query);
  const retries = opts.retries ?? 2;
  const headers: Record<string, string> = {
    'user-agent': DESKTOP_UA,
    'accept-language': 'vi-VN,vi;q=0.9,en-US;q=0.6,en;q=0.5',
    accept: 'application/json, text/plain, */*',
    ...opts.headers,
  };
  let body = opts.body;
  if (opts.json !== undefined) {
    body = JSON.stringify(opts.json);
    headers['content-type'] ??= 'application/json';
  }

  return queueFor(opts.platform).add(
    async () => {
      let lastErr: unknown;
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (attempt > 0) await sleep(1000 * 2 ** attempt + Math.random() * 500, opts.signal);
        try {
          const timeout = AbortSignal.timeout(opts.timeoutMs ?? 20_000);
          const res = await fetch(full, {
            method: opts.method ?? (body ? 'POST' : 'GET'),
            headers,
            body,
            dispatcher: dispatcherFor(opts.platform),
            signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
          });
          const text = await res.text();
          if (res.ok) {
            await jitter(150, 600, opts.signal);
            return text;
          }
          lastErr = new HttpError(res.status, full, text);
          // 4xx (trừ 429) là lỗi chắc chắn, không thử lại.
          if (res.status < 500 && res.status !== 429) break;
        } catch (err) {
          if (opts.signal?.aborted) throw err;
          lastErr = err;
        }
      }
      throw lastErr;
    },
    { priority: opts.priority ?? 0 },
  );
}

export async function httpText(url: string, opts: HttpOptions): Promise<string> {
  return request(url, { ...opts, headers: { accept: 'text/html,application/xhtml+xml,*/*;q=0.8', ...opts.headers } });
}

export async function httpJson<T = unknown>(url: string, opts: HttpOptions): Promise<T> {
  const text = await request(url, opts);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Không parse được JSON từ ${url}: ${text.slice(0, 200)}`);
  }
}
