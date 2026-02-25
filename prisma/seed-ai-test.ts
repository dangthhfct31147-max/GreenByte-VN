import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

type SeedProduct = {
    id: string;
    title: string;
    category: string;
    location: string;
    priceVnd: number;
    sellerId: string;
};

type SeedUser = {
    id: string;
    email: string;
    name: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const DEMO_BUYERS = [
    { email: 'ai.buyer.01@greenbyte.vn', name: 'Buyer Demo 01' },
    { email: 'ai.buyer.02@greenbyte.vn', name: 'Buyer Demo 02' },
    { email: 'ai.buyer.03@greenbyte.vn', name: 'Buyer Demo 03' },
    { email: 'ai.buyer.04@greenbyte.vn', name: 'Buyer Demo 04' },
    { email: 'ai.buyer.05@greenbyte.vn', name: 'Buyer Demo 05' },
    { email: 'ai.buyer.06@greenbyte.vn', name: 'Buyer Demo 06' },
    { email: 'ai.buyer.07@greenbyte.vn', name: 'Buyer Demo 07' },
    { email: 'ai.buyer.08@greenbyte.vn', name: 'Buyer Demo 08' },
];

const FALLBACK_PRODUCTS = [
    {
        title: 'Rơm rạ demo cho AI matching',
        category: 'Rơm rạ',
        location: 'Ninh Kieu, Cần Thơ',
        unit: 'kg',
        priceVnd: 14500,
        qualityScore: 4,
        imageUrl: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80',
        description: 'Dữ liệu mẫu phục vụ test AI ghép cặp cung-cầu.',
        co2SavingsKg: 11,
    },
    {
        title: 'Vỏ trấu demo cho AI matching',
        category: 'Vỏ trấu',
        location: 'Long Xuyen, An Giang',
        unit: 'kg',
        priceVnd: 7600,
        qualityScore: 4,
        imageUrl: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=1200&q=80',
        description: 'Dữ liệu mẫu phục vụ test AI ghép cặp cung-cầu.',
        co2SavingsKg: 8,
    },
    {
        title: 'Bã mía demo cho AI matching',
        category: 'Bã mía',
        location: 'Bien Hoa, Đồng Nai',
        unit: 'kg',
        priceVnd: 5200,
        qualityScore: 3,
        imageUrl: 'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?auto=format&fit=crop&w=1200&q=80',
        description: 'Dữ liệu mẫu phục vụ test AI ghép cặp cung-cầu.',
        co2SavingsKg: 14,
    },
    {
        title: 'Rơm cuộn demo cho AI matching',
        category: 'Rơm rạ',
        location: 'Cao Lanh, Đồng Tháp',
        unit: 'cuộn',
        priceVnd: 78000,
        qualityScore: 4,
        imageUrl: 'https://images.unsplash.com/photo-1499529112087-3cb3b73cec95?auto=format&fit=crop&w=1200&q=80',
        description: 'Dữ liệu mẫu phục vụ test AI ghép cặp cung-cầu.',
        co2SavingsKg: 16,
    },
];

function getSchemaFromUrl(url: string): string | undefined {
    try {
        return new URL(url).searchParams.get('schema') ?? undefined;
    } catch {
        return undefined;
    }
}

function createPrismaClient() {
    const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!url) {
        throw new Error('DATABASE_URL (hoặc DIRECT_DATABASE_URL) chưa được cấu hình.');
    }

    if (url.startsWith('prisma://')) {
        throw new Error('Seed yêu cầu URL kết nối trực tiếp. Vui lòng cấu hình DIRECT_DATABASE_URL.');
    }

    const adapter = new PrismaPg({ connectionString: url }, { schema: getSchemaFromUrl(url) });
    return new PrismaClient({ adapter });
}

const prisma = createPrismaClient();

async function ensureDemoBuyers(): Promise<SeedUser[]> {
    const passwordHash = await bcrypt.hash('DemoBuyer123!', 10);

    const buyers = await Promise.all(
        DEMO_BUYERS.map((buyer) =>
            prisma.user.upsert({
                where: { email: buyer.email },
                update: {
                    name: buyer.name,
                    passwordHash,
                },
                create: {
                    email: buyer.email,
                    name: buyer.name,
                    passwordHash,
                },
                select: { id: true, email: true, name: true },
            }),
        ),
    );

    return buyers;
}

async function ensureProductsForTesting(): Promise<SeedProduct[]> {
    const existingProducts = await (prisma.product as any).findMany({
        where: { deletedAt: null },
        take: 12,
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            title: true,
            category: true,
            location: true,
            priceVnd: true,
            sellerId: true,
        },
    });

    if (existingProducts.length >= 4) {
        return existingProducts as SeedProduct[];
    }

    const passwordHash = await bcrypt.hash('DemoSeller123!', 10);
    const demoSeller = await prisma.user.upsert({
        where: { email: 'ai.seller@greenbyte.vn' },
        update: {
            name: 'Seller Demo AI',
            passwordHash,
        },
        create: {
            email: 'ai.seller@greenbyte.vn',
            name: 'Seller Demo AI',
            passwordHash,
            sellerVerified: true,
        },
        select: { id: true },
    });

    const createdProducts: SeedProduct[] = [];
    for (const item of FALLBACK_PRODUCTS) {
        const created = await (prisma.product as any).create({
            data: {
                title: item.title,
                priceVnd: item.priceVnd,
                qualityScore: item.qualityScore,
                unit: item.unit,
                category: item.category,
                location: item.location,
                imageUrl: item.imageUrl,
                description: item.description,
                co2SavingsKg: item.co2SavingsKg,
                sellerId: demoSeller.id,
            },
            select: {
                id: true,
                title: true,
                category: true,
                location: true,
                priceVnd: true,
                sellerId: true,
            },
        });

        createdProducts.push(created as SeedProduct);
    }

    return createdProducts;
}

async function clearDemoInteractions(buyerIds: string[]) {
    await (prisma as any).aiUsageEvent.deleteMany({
        where: {
            userId: { in: buyerIds },
        },
    });

    const inquiries = await (prisma as any).productInquiry.findMany({
        where: { buyerId: { in: buyerIds } },
        select: { id: true },
    });
    const inquiryIds = inquiries.map((row: { id: string }) => row.id);

    if (inquiryIds.length > 0) {
        await (prisma as any).productInquiryMessage.deleteMany({
            where: { inquiryId: { in: inquiryIds } },
        });
    }

    await (prisma as any).productInquiry.deleteMany({
        where: { buyerId: { in: buyerIds } },
    });

    await (prisma as any).productReview.deleteMany({
        where: { reviewerId: { in: buyerIds } },
    });

    await (prisma as any).productViewEvent.deleteMany({
        where: { viewerId: { in: buyerIds } },
    });

    await prisma.cartItem.deleteMany({
        where: { cart: { userId: { in: buyerIds } } } as any,
    });

    await prisma.cart.deleteMany({
        where: { userId: { in: buyerIds } },
    });
}

async function seedMarketInteractions(products: SeedProduct[], buyers: SeedUser[]) {
    let viewsCount = 0;
    let cartCount = 0;
    let inquiryCount = 0;
    let acceptedCount = 0;
    let reviewCount = 0;
    let aiEventCount = 0;

    const now = Date.now();

    for (let productIndex = 0; productIndex < products.length; productIndex += 1) {
        const product = products[productIndex];
        const buyerPool = buyers.filter((buyer) => buyer.id !== product.sellerId);
        if (buyerPool.length === 0) continue;

        const selectedBuyers = Array.from({ length: Math.min(4, buyerPool.length) }).map((_, offset) => {
            const idx = (productIndex + offset) % buyerPool.length;
            return buyerPool[idx];
        });

        for (let buyerIndex = 0; buyerIndex < selectedBuyers.length; buyerIndex += 1) {
            const buyer = selectedBuyers[buyerIndex];
            const daysAgo = 2 + ((productIndex * 5 + buyerIndex * 3) % 48);
            const baseAt = new Date(now - daysAgo * DAY_MS);

            const impressionCount = 3 + (buyerIndex % 2);
            for (let i = 0; i < impressionCount; i += 1) {
                await (prisma as any).aiUsageEvent.create({
                    data: {
                        module: 'RECOMMENDATIONS',
                        eventType: 'IMPRESSION',
                        userId: buyer.id,
                        productId: product.id,
                        category: product.category,
                        location: product.location,
                        sessionId: `seed-ai-${buyer.id.slice(0, 8)}`,
                        metadataJson: JSON.stringify({ source: 'seed-ai-test' }),
                        createdAt: new Date(baseAt.getTime() - i * 25 * 60 * 1000),
                    },
                });
                aiEventCount += 1;
            }

            await (prisma as any).aiUsageEvent.create({
                data: {
                    module: 'RECOMMENDATIONS',
                    eventType: 'CLICK',
                    userId: buyer.id,
                    productId: product.id,
                    category: product.category,
                    location: product.location,
                    sessionId: `seed-ai-${buyer.id.slice(0, 8)}`,
                    metadataJson: JSON.stringify({ source: 'seed-ai-test' }),
                    createdAt: new Date(baseAt.getTime() + 10 * 60 * 1000),
                },
            });
            aiEventCount += 1;

            const viewCount = 2 + (buyerIndex % 2);
            for (let i = 0; i < viewCount; i += 1) {
                await (prisma as any).productViewEvent.create({
                    data: {
                        productId: product.id,
                        viewerId: buyer.id,
                        viewedAt: new Date(baseAt.getTime() - i * 40 * 60 * 1000),
                    },
                });
                viewsCount += 1;
            }

            if (buyerIndex % 2 === 0) {
                const cart = await (prisma as any).cart.upsert({
                    where: { userId: buyer.id },
                    update: {},
                    create: { userId: buyer.id },
                    select: { id: true },
                });

                await (prisma as any).cartItem.upsert({
                    where: {
                        cartId_productId: {
                            cartId: cart.id,
                            productId: product.id,
                        },
                    },
                    update: {
                        quantity: 1 + (buyerIndex % 3),
                    },
                    create: {
                        cartId: cart.id,
                        productId: product.id,
                        quantity: 1 + (buyerIndex % 3),
                    },
                });

                await (prisma as any).aiUsageEvent.create({
                    data: {
                        module: 'RECOMMENDATIONS',
                        eventType: 'CART_ADD',
                        userId: buyer.id,
                        productId: product.id,
                        category: product.category,
                        location: product.location,
                        sessionId: `seed-ai-${buyer.id.slice(0, 8)}`,
                        metadataJson: JSON.stringify({ source: 'seed-ai-test' }),
                        createdAt: new Date(baseAt.getTime() + 20 * 60 * 1000),
                    },
                });

                cartCount += 1;
                aiEventCount += 1;
            }

            const statusPattern: Array<'ACCEPTED' | 'OPEN' | 'REJECTED' | 'ACCEPTED'> = ['ACCEPTED', 'OPEN', 'REJECTED', 'ACCEPTED'];
            const inquiryStatus = statusPattern[(productIndex + buyerIndex) % statusPattern.length];
            const latestOfferVnd = Math.max(1000, Math.round(product.priceVnd * (0.88 + (buyerIndex % 3) * 0.04)));

            const inquiry = await (prisma as any).productInquiry.create({
                data: {
                    productId: product.id,
                    buyerId: buyer.id,
                    sellerId: product.sellerId,
                    status: inquiryStatus,
                    latestOfferVnd,
                    lastMessageAt: new Date(baseAt.getTime() + 35 * 60 * 1000),
                    createdAt: new Date(baseAt.getTime() + 12 * 60 * 1000),
                },
                select: {
                    id: true,
                    status: true,
                },
            });
            inquiryCount += 1;

            await (prisma as any).productInquiryMessage.createMany({
                data: [
                    {
                        inquiryId: inquiry.id,
                        senderId: buyer.id,
                        message: `[seed-ai] Em cần nguồn hàng ổn định cho ${product.category}.`,
                        proposedPriceVnd: latestOfferVnd,
                        createdAt: new Date(baseAt.getTime() + 15 * 60 * 1000),
                    },
                    {
                        inquiryId: inquiry.id,
                        senderId: product.sellerId,
                        message:
                            inquiryStatus === 'ACCEPTED'
                                ? '[seed-ai] Đồng ý mức giá này, có thể giao ngay.'
                                : inquiryStatus === 'REJECTED'
                                    ? '[seed-ai] Mức giá này chưa phù hợp, hẹn dịp khác.'
                                    : '[seed-ai] Đang cân nhắc, mình sẽ phản hồi thêm.',
                        proposedPriceVnd: inquiryStatus === 'REJECTED' ? Math.round(product.priceVnd * 0.98) : latestOfferVnd,
                        createdAt: new Date(baseAt.getTime() + 30 * 60 * 1000),
                    },
                ],
            });

            await (prisma as any).aiUsageEvent.create({
                data: {
                    module: 'RECOMMENDATIONS',
                    eventType: 'INQUIRY_OPEN',
                    userId: buyer.id,
                    productId: product.id,
                    inquiryId: inquiry.id,
                    category: product.category,
                    location: product.location,
                    sessionId: `seed-ai-${buyer.id.slice(0, 8)}`,
                    metadataJson: JSON.stringify({ source: 'seed-ai-test', inquiry_status: inquiry.status }),
                    createdAt: new Date(baseAt.getTime() + 35 * 60 * 1000),
                },
            });
            aiEventCount += 1;

            if (inquiry.status === 'ACCEPTED') {
                await (prisma as any).aiUsageEvent.create({
                    data: {
                        module: 'RECOMMENDATIONS',
                        eventType: 'INQUIRY_ACCEPTED',
                        userId: buyer.id,
                        productId: product.id,
                        inquiryId: inquiry.id,
                        category: product.category,
                        location: product.location,
                        sessionId: `seed-ai-${buyer.id.slice(0, 8)}`,
                        metadataJson: JSON.stringify({ source: 'seed-ai-test' }),
                        createdAt: new Date(baseAt.getTime() + 60 * 60 * 1000),
                    },
                });
                acceptedCount += 1;
                aiEventCount += 1;
            }

            if (inquiry.status === 'ACCEPTED' || buyerIndex === 1) {
                const rating = inquiry.status === 'ACCEPTED' ? 5 : 4;
                await (prisma as any).productReview.create({
                    data: {
                        productId: product.id,
                        reviewerId: buyer.id,
                        sellerId: product.sellerId,
                        rating,
                        content:
                            inquiry.status === 'ACCEPTED'
                                ? '[seed-ai] Giao dịch ổn, thời gian phản hồi nhanh.'
                                : '[seed-ai] Tin đăng rõ ràng, người bán hỗ trợ tốt.',
                        isVerifiedInteraction: true,
                        createdAt: new Date(baseAt.getTime() + 3 * HOUR_MS),
                    },
                });
                reviewCount += 1;
            }
        }
    }

    return {
        viewsCount,
        cartCount,
        inquiryCount,
        acceptedCount,
        reviewCount,
        aiEventCount,
    };
}

async function main() {
    console.log('🧪 Bắt đầu seed dữ liệu AI test...');

    const buyers = await ensureDemoBuyers();
    const buyerIds = buyers.map((buyer) => buyer.id);

    await clearDemoInteractions(buyerIds);

    const products = await ensureProductsForTesting();
    const seeded = await seedMarketInteractions(products, buyers);

    console.log('✅ Seed AI test hoàn tất');
    console.log(`   - Demo buyers: ${buyers.length}`);
    console.log(`   - Products dùng để test: ${products.length}`);
    console.log(`   - Views: ${seeded.viewsCount}`);
    console.log(`   - Cart adds: ${seeded.cartCount}`);
    console.log(`   - Inquiries: ${seeded.inquiryCount}`);
    console.log(`   - Accepted inquiries: ${seeded.acceptedCount}`);
    console.log(`   - Reviews: ${seeded.reviewCount}`);
    console.log(`   - AI events: ${seeded.aiEventCount}`);
    console.log('ℹ️ Có thể đăng nhập buyer demo bằng mật khẩu: DemoBuyer123!');
}

main()
    .catch((error) => {
        console.error('❌ Seed AI test thất bại:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
