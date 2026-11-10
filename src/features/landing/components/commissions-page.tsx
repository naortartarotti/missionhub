import { BadgeCheck, CircleDashed, CircleDollarSign, Info, ScrollText, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { Reveal, SectionHeader, type T } from "./shared";

export async function CommissionsPage() {
  const t = await getT("landing");
  return <Commissions t={t} />;
}

/* ------------------------------------------------------------------------------------------ */

function Commissions({ t }: { t: T }) {
  const split = [
    { key: "source" as const, pct: 45, tone: "bg-tile-yellow text-tile-foreground" },
    { key: "job" as const, pct: 45, tone: "bg-tile-blue text-tile-foreground" },
    { key: "platform" as const, pct: 10, tone: "bg-foreground text-background" },
  ];
  const ledger: { key: "projected" | "payable" | "paid"; icon: LucideIcon; tone: string }[] = [
    { key: "projected", icon: CircleDashed, tone: "bg-info-soft text-info" },
    { key: "payable", icon: CircleDollarSign, tone: "bg-warning-soft text-warning" },
    { key: "paid", icon: BadgeCheck, tone: "bg-success-soft text-success" },
  ];
  const facts = ["a", "b", "c", "d"] as const;
  const factTones = ["bg-tile-yellow", "bg-tile-blue", "bg-tile-lilac", "bg-tile-green"];
  return (
    <section className="px-4 pt-32 pb-24 sm:px-6 sm:pt-44 sm:pb-36">
      <div className="mx-auto max-w-7xl">
        <SectionHeader as="h1" eyebrow={t("commissions.eyebrow")} title={t("commissions.title")} subtitle={t("commissions.subtitle")} className="max-w-4xl" />

        <Reveal className="lp-split mt-16 flex h-auto flex-col gap-2 sm:h-56 sm:flex-row" delay={100}>
          {split.map((s, i) => (
            <div
              key={s.key}
              className={cn("lp-split-seg flex min-w-0 flex-col sm:min-w-52 justify-between overflow-hidden rounded-[2rem] p-6 sm:p-7", s.tone)}
              style={{ "--seg": s.pct, "--reveal-delay": `${200 + i * 140}ms` } as CSSProperties}
            >
              <p className="truncate text-[15px] font-medium opacity-80">{t(`commissions.split.${s.key}`)}</p>
              <p className="mt-6 text-[clamp(2.75rem,5vw,5rem)] leading-none font-semibold tracking-[-0.06em] tabular-nums">
                {s.pct}
                <span className="text-[0.45em] align-top">%</span>
              </p>
            </div>
          ))}
        </Reveal>

        <div className="mt-5 grid gap-5 lg:grid-cols-5">
          <Reveal className="rounded-[2rem] border border-border/60 bg-card p-7 sm:p-9 lg:col-span-3" delay={100}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold tracking-tight">{t("commissions.ledger.title")}</h3>
              <ScrollText className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <ol className="relative mt-8 grid gap-7">
              <span aria-hidden className="absolute top-3 bottom-3 left-[1.375rem] w-px bg-border" />
              {ledger.map((l) => (
                <li key={l.key} className="relative flex items-start gap-4">
                  <span className={cn("relative grid size-11 shrink-0 place-items-center rounded-full ring-4 ring-card", l.tone)} aria-hidden>
                    <l.icon className="size-5" />
                  </span>
                  <div className="pt-0.5">
                    <p className="font-semibold tracking-tight">{t(`commissions.ledger.${l.key}`)}</p>
                    <p className="mt-0.5 text-[15px] text-muted-foreground">{t(`commissions.ledger.${l.key}Body`)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
          <Reveal className="flex flex-col justify-between rounded-[2rem] bg-tile-green p-7 text-tile-foreground sm:p-9 lg:col-span-2" delay={200}>
            <span className="grid size-12 place-items-center rounded-full bg-white/85 text-black dark:bg-black/30 dark:text-white" aria-hidden>
              <Info className="size-5" />
            </span>
            <div className="mt-10">
              <p className="text-xl leading-snug font-semibold tracking-tight sm:text-2xl">{t("commissions.note")}</p>
              <p className="mt-4 text-[15px] opacity-75">{t("commissions.configurable")}</p>
            </div>
          </Reveal>
        </div>

        <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map((f, i) => (
            <Reveal as="li" key={f} delay={i * 80} className="rounded-[2rem] border border-border/60 bg-card p-7">
              <span className={cn("block h-1.5 w-10 rounded-full", factTones[i])} aria-hidden />
              <p className="mt-6 text-5xl font-semibold tracking-[-0.05em] tabular-nums">{t(`facts.${f}.value`)}</p>
              <p className="mt-2 text-[15px] text-muted-foreground">{t(`facts.${f}.label`)}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

