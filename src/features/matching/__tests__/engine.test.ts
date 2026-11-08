import { describe, expect, it } from "vitest";
import { evaluateMatch, toMatchCandidate, toMatchJob, type MatchCandidate, type MatchJob } from "../domain/engine";

const candidate = (over: Partial<MatchCandidate> = {}): MatchCandidate => ({
  skills: ["typescript", "react", "node.js", "postgresql", "aws"],
  seniority: "senior",
  yearsExperience: 7,
  workArrangements: ["remote", "hybrid"],
  country: "CA",
  region: "ON",
  openToRelocation: false,
  languages: ["english", "french"],
  salaryMin: 13_000_000,
  salaryCurrency: "CAD",
  isActive: true,
  hasProcessingAuthorization: true,
  ...over,
});

const job = (over: Partial<MatchJob> = {}): MatchJob => ({
  requiredSkills: ["typescript", "react", "postgresql"],
  preferredSkills: ["aws", "graphql"],
  seniority: "senior",
  minYearsExperience: 5,
  workArrangement: "hybrid",
  country: "CA",
  region: "ON",
  languages: ["english"],
  salaryMax: 15_000_000,
  salaryCurrency: "CAD",
  isOpenForReferrals: true,
  ...over,
});

describe("evaluateMatch", () => {
  it("scores a well-aligned pair as a strong match with grounded reasons", () => {
    const r = evaluateMatch(candidate(), job());
    expect(r.band).toBe("strong");
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.reasons.map((x) => x.label).join(" ")).toContain("typescript");
    expect(r.blockers).toHaveLength(0);
  });

  it("reports missing required skills as gaps without inventing them", () => {
    const r = evaluateMatch(candidate({ skills: ["typescript"] }), job());
    expect(r.gaps.some((g) => g.label.includes("postgresql") && g.label.includes("react"))).toBe(true);
    expect(r.reasons.some((x) => x.label.includes("react"))).toBe(false);
  });

  it("is not eligible when no required skill matches", () => {
    const r = evaluateMatch(candidate({ skills: ["cobol"] }), job());
    expect(r.band).toBe("not_eligible");
    expect(r.blockers.some((b) => b.factor === "skills")).toBe(true);
  });

  it("blocks inactive candidates, missing authorization and closed jobs", () => {
    expect(evaluateMatch(candidate({ isActive: false }), job()).band).toBe("not_eligible");
    expect(evaluateMatch(candidate({ hasProcessingAuthorization: false }), job()).band).toBe("not_eligible");
    expect(evaluateMatch(candidate(), job({ isOpenForReferrals: false })).band).toBe("not_eligible");
  });

  it("respects explicit work-arrangement preferences and relocation", () => {
    const onsite = evaluateMatch(candidate({ workArrangements: ["remote"] }), job({ workArrangement: "onsite" }));
    expect(onsite.eligible).toBe(false);
    const abroad = evaluateMatch(candidate({ country: "US" }), job());
    expect(abroad.eligible).toBe(false);
    const relocate = evaluateMatch(candidate({ country: "US", openToRelocation: true }), job());
    expect(relocate.eligible).toBe(true);
  });

  it("scores are bounded 0..100 and deterministic", () => {
    const a = evaluateMatch(candidate(), job());
    const b = evaluateMatch(candidate(), job());
    expect(a).toEqual(b);
    expect(a.score).toBeLessThanOrEqual(100);
  });
});

describe("protected-feature exclusion", () => {
  const baseRow = {
    status: "active_for_matching",
    skills: ["TypeScript", "React", "postgres"],
    seniority: "senior",
    years_experience: "7.0",
    work_arrangements: ["hybrid"],
    location_country: "CA",
    location_region: "ON",
    open_to_relocation: false,
    languages: ["English"],
    salary_expectation_min: 12_000_000,
    salary_currency: "CAD",
  };

  it("ignores names, contact details, notes and any other identifying fields", () => {
    const jobInput = toMatchJob({
      status: "active",
      accepts_external_referrals: true,
      required_skills: ["typescript", "react", "postgresql"],
      preferred_skills: [],
      seniority: "senior",
      min_years_experience: 5,
      work_arrangement: "hybrid",
      location_country: "CA",
      location_region: "ON",
      languages: ["english"],
      salary_max: 15_000_000,
      salary_currency: "CAD",
    });
    const a = toMatchCandidate({ ...baseRow, full_name: "Alex Kim", email: "a@x.ca", gender: "f", date_of_birth: "1970-01-01" }, true);
    const b = toMatchCandidate({ ...baseRow, full_name: "Jordan Silva", email: "j@y.ca", gender: "m", date_of_birth: "2001-01-01", photo_url: "x" }, true);
    expect(a).toEqual(b);
    expect(Object.keys(a)).not.toEqual(expect.arrayContaining(["fullName", "email", "gender", "dateOfBirth"]));
    expect(evaluateMatch(a, jobInput)).toEqual(evaluateMatch(b, jobInput));
  });

  it("normalizes skill synonyms before comparing", () => {
    const c = toMatchCandidate(baseRow, true);
    expect(c.skills).toContain("postgresql");
    expect(c.skills).toContain("typescript");
  });
});
