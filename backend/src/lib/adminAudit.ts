import type { Request } from 'express';
import { prisma } from '../prisma';
import type { AdminRole } from '../middleware/adminAuth';

export type AdminAuditInput = {
    adminEmail: string;
    adminRole: AdminRole;
    action: string;
    resource: string;
    resourceId?: string;
    status?: 'success' | 'denied' | 'error';
    message?: string;
    metadata?: Record<string, unknown>;
};

function getClientIp(req: Request): string | undefined {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() || undefined;
    return req.socket?.remoteAddress || undefined;
}

function mapRoleToEnum(role: AdminRole): 'SUPERADMIN' | 'MODERATOR' | 'ANALYST' {
    if (role === 'moderator') return 'MODERATOR';
    if (role === 'analyst') return 'ANALYST';
    return 'SUPERADMIN';
}

export async function writeAdminAuditLog(req: Request, input: AdminAuditInput) {
    const requestId = String((req.res as any)?.locals?.requestId || '');

    await (prisma as any).adminAuditLog.create({
        data: {
            adminEmail: input.adminEmail,
            adminRole: mapRoleToEnum(input.adminRole),
            action: input.action,
            resource: input.resource,
            resourceId: input.resourceId,
            status: input.status ?? 'success',
            message: input.message,
            ip: getClientIp(req),
            userAgent: req.header('user-agent') || null,
            requestId: requestId || null,
            metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
        },
    });
}
