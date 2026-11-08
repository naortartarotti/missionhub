"use client";

import { ActionForm } from "@/components/shared/action-form";

import { useActionState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormMessage } from "@/components/shared/form-message";
import { useT } from "@/i18n/client";
import { requestPasswordReset, resetPassword, signIn, signUp } from "../actions";

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signIn, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const t = useT("auth");
  return (
    <ActionForm action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <FormField id="email" label={t("form.workEmail")} error={fe?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!fe?.email} />
      </FormField>
      <FormField id="password" label={t("form.password")} error={fe?.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={!!fe?.password} />
      </FormField>
      <div className="-mt-1 text-right">
        <Link href="/forgot-password" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {t("form.forgotPassword")}
        </Link>
      </div>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="mt-1 w-full" pendingLabel={t("form.signingIn")}>{t("form.signIn")}</SubmitButton>
    </ActionForm>
  );
}

export function SignUpForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signUp, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const t = useT("auth");
  if (state?.ok) return <FormMessage state={state} />;
  return (
    <ActionForm action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <FormField id="fullName" label={t("form.fullName")} error={fe?.fullName}>
        <Input id="fullName" name="fullName" autoComplete="name" required aria-invalid={!!fe?.fullName} />
      </FormField>
      <FormField id="email" label={t("form.workEmail")} error={fe?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!fe?.email} />
      </FormField>
      <FormField id="password" label={t("form.password")} hint={t("form.passwordHint")} error={fe?.password}>
        <Input id="password" name="password" type="password" autoComplete="new-password" required aria-invalid={!!fe?.password} />
      </FormField>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="mt-1 w-full" pendingLabel={t("form.creatingAccount")}>{t("form.createAccount")}</SubmitButton>
      <p className="text-center text-xs text-muted-foreground">
        {t("form.terms")}
      </p>
    </ActionForm>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const t = useT("auth");
  return (
    <ActionForm action={action} className="grid gap-4" noValidate>
      <FormField id="email" label={t("form.workEmail")} error={fe?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </FormField>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full" pendingLabel={t("form.sending")}>{t("form.sendResetLink")}</SubmitButton>
    </ActionForm>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPassword, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const t = useT("auth");
  return (
    <ActionForm action={action} className="grid gap-4" noValidate>
      <FormField id="password" label={t("form.newPassword")} error={fe?.password} hint={t("form.passwordHint")}>
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </FormField>
      <FormField id="confirm" label={t("form.confirmPassword")} error={fe?.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </FormField>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full">{t("form.updatePassword")}</SubmitButton>
    </ActionForm>
  );
}
