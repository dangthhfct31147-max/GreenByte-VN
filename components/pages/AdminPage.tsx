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
    Activity,
    Bell,
} from 'lucide-react';
import { apiFetch } from '@/utils/api';
import { getAdminToken } from '@/utils/adminAuth';

type AdminTab = 'dashboard' | 'analytics' | 'users' | 'moderation' | 'products' | 'posts' | 'events' | 'pollution' | 'future';
type ModerationResourceFilter = 'all' | 'posts' | 'events' | 'pollution' | 'products';
type ModerationSortMode = 'newest' | 'risk_desc';

type ModerationCounts = {
    all: number;
    posts: number;
    events: number;
    pollution: number;
    products: number;
};

type ModerationProductAiDetail = {
    productId: string;
    productTitle: string;
    confidence: number;
    category?: string;
    moisture_state?: string;
    impurity_level?: string;
    summary?: string;
    provider?: string;
    model?: string;
    moderation_reason?: string;
    queued_at?: string;
};

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

const TABS: Array<{ id: AdminTab; label: string; icon: React.ComponentType<{ size?: number | string }> }> = [
    { id: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'analytics', label: 'Vận hành (P3)', icon: Activity },
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
    const [lowConfidenceOnly, setLowConfidenceOnly] = useState(false);
    const [aiConfidenceThreshold, setAiConfidenceThreshold] = useState('0.6');
    const [moderationResource, setModerationResource] = useState<ModerationResourceFilter>('all');
    const [moderationSort, setModerationSort] = useState<ModerationSortMode>('newest');

    const [dashboard, setDashboard] = useState<DashboardData | null>(null);
    const [users, setUsers] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [posts, setPosts] = useState<any[]>([]);
    const [events, setEvents] = useState<any[]>([]);
    const [reports, setReports] = useState<any[]>([]);
    const [moderationQueue, setModerationQueue] = useState<any[]>([]);
    const [analyticsOverview, setAnalyticsOverview] = useState<any | null>(null);
    const [alerts, setAlerts] = useState<any[]>([]);
    const [sla, setSla] = useState<any | null>(null);
    const [auditSummary, setAuditSummary] = useState<any | null>(null);
    const [queueingLowConfidence, setQueueingLowConfidence] = useState(false);
    const [moderationCounts, setModerationCounts] = useState<ModerationCounts>({ all: 0, posts: 0, events: 0, pollution: 0, products: 0 });
    const [selectedModerationAiDetail, setSelectedModerationAiDetail] = useState<ModerationProductAiDetail | null>(null);
    const [copyEvidenceState, setCopyEvidenceState] = useState<'idle' | 'copied' | 'error'>('idle');
    const [downloadEvidenceState, setDownloadEvidenceState] = useState<'idle' | 'downloaded' | 'error'>('idle');
    const [verifyInput, setVerifyInput] = useState('');
    const [verifyState, setVerifyState] = useState<'idle' | 'valid' | 'invalid' | 'error'>('idle');
    const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
    const [verifyFileState, setVerifyFileState] = useState<'idle' | 'loaded' | 'error'>('idle');
    const [loadedEvidenceDetail, setLoadedEvidenceDetail] = useState<ModerationProductAiDetail | null>(null);
    const parsedAiThreshold = Number(aiConfidenceThreshold);
    const aiThresholdValue = Number.isFinite(parsedAiThreshold) ? parsedAiThreshold : 0.6;

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

            if (tab === 'analytics') {
                const [overviewRes, alertsRes, slaRes, auditRes] = await Promise.all([
                    adminFetch('analytics/overview?days=14'),
                    adminFetch('analytics/alerts'),
                    adminFetch('analytics/sla'),
                    adminFetch('audit-summary?days=14'),
                ]);

                const [overviewData, alertsData, slaData, auditData] = await Promise.all([
                    overviewRes.json(),
                    alertsRes.json(),
                    slaRes.json(),
                    auditRes.json(),
                ]);

                if (!overviewRes.ok) throw new Error(overviewData?.error ?? 'Không thể tải analytics overview');
                if (!alertsRes.ok) throw new Error(alertsData?.error ?? 'Không thể tải alerts');
                if (!slaRes.ok) throw new Error(slaData?.error ?? 'Không thể tải SLA');
                if (!auditRes.ok) throw new Error(auditData?.error ?? 'Không thể tải audit summary');

                setAnalyticsOverview(overviewData);
                setAlerts(Array.isArray(alertsData?.alerts) ? alertsData.alerts : []);
                setSla(slaData?.sla ?? null);
                setAuditSummary(auditData ?? null);
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
                const moderationResourceSuffix = moderationResource !== 'all' ? `&resource=${encodeURIComponent(moderationResource)}` : '';
                const moderationSortSuffix = moderationResource === 'products' ? `&sort=${encodeURIComponent(moderationSort)}` : '';
                const res = await adminFetch(`moderation/queue?take=200${searchSuffix}${moderationResourceSuffix}${moderationSortSuffix}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data?.error ?? 'Không thể tải hàng chờ kiểm duyệt');
                setModerationQueue(Array.isArray(data?.queue) ? data.queue : []);
                setSelectedModerationAiDetail((prev) => {
                    if (!prev) return null;
                    const stillExists = Array.isArray(data?.queue) && data.queue.some((item: any) => item?.resource === 'products' && item?.id === prev.productId);
                    return stillExists ? prev : null;
                });
                const counts = data?.counts as Partial<ModerationCounts> | undefined;
                setModerationCounts({
                    all: Number(counts?.all ?? 0),
                    posts: Number(counts?.posts ?? 0),
                    events: Number(counts?.events ?? 0),
                    pollution: Number(counts?.pollution ?? 0),
                    products: Number(counts?.products ?? 0),
                });
                return;
            }

            if (tab === 'products') {
                const lowConfidenceSuffix = lowConfidenceOnly ? '&lowConfidenceOnly=true' : '';
                const thresholdValue = Number(aiConfidenceThreshold);
                const thresholdSuffix = Number.isFinite(thresholdValue)
                    ? `&aiConfidenceLte=${encodeURIComponent(String(thresholdValue))}`
                    : '';
                const res = await adminFetch(`products?take=120${searchSuffix}${includeDeletedSuffix}${lowConfidenceSuffix}${thresholdSuffix}`);
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
    }, [aiConfidenceThreshold, lowConfidenceOnly, moderationResource, moderationSort]);

    useEffect(() => {
        void loadData(activeTab, search, includeDeleted);
    }, [activeTab, includeDeleted, loadData, lowConfidenceOnly, aiConfidenceThreshold, search]);

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
        item: { resource: 'posts' | 'events' | 'pollution' | 'products'; id: string },
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

    const handleQueueLowConfidence = async () => {
        setQueueingLowConfidence(true);
        try {
            const thresholdValue = Number(aiConfidenceThreshold);
            const threshold = Number.isFinite(thresholdValue) ? thresholdValue : 0.6;
            const res = await adminFetch('products/queue-low-confidence', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ threshold, includeDeleted }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error ?? 'Không thể đưa tin vào hàng chờ kiểm duyệt');

            alert(`Đã đưa ${Number(data?.queued ?? 0)} tin vào hàng chờ kiểm duyệt.`);
            await Promise.all([
                loadData('products', search, includeDeleted),
                loadData('moderation', search, includeDeleted),
            ]);
        } catch (e: any) {
            alert(e?.message ?? 'Có lỗi khi đưa tin vào hàng chờ kiểm duyệt');
        } finally {
            setQueueingLowConfidence(false);
        }
    };

    const handleQueueSingleProduct = async (productId: string) => {
        try {
            const res = await adminFetch(`products/${productId}/queue-moderation`, { method: 'PATCH' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error ?? 'Không thể đưa tin vào hàng chờ kiểm duyệt');

            await Promise.all([
                loadData('products', search, includeDeleted),
                loadData('moderation', search, includeDeleted),
            ]);
        } catch (e: any) {
            alert(e?.message ?? 'Có lỗi khi đưa tin vào hàng chờ kiểm duyệt');
        }
    };

    const handleCopyAiEvidence = async () => {
        if (!selectedModerationAiDetail) return;

        const evidencePayload = {
            product_id: selectedModerationAiDetail.productId,
            product_title: selectedModerationAiDetail.productTitle,
            confidence: selectedModerationAiDetail.confidence,
            category: selectedModerationAiDetail.category,
            moisture_state: selectedModerationAiDetail.moisture_state,
            impurity_level: selectedModerationAiDetail.impurity_level,
            summary: selectedModerationAiDetail.summary,
            provider: selectedModerationAiDetail.provider,
            model: selectedModerationAiDetail.model,
            moderation_reason: selectedModerationAiDetail.moderation_reason,
            queued_at: selectedModerationAiDetail.queued_at,
        };

        try {
            const canonicalEvidence = JSON.stringify(evidencePayload);
            const digestBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalEvidence));
            const evidenceSha256 = Array.from(new Uint8Array(digestBuffer))
                .map((byte) => byte.toString(16).padStart(2, '0'))
                .join('');

            const signedEvidence = {
                metadata: {
                    hash_algorithm: 'SHA-256',
                    generated_at: new Date().toISOString(),
                },
                evidence: evidencePayload,
                signature: {
                    evidence_sha256: evidenceSha256,
                },
            };

            await navigator.clipboard.writeText(JSON.stringify(signedEvidence, null, 2));
            setCopyEvidenceState('copied');
            window.setTimeout(() => setCopyEvidenceState('idle'), 1500);
        } catch {
            setCopyEvidenceState('error');
            window.setTimeout(() => setCopyEvidenceState('idle'), 1800);
        }
    };

    const handleDownloadAiEvidence = async () => {
        if (!selectedModerationAiDetail) return;

        const evidencePayload = {
            product_id: selectedModerationAiDetail.productId,
            product_title: selectedModerationAiDetail.productTitle,
            confidence: selectedModerationAiDetail.confidence,
            category: selectedModerationAiDetail.category,
            moisture_state: selectedModerationAiDetail.moisture_state,
            impurity_level: selectedModerationAiDetail.impurity_level,
            summary: selectedModerationAiDetail.summary,
            provider: selectedModerationAiDetail.provider,
            model: selectedModerationAiDetail.model,
            moderation_reason: selectedModerationAiDetail.moderation_reason,
            queued_at: selectedModerationAiDetail.queued_at,
        };

        try {
            const canonicalEvidence = JSON.stringify(evidencePayload);
            const digestBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalEvidence));
            const evidenceSha256 = Array.from(new Uint8Array(digestBuffer))
                .map((byte) => byte.toString(16).padStart(2, '0'))
                .join('');

            const signedEvidence = {
                metadata: {
                    hash_algorithm: 'SHA-256',
                    generated_at: new Date().toISOString(),
                },
                evidence: evidencePayload,
                signature: {
                    evidence_sha256: evidenceSha256,
                },
            };

            const blob = new Blob([JSON.stringify(signedEvidence, null, 2)], { type: 'application/json;charset=utf-8' });
            const objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            const safeProductId = selectedModerationAiDetail.productId.replace(/[^a-zA-Z0-9_-]/g, '_');
            anchor.href = objectUrl;
            anchor.download = `ai-evidence-${safeProductId}.json`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(objectUrl);

            setDownloadEvidenceState('downloaded');
            window.setTimeout(() => setDownloadEvidenceState('idle'), 1500);
        } catch {
            setDownloadEvidenceState('error');
            window.setTimeout(() => setDownloadEvidenceState('idle'), 1800);
        }
    };

    const handleVerifyAiEvidenceFromRaw = async (rawInput: string) => {
        const raw = rawInput.trim();
        if (!raw) {
            setVerifyState('error');
            setVerifyMessage('Vui lòng dán JSON evidence để xác minh.');
            return;
        }

        try {
            const parsed = JSON.parse(raw) as any;
            const evidence = parsed?.evidence;
            const signature = String(parsed?.signature?.evidence_sha256 ?? '').toLowerCase();

            if (!evidence || !signature) {
                setVerifyState('error');
                setVerifyMessage('JSON thiếu trường evidence hoặc signature.evidence_sha256.');
                return;
            }

            const canonicalEvidence = JSON.stringify(evidence);
            const digestBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalEvidence));
            const calculatedHash = Array.from(new Uint8Array(digestBuffer))
                .map((byte) => byte.toString(16).padStart(2, '0'))
                .join('');

            if (calculatedHash === signature) {
                setVerifyState('valid');
                setVerifyMessage(`Hợp lệ. SHA-256: ${calculatedHash}`);
            } else {
                setVerifyState('invalid');
                setVerifyMessage(`Không hợp lệ. Hash tính lại: ${calculatedHash}`);
            }
        } catch {
            setVerifyState('error');
            setVerifyMessage('JSON không hợp lệ hoặc không thể xử lý.');
        }
    };

    const handleVerifyAiEvidence = async () => {
        await handleVerifyAiEvidenceFromRaw(verifyInput);
    };

    const parseEvidenceToAiDetail = (rawInput: string): ModerationProductAiDetail | null => {
        try {
            const parsed = JSON.parse(rawInput) as any;
            const evidence = parsed?.evidence;
            if (!evidence || typeof evidence !== 'object') return null;

            const parsedConfidence = Number(evidence.confidence ?? 0);

            return {
                productId: String(evidence.product_id ?? 'evidence-file'),
                productTitle: String(evidence.product_title ?? 'Evidence nạp từ file'),
                confidence: Number.isFinite(parsedConfidence) ? parsedConfidence : 0,
                category: typeof evidence.category === 'string' ? evidence.category : undefined,
                moisture_state: typeof evidence.moisture_state === 'string' ? evidence.moisture_state : undefined,
                impurity_level: typeof evidence.impurity_level === 'string' ? evidence.impurity_level : undefined,
                summary: typeof evidence.summary === 'string' ? evidence.summary : undefined,
                provider: typeof evidence.provider === 'string' ? evidence.provider : undefined,
                model: typeof evidence.model === 'string' ? evidence.model : undefined,
                moderation_reason: typeof evidence.moderation_reason === 'string' ? evidence.moderation_reason : undefined,
                queued_at: typeof evidence.queued_at === 'string' ? evidence.queued_at : undefined,
            };
        } catch {
            return null;
        }
    };

    const handleUseLoadedEvidence = () => {
        if (!loadedEvidenceDetail) return;
        setSelectedModerationAiDetail(loadedEvidenceDetail);
    };

    const handleLoadEvidenceFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0];
        if (!selectedFile) return;

        try {
            const text = await selectedFile.text();
            const parsedDetail = parseEvidenceToAiDetail(text);
            if (!parsedDetail) {
                throw new Error('INVALID_EVIDENCE_FILE');
            }

            setVerifyInput(text);
            setLoadedEvidenceDetail(parsedDetail);
            await handleVerifyAiEvidenceFromRaw(text);
            setVerifyFileState('loaded');
            window.setTimeout(() => setVerifyFileState('idle'), 1500);
        } catch {
            setLoadedEvidenceDetail(null);
            setVerifyFileState('error');
            setVerifyState('error');
            setVerifyMessage('Không đọc được file JSON evidence.');
            window.setTimeout(() => setVerifyFileState('idle'), 1800);
        } finally {
            if (event.target) {
                event.target.value = '';
            }
        }
    };

    const isModerationTab = activeTab === 'products' || activeTab === 'posts' || activeTab === 'events' || activeTab === 'pollution';
    const isProductsModerationView = activeTab === 'moderation' && moderationResource === 'products';

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

                        {activeTab !== 'dashboard' && activeTab !== 'future' && activeTab !== 'analytics' && (
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

                                {activeTab === 'products' && (
                                    <>
                                        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                            <input
                                                type="checkbox"
                                                checked={lowConfidenceOnly}
                                                onChange={(e) => setLowConfidenceOnly(e.target.checked)}
                                                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                            />
                                            Chỉ tin AI độ tin cậy thấp
                                        </label>
                                        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                            Ngưỡng
                                            <input
                                                type="number"
                                                min={0}
                                                max={1}
                                                step={0.05}
                                                value={aiConfidenceThreshold}
                                                onChange={(e) => setAiConfidenceThreshold(e.target.value)}
                                                className="w-20 px-2 py-1 rounded-md border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                                            />
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => void handleQueueLowConfidence()}
                                            disabled={queueingLowConfidence}
                                            className="px-3 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-60"
                                        >
                                            {queueingLowConfidence ? 'Đang chuyển...' : 'Đưa tin đỏ vào hàng chờ'}
                                        </button>
                                    </>
                                )}

                                {activeTab === 'moderation' && (
                                    <>
                                        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                            Nguồn
                                            <select
                                                value={moderationResource}
                                                onChange={(e) => setModerationResource(e.target.value as ModerationResourceFilter)}
                                                className="px-2 py-1 rounded-md border border-slate-200 bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                                            >
                                                <option value="all">Tất cả ({moderationCounts.all})</option>
                                                <option value="products">Products (AI) ({moderationCounts.products})</option>
                                                <option value="posts">Posts ({moderationCounts.posts})</option>
                                                <option value="events">Events ({moderationCounts.events})</option>
                                                <option value="pollution">Pollution ({moderationCounts.pollution})</option>
                                            </select>
                                        </label>
                                        {moderationResource === 'products' && (
                                            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                                Sắp xếp
                                                <select
                                                    value={moderationSort}
                                                    onChange={(e) => setModerationSort(e.target.value as ModerationSortMode)}
                                                    className="px-2 py-1 rounded-md border border-slate-200 bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                                                >
                                                    <option value="newest">Mới nhất</option>
                                                    <option value="risk_desc">Rủi ro cao trước</option>
                                                </select>
                                            </label>
                                        )}
                                    </>
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

                    {isProductsModerationView && selectedModerationAiDetail && (
                        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-slate-700">
                            <div className="flex items-center justify-between gap-3 mb-2">
                                <div className="font-semibold text-emerald-800">AI Evidence: {selectedModerationAiDetail.productTitle}</div>
                                <div className="inline-flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void handleCopyAiEvidence()}
                                        className="px-2 py-1 rounded-md border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-100 text-xs font-medium"
                                        title="Sao chép AI evidence JSON"
                                        aria-label="Sao chép AI evidence JSON"
                                    >
                                        {copyEvidenceState === 'copied'
                                            ? 'Đã sao chép'
                                            : copyEvidenceState === 'error'
                                                ? 'Lỗi copy'
                                                : 'Sao chép JSON'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void handleDownloadAiEvidence()}
                                        className="px-2 py-1 rounded-md border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-100 text-xs font-medium"
                                        title="Tải xuống AI evidence JSON"
                                        aria-label="Tải xuống AI evidence JSON"
                                    >
                                        {downloadEvidenceState === 'downloaded'
                                            ? 'Đã tải'
                                            : downloadEvidenceState === 'error'
                                                ? 'Lỗi tải'
                                                : 'Tải JSON'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedModerationAiDetail(null)}
                                        className="text-slate-500 hover:text-slate-700"
                                        title="Đóng"
                                        aria-label="Đóng"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <div>Confidence: <span className="font-medium">{Math.round((selectedModerationAiDetail.confidence ?? 0) * 100)}%</span></div>
                                <div>Category: <span className="font-medium">{selectedModerationAiDetail.category ?? '—'}</span></div>
                                <div>Moisture: <span className="font-medium">{selectedModerationAiDetail.moisture_state ?? '—'}</span></div>
                                <div>Impurity: <span className="font-medium">{selectedModerationAiDetail.impurity_level ?? '—'}</span></div>
                                <div>Provider: <span className="font-medium">{selectedModerationAiDetail.provider ?? '—'}</span></div>
                                <div>Model: <span className="font-medium">{selectedModerationAiDetail.model ?? '—'}</span></div>
                            </div>
                            {selectedModerationAiDetail.summary && (
                                <p className="mt-2 text-slate-700">{selectedModerationAiDetail.summary}</p>
                            )}
                            {selectedModerationAiDetail.moderation_reason && (
                                <p className="mt-1 text-xs text-slate-500">Queue reason: {selectedModerationAiDetail.moderation_reason}</p>
                            )}

                            <div className="mt-3 border-t border-emerald-200 pt-3">
                                <div className="text-xs font-semibold text-slate-700 mb-1">Xác minh hash evidence</div>
                                <textarea
                                    value={verifyInput}
                                    onChange={(e) => {
                                        setVerifyInput(e.target.value);
                                        if (verifyState !== 'idle') {
                                            setVerifyState('idle');
                                            setVerifyMessage(null);
                                        }
                                    }}
                                    rows={4}
                                    placeholder="Dán JSON evidence đã xuất ở đây..."
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                                />
                                <div className="mt-2 flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void handleVerifyAiEvidence()}
                                        className="px-2 py-1 rounded-md border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-100 text-xs font-medium"
                                    >
                                        Xác minh hash
                                    </button>
                                    <label className="px-2 py-1 rounded-md border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-100 text-xs font-medium cursor-pointer">
                                        Nạp file JSON
                                        <input
                                            type="file"
                                            accept=".json,application/json"
                                            onChange={(e) => void handleLoadEvidenceFile(e)}
                                            className="hidden"
                                        />
                                    </label>
                                    {loadedEvidenceDetail && (
                                        <button
                                            type="button"
                                            onClick={handleUseLoadedEvidence}
                                            className="px-2 py-1 rounded-md border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-100 text-xs font-medium"
                                        >
                                            Dùng evidence đã nạp
                                        </button>
                                    )}
                                    {verifyFileState === 'loaded' && <span className="text-xs text-emerald-700">Đã nạp file</span>}
                                    {verifyFileState === 'error' && <span className="text-xs text-red-700">Lỗi nạp file</span>}
                                    {verifyMessage && (
                                        <span
                                            className={`text-xs ${verifyState === 'valid'
                                                ? 'text-emerald-700'
                                                : verifyState === 'invalid'
                                                    ? 'text-red-700'
                                                    : 'text-amber-700'
                                                }`}
                                        >
                                            {verifyMessage}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

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

                    {activeTab === 'analytics' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                <StatCard label="Users" value={analyticsOverview?.kpis?.totalUsers ?? 0} />
                                <StatCard label="Products" value={analyticsOverview?.kpis?.totalProducts ?? 0} />
                                <StatCard label="Pending" value={analyticsOverview?.kpis?.pendingModeration ?? 0} />
                                <StatCard label="Failed login 1h" value={analyticsOverview?.kpis?.failedLogins1h ?? 0} />
                                <StatCard label="Locked users" value={analyticsOverview?.kpis?.lockedUsers ?? 0} />
                                <StatCard label="SLA health" value={sla?.health ?? '-'} />
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                <div className="border border-slate-100 rounded-xl p-4">
                                    <h3 className="font-semibold text-slate-900 mb-3 inline-flex items-center gap-2"><Bell size={16} /> Cảnh báo hệ thống</h3>
                                    <div className="space-y-2">
                                        {alerts.map((alert) => (
                                            <div key={alert.id} className={`rounded-lg px-3 py-2 text-sm border ${alert.level === 'critical' ? 'border-red-200 bg-red-50 text-red-700' : alert.level === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>
                                                <div className="font-medium">{alert.title}</div>
                                                <div>{alert.detail}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="border border-slate-100 rounded-xl p-4">
                                    <h3 className="font-semibold text-slate-900 mb-3">SLA Snapshot</h3>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div className="text-slate-600">Availability</div>
                                        <div className="font-medium text-slate-800">{sla?.availabilityPercent ?? 0}%</div>
                                        <div className="text-slate-600">5xx Error</div>
                                        <div className="font-medium text-slate-800">{sla?.serverErrorPercent ?? 0}%</div>
                                        <div className="text-slate-600">Avg Latency</div>
                                        <div className="font-medium text-slate-800">{sla?.avgLatencyMs ?? 0}ms</div>
                                        <div className="text-slate-600">Max Latency</div>
                                        <div className="font-medium text-slate-800">{sla?.maxLatencyMs ?? 0}ms</div>
                                        <div className="text-slate-600">Total Requests</div>
                                        <div className="font-medium text-slate-800">{sla?.totalRequests ?? 0}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                <div className="border border-slate-100 rounded-xl p-4">
                                    <h3 className="font-semibold text-slate-900 mb-3">Timeline 14 ngày</h3>
                                    <AdminTable headers={['Ngày', 'Users mới', 'Admin actions']}>
                                        {(analyticsOverview?.timeline ?? []).map((row: any) => (
                                            <tr key={row.date} className="border-b border-slate-100">
                                                <td className="py-2 px-2 text-slate-700">{row.date}</td>
                                                <td className="py-2 px-2 text-slate-700">{row.usersCreated}</td>
                                                <td className="py-2 px-2 text-slate-700">{row.adminActions}</td>
                                            </tr>
                                        ))}
                                    </AdminTable>
                                </div>

                                <div className="border border-slate-100 rounded-xl p-4">
                                    <h3 className="font-semibold text-slate-900 mb-3">Audit Summary</h3>
                                    <div className="text-sm text-slate-600 mb-2">Tổng thao tác: <span className="font-medium text-slate-800">{auditSummary?.totalActions ?? 0}</span></div>
                                    <AdminTable headers={['Action', 'Số lần']}>
                                        {(auditSummary?.topActions ?? []).map((item: any) => (
                                            <tr key={item.action} className="border-b border-slate-100">
                                                <td className="py-2 px-2 text-slate-700">{item.action}</td>
                                                <td className="py-2 px-2 text-slate-700">{item.count}</td>
                                            </tr>
                                        ))}
                                    </AdminTable>
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
                        <AdminTable headers={isProductsModerationView ? ['Loại', 'Nội dung', 'AI', 'Tác giả/Nguồn', 'Tạo lúc', ''] : ['Loại', 'Nội dung', 'Tác giả/Nguồn', 'Tạo lúc', '']}>
                            {moderationQueue.map((item) => (
                                <tr key={`${item.resource}-${item.id}`} className="border-b border-slate-100">
                                    <td className="py-2 px-2 text-slate-700 uppercase text-xs">{item.resource}</td>
                                    <td className="py-2 px-2 text-slate-800 max-w-[420px] line-clamp-2">{item.title}</td>
                                    {isProductsModerationView && (
                                        <td className="py-2 px-2 text-slate-600">
                                            {typeof item.riskScore === 'number' ? (
                                                (() => {
                                                    const confidence = Number(item.riskScore);
                                                    const confidencePct = Math.round(confidence * 100);
                                                    const isHighRisk = confidence < 0.6;
                                                    return (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (item.resource !== 'products') return;
                                                                const ai = item.ai ?? {};
                                                                setSelectedModerationAiDetail({
                                                                    productId: item.id,
                                                                    productTitle: item.title,
                                                                    confidence: Number(ai.confidence ?? confidence),
                                                                    category: ai.category,
                                                                    moisture_state: ai.moisture_state,
                                                                    impurity_level: ai.impurity_level,
                                                                    summary: ai.summary,
                                                                    provider: ai.provider,
                                                                    model: ai.model,
                                                                    moderation_reason: ai.moderation_reason,
                                                                    queued_at: ai.queued_at,
                                                                });
                                                            }}
                                                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${isHighRisk
                                                                ? 'bg-red-100 text-red-700 border border-red-200'
                                                                : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                                                } hover:opacity-90`}
                                                            title="Xem AI evidence"
                                                            aria-label="Xem AI evidence"
                                                        >
                                                            {confidencePct}%
                                                        </button>
                                                    );
                                                })()
                                            ) : (
                                                <span className="text-xs text-slate-400">—</span>
                                            )}
                                        </td>
                                    )}
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
                        <AdminTable headers={['Tiêu đề', 'Người bán', 'Danh mục', 'Giá', 'AI', 'Trạng thái', '']}>
                            {products.map((item) => (
                                <tr key={item.id} className="border-b border-slate-100">
                                    <td className="py-2 px-2 text-slate-800">{item.title}</td>
                                    <td className="py-2 px-2 text-slate-600">{item.seller?.name}</td>
                                    <td className="py-2 px-2 text-slate-600">{item.category}</td>
                                    <td className="py-2 px-2 text-slate-600">{new Intl.NumberFormat('vi-VN').format(item.priceVnd)}đ</td>
                                    <td className="py-2 px-2 text-slate-600">
                                        {item.aiAssessment ? (
                                            (() => {
                                                const confidence = Number(item.aiAssessment.confidence ?? 0);
                                                const confidencePct = Math.round(confidence * 100);
                                                const isLowConfidence = confidence < aiThresholdValue;
                                                return (
                                                    <span
                                                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${isLowConfidence
                                                            ? 'bg-red-100 text-red-700 border border-red-200'
                                                            : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                                            }`}
                                                    >
                                                        {isLowConfidence ? `Thấp ${confidencePct}%` : `${confidencePct}%`}
                                                    </span>
                                                );
                                            })()
                                        ) : (
                                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                                Chưa có
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-2 px-2 text-slate-600">
                                        {item.deletedAt
                                            ? 'Đã xóa mềm'
                                            : item.aiAssessment?.moderationStatus === 'PENDING'
                                                ? 'Chờ duyệt AI'
                                                : 'Đang hiển thị'}
                                    </td>
                                    <td className="py-2 px-2 text-right">
                                        <div className="inline-flex items-center gap-2">
                                            {!item.deletedAt && item.aiAssessment?.moderationStatus !== 'PENDING' && Number(item.aiAssessment?.confidence ?? 1) < aiThresholdValue && (
                                                <button
                                                    onClick={() => void handleQueueSingleProduct(item.id)}
                                                    title="Đưa vào hàng chờ kiểm duyệt"
                                                    aria-label="Đưa vào hàng chờ kiểm duyệt"
                                                    className="text-amber-600 hover:text-amber-700"
                                                >
                                                    <Shield size={16} />
                                                </button>
                                            )}
                                            {item.deletedAt ? (
                                                <button onClick={() => void handleRestore('products', item.id)} title="Khôi phục sản phẩm" aria-label="Khôi phục sản phẩm" className="text-emerald-600 hover:text-emerald-700"><RotateCcw size={16} /></button>
                                            ) : (
                                                <button onClick={() => void handleDelete('products', item.id)} title="Xóa sản phẩm" aria-label="Xóa sản phẩm" className="text-red-500 hover:text-red-600"><Trash2 size={16} /></button>
                                            )}
                                        </div>
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

const StatCard: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="text-2xl font-bold text-slate-900 mt-1">{value}</div>
    </div>
);

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
