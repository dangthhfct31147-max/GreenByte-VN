import { prisma } from '../prisma';

// ── Types ───────────────────────────────────────────────────────────

export type MatchedBuyer = {
    buyer_id: string;
    buyer_name: string;
    affinity_score: number;
    signals: string[];
    location: string;
};

export type LogisticsCluster = {
    cluster_id: string;
    center_location: string;
    buyer_count: number;
    buyers: { buyer_id: string; buyer_name: string; location: string }[];
    estimated_savings_pct: number;
};

export type MatchBuyersResult = {
    matched_buyers: MatchedBuyer[];
    logistics_clusters: LogisticsCluster[];
    summary: {
        total_potential_buyers: number;
        total_clusters: number;
        avg_savings_pct: number;
    };
};

// ── Helpers ─────────────────────────────────────────────────────────

function extractProvince(location: string): string {
    const parts = location.split(',').map((p) => p.trim().toLowerCase());
    return parts[parts.length - 1] || location.trim().toLowerCase();
}

function extractDistrict(location: string): string {
    const parts = location.split(',').map((p) => p.trim().toLowerCase());
    return parts.length >= 2 ? parts[parts.length - 2] : parts[0] || '';
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Recommender Engine ──────────────────────────────────────────────

type BuyerProfile = {
    id: string;
    name: string;
    location: string;
    latitude?: number | null;
    longitude?: number | null;
    score: number;
    signals: string[];
};

async function findPotentialBuyers(
    productId: string,
    sellerId: string,
    category: string,
    productLocation: string,
    take: number,
): Promise<BuyerProfile[]> {
    const buyerMap = new Map<string, BuyerProfile>();

    const ensureBuyer = (id: string, name: string, loc?: string) => {
        if (id === sellerId) return null;
        if (!buyerMap.has(id)) {
            buyerMap.set(id, {
                id,
                name,
                location: loc ?? '',
                score: 0,
                signals: [],
            });
        }
        return buyerMap.get(id)!;
    };

    // 1. Inquiries on same category products (weight 3.0)
    const inquiries: any[] = await (prisma as any).productInquiry.findMany({
        where: {
            product: { category, deletedAt: null },
            buyerId: { not: sellerId },
        },
        take: 200,
        orderBy: { updatedAt: 'desc' },
        select: {
            buyerId: true,
            buyer: { select: { id: true, name: true } },
            product: { select: { location: true } },
        },
    });

    for (const row of inquiries) {
        const buyer = ensureBuyer(row.buyerId, row.buyer?.name ?? 'Người mua', row.product?.location);
        if (buyer) {
            buyer.score += 3.0;
            if (!buyer.signals.includes('Đã hỏi mua sản phẩm tương tự')) {
                buyer.signals.push('Đã hỏi mua sản phẩm tương tự');
            }
            if (row.product?.location) buyer.location = row.product.location;
        }
    }

    // 2. Cart items on same category (weight 2.5)
    const cartItems: any[] = await (prisma as any).cartItem.findMany({
        where: {
            product: { category, deletedAt: null },
            cart: { userId: { not: sellerId } },
        },
        take: 200,
        orderBy: { updatedAt: 'desc' },
        select: {
            cart: { select: { userId: true, user: { select: { id: true, name: true } } } },
            product: { select: { location: true } },
        },
    });

    for (const row of cartItems) {
        const userId = row.cart?.userId;
        const userName = row.cart?.user?.name ?? 'Người mua';
        if (!userId) continue;
        const buyer = ensureBuyer(userId, userName, row.product?.location);
        if (buyer) {
            buyer.score += 2.5;
            if (!buyer.signals.includes('Đã thêm vào giỏ hàng')) {
                buyer.signals.push('Đã thêm vào giỏ hàng');
            }
            if (row.product?.location) buyer.location = row.product.location;
        }
    }

    // 3. Reviews on same category (weight 1.8) – returning customers
    const reviews: any[] = await (prisma as any).productReview.findMany({
        where: {
            product: { category, deletedAt: null },
            reviewerId: { not: sellerId },
        },
        take: 200,
        orderBy: { createdAt: 'desc' },
        select: {
            reviewerId: true,
            reviewer: { select: { id: true, name: true } },
            product: { select: { location: true } },
        },
    });

    for (const row of reviews) {
        const buyer = ensureBuyer(row.reviewerId, row.reviewer?.name ?? 'Người mua', row.product?.location);
        if (buyer) {
            buyer.score += 1.8;
            if (!buyer.signals.includes('Khách hàng cũ (đã review)')) {
                buyer.signals.push('Khách hàng cũ (đã review)');
            }
            if (row.product?.location) buyer.location = row.product.location;
        }
    }

    // 4. Views on same category (weight 1.2)
    const views: any[] = await (prisma as any).productViewEvent.findMany({
        where: {
            product: { category, deletedAt: null },
            viewerId: { not: sellerId },
        },
        take: 300,
        orderBy: { viewedAt: 'desc' },
        select: {
            viewerId: true,
            viewer: { select: { id: true, name: true } },
            product: { select: { location: true } },
        },
    });

    for (const row of views) {
        if (!row.viewerId) continue;
        const buyer = ensureBuyer(row.viewerId, row.viewer?.name ?? 'Người mua', row.product?.location);
        if (buyer) {
            buyer.score += 1.2;
            if (!buyer.signals.includes('Đã xem sản phẩm tương tự')) {
                buyer.signals.push('Đã xem sản phẩm tương tự');
            }
            if (!buyer.location && row.product?.location) buyer.location = row.product.location;
        }
    }

    // 5. Location bonus: cùng tỉnh +2.0
    const productProvince = extractProvince(productLocation);
    for (const buyer of buyerMap.values()) {
        if (buyer.location && extractProvince(buyer.location) === productProvince) {
            buyer.score += 2.0;
            if (!buyer.signals.includes('Cùng khu vực')) {
                buyer.signals.push('Cùng khu vực');
            }
        }
    }

    // Sort and take top N
    return [...buyerMap.values()]
        .filter((b) => b.score > 0 && b.signals.length > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, take);
}

// ── Logistics Clustering ────────────────────────────────────────────

function clusterBuyersByLocation(buyers: BuyerProfile[]): LogisticsCluster[] {
    if (buyers.length === 0) return [];

    // Group by district+province (text-based)
    const locationGroups = new Map<string, BuyerProfile[]>();

    for (const buyer of buyers) {
        if (!buyer.location) continue;
        const province = extractProvince(buyer.location);
        const district = extractDistrict(buyer.location);
        const key = district ? `${district}, ${province}` : province;
        if (!locationGroups.has(key)) locationGroups.set(key, []);
        locationGroups.get(key)!.push(buyer);
    }

    const clusters: LogisticsCluster[] = [];
    let clusterIdx = 0;

    for (const [location, group] of locationGroups) {
        if (group.length < 1) continue;

        clusterIdx++;
        const n = group.length;
        // Ước tính tiết kiệm: gom N đơn → giảm ~(1 - 1/√N) × 100%
        const savingsPct = n >= 2 ? Math.round((1 - 1 / Math.sqrt(n)) * 100) : 0;

        clusters.push({
            cluster_id: `cluster-${clusterIdx}`,
            center_location: location.split(',').map((p) => p.trim()).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(', '),
            buyer_count: n,
            buyers: group.map((b) => ({
                buyer_id: b.id,
                buyer_name: b.name,
                location: b.location,
            })),
            estimated_savings_pct: savingsPct,
        });
    }

    return clusters
        .sort((a, b) => b.buyer_count - a.buyer_count || b.estimated_savings_pct - a.estimated_savings_pct);
}

// ── Exported Entry Point ────────────────────────────────────────────

export async function matchBuyersForProduct(
    productId: string,
    sellerId: string,
    category: string,
    location: string,
    take = 15,
): Promise<MatchBuyersResult> {
    const buyers = await findPotentialBuyers(productId, sellerId, category, location, take);

    const matchedBuyers: MatchedBuyer[] = buyers.map((b) => ({
        buyer_id: b.id,
        buyer_name: b.name,
        affinity_score: Math.round(b.score * 100) / 100,
        signals: b.signals,
        location: b.location,
    }));

    const clusters = clusterBuyersByLocation(buyers);

    const totalClusters = clusters.length;
    const avgSavings = totalClusters > 0
        ? Math.round(clusters.reduce((s, c) => s + c.estimated_savings_pct, 0) / totalClusters)
        : 0;

    return {
        matched_buyers: matchedBuyers,
        logistics_clusters: clusters,
        summary: {
            total_potential_buyers: matchedBuyers.length,
            total_clusters: totalClusters,
            avg_savings_pct: avgSavings,
        },
    };
}
