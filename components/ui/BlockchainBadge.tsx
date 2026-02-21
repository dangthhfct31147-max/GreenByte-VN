import React, { useState, useEffect } from 'react';
import { Shield, ExternalLink, Copy, CheckCircle, Loader2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '@/utils/api';

interface BlockchainBadgeProps {
    productId: string;
    compact?: boolean;
}

interface BlockchainRecord {
    txHash: string;
    ipfsHash: string;
    ipfsUrl: string;
    explorerUrl: string;
    contractAddress: string;
    chainId: number;
    walletAddress: string;
    status: string;
    createdAt: string;
    onChainVerified: boolean;
}

export function BlockchainBadge({ productId, compact = false }: BlockchainBadgeProps) {
    const [record, setRecord] = useState<BlockchainRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        async function fetchRecord() {
            try {
                const res = await apiFetch(`/api/blockchain/record/${productId}`);
                if (res.ok) {
                    const data = await res.json();
                    setRecord(data.record);
                }
            } catch { /* not registered */ }
            setLoading(false);
        }
        fetchRecord();
    }, [productId]);

    if (loading || !record) return null;

    const copyTx = async () => {
        await navigator.clipboard.writeText(record.txHash);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (compact) {
        return (
            <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#fff',
                    border: '1px solid rgba(16,185,129,0.3)',
                    boxShadow: '0 0 8px rgba(16,185,129,0.25)',
                }}
            >
                <Shield size={10} />
                On-chain
            </button>
        );
    }

    return (
        <>
            <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all hover:scale-[1.02]"
                style={{
                    background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
                    color: '#fff',
                    border: '1px solid rgba(16,185,129,0.4)',
                    boxShadow: '0 2px 12px rgba(16,185,129,0.3)',
                }}
            >
                <Shield size={14} />
                <span>✓ Đã xác thực Blockchain</span>
                {record.onChainVerified && <CheckCircle size={12} className="text-emerald-200" />}
            </button>

            {/* Detail Modal */}
            <AnimatePresence>
                {showModal && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
                        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
                        onClick={() => setShowModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            className="w-full max-w-md rounded-2xl p-6 relative"
                            style={{
                                background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 100%)',
                                border: '1px solid rgba(16,185,129,0.3)',
                                boxShadow: '0 0 40px rgba(16,185,129,0.15)',
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white">
                                <X size={20} />
                            </button>

                            <div className="text-center mb-6">
                                <div className="w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center"
                                    style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 0 20px rgba(16,185,129,0.4)' }}>
                                    <Shield size={28} className="text-white" />
                                </div>
                                <h3 className="text-xl font-bold text-white">Chứng nhận Blockchain</h3>
                                <p className="text-sm text-emerald-400 mt-1">Hồ sơ bất biến trên Polygon</p>
                            </div>

                            <div className="space-y-3">
                                {/* TX Hash */}
                                <div className="bg-slate-800/60 rounded-lg p-3">
                                    <div className="text-xs text-gray-400 mb-1">Transaction Hash</div>
                                    <div className="flex items-center gap-2">
                                        <code className="text-xs text-emerald-300 break-all flex-1">{record.txHash}</code>
                                        <button onClick={copyTx} className="text-gray-400 hover:text-emerald-400 shrink-0">
                                            {copied ? <CheckCircle size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                        </button>
                                    </div>
                                </div>

                                {/* IPFS Hash */}
                                <div className="bg-slate-800/60 rounded-lg p-3">
                                    <div className="text-xs text-gray-400 mb-1">IPFS Content Hash</div>
                                    <code className="text-xs text-blue-300 break-all">{record.ipfsHash}</code>
                                </div>

                                {/* Status */}
                                <div className="flex gap-3">
                                    <div className="flex-1 bg-slate-800/60 rounded-lg p-3 text-center">
                                        <div className="text-xs text-gray-400">Mạng</div>
                                        <div className="text-sm font-semibold text-white mt-1">
                                            {record.chainId === 80002 ? 'Polygon Amoy' : 'Polygon'}
                                        </div>
                                    </div>
                                    <div className="flex-1 bg-slate-800/60 rounded-lg p-3 text-center">
                                        <div className="text-xs text-gray-400">Trạng thái</div>
                                        <div className="text-sm font-semibold text-emerald-400 mt-1 flex items-center justify-center gap-1">
                                            <CheckCircle size={12} /> {record.status}
                                        </div>
                                    </div>
                                </div>

                                {/* Timestamp */}
                                <div className="bg-slate-800/60 rounded-lg p-3">
                                    <div className="text-xs text-gray-400 mb-1">Thời gian đăng ký</div>
                                    <div className="text-sm text-white">{new Date(record.createdAt).toLocaleString('vi-VN')}</div>
                                </div>

                                {/* Links */}
                                <div className="flex gap-2 mt-4">
                                    <a
                                        href={record.explorerUrl} target="_blank" rel="noopener noreferrer"
                                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:brightness-110"
                                        style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
                                    >
                                        <ExternalLink size={14} /> PolygonScan
                                    </a>
                                    <a
                                        href={record.ipfsUrl} target="_blank" rel="noopener noreferrer"
                                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:brightness-110"
                                        style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
                                    >
                                        <ExternalLink size={14} /> IPFS Data
                                    </a>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

/* ─── Register Button (for seller) ─── */

interface RegisterBlockchainButtonProps {
    productId: string;
    productLocation: string;
    onSuccess?: () => void;
}

export function RegisterBlockchainButton({ productId, productLocation, onSuccess }: RegisterBlockchainButtonProps) {
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [origin, setOrigin] = useState(productLocation);
    const [harvestDate, setHarvestDate] = useState(new Date().toISOString().split('T')[0]);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const handleRegister = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await apiFetch(`/api/blockchain/register/${productId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ origin, harvestDate }),
            });

            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Đăng ký thất bại');
                return;
            }

            setResult(data);
            onSuccess?.();
        } catch (err) {
            setError('Lỗi kết nối');
        } finally {
            setLoading(false);
        }
    };

    if (result) {
        return (
            <div className="rounded-xl p-4" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}>
                <div className="flex items-center gap-2 text-emerald-400 mb-2">
                    <CheckCircle size={18} />
                    <span className="font-semibold">{result.message}</span>
                </div>
                <div className="text-xs text-gray-400 space-y-1">
                    <div>🏆 +{result.record.grtReward} GRT earned!</div>
                    <a href={result.record.explorerUrl} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline flex items-center gap-1">
                        <ExternalLink size={10} /> Xem trên PolygonScan
                    </a>
                </div>
            </div>
        );
    }

    return (
        <div>
            {!showForm ? (
                <button
                    onClick={() => setShowForm(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all hover:brightness-110 hover:scale-[1.01]"
                    style={{
                        background: 'linear-gradient(135deg, #10b981 0%, #0d9488 50%, #0891b2 100%)',
                        boxShadow: '0 4px 20px rgba(16,185,129,0.3)',
                    }}
                >
                    <Shield size={16} />
                    🔗 Đăng lên Blockchain
                </button>
            ) : (
                <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(16,185,129,0.2)' }}>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Shield size={14} className="text-emerald-400" />
                        Đăng ký hồ sơ Blockchain
                    </h4>

                    <div>
                        <label className="text-xs text-gray-400 block mb-1">Nguồn gốc / Nông hộ</label>
                        <input
                            type="text" value={origin} onChange={(e) => setOrigin(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-slate-800 text-white text-sm border border-slate-600 focus:border-emerald-500 outline-none"
                            placeholder="VD: Nông hộ Nguyễn Văn A, Cần Thơ"
                        />
                    </div>

                    <div>
                        <label className="text-xs text-gray-400 block mb-1">Ngày thu hoạch</label>
                        <input
                            type="date" value={harvestDate} onChange={(e) => setHarvestDate(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-slate-800 text-white text-sm border border-slate-600 focus:border-emerald-500 outline-none"
                        />
                    </div>

                    {error && <div className="text-xs text-red-400 bg-red-900/20 px-3 py-2 rounded-lg">{error}</div>}

                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowForm(false)}
                            className="flex-1 py-2 rounded-lg text-sm text-gray-400 bg-slate-700 hover:bg-slate-600"
                        >
                            Huỷ
                        </button>
                        <button
                            onClick={handleRegister} disabled={loading || !origin.trim()}
                            className="flex-1 py-2 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                            style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                        >
                            {loading ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
                            {loading ? 'Đang xử lý...' : 'Xác nhận'}
                        </button>
                    </div>

                    <p className="text-xs text-gray-500 text-center">
                        Dữ liệu sẽ được lưu vĩnh viễn trên Polygon blockchain & IPFS
                    </p>
                </div>
            )}
        </div>
    );
}
