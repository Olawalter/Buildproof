# BuildProof — Appeal Response

Thank you for the detailed rejection feedback. All four issues have been resolved and are verifiable on-chain and in the repository. Here is a point-by-point response.

---

## 1. Payable Custody

**Rejection:** "contract records an escrow amount but never takes custody of funds"

**Fix:** `deposit_escrow` is now decorated `@gl.public.write.payable`. GEN is taken into contract custody via `gl.message.value` — the caller must send GEN as the transaction value. The contract validates that the sent amount matches `contract_value` exactly; any mismatch is rejected with `[EXPECTED] Sent amount must equal the contract value exactly`.

```python
@gl.public.write.payable
def deposit_escrow(self, project_id: str) -> None:
    amount = gl.message.value  # authoritative — no caller-supplied amount trusted
    assert amount > u256(0), "[EXPECTED] Must send GEN with this transaction"
    assert amount == project.contract_value, "[EXPECTED] Sent amount must equal the contract value exactly"
    project.escrow_deposited = amount
```

---

## 2. Real Fund Transfer (`_send_gen`)

**Rejection:** "never transfers them"

**Fix:** All settlement paths route through a single `_send_gen()` helper backed by `@gl.evm.contract_interface`. The escrow ledger is zeroed and state is saved *before* the transfer fires — no reentrancy window, no double-spend:

- APPROVED → `_send_gen(contractor, escrow_amount)`
- Final REJECTED (appeal_count >= MAX_APPEALS) → `_send_gen(owner, escrow_amount)`
- CANCELLED → `_send_gen(owner, refund)`

```python
@gl.evm.contract_interface
class _Recipient:
    class View: pass
    class Write: pass

def _send_gen(to_address: str, amount: u256) -> None:
    _Recipient(Address(to_address)).emit_transfer(value=amount)
```

**On-chain proof:** Project 2 on contract `0x1282D8C76bAEc9F347a8E9e1E5dcc8eF411E412C` — tx `0xdf8abbaf` — escrow went from `2000000000000000000 wei` → `0 wei`, `payment_released: true`, `status: finalized`. 2 GEN returned to owner `0x358539151487477Eb066520688fA9E57834c1F02`.

---

## 3. Fail-Closed Evidence Evaluation

**Rejection:** "evidence checks can fail open"

**Fix:** Evaluation is now fail-closed. During the nondet closure, each evidence item's URL is checked for accessibility and permit/reference numbers are cross-verified via `gl.nondet.web_search()`. If more than half the required inspection items are UNVERIFIED (URL inaccessible AND no permit confirmed), `passed = false`. Evidence is not given the benefit of the doubt.

**On-chain proof:** All three e2e test runs were correctly REJECTED because submitted URLs were inaccessible — the AI did not grant payment on unverifiable evidence. Example from Project 1:

> "All five required inspection documents failed external verification with inaccessible URLs and no independent confirmation of permit numbers."

---

## 4. Updated Tests

**Rejection:** "tests target an older interface"

**Fix:** `frontend/e2e_test.ts` is fully rewritten for the current interface — `deposit_escrow` is called with `value: GEN5` (GEN sent as transaction value, no amount argument). Two complete test runs covering the standard flow and the owner counter-evidence/dispute path.

`frontend/e2e_transfer.ts` is a new test that exercises the full payable custody → AI evaluation → `_send_gen` transfer path end-to-end, exhausting all 3 appeal rounds to prove `_send_gen(owner)` fires on the final evaluation.

---

## Repository and Live Demo

- **GitHub:** https://github.com/Olawalter/Buildproof
- **Live demo:** https://buildproof-topaz.vercel.app
- **Contract:** `0x1282D8C76bAEc9F347a8E9e1E5dcc8eF411E412C` on GenLayer StudioNet
- **Explorer:** https://explorer-studio.genlayer.com/address/0x1282D8C76bAEc9F347a8E9e1E5dcc8eF411E412C
