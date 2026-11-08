import { cn } from "@/lib/utils";

/** Original mark: two interlocking rounded shapes = two recruiters connecting. */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 40 24" className="h-6 w-10" aria-hidden>
        <rect x="0" y="2" width="22" height="20" rx="10" className="fill-tile-yellow" />
        <rect x="16" y="2" width="22" height="20" rx="10" className="fill-foreground" />
        <circle cx="19" cy="12" r="3" className="fill-tile-yellow" />
      </svg>
      {!compact && <span className="text-lg font-semibold tracking-tight">MissionHub</span>}
    </span>
  );
}
