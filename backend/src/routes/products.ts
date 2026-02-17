import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { optionalAuth, requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { cacheGet, cacheSet, cacheDelete, CACHE_KEYS, CACHE_TTL } from '../cache';

export const productsRouter = Router();

function isAccelerateEnabled(): boolean {
    const url = process.env.DATABASE_URL;
    return typeof url === 'string' && url.startsWith('prisma://');
}

function humanizeFromDate(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `${Math.max(1, diffMin)} phút trước`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH} giờ trước`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD} ngày trước`;
    const diffW = Math.floor(diffD / 7);
    return `${diffW} tuần trước`;
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
}

async function getSellerRatingStats(sellerIds: string[]) {
    if (sellerIds.length === 0) return new Map<string, { average: number; count: number }>();

    const rows = await (prisma as any).productReview.groupBy({
        by: ['sellerId'],
        where: { sellerId: { in: sellerIds } },
        _avg: { rating: true },
        _count: { _all: true },
    });

    return new Map<string, { average: number; count: number }>(
        rows.map((r: any) => [r.sellerId, { average: Number(r._avg?.rating ?? 0), count: Number(r._count?._all ?? 0) }]),
    );
}

const ProductListQuerySchema = z.object({
    search: z.string().optional(),
    category: z.string().optional(),
    take: z.coerce.number().int().min(1).max(100).optional(),
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    minQuality: z.coerce.number().int().min(1).max(5).optional(),
    maxDistanceKm: z.coerce.number().min(0).max(2000).optional(),
    userLat: z.coerce.number().min(-90).max(90).optional(),
    userLng: z.coerce.number().min(-180).max(180).optional(),
    sort: z.enum(['newest', 'price_asc', 'price_desc', 'quality_desc', 'distance_asc']).optional(),
});

async function buildSellerRankings(limit: number) {
    const reviewGroups = await (prisma as any).productReview.groupBy({
        by: ['sellerId'],
        _avg: { rating: true },
        _count: { _all: true },
    });

    const listingGroups = await (prisma.product as any).groupBy({
        by: ['sellerId'],
        where: { deletedAt: null },
        _count: { _all: true },
    } as any);

    const listingCountBySeller = new Map<string, number>(
        listingGroups.map((g: any) => [g.sellerId, Number(g._count?._all ?? 0)]),
    );

    const sellerIds = reviewGroups.map((g: any) => g.sellerId);
    const sellers: any[] = sellerIds.length
        ? await (prisma.user as any).findMany({
            where: { id: { in: sellerIds } },
            select: { id: true, name: true, sellerVerified: true },
        })
        : [];

    const sellerById = new Map(sellers.map((seller: any) => [seller.id, seller]));

    return reviewGroups
        .map((group: any) => {
            const avg = Number(group._avg?.rating ?? 0);
            const reviews = Number(group._count?._all ?? 0);
            const listingCount = listingCountBySeller.get(group.sellerId) ?? 0;
            const qualityScore = avg * 0.8 + Math.min(reviews, 50) / 25 + Math.min(listingCount, 20) / 40;
            const seller = sellerById.get(group.sellerId);
            return {
                seller_id: group.sellerId,
                seller_name: seller?.name ?? 'Người bán',
                verified: Boolean(seller?.sellerVerified),
                average_rating: Number(avg.toFixed(2)),
                total_reviews: reviews,
                total_listings: listingCount,
                ranking_score: Number(qualityScore.toFixed(2)),
            };
        })
        .sort((a: any, b: any) => b.ranking_score - a.ranking_score)
        .slice(0, limit)
        .map((item: any, index: number) => ({ ...item, rank: index + 1 }));
}

productsRouter.get('/', async (req, res, next) => {
    try {
        const query = ProductListQuerySchema.parse(req.query);

        if (query.minPrice !== undefined && query.maxPrice !== undefined && query.minPrice > query.maxPrice) {
            return res.status(400).json({ error: 'Khoảng giá không hợp lệ' });
        }

        const cacheKey = `products:advanced:${JSON.stringify(query)}`;
        const cached = await cacheGet(cacheKey);
        if (cached) {
            return res.json(JSON.parse(cached));
        }

        const where: Record<string, unknown> = { deletedAt: null };

        if (query.category && query.category !== 'Tất cả') {
            (where as any).category = query.category;
        }

        if (query.search) {
            (where as any).OR = [
                { title: { contains: query.search, mode: 'insensitive' } },
                { location: { contains: query.search, mode: 'insensitive' } },
            ];
        }

        if (query.minPrice !== undefined || query.maxPrice !== undefined) {
            (where as any).priceVnd = {};
            if (query.minPrice !== undefined) (where as any).priceVnd.gte = query.minPrice;
            if (query.maxPrice !== undefined) (where as any).priceVnd.lte = query.maxPrice;
        }

        if (query.minQuality !== undefined) {
            (where as any).qualityScore = { gte: query.minQuality };
        }

        const baseOrder =
            query.sort === 'price_asc'
                ? ({ priceVnd: 'asc' } as const)
                : query.sort === 'price_desc'
                    ? ({ priceVnd: 'desc' } as const)
                    : query.sort === 'quality_desc'
                        ? ({ qualityScore: 'desc' } as const)
                        : ({ createdAt: 'desc' } as const);

        const baseArgs = {
            where: where as any,
            orderBy: baseOrder,
            take: query.take ?? 60,
            select: {
                id: true,
                title: true,
                priceVnd: true,
                qualityScore: true,
                unit: true,
                category: true,
                location: true,
                latitude: true,
                longitude: true,
                imageUrl: true,
                description: true,
                co2SavingsKg: true,
                createdAt: true,
                sellerId: true,
                seller: { select: { name: true } },
            },
        };

        const rows = isAccelerateEnabled()
            ? await (prisma.product as any).findMany({
                ...baseArgs,
                cacheStrategy: {
                    swr: 30,
                    ttl: 30,
                    tags: ['products'],
                },
            })
            : await (prisma.product as any).findMany(baseArgs as any);

        const sellerIds = [...new Set(rows.map((r: any) => String(r.sellerId)))] as string[];
        const sellerStats = await getSellerRatingStats(sellerIds);

        const productsWithDistance = rows
            .map((p: any) => {
                const distanceKm =
                    query.userLat !== undefined &&
                        query.userLng !== undefined &&
                        typeof p.latitude === 'number' &&
                        typeof p.longitude === 'number'
                        ? haversineDistanceKm(query.userLat, query.userLng, p.latitude, p.longitude)
                        : null;

                return { ...p, distanceKm };
            })
            .filter((p: any) => {
                if (query.maxDistanceKm === undefined) return true;
                return typeof p.distanceKm === 'number' && p.distanceKm <= query.maxDistanceKm;
            });

        if (query.sort === 'distance_asc') {
            productsWithDistance.sort((a: any, b: any) => {
                if (a.distanceKm === null && b.distanceKm === null) return 0;
                if (a.distanceKm === null) return 1;
                if (b.distanceKm === null) return -1;
                return a.distanceKm - b.distanceKm;
            });
        }

        const data = productsWithDistance.map((p: any) => {
            const seller = sellerStats.get(p.sellerId);
            return {
                id: p.id,
                title: p.title,
                price: p.priceVnd,
                quality_score: p.qualityScore,
                unit: p.unit,
                category: p.category,
                location: p.location,
                latitude: p.latitude,
                longitude: p.longitude,
                image: p.imageUrl,
                seller_id: p.sellerId,
                seller_name: p.seller.name,
                seller_rating_avg: seller ? Number(seller.average.toFixed(1)) : 0,
                seller_review_count: seller?.count ?? 0,
                distance_km: typeof p.distanceKm === 'number' ? Number(p.distanceKm.toFixed(1)) : null,
                co2_savings_kg: p.co2SavingsKg,
                description: p.description ?? undefined,
                posted_at: humanizeFromDate(p.createdAt),
            };
        });

        const response = { products: data };

        await cacheSet(cacheKey, JSON.stringify(response), CACHE_TTL.productsList);

        return res.json(response);
    } catch (err) {
        return next(err);
    }
});

productsRouter.get('/sellers/rankings', async (req, res, next) => {
    try {
        const query = z.object({ take: z.coerce.number().int().min(1).max(50).optional() }).parse(req.query);

        const rankingTake = query.take ?? 10;
        const ranked = await buildSellerRankings(rankingTake);

        return res.json({ rankings: ranked });
    } catch (err) {
        return next(err);
    }
});

productsRouter.get('/sellers/:sellerId/profile', async (req, res, next) => {
    try {
        const params = z.object({ sellerId: z.string().uuid() }).parse(req.params);

        const seller = await prisma.user.findUnique({
            where: { id: params.sellerId },
            select: { id: true, name: true, sellerVerified: true, createdAt: true },
        });

        if (!seller) {
            return res.status(404).json({ error: 'Không tìm thấy seller' });
        }

        const listings: any[] = await (prisma.product as any).findMany({
            where: { sellerId: seller.id, deletedAt: null },
            select: {
                id: true,
                title: true,
                imageUrl: true,
                location: true,
                unit: true,
                category: true,
                priceVnd: true,
                qualityScore: true,
                co2SavingsKg: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 24,
        } as any);

        const listingIds = listings.map((item: any) => String(item.id));

        const [reviewSummaryRows, inquiryGroups, acceptedGroups, viewGroups, rankings] = await Promise.all([
            (prisma as any).productReview.groupBy({
                by: ['sellerId'],
                where: { sellerId: seller.id },
                _avg: { rating: true },
                _count: { _all: true },
            }),
            listingIds.length
                ? (prisma as any).productInquiry.groupBy({ by: ['productId'], where: { productId: { in: listingIds } }, _count: { _all: true } })
                : Promise.resolve([]),
            listingIds.length
                ? (prisma as any).productInquiry.groupBy({ by: ['productId'], where: { productId: { in: listingIds }, status: 'ACCEPTED' }, _count: { _all: true } })
                : Promise.resolve([]),
            listingIds.length
                ? (prisma as any).productViewEvent.groupBy({ by: ['productId'], where: { productId: { in: listingIds } }, _count: { _all: true } })
                : Promise.resolve([]),
            buildSellerRankings(100),
        ]);

        const reviewSummary = reviewSummaryRows[0];
        const totalViews = (viewGroups as any[]).reduce((sum: number, row: any) => sum + Number(row._count?._all ?? 0), 0);
        const totalInquiries = (inquiryGroups as any[]).reduce((sum: number, row: any) => sum + Number(row._count?._all ?? 0), 0);
        const totalAcceptedDeals = (acceptedGroups as any[]).reduce((sum: number, row: any) => sum + Number(row._count?._all ?? 0), 0);

        const rankItem = rankings.find((item: any) => item.seller_id === seller.id) ?? null;
        const interactionRate = totalViews > 0 ? (totalInquiries / totalViews) * 100 : 0;
        const conversionRate = totalViews > 0 ? (totalAcceptedDeals / totalViews) * 100 : 0;

        return res.json({
            seller: {
                id: seller.id,
                name: seller.name,
                verified: Boolean(seller.sellerVerified),
                joined_at: seller.createdAt,
            },
            overview: {
                rank: rankItem?.rank ?? null,
                totalListings: listings.length,
                totalReviews: Number(reviewSummary?._count?._all ?? 0),
                averageRating: Number((reviewSummary?._avg?.rating ?? 0).toFixed(2)),
                totalViews,
                totalInquiries,
                totalAcceptedDeals,
                interactionRatePct: Number(interactionRate.toFixed(2)),
                conversionRatePct: Number(conversionRate.toFixed(2)),
            },
            listings: listings.map((item: any) => ({
                id: item.id,
                title: item.title,
                image: item.imageUrl,
                location: item.location,
                unit: item.unit,
                category: item.category,
                price: item.priceVnd,
                quality_score: item.qualityScore,
                co2_savings_kg: item.co2SavingsKg,
                posted_at: item.createdAt,
            })),
        });
    } catch (err) {
        return next(err);
    }
});

productsRouter.get('/seller/dashboard', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const sellerId = req.user!.id;

        const products: any[] = await (prisma.product as any).findMany({
            where: { sellerId, deletedAt: null },
            select: {
                id: true,
                title: true,
                priceVnd: true,
                qualityScore: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
        } as any);

        if (products.length === 0) {
            return res.json({
                overview: {
                    totalListings: 0,
                    totalViews: 0,
                    totalInquiries: 0,
                    totalAcceptedDeals: 0,
                    totalReviews: 0,
                    avgRating: 0,
                },
                listings: [],
            });
        }

        const productIds = products.map((p: any) => String(p.id));

        const [viewGroups, inquiryGroups, acceptedGroups, reviewGroups] = await Promise.all([
            (prisma as any).productViewEvent.groupBy({ by: ['productId'], where: { productId: { in: productIds } }, _count: { _all: true } }),
            (prisma as any).productInquiry.groupBy({ by: ['productId'], where: { productId: { in: productIds } }, _count: { _all: true } }),
            (prisma as any).productInquiry.groupBy({ by: ['productId'], where: { productId: { in: productIds }, status: 'ACCEPTED' }, _count: { _all: true } }),
            (prisma as any).productReview.groupBy({ by: ['productId'], where: { productId: { in: productIds } }, _count: { _all: true }, _avg: { rating: true } }),
        ]);

        const viewsByProduct = new Map(viewGroups.map((g: any) => [g.productId, Number(g._count?._all ?? 0)]));
        const inquiriesByProduct = new Map(inquiryGroups.map((g: any) => [g.productId, Number(g._count?._all ?? 0)]));
        const acceptedByProduct = new Map(acceptedGroups.map((g: any) => [g.productId, Number(g._count?._all ?? 0)]));
        const reviewsByProduct = new Map(
            reviewGroups.map((g: any) => [
                g.productId,
                { count: Number(g._count?._all ?? 0), avg: Number(g._avg?.rating ?? 0) },
            ]),
        );

        const listingMetrics = products.map((p: any) => {
            const views = Number(viewsByProduct.get(p.id) ?? 0);
            const inquiries = Number(inquiriesByProduct.get(p.id) ?? 0);
            const accepted = Number(acceptedByProduct.get(p.id) ?? 0);
            const review = (reviewsByProduct.get(p.id) as { count: number; avg: number } | undefined) ?? { count: 0, avg: 0 };
            const conversionRate = views > 0 ? (accepted / views) * 100 : 0;
            const interactionRate = views > 0 ? (inquiries / views) * 100 : 0;

            return {
                product_id: p.id,
                title: p.title,
                price: p.priceVnd,
                quality_score: p.qualityScore,
                created_at: p.createdAt,
                views,
                inquiries,
                accepted_deals: accepted,
                review_count: review.count,
                avg_rating: Number(review.avg.toFixed(2)),
                interaction_rate_pct: Number(interactionRate.toFixed(2)),
                conversion_rate_pct: Number(conversionRate.toFixed(2)),
            };
        });

        const totalViews = listingMetrics.reduce((sum: number, item: any) => sum + item.views, 0);
        const totalInquiries = listingMetrics.reduce((sum: number, item: any) => sum + item.inquiries, 0);
        const totalAcceptedDeals = listingMetrics.reduce((sum: number, item: any) => sum + item.accepted_deals, 0);
        const totalReviews = listingMetrics.reduce((sum: number, item: any) => sum + item.review_count, 0);
        const ratingWeightedSum = listingMetrics.reduce((sum: number, item: any) => sum + item.avg_rating * item.review_count, 0);
        const avgRating = totalReviews > 0 ? ratingWeightedSum / totalReviews : 0;

        return res.json({
            overview: {
                totalListings: listingMetrics.length,
                totalViews,
                totalInquiries,
                totalAcceptedDeals,
                totalReviews,
                avgRating: Number(avgRating.toFixed(2)),
            },
            listings: listingMetrics,
        });
    } catch (err) {
        return next(err);
    }
});

productsRouter.get('/seller/listings', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const sellerId = req.user!.id;

        const listings: any[] = await (prisma.product as any).findMany({
            where: { sellerId, deletedAt: null },
            select: {
                id: true,
                title: true,
                priceVnd: true,
                qualityScore: true,
                unit: true,
                category: true,
                location: true,
                imageUrl: true,
                description: true,
                co2SavingsKg: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
        } as any);

        return res.json({
            listings: listings.map((item: any) => ({
                id: item.id,
                title: item.title,
                price: item.priceVnd,
                quality_score: item.qualityScore,
                unit: item.unit,
                category: item.category,
                location: item.location,
                image: item.imageUrl,
                description: item.description ?? undefined,
                co2_savings_kg: item.co2SavingsKg,
                posted_at: item.createdAt,
            })),
        });
    } catch (err) {
        return next(err);
    }
});

productsRouter.get('/:id/reviews', async (req, res, next) => {
    try {
        const productId = z.string().uuid().parse(req.params.id);

        const reviews = await (prisma as any).productReview.findMany({
            where: { productId },
            include: { reviewer: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });

        const summaryRows = await (prisma as any).productReview.groupBy({
            by: ['productId'],
            where: { productId },
            _avg: { rating: true },
            _count: { _all: true },
        });

        const summary = summaryRows[0];

        return res.json({
            summary: {
                average_rating: Number((summary?._avg?.rating ?? 0).toFixed(2)),
                total_reviews: Number(summary?._count?._all ?? 0),
            },
            reviews: reviews.map((review: any) => ({
                id: review.id,
                reviewer: review.reviewer,
                rating: review.rating,
                content: review.content,
                verified_interaction: review.isVerifiedInteraction,
                created_at: review.createdAt,
            })),
        });
    } catch (err) {
        return next(err);
    }
});

const CreateReviewSchema = z.object({
    rating: z.number().int().min(1).max(5),
    content: z.string().trim().min(6).max(1000),
});

productsRouter.post('/:id/reviews', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const productId = z.string().uuid().parse(req.params.id);
        const body = CreateReviewSchema.parse(req.body);
        const reviewerId = req.user!.id;

        const product = await (prisma.product as any).findFirst({
            where: { id: productId, deletedAt: null },
            select: { id: true, sellerId: true },
        });

        if (!product) {
            return res.status(404).json({ error: 'Sản phẩm không tồn tại' });
        }

        if (product.sellerId === reviewerId) {
            return res.status(400).json({ error: 'Không thể tự đánh giá sản phẩm của chính bạn' });
        }

        const existed = await (prisma as any).productReview.findFirst({
            where: { productId, reviewerId },
            select: { id: true },
        });

        if (existed) {
            return res.status(409).json({ error: 'Bạn đã đánh giá sản phẩm này rồi' });
        }

        const [cartInteraction, inquiryInteraction] = await Promise.all([
            prisma.cartItem.findFirst({ where: { productId, cart: { userId: reviewerId } }, select: { id: true } } as any),
            (prisma as any).productInquiry.findFirst({ where: { productId, buyerId: reviewerId }, select: { id: true } }),
        ]);

        const isVerifiedInteraction = Boolean(cartInteraction || inquiryInteraction);

        const review = await (prisma as any).productReview.create({
            data: {
                productId,
                reviewerId,
                sellerId: product.sellerId,
                rating: body.rating,
                content: body.content,
                isVerifiedInteraction,
            },
            include: { reviewer: { select: { id: true, name: true } } },
        });

        await cacheDelete(CACHE_KEYS.productsInvalidate);

        return res.status(201).json({
            review: {
                id: review.id,
                reviewer: review.reviewer,
                rating: review.rating,
                content: review.content,
                verified_interaction: review.isVerifiedInteraction,
                created_at: review.createdAt,
            },
        });
    } catch (err) {
        return next(err);
    }
});

const StartInquirySchema = z.object({
    message: z.string().trim().min(2).max(1000),
    proposed_price_vnd: z.number().int().min(0).max(1_000_000_000).optional(),
});

productsRouter.post('/:id/inquiries', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const productId = z.string().uuid().parse(req.params.id);
        const body = StartInquirySchema.parse(req.body);
        const buyerId = req.user!.id;

        const product = await (prisma.product as any).findFirst({
            where: { id: productId, deletedAt: null },
            select: { id: true, sellerId: true },
        });

        if (!product) {
            return res.status(404).json({ error: 'Sản phẩm không tồn tại' });
        }

        if (product.sellerId === buyerId) {
            return res.status(400).json({ error: 'Không thể mở đàm phán với chính bạn' });
        }

        const now = new Date();

        const inquiry = await (prisma as any).$transaction(async (tx: any) => {
            const existing = await tx.productInquiry.findFirst({
                where: { productId, buyerId, status: 'OPEN' },
                orderBy: { createdAt: 'desc' },
            });

            const activeInquiry =
                existing ??
                (await tx.productInquiry.create({
                    data: {
                        productId,
                        buyerId,
                        sellerId: product.sellerId,
                        status: 'OPEN',
                        latestOfferVnd: body.proposed_price_vnd,
                        lastMessageAt: now,
                    },
                }));

            await tx.productInquiryMessage.create({
                data: {
                    inquiryId: activeInquiry.id,
                    senderId: buyerId,
                    message: body.message,
                    proposedPriceVnd: body.proposed_price_vnd,
                },
            });

            const updated = await tx.productInquiry.update({
                where: { id: activeInquiry.id },
                data: {
                    lastMessageAt: now,
                    latestOfferVnd: body.proposed_price_vnd ?? activeInquiry.latestOfferVnd,
                },
                include: {
                    buyer: { select: { id: true, name: true } },
                    seller: { select: { id: true, name: true } },
                    messages: {
                        orderBy: { createdAt: 'asc' },
                        include: { sender: { select: { id: true, name: true } } },
                    },
                },
            });

            return updated;
        });

        return res.status(201).json({
            inquiry: {
                id: inquiry.id,
                product_id: inquiry.productId,
                buyer: inquiry.buyer,
                seller: inquiry.seller,
                status: inquiry.status,
                latest_offer_vnd: inquiry.latestOfferVnd,
                last_message_at: inquiry.lastMessageAt,
                created_at: inquiry.createdAt,
                messages: inquiry.messages.map((m: any) => ({
                    id: m.id,
                    sender: m.sender,
                    message: m.message,
                    proposed_price_vnd: m.proposedPriceVnd,
                    created_at: m.createdAt,
                })),
            },
        });
    } catch (err) {
        return next(err);
    }
});

productsRouter.get('/:id/inquiries', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const productId = z.string().uuid().parse(req.params.id);
        const userId = req.user!.id;

        const product = await (prisma.product as any).findFirst({
            where: { id: productId, deletedAt: null },
            select: { sellerId: true },
        });

        if (!product) return res.status(404).json({ error: 'Sản phẩm không tồn tại' });

        const where =
            product.sellerId === userId
                ? { productId }
                : { productId, buyerId: userId };

        const inquiries = await (prisma as any).productInquiry.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            include: {
                buyer: { select: { id: true, name: true } },
                seller: { select: { id: true, name: true } },
                messages: {
                    orderBy: { createdAt: 'asc' },
                    include: { sender: { select: { id: true, name: true } } },
                    take: 100,
                },
            },
            take: 50,
        });

        return res.json({
            inquiries: inquiries.map((inquiry: any) => ({
                id: inquiry.id,
                product_id: inquiry.productId,
                buyer: inquiry.buyer,
                seller: inquiry.seller,
                status: inquiry.status,
                latest_offer_vnd: inquiry.latestOfferVnd,
                last_message_at: inquiry.lastMessageAt,
                created_at: inquiry.createdAt,
                messages: inquiry.messages.map((m: any) => ({
                    id: m.id,
                    sender: m.sender,
                    message: m.message,
                    proposed_price_vnd: m.proposedPriceVnd,
                    created_at: m.createdAt,
                })),
            })),
        });
    } catch (err) {
        return next(err);
    }
});

const InquiryMessageSchema = z.object({
    message: z.string().trim().min(2).max(1000),
    proposed_price_vnd: z.number().int().min(0).max(1_000_000_000).optional(),
});

productsRouter.post('/inquiries/:inquiryId/messages', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const inquiryId = z.string().uuid().parse(req.params.inquiryId);
        const body = InquiryMessageSchema.parse(req.body);
        const senderId = req.user!.id;

        const inquiry = await (prisma as any).productInquiry.findUnique({ where: { id: inquiryId } });
        if (!inquiry) return res.status(404).json({ error: 'Phiên đàm phán không tồn tại' });

        if (![inquiry.buyerId, inquiry.sellerId].includes(senderId)) {
            return res.status(403).json({ error: 'Bạn không có quyền truy cập phiên này' });
        }

        if (inquiry.status !== 'OPEN') {
            return res.status(400).json({ error: 'Phiên đàm phán đã đóng' });
        }

        const now = new Date();

        const message = await (prisma as any).$transaction(async (tx: any) => {
            const created = await tx.productInquiryMessage.create({
                data: {
                    inquiryId,
                    senderId,
                    message: body.message,
                    proposedPriceVnd: body.proposed_price_vnd,
                },
                include: { sender: { select: { id: true, name: true } } },
            });

            await tx.productInquiry.update({
                where: { id: inquiryId },
                data: {
                    lastMessageAt: now,
                    latestOfferVnd: body.proposed_price_vnd ?? inquiry.latestOfferVnd,
                },
            });

            return created;
        });

        return res.status(201).json({
            message: {
                id: message.id,
                sender: message.sender,
                message: message.message,
                proposed_price_vnd: message.proposedPriceVnd,
                created_at: message.createdAt,
            },
        });
    } catch (err) {
        return next(err);
    }
});

const InquiryStatusSchema = z.object({
    status: z.enum(['OPEN', 'ACCEPTED', 'REJECTED', 'CLOSED']),
});

productsRouter.patch('/inquiries/:inquiryId/status', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const inquiryId = z.string().uuid().parse(req.params.inquiryId);
        const body = InquiryStatusSchema.parse(req.body);
        const userId = req.user!.id;

        const inquiry = await (prisma as any).productInquiry.findUnique({ where: { id: inquiryId } });
        if (!inquiry) return res.status(404).json({ error: 'Phiên đàm phán không tồn tại' });

        if (inquiry.sellerId !== userId) {
            return res.status(403).json({ error: 'Chỉ người bán mới có thể cập nhật trạng thái' });
        }

        const updated = await (prisma as any).productInquiry.update({
            where: { id: inquiryId },
            data: { status: body.status },
            select: {
                id: true,
                status: true,
                latestOfferVnd: true,
                lastMessageAt: true,
            },
        });

        return res.json({
            inquiry: {
                id: updated.id,
                status: updated.status,
                latest_offer_vnd: updated.latestOfferVnd,
                last_message_at: updated.lastMessageAt,
            },
        });
    } catch (err) {
        return next(err);
    }
});

productsRouter.get('/:id', optionalAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const cacheKey = CACHE_KEYS.productById(id);
        const cached = await cacheGet(cacheKey);

        if (cached) {
            return res.json(JSON.parse(cached));
        }

        const product = await (prisma.product as any).findFirst({
            where: { id, deletedAt: null },
            include: { seller: { select: { id: true, name: true, sellerVerified: true } } },
        } as any);

        if (!product) {
            return res.status(404).json({ error: 'Sản phẩm không tồn tại' });
        }

        const [reviewSummaryRows, sellerReviewRows] = await Promise.all([
            (prisma as any).productReview.groupBy({
                by: ['productId'],
                where: { productId: id },
                _avg: { rating: true },
                _count: { _all: true },
            }),
            (prisma as any).productReview.groupBy({
                by: ['sellerId'],
                where: { sellerId: product.sellerId },
                _avg: { rating: true },
                _count: { _all: true },
            }),
        ]);

        const productReviewSummary = reviewSummaryRows[0];
        const sellerReviewSummary = sellerReviewRows[0];

        const response = {
            product: {
                id: product.id,
                title: product.title,
                price: product.priceVnd,
                quality_score: product.qualityScore,
                unit: product.unit,
                category: product.category,
                location: product.location,
                latitude: product.latitude,
                longitude: product.longitude,
                image: product.imageUrl,
                seller_id: product.seller.id,
                seller_name: product.seller.name,
                seller_verified: Boolean(product.seller.sellerVerified),
                seller_rating_avg: Number((sellerReviewSummary?._avg?.rating ?? 0).toFixed(2)),
                seller_review_count: Number(sellerReviewSummary?._count?._all ?? 0),
                review_avg: Number((productReviewSummary?._avg?.rating ?? 0).toFixed(2)),
                review_count: Number(productReviewSummary?._count?._all ?? 0),
                co2_savings_kg: product.co2SavingsKg,
                description: product.description ?? undefined,
                posted_at: product.createdAt,
            },
        };

        await cacheSet(cacheKey, JSON.stringify(response), CACHE_TTL.productById);

        void (prisma as any).productViewEvent
            .create({
                data: {
                    productId: product.id,
                    viewerId: req.user?.id ?? null,
                },
            })
            .catch(() => undefined);

        return res.json(response);
    } catch (err) {
        return next(err);
    }
});

const CreateProductSchema = z
    .object({
        title: z.string().min(3).max(200),
        price: z.number().int().min(0).max(1_000_000_000),
        quality_score: z.number().int().min(1).max(5).optional(),
        unit: z.string().min(1).max(30),
        category: z.string().min(1).max(50),
        location: z.string().min(1).max(120),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        image: z.string().url().max(500),
        co2_savings_kg: z.number().int().min(0).max(1_000_000),
        description: z.string().max(2000).optional(),
    })
    .superRefine((value, ctx) => {
        const hasLat = typeof value.latitude === 'number';
        const hasLng = typeof value.longitude === 'number';
        if (hasLat !== hasLng) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'latitude và longitude phải đi cùng nhau',
                path: ['latitude'],
            });
        }
    });

const UpdateProductSchema = z
    .object({
        title: z.string().min(3).max(200).optional(),
        price: z.number().int().min(0).max(1_000_000_000).optional(),
        quality_score: z.number().int().min(1).max(5).optional(),
        unit: z.string().min(1).max(30).optional(),
        category: z.string().min(1).max(50).optional(),
        location: z.string().min(1).max(120).optional(),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        image: z.string().url().max(500).optional(),
        co2_savings_kg: z.number().int().min(0).max(1_000_000).optional(),
        description: z.string().max(2000).optional(),
    })
    .superRefine((value, ctx) => {
        const hasLat = typeof value.latitude === 'number';
        const hasLng = typeof value.longitude === 'number';
        if (hasLat !== hasLng) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'latitude và longitude phải đi cùng nhau',
                path: ['latitude'],
            });
        }

        if (Object.keys(value).length === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Không có dữ liệu để cập nhật',
                path: ['title'],
            });
        }
    });

productsRouter.post('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const body = CreateProductSchema.parse(req.body);
        const userId = req.user!.id;

        const created = await (prisma.product as any).create({
            data: {
                title: body.title,
                priceVnd: body.price,
                qualityScore: body.quality_score ?? 3,
                unit: body.unit,
                category: body.category,
                location: body.location,
                latitude: body.latitude,
                longitude: body.longitude,
                imageUrl: body.image,
                co2SavingsKg: body.co2_savings_kg,
                description: body.description,
                sellerId: userId,
            },
            include: { seller: { select: { id: true, name: true } } },
        } as any);

        res.status(201).json({
            product: {
                id: created.id,
                title: created.title,
                price: created.priceVnd,
                quality_score: created.qualityScore,
                unit: created.unit,
                category: created.category,
                location: created.location,
                latitude: created.latitude,
                longitude: created.longitude,
                image: created.imageUrl,
                seller_id: created.seller.id,
                seller_name: created.seller.name,
                co2_savings_kg: created.co2SavingsKg,
                description: created.description ?? undefined,
                posted_at: humanizeFromDate(created.createdAt),
            },
        });

        await cacheDelete(CACHE_KEYS.productsInvalidate);

        if (isAccelerateEnabled()) {
            const accel = (prisma as any).$accelerate;
            if (accel?.invalidate) {
                try {
                    await accel.invalidate({ tags: ['products'] });
                } catch {
                    // ignore cache invalidation errors
                }
            }
        }
    } catch (err) {
        next(err);
    }
});

productsRouter.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const userId = req.user!.id;
        const params = z.object({ id: z.string().uuid() }).parse(req.params);
        const body = UpdateProductSchema.parse(req.body);

        const existing = await (prisma.product as any).findFirst({
            where: { id: params.id, sellerId: userId, deletedAt: null },
            include: { seller: { select: { id: true, name: true } } },
        });

        if (!existing) {
            return res.status(404).json({ error: 'Không tìm thấy sản phẩm để cập nhật' });
        }

        const data: Record<string, unknown> = {};
        if (body.title !== undefined) data.title = body.title;
        if (body.price !== undefined) data.priceVnd = body.price;
        if (body.quality_score !== undefined) data.qualityScore = body.quality_score;
        if (body.unit !== undefined) data.unit = body.unit;
        if (body.category !== undefined) data.category = body.category;
        if (body.location !== undefined) data.location = body.location;
        if (body.latitude !== undefined) data.latitude = body.latitude;
        if (body.longitude !== undefined) data.longitude = body.longitude;
        if (body.image !== undefined) data.imageUrl = body.image;
        if (body.co2_savings_kg !== undefined) data.co2SavingsKg = body.co2_savings_kg;
        if (body.description !== undefined) data.description = body.description;

        const updated = await (prisma.product as any).update({
            where: { id: params.id },
            data,
            include: { seller: { select: { id: true, name: true } } },
        });

        await cacheDelete(CACHE_KEYS.productsInvalidate);

        if (isAccelerateEnabled()) {
            const accel = (prisma as any).$accelerate;
            if (accel?.invalidate) {
                try {
                    await accel.invalidate({ tags: ['products'] });
                } catch {
                    // ignore cache invalidation errors
                }
            }
        }

        return res.json({
            product: {
                id: updated.id,
                title: updated.title,
                price: updated.priceVnd,
                quality_score: updated.qualityScore,
                unit: updated.unit,
                category: updated.category,
                location: updated.location,
                image: updated.imageUrl,
                description: updated.description ?? undefined,
                co2_savings_kg: updated.co2SavingsKg,
                posted_at: updated.createdAt,
            },
        });
    } catch (err) {
        next(err);
    }
});

productsRouter.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const userId = req.user!.id;
        const params = z.object({ id: z.string().uuid() }).parse(req.params);

        const existing = await (prisma.product as any).findFirst({
            where: { id: params.id, sellerId: userId, deletedAt: null },
            select: { id: true },
        });

        if (!existing) {
            return res.status(404).json({ error: 'Không tìm thấy sản phẩm để xóa' });
        }

        await (prisma.product as any).update({
            where: { id: params.id },
            data: { deletedAt: new Date() },
        });

        await cacheDelete(CACHE_KEYS.productsInvalidate);

        if (isAccelerateEnabled()) {
            const accel = (prisma as any).$accelerate;
            if (accel?.invalidate) {
                try {
                    await accel.invalidate({ tags: ['products'] });
                } catch {
                    // ignore cache invalidation errors
                }
            }
        }

        return res.json({ success: true });
    } catch (err) {
        next(err);
    }
});
