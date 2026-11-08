import type { Tone } from "@/components/shared/status-pill";
import type { Database } from "@/server/db/database.types";

type E = Database["public"]["Enums"];

export const CANDIDATE_STATUS: Record<E["candidate_status"], { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  active_for_matching: { label: "Active for matching", tone: "success" },
  unavailable: { label: "Unavailable", tone: "warning" },
  archived: { label: "Archived", tone: "neutral" },
  deleted: { label: "Deleted", tone: "danger" },
};

export const JOB_STATUS: Record<E["job_status"], { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  active: { label: "Active", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
  closed: { label: "Closed", tone: "neutral" },
  filled: { label: "Filled", tone: "info" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export const REFERRAL_STATUS: Record<E["referral_status"], { label: string; tone: Tone }> = {
  submitted: { label: "Submitted", tone: "info" },
  under_review: { label: "Under review", tone: "warning" },
  info_requested: { label: "Info requested", tone: "warning" },
  accepted: { label: "Accepted", tone: "success" },
  declined: { label: "Declined", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
  interviewing: { label: "Interviewing", tone: "info" },
  offer: { label: "Offer", tone: "info" },
  hired: { label: "Hired", tone: "success" },
  rejected: { label: "Not selected", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const PLACEMENT_STATUS: Record<E["placement_status"], { label: string; tone: Tone; description: string }> = {
  hire_reported: { label: "Hire reported", tone: "info", description: "Projected commission — not yet invoiced." },
  invoiced: { label: "Invoiced", tone: "warning", description: "Client invoiced; payment not yet verified." },
  payment_partially_verified: { label: "Partially paid", tone: "warning", description: "Part of the client payment is verified." },
  commission_payable: { label: "Commission payable", tone: "warning", description: "Client payment verified; shares are owed." },
  settled: { label: "Settled", tone: "success", description: "All obligations verified as paid." },
  disputed: { label: "Disputed", tone: "danger", description: "Frozen pending platform review." },
  cancelled: { label: "Cancelled", tone: "neutral", description: "Placement cancelled." },
};

export const EVIDENCE_KIND: Record<E["evidence_kind"], string> = {
  client_payment: "Client payment received",
  sourcing_payout: "Payout to sourcing recruiter",
  platform_remittance: "Platform share remittance",
  client_refund: "Refund to client",
};

export const BAND: Record<E["match_band"], { label: string; tone: Tone }> = {
  strong: { label: "Strong match", tone: "success" },
  potential: { label: "Potential match", tone: "warning" },
  not_eligible: { label: "Not eligible", tone: "neutral" },
};

export const SENIORITY: Record<E["seniority_level"], string> = {
  intern: "Intern",
  junior: "Junior",
  mid: "Mid-level",
  senior: "Senior",
  lead: "Lead",
  principal: "Principal",
  executive: "Executive",
};

export const ARRANGEMENT: Record<E["work_arrangement"], string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };
export const CONTRACT: Record<E["contract_type"], string> = {
  permanent: "Permanent",
  contract: "Contract",
  temporary: "Temporary",
  contract_to_hire: "Contract to hire",
};
export const LEGAL_BASIS: Record<E["legal_basis"], string> = {
  consent: "Consent",
  contract: "Contract / pre-contract",
  legitimate_interest: "Legitimate business purpose",
  other_documented: "Other (documented)",
};

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = (Date.now() - Date.parse(iso)) / 1000;
  const rtf = new Intl.RelativeTimeFormat("en-CA", { numeric: "auto" });
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [3600, "minute"],
    [86400, "hour"],
    [604800, "day"],
    [2629800, "week"],
    [31557600, "month"],
  ];
  for (let i = 0; i < steps.length; i++) {
    const [limit, unit] = steps[i];
    if (Math.abs(diff) < limit) {
      const div = i === 0 ? 1 : steps[i - 1][0];
      return rtf.format(-Math.round(diff / div), unit);
    }
  }
  return rtf.format(-Math.round(diff / 31557600), "year");
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" }).format(new Date(iso));
}

export function isPast(iso: string | null | undefined): boolean {
  return Boolean(iso) && Date.parse(iso!) < Date.now();
}
