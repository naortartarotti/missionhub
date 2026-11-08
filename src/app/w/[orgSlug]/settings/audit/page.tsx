import { assertCan, getRequestContext } from "@/server/auth/context";
import { Panel } from "@/components/shared/card";
import { getFormatter, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("settings"))("audit.metaTitle") };
}

export default async function AuditPage({ params }: PageProps<"/w/[orgSlug]/settings/audit">) {
  const { orgSlug } = await params;
  const [ctx, t, f] = await Promise.all([getRequestContext(orgSlug), getT("settings"), getFormatter()]);
  assertCan(ctx, "audit:read");
  const { data } = await ctx.db
    .from("audit_events")
    .select("id, action, entity_type, entity_id, created_at, metadata, actor:profiles!audit_events_actor_profile_fk(full_name)")
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: false })
    .limit(200);
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
              <td className="px-5 py-3 font-mono text-xs">{e.action}</td>
              <td className="px-5 py-3 text-muted-foreground">{e.entity_type}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(data ?? []).length === 0 ? <p className="p-5 text-sm text-muted-foreground">{t("audit.empty")}</p> : null}
    </Panel>
  );
}
