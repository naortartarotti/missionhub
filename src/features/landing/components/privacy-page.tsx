import type { CSSProperties } from "react";
import Image from "next/image";
import { BadgeCheck, Building2, CircleDashed, EyeOff, FileCheck2, Lock, ScrollText, ShieldCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { display, Reveal, type T } from "./shared";
import portrait1 from "../assets/portrait1.jpg";
import portrait2 from "../assets/portrait2.jpg";
import portrait3 from "../assets/portrait3.jpg";

export async function PrivacyPage() {
  const t = await getT("landing");
  return <Privacy t={t} />;
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
    <section className="px-3 pt-24 pb-6 sm:px-5 sm:pt-28">
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
              <h1 className={cn(display, "mt-5 text-[clamp(2.6rem,6.5vw,5.5rem)] leading-[0.92]")}>{t("privacy.title")}</h1>
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

