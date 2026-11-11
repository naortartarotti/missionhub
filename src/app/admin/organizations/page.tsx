import Link from "next/link";
import { Building2, Search } from "lucide-react";
import { createClient } from "@/server/supabase/server";
import { Panel } from "@/components/shared/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { NativeSelect } from "@/components/shared/native-select";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SuspendButton } from "@/features/admin/components/admin-controls";
import { ADMIN_PAGE_SIZE, searchTerm } from "@/features/admin/queries";
import { getFormatter, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("admin"))("orgs.title") };
}

const STATUSES = ["all", "active", "suspended", "demo"] as const;

export default async function AdminOrganizationsPage({ searchParams }: PageProps<"/admin/organizations">) {
  const sp = await searchParams;
  const q = searchTerm(sp.q);
  const status = STATUSES.find((s) => s === sp.status) ?? "all";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const [db, t, f] = await Promise.all([createClient(), getT("admin"), getFormatter()]);

  let query = db
    .from("organizations")
    .select("id, name, slug, kind, country, default_currency, is_demo, suspended_at, suspended_reason, created_at, organization_memberships(count)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE - 1);
  if (q) query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);
  if (status === "active") query = query.is("suspended_at", null).eq("is_demo", false);
  if (status === "suspended") query = query.not("suspended_at", "is", null);
  if (status === "demo") query = query.eq("is_demo", true);
  const { data, count, error } = await query;
  if (error) throw error;
  const rows = data ?? [];

  return (
    <div className="grid gap-6">
      <PageHeader title={t("orgs.title")} description={t("orgs.description")} />

      <form className="flex flex-col gap-2 sm:flex-row" role="search" action="/admin/organizations">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q} placeholder={t("orgs.search")} className="pl-10" aria-label={t("orgs.search")} />
        </div>
        <div className="sm:w-56">
          <NativeSelect name="status" defaultValue={status} aria-label={t("orgs.status")}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{t(`orgs.filter.${s}`)}</option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="secondary">{t("filters.apply")}</Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={Building2} title={t("orgs.empty")} description={t("orgs.emptyHint")} />
      ) : (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">{t("orgs.title")}</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th scope="col" className="px-5 py-3 font-medium">{t("orgs.name")}</th>
                <th scope="col" className="px-5 py-3 font-medium">{t("orgs.type")}</th>
                <th scope="col" className="px-5 py-3 font-medium">{t("orgs.members")}</th>
                <th scope="col" className="px-5 py-3 font-medium">{t("orgs.region")}</th>
                <th scope="col" className="px-5 py-3 font-medium">{t("orgs.created")}</th>
                <th scope="col" className="px-5 py-3 font-medium">{t("orgs.status")}</th>
                <th scope="col" className="px-5 py-3"><span className="sr-only">{t("orgs.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                  <td className="px-5 py-3">
                    <Link href={`/admin/organizations/${o.id}`} className="flex items-center gap-3 rounded-lg">
                      <InitialsAvatar name={o.name} className="size-9 rounded-xl" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{o.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">/{o.slug}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{t(`orgs.kind.${o.kind}`)}</td>
                  <td className="px-5 py-3 tabular-nums">{o.organization_memberships[0]?.count ?? 0}</td>
                  <td className="px-5 py-3 text-muted-foreground">{o.country} · {o.default_currency}</td>
                  <td className="px-5 py-3 text-muted-foreground">{f.date(o.created_at)}</td>
                  <td className="px-5 py-3">
                    {o.suspended_at ? <StatusPill tone="danger" label={t("orgs.suspended")} /> : o.is_demo ? <StatusPill tone="neutral" label={t("orgs.demo")} /> : <StatusPill tone="success" label={t("orgs.active")} />}
                  </td>
                  <td className="px-5 py-3 text-right"><SuspendButton orgId={o.id} suspended={Boolean(o.suspended_at)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      <Pagination base="/admin/organizations" params={{ ...(q ? { q } : {}), status }} page={page} total={count ?? 0} pageSize={ADMIN_PAGE_SIZE} />
    </div>
  );
}
