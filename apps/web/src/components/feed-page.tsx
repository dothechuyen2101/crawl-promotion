import Link from 'next/link';
import { CATEGORIES, CATEGORY_SLUGS, PLATFORM_LABELS, PLATFORMS, PROMO_TYPE_LABELS, PROMO_TYPES, type PromoType } from '@cp/shared';
import { categoryCounts, listPromotions, parseFilter, SORTS, type PromoFilter } from '@/lib/promotions';
import { serverClient } from '@/lib/supabase/server';
import { PromoCard } from './promo-card';

type SP = Record<string, string | string[] | undefined>;

type Patch = Partial<Record<'san' | 'loai' | 'sx' | 'trang' | 'q' | 'that' | 'nhom', string | undefined>>;

/** Tạo link giữ nguyên bộ lọc hiện tại, ghi đè bằng `patch` (giá trị rỗng = bỏ). Đổi bộ lọc thì về trang 1. */
function href(base: string, f: PromoFilter, fixedType: PromoType | undefined, patch: Patch) {
  const params = new URLSearchParams();
  const merged: Patch = {
    san: f.platform,
    nhom: f.category,
    loai: fixedType ? undefined : f.type,
    sx: f.sort === 'moi' ? undefined : f.sort,
    q: f.q,
    that: f.realOnly ? '1' : undefined,
    trang: undefined,
    ...patch,
  };
  for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
  const s = params.toString();
  return s ? `${base}?${s}` : base;
}

export async function FeedPage({
  title,
  basePath,
  fixedType,
  searchParams,
}: {
  title: string;
  basePath: string;
  fixedType?: PromoType;
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const f = parseFilter(sp, fixedType);
  const db = await serverClient();
  const [{ items, total, page, pageSize }, counts] = await Promise.all([listPromotions(db, f), categoryCounts(db, f)]);
  // Nhóm có khuyến mãi, nhiều trước; "Mã toàn sàn" và "Khác" để cuối.
  const cats = CATEGORY_SLUGS.filter((c) => (counts.get(c) ?? 0) > 0 || c === f.category).sort((a, b) => {
    const tail = (x: string) => (x === 'khac' ? 2 : x === 'toan-san' ? 1 : 0);
    return tail(a) - tail(b) || (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
  });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const link = (patch: Patch) => href(basePath, f, fixedType, patch);
  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-3 py-1 text-xs ${active ? 'border-accent bg-accent-soft font-semibold text-accent' : 'border-line bg-card text-muted hover:text-fg'}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-sm text-muted">{total.toLocaleString('vi-VN')} khuyến mãi đang hiệu lực</p>
        </div>
        <form action={basePath} className="flex w-full gap-2 sm:w-auto">
          {f.platform && <input type="hidden" name="san" value={f.platform} />}
          {f.category && <input type="hidden" name="nhom" value={f.category} />}
          {f.sort !== 'moi' && <input type="hidden" name="sx" value={f.sort} />}
          <input
            name="q"
            defaultValue={f.q}
            placeholder="Tìm mã, sản phẩm, shop…"
            className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent sm:w-64"
          />
          <button className="rounded-lg bg-fg px-3 py-2 text-sm font-medium text-bg">Tìm</button>
        </form>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        <Link href={link({ san: '' })} className={chip(!f.platform)}>
          Mọi sàn
        </Link>
        {PLATFORMS.map((p) => (
          <Link key={p} href={link({ san: p })} className={chip(f.platform === p)}>
            {PLATFORM_LABELS[p]}
          </Link>
        ))}
      </div>

      {cats.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          <Link href={link({ nhom: '' })} className={chip(!f.category)}>
            Mọi nhóm
          </Link>
          {cats.map((c) => (
            <Link key={c} href={link({ nhom: c })} className={chip(f.category === c)}>
              {CATEGORIES[c].emoji} {CATEGORIES[c].name} <span className="opacity-60">{counts.get(c) ?? 0}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {!fixedType &&
          PROMO_TYPES.map((t) => (
            <Link key={t} href={link({ loai: f.type === t ? '' : t })} className={chip(f.type === t)}>
              {PROMO_TYPE_LABELS[t]}
            </Link>
          ))}
        {(fixedType === 'deal' || fixedType === 'flash_sale' || f.type === 'deal' || f.type === 'flash_sale') && (
          <Link href={link({ that: f.realOnly ? '' : '1' })} className={chip(!!f.realOnly)} title="Giá hiện tại thấp hơn giá thường 30 ngày qua ít nhất 10%">
            ✓ Chỉ giảm thật
          </Link>
        )}
        <span className="ml-auto text-muted">Sắp xếp:</span>
        {Object.entries(SORTS).map(([k, label]) => (
          <Link key={k} href={link({ sx: k === 'moi' ? '' : k })} className={chip(f.sort === k)}>
            {label}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">
          Chưa có khuyến mãi phù hợp. Thử bỏ bớt bộ lọc hoặc quay lại sau.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <PromoCard key={p.id} p={p} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-2 pt-2 text-sm">
          {page > 1 && (
            <Link className="rounded-lg border border-line bg-card px-3 py-1.5" href={link({ trang: String(page - 1) })}>
              ← Trước
            </Link>
          )}
          <span className="text-muted">
            Trang {page}/{pages}
          </span>
          {page < pages && (
            <Link className="rounded-lg border border-line bg-card px-3 py-1.5" href={link({ trang: String(page + 1) })}>
              Sau →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
