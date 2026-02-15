import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

function normalizeRequestId(headerValue: string | undefined): string | null {
    if (!headerValue) return null;
    const candidate = String(headerValue).trim();
    if (!candidate) return null;
    return candidate.slice(0, 100);
}

export function requestContext(req: Request, res: Response, next: NextFunction) {
    const incoming = normalizeRequestId(req.header('x-request-id'));
    const requestId = incoming ?? randomUUID();

    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    next();
}
