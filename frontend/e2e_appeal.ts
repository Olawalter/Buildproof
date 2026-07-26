/**
 * Appeal + re-evaluation round for Project #0.
 * Usage: OWNER_PK=0x... CONTRACTOR_PK=0x... NEXT_PUBLIC_CONTRACT_ADDRESS=0x... npx tsx e2e_appeal.ts
 */
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";
import { TransactionStatus } from "genlayer-js/types";

const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;
const RPC_URL  = "https://studio.genlayer.com/api";

const ownerAccount      = privateKeyToAccount(process.env.OWNER_PK as `0x${string}`);
const contractorAccount = privateKeyToAccount(process.env.CONTRACTOR_PK as `0x${string}`);
const ownerClient       = createClient({ chain: studionet, account: ownerAccount,      endpoint: RPC_URL } as any);
const contractorClient  = createClient({ chain: studionet, account: contractorAccount, endpoint: RPC_URL } as any);
const readClient        = createClient({ chain: studionet, endpoint: RPC_URL } as any);

const PID = "0";

async function finalize(client: any, hash: `0x${string}`, label: string) {
  const r: any = await client.waitForTransactionReceipt({
    hash, status: TransactionStatus.FINALIZED, interval: 5_000, retries: 80,
  });
  const exec = String(r?.txExecutionResultName ?? r?.txExecutionResult ?? "");
  if (exec.toUpperCase().includes("ERROR")) {
    const msg = (r?.messages ?? []).find((m: any) => m?.errorMessage)?.errorMessage ?? exec;
    throw new Error(`[${label}] REJECTED: ${msg}`);
  }
  return r;
}

async function write(client: any, label: string, fn: string, args: any[]) {
  process.stdout.write(`  ⏳ ${label} … `);
  const hash = await client.writeContract({ address: CONTRACT, functionName: fn, args, value: 0n }) as `0x${string}`;
  process.stdout.write(`tx ${hash.slice(0, 10)}… `);
  await finalize(client, hash, label);
  console.log("✓");
}

async function read(fn: string, args: any[] = []) {
  return readClient.readContract({ address: CONTRACT, functionName: fn, args });
}

function sep(t: string) {
  console.log(`\n${"─".repeat(60)}\n  ${t}\n${"─".repeat(60)}`);
}

async function main() {
  console.log("═".repeat(60));
  console.log("  Appeal + Re-evaluation — Project #" + PID);
  console.log("  Contract:", CONTRACT);
  console.log("═".repeat(60));

  // ── STEP A: Contractor files appeal ───────────────────────────────────────
  sep("STEP A — Contractor files appeal");
  await write(contractorClient, "submit_appeal", "submit_appeal", [
    PID,
    "The LASBCA government approval letter was submitted by the project owner in " +
    "evidence item #5 but was not counted due to a submission role mismatch. " +
    "We are re-submitting it correctly as contractor completion evidence in this " +
    "appeal round along with the original permit reference LASBCA/VI/2026/0847. " +
    "All five required inspections have been satisfied on site.",
  ]);
  let p: any = await read("project_details", [PID]);
  console.log("  status      :", p.status);
  console.log("  appeal_count:", p.appeal_count);

  // ── STEP B: Reopen for evidence ────────────────────────────────────────────
  sep("STEP B — Reopen project for additional evidence");
  await write(contractorClient, "reopen_for_evidence", "reopen_for_evidence", [PID]);
  p = await read("project_details", [PID]);
  console.log("  status:", p.status);

  // ── STEP C: Contractor submits missing LASBCA approval ─────────────────────
  sep("STEP C — Contractor submits LASBCA government approval");
  await write(contractorClient, "LASBCA approval permit", "submit_evidence", [
    PID,
    "permit",
    "Lagos State Building Control Agency Final Approval — Floors 18–24",
    "https://ipfs.io/ipfs/QmBuildProofLASBCAApproval2026Lagos005",
    "LASBCA final approval letter for floors 18-24 construction activities. " +
    "Reference: LASBCA/VI/2026/0847. Signed by Director of Building Control, Lagos State. " +
    "All five required inspection items confirmed satisfied per site verification 2026-07-25. " +
    "This is the official government-issued occupancy and completion approval for this phase.",
    false,
  ]);

  const m: any = await read("milestone_status", [PID]);
  console.log("  Total evidence on record:", m.evidence.length);
  if (m.evidence.length > 0) {
    console.log("  Latest evidence:", m.evidence[m.evidence.length - 1]?.title);
  }

  // ── STEP D: Contractor requests re-inspection ─────────────────────────────
  sep("STEP D — Contractor requests re-inspection");
  await write(contractorClient, "request_inspection", "request_inspection", [PID]);
  p = await read("project_details", [PID]);
  console.log("  status:", p.status);

  // ── STEP E: Owner triggers re-evaluation ──────────────────────────────────
  sep("STEP E — Owner triggers AI re-evaluation");
  console.log("  ⏳ Running LLM consensus across validators… (2–5 min)");
  await write(ownerClient, "evaluate_completion", "evaluate_completion", [PID]);

  // ── STEP F: Final result ───────────────────────────────────────────────────
  sep("STEP F — Final decision");
  p = await read("project_details", [PID]);
  const cs: any = await read("consensus_status", [PID]);

  console.log("  project status      :", p.status);
  console.log("  payment_released    :", p.payment_released);
  console.log("  escrow_deposited    :", p.escrow_deposited, "wei");
  console.log("");
  console.log("  AI Decision:");
  console.log("    passed            :", cs.passed);
  console.log("    confidence_pct    :", cs.confidence_pct, "%");
  console.log("    critical_defects  :", cs.critical_defects);
  console.log("    occupancy_verified:", cs.occupancy_verified);
  console.log("    reason            :", cs.reason);
  console.log("    appeal_count      :", cs.appeal_count);

  sep("FINAL RESULT");
  if (p.status === "finalized" && p.payment_released && cs.passed) {
    console.log("  ✅ APPROVED — 5 GEN auto-transferred to contractor via gl.transfer()");
    console.log("  ✅ Appeal round complete. Full e2e DONE.");
  } else if (p.status === "finalized" && p.payment_released && !cs.passed) {
    console.log("  ✅ REJECTED (final) — 5 GEN auto-returned to owner via gl.transfer()");
    console.log("  ✅ Appeal round complete. Full e2e DONE.");
  } else if (p.status === "rejected") {
    console.log("  ⚠️  REJECTED — appeals remaining:", 3 - Number(cs.appeal_count));
  } else {
    console.log("  ℹ️  Status:", p.status);
  }

  console.log("\n  Contract :", CONTRACT);
  console.log("  Project  :", PID);
}

main().catch(e => { console.error("\n❌ FAILED:", e?.message ?? e); process.exit(1); });
