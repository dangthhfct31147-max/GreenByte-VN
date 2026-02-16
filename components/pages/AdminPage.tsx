import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    LayoutDashboard,
    Users,
    ShoppingBag,
    MessageSquare,
    CalendarDays,
    AlertTriangle,
    Rocket,
    RefreshCw,
    Trash2,
    RotateCcw,
    LogOut,
    Home,
    Search,
    Check,
    X,
    Shield,
} from 'lucide-react';
import { apiFetch } from '@/utils/api';
import { getAdminToken } from '@/utils/adminAuth';

type AdminTab = 'dashboard' | 'users' | 'moderation' | 'products' | 'posts' | 'events' | 'pollution' | 'future';

interface AdminPageProps {
    adminEmail: string;
    onLogout: () => void;
    onBackHome: () => void;
}

interface DashboardData {
    stats: {
        users: number;
        products: number;
        posts: number;
        events: number;
        pollutionReports: number;
    };
    recent: {
        products: Array<{ id: string; title: string; createdAt: string; seller: { name: string } }>;
        posts: Array<{ id: string; content: string; createdAt: string; author: { name: string } }>;
    };
    futureModules: string[];
}

const TABS: Array<{ id: AdminTab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { id: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'users', label: 'Người dùng', icon: Users },
    { id: 'moderation', label: 'Kiểm duyệt', icon: Shield },
    { id: 'products', label: 'Sản phẩm', icon: ShoppingBag },
    { id: 'posts', label: 'Bài viết', icon: MessageSquare },
    { id: 'events', label: 'Sự kiện', icon: CalendarDays },
    { id: 'pollution', label: 'Báo cáo ô nhiễm', icon: AlertTriangle },
    { id: 'future', label: 'Mở rộng tương lai', icon: Rocket },
];

async function adminFetch(endpoint: string, init?: RequestInit) {
    const token = getAdminToken();
    const headers = new Headers(init?.headers);
    if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    return apiFetch(`admin/${endpoint}`, {
        ...init,
        headers,
    });
}

export const AdminPage: React.FC<AdminPageProps> = ({ adminEmail, onLogout, onBackHome }) => {
    const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [includeDeleted, setIncludeDeleted] = useState(false);

    const [dashboard, setDashboard] = useState<DashboardData | null>(null);
    const [users, setUsers] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [posts, setPosts] = useState<any[]>([]);
    const [events, setEvents] = useState<any[]>([]);
    const [reports, setReports] = useState<any[]>([]);
    const [moderationQueue, setModerationQueue] = useState<any[]>([]);

    const loadData = useCallback(async (tab: AdminTab, query = '', includeSoftDeleted = false) => {
        setLoading(true);
        setError(null);

        try {
            if (tab === 'dashboard' || tab === 'future') {
                const res = await adminFetch('dashboard');
                const data = await res.json();
                if (!res.ok) throw new Error(data?.error ?? 'Không thể tải dashboard');
                setDashboard(data as DashboardData);
                return;
            }

            const searchSuffix = query.trim() ? `&search=${encodeURIComponent(query.trim())}` : '';
            const includeDeletedSuffix = includeSoftDeleted ? '&includeDeleted=true' : '';

            if (tab === 'users') {
                const res = await adminFetch(`users?take=120${searchSuffix}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data?.error ?? 'Không thể tải danh sách người dùng');
                setUsers(Array.isArray(data?.users) ? data.users : []);
                return;
            }

            if (tab === 'moderation') {
                const res = await adminFetch(`moderation/queue?take=200${searchSuffix}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data?.error ?? 'Không thể tải hàng chờ kiểm duyệt');
                setModerationQueue(Array.isArray(data?.queue) ? data.queue : []);
                return;
            }

            if (tab === 'products') {
                const res = await adminFetch(`products?take=120${searchSuffix}${includeDeletedSuffix}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data?.error ?? 'Không thể tải sản phẩm');
                setProducts(Array.isArray(data?.products) ? data.products : []);
                return;
            }

            if (tab === 'posts') {
                const res = await adminFetch(`posts?take=120${searchSuffix}${includeDeletedSuffix}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data?.error ?? 'Không thể tải bài viết');
                setPosts(Array.isArray(data?.posts) ? data.posts : []);
                return;
            }

            if (tab === 'events') {
                const res = await adminFetch(`events?take=120${searchSuffix}${includeDeletedSuffix}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data?.error ?? 'Không thể tải sự kiện');
                setEvents(Array.isArray(data?.events) ? data.events : []);
                return;
            }

            if (tab === 'pollution') {
                const res = await adminFetch(`pollution?take=200${searchSuffix}${includeDeletedSuffix}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data?.error ?? 'Không thể tải báo cáo ô nhiễm');
                setReports(Array.isArray(data?.reports) ? data.reports : []);
            }
        } catch (e: any) {
            setError(e?.message ?? 'Có lỗi xảy ra');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadData(activeTab, search, includeDeleted);
    }, [activeTab, includeDeleted, loadData, search]);

    const statsCards = useMemo(() => {
        if (!dashboard) return [];
        return [
            { label: 'Người dùng', value: dashboard.stats.users },
            { label: 'Sản phẩm', value: dashboard.stats.products },
            { label: 'Bài viết', value: dashboard.stats.posts },
            { label: 'Sự kiện', value: dashboard.stats.events },
            { label: 'Báo cáo ô nhiễm', value: dashboard.stats.pollutionReports },
        ];
    }, [dashboard]);

    const handleDelete = async (resource: 'products' | 'posts' | 'events' | 'pollution', id: string) => {
        const confirmed = window.confirm('Bạn chắc chắn muốn xóa bản ghi này?');
        if (!confirmed) return;

        try {
            const res = await adminFetch(`${resource}/${id}`, { method: 'DELETE' });
            if (!res.ok && res.status !== 204) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error ?? 'Không thể xóa');
            }
            await loadData(activeTab, search, includeDeleted);
        } catch (e: any) {
            alert(e?.message ?? 'Có lỗi xảy ra khi xóa');
        }
    };

    const handleRestore = async (resource: 'products' | 'posts' | 'events' | 'pollution', id: string) => {
        try {
            const res = await adminFetch(`${resource}/${id}/restore`, { method: 'PATCH' });
            if (!res.ok && res.status !== 204) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error ?? 'Không thể khôi phục');
            }
            await loadData(activeTab, search, includeDeleted);
        } catch (e: any) {
            alert(e?.message ?? 'Có lỗi xảy ra khi khôi phục');
        }
    };

    const handleUserAction = async (
        userId: string,
        action: 'lock' | 'unlock' | 'reset-2fa' | 'seller-verify',
        body?: Record<string, unknown>
    ) => {
        try {
            const res = await adminFetch(`users/${userId}/${action}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body ?? {}),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error ?? 'Không thể thực hiện thao tác người dùng');
            }
            await loadData('users', search, includeDeleted);
        } catch (e: any) {
            alert(e?.message ?? 'Có lỗi khi thao tác người dùng');
        }
    };

    const handleModerationDecision = async (
        item: { resource: 'posts' | 'events' | 'pollution'; id: string },
        decision: 'approve' | 'reject'
    ) => {
        try {
            const res = await adminFetch(`moderation/${item.resource}/${item.id}/${decision}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            if (!res.ok && res.status !== 204) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error ?? 'Không thể xử lý kiểm duyệt');
            }
            await loadData('moderation', search, includeDeleted);
        } catch (e: any) {
            alert(e?.message ?? 'Có lỗi khi xử lý kiểm duyệt');
        }
    };

    const isModerationTab = activeTab === 'products' || activeTab === 'posts' || activeTab === 'events' || activeTab === 'pollution';

    return (
        <div className="min-h-screen bg-slate-100">
            <div className="bg-slate-900 text-white border-b border-slate-800">
                <div className="container mx-auto px-4 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold">Admin Portal</h1>
                        <p className="text-sm text-slate-300">Đăng nhập bởi {adminEmail}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={onBackHome} className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm inline-flex items-center gap-2">
                            <Home size={16} /> Trang chủ
                        </button>
                        <button onClick={() => void loadData(activeTab, search, includeDeleted)} className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm inline-flex items-center gap-2">
                            <RefreshCw size={16} /> Làm mới
                        </button>
                        <button onClick={onLogout} className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-sm inline-flex items-center gap-2">
                            <LogOut size={16} /> Đăng xuất
                        </button>
                    </div>
                </div>
            </div>

            <div className="container mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
                <aside className="bg-white border border-slate-200 rounded-2xl p-3 h-fit">
                    <div className="space-y-1">
                        {TABS.map((tab) => {
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === tab.id ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
                                >
                                    <Icon size={16} />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                </aside>

                <section className="bg-white border border-slate-200 rounded-2xl p-4 md:p-6 min-h-[70vh]">
                    <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <h2 className="text-xl font-semibold text-slate-900">{TABS.find((tab) => tab.id === activeTab)?.label}</h2>

                        {activeTab !== 'dashboard' && activeTab !== 'future' && (
                            <div className="w-full md:w-auto flex flex-col md:flex-row md:items-center gap-3">
                                {isModerationTab && (
                                    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={includeDeleted}
                                            onChange={(e) => setIncludeDeleted(e.target.checked)}
                                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                        />
                                        Hiện bản ghi đã xóa mềm
                                    </label>
                                )}

                                <label className="relative block w-full md:w-80">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Tìm kiếm..."
                                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                                    />
                                </label>
                            </div>
                        )}
                    </div>

                    {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
                    {loading && <div className="text-sm text-slate-500 mb-4">Đang tải dữ liệu...</div>}

                    {activeTab === 'dashboard' && dashboard && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                                {statsCards.map((card) => (
                                    <div key={card.label} className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                                        <div className="text-xs text-slate-500">{card.label}</div>
                                        <div className="text-2xl font-bold text-slate-900 mt-1">{card.value}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="border border-slate-100 rounded-xl p-4">
                                    <h3 className="font-semibold text-slate-900 mb-3">Sản phẩm mới</h3>
                                    <div className="space-y-2">
                                        {dashboard.recent.products.map((item) => (
                                            <div key={item.id} className="text-sm text-slate-700 border-b border-slate-100 pb-2">
                                                <div className="font-medium">{item.title}</div>
                                                <div className="text-xs text-slate-500">{item.seller.name}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="border border-slate-100 rounded-xl p-4">
                                    <h3 className="font-semibold text-slate-900 mb-3">Bài viết mới</h3>
                                    <div className="space-y-2">
                                        {dashboard.recent.posts.map((item) => (
                                            <div key={item.id} className="text-sm text-slate-700 border-b border-slate-100 pb-2">
                                                <div className="line-clamp-1">{item.content}</div>
                                                <div className="text-xs text-slate-500">{item.author.name}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'users' && (
                        <AdminTable headers={['Tên', 'Email', '2FA', 'Seller', 'Trạng thái', '']}>
                            {users.map((u) => (
                                <tr key={u.id} className="border-b border-slate-100">
                                    <td className="py-2 px-2 text-slate-800">{u.name}</td>
                                    <td className="py-2 px-2 text-slate-600">{u.email}</td>
                                    <td className="py-2 px-2 text-slate-600">{u.totpEnabled ? 'Bật' : 'Tắt'}</td>
                                    <td className="py-2 px-2 text-slate-600">{u.sellerVerified ? 'Đã xác minh' : 'Chưa xác minh'}</td>
                                    <td className="py-2 px-2 text-slate-600">{u.lockedUntil ? 'Đang khóa' : 'Hoạt động'}</td>
                                    <td className="py-2 px-2 text-right">
                                        <div className="inline-flex items-center gap-2">
                                            {u.lockedUntil ? (
                                                <button onClick={() => void handleUserAction(u.id, 'unlock')} title="Mở khóa" aria-label="Mở khóa" className="text-emerald-600 hover:text-emerald-700"><RotateCcw size={16} /></button>
                                            ) : (
                                                <button onClick={() => void handleUserAction(u.id, 'lock', { minutes: 60 })} title="Khóa 60 phút" aria-label="Khóa 60 phút" className="text-amber-600 hover:text-amber-700"><Shield size={16} /></button>
                                            )}
                                            <button onClick={() => void handleUserAction(u.id, 'reset-2fa')} title="Reset 2FA" aria-label="Reset 2FA" className="text-slate-600 hover:text-slate-700"><X size={16} /></button>
                                            <button
                                                onClick={() => void handleUserAction(u.id, 'seller-verify', { verified: !u.sellerVerified })}
                                                title={u.sellerVerified ? 'Gỡ xác minh seller' : 'Xác minh seller'}
                                                aria-label={u.sellerVerified ? 'Gỡ xác minh seller' : 'Xác minh seller'}
                                                className={u.sellerVerified ? 'text-slate-600 hover:text-slate-700' : 'text-emerald-600 hover:text-emerald-700'}
                                            >
                                                <Check size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </AdminTable>
                    )}

                    {activeTab === 'moderation' && (
                        <AdminTable headers={['Loại', 'Nội dung', 'Tác giả/Nguồn', 'Tạo lúc', '']}>
                            {moderationQueue.map((item) => (
                                <tr key={`${item.resource}-${item.id}`} className="border-b border-slate-100">
                                    <td className="py-2 px-2 text-slate-700 uppercase text-xs">{item.resource}</td>
                                    <td className="py-2 px-2 text-slate-800 max-w-[420px] line-clamp-2">{item.title}</td>
                                    <td className="py-2 px-2 text-slate-600 max-w-[240px] line-clamp-1">{item.subtitle}</td>
                                    <td className="py-2 px-2 text-slate-600">{new Date(item.createdAt).toLocaleString('vi-VN')}</td>
                                    <td className="py-2 px-2 text-right">
                                        <div className="inline-flex items-center gap-2">
                                            <button
                                                onClick={() => void handleModerationDecision(item, 'approve')}
                                                title="Duyệt"
                                                aria-label="Duyệt"
                                                className="text-emerald-600 hover:text-emerald-700"
                                            >
                                                <Check size={16} />
                                            </button>
                                            <button
                                                onClick={() => void handleModerationDecision(item, 'reject')}
                                                title="Từ chối"
                                                aria-label="Từ chối"
                                                className="text-red-600 hover:text-red-700"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </AdminTable>
                    )}

                    {activeTab === 'products' && (
                        <AdminTable headers={['Tiêu đề', 'Người bán', 'Danh mục', 'Giá', 'Trạng thái', '']}>
                            {products.map((item) => (
                                <tr key={item.id} className="border-b border-slate-100">
                                    <td className="py-2 px-2 text-slate-800">{item.title}</td>
                                    <td className="py-2 px-2 text-slate-600">{item.seller?.name}</td>
                                    <td className="py-2 px-2 text-slate-600">{item.category}</td>
                                    <td className="py-2 px-2 text-slate-600">{new Intl.NumberFormat('vi-VN').format(item.priceVnd)}đ</td>
                                    <td className="py-2 px-2 text-slate-600">{item.deletedAt ? 'Đã xóa mềm' : 'Đang hiển thị'}</td>
                                    <td className="py-2 px-2 text-right">
                                        {item.deletedAt ? (
                                            <button onClick={() => void handleRestore('products', item.id)} title="Khôi phục sản phẩm" aria-label="Khôi phục sản phẩm" className="text-emerald-600 hover:text-emerald-700"><RotateCcw size={16} /></button>
                                        ) : (
                                            <button onClick={() => void handleDelete('products', item.id)} title="Xóa sản phẩm" aria-label="Xóa sản phẩm" className="text-red-500 hover:text-red-600"><Trash2 size={16} /></button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </AdminTable>
                    )}

                    {activeTab === 'posts' && (
                        <AdminTable headers={['Tác giả', 'Nội dung', 'Like/BL', 'Trạng thái', '']}>
                            {posts.map((item) => (
                                <tr key={item.id} className="border-b border-slate-100">
                                    <td className="py-2 px-2 text-slate-600">{item.author?.name}</td>
                                    <td className="py-2 px-2 text-slate-800 max-w-[420px] line-clamp-2">{item.content}</td>
                                    <td className="py-2 px-2 text-slate-600">{item.likes}/{item.comments}</td>
                                    <td className="py-2 px-2 text-slate-600">{item.deletedAt ? 'Đã xóa mềm' : 'Đang hiển thị'}</td>
                                    <td className="py-2 px-2 text-right">
                                        {item.deletedAt ? (
                                            <button onClick={() => void handleRestore('posts', item.id)} title="Khôi phục bài viết" aria-label="Khôi phục bài viết" className="text-emerald-600 hover:text-emerald-700"><RotateCcw size={16} /></button>
                                        ) : (
                                            <button onClick={() => void handleDelete('posts', item.id)} title="Xóa bài viết" aria-label="Xóa bài viết" className="text-red-500 hover:text-red-600"><Trash2 size={16} /></button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </AdminTable>
                    )}

                    {activeTab === 'events' && (
                        <AdminTable headers={['Sự kiện', 'Địa điểm', 'Organizer', 'Người tham gia', 'Trạng thái', '']}>
                            {events.map((item) => (
                                <tr key={item.id} className="border-b border-slate-100">
                                    <td className="py-2 px-2 text-slate-800">{item.title}</td>
                                    <td className="py-2 px-2 text-slate-600">{item.location}</td>
                                    <td className="py-2 px-2 text-slate-600">{item.organizer || '-'}</td>
                                    <td className="py-2 px-2 text-slate-600">{item.attendees}</td>
                                    <td className="py-2 px-2 text-slate-600">{item.deletedAt ? 'Đã xóa mềm' : 'Đang hiển thị'}</td>
                                    <td className="py-2 px-2 text-right">
                                        {item.deletedAt ? (
                                            <button onClick={() => void handleRestore('events', item.id)} title="Khôi phục sự kiện" aria-label="Khôi phục sự kiện" className="text-emerald-600 hover:text-emerald-700"><RotateCcw size={16} /></button>
                                        ) : (
                                            <button onClick={() => void handleDelete('events', item.id)} title="Xóa sự kiện" aria-label="Xóa sự kiện" className="text-red-500 hover:text-red-600"><Trash2 size={16} /></button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </AdminTable>
                    )}

                    {activeTab === 'pollution' && (
                        <AdminTable headers={['Loại', 'Mức độ', 'Mô tả', 'Ẩn danh', 'Trạng thái', '']}>
                            {reports.map((item) => (
                                <tr key={item.id} className="border-b border-slate-100">
                                    <td className="py-2 px-2 text-slate-800">{item.type}</td>
                                    <td className="py-2 px-2 text-slate-600">{item.severity}/5</td>
                                    <td className="py-2 px-2 text-slate-800 max-w-[420px] line-clamp-2">{item.description}</td>
                                    <td className="py-2 px-2 text-slate-600">{item.isAnonymous ? 'Có' : 'Không'}</td>
                                    <td className="py-2 px-2 text-slate-600">{item.deletedAt ? 'Đã xóa mềm' : 'Đang hiển thị'}</td>
                                    <td className="py-2 px-2 text-right">
                                        {item.deletedAt ? (
                                            <button onClick={() => void handleRestore('pollution', item.id)} title="Khôi phục báo cáo ô nhiễm" aria-label="Khôi phục báo cáo ô nhiễm" className="text-emerald-600 hover:text-emerald-700"><RotateCcw size={16} /></button>
                                        ) : (
                                            <button onClick={() => void handleDelete('pollution', item.id)} title="Xóa báo cáo ô nhiễm" aria-label="Xóa báo cáo ô nhiễm" className="text-red-500 hover:text-red-600"><Trash2 size={16} /></button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </AdminTable>
                    )}

                    {activeTab === 'future' && (
                        <div className="space-y-4">
                            <p className="text-slate-600">
                                Kiến trúc Admin đã mở để hỗ trợ tất cả chức năng tương lai thông qua nhóm API `/api/admin/*`.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {(dashboard?.futureModules ?? []).map((moduleName) => (
                                    <div key={moduleName} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                        {moduleName}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

const AdminTable: React.FC<{ headers: string[]; children: React.ReactNode }> = ({ headers, children }) => (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="bg-slate-50">
                    <tr>
                        {headers.map((head) => (
                            <th key={head} className="text-left font-semibold text-slate-700 px-2 py-2">{head}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>{children}</tbody>
            </table>
        </div>
    </div>
);
