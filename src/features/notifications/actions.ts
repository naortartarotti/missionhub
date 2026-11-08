"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/server/auth/context";
import { safeNext } from "@/features/auth/schemas";

export async function markAllRead(orgSlug: string) {
  const ctx = await getRequestContext(orgSlug);
  await ctx.db.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", ctx.userId).is("read_at", null);
  revalidatePath(`/w/${orgSlug}`, "layout");
}

export async function openNotification(orgSlug: string, id: string, href: string) {
  const ctx = await getRequestContext(orgSlug);
  await ctx.db.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", ctx.userId).is("read_at", null);
  revalidatePath(`/w/${orgSlug}`, "layout");
  redirect(safeNext(href, `/w/${orgSlug}/notifications`));
}
