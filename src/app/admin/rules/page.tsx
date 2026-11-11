import { createClient } from "@/server/supabase/server";
import { Panel } from "@/components/shared/card";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { RuleForm } from "@/features/admin/components/admin-controls";
import { bpsToPercent } from "@/lib/money/format";
import { getFormatter, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("admin"))("rules.title") };
}

export default async function AdminRulesPage() {
  const [db, t, f] = await Promise.all([createClient(), getT("admin"), getFormatter()]);
  const { data, error } = await db.from("commission_rules").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  const rules = data ?? [];
  const current = rules.find((r) => r.is_default);
  const split = current
    ? [
        { label: t("rules.sourcing"), value: current.sourcing_bps, tone: "bg-tile-yellow" },
        { label: t("rules.jobOwner"), value: current.job_owner_bps, tone: "bg-tile-blue" },
        { label: t("rules.platform"), value: current.platform_bps, tone: "bg-tile-lilac" },
      ]
    : [];

  return (
    <div className="grid gap-6">
      <PageHeader title={t("rules.title")} description={t("rules.description")} />
      <div className="grid gap-6 xl:grid-cols-5">
        <Panel className="xl:col-span-3">
          <SectionTitle>{current ? t("rules.currentTitle", { version: String(current.version) }) : t("rules.none")}</SectionTitle>
          {current ? (
            <>
              <div className="flex h-24 gap-2">
                {split.map((s) => (
                  <div key={s.label} className={`flex min-w-24 flex-col justify-between rounded-2xl p-4 text-tile-foreground ${s.tone}`} style={{ flex: `${s.value} 1 0` }}>
                    <span className="truncate text-xs font-medium opacity-80">{s.label}</span>
                    <span className="text-2xl font-semibold tabular-nums">{bpsToPercent(s.value)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-muted-foreground">{t("rules.snapshotNote")}</p>
            </>
          ) : null}
        </Panel>
        <Panel className="xl:col-span-2">
          <SectionTitle>{t("rules.publishTitle")}</SectionTitle>
          <RuleForm current={{ sourcing: (current?.sourcing_bps ?? 4500) / 100, jobOwner: (current?.job_owner_bps ?? 4500) / 100, platform: (current?.platform_bps ?? 1000) / 100 }} />
        </Panel>
      </div>

      <Panel className="overflow-x-auto p-0">
        <div className="px-5 pt-5"><SectionTitle>{t("rules.history")}</SectionTitle></div>
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">{t("rules.history")}</caption>
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="px-5 py-3 font-medium">{t("rules.version")}</th>
              <th scope="col" className="px-5 py-3 font-medium">{t("rules.split")}</th>
              <th scope="col" className="px-5 py-3 font-medium">{t("rules.effective")}</th>
              <th scope="col" className="px-5 py-3 font-medium">{t("orgs.status")}</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-b border-border/60 last:border-0">
                <td className="px-5 py-3 font-medium">v{r.version}</td>
                <td className="px-5 py-3 tabular-nums">{bpsToPercent(r.sourcing_bps)} / {bpsToPercent(r.job_owner_bps)} / {bpsToPercent(r.platform_bps)}</td>
                <td className="px-5 py-3 text-muted-foreground">{f.date(r.effective_from)}{r.retired_at ? ` → ${f.date(r.retired_at)}` : ""}</td>
                <td className="px-5 py-3">{r.is_default ? <StatusPill tone="success" label={t("rules.inForce")} /> : <StatusPill tone="neutral" label={t("rules.retired")} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
