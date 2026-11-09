"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

const SECTIONS = ["how", "privacy", "commissions", "faq"] as const;

export function LandingNav() {
  const t = useT("landing");
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
      <div
        className={cn(
          "mx-auto flex max-w-7xl items-center gap-3 rounded-full border px-3 py-2 pl-5 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          scrolled || open
            ? "border-border/70 bg-card/80 shadow-[0_10px_40px_-20px_rgb(0_0_0/0.35)] backdrop-blur-xl"
            : "border-transparent bg-transparent",
        )}
      >
        <Link href="/" aria-label="MissionHub" className="shrink-0 rounded-full">
          <Logo />
        </Link>

        <nav aria-label={t("nav.label")} className="mx-auto hidden items-center gap-1 lg:flex">
          {SECTIONS.map((s) => (
            <a key={s} href={`#${s}`} className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              {t(`nav.${s}`)}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
          <div className="hidden items-center gap-1.5 sm:flex">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
          <Button asChild variant="ghost" className="hidden md:inline-flex">
            <Link href="/sign-in">{t("nav.signIn")}</Link>
          </Button>
          <Button asChild className="group">
            <Link href="/sign-up">
              {t("nav.getStarted")}
              <ArrowRight className="transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
            aria-label={open ? t("nav.closeMenu") : t("nav.openMenu")}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="size-[18px]" aria-hidden /> : <Menu className="size-[18px]" aria-hidden />}
          </Button>
        </div>
      </div>

      <div
        id="landing-mobile-menu"
        hidden={!open}
        className="mx-auto mt-2 max-w-7xl rounded-[2rem] border border-border/70 bg-card/95 p-3 shadow-[0_20px_60px_-30px_rgb(0_0_0/0.4)] backdrop-blur-xl lg:hidden"
      >
        <nav aria-label={t("nav.label")} className="grid">
          {SECTIONS.map((s) => (
            <a key={s} href={`#${s}`} onClick={() => setOpen(false)} className="rounded-2xl px-4 py-3 text-lg font-medium tracking-tight hover:bg-accent">
              {t(`nav.${s}`)}
            </a>
          ))}
          <Link href="/sign-in" className="rounded-2xl px-4 py-3 text-lg font-medium tracking-tight hover:bg-accent md:hidden">
            {t("nav.signIn")}
          </Link>
        </nav>
        <div className="mt-2 flex items-center gap-2 border-t border-border/60 px-2 pt-3 sm:hidden">
          <LanguageSwitcher variant="full" />
          <ThemeToggle variant="ghost" />
        </div>
      </div>
    </header>
  );
}
