import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Check,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '@/utils/api';
import OptimizedImage from '../ui/OptimizedImage';
import Pagination from '../ui/Pagination';
import { AppSelect } from '../ui/AppSelect';

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

interface VisionSuggestion {
  category: 'Rơm rạ' | 'Vỏ trấu' | 'Phân bón' | 'Bã mía' | 'Gỗ & Mùn cưa' | 'Khác';
  moisture_state: 'KHÔ' | 'ẨM' | 'ƯỚT' | 'KHÔNG_RÕ';
  impurity_level: 'THẤP' | 'TRUNG_BÌNH' | 'CAO' | 'KHÔNG_RÕ';
  confidence: number;
  recommended_quality_score: number;
  summary: string;
  evidence: string[];
}

interface SellerAssistantGuidance {
  assistant_message: string;
  normalized_description: string;
  quality_standards: string[];
  missing_fields: string[];
  warnings: string[];
  suggested_title?: string;
}

interface AssistantTurn {
  role: 'user' | 'assistant';
  content: string;
}

const CATEGORIES = ['Tất cả', 'Rơm rạ', 'Vỏ trấu', 'Phân bón', 'Bã mía', 'Gỗ & Mùn cưa', 'Khác'];
const DEFAULT_PRODUCT_IMAGE = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221200%22 height=%22800%22 viewBox=%220 0 1200 800%22%3E%3Crect width=%221200%22 height=%22800%22 fill=%22%23e2e8f0%22/%3E%3Cg fill=%22%2394a3b8%22%3E%3Ccircle cx=%22600%22 cy=%22310%22 r=%2260%22/%3E%3Cpath d=%22M430 520c40-78 104-118 170-118s130 40 170 118z%22/%3E%3C/g%3E%3Ctext x=%22600%22 y=%22620%22 text-anchor=%22middle%22 font-family=%22Arial,sans-serif%22 font-size=%2236%22 fill=%2264748b%22%3EAnh san pham%3C/text%3E%3C/svg%3E';
const AUTO_REFRESH_PREF_KEY_PREFIX = 'greenbyte:seller-assistant:auto-refresh:';

const DEFAULT_CREATE_FORM = {
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
};

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
    if (maxDistanceKm.trim() && maxDistanceKm !== 'over_50') params.set('maxDistanceKm', maxDistanceKm.trim());
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

  const filteredProducts = useMemo(() => {
    if (maxDistanceKm === 'over_50' && userLocation) {
      return products.filter((product) => typeof product.distance_km === 'number' && product.distance_km > 50);
    }
    return products;
  }, [maxDistanceKm, products, userLocation]);

  // Pagination Logic
  const totalPages = useMemo(() => Math.ceil(filteredProducts.length / ITEMS_PER_PAGE), [filteredProducts.length]);
  const paginatedProducts = useMemo(
    () => filteredProducts.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
    [filteredProducts, currentPage]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, minPrice, maxPrice, minQuality, maxDistanceKm, sortBy]);

  const requestBrowserLocation = () => {
    const hostname = window.location.hostname;
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
    if (!window.isSecureContext && !isLocalHost) {
      alert('Trình duyệt chỉ cho phép định vị trên HTTPS. Vui lòng mở website bằng https://');
      return;
    }

    if (!navigator.geolocation) {
      alert('Trình duyệt không hỗ trợ định vị');
      return;
    }

    const getPosition = (options: PositionOptions) =>
      new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
      });

    getPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 })
      .catch(async (error: GeolocationPositionError) => {
        if (error.code === error.TIMEOUT || error.code === error.POSITION_UNAVAILABLE) {
          return getPosition({ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
        }
        throw error;
      })
      .then((position) => {
        setUserLocation({
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
        });
        setSortBy('distance_asc');
      })
      .catch((error: GeolocationPositionError) => {
        if (error.code === error.PERMISSION_DENIED) {
          alert('Bạn đã chặn quyền vị trí. Hãy bật Location permission cho trang này rồi thử lại.');
          return;
        }
        if (error.code === error.TIMEOUT) {
          alert('Hết thời gian lấy vị trí. Vui lòng thử lại ở nơi có GPS/mạng ổn định hơn.');
          return;
        }
        if (error.code === error.POSITION_UNAVAILABLE) {
          alert('Thiết bị không xác định được vị trí hiện tại. Hãy bật GPS/Wi‑Fi rồi thử lại.');
          return;
        }
        alert(`Không lấy được vị trí của bạn. Chi tiết: ${error.message || 'Không xác định'}`);
      });
  };

  const handleCreateListing = useCallback((newProduct: Product) => {
    setProducts((prev) => [newProduct, ...prev]);
    setIsCreateModalOpen(false);
  }, []);

  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }),
    []
  );

  const handleViewProduct = useCallback(
    (productId: string) => {
      onViewProduct(productId);
    },
    [onViewProduct]
  );

  const handleAddToCart = useCallback(
    (product: Product) => {
      addToCart(product);
    },
    [addToCart]
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-20 select-none">

      {/* Header / Search Section */}
      <div className="bg-white border-b border-slate-200">
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
              <AppSelect
                aria-label="Lọc chất lượng tối thiểu"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={minQuality}
                onChange={(e) => setMinQuality(e.target.value)}
              >
                <option value="0">Tất cả</option>
                <option value="3">Từ 3 sao</option>
                <option value="4">Từ 4 sao</option>
                <option value="5">5 sao</option>
              </AppSelect>
              <AppSelect
                aria-label="Lọc khoảng cách"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={maxDistanceKm}
                onChange={(e) => setMaxDistanceKm(e.target.value)}
              >
                <option value="">Mọi nơi</option>
                <option value="5">Trong 5 km</option>
                <option value="10">Trong 10 km</option>
                <option value="20">Trong 20 km</option>
                <option value="50">Trong 50 km</option>
                <option value="over_50">Trên 50 km</option>
              </AppSelect>
              <AppSelect
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
              </AppSelect>
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
      </div>

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
                  currencyFormatter={currencyFormatter}
                  onAddToCart={handleAddToCart}
                  onViewProduct={handleViewProduct}
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

const ProductCard: React.FC<{
  product: Product;
  currencyFormatter: Intl.NumberFormat;
  onAddToCart: (product: Product) => void;
  onViewProduct: (productId: string) => void;
}> = React.memo(({ product, currencyFormatter, onAddToCart, onViewProduct }) => {
  return (
    <div
      className="group bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300 flex flex-col h-full cursor-pointer"
      onClick={() => onViewProduct(product.id)}
    >
      {/* Image */}
      <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
        <OptimizedImage
          src={product.image}
          alt={product.title}
          fallback={DEFAULT_PRODUCT_IMAGE}
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
          {currencyFormatter.format(product.price)}
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
              onAddToCart(product);
            }}
            className="p-2 rounded-full bg-slate-50 text-slate-600 hover:bg-emerald-500 hover:text-white transition-colors"
            title="Thêm vào giỏ"
          >
            <ShoppingCart size={18} />
          </button>
        </div>
      </div>
    </div>
  );
});

ProductCard.displayName = 'ProductCard';

const CreateListingModal: React.FC<{ isOpen: boolean, onClose: () => void, onSubmit: (p: Product) => void, user: any }> = ({ isOpen, onClose, onSubmit, user }) => {
  const [loading, setLoading] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [isAssisting, setIsAssisting] = useState(false);
  const [classifyError, setClassifyError] = useState<string | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [visionSuggestion, setVisionSuggestion] = useState<VisionSuggestion | null>(null);
  const [visionProvider, setVisionProvider] = useState<string | null>(null);
  const [assistantProvider, setAssistantProvider] = useState<string | null>(null);
  const [assistantGuidance, setAssistantGuidance] = useState<SellerAssistantGuidance | null>(null);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantConversation, setAssistantConversation] = useState<AssistantTurn[]>([]);
  const [hasAutoAssistantRun, setHasAutoAssistantRun] = useState(false);
  const [autoRefreshChecklistEnabled, setAutoRefreshChecklistEnabled] = useState(true);
  const [formData, setFormData] = useState(DEFAULT_CREATE_FORM);
  const lastAutoRefreshSignatureRef = useRef<string>('');
  const hasTriggeredInitialAssistantRef = useRef(false);

  const autoRefreshPrefKey = useMemo(() => {
    const userId = typeof user?.id === 'string' && user.id.trim().length > 0 ? user.id.trim() : 'anonymous';
    return `${AUTO_REFRESH_PREF_KEY_PREFIX}${userId}`;
  }, [user?.id]);

  const unresolvedAiMissingFields = useMemo(() => {
    const missing = assistantGuidance?.missing_fields ?? [];
    const hasText = (value: string) => value.trim().length > 0;
    const hasPositiveNumber = (value: string) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0;
    };

    return missing.filter((label) => {
      const normalized = label.toLowerCase();

      if (normalized.includes('tiêu đề')) return !hasText(formData.title);
      if (normalized.includes('giá')) return !hasPositiveNumber(formData.price);
      if (normalized.includes('đơn vị')) return !hasText(formData.unit);
      if (normalized.includes('danh mục')) return !hasText(formData.category);
      if (normalized.includes('khu vực')) return !hasText(formData.location);
      if (normalized.includes('ảnh')) return !hasText(formData.image);
      if (normalized.includes('mô tả')) return !hasText(formData.description);
      if (normalized.includes('co2') || normalized.includes('co₂')) return !hasPositiveNumber(formData.co2_savings_kg);

      return true;
    });
  }, [assistantGuidance?.missing_fields, formData.category, formData.co2_savings_kg, formData.description, formData.image, formData.location, formData.price, formData.title, formData.unit]);

  const shouldBlockSubmitByAi = unresolvedAiMissingFields.length > 0;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const stored = window.localStorage.getItem(autoRefreshPrefKey);
      if (stored === '0') {
        setAutoRefreshChecklistEnabled(false);
      } else {
        setAutoRefreshChecklistEnabled(true);
      }
    } catch {
      setAutoRefreshChecklistEnabled(true);
    }
  }, [autoRefreshPrefKey]);

  const assistantDraftSignature = useMemo(() => JSON.stringify({
    title: formData.title.trim(),
    price: formData.price.trim(),
    quality_score: formData.quality_score.trim(),
    unit: formData.unit.trim(),
    category: formData.category.trim(),
    location: formData.location.trim(),
    image: formData.image.trim(),
    co2_savings_kg: formData.co2_savings_kg.trim(),
    description: formData.description.trim(),
  }), [formData.category, formData.co2_savings_kg, formData.description, formData.image, formData.location, formData.price, formData.quality_score, formData.title, formData.unit]);

  const hasDraftChangedForAutoRefresh = useMemo(() => {
    return assistantDraftSignature !== JSON.stringify({
      title: DEFAULT_CREATE_FORM.title,
      price: DEFAULT_CREATE_FORM.price,
      quality_score: DEFAULT_CREATE_FORM.quality_score,
      unit: DEFAULT_CREATE_FORM.unit,
      category: DEFAULT_CREATE_FORM.category,
      location: DEFAULT_CREATE_FORM.location,
      image: DEFAULT_CREATE_FORM.image,
      co2_savings_kg: DEFAULT_CREATE_FORM.co2_savings_kg,
      description: DEFAULT_CREATE_FORM.description,
    });
  }, [assistantDraftSignature]);

  const buildDraftPayload = () => {
    const parseOptionalInt = (value: string) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    return {
      title: formData.title.trim() || undefined,
      price: parseOptionalInt(formData.price),
      quality_score: parseOptionalInt(formData.quality_score),
      unit: formData.unit.trim() || undefined,
      category: formData.category.trim() || undefined,
      location: formData.location.trim() || undefined,
      image: formData.image.trim() || undefined,
      co2_savings_kg: parseOptionalInt(formData.co2_savings_kg),
      description: formData.description.trim() || undefined,
    };
  };

  const handleClassifyImage = async () => {
    if (!user) {
      alert('Vui lòng đăng nhập để dùng AI phân loại.');
      return;
    }

    if (!formData.image.trim()) {
      setClassifyError('Vui lòng nhập URL ảnh sản phẩm trước khi phân loại.');
      setVisionSuggestion(null);
      return;
    }

    setIsClassifying(true);
    setClassifyError(null);

    try {
      const res = await apiFetch('products/classify-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: formData.image.trim(),
          title: formData.title.trim() || undefined,
          description: formData.description.trim() || undefined,
        }),
      });
      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(data?.error ?? 'Không thể phân loại ảnh');

      setVisionSuggestion(data?.suggestion as VisionSuggestion);
      setVisionProvider(typeof data?.provider === 'string' ? data.provider : null);
    } catch (err: any) {
      setClassifyError(err?.message ?? 'Phân loại ảnh thất bại');
      setVisionSuggestion(null);
      setVisionProvider(null);
    } finally {
      setIsClassifying(false);
    }
  };

  const applySuggestion = () => {
    if (!visionSuggestion) return;
    setFormData((prev) => ({
      ...prev,
      category: visionSuggestion.category,
      quality_score: String(visionSuggestion.recommended_quality_score),
    }));
  };

  const requestSellerAssistant = async (message: string, conversationInput: AssistantTurn[], appendUserTurn: boolean) => {
    setAssistantError(null);
    setIsAssisting(true);

    const nextConversation = appendUserTurn
      ? [...conversationInput, { role: 'user' as const, content: message }]
      : conversationInput;

    if (appendUserTurn) {
      setAssistantConversation(nextConversation);
    }

    try {
      const res = await apiFetch('products/seller-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          draft: buildDraftPayload(),
          conversation: nextConversation.slice(-6),
        }),
      });

      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(data?.error ?? 'Không thể gọi AI trợ lý');

      const guidance = data?.guidance as SellerAssistantGuidance;
      if (!guidance || typeof guidance.assistant_message !== 'string') {
        throw new Error('Phản hồi AI không hợp lệ');
      }

      setAssistantGuidance(guidance);
      setAssistantProvider(typeof data?.provider === 'string' ? data.provider : null);
      setAssistantConversation((prev) => {
        const lastTurn = prev[prev.length - 1];
        if (lastTurn?.role === 'assistant' && lastTurn.content === guidance.assistant_message) {
          return prev;
        }

        return [...prev, { role: 'assistant', content: guidance.assistant_message }];
      });
    } catch (err: any) {
      setAssistantError(err?.message ?? 'AI trợ lý tạm thời bận, vui lòng thử lại.');
    } finally {
      setIsAssisting(false);
    }
  };

  const handleSellerAssistant = async () => {
    if (!user) {
      alert('Vui lòng đăng nhập để dùng AI trợ lý đăng bán.');
      return;
    }

    const message = assistantInput.trim();
    if (!message) {
      setAssistantError('Vui lòng nhập câu hỏi hoặc yêu cầu cho trợ lý AI.');
      return;
    }

    setAssistantInput('');
    await requestSellerAssistant(message, assistantConversation, true);
  };

  const handleRefreshAssistantChecklist = async () => {
    if (!user) {
      alert('Vui lòng đăng nhập để dùng AI trợ lý đăng bán.');
      return;
    }

    await requestSellerAssistant(
      'Hãy quét lại toàn bộ thông tin hiện tại và cập nhật checklist còn thiếu trước khi đăng tin.',
      assistantConversation,
      false,
    );
  };

  const handleToggleAutoRefreshChecklist = (enabled: boolean) => {
    setAutoRefreshChecklistEnabled(enabled);

    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(autoRefreshPrefKey, enabled ? '1' : '0');
    } catch {
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setHasAutoAssistantRun(false);
      lastAutoRefreshSignatureRef.current = '';
      hasTriggeredInitialAssistantRef.current = false;
      return;
    }

    if (!user || hasAutoAssistantRun || isAssisting || hasTriggeredInitialAssistantRef.current) {
      return;
    }

    hasTriggeredInitialAssistantRef.current = true;
    setHasAutoAssistantRun(true);

    void requestSellerAssistant(
      'Hãy kiểm tra nhanh thông tin hiện có và cho tôi checklist cần điền trước khi đăng tin.',
      [],
      false,
    );
  }, [hasAutoAssistantRun, isAssisting, isOpen, user]);

  useEffect(() => {
    if (!isOpen || !user || !hasAutoAssistantRun || isAssisting || !autoRefreshChecklistEnabled) {
      return;
    }

    if (!hasDraftChangedForAutoRefresh) {
      return;
    }

    if (assistantDraftSignature === lastAutoRefreshSignatureRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      lastAutoRefreshSignatureRef.current = assistantDraftSignature;
      void requestSellerAssistant(
        'Hãy cập nhật checklist còn thiếu theo dữ liệu tôi vừa chỉnh sửa.',
        assistantConversation,
        false,
      );
    }, 18000);

    return () => window.clearTimeout(timer);
  }, [assistantConversation, assistantDraftSignature, autoRefreshChecklistEnabled, hasAutoAssistantRun, hasDraftChangedForAutoRefresh, isAssisting, isOpen, user]);

  const applyAssistantGuidance = () => {
    if (!assistantGuidance) return;

    setFormData((prev) => ({
      ...prev,
      title: assistantGuidance.suggested_title?.trim() ? assistantGuidance.suggested_title : prev.title,
      description: assistantGuidance.normalized_description?.trim() ? assistantGuidance.normalized_description : prev.description,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert('Vui lòng đăng nhập để đăng tin.');
      return;
    }

    if (shouldBlockSubmitByAi) {
      alert(`AI trợ lý phát hiện còn thiếu thông tin: ${unresolvedAiMissingFields.join(', ')}.`);
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
      setFormData(DEFAULT_CREATE_FORM);
      setAssistantConversation([]);
      setAssistantGuidance(null);
      setAssistantProvider(null);
      setAssistantInput('');
      setAssistantError(null);
      lastAutoRefreshSignatureRef.current = '';
    } catch (err: any) {
      alert(err?.message ?? 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-20 pb-4">
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
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl relative z-10 overflow-hidden max-h-[calc(100vh-4rem)] flex flex-col"
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

            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">

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
                    onChange={e => {
                      setFormData({ ...formData, image: e.target.value });
                      setVisionSuggestion(null);
                      setVisionProvider(null);
                      setClassifyError(null);
                    }}
                  />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleClassifyImage()}
                    disabled={isClassifying}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-60"
                  >
                    {isClassifying ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    AI phân loại từ ảnh
                  </button>
                  {visionProvider && <span className="text-[11px] text-slate-500">Nguồn: {visionProvider}</span>}
                </div>
                {classifyError && <p className="mt-2 text-xs text-rose-600">{classifyError}</p>}
                {visionSuggestion && (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-slate-700 space-y-2">
                    <div className="font-medium text-emerald-800">Gợi ý AI định danh phụ phẩm</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>Loại phụ phẩm: <span className="font-semibold">{visionSuggestion.category}</span></div>
                      <div>Độ tin cậy: <span className="font-semibold">{Math.round(visionSuggestion.confidence * 100)}%</span></div>
                      <div>Trạng thái ẩm: <span className="font-semibold">{visionSuggestion.moisture_state}</span></div>
                      <div>Tạp chất: <span className="font-semibold">{visionSuggestion.impurity_level}</span></div>
                    </div>
                    <p>{visionSuggestion.summary}</p>
                    {Array.isArray(visionSuggestion.evidence) && visionSuggestion.evidence.length > 0 && (
                      <ul className="list-disc pl-5 space-y-1">
                        {visionSuggestion.evidence.map((item, idx) => (
                          <li key={`${item}-${idx}`}>{item}</li>
                        ))}
                      </ul>
                    )}
                    <button
                      type="button"
                      onClick={applySuggestion}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-white font-medium hover:bg-emerald-700"
                    >
                      Áp dụng gợi ý vào tin đăng
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-slate-800">AI trợ lý đăng bán (Tiếng Việt đơn giản)</div>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${autoRefreshChecklistEnabled
                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                    >
                      Tự làm mới: {autoRefreshChecklistEnabled ? 'Bật' : 'Tắt'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                      <input
                        type="checkbox"
                        checked={autoRefreshChecklistEnabled}
                        onChange={(e) => handleToggleAutoRefreshChecklist(e.target.checked)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      Tự làm mới checklist
                    </label>
                    {assistantProvider && <span className="text-[11px] text-slate-500">Nguồn: {assistantProvider}</span>}
                  </div>
                </div>

                {assistantConversation.length > 0 && (
                  <div className="max-h-40 overflow-y-auto space-y-2 rounded-md border border-slate-200 bg-white p-2">
                    {assistantConversation.slice(-6).map((turn, idx) => (
                      <div
                        key={`${turn.role}-${idx}`}
                        className={`text-xs rounded-md px-2 py-1 ${turn.role === 'assistant'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-100'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                      >
                        {turn.role === 'assistant' ? 'AI: ' : 'Bạn: '}
                        {turn.content}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={assistantInput}
                    onChange={(e) => setAssistantInput(e.target.value)}
                    placeholder="Ví dụ: Giúp tôi viết mô tả dễ hiểu cho người mua"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSellerAssistant()}
                    disabled={isAssisting}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-60"
                  >
                    {isAssisting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    Gửi AI
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRefreshAssistantChecklist()}
                    disabled={isAssisting}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-60"
                  >
                    {isAssisting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Làm mới checklist
                  </button>
                </div>

                {assistantError && <p className="text-xs text-rose-600">{assistantError}</p>}

                {assistantGuidance && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3 text-xs text-slate-700 space-y-2">
                    {assistantGuidance.normalized_description && (
                      <div>
                        <div className="font-medium text-emerald-800">Mô tả đã chuẩn hoá</div>
                        <p className="mt-1 whitespace-pre-wrap">{assistantGuidance.normalized_description}</p>
                      </div>
                    )}

                    {assistantGuidance.quality_standards?.length > 0 && (
                      <div>
                        <div className="font-medium text-slate-800">Gợi ý tiêu chuẩn chất lượng</div>
                        <ul className="mt-1 list-disc pl-5 space-y-1">
                          {assistantGuidance.quality_standards.map((item, idx) => (
                            <li key={`${item}-${idx}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {assistantGuidance.missing_fields?.length > 0 && (
                      <div>
                        <div className="font-medium text-rose-700">Thiếu thông tin cần bổ sung</div>
                        <ul className="mt-1 list-disc pl-5 space-y-1 text-rose-700">
                          {assistantGuidance.missing_fields.map((item, idx) => (
                            <li key={`${item}-${idx}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {assistantGuidance.warnings?.length > 0 && (
                      <div>
                        <div className="font-medium text-amber-700">Cảnh báo dữ liệu</div>
                        <ul className="mt-1 list-disc pl-5 space-y-1 text-amber-700">
                          {assistantGuidance.warnings.map((item, idx) => (
                            <li key={`${item}-${idx}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={applyAssistantGuidance}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-white font-medium hover:bg-emerald-700"
                    >
                      Áp dụng mô tả chuẩn hoá
                    </button>
                  </div>
                )}
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
                  <AppSelect
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
                  </AppSelect>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="product-unit" className="block text-sm font-medium text-slate-700 mb-1">Đơn vị tính</label>
                  <AppSelect
                    id="product-unit"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                    value={formData.unit}
                    onChange={e => setFormData({ ...formData, unit: e.target.value })}
                  >
                    <option value="kg">kg</option>
                    <option value="tấn">tấn</option>
                    <option value="bao">bao</option>
                    <option value="khối">khối</option>
                  </AppSelect>
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
                  <AppSelect
                    id="product-category"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                  >
                    {CATEGORIES.filter(c => c !== 'Tất cả').map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </AppSelect>
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
                disabled={loading || shouldBlockSubmitByAi}
                className="w-full bg-slate-900 text-white py-3 rounded-xl font-medium hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
              >
                {loading
                  ? <Loader2 className="animate-spin" size={20} />
                  : shouldBlockSubmitByAi
                    ? <><X size={18} /> Bổ sung thông tin còn thiếu</>
                    : <><Check size={18} /> Đăng tin ngay</>}
              </button>
              {shouldBlockSubmitByAi && (
                <p className="text-xs text-rose-600">
                  Cần bổ sung trước khi đăng: {unresolvedAiMissingFields.join(', ')}.
                </p>
              )}
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};