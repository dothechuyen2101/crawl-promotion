import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PLATFORM_LABELS, PLATFORMS, PROMO_TYPE_LABELS, PROMO_TYPES, type Platform, type PromoType } from '@cp/shared';
import { ApiKeyForm } from '@/components/api-key-form';
import { dateVN } from '@/lib/format';
import { WORKER_STALE_MS } from '@/lib/search';
import { serverClient } from '@/lib/supabase/server';
import { addWatchQuery, deleteWatchQuery, logout, revokeApiKey, toggleSource, toggleWatchQuery } from './actions';

export const metadata: Metadata = { title: 'Quản trị', robots: { index: false } };
export const dynamic = 'force-dynamic';

const Card = ({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) => (
  <section className={`rounded-xl border border-line bg-card p-4 ${className}`}>
    <h2 className="mb-3 font-semibold">{title}</h2>
    {children}
  </section>
);

export default async function AdminPage() {
  const db = await serverClient();
  const { data: claims } = await db.auth.getClaims();
  if (!claims) redirect('/login');
  const { data: isAdmin } = await db.rpc('is_admin');
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-10 text-sm">
        <p>Tài khoản {String(claims.claims.email ?? '')} chưa có quyền quản trị.</p>
        <p className="text-muted">
          Chạy trên máy worker: <code className="rounded bg-card px-1">pnpm worker cli make-admin {String(claims.claims.email ?? '<email>')}</code>
        </p>
        <form action={logout}>
          <button className="underline">Đăng xuất</button>
        </form>
      </div>
    );
  }

  const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const countQ = (platform: Platform, type: PromoType) =>
    db.from('promotions').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('platform', platform).eq('type', type);

  const [heartbeats, settings, runs, watch, clicks, subs, keys, counts] = await Promise.all([
    db.from('worker_heartbeat').select('*').order('last_seen_at', { ascending: false }),
    db.from('source_settings').select('*').order('source_id'),
    db.from('crawl_runs').select('*').order('started_at', { ascending: false }).limit(300),
    db.from('watch_queries').select('*').order('created_at', { ascending: false }),
    db.from('clicks').select('platform').gte('created_at', since7d).limit(10_000),
    db.from('subscriptions').select('id', { count: 'exact', head: true }).eq('active', true),
    db.from('api_keys').select('id, name, revoked, created_at, last_used_at').order('created_at', { ascending: false }),
    Promise.all(PLATFORMS.flatMap((p) => PROMO_TYPES.map(async (t) => ({ p, t, n: (await countQ(p, t)).count ?? 0 })))),
  ]);

  const lastRun = new Map<string, NonNullable<typeof runs.data>[number]>();
  for (const r of runs.data ?? []) if (!lastRun.has(r.source_id)) lastRun.set(r.source_id, r);
  const sourceIds = [...new Set([...(settings.data ?? []).map((s) => s.source_id), ...lastRun.keys()])].sort();
  const settingOf = new Map((settings.data ?? []).map((s) => [s.source_id, s]));
  const clickBy = new Map<string, number>();
  for (const c of clicks.data ?? []) clickBy.set(c.platform ?? 'khác', (clickBy.get(c.platform ?? 'khác') ?? 0) + 1);
  const total = counts.reduce((s, c) => s + c.n, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Quản trị</h1>
        <form action={logout} className="text-sm text-muted">
          {String(claims.claims.email ?? '')} · <button className="underline">Đăng xuất</button>
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Máy quét (worker)">
          {(heartbeats.data ?? []).length === 0 && <p className="text-sm text-muted">Chưa có worker nào kết nối.</p>}
          {(heartbeats.data ?? []).map((h) => {
            const online = Date.now() - new Date(h.last_seen_at).getTime() < WORKER_STALE_MS;
            return (
              <div key={h.worker_id} className="flex items-center gap-2 text-sm">
                <span className={`size-2 rounded-full ${online ? 'bg-good' : 'bg-red-500'}`} />
                <b>{h.worker_id}</b>
                <span className="text-muted">{online ? 'online' : `offline từ ${dateVN(h.last_seen_at)}`}</span>
              </div>
            );
          })}
          <p className="mt-3 text-sm text-muted">Người theo dõi Telegram: {subs.count ?? 0}</p>
        </Card>

        <Card title={`Khuyến mãi đang hiệu lực (${total.toLocaleString('vi-VN')})`} className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-1 font-normal">Sàn</th>
                  {PROMO_TYPES.map((t) => (
                    <th key={t} className="py-1 text-right font-normal">{PROMO_TYPE_LABELS[t]}</th>
                  ))}
                  <th className="py-1 text-right font-normal">Click 7 ngày</th>
                </tr>
              </thead>
              <tbody>
                {PLATFORMS.map((p) => (
                  <tr key={p} className="border-t border-line">
                    <td className="py-1">{PLATFORM_LABELS[p]}</td>
                    {PROMO_TYPES.map((t) => (
                      <td key={t} className="py-1 text-right tabular-nums">{counts.find((c) => c.p === p && c.t === t)?.n || '—'}</td>
                    ))}
                    <td className="py-1 text-right tabular-nums">{clickBy.get(p) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title="Nguồn crawl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-1 font-normal">Nguồn</th>
                <th className="py-1 font-normal">Lần chạy cuối</th>
                <th className="py-1 font-normal">Kết quả</th>
                <th className="py-1 font-normal">Lỗi liên tiếp</th>
                <th className="py-1 font-normal" />
              </tr>
            </thead>
            <tbody>
              {sourceIds.map((id) => {
                const s = settingOf.get(id);
                const r = lastRun.get(id);
                const enabled = s?.enabled ?? true;
                return (
                  <tr key={id} className="border-t border-line align-top">
                    <td className="py-1.5 font-mono text-xs">{id}</td>
                    <td className="py-1.5">{r ? dateVN(r.started_at) : '—'}</td>
                    <td className="py-1.5">
                      {r ? (
                        <span className={r.status === 'error' ? 'text-red-500' : ''}>
                          {r.status} · {r.found} bản ghi, {r.inserted} mới
                          {r.error && <span className="block max-w-md truncate text-xs" title={r.error}>{r.error}</span>}
                        </span>
                      ) : '—'}
                    </td>
                    <td className={`py-1.5 ${(s?.consecutive_failures ?? 0) > 0 ? 'text-red-500' : ''}`}>{s?.consecutive_failures ?? 0}</td>
                    <td className="py-1.5 text-right">
                      <form action={toggleSource}>
                        <input type="hidden" name="source_id" value={id} />
                        <input type="hidden" name="enabled" value={String(!enabled)} />
                        <button className={`rounded-md border px-2 py-0.5 text-xs ${enabled ? 'border-line' : 'border-accent text-accent'}`}>
                          {enabled ? 'Tắt' : 'Bật lại'}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Từ khoá theo dõi giảm sâu">
          <form action={addWatchQuery} className="mb-3 flex flex-wrap gap-2">
            <input name="query" placeholder="vd: máy lọc không khí" className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-1.5 text-sm" />
            <select name="platform" className="rounded-lg border border-line bg-bg px-2 py-1.5 text-sm">
              <option value="">Mọi sàn</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>
              ))}
            </select>
            <select name="kind" className="rounded-lg border border-line bg-bg px-2 py-1.5 text-sm">
              <option value="product">Sản phẩm</option>
              <option value="food">Đồ ăn</option>
            </select>
            <button className="rounded-lg bg-fg px-3 py-1.5 text-sm text-bg">Thêm</button>
          </form>
          <ul className="divide-y divide-line text-sm">
            {(watch.data ?? []).map((w) => (
              <li key={w.id} className="flex items-center gap-2 py-1.5">
                <span className={w.enabled ? '' : 'text-muted line-through'}>{w.query}</span>
                <span className="text-xs text-muted">{w.platform ? PLATFORM_LABELS[w.platform] : 'mọi sàn'} · {w.kind === 'food' ? 'đồ ăn' : 'sản phẩm'}</span>
                <form action={toggleWatchQuery} className="ml-auto">
                  <input type="hidden" name="id" value={w.id} />
                  <input type="hidden" name="enabled" value={String(!w.enabled)} />
                  <button className="text-xs underline">{w.enabled ? 'Tạm dừng' : 'Bật'}</button>
                </form>
                <form action={deleteWatchQuery}>
                  <input type="hidden" name="id" value={w.id} />
                  <button className="text-xs text-red-500 underline">Xoá</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="API key">
          <ApiKeyForm />
          <ul className="mt-3 divide-y divide-line text-sm">
            {(keys.data ?? []).map((k) => (
              <li key={k.id} className="flex items-center gap-2 py-1.5">
                <span className={k.revoked ? 'text-muted line-through' : ''}>{k.name}</span>
                <span className="text-xs text-muted">dùng lần cuối: {dateVN(k.last_used_at)}</span>
                {!k.revoked && (
                  <form action={revokeApiKey} className="ml-auto">
                    <input type="hidden" name="id" value={k.id} />
                    <button className="text-xs text-red-500 underline">Thu hồi</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Gọi API với header <code>x-api-key</code>: <code>/api/v1/promotions</code>, <code>/api/v1/export?format=csv|xlsx</code>,{' '}
            <code>/api/v1/best-price?q=…</code>
          </p>
        </Card>
      </div>
    </div>
  );
}
