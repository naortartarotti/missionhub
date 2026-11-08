/** Reason codes stored with a dismissal. Labels live in `opportunities.dismissReasons.<code>`. */
export const DISMISS_REASONS = ["salary", "location", "seniority", "skills", "candidate_not_interested", "other"] as const;

export type DismissReason = (typeof DISMISS_REASONS)[number];
export type TriageState = "saved" | "dismissed" | null;

const CLOSED_REFERRAL = ["declined", "withdrawn", "rejected", "cancelled"];
/** True while a referral for this match is still open (submitted and not closed). */
export const isSubmitted = (o: { referral_status: string | null }) => Boolean(o.referral_status && !CLOSED_REFERRAL.includes(o.referral_status));
