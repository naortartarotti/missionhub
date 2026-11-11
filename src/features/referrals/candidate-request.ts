import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { env, integrations } from "@/server/env";
import { sendEmail } from "@/server/integrations/email";
import { candidateRequestEmail } from "@/server/email/templates";
import type { RequestContext } from "@/server/auth/context";
import { getLocale } from "@/i18n/server";

/** How long the candidate's private link stays valid. Resending issues a fresh link. */
export const CANDIDATE_REQUEST_TTL_DAYS = 14;

/**
 * A fresh single-purpose credential for the candidate's page. Only the SHA-256 hash is stored
 * (the database hashes the same UTF-8 string with pgcrypto); the raw token lives only in the email.
 */
export function newCandidateToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}

export const candidateRequestUrl = (token: string) => `${env.NEXT_PUBLIC_APP_URL}/candidate/${token}`;

/**
 * Emails the candidate their private link and records the outcome on the request (shown to the
 * recruiter, who can resend). Never throws: the referral already exists and must not be lost.
 * The link is never returned to the recruiter, so only the candidate can confirm.
 */
export async function emailCandidateRequest(
  ctx: RequestContext,
  input: { referralId: string; token: string; to: string; jobTitle: string; partner: string; candidateName?: string | null },
): Promise<{ sent: boolean; reason?: "not_configured" | "failed" }> {
  if (!integrations.email) {
    await ctx.db.rpc("record_candidate_request_delivery", { p_referral: input.referralId, p_ok: false, p_error: "not_configured" });
    return { sent: false, reason: "not_configured" };
  }
  // The candidate has no account, so the recruiter's language is the best signal we have.
  const email = await candidateRequestEmail(await getLocale(), {
    name: input.candidateName,
    recruiter: ctx.user.fullName || ctx.organizationName,
    org: ctx.organizationName,
    partner: input.partner,
    job: input.jobTitle,
    expiresAt: new Date(Date.now() + CANDIDATE_REQUEST_TTL_DAYS * 86_400_000),
    url: candidateRequestUrl(input.token),
  });
  const result = await sendEmail({ to: input.to, ...email });
  await ctx.db.rpc("record_candidate_request_delivery", {
    p_referral: input.referralId,
    p_ok: result.sent,
    p_error: result.sent ? undefined : result.reason,
  });
  return result.sent ? { sent: true } : { sent: false, reason: result.reason };
}
