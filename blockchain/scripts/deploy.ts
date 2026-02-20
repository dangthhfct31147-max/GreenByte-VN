import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "MATIC");

    // 1. Deploy ByproductRegistry
    console.log("\n--- Deploying ByproductRegistry ---");
    const ByproductRegistry = await ethers.getContractFactory("ByproductRegistry");
    const registry = await ByproductRegistry.deploy();
    await registry.waitForDeployment();
    const registryAddr = await registry.getAddress();
    console.log("ByproductRegistry deployed to:", registryAddr);

    // 2. Deploy EscrowPayment
    console.log("\n--- Deploying EscrowPayment ---");
    const EscrowPayment = await ethers.getContractFactory("EscrowPayment");
    const escrow = await EscrowPayment.deploy();
    await escrow.waitForDeployment();
    const escrowAddr = await escrow.getAddress();
    console.log("EscrowPayment deployed to:", escrowAddr);

    // 3. Deploy GreenToken
    console.log("\n--- Deploying GreenToken ---");
    const GreenToken = await ethers.getContractFactory("GreenToken");
    const greenToken = await GreenToken.deploy();
    await greenToken.waitForDeployment();
    const greenTokenAddr = await greenToken.getAddress();
    console.log("GreenToken deployed to:", greenTokenAddr);

    // Summary
    console.log("\n========================================");
    console.log("  DEPLOYMENT COMPLETE");
    console.log("========================================");
    console.log(`BYPRODUCT_REGISTRY_ADDRESS=${registryAddr}`);
    console.log(`ESCROW_CONTRACT_ADDRESS=${escrowAddr}`);
    console.log(`GREEN_TOKEN_ADDRESS=${greenTokenAddr}`);
    console.log("========================================");
    console.log("\nCopy the above addresses into your .env file!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
