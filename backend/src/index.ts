import express from 'express';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import dotenv from 'dotenv';
import type { Router } from 'express';

import { getAllowedOrigins, getEnv } from './env';
import { authRouter } from './routes/auth';
import { healthRouter } from './routes/health';
import { cartRouter } from './routes/cart';
import { postsRouter } from './routes/posts';
import { eventsRouter } from './routes/events';
import { pollutionRouter } from './routes/pollution';
import { recommendationsRouter } from './routes/recommendations';
import { aiLearningRouter } from './routes/ai-learning';
import { adminRouter } from './routes/admin';
import { blockchainRouter } from './routes/blockchain';
import { greenIndexRouter } from './routes/green-index';
import { errorHandler, notFound } from './middleware/errors';
import { prisma } from './prisma';
import { cache } from './lib/cache';
import { requestContext } from './middleware/requestContext';
import { requestMetricsMiddleware } from './lib/metrics';

const { productsRouter } = require('./routes/products') as { productsRouter: Router };

dotenv.config();

const env = getEnv();
const isProd = env.NODE_ENV === 'production';
const allowedOrigins = new Set(getAllowedOrigins(env));

const app = express();

app.disable('x-powered-by');
if (isProd) {
    app.set('trust proxy', 1);
}

// Compression middleware - reduce response size by 20-70%
app.use(compression({
    level: 6, // balanced speed/compression
    threshold: 1024, // only compress responses > 1KB
    filter: (req, res) => {
        if (req.path === '/api/posts/stream') {
            return false;
        }
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    },
}));

// Enhanced Helmet security headers
app.use(
    helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        contentSecurityPolicy: isProd ? {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                fontSrc: ["'self'", "https://fonts.gstatic.com"],
                imgSrc: ["'self'", "data:", "https:", "blob:"],
                connectSrc: ["'self'", ...allowedOrigins],
                frameSrc: ["'none'"],
                objectSrc: ["'none'"],
                upgradeInsecureRequests: [],
            },
        } : false,
        hsts: isProd ? {
            maxAge: 31536000, // 1 year
            includeSubDomains: true,
            preload: true,
        } : false,
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        xContentTypeOptions: true,
        xDnsPrefetchControl: { allow: false },
        xDownloadOptions: true,
        xFrameOptions: { action: 'deny' },
        xPermittedCrossDomainPolicies: { permittedPolicies: 'none' },
    }),
);

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (allowedOrigins.has(origin)) return callback(null, true);
            return callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    }),
);

// Basic CSRF hardening for cookie-based auth:
// If a browser sends a cross-origin state-changing request, block it.
app.use((req, res, next) => {
    const method = req.method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return next();

    const origin = req.header('origin');
    // Allow non-browser clients (no Origin header)
    if (!origin) return next();

    if (!allowedOrigins.has(origin)) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
});

app.use(express.json({ limit: '1mb' }));
app.use(requestContext);
app.use(requestMetricsMiddleware);

if (env.NODE_ENV !== 'test') {
    morgan.token('request-id', (_req, res) => {
        const responseWithLocals = res as typeof res & { locals?: { requestId?: string } };
        return String(responseWithLocals.locals?.requestId || '-');
    });
    const logFormat = ':method :url :status :res[content-length] - :response-time ms req_id=:request-id';
    app.use(morgan(logFormat));
}

// Baseline rate limit
app.use(
    rateLimit({
        windowMs: 60_000,
        limit: 300,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
    }),
);

// Stricter rate limit for auth
app.use(
    '/api/auth',
    rateLimit({
        windowMs: 60_000,
        limit: 30,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
    }),
);

// Stricter rate limit for blockchain (sensitive operations)
app.use(
    '/api/blockchain',
    rateLimit({
        windowMs: 60_000,
        limit: 15,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { error: 'Too many blockchain requests, please try again later' },
    }),
);

// Rate limit for green-index data
app.use(
    '/api/green-index',
    rateLimit({
        windowMs: 60_000,
        limit: 60,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
    }),
);

app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api', cartRouter);
app.use('/api', postsRouter);
app.use('/api', eventsRouter);
app.use('/api', recommendationsRouter);
app.use('/api', aiLearningRouter);
app.use('/api', pollutionRouter);
app.use('/api/admin', adminRouter);
app.use('/api/blockchain', blockchainRouter);
app.use('/api/green-index', greenIndexRouter);

// Serve static frontend in production
if (isProd) {
    const distPath = path.join(__dirname, '../../dist');
    console.log('Production mode detected.');
    console.log('Serving static files from:', distPath);
    console.log('Current directory (__dirname):', __dirname);

    app.use(express.static(distPath, {
        maxAge: '1d',
        etag: true,
    }));

    // SPA fallback: serve index.html for all non-API routes
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) {
            return next();
        }
        res.sendFile('index.html', { root: distPath });
    });
} else {
    console.log('Production mode NOT detected. NODE_ENV:', env.NODE_ENV);
}

app.use(notFound);
app.use(errorHandler);

const server = app.listen(env.PORT, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`Backend listening on http://localhost:${env.PORT}`);
    if (isProd) {
        console.log('Running in PRODUCTION mode with enhanced security');
    }
});

let isShuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`${signal} received. Starting graceful shutdown...`);

    const forceExitTimer = setTimeout(() => {
        console.error('Graceful shutdown timed out. Forcing process exit.');
        process.exit(1);
    }, 15_000);

    try {
        await new Promise<void>((resolve, reject) => {
            server.close((err) => {
                if (err) return reject(err);
                return resolve();
            });
        });

        await Promise.allSettled([
            prisma.$disconnect(),
            cache.disconnect(),
        ]);

        clearTimeout(forceExitTimer);
        console.log('Graceful shutdown completed.');
        process.exit(0);
    } catch (error) {
        clearTimeout(forceExitTimer);
        console.error('Error during graceful shutdown:', error);
        process.exit(1);
    }
}

process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
    void shutdown('SIGINT');
});
