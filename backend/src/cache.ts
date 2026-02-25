/**
 * Legacy cache adapter used by products routes.
 * Delegates Redis access to ./lib/cache (hardened) and keeps local in-memory fallback.
 */

import { getCached, setCache, invalidate } from './lib/cache';

const memoryCache = new Map<string, { data: string; expiresAt: number }>();
const MEMORY_CACHE_SWEEP_MS = 30_000;
const REDIS_MIRROR_TTL_SECONDS = 60;

function patternToRegex(pattern: string): RegExp {
    const escaped = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`);
}

const sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of memoryCache.entries()) {
        if (value.expiresAt <= now) {
            memoryCache.delete(key);
        }
    }
}, MEMORY_CACHE_SWEEP_MS);
sweepTimer.unref?.();

export async function cacheGet(key: string): Promise<string | null> {
    const local = memoryCache.get(key);
    if (local && local.expiresAt > Date.now()) {
        return local.data;
    }
    if (local) {
        memoryCache.delete(key);
    }

    const remote = await getCached<string | null>(key, async () => null, REDIS_MIRROR_TTL_SECONDS);
    if (typeof remote === 'string') {
        memoryCache.set(key, {
            data: remote,
            expiresAt: Date.now() + REDIS_MIRROR_TTL_SECONDS * 1000,
        });
        return remote;
    }

    return null;
}

export async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
    memoryCache.set(key, {
        data: value,
        expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000,
    });

    await setCache(key, value, ttlSeconds);
}

export async function cacheDelete(pattern: string): Promise<void> {
    if (pattern.includes('*')) {
        const rx = patternToRegex(pattern);
        for (const key of memoryCache.keys()) {
            if (rx.test(key)) {
                memoryCache.delete(key);
            }
        }
    } else {
        for (const key of memoryCache.keys()) {
            if (key.includes(pattern)) {
                memoryCache.delete(key);
            }
        }
    }

    await invalidate(pattern);
}

export const CACHE_KEYS = {
    productsList: (category?: string, search?: string, take?: number) =>
        `products:list:${category || 'all'}:${search || ''}:${take || 'default'}`,
    productById: (id: string) => `products:id:${id}`,
    productsInvalidate: 'products:',
};

export const CACHE_TTL = {
    productsList: 60,
    productById: 120,
};
