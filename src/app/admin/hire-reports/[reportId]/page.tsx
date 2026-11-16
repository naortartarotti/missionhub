import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, CircleAlert, Clock, ExternalLink, Minus } from "lucide-react";
import { createClient } from "@/server/supabase/server";
import { getAdminAuthorizationChecks, getAdminHireReport, type AdminHireReportDetail } from "@/features/admin/queries";
import { BusinessDeadline } from "@/features/referrals/components/business-deadline";
import { isUuid } from "@/features/admin/referral-lookup";
import { AdminHireFiles, AuthCheckAdmin, HireReportDecision, HireReportFieldsForm } from "@/features/admin/components/hire-report-admin";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { Panel } from "@/components/shared/card";
import { StatusPill, type Tone } from "@/components/shared/status-pill";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";
import type { Paths } from "@/i18n/translate";
import type { Messages } from "@/i18n/messages";

export async function generateMetadata() {
  return { title: (await getT("admin"))("hireReports.title") };
}

type Item = AdminHireReportDetail["report"]["items"][number];

const TONE: Record<string, Tone> = { awaiting_answer: "warning", upheld: "success", confirmed: "success", closed_by_record: "success", deemed_confirmed: "success", rejected: "neutral", void: "neutral" };

/**
 * S15 /admin/hire-reports/[reportId] (BR-5, BR-27 to BR-29, BR-37): referral facts with both client keys and the
 * static coverage checklist (no computed verdict), the report with every link and file, the answer and rebuttal,
 * signals, delivery records, audited admin fields, the authorization check, and the decision. No money anywhere.
 */
export default async function AdminHireReportPage({ params }: PageProps<"/admin/hire-reports/[reportId]">) {
  const { reportId } = await params;
  if (!isUuid(reportId)) notFound();
  const db = await createClient();
  const d = await getAdminHireReport(db, reportId);
  if (!d) notFound();
  const [t, tg, f, checks] = await Promise.all([getT("admin"), getGlobalT(), getFormatter(), getAdminAuthorizationChecks(db, d.referral_id).catch(() => null)]);
  const label = (k: string) => tg(k as Paths<Messages>);
  // v2.1: the deadline with server business days left (decide / answer / rebuttal).
  const [due, dueLeft] =
    d.status === "in_review" || d.status === "unanswered" ? [d.decide_by, d.decide_business_days_left]
    : d.status === "awaiting_answer" ? [d.report.answer_due_at, d.answer_business_days_left]
    : d.status === "contested" ? [d.answer?.rebuttal_due_at ?? null, d.rebuttal_business_days_left]
    : [null, null];

  const items = (list: Item[]) => (
    <ul className="grid gap-1.5">
      {list.map((it, i) => (
        <li key={i} className="grid gap-0.5">
          <span className="text-pretty">
            {label(`labels.hireEvidenceType.${it.type}`)} · {f.date(it.item_date)}
            {it.captured_on ? ` · ${tg("referrals.hireReport.panel.itemCaptured", { date: f.date(it.captured_on) })}` : ""}
            {it.backs_tail ? ` · ${tg("referrals.hireReport.item.backsTail")}` : ""}
          </span>
          {it.url && /^https:\/\//.test(it.url) ? (
            <a href={it.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 text-xs break-all underline underline-offset-4">
              <ExternalLink className="mt-0.5 size-3 shrink-0" aria-hidden />{it.url}<span className="sr-only"> {tg("referrals.hireReport.panel.newTab")}</span>
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <Link href="/admin/hire-reports" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground sm:min-h-0">
        <ArrowLeft className="size-4" aria-hidden /> {t("hireReports.title")}
      </Link>
      <PageHeader
        title={`${d.source_org.name} → ${d.target_org.name}`}
        description={d.job_title}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={TONE[d.status] ?? "info"} label={label(`labels.hireReportStatus.${d.status}`)} wrap />
            {d.source_org.suspended || d.target_org.suspended ? <StatusPill tone="danger" label={t("orgs.suspended")} wrap /> : null}
          </div>
        }
      />
      {due ? (
        <div className="-mt-2 flex flex-wrap items-start gap-2">
          <BusinessDeadline at={due} left={dueLeft} label={d.decide_by && due === d.decide_by ? t("hireReports.decideBy") : undefined} />
          {d.overdue ? <StatusPill tone="warning" icon={CircleAlert} label={t("hireReports.overdue")} className="text-xs" /> : null}
        </div>
      ) : null}

      {d.resolved_at ? (
        <Panel className="grid gap-1 text-sm">
          <p className="font-medium">{label(`labels.hireReportStatus.${d.status}`)} · {f.date(d.resolved_at)}{d.finding ? ` · ${t(`hireReports.finding.${d.finding as "not_hired"}`)}` : ""}</p>
          {d.resolution ? <p className="text-pretty text-muted-foreground">{t("disputes.quote", { text: d.resolution })}</p> : null}
        </Panel>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-2">
        <div className="grid min-w-0 gap-6">
          <Section title={t("hireReports.detail.facts")}>
            <ul className="grid gap-1.5 text-sm">
              {/* PD-079 (AC-61): names aren't stored at submission or delivery; the normalized keys plus today's job name. */}
              <li className="break-words">{t("hireReports.clientKeyCommit", { key: d.client.commit_key ?? "—" })}</li>
              <li className="break-words">{t("hireReports.clientKeyDelivery", { key: d.client.delivery_key ?? "—" })}</li>
              <li className="break-words">{t("hireReports.jobClientToday", { client: d.client.job_client_name ?? "—" })}</li>
              <li>{t("hireReports.detail.delivered", { date: f.date(d.delivered_at) })}</li>
              {d.window_end ? <li>{t("hireReports.windowEnd", { date: f.date(d.window_end) })}</li> : null}
              {d.tail_end ? <li>{t("hireReports.tailEnd", { date: f.date(d.tail_end) })}</li> : null}
              <li>{t("hireReports.detail.legacy", { value: tg(d.legacy ? "common.yes" : "common.no") })}</li>
            </ul>
            <div className="grid gap-1.5">
              <h3 className="text-xs font-medium text-muted-foreground">{t("hireReports.detail.history")}</h3>
              <ol className="grid gap-1 text-sm">
                {d.status_history.map((e, i) => (
                  <li key={i} className="flex justify-between gap-3"><span>{label(`labels.referralStatus.${e.to}`)}</span><span className="text-muted-foreground">{f.date(e.at)}</span></li>
                ))}
              </ol>
            </div>
            {/* BR-5: the admin applies the coverage test; the server never evaluates it. Text only. */}
            <div className="grid gap-2 rounded-2xl bg-muted/50 p-4 text-sm">
              <h3 className="font-semibold">{t("hireReports.coverage.title")}</h3>
              <ol className="grid list-decimal gap-1.5 pl-5 text-pretty">
                <li>{t("hireReports.coverage.one")}</li>
                <li>{t("hireReports.coverage.two")}</li>
                <li>{t("hireReports.coverage.three")}</li>
              </ol>
              <p className="text-pretty text-muted-foreground">{t("hireReports.coverage.never")}</p>
            </div>
          </Section>

          <Section title={tg("referrals.hireReport.panel.title")}>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[12rem_1fr]">
              <Row label={tg("referrals.claim.panel.filed")}>{tg("referrals.hireReport.panel.filedBy", { when: f.etDateTime(d.report.filed_at), who: d.report.filed_by_name ?? d.source_org.name })}</Row>
              <Row label={tg("referrals.hireReport.panel.rows.employer")}><span className="break-words">{d.report.employer_text}</span></Row>
              <Row label={tg("referrals.hireReport.startMonth")}>{f.monthYear(d.report.start_month)}</Row>
              <Row label={tg("referrals.hireReport.panel.rows.role")}>{d.report.role_text || tg("referrals.hireReport.panel.notGiven")}</Row>
              <Row label={tg("referrals.hireReport.panel.rows.learnedVia")}>{label(`labels.hireLearnedVia.${d.report.learned_via}`)}</Row>
              {d.report.tail_statement ? <Row label={tg("referrals.hireReport.panel.rows.tail")}>{tg("referrals.hireReport.panel.tailMade", { windowEnd: f.date(d.window_end) })}</Row> : null}
              <Row label={tg("referrals.claim.panel.evidence")}>{items(d.report.items)}</Row>
              {d.report.files.length ? <Row label={tg("referrals.hireReport.panel.rows.files")}><AdminHireFiles files={d.report.files} /></Row> : null}
              <Row label={tg("referrals.hireReport.statement")}><blockquote className="border-l-2 border-border pl-3 whitespace-pre-line text-pretty break-words">{d.report.statement}</blockquote></Row>
            </dl>
          </Section>

          <Section title={t("hireReports.detail.answer", { org: d.target_org.name })}>
            {d.answer ? (
              <div className="grid gap-2 text-sm">
                <p className="font-medium text-pretty">{label(`labels.hireContestReason.${d.answer.reason}`)}</p>
                <p className="text-muted-foreground">{f.etDateTime(d.answer.contested_at)}</p>
                {d.answer.offer_accepted_on || d.answer.process_started_on ? (
                  <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[auto_1fr]">
                    {d.answer.offer_accepted_on ? <><dt className="text-muted-foreground">{tg("referrals.hireContest.acceptedOn")}</dt><dd>{f.date(d.answer.offer_accepted_on)}</dd></> : null}
                    {d.answer.process_started_on ? <><dt className="text-muted-foreground">{tg("referrals.hireContest.processStarted")}</dt><dd>{f.date(d.answer.process_started_on)}</dd></> : null}
                  </dl>
                ) : null}
                <blockquote className="border-l-2 border-border pl-3 whitespace-pre-line text-pretty break-words">{d.answer.statement}</blockquote>
                <AdminHireFiles files={d.answer.files} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("hireReports.detail.noAnswer")}</p>
            )}
          </Section>

          {d.rebuttal ? (
            <Section title={t("hireReports.detail.rebuttal", { org: d.source_org.name })}>
              <div className="grid gap-2 text-sm">
                <p className="text-muted-foreground">{f.etDateTime(d.rebuttal.at)}</p>
                <blockquote className="border-l-2 border-border pl-3 whitespace-pre-line text-pretty break-words">{d.rebuttal.statement}</blockquote>
                {d.rebuttal.items.length ? items(d.rebuttal.items) : null}
                <AdminHireFiles files={d.rebuttal.files} />
              </div>
            </Section>
          ) : null}
        </div>

        <div className="grid min-w-0 gap-6">
          <Section title={t("hireReports.detail.signals")}>
            <div className="grid gap-2 rounded-2xl border border-border/60 p-3">
              <h3 className="text-sm font-semibold">{t("disputes.claim.samePerson")}</h3>
              <dl className="grid gap-2 text-sm">
                {(["email", "phone", "linkedin"] as const).map((k) => (
                  <div key={k} className="flex flex-wrap items-center justify-between gap-2">
                    <dt className="text-muted-foreground">{t(`disputes.claim.samePerson${k === "email" ? "Email" : k === "phone" ? "Phone" : "Linkedin"}`)}</dt>
                    <dd><StatusPill tone="neutral" icon={Minus} label={tg(`labels.identifierMatch.${d.signals.same_person[k]}`)} className="text-xs text-muted-foreground" /></dd>
                  </div>
                ))}
              </dl>
            </div>
            <ul className="grid gap-1.5 text-sm">
              {d.signals.record_created_at ? <li>{tg("referrals.detail.recordCreated", { date: f.date(d.signals.record_created_at) })}</li> : null}
              {d.signals.email_changed_at ? <li>{t("hireReports.detail.emailChanged", { date: f.date(d.signals.email_changed_at) })}</li> : null}
              {d.signals.source_rejected_90d >= 2 ? <li className="grid gap-0.5"><span className="text-xs text-muted-foreground">{d.source_org.name}</span><span>{t("flags.rejectedHireReports", { count: d.signals.source_rejected_90d })}</span></li> : null}
              {d.signals.late ? <li><StatusPill tone="warning" icon={Clock} label={t("hireRecord.late")} className="text-xs" /></li> : null}
              {d.signals.hire_record_note ? <li className="grid gap-0.5"><span className="text-xs font-medium text-muted-foreground">{t("hireRecord.note")}</span><span className="whitespace-pre-line text-pretty">{d.signals.hire_record_note}</span></li> : null}
            </ul>
          </Section>

          <Section title={t("hireReports.detail.deliveryRecords")}>
            {d.delivery_records.length ? (
              <ul className="grid gap-1 text-sm">
                {d.delivery_records.map((r, i) => <li key={i} className="flex flex-wrap justify-between gap-2"><span className="font-mono text-xs">{r.recipient_user_id.slice(0, 8)}</span><span>{r.status} · {f.etDateTime(r.status_at)}</span></li>)}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("hireReports.noDeliveryRecords")}</p>
            )}
          </Section>

          <Section title={t("hireReports.detail.adminFields")}>
            <HireReportFieldsForm reportId={d.id} hiringOrg={d.target_org.name} initial={d.admin} />
          </Section>

          <Section title={tg("referrals.authCheck.title")}>
            {checks ? <AuthCheckAdmin referralId={d.referral_id} data={checks} /> : <p role="alert" className="text-sm text-danger">{tg("errors.generic")}</p>}
          </Section>
        </div>
      </div>

      {/* Actions last in DOM order; sticky on desktop (spec S15). */}
      {d.can_decide ? (
        <Panel className="lg:sticky lg:bottom-4 lg:z-10 lg:shadow-lg">
          <HireReportDecision reportId={d.id} hiringOrg={d.target_org.name} upholdCreatesPlacement={d.uphold_creates_placement} />
        </Panel>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel className="grid gap-4">
      <section className="grid gap-4">
        <SectionTitle>{title}</SectionTitle>
        {children}
      </section>
    </Panel>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-xs font-medium text-muted-foreground sm:pt-0.5">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}
