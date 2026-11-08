"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { guard, id, parse, rateLimit } from "@/server/actions/guard";
import { assertCan, getRequestContext } from "@/server/auth/context";
import { toActionError, type ActionResult } from "@/lib/actions/result";
import { DISMISS_REASONS } from "./triage";
import { markMatchesSeen } from "./queries";

const triageSchema = z.object({
  matchId: id,
  state: z.enum(["saved", "dismissed"]).nullable(),
  reason: z.enum(DISMISS_REASONS).nullable().optional(),
});

/** Save, dismiss (with a reason) or restore a match. State is private to the sourcing organization. */
export async function setMatchTriage(orgSlug: string, input: { matchId: string; state: "saved" | "dismissed" | null; reason?: string | null }): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "referrals:submit");
    const v = parse(triageSchema, input);
    await rateLimit(ctx.db, "match.triage", 120, 60);
    const { error } = await ctx.db.rpc("set_match_triage", {
      p_org: ctx.organizationId,
      p_match: v.matchId,
      p_state: v.state as string,
      p_reason: v.state === "dismissed" ? (v.reason ?? "other") : undefined,
    });
    if (error) return toActionError(error);
    revalidatePath(`/w/${orgSlug}`, "layout");
    return { ok: true };
  });
}

/** Clears the "New" flag. Called from the browser once the matches are actually on screen. */
export async function markOpportunitiesSeen(orgSlug: string, matchIds: string[]): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "referrals:submit");
    const ids = parse(z.array(id).max(500), matchIds);
    await markMatchesSeen(ctx, ids);
    return { ok: true };
  });
}
