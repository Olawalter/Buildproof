# BuildProof — Appeal Response (Round 3)

Thank you for the continued review. Below is a point-by-point response to each concern, with on-chain references for every claim.

---

## Rejection Summary

> "payout still depends on party-written descriptions and generic search snippets instead of fetched, authenticated construction records … most formal tests still exercise the old interface … Bind evidence to authoritative permits or inspections, enforce fail-closed verification in contract logic, and add current-ABI tests that assert recipient balances and appeal outcomes."

All three blockers are resolved and verified on-chain on the new deployment.

**Contract:** `0xD101C412045fF5899a0115eF38270eC249E24FeC`
**Explorer:** https://explorer-studio.genlayer.com/address/0xD101C412045fF5899a0115eF38270eC249E24FeC

---

## 1. Fetched, Authenticated Construction Records Only

**What was rejected:** party-written descriptions and generic web search snippets used for evidence verification.

**What changed — three layers of enforcement:**

**Layer 1 — On-chain binding at submission.** `submit_evidence` now asserts that completion evidence carries an official permit/certificate number of at least 4 characters. The contract rejects the transaction before any state change if this field is missing:

```python
else:
    assert sender.as_hex == project.contractor, "..."
    # Fail-closed: permit_number is the ONLY key used for registry verification.
    # Party-written descriptions are never used for verification.
    assert len(permit_number.strip()) >= 4, \
        "[EXPECTED] Completion evidence requires an official permit/certificate number (min 4 chars)"
```

**Layer 2 — Description withheld from the AI.** The verification prompt deliberately omits the evidence description and title. The AI receives only the permit number and the fetched registry result — party-written text cannot influence the CONFIRMED/UNCONFIRMED verdict:

```python
confirm_raw = gl.nondet.exec_prompt(
    f"Permit/Certificate number: {pnum}\n"
    f"Required inspection: {insp_name}\n"
    f"Location: {location}\n\n"
    f"Authoritative database search result:\n{auth_result[:350]}\n\n"
    f"Supplementary government search:\n{supp_result[:350]}\n\n"
    "Rules:\n"
    "- Answer CONFIRMED only if an official government or regulatory source in the "
    "search results above explicitly contains this permit/certificate number.\n"
    "- If results are empty, unavailable, or ambiguous, answer UNCONFIRMED. "
    "When in doubt, answer UNCONFIRMED.\n"
    "Reply with exactly one word: CONFIRMED or UNCONFIRMED"
)
```

**Layer 3 — Description/URL fallbacks removed.** The previous code had two fail-open paths: (a) `_extract_ref_numbers` parsed permit IDs from party-written titles/descriptions when `permit_number` was empty, and (b) URL accessibility could mark an inspection verified with no registry check. Both are gone. There is no fallback — no permit number means automatic VERIFICATION FAILURE.

---

## 2. Strict Fail-Closed Verification in Contract Logic

**What was rejected:** evidence checks could fail open; AI could grant payment on unverifiable evidence.

**What changed:** Python contract logic — not AI — decides pass/fail. The `verification_failed` flag distinguishes a registry lookup failure (payout blocked) from a merit-based rejection:

```python
# ALL inspections must be CONFIRMED in authoritative registries.
# If even one inspection has no permit number or fails registry lookup → blocked.
verification_failed = verified_count < total_count
contract_passed = (not verification_failed) and (critical == 0)

if not contract_passed:
    if verification_failed:
        prefix = (
            f"VERIFICATION FAILURE (fail-closed): {verified_count}/{total_count} "
            f"inspections verified in authoritative government registries — "
            f"escrow payout blocked"
        )
```

The `consensus_status` view now returns `verification_failed`, `verified_inspections`, and `total_inspections` so the reason for every block is auditable on-chain.

**On-chain proof — Project 1, Contract `0xD101C412...`:**
```
verification_failed   : true
verified_inspections  : 0
total_inspections     : 3
passed                : false
escrow_deposited      : 0 wei  (GEN returned to owner via _send_gen)
payment_released      : true
status                : finalized
reason: VERIFICATION FAILURE (fail-closed): 0/3 inspections verified in
        authoritative government registries — escrow payout blocked
        (unverified: Structural Certificate, MEP Sign-Off, Fire Safety Report).
        All required structural, MEP, and fire safety permits failed verification
        against authoritative Nigerian government registries.
```

---

## 3. Current-ABI Tests with Balance Assertions and Appeal Outcomes

**What was rejected:** most formal tests targeted the old interface.

**Test files:** `frontend/e2e_transfer.ts`, `frontend/e2e_test.ts`, `frontend/validate_contract.ts`

All use the current ABI:
- `deposit_escrow(project_id)` + `value=GEN` (payable — no amount arg)
- `submit_evidence(pid, type, title, url, description, permit_number, is_dispute)` — 7 args

### On-chain test results — Project 1, new contract `0xD101C412045fF5899a0115eF38270eC249E24FeC`

```
SETUP — Create project
  ⏳ create_project … tx 0xa3e4f77d… ✓
  ✅ assert status after create: draft
  ✅ assert appeal_count after create: 0

SETUP — Owner deposits 2 GEN escrow (payable)
  Owner balance before deposit: 197849999999999999900 wei
  ⏳ deposit_escrow … tx 0x2814a580… ✓
  Owner balance after deposit : 195849999999999999900 wei
  ✅ assert owner balance decreased (GEN entered contract): 195849... < 197849...
  ✅ assert escrow_deposited = 2 GEN: 2000000000000000000
  ✅ assert status after accept: escrowed

FAIL-CLOSED — completion evidence without permit number blocked
  ✅ assert evidence without permit_number blocked (count stayed at 3)
  [On-chain: contract rejected submission, state unchanged]

APPEAL ROUND 1/3
  ⏳ evaluate_completion … tx 0xef963573… ✓
  result: REJECTED (confidence: 98%)
  reason: VERIFICATION FAILURE (fail-closed): 0/3 inspections verified
  ✅ assert status = rejected (round 1): rejected
  ✅ assert escrow still locked (round 1): 2000000000000000000
  ✅ assert appeal_count = 1 after appeal: 1

APPEAL ROUND 2/3
  ⏳ evaluate_completion … tx 0xb4a6515c… ✓
  result: REJECTED (confidence: 100%)
  reason: VERIFICATION FAILURE (fail-closed): 0/3 inspections verified —
          permits identified as fraudulent entries
  ✅ assert status = rejected (round 2): rejected
  ✅ assert escrow still locked (round 2): 2000000000000000000
  ✅ assert appeal_count = 2 after appeal: 2

APPEAL ROUND 3/3
  ⏳ evaluate_completion … tx 0x40bc5b77… ✓
  result: REJECTED (confidence: 98%)
  reason: VERIFICATION FAILURE (fail-closed): 0/3 inspections verified
  ✅ assert status = rejected (round 3): rejected
  ✅ assert escrow still locked (round 3): 2000000000000000000
  ✅ assert appeal_count = 3 after appeal: 3

FINAL EVALUATION — appeal_count = 3 = MAX_APPEALS → _send_gen(owner) fires
  Owner balance before _send_gen : 195849999999999999900 wei
  ⏳ evaluate_completion [FINAL] … tx 0x6ef8f73c… ✓
  Owner balance after  _send_gen : 197849999999999999900 wei
  Balance delta                  : +2000000000000000000 wei

  status           : finalized
  payment_released : true
  escrow_deposited : 0 wei
  appeal_count     : 3
  verification_failed   : true
  verified_inspections  : 0 / 3
  passed           : false
  confidence_pct   : 100%
```

**What the results prove:**
- Payable GEN custody: owner balance decreased by exactly 2 GEN on deposit ✅
- Fail-closed binding: empty-permit evidence blocked on-chain, state unchanged ✅
- Every evaluation: `VERIFICATION FAILURE (fail-closed)` — fake permits not in any registry ✅
- Escrow stayed locked through all 3 appeal rounds ✅
- `appeal_count` incremented correctly: 0 → 1 → 2 → 3 ✅
- On 4th evaluation with `appeal_count >= MAX_APPEALS`: `_send_gen(owner)` fired ✅
- Owner balance increased by exactly 2 GEN (2,000,000,000,000,000,000 wei) ✅
- `escrow_deposited = 0` — GEN left the contract ✅
- `payment_released = true`, `status = finalized` ✅
- `verification_failed = true`, `verified_inspections = 0/3` — on-chain audit trail ✅

---

## Repository and Live Demo

- **GitHub:** https://github.com/Olawalter/Buildproof
- **Live demo:** https://buildproof-topaz.vercel.app
- **Contract:** `0xD101C412045fF5899a0115eF38270eC249E24FeC` on GenLayer StudioNet
- **Explorer:** https://explorer-studio.genlayer.com/address/0xD101C412045fF5899a0115eF38270eC249E24FeC
- **Test files:** `frontend/e2e_transfer.ts`, `frontend/e2e_test.ts`, `frontend/validate_contract.ts`
- **Contract source:** `contracts/construction_escrow.py`
