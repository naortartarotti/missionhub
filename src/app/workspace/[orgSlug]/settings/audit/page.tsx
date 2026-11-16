import { assertCan, getRequestContext } from "@/server/auth/context";
import { Panel } from "@/components/shared/card";
import { getFormatter, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("settings"))("audit.metaTitle") };
}

export default async function AuditPage({ params }: PageProps<"/workspace/[orgSlug]/settings/audit">) {
  const { orgSlug } = await params;
  const [ctx, t, f] = await Promise.all([getRequestContext(orgSlug), getT("settings"), getFormatter()]);
  assertCan(ctx, "audit:read");
  const { data } = await ctx.db
    .from("audit_events")
    .select("id, action, entity_type, entity_id, created_at, metadata, actor:profiles!audit_events_actor_profile_fk(full_name)")
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: false })
    .limit(200);
  // N10 (§5.14): labelled actions (dots → underscores); anything else keeps its code. Which rows a role
  // reads is decided by the audit_select policy (sanction events: org_admin only, AC-149).
  const N10_ACTIONS = new Set(["network_rules_org_accepted", "network_rules_member_accepted", "conduct_report_filed", "conduct_notice_sent", "conduct_response_submitted", "conduct_followup_sent", "conduct_followup_answered", "conduct_decided", "sanction_applied", "sanction_lifted", "sanction_immediate_hold", "sanction_review_requested", "sanction_reviewed", "settlement_mode_entered", "settlement_mode_exited", "conduct_incident_notice_sent", "referral_closed_stale_by_admin"]);
  const actionLabel = (code: string) => {
    const key = code.replace(/\./g, "_");
    return N10_ACTIONS.has(key) ? t(`audit.actions.${key}` as Parameters<typeof t>[0]) : null;
  };
  return (
    <Panel className="overflow-x-auto p-0">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">{t("audit.caption")}</caption>
        <thead><tr className="border-b border-border text-left text-muted-foreground"><th scope="col" className="px-5 py-3 font-medium">{t("audit.when")}</th><th scope="col" className="px-5 py-3 font-medium">{t("audit.actor")}</th><th scope="col" className="px-5 py-3 font-medium">{t("audit.action")}</th><th scope="col" className="px-5 py-3 font-medium">{t("audit.entity")}</th></tr></thead>
        <tbody>
          {(data ?? []).map((e) => (
            <tr key={e.id} className="border-b border-border/60 last:border-0">
              <td className="px-5 py-3 text-muted-foreground">{f.dateTime(e.created_at)}</td>
              <td className="px-5 py-3">{e.actor?.full_name || t("audit.system")}</td>
              <td className="px-5 py-3">
                {actionLabel(e.action) ? <span className="block text-sm">{actionLabel(e.action)}</span> : null}
                <span className="font-mono text-xs text-muted-foreground">{e.action}</span>
              </td>
              <td className="px-5 py-3 text-muted-foreground">{e.entity_type}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(data ?? []).length === 0 ? <p className="p-5 text-sm text-muted-foreground">{t("audit.empty")}</p> : null}
    </Panel>
  );
}
