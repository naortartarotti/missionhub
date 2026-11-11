import { AlertTriangle } from "lucide-react";
import { createClient } from "@/server/supabase/server";
import { Panel } from "@/components/shared/card";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { EmptyState } from "@/components/shared/empty-state";
import { DisputeResolution } from "@/features/admin/components/admin-controls";
import { getFormatter, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("admin"))("disputes.title") };
}

const SELECT = "id, reason, status, resolution, created_at, resolved_at, placement:placements(contracted_fee_minor, currency, source:organizations!placements_source_org_id_fkey(name), target:organizations!placements_target_org_id_fkey(name)), org:organizations!disputes_opened_by_org_fkey(name)";

export default async function AdminDisputesPage() {
  const [db, t, f] = await Promise.all([createClient(), getT("admin"), getFormatter()]);
  const [open, closed] = await Promise.all([
    db.from("disputes").select(SELECT).eq("status", "open").order("created_at"),
    db.from("disputes").select(SELECT).neq("status", "open").order("resolved_at", { ascending: false, nullsFirst: false }).limit(20),
  ]);
  if (open.error) throw open.error;

  return (
    <div className="grid gap-6">
      <PageHeader title={t("disputes.title")} description={t("disputes.description")} />
      {(open.data ?? []).length === 0 ? (
        <EmptyState icon={AlertTriangle} title={t("disputes.empty")} description={t("disputes.emptyHint")} />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {open.data!.map((d) => (
            <li key={d.id}>
              <Panel className="grid h-full gap-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold">{t("disputes.openedBy", { org: d.org?.name ?? "", date: f.date(d.created_at) })}</p>
                    {d.placement ? (
                      <p className="text-muted-foreground">
                        {t("disputes.between", { source: d.placement.source?.name ?? "—", target: d.placement.target?.name ?? "—" })} · {f.money(d.placement.contracted_fee_minor, d.placement.currency)}
                      </p>
                    ) : null}
                  </div>
                  <StatusPill tone="warning" label={t("disputes.open")} />
                </div>
                <blockquote className="rounded-2xl bg-muted/60 p-3 text-foreground">“{d.reason}”</blockquote>
                <DisputeResolution disputeId={d.id} />
              </Panel>
            </li>
          ))}
        </ul>
      )}

      <Panel>
        <SectionTitle>{t("disputes.history")}</SectionTitle>
        {(closed.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("disputes.noHistory")}</p>
        ) : (
          <ul className="grid gap-3 text-sm">
            {closed.data!.map((d) => (
              <li key={d.id} className="rounded-2xl border border-border p-4">
                <p className="font-medium">{t("disputes.openedBy", { org: d.org?.name ?? "", date: f.date(d.created_at) })}</p>
                <p className="mt-1 text-muted-foreground">“{d.reason}”</p>
                {d.resolution ? <p className="mt-2">{t("disputes.resolution", { date: d.resolved_at ? f.date(d.resolved_at) : "—", text: d.resolution })}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
