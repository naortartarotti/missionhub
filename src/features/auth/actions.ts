"use server";

import { guard } from "@/server/actions/guard";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/server/supabase/server";
import { env } from "@/server/env";
import { fromZodError, type ActionResult } from "@/lib/actions/result";
import { msg } from "@/i18n/translate";
import { forgotSchema, resetSchema, safeNext, signInSchema, signUpSchema } from "./schemas";

const GENERIC_AUTH_ERROR = msg("auth.errors.invalidCredentials");

export async function signIn(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const parsed = signInSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
    if (error) return { ok: false, error: error.code === "email_not_confirmed" ? msg("auth.errors.emailNotConfirmed") : GENERIC_AUTH_ERROR };
    redirect(safeNext(parsed.data.next, "/"));
  });
}

export async function signUp(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const supabase = await createClient();
    const origin = (await headers()).get("origin") ?? env.NEXT_PUBLIC_APP_URL;
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { full_name: parsed.data.fullName },
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext(parsed.data.next, "/onboarding"))}`,
      },
    });
    if (error) {
      // Do not reveal whether an account exists.
      if (error.code === "weak_password") return { ok: false, error: msg("auth.errors.weakPassword") };
      return { ok: false, error: msg("auth.errors.signUpFailed") };
    }
    if (!data.session) {
      return { ok: true, message: msg("auth.messages.checkInbox") };
    }
    redirect(safeNext(parsed.data.next, "/onboarding"));
  });
}

export async function requestPasswordReset(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const parsed = forgotSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const supabase = await createClient();
    const origin = (await headers()).get("origin") ?? env.NEXT_PUBLIC_APP_URL;
    await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: `${origin}/auth/callback?next=/reset-password` });
    // Same response whether or not the account exists.
    return {
      ok: true,
      message: msg("auth.messages.resetSent"),
    };
  });
}

export async function resetPassword(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const parsed = resetSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) return { ok: false, error: msg("auth.errors.resetExpired") };
    redirect("/");
  });
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
