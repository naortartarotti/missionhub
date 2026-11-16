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

/** A match waiting in the Suggestions "To review" tab: needs a decision and isn't saved for later. */
export const isToReview = (o: Opportunity) => needsDecision(o) && o.triage_state !== "saved";

/** Suggestions waiting for a decision (sidebar badge). Same set as the Home card and the "To review" tab. */
export async function countOpportunitiesToReview(ctx: RequestContext) {
  if (!can(ctx, "referrals:submit")) return 0;
  try {
    return (await fetchAll(ctx)).filter(isToReview).length;
  } catch {
    return 0;
  }
}

/**
 * N2: the partner card of an opportunity (BR-8, BR-9, T10): the job's current terms version, the current
 * default split and the estimate (null on % bases when the hiring side keeps the band private).
 */
export type PartnerTerms = Pick<
  Opportunity,
  | "terms_version_id" | "terms_version_no" | "terms_published_at" | "terms_updated_at"
  | "fee_basis" | "rate_bps" | "flat_fee_minor" | "min_fee_minor" | "fee_currency" | "search_type"
  | "guarantee_days" | "guarantee_remedy" | "payment_terms_days" | "ownership_months"
  | "rule_name" | "rule_version" | "sourcing_bps" | "job_owner_bps" | "platform_bps"
  | "estimated_fee_minor" | "estimated_share_minor" | "client_label" | "internal"
>;

export function partnerTerms(o: Opportunity): PartnerTerms {
  return {
    terms_version_id: o.terms_version_id, terms_version_no: o.terms_version_no, terms_published_at: o.terms_published_at,
    terms_updated_at: o.terms_updated_at, fee_basis: o.fee_basis, rate_bps: o.rate_bps, flat_fee_minor: o.flat_fee_minor,
    min_fee_minor: o.min_fee_minor, fee_currency: o.fee_currency, search_type: o.search_type, guarantee_days: o.guarantee_days,
    guarantee_remedy: o.guarantee_remedy, payment_terms_days: o.payment_terms_days, ownership_months: o.ownership_months,
    rule_name: o.rule_name, rule_version: o.rule_version, sourcing_bps: o.sourcing_bps, job_owner_bps: o.job_owner_bps,
    platform_bps: o.platform_bps, estimated_fee_minor: o.estimated_fee_minor, estimated_share_minor: o.estimated_share_minor,
    client_label: o.client_label, internal: o.internal,
  };
}
