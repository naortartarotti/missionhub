import { msg } from "@/i18n/translate";
import { parseMajorToMinor } from "@/lib/money/format";
import { computeFee, type FeeBasis } from "@/lib/money/terms";
import { legacyHireSchema, type ReportHireInput } from "./schemas";

type Money = Pick<ReportHireInput, "termsVersionId" | "baseSalary" | "targetBonus" | "invoicedDifferent" | "invoicedFee" | "differenceReason" | "differenceNote" | "fee" | "currency" | "guaranteeDays">;
type EffectiveTerms = { id: string; fee_basis: FeeBasis; rate_bps: number | null; flat_fee_minor: number | null; min_fee_minor: number | null; currency: string };

export type HireMoneyArgs = {
  p_terms_version?: string;
  p_base_minor?: number;
  p_bonus_minor?: number;
  p_invoiced_fee_minor?: number;
  p_difference_reason?: string;
  p_difference_note?: string;
  p_legacy_fee_minor?: number;
  p_legacy_currency?: string;
  p_legacy_guarantee_days?: number;
};

/**
 * The N2 fee fields of the record-hire and fee-details forms (BR-21 to BR-26; N3 BR-8, BR-31), parsed in the
 * referral's own terms currency. Snapshot referrals: base (and bonus), I ≠ C with reason and note; posting a
 * fee, currency or guarantee is refused. Legacy referrals: free entry. Returns RPC args or an action error.
 */
export function parseHireMoney(
  terms: { recorded: false } | { recorded: true; effective: EffectiveTerms },
  v: Money,
): { ok: true; args: HireMoneyArgs } | { ok: false; error: string; fieldErrors?: Record<string, string[]> } {
  const fieldErrors: Record<string, string[]> = {};
  if (terms.recorded) {
    if (v.fee || v.currency || v.guaranteeDays) return { ok: false, error: msg("errors.hire_terms_fixed") };
    const t = terms.effective;
    // copy-review P16: the terms the form showed must still be the effective ones (the RPC re-checks).
    if (v.termsVersionId !== t.id) return { ok: false, error: msg("errors.hire_terms_changed") };
    const money = (raw: string | undefined) => (raw ? parseMajorToMinor(raw, t.currency) : null);
    let baseMinor: number | null = null;
    let bonusMinor: number | null = null;
    if (t.fee_basis !== "flat") {
      baseMinor = money(v.baseSalary);
      if (!baseMinor || baseMinor <= 0) fieldErrors.baseSalary = [msg("referrals.validation.baseRequired")];
      if (t.fee_basis === "pct_total_cash") {
        bonusMinor = v.targetBonus === "0" ? 0 : money(v.targetBonus);
        if (bonusMinor === null || bonusMinor < 0) fieldErrors.targetBonus = [msg("referrals.validation.bonusRequired")];
      }
    }
    const computed = computeFee({ feeBasis: t.fee_basis, rateBps: t.rate_bps, flatFeeMinor: t.flat_fee_minor, minFeeMinor: t.min_fee_minor }, { baseMinor, bonusMinor });
    let invoicedMinor: number | null = null;
    if (v.invoicedDifferent) {
      invoicedMinor = money(v.invoicedFee);
      if (!invoicedMinor || invoicedMinor <= 0) fieldErrors.invoicedFee = [msg("referrals.validation.invoicedPositive")];
      else if (computed !== null && invoicedMinor === computed) fieldErrors.invoicedFee = [msg("referrals.validation.invoicedSame")];
      if (!v.differenceReason) fieldErrors.differenceReason = [msg("referrals.validation.reasonRequired")];
      if (v.differenceReason === "other" && !v.differenceNote) fieldErrors.differenceNote = [msg("referrals.validation.noteRequiredOther")];
      if (v.differenceNote && v.differenceNote.length > 500) fieldErrors.differenceNote = [msg("referrals.validation.noteTooLong")];
    }
    if (Object.keys(fieldErrors).length) return { ok: false, error: msg("errors.invalidFields"), fieldErrors };
    return {
      ok: true,
      args: {
        p_terms_version: t.id,
        p_base_minor: baseMinor ?? undefined,
        p_bonus_minor: bonusMinor ?? undefined,
        ...(v.invoicedDifferent ? { p_invoiced_fee_minor: invoicedMinor!, p_difference_reason: v.differenceReason!, p_difference_note: v.differenceNote ?? undefined } : {}),
      },
    };
  }
  if (v.baseSalary || v.targetBonus || v.invoicedDifferent || v.invoicedFee) return { ok: false, error: msg("errors.terms_not_recorded") };
  const legacy = legacyHireSchema.safeParse({ fee: v.fee ?? "", currency: v.currency ?? "", guaranteeDays: v.guaranteeDays || undefined });
  if (!legacy.success) {
    return { ok: false, error: msg("errors.invalidFields"), fieldErrors: Object.fromEntries(legacy.error.issues.map((i) => [String(i.path[0]), [i.message]])) };
  }
  const fee = parseMajorToMinor(legacy.data.fee, legacy.data.currency);
  if (!fee) return { ok: false, error: msg("errors.invalid_fee"), fieldErrors: { fee: [msg("referrals.validation.validAmount")] } };
  return { ok: true, args: { p_legacy_fee_minor: fee, p_legacy_currency: legacy.data.currency, p_legacy_guarantee_days: legacy.data.guaranteeDays } };
}
