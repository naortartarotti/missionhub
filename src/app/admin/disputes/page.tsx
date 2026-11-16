import { AlertTriangle, Check, CircleAlert, FileText, Info, RotateCcw } from "lucide-react";
import { BusinessDeadline } from "@/features/referrals/components/business-deadline";
import { createClient } from "@/server/supabase/server";
import { Panel } from "@/components/shared/card";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { DisputeResolution } from "@/features/admin/components/admin-controls";
import { AdminEvidenceDownload, ClaimDisputeResolution, SamePersonBlock } from "@/features/admin/components/referral-dispute-controls";
import { getReferralDispute, listAdminHireReports, type AdminReferralCard, type ReferralDispute } from "@/features/admin/queries";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { listConductCases } from "@/features/network-rules/admin-queries";
import { AdminConductCard, type AdminConductListItem } from "@/features/network-rules/components/admin-conduct-card";
import { SegmentedNav } from "@/components/shared/segmented-nav";
import { REFERRAL_STATUS } from "@/lib/labels";
import { LOCALE_NAMES, isLocale } from "@/i18n/config";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";
import type { Formatter } from "@/i18n/format";
import type { GlobalTranslator, Translator } from "@/i18n/translate";

export async function generateMetadata() {
  return { title: (await getT("admin"))("disputes.title") };
}

const SELECT =
  "id, kind, outcome, reason, status, resolution, created_at, resolved_at, hire_report_id, placement:placements(contracted_fee_minor, currency, source:organizations!placements_source_org_id_fkey(name), target:organizations!placements_target_org_id_fkey(name)), org:organizations!disputes_opened_by_org_fkey(name)";

const isClaimDispute = (d: { kind: string }) => d.kind === "prior_presentation";
/** N3 (spec §2.9): `hire_report` disputes are decided only on the hire-report detail; here they're a compact card. */
const isHireDispute = (d: { kind: string }) => d.kind === "hire_report";
const isPlacementDispute = (d: { kind: string }) => !isClaimDispute(d) && !isHireDispute(d);

const FILTERS = ["all", "placement", "prior_presentation", "conduct"] as const;
type Filter = (typeof FILTERS)[number];

export default async function AdminDisputesPage({ searchParams }: PageProps<"/admin/disputes">) {
  const sp = await searchParams;
  const filter: Filter = FILTERS.includes(sp.filter as Filter) ? (sp.filter as Filter) : "all";
  const [db, t, tg, f] = await Promise.all([createClient(), getT("admin"), getGlobalT(), getFormatter()]);
  const [openAll, closed, conductRaw, hireRows] = await Promise.all([
    db.from("disputes").select(SELECT).eq("status", "open").order("created_at"),
    db.from("disputes").select(SELECT).neq("status", "open").order("resolved_at", { ascending: false, nullsFirst: false }).limit(20),
    // N10 (N10-D14): conduct cases live only in app.conduct_*; merged here from the admin RPC (already
    // sorted: overdue → possible 9.4 → first-response target).
    listConductCases(db, true).catch(() => null),
    listAdminHireReports(db).catch(() => null),
  ]);
  const hireById = new Map((hireRows ?? []).filter((r) => r.row_kind === "report").map((r) => [r.id, r]));
  const conduct = (Array.isArray(conductRaw) ? (conductRaw as unknown as AdminConductListItem[]) : []).filter((c) => c.open);
  const counts = {
    placement: (openAll.data ?? []).filter(isPlacementDispute).length,
    hire_report: (openAll.data ?? []).filter(isHireDispute).length,
    prior_presentation: (openAll.data ?? []).filter(isClaimDispute).length,
    conduct: conduct.length,
  };
  const segments = FILTERS.map((k) => ({
    key: k,
    label: t(`disputes.filter.${k === "prior_presentation" ? "priorPresentation" : k}`),
    href: k === "all" ? "/admin/disputes" : `/admin/disputes?filter=${k}`,
    count: k === "all" ? counts.placement + counts.prior_presentation + counts.conduct + counts.hire_report : counts[k],
  }));
  const open = { ...openAll, data: (openAll.data ?? []).filter((d) => filter === "all" || (filter === "prior_presentation" ? isClaimDispute(d) : filter === "placement" ? isPlacementDispute(d) : false)) };
  const showConduct = filter === "all" || filter === "conduct";
  if (open.error) throw open.error;
  // Admins can't read referrals through RLS: prior-presentation cards come from the admin-only RPC.
  const details = new Map(
    await Promise.all((open.data ?? []).filter(isClaimDispute).map(async (d) => [d.id, await getReferralDispute(db, d.id).catch(() => null)] as const)),
  );

  return (
    <div className="grid gap-6">
      <PageHeader title={t("disputes.title")} description={t("disputes.description")} />
      <SegmentedNav label={t("disputes.filter.label")} segments={segments} active={filter} />
      {showConduct && conductRaw === null ? (
        // Still counted: never drop conduct cases silently when the read fails.
        <p role="alert" className="flex items-start gap-2 text-sm text-danger"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{tg("errors.generic")}</p>
      ) : null}
      {showConduct && conduct.length ? (
        <ul className="grid gap-3 lg:grid-cols-2">
          {conduct.map((c) => (
            <li key={c.id}>
              <AdminConductCard c={c} />
            </li>
          ))}
        </ul>
      ) : null}
      {filter === "conduct" ? (
        conduct.length === 0 && conductRaw !== null ? <EmptyState icon={AlertTriangle} title={t("conduct.emptyFilter")} description={t("disputes.emptyHint")} /> : null
      ) : (open.data ?? []).length === 0 ? (
        filter === "all" && conduct.length ? null : <EmptyState icon={AlertTriangle} title={t("disputes.empty")} description={t("disputes.emptyHint")} />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {open.data!.map((d) => {
            const detail = details.get(d.id);
            if (isHireDispute(d)) {
              const h = d.hire_report_id ? hireById.get(d.hire_report_id) : undefined;
              return (
                <li key={d.id}>
                  <Panel className="grid h-full gap-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <Badge variant="outline">{tg("labels.disputeType.hire_report")}</Badge>
                      <StatusPill tone="warning" label={t("disputes.open")} />
                    </div>
                    {h ? (
                      <>
                        <p className="text-base font-semibold text-pretty break-words">{h.job_title}</p>
                        <p className="text-pretty break-words text-muted-foreground">{h.source_org_name} → {h.target_org_name}</p>
                        <p className="text-muted-foreground">{t("hireReports.detail.filed", { date: f.date(h.filed_at) })} · {t("disputes.openedBy", { org: d.org?.name ?? "", date: f.date(d.created_at) })}</p>
                      </>
                    ) : (
                      <p className="font-medium">{t("disputes.openedBy", { org: d.org?.name ?? "", date: f.date(d.created_at) })}</p>
                    )}
                    {d.hire_report_id ? (
                      <Button variant="outline" className="h-auto min-h-11 w-full justify-self-start whitespace-normal sm:min-h-10 sm:w-auto" asChild>
                        <Link href={`/admin/hire-reports/${d.hire_report_id}`}>{t("hireReports.detail.openReport")}</Link>
                      </Button>
                    ) : null}
                  </Panel>
                </li>
              );
            }
            if (isClaimDispute(d)) {
              return (
                <li key={d.id} className="lg:col-span-2">
                  {detail ? (
                    <ReferralDisputeCard d={detail} t={t} tg={tg} f={f} />
                  ) : (
                    // Still counted in the queue: never drop it silently.
                    <Panel className="grid gap-2 text-sm">
                      <Badge variant="outline">{tg("labels.disputeType.prior_presentation")}</Badge>
                      <p className="font-medium">{t("disputes.openedBy", { org: d.org?.name ?? "", date: f.date(d.created_at) })}</p>
                      <p role="alert" className="flex items-start gap-2 text-danger"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{tg("errors.generic")}</p>
                    </Panel>
                  )}
                </li>
              );
            }
            return (
              <li key={d.id}>
                <Panel className="grid h-full gap-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid gap-1.5">
                      <Badge variant="outline">{tg("labels.disputeType.placement")}</Badge>
                      <p className="text-base font-semibold">{t("disputes.openedBy", { org: d.org?.name ?? "", date: f.date(d.created_at) })}</p>
                      {d.placement ? (
                        <p className="text-muted-foreground">
                          {t("disputes.between", { source: d.placement.source?.name ?? "—", target: d.placement.target?.name ?? "—" })} · {f.money(d.placement.contracted_fee_minor, d.placement.currency ?? "")}
                        </p>
                      ) : null}
                    </div>
                    <StatusPill tone="warning" label={t("disputes.open")} />
                  </div>
                  <blockquote className="rounded-2xl bg-muted/60 p-3 text-foreground">{t("disputes.quote", { text: d.reason })}</blockquote>
                  <DisputeResolution disputeId={d.id} />
                </Panel>
              </li>
            );
          })}
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
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{tg(`labels.disputeType.${isClaimDispute(d) ? "prior_presentation" : isHireDispute(d) ? "hire_report" : "placement"}`)}</Badge>
                  {isClaimDispute(d) && (d.outcome === "claim_upheld" || d.outcome === "claim_rejected") ? (
                    <StatusPill tone={d.outcome === "claim_upheld" ? "neutral" : "info"} icon={d.outcome === "claim_upheld" ? Check : RotateCcw} label={tg(`labels.claimStatus.${d.outcome === "claim_upheld" ? "upheld" : "rejected"}`)} className="text-xs" />
                  ) : null}
                </div>
                <p className="font-medium">{t("disputes.openedBy", { org: d.org?.name ?? "", date: f.date(d.created_at) })}</p>
                <p className="mt-1 text-muted-foreground">{t("disputes.quote", { text: d.reason })}</p>
                {d.resolution ? <p className="mt-2">{t("disputes.resolution", { date: d.resolved_at ? f.date(d.resolved_at) : "—", text: d.resolution })}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/**
 * S8: a contested prior-presentation objection, everything the admin needs to decide. Never a
 * candidate name or label, a shared profile or candidate documents (PD-024).
 */
function ReferralDisputeCard({ d, t, tg, f }: { d: ReferralDispute; t: Translator<"admin">; tg: GlobalTranslator; f: Formatter }) {
  const { dispute, claim, claimed_referral: claimed, evidence_referral: earlier } = d;
  const target = claimed.target_org.name;
  const source = claimed.source_org.name;
  // Orgs store BCP 47 tags ("fr-CA"): match on the language part.
  const lang = (l: string | null) => {
    const base = l?.split("-")[0]?.toLowerCase();
    return base && isLocale(base) ? LOCALE_NAMES[base] : "—";
  };
  const etWhen = (iso: string) => f.etDateTime(iso);
  return (
    <section aria-labelledby={`dispute-${dispute.id}`}>
      <Panel className="grid gap-5 text-sm">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1.5">
            <Badge variant="outline">{tg("labels.disputeType.prior_presentation")}</Badge>
            <h2 id={`dispute-${dispute.id}`} className="text-base font-semibold text-pretty">{t("disputes.claim.between", { target, source })}</h2>
            <p className="text-muted-foreground">{t("disputes.claim.job", { job: claimed.job_title })}</p>
            <p className="text-muted-foreground">{t("disputes.openedBy", { org: source, date: f.date(dispute.created_at) })}</p>
          </div>
          <div className="grid justify-items-start gap-1.5 sm:justify-items-end">
            <StatusPill tone="warning" label={t("disputes.open")} />
            <BusinessDeadline at={dispute.resolve_by} left={dispute.resolve_by_business_days_left} label={t("disputes.claim.resolveBy")} />
          </div>
        </header>

        {claimed.source_org.locale || claimed.target_org.locale ? (
          <p className="rounded-2xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {t("dispute.languageHint", { source, sourceLanguage: lang(claimed.source_org.locale), target, targetLanguage: lang(claimed.target_org.locale) })}
          </p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid content-start gap-3">
            <ul className="grid gap-1">
              <li>{t("disputes.claim.filed", { when: etWhen(claim.filed_at) })}</li>
              <li>{t("disputes.claim.priorDate", { date: f.date(claim.prior_process_date) })}</li>
              <li>{tg(`labels.evidenceType.${claim.evidence_kind}`)}</li>
            </ul>
            <div>
              <h3 className="mb-1 text-xs font-medium text-muted-foreground">{t("disputes.claim.note", { target })}</h3>
              {claim.note ? (
                <blockquote className="rounded-2xl bg-muted/60 p-3 whitespace-pre-line text-foreground">{t("disputes.quote", { text: claim.note })}</blockquote>
              ) : (
                <p className="text-muted-foreground">{tg("referrals.claim.panel.noNote")}</p>
              )}
            </div>
            <div>
              <h3 className="mb-1 text-xs font-medium text-muted-foreground">{t("disputes.claim.contestReason", { source })}</h3>
              <blockquote className="rounded-2xl bg-muted/60 p-3 whitespace-pre-line text-foreground">{t("disputes.quote", { text: dispute.reason })}</blockquote>
            </div>
          </div>

          <div className="grid content-start gap-3">
            {claim.evidence_kind === "file" ? (
              <div>
                <h3 className="mb-2 text-xs font-medium text-muted-foreground">{t("disputes.claim.files")}</h3>
                <ul className="grid gap-2">
                  {claim.files.map((file) => (
                    <li key={file.id} className="grid gap-2 rounded-2xl border border-border/60 p-3">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted" aria-hidden><FileText className="size-4" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{file.file_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {f.fileSize(file.size_bytes)} · {tg("referrals.claim.panel.uploaded", { when: etWhen(file.uploaded_at) })}
                          </p>
                        </div>
                        {/* Download is offered only because this objection has a dispute (PD-024). */}
                        <AdminEvidenceDownload fileId={file.id} name={file.file_name} ready={file.scan_status === "clean"} />
                      </div>
                      {file.sha256 ? (
                        <div>
                          <p className="text-xs text-muted-foreground">{tg("referrals.claim.panel.sha")}</p>
                          <p className="font-mono text-xs break-all text-foreground">{file.sha256}</p>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ReferralColumn title={t("disputes.claim.claimedReferral")} r={claimed} t={t} tg={tg} f={f} />
                  {earlier ? <ReferralColumn title={t("disputes.claim.earlierReferral")} r={earlier} t={t} tg={tg} f={f} /> : null}
                </div>
                <SamePersonBlock disputeId={dispute.id} />
              </>
            )}
          </div>
        </div>

        <ClaimDisputeResolution disputeId={dispute.id} target={target} />
      </Panel>
    </section>
  );
}

function ReferralColumn({ title, r, t, tg, f }: { title: string; r: AdminReferralCard; t: Translator<"admin">; tg: GlobalTranslator; f: Formatter }) {
  const flag =
    r.void_reason === "released"
      ? t("disputes.claim.flagReleased")
      : r.void_reason === "prior_presentation_upheld"
        ? t("disputes.claim.flagUpheld")
        : r.void_reason === "already_presented"
          ? tg("labels.referralStatus.already_presented")
          : null;
  return (
    <div className="grid content-start gap-1.5 rounded-2xl border border-border/60 p-3">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      <p className="font-medium">{r.source_org.name}</p>
      <p>{r.job_title}</p>
      <p className="text-muted-foreground">{t("disputes.claim.clientAtDelivery", { client: r.client_name || "—" })}</p>
      {r.delivered_at ? <p className="text-muted-foreground">{t("disputes.claim.delivered", { when: f.etDateTime(r.delivered_at) })}</p> : null}
      <StatusPill tone={REFERRAL_STATUS[r.status as keyof typeof REFERRAL_STATUS]?.tone ?? "neutral"} label={tg(`labels.referralStatus.${r.status}` as Parameters<GlobalTranslator>[0])} className="justify-self-start text-xs" />
      {flag ? <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><Info className="mt-px size-3.5 shrink-0" aria-hidden />{flag}</p> : null}
      <p>{t("disputes.claim.stillCounts", { value: tg(r.still_counts ? "common.yes" : "common.no") })}</p>
    </div>
  );
}
