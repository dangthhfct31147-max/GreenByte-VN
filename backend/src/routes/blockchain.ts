import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import {
    uploadToIPFS,
    getIPFSUrl,
    registerByproductOnChain,
    getByproductRecord,
    isBlockchainConfigured,
    isEscrowConfigured,
    isGRTConfigured,
    getExplorerUrl,
    GRT_REWARDS,
    mintGreenTokens,
    getGRTBalance,
    getWalletAddress,
    createEscrowOnChain,
    confirmDeliveryOnChain,
    raiseDisputeOnChain,
    resolveDisputeOnChain,
    getEscrowOnChain,
} from '../lib/blockchain.service';

export const blockchainRouter = Router();

// ====== Health / Status ======

blockchainRouter.get('/status', (_req, res) => {
    res.json({
        blockchain: isBlockchainConfigured(),
        escrow: isEscrowConfigured(),
        greenToken: isGRTConfigured(),
        network: process.env.CHAIN_ID === '137' ? 'polygon-mainnet' : 'polygon-amoy',
        walletAddress: getWalletAddress(),
    });
});

// ====================================================================
// TIER 1 – Immutable Byproduct Records
// ====================================================================

const RegisterSchema = z.object({
    origin: z.string().min(1).max(200),
    harvestDate: z.string().min(1),
});

/**
 * POST /api/blockchain/register/:productId
 * Register a product's byproduct record on blockchain (IPFS + on-chain).
 * Only the product seller can trigger this.
 */
blockchainRouter.post('/register/:productId', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        if (!isBlockchainConfigured()) {
            return res.status(503).json({ error: 'Blockchain chưa được cấu hình' });
        }

        const productId = z.string().uuid().parse(req.params.productId);
        const body = RegisterSchema.parse(req.body);
        const userId = req.user!.id;

        // Verify product exists and belongs to this user
        const product = await (prisma.product as any).findFirst({
            where: { id: productId, deletedAt: null },
            select: {
                id: true,
                sellerId: true,
                title: true,
                category: true,
                location: true,
                latitude: true,
                longitude: true,
                imageUrl: true,
                description: true,
                co2SavingsKg: true,
            },
        });

        if (!product) {
            return res.status(404).json({ error: 'Sản phẩm không tồn tại' });
        }
        if (product.sellerId !== userId) {
            return res.status(403).json({ error: 'Bạn không phải người bán sản phẩm này' });
        }

        // Check if already registered
        const existing = await (prisma as any).blockchainRecord.findFirst({
            where: { productId },
        });
        if (existing) {
            return res.status(409).json({
                error: 'Sản phẩm đã được đăng ký trên blockchain',
                record: {
                    txHash: existing.txHash,
                    ipfsHash: existing.ipfsHash,
                    explorerUrl: getExplorerUrl(existing.txHash),
                    ipfsUrl: getIPFSUrl(existing.ipfsHash),
                },
            });
        }

        // Get seller info
        const seller = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true },
        });

        const gpsLocation = product.latitude && product.longitude
            ? `${product.latitude},${product.longitude}`
            : product.location;

        // 1. Upload metadata to IPFS
        const ipfsHash = await uploadToIPFS({
            productId,
            origin: body.origin,
            gpsLocation,
            category: product.category,
            weightKg: product.co2SavingsKg || 0,
            harvestDate: body.harvestDate,
            description: product.description || undefined,
            imageUrl: product.imageUrl || undefined,
            sellerName: seller?.name || 'Unknown',
            registeredAt: new Date().toISOString(),
        });

        // 2. Register on blockchain
        const harvestTimestamp = Math.floor(new Date(body.harvestDate).getTime() / 1000);
        const result = await registerByproductOnChain({
            productId,
            ipfsHash,
            origin: body.origin,
            gpsLocation,
            category: product.category,
            weightKg: product.co2SavingsKg || 0,
            harvestDate: harvestTimestamp,
        });

        // 3. Save record in database
        const record = await (prisma as any).blockchainRecord.create({
            data: {
                productId,
                txHash: result.txHash,
                ipfsHash,
                contractAddr: result.contractAddress,
                walletAddress: result.walletAddress,
                chainId: parseInt(process.env.CHAIN_ID || '80002', 10),
                status: 'CONFIRMED',
            },
        });

        // 4. Mint GRT reward for listing byproduct
        let grtTxHash: string | null = null;
        if (isGRTConfigured()) {
            try {
                const walletAddr = getWalletAddress();
                if (walletAddr) {
                    const grtResult = await mintGreenTokens(
                        walletAddr,
                        GRT_REWARDS.LIST_BYPRODUCT,
                        'LIST_BYPRODUCT',
                        productId,
                    );
                    grtTxHash = grtResult.txHash;

                    // Track GRT in database
                    await (prisma as any).greenTokenLedger.create({
                        data: {
                            userId,
                            amount: GRT_REWARDS.LIST_BYPRODUCT,
                            action: 'LIST_BYPRODUCT',
                            referenceId: productId,
                            txHash: grtResult.txHash,
                        },
                    });
                }
            } catch (err) {
                console.error('GRT minting failed (non-critical):', err);
            }
        }

        return res.status(201).json({
            message: 'Đã đăng ký thành công trên blockchain!',
            record: {
                id: record.id,
                productId,
                txHash: result.txHash,
                ipfsHash,
                ipfsUrl: getIPFSUrl(ipfsHash),
                explorerUrl: getExplorerUrl(result.txHash),
                contractAddress: result.contractAddress,
                walletAddress: result.walletAddress,
                grtReward: GRT_REWARDS.LIST_BYPRODUCT,
                grtTxHash,
            },
        });
    } catch (err) {
        return next(err);
    }
});

/**
 * GET /api/blockchain/record/:productId
 * Get blockchain record for a product (public).
 */
blockchainRouter.get('/record/:productId', async (req, res, next) => {
    try {
        const productId = z.string().uuid().parse(req.params.productId);

        // Get from database first (faster)
        const dbRecord = await (prisma as any).blockchainRecord.findFirst({
            where: { productId },
            include: {
                product: {
                    select: {
                        title: true,
                        category: true,
                        location: true,
                        imageUrl: true,
                        co2SavingsKg: true,
                        seller: { select: { name: true } },
                    },
                },
            },
        });

        if (!dbRecord) {
            return res.status(404).json({ error: 'Chưa đăng ký trên blockchain' });
        }

        // Optionally verify on-chain if configured
        let onChainRecord = null;
        if (isBlockchainConfigured()) {
            try {
                onChainRecord = await getByproductRecord(productId);
            } catch {
                // On-chain verification failed, return DB data
            }
        }

        return res.json({
            record: {
                id: dbRecord.id,
                productId,
                txHash: dbRecord.txHash,
                ipfsHash: dbRecord.ipfsHash,
                ipfsUrl: getIPFSUrl(dbRecord.ipfsHash),
                explorerUrl: getExplorerUrl(dbRecord.txHash),
                contractAddress: dbRecord.contractAddr,
                chainId: dbRecord.chainId,
                walletAddress: dbRecord.walletAddress,
                status: dbRecord.status,
                createdAt: dbRecord.createdAt,
                product: dbRecord.product,
                onChainVerified: onChainRecord !== null,
                onChainData: onChainRecord,
            },
        });
    } catch (err) {
        return next(err);
    }
});

/**
 * GET /api/blockchain/verify/:txHash
 * Verify a transaction by its hash.
 */
blockchainRouter.get('/verify/:txHash', async (req, res, next) => {
    try {
        const txHash = z.string().min(10).parse(req.params.txHash);

        const dbRecord = await (prisma as any).blockchainRecord.findUnique({
            where: { txHash },
            include: {
                product: {
                    select: {
                        id: true,
                        title: true,
                        category: true,
                        location: true,
                        imageUrl: true,
                        co2SavingsKg: true,
                        seller: { select: { name: true } },
                    },
                },
            },
        });

        if (!dbRecord) {
            return res.status(404).json({ error: 'Giao dịch không tồn tại trong hệ thống' });
        }

        return res.json({
            verified: true,
            record: {
                productId: dbRecord.productId,
                txHash: dbRecord.txHash,
                ipfsHash: dbRecord.ipfsHash,
                ipfsUrl: getIPFSUrl(dbRecord.ipfsHash),
                explorerUrl: getExplorerUrl(dbRecord.txHash),
                chainId: dbRecord.chainId,
                status: dbRecord.status,
                createdAt: dbRecord.createdAt,
                product: dbRecord.product,
            },
        });
    } catch (err) {
        return next(err);
    }
});

// ====================================================================
// TIER 2 – Smart Contract Escrow
// ====================================================================

const CreateEscrowSchema = z.object({
    inquiryId: z.string().uuid(),
    sellerAddress: z.string().min(10),
    amountWei: z.string().min(1),
});

/**
 * POST /api/blockchain/escrow/create
 * Create an escrow for a deal.
 */
blockchainRouter.post('/escrow/create', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        if (!isEscrowConfigured()) {
            return res.status(503).json({ error: 'Escrow chưa được cấu hình' });
        }

        const body = CreateEscrowSchema.parse(req.body);
        const buyerId = req.user!.id;

        // Verify inquiry exists and user is buyer
        const inquiry = await (prisma as any).productInquiry.findUnique({
            where: { id: body.inquiryId },
            select: { buyerId: true, sellerId: true, status: true },
        });

        if (!inquiry) {
            return res.status(404).json({ error: 'Phiên đàm phán không tồn tại' });
        }
        if (inquiry.buyerId !== buyerId) {
            return res.status(403).json({ error: 'Chỉ người mua mới có thể tạo escrow' });
        }

        // Create escrow on-chain
        const result = await createEscrowOnChain(
            body.inquiryId,
            body.sellerAddress,
            BigInt(body.amountWei),
        );

        // Save to database
        const escrow = await (prisma as any).escrowContract.create({
            data: {
                inquiryId: body.inquiryId,
                buyerAddress: getWalletAddress() || '',
                sellerAddress: body.sellerAddress,
                amountWei: body.amountWei,
                txHash: result.txHash,
                contractAddr: process.env.ESCROW_CONTRACT_ADDRESS || '',
                status: 'FUNDED',
            },
        });

        return res.status(201).json({
            message: 'Escrow đã được tạo thành công!',
            escrow: {
                id: escrow.id,
                txHash: result.txHash,
                explorerUrl: getExplorerUrl(result.txHash),
                status: 'FUNDED',
            },
        });
    } catch (err) {
        return next(err);
    }
});

/**
 * POST /api/blockchain/escrow/:id/confirm
 * Buyer confirms delivery → auto-release funds.
 */
blockchainRouter.post('/escrow/:id/confirm', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        if (!isEscrowConfigured()) {
            return res.status(503).json({ error: 'Escrow chưa được cấu hình' });
        }

        const escrowId = z.string().uuid().parse(req.params.id);

        const escrow = await (prisma as any).escrowContract.findUnique({
            where: { id: escrowId },
            include: { inquiry: { select: { buyerId: true, sellerId: true } } },
        });

        if (!escrow) {
            return res.status(404).json({ error: 'Escrow không tồn tại' });
        }
        if (escrow.inquiry.buyerId !== req.user!.id) {
            return res.status(403).json({ error: 'Chỉ người mua mới có thể xác nhận' });
        }
        if (escrow.status !== 'FUNDED') {
            return res.status(400).json({ error: 'Escrow không ở trạng thái hợp lệ' });
        }

        const result = await confirmDeliveryOnChain(escrow.inquiryId);

        await (prisma as any).escrowContract.update({
            where: { id: escrowId },
            data: { status: 'COMPLETED', txHash: result.txHash },
        });

        // Mint GRT for successful transaction
        if (isGRTConfigured()) {
            try {
                const walletAddr = getWalletAddress();
                if (walletAddr) {
                    const grtResult = await mintGreenTokens(
                        walletAddr,
                        GRT_REWARDS.TRANSACTION_SUCCESS,
                        'TRANSACTION_SUCCESS',
                        escrow.inquiryId,
                    );

                    // Track for both buyer and seller
                    await (prisma as any).greenTokenLedger.createMany({
                        data: [
                            {
                                userId: escrow.inquiry.buyerId,
                                amount: GRT_REWARDS.TRANSACTION_SUCCESS,
                                action: 'TRANSACTION_SUCCESS',
                                referenceId: escrow.inquiryId,
                                txHash: grtResult.txHash,
                            },
                            {
                                userId: escrow.inquiry.sellerId,
                                amount: GRT_REWARDS.TRANSACTION_SUCCESS,
                                action: 'TRANSACTION_SUCCESS',
                                referenceId: escrow.inquiryId,
                                txHash: grtResult.txHash,
                            },
                        ],
                    });
                }
            } catch (err) {
                console.error('GRT minting failed (non-critical):', err);
            }
        }

        return res.json({
            message: 'Đã xác nhận giao hàng, tiền đã được giải ngân!',
            txHash: result.txHash,
            explorerUrl: getExplorerUrl(result.txHash),
        });
    } catch (err) {
        return next(err);
    }
});

/**
 * POST /api/blockchain/escrow/:id/dispute
 * Raise a dispute on an escrow.
 */
blockchainRouter.post('/escrow/:id/dispute', requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
        if (!isEscrowConfigured()) {
            return res.status(503).json({ error: 'Escrow chưa được cấu hình' });
        }

        const escrowId = z.string().uuid().parse(req.params.id);

        const escrow = await (prisma as any).escrowContract.findUnique({
            where: { id: escrowId },
            include: { inquiry: { select: { buyerId: true, sellerId: true } } },
        });

        if (!escrow) {
            return res.status(404).json({ error: 'Escrow không tồn tại' });
        }

        const userId = req.user!.id;
        if (userId !== escrow.inquiry.buyerId && userId !== escrow.inquiry.sellerId) {
            return res.status(403).json({ error: 'Bạn không thuộc giao dịch này' });
        }

        const result = await raiseDisputeOnChain(escrow.inquiryId);

        await (prisma as any).escrowContract.update({
            where: { id: escrowId },
            data: { status: 'DISPUTED', txHash: result.txHash },
        });

        return res.json({
            message: 'Đã mở tranh chấp, tiền bị khoá chờ trọng tài!',
            txHash: result.txHash,
            explorerUrl: getExplorerUrl(result.txHash),
        });
    } catch (err) {
        return next(err);
    }
});

/**
 * GET /api/blockchain/escrow/:inquiryId
 * Get escrow status for an inquiry.
 */
blockchainRouter.get('/escrow/:inquiryId', async (req, res, next) => {
    try {
        const inquiryId = z.string().uuid().parse(req.params.inquiryId);

        const escrow = await (prisma as any).escrowContract.findFirst({
            where: { inquiryId },
            orderBy: { createdAt: 'desc' },
        });

        if (!escrow) {
            return res.status(404).json({ error: 'Không tìm thấy escrow cho phiên này' });
        }

        let onChainData = null;
        if (isEscrowConfigured() && escrow.txHash) {
            try {
                onChainData = await getEscrowOnChain(inquiryId);
            } catch { /* ignore */ }
        }

        return res.json({
            escrow: {
                id: escrow.id,
                inquiryId: escrow.inquiryId,
                buyerAddress: escrow.buyerAddress,
                sellerAddress: escrow.sellerAddress,
                amountWei: escrow.amountWei,
                txHash: escrow.txHash,
                contractAddr: escrow.contractAddr,
                status: escrow.status,
                createdAt: escrow.createdAt,
                updatedAt: escrow.updatedAt,
                explorerUrl: escrow.txHash ? getExplorerUrl(escrow.txHash) : null,
                onChainData,
            },
        });
    } catch (err) {
        return next(err);
    }
});

// ====================================================================
// TIER 3 – Green Token (GRT)
// ====================================================================

/**
 * GET /api/blockchain/grt/balance/:userId
 * Get GRT balance and history for a user.
 */
blockchainRouter.get('/grt/balance/:userId', async (req, res, next) => {
    try {
        const userId = z.string().uuid().parse(req.params.userId);

        // Get from database (aggregated)
        const ledgerEntries = await (prisma as any).greenTokenLedger.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });

        const totalGRT = ledgerEntries.reduce((sum: number, entry: any) => sum + entry.amount, 0);

        // Get on-chain balance if configured
        let onChainBalance: string | null = null;
        if (isGRTConfigured()) {
            const user = await (prisma.user as any).findUnique({
                where: { id: userId },
                select: { walletAddress: true },
            });
            if ((user as any)?.walletAddress) {
                try {
                    onChainBalance = await getGRTBalance((user as any).walletAddress);
                } catch { /* ignore */ }
            }
        }

        return res.json({
            userId,
            totalGRT,
            onChainBalance,
            history: ledgerEntries.map((entry: any) => ({
                id: entry.id,
                amount: entry.amount,
                action: entry.action,
                referenceId: entry.referenceId,
                txHash: entry.txHash,
                explorerUrl: entry.txHash ? getExplorerUrl(entry.txHash) : null,
                createdAt: entry.createdAt,
            })),
        });
    } catch (err) {
        return next(err);
    }
});

/**
 * GET /api/blockchain/grt/leaderboard
 * Top users by GRT earned.
 */
blockchainRouter.get('/grt/leaderboard', async (_req, res, next) => {
    try {
        const leaderboard = await (prisma as any).$queryRaw`
            SELECT 
                u.id as "userId",
                u.name as "userName",
                COALESCE(SUM(g.amount), 0)::int as "totalGRT",
                COUNT(g.id)::int as "actionCount"
            FROM "User" u
            LEFT JOIN "GreenTokenLedger" g ON g."userId" = u.id
            GROUP BY u.id, u.name
            HAVING COALESCE(SUM(g.amount), 0) > 0
            ORDER BY "totalGRT" DESC
            LIMIT 20
        `;

        return res.json({ leaderboard });
    } catch (err) {
        return next(err);
    }
});

/**
 * GET /api/blockchain/grt/green-index
 * Green Index by location (for map overlay).
 * Aggregates total GRT by product location.
 */
blockchainRouter.get('/grt/green-index', async (_req, res, next) => {
    try {
        // Get all GRT actions linked to products with locations
        const greenIndex = await (prisma as any).$queryRaw`
            SELECT 
                p.location,
                p.latitude,
                p.longitude,
                COALESCE(SUM(g.amount), 0)::int as "totalGRT",
                COUNT(DISTINCT g."userId")::int as "contributors"
            FROM "Product" p
            INNER JOIN "GreenTokenLedger" g ON g."referenceId" = p.id
            WHERE p.latitude IS NOT NULL 
              AND p.longitude IS NOT NULL
              AND p."deletedAt" IS NULL
            GROUP BY p.location, p.latitude, p.longitude
            ORDER BY "totalGRT" DESC
        `;

        return res.json({ greenIndex });
    } catch (err) {
        return next(err);
    }
});

/**
 * GET /api/blockchain/grt/stats
 * Overall GRT statistics.
 */
blockchainRouter.get('/grt/stats', async (_req, res, next) => {
    try {
        const [totalMinted, actionBreakdown, recentActivity] = await Promise.all([
            (prisma as any).greenTokenLedger.aggregate({ _sum: { amount: true }, _count: true }),
            (prisma as any).greenTokenLedger.groupBy({
                by: ['action'],
                _sum: { amount: true },
                _count: true,
            }),
            (prisma as any).greenTokenLedger.findMany({
                orderBy: { createdAt: 'desc' },
                take: 10,
                include: { user: { select: { name: true } } },
            }),
        ]);

        return res.json({
            totalMinted: totalMinted._sum?.amount ?? 0,
            totalTransactions: totalMinted._count ?? 0,
            actionBreakdown: actionBreakdown.map((item: any) => ({
                action: item.action,
                totalAmount: item._sum?.amount ?? 0,
                count: item._count ?? 0,
            })),
            recentActivity: recentActivity.map((entry: any) => ({
                userName: entry.user?.name ?? 'Unknown',
                amount: entry.amount,
                action: entry.action,
                createdAt: entry.createdAt,
            })),
        });
    } catch (err) {
        return next(err);
    }
});
