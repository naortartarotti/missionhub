import "server-only";
import { assertCan, type RequestContext } from "@/server/auth/context";

export async function listPlacements(ctx: RequestContext) {
  assertCan(ctx, "commissions:read");
  const { data, error } = await ctx.db
    .from("placements")
    .select(
      "id, status, currency, contracted_fee_minor, start_date, created_at, source_org_id, target_org_id, referral:referrals(job_title_snapshot, candidate_label), agreement:collaboration_agreements(sourcing_bps, job_owner_bps, platform_bps), ledger:commission_ledger_entries(party, entry_type, amount_minor, organization_id)",
    )
    .or(`source_org_id.eq.${ctx.organizationId},target_org_id.eq.${ctx.organizationId}`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getPlacement(ctx: RequestContext, id: string) {
  assertCan(ctx, "commissions:read");
  const { data: p, error } = await ctx.db
    .from("placements")
    .select("*, referral:referrals(id, job_title_snapshot, candidate_label), agreement:collaboration_agreements(*), source_org:organizations!placements_source_org_id_fkey(name), target_org:organizations!placements_target_org_id_fkey(name)")
    .eq("id", id)
    .or(`source_org_id.eq.${ctx.organizationId},target_org_id.eq.${ctx.organizationId}`)
    .maybeSingle();
  if (error) throw error;
  if (!p) return null;
  const [invoices, evidence, ledger, events, disputes] = await Promise.all([
    ctx.db.from("invoice_records").select("*").eq("placement_id", id).order("created_at"),
    ctx.db.from("payment_evidence").select("*").eq("placement_id", id).order("created_at"),
    ctx.db.from("commission_ledger_entries").select("*").eq("placement_id", id).order("id"),
    ctx.db.from("placement_status_events").select("*").eq("placement_id", id).order("id"),
    ctx.db.from("disputes").select("*").eq("placement_id", id).order("created_at", { ascending: false }),
  ]);
  return {
    placement: p,
    side: (p.source_org_id === ctx.organizationId ? "source" : "target") as "source" | "target",
    invoices: invoices.data ?? [],
    evidence: evidence.data ?? [],
    ledger: ledger.data ?? [],
    events: events.data ?? [],
    disputes: disputes.data ?? [],
  };
}
