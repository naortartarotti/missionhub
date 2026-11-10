import Link from "next/link";
import { CircleDollarSign, Inbox, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFormatter, getT } from "@/i18n/server";
import type { OverviewData } from "../data";

/** Same pastel tiles as the rest of the app (KpiTile), in a compact size. */
const TONES = {
  lilac: "bg-tile-lilac",
  blue: "bg-tile-blue",
  green: "bg-tile-green",
} as const;

type Stat = { key: string; label: string; value: string; hint?: string; href: string; tone: keyof typeof TONES; icon: LucideIcon };

/** Three compact headline numbers. Each one appears here only; the sections below add context, not repeats. */
export async function OverviewStats({ base, data, stacked = false }: { base: string; data: OverviewData; /** One tile per row (beside the pipeline chart on wide screens). */ stacked?: boolean }) {
  const [t, f] = await Promise.all([getT("overview"), getFormatter()]);
  const { stats, canMatch, canMoney } = data;
  const items: Stat[] = [
    ...(canMatch
      ? [{ key: "matches", label: t("stats.matches"), value: f.number(stats.matchesToReview), href: `${base}/opportunities`, tone: "lilac" as const, icon: Sparkles }]
      : []),
    { key: "referrals", label: t("stats.referrals"), value: f.number(stats.referralsToReview), href: `${base}/referrals?tab=received`, tone: "blue", icon: Inbox },
    ...(canMoney
      ? [{
          key: "earned",
          label: t("stats.earned"),
          value: f.money(stats.earned, stats.currency, { whole: true }),
          hint: stats.projected > 0 ? t("stats.earnedProjected", { amount: f.money(stats.projected, stats.currency, { whole: true }) }) : undefined,
          href: `${base}/wallet`,
          tone: "green" as const,
          icon: CircleDollarSign,
        }]
      : []),
  ];

  return (
    <section aria-label={t("stats.label")} className={cn(stacked && "h-full")}>
      <ul
        className={cn(
          "grid grid-cols-[minmax(0,1fr)] gap-2 sm:gap-3",
          items.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
          stacked && "h-full lg:grid-cols-[minmax(0,1fr)] lg:auto-rows-fr",
        )}
      >
        {items.map((s) => (
          <li key={s.key} className="min-w-0">
            <Link
              href={s.href}
              className={cn(
                "flex h-full items-center gap-3 rounded-2xl px-4 py-3 text-tile-foreground transition-transform hover:-translate-y-0.5 focus-visible:outline-2 sm:items-start sm:py-4",
                TONES[s.tone],
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{s.label}</span>
                <span className="mt-0 block text-xl font-semibold tracking-tight tabular-nums sm:mt-2 sm:text-3xl">
                  {s.value}
                  {s.hint ? <span className="ml-2 text-xs font-medium tracking-normal opacity-70">{s.hint}</span> : null}
                </span>
              </span>
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/85 text-black dark:bg-black/30 dark:text-white" aria-hidden>
                <s.icon className="size-4" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
