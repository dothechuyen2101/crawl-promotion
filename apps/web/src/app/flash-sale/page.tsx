import type { Metadata } from 'next';
import { FeedPage } from '@/components/feed-page';

export const revalidate = 300;
export const metadata: Metadata = { title: 'Flash sale' };

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <FeedPage title="Flash sale" basePath="/flash-sale" fixedType="flash_sale" searchParams={searchParams} />;
}
