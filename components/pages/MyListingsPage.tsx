import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Eye, Filter, Leaf, Loader2, MapPin, Package, Pencil, RefreshCw, RotateCcw, Save, Search, ShoppingBag, Star, Tag, Trash2, TrendingUp, X, XCircle } from 'lucide-react';
import { apiFetch } from '@/utils/api';
import Pagination from '../ui/Pagination';
import { AppSelect } from '../ui/AppSelect';

type ListingItem = {
    id: string;
    title: string;
    price: number;
    quality_score: number;
    unit: string;
    category: string;
    location: string;
    image: string;
    description?: string;
    co2_savings_kg: number;
    posted_at: string;
};

type ListingFormState = {
    title: string;
    price: string;
    quality_score: string;
    unit: string;
    category: string;
    location: string;
    image: string;
    co2_savings_kg: string;
    description: string;
};

interface MyListingsPageProps {
    onBack: () => void;
    onViewProduct: (productId: string) => void;
}

const toFormState = (item: ListingItem): ListingFormState => ({
    title: item.title,
    price: String(item.price),
    quality_score: String(item.quality_score),
    unit: item.unit,
    category: item.category,
    location: item.location,
    image: item.image,
    co2_savings_kg: String(item.co2_savings_kg),
    description: item.description ?? '',
});

export const MyListingsPage: React.FC<MyListingsPageProps> = ({ onBack, onViewProduct }) => {
    const [loading, setLoading] = useState(true);
    const [listings, setListings] = useState<ListingItem[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [form, setForm] = useState<ListingFormState | null>(null);
    const [totalViews, setTotalViews] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('Tất cả');
    const [sortBy, setSortBy] = useState<'newest' | 'price_asc' | 'price_desc' | 'quality_desc'>('newest');
    const [currentPage, setCurrentPage] = useState(1);

    const ITEMS_PER_PAGE = 6;

    const currencyFormatter = useMemo(
        () => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }),
        []
    );

    const loadListings = async () => {
        setLoading(true);
        setError(null);

        try {
            const [listingsRes, dashboardRes] = await Promise.all([
                apiFetch('products/seller/listings', { cache: 'no-store' }),
                apiFetch('products/seller/dashboard', { cache: 'no-store' }),
            ]);

            const listingsData = (await listingsRes.json()) as any;
            if (!listingsRes.ok) throw new Error(listingsData?.error ?? 'Không tải được sản phẩm đã đăng');
            setListings(Array.isArray(listingsData?.listings) ? listingsData.listings : []);

            const dashboardData = (await dashboardRes.json()) as any;
            if (dashboardRes.ok) {
                setTotalViews(Number(dashboardData?.overview?.totalViews ?? 0));
            } else {
                setTotalViews(0);
            }
        } catch (e: any) {
            setError(e?.message ?? 'Có lỗi xảy ra khi tải danh sách.');
            setListings([]);
            setTotalViews(0);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadListings();
    }, []);

    const categories = useMemo(() => {
        const unique = [...new Set(listings.map((item) => item.category.trim()).filter(Boolean))];
        return ['Tất cả', ...unique];
    }, [listings]);

    const filteredListings = useMemo(() => {
        const normalizedQuery = searchQuery.trim().toLowerCase();

        const base = listings.filter((item) => {
            const matchCategory = selectedCategory === 'Tất cả' || item.category === selectedCategory;
            const matchSearch =
                !normalizedQuery ||
                item.title.toLowerCase().includes(normalizedQuery) ||
                item.location.toLowerCase().includes(normalizedQuery) ||
                item.category.toLowerCase().includes(normalizedQuery);

            return matchCategory && matchSearch;
        });

        const sorted = [...base];
        sorted.sort((a, b) => {
            if (sortBy === 'price_asc') return a.price - b.price;
            if (sortBy === 'price_desc') return b.price - a.price;
            if (sortBy === 'quality_desc') return b.quality_score - a.quality_score;
            return new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime();
        });

        return sorted;
    }, [listings, searchQuery, selectedCategory, sortBy]);

    const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredListings.length / ITEMS_PER_PAGE)), [filteredListings.length]);

    const paginatedListings = useMemo(
        () => filteredListings.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
        [filteredListings, currentPage]
    );

    const totalValueVnd = useMemo(
        () => filteredListings.reduce((sum, item) => sum + item.price, 0),
        [filteredListings]
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, selectedCategory, sortBy]);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const startEdit = (item: ListingItem) => {
        setEditingId(item.id);
        setForm(toFormState(item));
        setError(null);
        setSuccess(null);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setForm(null);
    };

    const saveEdit = async () => {
        if (!editingId || !form) return;

        const payload = {
            title: form.title.trim(),
            price: Number(form.price),
            quality_score: Number(form.quality_score),
            unit: form.unit.trim(),
            category: form.category.trim(),
            location: form.location.trim(),
            image: form.image.trim(),
            co2_savings_kg: Number(form.co2_savings_kg),
            description: form.description.trim() || undefined,
        };

        if (!payload.title || !payload.unit || !payload.category || !payload.location || !payload.image) {
            setError('Vui lòng nhập đầy đủ các trường bắt buộc.');
            return;
        }

        if (Number.isNaN(payload.price) || Number.isNaN(payload.quality_score) || Number.isNaN(payload.co2_savings_kg)) {
            setError('Giá, chất lượng và CO2 phải là số hợp lệ.');
            return;
        }

        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await apiFetch(`products/${editingId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = (await res.json()) as any;
            if (!res.ok) throw new Error(data?.error ?? 'Không thể cập nhật sản phẩm');

            const updated = data?.product as ListingItem | undefined;
            if (updated?.id) {
                setListings((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
            }
            setSuccess('Đã cập nhật sản phẩm.');
            setEditingId(null);
            setForm(null);
        } catch (e: any) {
            setError(e?.message ?? 'Không thể cập nhật sản phẩm.');
        } finally {
            setSaving(false);
        }
    };

    const deleteListing = async (listingId: string) => {
        if (!window.confirm('Bạn có chắc muốn xóa sản phẩm này?')) return;

        setDeletingId(listingId);
        setError(null);
        setSuccess(null);

        try {
            const res = await apiFetch(`products/${listingId}`, { method: 'DELETE' });
            const data = (await res.json()) as any;
            if (!res.ok) throw new Error(data?.error ?? 'Không thể xóa sản phẩm');

            setListings((prev) => prev.filter((item) => item.id !== listingId));
            if (editingId === listingId) {
                setEditingId(null);
                setForm(null);
            }
            setSuccess('Đã xóa sản phẩm.');
        } catch (e: any) {
            setError(e?.message ?? 'Không thể xóa sản phẩm.');
        } finally {
            setDeletingId(null);
        }
    };

    const qualityLabel = (score: number) => {
        if (score >= 5) return { label: 'Xuất sắc', color: 'bg-emerald-100 text-emerald-700 ring-emerald-200' };
        if (score >= 4) return { label: 'Tốt', color: 'bg-blue-100 text-blue-700 ring-blue-200' };
        if (score >= 3) return { label: 'Khá', color: 'bg-amber-100 text-amber-700 ring-amber-200' };
        return { label: 'Trung bình', color: 'bg-slate-100 text-slate-600 ring-slate-200' };
    };

    const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition';

    return (
        <div className="min-h-[calc(100vh-64px)] bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 py-10 px-4">
            <div className="container mx-auto max-w-5xl">

                {/* ── Header ── */}
                <div className="flex items-center justify-between gap-4 mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center shadow-sm">
                            <ShoppingBag size={20} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900 leading-tight">Sản phẩm đã đăng</h1>
                            <p className="text-sm text-slate-500">Quản lý và chỉnh sửa toàn bộ sản phẩm của bạn</p>
                        </div>
                    </div>
                    <button
                        onClick={onBack}
                        className="px-4 py-2 rounded-xl text-slate-600 font-medium hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 transition-all flex items-center gap-2"
                    >
                        <ArrowLeft size={17} />
                        Quay lại
                    </button>
                </div>

                {/* ── Toast notifications ── */}
                {error && (
                    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2 shadow-sm">
                        <XCircle size={16} className="shrink-0" /> {error}
                    </div>
                )}
                {success && (
                    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center gap-2 shadow-sm">
                        <CheckCircle2 size={16} className="shrink-0 text-emerald-600" /> {success}
                    </div>
                )}

                {loading ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-16 flex flex-col items-center gap-3 text-slate-400 shadow-sm">
                        <Loader2 className="animate-spin text-emerald-500" size={32} />
                        <span className="text-sm">Đang tải danh sách sản phẩm...</span>
                    </div>
                ) : listings.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-16 flex flex-col items-center gap-3 text-slate-400 shadow-sm">
                        <Package size={40} className="text-slate-300" />
                        <p className="font-medium text-slate-500">Bạn chưa đăng sản phẩm nào</p>
                        <p className="text-sm">Hãy đăng sản phẩm đầu tiên để bắt đầu bán hàng!</p>
                    </div>
                ) : (
                    <>
                        {/* ── Stats bar ── */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                            <div className="rounded-xl bg-white border border-slate-200 px-4 py-3 shadow-sm flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                                    <Package size={18} className="text-emerald-600" />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Tổng sản phẩm</p>
                                    <p className="text-lg font-bold text-slate-900">{listings.length}</p>
                                </div>
                            </div>
                            <div className="rounded-xl bg-white border border-slate-200 px-4 py-3 shadow-sm flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                                    <Filter size={18} className="text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Đang lọc</p>
                                    <p className="text-lg font-bold text-slate-900">{filteredListings.length}</p>
                                </div>
                            </div>
                            <div className="rounded-xl bg-white border border-slate-200 px-4 py-3 shadow-sm flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center">
                                    <Eye size={18} className="text-violet-600" />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Lượt xem</p>
                                    <p className="text-lg font-bold text-slate-900">{totalViews.toLocaleString('vi-VN')}</p>
                                </div>
                            </div>
                            <div className="rounded-xl bg-white border border-slate-200 px-4 py-3 shadow-sm flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                                    <TrendingUp size={18} className="text-amber-600" />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Tổng giá trị</p>
                                    <p className="text-base font-bold text-slate-900 leading-tight">{currencyFormatter.format(totalValueVnd)}</p>
                                </div>
                            </div>
                        </div>

                        {/* ── Filter panel ── */}
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 mb-5 shadow-sm">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                                <div className="relative md:col-span-2">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Tìm theo tên, địa điểm, danh mục..."
                                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={loadListings}
                                        title="Làm mới"
                                        className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition inline-flex items-center justify-center gap-1.5 text-sm font-medium"
                                    >
                                        <RefreshCw size={15} /> Làm mới
                                    </button>
                                    <button
                                        type="button"
                                        title="Đặt lại bộ lọc"
                                        onClick={() => { setSearchQuery(''); setSelectedCategory('Tất cả'); setSortBy('newest'); }}
                                        className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition inline-flex items-center justify-center gap-1.5 text-sm font-medium"
                                    >
                                        <RotateCcw size={15} /> Đặt lại
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <AppSelect
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    title="Lọc theo danh mục"
                                    className="w-full"
                                >
                                    {categories.map((category) => (
                                        <option key={category} value={category}>{category}</option>
                                    ))}
                                </AppSelect>
                                <AppSelect
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value as 'newest' | 'price_asc' | 'price_desc' | 'quality_desc')}
                                    title="Sắp xếp theo"
                                    className="w-full"
                                >
                                    <option value="newest">Mới nhất</option>
                                    <option value="price_asc">Giá tăng dần</option>
                                    <option value="price_desc">Giá giảm dần</option>
                                    <option value="quality_desc">Chất lượng cao trước</option>
                                </AppSelect>
                            </div>
                        </div>

                        {filteredListings.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 flex flex-col items-center gap-3 text-slate-400">
                                <Search size={32} className="text-slate-300" />
                                <p className="font-medium text-slate-500">Không tìm thấy sản phẩm phù hợp</p>
                                <p className="text-sm">Thử thay đổi từ khóa hoặc bộ lọc.</p>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {paginatedListings.map((item) => {
                                        const isEditing = editingId === item.id && form !== null;
                                        const quality = qualityLabel(item.quality_score);
                                        return (
                                            <div
                                                key={item.id}
                                                className={`rounded-2xl border bg-white shadow-sm overflow-hidden transition-shadow hover:shadow-md ${isEditing ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-slate-200'}`}
                                            >
                                                {isEditing && form ? (
                                                    /* ── Edit form ── */
                                                    <div className="p-5">
                                                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                                                            <Pencil size={16} className="text-emerald-600" />
                                                            <span className="font-semibold text-slate-800 text-sm">Chỉnh sửa sản phẩm</span>
                                                        </div>
                                                        <div className="space-y-3">
                                                            <div>
                                                                <label className="block text-xs font-medium text-slate-500 mb-1">Tiêu đề <span className="text-red-400">*</span></label>
                                                                <input value={form.title} onChange={(e) => setForm((p) => p ? { ...p, title: e.target.value } : p)} className={inputCls} placeholder="Tên sản phẩm" />
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-3">
                                                                <div>
                                                                    <label className="block text-xs font-medium text-slate-500 mb-1">Giá (VNĐ) <span className="text-red-400">*</span></label>
                                                                    <input value={form.price} onChange={(e) => setForm((p) => p ? { ...p, price: e.target.value } : p)} className={inputCls} placeholder="VD: 500000" type="number" min="0" />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-medium text-slate-500 mb-1">Chất lượng (1–5) <span className="text-red-400">*</span></label>
                                                                    <input value={form.quality_score} onChange={(e) => setForm((p) => p ? { ...p, quality_score: e.target.value } : p)} className={inputCls} placeholder="1 – 5" type="number" min="1" max="5" />
                                                                </div>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-3">
                                                                <div>
                                                                    <label className="block text-xs font-medium text-slate-500 mb-1">Danh mục <span className="text-red-400">*</span></label>
                                                                    <input value={form.category} onChange={(e) => setForm((p) => p ? { ...p, category: e.target.value } : p)} className={inputCls} placeholder="VD: Phụ phẩm nông nghiệp" />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-medium text-slate-500 mb-1">Đơn vị <span className="text-red-400">*</span></label>
                                                                    <input value={form.unit} onChange={(e) => setForm((p) => p ? { ...p, unit: e.target.value } : p)} className={inputCls} placeholder="VD: kg, tấn, bao" />
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-medium text-slate-500 mb-1"><MapPin size={11} className="inline mr-0.5" /> Địa điểm <span className="text-red-400">*</span></label>
                                                                <input value={form.location} onChange={(e) => setForm((p) => p ? { ...p, location: e.target.value } : p)} className={inputCls} placeholder="VD: Hà Nội" />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-medium text-slate-500 mb-1">URL hình ảnh <span className="text-red-400">*</span></label>
                                                                <input value={form.image} onChange={(e) => setForm((p) => p ? { ...p, image: e.target.value } : p)} className={inputCls} placeholder="https://..." />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-medium text-slate-500 mb-1"><Leaf size={11} className="inline mr-0.5 text-emerald-500" /> CO₂ tiết kiệm (kg)</label>
                                                                <input value={form.co2_savings_kg} onChange={(e) => setForm((p) => p ? { ...p, co2_savings_kg: e.target.value } : p)} className={inputCls} placeholder="VD: 12.5" type="number" min="0" step="0.1" />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-medium text-slate-500 mb-1">Mô tả</label>
                                                                <textarea value={form.description} onChange={(e) => setForm((p) => p ? { ...p, description: e.target.value } : p)} className={`${inputCls} min-h-[84px] resize-y`} placeholder="Thêm mô tả chi tiết về sản phẩm..." />
                                                            </div>
                                                            <div className="flex items-center justify-end gap-2 pt-1">
                                                                <button type="button" onClick={cancelEdit} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5 text-sm font-medium transition">
                                                                    <X size={15} /> Hủy
                                                                </button>
                                                                <button type="button" disabled={saving} onClick={saveEdit} className="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5 text-sm font-medium transition shadow-sm">
                                                                    {saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />} Lưu thay đổi
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    /* ── Card view ── */
                                                    <>
                                                        <button type="button" onClick={() => onViewProduct(item.id)} className="w-full text-left group">
                                                            <div className="relative overflow-hidden">
                                                                <img
                                                                    src={item.image}
                                                                    alt={item.title}
                                                                    className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
                                                                />
                                                                {/* Quality badge */}
                                                                <span className={`absolute top-2.5 left-2.5 text-xs font-semibold px-2 py-0.5 rounded-full ring-1 ${quality.color}`}>
                                                                    <Star size={10} className="inline mr-0.5 -mt-0.5" />{quality.label}
                                                                </span>
                                                                {/* Category badge */}
                                                                <span className="absolute top-2.5 right-2.5 text-xs font-medium px-2 py-0.5 rounded-full bg-black/40 text-white backdrop-blur-sm">
                                                                    {item.category}
                                                                </span>
                                                            </div>
                                                            <div className="px-4 pt-3 pb-1">
                                                                <h3 className="font-semibold text-slate-900 line-clamp-1 group-hover:text-emerald-700 transition-colors">{item.title}</h3>
                                                                <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                                                                    <MapPin size={11} className="shrink-0" /> {item.location}
                                                                </div>
                                                                <div className="flex items-center justify-between mt-2">
                                                                    <span className="text-emerald-700 font-bold text-base">{currencyFormatter.format(item.price)}<span className="text-xs font-normal text-slate-500 ml-1">/{item.unit}</span></span>
                                                                    {item.co2_savings_kg > 0 && (
                                                                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                                                                            <Leaf size={11} /> -{item.co2_savings_kg} kg CO₂
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </button>

                                                        <div className="flex items-center justify-between px-4 pt-2 pb-3 mt-1 border-t border-slate-100">
                                                            <span className="text-xs text-slate-400 flex items-center gap-1">
                                                                <Tag size={11} /> {new Date(item.posted_at).toLocaleDateString('vi-VN')}
                                                            </span>
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => startEdit(item)}
                                                                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 inline-flex items-center gap-1.5 text-xs font-medium transition"
                                                                >
                                                                    <Pencil size={13} /> Sửa
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={deletingId === item.id}
                                                                    onClick={() => deleteListing(item.id)}
                                                                    className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 disabled:opacity-50 inline-flex items-center gap-1.5 text-xs font-medium transition"
                                                                >
                                                                    {deletingId === item.id ? <Loader2 className="animate-spin" size={13} /> : <Trash2 size={13} />} Xóa
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                <Pagination
                                    currentPage={currentPage}
                                    totalPages={totalPages}
                                    onPageChange={setCurrentPage}
                                />
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
