import { prisma } from '../prisma';

export type AiModule =
    | 'RECOMMENDATIONS'
    | 'SELLER_ASSISTANT'
    | 'PRICE_SUGGESTION'
    | 'MATCH_BUYERS'
    | 'VISION_CLASSIFIER';

export type AiEventType =
    | 'REQUEST'
    | 'IMPRESSION'
    | 'CLICK'
    | 'APPLY'
    | 'VIEW'
    | 'CART_ADD'
    | 'INQUIRY_OPEN'
    | 'INQUIRY_ACCEPTED'
    | 'INQUIRY_REJECTED'
    | 'REVIEW_POSITIVE'
    | 'REVIEW_NEGATIVE';

export type TrackAiUsageInput = {
    module: AiModule;
    eventType: AiEventType;
    userId?: string | null;
    productId?: string | null;
    inquiryId?: string | null;
    sessionId?: string | null;
    category?: string | null;
    location?: string | null;
    metadata?: Record<string, unknown> | null;
};

function sanitizeText(value: unknown, maxLen: number): string | undefined {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized) return undefined;
    return normalized.slice(0, maxLen);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function safeRatio(numerator: number, denominator: number): number {
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
    return numerator / denominator;
}

function round3(value: number): number {
    return Number(value.toFixed(3));
}

function serializeMetadata(metadata: Record<string, unknown> | null | undefined): string | undefined {
    if (!metadata) return undefined;
    try {
        const serialized = JSON.stringify(metadata);
        if (!serialized || serialized === '{}') return undefined;
        return serialized.slice(0, 3000);
    } catch {
        return undefined;
    }
}

export async function trackAiUsageEvent(input: TrackAiUsageInput): Promise<void> {
    const userId = sanitizeText(input.userId, 80);
    const productId = sanitizeText(input.productId, 80);
    const inquiryId = sanitizeText(input.inquiryId, 80);

    try {
        await (prisma as any).aiUsageEvent.create({
            data: {
                module: input.module,
                eventType: input.eventType,
                userId: userId ?? null,
                productId: productId ?? null,
                inquiryId: inquiryId ?? null,
                sessionId: sanitizeText(input.sessionId, 120) ?? null,
                category: sanitizeText(input.category, 80) ?? null,
                location: sanitizeText(input.location, 180) ?? null,
                metadataJson: serializeMetadata(input.metadata) ?? null,
            },
        });
    } catch {
        // no-op: learning signals must not break main product flows
    }
}

type RecommendationAdaptiveWeights = {
    behaviorSignals: {
        view: number;
        inquiry: number;
        review: number;
        cart: number;
        accepted: number;
    };
    productScoring: {
        categoryAffinityScale: number;
        locationMatch: number;
        qualityScale: number;
        freshnessScale: number;
    };
    discussionScoring: {
        tagAffinityScale: number;
        likeWeight: number;
        commentWeight: number;
        freshnessScale: number;
    };
    eventScoring: {
        locationAffinity: number;
        popularityWeight: number;
        timingScale: number;
    };
    learningSnapshot: {
        impressions: number;
        clicks: number;
        carts: number;
        openedInquiries: number;
        acceptedInquiries: number;
        globalAcceptanceRate: number;
    };
};

const DEFAULT_RECOMMENDATION_WEIGHTS: RecommendationAdaptiveWeights = {
    behaviorSignals: {
        view: 1.1,
        inquiry: 2.2,
        review: 1.6,
        cart: 2.8,
        accepted: 4.5,
    },
    productScoring: {
        categoryAffinityScale: 3,
        locationMatch: 1.4,
        qualityScale: 0.6,
        freshnessScale: 1,
    },
    discussionScoring: {
        tagAffinityScale: 2.5,
        likeWeight: 0.05,
        commentWeight: 0.08,
        freshnessScale: 1,
    },
    eventScoring: {
        locationAffinity: 2.2,
        popularityWeight: 0.06,
        timingScale: 1,
    },
    learningSnapshot: {
        impressions: 0,
        clicks: 0,
        carts: 0,
        openedInquiries: 0,
        acceptedInquiries: 0,
        globalAcceptanceRate: 0,
    },
};

let recommendationCache: { expiresAt: number; value: RecommendationAdaptiveWeights } | null = null;

export async function getAdaptiveRecommendationWeights(): Promise<RecommendationAdaptiveWeights> {
    const nowMs = Date.now();
    if (recommendationCache && recommendationCache.expiresAt > nowMs) {
        return recommendationCache.value;
    }

    try {
        const fortyFiveDaysAgo = new Date(nowMs - 45 * 24 * 60 * 60 * 1000);
        const ninetyDaysAgo = new Date(nowMs - 90 * 24 * 60 * 60 * 1000);

        const [eventCounts, totalInquiries, acceptedInquiries] = await Promise.all([
            (prisma as any).aiUsageEvent.groupBy({
                by: ['eventType'],
                where: {
                    module: 'RECOMMENDATIONS',
                    createdAt: { gte: fortyFiveDaysAgo },
                    eventType: {
                        in: ['IMPRESSION', 'CLICK', 'CART_ADD', 'INQUIRY_OPEN', 'INQUIRY_ACCEPTED'],
                    },
                },
                _count: { _all: true },
            }),
            (prisma as any).productInquiry.count({
                where: { createdAt: { gte: ninetyDaysAgo } },
            }),
            (prisma as any).productInquiry.count({
                where: { createdAt: { gte: ninetyDaysAgo }, status: 'ACCEPTED' },
            }),
        ]);

        const countByType = new Map<string, number>(
            (eventCounts as any[]).map((row: any) => [String(row.eventType), Number(row._count?._all ?? 0)]),
        );

        const impressions = countByType.get('IMPRESSION') ?? 0;
        const clicks = countByType.get('CLICK') ?? 0;
        const carts = countByType.get('CART_ADD') ?? 0;
        const openedInquiries = countByType.get('INQUIRY_OPEN') ?? 0;
        const acceptedFromEvents = countByType.get('INQUIRY_ACCEPTED') ?? 0;
        const acceptedTotal = Math.max(acceptedFromEvents, acceptedInquiries);

        const ctr = safeRatio(clicks, Math.max(1, impressions));
        const cartRate = safeRatio(carts, Math.max(1, clicks));
        const inquiryRate = safeRatio(openedInquiries, Math.max(1, clicks));
        const eventCloseRate = safeRatio(acceptedFromEvents, Math.max(1, openedInquiries));
        const globalAcceptanceRate = safeRatio(acceptedInquiries, Math.max(1, totalInquiries));
        const closeRate = Math.max(eventCloseRate, globalAcceptanceRate);

        const engagementFactor = clamp(0.92 + ctr * 2.6 + cartRate * 0.7, 0.85, 1.9);
        const conversionFactor = clamp(0.95 + inquiryRate * 1.8 + closeRate * 1.4, 0.9, 2.4);
        const trustFactor = clamp(0.9 + closeRate * 1.7 + globalAcceptanceRate * 0.8, 0.85, 2.2);

        const weighted: RecommendationAdaptiveWeights = {
            behaviorSignals: {
                view: round3(DEFAULT_RECOMMENDATION_WEIGHTS.behaviorSignals.view * engagementFactor),
                inquiry: round3(DEFAULT_RECOMMENDATION_WEIGHTS.behaviorSignals.inquiry * conversionFactor),
                review: round3(DEFAULT_RECOMMENDATION_WEIGHTS.behaviorSignals.review * trustFactor),
                cart: round3(DEFAULT_RECOMMENDATION_WEIGHTS.behaviorSignals.cart * (engagementFactor * 0.35 + conversionFactor * 0.75)),
                accepted: round3(DEFAULT_RECOMMENDATION_WEIGHTS.behaviorSignals.accepted * trustFactor),
            },
            productScoring: {
                categoryAffinityScale: round3(DEFAULT_RECOMMENDATION_WEIGHTS.productScoring.categoryAffinityScale * (0.7 + conversionFactor * 0.35)),
                locationMatch: round3(DEFAULT_RECOMMENDATION_WEIGHTS.productScoring.locationMatch * (0.85 + engagementFactor * 0.25)),
                qualityScale: round3(DEFAULT_RECOMMENDATION_WEIGHTS.productScoring.qualityScale * (0.85 + trustFactor * 0.25)),
                freshnessScale: round3(DEFAULT_RECOMMENDATION_WEIGHTS.productScoring.freshnessScale * (0.85 + engagementFactor * 0.25)),
            },
            discussionScoring: {
                tagAffinityScale: round3(DEFAULT_RECOMMENDATION_WEIGHTS.discussionScoring.tagAffinityScale * (0.85 + engagementFactor * 0.2)),
                likeWeight: round3(DEFAULT_RECOMMENDATION_WEIGHTS.discussionScoring.likeWeight * (0.9 + ctr * 2.2)),
                commentWeight: round3(DEFAULT_RECOMMENDATION_WEIGHTS.discussionScoring.commentWeight * (0.9 + inquiryRate * 1.8)),
                freshnessScale: round3(DEFAULT_RECOMMENDATION_WEIGHTS.discussionScoring.freshnessScale * (0.9 + engagementFactor * 0.2)),
            },
            eventScoring: {
                locationAffinity: round3(DEFAULT_RECOMMENDATION_WEIGHTS.eventScoring.locationAffinity * (0.85 + engagementFactor * 0.22)),
                popularityWeight: round3(DEFAULT_RECOMMENDATION_WEIGHTS.eventScoring.popularityWeight * (0.9 + ctr * 2)),
                timingScale: round3(DEFAULT_RECOMMENDATION_WEIGHTS.eventScoring.timingScale * (0.9 + engagementFactor * 0.22)),
            },
            learningSnapshot: {
                impressions,
                clicks,
                carts,
                openedInquiries,
                acceptedInquiries: acceptedTotal,
                globalAcceptanceRate: round3(globalAcceptanceRate),
            },
        };

        recommendationCache = {
            expiresAt: nowMs + 60_000,
            value: weighted,
        };

        return weighted;
    } catch {
        recommendationCache = {
            expiresAt: nowMs + 30_000,
            value: DEFAULT_RECOMMENDATION_WEIGHTS,
        };
        return DEFAULT_RECOMMENDATION_WEIGHTS;
    }
}
