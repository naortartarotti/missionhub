import "server-only";
import { z } from "zod";
import { normalizeSkills } from "@/features/matching/domain/skills";
import { SENIORITY_VALUES, ARRANGEMENT_VALUES } from "@/features/candidates/schemas";
import { structured, untrusted, UNTRUSTED_RULES, type AiFile } from "@/server/integrations/openai";
import { cleanText, SUPPORTED_CURRENCIES, type JobDraft } from "./extract";

/**
 * AI job-posting reader. Same contract as the rule-based extractor: only what the posting states,
 * nothing invented. Output is schema-constrained, re-validated, then mapped onto the form draft.
 */
const aiJobSchema = z.object({
  title: z.string().nullable(),
  companyName: z.string().nullable(),
  requiredSkills: z.array(z.string()),
  preferredSkills: z.array(z.string()),
  seniority: z.enum(SENIORITY_VALUES).nullable(),
  minYearsExperience: z.number().nullable(),
  workArrangement: z.enum(ARRANGEMENT_VALUES).nullable(),
  locationCity: z.string().nullable(),
  locationRegion: z.string().nullable(),
  locationCountry: z.string().nullable(),
  languages: z.array(z.string()),
  contractType: z.enum(["permanent", "contract", "temporary", "contract_to_hire"]).nullable(),
  salaryMin: z.number().nullable(),
  salaryMax: z.number().nullable(),
  salaryCurrency: z.string().nullable(),
  salaryPeriod: z.enum(["year", "month", "hour", "other"]).nullable(),
  /** The posting's own text, cleaned of navigation/boilerplate. Used when the source was a PDF. */
  descriptionText: z.string().nullable(),
});

const SYSTEM = `You read job postings for a recruiting platform and fill a structured form.
${UNTRUSTED_RULES}

Field rules:
- title: the job title only (no company, location or level suffixes like "| Remote").
- companyName: the hiring company, if named. Not the job board or recruiting agency.
- requiredSkills / preferredSkills: concrete, matchable skills, tools, technologies, methods or certifications
  (e.g. "typescript", "react", "postgresql", "aws", "financial modeling", "scrum", "cpa"). Lowercase, short canonical names,
  no soft skills ("communication", "teamwork"), no sentences. "Nice to have / bonus / a plus / diferencial / atout" go to preferred.
  At most 25 required and 15 preferred.
- seniority: intern | junior | mid | senior | lead | principal | executive, from the title or explicit level only.
- minYearsExperience: the minimum years explicitly asked.
- workArrangement: remote | hybrid | onsite, only if stated.
- locationCountry: ISO 3166-1 alpha-2 (CA, BR, US, FR…). locationRegion: province/state code when it has one (ON, QC, SP).
- languages: spoken languages required, lowercase English names ("english", "french", "portuguese"). "Bilingual" in Canada = english + french.
- contractType: permanent (full-time employee, CLT, CDI) | contract (freelance, PJ, contractor) | temporary (CDD, temp, internship) | contract_to_hire.
- salary: annual or monthly base pay only, as plain numbers in major units (120k => 120000). salaryPeriod says which.
  salaryCurrency: ISO 4217 (CAD, USD, EUR, GBP, BRL). Hourly or unclear pay => all salary fields null.
- descriptionText: the full posting text (responsibilities, requirements, benefits), in its original language, without
  navigation, cookie banners or "apply" buttons. Plain text with line breaks and "• " bullets. Max ~15000 characters.`;

export async function extractJobWithAi(input: { text?: string; file?: AiFile; pageTitle?: string | null }): Promise<{ draft: JobDraft; descriptionText: string | null }> {
  const parts: string[] = ["Extract the job posting."];
  if (input.pageTitle) parts.push(untrusted("Page title", input.pageTitle));
  if (input.text) parts.push(untrusted("Job posting", input.text));
  if (input.file) parts.push("The job posting is the attached PDF.");

  const r = await structured({
    task: "job.extract",
    system: SYSTEM,
    user: parts.join("\n\n"),
    schema: aiJobSchema,
    schemaName: "job_posting",
    files: input.file ? [input.file] : undefined,
    timeoutMs: 90_000,
  });
  return { draft: toDraft(r), descriptionText: r.descriptionText ? cleanText(r.descriptionText).slice(0, 20000) : null };
}

const clip = (s: string | null, max: number) => {
  const v = s?.trim();
  return v ? v.slice(0, max) : undefined;
};
const num = (n: number | null, max: number) => (n !== null && Number.isFinite(n) && n > 0 && n <= max ? String(Math.round(n)) : undefined);

function toDraft(r: z.output<typeof aiJobSchema>): JobDraft {
  const required = normalizeSkills(r.requiredSkills.map((s) => s.slice(0, 60))).slice(0, 40);
  const preferred = normalizeSkills(r.preferredSkills.map((s) => s.slice(0, 60)))
    .filter((s) => !required.includes(s))
    .slice(0, 40);
  const country = r.locationCountry?.trim().toUpperCase();
  const currency = r.salaryCurrency?.trim().toUpperCase();
  const salaryOk = r.salaryPeriod === "year" || r.salaryPeriod === "month";
  let min = salaryOk ? r.salaryMin : null;
  let max = salaryOk ? r.salaryMax : null;
  if (min !== null && max !== null && min > max) [min, max] = [max, min];

  return {
    title: clip(r.title, 160),
    clientName: clip(r.companyName, 160),
    requiredSkills: required.join(", ") || undefined,
    preferredSkills: preferred.join(", ") || undefined,
    seniority: r.seniority ?? undefined,
    minYearsExperience: num(r.minYearsExperience, 40),
    workArrangement: r.workArrangement ?? undefined,
    locationCity: clip(r.locationCity, 100),
    locationRegion: clip(r.locationRegion, 100),
    locationCountry: country && /^[A-Z]{2}$/.test(country) ? country : undefined,
    languages: normalizeSkills(r.languages).slice(0, 10).join(", ") || undefined,
    contractType: r.contractType ?? undefined,
    salaryMin: num(min, 100_000_000),
    salaryMax: num(max, 100_000_000),
    salaryCurrency: currency && (SUPPORTED_CURRENCIES as readonly string[]).includes(currency) ? currency : undefined,
  };
}
