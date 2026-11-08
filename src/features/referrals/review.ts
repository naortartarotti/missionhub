/**
 * Job-owner review queue: buckets, decline reasons and the pure "candidate × job" checks.
 * Plain module (no "use client"), so server pages and client components can both import it.
 */
import type { StoredEvidence } from "@/features/matching/evidence";

/** Reason codes stored on a declined referral. Labels live in `referrals.declineReasons.<code>`. */
export const DECLINE_REASONS = ["skills", "seniority", "salary", "location", "availability", "duplicate", "position_filled", "other"] as const;
export type DeclineReason = (typeof DECLINE_REASONS)[number];
export const isDeclineReason = (v: unknown): v is DeclineReason => (DECLINE_REASONS as readonly unknown[]).includes(v);

/** Queue tabs. Labels live in `referrals.queue.buckets.<key>`. */
export const BUCKETS = {
  review: ["submitted", "under_review", "info_requested"],
  active: ["accepted", "interviewing", "offer"],
  closed: ["hired", "declined", "rejected", "withdrawn", "cancelled"],
} as const;
export type Bucket = keyof typeof BUCKETS;
export const BUCKET_KEYS = Object.keys(BUCKETS) as Bucket[];

export const QUEUE_SORTS = ["fit", "oldest", "newest"] as const;
export type QueueSort = (typeof QUEUE_SORTS)[number];

export const PAGE_SIZE = 25;

/** Statuses where the job owner can still accept / decline / ask for info. */
export const DECIDABLE = new Set(["submitted", "under_review"]);
export const PENDING = new Set<string>(BUCKETS.review);

/** Waiting-time tone: amber after 3 days, red after 7. */
export function waitTone(submittedAt: string, now = Date.now()): "ok" | "warn" | "late" {
  const days = (now - new Date(submittedAt).getTime()) / 86_400_000;
  return days >= 7 ? "late" : days >= 3 ? "warn" : "ok";
}

export type Snapshot = Partial<{
  full_name: string;
  email: string;
  phone: string;
  headline: string;
  summary: string;
  location: string;
  open_to_relocation: boolean;
  seniority: string;
  years_experience: number;
  skills: string[];
  languages: string[];
  work_arrangements: string[];
  salary_expectation_min: number | null;
  salary_expectation_max: number | null;
  salary_currency: string | null;
  available_from: string | null;
  experience: { title: string; company: string | null; start_date: string | null; end_date: string | null; description: string | null }[];
}>;

export type JobRequirements = {
  required_skills: string[];
  preferred_skills: string[];
  seniority: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
};

export type FitEvidence = { reasons: StoredEvidence[]; gaps: StoredEvidence[] };

const norm = (s: string) => s.trim().toLowerCase();

/** Required skills split into has / missing, using only what the partner disclosed. */
export function skillCoverage(snap: Snapshot | null, job: Pick<JobRequirements, "required_skills" | "preferred_skills">) {
  if (!snap?.skills) return null;
  const have = new Set(snap.skills.map(norm));
  return {
    has: job.required_skills.filter((s) => have.has(norm(s))),
    missing: job.required_skills.filter((s) => !have.has(norm(s))),
    bonus: job.preferred_skills.filter((s) => have.has(norm(s))),
  };
}

/** Salary expectation vs the job band. `null` when either side is unknown or currencies differ. */
export function salaryFit(snap: Snapshot | null, job: Pick<JobRequirements, "salary_min" | "salary_max" | "salary_currency">): "fits" | "above" | null {
  if (!snap || snap.salary_currency === undefined) return null;
  const ask = snap.salary_expectation_min ?? snap.salary_expectation_max;
  if (ask == null || job.salary_max == null || snap.salary_currency !== job.salary_currency) return null;
  return ask <= job.salary_max ? "fits" : "above";
}
