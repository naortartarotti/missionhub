"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertCan, getRequestContext } from "@/server/auth/context";
import { guard, id, parse, rateLimit } from "@/server/actions/guard";
import { env, integrations } from "@/server/env";
import { createAdminClient } from "@/server/supabase/admin";
import { StripeError, createAccountOnboardingLink, createCheckoutSession, createConnectedAccount } from "@/server/integrations/stripe";
import { fromZodError, toActionError, type ActionResult } from "@/lib/actions/result";
import { formToObject } from "@/lib/validation/form-data";
import { parseMajorToMinor } from "@/lib/money/format";
import { getT } from "@/i18n/server";
import { msg } from "@/i18n/translate";

const notConfigured: ActionResult<never> = { ok: false, error: msg("errors.payments_not_configured") };

/** Provider failures never leak raw messages to the user; the code goes to the log for support. */
function providerError(e: unknown): ActionResult<never> {
  if (!(e instanceof StripeError)) throw e;
  console.error(JSON.stringify({ evt: "stripe.error", status: e.status, code: e.code }));
  return { ok: false, error: msg("errors.payment_provider_unavailable") };
}

const paySchema = z.object({ placementId: id });

/**
 * Job owner pays a placement's outstanding sourcing + platform shares. Returns the provider's
 * hosted payment page; the wallet is only credited later, when the signed webhook confirms payment.
 */
export async function payPlacementCommission(orgSlug: string, input: { placementId: string }): Promise<ActionResult<{ url: string }>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "commissions:record");
    const v = parse(paySchema, input);
    if (!integrations.payments) return notConfigured;
    await rateLimit(ctx.db, "wallet.pay", 10, 3600);

    const { data: chargeId, error } = await ctx.db.rpc("create_placement_charge", { p_placement: v.placementId });
    if (error) return toActionError(error);
    const { data: charge, error: cErr } = await ctx.db.from("placement_charges").select("id, placement_id, sourcing_minor, platform_minor, currency").eq("id", chargeId).single();
    if (cErr) return toActionError(cErr);

    const back = `${env.NEXT_PUBLIC_APP_URL}/workspace/${ctx.organizationSlug}/wallet/placements/${charge.placement_id}`;
    try {
      const session = await createCheckoutSession({
        chargeId: charge.id,
        placementId: charge.placement_id,
        amountMinor: charge.sourcing_minor + charge.platform_minor,
        currency: charge.currency,
        productName: (await getT("commissions"))("detail.productName"),
        successUrl: `${back}?payment=success`,
        cancelUrl: `${back}?payment=cancelled`,
      });
      return { ok: true, data: { url: session.url } };
    } catch (e) {
      return providerError(e);
    }
  });
}

/** Org admin opens the provider's hosted onboarding to connect the bank account that receives withdrawals. */
export async function startPayoutSetup(orgSlug: string): Promise<ActionResult<{ url: string }>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "wallet:cashout");
    if (!integrations.payments) return notConfigured;
    await rateLimit(ctx.db, "wallet.payout_setup", 10, 3600);

    const { data: existing, error } = await ctx.db.from("payout_destinations").select("psp_account_id").eq("organization_id", ctx.organizationId).maybeSingle();
    if (error) return toActionError(error);
    try {
      let accountId = existing?.psp_account_id;
      if (!accountId) {
        // Idempotent per organization at the provider, and first-writer-wins in the database.
        const created = await createConnectedAccount(ctx.organizationId);
        const { data: stored, error: sErr } = await createAdminClient().rpc("wallet_set_payout_destination", {
          p_org: ctx.organizationId, p_account: created.id, p_user: ctx.userId,
        });
        if (sErr) return toActionError(sErr);
        accountId = stored;
      }
      const wallet = `${env.NEXT_PUBLIC_APP_URL}/workspace/${ctx.organizationSlug}/wallet`;
      const link = await createAccountOnboardingLink(accountId, `${wallet}?payouts=return`, `${wallet}?payouts=refresh`);
      return { ok: true, data: { url: link.url } };
    } catch (e) {
      return providerError(e);
    }
  });
}

const cashoutSchema = z.object({
  amount: z.string().min(1, msg("errors.invalid_amount")),
  currency: z.string().regex(/^[A-Z]{3}$/),
  idempotencyKey: z.uuid(),
});

/** Org admin withdraws available funds. The amount is reserved immediately; the worker sends it. */
export async function requestCashout(orgSlug: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "wallet:cashout");
    const parsed = cashoutSchema.safeParse(formToObject(formData));
    if (!parsed.success) return fromZodError(parsed.error);
    const v = parsed.data;
    if (!integrations.payments) return notConfigured;
    const amount = parseMajorToMinor(v.amount, v.currency);
    if (!amount) return { ok: false, error: msg("errors.invalid_amount"), fieldErrors: { amount: [msg("errors.invalid_amount")] } };
    await rateLimit(ctx.db, "wallet.cashout", 5, 3600);

    const { error } = await ctx.db.rpc("request_cashout", {
      p_org: ctx.organizationId, p_currency: v.currency, p_amount_minor: amount, p_idempotency_key: v.idempotencyKey,
    });
    if (error) return toActionError(error);
    revalidatePath(`/workspace/${orgSlug}/wallet`);
    return { ok: true, message: msg("wallet.payouts.requested") };
  });
}
