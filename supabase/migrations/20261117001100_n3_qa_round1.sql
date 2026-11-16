-- N3 fix loop round 1 (qa-report.md; backend.md v2.1). Bodies re-copied from the live catalog after the user's
-- reset with both sessions' migrations (PD-064, PD-078); edits marked "-- N3 r1" / "-- v2.1".
--   QA-N3-01  app.establish_hire sets app.hire_record_rpc around the hire move, so an admin uphold on an accepted /
--             interviewing / offer referral passes app.enforce_pipeline_owner (the waiver stays scoped to `hired`).
--   QA-N3-02  file_hire_report, contest_hire_report, rebut_hire_report, request_authorization_check: once the per-user
--             limit is consumed, refusals are returned as {error: code} instead of raised, so the hit commits (the N1
--             submit-RPC pattern: outcomes, not exceptions). The codes and the generic refusal are unchanged.
--             Files are checked before any write (app.hire_files_ready).
--   QA-N3-05  run_hire_maintenance sends the day-5 and day-8 reminders separately when both are due.
--   QA-N3-06  report_hire stores hire_records.origin = 'report_confirmed' for a Confirm.
--   v2.1      hire_already_recorded carries the placement id; admin deadlines carry business days left;
--             get_hire_reports carries fee_details_due_at.

create or replace function app.establish_hire(p_referral uuid, p_how text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- N3 r1 QA-N3-01: the hire move is exempt from the pipeline-owner rule (as in report_hire); nothing else is.
  perform set_config('app.hire_record_rpc', 'on', true);
  update public.referrals set status = 'hired', version = version + 1 where id = r.id;
  perform set_config('app.hire_record_rpc', '', true);
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
end $function$;

-- N3 r1: checks drafts before any write, so a not-ready file is a returned refusal (QA-N3-02).
create function app.hire_files_ready(p_referral uuid, p_owner_kind text, p_org uuid, p_file_ids uuid[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(cardinality(p_file_ids), 0) = 0
      or (cardinality(p_file_ids) <= 5
          and (select count(distinct x) from unnest(p_file_ids) x) = cardinality(p_file_ids)
          and (select count(*) from app.hire_evidence_files f
                where f.id = any (p_file_ids) and f.referral_id = p_referral and f.owner_kind = p_owner_kind
                  and f.uploader_org_id = p_org and f.owner_id is null and f.removed_at is null and f.scan_status = 'clean') = cardinality(p_file_ids));
$$;
revoke execute on function app.hire_files_ready(uuid, text, uuid, uuid[]) from public, anon, authenticated;

create or replace function public.file_hire_report(p_referral uuid, p_acting_org uuid, p_employer text, p_start_month date, p_role text, p_learned_via text, p_statement text, p_tail_statement boolean, p_items jsonb, p_file_ids uuid[], p_attested boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.referrals;
  v_elig text;
  v_window timestamptz;
  v_employer text := btrim(coalesce(p_employer, ''));
  v_role text := nullif(btrim(coalesce(p_role, '')), '');
  v_statement text := btrim(coalesce(p_statement, ''));
  v_last_reject date;
  v_rejected integer;
  v_id uuid;
  v_due timestamptz;
  v_org text;
  v_month date := (now() at time zone 'America/Toronto')::date;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  -- Payload first: it reveals nothing about the referral (BR-18; the form validates the same fields).
  if char_length(v_employer) not between 1 and 200 or (v_role is not null and char_length(v_role) > 120)
     or coalesce(p_learned_via, '') not in ('candidate', 'profile', 'announcement', 'contact', 'other')
     or char_length(v_statement) not between 20 and 2000 or not coalesce(p_attested, false)
     or p_start_month is null or extract(day from p_start_month) <> 1
     or p_start_month > (date_trunc('month', v_month) + interval '3 months')::date
     or not app.hire_items_valid(p_items, 1) or coalesce(cardinality(p_file_ids), 0) > 5 then
    raise exception 'hire_report_invalid' using errcode = '22023';
  end if;
  perform app.enforce_rate_limit('dispute.open', 5, 3600);  -- the N1 disputes bucket, per user (BR-20)

  -- Every refusal below is the same generic code (BR-17, R-2), except a recorded hire and the org limits.
  if app.hire_side(p_referral, p_acting_org) is distinct from 'source' then
    return jsonb_build_object('error', 'hire_report_unavailable');  -- N3 r1 QA-N3-02: a result, so the rate-limit hit commits
  end if;
  select * into r from public.referrals where id = p_referral for update;
  v_elig := app.hire_eligibility(r.id);
  -- v2.1 (frontend gap 3): the placement A can already open (null for a hire recorded without a split).
  if v_elig = 'recorded' then
    return jsonb_build_object('error', 'hire_already_recorded', 'placement_id', (select hr.placement_id from public.hire_records hr where hr.referral_id = r.id));  -- N3 r1 QA-N3-02: a result, so the rate-limit hit commits
  end if;
  v_window := app.referral_window_end(r);
  if v_elig <> 'eligible' or not app.hire_report_open(r.id)
     or p_start_month < date_trunc('month', r.delivered_at at time zone 'America/Toronto')::date then
    return jsonb_build_object('error', 'hire_report_unavailable');  -- N3 r1 QA-N3-02: a result, so the rate-limit hit commits
  end if;
  -- BR-6: between window end + 6 and + 9 months, the tail statement and a backing item are required.
  if now() > app.add_months_et(v_window, 6)
     and (not coalesce(p_tail_statement, false)
          or not exists (select 1 from jsonb_array_elements(p_items) x where coalesce((x->>'backs_tail')::boolean, false))) then
    return jsonb_build_object('error', 'hire_report_tail_required');  -- N3 r1 QA-N3-02: a result, so the rate-limit hit commits
  end if;
  -- BR-17: a second report needs an item dated after the first rejection; never after two.
  select count(*), max((h.resolved_at at time zone 'America/Toronto')::date) into v_rejected, v_last_reject
    from app.hire_reports h where h.referral_id = r.id and h.status = 'rejected';
  if v_rejected >= 1 and not exists (select 1 from jsonb_array_elements(p_items) x where (x->>'item_date')::date > v_last_reject) then
    return jsonb_build_object('error', 'hire_report_unavailable');  -- N3 r1 QA-N3-02: a result, so the rate-limit hit commits
  end if;
  -- BR-20: per source org, 3 pending and 10 filed per rolling 90 days.
  if (select count(*) from app.hire_reports h where h.source_org_id = r.source_org_id and app.hire_report_pending(h.status)) >= 3
     or (select count(*) from app.hire_reports h where h.source_org_id = r.source_org_id and h.filed_at > now() - interval '90 days') >= 10 then
    return jsonb_build_object('error', 'hire_report_rate_limited');  -- N3 r1 QA-N3-02: a result, so the rate-limit hit commits
  end if;
  if coalesce(cardinality(p_file_ids), 0) > 0 and (select count(*) from app.hire_evidence_files f
       where f.id = any (p_file_ids) and f.referral_id = r.id and f.owner_kind = 'hire_report' and f.uploader_org_id = r.source_org_id
         and f.owner_id is null and f.removed_at is null and f.scan_status = 'clean') <> cardinality(p_file_ids) then
    return jsonb_build_object('error', 'hire_report_files_not_ready');  -- N3 r1 QA-N3-02: a result, so the rate-limit hit commits
  end if;

  v_due := app.add_business_days(now(), 10);
  insert into app.hire_reports (referral_id, source_org_id, target_org_id, filed_by, employer_text, start_month, role_text,
    learned_via, statement, tail_statement, attested_at, answer_due_at)
  values (r.id, r.source_org_id, r.target_org_id, auth.uid(), v_employer, p_start_month, v_role, p_learned_via, v_statement,
    coalesce(p_tail_statement, false), now(), v_due)
  returning id into v_id;
  perform app.insert_hire_items(v_id, 'report', p_items);
  perform app.attach_hire_evidence(r.id, 'hire_report', r.source_org_id, p_file_ids, v_id, 5);

  -- BR-23: the job owner and every org admin / manager of B (record scope through notify_org); no employer text.
  select o.name into v_org from public.organizations o where o.id = r.source_org_id;
  perform app.notify_org(r.target_org_id, 'hire_report.filed', 'Hire report filed',
    coalesce(v_org, 'The sourcing recruiter') || ' filed a hire report on ' || r.candidate_label || ' for ' || r.job_title_snapshot
      || '. Answer by ' || app.fmt_et(v_due) || ' ET.', '/referrals/' || r.id);
  perform app.audit(r.source_org_id, 'hire_report.filed', 'referral', r.id, jsonb_build_object('report_id', v_id));
  perform app.audit(r.target_org_id, 'hire_report.filed', 'referral', r.id, jsonb_build_object('report_id', v_id));
  return jsonb_build_object('outcome', 'filed', 'report_id', v_id, 'answer_due_at', v_due);
end $function$;

create or replace function public.contest_hire_report(p_report uuid, p_acting_org uuid, p_reason text, p_statement text, p_offer_accepted_on date, p_process_started_on date, p_file_ids uuid[], p_attested boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  h app.hire_reports;
  r public.referrals;
  v_statement text := btrim(coalesce(p_statement, ''));
  v_today date := (now() at time zone 'America/Toronto')::date;
  v_dispute uuid;
  v_due timestamptz;
  v_org text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select * into h from app.hire_reports where id = p_report for update;
  if not found or app.hire_side(h.referral_id, p_acting_org) is distinct from 'target' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform app.enforce_rate_limit('dispute.open', 5, 3600);
  if coalesce(p_reason, '') not in ('not_hired', 'outside_window', 'different_person', 'not_this_client')
     or char_length(v_statement) not between 20 and 2000 or not coalesce(p_attested, false)
     or coalesce(cardinality(p_file_ids), 0) > 5
     or (p_reason = 'outside_window' and (p_offer_accepted_on is null or p_process_started_on is null
                                          or p_offer_accepted_on > v_today or p_process_started_on > p_offer_accepted_on)) then
    raise exception 'hire_contest_invalid' using errcode = '22023';
  end if;
  if h.status <> 'awaiting_answer' or now() >= h.answer_due_at then
    return jsonb_build_object('error', 'hire_report_answer_closed');  -- N3 r1 QA-N3-02: a result, so the rate-limit hit commits
  end if;
  if exists (select 1 from public.disputes d where d.referral_id = h.referral_id and d.status = 'open') then
    return jsonb_build_object('error', 'dispute_already_open');  -- N3 r1 QA-N3-02: a result, so the rate-limit hit commits
  end if;
  if not app.hire_files_ready(h.referral_id, 'hire_contest', h.target_org_id, p_file_ids) then
    return jsonb_build_object('error', 'hire_report_files_not_ready');  -- N3 r1 QA-N3-02: a result, so the rate-limit hit commits
  end if;
  select * into r from public.referrals where id = h.referral_id;
  insert into public.disputes (kind, referral_id, hire_report_id, opened_by, opened_by_org, reason)
  values ('hire_report', h.referral_id, h.id, auth.uid(), h.target_org_id, 'Hire report contested: ' || p_reason)
  returning id into v_dispute;
  v_due := app.add_business_days(now(), 5);
  update app.hire_reports
     set status = 'contested', contest_reason = p_reason, contest_statement = v_statement,
         contest_offer_accepted_on = case when p_reason = 'outside_window' then p_offer_accepted_on end,
         contest_process_started_on = case when p_reason = 'outside_window' then p_process_started_on end,
         contested_by = auth.uid(), contested_at = now(), contest_attested_at = now(), rebuttal_due_at = v_due, dispute_id = v_dispute
   where id = h.id;
  perform app.attach_hire_evidence(h.referral_id, 'hire_contest', h.target_org_id, p_file_ids, h.id, 5);
  select o.name into v_org from public.organizations o where o.id = h.target_org_id;
  perform app.notify_org(h.source_org_id, 'hire_report.contested', 'Hire report contested',
    coalesce(v_org, 'The hiring recruiter') || ' contested your hire report on ' || r.candidate_label
      || '. You can add one rebuttal by ' || app.fmt_et(v_due) || ' ET.', '/referrals/' || r.id);
  perform app.audit(h.target_org_id, 'hire_report.contested', 'referral', r.id, jsonb_build_object('report_id', h.id, 'reason', p_reason));
  perform app.audit(h.source_org_id, 'hire_report.contested', 'referral', r.id, jsonb_build_object('report_id', h.id));
  return jsonb_build_object('rebuttal_due_at', v_due, 'dispute_id', v_dispute);
end $function$;

create or replace function public.rebut_hire_report(p_report uuid, p_acting_org uuid, p_statement text, p_items jsonb, p_file_ids uuid[], p_attested boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  h app.hire_reports;
  r public.referrals;
  v_statement text := btrim(coalesce(p_statement, ''));
  v_decide timestamptz;
  v_org text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select * into h from app.hire_reports where id = p_report for update;
  if not found or app.hire_side(h.referral_id, p_acting_org) is distinct from 'source' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform app.enforce_rate_limit('dispute.open', 5, 3600);
  if char_length(v_statement) not between 20 and 2000 or not coalesce(p_attested, false)
     or not app.hire_items_valid(coalesce(p_items, '[]'::jsonb), 0) or coalesce(cardinality(p_file_ids), 0) > 5 then
    raise exception 'hire_rebuttal_invalid' using errcode = '22023';
  end if;
  if h.status <> 'contested' or h.rebuttal_at is not null or now() >= h.rebuttal_due_at then
    return jsonb_build_object('error', 'hire_rebuttal_closed');  -- N3 r1 QA-N3-02: a result, so the rate-limit hit commits
  end if;
  if not app.hire_files_ready(h.referral_id, 'hire_rebuttal', h.source_org_id, p_file_ids) then
    return jsonb_build_object('error', 'hire_report_files_not_ready');  -- N3 r1 QA-N3-02: a result, so the rate-limit hit commits
  end if;
  v_decide := app.add_business_days(h.rebuttal_due_at, 10);
  update app.hire_reports set status = 'in_review', rebuttal_statement = v_statement, rebuttal_by = auth.uid(), rebuttal_at = now(),
         decide_by = v_decide where id = h.id;
  perform app.insert_hire_items(h.id, 'rebuttal', coalesce(p_items, '[]'::jsonb));
  perform app.attach_hire_evidence(h.referral_id, 'hire_rebuttal', h.source_org_id, p_file_ids, h.id, 5);
  select * into r from public.referrals where id = h.referral_id;
  select o.name into v_org from public.organizations o where o.id = h.source_org_id;
  perform app.notify_org(h.target_org_id, 'hire_report.rebuttal', 'Rebuttal added to a hire report',
    coalesce(v_org, 'The sourcing recruiter') || ' added a rebuttal to the hire report on ' || r.candidate_label
      || '. A platform admin will decide.', '/referrals/' || r.id);
  perform app.audit(h.source_org_id, 'hire_report.rebutted', 'referral', r.id, jsonb_build_object('report_id', h.id));
  perform app.audit(h.target_org_id, 'hire_report.rebutted', 'referral', r.id, jsonb_build_object('report_id', h.id));
  return jsonb_build_object('decide_by', v_decide);
end $function$;

create or replace function public.request_authorization_check(p_referral uuid, p_acting_org uuid, p_reason text, p_file_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_kind text;
  v_ref uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if app.hire_side(p_referral, p_acting_org) is distinct from 'target' then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform app.enforce_rate_limit('dispute.open', 5, 3600);
  if char_length(v_reason) not between 20 and 2000 or coalesce(cardinality(p_file_ids), 0) > 5 then
    raise exception 'auth_check_invalid' using errcode = '22023';
  end if;
  select 'hire_report', h.id into v_kind, v_ref from app.hire_reports h
   where h.referral_id = p_referral and h.status in ('contested', 'in_review');
  if v_ref is null then
    select 'prior_presentation', c.id into v_kind, v_ref from app.referral_claims c
     where c.referral_id = p_referral and c.status = 'contested';
  end if;
  if v_ref is null then
    return jsonb_build_object('error', 'auth_check_not_available');  -- N3 r1 QA-N3-02: a result, so the rate-limit hit commits
  end if;
  if exists (select 1 from app.auth_check_requests q where q.dispute_kind = v_kind and q.dispute_ref = v_ref) then
    return jsonb_build_object('error', 'auth_check_already_requested');  -- N3 r1 QA-N3-02: a result, so the rate-limit hit commits
  end if;
  if not app.hire_files_ready(p_referral, 'auth_request', p_acting_org, p_file_ids) then
    return jsonb_build_object('error', 'hire_report_files_not_ready');  -- N3 r1 QA-N3-02: a result, so the rate-limit hit commits
  end if;
  insert into app.auth_check_requests (referral_id, dispute_kind, dispute_ref, requested_by, requested_by_org, reason)
  values (p_referral, v_kind, v_ref, auth.uid(), p_acting_org, v_reason) returning id into v_id;
  perform app.attach_hire_evidence(p_referral, 'auth_request', p_acting_org, p_file_ids, v_id, 5);
  perform app.audit(p_acting_org, 'auth_check.requested_by_hiring_side', 'referral', p_referral, jsonb_build_object('request_id', v_id));
  perform app.notify_platform_admins('auth_check.request', 'Authorization check requested',
    'The hiring side asked for an authorization check in a dispute.', '/admin/referrals/' || p_referral);
  return jsonb_build_object('request_id', v_id, 'requested_at', now());
end $function$;

create or replace function public.report_hire(p_referral uuid, p_expected_version integer, p_start_date date, p_terms_version uuid DEFAULT NULL::uuid, p_base_minor bigint DEFAULT NULL::bigint, p_bonus_minor bigint DEFAULT NULL::bigint, p_invoiced_fee_minor bigint DEFAULT NULL::bigint, p_difference_reason text DEFAULT NULL::text, p_difference_note text DEFAULT NULL::text, p_legacy_fee_minor bigint DEFAULT NULL::bigint, p_legacy_currency character DEFAULT NULL::bpchar, p_legacy_guarantee_days integer DEFAULT NULL::integer, p_offer_accepted_on date DEFAULT NULL::date, p_hired_role_title text DEFAULT NULL::text, p_report uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  hr app.hire_reports;   -- N3 v2
  v_confirmed boolean;
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
  -- N3 v2 (PD-077): start and acceptance within [delivery − 1 year, today + 548 days].
  v_floor := ((coalesce(r.delivered_at, r.submitted_at) at time zone 'America/Toronto')::date - interval '1 year')::date;
  if p_start_date is null or p_start_date < v_floor or p_start_date > v_today + 548
     or p_offer_accepted_on > v_today or p_offer_accepted_on > v_today + 548 or p_offer_accepted_on > p_start_date
     or p_offer_accepted_on < v_floor then
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
  -- N3 r1 QA-N3-06: a Confirm (p_report on a report awaiting an answer or unanswered) records origin report_confirmed.
  select * into hr from app.hire_reports
   where referral_id = r.id and status in ('awaiting_answer', 'unanswered', 'contested', 'in_review') for update;
  v_confirmed := hr.id is not null and p_report = hr.id and hr.status in ('awaiting_answer', 'unanswered');
  insert into public.hire_records (referral_id, source_org_id, target_org_id, kind, placement_id, origin, prior_status,
    offer_accepted_on, start_date, hired_role_title, recorded_by)
  values (r.id, r.source_org_id, r.target_org_id,
    case when v_kind = 'deemed' then 'placement' else v_kind end, v_id,
    case when v_confirmed then 'report_confirmed' else 'target_record' end, r.status,
    p_offer_accepted_on, p_start_date, v_title, auth.uid())
  returning id into v_hr;
  insert into app.hire_record_admin (hire_record_id, late) values (v_hr, v_late);

  -- N3 v2 (BR-22, BR-24): a pending hire report closes. Through the report's Confirm (p_report, while awaiting an
  -- answer or unanswered) it's `confirmed`; otherwise `closed_by_record`, and an open hire_report dispute closes too.
  if hr.id is not null then
    update app.hire_reports set status = case when v_confirmed then 'confirmed' else 'closed_by_record' end,
           resolved_at = now(), placement_id = v_id where id = hr.id;
    if hr.dispute_id is not null then
      update public.disputes set status = 'resolved', outcome = 'hire_closed_by_record', resolved_at = now(), resolved_by = auth.uid(),
             resolution = 'Closed: the hiring recruiter recorded the hire.'
       where id = hr.dispute_id and status = 'open';
    end if;
    select o.name into v_org from public.organizations o where o.id = r.target_org_id;
    if v_confirmed then
      perform app.notify_org(r.source_org_id, 'hire_report.confirmed', 'Hire report confirmed',
        coalesce(v_org, 'The hiring recruiter') || ' confirmed your hire report on ' || r.candidate_label || '.', '/referrals/' || r.id);
    else
      perform app.notify_org(r.source_org_id, 'hire_report.closed_by_record', 'Hire report closed',
        coalesce(v_org, 'The hiring recruiter') || ' recorded the hire of ' || r.candidate_label || '. Your hire report is closed.', '/referrals/' || r.id);
    end if;
    perform app.audit(r.source_org_id, 'hire_report.' || case when v_confirmed then 'confirmed' else 'closed_by_record' end, 'referral', r.id,
      jsonb_build_object('report_id', hr.id));
    perform app.audit(r.target_org_id, 'hire_report.' || case when v_confirmed then 'confirmed' else 'closed_by_record' end, 'referral', r.id,
      jsonb_build_object('report_id', hr.id));
  end if;

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
end $function$;

create or replace function public.run_hire_maintenance()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  x record;
  v_fee integer := 0;
  v_rem integer := 0;
  v_deemed integer := 0;
  v_unanswered integer := 0;
  v_review integer := 0;
  v_pid uuid;
  v_ok boolean;
  i integer;
begin
  if auth.uid() is not null then raise exception 'forbidden' using errcode = '42501'; end if;
  -- BR-31 (drop 1): overdue fee details notify the hiring side once.
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

  -- N3 v2 BR-23: reminders at business days 5 and 8, once each, only while awaiting an answer.
  for x in
    select h.id, h.referral_id, h.target_org_id, h.answer_due_at, r.candidate_label,
           (h.reminded_d5_at is null and now() >= app.add_business_days(h.filed_at, 5)) as d5,
           (h.reminded_d8_at is null and now() >= app.add_business_days(h.filed_at, 8)) as d8,
           (select o.name from public.organizations o where o.id = h.source_org_id) as source_name
      from app.hire_reports h join public.referrals r on r.id = h.referral_id
     where h.status = 'awaiting_answer' and now() < h.answer_due_at
       and ((h.reminded_d5_at is null and now() >= app.add_business_days(h.filed_at, 5))
            or (h.reminded_d8_at is null and now() >= app.add_business_days(h.filed_at, 8)))
     for update of h skip locked
  loop
    -- N3 r1 QA-N3-05: day 5 and day 8 are separate reminders, even when one sweep finds both due.
    for i in 1 .. (case when x.d5 then 1 else 0 end) + (case when x.d8 then 1 else 0 end) loop
      perform app.notify_org(x.target_org_id, 'hire_report.reminder', 'Hire report: answer needed',
        'Reminder: the hire report from ' || coalesce(x.source_name, 'the sourcing recruiter') || ' on ' || x.candidate_label
          || ' needs an answer by ' || app.fmt_et(x.answer_due_at) || ' ET.', '/referrals/' || x.referral_id);
      v_rem := v_rem + 1;
    end loop;
    update app.hire_reports set reminded_d5_at = case when x.d5 then now() else reminded_d5_at end,
           reminded_d8_at = case when x.d8 then now() else reminded_d8_at end where id = x.id;
  end loop;

  -- N3 v2 BR-29: at the answer deadline, deemed only through the delivery gate; otherwise the admin queue.
  for x in
    select h.*, r.candidate_label from app.hire_reports h join public.referrals r on r.id = h.referral_id
     where h.status = 'awaiting_answer' and now() >= h.answer_due_at
     for update of h skip locked
  loop
    v_ok := app.hire_report_deemable(x.id);
    v_pid := null;
    if v_ok then
      begin
        v_pid := app.establish_hire(x.referral_id, 'deemed');
      exception when others then
        v_ok := false;  -- no longer eligible (e.g. void): the admin decides on the record
      end;
    end if;
    if v_ok then
      update app.hire_reports set status = 'deemed_confirmed', resolved_at = now(), placement_id = v_pid where id = x.id;
      perform app.notify_org(x.source_org_id, 'hire_report.deemed', 'Hire report confirmed',
        'The hire report on ' || x.candidate_label || ' is confirmed: no answer by the deadline.', '/referrals/' || x.referral_id);
      perform app.notify_org(x.target_org_id, 'hire_report.deemed', 'Hire report confirmed',
        'The hire report on ' || x.candidate_label || ' is confirmed: no answer by the deadline.', '/referrals/' || x.referral_id);
      perform app.audit(null, 'hire_report.deemed', 'referral', x.referral_id, jsonb_build_object('report_id', x.id, 'placement_id', v_pid));
      v_deemed := v_deemed + 1;
    else
      update app.hire_reports set status = 'unanswered', decide_by = app.add_business_days(x.answer_due_at, 10) where id = x.id;
      perform app.audit(null, 'hire_report.unanswered', 'referral', x.referral_id, jsonb_build_object('report_id', x.id));
      v_unanswered := v_unanswered + 1;
    end if;
  end loop;

  -- N3 v2 BR-26/27: no rebuttal by the deadline → in review, decide_by = rebuttal deadline + 10 business days.
  for x in
    select h.id, h.referral_id, h.rebuttal_due_at from app.hire_reports h
     where h.status = 'contested' and now() >= h.rebuttal_due_at
     for update of h skip locked
  loop
    update app.hire_reports set status = 'in_review', decide_by = app.add_business_days(x.rebuttal_due_at, 10) where id = x.id;
    v_review := v_review + 1;
  end loop;

  return jsonb_build_object('fee_details_overdue', v_fee, 'hire_report_reminders', v_rem, 'hire_reports_deemed', v_deemed,
                            'hire_reports_unanswered', v_unanswered, 'hire_reports_in_review', v_review);
end $function$;

drop function public.admin_list_hire_reports();
create function public.admin_list_hire_reports()
 RETURNS TABLE(row_kind text, id uuid, referral_id uuid, section text, status text, source_org_id uuid, source_org_name text, target_org_id uuid, target_org_name text, job_title text, candidate_label text, filed_at timestamp with time zone, deadline timestamp with time zone, overdue boolean, resolved_at timestamp with time zone, finding text, source_suspended boolean, target_suspended boolean, deadline_business_days_left integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  return query
    select 'report'::text, h.id, h.referral_id,
           case when h.status in ('in_review', 'unanswered') then 'decide'
                when h.status in ('awaiting_answer', 'contested') then 'waiting' else 'closed' end,
           h.status, h.source_org_id, so.name, h.target_org_id, tgo.name, r.job_title_snapshot, r.candidate_label, h.filed_at,
           case h.status when 'awaiting_answer' then h.answer_due_at when 'contested' then h.rebuttal_due_at
                         when 'in_review' then h.decide_by when 'unanswered' then h.decide_by end,
           h.status in ('in_review', 'unanswered') and h.decide_by < now(),
           h.resolved_at, h.finding, so.suspended_at is not null, tgo.suspended_at is not null,
           app.business_days_left(case h.status when 'awaiting_answer' then h.answer_due_at when 'contested' then h.rebuttal_due_at
                                                when 'in_review' then h.decide_by when 'unanswered' then h.decide_by end)  -- v2.1
      from app.hire_reports h
      join public.referrals r on r.id = h.referral_id
      join public.organizations so on so.id = h.source_org_id
      join public.organizations tgo on tgo.id = h.target_org_id
     where app.hire_report_pending(h.status)
        or h.id in (select x.id from app.hire_reports x where not app.hire_report_pending(x.status) order by x.resolved_at desc nulls last limit 20)
    union all
    select 'auth_check'::text, k.id, k.referral_id, 'waiting', k.status, r.source_org_id, so.name, r.target_org_id, tgo.name,
           r.job_title_snapshot, r.candidate_label, k.opened_at, k.evidence_due_at, k.evidence_due_at < now(), null::timestamptz,
           null::text, so.suspended_at is not null, tgo.suspended_at is not null, app.business_days_left(k.evidence_due_at)  -- v2.1
      from app.authorization_checks k
      join public.referrals r on r.id = k.referral_id
      join public.organizations so on so.id = r.source_org_id
      join public.organizations tgo on tgo.id = r.target_org_id
     where k.status = 'open';
end $function$;
revoke execute on function public.admin_list_hire_reports() from public, anon;
grant execute on function public.admin_list_hire_reports() to authenticated;

create or replace function public.admin_get_hire_report(p_report uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  h app.hire_reports;
  r public.referrals;
  j public.jobs;
  v_window timestamptz;
  v_cand uuid;
  v_issued timestamptz;
  v_full_items jsonb;
begin
  if not app.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into h from app.hire_reports where id = p_report;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into r from public.referrals where id = h.referral_id;
  select * into j from public.jobs where id = r.job_id;
  v_window := app.referral_window_end(r);
  select l.candidate_id into v_cand from public.referral_candidate_links l where l.referral_id = r.id;
  select q.token_issued_at into v_issued from public.referral_candidate_requests q where q.referral_id = r.id;
  return jsonb_build_object(
    'id', h.id, 'status', h.status, 'referral_id', r.id, 'job_title', r.job_title_snapshot, 'candidate_label', r.candidate_label,
    'source_org', (select jsonb_build_object('id', o.id, 'name', o.name, 'suspended', o.suspended_at is not null) from public.organizations o where o.id = h.source_org_id),
    'target_org', (select jsonb_build_object('id', o.id, 'name', o.name, 'suspended', o.suspended_at is not null) from public.organizations o where o.id = h.target_org_id),
    -- RD-033: both keys. Names aren't stored at commit/delivery; the job's current name is shown with them.
    'client', jsonb_build_object(
      'commit_key', (select k.client_key from app.referral_commit_keys k where k.referral_id = r.id),
      'delivery_key', (select p.client_key from app.referral_presentations p where p.referral_id = r.id),
      'job_client_name', j.client_name),
    'delivered_at', r.delivered_at, 'window_end', v_window,
    'tail_end', case when v_window is not null then app.add_months_et(v_window, 3) end,
    'report_until', case when v_window is not null then app.add_months_et(v_window, 6) end,
    'report_tail_until', case when v_window is not null then app.add_months_et(v_window, 9) end,
    'legacy', r.terms_version_id is null,
    'status_history', coalesce((select jsonb_agg(jsonb_build_object('from', e.from_status, 'to', e.to_status, 'at', e.created_at) order by e.id)
                                  from public.referral_status_events e where e.referral_id = r.id), '[]'::jsonb),
    'report', jsonb_build_object(
      'filed_at', h.filed_at, 'filed_by_name', (select p.full_name from public.profiles p where p.id = h.filed_by),
      'employer_text', h.employer_text, 'start_month', h.start_month, 'role_text', h.role_text, 'learned_via', h.learned_via,
      'statement', h.statement, 'tail_statement', h.tail_statement, 'answer_due_at', h.answer_due_at,
      'items', coalesce((select jsonb_agg(jsonb_build_object('type', i.type, 'item_date', i.item_date, 'captured_on', i.captured_on,
                          'url', i.url, 'backs_tail', i.backs_tail) order by i.position)
                         from app.hire_report_items i where i.report_id = h.id and i.part = 'report'), '[]'::jsonb),
      'files', app.hire_files_view(h.id, 'hire_report', true)),
    'answer', case when h.contest_reason is not null then jsonb_build_object(
      'reason', h.contest_reason, 'statement', h.contest_statement, 'offer_accepted_on', h.contest_offer_accepted_on,
      'process_started_on', h.contest_process_started_on, 'contested_at', h.contested_at, 'attested_at', h.contest_attested_at,
      'rebuttal_due_at', h.rebuttal_due_at, 'files', app.hire_files_view(h.id, 'hire_contest', true)) end,
    'rebuttal', case when h.rebuttal_at is not null then jsonb_build_object(
      'statement', h.rebuttal_statement, 'at', h.rebuttal_at,
      'items', coalesce((select jsonb_agg(jsonb_build_object('type', i.type, 'item_date', i.item_date, 'captured_on', i.captured_on, 'url', i.url)
                          order by i.position) from app.hire_report_items i where i.report_id = h.id and i.part = 'rebuttal'), '[]'::jsonb),
      'files', app.hire_files_view(h.id, 'hire_rebuttal', true)) end,
    -- v2.1 (frontend gap 4): server business days left for each open deadline.
    'answer_business_days_left', case when h.status = 'awaiting_answer' then app.business_days_left(h.answer_due_at) end,
    'rebuttal_business_days_left', case when h.status = 'contested' then app.business_days_left(h.rebuttal_due_at) end,
    'decide_business_days_left', case when h.status in ('in_review', 'unanswered') then app.business_days_left(h.decide_by) end,
    'decide_by', h.decide_by, 'overdue', h.status in ('in_review', 'unanswered') and h.decide_by < now(),
    'resolved_at', h.resolved_at, 'resolution', h.resolution, 'finding', h.finding, 'placement_id', h.placement_id,
    'signals', jsonb_build_object(
      -- PD-024 extended (spec §2.9): there's no second referral to compare with here, so every channel reads
      -- "not available" (HE-5 cross-org comparison isn't modelled).
      'same_person', jsonb_build_object('email', 'not_available', 'phone', 'not_available', 'linkedin', 'not_available'),
      'record_created_at', (select c.created_at from public.candidates c where c.id = v_cand and v_issued is not null
                              and c.created_at between v_issued - interval '30 days' and v_issued),
      'email_changed_at', (select max(e.changed_at) from app.candidate_email_changes e where e.candidate_id = v_cand),
      'source_rejected_90d', (select count(*) from app.hire_reports x where x.source_org_id = h.source_org_id and x.status = 'rejected'
                                and x.resolved_at > now() - interval '90 days'),
      'late', (select x.late from app.hire_record_admin x join public.hire_records hr on hr.id = x.hire_record_id where hr.referral_id = r.id),
      'hire_record_note', (select x.admin_note from app.hire_record_admin x join public.hire_records hr on hr.id = x.hire_record_id where hr.referral_id = r.id)),
    'delivery_records', coalesce((select jsonb_agg(jsonb_build_object('recipient_user_id', d.recipient_user_id, 'status', d.status, 'status_at', d.status_at)
                                    order by d.status_at)
                                    from app.email_deliveries d where d.entity_type = 'hire_report' and d.entity_id = h.id), '[]'::jsonb),
    'admin', jsonb_build_object('candidate_contacts', h.candidate_contacts, 'client_confirmation', h.client_confirmation, 'note', h.admin_note),
    'auth_check_request', (select jsonb_build_object('id', q.id, 'reason', q.reason, 'requested_at', q.requested_at,
                             'files', app.hire_files_view(q.id, 'auth_request', true))
                             from app.auth_check_requests q where q.dispute_kind = 'hire_report' and q.dispute_ref = h.id),
    'auth_check', (select jsonb_build_object('id', k.id, 'status', k.status, 'evidence_due_at', k.evidence_due_at, 'evidence_at', k.evidence_at)
                     from app.authorization_checks k where k.referral_id = r.id order by k.opened_at desc limit 1),
    'can_decide', h.status in ('in_review', 'unanswered'),
    -- BR-27 uphold dialog body: a fee-pending placement, or recorded without a split (flag off, no agreement).
    'uphold_creates_placement', exists (select 1 from public.collaboration_agreements a where a.referral_id = r.id and a.status = 'active')
                                or app.deemed_agreement_enabled());
end $function$;

create or replace function public.get_hire_reports(p_referral uuid, p_acting_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_side text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  v_side := app.hire_side(p_referral, p_acting_org);
  if v_side is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return coalesce((
    select jsonb_agg(x.j order by x.filed_at desc) from (
      select h.filed_at, jsonb_build_object(
        'id', h.id,
        'status', h.status,
        'filed_at', h.filed_at,
        'filed_by_name', case when v_side = 'source' then (select p.full_name from public.profiles p where p.id = h.filed_by) end,
        'source_org_name', (select o.name from public.organizations o where o.id = h.source_org_id),
        'employer_text', h.employer_text,
        'start_month', h.start_month,
        'role_text', h.role_text,
        'learned_via', h.learned_via,
        'tail_statement', h.tail_statement,
        'statement', h.statement,
        'answer_due_at', h.answer_due_at,
        'answer_business_days_left', case when h.status = 'awaiting_answer' then app.business_days_left(h.answer_due_at) end,
        'items', coalesce((select jsonb_agg(jsonb_build_object('type', i.type, 'item_date', i.item_date, 'captured_on', i.captured_on,
                             'backs_tail', i.backs_tail) || case when v_side = 'source' then jsonb_build_object('url', i.url) else '{}'::jsonb end
                             order by i.position)
                            from app.hire_report_items i where i.report_id = h.id and i.part = 'report'), '[]'::jsonb),
        'files', app.hire_files_view(h.id, 'hire_report', v_side = 'source'),
        'contest', case when h.contest_reason is not null then jsonb_build_object(
            'reason', h.contest_reason,
            'contested_at', h.contested_at,
            'offer_accepted_on', h.contest_offer_accepted_on,
            'process_started_on', h.contest_process_started_on,
            -- BR-25 rev. 2: on not_this_client the statement is admin-only.
            'statement', case when v_side = 'target' or h.contest_reason <> 'not_this_client' then h.contest_statement end,
            'files', case when v_side = 'target' then app.hire_files_view(h.id, 'hire_contest', true) else '[]'::jsonb end) end,
        'rebuttal_due_at', h.rebuttal_due_at,
        'rebuttal_business_days_left', case when h.status = 'contested' then app.business_days_left(h.rebuttal_due_at) end,
        'rebuttal', case when h.rebuttal_at is not null then jsonb_build_object(
            'statement', h.rebuttal_statement, 'at', h.rebuttal_at,
            'items', coalesce((select jsonb_agg(jsonb_build_object('type', i.type, 'item_date', i.item_date, 'captured_on', i.captured_on)
                                 || case when v_side = 'source' then jsonb_build_object('url', i.url) else '{}'::jsonb end order by i.position)
                                from app.hire_report_items i where i.report_id = h.id and i.part = 'rebuttal'), '[]'::jsonb),
            'files', app.hire_files_view(h.id, 'hire_rebuttal', v_side = 'source')) end,
        'resolved_at', h.resolved_at,
        'not_this_client', h.finding = 'not_this_client',
        'resolution', case when v_side = 'target' or h.finding is distinct from 'not_this_client' then h.resolution end,
        'placement_id', h.placement_id,
        'fee_details_due_at', (select p.fee_details_due_at from public.placements p where p.id = h.placement_id),  -- v2.1
        'can_confirm', v_side = 'target' and h.status in ('awaiting_answer', 'unanswered'),
        'can_contest', v_side = 'target' and h.status = 'awaiting_answer' and now() < h.answer_due_at,
        'can_rebut', v_side = 'source' and h.status = 'contested' and h.rebuttal_at is null and now() < h.rebuttal_due_at,
        'auth_check_requested_at', case when v_side = 'target' then (select q.requested_at from app.auth_check_requests q
                                      where q.dispute_kind = 'hire_report' and q.dispute_ref = h.id) end,
        'can_request_auth_check', v_side = 'target' and h.status in ('contested', 'in_review')
                                  and not exists (select 1 from app.auth_check_requests q where q.dispute_kind = 'hire_report' and q.dispute_ref = h.id)
      ) as j
      from app.hire_reports h where h.referral_id = p_referral) x), '[]'::jsonb);
end $function$;
