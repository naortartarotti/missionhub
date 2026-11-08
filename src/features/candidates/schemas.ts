import { z } from "zod";
import { normalizeSkills } from "@/features/matching/domain/skills";
import { msg } from "@/i18n/translate";

const tooLong = (max: number) => msg("candidates.validation.tooLong", { max });
const invalidOption = msg("candidates.validation.invalidOption");

const list = z
  .string()
  .optional()
  .transform((s) => normalizeSkills((s ?? "").split(",")).slice(0, 60));
const plainList = z
  .string()
  .optional()
  .transform((s) => [...new Set((s ?? "").split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 30));
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, tooLong(max))
    .optional()
    .transform((v) => (v ? v : null));
const optNumber = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v || v.trim() === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: msg("candidates.validation.positiveNumber") });
      return z.NEVER;
    }
    return n;
  });

export const SENIORITY_VALUES = ["intern", "junior", "mid", "senior", "lead", "principal", "executive"] as const;
export const ARRANGEMENT_VALUES = ["remote", "hybrid", "onsite"] as const;

export const candidateFormSchema = z
  .object({
    fullName: z.string().trim().min(1, msg("candidates.validation.nameRequired")).max(160, tooLong(160)),
    email: z.union([z.literal(""), z.email(msg("candidates.validation.emailInvalid"))]).optional().transform((v) => (v ? v.toLowerCase() : null)),
    phone: optText(40),
    headline: optText(200),
    summary: optText(5000),
    locationCity: optText(100),
    locationRegion: optText(100),
    locationCountry: z
      .string()
      .trim()
      .toUpperCase()
      .optional()
      .refine((v) => !v || /^[A-Z]{2}$/.test(v), msg("candidates.validation.countryCode"))
      .transform((v) => v || null),
    openToRelocation: z.string().optional().transform((v) => v === "on"),
    workArrangements: z.array(z.enum(ARRANGEMENT_VALUES, invalidOption)).default([]),
    seniority: z.enum(SENIORITY_VALUES, invalidOption).optional().or(z.literal("")).transform((v) => v || null),
    yearsExperience: optNumber.refine((v) => v === null || v <= 70, msg("candidates.validation.maxYears")),
    skills: list,
    languages: list,
    tags: plainList,
    salaryMin: optNumber,
    salaryMax: optNumber,
    salaryCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, msg("candidates.validation.currency")).default("CAD"),
    availableFrom: z.string().optional().transform((v) => v || null),
    notes: optText(10000),
    source: z.enum(["manual", "csv_import", "resume_upload", "referral", "other"]).default("manual"),
    sourceDetail: optText(200),
    legalBasis: z.enum(["consent", "contract", "legitimate_interest", "other_documented"]).default("consent"),
    privacyNoticeGiven: z.string().optional().transform((v) => v === "on"),
  })
  .refine((v) => v.salaryMin === null || v.salaryMax === null || v.salaryMin <= v.salaryMax, {
    path: ["salaryMax"],
    message: msg("candidates.validation.salaryOrder"),
  });
export type CandidateFormValues = z.infer<typeof candidateFormSchema>;

export const consentSchema = z.object({
  candidateId: z.uuid(),
  kind: z.enum(["processing", "job_sharing"]),
  jobId: z.uuid().optional(),
  legalBasis: z.enum(["consent", "contract", "legitimate_interest", "other_documented"]),
  scope: z.string().trim().min(5, msg("candidates.validation.scope")).max(1000, tooLong(1000)),
  evidence: z.string().trim().min(5, msg("candidates.validation.evidence")).max(2000, tooLong(2000)),
  expiresAt: z.string().optional().transform((v) => v || null),
});

export const statusSchema = z.object({
  candidateId: z.uuid(),
  status: z.enum(["draft", "active_for_matching", "unavailable", "archived"]),
});

export const ALLOWED_DOC_TYPES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
} as const;
export const MAX_DOC_BYTES = 10 * 1024 * 1024;
