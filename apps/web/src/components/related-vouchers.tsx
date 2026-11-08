import Link from 'next/link';
import { CATEGORIES } from '@cp/shared';
import type { RelatedVouchers } from '@/lib/promotions';
import { PromoCard } from './promo-card';

/** Khối "Mã giảm giá liên quan" trên trang kết quả tìm giá. */
export function RelatedVouchersSection({ data, query }: { data: RelatedVouchers; query: string }) {
  const cat = data.category ? CATEGORIES[data.category] : null;
  if (data.items.length === 0 && !cat) return null;

  return (
    <section id="ma-giam-gia" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">
          🎟️ Mã giảm giá {cat ? `nhóm ${cat.emoji} ${cat.name}` : `liên quan “${query}”`}
          {data.categoryTotal > 0 && <span className="ml-2 text-sm font-normal text-muted">{data.categoryTotal.toLocaleString('vi-VN')} mã</span>}
        </h2>
        {data.category && data.categoryTotal > data.items.length && (
          <Link href={`/voucher?nhom=${data.category}`} className="text-sm font-medium text-accent hover:underline">
            Xem tất cả →
          </Link>
        )}
      </div>

      {data.items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
          Chưa có mã giảm giá nào cho nhóm này. Hệ thống sẽ cập nhật khi các sàn có mã mới.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((p) => (
            <PromoCard key={p.id} p={p} />
          ))}
        </div>
      )}

      {data.platformWide > 0 && (
        <p className="text-sm text-muted">
          Ngoài ra còn{' '}
          <Link href="/voucher?nhom=toan-san" className="font-medium text-accent hover:underline">
            {data.platformWide.toLocaleString('vi-VN')} mã toàn sàn
          </Link>{' '}
          dùng được cho mọi đơn hàng.
        </p>
      )}
    </section>
  );
}
