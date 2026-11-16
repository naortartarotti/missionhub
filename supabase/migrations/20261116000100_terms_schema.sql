-- N2 job terms card, drop 1, part 1 of 3: schema (docs/specs/job-terms-card, brief rev. 2, PD-044 to PD-052).
--
--   BR-1/BR-4  public.job_terms_versions: immutable, complete-by-constraint terms versions. Job versions
--              (kind 'job', numbered per job) and, from drop 2, referral-scoped concierge amendments
--              (kind 'amendment', numbered per referral) share one table and one set of constraints.
--   BR-11      Referral snapshot: terms_version_id, commission_rule_id, fee_estimate_minor on
--              public.referrals (insert-only), client key in the closed app.referral_commit_keys (BR-15).
--   BR-19      ownership_protected_until: no default, nullable; undelivered rows set to NULL (PD-051 Q2).
--   BR-28      commission_rules.platform_basis ('collected' for the existing rule, PD-049), frozen into
--              the agreement like the bps.
--   BR-16      collaboration_agreements.terms_version_id (+ platform_basis).
-- No terms are invented for existing jobs or referrals (BR-7, BR-17).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.fee_basis as enum ('pct_base', 'pct_total_cash', 'flat');
create type public.search_type as enum ('contingent_exclusive', 'contingent_shared', 'retained');
create type public.guarantee_remedy as enum ('replacement_only', 'replacement_then_prorata', 'prorata_refund', 'full_refund');
create type public.platform_basis as enum ('collected', 'frozen');
create type public.terms_kind as enum ('job', 'amendment');

-- ---------------------------------------------------------------------------
-- Terms versions
-- ---------------------------------------------------------------------------
create table public.job_terms_versions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete restrict,
  organization_id uuid not null references public.organizations (id),
  kind public.terms_kind not null default 'job',
  version_no integer not null check (version_no >= 1),
  referral_id uuid references public.referrals (id) on delete restrict,
  amends_version_id uuid references public.job_terms_versions (id),
  fee_basis public.fee_basis not null,
  rate_bps integer check (rate_bps between 100 and 5000),
  flat_fee_minor bigint check (flat_fee_minor > 0),
  min_fee_minor bigint check (min_fee_minor > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  search_type public.search_type not null,
  direct_client_attested_by uuid not null references auth.users (id),
  direct_client_attested_at timestamptz not null,
  guarantee_days smallint not null check (guarantee_days in (0, 30, 60, 90, 120, 180)),
  guarantee_remedy public.guarantee_remedy,
  payment_terms_days smallint not null check (payment_terms_days between 0 and 90),
  ownership_months smallint not null check (ownership_months between 6 and 12),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint job_terms_kind_scope check ((kind = 'amendment') = (referral_id is not null)
                                         and (kind = 'job' or amends_version_id is not null)),
  constraint job_terms_basis check (
    (fee_basis = 'flat' and flat_fee_minor is not null and rate_bps is null and min_fee_minor is null
       and currency in ('CAD', 'USD', 'EUR', 'GBP', 'BRL'))
    or (fee_basis <> 'flat' and rate_bps is not null and flat_fee_minor is null)),
  constraint job_terms_remedy check ((guarantee_days = 0) = (guarantee_remedy is null))
);
create unique index job_terms_versions_job_no on public.job_terms_versions (job_id, version_no) where kind = 'job';
create unique index job_terms_versions_referral_no on public.job_terms_versions (referral_id, version_no) where kind = 'amendment';
create index job_terms_versions_job_latest on public.job_terms_versions (job_id, version_no desc) where kind = 'job';

-- BR-4: insert-only for every role (service role included).
create trigger job_terms_versions_immutable before update or delete on public.job_terms_versions
  for each row execute function app.prevent_mutation();

-- Tenant consistency: the version belongs to its job's org; an amendment to a referral of that job.
create or replace function app.guard_job_terms_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.jobs j where j.id = new.job_id and j.organization_id = new.organization_id) then
    raise exception 'tenant_mismatch' using errcode = 'P0001';
  end if;
  if new.kind = 'amendment' and not exists (
    select 1 from public.referrals r where r.id = new.referral_id and r.job_id = new.job_id and r.terms_version_id is not null
  ) then
    raise exception 'tenant_mismatch' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function app.guard_job_terms_version() from public, anon, authenticated;
create trigger job_terms_versions_guard before insert on public.job_terms_versions
  for each row execute function app.guard_job_terms_version();

-- ---------------------------------------------------------------------------
-- Referral snapshot (BR-11, BR-13)
-- ---------------------------------------------------------------------------
alter table public.referrals
  add column terms_version_id uuid references public.job_terms_versions (id),
  add column commission_rule_id uuid references public.commission_rules (id),
  add column fee_estimate_minor bigint check (fee_estimate_minor > 0),
  add constraint referrals_snapshot_pair check ((terms_version_id is null) = (commission_rule_id is null)),
  add constraint referrals_estimate_snapshot check (fee_estimate_minor is null or terms_version_id is not null);
create index referrals_terms_version_idx on public.referrals (terms_version_id) where terms_version_id is not null;

-- Set once at insert (a job version of the referral's own job), never changed afterwards.
create or replace function app.guard_referral_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if (new.terms_version_id, new.commission_rule_id, new.fee_estimate_minor)
       is distinct from (old.terms_version_id, old.commission_rule_id, old.fee_estimate_minor) then
      raise exception 'referral terms snapshot is immutable' using errcode = 'P0001';
    end if;
  elsif new.terms_version_id is not null and not exists (
    select 1 from public.job_terms_versions v where v.id = new.terms_version_id and v.kind = 'job' and v.job_id = new.job_id
  ) then
    raise exception 'tenant_mismatch' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function app.guard_referral_snapshot() from public, anon, authenticated;
create trigger referrals_guard_snapshot_insert before insert on public.referrals
  for each row execute function app.guard_referral_snapshot();
create trigger referrals_guard_snapshot_update before update of terms_version_id, commission_rule_id, fee_estimate_minor on public.referrals
  for each row execute function app.guard_referral_snapshot();

-- BR-15: the client key at commit. Closed like N1's keys: no grants, never returned, never audited.
create table app.referral_commit_keys (
  referral_id uuid primary key references public.referrals (id) on delete cascade,
  client_key text,  -- app.client_key(jobs.client_name) at commit; NULL for placeholder names
  created_at timestamptz not null default now()
);
alter table app.referral_commit_keys enable row level security;
revoke all on app.referral_commit_keys from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ownership date (BR-18, BR-19): set only by app.deliver_referral.
-- ---------------------------------------------------------------------------
alter table public.referrals alter column ownership_protected_until drop default;
alter table public.referrals alter column ownership_protected_until drop not null;
update public.referrals set ownership_protected_until = null where delivered_at is null and ownership_protected_until is not null;

-- ---------------------------------------------------------------------------
-- Commission rule platform basis (BR-28, PD-049)
-- ---------------------------------------------------------------------------
alter table public.commission_rules add column platform_basis public.platform_basis not null default 'collected';

create or replace function app.guard_rule_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.sourcing_bps, new.job_owner_bps, new.platform_bps, new.version, new.name, new.platform_basis)
     is distinct from (old.sourcing_bps, old.job_owner_bps, old.platform_bps, old.version, old.name, old.platform_basis) then
    raise exception 'commission rules are versioned; create a new version instead' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Agreement (BR-16): terms reference + frozen platform basis
-- ---------------------------------------------------------------------------
alter table public.collaboration_agreements
  add column terms_version_id uuid references public.job_terms_versions (id),
  add column platform_basis public.platform_basis not null default 'collected';

-- terms_version_id may move only to an amendment of the same referral while no placement exists
-- (BR-34, PD-051 Q8; used from drop 2). Everything else in the snapshot stays immutable.
create or replace function app.guard_agreement_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.sourcing_bps, new.job_owner_bps, new.platform_bps, new.rule_id, new.referral_id, new.platform_basis)
     is distinct from (old.sourcing_bps, old.job_owner_bps, old.platform_bps, old.rule_id, old.referral_id, old.platform_basis) then
    raise exception 'agreement snapshot is immutable' using errcode = 'P0001';
  end if;
  if new.terms_version_id is distinct from old.terms_version_id and not (
    old.terms_version_id is not null
    and exists (select 1 from public.job_terms_versions v
                 where v.id = new.terms_version_id and v.kind = 'amendment' and v.referral_id = new.referral_id)
    and not exists (select 1 from public.placements p where p.referral_id = new.referral_id)
  ) then
    raise exception 'agreement snapshot is immutable' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- BR-18: calendar months in America/Toronto; Postgres clamps to the month's last day.
create or replace function app.add_months_et(p_ts timestamptz, p_months integer) returns timestamptz
language sql stable set search_path = '' as $$
  select ((p_ts at time zone 'America/Toronto') + make_interval(months => p_months)) at time zone 'America/Toronto';
$$;

-- The job's current terms version (newest job version), or a null row.
create or replace function app.current_job_terms(p_job uuid) returns public.job_terms_versions
language sql stable security definer set search_path = '' as $$
  select v.* from public.job_terms_versions v
   where v.job_id = p_job and v.kind = 'job'
   order by v.version_no desc limit 1;
$$;

-- The referral's effective terms: its latest amendment, else its snapshot (NULL for legacy referrals).
create or replace function app.effective_terms_version(p_referral uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select v.id from public.job_terms_versions v
      where v.referral_id = p_referral and v.kind = 'amendment' order by v.version_no desc limit 1),
    (select r.terms_version_id from public.referrals r where r.id = p_referral));
$$;

-- BR-9 / BR-11: the money estimate partners are shown. flat → the flat amount; % bases → rate × the
-- salary band midpoint (half-up), at least the minimum fee, only when share_salary is on and a band
-- exists. NULL otherwise. Mirrored by estimateFee() in src/lib/money/terms.ts (parity-tested).
create or replace function app.terms_estimate(
  p_fee_basis public.fee_basis, p_rate_bps integer, p_flat_fee_minor bigint, p_min_fee_minor bigint,
  p_share_salary boolean, p_salary_min bigint, p_salary_max bigint
) returns bigint
language sql immutable set search_path = '' as $$
  select case
    when p_fee_basis is null then null
    when p_fee_basis = 'flat' then p_flat_fee_minor
    when not coalesce(p_share_salary, false) or (p_salary_min is null and p_salary_max is null) then null
    else greatest(
      round((coalesce(p_salary_min, p_salary_max) + coalesce(p_salary_max, p_salary_min))::numeric * p_rate_bps / 20000)::bigint,
      coalesce(p_min_fee_minor, 0))
  end;
$$;

-- BR-3: the single partner-visibility predicate. Every surface that lists, matches for display,
-- opens or accepts referrals for a job uses it (docs/specs/job-terms-card/backend.md §3).
create or replace function app.job_partner_visible(j public.jobs) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    j.status = 'active'
    and j.accepts_external_referrals
    and j.contract_type = 'permanent'
    and not exists (select 1 from public.organizations o where o.id = j.organization_id and o.suspended_at is not null)
    and exists (
      select 1 from app.current_job_terms(j.id) v
       where v.id is not null and (v.fee_basis = 'flat' or v.currency = j.salary_currency)),
    false);
$$;

-- Owner-only explanation (never returned to other orgs, BR-3). NULL when partner-visible.
create or replace function app.job_hidden_reason(j public.jobs) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when app.job_partner_visible(j) then null
    when not j.accepts_external_referrals then 'not_open'
    when (app.current_job_terms(j.id)).id is null then 'no_terms'
    when j.contract_type <> 'permanent' then 'not_permanent'
    when (app.current_job_terms(j.id)).fee_basis <> 'flat'
         and (app.current_job_terms(j.id)).currency <> j.salary_currency then 'currency_mismatch'
    when exists (select 1 from public.organizations o where o.id = j.organization_id and o.suspended_at is not null) then 'org_suspended'
    else 'not_active'
  end;
$$;

-- Source-side read of a version: referenced by a referral the caller sees as the sourcing side
-- (its snapshot, or an amendment of it).
create or replace function app.can_read_referral_terms(p_version uuid, p_referral uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.referrals r
     where (r.terms_version_id = p_version or r.id = p_referral)
       and app.sees_referral_as_source(r.id));
$$;

revoke execute on function
  app.add_months_et(timestamptz, integer),
  app.current_job_terms(uuid),
  app.effective_terms_version(uuid),
  app.terms_estimate(public.fee_basis, integer, bigint, bigint, boolean, bigint, bigint),
  app.job_partner_visible(public.jobs),
  app.job_hidden_reason(public.jobs),
  app.can_read_referral_terms(uuid, uuid)
from public, anon, authenticated;
-- RLS predicate: evaluated as the caller.
grant execute on function app.can_read_referral_terms(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS and grants (security constraint §7: no direct writes from any client)
-- ---------------------------------------------------------------------------
alter table public.job_terms_versions enable row level security;
-- Hiring org members read all of their jobs' versions and amendments (jobs are agency-wide);
-- the sourcing side reads only versions referenced by referrals it sees; platform admins read all.
-- Other partners read the current version only through get_opportunities.
create policy job_terms_versions_select on public.job_terms_versions for select to authenticated
  using (app.is_member(organization_id) or app.is_platform_admin() or app.can_read_referral_terms(id, referral_id));
revoke all on public.job_terms_versions from anon;
revoke insert, update, delete, truncate, references, trigger on public.job_terms_versions from authenticated;
grant select on public.job_terms_versions to authenticated;
