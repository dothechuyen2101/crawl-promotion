import Link from 'next/link';

const NAV = [
  { href: '/', label: 'Tất cả' },
  { href: '/danh-muc', label: 'Danh mục' },
  { href: '/voucher', label: 'Mã giảm giá' },
  { href: '/flash-sale', label: 'Flash sale' },
  { href: '/giam-sau', label: 'Giảm sâu' },
  { href: '/chien-dich', label: 'Chiến dịch' },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-card/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="shrink-0 text-lg font-bold tracking-tight">
          Săn<span className="text-accent">KM</span>
        </Link>
        <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto text-sm [scrollbar-width:none]">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="shrink-0 rounded-full px-3 py-1.5 text-muted hover:bg-bg hover:text-fg">
              {n.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/tim-gia"
          className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg hover:opacity-90"
        >
          Tìm giá rẻ nhất
        </Link>
      </div>
    </header>
  );
}
