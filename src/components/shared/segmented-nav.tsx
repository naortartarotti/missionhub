import Link from "next/link";
import { cn } from "@/lib/utils";

export type Segment = { key: string; label: string; href: string; count?: number };

/**
 * Segmented control for switching between sections of a page. Each segment is a link (the active
 * one is in the URL, e.g. `?tab=`), so it works without JS, can be shared, and keeps the page a
 * Server Component. Scrolls sideways on narrow screens instead of wrapping.
 */
export function SegmentedNav({ label, segments, active, className }: { label: string; segments: Segment[]; active: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("-mx-1 overflow-x-auto px-1 [scrollbar-width:none]", className)}>
      <div className="inline-flex min-w-max gap-1 rounded-full border border-border bg-card p-1">
        {segments.map((s) => {
          const current = s.key === active;
          return (
            <Link
              key={s.key}
              href={s.href}
              scroll={false}
              aria-current={current ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                current ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {s.label}
              {s.count !== undefined ? (
                <span className={cn("min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums", current ? "bg-background/20" : "bg-muted")}>{s.count}</span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
