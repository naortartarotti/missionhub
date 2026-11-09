import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  Check,
  CircleDashed,
  CircleDollarSign,
  EyeOff,
  FileCheck2,
  Handshake,
  Info,
  Lock,
  Plus,
  ScrollText,
  Send,
  ShieldCheck,
  Sparkles,
  UserPlus,
  UserRoundSearch,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { LandingNav } from "./landing-nav";
import { RevealObserver } from "./reveal-observer";
import meeting from "../assets/meeting.jpg";
import recruiter from "../assets/recruiter.jpg";
import laptop from "../assets/laptop.jpg";
import handshake from "../assets/handshake.jpg";
import portrait1 from "../assets/portrait1.jpg";
import portrait2 from "../assets/portrait2.jpg";
import portrait3 from "../assets/portrait3.jpg";

type T = Awaited<ReturnType<typeof getT<"landing">>>;

/** Fades/slides a block in the first time it scrolls into view (see RevealObserver + globals.css). */
function Reveal({ children, delay = 0, className, as: Tag = "div" }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "li" | "section" | "p" }) {
  return (
    <Tag data-reveal="" className={className} style={delay ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties) : undefined}>
      {children}
    </Tag>
  );
}

function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3.5 py-1.5 text-[13px] font-medium text-muted-foreground", className)}>
      <span className="size-1.5 rounded-full bg-tile-yellow ring-4 ring-tile-yellow/30" aria-hidden />
      {children}
    </p>
  );
}

const display = "font-semibold tracking-[-0.045em] text-balance";

export async function LandingPage() {
  const t = await getT("landing");
  const year = new Date().getFullYear();
  return (
    <div data-landing="" className="relative overflow-x-clip bg-background text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">
        {t("nav.skip")}
      </a>
      <LandingNav />
      <main id="main">
        <Hero t={t} />
        <Marquee t={t} />
        <Statement t={t} />
        <HowItWorks t={t} />
        <Sides t={t} />
        <Privacy t={t} />
        <Commissions t={t} />
        <Faq t={t} />
        <FinalCta t={t} />
      </main>
      <Footer t={t} year={year} />
      <RevealObserver />
    </div>
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
              <a href="#how">{t("hero.secondary")}</a>
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

function SectionHeader({ eyebrow, title, subtitle, className, center }: { eyebrow: string; title: string; subtitle?: string; className?: string; center?: boolean }) {
  return (
    <div className={cn(center && "mx-auto text-center", className)}>
      <Reveal>
        <Eyebrow>{eyebrow}</Eyebrow>
      </Reveal>
      <Reveal delay={80}>
        <h2 className={cn(display, "mt-5 text-[clamp(2.4rem,6vw,5rem)] leading-[0.95]")}>{title}</h2>
      </Reveal>
      {subtitle ? (
        <Reveal delay={160}>
          <p className={cn("mt-5 max-w-xl text-lg text-muted-foreground sm:text-xl", center && "mx-auto")}>{subtitle}</p>
        </Reveal>
      ) : null}
    </div>
  );
}

function HowItWorks({ t }: { t: T }) {
  const steps: { key: "one" | "two" | "three" | "four"; icon: LucideIcon; tone: string }[] = [
    { key: "one", icon: UserPlus, tone: "bg-tile-yellow" },
    { key: "two", icon: UserRoundSearch, tone: "bg-tile-blue" },
    { key: "three", icon: Send, tone: "bg-tile-lilac" },
    { key: "four", icon: Handshake, tone: "bg-tile-green" },
  ];
  return (
    <section id="how" className="px-4 pb-24 sm:px-6 sm:pb-36">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-12">
        <SectionHeader className="lg:sticky lg:top-32 lg:col-span-5 lg:self-start" eyebrow={t("how.eyebrow")} title={t("how.title")} subtitle={t("how.subtitle")} />
        <ol className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
          {steps.map((s, i) => (
            <Reveal as="li" key={s.key} delay={i * 90} className={cn("group flex min-h-80 flex-col rounded-[2rem] p-7 text-tile-foreground transition-transform duration-500 hover:-translate-y-1 sm:p-8", s.tone, i % 2 === 1 && "sm:translate-y-12 sm:hover:translate-y-11")}>
              <div className="flex items-start justify-between">
                <span className="text-6xl font-semibold tracking-[-0.06em] tabular-nums opacity-90">{String(i + 1).padStart(2, "0")}</span>
                <span className="grid size-12 place-items-center rounded-full bg-white/85 text-black transition-transform duration-500 group-hover:rotate-[-8deg] group-hover:scale-110 dark:bg-black/30 dark:text-white" aria-hidden>
                  <s.icon className="size-5" />
                </span>
              </div>
              <h3 className="mt-auto pt-10 text-2xl font-semibold tracking-tight">{t(`how.steps.${s.key}.title`)}</h3>
              <p className="mt-2.5 text-[15px] leading-relaxed opacity-80">{t(`how.steps.${s.key}.body`)}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------ */

function Sides({ t }: { t: T }) {
  const sides = [
    { key: "owner" as const, image: recruiter, icon: UserRoundSearch, tone: "bg-tile-yellow", position: "object-[50%_30%]" },
    { key: "jobOwner" as const, image: laptop, icon: Building2, tone: "bg-tile-blue", position: "object-[60%_50%]" },
  ];
  return (
    <section className="bg-canvas/70 px-4 py-24 sm:px-6 sm:py-36">
      <div className="mx-auto max-w-7xl">
        <SectionHeader center className="max-w-3xl" eyebrow={t("sides.eyebrow")} title={t("sides.title")} />
        <div className="mt-16 grid gap-5 lg:grid-cols-2">
          {sides.map((s, i) => (
            <Reveal key={s.key} delay={i * 120} className="group flex flex-col overflow-hidden rounded-[2.5rem] border border-border/60 bg-card">
              <div className="relative aspect-[16/11] overflow-hidden">
                <Image src={s.image} alt={t(`sides.${s.key}.imageAlt`)} fill sizes="(min-width: 1024px) 40rem, 100vw" placeholder="blur" className={cn("object-cover transition-transform duration-[1.2s] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105", s.position)} />
                <span className={cn("absolute top-5 left-5 inline-flex items-center gap-2 rounded-full py-1.5 pr-4 pl-1.5 text-sm font-medium text-tile-foreground shadow-lg", s.tone)}>
                  <span className="grid size-7 place-items-center rounded-full bg-white/85 text-black dark:bg-black/30 dark:text-white" aria-hidden>
                    <s.icon className="size-3.5" />
                  </span>
                  {t(`sides.${s.key}.badge`)}
                </span>
              </div>
              <div className="flex flex-1 flex-col p-7 sm:p-10">
                <h3 className={cn(display, "text-3xl leading-tight sm:text-4xl")}>{t(`sides.${s.key}.title`)}</h3>
                <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{t(`sides.${s.key}.body`)}</p>
                <ul className="mt-7 grid gap-3">
                  {(["a", "b", "c"] as const).map((p) => (
                    <li key={p} className="flex items-start gap-3 text-[15px]">
                      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success-soft text-success" aria-hidden>
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                      {t(`sides.${s.key}.points.${p}`)}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------ */

function Privacy({ t }: { t: T }) {
  const features: { key: "isolation" | "consent" | "audit" | "requests"; icon: LucideIcon }[] = [
    { key: "isolation", icon: Lock },
    { key: "consent", icon: FileCheck2 },
    { key: "audit", icon: ScrollText },
    { key: "requests", icon: ShieldCheck },
  ];
  return (
    <section id="privacy" className="px-3 py-6 sm:px-5">
      <div className="relative mx-auto max-w-[90rem] overflow-hidden rounded-[2.5rem] bg-primary px-5 py-20 text-primary-foreground sm:rounded-[3.5rem] sm:px-10 sm:py-28">
        <div aria-hidden className="pointer-events-none absolute -top-48 right-[-8rem] size-[36rem] rounded-full bg-tile-lilac/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-56 -left-24 size-[32rem] rounded-full bg-tile-yellow/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2">
          <div>
            <Reveal>
              <p className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/15 px-3.5 py-1.5 text-[13px] font-medium opacity-80">
                <EyeOff className="size-3.5" aria-hidden /> {t("privacy.eyebrow")}
              </p>
            </Reveal>
            <Reveal delay={80}>
              <h2 className={cn(display, "mt-5 text-[clamp(2.6rem,6.5vw,5.5rem)] leading-[0.92]")}>{t("privacy.title")}</h2>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-6 max-w-xl text-lg leading-relaxed opacity-70 sm:text-xl">{t("privacy.subtitle")}</p>
            </Reveal>
            <ul className="mt-12 grid gap-x-8 gap-y-7 sm:grid-cols-2">
              {features.map((f, i) => (
                <Reveal as="li" key={f.key} delay={200 + i * 70}>
                  <span className="grid size-11 place-items-center rounded-2xl bg-primary-foreground/10" aria-hidden>
                    <f.icon className="size-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold tracking-tight">{t(`privacy.features.${f.key}.title`)}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed opacity-65">{t(`privacy.features.${f.key}.body`)}</p>
                </Reveal>
              ))}
            </ul>
          </div>

          <Reveal delay={120} className="relative">
            <PrivacyMock t={t} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function PrivacyMock({ t }: { t: T }) {
  return (
    <div className="relative mx-auto max-w-lg rotate-[-1.5deg] rounded-[2.25rem] bg-card p-6 text-card-foreground shadow-[0_50px_120px_-40px_rgb(0_0_0/0.6)] transition-transform duration-700 hover:rotate-0 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-tile-blue text-tile-foreground" aria-hidden>
            <Building2 className="size-5" />
          </span>
          <p className="font-semibold tracking-tight">{t("privacy.mock.job")}</p>
        </div>
      </div>
      <p className="mt-7 text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("privacy.mock.visible")}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{t("privacy.mock.count")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-sm font-medium text-success">
          <BadgeCheck className="size-4" aria-hidden /> {t("privacy.mock.strong")}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1 text-sm font-medium text-warning">
          <CircleDashed className="size-4" aria-hidden /> {t("privacy.mock.potential")}
        </span>
      </div>
      <ul className="mt-7 grid gap-2.5" aria-hidden>
        {[portrait1, portrait2, portrait3, portrait1].map((src, i) => (
          <li key={i} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/40 p-3" style={{ "--reveal-delay": `${300 + i * 90}ms` } as CSSProperties}>
            <Image src={src} alt="" width={40} height={40} className="size-10 rounded-full object-cover blur-[5px] grayscale" />
            <div className="flex-1">
              <div className="lp-shimmer h-2.5 w-2/5 rounded-full bg-foreground/15" />
              <div className="lp-shimmer mt-2 h-2 w-3/5 rounded-full bg-foreground/10" />
            </div>
            <span className={cn("size-2.5 rounded-full", i < 2 ? "bg-success" : "bg-warning")} />
          </li>
        ))}
      </ul>
      <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
        <Lock className="size-4" aria-hidden /> {t("privacy.mock.hidden")}
      </p>
    </div>
  );
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
    <section id="commissions" className="px-4 py-24 sm:px-6 sm:py-36">
      <div className="mx-auto max-w-7xl">
        <SectionHeader eyebrow={t("commissions.eyebrow")} title={t("commissions.title")} subtitle={t("commissions.subtitle")} className="max-w-4xl" />

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

/* ------------------------------------------------------------------------------------------ */

function Faq({ t }: { t: T }) {
  const items = ["a", "b", "c", "d", "e"] as const;
  return (
    <section id="faq" className="bg-canvas/70 px-4 py-24 sm:px-6 sm:py-36">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-12">
        <SectionHeader className="lg:sticky lg:top-32 lg:col-span-5 lg:self-start" eyebrow={t("faq.eyebrow")} title={t("faq.title")} />
        <div className="grid gap-3 lg:col-span-7">
          {items.map((k, i) => (
            <Reveal key={k} delay={i * 60}>
              <details className="lp-faq group rounded-[1.75rem] border border-border/60 bg-card transition-colors open:bg-card hover:border-border" name="landing-faq">
                <summary className="flex list-none items-center justify-between gap-6 px-6 py-5 text-lg font-semibold tracking-tight sm:px-7 sm:py-6 sm:text-xl [&::-webkit-details-marker]:hidden">
                  {t(`faq.items.${k}.q`)}
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted transition-all duration-300 group-open:rotate-45 group-open:bg-tile-yellow group-open:text-tile-foreground" aria-hidden>
                    <Plus className="size-5" />
                  </span>
                </summary>
                <p className="px-6 pb-6 text-[16px] leading-relaxed text-muted-foreground sm:px-7 sm:pb-7">{t(`faq.items.${k}.a`)}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------ */

function FinalCta({ t }: { t: T }) {
  return (
    <section className="px-3 py-6 sm:px-5">
      <Reveal className="relative mx-auto max-w-[90rem] overflow-hidden rounded-[2.5rem] sm:rounded-[3.5rem]">
        <Image src={handshake} alt={t("cta.imageAlt")} fill sizes="100vw" placeholder="blur" className="lp-kenburns object-cover" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/65 to-black/30" />
        <div className="relative px-6 py-24 text-white sm:px-14 sm:py-32 lg:px-20 lg:py-40">
          <h2 className={cn(display, "max-w-4xl text-[clamp(2.5rem,6.5vw,5.75rem)] leading-[0.93]")}>{t("cta.title")}</h2>
          <p className="mt-6 max-w-xl text-lg text-white/75 sm:text-xl">{t("cta.subtitle")}</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild size="lg" className="group h-14 bg-white px-8 text-base text-black hover:bg-white/90">
              <Link href="/sign-up">
                {t("cta.primary")}
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="h-14 border border-white/30 px-8 text-base text-white hover:bg-white/10 hover:text-white">
              <Link href="/sign-in">{t("cta.secondary")}</Link>
            </Button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------ */

function Footer({ t, year }: { t: T; year: number }) {
  const sections = ["how", "privacy", "commissions", "faq"] as const;
  return (
    <footer className="px-4 pt-20 pb-10 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-12 border-b border-border/60 pb-14 md:grid-cols-12">
          <div className="md:col-span-6">
            <Logo />
            <p className="mt-5 max-w-sm text-[15px] text-muted-foreground">{t("footer.tagline")}</p>
          </div>
          <nav aria-label={t("footer.product")} className="md:col-span-3">
            <p className="text-sm font-semibold">{t("footer.product")}</p>
            <ul className="mt-4 grid gap-2.5 text-[15px] text-muted-foreground">
              {sections.map((s) => (
                <li key={s}>
                  <a href={`#${s}`} className="transition-colors hover:text-foreground">{t(`nav.${s}`)}</a>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label={t("footer.account")} className="md:col-span-3">
            <p className="text-sm font-semibold">{t("footer.account")}</p>
            <ul className="mt-4 grid gap-2.5 text-[15px] text-muted-foreground">
              <li>
                <Link href="/sign-up" className="inline-flex items-center gap-1 transition-colors hover:text-foreground">
                  {t("footer.createAccount")} <ArrowUpRight className="size-3.5" aria-hidden />
                </Link>
              </li>
              <li>
                <Link href="/sign-in" className="transition-colors hover:text-foreground">{t("footer.signIn")}</Link>
              </li>
            </ul>
          </nav>
        </div>
        <p aria-hidden className={cn(display, "mt-10 text-center text-[clamp(4rem,17vw,15rem)] leading-[0.8] text-foreground/[0.06] select-none")}>MissionHub</p>
        <div className="mt-8 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{t("footer.rights", { year: String(year) })}</p>
          <p>{t("footer.legal")}</p>
          <p>{t("footer.photos")}</p>
        </div>
      </div>
    </footer>
  );
}
