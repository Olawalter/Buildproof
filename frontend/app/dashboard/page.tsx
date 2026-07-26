"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, Building2, Hammer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectCard } from "@/components/ProjectCard";
import { useWallet } from "@/hooks/useWallet";
import { useAllProjects, useOwnerProjects, useContractorProjects } from "@/hooks/useProject";
import { readProjectDetails, readAllProjects } from "@/lib/contract";
import { getContractAddress } from "@/lib/genlayer";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";

type Tab = "all" | "owner" | "contractor";

export default function DashboardPage() {
  const { address, isConnected } = useWallet();
  const [tab, setTab] = useState<Tab>("all");

  const { data: allProjects = [], isLoading: allLoading, refetch } = useAllProjects();
  const { data: ownerIds = [] } = useOwnerProjects(address ?? null);
  const { data: contractorIds = [] } = useContractorProjects(address ?? null);

  // Fetch project details for owner/contractor tabs
  const { data: ownerProjects = [], isLoading: ownerLoading } = useQuery({
    queryKey: ["ownerProjectDetails", ownerIds.join(",")],
    queryFn: () => Promise.all(ownerIds.map((id) => readProjectDetails(id))),
    enabled: ownerIds.length > 0,
  });

  const { data: contractorProjects = [], isLoading: contractorLoading } = useQuery({
    queryKey: ["contractorProjectDetails", contractorIds.join(",")],
    queryFn: () => Promise.all(contractorIds.map((id) => readProjectDetails(id))),
    enabled: contractorIds.length > 0,
  });

  const projects =
    tab === "owner"
      ? ownerProjects
      : tab === "contractor"
      ? contractorProjects
      : allProjects;

  const isLoading =
    tab === "owner" ? ownerLoading : tab === "contractor" ? contractorLoading : allLoading;

  const TABS = [
    { id: "all" as Tab, label: "All Projects", icon: Building2 },
    { id: "owner" as Tab, label: "As Owner", icon: Building2, count: ownerIds.length },
    { id: "contractor" as Tab, label: "As Contractor", icon: Hammer, count: contractorIds.length },
  ];

  const contractConfigured = !!getContractAddress();

  return (
    <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
      {/* Setup banner when no contract address */}
      {!contractConfigured && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />
          <div>
            <span className="font-semibold text-yellow-200">Contract not configured.</span>{" "}
            Set <code className="rounded bg-yellow-400/10 px-1 font-mono text-xs">NEXT_PUBLIC_CONTRACT_ADDRESS</code> in{" "}
            <code className="rounded bg-yellow-400/10 px-1 font-mono text-xs">.env.local</code> after deploying your
            BuildProof contract to StudioNet, then restart the dev server.
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-white/40 text-sm mt-1">
            Manage and track your construction escrow projects.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {isConnected && (
            <Button asChild>
              <Link href="/project/new">
                <Plus className="h-4 w-4" />
                New Project
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 p-1 rounded-xl bg-white/4 border border-white/8 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              tab === t.id
                ? "bg-white/10 text-white shadow-sm"
                : "text-white/50 hover:text-white"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="ml-1 text-xs bg-bp-orange/20 text-bp-orange rounded-full px-1.5 py-0.5">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {!isConnected && tab !== "all" ? (
        <div className="text-center py-20">
          <Building2 className="h-12 w-12 text-white/10 mx-auto mb-4" />
          <p className="text-white/50 mb-4">Connect your wallet to view your projects.</p>
          <Button asChild variant="outline">
            <Link href="/wallet">Connect Wallet</Link>
          </Button>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-48 rounded-2xl bg-white/3 border border-white/5 animate-pulse"
            />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20">
          <Building2 className="h-12 w-12 text-white/10 mx-auto mb-4" />
          <p className="text-white/40 mb-2">No projects found.</p>
          {tab === "all" && (
            <Button asChild className="mt-4">
              <Link href="/project/new">
                <Plus className="h-4 w-4" />
                Create First Project
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {(projects as (typeof projects[number] | null)[]).filter(Boolean).map((p) => (
            <ProjectCard key={(p as any).id} project={p as any} />
          ))}
        </div>
      )}
    </div>
  );
}
