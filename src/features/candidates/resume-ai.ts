import "server-only";
import { z } from "zod";
import { normalizeSkills } from "@/features/matching/domain/skills";
import { findSkills } from "@/features/jobs/import/vocab";
import { cleanText } from "@/features/jobs/import/extract";
import { structured, untrusted, UNTRUSTED_RULES, type AiFile } from "@/server/integrations/openai";
import { ARRANGEMENT_VALUES, SENIORITY_VALUES } from "./schemas";

/** Form fields a resume can seed. Strings, like the form's own defaults. */
export type ResumeDraft = Partial<{
  fullName: string;
  email: string;
  phone: string;
  headline: string;
  summary: string;
  locationCity: string;
  locationRegion: string;
  locationCountry: string;
  workArrangements: string[];
  seniority: string;
  yearsExperience: string;
  skills: string;
  languages: string;
  source: string;
}>;

const aiResumeSchema = z.object({
  fullName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  headline: z.string().nullable(),
  summary: z.string().nullable(),
  locationCity: z.string().nullable(),
  locationRegion: z.string().nullable(),
  locationCountry: z.string().nullable(),
  workArrangements: z.array(z.enum(ARRANGEMENT_VALUES)),
  seniority: z.enum(SENIORITY_VALUES).nullable(),
  yearsExperience: z.number().nullable(),
  skills: z.array(z.string()),
  languages: z.array(z.string()),
});

const SYSTEM = `You read resumes / CVs for a recruiting platform and fill the candidate's profile form.
${UNTRUSTED_RULES}

Field rules:
- fullName, email, phone: exactly as written. phone keeps the international prefix if present.
- headline: current or most recent role in a short line, e.g. "Senior Backend Engineer · Fintech". Max 120 chars.
- summary: 2–4 factual sentences about experience and strengths, in the resume's language. No praise, no adjectives
  the resume doesn't support. Never mention age, gender, nationality, religion, marital status, health or photo.
- location*: where the candidate lives now. locationCountry: ISO 3166-1 alpha-2. locationRegion: province/state code when it has one.
- workArrangements: only if the resume states a preference (remote / hybrid / onsite). Otherwise [].
- seniority: intern | junior | mid | senior | lead | principal | executive, from the most recent role's title and scope.
- yearsExperience: total professional years, computed from the dated roles (overlaps counted once, round down,
  internships count half). null if roles have no dates.
- skills: concrete, matchable skills, tools, technologies, methods and certifications the resume shows,
  lowercase short canonical names ("typescript", "react", "postgresql", "aws", "financial modeling", "cpa"). No soft skills. Max 40, most relevant first.
- languages: spoken languages, lowercase English names ("english", "french", "portuguese").`;

const clip = (s: string | null, max: number) => {
  const v = s?.trim();
  return v ? v.slice(0, max) : undefined;
};

export async function extractResumeWithAi(input: { text?: string; file?: AiFile }): Promise<ResumeDraft> {
  const r = await structured({
    task: "resume.extract",
    system: SYSTEM,
    user: input.text ? untrusted("Resume", input.text) : "The resume is the attached PDF.",
    schema: aiResumeSchema,
    schemaName: "candidate_profile",
    files: input.file ? [input.file] : undefined,
    timeoutMs: 90_000,
  });
  const email = r.email?.trim().toLowerCase();
  const country = r.locationCountry?.trim().toUpperCase();
  const years = r.yearsExperience;
  return {
    fullName: clip(r.fullName, 160),
    email: email && z.email().safeParse(email).success ? email : undefined,
    phone: clip(r.phone, 40),
    headline: clip(r.headline, 200),
    summary: clip(r.summary, 5000),
    locationCity: clip(r.locationCity, 100),
    locationRegion: clip(r.locationRegion, 100),
    locationCountry: country && /^[A-Z]{2}$/.test(country) ? country : undefined,
    workArrangements: r.workArrangements.length ? [...new Set(r.workArrangements)] : undefined,
    seniority: r.seniority ?? undefined,
    yearsExperience: years !== null && years >= 0 && years <= 70 ? String(Math.floor(years)) : undefined,
    skills: normalizeSkills(r.skills.map((s) => s.slice(0, 60))).slice(0, 60).join(", ") || undefined,
    languages: normalizeSkills(r.languages).slice(0, 10).join(", ") || undefined,
    source: "resume_upload",
  };
}

/** No-AI floor: contact details and literally-mentioned skills only. */
export function extractResumeRuleBased(raw: string): ResumeDraft {
  const text = cleanText(raw);
  const email = text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0]?.toLowerCase();
  const phone = text.match(/(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,3}\)[\s.-]?)?\d{2,5}[\s.-]?\d{3,5}[\s.-]?\d{3,5}/)?.[0];
  const firstLine = text.split("\n").find((l) => l.trim().length > 2);
  const looksLikeName = firstLine && firstLine.length <= 60 && /^[\p{Lu}][\p{L}'’.-]+(?:\s+[\p{L}'’.-]+){1,4}$/u.test(firstLine.trim());
  return {
    fullName: looksLikeName ? firstLine.trim() : undefined,
    email: email && z.email().safeParse(email).success ? email : undefined,
    phone: phone?.trim(),
    skills: findSkills(text.toLowerCase()).join(", ") || undefined,
    source: "resume_upload",
  };
}
