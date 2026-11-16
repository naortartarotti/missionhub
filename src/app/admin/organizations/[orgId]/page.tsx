import type { AdminOrganization } from "@/features/admin/queries";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/server/supabase/server";
import { Panel } from "@/components/shared/card";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { Button } from "@/components/ui/button";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";
import { getOrgConductFile } from "@/features/network-rules/admin-queries";
import { OrgSanctionActions, OrgStandingLine, OrgStandingPanels, OrgStandingPills, type OrgConductFile } from "@/features/network-rules/components/admin-org-standing";

export async function generateMetadata({ params }: PageProps<"/admin/organizations/[orgId]">) {
  const { orgId } = await params;
  const db = await createClient();
  const { data } = await db.from("organizations").select("name").eq("id", orgId).maybeSingle();
  return { title: data?.name ?? (await getT("admin"))("orgs.title") };
}

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

export default async function AdminOrganizationPage({ params }: PageProps<"/admin/organizations/[orgId]">) {
  const { orgId } = await params;
  if (!isUuid(orgId)) notFound();
  const [db, t, tg, f] = await Promise.all([createClient(), getT("admin"), getGlobalT(), getFormatter()]);
  const [org, members, placements, audit] = await Promise.all([
    db.from("admin_organizations").select("*").eq("id", orgId).maybeSingle(), // N10 QA-N10-01
    db
      .from("organization_memberships")
      .select("id, role, status, created_at, user:profiles!memberships_user_profile_fk(full_name, email)")
      .eq("organization_id", orgId)
      .order("created_at"),
    db
      .from("placements")
      .select("id, status, contracted_fee_minor, currency, start_date, source_org_id, source:organizations!placements_source_org_id_fkey(name), target:organizations!placements_target_org_id_fkey(name)")
      .or(`source_org_id.eq.${orgId},target_org_id.eq.${orgId}`)
      .order("created_at", { ascending: false })
      .limit(10),
    db
      .from("audit_events")
      .select("id, action, entity_type, created_at, actor:profiles!audit_events_actor_profile_fk(full_name)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  if (org.error) throw org.error;
  const o = org.data as AdminOrganization | null;
  if (!o) notFound();
  // N10 S19: the sanction file replaces the Suspend button (BR-29).
  const conduct = (await getOrgConductFile(db, orgId).catch(() => null)) as unknown as OrgConductFile | null;

  const facts: [string, string][] = [
    [t("orgDetail.slug"), `/${o.slug}`],
    [t("orgs.type"), t(`orgs.kind.${o.kind}`)],
    [t("orgDetail.country"), o.country],
    [t("orgDetail.currency"), o.default_currency],
    [t("orgDetail.locale"), o.locale],
    [t("orgs.created"), f.date(o.created_at)],
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        leading={<InitialsAvatar name={o.name} className="size-12 rounded-2xl" />}
        eyebrow={
          <Link href="/admin/organizations" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" aria-hidden /> {t("orgs.title")}
          </Link>
        }
        title={o.name}
        description={conduct ? <OrgStandingLine file={conduct} /> : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {conduct ? <OrgStandingPills file={conduct} /> : o.suspended_at ? <StatusPill tone="danger" label={t("orgs.suspended")} /> : <StatusPill tone="success" label={t("orgs.active")} />}
            {o.is_demo ? <StatusPill tone="neutral" label={t("orgs.demo")} /> : null}
            {conduct ? <OrgSanctionActions orgId={o.id} orgName={o.name} file={conduct} /> : null}
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel>
          <SectionTitle>{t("orgDetail.details")}</SectionTitle>
          <dl className="grid gap-3 text-sm">
            {facts.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel>
          <SectionTitle>{t("orgDetail.activity")}</SectionTitle>
          {(audit.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("audit.empty")}</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {audit.data!.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-2">
                  <code className="rounded-md bg-muted px-1.5 py-0.5 text-xs">{e.action}</code>
                  <span className="text-xs text-muted-foreground">{e.actor?.full_name || t("audit.system")} · {f.relative(e.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
          <Button variant="link" asChild className="mt-2 h-auto px-0">
            <Link href={`/admin/audit?org=${o.id}`}>{t("overview.seeAll")}</Link>
          </Button>
        </Panel>
      </div>

      {conduct ? <OrgStandingPanels file={conduct} /> : null}

      <Panel className="overflow-x-auto p-0">
        <div className="px-5 pt-5"><SectionTitle>{t("orgDetail.members", { count: String(members.data?.length ?? 0) })}</SectionTitle></div>
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">{t("orgDetail.membersCaption")}</caption>
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="px-5 py-3 font-medium">{t("users.name")}</th>
              <th scope="col" className="px-5 py-3 font-medium">{t("orgDetail.role")}</th>
              <th scope="col" className="px-5 py-3 font-medium">{t("orgDetail.joined")}</th>
              <th scope="col" className="px-5 py-3 font-medium">{t("orgs.status")}</th>
            </tr>
          </thead>
          <tbody>
            {(members.data ?? []).map((m) => (
              <tr key={m.id} className="border-b border-border/60 last:border-0">
                <td className="px-5 py-3">
                  <span className="block font-medium">{m.user?.full_name || "—"}</span>
                  <span className="block text-xs text-muted-foreground">{m.user?.email}</span>
                </td>
                <td className="px-5 py-3 text-muted-foreground">{tg(`labels.role.${m.role}`)}</td>
                <td className="px-5 py-3 text-muted-foreground">{f.date(m.created_at)}</td>
                <td className="px-5 py-3">{m.status === "active" ? <StatusPill tone="success" label={t("orgs.active")} /> : <StatusPill tone="neutral" label={t("orgDetail.memberSuspended")} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel className="overflow-x-auto p-0">
        <div className="px-5 pt-5"><SectionTitle>{t("orgDetail.placements")}</SectionTitle></div>
        {(placements.data ?? []).length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">{t("orgDetail.noPlacements")}</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">{t("orgDetail.placements")}</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th scope="col" className="px-5 py-3 font-medium">{t("orgDetail.side")}</th>
                <th scope="col" className="px-5 py-3 font-medium">{t("orgDetail.partner")}</th>
                <th scope="col" className="px-5 py-3 font-medium">{t("orgDetail.fee")}</th>
                <th scope="col" className="px-5 py-3 font-medium">{t("orgDetail.start")}</th>
                <th scope="col" className="px-5 py-3 font-medium">{t("orgs.status")}</th>
              </tr>
            </thead>
            <tbody>
              {placements.data!.map((p) => {
                const sourcing = p.source_org_id === o.id;
                return (
                  <tr key={p.id} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-3">{sourcing ? t("orgDetail.sourcing") : t("orgDetail.jobOwner")}</td>
                    <td className="px-5 py-3 text-muted-foreground">{(sourcing ? p.target?.name : p.source?.name) ?? "—"}</td>
                    <td className="px-5 py-3 tabular-nums">{f.money(p.contracted_fee_minor, p.currency ?? "")}</td>
                    <td className="px-5 py-3 text-muted-foreground">{p.start_date ? f.date(p.start_date) : "—"}</td>
                    <td className="px-5 py-3">{tg(`labels.placementStatus.${p.status}`)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
