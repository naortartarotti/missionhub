"use client";

import { ActionForm } from "@/components/shared/action-form";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";
import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { FormMessage } from "@/components/shared/form-message";
import { SubmitButton } from "@/components/shared/submit-button";
import { NativeSelect } from "@/components/shared/native-select";
import type { REFERRAL_STATUS } from "@/lib/labels";
import { useT } from "@/i18n/client";
import { confirmAgreement, getReferralDocumentUrl, reportHire, sendReferralMessage, transitionReferral } from "../actions";

/** Statuses with a button label in `referrals.actions.<status>`. */
const ACTION_STATUSES = ["under_review", "accepted", "declined", "info_requested", "withdrawn", "interviewing", "offer", "rejected", "cancelled"] as const;
type ActionStatus = (typeof ACTION_STATUSES)[number];
const hasActionLabel = (s: string): s is ActionStatus => (ACTION_STATUSES as readonly string[]).includes(s);

const NEGATIVE = new Set(["declined", "withdrawn", "rejected", "cancelled"]);

export function TransitionButtons({
  orgSlug,
  referralId,
  version,
  transitions,
  side,
  status,
}: {
  orgSlug: string;
  referralId: string;
  version: number;
  transitions: { to_status: keyof typeof REFERRAL_STATUS; requires_reason: boolean; requires_active_agreement: boolean }[];
  side: "source" | "target";
  status: string;
}) {
  const t = useT("referrals");
  const [pending, start] = useTransition();
  const run = (to: string, reason = "") =>
    transitionReferral(orgSlug, { referralId, to, reason, version }).then((r) => {
      if (!r.ok) toast.error(r.error);
      return r;
    });
  return (
    <div className="flex flex-wrap gap-2">
      {transitions.map((tr) => {
        const label =
          side === "source" && tr.to_status === "under_review" && status === "info_requested"
            ? t("actions.markInfoProvided")
            : hasActionLabel(tr.to_status) ? t(`actions.${tr.to_status}`) : tr.to_status;
        if (tr.requires_reason) {
          return (
            <ConfirmDialog
              key={tr.to_status}
              trigger={<Button variant={NEGATIVE.has(tr.to_status) ? "outline" : "secondary"}>{label}</Button>}
              title={t("actions.confirmTitle", { label })}
              description={tr.to_status === "declined" ? t("actions.declineHint") : t("actions.noteHint")}
              confirmLabel={label}
              destructive={NEGATIVE.has(tr.to_status)}
              reasonLabel={tr.to_status === "info_requested" ? t("actions.infoQuestion") : t("actions.reason")}
              reasonRequired
              onConfirm={(reason) => run(tr.to_status, reason)}
            />
          );
        }
        return (
          <Button key={tr.to_status} disabled={pending} onClick={() => start(async () => { const r = await run(tr.to_status); if (r.ok) toast.success(r.message ?? t("actions.updated")); })}>
            {label}
          </Button>
        );
      })}
    </div>
  );
}

export function ConfirmAgreementButton({ orgSlug, referralId }: { orgSlug: string; referralId: string }) {
  const t = useT("referrals");
  return (
    <ConfirmDialog
      trigger={<Button>{t("agreement.trigger")}</Button>}
      title={t("agreement.title")}
      description={t("agreement.description")}
      confirmLabel={t("agreement.confirm")}
      onConfirm={() => confirmAgreement(orgSlug, referralId)}
    />
  );
}

export function ReportHireDialog({ orgSlug, referralId, version, defaultFee, currency }: { orgSlug: string; referralId: string; version: number; defaultFee: string; currency: string }) {
  const t = useT("referrals");
  const [state, action] = useActionState(reportHire.bind(null, orgSlug), null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <Dialog>
      <DialogTrigger asChild><Button>{t("hire.trigger")}</Button></DialogTrigger>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("hire.title")}</DialogTitle>
          <DialogDescription>{t("hire.description")}</DialogDescription>
        </DialogHeader>
        <ActionForm action={action} className="grid gap-4">
          <input type="hidden" name="referralId" value={referralId} />
          <input type="hidden" name="version" value={version} />
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <FormField id="fee" label={t("hire.fee")} error={fe?.fee}><Input id="fee" name="fee" inputMode="decimal" defaultValue={defaultFee} required /></FormField>
            <FormField id="currency" label={t("hire.currency")}>
              <NativeSelect id="currency" name="currency" defaultValue={currency}>{["CAD", "USD", "EUR", "GBP", "BRL"].map((c) => <option key={c}>{c}</option>)}</NativeSelect>
            </FormField>
          </div>
          <FormField id="startDate" label={t("hire.startDate")} error={fe?.startDate}><Input id="startDate" name="startDate" type="date" required /></FormField>
          <FormField id="guaranteeDays" label={t("hire.guarantee")}><Input id="guaranteeDays" name="guaranteeDays" type="number" min={0} max={365} defaultValue={90} /></FormField>
          <FormMessage state={state} />
          <SubmitButton pendingLabel={t("hire.recording")}>{t("hire.submit")}</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
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
