import type { Tone } from "@/components/shared/status-pill";

/** Pure admin-queue helpers (S12/S13), kept out of the server components so they can be unit-tested. */

/** The admin state keys (admin.conduct.state.*); the RPC says `waiting_for_reporter`. */
export const conductStateKey = (state: string) =>
  (state === "waiting_for_reporter" ? "waiting_reporter" : state) as "new" | "waiting_reporter" | "notice_sent" | "response_received" | "window_closed" | "decided" | "review_requested" | "needs_second_admin" | "closed";

export const CONDUCT_STATE_TONE: Record<string, Tone> = {
  new: "warning",
  waiting_reporter: "info",
  notice_sent: "info",
  response_received: "warning",
  window_closed: "warning",
  decided: "success",
  review_requested: "warning",
  needs_second_admin: "danger",
  closed: "neutral",
};

/**
 * Weekdays from now to `iso` (no holiday calendar: the list RPC returns the instant only). Used only
 * for the "N business days left" hint on queue cards; the stored deadline itself comes from the DB.
 */
export function approxBusinessDaysLeft(iso: string, now = new Date()): number | null {
  const due = new Date(iso);
  if (due.getTime() < now.getTime()) return null;
  // Calendar days in Toronto (the deadlines are "11:59 p.m. ET"), weekdays only.
  const etDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const d = new Date(`${etDay(now)}T12:00:00Z`);
  const end = new Date(`${etDay(due)}T12:00:00Z`);
  let n = 0;
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) n++;
  }
  return n;
}

