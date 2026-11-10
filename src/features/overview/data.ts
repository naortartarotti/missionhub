import "server-only";
import { can, type RequestContext } from "@/server/auth/context";
import { getJobMatchSummary, listOpportunities, needsDecision, type Opportunity } from "@/features/matching/queries";
import { listPlacements } from "@/features/commissions/queries";
import { ledgerBalances, summarizeForOrg, type LedgerEntry } from "@/features/commissions/domain";
import { receivedCounts } from "@/features/referrals/queries";
import { BUCKETS, DECIDABLE } from "@/features/referrals/review";
import type { Database } from "@/server/db/database.types";

type ReferralStatus = Database["public"]["Enums"]["referral_status"];

/** How many rows of one kind the attention queue shows before pointing to the full list. */
const ATTENTION_PER_KIND = 3;
/** Partner-fit counts are one RPC per job; above this many open jobs the total is left out rather than undercounted. */
const MAX_JOBS_FOR_FIT_TOTAL = 12;
const PAYABLE_STATUSES = new Set(["commission_payable", "payment_partially_verified"]);

/** Dashboard pipeline chart: live stages in order (the review step groups its three statuses). Labels in `overview.pipeline.stages.<key>`. */
export const PIPELINE_CHART_STAGES = [
  { key: "review", statuses: ["submitted", "under_review", "info_requested"] },
  { key: "accepted", statuses: ["accepted"] },
  { key: "interviewing", statuses: ["interviewing"] },
  { key: "offer", statuses: ["offer"] },
  { key: "hired", statuses: ["hired"] },
] as const;
export type PipelineChartStage = (typeof PIPELINE_CHART_STAGES)[number]["key"];

function stageCounts(rows: { status: string }[]) {
  const counts = PIPELINE_CHART_STAGES.map((s) => ({ key: s.key as PipelineChartStage, count: rows.filter((r) => (s.statuses as readonly string[]).includes(r.status)).length }));
  const live = counts.reduce((n, s) => n + s.count, 0);
  return { stages: counts, closed: rows.length - live };
}

export type BestOpportunity = {
  jobId: string;
  jobTitle: string;
  jobOrg: string;
  clientLabel: string;
  internal: boolean;
  /** Highest-scoring undecided match on this job. */
  top: Opportunity;
  /** Undecided matches on this job, top included. */
  candidateCount: number;
};

/**
 * Everything the Overview renders, read from the same sources the dedicated pages use.
 * Each query stays scoped to the current organization (RLS + explicit org filters).
 */
export async function loadOverview(ctx: RequestContext) {
  const org = ctx.organizationId;
  const canMatch = can(ctx, "referrals:submit");
  const canMoney = can(ctx, "commissions:read");

  const [activeCandidates, allCandidates, openJobs, opportunities, received, toReview, infoRequested, pendingAgreements, sent, placements, receivedAll] = await Promise.all([
    ctx.db.from("candidates").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("status", "active_for_matching"),
    ctx.db.from("candidates").select("id", { count: "exact", head: true }).eq("organization_id", org).neq("status", "deleted"),
    ctx.db
      .from("jobs")
      .select("id", { count: "exact" })
      .eq("organization_id", org)
      .eq("status", "active")
      .eq("accepts_external_referrals", true)
      .limit(MAX_JOBS_FOR_FIT_TOTAL + 1),
    canMatch ? listOpportunities(ctx) : Promise.resolve([] as Opportunity[]),
    receivedCounts(ctx),
    // Received referrals the job owner can decide on now, longest-waiting first.
    ctx.db
      .from("referrals")
      .select("id, job_title_snapshot, candidate_label, submitted_at, source_org:organizations!referrals_source_org_id_fkey(name)", { count: "exact" })
      .eq("target_org_id", org)
      .in("status", [...DECIDABLE] as ReferralStatus[])
      .order("submitted_at", { ascending: true })
      .limit(ATTENTION_PER_KIND),
    // Sent referrals where the hiring recruiter is waiting on an answer from us.
    ctx.db
      .from("referrals")
      .select("id, job_title_snapshot, candidate_label, updated_at", { count: "exact" })
      .eq("source_org_id", org)
      .eq("status", "info_requested")
      .order("updated_at", { ascending: true })
      .limit(ATTENTION_PER_KIND),
    ctx.db
      .from("referrals")
      .select("id, job_title_snapshot, candidate_label, collaboration_agreements!inner(status)")
      .eq("source_org_id", org)
      .eq("collaboration_agreements.status", "pending_source")
      .limit(ATTENTION_PER_KIND),
    ctx.db.from("referrals").select("status").eq("source_org_id", org),
    canMoney ? listPlacements(ctx) : Promise.resolve([] as Awaited<ReturnType<typeof listPlacements>>),
    ctx.db.from("referrals").select("status").eq("target_org_id", org),
  ]);

  // ---- Candidate side: undecided AI matches, grouped by partner job ------------------------
  const undecided = opportunities.filter(needsDecision);
  const byJob = new Map<string, BestOpportunity>();
  for (const o of undecided) {
    const j = byJob.get(o.job_id);
    if (!j) {
      byJob.set(o.job_id, { jobId: o.job_id, jobTitle: o.job_title, jobOrg: o.job_org_name, clientLabel: o.client_label, internal: o.internal, top: o, candidateCount: 1 });
    } else {
      j.candidateCount += 1;
      if (o.score > j.top.score || (o.score === j.top.score && (o.your_share_minor ?? 0) > (j.top.your_share_minor ?? 0))) j.top = o;
    }
  }
  const bestOpportunities = [...byJob.values()].sort((a, b) => b.top.score - a.top.score || (b.top.your_share_minor ?? 0) - (a.top.your_share_minor ?? 0)).slice(0, 3);
  // Same set as the Opportunities "To review" tab (saved matches have their own tab), so the numbers agree.
  const toReviewMatches = undecided.filter((o) => o.triage_state !== "saved");
  const matches = { count: toReviewMatches.length, fresh: toReviewMatches.filter((o) => o.is_new).length, jobs: new Set(toReviewMatches.map((o) => o.job_id)).size };

  // ---- Money: confirmed shares only (client payment received), never projections -----------
  const cur = ctx.currency;
  let earned = 0;
  const payoutsDue: { id: string; jobTitle: string; candidate: string }[] = [];
  for (const p of placements) {
    const b = ledgerBalances((p.ledger ?? []) as LedgerEntry[]);
    const mine = p.source_org_id === org;
    if (p.currency === cur && b.received > 0) earned += mine ? b.sourcingAllocated : b.jobOwnerAllocated;
    // Job owner records the partner payout once the client has paid (same rule as the placement page).
    if (!mine && PAYABLE_STATUSES.has(p.status) && b.sourcingOutstanding > 0) {
      payoutsDue.push({ id: p.id, jobTitle: p.referral?.job_title_snapshot ?? "", candidate: p.referral?.candidate_label ?? "" });
    }
  }
  const projected = summarizeForOrg(placements as never, org, cur).projected;

  // ---- Activity -----------------------------------------------------------------------------
  const sentRows = sent.data ?? [];
  const progressing = new Set<string>(BUCKETS.active);
  const sentStats = {
    total: sentRows.length,
    progressing: sentRows.filter((r) => progressing.has(r.status)).length,
    hired: sentRows.filter((r) => r.status === "hired").length,
  };

  const openJobIds = (openJobs.data ?? []).map((j) => j.id);
  const openJobCount = openJobs.count ?? openJobIds.length;
  let partnerFits: number | null = null;
  if (openJobCount > 0 && openJobCount <= MAX_JOBS_FOR_FIT_TOTAL && can(ctx, "jobs:read")) {
    const summaries = await Promise.all(openJobIds.map((id) => getJobMatchSummary(ctx, id)));
    partnerFits = summaries.reduce((n, s) => n + s.strong_count + s.potential_count, 0);
  }

  return {
    canMatch,
    canMoney,
    setup: {
      hasCandidate: (allCandidates.count ?? 0) > 0,
      hasActiveCandidate: (activeCandidates.count ?? 0) > 0,
      hasOpenJob: openJobCount > 0,
      hasSentReferral: sentStats.total > 0,
    },
    stats: { matchesToReview: matches.count, referralsToReview: received.review, earned, projected, currency: cur },
    attention: {
      referrals: (toReview.data ?? []).map((r) => ({
        id: r.id,
        jobTitle: r.job_title_snapshot,
        candidate: r.candidate_label,
        partner: r.source_org?.name ?? null,
        submittedAt: r.submitted_at,
      })),
      referralsTotal: toReview.count ?? 0,
      matches,
      infoRequests: (infoRequested.data ?? []).map((r) => ({ id: r.id, jobTitle: r.job_title_snapshot, candidate: r.candidate_label })),
      infoRequestsTotal: infoRequested.count ?? 0,
      agreements: (pendingAgreements.data ?? []).map((r) => ({ id: r.id, jobTitle: r.job_title_snapshot, candidate: r.candidate_label })),
      payouts: payoutsDue.slice(0, ATTENTION_PER_KIND),
    },
    bestOpportunities,
    // Where every referral stands right now, on each side of the marketplace.
    pipeline: { received: stageCounts(receivedAll.data ?? []), sent: stageCounts(sentRows) },
    activity: {
      sent: sentStats,
      jobs: { open: openJobCount, partnerFits, progressing: received.active },
    },
  };
}

export type OverviewData = Awaited<ReturnType<typeof loadOverview>>;
