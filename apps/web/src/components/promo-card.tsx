import Link from 'next/link';
import { CATEGORIES, isCategorySlug, PROMO_TYPE_LABELS } from '@cp/shared';
import { discountLabel, timeLeft, vnd } from '@/lib/format';
import type { PromoListItem } from '@/lib/promotions';
import { CopyButton } from './copy-button';
import { PlatformBadge } from './platform-badge';

export function PromoCard({ p }: { p: PromoListItem }) {
  const label = discountLabel(p);
  const left = timeLeft(p.end_at);
  const cond = (p.conditions ?? {}) as Record<string, unknown>;
  const hasPrice = p.sale_price != null;

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-line bg-card">
      <Link href={`/km/${p.id}`} className="flex gap-3 p-3">
        {p.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.image_url}
            alt=""
            loading="lazy"
            className="size-20 shrink-0 rounded-lg bg-bg object-cover"
          />
        ) : (
          <div className="grid size-20 shrink-0 place-items-center rounded-lg bg-accent-soft text-2xl">🎟</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <PlatformBadge platform={p.platform} />
            <span className="text-[11px] text-muted">{PROMO_TYPE_LABELS[p.type]}</span>
            {isCategorySlug(p.category_slug) && p.category_slug !== 'khac' && (
              <span className="rounded bg-bg px-1 text-[11px] text-muted">
                {CATEGORIES[p.category_slug].emoji} {CATEGORIES[p.category_slug].name}
              </span>
            )}
            {p.new_user_only && <span className="text-[11px] text-muted">· Người dùng mới</span>}
            {Boolean(cond.appOnly) && <span className="text-[11px] text-muted">· Chỉ trên app</span>}
          </div>
          <h3 className="line-clamp-2 text-sm font-medium leading-snug">{p.title}</h3>
          {p.shop_name && <p className="mt-0.5 truncate text-xs text-muted">{p.shop_name}</p>}
          <DealBadge p={p} />
        </div>
      </Link>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
        {hasPrice ? (
          <div className="flex items-baseline gap-1.5">
            <span className="font-semibold text-accent">{vnd(p.sale_price)}</span>
            {p.original_price != null && <span className="text-xs text-muted line-through">{vnd(p.original_price)}</span>}
            {p.discount_pct != null && (
              <span className="rounded bg-accent-soft px-1 text-xs font-semibold text-accent">-{Number(p.discount_pct)}%</span>
            )}
          </div>
        ) : label ? (
          <span className="text-sm font-medium">{label}</span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {left && <span className={`text-xs ${left === 'Hết hạn' ? 'text-red-500' : 'text-muted'}`}>{left}</span>}
          {p.code ? (
            <CopyButton text={p.code} />
          ) : (
            <a
              href={`/go/${p.id}`}
              rel="nofollow sponsored noopener"
              target="_blank"
              className="rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-accent-fg hover:opacity-90"
            >
              {hasPrice ? 'Mua ngay' : 'Xem'}
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

/** Nhãn đánh giá deal từ lịch sử giá 30 ngày (chỉ hiện khi đã đủ dữ liệu). */
export function DealBadge({ p }: { p: Pick<PromoListItem, 'deal_quality' | 'is_lowest_30d'> }) {
  if (p.deal_quality === 'real') {
    return (
      <span className="mt-1 inline-block rounded bg-good-soft px-1.5 py-0.5 text-[11px] font-medium text-good">
        ✓ Giảm thật{p.is_lowest_30d ? ' · thấp nhất 30 ngày' : ''}
      </span>
    );
  }
  if (p.deal_quality === 'inflated') {
    return (
      <span className="mt-1 inline-block rounded bg-warn-soft px-1.5 py-0.5 text-[11px]" title="Giá gốc niêm yết cao hơn nhiều so với giá bán thường ngày">
        ⚠ Giá gốc có thể bị nâng
      </span>
    );
  }
  return null;
}
