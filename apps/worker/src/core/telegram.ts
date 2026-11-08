import { fetch } from 'undici';
import { env } from '../config.ts';
import { logger } from '../logger.ts';

export const telegramEnabled = () => Boolean(env.TELEGRAM_BOT_TOKEN);

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Gửi tin nhắn HTML qua Telegram Bot API. Trả false nếu lỗi (không ném để không làm hỏng crawl). */
export async function sendTelegram(chatId: string | number, html: string): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status, body: (await res.text()).slice(0, 300) }, 'telegram send failed');
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err }, 'telegram send error');
    return false;
  }
}

export async function alertAdmin(html: string): Promise<void> {
  if (env.TELEGRAM_ADMIN_CHAT_ID) await sendTelegram(env.TELEGRAM_ADMIN_CHAT_ID, html);
}
