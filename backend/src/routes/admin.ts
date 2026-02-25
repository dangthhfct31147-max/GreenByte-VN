import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { getEnv } from '../env';
import {
    getAdminPermissions,
    normalizeAdminRole,
    requireAdmin,
    requireAdminPermission,
    type AdminRequest,
} from '../middleware/adminAuth';
import { writeAdminAuditLog } from '../lib/adminAudit';
import { getMetricsSnapshot } from '../lib/metrics';

export const adminRouter = Router();

const AdminLoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1).max(200),
});

const ListQuerySchema = z.object({
    take: z.coerce.number().int().min(1).max(500).optional(),
    search: z.string().optional(),
    includeDeleted: z.coerce.boolean().optional(),
    lowConfidenceOnly: z.coerce.boolean().optional(),
    aiConfidenceLte: z.coerce.number().min(0).max(1).optional(),
});

const AuditQuerySchema = z.object({
    take: z.coerce.number().int().min(1).max(200).optional(),
    action: z.string().min(1).max(120).optional(),
    resource: z.string().min(1).max(120).optional(),
    adminEmail: z.string().email().optional(),
});

const ModerationQueueQuerySchema = z.object({
    take: z.coerce.number().int().min(1).max(200).optional(),
    search: z.string().optional(),
    resource: z.enum(['posts', 'events', 'pollution', 'products']).optional(),
    sort: z.enum(['newest', 'risk_desc']).optional(),
});

const ModerateDecisionSchema = z.object({
    reason: z.string().max(500).optional(),
});

const UserLockSchema = z.object({
    minutes: z.coerce.number().int().min(1).max(7 * 24 * 60).optional(),
});

const QueueLowConfidenceSchema = z.object({
    threshold: z.coerce.number().min(0).max(1).optional(),
    includeDeleted: z.coerce.boolean().optional(),
});

const AnalyticsQuerySchema = z.object({
    days: z.coerce.number().int().min(1).max(60).optional(),
});

const AiEventsAnalyticsQuerySchema = z.object({
    weeks: z.coerce.number().int().min(2).max(52).optional(),
    module: z.enum(['RECOMMENDATIONS', 'SELLER_ASSISTANT', 'PRICE_SUGGESTION', 'MATCH_BUYERS', 'VISION_CLASSIFIER']).optional(),
});

function startOfDay(date: Date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function startOfWeek(date: Date) {
    const d = startOfDay(date);
    const dayOffset = (d.getDay() + 6) % 7; // Monday-based week
    d.setDate(d.getDate() - dayOffset);
    return d;
}

function addDays(date: Date, days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

function round2(value: number): number {
    return Number(value.toFixed(2));
}

const ADMIN_LOGIN_WINDOW_MS = 10 * 60 * 1000;
const ADMIN_LOGIN_MAX_ATTEMPTS = 10;
const adminLoginAttempts = new Map<string, { count: number; firstAttemptAt: number }>();

function getAdminSecret() {
    const env = getEnv();
    return env.ADMIN_JWT_SECRET ?? env.JWT_SECRET;
}

function isAdminConfigured() {
    const env = getEnv();
    return Boolean(env.ADMIN_EMAIL && (env.ADMIN_PASSWORD || env.ADMIN_PASSWORD_HASH));
}

function getClientIp(req: AdminRequest): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() || 'unknown';
    return req.socket?.remoteAddress || 'unknown';
}

function getAdminAttemptKey(email: string, ip: string) {
    return `${email.toLowerCase()}::${ip}`;
}

function getRemainingWaitSeconds(attempt: { count: number; firstAttemptAt: number }) {
    const remaining = ADMIN_LOGIN_WINDOW_MS - (Date.now() - attempt.firstAttemptAt);
    return Math.max(1, Math.ceil(remaining / 1000));
}

function checkAdminLoginRateLimit(key: string): { allowed: true } | { allowed: false; retryAfter: number } {
    const existing = adminLoginAttempts.get(key);
    if (!existing) return { allowed: true };

    if (Date.now() - existing.firstAttemptAt > ADMIN_LOGIN_WINDOW_MS) {
        adminLoginAttempts.delete(key);
        return { allowed: true };
    }

    if (existing.count >= ADMIN_LOGIN_MAX_ATTEMPTS) {
        return { allowed: false, retryAfter: getRemainingWaitSeconds(existing) };
    }

    return { allowed: true };
}

function recordAdminLoginFailure(key: string) {
    const existing = adminLoginAttempts.get(key);
    const now = Date.now();
    if (!existing || now - existing.firstAttemptAt > ADMIN_LOGIN_WINDOW_MS) {
        adminLoginAttempts.set(key, { count: 1, firstAttemptAt: now });
        return;
    }
    existing.count += 1;
}

function clearAdminLoginFailure(key: string) {
    adminLoginAttempts.delete(key);
}

function cleanupAdminLoginAttempts() {
    const now = Date.now();
    for (const [key, attempt] of adminLoginAttempts.entries()) {
        if (now - attempt.firstAttemptAt > ADMIN_LOGIN_WINDOW_MS) {
            adminLoginAttempts.delete(key);
        }
    }
}

setInterval(cleanupAdminLoginAttempts, 60_000).unref();

adminRouter.post('/auth/login', async (req, res, next) => {
    try {
        if (!isAdminConfigured()) {
            return res.status(503).json({
                error: 'Admin chưa được cấu hình. Vui lòng thiết lập ADMIN_EMAIL và ADMIN_PASSWORD hoặc ADMIN_PASSWORD_HASH.',
            });
        }

        const body = AdminLoginSchema.parse(req.body);
        const env = getEnv();
        const normalizedEmail = body.email.trim().toLowerCase();
        const expectedEmail = String(env.ADMIN_EMAIL).trim().toLowerCase();
        const ip = getClientIp(req as AdminRequest);
        const attemptKey = getAdminAttemptKey(normalizedEmail, ip);

        const rateLimitResult = checkAdminLoginRateLimit(attemptKey);
        if (!rateLimitResult.allowed) {
            return res.status(429).json({
                error: `Quá nhiều lần đăng nhập admin thất bại. Vui lòng thử lại sau ${rateLimitResult.retryAfter} giây.`,
                code: 'ADMIN_LOGIN_RATE_LIMIT',
                retryAfter: rateLimitResult.retryAfter,
            });
        }

        if (normalizedEmail !== expectedEmail) {
            recordAdminLoginFailure(attemptKey);
            return res.status(401).json({ error: 'Sai thông tin đăng nhập admin' });
        }

        let passwordOk = false;
        if (env.ADMIN_PASSWORD_HASH) {
            passwordOk = await bcrypt.compare(body.password, env.ADMIN_PASSWORD_HASH);
        } else if (env.ADMIN_PASSWORD) {
            passwordOk = body.password === env.ADMIN_PASSWORD;
        }

        if (!passwordOk) {
            recordAdminLoginFailure(attemptKey);
            await writeAdminAuditLog(req, {
                adminEmail: normalizedEmail,
                adminRole: 'superadmin',
                action: 'auth.login',
                resource: 'admin',
                status: 'denied',
                message: 'Sai mật khẩu admin',
            }).catch(() => undefined);
            return res.status(401).json({ error: 'Sai thông tin đăng nhập admin' });
        }

        clearAdminLoginFailure(attemptKey);
        const role = normalizeAdminRole(process.env.ADMIN_ROLE ?? 'superadmin');
        const permissions = getAdminPermissions(role);

        const token = jwt.sign(
            { role, email: expectedEmail, permissions },
            getAdminSecret(),
            { expiresIn: '12h' }
        );

        await writeAdminAuditLog(req, {
            adminEmail: expectedEmail,
            adminRole: role,
            action: 'auth.login',
            resource: 'admin',
            status: 'success',
        }).catch(() => undefined);

        res.json({ token, admin: { email: expectedEmail, role, permissions } });
    } catch (err) {
        next(err);
    }
});

adminRouter.get('/auth/me', requireAdmin, async (req: AdminRequest, res) => {
    res.json({ admin: req.admin });
});

adminRouter.get('/dashboard', requireAdmin, requireAdminPermission('dashboard:read'), async (_req, res, next) => {
    try {
        const [users, products, posts, events, pollutionReports] = await Promise.all([
            (prisma as any).user.count(),
            (prisma as any).product.count({ where: { deletedAt: null } }),
            (prisma as any).post.count({ where: { deletedAt: null } }),
            (prisma as any).event.count({ where: { deletedAt: null } }),
            (prisma as any).pollutionReport.count({ where: { deletedAt: null } }),
        ]);

        const latestProducts = await (prisma as any).product.findMany({
            take: 5,
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                title: true,
                createdAt: true,
                seller: { select: { name: true } },
            },
        });

        const latestPosts = await (prisma as any).post.findMany({
            take: 5,
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                content: true,
                createdAt: true,
                author: { select: { name: true } },
            },
        });

        res.json({
            stats: {
                users,
                products,
                posts,
                events,
                pollutionReports,
            },
            recent: {
                products: latestProducts,
                posts: latestPosts,
            },
            futureModules: [
                'Quản lý đơn hàng và giao nhận',
                'KYC & xác minh người bán',
                'Quản trị thanh toán/đối soát',
                'Moderation AI cho nội dung',
                'Tích hợp phân tích tăng trưởng',
            ],
        });
    } catch (err) {
        next(err);
    }
});

adminRouter.get('/users', requireAdmin, requireAdminPermission('users:read'), async (req, res, next) => {
    try {
        const query = z
            .object({
                take: z.coerce.number().int().min(1).max(200).optional(),
                search: z.string().optional(),
            })
            .parse(req.query);

        const where = query.search
            ? {
                OR: [
                    { email: { contains: query.search, mode: 'insensitive' } },
                    { name: { contains: query.search, mode: 'insensitive' } },
                ],
            }
            : undefined;

        const users = await (prisma as any).user.findMany({
            where,
            take: query.take ?? 100,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                email: true,
                name: true,
                totpEnabled: true,
                sellerVerified: true,
                lockedUntil: true,
                lastLoginAt: true,
                createdAt: true,
            },
        });

        res.json({ users });
    } catch (err) {
        next(err);
    }
});

adminRouter.patch('/users/:id/lock', requireAdmin, requireAdminPermission('users:manage'), async (req: AdminRequest, res, next) => {
    try {
        const userId = z.string().uuid().parse(req.params.id);
        const body = UserLockSchema.parse(req.body ?? {});
        const lockMinutes = body.minutes ?? 60;
        const lockedUntil = new Date(Date.now() + lockMinutes * 60 * 1000);

        const updated = await (prisma as any).user.update({
            where: { id: userId },
            data: { lockedUntil },
            select: { id: true, lockedUntil: true },
        });

        await writeAdminAuditLog(req, {
            adminEmail: req.admin!.email,
            adminRole: req.admin!.role,
            action: 'users.lock',
            resource: 'user',
            resourceId: userId,
            status: 'success',
            metadata: { minutes: lockMinutes },
        }).catch(() => undefined);

        res.json({ user: updated });
    } catch (err) {
        next(err);
    }
});

adminRouter.patch('/users/:id/unlock', requireAdmin, requireAdminPermission('users:manage'), async (req: AdminRequest, res, next) => {
    try {
        const userId = z.string().uuid().parse(req.params.id);
        const updated = await (prisma as any).user.update({
            where: { id: userId },
            data: { lockedUntil: null },
            select: { id: true, lockedUntil: true },
        });

        await writeAdminAuditLog(req, {
            adminEmail: req.admin!.email,
            adminRole: req.admin!.role,
            action: 'users.unlock',
            resource: 'user',
            resourceId: userId,
            status: 'success',
        }).catch(() => undefined);

        res.json({ user: updated });
    } catch (err) {
        next(err);
    }
});

adminRouter.patch('/users/:id/reset-2fa', requireAdmin, requireAdminPermission('users:manage'), async (req: AdminRequest, res, next) => {
    try {
        const userId = z.string().uuid().parse(req.params.id);
        const updated = await (prisma as any).user.update({
            where: { id: userId },
            data: { totpEnabled: false, totpSecret: null },
            select: { id: true, totpEnabled: true },
        });

        await writeAdminAuditLog(req, {
            adminEmail: req.admin!.email,
            adminRole: req.admin!.role,
            action: 'users.reset_2fa',
            resource: 'user',
            resourceId: userId,
            status: 'success',
        }).catch(() => undefined);

        res.json({ user: updated });
    } catch (err) {
        next(err);
    }
});

adminRouter.patch('/users/:id/seller-verify', requireAdmin, requireAdminPermission('users:manage'), async (req: AdminRequest, res, next) => {
    try {
        const userId = z.string().uuid().parse(req.params.id);
        const body = z.object({ verified: z.boolean() }).parse(req.body ?? {});

        const updated = await (prisma as any).user.update({
            where: { id: userId },
            data: { sellerVerified: body.verified },
            select: { id: true, sellerVerified: true },
        });

        await writeAdminAuditLog(req, {
            adminEmail: req.admin!.email,
            adminRole: req.admin!.role,
            action: body.verified ? 'users.seller_verify' : 'users.seller_unverify',
            resource: 'user',
            resourceId: userId,
            status: 'success',
        }).catch(() => undefined);

        res.json({ user: updated });
    } catch (err) {
        next(err);
    }
});

adminRouter.get('/products', requireAdmin, requireAdminPermission('content:read'), async (req, res, next) => {
    try {
        const query = ListQuerySchema.parse(req.query);
        const aiThreshold = query.aiConfidenceLte ?? 0.6;

        const where: Record<string, unknown> = {
            ...(query.includeDeleted ? {} : { deletedAt: null }),
        };
        if (query.search) {
            (where as any).OR = [
                { title: { contains: query.search, mode: 'insensitive' } },
                { category: { contains: query.search, mode: 'insensitive' } },
                { location: { contains: query.search, mode: 'insensitive' } },
            ];
        }

        if (query.lowConfidenceOnly) {
            (where as any).aiAssessment = {
                is: {
                    confidence: {
                        lte: aiThreshold,
                    },
                },
            };
        }

        const products = await (prisma as any).product.findMany({
            where: where as any,
            take: query.take ?? 100,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                title: true,
                category: true,
                priceVnd: true,
                location: true,
                createdAt: true,
                deletedAt: true,
                aiAssessment: {
                    select: {
                        confidence: true,
                        category: true,
                        moistureState: true,
                        impurityLevel: true,
                        provider: true,
                        model: true,
                        moderationStatus: true,
                        queuedAt: true,
                        queuedBy: true,
                        createdAt: true,
                    },
                },
                seller: { select: { name: true, email: true } },
            },
        });

        res.json({ products });
    } catch (err) {
        next(err);
    }
});

adminRouter.patch('/products/queue-low-confidence', requireAdmin, requireAdminPermission('content:moderate'), async (req: AdminRequest, res, next) => {
    try {
        const body = QueueLowConfidenceSchema.parse(req.body ?? {});
        const threshold = body.threshold ?? 0.6;

        const result = await (prisma as any).productAiAssessment.updateMany({
            where: {
                confidence: { lte: threshold },
                moderationStatus: { not: 'PENDING' },
                product: body.includeDeleted ? undefined : { is: { deletedAt: null } },
            },
            data: {
                moderationStatus: 'PENDING',
                queuedAt: new Date(),
                queuedBy: req.admin!.email,
                moderationReason: `Auto-enqueue do AI confidence <= ${threshold}`,
            },
        });

        await writeAdminAuditLog(req, {
            adminEmail: req.admin!.email,
            adminRole: req.admin!.role,
            action: 'products.ai_queue_low_confidence',
            resource: 'product',
            status: 'success',
            metadata: { threshold, queuedCount: result.count },
        }).catch(() => undefined);

        res.json({ queued: result.count, threshold });
    } catch (err) {
        next(err);
    }
});

adminRouter.patch('/products/:id/queue-moderation', requireAdmin, requireAdminPermission('content:moderate'), async (req: AdminRequest, res, next) => {
    try {
        const productId = z.string().uuid().parse(req.params.id);

        const updated = await (prisma as any).productAiAssessment.update({
            where: { productId },
            data: {
                moderationStatus: 'PENDING',
                queuedAt: new Date(),
                queuedBy: req.admin!.email,
                moderationReason: 'Manual queue from products table',
            },
            select: { productId: true, moderationStatus: true, queuedAt: true, queuedBy: true },
        });

        await writeAdminAuditLog(req, {
            adminEmail: req.admin!.email,
            adminRole: req.admin!.role,
            action: 'products.ai_queue_single',
            resource: 'product',
            resourceId: productId,
            status: 'success',
        }).catch(() => undefined);

        res.json({ queued: updated });
    } catch (err) {
        next(err);
    }
});

adminRouter.delete('/products/:id', requireAdmin, requireAdminPermission('content:moderate'), async (req: AdminRequest, res, next) => {
    try {
        const productId = z.string().uuid().parse(req.params.id);

        const updated = await (prisma as any).product.updateMany({
            where: { id: productId, deletedAt: null },
            data: { deletedAt: new Date() },
        });
        if (updated.count === 0) return res.status(404).json({ error: 'Không tìm thấy sản phẩm để xóa mềm' });

        await writeAdminAuditLog(req, {
            adminEmail: req.admin!.email,
            adminRole: req.admin!.role,
            action: 'products.soft_delete',
            resource: 'product',
            resourceId: productId,
            status: 'success',
        }).catch(() => undefined);

        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

adminRouter.patch('/products/:id/restore', requireAdmin, requireAdminPermission('content:moderate'), async (req: AdminRequest, res, next) => {
    try {
        const productId = z.string().uuid().parse(req.params.id);
        const updated = await (prisma as any).product.updateMany({
            where: { id: productId, deletedAt: { not: null } },
            data: { deletedAt: null },
        });
        if (updated.count === 0) return res.status(404).json({ error: 'Không tìm thấy sản phẩm để khôi phục' });

        await writeAdminAuditLog(req, {
            adminEmail: req.admin!.email,
            adminRole: req.admin!.role,
            action: 'products.restore',
            resource: 'product',
            resourceId: productId,
            status: 'success',
        }).catch(() => undefined);

        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

adminRouter.get('/posts', requireAdmin, requireAdminPermission('content:read'), async (req, res, next) => {
    try {
        const query = ListQuerySchema.parse(req.query);

        const where: Record<string, unknown> = {
            ...(query.includeDeleted ? {} : { deletedAt: null }),
        };
        if (query.search) {
            (where as any).OR = [
                { content: { contains: query.search, mode: 'insensitive' } },
                { author: { name: { contains: query.search, mode: 'insensitive' } } },
            ];
        }

        const posts = await (prisma as any).post.findMany({
            where: where as any,
            take: query.take ?? 100,
            orderBy: { createdAt: 'desc' },
            include: {
                author: { select: { name: true, email: true } },
                _count: { select: { comments: true } },
            },
        });

        res.json({
            posts: posts.map((post: any) => ({
                id: post.id,
                author: post.author,
                content: post.content,
                likes: post.likeCount,
                comments: post._count?.comments ?? 0,
                createdAt: post.createdAt,
                deletedAt: post.deletedAt,
                moderationStatus: post.moderationStatus,
                moderatedAt: post.moderatedAt,
                moderatedBy: post.moderatedBy,
            })),
        });
    } catch (err) {
        next(err);
    }
});

adminRouter.delete('/posts/:id', requireAdmin, requireAdminPermission('content:moderate'), async (req: AdminRequest, res, next) => {
    try {
        const postId = z.string().uuid().parse(req.params.id);

        const updated = await (prisma as any).post.updateMany({
            where: { id: postId, deletedAt: null },
            data: { deletedAt: new Date() },
        });
        if (updated.count === 0) return res.status(404).json({ error: 'Không tìm thấy bài viết để xóa mềm' });

        await writeAdminAuditLog(req, {
            adminEmail: req.admin!.email,
            adminRole: req.admin!.role,
            action: 'posts.soft_delete',
            resource: 'post',
            resourceId: postId,
            status: 'success',
        }).catch(() => undefined);

        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

adminRouter.patch('/posts/:id/restore', requireAdmin, requireAdminPermission('content:moderate'), async (req: AdminRequest, res, next) => {
    try {
        const postId = z.string().uuid().parse(req.params.id);
        const updated = await (prisma as any).post.updateMany({
            where: { id: postId, deletedAt: { not: null } },
            data: { deletedAt: null },
        });
        if (updated.count === 0) return res.status(404).json({ error: 'Không tìm thấy bài viết để khôi phục' });

        await writeAdminAuditLog(req, {
            adminEmail: req.admin!.email,
            adminRole: req.admin!.role,
            action: 'posts.restore',
            resource: 'post',
            resourceId: postId,
            status: 'success',
        }).catch(() => undefined);

        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

adminRouter.get('/events', requireAdmin, requireAdminPermission('content:read'), async (req, res, next) => {
    try {
        const query = ListQuerySchema.parse(req.query);

        const where: Record<string, unknown> = {
            ...(query.includeDeleted ? {} : { deletedAt: null }),
        };
        if (query.search) {
            (where as any).OR = [
                { title: { contains: query.search, mode: 'insensitive' } },
                { location: { contains: query.search, mode: 'insensitive' } },
                { organizer: { contains: query.search, mode: 'insensitive' } },
            ];
        }

        const events = await (prisma as any).event.findMany({
            where: where as any,
            take: query.take ?? 100,
            orderBy: { startAt: 'desc' },
            include: { _count: { select: { rsvps: true } } },
        });

        res.json({
            events: events.map((event: any) => ({
                id: event.id,
                title: event.title,
                location: event.location,
                organizer: event.organizer,
                startAt: event.startAt,
                attendees: event._count?.rsvps ?? 0,
                createdAt: event.createdAt,
                deletedAt: event.deletedAt,
                moderationStatus: event.moderationStatus,
                moderatedAt: event.moderatedAt,
                moderatedBy: event.moderatedBy,
            })),
        });
    } catch (err) {
        next(err);
    }
});

adminRouter.delete('/events/:id', requireAdmin, requireAdminPermission('content:moderate'), async (req: AdminRequest, res, next) => {
    try {
        const eventId = z.string().uuid().parse(req.params.id);

        const updated = await (prisma as any).event.updateMany({
            where: { id: eventId, deletedAt: null },
            data: { deletedAt: new Date() },
        });
        if (updated.count === 0) return res.status(404).json({ error: 'Không tìm thấy sự kiện để xóa mềm' });

        await writeAdminAuditLog(req, {
            adminEmail: req.admin!.email,
            adminRole: req.admin!.role,
            action: 'events.soft_delete',
            resource: 'event',
            resourceId: eventId,
            status: 'success',
        }).catch(() => undefined);

        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

adminRouter.patch('/events/:id/restore', requireAdmin, requireAdminPermission('content:moderate'), async (req: AdminRequest, res, next) => {
    try {
        const eventId = z.string().uuid().parse(req.params.id);
        const updated = await (prisma as any).event.updateMany({
            where: { id: eventId, deletedAt: { not: null } },
            data: { deletedAt: null },
        });
        if (updated.count === 0) return res.status(404).json({ error: 'Không tìm thấy sự kiện để khôi phục' });

        await writeAdminAuditLog(req, {
            adminEmail: req.admin!.email,
            adminRole: req.admin!.role,
            action: 'events.restore',
            resource: 'event',
            resourceId: eventId,
            status: 'success',
        }).catch(() => undefined);

        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

adminRouter.get('/pollution', requireAdmin, requireAdminPermission('content:read'), async (req, res, next) => {
    try {
        const query = ListQuerySchema.parse(req.query);

        const where: Record<string, unknown> = {
            ...(query.includeDeleted ? {} : { deletedAt: null }),
        };
        if (query.search) {
            (where as any).OR = [
                { description: { contains: query.search, mode: 'insensitive' } },
                { type: { contains: query.search, mode: 'insensitive' } },
            ];
        }

        const reports = await (prisma as any).pollutionReport.findMany({
            where: where as any,
            take: query.take ?? 200,
            orderBy: { createdAt: 'desc' },
            include: { owner: { select: { name: true, email: true } } },
        });

        res.json({
            reports: reports.map((report: any) => ({
                id: report.id,
                type: report.type,
                severity: report.severity,
                description: report.description,
                isAnonymous: report.isAnonymous,
                owner: report.owner,
                createdAt: report.createdAt,
                deletedAt: report.deletedAt,
                moderationStatus: report.moderationStatus,
                moderatedAt: report.moderatedAt,
                moderatedBy: report.moderatedBy,
            })),
        });
    } catch (err) {
        next(err);
    }
});

adminRouter.delete('/pollution/:id', requireAdmin, requireAdminPermission('content:moderate'), async (req: AdminRequest, res, next) => {
    try {
        const reportId = z.string().uuid().parse(req.params.id);

        const updated = await (prisma as any).pollutionReport.updateMany({
            where: { id: reportId, deletedAt: null },
            data: { deletedAt: new Date() },
        });
        if (updated.count === 0) return res.status(404).json({ error: 'Không tìm thấy báo cáo để xóa mềm' });

        await writeAdminAuditLog(req, {
            adminEmail: req.admin!.email,
            adminRole: req.admin!.role,
            action: 'pollution.soft_delete',
            resource: 'pollution_report',
            resourceId: reportId,
            status: 'success',
        }).catch(() => undefined);

        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

adminRouter.patch('/pollution/:id/restore', requireAdmin, requireAdminPermission('content:moderate'), async (req: AdminRequest, res, next) => {
    try {
        const reportId = z.string().uuid().parse(req.params.id);
        const updated = await (prisma as any).pollutionReport.updateMany({
            where: { id: reportId, deletedAt: { not: null } },
            data: { deletedAt: null },
        });
        if (updated.count === 0) return res.status(404).json({ error: 'Không tìm thấy báo cáo để khôi phục' });

        await writeAdminAuditLog(req, {
            adminEmail: req.admin!.email,
            adminRole: req.admin!.role,
            action: 'pollution.restore',
            resource: 'pollution_report',
            resourceId: reportId,
            status: 'success',
        }).catch(() => undefined);

        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

adminRouter.get('/moderation/queue', requireAdmin, requireAdminPermission('content:read'), async (req, res, next) => {
    try {
        const query = ModerationQueueQuerySchema.parse(req.query);
        const take = query.take ?? 120;
        const resources = query.resource ? [query.resource] : ['posts', 'events', 'pollution', 'products'];
        const search = query.search?.trim();
        const sortMode = query.sort ?? 'newest';

        const postsWhere = {
            deletedAt: null,
            moderationStatus: 'PENDING',
            ...(search
                ? {
                    OR: [
                        { content: { contains: search, mode: 'insensitive' } },
                        { author: { name: { contains: search, mode: 'insensitive' } } },
                    ],
                }
                : {}),
        };

        const eventsWhere = {
            deletedAt: null,
            moderationStatus: 'PENDING',
            ...(search
                ? {
                    OR: [
                        { title: { contains: search, mode: 'insensitive' } },
                        { location: { contains: search, mode: 'insensitive' } },
                        { organizer: { contains: search, mode: 'insensitive' } },
                    ],
                }
                : {}),
        };

        const pollutionWhere = {
            deletedAt: null,
            moderationStatus: 'PENDING',
            ...(search
                ? {
                    OR: [
                        { description: { contains: search, mode: 'insensitive' } },
                        { type: { contains: search, mode: 'insensitive' } },
                    ],
                }
                : {}),
        };

        const productsWhere = {
            deletedAt: null,
            aiAssessment: { is: { moderationStatus: 'PENDING' } },
            ...(search
                ? {
                    OR: [
                        { title: { contains: search, mode: 'insensitive' } },
                        { category: { contains: search, mode: 'insensitive' } },
                        { location: { contains: search, mode: 'insensitive' } },
                        { seller: { name: { contains: search, mode: 'insensitive' } } },
                    ],
                }
                : {}),
        };

        const [posts, events, reports, products] = await Promise.all([
            resources.includes('posts')
                ? (prisma as any).post.findMany({
                    where: postsWhere,
                    include: { author: { select: { name: true, email: true } } },
                    orderBy: { createdAt: 'desc' },
                    take,
                })
                : Promise.resolve([]),
            resources.includes('events')
                ? (prisma as any).event.findMany({
                    where: eventsWhere,
                    orderBy: { createdAt: 'desc' },
                    take,
                })
                : Promise.resolve([]),
            resources.includes('pollution')
                ? (prisma as any).pollutionReport.findMany({
                    where: pollutionWhere,
                    include: { owner: { select: { name: true, email: true } } },
                    orderBy: { createdAt: 'desc' },
                    take,
                })
                : Promise.resolve([]),
            resources.includes('products')
                ? (prisma as any).product.findMany({
                    where: productsWhere,
                    include: {
                        seller: { select: { name: true, email: true } },
                        aiAssessment: {
                            select: {
                                confidence: true,
                                category: true,
                                moistureState: true,
                                impurityLevel: true,
                                summary: true,
                                provider: true,
                                model: true,
                                moderationReason: true,
                                queuedAt: true,
                            },
                        },
                    },
                    orderBy: sortMode === 'risk_desc'
                        ? ([
                            { aiAssessment: { confidence: 'asc' } },
                            { createdAt: 'desc' },
                        ] as any)
                        : ({ createdAt: 'desc' } as any),
                    take,
                })
                : Promise.resolve([]),
        ]);

        let queue = [
            ...posts.map((post: any) => ({
                id: post.id,
                resource: 'posts',
                title: post.content,
                subtitle: post.author?.name || post.author?.email || 'Unknown author',
                createdAt: post.createdAt,
            })),
            ...events.map((event: any) => ({
                id: event.id,
                resource: 'events',
                title: event.title,
                subtitle: event.organizer || event.location || 'Unknown organizer',
                createdAt: event.createdAt,
            })),
            ...reports.map((report: any) => ({
                id: report.id,
                resource: 'pollution',
                title: `${report.type} (mức ${report.severity}/5)`,
                subtitle: report.description,
                createdAt: report.createdAt,
            })),
            ...products.map((product: any) => ({
                id: product.id,
                resource: 'products',
                title: product.title,
                subtitle: `AI ${Math.round(Number(product.aiAssessment?.confidence ?? 0) * 100)}% · ${product.aiAssessment?.category ?? 'Khác'} · ${product.seller?.name ?? 'Unknown seller'}`,
                createdAt: product.aiAssessment?.queuedAt ?? product.createdAt,
                riskScore: Number(product.aiAssessment?.confidence ?? 1),
                ai: product.aiAssessment
                    ? {
                        confidence: Number(product.aiAssessment.confidence ?? 0),
                        category: product.aiAssessment.category,
                        moisture_state: product.aiAssessment.moistureState,
                        impurity_level: product.aiAssessment.impurityLevel,
                        summary: product.aiAssessment.summary,
                        provider: product.aiAssessment.provider,
                        model: product.aiAssessment.model,
                        moderation_reason: product.aiAssessment.moderationReason,
                        queued_at: product.aiAssessment.queuedAt,
                    }
                    : null,
            })),
        ];

        if (query.resource === 'products' && sortMode === 'risk_desc') {
            queue = queue
                .sort((a: any, b: any) => {
                    const riskDiff = Number(a.riskScore ?? 1) - Number(b.riskScore ?? 1);
                    if (riskDiff !== 0) return riskDiff;
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                })
                .slice(0, take);
        } else {
            queue = queue
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, take);
        }

        const [postsCount, eventsCount, pollutionCount, productsCount] = await Promise.all([
            (prisma as any).post.count({ where: postsWhere }),
            (prisma as any).event.count({ where: eventsWhere }),
            (prisma as any).pollutionReport.count({ where: pollutionWhere }),
            (prisma as any).product.count({ where: productsWhere }),
        ]);

        res.json({
            queue,
            counts: {
                all: postsCount + eventsCount + pollutionCount + productsCount,
                posts: postsCount,
                events: eventsCount,
                pollution: pollutionCount,
                products: productsCount,
            },
        });
    } catch (err) {
        next(err);
    }
});

adminRouter.patch('/moderation/:resource/:id/approve', requireAdmin, requireAdminPermission('content:moderate'), async (req: AdminRequest, res, next) => {
    try {
        const resource = z.enum(['posts', 'events', 'pollution', 'products']).parse(req.params.resource);
        const resourceId = z.string().uuid().parse(req.params.id);
        const body = ModerateDecisionSchema.parse(req.body ?? {});
        const moderationData = {
            moderationStatus: 'APPROVED',
            moderatedAt: new Date(),
            moderatedBy: req.admin!.email,
            deletedAt: null,
        };

        if (resource === 'posts') {
            await (prisma as any).post.update({ where: { id: resourceId }, data: moderationData });
        } else if (resource === 'events') {
            await (prisma as any).event.update({ where: { id: resourceId }, data: moderationData });
        } else if (resource === 'pollution') {
            await (prisma as any).pollutionReport.update({ where: { id: resourceId }, data: moderationData });
        } else {
            await (prisma as any).productAiAssessment.update({
                where: { productId: resourceId },
                data: {
                    moderationStatus: 'APPROVED',
                    moderatedAt: new Date(),
                    moderatedBy: req.admin!.email,
                    moderationReason: body.reason,
                },
            });
            await (prisma as any).product.updateMany({ where: { id: resourceId }, data: { deletedAt: null } });
        }

        await writeAdminAuditLog(req, {
            adminEmail: req.admin!.email,
            adminRole: req.admin!.role,
            action: `moderation.${resource}.approve`,
            resource,
            resourceId,
            status: 'success',
            message: body.reason,
        }).catch(() => undefined);

        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

adminRouter.patch('/moderation/:resource/:id/reject', requireAdmin, requireAdminPermission('content:moderate'), async (req: AdminRequest, res, next) => {
    try {
        const resource = z.enum(['posts', 'events', 'pollution', 'products']).parse(req.params.resource);
        const resourceId = z.string().uuid().parse(req.params.id);
        const body = ModerateDecisionSchema.parse(req.body ?? {});
        const moderationData = {
            moderationStatus: 'REJECTED',
            moderatedAt: new Date(),
            moderatedBy: req.admin!.email,
            deletedAt: new Date(),
        };

        if (resource === 'posts') {
            await (prisma as any).post.update({ where: { id: resourceId }, data: moderationData });
        } else if (resource === 'events') {
            await (prisma as any).event.update({ where: { id: resourceId }, data: moderationData });
        } else if (resource === 'pollution') {
            await (prisma as any).pollutionReport.update({ where: { id: resourceId }, data: moderationData });
        } else {
            await (prisma as any).productAiAssessment.update({
                where: { productId: resourceId },
                data: {
                    moderationStatus: 'REJECTED',
                    moderatedAt: new Date(),
                    moderatedBy: req.admin!.email,
                    moderationReason: body.reason,
                },
            });
            await (prisma as any).product.updateMany({ where: { id: resourceId }, data: { deletedAt: new Date() } });
        }

        await writeAdminAuditLog(req, {
            adminEmail: req.admin!.email,
            adminRole: req.admin!.role,
            action: `moderation.${resource}.reject`,
            resource,
            resourceId,
            status: 'success',
            message: body.reason,
        }).catch(() => undefined);

        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

adminRouter.get('/analytics/overview', requireAdmin, requireAdminPermission('dashboard:read'), async (req, res, next) => {
    try {
        const query = AnalyticsQuerySchema.parse(req.query);
        const days = query.days ?? 14;
        const fromDate = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);

        const [
            pendingProducts,
            pendingPosts,
            pendingEvents,
            pendingPollution,
            failedLogins1h,
            lockedUsers,
            totalUsers,
            totalProducts,
        ] = await Promise.all([
            (prisma as any).productAiAssessment.count({ where: { moderationStatus: 'PENDING', product: { is: { deletedAt: null } } } }),
            (prisma as any).post.count({ where: { deletedAt: null, moderationStatus: 'PENDING' } }),
            (prisma as any).event.count({ where: { deletedAt: null, moderationStatus: 'PENDING' } }),
            (prisma as any).pollutionReport.count({ where: { deletedAt: null, moderationStatus: 'PENDING' } }),
            (prisma as any).loginAttempt.count({ where: { success: false, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } }),
            (prisma as any).user.count({ where: { lockedUntil: { gt: new Date() } } }),
            (prisma as any).user.count(),
            (prisma as any).product.count({ where: { deletedAt: null } }),
        ]);

        const [usersByDay, auditByDay] = await Promise.all([
            (prisma as any).user.groupBy({
                by: ['createdAt'],
                where: { createdAt: { gte: startOfDay(fromDate) } },
                _count: { _all: true },
                orderBy: { createdAt: 'asc' },
            }),
            (prisma as any).adminAuditLog.groupBy({
                by: ['createdAt'],
                where: { createdAt: { gte: startOfDay(fromDate) } },
                _count: { _all: true },
                orderBy: { createdAt: 'asc' },
            }),
        ]);

        const timelineMap = new Map<string, { date: string; usersCreated: number; adminActions: number }>();
        for (let i = 0; i < days; i++) {
            const date = new Date(fromDate.getTime() + i * 24 * 60 * 60 * 1000);
            const key = startOfDay(date).toISOString().slice(0, 10);
            timelineMap.set(key, { date: key, usersCreated: 0, adminActions: 0 });
        }

        for (const row of usersByDay) {
            const key = startOfDay(new Date(row.createdAt)).toISOString().slice(0, 10);
            const current = timelineMap.get(key);
            if (current) current.usersCreated += row._count?._all ?? 0;
        }

        for (const row of auditByDay) {
            const key = startOfDay(new Date(row.createdAt)).toISOString().slice(0, 10);
            const current = timelineMap.get(key);
            if (current) current.adminActions += row._count?._all ?? 0;
        }

        res.json({
            kpis: {
                totalUsers,
                totalProducts,
                pendingModeration: pendingProducts + pendingPosts + pendingEvents + pendingPollution,
                pendingBreakdown: {
                    products: pendingProducts,
                    posts: pendingPosts,
                    events: pendingEvents,
                    pollution: pendingPollution,
                },
                failedLogins1h,
                lockedUsers,
            },
            timeline: [...timelineMap.values()],
        });
    } catch (err) {
        next(err);
    }
});

adminRouter.get('/analytics/ai-events', requireAdmin, requireAdminPermission('dashboard:read'), async (req, res, next) => {
    try {
        const query = AiEventsAnalyticsQuerySchema.parse(req.query);
        const weeks = query.weeks ?? 8;
        const moduleFilter = query.module ?? 'RECOMMENDATIONS';

        const currentWeekStart = startOfWeek(new Date());
        const fromWeekStart = addDays(currentWeekStart, -(weeks - 1) * 7);

        const rows: Array<{
            week_start: string;
            week_end: string;
            impressions: number;
            clicks: number;
            carts: number;
            inquiries: number;
            accepted: number;
        }> = [];

        const rowByWeekKey = new Map<string, (typeof rows)[number]>();

        for (let i = 0; i < weeks; i += 1) {
            const weekStart = addDays(fromWeekStart, i * 7);
            const weekEnd = addDays(weekStart, 6);
            const weekKey = weekStart.toISOString().slice(0, 10);
            const bucket = {
                week_start: weekKey,
                week_end: weekEnd.toISOString().slice(0, 10),
                impressions: 0,
                clicks: 0,
                carts: 0,
                inquiries: 0,
                accepted: 0,
            };
            rows.push(bucket);
            rowByWeekKey.set(weekKey, bucket);
        }

        const events = await (prisma as any).aiUsageEvent.findMany({
            where: {
                createdAt: { gte: fromWeekStart },
                module: moduleFilter,
                eventType: { in: ['IMPRESSION', 'CLICK', 'CART_ADD', 'INQUIRY_OPEN', 'INQUIRY_ACCEPTED'] },
            },
            select: {
                eventType: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
            take: 100_000,
        });

        for (const event of events as Array<{ eventType: string; createdAt: Date }>) {
            const weekKey = startOfWeek(new Date(event.createdAt)).toISOString().slice(0, 10);
            const bucket = rowByWeekKey.get(weekKey);
            if (!bucket) continue;

            if (event.eventType === 'IMPRESSION') bucket.impressions += 1;
            if (event.eventType === 'CLICK') bucket.clicks += 1;
            if (event.eventType === 'CART_ADD') bucket.carts += 1;
            if (event.eventType === 'INQUIRY_OPEN') bucket.inquiries += 1;
            if (event.eventType === 'INQUIRY_ACCEPTED') bucket.accepted += 1;
        }

        const timeline = rows.map((row) => {
            const ctr = row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
            const cartRate = row.clicks > 0 ? (row.carts / row.clicks) * 100 : 0;
            const inquiryRate = row.clicks > 0 ? (row.inquiries / row.clicks) * 100 : 0;
            const acceptedRate = row.inquiries > 0 ? (row.accepted / row.inquiries) * 100 : 0;
            const acceptedFromClick = row.clicks > 0 ? (row.accepted / row.clicks) * 100 : 0;
            const acceptedFromImpression = row.impressions > 0 ? (row.accepted / row.impressions) * 100 : 0;

            return {
                ...row,
                ctr_pct: round2(ctr),
                cart_rate_pct: round2(cartRate),
                inquiry_rate_pct: round2(inquiryRate),
                accepted_rate_pct: round2(acceptedRate),
                accepted_from_click_pct: round2(acceptedFromClick),
                accepted_from_impression_pct: round2(acceptedFromImpression),
            };
        });

        const totalsRaw = timeline.reduce(
            (acc, row) => {
                acc.impressions += row.impressions;
                acc.clicks += row.clicks;
                acc.carts += row.carts;
                acc.inquiries += row.inquiries;
                acc.accepted += row.accepted;
                return acc;
            },
            { impressions: 0, clicks: 0, carts: 0, inquiries: 0, accepted: 0 },
        );

        const totals = {
            ...totalsRaw,
            ctr_pct: round2(totalsRaw.impressions > 0 ? (totalsRaw.clicks / totalsRaw.impressions) * 100 : 0),
            cart_rate_pct: round2(totalsRaw.clicks > 0 ? (totalsRaw.carts / totalsRaw.clicks) * 100 : 0),
            inquiry_rate_pct: round2(totalsRaw.clicks > 0 ? (totalsRaw.inquiries / totalsRaw.clicks) * 100 : 0),
            accepted_rate_pct: round2(totalsRaw.inquiries > 0 ? (totalsRaw.accepted / totalsRaw.inquiries) * 100 : 0),
            accepted_from_click_pct: round2(totalsRaw.clicks > 0 ? (totalsRaw.accepted / totalsRaw.clicks) * 100 : 0),
            accepted_from_impression_pct: round2(
                totalsRaw.impressions > 0 ? (totalsRaw.accepted / totalsRaw.impressions) * 100 : 0,
            ),
        };

        res.json({
            module: moduleFilter,
            weeks,
            from: fromWeekStart.toISOString().slice(0, 10),
            to: addDays(currentWeekStart, 6).toISOString().slice(0, 10),
            totals,
            timeline,
        });
    } catch (err) {
        next(err);
    }
});

adminRouter.get('/analytics/alerts', requireAdmin, requireAdminPermission('dashboard:read'), async (_req, res, next) => {
    try {
        const [pendingProducts, pendingPosts, pendingEvents, pendingPollution, lockedUsers, failedLogins1h] = await Promise.all([
            (prisma as any).productAiAssessment.count({ where: { moderationStatus: 'PENDING', product: { is: { deletedAt: null } } } }),
            (prisma as any).post.count({ where: { deletedAt: null, moderationStatus: 'PENDING' } }),
            (prisma as any).event.count({ where: { deletedAt: null, moderationStatus: 'PENDING' } }),
            (prisma as any).pollutionReport.count({ where: { deletedAt: null, moderationStatus: 'PENDING' } }),
            (prisma as any).user.count({ where: { lockedUntil: { gt: new Date() } } }),
            (prisma as any).loginAttempt.count({ where: { success: false, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } }),
        ]);

        const metrics = getMetricsSnapshot();
        const totalRequests = metrics.requests.total || 0;
        const serverErrors = metrics.requests.status['5xx'] || 0;
        const serverErrorRate = totalRequests > 0 ? Number((serverErrors / totalRequests).toFixed(4)) : 0;

        const alerts: Array<{ id: string; level: 'info' | 'warning' | 'critical'; title: string; detail: string }> = [];
        const pendingTotal = pendingProducts + pendingPosts + pendingEvents + pendingPollution;

        if (pendingTotal >= 30) {
            alerts.push({
                id: 'pending-moderation-high',
                level: 'critical',
                title: 'Tồn đọng kiểm duyệt cao',
                detail: `${pendingTotal} mục đang chờ duyệt (${pendingProducts} sản phẩm, ${pendingPosts} bài viết, ${pendingEvents} sự kiện, ${pendingPollution} báo cáo).`,
            });
        } else if (pendingTotal >= 10) {
            alerts.push({
                id: 'pending-moderation-medium',
                level: 'warning',
                title: 'Tồn đọng kiểm duyệt',
                detail: `${pendingTotal} mục đang chờ duyệt.`,
            });
        }

        if (lockedUsers > 0) {
            alerts.push({
                id: 'locked-users',
                level: lockedUsers >= 10 ? 'critical' : 'warning',
                title: 'Tài khoản đang bị khóa',
                detail: `${lockedUsers} người dùng đang trong trạng thái khóa tạm thời.`,
            });
        }

        if (failedLogins1h >= 20) {
            alerts.push({
                id: 'failed-logins',
                level: 'critical',
                title: 'Đăng nhập thất bại tăng cao',
                detail: `${failedLogins1h} lần đăng nhập thất bại trong 1 giờ gần nhất.`,
            });
        } else if (failedLogins1h >= 8) {
            alerts.push({
                id: 'failed-logins-warning',
                level: 'warning',
                title: 'Đăng nhập thất bại tăng',
                detail: `${failedLogins1h} lần đăng nhập thất bại trong 1 giờ gần nhất.`,
            });
        }

        if (serverErrorRate >= 0.05) {
            alerts.push({
                id: 'server-error-rate',
                level: 'critical',
                title: 'Tỷ lệ lỗi máy chủ cao',
                detail: `Tỷ lệ phản hồi 5xx là ${(serverErrorRate * 100).toFixed(2)}%.`,
            });
        }

        if (alerts.length === 0) {
            alerts.push({
                id: 'healthy',
                level: 'info',
                title: 'Hệ thống ổn định',
                detail: 'Không phát hiện cảnh báo nghiêm trọng tại thời điểm này.',
            });
        }

        res.json({ alerts });
    } catch (err) {
        next(err);
    }
});

adminRouter.get('/analytics/sla', requireAdmin, requireAdminPermission('dashboard:read'), async (_req, res, next) => {
    try {
        const metrics = getMetricsSnapshot();
        const total = metrics.requests.total || 0;
        const s2 = metrics.requests.status['2xx'] || 0;
        const s3 = metrics.requests.status['3xx'] || 0;
        const s4 = metrics.requests.status['4xx'] || 0;
        const s5 = metrics.requests.status['5xx'] || 0;
        const successRate = total > 0 ? Number((((s2 + s3) / total) * 100).toFixed(2)) : 100;
        const errorRate = total > 0 ? Number(((s5 / total) * 100).toFixed(2)) : 0;

        const health =
            successRate >= 99 && metrics.requests.avgDurationMs <= 600 && errorRate < 1
                ? 'good'
                : successRate >= 97 && metrics.requests.avgDurationMs <= 1000 && errorRate < 3
                    ? 'warning'
                    : 'critical';

        res.json({
            sla: {
                health,
                availabilityPercent: successRate,
                serverErrorPercent: errorRate,
                avgLatencyMs: metrics.requests.avgDurationMs,
                maxLatencyMs: metrics.requests.maxDurationMs,
                totalRequests: total,
                statusBuckets: { '2xx': s2, '3xx': s3, '4xx': s4, '5xx': s5 },
            },
        });
    } catch (err) {
        next(err);
    }
});

adminRouter.get('/audit-summary', requireAdmin, requireAdminPermission('audit:read'), async (req, res, next) => {
    try {
        const query = AnalyticsQuerySchema.parse(req.query);
        const days = query.days ?? 14;
        const fromDate = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);

        const [topActions, recentDenied, totalActions] = await Promise.all([
            (prisma as any).adminAuditLog.groupBy({
                by: ['action'],
                where: { createdAt: { gte: startOfDay(fromDate) } },
                _count: { _all: true },
                orderBy: { _count: { action: 'desc' } },
                take: 10,
            }),
            (prisma as any).adminAuditLog.findMany({
                where: { createdAt: { gte: startOfDay(fromDate) }, status: { in: ['denied', 'error'] } },
                orderBy: { createdAt: 'desc' },
                take: 20,
            }),
            (prisma as any).adminAuditLog.count({
                where: { createdAt: { gte: startOfDay(fromDate) } },
            }),
        ]);

        res.json({
            windowDays: days,
            totalActions,
            topActions: topActions.map((item: any) => ({
                action: item.action,
                count: item._count?._all ?? 0,
            })),
            incidents: recentDenied.map((item: any) => ({
                id: item.id,
                adminEmail: item.adminEmail,
                action: item.action,
                resource: item.resource,
                status: item.status,
                message: item.message,
                createdAt: item.createdAt,
            })),
        });
    } catch (err) {
        next(err);
    }
});

adminRouter.get('/audit-logs', requireAdmin, requireAdminPermission('audit:read'), async (req, res, next) => {
    try {
        const query = AuditQuerySchema.parse(req.query);
        const where: Record<string, unknown> = {};
        if (query.action) where.action = query.action;
        if (query.resource) where.resource = query.resource;
        if (query.adminEmail) where.adminEmail = query.adminEmail.toLowerCase();

        const logs = await (prisma as any).adminAuditLog.findMany({
            where,
            take: query.take ?? 100,
            orderBy: { createdAt: 'desc' },
        });

        res.json({
            logs: logs.map((log: any) => ({
                id: log.id,
                adminEmail: log.adminEmail,
                adminRole: String(log.adminRole || '').toLowerCase(),
                action: log.action,
                resource: log.resource,
                resourceId: log.resourceId,
                status: log.status,
                message: log.message,
                ip: log.ip,
                requestId: log.requestId,
                metadata: typeof log.metadataJson === 'string' && log.metadataJson
                    ? JSON.parse(log.metadataJson)
                    : null,
                createdAt: log.createdAt,
            })),
        });
    } catch (err) {
        next(err);
    }
});
