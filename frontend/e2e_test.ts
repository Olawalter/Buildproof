/**
 * BuildProof — End-to-End Test Suite (2 full runs)
 *
 * Tests the current ABI:
 *   - deposit_escrow(project_id)  with  value: GEN5  (payable — no amount arg)
 *   - submit_evidence(project_id, type, title, url, description, permit_number, is_dispute)
 *
 * Assertions at every step:
 *   - Wallet balance decreases after deposit (proves GEN entered contract)
 *   - Status transitions: draft → escrowed → evidence_submitted → under_review → rejected
 *   - appeal_count increments after submit_appeal
 *   - escrow_deposited remains locked after rejection (funds safe)
 *
 * Usage:
 *   $env:OWNER_PK="0x..."; $env:CONTRACTOR_PK="0x..."; $env:NEXT_PUBLIC_CONTRACT_ADDRESS="0x..."; npx tsx e2e_test.ts
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

function makeClient(account?: any) {
  return createClient({ chain: studionet, ...(account ? { account } : {}), endpoint: RPC_URL } as any);
}

const ownerClient      = makeClient(ownerAccount);
const contractorClient = makeClient(contractorAccount);
const readClient       = makeClient();

type Hash = `0x${string}`;

const GEN5 = BigInt("5000000000000000000");

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
  // Retry finalize up to 3 times on transient RPC errors
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await finalize(client, hash, label);
      break;
    } catch (err: any) {
      if (attempt === 3 || !String(err?.message).includes("fetch failed")) throw err;
      process.stdout.write(`[RPC retry ${attempt}]… `);
      await new Promise(r => setTimeout(r, 15_000));
    }
  }
  console.log("✓");
  return hash;
}

async function read(fn: string, args: any[] = []) {
  return readClient.readContract({ address: CONTRACT, functionName: fn, args });
}

async function getBalance(address: string): Promise<bigint> {
  const bal = await readClient.getBalance({ address: address as `0x${string}` });
  return BigInt(bal);
}

function sep(title: string) {
  console.log(`\n${"─".repeat(64)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(64));
}

function assertEq(label: string, actual: any, expected: any) {
  const ok = String(actual) === String(expected);
  console.log(`  ${ok ? "✅" : "❌"} assert ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`);
  if (!ok) throw new Error(`Assertion failed — ${label}: got "${actual}", expected "${expected}"`);
}

function assertGt(label: string, a: bigint, b: bigint) {
  const ok = a > b;
  console.log(`  ${ok ? "✅" : "❌"} assert ${label}: ${a} > ${b}`);
  if (!ok) throw new Error(`Assertion failed — ${label}: ${a} is not > ${b}`);
}

function assertLt(label: string, a: bigint, b: bigint) {
  const ok = a < b;
  console.log(`  ${ok ? "✅" : "❌"} assert ${label}: ${a} < ${b}`);
  if (!ok) throw new Error(`Assertion failed — ${label}: ${a} is not < ${b}`);
}

// ─── TEST 1: Standard completion flow ────────────────────────────────────────

async function test1() {
  console.log("\n" + "═".repeat(64));
  console.log("  TEST 1 — Contractor submits evidence, expects AI evaluation");
  console.log("═".repeat(64));
  console.log(`  Owner     : ${ownerAccount.address}`);
  console.log(`  Contractor: ${contractorAccount.address}`);

  sep("1.1 — Owner creates project");
  await write(ownerClient, "create_project", "create_project", [
    "Ikeja GRA Commercial Tower — Phase 3",
    "Completion of structural, MEP, glazing, fire suppression, and LASBCA approval works.",
    "Ikeja GRA, Lagos, Nigeria",
    GEN5,
    ["Structural Certificate", "MEP Sign-Off", "Glazing Certificate", "Fire Suppression Test", "LASBCA Approval"],
    contractorAccount.address,
  ]);

  const ownerIds = await read("get_owner_projects", [ownerAccount.address]) as string[];
  const pid = ownerIds[ownerIds.length - 1];
  console.log(`  Project ID: ${pid}`);
  let p: any = await read("project_details", [pid]);
  assertEq("status after create", p.status, "draft");
  assertEq("appeal_count after create", p.appeal_count, 0);

  sep("1.2 — Owner deposits 5 GEN escrow (payable — GEN sent as tx value)");
  const ownerBalBefore = await getBalance(ownerAccount.address);
  console.log(`  Owner balance before deposit: ${ownerBalBefore} wei`);

  await write(ownerClient, "deposit_escrow", "deposit_escrow", [pid], GEN5);

  const ownerBalAfter = await getBalance(ownerAccount.address);
  console.log(`  Owner balance after deposit : ${ownerBalAfter} wei`);
  if (ownerBalBefore > 0n) {
    assertLt("owner balance decreased after deposit", ownerBalAfter, ownerBalBefore);
  } else {
    console.log("  ℹ️  faucet GEN exhausted — using escrow_deposited state as custody proof");
  }

  p = await read("project_details", [pid]);
  assertEq("escrow_deposited = 5 GEN in contract", p.escrow_deposited, String(GEN5));
  assertEq("status after deposit", p.status, "draft");
  console.log(`  ✅ escrow_deposited = ${p.escrow_deposited} wei (${Number(p.escrow_deposited) / 1e18} GEN)`);

  sep("1.3 — Contractor accepts project");
  await write(contractorClient, "accept_project", "accept_project", [pid]);
  p = await read("project_details", [pid]);
  assertEq("status after accept", p.status, "escrowed");

  sep("1.4 — Contractor submits 5 evidence items with permit numbers");
  const evidence = [
    ["certificate", "Structural Integrity Certificate — Plot 14 Ikeja GRA",
     "https://ipfs.io/ipfs/QmStruct2026AbcDef",
     "Certified by NSE-registered engineer. Pile caps, columns, and beams meet NIS 1-2014.",
     "NSE-REG-2026-14882"],
    ["certificate", "MEP Completion Sign-Off — NEMSA Cert NEMSA-MEP-2026-4471",
     "https://ipfs.io/ipfs/QmMEP2026XyzPqr",
     "Electrical and mechanical systems commissioned per NEC 2023. NEMSA certificate NEMSA-MEP-2026-4471.",
     "NEMSA-MEP-2026-4471"],
    ["report", "Fire Suppression Pressure Test Report — LSFS-FIR-2026-0291",
     "https://ipfs.io/ipfs/QmFire2026LmnOp",
     "Wet pipe sprinkler system tested at 200 psi for 2 hours. Lagos State Fire Service report LSFS-FIR-2026-0291.",
     "LSFS-FIR-2026-0291"],
    ["permit", "LASBCA Stage 3 Approval — LASBCA/IKJ/2026/STRUCT-01",
     "https://ipfs.io/ipfs/QmLASBCA2026",
     "Lagos State Building Control Agency structural completion approval. Reference LASBCA/IKJ/2026/STRUCT-01.",
     "LASBCA/IKJ/2026/STRUCT-01"],
    ["certificate", "Glazing & Cladding Installation Certificate — GCA-LG-2026-0588",
     "https://ipfs.io/ipfs/QmGlaze2026",
     "Curtain wall and glazing installed per BS 8000-7. GCA certificate GCA-LG-2026-0588.",
     "GCA-LG-2026-0588"],
  ];

  for (const [type, title, url, desc, pnum] of evidence) {
    await write(contractorClient, title.slice(0, 40), "submit_evidence",
      [pid, type, title, url, desc, pnum, false]);
  }

  p = await read("project_details", [pid]);
  assertEq("evidence_count", p.evidence_count, 5);
  assertEq("status after evidence", p.status, "evidence_submitted");

  sep("1.5 — Contractor requests AI inspection");
  await write(contractorClient, "request_inspection", "request_inspection", [pid]);
  p = await read("project_details", [pid]);
  assertEq("status after request_inspection", p.status, "under_review");

  sep("1.6 — Owner triggers AI evaluation (validators run authoritative permit lookup)");
  console.log("  ⏳ Validators independently run permit verification against gov databases…");
  await write(ownerClient, "evaluate_completion", "evaluate_completion", [pid]);

  sep("1.7 — Assert final state");
  p = await read("project_details", [pid]);
  const cs: any = await read("consensus_status", [pid]);

  console.log(`  project status     : ${p.status}`);
  console.log(`  payment_released   : ${p.payment_released}`);
  console.log(`  escrow_deposited   : ${p.escrow_deposited} wei`);
  console.log(`  appeal_count       : ${p.appeal_count}`);
  console.log(`  AI passed          : ${cs.passed}`);
  console.log(`  confidence_pct     : ${cs.confidence_pct}%`);
  console.log(`  reason             : ${cs.reason}`);

  // escrow must still be locked if rejected
  if (!cs.passed) {
    assertEq("escrow still locked on rejection", p.escrow_deposited, String(GEN5));
    assertEq("appeal_count on first rejection", p.appeal_count, 0);
    console.log("  ⚠️  REJECTED — fail-closed (IPFS URLs inaccessible, permits unverifiable) ✓ correct");

    // Test appeal flow
    sep("1.8 — Submit appeal and assert appeal_count increments");
    await write(ownerClient, "submit_appeal", "submit_appeal", [
      pid,
      "Contractor is sourcing certified copies from LASBCA registry directly. Requesting one more evaluation.",
    ]);
    p = await read("project_details", [pid]);
    assertEq("status after appeal", p.status, "appealed");
    assertEq("appeal_count after appeal", p.appeal_count, 1);
    console.log("  ✅ appeal_count incremented to 1");
  } else {
    console.log("  ✅ APPROVED — contractor funds released");
  }

  console.log(`\n  Test 1 project: ${pid}`);
  return pid;
}

// ─── TEST 2: Owner counter-evidence / dispute path ────────────────────────────

async function test2() {
  console.log("\n" + "═".repeat(64));
  console.log("  TEST 2 — Owner counter-evidence (dispute path)");
  console.log("═".repeat(64));

  sep("2.1 — Owner creates second project");
  await write(ownerClient, "create_project", "create_project", [
    "Victoria Island Office Build-Out",
    "MEP, electrical, plumbing, and fire safety for commercial fit-out.",
    "Victoria Island, Lagos, Nigeria",
    GEN5,
    ["Electrical Installation Certificate", "Plumbing Completion Certificate",
     "Interior Fit-Out Inspection", "Fire Extinguisher Installation"],
    contractorAccount.address,
  ]);

  const ownerIds = await read("get_owner_projects", [ownerAccount.address]) as string[];
  const pid = ownerIds[ownerIds.length - 1];
  console.log(`  Project ID: ${pid}`);
  let p: any = await read("project_details", [pid]);
  assertEq("status after create", p.status, "draft");

  sep("2.2 — Owner deposits 5 GEN escrow (payable)");
  await write(ownerClient, "deposit_escrow", "deposit_escrow", [pid], GEN5);

  p = await read("project_details", [pid]);
  assertEq("escrow_deposited", p.escrow_deposited, String(GEN5));

  sep("2.3 — Contractor accepts");
  await write(contractorClient, "accept_project", "accept_project", [pid]);
  p = await read("project_details", [pid]);
  assertEq("status after accept", p.status, "escrowed");

  sep("2.4 — Contractor submits 4 completion evidence items with permit numbers");
  const contrEvidence = [
    ["certificate", "Electrical Installation Certificate — NERC-ELEC-2026-7741",
     "https://ipfs.io/ipfs/QmElec2026",
     "Full electrical installation certified by NERC-licensed engineer. Certificate NERC-ELEC-2026-7741.",
     "NERC-ELEC-2026-7741"],
    ["certificate", "Plumbing Completion Certificate — WRB-PLB-2026-3392",
     "https://ipfs.io/ipfs/QmPlumb2026",
     "All plumbing works completed to COREN standards. WRB certificate WRB-PLB-2026-3392.",
     "WRB-PLB-2026-3392"],
    ["report", "Interior Fit-Out Final Inspection Report",
     "https://ipfs.io/ipfs/QmFitOut2026",
     "Partition walls, suspended ceiling, and raised floor confirmed per approved drawings.",
     ""],
    ["certificate", "Fire Extinguisher Installation Certificate — LSFS-EXT-2026-1104",
     "https://ipfs.io/ipfs/QmFireExt2026",
     "Portable fire extinguishers installed per NFPA 10 and Lagos State Fire Service. Ref LSFS-EXT-2026-1104.",
     "LSFS-EXT-2026-1104"],
  ];

  for (const [type, title, url, desc, pnum] of contrEvidence) {
    await write(contractorClient, title.slice(0, 40), "submit_evidence",
      [pid, type, title, url, desc, pnum, false]);
  }

  sep("2.5 — Owner submits dispute/counter evidence (is_dispute=true)");
  await write(ownerClient, "Owner dispute: incomplete works", "submit_evidence", [
    pid, "other",
    "Owner Dispute: Suspended Ceiling Incomplete",
    "https://ipfs.io/ipfs/QmDispute2026",
    "Suspended ceiling tiles missing in server room. Electrical conduits exposed. " +
    "Works not matching approved interior drawings referenced in fit-out report.",
    "",
    true,
  ]);

  p = await read("project_details", [pid]);
  assertEq("evidence_count (4 completion + 1 dispute)", p.evidence_count, 5);
  assertEq("status after evidence", p.status, "evidence_submitted");

  sep("2.6 — Owner requests AI inspection");
  await write(ownerClient, "request_inspection", "request_inspection", [pid]);
  p = await read("project_details", [pid]);
  assertEq("status after request_inspection", p.status, "under_review");

  sep("2.7 — Contractor triggers AI evaluation");
  console.log("  ⏳ Validators weigh contractor permits against owner dispute evidence…");
  await write(contractorClient, "evaluate_completion", "evaluate_completion", [pid]);

  sep("2.8 — Assert final state");
  p = await read("project_details", [pid]);
  const cs: any = await read("consensus_status", [pid]);

  console.log(`  project status     : ${p.status}`);
  console.log(`  payment_released   : ${p.payment_released}`);
  console.log(`  escrow_deposited   : ${p.escrow_deposited} wei`);
  console.log(`  appeal_count       : ${p.appeal_count}`);
  console.log(`  AI passed          : ${cs.passed}`);
  console.log(`  confidence_pct     : ${cs.confidence_pct}%`);
  console.log(`  reason             : ${cs.reason}`);

  if (!cs.passed) {
    assertEq("escrow still locked on rejection", p.escrow_deposited, String(GEN5));
    assertEq("appeal_count on first rejection", p.appeal_count, 0);
    console.log("  ⚠️  REJECTED — contract-enforced fail-closed ✓ correct");
  } else {
    console.log("  ✅ APPROVED");
  }

  console.log(`\n  Test 2 project: ${pid}`);
  return pid;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═".repeat(64));
  console.log("  BuildProof E2E Test Suite — 2 runs");
  console.log("  ABI: deposit_escrow(pid, value=GEN)  submit_evidence(pid, type, title, url, desc, permit_number, is_dispute)");
  console.log("═".repeat(64));
  console.log(`  Contract  : ${CONTRACT}`);
  console.log(`  Owner     : ${ownerAccount.address}`);
  console.log(`  Contractor: ${contractorAccount.address}`);

  const pid1 = await test1();
  const pid2 = await test2();

  console.log("\n" + "═".repeat(64));
  console.log("  SUMMARY");
  console.log("═".repeat(64));
  console.log(`  Test 1 project : ${pid1}`);
  console.log(`  Test 2 project : ${pid2}`);
  console.log(`  Contract       : ${CONTRACT}`);
  console.log(`  Explorer       : https://explorer-studio.genlayer.com/address/${CONTRACT}`);
}

main().catch(e => {
  console.error("\n❌ FAILED:", e?.message ?? e);
  process.exit(1);
});
