import "server-only";

import { env, integrations } from "@/server/env";
import { sendEmail } from "@/server/integrations/email";
import { candidateRequestEmail } from "@/server/email/templates";
import type { RequestContext } from "@/server/auth/context";
import { createAdminClient } from "@/server/supabase/admin";
import { getLocale } from "@/i18n/server";

/** How long the candidate's private link stays valid. Resending issues a fresh link. */
export const CANDIDATE_REQUEST_TTL_DAYS = 14;

/** The database issues 32 random bytes, base64url without padding (N9 BR-1). */
const ISSUED_TOKEN = /^[A-Za-z0-9_-]{43}$/;

const candidateRequestUrl = (token: string) => `${env.NEXT_PUBLIC_APP_URL}/candidate/${token}`;

/**
 * N9 (BR-2, BR-5): asks the database for the request's token. `issue_candidate_request_token` is
 * executable by service_role only, so this is the one place the raw token reaches the app. The actor
 * is always the session user; the RPC re-checks membership, status and that no live token exists.
 * Errors are swallowed on purpose (no message, no log): the caller records "not sent" and the
 * recruiter resends.
 */
async function issueCandidateRequestToken(ctx: RequestContext, referralId: string): Promise<string | null> {
  try {
    const { data, error } = await createAdminClient().rpc("issue_candidate_request_token", {
      p_referral: referralId,
      p_actor: ctx.user.id,
    });
    if (error || typeof data !== "string" || !ISSUED_TOKEN.test(data)) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * N3 BR-2 (O-1, PD-043): "sent" is recorded only by this server path. `record_candidate_request_delivery`
 * is executable by service_role only and takes the session user as the actor (re-checked in the RPC), like
 * the token issuance. No member can set or change "sent" by a direct call. Never throws.
 */
async function recordDelivery(ctx: RequestContext, referralId: string, ok: boolean, reason?: string): Promise<void> {
  try {
    await createAdminClient().rpc("record_candidate_request_delivery", {
      p_referral: referralId,
      p_actor: ctx.user.id,
      p_ok: ok,
      p_error: ok ? undefined : reason,
    });
  } catch {
    // The request row keeps its previous state; the recruiter sees "not sent" and resends.
  }
}

/**
 * Issues the candidate's private link and emails it, then records the outcome on the request (shown
 * to the recruiter, who can resend). Call only after `submit_referral_for_candidate` created the
 * request or `rotate_candidate_request_token` re-armed it, both with the user's own client.
 * Never throws: the referral already exists and must not be lost. The token never leaves this
 * function except inside the email to the candidate: it is not returned, logged or stored.
 */
export async function emailCandidateRequest(
  ctx: RequestContext,
  input: { referralId: string; to: string; jobTitle: string; partner: string; candidateName?: string | null },
): Promise<{ sent: boolean; reason?: "not_configured" | "failed" }> {
  if (!integrations.email) {
    // Nothing would carry the link, so none is issued; Resend issues one once email works.
    await recordDelivery(ctx, input.referralId, false, "not_configured");
    return { sent: false, reason: "not_configured" };
  }
  const token = await issueCandidateRequestToken(ctx, input.referralId);
  if (!token) {
    await recordDelivery(ctx, input.referralId, false, "failed");
    return { sent: false, reason: "failed" };
  }
  // The candidate has no account, so the recruiter's language is the best signal we have.
  const email = await candidateRequestEmail(await getLocale(), {
    name: input.candidateName,
    recruiter: ctx.user.fullName || ctx.organizationName,
    org: ctx.organizationName,
    partner: input.partner,
    job: input.jobTitle,
    expiresAt: new Date(Date.now() + CANDIDATE_REQUEST_TTL_DAYS * 86_400_000),
    url: candidateRequestUrl(token),
  });
  const result = await sendEmail({ to: input.to, ...email });
  await recordDelivery(ctx, input.referralId, result.sent, result.sent ? undefined : result.reason);
  return result.sent ? { sent: true } : { sent: false, reason: result.reason };
}
