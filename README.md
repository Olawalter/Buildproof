# BuildProof

**AI-powered construction escrow and payment adjudication on GenLayer.**

BuildProof solves a specific, chronic trust problem in construction: contractors complete work, owners dispute it, and both sides spend months in court waiting for a human adjudicator who wasn't there. BuildProof replaces that intermediary with GenLayer's decentralized AI validators — multiple independent LLMs evaluate the on-chain evidence, reach consensus, and automatically settle the escrow. No lawyers. No manual release. No single point of trust.

**Live demo:** https://buildproof-topaz.vercel.app

**Contract on StudioNet:** `0x1282D8C76bAEc9F347a8E9e1E5dcc8eF411E412C`

---

## The Problem

Construction payments fail at two stages:

1. **Owner won't pay** — claims work is substandard, but has no objective mechanism to prove it.
2. **Contractor can't collect** — finished the job, submitted certificates, but depends on the owner's goodwill to release funds.

Traditional escrow just delays this dispute — a human still has to decide who's right. BuildProof makes the decision trustless by encoding the inspection requirements at project creation and using AI consensus to evaluate whether they were met.

---

## How It Works

### The Role Model

| Role | Wallet | Responsibilities |
|------|--------|-----------------|
| **Owner** | Wallet A | Creates project, defines inspections, assigns contractor, deposits escrow |
| **Contractor** | Wallet B | Accepts project, submits certified evidence, receives automatic payment |

### The Flow

```
Owner: create_project(title, inspections, contractor_address)
Owner: deposit_escrow()  ← sends GEN as tx value (payable)
Contractor: accept_project()

Both: submit_evidence(certificates, permits, photos, reports)

Either: request_inspection()       → status: under_review
Either: evaluate_completion()      → GenLayer validators run LLM consensus

  If APPROVED → status: finalized, payment_released = true
  If REJECTED → either party may submit_appeal() (up to 3 rounds)

Owner: cancel_project()            → available before evidence is submitted
```

### What Makes This a GenLayer Use Case

The adjudication problem cannot be solved with a deterministic smart contract — there is no on-chain function that can read a PDF and decide if it satisfies a building code. It requires subjective reasoning over real-world documents. GenLayer's Intelligent Contracts make this trustless by:

1. **Non-deterministic execution** — each validator independently runs the evaluation LLM
2. **Equivalence Principle consensus** — validators only need to agree on the `passed` boolean, not exact wording
3. **External verification** — during evaluation, the contract runs `gl.nondet.web_search()` to cross-check permit numbers and reference IDs against live government databases, grounding the decision in real-world data rather than just the submitted text

---

## Intelligent Contract

**File:** [`contracts/construction_escrow.py`](contracts/construction_escrow.py)

### Key Design Decisions

**Storage**: All project state uses GenLayer-native types — `TreeMap`, `DynArray`, `u256`, `@dataclass` + `allow_storage`. Evidence is fully on-chain and fetchable.

**Evidence**: Both Owner and Contractor can submit evidence at valid stages. Evidence items include type, title, URL, description, and submitter address — permanently stored on-chain.

**Evaluation**: The `evaluate_completion` method runs in two stages inside the nondet closure:

```python
# Stage 1 — External verification per evidence item
for ev in _evidence:
    url_check = gl.nondet.exec_prompt(f"Verify this URL: {ev['url']}")
    refs = _extract_ref_numbers(ev["description"])   # regex: permit IDs, ref numbers
    for ref in refs:
        result = gl.nondet.web_search(f'"{ref}" construction permit verification {location}')

# Stage 2 — Adjudication with full context
prompt = f"""...SUBMITTED EVIDENCE...\nEXTERNAL VERIFICATION:\n{verification_text}..."""
decision = gl.nondet.exec_prompt(prompt)
```

```python
# Equivalence principle — only the passed boolean must agree
gl.eq_principle.prompt_comparative(
    perform_evaluation,
    'Do both results agree on the "passed" boolean? '
    'Differences in confidence or wording are acceptable.'
)
```

**Appeals**: Either party may appeal a REJECTED decision up to `MAX_APPEALS = 3` times. Each round: `submit_appeal()` → `reopen_for_evidence()` → add evidence → `request_inspection()` → `evaluate_completion()`.

**Payable custody**: `deposit_escrow` is decorated `@gl.public.write.payable` — GEN is taken into contract custody via `gl.message.value`. The sent amount must match `contract_value` exactly; any mismatch is rejected.

**Real fund transfer**: All settlement paths route through a single `_send_gen()` helper backed by `@gl.evm.contract_interface`. The ledger field is zeroed and state is saved *before* the transfer fires — no reentrancy window, no double-spend:
- APPROVED → `_send_gen(contractor, escrow_amount)`
- Final REJECTED → `_send_gen(owner, escrow_amount)`
- CANCELLED → `_send_gen(owner, refund)`

**Fail-closed evidence**: If more than half the required inspection items have only UNVERIFIED evidence (URL inaccessible AND permit number not confirmed by web search), `passed=false`. Evidence is not given the benefit of the doubt — it must be independently verifiable.

### Contract ABI

| Method | Caller | Description |
|--------|--------|-------------|
| `create_project(title, description, location, contract_value, inspection_names, contractor_address)` | Owner | Creates project and pre-assigns a specific contractor |
| `deposit_escrow(project_id)` | Owner | Locks GEN escrow — GEN sent as tx value (`gl.message.value`), must equal `contract_value` |
| `accept_project(project_id)` | Assigned contractor only | Accepts project; promotes to ESCROWED if funded |
| `submit_evidence(project_id, type, title, url, description, is_dispute)` | Owner or Contractor | Stores evidence fully on-chain |
| `request_inspection(project_id)` | Either party | Locks evidence, moves to UNDER_REVIEW |
| `evaluate_completion(project_id)` | Either party | Runs GenLayer AI consensus with web verification |
| `submit_appeal(project_id, reason)` | Either party | Appeals REJECTED decision (max 3) |
| `reopen_for_evidence(project_id)` | Either party | Reopens after appeal for more evidence |
| `cancel_project(project_id)` | Owner | Cancels stalled project, returns escrow |
| `finalize_escrow(project_id)` | Either party | Activates escrow if deposited before acceptance |
| `project_details(project_id)` | View | Full project metadata |
| `milestone_status(project_id)` | View | All inspections + full evidence list |
| `consensus_status(project_id)` | View | AI decision, confidence, appeals |
| `get_owner_projects(address)` | View | Project IDs where caller is owner |
| `get_contractor_projects(address)` | View | Project IDs where caller is contractor |
| `get_all_projects()` | View | All project summaries |

### Status State Machine

```
draft ──→ accepted ──→ escrowed ──→ evidence_submitted ──→ under_review
                                                                  │
                                              ┌───────────────────┤
                                              ▼                   ▼
                                          approved            rejected
                                              │                   │
                                          finalized          appealed ──→ evidence_submitted
                                                                  │           (loop, max 3×)
                                                              finalized
                                                            (owner refund)
cancelled  ← (owner cancels before evidence_submitted)
```

---

## Frontend

**Stack:** Next.js 14, genlayer-js v1.1.8, TanStack Query, MetaMask (EIP-1193)

The frontend makes real contract calls for every action — there is no mock layer. All transactions go through `genlayer-js` `writeContract` → `waitForTransactionReceipt` (status = FINALIZED, code 7) → execution result check. Contract assertion failures (`[EXPECTED]` errors) surface as toast notifications with the exact on-chain error message.

### Key Frontend Features

- **Role-aware UI** — actions shown based on whether the connected wallet is owner or assigned contractor
- **Assigned contractor field** — owner specifies contractor wallet at project creation; only that address can accept on-chain
- **GEN decimal input** — all amount fields accept decimal GEN (e.g. `5`), converted to wei automatically
- **Auto-refresh after tx** — `invalidateQueries` with `refetchType: "all"` forces immediate UI update after every confirmed transaction
- **Rate-limit safe polling** — 30 s refetch intervals with `refetchOnWindowFocus: false` (StudioNet cap: 500 req/hour)
- **Inspection checklist** — shows "Verified by AI consensus" (green) or "Not satisfied" (red) based on the consensus decision
- **Error surfacing** — checks `txExecutionResultName` on every receipt; silent contract failures never show as success

---

## Quick Start

### Prerequisites

- Node.js 18+
- MetaMask with a StudioNet wallet
- GenLayer Studio account: https://studio.genlayer.com

### 1 — Clone and install

```bash
git clone https://github.com/Olawalter/Buildproof.git
cd Buildproof/frontend
npm install
```

### 2 — Configure

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_GENLAYER_CHAIN_ID=61999
NEXT_PUBLIC_GENLAYER_CHAIN_NAME=GenLayer Studio
NEXT_PUBLIC_GENLAYER_SYMBOL=GEN
NEXT_PUBLIC_CONTRACT_ADDRESS=0x1282D8C76bAEc9F347a8E9e1E5dcc8eF411E412C
NEXT_PUBLIC_NETWORK=studionet
```

### 3 — Run

```bash
npm run dev
```

Open http://localhost:3000

### 4 — Deploy your own contract (optional)

```bash
cd frontend
DEPLOYER_PK=0x<your-private-key> npx tsx deploy_contract.ts
```

Update `NEXT_PUBLIC_CONTRACT_ADDRESS` in `.env.local` and restart.

---

## Manual E2E Test

Use two MetaMask wallets on StudioNet:

| Wallet | Role |
|--------|------|
| Wallet A | Owner |
| Wallet B | Contractor |

**Step 1** — Wallet A → http://localhost:3000/project/new
- Title: `Lagos Marina Tower — Phase 3`
- Contractor address: *(Wallet B address)*
- Contract value: `5` GEN
- Inspections: Structural Certificate, MEP Sign-Off, Glazing Certificate, Fire Suppression Test, LASBCA Approval

**Step 2** — Wallet A → Deposit Escrow → enter `5` → Deposit

**Step 3** — Wallet B → same project page → Accept Project

**Step 4** — Wallet B → Submit Evidence × 5 (certificates, permits with real reference numbers)

**Step 5** — Wallet B → Request AI Inspection

**Step 6** — Either wallet → Trigger AI Evaluation *(takes 5–8 min — validators run web searches on permit numbers)*

**Step 7** — Inspect result on project page: APPROVED shows green checklist + "Escrow auto-transferred". REJECTED shows appeal option.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | Deployed contract address |
| `NEXT_PUBLIC_GENLAYER_RPC_URL` | GenLayer RPC endpoint |
| `NEXT_PUBLIC_GENLAYER_CHAIN_ID` | `61999` for StudioNet |
| `NEXT_PUBLIC_GENLAYER_SYMBOL` | `GEN` |
| `DEPLOYER_PK` | Deploy script only — never committed |
| `OWNER_PK` | E2E test scripts only — never committed |
| `CONTRACTOR_PK` | E2E test scripts only — never committed |

Private keys are never hardcoded in source — all scripts read from environment variables only.

---

## Path Forward

- **Mainnet deployment** — contract is already StudioNet-compatible using `_send_gen()` via `@gl.evm.contract_interface`; real GEN transfers confirmed on-chain (Project 2, tx `0xdf8abbaf`)
- **IPFS evidence storage** — frontend upload flow to pin documents to IPFS before submitting the URL on-chain
- **Contractor marketplace** — owners browse available contractors; contractors bid on projects
- **Multi-milestone projects** — partial escrow releases per milestone rather than single final release
- **Mobile wallet support** — WalletConnect integration for field use by site inspectors

---

## Project Structure

```
Buildproof/
├── contracts/
│   └── construction_escrow.py   # GenLayer Intelligent Contract
├── frontend/
│   ├── app/                     # Next.js app router pages
│   ├── components/              # UI components
│   ├── hooks/                   # TanStack Query hooks
│   ├── lib/                     # genlayer-js contract calls
│   ├── types/                   # TypeScript types
│   ├── deploy_contract.ts       # Deploy script (reads PK from env)
│   ├── e2e_test.ts              # Full e2e automated test
│   └── validate_contract.ts     # Contract validation suite
├── tests/
│   ├── direct/                  # pytest direct tests
│   ├── integration/             # gltest consensus tests
│   └── e2e/                     # end-to-end scenarios
├── DEPLOYMENT.md                # Detailed deployment guide
└── README.md
```

---

## Network

| Property | Value |
|----------|-------|
| Network | GenLayer StudioNet |
| Chain ID | 61999 |
| RPC | https://studio.genlayer.com/api |
| Explorer | https://explorer-studio.genlayer.com |
| Contract | `0x1282D8C76bAEc9F347a8E9e1E5dcc8eF411E412C` |
