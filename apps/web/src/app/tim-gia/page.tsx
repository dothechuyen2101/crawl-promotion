import type { Metadata } from 'next';
import { SearchForm } from '@/components/search-form';
import { workerOnline } from '@/lib/search';

export const metadata: Metadata = { title: 'Tìm giá rẻ nhất' };
export const dynamic = 'force-dynamic';

export default async function FindPricePage() {
  const online = await workerOnline().catch(() => false);
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Tìm giá rẻ nhất</h1>
        <p className="text-muted">
          Nhập sản phẩm bạn muốn mua. Hệ thống tìm nơi bán trên các sàn, tự ghép mã shop, mã sàn, mã freeship và ưu đãi
          thanh toán để ra <b className="text-fg">giá cuối thấp nhất</b> cho từng nơi bán.
        </p>
      </div>
      <SearchForm />
      <div className="flex items-center gap-2 text-sm">
        <span className={`size-2 rounded-full ${online ? 'bg-good' : 'bg-red-500'}`} />
        {online ? (
          <span className="text-muted">Máy quét đang hoạt động — kết quả thường có sau 5–20 giây.</span>
        ) : (
          <span className="text-muted">Máy quét đang tạm nghỉ — sẽ hiển thị dữ liệu đã lưu, yêu cầu được xử lý khi máy bật lại.</span>
        )}
      </div>
      <ul className="list-inside list-disc space-y-1 text-sm text-muted">
        <li>Giá cuối là ước tính: một số mã giới hạn lượt, chỉ cho người dùng mới hoặc hạng thành viên.</li>
        <li>Bạn có thể chọn ví/ngân hàng mình có để tính thêm ưu đãi thanh toán.</li>
        <li>Mỗi người được tìm tối đa 10 lần/giờ; tìm lại cùng từ khoá trong 30 phút không tính lượt.</li>
      </ul>
    </div>
  );
}
