import "server-only";
import type { RequestContext } from "@/server/auth/context";
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
    .select("id, job_id, status, job_title_snapshot, candidate_label, submitted_at, updated_at, fit_score, target_org:organizations!referrals_target_org_id_fkey(name)")
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

  const enriched = rows.map((r) => ({ ...r, lastEvent: latest.get(r.id) ?? null }));
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
    ctx.db.from("referral_status_events").select("id, from_status, to_status, actor_side, reason, created_at").eq("referral_id", id).order("id"),
    ctx.db.from("referral_messages").select("id, author_side, body, created_at, author:profiles!referral_messages_author_profile_fk(full_name)").eq("referral_id", id).order("created_at"),
    ctx.db.from("referral_document_grants").select("id, file_name, status, revoked_at, size_bytes").eq("referral_id", id),
    ctx.db.from("collaboration_agreements").select("*").eq("referral_id", id).maybeSingle(),
    ctx.db.from("referral_transitions").select("to_status, requires_reason, requires_active_agreement").eq("from_status", referral.status).eq("actor_side", side),
    side === "source" ? ctx.db.from("referral_candidate_links").select("candidate_id").eq("referral_id", id).maybeSingle() : Promise.resolve({ data: null }),
    ctx.db.from("placements").select("id, status").eq("referral_id", id).maybeSingle(),
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
      "id, status, version, job_id, job_title_snapshot, candidate_label, submitted_at, updated_at, fit_score, fit_evidence, decline_reason, sharing_revoked_at, source_org:organizations!referrals_source_org_id_fkey(name), profile:referral_shared_profiles(snapshot), grants:referral_document_grants(count)",
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
