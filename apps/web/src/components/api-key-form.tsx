'use client';
import { useActionState } from 'react';
import { createApiKey, type ApiKeyState } from '@/app/admin/actions';
import { CopyButton } from './copy-button';

export function ApiKeyForm() {
  const [state, action, pending] = useActionState<ApiKeyState, FormData>(createApiKey, {});
  return (
    <form action={action} className="space-y-2">
      <div className="flex gap-2">
        <input name="name" placeholder="Tên key (vd: app-di-dong)" className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-1.5 text-sm" />
        <button disabled={pending} className="rounded-lg bg-fg px-3 py-1.5 text-sm text-bg disabled:opacity-60">
          Tạo key
        </button>
      </div>
      {state.key && (
        <p className="rounded-lg bg-warn-soft p-2 text-sm">
          Lưu key này ngay, sẽ không hiện lại: <CopyButton text={state.key} />
        </p>
      )}
      {state.error && <p className="text-sm text-red-500">{state.error}</p>}
    </form>
  );
}
