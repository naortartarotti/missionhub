-- Wallet payments: money in (job owner pays a placement's outstanding shares through the payment
-- provider) and money out (organization withdraws its available balance to its connected account).
--
-- The provider (Stripe) is only ever talked to from the server; this migration is the bookkeeping
-- side. Every function that moves money on the provider's word is service_role only and idempotent,
-- so a webhook delivered twice, or a worker retry, can never post twice.

alter table public.wallet_settings add column cashouts_enabled boolean not null default false;

-- ---------------------------------------------------------------------------
-- Provider webhook inbox
-- ---------------------------------------------------------------------------
create table public.psp_events (
  id text primary key check (char_length(id) between 3 and 255), -- provider's event id
  type text not null check (char_length(type) <= 120),
  payload jsonb not null default '{}', -- minimized by the webhook route: ids, amounts, status, metadata
  outcome text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.psp_events enable row level security; -- no policies: service role only

-- Returns true when the event is new. Enqueues processing in the same transaction.
create or replace function public.psp_record_event(p_id text, p_type text, p_payload jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_new boolean;
begin
  insert into public.psp_events (id, type, payload) values (p_id, p_type, coalesce(p_payload, '{}'))
  on conflict (id) do nothing;
  v_new := found;
  -- Re-enqueue unprocessed events too, so a redelivery can rescue a dead-lettered job.
  if v_new or exists (select 1 from public.psp_events where id = p_id and processed_at is null) then
    perform app.enqueue('psp.event', p_id, jsonb_build_object('event_id', p_id));
  end if;
  return v_new;
end $$;

create or replace function public.psp_complete_event(p_id text, p_outcome text) returns void
language sql security definer set search_path = '' as $$
  update public.psp_events set processed_at = now(), outcome = left(p_outcome, 200) where id = p_id;
$$;

-- ---------------------------------------------------------------------------
-- Money in: placement charges
-- ---------------------------------------------------------------------------
create type public.placement_charge_status as enum (
  'created', 'succeeded', 'failed', 'expired',
  'review',               -- paid at the provider but not posted: needs a platform admin (refund or correct)
  'disputed', 'refunded'  -- reversed at the provider after it was posted
);

create table public.placement_charges (
  id uuid primary key default gen_random_uuid(),
  placement_id uuid not null references public.placements (id) on delete restrict,
  payer_org_id uuid not null references public.organizations (id),
  payee_org_id uuid not null references public.organizations (id),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  sourcing_minor bigint not null check (sourcing_minor >= 0),
  platform_minor bigint not null check (platform_minor >= 0),
  amount_minor bigint generated always as (sourcing_minor + platform_minor) stored,
  status public.placement_charge_status not null default 'created',
  psp_session_id text unique,
  psp_payment_intent_id text unique,
  psp_fee_minor bigint check (psp_fee_minor >= 0),
  payee_net_minor bigint check (payee_net_minor >= 0), -- credited to the sourcing organization after fees
  wallet_transaction_id uuid references public.wallet_transactions (id),
  review_reason text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz,
  check (sourcing_minor + platform_minor > 0)
);
create unique index placement_charges_one_open on public.placement_charges (placement_id) where status = 'created';
create index placement_charges_placement_idx on public.placement_charges (placement_id, created_at desc);
create trigger placement_charges_updated_at before update on public.placement_charges
  for each row execute function app.set_updated_at();

-- Job owner starts paying what the commission ledger says is outstanding (sourcing + platform).
-- Reuses the open charge while its checkout session can still be alive (sessions last 30 minutes),
-- so a double click can never open two payments for the same debt.
create or replace function public.create_placement_charge(p_placement uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p public.placements;
  v_id uuid;
  v_sourcing bigint;
  v_platform bigint;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select * into p from public.placements where id = p_placement for update;
  if not found or not app.is_member(p.target_org_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p.status not in ('commission_payable', 'payment_partially_verified') then
    raise exception 'commission_not_payable' using errcode = 'P0001';
  end if;

  update public.placement_charges set status = 'expired'
   where placement_id = p.id and status = 'created' and created_at < now() - interval '35 minutes';
  select id into v_id from public.placement_charges where placement_id = p.id and status = 'created';
  if v_id is not null then return v_id; end if;

  select greatest(0, coalesce(sum(amount_minor) filter (where party = 'sourcing'), 0)),
         greatest(0, coalesce(sum(amount_minor) filter (where party = 'platform'), 0))
    into v_sourcing, v_platform
  from public.commission_ledger_entries where placement_id = p.id;
  if v_sourcing + v_platform <= 0 then raise exception 'nothing_to_pay' using errcode = 'P0001'; end if;

  insert into public.placement_charges (placement_id, payer_org_id, payee_org_id, currency, sourcing_minor, platform_minor, created_by)
  values (p.id, p.target_org_id, p.source_org_id, p.currency, v_sourcing, v_platform, auth.uid())
  returning id into v_id;
  perform app.audit(p.target_org_id, 'placement_charge.created', 'placement', p.id,
    jsonb_build_object('charge_id', v_id, 'amount_minor', v_sourcing + v_platform, 'currency', p.currency));
  return v_id;
end $$;

-- The provider confirmed the payment. Posts the wallet transaction, discharges the commission
-- ledger and settles the placement, all or nothing. Provider fees come off the distributed
-- amounts pro rata. Anything that does not add up parks the charge in `review` instead of
-- guessing; the money is then at the provider but not in any wallet until an admin acts.
create or replace function public.wallet_settle_placement_charge(
  p_charge uuid, p_session text, p_payment_intent text, p_amount_minor bigint, p_currency text,
  p_fee_minor bigint, p_available_at timestamptz
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  c public.placement_charges;
  p public.placements;
  v_fee bigint := coalesce(p_fee_minor, 0);
  v_fee_sourcing bigint;
  v_net_sourcing bigint;
  v_net_platform bigint;
  v_sourcing_due bigint;
  v_platform_due bigint;
  v_received bigint;
  v_reason text;
  v_accounts uuid[];
  v_amounts bigint[];
  v_tx uuid;
  v_created boolean;
begin
  select * into c from public.placement_charges where id = p_charge for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.status in ('succeeded', 'review', 'disputed', 'refunded') then return c.status::text; end if;
  select * into p from public.placements where id = c.placement_id for update;

  select coalesce(sum(amount_minor) filter (where party = 'sourcing'), 0),
         coalesce(sum(amount_minor) filter (where party = 'platform'), 0)
    into v_sourcing_due, v_platform_due
  from public.commission_ledger_entries where placement_id = p.id;

  v_reason := case
    when upper(coalesce(p_currency, '')) <> c.currency or p_amount_minor is distinct from c.amount_minor then 'amount_mismatch'
    when v_fee < 0 or v_fee > c.amount_minor then 'invalid_fee'
    when p.status in ('disputed', 'cancelled') then 'placement_' || p.status
    when c.sourcing_minor > v_sourcing_due or c.platform_minor > v_platform_due then 'exceeds_outstanding'
  end;
  if v_reason is not null then
    update public.placement_charges
       set status = 'review', review_reason = v_reason, psp_session_id = p_session, psp_payment_intent_id = p_payment_intent
     where id = c.id;
    perform app.audit(null, 'placement_charge.review', 'placement', p.id, jsonb_build_object('charge_id', c.id, 'reason', v_reason));
    return 'review';
  end if;

  v_fee_sourcing := (v_fee * c.sourcing_minor) / c.amount_minor;
  v_net_sourcing := c.sourcing_minor - v_fee_sourcing;
  v_net_platform := c.platform_minor - (v_fee - v_fee_sourcing);

  v_accounts := array[app.wallet_account(null, 'psp_clearing', c.currency)];
  v_amounts := array[-(c.amount_minor - v_fee)];
  if v_net_sourcing > 0 then
    v_accounts := v_accounts || app.wallet_account(c.payee_org_id, 'pending', c.currency);
    v_amounts := v_amounts || v_net_sourcing;
  end if;
  if v_net_platform > 0 then
    v_accounts := v_accounts || app.wallet_account(null, 'platform_revenue', c.currency);
    v_amounts := v_amounts || v_net_platform;
  end if;
  if cardinality(v_accounts) >= 2 then
    select o_transaction, o_created into v_tx, v_created
    from app.wallet_post('placement_funding', c.currency, 'charge:' || c.id, v_accounts, v_amounts, p.id, null);
  end if;

  if c.sourcing_minor > 0 then
    insert into public.commission_ledger_entries
      (placement_id, entry_type, party, organization_id, amount_minor, currency, memo, idempotency_key)
    values (p.id, 'payout', 'sourcing', p.source_org_id, -c.sourcing_minor, c.currency,
            'Paid through MissionHub', c.id || ':payout');
  end if;
  if c.platform_minor > 0 then
    insert into public.commission_ledger_entries
      (placement_id, entry_type, party, organization_id, amount_minor, currency, memo, idempotency_key)
    values (p.id, 'remittance', 'platform', null, -c.platform_minor, c.currency,
            'Paid through MissionHub', c.id || ':remittance');
  end if;

  select coalesce(sum(amount_minor) filter (where party = 'client'), 0),
         coalesce(sum(amount_minor) filter (where party = 'sourcing'), 0),
         coalesce(sum(amount_minor) filter (where party = 'platform'), 0)
    into v_received, v_sourcing_due, v_platform_due
  from public.commission_ledger_entries where placement_id = p.id;
  if v_received > 0 and v_sourcing_due = 0 and v_platform_due = 0 then
    perform app.placement_transition(p.id, 'settled', 'Shares paid through MissionHub');
  end if;

  update public.placement_charges
     set status = 'succeeded', psp_session_id = p_session, psp_payment_intent_id = p_payment_intent,
         psp_fee_minor = v_fee, payee_net_minor = v_net_sourcing, wallet_transaction_id = v_tx, settled_at = now()
   where id = c.id;

  if v_net_sourcing > 0 then
    perform app.enqueue('wallet.release', c.id::text, jsonb_build_object('charge_id', c.id),
      greatest(interval '0 seconds', coalesce(p_available_at, now()) - now()));
    perform app.notify_org(c.payee_org_id, 'wallet.funded', 'Commission received in your wallet',
      p.currency || ' commission for a placement was paid. It becomes available once the payment clears.', '/wallet');
  end if;
  perform app.notify_org(c.payer_org_id, 'placement_charge.paid', 'Commission payment confirmed',
    'Your payment through MissionHub was received and the partner shares were paid.', '/wallet/placements/' || p.id);
  perform app.audit(c.payer_org_id, 'placement_charge.succeeded', 'placement', p.id,
    jsonb_build_object('charge_id', c.id, 'amount_minor', c.amount_minor, 'fee_minor', v_fee, 'currency', c.currency));
  perform app.audit(c.payee_org_id, 'wallet.funded', 'placement', p.id,
    jsonb_build_object('charge_id', c.id, 'amount_minor', v_net_sourcing, 'currency', c.currency));
  return 'succeeded';
end $$;

-- The provider says the funds cleared: pending → available. Skipped if the charge was reversed.
create or replace function public.wallet_release_placement_charge(p_charge uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  c public.placement_charges;
  v_tx uuid;
  v_created boolean;
begin
  select * into c from public.placement_charges where id = p_charge for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.status <> 'succeeded' or coalesce(c.payee_net_minor, 0) <= 0 then return 'skipped'; end if;
  select o_transaction, o_created into v_tx, v_created
  from app.wallet_post('release', c.currency, 'charge-release:' || c.id,
    array[app.wallet_account(c.payee_org_id, 'pending', c.currency), app.wallet_account(c.payee_org_id, 'available', c.currency)],
    array[-c.payee_net_minor, c.payee_net_minor], c.placement_id, null);
  if v_created then
    perform app.notify_org(c.payee_org_id, 'wallet.released', 'Funds are now available',
      'A commission payment cleared and was added to your available balance.', '/wallet');
    perform app.audit(c.payee_org_id, 'wallet.released', 'wallet_transaction', v_tx,
      jsonb_build_object('charge_id', c.id, 'amount_minor', c.payee_net_minor, 'currency', c.currency));
  end if;
  return 'released';
end $$;

-- Checkout abandoned, expired, or an asynchronous payment method failed. Only open charges close.
create or replace function public.wallet_close_placement_charge(p_charge uuid, p_status public.placement_charge_status)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('failed', 'expired') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.placement_charges set status = p_status where id = p_charge and status = 'created';
end $$;

-- Refund or chargeback at the provider after the wallet was credited. The ledger is NOT reversed
-- automatically (the funds may already be spent): the recipient's outgoing movements are frozen
-- and a platform admin decides the correction.
create or replace function public.wallet_flag_placement_charge(p_payment_intent text, p_status public.placement_charge_status)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  c public.placement_charges;
begin
  if p_status not in ('disputed', 'refunded') then raise exception 'invalid_status' using errcode = '22023'; end if;
  select * into c from public.placement_charges where psp_payment_intent_id = p_payment_intent for update;
  if not found then return 'unknown'; end if;
  if c.status not in ('succeeded', 'disputed') then return c.status::text; end if;
  update public.placement_charges set status = p_status where id = c.id;
  insert into public.wallet_freezes (organization_id, reason)
  values (c.payee_org_id, 'Automatic: a commission payment was ' || p_status || ' at the payment provider (charge ' || c.id || ').')
  on conflict (organization_id) do nothing;
  perform app.audit(c.payee_org_id, 'wallet.frozen', 'organization', c.payee_org_id,
    jsonb_build_object('reason', 'charge_' || p_status, 'charge_id', c.id));
  perform app.audit(null, 'placement_charge.' || p_status, 'placement', c.placement_id, jsonb_build_object('charge_id', c.id));
  return p_status::text;
end $$;

-- ---------------------------------------------------------------------------
-- Money out: payout destinations and cash-outs
-- ---------------------------------------------------------------------------
create table public.payout_destinations (
  organization_id uuid primary key references public.organizations (id) on delete restrict,
  psp_account_id text not null unique,
  details_submitted boolean not null default false,
  payouts_enabled boolean not null default false,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger payout_destinations_updated_at before update on public.payout_destinations
  for each row execute function app.set_updated_at();

-- First writer wins; returns the account id on file (which may differ from p_account on a race).
create or replace function public.wallet_set_payout_destination(p_org uuid, p_account text, p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_account text;
begin
  insert into public.payout_destinations (organization_id, psp_account_id, created_by) values (p_org, p_account, p_user)
  on conflict (organization_id) do nothing;
  if found then
    perform app.audit(p_org, 'payout_destination.created', 'organization', p_org, '{}');
  end if;
  select psp_account_id into v_account from public.payout_destinations where organization_id = p_org;
  return v_account;
end $$;

create or replace function public.wallet_update_payout_destination(p_account text, p_details_submitted boolean, p_payouts_enabled boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  d public.payout_destinations;
begin
  select * into d from public.payout_destinations where psp_account_id = p_account for update;
  if not found then return; end if;
  update public.payout_destinations
     set details_submitted = coalesce(p_details_submitted, false), payouts_enabled = coalesce(p_payouts_enabled, false)
   where organization_id = d.organization_id;
  if coalesce(p_payouts_enabled, false) is distinct from d.payouts_enabled then
    perform app.notify_org(d.organization_id, 'wallet.payouts_status',
      case when p_payouts_enabled then 'Payouts are set up' else 'Payouts need attention' end,
      case when p_payouts_enabled then 'Your organization can now withdraw its available balance.'
           else 'The payment provider needs more information before your organization can withdraw.' end, '/wallet');
    perform app.audit(d.organization_id, 'payout_destination.updated', 'organization', d.organization_id,
      jsonb_build_object('payouts_enabled', coalesce(p_payouts_enabled, false)));
  end if;
end $$;

create type public.cashout_status as enum ('requested', 'paid', 'failed');

create table public.cashout_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  amount_minor bigint not null check (amount_minor > 0),
  status public.cashout_status not null default 'requested',
  idempotency_key text not null unique,
  reserve_transaction_id uuid not null references public.wallet_transactions (id),
  psp_transfer_id text unique,
  failure_reason text,
  requested_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index cashout_requests_org_idx on public.cashout_requests (organization_id, created_at desc);

-- Org admin withdraws available funds. The amount leaves `available` immediately (reserved in
-- payout_in_transit), so it cannot be spent twice while the provider transfer is in flight.
create or replace function public.request_cashout(p_org uuid, p_currency char(3), p_amount_minor bigint, p_idempotency_key text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_key text;
  v_id uuid;
  v_tx uuid;
  v_created boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if not app.has_role(p_org, array['org_admin']::public.membership_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not (select cashouts_enabled from public.wallet_settings) then
    raise exception 'wallet_cashouts_disabled' using errcode = 'P0001';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 or p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 100 then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;
  if exists (select 1 from public.wallet_freezes where organization_id = p_org) then
    raise exception 'wallet_frozen' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.payout_destinations where organization_id = p_org and payouts_enabled) then
    raise exception 'payout_destination_required' using errcode = 'P0001';
  end if;

  v_key := 'cashout:' || p_org || ':' || p_idempotency_key;
  select o_transaction, o_created into v_tx, v_created
  from app.wallet_post('cashout', p_currency, v_key,
    array[app.wallet_account(p_org, 'available', p_currency), app.wallet_account(null, 'payout_in_transit', p_currency)],
    array[-p_amount_minor, p_amount_minor]);
  if not v_created then
    select id into v_id from public.cashout_requests where idempotency_key = v_key;
    return v_id;
  end if;

  insert into public.cashout_requests (organization_id, currency, amount_minor, idempotency_key, reserve_transaction_id, requested_by)
  values (p_org, p_currency, p_amount_minor, v_key, v_tx, auth.uid())
  returning id into v_id;
  perform app.enqueue('wallet.cashout', v_id::text, jsonb_build_object('cashout_id', v_id));
  perform app.notify_org(p_org, 'wallet.cashout_requested', 'Withdrawal requested',
    'A withdrawal from your organization''s wallet is being processed.', '/wallet');
  perform app.audit(p_org, 'wallet.cashout_requested', 'cashout_request', v_id,
    jsonb_build_object('amount_minor', p_amount_minor, 'currency', p_currency));
  return v_id;
end $$;

-- The provider accepted the transfer to the connected account: the reserve leaves the platform.
create or replace function public.wallet_complete_cashout(p_cashout uuid, p_transfer text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  r public.cashout_requests;
begin
  select * into r from public.cashout_requests where id = p_cashout for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.status <> 'requested' then return r.status::text; end if;
  perform app.wallet_post('cashout', r.currency, 'cashout-settle:' || r.id,
    array[app.wallet_account(null, 'payout_in_transit', r.currency), app.wallet_account(null, 'psp_clearing', r.currency)],
    array[-r.amount_minor, r.amount_minor]);
  update public.cashout_requests set status = 'paid', psp_transfer_id = p_transfer, completed_at = now() where id = r.id;
  perform app.notify_org(r.organization_id, 'wallet.cashout_paid', 'Withdrawal sent',
    'Your withdrawal was sent to your payout account. Bank arrival follows the payment provider''s schedule.', '/wallet');
  perform app.audit(r.organization_id, 'wallet.cashout_paid', 'cashout_request', r.id,
    jsonb_build_object('amount_minor', r.amount_minor, 'currency', r.currency));
  return 'paid';
end $$;

-- The provider refused the transfer for good: the reserve returns to the available balance.
create or replace function public.wallet_fail_cashout(p_cashout uuid, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  r public.cashout_requests;
begin
  select * into r from public.cashout_requests where id = p_cashout for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.status <> 'requested' then return r.status::text; end if;
  perform app.wallet_post('cashout_reversal', r.currency, 'cashout-reversal:' || r.id,
    array[app.wallet_account(null, 'payout_in_transit', r.currency), app.wallet_account(r.organization_id, 'available', r.currency)],
    array[-r.amount_minor, r.amount_minor], null, null, r.reserve_transaction_id);
  update public.cashout_requests set status = 'failed', failure_reason = left(p_reason, 200), completed_at = now() where id = r.id;
  perform app.notify_org(r.organization_id, 'wallet.cashout_failed', 'Withdrawal failed',
    'Your withdrawal could not be sent. The amount is back in your available balance.', '/wallet');
  perform app.audit(r.organization_id, 'wallet.cashout_failed', 'cashout_request', r.id,
    jsonb_build_object('amount_minor', r.amount_minor, 'currency', r.currency, 'reason', left(p_reason, 200)));
  return 'failed';
end $$;

create or replace function public.set_wallet_cashouts_enabled(p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.wallet_settings set cashouts_enabled = coalesce(p_enabled, false), updated_by = auth.uid(), updated_at = now()
   where id;
  perform app.audit(null, 'wallet.cashouts_toggled', 'wallet_settings', null, jsonb_build_object('enabled', coalesce(p_enabled, false)));
end $$;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.placement_charges enable row level security;
alter table public.payout_destinations enable row level security;
alter table public.cashout_requests enable row level security;

create policy placement_charges_select on public.placement_charges for select to authenticated
  using (app.can_see_placement(placement_id));
create policy payout_destinations_select on public.payout_destinations for select to authenticated
  using (app.is_member(organization_id) or app.is_platform_admin());
create policy cashout_requests_select on public.cashout_requests for select to authenticated
  using (app.is_member(organization_id) or app.is_platform_admin());

revoke all on public.psp_events, public.placement_charges, public.payout_destinations, public.cashout_requests
  from anon, authenticated, service_role;
grant select on public.placement_charges, public.payout_destinations, public.cashout_requests to authenticated, service_role;
grant select on public.psp_events to service_role;

revoke execute on function
  public.psp_record_event(text, text, jsonb),
  public.psp_complete_event(text, text),
  public.create_placement_charge(uuid),
  public.wallet_settle_placement_charge(uuid, text, text, bigint, text, bigint, timestamptz),
  public.wallet_release_placement_charge(uuid),
  public.wallet_close_placement_charge(uuid, public.placement_charge_status),
  public.wallet_flag_placement_charge(text, public.placement_charge_status),
  public.wallet_set_payout_destination(uuid, text, uuid),
  public.wallet_update_payout_destination(text, boolean, boolean),
  public.request_cashout(uuid, char, bigint, text),
  public.wallet_complete_cashout(uuid, text),
  public.wallet_fail_cashout(uuid, text),
  public.set_wallet_cashouts_enabled(boolean)
from public, anon, authenticated, service_role;
grant execute on function
  public.psp_record_event(text, text, jsonb),
  public.psp_complete_event(text, text),
  public.wallet_settle_placement_charge(uuid, text, text, bigint, text, bigint, timestamptz),
  public.wallet_release_placement_charge(uuid),
  public.wallet_close_placement_charge(uuid, public.placement_charge_status),
  public.wallet_flag_placement_charge(text, public.placement_charge_status),
  public.wallet_set_payout_destination(uuid, text, uuid),
  public.wallet_update_payout_destination(text, boolean, boolean),
  public.wallet_complete_cashout(uuid, text),
  public.wallet_fail_cashout(uuid, text)
to service_role;
grant execute on function
  public.create_placement_charge(uuid),
  public.request_cashout(uuid, char, bigint, text),
  public.set_wallet_cashouts_enabled(boolean)
to authenticated;
