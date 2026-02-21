import React, { useState, useEffect } from 'react';
import { Leaf, Trophy, TrendingUp, Clock, ExternalLink, Loader2, ArrowLeft, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { apiFetch } from '@/utils/api';

interface GreenTokenDashboardProps {
    user: { id: string; name: string } | null;
    onBack: () => void;
}

interface GRTHistory {
    id: string;
    amount: number;
    action: string;
    referenceId: string | null;
    txHash: string | null;
    explorerUrl: string | null;
    createdAt: string;
}

interface LeaderboardEntry {
    userId: string;
    userName: string;
    totalGRT: number;
    actionCount: number;
}

interface GRTStats {
    totalMinted: number;
    totalTransactions: number;
    actionBreakdown: { action: string; totalAmount: number; count: number }[];
    recentActivity: { userName: string; amount: number; action: string; createdAt: string }[];
}

const ACTION_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
    LIST_BYPRODUCT: { label: 'Đăng lô phụ phẩm', emoji: '🌾', color: '#10b981' },
    TRANSACTION_SUCCESS: { label: 'Giao dịch thành công', emoji: '🤝', color: '#3b82f6' },
    COLLECTION_EVENT: { label: 'Sự kiện thu gom', emoji: '📦', color: '#f59e0b' },
    PROVE_REUSE: { label: 'Chứng minh tái sử dụng', emoji: '♻️', color: '#8b5cf6' },
};

export function GreenTokenDashboard({ user, onBack }: GreenTokenDashboardProps) {
    const [tab, setTab] = useState<'my' | 'leaderboard' | 'stats'>('my');
    const [balance, setBalance] = useState<{ totalGRT: number; history: GRTHistory[] } | null>(null);
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [stats, setStats] = useState<GRTStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, [tab, user]);

    async function loadData() {
        setLoading(true);
        try {
            if (tab === 'my' && user) {
                const res = await apiFetch(`/api/blockchain/grt/balance/${user.id}`);
                if (res.ok) setBalance(await res.json());
            } else if (tab === 'leaderboard') {
                const res = await apiFetch('/api/blockchain/grt/leaderboard');
                if (res.ok) {
                    const data = await res.json();
                    setLeaderboard(data.leaderboard);
                }
            } else if (tab === 'stats') {
                const res = await apiFetch('/api/blockchain/grt/stats');
                if (res.ok) setStats(await res.json());
            }
        } catch { /* ignore */ }
        setLoading(false);
    }

    return (
        <div className="min-h-screen" style={{ background: 'linear-gradient(180deg, #0f172a 0%, #1a2332 100%)' }}>
            {/* Header */}
            <div className="sticky top-0 z-10 px-4 py-3" style={{ background: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(16,185,129,0.15)' }}>
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="text-gray-400 hover:text-white"><ArrowLeft size={20} /></button>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                            <Leaf size={16} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-white">Green Token (GRT)</h1>
                            <p className="text-xs text-emerald-400">Chứng chỉ tác động môi trường on-chain</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-1 px-4 py-3">
                {[
                    { key: 'my' as const, label: 'Tài khoản', icon: <Leaf size={14} /> },
                    { key: 'leaderboard' as const, label: 'Bảng xếp hạng', icon: <Trophy size={14} /> },
                    { key: 'stats' as const, label: 'Thống kê', icon: <TrendingUp size={14} /> },
                ].map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all"
                        style={{
                            background: tab === t.key ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(51,65,85,0.5)',
                            color: tab === t.key ? '#fff' : '#94a3b8',
                        }}
                    >
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            <div className="px-4 pb-24">
                {loading ? (
                    <div className="flex items-center justify-center py-16 text-gray-400">
                        <Loader2 size={24} className="animate-spin" />
                    </div>
                ) : (
                    <>
                        {/* MY BALANCE TAB */}
                        {tab === 'my' && (
                            <div className="space-y-4">
                                {/* Balance Card */}
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                    className="rounded-2xl p-6 text-center relative overflow-hidden"
                                    style={{
                                        background: 'linear-gradient(145deg, #064e3b 0%, #065f46 50%, #047857 100%)',
                                        boxShadow: '0 8px 32px rgba(16,185,129,0.25)',
                                    }}
                                >
                                    <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #10b981 0%, transparent 70%)', transform: 'translate(30%, -30%)' }} />
                                    <Sparkles size={20} className="text-emerald-300 mx-auto mb-2" />
                                    <div className="text-4xl font-black text-white mb-1">{balance?.totalGRT ?? 0}</div>
                                    <div className="text-sm text-emerald-200 font-medium">Green Token (GRT)</div>
                                    <div className="mt-3 text-xs text-emerald-300/70">
                                        Tổng tích lũy từ hoạt động xanh
                                    </div>
                                </motion.div>

                                {/* Reward Guide */}
                                <div className="rounded-xl p-4" style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(51,65,85,0.5)' }}>
                                    <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                        <Sparkles size={14} className="text-emerald-400" /> Cách kiếm GRT
                                    </h3>
                                    <div className="space-y-2">
                                        {Object.entries(ACTION_LABELS).map(([key, val]) => (
                                            <div key={key} className="flex items-center gap-3 py-2 px-3 rounded-lg" style={{ background: 'rgba(15,23,42,0.5)' }}>
                                                <span className="text-lg">{val.emoji}</span>
                                                <span className="text-xs text-gray-300 flex-1">{val.label}</span>
                                                <span className="text-sm font-bold" style={{ color: val.color }}>
                                                    +{key === 'LIST_BYPRODUCT' ? 10 : key === 'TRANSACTION_SUCCESS' ? 5 : key === 'COLLECTION_EVENT' ? 20 : 8}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* History */}
                                {balance && balance.history.length > 0 && (
                                    <div className="rounded-xl p-4" style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(51,65,85,0.5)' }}>
                                        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                            <Clock size={14} className="text-gray-400" /> Lịch sử giao dịch
                                        </h3>
                                        <div className="space-y-2">
                                            {balance.history.map(entry => {
                                                const actionConf = ACTION_LABELS[entry.action] || { label: entry.action, emoji: '🔗', color: '#94a3b8' };
                                                return (
                                                    <div key={entry.id} className="flex items-center gap-3 py-2 px-3 rounded-lg" style={{ background: 'rgba(15,23,42,0.5)' }}>
                                                        <span className="text-base">{actionConf.emoji}</span>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-xs text-gray-300">{actionConf.label}</div>
                                                            <div className="text-xs text-gray-500">{new Date(entry.createdAt).toLocaleString('vi-VN')}</div>
                                                        </div>
                                                        <span className="text-sm font-bold" style={{ color: actionConf.color }}>+{entry.amount}</span>
                                                        {entry.explorerUrl && (
                                                            <a href={entry.explorerUrl} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300">
                                                                <ExternalLink size={12} />
                                                            </a>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {balance && balance.history.length === 0 && (
                                    <div className="text-center py-8 text-gray-500 text-sm">
                                        Chưa có giao dịch GRT nào. Hãy đăng phụ phẩm lên blockchain để nhận thưởng!
                                    </div>
                                )}
                            </div>
                        )}

                        {/* LEADERBOARD TAB */}
                        {tab === 'leaderboard' && (
                            <div className="space-y-3">
                                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                    <Trophy size={14} className="text-yellow-400" /> Top Người Đóng Góp Xanh
                                </h3>
                                {leaderboard.length === 0 ? (
                                    <div className="text-center py-8 text-gray-500 text-sm">Chưa có dữ liệu</div>
                                ) : (
                                    leaderboard.map((entry, idx) => {
                                        const medals = ['🥇', '🥈', '🥉'];
                                        return (
                                            <motion.div
                                                key={entry.userId}
                                                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: idx * 0.05 }}
                                                className="flex items-center gap-3 p-3 rounded-xl"
                                                style={{
                                                    background: idx < 3
                                                        ? `linear-gradient(135deg, rgba(${idx === 0 ? '234,179,8' : idx === 1 ? '148,163,184' : '180,83,9'},0.15) 0%, rgba(30,41,59,0.8) 100%)`
                                                        : 'rgba(30,41,59,0.6)',
                                                    border: idx < 3 ? `1px solid rgba(${idx === 0 ? '234,179,8' : idx === 1 ? '148,163,184' : '180,83,9'},0.3)` : '1px solid rgba(51,65,85,0.3)',
                                                }}
                                            >
                                                <div className="w-8 h-8 flex items-center justify-center text-lg font-bold">
                                                    {idx < 3 ? medals[idx] : <span className="text-gray-500 text-sm">{idx + 1}</span>}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-semibold text-white truncate">{entry.userName}</div>
                                                    <div className="text-xs text-gray-400">{entry.actionCount} hoạt động</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-lg font-black text-emerald-400">{entry.totalGRT}</div>
                                                    <div className="text-xs text-gray-500">GRT</div>
                                                </div>
                                            </motion.div>
                                        );
                                    })
                                )}
                            </div>
                        )}

                        {/* STATS TAB */}
                        {tab === 'stats' && stats && (
                            <div className="space-y-4">
                                {/* Summary Cards */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(16,185,129,0.2)' }}>
                                        <div className="text-2xl font-black text-emerald-400">{stats.totalMinted}</div>
                                        <div className="text-xs text-gray-400 mt-1">Tổng GRT phát hành</div>
                                    </div>
                                    <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(59,130,246,0.2)' }}>
                                        <div className="text-2xl font-black text-blue-400">{stats.totalTransactions}</div>
                                        <div className="text-xs text-gray-400 mt-1">Tổng giao dịch</div>
                                    </div>
                                </div>

                                {/* Action Breakdown */}
                                <div className="rounded-xl p-4" style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(51,65,85,0.5)' }}>
                                    <h3 className="text-sm font-bold text-white mb-3">Phân bổ theo hành động</h3>
                                    <div className="space-y-3">
                                        {stats.actionBreakdown.map(item => {
                                            const conf = ACTION_LABELS[item.action] || { label: item.action, emoji: '🔗', color: '#94a3b8' };
                                            const pct = stats.totalMinted > 0 ? (item.totalAmount / stats.totalMinted) * 100 : 0;
                                            return (
                                                <div key={item.action}>
                                                    <div className="flex items-center justify-between text-xs mb-1">
                                                        <span className="text-gray-300">{conf.emoji} {conf.label}</span>
                                                        <span style={{ color: conf.color }}>{item.totalAmount} GRT ({item.count}x)</span>
                                                    </div>
                                                    <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
                                                        <motion.div
                                                            initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                                                            className="h-full rounded-full"
                                                            style={{ background: conf.color }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Recent Activity */}
                                <div className="rounded-xl p-4" style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(51,65,85,0.5)' }}>
                                    <h3 className="text-sm font-bold text-white mb-3">Hoạt động gần đây</h3>
                                    <div className="space-y-2">
                                        {stats.recentActivity.map((item, idx) => {
                                            const conf = ACTION_LABELS[item.action] || { label: item.action, emoji: '🔗', color: '#94a3b8' };
                                            return (
                                                <div key={idx} className="flex items-center gap-3 py-2 px-3 rounded-lg" style={{ background: 'rgba(15,23,42,0.4)' }}>
                                                    <span>{conf.emoji}</span>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-xs text-white truncate">{item.userName}</div>
                                                        <div className="text-xs text-gray-500">{conf.label}</div>
                                                    </div>
                                                    <div className="text-sm font-bold" style={{ color: conf.color }}>+{item.amount}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
