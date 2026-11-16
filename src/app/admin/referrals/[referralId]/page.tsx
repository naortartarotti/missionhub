import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { createClient } from "@/server/supabase/server";
import { getAdminAuthorizationChecks, getAdminHireRecord, getAdminReferralTerms } from "@/features/admin/queries";
import { AuthCheckAdmin } from "@/features/admin/components/hire-report-admin";
import { HireRecordPanel } from "@/features/admin/components/hire-record-panel";
import { isUuid } from "@/features/admin/referral-lookup";
import { AmendTermsForm } from "@/features/admin/components/amend-terms-form";
import { TermsSummary } from "@/features/jobs/components/terms-summary";
import { SQL_CONFIDENTIAL_CLIENT, termsFromRow, type SplitView } from "@/features/jobs/terms-display";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { Panel } from "@/components/shared/card";
import { StatusPill } from "@/components/shared/status-pill";
import { REFERRAL_STATUS } from "@/lib/labels";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("admin"))("referralTerms.title") };
}

/**
 * S10 detail (BR-34, BR-35): meta as partners see it (never the hidden client name, only the candidate
 * label), the effective terms, the history with the admin-only notes, and the amendment form, shown
 * only for a referral with recorded terms and no placement. The layout 404s non-admins; the RPC re-checks.
 */
export default async function AdminReferralTermsPage({ params }: PageProps<"/admin/referrals/[referralId]">) {
  const { referralId } = await params;
  if (!isUuid(referralId)) notFound();
  const db = await createClient();
  const [r, hireRecord, authChecks] = await Promise.all([
    getAdminReferralTerms(db, referralId),
    getAdminHireRecord(db, referralId),
    // S16 (BR-37): a failed read shows an error in its panel, never "no check".
    getAdminAuthorizationChecks(db, referralId).catch(() => undefined),
  ]);
  if (!r) notFound();
  const [t, tj, tg, f] = await Promise.all([getT("admin"), getT("jobs"), getGlobalT(), getFormatter()]);
  const status = r.status as keyof typeof REFERRAL_STATUS;
  const effective = r.history.at(-1) ?? null;
  const original = r.history[0] ?? null;
  const split: SplitView | null = r.rule
    ? { ruleName: r.rule.name, ruleVersion: r.rule.version, sourcingBps: r.rule.sourcing_bps, jobOwnerBps: r.rule.job_owner_bps, platformBps: r.rule.platform_bps }
    : null;

  const meta: [string, string][] = [
    [t("referralTerms.meta.job"), r.job_title],
    [t("referralTerms.meta.hiringOrg"), r.hiring_org_name],
    [t("referralTerms.meta.sourcingOrg"), r.sourcing_org_name],
    [t("referralTerms.meta.delivered"), r.delivered_at ? f.date(r.delivered_at) : t("referralTerms.notDelivered")],
    [t("referralTerms.meta.placement"), r.placement ? f.date(r.placement.created_at) : t("referralTerms.meta.noPlacement")],
    [t("referralTerms.meta.client"), r.client_label === SQL_CONFIDENTIAL_CLIENT ? tj("terms.clientConfidential") : r.client_label],
    [t("referralTerms.meta.candidate"), r.candidate_label],
  ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <Link href="/admin/referrals" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground sm:min-h-0">
        <ArrowLeft className="size-4" aria-hidden /> {t("referralTerms.title")}
      </Link>
      <PageHeader title={r.job_title} description={`${r.sourcing_org_name} → ${r.hiring_org_name}`} actions={REFERRAL_STATUS[status] ? <StatusPill tone={REFERRAL_STATUS[status].tone} label={tg(`labels.referralStatus.${status}`)} /> : null} />

      <Panel className="p-6">
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          {meta.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="mt-0.5 text-sm font-medium break-words">{v}</dd>
            </div>
          ))}
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">{t("referralTerms.meta.status")}</dt>
            <dd className="mt-0.5 text-sm font-medium">{REFERRAL_STATUS[status] ? tg(`labels.referralStatus.${status}`) : r.status}</dd>
          </div>
        </dl>
      </Panel>

      {/* S21 (BR-12 rev. 2): only when the referral has a hire record (placement or recorded without a split). */}
      {hireRecord ? <HireRecordPanel record={hireRecord} hiringOrg={r.hiring_org_name} /> : null}

      {r.delivered_at ? (
        <Panel className="grid gap-4 p-6">
          <SectionTitle>{tg("referrals.authCheck.title")}</SectionTitle>
          {authChecks ? <AuthCheckAdmin referralId={r.referral_id} data={authChecks} /> : <p role="alert" className="text-sm text-danger">{tg("errors.generic")}</p>}
        </Panel>
      ) : null}

      {r.recorded && effective && original ? (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-2">
          <Panel className="p-6">
            <SectionTitle>{t("referralTerms.effective")}</SectionTitle>
            <p className="-mt-2 mb-3 text-xs text-muted-foreground">
              {effective.kind === "amendment" ? tj("terms.amendedLine", { date: f.date(effective.created_at) }) : tj("terms.versionLine", { version: effective.version_no, date: f.date(effective.created_at) })}
            </p>
            <TermsSummary variant="admin" terms={termsFromRow(effective)} split={split} />
          </Panel>
          <Panel className="p-6">
            <SectionTitle>{t("referralTerms.history")}</SectionTitle>
            <ol className="grid gap-4">
              {r.history.map((h) => (
                <li key={h.id} className="grid gap-1 border-l-2 border-border pl-3 text-sm">
                  <p className="font-medium">
                    {h.kind === "job"
                      ? t("referralTerms.historyOriginal", { version: h.version_no, date: f.date(h.created_at) })
                      : t("referralTerms.historyAmendment", { date: f.date(h.created_at), admin: h.created_by_name ?? "—" })}
                  </p>
                  {h.reason ? <p className="text-pretty text-muted-foreground">{t("referralTerms.historyReason", { reason: h.reason })}</p> : null}
                  {h.kind === "amendment" ? (
                    <p className="text-pretty text-muted-foreground">{t("referralTerms.historyRequests", { hiring: h.hiring_request_reference ?? "—", sourcing: h.sourcing_request_reference ?? "—" })}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      ) : null}

      {!r.recorded ? (
        <Blocked text={t("referralTerms.blockedLegacy")} />
      ) : r.placement ? (
        <Blocked text={t("referralTerms.blockedHired", { date: f.date(r.placement.created_at) })} />
      ) : effective && split ? (
        <AmendTermsForm
          key={r.effective_terms_version_id ?? effective.id}
          referralId={r.referral_id}
          effective={termsFromRow(effective)}
          split={split}
          windowLockedHint={r.delivered_at ? t("referralTerms.windowLocked", { date: f.date(r.delivered_at) }) : null}
          pctCurrency={r.pct_amendment_currency}
        />
      ) : null}
    </div>
  );
}

function Blocked({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-muted/50 px-4 py-3 text-sm text-pretty">
      <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      {text}
    </p>
  );
}
