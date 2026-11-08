"use client";

import { useActionState, useTransition } from "react";
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
import { REFERRAL_STATUS } from "@/lib/labels";
import { confirmAgreement, getReferralDocumentUrl, reportHire, sendReferralMessage, transitionReferral } from "../actions";

const ACTION_LABEL: Partial<Record<keyof typeof REFERRAL_STATUS, string>> = {
  under_review: "Start review",
  accepted: "Accept",
  declined: "Decline",
  info_requested: "Request more info",
  withdrawn: "Withdraw",
  interviewing: "Move to interviewing",
  offer: "Record offer",
  rejected: "Not selected",
  cancelled: "Cancel",
};

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
  const [pending, start] = useTransition();
  const run = (to: string, reason = "") =>
    transitionReferral(orgSlug, { referralId, to, reason, version }).then((r) => {
      if (!r.ok) toast.error(r.error);
      return r;
    });
  return (
    <div className="flex flex-wrap gap-2">
      {transitions.map((t) => {
        const label = side === "source" && t.to_status === "under_review" && status === "info_requested" ? "Mark information provided" : ACTION_LABEL[t.to_status] ?? t.to_status;
        if (t.requires_reason) {
          return (
            <ConfirmDialog
              key={t.to_status}
              trigger={<Button variant={NEGATIVE.has(t.to_status) ? "outline" : "secondary"}>{label}</Button>}
              title={`${label}?`}
              description={
                t.to_status === "declined"
                  ? "Share job-related, non-discriminatory feedback. It will be visible to the partner recruiter."
                  : "Your note is recorded in the referral timeline and visible to the partner."
              }
              confirmLabel={label}
              destructive={NEGATIVE.has(t.to_status)}
              reasonLabel={t.to_status === "info_requested" ? "What information do you need?" : "Reason"}
              reasonRequired
              onConfirm={(reason) => run(t.to_status, reason)}
            />
          );
        }
        return (
          <Button key={t.to_status} disabled={pending} onClick={() => start(async () => { const r = await run(t.to_status); if (r.ok) toast.success(r.message ?? "Updated"); })}>
            {label}
          </Button>
        );
      })}
    </div>
  );
}

export function ConfirmAgreementButton({ orgSlug, referralId }: { orgSlug: string; referralId: string }) {
  return (
    <ConfirmDialog
      trigger={<Button>Review & confirm terms</Button>}
      title="Confirm collaboration agreement"
      description="You agree to the commission split shown, frozen for this referral. Template terms are a draft pending legal review; confirm your own contractual obligations separately."
      confirmLabel="Confirm agreement"
      onConfirm={() => confirmAgreement(orgSlug, referralId)}
    />
  );
}

export function ReportHireDialog({ orgSlug, referralId, version, defaultFee, currency }: { orgSlug: string; referralId: string; version: number; defaultFee: string; currency: string }) {
  const [state, action] = useActionState(reportHire.bind(null, orgSlug), null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <Dialog>
      <DialogTrigger asChild><Button>Report hire</Button></DialogTrigger>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report a successful hire</DialogTitle>
          <DialogDescription>Creates the placement using the frozen agreement. Commission stays projected until the client payment is verified.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="referralId" value={referralId} />
          <input type="hidden" name="version" value={version} />
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <FormField id="fee" label="Contracted placement fee" error={fe?.fee}><Input id="fee" name="fee" inputMode="decimal" defaultValue={defaultFee} required /></FormField>
            <FormField id="currency" label="Currency">
              <NativeSelect id="currency" name="currency" defaultValue={currency}>{["CAD", "USD", "EUR", "GBP", "BRL"].map((c) => <option key={c}>{c}</option>)}</NativeSelect>
            </FormField>
          </div>
          <FormField id="startDate" label="Start date" error={fe?.startDate}><Input id="startDate" name="startDate" type="date" required /></FormField>
          <FormField id="guaranteeDays" label="Replacement guarantee (days)"><Input id="guaranteeDays" name="guaranteeDays" type="number" min={0} max={365} defaultValue={90} /></FormField>
          <FormMessage state={state} />
          <SubmitButton pendingLabel="Recording…">Record hire</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MessageForm({ orgSlug, referralId }: { orgSlug: string; referralId: string }) {
  const [state, action] = useActionState(sendReferralMessage.bind(null, orgSlug, referralId), null);
  return (
    <form action={action} className="grid gap-2" key={state?.ok ? Date.now() : "form"}>
      <label htmlFor="body" className="sr-only">Message</label>
      <Textarea id="body" name="body" rows={3} placeholder="Professional, job-related messages only. Visible to both recruiters." required />
      {state && !state.ok ? <FormMessage state={state} /> : null}
      <SubmitButton variant="secondary" className="justify-self-end" pendingLabel="Sending…">Send message</SubmitButton>
    </form>
  );
}

export function GrantDownload({ orgSlug, grant }: { orgSlug: string; grant: { id: string; file_name: string; status: string; revoked_at: string | null } }) {
  const [pending, start] = useTransition();
  const unavailable = grant.revoked_at ? "Access revoked" : grant.status === "pending_copy" ? "Preparing…" : grant.status === "failed" ? "Unavailable" : null;
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border p-3">
      <span className="grid size-9 place-items-center rounded-xl bg-muted" aria-hidden><FileText className="size-4" /></span>
      <span className="flex-1 truncate text-sm font-medium">{grant.file_name}</span>
      {unavailable ? (
        <span className="text-xs text-muted-foreground">{unavailable}</span>
      ) : (
        <Button variant="ghost" size="icon-sm" aria-label={`Download ${grant.file_name}`} disabled={pending}
          onClick={() => start(async () => { const r = await getReferralDocumentUrl(orgSlug, grant.id); if (r.ok && r.data) window.location.assign(r.data.url); else if (!r.ok) toast.error(r.error); })}>
          <Download className="size-4" />
        </Button>
      )}
    </li>
  );
}
