"use client";

import { ActionForm } from "@/components/shared/action-form";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { FormMessage } from "@/components/shared/form-message";
import { SubmitButton } from "@/components/shared/submit-button";
import { NativeSelect } from "@/components/shared/native-select";
import { updateOrganization } from "../actions";

export function OrgSettingsForm({ orgSlug, name, currency, disabled }: { orgSlug: string; name: string; currency: string; disabled: boolean }) {
  const [state, action] = useActionState(updateOrganization.bind(null, orgSlug), null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <ActionForm action={action} className="grid max-w-lg gap-4">
      <FormField id="name" label="Organization name" error={fe?.name}><Input id="name" name="name" defaultValue={name} disabled={disabled} /></FormField>
      <FormField id="currency" label="Default currency" hint="Used for new jobs and dashboard totals. Amounts are never converted.">
        <NativeSelect id="currency" name="currency" defaultValue={currency} disabled={disabled}>{["CAD", "USD", "EUR", "GBP", "BRL"].map((c) => <option key={c}>{c}</option>)}</NativeSelect>
      </FormField>
      <FormMessage state={state} />
      {!disabled ? <SubmitButton className="justify-self-start">Save</SubmitButton> : <p className="text-sm text-muted-foreground">Only organization admins can change these settings.</p>}
    </ActionForm>
  );
}
