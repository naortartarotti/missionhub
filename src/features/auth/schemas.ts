import { z } from "zod";
import { msg } from "@/i18n/translate";

export const signInSchema = z.object({
  email: z.email(msg("auth.validation.email")).trim().toLowerCase(),
  password: z.string().min(1, msg("auth.validation.passwordRequired")),
  next: z.string().optional(),
});

export const passwordSchema = z
  .string()
  .min(10, msg("auth.validation.passwordLength"))
  .max(128, msg("auth.validation.passwordTooLong"))
  .regex(/[A-Za-z]/, msg("auth.validation.passwordLetter"))
  .regex(/[0-9]/, msg("auth.validation.passwordNumber"));

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, msg("auth.validation.nameRequired")).max(120, msg("auth.validation.nameTooLong")),
  email: z.email(msg("auth.validation.email")).trim().toLowerCase(),
  password: passwordSchema,
  next: z.string().optional(),
});

export const forgotSchema = z.object({ email: z.email(msg("auth.validation.email")).trim().toLowerCase() });
export const resetSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: msg("auth.validation.passwordMismatch") });

/**
 * Only allow same-origin relative redirects (prevents open redirect). Browsers strip tabs and newlines
 * from URLs and treat `\` like `/`, so `/\t/evil.example` would become `//evil.example`: any control
 * character, whitespace or backslash is refused, the path must start with exactly one `/`, and it must
 * resolve to the same origin.
 */
export function safeNext(next: string | undefined | null, fallback = "/"): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2048) return fallback;
  if (/[\u0000-\u0020\u007f-\u009f\u2028\u2029\s\\]/.test(next)) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  try {
    const base = "http://x";
    if (new URL(next, base).origin !== base) return fallback;
  } catch {
    return fallback;
  }
  return next;
}
