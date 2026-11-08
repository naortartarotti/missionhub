import "server-only";
import { assertCan, type RequestContext } from "@/server/auth/context";

export async function listJobs(ctx: RequestContext, opts: { status?: string; q?: string }) {
  assertCan(ctx, "jobs:read");
  let query = ctx.db
    .from("jobs")
    .select("id, title, client_name, client_confidential, status, work_arrangement, location_city, location_region, accepts_external_referrals, updated_at, owner:profiles!jobs_owner_profile_fk(full_name)")
    .eq("organization_id", ctx.organizationId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (opts.status && opts.status !== "all") query = query.eq("status", opts.status as never);
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
