import { Router } from 'express';
import { cache } from '../lib/cache';
import { prisma } from '../prisma';
import { getMetricsSnapshot } from '../lib/metrics';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
    res.json({
        status: 'ok',
        type: 'liveness',
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId,
        uptimeSeconds: Math.floor(process.uptime()),
    });
});

healthRouter.get('/health/ready', async (_req, res) => {
    let dbHealthy = false;
    try {
        await prisma.$queryRaw`SELECT 1`;
        dbHealthy = true;
    } catch {
        dbHealthy = false;
    }

    const redisHealthy = await cache.checkRedisHealth(1000);
    const aready = dbHealthy;

    const status = {
        status: ready ? 'ready' : 'not_ready',
        type: 'readiness',
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId,
        services: {
            database: dbHealthy ? 'healthy' : 'unhealthy',
            redis: redisHealthy ? 'healthy' : 'disconnected_or_not_configured',
        },
    };

    if (!ready) {
        return res.status(503).json(status);
    }

    return res.json(status);
});

healthRouter.get('/metrics', (_req, res) => {
    res.json({
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId,
        ...getMetricsSnapshot(),
    });
});
