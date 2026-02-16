import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';

type PrismaLike = PrismaClient;

declare global {
    // eslint-disable-next-line no-var
    var __prisma: PrismaLike | undefined;
}

function createPrisma(): PrismaLike {
    const url = process.env.DATABASE_URL;
    const useAccelerate = typeof url === 'string' && url.startsWith('prisma://');
    if (useAccelerate) {
        return new PrismaClient({ accelerateUrl: url }).$extends(withAccelerate()) as unknown as PrismaLike;
    }
    return new PrismaClient();
}

export const prisma: PrismaLike = global.__prisma ?? createPrisma();

if (process.env.NODE_ENV !== 'production') {
    global.__prisma = prisma;
}
