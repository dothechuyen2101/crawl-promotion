import { FeedPage } from '@/components/feed-page';

export const revalidate = 300;

export default function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <FeedPage title="Khuyến mãi mới nhất" basePath="/" searchParams={searchParams} />;
}
