import "server-only";
import type { RequestContext } from "@/server/auth/context";
import { expectedShare } from "./terms";
import { BUCKETS, BUCKET_KEYS, PAGE_SIZE, PENDING, type Bucket, type QueueSort } from "./review";

export async function listReferrals(ctx: RequestContext, side: "sent" | "received") {
  const col = side === "sent" ? "source_org_id" : "target_org_id";
  const { data, error } = await ctx.db
    .from("referrals")
    .select("id, status, job_title_snapshot, candidate_label, submitted_at, updated_at, source_org:organizations!referrals_source_org_id_fkey(name), target_org:organizations!referrals_target_org_id_fkey(name)")
    .eq(col, ctx.organizationId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

/**
 * "Referrals sent", grouped by the partner's job: each job's current status (open, paused, filled…
 * via get_sent_referral_jobs, since jobs RLS hides partner jobs) and, per candidate, the latest
 * stage change the hiring recruiter recorded (with their note, if any).
 */
export async function listSentByJob(ctx: RequestContext) {
  const { data: rows, error } = await ctx.db
    .from("referrals")
    // The source org owns the candidate, so it sees the real person behind the anonymous label.
    // N2 (BR-36, PD-050 c): each referral's own frozen terms (basis, rate or flat amount, currency); no share.
    .select("id, job_id, status, job_title_snapshot, candidate_label, submitted_at, updated_at, fit_score, target_org:organizations!referrals_target_org_id_fkey(name), link:referral_candidate_links(candidate:candidates(id, full_name)), terms:job_terms_versions!referrals_terms_version_id_fkey(version_no, fee_basis, rate_bps, flat_fee_minor, currency)")
    .eq("source_org_id", ctx.organizationId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  if (!rows?.length) return [];
  const ids = rows.map((r) => r.id);
  const [jobs, events] = await Promise.all([
    ctx.db.rpc("get_sent_referral_jobs", { p_org: ctx.organizationId }),
    ctx.db.from("referral_status_events").select("referral_id, to_status, actor_side, reason, created_at").in("referral_id", ids).order("created_at", { ascending: false }),
  ]);
  // A missing job status (e.g. migration not applied yet) must not break the page.
  const jobStatus = new Map((jobs.data ?? []).map((j) => [j.job_id, j]));
  const latest = new Map<string, NonNullable<typeof events.data>[number]>();
  for (const e of events.data ?? []) if (!latest.has(e.referral_id)) latest.set(e.referral_id, e);

  const enriched = rows.map(({ link, ...r }) => ({ ...r, candidate: link?.candidate ?? null, lastEvent: latest.get(r.id) ?? null }));
  const groups = new Map<string, { jobId: string; title: string; partner: string; job: { status: (typeof jobs.data & {})[number]["status"]; updatedAt: string } | null; referrals: typeof enriched }>();
  for (const r of enriched) {
    let g = groups.get(r.job_id);
    if (!g) {
      const j = jobStatus.get(r.job_id);
      g = { jobId: r.job_id, title: r.job_title_snapshot, partner: r.target_org?.name ?? "", job: j ? { status: j.status, updatedAt: j.status_updated_at } : null, referrals: [] };
      groups.set(r.job_id, g);
    }
    g.referrals.push(r);
  }
  // Rows arrive newest-first, so groups are already ordered by their most recent activity.
  return [...groups.values()];
}

export async function getReferralDetail(ctx: RequestContext, id: string) {
  const { data: referral, error } = await ctx.db
    .from("referrals")
    .select("*, source_org:organizations!referrals_source_org_id_fkey(name), target_org:organizations!referrals_target_org_id_fkey(name)")
    .eq("id", id)
    .or(`source_org_id.eq.${ctx.organizationId},target_org_id.eq.${ctx.organizationId}`)
    .maybeSingle();
  if (error) throw error;
  if (!referral) return null;
  const side: "source" | "target" = referral.source_org_id === ctx.organizationId ? "source" : "target";
  const [profile, events, messages, grants, agreement, transitions, link, placement] = await Promise.all([
    ctx.db.from("referral_shared_profiles").select("disclosed_fields, snapshot, created_at").eq("referral_id", id).maybeSingle(),
    ctx.db.from("referral_status_events").select("id, from_status, to_status, actor_side, actor_kind, reason, created_at").eq("referral_id", id).order("id"),
    ctx.db.from("referral_messages").select("id, author_side, body, created_at, author:profiles!referral_messages_author_profile_fk(full_name)").eq("referral_id", id).order("created_at"),
    ctx.db.from("referral_document_grants").select("id, file_name, status, revoked_at, size_bytes").eq("referral_id", id),
    ctx.db.from("collaboration_agreements").select("*").eq("referral_id", id).maybeSingle(),
    ctx.db.from("referral_transitions").select("to_status, requires_reason, requires_active_agreement").eq("from_status", referral.status).eq("actor_side", side),
    side === "source" ? ctx.db.from("referral_candidate_links").select("candidate_id, candidate:candidates(full_name)").eq("referral_id", id).maybeSingle() : Promise.resolve({ data: null }),
    ctx.db.from("placements").select("id, status, currency, contracted_fee_minor, computed_fee_minor").eq("referral_id", id).maybeSingle(),
  ]);
  return {
    referral,
    side,
    profile: profile.data,
    events: events.data ?? [],
    messages: messages.data ?? [],
    grants: grants.data ?? [],
    agreement: agreement.data,
    transitions: transitions.data ?? [],
    candidateId: link.data?.candidate_id ?? null,
    candidateName: (link.data && "candidate" in link.data ? link.data.candidate?.full_name : null) ?? null,
    placement: placement.data,
  };
}

// ---------------------------------------------------------------------------
// Job-owner review queue. Filtering, sorting and paging run in Postgres, so it scales past the
// 200-row cap of `listReferrals` (index: referrals_target_review_idx).

export type QueueParams = { bucket: Bucket; jobId?: string; sort: QueueSort; page: number };

export async function listReceivedQueue(ctx: RequestContext, p: QueueParams) {
  let q = ctx.db
    .from("referrals")
    .select(
      "id, status, version, job_id, job_title_snapshot, candidate_label, submitted_at, updated_at, fit_score, fit_evidence, decline_reason, sharing_revoked_at, claim_rejected_at, review_clock_started_at, source_org:organizations!referrals_source_org_id_fkey(name), profile:referral_shared_profiles(snapshot), grants:referral_document_grants(count)",
      { count: "exact" },
    )
    .eq("target_org_id", ctx.organizationId)
    .in("status", [...BUCKETS[p.bucket]]);
  if (p.jobId) q = q.eq("job_id", p.jobId);
  q =
    p.sort === "fit"
      ? q.order("fit_score", { ascending: false, nullsFirst: false }).order("submitted_at", { ascending: true })
      : q.order("submitted_at", { ascending: p.sort === "oldest" });
  const from = (p.page - 1) * PAGE_SIZE;
  const { data, error, count } = await q.range(from, from + PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}
export type QueueRow = Awaited<ReturnType<typeof listReceivedQueue>>["rows"][number];

/** Tab counters (respecting the job filter). Three head-only counts, no rows transferred. */
export async function receivedCounts(ctx: RequestContext, jobId?: string) {
  const entries = await Promise.all(
    BUCKET_KEYS.map(async (b) => {
      let q = ctx.db.from("referrals").select("id", { count: "exact", head: true }).eq("target_org_id", ctx.organizationId).in("status", [...BUCKETS[b]]);
      if (jobId) q = q.eq("job_id", jobId);
      const { count } = await q;
      return [b, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<Bucket, number>;
}

/** Statuses counted by the workspace "Referrals" badge: waiting for the hiring side's first decision. */
export const PENDING_BADGE_STATUSES = ["submitted", "under_review"] as const;

/**
 * Sidebar badge: received referrals the caller can act on now (submitted / under review).
 * RD-036: RLS scopes received referrals to the caller's own jobs for a plain recruiter and to the
 * whole organization for org_admin / recruiter_manager, so this is per-recruiter without a filter
 * here. Head-only count (no rows). Never throws: a failed count shows no badge.
 */
export async function countPendingReceivedReferrals(ctx: RequestContext): Promise<number> {
  const { count, error } = await ctx.db
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("target_org_id", ctx.organizationId)
    .in("status", [...PENDING_BADGE_STATUSES]);
  if (error) return 0;
  return count ?? 0;
}

/** Jobs that have received at least one referral, with how many are waiting for a decision. */
export async function receivedJobs(ctx: RequestContext) {
  const { data, error } = await ctx.db
    .from("jobs")
    .select("id, title, status, salary_min, salary_max, salary_currency, required_skills, preferred_skills, seniority, referrals!inner(status)")
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map(({ referrals, ...j }) => ({
    ...j,
    pending: referrals.filter((r) => PENDING.has(r.status)).length,
  }));
}
export type ReceivedJob = Awaited<ReturnType<typeof receivedJobs>>[number];

// ---------------------------------------------------------------------------
// N1 duplicate and prior-presentation protection: side-specific presentation state.

export type ClaimStatus = "open" | "contested" | "upheld" | "rejected" | "final";
type ClaimBase = {
  id: string;
  status: ClaimStatus;
  filed_at: string;
  prior_process_date: string;
  evidence_kind: "file" | "referral";
  note: string | null;
  contest_deadline_at: string;
  contest_business_days_left: number | null;
  contested_at: string | null;
  resolved_at: string | null;
  resolution: string | null;
  finalized_at: string | null;
};
type PresentationBase = {
  status: string;
  version: number;
  delivered_at: string | null;
  /** N2 (BR-19): null until delivery. */
  ownership_protected_until: string | null;
  claim_deadline_at: string | null;
  /** Business days left before the claim deadline, not counting today; 0 = ends today; null = passed. */
  claim_business_days_left: number | null;
  claim_rejected_at: string | null;
  review_clock_started_at: string | null;
};
export type SourcePresentation = PresentationBase & {
  side: "source";
  ownership_state: "protected" | "released" | "ended" | "expired" | "not_delivered";
  counts: boolean;
  released_at: string | null;
  can_release: boolean;
  can_release_on_withdraw: boolean;
  claim: (ClaimBase & { files: { n: number; uploaded_at: string; sha256: string | null }[]; can_contest: boolean }) | null;
};
export type TargetPresentation = PresentationBase & {
  side: "target";
  /** N2 (BR-20): the effective ownership window in months (6 for legacy referrals). */
  lookback_months: number;
  /** Delivery date − lookback_months (ET, end-of-month clamped); null when undelivered. */
  claim_prior_date_min: string | null;
  ownership_state: "protected" | "ended" | "expired";
  can_claim: boolean;
  claim:
    | (ClaimBase & {
        evidence_referral_id: string | null;
        files: { id: string; file_name: string; mime_type: string; size_bytes: number; uploaded_at: string; sha256: string | null; scan_status: "pending" | "clean" | "rejected" }[];
      })
    | null;
};
export type ReferralPresentation = SourcePresentation | TargetPresentation;

/** Presentation state for the referral page. The hiring side never receives the release flag (BR-25). */
export async function getReferralPresentation(ctx: RequestContext, referralId: string): Promise<ReferralPresentation | null> {
  const { data, error } = await ctx.db.rpc("get_referral_presentation", { p_referral: referralId, p_acting_org: ctx.organizationId });
  if (error) {
    if (error.message?.startsWith("not_found")) return null;
    throw error;
  }
  return data as unknown as ReferralPresentation;
}

export type EvidenceReferralOption = { referral_id: string; candidate_label: string; job_title: string; source_org_name: string; delivered_at: string; status: string;
  /** Sharing authorization revoked on that referral; it still qualifies as evidence (PD-027). */
  revoked: boolean };

/** Earlier referrals this org received that qualify as claim evidence (BR-26). */
export async function listClaimEvidenceReferrals(ctx: RequestContext, referralId: string): Promise<EvidenceReferralOption[]> {
  const { data, error } = await ctx.db.rpc("list_claim_evidence_referrals", { p_referral: referralId, p_acting_org: ctx.organizationId });
  if (error) {
    if (error.message?.startsWith("not_found")) return [];
    throw error;
  }
  return (data ?? []) as unknown as EvidenceReferralOption[];
}

const TERMS_COLUMNS =
  "id, kind, version_no, created_at, fee_basis, rate_bps, flat_fee_minor, min_fee_minor, currency, search_type, guarantee_days, guarantee_remedy, payment_terms_days, ownership_months, direct_client_attested_at";

/**
 * N2 (BR-36, BR-37): the terms a referral was sent under, read through RLS (both orgs of the referral).
 * `recorded: false` = legacy referral ("terms not recorded"). `effective` is the latest concierge
 * amendment (drop 2) or the snapshot. `expectedShareMinor` = the frozen estimate × the snapshot rule's
 * sourcing share (null when internal or when no estimate was shown to the sourcing side). Never the live
 * job, live band, live share_salary or current default rule. The client key is never readable.
 */
export async function getReferralTerms(ctx: RequestContext, referralId: string) {
  const { data: r, error } = await ctx.db
    .from("referrals")
    .select(`id, internal, fee_estimate_minor, rule:commission_rules!referrals_commission_rule_id_fkey(name, version, sourcing_bps, job_owner_bps, platform_bps, platform_basis), snapshot:job_terms_versions!referrals_terms_version_id_fkey(${TERMS_COLUMNS})`)
    .eq("id", referralId)
    .maybeSingle();
  if (error) throw error;
  if (!r) return null;
  if (!r.snapshot || !r.rule) return { recorded: false as const };
  const { data: amendments, error: aErr } = await ctx.db
    .from("job_terms_versions")
    .select(TERMS_COLUMNS)
    .eq("referral_id", referralId)
    .eq("kind", "amendment")
    .order("version_no", { ascending: false });
  if (aErr) throw aErr;
  // The job's current version (spec 2.4.3 "This job's terms are now version {current}"), via a definer RPC:
  // the sourcing side can't read job versions it didn't commit under.
  const { data: ctxRows, error: cErr } = await ctx.db.rpc("get_referral_terms_context", { p_referral: referralId });
  if (cErr) throw cErr;
  const jobCurrent = ctxRows?.[0] ?? null;
  const rule = r.rule;
  const effective = amendments?.[0] ?? r.snapshot;
  const expectedShareMinor = r.internal ? null : expectedShare(r.snapshot, effective, r.fee_estimate_minor, rule);
  return {
    recorded: true as const,
    snapshot: r.snapshot,
    effective,
    // jobs.terms.shareAtHire.* (no frozen estimate): {percent} = the snapshot rule's sourcing share,
    // {rate} = the effective fee rate. Always returned, alongside a null expectedShareMinor.
    shareBps: r.internal ? 0 : rule.sourcing_bps,
    feeBasis: effective.fee_basis,
    rateBps: effective.rate_bps,
    amended: (amendments?.length ?? 0) > 0,
    rule,
    internal: r.internal,
    feeEstimateMinor: r.fee_estimate_minor,
    expectedShareMinor,
    jobCurrentVersionNo: jobCurrent?.job_current_version_no ?? null,
    jobCurrentVersionAt: jobCurrent?.job_current_version_at ?? null,
  };
}


// ---------------------------------------------------------------------------------------------
// N3 (referral-claims-two-sided-hire, backend.md v1): the referral's hire state, side-shaped.

/** BR-35 ownership line (spec §2.12). `released` only ever reaches the sourcing side. */
export type OwnershipState = "released" | "ended" | "void" | "not_delivered" | "protected" | "closed";
/**
 * Record-hire dialog variant (spec §2.3). V5 (released) is never returned: the hiring side gets the variant
 * the referral would otherwise have (BR-11, AC-27). `legacy` adds V6's free fee entry to any variant.
 */
export type HireVariant = "objection_open" | "happy" | "confirmed" | "deemed" | "no_agreement";
export type HireRecordView = {
  kind: "placement" | "no_split";
  no_split_reason: "released" | "no_agreement" | null;
  origin: "target_record" | "report_confirmed" | "report_deemed" | "report_upheld";
  recorded_at: string;
  offer_accepted_on: string | null;
  start_date: string | null;
  hired_role_title: string | null;
  placement_id: string | null;
};
type HireStateBase = {
  status: string;
  version: number;
  delivered_at: string | null;
  in_progress: boolean;
  /** Window end (delivery + snapshot window; legacy: delivery + 12 months). Null when undelivered. */
  protected_until: string | null;
  ownership: OwnershipState;
  hire_record: HireRecordView | null;
  agreement: { status: "pending_source" | "active" | "terminated"; origin: "confirmed" | "deemed"; deemed_at: string | null } | null;
};
export type TargetHireState = HireStateBase & {
  side: "target";
  can_record: boolean;
  variant: HireVariant | null;
  legacy: boolean;
  other_role_allowed: boolean;
  job_title: string;
  /** v2: the pending hire report on this referral (panel / Confirm), or null. */
  pending_report_id: string | null;
  /** v2: when B last asked for an authorization check on this referral, or null. */
  auth_check_requested_at: string | null;
};
/** v2 (BR-37): the authorization check with an evidence request, as the sourcing side sees it. */
export type SourceAuthCheck = {
  id: string;
  status: "open" | "valid" | "invalid";
  evidence_due_at: string | null;
  evidence_business_days_left: number | null;
  evidence_at: string | null;
  decided_at: string | null;
  can_send_evidence: boolean;
};
export type SourceHireState = HireStateBase & {
  side: "source";
  released_at: string | null;
  window_end: string | null;
  report_until: string | null;
  report_tail_until: string | null;
  /** v2: the client-visible filing conditions (spec §2.5); rate limits and the second-report rule are submit-only. */
  can_report: boolean;
  /** v2: filing now needs the tail statement and a backing item (BR-6). */
  report_tail: boolean;
  pending_report_id: string | null;
  /** v2 (BR-38): the candidate record was created within 30 days before token issuance. */
  record_created_at: string | null;
  auth_check: SourceAuthCheck | null;
};
export type ReferralHireState = TargetHireState | SourceHireState;

/** `get_referral_hire_state` for the acting org, or null when the viewer can't see the referral (not found). */
export async function getReferralHireState(ctx: RequestContext, referralId: string): Promise<ReferralHireState | null> {
  const { data, error } = await ctx.db.rpc("get_referral_hire_state", { p_referral: referralId, p_acting_org: ctx.organizationId });
  if (error) {
    if (error.message?.startsWith("not_found")) return null;
    throw error;
  }
  return data as unknown as ReferralHireState;
}
