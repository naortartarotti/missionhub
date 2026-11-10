import { normalizeSkills } from "./skills";

// v2: evidence carries i18n keys. Bumping the version changes every input hash, so all matches get re-scored.
export const MODEL_VERSION = "deterministic-v2";
/** Recorded instead when an AI-derived skill relation contributed to the score. */
export const MODEL_VERSION_AI = "deterministic-v2+ai-skills";
/** Credit for a requirement satisfied through a related skill rather than the exact one. */
export const RELATED_SKILL_CREDIT = 0.75;

/**
 * Requirement skill -> candidate skills that imply it (e.g. "react" -> ["next.js", "gatsby"]).
 * Derived from skill names only (AI-generated, cached globally); never from candidate data.
 */
export type SkillRelations = ReadonlyMap<string, readonly string[]>;

export const SENIORITY_LADDER = ["intern", "junior", "mid", "senior", "lead", "principal", "executive"] as const;
export type Seniority = (typeof SENIORITY_LADDER)[number];
export type WorkArrangement = "remote" | "hybrid" | "onsite";

/**
 * The ONLY candidate attributes the engine may see. Identity, contact details, photos, names,
 * gender, age, nationality, religion, disability and other protected characteristics are
 * structurally excluded: they are not part of this type and `toMatchCandidate` drops them.
 */
export type MatchCandidate = {
  skills: string[];
  seniority: Seniority | null;
  yearsExperience: number | null;
  workArrangements: WorkArrangement[];
  country: string | null;
  region: string | null;
  openToRelocation: boolean;
  languages: string[];
  salaryMin: number | null;
  salaryCurrency: string | null;
  isActive: boolean;
  hasProcessingAuthorization: boolean;
};

export type MatchJob = {
  requiredSkills: string[];
  preferredSkills: string[];
  seniority: Seniority | null;
  minYearsExperience: number | null;
  workArrangement: WorkArrangement;
  country: string | null;
  region: string | null;
  languages: string[];
  salaryMax: number | null;
  salaryCurrency: string | null;
  isOpenForReferrals: boolean;
};

/**
 * One reason / gap / blocker. `key` + `vars` let the UI render it in the viewer's language
 * (`opportunities.evidence.<key>`); `label` is the English text, kept as a fallback for rows
 * scored before keys existed. Enum-valued vars (seniority, arrangement) hold raw codes.
 */
export type Evidence = { factor: Factor; key: EvidenceKey; vars?: Record<string, string | number>; label: string };
export type EvidenceKey =
  | "matchingOff" | "permissionMissing" | "jobClosed" | "arrangementMismatch" | "relocationRequired"
  | "requiredSkillsMatched" | "relatedSkills" | "requiredSkillsMissing" | "noRequiredSkills" | "noRequiredSkillsPresent" | "preferredSkills"
  | "seniorityAligns" | "seniorityOneAbove" | "seniorityOneBelow" | "seniorityFar" | "seniorityUnknown"
  | "experienceMeets" | "experienceBelow" | "experienceUnknown"
  | "remoteCompatible" | "basedIn" | "relocationOpen" | "locationUnknown"
  | "speaks" | "languagesMissing" | "salaryFits" | "salaryAbove" | "currencyMismatch" | "belowThreshold";
export type Factor = "skills" | "preferred_skills" | "seniority" | "experience" | "location" | "languages" | "compensation" | "status";
export type Band = "strong" | "potential" | "not_eligible";

export type MatchResult = {
  score: number;
  band: Band;
  eligible: boolean;
  reasons: Evidence[];
  gaps: Evidence[];
  blockers: Evidence[];
  factorScores: Record<Exclude<Factor, "status">, number>;
  modelVersion: string;
};

export const WEIGHTS = {
  skills: 40,
  preferred_skills: 10,
  seniority: 15,
  experience: 10,
  location: 10,
  languages: 10,
  compensation: 5,
} as const;

export const STRONG_THRESHOLD = 75;
export const POTENTIAL_THRESHOLD = 45;

type CandidateRow = {
  status: string;
  skills: string[] | null;
  seniority: string | null;
  years_experience: number | string | null;
  work_arrangements: string[] | null;
  location_country: string | null;
  location_region: string | null;
  open_to_relocation: boolean | null;
  languages: string[] | null;
  salary_expectation_min: number | null;
  salary_currency: string | null;
  // Anything else on the row (full_name, email, phone, notes, …) is intentionally ignored.
  [key: string]: unknown;
};

export function toMatchCandidate(row: CandidateRow, hasProcessingAuthorization: boolean): MatchCandidate {
  return {
    skills: normalizeSkills(row.skills ?? []),
    seniority: (row.seniority as Seniority | null) ?? null,
    yearsExperience: row.years_experience === null || row.years_experience === undefined ? null : Number(row.years_experience),
    workArrangements: (row.work_arrangements ?? []) as WorkArrangement[],
    country: row.location_country ?? null,
    region: row.location_region ?? null,
    openToRelocation: Boolean(row.open_to_relocation),
    languages: normalizeSkills(row.languages ?? []),
    salaryMin: row.salary_expectation_min ?? null,
    salaryCurrency: row.salary_currency ?? null,
    isActive: row.status === "active_for_matching",
    hasProcessingAuthorization,
  };
}

type JobRow = {
  status: string;
  accepts_external_referrals: boolean;
  required_skills: string[] | null;
  preferred_skills: string[] | null;
  seniority: string | null;
  min_years_experience: number | string | null;
  work_arrangement: string;
  location_country: string | null;
  location_region: string | null;
  languages: string[] | null;
  salary_max: number | null;
  salary_currency: string | null;
  [key: string]: unknown;
};

export function toMatchJob(row: JobRow): MatchJob {
  return {
    requiredSkills: normalizeSkills(row.required_skills ?? []),
    preferredSkills: normalizeSkills(row.preferred_skills ?? []),
    seniority: (row.seniority as Seniority | null) ?? null,
    minYearsExperience:
      row.min_years_experience === null || row.min_years_experience === undefined ? null : Number(row.min_years_experience),
    workArrangement: row.work_arrangement as WorkArrangement,
    country: row.location_country ?? null,
    region: row.location_region ?? null,
    languages: normalizeSkills(row.languages ?? []),
    salaryMax: row.salary_max ?? null,
    salaryCurrency: row.salary_currency ?? null,
    isOpenForReferrals: row.status === "active" && row.accepts_external_referrals,
  };
}

const list = (xs: string[], max = 4) =>
  xs.length <= max ? xs.join(", ") : `${xs.slice(0, max).join(", ")} +${xs.length - max} more`;

/** For each requirement the candidate lacks exactly, the candidate skill that implies it (if any). */
export function relatedHits(c: MatchCandidate, skills: readonly string[], relations?: SkillRelations): Map<string, string> {
  const hits = new Map<string, string>();
  if (!relations?.size) return hits;
  for (const s of skills) {
    if (c.skills.includes(s)) continue;
    const via = relations.get(s)?.find((r) => c.skills.includes(r));
    if (via) hits.set(s, via);
  }
  return hits;
}

/** Two-stage evaluation: hard eligibility filters, then weighted deterministic ranking. */
export function evaluateMatch(c: MatchCandidate, j: MatchJob, relations?: SkillRelations): MatchResult {
  const reasons: Evidence[] = [];
  const gaps: Evidence[] = [];
  const blockers: Evidence[] = [];

  // ---- Stage 1: eligibility ----
  if (!c.isActive) blockers.push({ factor: "status", key: "matchingOff", label: "Matching is turned off for this candidate" });
  if (!c.hasProcessingAuthorization)
    blockers.push({ factor: "status", key: "permissionMissing", label: "The candidate's permission hasn't been recorded" });
  if (!j.isOpenForReferrals) blockers.push({ factor: "status", key: "jobClosed", label: "Job is not open to external referrals" });

  if (c.workArrangements.length > 0 && j.workArrangement !== "remote" && !c.workArrangements.includes(j.workArrangement)) {
    blockers.push({
      factor: "location",
      key: "arrangementMismatch",
      vars: { jobArrangement: j.workArrangement, candidateArrangements: c.workArrangements.join("/") },
      label: `Job is ${j.workArrangement}; candidate prefers ${c.workArrangements.join("/")}`,
    });
  }
  if (j.workArrangement !== "remote" && j.country && c.country && j.country !== c.country && !c.openToRelocation) {
    blockers.push({ factor: "location", key: "relocationRequired", vars: { country: j.country }, label: `Job requires presence in ${j.country}; candidate is not open to relocation` });
  }

  // ---- Stage 2: ranking ----
  const required = j.requiredSkills;
  const matchedRequired = required.filter((s) => c.skills.includes(s));
  const relatedRequired = relatedHits(c, required, relations);
  const missingRequired = required.filter((s) => !c.skills.includes(s) && !relatedRequired.has(s));
  const skillsScore =
    required.length === 0 ? 0.5 : (matchedRequired.length + RELATED_SKILL_CREDIT * relatedRequired.size) / required.length;
  if (matchedRequired.length) reasons.push({ factor: "skills", key: "requiredSkillsMatched", vars: { skills: list(matchedRequired) }, label: `Matches required skills: ${list(matchedRequired)}` });
  if (relatedRequired.size) {
    const pairs = list([...relatedRequired].map(([need, via]) => `${need} ← ${via}`));
    reasons.push({ factor: "skills", key: "relatedSkills", vars: { skills: pairs }, label: `Related experience: ${pairs}` });
  }
  if (missingRequired.length) gaps.push({ factor: "skills", key: "requiredSkillsMissing", vars: { skills: list(missingRequired) }, label: `Missing required skills: ${list(missingRequired)}` });
  if (required.length === 0) gaps.push({ factor: "skills", key: "noRequiredSkills", label: "Job lists no required skills; relevance is approximate" });
  if (required.length > 0 && matchedRequired.length === 0 && relatedRequired.size === 0) {
    blockers.push({ factor: "skills", key: "noRequiredSkillsPresent", label: "None of the job's required skills are present" });
  }

  const preferred = j.preferredSkills;
  const matchedPreferred = preferred.filter((s) => c.skills.includes(s));
  const relatedPreferred = relatedHits(c, preferred, relations);
  const preferredScore =
    preferred.length === 0 ? 1 : (matchedPreferred.length + RELATED_SKILL_CREDIT * relatedPreferred.size) / preferred.length;
  if (matchedPreferred.length) reasons.push({ factor: "preferred_skills", key: "preferredSkills", vars: { skills: list(matchedPreferred) }, label: `Also has: ${list(matchedPreferred)}` });

  let seniorityScore = 0.5;
  if (j.seniority && c.seniority) {
    const diff = SENIORITY_LADDER.indexOf(c.seniority) - SENIORITY_LADDER.indexOf(j.seniority);
    if (diff === 0) {
      seniorityScore = 1;
      reasons.push({ factor: "seniority", key: "seniorityAligns", vars: { jobSeniority: j.seniority }, label: `Seniority aligns (${j.seniority})` });
    } else if (Math.abs(diff) === 1) {
      seniorityScore = 0.6;
      gaps.push({ factor: "seniority", key: diff > 0 ? "seniorityOneAbove" : "seniorityOneBelow", vars: { candidateSeniority: c.seniority, jobSeniority: j.seniority }, label: `Seniority is one level ${diff > 0 ? "above" : "below"} the role (${c.seniority} vs ${j.seniority})` });
    } else {
      seniorityScore = 0;
      gaps.push({ factor: "seniority", key: "seniorityFar", vars: { candidateSeniority: c.seniority, jobSeniority: j.seniority }, label: `Seniority differs significantly (${c.seniority} vs ${j.seniority})` });
    }
  } else if (j.seniority) {
    gaps.push({ factor: "seniority", key: "seniorityUnknown", label: "Candidate seniority not recorded" });
  }

  let experienceScore = 0.5;
  if (j.minYearsExperience !== null && c.yearsExperience !== null) {
    if (c.yearsExperience >= j.minYearsExperience) {
      experienceScore = 1;
      reasons.push({ factor: "experience", key: "experienceMeets", vars: { years: c.yearsExperience, min: j.minYearsExperience }, label: `${c.yearsExperience} years of experience (role asks ${j.minYearsExperience}+)` });
    } else {
      experienceScore = Math.max(0, c.yearsExperience / j.minYearsExperience);
      gaps.push({ factor: "experience", key: "experienceBelow", vars: { years: c.yearsExperience, min: j.minYearsExperience }, label: `${c.yearsExperience} years of experience; role asks ${j.minYearsExperience}+` });
    }
  } else if (j.minYearsExperience !== null) {
    gaps.push({ factor: "experience", key: "experienceUnknown", label: "Years of experience not recorded" });
  }

  let locationScore = 0.5;
  if (j.workArrangement === "remote") {
    locationScore = c.workArrangements.length === 0 || c.workArrangements.includes("remote") ? 1 : 0.7;
    if (locationScore === 1) reasons.push({ factor: "location", key: "remoteCompatible", label: "Remote role compatible with candidate preferences" });
  } else if (j.country && c.country) {
    if (j.country === c.country) {
      locationScore = j.region && c.region && j.region === c.region ? 1 : 0.8;
      reasons.push({ factor: "location", key: "basedIn", vars: { place: [c.region, c.country].filter(Boolean).join(", ") }, label: `Based in ${[c.region, c.country].filter(Boolean).join(", ")}` });
    } else if (c.openToRelocation) {
      locationScore = 0.5;
      gaps.push({ factor: "location", key: "relocationOpen", label: "Would require relocation (candidate is open to it)" });
    } else {
      locationScore = 0;
    }
  } else {
    gaps.push({ factor: "location", key: "locationUnknown", label: "Location information incomplete" });
  }

  let languagesScore = 1;
  if (j.languages.length > 0) {
    const have = j.languages.filter((l) => c.languages.includes(l));
    languagesScore = have.length / j.languages.length;
    const missing = j.languages.filter((l) => !c.languages.includes(l));
    if (have.length) reasons.push({ factor: "languages", key: "speaks", vars: { languages: list(have) }, label: `Speaks ${list(have)}` });
    if (missing.length) gaps.push({ factor: "languages", key: "languagesMissing", vars: { languages: list(missing) }, label: `Language requirement not confirmed: ${list(missing)}` });
  }

  let compensationScore = 0.5;
  if (c.salaryMin !== null && j.salaryMax !== null && c.salaryCurrency && c.salaryCurrency === j.salaryCurrency) {
    if (c.salaryMin <= j.salaryMax) {
      compensationScore = 1;
      reasons.push({ factor: "compensation", key: "salaryFits", label: "Salary expectation fits the compensation band" });
    } else {
      const over = (c.salaryMin - j.salaryMax) / j.salaryMax;
      compensationScore = Math.max(0, 1 - over * 4);
      gaps.push({ factor: "compensation", key: "salaryAbove", vars: { percent: Math.round(over * 100) }, label: `Salary expectation is ~${Math.round(over * 100)}% above the band` });
    }
  } else if (c.salaryCurrency && j.salaryCurrency && c.salaryCurrency !== j.salaryCurrency) {
    gaps.push({ factor: "compensation", key: "currencyMismatch", label: "Compensation in different currencies; not compared" });
  }

  const factorScores = {
    skills: skillsScore,
    preferred_skills: preferredScore,
    seniority: seniorityScore,
    experience: experienceScore,
    location: locationScore,
    languages: languagesScore,
    compensation: compensationScore,
  };
  const raw = (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).reduce((sum, k) => sum + WEIGHTS[k] * factorScores[k], 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  const eligible = blockers.length === 0;
  const band: Band = !eligible ? "not_eligible" : score >= STRONG_THRESHOLD ? "strong" : score >= POTENTIAL_THRESHOLD ? "potential" : "not_eligible";
  if (eligible && band === "not_eligible") {
    gaps.push({ factor: "skills", key: "belowThreshold", vars: { threshold: POTENTIAL_THRESHOLD }, label: `Overall relevance below the ${POTENTIAL_THRESHOLD}/100 threshold` });
  }

  const usedAi = relatedRequired.size > 0 || relatedPreferred.size > 0;
  return { score, band, eligible, reasons, gaps, blockers, factorScores, modelVersion: usedAi ? MODEL_VERSION_AI : MODEL_VERSION };
}

/** Stable fingerprint of engine inputs so unchanged pairs are not rewritten. */
export function inputFingerprint(c: MatchCandidate, j: MatchJob, relations?: SkillRelations): string {
  const used = [...relatedHits(c, j.requiredSkills, relations), ...relatedHits(c, j.preferredSkills, relations)];
  return JSON.stringify(used.length ? [MODEL_VERSION, c, j, used] : [MODEL_VERSION, c, j]);
}
