import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";

const CONTRACT = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "") as `0x${string}`;
const RPC_URL  = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL ?? "https://studio.genlayer.com/api";
const OWNER_PK = process.env.OWNER_PK as `0x${string}`;
const PID      = process.env.PROJECT_ID ?? "1";

const ownerAccount = privateKeyToAccount(OWNER_PK);
const readClient   = createClient({ chain: studionet, endpoint: RPC_URL } as any);

async function main() {
  const p:  any = await readClient.readContract({ address: CONTRACT, functionName: "project_details", args: [PID] });
  const cs: any = await readClient.readContract({ address: CONTRACT, functionName: "consensus_status",  args: [PID] });
  const bal: bigint = BigInt(await readClient.getBalance({ address: ownerAccount.address as `0x${string}` }));

  console.log("═".repeat(64));
  console.log("  Final state — Project", PID, "on", CONTRACT);
  console.log("═".repeat(64));
  console.log(`  status           : ${p.status}`);
  console.log(`  payment_released : ${p.payment_released}`);
  console.log(`  escrow_deposited : ${p.escrow_deposited} wei`);
  console.log(`  appeal_count     : ${p.appeal_count}`);
  console.log(`  Owner balance    : ${bal} wei`);
  console.log(`  verification_failed   : ${cs.verification_failed}`);
  console.log(`  verified_inspections  : ${cs.verified_inspections}`);
  console.log(`  total_inspections     : ${cs.total_inspections}`);
  console.log(`  passed           : ${cs.passed}`);
  console.log(`  confidence_pct   : ${cs.confidence_pct}%`);
  console.log(`  reason           : ${cs.reason}`);
  console.log(`  Explorer : https://explorer-studio.genlayer.com/address/${CONTRACT}`);
}

main().catch(e => { console.error("❌", e?.message ?? e); process.exit(1); });
