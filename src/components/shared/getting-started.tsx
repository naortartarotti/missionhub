import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";

export type GettingStartedStep = {
  key: string;
  title: string;
  description: string;
  done: boolean;
  cta: { label: string; href: string };
};

/** First-run guide. Renders nothing once every step is done. */
export async function GettingStarted({ steps }: { steps: GettingStartedStep[] }) {
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  const nextKey = steps.find((s) => !s.done)?.key;
  const t = await getT("overview");

  return (
    <section aria-labelledby="getting-started" className="rounded-[2rem] border border-border/60 bg-card p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="getting-started" className="text-lg font-semibold tracking-tight">{t("gettingStarted.title")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground text-pretty">
            {t("gettingStarted.intro")}
          </p>
        </div>
        <p className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
          {t("gettingStarted.progress", { done: doneCount, total: steps.length })}
        </p>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-5 grid gap-2">
        {steps.map((s, i) => {
          const isNext = s.key === nextKey;
          return (
            <li
              key={s.key}
              className={cn("flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center", isNext ? "bg-muted/70" : "")}
              aria-current={isNext ? "step" : undefined}
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {s.done ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
                ) : (
                  <Circle className={cn("mt-0.5 size-5 shrink-0", isNext ? "text-foreground" : "text-muted-foreground/50")} aria-hidden />
                )}
                <div className="min-w-0">
                  <p className={cn("text-sm font-medium", s.done && "text-muted-foreground line-through decoration-muted-foreground/40")}>
                    <span className="sr-only">{t("gettingStarted.stepSr", { n: i + 1 })}{s.done ? `, ${t("gettingStarted.doneSr")}` : ""}: </span>
                    {s.title}
                  </p>
                  {!s.done ? <p className="mt-0.5 text-sm text-muted-foreground">{s.description}</p> : null}
                </div>
              </div>
              {!s.done ? (
                <Button variant={isNext ? "default" : "outline"} size="sm" asChild className="shrink-0 self-start sm:self-center">
                  <Link href={s.cta.href}>
                    {s.cta.label} {isNext ? <ArrowRight className="size-4" aria-hidden /> : null}
                  </Link>
                </Button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
