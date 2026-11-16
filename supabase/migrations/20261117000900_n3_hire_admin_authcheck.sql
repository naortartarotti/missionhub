-- N3 drop 2 (backend.md v2): platform-admin queue, detail, fields and decision for hire reports (BR-27, BR-28),
-- the RD-029 authorization check (BR-37, BR-38) and the HA-6 flag (BR-40). Platform-admin RPCs answer not_found to
-- anyone else (no oracle). The admin never enters an amount (rule 7.5).

-- ---------------------------------------------------------------------------
-- 1. Queue (spec §2.9 sections 1, 2, 4; section 3 tasks = admin_list_hire_tasks)
-- ---------------------------------------------------------------------------
create function public.admin_list_hire_reports() returns table (
  row_kind text, id uuid, referral_id uuid, section text, status text, source_org_id uuid, source_org_name text,
  target_org_id uuid, target_org_name text, job_title text, candidate_label text, filed_at timestamptz,
  deadline timestamptz, overdue boolean, resolved_at timestamptz, finding text, source_suspended boolean, target_suspended boolean)
language plpgsql stable security definer set search_path = '' as $$
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
           h.resolved_at, h.finding, so.suspended_at is not null, tgo.suspended_at is not null
      from app.hire_reports h
      join public.referrals r on r.id = h.referral_id
      join public.organizations so on so.id = h.source_org_id
      join public.organizations tgo on tgo.id = h.target_org_id
     where app.hire_report_pending(h.status)
        or h.id in (select x.id from app.hire_reports x where not app.hire_report_pending(x.status) order by x.resolved_at desc nulls last limit 20)
    union all
    select 'auth_check'::text, k.id, k.referral_id, 'waiting', k.status, r.source_org_id, so.name, r.target_org_id, tgo.name,
           r.job_title_snapshot, r.candidate_label, k.opened_at, k.evidence_due_at, k.evidence_due_at < now(), null::timestamptz,
           null::text, so.suspended_at is not null, tgo.suspended_at is not null
      from app.authorization_checks k
      join public.referrals r on r.id = k.referral_id
      join public.organizations so on so.id = r.source_org_id
      join public.organizations tgo on tgo.id = r.target_org_id
     where k.status = 'open';
end $$;

-- HA-6 (BR-40): sourcing orgs with ≥ 2 rejected hire reports in 90 days. A flag only.
create function public.admin_hire_report_flags() returns table (organization_id uuid, organization_name text, rejected_90d integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  return query
    select h.source_org_id, o.name, count(*)::integer
      from app.hire_reports h join public.organizations o on o.id = h.source_org_id
     where h.status = 'rejected' and h.resolved_at > now() - interval '90 days'
     group by h.source_org_id, o.name having count(*) >= 2
     order by 3 desc;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Detail (BR-5, BR-28): everything, admin only
-- ---------------------------------------------------------------------------
create function public.admin_get_hire_report(p_report uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
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
end $$;

create function public.admin_set_hire_report_fields(p_report uuid, p_candidate_contacts integer, p_client_confirmation text, p_note text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  h app.hire_reports;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not app.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform app.enforce_rate_limit('admin.hire', 60, 3600);
  select * into h from app.hire_reports where id = p_report for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_candidate_contacts is null or p_candidate_contacts not between 0 and 5
     or coalesce(p_client_confirmation, '') not in ('not_requested', 'requested', 'provided', 'refused')
     or char_length(v_note) > 2000 then
    raise exception 'hire_admin_fields_invalid' using errcode = '22023';
  end if;
  update app.hire_reports set candidate_contacts = p_candidate_contacts, client_confirmation = p_client_confirmation, admin_note = v_note
   where id = h.id;
  perform app.audit(null, 'hire_report.admin_fields_saved', 'referral', h.referral_id,
    jsonb_build_object('report_id', h.id, 'candidate_contacts', p_candidate_contacts, 'client_confirmation', p_client_confirmation));
end $$;

-- ---------------------------------------------------------------------------
-- 3. Decision (BR-27): uphold → BR-9 / BR-10 placement path (fee pending) or recorded without a split; reject.
-- ---------------------------------------------------------------------------
create function public.admin_decide_hire_report(p_report uuid, p_outcome text, p_resolution text, p_finding text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  h app.hire_reports;
  r public.referrals;
  v_resolution text := btrim(coalesce(p_resolution, ''));
  v_pid uuid;
  v_src_outcome text;
begin
  if not app.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform app.enforce_rate_limit('admin.hire', 60, 3600);
  select * into h from app.hire_reports where id = p_report for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if coalesce(p_outcome, '') not in ('upheld', 'rejected') or char_length(v_resolution) not between 20 and 2000
     or (p_outcome = 'rejected' and coalesce(p_finding, '') not in ('not_hired', 'outside_window', 'different_person', 'not_this_client'))
     or (p_outcome = 'upheld' and p_finding is not null) then
    raise exception 'hire_decision_invalid' using errcode = '22023';
  end if;
  if h.status not in ('in_review', 'unanswered') then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  select * into r from public.referrals where id = h.referral_id;
  if p_outcome = 'upheld' then
    v_pid := app.establish_hire(r.id, 'upheld');  -- raises hire_not_eligible if the referral stopped counting
  end if;
  update app.hire_reports set status = p_outcome, resolved_at = now(), resolved_by = auth.uid(), resolution = v_resolution,
         finding = case when p_outcome = 'rejected' then p_finding end, placement_id = v_pid
   where id = h.id;
  if h.dispute_id is not null then
    update public.disputes set status = 'resolved', outcome = case when p_outcome = 'upheld' then 'hire_upheld' else 'hire_rejected' end,
           resolution = v_resolution, resolved_by = auth.uid(), resolved_at = now()
     where id = h.dispute_id and status = 'open';
  end if;
  -- BR-42: no resolution text in notifications; A sees only "not this client" for that finding (BR-19).
  v_src_outcome := case when p_outcome = 'upheld' then 'upheld' when p_finding = 'not_this_client' then 'not this client' else 'not upheld' end;
  perform app.notify_org(h.source_org_id, 'hire_report.decided', 'Hire report decided',
    'A platform admin decided the hire report on ' || r.candidate_label || ': ' || v_src_outcome || '.', '/referrals/' || r.id);
  perform app.notify_org(h.target_org_id, 'hire_report.decided', 'Hire report decided',
    'A platform admin decided the hire report on ' || r.candidate_label || ': ' || case when p_outcome = 'upheld' then 'upheld' else 'not upheld' end || '.',
    '/referrals/' || r.id);
  perform app.audit(null, 'hire_report.decided', 'referral', r.id, jsonb_build_object('report_id', h.id, 'outcome', p_outcome, 'finding', p_finding, 'placement_id', v_pid));
  perform app.audit(h.source_org_id, 'hire_report.decided', 'referral', r.id, jsonb_build_object('report_id', h.id, 'outcome', p_outcome));
  perform app.audit(h.target_org_id, 'hire_report.decided', 'referral', r.id, jsonb_build_object('report_id', h.id, 'outcome', p_outcome));
  return jsonb_build_object('status', p_outcome, 'placement_id', v_pid);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Authorization check (RD-029, BR-37)
-- ---------------------------------------------------------------------------
-- The hiring side asks for a check inside a contested objection or a contested / in-review hire report. Once per dispute.
create function public.request_authorization_check(p_referral uuid, p_acting_org uuid, p_reason text, p_file_ids uuid[] default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
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
  if v_ref is null then raise exception 'auth_check_not_available' using errcode = 'P0001'; end if;
  if exists (select 1 from app.auth_check_requests q where q.dispute_kind = v_kind and q.dispute_ref = v_ref) then
    raise exception 'auth_check_already_requested' using errcode = 'P0001';
  end if;
  insert into app.auth_check_requests (referral_id, dispute_kind, dispute_ref, requested_by, requested_by_org, reason)
  values (p_referral, v_kind, v_ref, auth.uid(), p_acting_org, v_reason) returning id into v_id;
  perform app.attach_hire_evidence(p_referral, 'auth_request', p_acting_org, p_file_ids, v_id, 5);
  perform app.audit(p_acting_org, 'auth_check.requested_by_hiring_side', 'referral', p_referral, jsonb_build_object('request_id', v_id));
  perform app.notify_platform_admins('auth_check.request', 'Authorization check requested',
    'The hiring side asked for an authorization check in a dispute.', '/admin/referrals/' || p_referral);
  return jsonb_build_object('request_id', v_id, 'requested_at', now());
end $$;

-- A recent-change note exists when the candidate record was created, or its email changed, within the 30 days
-- before the token was issued (BR-37, BR-38).
create function app.recent_change_note(p_referral uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select (c.created_at between q.token_issued_at - interval '30 days' and q.token_issued_at)
        or exists (select 1 from app.candidate_email_changes e where e.candidate_id = c.id
                    and e.changed_at between q.token_issued_at - interval '30 days' and q.token_issued_at)
      from public.referral_candidate_links l
      join public.candidates c on c.id = l.candidate_id
      join public.referral_candidate_requests q on q.referral_id = l.referral_id
     where l.referral_id = p_referral and q.token_issued_at is not null), false);
$$;
revoke execute on function app.recent_change_note(uuid) from public, anon, authenticated;

create function public.admin_open_authorization_check(p_referral uuid, p_requested_by text, p_challenger_evidence boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  v_note boolean;
  v_due timestamptz;
  v_id uuid;
  v_request uuid;
begin
  if not app.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform app.enforce_rate_limit('admin.hire', 60, 3600);
  select * into r from public.referrals where id = p_referral;
  if not found or r.delivered_at is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if coalesce(p_requested_by, '') not in ('submitter', 'candidate', 'hiring_side') then
    raise exception 'auth_check_invalid' using errcode = '22023';
  end if;
  if exists (select 1 from app.authorization_checks k where k.referral_id = r.id and k.status = 'open') then
    raise exception 'auth_check_already_open' using errcode = 'P0001';
  end if;
  v_note := app.recent_change_note(r.id);
  if v_note or coalesce(p_challenger_evidence, false) then v_due := app.add_business_days(now(), 5); end if;
  select q.id into v_request from app.auth_check_requests q where q.referral_id = r.id order by q.requested_at desc limit 1;
  insert into app.authorization_checks (referral_id, request_id, requested_by_kind, challenger_evidence, recent_change_note, opened_by, evidence_due_at)
  values (r.id, case when p_requested_by = 'hiring_side' then v_request end, p_requested_by, coalesce(p_challenger_evidence, false), v_note,
          auth.uid(), v_due)
  returning id into v_id;
  if v_due is not null then
    perform app.notify_org(r.source_org_id, 'auth_check.requested', 'Authorization evidence needed',
      'MissionHub needs evidence of the candidate''s authorization for ' || r.candidate_label || ' by ' || app.fmt_et(v_due) || ' ET.',
      '/referrals/' || r.id);
  end if;
  perform app.audit(null, 'auth_check.opened', 'referral', r.id, jsonb_build_object('check_id', v_id, 'evidence_requested', v_due is not null));
  perform app.audit(r.source_org_id, 'auth_check.opened', 'referral', r.id, jsonb_build_object('check_id', v_id, 'evidence_requested', v_due is not null));
  return jsonb_build_object('id', v_id, 'evidence_due_at', v_due, 'recent_change_note', v_note);
end $$;

create function public.submit_authorization_evidence(p_check uuid, p_acting_org uuid, p_statement text, p_file_ids uuid[], p_attested boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  k app.authorization_checks;
  v_statement text := btrim(coalesce(p_statement, ''));
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select * into k from app.authorization_checks where id = p_check for update;
  if not found or app.hire_side(k.referral_id, p_acting_org) is distinct from 'source' or k.evidence_due_at is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if char_length(v_statement) not between 20 and 2000 or not coalesce(p_attested, false)
     or coalesce(cardinality(p_file_ids), 0) not between 1 and 5 then
    raise exception 'auth_check_invalid' using errcode = '22023';
  end if;
  if k.status <> 'open' or k.evidence_at is not null or now() >= k.evidence_due_at then
    raise exception 'auth_check_closed' using errcode = 'P0001';
  end if;
  perform app.attach_hire_evidence(k.referral_id, 'auth_evidence', p_acting_org, p_file_ids, k.id, 5);
  update app.authorization_checks set evidence_statement = v_statement, evidence_by = auth.uid(), evidence_at = now() where id = k.id;
  perform app.audit(p_acting_org, 'auth_check.evidence_sent', 'referral', k.referral_id, jsonb_build_object('check_id', k.id));
end $$;

-- Valid: closes, nothing else changes. Invalid: the presentation is void (stops counting, loses first position, no
-- fee), the consent is disputed, the breach-review flag is set, a pending report closes as void. Never automatic.
create function public.admin_decide_authorization_check(p_check uuid, p_valid boolean, p_resolution text, p_candidate_contacted boolean default false)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  k app.authorization_checks;
  r public.referrals;
  h app.hire_reports;
  v_resolution text := btrim(coalesce(p_resolution, ''));
begin
  if not app.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform app.enforce_rate_limit('admin.hire', 60, 3600);
  select * into k from app.authorization_checks where id = p_check for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_valid is null or char_length(v_resolution) not between 20 and 2000 then raise exception 'auth_check_invalid' using errcode = '22023'; end if;
  if k.status <> 'open' then raise exception 'auth_check_closed' using errcode = 'P0001'; end if;
  select * into r from public.referrals where id = k.referral_id for update;
  update app.authorization_checks set status = case when p_valid then 'valid' else 'invalid' end, decided_by = auth.uid(), decided_at = now(),
         resolution = v_resolution, candidate_contacted = coalesce(p_candidate_contacted, false), breach_review = not p_valid
   where id = k.id;
  if not p_valid then
    update app.referral_presentations set void_reason = 'authorization_void', voided_at = now() where referral_id = r.id;
    update public.candidate_consents set disputed_at = now()
     where id = (select l.consent_id from public.referral_candidate_links l where l.referral_id = r.id) and disputed_at is null;
    select * into h from app.hire_reports where referral_id = r.id and app.hire_report_pending(status) for update;
    if found then
      update app.hire_reports set status = 'void', resolved_at = now(), resolved_by = auth.uid() where id = h.id;
      if h.dispute_id is not null then
        update public.disputes set status = 'resolved', outcome = 'hire_void', resolved_by = auth.uid(), resolved_at = now(),
               resolution = 'Closed: the candidate''s confirmation was found invalid.'
         where id = h.dispute_id and status = 'open';
      end if;
    end if;
  end if;
  perform app.notify_org(r.source_org_id, 'auth_check.decided', 'Authorization check closed',
    'The authorization check on ' || r.candidate_label || ' is closed: '
      || case when p_valid then 'valid' else 'invalid; this referral no longer counts' end || '.', '/referrals/' || r.id);
  perform app.audit(null, 'auth_check.decided', 'referral', r.id, jsonb_build_object('check_id', k.id, 'valid', p_valid));
  perform app.audit(r.source_org_id, 'auth_check.decided', 'referral', r.id, jsonb_build_object('check_id', k.id, 'valid', p_valid));
end $$;

-- Admin view of the referral's checks (the /admin/referrals/[id] sub-panel).
create function public.admin_get_authorization_checks(p_referral uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'recent_change_note', app.recent_change_note(p_referral),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'dispute_kind', q.dispute_kind, 'reason', q.reason,
                            'requested_at', q.requested_at, 'files', app.hire_files_view(q.id, 'auth_request', true)) order by q.requested_at)
                          from app.auth_check_requests q where q.referral_id = p_referral), '[]'::jsonb),
    'checks', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'status', k.status, 'requested_by_kind', k.requested_by_kind,
                          'challenger_evidence', k.challenger_evidence, 'recent_change_note', k.recent_change_note, 'opened_at', k.opened_at,
                          'evidence_due_at', k.evidence_due_at, 'evidence_statement', k.evidence_statement, 'evidence_at', k.evidence_at,
                          'no_evidence_by_deadline', k.status = 'open' and k.evidence_due_at < now() and k.evidence_at is null,
                          'files', app.hire_files_view(k.id, 'auth_evidence', true), 'decided_at', k.decided_at,
                          'resolution', k.resolution, 'candidate_contacted', k.candidate_contacted) order by k.opened_at)
                        from app.authorization_checks k where k.referral_id = p_referral), '[]'::jsonb));
end $$;

revoke execute on function public.admin_list_hire_reports(), public.admin_hire_report_flags(), public.admin_get_hire_report(uuid),
  public.admin_set_hire_report_fields(uuid, integer, text, text), public.admin_decide_hire_report(uuid, text, text, text),
  public.request_authorization_check(uuid, uuid, text, uuid[]), public.admin_open_authorization_check(uuid, text, boolean),
  public.submit_authorization_evidence(uuid, uuid, text, uuid[], boolean), public.admin_decide_authorization_check(uuid, boolean, text, boolean),
  public.admin_get_authorization_checks(uuid) from public, anon;
grant execute on function public.admin_list_hire_reports(), public.admin_hire_report_flags(), public.admin_get_hire_report(uuid),
  public.admin_set_hire_report_fields(uuid, integer, text, text), public.admin_decide_hire_report(uuid, text, text, text),
  public.request_authorization_check(uuid, uuid, text, uuid[]), public.admin_open_authorization_check(uuid, text, boolean),
  public.submit_authorization_evidence(uuid, uuid, text, uuid[], boolean), public.admin_decide_authorization_check(uuid, boolean, text, boolean),
  public.admin_get_authorization_checks(uuid) to authenticated;
