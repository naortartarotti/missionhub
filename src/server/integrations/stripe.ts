import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env, integrations } from "@/server/env";

/**
 * Stripe over its REST API (no SDK): Checkout for money in, Connect (Express accounts + transfers)
 * for money out. Funds sit in the platform's Stripe balance; the wallet ledger records whose they are.
 *
 * Privacy: requests carry only opaque ids and amounts. Never put names, emails or job titles in
 * descriptions or metadata.
 *
 * NOT YET EXERCISED AGAINST STRIPE. Written from the documented API; run it in test mode and
 * confirm the Connect account setup matches your Stripe account before going live.
 */

const API = "https://api.stripe.com/v1";
const API_VERSION = "2024-06-20";

export class StripeError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "StripeError";
  }
  /** Worth retrying with the same idempotency key: network trouble, rate limits, Stripe-side errors. */
  get retryable() {
    return this.status === 0 || this.status === 409 || this.status === 429 || this.status >= 500;
  }
}

type Params = { [key: string]: string | number | boolean | undefined | Params | Params[] | string[] };

/** Stripe's form encoding: nested objects as a[b]=c, arrays as a[0]=c. */
export function encodeForm(params: Params, prefix = ""): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === "object") out.push(...encodeForm(item, `${name}[${i}]`));
        else out.push(`${encodeURIComponent(`${name}[${i}]`)}=${encodeURIComponent(item)}`);
      });
    } else if (typeof value === "object") out.push(...encodeForm(value, name));
    else out.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
  }
  return out;
}

async function call<T>(method: "GET" | "POST", path: string, params: Params = {}, idempotencyKey?: string): Promise<T> {
  if (!integrations.payments) throw new StripeError(0, "not_configured", "Stripe is not configured");
  const query = encodeForm(params).join("&");
  let res: Response;
  try {
    res = await fetch(`${API}${path}${method === "GET" && query ? `?${query}` : ""}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Stripe-Version": API_VERSION,
        ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: method === "POST" ? query : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new StripeError(0, "network_error", e instanceof Error ? e.message : "network error");
  }
  const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; type?: string; message?: string } };
  if (!res.ok) {
    throw new StripeError(res.status, body.error?.code ?? body.error?.type ?? "unknown", body.error?.message ?? `Stripe returned ${res.status}`);
  }
  return body as T;
}

/** Hosted payment page for one placement charge. The idempotency key makes a double click return the same session. */
export async function createCheckoutSession(input: {
  chargeId: string;
  placementId: string;
  amountMinor: number;
  currency: string;
  productName: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string }> {
  const session = await call<{ id: string; url: string | null }>(
    "POST",
    "/checkout/sessions",
    {
      mode: "payment",
      client_reference_id: input.chargeId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      // Sessions live 30 minutes at least; the database reuses an open charge for 35.
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      line_items: [
        {
          quantity: 1,
          price_data: { currency: input.currency.toLowerCase(), unit_amount: input.amountMinor, product_data: { name: input.productName } },
        },
      ],
      metadata: { charge_id: input.chargeId },
      payment_intent_data: { metadata: { charge_id: input.chargeId }, transfer_group: `placement_${input.placementId}` },
    },
    `charge:${input.chargeId}`,
  );
  if (!session.url) throw new StripeError(0, "no_session_url", "Stripe returned a session without a URL");
  return { id: session.id, url: session.url };
}

/** Provider fee and the moment the funds become available in the platform balance. Null until Stripe has booked the charge. */
export async function getPaymentSettlement(paymentIntentId: string): Promise<{ feeMinor: number; availableAt: Date } | null> {
  const pi = await call<{ latest_charge?: { balance_transaction?: { fee: number; available_on: number } | string | null } | string | null }>(
    "GET",
    `/payment_intents/${encodeURIComponent(paymentIntentId)}`,
    { expand: ["latest_charge.balance_transaction"] },
  );
  const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const bt = charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
  return bt ? { feeMinor: bt.fee, availableAt: new Date(bt.available_on * 1000) } : null;
}

/** Express connected account that will receive this organization's withdrawals. */
export async function createConnectedAccount(organizationId: string): Promise<{ id: string }> {
  return call<{ id: string }>(
    "POST",
    "/accounts",
    { type: "express", capabilities: { transfers: { requested: true } }, metadata: { organization_id: organizationId } },
    `account:${organizationId}`,
  );
}

/** One-time link to Stripe's hosted onboarding (identity and bank details are collected by Stripe, never by us). */
export async function createAccountOnboardingLink(accountId: string, returnUrl: string, refreshUrl: string): Promise<{ url: string }> {
  return call<{ url: string }>("POST", "/account_links", { account: accountId, type: "account_onboarding", return_url: returnUrl, refresh_url: refreshUrl });
}

export async function getConnectedAccount(accountId: string): Promise<{ detailsSubmitted: boolean; payoutsEnabled: boolean }> {
  const acct = await call<{ details_submitted?: boolean; payouts_enabled?: boolean }>("GET", `/accounts/${encodeURIComponent(accountId)}`);
  return { detailsSubmitted: Boolean(acct.details_submitted), payoutsEnabled: Boolean(acct.payouts_enabled) };
}

/** Moves a reserved withdrawal from the platform balance to the connected account. Stripe then pays out to the bank on its schedule. */
export async function createCashoutTransfer(input: { cashoutId: string; accountId: string; amountMinor: number; currency: string }): Promise<{ id: string }> {
  return call<{ id: string }>(
    "POST",
    "/transfers",
    { amount: input.amountMinor, currency: input.currency.toLowerCase(), destination: input.accountId, metadata: { cashout_id: input.cashoutId } },
    `cashout:${input.cashoutId}`,
  );
}

/**
 * Verifies a `Stripe-Signature` header (`t=<unix>,v1=<hex hmac of "t.body">`) against the raw body.
 * Rejects stale timestamps so a captured request cannot be replayed later.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null, secret: string, toleranceSeconds = 300, nowMs = Date.now()): boolean {
  if (!header || !secret) return false;
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === "t") timestamp = value;
    else if (key === "v1") signatures.push(value);
  }
  if (!/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest();
  return signatures.some((sig) => {
    if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
    return timingSafeEqual(Buffer.from(sig, "hex"), expected);
  });
}

type StripeObject = Record<string, unknown>;
type Scalar = string | number | boolean;
/** Copies only allow-listed scalar fields; nested objects (customer details, addresses…) never pass. */
const pick = (o: StripeObject, keys: string[]): Record<string, Scalar> =>
  Object.fromEntries(keys.flatMap((k) => (["string", "number", "boolean"].includes(typeof o[k]) ? [[k, o[k] as Scalar]] : [])));

/** Keeps only what processing needs (ids, amounts, status, our metadata) so no customer details are stored. */
export function minimizeEvent(event: { id: string; type: string; data?: { object?: StripeObject } }) {
  const object = event.data?.object ?? {};
  const kept = pick(object, [
    "id", "object", "payment_intent", "payment_status", "status", "amount_total", "amount", "currency",
    "client_reference_id", "details_submitted", "payouts_enabled",
  ]);
  const metadata = typeof object.metadata === "object" && object.metadata ? pick(object.metadata as StripeObject, ["charge_id", "cashout_id", "organization_id"]) : {};
  return { object: { ...kept, metadata } };
}
