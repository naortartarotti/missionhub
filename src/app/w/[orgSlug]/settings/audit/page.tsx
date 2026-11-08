import { assertCan, getRequestContext } from "@/server/auth/context";
import { Panel } from "@/components/shared/card";
import { formatDate } from "@/lib/labels";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ params }: PageProps<"/w/[orgSlug]/settings/audit">) {
  const { orgSlug } = await params;
  const ctx = await getRequestContext(orgSlug);
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
        <caption className="sr-only">Audit events</caption>
        <thead><tr className="border-b border-border text-left text-muted-foreground"><th scope="col" className="px-5 py-3 font-medium">When</th><th scope="col" className="px-5 py-3 font-medium">Actor</th><th scope="col" className="px-5 py-3 font-medium">Action</th><th scope="col" className="px-5 py-3 font-medium">Entity</th></tr></thead>
        <tbody>
          {(data ?? []).map((e) => (
            <tr key={e.id} className="border-b border-border/60 last:border-0">
              <td className="px-5 py-3 text-muted-foreground">{formatDate(e.created_at)} {new Date(e.created_at).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" })}</td>
              <td className="px-5 py-3">{e.actor?.full_name || "Partner / system"}</td>
              <td className="px-5 py-3 font-mono text-xs">{e.action}</td>
              <td className="px-5 py-3 text-muted-foreground">{e.entity_type}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(data ?? []).length === 0 ? <p className="p-5 text-sm text-muted-foreground">No events yet.</p> : null}
    </Panel>
  );
}
