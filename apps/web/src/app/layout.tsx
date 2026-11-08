import type { Metadata } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import { SiteHeader } from '@/components/site-header';
import './globals.css';

const font = Be_Vietnam_Pro({ subsets: ['vietnamese', 'latin'], weight: ['400', '500', '600', '700'], variable: '--font-vn' });

export const metadata: Metadata = {
  title: { default: 'Săn Khuyến Mãi', template: '%s · Săn Khuyến Mãi' },
  description: 'Tổng hợp mã giảm giá, flash sale, deal giảm sâu từ Shopee, TikTok Shop, Lazada, Tiki, GrabFood, Be và tìm giá rẻ nhất.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={font.variable}>
      <body className="min-h-screen font-sans antialiased">
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-4">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-muted">
          Thông tin khuyến mãi được tổng hợp tự động và có thể thay đổi. Giá cuối là ước tính; một số mã có điều kiện riêng theo tài khoản.
        </footer>
      </body>
    </html>
  );
}
