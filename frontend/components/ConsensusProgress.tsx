"use client";
import { ShieldCheck, ShieldX, Loader2, Users, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { ConsensusStatus } from "@/types";

interface ConsensusProgressProps {
  data: ConsensusStatus;
}

export function ConsensusProgress({ data }: ConsensusProgressProps) {
  if (!data.has_decision) {
    const isPending =
      data.status === "under_review" || data.status === "consensus_pending";

    return (
      <Card>
        <CardContent className="p-8 text-center">
          {isPending ? (
            <div className="space-y-4">
              <div className="relative mx-auto h-16 w-16">
                <div className="absolute inset-0 rounded-full border-2 border-bp-orange/20 animate-ping" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-bp-orange/10 border border-bp-orange/30">
                  <Users className="h-7 w-7 text-bp-orange animate-pulse" />
                </div>
              </div>
              <div>
                <p className="text-white font-semibold">Validators Evaluating</p>
                <p className="text-white/40 text-sm mt-1">
                  GenLayer AI validators are independently reviewing the evidence.
                  This may take a few minutes.
                </p>
              </div>
              <div className="flex items-center justify-center gap-1.5 text-xs text-white/30">
                <Loader2 className="h-3 w-3 animate-spin" />
                Awaiting consensus…
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Users className="h-10 w-10 text-white/20 mx-auto" />
              <p className="text-white/50 text-sm">
                No consensus decision yet.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const passed = data.passed!;
  const confidence = data.confidence_pct ?? 0;
  const criticalDefects = data.critical_defects ?? 0;
  const verificationFailed = data.verification_failed === true;
  const verifiedInspections = data.verified_inspections;
  const totalInspections = data.total_inspections;

  return (
    <Card className={cn(
      "relative overflow-hidden",
      passed
        ? "border-emerald-500/20"
        : "border-red-500/20",
    )}>
      <div
        className={cn(
          "absolute inset-0 pointer-events-none",
          passed
            ? "bg-gradient-to-br from-emerald-500/5 to-transparent"
            : "bg-gradient-to-br from-red-500/5 to-transparent",
        )}
      />
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Consensus Decision</CardTitle>
          <div
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border",
              passed
                ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
                : "text-red-400 bg-red-400/10 border-red-400/20",
            )}
          >
            {passed ? (
              <ShieldCheck className="h-3.5 w-3.5" />
            ) : (
              <ShieldX className="h-3.5 w-3.5" />
            )}
            {passed ? "APPROVED" : verificationFailed ? "VERIFICATION FAILED" : "REJECTED"}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Verification failure banner — official records could not be authenticated */}
        {verificationFailed && (
          <div className="rounded-xl bg-amber-500/8 border border-amber-500/20 p-4">
            <p className="text-sm text-amber-400 font-medium mb-1">
              Official records could not be verified
              {typeof verifiedInspections === "number" && typeof totalInspections === "number"
                ? ` — ${verifiedInspections}/${totalInspections} inspections confirmed in government registries`
                : ""}
            </p>
            <p className="text-xs text-white/50 leading-relaxed">
              Escrow payout is blocked (fail-closed). Submit evidence with valid official
              permit/certificate numbers and request a new evaluation, or appeal the decision.
            </p>
          </div>
        )}
        {/* Confidence */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-white/60">Validator Confidence</span>
            <span className="font-bold text-white">{confidence}%</span>
          </div>
          <Progress
            value={confidence}
            className={cn(
              "h-2.5",
              passed ? "[&>div]:bg-emerald-500" : "[&>div]:bg-red-500",
            )}
          />
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/5 border border-white/5 p-3 text-center">
            <p className="text-xs text-white/40 mb-1">Critical Defects</p>
            <p
              className={cn(
                "text-2xl font-bold",
                criticalDefects === 0 ? "text-emerald-400" : "text-red-400",
              )}
            >
              {criticalDefects}
            </p>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/5 p-3 text-center">
            <p className="text-xs text-white/40 mb-1">Occupancy Permit</p>
            <p
              className={cn(
                "text-sm font-semibold mt-1",
                data.occupancy_verified ? "text-emerald-400" : "text-amber-400",
              )}
            >
              {data.occupancy_verified ? "Verified" : "Not Verified"}
            </p>
          </div>
        </div>

        {/* Reason */}
        {data.reason && (
          <div className="rounded-xl bg-white/3 border border-white/5 p-4">
            <p className="text-xs text-white/40 mb-2 font-medium uppercase tracking-wider">
              AI Adjudicator Reasoning
            </p>
            <p className="text-sm text-white/70 leading-relaxed">{data.reason}</p>
          </div>
        )}

        {/* Appeals count */}
        {(data.appeal_count ?? 0) > 0 && (
          <div className="flex items-center gap-2 text-xs text-amber-400/70 bg-amber-400/5 border border-amber-400/10 rounded-lg px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            {data.appeal_count} appeal{data.appeal_count === 1 ? "" : "s"} filed
          </div>
        )}
      </CardContent>
    </Card>
  );
}
