import { z } from "zod";
import { msg } from "@/i18n/translate";

/** N3 drop 2 (backend.md v2): hire reports, contests, rebuttals and authorization checks (BR-17 to BR-26, BR-37). */
export const HIRE_LEARNED_VIA = ["candidate", "profile", "announcement", "contact", "other"] as const;
export const HIRE_EVIDENCE_TYPES = ["candidate_message", "company_announcement", "profile_change", "third_party", "other"] as const;
export const HIRE_CONTEST_REASONS = ["not_hired", "outside_window", "different_person", "not_this_client"] as const;
export const HIRE_EVIDENCE_KINDS = ["hire_report", "hire_contest", "hire_rebuttal", "auth_request", "auth_evidence"] as const;
export type HireEvidenceKind = (typeof HIRE_EVIDENCE_KINDS)[number];
export const HIRE_EVIDENCE_MIME = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" } as const;
export const HIRE_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

const isoDate = z.iso.date();
const on = z.string().optional().transform((v) => v === "on" || v === "true");
const fileIds = z.array(z.uuid()).max(5).default([]);
const statement = z.string().trim().min(20, msg("referrals.hireReport.validation.statement")).max(2000, msg("referrals.hireReport.validation.statement"));

/** Today in America/Toronto (YYYY-MM-DD), the calendar the RPCs use. */
export const todayEt = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());

/** One dated evidence item (BR-18): type, item date ≤ today, optional capture date (≥ item date, ≤ today) and https link. */
export const hireItemSchema = z
  .object({
    type: z.enum(HIRE_EVIDENCE_TYPES),
    itemDate: isoDate,
    capturedOn: z.union([isoDate, z.literal("")]).optional().transform((v) => v || null),
    url: z.string().trim().max(2000).optional().transform((v) => v || null),
    backsTail: z.boolean().optional().default(false),
  })
  .superRefine((v, ctx) => {
    const today = todayEt();
    if (v.itemDate > today) ctx.addIssue({ code: "custom", path: ["itemDate"], message: msg("referrals.hireReport.validation.itemDate") });
    if (v.capturedOn && (v.capturedOn < v.itemDate || v.capturedOn > today)) {
      ctx.addIssue({ code: "custom", path: ["capturedOn"], message: msg("referrals.hireReport.validation.capturedBefore") });
    }
    if (v.url && !/^https:\/\//.test(v.url)) ctx.addIssue({ code: "custom", path: ["url"], message: msg("referrals.hireReport.validation.link") });
  });
export type HireItem = z.infer<typeof hireItemSchema>;

/** `items` is posted as a JSON array string. */
const itemsJson = (min: number) =>
  z
    .string()
    .optional()
    .transform((s, ctx) => {
      try {
        const v = JSON.parse(s || "[]");
        if (!Array.isArray(v)) throw new Error();
        return v as unknown[];
      } catch {
        ctx.addIssue({ code: "custom", message: msg("referrals.hireReport.validation.itemDate") });
        return z.NEVER;
      }
    })
    .pipe(z.array(hireItemSchema).min(min, msg("referrals.hireReport.validation.itemDate")).max(5));

/**
 * File a hire report (BR-18). FormData: referralId, employer, startMonth ("YYYY-MM"), role, learnedVia, statement,
 * tailStatement ("on"), items (JSON array of HireItem), fileIds (repeated), attestation ("on").
 */
export const fileHireReportSchema = z.object({
  referralId: z.uuid(),
  employer: z.string().trim().min(1, msg("referrals.hireReport.validation.employer")).max(200, msg("referrals.hireReport.validation.employer")),
  startMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, msg("referrals.hireReport.validation.startMonth")),
  role: z.string().trim().max(120).optional().transform((v) => v || null),
  learnedVia: z.enum(HIRE_LEARNED_VIA),
  statement,
  tailStatement: on,
  items: itemsJson(1),
  fileIds,
  attestation: z.literal("on"),
});

/** Contest (BR-25). FormData: reportId, reason, statement, offerAcceptedOn, processStartedOn (outside_window), fileIds, attestation. */
export const contestHireReportSchema = z
  .object({
    reportId: z.uuid(),
    reason: z.enum(HIRE_CONTEST_REASONS),
    statement,
    offerAcceptedOn: z.union([isoDate, z.literal("")]).optional().transform((v) => v || null),
    processStartedOn: z.union([isoDate, z.literal("")]).optional().transform((v) => v || null),
    fileIds,
    attestation: z.literal("on"),
  })
  .superRefine((v, ctx) => {
    if (v.reason !== "outside_window") return;
    if (!v.offerAcceptedOn || !v.processStartedOn || v.processStartedOn > v.offerAcceptedOn || v.offerAcceptedOn > todayEt()) {
      ctx.addIssue({ code: "custom", path: ["offerAcceptedOn"], message: msg("referrals.hireContest.validation.dates") });
    }
  });

/** Rebuttal (BR-26). FormData: reportId, statement, items (JSON, 0–5), fileIds, attestation. */
export const rebutHireReportSchema = z.object({ reportId: z.uuid(), statement, items: itemsJson(0), fileIds, attestation: z.literal("on") });

/** The hiring side's authorization-check request in a dispute (BR-37). FormData: referralId, reason, fileIds. */
export const requestAuthCheckSchema = z.object({ referralId: z.uuid(), reason: statement, fileIds });

/** The sourcing side's right-to-represent evidence (BR-37). FormData: checkId, statement, fileIds (1–5), attestation. */
export const authEvidenceSchema = z.object({ checkId: z.uuid(), statement, fileIds: z.array(z.uuid()).min(1).max(5), attestation: z.literal("on") });

/** Converts form items to the RPC's JSON shape. */
export const itemsToRpc = (items: HireItem[]) =>
  items.map((i) => ({ type: i.type, item_date: i.itemDate, captured_on: i.capturedOn, url: i.url, backs_tail: i.backsTail }));
