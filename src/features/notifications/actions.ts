"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getRequestContext } from "@/server/auth/context";
import { safeNext } from "@/features/auth/schemas";

export async function markAllRead(orgSlug: string) {
  const ctx = await getRequestContext(orgSlug);
  await ctx.db.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", ctx.userId).is("read_at", null);
  revalidatePath(`/w/${orgSlug}`, "layout");
}

/** Marks a notification read and follows its link. The destination comes from the stored row, never from the client. */
export async function openNotification(orgSlug: string, notificationId: string) {
  const ctx = await getRequestContext(orgSlug);
  const fallback = `/w/${orgSlug}/notifications`;
  if (!z.uuid().safeParse(notificationId).success) redirect(fallback);
  const { data: n } = await ctx.db
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", ctx.userId)
    .select("link, organizations(slug)")
    .maybeSingle();
  revalidatePath(`/w/${orgSlug}`, "layout");
  const slug = n?.organizations?.slug ?? orgSlug;
  redirect(n?.link ? safeNext(`/w/${slug}${n.link}`, fallback) : fallback);
}
