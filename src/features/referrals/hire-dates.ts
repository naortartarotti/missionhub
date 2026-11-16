/**
 * N3 PD-077 date bounds for hire records (client mirror of `report_hire` / `complete_fee_details`): the start
 * and acceptance dates lie within [delivery − 366 days, today + 548 days], calendar dates in America/Toronto.
 * The server re-checks and answers `hire_dates_invalid`; this only lets the form put the error on the field.
 * Acceptance ≤ today and ≤ start are checked by the action (`hireCommonFields`) with their own messages.
 * Pure (no server imports), so the dialogs and the unit tests share it.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const FLOOR_DAYS = 366;
const CEIL_DAYS = 548;

/** Today's date in America/Toronto (YYYY-MM-DD). */
export const todayEt = (now: Date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(now);

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type HireDateBounds = { min: string | null; max: string; today: string };

/** `deliveredAt` is the referral's `delivered_at` timestamp (null: no floor is known client-side). */
export function hireDateBounds(deliveredAt: string | null, today: string): HireDateBounds {
  const delivered = deliveredAt ? todayEt(new Date(deliveredAt)) : null;
  return { min: delivered ? shift(delivered, -FLOOR_DAYS) : null, max: shift(today, CEIL_DAYS), today };
}

const outside = (v: string, b: HireDateBounds) => !ISO.test(v) || (b.min !== null && v < b.min) || v > b.max;

/**
 * Field errors for `startDate` (required, in bounds) and `offerAcceptedOn` (in bounds when given and not
 * "unknown"), or null when both pass. `message` is the translated `errors.hire_dates_invalid`.
 */
export function validateHireDates(fd: FormData, b: HireDateBounds, message: string): Record<string, string[]> | null {
  const errors: Record<string, string[]> = {};
  const start = String(fd.get("startDate") ?? "").trim();
  if (!start || outside(start, b)) errors.startDate = [message];
  const unknown = fd.get("acceptanceUnknown") === "on";
  const accepted = String(fd.get("offerAcceptedOn") ?? "").trim();
  if (!unknown && accepted && outside(accepted, b)) errors.offerAcceptedOn = [message];
  return Object.keys(errors).length ? errors : null;
}
