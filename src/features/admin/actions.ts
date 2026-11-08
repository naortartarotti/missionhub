"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/server/supabase/server";
import { getSessionUser } from "@/server/auth/context";
import { toActionError, type ActionResult } from "@/lib/actions/result";

async function adminDb() {
  const user = await getSessionUser();
  if (!user?.isPlatformAdmin) throw new Error("forbidden");
  return createClient();
}

export async function setSuspension(input: { orgId: string; suspend: boolean; reason: string }): Promise<ActionResult> {
  const db = await adminDb();
  const { error } = await db.rpc("set_organization_suspension", { p_org: input.orgId, p_suspend: input.suspend, p_reason: input.reason });
  if (error) return toActionError(error);
  revalidatePath("/admin");
  return { ok: true, message: input.suspend ? "Organization suspended." : "Organization reinstated." };
}

export async function resolveDispute(input: { disputeId: string; upheld: boolean; resolution: string }): Promise<ActionResult> {
  const db = await adminDb();
  if (input.resolution.trim().length < 5) return { ok: false, error: "Describe the resolution." };
  const { error } = await db.rpc("resolve_dispute", { p_dispute: input.disputeId, p_resolution: input.resolution, p_upheld: input.upheld });
  if (error) return toActionError(error);
  revalidatePath("/admin");
  return { ok: true, message: "Dispute closed." };
}

export async function publishRule(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const db = await adminDb();
  const n = (k: string) => Math.round(Number(formData.get(k)) * 100);
  const [s, j, p] = [n("sourcing"), n("jobOwner"), n("platform")];
  if ([s, j, p].some((x) => !Number.isInteger(x) || x < 0) || s + j + p !== 10000) return { ok: false, error: "Percentages must be non-negative and total exactly 100%." };
  const { error } = await db.rpc("publish_commission_rule", { p_name: String(formData.get("name") || "Standard marketplace split"), p_sourcing: s, p_job_owner: j, p_platform: p });
  if (error) return toActionError(error);
  revalidatePath("/admin");
  return { ok: true, message: "New rule version published. Existing agreements keep their frozen snapshot." };
}
