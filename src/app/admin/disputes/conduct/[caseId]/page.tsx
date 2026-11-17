import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Lock } from "lucide-react";
import { createClient } from "@/server/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shared/card";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { LOCALE_NAMES, isLocale } from "@/i18n/config";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";
import { getConductCase, getConductNoticeContext, getIncidentOptions } from "@/features/network-rules/admin-queries";
import { getNoticeTemplates } from "@/features/network-rules/page-data";
import type { ConductCategory, RulesLocale, SanctionLevel } from "@/features/network-rules/domain";
import { CONDUCT_STATE_TONE, conductStateKey, AdminDeadline } from "@/features/network-rules/components/admin-conduct-card";
import { AdminConductEvidenceDownload, noticeLanguageFor } from "@/features/network-rules/components/admin-case-shared";
import { FollowupDialog, TriagePanel, type NoticeContext } from "@/features/network-rules/components/admin-case-triage";
import { DecisionForm, IncidentDialog, ReviewPanel, type IncidentOption } from "@/features/network-rules/components/admin-case-decision";

export async function generateMetadata() {
  return { title: (await getT("admin"))("disputes.title") };
}

type AdminNotice = {
  id: string;
  kind: "standard" | "immediate_hold";
  language: RulesLocale;
  rules_version_id: string;
  rules_version_label: string;
  rules_cited: string[];
  conduct_date: string;
  allegation: string;
  alleged_when: string;
  evidence_summary: string;
  reporter_org_name: string | null;
  outcomes_line: string | null;
  has_outcomes_line: boolean;
  immediate_ground: string | null;
  sent_at: string;
  response_due_at: string;
  sent_by_name: string | null;
  window_closed: boolean;
  response: { id: string; body: string; submitted_at: string; author_name: string | null } | null;
  followups: { id: string; question: string; due_at: string | null; asked_at: string; reply_body: string | null; replied_at: string | null; reply_by_name: string | null }[];
};
type AdminCase = {
  id: string;
  source: "referral" | "job" | "admin";
  status: string;
  state: string;
  category: ConductCategory;
  admin_category: ConductCategory | null;
  possible_94: boolean;
  description: string;
  occurred_on: string | null;
  occurred_approx: boolean;
  created_at: string;
  first_response_due_at: string | null;
  first_response_at: string | null;
  closed_reason: string | null;
  referral_id: string | null;
  job_id: string | null;
  reported_org: { id: string; name: string; locale: string | null; restriction: string | null };
  reporter_org: { id: string; name: string } | null;
  reporter_user: { id: string; name: string; email: string; active_member: boolean } | null;
  opened_by_admin_name: string | null;
  files: { id: string; file_name: string; size_bytes: number; sha256: string | null; scan_status: string; purpose: string }[];
  thread: { id: string; kind: string; parent_id: string | null; body: string; due_at: string | null; created_at: string; author_name: string | null }[];
  notices: AdminNotice[];
  decision: {
    id: string;
    notice_id: string;
    outcome: "no_breach" | "insufficient_evidence" | "breach";
    finding: string | null;
    rules_cited: string[];
    level: SanctionLevel | null;
    why_not_hold: string | null;
    decided_at: string;
    decided_by_name: string | null;
    review: { id: string; request_text: string; requested_at: string; requested_by_name: string | null; outcome: string | null; new_level: string | null; reason: string | null; decided_at: string | null; reviewer_name: string | null } | null;
  } | null;
  sanctions: { id: string; level: SanctionLevel; applied_at: string; applied_by_name: string | null; status: string; expires_at: string | null }[];
  org_context: { history: { kind: "sanction" | "finding"; id: string; case_id: string; level: SanctionLevel | null; at: string; status: string }[]; open_cases: number };
  immediate_hold: { id: string; ground: string; status: string } | null;
  can_apply_immediate_hold: boolean;
  no_sanction_allowed: boolean;
  has_eligible_reviewer: boolean;
  viewer_can_review: boolean;
  viewer_is_hold_applier: boolean;
  incident_allowed: boolean;
};

const OUTCOME_KEY = { no_breach: "no_breach", insufficient_evidence: "not_enough", breach: "breach" } as const;

/**
 * S13 admin case page (§2.12): the record on the left, state-dependent actions on the right (sticky
 * from lg; after the record on 375px). Platform admins only (admin layout + RPC check).
 */
export default async function AdminConductCasePage({ params }: PageProps<"/admin/disputes/conduct/[caseId]">) {
  const { caseId } = await params;
  const db = await createClient();
  const raw = await getConductCase(db, caseId);
  if (!raw) notFound();
  const c = raw as unknown as AdminCase;
  const [t, tg, f, templates] = await Promise.all([getT("admin"), getGlobalT(), getFormatter(), getNoticeTemplates()]);
  const open = c.status !== "closed" && c.status !== "decided";
  const latest = c.notices[c.notices.length - 1] ?? null;
  const canTriage = c.status === "new" || c.status === "info_requested";
  const canNotice = open;
  const [noticeCtxRaw, incidentRaw] = await Promise.all([
    canNotice || c.can_apply_immediate_hold || (latest && !c.decision) ? getConductNoticeContext(db, c.id, c.occurred_on ?? undefined).catch(() => null) : Promise.resolve(null),
    c.incident_allowed ? getIncidentOptions(db, c.id).catch(() => null) : Promise.resolve(null),
  ]);
  const noticeCtx = noticeCtxRaw as unknown as NoticeContext | null;
  const stateKey = conductStateKey(c.state);
  const orgLang = c.reported_org.locale?.split("-")[0]?.toLowerCase();
  const pendingReview = c.decision?.review && !c.decision.review.outcome ? c.decision.review : null;
  // Rule titles for the decision form: the notice's own version, in the notice language.
  const latestVersion = latest ? noticeCtx?.versions.find((v) => v.id === latest.rules_version_id) : null;
  const latestRules = latest ? latest.rules_cited.map((n) => ({ number: n, title: (latestVersion?.rules[latest.language] ?? latestVersion?.rules.en ?? []).find((r) => r.number === n)?.excerpt ?? "" })) : [];

  const actions = (
    <div className="grid gap-5">
      {canTriage || canNotice || c.can_apply_immediate_hold ? (
        <TriagePanel
          caseId={c.id}
          orgName={c.reported_org.name}
          category={c.category}
          adminCategory={c.admin_category}
          canTriage={canTriage}
          canAskReporter={c.source !== "admin" && Boolean(c.reporter_user?.active_member)}
          canNotice={canNotice}
          canHold={c.can_apply_immediate_hold}
          hasReporter={Boolean(c.reporter_org)}
          noticeContext={noticeCtx}
          templates={templates}
        />
      ) : null}
      {latest && !c.decision && !latest.window_closed && !latest.response ? <FollowupDialog noticeId={latest.id} orgName={c.reported_org.name} /> : null}
      {latest && !c.decision ? (
        <section className="grid gap-3 border-t border-border/60 pt-4">
          <h2 className="text-base font-semibold">{t("conduct.decision.title")}</h2>
          <DecisionForm
            caseId={c.id}
            orgName={c.reported_org.name}
            notice={{ id: latest.id, rules: latestRules, hasOutcomesLine: latest.has_outcomes_line, responseDueAt: latest.response_due_at }}
            locked={!latest.response && !latest.window_closed}
            noSanctionAllowed={c.no_sanction_allowed}
            immediateHoldActive={c.immediate_hold?.status === "active"}
            hasReporter={Boolean(c.reporter_org)}
            context={c.org_context.history}
          />
        </section>
      ) : null}
      {pendingReview && c.decision ? (
        <section className="grid gap-3 border-t border-border/60 pt-4">
          <h2 className="text-base font-semibold">{t("conduct.review.title")}</h2>
          <ReviewPanel
            reviewId={pendingReview.id}
            orgName={c.reported_org.name}
            level={c.decision.level}
            viewerCanReview={c.viewer_can_review}
            viewerIsHoldApplier={c.viewer_is_hold_applier}
            hasEligibleReviewer={c.has_eligible_reviewer}
          />
        </section>
      ) : null}
      {c.incident_allowed && Array.isArray(incidentRaw) ? (
        <IncidentDialog caseId={c.id} options={incidentRaw as unknown as IncidentOption[]} templates={templates} defaultLanguage={noticeLanguageFor(c.reported_org.locale)} />
      ) : null}
    </div>
  );

  return (
    <div className="grid gap-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3 min-h-11 justify-self-start sm:min-h-9">
        <Link href="/admin/disputes?filter=conduct"><ArrowLeft className="size-4" aria-hidden /> {t("conduct.case.back")}</Link>
      </Button>
      <PageHeader
        title={t("conduct.case.title", { org: c.reported_org.name })}
        description={t("conduct.filedOn", { when: f.etDateTime(c.created_at) })}
        actions={
          <>
            {c.possible_94 ? <Badge variant="destructive">{t("conduct.possible94")}</Badge> : null}
            <StatusPill tone={CONDUCT_STATE_TONE[stateKey] ?? "neutral"} label={t(`conduct.state.${stateKey}`)} />
          </>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-6">
          <Panel className="grid gap-3 text-sm">
            <SectionTitle>{t("conduct.case.parties")}</SectionTitle>
            <dl className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
              <dt className="text-muted-foreground">{t("conduct.case.reported")}</dt>
              <dd><Link href={`/admin/organizations/${c.reported_org.id}`} className="font-medium underline underline-offset-4">{c.reported_org.name}</Link></dd>
              <dt className="text-muted-foreground">{t("conduct.case.reporter")}</dt>
              <dd>
                {c.reporter_user && c.reporter_org
                  ? t("conduct.case.reporterValue", { name: `${c.reporter_user.name || c.reporter_user.email}${c.reporter_user.active_member ? "" : ` (${tg("network.reports.sentByFormer")})`}`, org: c.reporter_org.name })
                  : t("conduct.openedByWorkatent", { reported: c.reported_org.name })}
              </dd>
              {c.referral_id || c.job_id ? (
                <>
                  <dt className="text-muted-foreground">{t("conduct.case.context")}</dt>
                  <dd>
                    {c.referral_id ? <Link href={`/admin/referrals/${c.referral_id}`} className="font-medium underline underline-offset-4">{t("conduct.case.referralLink")}</Link> : <span>{t("conduct.case.jobLink")}</span>}
                  </dd>
                </>
              ) : null}
            </dl>
            {orgLang && isLocale(orgLang) ? <p className="rounded-2xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{t("conduct.languageHint", { org: c.reported_org.name, language: LOCALE_NAMES[orgLang] })}</p> : null}
          </Panel>

          <Panel className="grid gap-3 text-sm">
            <SectionTitle>{t("conduct.case.report")}</SectionTitle>
            <p className="text-muted-foreground">
              {c.admin_category && c.admin_category !== c.category ? t("conduct.categories", { admin: tg(`labels.conductCategory.${c.admin_category}`), reporter: tg(`labels.conductCategory.${c.category}`) }) : tg(`labels.conductCategory.${c.category}`)}
            </p>
            <p className="whitespace-pre-line text-pretty">{c.description}</p>
            <p>
              <span className="text-muted-foreground">{t("conduct.case.date")}: </span>
              {c.occurred_on ? (c.occurred_approx ? t("conduct.case.dateApprox", { date: f.date(c.occurred_on) }) : f.date(c.occurred_on)) : t("conduct.case.dateNone")}
            </p>
            {!c.first_response_at && c.first_response_due_at && open ? <AdminDeadline label={t("conduct.firstResponseBy")} at={c.first_response_due_at} /> : null}
            {c.files.length ? (
              <div className="grid gap-2">
                <p className="font-medium">{t("conduct.case.files")}</p>
                <ul className="grid gap-2">
                  {c.files.map((file) => (
                    <li key={file.id} className="flex items-center gap-3 rounded-2xl border border-border/60 p-2.5">
                      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{file.file_name}</span>
                        <span className="block truncate text-xs text-muted-foreground" translate="no">{t("conduct.case.fileMeta", { size: f.fileSize(file.size_bytes), hash: file.sha256 ? `${file.sha256.slice(0, 12)}…` : "—" })}</span>
                      </span>
                      <AdminConductEvidenceDownload fileId={file.id} name={file.file_name} ready={file.scan_status === "clean"} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Panel>

          {c.thread.length ? (
            <Panel className="grid gap-3 text-sm">
              <SectionTitle>{t("conduct.case.thread")}</SectionTitle>
              <ol className="grid gap-3 border-l border-border pl-4">
                {c.thread.map((m) => (
                  <li key={m.id} className="grid gap-1">
                    <span className="text-xs text-muted-foreground">{f.etDateTime(m.created_at)} · {m.author_name ?? "—"}</span>
                    <span className="whitespace-pre-line">{m.body}</span>
                  </li>
                ))}
              </ol>
            </Panel>
          ) : null}

          {c.notices.map((n) => (
            <Panel key={n.id} className="grid gap-3 text-sm" lang={n.language}>
              <SectionTitle action={<span className="text-xs text-muted-foreground">{f.etDateTime(n.sent_at)} · {n.sent_by_name ?? "—"}</span>}>
                {n.kind === "immediate_hold" ? templates[n.language].headingImmediate : templates[n.language].heading}
              </SectionTitle>
              <p className="text-muted-foreground">{n.rules_cited.join(", ")} · {n.rules_version_label}</p>
              <p className="whitespace-pre-line">{n.allegation}</p>
              <p className="text-muted-foreground">{n.alleged_when}</p>
              <p className="whitespace-pre-line">{n.evidence_summary}</p>
              {n.outcomes_line ? <p className="flex items-start gap-2 rounded-xl bg-muted p-3"><Lock className="mt-0.5 size-4 shrink-0" aria-hidden />{n.outcomes_line}</p> : null}
              {n.response ? (
                <div className="grid gap-1 border-t border-border/60 pt-3">
                  <p className="font-medium">{tg("network.case.responded", { when: f.etDateTime(n.response.submitted_at), name: n.response.author_name ?? "—" })}</p>
                  <p className="whitespace-pre-line">{n.response.body}</p>
                </div>
              ) : !c.decision ? (
                <AdminDeadline label={tg("network.standing.deadlineLabel")} at={n.response_due_at} />
              ) : null}
              {n.followups.map((q) => (
                <div key={q.id} className="grid gap-1 border-t border-border/60 pt-3">
                  <p className="font-medium">{tg("network.case.followup")}</p>
                  <p className="whitespace-pre-line">{q.question}</p>
                  {q.reply_body ? <p className="whitespace-pre-line text-muted-foreground">{q.reply_body}</p> : null}
                </div>
              ))}
            </Panel>
          ))}

          {c.decision ? (
            <Panel className="grid gap-3 text-sm">
              <SectionTitle>{t("conduct.decision.title")}</SectionTitle>
              <p className="font-semibold">{tg(`labels.conductOutcome.${OUTCOME_KEY[c.decision.outcome]}`)}{c.decision.outcome === "breach" ? ` · ${tg(`labels.sanctionLevel.${c.decision.level ?? "none"}`)}` : ""}</p>
              <p className="text-muted-foreground">{f.etDateTime(c.decision.decided_at)} · {t("conduct.review.decidedBy", { name: c.decision.decided_by_name ?? "—" })}</p>
              {c.decision.finding ? <p className="whitespace-pre-line">{c.decision.finding}</p> : null}
              {c.decision.rules_cited.length ? <p className="text-muted-foreground">{c.decision.rules_cited.join(", ")}</p> : null}
              {c.decision.why_not_hold ? <p className="whitespace-pre-line">{c.decision.why_not_hold}</p> : null}
              {c.decision.review ? (
                <div className="grid gap-1 border-t border-border/60 pt-3">
                  <p className="font-medium">{t("conduct.review.request", { org: c.reported_org.name })}</p>
                  <p className="text-xs text-muted-foreground">{f.etDateTime(c.decision.review.requested_at)} · {c.decision.review.requested_by_name ?? "—"}</p>
                  <p className="whitespace-pre-line">{c.decision.review.request_text}</p>
                  {c.decision.review.outcome ? <p className="mt-2 font-medium">{c.decision.review.outcome} · {c.decision.review.reviewer_name ?? "—"}</p> : null}
                  {c.decision.review.reason ? <p className="whitespace-pre-line text-muted-foreground">{c.decision.review.reason}</p> : null}
                </div>
              ) : null}
            </Panel>
          ) : null}

          <Panel className="grid gap-2 text-sm">
            <SectionTitle>{t("conduct.case.history", { org: c.reported_org.name })}</SectionTitle>
            {c.org_context.history.length || c.org_context.open_cases ? (
              <ul className="grid gap-1">
                {c.org_context.history.map((h) => (
                  <li key={`${h.kind}-${h.id}`}>{f.etDate(h.at)} · {tg(`labels.sanctionLevel.${h.level ?? "none"}`)} · {h.status}</li>
                ))}
                {c.org_context.open_cases ? <li>{t("orgDetail.openCases")}: {c.org_context.open_cases}</li> : null}
              </ul>
            ) : (
              <p className="text-muted-foreground">{t("conduct.case.historyEmpty")}</p>
            )}
          </Panel>
        </div>
        <aside className="lg:sticky lg:top-24">
          <Panel className="grid gap-4">
            <h2 className="text-base font-semibold">{t("conduct.case.actions")}</h2>
            {actions}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
