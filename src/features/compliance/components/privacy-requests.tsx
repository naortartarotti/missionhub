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
import { useT } from "@/i18n/client";

const KINDS = ["access", "correction", "withdrawal", "deletion"] as const;

export function PrivacyRequestForm({ orgSlug }: { orgSlug: string }) {
  const [state, action] = useActionState(logPrivacyRequest.bind(null, orgSlug), null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const t = useT("settings");
  return (
    <ActionForm action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="kind" label={t("privacy.form.type")}>
          <NativeSelect id="kind" name="kind">
            {KINDS.map((k) => <option key={k} value={k}>{t(`privacy.kindOption.${k}`)}</option>)}
          </NativeSelect>
        </FormField>
        <FormField id="requesterContact" label={t("privacy.form.contact")} error={fe?.requesterContact}><Input id="requesterContact" name="requesterContact" /></FormField>
      </div>
      <FormField id="candidateId" label={t("privacy.form.candidateId")} hint={t("privacy.form.candidateIdHint")}><Input id="candidateId" name="candidateId" /></FormField>
      <FormField id="details" label={t("privacy.form.details")}><Textarea id="details" name="details" rows={2} /></FormField>
      <FormMessage state={state} />
      <SubmitButton className="justify-self-start">{t("privacy.form.submit")}</SubmitButton>
    </ActionForm>
  );
}

export function PrivacyRequestActions({ orgSlug, id }: { orgSlug: string; id: string }) {
  const t = useT("settings");
  return (
    <div className="flex gap-2">
      <ConfirmDialog trigger={<Button size="sm" variant="outline">{t("privacy.actions.start")}</Button>} title={t("privacy.actions.startTitle")} description={t("privacy.actions.startDescription")} confirmLabel={t("privacy.actions.startConfirm")} onConfirm={(r) => updatePrivacyRequest(orgSlug, { id, status: "in_progress", resolution: r })} reasonLabel={t("privacy.actions.note")} />
      <ConfirmDialog trigger={<Button size="sm">{t("privacy.actions.complete")}</Button>} title={t("privacy.actions.completeTitle")} description={t("privacy.actions.completeDescription")} confirmLabel={t("privacy.actions.complete")} reasonLabel={t("privacy.actions.resolution")} reasonRequired onConfirm={(r) => updatePrivacyRequest(orgSlug, { id, status: "completed", resolution: r })} />
    </div>
  );
}
