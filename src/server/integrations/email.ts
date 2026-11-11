import "server-only";

import { env, integrations } from "@/server/env";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendResult = { sent: true; id: string } | { sent: false; reason: "not_configured" | "failed" };

/**
 * Transactional email via the Resend REST API (provisioned through the Vercel Marketplace,
 * which sets RESEND_API_KEY). Never throws: callers decide how to degrade when delivery fails.
 */
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  if (!integrations.email) return { sent: false, reason: "not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, ...message }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error("[email] Resend rejected message", res.status, await res.text().catch(() => ""));
      return { sent: false, reason: "failed" };
    }
    const { id } = (await res.json()) as { id: string };
    return { sent: true, id };
  } catch (err) {
    console.error("[email] Resend request failed", err);
    return { sent: false, reason: "failed" };
  }
}
