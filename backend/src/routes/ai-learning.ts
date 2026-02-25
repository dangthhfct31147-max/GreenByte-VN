import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth, type AuthenticatedRequest } from '../middleware/auth';
import { trackAiUsageEvent } from '../lib/aiLearning';

export const aiLearningRouter = Router();

const AiFeedbackSchema = z.object({
    module: z.enum([
        'RECOMMENDATIONS',
        'SELLER_ASSISTANT',
        'PRICE_SUGGESTION',
        'MATCH_BUYERS',
        'VISION_CLASSIFIER',
    ]),
    event_type: z.enum([
        'REQUEST',
        'IMPRESSION',
        'CLICK',
        'APPLY',
        'VIEW',
        'CART_ADD',
        'INQUIRY_OPEN',
        'INQUIRY_ACCEPTED',
        'INQUIRY_REJECTED',
        'REVIEW_POSITIVE',
        'REVIEW_NEGATIVE',
    ]),
    session_id: z.string().trim().max(120).optional(),
    product_id: z.string().uuid().optional(),
    inquiry_id: z.string().uuid().optional(),
    category: z.string().trim().max(80).optional(),
    location: z.string().trim().max(180).optional(),
    metadata: z.record(z.unknown()).optional(),
});

aiLearningRouter.post('/ai/feedback', optionalAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        const body = AiFeedbackSchema.parse(req.body ?? {});

        await trackAiUsageEvent({
            module: body.module,
            eventType: body.event_type,
            userId: req.user?.id,
            productId: body.product_id,
            inquiryId: body.inquiry_id,
            sessionId: body.session_id,
            category: body.category,
            location: body.location,
            metadata: body.metadata,
        });

        return res.status(202).json({ ok: true });
    } catch (err) {
        return next(err);
    }
});
