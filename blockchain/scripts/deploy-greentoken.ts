import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying GreenToken with account:", deployer.address);

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Account balance:", ethers.formatEther(balance), "MATIC\n");

    console.log("--- Deploying GreenToken ---");
    const GreenToken = await ethers.getContractFactory("GreenToken");
    const greenToken = await GreenToken.deploy();
    await greenToken.waitForDeployment();
    const greenTokenAddress = await greenToken.getAddress();
    console.log("✅ GreenToken deployed to:", greenTokenAddress);

    console.log("\n========================================");
    console.log("Add this to your .env file:");
    console.log(`GREEN_TOKEN_ADDRESS=${greenTokenAddress}`);
    console.log("========================================\n");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
