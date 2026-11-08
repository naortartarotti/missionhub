-- Placement finance: versioned commission rules, frozen agreement snapshots, placements,
-- evidence-based verification, and an immutable double-check ledger.
-- No money moves through the platform. The ledger records verified external events only.

create type public.agreement_status as enum ('pending_source', 'active', 'terminated');
create type public.placement_status as enum (
  'hire_reported', 'invoiced', 'payment_partially_verified', 'commission_payable', 'settled', 'disputed', 'cancelled'
);
create type public.evidence_kind as enum ('client_payment', 'sourcing_payout', 'platform_remittance', 'client_refund');
create type public.evidence_status as enum ('pending', 'verified', 'rejected');
create type public.ledger_party as enum ('job_owner', 'sourcing', 'platform', 'client');
create type public.ledger_entry_type as enum (
  'fee_received', 'allocation', 'payout', 'remittance', 'refund', 'allocation_reversal', 'adjustment'
);

-- ---------------------------------------------------------------------------
-- Commission rules (global, versioned). Basis points, must total 10,000.
-- ---------------------------------------------------------------------------
create table public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version integer not null,
  sourcing_bps integer not null check (sourcing_bps between 0 and 10000),
  job_owner_bps integer not null check (job_owner_bps between 0 and 10000),
  platform_bps integer not null check (platform_bps between 0 and 10000),
  is_default boolean not null default false,
  effective_from timestamptz not null default now(),
  retired_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (name, version),
  check (sourcing_bps + job_owner_bps + platform_bps = 10000)
);
create unique index commission_rules_single_default on public.commission_rules (is_default) where is_default;
create trigger commission_rules_immutable before delete on public.commission_rules
  for each row execute function app.prevent_mutation();
create or replace function app.guard_rule_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.sourcing_bps, new.job_owner_bps, new.platform_bps, new.version, new.name)
     is distinct from (old.sourcing_bps, old.job_owner_bps, old.platform_bps, old.version, old.name) then
    raise exception 'commission rules are versioned; create a new version instead' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger commission_rules_guard before update on public.commission_rules
  for each row execute function app.guard_rule_update();

insert into public.commission_rules (name, version, sourcing_bps, job_owner_bps, platform_bps, is_default)
values ('Standard marketplace split', 1, 4500, 4500, 1000, true);

-- ---------------------------------------------------------------------------
-- Collaboration agreements (snapshot frozen at acceptance)
-- ---------------------------------------------------------------------------
create table public.collaboration_agreements (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null unique references public.referrals (id) on delete restrict,
  rule_id uuid not null references public.commission_rules (id),
  rule_name text not null,
  rule_version integer not null,
  sourcing_bps integer not null,
  job_owner_bps integer not null,
  platform_bps integer not null,
  terms_version text not null default 'draft-2026-11 (legal review required)',
  status public.agreement_status not null default 'pending_source',
  target_accepted_by uuid references auth.users (id),
  target_accepted_at timestamptz,
  source_accepted_by uuid references auth.users (id),
  source_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (sourcing_bps + job_owner_bps + platform_bps = 10000)
);
create or replace function app.guard_agreement_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.sourcing_bps, new.job_owner_bps, new.platform_bps, new.rule_id, new.referral_id)
     is distinct from (old.sourcing_bps, old.job_owner_bps, old.platform_bps, old.rule_id, old.referral_id) then
    raise exception 'agreement snapshot is immutable' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger collaboration_agreements_guard before update on public.collaboration_agreements
  for each row execute function app.guard_agreement_update();

create or replace function app.create_agreement_for_referral(p_referral uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_rule public.commission_rules;
  v_id uuid;
begin
  select * into v_rule from public.commission_rules where is_default and retired_at is null;
  if not found then raise exception 'no_default_commission_rule' using errcode = 'P0001'; end if;
  insert into public.collaboration_agreements (referral_id, rule_id, rule_name, rule_version,
    sourcing_bps, job_owner_bps, platform_bps, target_accepted_by, target_accepted_at)
  values (p_referral, v_rule.id, v_rule.name, v_rule.version,
    v_rule.sourcing_bps, v_rule.job_owner_bps, v_rule.platform_bps, auth.uid(), now())
  on conflict (referral_id) do nothing
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.confirm_agreement(p_referral uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
begin
  select * into r from public.referrals where id = p_referral;
  if not found or not app.is_member(r.source_org_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.collaboration_agreements
     set status = 'active', source_accepted_by = auth.uid(), source_accepted_at = now()
   where referral_id = p_referral and status = 'pending_source';
  if not found then raise exception 'agreement_not_pending' using errcode = 'P0001'; end if;
  perform app.notify_org(r.target_org_id, 'agreement.active', 'Collaboration agreement confirmed',
    r.job_title_snapshot || ' — the partner recruiter confirmed the commission terms.', '/referrals/' || r.id);
  perform app.audit(r.source_org_id, 'agreement.confirmed', 'referral', r.id, '{}');
end $$;

-- ---------------------------------------------------------------------------
-- Placements and evidence
-- ---------------------------------------------------------------------------
create table public.placements (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null unique references public.referrals (id) on delete restrict,
  agreement_id uuid not null references public.collaboration_agreements (id),
  source_org_id uuid not null references public.organizations (id),
  target_org_id uuid not null references public.organizations (id),
  status public.placement_status not null default 'hire_reported',
  status_before_dispute public.placement_status,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  contracted_fee_minor bigint not null check (contracted_fee_minor > 0),
  start_date date not null,
  guarantee_until date,
  reported_by uuid not null references auth.users (id),
  settled_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index placements_source_idx on public.placements (source_org_id, status);
create index placements_target_idx on public.placements (target_org_id, status);
create trigger placements_updated_at before update on public.placements
  for each row execute function app.set_updated_at();

create table public.placement_status_events (
  id bigint generated always as identity primary key,
  placement_id uuid not null references public.placements (id) on delete cascade,
  from_status public.placement_status,
  to_status public.placement_status not null,
  actor_id uuid references auth.users (id),
  reason text,
  created_at timestamptz not null default now()
);
create trigger placement_status_events_immutable before update or delete on public.placement_status_events
  for each row execute function app.prevent_mutation();

create table public.invoice_records (
  id uuid primary key default gen_random_uuid(),
  placement_id uuid not null references public.placements (id) on delete restrict,
  invoice_number text not null check (char_length(invoice_number) between 1 and 80),
  amount_minor bigint not null check (amount_minor > 0),
  tax_minor bigint not null default 0 check (tax_minor >= 0),
  currency char(3) not null,
  issued_on date not null,
  due_on date,
  recorded_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (placement_id, invoice_number)
);
create trigger invoice_records_immutable before update or delete on public.invoice_records
  for each row execute function app.prevent_mutation();

create table public.payment_evidence (
  id uuid primary key default gen_random_uuid(),
  placement_id uuid not null references public.placements (id) on delete restrict,
  kind public.evidence_kind not null,
  amount_minor bigint not null check (amount_minor > 0),
  processing_fee_minor bigint not null default 0 check (processing_fee_minor >= 0),
  currency char(3) not null,
  occurred_on date not null,
  reference text not null check (char_length(reference) between 3 and 200),
  notes text check (char_length(notes) <= 2000),
  status public.evidence_status not null default 'pending',
  idempotency_key text not null unique,
  recorded_by uuid not null references auth.users (id),
  recorded_by_org uuid references public.organizations (id),
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  check (processing_fee_minor <= amount_minor)
);
create index payment_evidence_placement_idx on public.payment_evidence (placement_id, status);

create table public.commission_ledger_entries (
  id bigint generated always as identity primary key,
  placement_id uuid not null references public.placements (id) on delete restrict,
  entry_type public.ledger_entry_type not null,
  party public.ledger_party not null,
  organization_id uuid references public.organizations (id),
  amount_minor bigint not null,
  currency char(3) not null,
  payment_evidence_id uuid references public.payment_evidence (id),
  reverses_entry_id bigint references public.commission_ledger_entries (id),
  memo text,
  idempotency_key text not null unique,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index ledger_placement_idx on public.commission_ledger_entries (placement_id, created_at);
create index ledger_org_idx on public.commission_ledger_entries (organization_id, created_at);
create trigger ledger_immutable before update or delete on public.commission_ledger_entries
  for each row execute function app.prevent_mutation();

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  placement_id uuid not null references public.placements (id) on delete restrict,
  opened_by uuid not null references auth.users (id),
  opened_by_org uuid not null references public.organizations (id),
  reason text not null check (char_length(reason) between 10 and 4000),
  status text not null default 'open' check (status in ('open', 'resolved', 'rejected')),
  resolution text,
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index disputes_one_open on public.disputes (placement_id) where status = 'open';

-- ---------------------------------------------------------------------------
-- Money: deterministic largest-remainder allocation in integer minor units.
-- Ties broken by array order. Mirrors src/lib/money/allocate.ts (parity-tested).
-- ---------------------------------------------------------------------------
create or replace function app.allocate_minor(p_amount bigint, p_bps integer[]) returns bigint[]
language plpgsql immutable set search_path = '' as $$
declare
  v_sign integer := case when p_amount < 0 then -1 else 1 end;
  v_abs bigint := abs(p_amount);
  v_total integer := 0;
  v_base bigint[] := '{}';
  v_rem bigint[] := '{}';
  v_left bigint;
  v_idx integer;
  i integer;
begin
  for i in 1 .. cardinality(p_bps) loop
    if p_bps[i] < 0 then raise exception 'negative share'; end if;
    v_total := v_total + p_bps[i];
  end loop;
  if v_total <> 10000 then raise exception 'shares must total 10000 bps, got %', v_total; end if;
  for i in 1 .. cardinality(p_bps) loop
    v_base := v_base || ((v_abs * p_bps[i]) / 10000);
    v_rem := v_rem || ((v_abs * p_bps[i]) % 10000);
  end loop;
  v_left := v_abs;
  for i in 1 .. cardinality(p_bps) loop v_left := v_left - v_base[i]; end loop;
  while v_left > 0 loop
    v_idx := 1;
    for i in 2 .. cardinality(p_bps) loop
      if v_rem[i] > v_rem[v_idx] then v_idx := i; end if;
    end loop;
    v_base[v_idx] := v_base[v_idx] + 1;
    v_rem[v_idx] := -1;
    v_left := v_left - 1;
  end loop;
  for i in 1 .. cardinality(p_bps) loop v_base[i] := v_base[i] * v_sign; end loop;
  return v_base;
end $$;

create or replace function app.placement_transition(p_placement uuid, p_to public.placement_status, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_from public.placement_status;
begin
  select status into v_from from public.placements where id = p_placement for update;
  if v_from = p_to then return; end if;
  update public.placements set status = p_to, version = version + 1,
    settled_at = case when p_to = 'settled' then now() else settled_at end
   where id = p_placement;
  insert into public.placement_status_events (placement_id, from_status, to_status, actor_id, reason)
  values (p_placement, v_from, p_to, auth.uid(), p_reason);
end $$;

-- ---------------------------------------------------------------------------
-- Use cases
-- ---------------------------------------------------------------------------

-- Job owner reports the hire: offer → hired and placement creation in one transaction.
create or replace function public.report_hire(
  p_referral uuid, p_fee_minor bigint, p_currency char(3), p_start_date date, p_expected_version integer,
  p_guarantee_days integer default 90
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  a public.collaboration_agreements;
  v_id uuid;
begin
  select * into r from public.referrals where id = p_referral for update;
  if not found or not app.is_member(r.target_org_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.version <> p_expected_version then raise exception 'stale_version' using errcode = 'P0001'; end if;
  if r.status <> 'offer' then raise exception 'invalid_transition: % -> hired', r.status using errcode = 'P0001'; end if;
  select * into a from public.collaboration_agreements where referral_id = r.id and status = 'active';
  if not found then raise exception 'agreement_required' using errcode = 'P0001'; end if;
  if p_fee_minor is null or p_fee_minor <= 0 or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid_fee' using errcode = '22023';
  end if;

  update public.referrals set status = 'hired', version = version + 1 where id = r.id;
  insert into public.referral_status_events (referral_id, from_status, to_status, actor_id, actor_side, reason)
  values (r.id, 'offer', 'hired', auth.uid(), 'target', 'Hire reported');

  insert into public.placements (referral_id, agreement_id, source_org_id, target_org_id, currency,
    contracted_fee_minor, start_date, guarantee_until, reported_by)
  values (r.id, a.id, r.source_org_id, r.target_org_id, p_currency, p_fee_minor, p_start_date,
    p_start_date + greatest(0, p_guarantee_days), auth.uid())
  returning id into v_id;
  insert into public.placement_status_events (placement_id, from_status, to_status, actor_id, reason)
  values (v_id, null, 'hire_reported', auth.uid(), 'Hire reported by job owner');

  perform app.notify_org(r.source_org_id, 'placement.hired', 'Your candidate was hired',
    r.job_title_snapshot || ' — commission is projected until the client payment is verified.', '/commissions/' || v_id);
  perform app.audit(r.target_org_id, 'placement.created', 'placement', v_id,
    jsonb_build_object('fee_minor', p_fee_minor, 'currency', p_currency));
  return v_id;
end $$;

create or replace function public.record_invoice(
  p_placement uuid, p_number text, p_amount_minor bigint, p_tax_minor bigint, p_issued_on date, p_due_on date
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p public.placements;
  v_id uuid;
begin
  select * into p from public.placements where id = p_placement for update;
  if not found or not app.is_member(p.target_org_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p.status in ('settled', 'cancelled', 'disputed') then raise exception 'placement_locked' using errcode = 'P0001'; end if;
  insert into public.invoice_records (placement_id, invoice_number, amount_minor, tax_minor, currency, issued_on, due_on, recorded_by)
  values (p.id, p_number, p_amount_minor, coalesce(p_tax_minor, 0), p.currency, p_issued_on, p_due_on, auth.uid())
  returning id into v_id;
  if p.status = 'hire_reported' then
    perform app.placement_transition(p.id, 'invoiced', 'Invoice ' || p_number || ' recorded');
  end if;
  perform app.audit(p.target_org_id, 'placement.invoice_recorded', 'placement', p.id, jsonb_build_object('invoice_id', v_id));
  return v_id;
end $$;

-- Who may record which evidence: client payments/refunds & payouts/remittances are reported by the job owner.
create or replace function public.record_payment_evidence(
  p_placement uuid, p_kind public.evidence_kind, p_amount_minor bigint, p_processing_fee_minor bigint,
  p_occurred_on date, p_reference text, p_notes text, p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p public.placements;
  v_id uuid;
begin
  select id into v_id from public.payment_evidence where idempotency_key = p_idempotency_key;
  if v_id is not null then return v_id; end if;

  select * into p from public.placements where id = p_placement for update;
  if not found or not app.is_member(p.target_org_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p.status in ('settled', 'cancelled', 'disputed') then raise exception 'placement_locked' using errcode = 'P0001'; end if;
  if p_kind = 'client_payment' and not exists (select 1 from public.invoice_records where placement_id = p.id) then
    raise exception 'invoice_required' using errcode = 'P0001';
  end if;
  if p_kind in ('sourcing_payout', 'platform_remittance')
     and p.status not in ('commission_payable', 'payment_partially_verified') then
    raise exception 'commission_not_payable' using errcode = 'P0001';
  end if;

  insert into public.payment_evidence (placement_id, kind, amount_minor, processing_fee_minor, currency, occurred_on,
    reference, notes, idempotency_key, recorded_by, recorded_by_org)
  values (p.id, p_kind, p_amount_minor, coalesce(p_processing_fee_minor, 0), p.currency, p_occurred_on,
    p_reference, p_notes, p_idempotency_key, auth.uid(), p.target_org_id)
  returning id into v_id;

  if p_kind = 'sourcing_payout' then
    perform app.notify_org(p.source_org_id, 'commission.payout_reported', 'Payout reported — please confirm receipt',
      'The partner recruiter reported a commission payout. Confirm once the funds arrive.', '/commissions/' || p.id);
  end if;
  perform app.audit(p.target_org_id, 'evidence.recorded', 'placement', p.id,
    jsonb_build_object('evidence_id', v_id, 'kind', p_kind, 'amount_minor', p_amount_minor));
  return v_id;
end $$;

-- Four-eyes verification:
--   client_payment / client_refund / platform_remittance → platform admin
--   sourcing_payout → the sourcing organization (confirms receipt) or platform admin
-- The recorder can never verify their own evidence.
create or replace function public.review_payment_evidence(p_evidence uuid, p_approve boolean, p_note text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.payment_evidence;
  p public.placements;
  a public.collaboration_agreements;
  v_alloc bigint[];
  v_distributable bigint;
  v_received bigint;
  v_sourcing_due bigint;
  v_platform_due bigint;
begin
  select * into e from public.payment_evidence where id = p_evidence for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into p from public.placements where id = e.placement_id for update;
  select * into a from public.collaboration_agreements where id = p.agreement_id;

  if e.recorded_by = auth.uid() then raise exception 'four_eyes_required' using errcode = '42501'; end if;
  if not (
    app.is_platform_admin()
    or (e.kind = 'sourcing_payout' and app.has_role(p.source_org_id, array['org_admin','recruiter_manager','recruiter']::public.membership_role[]))
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if e.status <> 'pending' then raise exception 'already_reviewed' using errcode = 'P0001'; end if;
  if p.status = 'disputed' then raise exception 'placement_locked' using errcode = 'P0001'; end if;

  update public.payment_evidence
     set status = case when p_approve then 'verified'::public.evidence_status else 'rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(p_note, 1000)
   where id = e.id;

  if not p_approve then
    perform app.audit(p.target_org_id, 'evidence.rejected', 'placement', p.id, jsonb_build_object('evidence_id', e.id));
    return;
  end if;

  -- Payouts may never exceed the outstanding verified obligation.
  if e.kind = 'sourcing_payout' and e.amount_minor > (
    select coalesce(sum(amount_minor), 0) from public.commission_ledger_entries where placement_id = p.id and party = 'sourcing'
  ) then
    raise exception 'payout_exceeds_balance' using errcode = 'P0001';
  end if;
  if e.kind = 'platform_remittance' and e.amount_minor > (
    select coalesce(sum(amount_minor), 0) from public.commission_ledger_entries where placement_id = p.id and party = 'platform'
  ) then
    raise exception 'remittance_exceeds_balance' using errcode = 'P0001';
  end if;

  if e.kind in ('client_payment', 'client_refund') then
    v_distributable := (e.amount_minor - e.processing_fee_minor) * case when e.kind = 'client_refund' then -1 else 1 end;
    v_alloc := app.allocate_minor(v_distributable, array[a.sourcing_bps, a.job_owner_bps, a.platform_bps]);
    insert into public.commission_ledger_entries
      (placement_id, entry_type, party, organization_id, amount_minor, currency, payment_evidence_id, memo, idempotency_key, created_by)
    values
      (p.id, case when e.kind = 'client_refund' then 'refund' else 'fee_received' end::public.ledger_entry_type,
       'client', null, v_distributable, p.currency, e.id, 'Distributable amount (net of processing fees)', e.id || ':received', auth.uid()),
      (p.id, case when e.kind = 'client_refund' then 'allocation_reversal' else 'allocation' end::public.ledger_entry_type,
       'sourcing', p.source_org_id, v_alloc[1], p.currency, e.id, a.sourcing_bps || ' bps', e.id || ':sourcing', auth.uid()),
      (p.id, case when e.kind = 'client_refund' then 'allocation_reversal' else 'allocation' end::public.ledger_entry_type,
       'job_owner', p.target_org_id, v_alloc[2], p.currency, e.id, a.job_owner_bps || ' bps', e.id || ':job_owner', auth.uid()),
      (p.id, case when e.kind = 'client_refund' then 'allocation_reversal' else 'allocation' end::public.ledger_entry_type,
       'platform', null, v_alloc[3], p.currency, e.id, a.platform_bps || ' bps', e.id || ':platform', auth.uid());
  elsif e.kind = 'sourcing_payout' then
    insert into public.commission_ledger_entries
      (placement_id, entry_type, party, organization_id, amount_minor, currency, payment_evidence_id, memo, idempotency_key, created_by)
    values (p.id, 'payout', 'sourcing', p.source_org_id, -e.amount_minor, p.currency, e.id,
            'Payout to sourcing recruiter verified', e.id || ':payout', auth.uid());
  elsif e.kind = 'platform_remittance' then
    insert into public.commission_ledger_entries
      (placement_id, entry_type, party, organization_id, amount_minor, currency, payment_evidence_id, memo, idempotency_key, created_by)
    values (p.id, 'remittance', 'platform', null, -e.amount_minor, p.currency, e.id,
            'Platform share remittance verified', e.id || ':remittance', auth.uid());
  end if;

  -- Recompute placement state from the ledger (single source of truth).
  select coalesce(sum(amount_minor), 0) into v_received from public.commission_ledger_entries
   where placement_id = p.id and party = 'client';
  select coalesce(sum(amount_minor), 0) into v_sourcing_due from public.commission_ledger_entries
   where placement_id = p.id and party = 'sourcing';
  select coalesce(sum(amount_minor), 0) into v_platform_due from public.commission_ledger_entries
   where placement_id = p.id and party = 'platform';

  if v_received > 0 and v_sourcing_due = 0 and v_platform_due = 0 then
    perform app.placement_transition(p.id, 'settled', 'All obligations verified');
  elsif v_received > 0 then
    perform app.placement_transition(p.id,
      case when (
        select coalesce(sum(case when x.kind = 'client_payment' then x.amount_minor else -x.amount_minor end), 0)
        from public.payment_evidence x
        where x.placement_id = p.id and x.status = 'verified' and x.kind in ('client_payment', 'client_refund')
      ) >= (select coalesce(sum(i.amount_minor), p.contracted_fee_minor) from public.invoice_records i where i.placement_id = p.id)
           then 'commission_payable'::public.placement_status else 'payment_partially_verified' end,
      'Verified evidence ' || e.kind);
  end if;

  if e.kind = 'client_payment' then
    perform app.notify_org(p.source_org_id, 'commission.payable', 'Commission is now payable',
      'The client payment was verified. Your share is recorded in the ledger.', '/commissions/' || p.id);
  end if;
  perform app.audit(p.target_org_id, 'evidence.verified', 'placement', p.id,
    jsonb_build_object('evidence_id', e.id, 'kind', e.kind));
  perform app.audit(p.source_org_id, 'evidence.verified', 'placement', p.id,
    jsonb_build_object('evidence_id', e.id, 'kind', e.kind));
end $$;

create or replace function public.open_dispute(p_placement uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p public.placements;
  v_org uuid;
  v_id uuid;
begin
  select * into p from public.placements where id = p_placement for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_org := case when app.is_member(p.source_org_id) then p.source_org_id
                when app.is_member(p.target_org_id) then p.target_org_id end;
  if v_org is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p.status in ('settled', 'cancelled') then raise exception 'placement_locked' using errcode = 'P0001'; end if;
  insert into public.disputes (placement_id, opened_by, opened_by_org, reason)
  values (p.id, auth.uid(), v_org, p_reason) returning id into v_id;
  update public.placements set status_before_dispute = status where id = p.id;
  perform app.placement_transition(p.id, 'disputed', 'Dispute opened');
  perform app.notify_org(case when v_org = p.source_org_id then p.target_org_id else p.source_org_id end,
    'placement.disputed', 'A placement was disputed', 'A partner opened a dispute. Platform review is pending.', '/commissions/' || p.id);
  perform app.audit(v_org, 'dispute.opened', 'placement', p.id, jsonb_build_object('dispute_id', v_id));
  return v_id;
end $$;

create or replace function public.resolve_dispute(p_dispute uuid, p_resolution text, p_upheld boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  d public.disputes;
  v_prev public.placement_status;
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into d from public.disputes where id = p_dispute for update;
  if not found or d.status <> 'open' then raise exception 'dispute_not_open' using errcode = 'P0001'; end if;
  update public.disputes set status = case when p_upheld then 'resolved' else 'rejected' end,
    resolution = p_resolution, resolved_by = auth.uid(), resolved_at = now() where id = d.id;
  select status_before_dispute into v_prev from public.placements where id = d.placement_id;
  perform app.placement_transition(d.placement_id, coalesce(v_prev, 'hire_reported'), 'Dispute closed: ' || left(p_resolution, 200));
  perform app.audit(null, 'dispute.resolved', 'dispute', d.id, jsonb_build_object('upheld', p_upheld));
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.commission_rules enable row level security;
alter table public.collaboration_agreements enable row level security;
alter table public.placements enable row level security;
alter table public.placement_status_events enable row level security;
alter table public.invoice_records enable row level security;
alter table public.payment_evidence enable row level security;
alter table public.commission_ledger_entries enable row level security;
alter table public.disputes enable row level security;

create or replace function app.can_see_placement(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_platform_admin() or exists (
    select 1 from public.placements x where x.id = p and (app.is_member(x.source_org_id) or app.is_member(x.target_org_id))
  );
$$;
grant execute on function app.can_see_placement(uuid) to authenticated;

create policy commission_rules_select on public.commission_rules for select to authenticated using (true);
create policy agreements_select on public.collaboration_agreements for select to authenticated
  using (app.can_see_referral(referral_id) or app.is_platform_admin());
create policy placements_select on public.placements for select to authenticated
  using (app.is_member(source_org_id) or app.is_member(target_org_id) or app.is_platform_admin());
create policy placement_events_select on public.placement_status_events for select to authenticated
  using (app.can_see_placement(placement_id));
create policy invoices_select on public.invoice_records for select to authenticated
  using (app.can_see_placement(placement_id));
create policy evidence_select on public.payment_evidence for select to authenticated
  using (app.can_see_placement(placement_id));
create policy ledger_select on public.commission_ledger_entries for select to authenticated
  using (app.can_see_placement(placement_id));
create policy disputes_select on public.disputes for select to authenticated
  using (app.can_see_placement(placement_id));

revoke insert, update, delete on public.commission_rules, public.collaboration_agreements, public.placements,
  public.placement_status_events, public.invoice_records, public.payment_evidence, public.commission_ledger_entries,
  public.disputes from authenticated, anon;

-- Platform admin: publish a new commission rule version (old snapshots unaffected).
create or replace function public.publish_commission_rule(p_name text, p_sourcing integer, p_job_owner integer, p_platform integer)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_version integer;
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(max(version), 0) + 1 into v_version from public.commission_rules where name = p_name;
  update public.commission_rules set is_default = false, retired_at = now() where is_default;
  insert into public.commission_rules (name, version, sourcing_bps, job_owner_bps, platform_bps, is_default, created_by)
  values (p_name, v_version, p_sourcing, p_job_owner, p_platform, true, auth.uid()) returning id into v_id;
  perform app.audit(null, 'commission_rule.published', 'commission_rule', v_id,
    jsonb_build_object('sourcing_bps', p_sourcing, 'job_owner_bps', p_job_owner, 'platform_bps', p_platform));
  return v_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.confirm_agreement(uuid)',
    'public.report_hire(uuid, bigint, character, date, integer, integer)',
    'public.record_invoice(uuid, text, bigint, bigint, date, date)',
    'public.record_payment_evidence(uuid, public.evidence_kind, bigint, bigint, date, text, text, text)',
    'public.review_payment_evidence(uuid, boolean, text)',
    'public.open_dispute(uuid, text)',
    'public.resolve_dispute(uuid, text, boolean)',
    'public.publish_commission_rule(text, integer, integer, integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
