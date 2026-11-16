"use server";

import { guard, id, parse } from "@/server/actions/guard";
import { assertCan, getRequestContext } from "@/server/auth/context";
import { msg } from "@/i18n/translate";
import type { ActionResult } from "@/lib/actions/result";
import { getReferralHireState, getReferralTerms } from "./queries";
import type { HireDialogState } from "./components/report-hire-dialog";
import type { ReferralTerms } from "./components/referral-terms";

/**
 * N3 E2 (PD-075): the record-hire dialog opened from the pipeline board reads the same server state as the
 * referral page (`get_referral_hire_state` + `getReferralTerms`), on demand, so the board doesn't call the RPC
 * for every card. Read-only; the write still goes through `reportHire`, which re-reads the variant itself.
 * Anyone who can't act on the referral gets "Referral not found" (spec §2.0).
 */
export async function loadHireDialog(orgSlug: string, referralId: string): Promise<ActionResult<{ hire: HireDialogState; terms: ReferralTerms | null }>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "referrals:review");
    parse(id, referralId);
    const state = await getReferralHireState(ctx, referralId);
    if (!state || state.side !== "target" || (!state.can_record && state.variant !== "objection_open")) {
      return { ok: false, error: msg(state?.side === "target" ? "errors.hire_not_eligible" : "referrals.errors.notFound") };
    }
    const terms = await getReferralTerms(ctx, referralId);
    const hire: HireDialogState = {
      status: state.status,
      version: state.version,
      delivered_at: state.delivered_at,
      variant: state.variant,
      legacy: state.legacy,
      other_role_allowed: state.other_role_allowed,
      job_title: state.job_title,
    };
    return { ok: true, data: { hire, terms } };
  });
}
