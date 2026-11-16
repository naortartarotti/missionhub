/**
 * Owner nudge for referral-open jobs hidden from partners (BR-7, spec 2.2; N3 BR-1 adds (d) `no_client_name`). Only these four
 * `get_jobs_terms_state.hidden_reason` values nudge (N10 adds the two org restrictions, first), in this priority order (the backend returns
 * the first that applies). Other reasons (closed toggle, suspended org, not active) aren't "hidden".
 */
export const NUDGE_REASONS = ["network_hold", "rules_not_accepted", "no_terms", "not_permanent", "currency_mismatch", "no_client_name"] as const;
export type NudgeReason = (typeof NUDGE_REASONS)[number];

/**
 * N10 (§2.6 item 2, backend Q8): an org-level restriction comes first. It's the cause the owner can't
 * fix on the job, so a terms nudge would point to the wrong fix. Read from the caller's own context.
 */
export function restrictionReasonOf(restriction: string | null | undefined): Extract<NudgeReason, "network_hold" | "rules_not_accepted"> | null {
  return restriction === "network_hold" || restriction === "rules_not_accepted" ? restriction : null;
}

export function hiddenReasonOf(row: { partner_visible: boolean; hidden_reason: string | null } | null | undefined): NudgeReason | null {
  if (!row || row.partner_visible) return null;
  return (NUDGE_REASONS as readonly string[]).includes(row.hidden_reason ?? "") ? (row.hidden_reason as NudgeReason) : null;
}

/** Chip key per reason (jobs list). */
export const NUDGE_CHIP = {
  network_hold: "nudge.chipHold",
  rules_not_accepted: "nudge.chipRules",
  no_terms: "nudge.chipTerms",
  not_permanent: "nudge.chipPermanent",
  currency_mismatch: "nudge.chipCurrency",
  no_client_name: "nudge.chipClientName",
} as const satisfies Record<NudgeReason, string>;
