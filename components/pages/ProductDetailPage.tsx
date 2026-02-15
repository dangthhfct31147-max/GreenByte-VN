import React, { useState, useEffect } from 'react';
import {
    ArrowLeft,
    MapPin,
    Leaf,
    ShoppingCart,
    MessageCircle,
    Share2,
    Heart,
    Star,
    CheckCircle2,
    Truck,
    Shield,
    Clock,
    ChevronRight,
    User
} from 'lucide-react';
import { motion } from 'framer-motion';
import { apiFetch } from '@/utils/api';

// Re-use Product type from MarketplacePage
export interface Product {
    id: string;
    title: string;
    price: number;
    unit: string;
    category: string;
    location: string;
    image: string;
    seller_name: string;
    seller_avatar?: string;
    co2_savings_kg: number;
    description?: string;
    posted_at: string;
}

interface ProductDetailPageProps {
    productId: string;
    user: { id: string; name: string } | null;
    onBack: () => void;
    onAddToCart: (product: Product) => void;
    onLoginRequest: () => void;
}

export const ProductDetailPage: React.FC<ProductDetailPageProps> = ({
    productId,
    user,
    onBack,
    onAddToCart,
    onLoginRequest
}) => {
    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [quantity, setQuantity] = useState(1);
    const [isWishlisted, setIsWishlisted] = useState(false);
    const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);

    // Fetch product details
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(null);

        apiFetch(`products/${productId}`, { signal: controller.signal })
            .then(async (r) => {
                if (!r.ok) throw new Error(`Không tìm thấy sản phẩm`);
                return (await r.json()) as { product: Product };
            })
            .then((data) => {
                setProduct(data.product);
                // Fetch related products after getting the main product
                return apiFetch(`products?category=${encodeURIComponent(data.product.category)}&limit=4`, { signal: controller.signal });
            })
            .then(async (r) => {
                if (r.ok) {
                    const data = await r.json() as { products: Product[] };
                    // Filter out the current product
                    setRelatedProducts(data.products.filter(p => p.id !== productId).slice(0, 3));
                }
            })
            .catch((err) => {
                if (err.name !== 'AbortError') {
                    setError(err.message || 'Có lỗi xảy ra');
                }
            })
            .finally(() => setLoading(false));

        return () => controller.abort();
    }, [productId]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('vi-VN', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    const handleAddToCart = () => {
        if (!user) {
            onLoginRequest();
            return;
        }
        if (product) {
            for (let i = 0; i < quantity; i++) {
                onAddToCart(product);
            }
        }
    };

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
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-3xl">😢</span>
                    </div>
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
            {/* Breadcrumb / Back Navigation */}
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

            {/* Main Content */}
            <div className="container mx-auto px-4 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    {/* Left Column - Image Gallery */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <div className="sticky top-24">
                            {/* Main Image */}
                            <div className="relative aspect-square rounded-3xl overflow-hidden bg-slate-100 shadow-lg">
                                <img
                                    src={product.image}
                                    alt={product.title}
                                    className="w-full h-full object-cover"
                                />
                                {/* Category Badge */}
                                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1.5 rounded-full text-sm font-semibold text-slate-700 shadow-sm">
                                    {product.category}
                                </div>
                                {/* CO2 Badge */}
                                <div className="absolute top-4 right-4 bg-emerald-500/90 backdrop-blur text-white px-3 py-1.5 rounded-full text-sm font-bold flex items-center gap-1.5 shadow-sm">
                                    <Leaf size={14} fill="currentColor" />
                                    -{product.co2_savings_kg}kg CO₂e
                                </div>
                                {/* Wishlist Button */}
                                <button
                                    onClick={() => setIsWishlisted(!isWishlisted)}
                                    title={isWishlisted ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}
                                    aria-label={isWishlisted ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}
                                    className={`absolute bottom-4 right-4 p-3 rounded-full shadow-lg transition-all ${isWishlisted
                                        ? 'bg-red-500 text-white'
                                        : 'bg-white/90 backdrop-blur text-slate-600 hover:text-red-500'
                                        }`}
                                >
                                    <Heart size={20} fill={isWishlisted ? 'currentColor' : 'none'} />
                                </button>
                            </div>

                            {/* Thumbnail placeholder - for future multi-image support */}
                            <div className="mt-4 flex gap-3">
                                <div className="w-20 h-20 rounded-xl overflow-hidden border-2 border-emerald-500">
                                    <img src={product.image} alt="" className="w-full h-full object-cover" />
                                </div>
                                <div className="w-20 h-20 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 border-2 border-dashed border-slate-200">
                                    <span className="text-xs">+Thêm</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Right Column - Product Info */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="space-y-6"
                    >
                        {/* Title */}
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">
                                {product.title}
                            </h1>
                            <div className="flex items-center gap-4 text-sm text-slate-500">
                                <span className="flex items-center gap-1">
                                    <MapPin size={14} />
                                    {product.location}
                                </span>
                                <span className="flex items-center gap-1">
                                    <Clock size={14} />
                                    {formatDate(product.posted_at)}
                                </span>
                            </div>
                        </div>

                        {/* Price */}
                        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl p-6 border border-emerald-100">
                            <div className="flex items-baseline gap-2">
                                <span className="text-4xl font-bold text-emerald-600">
                                    {formatCurrency(product.price)}
                                </span>
                                <span className="text-lg text-slate-500">/{product.unit}</span>
                            </div>
                            <p className="text-sm text-slate-600 mt-2">
                                💡 Giá có thể thương lượng cho đơn hàng lớn
                            </p>
                        </div>

                        {/* Seller Info */}
                        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xl font-bold">
                                        {product.seller_name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-slate-900">{product.seller_name}</span>
                                            <CheckCircle2 size={16} className="text-emerald-500" />
                                        </div>
                                        <div className="flex items-center gap-1 text-sm text-amber-500">
                                            <Star size={14} fill="currentColor" />
                                            <span className="font-medium">4.8</span>
                                            <span className="text-slate-400">(24 đánh giá)</span>
                                        </div>
                                    </div>
                                </div>
                                <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-full text-sm font-medium hover:bg-slate-200 transition-colors">
                                    <User size={16} />
                                    Xem hồ sơ
                                </button>
                            </div>
                        </div>

                        {/* Quantity & Add to Cart */}
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
                                <span className="text-sm text-slate-500">{product.unit}</span>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={handleAddToCart}
                                    className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl font-semibold hover:from-emerald-700 hover:to-teal-700 transition-all shadow-lg hover:shadow-emerald-500/30"
                                >
                                    <ShoppingCart size={20} />
                                    Thêm vào giỏ hàng
                                </button>
                                <button
                                    title="Nhắn tin cho người bán"
                                    aria-label="Nhắn tin cho người bán"
                                    className="flex items-center justify-center gap-2 px-4 py-4 bg-white border-2 border-slate-200 text-slate-700 rounded-2xl font-medium hover:border-emerald-300 hover:bg-emerald-50 transition-all"
                                >
                                    <MessageCircle size={20} />
                                </button>
                                <button
                                    title="Chia sẻ sản phẩm"
                                    aria-label="Chia sẻ sản phẩm"
                                    className="flex items-center justify-center gap-2 px-4 py-4 bg-white border-2 border-slate-200 text-slate-700 rounded-2xl font-medium hover:border-emerald-300 hover:bg-emerald-50 transition-all"
                                >
                                    <Share2 size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Trust Badges */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-white rounded-xl p-4 border border-slate-100 text-center">
                                <Truck className="mx-auto text-emerald-500 mb-2" size={24} />
                                <span className="text-xs font-medium text-slate-700">Hỗ trợ vận chuyển</span>
                            </div>
                            <div className="bg-white rounded-xl p-4 border border-slate-100 text-center">
                                <Shield className="mx-auto text-emerald-500 mb-2" size={24} />
                                <span className="text-xs font-medium text-slate-700">Giao dịch an toàn</span>
                            </div>
                            <div className="bg-white rounded-xl p-4 border border-slate-100 text-center">
                                <Leaf className="mx-auto text-emerald-500 mb-2" size={24} />
                                <span className="text-xs font-medium text-slate-700">Thân thiện môi trường</span>
                            </div>
                        </div>

                        {/* Description */}
                        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                            <h3 className="text-lg font-semibold text-slate-900 mb-4">Mô tả sản phẩm</h3>
                            <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">
                                {product.description || 'Chưa có mô tả chi tiết cho sản phẩm này. Vui lòng liên hệ người bán để biết thêm thông tin.'}
                            </p>
                        </div>

                        {/* Environmental Impact */}
                        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white">
                            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <Leaf size={20} />
                                Tác động môi trường
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white/20 backdrop-blur rounded-xl p-4">
                                    <div className="text-3xl font-bold">{product.co2_savings_kg}</div>
                                    <div className="text-sm opacity-90">kg CO₂e tiết kiệm</div>
                                </div>
                                <div className="bg-white/20 backdrop-blur rounded-xl p-4">
                                    <div className="text-3xl font-bold">{Math.round(product.co2_savings_kg / 22)}</div>
                                    <div className="text-sm opacity-90">cây xanh tương đương</div>
                                </div>
                            </div>
                            <p className="mt-4 text-sm opacity-90">
                                *Ước tính dựa trên hệ số IPCC. Mua sản phẩm này thay vì đốt bỏ giúp giảm đáng kể lượng khí thải nhà kính.
                            </p>
                        </div>
                    </motion.div>
                </div>

                {/* Related Products */}
                {relatedProducts.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                        className="mt-16"
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-slate-900">Sản phẩm tương tự</h2>
                            <button
                                onClick={onBack}
                                className="text-sm text-emerald-600 font-medium flex items-center gap-1 hover:underline"
                            >
                                Xem tất cả
                                <ChevronRight size={16} />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {relatedProducts.map((p) => (
                                <div
                                    key={p.id}
                                    className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                                >
                                    <div className="aspect-[4/3] bg-slate-100">
                                        <img src={p.image} alt={p.title} className="w-full h-full object-cover" />
                                    </div>
                                    <div className="p-4">
                                        <h3 className="font-semibold text-slate-900 line-clamp-2 mb-2">{p.title}</h3>
                                        <div className="flex items-baseline gap-1 text-emerald-600 font-bold">
                                            {formatCurrency(p.price)}
                                            <span className="text-xs font-medium text-slate-500">/{p.unit}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </div>
        </div>
    );
};
