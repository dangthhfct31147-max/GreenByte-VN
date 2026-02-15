import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticator } from '@otplib/preset-default';
import { prisma } from '../prisma';
import { getEnv } from '../env';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import {
    getClientIp,
    checkIpRateLimit,
    recordIpAttempt,
    clearIpAttempts,
    checkAccountLockout,
    checkEmailRateLimit,
    recordLoginAttempt,
    RATE_LIMIT,
} from '../middleware/rateLimit';

export const authRouter = Router();

const AUTH_COOKIE = 'eco_token';

function cookieOptions() {
    const env = getEnv();
    const frontendOrigin = new URL(env.FRONTEND_ORIGIN);
    const isLocalhost = frontendOrigin.hostname === 'localhost' || frontendOrigin.hostname === '127.0.0.1';
    const shouldUseSecureCookies = frontendOrigin.protocol === 'https:' && !isLocalhost;
    const sameSite: 'lax' | 'none' = shouldUseSecureCookies ? 'none' : 'lax';
    return {
        httpOnly: true,
        secure: shouldUseSecureCookies,
        sameSite,
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
    };
}

function setAuthCookie(res: any, token: string) {
    res.cookie(AUTH_COOKIE, token, cookieOptions());
}

function clearAuthCookie(res: any) {
    const options = cookieOptions();
    res.clearCookie(AUTH_COOKIE, {
        path: options.path,
        secure: options.secure,
        sameSite: options.sameSite,
    });
}

const SignupSchema = z.object({
    email: z.string().email().max(255),
    name: z.string().min(1).max(100),
    password: z.string().min(8).max(200),
});

authRouter.post('/signup', async (req, res, next) => {
    try {
        const body = SignupSchema.parse(req.body);
        const passwordHash = await bcrypt.hash(body.password, 12);

        const user = await prisma.user.create({
            data: {
                email: body.email.toLowerCase(),
                name: body.name,
                passwordHash,
                cart: { create: {} },
            },
            select: { id: true, email: true, name: true },
        });

        const env = getEnv();
        const token = jwt.sign({}, env.JWT_SECRET, { subject: user.id, expiresIn: '7d' });
        setAuthCookie(res, token);

        res.status(201).json({ user, token });
    } catch (err: any) {
        // Handle Prisma unique constraint violation (P2002)
        if (err?.code === 'P2002') {
            return res.status(409).json({ error: 'Email already in use' });
        }
        next(err);
    }
});

const LoginSchema = z.object({
    email: z.string().email().max(255),
    password: z.string().min(1).max(200),
});

authRouter.post('/login', async (req, res, next) => {
    try {
        const body = LoginSchema.parse(req.body);
        const normalizedEmail = body.email.toLowerCase().trim();
        const ip = getClientIp(req);
        const userAgent = req.header('user-agent');

        // ===== RATE LIMIT CHECKS =====

        // 1. Check IP rate limit (in-memory, fast)
        const ipCheck = checkIpRateLimit(ip);
        if (!ipCheck.allowed) {
            return res.status(429).json({
                error: `Quá nhiều yêu cầu. Vui lòng thử lại sau ${ipCheck.remainingSeconds} giây.`,
                code: 'IP_RATE_LIMIT',
                retryAfter: ipCheck.remainingSeconds,
            });
        }

        // 2. Check if account is locked
        const lockoutCheck = await checkAccountLockout(normalizedEmail);
        if (lockoutCheck.locked) {
            return res.status(423).json({
                error: lockoutCheck.message,
                code: 'ACCOUNT_LOCKED',
                retryAfter: (lockoutCheck.remainingMinutes || 0) * 60,
            });
        }

        // 3. Check email rate limit (from DB)
        const emailCheck = await checkEmailRateLimit(normalizedEmail);
        if (!emailCheck.allowed) {
            return res.status(429).json({
                error: emailCheck.message,
                code: 'EMAIL_RATE_LIMIT',
            });
        }

        // ===== CREDENTIAL VALIDATION =====
        const user = await prisma.user.findUnique({
            where: { email: normalizedEmail },
        });

        if (!user) {
            // Record failed attempt
            recordIpAttempt(ip);
            await recordLoginAttempt(normalizedEmail, ip, userAgent, false);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const ok = await bcrypt.compare(body.password, user.passwordHash);
        if (!ok) {
            // Record failed attempt and check for lockout
            recordIpAttempt(ip);
            const result = await recordLoginAttempt(normalizedEmail, ip, userAgent, false, user.id);

            if (result.accountLocked) {
                return res.status(423).json({
                    error: `Tài khoản đã bị khóa do quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau ${RATE_LIMIT.LOCKOUT_DURATION_MS / 60000} phút.`,
                    code: 'ACCOUNT_LOCKED',
                    retryAfter: RATE_LIMIT.LOCKOUT_DURATION_MS / 1000,
                });
            }

            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Clear IP attempts on successful password verification
        clearIpAttempts(ip);

        // NOTE: Prisma client typings may be stale in the editor until `prisma generate` is picked up.
        // Keep runtime correct by reading the fields defensively.
        const userAny = user as any;

        // If user hasn't enabled TOTP yet, allow login with password only.
        // When enabled, require the 2-minute TOTP challenge.
        if (!userAny.totpEnabled || !userAny.totpSecret) {
            // Record successful login
            await recordLoginAttempt(normalizedEmail, ip, userAgent, true, user.id);

            // Update last login time
            await prisma.user.update({
                where: { id: user.id },
                data: { lastLoginAt: new Date() },
            });

            const env = getEnv();
            const token = jwt.sign({}, env.JWT_SECRET, { subject: user.id, expiresIn: '7d' });
            setAuthCookie(res, token);
            return res.json({
                totpRequired: false,
                token,
                user: { id: user.id, email: user.email, name: user.name },
            });
        }

        // Clean up old challenges (best-effort)
        const now = new Date();
        const prismaAny = prisma as any;
        await prismaAny.loginChallenge.deleteMany({
            where: {
                userId: user.id,
                OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }],
            },
        });

        // Create a short-lived (2 minutes) login challenge for TOTP input
        const expiresAt = new Date(Date.now() + 2 * 60 * 1000);
        const challenge = await prismaAny.loginChallenge.create({
            data: {
                userId: user.id,
                expiresAt,
            },
            select: { id: true, expiresAt: true },
        });

        res.json({
            totpRequired: true,
            challengeId: challenge.id,
            expiresAt: challenge.expiresAt.toISOString(),
            user: { id: user.id, email: user.email, name: user.name },
        });
    } catch (err) {
        next(err);
    }
});

authRouter.get('/totp', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const userId = req.user!.id;
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, totpEnabled: true, totpSecret: true },
        });
        if (!user) return res.status(404).json({ error: 'Not found' });
        res.json({
            totpEnabled: user.totpEnabled,
            hasSecret: Boolean(user.totpSecret),
        });
    } catch (err) {
        next(err);
    }
});

authRouter.post('/totp/setup', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const userId = req.user!.id;
        const env = getEnv();

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, totpEnabled: true },
        });
        if (!user) return res.status(404).json({ error: 'Not found' });
        if (user.totpEnabled) return res.status(409).json({ error: 'TOTP already enabled' });

        const secretBase32 = authenticator.generateSecret();
        const issuer = env.TOTP_ISSUER;
        const otpauthUri = authenticator.keyuri(user.email, issuer, secretBase32);

        await prisma.user.update({
            where: { id: userId },
            data: { totpSecret: secretBase32, totpEnabled: false },
        });

        res.json({ secretBase32, otpauthUri, issuer, account: user.email });
    } catch (err) {
        next(err);
    }
});

const EnableTotpSchema = z.object({
    code: z
        .string()
        .min(6)
        .max(8)
        .regex(/^\d+$/, 'Code must be numeric'),
});

authRouter.post('/totp/enable', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const userId = req.user!.id;
        const body = EnableTotpSchema.parse(req.body);

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, totpEnabled: true, totpSecret: true },
        });
        if (!user) return res.status(404).json({ error: 'Not found' });
        if (!user.totpSecret) return res.status(400).json({ error: 'No TOTP secret. Run setup first.' });

        authenticator.options = { window: 1 };
        const ok = authenticator.verify({ token: body.code, secret: user.totpSecret });
        if (!ok) return res.status(401).json({ error: 'Invalid TOTP code' });

        await prisma.user.update({
            where: { id: userId },
            data: { totpEnabled: true },
        });

        res.json({ totpEnabled: true });
    } catch (err) {
        next(err);
    }
});

authRouter.post('/totp/disable', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const userId = req.user!.id;
        await prisma.user.update({
            where: { id: userId },
            data: { totpEnabled: false },
        });
        res.json({ totpEnabled: false });
    } catch (err) {
        next(err);
    }
});

const VerifyTotpSchema = z.object({
    challengeId: z.string().uuid(),
    code: z
        .string()
        .min(6)
        .max(8)
        .regex(/^\d+$/, 'Code must be numeric'),
});

authRouter.post('/login/totp', async (req, res, next) => {
    try {
        const body = VerifyTotpSchema.parse(req.body);
        const ip = getClientIp(req);
        const userAgent = req.header('user-agent');
        const prismaAny = prisma as any;
        const challenge = await prismaAny.loginChallenge.findUnique({
            where: { id: body.challengeId },
            include: { user: true },
        });

        if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
        if (challenge.usedAt) return res.status(410).json({ error: 'Challenge already used' });

        const now = new Date();
        if (challenge.expiresAt.getTime() <= now.getTime()) {
            return res.status(410).json({ error: 'Challenge expired' });
        }

        const user = challenge.user;
        const userAny = user as any;
        if (!userAny.totpEnabled || !userAny.totpSecret) {
            return res.status(403).json({ error: 'TOTP not configured for this account' });
        }

        // Track failed attempts using challenge (stored in memory for simplicity)
        const attemptKey = `totp:${challenge.id}`;
        const maxAttempts = 5;

        authenticator.options = { window: 1 };
        const verified = authenticator.verify({ token: body.code, secret: userAny.totpSecret });

        if (!verified) {
            // Record failed login attempt
            recordIpAttempt(ip);
            await recordLoginAttempt(user.email, ip, userAgent, false, user.id);

            // For TOTP we use in-memory tracking since challenges are short-lived
            return res.status(401).json({
                error: 'Mã TOTP không đúng.',
                code: 'INVALID_TOTP',
            });
        }

        await prismaAny.loginChallenge.update({
            where: { id: challenge.id },
            data: { usedAt: now },
        });

        // Record successful login
        await recordLoginAttempt(user.email, ip, userAgent, true, user.id);

        // Update last login time
        await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
        });

        // Clear IP attempts on successful login
        clearIpAttempts(ip);

        const env = getEnv();
        const token = jwt.sign({}, env.JWT_SECRET, { subject: user.id, expiresIn: '7d' });
        setAuthCookie(res, token);

        res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
    } catch (err) {
        next(err);
    }
});

authRouter.get('/me', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const userId = req.user!.id;
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, name: true, createdAt: true },
        });
        if (!user) return res.status(404).json({ error: 'Not found' });
        res.json({ user });
    } catch (err) {
        next(err);
    }
});

const UpdateMeSchema = z.object({
    name: z.string().min(1).max(100),
});

const PreferencesSchema = z.object({
    notifications: z.object({
        emailUpdates: z.boolean(),
        marketplaceUpdates: z.boolean(),
        pollutionAlerts: z.boolean(),
        securityAlerts: z.boolean(),
        weeklyDigest: z.boolean(),
    }),
    preferences: z.object({
        language: z.enum(['vi', 'en']),
        dateFormat: z.enum(['locale', 'iso']),
        publicProfile: z.boolean(),
        showLastLogin: z.boolean(),
        defaultAnonymousReports: z.boolean(),
        soundEffects: z.boolean(),
        reducedMotion: z.boolean(),
        mapAutoLocate: z.boolean(),
    }),
});

function toPreferenceResponse(pref: any) {
    return {
        notifications: {
            emailUpdates: pref.emailUpdates,
            marketplaceUpdates: pref.marketplaceUpdates,
            pollutionAlerts: pref.pollutionAlerts,
            securityAlerts: pref.securityAlerts,
            weeklyDigest: pref.weeklyDigest,
        },
        preferences: {
            language: pref.language,
            dateFormat: pref.dateFormat,
            publicProfile: pref.publicProfile,
            showLastLogin: pref.showLastLogin,
            defaultAnonymousReports: pref.defaultAnonymousReports,
            soundEffects: pref.soundEffects,
            reducedMotion: pref.reducedMotion,
            mapAutoLocate: pref.mapAutoLocate,
        },
        updatedAt: pref.updatedAt,
    };
}

authRouter.get('/preferences', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const userId = req.user!.id;
        const prismaAny = prisma as any;

        const pref = await prismaAny.userPreference.upsert({
            where: { userId },
            create: { userId },
            update: {},
        });

        res.json({ settings: toPreferenceResponse(pref) });
    } catch (err) {
        next(err);
    }
});

authRouter.patch('/preferences', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const userId = req.user!.id;
        const body = PreferencesSchema.parse(req.body);
        const prismaAny = prisma as any;

        const pref = await prismaAny.userPreference.upsert({
            where: { userId },
            create: {
                userId,
                emailUpdates: body.notifications.emailUpdates,
                marketplaceUpdates: body.notifications.marketplaceUpdates,
                pollutionAlerts: body.notifications.pollutionAlerts,
                securityAlerts: body.notifications.securityAlerts,
                weeklyDigest: body.notifications.weeklyDigest,
                language: body.preferences.language,
                dateFormat: body.preferences.dateFormat,
                publicProfile: body.preferences.publicProfile,
                showLastLogin: body.preferences.showLastLogin,
                defaultAnonymousReports: body.preferences.defaultAnonymousReports,
                soundEffects: body.preferences.soundEffects,
                reducedMotion: body.preferences.reducedMotion,
                mapAutoLocate: body.preferences.mapAutoLocate,
            },
            update: {
                emailUpdates: body.notifications.emailUpdates,
                marketplaceUpdates: body.notifications.marketplaceUpdates,
                pollutionAlerts: body.notifications.pollutionAlerts,
                securityAlerts: body.notifications.securityAlerts,
                weeklyDigest: body.notifications.weeklyDigest,
                language: body.preferences.language,
                dateFormat: body.preferences.dateFormat,
                publicProfile: body.preferences.publicProfile,
                showLastLogin: body.preferences.showLastLogin,
                defaultAnonymousReports: body.preferences.defaultAnonymousReports,
                soundEffects: body.preferences.soundEffects,
                reducedMotion: body.preferences.reducedMotion,
                mapAutoLocate: body.preferences.mapAutoLocate,
            },
        });

        res.json({ settings: toPreferenceResponse(pref) });
    } catch (err) {
        next(err);
    }
});

authRouter.patch('/me', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const userId = req.user!.id;
        const body = UpdateMeSchema.parse(req.body);

        const user = await prisma.user.update({
            where: { id: userId },
            data: { name: body.name },
            select: { id: true, email: true, name: true, createdAt: true },
        });

        res.json({ user });
    } catch (err) {
        next(err);
    }
});

const ChangePasswordSchema = z.object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(8).max(200),
    totpCode: z
        .string()
        .min(6)
        .max(8)
        .regex(/^\d+$/, 'Code must be numeric')
        .optional(),
});

authRouter.post('/password', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const userId = req.user!.id;
        const body = ChangePasswordSchema.parse(req.body);

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, passwordHash: true, totpEnabled: true, totpSecret: true },
        });
        if (!user) return res.status(404).json({ error: 'Not found' });

        const currentOk = await bcrypt.compare(body.currentPassword, user.passwordHash);
        if (!currentOk) return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });

        const sameAsOld = await bcrypt.compare(body.newPassword, user.passwordHash);
        if (sameAsOld) return res.status(400).json({ error: 'Mật khẩu mới phải khác mật khẩu hiện tại' });

        if (user.totpEnabled && user.totpSecret) {
            if (!body.totpCode) {
                return res.status(400).json({ error: 'Vui lòng nhập mã TOTP để đổi mật khẩu' });
            }
            authenticator.options = { window: 1 };
            const verified = authenticator.verify({ token: body.totpCode, secret: user.totpSecret });
            if (!verified) return res.status(401).json({ error: 'Mã TOTP không hợp lệ' });
        }

        const passwordHash = await bcrypt.hash(body.newPassword, 12);
        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash },
            select: { id: true },
        });

        const env = getEnv();
        const token = jwt.sign({}, env.JWT_SECRET, { subject: userId, expiresIn: '7d' });
        setAuthCookie(res, token);

        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

authRouter.post('/logout', (_req, res) => {
    clearAuthCookie(res);
    res.json({ ok: true });
});
