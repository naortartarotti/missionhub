import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CircleDollarSign, EyeOff, Handshake, MessageCircleQuestion, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { display, Eyebrow, PAGES, Reveal, SectionHeader, type PageKey, type T } from "./shared";
import meeting from "../assets/meeting.jpg";
import portrait1 from "../assets/portrait1.jpg";
import portrait2 from "../assets/portrait2.jpg";
import portrait3 from "../assets/portrait3.jpg";

/** The home page only introduces the product; each topic has its own page for the details. */
export async function HomePage() {
  const t = await getT("landing");
  return (
    <>
      <Hero t={t} />
      <Marquee t={t} />
      <Statement t={t} />
      <Explore t={t} />
    </>
  );
}

/* ------------------------------------------------------------------------------------------ */

function Hero({ t }: { t: T }) {
  const lines = [t("hero.line1"), t("hero.line2"), t("hero.line3")];
  return (
    <section className="relative px-4 pt-28 pb-16 sm:px-6 sm:pt-36 lg:pb-24">
      {/* Soft pastel glows, the same tones as the workspace KPI tiles. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
        <div className="lp-blob absolute -top-40 -left-32 size-[34rem] rounded-full bg-tile-yellow/50 blur-3xl" />
        <div className="lp-blob absolute top-24 right-[-10rem] size-[30rem] rounded-full bg-tile-lilac/70 blur-3xl [animation-delay:-6s]" />
        <div className="lp-blob absolute bottom-[-12rem] left-1/3 size-[28rem] rounded-full bg-tile-blue/70 blur-3xl [animation-delay:-12s]" />
      </div>

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-7">
          <div className="lp-rise" style={{ "--rise-delay": "0ms" } as CSSProperties}>
            <Eyebrow>{t("hero.eyebrow")}</Eyebrow>
          </div>
          <h1 className={cn(display, "mt-7 text-[clamp(3rem,6.1vw,5.5rem)] leading-[0.9]")}>
            {lines.map((line, i) => (
              <span key={i} className="block overflow-hidden pb-[0.08em]">
                <span className={cn("lp-line block", i === 2 && "text-muted-foreground")} style={{ "--rise-delay": `${120 + i * 110}ms` } as CSSProperties}>
                  {i === 2 ? (
                    <span className="lp-highlight text-foreground">{line}</span>
                  ) : (
                    line
                  )}
                </span>
              </span>
            ))}
          </h1>
          <p className="lp-rise mt-8 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl" style={{ "--rise-delay": "520ms" } as CSSProperties}>
            {t("hero.subtitle")}
          </p>
          <div className="lp-rise mt-9 flex flex-wrap items-center gap-3" style={{ "--rise-delay": "620ms" } as CSSProperties}>
            <Button asChild size="lg" className="group h-14 px-8 text-base">
              <Link href="/sign-up">
                {t("hero.primary")}
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-14 px-8 text-base">
              <Link href="/how-it-works">{t("hero.secondary")}</Link>
            </Button>
          </div>
          <p className="lp-rise mt-6 flex items-center gap-2 text-sm text-muted-foreground" style={{ "--rise-delay": "720ms" } as CSSProperties}>
            <ShieldCheck className="size-4 text-success" aria-hidden />
            {t("hero.note")}
          </p>
        </div>

        <div className="relative lg:col-span-5">
          <div className="lp-hero-image relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-[2.75rem] bg-muted shadow-[0_40px_100px_-40px_rgb(0_0_0/0.45)] lg:max-w-none">
            <Image src={meeting} alt={t("hero.imageAlt")} fill preload sizes="(min-width: 1024px) 40vw, (min-width: 640px) 28rem, 92vw" className="object-cover object-[38%_50%]" placeholder="blur" />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
          </div>

          {/* Floating product cards: echo the real Opportunities / Jobs / Commissions UI. */}
          <div className="lp-pop absolute top-8 -left-2 sm:-left-8 lg:-left-14" style={{ "--rise-delay": "800ms" } as CSSProperties}>
            <div className="lp-float flex items-center gap-3 rounded-3xl border border-border/60 bg-card/95 p-3 pr-5 shadow-[0_20px_50px_-25px_rgb(0_0_0/0.45)] backdrop-blur">
              <ScoreBadge score={92} />
              <div>
                <p className="flex items-center gap-1.5 text-xs font-medium text-success">
                  <Sparkles className="size-3.5" aria-hidden /> {t("hero.card.matchLabel")}
                </p>
                <p className="text-sm font-semibold tracking-tight">{t("hero.card.matchJob")}</p>
              </div>
            </div>
          </div>

          <div className="lp-pop absolute -right-1 bottom-24 sm:-right-6 lg:-right-8" style={{ "--rise-delay": "950ms" } as CSSProperties}>
            <div className="lp-float max-w-[15rem] rounded-3xl border border-border/60 bg-card/95 p-4 shadow-[0_20px_50px_-25px_rgb(0_0_0/0.45)] backdrop-blur [animation-delay:-2s]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">{t("hero.card.anonTitle")}</p>
                <EyeOff className="size-4 text-muted-foreground" aria-hidden />
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="flex -space-x-2.5">
                  {[portrait1, portrait2, portrait3].map((src, i) => (
                    <Image key={i} src={src} alt="" width={36} height={36} className="size-9 rounded-full border-2 border-card object-cover blur-[3px] grayscale" />
                  ))}
                </div>
                <p className="text-3xl font-semibold tracking-tight tabular-nums">3</p>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{t("hero.card.anonBody")}</p>
            </div>
          </div>

          <div className="lp-pop absolute -bottom-5 left-6 sm:left-10" style={{ "--rise-delay": "1100ms" } as CSSProperties}>
            <div className="lp-float flex items-center gap-3 rounded-full bg-tile-yellow py-2.5 pr-5 pl-2.5 text-tile-foreground shadow-[0_20px_50px_-25px_rgb(0_0_0/0.5)] [animation-delay:-4s]">
              <span className="grid size-9 place-items-center rounded-full bg-white/85 text-black dark:bg-black/30 dark:text-white" aria-hidden>
                <CircleDollarSign className="size-[18px]" />
              </span>
              <span className="text-sm">
                <span className="block text-xs opacity-75">{t("hero.card.splitTitle")}</span>
                <span className="font-semibold tabular-nums">{t("hero.card.splitBody")}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid size-14 shrink-0 place-items-center" aria-hidden>
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
        <circle cx="22" cy="22" r={r} className="fill-none stroke-success/15" strokeWidth="4" />
        <circle cx="22" cy="22" r={r} className="lp-ring fill-none stroke-success" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} style={{ "--ring-c": c, "--ring-to": c * (1 - score / 100) } as CSSProperties} />
      </svg>
      <span className="text-sm font-semibold tabular-nums">{score}</span>
    </span>
  );
}

/* ------------------------------------------------------------------------------------------ */

function Marquee({ t }: { t: T }) {
  const keys = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"] as const;
  const tones = ["bg-tile-yellow", "bg-tile-blue", "bg-tile-lilac", "bg-tile-green"];
  const items = keys.map((k, i) => ({ label: t(`marquee.items.${k}`), tone: tones[i % tones.length] }));
  const row = (hidden: boolean) => (
    <ul className="lp-marquee flex shrink-0 items-center gap-3 pr-3" aria-hidden={hidden || undefined}>
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-2.5 rounded-full border border-border/60 bg-card px-5 py-2.5 text-[15px] font-medium whitespace-nowrap">
          <span className={cn("size-2.5 rounded-full", it.tone)} aria-hidden />
          {it.label}
        </li>
      ))}
    </ul>
  );
  return (
    <section aria-label={t("marquee.label")} className="relative border-y border-border/60 bg-canvas/60 py-5">
      <div className="lp-marquee-track flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
        {row(false)}
        {row(true)}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------ */

function Statement({ t }: { t: T }) {
  const words = t("statement.text").split(" ");
  return (
    <section className="px-4 py-24 sm:px-6 sm:py-36">
      <p className={cn(display, "mx-auto max-w-5xl text-[clamp(1.85rem,4.6vw,3.9rem)] leading-[1.08] tracking-[-0.035em]")}>
        {words.map((w, i) => (
          <span key={i} className="lp-word" style={{ "--w-start": `${8 + (i / words.length) * 42}%`, "--w-end": `${14 + (i / words.length) * 42}%` } as CSSProperties}>
            {w}{" "}
          </span>
        ))}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------ */

const EXPLORE: Record<PageKey, { icon: LucideIcon; tone: string }> = {
  how: { icon: Handshake, tone: "bg-tile-yellow" },
  privacy: { icon: EyeOff, tone: "bg-tile-lilac" },
  commissions: { icon: CircleDollarSign, tone: "bg-tile-blue" },
  faq: { icon: MessageCircleQuestion, tone: "bg-tile-green" },
};

/** One short teaser per internal page, so the details live in exactly one place. */
function Explore({ t }: { t: T }) {
  return (
    <section className="px-4 pb-24 sm:px-6 sm:pb-36">
      <div className="mx-auto max-w-7xl">
        <SectionHeader eyebrow={t("explore.eyebrow")} title={t("explore.title")} className="max-w-4xl" />
        <ul className="mt-14 grid gap-4 sm:grid-cols-2">
          {PAGES.map((p, i) => {
            const { icon: Icon, tone } = EXPLORE[p.key];
            return (
              <Reveal as="li" key={p.key} delay={i * 90}>
                <Link
                  href={p.href}
                  className={cn("group flex h-full min-h-72 flex-col rounded-[2rem] p-7 text-tile-foreground transition-transform duration-500 hover:-translate-y-1 sm:p-9", tone)}
                >
                  <div className="flex items-start justify-between">
                    <span className="grid size-12 place-items-center rounded-full bg-white/85 text-black transition-transform duration-500 group-hover:rotate-[-8deg] group-hover:scale-110 dark:bg-black/30 dark:text-white" aria-hidden>
                      <Icon className="size-5" />
                    </span>
                    <ArrowUpRight className="size-6 opacity-60 transition-all duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" aria-hidden />
                  </div>
                  <h3 className="mt-auto pt-10 text-2xl font-semibold tracking-tight sm:text-3xl">{t(`explore.items.${p.key}.title`)}</h3>
                  <p className="mt-2.5 max-w-md text-[15px] leading-relaxed opacity-80">{t(`explore.items.${p.key}.body`)}</p>
                  <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold">
                    {t("explore.more")}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                  </span>
                </Link>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
