import type { NextFunction, Request, Response } from 'express';

type StatusBucket = '1xx' | '2xx' | '3xx' | '4xx' | '5xx';

type MetricsState = {
    startedAtMs: number;
    totalRequests: number;
    inflightRequests: number;
    totalDurationMs: number;
    maxDurationMs: number;
    statusCounts: Record<StatusBucket, number>;
};

const state: MetricsState = {
    startedAtMs: Date.now(),
    totalRequests: 0,
    inflightRequests: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    statusCounts: {
        '1xx': 0,
        '2xx': 0,
        '3xx': 0,
        '4xx': 0,
        '5xx': 0,
    },
};

function bucketForStatus(statusCode: number): StatusBucket {
    if (statusCode >= 500) return '5xx';
    if (statusCode >= 400) return '4xx';
    if (statusCode >= 300) return '3xx';
    if (statusCode >= 200) return '2xx';
    return '1xx';
}

export function requestMetricsMiddleware(req: Request, res: Response, next: NextFunction) {
    const startedAt = process.hrtime.bigint();
    state.totalRequests += 1;
    state.inflightRequests += 1;

    res.on('finish', () => {
        const durationNs = process.hrtime.bigint() - startedAt;
        const durationMs = Number(durationNs) / 1_000_000;

        state.inflightRequests = Math.max(0, state.inflightRequests - 1);
        state.totalDurationMs += durationMs;
        state.maxDurationMs = Math.max(state.maxDurationMs, durationMs);
        state.statusCounts[bucketForStatus(res.statusCode)] += 1;
    });

    next();
}

export function getMetricsSnapshot() {
    const avgDurationMs =
        state.totalRequests > 0 ? Number((state.totalDurationMs / state.totalRequests).toFixed(2)) : 0;

    return {
        uptimeSeconds: Math.floor((Date.now() - state.startedAtMs) / 1000),
        requests: {
            total: state.totalRequests,
            inflight: state.inflightRequests,
            avgDurationMs,
            maxDurationMs: Number(state.maxDurationMs.toFixed(2)),
            status: state.statusCounts,
        },
        process: {
            memory: process.memoryUsage(),
            pid: process.pid,
            version: process.version,
        },
    };
}
