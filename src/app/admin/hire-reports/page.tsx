import Link from "next/link";
import { ArrowRight, CircleAlert, Scale } from "lucide-react";
import { createClient } from "@/server/supabase/server";
import { listAdminHireReports, listAdminHireTasks, type AdminHireReportRow, type AdminHireTask } from "@/features/admin/queries";
import { NoticeSentDialog } from "@/features/admin/components/hire-report-admin";
import { BusinessDeadline } from "@/features/referrals/components/business-deadline";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { Panel } from "@/components/shared/card";
import { StatusPill } from "@/components/shared/status-pill";
import { EmptyState } from "@/components/shared/empty-state";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";
import type { Paths } from "@/i18n/translate";
import type { Messages } from "@/i18n/messages";

export async function generateMetadata() {
  return { title: (await getT("admin"))("hireReports.title") };
}

/**
 * S14 /admin/hire-reports (BR-27 to BR-31, BR-40; spec §2.9, §2.14). Sections: to decide, waiting on a party,
 * tasks (late records, fee details overdue), recently closed. A section whose read fails says so; it never
 * reads as empty. The layout 404s non-admins; the RPCs re-check.
 */
export default async function AdminHireReportsPage() {
  const db = await createClient();
  const [t, tg, f] = await Promise.all([getT("admin"), getGlobalT(), getFormatter()]);
  const [rows, tasks] = await Promise.all([listAdminHireReports(db).catch(() => null), listAdminHireTasks(db).catch(() => null)]);

  const decide = rows?.filter((r) => r.section === "decide") ?? [];
  const waiting = rows?.filter((r) => r.section === "waiting") ?? [];
  const closed = rows?.filter((r) => r.section === "closed") ?? [];
  const allEmpty = rows !== null && tasks !== null && !rows.length && !tasks.length;

  const orgs = (r: { source_org_name: string; target_org_name: string }) => `${r.source_org_name} → ${r.target_org_name}`;
  // v2.1: `BusinessDeadline` with server business days left; Overdue chip after it (S14).
  const deadline = (r: AdminHireReportRow) =>
    r.deadline ? (
      <div className="flex flex-wrap items-start gap-2">
        <BusinessDeadline at={r.deadline} left={r.deadline_business_days_left} label={r.section === "decide" ? t("hireReports.decideBy") : undefined} />
        {r.overdue ? <StatusPill tone="warning" icon={CircleAlert} label={t("hireReports.overdue")} className="text-xs" wrap /> : null}
      </div>
    ) : null;
  const href = (r: AdminHireReportRow) => (r.row_kind === "report" ? `/admin/hire-reports/${r.id}` : `/admin/referrals/${r.referral_id}`);

  const card = (r: AdminHireReportRow, pill: React.ReactNode) => (
    <li key={`${r.row_kind}-${r.id}`}>
      <Link href={href(r)} className="group grid h-full gap-2 rounded-2xl border border-border p-4 text-sm transition-colors hover:bg-accent focus-visible:outline-2">
        <div className="flex flex-wrap items-center gap-2">
          {pill}
          {r.source_suspended || r.target_suspended ? <StatusPill tone="danger" label={t("orgs.suspended")} className="text-xs" /> : null}
        </div>
        <p className="font-semibold text-pretty break-words">{r.job_title}</p>
        <p className="text-pretty break-words text-muted-foreground">{orgs(r)}</p>
        <p className="text-muted-foreground">{t("hireReports.detail.filed", { date: f.date(r.filed_at) })}</p>
        {r.section === "closed" ? <p className="text-muted-foreground">{f.date(r.resolved_at)}</p> : deadline(r)}
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
          {r.row_kind === "report" ? t("hireReports.detail.openReport") : t("authCheck.open")} <ArrowRight className="size-3.5" aria-hidden />
        </span>
      </Link>
    </li>
  );
  const statusPill = (r: AdminHireReportRow) =>
    r.row_kind === "auth_check"
      ? <StatusPill tone="info" label={tg("referrals.authCheck.title")} className="text-xs" wrap />
      : <StatusPill tone={r.status === "upheld" || r.status.includes("confirmed") || r.status === "closed_by_record" ? "success" : r.status === "awaiting_answer" ? "warning" : r.status === "rejected" || r.status === "void" ? "neutral" : "info"} label={tg(`labels.hireReportStatus.${r.status}` as Paths<Messages>)} className="text-xs" wrap />;

  const failed = <p role="alert" className="flex items-start gap-2 text-sm text-danger"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{tg("errors.generic")}</p>;
  const section = (title: string, count: number | null, body: React.ReactNode) => (
    <Panel>
      <SectionTitle>
        {title}
        {count !== null ? <span className="ml-2 rounded-full bg-muted px-2 py-0.5 align-middle text-xs font-medium text-muted-foreground tabular-nums">{count}</span> : null}
      </SectionTitle>
      {body}
    </Panel>
  );

  const taskLine = (task: AdminHireTask) => (
    <li key={`${task.task}-${task.referral_id}`} className="grid gap-2 rounded-2xl border border-border p-4 text-sm">
      <p className="font-medium text-pretty">
        {task.task === "fee_overdue"
          ? t("hireReports.task.feeOverdue", { date: f.date(task.fee_details_due_at) })
          : t("hireReports.task.late", { date: f.date(task.recorded_at), start: f.date(task.start_date) })}
      </p>
      <p className="text-pretty break-words text-muted-foreground">{task.job_title} · {orgs(task)}</p>
      {task.task === "fee_overdue" && task.notice_sent_on ? <p>{t("hireReports.noticeSentLine", { date: f.date(task.notice_sent_on) })}</p> : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {task.task === "fee_overdue" && task.placement_id && !task.notice_sent_on ? <NoticeSentDialog placementId={task.placement_id} minDate={task.recorded_at.slice(0, 10)} /> : null}
        <Link href={`/admin/referrals/${task.referral_id}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium underline-offset-4 hover:underline sm:min-h-0">
          {tg("commissions.detail.openReferral")} <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </li>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title={t("hireReports.title")} description={t("hireReports.description")} />
      {allEmpty ? (
        <EmptyState icon={Scale} title={t("hireReports.empty.all")} description={t("hireReports.description")} />
      ) : (
        <>
          {section(t("hireReports.sections.decide"), rows ? decide.length : null,
            rows === null ? failed : !decide.length ? <p className="text-sm text-muted-foreground">{t("hireReports.empty.decide")}</p> : (
              <ul className="grid gap-3 lg:grid-cols-2">
                {decide.map((r) => card(r, <StatusPill tone="info" icon={Scale} label={r.status === "unanswered" ? t("hireReports.type.unanswered") : t("hireReports.type.contested")} className="text-xs" wrap />))}
              </ul>
            ))}
          {section(t("hireReports.sections.waiting"), rows ? waiting.length : null,
            rows === null ? failed : !waiting.length ? <p className="text-sm text-muted-foreground">{t("hireReports.empty.waiting")}</p> : (
              <ul className="grid gap-3 lg:grid-cols-2">{waiting.map((r) => card(r, statusPill(r)))}</ul>
            ))}
          {section(t("hireReports.sections.tasks"), tasks ? tasks.length : null,
            tasks === null ? failed : !tasks.length ? <p className="text-sm text-muted-foreground">{t("hireReports.empty.tasks")}</p> : (
              <ul className="grid gap-3 lg:grid-cols-2">{tasks.map(taskLine)}</ul>
            ))}
          {rows === null || closed.length ? section(t("hireReports.sections.closed"), rows ? closed.length : null,
            rows === null ? failed : <ul className="grid gap-3 lg:grid-cols-2">{closed.map((r) => card(r, statusPill(r)))}</ul>) : null}
        </>
      )}
    </div>
  );
}
