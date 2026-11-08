import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type Direction = "inbound" | "outbound";

/**
 * One visual language for referral direction, used everywhere a referral appears:
 * - inbound (blue, ↙): a partner's candidate submitted to YOUR job — you decide.
 * - outbound (lilac, ↗): YOUR candidate submitted to a partner's job — they decide.
 */
export const DIRECTION_STYLE: Record<Direction, { icon: typeof ArrowDownLeft; chip: string; dot: string }> = {
  inbound: { icon: ArrowDownLeft, chip: "bg-tile-blue text-tile-foreground", dot: "bg-tile-blue" },
  outbound: { icon: ArrowUpRight, chip: "bg-tile-lilac text-tile-foreground", dot: "bg-tile-lilac" },
};

export function DirectionBadge({ direction, label, className }: { direction: Direction; label: string; className?: string }) {
  const { icon: Icon, chip } = DIRECTION_STYLE[direction];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", chip, className)}>
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
