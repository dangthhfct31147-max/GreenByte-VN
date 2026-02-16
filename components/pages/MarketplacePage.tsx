import React, { useEffect, useState } from 'react';
import {
  Search,
  Filter,
  Plus,
  MapPin,
  ShoppingCart,
  Leaf,
  Star,
  X,
  Image as ImageIcon,
  Loader2,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '@/utils/api';
import OptimizedImage from '../ui/OptimizedImage';
import Pagination from '../ui/Pagination';
import { useScrollDirection } from '@/utils/hooks';

// --- Types ---

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
  distance_km?: number | null;
  image: string;
  seller_id?: string;
  seller_name: string;
  seller_rating_avg?: number;
  seller_review_count?: number;
  seller_avatar?: string;
  co2_savings_kg: number;
  description?: string;
  posted_at: string;
}

interface SellerRanking {
  rank: number;
  seller_id: string;
  seller_name: string;
  average_rating: number;
  total_reviews: number;
  verified: boolean;
}

const CATEGORIES = ['Tất cả', 'Rơm rạ', 'Vỏ trấu', 'Phân bón', 'Bã mía', 'Gỗ & Mùn cưa', 'Khác'];

// --- Components ---

interface MarketplacePageProps {
  user: { id: string; name: string } | null;
  onLoginRequest: () => void;
  addToCart: (product: Product) => void;
  onViewProduct: (productId: string) => void;
}

export const MarketplacePage: React.FC<MarketplacePageProps> = ({ user, onLoginRequest, addToCart, onViewProduct }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [sellerRankings, setSellerRankings] = useState<SellerRanking[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tất cả');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minQuality, setMinQuality] = useState('0');
  const [maxDistanceKm, setMaxDistanceKm] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'price_asc' | 'price_desc' | 'quality_desc' | 'distance_asc'>('newest');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLoadingRemote, setIsLoadingRemote] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 8;
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  // Scroll Direction for Header
  const scrollDirection = useScrollDirection();
  const showHeader = scrollDirection !== 'down';

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  // Load from backend (server-side filtered)
  useEffect(() => {
    const controller = new AbortController();
    setIsLoadingRemote(true);

    const params = new URLSearchParams();
    params.set('take', '24');
    if (debouncedSearchQuery) params.set('search', debouncedSearchQuery);
    if (selectedCategory !== 'Tất cả') params.set('category', selectedCategory);
    if (minPrice.trim()) params.set('minPrice', minPrice.trim());
    if (maxPrice.trim()) params.set('maxPrice', maxPrice.trim());
    if (minQuality && minQuality !== '0') params.set('minQuality', minQuality);
    if (maxDistanceKm.trim()) params.set('maxDistanceKm', maxDistanceKm.trim());
    if (userLocation) {
      params.set('userLat', String(userLocation.lat));
      params.set('userLng', String(userLocation.lng));
    }
    params.set('sort', sortBy);

    apiFetch(`products?${params.toString()}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { products: Product[] };
      })
      .then((data) => {
        if (Array.isArray(data.products)) setProducts(data.products);
      })
      .catch((err: any) => {
        if (err?.name !== 'AbortError') {
          setProducts([]);
        }
      })
      .finally(() => setIsLoadingRemote(false));

    return () => controller.abort();
  }, [debouncedSearchQuery, selectedCategory, minPrice, maxPrice, minQuality, maxDistanceKm, userLocation, sortBy]);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch('products/sellers/rankings?take=5', { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error('Không tải được xếp hạng');
        return (await r.json()) as { rankings: SellerRanking[] };
      })
      .then((data) => {
        if (Array.isArray(data.rankings)) {
          setSellerRankings(data.rankings);
        }
      })
      .catch(() => setSellerRankings([]));

    return () => controller.abort();
  }, []);

  const filteredProducts = products;

  // Pagination Logic
  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, minPrice, maxPrice, minQuality, maxDistanceKm, sortBy]);

  const requestBrowserLocation = () => {
    if (!navigator.geolocation) {
      alert('Trình duyệt không hỗ trợ định vị');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
        });
      },
      () => alert('Không lấy được vị trí của bạn'),
      { enableHighAccuracy: true, timeout: 7000 }
    );
  };

  const handleCreateListing = (newProduct: Product) => {
    setProducts([newProduct, ...products]);
    setIsCreateModalOpen(false);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20 select-none">

      {/* Header / Search Section */}
      <motion.div
        className="bg-white border-b border-slate-200 sticky top-16 z-30"
        initial={{ y: 0 }}
        animate={{ y: showHeader ? 0 : '-100%' }}
        transition={{ duration: 0.3 }}
      >
        <div className="container mx-auto px-4 py-4 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

            {/* Search Bar */}
            <div className="relative flex-1 max-w-2xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input
                type="text"
                placeholder="Tìm kiếm phụ phẩm, địa điểm..."
                className="w-full pl-10 pr-4 py-2.5 rounded-full border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => user ? setIsCreateModalOpen(true) : onLoginRequest()}
                className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-full font-medium hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-900/10"
              >
                <Plus size={18} />
                <span className="hidden sm:inline">Đăng tin bán</span>
                <span className="sm:hidden">Đăng tin</span>
              </button>
            </div>
          </div>

          {/* Categories */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition-all ${selectedCategory === cat
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                  }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-3 md:p-4">
            <div className="flex items-center gap-2 text-slate-700 mb-3">
              <Filter size={16} />
              <span className="text-sm font-semibold">Tìm kiếm nâng cao</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <input
                type="number"
                min={0}
                placeholder="Giá từ"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
              />
              <input
                type="number"
                min={0}
                placeholder="Giá đến"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
              />
              <select
                aria-label="Lọc chất lượng tối thiểu"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={minQuality}
                onChange={(e) => setMinQuality(e.target.value)}
              >
                <option value="0">Chất lượng bất kỳ</option>
                <option value="3">Từ 3 sao</option>
                <option value="4">Từ 4 sao</option>
                <option value="5">5 sao</option>
              </select>
              <input
                type="number"
                min={0}
                placeholder="Khoảng cách (km)"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={maxDistanceKm}
                onChange={(e) => setMaxDistanceKm(e.target.value)}
              />
              <select
                aria-label="Sắp xếp kết quả"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              >
                <option value="newest">Mới nhất</option>
                <option value="price_asc">Giá tăng dần</option>
                <option value="price_desc">Giá giảm dần</option>
                <option value="quality_desc">Chất lượng cao nhất</option>
                <option value="distance_asc">Gần tôi nhất</option>
              </select>
              <button
                type="button"
                onClick={requestBrowserLocation}
                className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-medium hover:border-emerald-300 hover:text-emerald-600 transition-colors"
              >
                Dùng vị trí của tôi
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">

        {/* Results Info */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">
            {selectedCategory === 'Tất cả' ? 'Tin đăng mới nhất' : selectedCategory}
          </h2>
          <span className="text-sm text-slate-500">
            {isLoadingRemote ? 'Đang tải...' : `Tìm thấy ${filteredProducts.length} kết quả`}
          </span>
        </div>

        {sellerRankings.length > 0 && (
          <div className="mb-6 bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Xếp hạng người bán</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              {sellerRankings.map((seller) => (
                <div key={seller.seller_id} className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                  <div className="text-xs text-slate-500">Hạng #{seller.rank}</div>
                  <div className="text-sm font-semibold text-slate-900 truncate">{seller.seller_name}</div>
                  <div className="mt-1 flex items-center gap-1 text-amber-500 text-sm">
                    <Star size={14} fill="currentColor" />
                    <span className="font-medium">{seller.average_rating.toFixed(1)}</span>
                    <span className="text-slate-500">({seller.total_reviews})</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Grid */}
        {filteredProducts.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {paginatedProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  formatCurrency={formatCurrency}
                  onAddToCart={() => addToCart(product)}
                  onViewProduct={() => onViewProduct(product.id)}
                />
              ))}
            </div>

            <div className="mt-8">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <Search className="text-slate-400" size={32} />
            </div>
            <h3 className="text-lg font-medium text-slate-900">Không tìm thấy kết quả</h3>
            <p className="text-slate-500 max-w-xs mx-auto mt-2">Thử thay đổi từ khóa tìm kiếm hoặc chọn danh mục khác.</p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('Tất cả');
                setMinPrice('');
                setMaxPrice('');
                setMinQuality('0');
                setMaxDistanceKm('');
                setSortBy('newest');
              }}
              className="mt-6 text-emerald-600 font-medium hover:underline"
            >
              Xóa bộ lọc
            </button>
          </div>
        )}
      </div>

      {/* Create Listing Modal */}
      <CreateListingModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateListing}
        user={user}
      />
    </div >
  );
};

// --- Sub-components ---

const ProductCard: React.FC<{ product: Product, formatCurrency: (v: number) => string, onAddToCart: () => void, onViewProduct: () => void }> = ({ product, formatCurrency, onAddToCart, onViewProduct }) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="group bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300 flex flex-col h-full cursor-pointer"
      onClick={onViewProduct}
    >
      {/* Image */}
      <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
        <OptimizedImage
          src={product.image}
          alt={product.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          lazy={true}
        />
        <div className="absolute top-3 left-3 bg-white/90 backdrop-blur px-2 py-1 rounded-md text-xs font-semibold text-slate-700 uppercase tracking-wider shadow-sm">
          {product.category}
        </div>
        <div className="absolute top-3 right-3 bg-emerald-500/90 backdrop-blur text-white px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-sm">
          <Leaf size={10} fill="currentColor" />
          -{product.co2_savings_kg}kg CO₂e
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-semibold text-slate-900 mb-1 line-clamp-2 min-h-[3rem]">
          {product.title}
        </h3>

        <div className="flex items-baseline gap-1 text-emerald-600 font-bold text-lg mb-2">
          {formatCurrency(product.price)}
          <span className="text-xs font-medium text-slate-500">/{product.unit}</span>
        </div>

        <div className="flex items-center gap-1 text-slate-500 text-xs mb-4">
          <MapPin size={12} />
          <span className="truncate">{product.location}</span>
        </div>

        <div className="flex items-center justify-between text-xs mb-3">
          <div className="flex items-center gap-1 text-amber-500">
            <Star size={12} fill="currentColor" />
            <span className="font-medium">{(product.seller_rating_avg ?? 0).toFixed(1)}</span>
            <span className="text-slate-500">({product.seller_review_count ?? 0})</span>
          </div>
          <div className="text-slate-500">
            Chất lượng: <span className="font-medium text-slate-700">{product.quality_score ?? 3}/5</span>
          </div>
        </div>

        {typeof product.distance_km === 'number' && (
          <div className="text-xs text-slate-500 mb-3">Khoảng cách: ~{product.distance_km} km</div>
        )}

        <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-slate-200 overflow-hidden">
              {/* Avatar placeholder */}
              <svg className="w-full h-full text-slate-400" fill="currentColor" viewBox="0 0 24 24"><path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            </div>
            <span className="text-xs font-medium text-slate-700 truncate max-w-[80px]">
              {product.seller_name}
            </span>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddToCart();
            }}
            className="p-2 rounded-full bg-slate-50 text-slate-600 hover:bg-emerald-500 hover:text-white transition-colors"
            title="Thêm vào giỏ"
          >
            <ShoppingCart size={18} />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

const CreateListingModal: React.FC<{ isOpen: boolean, onClose: () => void, onSubmit: (p: Product) => void, user: any }> = ({ isOpen, onClose, onSubmit, user }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    price: '',
    quality_score: '3',
    unit: 'kg',
    category: 'Rơm rạ',
    location: 'Hồ Chí Minh',
    latitude: '',
    longitude: '',
    image: 'https://images.unsplash.com/photo-1595835018335-508b5252834b?q=80&w=600&auto=format&fit=crop',
    co2_savings_kg: '10',
    description: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert('Vui lòng đăng nhập để đăng tin.');
      return;
    }
    setLoading(true);

    try {
      const res = await apiFetch('products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          price: Number(formData.price),
          quality_score: Number(formData.quality_score),
          unit: formData.unit,
          category: formData.category,
          location: formData.location,
          latitude: formData.latitude ? Number(formData.latitude) : undefined,
          longitude: formData.longitude ? Number(formData.longitude) : undefined,
          image: formData.image,
          co2_savings_kg: Number(formData.co2_savings_kg),
          description: formData.description || undefined,
        }),
      });
      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(data?.error ?? 'Đăng tin thất bại');

      onSubmit(data.product as Product);
      setFormData({
        title: '',
        price: '',
        quality_score: '3',
        unit: 'kg',
        category: 'Rơm rạ',
        location: 'Hồ Chí Minh',
        latitude: '',
        longitude: '',
        image: 'https://images.unsplash.com/photo-1595835018335-508b5252834b?q=80&w=600&auto=format&fit=crop',
        co2_savings_kg: '10',
        description: '',
      });
    } catch (err: any) {
      alert(err?.message ?? 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg relative z-10 overflow-hidden"
          >
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900">Đăng tin bán phụ phẩm</h3>
              <button
                onClick={onClose}
                className="p-1 rounded-full hover:bg-slate-200 text-slate-500"
                aria-label="Đóng"
                title="Đóng"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">

              <div>
                <label htmlFor="product-image" className="block text-sm font-medium text-slate-700 mb-1">Ảnh sản phẩm (URL)</label>
                <div className="flex gap-2">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 text-slate-400">
                    <ImageIcon size={18} />
                  </div>
                  <input
                    id="product-image"
                    required
                    type="url"
                    placeholder="https://..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                    value={formData.image}
                    onChange={e => setFormData({ ...formData, image: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="product-title" className="block text-sm font-medium text-slate-700 mb-1">Tiêu đề tin đăng</label>
                <input
                  id="product-title"
                  required
                  type="text"
                  placeholder="VD: 5 Tấn rơm cuộn..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="product-price" className="block text-sm font-medium text-slate-700 mb-1">Giá bán (VNĐ)</label>
                  <input
                    id="product-price"
                    required
                    type="number"
                    placeholder="0"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                    value={formData.price}
                    onChange={e => setFormData({ ...formData, price: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="product-quality" className="block text-sm font-medium text-slate-700 mb-1">Chất lượng (1-5)</label>
                  <select
                    id="product-quality"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                    value={formData.quality_score}
                    onChange={e => setFormData({ ...formData, quality_score: e.target.value })}
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="product-unit" className="block text-sm font-medium text-slate-700 mb-1">Đơn vị tính</label>
                  <select
                    id="product-unit"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                    value={formData.unit}
                    onChange={e => setFormData({ ...formData, unit: e.target.value })}
                  >
                    <option value="kg">kg</option>
                    <option value="tấn">tấn</option>
                    <option value="bao">bao</option>
                    <option value="khối">khối</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="product-lat" className="block text-sm font-medium text-slate-700 mb-1">Vĩ độ (tuỳ chọn)</label>
                  <input
                    id="product-lat"
                    type="number"
                    step="0.000001"
                    placeholder="10.8231"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                    value={formData.latitude}
                    onChange={e => setFormData({ ...formData, latitude: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="product-lng" className="block text-sm font-medium text-slate-700 mb-1">Kinh độ (tuỳ chọn)</label>
                  <input
                    id="product-lng"
                    type="number"
                    step="0.000001"
                    placeholder="106.6297"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2"
                    value={formData.longitude}
                    onChange={e => setFormData({ ...formData, longitude: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="product-category" className="block text-sm font-medium text-slate-700 mb-1">Danh mục</label>
                  <select
                    id="product-category"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                  >
                    {CATEGORIES.filter(c => c !== 'Tất cả').map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="product-location" className="block text-sm font-medium text-slate-700 mb-1">Khu vực</label>
                  <input
                    id="product-location"
                    type="text"
                    placeholder="Quận/Huyện, Tỉnh"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                    value={formData.location}
                    onChange={e => setFormData({ ...formData, location: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="product-description" className="block text-sm font-medium text-slate-700 mb-1">Mô tả chi tiết</label>
                <textarea
                  id="product-description"
                  rows={3}
                  placeholder="Tình trạng, nguồn gốc, vận chuyển..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div>
                <label htmlFor="product-co2" className="block text-sm font-medium text-slate-700 mb-1">CO₂ tiết kiệm (kg)</label>
                <input
                  id="product-co2"
                  required
                  type="number"
                  min={0}
                  max={1000000}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                  value={formData.co2_savings_kg}
                  onChange={e => setFormData({ ...formData, co2_savings_kg: e.target.value })}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-slate-900 text-white py-3 rounded-xl font-medium hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <><Check size={18} /> Đăng tin ngay</>}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};