import { z } from "zod";
import { CONDUCT_CATEGORIES, IMMEDIATE_HOLD_GROUNDS, RULES_LOCALES, SANCTION_LEVELS, VERSION_TYPES } from "./domain";

/**
 * Zod schemas for every N10 Server Action (spec §5.16 limits). The same schemas back the forms.
 * Length errors use `network.validation.length` with {min}/{max}; the marker is built here as a
 * plain string so this module doesn't depend on message keys the frontend adds.
 */
const lengthMsg = (min: number, max: number) => `i18n:network.validation.length|${JSON.stringify({ min, max })}`;
const textLen = (min: number, max: number) => z.string().trim().min(min, lengthMsg(min, max)).max(max, lengthMsg(min, max));
const uuid = z.uuid("i18n:errors.invalidId");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const fileIds = z.array(uuid).max(5).default([]);

export const rulesLocaleSchema = z.enum(RULES_LOCALES);

// ---------------------------------------------------------------------------
// Acceptance (BR-5 to BR-7)
// ---------------------------------------------------------------------------
export const acceptRulesSchema = z
  .object({ versionId: uuid, locale: rulesLocaleSchema, personal: z.boolean(), forOrg: z.boolean() })
  .refine((v) => v.personal || v.forOrg, { path: ["personal"], message: "i18n:network.accept.needOne" });

// ---------------------------------------------------------------------------
// Conduct reports (BR-15 to BR-17)
// ---------------------------------------------------------------------------
export const reportTargetSchema = z
  .object({ referralId: uuid.optional(), matchId: uuid.optional() })
  .refine((v) => Boolean(v.referralId) !== Boolean(v.matchId), { path: ["referralId"], message: "i18n:errors.invalidId" });

export const fileReportSchema = z
  .object({
    referralId: uuid.optional(),
    matchId: uuid.optional(),
    category: z.enum(CONDUCT_CATEGORIES),
    description: textLen(20, 4000),
    occurredOn: isoDate.optional().nullable(),
    occurredApprox: z.boolean().default(false),
    attested: z.literal(true, { message: "i18n:network.report.errors.attest" }),
    fileIds,
  })
  .refine((v) => Boolean(v.referralId) !== Boolean(v.matchId), { path: ["referralId"], message: "i18n:errors.invalidId" });

export const reportReplySchema = z.object({ caseId: uuid, body: textLen(20, 4000), fileIds });
export const reportListSchema = z.object({ scope: z.enum(["mine", "org"]).default("mine"), referralId: uuid.optional() });

// ---------------------------------------------------------------------------
// Reported org (BR-22, BR-31)
// ---------------------------------------------------------------------------
export const responseSchema = z.object({ noticeId: uuid, body: textLen(20, 8000), fileIds });
export const followupReplySchema = z.object({ followupId: uuid, body: textLen(20, 4000), fileIds });
export const reviewRequestSchema = z.object({ caseId: uuid, text: textLen(20, 8000), fileIds });

// ---------------------------------------------------------------------------
// Settlement mode (BR-34.6)
// ---------------------------------------------------------------------------
export const deactivateMemberSchema = z.object({ membershipId: uuid });

// ---------------------------------------------------------------------------
// Platform admin
// ---------------------------------------------------------------------------
const localeTexts = z.object({ en: z.string().max(200_000).default(""), "fr-CA": z.string().max(200_000).default(""), "pt-BR": z.string().max(200_000).default("") });

export const rulesDraftSchema = z.object({
  draftId: uuid.optional().nullable(),
  label: z.string().trim().regex(/^\d{1,3}\.\d{1,3}$/, "i18n:admin.networkRules.errors.labelFormat"),
  type: z.enum(VERSION_TYPES),
  effectiveOn: isoDate.optional().nullable(),
  texts: localeTexts,
  summaries: localeTexts,
  legalReason: z.string().trim().max(1000).optional().nullable(),
  approvalReference: z.string().trim().max(300).optional().nullable(),
});

export const rulesPublishSchema = rulesDraftSchema.extend({
  approvalReference: textLen(5, 300),
});

export const conductCategorySchema = z.object({ caseId: uuid, category: z.enum(CONDUCT_CATEGORIES) });
export const conductInfoRequestSchema = z.object({ caseId: uuid, question: textLen(20, 2000), dueBusinessDays: z.number().int().min(1).max(10).optional().nullable() });
export const conductCloseSchema = z.object({ caseId: uuid, reasonCode: z.enum(["no_rule", "amount", "duplicate", "other"]), reason: textLen(20, 1000) });
export const conductOpenSchema = z.object({
  orgId: uuid,
  category: z.enum(CONDUCT_CATEGORIES),
  adminSource: z.enum(["confirmation_invalid", "objection_fabricated", "other"]),
  referralId: uuid.optional().nullable(),
  description: textLen(20, 4000),
  fileIds,
});

const noticeFields = {
  caseId: uuid,
  language: rulesLocaleSchema,
  conductDate: isoDate,
  rulesVersionId: uuid,
  rulesCited: z.array(z.string().regex(/^\d+\.\d+$/)).min(1).max(40),
  allegation: textLen(20, 4000),
  allegedWhen: textLen(3, 200),
  evidenceSummary: textLen(20, 4000),
  nameReporter: z.boolean().default(false),
};
export const conductNoticeSchema = z.object(noticeFields);
export const immediateHoldSchema = z.object({ ...noticeFields, ground: z.enum(IMMEDIATE_HOLD_GROUNDS) });
export const conductFollowupSchema = z.object({ noticeId: uuid, question: textLen(20, 2000), dueBusinessDays: z.number().int().min(1).max(10).optional().nullable() });

export const conductDecisionSchema = z
  .object({
    caseId: uuid,
    noticeId: uuid,
    outcome: z.enum(["no_breach", "insufficient_evidence", "breach"]),
    finding: z.string().trim().max(8000).optional().nullable(),
    rulesCited: z.array(z.string().regex(/^\d+\.\d+$/)).max(40).default([]),
    residualTest: z.boolean().default(false),
    level: z.enum(SANCTION_LEVELS).optional().nullable(),
    whyNotHold: z.string().trim().max(2000).optional().nullable(),
    plannedReviewOn: isoDate.optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.outcome !== "breach") return;
    if ((v.finding ?? "").length < 50) ctx.addIssue({ code: "custom", path: ["finding"], message: lengthMsg(50, 8000) });
    if (v.rulesCited.length === 0) ctx.addIssue({ code: "custom", path: ["rulesCited"], message: "i18n:admin.conduct.decision.rulesFromNotice" });
    if ((v.level === "suspension" || v.level === "termination") && (v.whyNotHold ?? "").length < 20)
      ctx.addIssue({ code: "custom", path: ["whyNotHold"], message: lengthMsg(20, 2000) });
  });

export const liftSanctionSchema = z.object({ orgId: uuid, sanctionId: uuid.optional().nullable(), reason: textLen(5, 2000) });
export const reviewDecisionSchema = z.object({
  reviewId: uuid,
  outcome: z.enum(["confirm", "reduce", "overturn"]),
  newLevel: z.enum(["warning", "network_hold", "suspension", "none"]).optional().nullable(),
  reason: textLen(50, 8000),
});
export const incidentNoticeSchema = z.object({
  caseId: uuid,
  recipientOrgIds: z.array(uuid).min(1).max(50),
  referralIds: z.array(uuid).min(1).max(50),
  information: textLen(20, 2000),
  when: textLen(3, 200),
  toWhom: z.string().trim().max(500).optional().nullable(),
  language: rulesLocaleSchema,
});
export const staleCloseSchema = z.object({ referralId: uuid, reason: textLen(5, 2000) });
