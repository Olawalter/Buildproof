/**
 * Continues project 1 from "appealed" (appeal_count=3) on the new contract.
 * Steps: reopen_for_evidence → request_inspection → final evaluate_completion
 * On rejection with appeal_count >= MAX_APPEALS → _send_gen(owner) fires.
 */
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";
import { TransactionStatus } from "genlayer-js/types";

const CONTRACT = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "") as `0x${string}`;
const RPC_URL  = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL ?? "https://studio.genlayer.com/api";
const OWNER_PK = process.env.OWNER_PK as `0x${string}`;
const CONTR_PK = process.env.CONTRACTOR_PK as `0x${string}`;
const PID      = process.env.PROJECT_ID ?? "1";

const ownerAccount      = privateKeyToAccount(OWNER_PK);
const contractorAccount = privateKeyToAccount(CONTR_PK);
const ownerClient       = createClient({ chain: studionet, account: ownerAccount, endpoint: RPC_URL } as any);
const contractorClient  = createClient({ chain: studionet, account: contractorAccount, endpoint: RPC_URL } as any);
const readClient        = createClient({ chain: studionet, endpoint: RPC_URL } as any);

const GEN2 = BigInt("2000000000000000000");
type Hash = `0x${string}`;

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
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { await finalize(client, hash, label); break; }
    catch (err: any) {
      const msg = String(err?.message ?? err);
      const transient = msg.includes("fetch failed") || msg.includes("Cannot convert") || msg.includes("BigInt") || msg.includes("network") || msg.includes("Rate limit");
      if (attempt === 3 || !transient) throw err;
      process.stdout.write(`[retry ${attempt} — waiting 90s for rate limit]… `);
      await new Promise(r => setTimeout(r, 90_000));
    }
  }
  console.log("✓");
}

async function read(fn: string, args: any[] = []) {
  return readClient.readContract({ address: CONTRACT, functionName: fn, args });
}

async function getBalance(addr: string): Promise<bigint> {
  return BigInt(await readClient.getBalance({ address: addr as `0x${string}` }));
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

async function main() {
  console.log("═".repeat(64));
  console.log("  e2e_continue — final evaluation, _send_gen proof");
  console.log("═".repeat(64));
  console.log(`  Contract  : ${CONTRACT}`);
  console.log(`  Project   : ${PID}`);
  console.log(`  Owner     : ${ownerAccount.address}`);

  let p: any = await read("project_details", [PID]);
  console.log(`  Current status: ${p.status}, appeal_count: ${p.appeal_count}`);
  assertEq("appeal_count = MAX_APPEALS (3)", p.appeal_count, 3);
  assertEq("escrow_deposited intact", p.escrow_deposited, String(GEN2));

  // Reopen → request → final eval
  if (p.status === "appealed") {
    await write(contractorClient, "reopen_for_evidence", "reopen_for_evidence", [PID]);
    p = await read("project_details", [PID]);
    assertEq("status = evidence_submitted after reopen", p.status, "evidence_submitted");
  }

  await write(contractorClient, "request_inspection [FINAL]", "request_inspection", [PID]);
  p = await read("project_details", [PID]);
  assertEq("status = under_review before final eval", p.status, "under_review");

  const ownerBalBefore = await getBalance(ownerAccount.address);
  console.log(`\n  Owner balance before _send_gen: ${ownerBalBefore} wei`);

  console.log("  ⏳ Final AI evaluation — on rejection, _send_gen(owner) fires…");
  await write(ownerClient, "evaluate_completion [FINAL]", "evaluate_completion", [PID]);

  // Assert post-transfer state
  p = await read("project_details", [PID]);
  const cs: any = await read("consensus_status", [PID]);
  const ownerBalAfter = await getBalance(ownerAccount.address);

  console.log("\n" + "═".repeat(64));
  console.log("  RESULT — Post-transfer state");
  console.log("═".repeat(64));
  console.log(`  Owner balance before _send_gen : ${ownerBalBefore} wei`);
  console.log(`  Owner balance after  _send_gen : ${ownerBalAfter} wei`);
  console.log(`  Balance delta                  : +${ownerBalAfter - ownerBalBefore} wei`);
  console.log(`  project status                 : ${p.status}`);
  console.log(`  payment_released               : ${p.payment_released}`);
  console.log(`  escrow_deposited               : ${p.escrow_deposited} wei`);
  console.log(`  appeal_count                   : ${p.appeal_count}`);
  console.log(`  verification_failed            : ${cs.verification_failed}`);
  console.log(`  verified/total                 : ${cs.verified_inspections}/${cs.total_inspections}`);
  console.log(`  confidence_pct                 : ${cs.confidence_pct}%`);
  console.log(`  reason                         : ${cs.reason}`);

  assertEq("status = finalized", p.status, "finalized");
  assertEq("payment_released = true", p.payment_released, true);
  assertEq("escrow_deposited = 0", p.escrow_deposited, "0");
  assertEq("appeal_count = 3", p.appeal_count, 3);
  assertEq("verification_failed = true", cs.verification_failed, true);
  assertGt("owner balance increased (_send_gen fired)", ownerBalAfter, ownerBalBefore);

  console.log("\n" + "═".repeat(64));
  console.log("  ✅ _send_gen(owner) CONFIRMED FIRED");
  console.log("  ✅ escrow_deposited = 0 — GEN left the contract");
  console.log("  ✅ payment_released = true");
  console.log("  ✅ verification_failed = true — fail-closed enforced end-to-end");
  console.log(`  ✅ owner balance increased by ${ownerBalAfter - ownerBalBefore} wei`);
  console.log("═".repeat(64));
  console.log(`  Contract : ${CONTRACT}`);
  console.log(`  Project  : ${PID}`);
  console.log(`  Explorer : https://explorer-studio.genlayer.com/address/${CONTRACT}`);
}

main().catch(e => { console.error("\n❌ FAILED:", e?.message ?? e); process.exit(1); });
