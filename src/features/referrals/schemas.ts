import { z } from "zod";
import { msg } from "@/i18n/translate";
import { FEE_DIFFERENCE_REASONS } from "@/lib/money/terms";
import { DISCLOSURE_KEYS } from "./disclosure";
import { DECLINE_REASONS } from "./review";
import { normalizeSkills } from "@/features/matching/domain/skills";

export const submitReferralSchema = z
  .object({
    matchId: z.uuid(),
    fields: z.array(z.enum(DISCLOSURE_KEYS)).min(1, msg("referrals.validation.selectField")),
    documentIds: z.array(z.uuid()).max(5).default([]),
    // "candidate_email": the candidate confirms through a private link (referral waits for them).
    // "recorded": the recruiter records the authorization they already have.
    authMethod: z.enum(["candidate_email", "recorded"]).default("recorded"),
    consentId: z.string().optional(),
    newConsentEvidence: z.string().trim().max(2000).optional(),
    newConsentBasis: z.enum(["consent", "contract", "legitimate_interest", "other_documented"]).default("consent"),
    confirmInterest: z.literal("on").optional(),
    note: z.string().trim().max(4000).optional(),
    idempotencyKey: z.uuid(),
    // N2 (BR-12): the terms version the submit screen rendered. A stale or foreign id → outcome terms_changed.
    termsVersionId: z.uuid(),
    // Second step of the pending-warning submit (BR-7): the user ticked "submit anyway".
    acknowledgePendingWarning: z.enum(["true", "on"]).optional().transform((v) => v !== undefined),
  })
  .superRefine((v, ctx) => {
    if (v.authMethod === "candidate_email") return;
    if (v.confirmInterest !== "on") ctx.addIssue({ code: "custom", path: ["confirmInterest"], message: msg("referrals.validation.confirmInterest") });
    if (!((v.consentId && v.consentId !== "new") || (v.newConsentEvidence && v.newConsentEvidence.length >= 5))) {
      ctx.addIssue({ code: "custom", path: ["newConsentEvidence"], message: msg("referrals.validation.describeAuthorization") });
    }
  });

export const transitionSchema = z.object({
  referralId: z.uuid(),
  to: z.enum(["under_review", "info_requested", "accepted", "declined", "withdrawn", "interviewing", "offer", "rejected", "cancelled"]),
  reason: z.string().trim().max(2000).default(""),
  version: z.number().int().positive(),
});

export const messageSchema = z.object({ referralId: z.uuid(), body: z.string().trim().min(1, msg("referrals.validation.writeMessage")).max(4000) });

/**
 * Hire report (N2, BR-21 to BR-26). The server decides the variant from the referral's terms:
 * - snapshot referral: `baseSalary` (% bases), `targetBonus` (total cash), optional `invoicedDifferent` ("on")
 *   with `invoicedFee`, `differenceReason` and `differenceNote`. Amounts in major units of the terms currency.
 *   Posting `fee`, `currency` or `guaranteeDays` is refused (hire_terms_fixed);
 * - legacy referral (no snapshot): today's `fee`, `currency`, `guaranteeDays` (0–365, default 90).
 */
export const reportHireSchema = z.object({
  referralId: z.uuid(),
  startDate: z.iso.date(msg("referrals.validation.enterStartDate")),
  version: z.coerce.number().int().positive(),
  // snapshot: the effective terms version the dialog rendered (getReferralTerms().effective.id); stale → hire_terms_changed
  termsVersionId: z.uuid().optional().or(z.literal("")).transform((v) => v || null),
  baseSalary: z.string().trim().max(40).optional(),
  targetBonus: z.string().trim().max(40).optional(),
  invoicedDifferent: z.string().optional().transform((v) => v === "on" || v === "true"),
  invoicedFee: z.string().trim().max(40).optional(),
  differenceReason: z.enum(FEE_DIFFERENCE_REASONS).optional().or(z.literal("")).transform((v) => v || null),
  differenceNote: z.string().trim().optional().transform((v) => v || null),
  // legacy
  fee: z.string().trim().max(40).optional(),
  currency: z.string().trim().toUpperCase().optional(),
  guaranteeDays: z.string().trim().optional(),
  // N3 common fields (BR-8, spec §2.3; absent on the V1 happy-path dialog). Validated in `hireCommonFields`.
  offerAcceptedOn: z.union([z.iso.date(), z.literal("")]).optional().transform((v) => v || null),
  acceptanceUnknown: z.string().optional().transform((v) => v === "on" || v === "true"),
  role: z.enum(["this_job", "other"]).optional().default("this_job"),
  otherRoleTitle: z.string().trim().max(500).optional().transform((v) => v || null),
  // N3 v2 (BR-24): set by the hire report panel's "Confirm and record hire"; the report then closes as confirmed.
  reportId: z.union([z.uuid(), z.literal("")]).optional().transform((v) => v || null),
});
export type ReportHireInput = z.infer<typeof reportHireSchema>;

/**
 * N3 v2 (PD-077): start and acceptance dates lie within [delivery − 1 year (ET date), today + 548 days], as
 * report_hire / complete_fee_details enforce (`hire_dates_invalid`). Dates are YYYY-MM-DD.
 */
export function hireDateWindow(deliveredAt: string | null, todayEt: string) {
  const etDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date(iso));
  const from = deliveredAt ? etDate(deliveredAt) : todayEt;
  const [y, m, d] = from.split("-");
  const min = `${Number(y) - 1}-${m}-${m === "02" && d === "29" ? "28" : d}`;
  const t = new Date(`${todayEt}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 548);
  return { min, max: t.toISOString().slice(0, 10) };
}

/**
 * N3 BR-8 common-field rules, shared with the dialog: the acceptance date (unless unknown) is ≤ today (ET)
 * and ≤ the start date; "another role" needs a title of 1–120 characters. Returns field errors (empty = ok)
 * and the RPC values (`null` acceptance = unknown, the start date is used for timing).
 */
export function hireCommonFields(v: Pick<ReportHireInput, "startDate" | "offerAcceptedOn" | "acceptanceUnknown" | "role" | "otherRoleTitle">, todayEt: string) {
  const fieldErrors: Record<string, string[]> = {};
  const accepted = v.acceptanceUnknown ? null : v.offerAcceptedOn;
  if (accepted && accepted > todayEt) fieldErrors.offerAcceptedOn = [msg("referrals.hire.validation.acceptanceFuture")];
  else if (accepted && accepted > v.startDate) fieldErrors.offerAcceptedOn = [msg("referrals.hire.validation.acceptanceAfterStart")];
  const title = v.role === "other" ? v.otherRoleTitle : null;
  if (v.role === "other" && (!title || title.length > 120)) fieldErrors.otherRoleTitle = [msg("referrals.hire.validation.otherRoleTitle")];
  return { fieldErrors, offerAcceptedOn: accepted, hiredRoleTitle: title };
}

/** Legacy free entry (BR-26), unchanged from before N2. */
export const legacyHireSchema = z.object({
  fee: z.string().min(1, msg("referrals.validation.enterFee")),
  currency: z.string().regex(/^[A-Z]{3}$/),
  guaranteeDays: z.coerce.number().int().min(0).max(365).default(90),
});

const declineReason = z.enum(DECLINE_REASONS);
const note = z.string().trim().max(2000).default("");

/** Queue decisions. Declining needs a reason code; "other" also needs a note. Asking for info needs the question. */
export const reviewSchema = z
  .object({
    referralId: z.uuid(),
    to: z.enum(["under_review", "accepted", "declined", "info_requested"]),
    reasonCode: declineReason.optional(),
    note,
    version: z.number().int().positive(),
  })
  .refine((v) => v.to !== "declined" || v.reasonCode, { path: ["reasonCode"], message: msg("referrals.validation.pickReason") })
  .refine((v) => !(v.to === "declined" && v.reasonCode === "other" && !v.note), { path: ["note"], message: msg("referrals.validation.addNote") })
  .refine((v) => v.to !== "info_requested" || v.note, { path: ["note"], message: msg("referrals.validation.addQuestion") });

/** Withdraw (sourcing side), optionally releasing the candidate in the same step (BR-25). */
export const withdrawSchema = z.object({
  referralId: z.uuid(),
  reason: z.string().trim().min(1, msg("referrals.validation.addNote")).max(2000),
  version: z.number().int().positive(),
  release: z.boolean().default(false),
});

/** Release later, on a withdrawn, cancelled, declined or rejected referral (N1 BR-25; N3 BR-34). */
export const releaseSchema = z.object({ referralId: z.uuid() });

// ---------------------------------------------------------------------------------------------
// Prior-presentation claims (N1)

export const CLAIM_EVIDENCE_TYPES = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" } as const;
export const CLAIM_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
export const CLAIM_EVIDENCE_MAX_FILES = 5;

export const claimEvidenceFileSchema = z.object({ fileId: z.uuid() });

export const fileClaimSchema = z
  .object({
    referralId: z.uuid(),
    version: z.number().int().positive(),
    evidenceKind: z.enum(["file", "referral"]),
    fileIds: z.array(z.uuid()).max(CLAIM_EVIDENCE_MAX_FILES).default([]),
    evidenceReferralId: z.uuid().optional(),
    priorProcessDate: z.iso.date().optional(),
    attested: z.literal(true, { message: msg("referrals.validation.attestationRequired") }),
    note: z.string().trim().max(2000).default(""),
  })
  .refine((v) => v.evidenceKind !== "file" || v.fileIds.length > 0, { path: ["fileIds"], message: msg("referrals.validation.evidenceRequired") })
  .refine((v) => v.evidenceKind !== "file" || !!v.priorProcessDate, { path: ["priorProcessDate"], message: msg("referrals.validation.priorDateRequired") })
  .refine((v) => v.evidenceKind !== "referral" || !!v.evidenceReferralId, { path: ["evidenceReferralId"], message: msg("referrals.validation.evidenceRequired") });

/**
 * Arguments for `file_prior_presentation_claim`, built from the parsed action input. Every key is
 * always present (null when unused): PostgREST resolves the function by the JSON keys it receives,
 * and JSON drops `undefined`. Shared by `fileClaim` and the integration test that exercises it.
 */
export function fileClaimRpcArgs(v: z.output<typeof fileClaimSchema>, actingOrg: string) {
  return {
    p_referral: v.referralId,
    p_expected_version: v.version,
    p_evidence_kind: v.evidenceKind,
    p_file_ids: v.evidenceKind === "file" ? v.fileIds : [],
    p_evidence_referral: (v.evidenceKind === "referral" ? (v.evidenceReferralId ?? null) : null) as string,
    p_prior_process_date: (v.evidenceKind === "file" ? (v.priorProcessDate ?? null) : null) as string,
    p_attested: v.attested,
    p_note: v.note,
    p_acting_org: actingOrg,
  };
}

export const contestSchema = z.object({
  referralId: z.uuid(),
  reason: z.string().trim().min(5, msg("referrals.validation.contestReason")).max(2000, msg("referrals.validation.contestReason")),
});

export const bulkDeclineSchema = z
  .object({ ids: z.array(z.uuid()).min(1).max(200), reasonCode: declineReason, note })
  .refine((v) => v.reasonCode !== "other" || v.note, { path: ["note"], message: msg("referrals.validation.addNote") });

// ---------------------------------------------------------------------------------------------
// Candidate's public confirmation page

const tooLong = (max: number) => msg("candidates.validation.tooLong", { max });
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, tooLong(max))
    .optional()
    .transform((v) => v || "");
const optAmount = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || /^\d+(\.\d+)?$/.test(v.replace(/[\s,]/g, "")), msg("candidates.validation.positiveNumber"))
  .transform((v) => v?.replace(/[\s,]/g, "") || "");
const tagList = (max: number) =>
  z
    .string()
    .optional()
    .transform((s) => normalizeSkills((s ?? "").split(",")).slice(0, max));

/** What the candidate may change about themselves. Email is fixed: it is the channel of the link. */
/** Comma-separated ISO 3166-1 alpha-2 codes ("CA, PT") from the country picker. */
const isoList = (max: number) =>
  z
    .string()
    .optional()
    .transform((v) => [...new Set((v ?? "").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean))])
    .refine((xs) => xs.every((x) => /^[A-Z]{2}$/.test(x)), msg("candidates.validation.countryCode"))
    .transform((xs) => xs.slice(0, max));

export const candidateProfileSchema = z
  .object({
    fullName: z.string().trim().min(1, msg("candidate.nameRequired")).max(160, tooLong(160)),
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
      .transform((v) => v || ""),
    workArrangements: z.array(z.enum(["remote", "hybrid", "onsite"])).default([]),
    travelAvailability: z.enum(["none", "occasional", "frequent"]).optional().or(z.literal("")).transform((v) => v || null),
    relocationScope: z.enum(["none", "region", "country", "international"]).optional().or(z.literal("")).transform((v) => v || null),
    relocationDestinations: isoList(30),
    workAuthorization: isoList(30),
    hasPassport: z.enum(["yes", "no"]).optional().or(z.literal("")).transform((v) => (v === "yes" ? true : v === "no" ? false : null)),
    skills: tagList(60),
    languages: tagList(30),
    salaryMin: optAmount,
    salaryMax: optAmount,
    salaryCurrency: z
      .string()
      .trim()
      .toUpperCase()
      .optional()
      .refine((v) => !v || /^[A-Z]{3}$/.test(v), msg("candidates.validation.currency"))
      .transform((v) => v || ""),
    availableFrom: z
      .string()
      .optional()
      .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), msg("candidates.validation.invalidOption"))
      .transform((v) => v || ""),
    consent: z.literal("on", { message: msg("candidate.consentRequired") }),
  })
  .refine((v) => !v.salaryMin || !v.salaryMax || Number(v.salaryMin) <= Number(v.salaryMax), {
    path: ["salaryMax"],
    message: msg("candidates.validation.salaryOrder"),
  });

export const candidateDeclineSchema = z.object({ reason: z.string().trim().max(1000).optional() });
