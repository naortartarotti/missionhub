import { todayEt } from "@/features/referrals/hire-dates";

/**
 * Pure helpers for the hire-report, rebuttal and evidence forms (no React, no server imports), shared by the
 * dialogs and the unit tests. The server re-validates everything (`src/features/hire-reports/schemas.ts`).
 */
export type ItemDraft = { key: string; type: string; itemDate: string; capturedOn: string; url: string; backsTail: boolean };
export type ItemErrors = Record<string, string | undefined>;
export const newItem = (): ItemDraft => ({ key: crypto.randomUUID(), type: "", itemDate: "", capturedOn: "", url: "", backsTail: false });

/** Client checks mirroring `hireItemSchema` (BR-18), keyed `"{index}.{field}"`, so each error lands on its input. */
export function validateItems(items: ItemDraft[], today: string, m: { date: string; captured: string; link: string; type: string }): ItemErrors {
  const e: ItemErrors = {};
  items.forEach((it, i) => {
    if (!it.type) e[`${i}.type`] = m.type;
    if (!it.itemDate || it.itemDate > today) e[`${i}.itemDate`] = m.date;
    if (it.capturedOn && (it.capturedOn > today || (it.itemDate && it.capturedOn < it.itemDate))) e[`${i}.capturedOn`] = m.captured;
    if (it.url.trim() && !/^https:\/\//.test(it.url.trim())) e[`${i}.url`] = m.link;
  });
  return e;
}

/** The action's `items` field: a JSON array of `{type, itemDate, capturedOn, url, backsTail}`. */
export const itemsToPost = (items: ItemDraft[]) =>
  JSON.stringify(items.map((i) => ({ type: i.type, itemDate: i.itemDate, capturedOn: i.capturedOn, url: i.url.trim(), backsTail: i.backsTail })));

/** "Approximate start" options: the delivery month to the current month + 3 (PD-075), as "YYYY-MM". */
export function startMonthRange(deliveredAt: string | null, today: string): { from: string; to: string } {
  const [ty, tm] = today.split("-").map(Number);
  const end = new Date(Date.UTC(ty, tm - 1 + 3, 1));
  const to = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}`;
  const from = deliveredAt ? todayEt(new Date(deliveredAt)).slice(0, 7) : `${ty - 1}-${String(tm).padStart(2, "0")}`;
  return { from: from > to ? to : from, to };
}
