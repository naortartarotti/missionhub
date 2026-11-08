"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/server/supabase/server";
import { env } from "@/server/env";
import { fromZodError, type ActionResult } from "@/lib/actions/result";
import { forgotSchema, resetSchema, safeNext, signInSchema, signUpSchema } from "./schemas";

const GENERIC_AUTH_ERROR = "Email or password is incorrect.";

export async function signIn(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) return { ok: false, error: error.code === "email_not_confirmed" ? "Confirm your email before signing in." : GENERIC_AUTH_ERROR };
  redirect(safeNext(parsed.data.next, "/"));
}

export async function signUp(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
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
    if (error.code === "weak_password") return { ok: false, error: "Choose a stronger password." };
    return { ok: false, error: "We couldn't create your account. Please try again." };
  }
  if (!data.session) {
    return { ok: true, message: "Check your inbox to confirm your email, then sign in." };
  }
  redirect(safeNext(parsed.data.next, "/onboarding"));
}

export async function requestPasswordReset(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = forgotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? env.NEXT_PUBLIC_APP_URL;
  await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: `${origin}/auth/callback?next=/reset-password` });
  // Same response whether or not the account exists.
  return {
    ok: true,
    message:
      "If an account exists for that email, a reset link is on its way. In local development, open Mailpit at http://127.0.0.1:55324.",
  };
}

export async function resetPassword(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: "Your reset link has expired. Request a new one." };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
