-- Remove the wallet feature entirely: the internal balance ledger (20261110000100), its admin
-- reconciliation (20261110000200) and the Stripe pay-ins / cash-outs (20261110000300).
--
-- Commission tracking is unaffected: placements, the commission ledger, invoices, payment evidence
-- and disputes (20261107000500) stay as the record of who owes what. Settlement happens outside
-- the platform and is recorded as evidence.
--
-- Every table dropped here was empty in production when this was written.

-- Queued work and notifications that pointed at the wallet.
delete from public.background_jobs where kind in ('psp.event', 'wallet.release', 'wallet.cashout');
delete from public.notifications where kind like 'wallet.%' or kind like 'placement_charge.%';

-- Functions first (they reference the tables and enums below).
drop function if exists public.psp_record_event(text, text, jsonb);
drop function if exists public.psp_complete_event(text, text);
drop function if exists public.create_placement_charge(uuid);
drop function if exists public.wallet_settle_placement_charge(uuid, text, text, bigint, text, bigint, timestamptz);
drop function if exists public.wallet_release_placement_charge(uuid);
drop function if exists public.wallet_close_placement_charge(uuid, public.placement_charge_status);
drop function if exists public.wallet_flag_placement_charge(text, public.placement_charge_status);
drop function if exists public.wallet_set_payout_destination(uuid, text, uuid);
drop function if exists public.wallet_update_payout_destination(text, boolean, boolean);
drop function if exists public.request_cashout(uuid, char, bigint, text);
drop function if exists public.wallet_complete_cashout(uuid, text);
drop function if exists public.wallet_fail_cashout(uuid, text);
drop function if exists public.set_wallet_cashouts_enabled(boolean);

drop function if exists public.wallet_record_funding(uuid, char, bigint, bigint, uuid, text);
drop function if exists public.wallet_release_pending(uuid, char, bigint, text);
drop function if exists public.wallet_reconcile();
drop function if exists public.wallet_transfer(uuid, uuid, char, bigint, text, text);
drop function if exists public.set_wallet_frozen(uuid, boolean, text);
drop function if exists public.set_wallet_transfers_enabled(boolean);

-- Tables (children before parents). Dropping a table drops its triggers and policies.
drop table if exists public.cashout_requests;
drop table if exists public.payout_destinations;
drop table if exists public.placement_charges;
drop table if exists public.psp_events;
drop table if exists public.wallet_entries;
drop table if exists public.wallet_transactions;
drop table if exists public.wallet_accounts;
drop table if exists public.wallet_freezes;
drop table if exists public.wallet_settings;

-- Internal helpers, now unreferenced.
drop function if exists app.wallet_post(public.wallet_transaction_kind, char, text, uuid[], bigint[], uuid, text, uuid);
drop function if exists app.wallet_account(uuid, public.wallet_account_kind, char);
drop function if exists app.can_see_wallet_account(uuid);
drop function if exists app.can_see_wallet_transaction(uuid);
drop function if exists app.guard_wallet_account();
drop function if exists app.assert_wallet_transaction_balanced();

drop type if exists public.cashout_status;
drop type if exists public.placement_charge_status;
drop type if exists public.wallet_transaction_kind;
drop type if exists public.wallet_account_kind;
