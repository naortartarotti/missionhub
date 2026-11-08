import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** Collapsed-by-default block for long text (job descriptions). */
export function Disclosure({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-border/60 px-4 py-3 text-sm">
      <summary className="flex list-none items-center justify-between font-medium [&::-webkit-details-marker]:hidden">
        {summary}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="mt-2 whitespace-pre-line text-muted-foreground">{children}</div>
    </details>
  );
}
