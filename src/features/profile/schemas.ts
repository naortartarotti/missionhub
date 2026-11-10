import { z } from "zod";
import { msg } from "@/i18n/translate";
import { passwordSchema } from "@/features/auth/schemas";

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, msg("auth.validation.nameRequired")).max(120, msg("auth.validation.nameTooLong")),
  headline: z.string().trim().max(160, msg("profile.validation.headlineTooLong")).optional(),
  specialties: z.string().trim().max(1000).optional(),
  regions: z.string().trim().max(1000).optional(),
});

export const changePasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: msg("auth.validation.passwordMismatch") });
