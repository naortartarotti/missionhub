"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Check, Clock, Copy, Download, FileText, Loader2, Lock, RotateCcw, Scale, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shared/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusPill, type Tone } from "@/components/shared/status-pill";
import { useFormatter, useGlobalT, useT } from "@/i18n/client";
import { contestClaim, getClaimEvidenceUrl } from "../actions";
import type { ClaimStatus, SourcePresentation, TargetPresentation } from "../queries";
import { BusinessDeadline } from "./business-deadline";
import { RequestAuthCheckDialog } from "@/features/hire-reports/components/auth-check";

const STATUS: Record<ClaimStatus, { tone: Tone; icon: LucideIcon }> = {
  open: { tone: "warning", icon: Clock },
  contested: { tone: "info", icon: Scale },
  final: { tone: "neutral", icon: Lock },
  upheld: { tone: "neutral", icon: Check },
  rejected: { tone: "info", icon: RotateCcw },
};

type Props =
  | { side: "source"; claim: NonNullable<SourcePresentation["claim"]>; orgSlug: string; referralId: string; partner: string }
  | {
      side: "target";
      claim: NonNullable<TargetPresentation["claim"]>;
      orgSlug: string;
      referralId: string;
      partner: string;
      /** N3 BR-37 / AC-79: when B already asked for an authorization check in this dispute (`get_referral_hire_state`). */
      authCheckRequestedAt?: string | null;
    };

/**
 * S2-d: the prior-presentation objection on a referral, both sides. The sourcing side never gets
 * file names, types or downloads (BR-15), nor which earlier referral was cited (BR-26); the
 * contest reason is never shown here (admins only, PD-028).
 */
export function ClaimPanel(props: Props) {
  const { claim, partner, orgSlug, referralId } = props;
  const t = useT("referrals");
  const tg = useGlobalT();
  const f = useFormatter();
  const st = STATUS[claim.status];
  const when = (iso: string) => f.etDateTime(iso);
  const statusLine =
    claim.status === "open"
      ? props.side === "target"
        ? t("claim.panel.status.openTarget", { partner, when: when(claim.contest_deadline_at) })
        : t("claim.panel.status.openSource", { when: when(claim.contest_deadline_at) })
      : claim.status === "contested"
        ? t("claim.panel.status.contested", { date: f.date(claim.contested_at) })
        : claim.status === "final"
          ? t("claim.panel.status.final", { when: when(claim.contest_deadline_at) })
          : claim.status === "upheld"
            ? t("claim.panel.status.upheld", { date: f.date(claim.resolved_at) })
            : t("claim.panel.status.rejected", { date: f.date(claim.resolved_at) });

  return (
    <Panel className="grid gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="claim-panel-title" className="text-lg font-semibold tracking-tight">{t("claim.panel.title")}</h2>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">{statusLine}</p>
        </div>
        <StatusPill tone={st.tone} icon={st.icon} label={tg(`labels.claimStatus.${claim.status}`)} />
      </div>

      <dl className="grid gap-4 text-sm sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:gap-x-6">
        <Row label={t("claim.panel.filed")}>{t("deadline.at", { when: when(claim.filed_at) })}</Row>
        <Row label={t("claim.panel.priorDate")}>{f.date(claim.prior_process_date)}</Row>
        <Row label={t("claim.panel.evidence")}>
          {claim.evidence_kind === "referral" ? (
            <div className="grid justify-items-start gap-2">
              <span>{t("claim.panel.earlierReferral")}</span>
              {props.side === "target" && props.claim.evidence_referral_id ? (
                <Button variant="outline" size="sm" className="min-h-11 sm:min-h-8" asChild>
                  <Link href={`/workspace/${orgSlug}/referrals/${props.claim.evidence_referral_id}`}>{t("claim.panel.openEarlierReferral")}</Link>
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-3">
              <span>{tg("labels.evidenceType.file")}</span>
              <ul className="grid gap-2">
                {props.side === "target"
                  ? props.claim.files.map((file, i) => (
                      <FileRow key={file.id} n={i + 1} name={file.file_name} uploadedAt={file.uploaded_at} sha={file.sha256}>
                        <EvidenceDownload orgSlug={orgSlug} fileId={file.id} name={file.file_name} ready={file.scan_status === "clean"} />
                      </FileRow>
                    ))
                  : props.claim.files.map((file) => <FileRow key={file.n} n={file.n} name={t("claim.panel.fileN", { n: file.n })} uploadedAt={file.uploaded_at} sha={file.sha256} />)}
              </ul>
              {props.side === "source" ? <p className="text-xs text-muted-foreground">{t("claim.panel.filesHiddenSource", { partner })}</p> : null}
            </div>
          )}
        </Row>
        <Row label={t("claim.panel.note")}>
          {claim.note ? <blockquote className="rounded-xl bg-muted/60 px-3 py-2 whitespace-pre-line text-pretty">{claim.note}</blockquote> : <span className="text-muted-foreground">{t("claim.panel.noNote")}</span>}
        </Row>
        {claim.status === "open" ? (
          <Row label={t("claim.panel.contestDeadline")}>
            <div className="grid justify-items-start gap-3">
              <BusinessDeadline at={claim.contest_deadline_at} left={claim.contest_business_days_left} />
              {props.side === "source" && props.claim.can_contest ? <ContestButton orgSlug={orgSlug} referralId={referralId} partner={partner} /> : null}
            </div>
          </Row>
        ) : null}
        {(claim.status === "upheld" || claim.status === "rejected") && claim.resolution ? (
          <Row label={t("claim.panel.resolution")}>
            <blockquote className="rounded-xl bg-muted/60 px-3 py-2 whitespace-pre-line text-pretty">{claim.resolution}</blockquote>
          </Row>
        ) : null}
      </dl>
      {/* N3 §2.13 trigger 3 (AC-79): B may ask for an authorization check while its objection is contested; once. */}
      {props.side === "target" && claim.status === "contested" ? (
        props.authCheckRequestedAt ? (
          <p className="text-sm text-muted-foreground">{t("authCheck.requestedLine", { date: f.date(props.authCheckRequestedAt) })}</p>
        ) : (
          <div className="flex sm:justify-end">
            <RequestAuthCheckDialog orgSlug={orgSlug} referralId={referralId} partner={partner} />
          </div>
        )
      ) : null}
    </Panel>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** One evidence file: label, upload time and the full SHA-256 with a copy button. */
function FileRow({ n, name, uploadedAt, sha, children }: { n: number; name: string; uploadedAt: string; sha: string | null; children?: ReactNode }) {
  const t = useT("referrals");
  const f = useFormatter();
  const [copied, setCopied] = useState(false);
  return (
    <li className="grid gap-2 rounded-2xl border border-border/60 p-3">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted" aria-hidden><FileText className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">{t("claim.panel.uploaded", { when: f.etDateTime(uploadedAt) })}</p>
        </div>
        {children}
      </div>
      {sha ? (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{t("claim.panel.sha")}</p>
            <p className="font-mono text-xs break-all text-foreground">{sha}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 sm:size-10"
            aria-label={t("claim.panel.copyShaAria", { n })}
            onClick={async () => {
              await navigator.clipboard?.writeText(sha).catch(() => undefined);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          </Button>
          <span aria-live="polite" className="sr-only">{copied ? t("claim.panel.copied") : ""}</span>
          {copied ? <span className="self-center rounded-md bg-foreground px-2 py-1 text-xs text-background" aria-hidden>{t("claim.panel.copied")}</span> : null}
        </div>
      ) : null}
    </li>
  );
}

/** Hiring side only: 60-second signed URL, audited; disabled until the scan passes. */
function EvidenceDownload({ orgSlug, fileId, name, ready }: { orgSlug: string; fileId: string; name: string; ready: boolean }) {
  const t = useT("referrals");
  const [pending, start] = useTransition();
  if (!ready) return <span className="shrink-0 text-xs text-muted-foreground">{t("claim.panel.scanning")}</span>;
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-11 shrink-0 sm:size-10"
      aria-label={t("claim.panel.download", { name })}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await getClaimEvidenceUrl(orgSlug, fileId);
          if (r.ok && r.data) window.location.assign(r.data.url);
          else if (!r.ok) toast.error(r.error);
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Download className="size-4" aria-hidden />}
    </Button>
  );
}

/** Sourcing side, before the contest deadline: opens a prior-presentation dispute (free, BR-16). */
function ContestButton({ orgSlug, referralId, partner }: { orgSlug: string; referralId: string; partner: string }) {
  const t = useT("referrals");
  return (
    <ConfirmDialog
      trigger={<Button className="min-h-11 w-full sm:min-h-0 sm:w-auto">{t("contest.trigger")}</Button>}
      title={t("contest.title")}
      description={t("contest.description", { partner })}
      confirmLabel={t("contest.confirm")}
      reasonLabel={t("contest.reason")}
      reasonRequired
      reasonHint={t("contest.reasonHint", { partner })}
      reasonMinLength={5}
      reasonMaxLength={2000}
      reasonTooShort={t("validation.contestReason")}
      onConfirm={async (reason) => {
        const r = await contestClaim(orgSlug, { referralId, reason });
        return r.ok ? { ...r, message: t("contest.messages.contested") } : r;
      }}
    />
  );
}
