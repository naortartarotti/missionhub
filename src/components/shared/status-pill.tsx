import { cn } from "@/lib/utils";
import { Check, Clock, X, CircleDot, AlertTriangle, Minus, type LucideIcon } from "lucide-react";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE: Record<Tone, { icon: LucideIcon; dot: string }> = {
  success: { icon: Check, dot: "bg-success text-white dark:text-black" },
  warning: { icon: Clock, dot: "bg-warning text-white dark:text-black" },
  danger: { icon: X, dot: "bg-danger text-white dark:text-black" },
  info: { icon: CircleDot, dot: "bg-info text-white dark:text-black" },
  neutral: { icon: Minus, dot: "bg-muted-foreground/70 text-white dark:text-black" },
};

/**
 * Status indicator styled after the reference: icon in a filled circle + text label. Never color-only.
 * `wrap` lets a sentence-length label break onto several lines (the pill becomes a rounded box).
 */
export function StatusPill({
  tone,
  label,
  icon,
  className,
  wrap = false,
}: {
  tone: Tone;
  label: string;
  icon?: LucideIcon;
  className?: string;
  wrap?: boolean;
}) {
  const t = TONE[tone];
  const Icon = icon ?? t.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 pr-3 pl-1 text-sm font-medium whitespace-nowrap",
        wrap && "max-w-full items-start rounded-2xl py-1.5 pl-1.5 whitespace-normal",
        className,
      )}
    >
      <span className={cn("grid size-5 shrink-0 place-items-center rounded-full", t.dot)} aria-hidden>
        <Icon className="size-3" strokeWidth={3} />
      </span>
      {label}
    </span>
  );
}

export { AlertTriangle };
