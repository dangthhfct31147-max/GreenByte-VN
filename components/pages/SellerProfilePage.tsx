import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BadgeCheck, MapPin, Star, Eye, MessageSquare, Handshake, TrendingUp, ShoppingBag } from 'lucide-react';
import { apiFetch } from '@/utils/api';

type SellerOverview = {
    rank: number | null;
    totalListings: number;
    totalReviews: number;
    averageRating: number;
    totalViews: number;
    totalInquiries: number;
    totalAcceptedDeals: number;
    interactionRatePct: number;
    conversionRatePct: number;
};

type SellerListing = {
    id: string;
    title: string;
    image: string;
    location: string;
    unit: string;
    category: string;
    price: number;
    quality_score: number;
    co2_savings_kg: number;
    posted_at: string;
};

type SellerProfileResponse = {
    seller: {
        id: string;
        name: string;
        verified: boolean;
        joined_at: string;
    };
    overview: SellerOverview;
    listings: SellerListing[];
};

interface SellerProfilePageProps {
    sellerId: string;
    onBack: () => void;
    onViewProduct: (productId: string) => void;
}

const DEFAULT_IMAGE = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22600%22 height=%22400%22 viewBox=%220 0 600 400%22%3E%3Crect width=%22600%22 height=%22400%22 fill=%22%23e2e8f0%22/%3E%3Ccircle cx=%22300%22 cy=%22155%22 r=%2240%22 fill=%22%2394a3b8%22/%3E%3Cpath d=%22M190 280c28-54 73-82 110-82s82 28 110 82z%22 fill=%22%2394a3b8%22/%3E%3Ctext x=%22300%22 y=%22345%22 text-anchor=%22middle%22 font-family=%22Arial,sans-serif%22 font-size=%2220%22 fill=%2264748b%22%3ETin dang%3C/text%3E%3C/svg%3E';

export const SellerProfilePage: React.FC<SellerProfilePageProps> = ({ sellerId, onBack, onViewProduct }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<SellerProfileResponse | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(null);

        (async () => {
            try {
                const res = await apiFetch(`products/sellers/${sellerId}/profile`, { signal: controller.signal });
                const body = (await res.json()) as any;
                if (!res.ok) {
                    throw new Error(body?.error ?? 'Không tải được hồ sơ seller');
                }
                setData(body as SellerProfileResponse);
            } catch (e: any) {
                if (e?.name !== 'AbortError') {
                    setError(e?.message ?? 'Có lỗi xảy ra');
                }
            } finally {
                setLoading(false);
            }
        })();

        return () => controller.abort();
    }, [sellerId]);

    const formatCurrency = (value: number) =>
        new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);

    const joinedAtText = useMemo(() => {
        if (!data?.seller?.joined_at) return '—';
        const date = new Date(data.seller.joined_at);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }, [data?.seller?.joined_at]);

    return (
        <div className="min-h-[calc(100vh-64px)] py-8 px-4">
            <div className="container mx-auto max-w-6xl space-y-6">
                <div className="flex items-center justify-between gap-4">
                    <button
                        onClick={onBack}
                        className="inline-flex items-center gap-2 text-slate-600 hover:text-emerald-600 transition-colors"
                    >
                        <ArrowLeft size={18} />
                        <span className="text-sm font-medium">Quay lại</span>
                    </button>
                </div>

                {loading && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">Đang tải hồ sơ seller...</div>
                )}

                {!loading && error && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-red-700">{error}</div>
                )}

                {!loading && !error && data && (
                    <>
                        <section className="rounded-3xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center text-xl font-bold">
                                        {data.seller.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h1 className="text-2xl font-bold text-slate-900">{data.seller.name}</h1>
                                            {data.seller.verified && <BadgeCheck size={20} className="text-emerald-600" />}
                                        </div>
                                        <p className="text-sm text-slate-500 mt-1">Tham gia từ: {joinedAtText}</p>
                                    </div>
                                </div>

                                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                                    <div className="text-xs text-slate-500">Hạng seller</div>
                                    <div className="text-xl font-bold text-slate-900">{data.overview.rank ? `#${data.overview.rank}` : '—'}</div>
                                </div>
                            </div>
                        </section>

                        <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                            <div className="rounded-xl bg-white border border-slate-200 p-3">
                                <div className="text-xs text-slate-500 flex items-center gap-1"><ShoppingBag size={14} />Tin đăng</div>
                                <div className="text-lg font-bold text-slate-900 mt-1">{data.overview.totalListings}</div>
                            </div>
                            <div className="rounded-xl bg-white border border-slate-200 p-3">
                                <div className="text-xs text-slate-500 flex items-center gap-1"><Star size={14} />Điểm TB</div>
                                <div className="text-lg font-bold text-slate-900 mt-1">{data.overview.averageRating.toFixed(2)}</div>
                            </div>
                            <div className="rounded-xl bg-white border border-slate-200 p-3">
                                <div className="text-xs text-slate-500">Đánh giá</div>
                                <div className="text-lg font-bold text-slate-900 mt-1">{data.overview.totalReviews}</div>
                            </div>
                            <div className="rounded-xl bg-white border border-slate-200 p-3">
                                <div className="text-xs text-slate-500 flex items-center gap-1"><Eye size={14} />Lượt xem</div>
                                <div className="text-lg font-bold text-slate-900 mt-1">{data.overview.totalViews}</div>
                            </div>
                            <div className="rounded-xl bg-white border border-slate-200 p-3">
                                <div className="text-xs text-slate-500 flex items-center gap-1"><MessageSquare size={14} />Quan tâm</div>
                                <div className="text-lg font-bold text-slate-900 mt-1">{data.overview.totalInquiries}</div>
                            </div>
                            <div className="rounded-xl bg-white border border-slate-200 p-3">
                                <div className="text-xs text-slate-500 flex items-center gap-1"><Handshake size={14} />Deal</div>
                                <div className="text-lg font-bold text-slate-900 mt-1">{data.overview.totalAcceptedDeals}</div>
                            </div>
                            <div className="rounded-xl bg-white border border-slate-200 p-3">
                                <div className="text-xs text-slate-500">Tỷ lệ tương tác</div>
                                <div className="text-lg font-bold text-slate-900 mt-1">{data.overview.interactionRatePct}%</div>
                            </div>
                            <div className="rounded-xl bg-white border border-slate-200 p-3">
                                <div className="text-xs text-slate-500 flex items-center gap-1"><TrendingUp size={14} />Chốt deal</div>
                                <div className="text-lg font-bold text-slate-900 mt-1">{data.overview.conversionRatePct}%</div>
                            </div>
                        </section>

                        <section className="rounded-3xl border border-slate-200 bg-white p-6">
                            <h2 className="text-lg font-semibold text-slate-900 mb-4">Tin đăng của seller</h2>
                            {data.listings.length === 0 ? (
                                <div className="text-sm text-slate-500">Seller chưa có tin đăng nào.</div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {data.listings.map((item) => (
                                        <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
                                            <img
                                                src={item.image || DEFAULT_IMAGE}
                                                alt={item.title}
                                                className="w-full h-40 object-cover"
                                                onError={(event) => {
                                                    const image = event.currentTarget;
                                                    image.onerror = null;
                                                    image.src = DEFAULT_IMAGE;
                                                }}
                                            />
                                            <div className="p-4 space-y-2">
                                                <div className="text-sm font-semibold text-slate-900 line-clamp-2 min-h-[2.5rem]">{item.title}</div>
                                                <div className="text-xs text-slate-500 flex items-center gap-1"><MapPin size={13} />{item.location}</div>
                                                <div className="text-sm text-slate-500">Danh mục: {item.category}</div>
                                                <div className="text-emerald-600 font-bold">{formatCurrency(item.price)} / {item.unit}</div>
                                                <button
                                                    type="button"
                                                    onClick={() => onViewProduct(item.id)}
                                                    className="w-full mt-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-emerald-600 transition-colors"
                                                >
                                                    Xem chi tiết
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    </>
                )}
            </div>
        </div>
    );
};
