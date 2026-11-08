import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PLATFORM_LABELS, PROMO_TYPE_LABELS } from '@cp/shared';
import { CopyButton } from '@/components/copy-button';
import { PlatformBadge } from '@/components/platform-badge';
import { PromoCard } from '@/components/promo-card';
import { dateVN, discountLabel, timeLeft, vnd } from '@/lib/format';
import { PROMO_COLUMNS, type PromoListItem } from '@/lib/promotions';
import { serverClient } from '@/lib/supabase/server';

type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await serverClient();
  const { data } = await db.from('promotions').select(PROMO_COLUMNS).eq('id', id).maybeSingle();
  return data as PromoListItem | null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await load((await params).id);
  return p ? { title: `${p.title} – ${PLATFORM_LABELS[p.platform]}` } : { title: 'Không tìm thấy' };
}

export default async function PromoDetail({ params }: Props) {
  const p = await load((await params).id);
  if (!p) notFound();
  const db = await serverClient();
  const { data: related } = await db
    .from('promotions')
    .select(PROMO_COLUMNS)
    .eq('status', 'active')
    .eq('platform', p.platform)
    .eq('type', p.type)
    .neq('id', p.id)
    .order('first_seen_at', { ascending: false })
    .limit(6);
  const label = discountLabel(p);
  const cond = (p.conditions ?? {}) as Record<string, unknown>;
  const notes = [
    p.new_user_only && 'Chỉ áp dụng cho người dùng mới',
    Boolean(cond.appOnly) && 'Chỉ dùng được trên app',
    typeof cond.memberRank === 'string' && `Yêu cầu hạng thành viên: ${cond.memberRank}`,
    p.requires_collect && 'Cần bấm "Lưu" mã trên sàn trước khi dùng',
    p.payment_method && `Áp dụng khi thanh toán bằng ${p.payment_method}`,
    Boolean(cond.detailInApp) && 'Chi tiết điều kiện xem trong app của sàn',
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      <nav className="text-sm text-muted">
        <Link href="/" className="hover:text-fg">Khuyến mãi</Link> / {PROMO_TYPE_LABELS[p.type]}
      </nav>
      <section className="grid gap-5 rounded-2xl border border-line bg-card p-5 md:grid-cols-[220px_1fr]">
        {p.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image_url} alt="" className="aspect-square w-full rounded-xl bg-bg object-cover" />
        ) : (
          <div className="grid aspect-square w-full place-items-center rounded-xl bg-accent-soft text-5xl">🎟</div>
        )}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <PlatformBadge platform={p.platform} />
            <span className="text-sm text-muted">{PROMO_TYPE_LABELS[p.type]}</span>
            {p.status !== 'active' && <span className="rounded bg-warn-soft px-1.5 text-xs">{p.status === 'expired' ? 'Đã hết hạn' : 'Sắp diễn ra'}</span>}
          </div>
          <h1 className="text-xl font-bold leading-snug">{p.title}</h1>
          {p.shop_name && <p className="text-sm text-muted">Shop: {p.shop_name}</p>}

          {p.sale_price != null && (
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-accent">{vnd(p.sale_price)}</span>
              {p.original_price != null && <span className="text-muted line-through">{vnd(p.original_price)}</span>}
              {p.discount_pct != null && <span className="rounded bg-accent-soft px-1.5 text-sm font-semibold text-accent">-{Number(p.discount_pct)}%</span>}
            </div>
          )}
          {label && <p className="text-lg font-semibold">{label}</p>}

          <div className="flex flex-wrap items-center gap-3">
            {p.code && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted">Mã:</span>
                <CopyButton text={p.code} className="px-3 py-1.5 text-sm" />
              </div>
            )}
            <a
              href={`/go/${p.id}`}
              target="_blank"
              rel="nofollow sponsored noopener"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:opacity-90"
            >
              {p.code ? `Dùng mã trên ${PLATFORM_LABELS[p.platform]}` : `Đến ${PLATFORM_LABELS[p.platform]}`}
            </a>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:max-w-md">
            <dt className="text-muted">Bắt đầu</dt>
            <dd>{dateVN(p.start_at)}</dd>
            <dt className="text-muted">Hết hạn</dt>
            <dd>
              {dateVN(p.end_at)} {p.end_at && <span className="text-muted">({timeLeft(p.end_at)})</span>}
            </dd>
            <dt className="text-muted">Cập nhật</dt>
            <dd>{dateVN(p.first_seen_at)}</dd>
          </dl>

          {notes.length > 0 && (
            <ul className="list-inside list-disc rounded-lg bg-warn-soft p-3 text-sm">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          {p.description && <p className="whitespace-pre-line text-sm text-muted">{p.description}</p>}
        </div>
      </section>

      {related && related.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Cùng loại trên {PLATFORM_LABELS[p.platform]}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(related as PromoListItem[]).map((r) => (
              <PromoCard key={r.id} p={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
