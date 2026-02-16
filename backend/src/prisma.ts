import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { withAccelerate } from '@prisma/extension-accelerate';

type PrismaLike = PrismaClient;

function getSchemaFromUrl(url: string): string | undefined {
    try {
        return new URL(url).searchParams.get('schema') ?? undefined;
    } catch {
        return undefined;
    }
}

declare global {
    // eslint-disable-next-line no-var
    var __prisma: PrismaLike | undefined;
}

function createPrisma(): PrismaLike {
    const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!url) {
        throw new Error('DATABASE_URL (hoặc DIRECT_DATABASE_URL) chưa được cấu hình.');
    }

    const useAccelerate = typeof url === 'string' && url.startsWith('prisma://');
    if (useAccelerate) {
        return new PrismaClient({ accelerateUrl: url }).$extends(withAccelerate()) as unknown as PrismaLike;
    }

    const adapter = new PrismaPg(
        { connectionString: url },
        { schema: getSchemaFromUrl(url) }
    );
    return new PrismaClient({ adapter });
}

export const prisma: PrismaLike = global.__prisma ?? createPrisma();

if (process.env.NODE_ENV !== 'production') {
    global.__prisma = prisma;
}
