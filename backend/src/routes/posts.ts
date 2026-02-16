import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { optionalAuth, requireAuth, type AuthenticatedRequest } from '../middleware/auth';

export const postsRouter = Router();

function humanizeFromDate(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `${Math.max(1, diffMin)} phút trước`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH} giờ trước`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD} ngày trước`;
    const diffW = Math.floor(diffD / 7);
    return `${diffW} tuần trước`;
}

postsRouter.get('/posts', optionalAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const query = z
            .object({
                take: z.coerce.number().int().min(1).max(100).optional(),
            })
            .parse(req.query);

        const userId = req.user?.id;

        const rows = await (prisma as any).post.findMany({
            orderBy: { createdAt: 'desc' },
            take: query.take ?? 50,
            include: {
                author: { select: { name: true } },
                likes: userId ? { where: { userId }, select: { id: true } } : false,
                _count: { select: { comments: true } },
            },
        });

        const posts = rows.map((p: any) => ({
            id: p.id,
            user_name: p.author.name,
            content: p.content,
            image: p.imageUrl ?? undefined,
            likes: p.likeCount,
            comments: p._count?.comments ?? 0,
            timestamp: humanizeFromDate(p.createdAt),
            tags: typeof p.tags === 'string' ? JSON.parse(p.tags) : [],
            is_liked: Boolean(p.likes?.length),
        }));

        res.json({ posts });
    } catch (err) {
        next(err);
    }
});

const CreatePostSchema = z.object({
    content: z.string().min(1).max(5000),
    image: z.string().url().max(500).optional(),
    tags: z.array(z.string().max(100)).max(20).optional(),
});

postsRouter.post('/posts', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const userId = req.user!.id;
        const body = CreatePostSchema.parse(req.body);

        const created = await (prisma as any).post.create({
            data: {
                authorId: userId,
                content: body.content,
                imageUrl: body.image,
                tags: JSON.stringify(body.tags ?? []),
                likeCount: 0,
            },
            include: { author: { select: { name: true } } },
        });

        res.status(201).json({
            post: {
                id: created.id,
                user_name: created.author.name,
                content: created.content,
                image: created.imageUrl ?? undefined,
                likes: created.likeCount,
                comments: 0,
                timestamp: humanizeFromDate(created.createdAt),
                tags: typeof created.tags === 'string' ? JSON.parse(created.tags) : [],
                is_liked: false,
            },
        });
    } catch (err) {
        next(err);
    }
});

postsRouter.post('/posts/:id/like', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const userId = req.user!.id;
        const postId = z.string().uuid().parse(req.params.id);

        // idempotent like: create like row if missing
        await (prisma as any).$transaction(async (tx: any) => {
            const existing = await tx.postLike.findUnique({
                where: { postId_userId: { postId, userId } },
                select: { id: true },
            });
            if (existing) return;

            await tx.postLike.create({ data: { postId, userId } });
            await tx.post.update({ where: { id: postId }, data: { likeCount: { increment: 1 } } });
        });

        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

postsRouter.delete('/posts/:id/like', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const userId = req.user!.id;
        const postId = z.string().uuid().parse(req.params.id);

        await (prisma as any).$transaction(async (tx: any) => {
            const existing = await tx.postLike.findUnique({
                where: { postId_userId: { postId, userId } },
                select: { id: true },
            });
            if (!existing) return;

            await tx.postLike.delete({ where: { postId_userId: { postId, userId } } });
            await tx.post.update({ where: { id: postId }, data: { likeCount: { decrement: 1 } } });
        });

        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

postsRouter.get('/posts/:id/comments', optionalAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const postId = z.string().uuid().parse(req.params.id);
        const query = z
            .object({
                take: z.coerce.number().int().min(1).max(100).optional(),
            })
            .parse(req.query);

        const rows = await (prisma as any).postComment.findMany({
            where: { postId },
            orderBy: { createdAt: 'asc' },
            take: query.take ?? 50,
            include: {
                author: { select: { id: true, name: true } },
            },
        });

        const userId = req.user?.id;
        const comments = rows.map((row: any) => ({
            id: row.id,
            user_name: row.author.name,
            content: row.content,
            timestamp: humanizeFromDate(row.createdAt),
            can_edit: Boolean(userId && row.author.id === userId),
        }));

        res.json({ comments });
    } catch (err) {
        next(err);
    }
});

const CreateCommentSchema = z.object({
    content: z.string().min(1).max(1000),
});

postsRouter.post('/posts/:id/comments', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const postId = z.string().uuid().parse(req.params.id);
        const userId = req.user!.id;
        const body = CreateCommentSchema.parse(req.body);

        const existingPost = await (prisma as any).post.findUnique({
            where: { id: postId },
            select: { id: true },
        });

        if (!existingPost) {
            return res.status(404).json({ error: 'Bài viết không tồn tại' });
        }

        const created = await (prisma as any).postComment.create({
            data: {
                postId,
                authorId: userId,
                content: body.content.trim(),
            },
            include: {
                author: { select: { name: true } },
            },
        });

        res.status(201).json({
            comment: {
                id: created.id,
                user_name: created.author.name,
                content: created.content,
                timestamp: humanizeFromDate(created.createdAt),
                can_edit: true,
            },
        });
    } catch (err) {
        next(err);
    }
});
