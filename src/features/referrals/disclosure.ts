export const DISCLOSURE_FIELDS = [
  { key: "headline", label: "Headline", identifying: false, default: true },
  { key: "summary", label: "Professional summary", identifying: false, default: true },
  { key: "skills", label: "Skills", identifying: false, default: true },
  { key: "seniority", label: "Seniority & years of experience", identifying: false, default: true },
  { key: "experience", label: "Work history (titles, companies, dates)", identifying: true, default: false },
  { key: "languages", label: "Working languages", identifying: false, default: true },
  { key: "work_arrangements", label: "Work arrangement preferences", identifying: false, default: true },
  { key: "location", label: "City / region", identifying: false, default: true },
  { key: "availability", label: "Availability date", identifying: false, default: true },
  { key: "salary_expectation", label: "Salary expectation", identifying: false, default: false },
  { key: "full_name", label: "Full name", identifying: true, default: false },
  { key: "email", label: "Email", identifying: true, default: false },
  { key: "phone", label: "Phone", identifying: true, default: false },
] as const;

export type DisclosureKey = (typeof DISCLOSURE_FIELDS)[number]["key"];
export const DISCLOSURE_KEYS = DISCLOSURE_FIELDS.map((f) => f.key) as [DisclosureKey, ...DisclosureKey[]];
