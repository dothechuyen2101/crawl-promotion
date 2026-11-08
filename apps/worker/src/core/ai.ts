import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { CATEGORIES, CATEGORY_SLUGS, PLATFORM_LABELS, type CategorySlug, type Platform } from '@cp/shared';
import { env } from '../config.ts';
import { logger } from '../logger.ts';

/**
 * Phân loại shop bằng Claude qua APIMart (cổng trung gian tương thích Claude Messages API).
 * Dùng cho mã giảm giá chỉ có tên shop — bộ từ khoá không đoán được nhưng model thường biết thương hiệu
 * (vd "Audio Technica Store" → tai nghe & loa, "Oral-B Việt Nam" → sức khoẻ).
 */

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!env.APIMART_API_KEY) throw new Error('Thiếu APIMART_API_KEY');
  client ??= new Anthropic({ apiKey: env.APIMART_API_KEY, baseURL: env.AI_BASE_URL, maxRetries: 3, timeout: 120_000 });
  return client;
}

/** Nhóm AI được chọn cho một shop: chỉ các ngành hàng, cộng 'khac' khi không chắc. */
export const SHOP_SLUGS = CATEGORY_SLUGS.filter((s) => s !== 'toan-san' && s !== 'thanh-toan');

/** Gợi ý ranh giới giữa các nhóm — khớp với bộ từ khoá trong packages/shared/src/categories.ts. */
const HINTS: Partial<Record<CategorySlug, string>> = {
  'tra-sua': 'chuỗi trà sữa/cà phê, sản phẩm trà, cà phê',
  'do-an': 'quán ăn, đồ ăn chế biến sẵn, gà rán, pizza',
  'bach-hoa': 'thực phẩm, sữa tươi/sữa người lớn, bánh kẹo, đồ ăn vặt, gia vị, nước ngọt, bia rượu, siêu thị',
  'quan-ao': 'thời trang, đồ lót, đồ ngủ, đồ bơi',
  'giay-tui': 'giày dép, túi xách, balo, ví, vali',
  'phu-kien-thoi-trang': 'đồng hồ, trang sức, kính mắt, thắt lưng, mũ nón thời trang',
  'dien-thoai': 'điện thoại, máy tính bảng',
  'phu-kien-dien-thoai': 'sạc, cáp, pin dự phòng, ốp lưng, thẻ nhớ, USB, phụ kiện công nghệ',
  'am-thanh': 'tai nghe, loa, micro, thiết bị âm thanh',
  'may-tinh': 'laptop, PC, linh kiện, màn hình, bàn phím, chuột, máy in, router wifi',
  'dien-gia-dung': 'nồi cơm, nồi chiên, máy xay, quạt, máy lọc, tủ lạnh, máy giặt, tivi',
  'my-pham': 'mỹ phẩm, chăm sóc da/tóc/cơ thể, dầu gội, sữa tắm, nước hoa, khử mùi',
  'suc-khoe': 'thực phẩm chức năng, vitamin, thiết bị y tế, bàn chải điện, chăm sóc răng miệng, máy massage',
  'nha-cua': 'đồ dùng nhà bếp (không dùng điện), chăn ga gối, nội thất, đèn, nước giặt, đồ tẩy rửa',
  'me-be': 'tã bỉm, sữa bột trẻ em, bình sữa, đồ chơi, đồ cho mẹ bầu và em bé',
  'sach-van-phong': 'sách, truyện, văn phòng phẩm',
  'the-thao': 'thương hiệu thể thao, dụng cụ thể thao, gym, yoga, xe đạp, cắm trại',
  'xe-co': 'phụ kiện ô tô/xe máy, mũ bảo hiểm, dầu nhớt, xe điện',
  'thu-cung': 'thức ăn và phụ kiện thú cưng',
  'dich-vu': 'du lịch, khách sạn, vé, nha khoa, spa',
};

const SYSTEM = [
  'Bạn phân loại các shop trên sàn thương mại điện tử Việt Nam (Shopee, Tiki, Lazada, TikTok Shop) vào nhóm sản phẩm chính mà shop bán.',
  'Mỗi dòng gồm số thứ tự, sàn, tên shop và vài mã giảm giá mẫu của shop (thường không nói gì về sản phẩm).',
  '',
  'Các nhóm (mã — tên: gợi ý):',
  ...SHOP_SLUGS.filter((s) => s !== 'khac').map((s) => `- ${s} — ${CATEGORIES[s].name}${HINTS[s] ? `: ${HINTS[s]}` : ''}`),
  '- khac — Không xác định',
  '',
  'Quy tắc:',
  '- Dựa vào hiểu biết về thương hiệu và ý nghĩa của tên shop (tiếng Việt hoặc tiếng Anh).',
  '- Chỉ chọn một nhóm khi khá chắc chắn shop chủ yếu bán mặt hàng thuộc nhóm đó.',
  '- Chọn "khac" khi không nhận ra thương hiệu và tên shop không gợi ý mặt hàng, hoặc shop bán tạp hoá nhiều ngành không liên quan. Không đoán bừa.',
  '- Trả lời bằng cách gọi công cụ save_categories đúng một lần, có đủ mọi số thứ tự.',
].join('\n');

const TOOL: Anthropic.Tool = {
  name: 'save_categories',
  description: 'Lưu nhóm sản phẩm chính cho từng shop trong danh sách (i là số thứ tự của shop).',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: { i: { type: 'integer' }, slug: { type: 'string', enum: SHOP_SLUGS } },
          required: ['i', 'slug'],
          additionalProperties: false,
        },
      },
    },
    required: ['results'],
    additionalProperties: false,
  },
};

const ToolInputSchema = z.object({ results: z.array(z.object({ i: z.number().int(), slug: z.string() })) });

export interface ShopToClassify {
  platform: Platform;
  shopName: string;
  /** Vài tiêu đề/mô tả mã giảm giá của shop. */
  samples: string[];
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function buildShopPrompt(shops: ShopToClassify[]): string {
  return shops
    .map((s, i) => {
      const samples = s.samples.slice(0, 2).map((t) => `"${clip(t.replace(/\s+/g, ' ').trim(), 90)}"`);
      return `${i}. [${PLATFORM_LABELS[s.platform]}] ${s.shopName}${samples.length ? ` — mã mẫu: ${samples.join('; ')}` : ''}`;
    })
    .join('\n');
}

/** Đọc kết quả từ khối tool_use; trả mảng cùng thứ tự đầu vào (null = model không trả lời / trả nhóm lạ). */
export function parseShopResults(content: Anthropic.ContentBlock[], count: number): (CategorySlug | null)[] {
  const out: (CategorySlug | null)[] = Array.from({ length: count }, () => null);
  const block = content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL.name);
  const parsed = ToolInputSchema.safeParse(block?.input);
  if (!parsed.success) return out;
  for (const { i, slug } of parsed.data.results) {
    if (i >= 0 && i < count && (SHOP_SLUGS as string[]).includes(slug)) out[i] = slug as CategorySlug;
  }
  return out;
}

const BATCH = 40;

export interface AiUsage {
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

/** Phân loại danh sách shop (chia lô 40 shop/lần gọi). Lỗi một lô chỉ bỏ qua lô đó. */
export async function classifyShops(shops: ShopToClassify[]): Promise<{ slugs: (CategorySlug | null)[]; usage: AiUsage }> {
  const slugs: (CategorySlug | null)[] = [];
  const usage: AiUsage = { requests: 0, inputTokens: 0, outputTokens: 0 };
  for (let start = 0; start < shops.length; start += BATCH) {
    const batch = shops.slice(start, start + BATCH);
    try {
      const res = await anthropic().messages.create({
        model: env.AI_MODEL,
        max_tokens: 8000,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: 'auto' },
        messages: [{ role: 'user', content: buildShopPrompt(batch) }],
      });
      usage.requests++;
      usage.inputTokens += res.usage.input_tokens;
      usage.outputTokens += res.usage.output_tokens;
      if (res.stop_reason !== 'tool_use' && res.stop_reason !== 'end_turn') {
        logger.warn({ stop: res.stop_reason, from: start }, 'ai classify: unexpected stop');
      }
      const got = parseShopResults(res.content, batch.length);
      if (got.every((x) => x == null)) logger.warn({ from: start, stop: res.stop_reason }, 'ai classify: no tool result');
      slugs.push(...got);
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) throw err;
      logger.warn({ err: err instanceof Error ? err.message : err, from: start }, 'ai classify batch failed');
      slugs.push(...batch.map(() => null));
    }
  }
  return { slugs, usage };
}
