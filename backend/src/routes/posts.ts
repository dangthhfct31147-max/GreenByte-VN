import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { optionalAuth, requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { publishCommunityEvent, subscribeCommunityEvents } from '../lib/realtime';

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

function parsePostTags(raw: unknown): string[] {
    if (Array.isArray(raw)) {
        return raw.filter((value): value is string => typeof value === 'string');
    }
    if (typeof raw !== 'string') return [];

    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((value): value is string => typeof value === 'string');
    } catch {
        return [];
    }
}

postsRouter.get('/posts/trending-topics', async (req, res, next) => {
    try {
        const query = z
            .object({
                take: z.coerce.number().int().min(1).max(20).optional(),
                sourcePosts: z.coerce.number().int().min(1).max(5000).optional(),
            })
            .parse(req.query);

        const rows = await (prisma as any).post.findMany({
            select: { tags: true },
            orderBy: { createdAt: 'desc' },
            take: query.sourcePosts ?? 2000,
        });

        const tagCounter = new Map<string, number>();

        for (const row of rows) {
            const tags = parsePostTags(row.tags);
            const uniqueTags = new Set(tags.map((tag) => tag.trim()).filter(Boolean));
            for (const tag of uniqueTags) {
                tagCounter.set(tag, (tagCounter.get(tag) ?? 0) + 1);
            }
        }

        const topics = [...tagCounter.entries()]
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => (b.count - a.count) || a.tag.localeCompare(b.tag, 'vi'))
            .slice(0, query.take ?? 6)
            .map((topic) => ({
                ...topic,
                label: `${topic.count} bài viết`,
            }));

        res.json({ topics });
    } catch (err) {
        next(err);
    }
});

postsRouter.get('/posts/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    res.write(`data: ${JSON.stringify({ type: 'connected', at: new Date().toISOString() })}\n\n`);

    const unsubscribe = subscribeCommunityEvents((event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    const heartbeat = setInterval(() => {
        res.write(`: ping ${Date.now()}\n\n`);
    }, 25000);

    req.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
        res.end();
    });
});

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
            tags: parsePostTags(p.tags),
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

        publishCommunityEvent({
            type: 'post_created',
            postId: created.id,
            createdAt: created.createdAt.toISOString(),
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
                tags: parsePostTags(created.tags),
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
        let nextLikeCount: number | null = null;

        // idempotent like: create like row if missing
        await (prisma as any).$transaction(async (tx: any) => {
            const existing = await tx.postLike.findUnique({
                where: { postId_userId: { postId, userId } },
                select: { id: true },
            });
            if (existing) return;

            await tx.postLike.create({ data: { postId, userId } });
            const updatedPost = await tx.post.update({
                where: { id: postId },
                data: { likeCount: { increment: 1 } },
                select: { likeCount: true },
            });
            nextLikeCount = updatedPost.likeCount;
        });

        if (nextLikeCount !== null) {
            publishCommunityEvent({
                type: 'like_changed',
                postId,
                likeCount: nextLikeCount,
                createdAt: new Date().toISOString(),
            });
        }

        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

postsRouter.delete('/posts/:id/like', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const userId = req.user!.id;
        const postId = z.string().uuid().parse(req.params.id);
        let nextLikeCount: number | null = null;

        await (prisma as any).$transaction(async (tx: any) => {
            const existing = await tx.postLike.findUnique({
                where: { postId_userId: { postId, userId } },
                select: { id: true },
            });
            if (!existing) return;

            await tx.postLike.delete({ where: { postId_userId: { postId, userId } } });
            const updatedPost = await tx.post.update({
                where: { id: postId },
                data: { likeCount: { decrement: 1 } },
                select: { likeCount: true },
            });
            nextLikeCount = updatedPost.likeCount;
        });

        if (nextLikeCount !== null) {
            publishCommunityEvent({
                type: 'like_changed',
                postId,
                likeCount: nextLikeCount,
                createdAt: new Date().toISOString(),
            });
        }

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
            created_at: row.createdAt.toISOString(),
            can_edit: Boolean(userId && row.author.id === userId),
        }));

        res.json({ comments, order: 'asc' });
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

        const commentCount = await (prisma as any).postComment.count({
            where: { postId },
        });

        const createdComment = {
            id: created.id,
            user_name: created.author.name,
            content: created.content,
            timestamp: humanizeFromDate(created.createdAt),
            created_at: created.createdAt.toISOString(),
        };

        publishCommunityEvent({
            type: 'comment_created',
            postId,
            commentCount,
            comment: createdComment,
            createdAt: created.createdAt.toISOString(),
        });

        res.status(201).json({
            comment: {
                ...createdComment,
                can_edit: true,
            },
        });
    } catch (err) {
        next(err);
    }
});
