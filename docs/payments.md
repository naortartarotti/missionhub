# Wallet payments (Stripe)

The code is complete but **has never talked to Stripe**. Until the two secrets below are set, nothing
payment-related is shown to users and the webhook answers 503. Do the first run in Stripe **test mode**.

## What happens where

| Step | Code |
|---|---|
| Job owner pays a placement's outstanding shares | `payPlacementCommission` in `src/features/wallet/actions.ts` → Stripe Checkout |
| Stripe confirms | `POST /api/stripe/webhook` (`src/app/api/stripe/webhook/route.ts`) stores the event and queues it |
| Wallet credited, placement settled, funds released, withdrawals sent | worker: `src/server/queue/handlers/payments.ts` |
| Bookkeeping | `supabase/migrations/20261110000300_wallet_payments.sql` |
| Org admin connects a bank account / withdraws | `startPayoutSetup`, `requestCashout` → wallet page |

## Connecting Stripe

1. **Stripe account** with **Connect** enabled (platform profile completed). The integration creates
   **Express** connected accounts with the `transfers` capability and uses *separate charges and transfers*.
2. **Secrets** (Vercel project env and `.env.local`): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
3. **Webhook endpoint** `https://<app>/api/stripe/webhook`, listening on your account **and on connected accounts** for:
   - `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`
   - `charge.refunded`, `charge.dispute.created`
   - `account.updated` (connected accounts)
4. **The worker must be running** (`npm run worker`). The webhook only stores events; without the worker
   no wallet is credited and no withdrawal leaves. Events are safe to redeliver.
5. **Payment methods**: chosen in the Stripe dashboard (Checkout uses your dashboard settings). Bank debits
   are cheaper than cards for commission-sized amounts and are handled (they confirm asynchronously).
6. **Switch on withdrawals** in `/admin/wallets` when you are ready. Paying in works as soon as the secrets are set.

## Check before going live

- [ ] The pinned API version (`API_VERSION` in `src/server/integrations/stripe.ts`) and the Express account
      creation call still match Stripe's current Connect documentation for your country.
- [ ] Test-mode run of the whole loop: pay a placement → wallet pending → released → withdraw → transfer appears on the connected account.
- [ ] Currencies: transfers require the platform balance to hold that currency; cross-border payouts have country restrictions.
- [ ] How long funds may sit in the platform balance under your Stripe agreement, and the money-transmission question in ADR 0005.

## Operating it

- `/admin/wallets` → **Needs attention** lists charges that were paid but not posted (`review`), reversed at
  the provider (`disputed` / `refunded`), and withdrawals stuck in processing.
- A charge in `review` means the money is at Stripe but in no wallet (amount mismatch, over-payment, or the
  placement was disputed). Refund it in Stripe or correct it; there is no in-app tool for this yet.
- A refund or chargeback **freezes the recipient's wallet** and does not reverse the ledger automatically.
- A withdrawal the provider refuses for good returns to the organization's balance. Transient failures retry
  with the same idempotency key; after five attempts the job is dead-lettered and the amount stays reserved
  until someone re-queues or fails it.
- Provider fees are deducted pro rata from the sourcing and platform shares; the job owner pays the exact outstanding amount.

## Not built yet

MFA step-up and limits for withdrawals, approval for large amounts, automatic reversal of refunds and
chargebacks, reconciliation of the ledger against the Stripe balance, recruiter-to-recruiter transfer UI.
