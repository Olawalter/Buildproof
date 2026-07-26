"use client";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Scale, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TxStatusBar } from "@/components/TxStatusBar";
import { ConsensusProgress } from "@/components/ConsensusProgress";
import { useProjectDetails, useConsensusStatus, useContractWrite } from "@/hooks/useProject";
import { useWallet } from "@/hooks/useWallet";
import { txSubmitAppeal, txReopenForEvidence } from "@/lib/contract";
import { toast } from "sonner";

export default function AppealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { address } = useWallet();
  const { data: project } = useProjectDetails(id);
  const { data: consensus } = useConsensusStatus(id);
  const { tx, run, reset } = useContractWrite();
  const [reason, setReason] = useState("");

  const isOwner = address?.toLowerCase() === project?.owner.toLowerCase();
  const isContractor =
    project?.contractor &&
    address?.toLowerCase() === project.contractor.toLowerCase();
  const canAct = isOwner || isContractor;

  const handleSubmitAppeal = async () => {
    if (!address || !canAct) return;
    if (reason.trim().length < 10) {
      toast.error("Appeal reason must be at least 10 characters.");
      return;
    }
    try {
      await run(
        (onHash) => txSubmitAppeal(address as `0x${string}`, id, reason, onHash),
        id,
      );
      toast.success("Appeal submitted successfully.");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to submit appeal.");
    }
  };

  const handleReopen = async () => {
    if (!address || !canAct) return;
    try {
      await run(
        (onHash) => txReopenForEvidence(address as `0x${string}`, id, onHash),
        id,
      );
      toast.success("Project reopened for additional evidence.");
      router.push(`/project/${id}/evidence`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to reopen project.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/project/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold text-white">File an Appeal</h1>
          <p className="text-white/40 text-sm">Project #{id} · {project?.title ?? ""}</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Current decision */}
        {consensus && <ConsensusProgress data={consensus} />}

        {/* Appeal reason */}
        {project?.status === "rejected" && canAct && (
          <Card className="border-amber-400/20">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Scale className="h-4 w-4 text-amber-400" />
                Appeal Reason
              </CardTitle>
              <CardDescription>
                Explain why the AI evaluation was incorrect and what additional evidence you will provide.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="The evaluation incorrectly concluded that electrical and plumbing certificates were missing. I have uploaded certified copies from NERC and COREN respectively. The occupancy permit issued by Lagos State was also submitted and should have been recognized…"
                rows={6}
              />
              <p className="text-xs text-white/30">Minimum 10 characters required.</p>

              <TxStatusBar tx={tx} onDismiss={reset} />

              <Button
                className="w-full"
                onClick={handleSubmitAppeal}
                disabled={
                  reason.trim().length < 10 ||
                  tx.status === "pending" ||
                  tx.status === "confirming"
                }
              >
                <Scale className="h-4 w-4" />
                {tx.status !== "idle" ? "Submitting Appeal…" : "Submit Appeal"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Reopen for evidence */}
        {project?.status === "appealed" && canAct && (
          <Card className="border-bp-orange/20">
            <CardHeader>
              <CardTitle className="text-base">Add New Evidence</CardTitle>
              <CardDescription>
                Reopen the project to submit additional certificates or documents before requesting re-evaluation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TxStatusBar tx={tx} onDismiss={reset} />
              <Button
                className="w-full"
                variant="outline"
                onClick={handleReopen}
                disabled={tx.status !== "idle"}
              >
                <RefreshCw className="h-4 w-4" />
                Reopen for Additional Evidence
              </Button>
            </CardContent>
          </Card>
        )}

        {!canAct && (
          <Card className="border-white/5">
            <CardContent className="p-4 text-center text-white/40 text-sm">
              Only the project owner or contractor can file an appeal.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
