import "server-only";
import type { RequestContext } from "@/server/auth/context";
import { assertCan } from "@/server/auth/context";

export const CANDIDATE_PAGE_SIZE = 25;

export async function listCandidates(ctx: RequestContext, opts: { q?: string; status?: string; page?: number }) {
  assertCan(ctx, "candidates:read");
  const page = Math.max(1, opts.page ?? 1);
  let query = ctx.db
    .from("candidates")
    .select("id, full_name, headline, status, seniority, location_city, location_region, skills, updated_at, owner_id, owner:profiles!candidates_owner_profile_fk(full_name)", {
      count: "exact",
    })
    .eq("organization_id", ctx.organizationId)
    .order("updated_at", { ascending: false })
    .range((page - 1) * CANDIDATE_PAGE_SIZE, page * CANDIDATE_PAGE_SIZE - 1);
  if (opts.status && opts.status !== "all") query = query.eq("status", opts.status as never);
  if (opts.q) {
    const q = opts.q.replace(/[%,()]/g, " ").trim().slice(0, 80);
    if (q) query = query.or(`full_name.ilike.%${q}%,headline.ilike.%${q}%,skills.cs.{${q.toLowerCase()}}`);
  }
  const { data, count, error } = await query;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0, page };
}

export async function getCandidate(ctx: RequestContext, id: string) {
  assertCan(ctx, "candidates:read");
  const { data, error } = await ctx.db
    .from("candidates")
    .select("*, owner:profiles!candidates_owner_profile_fk(full_name)")
    .eq("id", id)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getCandidateRelations(ctx: RequestContext, id: string) {
  const [consents, documents, experiences, links] = await Promise.all([
    ctx.db
      .from("candidate_consents")
      .select("id, kind, legal_basis, scope, evidence, obtained_at, expires_at, revoked_at, revoked_reason, job_id, created_at")
      .eq("candidate_id", id)
      .eq("organization_id", ctx.organizationId)
      .order("created_at", { ascending: false }),
    ctx.db
      .from("candidate_documents")
      .select("id, file_name, mime_type, size_bytes, scan_status, created_at")
      .eq("candidate_id", id)
      .eq("organization_id", ctx.organizationId)
      .order("created_at", { ascending: false }),
    ctx.db.from("candidate_experiences").select("*").eq("candidate_id", id).order("start_date", { ascending: false }),
    ctx.db
      .from("referral_candidate_links")
      .select("referral_id, referrals(id, status, job_title_snapshot, updated_at)")
      .eq("candidate_id", id)
      .eq("organization_id", ctx.organizationId),
  ]);
  return {
    consents: consents.data ?? [],
    documents: documents.data ?? [],
    experiences: experiences.data ?? [],
    referrals: (links.data ?? []).map((l) => l.referrals).filter(Boolean),
  };
}

export type CandidateReferralStats = { total: number; open: number; hired: number };
const CLOSED_REFERRAL = new Set(["declined", "withdrawn", "rejected", "cancelled"]);

/** Referrals this organization sent for each candidate: total, still in progress, and hired. */
export async function countReferralsByCandidate(ctx: RequestContext, candidateIds: string[]): Promise<Map<string, CandidateReferralStats>> {
  const stats = new Map<string, CandidateReferralStats>();
  if (!candidateIds.length) return stats;
  const { data, error } = await ctx.db
    .from("referral_candidate_links")
    .select("candidate_id, referrals(status)")
    .eq("organization_id", ctx.organizationId)
    .in("candidate_id", candidateIds.slice(0, 500));
  if (error) throw error;
  for (const l of data ?? []) {
    const status = l.referrals?.status;
    if (!status) continue;
    const s = stats.get(l.candidate_id) ?? { total: 0, open: 0, hired: 0 };
    s.total += 1;
    if (status === "hired") s.hired += 1;
    else if (!CLOSED_REFERRAL.has(status)) s.open += 1;
    stats.set(l.candidate_id, s);
  }
  return stats;
}
