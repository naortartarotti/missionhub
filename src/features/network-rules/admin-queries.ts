import "server-only";
import type { UserClient } from "@/server/supabase/server";
import type { Json } from "@/server/db/database.types";

/**
 * N10 platform-admin reads (/admin). Each RPC checks app.is_platform_admin() in the database. The
 * shapes are documented in docs/specs/network-rules-enforcement/backend.md; they're returned as JSON
 * objects the pages read field by field.
 */

const isNotFound = (e: { message?: string } | null) => !!e && /not_found|invalid input syntax/.test(e.message ?? "");

async function rpcJson(db: UserClient, fn: string, args: Record<string, unknown>): Promise<Json | null> {
  const { data, error } = await db.rpc(fn as never, args as never);
  if (isNotFound(error)) return null;
  if (error) throw error;
  return data as Json;
}

export const listNetworkRules = (db: UserClient) => rpcJson(db, "admin_list_network_rules", {});
export const getNetworkRulesVersion = (db: UserClient, versionId: string) => rpcJson(db, "admin_get_network_rules_version", { p_version: versionId });

/** The conduct queue (S12): cards for every conduct case, overdue and "possible 9.4" first. */
export const listConductCases = (db: UserClient, openOnly = false) => rpcJson(db, "admin_list_conduct_cases", { p_open_only: openOnly });
export const getConductCase = (db: UserClient, caseId: string) => rpcJson(db, "admin_get_conduct_case", { p_case: caseId });
export const getConductNoticeContext = (db: UserClient, caseId: string, conductDate?: string) =>
  rpcJson(db, "admin_conduct_notice_context", { p_case: caseId, p_conduct_date: conductDate });
export const getIncidentOptions = (db: UserClient, caseId: string) => rpcJson(db, "admin_conduct_incident_options", { p_case: caseId });
/** S19: standing, sanctions file, open cases, acceptances, remaining obligations, can_lift_termination. */
export const getOrgConductFile = (db: UserClient, orgId: string) => rpcJson(db, "admin_org_conduct_file", { p_org: orgId });
