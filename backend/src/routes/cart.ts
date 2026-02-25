import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { trackAiUsageEvent } from '../lib/aiLearning';

export const cartRouter = Router();

cartRouter.get('/cart', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const userId = req.user!.id;

        const cart = await (prisma as any).cart.upsert({
            where: { userId },
            update: {},
            create: { userId },
            include: {
                items: {
                    include: {
                        product: {
                            include: { seller: { select: { name: true } } },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                },
            },
        });

        const items = cart.items.map((i: any) => ({
            quantity: i.quantity,
            product: {
                id: i.product.id,
                title: i.product.title,
                price: i.product.priceVnd,
                unit: i.product.unit,
                category: i.product.category,
                location: i.product.location,
                image: i.product.imageUrl,
                seller_name: i.product.seller.name,
                co2_savings_kg: i.product.co2SavingsKg,
                description: i.product.description ?? undefined,
                posted_at: '',
            },
        }));

        res.json({ cart: { items } });
    } catch (err) {
        next(err);
    }
});

const AddItemSchema = z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(1).max(999).default(1),
});

cartRouter.post('/cart/items', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const userId = req.user!.id;
        const body = AddItemSchema.parse(req.body);

        const cart = await (prisma as any).cart.upsert({
            where: { userId },
            update: {},
            create: { userId },
            select: { id: true },
        });

        const item = await (prisma as any).cartItem.upsert({
            where: {
                cartId_productId: {
                    cartId: cart.id,
                    productId: body.productId,
                },
            },
            update: {
                quantity: { increment: body.quantity },
            },
            create: {
                cartId: cart.id,
                productId: body.productId,
                quantity: body.quantity,
            },
            include: {
                product: { include: { seller: { select: { name: true } } } },
            },
        });

        void trackAiUsageEvent({
            module: 'RECOMMENDATIONS',
            eventType: 'CART_ADD',
            userId,
            productId: item.product.id,
            category: item.product.category,
            location: item.product.location,
            metadata: { quantity: item.quantity },
        });

        res.status(201).json({
            item: {
                quantity: item.quantity,
                product: {
                    id: item.product.id,
                    title: item.product.title,
                    price: item.product.priceVnd,
                    unit: item.product.unit,
                    category: item.product.category,
                    location: item.product.location,
                    image: item.product.imageUrl,
                    seller_name: item.product.seller.name,
                    co2_savings_kg: item.product.co2SavingsKg,
                    description: item.product.description ?? undefined,
                    posted_at: '',
                },
            },
        });
    } catch (err) {
        next(err);
    }
});

const UpdateItemSchema = z.object({
    quantity: z.number().int().min(1).max(999),
});

cartRouter.patch('/cart/items/:productId', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const userId = req.user!.id;
        const productId = z.string().uuid().parse(req.params.productId);
        const body = UpdateItemSchema.parse(req.body);

        const cart = await (prisma as any).cart.upsert({
            where: { userId },
            update: {},
            create: { userId },
            select: { id: true },
        });

        const item = await (prisma as any).cartItem.update({
            where: {
                cartId_productId: {
                    cartId: cart.id,
                    productId,
                },
            },
            data: { quantity: body.quantity },
            include: { product: { include: { seller: { select: { name: true } } } } },
        });

        res.json({
            item: {
                quantity: item.quantity,
                product: {
                    id: item.product.id,
                    title: item.product.title,
                    price: item.product.priceVnd,
                    unit: item.product.unit,
                    category: item.product.category,
                    location: item.product.location,
                    image: item.product.imageUrl,
                    seller_name: item.product.seller.name,
                    co2_savings_kg: item.product.co2SavingsKg,
                    description: item.product.description ?? undefined,
                    posted_at: '',
                },
            },
        });
    } catch (err) {
        next(err);
    }
});

cartRouter.delete('/cart/items/:productId', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const userId = req.user!.id;
        const productId = z.string().uuid().parse(req.params.productId);

        const cart = await (prisma as any).cart.findUnique({
            where: { userId },
            select: { id: true },
        });
        if (!cart) return res.status(204).end();

        await (prisma as any).cartItem.delete({
            where: {
                cartId_productId: {
                    cartId: cart.id,
                    productId,
                },
            },
        });

        res.status(204).end();
    } catch (err: any) {
        // If item doesn't exist, treat as already deleted.
        if (err?.code === 'P2025') return res.status(204).end();
        next(err);
    }
});
