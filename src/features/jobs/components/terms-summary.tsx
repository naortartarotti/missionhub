"use client";

import type { ReactNode } from "react";
import { ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { commissionRuleLabel } from "@/lib/labels";
import { useFormatter, useGlobalT, useT } from "@/i18n/client";
import { changedRows, feeLong, SQL_CONFIDENTIAL_CLIENT, type SplitView, type TermsRowKey, type TermsView } from "../terms-display";

export type TermsVariant = "owner" | "partner" | "referral" | "compact" | "admin";

/**
 * One read-only renderer for a terms object (spec §3 TermsSummary): a `dl` of label + value rows,
 * never disabled inputs. Used on the job page (owner), the composer (partner), the referral page
 * (referral), the agreement dialog (compact) and, in 5b, the hire dialog and admin pages.
 */
export function TermsSummary({
  terms,
  split,
  variant,
  client,
  changedFrom,
  amountShown = false,
  estimate,
  extraRows,
  className,
}: {
  terms: TermsView;
  split?: SplitView | null;
  variant: TermsVariant;
  /** Partner variant: the client as partners see it (raw `client_label`). */
  client?: string;
  /** Partner variant after `terms_changed`: the version the form showed, for the Changed badges. */
  changedFrom?: TermsView | null;
  /** An amount in the fee currency is already on screen (estimate, flat share), so no Currency row. */
  amountShown?: boolean;
  /** Estimate box, rendered right after the fee rows (partner, owner). */
  estimate?: ReactNode;
  /** Extra `dl` rows at the end (Expected share on the referral and compact variants). */
  extraRows?: ReactNode;
  className?: string;
}) {
  const t = useT("jobs");
  const tg = useGlobalT();
  const f = useFormatter();
  const changed = variant === "partner" ? changedRows(changedFrom, terms) : new Set<TermsRowKey>();
  const hints = variant === "partner" || variant === "owner";
  const showCurrency = terms.feeBasis !== "flat" && !amountShown && terms.minFeeMinor === null;

  return (
    <div className={cn("grid gap-4", className)}>
      <dl className="grid gap-3">
        <Row label={t("terms.rows.fee")} changed={changed.has("fee")}>{feeLong(terms, tg, f)}</Row>
        {terms.feeBasis !== "flat" && terms.minFeeMinor !== null ? (
          <Row label={t("terms.rows.minimum")} changed={changed.has("minimum")}>{f.money(terms.minFeeMinor, terms.currency, { code: true })}</Row>
        ) : null}
        {showCurrency ? <Row label={t("terms.rows.currency")} changed={changed.has("currency")}>{t("terms.currencyPct", { currency: terms.currency })}</Row> : null}
      </dl>
      {estimate}
      <dl className="grid gap-3">
        <Row label={t("terms.rows.searchType")} changed={changed.has("searchType")} hint={hints ? t(`terms.searchTypeHint.${terms.searchType}`) : undefined}>
          {tg(`labels.searchType.${terms.searchType}`)}
        </Row>
        {terms.guaranteeDays > 0 && terms.guaranteeRemedy ? (
          <Row label={t("terms.rows.guarantee")} changed={changed.has("guarantee")}>
            {t("terms.guarantee", { count: terms.guaranteeDays, remedy: tg(`labels.guaranteeRemedy.${terms.guaranteeRemedy}`) })}
          </Row>
        ) : hints ? (
          // E-7: no guarantee is worth noticing before committing a candidate.
          <div className="grid gap-0.5 rounded-xl bg-info-soft px-3 py-2 text-info">
            <dt className="text-xs">{t("terms.rows.guarantee")}</dt>
            <dd className="flex items-start gap-1.5 text-sm font-medium">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {t("terms.noGuarantee")}
                <span className="block text-xs font-normal text-foreground">{t("terms.noGuaranteeHint")}</span>
                {changed.has("guarantee") ? <ChangedBadge /> : null}
              </span>
            </dd>
          </div>
        ) : (
          <Row label={t("terms.rows.guarantee")} changed={changed.has("guarantee")}>{t("terms.noGuarantee")}</Row>
        )}
        <Row label={t("terms.rows.paymentTerms")} changed={changed.has("paymentTerms")}>
          {terms.paymentTermsDays === 0 ? t("terms.paymentTermsZero") : t("terms.paymentTerms", { count: terms.paymentTermsDays })}
        </Row>
        <Row label={t("terms.rows.window")} changed={changed.has("window")}>{t("terms.window", { count: terms.ownershipMonths })}</Row>
        {split ? (
          <Row label={t("terms.rows.split")}>
            {t("terms.split", { sourcing: f.percent(split.sourcingBps), hiring: f.percent(split.jobOwnerBps), platform: f.percent(split.platformBps) })}
            <span className="block text-xs font-normal text-muted-foreground">{t("terms.splitRule", { rule: commissionRuleLabel(split.ruleName, tg), version: String(split.ruleVersion) })}</span>
          </Row>
        ) : null}
        {variant === "partner" && client !== undefined ? (
          <Row label={t("terms.rows.client")}>
            {/* listOpportunities already localizes the SQL placeholder; either form means "hidden client". */}
            {client === SQL_CONFIDENTIAL_CLIENT || client === tg("opportunities.card.confidentialClient") ? t("terms.clientConfidential") : client}
          </Row>
        ) : null}
        {variant === "partner" || variant === "referral" ? <Row label={t("terms.rows.directClient")}>{t("terms.directClient")}</Row> : null}
        {extraRows}
      </dl>
    </div>
  );
}

/** One label + value pair. Must be rendered inside a `dl`. */
export function Row({ label, hint, changed, children }: { label: string; hint?: string; changed?: boolean; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-pretty break-words">
        {children}
        {hint ? <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{hint}</span> : null}
        {changed ? <ChangedBadge /> : null}
      </dd>
    </div>
  );
}

/** "Changed" (info tone, icon + text) under a value that differs from the version the form showed. */
function ChangedBadge() {
  const t = useT("jobs");
  return (
    <span className="mt-1 flex w-fit items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-xs font-medium text-info">
      <Info className="size-3" aria-hidden />
      {t("terms.changedBadge")}
    </span>
  );
}

/** The five fixed network-rule lines (⚖️ draft until N7). Expanded on the composer, a disclosure on the referral page. */
export function NetworkRules({ collapsible = false }: { collapsible?: boolean }) {
  const t = useT("jobs");
  const body = (
    <>
      <ul className="grid list-disc gap-1.5 pl-5 text-sm text-pretty marker:text-muted-foreground">
        {(["ownership", "priorPresentation", "response", "payout", "tax"] as const).map((k) => (
          <li key={k}>{t(`terms.network.${k}`)}</li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground italic">{t("terms.network.draftMarker")}</p>
    </>
  );
  if (collapsible) {
    return (
      <details className="group rounded-2xl border border-border/60">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-3 text-sm font-medium focus-visible:outline-2 [&::-webkit-details-marker]:hidden">
          {t("terms.network.summary")}
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="grid gap-2 px-3 pb-3">
          <h4 className="sr-only">{t("terms.network.title")}</h4>
          {body}
        </div>
      </details>
    );
  }
  return (
    <section className="grid gap-2 border-t border-border/60 pt-4" aria-labelledby="network-rules-title">
      <h3 id="network-rules-title" className="text-sm font-semibold">{t("terms.network.title")}</h3>
      {body}
    </section>
  );
}
