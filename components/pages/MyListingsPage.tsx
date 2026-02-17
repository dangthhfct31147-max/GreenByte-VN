import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Pencil, Save, Trash2, X } from 'lucide-react';
import { apiFetch } from '@/utils/api';

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

    const currencyFormatter = useMemo(
        () => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }),
        []
    );

    const loadListings = async () => {
        setLoading(true);
        setError(null);

        try {
            const res = await apiFetch('products/seller/listings', { cache: 'no-store' });
            const data = (await res.json()) as any;
            if (!res.ok) throw new Error(data?.error ?? 'Không tải được sản phẩm đã đăng');
            setListings(Array.isArray(data?.listings) ? data.listings : []);
        } catch (e: any) {
            setError(e?.message ?? 'Có lỗi xảy ra khi tải danh sách.');
            setListings([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadListings();
    }, []);

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

    return (
        <div className="min-h-[calc(100vh-64px)] py-10 px-4">
            <div className="container mx-auto max-w-5xl">
                <div className="flex items-center justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Sản phẩm đã đăng</h1>
                        <p className="text-sm text-slate-500">Quản lý và chỉnh sửa các sản phẩm bạn đã đăng trên sàn.</p>
                    </div>
                    <button
                        onClick={onBack}
                        className="px-4 py-2 rounded-lg text-slate-600 font-medium hover:bg-slate-100 transition-colors flex items-center gap-2"
                    >
                        <ArrowLeft size={18} />
                        Quay lại
                    </button>
                </div>

                {loading ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-8 text-slate-500 flex items-center gap-2 justify-center">
                        <Loader2 className="animate-spin" size={18} /> Đang tải danh sách sản phẩm...
                    </div>
                ) : listings.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-slate-500 text-center">
                        Bạn chưa đăng sản phẩm nào.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {listings.map((item) => {
                            const isEditing = editingId === item.id && form !== null;
                            return (
                                <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                                    {isEditing && form ? (
                                        <div className="space-y-3">
                                            <input
                                                value={form.title}
                                                onChange={(e) => setForm((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                                                className="w-full px-3 py-2 rounded-lg border border-slate-200"
                                                placeholder="Tiêu đề"
                                            />
                                            <div className="grid grid-cols-2 gap-3">
                                                <input
                                                    value={form.price}
                                                    onChange={(e) => setForm((prev) => (prev ? { ...prev, price: e.target.value } : prev))}
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-200"
                                                    placeholder="Giá"
                                                />
                                                <input
                                                    value={form.quality_score}
                                                    onChange={(e) => setForm((prev) => (prev ? { ...prev, quality_score: e.target.value } : prev))}
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-200"
                                                    placeholder="Chất lượng 1-5"
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <input
                                                    value={form.category}
                                                    onChange={(e) => setForm((prev) => (prev ? { ...prev, category: e.target.value } : prev))}
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-200"
                                                    placeholder="Danh mục"
                                                />
                                                <input
                                                    value={form.unit}
                                                    onChange={(e) => setForm((prev) => (prev ? { ...prev, unit: e.target.value } : prev))}
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-200"
                                                    placeholder="Đơn vị"
                                                />
                                            </div>
                                            <input
                                                value={form.location}
                                                onChange={(e) => setForm((prev) => (prev ? { ...prev, location: e.target.value } : prev))}
                                                className="w-full px-3 py-2 rounded-lg border border-slate-200"
                                                placeholder="Địa điểm"
                                            />
                                            <input
                                                value={form.image}
                                                onChange={(e) => setForm((prev) => (prev ? { ...prev, image: e.target.value } : prev))}
                                                className="w-full px-3 py-2 rounded-lg border border-slate-200"
                                                placeholder="URL ảnh"
                                            />
                                            <input
                                                value={form.co2_savings_kg}
                                                onChange={(e) => setForm((prev) => (prev ? { ...prev, co2_savings_kg: e.target.value } : prev))}
                                                className="w-full px-3 py-2 rounded-lg border border-slate-200"
                                                placeholder="CO2 tiết kiệm (kg)"
                                            />
                                            <textarea
                                                value={form.description}
                                                onChange={(e) => setForm((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
                                                className="w-full px-3 py-2 rounded-lg border border-slate-200 min-h-24"
                                                placeholder="Mô tả"
                                            />

                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={cancelEdit}
                                                    className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1"
                                                >
                                                    <X size={16} /> Hủy
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={saving}
                                                    onClick={saveEdit}
                                                    className="px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-emerald-600 disabled:opacity-50 inline-flex items-center gap-1"
                                                >
                                                    {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Lưu
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => onViewProduct(item.id)}
                                                className="w-full text-left"
                                            >
                                                <img src={item.image} alt={item.title} className="w-full h-44 object-cover rounded-xl border border-slate-200" />
                                                <div className="mt-3 font-semibold text-slate-900 line-clamp-1">{item.title}</div>
                                                <div className="text-sm text-slate-500 mt-1">{item.location} • {item.category}</div>
                                                <div className="text-emerald-700 font-semibold mt-1">{currencyFormatter.format(item.price)}</div>
                                                <div className="text-xs text-slate-500 mt-1">Đăng: {new Date(item.posted_at).toLocaleString('vi-VN')}</div>
                                            </button>

                                            <div className="mt-4 flex items-center justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => startEdit(item)}
                                                    className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
                                                >
                                                    <Pencil size={16} /> Chỉnh sửa
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={deletingId === item.id}
                                                    onClick={() => deleteListing(item.id)}
                                                    className="px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 inline-flex items-center gap-1"
                                                >
                                                    {deletingId === item.id ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />} Xóa
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {error && (
                    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
                )}
                {success && (
                    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div>
                )}
            </div>
        </div>
    );
};
