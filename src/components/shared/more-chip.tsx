"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/i18n/client";

/** "+N" pill closing a truncated chip list; hover or focus shows the hidden items. */
export function MoreChip({ items }: { items: string[] }) {
  const t = useT("common");
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`${t("moreItems", { count: String(items.length) })}: ${items.join(", ")}`}
            className="inline-flex cursor-default items-center rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground tabular-nums transition-colors hover:border-foreground/20 hover:text-foreground focus-visible:outline-2 data-[state=delayed-open]:border-foreground/20 data-[state=delayed-open]:text-foreground"
          >
            +{items.length}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className="max-w-64 rounded-xl px-3 py-2">
          <ul className="flex flex-wrap gap-1">
            {items.map((s) => (
              <li key={s} className="rounded-full bg-background/15 px-2 py-0.5 text-xs font-medium">
                {s}
              </li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
