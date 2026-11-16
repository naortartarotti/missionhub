-- N2 job terms card, drop 2: hire from the snapshot, computed partner share in the ledger, concierge
-- amendments, snapshot reads (docs/specs/job-terms-card, brief rev. 2, PD-044 to PD-052).
--
--   BR-21–BR-26  report_hire v2 (old signature dropped, not overloaded; `hire_terms_pending` is gone):
--                snapshot referrals compute C from the effective terms and the reported base (+ bonus),
--                take currency and guarantee from the terms, and accept a different invoiced fee I only
--                with a reason; legacy referrals keep today's free entry. A is notified when I ≠ C.
--   BR-27–BR-30  app.allocate_placement: I ≥ C (or legacy) → today's allocate_minor exactly; I < C → the
--                sourcing share on C, the platform share per the agreement's frozen basis (`collected`
--                ships, PD-049; `frozen` built and tested), the job owner takes the remainder (may be < 0).
--                Half-up per payment on |P| in exact numeric. Mirrored by allocatePlacement() (TS).
--   BR-34/BR-35  admin_amend_referral_terms + admin_get_referral_terms (platform admin only).
--   BR-36        get_referral_terms_context: the job's current version number for "this job's terms are
--                now version {n}", for whoever sees the referral.
-- Every body copied from a live definition is marked with its source and "-- N2" edits.

-- ---------------------------------------------------------------------------
-- 1. Placement fee fields (BR-23, BR-24). contracted_fee_minor keeps meaning I (the invoiced fee).
-- ---------------------------------------------------------------------------
alter table public.placements
  add column terms_version_id uuid references public.job_terms_versions (id),
  add column computed_fee_minor bigint check (computed_fee_minor > 0),
  add column reported_base_minor bigint check (reported_base_minor > 0),
  add column reported_bonus_minor bigint check (reported_bonus_minor >= 0),
  add column fee_difference_reason text check (fee_difference_reason in
    ('client_discount', 'client_contract_rate', 'client_invoiced_other_currency', 'invoice_correction', 'other')),
  add column fee_difference_note text check (char_length(fee_difference_note) between 1 and 500),
  add constraint placements_terms_pair check ((terms_version_id is null) = (computed_fee_minor is null)),
  add constraint placements_difference_reason check (
    (computed_fee_minor is null or computed_fee_minor = contracted_fee_minor) = (fee_difference_reason is null)),
  add constraint placements_other_needs_note check (fee_difference_reason is distinct from 'other' or fee_difference_note is not null),
  add constraint placements_note_needs_reason check (fee_difference_note is null or fee_difference_reason is not null);

-- The fee facts of a placement never change after the hire report (status moves only).
create or replace function app.guard_placement_fee() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.referral_id, new.agreement_id, new.currency, new.contracted_fee_minor, new.terms_version_id, new.computed_fee_minor,
      new.reported_base_minor, new.reported_bonus_minor, new.fee_difference_reason, new.fee_difference_note, new.start_date, new.guarantee_until)
     is distinct from
     (old.referral_id, old.agreement_id, old.currency, old.contracted_fee_minor, old.terms_version_id, old.computed_fee_minor,
      old.reported_base_minor, old.reported_bonus_minor, old.fee_difference_reason, old.fee_difference_note, old.start_date, old.guarantee_until) then
    raise exception 'placement fee facts are immutable' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function app.guard_placement_fee() from public, anon, authenticated;
create trigger placements_guard_fee before update on public.placements
  for each row execute function app.guard_placement_fee();

-- ---------------------------------------------------------------------------
-- 2. Money (BR-22, BR-27). Exact numeric; half-up = div(2n + d, 2d) on non-negative integers.
-- ---------------------------------------------------------------------------
create or replace function app.round_half_up(p_num numeric, p_den numeric) returns bigint
language sql immutable set search_path = '' as $$
  select (sign(p_num) * div(2 * abs(p_num) + p_den, 2 * p_den))::bigint;
$$;

-- C: flat → the frozen amount; % bases → round(rate × base [+ target bonus]), at least the minimum fee.
-- Mirrored by computeFee() in src/lib/money/terms.ts (parity-tested).
create or replace function app.compute_fee(
  p_fee_basis public.fee_basis, p_rate_bps integer, p_flat_fee_minor bigint, p_min_fee_minor bigint,
  p_base_minor bigint, p_bonus_minor bigint
) returns bigint
language sql immutable set search_path = '' as $$
  select case
    when p_fee_basis = 'flat' then p_flat_fee_minor
    else greatest(app.round_half_up((p_base_minor::numeric + coalesce(p_bonus_minor, 0)) * p_rate_bps, 10000), coalesce(p_min_fee_minor, 0))
  end;
$$;

-- BR-27. Returns {sourcing, job_owner, platform} for a net client payment (or refund, negative) P.
-- Mirrored by allocatePlacement() in src/lib/money/allocate.ts (parity-tested).
create or replace function app.allocate_placement(
  p_amount bigint, p_sourcing_bps integer, p_job_owner_bps integer, p_platform_bps integer,
  p_basis public.platform_basis, p_computed bigint, p_invoiced bigint
) returns bigint[]
language plpgsql immutable set search_path = '' as $$
declare
  v_sign integer := case when p_amount < 0 then -1 else 1 end;
  v_abs numeric := abs(p_amount);
  v_s bigint;
  v_p bigint;
begin
  if p_computed is null or p_invoiced is null or p_invoiced >= p_computed then
    return app.allocate_minor(p_amount, array[p_sourcing_bps, p_job_owner_bps, p_platform_bps]);
  end if;
  if p_invoiced <= 0 then raise exception 'invalid_fee' using errcode = '22023'; end if;
  -- Sourcing on max(C, I) = C, scaled by k = P / I.
  v_s := app.round_half_up(v_abs * p_sourcing_bps * p_computed, p_invoiced::numeric * 10000);
  v_p := case when p_basis = 'frozen'
              then app.round_half_up(v_abs * p_platform_bps * p_computed, p_invoiced::numeric * 10000)
              else app.round_half_up(v_abs * p_platform_bps, 10000) end;
  return array[v_sign * v_s, v_sign * (v_abs::bigint - v_s - v_p), v_sign * v_p];
end $$;

-- "CAD 20,000.00" for notification text (PD-026: English in SQL; ISO code on every amount).
create or replace function app.money_code(p_minor bigint, p_currency char(3)) returns text
language sql immutable set search_path = '' as $$
  select p_currency || ' ' || case when p_currency in ('JPY', 'KRW', 'CLP')
    then to_char(p_minor, 'FM999,999,999,999,990')
    else to_char(p_minor / 100.0, 'FM999,999,999,999,990.00') end;
$$;

revoke execute on function
  app.round_half_up(numeric, numeric),
  app.compute_fee(public.fee_basis, integer, bigint, bigint, bigint, bigint),
  app.allocate_placement(bigint, integer, integer, integer, public.platform_basis, bigint, bigint),
  app.money_code(bigint, char)
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. report_hire v2 (BR-21 to BR-26). Access check copied from the live definition
--    (20261115000300_recruiter_record_scope.sql: hiring side = job owner or manager).
-- ---------------------------------------------------------------------------
drop function public.report_hire(uuid, bigint, character, date, integer, integer);
create function public.report_hire(
  p_referral uuid,
  p_expected_version integer,
  p_start_date date,
  -- snapshot referrals
  p_base_minor bigint default null,
  p_bonus_minor bigint default null,
  p_invoiced_fee_minor bigint default null,
  p_difference_reason text default null,
  p_difference_note text default null,
  -- referrals without a snapshot (sent before N2) only
  p_legacy_fee_minor bigint default null,
  p_legacy_currency char(3) default null,
  p_legacy_guarantee_days integer default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  a public.collaboration_agreements;
  v public.job_terms_versions;
  v_id uuid;
  v_c bigint;
  v_i bigint;
  v_cur char(3);
  v_until date;
  v_note text := nullif(btrim(coalesce(p_difference_note, '')), '');
  v_reason text := nullif(btrim(coalesce(p_difference_reason, '')), '');
  v_org text;
  v_label text;
begin
  select * into r from public.referrals where id = p_referral for update;
  if not found or not app.sees_referral_as_target(r.id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.version <> p_expected_version then raise exception 'stale_version' using errcode = 'P0001'; end if;
  if r.status <> 'offer' then raise exception 'invalid_transition: % -> hired', r.status using errcode = 'P0001'; end if;
  select * into a from public.collaboration_agreements where referral_id = r.id and status = 'active';
  if not found then raise exception 'agreement_required' using errcode = 'P0001'; end if;
  if p_start_date is null then raise exception 'invalid_fee' using errcode = '22023'; end if;

  if r.terms_version_id is not null then
    -- BR-25: currency and guarantee come from the terms; any attempt to pass them is refused.
    if p_legacy_fee_minor is not null or p_legacy_currency is not null or p_legacy_guarantee_days is not null then
      raise exception 'hire_terms_fixed' using errcode = '22023';
    end if;
    select * into v from public.job_terms_versions where id = app.effective_terms_version(r.id);
    -- BR-22 (PD-051 Q9): % of base → base only; total cash → base + target bonus; flat → nothing.
    if (v.fee_basis = 'pct_base' and (p_base_minor is null or p_base_minor <= 0 or p_bonus_minor is not null))
       or (v.fee_basis = 'pct_total_cash' and (p_base_minor is null or p_base_minor <= 0 or p_bonus_minor is null or p_bonus_minor < 0))
       or (v.fee_basis = 'flat' and (p_base_minor is not null or p_bonus_minor is not null)) then
      raise exception 'hire_base_invalid' using errcode = '22023';
    end if;
    v_c := app.compute_fee(v.fee_basis, v.rate_bps, v.flat_fee_minor, v.min_fee_minor, p_base_minor, p_bonus_minor);
    v_i := coalesce(p_invoiced_fee_minor, v_c);
    if v_i is null or v_i <= 0 then raise exception 'invalid_fee' using errcode = '22023'; end if;
    if v_i <> v_c then
      -- BR-23: a different invoiced fee needs a reason; `other` needs the note.
      if v_reason is null
         or v_reason not in ('client_discount', 'client_contract_rate', 'client_invoiced_other_currency', 'invoice_correction', 'other')
         or (v_reason = 'other' and v_note is null) then
        raise exception 'fee_difference_reason_required' using errcode = '22023';
      end if;
      if v_note is not null and char_length(v_note) > 500 then raise exception 'fee_difference_note_too_long' using errcode = '22023'; end if;
    elsif v_reason is not null or v_note is not null then
      raise exception 'fee_difference_not_allowed' using errcode = '22023';  -- a reason is refused when I = C
    end if;
    v_cur := v.currency;
    v_until := case when v.guarantee_days = 0 then null else p_start_date + v.guarantee_days end;
  else
    -- BR-26: legacy free entry, enforced by the absence of a snapshot.
    if p_base_minor is not null or p_bonus_minor is not null or p_invoiced_fee_minor is not null
       or v_reason is not null or v_note is not null then
      raise exception 'terms_not_recorded' using errcode = '22023';
    end if;
    if p_legacy_fee_minor is null or p_legacy_fee_minor <= 0 or coalesce(p_legacy_currency, '') !~ '^[A-Z]{3}$'
       or coalesce(p_legacy_guarantee_days, 90) not between 0 and 365 then
      raise exception 'invalid_fee' using errcode = '22023';
    end if;
    v_i := p_legacy_fee_minor;
    v_cur := p_legacy_currency;
    v_until := p_start_date + coalesce(p_legacy_guarantee_days, 90);
  end if;

  update public.referrals set status = 'hired', version = version + 1 where id = r.id;
  insert into public.referral_status_events (referral_id, from_status, to_status, actor_id, actor_side, reason)
  values (r.id, 'offer', 'hired', auth.uid(), 'target', 'Hire reported');

  insert into public.placements (referral_id, agreement_id, source_org_id, target_org_id, currency,
    contracted_fee_minor, start_date, guarantee_until, reported_by,
    terms_version_id, computed_fee_minor, reported_base_minor, reported_bonus_minor, fee_difference_reason, fee_difference_note)
  values (r.id, a.id, r.source_org_id, r.target_org_id, v_cur, v_i, p_start_date, v_until, auth.uid(),
    v.id, v_c, p_base_minor, p_bonus_minor, case when v_c is not null and v_i <> v_c then v_reason end,
    case when v_c is not null and v_i <> v_c then v_note end)
  returning id into v_id;
  insert into public.placement_status_events (placement_id, from_status, to_status, actor_id, reason)
  values (v_id, null, 'hire_reported', auth.uid(), 'Hire reported by job owner');

  perform app.notify_org(r.source_org_id, 'placement.hired', 'Your candidate was hired',
    r.job_title_snapshot || ' — commission is projected until the client payment is verified.', '/commissions/' || v_id);
  if v_c is not null and v_i <> v_c then
    -- BR-24 (spec §5.10): the submitter (record-scope fallback in app.notify_org), both numbers, the reason.
    select o.name into v_org from public.organizations o where o.id = r.target_org_id;
    v_label := case v_reason
      when 'client_discount' then 'Client negotiated a lower fee'
      when 'client_contract_rate' then 'Client contract sets a different fee'
      when 'client_invoiced_other_currency' then 'Client invoiced in another currency'
      when 'invoice_correction' then 'Invoice correction or rounding'
      else 'Other' end;
    perform app.notify_org(r.source_org_id, 'placement.fee_difference', 'Invoiced fee differs from the computed fee',
      coalesce(v_org, 'The hiring recruiter') || ' reported a hire for ' || r.job_title_snapshot || ' with an invoiced fee of '
        || app.money_code(v_i, v_cur) || ' instead of the computed ' || app.money_code(v_c, v_cur) || '. Reason: ' || v_label || '.',
      '/commissions/' || v_id, r.source_user_id);
  end if;
  -- Base and bonus are compensation data: never in audit metadata (BR-24).
  perform app.audit(r.target_org_id, 'placement.created', 'placement', v_id,
    jsonb_strip_nulls(jsonb_build_object('fee_minor', v_i, 'currency', v_cur, 'computed_fee_minor', v_c, 'terms_version_id', v.id)));
  return v_id;
end $$;
revoke execute on function public.report_hire(uuid, integer, date, bigint, bigint, bigint, text, text, bigint, char, integer) from public, anon;
grant execute on function public.report_hire(uuid, integer, date, bigint, bigint, bigint, text, text, bigint, char, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Ledger (live: 20261115000300_recruiter_record_scope.sql), allocation per BR-27
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_payment_evidence(p_evidence uuid, p_approve boolean, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  e public.payment_evidence;
  p public.placements;
  a public.collaboration_agreements;
  v_alloc bigint[];
  v_distributable bigint;
  v_received bigint;
  v_sourcing_due bigint;
  v_platform_due bigint;
  v_floor boolean := false;  -- N2
begin
  select * into e from public.payment_evidence where id = p_evidence for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into p from public.placements where id = e.placement_id for update;
  select * into a from public.collaboration_agreements where id = p.agreement_id;

  if e.recorded_by = auth.uid() then raise exception 'four_eyes_required' using errcode = '42501'; end if;
  if not (
    app.is_platform_admin()
    or (e.kind = 'sourcing_payout' and app.sees_referral_as_source(p.referral_id))
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
    -- N2 (BR-27, BR-30): I ≥ C or legacy → today's allocate_minor exactly; I < C → A's share on the
    -- computed fee, platform per the agreement's frozen basis, the job owner takes the remainder.
    v_alloc := app.allocate_placement(v_distributable, a.sourcing_bps, a.job_owner_bps, a.platform_bps,
                                      a.platform_basis, p.computed_fee_minor, p.contracted_fee_minor);
    v_floor := p.computed_fee_minor is not null and p.contracted_fee_minor < p.computed_fee_minor;
    insert into public.commission_ledger_entries
      (placement_id, entry_type, party, organization_id, amount_minor, currency, payment_evidence_id, memo, idempotency_key, created_by)
    values
      (p.id, case when e.kind = 'client_refund' then 'refund' else 'fee_received' end::public.ledger_entry_type,
       'client', null, v_distributable, p.currency, e.id, 'Distributable amount (net of processing fees)', e.id || ':received', auth.uid()),
      (p.id, case when e.kind = 'client_refund' then 'allocation_reversal' else 'allocation' end::public.ledger_entry_type,
       'sourcing', p.source_org_id, v_alloc[1], p.currency, e.id,
       a.sourcing_bps || ' bps' || case when v_floor then ' of the computed fee' else '' end, e.id || ':sourcing', auth.uid()),  -- N2
      (p.id, case when e.kind = 'client_refund' then 'allocation_reversal' else 'allocation' end::public.ledger_entry_type,
       'job_owner', p.target_org_id, v_alloc[2], p.currency, e.id,
       case when v_floor then 'Remainder after the computed-fee shares' else a.job_owner_bps || ' bps' end, e.id || ':job_owner', auth.uid()),  -- N2
      (p.id, case when e.kind = 'client_refund' then 'allocation_reversal' else 'allocation' end::public.ledger_entry_type,
       'platform', null, v_alloc[3], p.currency, e.id,
       a.platform_bps || ' bps' || case when v_floor and a.platform_basis = 'frozen' then ' of the computed fee' else '' end,
       e.id || ':platform', auth.uid());  -- N2
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
end $function$;

-- ---------------------------------------------------------------------------
-- 4. Concierge amendment (BR-34, BR-35, RD-035). Admin-only reason and the two written-request
--    references live in a closed table (BR-38).
-- ---------------------------------------------------------------------------
create table app.terms_amendment_notes (
  version_id uuid primary key references public.job_terms_versions (id) on delete restrict,
  reason text not null check (char_length(reason) between 10 and 1000),
  hiring_request_reference text not null check (char_length(hiring_request_reference) between 3 and 200),
  sourcing_request_reference text not null check (char_length(sourcing_request_reference) between 3 and 200),
  created_at timestamptz not null default now()
);
alter table app.terms_amendment_notes enable row level security;
revoke all on app.terms_amendment_notes from public, anon, authenticated;
create trigger terms_amendment_notes_immutable before update or delete on app.terms_amendment_notes
  for each row execute function app.prevent_mutation();

create function public.admin_amend_referral_terms(
  p_referral uuid,
  p_reason text,
  p_hiring_request_reference text,
  p_sourcing_request_reference text,
  p_both_requested boolean,
  p_fee_basis public.fee_basis,
  p_search_type public.search_type,
  p_guarantee_days integer,
  p_payment_terms_days integer,
  p_ownership_months integer,
  p_rate_bps integer default null,
  p_flat_fee_minor bigint default null,
  p_min_fee_minor bigint default null,
  p_flat_currency char(3) default null,
  p_guarantee_remedy public.guarantee_remedy default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  base public.job_terms_versions;
  snap public.job_terms_versions;
  v_currency char(3);
  v_id uuid;
  v_no integer;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_hiring text := btrim(coalesce(p_hiring_request_reference, ''));
  v_sourcing text := btrim(coalesce(p_sourcing_request_reference, ''));
  v_body text;
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform app.enforce_rate_limit('admin.amend', 30, 3600);
  select * into r from public.referrals where id = p_referral for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.terms_version_id is null then raise exception 'amendment_legacy_referral' using errcode = 'P0001'; end if;
  -- RD-035: before a hire is reported, in any referral status.
  if exists (select 1 from public.placements p where p.referral_id = r.id) then
    raise exception 'amendment_after_hire' using errcode = 'P0001';
  end if;
  if not coalesce(p_both_requested, false) or char_length(v_reason) not between 10 and 1000
     or char_length(v_hiring) not between 3 and 200 or char_length(v_sourcing) not between 3 and 200 then
    raise exception 'amendment_reason_required' using errcode = '22023';
  end if;

  select * into snap from public.job_terms_versions where id = r.terms_version_id;
  select * into base from public.job_terms_versions where id = app.effective_terms_version(r.id);
  -- T4: % bases keep the referral's fee currency (or the job's salary currency when switching from flat).
  v_currency := case when p_fee_basis = 'flat' then upper(btrim(coalesce(p_flat_currency, '')))
                     when base.fee_basis <> 'flat' then base.currency
                     else (select j.salary_currency from public.jobs j where j.id = r.job_id) end;
  if (p_fee_basis = 'flat' and (p_flat_fee_minor is null or p_flat_fee_minor <= 0 or p_rate_bps is not null
                                or p_min_fee_minor is not null or v_currency not in ('CAD', 'USD', 'EUR', 'GBP', 'BRL')))
     or (p_fee_basis <> 'flat' and (p_rate_bps is null or p_rate_bps not between 100 and 5000 or p_flat_fee_minor is not null
                                    or (p_min_fee_minor is not null and p_min_fee_minor <= 0)))
     or p_fee_basis is null or p_search_type is null
     or p_guarantee_days is null or p_guarantee_days not in (0, 30, 60, 90, 120, 180)
     or ((p_guarantee_days = 0) <> (p_guarantee_remedy is null))
     or p_payment_terms_days is null or p_payment_terms_days not between 0 and 90
     or p_ownership_months is null or p_ownership_months not between 6 and 12 then
    raise exception 'terms_incomplete' using errcode = '22023';
  end if;
  if (base.fee_basis, base.rate_bps, base.flat_fee_minor, base.min_fee_minor, base.currency, base.search_type,
      base.guarantee_days, base.guarantee_remedy, base.payment_terms_days, base.ownership_months)
     is not distinct from
     (p_fee_basis, p_rate_bps, p_flat_fee_minor, p_min_fee_minor, v_currency, p_search_type,
      p_guarantee_days::smallint, p_guarantee_remedy, p_payment_terms_days::smallint, p_ownership_months::smallint) then
    raise exception 'amendment_no_change' using errcode = 'P0001';
  end if;
  -- BR-35: the window is anchored at delivery.
  if r.delivered_at is not null and p_ownership_months <> base.ownership_months then
    raise exception 'amendment_window_after_delivery' using errcode = 'P0001';
  end if;

  select coalesce(max(x.version_no), 0) + 1 into v_no from public.job_terms_versions x
   where x.referral_id = r.id and x.kind = 'amendment';
  insert into public.job_terms_versions (job_id, organization_id, kind, version_no, referral_id, amends_version_id,
    fee_basis, rate_bps, flat_fee_minor, min_fee_minor, currency, search_type, direct_client_attested_by,
    direct_client_attested_at, guarantee_days, guarantee_remedy, payment_terms_days, ownership_months, created_by)
  values (snap.job_id, snap.organization_id, 'amendment', v_no, r.id, base.id,
    p_fee_basis, p_rate_bps, p_flat_fee_minor, p_min_fee_minor, v_currency, p_search_type,
    snap.direct_client_attested_by, snap.direct_client_attested_at,  -- T6 carried over (spec 2.8)
    p_guarantee_days, p_guarantee_remedy, p_payment_terms_days, p_ownership_months, auth.uid())
  returning id into v_id;
  insert into app.terms_amendment_notes (version_id, reason, hiring_request_reference, sourcing_request_reference)
  values (v_id, v_reason, v_hiring, v_sourcing);

  -- PD-051 Q8: an existing agreement now points at the amendment (the only allowed agreement change).
  update public.collaboration_agreements set terms_version_id = v_id where referral_id = r.id;

  v_body := 'A platform admin recorded a terms amendment on the referral for ' || r.job_title_snapshot
         || ', at both organizations'' written request. Review the new terms on the referral.';
  perform app.notify_org(r.source_org_id, 'referral.terms_amended', 'Referral terms amended', v_body, '/referrals/' || r.id);
  if not app.hidden_from_target(r.status) then
    perform app.notify_org(r.target_org_id, 'referral.terms_amended', 'Referral terms amended', v_body, '/referrals/' || r.id);
  end if;
  perform app.audit(null, 'referral.terms_amended', 'referral', r.id, jsonb_build_object('version_id', v_id));
  perform app.audit(r.source_org_id, 'referral.terms_amended', 'referral', r.id, jsonb_build_object('version_id', v_id));
  perform app.audit(r.target_org_id, 'referral.terms_amended', 'referral', r.id, jsonb_build_object('version_id', v_id));
  return v_id;
end $$;
revoke execute on function public.admin_amend_referral_terms(uuid, text, text, text, boolean, public.fee_basis, public.search_type,
  integer, integer, integer, integer, bigint, bigint, char, public.guarantee_remedy) from public, anon;
grant execute on function public.admin_amend_referral_terms(uuid, text, text, text, boolean, public.fee_basis, public.search_type,
  integer, integer, integer, integer, bigint, bigint, char, public.guarantee_remedy) to authenticated;

-- Admin lookup for /admin/referrals/[referralId]: referral meta, effective terms and history (with the
-- admin-only reason and references). No candidate data; the client exactly as partners see it.
create function public.admin_get_referral_terms(p_referral uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.referrals;
  j public.jobs;
  v_terms jsonb;
begin
  if not app.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into r from public.referrals where id = p_referral;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into j from public.jobs where id = r.job_id;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', v.id, 'kind', v.kind, 'version_no', v.version_no, 'created_at', v.created_at,
           'created_by_name', pr.full_name, 'fee_basis', v.fee_basis, 'rate_bps', v.rate_bps,
           'flat_fee_minor', v.flat_fee_minor, 'min_fee_minor', v.min_fee_minor, 'currency', v.currency,
           'search_type', v.search_type, 'guarantee_days', v.guarantee_days, 'guarantee_remedy', v.guarantee_remedy,
           'payment_terms_days', v.payment_terms_days, 'ownership_months', v.ownership_months,
           'direct_client_attested_at', v.direct_client_attested_at,
           'reason', n.reason, 'hiring_request_reference', n.hiring_request_reference,
           'sourcing_request_reference', n.sourcing_request_reference)
         order by (v.kind = 'amendment'), v.version_no), '[]'::jsonb)
    into v_terms
    from public.job_terms_versions v
    left join public.profiles pr on pr.id = v.created_by
    left join app.terms_amendment_notes n on n.version_id = v.id
   where v.id = r.terms_version_id or (v.referral_id = r.id and v.kind = 'amendment');
  return jsonb_build_object(
    'referral_id', r.id,
    'job_title', r.job_title_snapshot,
    'candidate_label', r.candidate_label,
    'hiring_org_id', r.target_org_id,
    'hiring_org_name', (select o.name from public.organizations o where o.id = r.target_org_id),
    'sourcing_org_id', r.source_org_id,
    'sourcing_org_name', (select o.name from public.organizations o where o.id = r.source_org_id),
    'status', r.status,
    'delivered_at', r.delivered_at,
    'client_label', case when j.client_confidential or j.client_name is null then 'Confidential client' else j.client_name end,
    'recorded', r.terms_version_id is not null,
    'effective_terms_version_id', app.effective_terms_version(r.id),
    'placement', (select jsonb_build_object('id', p.id, 'created_at', p.created_at) from public.placements p where p.referral_id = r.id),
    'rule', (select jsonb_build_object('name', c.name, 'version', c.version, 'sourcing_bps', c.sourcing_bps,
                                       'job_owner_bps', c.job_owner_bps, 'platform_bps', c.platform_bps, 'platform_basis', c.platform_basis)
               from public.commission_rules c where c.id = coalesce(r.commission_rule_id,
                 (select ag.rule_id from public.collaboration_agreements ag where ag.referral_id = r.id))),
    'history', v_terms);
end $$;
revoke execute on function public.admin_get_referral_terms(uuid) from public, anon;
grant execute on function public.admin_get_referral_terms(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. "This job's terms are now version {n}" (spec 2.4.3, BR-36): the job's current version for anyone
--    who sees the referral (the sourcing side can't read job versions it didn't commit under).
-- ---------------------------------------------------------------------------
create function public.get_referral_terms_context(p_referral uuid)
returns table (job_current_version_no integer, job_current_version_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.can_see_referral(p_referral) then raise exception 'not_found' using errcode = 'P0002'; end if;
  return query
    select v.version_no, v.created_at
      from public.referrals r
      cross join lateral (select x.* from app.current_job_terms(r.job_id) x) v
     where r.id = p_referral and v.id is not null;
end $$;
revoke execute on function public.get_referral_terms_context(uuid) from public, anon;
grant execute on function public.get_referral_terms_context(uuid) to authenticated;
