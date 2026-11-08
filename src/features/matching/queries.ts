import "server-only";
import { cache } from "react";
import { getT } from "@/i18n/server";
import { assertCan, can, type RequestContext } from "@/server/auth/context";
import type { Database } from "@/server/db/database.types";

export type Opportunity = Database["public"]["Functions"]["get_opportunities"]["Returns"][number];
export type { StoredEvidence as Evidence } from "./evidence";
import type { StoredEvidence } from "./evidence";

// One RPC per request for the unfiltered list (layout badge + page share it).
const fetchAll = cache(async (ctx: RequestContext) => {
  const { data, error } = await ctx.db.rpc("get_opportunities", { p_org: ctx.organizationId });
  if (error) throw error;
  return localizeRows(data ?? []);
});

// get_opportunities() masks hidden client names with this English placeholder; show it in the viewer's language.
const CONFIDENTIAL_CLIENT = "Confidential client";
async function localizeRows<T extends { client_label: string }>(rows: T[]): Promise<T[]> {
  if (!rows.some((r) => r.client_label === CONFIDENTIAL_CLIENT)) return rows;
  const label = (await getT("opportunities"))("card.confidentialClient");
  return rows.map((r) => (r.client_label === CONFIDENTIAL_CLIENT ? { ...r, client_label: label } : r));
}

export async function listOpportunities(ctx: RequestContext, opts: { candidateId?: string; matchId?: string } = {}) {
  assertCan(ctx, "referrals:submit");
  if (!opts.candidateId && !opts.matchId) return fetchAll(ctx);
  const { data, error } = await ctx.db.rpc("get_opportunities", {
    p_org: ctx.organizationId,
    p_candidate: opts.candidateId,
    p_match: opts.matchId,
  });
  if (error) throw error;
  return localizeRows(data ?? []);
}

/** A match needs a decision when it's a real fit, not yet submitted, and not dismissed. */
export const needsDecision = (o: Opportunity) =>
  o.band !== "not_eligible" && !o.referral_id && o.triage_state !== "dismissed";

export async function getJobMatchSummary(ctx: RequestContext, jobId: string) {
  assertCan(ctx, "jobs:read");
  const { data, error } = await ctx.db.rpc("get_job_match_summary", { p_job: jobId });
  if (error) throw error;
  return data?.[0] ?? { strong_count: 0, potential_count: 0, last_refreshed_at: null };
}

export const asEvidence = (v: unknown): StoredEvidence[] => (Array.isArray(v) ? (v as StoredEvidence[]) : []);

/** Clears the "New" flag. Called after the opportunities page has rendered them once. */
export async function markMatchesSeen(ctx: RequestContext, matchIds: string[]) {
  if (!matchIds.length) return;
  const { error } = await ctx.db.rpc("mark_matches_seen", { p_org: ctx.organizationId, p_matches: matchIds.slice(0, 500) });
  if (error) console.error(JSON.stringify({ evt: "matches.mark_seen_failed", message: error.message.slice(0, 200) }));
}

/** Count of matches the organization hasn't looked at yet (sidebar badge). */
export async function countNewOpportunities(ctx: RequestContext) {
  if (!can(ctx, "referrals:submit")) return 0;
  try {
    return (await fetchAll(ctx)).filter((o) => o.is_new && needsDecision(o)).length;
  } catch {
    return 0;
  }
}
