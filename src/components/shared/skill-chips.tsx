import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { MoreChip } from "./more-chip";

/**
 * Skills as chips. Pass `has` / `missing` to color them against a candidate (green ✓ / amber –);
 * without them every chip is neutral. `emphasis` makes neutral chips read as primary (required skills).
 * `max` shows only the first N and folds the rest into a "+N" pill with a tooltip.
 */
export function SkillChips({ skills, has, missing, emphasis, max }: { skills: string[]; has?: Set<string>; missing?: Set<string>; emphasis?: boolean; max?: number }) {
  if (!skills.length) return <span className="text-sm text-muted-foreground">—</span>;
  const shown = max && skills.length > max ? skills.slice(0, max) : skills;
  const hidden = skills.slice(shown.length);
  return (
    <ul className="flex flex-wrap items-center gap-1.5">
      {shown.map((s) => {
        const state = missing?.has(s) ? "missing" : has?.has(s) ? "has" : "neutral";
        return (
          <li
            key={s}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
              state === "has" && "border-success/30 bg-success/10 text-success",
              state === "missing" && "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
              state === "neutral" && !emphasis && "border-border text-muted-foreground",
              state === "neutral" && emphasis && "border-transparent bg-foreground/[0.06] text-foreground",
            )}
          >
            {state === "has" ? <Check className="size-3" aria-hidden /> : state === "missing" ? <Minus className="size-3" aria-hidden /> : null}
            {s}
          </li>
        );
      })}
      {hidden.length ? (
        <li>
          <MoreChip items={hidden} />
        </li>
      ) : null}
    </ul>
  );
}
