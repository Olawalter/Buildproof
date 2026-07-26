"use client";
import {
  FileText,
  Image,
  Award,
  FileCheck,
  PenTool,
  AlertOctagon,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { shortAddress } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { EvidenceItem, EvidenceType } from "@/types";

const EVIDENCE_ICONS: Record<EvidenceType, React.ElementType> = {
  photo: Image,
  report: FileText,
  certificate: Award,
  permit: FileCheck,
  drawing: PenTool,
  other: AlertOctagon,
};

const EVIDENCE_COLORS: Record<EvidenceType, string> = {
  photo: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  report: "text-violet-400 bg-violet-400/10 border-violet-400/20",
  certificate: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  permit: "text-bp-gold bg-bp-gold/10 border-bp-gold/20",
  drawing: "text-sky-400 bg-sky-400/10 border-sky-400/20",
  other: "text-red-400 bg-red-400/10 border-red-400/20",
};

interface EvidenceViewerProps {
  evidence: EvidenceItem[];
}

export function EvidenceViewer({ evidence }: EvidenceViewerProps) {
  const completionItems = evidence.filter((e) => !e.is_dispute);
  const disputeItems = evidence.filter((e) => e.is_dispute);

  return (
    <div className="space-y-4">
      {completionItems.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3 px-1">
            Completion Evidence ({completionItems.length})
          </h3>
          <div className="space-y-2">
            {completionItems.map((ev) => (
              <EvidenceCard key={ev.id} item={ev} />
            ))}
          </div>
        </section>
      )}

      {disputeItems.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-red-400/60 uppercase tracking-wider mb-3 px-1">
            Owner Dispute Evidence ({disputeItems.length})
          </h3>
          <div className="space-y-2">
            {disputeItems.map((ev) => (
              <EvidenceCard key={ev.id} item={ev} />
            ))}
          </div>
        </section>
      )}

      {evidence.length === 0 && (
        <div className="text-center py-12 text-white/30">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No evidence submitted yet.</p>
        </div>
      )}
    </div>
  );
}

function EvidenceCard({ item }: { item: EvidenceItem }) {
  const Icon = EVIDENCE_ICONS[item.type] ?? FileText;
  const colorClass = EVIDENCE_COLORS[item.type] ?? "text-white/60 bg-white/5 border-white/10";

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border bg-white/3 p-4 transition-colors hover:bg-white/5",
        item.is_dispute ? "border-red-500/15" : "border-white/8",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
          colorClass,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-white text-sm">{item.title}</p>
          <span
            className={cn(
              "shrink-0 text-xs px-1.5 py-0.5 rounded-full border capitalize",
              colorClass,
            )}
          >
            {item.type}
          </span>
        </div>
        <p className="text-xs text-white/50 mt-1 line-clamp-2">{item.description}</p>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-white/25">By {shortAddress(item.submitter)}</p>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-bp-orange/70 hover:text-bp-orange transition-colors"
            >
              View <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
