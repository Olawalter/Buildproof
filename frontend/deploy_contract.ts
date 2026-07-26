/**
 * Deploy BuildProof contract to GenLayer StudioNet.
 *
 * Usage:
 *   DEPLOYER_PK=0x... npx tsx deploy_contract.ts
 *
 * The deployer private key MUST be set via the DEPLOYER_PK environment variable.
 * Never hardcode private keys in source files.
 */
import { readFileSync } from "fs";
import path from "path";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";
import { TransactionStatus } from "genlayer-js/types";

const pk = process.env.DEPLOYER_PK;
if (!pk || !pk.startsWith("0x")) {
  console.error("❌ DEPLOYER_PK environment variable is required.");
  console.error("   Usage: DEPLOYER_PK=0x<your-private-key> npx tsx deploy_contract.ts");
  process.exit(1);
}

const STUDIO_URL = process.env.GENLAYER_RPC_URL ?? "https://studio.genlayer.com/api";
const account = privateKeyToAccount(pk as `0x${string}`);
const client = createClient({ chain: studionet, account, endpoint: STUDIO_URL } as any);

async function main() {
  const contractPath = path.resolve(process.cwd(), "../contracts/construction_escrow.py");
  const code = new Uint8Array(readFileSync(contractPath));

  console.log("Deployer :", account.address);
  console.log("RPC      :", STUDIO_URL);
  console.log("Contract :", contractPath);
  console.log("\nDeploying…");

  const deployHash: any = await client.deployContract({ code, args: [] });
  console.log("Deploy tx:", deployHash);

  const receipt: any = await client.waitForTransactionReceipt({
    hash: deployHash,
    status: TransactionStatus.FINALIZED,
    interval: 5_000,
    retries: 80,
  });

  console.log("Status   :", receipt?.statusName ?? receipt?.status);
  console.log("ExecResult:", receipt?.txExecutionResultName ?? receipt?.txExecutionResult);

  const contractAddress =
    receipt?.data?.contract_address ??
    receipt?.txDataDecoded?.contractAddress ??
    receipt?.data?.contractAddress;

  console.log("\n✅ Deployed at:", contractAddress);
  console.log("\nAdd to .env.local:");
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}`);
}

main().catch(e => { console.error("Deploy failed:", e?.message ?? e); process.exit(1); });
