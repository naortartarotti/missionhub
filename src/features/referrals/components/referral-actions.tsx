"use client";

import { ActionForm } from "@/components/shared/action-form";

import { Fragment, useActionState, useEffect, useRef, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Download, FileText, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormMessage } from "@/components/shared/form-message";
import { SubmitButton } from "@/components/shared/submit-button";
import type { REFERRAL_STATUS } from "@/lib/labels";
import { useFormatter, useT } from "@/i18n/client";
import { WithdrawDialog } from "./release-dialogs";
import { getReferralDocumentUrl, resendCandidateRequest, sendReferralMessage, transitionReferral } from "../actions";

/** Statuses with a button label in `referrals.actions.<status>`. */
const ACTION_STATUSES = ["under_review", "accepted", "declined", "info_requested", "withdrawn", "interviewing", "offer", "rejected", "cancelled"] as const;
type ActionStatus = (typeof ACTION_STATUSES)[number];
const hasActionLabel = (s: string): s is ActionStatus => (ACTION_STATUSES as readonly string[]).includes(s);

const NEGATIVE = new Set(["declined", "withdrawn", "rejected", "cancelled"]);
/** Intermediate steps that never get the primary style, so each bar has at most one main action. */
const SECONDARY = new Set(["under_review", "info_requested"]);
/** Left to right: negative, secondary, then the main action (same order as the review panel). */
const rank = (to: string) => (NEGATIVE.has(to) ? 0 : SECONDARY.has(to) ? 1 : 2);

export function TransitionButtons({
  orgSlug,
  referralId,
  version,
  transitions,
  side,
  status,
  withdraw,
  afterNegative,
}: {
  orgSlug: string;
  referralId: string;
  version: number;
  transitions: { to_status: keyof typeof REFERRAL_STATUS; requires_reason: boolean; requires_active_agreement: boolean }[];
  side: "source" | "target";
  status: string;
  /**
   * Sourcing side, N1 (BR-25): `canRelease` = the three release guards hold, so Withdraw opens the
   * dialog with the release option; `counts` = the referral still holds first position.
   */
  withdraw?: { canRelease: boolean; counts: boolean; partner: string; ownershipUntil: string };
  /** Extra negative action ranked right after the negative transitions (e.g. File objection). */
  afterNegative?: ReactNode;
}) {
  const t = useT("referrals");
  const f = useFormatter();
  const [pending, start] = useTransition();
  const run = (to: string, reason = "") =>
    transitionReferral(orgSlug, { referralId, to, reason, version }).then((r) => {
      if (!r.ok) toast.error(r.error);
      // "Keeps first position until {date}" only when it's true (spec §5.2 note); otherwise the usual toast.
      if (r.ok && to === "withdrawn" && withdraw?.counts) return { ...r, message: t("success.withdrawn", { date: f.date(withdraw.ownershipUntil) }) };
      return r;
    });
  const sorted = [...transitions].sort((a, b) => rank(a.to_status) - rank(b.to_status));
  const lastNegative = sorted.findLastIndex((tr) => NEGATIVE.has(tr.to_status));
  // Below `sm` each button is full width and the bar stacks negative → secondary → primary (S2-i).
  const mobile = "min-h-11 w-full sm:min-h-0 sm:w-auto";
  return (
    <div className="flex w-full flex-wrap gap-2 sm:w-auto">
      {lastNegative < 0 ? afterNegative : null}
      {sorted.map((tr, i) => {
        const label =
          side === "source" && tr.to_status === "under_review" && status === "info_requested"
            ? t("actions.markInfoProvided")
            : hasActionLabel(tr.to_status) ? t(`actions.${tr.to_status}`) : tr.to_status;
        const slot = i === lastNegative ? afterNegative : null;
        if (tr.to_status === "withdrawn" && side === "source" && withdraw?.canRelease) {
          return (
            <Fragment key={tr.to_status}>
              <WithdrawDialog orgSlug={orgSlug} referralId={referralId} version={version} partner={withdraw.partner} ownershipUntil={withdraw.ownershipUntil} label={label} />
              {slot}
            </Fragment>
          );
        }
        if (tr.requires_reason) {
          return (
            <Fragment key={tr.to_status}>
            <ConfirmDialog
              trigger={<Button variant={NEGATIVE.has(tr.to_status) ? "outline" : "secondary"} className={mobile}>{label}</Button>}
              title={t("actions.confirmTitle", { label })}
              description={tr.to_status === "declined" ? t("actions.declineHint") : t("actions.noteHint")}
              confirmLabel={label}
              destructive={NEGATIVE.has(tr.to_status)}
              reasonLabel={tr.to_status === "info_requested" ? t("actions.infoQuestion") : t("actions.reason")}
              reasonRequired
              onConfirm={(reason) => run(tr.to_status, reason)}
            />
            {slot}
            </Fragment>
          );
        }
        return (
          <Fragment key={tr.to_status}>
          <Button className={mobile} variant={SECONDARY.has(tr.to_status) && !(side === "source" && status === "info_requested") ? "secondary" : "default"} disabled={pending} onClick={() => start(async () => { const r = await run(tr.to_status); if (r.ok) toast.success(r.message ?? t("actions.updated")); })}>
            {label}
          </Button>
          {slot}
          </Fragment>
        );
      })}
    </div>
  );
}

/** Emails the candidate a fresh confirmation link (the previous one stops working). */
export function ResendCandidateButton({ orgSlug, referralId, primary }: { orgSlug: string; referralId: string; primary?: boolean }) {
  const t = useT("referrals");
  const [pending, start] = useTransition();
  return (
    <Button
      variant={primary ? "default" : "secondary"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await resendCandidateRequest(orgSlug, referralId);
          if (r.ok) toast.success(r.message);
          else toast.error(r.error);
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Mail className="size-4" aria-hidden />}
      {pending ? t("detail.resending") : t("detail.resend")}
    </Button>
  );
}

export function MessageForm({ orgSlug, referralId }: { orgSlug: string; referralId: string }) {
  const t = useT("referrals");
  const [state, action] = useActionState(sendReferralMessage.bind(null, orgSlug, referralId), null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);
  return (
    <ActionForm ref={formRef} action={action} className="grid gap-2">
      <label htmlFor="body" className="sr-only">{t("message.label")}</label>
      <Textarea id="body" name="body" rows={3} placeholder={t("message.placeholder")} required />
      {state && !state.ok ? <FormMessage state={state} /> : null}
      <SubmitButton variant="secondary" className="justify-self-end" pendingLabel={t("message.sending")}>{t("message.send")}</SubmitButton>
    </ActionForm>
  );
}

export function GrantDownload({ orgSlug, grant }: { orgSlug: string; grant: { id: string; file_name: string; status: string; revoked_at: string | null } }) {
  const t = useT("referrals");
  const [pending, start] = useTransition();
  const unavailable = grant.revoked_at ? t("grant.revoked") : grant.status === "pending_copy" ? t("grant.preparing") : grant.status === "failed" ? t("grant.unavailable") : null;
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border p-3">
      <span className="grid size-9 place-items-center rounded-xl bg-muted" aria-hidden><FileText className="size-4" /></span>
      <span className="flex-1 truncate text-sm font-medium">{grant.file_name}</span>
      {unavailable ? (
        <span className="text-xs text-muted-foreground">{unavailable}</span>
      ) : (
        <Button variant="ghost" size="icon-sm" aria-label={t("grant.download", { name: grant.file_name })} disabled={pending}
          onClick={() => start(async () => { const r = await getReferralDocumentUrl(orgSlug, grant.id); if (r.ok && r.data) window.location.assign(r.data.url); else if (!r.ok) toast.error(r.error); })}>
          <Download className="size-4" />
        </Button>
      )}
    </li>
  );
}
