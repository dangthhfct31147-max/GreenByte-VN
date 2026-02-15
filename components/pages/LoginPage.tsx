import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Loader2, ShieldCheck, Timer, ArrowLeft } from 'lucide-react';
import { apiFetch, setAuthToken } from '@/utils/api';

type LoginStep1Response = {
    totpRequired: boolean;
    token?: string;
    challengeId?: string;
    expiresAt?: string;
    user?: { id: string; email: string; name: string };
};

type VerifyResponse = {
    token?: string;
    user: { id: string; email: string; name: string };
};

function formatSeconds(totalSeconds: number) {
    const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const ss = String(totalSeconds % 60).padStart(2, '0');
    return `${mm}:${ss}`;
}

export const LoginPage = ({
    onLoginSuccess,
}: {
    onLoginSuccess: (args: { user: { id: string; email: string; name: string } }) => void;
}) => {
    const [step, setStep] = useState<1 | 2>(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const [challengeId, setChallengeId] = useState<string | null>(null);
    const [expiresAt, setExpiresAt] = useState<number | null>(null);
    const [code, setCode] = useState('');

    const secondsLeft = useMemo(() => {
        if (!expiresAt) return 0;
        return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    }, [expiresAt]);

    useEffect(() => {
        if (step !== 2 || !expiresAt) return;
        const t = window.setInterval(() => {
            // force re-render for countdown
            setExpiresAt((prev) => (typeof prev === 'number' ? prev : prev));
        }, 1000);
        return () => window.clearInterval(t);
    }, [step, expiresAt]);

    const startLoginChallenge = async () => {
        setLoading(true);
        setError(null);

        try {
            const res = await apiFetch('auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = (await res.json()) as any;
            if (!res.ok) throw new Error(data?.error ?? 'Đăng nhập thất bại');

            const parsed = data as LoginStep1Response;
            if (!parsed.totpRequired && parsed.user) {
                if (parsed.token) {
                    setAuthToken(parsed.token);
                }
                onLoginSuccess({ user: parsed.user });
                return;
            }

            if (!parsed.challengeId || !parsed.expiresAt) {
                throw new Error('Thiếu dữ liệu challenge TOTP từ server');
            }
            setChallengeId(parsed.challengeId);
            setExpiresAt(new Date(parsed.expiresAt).getTime());
            setCode('');
            setStep(2);
        } catch (e: any) {
            setError(e?.message ?? 'Có lỗi xảy ra');
        } finally {
            setLoading(false);
        }
    };

    const verifyTotp = async () => {
        if (!challengeId) return;

        setLoading(true);
        setError(null);

        try {
            const res = await apiFetch('auth/login/totp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ challengeId, code }),
            });

            const data = (await res.json()) as any;
            if (!res.ok) throw new Error(data?.error ?? 'Mã xác thực không hợp lệ');

            const parsed = data as VerifyResponse;
            if (parsed.token) {
                setAuthToken(parsed.token);
            }
            onLoginSuccess({ user: parsed.user });
        } catch (e: any) {
            setError(e?.message ?? 'Có lỗi xảy ra');
        } finally {
            setLoading(false);
        }
    };

    const expired = step === 2 && secondsLeft <= 0;

    return (
        <div className="min-h-[calc(100vh-64px)] flex items-center justify-center py-12 px-4 select-none">
            <div className="w-full max-w-md">
                <div className="bg-white p-8 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100">
                    <div className="flex items-start justify-between gap-4 mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Đăng nhập</h2>
                            <p className="text-slate-500 text-sm mt-1">
                                {step === 1
                                    ? 'Nhập email và mật khẩu để bắt đầu.'
                                    : 'Nhập mã TOTP trong 2 phút để hoàn tất.'}
                            </p>
                        </div>
                        {step === 2 && (
                            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${expired ? 'border-red-200 bg-red-50' : 'border-emerald-100 bg-emerald-50'}`}>
                                <Timer size={16} className={expired ? 'text-red-500' : 'text-emerald-600'} />
                                <span className={`text-sm font-semibold tabular-nums ${expired ? 'text-red-600' : 'text-emerald-700'}`}>{formatSeconds(secondsLeft)}</span>
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (loading) return;
                            if (step === 1) startLoginChallenge();
                            else verifyTotp();
                        }}
                    >
                        <AnimatePresence mode="wait">
                            {step === 1 ? (
                                <motion.div
                                    key="step1"
                                    initial={{ opacity: 0, x: -16 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 16 }}
                                    className="space-y-4"
                                >
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                                        <input
                                            required
                                            type="email"
                                            autoComplete="email"
                                            className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                            placeholder="email@example.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu</label>
                                        <input
                                            required
                                            type="password"
                                            autoComplete="current-password"
                                            className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                            placeholder="••••••••"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full bg-slate-900 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {loading ? <Loader2 className="animate-spin" size={20} /> : (<><span>Tiếp tục</span><ChevronRight size={18} /></>)}
                                    </button>

                                    <div className="text-xs text-slate-500 leading-relaxed">
                                        Sau bước này, hệ thống tạo một phiên xác thực TOTP có thời hạn <b>2 phút</b>.
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="step2"
                                    initial={{ opacity: 0, x: -16 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 16 }}
                                    className="space-y-4"
                                >
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex items-start gap-3">
                                        <ShieldCheck size={20} className="text-emerald-600 mt-0.5" />
                                        <div className="text-sm text-slate-700">
                                            <div className="font-semibold">Xác thực 2 lớp (TOTP)</div>
                                            <div className="text-slate-500">Nhập mã 6 số từ Google Authenticator / Microsoft Authenticator.</div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Mã TOTP</label>
                                        <input
                                            required
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            className="w-full tracking-[0.25em] text-center text-lg px-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                            placeholder="••••••"
                                            value={code}
                                            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                                        />
                                        {expired && (
                                            <div className="mt-2 text-sm text-red-600">
                                                Phiên xác thực đã hết hạn. Vui lòng tạo phiên mới.
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setStep(1);
                                                setChallengeId(null);
                                                setExpiresAt(null);
                                                setCode('');
                                                setError(null);
                                            }}
                                            className="px-4 py-2.5 rounded-lg text-slate-600 font-medium hover:bg-slate-100 transition-colors flex items-center gap-2"
                                            disabled={loading}
                                        >
                                            <ArrowLeft size={18} />
                                            Quay lại
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => startLoginChallenge()}
                                            className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-700 font-medium hover:border-emerald-400 hover:text-emerald-700 transition-colors"
                                            disabled={loading}
                                        >
                                            Tạo phiên mới
                                        </button>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={loading || expired || code.length < 6}
                                        className="w-full bg-slate-900 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {loading ? <Loader2 className="animate-spin" size={20} /> : 'Xác thực & đăng nhập'}
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </form>
                </div>
            </div>
        </div>
    );
};
