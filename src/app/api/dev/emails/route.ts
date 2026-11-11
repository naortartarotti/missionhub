import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/env";
import { LOCALES } from "@/i18n/config";
import { authEmail, candidateRequestEmail, teamInviteEmail, toLocale, type AuthEmailKind, type RenderedEmail } from "@/server/email/templates";

/**
 * Development-only preview of every email template with sample data.
 *   /api/dev/emails                       index
 *   /api/dev/emails?t=signup&locale=pt    one template (add &format=text for the plain-text part)
 */
const AUTH: AuthEmailKind[] = ["signup", "recovery", "magiclink", "invite", "emailChangeCurrent", "emailChangeNew", "reauthentication", "passwordChanged", "emailChanged", "securityNotice"];
const TEMPLATES = [...AUTH, "teamInvite", "candidateRequest"] as const;
type Template = (typeof TEMPLATES)[number];

async function sample(t: Template, locale: ReturnType<typeof toLocale>): Promise<RenderedEmail> {
  const url = `${env.NEXT_PUBLIC_APP_URL}/auth/confirm?token_hash=sample&type=email&next=%2F`;
  if (t === "teamInvite") return teamInviteEmail(locale, { inviter: "Ana Souza", org: "Pyrgon Talent", role: "Recruiter", email: "maria@example.com", url });
  if (t === "candidateRequest") {
    return candidateRequestEmail(locale, {
      name: "Maria Oliveira",
      recruiter: "Ana Souza",
      org: "Pyrgon Talent",
      partner: "Northwind Search",
      job: "Engineering Manager, Platform",
      expiresAt: new Date(Date.now() + 14 * 86_400_000),
      url: `${env.NEXT_PUBLIC_APP_URL}/candidate/sample`,
    });
  }
  return authEmail(t, locale, { name: "Maria Oliveira", email: "maria@example.com", newEmail: "maria.new@example.com", oldEmail: "maria.old@example.com", url, code: "482913", event: "mfa factor enrolled" });
}

export async function GET(request: NextRequest) {
  if (env.APP_ENV !== "development") return new NextResponse("Not found", { status: 404 });
  const sp = request.nextUrl.searchParams;
  const t = sp.get("t") as Template | null;
  const locale = toLocale(sp.get("locale") ?? "pt");

  if (!t || !TEMPLATES.includes(t)) {
    const rows = TEMPLATES.map((name) => `<li><b>${name}</b> ${LOCALES.map((l) => `<a href="?t=${name}&locale=${l}">${l}</a>`).join(" · ")}</li>`).join("");
    return new NextResponse(`<!doctype html><meta charset="utf-8"><title>Email templates</title><body style="font:15px system-ui;padding:24px;line-height:1.9"><h1>Email templates</h1><ul>${rows}</ul></body>`, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  const email = await sample(t, locale);
  if (sp.get("format") === "text") return new NextResponse(`Subject: ${email.subject}\n\n${email.text}`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new NextResponse(email.html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
