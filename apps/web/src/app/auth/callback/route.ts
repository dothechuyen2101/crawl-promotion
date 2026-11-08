import { NextResponse, type NextRequest } from 'next/server';
import { serverClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/admin';
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/admin';
  if (code) {
    const db = await serverClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext, url.origin));
  }
  return NextResponse.redirect(new URL('/login?loi=1', url.origin));
}
