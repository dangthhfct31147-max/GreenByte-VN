import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SAMPLE_PRODUCTS = [
    {
        title: 'Rơm rạ khô - Đồng bằng sông Cửu Long',
        priceVnd: 15000,
        unit: 'kg',
        category: 'Rơm rạ',
        location: 'Cần Thơ',
        imageUrl: 'https://source.unsplash.com/1200x800/?straw,bales,farm&sig=101',
        description: 'Rơm rạ khô chất lượng cao từ vụ mùa Đông-Xuân. Phù hợp làm thức ăn gia súc, phủ đất trồng nấm, hoặc làm nguyên liệu đốt sinh học. Đã phơi khô kỹ, không mốc.',
        co2SavingsKg: 12,
    },
    {
        title: 'Vỏ trấu nguyên chất',
        priceVnd: 8000,
        unit: 'kg',
        category: 'Vỏ trấu',
        location: 'An Giang',
        imageUrl: 'https://source.unsplash.com/1200x800/?rice,husk,agriculture&sig=102',
        description: 'Vỏ trấu sạch từ nhà máy xay xát. Dùng làm nhiên liệu đốt, lót chuồng gia súc, hoặc trộn làm phân hữu cơ. Số lượng lớn, giao tận nơi.',
        co2SavingsKg: 8,
    },
    {
        title: 'Bã mía tươi - Nhà máy đường Biên Hòa',
        priceVnd: 5000,
        unit: 'kg',
        category: 'Bã mía',
        location: 'Đồng Nai',
        imageUrl: 'https://source.unsplash.com/1200x800/?sugarcane,bagasse,biomass&sig=103',
        description: 'Bã mía tươi từ dây chuyền ép mía. Thích hợp làm thức ăn gia súc, sản xuất giấy, hoặc làm phân compost. Giao hàng nhanh trong ngày.',
        co2SavingsKg: 15,
    },
    {
        title: 'Xơ dừa đã xử lý',
        priceVnd: 25000,
        unit: 'kg',
        category: 'Phụ phẩm dừa',
        location: 'Bến Tre',
        imageUrl: 'https://source.unsplash.com/1200x800/?coconut,fiber,coir&sig=104',
        description: 'Xơ dừa đã được rửa sạch, phơi khô, cắt nhỏ. Dùng làm giá thể trồng cây, lọc nước, hoặc sản xuất thảm. Chất lượng xuất khẩu.',
        co2SavingsKg: 20,
    },
    {
        title: 'Vỏ cà phê khô',
        priceVnd: 12000,
        unit: 'kg',
        category: 'Phụ phẩm cà phê',
        location: 'Đắk Lắk',
        imageUrl: 'https://source.unsplash.com/1200x800/?coffee,beans,dry&sig=105',
        description: 'Vỏ cà phê khô từ vụ thu hoạch. Giàu chất hữu cơ, phù hợp làm phân bón, lót chuồng, hoặc đốt sinh khối. Số lượng lớn từ 500kg.',
        co2SavingsKg: 10,
    },
    {
        title: 'Lá mía khô băm nhỏ',
        priceVnd: 6000,
        unit: 'kg',
        category: 'Bã mía',
        location: 'Tây Ninh',
        imageUrl: 'https://source.unsplash.com/1200x800/?sugarcane,leaves,harvest&sig=106',
        description: 'Lá mía đã phơi khô và băm nhỏ. Dùng làm thức ăn trâu bò, phủ đất giữ ẩm, hoặc ủ phân hữu cơ. Đóng bao 50kg tiện vận chuyển.',
        co2SavingsKg: 7,
    },
    {
        title: 'Mùn cưa gỗ keo',
        priceVnd: 4000,
        unit: 'kg',
        category: 'Mùn cưa',
        location: 'Bình Dương',
        imageUrl: 'https://source.unsplash.com/1200x800/?sawdust,wood,workshop&sig=107',
        description: 'Mùn cưa gỗ keo sạch từ xưởng chế biến gỗ. Dùng làm viên nén sinh khối, lót chuồng, hoặc trồng nấm. Không lẫn tạp chất.',
        co2SavingsKg: 18,
    },
    {
        title: 'Bã sắn công nghiệp',
        priceVnd: 3500,
        unit: 'kg',
        category: 'Bã sắn',
        location: 'Bình Phước',
        imageUrl: 'https://source.unsplash.com/1200x800/?cassava,starch,factory&sig=108',
        description: 'Bã sắn từ nhà máy tinh bột. Hàm lượng tinh bột còn lại cao, phù hợp làm thức ăn chăn nuôi hoặc ủ men sinh học.',
        co2SavingsKg: 14,
    },
    {
        title: 'Than trấu ép viên',
        priceVnd: 35000,
        unit: 'kg',
        category: 'Vỏ trấu',
        location: 'Long An',
        imageUrl: 'https://source.unsplash.com/1200x800/?biomass,pellet,fuel&sig=109',
        description: 'Than trấu đã ép viên, nhiệt lượng cao, ít khói. Thay thế than củi trong nấu ăn, sưởi ấm. Đóng gói 25kg.',
        co2SavingsKg: 25,
    },
    {
        title: 'Rơm cuộn tròn - Sẵn vận chuyển',
        priceVnd: 80000,
        unit: 'cuộn',
        category: 'Rơm rạ',
        location: 'Thái Bình',
        imageUrl: 'https://source.unsplash.com/1200x800/?hay,bale,field&sig=110',
        description: 'Rơm đã cuộn tròn bằng máy, mỗi cuộn khoảng 15kg. Tiện lợi cho vận chuyển và bảo quản. Số lượng lớn có giảm giá.',
        co2SavingsKg: 15,
    },
    {
        title: 'Vỏ lạc (đậu phộng) khô',
        priceVnd: 7000,
        unit: 'kg',
        category: 'Phụ phẩm khác',
        location: 'Nghệ An',
        imageUrl: 'https://source.unsplash.com/1200x800/?peanut,shell,dry&sig=111',
        description: 'Vỏ lạc đã phơi khô, sạch. Dùng làm nhiên liệu đốt, lót chuồng, hoặc ủ phân bón. Giàu cellulose và lignin.',
        co2SavingsKg: 6,
    },
    {
        title: 'Bã đậu nành tươi',
        priceVnd: 4500,
        unit: 'kg',
        category: 'Phụ phẩm khác',
        location: 'Hồ Chí Minh',
        imageUrl: 'https://source.unsplash.com/1200x800/?soybean,tofu,okara&sig=112',
        description: 'Bã đậu nành từ xưởng làm đậu hũ. Giàu protein, phù hợp làm thức ăn gia súc, gia cầm. Giao hàng sáng sớm hàng ngày.',
        co2SavingsKg: 5,
    },
];

const SAMPLE_COMMUNITY_USERS = [
    { email: 'nongdan.an@eco.vn', name: 'Lê Minh An' },
    { email: 'kysu.linh@eco.vn', name: 'Nguyễn Thu Linh' },
    { email: 'startup.huy@eco.vn', name: 'Trần Gia Huy' },
    { email: 'hoptacxa.hoa@eco.vn', name: 'Phạm Ngọc Hoa' },
    { email: 'nongsinhthai.khanh@eco.vn', name: 'Đỗ Khánh Vy' },
    { email: 'nonghoc.minh@eco.vn', name: 'Vũ Đức Minh' },
    { email: 'thucphamxanh.trang@eco.vn', name: 'Bùi Mai Trang' },
    { email: 'canhbao.manh@eco.vn', name: 'Phan Tuấn Mạnh' },
];

const SAMPLE_DISCUSSION_POSTS = [
    {
        authorEmail: 'nongdan.an@eco.vn',
        content:
            'Mình vừa thử phủ rơm rạ cho ruộng dưa leo 2 tuần nay, độ ẩm đất giữ tốt hơn hẳn. Có ai đã kết hợp thêm phân hữu cơ vi sinh để giảm tưới nước không?',
        tags: ['#NongNghiepBenVung', '#TaiCheRomRa'],
        imageUrl: 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=1200',
        createdMinutesAgo: 18,
        likedBy: ['kysu.linh@eco.vn', 'startup.huy@eco.vn', 'hoptacxa.hoa@eco.vn', 'nongsinhthai.khanh@eco.vn'],
    },
    {
        authorEmail: 'kysu.linh@eco.vn',
        content:
            'Đội mình thử mô hình ủ phân từ bã mía + vỏ cà phê theo tỷ lệ 6:4, sau 35 ngày nhiệt độ đống ủ ổn định và mùi dễ chịu hơn nhiều.',
        tags: ['#KhoiNghiepXanh', '#NongNghiepTuanHoan'],
        createdMinutesAgo: 42,
        likedBy: ['nongdan.an@eco.vn', 'hoptacxa.hoa@eco.vn', 'thucphamxanh.trang@eco.vn'],
    },
    {
        authorEmail: 'startup.huy@eco.vn',
        content:
            'Mọi người có nguồn mua than trấu ép viên ổn định ở miền Tây không? Bên mình cần khoảng 2 tấn/tháng để chạy thử lò sấy nông sản.',
        tags: ['#TaiCheRomRa', '#KhoiNghiepXanh'],
        createdMinutesAgo: 90,
        likedBy: ['nongdan.an@eco.vn', 'nongsinhthai.khanh@eco.vn'],
    },
    {
        authorEmail: 'hoptacxa.hoa@eco.vn',
        content:
            'Hợp tác xã của mình đang chuyển từ đốt bỏ phụ phẩm sang bán lại cho cơ sở trồng nấm. Tháng đầu tiên đã giảm chi phí xử lý gần 18%.',
        tags: ['#NongNghiepBenVung', '#KinhTeXanh'],
        imageUrl: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=1200',
        createdMinutesAgo: 150,
        likedBy: ['nongdan.an@eco.vn', 'kysu.linh@eco.vn', 'nongsinhthai.khanh@eco.vn', 'canhbao.manh@eco.vn'],
    },
    {
        authorEmail: 'nongsinhthai.khanh@eco.vn',
        content:
            'Có ai dùng xơ dừa đã xử lý để trộn giá thể cho dưa lưới nhà màng chưa? Mình đang thử công thức 50% xơ dừa + 30% trấu hun + 20% phân trùn.',
        tags: ['#NongNghiepCongNgheCao', '#NongNghiepBenVung'],
        createdMinutesAgo: 210,
        likedBy: ['kysu.linh@eco.vn', 'thucphamxanh.trang@eco.vn', 'nonghoc.minh@eco.vn'],
    },
    {
        authorEmail: 'nonghoc.minh@eco.vn',
        content:
            'Mình vừa tổng hợp số liệu: nếu thay đốt rơm bằng thu gom bán phụ phẩm, mỗi hecta có thể cắt giảm khoảng 1.2 - 1.5 tấn CO₂ tương đương/vụ.',
        tags: ['#BienDoiKhiHau', '#NongNghiepBenVung'],
        createdMinutesAgo: 280,
        likedBy: ['kysu.linh@eco.vn', 'hoptacxa.hoa@eco.vn', 'canhbao.manh@eco.vn'],
    },
    {
        authorEmail: 'thucphamxanh.trang@eco.vn',
        content:
            'Ai quan tâm workshop “Lên chuỗi giá trị cho phụ phẩm nông nghiệp” tuần tới không? Mình đăng ký rồi, nghe nói có phần kết nối nhà mua sỉ.',
        tags: ['#SuKienXanh', '#KhoiNghiepXanh'],
        createdMinutesAgo: 360,
        likedBy: ['startup.huy@eco.vn', 'nongdan.an@eco.vn', 'hoptacxa.hoa@eco.vn'],
    },
    {
        authorEmail: 'canhbao.manh@eco.vn',
        content:
            'Khu vực ngoại thành hôm nay có 3 điểm ghi nhận đốt rơm rạ trái phép. Mình đã báo chính quyền địa phương, mong bà con cùng nhắc nhau xử lý đúng cách.',
        tags: ['#BienDoiKhiHau', '#CanhBaoMoiTruong'],
        createdMinutesAgo: 520,
        likedBy: ['nonghoc.minh@eco.vn', 'kysu.linh@eco.vn'],
    },
    {
        authorEmail: 'nongdan.an@eco.vn',
        content:
            'Nhà mình đang tìm đầu ra ổn định cho 6 tấn rơm cuộn/tháng tại Đồng Tháp. Nếu bên nào cần làm nấm hoặc chăn nuôi có thể nhắn mình nhé.',
        tags: ['#TaiCheRomRa', '#KetNoiCungCau'],
        createdMinutesAgo: 780,
        likedBy: ['startup.huy@eco.vn', 'thucphamxanh.trang@eco.vn', 'hoptacxa.hoa@eco.vn'],
    },
    {
        authorEmail: 'kysu.linh@eco.vn',
        content:
            'Chia sẻ nhanh checklist an toàn khi ủ compost quy mô hộ: giữ ẩm 50-60%, đảo trộn 5-7 ngày/lần, che mưa trực tiếp và theo dõi nhiệt độ.',
        tags: ['#KienThucNongNghiep', '#NongNghiepBenVung'],
        createdMinutesAgo: 1040,
        likedBy: ['nongsinhthai.khanh@eco.vn', 'nonghoc.minh@eco.vn', 'nongdan.an@eco.vn'],
    },
];

const SAMPLE_EVENTS = [
    {
        title: 'Workshop Ủ phân hữu cơ từ bã mía và rơm rạ',
        startInDays: 3,
        durationHours: 3,
        location: 'Cần Thơ',
        imageUrl: 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=1200',
        description: 'Hướng dẫn quy trình ủ compost quy mô hộ gia đình, kiểm soát nhiệt độ và độ ẩm, thực hành phối trộn nguyên liệu tại chỗ.',
        organizer: 'Trung tâm Khuyến nông Cần Thơ',
        rsvpEmails: ['nongdan.an@eco.vn', 'kysu.linh@eco.vn', 'hoptacxa.hoa@eco.vn', 'nongsinhthai.khanh@eco.vn'],
    },
    {
        title: 'Kết nối cung cầu phụ phẩm nông nghiệp miền Tây',
        startInDays: 6,
        durationHours: 4,
        location: 'An Giang',
        imageUrl: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=1200',
        description: 'Phiên kết nối trực tiếp giữa nông hộ, hợp tác xã và doanh nghiệp thu mua phụ phẩm để ký biên bản hợp tác đầu ra.',
        organizer: 'Liên minh HTX An Giang',
        rsvpEmails: ['startup.huy@eco.vn', 'hoptacxa.hoa@eco.vn', 'thucphamxanh.trang@eco.vn'],
    },
    {
        title: 'Sản xuất than trấu ép viên: từ mô hình thử nghiệm đến thương mại',
        startInDays: 10,
        durationHours: 3,
        location: 'Long An',
        imageUrl: 'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?w=1200',
        description: 'Chia sẻ bài toán chi phí, vận hành lò ép viên và kiểm định chất lượng nhiên liệu sinh khối cho hộ sản xuất vừa và nhỏ.',
        organizer: 'CLB Khởi nghiệp Xanh Long An',
        rsvpEmails: ['startup.huy@eco.vn', 'nonghoc.minh@eco.vn', 'canhbao.manh@eco.vn'],
    },
    {
        title: 'Tập huấn giám sát điểm đốt rơm rạ bằng bản đồ cộng đồng',
        startInDays: 14,
        durationHours: 2,
        location: 'Hồ Chí Minh',
        imageUrl: 'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?w=1200',
        description: 'Hướng dẫn cộng tác viên ghi nhận, xác minh và gửi báo cáo ô nhiễm không khí từ điểm đốt rơm rạ theo thời gian thực.',
        organizer: 'Mạng lưới Không khí sạch Việt Nam',
        rsvpEmails: ['canhbao.manh@eco.vn', 'kysu.linh@eco.vn', 'nongdan.an@eco.vn'],
    },
    {
        title: 'Workshop thiết kế chuỗi giá trị phụ phẩm cho HTX',
        startInDays: 21,
        durationHours: 4,
        location: 'Đồng Nai',
        imageUrl: 'https://images.unsplash.com/photo-1492496913980-501348b61469?w=1200',
        description: 'Xây dựng mô hình thu gom - sơ chế - vận chuyển - tiêu thụ phụ phẩm nông nghiệp theo hướng chuẩn hóa và có truy xuất nguồn gốc.',
        organizer: 'Viện Nông nghiệp tuần hoàn',
        rsvpEmails: ['hoptacxa.hoa@eco.vn', 'thucphamxanh.trang@eco.vn', 'nonghoc.minh@eco.vn', 'nongsinhthai.khanh@eco.vn'],
    },
    {
        title: 'Ngày hội công nghệ tái chế phụ phẩm nông nghiệp 2026',
        startInDays: 30,
        durationHours: 6,
        location: 'Tây Ninh',
        imageUrl: 'https://images.unsplash.com/photo-1462899006636-339e08d1844e?w=1200',
        description: 'Trưng bày thiết bị, trình diễn mô hình thực tế và tư vấn triển khai công nghệ tái chế phụ phẩm phù hợp từng địa phương.',
        organizer: 'Sở Nông nghiệp & PTNT Tây Ninh',
        rsvpEmails: ['nongdan.an@eco.vn', 'startup.huy@eco.vn', 'kysu.linh@eco.vn', 'hoptacxa.hoa@eco.vn', 'thucphamxanh.trang@eco.vn'],
    },
];

async function main() {
    console.log('🌱 Bắt đầu seed database...');

    // Tạo user demo làm seller
    const passwordHash = await bcrypt.hash('DemoPass123!', 12);

    const demoSeller = await prisma.user.upsert({
        where: { email: 'seller@eco-byproduct.vn' },
        update: {
            name: 'Nông Dân Xanh',
            passwordHash,
        },
        create: {
            email: 'seller@eco-byproduct.vn',
            name: 'Nông Dân Xanh',
            passwordHash,
        },
    });

    console.log(`✅ Demo seller: ${demoSeller.email}`);

    // Xóa sản phẩm cũ của seller này (nếu có)
    const oldSellerProducts = await prisma.product.findMany({
        where: { sellerId: demoSeller.id },
        select: { id: true },
    });

    if (oldSellerProducts.length > 0) {
        const oldSellerProductIds = oldSellerProducts.map((p) => p.id);
        const oldInquiryIds = await (prisma as any).productInquiry.findMany({
            where: { productId: { in: oldSellerProductIds } },
            select: { id: true },
        });

        if (oldInquiryIds.length > 0) {
            await (prisma as any).productInquiryMessage.deleteMany({
                where: { inquiryId: { in: oldInquiryIds.map((i: { id: string }) => i.id) } },
            });
        }

        await (prisma as any).productReview.deleteMany({ where: { productId: { in: oldSellerProductIds } } });
        await (prisma as any).productViewEvent.deleteMany({ where: { productId: { in: oldSellerProductIds } } });
        await (prisma as any).productInquiry.deleteMany({ where: { productId: { in: oldSellerProductIds } } });
        await prisma.cartItem.deleteMany({
            where: { productId: { in: oldSellerProductIds } },
        });
        await prisma.product.deleteMany({
            where: { id: { in: oldSellerProductIds } },
        });
    }

    const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
        'Cần Thơ': { lat: 10.0452, lng: 105.7469 },
        'An Giang': { lat: 10.5216, lng: 105.1259 },
        'Đồng Nai': { lat: 11.0686, lng: 107.1676 },
        'Bến Tre': { lat: 10.2433, lng: 106.3756 },
        'Đắk Lắk': { lat: 12.7100, lng: 108.2378 },
        'Tây Ninh': { lat: 11.3352, lng: 106.1099 },
        'Bình Dương': { lat: 11.3254, lng: 106.4770 },
        'Bình Phước': { lat: 11.7512, lng: 106.7235 },
        'Long An': { lat: 10.6956, lng: 106.2431 },
        'Thái Bình': { lat: 20.4463, lng: 106.3365 },
        'Nghệ An': { lat: 19.2342, lng: 104.9200 },
        'Hồ Chí Minh': { lat: 10.8231, lng: 106.6297 },
    };

    // Tạo sản phẩm mẫu
    for (const product of SAMPLE_PRODUCTS) {
        const city = CITY_COORDINATES[product.location] ?? { lat: 10.8231, lng: 106.6297 };
        const lat = city.lat + (Math.random() - 0.5) * 0.12;
        const lng = city.lng + (Math.random() - 0.5) * 0.12;

        await (prisma.product as any).create({
            data: {
                ...product,
                qualityScore: Math.floor(Math.random() * 3) + 3,
                latitude: lat,
                longitude: lng,
                sellerId: demoSeller.id,
            },
        });
        console.log(`  📦 ${product.title}`);
    }

    console.log(`\n✅ Đã thêm ${SAMPLE_PRODUCTS.length} sản phẩm mẫu!`);

    // --- SEED COMMUNITY USERS & POSTS ---
    console.log('🗣️ Bắt đầu seed thảo luận cộng đồng...');

    const demoMemberPasswordHash = await bcrypt.hash('DemoMember123!', 12);

    const seededCommunityUsers = await Promise.all(
        SAMPLE_COMMUNITY_USERS.map((u) =>
            prisma.user.upsert({
                where: { email: u.email },
                update: {
                    name: u.name,
                    passwordHash: demoMemberPasswordHash,
                },
                create: {
                    email: u.email,
                    name: u.name,
                    passwordHash: demoMemberPasswordHash,
                },
            })
        )
    );

    const communityUsers = [demoSeller, ...seededCommunityUsers];
    const communityUserByEmail = new Map(communityUsers.map((u) => [u.email, u]));
    const communityUserIds = communityUsers.map((u) => u.id);

    const oldPosts = await prisma.post.findMany({
        where: { authorId: { in: communityUserIds } },
        select: { id: true },
    });

    if (oldPosts.length > 0) {
        const oldPostIds = oldPosts.map((p) => p.id);
        await prisma.postLike.deleteMany({ where: { postId: { in: oldPostIds } } });
        await (prisma as any).postComment.deleteMany({ where: { postId: { in: oldPostIds } } });
        await prisma.post.deleteMany({ where: { id: { in: oldPostIds } } });
    }

    let createdCommunityPostCount = 0;

    for (const item of SAMPLE_DISCUSSION_POSTS) {
        const author = communityUserByEmail.get(item.authorEmail);
        if (!author) continue;

        const likerIds = item.likedBy
            .map((email) => communityUserByEmail.get(email)?.id)
            .filter((id): id is string => Boolean(id));

        const post = await prisma.post.create({
            data: {
                authorId: author.id,
                content: item.content,
                imageUrl: item.imageUrl,
                tags: JSON.stringify(item.tags),
                likeCount: likerIds.length,
                createdAt: new Date(Date.now() - item.createdMinutesAgo * 60 * 1000),
            },
        });

        if (likerIds.length > 0) {
            await prisma.postLike.createMany({
                data: likerIds.map((userId) => ({ postId: post.id, userId })),
                skipDuplicates: true,
            });
        }

        createdCommunityPostCount++;
    }

    console.log(`✅ Đã thêm ${seededCommunityUsers.length} user mẫu cộng đồng`);
    console.log(`✅ Đã thêm ${createdCommunityPostCount} bài thảo luận mẫu`);

    // --- SEED EVENTS & WORKSHOPS ---
    console.log('📅 Bắt đầu seed dữ liệu sự kiện/workshop...');

    await prisma.eventRsvp.deleteMany({});
    await prisma.event.deleteMany({});

    const hourMs = 60 * 60 * 1000;
    let createdEventCount = 0;
    let createdRsvpCount = 0;

    for (const item of SAMPLE_EVENTS) {
        const startAt = new Date(Date.now() + item.startInDays * 24 * hourMs);
        const endAt = new Date(startAt.getTime() + item.durationHours * hourMs);

        const createdEvent = await prisma.event.create({
            data: {
                title: item.title,
                startAt,
                endAt,
                location: item.location,
                imageUrl: item.imageUrl,
                description: item.description,
                organizer: item.organizer,
            },
        });

        const rsvpUserIds = item.rsvpEmails
            .map((email) => communityUserByEmail.get(email)?.id)
            .filter((id): id is string => Boolean(id));

        if (rsvpUserIds.length > 0) {
            await prisma.eventRsvp.createMany({
                data: rsvpUserIds.map((userId) => ({ eventId: createdEvent.id, userId })),
                skipDuplicates: true,
            });
            createdRsvpCount += rsvpUserIds.length;
        }

        createdEventCount++;
    }

    console.log(`✅ Đã thêm ${createdEventCount} sự kiện/workshop mẫu`);
    console.log(`✅ Đã thêm ${createdRsvpCount} lượt đăng ký tham gia mẫu`);

    // --- SEED POLLUTION REPORTS ---
    console.log('🏭 Bắt đầu seed dữ liệu ô nhiễm...');

    // Clear old reports
    await prisma.pollutionReport.deleteMany({});

    // 1. Define base locations (City centers)
    const LOCATIONS = [
        { name: 'Hà Nội', lat: 21.0285, lng: 105.8542 },
        { name: 'Đà Nẵng', lat: 16.0544, lng: 108.2022 },
        { name: 'Hồ Chí Minh', lat: 10.8231, lng: 106.6297 },
        { name: 'Cần Thơ', lat: 10.0452, lng: 105.7469 },
        { name: 'Hải Phòng', lat: 20.8449, lng: 106.6881 },
    ];

    const POLLUTION_TYPES = ['WASTE', 'WATER', 'AIR', 'OTHER'];
    const DESCRIPTIONS = [
        'Rác thải sinh hoạt ùn ứ lâu ngày bốc mùi hôi thối.',
        'Cống nước thải đen ngòm, sủi bọt trắng xóa chảy ra sông.',
        'Khói bụi từ công trình xây dựng gây bụi mù mịt cả khu phố.',
        'Đốt rơm rạ gây khói mù mịt, khó thở cho người đi đường.',
        'Kênh rạch bị tắc nghẽn do rác thải nhựa.',
        'Mùi hóa chất nồng nặc từ khu công nghiệp gần đó.',
        'Bãi rác tự phát mọc lên ngay cạnh khu dân cư.',
        'Xả thải trộm ra môi trường vào ban đêm.',
        'Tiếng ồn quá lớn từ nhà máy hoạt động quá giờ quy định.',
        'Khói đen xả ra từ ống khói nhà máy.',
    ];

    const REPORTS_PER_LOCATION = 10;
    let reportCount = 0;

    for (const loc of LOCATIONS) {
        for (let i = 0; i < REPORTS_PER_LOCATION; i++) {
            // Random offset spread ~5-10km
            const latOffset = (Math.random() - 0.5) * 0.1;
            const lngOffset = (Math.random() - 0.5) * 0.1;

            const randomType = POLLUTION_TYPES[Math.floor(Math.random() * POLLUTION_TYPES.length)];
            const randomDesc = DESCRIPTIONS[Math.floor(Math.random() * DESCRIPTIONS.length)];
            const randomSeverity = Math.floor(Math.random() * 5) + 1; // 1-5

            await prisma.pollutionReport.create({
                data: {
                    ownerId: demoSeller.id,
                    lat: loc.lat + latOffset,
                    lng: loc.lng + lngOffset,
                    type: randomType,
                    severity: randomSeverity,
                    description: `${randomDesc} (Tại: ${loc.name})`,
                    isAnonymous: Math.random() > 0.5,
                }
            });
            reportCount++;
        }
    }

    console.log(`✅ Đã thêm ${reportCount} báo cáo ô nhiễm mẫu!`);
    console.log('🌿 Seed hoàn tất!');
}

main()
    .catch((e) => {
        console.error('❌ Seed thất bại:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
