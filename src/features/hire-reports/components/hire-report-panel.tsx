"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Ban, Check, Clock, Copy, Download, PauseCircle, Scale, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shared/card";
import { StatusPill, type Tone } from "@/components/shared/status-pill";
import { BusinessDeadline } from "@/features/referrals/components/business-deadline";
import { ReportHireDialog, type HireDialogState } from "@/features/referrals/components/report-hire-dialog";
import type { ReferralTerms } from "@/features/referrals/components/referral-terms";
import { useFormatter, useGlobalT, useT } from "@/i18n/client";
import type { Paths } from "@/i18n/translate";
import type { Messages } from "@/i18n/messages";
import { getHireEvidenceUrl } from "../actions";
import type { HireFileView, HireItemView, HireReportStatus, HireReportView } from "../queries";
import { ContestDialog, RebuttalDialog } from "./answer-dialogs";
import { RequestAuthCheckDialog } from "./auth-check";

const STATUS: Record<HireReportStatus, { tone: Tone; icon: LucideIcon }> = {
  awaiting_answer: { tone: "warning", icon: Clock },
  unanswered: { tone: "info", icon: Scale },
  contested: { tone: "info", icon: Scale },
  in_review: { tone: "info", icon: Scale },
  confirmed: { tone: "success", icon: Check },
  closed_by_record: { tone: "success", icon: Check },
  deemed_confirmed: { tone: "success", icon: Check },
  upheld: { tone: "success", icon: Check },
  rejected: { tone: "neutral", icon: X },
  void: { tone: "neutral", icon: Ban },
};
const PENDING: HireReportStatus[] = ["awaiting_answer", "unanswered", "contested", "in_review"];
const BTN = "h-auto min-h-11 w-full whitespace-normal sm:min-h-10 sm:w-auto";

/** What B's Confirm needs to open the record dialog in the server's variant (E3, BR-24). */
export type ConfirmContext = { hire: HireDialogState; terms: ReferralTerms | null; defaultCurrency: string };

/**
 * S6 HireReportPanel (BR-19, BR-21 to BR-30, spec §2.6): the latest report expanded, earlier ones collapsed.
 * Everything comes side-shaped from `get_hire_reports`: B never receives links, file names or A's files;
 * A never receives B's files, or the statement / resolution for "not this client".
 */
export function HireReportPanel({
  reports,
  side,
  orgSlug,
  referralId,
  partner,
  ownOrg,
  windowEnd,
  confirm,
}: {
  reports: HireReportView[];
  side: "source" | "target";
  orgSlug: string;
  referralId: string;
  partner: string;
  ownOrg: string;
  windowEnd: string | null;
  confirm: ConfirmContext | null;
}) {
  const t = useT("referrals");
  const tg = useGlobalT();
  const f = useFormatter();
  const uid = useId();
  const [latest, ...earlier] = reports;
  if (!latest) return null;
  const r = latest;
  const st = STATUS[r.status];
  const at = r.resolved_at ?? r.filed_at;
  const target = side === "target";
  const pending = PENDING.includes(r.status);

  const statusLine = (() => {
    switch (r.status) {
      case "awaiting_answer":
        return target ? t("hireReport.panel.status.awaitingTarget", { when: f.etDateTime(r.answer_due_at) }) : t("hireReport.panel.status.awaitingSource", { partner, when: f.etDateTime(r.answer_due_at) });
      case "unanswered":
        return target ? t("hireReport.panel.status.unansweredTarget") : t("hireReport.panel.status.unansweredSource", { partner });
      case "contested":
        return target ? t("hireReport.panel.status.contestedTarget", { partner, when: f.etDateTime(r.rebuttal_due_at) }) : t("hireReport.panel.status.contestedSource", { partner, when: f.etDateTime(r.rebuttal_due_at) });
      case "in_review":
        return t("hireReport.panel.status.inReview");
      case "confirmed":
        return target ? t("hireReport.panel.status.confirmedTarget", { date: f.date(at) }) : t("hireReport.panel.status.confirmedSource", { partner, date: f.date(at) });
      case "closed_by_record":
        return target ? t("hireReport.panel.status.closedByRecordTarget", { date: f.date(at) }) : t("hireReport.panel.status.closedByRecordSource", { date: f.date(at) });
      case "deemed_confirmed":
        // ⚖️ N7: gated (needs delivery records). The fee-details deadline lives on the placement page.
        return target ? t("hireReport.panel.status.deemedTarget", { date: f.date(at), org: ownOrg, when: f.etDateTime(null) }) : t("hireReport.panel.status.deemedSource", { date: f.date(at), partner });
      case "upheld":
        return t("hireReport.panel.status.upheld", { date: f.date(at) });
      case "rejected":
        return !target && r.not_this_client ? t("hireReport.panel.status.notThisClient") : t("hireReport.panel.status.rejected", { date: f.date(at) });
      case "void":
        return target ? t("hireReport.panel.status.voidTarget", { date: f.date(at) }) : t("hireReport.panel.status.voidSource", { date: f.date(at) });
    }
  })();

  const actions: ReactNode[] = [];
  if (target && r.can_contest) actions.push(<ContestDialog key="contest" orgSlug={orgSlug} referralId={referralId} reportId={r.id} partner={partner} />);
  if (target && r.can_request_auth_check && !r.auth_check_requested_at) actions.push(<RequestAuthCheckDialog key="auth" orgSlug={orgSlug} referralId={referralId} partner={partner} />);
  if (target && r.can_confirm && confirm) {
    actions.push(
      <ReportHireDialog
        key="confirm"
        orgSlug={orgSlug}
        referralId={referralId}
        hire={confirm.hire}
        terms={confirm.terms}
        partner={partner}
        defaultCurrency={confirm.defaultCurrency}
        report={{ id: r.id, role: r.role_text, startMonth: r.start_month }}
        trigger={<Button className={BTN}>{r.status === "unanswered" ? t("hire.trigger") : t("hireReport.panel.confirm")}</Button>}
      />,
    );
  }
  if (!target && r.can_rebut) actions.push(<RebuttalDialog key="rebut" orgSlug={orgSlug} referralId={referralId} reportId={r.id} partner={partner} dueAt={r.rebuttal_due_at} left={r.rebuttal_business_days_left} />);
  if (r.placement_id && (r.status === "upheld" || (target && r.status === "deemed_confirmed"))) {
    actions.push(
      <Button key="placement" variant="outline" className={BTN} asChild>
        <Link href={`/workspace/${orgSlug}/commissions/${r.placement_id}`}>{r.status === "deemed_confirmed" ? tg("commissions.feePending.enter") : t("detail.agreement.openPlacement")}</Link>
      </Button>,
    );
  }

  return (
    <Panel className="p-6">
      <section aria-labelledby={`${uid}-title`} className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 id={`${uid}-title`} className="text-base font-semibold">{t("hireReport.panel.title")}</h2>
          <StatusPill tone={st.tone} icon={st.icon} label={tg(`labels.hireReportStatus.${r.status}`)} wrap />
        </div>
        {/* The status line is read right after the heading (§6). */}
        <div className="-mt-2 grid gap-2 text-sm">
          <p className="text-pretty">{statusLine}</p>
          {r.resolution && (r.status === "upheld" || r.status === "rejected") ? <p className="text-pretty text-muted-foreground">{t("hireReport.panel.resolution", { text: r.resolution })}</p> : null}
          {r.status === "awaiting_answer" ? <BusinessDeadline at={r.answer_due_at} left={r.answer_business_days_left} /> : null}
          {r.status === "contested" && r.rebuttal_due_at ? <BusinessDeadline at={r.rebuttal_due_at} left={r.rebuttal_business_days_left} /> : null}
          {!target && pending ? (
            <p className="flex items-start gap-2 rounded-2xl bg-muted/50 px-3 py-2.5 text-muted-foreground">
              <PauseCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="text-pretty">{t("hireReport.panel.releasePaused")}</span>
            </p>
          ) : null}
          {target && r.auth_check_requested_at ? <p className="text-muted-foreground">{t("authCheck.requestedLine", { date: f.date(r.auth_check_requested_at) })}</p> : null}
        </div>

        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[12rem_1fr]">
          <Row label={t("claim.panel.filed")}>{t("hireReport.panel.filedBy", { when: f.etDateTime(r.filed_at), who: target ? partner : (r.filed_by_name ?? t("detail.you")) })}</Row>
          <Row label={t("hireReport.panel.rows.employer")}><span className="break-words">{r.employer_text}</span></Row>
          <Row label={t("hireReport.startMonth")}>{f.monthYear(r.start_month)}</Row>
          <Row label={t("hireReport.panel.rows.role")}>{r.role_text || <span className="text-muted-foreground">{t("hireReport.panel.notGiven")}</span>}</Row>
          <Row label={t("hireReport.panel.rows.learnedVia")}>{tg(`labels.hireLearnedVia.${r.learned_via}` as Paths<Messages>)}</Row>
          {r.tail_statement ? <Row label={t("hireReport.panel.rows.tail")}><span className="text-pretty">{t("hireReport.panel.tailMade", { windowEnd: f.date(windowEnd) })}</span></Row> : null}
          <Row label={t("claim.panel.evidence")}>
            <Items items={r.items} showLinks={!target} />
            {target ? <p className="mt-1 text-xs text-muted-foreground">{t("hireReport.panel.linksHidden", { partner })}</p> : null}
          </Row>
          {r.files.length ? (
            <Row label={t("hireReport.panel.rows.files")}>
              <Files files={r.files} orgSlug={orgSlug} />
              {target ? <p className="mt-1 text-xs text-muted-foreground">{t("hireReport.panel.filesHidden", { partner })}</p> : null}
            </Row>
          ) : null}
          <Row label={t("hireReport.statement")}><blockquote className="border-l-2 border-border pl-3 whitespace-pre-line text-pretty break-words">{r.statement}</blockquote></Row>
          {r.contest ? (
            <Row label={t("hireReport.panel.rows.contest")}>
              <div className="grid gap-1.5">
                <p className="font-medium text-pretty">{tg(`labels.hireContestReason.${r.contest.reason}`)}</p>
                {/* Design P-6: label/value pairs instead of a hard-coded colon (fr spacing, word order). */}
                {r.contest.offer_accepted_on || r.contest.process_started_on ? (
                  <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[auto_1fr]">
                    {r.contest.offer_accepted_on ? <><dt className="text-muted-foreground">{t("hireContest.acceptedOn")}</dt><dd>{f.date(r.contest.offer_accepted_on)}</dd></> : null}
                    {r.contest.process_started_on ? <><dt className="text-muted-foreground">{t("hireContest.processStarted")}</dt><dd>{f.date(r.contest.process_started_on)}</dd></> : null}
                  </dl>
                ) : null}
                {r.contest.statement ? <blockquote className="border-l-2 border-border pl-3 whitespace-pre-line text-pretty break-words">{r.contest.statement}</blockquote> : null}
                {r.contest.files.length ? <Files files={r.contest.files} orgSlug={orgSlug} /> : null}
              </div>
            </Row>
          ) : null}
          {r.rebuttal ? (
            <Row label={t("hireReport.panel.rows.rebuttal")}>
              <div className="grid gap-1.5">
                <blockquote className="border-l-2 border-border pl-3 whitespace-pre-line text-pretty break-words">{r.rebuttal.statement}</blockquote>
                {r.rebuttal.items.length ? <Items items={r.rebuttal.items} showLinks={!target} /> : null}
                {r.rebuttal.files.length ? <Files files={r.rebuttal.files} orgSlug={orgSlug} /> : null}
              </div>
            </Row>
          ) : null}
        </dl>

        {actions.length ? <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">{actions}</div> : null}

        {earlier.length ? (
          <details className="rounded-2xl border border-border/60 px-4 py-3 text-sm">
            <summary className="flex min-h-11 cursor-pointer items-center font-medium">{t("hireReport.panel.earlier", { count: earlier.length })}</summary>
            <ul className="mt-2 grid gap-1 text-muted-foreground">
              {earlier.map((e) => (
                <li key={e.id} className="text-pretty">
                  {t("hireReport.panel.earlierLine", {
                    date: f.date(e.filed_at),
                    outcome: !target && e.not_this_client ? t("hireReport.panel.status.notThisClient") : tg(`labels.hireReportStatus.${e.status}`),
                  })}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
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

function Items({ items, showLinks }: { items: HireItemView[]; showLinks: boolean }) {
  const t = useT("referrals");
  const tg = useGlobalT();
  const f = useFormatter();
  return (
    <ul className="grid gap-1.5">
      {items.map((it, i) => (
        <li key={i} className="grid gap-0.5">
          <span className="text-pretty">
            {tg(`labels.hireEvidenceType.${it.type}` as Paths<Messages>)} · {f.date(it.item_date)}
            {it.captured_on ? ` · ${t("hireReport.panel.itemCaptured", { date: f.date(it.captured_on) })}` : ""}
          </span>
          {showLinks && it.url && /^https:\/\//.test(it.url) ? (
            <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-xs break-all underline underline-offset-4">
              {it.url}
              <span className="sr-only"> {t("hireReport.panel.newTab")}</span>
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Own files: name, size, upload time, SHA-256, Download (60-second URL). Counterpart: "File {n}", upload time, SHA-256. */
function Files({ files, orgSlug }: { files: HireFileView[]; orgSlug: string }) {
  const t = useT("referrals");
  const f = useFormatter();
  const [busy, setBusy] = useState<string | null>(null);
  const copy = async (sha: string) => {
    await navigator.clipboard?.writeText(sha);
    toast.success(t("claim.panel.copied"));
  };
  const download = async (id: string) => {
    setBusy(id);
    const r = await getHireEvidenceUrl(orgSlug, id);
    setBusy(null);
    if (r.ok && r.data) window.location.assign(r.data.url);
    else if (!r.ok) toast.error(r.error);
  };
  return (
    <ul className="grid gap-2">
      {files.map((file) => {
        const own = !!file.id;
        const clean = file.scan_status === "clean";
        return (
          <li key={file.n} className="grid gap-1 rounded-2xl border border-border/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 font-medium break-words">
                {own ? file.file_name : t("claim.panel.fileN", { n: file.n })}
                {own && file.size_bytes ? <span className="font-normal text-muted-foreground"> · {f.fileSize(file.size_bytes)}</span> : null}
              </p>
              {own ? (
                <Button type="button" variant="outline" size="sm" className="min-h-11 min-w-11" disabled={!clean || busy === file.id} onClick={() => download(file.id!)} aria-label={t("claim.panel.download", { name: file.file_name ?? "" })}>
                  <Download className="size-4" aria-hidden />
                  {clean ? null : <span className="text-xs">{t("claim.panel.scanning")}</span>}
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">{t("claim.panel.uploaded", { when: f.etDateTime(file.uploaded_at) })}</p>
            {file.sha256 ? (
              <div className="flex items-start gap-1">
                <p className="grid min-w-0 flex-1 gap-0.5 text-xs">
                  <span className="text-muted-foreground">{t("claim.panel.sha")}</span>
                  <span className="font-mono break-all text-foreground">{file.sha256}</span>
                </p>
                <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label={t("claim.panel.copyShaAria", { n: file.n })} onClick={() => copy(file.sha256!)}>
                  <Copy className="size-4" aria-hidden />
                </Button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
