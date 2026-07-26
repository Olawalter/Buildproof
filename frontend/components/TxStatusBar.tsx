"use client";
import { Loader2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TxState } from "@/types";

interface TxStatusBarProps {
  tx: TxState;
  onDismiss?: () => void;
}

export function TxStatusBar({ tx, onDismiss }: TxStatusBarProps) {
  if (tx.status === "idle") return null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-all",
        tx.status === "pending" || tx.status === "confirming"
          ? "border-bp-orange/30 bg-bp-orange/5 text-bp-orange"
          : tx.status === "success"
          ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400"
          : "border-red-500/30 bg-red-500/5 text-red-400",
      )}
    >
      {(tx.status === "pending" || tx.status === "confirming") && (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      )}
      {tx.status === "success" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
      {tx.status === "error" && <XCircle className="h-4 w-4 shrink-0" />}

      <span className="flex-1">
        {tx.status === "pending" && "Submitting transaction…"}
        {tx.status === "confirming" && (
          <span>
            Awaiting finalization…{" "}
            {tx.hash && (
              <a
                href={`#tx-${tx.hash}`}
                className="underline underline-offset-2 opacity-70"
              >
                {tx.hash.slice(0, 10)}…
              </a>
            )}
          </span>
        )}
        {tx.status === "success" && "Transaction finalized successfully."}
        {tx.status === "error" && (tx.error || "Transaction failed.")}
      </span>

      {onDismiss && (tx.status === "success" || tx.status === "error") && (
        <button
          onClick={onDismiss}
          className="text-xs opacity-60 hover:opacity-100 transition-opacity"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
