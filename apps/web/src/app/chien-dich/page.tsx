import type { Metadata } from 'next';
import { FeedPage } from '@/components/feed-page';

export const revalidate = 300;
export const metadata: Metadata = { title: 'Chiến dịch khuyến mãi' };

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <FeedPage title="Chiến dịch khuyến mãi" basePath="/chien-dich" fixedType="campaign" searchParams={searchParams} />;
}
