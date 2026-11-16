import "server-only";
import type { UserClient } from "@/server/supabase/server";

/** Evidence kinds a platform admin verifies (sourcing payouts are confirmed by the recruiter). */
export const ADMIN_EVIDENCE_KINDS = ["client_payment", "client_refund", "platform_remittance"] as const;

/** Counts behind the sidebar badges and the overview's "needs attention" list. */
export async function getAdminQueues(db: UserClient) {
  const [evidence, disputes, conduct] = await Promise.all([
    db.from("payment_evidence").select("id", { count: "exact", head: true }).eq("status", "pending").in("kind", [...ADMIN_EVIDENCE_KINDS]),
    db.from("disputes").select("id", { count: "exact", head: true }).eq("status", "open"),
    // N10 (AC-139): conduct cases live in app.conduct_* (no disputes row); open ones count in the same tile.
    db.rpc("admin_list_conduct_cases", { p_open_only: true }),
  ]);
  const conductOpen = Array.isArray(conduct.data) ? conduct.data.length : 0;
  return {
    evidence: evidence.count ?? 0,
    disputes: (disputes.count ?? 0) + conductOpen,
    conduct: conductOpen,
  };
}
export type AdminQueues = Awaited<ReturnType<typeof getAdminQueues>>;

/**
 * Makes free text safe to embed in a PostgREST `or=(…ilike…)` filter: drops the characters that
 * delimit filters or act as wildcards, and caps the length.
 */
export function searchTerm(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/[,()%*\\:"']/g, " ").trim().slice(0, 80) : "";
}

export const ADMIN_PAGE_SIZE = 25;

/** ISO timestamp `days` ago, for "new in the last N days" counts. */
export function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

// ---------------------------------------------------------------------------
// N1: prior-presentation disputes, metrics and abuse flags (platform admins; RPCs re-check).

type OrgRef = { id: string; name: string; locale: string | null };
export type AdminReferralCard = {
  referral_id: string;
  source_org: OrgRef;
  target_org: OrgRef;
  job_id: string;
  job_title: string;
  client_name: string | null;
  internal: boolean;
  status: string;
  delivered_at: string | null;
  claim_deadline_at: string | null;
  ownership_protected_until: string;
  released_at: string | null;
  void_reason: "released" | "prior_presentation_upheld" | "already_presented" | null;
  still_counts: boolean;
};
export type ReferralDispute = {
  dispute: { id: string; status: "open" | "resolved" | "rejected"; outcome: "claim_upheld" | "claim_rejected" | null; reason: string; resolution: string | null; created_at: string; resolved_at: string | null; resolve_by: string;
    /** Business days left before resolve_by, not counting today (0 = today); null once closed or passed. */
    resolve_by_business_days_left: number | null };
  claim: {
    id: string;
    status: "open" | "contested" | "upheld" | "rejected" | "final";
    filed_at: string;
    prior_process_date: string;
    evidence_kind: "file" | "referral";
    note: string | null;
    contest_deadline_at: string;
    contested_at: string | null;
    files: { id: string; file_name: string; mime_type: string; size_bytes: number; uploaded_at: string; sha256: string | null; scan_status: "pending" | "clean" | "rejected" }[];
  };
  claimed_referral: AdminReferralCard;
  evidence_referral: AdminReferralCard | null;
  same_client_key: boolean | null;
};

/** Full admin view of one prior-presentation dispute (no candidate name or label, PD-024). */
export async function getReferralDispute(db: UserClient, disputeId: string): Promise<ReferralDispute | null> {
  const { data, error } = await db.rpc("get_referral_dispute", { p_dispute: disputeId });
  if (error) {
    if (error.message?.startsWith("not_found")) return null;
    throw error;
  }
  return data as unknown as ReferralDispute;
}

export type PresentationMetrics = Record<
  | "days" | "hits_job" | "hits_client" | "stops" | "sticky_stops" | "pending_warnings" | "identifier_refusals" | "closures"
  | "delivered" | "claims" | "contested" | "releases" | "withdrawals" | "open_referral_disputes" | "resolved_referral_disputes"
  | "resolved_within_5_business_days" | "claims_rejected" | "referral_open_jobs" | "referral_open_jobs_with_client_key"
  // N2 (AC-76): partner-visible jobs (complete current terms) and referral-open jobs hidden for missing terms
  | "partner_visible_jobs" | "referral_open_without_terms",
  number
>;

export async function getPresentationMetrics(db: UserClient, days = 30): Promise<PresentationMetrics> {
  const { data, error } = await db.rpc("presentation_admin_metrics", { p_days: days });
  if (error) throw error;
  return data as unknown as PresentationMetrics;
}

/** BR-29 flags: > 5 stops in 7 days (sourcing side) or ≥ 2 rejected claims in 90 days (hiring side). */
export async function getAbuseFlags(db: UserClient) {
  const { data, error } = await db.rpc("presentation_abuse_flags");
  if (error) throw error;
  return data ?? [];
}

export type StopLookup = {
  reference: string;
  created_at: string;
  outcome: "stop" | "sticky";
  scope: "job" | "client" | null;
  earlier_internal: boolean | null;
  audit_event_id: number | null;
  source_org: { id: string; name: string };
  target_org: { id: string; name: string };
  job_id: string | null;
  job_title: string | null;
  source_user_id: string | null;
};

/** Support: find a stop by the opaque reference the submitter quotes (m-5). Null when unknown. */
export async function getStopByReference(db: UserClient, reference: string): Promise<StopLookup | null> {
  const { data, error } = await db.rpc("get_stop_by_reference", { p_reference: reference });
  if (error) {
    if (error.message?.startsWith("not_found")) return null;
    throw error;
  }
  return data as unknown as StopLookup;
}

/** One version in an admin referral-terms history (job version = the snapshot; amendments carry admin-only notes). */
export type AdminTermsVersion = {
  id: string;
  kind: "job" | "amendment";
  version_no: number;
  created_at: string;
  created_by_name: string | null;
  fee_basis: "pct_base" | "pct_total_cash" | "flat";
  rate_bps: number | null;
  flat_fee_minor: number | null;
  min_fee_minor: number | null;
  currency: string;
  search_type: "contingent_exclusive" | "contingent_shared" | "retained";
  guarantee_days: number;
  guarantee_remedy: "replacement_only" | "replacement_then_prorata" | "prorata_refund" | "full_refund" | null;
  payment_terms_days: number;
  ownership_months: number;
  direct_client_attested_at: string;
  reason: string | null;
  hiring_request_reference: string | null;
  sourcing_request_reference: string | null;
};

export type AdminReferralTerms = {
  referral_id: string;
  job_title: string;
  candidate_label: string;
  hiring_org_id: string;
  hiring_org_name: string;
  sourcing_org_id: string;
  sourcing_org_name: string;
  status: string;
  delivered_at: string | null;
  /** As partners see it: the name, or the English placeholder "Confidential client" (localize in the UI). */
  client_label: string;
  recorded: boolean;
  effective_terms_version_id: string | null;
  /** F-1: the job's current salary currency. */
  job_salary_currency: string | null;
  /**
   * F-1 (PD-062): the currency a % amendment is stored and parsed in: the effective terms' currency when they
   * are already %, else the job's salary currency. Null → a flat → % amendment is refused (terms_incomplete).
   */
  pct_amendment_currency: string | null;
  placement: { id: string; created_at: string } | null;
  rule: { name: string; version: number; sourcing_bps: number; job_owner_bps: number; platform_bps: number; platform_basis: "collected" | "frozen" } | null;
  /** Snapshot first, then amendments oldest → newest. */
  history: AdminTermsVersion[];
};

/** N2 S10: /admin/referrals/[referralId]. Null when the id matches nothing (or the caller isn't a platform admin). */
export async function getAdminReferralTerms(db: UserClient, referralId: string): Promise<AdminReferralTerms | null> {
  const { data, error } = await db.rpc("admin_get_referral_terms", { p_referral: referralId });
  if (error) {
    if (error.message?.startsWith("not_found")) return null;
    throw error;
  }
  return data as unknown as AdminReferralTerms;
}

// ---------------------------------------------------------------------------------------------
// N3 (referral-claims-two-sided-hire, backend.md v1): hire record panel and admin tasks. Admin-only data
// (`late`, the admin note, notice state) never reaches either org.

export type AdminHireRecord = {
  id: string;
  referral_id: string;
  /** Placement, or recorded without a split (spec §2.14). */
  kind: "placement" | "no_split";
  record_kind: "placement" | "record_only_released" | "record_only_no_agreement";
  origin: "target_record" | "report_confirmed" | "report_deemed" | "report_upheld";
  prior_status: string;
  recorded_at: string;
  offer_accepted_on: string | null;
  start_date: string | null;
  hired_role_title: string | null;
  placement_id: string | null;
  late: boolean;
  admin_note: string | null;
  note_updated_at: string | null;
};

/** S21 Hire record panel on /admin/referrals/[referralId]. Null when there's no hire record (or not an admin). */
export async function getAdminHireRecord(db: UserClient, referralId: string): Promise<AdminHireRecord | null> {
  const { data, error } = await db.rpc("admin_get_hire_record", { p_referral: referralId });
  if (error) {
    if (error.message?.startsWith("not_found")) return null;
    throw error;
  }
  return (data as unknown as AdminHireRecord | null) ?? null;
}

export type AdminHireTask = {
  task: "late" | "fee_overdue";
  referral_id: string;
  placement_id: string | null;
  job_title: string;
  candidate_label: string;
  source_org_id: string;
  source_org_name: string;
  target_org_id: string;
  target_org_name: string;
  /** late: when the hire was recorded; fee_overdue: when the hire was established. */
  recorded_at: string;
  start_date: string | null;
  offer_accepted_on: string | null;
  fee_details_due_at: string | null;
  notice_sent_on: string | null;
  notice_note: string | null;
};

/** /admin/hire-reports section 3 (tasks): late hire records and overdue fee details (BR-13, BR-31, BR-40). */
export async function listAdminHireTasks(db: UserClient): Promise<AdminHireTask[]> {
  const { data, error } = await db.rpc("admin_list_hire_tasks");
  if (error) throw error;
  return (data ?? []) as AdminHireTask[];
}

// ---------------------------------------------------------------------------------------------
// N3 drop 2 (backend.md v2): hire-report queue, detail, HA-6 flag, authorization checks.

export type AdminHireReportRow = {
  row_kind: "report" | "auth_check";
  id: string;
  referral_id: string;
  /** decide: in_review / unanswered · waiting: awaiting_answer / contested / open auth checks · closed: last 20 */
  section: "decide" | "waiting" | "closed";
  status: string;
  source_org_id: string;
  source_org_name: string;
  target_org_id: string;
  target_org_name: string;
  job_title: string;
  candidate_label: string;
  filed_at: string;
  /** answer_due_at (awaiting), rebuttal_due_at (contested), decide_by (decide), evidence_due_at (auth check) */
  deadline: string | null;
  overdue: boolean;
  resolved_at: string | null;
  finding: string | null;
  source_suspended: boolean;
  target_suspended: boolean;
  /** v2.1: server business days left to `deadline` (null once passed or for closed rows). */
  deadline_business_days_left: number | null;
};

export async function listAdminHireReports(db: UserClient): Promise<AdminHireReportRow[]> {
  const { data, error } = await db.rpc("admin_list_hire_reports");
  if (error) throw error;
  return (data ?? []) as AdminHireReportRow[];
}

type AdminHireFile = { id: string; n: number; file_name: string; mime_type: string; size_bytes: number; uploaded_at: string; sha256: string | null; scan_status: string };
type AdminHireItem = { type: string; item_date: string; captured_on: string | null; url: string | null; backs_tail?: boolean };
type SamePerson = "match" | "no_match" | "not_available";
/** `admin_get_hire_report` payload (backend.md v2 §18, v2.1 §26). */
export type AdminHireReportDetail = {
  id: string;
  status: string;
  referral_id: string;
  job_title: string;
  candidate_label: string;
  source_org: { id: string; name: string; suspended: boolean };
  target_org: { id: string; name: string; suspended: boolean };
  client: { commit_key: string | null; delivery_key: string | null; job_client_name: string | null };
  delivered_at: string | null;
  window_end: string | null;
  tail_end: string | null;
  report_until: string | null;
  report_tail_until: string | null;
  legacy: boolean;
  status_history: { from: string | null; to: string; at: string }[];
  report: {
    filed_at: string; filed_by_name: string | null; employer_text: string; start_month: string; role_text: string | null;
    learned_via: string; statement: string; tail_statement: boolean; answer_due_at: string; items: AdminHireItem[]; files: AdminHireFile[];
  };
  answer: null | {
    reason: string; statement: string; offer_accepted_on: string | null; process_started_on: string | null; contested_at: string;
    attested_at: string | null; rebuttal_due_at: string | null; files: AdminHireFile[];
  };
  rebuttal: null | { statement: string; at: string; items: AdminHireItem[]; files: AdminHireFile[] };
  answer_business_days_left: number | null;
  rebuttal_business_days_left: number | null;
  decide_business_days_left: number | null;
  decide_by: string | null;
  overdue: boolean;
  resolved_at: string | null;
  resolution: string | null;
  finding: string | null;
  placement_id: string | null;
  signals: {
    same_person: { email: SamePerson; phone: SamePerson; linkedin: SamePerson };
    record_created_at: string | null;
    email_changed_at: string | null;
    source_rejected_90d: number;
    late: boolean | null;
    hire_record_note: string | null;
  };
  delivery_records: { recipient_user_id: string; status: string; status_at: string }[];
  admin: { candidate_contacts: number; client_confirmation: "not_requested" | "requested" | "provided" | "refused"; note: string | null };
  auth_check_request: null | { id: string; reason: string; requested_at: string; files: AdminHireFile[] };
  auth_check: null | { id: string; status: "open" | "valid" | "invalid"; evidence_due_at: string | null; evidence_at: string | null };
  can_decide: boolean;
  uphold_creates_placement: boolean;
};

/** S15 detail (`admin_get_hire_report`), or null for an unknown id / a non-admin. */
export async function getAdminHireReport(db: UserClient, reportId: string): Promise<AdminHireReportDetail | null> {
  const { data, error } = await db.rpc("admin_get_hire_report", { p_report: reportId });
  if (error) {
    if (error.message?.startsWith("not_found")) return null;
    throw error;
  }
  return data as unknown as AdminHireReportDetail;
}

/** HA-6 (BR-40): sourcing orgs with ≥ 2 rejected hire reports in 90 days. */
export async function listHireReportFlags(db: UserClient): Promise<{ organization_id: string; organization_name: string; rejected_90d: number }[]> {
  const { data, error } = await db.rpc("admin_hire_report_flags");
  if (error) throw error;
  return data ?? [];
}

/** `admin_get_authorization_checks` payload (backend.md v2 §19). */
export type AdminAuthorizationChecks = {
  recent_change_note: boolean;
  requests: { id: string; dispute_kind: "prior_presentation" | "hire_report"; reason: string; requested_at: string; files: AdminHireFile[] }[];
  checks: {
    id: string; status: "open" | "valid" | "invalid"; requested_by_kind: "submitter" | "candidate" | "hiring_side";
    challenger_evidence: boolean; recent_change_note: boolean; opened_at: string; evidence_due_at: string | null;
    evidence_statement: string | null; evidence_at: string | null; no_evidence_by_deadline: boolean; files: AdminHireFile[];
    decided_at: string | null; resolution: string | null; candidate_contacted: boolean;
  }[];
};

/** S16: the referral's authorization-check requests and checks (admin). */
export async function getAdminAuthorizationChecks(db: UserClient, referralId: string): Promise<AdminAuthorizationChecks | null> {
  const { data, error } = await db.rpc("admin_get_authorization_checks", { p_referral: referralId });
  if (error) {
    if (error.message?.startsWith("not_found")) return null;
    throw error;
  }
  return data as unknown as AdminAuthorizationChecks;
}
