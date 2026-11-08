import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { buildShopPrompt, parseShopResults, SHOP_SLUGS } from '../src/core/ai.ts';

const toolUse = (input: unknown): Anthropic.ContentBlock[] =>
  [{ type: 'tool_use', id: 'toolu_1', name: 'save_categories', input, caller: { type: 'direct' } }] as unknown as Anthropic.ContentBlock[];

describe('AI phân loại shop', () => {
  it('dựng prompt có số thứ tự, sàn, tên shop và mã mẫu (cắt ngắn)', () => {
    const p = buildShopPrompt([
      { platform: 'shopee', shopName: 'Audio Technica Store', samples: ['Giảm 10K cho đơn hàng từ 259K'] },
      { platform: 'tiki', shopName: 'Oral-B Việt Nam', samples: ['x'.repeat(200), 'b', 'c'] },
    ]);
    const lines = p.split('\n');
    expect(lines[0]).toBe('0. [Shopee] Audio Technica Store — mã mẫu: "Giảm 10K cho đơn hàng từ 259K"');
    expect(lines[1]).toMatch(/^1\. \[Tiki\] Oral-B Việt Nam — mã mẫu: "x{89}…"; "b"$/);
  });

  it('đọc kết quả theo đúng thứ tự, bỏ chỉ số ngoài phạm vi và nhóm lạ', () => {
    const out = parseShopResults(
      toolUse({
        results: [
          { i: 1, slug: 'suc-khoe' },
          { i: 0, slug: 'am-thanh' },
          { i: 2, slug: 'thanh-toan' }, // không phải ngành hàng
          { i: 7, slug: 'my-pham' }, // ngoài phạm vi
        ],
      }),
      3,
    );
    expect(out).toEqual(['am-thanh', 'suc-khoe', null]);
  });

  it('không có tool_use hoặc sai schema → toàn null', () => {
    expect(parseShopResults([{ type: 'text', text: 'xin lỗi', citations: null }] as unknown as Anthropic.ContentBlock[], 2)).toEqual([null, null]);
    expect(parseShopResults(toolUse({ results: 'oops' }), 2)).toEqual([null, null]);
  });

  it('chỉ cho chọn ngành hàng + khac', () => {
    expect(SHOP_SLUGS).toContain('khac');
    expect(SHOP_SLUGS).not.toContain('toan-san');
    expect(SHOP_SLUGS).not.toContain('thanh-toan');
  });
});
