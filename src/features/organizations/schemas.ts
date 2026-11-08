import { z } from "zod";

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

export const ONBOARDING_CURRENCIES = ["CAD", "USD", "EUR", "GBP", "BRL"] as const;

export const workspaceStepSchema = z.object({
  name: z.string().trim().min(2, "Enter your organization name").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/, "3–48 characters: lowercase letters, numbers and dashes"),
});

export const createOrganizationSchema = workspaceStepSchema.extend({
  kind: z.enum(["agency", "independent"]),
  currency: z.enum(ONBOARDING_CURRENCIES).default("CAD"),
  headline: z.string().trim().max(160).optional(),
  specialties: z.string().trim().max(500).optional(),
  regions: z.string().trim().max(500).optional(),
});

export const inviteSchema = z.object({
  email: z.email("Enter a valid email").trim().toLowerCase(),
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
