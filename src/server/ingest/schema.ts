import { z } from "zod";
import { ARRANGEMENT_VALUES, SENIORITY_VALUES } from "@/features/candidates/schemas";

/**
 * The shape every external source is converted to before it touches the database: the public API
 * accepts it as JSON, connectors map their provider's records onto it, spreadsheets are read into it.
 * Money is in major units ("85000"), countries are ISO 3166-1 alpha-2, arrays are plain strings.
 */

const str = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);
const tags = (max: number) => z.array(z.string().trim().min(1).max(80)).max(max).optional().default([]);
const country = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Use an ISO 3166-1 alpha-2 country code, e.g. \"CA\"")
  .optional()
  .nullable()
  .transform((v) => v || null);
const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use an ISO 4217 currency code, e.g. \"USD\"");
const money = z.coerce.number().nonnegative().max(1e10).optional().nullable().transform((v) => (v === undefined ? null : v));
const httpUrl = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .transform((v) => v || null)
  .refine((v) => v === null || /^https?:\/\//i.test(v), "Must be an http(s) URL");

export const externalIdSchema = z.string().trim().min(1).max(200);

const location = z
  .object({ city: str(100), region: str(100), country })
  .partial()
  .optional()
  .default({});

const salary = z
  .object({ min: money, max: money, currency: currency.optional() })
  .partial()
  .optional()
  .default({})
  .refine((s) => s.min == null || s.max == null || s.min <= s.max, "salary.min must not exceed salary.max");

export const candidateInputSchema = z.object({
  externalId: externalIdSchema.optional(),
  fullName: z.string().trim().min(2).max(160),
  email: z.email().trim().toLowerCase().max(254).optional().nullable().transform((v) => v || null),
  phone: str(40),
  headline: str(200),
  summary: str(5000),
  linkedinUrl: httpUrl,
  skills: tags(80),
  languages: tags(20),
  seniority: z.enum(SENIORITY_VALUES).optional().nullable().transform((v) => v || null),
  yearsExperience: z.coerce.number().min(0).max(70).optional().nullable().transform((v) => (v === undefined ? null : v)),
  location,
  workArrangements: z.array(z.enum(ARRANGEMENT_VALUES)).max(3).optional().default([]),
  salary,
  notes: str(5000),
  /** Assigns the candidate to this member of the organization (defaults to the key's or connection's owner). */
  ownerEmail: z.email().trim().toLowerCase().optional().nullable(),
});
export type CandidateInput = z.input<typeof candidateInputSchema>;
export type CandidateRecord = z.output<typeof candidateInputSchema>;

export const jobInputSchema = z.object({
  externalId: externalIdSchema.optional(),
  title: z.string().trim().min(2).max(160),
  clientName: str(160),
  description: z.string().max(20000).optional().nullable().transform((v) => (v ?? "").trim()),
  requiredSkills: tags(40),
  preferredSkills: tags(40),
  seniority: z.enum(SENIORITY_VALUES).optional().nullable().transform((v) => v || null),
  minYearsExperience: z.coerce.number().min(0).max(70).optional().nullable().transform((v) => (v === undefined ? null : v)),
  workArrangement: z.enum(ARRANGEMENT_VALUES).optional().nullable().transform((v) => v || null),
  contractType: z.enum(["permanent", "contract", "temporary", "contract_to_hire"]).optional().nullable().transform((v) => v || null),
  location,
  languages: tags(20),
  salary,
  url: httpUrl,
  /** draft (default) keeps it private until a recruiter reviews it; active publishes it to matching. */
  status: z.enum(["draft", "active", "paused", "closed"]).optional(),
  ownerEmail: z.email().trim().toLowerCase().optional().nullable(),
});
export type JobInput = z.input<typeof jobInputSchema>;
export type JobRecord = z.output<typeof jobInputSchema>;

export const MAX_BATCH = 100;
