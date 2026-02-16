import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { optionalAuth, requireAuth, type AuthenticatedRequest } from '../middleware/auth';

export const eventsRouter = Router();

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

// Events listing for Community tab
// Shape matches current UI mock.

eventsRouter.get('/events', optionalAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const query = z
            .object({
                take: z.coerce.number().int().min(1).max(100).optional(),
            })
            .parse(req.query);

        const userId = req.user?.id;

        const rows = await (prisma as any).event.findMany({
            where: { deletedAt: null },
            orderBy: { startAt: 'asc' },
            take: query.take ?? 50,
            include: {
                rsvps: userId ? { where: { userId }, select: { id: true } } : false,
                _count: { select: { rsvps: true } },
            },
        });

        const events = rows.map((e: any) => {
            const start = new Date(e.startAt);
            const mm = String(start.getMonth() + 1).padStart(2, '0');
            const dd = String(start.getDate()).padStart(2, '0');
            const hh = String(start.getHours()).padStart(2, '0');
            const min = String(start.getMinutes()).padStart(2, '0');

            const end = e.endAt ? new Date(e.endAt) : null;
            const endStr = end ? `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}` : null;

            return {
                id: e.id,
                title: e.title,
                date: dd,
                month: `TH${mm}`,
                time: endStr ? `${hh}:${min} - ${endStr}` : `${hh}:${min}`,
                location: e.location,
                image: e.imageUrl ?? 'https://images.unsplash.com/photo-1622383563227-04401cd4e5f4?q=80&w=600&auto=format&fit=crop',
                attendees: e._count?.rsvps ?? 0,
                description: e.description,
                organizer: e.organizer ?? 'Eco-Byproduct Team',
                is_going: Boolean(e.rsvps?.length),
                created_at: humanizeFromDate(e.createdAt),
            };
        });

        res.json({ events });
    } catch (err) {
        next(err);
    }
});

const CreateEventSchema = z.object({
    title: z.string().min(3).max(200),
    startAt: z.string().datetime(),
    endAt: z.string().datetime().optional(),
    location: z.string().min(3).max(200),
    image: z.string().url().max(500).optional(),
    description: z.string().min(1).max(5000),
    organizer: z.string().min(1).max(200).optional(),
});

// For now, allow any authenticated user to create an event.
// (Can be tightened later with roles.)

eventsRouter.post('/events', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const body = CreateEventSchema.parse(req.body);

        const created = await (prisma as any).event.create({
            data: {
                title: body.title,
                startAt: new Date(body.startAt),
                endAt: body.endAt ? new Date(body.endAt) : null,
                location: body.location,
                imageUrl: body.image,
                description: body.description,
                organizer: body.organizer,
            },
            include: { _count: { select: { rsvps: true } } },
        });

        res.status(201).json({
            event: {
                id: created.id,
                title: created.title,
                date: String(new Date(created.startAt).getDate()).padStart(2, '0'),
                month: `TH${String(new Date(created.startAt).getMonth() + 1).padStart(2, '0')}`,
                time: `${String(new Date(created.startAt).getHours()).padStart(2, '0')}:${String(new Date(created.startAt).getMinutes()).padStart(2, '0')}`,
                location: created.location,
                image: created.imageUrl ?? 'https://images.unsplash.com/photo-1622383563227-04401cd4e5f4?q=80&w=600&auto=format&fit=crop',
                attendees: created._count?.rsvps ?? 0,
                description: created.description,
                organizer: created.organizer ?? 'Eco-Byproduct Team',
                is_going: false,
            },
        });
    } catch (err) {
        next(err);
    }
});

// RSVP toggle endpoints

eventsRouter.post('/events/:id/rsvp', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const userId = req.user!.id;
        const eventId = z.string().uuid().parse(req.params.id);

        const event = await (prisma as any).event.findFirst({
            where: { id: eventId, deletedAt: null },
            select: { id: true },
        });

        if (!event) {
            return res.status(404).json({ error: 'Sự kiện không tồn tại' });
        }

        await (prisma as any).eventRsvp.upsert({
            where: { eventId_userId: { eventId, userId } },
            update: {},
            create: { eventId, userId },
        });

        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

eventsRouter.delete('/events/:id/rsvp', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const userId = req.user!.id;
        const eventId = z.string().uuid().parse(req.params.id);

        const event = await (prisma as any).event.findFirst({
            where: { id: eventId, deletedAt: null },
            select: { id: true },
        });
        if (!event) return res.status(404).json({ error: 'Sự kiện không tồn tại' });

        try {
            await (prisma as any).eventRsvp.delete({
                where: { eventId_userId: { eventId, userId } },
            });
        } catch (e: any) {
            if (e?.code !== 'P2025') throw e;
        }

        res.status(204).end();
    } catch (err) {
        next(err);
    }
});
