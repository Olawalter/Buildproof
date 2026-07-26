// ─── Project Status ───────────────────────────────────────────────────────────

export type ProjectStatus =
  | "draft"
  | "accepted"
  | "escrowed"
  | "evidence_submitted"
  | "under_review"
  | "consensus_pending"
  | "approved"
  | "rejected"
  | "appealed"
  | "finalized"
  | "cancelled";

// ─── Evidence ─────────────────────────────────────────────────────────────────

export type EvidenceType =
  | "photo"
  | "report"
  | "certificate"
  | "permit"
  | "drawing"
  | "other";

export interface EvidenceItem {
  id: string;
  submitter: string;
  type: EvidenceType;
  title: string;
  url: string;
  description: string;
  is_dispute: boolean;
}

// ─── Inspection ───────────────────────────────────────────────────────────────

export interface InspectionItem {
  name: string;
  required: boolean;
  satisfied: boolean;
  evidence_ref: string;
}

// ─── Project ──────────────────────────────────────────────────────────────────

export interface ProjectSummary {
  id: string;
  title: string;
  status: ProjectStatus;
  owner: string;
  contractor: string;
  assigned_contractor: string;
  contract_value: string;
  escrow_deposited: string;
  has_decision: boolean;
  payment_released: boolean;
}

export interface ProjectDetails extends ProjectSummary {
  description: string;
  location: string;
  inspection_count: number;
  evidence_count: number;
  appeal_count: number;
  evaluation_count: number;
}

// ─── Consensus ────────────────────────────────────────────────────────────────

export interface AppealRecord {
  id: string;
  appellant: string;
  reason: string;
  resolved: boolean;
  outcome: string;
}

export interface ConsensusStatus {
  has_decision: boolean;
  status: ProjectStatus;
  passed?: boolean;
  confidence_pct?: number;
  critical_defects?: number;
  occupancy_verified?: boolean;
  reason?: string;
  appeal_count?: number;
  appeals: AppealRecord[];
}

// ─── Milestone ────────────────────────────────────────────────────────────────

export interface MilestoneStatus {
  status: ProjectStatus;
  inspections: InspectionItem[];
  evidence: EvidenceItem[];
}

// ─── Transaction ──────────────────────────────────────────────────────────────

export type TxStatus = "idle" | "pending" | "confirming" | "success" | "error";

export interface TxState {
  status: TxStatus;
  hash?: string;
  error?: string;
}
