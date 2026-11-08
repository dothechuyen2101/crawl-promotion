'use server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { serverClient } from '@/lib/supabase/server';

export interface LoginState {
  sent?: boolean;
  error?: string;
}

export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = z.email().safeParse(String(form.get('email') ?? '').trim());
  if (!email.success) return { error: 'Email không hợp lệ' };
  const h = await headers();
  const origin = process.env.PUBLIC_SITE_URL ?? `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
  const db = await serverClient();
  const { error } = await db.auth.signInWithOtp({
    email: email.data,
    // Chỉ tài khoản admin đã tạo sẵn mới đăng nhập được (pnpm worker cli make-admin <email>)
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/callback?next=/admin` },
  });
  // Không tiết lộ email có tồn tại hay không.
  if (error && !/signups not allowed|not found/i.test(error.message)) return { error: 'Không gửi được email, thử lại sau.' };
  return { sent: true };
}

export async function signOut() {
  const db = await serverClient();
  await db.auth.signOut();
}
