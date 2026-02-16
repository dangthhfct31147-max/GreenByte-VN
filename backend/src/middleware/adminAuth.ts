import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { getEnv } from '../env';

export type AdminRole = 'superadmin' | 'moderator' | 'analyst';
export type AdminPermission =
    | 'dashboard:read'
    | 'users:read'
    | 'content:read'
    | 'content:moderate'
    | 'audit:read';

const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
    superadmin: ['dashboard:read', 'users:read', 'content:read', 'content:moderate', 'audit:read'],
    moderator: ['dashboard:read', 'users:read', 'content:read', 'content:moderate'],
    analyst: ['dashboard:read', 'users:read', 'content:read', 'audit:read'],
};

export function getAdminPermissions(role: AdminRole): AdminPermission[] {
    return [...ROLE_PERMISSIONS[role]];
}

export interface AdminRequest extends Request {
    admin?: { email: string; role: AdminRole; permissions: AdminPermission[] };
}

function getAdminTokenFromRequest(req: Request): string | undefined {
    const authHeader = req.header('authorization');
    if (!authHeader?.startsWith('Bearer ')) return undefined;
    return authHeader.slice('Bearer '.length);
}

export function normalizeAdminRole(value: unknown): AdminRole {
    const raw = String(value ?? '').trim().toLowerCase();
    if (raw === 'moderator') return 'moderator';
    if (raw === 'analyst') return 'analyst';
    return 'superadmin';
}

function parseAdminPayload(payload: { role?: string; email?: string; permissions?: string[] }) {
    if (!payload.email) return null;

    const role = payload.role === 'admin'
        ? 'superadmin'
        : normalizeAdminRole(payload.role);

    const allowed = new Set(ROLE_PERMISSIONS[role]);
    const tokenPermissions = Array.isArray(payload.permissions)
        ? payload.permissions.filter((permission): permission is AdminPermission => {
            return typeof permission === 'string' && allowed.has(permission as AdminPermission);
        })
        : [];

    const permissions = tokenPermissions.length > 0 ? tokenPermissions : ROLE_PERMISSIONS[role];

    return {
        email: payload.email,
        role,
        permissions,
    };
}

export function requireAdmin(req: AdminRequest, res: Response, next: NextFunction) {
    const token = getAdminTokenFromRequest(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const env = getEnv();
        const secret = env.ADMIN_JWT_SECRET ?? env.JWT_SECRET;
        const payload = jwt.verify(token, secret) as { role?: string; email?: string; permissions?: string[] };
        const admin = parseAdminPayload(payload);

        if (!admin) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        req.admin = admin;
        return next();
    } catch {
        return res.status(401).json({ error: 'Unauthorized' });
    }
}

export function requireAdminPermission(required: AdminPermission | AdminPermission[]) {
    const expected = Array.isArray(required) ? required : [required];

    return (req: AdminRequest, res: Response, next: NextFunction) => {
        if (!req.admin) return res.status(401).json({ error: 'Unauthorized' });
        const hasPermission = expected.every((permission) => req.admin!.permissions.includes(permission));
        if (!hasPermission) return res.status(403).json({ error: 'Forbidden' });
        return next();
    };
}
