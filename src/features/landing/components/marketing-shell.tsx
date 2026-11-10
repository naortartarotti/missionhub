import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { LandingNav } from "./landing-nav";
import { RevealObserver } from "./reveal-observer";
import { display, PAGES, Reveal, type T } from "./shared";
import handshake from "../assets/handshake.jpg";

/** Chrome shared by every public marketing page: nav, closing call to action and footer. */
export async function MarketingShell({ children }: { children: ReactNode }) {
  const t = await getT("landing");
  const year = new Date().getFullYear();
  return (
    <div data-landing="" className="relative overflow-x-clip bg-background text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">
        {t("nav.skip")}
      </a>
      <LandingNav />
      <main id="main">
        {children}
        <FinalCta t={t} />
      </main>
      <Footer t={t} year={year} />
      <RevealObserver />
    </div>
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
              {PAGES.map((p) => (
                <li key={p.key}>
                  <Link href={p.href} className="transition-colors hover:text-foreground">{t(`nav.${p.key}`)}</Link>
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
