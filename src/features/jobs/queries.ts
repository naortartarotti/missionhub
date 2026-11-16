import "server-only";
import { assertCan, type RequestContext } from "@/server/auth/context";
import type { Database } from "@/server/db/database.types";

export async function listJobs(ctx: RequestContext, opts: { status?: string; q?: string; mine?: boolean }) {
  assertCan(ctx, "jobs:read");
  let query = ctx.db
    .from("jobs")
    .select("id, title, client_name, client_confidential, status, work_arrangement, location_city, location_region, accepts_external_referrals, source, updated_at, owner_id, owner:profiles!jobs_owner_profile_fk(full_name)")
    .eq("organization_id", ctx.organizationId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (opts.status && opts.status !== "all") query = query.eq("status", opts.status as never);
  if (opts.mine) query = query.eq("owner_id", ctx.userId);
  if (opts.q) {
    const q = opts.q.replace(/[%,()]/g, " ").trim().slice(0, 80);
    if (q) query = query.or(`title.ilike.%${q}%,client_name.ilike.%${q}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getJob(ctx: RequestContext, id: string) {
  assertCan(ctx, "jobs:read");
  const { data, error } = await ctx.db
    .from("jobs")
    .select("*, owner:profiles!jobs_owner_profile_fk(full_name)")
    .eq("id", id)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listJobReferrals(ctx: RequestContext, jobId: string) {
  const { data, error } = await ctx.db
    .from("referrals")
    .select("id, status, candidate_label, submitted_at, updated_at")
    .eq("job_id", jobId)
    .eq("target_org_id", ctx.organizationId)
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export type JobTermsState = Database["public"]["Functions"]["get_jobs_terms_state"]["Returns"][number];

/**
 * N2 owner view of the partner gate (BR-3, BR-7, BR-33): per job, whether partners see it, the owner-only
 * reason when they don't, the current terms version and how many referrals the hiring side can see.
 * Pass a job id for one job (job page, edit form prefill).
 */
export async function getJobsTermsState(ctx: RequestContext, jobId?: string): Promise<JobTermsState[]> {
  assertCan(ctx, "jobs:read");
  const { data, error } = await ctx.db.rpc("get_jobs_terms_state", { p_org: ctx.organizationId, p_job: jobId });
  if (error) throw error;
  return data ?? [];
}
