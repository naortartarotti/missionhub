/**
 * N2 terms display: one normalized shape for a terms version (job version, referral snapshot or
 * amendment) and the short / long fee texts every surface shares. Pure and isomorphic: pass the
 * translator and formatter of the side you render on (getGlobalT/getFormatter or the client hooks).
 * Every amount uses currency-code display (BR-38); percentages use Intl (fr "20 %").
 */
import type { GlobalTranslator } from "@/i18n/translate";
import type { Formatter } from "@/i18n/format";
import type { FeeBasis, GuaranteeRemedy, SearchType } from "@/lib/money/terms";

export type TermsView = {
  versionNo: number;
  /** Version date (job version published / amendment recorded). */
  publishedAt: string | null;
  kind: "job" | "amendment";
  feeBasis: FeeBasis;
  rateBps: number | null;
  flatFeeMinor: number | null;
  minFeeMinor: number | null;
  currency: string;
  searchType: SearchType;
  guaranteeDays: number;
  guaranteeRemedy: GuaranteeRemedy | null;
  paymentTermsDays: number;
  ownershipMonths: number;
};

/** T10: the commission rule shown with a card (current default for jobs, snapshot rule for referrals). */
export type SplitView = { ruleName: string; ruleVersion: number; sourcingBps: number; jobOwnerBps: number; platformBps: number };

type Fee = Pick<TermsView, "feeBasis" | "rateBps" | "flatFeeMinor" | "currency">;

/** "20% of base" / "CAD 15,000 flat" (KPI tile, sent list, opportunities when no amount is shown). */
export function feeShort(t: Fee, tg: GlobalTranslator, f: Formatter): string {
  if (t.feeBasis === "flat") return tg("jobs.terms.feeShort.flat", { amount: f.money(t.flatFeeMinor, t.currency, { code: true, whole: true }) });
  const rate = f.percent(t.rateBps ?? 0);
  return t.feeBasis === "pct_total_cash" ? tg("jobs.terms.feeShort.pctTotalCash", { rate }) : tg("jobs.terms.feeShort.pctBase", { rate });
}

/** "20% of first-year base salary" / "CAD 15,000.00 flat fee" (the Placement fee row). */
export function feeLong(t: Fee, tg: GlobalTranslator, f: Formatter): string {
  if (t.feeBasis === "flat") return tg("jobs.terms.fee.flat", { amount: f.money(t.flatFeeMinor, t.currency, { code: true }) });
  const rate = f.percent(t.rateBps ?? 0);
  return t.feeBasis === "pct_total_cash" ? tg("jobs.terms.fee.pctTotalCash", { rate }) : tg("jobs.terms.fee.pctBase", { rate });
}

/** "45% of the fee (fee: 20% of the base salary at hire)": expected share without a frozen estimate (BR-36). */
export function shareAtHire(shareBps: number, t: Pick<TermsView, "feeBasis" | "rateBps">, tg: GlobalTranslator, f: Formatter): string {
  const vars = { percent: f.percent(shareBps), rate: f.percent(t.rateBps ?? 0) };
  return t.feeBasis === "pct_total_cash" ? tg("jobs.terms.shareAtHire.pctTotalCash", vars) : tg("jobs.terms.shareAtHire.pctBase", vars);
}

/** Row-level comparison for the "Changed" badges after `terms_changed` (S5-e). */
export type TermsRowKey = "fee" | "minimum" | "currency" | "searchType" | "guarantee" | "paymentTerms" | "window";

export function changedRows(from: TermsView | null | undefined, to: TermsView): Set<TermsRowKey> {
  const out = new Set<TermsRowKey>();
  if (!from) return out;
  if (from.feeBasis !== to.feeBasis || from.rateBps !== to.rateBps || from.flatFeeMinor !== to.flatFeeMinor || (to.feeBasis === "flat" && from.currency !== to.currency)) out.add("fee");
  if (from.minFeeMinor !== to.minFeeMinor || (to.minFeeMinor !== null && from.currency !== to.currency)) out.add("minimum");
  if (to.feeBasis !== "flat" && from.currency !== to.currency) out.add("currency");
  if (from.searchType !== to.searchType) out.add("searchType");
  if (from.guaranteeDays !== to.guaranteeDays || from.guaranteeRemedy !== to.guaranteeRemedy) out.add("guarantee");
  if (from.paymentTermsDays !== to.paymentTermsDays) out.add("paymentTerms");
  if (from.ownershipMonths !== to.ownershipMonths) out.add("window");
  return out;
}

/** The SQL label for a hidden client (`get_opportunities.client_label`); displayed through i18n. */
export const SQL_CONFIDENTIAL_CLIENT = "Confidential client";

// ---- Adapters from the drop-1 contract (backend.md §3.2, §3.3, §4.4) ---------------------------

type TermsColumns = {
  fee_basis: FeeBasis;
  rate_bps: number | null;
  flat_fee_minor: number | null;
  min_fee_minor: number | null;
  currency: string;
  search_type: SearchType;
  guarantee_days: number;
  guarantee_remedy: GuaranteeRemedy | null;
  payment_terms_days: number;
  ownership_months: number;
};

const fromColumns = (r: TermsColumns) => ({
  feeBasis: r.fee_basis,
  rateBps: r.rate_bps,
  flatFeeMinor: r.flat_fee_minor,
  minFeeMinor: r.min_fee_minor,
  currency: r.currency,
  searchType: r.search_type,
  guaranteeDays: r.guarantee_days,
  guaranteeRemedy: r.guarantee_days === 0 ? null : r.guarantee_remedy,
  paymentTermsDays: r.payment_terms_days,
  ownershipMonths: r.ownership_months,
});

/** A `job_terms_versions` row (referral snapshot / amendment, `getReferralTerms`). */
export function termsFromRow(r: TermsColumns & { version_no: number; created_at: string; kind: "job" | "amendment" }): TermsView {
  return { versionNo: r.version_no, publishedAt: r.created_at, kind: r.kind, ...fromColumns(r) };
}

/** An owner row of `get_jobs_terms_state` (null when the job has no version). */
export function termsFromState(
  r: Omit<TermsColumns, "fee_basis" | "search_type" | "currency" | "guarantee_days" | "payment_terms_days" | "ownership_months"> & {
    terms_version_id: string | null;
    version_no: number | null;
    published_at: string | null;
    fee_basis: FeeBasis | null;
    search_type: SearchType | null;
    currency: string | null;
    guarantee_days: number | null;
    payment_terms_days: number | null;
    ownership_months: number | null;
  },
): TermsView | null {
  if (!r.terms_version_id || !r.fee_basis || !r.search_type || r.currency === null || r.guarantee_days === null || r.payment_terms_days === null || r.ownership_months === null) return null;
  return {
    versionNo: r.version_no ?? 1,
    publishedAt: r.published_at,
    kind: "job",
    ...fromColumns({ ...r, fee_basis: r.fee_basis, search_type: r.search_type, currency: r.currency, guarantee_days: r.guarantee_days, payment_terms_days: r.payment_terms_days, ownership_months: r.ownership_months }),
  };
}

/** The partner card of an opportunity (`PartnerTerms`, get_opportunities). */
export function termsFromPartner(p: {
  terms_version_no: number;
  terms_published_at: string;
  fee_basis: FeeBasis;
  rate_bps: number | null;
  flat_fee_minor: number | null;
  min_fee_minor: number | null;
  fee_currency: string;
  search_type: SearchType;
  guarantee_days: number;
  guarantee_remedy: GuaranteeRemedy | null;
  payment_terms_days: number;
  ownership_months: number;
}): TermsView {
  return {
    versionNo: p.terms_version_no,
    publishedAt: p.terms_published_at,
    kind: "job",
    ...fromColumns({ ...p, currency: p.fee_currency }),
  };
}

export function splitFromPartner(p: { rule_name: string; rule_version: number; sourcing_bps: number; job_owner_bps: number; platform_bps: number }): SplitView {
  return { ruleName: p.rule_name, ruleVersion: p.rule_version, sourcingBps: p.sourcing_bps, jobOwnerBps: p.job_owner_bps, platformBps: p.platform_bps };
}

/**
 * S4 share figure on opportunity cards (BR-9): flat → the exact share ("Your share if hired"); % with
 * an estimate → "~share" ("Your estimated share"); % without one (band kept private, or an internal
 * job) → the basis text ("20% of base", "Fee"), never an amount.
 */
export function shareFigure(
  o: { fee_basis: FeeBasis; rate_bps: number | null; flat_fee_minor: number | null; fee_currency: string | null; estimated_share_minor: number | null },
  tg: GlobalTranslator,
  f: Formatter,
): { amount: string | null; text: string; label: string } {
  const currency = o.fee_currency ?? "CAD";
  if (o.estimated_share_minor !== null && o.estimated_share_minor !== undefined) {
    const flat = o.fee_basis === "flat";
    const amount = f.money(o.estimated_share_minor, currency, { code: true, whole: true, approx: !flat });
    return { amount, text: amount, label: tg(flat ? "opportunities.jobGroup.shareIfHired" : "opportunities.jobGroup.shareEstimated") };
  }
  return { amount: null, text: feeShort({ feeBasis: o.fee_basis, rateBps: o.rate_bps, flatFeeMinor: o.flat_fee_minor, currency }, tg, f), label: tg("opportunities.jobGroup.feeOnly") };
}

/** "Highest earnings" (S4, AC-22): jobs with an amount first (by amount), then by rate, then fit. */
export function compareEarnings(
  a: { estimated_share_minor: number | null; rate_bps: number | null; score: number },
  b: { estimated_share_minor: number | null; rate_bps: number | null; score: number },
): number {
  return (b.estimated_share_minor ?? -1) - (a.estimated_share_minor ?? -1) || (b.rate_bps ?? 0) - (a.rate_bps ?? 0) || b.score - a.score;
}
