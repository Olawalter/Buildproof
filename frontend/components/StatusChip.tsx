import { cn, statusLabel, statusColor } from "@/lib/utils";
import type { ProjectStatus } from "@/types";

interface StatusChipProps {
  status: ProjectStatus;
  className?: string;
}

export function StatusChip({ status, className }: StatusChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tracking-wide",
        statusColor(status),
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {statusLabel(status)}
    </span>
  );
}
