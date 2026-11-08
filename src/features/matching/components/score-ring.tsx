import { cn } from "@/lib/utils";

/** Indicative compatibility score. Labelled as an approximation everywhere it appears. */
export function ScoreRing({ score, className }: { score: number; className?: string }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <span className={cn("relative grid size-14 shrink-0 place-items-center", className)} role="img" aria-label={`Indicative compatibility ${score} out of 100`}>
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="22" cy="22" r={r} className="fill-none stroke-muted" strokeWidth="4" />
        <circle cx="22" cy="22" r={r} className="fill-none stroke-foreground" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <span className="text-sm font-semibold tabular-nums" aria-hidden>{score}</span>
    </span>
  );
}
