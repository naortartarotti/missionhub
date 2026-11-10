import type { CSSProperties, ReactNode } from "react";
import type { getT } from "@/i18n/server";
import { cn } from "@/lib/utils";

export type T = Awaited<ReturnType<typeof getT<"landing">>>;

/** Public marketing pages, in nav order. `privacy` lives in the footer only. */
export const PAGES = [
  { key: "how", href: "/how-it-works" },
  { key: "privacy", href: "/privacy" },
  { key: "commissions", href: "/commissions" },
  { key: "faq", href: "/faq" },
] as const;
export type PageKey = (typeof PAGES)[number]["key"];
export const NAV_PAGES = PAGES.filter((p) => p.key !== "privacy");

export const display = "font-semibold tracking-[-0.045em] text-balance";

/** Fades/slides a block in the first time it scrolls into view (see RevealObserver + globals.css). */
export function Reveal({ children, delay = 0, className, as: Tag = "div" }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "li" | "section" | "p" }) {
  return (
    <Tag data-reveal="" className={className} style={delay ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties) : undefined}>
      {children}
    </Tag>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3.5 py-1.5 text-[13px] font-medium text-muted-foreground", className)}>
      <span className="size-1.5 rounded-full bg-tile-yellow ring-4 ring-tile-yellow/30" aria-hidden />
      {children}
    </p>
  );
}

/** `as="h1"` on the section that opens an internal page, `h2` everywhere else. */
export function SectionHeader({ eyebrow, title, subtitle, className, center, as: Heading = "h2" }: { eyebrow: string; title: string; subtitle?: string; className?: string; center?: boolean; as?: "h1" | "h2" }) {
  return (
    <div className={cn(center && "mx-auto text-center", className)}>
      <Reveal>
        <Eyebrow>{eyebrow}</Eyebrow>
      </Reveal>
      <Reveal delay={80}>
        <Heading className={cn(display, "mt-5 text-[clamp(2.4rem,6vw,5rem)] leading-[0.95]")}>{title}</Heading>
      </Reveal>
      {subtitle ? (
        <Reveal delay={160}>
          <p className={cn("mt-5 max-w-xl text-lg text-muted-foreground sm:text-xl", center && "mx-auto")}>{subtitle}</p>
        </Reveal>
      ) : null}
    </div>
  );
}
