import "server-only";
import { assertCan, type RequestContext } from "@/server/auth/context";
import { DEFAULT_SPLIT, type CommissionSplit } from "@/lib/money/allocate";
import { DEFAULT_COMMISSION_RULE_NAME } from "@/lib/labels";
import type { SplitView } from "@/features/jobs/terms-display";

export async function listPlacements(ctx: RequestContext) {
  assertCan(ctx, "commissions:read");
  const { data, error } = await ctx.db
    .from("placements")
    .select(
      "id, status, currency, contracted_fee_minor, computed_fee_minor, start_date, created_at, source_org_id, target_org_id, referral:referrals(job_title_snapshot, candidate_label), agreement:collaboration_agreements(sourcing_bps, job_owner_bps, platform_bps, platform_basis), ledger:commission_ledger_entries(party, entry_type, amount_minor, organization_id)",
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
    // N2: placement.* includes computed_fee_minor, reported_base_minor, reported_bonus_minor, fee_difference_reason,
    // fee_difference_note; `terms` is the effective terms version used at hire (null for legacy placements).
    .select("*, terms:job_terms_versions!placements_terms_version_id_fkey(id, kind, version_no, created_at, fee_basis, rate_bps, flat_fee_minor, min_fee_minor, currency, guarantee_days, guarantee_remedy, payment_terms_days, ownership_months), referral:referrals(id, job_title_snapshot, candidate_label), agreement:collaboration_agreements(*), source_org:organizations!placements_source_org_id_fkey(name), target_org:organizations!placements_target_org_id_fkey(name)")
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

/** The active marketplace split (default rule). Falls back to the seeded default if none is published. */
export async function getActiveSplit(ctx: RequestContext): Promise<CommissionSplit> {
  const { data } = await ctx.db
    .from("commission_rules")
    .select("sourcing_bps, job_owner_bps, platform_bps")
    .eq("is_default", true)
    .is("retired_at", null)
    .maybeSingle();
  return data ? { sourcingBps: data.sourcing_bps, jobOwnerBps: data.job_owner_bps, platformBps: data.platform_bps } : DEFAULT_SPLIT;
}

/**
 * N2 T10 (BR-2): the current default commission rule with its name and version, for the job form and
 * job page. Same RLS read as `getActiveSplit`; falls back to the seeded default when none is published.
 */
export async function getDefaultRule(ctx: RequestContext): Promise<SplitView> {
  const { data } = await ctx.db
    .from("commission_rules")
    .select("name, version, sourcing_bps, job_owner_bps, platform_bps")
    .eq("is_default", true)
    .is("retired_at", null)
    .maybeSingle();
  return data
    ? { ruleName: data.name, ruleVersion: data.version, sourcingBps: data.sourcing_bps, jobOwnerBps: data.job_owner_bps, platformBps: data.platform_bps }
    : { ruleName: DEFAULT_COMMISSION_RULE_NAME, ruleVersion: 1, ...DEFAULT_SPLIT };
}

/** N3 v2: fee-details deadline with server business days left, and the allowed start-date window (PD-077). */
export type PlacementFeeState = {
  placement_id: string;
  status: string;
  fee_details_due_at: string | null;
  fee_details_business_days_left: number | null;
  fee_details_overdue: boolean;
  delivered_at: string | null;
  start_date_min: string;
  start_date_max: string;
};

/** `get_placement_fee_state`, or null when the viewer can't see the placement. */
export async function getPlacementFeeState(ctx: RequestContext, placementId: string): Promise<PlacementFeeState | null> {
  assertCan(ctx, "commissions:read");
  const { data, error } = await ctx.db.rpc("get_placement_fee_state", { p_placement: placementId });
  if (error) {
    if (error.message?.startsWith("not_found")) return null;
    throw error;
  }
  return data as unknown as PlacementFeeState;
}
