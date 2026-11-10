import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { encodeForm, minimizeEvent, verifyWebhookSignature } from "../stripe";

const secret = "whsec_test_secret";
const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
const now = 1_800_000_000_000;
const sign = (payload: string, t: number, key = secret) => createHmac("sha256", key).update(`${t}.${payload}`).digest("hex");
const header = (t: number, sig: string) => `t=${t},v1=${sig}`;

describe("verifyWebhookSignature", () => {
  const t = now / 1000;

  it("accepts a correctly signed, fresh payload", () => {
    expect(verifyWebhookSignature(body, header(t, sign(body, t)), secret, 300, now)).toBe(true);
  });

  it("accepts when any of several v1 signatures matches (secret rotation)", () => {
    expect(verifyWebhookSignature(body, `t=${t},v1=${"0".repeat(64)},v1=${sign(body, t)}`, secret, 300, now)).toBe(true);
  });

  it("rejects a tampered body, a wrong secret and a wrong timestamp", () => {
    expect(verifyWebhookSignature(body + " ", header(t, sign(body, t)), secret, 300, now)).toBe(false);
    expect(verifyWebhookSignature(body, header(t, sign(body, t, "whsec_other")), secret, 300, now)).toBe(false);
    expect(verifyWebhookSignature(body, header(t + 1, sign(body, t)), secret, 300, now)).toBe(false);
  });

  it("rejects replays outside the tolerance window", () => {
    const old = t - 301;
    expect(verifyWebhookSignature(body, header(old, sign(body, old)), secret, 300, now)).toBe(false);
    const future = t + 301;
    expect(verifyWebhookSignature(body, header(future, sign(body, future)), secret, 300, now)).toBe(false);
  });

  it("rejects missing or malformed headers without throwing", () => {
    for (const h of [null, "", "garbage", `t=${t}`, `v1=${sign(body, t)}`, `t=abc,v1=${sign(body, t)}`, `t=${t},v1=zz`, `t=${t},v1=${sign(body, t).slice(2)}`]) {
      expect(verifyWebhookSignature(body, h, secret, 300, now)).toBe(false);
    }
    expect(verifyWebhookSignature(body, header(t, sign(body, t, "")), "", 300, now)).toBe(false);
  });
});

describe("encodeForm", () => {
  it("encodes nested objects and arrays the way Stripe expects", () => {
    const encoded = encodeForm({
      mode: "payment",
      skip: undefined,
      expand: ["a.b"],
      line_items: [{ quantity: 1, price_data: { currency: "cad", unit_amount: 1100000 } }],
      metadata: { charge_id: "c 1" },
    }).map(decodeURIComponent);
    expect(encoded).toEqual([
      "mode=payment",
      "expand[0]=a.b",
      "line_items[0][quantity]=1",
      "line_items[0][price_data][currency]=cad",
      "line_items[0][price_data][unit_amount]=1100000",
      "metadata[charge_id]=c 1",
    ]);
  });
});

describe("minimizeEvent", () => {
  it("drops customer details and unknown metadata before the event is stored", () => {
    const stored = minimizeEvent({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1", object: "checkout.session", payment_intent: "pi_1", payment_status: "paid", amount_total: 1100000, currency: "cad",
          customer_details: { email: "person@example.com", name: "A Person" }, customer_email: "person@example.com",
          metadata: { charge_id: "abc", note: "free text" },
        },
      },
    });
    expect(stored).toEqual({
      object: { id: "cs_1", object: "checkout.session", payment_intent: "pi_1", payment_status: "paid", amount_total: 1100000, currency: "cad", metadata: { charge_id: "abc" } },
    });
    expect(JSON.stringify(stored)).not.toContain("example.com");
  });
});
