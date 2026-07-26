"use client";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload, Plus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TxStatusBar } from "@/components/TxStatusBar";
import { useProjectDetails } from "@/hooks/useProject";
import { useContractWrite } from "@/hooks/useProject";
import { useWallet } from "@/hooks/useWallet";
import { txSubmitEvidence } from "@/lib/contract";
import { toast } from "sonner";
import type { EvidenceType } from "@/types";

const EVIDENCE_TYPES: { value: EvidenceType; label: string; desc: string }[] = [
  { value: "photo", label: "Photo", desc: "Construction photographs documenting work" },
  { value: "report", label: "Engineering Report", desc: "Structural/engineering assessment" },
  { value: "certificate", label: "Inspection Certificate", desc: "Certified inspection certificate" },
  { value: "permit", label: "Government Permit", desc: "Occupancy permit or government approval" },
  { value: "drawing", label: "Architectural Drawing", desc: "As-built or approved drawings" },
  { value: "other", label: "Dispute / Other", desc: "Owner counter-evidence or other document" },
];

export default function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { address } = useWallet();
  const { data: project } = useProjectDetails(id);
  const { tx, run, reset } = useContractWrite();

  const [evidenceType, setEvidenceType] = useState<EvidenceType>("certificate");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");

  const isOwner = address?.toLowerCase() === project?.owner.toLowerCase();
  const isContractor =
    project?.contractor &&
    address?.toLowerCase() === project.contractor.toLowerCase();

  // is_dispute=true means owner submitting counter-evidence
  const isDispute = evidenceType === "other" && isOwner;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) {
      toast.error("Connect your wallet first.");
      return;
    }
    if (!title.trim() || !url.trim() || !description.trim()) {
      toast.error("All fields are required.");
      return;
    }
    // Role enforcement is handled by the contract on-chain

    try {
      await run(
        (onHash) =>
          txSubmitEvidence(
            address as `0x${string}`,
            id,
            evidenceType,
            title,
            url,
            description,
            isDispute,
            onHash,
          ),
        id,
      );
      toast.success("Evidence submitted! Redirecting…");
      setTimeout(() => router.push(`/project/${id}`), 1200);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to submit evidence.");
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
          <h1 className="text-xl font-bold text-white">Submit Evidence</h1>
          <p className="text-white/40 text-sm">
            Project #{id} · {project?.title ?? ""}
          </p>
        </div>
      </div>

      {!isOwner && !isContractor && address && (
        <Card className="border-amber-500/20 mb-6">
          <CardContent className="p-4 text-amber-400/70 text-sm">
            Only the assigned project owner or contractor may submit evidence — the contract will reject unauthorized submissions.
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Type selector */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-bp-orange" />
              Evidence Type
            </CardTitle>
            <CardDescription>Select the type of evidence you are submitting.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {EVIDENCE_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setEvidenceType(t.value)}
                  className={`text-left p-3 rounded-xl border transition-all text-sm ${
                    evidenceType === t.value
                      ? "border-bp-orange/40 bg-bp-orange/8 text-bp-orange"
                      : "border-white/8 bg-white/3 text-white/50 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <p className="font-medium">{t.label}</p>
                  <p className="text-xs opacity-60 mt-0.5">{t.desc}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Evidence details */}
        <Card className={isDispute ? "border-red-400/20" : ""}>
          <CardHeader>
            <CardTitle className="text-base">
              {isDispute ? "Dispute Evidence Details" : "Evidence Details"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm text-white/60 mb-1.5">Title *</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isDispute ? "e.g. Structural Crack — East Wall" : "e.g. Electrical Inspection Certificate"}
                required
              />
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-1.5">Document URL *</label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://ipfs.io/ipfs/... or https://drive.google.com/..."
                type="url"
                required
              />
              <p className="text-xs text-white/25 mt-1">
                Link to the uploaded document, image, or certificate (IPFS, Google Drive, etc.)
              </p>
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-1.5">Description *</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  isDispute
                    ? "Describe the defect in detail: location, severity, whether it is structural or cosmetic…"
                    : "Describe what this evidence demonstrates and how it satisfies the inspection requirement…"
                }
                rows={4}
                required
              />
            </div>
          </CardContent>
        </Card>

        <TxStatusBar tx={tx} onDismiss={reset} />

        <div className="flex gap-3">
          <Button type="button" variant="outline" className="flex-1" asChild>
            <Link href={`/project/${id}`}>Cancel</Link>
          </Button>
          <Button
            type="submit"
            className={`flex-1 ${isDispute ? "bg-red-500 hover:bg-red-600" : ""}`}
            disabled={
              tx.status === "pending" ||
              tx.status === "confirming" ||
              !address
            }
          >
            <Upload className="h-4 w-4" />
            {tx.status === "pending" || tx.status === "confirming"
              ? "Submitting…"
              : isDispute
              ? "Submit Dispute Evidence"
              : "Submit Evidence"}
          </Button>
        </div>
      </form>
    </div>
  );
}
