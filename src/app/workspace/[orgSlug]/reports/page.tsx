import Link from "next/link";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SegmentedNav } from "@/components/shared/segmented-nav";
import { StatusPill } from "@/components/shared/status-pill";
import { getRequestContext } from "@/server/auth/context";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";
import { listMyConductReports } from "@/features/network-rules/queries";
import { REPORTER_STATUS_TONE, reporterStatusKey } from "@/features/network-rules/ui-state";

export async function generateMetadata() {
  return { title: (await getT("network"))("reports.title") };
}

/**
 * S9 list (§2.9). Non-admins: their own reports, no tabs. Org admins: "Sent by you" and "Your
 * organization" (?tab=mine|org). Settlement mode opts in (reports work on in-flight referrals).
 */
export default async function ReportsPage({ params, searchParams }: PageProps<"/workspace/[orgSlug]/reports">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
  const [t, f, tg] = await Promise.all([getT("network"), getFormatter(), getGlobalT()]);
  const isAdmin = ctx.membershipRole === "org_admin";
  const tab = isAdmin && sp.tab === "org" ? "org" : "mine";
  const reports = await listMyConductReports(ctx, tab);
  const base = `/workspace/${orgSlug}/reports`;

  return (
    <div className="grid gap-6">
      <PageHeader title={t("reports.title")} description={t("reports.description")} />
      {isAdmin ? (
        <SegmentedNav
          label={t("reports.title")}
          active={tab}
          segments={[
            { key: "mine", label: t("reports.tabs.mine"), href: `${base}?tab=mine` },
            { key: "org", label: t("reports.tabs.org"), href: `${base}?tab=org` },
          ]}
        />
      ) : null}
      {tab === "org" ? <p className="text-sm text-muted-foreground">{t("reports.orgDescription", { org: ctx.organizationName })}</p> : null}
      {reports.length === 0 ? (
        tab === "org" ? (
          <EmptyState icon={Flag} title={t("reports.orgEmpty", { org: ctx.organizationName })} description={t("reports.orgDescription", { org: ctx.organizationName })} />
        ) : (
          <EmptyState icon={Flag} title={t("reports.empty")} description={t("reports.emptyDescription")} />
        )
      ) : (
        <ul className="grid gap-3">
          {reports.map((r) => (
            <li key={r.id}>
              <Panel className="grid gap-3 p-4 sm:flex sm:items-center sm:justify-between">
                <div className="grid min-w-0 gap-1">
                  <p className="font-semibold text-pretty">{tg(`labels.conductCategory.${r.category}`)}</p>
                  <p className="text-sm text-muted-foreground">{t("reports.about", { org: r.reported_org_name, date: f.etDate(r.created_at) })}</p>
                  {tab === "org" ? <p className="text-sm text-muted-foreground">{r.sent_by_former ? t("reports.sentByFormer") : t("reports.sentBy", { name: r.sent_by_name ?? "" })}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusPill tone={REPORTER_STATUS_TONE[r.status]} label={t(`reports.${reporterStatusKey(r.status, r.is_mine)}`)} />
                  <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
                    <Link href={`${base}/${r.id}`} aria-label={t("reports.openAria", { org: r.reported_org_name })}>{t("reports.open")}</Link>
                  </Button>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
