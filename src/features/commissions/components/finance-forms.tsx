"use client";

import { ActionForm } from "@/components/shared/action-form";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/actions/result";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/shared/form-field";
import { FormMessage } from "@/components/shared/form-message";
import { SubmitButton } from "@/components/shared/submit-button";
import { NativeSelect } from "@/components/shared/native-select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EVIDENCE_KIND } from "@/lib/labels";
import { useGlobalT, useT } from "@/i18n/client";
import { openDispute, recordEvidence, recordInvoice, reviewEvidence } from "../actions";

type FormProps = { orgSlug: string; placementId: string; currency: string; onDone: () => void };

/** Dialog whose form remounts on every open, so action state and idempotency keys never leak between submissions. */
function FinanceDialog({ label, title, description, children }: { label: string; title: string; description: string; children: (onDone: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="secondary">{label}</Button></DialogTrigger>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {open ? children(() => setOpen(false)) : null}
      </DialogContent>
    </Dialog>
  );
}

function useCloseOnSuccess(state: ActionResult | null, onDone: () => void) {
  const t = useT("commissions");
  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? t("forms.recorded"));
      onDone();
    }
  }, [state, onDone, t]);
}

function InvoiceForm({ orgSlug, placementId, currency, onDone, defaultAmount }: FormProps & { defaultAmount: string }) {
  const [state, action] = useActionState(recordInvoice.bind(null, orgSlug), null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const t = useT("commissions");
  useCloseOnSuccess(state, onDone);
  return (
    <ActionForm action={action} className="grid gap-4">
      <input type="hidden" name="placementId" value={placementId} />
      <input type="hidden" name="currency" value={currency} />
      <FormField id="number" label={t("forms.invoiceNumber")} error={fe?.number}><Input id="number" name="number" required /></FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="amount" label={t("forms.feeBeforeTax")} error={fe?.amount}><Input id="amount" name="amount" inputMode="decimal" defaultValue={defaultAmount} required /></FormField>
        <FormField id="tax" label={t("forms.salesTax")}><Input id="tax" name="tax" inputMode="decimal" placeholder="0.00" /></FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="issuedOn" label={t("forms.issued")} error={fe?.issuedOn}><Input id="issuedOn" name="issuedOn" type="date" required /></FormField>
        <FormField id="dueOn" label={t("forms.due")}><Input id="dueOn" name="dueOn" type="date" /></FormField>
      </div>
      {state && !state.ok ? <FormMessage state={state} /> : null}
      <SubmitButton>{t("forms.recordInvoice")}</SubmitButton>
    </ActionForm>
  );
}

export function InvoiceDialog({ defaultAmount, ...props }: Omit<FormProps, "onDone"> & { defaultAmount: string }) {
  const t = useT("commissions");
  return (
    <FinanceDialog label={t("forms.recordClientInvoice")} title={t("forms.recordClientInvoice")} description={t("forms.invoiceDescription", { currency: props.currency })}>
      {(onDone) => <InvoiceForm {...props} defaultAmount={defaultAmount} onDone={onDone} />}
    </FinanceDialog>
  );
}

function EvidenceForm({ orgSlug, placementId, currency, onDone, kinds }: FormProps & { kinds: (keyof typeof EVIDENCE_KIND)[] }) {
  const [state, action] = useActionState(recordEvidence.bind(null, orgSlug), null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const [key] = useState(() => crypto.randomUUID());
  const t = useT("commissions");
  const tg = useGlobalT();
  useCloseOnSuccess(state, onDone);
  return (
    <ActionForm action={action} className="grid gap-4">
      <input type="hidden" name="placementId" value={placementId} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="idempotencyKey" value={key} />
      <FormField id="kind" label={t("forms.type")}>
        <NativeSelect id="kind" name="kind">{kinds.map((k) => <option key={k} value={k}>{tg(`labels.evidenceKind.${k}`)}</option>)}</NativeSelect>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="amount" label={t("forms.amount", { currency })} error={fe?.amount}><Input id="amount" name="amount" inputMode="decimal" required /></FormField>
        <FormField id="processingFee" label={t("forms.processingFees")} hint={t("forms.processingFeesHint")}><Input id="processingFee" name="processingFee" inputMode="decimal" placeholder="0.00" /></FormField>
      </div>
      <FormField id="occurredOn" label={t("forms.occurredOn")} error={fe?.occurredOn}><Input id="occurredOn" name="occurredOn" type="date" required /></FormField>
      <FormField id="reference" label={t("forms.reference")} error={fe?.reference}><Input id="reference" name="reference" required /></FormField>
      <FormField id="notes" label={t("forms.notes")}><Textarea id="notes" name="notes" rows={2} /></FormField>
      {state && !state.ok ? <FormMessage state={state} /> : null}
      <SubmitButton>{t("forms.recordEvidence")}</SubmitButton>
    </ActionForm>
  );
}

export function EvidenceDialog({ label, kinds, ...props }: Omit<FormProps, "onDone"> & { kinds: (keyof typeof EVIDENCE_KIND)[]; label: string }) {
  const t = useT("commissions");
  return (
    <FinanceDialog label={label} title={label} description={t("forms.evidenceDescription")}>
      {(onDone) => <EvidenceForm {...props} kinds={kinds} onDone={onDone} />}
    </FinanceDialog>
  );
}

export function ReviewEvidenceButtons({ evidenceId, orgSlug, placementId }: { evidenceId: string; orgSlug?: string; placementId?: string }) {
  const t = useT("commissions");
  return (
    <div className="flex gap-2">
      <ConfirmDialog
        trigger={<Button size="sm">{t("forms.verify")}</Button>}
        title={t("forms.verifyTitle")}
        description={t("forms.verifyDescription")}
        confirmLabel={t("forms.verify")}
        reasonLabel={t("forms.verifyNote")}
        onConfirm={(note) => reviewEvidence({ evidenceId, approve: true, note, orgSlug, placementId })}
      />
      <ConfirmDialog
        trigger={<Button size="sm" variant="outline">{t("forms.reject")}</Button>}
        title={t("forms.rejectTitle")}
        description={t("forms.rejectDescription")}
        confirmLabel={t("forms.reject")}
        destructive
        reasonLabel={t("forms.reason")}
        reasonRequired
        onConfirm={(note) => reviewEvidence({ evidenceId, approve: false, note, orgSlug, placementId })}
      />
    </div>
  );
}

export function DisputeButton({ orgSlug, placementId }: { orgSlug: string; placementId: string }) {
  const t = useT("commissions");
  return (
    <ConfirmDialog
      trigger={<Button variant="outline">{t("forms.openDispute")}</Button>}
      title={t("forms.disputeTitle")}
      description={t("forms.disputeDescription")}
      confirmLabel={t("forms.openDispute")}
      destructive
      reasonLabel={t("forms.disputeReason")}
      reasonRequired
      onConfirm={(reason) => openDispute(orgSlug, { placementId, reason })}
    />
  );
}
