import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Skills as chips. Pass `has` / `missing` to color them against a candidate (green ✓ / amber –);
 * without them every chip is neutral.
 */
export function SkillChips({ skills, has, missing }: { skills: string[]; has?: Set<string>; missing?: Set<string> }) {
  if (!skills.length) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {skills.map((s) => {
        const state = missing?.has(s) ? "missing" : has?.has(s) ? "has" : "neutral";
        return (
          <li
            key={s}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
              state === "has" && "border-success/30 bg-success/10 text-success",
              state === "missing" && "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
              state === "neutral" && "border-border text-muted-foreground",
            )}
          >
            {state === "has" ? <Check className="size-3" aria-hidden /> : state === "missing" ? <Minus className="size-3" aria-hidden /> : null}
            {s}
          </li>
        );
      })}
    </ul>
  );
}
