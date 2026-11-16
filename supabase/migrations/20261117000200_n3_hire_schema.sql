-- N3 drop 1 (docs/specs/referral-claims-two-sided-hire/backend.md v1): schema and pure helpers.
--
--   app.platform_settings        closed settings table; `deemed_agreement_enabled` = false everywhere (BR-9,
--                                PD-067, PD-074 Q-PM-1). No grants: only the service role / an operator writes
--                                it, and every write is audited.
--   public.hire_records          one hire record per referral (BR-4, BR-11, BR-22): a placement or a hire
--                                recorded without a split. Insert-only, read by either side (record scope).
--   app.hire_record_admin        admin-only facts on a hire record: the `late` marker (BR-13) and the admin
--                                note (BR-12 rev. 2). Closed.
--   collaboration_agreements     + origin ('confirmed' | 'deemed'), deemed_at (BR-9).
--   placements                   fee-pending shape (BR-31): fee, currency, start date and reporter may be empty
--                                while fee details are pending; invoice clock (BR-14); establishment fields.
--   app.placement_fee_notices    admin task state for overdue fee details (BR-31). Closed.
--   fee_difference_reason        + 'non_permanent_engagement' (BR-15).
--   helpers                      app.referral_window_end, app.hire_eligibility (BR-4), app.referral_client_keys
--                                (BR-3 union), app.objection_open (BR-45), app.deemed_agreement_enabled.

-- ---------------------------------------------------------------------------
-- 1. Platform settings (BR-9)
-- ---------------------------------------------------------------------------
create table app.platform_settings (
  key text primary key check (key ~ '^[a-z_]{3,64}$'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table app.platform_settings enable row level security;
revoke all on app.platform_settings from public, anon, authenticated;
insert into app.platform_settings (key, value) values ('deemed_agreement_enabled', 'false'::jsonb);

create function app.audit_platform_setting() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'platform settings can''t be deleted' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (null, auth.uid(), 'platform.setting_changed', 'platform_setting', null,
          jsonb_build_object('key', new.key, 'from', case when tg_op = 'UPDATE' then old.value end, 'to', new.value));
  return new;
end $$;
revoke execute on function app.audit_platform_setting() from public, anon, authenticated;
create trigger platform_settings_audit before insert or update or delete on app.platform_settings
  for each row execute function app.audit_platform_setting();

create function app.deemed_agreement_enabled() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.value = 'true'::jsonb from app.platform_settings s where s.key = 'deemed_agreement_enabled'), false);
$$;
revoke execute on function app.deemed_agreement_enabled() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Agreements: deemed origin (BR-9)
-- ---------------------------------------------------------------------------
alter table public.collaboration_agreements
  add column origin text not null default 'confirmed' check (origin in ('confirmed', 'deemed')),
  add column deemed_at timestamptz,
  add constraint collaboration_agreements_deemed_pair check ((origin = 'deemed') = (deemed_at is not null));

-- Body = 20261116000100 (live) + the origin rule marked "-- N3".
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
  -- N3 (BR-9): the origin changes once, from a pending agreement to an active deemed one.
  if (new.origin, new.deemed_at) is distinct from (old.origin, old.deemed_at)
     and not (old.origin = 'confirmed' and new.origin = 'deemed' and old.status = 'pending_source' and new.status = 'active') then
    raise exception 'agreement snapshot is immutable' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Placements: fee-pending shape (BR-31), invoice clock (BR-14), new reason (BR-15)
-- ---------------------------------------------------------------------------
alter table public.placements
  alter column contracted_fee_minor drop not null,
  alter column start_date drop not null,
  alter column currency drop not null,
  alter column reported_by drop not null,
  add column invoice_due_at timestamptz,
  add column established_how text check (established_how in ('deemed', 'upheld')),
  add column established_at timestamptz,
  add column fee_details_due_at timestamptz,
  add column fee_details_entered_at timestamptz,
  add constraint placements_established_pair check (
    (established_how is null) = (established_at is null) and (established_how is null) = (fee_details_due_at is null)),
  -- Fee facts exist, or the placement was established by a report and is waiting for them.
  add constraint placements_fee_shape check (
    (contracted_fee_minor is not null and currency is not null and start_date is not null and reported_by is not null
       and (established_how is null or fee_details_entered_at is not null))
    or (contracted_fee_minor is null and established_how is not null and fee_details_entered_at is null
        and status in ('fee_pending', 'disputed', 'cancelled')));

alter table public.placements drop constraint placements_fee_difference_reason_check;
alter table public.placements add constraint placements_fee_difference_reason_check check (fee_difference_reason in
  ('client_discount', 'client_contract_rate', 'client_invoiced_other_currency', 'invoice_correction', 'other',
   'non_permanent_engagement'));  -- N3 BR-15

-- Body = 20261116000400 (live) + the one-time fee-details completion marked "-- N3".
create or replace function app.guard_placement_fee() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- N3 (BR-31): complete_fee_details fills a fee-pending placement once, inside that RPC only.
  if old.contracted_fee_minor is null and old.established_how is not null and old.fee_details_entered_at is null
     and new.fee_details_entered_at is not null and current_setting('app.fee_details_rpc', true) = 'on'
     and (new.referral_id, new.agreement_id) is not distinct from (old.referral_id, old.agreement_id) then
    return new;
  end if;
  if (new.referral_id, new.agreement_id, new.currency, new.contracted_fee_minor, new.terms_version_id, new.computed_fee_minor,
      new.reported_base_minor, new.reported_bonus_minor, new.fee_difference_reason, new.fee_difference_note, new.start_date, new.guarantee_until,
      new.invoice_due_at, new.established_how, new.established_at, new.fee_details_due_at, new.fee_details_entered_at)  -- N3
     is distinct from
     (old.referral_id, old.agreement_id, old.currency, old.contracted_fee_minor, old.terms_version_id, old.computed_fee_minor,
      old.reported_base_minor, old.reported_bonus_minor, old.fee_difference_reason, old.fee_difference_note, old.start_date, old.guarantee_until,
      old.invoice_due_at, old.established_how, old.established_at, old.fee_details_due_at, old.fee_details_entered_at) then  -- N3
    raise exception 'placement fee facts are immutable' using errcode = 'P0001';
  end if;
  return new;
end $$;

create table app.placement_fee_notices (
  placement_id uuid primary key references public.placements (id) on delete cascade,
  overdue_notified_at timestamptz,
  notice_sent_on date,
  notice_note text check (notice_note is null or char_length(notice_note) <= 2000),
  notice_recorded_by uuid references auth.users (id),
  notice_recorded_at timestamptz
);
alter table app.placement_fee_notices enable row level security;
revoke all on app.placement_fee_notices from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Hire records (BR-3, BR-4, BR-8, BR-11, BR-13, BR-36)
-- ---------------------------------------------------------------------------
create table public.hire_records (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null unique references public.referrals (id) on delete restrict,
  source_org_id uuid not null references public.organizations (id),
  target_org_id uuid not null references public.organizations (id),
  kind text not null check (kind in ('placement', 'record_only_released', 'record_only_no_agreement')),
  placement_id uuid unique references public.placements (id),
  origin text not null check (origin in ('target_record', 'report_confirmed', 'report_deemed', 'report_upheld')),
  prior_status public.referral_status not null,
  offer_accepted_on date,
  start_date date,
  hired_role_title text check (hired_role_title is null or char_length(hired_role_title) between 1 and 120),
  recorded_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  check ((kind = 'placement') = (placement_id is not null)),
  check (offer_accepted_on is null or start_date is null or offer_accepted_on <= start_date)
);
create index hire_records_target_idx on public.hire_records (target_org_id, created_at desc);
create index hire_records_source_idx on public.hire_records (source_org_id, created_at desc);
alter table public.hire_records enable row level security;
revoke all on public.hire_records from public, anon, authenticated;
grant select on public.hire_records to authenticated;
-- Either side of the referral (record scope, RD-036) and platform admins. Writes only through RPCs.
create policy hire_records_select on public.hire_records for select to authenticated
  using (app.can_see_referral(referral_id) or app.is_platform_admin());
create trigger hire_records_immutable before update or delete on public.hire_records
  for each row execute function app.prevent_mutation();

create table app.hire_record_admin (
  hire_record_id uuid primary key references public.hire_records (id) on delete cascade,
  late boolean not null default false,
  admin_note text check (admin_note is null or char_length(admin_note) between 1 and 2000),
  note_updated_by uuid references auth.users (id),
  note_updated_at timestamptz
);
alter table app.hire_record_admin enable row level security;
revoke all on app.hire_record_admin from public, anon, authenticated;

-- N10 rules gate (20261116001100): every public table and every app table a member or admin RPC writes.
select app.attach_rules_gate('public.hire_records'::regclass);
select app.attach_rules_gate('app.hire_record_admin'::regclass);
select app.attach_rules_gate('app.placement_fee_notices'::regclass);

-- BR-37 (drop 2 opens and decides authorization checks): a void presentation stops counting like the N1 exits.
alter table app.referral_presentations drop constraint referral_presentations_void_reason_check;
alter table app.referral_presentations add constraint referral_presentations_void_reason_check
  check (void_reason in ('released', 'prior_presentation_upheld', 'already_presented', 'authorization_void'));

-- ---------------------------------------------------------------------------
-- 5. Helpers
-- ---------------------------------------------------------------------------
-- Window end (BR-4, BR-6): the snapshot window from delivery; legacy referrals use delivery + 12 months.
create function app.referral_window_end(r public.referrals) returns timestamptz
language sql stable set search_path = '' as $$
  select case
    when r.delivered_at is null then null
    when r.terms_version_id is null then app.add_months_et(r.delivered_at, 12)
    else coalesce(r.ownership_protected_until, app.add_months_et(r.delivered_at, 12)) end;
$$;
revoke execute on function app.referral_window_end(public.referrals) from public, anon, authenticated;

create function app.referral_in_progress(p_status public.referral_status) returns boolean
language sql immutable set search_path = '' as $$
  select p_status in ('submitted', 'under_review', 'info_requested', 'accepted', 'interviewing', 'offer');
$$;

-- BR-3: the union of the commit key (N2) and the delivery key (N1); placeholders give none.
create function app.referral_client_keys(p_referral uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select array_remove(array[
    (select k.client_key from app.referral_commit_keys k where k.referral_id = p_referral),
    (select p.client_key from app.referral_presentations p where p.referral_id = p_referral)]::text[], null);
$$;
revoke execute on function app.referral_client_keys(uuid) from public, anon, authenticated;

-- BR-45: the hiring side's own prior-presentation objection is still undecided.
create function app.objection_open(p_referral uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.referral_claims c
                  where c.referral_id = p_referral
                    and app.claim_effective_status(c.status, c.contest_deadline_at) in ('open', 'contested'));
$$;
revoke execute on function app.objection_open(uuid) from public, anon, authenticated;

-- BR-4: 'eligible' | 'record_only' (released: B's record-only hire, BR-11) | 'recorded' | 'not_eligible'.
-- The happy path (offer + active agreement) is unchanged whatever the delivery data (PD-074 Q-PM-3).
create function app.hire_eligibility(p_referral uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.referrals;
  p app.referral_presentations;
  v_happy boolean;
begin
  select * into r from public.referrals where id = p_referral;
  if not found then return 'not_eligible'; end if;
  if exists (select 1 from public.hire_records h where h.referral_id = r.id)
     or exists (select 1 from public.placements x where x.referral_id = r.id) then
    return 'recorded';
  end if;
  if r.status in ('awaiting_candidate', 'candidate_declined', 'already_presented', 'hired') then return 'not_eligible'; end if;
  select * into p from app.referral_presentations where referral_id = r.id;
  if p.void_reason in ('prior_presentation_upheld', 'already_presented', 'authorization_void') then return 'not_eligible'; end if;
  if exists (select 1 from app.referral_claims c where c.referral_id = r.id
              and app.claim_effective_status(c.status, c.contest_deadline_at) in ('upheld', 'final')) then
    return 'not_eligible';
  end if;
  v_happy := r.status = 'offer'
             and exists (select 1 from public.collaboration_agreements a where a.referral_id = r.id and a.status = 'active');
  if r.delivered_at is null and not v_happy then return 'not_eligible'; end if;
  if not app.referral_in_progress(r.status) and now() > app.add_months_et(app.referral_window_end(r), 9) then
    return 'not_eligible';
  end if;
  if p.void_reason = 'released' then return 'record_only'; end if;
  return 'eligible';
end $$;
revoke execute on function app.hire_eligibility(uuid) from public, anon, authenticated;

-- A date at midnight ET, for the business-day helper (event day not counted, RD-018).
create function app.date_et(p_date date) returns timestamptz
language sql stable set search_path = '' as $$
  select (p_date::timestamp) at time zone 'America/Toronto';
$$;
