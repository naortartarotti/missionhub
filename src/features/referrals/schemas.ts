import { z } from "zod";
import { DISCLOSURE_KEYS } from "./disclosure";

export const submitReferralSchema = z
  .object({
    matchId: z.uuid(),
    fields: z.array(z.enum(DISCLOSURE_KEYS)).min(1, "Select at least one field to share"),
    documentIds: z.array(z.uuid()).max(5).default([]),
    consentId: z.string().optional(),
    newConsentEvidence: z.string().trim().max(2000).optional(),
    newConsentBasis: z.enum(["consent", "contract", "legitimate_interest", "other_documented"]).default("consent"),
    confirmInterest: z.literal("on", { message: "Confirm the candidate is interested in this role" }),
    note: z.string().trim().max(4000).optional(),
    idempotencyKey: z.uuid(),
  })
  .refine((v) => (v.consentId && v.consentId !== "new") || (v.newConsentEvidence && v.newConsentEvidence.length >= 5), {
    path: ["newConsentEvidence"],
    message: "Describe how the candidate authorized sharing with this recruiter for this job",
  });

export const transitionSchema = z.object({
  referralId: z.uuid(),
  to: z.enum(["under_review", "info_requested", "accepted", "declined", "withdrawn", "interviewing", "offer", "rejected", "cancelled"]),
  reason: z.string().trim().max(2000).default(""),
  version: z.number().int().positive(),
});

export const messageSchema = z.object({ referralId: z.uuid(), body: z.string().trim().min(1, "Write a message").max(4000) });

export const reportHireSchema = z.object({
  referralId: z.uuid(),
  fee: z.string().min(1, "Enter the placement fee"),
  currency: z.string().regex(/^[A-Z]{3}$/),
  startDate: z.iso.date("Enter a start date"),
  guaranteeDays: z.coerce.number().int().min(0).max(365).default(90),
  version: z.coerce.number().int().positive(),
});
