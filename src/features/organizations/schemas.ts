import { z } from "zod";
import { msg } from "@/i18n/translate";
import { SUPPORTED_CURRENCIES } from "@/lib/money/currency";

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

export const ONBOARDING_CURRENCIES = SUPPORTED_CURRENCIES;

export const workspaceStepSchema = z.object({
  name: z.string().trim().min(2, msg("onboarding.validation.nameRequired")).max(120, msg("onboarding.validation.nameTooLong")),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/, msg("onboarding.validation.slugFormat")),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, msg("onboarding.validation.country")),
});

const checked = z
  .union([z.literal("on"), z.literal("true"), z.literal(true), z.literal("false"), z.literal(false), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true" || v === true);

export const createOrganizationSchema = workspaceStepSchema.extend({
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, msg("onboarding.validation.country")),
  currency: z.enum(ONBOARDING_CURRENCIES),
  headline: z.string().trim().max(160).optional(),
  specialties: z.string().trim().max(500).optional(),
  regions: z.string().trim().max(500).optional(),
  // N10 BR-6 (spec §2.1): the version shown, its locale and both explicit statements. The database
  // refuses the org without them (rules_acceptance_required / rules_version_changed).
  rulesVersionId: z.uuid().optional(),
  rulesLocale: z.enum(["en", "fr-CA", "pt-BR"]).optional(),
  acceptOrg: checked,
  acceptMember: checked,
});

export const inviteSchema = z.object({
  email: z.email(msg("onboarding.validation.email")).trim().toLowerCase(),
  role: z.enum(["org_admin", "recruiter_manager", "recruiter"]),
});

export const memberUpdateSchema = z.object({
  membershipId: z.uuid(),
  role: z.enum(["org_admin", "recruiter_manager", "recruiter"]).optional(),
  status: z.enum(["active", "suspended"]).optional(),
});

export const splitList = (s?: string) =>
  (s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 30);
