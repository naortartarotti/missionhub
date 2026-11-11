import Link from "next/link";
import { ScrollText, Search } from "lucide-react";
import { createClient } from "@/server/supabase/server";
import { Panel } from "@/components/shared/card";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ADMIN_PAGE_SIZE, searchTerm } from "@/features/admin/queries";
import { getFormatter, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("admin"))("audit.title") };
}

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const PAGE_SIZE = ADMIN_PAGE_SIZE * 2;

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const sp = await searchParams;
  const action = searchTerm(sp.action).replace(/\s+/g, "");
  const org = isUuid(sp.org) ? sp.org : "";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const [db, t, f] = await Promise.all([createClient(), getT("admin"), getFormatter()]);

  let query = db
    .from("audit_events")
    .select("id, action, entity_type, entity_id, created_at, actor:profiles!audit_events_actor_profile_fk(full_name, email), organization:organizations(id, name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (action) query = query.ilike("action", `${action}%`);
  if (org) query = query.eq("organization_id", org);
  const [{ data, count, error }, orgName] = await Promise.all([
    query,
    org ? db.from("organizations").select("name").eq("id", org).maybeSingle() : Promise.resolve(null),
  ]);
  if (error) throw error;
  const rows = data ?? [];

  return (
    <div className="grid gap-6">
      <PageHeader title={t("audit.title")} description={t("audit.description")} />

      <form className="flex flex-col gap-2 sm:flex-row" role="search" action="/admin/audit">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="action" defaultValue={action} placeholder={t("audit.search")} className="pl-10" aria-label={t("audit.search")} />
        </div>
        {org ? <input type="hidden" name="org" value={org} /> : null}
        <Button type="submit" variant="secondary">{t("filters.apply")}</Button>
      </form>
      {org ? (
        <p className="text-sm text-muted-foreground">
          {t("audit.filteredBy", { org: orgName?.data?.name ?? org })}{" "}
          <Link href={action ? `/admin/audit?action=${encodeURIComponent(action)}` : "/admin/audit"} className="font-medium text-foreground underline underline-offset-4">{t("audit.clear")}</Link>
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon={ScrollText} title={t("audit.empty")} description={t("orgs.emptyHint")} />
      ) : (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">{t("audit.title")}</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th scope="col" className="px-5 py-3 font-medium">{t("audit.when")}</th>
                <th scope="col" className="px-5 py-3 font-medium">{t("audit.action")}</th>
                <th scope="col" className="px-5 py-3 font-medium">{t("audit.actor")}</th>
                <th scope="col" className="px-5 py-3 font-medium">{t("audit.organization")}</th>
                <th scope="col" className="px-5 py-3 font-medium">{t("audit.entity")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-border/60 last:border-0">
                  <td className="px-5 py-3 whitespace-nowrap text-muted-foreground" title={e.created_at}>{f.relative(e.created_at)}</td>
                  <td className="px-5 py-3"><code className="rounded-md bg-muted px-1.5 py-0.5 text-xs">{e.action}</code></td>
                  <td className="px-5 py-3">
                    <span className="block">{e.actor?.full_name || t("audit.system")}</span>
                    {e.actor?.email ? <span className="block text-xs text-muted-foreground">{e.actor.email}</span> : null}
                  </td>
                  <td className="px-5 py-3">
                    {e.organization ? <Link href={`/admin/organizations/${e.organization.id}`} className="hover:underline">{e.organization.name}</Link> : <span className="text-muted-foreground">{t("audit.platform")}</span>}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{e.entity_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      <Pagination base="/admin/audit" params={{ ...(action ? { action } : {}), ...(org ? { org } : {}) }} page={page} total={count ?? 0} pageSize={PAGE_SIZE} />
    </div>
  );
}
