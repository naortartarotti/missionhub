import type { FeeBasis } from "@/lib/money/terms";
import type { ReferralTerms } from "@/features/referrals/components/referral-terms";
/**
 * Hiring pipeline for accepted referrals. Plain module (no "use client"), shared by the page and the board.
 * The allowed moves are NOT defined here: they come from `referral_transitions` (actor_side = target),
 * the same table `transition_referral()` enforces.
 */

/** Board columns, left to right. Labels come from `labels.referralStatus.<status>`. */
export const PIPELINE_STAGES = ["accepted", "interviewing", "offer", "hired"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** Ends of the journey without a hire. They share the last column. */
export const PIPELINE_CLOSED = ["rejected", "cancelled", "withdrawn"] as const;

/**
 * Statuses moved to Hired by recording the hire (report_hire), not by a plain transition. N3 E2 (PD-075): the
 * drop opens the record-hire dialog from accepted, interviewing or offer; the server picks the variant.
 */
export const HIRE_FROM: readonly string[] = ["accepted", "interviewing", "offer"];

export type PipelineTransition = { from_status: string; to_status: string; requires_reason: boolean; requires_active_agreement: boolean };

export type PipelineCard = {
  id: string;
  status: string;
  version: number;
  jobId: string;
  jobTitle: string;
  /** Disclosed name when the partner shared it, otherwise the anonymous label. */
  candidateName: string;
  candidateLabel: string;
  partner: string | null;
  fitScore: number | null;
  /** When the referral entered its current status. */
  stageSince: string;
  /** Who on the hiring team accepted it: the person driving it through the pipeline. */
  owner: string | null;
  /** The current user may move this card (they accepted it, or its owner left the team). */
  canMove: boolean;
  agreementActive: boolean;
  placementId: string | null;
  /** N2: the referral's own fee terms (effective for hireable cards, else the snapshot); null = legacy. */
  feeTerms: { feeBasis: FeeBasis; rateBps: number | null; flatFeeMinor: number | null; currency: string } | null;
  /** `getReferralTerms` for cards in `offer` (the hire dialog's variant and currency). */
  hireTerms: ReferralTerms | null;
};
