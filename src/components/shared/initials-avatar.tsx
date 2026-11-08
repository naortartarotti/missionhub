import { cn } from "@/lib/utils";

const PALETTE = ["bg-tile-yellow", "bg-tile-blue", "bg-tile-lilac", "bg-tile-green"];

export function InitialsAvatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";
  const tone = PALETTE[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
  return (
    <span className={cn("grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-tile-foreground", tone, className)} aria-hidden>
      {initials}
    </span>
  );
}
