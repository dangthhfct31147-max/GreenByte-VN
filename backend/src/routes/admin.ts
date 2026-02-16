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

export const adminRouter = Router();

const AdminLoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1).max(200),
});

const ListQuerySchema = z.object({
    take: z.coerce.number().int().min(1).max(500).optional(),
    search: z.string().optional(),
    includeDeleted: z.coerce.boolean().optional(),
});

const AuditQuerySchema = z.object({
    take: z.coerce.number().int().min(1).max(200).optional(),
    action: z.string().min(1).max(120).optional(),
    resource: z.string().min(1).max(120).optional(),
    adminEmail: z.string().email().optional(),
});

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
        const role = normalizeAdminRole(env.ADMIN_ROLE);
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

adminRouter.get('/products', requireAdmin, requireAdminPermission('content:read'), async (req, res, next) => {
    try {
        const query = ListQuerySchema.parse(req.query);

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
                seller: { select: { name: true, email: true } },
            },
        });

        res.json({ products });
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
