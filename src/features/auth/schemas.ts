import { z } from "zod";

export const signInSchema = z.object({
  email: z.email("Enter a valid email").trim().toLowerCase(),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128)
  .regex(/[A-Za-z]/, "Include a letter")
  .regex(/[0-9]/, "Include a number");

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(120),
  email: z.email("Enter a valid email").trim().toLowerCase(),
  password: passwordSchema,
  next: z.string().optional(),
});

export const forgotSchema = z.object({ email: z.email("Enter a valid email").trim().toLowerCase() });
export const resetSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

/** Only allow same-origin relative redirects (prevents open redirect). */
export function safeNext(next: string | undefined | null, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
