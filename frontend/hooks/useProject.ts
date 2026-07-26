"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import {
  readProjectDetails,
  readMilestoneStatus,
  readConsensusStatus,
  readAllProjects,
  readOwnerProjects,
  readContractorProjects,
  txCreateProject,
  txAcceptProject,
  txDepositEscrow,
  txSubmitEvidence,
  txRequestInspection,
  txEvaluateCompletion,
  txSubmitAppeal,
  txReopenForEvidence,
  txFinalizeEscrow,
  txCancelProject,
} from "@/lib/contract";
import { getContractAddress } from "@/lib/genlayer";
import type { TxState } from "@/types";

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const KEYS = {
  project: (id: string) => ["project", id] as const,
  milestone: (id: string) => ["milestone", id] as const,
  consensus: (id: string) => ["consensus", id] as const,
  allProjects: ["allProjects"] as const,
  ownerProjects: (addr: string) => ["ownerProjects", addr] as const,
  contractorProjects: (addr: string) => ["contractorProjects", addr] as const,
};

// ─── Read Hooks ───────────────────────────────────────────────────────────────

// StudioNet rate limit: 500 req/hour (~8 req/min).
// 3 queries on project page at 30s = 6 req/min — safely under the cap.
// Transactions force-invalidate immediately via invalidateQueries.
const POLL_MS = 30_000;

export function useProjectDetails(projectId: string | null) {
  return useQuery({
    queryKey: KEYS.project(projectId ?? ""),
    queryFn: () => readProjectDetails(projectId!),
    enabled: !!projectId && !!getContractAddress(),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: false,
  });
}

export function useMilestoneStatus(projectId: string | null) {
  return useQuery({
    queryKey: KEYS.milestone(projectId ?? ""),
    queryFn: () => readMilestoneStatus(projectId!),
    enabled: !!projectId && !!getContractAddress(),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: false,
  });
}

export function useConsensusStatus(projectId: string | null) {
  return useQuery({
    queryKey: KEYS.consensus(projectId ?? ""),
    queryFn: () => readConsensusStatus(projectId!),
    enabled: !!projectId && !!getContractAddress(),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: false,
  });
}

export function useAllProjects() {
  return useQuery({
    queryKey: KEYS.allProjects,
    queryFn: readAllProjects,
    enabled: !!getContractAddress(),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: false,
  });
}

export function useOwnerProjects(address: string | null) {
  return useQuery({
    queryKey: KEYS.ownerProjects(address ?? ""),
    queryFn: () => readOwnerProjects(address!),
    enabled: !!address && !!getContractAddress(),
  });
}

export function useContractorProjects(address: string | null) {
  return useQuery({
    queryKey: KEYS.contractorProjects(address ?? ""),
    queryFn: () => readContractorProjects(address!),
    enabled: !!address && !!getContractAddress(),
  });
}

// ─── Write Hook ───────────────────────────────────────────────────────────────

export function useContractWrite() {
  const qc = useQueryClient();
  const [tx, setTx] = useState<TxState>({ status: "idle" });

  const invalidate = useCallback(
    (projectId?: string) => {
      // refetchType: "all" forces active + inactive queries to refetch immediately
      qc.invalidateQueries({ queryKey: KEYS.allProjects, refetchType: "all" });
      if (projectId) {
        qc.invalidateQueries({ queryKey: KEYS.project(projectId), refetchType: "all" });
        qc.invalidateQueries({ queryKey: KEYS.milestone(projectId), refetchType: "all" });
        qc.invalidateQueries({ queryKey: KEYS.consensus(projectId), refetchType: "all" });
      }
    },
    [qc],
  );

  const run = useCallback(
    async <T>(fn: (onHash: (h: string) => void) => Promise<T>, projectId?: string) => {
      setTx({ status: "pending" });
      try {
        const result = await fn((hash) => setTx({ status: "confirming", hash }));
        setTx({ status: "success" });
        invalidate(projectId);
        return result;
      } catch (err: any) {
        setTx({ status: "error", error: err?.message ?? "Transaction failed" });
        throw err;
      }
    },
    [invalidate],
  );

  const reset = useCallback(() => setTx({ status: "idle" }), []);

  return { tx, run, reset };
}
