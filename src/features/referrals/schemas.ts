import { z } from "zod";
import { msg } from "@/i18n/translate";
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

export const reportHireSchema = z.object({
  referralId: z.uuid(),
  fee: z.string().min(1, msg("referrals.validation.enterFee")),
  currency: z.string().regex(/^[A-Z]{3}$/),
  startDate: z.iso.date(msg("referrals.validation.enterStartDate")),
  guaranteeDays: z.coerce.number().int().min(0).max(365).default(90),
  version: z.coerce.number().int().positive(),
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
