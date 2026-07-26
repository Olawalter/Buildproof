/**
 * End-to-end test against the deployed BuildProof contract.
 *
 * Usage:
 *   OWNER_PK=0x... CONTRACTOR_PK=0x... npx tsx e2e_test.ts
 *
 * Tests the full flow:
 *   1. Owner creates project (assigns contractor)
 *   2. Owner deposits escrow
 *   3. Contractor accepts project
 *   4. Contractor submits 4x evidence
 *   5. Owner submits 1x dispute/counter evidence
 *   6. Contractor requests inspection
 *   7. Owner triggers AI evaluation
 *   8. Reads final decision + auto-transfer status
 */
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";
import { TransactionStatus } from "genlayer-js/types";

// ─── Config ───────────────────────────────────────────────────────────────────

const CONTRACT  = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "") as `0x${string}`;
const RPC_URL   = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL ?? "https://studio.genlayer.com/api";
const OWNER_PK  = process.env.OWNER_PK as `0x${string}`;
const CONTR_PK  = process.env.CONTRACTOR_PK as `0x${string}`;

if (!CONTRACT)             { console.error("❌ NEXT_PUBLIC_CONTRACT_ADDRESS not set"); process.exit(1); }
if (!OWNER_PK?.startsWith("0x"))  { console.error("❌ OWNER_PK env var required");  process.exit(1); }
if (!CONTR_PK?.startsWith("0x")) { console.error("❌ CONTRACTOR_PK env var required"); process.exit(1); }

const ownerAccount      = privateKeyToAccount(OWNER_PK);
const contractorAccount = privateKeyToAccount(CONTR_PK);
const ownerClient       = createClient({ chain: studionet, account: ownerAccount,      endpoint: RPC_URL } as any);
const contractorClient  = createClient({ chain: studionet, account: contractorAccount, endpoint: RPC_URL } as any);
const readClient        = createClient({ chain: studionet, endpoint: RPC_URL } as any);

console.log("═".repeat(60));
console.log("  BuildProof E2E Test — New Contract");
console.log("═".repeat(60));
console.log("  Contract  :", CONTRACT);
console.log("  Owner     :", ownerAccount.address);
console.log("  Contractor:", contractorAccount.address);
console.log("═".repeat(60));

type Hash = `0x${string}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function finalize(client: any, hash: Hash, label: string) {
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
  const hash: Hash = await client.writeContract({ address: CONTRACT, functionName: fn, args, value: 0n });
  process.stdout.write(`tx ${hash.slice(0, 10)}… `);
  await finalize(client, hash, label);
  console.log("✓");
  return hash;
}

async function read(fn: string, args: any[] = []) {
  return readClient.readContract({ address: CONTRACT, functionName: fn, args });
}

function sep(title: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

// ─── Test ─────────────────────────────────────────────────────────────────────

async function main() {
  // ── STEP 1: Create project ─────────────────────────────────────────────────
  sep("STEP 1 — Owner creates project & assigns contractor");
  await write(ownerClient, "create_project", "create_project", [
    "Lagos Marina Tower — Phase 3",
    "Construction of floors 18–24 including structural concrete, MEP rough-in, " +
    "curtain wall glazing, and fire suppression system installation. " +
    "Completion required per Lagos State Building Control Agency standards.",
    "1 Marina Drive, Victoria Island, Lagos, Nigeria",
    BigInt("5000000000000000000"),   // 5 GEN
    [
      "Structural Concrete Pour Certificate (Floors 18–24)",
      "MEP Rough-In Sign-Off (Electrical, Mechanical, Plumbing)",
      "Curtain Wall Glazing Completion Certificate",
      "Fire Suppression System Pressure Test Certificate",
      "Lagos State Building Control Agency Approval",
    ],
    contractorAccount.address,
  ]);

  const ownerIds = await read("get_owner_projects", [ownerAccount.address]) as string[];
  const pid = ownerIds[ownerIds.length - 1];
  console.log("  Project ID:", pid);

  // ── STEP 2: Owner deposits escrow ─────────────────────────────────────────
  sep("STEP 2 — Owner deposits 5 GEN escrow");
  await write(ownerClient, "deposit_escrow", "deposit_escrow", [
    pid, BigInt("5000000000000000000"),
  ]);

  let p: any = await read("project_details", [pid]);
  console.log("  status          :", p.status);
  console.log("  escrow_deposited:", p.escrow_deposited, "wei");

  // ── STEP 3: Contractor accepts ────────────────────────────────────────────
  sep("STEP 3 — Contractor accepts project");
  await write(contractorClient, "accept_project", "accept_project", [pid]);

  p = await read("project_details", [pid]);
  console.log("  status:", p.status);   // expected: escrowed

  // ── STEP 4: Contractor submits 4x completion evidence ─────────────────────
  sep("STEP 4 — Contractor submits completion evidence");

  const evidence = [
    {
      type: "certificate",
      title: "Structural Concrete Pour Certificate — Floors 18–24",
      url: "https://ipfs.io/ipfs/QmBuildProofConcreteCert2026Lagos001",
      desc: "LASBCA-certified structural engineer confirms concrete pour for floors 18–24 meets NIS 444-1 standard. " +
            "Engineer: Engr. Chukwuemeka Obi MNSE, Reg #NSE-14882. Zero deficiencies. Cube test results attached.",
    },
    {
      type: "permit",
      title: "MEP Rough-In Sign-Off — Lagos BCON Permit #LG-MEP-2026-4471",
      url: "https://ipfs.io/ipfs/QmBuildProofMEPSignoff2026Lagos002",
      desc: "Lagos Building Control Authority sign-off for mechanical, electrical, and plumbing rough-in on floors 18–24. " +
            "Permit #LG-MEP-2026-4471. Inspector: Arch. Adaeze Nwosu. All conduit, ductwork, and plumbing stacks approved.",
    },
    {
      type: "certificate",
      title: "Curtain Wall Glazing Completion Certificate",
      url: "https://ipfs.io/ipfs/QmBuildProofGlazingCert2026Lagos003",
      desc: "Saint-Gobain Performance Glazing completion certificate. All 847 panels installed on floors 18–24 per approved " +
            "shop drawings. Water infiltration test passed ASTM E1105. Issued by: Glazeworks Nigeria Ltd, 2026-07-25.",
    },
    {
      type: "certificate",
      title: "Fire Suppression System Pressure Test Certificate",
      url: "https://ipfs.io/ipfs/QmBuildProofFireSuppressionTest2026Lagos004",
      desc: "Victaulic wet-pipe sprinkler system pressure test certificate for floors 18–24. Test pressure 200 psi for " +
            "2 hours — zero pressure drop. Certified by: Federal Fire Service Lagos, Inspector #FFS-LG-2288. Date: 2026-07-24.",
    },
  ];

  for (const ev of evidence) {
    await write(contractorClient, `evidence: ${ev.title.slice(0, 40)}`, "submit_evidence", [
      pid, ev.type, ev.title, ev.url, ev.desc, false,
    ]);
  }

  // ── STEP 5: Owner submits supporting evidence ──────────────────────────────
  sep("STEP 5 — Owner submits LASBCA government approval (supporting)");
  await write(ownerClient, "LASBCA approval letter", "submit_evidence", [
    pid,
    "permit",
    "Lagos State Building Control Agency Final Approval — Floors 18–24",
    "https://ipfs.io/ipfs/QmBuildProofLASBCAApproval2026Lagos005",
    "LASBCA final approval letter for floors 18–24 construction activities. " +
    "Reference: LASBCA/VI/2026/0847. Signed by: Director of Building Control, Lagos State. " +
    "All five required inspection items satisfied per site verification on 2026-07-25.",
    false,  // supporting evidence, not dispute
  ]);

  const m: any = await read("milestone_status", [pid]);
  console.log("  Total evidence submitted:", m.evidence.length);

  // ── STEP 6: Contractor requests inspection ────────────────────────────────
  sep("STEP 6 — Contractor requests AI inspection");
  await write(contractorClient, "request_inspection", "request_inspection", [pid]);

  p = await read("project_details", [pid]);
  console.log("  status:", p.status);   // expected: under_review

  // ── STEP 7: Owner triggers AI evaluation ──────────────────────────────────
  sep("STEP 7 — Owner triggers AI evaluation (GenLayer validators)");
  console.log("  ⏳ Running LLM consensus across validators… (2–5 min)");
  await write(ownerClient, "evaluate_completion", "evaluate_completion", [pid]);

  // ── STEP 8: Final state ───────────────────────────────────────────────────
  sep("STEP 8 — Final decision & auto-transfer status");
  p = await read("project_details", [pid]);
  const cs: any = await read("consensus_status", [pid]);

  console.log("  project status    :", p.status);
  console.log("  payment_released  :", p.payment_released);
  console.log("  escrow_deposited  :", p.escrow_deposited, "wei");
  console.log("");
  console.log("  AI Decision:");
  console.log("    passed          :", cs.passed);
  console.log("    confidence_pct  :", cs.confidence_pct, "%");
  console.log("    critical_defects:", cs.critical_defects);
  console.log("    occupancy_verified:", cs.occupancy_verified);
  console.log("    reason          :", cs.reason);

  sep("RESULT");
  if (p.status === "finalized" && p.payment_released) {
    if (cs.passed) {
      console.log("  ✅ APPROVED — 5 GEN auto-transferred to contractor via gl.transfer()");
      console.log("  ✅ Contract finalized. Full e2e flow complete.");
    } else {
      console.log("  ✅ REJECTED — 5 GEN auto-returned to owner via gl.transfer()");
      console.log("  ✅ Contract finalized. Full e2e flow complete.");
    }
  } else if (p.status === "rejected") {
    console.log("  ⚠️  REJECTED — appeals still available (", MAX_APPEALS - cs.appeal_count, "remaining)");
    console.log("  Project ID:", pid, "— use submit_appeal to contest.");
  } else {
    console.log("  ℹ️  Status:", p.status, "— project may need further action.");
  }

  console.log("\n  Contract :", CONTRACT);
  console.log("  Project  :", pid);
}

const MAX_APPEALS = 3;

main().catch(e => {
  console.error("\n❌ E2E FAILED:", e?.message ?? e);
  process.exit(1);
});
