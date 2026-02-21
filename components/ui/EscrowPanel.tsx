import React, { useState, useEffect } from 'react';
import { Shield, Clock, CheckCircle, AlertTriangle, ArrowRight, Loader2, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import { apiFetch } from '@/utils/api';

interface EscrowPanelProps {
    inquiryId: string;
    isBuyer: boolean;
    isSeller: boolean;
    onStatusChange?: () => void;
}

interface EscrowData {
    id: string;
    inquiryId: string;
    buyerAddress: string;
    sellerAddress: string;
    amountWei: string;
    txHash: string | null;
    status: string;
    createdAt: string;
    explorerUrl: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; desc: string }> = {
    CREATED: { label: 'Đã tạo', color: '#f59e0b', icon: <Clock size={16} />, desc: 'Đang chờ nạp tiền' },
    FUNDED: { label: 'Đã nạp tiền', color: '#3b82f6', icon: <Shield size={16} />, desc: 'Tiền đang được giữ bởi Smart Contract' },
    COMPLETED: { label: 'Hoàn thành', color: '#10b981', icon: <CheckCircle size={16} />, desc: 'Tiền đã được giải ngân cho người bán' },
    DISPUTED: { label: 'Tranh chấp', color: '#ef4444', icon: <AlertTriangle size={16} />, desc: 'Tiền bị khoá, đang chờ trọng tài xử lý' },
    REFUNDED: { label: 'Hoàn tiền', color: '#8b5cf6', icon: <ArrowRight size={16} />, desc: 'Tiền đã được hoàn lại cho người mua' },
};

const STEPS = ['CREATED', 'FUNDED', 'COMPLETED'];

export function EscrowPanel({ inquiryId, isBuyer, isSeller, onStatusChange }: EscrowPanelProps) {
    const [escrow, setEscrow] = useState<EscrowData | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchEscrow();
    }, [inquiryId]);

    async function fetchEscrow() {
        try {
            const res = await apiFetch(`/api/blockchain/escrow/${inquiryId}`);
            if (res.ok) {
                const data = await res.json();
                setEscrow(data.escrow);
            }
        } catch { /* no escrow */ }
        setLoading(false);
    }

    async function handleConfirmDelivery() {
        if (!escrow) return;
        setActionLoading(true);
        setError(null);
        try {
            const res = await apiFetch(`/api/blockchain/escrow/${escrow.id}/confirm`, { method: 'POST' });
            const data = await res.json();
            if (!res.ok) { setError(data.error); return; }
            await fetchEscrow();
            onStatusChange?.();
        } catch { setError('Lỗi kết nối'); }
        finally { setActionLoading(false); }
    }

    async function handleDispute() {
        if (!escrow) return;
        setActionLoading(true);
        setError(null);
        try {
            const res = await apiFetch(`/api/blockchain/escrow/${escrow.id}/dispute`, { method: 'POST' });
            const data = await res.json();
            if (!res.ok) { setError(data.error); return; }
            await fetchEscrow();
            onStatusChange?.();
        } catch { setError('Lỗi kết nối'); }
        finally { setActionLoading(false); }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-4 text-gray-400 text-sm">
                <Loader2 size={16} className="animate-spin mr-2" /> Đang tải escrow...
            </div>
        );
    }

    if (!escrow) return null;

    const statusConf = STATUS_CONFIG[escrow.status] || STATUS_CONFIG.CREATED;
    const currentStep = STEPS.indexOf(escrow.status);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl p-4"
            style={{
                background: 'linear-gradient(145deg, rgba(15,23,42,0.9) 0%, rgba(30,41,59,0.9) 100%)',
                border: `1px solid ${statusConf.color}33`,
                boxShadow: `0 0 20px ${statusConf.color}15`,
            }}
        >
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ background: `${statusConf.color}20`, color: statusConf.color }}>
                    {statusConf.icon}
                </div>
                <div>
                    <h4 className="text-sm font-bold text-white">Smart Contract Escrow</h4>
                    <p className="text-xs" style={{ color: statusConf.color }}>{statusConf.label} — {statusConf.desc}</p>
                </div>
            </div>

            {/* Progress Timeline */}
            <div className="flex items-center gap-1 mb-4 px-2">
                {STEPS.map((step, i) => {
                    const isActive = i <= currentStep;
                    const isDisputed = escrow.status === 'DISPUTED';
                    return (
                        <React.Fragment key={step}>
                            <div
                                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                                style={{
                                    background: isDisputed && i > 0 ? '#ef444433' :
                                        isActive ? `${statusConf.color}` : '#334155',
                                    color: isActive ? '#fff' : '#64748b',
                                }}
                            >
                                {isActive ? '✓' : i + 1}
                            </div>
                            {i < STEPS.length - 1 && (
                                <div className="flex-1 h-0.5 rounded" style={{
                                    background: isActive && i < currentStep ? statusConf.color : '#334155',
                                }} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>

            {/* Amount */}
            <div className="bg-slate-800/60 rounded-lg p-3 mb-3 flex items-center justify-between">
                <span className="text-xs text-gray-400">Số tiền giữ</span>
                <span className="text-sm font-bold text-white">
                    {escrow.amountWei ? `${(Number(escrow.amountWei) / 1e18).toFixed(4)} MATIC` : '—'}
                </span>
            </div>

            {/* Error */}
            {error && (
                <div className="text-xs text-red-400 bg-red-900/20 px-3 py-2 rounded-lg mb-3">{error}</div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
                {isBuyer && escrow.status === 'FUNDED' && (
                    <button
                        onClick={handleConfirmDelivery} disabled={actionLoading}
                        className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                    >
                        {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                        Xác nhận giao hàng
                    </button>
                )}

                {(isBuyer || isSeller) && escrow.status === 'FUNDED' && (
                    <button
                        onClick={handleDispute} disabled={actionLoading}
                        className="py-2.5 px-4 rounded-lg text-sm font-bold text-red-400 flex items-center justify-center gap-2 disabled:opacity-50"
                        style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
                    >
                        <AlertTriangle size={14} /> Tranh chấp
                    </button>
                )}
            </div>

            {/* Explorer Link */}
            {escrow.explorerUrl && (
                <a
                    href={escrow.explorerUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1 text-xs text-violet-400 hover:text-violet-300 mt-3"
                >
                    <ExternalLink size={10} /> Xem giao dịch trên PolygonScan
                </a>
            )}
        </motion.div>
    );
}
