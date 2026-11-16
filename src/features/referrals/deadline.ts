/**
 * Business-day deadlines (N1 objections and contests, shared with N4). The deadline instant comes
 * from the database, already frozen; the business days left are computed server-side with the
 * network holiday calendar (BR-17) and passed in as a number. Nothing here does date arithmetic.
 */
import type { Formatter } from "@/i18n/format";
import type { Translator } from "@/i18n/translate";

export type DeadlineState = "open" | "today" | "closed";

/** `left`: business days after today (0 = ends today); null once the deadline has passed (server clock). */
export function deadlineState(left: number | null): DeadlineState {
  if (left === null) return "closed";
  return left === 0 ? "today" : "open";
}

/** "Fri, Nov 20, 11:59 p.m. ET" (localized suffix). */
export const deadlineWhen = (t: Translator<"referrals">, f: Formatter, at: string) => t("deadline.at", { when: f.etDateTime(at) });

/** "2 business days left" / "Ends today" / "Closed {when} ET". */
export function deadlineLeft(t: Translator<"referrals">, f: Formatter, at: string, left: number | null): string {
  const s = deadlineState(left);
  if (s === "closed") return t("deadline.closed", { when: f.etDateTime(at) });
  return s === "today" ? t("deadline.endsToday") : t("deadline.left", { count: left ?? 0 });
}

/** Full line: "Fri, Nov 20, 11:59 p.m. ET · 2 business days left", or "Closed … ET" once passed. */
export function deadlineLine(t: Translator<"referrals">, f: Formatter, at: string, left: number | null): string {
  return deadlineState(left) === "closed" ? deadlineLeft(t, f, at, left) : `${deadlineWhen(t, f, at)} · ${deadlineLeft(t, f, at, left)}`;
}
