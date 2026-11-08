"use client";

import { ActionForm } from "@/components/shared/action-form";

import { useActionState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormMessage } from "@/components/shared/form-message";
import { requestPasswordReset, resetPassword, signIn, signUp } from "../actions";

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signIn, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <ActionForm action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <FormField id="email" label="Work email" error={fe?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!fe?.email} />
      </FormField>
      <FormField id="password" label="Password" error={fe?.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={!!fe?.password} />
      </FormField>
      <div className="-mt-1 text-right">
        <Link href="/forgot-password" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Forgot password?
        </Link>
      </div>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="mt-1 w-full" pendingLabel="Signing in…">Sign in</SubmitButton>
    </ActionForm>
  );
}

export function SignUpForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signUp, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  if (state?.ok) return <FormMessage state={state} />;
  return (
    <ActionForm action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <FormField id="fullName" label="Full name" error={fe?.fullName}>
        <Input id="fullName" name="fullName" autoComplete="name" required aria-invalid={!!fe?.fullName} />
      </FormField>
      <FormField id="email" label="Work email" error={fe?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!fe?.email} />
      </FormField>
      <FormField id="password" label="Password" hint="At least 10 characters, including a letter and a number." error={fe?.password}>
        <Input id="password" name="password" type="password" autoComplete="new-password" required aria-invalid={!!fe?.password} />
      </FormField>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="mt-1 w-full" pendingLabel="Creating account…">Create account</SubmitButton>
      <p className="text-center text-xs text-muted-foreground">
        By continuing you agree to the draft Terms and Privacy Policy (legal review pending).
      </p>
    </ActionForm>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <ActionForm action={action} className="grid gap-4" noValidate>
      <FormField id="email" label="Work email" error={fe?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </FormField>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full" pendingLabel="Sending…">Send reset link</SubmitButton>
    </ActionForm>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPassword, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <ActionForm action={action} className="grid gap-4" noValidate>
      <FormField id="password" label="New password" error={fe?.password} hint="At least 10 characters, including a letter and a number.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </FormField>
      <FormField id="confirm" label="Confirm password" error={fe?.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </FormField>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full">Update password</SubmitButton>
    </ActionForm>
  );
}
