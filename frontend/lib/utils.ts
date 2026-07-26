import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ProjectStatus } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatWei(wei: string | bigint, symbol = "GEN"): string {
  const n = typeof wei === "string" ? BigInt(wei) : wei;
  const eth = Number(n) / 1e18;
  return `${eth.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}`;
}

export function statusLabel(status: ProjectStatus): string {
  const labels: Record<ProjectStatus, string> = {
    draft: "Draft",
    accepted: "Accepted",
    escrowed: "Escrowed",
    evidence_submitted: "Evidence Submitted",
    under_review: "Under Review",
    consensus_pending: "Consensus Pending",
    approved: "Approved",
    rejected: "Rejected",
    appealed: "Appealed",
    finalized: "Finalized",
    cancelled: "Cancelled",
  };
  return labels[status] ?? status;
}

export function statusColor(status: ProjectStatus): string {
  switch (status) {
    case "draft":
      return "text-bp-steel bg-bp-steel/10 border-bp-steel/30";
    case "accepted":
      return "text-blue-400 bg-blue-400/10 border-blue-400/30";
    case "escrowed":
      return "text-bp-gold bg-bp-gold/10 border-bp-gold/30";
    case "evidence_submitted":
      return "text-violet-400 bg-violet-400/10 border-violet-400/30";
    case "under_review":
      return "text-orange-400 bg-orange-400/10 border-orange-400/30";
    case "consensus_pending":
      return "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
    case "approved":
      return "text-emerald-400 bg-emerald-400/10 border-emerald-400/30";
    case "rejected":
      return "text-red-400 bg-red-400/10 border-red-400/30";
    case "appealed":
      return "text-amber-400 bg-amber-400/10 border-amber-400/30";
    case "finalized":
      return "text-teal-400 bg-teal-400/10 border-teal-400/30";
    default:
      return "text-gray-400 bg-gray-400/10 border-gray-400/30";
  }
}

export const STATUS_ORDER: ProjectStatus[] = [
  "draft",
  "accepted",
  "escrowed",
  "evidence_submitted",
  "under_review",
  "consensus_pending",
  "approved",
  "rejected",
  "appealed",
  "finalized",
];

export function statusStep(status: ProjectStatus): number {
  return STATUS_ORDER.indexOf(status);
}

export function isFinalStatus(status: ProjectStatus): boolean {
  return status === "approved" || status === "rejected" || status === "finalized";
}
