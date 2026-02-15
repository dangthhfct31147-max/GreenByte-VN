import type { NextFunction, Request, Response } from 'express';

export function notFound(_req: Request, res: Response) {
    res.status(404).json({ error: 'Not found', requestId: res.locals.requestId });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
    const isProd = process.env.NODE_ENV === 'production';
    const message = err instanceof Error ? err.message : 'Unknown error';
    const requestId = String(res.locals.requestId || '-');

    const errorLog = {
        level: 'error',
        requestId,
        method: req.method,
        path: req.originalUrl,
        message,
        stack: err instanceof Error ? err.stack : undefined,
    };

    if (!isProd) {
        console.error(errorLog);
    } else {
        console.error({
            ...errorLog,
            stack: undefined,
        });
    }

    res.status(500).json({
        error: isProd ? 'Internal server error' : message,
        requestId,
    });
}
