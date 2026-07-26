"use client";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { shortAddress } from "@/lib/utils";
import type { AppealRecord } from "@/types";

interface AppealCardProps {
  appeal: AppealRecord;
  index: number;
}

export function AppealCard({ appeal, index }: AppealCardProps) {
  return (
    <Card className={appeal.resolved ? "border-emerald-500/15" : "border-amber-400/20"}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle
              className={`h-4 w-4 ${appeal.resolved ? "text-emerald-400" : "text-amber-400"}`}
            />
            <span className="text-sm font-medium text-white">Appeal #{index + 1}</span>
          </div>
          {appeal.resolved ? (
            <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full">
              <CheckCircle2 className="h-3 w-3" />
              Resolved
            </span>
          ) : (
            <span className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">
              Pending
            </span>
          )}
        </div>
        <p className="text-sm text-white/70 leading-relaxed">{appeal.reason}</p>
        <div className="mt-3 flex items-center justify-between text-xs text-white/30">
          <span>By {shortAddress(appeal.appellant)}</span>
          {appeal.resolved && appeal.outcome && (
            <span className="text-emerald-400/70">Outcome: {appeal.outcome}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
