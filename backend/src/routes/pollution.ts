import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { optionalAuth, requireAuth, type AuthenticatedRequest } from '../middleware/auth';

export const pollutionRouter = Router();

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

pollutionRouter.get('/pollution', optionalAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const rows = await (prisma as any).pollutionReport.findMany({
            where: {
                deletedAt: null,
                moderationStatus: 'APPROVED',
            },
            orderBy: { createdAt: 'desc' },
            take: 500,
            include: { owner: { select: { name: true } } },
        });

        const markers = rows.map((m: any) => ({
            id: m.id,
            owner_id: m.ownerId,
            owner_name: m.isAnonymous ? undefined : m.owner?.name,
            lat: m.lat,
            lng: m.lng,
            type: m.type,
            severity: m.severity,
            description: m.description,
            created_at: humanizeFromDate(m.createdAt),
            is_anonymous: m.isAnonymous,
        }));

        res.json({ markers });
    } catch (err) {
        next(err);
    }
});

const CreateMarkerSchema = z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    type: z.enum(['WASTE', 'WATER', 'AIR', 'OTHER']),
    severity: z.number().int().min(1).max(5),
    description: z.string().min(3).max(2000),
    is_anonymous: z.boolean().default(false),
});

pollutionRouter.post('/pollution', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const userId = req.user!.id;
        const body = CreateMarkerSchema.parse(req.body);

        const created = await (prisma as any).pollutionReport.create({
            data: {
                ownerId: userId,
                lat: body.lat,
                lng: body.lng,
                type: body.type,
                severity: body.severity,
                description: body.description,
                isAnonymous: body.is_anonymous,
                moderationStatus: 'PENDING',
            },
            include: { owner: { select: { name: true } } },
        });

        res.status(201).json({
            marker: {
                id: created.id,
                owner_id: created.ownerId,
                owner_name: created.isAnonymous ? undefined : created.owner?.name,
                lat: created.lat,
                lng: created.lng,
                type: created.type,
                severity: created.severity,
                description: created.description,
                created_at: humanizeFromDate(created.createdAt),
                is_anonymous: created.isAnonymous,
            },
        });
    } catch (err) {
        next(err);
    }
});

pollutionRouter.delete('/pollution/:id', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const userId = req.user!.id;
        const id = z.string().uuid().parse(req.params.id);

        const existing = await (prisma as any).pollutionReport.findFirst({
            where: { id, deletedAt: null },
            select: { ownerId: true },
        });
        if (!existing) return res.status(204).end();
        if (existing.ownerId !== userId) return res.status(403).json({ error: 'Forbidden' });

        await (prisma as any).pollutionReport.delete({ where: { id } });
        res.status(204).end();
    } catch (err) {
        next(err);
    }
});
