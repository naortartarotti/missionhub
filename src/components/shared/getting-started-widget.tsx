"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ArrowRight, CheckCircle2, Circle, Minus, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GettingStartedStep } from "./getting-started";

const KEY = "mh.getting-started.minimized";
const EVENT = "mh:getting-started";

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
function readMinimized(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
function setMinimized(v: boolean) {
  try {
    if (v) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: state just won't persist */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function GettingStartedWidget({
  steps,
  labels,
}: {
  steps: GettingStartedStep[];
  labels: { title: string; intro: string; progress: string; open: string; minimize: string; stepSr: string[] };
}) {
  // null on the server: the widget only appears after hydration, so the stored state never mismatches.
  const minimized = useSyncExternalStore(subscribe, readMinimized, () => null);
  if (minimized === null) return null;

  const doneCount = steps.filter((s) => s.done).length;
  const pct = (doneCount / steps.length) * 100;
  const nextKey = steps.find((s) => !s.done)?.key;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        aria-label={`${labels.open} · ${labels.progress}`}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2.5 rounded-full border border-border/60 bg-card py-2 pl-2 pr-4 text-sm font-medium shadow-lg transition-transform hover:-translate-y-0.5 sm:bottom-6 sm:right-6"
      >
        <span
          className="grid size-8 place-items-center rounded-full"
          style={{ background: `conic-gradient(var(--foreground) ${pct}%, var(--muted) 0)` }}
          aria-hidden
        >
          <span className="grid size-6 place-items-center rounded-full bg-card">
            <Rocket className="size-3.5" />
          </span>
        </span>
        {labels.title}
        <span className="tabular-nums text-muted-foreground">
          {doneCount}/{steps.length}
        </span>
      </button>
    );
  }

  return (
    <section
      aria-labelledby="getting-started"
      className="fixed inset-x-4 bottom-4 z-40 flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-3xl border border-border/60 bg-card shadow-2xl animate-in fade-in slide-in-from-bottom-4 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[400px]"
    >
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="getting-started" className="text-base font-semibold tracking-tight">
              {labels.title}
            </h2>
            <p className="text-xs font-medium tabular-nums text-muted-foreground">{labels.progress}</p>
          </div>
          <Button variant="ghost" size="icon" className="-mr-2 -mt-1 size-8 shrink-0" onClick={() => setMinimized(true)} aria-label={labels.minimize}>
            <Minus className="size-4" aria-hidden />
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground text-pretty">{labels.intro}</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ol className="grid gap-1 overflow-y-auto px-3 pb-3">
        {steps.map((s, i) => {
          const isNext = s.key === nextKey;
          return (
            <li key={s.key} className={cn("rounded-2xl p-3", isNext && "bg-muted/70")} aria-current={isNext ? "step" : undefined}>
              <div className="flex items-start gap-3">
                {s.done ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
                ) : (
                  <Circle className={cn("mt-0.5 size-5 shrink-0", isNext ? "text-foreground" : "text-muted-foreground/50")} aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", s.done && "text-muted-foreground line-through decoration-muted-foreground/40")}>
                    <span className="sr-only">{labels.stepSr[i]}</span>
                    {s.title}
                  </p>
                  {isNext ? (
                    <>
                      <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>
                      <Button size="sm" asChild className="mt-2.5">
                        <Link href={s.cta.href}>
                          {s.cta.label} <ArrowRight className="size-4" aria-hidden />
                        </Link>
                      </Button>
                    </>
                  ) : null}
                </div>
                {!s.done && !isNext ? (
                  <Link
                    href={s.cta.href}
                    className="shrink-0 self-center rounded-full text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {s.cta.label}
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
