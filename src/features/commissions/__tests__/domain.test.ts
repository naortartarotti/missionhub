import { describe, expect, it } from "vitest";
import { ledgerBalances, projectedSplit } from "../domain";

describe("commission domain", () => {
  it("projects the default split", () => {
    expect(projectedSplit(2_000_000, { sourcing_bps: 4500, job_owner_bps: 4500, platform_bps: 1000 })).toEqual({ sourcing: 900_000, jobOwner: 900_000, platform: 200_000 });
  });

  it("derives outstanding balances from ledger entries including refunds and payouts", () => {
    const b = ledgerBalances([
      { party: "client", entry_type: "fee_received", amount_minor: 2_000_000 },
      { party: "sourcing", entry_type: "allocation", amount_minor: 900_000 },
      { party: "job_owner", entry_type: "allocation", amount_minor: 900_000 },
      { party: "platform", entry_type: "allocation", amount_minor: 200_000 },
      { party: "client", entry_type: "refund", amount_minor: -1_000_000 },
      { party: "sourcing", entry_type: "allocation_reversal", amount_minor: -450_000 },
      { party: "job_owner", entry_type: "allocation_reversal", amount_minor: -450_000 },
      { party: "platform", entry_type: "allocation_reversal", amount_minor: -100_000 },
      { party: "sourcing", entry_type: "payout", amount_minor: -450_000 },
    ]);
    expect(b.received).toBe(1_000_000);
    expect(b.sourcingAllocated).toBe(450_000);
    expect(b.sourcingPaid).toBe(450_000);
    expect(b.sourcingOutstanding).toBe(0);
    expect(b.platformOutstanding).toBe(100_000);
  });
});
