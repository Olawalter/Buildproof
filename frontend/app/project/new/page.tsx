"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Building2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TxStatusBar } from "@/components/TxStatusBar";
import { useWallet } from "@/hooks/useWallet";
import { useContractWrite } from "@/hooks/useProject";
import { txCreateProject } from "@/lib/contract";
import { toast } from "sonner";

const DEFAULT_INSPECTIONS = [
  "Structural Inspection",
  "Electrical Inspection",
  "Plumbing Inspection",
  "Fire Safety Inspection",
];

export default function NewProjectPage() {
  const router = useRouter();
  const { address, isConnected } = useWallet();
  const { tx, run, reset } = useContractWrite();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [contractValue, setContractValue] = useState("");
  const [contractorAddress, setContractorAddress] = useState("");
  const [inspections, setInspections] = useState<string[]>(DEFAULT_INSPECTIONS);
  const [newInspection, setNewInspection] = useState("");

  const addInspection = () => {
    const trimmed = newInspection.trim();
    if (trimmed && !inspections.includes(trimmed)) {
      setInspections((prev) => [...prev, trimmed]);
      setNewInspection("");
    }
  };

  const removeInspection = (idx: number) => {
    setInspections((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected || !address) {
      toast.error("Please connect your wallet first.");
      return;
    }
    if (!title || !description || !location || !contractValue || !contractorAddress) {
      toast.error("Please fill in all required fields.");
      return;
    }
    if (!contractorAddress.startsWith("0x") || contractorAddress.length !== 42) {
      toast.error("Contractor address must be a valid 0x… Ethereum address.");
      return;
    }
    if (inspections.length === 0) {
      toast.error("Add at least one inspection requirement.");
      return;
    }

    try {
      // Convert decimal GEN → wei (same logic as deposit form)
      const wei = BigInt(Math.round(Number(contractValue) * 1e9)) * BigInt(1e9);
      const { projectId } = await run(
        (onHash) =>
          txCreateProject(
            address,
            title,
            description,
            location,
            wei,
            inspections,
            contractorAddress,
            onHash,
          ),
      );
      toast.success(`Project created! ID: ${projectId}`);
      router.push(`/project/${projectId}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create project.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold text-white">Create Construction Project</h1>
          <p className="text-white/40 text-sm">Set up escrow and define completion requirements.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-bp-orange" />
              Project Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm text-white/60 mb-1.5">Project Title *</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Lagos Commercial Tower — Phase 2"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-1.5">Description *</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the scope of work, key deliverables, and timeline…"
                rows={3}
                required
              />
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-1.5">Location *</label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Victoria Island, Lagos, Nigeria"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-1.5">Contractor Wallet Address *</label>
              <Input
                value={contractorAddress}
                onChange={(e) => setContractorAddress(e.target.value)}
                placeholder="0x… assigned contractor's wallet"
                required
              />
              <p className="text-xs text-white/25 mt-1">
                Only this address will be able to accept the project on-chain.
              </p>
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-1.5">
                Contract Value (GEN) *
              </label>
              <div className="relative">
                <Input
                  type="number"
                  min="0.000001"
                  step="0.01"
                  value={contractValue}
                  onChange={(e) => setContractValue(e.target.value)}
                  placeholder="e.g. 5"
                  className="pr-14"
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/40 font-medium pointer-events-none">
                  GEN
                </span>
              </div>
              <p className="text-xs text-white/25 mt-1">
                Enter the amount in GEN (e.g. 5 = 5 GEN). Converted to wei automatically.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Inspection Requirements */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inspection Requirements</CardTitle>
            <CardDescription>
              Define what inspections must be certified before payment is released.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {inspections.map((insp, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 rounded-lg border border-white/8 bg-white/3 px-3 py-2 text-sm text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-bp-orange/60" />
                  {insp}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeInspection(idx)}
                  className="h-9 w-9 text-white/30 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}

            <div className="flex gap-2 mt-2">
              <Input
                value={newInspection}
                onChange={(e) => setNewInspection(e.target.value)}
                placeholder="Add inspection requirement…"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addInspection())}
              />
              <Button type="button" variant="outline" size="icon" onClick={addInspection}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <TxStatusBar tx={tx} onDismiss={reset} />

        <div className="flex gap-3">
          <Button type="button" variant="outline" asChild className="flex-1">
            <Link href="/dashboard">Cancel</Link>
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={tx.status === "pending" || tx.status === "confirming" || !isConnected}
          >
            {tx.status === "pending" || tx.status === "confirming"
              ? "Creating Project…"
              : "Create Project & Lock Escrow Setup"}
          </Button>
        </div>

        {!isConnected && (
          <p className="text-center text-sm text-amber-400/80">
            Connect your wallet to create a project.
          </p>
        )}
      </form>
    </div>
  );
}
