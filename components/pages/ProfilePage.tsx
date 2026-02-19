import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppSelect } from '../ui/AppSelect';
import QRCode from 'qrcode';
import { Loader2, ShieldCheck, ShieldOff, Copy, Check, ArrowLeft, ChevronDown, User as UserIcon, KeyRound, Bell, SlidersHorizontal } from 'lucide-react';
import { apiFetch } from '@/utils/api';

type LocalProfileSettings = {
    notifications: {
        emailUpdates: boolean;
        marketplaceUpdates: boolean;
        pollutionAlerts: boolean;
        securityAlerts: boolean;
        weeklyDigest: boolean;
    };
    preferences: {
        language: 'vi' | 'en';
        dateFormat: 'locale' | 'iso';
        publicProfile: boolean;
        showLastLogin: boolean;
        defaultAnonymousReports: boolean;
        soundEffects: boolean;
        reducedMotion: boolean;
        mapAutoLocate: boolean;
    };
};

const LOCAL_SETTINGS_KEY = 'eco_profile_settings_v1';

const DEFAULT_LOCAL_SETTINGS: LocalProfileSettings = {
    notifications: {
        emailUpdates: true,
        marketplaceUpdates: true,
        pollutionAlerts: true,
        securityAlerts: true,
        weeklyDigest: false,
    },
    preferences: {
        language: 'vi',
        dateFormat: 'locale',
        publicProfile: false,
        showLastLogin: true,
        defaultAnonymousReports: false,
        soundEffects: true,
        reducedMotion: false,
        mapAutoLocate: true,
    },
};

function loadLocalSettings(): LocalProfileSettings {
    try {
        const raw = localStorage.getItem(LOCAL_SETTINGS_KEY);
        if (!raw) return DEFAULT_LOCAL_SETTINGS;
        const parsed = JSON.parse(raw) as Partial<LocalProfileSettings>;

        return {
            notifications: {
                ...DEFAULT_LOCAL_SETTINGS.notifications,
                ...(parsed.notifications || {}),
            },
            preferences: {
                ...DEFAULT_LOCAL_SETTINGS.preferences,
                ...(parsed.preferences || {}),
            },
        };
    } catch {
        return DEFAULT_LOCAL_SETTINGS;
    }
}

function persistLocalSettingsBackup(settings: LocalProfileSettings) {
    try {
        localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
        // ignore localStorage errors
    }
}

type TotpStatusResponse = {
    totpEnabled: boolean;
    hasSecret: boolean;
};

type TotpSetupResponse = {
    secretBase32: string;
    otpauthUri: string;
    issuer: string;
    account: string;
};

function maskSecret(secret: string) {
    if (secret.length <= 8) return secret;
    return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

export const ProfilePage = ({
    user,
    onBack,
    onUserUpdated,
    onAvatarUpdated,
}: {
    user: { id: string; name: string; email: string; avatarUrl?: string };
    onBack: () => void;
    onUserUpdated?: (user: { id: string; name: string; email: string; avatarUrl?: string }) => void;
    onAvatarUpdated?: (avatarUrl: string | undefined) => void;
}) => {
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const [openSection, setOpenSection] = useState<'profile' | 'security' | 'notifications' | 'preferences'>('profile');

    const [profileLoading, setProfileLoading] = useState(false);
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileName, setProfileName] = useState(user.name);
    const [profileEmail, setProfileEmail] = useState(user.email);
    const [profileCreatedAt, setProfileCreatedAt] = useState<string | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatarUrl ?? null);

    const [passwordLoading, setPasswordLoading] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordTotpCode, setPasswordTotpCode] = useState('');

    const [totpLoading, setTotpLoading] = useState(false);
    const [totpEnabled, setTotpEnabled] = useState(false);
    const [hasSecret, setHasSecret] = useState(false);

    const [setup, setSetup] = useState<TotpSetupResponse | null>(null);
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [code, setCode] = useState('');
    const [localSettings, setLocalSettings] = useState<LocalProfileSettings>(DEFAULT_LOCAL_SETTINGS);
    const [savingSettings, setSavingSettings] = useState(false);
    const avatarInputId = 'profile-avatar-input';

    const jsonHeaders = useMemo(() => ({ 'Content-Type': 'application/json' }), []);

    const avatarStorageKey = useMemo(() => `eco_user_avatar_${user.id}`, [user.id]);

    const profileInitials = useMemo(() => {
        const parts = profileName.trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) return 'U';
        if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
        return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
    }, [profileName]);

    const AccordionItem = ({
        id,
        title,
        icon,
        children,
    }: {
        id: 'profile' | 'security' | 'notifications' | 'preferences';
        title: string;
        icon: React.ReactNode;
        children: React.ReactNode;
    }) => {
        const open = openSection === id;
        return (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden">
                <button
                    type="button"
                    onClick={() => setOpenSection((prev) => (prev === id ? prev : id))}
                    className="w-full px-6 py-5 flex items-center justify-between gap-4 text-left"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                            {icon}
                        </div>
                        <div className="text-lg font-semibold text-slate-900">{title}</div>
                    </div>
                    <ChevronDown
                        size={20}
                        className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
                    />
                </button>

                <AnimatePresence initial={false}>
                    {open && (
                        <motion.div
                            key={id}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="border-t border-slate-100"
                        >
                            <div className="p-6">{children}</div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    };

    const loadStatus = async () => {
        setTotpLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await apiFetch('auth/totp');
            const data = (await res.json()) as any;
            if (!res.ok) throw new Error(data?.error ?? 'Không tải được trạng thái TOTP');

            const parsed = data as TotpStatusResponse;
            setTotpEnabled(parsed.totpEnabled);
            setHasSecret(parsed.hasSecret);
        } catch (e: any) {
            setError(e?.message ?? 'Có lỗi xảy ra');
        } finally {
            setTotpLoading(false);
        }
    };

    const loadMe = async () => {
        setProfileLoading(true);
        setError(null);

        const controller = new AbortController();
        try {
            const res = await apiFetch('auth/me', {
                signal: controller.signal,
                cache: 'no-store',
            });
            const data = (await res.json()) as any;
            if (!res.ok) throw new Error(data?.error ?? 'Không tải được hồ sơ');
            const u = data?.user as { id: string; name: string; email: string; createdAt?: string };
            if (u?.name) setProfileName(u.name);
            if (u?.email) setProfileEmail(u.email);
            if (u?.createdAt) setProfileCreatedAt(u.createdAt);
            if (u?.id && u?.name && u?.email) {
                onUserUpdated?.({ id: u.id, name: u.name, email: u.email, avatarUrl: avatarPreview ?? undefined });
            }
        } catch (e: any) {
            if (e?.name !== 'AbortError') {
                setError(e?.message ?? 'Có lỗi xảy ra');
            }
        } finally {
            setProfileLoading(false);
        }

        return () => controller.abort();
    };

    const loadServerSettings = async () => {
        try {
            const res = await apiFetch('auth/preferences', { cache: 'no-store' });
            const data = (await res.json()) as any;
            if (!res.ok) throw new Error(data?.error ?? 'Không tải được cài đặt hồ sơ');

            const settings = data?.settings as LocalProfileSettings | undefined;
            if (settings?.notifications && settings?.preferences) {
                setLocalSettings(settings);
                persistLocalSettingsBackup(settings);
                return;
            }

            const fallback = loadLocalSettings();
            setLocalSettings(fallback);
        } catch {
            const fallback = loadLocalSettings();
            setLocalSettings(fallback);
        }
    };

    useEffect(() => {
        loadStatus();
        loadMe();
        loadServerSettings();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        setProfileName(user.name);
        setProfileEmail(user.email);
        setAvatarPreview(user.avatarUrl ?? null);
    }, [user.id, user.name, user.email, user.avatarUrl]);

    useEffect(() => {
        setLocalSettings(loadLocalSettings());
    }, []);

    const saveLocalSettings = async () => {
        setSavingSettings(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await apiFetch('auth/preferences', {
                method: 'PATCH',
                headers: jsonHeaders,
                body: JSON.stringify(localSettings),
            });
            const data = (await res.json()) as any;
            if (!res.ok) throw new Error(data?.error ?? 'Không thể lưu cài đặt hồ sơ');

            const settings = data?.settings as LocalProfileSettings | undefined;
            if (settings?.notifications && settings?.preferences) {
                setLocalSettings(settings);
                persistLocalSettingsBackup(settings);
            } else {
                persistLocalSettingsBackup(localSettings);
            }

            setSuccess('Đã đồng bộ cài đặt hồ sơ lên máy chủ.');
        } catch (e: any) {
            persistLocalSettingsBackup(localSettings);
            setError(e?.message ?? 'Lưu server thất bại. Đã lưu tạm trên thiết bị hiện tại.');
        } finally {
            setSavingSettings(false);
        }
    };

    const toggleNotification = (key: keyof LocalProfileSettings['notifications']) => {
        setLocalSettings((prev) => ({
            ...prev,
            notifications: {
                ...prev.notifications,
                [key]: !prev.notifications[key],
            },
        }));
    };

    const togglePreference = (key: keyof LocalProfileSettings['preferences']) => {
        const currentValue = localSettings.preferences[key];
        if (typeof currentValue !== 'boolean') return;

        setLocalSettings((prev) => ({
            ...prev,
            preferences: {
                ...prev.preferences,
                [key]: !Boolean(prev.preferences[key]),
            },
        }));
    };

    const saveProfile = async () => {
        if (!profileName.trim()) {
            setError('Vui lòng nhập tên');
            return;
        }

        setSavingProfile(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await apiFetch('auth/me', {
                method: 'PATCH',
                headers: jsonHeaders,
                body: JSON.stringify({ name: profileName.trim() }),
            });
            const data = (await res.json()) as any;
            if (!res.ok) throw new Error(data?.error ?? 'Không lưu được hồ sơ');

            const u = data?.user as { id: string; name: string; email: string; createdAt?: string };
            if (u?.id && u?.name && u?.email) {
                onUserUpdated?.({ id: u.id, name: u.name, email: u.email, avatarUrl: avatarPreview ?? undefined });
                setProfileName(u.name);
                setProfileEmail(u.email);
            }
            setSuccess('Đã cập nhật thông tin cá nhân.');
        } catch (e: any) {
            setError(e?.message ?? 'Có lỗi xảy ra');
        } finally {
            setSavingProfile(false);
        }
    };

    const beginSetup = async () => {
        setTotpLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await apiFetch('auth/totp/setup', {
                method: 'POST',
                headers: jsonHeaders,
            });
            const data = (await res.json()) as any;
            if (!res.ok) throw new Error(data?.error ?? 'Không tạo được TOTP');

            const parsed = data as TotpSetupResponse;
            setSetup(parsed);
            setHasSecret(true);
            setCode('');

            const url = await QRCode.toDataURL(parsed.otpauthUri, {
                errorCorrectionLevel: 'M',
                margin: 2,
                scale: 8,
            });
            setQrDataUrl(url);
        } catch (e: any) {
            setError(e?.message ?? 'Có lỗi xảy ra');
        } finally {
            setTotpLoading(false);
        }
    };

    const enableTotp = async () => {
        setTotpLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await apiFetch('auth/totp/enable', {
                method: 'POST',
                headers: jsonHeaders,
                body: JSON.stringify({ code }),
            });
            const data = (await res.json()) as any;
            if (!res.ok) throw new Error(data?.error ?? 'Không bật được TOTP');

            setTotpEnabled(true);
            setSetup(null);
            setQrDataUrl(null);
            setCode('');
            setSuccess('Đã bật TOTP thành công. Lần sau đăng nhập sẽ yêu cầu mã TOTP.');
        } catch (e: any) {
            setError(e?.message ?? 'Có lỗi xảy ra');
        } finally {
            setTotpLoading(false);
        }
    };

    const disableTotp = async () => {
        setTotpLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await apiFetch('auth/totp/disable', {
                method: 'POST',
                headers: jsonHeaders,
            });
            const data = (await res.json()) as any;
            if (!res.ok) throw new Error(data?.error ?? 'Không tắt được TOTP');

            setTotpEnabled(false);
            setSuccess('Đã tắt TOTP.');
        } catch (e: any) {
            setError(e?.message ?? 'Có lỗi xảy ra');
        } finally {
            setTotpLoading(false);
        }
    };

    const changePassword = async () => {
        if (!currentPassword || !newPassword) {
            setError('Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới');
            return;
        }
        if (newPassword.length < 8) {
            setError('Mật khẩu mới phải có ít nhất 8 ký tự');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Xác nhận mật khẩu không khớp');
            return;
        }
        if (totpEnabled && passwordTotpCode.length < 6) {
            setError('Vui lòng nhập mã TOTP');
            return;
        }

        setPasswordLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await apiFetch('auth/password', {
                method: 'POST',
                headers: jsonHeaders,
                body: JSON.stringify({
                    currentPassword,
                    newPassword,
                    ...(totpEnabled ? { totpCode: passwordTotpCode } : {}),
                }),
            });
            const data = (await res.json()) as any;
            if (!res.ok) throw new Error(data?.error ?? 'Không đổi được mật khẩu');

            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setPasswordTotpCode('');
            setSuccess('Đã đổi mật khẩu thành công.');
        } catch (e: any) {
            setError(e?.message ?? 'Có lỗi xảy ra');
        } finally {
            setPasswordLoading(false);
        }
    };

    const showSetup = !totpEnabled && (setup !== null);

    const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const maxSize = 2 * 1024 * 1024;
        if (!file.type.startsWith('image/')) {
            setError('Vui lòng chọn tệp ảnh hợp lệ.');
            event.target.value = '';
            return;
        }
        if (file.size > maxSize) {
            setError('Ảnh đại diện tối đa 2MB.');
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = typeof reader.result === 'string' ? reader.result : '';
            if (!dataUrl) {
                setError('Không thể đọc ảnh đại diện.');
                return;
            }

            setAvatarPreview(dataUrl);
            onAvatarUpdated?.(dataUrl);
            setSuccess('Đã cập nhật avatar.');
            setError(null);
            try {
                localStorage.setItem(avatarStorageKey, dataUrl);
            } catch {
                setError('Không thể lưu avatar trên thiết bị này.');
            }
        };
        reader.readAsDataURL(file);
        event.target.value = '';
    };

    return (
        <div className="min-h-[calc(100vh-64px)] py-10 px-4 select-none">
            <div className="container mx-auto max-w-3xl">
                <div className="flex items-center justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Hồ sơ</h1>
                        <p className="text-slate-500 text-sm">Quản lý tài khoản và bảo mật.</p>
                    </div>
                    <button
                        onClick={onBack}
                        className="px-4 py-2 rounded-lg text-slate-600 font-medium hover:bg-slate-100 transition-colors flex items-center gap-2"
                    >
                        <ArrowLeft size={18} />
                        Quay lại
                    </button>
                </div>

                <div className="space-y-5">
                    <AccordionItem id="profile" title="Thông tin cá nhân" icon={<UserIcon size={18} />}>
                        <div className="mb-5 flex items-center gap-4">
                            {avatarPreview ? (
                                <img src={avatarPreview} alt="Avatar" className="w-16 h-16 rounded-full object-cover border border-slate-200" />
                            ) : (
                                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 font-semibold text-xl flex items-center justify-center border border-emerald-200">
                                    {profileInitials}
                                </div>
                            )}
                            <div>
                                <label
                                    htmlFor={avatarInputId}
                                    className="inline-flex items-center px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                                >
                                    Đổi avatar
                                </label>
                                <input
                                    id={avatarInputId}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleAvatarChange}
                                />
                                <div className="text-xs text-slate-500 mt-1">PNG/JPG/WebP, tối đa 2MB.</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="profile-name" className="block text-sm font-medium text-slate-700 mb-1">Họ và tên</label>
                                <input
                                    id="profile-name"
                                    type="text"
                                    aria-label="Họ và tên"
                                    value={profileName}
                                    onChange={(e) => setProfileName(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                />
                            </div>
                            <div>
                                <label htmlFor="profile-email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                                <input
                                    id="profile-email"
                                    type="email"
                                    aria-label="Email"
                                    value={profileEmail}
                                    disabled
                                    readOnly
                                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700"
                                />
                            </div>
                        </div>

                        {profileCreatedAt && (
                            <div className="mt-4 text-sm text-slate-500">
                                Ngày tạo tài khoản: <span className="font-medium text-slate-700">{new Date(profileCreatedAt).toLocaleString()}</span>
                            </div>
                        )}

                        <div className="mt-5 flex items-center justify-between gap-4">
                            <div className="text-sm text-slate-500">
                                {profileLoading ? (
                                    <span className="inline-flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Đang tải…</span>
                                ) : null}
                            </div>
                            <button
                                type="button"
                                onClick={saveProfile}
                                disabled={savingProfile}
                                className="px-4 py-2 rounded-lg font-semibold bg-slate-900 text-white hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {savingProfile ? (
                                    <span className="inline-flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Đang lưu…</span>
                                ) : (
                                    'Lưu thay đổi'
                                )}
                            </button>
                        </div>
                    </AccordionItem>

                    <AccordionItem id="security" title="Đổi mật khẩu" icon={<KeyRound size={18} />}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="current-password" className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu hiện tại</label>
                                <input
                                    id="current-password"
                                    type="password"
                                    autoComplete="current-password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                    placeholder="••••••••"
                                />
                            </div>
                            <div>
                                <label htmlFor="new-password" className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu mới</label>
                                <input
                                    id="new-password"
                                    type="password"
                                    autoComplete="new-password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                    placeholder="Ít nhất 8 ký tự"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700 mb-1">Xác nhận mật khẩu mới</label>
                                <input
                                    id="confirm-password"
                                    type="password"
                                    autoComplete="new-password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                    placeholder="Nhập lại mật khẩu mới"
                                />
                            </div>

                            {totpEnabled && (
                                <div className="md:col-span-2">
                                    <label htmlFor="password-totp" className="block text-sm font-medium text-slate-700 mb-1">Mã TOTP</label>
                                    <input
                                        id="password-totp"
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        value={passwordTotpCode}
                                        onChange={(e) => setPasswordTotpCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                                        className="w-full tracking-[0.25em] text-center text-lg px-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                        placeholder="••••••"
                                    />
                                    <div className="mt-2 text-xs text-slate-500">
                                        Tài khoản đang bật TOTP nên cần xác thực khi đổi mật khẩu.
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={changePassword}
                            disabled={passwordLoading}
                            className="mt-5 w-full bg-slate-900 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {passwordLoading ? <Loader2 className="animate-spin" size={20} /> : 'Đổi mật khẩu'}
                        </button>

                        <div className="mt-8 border-t border-slate-100 pt-6">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-start gap-3">
                                    {totpEnabled ? (
                                        <ShieldCheck size={22} className="text-emerald-600 mt-0.5" />
                                    ) : (
                                        <ShieldOff size={22} className="text-slate-400 mt-0.5" />
                                    )}
                                    <div>
                                        <div className="font-semibold text-slate-900">Bảo mật TOTP</div>
                                        <div className="text-sm text-slate-500">
                                            {totpEnabled
                                                ? 'Đang bật: đăng nhập sẽ yêu cầu mã 6 số.'
                                                : 'Đang tắt: có thể bật để tăng bảo mật.'}
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => {
                                        if (totpLoading) return;
                                        if (totpEnabled) {
                                            disableTotp();
                                        } else {
                                            beginSetup();
                                        }
                                    }}
                                    disabled={totpLoading}
                                    className={`px-4 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${totpEnabled
                                        ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                        : 'bg-slate-900 text-white hover:bg-emerald-600'
                                        }`}
                                >
                                    {totpEnabled ? 'Tắt TOTP' : 'Bật TOTP'}
                                </button>
                            </div>

                            <AnimatePresence>
                                {showSetup && setup && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 10 }}
                                        className="mt-6"
                                    >
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                                <div className="text-sm font-semibold text-slate-900 mb-2">1) Quét QR bằng Authenticator</div>
                                                {qrDataUrl ? (
                                                    <div className="bg-white rounded-lg border border-slate-200 p-3 inline-block">
                                                        <img src={qrDataUrl} alt="TOTP QR" className="w-48 h-48" />
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 text-slate-500 text-sm">
                                                        <Loader2 className="animate-spin" size={18} />
                                                        Đang tạo QR…
                                                    </div>
                                                )}
                                                <div className="mt-3 text-xs text-slate-500">
                                                    Nếu không quét được, có thể nhập secret thủ công.
                                                </div>
                                            </div>

                                            <div className="rounded-xl border border-slate-200 bg-white p-4">
                                                <div className="text-sm font-semibold text-slate-900 mb-2">2) Secret & nhập mã 6 số để test</div>

                                                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                                    <div className="text-sm font-mono text-slate-700">{maskSecret(setup.secretBase32)}</div>
                                                    <button
                                                        type="button"
                                                        className="text-sm font-medium text-slate-600 hover:text-slate-900 flex items-center gap-2"
                                                        onClick={async () => {
                                                            try {
                                                                await navigator.clipboard.writeText(setup.secretBase32);
                                                                setSuccess('Đã copy secret.');
                                                            } catch {
                                                                setError('Không copy được secret.');
                                                            }
                                                        }}
                                                    >
                                                        <Copy size={16} />
                                                        Copy
                                                    </button>
                                                </div>

                                                <div className="mt-4">
                                                    <label className="block text-sm font-medium text-slate-700 mb-1">Mã TOTP (6 số)</label>
                                                    <input
                                                        required
                                                        inputMode="numeric"
                                                        autoComplete="one-time-code"
                                                        className="w-full tracking-[0.25em] text-center text-lg px-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                                        placeholder="••••••"
                                                        value={code}
                                                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                                                    />
                                                </div>

                                                <button
                                                    type="button"
                                                    disabled={totpLoading || code.length < 6}
                                                    onClick={enableTotp}
                                                    className="mt-4 w-full bg-slate-900 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {totpLoading ? <Loader2 className="animate-spin" size={20} /> : (<><Check size={18} /> Xác nhận bật TOTP</>)}
                                                </button>

                                                <div className="mt-3 text-xs text-slate-500 leading-relaxed">
                                                    Khi bật xong, lần đăng nhập sau sẽ yêu cầu mã TOTP theo phiên 2 phút.
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {!totpEnabled && !showSetup && hasSecret && (
                                <div className="mt-5 text-sm text-slate-500">
                                    Tài khoản đã có secret TOTP nhưng đang tắt. Nhấn “Bật TOTP” để tạo lại QR/secret và test lại.
                                </div>
                            )}
                        </div>
                    </AccordionItem>

                    <AccordionItem id="notifications" title="Thông báo" icon={<Bell size={18} />}>
                        <div className="space-y-3">
                            {[
                                { key: 'emailUpdates', label: 'Email cập nhật hệ thống', hint: 'Nhận thay đổi chính sách, bảo trì và thông báo dịch vụ.' },
                                { key: 'marketplaceUpdates', label: 'Biến động sản phẩm quan tâm', hint: 'Thông báo khi có sản phẩm mới theo khu vực/danh mục bạn theo dõi.' },
                                { key: 'pollutionAlerts', label: 'Cảnh báo ô nhiễm theo khu vực', hint: 'Ưu tiên các cảnh báo gần khu vực bạn thường xem trên bản đồ.' },
                                { key: 'securityAlerts', label: 'Cảnh báo bảo mật', hint: 'Thông báo đăng nhập bất thường, thay đổi mật khẩu, TOTP.' },
                                { key: 'weeklyDigest', label: 'Bản tin tổng hợp hàng tuần', hint: 'Tóm tắt hoạt động tài khoản, thị trường và báo cáo nổi bật.' },
                            ].map((item) => {
                                const checked = localSettings.notifications[item.key as keyof LocalProfileSettings['notifications']];
                                return (
                                    <div key={item.key} className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-start justify-between gap-4">
                                        <div>
                                            <div className="font-medium text-slate-900">{item.label}</div>
                                            <div className="text-sm text-slate-500 mt-0.5">{item.hint}</div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => toggleNotification(item.key as keyof LocalProfileSettings['notifications'])}
                                            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                            title={item.label}
                                        >
                                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </AccordionItem>

                    <AccordionItem id="preferences" title="Quyền riêng tư & trải nghiệm" icon={<SlidersHorizontal size={18} />}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="profile-language" className="block text-sm font-medium text-slate-700 mb-1">Ngôn ngữ giao diện</label>
                                <AppSelect
                                    id="profile-language"
                                    value={localSettings.preferences.language}
                                    onChange={(e) => {
                                        const value = e.target.value === 'en' ? 'en' : 'vi';
                                        setLocalSettings((prev) => ({
                                            ...prev,
                                            preferences: { ...prev.preferences, language: value },
                                        }));
                                    }}
                                    title="Ngôn ngữ giao diện"
                                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                >
                                    <option value="vi">Tiếng Việt</option>
                                    <option value="en">English</option>
                                </AppSelect>
                            </div>
                            <div>
                                <label htmlFor="profile-date-format" className="block text-sm font-medium text-slate-700 mb-1">Định dạng thời gian</label>
                                <AppSelect
                                    id="profile-date-format"
                                    value={localSettings.preferences.dateFormat}
                                    onChange={(e) => {
                                        const value = e.target.value === 'iso' ? 'iso' : 'locale';
                                        setLocalSettings((prev) => ({
                                            ...prev,
                                            preferences: { ...prev.preferences, dateFormat: value },
                                        }));
                                    }}
                                    title="Định dạng thời gian"
                                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                >
                                    <option value="locale">Theo thiết bị</option>
                                    <option value="iso">ISO 8601</option>
                                </AppSelect>
                            </div>
                        </div>

                        <div className="mt-5 space-y-3">
                            {[
                                { key: 'publicProfile', label: 'Cho phép hiển thị hồ sơ công khai tối giản', hint: 'Hiển thị tên và thông tin cơ bản khi tương tác cộng đồng.' },
                                { key: 'showLastLogin', label: 'Hiển thị lần đăng nhập gần nhất', hint: 'Hỗ trợ bạn theo dõi hoạt động tài khoản.' },
                                { key: 'defaultAnonymousReports', label: 'Mặc định báo cáo ô nhiễm ở chế độ ẩn danh', hint: 'Tự động bật ẩn danh khi tạo báo cáo mới.' },
                                { key: 'soundEffects', label: 'Âm thanh phản hồi thao tác', hint: 'Bật/tắt âm thanh xác nhận khi thao tác trong ứng dụng.' },
                                { key: 'reducedMotion', label: 'Giảm chuyển động giao diện', hint: 'Giảm animation để thao tác êm hơn trên thiết bị yếu.' },
                                { key: 'mapAutoLocate', label: 'Tự định vị khi mở bản đồ', hint: 'Tự lấy vị trí hiện tại để focus điểm gần bạn.' },
                            ].map((item) => {
                                const checked = localSettings.preferences[item.key as keyof LocalProfileSettings['preferences']] as boolean;
                                return (
                                    <div key={item.key} className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-start justify-between gap-4">
                                        <div>
                                            <div className="font-medium text-slate-900">{item.label}</div>
                                            <div className="text-sm text-slate-500 mt-0.5">{item.hint}</div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => togglePreference(item.key as keyof LocalProfileSettings['preferences'])}
                                            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                            title={item.label}
                                        >
                                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        <button
                            type="button"
                            onClick={saveLocalSettings}
                            disabled={savingSettings}
                            className="mt-5 w-full bg-slate-900 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {savingSettings ? <Loader2 className="animate-spin" size={20} /> : 'Lưu cài đặt cá nhân'}
                        </button>
                    </AccordionItem>

                    {error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                            {success}
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};
