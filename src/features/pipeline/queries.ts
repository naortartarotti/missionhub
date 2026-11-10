import "server-only";
import { assertCan, type RequestContext } from "@/server/auth/context";
import type { Database } from "@/server/db/database.types";
import { PIPELINE_CLOSED, PIPELINE_STAGES, type PipelineCard, type PipelineTransition } from "./stages";

type ReferralStatus = Database["public"]["Enums"]["referral_status"];
type Snapshot = { full_name?: string } | null;

/**
 * Referrals this organization received and accepted, with what the board needs per card.
 * Scoped to target_org_id = current org; RLS applies on top.
 */
export async function listPipeline(ctx: RequestContext, jobId?: string) {
  assertCan(ctx, "jobs:read");
  let q = ctx.db
    .from("referrals")
    .select(
      "id, status, version, job_id, job_title_snapshot, candidate_label, fit_score, updated_at, decided_at, source_org:organizations!referrals_source_org_id_fkey(name), profile:referral_shared_profiles(snapshot), agreement:collaboration_agreements(status), placement:placements(id), job:jobs(expected_fee_minor, fee_currency)",
    )
    .eq("target_org_id", ctx.organizationId)
    .in("status", [...PIPELINE_STAGES, ...PIPELINE_CLOSED] as ReferralStatus[])
    // Only referrals that made it past the review step (withdrawn-before-acceptance has no decided_at).
    .not("decided_at", "is", null)
    .order("updated_at", { ascending: false })
    .limit(300);
  if (jobId) q = q.eq("job_id", jobId);

  const [{ data: rows, error }, { data: transitions, error: tErr }] = await Promise.all([
    q,
    ctx.db.from("referral_transitions").select("from_status, to_status, requires_reason, requires_active_agreement").eq("actor_side", "target"),
  ]);
  if (error) throw error;
  if (tErr) throw tErr;

  const ids = (rows ?? []).map((r) => r.id);
  const { data: events } = ids.length
    ? await ctx.db.from("referral_status_events").select("referral_id, to_status, actor_id, created_at").in("referral_id", ids).order("id", { ascending: true })
    : { data: [] };

  // Per referral: when it entered its current status, and who accepted it.
  const since = new Map<string, string>();
  const acceptedBy = new Map<string, string>();
  for (const e of events ?? []) {
    since.set(e.referral_id, e.created_at);
    if (e.to_status === "accepted" && e.actor_id) acceptedBy.set(e.referral_id, e.actor_id);
  }
  const ownership = await resolveOwnership(ctx, acceptedBy);

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const cards: PipelineCard[] = (rows ?? []).map((r) => {
    const snapshot = one(r.profile)?.snapshot as Snapshot;
    const own = ownership.get(r.id);
    return {
      id: r.id,
      status: r.status,
      version: r.version,
      jobId: r.job_id,
      jobTitle: r.job_title_snapshot,
      candidateName: snapshot?.full_name || r.candidate_label,
      candidateLabel: r.candidate_label,
      partner: r.source_org?.name ?? null,
      fitScore: r.fit_score,
      stageSince: since.get(r.id) ?? r.decided_at ?? r.updated_at,
      owner: own?.name ?? null,
      canMove: own?.canMove ?? true,
      agreementActive: one(r.agreement)?.status === "active",
      placementId: one(r.placement)?.id ?? null,
      expectedFeeMinor: one(r.job)?.expected_fee_minor ?? null,
      feeCurrency: one(r.job)?.fee_currency ?? null,
    };
  });

  return { cards, transitions: (transitions ?? []) as PipelineTransition[] };
}

/**
 * Who drives each accepted referral, mirroring the `referrals_enforce_pipeline_owner` trigger:
 * the person who accepted it, unless they are no longer an active member of the hiring org.
 */
async function resolveOwnership(ctx: RequestContext, acceptedBy: Map<string, string>) {
  const ownerIds = [...new Set(acceptedBy.values())];
  const [{ data: people }, { data: members }] = ownerIds.length
    ? await Promise.all([
        ctx.db.from("profiles").select("id, full_name").in("id", ownerIds),
        ctx.db.from("organization_memberships").select("user_id").eq("organization_id", ctx.organizationId).eq("status", "active").in("user_id", ownerIds),
      ])
    : [{ data: [] }, { data: [] }];
  const names = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const active = new Set((members ?? []).map((m) => m.user_id));
  const out = new Map<string, { ownerId: string; name: string | null; canMove: boolean }>();
  for (const [referralId, ownerId] of acceptedBy) {
    out.set(referralId, { ownerId, name: names.get(ownerId) ?? null, canMove: ownerId === ctx.userId || !active.has(ownerId) });
  }
  return out;
}

/** Ownership of one referral (referral page). `null` when it was never accepted. */
export async function getPipelineOwnership(ctx: RequestContext, referralId: string) {
  const { data } = await ctx.db
    .from("referral_status_events")
    .select("actor_id")
    .eq("referral_id", referralId)
    .eq("to_status", "accepted")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.actor_id) return null;
  return (await resolveOwnership(ctx, new Map([[referralId, data.actor_id]]))).get(referralId) ?? null;
}

/** Jobs that have at least one accepted referral, for the job filter. */
export async function listPipelineJobs(ctx: RequestContext) {
  assertCan(ctx, "jobs:read");
  const { data, error } = await ctx.db
    .from("jobs")
    .select("id, title, referrals!inner(id)")
    .eq("organization_id", ctx.organizationId)
    .not("referrals.decided_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((j) => ({ id: j.id, title: j.title }));
}
