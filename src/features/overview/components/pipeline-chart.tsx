"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Panel } from "@/components/shared/card";
import { cn } from "@/lib/utils";

export type PipelineSide = "received" | "sent";

export type PipelineChartView = {
  side: PipelineSide;
  tab: string;
  total: string;
  totalLabel: string;
  closed: string | null;
  href: string;
  linkLabel: string;
  stages: { key: string; label: string; count: number; value: string; share: string }[];
};

/**
 * Candidates per pipeline stage, one horizontal bar per stage on a shared zero baseline.
 * Single series, so one hue (validated against the card surface in both themes) and no legend:
 * every bar carries its stage name and value directly, which also makes the rows the table view.
 */
export function PipelineChart({
  title,
  subtitle,
  chartLabel,
  sideLabel,
  emptyLabel,
  views,
  initial,
}: {
  title: string;
  subtitle: string;
  chartLabel: string;
  sideLabel: string;
  emptyLabel: string;
  views: PipelineChartView[];
  initial: PipelineSide;
}) {
  const [side, setSide] = useState<PipelineSide>(initial);
  const view = views.find((v) => v.side === side) ?? views[0];
  const max = Math.max(1, ...view.stages.map((s) => s.count));
  const empty = view.stages.every((s) => s.count === 0);

  return (
    <Panel className="flex h-full flex-col gap-5 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {views.length > 1 ? (
          <div role="radiogroup" aria-label={sideLabel} className="inline-flex rounded-full bg-muted p-1 text-sm">
            {views.map((v) => (
              <button
                key={v.side}
                type="button"
                role="radio"
                aria-checked={side === v.side}
                onClick={() => setSide(v.side)}
                className={cn(
                  "rounded-full px-3 py-1 font-medium transition-colors",
                  side === v.side ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v.tab}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-5xl font-semibold tracking-tight">{view.total}</p>
        <p className="text-sm text-muted-foreground">
          {view.totalLabel}
          {view.closed ? <span className="ml-2 opacity-80">{view.closed}</span> : null}
        </p>
      </div>

      {empty ? (
        <p className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ol aria-label={chartLabel} className="grid flex-1 content-center gap-3">
          {view.stages.map((s) => {
            const pct = (s.count / max) * 100;
            return (
              <li key={s.key} className="group relative grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
                <span className="truncate text-sm text-muted-foreground">{s.label}</span>
                {/* Track = hit target (taller than the 20px bar); the bar grows from the left baseline. */}
                <span className="relative flex h-8 items-center border-l border-border" tabIndex={0} aria-label={`${s.label}: ${s.value} · ${s.share}`}>
                  {s.count > 0 ? (
                    <span
                      className="h-5 rounded-r-[4px] bg-[#2f62a8] transition-[width,opacity] duration-500 ease-out group-hover:opacity-85 dark:bg-[#4f86d6]"
                      style={{ width: `max(${pct}%, 4px)` }}
                      aria-hidden
                    />
                  ) : null}
                  <span className={cn("pl-2 text-sm font-semibold tabular-nums", s.count === 0 && "font-normal text-muted-foreground")} aria-hidden>
                    {s.value}
                  </span>
                  {/* Hover / focus tooltip */}
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full left-0 z-10 mb-1 rounded-xl bg-foreground px-3 py-1.5 text-xs whitespace-nowrap text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                  >
                    <span className="font-semibold">{s.label}</span> · {s.value} · {s.share}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <Link href={view.href} className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        {view.linkLabel}
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </Panel>
  );
}
