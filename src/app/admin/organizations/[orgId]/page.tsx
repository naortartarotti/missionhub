import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/server/supabase/server";
import { Panel } from "@/components/shared/card";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { Button } from "@/components/ui/button";
import { SuspendButton, WalletFreezeButton } from "@/features/admin/components/admin-controls";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";

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
  const [org, members, placements, wallets, freeze, audit] = await Promise.all([
    db.from("organizations").select("*").eq("id", orgId).maybeSingle(),
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
    db.from("wallet_accounts").select("kind, currency, balance_minor").eq("organization_id", orgId).in("kind", ["available", "pending"]),
    db.from("wallet_freezes").select("reason, frozen_at").eq("organization_id", orgId).maybeSingle(),
    db
      .from("audit_events")
      .select("id, action, entity_type, created_at, actor:profiles!audit_events_actor_profile_fk(full_name)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  if (org.error) throw org.error;
  const o = org.data;
  if (!o) notFound();

  const balances = new Map<string, { available: number; pending: number }>();
  for (const w of wallets.data ?? []) {
    const b = balances.get(w.currency) ?? { available: 0, pending: 0 };
    if (w.kind === "available" || w.kind === "pending") b[w.kind] += w.balance_minor;
    balances.set(w.currency, b);
  }
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
        description={o.suspended_at ? t("orgDetail.suspendedSince", { date: f.date(o.suspended_at), reason: o.suspended_reason ?? "" }) : undefined}
        actions={
          <div className="flex items-center gap-2">
            {o.suspended_at ? <StatusPill tone="danger" label={t("orgs.suspended")} /> : o.is_demo ? <StatusPill tone="neutral" label={t("orgs.demo")} /> : <StatusPill tone="success" label={t("orgs.active")} />}
            <SuspendButton orgId={o.id} suspended={Boolean(o.suspended_at)} />
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
          <SectionTitle action={<WalletFreezeButton orgId={o.id} frozen={Boolean(freeze.data)} />}>{t("orgDetail.wallet")}</SectionTitle>
          {freeze.data ? <p className="mb-3 text-sm text-danger">{t("wallets.orgs.frozenSince", { date: f.date(freeze.data.frozen_at), reason: freeze.data.reason })}</p> : null}
          {balances.size === 0 ? (
            <p className="text-sm text-muted-foreground">{t("orgDetail.noWallet")}</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {[...balances.entries()].map(([cur, b]) => (
                <li key={cur} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{cur}</span>
                  <span className="tabular-nums">{t("orgDetail.balance", { available: f.money(b.available, cur), pending: f.money(b.pending, cur) })}</span>
                </li>
              ))}
            </ul>
          )}
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
                    <td className="px-5 py-3 tabular-nums">{f.money(p.contracted_fee_minor, p.currency)}</td>
                    <td className="px-5 py-3 text-muted-foreground">{f.date(p.start_date)}</td>
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
