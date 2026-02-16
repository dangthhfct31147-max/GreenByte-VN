import React, { useEffect, useMemo, useState } from 'react';
import {
    ArrowLeft,
    MapPin,
    Leaf,
    ShoppingCart,
    MessageCircle,
    Share2,
    Star,
    CheckCircle2,
    Clock,
    User,
    Send,
    BadgeDollarSign,
    TrendingUp,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { apiFetch } from '@/utils/api';
import { AppSelect } from '../ui/AppSelect';

export interface Product {
    id: string;
    title: string;
    price: number;
    quality_score?: number;
    unit: string;
    category: string;
    location: string;
    latitude?: number | null;
    longitude?: number | null;
    image: string;
    seller_id?: string;
    seller_name: string;
    seller_verified?: boolean;
    seller_rating_avg?: number;
    seller_review_count?: number;
    co2_savings_kg: number;
    review_avg?: number;
    review_count?: number;
    description?: string;
    posted_at: string;
}

interface ReviewItem {
    id: string;
    reviewer: { id: string; name: string };
    rating: number;
    content: string;
    verified_interaction: boolean;
    created_at: string;
}

interface InquiryMessage {
    id: string;
    sender: { id: string; name: string };
    message: string;
    proposed_price_vnd?: number | null;
    created_at: string;
}

interface InquiryItem {
    id: string;
    product_id: string;
    buyer: { id: string; name: string };
    seller: { id: string; name: string };
    status: 'OPEN' | 'ACCEPTED' | 'REJECTED' | 'CLOSED';
    latest_offer_vnd?: number | null;
    last_message_at: string;
    messages: InquiryMessage[];
}

interface SellerRanking {
    rank: number;
    seller_id: string;
    seller_name: string;
    average_rating: number;
    total_reviews: number;
}

interface DashboardListing {
    product_id: string;
    title: string;
    views: number;
    inquiries: number;
    accepted_deals: number;
    avg_rating: number;
    conversion_rate_pct: number;
    interaction_rate_pct: number;
}

interface ProductDetailPageProps {
    productId: string;
    user: { id: string; name: string } | null;
    onBack: () => void;
    onAddToCart: (product: Product) => void;
    onLoginRequest: () => void;
}

const DEFAULT_PRODUCT_IMAGE = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221200%22 height=%22800%22 viewBox=%220 0 1200 800%22%3E%3Crect width=%221200%22 height=%22800%22 fill=%22%23e2e8f0%22/%3E%3Cg fill=%22%2394a3b8%22%3E%3Ccircle cx=%22600%22 cy=%22310%22 r=%2260%22/%3E%3Cpath d=%22M430 520c40-78 104-118 170-118s130 40 170 118z%22/%3E%3C/g%3E%3Ctext x=%22600%22 y=%22620%22 text-anchor=%22middle%22 font-family=%22Arial,sans-serif%22 font-size=%2236%22 fill=%2264748b%22%3EAnh san pham%3C/text%3E%3C/svg%3E';

export const ProductDetailPage: React.FC<ProductDetailPageProps> = ({
    productId,
    user,
    onBack,
    onAddToCart,
    onLoginRequest,
}) => {
    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [quantity, setQuantity] = useState(1);

    const [reviews, setReviews] = useState<ReviewItem[]>([]);
    const [reviewSummary, setReviewSummary] = useState({ average_rating: 0, total_reviews: 0 });
    const [reviewRating, setReviewRating] = useState('5');
    const [reviewContent, setReviewContent] = useState('');
    const [submittingReview, setSubmittingReview] = useState(false);

    const [ranking, setRanking] = useState<SellerRanking | null>(null);

    const [inquiries, setInquiries] = useState<InquiryItem[]>([]);
    const [chatText, setChatText] = useState('');
    const [offerText, setOfferText] = useState('');
    const [sendingChat, setSendingChat] = useState(false);

    const [dashboardListings, setDashboardListings] = useState<DashboardListing[]>([]);

    const selectedInquiry = inquiries[0] ?? null;
    const isSellerView = Boolean(user && product?.seller_id && user.id === product.seller_id);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
    };

    const formatDate = (dateLike: string) => {
        const date = new Date(dateLike);
        if (Number.isNaN(date.getTime())) return dateLike;
        return date.toLocaleDateString('vi-VN', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    const loadReviews = async (controller?: AbortController) => {
        const res = await apiFetch(`products/${productId}/reviews`, { signal: controller?.signal });
        if (!res.ok) return;
        const data = await res.json();
        setReviews(Array.isArray(data.reviews) ? data.reviews : []);
        setReviewSummary(data.summary ?? { average_rating: 0, total_reviews: 0 });
    };

    const loadInquiries = async (controller?: AbortController) => {
        if (!user) {
            setInquiries([]);
            return;
        }
        const res = await apiFetch(`products/${productId}/inquiries`, { signal: controller?.signal });
        if (!res.ok) {
            setInquiries([]);
            return;
        }
        const data = await res.json();
        setInquiries(Array.isArray(data.inquiries) ? data.inquiries : []);
    };

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(null);

        (async () => {
            try {
                const productRes = await apiFetch(`products/${productId}`, { signal: controller.signal });
                if (!productRes.ok) throw new Error('Không tìm thấy sản phẩm');
                const productData = (await productRes.json()) as { product: Product };
                setProduct(productData.product);

                await Promise.all([
                    loadReviews(controller),
                    loadInquiries(controller),
                    (async () => {
                        const r = await apiFetch('products/sellers/rankings?take=20', { signal: controller.signal });
                        if (!r.ok) return;
                        const data = (await r.json()) as { rankings: SellerRanking[] };
                        const found = data.rankings?.find((x) => x.seller_id === productData.product.seller_id) ?? null;
                        setRanking(found);
                    })(),
                ]);

                if (user && productData.product.seller_id === user.id) {
                    const dashboardRes = await apiFetch('products/seller/dashboard', { signal: controller.signal });
                    if (dashboardRes.ok) {
                        const dashboard = await dashboardRes.json();
                        setDashboardListings(Array.isArray(dashboard.listings) ? dashboard.listings : []);
                    }
                } else {
                    setDashboardListings([]);
                }
            } catch (err: any) {
                if (err?.name !== 'AbortError') {
                    setError(err?.message ?? 'Có lỗi xảy ra');
                }
            } finally {
                setLoading(false);
            }
        })();

        return () => controller.abort();
    }, [productId, user?.id]);

    const handleAddToCart = () => {
        if (!user) {
            onLoginRequest();
            return;
        }
        if (!product) return;
        for (let i = 0; i < quantity; i++) {
            onAddToCart(product);
        }
    };

    const handleShare = async () => {
        if (!product) return;
        const shareData = {
            title: product.title,
            text: `Xem sản phẩm ${product.title} trên Eco-ByproductVN`,
            url: window.location.href,
        };

        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else {
                await navigator.clipboard.writeText(shareData.url);
                alert('Đã sao chép link sản phẩm');
            }
        } catch {
            // ignore cancel
        }
    };

    const submitReview = async () => {
        if (!user) {
            onLoginRequest();
            return;
        }
        if (!product) return;
        setSubmittingReview(true);
        try {
            const res = await apiFetch(`products/${product.id}/reviews`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rating: Number(reviewRating),
                    content: reviewContent.trim(),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error ?? 'Không gửi được đánh giá');

            setReviewContent('');
            setReviewRating('5');
            await loadReviews();
        } catch (err: any) {
            alert(err?.message ?? 'Có lỗi xảy ra');
        } finally {
            setSubmittingReview(false);
        }
    };

    const sendNegotiationMessage = async () => {
        if (!user) {
            onLoginRequest();
            return;
        }
        if (!product) return;
        if (!chatText.trim()) return;

        setSendingChat(true);
        try {
            const payload = {
                message: chatText.trim(),
                proposed_price_vnd: offerText.trim() ? Number(offerText.trim()) : undefined,
            };

            const endpoint = selectedInquiry
                ? `products/inquiries/${selectedInquiry.id}/messages`
                : `products/${product.id}/inquiries`;

            const res = await apiFetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error ?? 'Không gửi được tin nhắn');

            setChatText('');
            setOfferText('');
            await loadInquiries();
        } catch (err: any) {
            alert(err?.message ?? 'Có lỗi xảy ra');
        } finally {
            setSendingChat(false);
        }
    };

    const updateInquiryStatus = async (status: 'ACCEPTED' | 'REJECTED' | 'CLOSED') => {
        if (!selectedInquiry) return;
        try {
            const res = await apiFetch(`products/inquiries/${selectedInquiry.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error ?? 'Không cập nhật được trạng thái');
            await loadInquiries();
        } catch (err: any) {
            alert(err?.message ?? 'Có lỗi xảy ra');
        }
    };

    const productDashboard = useMemo(
        () => dashboardListings.find((item) => item.product_id === product?.id) ?? null,
        [dashboardListings, product?.id],
    );

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-600">Đang tải thông tin sản phẩm...</p>
                </div>
            </div>
        );
    }

    if (error || !product) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-slate-900 mb-2">Không tìm thấy sản phẩm</h2>
                    <p className="text-slate-600 mb-6">{error || 'Sản phẩm có thể đã bị xóa hoặc không tồn tại.'}</p>
                    <button
                        onClick={onBack}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-full font-medium hover:bg-emerald-700 transition-colors"
                    >
                        <ArrowLeft size={18} />
                        Quay lại Marketplace
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 select-none">
            <div className="bg-white border-b border-slate-200">
                <div className="container mx-auto px-4 py-3">
                    <button
                        onClick={onBack}
                        className="inline-flex items-center gap-2 text-slate-600 hover:text-emerald-600 transition-colors"
                    >
                        <ArrowLeft size={18} />
                        <span className="text-sm font-medium">Quay lại Marketplace</span>
                    </button>
                </div>
            </div>

            <div className="container mx-auto px-4 py-8 space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
                        <div className="rounded-3xl overflow-hidden bg-slate-100 border border-slate-200">
                            <img
                                src={product.image}
                                alt={product.title}
                                className="w-full h-full object-cover aspect-square"
                                onError={(event) => {
                                    const img = event.currentTarget;
                                    img.onerror = null;
                                    img.src = DEFAULT_PRODUCT_IMAGE;
                                }}
                            />
                        </div>
                    </motion.div>

                    <div className="space-y-6">
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900 mb-2">{product.title}</h1>
                            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
                                <span className="flex items-center gap-1"><MapPin size={14} />{product.location}</span>
                                <span className="flex items-center gap-1"><Clock size={14} />{formatDate(product.posted_at)}</span>
                                <span className="text-slate-600">Chất lượng: {product.quality_score ?? 3}/5</span>
                            </div>
                        </div>

                        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl p-6 border border-emerald-100">
                            <div className="flex items-baseline gap-2">
                                <span className="text-4xl font-bold text-emerald-600">{formatCurrency(product.price)}</span>
                                <span className="text-lg text-slate-500">/{product.unit}</span>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xl font-bold">
                                        {product.seller_name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-slate-900">{product.seller_name}</span>
                                            {product.seller_verified && <CheckCircle2 size={16} className="text-emerald-500" />}
                                        </div>
                                        <div className="flex items-center gap-1 text-sm text-amber-500">
                                            <Star size={14} fill="currentColor" />
                                            <span className="font-medium">{(product.seller_rating_avg ?? 0).toFixed(1)}</span>
                                            <span className="text-slate-400">({product.seller_review_count ?? 0} đánh giá)</span>
                                        </div>
                                        {ranking && <div className="text-xs text-slate-500 mt-1">Hạng seller hiện tại: #{ranking.rank}</div>}
                                    </div>
                                </div>
                                <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-full text-sm font-medium hover:bg-slate-200 transition-colors">
                                    <User size={16} />
                                    Hồ sơ seller
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-4">
                                <span className="text-sm font-medium text-slate-700">Số lượng:</span>
                                <div className="flex items-center border border-slate-200 rounded-full">
                                    <button
                                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                        className="w-10 h-10 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded-l-full"
                                    >
                                        -
                                    </button>
                                    <span className="w-12 text-center font-medium">{quantity}</span>
                                    <button
                                        onClick={() => setQuantity(quantity + 1)}
                                        className="w-10 h-10 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded-r-full"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={handleAddToCart}
                                    className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl font-semibold"
                                >
                                    <ShoppingCart size={20} />
                                    Thêm vào giỏ hàng
                                </button>
                                <button
                                    onClick={handleShare}
                                    title="Chia sẻ sản phẩm"
                                    aria-label="Chia sẻ sản phẩm"
                                    className="flex items-center justify-center px-4 py-4 bg-white border-2 border-slate-200 text-slate-700 rounded-2xl"
                                >
                                    <Share2 size={20} />
                                </button>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                            <h3 className="text-lg font-semibold text-slate-900 mb-2">Mô tả sản phẩm</h3>
                            <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">
                                {product.description || 'Chưa có mô tả chi tiết cho sản phẩm này.'}
                            </p>
                        </div>

                        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white">
                            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Leaf size={20} />Tác động môi trường</h3>
                            <div className="text-3xl font-bold">{product.co2_savings_kg} kg CO₂e</div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <section className="bg-white rounded-2xl border border-slate-200 p-5">
                        <h3 className="text-lg font-semibold text-slate-900 mb-3">Review thật & đánh giá</h3>
                        <div className="text-sm text-slate-600 mb-4">
                            Trung bình <span className="font-semibold text-slate-900">{reviewSummary.average_rating.toFixed(2)}/5</span> • {reviewSummary.total_reviews} lượt đánh giá
                        </div>

                        <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                            {reviews.length === 0 && <div className="text-sm text-slate-500">Chưa có đánh giá nào.</div>}
                            {reviews.map((review) => (
                                <div key={review.id} className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="text-sm font-medium text-slate-900">{review.reviewer.name}</div>
                                        <div className="text-xs text-slate-500">{formatDate(review.created_at)}</div>
                                    </div>
                                    <div className="flex items-center gap-1 text-amber-500 text-sm mb-1">
                                        <Star size={13} fill="currentColor" />
                                        <span>{review.rating}/5</span>
                                        {review.verified_interaction && (
                                            <span className="text-emerald-600 text-xs ml-2">Đã xác thực tương tác</span>
                                        )}
                                    </div>
                                    <p className="text-sm text-slate-700">{review.content}</p>
                                </div>
                            ))}
                        </div>

                        {user && !isSellerView && (
                            <div className="mt-4 border-t border-slate-200 pt-4 space-y-2">
                                <div className="grid grid-cols-4 gap-2">
                                    <AppSelect
                                        aria-label="Chọn số sao đánh giá"
                                        value={reviewRating}
                                        onChange={(e) => setReviewRating(e.target.value)}
                                        className="col-span-1 border border-slate-200 rounded-lg px-2 py-2 text-sm"
                                        wrapperClassName="col-span-1"
                                    >
                                        <option value="5">5★</option>
                                        <option value="4">4★</option>
                                        <option value="3">3★</option>
                                        <option value="2">2★</option>
                                        <option value="1">1★</option>
                                    </AppSelect>
                                    <input
                                        value={reviewContent}
                                        onChange={(e) => setReviewContent(e.target.value)}
                                        className="col-span-3 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                                        placeholder="Viết đánh giá của bạn..."
                                    />
                                </div>
                                <button
                                    onClick={submitReview}
                                    disabled={submittingReview || !reviewContent.trim()}
                                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium disabled:opacity-50"
                                >
                                    {submittingReview ? 'Đang gửi...' : 'Gửi đánh giá'}
                                </button>
                            </div>
                        )}
                    </section>

                    <section className="bg-white rounded-2xl border border-slate-200 p-5">
                        <h3 className="text-lg font-semibold text-slate-900 mb-3">Chat / Đàm phán giá</h3>

                        <div className="rounded-xl border border-slate-200 p-3 bg-slate-50 h-64 overflow-y-auto space-y-2">
                            {selectedInquiry?.messages?.length ? (
                                selectedInquiry.messages.map((message) => {
                                    const isMine = user?.id === message.sender.id;
                                    return (
                                        <div key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${isMine ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>
                                                <div className="font-medium text-xs mb-1 opacity-90">{message.sender.name}</div>
                                                <div>{message.message}</div>
                                                {typeof message.proposed_price_vnd === 'number' && (
                                                    <div className="mt-1 text-xs flex items-center gap-1">
                                                        <BadgeDollarSign size={12} /> Đề xuất: {formatCurrency(message.proposed_price_vnd)}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="text-sm text-slate-500">Chưa có cuộc đàm phán nào cho sản phẩm này.</div>
                            )}
                        </div>

                        {selectedInquiry && (
                            <div className="mt-2 text-xs text-slate-500">Trạng thái: <span className="font-medium">{selectedInquiry.status}</span></div>
                        )}

                        {user ? (
                            <div className="mt-4 space-y-2">
                                <div className="grid grid-cols-4 gap-2">
                                    <input
                                        value={chatText}
                                        onChange={(e) => setChatText(e.target.value)}
                                        placeholder="Nhắn tin với đối tác..."
                                        className="col-span-3 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                                    />
                                    <input
                                        value={offerText}
                                        onChange={(e) => setOfferText(e.target.value)}
                                        placeholder="Giá đề xuất"
                                        className="col-span-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                                    />
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={sendNegotiationMessage}
                                        disabled={sendingChat || !chatText.trim()}
                                        className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <Send size={14} /> Gửi
                                    </button>

                                    {isSellerView && selectedInquiry?.status === 'OPEN' && (
                                        <>
                                            <button onClick={() => updateInquiryStatus('ACCEPTED')} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium">Chấp nhận deal</button>
                                            <button onClick={() => updateInquiryStatus('REJECTED')} className="px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-medium">Từ chối</button>
                                            <button onClick={() => updateInquiryStatus('CLOSED')} className="px-3 py-2 rounded-lg bg-slate-600 text-white text-xs font-medium">Đóng phiên</button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={onLoginRequest}
                                className="mt-4 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium"
                            >
                                Đăng nhập để chat/đàm phán
                            </button>
                        )}
                    </section>
                </div>

                {isSellerView && productDashboard && (
                    <section className="bg-white rounded-2xl border border-slate-200 p-5">
                        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                            <TrendingUp size={18} /> Dashboard hiệu quả tin đăng
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                                <div className="text-xs text-slate-500">Lượt xem</div>
                                <div className="text-xl font-bold text-slate-900">{productDashboard.views}</div>
                            </div>
                            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                                <div className="text-xs text-slate-500">Quan tâm</div>
                                <div className="text-xl font-bold text-slate-900">{productDashboard.inquiries}</div>
                            </div>
                            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                                <div className="text-xs text-slate-500">Deal thành công</div>
                                <div className="text-xl font-bold text-slate-900">{productDashboard.accepted_deals}</div>
                            </div>
                            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                                <div className="text-xs text-slate-500">Tỷ lệ tương tác</div>
                                <div className="text-xl font-bold text-slate-900">{productDashboard.interaction_rate_pct}%</div>
                            </div>
                            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                                <div className="text-xs text-slate-500">Tỷ lệ chốt deal</div>
                                <div className="text-xl font-bold text-slate-900">{productDashboard.conversion_rate_pct}%</div>
                            </div>
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
};
