import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import {
  HANOI_DISTRICTS,
  normalizeText,
  PLATFORM_LABELS,
  PLATFORMS,
  PROMO_TYPE_LABELS,
  PROMO_TYPES,
  type HanoiDistrict,
  type Platform,
  type PromoType,
} from '@cp/shared';
import { requestSearch } from '@/lib/search';
import { adminClient } from '@/lib/supabase/admin';

const HELP = [
  '<b>Bot săn khuyến mãi</b>',
  '',
  '/theodoi &lt;từ khoá&gt; — nhận tin khi có khuyến mãi khớp (vd: /theodoi tai nghe)',
  '/bo &lt;từ khoá&gt; — bỏ theo dõi từ khoá',
  '/san shopee,tiki — chỉ nhận từ các sàn này (/san tatca để bỏ lọc)',
  '/loai voucher,flash_sale — chỉ nhận loại này (voucher, flash_sale, deal, campaign; /loai tatca)',
  '/giam 50 — chỉ nhận khuyến mãi giảm từ 50%',
  '/caidat — xem cài đặt hiện tại',
  '/tatthongbao — tạm dừng · /batthongbao — bật lại',
  '',
  '/timgia &lt;tên sản phẩm hoặc link&gt; — tìm nơi bán rẻ nhất sau khi áp mã',
  '/timmon &lt;món&gt; [quận] — tìm món ăn ở Hà Nội (vd: /timmon trà sữa cau-giay)',
].join('\n');

async function reply(chatId: number, html: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }),
  }).catch(() => {});
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function secretOk(req: NextRequest): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const got = req.headers.get('x-telegram-bot-api-secret-token');
  if (!expected || !got) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Sub = { keywords: string[]; platforms: Platform[]; types: PromoType[]; min_discount_pct: number; active: boolean };

async function getSub(chatId: number): Promise<Sub> {
  const { data } = await adminClient()
    .from('subscriptions')
    .select('keywords, platforms, types, min_discount_pct, active')
    .eq('telegram_chat_id', chatId)
    .maybeSingle();
  return data ?? { keywords: [], platforms: [], types: [], min_discount_pct: 0, active: true };
}

async function saveSub(chatId: number, patch: Partial<Sub>) {
  const cur = await getSub(chatId);
  await adminClient()
    .from('subscriptions')
    .upsert({ telegram_chat_id: chatId, ...cur, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'telegram_chat_id' });
}

function describe(s: Sub): string {
  return [
    `Trạng thái: ${s.active ? 'đang nhận thông báo' : 'đã tạm dừng'}`,
    `Từ khoá: ${s.keywords.length ? s.keywords.map(esc).join(', ') : '(chưa có)'}`,
    `Sàn: ${s.platforms.length ? s.platforms.map((p) => PLATFORM_LABELS[p]).join(', ') : 'tất cả'}`,
    `Loại: ${s.types.length ? s.types.map((t) => PROMO_TYPE_LABELS[t]).join(', ') : 'tất cả'}`,
    `Giảm tối thiểu: ${s.min_discount_pct ? `${s.min_discount_pct}%` : 'không giới hạn'}`,
  ].join('\n');
}

const list = (arg: string) => arg.split(/[,\s]+/).map((x) => normalizeText(x).replace(/ /g, '')).filter(Boolean);

async function handle(chatId: number, text: string) {
  const m = text.trim().match(/^\/(\w+)(?:@\w+)?\s*([\s\S]*)$/);
  if (!m) return reply(chatId, 'Gõ /start để xem hướng dẫn.');
  const cmd = m[1]!.toLowerCase();
  const arg = m[2]!.trim();

  switch (cmd) {
    case 'start':
    case 'help':
      await saveSub(chatId, {});
      return reply(chatId, `${HELP}\n\nChat ID của bạn: <code>${chatId}</code>`);
    case 'theodoi': {
      if (!arg) return reply(chatId, 'Ví dụ: /theodoi tai nghe bluetooth');
      const s = await getSub(chatId);
      const kw = arg.slice(0, 60);
      if (s.keywords.length >= 20) return reply(chatId, 'Tối đa 20 từ khoá. Dùng /bo để bỏ bớt.');
      await saveSub(chatId, { keywords: [...new Set([...s.keywords, kw])], active: true });
      return reply(chatId, `Đã theo dõi "<b>${esc(kw)}</b>".`);
    }
    case 'bo': {
      const s = await getSub(chatId);
      const n = normalizeText(arg);
      await saveSub(chatId, { keywords: s.keywords.filter((k) => normalizeText(k) !== n) });
      return reply(chatId, `Đã bỏ "${esc(arg)}".`);
    }
    case 'san': {
      const ps = list(arg).includes('tatca') ? [] : (list(arg).filter((p) => PLATFORMS.includes(p as Platform)) as Platform[]);
      await saveSub(chatId, { platforms: ps });
      return reply(chatId, `Sàn: ${ps.length ? ps.map((p) => PLATFORM_LABELS[p]).join(', ') : 'tất cả'}`);
    }
    case 'loai': {
      const raw = arg.split(/[,\s]+/).map((x) => x.trim().toLowerCase());
      const ts = raw.includes('tatca') ? [] : (raw.filter((t) => PROMO_TYPES.includes(t as PromoType)) as PromoType[]);
      await saveSub(chatId, { types: ts });
      return reply(chatId, `Loại: ${ts.length ? ts.map((t) => PROMO_TYPE_LABELS[t]).join(', ') : 'tất cả'}`);
    }
    case 'giam': {
      const n = Math.min(Math.max(Number(arg.replace('%', '')) || 0, 0), 95);
      await saveSub(chatId, { min_discount_pct: n });
      return reply(chatId, n ? `Chỉ nhận khuyến mãi giảm từ ${n}%.` : 'Đã bỏ giới hạn % giảm.');
    }
    case 'caidat':
      return reply(chatId, `${describe(await getSub(chatId))}\nChat ID: <code>${chatId}</code>`);
    case 'tatthongbao':
    case 'huy':
      await saveSub(chatId, { active: false });
      return reply(chatId, 'Đã tạm dừng thông báo. Gõ /batthongbao để bật lại.');
    case 'batthongbao':
      await saveSub(chatId, { active: true });
      return reply(chatId, 'Đã bật lại thông báo.');
    case 'timgia':
    case 'timmon': {
      if (arg.length < 2) return reply(chatId, cmd === 'timgia' ? 'Ví dụ: /timgia nồi chiên không dầu' : 'Ví dụ: /timmon trà sữa cau-giay');
      let query = arg;
      let district: HanoiDistrict | undefined;
      if (cmd === 'timmon') {
        const last = query.split(/\s+/).pop() ?? '';
        if (last in HANOI_DISTRICTS) {
          district = last as HanoiDistrict;
          query = query.slice(0, -last.length).trim();
        }
      }
      const isUrl = /^https?:\/\//.test(query);
      const res = await requestSearch(
        { query: isUrl ? '' : query.slice(0, 200), inputUrl: isUrl ? query : undefined, kind: cmd === 'timmon' ? 'food' : 'product', district },
        { rateKey: `tg:${chatId}`, notifyChatId: chatId, skipCache: true },
      );
      if ('error' in res) return reply(chatId, esc(res.error));
      return reply(chatId, `⏳ Đang tìm "<b>${esc(query)}</b>"… kết quả sẽ gửi trong ít phút.`);
    }
    default:
      return reply(chatId, 'Không hiểu lệnh. Gõ /start để xem hướng dẫn.');
  }
}

export async function POST(req: NextRequest) {
  if (!secretOk(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const update = (await req.json().catch(() => null)) as { message?: { chat?: { id?: number }; text?: string } } | null;
  const chatId = update?.message?.chat?.id;
  const text = update?.message?.text;
  if (chatId && text) {
    try {
      await handle(chatId, text);
    } catch {
      await reply(chatId, 'Có lỗi xảy ra, thử lại sau.');
    }
  }
  // Luôn trả 200 để Telegram không gửi lại.
  return NextResponse.json({ ok: true });
}
