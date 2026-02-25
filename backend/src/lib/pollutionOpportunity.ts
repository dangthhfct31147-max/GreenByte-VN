import { prisma } from '../prisma';

type PollutionType = 'WASTE' | 'WATER' | 'AIR' | 'OTHER';

type TradeOpportunityProduct = {
    id: string;
    title: string;
    category: string;
    location: string;
    price: number;
    quality_score: number;
    image: string;
    distance_km: number | null;
    match_reason: string;
};

type TradeOpportunity = {
    hotspot_id: string;
    center: { lat: number; lng: number };
    radius_km: number;
    priority: 'critical' | 'high' | 'medium';
    anomaly_score: number;
    confidence: 'high' | 'medium' | 'low';
    drivers: string[];
    community: {
        report_count: number;
        avg_severity: number;
        latest_report_at: string;
        report_types: PollutionType[];
    };
    external_signal: {
        source: string;
        station_name?: string;
        distance_km?: number;
        risk_score: number;
        observed_at?: string;
        metrics: Record<string, number>;
    } | null;
    recommended_categories: string[];
    suggested_interventions: string[];
    tradable_products: TradeOpportunityProduct[];
};

export type PollutionTradeOpportunitiesResponse = {
    generated_at: string;
    source: {
        community_reports: number;
        external_stations: number;
        external_provider: string;
        external_status: 'used' | 'unavailable';
    };
    opportunities: TradeOpportunity[];
};

type GetPollutionTradeOpportunitiesInput = {
    take?: number;
    includeExternal?: boolean;
    productsPerOpportunity?: number;
};

type PollutionRow = {
    id: string;
    lat: number;
    lng: number;
    type: PollutionType;
    severity: number;
    createdAt: Date;
};

type ProductRow = {
    id: string;
    title: string;
    category: string;
    location: string;
    priceVnd: number;
    qualityScore: number;
    imageUrl: string;
    latitude: number | null;
    longitude: number | null;
};

type ExternalStation = {
    lat: number;
    lng: number;
    source: string;
    stationName?: string;
    observedAt?: string;
    metrics: Record<string, number>;
    riskScore: number;
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const earthRadius = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;

    return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toGridKey(lat: number, lng: number, gridSize = 0.18): string {
    const latKey = Math.round(lat / gridSize) * gridSize;
    const lngKey = Math.round(lng / gridSize) * gridSize;
    return `${latKey.toFixed(2)}:${lngKey.toFixed(2)}`;
}

function normalizeRiskFromMetrics(metrics: Record<string, number>): number {
    const aqi = metrics.aqi;
    const pm25 = metrics.pm25;
    const pm10 = metrics.pm10;

    let risk = 0;

    if (typeof aqi === 'number') {
        if (aqi >= 300) risk = Math.max(risk, 5);
        else if (aqi >= 200) risk = Math.max(risk, 4.2);
        else if (aqi >= 150) risk = Math.max(risk, 3.5);
        else if (aqi >= 100) risk = Math.max(risk, 2.6);
        else if (aqi >= 50) risk = Math.max(risk, 1.6);
        else risk = Math.max(risk, 1);
    }

    if (typeof pm25 === 'number') {
        if (pm25 >= 150) risk = Math.max(risk, 5);
        else if (pm25 >= 90) risk = Math.max(risk, 4.3);
        else if (pm25 >= 60) risk = Math.max(risk, 3.6);
        else if (pm25 >= 35) risk = Math.max(risk, 2.5);
        else if (pm25 >= 12) risk = Math.max(risk, 1.8);
        else risk = Math.max(risk, 1);
    }

    if (typeof pm10 === 'number') {
        if (pm10 >= 250) risk = Math.max(risk, 4.5);
        else if (pm10 >= 150) risk = Math.max(risk, 3.7);
        else if (pm10 >= 100) risk = Math.max(risk, 3.0);
        else if (pm10 >= 50) risk = Math.max(risk, 2.1);
        else risk = Math.max(risk, 1);
    }

    return Number(risk.toFixed(2));
}

function pickNumber(raw: unknown): number | undefined {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string' && raw.trim()) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
}

function parseExternalStations(payload: unknown, fallbackSource: string): ExternalStation[] {
    if (!payload || typeof payload !== 'object') return [];

    const dataCandidate = (payload as Record<string, unknown>).data;
    const items = Array.isArray(payload)
        ? payload
        : Array.isArray(dataCandidate)
            ? dataCandidate
            : Array.isArray((payload as Record<string, unknown>).stations)
                ? (payload as Record<string, unknown>).stations as unknown[]
                : [];

    const parsed: ExternalStation[] = [];

    for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;

        const lat = pickNumber(row.lat ?? row.latitude ?? row.y ?? row.station_lat);
        const lng = pickNumber(row.lng ?? row.longitude ?? row.lon ?? row.x ?? row.station_lng);

        if (typeof lat !== 'number' || typeof lng !== 'number') continue;

        const metrics: Record<string, number> = {};
        const aqi = pickNumber(row.aqi ?? row.AQI ?? row.air_quality_index);
        const pm25 = pickNumber(row.pm25 ?? row.pm2_5 ?? row.PM25);
        const pm10 = pickNumber(row.pm10 ?? row.PM10);

        if (typeof aqi === 'number') metrics.aqi = aqi;
        if (typeof pm25 === 'number') metrics.pm25 = pm25;
        if (typeof pm10 === 'number') metrics.pm10 = pm10;

        const riskScore = normalizeRiskFromMetrics(metrics);
        if (riskScore <= 0) continue;

        parsed.push({
            lat,
            lng,
            source: String(row.source ?? row.provider ?? fallbackSource),
            stationName: typeof row.station_name === 'string'
                ? row.station_name
                : typeof row.name === 'string'
                    ? row.name
                    : undefined,
            observedAt: typeof row.observed_at === 'string'
                ? row.observed_at
                : typeof row.timestamp === 'string'
                    ? row.timestamp
                    : undefined,
            metrics,
            riskScore,
        });
    }

    return parsed;
}

async function fetchExternalStations(includeExternal: boolean): Promise<{
    stations: ExternalStation[];
    status: 'used' | 'unavailable';
    provider: string;
}> {
    const provider = process.env.ENVIRONMENT_FEED_PROVIDER?.trim() || 'envisoft-compatible';
    const feedUrl = process.env.ENVIRONMENT_FEED_URL?.trim() || process.env.ENVISOFT_FEED_URL?.trim();

    if (!includeExternal || !feedUrl) {
        return { stations: [], status: 'unavailable', provider };
    }

    try {
        const timeoutMs = 4500;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(feedUrl, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                ...(process.env.ENVIRONMENT_FEED_API_KEY
                    ? { Authorization: `Bearer ${process.env.ENVIRONMENT_FEED_API_KEY.trim()}` }
                    : {}),
            },
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
            return { stations: [], status: 'unavailable', provider };
        }

        const payload = await response.json();
        const stations = parseExternalStations(payload, provider);

        return {
            stations,
            status: stations.length > 0 ? 'used' : 'unavailable',
            provider,
        };
    } catch {
        return { stations: [], status: 'unavailable', provider };
    }
}

function scoreConfidence(reportCount: number, hasExternal: boolean): 'high' | 'medium' | 'low' {
    if (reportCount >= 8 && hasExternal) return 'high';
    if (reportCount >= 4 || hasExternal) return 'medium';
    return 'low';
}

function scorePriority(anomalyScore: number): 'critical' | 'high' | 'medium' {
    if (anomalyScore >= 17) return 'critical';
    if (anomalyScore >= 12) return 'high';
    return 'medium';
}

function categoriesByType(type: PollutionType): string[] {
    if (type === 'AIR') return ['Rơm rạ', 'Vỏ trấu', 'Bã mía'];
    if (type === 'WATER') return ['Phân bón', 'Vỏ trấu', 'Bã mía'];
    if (type === 'WASTE') return ['Phân bón', 'Gỗ & Mùn cưa', 'Bã mía'];
    return ['Rơm rạ', 'Vỏ trấu', 'Phân bón', 'Bã mía'];
}

function interventionsByType(type: PollutionType): string[] {
    if (type === 'AIR') {
        return [
            'Ưu tiên gom phụ phẩm để giảm đốt ngoài trời trong 24-48h.',
            'Kết nối điểm thu mua gần nhất để chốt lịch lấy hàng nhanh.',
            'Tăng truyền thông tại điểm nóng về phương án bán thay vì đốt.',
        ];
    }
    if (type === 'WATER') {
        return [
            'Ưu tiên vật liệu hấp phụ/sinh học cho khu vực kênh rạch bị ảnh hưởng.',
            'Tổ chức điểm tập kết phụ phẩm có thể tái sử dụng để tránh xả thải trực tiếp.',
            'Kích hoạt lịch thu gom ngắn ngày cho vùng có phản ánh dày.',
        ];
    }
    if (type === 'WASTE') {
        return [
            'Mở chiến dịch thu gom tập trung cho khu dân cư phản ánh nhiều.',
            'Ưu tiên giao dịch phụ phẩm có thể ủ/đồng xử lý để giảm tồn lưu rác.',
            'Ghép đơn liên xã để tối ưu chi phí vận chuyển và xử lý nhanh.',
        ];
    }
    return [
        'Xác minh hiện trường trong 24h và ưu tiên nguồn lực theo mức nghiêm trọng.',
        'Kết nối người bán - đơn vị thu mua gần nhất để xử lý sớm.',
        'Theo dõi thêm phản ánh cộng đồng để cập nhật mức ưu tiên liên tục.',
    ];
}

function estimateRecencyBoost(reports: PollutionRow[]): number {
    if (reports.length === 0) return 0;
    const now = Date.now();

    const weighted = reports.reduce((sum, item) => {
        const ageHours = Math.max(0, (now - item.createdAt.getTime()) / (1000 * 60 * 60));
        const decay = Math.exp(-Math.log(2) * (ageHours / 48));
        return sum + decay;
    }, 0);

    return Number((weighted * 1.4).toFixed(2));
}

export async function getPollutionTradeOpportunities(
    input: GetPollutionTradeOpportunitiesInput = {},
): Promise<PollutionTradeOpportunitiesResponse> {
    const take = Math.min(Math.max(input.take ?? 6, 1), 20);
    const productsPerOpportunity = Math.min(Math.max(input.productsPerOpportunity ?? 5, 1), 10);
    const includeExternal = input.includeExternal ?? true;

    const now = new Date();
    const lookbackDays = 14;
    const since = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

    const [rows, products, external] = await Promise.all([
        (prisma as any).pollutionReport.findMany({
            where: {
                deletedAt: null,
                moderationStatus: 'APPROVED',
                createdAt: { gte: since },
            },
            orderBy: { createdAt: 'desc' },
            take: 2000,
            select: {
                id: true,
                lat: true,
                lng: true,
                type: true,
                severity: true,
                createdAt: true,
            },
        }) as Promise<PollutionRow[]>,
        (prisma as any).product.findMany({
            where: {
                deletedAt: null,
                latitude: { not: null },
                longitude: { not: null },
            },
            take: 600,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                title: true,
                category: true,
                location: true,
                priceVnd: true,
                qualityScore: true,
                imageUrl: true,
                latitude: true,
                longitude: true,
            },
        }) as Promise<ProductRow[]>,
        fetchExternalStations(includeExternal),
    ]);

    const grid = new Map<string, PollutionRow[]>();
    for (const row of rows) {
        const key = toGridKey(row.lat, row.lng);
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key)!.push(row);
    }

    const rawOpportunities = [...grid.entries()]
        .map(([gridKey, reports]) => {
            const reportCount = reports.length;
            const avgLat = reports.reduce((sum, item) => sum + item.lat, 0) / reportCount;
            const avgLng = reports.reduce((sum, item) => sum + item.lng, 0) / reportCount;
            const avgSeverity = reports.reduce((sum, item) => sum + item.severity, 0) / reportCount;
            const latest = reports.reduce((max, item) => (item.createdAt > max ? item.createdAt : max), reports[0].createdAt);

            const recent24h = reports.filter((item) => now.getTime() - item.createdAt.getTime() <= 24 * 60 * 60 * 1000).length;
            const prev72h = reports.filter((item) => {
                const ageMs = now.getTime() - item.createdAt.getTime();
                return ageMs > 24 * 60 * 60 * 1000 && ageMs <= 96 * 60 * 60 * 1000;
            }).length;

            const recencyBoost = estimateRecencyBoost(reports);
            const densityScore = Math.log2(1 + reportCount) * 3.2;
            const severityScore = avgSeverity * 1.9;

            let spikeScore = 0;
            if (recent24h >= 3 && recent24h > prev72h) {
                spikeScore = 2.6;
            } else if (recent24h >= 2 && recent24h >= prev72h) {
                spikeScore = 1.8;
            }

            const nearestStation = external.stations
                .map((station) => ({
                    station,
                    distance: haversineKm(avgLat, avgLng, station.lat, station.lng),
                }))
                .filter((row) => row.distance <= 45)
                .sort((a, b) => a.distance - b.distance)[0];

            const externalScore = nearestStation ? nearestStation.station.riskScore * 2.1 : 0;
            const anomalyScore = Number((densityScore + severityScore + recencyBoost + spikeScore + externalScore).toFixed(2));

            if (anomalyScore < 8.5) {
                return null;
            }

            const typeCounts = new Map<PollutionType, number>();
            for (const report of reports) {
                typeCounts.set(report.type, (typeCounts.get(report.type) ?? 0) + 1);
            }

            const dominantType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'OTHER';
            const categories = categoriesByType(dominantType);

            const nearbyProducts = products
                .map((product) => {
                    const lat = product.latitude;
                    const lng = product.longitude;
                    if (typeof lat !== 'number' || typeof lng !== 'number') return null;

                    const distance = haversineKm(avgLat, avgLng, lat, lng);
                    if (distance > 120) return null;

                    const quality = Number(product.qualityScore ?? 3);
                    const categoryMatch = categories.some((name) =>
                        product.category.toLowerCase().includes(name.toLowerCase()),
                    );

                    const score =
                        (categoryMatch ? 4.2 : 0.8) +
                        Math.max(0, 3 - distance / 35) +
                        quality * 0.45;

                    return {
                        score,
                        row: product,
                        distance,
                        categoryMatch,
                    };
                })
                .filter((item): item is NonNullable<typeof item> => Boolean(item))
                .sort((a, b) => b.score - a.score)
                .slice(0, productsPerOpportunity)
                .map((item): TradeOpportunityProduct => ({
                    id: item.row.id,
                    title: item.row.title,
                    category: item.row.category,
                    location: item.row.location,
                    price: item.row.priceVnd,
                    quality_score: item.row.qualityScore,
                    image: item.row.imageUrl,
                    distance_km: Number(item.distance.toFixed(1)),
                    match_reason: item.categoryMatch
                        ? 'Danh mục phù hợp can thiệp nhanh cho loại ô nhiễm chính của điểm nóng.'
                        : 'Nằm gần khu vực ưu tiên, có thể kích hoạt giao dịch xử lý sớm.',
                }));

            const drivers = [
                `Mật độ báo cáo cộng đồng: ${reportCount} điểm trong ${lookbackDays} ngày.`,
                `Mức nghiêm trọng trung bình: ${avgSeverity.toFixed(1)}/5.`,
                ...(spikeScore > 0 ? [`Có tín hiệu tăng đột biến trong 24h (${recent24h} báo cáo mới).`] : []),
                ...(nearestStation
                    ? [`Dữ liệu môi trường gần nhất (${nearestStation.distance.toFixed(1)}km) xác nhận rủi ro cao.`]
                    : []),
            ];

            const opportunity: TradeOpportunity = {
                hotspot_id: gridKey,
                center: {
                    lat: Number(avgLat.toFixed(6)),
                    lng: Number(avgLng.toFixed(6)),
                },
                radius_km: 18,
                priority: scorePriority(anomalyScore),
                anomaly_score: anomalyScore,
                confidence: scoreConfidence(reportCount, Boolean(nearestStation)),
                drivers,
                community: {
                    report_count: reportCount,
                    avg_severity: Number(avgSeverity.toFixed(2)),
                    latest_report_at: latest.toISOString(),
                    report_types: [...typeCounts.keys()],
                },
                external_signal: nearestStation
                    ? {
                        source: nearestStation.station.source,
                        station_name: nearestStation.station.stationName,
                        distance_km: Number(nearestStation.distance.toFixed(1)),
                        risk_score: nearestStation.station.riskScore,
                        observed_at: nearestStation.station.observedAt,
                        metrics: nearestStation.station.metrics,
                    }
                    : null,
                recommended_categories: categories,
                suggested_interventions: interventionsByType(dominantType),
                tradable_products: nearbyProducts,
            };

            return opportunity;
        });

    const opportunities: TradeOpportunity[] = rawOpportunities
        .filter((item): item is TradeOpportunity => item !== null)
        .sort((a, b) => b.anomaly_score - a.anomaly_score)
        .slice(0, take);

    return {
        generated_at: now.toISOString(),
        source: {
            community_reports: rows.length,
            external_stations: external.stations.length,
            external_provider: external.provider,
            external_status: external.status,
        },
        opportunities,
    };
}
