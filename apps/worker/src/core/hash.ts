import { createHash } from 'node:crypto';

/** Hash ngắn ổn định cho các phần tử (dùng làm external_id khi sàn không cung cấp id). */
export function stableId(...parts: (string | number | null | undefined)[]): string {
  return createHash('sha1')
    .update(parts.map((p) => (p == null ? '' : String(p))).join('|'))
    .digest('hex')
    .slice(0, 20);
}

export function contentHash(value: unknown): string {
  return createHash('sha1').update(JSON.stringify(value)).digest('hex');
}
