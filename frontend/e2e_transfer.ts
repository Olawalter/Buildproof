/**
 * BuildProof — Transfer Showcase Test
 *
 * Demonstrates _send_gen() actually firing by exhausting all 3 appeal rounds.
 * After the 4th evaluation with appeal_count >= MAX_APPEALS, the contract calls
 * _send_gen(owner, escrow_amount) — escrow drops to 0 and payment_released=true.
 *
 * Flow:
 *   Create → Deposit (payable) → Accept → Evidence → [Evaluate → Appeal → Reopen] × 3 → Final Evaluate
 *   On final evaluate: appeal_count(3) >= MAX_APPEALS(3) → _send_gen(owner) fires
 *
 * Usage:
 *   $env:OWNER_PK="0x..."; $env:CONTRACTOR_PK="0x..."; $env:NEXT_PUBLIC_CONTRACT_ADDRESS="0x..."; npx tsx e2e_transfer.ts
 */
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";
import { TransactionStatus } from "genlayer-js/types";

const CONTRACT = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "") as `0x${string}`;
const RPC_URL  = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL ?? "https://studio.genlayer.com/api";
const OWNER_PK = process.env.OWNER_PK as `0x${string}`;
const CONTR_PK = process.env.CONTRACTOR_PK as `0x${string}`;

if (!CONTRACT)                   { console.error("❌ NEXT_PUBLIC_CONTRACT_ADDRESS not set"); process.exit(1); }
if (!OWNER_PK?.startsWith("0x")) { console.error("❌ OWNER_PK required");                   process.exit(1); }
if (!CONTR_PK?.startsWith("0x")) { console.error("❌ CONTRACTOR_PK required");               process.exit(1); }

const ownerAccount      = privateKeyToAccount(OWNER_PK);
const contractorAccount = privateKeyToAccount(CONTR_PK);
const ownerClient       = createClient({ chain: studionet, account: ownerAccount,      endpoint: RPC_URL } as any);
const contractorClient  = createClient({ chain: studionet, account: contractorAccount, endpoint: RPC_URL } as any);
const readClient        = createClient({ chain: studionet, endpoint: RPC_URL } as any);

type Hash = `0x${string}`;

const GEN2 = BigInt("2000000000000000000");  // 2 GEN in wei

async function finalize(client: any, hash: Hash, label: string) {
  const r: any = await client.waitForTransactionReceipt({
    hash, status: TransactionStatus.FINALIZED, interval: 5_000, retries: 100,
  });
  const exec = String(r?.txExecutionResultName ?? r?.txExecutionResult ?? "");
  if (exec.toUpperCase().includes("ERROR")) {
    const msg = (r?.messages ?? []).find((m: any) => m?.errorMessage)?.errorMessage ?? exec;
    throw new Error(`[${label}] contract rejected: ${msg}`);
  }
  return r;
}

async function write(client: any, label: string, fn: string, args: any[], value = 0n) {
  process.stdout.write(`  ⏳ ${label} … `);
  const hash: Hash = await client.writeContract({ address: CONTRACT, functionName: fn, args, value });
  process.stdout.write(`tx ${hash.slice(0, 10)}… `);
  await finalize(client, hash, label);
  console.log("✓");
  return hash;
}

async function read(fn: string, args: any[] = []) {
  return readClient.readContract({ address: CONTRACT, functionName: fn, args });
}

function sep(title: string) {
  console.log(`\n${"─".repeat(64)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(64));
}

async function main() {
  console.log("═".repeat(64));
  console.log("  BuildProof — _send_gen Transfer Showcase");
  console.log("  Strategy: exhaust 3 appeal rounds → refund fires on 4th eval");
  console.log("═".repeat(64));
  console.log(`  Contract  : ${CONTRACT}`);
  console.log(`  Owner     : ${ownerAccount.address}`);
  console.log(`  Contractor: ${contractorAccount.address}`);

  // ── SETUP ──────────────────────────────────────────────────────────────────

  sep("SETUP — Create project");
  await write(ownerClient, "create_project", "create_project", [
    "Transfer Showcase Project",
    "Test project to demonstrate escrow custody and _send_gen refund path " +
    "after all appeal rounds are exhausted.",
    "Abuja, Nigeria",
    GEN2,
    ["Structural Certificate", "MEP Sign-Off", "Fire Safety Report"],
    contractorAccount.address,
  ]);

  const ownerIds = await read("get_owner_projects", [ownerAccount.address]) as string[];
  const pid = ownerIds[ownerIds.length - 1];
  console.log(`  Project ID: ${pid}`);

  sep("SETUP — Owner deposits 2 GEN escrow (payable — GEN sent as tx value)");
  await write(ownerClient, "deposit_escrow", "deposit_escrow", [pid], GEN2);

  let p: any = await read("project_details", [pid]);
  console.log(`  escrow_deposited : ${p.escrow_deposited} wei  (${Number(p.escrow_deposited) / 1e18} GEN)`);
  console.log(`  status           : ${p.status}`);

  sep("SETUP — Contractor accepts");
  await write(contractorClient, "accept_project", "accept_project", [pid]);
  p = await read("project_details", [pid]);
  console.log(`  status: ${p.status}`);  // escrowed

  sep("SETUP — Submit placeholder evidence (unverifiable — AI will reject)");
  const evItems = [
    ["certificate", "Structural Certificate", "https://example.com/struct-cert", "Structural works completed per spec."],
    ["report",      "MEP Sign-Off",           "https://example.com/mep-signoff", "MEP systems installed and tested."],
    ["certificate", "Fire Safety Report",     "https://example.com/fire-safety", "Fire suppression system certified."],
  ];
  for (const [type, title, url, desc] of evItems) {
    await write(contractorClient, title, "submit_evidence", [pid, type, title, url, desc, false]);
  }

  // ── APPEAL LOOP ────────────────────────────────────────────────────────────
  // 3 rounds of: request_inspection → evaluate (rejected) → submit_appeal → reopen

  for (let round = 1; round <= 3; round++) {
    sep(`APPEAL ROUND ${round}/3`);

    await write(contractorClient, `[Round ${round}] request_inspection`, "request_inspection", [pid]);

    console.log(`  ⏳ [Round ${round}] AI evaluation running (2–8 min) — validators independently assess evidence…`);
    await write(ownerClient, `[Round ${round}] evaluate_completion`, "evaluate_completion", [pid]);

    p = await read("project_details", [pid]);
    const cs: any = await read("consensus_status", [pid]);
    console.log(`  result           : ${cs.passed ? "APPROVED" : "REJECTED"} (confidence: ${cs.confidence_pct}%)`);
    console.log(`  reason           : ${cs.reason}`);
    console.log(`  escrow_deposited : ${p.escrow_deposited} wei  ← still locked`);
    console.log(`  appeal_count     : ${p.appeal_count}`);

    if (round < 3) {
      await write(ownerClient, `[Round ${round}] submit_appeal`, "submit_appeal", [
        pid,
        `Round ${round} appeal: additional verification documents being sourced. ` +
        `Contractor has engaged regulatory consultants to obtain certified copies.`,
      ]);
      await write(contractorClient, `[Round ${round}] reopen_for_evidence`, "reopen_for_evidence", [pid]);
    } else {
      // Round 3 — file final appeal to push appeal_count to MAX_APPEALS
      await write(ownerClient, "[Round 3] submit_appeal (final)", "submit_appeal", [
        pid,
        "Final appeal: all parties agree to submit to automated adjudication. " +
        "Requesting final AI determination with escrow resolution.",
      ]);
      await write(contractorClient, "[Round 3] reopen_for_evidence", "reopen_for_evidence", [pid]);
    }
  }

  // ── FINAL EVALUATION — _send_gen FIRES ────────────────────────────────────

  sep("FINAL EVALUATION — appeal_count = 3 = MAX_APPEALS → _send_gen(owner) fires");
  p = await read("project_details", [pid]);
  console.log(`  appeal_count before eval : ${p.appeal_count}  (= MAX_APPEALS)`);
  console.log(`  escrow_deposited before  : ${p.escrow_deposited} wei`);

  await write(contractorClient, "request_inspection", "request_inspection", [pid]);

  console.log("  ⏳ Final AI evaluation running — on rejection, _send_gen(owner) will fire…");
  await write(ownerClient, "evaluate_completion [FINAL]", "evaluate_completion", [pid]);

  // ── RESULT ─────────────────────────────────────────────────────────────────

  sep("RESULT — Post-transfer state");
  p = await read("project_details", [pid]);
  const cs: any = await read("consensus_status", [pid]);

  console.log(`  project status     : ${p.status}`);
  console.log(`  payment_released   : ${p.payment_released}`);
  console.log(`  escrow_deposited   : ${p.escrow_deposited} wei  ← should be 0`);
  console.log(`  appeal_count       : ${p.appeal_count}`);
  console.log(`  AI passed          : ${cs.passed}`);
  console.log(`  confidence_pct     : ${cs.confidence_pct}%`);
  console.log(`  reason             : ${cs.reason}`);

  console.log("\n" + "═".repeat(64));
  if (p.status === "finalized" && p.payment_released && p.escrow_deposited === "0") {
    console.log("  ✅ _send_gen(owner) CONFIRMED FIRED");
    console.log("  ✅ escrow_deposited = 0 — GEN left the contract");
    console.log("  ✅ payment_released = true — state correctly finalized");
    console.log(`  ✅ 2 GEN returned to owner: ${ownerAccount.address}`);
  } else {
    console.log(`  ⚠️  Unexpected state: ${p.status} | escrow: ${p.escrow_deposited}`);
  }
  console.log("═".repeat(64));
  console.log(`  Contract : ${CONTRACT}`);
  console.log(`  Project  : ${pid}`);
  console.log(`  Explorer : https://explorer-studio.genlayer.com/address/${CONTRACT}`);
}

main().catch(e => {
  console.error("\n❌ FAILED:", e?.message ?? e);
  process.exit(1);
});
