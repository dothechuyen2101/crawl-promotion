'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PLATFORM_LABELS, type Platform } from '@cp/shared';
import { adviseQuantity, bestPrice, paymentLabel, type PricingOptions } from '@cp/shared/pricing';
import { vnd } from '@/lib/format';
import { HIGH_MATCH, RESULT_COLUMNS, toResultRow, type ResultRow } from '@/lib/results';
import { browserClient } from '@/lib/supabase/client';
import { CopyButton } from './copy-button';
import { PlatformBadge } from './platform-badge';


const TERMINAL = ['done', 'partial', 'error'];
const MAX_WAIT_MS = 90_000;

export interface SearchRequestInfo {
  id: string;
  query: string;
  kind: 'product' | 'food';
  status: string;
  platforms_done: Platform[];
  error: string | null;
}

export function SearchResults({
  request,
  initialResults,
  online,
  fallback,
}: {
  request: SearchRequestInfo;
  initialResults: ResultRow[];
  online: boolean;
  fallback: boolean;
}) {
  const [rows, setRows] = useState<ResultRow[]>(initialResults);
  const [status, setStatus] = useState(request.status);
  const [done, setDone] = useState<Platform[]>(request.platforms_done);
  const [error, setError] = useState(request.error);
  const [timedOut, setTimedOut] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [opts, setOpts] = useState<Required<Pick<PricingOptions, 'paymentMethods' | 'isNewUser' | 'includeRestricted' | 'countCashback'>>>({
    paymentMethods: [],
    isNewUser: false,
    includeRestricted: false,
    countCashback: false,
  });
  const started = useRef(Date.now());

  // Nhận kết quả realtime + kiểm tra trạng thái định kỳ cho tới khi xong.
  useEffect(() => {
    if (fallback || TERMINAL.includes(status)) return;
    const sb = browserClient();
    const upsert = (r: ResultRow) =>
      setRows((prev) => [...prev.filter((x) => !(x.platform === r.platform && x.listing_id === r.listing_id)), r]);
    const channel = sb
      .channel(`search-${request.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'search_results', filter: `request_id=eq.${request.id}` },
        (payload) => payload.new && 'id' in payload.new && upsert(toResultRow(payload.new as Record<string, unknown>)),
      )
      .subscribe();
    const timer = setInterval(async () => {
      const { data } = await sb.from('search_requests').select('status, platforms_done, error').eq('id', request.id).maybeSingle();
      if (data) {
        setStatus(data.status);
        setDone(data.platforms_done);
        setError(data.error);
        if (TERMINAL.includes(data.status)) {
          // Lấy lại toàn bộ để chắc không sót bản ghi realtime.
          const { data: all } = await sb.from('search_results').select(RESULT_COLUMNS).eq('request_id', request.id);
          if (all) setRows(all.map((r) => toResultRow(r as Record<string, unknown>)));
        }
      }
      if (Date.now() - started.current > MAX_WAIT_MS) setTimedOut(true);
    }, 2000);
    return () => {
      clearInterval(timer);
      void sb.removeChannel(channel);
    };
  }, [request.id, status, fallback]);

  const paymentChoices = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) for (const v of r.vouchers) if (v.scope === 'payment' && v.paymentMethod) set.add(v.paymentMethod);
    return [...set].sort();
  }, [rows]);

  const computed = useMemo(() => {
    const now = new Date();
    return rows
      .map((r) => {
        const input = {
          platform: r.platform,
          unitPrice: r.price,
          quantity,
          shippingFee: r.shipping_fee,
          shopId: r.shop_id,
          shopName: r.shop_name,
          category: r.category,
          vouchers: r.vouchers,
          options: { ...opts, now },
        };
        const best = bestPrice(input);
        const advice = quantity === 1 ? adviseQuantity(input, 3) : null;
        return { r, best, advice, good: r.match_score >= HIGH_MATCH && !r.is_outlier };
      })
      .sort((a, b) => a.best.effectivePrice - b.best.effectivePrice);
  }, [rows, quantity, opts]);

  const good = computed.filter((c) => c.good);
  const other = computed.filter((c) => !c.good);
  const searching = !fallback && !TERMINAL.includes(status) && !timedOut;
  const cheapest = good[0];

  return (
    <div className="space-y-5">
      {!online && (
        <div className="rounded-xl bg-warn-soft p-3 text-sm">
          Máy quét đang tạm nghỉ. {fallback ? 'Đang hiển thị dữ liệu đã lưu trước đó (có thể cũ).' : 'Yêu cầu sẽ được xử lý khi máy bật lại.'}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {searching ? (
          <>
            <span className="size-2 animate-pulse rounded-full bg-accent" />
            <span>Đang tìm…</span>
          </>
        ) : status === 'error' ? (
          <span className="text-red-500">Tìm kiếm lỗi{error ? `: ${error}` : ''}</span>
        ) : timedOut && !TERMINAL.includes(status) ? (
          <span className="text-muted">Đang chờ máy quét lâu hơn bình thường…</span>
        ) : (
          <span className="text-muted">Đã xong · {rows.length} nơi bán</span>
        )}
        {done.map((p) => (
          <span key={p} className="rounded-full border border-line bg-card px-2 py-0.5 text-xs">
            {PLATFORM_LABELS[p]} ✓
          </span>
        ))}
        {status === 'partial' && error && <span className="text-xs text-muted">(một số sàn lỗi: {error})</span>}
      </div>

      <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-card p-3 text-sm">
        <label className="flex items-center gap-2">
          Số lượng
          <select value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="rounded-md border border-line bg-bg px-2 py-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={opts.isNewUser} onChange={(e) => setOpts({ ...opts, isNewUser: e.target.checked })} />
          Tôi là người dùng mới
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={opts.includeRestricted} onChange={(e) => setOpts({ ...opts, includeRestricted: e.target.checked })} />
          Tính cả mã theo hạng thành viên
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={opts.countCashback} onChange={(e) => setOpts({ ...opts, countCashback: e.target.checked })} />
          Tính cả hoàn xu/hoàn tiền
        </label>
        {paymentChoices.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted">Ví/ngân hàng bạn có:</span>
            {paymentChoices.map((m) => {
              const on = opts.paymentMethods.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() =>
                    setOpts({ ...opts, paymentMethods: on ? opts.paymentMethods.filter((x) => x !== m) : [...opts.paymentMethods, m] })
                  }
                  className={`rounded-full border px-2 py-0.5 text-xs ${on ? 'border-accent bg-accent-soft text-accent' : 'border-line'}`}
                >
                  {paymentLabel(m)}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {cheapest && (
        <p className="text-sm">
          Rẻ nhất: <b className="text-accent">{vnd(cheapest.best.perUnit)}</b>
          {quantity > 1 && '/cái'} trên {PLATFORM_LABELS[cheapest.r.platform]}
          {cheapest.best.savings > 0 && <> (tiết kiệm {vnd(cheapest.best.savings)})</>}
        </p>
      )}

      {good.length === 0 && !searching && (
        <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">
          {request.kind === 'food'
            ? 'Chưa hỗ trợ tìm món trên GrabFood/Be. Tính năng này đang được phát triển.'
            : 'Không tìm thấy nơi bán khớp với sản phẩm. Thử gõ tên ngắn gọn hơn hoặc kèm mã model.'}
        </div>
      )}

      <div className="space-y-3">
        {good.map((c, i) => (
          <ResultCard key={`${c.r.platform}-${c.r.listing_id}`} c={c} rank={i + 1} quantity={quantity} />
        ))}
      </div>

      {other.length > 0 && (
        <details className="rounded-xl border border-line bg-card p-3">
          <summary className="cursor-pointer text-sm text-muted">Có thể liên quan ({other.length}) — khớp thấp hoặc giá bất thường</summary>
          <div className="mt-3 space-y-3">
            {other.map((c) => (
              <ResultCard key={`${c.r.platform}-${c.r.listing_id}`} c={c} quantity={quantity} />
            ))}
          </div>
        </details>
      )}

      <p className="text-xs text-muted">
        Giá cuối là ước tính dựa trên mã đang có; mã có thể hết lượt, cần bấm “Lưu” trước, hoặc có điều kiện riêng theo tài khoản.
      </p>
    </div>
  );
}

type Computed = {
  r: ResultRow;
  best: ReturnType<typeof bestPrice>;
  advice: ReturnType<typeof adviseQuantity> | null;
};

function ResultCard({ c, rank, quantity }: { c: Computed; rank?: number; quantity: number }) {
  const { r, best, advice } = c;
  const buyHref = typeof r.id === 'number' ? `/go/${r.id}` : r.url;
  return (
    <article className="flex gap-3 rounded-xl border border-line bg-card p-3">
      {r.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.image_url} alt="" loading="lazy" className="size-20 shrink-0 rounded-lg bg-bg object-cover sm:size-24" />
      ) : (
        <div className="size-20 shrink-0 rounded-lg bg-bg sm:size-24" />
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          {rank && <span className="text-xs font-bold text-muted">#{rank}</span>}
          <PlatformBadge platform={r.platform} />
          {r.shop_name && <span className="truncate text-xs text-muted">{r.shop_name}</span>}
        </div>
        <h3 className="line-clamp-2 text-sm leading-snug">{r.title}</h3>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-lg font-bold text-accent">{vnd(best.effectivePrice)}</span>
          {best.savings > 0 && <span className="text-xs text-muted line-through">{vnd(best.subtotal + best.shippingFee)}</span>}
          {best.savings > 0 && <span className="rounded bg-good-soft px-1 text-xs font-medium text-good">-{vnd(best.savings)}</span>}
          {quantity > 1 && <span className="text-xs text-muted">({vnd(best.perUnit)}/cái)</span>}
          {!best.shippingKnown && <span className="text-xs text-muted">· chưa gồm phí ship</span>}
        </div>
        {best.applied.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {best.applied.map((a) => (
              <li key={a.voucher.id} className="flex items-center gap-1 text-xs">
                {a.voucher.code ? <CopyButton text={a.voucher.code} /> : <span className="rounded-md bg-bg px-1.5 py-1">{a.voucher.title.slice(0, 40)}</span>}
                <span className="text-muted">
                  {a.cashback ? 'hoàn' : '-'}
                  {vnd(a.amount)}
                </span>
                {a.voucher.requiresCollect && <span className="rounded bg-warn-soft px-1">cần Lưu</span>}
              </li>
            ))}
          </ul>
        )}
        {advice?.suggestMore && (
          <p className="text-xs text-good">
            💡 Mua {advice.best.quantity} cái: mỗi cái còn {vnd(advice.best.perUnit)} (đạt điều kiện mã tốt hơn)
          </p>
        )}
      </div>
      <a
        href={buyHref}
        target="_blank"
        rel="nofollow sponsored noopener"
        className="self-center rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-fg hover:opacity-90"
      >
        Mua
      </a>
    </article>
  );
}
