import type { Platform, PromoType, VoucherScope } from './enums.ts';
import { normalizeText } from './text.ts';

/**
 * Nhóm sản phẩm hiển thị cho người dùng. Từ khoá viết KHÔNG DẤU, chữ thường, khớp nguyên cụm từ.
 * Vì bỏ dấu dễ trùng nghĩa (giày/giấy → "giay", dép/đẹp → "dep", sữa/sửa → "sua", trà/trả → "tra"),
 * các từ ngắn phải viết kèm ngữ cảnh (vd "giay the thao", "sua tuoi", "tra sua").
 * Mỗi từ khoá có trọng số (mặc định 1); cụm đặc trưng cho trọng số cao để thắng các cụm chung chung.
 */
export const CATEGORY_GROUPS = {
  an_uong: 'Ăn uống',
  thoi_trang: 'Thời trang',
  dien_tu: 'Điện tử',
  lam_dep: 'Làm đẹp & sức khoẻ',
  nha_cua: 'Nhà cửa & gia đình',
  khac: 'Khác',
} as const;
export type CategoryGroup = keyof typeof CATEGORY_GROUPS;

interface CategoryDef {
  name: string;
  emoji: string;
  group: CategoryGroup;
  /** [từ khoá, trọng số] */
  keywords: [string, number][];
}

const kw = (weight: number, ...words: string[]): [string, number][] => words.map((w) => [w, weight]);

export const CATEGORIES = {
  'tra-sua': {
    name: 'Trà sữa & đồ uống',
    emoji: '🧋',
    group: 'an_uong',
    keywords: [
      ...kw(2, 'tea', 'milk tea'),
      ...kw(3, 'tra sua', 'tra chanh', 'tra dao', 'tra trai cay', 'tra o long', 'tra thai', 'ca phe', 'cafe', 'coffee', 'sinh to', 'nuoc ep', 'smoothie', 'matcha latte', 'bubble tea', 'tran chau'),
      ...kw(3, 'highlands', 'phuc long', 'the coffee house', 'starbucks', 'gong cha', 'koi the', 'tocotoco', 'phe la', 'katinat', 'mixue', 'trung nguyen', 'cong caphe', 'passio'),
      ...kw(1, 'do uong', 'nuoc uong', 'tra xanh'),
    ],
  },
  'do-an': {
    name: 'Đồ ăn',
    emoji: '🍜',
    group: 'an_uong',
    keywords: [
      ...kw(3, 'com tam', 'com ga', 'com rang', 'com van phong', 'bun bo', 'bun cha', 'bun dau', 'pho bo', 'pho ga', 'mi cay', 'banh mi', 'ga ran', 'pizza', 'burger', 'hamburger', 'lau thai', 'lau nuong', 'lau ga', 'lau bo', 'lau hai san', 'nuoc lau', 'buffet lau', 'do nuong', 'sushi', 'tokbokki', 'banh trang tron', 'xoi', 'chao ga', 'chao long', 'do an vat', 'an vat', 'mi quang', 'hu tieu', 'banh cuon'),
      ...kw(3, 'kfc', 'lotteria', 'jollibee', 'mcdonald', 'texas chicken', 'domino', 'the pizza company', 'popeyes'),
      ...kw(1, 'do an', 'mon an', 'nha hang', 'quan an'),
    ],
  },
  'bach-hoa': {
    name: 'Bách hoá & thực phẩm',
    emoji: '🛒',
    group: 'an_uong',
    keywords: [
      ...kw(3, 'sua dau nanh', 'dau dau nanh', 'hai san kho', 'haisan', 'food', 'foods', 'mart', 'vinasoy', 'nuoc tuong'),
      ...kw(3, 'bach hoa', 'sua tuoi', 'sua chua', 'sua hat', 'mi goi', 'mi an lien', 'banh keo', 'keo deo', 'snack', 'gia vi', 'nuoc mam', 'dau an', 'ngu coc', 'hat dinh duong', 'thuc pham', 'do kho', 'nuoc ngot', 'bia lon', 'thung bia', 'ruou vang', 'nuoc khoang'),
      ...kw(3, 'vinamilk', 'th true milk', 'nestle', 'milo', 'nescafe', 'omachi', 'hao hao', 'acecook', 'orion', 'oishi'),
      ...kw(1, 'gao', 'trai cay', 'rau cu', 'thit', 'hai san', 'banh quy'),
    ],
  },
  'quan-ao': {
    name: 'Quần áo',
    emoji: '👕',
    group: 'thoi_trang',
    keywords: [
      ...kw(3, 'wear', 'clothing', 'apparel', 'denim', 'jeans', 'canifa', 'yody', 'coolmate', 'routine', 'ivy moda', 'owen', 'aristino', 'uniqlo'),
      ...kw(3, 'quan ao', 'ao thun', 'ao phong', 'ao so mi', 'ao khoac', 'ao polo', 'ao len', 'ao hoodie', 'hoodie', 'quan jean', 'quan au', 'quan short', 'chan vay', 'vay dam', 'dam maxi', 'dam cong so', 'dam du tiec', 'ao dai', 'do bo', 'do ngu', 'pijama', 'pyjama', 'do lot', 'lingerie', 'bikini', 'do boi', 'quan lot', 'ao nguc', 'xuong may'),
      ...kw(2, 'thoi trang', 'fashion', 'closet', 'boutique', 'local brand', 'unisex'),
    ],
  },
  'giay-tui': {
    name: 'Giày dép & túi xách',
    emoji: '👟',
    group: 'thoi_trang',
    keywords: [
      ...kw(3, 'bag', 'bags', 'shoes', 'shoe', 'footwear', 'bitis', 'handbag', 'backpack'),
      ...kw(3, 'giay the thao', 'giay sneaker', 'sneaker', 'giay cao got', 'giay da', 'giay tay', 'giay boot', 'giay luoi', 'giay nam', 'giay nu', 'giay chay bo', 'dep le', 'dep tong', 'dep quai', 'dep sandal', 'sandal', 'dep nam', 'dep nu', 'tui xach', 'balo', 'ba lo', 'vi da nam', 'vi da nu', 'vi cam tay', 'bop vi', 'tui deo cheo', 'vali', 'tui tote'),
    ],
  },
  'phu-kien-thoi-trang': {
    name: 'Đồng hồ & trang sức',
    emoji: '⌚',
    group: 'thoi_trang',
    keywords: [
      ...kw(3, 'jewelry', 'jewellery', 'watch', 'watches', 'pnj', 'doji', 'trang suc bac'),
      ...kw(3, 'dong ho', 'trang suc', 'nhan bac', 'day chuyen', 'bong tai', 'vong tay', 'lac tay', 'kinh mat', 'gong kinh', 'that lung', 'mu luoi trai', 'non bucket', 'khan choang', 'kep toc', 'phu kien thoi trang', 'bac 925', 'vang 18k'),
    ],
  },
  'dien-thoai': {
    name: 'Điện thoại & máy tính bảng',
    emoji: '📱',
    group: 'dien_tu',
    keywords: [
      ...kw(3, 'dien thoai', 'smartphone', 'may tinh bang', 'ipad', 'tablet', 'galaxy tab', 'dien thoai di dong'),
      ...kw(2, 'iphone', 'samsung galaxy', 'xiaomi redmi', 'oppo reno', 'vivo', 'realme'),
    ],
  },
  'phu-kien-dien-thoai': {
    name: 'Phụ kiện điện thoại',
    emoji: '🔌',
    group: 'dien_tu',
    keywords: [
      ...kw(3, 'orico', 'baseus', 'ugreen', 'anker', 'remax', 'hoco', 'mobile accessories'),
      // Trọng số cao để "ốp lưng iPhone" thắng nhóm điện thoại
      ...kw(5, 'op lung', 'cap sac', 'cu sac', 'sac du phong', 'pin du phong', 'kinh cuong luc', 'cuong luc', 'mieng dan', 'gia do dien thoai', 'phu kien dien thoai', 'phu kien cong nghe', 'sac nhanh', 'day sac', 'sac khong day', 'adapter', 'gay chup anh', 'the nho', 'usb'),
      ...kw(2, 'phu kien'),
    ],
  },
  'am-thanh': {
    name: 'Tai nghe & loa',
    emoji: '🎧',
    group: 'dien_tu',
    keywords: [...kw(3, 'tai nghe', 'loa bluetooth', 'loa', 'earbuds', 'airpods', 'headphone', 'soundbar', 'micro', 'true wireless', 'amply')],
  },
  'may-tinh': {
    name: 'Máy tính & laptop',
    emoji: '💻',
    group: 'dien_tu',
    keywords: [
      ...kw(3, 'laptop', 'macbook', 'may tinh xach tay', 'may tinh de ban', 'pc gaming', 'ban phim', 'chuot may tinh', 'chuot gaming', 'chuot khong day', 'man hinh may tinh', 'man hinh', 'o cung', 'ssd', 'card do hoa', 'mainboard', 'may in', 'computer', 'phan mem may tinh', 'webcam', 'router', 'wifi'),
      ...kw(1, 'may tinh', 'gaming'),
    ],
  },
  'dien-gia-dung': {
    name: 'Điện gia dụng',
    emoji: '🍳',
    group: 'dien_tu',
    keywords: [
      ...kw(4, 'noi nau cham', 'noi nau chao', 'noi da nang', 'noi dien', 'noi lau dien', 'sunhouse', 'kangaroo', 'midea', 'electrolux', 'appliance'),
      ...kw(4, 'noi chien', 'noi com dien', 'noi com', 'noi ap suat', 'may xay', 'may ep', 'may vat cam', 'may lam sua dau nanh', 'bep dien', 'bep tu', 'bep hong ngoai', 'lo vi song', 'lo nuong', 'may hut bui', 'robot hut bui', 'may loc khong khi', 'may loc nuoc', 'quat dien', 'quat', 'may say toc', 'ban la', 'ban ui', 'binh dun', 'am sieu toc', 'tu lanh', 'may giat', 'dieu hoa', 'may lanh', 'tivi', 'smart tv', 'may nuoc nong', 'may pha ca phe', 'may hut am', 'dien gia dung'),
      ...kw(1, 'gia dung'),
    ],
  },
  'my-pham': {
    name: 'Mỹ phẩm & làm đẹp',
    emoji: '💄',
    group: 'lam_dep',
    keywords: [
      ...kw(3, 'cosmetic', 'skin', 'perfume', 'the saem', 'thefaceshop', 'the face shop', 'cell fusion', 'palmer s', 'laneige', 'khu mui', 'lan khu mui', 'tri mun', 'kem tri mun', 'giam mun', 'sang da', 'trang da'),
      ...kw(3, 'my pham', 'cosmetics', 'son moi', 'son kem', 'son li', 'kem chong nang', 'sua rua mat', 'serum', 'toner', 'tay trang', 'duong da', 'mat na', 'nuoc hoa', 'dau goi', 'dau xa', 'sua tam', 'cham soc da', 'cham da', 'skincare', 'makeup', 'trang diem', 'kem duong', 'tay da chet', 'phan nuoc', 'kem nen', 'duong the', 'lam dep', 'beauty'),
      ...kw(3, 'cocoon', 'la roche posay', 'cerave', 'bioderma', 'innisfree', 'maybelline', 'loreal', 'some by mi', 'klairs', 'garnier', 'senka', 'hada labo'),
    ],
  },
  'suc-khoe': {
    name: 'Sức khoẻ',
    emoji: '💊',
    group: 'lam_dep',
    keywords: [
      ...kw(3, 'bao cao su', 'gel boi tron', 'durex', 'vien uong', 'bo mat', 'medic', 'pharmacy', 'health', 'y hoc', 'massage'),
      ...kw(3, 'thuc pham chuc nang', 'thuc pham bao ve suc khoe', 'vitamin', 'collagen', 'omega 3', 'may do huyet ap', 'nhiet ke', 'khau trang', 'nha thuoc', 'duoc pham', 'thiet bi y te', 'may massage', 'ban chai dien', 'cham soc suc khoe', 'suc khoe'),
      ...kw(1, 'thuoc'),
    ],
  },
  'nha-cua': {
    name: 'Nhà cửa & đời sống',
    emoji: '🏠',
    group: 'nha_cua',
    keywords: [
      ...kw(3, 'home', 'house', 'kitchen', 'lock lock', 'elmich', 'chan ra goi', 'chan ga goi', 'nem cao su', 'nem lo xo', 'coc giu nhiet', 'ly giu nhiet', 'coc nhua', 'ly thuy tinh', 'khan an', 'sap thom', 'gel thom', 'tui rac', 'mang boc thuc pham'),
      ...kw(3, 'binh giu nhiet', 'hop com', 'hop dung thuc pham', 'chao chien', 'chao chong dinh', 'bo noi', 'noi inox', 'do dung nha bep', 'dung cu nha bep', 'chan ga', 'chan goi', 'ga giuong', 'goi om', 'rem cua', 'ke de do', 'ban ghe', 'noi that', 'nuoc giat', 'nuoc xa vai', 'nuoc rua chen', 'nuoc lau san', 'giay ve sinh', 'khan giay', 'cay lau nha', 'den led', 'den ngu', 'tham trai san', 'tham lau chan', 'decor', 'decoration', 'nha cua', 'doi song', 'cham soc gia dinh', 've sinh nha cua'),
      ...kw(5, 'tu quan ao', 'moc quan ao', 'gia phoi quan ao'),
      ...kw(1, 'gia dinh'),
    ],
  },
  'me-be': {
    name: 'Mẹ & bé',
    emoji: '🍼',
    group: 'nha_cua',
    keywords: [
      ...kw(3, 'toys', 'toy', 'cam nang lam cha me'),
      ...kw(3, 'me va be', 'me & be', 'me bau', 'ta quan', 'ta dan', 'bim', 'sua bot', 'so sinh', 'binh sua', 'xe day', 'do choi', 'do choi tre em', 'em be', 'mom', 'baby', 'kids'),
      ...kw(1, 'tre em', 'cho be'),
    ],
  },
  'sach-van-phong': {
    name: 'Sách & văn phòng phẩm',
    emoji: '📚',
    group: 'khac',
    keywords: [
      ...kw(3, 'book', 'books', 'bookstore', 'office', 'stationery', 'thaihabooks', 'alphabooks', 'nha nam', 'fahasa', 'triet hoc', 'tam ly hoc', 'tai chinh ca nhan', 'luyen thi', 'tu vung', 'phong su', 'ky su', 'co tich', 'giao duc'),
      ...kw(3, 'cuon sach', 'bo sach', 'nha sach', 'mot sach', 'sach thieu nhi', 'sach giao khoa', 'sach tu duy', 'sach ky nang', 'sach kinh te', 'sach kinh doanh', 'sach van hoc', 'sach tieng anh', 'sach hay', 'truyen tranh', 'truyen ngan', 'truyen dai', 'truyen chu', 'truyen ke', 'truyen thieu nhi', 'truyen trinh tham', 'truyen ngon tinh', 'tieu thuyet', 'manga', 'comic', 'ngon tinh', 'trinh tham', 'hoi ky', 'ky nang song', 'tac pham', 'van hoc', 'giao trinh', 'tu dien', 'van phong pham', 'but bi', 'but chi', 'but long', 'so tay', 'vo viet', 'may tinh bo tui', 'giay in'),
      ...kw(1, 'lich su', 'kien thuc', 'nghe thuat song'),
    ],
  },
  'the-thao': {
    name: 'Thể thao & dã ngoại',
    emoji: '⚽',
    group: 'khac',
    keywords: [
      ...kw(3, 'xtep', 'anta', 'li ning', 'nike', 'adidas', 'puma', 'kamito', 'sports'),...kw(3, 'the thao', 'gym', 'yoga', 'ta tay', 'xe dap', 'cau long', 'bong da', 'bong ro', 'vot', 'leu', 'cam trai', 'da ngoai', 'boi loi', 'fitness', 'running', 'sport')],
  },
  'xe-co': {
    name: 'Ô tô & xe máy',
    emoji: '🛵',
    group: 'khac',
    keywords: [
      ...kw(3, 'helmet', 'helmets', 'motor', 'auto parts'),...kw(3, 'o to', 'oto', 'xe may', 'xe dien', 'mu bao hiem', 'phu kien xe', 'dau nhot', 'lop xe', 'camera hanh trinh', 'xe hoi')],
  },
  'thu-cung': {
    name: 'Thú cưng',
    emoji: '🐶',
    group: 'khac',
    keywords: [...kw(3, 'thu cung', 'pet', 'thuc an cho cho', 'thuc an cho meo', 'cat ve sinh', 'cho meo', 'pate cho meo')],
  },
  'dich-vu': {
    name: 'Dịch vụ & du lịch',
    emoji: '✈️',
    group: 'khac',
    keywords: [...kw(3, 've may bay', 'khach san', 'du lich', 'dat phong', 've xe khach', 've tau', 'dat xe', 'giao hang', 'nap tien', 'the cao', 'bao hiem', 'nha khoa', 'spa', 'travel', 'tour')],
  },
  'thanh-toan': {
    name: 'Ưu đãi thanh toán',
    emoji: '💳',
    group: 'khac',
    keywords: [...kw(3, 'vpbank', 'acb', 'techcombank', 'vietinbank', 'vietcombank', 'tpbank', 'mb bank', 'the tin dung', 'visa', 'mastercard', 'jcb', 'vi dien tu', 'momo', 'zalopay', 'shopeepay', 'paylater', 'apple pay', 'ngan hang', 'hd saison', 'cake by vpbank')],
  },
  'toan-san': { name: 'Mã toàn sàn', emoji: '🎟️', group: 'khac', keywords: [] },
  khac: { name: 'Khác', emoji: '🏷️', group: 'khac', keywords: [] },
} as const satisfies Record<string, CategoryDef>;

export type CategorySlug = keyof typeof CATEGORIES;
export const CATEGORY_SLUGS = Object.keys(CATEGORIES) as CategorySlug[];
export const isCategorySlug = (s: unknown): s is CategorySlug => typeof s === 'string' && s in CATEGORIES;

export interface ClassifyInput {
  title: string;
  /** Danh mục gốc từ sàn (vd "Nồi chiên", "Phụ kiện công nghệ"). */
  category?: string | null;
  shopName?: string | null;
  description?: string | null;
  platform?: Platform;
  scope?: VoucherScope | null;
  paymentMethod?: string | null;
  type?: PromoType;
}

/** Trọng số theo trường: danh mục gốc đáng tin nhất, rồi tiêu đề, tên shop, mô tả. */
const FIELD_WEIGHT = { category: 3, title: 2, shopName: 1.5, description: 0.5 } as const;
const FOOD_PLATFORMS: Platform[] = ['grabfood'];
const MIN_SCORE = 2;

export interface ClassifyResult {
  slug: CategorySlug;
  score: number;
}

/** Phân loại 1 khuyến mãi/sản phẩm vào nhóm. Không đủ tín hiệu → "khac". */
export function classifyCategory(input: ClassifyInput): ClassifyResult {
  if (input.scope === 'payment' || input.paymentMethod) return { slug: 'thanh-toan', score: 99 };

  const fields: [keyof typeof FIELD_WEIGHT, string][] = [];
  if (input.category) fields.push(['category', input.category]);
  // Bỏ phần "Giảm 20K cho đơn từ ..." ở tiêu đề mã giảm giá để tránh nhiễu.
  if (input.title) fields.push(['title', input.title.replace(/[-–]\s*(giảm|giam|freeship|hoàn|hoan)\b.*$/i, '')]);
  if (input.shopName) fields.push(['shopName', input.shopName]);
  if (input.description) fields.push(['description', input.description.slice(0, 300)]);
  const padded = fields.map(([f, v]) => [f, ` ${normalizeText(v)} `] as const);

  // Tiêu đề/danh mục gốc mở đầu bằng "Sách"/"Truyện" (cách Tiki đặt tên sách) → sách.
  // Không dùng từ "sach" đứng riêng vì trùng "sạch".
  const bookPrefix = padded.some(([f, t]) => (f === 'title' || f === 'category') && /^ (sach|truyen) /.test(t));

  let best: ClassifyResult = { slug: 'khac', score: 0 };
  for (const [slug, def] of Object.entries(CATEGORIES) as [CategorySlug, CategoryDef][]) {
    if (slug === 'khac' || slug === 'toan-san') continue;
    if (input.platform && FOOD_PLATFORMS.includes(input.platform) && def.group !== 'an_uong') continue;
    let score = 0;
    for (const [field, text] of padded) {
      for (const [word, w] of def.keywords) {
        if (text.includes(` ${word} `)) score += w * FIELD_WEIGHT[field];
      }
    }
    if (slug === 'sach-van-phong' && bookPrefix) score += 8;
    if (score > best.score) best = { slug, score };
  }
  if (best.score >= MIN_SCORE) return best;
  // Mã/chiến dịch áp cho cả sàn, không gắn với nhóm hàng nào.
  const sitewide = input.scope === 'platform' || input.scope === 'freeship' || (input.type === 'campaign' && !input.shopName);
  return { slug: sitewide ? 'toan-san' : 'khac', score: best.score };
}

/**
 * Từ đơn CÓ DẤU người dùng hay gõ khi tìm, mà bỏ dấu thì mơ hồ nên bộ từ khoá không dùng được
 * (giày/giấy, bia/bìa, tã/ta, áo/ao…). Chỉ áp cho câu tìm, không áp cho tiêu đề khuyến mãi.
 */
const QUERY_ALIASES: Record<string, CategorySlug> = {
  'giày': 'giay-tui', 'giầy': 'giay-tui', 'dép': 'giay-tui', 'túi': 'giay-tui', 'ví': 'giay-tui', 'cặp': 'giay-tui',
  'áo': 'quan-ao', 'quần': 'quan-ao', 'váy': 'quan-ao', 'đầm': 'quan-ao', 'đồ lót': 'quan-ao',
  'mũ': 'phu-kien-thoi-trang', 'nón': 'phu-kien-thoi-trang', 'kính': 'phu-kien-thoi-trang', 'nhẫn': 'phu-kien-thoi-trang',
  'tã': 'me-be', 'bỉm': 'me-be',
  'bia': 'bach-hoa', 'rượu': 'bach-hoa', 'bánh': 'bach-hoa', 'kẹo': 'bach-hoa', 'sữa': 'bach-hoa', 'mì': 'bach-hoa',
  'trà': 'tra-sua', 'cafe': 'tra-sua', 'nước ép': 'tra-sua',
  'cơm': 'do-an', 'bún': 'do-an', 'phở': 'do-an', 'lẩu': 'do-an', 'gà': 'do-an', 'bánh mì': 'do-an', 'đồ ăn': 'do-an',
  'son': 'my-pham', 'kem': 'my-pham',
  'sạc': 'phu-kien-dien-thoai', 'cáp': 'phu-kien-dien-thoai', 'ốp': 'phu-kien-dien-thoai',
  'chuột': 'may-tinh', 'bàn phím': 'may-tinh', 'màn hình': 'may-tinh',
  'quạt': 'dien-gia-dung', 'nồi': 'dien-gia-dung',
  'thuốc': 'suc-khoe',
  'chăn': 'nha-cua', 'gối': 'nha-cua', 'nệm': 'nha-cua', 'giấy': 'nha-cua', 'bát': 'nha-cua', 'cốc': 'nha-cua',
  'truyện': 'sach-van-phong', 'bút': 'sach-van-phong', 'vở': 'sach-van-phong',
  'xe đạp': 'the-thao', 'vợt': 'the-thao', 'lều': 'the-thao',
  'xe máy': 'xe-co', 'ô tô': 'xe-co',
  'chó': 'thu-cung', 'mèo': 'thu-cung',
  'vé máy bay': 'dich-vu', 'khách sạn': 'dich-vu',
};

/**
 * Nhóm sản phẩm của một câu tìm kiếm (vd "trà sữa" → tra-sua, "giày" → giay-tui).
 * Trả 'khac' nếu không đoán được — người gọi tự quyết bỏ qua.
 */
export function classifyQuery(query: string): ClassifyResult {
  const q = query.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  const alias = QUERY_ALIASES[q];
  if (alias) return { slug: alias, score: 99 };
  return classifyCategory({ title: q });
}

export const categoryLabel = (slug: string | null | undefined) =>
  isCategorySlug(slug) ? `${CATEGORIES[slug].emoji} ${CATEGORIES[slug].name}` : '';
