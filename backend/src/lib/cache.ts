/**
 * ============================================================================
 * REDIS CACHE UTILITY
 * ============================================================================
 *
 * Provides Redis-based caching with:
 * - Get/set operations with TTL
 * - Namespace support
 * - Automatic serialization/deserialization
 * - Graceful fallback if Redis is unavailable
 * - Connection pooling
 *
 * Usage:
 *   import { getCached } from './cache';
 *
 *   const data = await getCached('contests:all', async () => {
 *     return await db.contests.findMany();
 *   }, 600); // 10 minutes TTL
 */

import Redis, { RedisOptions, ChainableCommander } from 'ioredis';

// Singleton instance
let redis: Redis | null = null;
let isRedisAvailable = false;
let lastRedisError: { at: string; code?: string; message: string } | null = null;
let lastRedisInitBlockReason: string | null = null;
let redisDisabledUntilRestart = false;

function isRunningOnRailway(): boolean {
    return Boolean(
        process.env.RAILWAY_ENVIRONMENT ||
        process.env.RAILWAY_PROJECT_ID ||
        process.env.RAILWAY_SERVICE_ID ||
        process.env.RAILWAY_STATIC_URL ||
        process.env.RAILWAY_PUBLIC_DOMAIN
    );
}

function sanitizeRedisUrl(value: string | undefined): string {
    return value ? String(value).trim().replace(/^['"]|['"]$/g, '') : '';
}

function readBoolEnv(name: string, defaultValue = false): boolean {
    const raw = process.env[name];
    if (raw === undefined) return defaultValue;
    const v = String(raw).trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false;
    return defaultValue;
}

function readIntEnv(name: string, defaultValue: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw === null || String(raw).trim() === '') return defaultValue;
    const n = parseInt(String(raw), 10);
    return Number.isFinite(n) ? n : defaultValue;
}

function readIntEnvOptional(name: string): number | undefined {
    const raw = process.env[name];
    if (raw === undefined || raw === null || String(raw).trim() === '') return undefined;
    const n = parseInt(String(raw), 10);
    return Number.isFinite(n) ? n : undefined;
}

function isInternalRedisHost(hostname: string | undefined): boolean {
    if (!hostname) return false;
    const h = String(hostname).toLowerCase();
    return (
        h === 'localhost' ||
        h === '127.0.0.1' ||
        h === '::1' ||
        /(^|\.)railway\.internal$/i.test(h)
    );
}

function getRedisUrlFromEnvWithSource(): { url: string; source: string | null } {
    const candidates = [
        'REDIS_URL',
        'REDIS_PRIVATE_URL',
        'REDIS_PUBLIC_URL',
        'REDIS_URI',
        'REDIS_CONNECTION_STRING',
    ];

    const runningOnRailway = isRunningOnRailway();
    const validCandidates: Array<{ url: string; source: string; host?: string }> = [];

    for (const name of candidates) {
        const raw = process.env[name];
        const v = sanitizeRedisUrl(raw);
        if (!v) continue;

        let host: string | undefined;
        try {
            host = new URL(v).hostname;
        } catch {
            host = undefined;
        }

        validCandidates.push({ url: v, source: name, host });
    }

    if (validCandidates.length === 0) {
        return { url: '', source: null };
    }

    if (runningOnRailway) {
        return { url: validCandidates[0].url, source: validCandidates[0].source };
    }

    // Outside Railway, prefer non-internal endpoints if available.
    const nonInternal = validCandidates.find((c) => !isInternalRedisHost(c.host));
    if (nonInternal) {
        return { url: nonInternal.url, source: nonInternal.source };
    }

    return { url: validCandidates[0].url, source: validCandidates[0].source };
}

function looksLikePlaceholder(value: string | undefined): boolean {
    if (!value) return false;
    return (
        value.includes('${{') ||
        value.includes('}}') ||
        (value.includes('<') && value.includes('>'))
    );
}

function getRedisTargetForLogs(redisUrl: string, tlsEnabled: boolean): string {
    try {
        const u = new URL(redisUrl);
        const host = u.hostname || 'unknown-host';
        const port = u.port || ((u.protocol === 'rediss:' || tlsEnabled) ? '6380' : '6379');
        const proto = (u.protocol === 'rediss:' || tlsEnabled) ? 'rediss:' : 'redis:';
        return `${proto}//${host}:${port}`;
    } catch {
        return 'invalid-url';
    }
}

/**
 * Initialize Redis connection
 */
function initRedis(): Redis | null {
    const redisEnabled = readBoolEnv('REDIS_ENABLED', true);
    if (!redisEnabled) {
        lastRedisInitBlockReason = 'redis_disabled_by_env';
        return null;
    }

    if (redisDisabledUntilRestart) {
        return null;
    }

    if (redis) return redis;

    const { url: redisUrl, source: redisUrlSource } = getRedisUrlFromEnvWithSource();

    if (!redisUrl) {
        // Only warn once in non-production or if explicitly requested
        if (process.env.NODE_ENV === 'production') {
            console.warn('⚠️ Redis URL not configured, caching will be disabled');
        }
        lastRedisInitBlockReason = 'redis_url_missing';
        return null;
    }

    if (looksLikePlaceholder(redisUrl)) {
        console.warn(`⚠️ Redis URL looks like a placeholder (${redisUrlSource || 'unknown'}), caching will be disabled until fixed`);
        lastRedisInitBlockReason = 'redis_url_placeholder';
        return null;
    }

    const isRailway = isRunningOnRailway();
    const isProduction = process.env.NODE_ENV === 'production' || isRailway;

    if (isProduction && /redis:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(redisUrl)) {
        console.warn('⚠️ Redis URL points to localhost in production; caching will fail unless Redis runs in the same container');
    }

    try {
        let parsed: URL | undefined;
        try {
            parsed = new URL(redisUrl);
        } catch {
            parsed = undefined;
        }

        const redisHost = parsed?.hostname;
        const internalHost = isInternalRedisHost(redisHost);
        const disableOnDnsError = readBoolEnv('REDIS_DISABLE_ON_ENOTFOUND', true);

        const configuredFamily = readIntEnvOptional('REDIS_FAMILY');
        let family: 0 | 4 | 6 | undefined;
        if (configuredFamily !== undefined) {
            if (configuredFamily === 0 || configuredFamily === 4 || configuredFamily === 6) {
                family = configuredFamily;
            } else {
                console.warn(
                    `⚠️ Invalid REDIS_FAMILY="${configuredFamily}". ` +
                    'Supported values: 0 (dual-stack), 4 (IPv4), 6 (IPv6).'
                );
            }
        } else if (isRailway && internalHost) {
            // Railway private networking can be dual-stack or IPv6-only.
            // family=0 works safely in both cases.
            family = 0;
        }

        const connectTimeout = readIntEnv('REDIS_CONNECT_TIMEOUT_MS', isProduction ? 15000 : 5000);
        const commandTimeout = readIntEnv('REDIS_COMMAND_TIMEOUT_MS', isProduction ? 5000 : 3000);
        const enableReadyCheck = readBoolEnv('REDIS_ENABLE_READY_CHECK', true);
        const enableOfflineQueue = readBoolEnv('REDIS_ENABLE_OFFLINE_QUEUE', !isProduction);
        const baseDelay = readIntEnv('REDIS_RETRY_BASE_DELAY_MS', 250);
        const maxDelay = readIntEnv('REDIS_RETRY_MAX_DELAY_MS', 5000);
        const maxConnectAttempts = readIntEnv('REDIS_MAX_CONNECT_ATTEMPTS', isProduction ? 30 : 15);

        let maxRetriesPerRequest: number | null = isProduction ? 5 : 3;
        const envMaxRetries = process.env.REDIS_MAX_RETRIES_PER_REQUEST;
        if (envMaxRetries !== undefined) {
            const v = String(envMaxRetries).trim().toLowerCase();
            if (v === 'null' || v === 'none' || v === 'disabled') {
                maxRetriesPerRequest = null;
            } else {
                const n = parseInt(v, 10);
                maxRetriesPerRequest = Number.isFinite(n) ? n : (isProduction ? 5 : 3);
            }
        }

        const tlsForced = process.env.REDIS_TLS !== undefined;
        const portSuggestsTls = parsed?.port === '6380';
        const tlsEnabled = tlsForced
            ? readBoolEnv('REDIS_TLS', false)
            : parsed?.protocol === 'rediss:' || portSuggestsTls;
        const tlsRejectUnauthorized = readBoolEnv('REDIS_TLS_REJECT_UNAUTHORIZED', true);

        const requireTlsForced = process.env.REDIS_REQUIRE_TLS_IN_PROD !== undefined;
        const requireTlsInProd = requireTlsForced
            ? readBoolEnv('REDIS_REQUIRE_TLS_IN_PROD', true)
            : true;

        if (!isRailway && redisHost && /(^|\.)railway\.internal$/i.test(redisHost)) {
            console.warn(
                `⚠️ Redis host "${redisHost}" chỉ truy cập được trong Railway private network. ` +
                'Caching sẽ bị tắt trong môi trường hiện tại. Dùng REDIS_PUBLIC_URL khi chạy ngoài Railway.'
            );
            lastRedisInitBlockReason = 'railway_internal_outside_railway';
            redisDisabledUntilRestart = true;
            return null;
        }

        if (isProduction && requireTlsInProd && !internalHost && !tlsEnabled) {
            console.warn(
                `⚠️ Redis TLS is required in production but disabled (host=${redisHost || 'unknown'}). ` +
                'Set REDIS_URL to rediss://... or set REDIS_TLS=true.'
            );
            lastRedisInitBlockReason = 'tls_required_in_prod';
            return null;
        }

        const options: RedisOptions = {
            connectTimeout,
            commandTimeout,
            enableReadyCheck,
            enableOfflineQueue,
            maxRetriesPerRequest: maxRetriesPerRequest, // ioredis expects number | null
            autoResubscribe: false,
            autoResendUnfulfilledCommands: false,
            retryStrategy: (times: number) => {
                if (maxConnectAttempts && times > maxConnectAttempts) return null;
                const delay = Math.min(baseDelay * Math.max(1, times), maxDelay);
                return delay;
            },
            reconnectOnError: (err) => {
                const targetError = 'READONLY';
                return typeof err?.message === 'string' && err.message.includes(targetError);
            },
        };

        if (family !== undefined) {
            options.family = family;
        }

        if (tlsEnabled) {
            const servername =
                sanitizeRedisUrl(process.env.REDIS_TLS_SERVERNAME) ||
                (redisHost ? String(redisHost) : undefined);
            options.tls = {
                rejectUnauthorized: tlsRejectUnauthorized,
                ...(servername ? { servername } : {}),
            };
        }

        console.log(
            `🔌 Redis connecting to ${getRedisTargetForLogs(redisUrl, tlsEnabled)}${tlsEnabled ? ' (TLS)' : ''}` +
            (redisUrlSource ? ` [${redisUrlSource}]` : '') +
            (family !== undefined ? ` [family=${family}]` : '')
        );

        // reset diagnostics on new init
        lastRedisError = null;
        lastRedisInitBlockReason = null;

        redis = new Redis(redisUrl, options);

        redis.on('connect', () => {
            console.log('✅ Redis connected');
            isRedisAvailable = false; // Wait for ready
        });

        redis.on('ready', () => {
            console.log('✅ Redis ready');
            isRedisAvailable = true;
        });

        redis.on('error', (err: any) => {
            const code = err?.code ? ` (${err.code})` : '';
            console.error(`❌ Redis error${code}:`, err?.message || String(err));
            lastRedisError = {
                at: new Date().toISOString(),
                code: err?.code,
                message: err?.message || String(err),
            };
            isRedisAvailable = false;

            if (disableOnDnsError && err?.code === 'ENOTFOUND') {
                redisDisabledUntilRestart = true;
                lastRedisInitBlockReason = 'redis_dns_enotfound';
                const current = redis;
                redis = null;
                if (current) {
                    current.disconnect(false);
                }
                console.error('🛑 Redis bị vô hiệu hóa cho đến khi restart process do lỗi DNS ENOTFOUND.');
            }
        });

        redis.on('close', () => {
            if (redisDisabledUntilRestart) return;
            console.warn('⚠️ Redis connection closed');
            isRedisAvailable = false;
        });

        redis.on('end', () => {
            if (redisDisabledUntilRestart) return;
            console.warn('⚠️ Redis connection ended');
            isRedisAvailable = false;
        });

        redis.on('reconnecting', () => {
            if (redisDisabledUntilRestart) return;
            console.warn('🔁 Redis reconnecting...');
            isRedisAvailable = false;
        });

        return redis;
    } catch (err) {
        console.error('Failed to initialize Redis:', err);
        return null;
    }
}

/**
 * Get cached data or fetch and cache
 */
export async function getCached<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl = 300
): Promise<T> {
    const client = initRedis();

    // If Redis is not available, always fetch fresh
    if (!client || !isRedisAvailable) {
        return await fetcher();
    }

    try {
        // Try to get from cache
        const cached = await client.get(key);
        if (cached) {
            return JSON.parse(cached) as T;
        }

        // Not in cache, fetch fresh data
        const data = await fetcher();

        // Store in cache with TTL
        if (data !== undefined && data !== null) {
            await client.setex(key, ttl, JSON.stringify(data));
        }

        return data;
    } catch (err) {
        console.error('Cache error:', err);
        // On cache error, fetch fresh data
        return await fetcher();
    }
}

/**
 * Set cache value explicitly
 */
export async function setCache(key: string, value: any, ttl = 300): Promise<void> {
    const client = initRedis();
    if (!client || !isRedisAvailable) return;

    try {
        await client.setex(key, ttl, JSON.stringify(value));
    } catch (err) {
        console.error('Failed to set cache:', err);
    }
}

/**
 * Invalidate cache by key or pattern
 */
export async function invalidate(keyOrPattern: string): Promise<void> {
    const client = initRedis();
    if (!client || !isRedisAvailable) return;

    try {
        if (keyOrPattern.includes('*')) {
            // Pattern-based deletion (SCAN to avoid blocking Redis like KEYS)
            let cursor = '0';
            do {
                const [nextCursor, keys] = await client.scan(
                    cursor,
                    'MATCH',
                    keyOrPattern,
                    'COUNT',
                    200
                );
                cursor = nextCursor;
                if (Array.isArray(keys) && keys.length > 0) {
                    await client.del(...keys);
                }
            } while (cursor !== '0');
        } else {
            // Single key deletion
            await client.del(keyOrPattern);
        }
    } catch (err) {
        console.error('Failed to invalidate cache:', err);
    }
}

/**
 * Clear all cache
 */
export async function clearAll(): Promise<void> {
    const client = initRedis();
    if (!client || !isRedisAvailable) return;

    try {
        await client.flushdb();
        console.log('✅ Cache cleared');
    } catch (err) {
        console.error('Failed to clear cache:', err);
    }
}

/**
 * Check if Redis is available
 */
export function isAvailable(): boolean {
    return isRedisAvailable;
}

/**
 * Check Redis health by pinging
 */
export async function checkRedisHealth(timeoutMs = 5000): Promise<boolean> {
    const client = initRedis();
    if (!client) return false;

    try {
        const effectiveTimeoutMs = readIntEnv('REDIS_HEALTHCHECK_TIMEOUT_MS', timeoutMs);
        const timeoutPromise = new Promise<boolean>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), effectiveTimeoutMs)
        );
        await Promise.race([client.ping(), timeoutPromise]);
        return isRedisAvailable;
    } catch {
        return false;
    }
}

/**
 * Disconnect from Redis
 */
export async function disconnect(): Promise<void> {
    if (redis) {
        try {
            await redis.quit();
        } catch {
            // Ignore errors during disconnect
        }
        redis = null;
        isRedisAvailable = false;
    }
    redisDisabledUntilRestart = false;
}

export const cache = {
    getCached,
    setCache,
    invalidate,
    clearAll,
    isAvailable,
    checkRedisHealth,
    disconnect,
};
