import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shared/card";
import { SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { BusinessDeadline } from "@/features/referrals/components/business-deadline";
import { getRequestContext } from "@/server/auth/context";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";
import { getConductCaseForOrg } from "@/features/network-rules/queries";
import { getNoticeI18n } from "@/features/network-rules/page-data";
import { INTL_RULES_LANG, RULES_LOCALE_KEY } from "@/features/network-rules/locale";
import { SANCTION_STATUS_TONE, sanctionStatusKey } from "@/features/network-rules/ui-state";
import { ConductTextForm } from "@/features/network-rules/components/conduct-text-form";
import { ReviewRequestDialog } from "@/features/network-rules/components/review-request-dialog";
import type { OrgCaseNotice } from "@/features/network-rules/types";

export async function generateMetadata() {
  return { title: (await getT("network"))("case.metaTitle") };
}

const OUTCOME_KEY = { no_breach: "no_breach", insufficient_evidence: "not_enough", breach: "breach" } as const;

/**
 * S11 case page, org side (§2.11 item 3). org_admin only (the RPC answers not_found otherwise). The
 * notice and decision templates render in the notice's language (§5.0); the page chrome in the UI
 * locale. No reporter user, report text, category, files, or any platform admin name (N10-D28).
 */
export default async function OrgCasePage({ params }: PageProps<"/workspace/[orgSlug]/settings/standing/[caseId]">) {
  const { orgSlug, caseId } = await params;
  const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
  if (ctx.membershipRole !== "org_admin") notFound();
  const c = await getConductCaseForOrg(ctx, caseId);
  if (!c) notFound();
  const [t, f, tg] = await Promise.all([getT("network"), getFormatter(), getGlobalT()]);
  const back = `/workspace/${orgSlug}/settings/standing`;
  const lastNotice = c.notices[c.notices.length - 1];
  const decisionLang = lastNotice?.language ?? "en";
  const n = await getNoticeI18n(decisionLang);

  return (
    <div className="grid gap-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3 min-h-11 justify-self-start sm:min-h-9">
        <Link href={back}>
          <ArrowLeft className="size-4" aria-hidden /> {t("case.back")}
        </Link>
      </Button>

      {c.notices.map((notice) => (
        <NoticeSection key={notice.id} orgSlug={orgSlug} orgName={ctx.organizationName} notice={notice} holdAppliedAt={c.immediate_hold?.applied_at ?? null} />
      ))}

      {c.decision ? (
        <Panel className="grid gap-4" lang={INTL_RULES_LANG[decisionLang]}>
          <SectionTitle>{n.t("decision.title")}</SectionTitle>
          <p className="text-sm text-muted-foreground">{n.t("decision.decidedOn", { date: n.f.etDate(c.decision.decided_at) })}</p>
          <div className="grid gap-1">
            <p className="text-sm font-medium">{n.t("decision.outcome")}</p>
            <p className="text-[15px] font-semibold">{n.tg(`labels.conductOutcome.${OUTCOME_KEY[c.decision.outcome]}`)}</p>
          </div>
          {c.decision.outcome === "no_breach" ? <p className="text-sm">{n.t("decision.noBreachBody")}</p> : null}
          {c.decision.outcome === "insufficient_evidence" ? <p className="text-sm">{n.t("decision.notEnoughBody")}</p> : null}
          {c.decision.outcome === "breach" ? (
            <>
              {c.decision.finding ? (
                <div className="grid gap-1">
                  <p className="text-sm font-medium">{n.t("decision.finding")}</p>
                  <p className="text-sm whitespace-pre-line text-pretty">{c.decision.finding}</p>
                </div>
              ) : null}
              <div className="grid gap-1">
                <p className="text-sm font-medium">{n.t("decision.rules")}</p>
                <ul className="list-disc pl-5 text-sm">
                  {c.decision.rules_cited.map((num) => {
                    const excerpt = c.notices.flatMap((x) => x.rules_cited).find((r) => r.number === num)?.excerpt;
                    return <li key={num}>{excerpt ? n.t("notice.ruleItem", { number: num, title: excerpt }) : num}</li>;
                  })}
                </ul>
              </div>
              {c.decision.residual_test ? <p className="text-sm">{n.t("decision.residual")}</p> : null}
              <div className="grid gap-2">
                <p className="text-sm font-medium">{n.t("decision.sanction")}</p>
                <p className="text-[15px] font-semibold">{n.tg(`labels.sanctionLevel.${c.decision.level ?? "none"}`)}</p>
                <p className="text-sm text-pretty">
                  {(() => {
                    const s = c.decision.sanctions.find((x) => x.level === c.decision!.level) ?? c.decision.sanctions[0];
                    switch (c.decision.level) {
                      case "warning":
                        return n.t("decision.effects.warning", { date: n.f.etDate(s?.expires_at) });
                      case "network_hold":
                        return n.t("decision.effects.hold", { date: n.f.etDate(s?.applied_at ?? c.immediate_hold?.applied_at) });
                      case "suspension":
                        return n.t("decision.effects.suspension", { date: n.f.etDate(s?.applied_at ?? c.decision.decided_at) });
                      case "termination":
                        return n.t("decision.effects.termination", { date: n.f.etDate(s?.applied_at ?? c.decision.decided_at) });
                      default:
                        return n.t("decision.effects.none");
                    }
                  })()}
                </p>
                {c.immediate_hold?.ended_at && c.decision.level !== "network_hold" ? <p className="text-sm">{n.t("decision.effects.holdLifted", { date: n.f.etDate(c.immediate_hold.ended_at) })}</p> : null}
                {c.decision.level === "network_hold" && c.decision.planned_review_on ? (
                  <p className="text-sm text-muted-foreground">
                    {t("standing.plannedReview", { date: f.date(c.decision.planned_review_on) })} {t("standing.plannedReviewHint")}
                  </p>
                ) : null}
                <ul className="flex flex-wrap gap-2">
                  {c.decision.sanctions.map((s, i) => (
                    <li key={i}>
                      <StatusPill tone={SANCTION_STATUS_TONE[s.status]} label={`${tg(`labels.sanctionLevel.${s.level}`)} · ${tg(`labels.sanctionStatus.${sanctionStatusKey(s.status)}`, { date: f.etDate(s.status === "expired" ? s.expires_at : s.ended_at) })}`} />
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}

          {/* Review (BR-31): request once, before the stored deadline; then the outcome (no admin named). */}
          {c.decision.review ? (
            <div className="grid gap-2 border-t border-border/60 pt-4">
              <p className="text-sm">{t("case.reviewRequested", { date: f.etDate(c.decision.review.requested_at), name: c.decision.review.requested_by_name ?? "—" })}</p>
              {c.decision.review.outcome ? (
                <>
                  <p className="text-[15px] font-semibold">
                    {c.decision.review.outcome === "confirm"
                      ? n.t("case.review.confirmed")
                      : c.decision.review.outcome === "overturn"
                        ? n.t("case.review.overturned")
                        : c.decision.review.new_level === "none"
                          ? n.t("case.review.lifted")
                          : n.t("case.review.reduced", { level: n.tg(`labels.sanctionLevel.${(c.decision.review.new_level ?? "none") as "none"}`) })}
                  </p>
                  {c.decision.review.reason ? (
                    <div className="grid gap-1">
                      <p className="text-sm font-medium">{n.t("case.review.reason")}</p>
                      <p className="text-sm whitespace-pre-line text-pretty">{c.decision.review.reason}</p>
                    </div>
                  ) : null}
                  {c.decision.review.decided_at ? <p className="text-sm text-muted-foreground">{n.t("case.review.reviewedOn", { date: n.f.etDate(c.decision.review.decided_at) })}</p> : null}
                </>
              ) : null}
            </div>
          ) : c.decision.outcome === "breach" && c.decision.review_request_due_at ? (
            <div className="grid gap-3 border-t border-border/60 pt-4">
              {c.decision.can_request_review ? (
                <>
                  <p className="text-sm text-pretty">{c.decision.level ? n.t("decision.reviewLine", { when: n.f.etDateTime(c.decision.review_request_due_at) }) : n.t("decision.reviewLineFinding", { when: n.f.etDateTime(c.decision.review_request_due_at) })}</p>
                  <ReviewRequestDialog
                    orgSlug={orgSlug}
                    caseId={c.id}
                    finding={!c.decision.level}
                    codeMessages={{ review_window_closed: t("case.errors.reviewClosed"), review_already_requested: t("case.errors.reviewExists") }}
                  />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t("case.errors.reviewClosed")}</p>
              )}
            </div>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}

/** One notice exactly as sent (template in the notice's language), then the response and follow-ups. */
async function NoticeSection({ orgSlug, orgName, notice, holdAppliedAt }: { orgSlug: string; orgName: string; notice: OrgCaseNotice; holdAppliedAt: string | null }) {
  const [t, f] = await Promise.all([getT("network"), getFormatter()]);
  const n = await getNoticeI18n(notice.language);
  const immediate = notice.kind === "immediate_hold";
  const closed = !notice.can_respond && !notice.response;
  return (
    <>
      <Panel className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{t("case.sentOn", { when: f.etDateTime(notice.sent_at) })}</p>
          <p className="text-xs text-muted-foreground">{t("case.languageNote", { language: t(`accept.languageInline.${RULES_LOCALE_KEY[notice.language]}`) })}</p>
        </div>
        <article lang={INTL_RULES_LANG[notice.language]} className="grid gap-4">
          <h2 className="text-lg font-semibold tracking-tight">{immediate ? n.t("notice.headingImmediate") : n.t("notice.heading")}</h2>
          <p className="text-[15px] text-pretty">
            {immediate
              ? n.t("notice.introImmediate", { org: orgName, date: n.f.etDate(holdAppliedAt ?? notice.sent_at), rule: notice.immediate_ground ?? "" })
              : n.t("notice.intro", { org: orgName })}
          </p>
          {immediate ? <p className="text-sm text-pretty">{n.t("notice.holdEffects")}</p> : null}
          <section className="grid gap-1.5">
            <h3 className="text-sm font-semibold">{n.t("notice.rules")}</h3>
            <ul className="list-disc pl-5 text-sm">
              {notice.rules_cited.map((r) => (
                <li key={r.number}>{n.t("notice.ruleItem", { number: r.number, title: r.excerpt })}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{n.t("notice.version", { label: notice.rules_version_label })}</p>
          </section>
          <section className="grid gap-1">
            <h3 className="text-sm font-semibold">{n.t("notice.alleged")}</h3>
            <p className="text-sm whitespace-pre-line text-pretty">{notice.allegation}</p>
          </section>
          <section className="grid gap-1">
            <h3 className="text-sm font-semibold">{n.t("notice.when")}</h3>
            <p className="text-sm">{notice.alleged_when}</p>
          </section>
          <section className="grid gap-1">
            <h3 className="text-sm font-semibold">{n.t("notice.evidence")}</h3>
            <p className="text-sm whitespace-pre-line text-pretty">{notice.evidence_summary}</p>
          </section>
          {notice.reporter_org_name ? <p className="text-sm font-medium">{n.t("notice.reportedBy", { org: notice.reporter_org_name })}</p> : null}
          <p className="text-sm font-semibold">{n.t("notice.deadline", { when: n.f.etDateTime(notice.response_due_at) })}</p>
          <p className="text-sm text-pretty">{n.t("notice.howToRespond")}</p>
          {notice.outcomes_line ? (
            <p className="flex items-start gap-2 rounded-2xl bg-muted px-3.5 py-3 text-sm text-pretty">
              <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>{notice.outcomes_line}</span>
            </p>
          ) : null}
        </article>
      </Panel>

      <Panel className="grid gap-4">
        <SectionTitle>{t("case.respond")}</SectionTitle>
        {notice.response ? (
          <div className="grid gap-2">
            <p className="text-sm font-medium">{t("case.responded", { when: f.etDateTime(notice.response.submitted_at), name: notice.response.author_name ?? "—" })}</p>
            <p className="text-sm whitespace-pre-line text-pretty">{notice.response.body}</p>
            <FileList files={notice.response.files} />
          </div>
        ) : notice.can_respond ? (
          <>
            <BusinessDeadline label={t("standing.deadlineLabel")} at={notice.response_due_at} left={notice.business_days_left < 0 ? null : notice.business_days_left} />
            <ConductTextForm
              orgSlug={orgSlug}
              kind="response"
              targetId={notice.id}
              label={t("case.respond")}
              hint={t("case.respondHint")}
              submitLabel={t("case.respondSubmit")}
              filesHint={t("case.filesHint")}
              confirm={{ title: t("case.respondConfirmTitle"), body: t("case.respondConfirmBody"), confirmLabel: t("case.respondSubmit") }}
              successToast={t("case.respondedToast")}
              codeMessages={{ conduct_response_closed: t("case.errors.closed"), conduct_response_exists: t("case.errors.exists") }}
            />
          </>
        ) : closed ? (
          <p className="text-sm text-pretty">{t("case.windowClosed", { when: f.etDateTime(notice.response_due_at) })}</p>
        ) : null}
      </Panel>

      {notice.followups.map((q) => (
        <Panel key={q.id} className="grid gap-3">
          <SectionTitle>{t("case.followup")}</SectionTitle>
          <p className="text-sm whitespace-pre-line text-pretty">{q.question}</p>
          <p className="text-sm text-muted-foreground">{q.due_at ? t("case.followupDeadline", { when: f.etDateTime(q.due_at) }) : t("case.followupNoDeadline")}</p>
          {q.reply_body ? (
            <div className="grid gap-1 border-t border-border/60 pt-3">
              <p className="text-sm font-medium">{t("case.followupReplied", { when: f.etDateTime(q.replied_at), name: q.reply_by_name ?? "—" })}</p>
              <p className="text-sm whitespace-pre-line text-pretty">{q.reply_body}</p>
            </div>
          ) : q.can_reply ? (
            <ConductTextForm
              orgSlug={orgSlug}
              kind="followupReply"
              targetId={q.id}
              label={t("case.followupReply")}
              hint={t("case.respondHint")}
              submitLabel={t("case.followupSubmit")}
              filesHint={t("case.filesHint")}
              successToast={t("case.followupSent")}
              codeMessages={{ conduct_reply_closed: q.due_at ? t("case.followupClosed", { when: f.etDateTime(q.due_at) }) : t("case.errors.replyClosed"), conduct_response_exists: t("case.errors.exists") }}
            />
          ) : q.due_at ? (
            <p className="text-sm text-muted-foreground">{t("case.followupClosed", { when: f.etDateTime(q.due_at) })}</p>
          ) : null}
        </Panel>
      ))}
    </>
  );
}

async function FileList({ files }: { files: { file_name: string; size_bytes: number }[] }) {
  const f = await getFormatter();
  if (!files.length) return null;
  return (
    <ul className="grid gap-1.5 text-sm">
      {files.map((file, i) => (
        <li key={i} className="flex items-center gap-2">
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 truncate">{file.file_name}</span>
          <span className="shrink-0 text-muted-foreground">{f.fileSize(file.size_bytes)}</span>
        </li>
      ))}
    </ul>
  );
}
