/**
 * All intelligent contract interactions.
 * Every call routes through genlayer-js — no custom backend.
 * All functions return null/[] gracefully when no contract address is configured.
 */
import { TransactionStatus } from "genlayer-js/types";
import {
  getContractAddress,
  getReadClient,
  getWriteClient,
  getStudioUrl,
  createGenLayerClient,
} from "./genlayer";
import type {
  ProjectDetails,
  ProjectSummary,
  MilestoneStatus,
  ConsensusStatus,
} from "@/types";

// ─── Fee estimation (boilerplate pattern) ─────────────────────────────────────

type FeePresetLevel = "low" | "standard" | "high";

const PRESET_OPTIONS: Record<FeePresetLevel, Record<string, unknown>> = {
  low:      { appealRounds: 0n, rotations: [0n] },
  standard: { appealRounds: 1n, rotations: [0n, 0n] },
  high:     { appealRounds: 2n, rotations: [0n, 0n, 0n] },
};

function feesFromEstimate(estimate: any) {
  if (!estimate?.distribution) return undefined;
  const fees: any = { distribution: estimate.distribution };
  if (estimate.messageAllocations) fees.messageAllocations = estimate.messageAllocations;
  const fv = estimate.feeValue ?? estimate.fee_value;
  if (fv !== undefined) fees.feeValue = fv;
  return fees;
}

async function estimateFees(client: any, request: any, level: FeePresetLevel = "standard") {
  if (typeof client?.estimateTransactionFees !== "function") return undefined;
  const opts = PRESET_OPTIONS[level];
  const initial = await client.estimateTransactionFees(opts);
  let estimate = initial;
  if (typeof client.simulateWriteContract === "function" &&
      typeof client.estimateTransactionFeesFromSimulation === "function") {
    const sim = await client.simulateWriteContract({
      ...request, includeReceipt: true, value: request.value ?? 0n,
      fees: feesFromEstimate(initial),
    });
    estimate = await client.estimateTransactionFeesFromSimulation({ ...opts, simulation: sim });
  }
  return estimate;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type TxHash = Parameters<ReturnType<typeof getWriteClient>["waitForTransactionReceipt"]>[0]["hash"];

async function waitForReceipt(client: ReturnType<typeof getWriteClient>, hash: string) {
  const receipt = await client.waitForTransactionReceipt({
    hash: hash as TxHash,
    status: TransactionStatus.FINALIZED,
    interval: 4_000,
    retries: 60,
  });
  // Detect on-chain execution errors (contract assert failures).
  // GenLayer finalizes the tx but marks it ERROR — without this check the
  // frontend would show success even though no state changed.
  const r = receipt as any;
  const execResult: string = r?.txExecutionResultName ?? r?.txExecutionResult ?? "";
  if (String(execResult).toUpperCase().includes("ERROR")) {
    // Try to surface the [EXPECTED] message from the receipt
    const msgs: any[] = r?.messages ?? [];
    const errMsg = msgs.find((m: any) => m?.errorMessage || m?.message)?.errorMessage
      ?? msgs.find((m: any) => m?.errorMessage || m?.message)?.message
      ?? "Transaction was finalized but the contract rejected it.";
    throw new Error(errMsg);
  }
  return receipt;
}

function makeWriteClient(walletAddress: `0x${string}`) {
  const studioUrl = getStudioUrl();
  const config: any = { chain: undefined, account: walletAddress };
  if (studioUrl) config.endpoint = studioUrl;
  return getWriteClient(walletAddress);
}

// ─── Read Methods ─────────────────────────────────────────────────────────────

export async function readProjectDetails(projectId: string): Promise<ProjectDetails | null> {
  const addr = getContractAddress();
  if (!addr) return null;
  const client = getReadClient();
  return client.readContract({
    address: addr,
    functionName: "project_details",
    args: [projectId],
  }) as unknown as Promise<ProjectDetails>;
}

export async function readMilestoneStatus(projectId: string): Promise<MilestoneStatus | null> {
  const addr = getContractAddress();
  if (!addr) return null;
  const client = getReadClient();
  return client.readContract({
    address: addr,
    functionName: "milestone_status",
    args: [projectId],
  }) as unknown as Promise<MilestoneStatus>;
}

export async function readConsensusStatus(projectId: string): Promise<ConsensusStatus | null> {
  const addr = getContractAddress();
  if (!addr) return null;
  const client = getReadClient();
  return client.readContract({
    address: addr,
    functionName: "consensus_status",
    args: [projectId],
  }) as unknown as Promise<ConsensusStatus>;
}

export async function readAllProjects(): Promise<ProjectSummary[]> {
  const addr = getContractAddress();
  if (!addr) return [];
  const client = getReadClient();
  return client.readContract({
    address: addr,
    functionName: "get_all_projects",
    args: [],
  }) as unknown as Promise<ProjectSummary[]>;
}

export async function readOwnerProjects(ownerAddress: string): Promise<string[]> {
  const addr = getContractAddress();
  if (!addr) return [];
  const client = getReadClient();
  return client.readContract({
    address: addr,
    functionName: "get_owner_projects",
    args: [ownerAddress],
  }) as unknown as Promise<string[]>;
}

export async function readContractorProjects(contractorAddress: string): Promise<string[]> {
  const addr = getContractAddress();
  if (!addr) return [];
  const client = getReadClient();
  return client.readContract({
    address: addr,
    functionName: "get_contractor_projects",
    args: [contractorAddress],
  }) as unknown as Promise<string[]>;
}

// ─── Write Methods ────────────────────────────────────────────────────────────

export async function txCreateProject(
  walletAddress: `0x${string}`,
  title: string,
  description: string,
  location: string,
  contractValue: bigint,
  inspectionNames: string[],
  contractorAddress: string,
  onTxHash?: (hash: string) => void,
): Promise<{ projectId: string; txHash: string }> {
  const addr = getContractAddress();
  if (!addr) throw new Error("[EXPECTED] Contract address not configured.");
  const client = getWriteClient(walletAddress);
  const request = {
    address: addr,
    functionName: "create_project",
    args: [title, description, location, contractValue, inspectionNames, contractorAddress],
    value: 0n,
  };
  const feeEst = await estimateFees(client, request);
  const hash = await client.writeContract({
    ...request,
    ...(feeEst ? { fees: feesFromEstimate(feeEst) } : {}),
  });
  onTxHash?.(hash);
  const receipt = await waitForReceipt(client, hash);
  const data = receipt as unknown as { data?: Record<string, unknown> };
  let projectId = String(data?.data?.["returnValue"] ?? data?.data?.["project_id"] ?? "");

  // Receipt doesn't always surface the return value — fall back to owner's project list
  if (!projectId) {
    const readClient = getReadClient();
    const ids = await readClient.readContract({
      address: addr,
      functionName: "get_owner_projects",
      args: [walletAddress],
    }) as unknown as string[];
    projectId = Array.isArray(ids) && ids.length > 0 ? ids[ids.length - 1] : "";
  }

  return { projectId, txHash: hash };
}

export async function txAcceptProject(
  walletAddress: `0x${string}`,
  projectId: string,
  onTxHash?: (hash: string) => void,
): Promise<string> {
  const addr = getContractAddress();
  if (!addr) throw new Error("[EXPECTED] Contract address not configured.");
  const client = getWriteClient(walletAddress);
  const request = { address: addr, functionName: "accept_project", args: [projectId], value: 0n };
  const feeEst = await estimateFees(client, request);
  const hash = await client.writeContract({
    ...request,
    ...(feeEst ? { fees: feesFromEstimate(feeEst) } : {}),
  });
  onTxHash?.(hash);
  await waitForReceipt(client, hash);
  return hash;
}

export async function txDepositEscrow(
  walletAddress: `0x${string}`,
  projectId: string,
  amount: bigint,
  onTxHash?: (hash: string) => void,
): Promise<string> {
  const addr = getContractAddress();
  if (!addr) throw new Error("[EXPECTED] Contract address not configured.");
  const client = getWriteClient(walletAddress);
  const request = { address: addr, functionName: "deposit_escrow", args: [projectId, amount], value: 0n };
  const feeEst = await estimateFees(client, request);
  const hash = await client.writeContract({
    ...request,
    ...(feeEst ? { fees: feesFromEstimate(feeEst) } : {}),
  });
  onTxHash?.(hash);
  await waitForReceipt(client, hash);
  return hash;
}

export async function txSubmitEvidence(
  walletAddress: `0x${string}`,
  projectId: string,
  evidenceType: string,
  title: string,
  url: string,
  description: string,
  isDispute: boolean,
  onTxHash?: (hash: string) => void,
): Promise<string> {
  const addr = getContractAddress();
  if (!addr) throw new Error("[EXPECTED] Contract address not configured.");
  const client = getWriteClient(walletAddress);
  const request = {
    address: addr,
    functionName: "submit_evidence",
    args: [projectId, evidenceType, title, url, description, isDispute],
    value: 0n,
  };
  const feeEst = await estimateFees(client, request);
  const hash = await client.writeContract({
    ...request,
    ...(feeEst ? { fees: feesFromEstimate(feeEst) } : {}),
  });
  onTxHash?.(hash);
  await waitForReceipt(client, hash);
  return hash;
}

export async function txRequestInspection(
  walletAddress: `0x${string}`,
  projectId: string,
  onTxHash?: (hash: string) => void,
): Promise<string> {
  const addr = getContractAddress();
  if (!addr) throw new Error("[EXPECTED] Contract address not configured.");
  const client = getWriteClient(walletAddress);
  const request = { address: addr, functionName: "request_inspection", args: [projectId], value: 0n };
  const feeEst = await estimateFees(client, request);
  const hash = await client.writeContract({
    ...request,
    ...(feeEst ? { fees: feesFromEstimate(feeEst) } : {}),
  });
  onTxHash?.(hash);
  await waitForReceipt(client, hash);
  return hash;
}

export async function txEvaluateCompletion(
  walletAddress: `0x${string}`,
  projectId: string,
  onTxHash?: (hash: string) => void,
): Promise<string> {
  const addr = getContractAddress();
  if (!addr) throw new Error("[EXPECTED] Contract address not configured.");
  const client = getWriteClient(walletAddress);
  const request = { address: addr, functionName: "evaluate_completion", args: [projectId], value: 0n };
  const feeEst = await estimateFees(client, request);
  const hash = await client.writeContract({
    ...request,
    ...(feeEst ? { fees: feesFromEstimate(feeEst) } : {}),
  });
  onTxHash?.(hash);
  await waitForReceipt(client, hash);
  return hash;
}

export async function txSubmitAppeal(
  walletAddress: `0x${string}`,
  projectId: string,
  reason: string,
  onTxHash?: (hash: string) => void,
): Promise<string> {
  const addr = getContractAddress();
  if (!addr) throw new Error("[EXPECTED] Contract address not configured.");
  const client = getWriteClient(walletAddress);
  const request = { address: addr, functionName: "submit_appeal", args: [projectId, reason], value: 0n };
  const feeEst = await estimateFees(client, request);
  const hash = await client.writeContract({
    ...request,
    ...(feeEst ? { fees: feesFromEstimate(feeEst) } : {}),
  });
  onTxHash?.(hash);
  await waitForReceipt(client, hash);
  return hash;
}

export async function txReopenForEvidence(
  walletAddress: `0x${string}`,
  projectId: string,
  onTxHash?: (hash: string) => void,
): Promise<string> {
  const addr = getContractAddress();
  if (!addr) throw new Error("[EXPECTED] Contract address not configured.");
  const client = getWriteClient(walletAddress);
  const request = { address: addr, functionName: "reopen_for_evidence", args: [projectId], value: 0n };
  const feeEst = await estimateFees(client, request);
  const hash = await client.writeContract({
    ...request,
    ...(feeEst ? { fees: feesFromEstimate(feeEst) } : {}),
  });
  onTxHash?.(hash);
  await waitForReceipt(client, hash);
  return hash;
}

export async function txFinalizeEscrow(
  walletAddress: `0x${string}`,
  projectId: string,
  onTxHash?: (hash: string) => void,
): Promise<string> {
  const addr = getContractAddress();
  if (!addr) throw new Error("[EXPECTED] Contract address not configured.");
  const client = getWriteClient(walletAddress);
  const request = { address: addr, functionName: "finalize_escrow", args: [projectId], value: 0n };
  const feeEst = await estimateFees(client, request);
  const hash = await client.writeContract({
    ...request,
    ...(feeEst ? { fees: feesFromEstimate(feeEst) } : {}),
  });
  onTxHash?.(hash);
  await waitForReceipt(client, hash);
  return hash;
}

export async function txCancelProject(
  walletAddress: `0x${string}`,
  projectId: string,
  onTxHash?: (hash: string) => void,
): Promise<string> {
  const addr = getContractAddress();
  if (!addr) throw new Error("[EXPECTED] Contract address not configured.");
  const client = getWriteClient(walletAddress);
  const request = { address: addr, functionName: "cancel_project", args: [projectId], value: 0n };
  const feeEst = await estimateFees(client, request);
  const hash = await client.writeContract({
    ...request,
    ...(feeEst ? { fees: feesFromEstimate(feeEst) } : {}),
  });
  onTxHash?.(hash);
  await waitForReceipt(client, hash);
  return hash;
}
