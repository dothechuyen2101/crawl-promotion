'use client';
import { useActionState, useState } from 'react';
import { HANOI_DISTRICTS } from '@cp/shared';
import { createSearch, type SearchFormState } from '@/app/tim-gia/actions';

export function SearchForm({ defaultQuery = '', compact = false }: { defaultQuery?: string; compact?: boolean }) {
  const [state, action, pending] = useActionState<SearchFormState, FormData>(createSearch, {});
  const [kind, setKind] = useState<'product' | 'food'>('product');

  return (
    <form action={action} className={`space-y-3 ${compact ? '' : 'rounded-2xl border border-line bg-card p-4 sm:p-5'}`}>
      <div className="flex gap-1 rounded-lg bg-bg p-1 text-sm sm:w-fit">
        {(['product', 'food'] as const).map((k) => (
          <label
            key={k}
            className={`flex-1 cursor-pointer rounded-md px-3 py-1.5 text-center sm:flex-none ${kind === k ? 'bg-card font-semibold shadow-sm' : 'text-muted'}`}
          >
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
            {k === 'product' ? 'Sản phẩm' : 'Đồ ăn (Hà Nội)'}
          </label>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          name="q"
          required
          minLength={2}
          defaultValue={defaultQuery}
          placeholder={kind === 'product' ? 'Tên sản phẩm (vd: tai nghe sony wh-1000xm5) hoặc dán link sản phẩm' : 'Món ăn (vd: trà sữa, cơm tấm)'}
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2.5 outline-none focus:border-accent"
        />
        {kind === 'food' && (
          <select name="district" defaultValue="hoan-kiem" className="rounded-lg border border-line bg-bg px-3 py-2.5">
            {Object.entries(HANOI_DISTRICTS).map(([k, d]) => (
              <option key={k} value={k}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        <button
          disabled={pending}
          className="rounded-lg bg-accent px-5 py-2.5 font-semibold text-accent-fg hover:opacity-90 disabled:opacity-60"
        >
          {pending ? 'Đang gửi…' : 'Tìm giá rẻ nhất'}
        </button>
      </div>
      {kind === 'food' && (
        <p className="text-xs text-muted">Tìm món trên GrabFood/Be đang được phát triển; hiện kết quả đồ ăn có thể trống.</p>
      )}
      {state.error && <p className="text-sm text-red-500">{state.error}</p>}
    </form>
  );
}
