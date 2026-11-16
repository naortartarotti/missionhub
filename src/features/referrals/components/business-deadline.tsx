"use client";

import { Clock } from "lucide-react";
import { useFormatter, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { deadlineLeft, deadlineState, deadlineWhen } from "../deadline";

/**
 * Business-day deadline (S5-x): "{when} ET · N business days left", always text plus a clock icon.
 * Wraps between the date and the days left on narrow screens. Colour is decorative only.
 */
export function BusinessDeadline({ at, left, label, className }: { at: string; left: number | null; label?: string; className?: string }) {
  const t = useT("referrals");
  const f = useFormatter();
  const state = deadlineState(left);
  const urgent = state === "today" || (state === "open" && (left ?? 0) <= 1);
  return (
    <p className={cn("flex items-start gap-2 text-sm", className)}>
      <Clock className={cn("mt-0.5 size-4 shrink-0", urgent ? "text-warning" : "text-muted-foreground")} aria-hidden />
      <span className="min-w-0 text-pretty">
        {label ? <span className="block font-medium">{label}</span> : null}
        {state === "closed" ? (
          deadlineLeft(t, f, at, left)
        ) : (
          <>
            {/* The date may wrap itself (pt "(horário de Toronto)" is long); " · days left" stays together. */}
            <span>{deadlineWhen(t, f, at)}</span> <span className="whitespace-nowrap">· {deadlineLeft(t, f, at, left)}</span>
          </>
        )}
      </span>
    </p>
  );
}
