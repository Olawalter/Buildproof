"use client";
import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { InspectionItem } from "@/types";

interface InspectionTimelineProps {
  inspections: InspectionItem[];
  /** Derived from consensus decision — all items green when AI approved */
  allPassed?: boolean;
  /** Derived from consensus decision — show rejection state */
  allRejected?: boolean;
}

export function InspectionTimeline({
  inspections,
  allPassed = false,
  allRejected = false,
}: InspectionTimelineProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Inspection Checklist</CardTitle>
      </CardHeader>
      <CardContent className="p-0 pb-4">
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-9 top-0 bottom-0 w-px bg-white/5" />

          {inspections.map((item, idx) => {
            const satisfied = item.satisfied || allPassed;
            const failed = !satisfied && allRejected;

            return (
              <div key={idx} className="flex items-start gap-4 px-6 py-3">
                <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                  {satisfied ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : failed ? (
                    <XCircle className="h-5 w-5 text-red-400/60" />
                  ) : (
                    <Circle className="h-5 w-5 text-white/20" />
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      satisfied
                        ? "text-emerald-400"
                        : failed
                        ? "text-red-400/70"
                        : "text-white/60",
                    )}
                  >
                    {item.name}
                  </p>
                  <p className="text-xs mt-0.5">
                    {satisfied ? (
                      <span className="text-emerald-400/50">Verified by AI consensus</span>
                    ) : failed ? (
                      <span className="text-red-400/50">Not satisfied — AI rejected</span>
                    ) : (
                      <span className="text-amber-400/60">Required — pending</span>
                    )}
                  </p>
                </div>
              </div>
            );
          })}

          {inspections.length === 0 && (
            <p className="px-6 py-4 text-sm text-white/30 text-center">
              No inspection requirements defined.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
