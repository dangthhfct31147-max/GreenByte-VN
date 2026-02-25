import { z } from 'zod';
import { prisma } from '../prisma';

// ── Schema ──────────────────────────────────────────────────────────

const PriceSuggestionResultSchema = z.object({
    min_price: z.number().int().min(0),
    max_price: z.number().int().min(0),
    median_price: z.number().int().min(0),
    suggested_range: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
    factors: z.array(z.string().min(1).max(200)).max(10),
    sample_count: z.number().int().min(0),
    confidence: z.enum(['high', 'medium', 'low']),
});

export type PriceSuggestionResult = z.infer<typeof PriceSuggestionResultSchema>;

export type PriceSuggestionInput = {
    category: string;
    location?: string;
    quality_score?: number;
    unit?: string;
};

export type PriceSuggestionOutput = {
    suggestion: PriceSuggestionResult;
    provider: 'heuristic' | 'openai-compatible';
    model: string;
};

// ── Helpers ─────────────────────────────────────────────────────────

function median(sorted: number[]): number {
    if (sorted.length === 0) return 0;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? sorted[mid]
        : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    return Math.round(sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower));
}

/**
 * Hệ số mùa vụ theo tháng. Tháng thu hoạch chính (10-12, 1-2) giá thấp hơn,
 * tháng trái mùa (5-8) giá cao hơn. Áp dụng chung cho phụ phẩm nông nghiệp VN.
 */
function getSeasonFactor(month: number): { factor: number; label: string } {
    // month: 0-11 (JS Date.getMonth())
    const seasonMap: Record<number, { factor: number; label: string }> = {
        0: { factor: 0.95, label: 'Sau vụ Đông-Xuân, nguồn cung dồi dào → giá giảm nhẹ' },
        1: { factor: 0.93, label: 'Đầu năm, nguồn cung cao từ vụ mùa trước → giá thấp' },
        2: { factor: 0.97, label: 'Chuyển mùa, nguồn cung ổn định' },
        3: { factor: 1.00, label: 'Tháng trung tính, giá tham chiếu chuẩn' },
        4: { factor: 1.03, label: 'Bắt đầu mùa khô, nhu cầu thức ăn gia súc tăng' },
        5: { factor: 1.07, label: 'Giữa mùa khô, nguồn cung giảm → giá nhích lên' },
        6: { factor: 1.10, label: 'Đỉnh trái mùa, nguồn cung thấp → giá cao nhất' },
        7: { factor: 1.08, label: 'Cuối mùa khô, nhu cầu vẫn cao' },
        8: { factor: 1.02, label: 'Bắt đầu vụ Thu, nguồn cung tăng dần' },
        9: { factor: 0.98, label: 'Thu hoạch vụ Mùa, nguồn cung tăng mạnh' },
        10: { factor: 0.92, label: 'Đỉnh thu hoạch vụ Mùa → giá thấp nhất' },
        11: { factor: 0.94, label: 'Cuối vụ thu hoạch, nguồn cung vẫn cao' },
    };
    return seasonMap[month] ?? { factor: 1.0, label: 'Không xác định mùa vụ' };
}

/**
 * Hệ số chất lượng: sản phẩm chất lượng cao hơn trung bình được điều chỉnh giá lên,
 * chất lượng thấp hơn trung bình điều chỉnh giá xuống.
 */
function getQualityFactor(score: number, avgScore: number): { factor: number; label: string } {
    const diff = score - avgScore;
    if (diff >= 1.5) return { factor: 1.15, label: `Chất lượng ${score}/5 cao hơn trung bình (${avgScore.toFixed(1)}) → giá tăng ~15%` };
    if (diff >= 0.5) return { factor: 1.08, label: `Chất lượng ${score}/5 khá hơn trung bình (${avgScore.toFixed(1)}) → giá tăng ~8%` };
    if (diff <= -1.5) return { factor: 0.85, label: `Chất lượng ${score}/5 thấp hơn trung bình (${avgScore.toFixed(1)}) → giá giảm ~15%` };
    if (diff <= -0.5) return { factor: 0.92, label: `Chất lượng ${score}/5 dưới trung bình (${avgScore.toFixed(1)}) → giá giảm ~8%` };
    return { factor: 1.0, label: `Chất lượng ${score}/5 ngang mức trung bình` };
}

function extractProvince(location: string): string {
    const parts = location.split(',').map((p) => p.trim().toLowerCase());
    return parts[parts.length - 1] || location.trim().toLowerCase();
}

type PriceSample = {
    id: string;
    priceVnd: number;
    qualityScore: number;
    location: string;
    createdAt: Date;
};

function removeOutlierSamples(samples: PriceSample[]): PriceSample[] {
    if (samples.length < 8) return samples;

    const prices = samples.map((item) => item.priceVnd).sort((a, b) => a - b);
    const q1 = percentile(prices, 25);
    const q3 = percentile(prices, 75);
    const iqr = Math.max(1, q3 - q1);
    const lower = Math.max(0, Math.round(q1 - 1.5 * iqr));
    const upper = Math.round(q3 + 1.5 * iqr);

    const filtered = samples.filter((item) => item.priceVnd >= lower && item.priceVnd <= upper);
    if (filtered.length < Math.max(4, Math.floor(samples.length * 0.6))) return samples;
    return filtered;
}

// ── Heuristic Engine ────────────────────────────────────────────────

async function buildHeuristicSuggestion(input: PriceSuggestionInput): Promise<PriceSuggestionOutput> {
    const factors: string[] = [];
    const qualityScore = input.quality_score ?? 3;

    // 1. Lấy tất cả sản phẩm cùng category
    const allProducts: PriceSample[] =
        await (prisma.product as any).findMany({
            where: {
                category: input.category,
                deletedAt: null,
            },
            select: {
                id: true,
                priceVnd: true,
                qualityScore: true,
                location: true,
                createdAt: true,
            },
            orderBy: { priceVnd: 'asc' },
            take: 500,
        });

    if (allProducts.length === 0) {
        return {
            suggestion: {
                min_price: 0,
                max_price: 0,
                median_price: 0,
                suggested_range: [0, 0],
                factors: [`Chưa có sản phẩm "${input.category}" nào trên hệ thống để tham chiếu giá.`],
                sample_count: 0,
                confidence: 'low',
            },
            provider: 'heuristic',
            model: 'price-suggestion-v1',
        };
    }

    // 2. Lọc theo location (cùng tỉnh)
    let locationFiltered = allProducts;
    if (input.location) {
        const targetProvince = extractProvince(input.location);
        const matched = allProducts.filter((p) => extractProvince(p.location) === targetProvince);
        if (matched.length >= 3) {
            locationFiltered = matched;
            factors.push(`Lọc theo khu vực "${input.location}": ${matched.length} sản phẩm cùng tỉnh.`);
        } else {
            factors.push(`Khu vực "${input.location}" có ít sản phẩm (${matched.length}), mở rộng ra toàn quốc (${allProducts.length} sản phẩm).`);
        }
    }

    // 3. Loại outlier để tránh biên giá bất thường
    const robustSamples = removeOutlierSamples(locationFiltered);
    if (robustSamples.length !== locationFiltered.length) {
        factors.push(`Đã loại ${locationFiltered.length - robustSamples.length} mẫu giá bất thường để tăng độ ổn định.`);
    }

    // 4. Tính thống kê cơ bản
    const prices = robustSamples.map((p) => p.priceVnd).sort((a, b) => a - b);
    const minPrice = prices[0];
    const maxPrice = prices[prices.length - 1];
    const medianPrice = median(prices);
    const p25 = percentile(prices, 25);
    const p75 = percentile(prices, 75);
    const mean = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);

    factors.push(`Dựa trên ${prices.length} sản phẩm "${input.category}" → giá trung vị: ${medianPrice.toLocaleString('vi-VN')}₫, trung bình: ${mean.toLocaleString('vi-VN')}₫.`);

    // 5. Mùa vụ
    const now = new Date();
    const season = getSeasonFactor(now.getMonth());
    factors.push(`Mùa vụ tháng ${now.getMonth() + 1}: ${season.label} (hệ số ×${season.factor.toFixed(2)}).`);

    // 6. Nhu cầu + tỷ lệ chốt đơn (45 ngày)
    const fortyFiveDaysAgo = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
    const productIds = robustSamples.map((p) => p.id);
    let demandFactor = 1.0;
    let closeDealFactor = 1.0;
    let demandLabel = 'Nhu cầu trung bình.';
    let closeDealLabel = 'Tỷ lệ chốt đơn ổn định.';

    if (productIds.length > 0) {
        const [viewCount, inquiryCount, acceptedCount] = await Promise.all([
            (prisma as any).productViewEvent.count({
                where: {
                    productId: { in: productIds },
                    viewedAt: { gte: fortyFiveDaysAgo },
                },
            }),
            (prisma as any).productInquiry.count({
                where: {
                    productId: { in: productIds },
                    createdAt: { gte: fortyFiveDaysAgo },
                },
            }),
            (prisma as any).productInquiry.count({
                where: {
                    productId: { in: productIds },
                    createdAt: { gte: fortyFiveDaysAgo },
                    status: 'ACCEPTED',
                },
            }),
        ]);

        const viewsPerProduct = viewCount / Math.max(1, productIds.length);
        const inquiriesPerProduct = inquiryCount / Math.max(1, productIds.length);
        const closeRate = inquiryCount > 0 ? acceptedCount / inquiryCount : 0;

        if (viewsPerProduct > 20 || inquiriesPerProduct > 3) {
            demandFactor = 1.08;
            demandLabel = `Nhu cầu cao (${viewCount} lượt xem, ${inquiryCount} đàm phán trong 45 ngày) → giá tăng ~8%.`;
        } else if (viewsPerProduct > 10 || inquiriesPerProduct > 1) {
            demandFactor = 1.03;
            demandLabel = `Nhu cầu khá (${viewCount} lượt xem, ${inquiryCount} đàm phán trong 45 ngày) → giá tăng ~3%.`;
        } else if (viewsPerProduct < 3 && inquiriesPerProduct < 0.5) {
            demandFactor = 0.95;
            demandLabel = `Nhu cầu thấp (${viewCount} lượt xem, ${inquiryCount} đàm phán trong 45 ngày) → giá giảm ~5%.`;
        }

        if (inquiryCount >= 5 && closeRate >= 0.45) {
            closeDealFactor = 1.06;
            closeDealLabel = `Tỷ lệ chốt đơn cao (${acceptedCount}/${inquiryCount}) → giá có thể tăng ~6%.`;
        } else if (inquiryCount >= 5 && closeRate <= 0.15) {
            closeDealFactor = 0.95;
            closeDealLabel = `Tỷ lệ chốt đơn thấp (${acceptedCount}/${inquiryCount}) → nên điều chỉnh giá mềm hơn ~5%.`;
        } else if (inquiryCount > 0) {
            closeDealLabel = `Tỷ lệ chốt đơn gần đây: ${(closeRate * 100).toFixed(1)}% (${acceptedCount}/${inquiryCount}).`;
        }
    }
    factors.push(demandLabel);
    factors.push(closeDealLabel);

    // 7. Chất lượng
    const avgQuality = robustSamples.reduce((s, p) => s + p.qualityScore, 0) / robustSamples.length;
    const qualityAdj = getQualityFactor(qualityScore, avgQuality);
    factors.push(qualityAdj.label);

    // 8. Tính khoảng giá đề xuất
    const combinedFactor = season.factor * demandFactor * qualityAdj.factor * closeDealFactor;
    const rawLow = Math.round(p25 * combinedFactor);
    const rawHigh = Math.round(p75 * combinedFactor);
    const suggestedLow = Math.max(0, Math.min(rawLow, rawHigh));
    const suggestedHigh = Math.max(rawLow, rawHigh);

    // 9. Confidence
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    if (prices.length >= 20) confidence = 'high';
    else if (prices.length < 5) confidence = 'low';

    return {
        suggestion: {
            min_price: minPrice,
            max_price: maxPrice,
            median_price: Math.round(medianPrice * combinedFactor),
            suggested_range: [suggestedLow, suggestedHigh],
            factors: factors.slice(0, 10),
            sample_count: prices.length,
            confidence,
        },
        provider: 'heuristic',
        model: 'price-suggestion-v2',
    };
}

// ── OpenAI-compatible Engine ────────────────────────────────────────

function parseJsonObject(content: string): unknown {
    try {
        return JSON.parse(content);
    } catch {
        const matched = content.match(/\{[\s\S]*\}/);
        if (!matched) throw new Error('Không parse được JSON từ phản hồi AI');
        return JSON.parse(matched[0]);
    }
}

async function callOpenAIForPrice(input: PriceSuggestionInput, heuristicResult: PriceSuggestionResult): Promise<PriceSuggestionOutput | null> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return null;

    const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const model = process.env.SELLER_ASSISTANT_MODEL?.trim() || process.env.OPENAI_TEXT_MODEL?.trim() || 'gpt-4.1-mini';

    const payload = {
        model,
        temperature: 0.15,
        max_tokens: 600,
        messages: [
            {
                role: 'system',
                content: 'Bạn là chuyên gia phân tích giá phụ phẩm nông nghiệp Việt Nam. Dựa trên dữ liệu thống kê và thông tin sản phẩm, đề xuất khoảng giá hợp lý. CHỈ trả về JSON hợp lệ theo schema: {min_price, max_price, median_price, suggested_range: [low, high], factors: string[], sample_count, confidence: "high"|"medium"|"low"}. Không thêm markdown.',
            },
            {
                role: 'user',
                content: JSON.stringify({
                    task: 'Phân tích giá tham chiếu cho phụ phẩm nông nghiệp',
                    product: {
                        category: input.category,
                        location: input.location,
                        quality_score: input.quality_score,
                        unit: input.unit,
                    },
                    market_stats: {
                        sample_count: heuristicResult.sample_count,
                        min_price: heuristicResult.min_price,
                        max_price: heuristicResult.max_price,
                        median_price: heuristicResult.median_price,
                        heuristic_range: heuristicResult.suggested_range,
                        heuristic_factors: heuristicResult.factors,
                    },
                    current_month: new Date().getMonth() + 1,
                }),
            },
        ],
    };

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const details = await response.text();
        throw new Error(`Price suggestion API thất bại (${response.status}): ${details.slice(0, 200)}`);
    }

    const data = (await response.json()) as any;
    const content = String(data?.choices?.[0]?.message?.content ?? '').trim();
    if (!content) throw new Error('Price suggestion API không trả về nội dung');

    const parsed = parseJsonObject(content);
    const suggestion = PriceSuggestionResultSchema.parse(parsed);

    return {
        suggestion,
        provider: 'openai-compatible',
        model,
    };
}

// ── Exported Entry Point ────────────────────────────────────────────

export async function generatePriceSuggestion(input: PriceSuggestionInput): Promise<PriceSuggestionOutput> {
    const heuristic = await buildHeuristicSuggestion(input);

    // Chỉ thử OpenAI nếu heuristic có data
    if (heuristic.suggestion.sample_count > 0) {
        try {
            const aiResult = await callOpenAIForPrice(input, heuristic.suggestion);
            if (aiResult) return aiResult;
        } catch {
            // fallback silently
        }
    }

    return heuristic;
}
