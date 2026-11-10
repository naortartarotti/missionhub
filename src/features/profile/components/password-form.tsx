"use client";

import { useActionState, useEffect, useRef } from "react";
import { ActionForm } from "@/components/shared/action-form";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { FormMessage } from "@/components/shared/form-message";
import { SubmitButton } from "@/components/shared/submit-button";
import { useT } from "@/i18n/client";
import { changePassword } from "../actions";

export function PasswordForm() {
  const t = useT("profile");
  const [state, action] = useActionState(changePassword, null);
  const formRef = useRef<HTMLDivElement>(null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;

  // Clear the fields once the new password is saved; keep them on errors so the user can fix them.
  useEffect(() => {
    if (state?.ok) formRef.current?.closest("form")?.reset();
  }, [state]);

  return (
    <ActionForm action={action} className="grid max-w-xl gap-5">
      <div ref={formRef} className="grid gap-5 sm:grid-cols-2">
        <FormField id="password" label={t("password.new")} hint={t("password.hint")} error={fe?.password}>
          <Input id="password" name="password" type="password" autoComplete="new-password" aria-invalid={!!fe?.password} />
        </FormField>
        <FormField id="confirm" label={t("password.confirm")} error={fe?.confirm}>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" aria-invalid={!!fe?.confirm} />
        </FormField>
      </div>
      <FormMessage state={state} />
      <SubmitButton variant="outline" className="justify-self-start">{t("password.submit")}</SubmitButton>
    </ActionForm>
  );
}
