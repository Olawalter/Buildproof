# BuildProof — Deployment Guide

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

Fix every error and warning before deploying.

---

## 3 — Run Direct Tests

```bash
pytest tests/direct -v
```

All tests must pass before deployment.

---

## 4 — Set Up Wallet

1. Open GenLayer Studio: https://studio.genlayer.com
2. Create or import a wallet.
3. Fund your wallet from the StudioNet faucet.
4. Export your private key.

```bash
export OWNER_PRIVATE_KEY=0x...
export CONTRACTOR_PRIVATE_KEY=0x...
export OTHER_PRIVATE_KEY=0x...
```

---

## 5 — Deploy to StudioNet

```bash
cd deploy
npx ts-node deploy.ts
```

Copy the `contractAddress` from the output.

---

## 6 — Configure Frontend

```bash
cd frontend
cp .env.local.example .env.local
```

Edit `.env.local`:
```
NEXT_PUBLIC_CONTRACT_ADDRESS=0x<your-contract-address>
NEXT_PUBLIC_NETWORK=studionet
```

---

## 7 — Start Frontend

```bash
cd frontend
npm run dev
```

Open http://localhost:3000

---

## 8 — Run Integration Tests

```bash
gltest tests/integration -v -s
```

---

## Project State Machine

```
Draft → Accepted → Escrowed → Evidence Submitted
     → Under Review → [AI Evaluation]
     → Approved → Finalized  (payment released)
     → Rejected → Appealed → Evidence Submitted → Under Review → ...
     → Rejected → Finalized  (owner refund)
```

---

## Contract ABI Summary

| Method | Access | Description |
|--------|--------|-------------|
| `create_project` | Owner | Create project with inspection requirements |
| `accept_project` | Contractor | Accept the project |
| `deposit_escrow` | Owner | Lock funds in escrow (payable) |
| `submit_evidence` | Owner/Contractor | Add evidence item |
| `request_inspection` | Contractor | Move to Under Review |
| `evaluate_completion` | Anyone | Trigger AI validator consensus |
| `submit_appeal` | Owner/Contractor | Appeal a rejected decision |
| `reopen_for_evidence` | Owner/Contractor | Reopen after appeal |
| `release_payment` | Anyone | Release escrow to contractor (approved) |
| `refund_owner` | Owner | Refund escrow to owner (rejected) |
| `project_details` | View | Get project metadata |
| `milestone_status` | View | Get inspections + evidence list |
| `consensus_status` | View | Get AI decision + appeals |
| `get_owner_projects` | View | List project IDs by owner |
| `get_contractor_projects` | View | List project IDs by contractor |
| `get_all_projects` | View | List all project summaries |
