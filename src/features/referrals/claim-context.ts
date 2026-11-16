import "server-only";
import type { RequestContext } from "@/server/auth/context";
import { listClaimEvidenceReferrals, type ReferralPresentation } from "./queries";
import type { ClaimContext } from "./components/claim-dialog";

/**
 * Server-prepared context for the objection form (S5): deadline, delivery date and the earlier
 * referrals the picker may offer. Null unless the backend says the referral is objection-eligible
 * for this org (hiring side, AC-27).
 */
export async function getClaimContext(
  ctx: RequestContext,
  r: { id: string; source_org?: { name: string } | null; terms_version_id?: string | null },
  p: ReferralPresentation | null,
): Promise<ClaimContext | null> {
  if (!p || p.side !== "target" || !p.can_claim || !p.claim_deadline_at || !p.delivered_at) return null;
  const options = await listClaimEvidenceReferrals(ctx, r.id);
  // N2 (BR-20, backend.md §3.6): the look-back follows the referral's window (6 for legacy referrals).
  return {
    referralId: r.id,
    version: p.version,
    partner: r.source_org?.name ?? "",
    deadlineAt: p.claim_deadline_at,
    deadlineLeft: p.claim_business_days_left,
    deliveredAt: p.delivered_at,
    options,
    lookbackMonths: p.lookback_months ?? 6,
    priorDateMin: p.claim_prior_date_min ?? null,
    snapshot: Boolean(r.terms_version_id),
  };
}
