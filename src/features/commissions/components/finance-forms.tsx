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
  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Recorded");
      onDone();
    }
  }, [state, onDone]);
}

function InvoiceForm({ orgSlug, placementId, currency, onDone, defaultAmount }: FormProps & { defaultAmount: string }) {
  const [state, action] = useActionState(recordInvoice.bind(null, orgSlug), null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  useCloseOnSuccess(state, onDone);
  return (
    <ActionForm action={action} className="grid gap-4">
      <input type="hidden" name="placementId" value={placementId} />
      <input type="hidden" name="currency" value={currency} />
      <FormField id="number" label="Invoice number" error={fe?.number}><Input id="number" name="number" required /></FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="amount" label="Fee (before tax)" error={fe?.amount}><Input id="amount" name="amount" inputMode="decimal" defaultValue={defaultAmount} required /></FormField>
        <FormField id="tax" label="Sales tax"><Input id="tax" name="tax" inputMode="decimal" placeholder="0.00" /></FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="issuedOn" label="Issued" error={fe?.issuedOn}><Input id="issuedOn" name="issuedOn" type="date" required /></FormField>
        <FormField id="dueOn" label="Due"><Input id="dueOn" name="dueOn" type="date" /></FormField>
      </div>
      {state && !state.ok ? <FormMessage state={state} /> : null}
      <SubmitButton>Record invoice</SubmitButton>
    </ActionForm>
  );
}

export function InvoiceDialog({ defaultAmount, ...props }: Omit<FormProps, "onDone"> & { defaultAmount: string }) {
  return (
    <FinanceDialog label="Record client invoice" title="Record client invoice" description={`The invoice you (the job owner) issued to the hiring company. Amounts in ${props.currency}.`}>
      {(onDone) => <InvoiceForm {...props} defaultAmount={defaultAmount} onDone={onDone} />}
    </FinanceDialog>
  );
}

function EvidenceForm({ orgSlug, placementId, currency, onDone, kinds }: FormProps & { kinds: (keyof typeof EVIDENCE_KIND)[] }) {
  const [state, action] = useActionState(recordEvidence.bind(null, orgSlug), null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const [key] = useState(() => crypto.randomUUID());
  useCloseOnSuccess(state, onDone);
  return (
    <ActionForm action={action} className="grid gap-4">
      <input type="hidden" name="placementId" value={placementId} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="idempotencyKey" value={key} />
      <FormField id="kind" label="Type">
        <NativeSelect id="kind" name="kind">{kinds.map((k) => <option key={k} value={k}>{EVIDENCE_KIND[k]}</option>)}</NativeSelect>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="amount" label={`Amount (${currency})`} error={fe?.amount}><Input id="amount" name="amount" inputMode="decimal" required /></FormField>
        <FormField id="processingFee" label="Processing fees" hint="Bank/card fees deducted"><Input id="processingFee" name="processingFee" inputMode="decimal" placeholder="0.00" /></FormField>
      </div>
      <FormField id="occurredOn" label="Date received / sent" error={fe?.occurredOn}><Input id="occurredOn" name="occurredOn" type="date" required /></FormField>
      <FormField id="reference" label="Bank or transfer reference" error={fe?.reference}><Input id="reference" name="reference" required /></FormField>
      <FormField id="notes" label="Notes"><Textarea id="notes" name="notes" rows={2} /></FormField>
      {state && !state.ok ? <FormMessage state={state} /> : null}
      <SubmitButton>Record evidence</SubmitButton>
    </ActionForm>
  );
}

export function EvidenceDialog({ label, kinds, ...props }: Omit<FormProps, "onDone"> & { kinds: (keyof typeof EVIDENCE_KIND)[]; label: string }) {
  return (
    <FinanceDialog label={label} title={label} description="Recorded as pending. It changes the ledger only after someone other than you verifies it against the bank record.">
      {(onDone) => <EvidenceForm {...props} kinds={kinds} onDone={onDone} />}
    </FinanceDialog>
  );
}

export function ReviewEvidenceButtons({ evidenceId, orgSlug, placementId }: { evidenceId: string; orgSlug?: string; placementId?: string }) {
  return (
    <div className="flex gap-2">
      <ConfirmDialog
        trigger={<Button size="sm">Verify</Button>}
        title="Verify this evidence?"
        description="Only verify after checking the actual bank or payment record. Verification writes immutable ledger entries."
        confirmLabel="Verify"
        reasonLabel="Verification note"
        onConfirm={(note) => reviewEvidence({ evidenceId, approve: true, note, orgSlug, placementId })}
      />
      <ConfirmDialog
        trigger={<Button size="sm" variant="outline">Reject</Button>}
        title="Reject this evidence?"
        description="The recorder will need to submit corrected evidence."
        confirmLabel="Reject"
        destructive
        reasonLabel="Reason"
        reasonRequired
        onConfirm={(note) => reviewEvidence({ evidenceId, approve: false, note, orgSlug, placementId })}
      />
    </div>
  );
}

export function DisputeButton({ orgSlug, placementId }: { orgSlug: string; placementId: string }) {
  return (
    <ConfirmDialog
      trigger={<Button variant="outline">Open dispute</Button>}
      title="Open a dispute?"
      description="The placement is frozen (no new evidence or verification) until a platform administrator resolves it. History is never deleted."
      confirmLabel="Open dispute"
      destructive
      reasonLabel="What's wrong?"
      reasonRequired
      onConfirm={(reason) => openDispute(orgSlug, { placementId, reason })}
    />
  );
}
