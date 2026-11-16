import type { OrgRestriction, OrgRulesState } from "@/server/auth/context";
import type { ReporterStatus, SanctionStatus } from "./types";

/**
 * Pure UI decisions for N10, derived only from the server's state (EC-7: the client never computes
 * a restriction). Unit-tested in __tests__/ui-state.test.ts.
 */

export type BannerKind = "settlement_suspended" | "settlement_terminated" | "hold" | "rules_org" | "rules_user" | "notice";

type BannerInput = {
  restriction: OrgRestriction | null;
  settlementMode: boolean;
  settlementKind: "suspended" | "terminated" | null;
  rules: Pick<OrgRulesState, "gateRequired" | "userRestricted" | "upcoming" | "memberAcceptedUpcoming" | "orgAcceptedUpcoming">;
  isOrgAdmin: boolean;
};

/**
 * S3 precedence: B6 settlement > B2 hold > B3 rules (org) > B4 per user > B5 notice period. At most
 * two: the highest restriction banner plus B5; in settlement mode only B6 (BR-9 c). None behind the gate.
 */
export function selectBanners(s: BannerInput): BannerKind[] {
  if (s.rules.gateRequired) return [];
  if (s.settlementMode) return [s.settlementKind === "terminated" ? "settlement_terminated" : "settlement_suspended"];
  const out: BannerKind[] = [];
  if (s.restriction === "network_hold") out.push("hold");
  else if (s.restriction === "rules_not_accepted") out.push("rules_org");
  else if (s.rules.userRestricted) out.push("rules_user");
  if (noticeBannerApplies(s)) out.push("notice");
  return out;
}

/** B5: an upcoming version this member still has to accept (an org admin also until the org accepted). */
export function noticeBannerApplies(s: Pick<BannerInput, "rules" | "isOrgAdmin">): boolean {
  const up = s.rules.upcoming;
  if (!up || up.type === "non_material" || up.type === "initial") return false;
  if (!s.rules.memberAcceptedUpcoming) return true;
  return s.isOrgAdmin && !s.rules.orgAcceptedUpcoming?.at;
}

/**
 * Which statements the acceptance block shows (spec §2.2 table, N10-D18): everyone accepts personally;
 * an org admin of an org that hasn't accepted this version also accepts for the org, except in
 * settlement mode (personal statement only).
 */
export function acceptanceNeeds(opts: { isOrgAdmin: boolean; settlementMode: boolean; orgAccepted: boolean; memberAccepted: boolean }) {
  const org = opts.isOrgAdmin && !opts.settlementMode && !opts.orgAccepted;
  const personal = !opts.memberAccepted;
  return { personal: personal || org, org, done: !personal && !org };
}

export const REPORTER_STATUS_TONE: Record<ReporterStatus, "success" | "warning" | "danger" | "info" | "neutral"> = {
  received: "info",
  input_needed: "warning",
  in_review: "info",
  closed: "neutral",
  action_taken: "success",
  no_breach: "neutral",
  insufficient_evidence: "neutral",
};

/** Reporter pill label key (network.reports.*). The reporter never sees notice / response / finding / level. */
export function reporterStatusKey(status: ReporterStatus, isReporter: boolean) {
  switch (status) {
    case "received":
      return "status.received" as const;
    case "input_needed":
      // Only the reporting user sees "Your input needed"; an org admin reading it sees "Looking into it".
      return isReporter ? ("status.input" as const) : ("status.inReview" as const);
    case "in_review":
      return "status.inReview" as const;
    case "closed":
      return "outcome.closed" as const;
    case "action_taken":
      return "outcome.action" as const;
    case "no_breach":
      return "outcome.noBreach" as const;
    case "insufficient_evidence":
      return "outcome.notEnough" as const;
  }
}

export const isClosedReporterStatus = (s: ReporterStatus) => s === "closed" || s === "action_taken" || s === "no_breach" || s === "insufficient_evidence";

export const SANCTION_STATUS_TONE: Record<SanctionStatus, "success" | "warning" | "danger" | "info" | "neutral"> = {
  active: "warning",
  expired: "neutral",
  lifted: "neutral",
  reduced: "info",
  overturned: "info",
  superseded: "neutral",
};

/** labels.sanctionStatus has no "superseded": a superseded sanction reads as reduced on review / replaced. */
export function sanctionStatusKey(status: SanctionStatus): "active" | "expired" | "lifted" | "reduced" | "overturned" {
  return status === "superseded" ? "lifted" : status;
}

/** A support address is shown only when configured and plain (PD-025). */
export function cleanSupportEmail(email: string | null | undefined): string | null {
  return email && /^[^\s@<>"?&]+@[^\s@<>"?&]+$/.test(email) ? email : null;
}

/** True when the instant is still ahead (version "takes effect on" vs "in effect since"). */
export function isFutureInstant(iso: string | null | undefined, now: number = Date.now()): boolean {
  return !!iso && new Date(iso).getTime() > now;
}
