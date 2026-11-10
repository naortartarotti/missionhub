import { Plus } from "lucide-react";
import { getT } from "@/i18n/server";
import { Reveal, SectionHeader, type T } from "./shared";

const ITEMS = ["a", "b", "c", "d", "e"] as const;

export async function FaqPage() {
  const t = await getT("landing");
  // FAQPage structured data so search engines can show the answers as rich results.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: ITEMS.map((k) => ({
      "@type": "Question",
      name: t(`faq.items.${k}.q`),
      acceptedAnswer: { "@type": "Answer", text: t(`faq.items.${k}.a`) },
    })),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Faq t={t} />
    </>
  );
}

/* ------------------------------------------------------------------------------------------ */

function Faq({ t }: { t: T }) {
  return (
    <section className="px-4 pt-32 pb-24 sm:px-6 sm:pt-44 sm:pb-36">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-12">
        <SectionHeader as="h1" className="lg:sticky lg:top-32 lg:col-span-5 lg:self-start" eyebrow={t("faq.eyebrow")} title={t("faq.title")} />
        <div className="grid gap-3 lg:col-span-7">
          {ITEMS.map((k, i) => (
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

