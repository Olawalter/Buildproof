"use client";
import { use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  ClipboardCheck,
  Zap,
  Banknote,
  Scale,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusChip } from "@/components/StatusChip";
import { EscrowBalance } from "@/components/EscrowBalance";
import { InspectionTimeline } from "@/components/InspectionTimeline";
import { EvidenceViewer } from "@/components/EvidenceViewer";
import { ConsensusProgress } from "@/components/ConsensusProgress";
import { AppealCard } from "@/components/AppealCard";
import { TxStatusBar } from "@/components/TxStatusBar";
import {
  useProjectDetails,
  useMilestoneStatus,
  useConsensusStatus,
  useContractWrite,
} from "@/hooks/useProject";
import { useWallet } from "@/hooks/useWallet";
import {
  txAcceptProject,
  txDepositEscrow,
  txFinalizeEscrow,
  txCancelProject,
  txRequestInspection,
  txEvaluateCompletion,
} from "@/lib/contract";
import { shortAddress, formatWei } from "@/lib/utils";
import { toast } from "sonner";
import { useState } from "react";
import { Input } from "@/components/ui/input";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { address } = useWallet();
  const { tx, run, reset } = useContractWrite();
  const [escrowAmount, setEscrowAmount] = useState("");
  const [showDepositForm, setShowDepositForm] = useState(false);

  const { data: project, isLoading: projectLoading, refetch: refetchProject } =
    useProjectDetails(id);
  const { data: milestone, isLoading: milestoneLoading } = useMilestoneStatus(id);
  const { data: consensus } = useConsensusStatus(id);

  if (projectLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-48 bg-white/5 rounded-lg" />
          <div className="h-48 bg-white/3 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 text-center">
        <p className="text-white/40">Project not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/dashboard">Back to Dashboard</Link>
        </Button>
      </div>
    );
  }

  const isOwner = address?.toLowerCase() === project.owner.toLowerCase();
  const isAssignedContractor =
    project.contractor &&
    address?.toLowerCase() === project.contractor.toLowerCase();
  const isParty = isOwner || isAssignedContractor;

  const handleAction = async (label: string, fn: () => Promise<string>) => {
    try {
      await run(() => fn(), id);
      toast.success(`${label} successful!`);
    } catch (err: any) {
      toast.error(err?.message ?? `${label} failed.`);
    }
  };

  // Whether escrow is deposited but project still in ACCEPTED (needs finalize_escrow)
  const escrowDepositedButPending =
    project.status === "accepted" &&
    BigInt(project.escrow_deposited || "0") > 0n;

  return (
    <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-white">{project.title}</h1>
              <StatusChip status={project.status} />
            </div>
            <p className="text-white/40 text-sm">
              ID #{project.id} · {project.location}
            </p>
          </div>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetchProject()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Project metadata */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <p className="text-white/60 text-sm leading-relaxed">{project.description}</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-white/30 mb-0.5">Owner</p>
                  <p className="text-white/80 font-mono text-xs">{shortAddress(project.owner)}</p>
                </div>
                <div>
                  <p className="text-xs text-white/30 mb-0.5">Assigned Contractor</p>
                  <p className="text-white/80 font-mono text-xs">
                    {project.contractor ? shortAddress(project.contractor) : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Evidence */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Evidence ({project.evidence_count})</CardTitle>
                {isParty && project.status !== "finalized" && project.status !== "cancelled" && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/project/${id}/evidence`}>
                      <Upload className="h-3.5 w-3.5" />
                      Submit Evidence
                    </Link>
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {milestoneLoading ? (
                <div className="h-24 animate-pulse bg-white/3 rounded-xl" />
              ) : (
                <EvidenceViewer evidence={milestone?.evidence ?? []} />
              )}
            </CardContent>
          </Card>

          {/* Inspections */}
          {!milestoneLoading && milestone && (
            <InspectionTimeline
              inspections={milestone.inspections}
              allPassed={project.status === "finalized" && project.payment_released && consensus?.passed === true}
              allRejected={project.status === "rejected" || (project.status === "finalized" && consensus?.passed === false)}
            />
          )}

          {/* Appeals */}
          {consensus && consensus.appeals.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
                Appeals ({consensus.appeals.length})
              </h3>
              <div className="space-y-3">
                {consensus.appeals.map((ap, idx) => (
                  <AppealCard key={ap.id} appeal={ap} index={idx} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Escrow */}
          <EscrowBalance
            contractValue={project.contract_value}
            escrowDeposited={project.escrow_deposited}
            paymentReleased={project.payment_released}
          />

          {/* Consensus */}
          {consensus && <ConsensusProgress data={consensus} />}

          {/* Action Panel */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-white/60 uppercase tracking-wider">
                Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <TxStatusBar tx={tx} onDismiss={reset} />

              {/* Assigned contractor accepts */}
              {project.status === "draft" && isAssignedContractor && (
                <Button
                  className="w-full"
                  onClick={() =>
                    handleAction("Accept Project", () =>
                      txAcceptProject(address as `0x${string}`, id),
                    )
                  }
                  disabled={tx.status === "pending" || tx.status === "confirming"}
                >
                  Accept Project
                </Button>
              )}

              {/* Owner deposits escrow (DRAFT or ACCEPTED, before escrow is funded) */}
              {(project.status === "draft" || project.status === "accepted") &&
                isOwner &&
                BigInt(project.escrow_deposited || "0") === 0n && (
                <>
                  {showDepositForm ? (
                    <div className="space-y-2">
                      <div className="relative">
                        <Input
                          type="number"
                          min="0.000001"
                          step="0.01"
                          placeholder="e.g. 10"
                          value={escrowAmount}
                          onChange={(e) => setEscrowAmount(e.target.value)}
                          className="pr-14"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/40 font-medium pointer-events-none">
                          GEN
                        </span>
                      </div>
                      <p className="text-xs text-white/30">
                        Contract value: {formatWei(project.contract_value)}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          className="flex-1"
                          size="sm"
                          disabled={!escrowAmount || Number(escrowAmount) <= 0 || tx.status !== "idle"}
                          onClick={() => {
                            const wei = BigInt(Math.round(Number(escrowAmount) * 1e9)) * BigInt(1e9);
                            handleAction("Deposit Escrow", () =>
                              txDepositEscrow(address as `0x${string}`, id, wei),
                            );
                          }}
                        >
                          <Banknote className="h-3.5 w-3.5" />
                          Deposit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowDepositForm(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      className="w-full"
                      variant="gold"
                      onClick={() => setShowDepositForm(true)}
                    >
                      <Banknote className="h-4 w-4" />
                      Deposit Escrow
                    </Button>
                  )}
                </>
              )}

              {/* Finalize escrow: escrow deposited before contractor accepted */}
              {escrowDepositedButPending && isParty && (
                <Button
                  className="w-full"
                  variant="gold"
                  onClick={() =>
                    handleAction("Finalize Escrow", () =>
                      txFinalizeEscrow(address as `0x${string}`, id),
                    )
                  }
                  disabled={tx.status !== "idle"}
                >
                  <Banknote className="h-4 w-4" />
                  Finalize Escrow Activation
                </Button>
              )}

              {/* Either party requests inspection */}
              {project.status === "evidence_submitted" && isParty && (
                <Button
                  className="w-full"
                  onClick={() =>
                    handleAction("Request Inspection", () =>
                      txRequestInspection(address as `0x${string}`, id),
                    )
                  }
                  disabled={tx.status !== "idle"}
                >
                  <ClipboardCheck className="h-4 w-4" />
                  Request AI Inspection
                </Button>
              )}

              {/* Either party triggers AI evaluation */}
              {project.status === "under_review" && isParty && (
                <Button
                  className="w-full"
                  onClick={() =>
                    handleAction("Evaluate Completion", () =>
                      txEvaluateCompletion(address as `0x${string}`, id),
                    )
                  }
                  disabled={tx.status !== "idle"}
                >
                  <Zap className="h-4 w-4" />
                  Trigger AI Evaluation
                </Button>
              )}

              {/* Payment is auto-released by evaluate_completion — no manual button needed */}
              {project.status === "finalized" && (
                <div className="rounded-lg border border-green-500/20 bg-green-500/8 px-3 py-2 text-xs text-green-400 text-center">
                  {project.payment_released
                    ? "Escrow auto-transferred on evaluation."
                    : "Project finalized."}
                </div>
              )}

              {/* Either party files appeal after rejection */}
              {project.status === "rejected" && isParty && (
                <Button className="w-full" variant="outline" asChild>
                  <Link href={`/project/${id}/appeal`}>
                    <Scale className="h-4 w-4" />
                    File Appeal
                  </Link>
                </Button>
              )}

              {/* Submit more evidence after appeal */}
              {project.status === "appealed" && isParty && (
                <Button className="w-full" variant="outline" asChild>
                  <Link href={`/project/${id}/evidence`}>
                    <Upload className="h-4 w-4" />
                    Submit Additional Evidence
                  </Link>
                </Button>
              )}

              {/* Owner cancels stalled project */}
              {["draft", "accepted", "escrowed"].includes(project.status) && isOwner && (
                <Button
                  className="w-full"
                  variant="ghost"
                  onClick={() =>
                    handleAction("Cancel Project", () =>
                      txCancelProject(address as `0x${string}`, id),
                    )
                  }
                  disabled={tx.status !== "idle"}
                >
                  <XCircle className="h-4 w-4" />
                  Cancel Project
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
