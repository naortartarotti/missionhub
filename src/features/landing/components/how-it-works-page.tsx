import Image from "next/image";
import { Building2, Check, Handshake, Send, UserPlus, UserRoundSearch, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { display, Reveal, SectionHeader, type T } from "./shared";
import recruiter from "../assets/recruiter.jpg";
import laptop from "../assets/laptop.jpg";

export async function HowItWorksPage() {
  const t = await getT("landing");
  return (
    <>
      <HowItWorks t={t} />
      <Sides t={t} />
    </>
  );
}

/* ------------------------------------------------------------------------------------------ */

function HowItWorks({ t }: { t: T }) {
  const steps: { key: "one" | "two" | "three" | "four"; icon: LucideIcon; tone: string }[] = [
    { key: "one", icon: UserPlus, tone: "bg-tile-yellow" },
    { key: "two", icon: UserRoundSearch, tone: "bg-tile-blue" },
    { key: "three", icon: Send, tone: "bg-tile-lilac" },
    { key: "four", icon: Handshake, tone: "bg-tile-green" },
  ];
  return (
    <section className="px-4 pt-32 pb-24 sm:px-6 sm:pt-44 sm:pb-36">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-12">
        <SectionHeader as="h1" className="lg:sticky lg:top-32 lg:col-span-5 lg:self-start" eyebrow={t("how.eyebrow")} title={t("how.title")} subtitle={t("how.subtitle")} />
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

