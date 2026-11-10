import "server-only";
import type { AdminClient } from "@/server/supabase/admin";
import { StripeError, createCashoutTransfer, getPaymentSettlement } from "@/server/integrations/stripe";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StoredObject = {
  id?: string;
  payment_intent?: string;
  payment_status?: string;
  amount_total?: number;
  currency?: string;
  details_submitted?: boolean;
  payouts_enabled?: boolean;
  metadata?: { charge_id?: string };
};

/** What the payments code needs from Stripe; injectable so the handlers can be tested without the network. */
export type PaymentsGateway = {
  getPaymentSettlement: typeof getPaymentSettlement;
  createCashoutTransfer: typeof createCashoutTransfer;
};
const stripeGateway: PaymentsGateway = { getPaymentSettlement, createCashoutTransfer };

/**
 * Applies one stored provider event. Throwing leaves the event unprocessed so the queue retries;
 * every RPC called here is idempotent, so a retry after a partial failure is safe.
 */
export async function processPspEvent(db: AdminClient, eventId: string, gateway: PaymentsGateway = stripeGateway) {
  const { data: event, error } = await db.from("psp_events").select("id, type, payload, processed_at").eq("id", eventId).maybeSingle();
  if (error) throw error;
  if (!event || event.processed_at) return;
  const object = ((event.payload as { object?: StoredObject } | null)?.object ?? {}) as StoredObject;
  const chargeId = object.metadata?.charge_id;
  let outcome = "ignored";

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      // Bank debits complete the session first and pay later: wait for the async event.
      if (object.payment_status !== "paid") { outcome = "ignored:unpaid"; break; }
      if (!chargeId || !UUID.test(chargeId) || !object.payment_intent) { outcome = "ignored:no_charge"; break; }
      const settlement = await gateway.getPaymentSettlement(object.payment_intent);
      if (!settlement) throw new Error("balance transaction not available yet");
      const { data, error: e } = await db.rpc("wallet_settle_placement_charge", {
        p_charge: chargeId,
        p_session: object.id ?? "",
        p_payment_intent: object.payment_intent,
        p_amount_minor: object.amount_total ?? -1,
        p_currency: object.currency ?? "",
        p_fee_minor: settlement.feeMinor,
        p_available_at: settlement.availableAt.toISOString(),
      });
      if (e) throw e;
      outcome = `charge:${data}`;
      break;
    }
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      if (!chargeId || !UUID.test(chargeId)) { outcome = "ignored:no_charge"; break; }
      const { error: e } = await db.rpc("wallet_close_placement_charge", {
        p_charge: chargeId,
        p_status: event.type === "checkout.session.expired" ? "expired" : "failed",
      });
      if (e) throw e;
      outcome = "charge:closed";
      break;
    }
    case "charge.refunded":
    case "charge.dispute.created": {
      if (!object.payment_intent) { outcome = "ignored:no_payment_intent"; break; }
      const { data, error: e } = await db.rpc("wallet_flag_placement_charge", {
        p_payment_intent: object.payment_intent,
        p_status: event.type === "charge.refunded" ? "refunded" : "disputed",
      });
      if (e) throw e;
      outcome = `charge:${data}`;
      break;
    }
    case "account.updated": {
      if (!object.id) break;
      const { error: e } = await db.rpc("wallet_update_payout_destination", {
        p_account: object.id,
        p_details_submitted: Boolean(object.details_submitted),
        p_payouts_enabled: Boolean(object.payouts_enabled),
      });
      if (e) throw e;
      outcome = "payout_destination:updated";
      break;
    }
  }
  const { error: doneErr } = await db.rpc("psp_complete_event", { p_id: event.id, p_outcome: outcome });
  if (doneErr) throw doneErr;
}

/** Funds cleared at the provider: pending → available. */
export async function releasePlacementCharge(db: AdminClient, chargeId: string) {
  const { error } = await db.rpc("wallet_release_placement_charge", { p_charge: chargeId });
  if (error) throw error;
}

/**
 * Sends a reserved withdrawal to the organization's connected account.
 * - Stripe accepts → the reserve leaves the platform.
 * - Stripe refuses for good (closed account, unsupported currency…) → the reserve returns to the wallet.
 * - Anything transient → throw, and the queue retries with the same idempotency key, so the
 *   transfer can never be created twice.
 */
export async function sendCashout(db: AdminClient, cashoutId: string, gateway: PaymentsGateway = stripeGateway) {
  const { data: request, error } = await db.from("cashout_requests").select("id, organization_id, currency, amount_minor, status").eq("id", cashoutId).maybeSingle();
  if (error) throw error;
  if (!request || request.status !== "requested") return;
  const { data: destination, error: dErr } = await db.from("payout_destinations").select("psp_account_id, payouts_enabled").eq("organization_id", request.organization_id).maybeSingle();
  if (dErr) throw dErr;

  const fail = async (reason: string) => {
    const { error: e } = await db.rpc("wallet_fail_cashout", { p_cashout: request.id, p_reason: reason });
    if (e) throw e;
  };
  if (!destination?.payouts_enabled) return fail("payout_account_not_ready");

  let transferId: string;
  try {
    ({ id: transferId } = await gateway.createCashoutTransfer({
      cashoutId: request.id,
      accountId: destination.psp_account_id,
      amountMinor: request.amount_minor,
      currency: request.currency,
    }));
  } catch (e) {
    // The platform balance can lag the wallet by a settlement cycle: wait rather than bounce the withdrawal.
    if (e instanceof StripeError && !e.retryable && e.code !== "balance_insufficient") return fail(e.code);
    throw e;
  }
  const { error: cErr } = await db.rpc("wallet_complete_cashout", { p_cashout: request.id, p_transfer: transferId });
  if (cErr) throw cErr;
}
