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

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Builds a minimal, client-safe HTML + text email with one call-to-action button. */
export function renderActionEmail({ heading, body, cta, url, footer }: { heading: string; body: string; cta: string; url: string; footer: string }) {
  const html = `<!doctype html><html><body style="margin:0;background:#f6f6f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:16px;padding:32px">
<tr><td><h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(heading)}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.5">${escapeHtml(body)}</p>
<a href="${escapeHtml(url)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-size:14px;font-weight:600">${escapeHtml(cta)}</a>
<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#666">${escapeHtml(footer)}<br><a href="${escapeHtml(url)}" style="color:#666;word-break:break-all">${escapeHtml(url)}</a></p>
</td></tr></table></td></tr></table></body></html>`;
  const text = `${heading}\n\n${body}\n\n${cta}: ${url}\n\n${footer}`;
  return { html, text };
}
