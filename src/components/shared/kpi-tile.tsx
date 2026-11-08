import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

const TONES = {
  yellow: "bg-tile-yellow",
  blue: "bg-tile-blue",
  lilac: "bg-tile-lilac",
  green: "bg-tile-green",
} as const;

export function KpiTile({
  label,
  value,
  hint,
  tone,
  icon: Icon,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: keyof typeof TONES;
  icon: LucideIcon;
  href?: string;
}) {
  const body = (
    <div className={cn("flex h-full min-h-40 flex-col justify-between rounded-3xl p-6 text-tile-foreground transition-transform", TONES[tone], href && "hover:-translate-y-0.5")}>
      <div>
        <p className="text-[15px] font-medium">{label}</p>
        {hint ? <p className="mt-0.5 text-xs opacity-70">{hint}</p> : null}
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="text-4xl font-semibold tracking-tight tabular-nums">{value}</p>
        <span className="grid size-11 place-items-center rounded-full bg-white/85 text-black dark:bg-black/30 dark:text-white" aria-hidden>
          <Icon className="size-5" />
        </span>
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-3xl focus-visible:outline-2">
      {body}
    </Link>
  ) : (
    body
  );
}
