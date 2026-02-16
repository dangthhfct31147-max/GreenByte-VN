import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { cacheGet, cacheSet, cacheDelete, CACHE_KEYS, CACHE_TTL } from '../cache';

export const productsRouter = Router();

function isAccelerateEnabled(): boolean {
  const url = process.env.DATABASE_URL;
  return typeof url === 'string' && url.startsWith('prisma://');
}

function humanizeFromDate(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${Math.max(1, diffMin)} phút trước`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} giờ trước`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD} ngày trước`;
  const diffW = Math.floor(diffD / 7);
  return `${diffW} tuần trước`;
}

productsRouter.get('/', async (req, res, next) => {
  try {
    const query = z
      .object({
        search: z.string().optional(),
        category: z.string().optional(),
        take: z.coerce.number().int().min(1).max(100).optional(),
      })
      .parse(req.query);

    // Try cache first
    const cacheKey = CACHE_KEYS.productsList(query.category, query.search, query.take ?? 50);
    const cached = await cacheGet(cacheKey);

    if (cached) {
      console.log(`📦 Cache hit: ${cacheKey}`);
      return res.json(JSON.parse(cached));
    }

    console.log(`🔍 Cache miss: ${cacheKey}, querying database...`);

    const where: Record<string, unknown> = {};
    (where as any).deletedAt = null;
    if (query.category && query.category !== 'Tất cả') {
      (where as any).category = query.category;
    }
    if (query.search) {
      (where as any).OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { location: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const baseArgs = {
      where: where as any,
      orderBy: { createdAt: 'desc' as const },
      take: query.take ?? 50,
      select: {
        id: true,
        title: true,
        priceVnd: true,
        unit: true,
        category: true,
        location: true,
        imageUrl: true,
        co2SavingsKg: true,
        createdAt: true,
        seller: { select: { name: true } },
      },
    };

    const rows = isAccelerateEnabled()
      ? await (prisma.product as any).findMany({
        ...baseArgs,
        cacheStrategy: {
          swr: 30,
          ttl: 30,
          tags: ['products'],
        },
      })
      : await prisma.product.findMany(baseArgs as any);

    const data = rows.map((p: any) => ({
      id: p.id,
      title: p.title,
      price: p.priceVnd,
      unit: p.unit,
      category: p.category,
      location: p.location,
      image: p.imageUrl,
      seller_name: p.seller.name,
      co2_savings_kg: p.co2SavingsKg,
      description: p.description ?? undefined,
      posted_at: humanizeFromDate(p.createdAt),
    }));

    const response = { products: data };

    // Cache the response
    await cacheSet(cacheKey, JSON.stringify(response), CACHE_TTL.productsList);

    res.json(response);
  } catch (err) {
    next(err);
  }
});

// GET single product by ID
productsRouter.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Try cache first
    const cacheKey = CACHE_KEYS.productById(id);
    const cached = await cacheGet(cacheKey);

    if (cached) {
      console.log(`📦 Cache hit: ${cacheKey}`);
      return res.json(JSON.parse(cached));
    }

    const product = await prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { seller: { select: { name: true } } },
    });

    if (!product) {
      return res.status(404).json({ error: 'Sản phẩm không tồn tại' });
    }

    const response = {
      product: {
        id: product.id,
        title: product.title,
        price: product.priceVnd,
        unit: product.unit,
        category: product.category,
        location: product.location,
        image: product.imageUrl,
        seller_name: product.seller.name,
        co2_savings_kg: product.co2SavingsKg,
        description: product.description ?? undefined,
        posted_at: humanizeFromDate(product.createdAt),
      },
    };

    // Cache the response
    await cacheSet(cacheKey, JSON.stringify(response), CACHE_TTL.productById);

    res.json(response);
  } catch (err) {
    next(err);
  }
});

const CreateProductSchema = z.object({
  title: z.string().min(3).max(200),
  price: z.number().int().min(0).max(1_000_000_000),
  unit: z.string().min(1).max(30),
  category: z.string().min(1).max(50),
  location: z.string().min(1).max(120),
  image: z.string().url().max(500),
  co2_savings_kg: z.number().int().min(0).max(1_000_000),
  description: z.string().max(2000).optional(),
});

productsRouter.post('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = CreateProductSchema.parse(req.body);
    const userId = req.user!.id;

    const created = await prisma.product.create({
      data: {
        title: body.title,
        priceVnd: body.price,
        unit: body.unit,
        category: body.category,
        location: body.location,
        imageUrl: body.image,
        co2SavingsKg: body.co2_savings_kg,
        description: body.description,
        sellerId: userId,
      },
      include: { seller: { select: { name: true } } },
    });

    res.status(201).json({
      product: {
        id: created.id,
        title: created.title,
        price: created.priceVnd,
        unit: created.unit,
        category: created.category,
        location: created.location,
        image: created.imageUrl,
        seller_name: created.seller.name,
        co2_savings_kg: created.co2SavingsKg,
        description: created.description ?? undefined,
        posted_at: humanizeFromDate(created.createdAt),
      },
    });

    // Invalidate Redis/memory cache
    await cacheDelete(CACHE_KEYS.productsInvalidate);

    // If Prisma Accelerate caching is enabled, invalidate products cache.
    if (isAccelerateEnabled()) {
      const accel = (prisma as any).$accelerate;
      if (accel?.invalidate) {
        try {
          await accel.invalidate({ tags: ['products'] });
        } catch {
          // ignore cache invalidation errors (e.g. rate limit)
        }
      }
    }
  } catch (err) {
    next(err);
  }
});
