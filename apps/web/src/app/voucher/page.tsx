import type { Metadata } from 'next';
import { FeedPage } from '@/components/feed-page';

export const revalidate = 300;
export const metadata: Metadata = { title: 'Mã giảm giá' };

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <FeedPage title="Mã giảm giá" basePath="/voucher" fixedType="voucher" searchParams={searchParams} />;
}
