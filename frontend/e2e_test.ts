/**
 * BuildProof — End-to-End Test (2 full runs)
 *
 * Usage:
 *   $env:OWNER_PK="0x..."; $env:CONTRACTOR_PK="0x..."; $env:NEXT_PUBLIC_CONTRACT_ADDRESS="0x..."; npx tsx e2e_test.ts
 *
 * Run 1: Contractor submits 5 strong evidence items → expects APPROVED
 * Run 2: Owner creates second project, deposits, contractor accepts but submits
 *        thin evidence → expects REJECTED or low-confidence
 */
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";
import { TransactionStatus } from "genlayer-js/types";

// ─── Config ───────────────────────────────────────────────────────────────────

const CONTRACT = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "") as `0x${string}`;
const RPC_URL  = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL ?? "https://studio.genlayer.com/api";
const OWNER_PK = process.env.OWNER_PK as `0x${string}`;
const CONTR_PK = process.env.CONTRACTOR_PK as `0x${string}`;

if (!CONTRACT)                     { console.error("❌ NEXT_PUBLIC_CONTRACT_ADDRESS not set"); process.exit(1); }
if (!OWNER_PK?.startsWith("0x"))   { console.error("❌ OWNER_PK required");                   process.exit(1); }
if (!CONTR_PK?.startsWith("0x"))   { console.error("❌ CONTRACTOR_PK required");               process.exit(1); }

const ownerAccount      = privateKeyToAccount(OWNER_PK);
const contractorAccount = privateKeyToAccount(CONTR_PK);

function makeClient(account?: any) {
  return createClient({ chain: studionet, ...(account ? { account } : {}), endpoint: RPC_URL } as any);
}

const ownerClient      = makeClient(ownerAccount);
const contractorClient = makeClient(contractorAccount);
const readClient       = makeClient();

type Hash = `0x${string}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function header(title: string) {
  console.log(`\n${"═".repeat(64)}`);
  console.log(`  ${title}`);
  console.log("═".repeat(64));
}

const GEN5 = BigInt("5000000000000000000");   // 5 GEN in wei

// ─── Test 1: Strong evidence → APPROVED ──────────────────────────────────────

async function runTest1(): Promise<string> {
  header("TEST 1 — Strong evidence (expect APPROVED)");
  console.log(`  Owner     : ${ownerAccount.address}`);
  console.log(`  Contractor: ${contractorAccount.address}`);

  sep("1.1 — Owner creates project");
  await write(ownerClient, "create_project", "create_project", [
    "Ikeja GRA Office Complex — Phase 2",
    "Structural completion, MEP installation, curtain wall glazing, fire suppression, " +
    "and LASBCA regulatory approval for 4-storey commercial office block at Plot 14, " +
    "Mobolaji Bank Anthony Way, Ikeja GRA, Lagos.",
    "Plot 14, Mobolaji Bank Anthony Way, Ikeja GRA, Lagos, Nigeria",
    GEN5,
    [
      "Structural Integrity Certificate",
      "MEP Completion Sign-Off",
      "Fire Suppression Test Report",
      "LASBCA Stage Approval",
      "Glazing & Cladding Certificate",
    ],
    contractorAccount.address,
  ]);

  const ownerIds = await read("get_owner_projects", [ownerAccount.address]) as string[];
  const pid = ownerIds[ownerIds.length - 1];
  console.log(`  Project ID: ${pid}`);

  sep("1.2 — Owner deposits 5 GEN escrow (payable)");
  // GEN is sent as tx value — no amount arg, gl.message.value is authoritative
  await write(ownerClient, "deposit_escrow", "deposit_escrow", [pid], GEN5);

  let p: any = await read("project_details", [pid]);
  console.log(`  escrow_deposited: ${p.escrow_deposited} wei  status: ${p.status}`);

  sep("1.3 — Contractor accepts project");
  await write(contractorClient, "accept_project", "accept_project", [pid]);
  p = await read("project_details", [pid]);
  console.log(`  status: ${p.status}`);   // expected: escrowed

  sep("1.4 — Contractor submits 5 evidence items");
  const items = [
    {
      type: "certificate",
      title: "Structural Integrity Certificate — Plot 14 Ikeja GRA",
      url: "https://ipfs.io/ipfs/QmBPTest1StructuralCert2026Lagos",
      desc: "Certified structural completion report issued by Structo Engineering Ltd. " +
            "Reference: LASG-STRUCT-2026-1142. All load-bearing elements verified per BS 8110. " +
            "Engineer: Engr. Chukwuemeka Obi MNSE, Reg #NSE-14882.",
    },
    {
      type: "permit",
      title: "MEP Completion Sign-Off — NEMSA Cert NEMSA-MEP-LAG-2026-4471",
      url: "https://ipfs.io/ipfs/QmBPTest1MEPSignoff2026Lagos",
      desc: "Mechanical, electrical, and plumbing systems commissioned and signed off by " +
            "NEMSA-certified engineer. Certificate Ref: NEMSA-MEP-LAG-2026-4471. All systems " +
            "tested to Nigerian Electrical Safety Standards.",
    },
    {
      type: "report",
      title: "Fire Suppression Pressure Test Report — LSFS-FST-IKJ-2026-0217",
      url: "https://ipfs.io/ipfs/QmBPTest1FireSuppression2026Lagos",
      desc: "Lagos State Fire Service inspection and approval of sprinkler and suppression systems. " +
            "Approval Ref: LSFS-FST-IKJ-2026-0217. System tested at 200 psi for 2 hours — zero " +
            "pressure drop. Compliant with NFPA 13.",
    },
    {
      type: "permit",
      title: "LASBCA Stage 3 Approval — LASBCA/IKJ/2026/STG3/1104",
      url: "https://ipfs.io/ipfs/QmBPTest1LASBCAApproval2026Lagos",
      desc: "Lagos State Building Control Agency Stage 3 completion approval. " +
            "Permit Ref: LASBCA/IKJ/2026/STG3/1104. Covers structural frame, roofing, " +
            "and external envelope. Signed by Director of Building Control.",
    },
    {
      type: "certificate",
      title: "Glazing & Cladding Installation Certificate",
      url: "https://ipfs.io/ipfs/QmBPTest1GlazingCert2026Lagos",
      desc: "Glazing system installation certified by approved inspector per Lagos State Building " +
            "Code 2021. All curtain wall and cladding panels comply with wind-load and water " +
            "infiltration specs. Ref: LASG-GLAZE-2026-3301.",
    },
  ];

  for (const ev of items) {
    await write(contractorClient, ev.title.slice(0, 44), "submit_evidence",
      [pid, ev.type, ev.title, ev.url, ev.desc, false]);
  }

  const m: any = await read("milestone_status", [pid]);
  console.log(`  Evidence on-chain: ${m.evidence.length}`);

  sep("1.5 — Contractor requests AI inspection");
  await write(contractorClient, "request_inspection", "request_inspection", [pid]);

  sep("1.6 — Owner triggers AI evaluation (2–8 min)");
  console.log("  ⏳ Validators independently run LLM + web search across 20 validators…");
  await write(ownerClient, "evaluate_completion", "evaluate_completion", [pid]);

  sep("1.7 — Final state");
  p = await read("project_details", [pid]);
  const cs: any = await read("consensus_status", [pid]);
  printResult(p, cs);

  return pid;
}

// ─── Test 2: Dispute evidence submitted by owner → tests counter-evidence path ─

async function runTest2(): Promise<string> {
  header("TEST 2 — Owner counter-evidence flow (dispute path)");

  sep("2.1 — Owner creates second project");
  await write(ownerClient, "create_project", "create_project", [
    "Victoria Island Retail Strip — Unit B Fit-Out",
    "Interior fit-out and MEP works for ground-floor retail unit B at 22 Adeola Odeku Street, " +
    "Victoria Island, Lagos. Contractor to deliver completed space per approved fit-out drawings.",
    "22 Adeola Odeku Street, Victoria Island, Lagos, Nigeria",
    GEN5,
    [
      "Electrical Installation Certificate",
      "Plumbing Completion Certificate",
      "Interior Fit-Out Inspection",
      "Fire Extinguisher Installation",
    ],
    contractorAccount.address,
  ]);

  const ownerIds = await read("get_owner_projects", [ownerAccount.address]) as string[];
  const pid = ownerIds[ownerIds.length - 1];
  console.log(`  Project ID: ${pid}`);

  sep("2.2 — Owner deposits 5 GEN escrow (payable)");
  await write(ownerClient, "deposit_escrow", "deposit_escrow", [pid], GEN5);

  sep("2.3 — Contractor accepts project");
  await write(contractorClient, "accept_project", "accept_project", [pid]);
  const p0: any = await read("project_details", [pid]);
  console.log(`  status: ${p0.status}`);

  sep("2.4 — Contractor submits completion evidence");
  const contrEvidence = [
    {
      type: "certificate",
      title: "Electrical Installation Certificate — NERC-ELEC-LAG-2026-8812",
      url: "https://ipfs.io/ipfs/QmBPTest2ElectricalCert2026Lagos",
      desc: "Electrical installation certified by NERC-registered engineer. " +
            "Certificate Ref: NERC-ELEC-LAG-2026-8812. All circuits tested and approved.",
    },
    {
      type: "certificate",
      title: "Plumbing Completion Certificate",
      url: "https://ipfs.io/ipfs/QmBPTest2PlumbingCert2026Lagos",
      desc: "Plumbing installation completed and pressure-tested. All fixtures installed per " +
            "Lagos State plumbing code. Certified by licensed plumber Reg #COREN-P-4421.",
    },
    {
      type: "report",
      title: "Interior Fit-Out Final Inspection Report",
      url: "https://ipfs.io/ipfs/QmBPTest2FitOutInspection2026Lagos",
      desc: "Third-party fit-out inspection report confirms all interior finishes, partitioning, " +
            "ceiling works, and floor finishes completed per approved drawings. Date: 2026-07-27.",
    },
    {
      type: "certificate",
      title: "Fire Extinguisher Installation Certificate",
      url: "https://ipfs.io/ipfs/QmBPTest2FireExt2026Lagos",
      desc: "Fire extinguisher placement and installation certified by Lagos State Fire Service. " +
            "Ref: LSFS-EXT-VI-2026-0099. 4x 6kg ABC extinguishers installed per BS EN 3.",
    },
  ];

  for (const ev of contrEvidence) {
    await write(contractorClient, ev.title.slice(0, 44), "submit_evidence",
      [pid, ev.type, ev.title, ev.url, ev.desc, false]);
  }

  sep("2.5 — Owner submits counter/dispute evidence (is_dispute=true)");
  await write(ownerClient, "Owner dispute: incomplete works", "submit_evidence", [
    pid,
    "report",
    "Owner Site Inspection — Incomplete Finishes Documented",
    "https://ipfs.io/ipfs/QmBPTest2OwnerDispute2026Lagos",
    "Owner inspection on 2026-07-27 found incomplete plastering on north wall, " +
    "missing skirting tiles in 40% of floor area, and one plumbing fixture not yet " +
    "installed. Photographic evidence attached. Owner disputes contractor's completion claim.",
    true,  // is_dispute=true — owner counter-evidence
  ]);

  const m: any = await read("milestone_status", [pid]);
  console.log(`  Evidence on-chain: ${m.evidence.length} (${m.evidence.filter((e: any) => !e.is_dispute).length} completion + ${m.evidence.filter((e: any) => e.is_dispute).length} dispute)`);

  sep("2.6 — Owner requests AI inspection");
  await write(ownerClient, "request_inspection", "request_inspection", [pid]);

  sep("2.7 — Contractor triggers AI evaluation (2–8 min)");
  console.log("  ⏳ Validators weigh contractor evidence against owner dispute evidence…");
  await write(contractorClient, "evaluate_completion", "evaluate_completion", [pid]);

  sep("2.8 — Final state");
  let p: any = await read("project_details", [pid]);
  const cs: any = await read("consensus_status", [pid]);
  printResult(p, cs);

  return pid;
}

// ─── Print helpers ────────────────────────────────────────────────────────────

function printResult(p: any, cs: any) {
  console.log(`  project status     : ${p.status}`);
  console.log(`  payment_released   : ${p.payment_released}`);
  console.log(`  escrow_deposited   : ${p.escrow_deposited} wei`);
  if (cs?.has_decision) {
    console.log(`  AI passed          : ${cs.passed}`);
    console.log(`  confidence_pct     : ${cs.confidence_pct}%`);
    console.log(`  critical_defects   : ${cs.critical_defects}`);
    console.log(`  occupancy_verified : ${cs.occupancy_verified}`);
    console.log(`  reason             : ${cs.reason}`);
  }
  const outcome =
    p.status === "finalized" && p.payment_released && cs?.passed  ? "✅ APPROVED — GEN transferred to contractor" :
    p.status === "finalized" && p.payment_released && !cs?.passed ? "✅ REJECTED (max appeals) — GEN returned to owner" :
    p.status === "rejected"                                        ? "⚠️  REJECTED — appeal rounds still available" :
    `ℹ️  Status: ${p.status}`;
  console.log(`\n  ${outcome}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═".repeat(64));
  console.log("  BuildProof E2E Test Suite — 2 runs");
  console.log("═".repeat(64));
  console.log(`  Contract  : ${CONTRACT}`);
  console.log(`  Owner     : ${ownerAccount.address}`);
  console.log(`  Contractor: ${contractorAccount.address}`);

  const pid1 = await runTest1();
  const pid2 = await runTest2();

  header("SUMMARY");
  console.log(`  Test 1 project: ${pid1}`);
  console.log(`  Test 2 project: ${pid2}`);
  console.log(`  Contract: ${CONTRACT}`);
  console.log(`  Explorer: https://explorer-studio.genlayer.com/address/${CONTRACT}`);
}

main().catch(e => {
  console.error("\n❌ E2E FAILED:", e?.message ?? e);
  process.exit(1);
});
