// Kiểm thử nhanh trang /admin: tạo admin tạm, đăng nhập bằng mật khẩu, chụp màn hình, rồi xoá admin tạm.
// Chạy: node apps/web/scripts/admin-smoke.mjs <đường-dẫn-ảnh.png>
import { randomBytes } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { chromium } from 'playwright';

dotenv.config({ path: new URL('../.env.local', import.meta.url).pathname, quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const out = process.argv[2] ?? 'admin.png';
const email = `smoke-${randomBytes(4).toString('hex')}@example.com`;
const password = randomBytes(18).toString('base64url');

const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw error;
const userId = created.user.id;
try {
  await admin.from('admins').insert({ user_id: userId });
  // Đăng nhập qua @supabase/ssr để lấy đúng định dạng cookie phiên.
  const jar = new Map();
  const ssr = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (l) => l.forEach((c) => jar.set(c.name, c.value)) },
  });
  const { error: e2 } = await ssr.auth.signInWithPassword({ email, password });
  if (e2) throw e2;

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1300 }, locale: 'vi-VN' });
  await ctx.addCookies([...jar].map(([name, value]) => ({ name, value, url: 'http://localhost:3000' })));
  const page = await ctx.newPage();
  const res = await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle' });
  console.log('status', res?.status(), 'url', page.url());
  console.log('heading:', await page.locator('h1').first().textContent());
  // Thử 1 server action: thêm rồi xoá từ khoá theo dõi
  await page.fill('input[name=query]', 'smoke test keyword');
  await page.click('button:has-text("Thêm")');
  await page.waitForSelector('text=smoke test keyword', { timeout: 10000 });
  console.log('watch query added');
  await page.screenshot({ path: out });
  await page.locator('li:has-text("smoke test keyword") button:has-text("Xoá")').click();
  await page.waitForSelector('text=smoke test keyword', { state: 'detached', timeout: 10000 });
  console.log('watch query deleted');
  await browser.close();
} finally {
  await admin.auth.admin.deleteUser(userId);
  console.log('cleanup: deleted temp admin');
}
