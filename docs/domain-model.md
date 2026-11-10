# Domain model

All money is integer minor units + ISO currency. All tenant rows carry `organization_id`; it is immutable (trigger).

| Area | Tables | Key rules |
|---|---|---|
| Identity & tenancy | `profiles`, `organizations`, `organization_memberships`, `organization_invitations` | Tokens stored hashed; users can't self-promote to platform admin |
| Candidates | `candidates`, `candidate_experiences`, `candidate_documents`, `candidate_consents`, `privacy_requests` | Statuses `draft → active_for_matching → unavailable/archived → deleted (anonymized)`; consents are append-only (revocation only) |
| Jobs | `jobs` | Statuses `draft/active/paused/closed/filled/cancelled`; per-field pre-referral visibility (`share_*`), confidential client |
| Matching | `matches`, `match_feedback`, `background_jobs` | Internal only; `model_version`, `input_hash`, evidence arrays |
| Referrals | `referrals`, `referral_candidate_links` (source-only), `referral_shared_profiles` (immutable snapshot), `referral_document_grants`/`_sources`, `referral_status_events` (immutable), `referral_messages` (immutable), `referral_transitions` (state machine as data) | One live referral per candidate×job; idempotency key; optimistic concurrency (`version`) |
| Finance | `commission_rules` (versioned), `collaboration_agreements` (frozen snapshot), `placements`, `placement_status_events`, `invoice_records`, `payment_evidence`, `commission_ledger_entries` (immutable), `disputes` | Four-eyes verification; ledger is the source of truth for balances |
| Wallet | `wallet_accounts` (per org × currency: `available`, `pending`; plus system accounts), `wallet_transactions`, `wallet_entries` (immutable, double-entry), `wallet_freezes`, `wallet_settings` | Entries of a transaction sum to zero; org balances never negative; writes only through `app.wallet_post`; idempotency key on every posting |
| Wallet payments | `placement_charges`, `psp_events` (webhook inbox), `payout_destinations`, `cashout_requests` | Money only moves on a signature-verified provider event or a reserved withdrawal; every step idempotent; mismatches park in `review` instead of posting |
| Audit & notifications | `audit_events` (immutable, PII-free metadata), `notifications`, `notification_preferences` | |

## Referral state machine
`submitted → under_review | accepted | declined | info_requested | withdrawn`
`info_requested → under_review (source responds) | declined | withdrawn`
`accepted → interviewing* | withdrawn | cancelled` · `interviewing → offer* | rejected | withdrawn | cancelled` · `offer → hired (report_hire only) | rejected | withdrawn | cancelled`
`*` requires an **active** collaboration agreement (created on accept from the default rule, confirmed by the sourcing recruiter).

## Placement & ledger
`hire_reported → invoiced → payment_partially_verified | commission_payable → settled`, any → `disputed` (frozen) → previous status on resolution.
Verified client payment writes: `client:+distributable`, `sourcing/job_owner/platform: allocation` via `app.allocate_minor` (largest remainder, ties to earlier share; mirrored by `src/lib/money/allocate.ts`). Refunds write negative reversals. Payouts/remittances reduce outstanding balances and cannot exceed them. Settled when sourcing and platform balances reach zero.

## Wallet ledger
Separate from the commission ledger: commissions record *who owes what for a placement*, the wallet records *which organization holds which balance* (ADR 0005). Sign convention: organization and revenue accounts are positive when money is owed to them; `psp_clearing` mirrors cash held at the payment provider and is negative, so the whole book sums to zero.
`placement_funding`: `psp_clearing −(amount+fee)`, `org pending +amount`, `platform_revenue +fee` · `release`: `pending → available` · `transfer`: `available(A) → available(B)`, org admins only, partner organizations only, off until `wallet_settings.transfers_enabled`.
Funding, release and `wallet_reconcile()` are service-role RPCs (payment worker); `wallet_transfer` is the only user-initiated movement so far. A frozen organization can receive but not send.

## Wallet payments (Stripe)
**In.** Job owner → `create_placement_charge` (outstanding sourcing + platform shares from the commission ledger; one open charge per placement) → hosted checkout → webhook → `wallet_settle_placement_charge`: wallet `placement_funding` (provider fee deducted pro rata from both shares), commission ledger `payout` + `remittance` for the full shares, placement → `settled`. A `wallet.release` job moves the sourcing share `pending → available` at the provider's `available_on`. Amount/currency mismatch, over-payment or a disputed placement → charge `review`, nothing posted. Refund or chargeback after posting → charge flagged, recipient wallet frozen, admin decides.
**Out.** Org admin → provider onboarding (`payout_destinations`) → `request_cashout`: `available → payout_in_transit` immediately → worker creates the provider transfer (idempotency key = cash-out id) → `wallet_complete_cashout` (`payout_in_transit → psp_clearing`) or, on a permanent refusal, `wallet_fail_cashout` (reserve returns). Gated by `wallet_settings.cashouts_enabled`.
Setup and operations: `docs/payments.md`.
