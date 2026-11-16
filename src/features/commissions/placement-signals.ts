import "server-only";
import { assertCan, type RequestContext } from "@/server/auth/context";
import { getReferralTerms } from "@/features/referrals/queries";
import type { ReferralTerms } from "@/features/referrals/components/referral-terms";
import type { Formatter } from "@/i18n/format";
import type { Translator } from "@/i18n/translate";

/**
 * N3 display signals for the Commissions pages, read through RLS (both orgs of the placement):
 * - BR-14 "Invoice overdue": `invoice_due_at` has passed and no client invoice is recorded (backend.md §4: no RPC);
 * - BR-31 the frozen estimate of fee-pending placements, from the referral's own terms (`getReferralTerms`).
 * Frontend-owned so the backend's `queries.ts` stays untouched while drop 2 is built (frontend.md).
 */
export type PlacementSignals = { invoiceOverdue: boolean; terms: ReferralTerms | null };

export const isInvoiceOverdue = (p: { invoice_due_at: string | null; invoiceCount: number }, now = Date.now()) =>
  !!p.invoice_due_at && new Date(p.invoice_due_at).getTime() < now && p.invoiceCount === 0;

export async function getPlacementSignals(ctx: RequestContext): Promise<Map<string, PlacementSignals>> {
  assertCan(ctx, "commissions:read");
  const { data, error } = await ctx.db
    .from("placements")
    .select("id, status, referral_id, invoice_due_at, invoices:invoice_records(id)")
    .or(`source_org_id.eq.${ctx.organizationId},target_org_id.eq.${ctx.organizationId}`);
  if (error) throw error;
  const rows = data ?? [];
  const pending = rows.filter((p) => p.status === "fee_pending");
  const terms = new Map(await Promise.all(pending.map(async (p) => [p.id, await getReferralTerms(ctx, p.referral_id)] as const)));
  const now = Date.now();
  return new Map(
    rows.map((p) => [p.id, { invoiceOverdue: isInvoiceOverdue({ invoice_due_at: p.invoice_due_at, invoiceCount: p.invoices?.length ?? 0 }, now), terms: terms.get(p.id) ?? null }]),
  );
}

/**
 * The fee-pending estimate line (spec §2.4, N2 BR-36): legacy → "terms not recorded"; flat → the fixed fee;
 * a frozen estimate → "~amount" labelled as an estimate; otherwise the rate. Never an invented amount.
 */
export function feePendingEstimate(terms: ReferralTerms | null, t: Translator<"commissions">, f: Formatter): { text: string; legacy: boolean } {
  if (!terms || !terms.recorded) return { text: t("feePending.legacy"), legacy: true };
  const e = terms.effective;
  if (e.fee_basis === "flat" && e.flat_fee_minor !== null) return { text: t("feePending.flat", { amount: f.money(e.flat_fee_minor, e.currency, { code: true }) }), legacy: false };
  if (terms.feeEstimateMinor !== null) return { text: t("feePending.estimate", { amount: f.money(terms.feeEstimateMinor, e.currency, { code: true }) }), legacy: false };
  return { text: t("feePending.rateOnly", { rate: f.percent(e.rate_bps ?? 0) }), legacy: false };
}
