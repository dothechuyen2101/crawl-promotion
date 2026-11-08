'use client';
import { useActionState } from 'react';
import { sendMagicLink, type LoginState } from './actions';

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, {});
  return (
    <div className="mx-auto max-w-sm space-y-4 py-10">
      <h1 className="text-xl font-bold">Đăng nhập quản trị</h1>
      {state.sent ? (
        <p className="rounded-lg bg-good-soft p-3 text-sm">Nếu email là tài khoản quản trị, bạn sẽ nhận được link đăng nhập trong vài phút.</p>
      ) : (
        <form action={action} className="space-y-3">
          <input name="email" type="email" required placeholder="email@cua-ban.com" className="w-full rounded-lg border border-line bg-card px-3 py-2 outline-none focus:border-accent" />
          <button disabled={pending} className="w-full rounded-lg bg-accent px-3 py-2 font-semibold text-accent-fg disabled:opacity-60">
            {pending ? 'Đang gửi…' : 'Gửi link đăng nhập'}
          </button>
          {state.error && <p className="text-sm text-red-500">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
