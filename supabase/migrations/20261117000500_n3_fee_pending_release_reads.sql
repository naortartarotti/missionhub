-- N3 drop 1: fee-pending placements (BR-31, BR-32), release from declined / rejected (BR-34), the referral's
-- hire state for both sides (BR-4, BR-11, BR-35), admin hire-record note and tasks (BR-12, BR-13, BR-31),
-- and the maintenance sweep for overdue fee details (BR-31).
--
-- Re-copied from the live catalog (PD-064; record-scope copies in 20261115000300 are never edited):
--   public.record_invoice, public.record_payment_evidence   (20261107000500)  "-- N3": placement_fee_pending first
--   public.release_referral                                 (20261115000300)  "-- N3": declined / rejected
--   public.get_referral_presentation                        (20261116000300)  "-- N3": can_release statuses
--   app.release_allowed                                     (20261113000400)  "-- N3": no hire record

-- ---------------------------------------------------------------------------
-- 1. Fee details on a fee-pending placement (BR-31, BR-14, BR-32)
-- ---------------------------------------------------------------------------
create function public.complete_fee_details(
  p_placement uuid,
  p_expected_version integer,
  p_start_date date,
  p_terms_version uuid default null,
  p_base_minor bigint default null,
  p_bonus_minor bigint default null,
  p_invoiced_fee_minor bigint default null,
  p_difference_reason text default null,
  p_difference_note text default null,
  p_legacy_fee_minor bigint default null,
  p_legacy_currency char(3) default null,
  p_legacy_guarantee_days integer default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.placements;
  r public.referrals;
  m record;
  v_today date := (now() at time zone 'America/Toronto')::date;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select * into p from public.placements where id = p_placement for update;
  if not found or not app.sees_referral_as_target(p.referral_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform app.enforce_rate_limit('hire.record', 30, 3600);
  if p.version <> p_expected_version then raise exception 'stale_version' using errcode = 'P0001'; end if;
  if p.status <> 'fee_pending' then raise exception 'placement_locked' using errcode = 'P0001'; end if;
  select * into r from public.referrals where id = p.referral_id;
  if p_start_date is null or p_start_date > v_today + 548
     or p_start_date < (coalesce(r.delivered_at, r.submitted_at) at time zone 'America/Toronto')::date - 366 then
    raise exception 'hire_dates_invalid' using errcode = '22023';
  end if;
  -- The same N2 checks as report_hire, incl. hire_terms_changed when the terms were amended meanwhile (R-8).
  select * into m from app.hire_compute(r.id, p_start_date, p_terms_version, p_base_minor, p_bonus_minor, p_invoiced_fee_minor,
    p_difference_reason, p_difference_note, p_legacy_fee_minor, p_legacy_currency, p_legacy_guarantee_days);
  perform set_config('app.fee_details_rpc', 'on', true);
  update public.placements
     set currency = m.currency, contracted_fee_minor = m.invoiced_fee_minor, start_date = p_start_date,
         guarantee_until = m.guarantee_until, reported_by = auth.uid(), terms_version_id = m.terms_version_id,
         computed_fee_minor = m.computed_fee_minor, reported_base_minor = p_base_minor, reported_bonus_minor = p_bonus_minor,
         fee_difference_reason = m.difference_reason, fee_difference_note = m.difference_note,
         invoice_due_at = app.add_business_days(app.date_et(p_start_date), 10), fee_details_entered_at = now()
   where id = p.id;
  perform set_config('app.fee_details_rpc', '', true);
  perform app.placement_transition(p.id, 'hire_reported', 'Fee details entered');
  perform app.audit(p.target_org_id, 'placement.fee_details_entered', 'placement', p.id,
    jsonb_strip_nulls(jsonb_build_object('fee_minor', m.invoiced_fee_minor, 'currency', m.currency,
      'computed_fee_minor', m.computed_fee_minor, 'terms_version_id', m.terms_version_id)));
  perform app.audit(p.source_org_id, 'placement.fee_details_entered', 'placement', p.id, '{}');
end $$;
revoke execute on function public.complete_fee_details(uuid, integer, date, uuid, bigint, bigint, bigint, text, text, bigint, char, integer) from public, anon;
grant execute on function public.complete_fee_details(uuid, integer, date, uuid, bigint, bigint, bigint, text, text, bigint, char, integer) to authenticated;

-- Defence in depth for every other path (service role included): no invoice or evidence on a fee-pending placement.
create function app.guard_fee_pending_finance() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.placements p where p.id = new.placement_id and p.contracted_fee_minor is null) then
    raise exception 'placement_fee_pending' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function app.guard_fee_pending_finance() from public, anon, authenticated;
create trigger invoice_records_fee_pending before insert on public.invoice_records
  for each row execute function app.guard_fee_pending_finance();
create trigger payment_evidence_fee_pending before insert on public.payment_evidence
  for each row execute function app.guard_fee_pending_finance();

-- Finance RPCs: placement_fee_pending before any other check (AC-69). Live bodies, edits marked "-- N3".
create or replace function public.record_invoice(p_placement uuid, p_number text, p_amount_minor bigint, p_tax_minor bigint, p_issued_on date, p_due_on date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  p public.placements;
  v_id uuid;
begin
  select * into p from public.placements where id = p_placement for update;
  if not found or not app.sees_referral_as_target(p.referral_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p.status = 'fee_pending' then raise exception 'placement_fee_pending' using errcode = 'P0001'; end if;  -- N3 BR-31
  if p.status in ('settled', 'cancelled', 'disputed') then raise exception 'placement_locked' using errcode = 'P0001'; end if;
  insert into public.invoice_records (placement_id, invoice_number, amount_minor, tax_minor, currency, issued_on, due_on, recorded_by)
  values (p.id, p_number, p_amount_minor, coalesce(p_tax_minor, 0), p.currency, p_issued_on, p_due_on, auth.uid())
  returning id into v_id;
  if p.status = 'hire_reported' then
    perform app.placement_transition(p.id, 'invoiced', 'Invoice ' || p_number || ' recorded');
  end if;
  perform app.audit(p.target_org_id, 'placement.invoice_recorded', 'placement', p.id, jsonb_build_object('invoice_id', v_id));
  return v_id;
end $function$;

create or replace function public.record_payment_evidence(p_placement uuid, p_kind evidence_kind, p_amount_minor bigint, p_processing_fee_minor bigint, p_occurred_on date, p_reference text, p_notes text, p_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  p public.placements;
  v_id uuid;
begin
  select id into v_id from public.payment_evidence where idempotency_key = p_idempotency_key;
  if v_id is not null then return v_id; end if;

  select * into p from public.placements where id = p_placement for update;
  if not found or not app.sees_referral_as_target(p.referral_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p.status = 'fee_pending' then raise exception 'placement_fee_pending' using errcode = 'P0001'; end if;  -- N3 BR-31
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
end $function$;

-- ---------------------------------------------------------------------------
-- 2. Release from declined / rejected (BR-34). Live bodies, edits marked "-- N3".
-- ---------------------------------------------------------------------------
create or replace function app.release_allowed(p_referral uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.referrals r where r.id = p_referral and r.delivered_at is not null)
     and app.presentation_counts(p_referral)
     and not exists (select 1 from public.disputes d where d.referral_id = p_referral and d.status = 'open')
     and not exists (select 1 from public.disputes d join public.placements p on p.id = d.placement_id
                      where p.referral_id = p_referral and d.status = 'open')
     -- N3 BR-34: no hire record (placement or recorded without a split). Drop 2 adds the BR-21 report block.
     and not exists (select 1 from public.hire_records h where h.referral_id = p_referral)
     and not exists (select 1 from public.placements x where x.referral_id = p_referral);
$function$;

create or replace function public.release_referral(p_referral uuid, p_acting_org uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.referrals;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select * into r from public.referrals where id = p_referral for update;
  if not found or not app.sees_referral_as_source(r.id)
     or (p_acting_org is not null and p_acting_org <> r.source_org_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if r.status not in ('withdrawn', 'cancelled', 'declined', 'rejected') or not app.release_allowed(r.id) then  -- N3 BR-34
    raise exception 'release_not_allowed' using errcode = 'P0001';
  end if;
  perform app.apply_release(r.id);
end $function$;

create or replace function public.get_referral_presentation(p_referral uuid, p_acting_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.referrals;
  p app.referral_presentations;
  c app.referral_claims;
  v_side text;
  v_counts boolean;
  v_claim_status text;
  v_ended boolean;
  v_open_dispute boolean;
  v_claim jsonb;
  v_out jsonb;
  v_months integer;  -- N2
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select * into r from public.referrals where id = p_referral;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_acting_org = r.source_org_id and app.sees_referral_as_source(r.id) then
    v_side := 'source';
  elsif p_acting_org = r.target_org_id and app.sees_referral_as_target(r.id) then
    v_side := 'target';
  else
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select * into p from app.referral_presentations where referral_id = r.id;
  select * into c from app.referral_claims where referral_id = r.id;
  v_counts := app.presentation_counts(r.id);
  v_claim_status := case when c.id is not null then app.claim_effective_status(c.status, c.contest_deadline_at) end;
  v_ended := v_claim_status in ('upheld', 'final') or p.void_reason = 'prior_presentation_upheld';
  v_open_dispute := exists (select 1 from public.disputes d where d.referral_id = r.id and d.status = 'open');

  v_out := jsonb_build_object(
    'side', v_side,
    'status', r.status,
    'version', r.version,
    'delivered_at', r.delivered_at,
    'ownership_protected_until', r.ownership_protected_until,
    'claim_deadline_at', r.claim_deadline_at,
    'claim_business_days_left', app.business_days_left(r.claim_deadline_at),
    'claim_rejected_at', r.claim_rejected_at,
    'review_clock_started_at', r.review_clock_started_at
  );

  if v_side = 'source' then
    v_out := v_out || jsonb_build_object(
      'ownership_state', case
        when r.status = 'already_presented' or r.delivered_at is null then 'not_delivered'
        when p.void_reason = 'released' then 'released'
        when v_ended then 'ended'
        when r.ownership_protected_until <= now() then 'expired'
        else 'protected' end,
      'counts', v_counts,
      'released_at', p.released_at,
      'can_release', r.status in ('withdrawn', 'cancelled', 'declined', 'rejected') and app.release_allowed(r.id),  -- N3 BR-34
      'can_release_on_withdraw', r.status in ('submitted', 'under_review', 'info_requested', 'accepted', 'interviewing', 'offer')
                                 and app.release_allowed(r.id));
  else
    -- N2 (BR-20): the claim form's date bound, from the same rule as file_prior_presentation_claim.
    select t.ownership_months into v_months from public.job_terms_versions t where t.id = app.effective_terms_version(r.id);
    v_out := v_out || jsonb_build_object(
      'ownership_state', case
        when v_ended then 'ended'
        when r.ownership_protected_until <= now() then 'expired'
        else 'protected' end,
      'can_claim', app.claim_blocker(r.id) is null,
      'lookback_months', coalesce(v_months, 6),
      'claim_prior_date_min', case when r.delivered_at is not null then
        ((r.delivered_at at time zone 'America/Toronto')::date - make_interval(months => coalesce(v_months, 6)))::date end);
  end if;

  if c.id is not null then
    v_claim := jsonb_build_object(
      'id', c.id,
      'status', v_claim_status,
      'filed_at', c.filed_at,
      'prior_process_date', c.prior_process_date,
      'evidence_kind', c.evidence_kind,
      'note', c.note,
      'contest_deadline_at', c.contest_deadline_at,
      'contest_business_days_left', case when v_claim_status = 'open' then app.business_days_left(c.contest_deadline_at) end,
      'contested_at', c.contested_at,
      'resolved_at', c.resolved_at,
      'resolution', c.resolution,
      'finalized_at', case when v_claim_status = 'final' then coalesce(c.finalized_at, c.contest_deadline_at) end);
    if v_side = 'source' then
      v_claim := v_claim || jsonb_build_object(
        'files', coalesce((select jsonb_agg(jsonb_build_object('n', x.n, 'uploaded_at', x.uploaded_at, 'sha256', x.sha256) order by x.n)
                             from (select row_number() over (order by f.uploaded_at, f.id) as n, f.uploaded_at, f.sha256
                                     from app.referral_claim_files f where f.claim_id = c.id) x), '[]'::jsonb),
        'can_contest', v_claim_status = 'open' and now() < c.contest_deadline_at and not v_open_dispute);
    else
      v_claim := v_claim || jsonb_build_object(
        'evidence_referral_id', c.evidence_referral_id,
        'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'file_name', f.file_name, 'mime_type', f.mime_type,
                                                              'size_bytes', f.size_bytes, 'uploaded_at', f.uploaded_at,
                                                              'sha256', f.sha256, 'scan_status', f.scan_status)
                                            order by f.uploaded_at, f.id)
                             from app.referral_claim_files f where f.claim_id = c.id), '[]'::jsonb));
    end if;
  end if;
  return v_out || jsonb_build_object('claim', v_claim);
end $function$;

-- ---------------------------------------------------------------------------
-- 3. The referral's hire state, side-shaped (BR-4, BR-11, BR-35, BR-45)
--    The hiring side never gets anything that depends on a release before a hire is recorded (N1 BR-25,
--    AC-27): variant, can_record and the ownership line are computed as if the referral weren't released.
-- ---------------------------------------------------------------------------
create function public.get_referral_hire_state(p_referral uuid, p_acting_org uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.referrals;
  p app.referral_presentations;
  h public.hire_records;
  ag public.collaboration_agreements;
  v_side text;
  v_elig text;
  v_window timestamptz;
  v_in_progress boolean;
  v_ended boolean;
  v_void boolean;
  v_ownership text;
  v_variant text;
  v_hire jsonb;
  v_out jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select * into r from public.referrals where id = p_referral;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if (p_acting_org is null or p_acting_org = r.source_org_id) and app.sees_referral_as_source(r.id) then
    v_side := 'source';
  elsif (p_acting_org is null or p_acting_org = r.target_org_id) and app.sees_referral_as_target(r.id) then
    v_side := 'target';
  else
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select * into p from app.referral_presentations where referral_id = r.id;
  select * into h from public.hire_records where referral_id = r.id;
  select * into ag from public.collaboration_agreements where referral_id = r.id;
  v_window := app.referral_window_end(r);
  v_in_progress := app.referral_in_progress(r.status);
  v_ended := p.void_reason = 'prior_presentation_upheld'
             or exists (select 1 from app.referral_claims c where c.referral_id = r.id
                         and app.claim_effective_status(c.status, c.contest_deadline_at) in ('upheld', 'final'));
  v_void := p.void_reason = 'authorization_void';

  -- BR-35 ownership line (spec §2.12, first match wins). 'released' only ever reaches the sourcing side.
  v_ownership := case
    when v_side = 'source' and p.void_reason = 'released' then 'released'
    when v_ended then 'ended'
    when v_void then 'void'
    when r.status = 'already_presented' or r.delivered_at is null then 'not_delivered'
    when v_in_progress or now() <= v_window then 'protected'
    else 'closed' end;

  if h.id is not null then
    v_hire := jsonb_build_object(
      'kind', case when h.kind = 'placement' then 'placement' else 'no_split' end,
      'no_split_reason', case h.kind when 'record_only_released' then 'released' when 'record_only_no_agreement' then 'no_agreement' end,
      'origin', h.origin,
      'recorded_at', h.created_at,
      'offer_accepted_on', h.offer_accepted_on,
      'start_date', h.start_date,
      'hired_role_title', h.hired_role_title,
      'placement_id', h.placement_id);
  end if;

  v_out := jsonb_build_object(
    'side', v_side,
    'status', r.status,
    'version', r.version,
    'delivered_at', r.delivered_at,
    'in_progress', v_in_progress,
    'protected_until', case when r.delivered_at is not null then v_window end,
    'ownership', v_ownership,
    'hire_record', v_hire,
    'agreement', case when ag.id is not null then
      jsonb_build_object('status', ag.status, 'origin', ag.origin, 'deemed_at', ag.deemed_at) end);

  if v_side = 'target' then
    v_elig := app.hire_eligibility(r.id);
    -- V5 looks exactly like the variant the referral would otherwise get (BR-11, AC-27).
    if v_elig in ('eligible', 'record_only') then
      v_variant := case
        when app.objection_open(r.id) then 'objection_open'
        when r.status = 'offer' and ag.status = 'active' then 'happy'
        when ag.status = 'active' then 'confirmed'
        when ag.status = 'terminated' then null
        when app.deemed_agreement_enabled() then 'deemed'
        else 'no_agreement' end;
    end if;
    v_out := v_out || jsonb_build_object(
      'can_record', v_variant is not null,
      'variant', v_variant,
      'legacy', r.terms_version_id is null,
      'other_role_allowed', cardinality(app.referral_client_keys(r.id)) > 0,
      'job_title', r.job_title_snapshot);
  else
    v_out := v_out || jsonb_build_object(
      'released_at', p.released_at,
      -- BR-6 filing limit (shown when the referral isn't in progress; drop 2 enforces it on filing).
      'window_end', v_window,
      'report_until', case when v_window is not null then app.add_months_et(v_window, 6) end,
      'report_tail_until', case when v_window is not null then app.add_months_et(v_window, 9) end);
  end if;
  return v_out;
end $$;
revoke execute on function public.get_referral_hire_state(uuid, uuid) from public, anon;
grant execute on function public.get_referral_hire_state(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Admin: hire record panel and note (BR-12 rev. 2, BR-13), tasks (BR-13, BR-31), notice sent (BR-31)
--    Platform admin only; anyone else gets not_found (no oracle), like admin_get_referral_terms.
-- ---------------------------------------------------------------------------
create function public.admin_get_hire_record(p_referral uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  h public.hire_records;
  x app.hire_record_admin;
begin
  if not app.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into h from public.hire_records where referral_id = p_referral;
  if not found then return null; end if;
  select * into x from app.hire_record_admin where hire_record_id = h.id;
  return jsonb_build_object(
    'id', h.id, 'referral_id', h.referral_id,
    'kind', case when h.kind = 'placement' then 'placement' else 'no_split' end,
    'record_kind', h.kind, 'origin', h.origin, 'prior_status', h.prior_status,
    'recorded_at', h.created_at, 'offer_accepted_on', h.offer_accepted_on, 'start_date', h.start_date,
    'hired_role_title', h.hired_role_title, 'placement_id', h.placement_id,
    'late', coalesce(x.late, false), 'admin_note', x.admin_note, 'note_updated_at', x.note_updated_at);
end $$;
revoke execute on function public.admin_get_hire_record(uuid) from public, anon;
grant execute on function public.admin_get_hire_record(uuid) to authenticated;

create function public.admin_set_hire_record_note(p_referral uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  h public.hire_records;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not app.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform app.enforce_rate_limit('admin.hire', 60, 3600);
  select * into h from public.hire_records where referral_id = p_referral;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if char_length(v_note) > 2000 then raise exception 'note_too_long' using errcode = '22023'; end if;
  insert into app.hire_record_admin (hire_record_id, admin_note, note_updated_by, note_updated_at)
  values (h.id, v_note, auth.uid(), now())
  on conflict (hire_record_id) do update set admin_note = excluded.admin_note, note_updated_by = excluded.note_updated_by,
                                              note_updated_at = excluded.note_updated_at;
  -- Platform-level event only: the note never reaches either org (no text in metadata).
  perform app.audit(null, 'hire_record.note_saved', 'referral', h.referral_id, jsonb_build_object('hire_record_id', h.id, 'cleared', v_note is null));
end $$;
revoke execute on function public.admin_set_hire_record_note(uuid, text) from public, anon;
grant execute on function public.admin_set_hire_record_note(uuid, text) to authenticated;

-- Section 3 of /admin/hire-reports: late records and overdue fee details. No automatic action (BR-40).
create function public.admin_list_hire_tasks() returns table (
  task text, referral_id uuid, placement_id uuid, job_title text, candidate_label text,
  source_org_id uuid, source_org_name text, target_org_id uuid, target_org_name text,
  recorded_at timestamptz, start_date date, offer_accepted_on date, fee_details_due_at timestamptz,
  notice_sent_on date, notice_note text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  return query
    select 'late'::text, h.referral_id, h.placement_id, r.job_title_snapshot, r.candidate_label,
           r.source_org_id, so.name, r.target_org_id, tgo.name, h.created_at, h.start_date, h.offer_accepted_on,
           null::timestamptz, null::date, null::text
      from public.hire_records h
      join app.hire_record_admin x on x.hire_record_id = h.id and x.late
      join public.referrals r on r.id = h.referral_id
      join public.organizations so on so.id = r.source_org_id
      join public.organizations tgo on tgo.id = r.target_org_id
    union all
    select 'fee_overdue'::text, p.referral_id, p.id, r.job_title_snapshot, r.candidate_label,
           r.source_org_id, so.name, r.target_org_id, tgo.name, p.established_at, null::date, null::date,
           p.fee_details_due_at, n.notice_sent_on, n.notice_note
      from public.placements p
      join public.referrals r on r.id = p.referral_id
      join public.organizations so on so.id = r.source_org_id
      join public.organizations tgo on tgo.id = r.target_org_id
      left join app.placement_fee_notices n on n.placement_id = p.id
     where p.fee_details_entered_at is null and p.fee_details_due_at is not null and p.fee_details_due_at < now()
       and p.status in ('fee_pending', 'disputed')
    order by 10 desc;
end $$;
revoke execute on function public.admin_list_hire_tasks() from public, anon;
grant execute on function public.admin_list_hire_tasks() to authenticated;

create function public.admin_record_fee_notice(p_placement uuid, p_sent_on date, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.placements;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not app.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform app.enforce_rate_limit('admin.hire', 60, 3600);
  select * into p from public.placements where id = p_placement;
  if not found or p.fee_details_due_at is null or p.fee_details_entered_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_sent_on is null or p_sent_on > (now() at time zone 'America/Toronto')::date
     or p_sent_on < (p.established_at at time zone 'America/Toronto')::date then
    raise exception 'notice_date_invalid' using errcode = '22023';
  end if;
  if char_length(v_note) > 2000 then raise exception 'note_too_long' using errcode = '22023'; end if;
  insert into app.placement_fee_notices (placement_id, notice_sent_on, notice_note, notice_recorded_by, notice_recorded_at)
  values (p.id, p_sent_on, v_note, auth.uid(), now())
  on conflict (placement_id) do update set notice_sent_on = excluded.notice_sent_on, notice_note = excluded.notice_note,
    notice_recorded_by = excluded.notice_recorded_by, notice_recorded_at = excluded.notice_recorded_at;
  perform app.audit(null, 'placement.fee_notice_recorded', 'placement', p.id, jsonb_build_object('sent_on', p_sent_on));
end $$;
revoke execute on function public.admin_record_fee_notice(uuid, date, text) from public, anon;
grant execute on function public.admin_record_fee_notice(uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Maintenance (service role only, worker loop): overdue fee details notify the hiring side once (BR-31).
--    Drop 2 adds the hire-report clocks here.
-- ---------------------------------------------------------------------------
create function public.run_hire_maintenance() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  x record;
  v_fee integer := 0;
begin
  if auth.uid() is not null then raise exception 'forbidden' using errcode = '42501'; end if;
  for x in
    select p.id, p.target_org_id, p.fee_details_due_at, r.candidate_label
      from public.placements p
      join public.referrals r on r.id = p.referral_id
      join app.placement_fee_notices n on n.placement_id = p.id
     where p.status = 'fee_pending' and p.fee_details_entered_at is null and p.fee_details_due_at < now()
       and n.overdue_notified_at is null
     for update of n skip locked
  loop
    perform app.notify_org(x.target_org_id, 'fee_details.overdue', 'Fee details overdue',
      'Fee details for ' || x.candidate_label || ' were due ' || app.fmt_et(x.fee_details_due_at)
        || ' ET. Enter them on the placement.', '/commissions/' || x.id);
    update app.placement_fee_notices set overdue_notified_at = now() where placement_id = x.id;
    perform app.audit(x.target_org_id, 'placement.fee_details_overdue', 'placement', x.id, '{}');
    v_fee := v_fee + 1;
  end loop;
  return jsonb_build_object('fee_details_overdue', v_fee);
end $$;
revoke execute on function public.run_hire_maintenance() from public, anon, authenticated;
grant execute on function public.run_hire_maintenance() to service_role;
