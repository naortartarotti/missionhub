import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Info } from "lucide-react";
import { Panel } from "@/components/shared/card";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { getRequestContext } from "@/server/auth/context";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";
import { getConductReport } from "@/features/network-rules/queries";
import { REPORTER_STATUS_TONE, isClosedReporterStatus, reporterStatusKey } from "@/features/network-rules/ui-state";
import { ConductTextForm } from "@/features/network-rules/components/conduct-text-form";

export async function generateMetadata() {
  return { title: (await getT("network"))("reports.title") };
}

/**
 * S9 detail (§2.9): what was sent, the reporter status, admin questions and the outcome. Readers: the
 * reporting user and the reporting org's org admins (the RPC answers not_found to anyone else). Never
 * the notice, the response, the finding, the level or whether a review was requested.
 */
export default async function ReportPage({ params }: PageProps<"/workspace/[orgSlug]/reports/[caseId]">) {
  const { orgSlug, caseId } = await params;
  const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
  const report = await getConductReport(ctx, caseId);
  if (!report) notFound();
  const [t, f, tg] = await Promise.all([getT("network"), getFormatter(), getGlobalT()]);
  const isReporter = report.is_mine;
  const status = report.status;
  const closed = isClosedReporterStatus(status);
  const openQuestion = report.thread.find((q) => q.id === report.open_question_id) ?? null;
  const referralHref = report.referral_id ? `/workspace/${orgSlug}/referrals/${report.referral_id}` : null;

  const statusBody = (() => {
    switch (status) {
      case "received":
        return t("reports.status.receivedBody", { when: f.etDateTime(report.first_response_due_at) });
      case "input_needed":
        return isReporter ? t("reports.status.inputBody") : t("reports.status.inReviewBody");
      case "in_review":
        return t("reports.status.inReviewBody");
      case "closed":
        return t("reports.outcome.closedBody");
      case "action_taken":
        return t("reports.outcome.actionBody");
      case "no_breach":
        return t("reports.outcome.noBreachBody");
      case "insufficient_evidence":
        return t("reports.outcome.notEnoughBody");
    }
  })();

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("reports.detailTitle", { org: report.reported_org_name })}
        description={!isReporter ? (report.sent_by_former ? t("reports.sentByFormer") : t("reports.sentBy", { name: report.sent_by_name ?? "" })) : undefined}
      />

      <Panel className="grid gap-3" aria-labelledby="report-status">
        <h2 id="report-status" className="sr-only">{t("reports.timeline.title")}</h2>
        <StatusPill tone={REPORTER_STATUS_TONE[status]} label={t(`reports.${reporterStatusKey(status, isReporter)}`)} className="justify-self-start" />
        <p className="text-[15px] text-pretty">{statusBody}</p>
        {status === "closed" && report.closed_reason ? <p className="text-sm whitespace-pre-line text-pretty">{t("reports.outcome.triageReason", { reason: report.closed_reason })}</p> : null}
        {report.outcome_updated_at ? <p className="text-sm text-muted-foreground">{t("reports.outcome.updated", { date: f.etDate(report.outcome_updated_at) })}</p> : null}
        {closed ? (
          <p className="flex items-start gap-2 rounded-2xl bg-muted px-3.5 py-3 text-sm">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {t("reports.outcome.noChange")}
              {referralHref ? (
                <>
                  {" "}
                  <Link href={referralHref} className="font-medium underline underline-offset-4">{t("reports.outcome.openReferral")}</Link>
                </>
              ) : null}
            </span>
          </p>
        ) : null}
      </Panel>

      {/* The open question: reply form for the reporting user only; org admins see the question. */}
      {status === "input_needed" && openQuestion && isReporter ? (
        <Panel className="grid gap-4">
          <SectionTitle>{t("reports.question")}</SectionTitle>
          <p className="text-[15px] whitespace-pre-line text-pretty">{openQuestion.question}</p>
          {openQuestion.due_at ? <p className="text-sm font-medium">{t("reports.status.inputDeadline", { when: f.etDateTime(openQuestion.due_at) })}</p> : null}
          {report.can_reply ? (
            <ConductTextForm
              orgSlug={orgSlug}
              kind="reportReply"
              targetId={report.id}
              label={t("reports.reply")}
              hint={t("reports.replyHint")}
              submitLabel={t("reports.replySubmit")}
              filesHint={t("report.filesHint")}
              successToast={t("reports.replySent")}
              codeMessages={{ conduct_reply_closed: openQuestion.due_at ? t("reports.replyClosed", { when: f.etDateTime(openQuestion.due_at) }) : t("case.errors.replyClosed") }}
            />
          ) : openQuestion.due_at ? (
            <p className="text-sm text-muted-foreground">{t("reports.replyClosed", { when: f.etDateTime(openQuestion.due_at) })}</p>
          ) : null}
        </Panel>
      ) : null}

      <Panel className="grid gap-4">
        <SectionTitle>{t("reports.youSent")}</SectionTitle>
        <dl className="grid gap-3 text-sm sm:grid-cols-[160px_minmax(0,1fr)]">
          <dt className="text-muted-foreground">{t("reports.field.category")}</dt>
          <dd className="font-medium">{tg(`labels.conductCategory.${report.category}`)}</dd>
          <dt className="text-muted-foreground">{t("reports.field.what")}</dt>
          <dd className="whitespace-pre-line text-pretty">{report.description}</dd>
          <dt className="text-muted-foreground">{t("reports.field.when")}</dt>
          <dd>
            {report.occurred_on ? f.date(report.occurred_on) : "—"}
            {report.occurred_on && report.occurred_approx ? ` ${t("reports.field.approximate")}` : ""}
          </dd>
          <dt className="text-muted-foreground">{t("reports.field.files")}</dt>
          <dd className="grid gap-1.5">
            {report.files.length ? (
              <>
                <ul className="grid gap-1.5">
                  {report.files.map((file, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 truncate">{file.file_name}</span>
                      <span className="shrink-0 text-muted-foreground">{f.fileSize(file.size_bytes)}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">{t("reports.field.filesNote")}</p>
              </>
            ) : (
              t("reports.field.noFiles")
            )}
          </dd>
        </dl>
      </Panel>

      <Panel className="grid gap-3">
        <SectionTitle>{t("reports.timeline.title")}</SectionTitle>
        <ol className="grid gap-3 border-l border-border pl-4 text-sm">
          <li>{t("reports.timeline.sent", { when: f.etDateTime(report.created_at) })}</li>
          {report.thread.map((q) => (
            <li key={q.id} className="grid gap-1">
              <span>{t("reports.timeline.question", { when: f.etDateTime(q.asked_at) })}</span>
              {q.id !== openQuestion?.id || !isReporter ? <span className="whitespace-pre-line text-muted-foreground">{q.question}</span> : null}
              {q.reply ? (
                <>
                  <span>{t("reports.timeline.replied", { when: f.etDateTime(q.reply.at) })}</span>
                  <span className="whitespace-pre-line text-muted-foreground">{q.reply.body}</span>
                </>
              ) : null}
            </li>
          ))}
          {closed && report.closed_at ? <li>{t("reports.timeline.closed", { when: f.etDateTime(report.closed_at) })}</li> : null}
        </ol>
      </Panel>
    </div>
  );
}
