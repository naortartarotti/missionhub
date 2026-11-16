import { describe, expect, it } from "vitest";
import { itemsToPost, startMonthRange, validateItems, type ItemDraft } from "../form-helpers";

const M = { date: "date", captured: "captured", link: "link", type: "type" };
const item = (o: Partial<ItemDraft>): ItemDraft => ({ key: "k", type: "candidate_message", itemDate: "2026-11-01", capturedOn: "", url: "", backsTail: false, ...o });

describe("hire report evidence items (BR-18, AC-41)", () => {
  it("accepts a screenshot item with no link and no capture date", () => {
    expect(validateItems([item({})], "2026-11-16", M)).toEqual({});
  });
  it("refuses a missing type or date, a future date, a bad capture date and a non-https link, per field", () => {
    expect(validateItems([item({ type: "", itemDate: "" })], "2026-11-16", M)).toEqual({ "0.type": "type", "0.itemDate": "date" });
    expect(validateItems([item({ itemDate: "2026-11-17" })], "2026-11-16", M)).toEqual({ "0.itemDate": "date" });
    expect(validateItems([item({ capturedOn: "2026-10-31" })], "2026-11-16", M)).toEqual({ "0.capturedOn": "captured" });
    expect(validateItems([item({ capturedOn: "2026-11-17" })], "2026-11-16", M)).toEqual({ "0.capturedOn": "captured" });
    expect(validateItems([item({}), item({ url: "http://x.test" })], "2026-11-16", M)).toEqual({ "1.url": "link" });
  });
  it("posts the action's JSON shape", () => {
    expect(JSON.parse(itemsToPost([item({ url: " https://x.test ", backsTail: true })]))).toEqual([
      { type: "candidate_message", itemDate: "2026-11-01", capturedOn: "", url: "https://x.test", backsTail: true },
    ]);
  });
});

describe("approximate start range (PD-075)", () => {
  it("runs from the delivery month (ET) to the current month + 3", () => {
    expect(startMonthRange("2026-03-10T12:00:00Z", "2026-11-16")).toEqual({ from: "2026-03", to: "2027-02" });
    // 03:00 UTC on Apr 1 is still Mar 31 in Toronto.
    expect(startMonthRange("2026-04-01T03:00:00Z", "2026-11-16").from).toBe("2026-03");
  });
});
