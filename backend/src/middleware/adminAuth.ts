import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { getEnv } from '../env';

export interface AdminRequest extends Request {
    admin?: { email: string };
}

function getAdminTokenFromRequest(req: Request): string | undefined {
    const authHeader = req.header('authorization');
    if (!authHeader?.startsWith('Bearer ')) return undefined;
    return authHeader.slice('Bearer '.length);
}

export function requireAdmin(req: AdminRequest, res: Response, next: NextFunction) {
    const token = getAdminTokenFromRequest(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const env = getEnv();
        const secret = env.ADMIN_JWT_SECRET ?? env.JWT_SECRET;
        const payload = jwt.verify(token, secret) as { role?: string; email?: string };

        if (payload.role !== 'admin' || !payload.email) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        req.admin = { email: payload.email };
        return next();
    } catch {
        return res.status(401).json({ error: 'Unauthorized' });
    }
}
