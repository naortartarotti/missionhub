import "server-only";
import type { RequestContext } from "@/server/auth/context";

/** N3 drop 2 (backend.md v2 §15): the referral's hire reports, shaped for the viewing side by `get_hire_reports`. */
export type HireReportStatus =
  | "awaiting_answer" | "unanswered" | "contested" | "in_review" | "confirmed" | "closed_by_record" | "deemed_confirmed" | "upheld" | "rejected" | "void";
export type HireItemView = { type: string; item_date: string; captured_on: string | null; backs_tail?: boolean; /** sourcing side only */ url?: string | null };
/** Own org: full (id for download, name, size, scan status); counterpart: n, upload time and SHA-256 only. */
export type HireFileView = { n: number; uploaded_at: string; sha256: string | null; id?: string; file_name?: string; mime_type?: string; size_bytes?: number; scan_status?: string };
export type HireReportView = {
  id: string;
  status: HireReportStatus;
  filed_at: string;
  /** Sourcing side only (the member who filed). */
  filed_by_name: string | null;
  source_org_name: string;
  employer_text: string;
  start_month: string;
  role_text: string | null;
  learned_via: string;
  tail_statement: boolean;
  statement: string;
  answer_due_at: string;
  answer_business_days_left: number | null;
  items: HireItemView[];
  files: HireFileView[];
  contest: null | {
    reason: "not_hired" | "outside_window" | "different_person" | "not_this_client";
    contested_at: string;
    offer_accepted_on: string | null;
    process_started_on: string | null;
    /** Null for the sourcing side on not_this_client (admin-only, BR-25). */
    statement: string | null;
    /** Hiring side only (own files); always [] for the sourcing side. */
    files: HireFileView[];
  };
  rebuttal_due_at: string | null;
  rebuttal_business_days_left: number | null;
  rebuttal: null | { statement: string; at: string; items: HireItemView[]; files: HireFileView[] };
  resolved_at: string | null;
  not_this_client: boolean;
  /** Null for the sourcing side when the finding was not_this_client. */
  resolution: string | null;
  placement_id: string | null;
  /** v2.1: the fee-details deadline of the placement this report established (deemed / upheld), or null. */
  fee_details_due_at: string | null;
  can_confirm: boolean;
  can_contest: boolean;
  can_rebut: boolean;
  auth_check_requested_at: string | null;
  can_request_auth_check: boolean;
};

/** Newest first; [] when none. Null when the viewer can't see the referral. */
export async function getHireReports(ctx: RequestContext, referralId: string): Promise<HireReportView[] | null> {
  const { data, error } = await ctx.db.rpc("get_hire_reports", { p_referral: referralId, p_acting_org: ctx.organizationId });
  if (error) {
    if (error.message?.startsWith("not_found")) return null;
    throw error;
  }
  return (data ?? []) as unknown as HireReportView[];
}
