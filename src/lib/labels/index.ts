import type { Tone } from "@/components/shared/status-pill";
import type { Database } from "@/server/db/database.types";

/**
 * Visual metadata for database enums. The human-readable text lives in the i18n `labels`
 * namespace (`src/i18n/messages/<locale>/labels.json`), e.g. `tg(\`labels.jobStatus.${status}\`)`.
 */

type E = Database["public"]["Enums"];

export const CANDIDATE_STATUS: Record<E["candidate_status"], { tone: Tone }> = {
  draft: { tone: "neutral" },
  active_for_matching: { tone: "success" },
  unavailable: { tone: "warning" },
  archived: { tone: "neutral" },
  deleted: { tone: "danger" },
};

export const JOB_STATUS: Record<E["job_status"], { tone: Tone }> = {
  draft: { tone: "neutral" },
  active: { tone: "success" },
  paused: { tone: "warning" },
  closed: { tone: "neutral" },
  filled: { tone: "info" },
  cancelled: { tone: "danger" },
};

export const REFERRAL_STATUS: Record<E["referral_status"], { tone: Tone }> = {
  awaiting_candidate: { tone: "warning" },
  candidate_declined: { tone: "neutral" },
  submitted: { tone: "info" },
  under_review: { tone: "warning" },
  info_requested: { tone: "warning" },
  accepted: { tone: "success" },
  declined: { tone: "danger" },
  withdrawn: { tone: "neutral" },
  interviewing: { tone: "info" },
  offer: { tone: "info" },
  hired: { tone: "success" },
  rejected: { tone: "danger" },
  cancelled: { tone: "neutral" },
};

export const PLACEMENT_STATUS: Record<E["placement_status"], { tone: Tone }> = {
  hire_reported: { tone: "info" },
  invoiced: { tone: "warning" },
  payment_partially_verified: { tone: "warning" },
  commission_payable: { tone: "warning" },
  settled: { tone: "success" },
  disputed: { tone: "danger" },
  cancelled: { tone: "neutral" },
};

export const BAND: Record<E["match_band"], { tone: Tone }> = {
  strong: { tone: "success" },
  potential: { tone: "warning" },
  not_eligible: { tone: "neutral" },
};

// Enum value sets in display order (for selects). Labels: `labels.<name>.<value>`.
export const EVIDENCE_KIND: Record<E["evidence_kind"], true> = { client_payment: true, sourcing_payout: true, platform_remittance: true, client_refund: true };
export const SENIORITY: Record<E["seniority_level"], true> = { intern: true, junior: true, mid: true, senior: true, lead: true, principal: true, executive: true };
export const ARRANGEMENT: Record<E["work_arrangement"], true> = { remote: true, hybrid: true, onsite: true };
export const CONTRACT: Record<E["contract_type"], true> = { permanent: true, contract: true, temporary: true, contract_to_hire: true };
export const LEGAL_BASIS: Record<E["legal_basis"], true> = { consent: true, contract: true, legitimate_interest: true, other_documented: true };

export function isPast(iso: string | null | undefined): boolean {
  return Boolean(iso) && Date.parse(iso!) < Date.now();
}
