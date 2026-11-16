import "server-only";
import type { RequestContext } from "@/server/auth/context";
import { getDefaultRule } from "@/features/commissions/queries";
import { getJobsTermsState, type JobTermsState } from "./queries";
import { termsFromState, type SplitView } from "./terms-display";

export { getDefaultRule };
import type { TermsFormContext } from "./components/terms-fields";

/** The terms card's server context for one job's owner row (null row = new job). */
export function termsFormContext(row: JobTermsState | null, split: SplitView): TermsFormContext {
  const current = row ? termsFromState(row) : null;
  return {
    current: current && row ? { ...current, attestedByName: row.attested_by_name ?? null, attestedAt: row.attested_at ?? null } : null,
    referralCount: row?.referral_count ?? 0,
    split,
  };
}

/** Edit form / job page: the owner state for one job plus the default rule. */
export async function getJobTermsContext(ctx: RequestContext, jobId: string) {
  const [[row], split] = await Promise.all([getJobsTermsState(ctx, jobId), getDefaultRule(ctx)]);
  return { row: row ?? null, split, form: termsFormContext(row ?? null, split) };
}
