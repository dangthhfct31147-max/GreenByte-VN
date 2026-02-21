import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Wallet Address:", deployer.address);

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Balance:", ethers.formatEther(balance), "MATIC");

    if (balance === 0n) {
        console.log("\n⚠️  Wallet has NO MATIC! You need to get testnet MATIC from a faucet.");
        console.log("Faucets to try:");
        console.log("  1. https://cloud.google.com/application/web3/faucet/ethereum/amoy");
        console.log("  2. https://www.alchemy.com/faucets/polygon-amoy");
        console.log("  3. https://faucets.chain.link/polygon-amoy");
    } else {
        console.log("\n✅ Wallet has MATIC. Ready to deploy!");
    }
}

main().catch(console.error);
