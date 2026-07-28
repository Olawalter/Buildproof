# BuildProof — Deployment Guide

**Live demo:** https://buildproof-topaz.vercel.app
**Contract:** `0x1282D8C76bAEc9F347a8E9e1E5dcc8eF411E412C` (StudioNet)

---

## Prerequisites

- Python 3.12+
- Node.js 18+
- MetaMask browser wallet
- GenLayer StudioNet account with test funds

---

## 1 — Install Dependencies

### Python (contract tooling + tests)
```bash
pip install -r requirements.txt
```

### Frontend
```bash
cd frontend && npm install
```

---

## 2 — Lint the Contract

```bash
genvm-lint check contracts/construction_escrow.py --json
```

---

## 3 — Run Direct Tests

```bash
pytest tests/direct -v
```

---

## 4 — Set Up Wallets

1. Open GenLayer Studio: https://studio.genlayer.com
2. Create or import wallets (Owner + Contractor).
3. Fund from the StudioNet faucet.
4. Export private keys — set as env vars only, never hardcode.

```bash
export DEPLOYER_PK=0x...
export OWNER_PK=0x...
export CONTRACTOR_PK=0x...
```

---

## 5 — Deploy Contract to StudioNet

```bash
cd frontend
DEPLOYER_PK=0x<your-key> npx tsx deploy_contract.ts
```

Copy the `contractAddress` from the output.

---

## 6 — Configure Frontend

```bash
cd frontend
cp .env.local.example .env.local
```

Edit `.env.local`:
```env
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_GENLAYER_CHAIN_ID=61999
NEXT_PUBLIC_GENLAYER_CHAIN_NAME=GenLayer Studio
NEXT_PUBLIC_GENLAYER_SYMBOL=GEN
NEXT_PUBLIC_CONTRACT_ADDRESS=0x<your-contract-address>
NEXT_PUBLIC_NETWORK=studionet
```

---

## 7 — Run Locally

```bash
cd frontend
npm run dev
```

Open http://localhost:3000

---

## 8 — Deploy Frontend to Vercel

```bash
cd frontend
npx vercel login          # one-time — browser auth
npx vercel --yes          # preview deploy
npx vercel deploy --prod  # production
```

Set env vars on Vercel after first deploy:
```bash
npx vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS production
# repeat for all NEXT_PUBLIC_* vars
npx vercel deploy --prod  # redeploy to bake in env vars
```

---

## 9 — Run Integration Tests

```bash
gltest tests/integration -v -s
```

---

## Project Status Flow

```
draft → accepted → escrowed → evidence_submitted → under_review
                                                         │
                                         ┌───────────────┤
                                         ▼               ▼
                                     approved         rejected
                                         │               │
                                     finalized       appealed → evidence_submitted
                                  (payment_released)      │         (loop, max 3×)
                                                      finalized
                                                    (owner refund)
cancelled  ← (owner cancels before evidence_submitted)
```

---

## Contract ABI Summary

| Method | Caller | Description |
|--------|--------|-------------|
| `create_project` | Owner | Create project, assign contractor, set inspections |
| `accept_project` | Assigned contractor only | Accept the project |
| `deposit_escrow` | Owner | Lock GEN escrow — must match `contract_value` |
| `finalize_escrow` | Either party | Activate escrow deposited before acceptance |
| `submit_evidence` | Owner or Contractor | Add evidence item on-chain |
| `request_inspection` | Either party | Move to UNDER_REVIEW |
| `evaluate_completion` | Either party | Trigger GenLayer AI consensus + web verification |
| `submit_appeal` | Either party | Appeal REJECTED decision (max 3 rounds) |
| `reopen_for_evidence` | Either party | Reopen after appeal for more evidence |
| `cancel_project` | Owner | Cancel before evidence submitted, return escrow |
| `project_details` | View | Full project metadata |
| `milestone_status` | View | Inspections + full evidence list |
| `consensus_status` | View | AI decision, confidence, appeals |
| `get_owner_projects` | View | Project IDs by owner |
| `get_contractor_projects` | View | Project IDs by contractor |
| `get_all_projects` | View | All project summaries |

**Removed (StudioNet incompatible):** `release_payment`, `refund_owner` — settlement is automatic inside `evaluate_completion`. `gl.transfer()` does not exist on StudioNet; will be restored at mainnet.

---

## Network

| Property | Value |
|----------|-------|
| Network | GenLayer StudioNet |
| Chain ID | 61999 |
| RPC | https://studio.genlayer.com/api |
| Explorer | https://explorer-studio.genlayer.com |
| Rate limit | 500 req/hour |
