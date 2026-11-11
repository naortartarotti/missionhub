import Link from "next/link";
import { Search, ShieldCheck, Users } from "lucide-react";
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
import { ADMIN_PAGE_SIZE, searchTerm } from "@/features/admin/queries";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("admin"))("users.title") };
}

const FILTERS = ["all", "admins", "notOnboarded"] as const;

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const sp = await searchParams;
  const q = searchTerm(sp.q);
  const filter = FILTERS.find((s) => s === sp.filter) ?? "all";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const [db, t, tg, f] = await Promise.all([createClient(), getT("admin"), getGlobalT(), getFormatter()]);

  let query = db
    .from("profiles")
    .select("id, full_name, email, is_platform_admin, onboarded_at, created_at, organization_memberships(role, status, organization:organizations(id, name))", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE - 1);
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  if (filter === "admins") query = query.eq("is_platform_admin", true);
  if (filter === "notOnboarded") query = query.is("onboarded_at", null);
  const { data, count, error } = await query;
  if (error) throw error;
  const rows = data ?? [];

  return (
    <div className="grid gap-6">
      <PageHeader title={t("users.title")} description={t("users.description")} />

      <form className="flex flex-col gap-2 sm:flex-row" role="search" action="/admin/users">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q} placeholder={t("users.search")} className="pl-10" aria-label={t("users.search")} />
        </div>
        <div className="sm:w-56">
          <NativeSelect name="filter" defaultValue={filter} aria-label={t("users.filterLabel")}>
            {FILTERS.map((s) => (
              <option key={s} value={s}>{t(`users.filter.${s}`)}</option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="secondary">{t("filters.apply")}</Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={Users} title={t("users.empty")} description={t("orgs.emptyHint")} />
      ) : (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">{t("users.title")}</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th scope="col" className="px-5 py-3 font-medium">{t("users.name")}</th>
                <th scope="col" className="px-5 py-3 font-medium">{t("users.organizations")}</th>
                <th scope="col" className="px-5 py-3 font-medium">{t("users.onboarding")}</th>
                <th scope="col" className="px-5 py-3 font-medium">{t("users.joined")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-b border-border/60 align-top last:border-0">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <InitialsAvatar name={u.full_name || u.email} className="size-9" />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-medium">
                          <span className="truncate">{u.full_name || "—"}</span>
                          {u.is_platform_admin ? <ShieldCheck className="size-4 text-info" aria-label={t("users.platformAdmin")} /> : null}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {u.organization_memberships.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <ul className="flex flex-wrap gap-1.5">
                        {u.organization_memberships.map((m) =>
                          m.organization ? (
                            <li key={m.organization.id}>
                              <Link
                                href={`/admin/organizations/${m.organization.id}`}
                                title={tg(`labels.role.${m.role}`)}
                                className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent"
                              >
                                {m.organization.name}
                                <span className="text-muted-foreground">· {tg(`labels.role.${m.role}`)}</span>
                              </Link>
                            </li>
                          ) : null,
                        )}
                      </ul>
                    )}
                  </td>
                  <td className="px-5 py-3">{u.onboarded_at ? <StatusPill tone="success" label={t("users.onboarded")} /> : <StatusPill tone="warning" label={t("users.pending")} />}</td>
                  <td className="px-5 py-3 text-muted-foreground">{f.date(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      <Pagination base="/admin/users" params={{ ...(q ? { q } : {}), filter }} page={page} total={count ?? 0} pageSize={ADMIN_PAGE_SIZE} />
    </div>
  );
}
