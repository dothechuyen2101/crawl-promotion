import type { Metadata } from 'next';
import Link from 'next/link';
import { CATEGORIES, CATEGORY_GROUPS, CATEGORY_SLUGS, type CategoryGroup } from '@cp/shared';
import { categoryCounts } from '@/lib/promotions';
import { serverClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Danh mục khuyến mãi' };
export const revalidate = 300;

export default async function CategoriesPage() {
  const counts = await categoryCounts(await serverClient(), {});
  const groups = Object.keys(CATEGORY_GROUPS) as CategoryGroup[];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Danh mục</h1>
        <p className="text-sm text-muted">Khuyến mãi đang hiệu lực, chia theo nhóm sản phẩm.</p>
      </div>
      {groups.map((g) => {
        const slugs = CATEGORY_SLUGS.filter((c) => CATEGORIES[c].group === g);
        return (
          <section key={g} className="space-y-2">
            <h2 className="text-sm font-semibold text-muted">{CATEGORY_GROUPS[g]}</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {slugs.map((c) => {
                const n = counts.get(c) ?? 0;
                return (
                  <Link
                    key={c}
                    href={`/?nhom=${c}`}
                    className={`flex items-center gap-3 rounded-xl border border-line bg-card p-3 hover:border-accent ${n === 0 ? 'opacity-50' : ''}`}
                  >
                    <span className="text-2xl">{CATEGORIES[c].emoji}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{CATEGORIES[c].name}</span>
                      <span className="text-xs text-muted">{n.toLocaleString('vi-VN')} khuyến mãi</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
