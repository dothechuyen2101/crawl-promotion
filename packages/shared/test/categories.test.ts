import { describe, expect, it } from 'vitest';
import { classifyCategory, type ClassifyInput } from '../src/index.ts';

const c = (i: ClassifyInput | string) => classifyCategory(typeof i === 'string' ? { title: i } : i).slug;

describe('classifyCategory — dữ liệu thật', () => {
  it.each([
    ['Trà Sữa Trân Châu Đường Đen size L', 'tra-sua'],
    ['Combo Cơm Tấm Sườn Bì Chả', 'do-an'],
    ['Ốp lưng iPhone 15 Pro Max silicon trong suốt', 'phu-kien-dien-thoai'],
    ['Điện thoại Samsung Galaxy A55 5G 8GB/128GB', 'dien-thoai'],
    ['Tai nghe Bluetooth Chụp Tai Sony WH-1000XM5', 'am-thanh'],
    ['Nồi chiên không dầu BlueStone AFB-5856 7 Lít', 'dien-gia-dung'],
    ['Áo thun nam cổ tròn cotton', 'quan-ao'],
    ['Giày thể thao nữ sneaker trắng', 'giay-tui'],
    ['Sữa rửa mặt Cetaphil 500ml', 'my-pham'],
    ['Tã quần Bobby size L 54 miếng', 'me-be'],
    ['Máy tính bảng iPad Gen 11 (A16) WiFi', 'dien-thoai'],
  ])('%s → %s', (title, slug) => {
    expect(c(title)).toBe(slug);
  });

  it('dùng danh mục gốc của sàn (Tiki)', () => {
    expect(c({ title: 'Nhà Giả Kim (Tái Bản)', category: 'Tiểu Thuyết Phương Tây' })).toBe('sach-van-phong');
    expect(c({ title: 'Đắc Nhân Tâm', category: 'Sách tư duy - Kỹ năng sống' })).toBe('sach-van-phong');
    expect(c({ title: 'Bình giữ nhiệt Lock&Lock 500ml', category: 'Bình giữ nhiệt' })).toBe('nha-cua');
  });

  it('mã AccessTrade dạng "[Shop - Ngành]-Giảm ..."', () => {
    expect(c({ title: '[HPS - Phụ kiện công nghệ]-Giảm 20,000 VNĐ cho đơn tối thiểu 80,000 VNĐ', category: 'Phụ kiện công nghệ', shopName: 'HPS' })).toBe('phu-kien-dien-thoai');
    expect(c({ title: '[ARDILLA - Quần áo trẻ em]-Giảm 15,000 VNĐ', category: 'Quần áo trẻ em', shopName: 'ARDILLA' })).toBe('quan-ao');
    expect(c({ title: '[Mercy Cosmetics]-Giảm 15K cho đơn hàng từ 350K', shopName: 'Mercy Cosmetics' })).toBe('my-pham');
    expect(c({ title: '[Miley Lingerie]-Giảm 50K cho đơn hàng từ 599K', shopName: 'Miley Lingerie' })).toBe('quan-ao');
    expect(c({ title: '[Nova Computer]-Giảm 15K cho đơn hàng từ 279K', shopName: 'Nova Computer' })).toBe('may-tinh');
    expect(c({ title: '[Trung Nguyên Legend]-Giảm 20K cho đơn hàng từ 300K', shopName: 'Trung Nguyên Legend' })).toBe('tra-sua');
  });

  it('không đủ tín hiệu → khác (không đoán bừa)', () => {
    expect(c({ title: '[MuaMuaOnline]-Giảm 10K cho đơn hàng từ 259K', shopName: 'MuaMuaOnline' })).toBe('khac');
    expect(c('Xả Kho Giảm Sốc')).toBe('khac');
  });

  it('mã toàn sàn / chiến dịch toàn sàn', () => {
    expect(c({ title: 'Giảm 15% – Cho đơn hàng từ 99K', scope: 'platform' })).toBe('toan-san');
    expect(c({ title: 'Giảm 50K – Cho đơn hàng từ 45K', scope: 'freeship' })).toBe('toan-san');
    expect(c({ title: 'MÙA SALE HUYỀN THOẠI 2026', type: 'campaign' })).toBe('toan-san');
    // mã toàn sàn nhưng ghi rõ ngành hàng thì vẫn theo ngành
    expect(c({ title: 'Giảm 10% cho Mỹ phẩm', scope: 'platform' })).toBe('my-pham');
  });

  it('sách Tiki đặt tên "Sách ..." / danh mục "Truyện ..."', () => {
    expect(c({ title: 'Sách Chính Trị Luận', category: 'Triết học' })).toBe('sach-van-phong');
    expect(c({ title: 'Truyện Cười Việt Nam Thời @', category: 'Truyện cười' })).toBe('sach-van-phong');
    expect(c({ title: 'Sách Món Việt là nhà', category: 'Sách Nấu ăn' })).toBe('sach-van-phong');
  });

  it('tên shop là thương hiệu / từ tiếng Anh', () => {
    const shop = (name: string) => c({ title: `[${name}]-Giảm 50K cho đơn hàng từ 299K`, shopName: name });
    expect(shop('the SAEM Official Store')).toBe('my-pham');
    expect(shop('CANIFA Official Store')).toBe('quan-ao');
    expect(shop('TLEE JEWELRY Official Store')).toBe('phu-kien-thoi-trang');
    expect(shop('VARO Helmets')).toBe('xe-co');
    expect(shop('THAIHABOOKS Official Store')).toBe('sach-van-phong');
    expect(shop('Orico Official Mall.VN')).toBe('phu-kien-dien-thoai');
    expect(shop('MIDORI BAG COLLECTION')).toBe('giay-tui');
  });

  it('Tiki: sức khoẻ, gia dụng, nhà cửa', () => {
    expect(c({ title: 'Bao cao su Durex Performa 12 bao', category: 'Bao cao su' })).toBe('suc-khoe');
    expect(c({ title: 'Nồi Điện Đa Năng Mini BEAR DRG-C12K1', category: 'Nồi đa năng' })).toBe('dien-gia-dung');
    expect(c({ title: 'Cốc giữ nhiệt inox 304 Elmich EL-8380', category: 'Ly giữ nhiệt' })).toBe('nha-cua');
    expect(c({ title: 'Lăn Khử Mùi Cao Cấp Enchanteur Charming 50ml', category: 'Khử mùi cho nữ' })).toBe('my-pham');
  });

  it('ưu đãi thanh toán', () => {
    expect(c({ title: 'be x VPBank NEO 20%', paymentMethod: 'vpbank' })).toBe('thanh-toan');
    expect(c('Giảm 50K khi thanh toán bằng thẻ tín dụng Techcombank')).toBe('thanh-toan');
  });

  it('GrabFood chỉ xếp vào nhóm ăn uống', () => {
    expect(c({ title: 'Trà sữa Tocotoco - Cầu Giấy', platform: 'grabfood' })).toBe('tra-sua');
  });
});

describe('classifyCategory — bẫy bỏ dấu', () => {
  it.each([
    // "sạch" không phải "sách"
    ['Nước rửa chén Sunlight làm sạch nhanh 750ml', 'nha-cua'],
    // "lâu" không phải "lẩu"
    ['Bình giữ nhiệt inox giữ nóng lâu 12 giờ', 'nha-cua'],
    // "giấy vệ sinh" không phải "giày"
    ['Giấy vệ sinh cao cấp 10 cuộn', 'nha-cua'],
    // "tham gia" không phải "thảm"
    ['Tham gia ngay chương trình khuyến mãi', 'khac'],
    // "truyền thống" không phải "truyện"
    ['Áo dài truyền thống nữ', 'quan-ao'],
    // ốp lưng iPhone là phụ kiện, không phải điện thoại
    ['Kính cường lực iPhone 16 Pro', 'phu-kien-dien-thoai'],
    // tủ quần áo là nội thất
    ['Tủ quần áo nhựa 4 tầng', 'nha-cua'],
    // mũ bảo hiểm là đồ xe máy, không phải dịch vụ bảo hiểm
    ['Mũ bảo hiểm nửa đầu Royal', 'xe-co'],
  ])('%s → %s', (title, slug) => {
    expect(c(title)).toBe(slug);
  });
});
