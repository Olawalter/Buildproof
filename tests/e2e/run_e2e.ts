/**
 * BuildProof E2E Test — Real StudioNet calls
 *
 * Scenario: Riverside Townhomes Phase 2 — Framing & Rough-In
 *   Owner  (PK 1): Commission the project, deposit escrow, optionally dispute
 *   Contractor (PK 2): Accept, submit real evidence, request inspection
 *   GenLayer AI validators: evaluate_completion → consensus → payment released
 *
 * Run:
 *   npx tsx tests/e2e/run_e2e.ts
 */

import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";
import { TransactionStatus } from "genlayer-js/types";

// ─── Config ───────────────────────────────────────────────────────────────────

const CONTRACT = "0x14c597951C17b6A0949C0A1A6f1ABf71b468BD21" as const;
const STUDIO_URL = "https://studio.genlayer.com/api";

const OWNER_PK      = "0x561d7e3dec45ea187356132646c3b3970267b4d2f09e4c51bc8b3b691918eef6" as const;
const CONTRACTOR_PK = "0xc7e1e465254b42ae0be4c0ef570f50bb01d6b50a23add01cd068c7ed6465dc33" as const;

// ─── Clients ──────────────────────────────────────────────────────────────────

const ownerAccount      = privateKeyToAccount(OWNER_PK);
const contractorAccount = privateKeyToAccount(CONTRACTOR_PK);

const ownerClient = createClient({
  chain: studionet,
  account: ownerAccount,
  endpoint: STUDIO_URL,
} as any);

const contractorClient = createClient({
  chain: studionet,
  account: contractorAccount,
  endpoint: STUDIO_URL,
} as any);

const readClient = createClient({
  chain: studionet,
  endpoint: STUDIO_URL,
} as any);

console.log("Owner address     :", ownerAccount.address);
console.log("Contractor address:", contractorAccount.address);

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Hash = `0x${string}`;

async function wait(client: any, hash: Hash, label: string) {
  console.log(`  ↳ tx submitted  [${label}]:`, hash);
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
    interval: 5_000,
    retries: 80,
  });
  const status = receipt.statusName ?? receipt.status;
  console.log(`  ✓ finalized     [${label}]: status=${status}`);
  return receipt;
}

async function write(client: any, label: string, args: {
  functionName: string;
  args: any[];
  value?: bigint;
}) {
  const hash: Hash = await client.writeContract({
    address: CONTRACT,
    functionName: args.functionName,
    args: args.args,
    value: args.value ?? 0n,
  });
  return wait(client, hash, label);
}

async function read(functionName: string, args: any[] = []) {
  return readClient.readContract({
    address: CONTRACT,
    functionName,
    args,
  });
}

function separator(title: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

// ─── E2E Flow ─────────────────────────────────────────────────────────────────

async function main() {
  separator("STEP 1 — Owner creates project");

  const createReceipt = await write(ownerClient, "create_project", {
    functionName: "create_project",
    args: [
      // title
      "Riverside Townhomes Phase 2 — Framing & Rough-In",
      // description
      "Complete structural framing, exterior sheathing, roof decking, and all rough-in " +
      "MEP (mechanical, electrical, plumbing) for 8-unit townhome block at Riverside " +
      "Development Site B. Work must pass municipal rough-in inspection and conform to " +
      "2021 IBC and local jurisdiction amendments.",
      // location
      "142 Riverside Drive, Building B, Clearwater, FL 33756",
      // contract_value (in wei — 15 GEN)
      15_000_000_000_000_000_000n,
      // inspection_names
      [
        "Structural Framing Inspection",
        "Rough Electrical Inspection",
        "Rough Plumbing Inspection",
        "HVAC Rough-In Inspection",
        "Roof Decking & Sheathing Inspection",
      ],
    ],
  });

  // The project ID is returned as the function return value.
  // In GenLayer the return is embedded in receipt data.
  const receiptData = createReceipt as any;
  let projectId: string =
    receiptData?.data?.returnValue ??
    receiptData?.data?.return_value ??
    receiptData?.returnValue ??
    "";

  // Fall back to reading owner's project list if receipt doesn't surface the ID
  if (!projectId) {
    console.log("  Project ID not in receipt, reading owner_projects…");
    const ids = (await read("get_owner_projects", [ownerAccount.address])) as any;
    const arr: string[] = Array.isArray(ids) ? ids : [];
    projectId = arr[arr.length - 1] ?? "";
  }

  if (!projectId) {
    // Last resort: read project_counter and subtract 1
    const counter = await read("get_project_count", []) as any;
    projectId = String(Number(counter) - 1);
  }

  console.log("  Project ID:", projectId);

  // Verify it exists
  const project: any = await read("project_details", [projectId]);
  console.log("  Title     :", project?.title ?? project?.get?.("title") ?? "—");
  console.log("  Status    :", project?.status ?? project?.get?.("status") ?? "—");

  // ── STEP 2 ────────────────────────────────────────────────────────────────
  separator("STEP 2 — Contractor accepts project");

  await write(contractorClient, "accept_project", {
    functionName: "accept_project",
    args: [projectId],
  });

  // ── STEP 3 ────────────────────────────────────────────────────────────────
  separator("STEP 3 — Owner deposits escrow (15 GEN)");

  await write(ownerClient, "deposit_escrow", {
    functionName: "deposit_escrow",
    args: [projectId],
    value: 15_000_000_000_000_000_000n,   // 15 GEN in wei
  });

  // ── STEP 4 ────────────────────────────────────────────────────────────────
  separator("STEP 4 — Contractor submits completion evidence");

  const evidence = [
    {
      evidence_type: "photo",
      title: "Framing complete — south elevation",
      url: "https://buildproof-evidence.s3.amazonaws.com/riverside-b/framing-south.jpg",
      description:
        "All 2×6 stud walls erected per engineered drawings. Double top plate installed. " +
        "Corner bracing and let-in braces confirmed. Photo taken 2026-07-18.",
    },
    {
      evidence_type: "permit",
      title: "City of Clearwater Framing Permit — Approved",
      url: "https://buildproof-evidence.s3.amazonaws.com/riverside-b/framing-permit-CLW-2026-0412.pdf",
      description:
        "Permit CLW-2026-0412 approved 2026-07-17 by City of Clearwater Building Department. " +
        "Wet-stamped approval included. Inspector: J. Martinez, License #CBC-4418.",
    },
    {
      evidence_type: "certificate",
      title: "Municipal Rough Electrical Inspection Certificate",
      url: "https://buildproof-evidence.s3.amazonaws.com/riverside-b/elec-rough-cert.pdf",
      description:
        "All rough-in wiring for 200A panels, circuits, and low-voltage runs inspected " +
        "and approved by Pinellas County Electrical Inspector #7721 on 2026-07-19. " +
        "No deficiencies noted. Certificate of compliance attached.",
    },
    {
      evidence_type: "certificate",
      title: "Plumbing Rough-In Inspection — Passed",
      url: "https://buildproof-evidence.s3.amazonaws.com/riverside-b/plumbing-rough-cert.pdf",
      description:
        "Water supply lines (PEX-A, uponor), DWV stack (ABS), and pressure test " +
        "at 100 PSI for 30 minutes with zero drop. Inspected by Clearwater Plumbing " +
        "Division on 2026-07-19. Pass certificate issued.",
    },
    {
      evidence_type: "photo",
      title: "HVAC rough-in — duct runs and air handler platform",
      url: "https://buildproof-evidence.s3.amazonaws.com/riverside-b/hvac-rough.jpg",
      description:
        "All supply and return duct rough-in complete. Two 5-ton Carrier air handler " +
        "platforms installed per mechanical plans. Refrigerant line sets routed and " +
        "isolated. Pending final trim-out after drywall.",
    },
    {
      evidence_type: "report",
      title: "Third-Party Structural Engineer Field Report",
      url: "https://buildproof-evidence.s3.amazonaws.com/riverside-b/structural-report-eng.pdf",
      description:
        "Field report from Mercer Structural Engineering (PE#FL-44982) confirming " +
        "framing complies with 2021 IBC, wind speed 150 mph exposure D. Roof sheathing " +
        "nailing pattern verified. Report date: 2026-07-19. No deficiencies noted.",
    },
  ];

  for (const ev of evidence) {
    await write(contractorClient, `submit_evidence:${ev.evidence_type}`, {
      functionName: "submit_evidence",
      args: [projectId, ev.evidence_type, ev.title, ev.url, ev.description, false],
    });
  }

  // ── STEP 5 ────────────────────────────────────────────────────────────────
  separator("STEP 5 — Contractor requests formal inspection");

  await write(contractorClient, "request_inspection", {
    functionName: "request_inspection",
    args: [projectId],
  });

  // ── STEP 6 ────────────────────────────────────────────────────────────────
  separator("STEP 6 — Trigger AI evaluation (GenLayer validators)");
  console.log("  ⏳ This involves non-deterministic LLM consensus — may take 2–5 minutes…");

  await write(ownerClient, "evaluate_completion", {
    functionName: "evaluate_completion",
    args: [projectId],
  });

  // ── STEP 7 ────────────────────────────────────────────────────────────────
  separator("STEP 7 — Read consensus decision");

  const decision: any = await read("consensus_status", [projectId]);
  console.log("  Decision  :", JSON.stringify(decision, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v, 2));

  const finalProject: any = await read("project_details", [projectId]);
  const status: string =
    finalProject?.status ??
    finalProject?.get?.("status") ??
    "unknown";

  console.log("\n  Final project status:", status);

  // ── STEP 8 ────────────────────────────────────────────────────────────────
  if (status === "approved" || status === "consensus_pending") {
    separator("STEP 8 — Release payment to contractor");
    await write(ownerClient, "release_payment", {
      functionName: "release_payment",
      args: [projectId],
    });
    console.log("  ✅ Payment of 15 GEN released to contractor!");
  } else if (status === "rejected") {
    separator("STEP 8 — Refund escrow to owner");
    await write(ownerClient, "refund_owner", {
      functionName: "refund_owner",
      args: [projectId],
    });
    console.log("  ↩ Escrow refunded to owner.");
  } else {
    console.log(`\n  ℹ Status is '${status}' — skipping payment step.`);
    console.log("    Run evaluate_completion again once consensus is reached.");
  }

  separator("E2E COMPLETE");
  console.log("  Project ID  :", projectId);
  console.log("  Contract    :", CONTRACT);
  console.log("  Owner       :", ownerAccount.address);
  console.log("  Contractor  :", contractorAccount.address);
  console.log("  Dashboard   : http://localhost:3000/project/" + projectId);
}

main().catch((err) => {
  console.error("\n❌ E2E FAILED:", err?.message ?? err);
  process.exit(1);
});
