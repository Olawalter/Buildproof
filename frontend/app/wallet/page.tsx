"use client";
import {
  Wallet,
  CheckCircle2,
  XCircle,
  Building2,
  Hammer,
  Copy,
  LogOut,
  Network,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWallet } from "@/hooks/useWallet";
import { useOwnerProjects, useContractorProjects } from "@/hooks/useProject";
import { shortAddress } from "@/lib/utils";
import { toast } from "sonner";

const NETWORK = process.env.NEXT_PUBLIC_NETWORK || "studionet";
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "Not configured";

export default function WalletPage() {
  const { address, isConnected, isConnecting, role, setRole, connect, disconnect } =
    useWallet();
  const { data: ownerProjects = [] } = useOwnerProjects(address ?? null);
  const { data: contractorProjects = [] } = useContractorProjects(address ?? null);

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast.success("Address copied to clipboard.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Wallet</h1>
        <p className="text-white/40 text-sm mt-1">
          Manage your wallet connection and account settings.
        </p>
      </div>

      {/* Connection status */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-xl border ${
                  isConnected
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <Wallet
                  className={`h-6 w-6 ${isConnected ? "text-emerald-400" : "text-white/40"}`}
                />
              </div>
              <div>
                <p className="font-medium text-white">
                  {isConnected ? "Wallet Connected" : "No Wallet Connected"}
                </p>
                {isConnected && address && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-sm text-white/50 font-mono">
                      {shortAddress(address)}
                    </p>
                    <button
                      onClick={copyAddress}
                      className="text-white/30 hover:text-white/60 transition-colors"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isConnected ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <Button variant="ghost" size="sm" onClick={disconnect}>
                    <LogOut className="h-3.5 w-3.5" />
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button onClick={connect} disabled={isConnecting}>
                  {isConnecting ? "Connecting…" : "Connect Wallet"}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Network info */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Network className="h-4 w-4 text-bp-orange" />
            Network Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-white/50">Network</span>
            <span className="text-bp-orange font-medium uppercase">{NETWORK}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-white/50 shrink-0">Contract Address</span>
            <span className="text-white/70 font-mono text-xs truncate">{CONTRACT_ADDRESS}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/50">Protocol</span>
            <span className="text-white/70">GenLayer Intelligent Contracts</span>
          </div>
        </CardContent>
      </Card>

      {/* Role selector */}
      {isConnected && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Primary Role</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setRole("owner")}
                className={`flex items-center gap-3 rounded-xl border p-4 transition-all text-left ${
                  role === "owner"
                    ? "border-bp-orange/40 bg-bp-orange/8"
                    : "border-white/8 bg-white/3 hover:bg-white/5"
                }`}
              >
                <Building2
                  className={`h-5 w-5 ${role === "owner" ? "text-bp-orange" : "text-white/40"}`}
                />
                <div>
                  <p
                    className={`font-medium text-sm ${
                      role === "owner" ? "text-bp-orange" : "text-white/70"
                    }`}
                  >
                    Property Owner
                  </p>
                  <p className="text-xs text-white/30 mt-0.5">Create projects, deposit escrow</p>
                </div>
              </button>
              <button
                onClick={() => setRole("contractor")}
                className={`flex items-center gap-3 rounded-xl border p-4 transition-all text-left ${
                  role === "contractor"
                    ? "border-blue-400/40 bg-blue-400/8"
                    : "border-white/8 bg-white/3 hover:bg-white/5"
                }`}
              >
                <Hammer
                  className={`h-5 w-5 ${role === "contractor" ? "text-blue-400" : "text-white/40"}`}
                />
                <div>
                  <p
                    className={`font-medium text-sm ${
                      role === "contractor" ? "text-blue-400" : "text-white/70"
                    }`}
                  >
                    Contractor
                  </p>
                  <p className="text-xs text-white/30 mt-0.5">Accept projects, submit evidence</p>
                </div>
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {isConnected && (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-white">{ownerProjects.length}</p>
              <p className="text-xs text-white/40 mt-1">Projects as Owner</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-white">{contractorProjects.length}</p>
              <p className="text-xs text-white/40 mt-1">Projects as Contractor</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
