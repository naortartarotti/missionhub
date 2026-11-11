"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, isLocale } from "./config";
import { createClient } from "@/server/supabase/server";

/** Stores the chosen language for a year and re-renders everything in it. */
export async function setLocale(locale: string) {
  if (!isLocale(locale)) return { ok: false as const };
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: false });
  // Signed-in users also get their account emails (password reset etc.) in this language.
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user && data.user.user_metadata?.locale !== locale) await supabase.auth.updateUser({ data: { locale } });
  } catch {
    // The cookie is what matters for the UI; never fail the switch over the metadata.
  }
  revalidatePath("/", "layout");
  return { ok: true as const };
}
