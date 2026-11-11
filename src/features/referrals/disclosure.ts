/** Fields a sourcing recruiter can disclose. Labels live in `referrals.disclosure.<key>`. */
export const DISCLOSURE_FIELDS = [
  { key: "headline", identifying: false, default: true },
  { key: "summary", identifying: false, default: true },
  { key: "skills", identifying: false, default: true },
  { key: "seniority", identifying: false, default: true },
  { key: "experience", identifying: true, default: false },
  { key: "languages", identifying: false, default: true },
  { key: "work_arrangements", identifying: false, default: true },
  { key: "location", identifying: false, default: true },
  { key: "availability", identifying: false, default: true },
  { key: "salary_expectation", identifying: false, default: false },
  { key: "mobility", identifying: false, default: false },
  { key: "full_name", identifying: true, default: false },
  { key: "email", identifying: true, default: false },
  { key: "phone", identifying: true, default: false },
] as const;

export type DisclosureKey = (typeof DISCLOSURE_FIELDS)[number]["key"];
export const DISCLOSURE_KEYS = DISCLOSURE_FIELDS.map((f) => f.key) as [DisclosureKey, ...DisclosureKey[]];
