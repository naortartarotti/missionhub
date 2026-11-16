import type { ConductCategory, ReporterSide, RulesLocale, SanctionLevel, VersionType } from "./domain";

/** Shapes returned by the N10 RPCs (snake_case as the database returns them). See backend.md. */

export type ConductFile = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  scan_status: "pending" | "clean" | "rejected";
  /** Platform admins only. */
  sha256?: string | null;
};

export type ReportContext = { reportedOrgName: string; side: ReporterSide; categories: ConductCategory[] };

export type ReporterStatus = "received" | "input_needed" | "in_review" | "closed" | "action_taken" | "no_breach" | "insufficient_evidence";

export type ConductReportListItem = {
  id: string;
  category: ConductCategory;
  created_at: string;
  reported_org_name: string;
  referral_id: string | null;
  source: "referral" | "job";
  status: ReporterStatus;
  is_mine: boolean;
  sent_by_name: string | null;
  sent_by_former: boolean;
};

export type ConductReport = {
  id: string;
  category: ConductCategory;
  description: string;
  occurred_on: string | null;
  occurred_approx: boolean;
  created_at: string;
  first_response_due_at: string;
  reported_org_name: string;
  source: "referral" | "job";
  referral_id: string | null;
  status: ReporterStatus;
  outcome: "closed" | "action_taken" | "no_breach" | "insufficient_evidence" | null;
  closed_reason_code: "no_rule" | "amount" | "duplicate" | "other" | null;
  closed_reason: string | null;
  closed_at: string | null;
  outcome_updated_at: string | null;
  files: { file_name: string; size_bytes: number }[];
  thread: { id: string; question: string; due_at: string | null; asked_at: string; reply: { body: string; at: string; files: { file_name: string; size_bytes: number }[] } | null }[];
  can_reply: boolean;
  open_question_id: string | null;
  is_mine: boolean;
  sent_by_name: string | null;
  sent_by_former: boolean;
};

export type SanctionStatus = "active" | "expired" | "lifted" | "reduced" | "overturned" | "superseded";

export type Standing = {
  level: SanctionLevel | null;
  since?: string;
  planned_review_on?: string | null;
  expires_at?: string | null;
  sanction_id?: string;
  /** A pre-N10 suspension (no sanction record, BR-29 / N10-D30). */
  legacy?: boolean;
};

export type NetworkStanding = {
  standing: Standing;
  restriction: string | null;
  rules_not_accepted: { version_id: string; label: string; effective_at: string } | null;
  open_notices: {
    case_id: string;
    notice_id: string;
    kind: "standard" | "immediate_hold";
    rules_cited: string[];
    sent_at: string;
    response_due_at: string;
    business_days_left: number;
    responded: boolean;
    open_followups: number;
  }[];
  history: {
    sanctions: { id: string; case_id: string; level: SanctionLevel; applied_at: string; expires_at: string | null; status: SanctionStatus; ended_at: string | null; planned_review_on: string | null; immediate: boolean }[];
    cases: { case_id: string; outcome: "no_breach" | "insufficient_evidence" | "breach"; level: SanctionLevel | null; decided_at: string; overturned_at: string | null; review_status: "requested" | "confirm" | "reduce" | "overturn" | null; can_request_review: boolean; review_request_due_at: string | null }[];
  };
  acceptances: { version_id: string; label: string; accepted_at: string; accepted_by_name: string | null; locale: RulesLocale }[];
  members_not_accepted: { user_id: string; name: string; accepted_current: boolean; accepted_upcoming: boolean }[];
  incident_notices: { id: string; sent_at: string; referral_count: number }[];
};

export type OrgCaseNotice = {
  id: string;
  kind: "standard" | "immediate_hold";
  language: RulesLocale;
  rules_version_label: string;
  rules_cited: { number: string; excerpt: string }[];
  conduct_date: string;
  allegation: string;
  alleged_when: string;
  evidence_summary: string;
  reporter_org_name: string | null;
  outcomes_line: string | null;
  immediate_ground: "2.3" | "4.8" | null;
  sent_at: string;
  response_due_at: string;
  business_days_left: number;
  can_respond: boolean;
  response: { body: string; submitted_at: string; author_name: string | null; files: { file_name: string; size_bytes: number }[] } | null;
  followups: { id: string; question: string; due_at: string | null; asked_at: string; reply_body: string | null; replied_at: string | null; reply_by_name: string | null; can_reply: boolean }[];
};

export type OrgCase = {
  id: string;
  status: string;
  notices: OrgCaseNotice[];
  decision: {
    outcome: "no_breach" | "insufficient_evidence" | "breach";
    finding: string | null;
    rules_cited: string[];
    residual_test: boolean;
    level: SanctionLevel | null;
    planned_review_on: string | null;
    decided_at: string;
    review_request_due_at: string | null;
    overturned_at: string | null;
    can_request_review: boolean;
    sanctions: { level: SanctionLevel; applied_at: string; expires_at: string | null; status: SanctionStatus; ended_at: string | null; planned_review_on: string | null }[];
    review: { requested_at: string; requested_by_name: string | null; outcome: "confirm" | "reduce" | "overturn" | null; new_level: string | null; reason: string | null; decided_at: string | null } | null;
  } | null;
  immediate_hold: { applied_at: string; status: SanctionStatus; ended_at: string | null } | null;
};

export type IncidentNotice = {
  id: string;
  sent_at: string;
  language: RulesLocale;
  information: string;
  occurred: string;
  to_whom: string | null;
  sides: ("source" | "target")[];
  guidance: { variant: "sourcing" | "hiring"; text: string }[];
  referrals: { id: string | null; job_title: string | null; candidate_label: string | null }[];
};

export type PartnerJobAvailability =
  | { status: "not_found" }
  | { status: "available" | "not_taking_referrals" | "no_longer_member"; org_name: string; job_title: string };

export type SettlementSummary = { referrals_in_progress: number; commissions_open: number; disputes_to_answer: number };

export type RulesVersionSummary = {
  id: string;
  label: string;
  type: VersionType;
  effective_on: string | null;
  effective_at: string;
  published_at: string;
  legal_reason: string | null;
};

export type RulesVersionText = {
  locale: RulesLocale;
  body: string;
  change_summary: string | null;
  sha256: string;
  rules: { number: string; excerpt: string }[];
  sections: { number: string; title: string }[];
};
