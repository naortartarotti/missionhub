import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env, integrations } from "@/server/env";
import { sendEmail } from "@/server/integrations/email";
import { authEmail, toLocale, type AuthEmailKind, type RenderedEmail } from "@/server/email/templates";
import { safeNext } from "@/features/auth/schemas";

/**
 * Supabase Auth "Send Email Hook". When enabled, Supabase stops sending auth emails itself
 * (signup confirmation, password reset, magic link, email change, reauthentication, security
 * notifications) and POSTs them here; we render MissionHub templates in the user's language and
 * deliver through Resend. Configure in Supabase: Authentication → Hooks → Send Email (HTTPS),
 * URL `<app>/api/auth/send-email`, and put the generated secret in SEND_EMAIL_HOOK_SECRET.
 *
 * Links point at our own /auth/confirm (verifyOtp with token_hash), never at supabase.co.
 */

type HookPayload = {
  user: { email: string; new_email?: string; user_metadata?: { full_name?: string; locale?: string } };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new: string;
    token_hash_new: string;
    old_email?: string;
  };
};

const TOLERANCE_SECONDS = 5 * 60;

/** Standard Webhooks signature check (the scheme Supabase hooks use). */
function verify(body: string, headers: Headers, secret: string): boolean {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatures = headers.get("webhook-signature");
  if (!id || !timestamp || !signatures) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.replace(/^v1,/, "").replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signatures.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

const fail = (status: number, message: string) => NextResponse.json({ error: { http_code: status, message } }, { status });

/** Where to land after the link is verified: the `next` the app asked for, or a sensible default. */
function landing(redirectTo: string, fallback: string): { origin: string; next: string } {
  try {
    const url = new URL(redirectTo);
    const next = url.searchParams.get("next") ?? (url.pathname.startsWith("/auth/") || url.pathname === "/" ? null : url.pathname + url.search);
    // redirect_to was already checked by Supabase against the project's allowed redirect URLs.
    return { origin: url.origin, next: safeNext(next, fallback) };
  } catch {
    return { origin: env.NEXT_PUBLIC_APP_URL, next: fallback };
  }
}

/** verifyOtp types accepted by /auth/confirm for each action. */
const OTP_TYPE: Record<string, string> = { signup: "email", magiclink: "email", email: "email", recovery: "recovery", invite: "invite", email_change: "email_change" };
const DEFAULT_NEXT: Record<string, string> = { signup: "/onboarding", recovery: "/reset-password", invite: "/onboarding" };

function confirmUrl(e: HookPayload["email_data"], tokenHash: string) {
  const { origin, next } = landing(e.redirect_to, DEFAULT_NEXT[e.email_action_type] ?? "/");
  const params = new URLSearchParams({ token_hash: tokenHash, type: OTP_TYPE[e.email_action_type] ?? "email", next });
  return `${origin}/auth/confirm?${params}`;
}

/** The emails one hook call should produce (email change can need two). */
async function compose({ user, email_data: e }: HookPayload): Promise<{ to: string; email: RenderedEmail }[]> {
  const locale = toLocale(user.user_metadata?.locale);
  const base = { name: user.user_metadata?.full_name, email: user.email };
  const one = async (kind: AuthEmailKind, to: string, extra: Parameters<typeof authEmail>[2] = base) => ({ to, email: await authEmail(kind, locale, extra) });
  const type = e.email_action_type;

  switch (type) {
    case "signup":
    case "magiclink":
    case "email":
    case "recovery":
    case "invite": {
      const kind: AuthEmailKind = type === "email" ? "magiclink" : type;
      return [await one(kind, user.email, { ...base, url: confirmUrl(e, e.token_hash) })];
    }
    case "email_change": {
      const newEmail = user.new_email ?? "";
      // Field names are reversed upstream: token_hash_new belongs to the CURRENT address.
      if (e.token_hash && e.token_hash_new) {
        return [
          await one("emailChangeCurrent", user.email, { ...base, newEmail, url: confirmUrl(e, e.token_hash_new) }),
          await one("emailChangeNew", newEmail, { ...base, newEmail, url: confirmUrl(e, e.token_hash) }),
        ];
      }
      return [await one("emailChangeNew", newEmail || user.email, { ...base, newEmail, url: confirmUrl(e, e.token_hash || e.token_hash_new) })];
    }
    case "reauthentication":
      return [await one("reauthentication", user.email, { ...base, code: e.token })];
    case "password_changed_notification":
      return [await one("passwordChanged", user.email, { ...base, url: `${env.NEXT_PUBLIC_APP_URL}/forgot-password` })];
    case "email_changed_notification":
      return [await one("emailChanged", user.email, { ...base, oldEmail: e.old_email ?? "" })];
    default:
      // Other security notifications (phone, identities, MFA factors).
      return [await one("securityNotice", user.email, { ...base, event: type.replace(/_notification$/, "").replaceAll("_", " ") })];
  }
}

export async function POST(request: NextRequest) {
  const secret = env.SEND_EMAIL_HOOK_SECRET;
  if (!secret) return fail(500, "send email hook is not configured");
  const body = await request.text();
  if (!verify(body, request.headers, secret)) return fail(401, "invalid signature");

  let payload: HookPayload;
  try {
    payload = JSON.parse(body) as HookPayload;
    if (!payload.user?.email || !payload.email_data?.email_action_type) throw new Error("bad payload");
  } catch {
    return fail(400, "invalid payload");
  }

  const messages = await compose(payload);

  if (!integrations.email) {
    // Local development without Resend: print the message so links can still be followed.
    if (env.APP_ENV === "development") {
      for (const m of messages) console.info(`[email:dev] to=${m.to} subject="${m.email.subject}"\n${m.email.text}`);
      return NextResponse.json({});
    }
    return fail(500, "email delivery is not configured");
  }

  for (const m of messages) {
    const result = await sendEmail({ to: m.to, ...m.email });
    // A non-2xx makes Supabase report the failure to the user (e.g. "error sending confirmation email").
    if (!result.sent) return fail(502, "email delivery failed");
  }
  // Privacy-aware log: action type only, never addresses or tokens.
  console.info(JSON.stringify({ evt: "auth_email.sent", type: payload.email_data.email_action_type, count: messages.length }));
  return NextResponse.json({});
}
