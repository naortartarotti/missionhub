-- N3 drop 1: the hiring side records a hire from any counting referral (BR-3, BR-4, BR-7 to BR-15, BR-45).
--
--   app.hire_compute              N2's fee checks, factored out of report_hire (20261116000600, live) so
--                                 report_hire and complete_fee_details share them. Edits marked "-- N3":
--                                 the BR-15 reason. Raises the N2 codes unchanged.
--   app.create_deemed_agreement   BR-9: an active agreement from the referral's frozen snapshot (or, for a
--                                 legacy referral, the default rule in force at submission, HE-8), origin
--                                 'deemed'. Internal referrals keep 0 sourcing bps (HE-14).
--   app.record_hire_kind          the outcome for a referral: placement on the active agreement, placement on
--                                 a deemed agreement (flag on), or a hire recorded without a split.
--   public.report_hire v3         dropped and recreated (one signature). Any eligible status, two new optional
--                                 arguments (acceptance date, another role at the client). Returns the
--                                 placement id, or NULL for a hire recorded without a split.
--   app.establish_hire            the BR-9 / BR-10 path for upheld and deemed reports (drop 2 calls it):
--                                 a fee-pending placement, or a hire recorded without a split. Never late.
-- Late marker (BR-13) and admin note live in app.hire_record_admin (admin-only).

-- ---------------------------------------------------------------------------
-- 1. Fee checks (N2 BR-21 to BR-26), shared
-- ---------------------------------------------------------------------------
create function app.hire_compute(
  p_referral uuid, p_start_date date, p_terms_version uuid,
  p_base_minor bigint, p_bonus_minor bigint, p_invoiced_fee_minor bigint, p_difference_reason text, p_difference_note text,
  p_legacy_fee_minor bigint, p_legacy_currency char(3), p_legacy_guarantee_days integer,
  out terms_version_id uuid, out computed_fee_minor bigint, out invoiced_fee_minor bigint, out currency char(3),
  out guarantee_until date, out difference_reason text, out difference_note text)
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.referrals;
  v public.job_terms_versions;
  v_c bigint;
  v_i bigint;
  v_note text := nullif(btrim(coalesce(p_difference_note, '')), '');
  v_reason text := nullif(btrim(coalesce(p_difference_reason, '')), '');
begin
  select * into r from public.referrals where id = p_referral;
  if p_start_date is null then raise exception 'invalid_fee' using errcode = '22023'; end if;
  if r.terms_version_id is not null then
    if p_terms_version is null or p_terms_version is distinct from app.effective_terms_version(r.id) then
      raise exception 'hire_terms_changed' using errcode = 'P0001';
    end if;
    if p_legacy_fee_minor is not null or p_legacy_currency is not null or p_legacy_guarantee_days is not null then
      raise exception 'hire_terms_fixed' using errcode = '22023';
    end if;
    select * into v from public.job_terms_versions where id = app.effective_terms_version(r.id);
    if (v.fee_basis = 'pct_base' and (p_base_minor is null or p_base_minor <= 0 or p_bonus_minor is not null))
       or (v.fee_basis = 'pct_total_cash' and (p_base_minor is null or p_base_minor <= 0 or p_bonus_minor is null or p_bonus_minor < 0))
       or (v.fee_basis = 'flat' and (p_base_minor is not null or p_bonus_minor is not null))
       or p_base_minor > 1000000000000 or p_bonus_minor > 1000000000000 then
      raise exception 'hire_base_invalid' using errcode = '22023';
    end if;
    v_c := app.compute_fee(v.fee_basis, v.rate_bps, v.flat_fee_minor, v.min_fee_minor, p_base_minor, p_bonus_minor);
    v_i := coalesce(p_invoiced_fee_minor, v_c);
    if v_i is null or v_i <= 0 then raise exception 'invalid_fee' using errcode = '22023'; end if;
    if v_c::numeric > 1000000000000 or v_i::numeric < ceil(v_c::numeric / 100) or v_i::numeric > v_c::numeric * 100
       or v_i > 1000000000000 then
      raise exception 'hire_base_invalid' using errcode = '22023';
    end if;
    if v_i <> v_c then
      if v_reason is null
         or v_reason not in ('client_discount', 'client_contract_rate', 'client_invoiced_other_currency', 'invoice_correction', 'other',
                             'non_permanent_engagement')  -- N3 BR-15
         or (v_reason = 'other' and v_note is null) then
        raise exception 'fee_difference_reason_required' using errcode = '22023';
      end if;
      if v_note is not null and char_length(v_note) > 500 then raise exception 'fee_difference_note_too_long' using errcode = '22023'; end if;
    elsif v_reason is not null or v_note is not null then
      raise exception 'fee_difference_not_allowed' using errcode = '22023';
    end if;
    terms_version_id := v.id;
    computed_fee_minor := v_c;
    invoiced_fee_minor := v_i;
    currency := v.currency;
    guarantee_until := case when v.guarantee_days = 0 then null else p_start_date + v.guarantee_days end;
    difference_reason := case when v_i <> v_c then v_reason end;
    difference_note := case when v_i <> v_c then v_note end;
  else
    if p_terms_version is not null or p_base_minor is not null or p_bonus_minor is not null or p_invoiced_fee_minor is not null
       or v_reason is not null or v_note is not null then
      raise exception 'terms_not_recorded' using errcode = '22023';
    end if;
    if p_legacy_fee_minor is null or p_legacy_fee_minor <= 0 or p_legacy_fee_minor > 1000000000000
       or coalesce(p_legacy_currency, '') !~ '^[A-Z]{3}$'
       or coalesce(p_legacy_guarantee_days, 90) not between 0 and 365 then
      raise exception 'invalid_fee' using errcode = '22023';
    end if;
    invoiced_fee_minor := p_legacy_fee_minor;
    currency := p_legacy_currency;
    guarantee_until := p_start_date + coalesce(p_legacy_guarantee_days, 90);
  end if;
end $$;
revoke execute on function app.hire_compute(uuid, date, uuid, bigint, bigint, bigint, text, text, bigint, char, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Deemed agreement (BR-9, HE-8, HE-14)
-- ---------------------------------------------------------------------------
create function app.create_deemed_agreement(p_referral uuid) returns public.collaboration_agreements
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  a public.collaboration_agreements;
  v_rule public.commission_rules;
begin
  select * into r from public.referrals where id = p_referral;
  select * into a from public.collaboration_agreements where referral_id = r.id for update;
  if found then
    if a.status <> 'pending_source' then raise exception 'hire_not_eligible' using errcode = 'P0001'; end if;
    -- AC-21: the pending agreement (accepted, never confirmed) becomes active as deemed; no second one.
    update public.collaboration_agreements set status = 'active', origin = 'deemed', deemed_at = now()
     where id = a.id returning * into a;
    return a;
  end if;
  if r.commission_rule_id is not null then
    select * into v_rule from public.commission_rules where id = r.commission_rule_id;
  else
    -- HE-8: the default rule version in force at submission (legacy referrals have no frozen rule).
    select * into v_rule from public.commission_rules
     where effective_from <= r.submitted_at order by effective_from desc, version desc limit 1;
    if not found then
      select * into v_rule from public.commission_rules where is_default and retired_at is null order by version desc limit 1;
    end if;
  end if;
  if v_rule.id is null then raise exception 'no_default_commission_rule' using errcode = 'P0001'; end if;
  insert into public.collaboration_agreements (referral_id, rule_id, rule_name, rule_version,
    sourcing_bps, job_owner_bps, platform_bps, status, target_accepted_by, target_accepted_at,
    terms_version_id, platform_basis, origin, deemed_at)
  values (r.id, v_rule.id,
    case when r.internal then v_rule.name || ' (internal)' else v_rule.name end,
    v_rule.version,
    case when r.internal then 0 else v_rule.sourcing_bps end,
    case when r.internal then v_rule.sourcing_bps + v_rule.job_owner_bps else v_rule.job_owner_bps end,
    v_rule.platform_bps, 'active', null, null,
    case when r.terms_version_id is not null then app.effective_terms_version(r.id) end,
    v_rule.platform_basis, 'deemed', now())
  returning * into a;
  return a;
end $$;
revoke execute on function app.create_deemed_agreement(uuid) from public, anon, authenticated;

-- 'placement' (active agreement) | 'deemed' (flag on, no confirmed agreement) | 'record_only_released'
-- | 'record_only_no_agreement'. A terminated agreement is never used (unreachable today; deny).
create function app.record_hire_kind(p_referral uuid, p_eligibility text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_status public.agreement_status;
begin
  if p_eligibility = 'record_only' then return 'record_only_released'; end if;
  select a.status into v_status from public.collaboration_agreements a where a.referral_id = p_referral;
  if v_status = 'active' then return 'placement'; end if;
  if v_status = 'terminated' then raise exception 'hire_not_eligible' using errcode = 'P0001'; end if;
  if app.deemed_agreement_enabled() then return 'deemed'; end if;
  return 'record_only_no_agreement';
end $$;
revoke execute on function app.record_hire_kind(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. report_hire v3 (BR-7 to BR-15, BR-45). Body = 20261116000600 (live); edits marked "-- N3".
-- ---------------------------------------------------------------------------
drop function public.report_hire(uuid, integer, date, uuid, bigint, bigint, bigint, text, text, bigint, char, integer);

create function public.report_hire(
  p_referral uuid,
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
  p_legacy_guarantee_days integer default null,
  p_offer_accepted_on date default null,   -- N3 BR-8: null = unknown, the start date is used for timing
  p_hired_role_title text default null     -- N3 BR-3/BR-8: another role at this client (≤ 120)
) returns uuid  -- N3: the placement id, or NULL for a hire recorded without a split (BR-9 flag off, BR-11)
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  a public.collaboration_agreements;
  m record;
  v_elig text;
  v_kind text;
  v_id uuid;
  v_hr uuid;
  v_late boolean;
  v_title text := nullif(btrim(coalesce(p_hired_role_title, '')), '');
  v_today date := (now() at time zone 'America/Toronto')::date;
  v_floor date;
  v_org text;
  v_label text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select * into r from public.referrals where id = p_referral for update;
  -- N3 (spec §2.0): anyone who can't act gets "not found", never a hint the referral exists.
  if not found or not app.sees_referral_as_target(r.id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform app.enforce_rate_limit('hire.record', 30, 3600);  -- N3
  if r.version <> p_expected_version then raise exception 'stale_version' using errcode = 'P0001'; end if;

  -- N3 BR-4 (replaces "status = offer"): any hire-eligible referral; one hire record per referral.
  v_elig := app.hire_eligibility(r.id);
  if v_elig not in ('eligible', 'record_only') then raise exception 'hire_not_eligible' using errcode = 'P0001'; end if;
  -- N3 BR-45: not while the hiring side's own objection on this referral is undecided.
  if app.objection_open(r.id) then raise exception 'objection_open' using errcode = 'P0001'; end if;

  -- N3 BR-8: dates (acceptance ≤ today and ≤ start; start bounded so the business-day table covers it).
  v_floor := (coalesce(r.delivered_at, r.submitted_at) at time zone 'America/Toronto')::date - 366;
  if p_start_date is null or p_start_date < v_floor or p_start_date > v_today + 548
     or p_offer_accepted_on > v_today or p_offer_accepted_on > p_start_date or p_offer_accepted_on < v_floor then
    raise exception 'hire_dates_invalid' using errcode = '22023';
  end if;
  -- N3 BR-3: another role only at this client, so only when the referral carries a client key.
  if v_title is not null and (char_length(v_title) > 120 or cardinality(app.referral_client_keys(r.id)) = 0) then
    raise exception 'hire_not_eligible' using errcode = 'P0001';
  end if;

  v_kind := app.record_hire_kind(r.id, v_elig);
  -- N3 BR-11: a released referral is checked exactly like the variant it would otherwise be, so nothing
  -- differs before the record; then its money inputs are discarded.
  if v_kind in ('placement', 'deemed')
     or (v_kind = 'record_only_released' and app.record_hire_kind(r.id, 'eligible') in ('placement', 'deemed')) then
    select * into m from app.hire_compute(r.id, p_start_date, p_terms_version, p_base_minor, p_bonus_minor, p_invoiced_fee_minor,
                          p_difference_reason, p_difference_note, p_legacy_fee_minor, p_legacy_currency, p_legacy_guarantee_days);
  end if;

  if v_kind = 'deemed' then
    a := app.create_deemed_agreement(r.id);
    perform app.audit(r.target_org_id, 'agreement.deemed', 'agreement', a.id, jsonb_build_object('referral_id', r.id));
    perform app.audit(r.source_org_id, 'agreement.deemed', 'agreement', a.id, jsonb_build_object('referral_id', r.id));
  elsif v_kind = 'placement' then
    select * into a from public.collaboration_agreements where referral_id = r.id;
  end if;

  if v_kind in ('placement', 'deemed') then
    insert into public.placements (referral_id, agreement_id, source_org_id, target_org_id, currency,
      contracted_fee_minor, start_date, guarantee_until, reported_by,
      terms_version_id, computed_fee_minor, reported_base_minor, reported_bonus_minor, fee_difference_reason, fee_difference_note,
      invoice_due_at)  -- N3 BR-14
    values (r.id, a.id, r.source_org_id, r.target_org_id, m.currency, m.invoiced_fee_minor, p_start_date, m.guarantee_until, auth.uid(),
      m.terms_version_id, m.computed_fee_minor, p_base_minor, p_bonus_minor, m.difference_reason, m.difference_note,
      app.add_business_days(app.date_et(p_start_date), 10))
    returning id into v_id;
    insert into public.placement_status_events (placement_id, from_status, to_status, actor_id, reason)
    values (v_id, null, 'hire_reported', auth.uid(), 'Hire reported by job owner');
  end if;

  -- N3 BR-7: the job owner or any manager of B records the hire, whoever accepted the referral (the pipeline-owner
  -- rule of 20261110000500 still governs every other move).
  perform set_config('app.hire_record_rpc', 'on', true);
  update public.referrals set status = 'hired', version = version + 1 where id = r.id;
  perform set_config('app.hire_record_rpc', '', true);
  insert into public.referral_status_events (referral_id, from_status, to_status, actor_id, actor_side, reason)
  values (r.id, r.status, 'hired', auth.uid(), 'target', 'Hire reported');  -- N3: from any eligible status

  -- N3 BR-13: late = more than 5 business days after the start date or the stated acceptance date. Not late
  -- within 5 business days after the hiring side's own objection was rejected (BR-45). Never blocks.
  v_late := (r.claim_rejected_at is null or now() > app.add_business_days(r.claim_rejected_at, 5))
            and (now() > app.add_business_days(app.date_et(p_start_date), 5)
                 or (p_offer_accepted_on is not null and now() > app.add_business_days(app.date_et(p_offer_accepted_on), 5)));
  insert into public.hire_records (referral_id, source_org_id, target_org_id, kind, placement_id, origin, prior_status,
    offer_accepted_on, start_date, hired_role_title, recorded_by)
  values (r.id, r.source_org_id, r.target_org_id,
    case when v_kind = 'deemed' then 'placement' else v_kind end, v_id, 'target_record', r.status,
    p_offer_accepted_on, p_start_date, v_title, auth.uid())
  returning id into v_hr;
  insert into app.hire_record_admin (hire_record_id, late) values (v_hr, v_late);

  -- Drop 2 (BR-22): a pending hire report on this referral closes as closed_by_record here.

  if v_kind = 'placement' then
    perform app.notify_org(r.source_org_id, 'placement.hired', 'Your candidate was hired',
      r.job_title_snapshot || ' — commission is projected until the client payment is verified.', '/commissions/' || v_id);
  elsif v_kind = 'deemed' then
    select o.name into v_org from public.organizations o where o.id = r.target_org_id;
    perform app.notify_org(r.source_org_id, 'hire.recorded_deemed_agreement', 'Hire recorded on your referral',
      coalesce(v_org, 'The hiring recruiter') || ' recorded the hire of ' || r.candidate_label
        || '. The agreement was created from the referral''s terms.', '/commissions/' || v_id);
  else
    select o.name into v_org from public.organizations o where o.id = r.target_org_id;
    perform app.notify_org(r.source_org_id, 'hire.recorded_without_split', 'Hire recorded on your referral',
      coalesce(v_org, 'The hiring recruiter') || ' recorded a hire of ' || r.candidate_label || '. No placement was created.',
      '/referrals/' || r.id);
  end if;
  if v_id is not null then
   if m.computed_fee_minor is not null and m.invoiced_fee_minor <> m.computed_fee_minor then
    select o.name into v_org from public.organizations o where o.id = r.target_org_id;
    v_label := case m.difference_reason
      when 'client_discount' then 'Client negotiated a lower fee'
      when 'client_contract_rate' then 'Client contract sets a different fee'
      when 'client_invoiced_other_currency' then 'Client invoiced in another currency'
      when 'invoice_correction' then 'Invoice correction or rounding'
      when 'non_permanent_engagement' then 'Non-permanent engagement'  -- N3 BR-15
      else 'Other' end;
    perform app.notify_org(r.source_org_id, 'placement.fee_difference', 'Invoiced fee differs from the computed fee',
      coalesce(v_org, 'The hiring recruiter') || ' reported a hire for ' || r.job_title_snapshot || ' with an invoiced fee of '
        || app.money_code(m.invoiced_fee_minor, m.currency) || ' instead of the computed ' || app.money_code(m.computed_fee_minor, m.currency)
        || '. Reason: ' || v_label || '.',
      '/commissions/' || v_id, r.source_user_id);
   end if;
  end if;

  -- Base and bonus are compensation data: never in audit metadata (N2 BR-24). `late` is admin-only: it goes
  -- only in the platform-level event (organization_id null), which org audit readers can't see.
  if v_id is not null then
    perform app.audit(r.target_org_id, 'placement.created', 'placement', v_id,
      jsonb_strip_nulls(jsonb_build_object('fee_minor', m.invoiced_fee_minor, 'currency', m.currency,
        'computed_fee_minor', m.computed_fee_minor, 'terms_version_id', m.terms_version_id)));
  end if;
  perform app.audit(r.target_org_id, 'referral.hire_recorded', 'referral', r.id,
    jsonb_build_object('hire_record_id', v_hr, 'kind', case when v_kind in ('placement', 'deemed') then 'placement' else 'no_split' end,
                       'prior_status', r.status));
  perform app.audit(r.source_org_id, 'referral.hire_recorded', 'referral', r.id,
    jsonb_build_object('hire_record_id', v_hr, 'kind', case when v_kind in ('placement', 'deemed') then 'placement' else 'no_split' end));
  perform app.audit(null, 'referral.hire_recorded', 'referral', r.id,
    jsonb_build_object('hire_record_id', v_hr, 'kind', case when v_kind = 'deemed' then 'placement_deemed' else v_kind end,
                       'prior_status', r.status, 'late', v_late));
  return v_id;
end $$;
revoke execute on function public.report_hire(uuid, integer, date, uuid, bigint, bigint, bigint, text, text, bigint, char, integer, date, text) from public, anon;
grant execute on function public.report_hire(uuid, integer, date, uuid, bigint, bigint, bigint, text, text, bigint, char, integer, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Establish a hire from a report (BR-9, BR-10, BR-31). Drop 2 calls this from the uphold decision and
--    the deemed-confirmation sweep. Never `late` (B didn't record it, BR-13).
-- ---------------------------------------------------------------------------
create function app.establish_hire(p_referral uuid, p_how text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  a public.collaboration_agreements;
  v_elig text;
  v_kind text;
  v_id uuid;
  v_hr uuid;
  v_cur char(3);
begin
  if p_how not in ('deemed', 'upheld') then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  select * into r from public.referrals where id = p_referral for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_elig := app.hire_eligibility(r.id);
  -- A released referral never carries a report (BR-17), so record_only can't reach this path.
  if v_elig <> 'eligible' then raise exception 'hire_not_eligible' using errcode = 'P0001'; end if;
  v_kind := app.record_hire_kind(r.id, v_elig);
  if v_kind = 'deemed' then
    a := app.create_deemed_agreement(r.id);
    perform app.audit(r.target_org_id, 'agreement.deemed', 'agreement', a.id, jsonb_build_object('referral_id', r.id));
    perform app.audit(r.source_org_id, 'agreement.deemed', 'agreement', a.id, jsonb_build_object('referral_id', r.id));
  elsif v_kind = 'placement' then
    select * into a from public.collaboration_agreements where referral_id = r.id;
  end if;
  if v_kind in ('placement', 'deemed') then
    -- The snapshot currency when the terms were recorded; legacy referrals get it with the fee details (PD-074).
    select v.currency into v_cur from public.job_terms_versions v where v.id = app.effective_terms_version(r.id);
    insert into public.placements (referral_id, agreement_id, source_org_id, target_org_id, status, currency,
      established_how, established_at, fee_details_due_at)
    values (r.id, a.id, r.source_org_id, r.target_org_id, 'fee_pending', v_cur,
      p_how, now(), app.add_business_days(now(), 10))
    returning id into v_id;
    insert into public.placement_status_events (placement_id, from_status, to_status, actor_id, reason)
    values (v_id, null, 'fee_pending', auth.uid(), case p_how when 'deemed' then 'Hire report confirmed (no answer)' else 'Hire report upheld' end);
    insert into app.placement_fee_notices (placement_id) values (v_id);
  end if;
  update public.referrals set status = 'hired', version = version + 1 where id = r.id;
  insert into public.referral_status_events (referral_id, from_status, to_status, actor_id, actor_side, reason)
  values (r.id, r.status, 'hired', auth.uid(), null, case p_how when 'deemed' then 'Hire report confirmed (no answer)' else 'Hire report upheld' end);
  insert into public.hire_records (referral_id, source_org_id, target_org_id, kind, placement_id, origin, prior_status, recorded_by)
  values (r.id, r.source_org_id, r.target_org_id, case when v_kind = 'deemed' then 'placement' else v_kind end, v_id,
          case p_how when 'deemed' then 'report_deemed' else 'report_upheld' end, r.status, auth.uid())
  returning id into v_hr;
  insert into app.hire_record_admin (hire_record_id, late) values (v_hr, false);
  perform app.audit(null, 'referral.hire_established', 'referral', r.id,
    jsonb_build_object('hire_record_id', v_hr, 'how', p_how, 'kind', v_kind, 'placement_id', v_id));
  return v_id;
end $$;
revoke execute on function app.establish_hire(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Pipeline-owner rule (20261110000500, live body): report_hire's `hired` move is exempt (BR-7, AC-14).
-- ---------------------------------------------------------------------------
create or replace function app.enforce_pipeline_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null
     or new.status = old.status
     or old.status not in ('accepted', 'interviewing', 'offer')
     or new.status = 'withdrawn'
     or (new.status = 'hired' and current_setting('app.hire_record_rpc', true) = 'on') then  -- N3 BR-7
    return new;
  end if;

  v_owner := app.pipeline_owner(new.id);
  if v_owner is null or v_owner = auth.uid() then
    return new;
  end if;

  -- Owner left the hiring organization: hand the referral back to the team.
  if not exists (
    select 1 from public.organization_memberships m
     where m.organization_id = new.target_org_id and m.user_id = v_owner and m.status = 'active'
  ) then
    return new;
  end if;

  raise exception 'not_pipeline_owner' using errcode = '42501';
end $$;
