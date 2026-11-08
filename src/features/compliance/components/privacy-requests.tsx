"use client";

import { ActionForm } from "@/components/shared/action-form";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/shared/form-field";
import { FormMessage } from "@/components/shared/form-message";
import { SubmitButton } from "@/components/shared/submit-button";
import { NativeSelect } from "@/components/shared/native-select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { logPrivacyRequest, updatePrivacyRequest } from "../actions";

export function PrivacyRequestForm({ orgSlug }: { orgSlug: string }) {
  const [state, action] = useActionState(logPrivacyRequest.bind(null, orgSlug), null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <ActionForm action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="kind" label="Request type">
          <NativeSelect id="kind" name="kind">
            <option value="access">Access to personal information</option>
            <option value="correction">Correction</option>
            <option value="withdrawal">Withdrawal of consent</option>
            <option value="deletion">Deletion</option>
          </NativeSelect>
        </FormField>
        <FormField id="requesterContact" label="Requester contact" error={fe?.requesterContact}><Input id="requesterContact" name="requesterContact" /></FormField>
      </div>
      <FormField id="candidateId" label="Candidate record ID (optional)" hint="Copy from the candidate page URL."><Input id="candidateId" name="candidateId" /></FormField>
      <FormField id="details" label="Details"><Textarea id="details" name="details" rows={2} /></FormField>
      <FormMessage state={state} />
      <SubmitButton className="justify-self-start">Log request</SubmitButton>
    </ActionForm>
  );
}

export function PrivacyRequestActions({ orgSlug, id }: { orgSlug: string; id: string }) {
  return (
    <div className="flex gap-2">
      <ConfirmDialog trigger={<Button size="sm" variant="outline">Start</Button>} title="Mark in progress?" description="Record that the request is being handled." confirmLabel="Mark in progress" onConfirm={(r) => updatePrivacyRequest(orgSlug, { id, status: "in_progress", resolution: r })} reasonLabel="Note" />
      <ConfirmDialog trigger={<Button size="sm">Complete</Button>} title="Complete request?" description="Describe what was done (e.g. data exported and sent, record anonymized)." confirmLabel="Complete" reasonLabel="Resolution" reasonRequired onConfirm={(r) => updatePrivacyRequest(orgSlug, { id, status: "completed", resolution: r })} />
    </div>
  );
}
