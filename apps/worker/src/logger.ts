import { pino } from 'pino';
import { env } from './config.ts';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { worker: env.WORKER_ID },
  timestamp: pino.stdTimeFunctions.isoTime,
});
export type Logger = typeof logger;
