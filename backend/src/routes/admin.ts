import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { getEnv } from '../env';
import { requireAdmin, type AdminRequest } from '../middleware/adminAuth';

export const adminRouter = Router();

const AdminLoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1).max(200),
});

function getAdminSecret() {
    const env = getEnv();
    return env.ADMIN_JWT_SECRET ?? env.JWT_SECRET;
}

function isAdminConfigured() {
    const env = getEnv();
    return Boolean(env.ADMIN_EMAIL && (env.ADMIN_PASSWORD || env.ADMIN_PASSWORD_HASH));
}

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

        if (normalizedEmail !== expectedEmail) {
            return res.status(401).json({ error: 'Sai thông tin đăng nhập admin' });
        }

        let passwordOk = false;
        if (env.ADMIN_PASSWORD_HASH) {
            passwordOk = await bcrypt.compare(body.password, env.ADMIN_PASSWORD_HASH);
        } else if (env.ADMIN_PASSWORD) {
            passwordOk = body.password === env.ADMIN_PASSWORD;
        }

        if (!passwordOk) {
            return res.status(401).json({ error: 'Sai thông tin đăng nhập admin' });
        }

        const token = jwt.sign(
            { role: 'admin', email: expectedEmail },
            getAdminSecret(),
            { expiresIn: '12h' }
        );

        res.json({ token, admin: { email: expectedEmail } });
    } catch (err) {
        next(err);
    }
});

adminRouter.get('/auth/me', requireAdmin, async (req: AdminRequest, res) => {
    res.json({ admin: req.admin });
});

adminRouter.get('/dashboard', requireAdmin, async (_req, res, next) => {
    try {
        const [users, products, posts, events, pollutionReports] = await Promise.all([
            (prisma as any).user.count(),
            (prisma as any).product.count(),
            (prisma as any).post.count(),
            (prisma as any).event.count(),
            (prisma as any).pollutionReport.count(),
        ]);

        const latestProducts = await (prisma as any).product.findMany({
            take: 5,
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

adminRouter.get('/users', requireAdmin, async (req, res, next) => {
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

adminRouter.get('/products', requireAdmin, async (req, res, next) => {
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
                    { title: { contains: query.search, mode: 'insensitive' } },
                    { category: { contains: query.search, mode: 'insensitive' } },
                    { location: { contains: query.search, mode: 'insensitive' } },
                ],
            }
            : undefined;

        const products = await (prisma as any).product.findMany({
            where,
            take: query.take ?? 100,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                title: true,
                category: true,
                priceVnd: true,
                location: true,
                createdAt: true,
                seller: { select: { name: true, email: true } },
            },
        });

        res.json({ products });
    } catch (err) {
        next(err);
    }
});

adminRouter.delete('/products/:id', requireAdmin, async (req, res, next) => {
    try {
        const productId = z.string().uuid().parse(req.params.id);

        await (prisma as any).$transaction(async (tx: any) => {
            await tx.cartItem.deleteMany({ where: { productId } });
            await tx.product.delete({ where: { id: productId } });
        });

        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

adminRouter.get('/posts', requireAdmin, async (req, res, next) => {
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
                    { content: { contains: query.search, mode: 'insensitive' } },
                    { author: { name: { contains: query.search, mode: 'insensitive' } } },
                ],
            }
            : undefined;

        const posts = await (prisma as any).post.findMany({
            where,
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
            })),
        });
    } catch (err) {
        next(err);
    }
});

adminRouter.delete('/posts/:id', requireAdmin, async (req, res, next) => {
    try {
        const postId = z.string().uuid().parse(req.params.id);

        await (prisma as any).$transaction(async (tx: any) => {
            await tx.postLike.deleteMany({ where: { postId } });
            await tx.postComment.deleteMany({ where: { postId } });
            await tx.post.delete({ where: { id: postId } });
        });

        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

adminRouter.get('/events', requireAdmin, async (req, res, next) => {
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
                    { title: { contains: query.search, mode: 'insensitive' } },
                    { location: { contains: query.search, mode: 'insensitive' } },
                    { organizer: { contains: query.search, mode: 'insensitive' } },
                ],
            }
            : undefined;

        const events = await (prisma as any).event.findMany({
            where,
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
            })),
        });
    } catch (err) {
        next(err);
    }
});

adminRouter.delete('/events/:id', requireAdmin, async (req, res, next) => {
    try {
        const eventId = z.string().uuid().parse(req.params.id);

        await (prisma as any).$transaction(async (tx: any) => {
            await tx.eventRsvp.deleteMany({ where: { eventId } });
            await tx.event.delete({ where: { id: eventId } });
        });

        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

adminRouter.get('/pollution', requireAdmin, async (req, res, next) => {
    try {
        const query = z
            .object({
                take: z.coerce.number().int().min(1).max(500).optional(),
                search: z.string().optional(),
            })
            .parse(req.query);

        const where = query.search
            ? {
                OR: [
                    { description: { contains: query.search, mode: 'insensitive' } },
                    { type: { contains: query.search, mode: 'insensitive' } },
                ],
            }
            : undefined;

        const reports = await (prisma as any).pollutionReport.findMany({
            where,
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
            })),
        });
    } catch (err) {
        next(err);
    }
});

adminRouter.delete('/pollution/:id', requireAdmin, async (req, res, next) => {
    try {
        const reportId = z.string().uuid().parse(req.params.id);
        await (prisma as any).pollutionReport.delete({ where: { id: reportId } });
        res.status(204).end();
    } catch (err) {
        next(err);
    }
});
