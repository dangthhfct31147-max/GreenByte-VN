import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { optionalAuth, type AuthenticatedRequest } from '../middleware/auth';

export const recommendationsRouter = Router();

type ProductRecommendation = {
    id: string;
    title: string;
    category: string;
    location: string;
    price: number;
    quality_score: number;
    image: string;
    reason: string;
};

type DiscussionRecommendation = {
    id: string;
    user_name: string;
    content: string;
    tags: string[];
    likes: number;
    comments: number;
    reason: string;
};

type EventRecommendation = {
    id: string;
    title: string;
    start_at: string;
    location: string;
    attendees: number;
    reason: string;
};

function parseTags(raw: unknown): string[] {
    if (Array.isArray(raw)) {
        return raw.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
    }
    if (typeof raw !== 'string') return [];

    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
    } catch {
        return [];
    }
}

function tokenizeText(raw: string): string[] {
    return raw
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3);
}

function recencyScore(createdAt: Date, halfLifeDays = 10): number {
    const ageMs = Date.now() - createdAt.getTime();
    const ageDays = Math.max(0, ageMs / (1000 * 60 * 60 * 24));
    const decay = Math.exp(-Math.log(2) * (ageDays / Math.max(1, halfLifeDays)));
    return Number((decay * 5).toFixed(3));
}

function topKeys(map: Map<string, number>, limit = 5): string[] {
    return [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([key]) => key);
}

const QuerySchema = z.object({
    takeProducts: z.coerce.number().int().min(1).max(20).optional(),
    takeDiscussions: z.coerce.number().int().min(1).max(20).optional(),
    takeEvents: z.coerce.number().int().min(1).max(20).optional(),
});

recommendationsRouter.get('/recommendations', optionalAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const query = QuerySchema.parse(req.query);
        const takeProducts = query.takeProducts ?? 6;
        const takeDiscussions = query.takeDiscussions ?? 4;
        const takeEvents = query.takeEvents ?? 4;

        const userId = req.user?.id;

        const categoryScores = new Map<string, number>();
        const tagScores = new Map<string, number>();
        const locationTokens = new Set<string>();

        if (userId) {
            const [views, inquiries, reviews, cartItems, likedPosts, commentedPosts, ownPosts, rsvps] = await Promise.all([
                (prisma as any).productViewEvent.findMany({
                    where: { viewerId: userId },
                    take: 150,
                    orderBy: { viewedAt: 'desc' },
                    select: { product: { select: { category: true, location: true } } },
                }),
                (prisma as any).productInquiry.findMany({
                    where: { buyerId: userId },
                    take: 120,
                    orderBy: { updatedAt: 'desc' },
                    select: { product: { select: { category: true, location: true } } },
                }),
                (prisma as any).productReview.findMany({
                    where: { reviewerId: userId },
                    take: 120,
                    orderBy: { createdAt: 'desc' },
                    select: { product: { select: { category: true, location: true } } },
                }),
                (prisma as any).cartItem.findMany({
                    where: { cart: { userId } },
                    take: 80,
                    orderBy: { updatedAt: 'desc' },
                    select: { product: { select: { category: true, location: true } } },
                }),
                (prisma as any).postLike.findMany({
                    where: { userId },
                    take: 150,
                    orderBy: { createdAt: 'desc' },
                    select: { post: { select: { tags: true } } },
                }),
                (prisma as any).postComment.findMany({
                    where: { authorId: userId },
                    take: 150,
                    orderBy: { updatedAt: 'desc' },
                    select: { post: { select: { tags: true } } },
                }),
                (prisma as any).post.findMany({
                    where: { authorId: userId, deletedAt: null },
                    take: 120,
                    orderBy: { updatedAt: 'desc' },
                    select: { tags: true },
                }),
                (prisma as any).eventRsvp.findMany({
                    where: { userId },
                    take: 60,
                    orderBy: { createdAt: 'desc' },
                    select: { event: { select: { location: true, title: true, description: true } } },
                }),
            ]);

            const addCategory = (category: string | null | undefined, weight: number) => {
                if (!category) return;
                categoryScores.set(category, (categoryScores.get(category) ?? 0) + weight);
            };

            const addLocation = (location: string | null | undefined) => {
                if (!location) return;
                for (const token of tokenizeText(location)) {
                    locationTokens.add(token);
                }
            };

            const addTags = (rawTags: unknown, weight: number) => {
                const tags = parseTags(rawTags);
                for (const tag of tags) {
                    tagScores.set(tag, (tagScores.get(tag) ?? 0) + weight);
                }
            };

            for (const row of views) {
                addCategory(row.product?.category, 1.1);
                addLocation(row.product?.location);
            }
            for (const row of inquiries) {
                addCategory(row.product?.category, 2.2);
                addLocation(row.product?.location);
            }
            for (const row of reviews) {
                addCategory(row.product?.category, 1.6);
                addLocation(row.product?.location);
            }
            for (const row of cartItems) {
                addCategory(row.product?.category, 2.8);
                addLocation(row.product?.location);
            }

            for (const row of likedPosts) addTags(row.post?.tags, 2.2);
            for (const row of commentedPosts) addTags(row.post?.tags, 1.8);
            for (const row of ownPosts) addTags(row.tags, 2.4);

            for (const row of rsvps) {
                addLocation(row.event?.location);
                for (const token of tokenizeText(`${row.event?.title ?? ''} ${row.event?.description ?? ''}`)) {
                    locationTokens.add(token);
                }
            }
        }

        const now = new Date();

        const [productRows, discussionRows, eventRows] = await Promise.all([
            (prisma as any).product.findMany({
                where: {
                    deletedAt: null,
                    ...(userId ? { sellerId: { not: userId } } : {}),
                },
                take: 120,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    title: true,
                    category: true,
                    location: true,
                    priceVnd: true,
                    qualityScore: true,
                    imageUrl: true,
                    createdAt: true,
                },
            }),
            (prisma as any).post.findMany({
                where: {
                    deletedAt: null,
                    moderationStatus: 'APPROVED',
                    ...(userId ? { authorId: { not: userId } } : {}),
                },
                take: 150,
                orderBy: [{ createdAt: 'desc' }, { likeCount: 'desc' }],
                include: {
                    author: { select: { name: true } },
                    _count: { select: { comments: true } },
                },
            }),
            (prisma as any).event.findMany({
                where: {
                    deletedAt: null,
                    moderationStatus: 'APPROVED',
                    startAt: { gte: now },
                },
                take: 100,
                orderBy: { startAt: 'asc' },
                include: {
                    _count: { select: { rsvps: true } },
                },
            }),
        ]);

        const productsScored = productRows
            .map((item: any) => {
                const categoryAffinity = categoryScores.get(item.category) ?? 0;
                const locationMatch = tokenizeText(item.location).some((token) => locationTokens.has(token)) ? 1.4 : 0;
                const qualitySignal = Number(item.qualityScore ?? 3) * 0.6;
                const freshness = recencyScore(item.createdAt, 9);

                const score = categoryAffinity * 3 + locationMatch + qualitySignal + freshness;

                let reason = 'Tin đăng mới phù hợp để tham khảo.';
                if (categoryAffinity > 0) {
                    reason = `Phù hợp thói quen trong danh mục ${item.category}.`;
                } else if (locationMatch > 0) {
                    reason = 'Gần khu vực bạn thường quan tâm.';
                } else if (Number(item.qualityScore ?? 0) >= 4) {
                    reason = 'Chất lượng tốt và đang được quan tâm.';
                }

                return {
                    score,
                    data: {
                        id: item.id,
                        title: item.title,
                        category: item.category,
                        location: item.location,
                        price: item.priceVnd,
                        quality_score: item.qualityScore,
                        image: item.imageUrl,
                        reason,
                    } as ProductRecommendation,
                };
            })
            .sort((a: any, b: any) => b.score - a.score)
            .slice(0, takeProducts)
            .map((item: any) => item.data as ProductRecommendation);

        const discussionsScored = discussionRows
            .map((item: any) => {
                const tags = parseTags(item.tags);
                const tagAffinity = tags.reduce((sum, tag) => sum + (tagScores.get(tag) ?? 0), 0);
                const popularity = Number(item.likeCount ?? 0) * 0.05 + Number(item._count?.comments ?? 0) * 0.08;
                const freshness = recencyScore(item.createdAt, 7);

                const score = tagAffinity * 2.5 + popularity + freshness;

                let reason = 'Thảo luận đang được quan tâm trong cộng đồng.';
                if (tagAffinity > 0 && tags.length) {
                    const matchTag = tags.find((tag) => (tagScores.get(tag) ?? 0) > 0) ?? tags[0];
                    reason = `Phù hợp chủ đề bạn từng tương tác: ${matchTag}.`;
                } else if (Number(item.likeCount ?? 0) + Number(item._count?.comments ?? 0) >= 8) {
                    reason = 'Bài viết có tương tác cao gần đây.';
                }

                return {
                    score,
                    data: {
                        id: item.id,
                        user_name: item.author?.name ?? 'Thành viên',
                        content: item.content,
                        tags,
                        likes: Number(item.likeCount ?? 0),
                        comments: Number(item._count?.comments ?? 0),
                        reason,
                    } as DiscussionRecommendation,
                };
            })
            .sort((a: any, b: any) => b.score - a.score)
            .slice(0, takeDiscussions)
            .map((item: any) => item.data as DiscussionRecommendation);

        const eventsScored = eventRows
            .map((item: any) => {
                const placeTokens = tokenizeText(`${item.location} ${item.title} ${item.description ?? ''}`);
                const locationAffinity = placeTokens.some((token) => locationTokens.has(token)) ? 2.2 : 0;
                const popularity = Number(item._count?.rsvps ?? 0) * 0.06;
                const daysUntil = Math.max(0, (new Date(item.startAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                const timing = Math.max(0, 3 - daysUntil / 10);

                const score = locationAffinity + popularity + timing;

                let reason = 'Sự kiện sắp diễn ra phù hợp để tham gia.';
                if (locationAffinity > 0) {
                    reason = 'Sự kiện gần khu vực/chủ đề bạn quan tâm.';
                } else if (Number(item._count?.rsvps ?? 0) >= 15) {
                    reason = 'Workshop có nhiều người đăng ký.';
                }

                return {
                    score,
                    data: {
                        id: item.id,
                        title: item.title,
                        start_at: new Date(item.startAt).toISOString(),
                        location: item.location,
                        attendees: Number(item._count?.rsvps ?? 0),
                        reason,
                    } as EventRecommendation,
                };
            })
            .sort((a: any, b: any) => b.score - a.score)
            .slice(0, takeEvents)
            .map((item: any) => item.data as EventRecommendation);

        let productsFinal = productsScored;
        let discussionsFinal = discussionsScored;
        let eventsFinal = eventsScored;

        const [fallbackProductsRows, fallbackDiscussionRows, fallbackEventRows] = await Promise.all([
            productsFinal.length === 0
                ? (prisma as any).product.findMany({
                    where: { deletedAt: null },
                    take: takeProducts,
                    orderBy: [{ qualityScore: 'desc' }, { createdAt: 'desc' }],
                    select: {
                        id: true,
                        title: true,
                        category: true,
                        location: true,
                        priceVnd: true,
                        qualityScore: true,
                        imageUrl: true,
                    },
                })
                : Promise.resolve([]),
            discussionsFinal.length === 0
                ? (prisma as any).post.findMany({
                    where: {
                        deletedAt: null,
                        moderationStatus: 'APPROVED',
                    },
                    take: takeDiscussions,
                    orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
                    include: {
                        author: { select: { name: true } },
                        _count: { select: { comments: true } },
                    },
                })
                : Promise.resolve([]),
            eventsFinal.length === 0
                ? (prisma as any).event.findMany({
                    where: {
                        deletedAt: null,
                        moderationStatus: 'APPROVED',
                    },
                    take: takeEvents,
                    orderBy: [{ startAt: 'asc' }, { createdAt: 'desc' }],
                    include: {
                        _count: { select: { rsvps: true } },
                    },
                })
                : Promise.resolve([]),
        ]);

        if (productsFinal.length === 0 && fallbackProductsRows.length > 0) {
            productsFinal = fallbackProductsRows.map((item: any) => ({
                id: item.id,
                title: item.title,
                category: item.category,
                location: item.location,
                price: item.priceVnd,
                quality_score: item.qualityScore,
                image: item.imageUrl,
                reason: 'Gợi ý phổ biến từ marketplace.',
            })) as ProductRecommendation[];
        }

        if (discussionsFinal.length === 0 && fallbackDiscussionRows.length > 0) {
            discussionsFinal = fallbackDiscussionRows.map((item: any) => ({
                id: item.id,
                user_name: item.author?.name ?? 'Thành viên',
                content: item.content,
                tags: parseTags(item.tags),
                likes: Number(item.likeCount ?? 0),
                comments: Number(item._count?.comments ?? 0),
                reason: 'Thảo luận phổ biến trong cộng đồng.',
            })) as DiscussionRecommendation[];
        }

        if (eventsFinal.length === 0 && fallbackEventRows.length > 0) {
            eventsFinal = fallbackEventRows.map((item: any) => ({
                id: item.id,
                title: item.title,
                start_at: new Date(item.startAt).toISOString(),
                location: item.location,
                attendees: Number(item._count?.rsvps ?? 0),
                reason: 'Sự kiện cộng đồng đang được quan tâm.',
            })) as EventRecommendation[];
        }

        const behaviorHints = userId
            ? [
                ...topKeys(categoryScores, 3).map((category) => `Danh mục: ${category}`),
                ...topKeys(tagScores, 3).map((tag) => `Chủ đề: ${tag}`),
            ]
            : [];
        const usedFallback =
            (productsScored.length === 0 && productsFinal.length > 0) ||
            (discussionsScored.length === 0 && discussionsFinal.length > 0) ||
            (eventsScored.length === 0 && eventsFinal.length > 0);

        const basedOn = [
            ...(behaviorHints.length > 0 ? behaviorHints : ['Xu hướng phổ biến toàn hệ thống']),
            ...(usedFallback ? ['Bổ sung từ nội dung phổ biến'] : []),
        ];

        return res.json({
            personalized: Boolean(userId),
            based_on: basedOn,
            products: productsFinal,
            discussions: discussionsFinal,
            events: eventsFinal,
        });
    } catch (err) {
        return next(err);
    }
});
