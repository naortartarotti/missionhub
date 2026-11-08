import "server-only";
import { assertCan, type RequestContext } from "@/server/auth/context";
import type { Database } from "@/server/db/database.types";

export type Opportunity = Database["public"]["Functions"]["get_opportunities"]["Returns"][number];
export type Evidence = { factor: string; label: string };

export async function listOpportunities(ctx: RequestContext, opts: { candidateId?: string; matchId?: string } = {}) {
  assertCan(ctx, "referrals:submit");
  const { data, error } = await ctx.db.rpc("get_opportunities", {
    p_org: ctx.organizationId,
    p_candidate: opts.candidateId,
    p_match: opts.matchId,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getJobMatchSummary(ctx: RequestContext, jobId: string) {
  assertCan(ctx, "jobs:read");
  const { data, error } = await ctx.db.rpc("get_job_match_summary", { p_job: jobId });
  if (error) throw error;
  return data?.[0] ?? { strong_count: 0, potential_count: 0, last_refreshed_at: null };
}

export const asEvidence = (v: unknown): Evidence[] => (Array.isArray(v) ? (v as Evidence[]) : []);
