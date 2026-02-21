import { ethers } from 'ethers';
import path from 'path';
import fs from 'fs';

// ====== Configuration ======

function getBlockchainConfig() {
    const rpcUrl = process.env.POLYGON_RPC_URL || 'https://rpc-amoy.polygon.technology';
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    const registryAddress = process.env.BYPRODUCT_REGISTRY_ADDRESS;
    const escrowAddress = process.env.ESCROW_CONTRACT_ADDRESS;
    const greenTokenAddress = process.env.GREEN_TOKEN_ADDRESS;
    const chainId = parseInt(process.env.CHAIN_ID || '80002', 10);
    const pinataApiKey = process.env.PINATA_API_KEY;
    const pinataSecretKey = process.env.PINATA_SECRET_KEY;
    const pinataGateway = process.env.PINATA_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs/';

    return {
        rpcUrl,
        privateKey,
        registryAddress,
        escrowAddress,
        greenTokenAddress,
        chainId,
        pinataApiKey,
        pinataSecretKey,
        pinataGateway,
    };
}

// ====== ABI Loading ======

function loadABI(contractName: string): any[] {
    // Look for compiled artifacts from Hardhat
    const artifactPath = path.resolve(
        __dirname,
        '../../../blockchain/artifacts/contracts',
        `${contractName}.sol`,
        `${contractName}.json`,
    );

    if (!fs.existsSync(artifactPath)) {
        throw new Error(`Contract artifact not found: ${artifactPath}. Run 'npx hardhat compile' in blockchain/ first.`);
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
    return artifact.abi;
}

// ====== Provider & Signer ======

let _provider: ethers.JsonRpcProvider | null = null;
let _signer: ethers.Wallet | null = null;

function getProvider(): ethers.JsonRpcProvider {
    if (!_provider) {
        const config = getBlockchainConfig();
        _provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
    }
    return _provider;
}

function getSigner(): ethers.Wallet {
    if (!_signer) {
        const config = getBlockchainConfig();
        if (!config.privateKey) {
            throw new Error('DEPLOYER_PRIVATE_KEY not configured');
        }
        _signer = new ethers.Wallet(config.privateKey, getProvider());
    }
    return _signer;
}

// ====== Contract Instances ======

let _registryContract: ethers.Contract | null = null;
let _escrowContract: ethers.Contract | null = null;
let _greenTokenContract: ethers.Contract | null = null;

function getRegistryContract(): ethers.Contract {
    if (!_registryContract) {
        const config = getBlockchainConfig();
        if (!config.registryAddress) {
            throw new Error('BYPRODUCT_REGISTRY_ADDRESS not configured');
        }
        const abi = loadABI('ByproductRegistry');
        _registryContract = new ethers.Contract(config.registryAddress, abi, getSigner());
    }
    return _registryContract;
}

function getEscrowContract(): ethers.Contract {
    if (!_escrowContract) {
        const config = getBlockchainConfig();
        if (!config.escrowAddress) {
            throw new Error('ESCROW_CONTRACT_ADDRESS not configured');
        }
        const abi = loadABI('EscrowPayment');
        _escrowContract = new ethers.Contract(config.escrowAddress, abi, getSigner());
    }
    return _escrowContract;
}

function getGreenTokenContract(): ethers.Contract {
    if (!_greenTokenContract) {
        const config = getBlockchainConfig();
        if (!config.greenTokenAddress) {
            throw new Error('GREEN_TOKEN_ADDRESS not configured');
        }
        const abi = loadABI('GreenToken');
        _greenTokenContract = new ethers.Contract(config.greenTokenAddress, abi, getSigner());
    }
    return _greenTokenContract;
}

// ====== IPFS (Pinata) ======

interface IPFSMetadata {
    productId: string;
    origin: string;
    gpsLocation: string;
    category: string;
    weightKg: number;
    harvestDate: string;
    description?: string;
    imageUrl?: string;
    sellerName: string;
    registeredAt: string;
}

export async function uploadToIPFS(metadata: IPFSMetadata): Promise<string> {
    const config = getBlockchainConfig();
    if (!config.pinataApiKey || !config.pinataSecretKey) {
        throw new Error('Pinata API keys not configured');
    }

    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'pinata_api_key': config.pinataApiKey,
            'pinata_secret_api_key': config.pinataSecretKey,
        },
        body: JSON.stringify({
            pinataContent: metadata,
            pinataMetadata: {
                name: `byproduct-${metadata.productId}`,
            },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Pinata upload failed: ${response.status} ${errorText}`);
    }

    const result = (await response.json()) as { IpfsHash: string };
    return result.IpfsHash;
}

export function getIPFSUrl(hash: string): string {
    const config = getBlockchainConfig();
    return `${config.pinataGateway}${hash}`;
}

// ====== Byproduct Registry ======

export interface RegisterByproductParams {
    productId: string;
    ipfsHash: string;
    origin: string;
    gpsLocation: string;
    category: string;
    weightKg: number;
    harvestDate: number; // Unix timestamp
}

export async function registerByproductOnChain(
    params: RegisterByproductParams,
): Promise<{ txHash: string; walletAddress: string; contractAddress: string }> {
    const contract = getRegistryContract();
    const signer = getSigner();

    const tx = await contract.registerByproduct(
        params.productId,
        params.ipfsHash,
        params.origin,
        params.gpsLocation,
        params.category,
        params.weightKg,
        params.harvestDate,
    );

    const receipt = await tx.wait();

    return {
        txHash: receipt.hash,
        walletAddress: await signer.getAddress(),
        contractAddress: await contract.getAddress(),
    };
}

export async function getByproductRecord(productId: string) {
    const contract = getRegistryContract();
    const exists = await contract.recordExists(productId);
    if (!exists) return null;

    const record = await contract.getRecord(productId);
    return {
        ipfsHash: record[0] as string,
        origin: record[1] as string,
        gpsLocation: record[2] as string,
        category: record[3] as string,
        weightKg: Number(record[4]),
        harvestDate: Number(record[5]),
        registeredBy: record[6] as string,
        timestamp: Number(record[7]),
    };
}

// ====== Escrow ======

export async function createEscrowOnChain(
    dealId: string,
    sellerAddress: string,
    amountWei: bigint,
): Promise<{ txHash: string }> {
    const contract = getEscrowContract();

    const tx = await contract.createEscrow(dealId, sellerAddress, {
        value: amountWei,
    });

    const receipt = await tx.wait();
    return { txHash: receipt.hash };
}

export async function confirmDeliveryOnChain(dealId: string): Promise<{ txHash: string }> {
    const contract = getEscrowContract();
    const tx = await contract.confirmDelivery(dealId);
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
}

export async function raiseDisputeOnChain(dealId: string): Promise<{ txHash: string }> {
    const contract = getEscrowContract();
    const tx = await contract.raiseDispute(dealId);
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
}

export async function resolveDisputeOnChain(
    dealId: string,
    refundToBuyer: boolean,
): Promise<{ txHash: string }> {
    const contract = getEscrowContract();
    const tx = await contract.resolveDispute(dealId, refundToBuyer);
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
}

export async function getEscrowOnChain(dealId: string) {
    const contract = getEscrowContract();
    try {
        const result = await contract.getEscrow(dealId);
        return {
            buyer: result[0] as string,
            seller: result[1] as string,
            amount: result[2].toString(),
            status: Number(result[3]),
            createdAt: Number(result[4]),
            completedAt: Number(result[5]),
        };
    } catch {
        return null;
    }
}

// ====== Green Token (GRT) ======

// Reward amounts (matching Solidity contract)
export const GRT_REWARDS = {
    LIST_BYPRODUCT: 10,
    TRANSACTION_SUCCESS: 5,
    COLLECTION_EVENT: 20,
    PROVE_REUSE: 8,
} as const;

export async function mintGreenTokens(
    recipientAddress: string,
    amount: number,
    action: string,
    referenceId: string,
): Promise<{ txHash: string }> {
    const contract = getGreenTokenContract();
    const amountWei = ethers.parseEther(amount.toString());

    const tx = await contract.mintReward(recipientAddress, amountWei, action, referenceId);
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
}

export async function getGRTBalance(address: string): Promise<string> {
    const contract = getGreenTokenContract();
    const balance = await contract.balanceOf(address);
    return ethers.formatEther(balance);
}

export async function getGRTTotalEarned(address: string): Promise<string> {
    const contract = getGreenTokenContract();
    const totalEarned = await contract.totalEarned(address);
    return ethers.formatEther(totalEarned);
}

// ====== Utility ======

export function isBlockchainConfigured(): boolean {
    const config = getBlockchainConfig();
    return Boolean(config.privateKey && config.registryAddress);
}

export function isEscrowConfigured(): boolean {
    const config = getBlockchainConfig();
    return Boolean(config.privateKey && config.escrowAddress);
}

export function isGRTConfigured(): boolean {
    const config = getBlockchainConfig();
    return Boolean(config.privateKey && config.greenTokenAddress);
}

export function getExplorerUrl(txHash: string): string {
    const config = getBlockchainConfig();
    if (config.chainId === 80002) {
        return `https://amoy.polygonscan.com/tx/${txHash}`;
    }
    return `https://polygonscan.com/tx/${txHash}`;
}

export function getWalletAddress(): string | null {
    try {
        return getSigner().address;
    } catch {
        return null;
    }
}
