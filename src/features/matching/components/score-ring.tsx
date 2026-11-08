"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { POTENTIAL_THRESHOLD, STRONG_THRESHOLD } from "../domain/engine";

// Same cut-offs the engine uses for Strong / Partial, so the color always agrees with the band label.
function tone(score: number) {
  if (score >= STRONG_THRESHOLD) return { ring: "stroke-success", track: "stroke-success/15" };
  if (score >= POTENTIAL_THRESHOLD) return { ring: "stroke-amber-500", track: "stroke-amber-500/15" };
  return { ring: "stroke-danger", track: "stroke-danger/15" };
}

/** Indicative compatibility score. Labelled as an approximation everywhere it appears. */
export function ScoreRing({ score, className }: { score: number; className?: string }) {
  const t = useT("opportunities");
  const r = 18;
  const c = 2 * Math.PI * r;
  const color = tone(score);
  return (
    <span className={cn("relative grid size-14 shrink-0 place-items-center", className)} role="img" aria-label={t("score.label", { score })}>
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="22" cy="22" r={r} className={cn("fill-none", color.track)} strokeWidth="4" />
        <circle cx="22" cy="22" r={r} className={cn("fill-none transition-[stroke-dashoffset] duration-500", color.ring)} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <span className="text-sm font-semibold tabular-nums" aria-hidden>{score}</span>
    </span>
  );
}
