import { z } from "zod";
import { msg } from "@/i18n/translate";
import { normalizeSkills } from "@/features/matching/domain/skills";
import { SENIORITY_VALUES, ARRANGEMENT_VALUES } from "@/features/candidates/schemas";

const list = z
  .string()
  .optional()
  .transform((s) => normalizeSkills((s ?? "").split(",")).slice(0, 40));
const bool = z.string().optional().transform((v) => v === "on");
const optMoney = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v || !v.trim()) return null;
    const n = Number(v.replace(/[,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: msg("jobs.validation.positiveAmount") });
      return z.NEVER;
    }
    return n;
  });

export const jobFormSchema = z
  .object({
    title: z.string().trim().min(2, msg("jobs.validation.titleRequired")).max(160),
    clientName: z.string().trim().max(160).optional().transform((v) => v || null),
    clientConfidential: bool,
    description: z.string().trim().max(20000).default(""),
    requiredSkills: list,
    preferredSkills: list,
    seniority: z.enum(SENIORITY_VALUES).optional().or(z.literal("")).transform((v) => v || null),
    minYearsExperience: optMoney.refine((v) => v === null || v <= 70, msg("jobs.validation.maxYears")),
    workArrangement: z.enum(ARRANGEMENT_VALUES),
    locationCity: z.string().trim().max(100).optional().transform((v) => v || null),
    locationRegion: z.string().trim().max(100).optional().transform((v) => v || null),
    locationCountry: z
      .string()
      .trim()
      .toUpperCase()
      .optional()
      .refine((v) => !v || /^[A-Z]{2}$/.test(v), msg("jobs.validation.countryCode"))
      .transform((v) => v || null),
    languages: list,
    contractType: z.enum(["permanent", "contract", "temporary", "contract_to_hire"]),
    salaryMin: optMoney,
    salaryMax: optMoney,
    salaryCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("CAD"),
    expectedFee: optMoney,
    feeCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("CAD"),
    acceptsExternalReferrals: bool,
    shareDescription: bool,
    shareSalary: bool,
    shareLocation: bool,
    shareFee: bool,
    status: z.enum(["draft", "active"]).default("draft"),
  })
  .refine((v) => v.salaryMin === null || v.salaryMax === null || v.salaryMin <= v.salaryMax, { path: ["salaryMax"], message: msg("jobs.validation.salaryRange") })
  .refine((v) => v.clientConfidential || v.clientName, { path: ["clientName"], message: msg("jobs.validation.clientRequired") });

export type JobFormValues = z.infer<typeof jobFormSchema>;

export const jobStatusSchema = z.object({ jobId: z.uuid(), status: z.enum(["draft", "active", "paused", "closed", "filled", "cancelled"]) });
