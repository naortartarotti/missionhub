"use server";

import { revalidatePath } from "next/cache";
import { guard, rateLimit } from "@/server/actions/guard";
import { requireUser } from "@/server/auth/context";
import { createClient } from "@/server/supabase/server";
import { fromZodError, toActionError, type ActionResult } from "@/lib/actions/result";
import { msg } from "@/i18n/translate";
import { splitList } from "@/features/organizations/schemas";
import { changePasswordSchema, profileSchema } from "./schemas";

/** The signed-in person's own profile. RLS (profiles_update_self) limits the update to their row. */
export async function updateProfile(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const user = await requireUser();
    const parsed = profileSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: parsed.data.fullName,
        headline: parsed.data.headline || null,
        specialties: splitList(parsed.data.specialties),
        regions: splitList(parsed.data.regions),
      })
      .eq("id", user.id);
    if (error) return toActionError(error);
    // The name shows in the sidebar, the account menu and on records across every workspace.
    revalidatePath("/w", "layout");
    return { ok: true, message: msg("profile.messages.saved") };
  });
}

export async function changePassword(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    await requireUser();
    const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const supabase = await createClient();
    await rateLimit(supabase, "profile.password", 5, 3600);
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) {
      if (error.code === "same_password") return { ok: false, error: msg("profile.errors.samePassword"), fieldErrors: { password: [msg("profile.errors.samePassword")] } };
      if (error.code === "weak_password") return { ok: false, error: msg("auth.errors.weakPassword"), fieldErrors: { password: [msg("auth.errors.weakPassword")] } };
      if (error.code === "reauthentication_needed") return { ok: false, error: msg("profile.errors.reauthenticate") };
      return { ok: false, error: msg("errors.generic") };
    }
    return { ok: true, message: msg("profile.messages.passwordChanged") };
  });
}
