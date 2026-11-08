import { cn } from "@/lib/utils";

/** Compact label + value tile (match panel, job page). Use 3–4 in a row. */
export function StatTile({ label, value, tone, hint }: { label: string; value: string; tone?: "success"; hint?: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-muted/60 px-3 py-2.5" title={hint}>
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 truncate text-[15px] font-semibold tabular-nums", tone === "success" && "text-success")}>{value}</p>
    </div>
  );
}
