import { z } from "zod";
import { msg } from "@/i18n/translate";
import { DISCLOSURE_KEYS } from "./disclosure";
import { DECLINE_REASONS } from "./review";

export const submitReferralSchema = z
  .object({
    matchId: z.uuid(),
    fields: z.array(z.enum(DISCLOSURE_KEYS)).min(1, msg("referrals.validation.selectField")),
    documentIds: z.array(z.uuid()).max(5).default([]),
    consentId: z.string().optional(),
    newConsentEvidence: z.string().trim().max(2000).optional(),
    newConsentBasis: z.enum(["consent", "contract", "legitimate_interest", "other_documented"]).default("consent"),
    confirmInterest: z.literal("on", { message: msg("referrals.validation.confirmInterest") }),
    note: z.string().trim().max(4000).optional(),
    idempotencyKey: z.uuid(),
  })
  .refine((v) => (v.consentId && v.consentId !== "new") || (v.newConsentEvidence && v.newConsentEvidence.length >= 5), {
    path: ["newConsentEvidence"],
    message: msg("referrals.validation.describeAuthorization"),
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
