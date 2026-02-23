import React, { useState } from 'react';
import { ShieldCheck, Lock, Mail, Loader2 } from 'lucide-react';
import { apiFetch } from '@/utils/api';
import { setAdminToken } from '@/utils/adminAuth';

interface AdminLoginPageProps {
    onLoginSuccess: (adminEmail: string) => void;
    onBackHome: () => void;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({ onLoginSuccess, onBackHome }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const demoAdminEmail = String(import.meta.env.VITE_ADMIN_DEMO_EMAIL || 'admin@greenbyte.vn');
    const demoAdminPassword = import.meta.env.VITE_ADMIN_DEMO_PASSWORD
        ? String(import.meta.env.VITE_ADMIN_DEMO_PASSWORD)
        : 'Giá trị ADMIN_PASSWORD trong file .env';

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!email.trim() || !password.trim()) return;

        setLoading(true);
        setError(null);

        try {
            const res = await apiFetch('admin/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data?.error ?? 'Đăng nhập admin thất bại');

            setAdminToken(data.token);
            onLoginSuccess(data?.admin?.email ?? email.trim().toLowerCase());
        } catch (e: any) {
            setError(e?.message ?? 'Có lỗi xảy ra khi đăng nhập admin');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
            <div className="w-full max-w-md bg-white border border-slate-200 shadow-xl rounded-2xl overflow-hidden">
                <div className="bg-slate-900 text-white p-6">
                    <div className="flex items-center gap-3 mb-2">
                        <ShieldCheck size={28} />
                        <h1 className="text-xl font-bold">Admin Portal</h1>
                    </div>
                    <p className="text-sm text-slate-300">Quản trị toàn bộ hệ thống GreenByte VN</p>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                        <p className="font-semibold text-amber-950">Tài khoản demo admin</p>
                        <p className="mt-1">
                            Email: <span className="font-mono">{demoAdminEmail}</span>
                        </p>
                        <p>
                            Mật khẩu: <span className="font-mono break-all">{demoAdminPassword}</span>
                        </p>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-slate-700">Email admin</label>
                        <div className="mt-1 relative">
                            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="email"
                                required
                                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                                placeholder="admin@yourdomain.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-slate-700">Mật khẩu</label>
                        <div className="mt-1 relative">
                            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="password"
                                required
                                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-slate-900 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                        {loading ? 'Đang đăng nhập...' : 'Đăng nhập Admin'}
                    </button>

                    <button
                        type="button"
                        onClick={onBackHome}
                        className="w-full text-slate-600 hover:text-slate-900 text-sm"
                    >
                        Quay về trang chủ
                    </button>
                </form>
            </div>
        </div>
    );
};
