import { hostname } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';
import type { Platform } from '@cp/shared';

const here = dirname(fileURLToPath(import.meta.url));
export const WORKER_ROOT = resolve(here, '..');

dotenv.config({ path: [resolve(WORKER_ROOT, '.env'), resolve(WORKER_ROOT, '../../.env')], quiet: true });

const bool = z
  .string()
  .optional()
  .transform((v) => (v == null ? undefined : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const EnvSchema = z.object({
  SUPABASE_URL: z.url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_ADMIN_CHAT_ID: z.string().min(1).optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),
  ACCESSTRADE_TOKEN: z.string().min(1).optional(),
  PUBLIC_SITE_URL: z.url().optional(),
  WORKER_ID: z.string().default(hostname()),
  DATA_DIR: z.string().default(resolve(WORKER_ROOT, 'data')),
  HEADLESS: bool,
  BROWSER_CHANNEL: z.string().optional(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  /** Proxy dùng chung; có thể ghi đè theo sàn bằng PROXY_URL_SHOPEE, PROXY_URL_LAZADA... */
  PROXY_URL: z.string().optional(),
  /** Key APIMart (cổng trung gian tương thích Claude Messages API) — dùng để AI phân loại nhóm theo tên shop. */
  APIMART_API_KEY: z.string().min(1).optional(),
  AI_BASE_URL: z.url().default('https://api.apimart.ai'),
  AI_MODEL: z.string().min(1).default('claude-haiku-5-5'),
  /** Số shop tối đa gửi cho AI mỗi lần bảo trì (giới hạn chi phí). */
  AI_MAX_SHOPS_PER_RUN: z.coerce.number().int().min(0).default(400),
});

// Supabase API key kiểu mới (sb_secret_...) được chấp nhận như service role key.
export const env = EnvSchema.parse({
  ...process.env,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
});
export const headless = env.HEADLESS ?? true;

export function proxyFor(platform: Platform): string | undefined {
  const specific = process.env[`PROXY_URL_${platform.toUpperCase()}`];
  return specific || env.PROXY_URL || undefined;
}

export const hasDatabase = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
export const hasAI = Boolean(env.APIMART_API_KEY);
