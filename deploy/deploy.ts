/**
 * Deployment script for ConstructionEscrow on GenLayer StudioNet.
 * Usage: npx ts-node deploy/deploy.ts
 *
 * Prerequisites:
 *   - OWNER_PRIVATE_KEY env var set
 *   - genlayer-js installed
 *   - Funded account on StudioNet
 */

import fs from "fs";
import path from "path";
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const PRIVATE_KEY = process.env.OWNER_PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error("Error: OWNER_PRIVATE_KEY environment variable is required.");
  process.exit(1);
}

async function deploy() {
  console.log("BuildProof — Deploying ConstructionEscrow to StudioNet\n");

  const account = createAccount(PRIVATE_KEY as `0x${string}`);
  const client = createClient({ chain: studionet, account });

  console.log(`Deployer: ${account.address}`);
  console.log(`Network:  StudioNet`);

  // Read contract code
  const contractPath = path.resolve(__dirname, "../contracts/construction_escrow.py");
  const contractCode = fs.readFileSync(contractPath, "utf-8");

  console.log("\nDeploying contract…");

  // Deploy
  const deployHash = await (client as any).deployContract({
    code: contractCode,
    args: [],
    value: BigInt(0),
  });

  console.log(`Deploy TX hash: ${deployHash}`);
  console.log("Awaiting finalization…");

  const receipt = await client.waitForTransactionReceipt({
    hash: deployHash,
    status: TransactionStatus.FINALIZED,
    interval: 5_000,
    retries: 60,
  });

  const contractAddress = (receipt as any).contractAddress;
  console.log(`\nContract deployed at: ${contractAddress}`);

  // Write deployment info
  const deployInfo = {
    contractAddress,
    deployTxHash: deployHash,
    network: "studionet",
    deployedAt: new Date().toISOString(),
    contractFile: "contracts/construction_escrow.py",
  };

  const outPath = path.resolve(__dirname, "deployment.json");
  fs.writeFileSync(outPath, JSON.stringify(deployInfo, null, 2));
  console.log(`\nDeployment info saved to ${outPath}`);

  console.log("\n──────────────────────────────────────────");
  console.log("Add the following to your frontend .env.local:");
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}`);
  console.log("NEXT_PUBLIC_NETWORK=studionet");
  console.log("──────────────────────────────────────────\n");
}

deploy().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
