import "server-only";
import type { RequestContext } from "@/server/auth/context";

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
