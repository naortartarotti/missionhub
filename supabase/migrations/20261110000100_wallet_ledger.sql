-- Wallet ledger (phase 1): internal double-entry book of where money is.
--
-- The commission ledger (20261107000500) still answers "who owes what for a placement".
-- This ledger answers "which organization holds which balance". Real funds are held by the
-- payment provider; a wallet balance is the organization's claim on them (ADR 0005).
--
-- Invariants, each enforced in the database:
--   * every transaction's entries sum to zero (deferred constraint trigger);
--   * entries and transactions are immutable — corrections are new, compensating transactions;
--   * an organization's balance can never go below zero (check constraint);
--   * balances only change through app.wallet_post (guard trigger + no DML grants, service_role included);
--   * every posting is idempotent on a unique key.
--
-- Sign convention: organization and revenue accounts are liabilities (positive = owed to them);
-- psp_clearing mirrors the cash held at the provider and is therefore negative.

create type public.wallet_account_kind as enum (
  'available', 'pending',                                             -- organization accounts
  'psp_clearing', 'platform_revenue', 'payout_in_transit', 'psp_fees' -- system accounts
);
create type public.wallet_transaction_kind as enum (
  'placement_funding', 'release', 'transfer', 'cashout', 'cashout_reversal', 'reversal', 'adjustment'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.wallet_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete restrict,
  kind public.wallet_account_kind not null,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  balance_minor bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((organization_id is not null) = (kind in ('available', 'pending'))),
  check (organization_id is null or balance_minor >= 0)
);
create unique index wallet_accounts_org_unique on public.wallet_accounts (organization_id, kind, currency)
  where organization_id is not null;
create unique index wallet_accounts_system_unique on public.wallet_accounts (kind, currency)
  where organization_id is null;

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  kind public.wallet_transaction_kind not null,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  amount_minor bigint not null check (amount_minor > 0), -- sum of the credit legs
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 200),
  placement_id uuid references public.placements (id) on delete restrict,
  reverses_transaction_id uuid references public.wallet_transactions (id),
  memo text check (char_length(memo) <= 280),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index wallet_transactions_placement_idx on public.wallet_transactions (placement_id) where placement_id is not null;

create table public.wallet_entries (
  id bigint generated always as identity primary key,
  transaction_id uuid not null references public.wallet_transactions (id) on delete restrict,
  account_id uuid not null references public.wallet_accounts (id) on delete restrict,
  amount_minor bigint not null check (amount_minor <> 0),
  balance_after_minor bigint not null,
  created_at timestamptz not null default now(),
  unique (transaction_id, account_id)
);
create index wallet_entries_account_idx on public.wallet_entries (account_id, id desc);

-- A frozen organization cannot move money out (transfers, cash-outs). Credits still land.
create table public.wallet_freezes (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 500),
  frozen_by uuid references auth.users (id),
  frozen_at timestamptz not null default now()
);

-- Platform-wide switches. Recruiter-to-recruiter transfers stay off until limits, MFA and the
-- legal review are in place.
create table public.wallet_settings (
  id boolean primary key default true check (id),
  transfers_enabled boolean not null default false,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);
insert into public.wallet_settings (id) values (true);

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------
create trigger wallet_transactions_immutable before update or delete on public.wallet_transactions
  for each row execute function app.prevent_mutation();
create trigger wallet_entries_immutable before update or delete on public.wallet_entries
  for each row execute function app.prevent_mutation();

create or replace function app.guard_wallet_account() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'wallet accounts cannot be deleted' using errcode = 'P0001';
  end if;
  if (new.id, new.organization_id, new.kind, new.currency)
     is distinct from (old.id, old.organization_id, old.kind, old.currency) then
    raise exception 'wallet account identity is immutable' using errcode = 'P0001';
  end if;
  if new.balance_minor is distinct from old.balance_minor
     and coalesce(current_setting('app.wallet_posting', true), '') <> 'on' then
    raise exception 'wallet balances only change through ledger postings' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger wallet_accounts_guard before update or delete on public.wallet_accounts
  for each row execute function app.guard_wallet_account();

-- SECURITY DEFINER: the deferred check runs at commit as the calling role, where RLS would hide
-- the counterparty's entry and make a balanced transfer look unbalanced.
create or replace function app.assert_wallet_transaction_balanced() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_sum bigint;
  v_count integer;
begin
  select coalesce(sum(amount_minor), 0), count(*) into v_sum, v_count
  from public.wallet_entries where transaction_id = new.transaction_id;
  if v_sum <> 0 or v_count < 2 then
    raise exception 'unbalanced_wallet_transaction: % (sum %, % entries)', new.transaction_id, v_sum, v_count
      using errcode = 'P0001';
  end if;
  return null;
end $$;
create constraint trigger wallet_entries_balanced after insert on public.wallet_entries
  deferrable initially deferred
  for each row execute function app.assert_wallet_transaction_balanced();

-- ---------------------------------------------------------------------------
-- Ledger engine (internal)
-- ---------------------------------------------------------------------------

-- Get-or-create. p_org null → system account.
create or replace function app.wallet_account(p_org uuid, p_kind public.wallet_account_kind, p_currency char(3))
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid_currency' using errcode = '22023';
  end if;
  if p_org is not null then
    insert into public.wallet_accounts (organization_id, kind, currency) values (p_org, p_kind, p_currency)
    on conflict (organization_id, kind, currency) where organization_id is not null do nothing;
    select id into v_id from public.wallet_accounts
     where organization_id = p_org and kind = p_kind and currency = p_currency;
  else
    insert into public.wallet_accounts (organization_id, kind, currency) values (null, p_kind, p_currency)
    on conflict (kind, currency) where organization_id is null do nothing;
    select id into v_id from public.wallet_accounts
     where organization_id is null and kind = p_kind and currency = p_currency;
  end if;
  return v_id;
end $$;

-- The only writer of entries and balances. Legs are parallel arrays (account, signed amount).
-- Replaying a key returns the original transaction with o_created = false; replaying it with
-- different parameters is an error, never a second posting.
create or replace function app.wallet_post(
  p_kind public.wallet_transaction_kind,
  p_currency char(3),
  p_idempotency_key text,
  p_accounts uuid[],
  p_amounts bigint[],
  p_placement uuid default null,
  p_memo text default null,
  p_reverses uuid default null,
  out o_transaction uuid,
  out o_created boolean
)
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer := coalesce(cardinality(p_accounts), 0);
  v_sum numeric := 0;
  v_credit numeric := 0;
  v_existing public.wallet_transactions;
  v_acc public.wallet_accounts;
  v_new bigint;
  i integer;
begin
  if v_n < 2 or v_n <> coalesce(cardinality(p_amounts), 0) then
    raise exception 'invalid_wallet_legs' using errcode = '22023';
  end if;
  if (select count(distinct a) from unnest(p_accounts) a) <> v_n then
    raise exception 'invalid_wallet_legs: duplicate account' using errcode = '22023';
  end if;
  for i in 1 .. v_n loop
    if p_accounts[i] is null or p_amounts[i] is null or p_amounts[i] = 0 then
      raise exception 'invalid_wallet_legs' using errcode = '22023';
    end if;
    v_sum := v_sum + p_amounts[i];
    if p_amounts[i] > 0 then v_credit := v_credit + p_amounts[i]; end if;
  end loop;
  if v_sum <> 0 then raise exception 'unbalanced_wallet_transaction' using errcode = 'P0001'; end if;

  -- A concurrent posting with the same key blocks here until it commits, then conflicts.
  insert into public.wallet_transactions
    (kind, currency, amount_minor, idempotency_key, placement_id, reverses_transaction_id, memo, created_by)
  values (p_kind, p_currency, v_credit::bigint, p_idempotency_key, p_placement, p_reverses, p_memo, auth.uid())
  on conflict (idempotency_key) do nothing
  returning id into o_transaction;

  if o_transaction is null then
    select * into v_existing from public.wallet_transactions where idempotency_key = p_idempotency_key;
    if v_existing.kind <> p_kind or v_existing.currency <> p_currency or v_existing.amount_minor <> v_credit
       or exists (
         select 1 from unnest(p_accounts, p_amounts) as l(account_id, amount_minor)
         where not exists (
           select 1 from public.wallet_entries e
           where e.transaction_id = v_existing.id and e.account_id = l.account_id and e.amount_minor = l.amount_minor
         )
       ) then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    o_transaction := v_existing.id;
    o_created := false;
    return;
  end if;

  -- Lock every account in one deterministic order so opposite transfers cannot deadlock.
  perform 1 from public.wallet_accounts where id = any (p_accounts) order by id for update;

  perform set_config('app.wallet_posting', 'on', true);
  for i in 1 .. v_n loop
    select * into v_acc from public.wallet_accounts where id = p_accounts[i];
    if not found or v_acc.currency <> p_currency then
      raise exception 'wallet_account_mismatch' using errcode = 'P0001';
    end if;
    v_new := v_acc.balance_minor + p_amounts[i];
    if v_acc.organization_id is not null and v_new < 0 then
      raise exception 'insufficient_funds' using errcode = 'P0001';
    end if;
    update public.wallet_accounts set balance_minor = v_new where id = v_acc.id;
    insert into public.wallet_entries (transaction_id, account_id, amount_minor, balance_after_minor)
    values (o_transaction, v_acc.id, p_amounts[i], v_new);
  end loop;
  perform set_config('app.wallet_posting', 'off', true);
  o_created := true;
end $$;

create or replace function app.can_see_wallet_account(p_account uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_platform_admin() or exists (
    select 1 from public.wallet_accounts a
    where a.id = p_account and a.organization_id is not null and app.is_member(a.organization_id)
  );
$$;

create or replace function app.can_see_wallet_transaction(p_transaction uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_platform_admin() or exists (
    select 1 from public.wallet_entries e
    join public.wallet_accounts a on a.id = e.account_id
    where e.transaction_id = p_transaction and a.organization_id is not null and app.is_member(a.organization_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- Use cases: system (service_role only — called by the payment webhook worker)
-- ---------------------------------------------------------------------------

-- Money arrived at the provider for an organization. The organization's share lands in
-- `pending`; the platform fee, if any, is recognised as revenue in the same transaction.
create or replace function public.wallet_record_funding(
  p_org uuid, p_currency char(3), p_amount_minor bigint, p_platform_fee_minor bigint,
  p_placement uuid, p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_fee bigint := coalesce(p_platform_fee_minor, 0);
  v_accounts uuid[];
  v_amounts bigint[];
  v_tx uuid;
  v_created boolean;
begin
  if p_amount_minor is null or p_amount_minor <= 0 or v_fee < 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organizations where id = p_org) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_accounts := array[app.wallet_account(null, 'psp_clearing', p_currency), app.wallet_account(p_org, 'pending', p_currency)];
  v_amounts := array[-(p_amount_minor + v_fee), p_amount_minor];
  if v_fee > 0 then
    v_accounts := v_accounts || app.wallet_account(null, 'platform_revenue', p_currency);
    v_amounts := v_amounts || v_fee;
  end if;
  select o_transaction, o_created into v_tx, v_created
  from app.wallet_post('placement_funding', p_currency, p_idempotency_key, v_accounts, v_amounts, p_placement, null);
  if v_created then
    perform app.notify_org(p_org, 'wallet.funded', 'Funds received in your wallet',
      'A payment was received. It becomes available once it clears.', '/wallet');
    perform app.audit(p_org, 'wallet.funded', 'wallet_transaction', v_tx,
      jsonb_build_object('amount_minor', p_amount_minor, 'currency', p_currency, 'placement_id', p_placement));
  end if;
  return v_tx;
end $$;

-- Cleared funds move from pending to available.
create or replace function public.wallet_release_pending(
  p_org uuid, p_currency char(3), p_amount_minor bigint, p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_tx uuid;
  v_created boolean;
begin
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  select o_transaction, o_created into v_tx, v_created
  from app.wallet_post('release', p_currency, p_idempotency_key,
    array[app.wallet_account(p_org, 'pending', p_currency), app.wallet_account(p_org, 'available', p_currency)],
    array[-p_amount_minor, p_amount_minor]);
  if v_created then
    perform app.notify_org(p_org, 'wallet.released', 'Funds are now available',
      'A payment cleared and was added to your available balance.', '/wallet');
    perform app.audit(p_org, 'wallet.released', 'wallet_transaction', v_tx,
      jsonb_build_object('amount_minor', p_amount_minor, 'currency', p_currency));
  end if;
  return v_tx;
end $$;

-- Reconciliation: accounts whose cached balance disagrees with their entries, plus one row
-- (account_id null) if the whole book does not sum to zero. Empty result = healthy.
create or replace function public.wallet_reconcile()
returns table (account_id uuid, cached_minor bigint, computed_minor bigint)
language sql stable security definer set search_path = '' as $$
  select a.id, a.balance_minor, coalesce(s.total, 0)::bigint
  from public.wallet_accounts a
  left join (select e.account_id, sum(e.amount_minor) as total from public.wallet_entries e group by e.account_id) s
    on s.account_id = a.id
  where a.balance_minor <> coalesce(s.total, 0)
  union all
  select null::uuid, 0::bigint, t.total::bigint
  from (select coalesce(sum(e.amount_minor), 0) as total from public.wallet_entries e) t
  where t.total <> 0;
$$;

-- ---------------------------------------------------------------------------
-- Use cases: users
-- ---------------------------------------------------------------------------

-- Org admin sends available funds to a partner organization. Atomic and final.
create or replace function public.wallet_transfer(
  p_from_org uuid, p_to_org uuid, p_currency char(3), p_amount_minor bigint, p_memo text, p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_tx uuid;
  v_created boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if not app.has_role(p_from_org, array['org_admin']::public.membership_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not (select transfers_enabled from public.wallet_settings) then
    raise exception 'wallet_transfers_disabled' using errcode = 'P0001';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 or p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 100 then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;
  -- Recipients are limited to organizations this one already shares a referral with. The same
  -- error covers "no such organization", so the RPC cannot be used to probe for tenants.
  if p_to_org is null or p_to_org = p_from_org or not exists (
    select 1 from public.referrals r
    where (r.source_org_id = p_from_org and r.target_org_id = p_to_org)
       or (r.source_org_id = p_to_org and r.target_org_id = p_from_org)
  ) then
    raise exception 'invalid_recipient' using errcode = 'P0001';
  end if;
  perform app.assert_pairable(p_from_org, p_to_org, true);
  if exists (select 1 from public.wallet_freezes where organization_id = p_from_org) then
    raise exception 'wallet_frozen' using errcode = 'P0001';
  end if;

  -- The key is namespaced by sender so one tenant can never collide with another's keys.
  select o_transaction, o_created into v_tx, v_created
  from app.wallet_post('transfer', p_currency, 'transfer:' || p_from_org || ':' || p_idempotency_key,
    array[app.wallet_account(p_from_org, 'available', p_currency), app.wallet_account(p_to_org, 'available', p_currency)],
    array[-p_amount_minor, p_amount_minor], null, nullif(left(btrim(coalesce(p_memo, '')), 280), ''));
  if v_created then
    perform app.notify_org(p_from_org, 'wallet.transfer_sent', 'Wallet transfer sent',
      'A transfer left your organization''s wallet.', '/wallet');
    perform app.notify_org(p_to_org, 'wallet.transfer_received', 'Wallet transfer received',
      'A partner sent funds to your organization''s wallet.', '/wallet');
    perform app.audit(p_from_org, 'wallet.transfer_sent', 'wallet_transaction', v_tx,
      jsonb_build_object('amount_minor', p_amount_minor, 'currency', p_currency, 'to_org', p_to_org));
    perform app.audit(p_to_org, 'wallet.transfer_received', 'wallet_transaction', v_tx,
      jsonb_build_object('amount_minor', p_amount_minor, 'currency', p_currency, 'from_org', p_from_org));
  end if;
  return v_tx;
end $$;

-- Platform admin: freeze / unfreeze an organization's outgoing wallet movements.
create or replace function public.set_wallet_frozen(p_org uuid, p_frozen boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_frozen then
    insert into public.wallet_freezes (organization_id, reason, frozen_by) values (p_org, p_reason, auth.uid())
    on conflict (organization_id) do update set reason = excluded.reason, frozen_by = excluded.frozen_by, frozen_at = now();
  else
    delete from public.wallet_freezes where organization_id = p_org;
  end if;
  perform app.audit(p_org, case when p_frozen then 'wallet.frozen' else 'wallet.unfrozen' end, 'organization', p_org,
    jsonb_build_object('reason', left(p_reason, 500)));
end $$;

create or replace function public.set_wallet_transfers_enabled(p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.wallet_settings set transfers_enabled = coalesce(p_enabled, false), updated_by = auth.uid(), updated_at = now()
   where id;
  perform app.audit(null, 'wallet.transfers_toggled', 'wallet_settings', null, jsonb_build_object('enabled', coalesce(p_enabled, false)));
end $$;

-- ---------------------------------------------------------------------------
-- RLS and grants: read-only for members, no direct writes for anyone (service_role included)
-- ---------------------------------------------------------------------------
alter table public.wallet_accounts enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.wallet_entries enable row level security;
alter table public.wallet_freezes enable row level security;
alter table public.wallet_settings enable row level security;

create policy wallet_accounts_select on public.wallet_accounts for select to authenticated
  using ((organization_id is not null and app.is_member(organization_id)) or app.is_platform_admin());
create policy wallet_entries_select on public.wallet_entries for select to authenticated
  using (app.can_see_wallet_account(account_id));
create policy wallet_transactions_select on public.wallet_transactions for select to authenticated
  using (app.can_see_wallet_transaction(id));
create policy wallet_freezes_select on public.wallet_freezes for select to authenticated
  using (app.is_member(organization_id) or app.is_platform_admin());
create policy wallet_settings_select on public.wallet_settings for select to authenticated using (true);

revoke all on public.wallet_accounts, public.wallet_transactions, public.wallet_entries,
  public.wallet_freezes, public.wallet_settings from anon, authenticated, service_role;
grant select on public.wallet_accounts, public.wallet_transactions, public.wallet_entries,
  public.wallet_freezes, public.wallet_settings to authenticated, service_role;

revoke execute on function
  app.guard_wallet_account(),
  app.assert_wallet_transaction_balanced(),
  app.wallet_account(uuid, public.wallet_account_kind, char),
  app.wallet_post(public.wallet_transaction_kind, char, text, uuid[], bigint[], uuid, text, uuid),
  app.can_see_wallet_account(uuid),
  app.can_see_wallet_transaction(uuid)
from public, anon, authenticated, service_role;
grant execute on function app.can_see_wallet_account(uuid), app.can_see_wallet_transaction(uuid) to authenticated;

revoke execute on function
  public.wallet_record_funding(uuid, char, bigint, bigint, uuid, text),
  public.wallet_release_pending(uuid, char, bigint, text),
  public.wallet_reconcile(),
  public.wallet_transfer(uuid, uuid, char, bigint, text, text),
  public.set_wallet_frozen(uuid, boolean, text),
  public.set_wallet_transfers_enabled(boolean)
from public, anon, authenticated, service_role;
grant execute on function
  public.wallet_record_funding(uuid, char, bigint, bigint, uuid, text),
  public.wallet_release_pending(uuid, char, bigint, text),
  public.wallet_reconcile()
to service_role;
grant execute on function
  public.wallet_transfer(uuid, uuid, char, bigint, text, text),
  public.set_wallet_frozen(uuid, boolean, text),
  public.set_wallet_transfers_enabled(boolean)
to authenticated;
