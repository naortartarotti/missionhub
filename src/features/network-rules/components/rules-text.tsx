import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { INTL_RULES_LANG } from "../locale";
import type { RulesLocale } from "../domain";
import { parseRulesMarkdown, sectionAnchor, type Inline } from "../markdown";

/**
 * Renders a Network Rules text (spec S1, S4, S6 preview). The Markdown is parsed into plain text
 * segments (markdown.ts): no HTML is ever rendered from the stored text. Wrapped in the text's
 * `lang` so screen readers and hyphenation use the rules language, not the UI language (§2.0).
 */
export function RulesText({ body, locale, className }: { body: string; locale: RulesLocale; className?: string }) {
  const blocks = parseRulesMarkdown(body);
  return (
    <div lang={INTL_RULES_LANG[locale]} className={cn("grid gap-3 text-[15px] leading-relaxed text-pretty", className)}>
      {blocks.map((b, i) => {
        if (b.kind === "heading") {
          const H = (`h${b.level}` as "h2" | "h3" | "h4");
          return (
            <H key={i} id={b.id} className={cn("scroll-mt-28 font-semibold tracking-tight", b.level === 2 ? "mt-4 text-lg" : b.level === 3 ? "mt-3 text-base" : "text-[15px]")}>
              {b.text}
            </H>
          );
        }
        if (b.kind === "list") {
          const L = b.ordered ? "ol" : "ul";
          return (
            <L key={i} className={cn("grid gap-1.5 pl-5", b.ordered ? "list-decimal" : "list-disc")}>
              {b.items.map((item, j) => (
                <li key={j}>
                  <Inlines items={item} />
                </li>
              ))}
            </L>
          );
        }
        return (
          <p key={i} id={b.id} className="scroll-mt-28">
            <Inlines items={b.inlines} />
          </p>
        );
      })}
    </div>
  );
}

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((it, k) =>
        it.bold ? <strong key={k} className="font-semibold">{it.text}</strong> : it.italic ? <em key={k}>{it.text}</em> : <Fragment key={k}>{it.text}</Fragment>,
      )}
    </>
  );
}

/** Table of contents from the stored section list ("1. Membership and acceptance" …). */
export function RulesToc({ sections, locale, label }: { sections: { number: string; title: string }[]; locale: RulesLocale; label: string }) {
  if (!sections.length) return null;
  return (
    <nav aria-label={label} lang={INTL_RULES_LANG[locale]}>
      <ol className="grid gap-1 text-sm">
        {sections.map((s) => (
          <li key={s.number}>
            <a href={`#${sectionAnchor(s.number)}`} className="inline-flex min-h-9 items-center rounded-lg px-2 text-muted-foreground underline-offset-4 hover:bg-muted hover:text-foreground hover:underline">
              {s.number}. {s.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
