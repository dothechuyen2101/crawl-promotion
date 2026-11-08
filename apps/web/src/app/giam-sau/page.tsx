import type { Metadata } from 'next';
import { FeedPage } from '@/components/feed-page';

export const revalidate = 300;
export const metadata: Metadata = { title: 'Sản phẩm giảm sâu' };

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <FeedPage title="Sản phẩm giảm sâu" basePath="/giam-sau" fixedType="deal" searchParams={searchParams} />;
}
