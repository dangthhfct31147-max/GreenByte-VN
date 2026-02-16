import { z } from 'zod';

const EnvSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z
        .string()
        .min(1)
        .refine((v) => /[?&]schema=/.test(v), {
            message: 'DATABASE_URL must include ?schema=... (e.g. &schema=eco)',
        }),
    FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173'),
    JWT_SECRET: z.string().min(32),
    TOTP_ISSUER: z.string().min(1).default('Eco-Byproduct VN'),
    ADMIN_EMAIL: z.string().email().optional(),
    ADMIN_PASSWORD: z.string().min(8).optional(),
    ADMIN_PASSWORD_HASH: z.string().min(20).optional(),
    ADMIN_JWT_SECRET: z.string().min(32).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function getEnv(): Env {
    const parsed = EnvSchema.safeParse({
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        DATABASE_URL: process.env.DATABASE_URL,
        FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN,
        JWT_SECRET: process.env.JWT_SECRET,
        TOTP_ISSUER: process.env.TOTP_ISSUER,
        ADMIN_EMAIL: process.env.ADMIN_EMAIL,
        ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
        ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
        ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET,
    });

    if (!parsed.success) {
        const message = parsed.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('\n');
        throw new Error(`Invalid environment variables:\n${message}`);
    }

    return parsed.data;
}
