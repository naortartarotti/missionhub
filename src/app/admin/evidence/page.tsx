import { FileCheck2 } from "lucide-react";
import { createClient } from "@/server/supabase/server";
import { requireUser } from "@/server/auth/context";
import { Panel } from "@/components/shared/card";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { EmptyState } from "@/components/shared/empty-state";
import { ReviewEvidenceButtons } from "@/features/commissions/components/finance-forms";
import { ADMIN_EVIDENCE_KINDS } from "@/features/admin/queries";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("admin"))("evidence.title") };
}

const SELECT = "id, kind, status, amount_minor, processing_fee_minor, currency, occurred_on, reference, recorded_by, reviewed_at, review_note, org:organizations!payment_evidence_recorded_by_org_fkey(name), placement:placements(id, referral:referrals(job_title_snapshot))";

export default async function AdminEvidencePage() {
  const user = await requireUser();
  const [db, t, tg, f] = await Promise.all([createClient(), getT("admin"), getGlobalT(), getFormatter()]);
  const [pending, reviewed] = await Promise.all([
    db.from("payment_evidence").select(SELECT).eq("status", "pending").in("kind", [...ADMIN_EVIDENCE_KINDS]).order("created_at"),
    db.from("payment_evidence").select(SELECT).neq("status", "pending").in("kind", [...ADMIN_EVIDENCE_KINDS]).order("reviewed_at", { ascending: false, nullsFirst: false }).limit(20),
  ]);
  if (pending.error) throw pending.error;

  return (
    <div className="grid gap-6">
      <PageHeader title={t("evidence.title")} description={t("evidence.description")} />
      {(pending.data ?? []).length === 0 ? (
        <EmptyState icon={FileCheck2} title={t("evidence.empty")} description={t("evidence.emptyHint")} />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {pending.data!.map((e) => (
            <li key={e.id}>
              <Panel className="grid h-full gap-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold">{tg(`labels.evidenceKind.${e.kind}`)} · {f.money(e.amount_minor, e.currency)}</p>
                    <p className="text-muted-foreground">{e.org?.name ?? "—"} · {e.placement?.referral?.job_title_snapshot ?? t("evidence.placement")}</p>
                  </div>
                  <StatusPill tone="warning" label={t("overview.pending")} />
                </div>
                <p className="text-muted-foreground">
                  {f.date(e.occurred_on)} · {t("evidence.ref", { reference: e.reference ?? "" })}
                  {e.processing_fee_minor ? ` · ${t("evidence.fees", { amount: f.money(e.processing_fee_minor, e.currency) })}` : ""}
                </p>
                <div>{e.recorded_by === user.id ? <p className="text-xs text-muted-foreground">{t("evidence.ownRecord")}</p> : <ReviewEvidenceButtons evidenceId={e.id} />}</div>
              </Panel>
            </li>
          ))}
        </ul>
      )}

      <Panel className="overflow-x-auto p-0">
        <div className="px-5 pt-5"><SectionTitle>{t("evidence.history")}</SectionTitle></div>
        {(reviewed.data ?? []).length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">{t("evidence.noHistory")}</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">{t("evidence.history")}</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th scope="col" className="px-5 py-3 font-medium">{t("evidence.kind")}</th>
                <th scope="col" className="px-5 py-3 font-medium">{t("evidence.organization")}</th>
                <th scope="col" className="px-5 py-3 font-medium">{t("evidence.amount")}</th>
                <th scope="col" className="px-5 py-3 font-medium">{t("evidence.reviewed")}</th>
                <th scope="col" className="px-5 py-3 font-medium">{t("orgs.status")}</th>
              </tr>
            </thead>
            <tbody>
              {reviewed.data!.map((e) => (
                <tr key={e.id} className="border-b border-border/60 last:border-0">
                  <td className="px-5 py-3">{tg(`labels.evidenceKind.${e.kind}`)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{e.org?.name ?? "—"}</td>
                  <td className="px-5 py-3 tabular-nums">{f.money(e.amount_minor, e.currency)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{e.reviewed_at ? f.date(e.reviewed_at) : "—"}</td>
                  <td className="px-5 py-3">
                    <StatusPill tone={e.status === "verified" ? "success" : "danger"} label={t(`evidence.status.${e.status === "verified" ? "verified" : "rejected"}`)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
