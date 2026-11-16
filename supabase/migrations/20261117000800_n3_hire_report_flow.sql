-- N3 drop 2 (backend.md v2): filing a hire report, contest, rebuttal, the hiring side's record closing a pending
-- report, the per-client release block, side-shaped reads and the clocks.
--
-- Re-copied from the live catalog after a db:reset with both sessions' migrations (PD-064, PD-078); edits marked
-- "-- N3 v2":
--   public.report_hire              (20261117000400)  + p_report (Confirm, BR-24); closes a pending report (BR-22);
--                                                      PD-077 date window [delivery − 1 year, today + 548 days]
--   public.complete_fee_details     (20261117000500)  PD-077 date window
--   app.release_allowed             (20261117000500)  BR-21 per-client block while a report is pending
--   public.get_referral_hire_state  (20261117000500)  + v2 keys (filing state, pending report, BR-38 note, auth check)
--   public.run_hire_maintenance     (20261117000500)  + reminders, silence gate, rebuttal deadline

-- ---------------------------------------------------------------------------
-- Helpers (BR-6, BR-17, BR-29)
-- ---------------------------------------------------------------------------
create function app.hire_report_pending(p_status text) returns boolean
language sql immutable set search_path = '' as $$
  select p_status in ('awaiting_answer', 'unanswered', 'contested', 'in_review');
$$;

-- Validates and normalises evidence items: 1..5 (report) or 0..5 (rebuttal); dates ≤ today (ET); https links.
create function app.hire_items_valid(p_items jsonb, p_min integer) returns boolean
language plpgsql stable set search_path = '' as $$
declare
  x jsonb;
  v_today date := (now() at time zone 'America/Toronto')::date;
  v_d date;
  v_c date;
begin
  if p_items is null then return p_min = 0; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < p_min or jsonb_array_length(p_items) > 5 then return false; end if;
  for x in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(x) <> 'object'
       or coalesce(x->>'type', '') not in ('candidate_message', 'company_announcement', 'profile_change', 'third_party', 'other') then
      return false;
    end if;
    begin
      v_d := (x->>'item_date')::date;
      v_c := nullif(x->>'captured_on', '')::date;
    exception when others then return false;
    end;
    if v_d is null or v_d > v_today or (v_c is not null and (v_c < v_d or v_c > v_today))
       or (nullif(x->>'url', '') is not null and ((x->>'url') !~ '^https://' or char_length(x->>'url') > 2000)) then
      return false;
    end if;
  end loop;
  return true;
end $$;

create function app.insert_hire_items(p_report uuid, p_part text, p_items jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into app.hire_report_items (report_id, part, position, type, item_date, captured_on, url, backs_tail)
  select p_report, p_part, e.ord::smallint, e.x->>'type', (e.x->>'item_date')::date, nullif(e.x->>'captured_on', '')::date,
         nullif(e.x->>'url', ''), coalesce((e.x->>'backs_tail')::boolean, false)
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality e(x, ord);
$$;

-- The client-visible filing conditions (spec §2.5): what A may see to decide whether to show "Report a hire".
-- Rate limits and the second-report evidence rule are checked on submit only.
create function app.hire_report_open(p_referral uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.referrals;
begin
  select * into r from public.referrals where id = p_referral;
  return found
     and r.delivered_at is not null
     and app.hire_eligibility(r.id) = 'eligible'
     and now() <= app.add_months_et(app.referral_window_end(r), 9)
     and not exists (select 1 from app.hire_reports h where h.referral_id = r.id and app.hire_report_pending(h.status))
     and not app.objection_open(r.id)
     and not exists (select 1 from public.disputes d where d.referral_id = r.id and d.status = 'open')
     and (select count(*) from app.hire_reports h where h.referral_id = r.id and h.status = 'rejected') < 2;
end $$;

-- BR-29 silence gate: deemed only with delivered, never-bounced `hire_report.filed` emails to the job owner AND at
-- least one other active org_admin / recruiter_manager of B, the job owner still active, B not suspended.
create function app.hire_report_deemable(p_report uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  with rep as (
    select h.id, h.target_org_id, j.owner_id
      from app.hire_reports h join public.referrals r on r.id = h.referral_id join public.jobs j on j.id = r.job_id
     where h.id = p_report),
  ok as (  -- recipients with a delivered record and no failure record for this notice
    select d.recipient_user_id as u
      from app.email_deliveries d join rep on d.entity_id = rep.id
     where d.entity_type = 'hire_report' and d.notification_kind = 'hire_report.filed' and d.status = 'delivered'
       and not exists (select 1 from app.email_deliveries f where f.entity_type = 'hire_report' and f.entity_id = rep.id
                         and f.notification_kind = 'hire_report.filed' and f.recipient_user_id = d.recipient_user_id
                         and f.status in ('bounced', 'complained', 'failed')))
  select coalesce((
    select (select o.suspended_at is null from public.organizations o where o.id = rep.target_org_id)
       and exists (select 1 from public.organization_memberships m where m.organization_id = rep.target_org_id
                     and m.user_id = rep.owner_id and m.status = 'active')
       and exists (select 1 from ok where ok.u = rep.owner_id)
       and exists (select 1 from ok join public.organization_memberships m on m.user_id = ok.u
                    where m.organization_id = rep.target_org_id and m.status = 'active'
                      and m.role in ('org_admin', 'recruiter_manager') and ok.u <> rep.owner_id)
      from rep), false);
$$;
revoke execute on function app.hire_report_open(uuid), app.hire_report_deemable(uuid), app.insert_hire_items(uuid, text, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- File a hire report (BR-6, BR-17 to BR-20, BR-22, BR-23)
-- ---------------------------------------------------------------------------
create function public.file_hire_report(
  p_referral uuid, p_acting_org uuid, p_employer text, p_start_month date, p_role text, p_learned_via text,
  p_statement text, p_tail_statement boolean, p_items jsonb, p_file_ids uuid[], p_attested boolean
) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
    raise exception 'hire_report_unavailable' using errcode = 'P0001';
  end if;
  select * into r from public.referrals where id = p_referral for update;
  v_elig := app.hire_eligibility(r.id);
  if v_elig = 'recorded' then raise exception 'hire_already_recorded' using errcode = 'P0001'; end if;
  v_window := app.referral_window_end(r);
  if v_elig <> 'eligible' or not app.hire_report_open(r.id)
     or p_start_month < date_trunc('month', r.delivered_at at time zone 'America/Toronto')::date then
    raise exception 'hire_report_unavailable' using errcode = 'P0001';
  end if;
  -- BR-6: between window end + 6 and + 9 months, the tail statement and a backing item are required.
  if now() > app.add_months_et(v_window, 6)
     and (not coalesce(p_tail_statement, false)
          or not exists (select 1 from jsonb_array_elements(p_items) x where coalesce((x->>'backs_tail')::boolean, false))) then
    raise exception 'hire_report_tail_required' using errcode = '22023';
  end if;
  -- BR-17: a second report needs an item dated after the first rejection; never after two.
  select count(*), max((h.resolved_at at time zone 'America/Toronto')::date) into v_rejected, v_last_reject
    from app.hire_reports h where h.referral_id = r.id and h.status = 'rejected';
  if v_rejected >= 1 and not exists (select 1 from jsonb_array_elements(p_items) x where (x->>'item_date')::date > v_last_reject) then
    raise exception 'hire_report_unavailable' using errcode = 'P0001';
  end if;
  -- BR-20: per source org, 3 pending and 10 filed per rolling 90 days.
  if (select count(*) from app.hire_reports h where h.source_org_id = r.source_org_id and app.hire_report_pending(h.status)) >= 3
     or (select count(*) from app.hire_reports h where h.source_org_id = r.source_org_id and h.filed_at > now() - interval '90 days') >= 10 then
    raise exception 'hire_report_rate_limited' using errcode = 'P0001';
  end if;
  if coalesce(cardinality(p_file_ids), 0) > 0 and (select count(*) from app.hire_evidence_files f
       where f.id = any (p_file_ids) and f.referral_id = r.id and f.owner_kind = 'hire_report' and f.uploader_org_id = r.source_org_id
         and f.owner_id is null and f.removed_at is null and f.scan_status = 'clean') <> cardinality(p_file_ids) then
    raise exception 'hire_report_files_not_ready' using errcode = 'P0001';
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
end $$;

-- ---------------------------------------------------------------------------
-- Contest (BR-25) and rebuttal (BR-26)
-- ---------------------------------------------------------------------------
create function public.contest_hire_report(
  p_report uuid, p_acting_org uuid, p_reason text, p_statement text, p_offer_accepted_on date, p_process_started_on date,
  p_file_ids uuid[], p_attested boolean
) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
    raise exception 'hire_report_answer_closed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.disputes d where d.referral_id = h.referral_id and d.status = 'open') then
    raise exception 'dispute_already_open' using errcode = 'P0001';
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
end $$;

create function public.rebut_hire_report(p_report uuid, p_acting_org uuid, p_statement text, p_items jsonb, p_file_ids uuid[], p_attested boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
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
    raise exception 'hire_rebuttal_closed' using errcode = 'P0001';
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
end $$;

-- ---------------------------------------------------------------------------
-- Side-shaped reads of the referral's hire reports (BR-19, BR-25): B never gets links, file names, storage
-- paths or A's own file ids; A never gets B's files, nor B's statement or the resolution on "not this client".
-- ---------------------------------------------------------------------------
create function public.get_hire_reports(p_referral uuid, p_acting_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
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
        'can_confirm', v_side = 'target' and h.status in ('awaiting_answer', 'unanswered'),
        'can_contest', v_side = 'target' and h.status = 'awaiting_answer' and now() < h.answer_due_at,
        'can_rebut', v_side = 'source' and h.status = 'contested' and h.rebuttal_at is null and now() < h.rebuttal_due_at,
        'auth_check_requested_at', case when v_side = 'target' then (select q.requested_at from app.auth_check_requests q
                                      where q.dispute_kind = 'hire_report' and q.dispute_ref = h.id) end,
        'can_request_auth_check', v_side = 'target' and h.status in ('contested', 'in_review')
                                  and not exists (select 1 from app.auth_check_requests q where q.dispute_kind = 'hire_report' and q.dispute_ref = h.id)
      ) as j
      from app.hire_reports h where h.referral_id = p_referral) x), '[]'::jsonb);
end $$;

-- Files of one purpose on a filed object. Full view (own org): id, name, size, type, time, SHA-256, scan status.
-- Counterpart view: "File {n}", upload time and SHA-256 only (BR-19).
create function app.hire_files_view(p_owner uuid, p_kind text, p_full boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(case when p_full
      then jsonb_build_object('id', f.id, 'n', f.n, 'file_name', f.file_name, 'mime_type', f.mime_type, 'size_bytes', f.size_bytes,
                              'uploaded_at', f.uploaded_at, 'sha256', f.sha256, 'scan_status', f.scan_status)
      else jsonb_build_object('n', f.n, 'uploaded_at', f.uploaded_at, 'sha256', f.sha256) end order by f.n), '[]'::jsonb)
    from (select x.*, row_number() over (order by x.uploaded_at, x.id) as n
            from app.hire_evidence_files x where x.owner_id = p_owner and x.owner_kind = p_kind and x.removed_at is null) f;
$$;
revoke execute on function app.hire_files_view(uuid, text, boolean) from public, anon, authenticated;

drop function public.report_hire(uuid, integer, date, uuid, bigint, bigint, bigint, text, text, bigint, char, integer, date, text);
create function public.report_hire(p_referral uuid, p_expected_version integer, p_start_date date, p_terms_version uuid DEFAULT NULL::uuid, p_base_minor bigint DEFAULT NULL::bigint, p_bonus_minor bigint DEFAULT NULL::bigint, p_invoiced_fee_minor bigint DEFAULT NULL::bigint, p_difference_reason text DEFAULT NULL::text, p_difference_note text DEFAULT NULL::text, p_legacy_fee_minor bigint DEFAULT NULL::bigint, p_legacy_currency character DEFAULT NULL::bpchar, p_legacy_guarantee_days integer DEFAULT NULL::integer, p_offer_accepted_on date DEFAULT NULL::date, p_hired_role_title text DEFAULT NULL::text, p_report uuid DEFAULT NULL::uuid)
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
  insert into public.hire_records (referral_id, source_org_id, target_org_id, kind, placement_id, origin, prior_status,
    offer_accepted_on, start_date, hired_role_title, recorded_by)
  values (r.id, r.source_org_id, r.target_org_id,
    case when v_kind = 'deemed' then 'placement' else v_kind end, v_id, 'target_record', r.status,
    p_offer_accepted_on, p_start_date, v_title, auth.uid())
  returning id into v_hr;
  insert into app.hire_record_admin (hire_record_id, late) values (v_hr, v_late);

  -- N3 v2 (BR-22, BR-24): a pending hire report closes. Through the report's Confirm (p_report, while awaiting an
  -- answer or unanswered) it's `confirmed`; otherwise `closed_by_record`, and an open hire_report dispute closes too.
  select * into hr from app.hire_reports
   where referral_id = r.id and status in ('awaiting_answer', 'unanswered', 'contested', 'in_review') for update;
  if found then
    v_confirmed := p_report = hr.id and hr.status in ('awaiting_answer', 'unanswered');
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
revoke execute on function public.report_hire(uuid, integer, date, uuid, bigint, bigint, bigint, text, text, bigint, char, integer, date, text, uuid) from public, anon;
grant execute on function public.report_hire(uuid, integer, date, uuid, bigint, bigint, bigint, text, text, bigint, char, integer, date, text, uuid) to authenticated;

create or replace function public.complete_fee_details(p_placement uuid, p_expected_version integer, p_start_date date, p_terms_version uuid DEFAULT NULL::uuid, p_base_minor bigint DEFAULT NULL::bigint, p_bonus_minor bigint DEFAULT NULL::bigint, p_invoiced_fee_minor bigint DEFAULT NULL::bigint, p_difference_reason text DEFAULT NULL::text, p_difference_note text DEFAULT NULL::text, p_legacy_fee_minor bigint DEFAULT NULL::bigint, p_legacy_currency character DEFAULT NULL::bpchar, p_legacy_guarantee_days integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
     or p_start_date < ((coalesce(r.delivered_at, r.submitted_at) at time zone 'America/Toronto')::date - interval '1 year')::date then  -- N3 v2 PD-077
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
end $function$;

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
     and not exists (select 1 from public.placements x where x.referral_id = p_referral)
     -- N3 v2 BR-21: no pending hire report from this source org at this hiring org on the same client (either key,
     -- both sides: union rule), this referral included.
     and not exists (
       select 1 from app.hire_reports h join public.referrals me on me.id = p_referral
        where h.status in ('awaiting_answer', 'unanswered', 'contested', 'in_review')
          and h.source_org_id = me.source_org_id and h.target_org_id = me.target_org_id
          and (h.referral_id = me.id or app.referral_client_keys(h.referral_id) && app.referral_client_keys(me.id)));
$function$;

create or replace function public.get_referral_hire_state(p_referral uuid, p_acting_org uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      'job_title', r.job_title_snapshot,
      -- N3 v2: the pending hire report (for the panel / Confirm) and the hiring side's own auth-check request.
      'pending_report_id', (select hp.id from app.hire_reports hp where hp.referral_id = r.id and app.hire_report_pending(hp.status)),
      'auth_check_requested_at', (select max(q.requested_at) from app.auth_check_requests q where q.referral_id = r.id));
  else
    v_out := v_out || jsonb_build_object(
      'released_at', p.released_at,
      -- BR-6 filing limit (shown when the referral isn't in progress; drop 2 enforces it on filing).
      'window_end', v_window,
      'report_until', case when v_window is not null then app.add_months_et(v_window, 6) end,
      'report_tail_until', case when v_window is not null then app.add_months_et(v_window, 9) end,
      -- N3 v2: client-visible filing conditions (spec §2.5); the rate limits and the second-report rule are
      -- checked on submit only. `report_tail` = filing now needs the tail statement (BR-6).
      'can_report', app.hire_report_open(r.id),
      'report_tail', v_window is not null and now() > app.add_months_et(v_window, 6),
      'pending_report_id', (select hp.id from app.hire_reports hp where hp.referral_id = r.id and app.hire_report_pending(hp.status)),
      -- BR-38: the candidate record was created within 30 days before the token was issued (source side only).
      'record_created_at', (select c.created_at from public.referral_candidate_links l
                              join public.candidates c on c.id = l.candidate_id
                              join public.referral_candidate_requests q on q.referral_id = l.referral_id
                             where l.referral_id = r.id and q.token_issued_at is not null
                               and c.created_at >= q.token_issued_at - interval '30 days' and c.created_at <= q.token_issued_at),
      -- BR-37: an authorization check with an evidence request (open, or decided) for the AuthCheckPanel.
      'auth_check', (select jsonb_build_object('id', k.id, 'status', k.status, 'evidence_due_at', k.evidence_due_at,
                              'evidence_business_days_left', case when k.status = 'open' then app.business_days_left(k.evidence_due_at) end,
                              'evidence_at', k.evidence_at, 'decided_at', k.decided_at,
                              'can_send_evidence', k.status = 'open' and k.evidence_at is null and now() < k.evidence_due_at)
                       from app.authorization_checks k where k.referral_id = r.id and k.evidence_due_at is not null
                       order by k.opened_at desc limit 1));
  end if;
  return v_out;
end $function$;

create or replace function public.run_hire_maintenance() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  x record;
  v_fee integer := 0;
  v_rem integer := 0;
  v_deemed integer := 0;
  v_unanswered integer := 0;
  v_review integer := 0;
  v_pid uuid;
  v_ok boolean;
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
    perform app.notify_org(x.target_org_id, 'hire_report.reminder', 'Hire report: answer needed',
      'Reminder: the hire report from ' || coalesce(x.source_name, 'the sourcing recruiter') || ' on ' || x.candidate_label
        || ' needs an answer by ' || app.fmt_et(x.answer_due_at) || ' ET.', '/referrals/' || x.referral_id);
    update app.hire_reports set reminded_d5_at = coalesce(reminded_d5_at, now()),
           reminded_d8_at = case when x.d8 then now() else reminded_d8_at end where id = x.id;
    v_rem := v_rem + 1;
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
end $$;

revoke execute on function public.file_hire_report(uuid, uuid, text, date, text, text, text, boolean, jsonb, uuid[], boolean),
  public.contest_hire_report(uuid, uuid, text, text, date, date, uuid[], boolean),
  public.rebut_hire_report(uuid, uuid, text, jsonb, uuid[], boolean),
  public.get_hire_reports(uuid, uuid) from public, anon;
grant execute on function public.file_hire_report(uuid, uuid, text, date, text, text, text, boolean, jsonb, uuid[], boolean),
  public.contest_hire_report(uuid, uuid, text, text, date, date, uuid[], boolean),
  public.rebut_hire_report(uuid, uuid, text, jsonb, uuid[], boolean),
  public.get_hire_reports(uuid, uuid) to authenticated;
