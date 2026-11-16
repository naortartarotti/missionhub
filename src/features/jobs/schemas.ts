import { z } from "zod";
import { msg } from "@/i18n/translate";
import { normalizeSkills } from "@/features/matching/domain/skills";
import { SENIORITY_VALUES, ARRANGEMENT_VALUES } from "@/features/candidates/schemas";
import { parseMajorToMinor } from "@/lib/money/format";
import { clientKey } from "@/lib/client-key";
import {
  FEE_BASES,
  FLAT_FEE_CURRENCIES,
  GUARANTEE_DAYS,
  GUARANTEE_REMEDIES,
  OWNERSHIP_MONTHS_MAX,
  OWNERSHIP_MONTHS_MIN,
  PAYMENT_TERMS_MAX_DAYS,
  MAX_FEE_MINOR,
  SEARCH_TYPES,
  parseRateToBps,
  type TermsValues,
} from "@/lib/money/terms";

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
const optText = z.string().trim().max(40).optional().transform((v) => v || null);

/**
 * The job form, including the N2 terms card (T1–T9). The card is read only while
 * `acceptsExternalReferrals` is on; then it must be complete and the job permanent (BR-6, any status).
 * Output `terms` is in database units (bps, minor units) or null when the job isn't opened.
 *
 * Card fields (FormData names): feeBasis, feeRate (percent, ≤ 2 decimals), minimumFee (major units, salary
 * currency, optional, % bases), flatFee (major units), flatCurrency, searchType, guaranteeDays,
 * guaranteeRemedy (omitted when 0 days), paymentTermsDays, ownershipMonths, directClientAttested ("on").
 * Whether the attestation is required depends on the stored version, so the action checks it (BR-4).
 */
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
    travelRequirement: z.enum(["none", "occasional", "frequent"]).optional().or(z.literal("")).transform((v) => v || null),
    visaSponsorship: bool,
    relocationSupport: bool,
    contractType: z.enum(["permanent", "contract", "temporary", "contract_to_hire"]),
    salaryMin: optMoney,
    salaryMax: optMoney,
    salaryCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("CAD"),
    acceptsExternalReferrals: bool,
    shareDescription: bool,
    shareSalary: bool,
    shareLocation: bool,
    status: z.enum(["draft", "active"]).default("draft"),
    // N2 terms card (raw strings; validated below only when the job is opened to referrals)
    feeBasis: optText,
    feeRate: optText,
    minimumFee: optText,
    flatFee: optText,
    flatCurrency: optText,
    searchType: optText,
    guaranteeDays: optText,
    guaranteeRemedy: optText,
    paymentTermsDays: optText,
    ownershipMonths: optText,
    directClientAttested: bool,
  })
  .refine((v) => v.salaryMin === null || v.salaryMax === null || v.salaryMin <= v.salaryMax, { path: ["salaryMax"], message: msg("jobs.validation.salaryRange") })
  .refine((v) => v.clientConfidential || v.clientName, { path: ["clientName"], message: msg("jobs.validation.clientRequired") })
  .transform((v, ctx) => {
    const {
      feeBasis, feeRate, minimumFee, flatFee, flatCurrency, searchType, guaranteeDays, guaranteeRemedy, paymentTermsDays,
      ownershipMonths, directClientAttested, ...job
    } = v;
    if (!v.acceptsExternalReferrals) return { ...job, terms: null, attested: false };

    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    // N3 BR-1: a real client name (a client key) to open the job to partners, even with "Hide client" on.
    // Refused before anything is saved (drafts included); the database refuses it too.
    if (clientKey(v.clientName) === null) issue("clientName", msg("jobs.validation.clientRequiredForPartners"));
    if (v.contractType !== "permanent") issue("contractType", msg("jobs.validation.permanentForReferrals"));

    const basis = (FEE_BASES as readonly string[]).includes(feeBasis ?? "") ? (feeBasis as TermsValues["feeBasis"]) : null;
    if (!basis) issue("feeBasis", msg("jobs.errors.termsIncomplete"));

    let rateBps: number | null = null;
    let flatFeeMinor: number | null = null;
    let minFeeMinor: number | null = null;
    let currency = v.salaryCurrency;
    if (basis === "flat") {
      currency = (flatCurrency ?? "").toUpperCase();
      if (!(FLAT_FEE_CURRENCIES as readonly string[]).includes(currency)) issue("flatCurrency", msg("jobs.errors.termsIncomplete"));
      flatFeeMinor = flatFee ? parseMajorToMinor(flatFee, (FLAT_FEE_CURRENCIES as readonly string[]).includes(currency) ? currency : "CAD") : null;
      if (!flatFeeMinor || flatFeeMinor <= 0 || flatFeeMinor > MAX_FEE_MINOR) issue("flatFee", msg("jobs.validation.flatAmountRequired"));
      // AC-3 (QA-N2-03): a minimum fee exists on % bases only; refused, not dropped.
      if (minimumFee) issue("minimumFee", msg("jobs.errors.termsIncomplete"));
    } else if (basis) {
      rateBps = parseRateToBps(feeRate);
      if (rateBps === null) issue("feeRate", msg("jobs.validation.feeRateRange"));
      if (minimumFee) {
        minFeeMinor = parseMajorToMinor(minimumFee, v.salaryCurrency);
        if (!minFeeMinor || minFeeMinor <= 0 || minFeeMinor > MAX_FEE_MINOR) issue("minimumFee", msg("jobs.validation.minimumPositive"));
      }
    }

    const st = (SEARCH_TYPES as readonly string[]).includes(searchType ?? "") ? (searchType as TermsValues["searchType"]) : null;
    if (!st) issue("searchType", msg("jobs.errors.termsIncomplete"));

    const days = Number(guaranteeDays);
    const daysOk = guaranteeDays !== null && (GUARANTEE_DAYS as readonly number[]).includes(days);
    if (!daysOk) issue("guaranteeDays", msg("jobs.errors.termsIncomplete"));
    // AC-5 (QA-N2-03): no guarantee means no remedy; a posted remedy is refused, not dropped.
    if (daysOk && days === 0 && guaranteeRemedy) issue("guaranteeRemedy", msg("jobs.errors.termsIncomplete"));
    const remedy = days === 0 ? null : (GUARANTEE_REMEDIES as readonly string[]).includes(guaranteeRemedy ?? "") ? (guaranteeRemedy as TermsValues["guaranteeRemedy"]) : null;
    if (daysOk && days !== 0 && !remedy) issue("guaranteeRemedy", msg("jobs.validation.remedyRequired"));

    const payment = Number(paymentTermsDays);
    if (paymentTermsDays === null || !Number.isInteger(payment) || payment < 0 || payment > PAYMENT_TERMS_MAX_DAYS) {
      issue("paymentTermsDays", msg("jobs.validation.paymentDaysRange"));
    }
    const months = Number(ownershipMonths);
    if (ownershipMonths === null || !Number.isInteger(months) || months < OWNERSHIP_MONTHS_MIN || months > OWNERSHIP_MONTHS_MAX) {
      issue("ownershipMonths", msg("jobs.errors.termsIncomplete"));
    }

    const terms: TermsValues = {
      feeBasis: basis ?? "pct_base",
      rateBps,
      flatFeeMinor,
      minFeeMinor,
      currency,
      searchType: st ?? "contingent_shared",
      guaranteeDays: days,
      guaranteeRemedy: remedy,
      paymentTermsDays: payment,
      ownershipMonths: months,
    };
    return { ...job, terms, attested: directClientAttested };
  });

export type JobFormValues = z.infer<typeof jobFormSchema>;

export const jobStatusSchema = z.object({ jobId: z.uuid(), status: z.enum(["draft", "active", "paused", "closed", "filled", "cancelled"]) });
