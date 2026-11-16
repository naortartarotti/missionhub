import "server-only";
import type { RequestContext } from "@/server/auth/context";
import type { UserClient } from "@/server/supabase/server";
import { isRulesLocale, type RulesLocale } from "./domain";
import type {
  ConductReport,
  ConductReportListItem,
  IncidentNotice,
  NetworkStanding,
  OrgCase,
  PartnerJobAvailability,
  RulesVersionSummary,
  RulesVersionText,
  SettlementSummary,
} from "./types";

/**
 * N10 member reads. All go through the user's client: published versions through RLS, everything
 * else through RPCs that re-check membership and role and answer not_found (returned here as null).
 */

const isNotFound = (e: { message?: string } | null) => !!e && /not_found/.test(e.message ?? "");

// ---------------------------------------------------------------------------
// Versions page (BR-4): any signed-in user, any org state, no acceptance needed.
// ---------------------------------------------------------------------------
const VERSION_COLS = "id, label, type, effective_on, effective_at, published_at, legal_reason";

/** Current (latest effective), upcoming (published, future) and history (older effective versions, newest first). */
export async function getRulesVersions(db: UserClient): Promise<{ current: RulesVersionSummary | null; upcoming: RulesVersionSummary | null; history: RulesVersionSummary[] }> {
  const { data, error } = await db.from("network_rules_versions").select(VERSION_COLS).order("effective_at", { ascending: false });
  if (error) throw error;
  const now = Date.now();
  const rows = (data ?? []) as RulesVersionSummary[];
  const effective = rows.filter((v) => new Date(v.effective_at).getTime() <= now);
  const future = rows.filter((v) => new Date(v.effective_at).getTime() > now);
  return { current: effective[0] ?? null, upcoming: future[future.length - 1] ?? null, history: effective.slice(1) };
}

/** One published version by label, with its text in one locale and the change summaries of all three. Null for drafts / unknown. */
export async function getRulesVersionByLabel(db: UserClient, label: string, locale: RulesLocale) {
  if (!/^\d{1,3}\.\d{1,3}$/.test(label)) return null;
  const { data: version, error } = await db.from("network_rules_versions").select(VERSION_COLS).eq("label", label).maybeSingle();
  if (error) throw error;
  if (!version) return null;
  return { version: version as RulesVersionSummary, ...(await getRulesVersionText(db, version.id, locale)) };
}

export async function getRulesVersionText(db: UserClient, versionId: string, locale: RulesLocale): Promise<{ text: RulesVersionText | null; summaries: Partial<Record<RulesLocale, string | null>> }> {
  const { data, error } = await db
    .from("network_rules_version_texts")
    .select("locale, body, change_summary, sha256, rules, sections")
    .eq("version_id", versionId);
  if (error) throw error;
  const rows = (data ?? []) as unknown as RulesVersionText[];
  const summaries = Object.fromEntries(rows.filter((r) => isRulesLocale(r.locale)).map((r) => [r.locale, r.change_summary]));
  return { text: rows.find((r) => r.locale === locale) ?? null, summaries };
}

// ---------------------------------------------------------------------------
// Reports, reporting side (BR-15 readers, N10-D23)
// ---------------------------------------------------------------------------
/** `scope: "org"` lists colleagues' reports for org_admins only; anyone else gets their own reports. */
export async function listMyConductReports(ctx: RequestContext, scope: "mine" | "org" = "mine", referralId?: string): Promise<ConductReportListItem[]> {
  const { data, error } = await ctx.db.rpc("list_my_conduct_reports", { p_org: ctx.organizationId, p_scope: scope, p_referral: referralId });
  if (error) throw error;
  return (data ?? []) as unknown as ConductReportListItem[];
}

export async function getConductReport(ctx: RequestContext, caseId: string): Promise<ConductReport | null> {
  const { data, error } = await ctx.db.rpc("get_conduct_report", { p_org: ctx.organizationId, p_case: caseId });
  if (isNotFound(error) || (error && /invalid input syntax/.test(error.message))) return null;
  if (error) throw error;
  return data as unknown as ConductReport;
}

// ---------------------------------------------------------------------------
// Network standing (org_admin, BR-32) and the org-side case page (S10, S11, S25)
// ---------------------------------------------------------------------------
export async function getNetworkStanding(ctx: RequestContext): Promise<NetworkStanding | null> {
  const { data, error } = await ctx.db.rpc("get_network_standing", { p_org: ctx.organizationId });
  if (isNotFound(error)) return null;
  if (error) throw error;
  return data as unknown as NetworkStanding;
}

export async function getConductCaseForOrg(ctx: RequestContext, caseId: string): Promise<OrgCase | null> {
  const { data, error } = await ctx.db.rpc("get_conduct_case_for_org", { p_org: ctx.organizationId, p_case: caseId });
  if (isNotFound(error) || (error && /invalid input syntax/.test(error.message))) return null;
  if (error) throw error;
  return data as unknown as OrgCase;
}

export async function getIncidentNotice(ctx: RequestContext, noticeId: string): Promise<IncidentNotice | null> {
  const { data, error } = await ctx.db.rpc("get_incident_notice", { p_org: ctx.organizationId, p_notice: noticeId });
  if (isNotFound(error) || (error && /invalid input syntax/.test(error.message))) return null;
  if (error) throw error;
  return data as unknown as IncidentNotice;
}

// ---------------------------------------------------------------------------
// Partner view (BR-14, S21) and settlement home (S22-b)
// ---------------------------------------------------------------------------
/** S21: pass the match id (opportunity link) or the job id (referral page). Never returns a reason. */
export async function getPartnerJobAvailability(ctx: RequestContext, ref: { matchId?: string; jobId?: string }): Promise<PartnerJobAvailability> {
  const { data, error } = await ctx.db.rpc("get_partner_job_availability", { p_org: ctx.organizationId, p_match: ref.matchId, p_job: ref.jobId });
  if (error) throw error;
  return data as unknown as PartnerJobAvailability;
}

export async function getSettlementSummary(ctx: RequestContext): Promise<SettlementSummary> {
  const { data, error } = await ctx.db.rpc("get_settlement_summary", { p_org: ctx.organizationId });
  if (error) throw error;
  return data as unknown as SettlementSummary;
}
