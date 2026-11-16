"use client";

import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleAlert, ExternalLink, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useFormatter, useT } from "@/i18n/client";
import { acceptNetworkRules } from "../actions";
import type { RulesLocale } from "../domain";
import { RULES_LOCALE_KEY, rulesLocaleOrder } from "../locale";
import { SupportSentence } from "./support-sentence";
import { isFutureInstant } from "../ui-state";

export type AcceptanceTexts = Partial<Record<RulesLocale, { text: ReactNode; toc: ReactNode; changeSummary: string | null }>>;

export type AcceptanceVersion = { id: string; label: string; effectiveAt: string; type?: string | null; legalReason?: string | null };

type Common = {
  orgName: string;
  version: AcceptanceVersion;
  /** Server-rendered RulesText + TOC per locale (the text never goes through a client-side parser). */
  texts: AcceptanceTexts;
  defaultLocale: RulesLocale;
  /** Show the "on behalf of {org}" statement (spec §2.2 table; never in settlement mode). */
  needOrg: boolean;
  /** "{org} accepted these rules on {date}." for an org admin whose org already accepted. */
  orgAcceptedAt?: string | null;
  supportEmail: string | null;
  historyHref: string;
};

type Props =
  | (Common & { variant: "gate"; orgSlug: string })
  | (Common & { variant: "reaccept"; orgSlug: string; nextHref: string; compareHref?: string | null })
  | (Common & {
      variant: "onboarding";
      /** Called with the locale shown when both statements are ticked and the member continues. */
      onContinue: (locale: RulesLocale) => void;
      continueLabel: string;
      initial?: { locale: RulesLocale; accepted: boolean };
      alert?: string | null;
    });

/**
 * S1: the acceptance block, in its three variants (onboarding step, first-access gate, re-acceptance).
 * The text runs in the page flow (no nested scroll box at 375px); the statements, status line and
 * button sit in a normal block at the end, reachable through "Skip to acceptance" (spec §3 mobile).
 */
export function AcceptanceBlock(props: Props) {
  const t = useT("network");
  const f = useFormatter();
  const router = useRouter();
  const uid = useId();
  const initial = props.variant === "onboarding" ? props.initial : undefined;
  const available = rulesLocaleOrder(props.defaultLocale).filter((l) => props.texts[l]);
  const [locale, setLocale] = useState<RulesLocale>(initial?.locale && props.texts[initial.locale] ? initial.locale : props.texts[props.defaultLocale] ? props.defaultLocale : available[0]);
  const [member, setMember] = useState(initial?.accepted ?? false);
  const [org, setOrg] = useState(initial?.accepted ?? false);
  const [languageChanged, setLanguageChanged] = useState(false);
  const [error, setError] = useState<{ text: string; changed?: boolean } | null>(props.variant === "onboarding" && props.alert ? { text: props.alert, changed: true } : null);
  const [pending, start] = useTransition();
  const statementsRef = useRef<HTMLFieldSetElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const current = props.texts[locale];
  const [future] = useState(() => isFutureInstant(props.version.effectiveAt));
  const ready = member && (!props.needOrg || org);
  const statusId = `${uid}-status`;
  const statusText = ready ? "" : languageChanged ? t("accept.languageChanged") : props.needOrg ? t("accept.needBoth") : t("accept.needOne");

  const switchLanguage = (l: RulesLocale) => {
    if (l === locale) return;
    setLocale(l);
    if (member || org) {
      setMember(false);
      setOrg(false);
      setLanguageChanged(true);
    }
  };

  const submit = () => {
    if (!ready) return;
    if (props.variant === "onboarding") {
      props.onContinue(locale);
      return;
    }
    start(async () => {
      setError(null);
      let r: Awaited<ReturnType<typeof acceptNetworkRules>>;
      try {
        r = await acceptNetworkRules(props.orgSlug, { versionId: props.version.id, locale, personal: true, forOrg: props.needOrg });
      } catch {
        setError({ text: t("accept.saveError") });
        return;
      }
      if (!r.ok) {
        const changed = r.code === "rules_version_changed";
        setError({ text: changed ? t("accept.versionChanged") : r.error, changed });
        setMember(false);
        setOrg(false);
        requestAnimationFrame(() => errorRef.current?.focus());
        // The server now has another current version: reload so the block shows it, boxes unticked.
        if (changed) router.refresh();
        return;
      }
      toast.success(t("accept.done"));
      if (props.variant === "reaccept") router.push(props.nextHref);
      else router.refresh();
    });
  };

  if (!current) {
    return (
      <p role="status" className="flex items-start gap-2 rounded-2xl bg-muted px-4 py-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {t("accept.noVersion")}
      </p>
    );
  }

  const summary = current.changeSummary;
  // The onboarding card is narrow: contents stay a disclosure there; elsewhere a sticky side column from lg.
  const sideToc = props.variant !== "onboarding";
  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        {props.variant !== "onboarding" ? (
          <h2 className="text-xl font-semibold tracking-tight">{t("accept.title", { label: props.version.label })}</h2>
        ) : (
          <h2 className="text-lg font-semibold tracking-tight">{t("accept.title", { label: props.version.label })}</h2>
        )}
        <p className="text-sm text-muted-foreground">
          {future ? t("accept.effectiveFuture", { date: f.etDate(props.version.effectiveAt) }) : t("accept.effective", { date: f.etDate(props.version.effectiveAt) })}
        </p>
        {props.variant === "gate" ? <p className="max-w-prose text-[15px] text-pretty">{t("accept.gateIntro")}</p> : null}
        {props.variant === "reaccept" ? <p className="max-w-prose text-[15px] text-pretty">{t("accept.reacceptIntro", { label: props.version.label })}</p> : null}
        <a href={`#${uid}-statements`} className="justify-self-start text-sm font-medium underline underline-offset-4 focus-visible:outline-2">
          {t("accept.skip")}
        </a>
      </div>

      {error ? (
        <div ref={errorRef} tabIndex={-1} role="alert" className="flex items-start gap-2 rounded-2xl bg-danger-soft px-3.5 py-3 text-sm text-danger outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error.text}</span>
        </div>
      ) : null}

      <div className="grid gap-2">
        <p id={`${uid}-lang`} className="text-sm font-medium">{t("accept.language")}</p>
        <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none]">
          <div role="group" aria-labelledby={`${uid}-lang`} className="inline-flex min-w-max gap-1 rounded-full border border-border bg-card p-1">
            {available.map((l) => (
              <button
                key={l}
                type="button"
                lang={l}
                aria-pressed={l === locale}
                onClick={() => switchLanguage(l)}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 sm:min-h-9",
                  l === locale ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t(`accept.languageOption.${RULES_LOCALE_KEY[l]}`)}
              </button>
            ))}
          </div>
        </div>
        <p className="sr-only" aria-live="polite">{t("accept.languageShownSr", { language: t(`accept.languageInline.${RULES_LOCALE_KEY[locale]}`) })}</p>
      </div>

      {props.variant === "reaccept" && (summary || props.version.legalReason) ? (
        <section aria-labelledby={`${uid}-changes`} className="grid gap-2 rounded-2xl border border-border/60 bg-muted/40 p-4">
          <h3 id={`${uid}-changes`} className="text-sm font-semibold">{t("accept.changesTitle")}</h3>
          {summary ? <p className="text-sm whitespace-pre-line text-pretty" lang={locale}>{summary}</p> : null}
          {props.version.legalReason ? <p className="text-sm text-pretty">{t("versions.legalReason", { reason: props.version.legalReason })}</p> : null}
          {props.compareHref ? (
            <a href={props.compareHref} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-1.5 justify-self-start text-sm font-medium underline underline-offset-4 sm:min-h-0">
              {t("accept.compare")} <ExternalLink className="size-3.5" aria-hidden />
              <span className="sr-only">{t("accept.newTabSr")}</span>
            </a>
          ) : null}
        </section>
      ) : null}

      <details className={cn("group rounded-2xl border border-border/60 px-4 py-3 text-sm", sideToc && "lg:hidden")}>
        <summary className="min-h-9 cursor-pointer font-medium">{t("accept.contents")}</summary>
        <div className="mt-2">{current.toc}</div>
      </details>
      <div className={cn("grid gap-6", sideToc && "lg:grid-cols-[220px_minmax(0,1fr)]")}>
        <div className={cn("hidden", sideToc && "lg:block")}>
          <div className="sticky top-28 grid gap-2">
            <p className="text-sm font-semibold">{t("accept.contents")}</p>
            {current.toc}
          </div>
        </div>
        <div className="min-w-0 rounded-3xl border border-border/60 bg-card p-5 sm:p-6">{current.text}</div>
      </div>

      <fieldset ref={statementsRef} id={`${uid}-statements`} tabIndex={-1} className="grid scroll-mt-28 gap-3 outline-none">
        <legend className="mb-2 text-base font-semibold">{t("accept.statementsLegend")}</legend>
        {props.orgAcceptedAt && !props.needOrg ? (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("accept.orgAlready", { org: props.orgName, date: f.etDate(props.orgAcceptedAt) })}
          </p>
        ) : null}
        <Label className="flex min-h-11 items-start gap-3 rounded-2xl border border-border/60 bg-card p-3.5 text-sm leading-5 font-normal has-[[data-state=checked]]:border-foreground">
          <Checkbox checked={member} onCheckedChange={(v) => { setMember(v === true); setLanguageChanged(false); }} className="mt-0.5" />
          <span>{t("accept.member")}</span>
        </Label>
        {props.needOrg ? (
          <Label className="flex min-h-11 items-start gap-3 rounded-2xl border border-border/60 bg-card p-3.5 text-sm leading-5 font-normal has-[[data-state=checked]]:border-foreground">
            <Checkbox checked={org} onCheckedChange={(v) => { setOrg(v === true); setLanguageChanged(false); }} className="mt-0.5" />
            <span>{t("accept.org", { org: props.orgName })}</span>
          </Label>
        ) : null}
        <p id={statusId} aria-live="polite" className="min-h-5 text-sm text-muted-foreground">{statusText}</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button type="button" size="lg" className="min-h-11 w-full sm:w-auto" disabled={!ready || pending} aria-describedby={statusText ? statusId : undefined} onClick={submit}>
            {pending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {pending
              ? t("accept.submitting")
              : props.variant === "onboarding"
                ? props.continueLabel
                : props.variant === "reaccept"
                  ? t("accept.submitReaccept", { label: props.version.label })
                  : t("accept.submit")}
          </Button>
          <Link href={props.historyHref} className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4 sm:min-h-0">
            {t("accept.history")}
          </Link>
        </div>
        {props.variant !== "onboarding" ? (
          <p className="text-sm text-muted-foreground">
            <SupportSentence before={t("accept.leaveBefore")} after={t("accept.leaveAfter")} email={props.supportEmail} />
          </p>
        ) : null}
      </fieldset>
    </div>
  );
}
