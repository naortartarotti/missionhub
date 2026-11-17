-- N10 part 7 of 8: the sanction ladder (BR-26 to BR-32, BR-23 incident notice, EC-5).
--
-- Enforced here, against direct calls:
--   - prior notice (BR-27): a decision needs a notice of the case whose response arrived or whose
--     window closed (sanction_notice_required); the only exception is the immediate hold (BR-28);
--   - immediate hold: closed ground enum 2.3 / 4.8 checked before any write
--     (immediate_hold_ground_invalid); hold + notice in one transaction; refused on an org already
--     held, suspended or terminated (org_already_restricted, N10-D16);
--   - decision rules ⊂ the notice's rules, from that notice's version (decision_rules_not_in_notice);
--   - suspension / termination need "why not a hold" (sanction_reason_required) and a notice that
--     carries the possible-outcomes line;
--   - "no sanction" only with no non-overturned sanction or finding in 12 months (no_sanction_not_allowed);
--   - review: once per decision, before the stored deadline, by a platform admin who is neither the
--     decider nor the immediate-hold applier (review_not_allowed), never increasing (review_cannot_increase);
--   - termination lift: never by the admin who decided it (lift_not_allowed), reason required.
-- set_organization_suspension is dropped (BR-29, N10-D15): suspension and termination exist only
-- through this ladder.

drop function if exists public.set_organization_suspension(uuid, boolean, text);

create or replace function app.sanction_rank(p_level text) returns integer
language sql immutable set search_path = '' as $$
  select case p_level when 'warning' then 1 when 'network_hold' then 2 when 'suspension' then 3
                      when 'termination' then 4 else 0 end;
$$;
revoke execute on function app.sanction_rank(text) from public, anon, authenticated;

-- A lifted termination (error correction, N10-D29) no longer counts in 12-month contexts; neither does
-- an overturned entry. Replaces part 6's definition.
create or replace function app.no_sanction_allowed(p_org uuid, p_exclude_case uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from app.conduct_decisions d
                      where d.organization_id = p_org and d.case_id is distinct from p_exclude_case
                        and d.outcome = 'breach' and d.overturned_at is null
                        and d.decided_at > now() - interval '12 months'
                        and not exists (select 1 from app.org_sanctions s where s.decision_id = d.id
                                         and s.level = 'termination' and s.end_reason = 'lifted'))
     and not exists (select 1 from app.org_sanctions s
                      where s.organization_id = p_org and s.case_id is distinct from p_exclude_case
                        and s.applied_at > now() - interval '12 months'
                        and s.end_reason is distinct from 'overturned'
                        and not (s.level = 'termination' and s.end_reason = 'lifted'));
$$;

-- Recomputes organizations.suspended_at / terminated_at after a suspension or termination sanction
-- started or ended. Returns the settlement transition: 'entered', 'exited' or null.
create or replace function app.sync_org_sanction_effects(p_org uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  o public.organizations;
  v_term boolean;
  v_susp boolean;
begin
  select * into o from public.organizations where id = p_org for update;
  select exists (select 1 from app.org_sanctions s where s.organization_id = p_org and s.level = 'termination' and s.ended_at is null),
         exists (select 1 from app.org_sanctions s where s.organization_id = p_org and s.level = 'suspension' and s.ended_at is null)
    into v_term, v_susp;
  if v_term then
    update public.organizations set terminated_at = coalesce(terminated_at, now()), suspended_at = coalesce(suspended_at, now())
     where id = p_org;
  elsif v_susp then
    update public.organizations set terminated_at = null, suspended_at = coalesce(suspended_at, now()) where id = p_org;
  else
    update public.organizations set terminated_at = null, suspended_at = null, suspended_reason = null where id = p_org;
  end if;
  if o.suspended_at is null and (v_term or v_susp) then return 'entered'; end if;
  if o.suspended_at is not null and not (v_term or v_susp) then return 'exited'; end if;
  return null;
end $$;
revoke execute on function app.sync_org_sanction_effects(uuid) from public, anon, authenticated;

create or replace function app.apply_sanction(
  p_org uuid, p_case uuid, p_decision uuid, p_notice uuid, p_level text, p_ground text, p_why text, p_review_on date, p_supersedes uuid
) returns app.org_sanctions
language plpgsql security definer set search_path = '' as $$
declare
  s app.org_sanctions;
begin
  insert into app.org_sanctions (organization_id, case_id, decision_id, notice_id, level, immediate_ground, why_not_hold,
                                 planned_review_on, applied_by, expires_at, supersedes_id)
  values (p_org, p_case, p_decision, p_notice, p_level, p_ground, p_why, case when p_level = 'network_hold' then p_review_on end,
          auth.uid(), case when p_level = 'warning' then now() + interval '12 months' end, p_supersedes)
  returning * into s;
  perform app.audit(p_org, 'sanction.applied', 'conduct_case', p_case, jsonb_build_object('sanction_id', s.id, 'level', p_level));
  return s;
end $$;
revoke execute on function app.apply_sanction(uuid, uuid, uuid, uuid, text, text, text, date, uuid) from public, anon, authenticated;

-- Shared tail after effects changed: settlement audit, matching re-queue when the org can work again.
create or replace function app.after_sanction_change(p_org uuid, p_transition text, p_was_restricted boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_transition = 'entered' then
    perform app.audit(p_org, 'settlement_mode.entered', 'organization', p_org, '{}');
  elsif p_transition = 'exited' then
    perform app.audit(p_org, 'settlement_mode.exited', 'organization', p_org, '{}');
  end if;
  if p_was_restricted and coalesce(app.org_partner_restriction(p_org), 'rules_not_accepted') = 'rules_not_accepted' then
    perform app.requeue_org_matching(p_org);
  end if;
end $$;
revoke execute on function app.after_sanction_change(uuid, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Decision (BR-23, BR-27, BR-28 after the window, BR-30)
-- ---------------------------------------------------------------------------
create or replace function public.admin_decide_conduct_case(
  p_case uuid, p_notice uuid, p_outcome text, p_finding text, p_rules_cited text[], p_residual boolean,
  p_level text, p_why_not_hold text default null, p_planned_review_on date default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c app.conduct_cases := app.admin_case_for_update(p_case);
  n app.conduct_notices;
  d app.conduct_decisions;
  v_hold app.org_sanctions;
  v_rules text[] := array(select distinct btrim(x) from unnest(coalesce(p_rules_cited, '{}')) x where btrim(x) <> '');
  v_was boolean;
  v_tr text;
begin
  perform 1 from public.organizations where id = c.reported_org_id for update;
  if c.status in ('decided', 'closed') then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  select * into n from app.conduct_notices where id = p_notice and case_id = c.id;
  if not found or not app.notice_window_closed(n.id) then
    raise exception 'sanction_notice_required' using errcode = 'P0001';
  end if;
  if p_outcome is null or p_outcome not in ('no_breach', 'insufficient_evidence', 'breach') then
    raise exception 'conduct_outcome_invalid' using errcode = '22023';
  end if;
  if p_level is not null and p_level not in ('warning', 'network_hold', 'suspension', 'termination') then
    raise exception 'conduct_level_invalid' using errcode = '22023';
  end if;
  select * into v_hold from app.org_sanctions s
   where s.case_id = c.id and s.immediate_ground is not null and s.ended_at is null order by s.applied_at desc limit 1;

  if p_outcome = 'breach' then
    if char_length(btrim(coalesce(p_finding, ''))) not between 50 and 8000 then
      raise exception 'conduct_text_invalid' using errcode = '22023';
    end if;
    if cardinality(v_rules) = 0 or not (v_rules <@ n.rules_cited) then
      raise exception 'decision_rules_not_in_notice' using errcode = 'P0001';
    end if;
    if p_level in ('suspension', 'termination') then
      if char_length(btrim(coalesce(p_why_not_hold, ''))) not between 20 and 2000 then
        raise exception 'sanction_reason_required' using errcode = '22023';
      end if;
      -- RD-049 / AC-83: escalating to the top of the ladder needs the possible-outcomes line.
      if not n.has_outcomes_line then raise exception 'sanction_notice_required' using errcode = 'P0001'; end if;
    end if;
    if p_level is null and not app.no_sanction_allowed(c.reported_org_id, c.id) then
      raise exception 'no_sanction_not_allowed' using errcode = 'P0001';
    end if;
  elsif p_level is not null then
    raise exception 'conduct_level_invalid' using errcode = '22023';
  end if;

  v_was := app.org_partner_restriction(c.reported_org_id) is not null;
  insert into app.conduct_decisions (case_id, notice_id, organization_id, outcome, finding, rules_cited, residual_test, level,
                                     why_not_hold, planned_review_on, decided_by, review_request_due_at)
  values (c.id, n.id, c.reported_org_id, p_outcome,
          case when p_outcome = 'breach' then btrim(p_finding) end,
          case when p_outcome = 'breach' then v_rules else '{}' end,
          p_outcome = 'breach' and coalesce(p_residual, false), p_level,
          case when p_level in ('suspension', 'termination') then btrim(p_why_not_hold) end,
          case when p_level = 'network_hold' then p_planned_review_on end, auth.uid(),
          case when p_outcome = 'breach' then app.add_business_days(now(), 10) end)
  returning * into d;

  if v_hold.id is not null then
    if p_outcome <> 'breach' or p_level is null then
      update app.org_sanctions set ended_at = now(), end_reason = 'lifted', ended_by = auth.uid(), end_note = 'decision'
       where id = v_hold.id;
    elsif p_level = 'network_hold' then
      update app.org_sanctions set decision_id = d.id, planned_review_on = p_planned_review_on where id = v_hold.id;
    else
      update app.org_sanctions set ended_at = now(), end_reason = 'superseded', ended_by = auth.uid() where id = v_hold.id;
      perform app.apply_sanction(c.reported_org_id, c.id, d.id, n.id, p_level, null, d.why_not_hold, p_planned_review_on, v_hold.id);
    end if;
  elsif p_outcome = 'breach' and p_level is not null then
    perform app.apply_sanction(c.reported_org_id, c.id, d.id, n.id, p_level, null, d.why_not_hold, p_planned_review_on, null);
  end if;

  update app.conduct_cases set status = 'decided' where id = c.id;
  v_tr := app.sync_org_sanction_effects(c.reported_org_id);
  perform app.audit(c.reported_org_id, 'conduct.decided', 'conduct_case', c.id,
    jsonb_build_object('decision_id', d.id, 'outcome', p_outcome, 'level', p_level));
  perform app.after_sanction_change(c.reported_org_id, v_tr, v_was);
  perform app.notify_org_admins(c.reported_org_id, 'conduct.decided', 'Workatent recorded a decision',
    'Read it on your Network standing page.', '/settings/standing/' || c.id);
  perform app.notify_conduct_reporter(c.id, 'conduct_report.closed', 'Your report is closed',
    'A report from your organization is closed', 'Open it to see the outcome.');
  return d.id;
end $$;

-- ---------------------------------------------------------------------------
-- Immediate hold (BR-28, rule 9.4)
-- ---------------------------------------------------------------------------
create or replace function public.admin_apply_immediate_hold(
  p_case uuid, p_ground text, p_language text, p_conduct_date date, p_rules_version uuid, p_rules_cited text[],
  p_allegation text, p_alleged_when text, p_evidence_summary text, p_name_reporter boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c app.conduct_cases;
  n app.conduct_notices;
  s app.org_sanctions;
  v_restr text;
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  -- The closed list, before any write (EC-5).
  if p_ground is null or p_ground not in ('2.3', '4.8') then
    raise exception 'immediate_hold_ground_invalid' using errcode = '22023';
  end if;
  c := app.admin_case_for_update(p_case);
  perform 1 from public.organizations where id = c.reported_org_id for update;
  perform app.require_admin_category(c);
  if c.status not in ('new', 'info_requested', 'notice_sent') then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  v_restr := app.org_partner_restriction(c.reported_org_id);
  if v_restr in ('terminated', 'suspended', 'network_hold') then
    raise exception 'org_already_restricted' using errcode = 'P0001';
  end if;
  n := app.create_conduct_notice(c, 'immediate_hold', p_ground, p_language, p_conduct_date, p_rules_version,
                                 array_append(coalesce(p_rules_cited, '{}'), p_ground),
                                 p_allegation, p_alleged_when, p_evidence_summary, p_name_reporter);
  insert into app.org_sanctions (organization_id, case_id, notice_id, level, immediate_ground, applied_by)
  values (c.reported_org_id, c.id, n.id, 'network_hold', p_ground, auth.uid())
  returning * into s;
  perform app.audit(c.reported_org_id, 'sanction.immediate_hold', 'conduct_case', c.id,
    jsonb_build_object('notice_id', n.id, 'sanction_id', s.id, 'ground', p_ground));
  perform app.notify_org_admins(c.reported_org_id, 'sanction.immediate_hold', 'You have an urgent notice from Workatent',
    'Read it now. You can respond until ' || app.fmt_et(n.response_due_at) || ' ET.', '/settings/standing/' || c.id);
  return jsonb_build_object('notice_id', n.id, 'sanction_id', s.id, 'response_due_at', n.response_due_at);
end $$;

-- ---------------------------------------------------------------------------
-- Lifting (BR-26, BR-29, N10-D29, N10-D30). p_sanction null = a legacy (pre-N10) suspension.
-- ---------------------------------------------------------------------------
create or replace function public.admin_lift_sanction(p_org uuid, p_sanction uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.organizations;
  s app.org_sanctions;
  v_decider uuid;
  v_was boolean;
  v_tr text;
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 5 and 2000 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  select * into o from public.organizations where id = p_org for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_was := app.org_partner_restriction(p_org) is not null;

  if p_sanction is null then
    if o.suspended_at is null or exists (select 1 from app.org_sanctions x where x.organization_id = p_org
                                          and x.level in ('suspension', 'termination') and x.ended_at is null) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    update public.organizations set suspended_at = null, terminated_at = null, suspended_reason = null where id = p_org;
    v_tr := 'exited';
  else
    select * into s from app.org_sanctions where id = p_sanction and organization_id = p_org and ended_at is null for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if s.level = 'warning' then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
    if s.level = 'termination' then
      select d.decided_by into v_decider from app.conduct_decisions d where d.id = s.decision_id;
      if auth.uid() = coalesce(v_decider, s.applied_by) then raise exception 'lift_not_allowed' using errcode = 'P0001'; end if;
    end if;
    update app.org_sanctions set ended_at = now(), end_reason = 'lifted', ended_by = auth.uid(), end_note = left(btrim(p_reason), 2000)
     where id = s.id;
    v_tr := app.sync_org_sanction_effects(p_org);
  end if;

  -- The org's audit and notification carry no reason and no admin name; the reason is admin-only.
  perform app.audit(p_org, 'sanction.lifted', 'organization', p_org,
    jsonb_build_object('sanction_id', s.id, 'level', coalesce(s.level, 'suspension'), 'legacy', p_sanction is null));
  perform app.audit(null, 'sanction.lifted', 'organization', p_org,
    jsonb_build_object('sanction_id', s.id, 'reason', left(btrim(p_reason), 2000), 'legacy', p_sanction is null));
  perform app.after_sanction_change(p_org, v_tr, v_was);
  perform app.notify_org_admins(p_org, 'sanction.lifted', 'A sanction on your organization was lifted',
    'See the details on your Network standing page.', '/settings/standing');
end $$;

-- ---------------------------------------------------------------------------
-- Review (BR-31, rule 9.6)
-- ---------------------------------------------------------------------------
create or replace function public.request_sanction_review(p_org uuid, p_case uuid, p_text text, p_file_ids uuid[] default '{}')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c app.conduct_cases := app.reported_org_case(p_org, p_case, true);
  d app.conduct_decisions;
  v_id uuid;
begin
  select * into d from app.conduct_decisions where case_id = c.id;
  if not found or d.outcome <> 'breach' or d.review_request_due_at is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from app.sanction_reviews rv where rv.decision_id = d.id) then
    raise exception 'review_already_requested' using errcode = 'P0001';
  end if;
  if now() >= d.review_request_due_at then
    raise exception 'review_window_closed' using errcode = 'P0001', detail = app.iso_utc(d.review_request_due_at);
  end if;
  if char_length(btrim(coalesce(p_text, ''))) not between 20 and 8000 then
    raise exception 'conduct_text_invalid' using errcode = '22023';
  end if;
  insert into app.sanction_reviews (decision_id, organization_id, requested_by, request_text)
  values (d.id, p_org, auth.uid(), btrim(p_text)) returning id into v_id;
  perform app.attach_conduct_files(p_file_ids, c.id, 'review_request', v_id, p_org);
  perform app.audit(p_org, 'sanction.review_requested', 'conduct_case', c.id, jsonb_build_object('review_id', v_id));
  perform app.notify_platform_admins('sanction.review_requested', 'Review requested on a conduct case',
    'Another platform admin must review the decision.', '/admin/disputes/conduct/' || c.id);
  return v_id;
end $$;

create or replace function public.admin_decide_sanction_review(p_review uuid, p_outcome text, p_new_level text, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  rv app.sanction_reviews;
  d app.conduct_decisions;
  c app.conduct_cases;
  cur app.org_sanctions;
  v_cur_level text;
  v_was boolean;
  v_tr text;
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into rv from app.sanction_reviews where id = p_review for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into d from app.conduct_decisions where id = rv.decision_id for update;
  c := app.admin_case_for_update(d.case_id);
  perform 1 from public.organizations where id = d.organization_id for update;
  -- EC-5: never the decider, never the admin who applied the immediate hold on the case.
  if auth.uid() = d.decided_by or auth.uid() = any (app.case_hold_appliers(c.id)) then
    raise exception 'review_not_allowed' using errcode = '42501';
  end if;
  if rv.decided_at is not null then raise exception 'already_reviewed' using errcode = 'P0001'; end if;
  if p_outcome is null or p_outcome not in ('confirm', 'reduce', 'overturn') then
    raise exception 'conduct_outcome_invalid' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 50 and 8000 then
    raise exception 'conduct_text_invalid' using errcode = '22023';
  end if;

  select * into cur from app.org_sanctions s where s.decision_id = d.id and s.ended_at is null order by s.applied_at desc limit 1;
  v_cur_level := coalesce(cur.level, case when cur.id is null then null else d.level end);
  v_was := app.org_partner_restriction(d.organization_id) is not null;

  if p_outcome = 'reduce' then
    if p_new_level is null or p_new_level not in ('warning', 'network_hold', 'suspension', 'none')
       or app.sanction_rank(p_new_level) >= app.sanction_rank(v_cur_level) then
      raise exception 'review_cannot_increase' using errcode = 'P0001';
    end if;
    update app.org_sanctions set ended_at = now(), end_reason = 'reduced', ended_by = auth.uid() where id = cur.id;
    if p_new_level <> 'none' then
      perform app.apply_sanction(d.organization_id, c.id, d.id, d.notice_id, p_new_level, null, null, null, cur.id);
    end if;
  elsif p_outcome = 'overturn' then
    update app.org_sanctions set ended_at = now(), end_reason = 'overturned', ended_by = auth.uid()
     where case_id = c.id and ended_at is null;
    update app.conduct_decisions set overturned_at = now() where id = d.id;
  elsif p_new_level is not null then
    raise exception 'review_cannot_increase' using errcode = 'P0001';
  end if;

  update app.sanction_reviews
     set reviewer_id = auth.uid(), outcome = p_outcome, new_level = case when p_outcome = 'reduce' then p_new_level end,
         reason = btrim(p_reason), decided_at = now()
   where id = rv.id;
  v_tr := app.sync_org_sanction_effects(d.organization_id);
  perform app.audit(d.organization_id, 'sanction.reviewed', 'conduct_case', c.id,
    jsonb_build_object('review_id', rv.id, 'outcome', p_outcome, 'new_level', case when p_outcome = 'reduce' then p_new_level end));
  perform app.after_sanction_change(d.organization_id, v_tr, v_was);
  perform app.notify_org_admins(d.organization_id, 'sanction.reviewed', 'Your review request was decided',
    'See the outcome on your Network standing page.', '/settings/standing/' || c.id);
  -- RD-045: only a change of the reporter's outcome category reaches the reporter (overturn).
  if p_outcome = 'overturn' then
    perform app.notify_conduct_reporter(c.id, 'conduct_report.outcome_updated', 'The outcome of your report changed',
      'The outcome of a report from your organization changed', 'Open it to see the outcome.');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2.3 data-incident notice (RD-045, BR-23)
-- ---------------------------------------------------------------------------
create or replace function public.admin_conduct_incident_options(p_case uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c app.conduct_cases;
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from app.conduct_cases where id = p_case;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'referral_id', r.id, 'job_title', r.job_title_snapshot, 'candidate_label', r.candidate_label, 'status', r.status,
      'created_at', r.created_at, 'linked', r.id = c.referral_id,
      'counterpart_org', jsonb_build_object('id', o.id, 'name', o.name),
      'counterpart_side', case when r.source_org_id = c.reported_org_id then 'target' else 'source' end)
      order by (r.id = c.referral_id) desc, r.created_at desc)
    from (select * from public.referrals x
           where (x.source_org_id = c.reported_org_id or x.target_org_id = c.reported_org_id) and not x.internal
           order by (x.id = c.referral_id) desc, x.created_at desc limit 200) r
    join public.organizations o on o.id = case when r.source_org_id = c.reported_org_id then r.target_org_id else r.source_org_id end
  ), '[]');
end $$;

create or replace function public.admin_send_incident_notice(
  p_case uuid, p_recipient_orgs uuid[], p_referrals uuid[], p_information text, p_when text, p_to_whom text, p_language text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c app.conduct_cases := app.admin_case_for_update(p_case);
  d app.conduct_decisions;
  v_refs uuid[] := array(select distinct x from unnest(coalesce(p_referrals, '{}')) x);
  v_orgs uuid[] := array(select distinct x from unnest(coalesce(p_recipient_orgs, '{}')) x);
  v_id uuid;
  v_org uuid;
  v_sides text[];
  v_guidance jsonb;
begin
  select * into d from app.conduct_decisions where case_id = c.id;
  if not found or d.outcome <> 'breach' or d.overturned_at is not null or not ('2.3' = any (d.rules_cited)) then
    raise exception 'incident_not_allowed' using errcode = 'P0001';
  end if;
  if p_language is null or p_language not in ('en', 'fr-CA', 'pt-BR') then raise exception 'invalid_language' using errcode = '22023'; end if;
  if cardinality(v_refs) = 0 or cardinality(v_refs) > 50 or cardinality(v_orgs) = 0 then
    raise exception 'incident_recipient_invalid' using errcode = '22023';
  end if;
  if (select count(*) from public.referrals r where r.id = any (v_refs) and not r.internal
        and c.reported_org_id in (r.source_org_id, r.target_org_id)) <> cardinality(v_refs) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if char_length(btrim(coalesce(p_information, ''))) not between 20 and 2000
     or char_length(btrim(coalesce(p_when, ''))) not between 3 and 200
     or char_length(coalesce(p_to_whom, '')) > 500 then
    raise exception 'conduct_text_invalid' using errcode = '22023';
  end if;
  insert into app.conduct_incident_notices (case_id, decision_id, language, referral_ids, information, occurred, to_whom, sent_by)
  values (c.id, d.id, p_language, v_refs, btrim(p_information), btrim(p_when), nullif(btrim(coalesce(p_to_whom, '')), ''), auth.uid())
  returning id into v_id;
  foreach v_org in array v_orgs loop
    if v_org = c.reported_org_id then raise exception 'incident_recipient_invalid' using errcode = '22023'; end if;
    select array_remove(array[
             case when exists (select 1 from public.referrals r where r.id = any (v_refs) and r.source_org_id = v_org) then 'source' end,
             case when exists (select 1 from public.referrals r where r.id = any (v_refs) and r.target_org_id = v_org) then 'target' end],
           null) into v_sides;
    if cardinality(v_sides) = 0 then raise exception 'incident_recipient_invalid' using errcode = '22023'; end if;
    select jsonb_agg(jsonb_build_object('variant', x.v, 'text', app.incident_guidance_line(x.v, p_language)) order by x.o)
      into v_guidance
      from (values ('sourcing', 1), ('hiring', 2)) as x(v, o)
     where (x.v = 'sourcing' and 'source' = any (v_sides)) or (x.v = 'hiring' and 'target' = any (v_sides));
    insert into app.conduct_incident_recipients (notice_id, organization_id, sides, guidance) values (v_id, v_org, v_sides, v_guidance);
    -- No sanction, outcome or reporter in the recipient's audit or notification.
    perform app.audit(v_org, 'conduct.incident_notice_sent', 'incident_notice', v_id, jsonb_build_object('notice_id', v_id,
      'referral_ids', (select jsonb_agg(r.id) from public.referrals r where r.id = any (v_refs) and v_org in (r.source_org_id, r.target_org_id))));
    perform app.notify_org_admins(v_org, 'conduct.incident_notice', 'Workatent sent you a data incident notice',
      'It concerns information from your referrals. Open it to read the details.', '/settings/standing/incidents/' || v_id);
  end loop;
  perform app.audit(null, 'conduct.incident_notice_sent', 'conduct_case', c.id, jsonb_build_object('notice_id', v_id, 'recipients', to_jsonb(v_orgs)));
  return v_id;
end $$;

-- S25: the recipient org's admins only (N10-D26). Never the sanction, the outcome or the reporter.
create or replace function public.get_incident_notice(p_org uuid, p_notice uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  i app.conduct_incident_notices;
  x app.conduct_incident_recipients;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if not app.has_role_or_settling(p_org, array['org_admin']::public.membership_role[]) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into x from app.conduct_incident_recipients where notice_id = p_notice and organization_id = p_org;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into i from app.conduct_incident_notices where id = p_notice;
  return jsonb_build_object(
    'id', i.id, 'sent_at', i.sent_at, 'language', i.language, 'information', i.information, 'occurred', i.occurred,
    'to_whom', i.to_whom, 'sides', to_jsonb(x.sides), 'guidance', x.guidance,
    'referrals', coalesce((select jsonb_agg(jsonb_build_object(
        'id', case when app.can_see_referral(r.id) then r.id end,
        'job_title', case when app.can_see_referral(r.id) then r.job_title_snapshot end,
        'candidate_label', case when app.can_see_referral(r.id) then r.candidate_label end) order by r.created_at)
        from public.referrals r where r.id = any (i.referral_ids) and p_org in (r.source_org_id, r.target_org_id)), '[]'));
end $$;

-- ---------------------------------------------------------------------------
-- Network standing (BR-32): the org's admins (active or settling) and, via the admin file, platform admins.
-- ---------------------------------------------------------------------------
create or replace function app.org_standing(p_org uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object('level', s.level, 'since', s.applied_at, 'planned_review_on', s.planned_review_on,
                              'expires_at', s.expires_at, 'sanction_id', s.id, 'legacy', false)
      from app.org_sanctions s
     where s.organization_id = p_org and app.sanction_active(s)
     order by app.sanction_rank(s.level) desc, s.applied_at desc limit 1),
    (select jsonb_build_object('level', case when o.terminated_at is not null then 'termination' else 'suspension' end,
                               'since', coalesce(o.terminated_at, o.suspended_at), 'legacy', true)
       from public.organizations o where o.id = p_org and o.suspended_at is not null),
    jsonb_build_object('level', null));
$$;
revoke execute on function app.org_standing(uuid) from public, anon, authenticated;

create or replace function app.members_not_accepted(p_org uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', p.full_name,
           'accepted_current', app.user_accepted_required(m.user_id),
           'accepted_upcoming', u.id is null or exists (select 1 from public.network_rules_member_acceptances a
                                                        where a.user_id = m.user_id and a.version_id = u.id))
           order by p.full_name), '[]')
    from public.organization_memberships m join public.profiles p on p.id = m.user_id
    left join lateral (select app.rules_upcoming_version() as id) u on true
   where m.organization_id = p_org and m.status = 'active'
     and (not app.user_accepted_required(m.user_id)
          or (u.id is not null and not exists (select 1 from public.network_rules_member_acceptances a
                                                where a.user_id = m.user_id and a.version_id = u.id)));
$$;
revoke execute on function app.members_not_accepted(uuid) from public, anon, authenticated;

create or replace function public.get_network_standing(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_restr text;
  v_req public.network_rules_versions;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if not app.has_role_or_settling(p_org, array['org_admin']::public.membership_role[]) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_restr := app.org_partner_restriction(p_org);
  v_req := app.rules_required_version();
  return jsonb_build_object(
    'standing', app.org_standing(p_org),
    'restriction', v_restr,
    'rules_not_accepted', case when v_restr = 'rules_not_accepted' then
                            jsonb_build_object('version_id', v_req.id, 'label', v_req.label, 'effective_at', v_req.effective_at) end,
    'open_notices', coalesce((select jsonb_agg(jsonb_build_object(
        'case_id', c.id, 'notice_id', n.id, 'kind', n.kind, 'rules_cited', to_jsonb(n.rules_cited), 'sent_at', n.sent_at,
        'response_due_at', n.response_due_at, 'business_days_left', app.business_days_left(n.response_due_at, now()),
        'responded', exists (select 1 from app.conduct_responses r where r.notice_id = n.id),
        'open_followups', (select count(*) from app.conduct_followups fu where fu.notice_id = n.id and fu.replied_at is null
                             and (fu.due_at is null or now() <= fu.due_at)))
        order by n.response_due_at)
      from app.conduct_cases c
      join lateral (select * from app.conduct_notices x where x.case_id = c.id order by x.sent_at desc limit 1) n on true
     where c.reported_org_id = p_org and c.status = 'notice_sent'), '[]'),
    'history', jsonb_build_object(
      'sanctions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'case_id', s.case_id, 'level', s.level,
                     'applied_at', s.applied_at, 'expires_at', s.expires_at, 'status', app.sanction_status(s),
                     'ended_at', s.ended_at, 'planned_review_on', s.planned_review_on, 'immediate', s.immediate_ground is not null)
                     order by s.applied_at desc) from app.org_sanctions s where s.organization_id = p_org), '[]'),
      'cases', coalesce((select jsonb_agg(jsonb_build_object('case_id', d.case_id, 'outcome', d.outcome, 'level', d.level,
                     'decided_at', d.decided_at, 'overturned_at', d.overturned_at,
                     'review_status', (select coalesce(rv.outcome, 'requested') from app.sanction_reviews rv where rv.decision_id = d.id),
                     'can_request_review', d.outcome = 'breach' and now() < d.review_request_due_at
                        and not exists (select 1 from app.sanction_reviews rv where rv.decision_id = d.id),
                     'review_request_due_at', d.review_request_due_at)
                     order by d.decided_at desc) from app.conduct_decisions d where d.organization_id = p_org), '[]')),
    'acceptances', coalesce((select jsonb_agg(jsonb_build_object('version_id', v.id, 'label', v.label, 'accepted_at', a.accepted_at,
                     'accepted_by_name', (select p.full_name from public.profiles p where p.id = a.accepted_by), 'locale', a.locale)
                     order by v.effective_at desc)
                     from public.network_rules_org_acceptances a join public.network_rules_versions v on v.id = a.version_id
                    where a.organization_id = p_org), '[]'),
    'members_not_accepted', app.members_not_accepted(p_org),
    'incident_notices', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'sent_at', i.sent_at,
                     'referral_count', (select count(*) from public.referrals r where r.id = any (i.referral_ids)
                                          and p_org in (r.source_org_id, r.target_org_id)))
                     order by i.sent_at desc)
                     from app.conduct_incident_recipients x join app.conduct_incident_notices i on i.id = x.notice_id
                    where x.organization_id = p_org), '[]'));
end $$;

-- S19: the admin org page's standing, sanctions file, open cases, acceptances and remaining obligations.
create or replace function public.admin_org_conduct_file(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  o public.organizations;
  v_term app.org_sanctions;
  v_decider uuid;
  v_req public.network_rules_versions;
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into o from public.organizations where id = p_org;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into v_term from app.org_sanctions s where s.organization_id = p_org and s.level = 'termination' and s.ended_at is null
   order by s.applied_at desc limit 1;
  select d.decided_by into v_decider from app.conduct_decisions d where d.id = v_term.decision_id;
  v_req := app.rules_required_version();
  return jsonb_build_object(
    'standing', app.org_standing(p_org),
    'restriction', app.org_partner_restriction(p_org),
    'settlement_state', app.org_settlement_state(p_org),
    'suspended_at', o.suspended_at, 'terminated_at', o.terminated_at,
    'legacy_suspended', o.suspended_at is not null and not exists (
        select 1 from app.org_sanctions s where s.organization_id = p_org and s.level in ('suspension', 'termination') and s.ended_at is null),
    'active', jsonb_build_object(
      'hold_id', (select s.id from app.org_sanctions s where s.organization_id = p_org and s.level = 'network_hold' and s.ended_at is null limit 1),
      'suspension_id', (select s.id from app.org_sanctions s where s.organization_id = p_org and s.level = 'suspension' and s.ended_at is null limit 1),
      'termination_id', v_term.id),
    'can_lift_termination', v_term.id is not null and auth.uid() is distinct from coalesce(v_decider, v_term.applied_by),
    'sanctions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'case_id', s.case_id, 'level', s.level,
                   'immediate_ground', s.immediate_ground, 'applied_at', s.applied_at,
                   'applied_by_name', (select p.full_name from public.profiles p where p.id = s.applied_by),
                   'decided_by_name', (select p.full_name from public.profiles p join app.conduct_decisions d on d.decided_by = p.id where d.id = s.decision_id),
                   'status', app.sanction_status(s), 'expires_at', s.expires_at, 'ended_at', s.ended_at, 'end_note', s.end_note,
                   'planned_review_on', s.planned_review_on) order by s.applied_at desc)
                   from app.org_sanctions s where s.organization_id = p_org), '[]'),
    'open_cases', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'state', app.conduct_admin_state(c.id),
                   'next_deadline', (select n.response_due_at from app.conduct_notices n where n.case_id = c.id order by n.sent_at desc limit 1),
                   'first_response_due_at', c.first_response_due_at) order by c.created_at desc)
                   from app.conduct_cases c where c.reported_org_id = p_org and c.status not in ('closed', 'decided')), '[]'),
    'acceptances', coalesce((select jsonb_agg(jsonb_build_object('label', v.label, 'accepted_at', a.accepted_at,
                   'accepted_by_name', (select p.full_name from public.profiles p where p.id = a.accepted_by)) order by v.effective_at desc)
                   from public.network_rules_org_acceptances a join public.network_rules_versions v on v.id = a.version_id
                  where a.organization_id = p_org), '[]'),
    'members_not_accepted', app.members_not_accepted(p_org),
    'obligations', case when o.suspended_at is not null then jsonb_build_object(
      'referrals', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'status', r.status, 'job_title', r.job_title_snapshot,
                     'partner_org_name', (select x.name from public.organizations x
                                           where x.id = case when r.source_org_id = p_org then r.target_org_id else r.source_org_id end),
                     'last_activity_at', app.referral_last_activity(r.id),
                     'inactive_days', (app.today_et() - (app.referral_last_activity(r.id) at time zone 'America/Toronto')::date),
                     'stale_closable', o.terminated_at is not null and app.referral_last_activity(r.id) <= now() - interval '60 days')
                     order by app.referral_last_activity(r.id))
                     from public.referrals r
                    where (r.source_org_id = p_org or r.target_org_id = p_org) and not app.referral_terminal(r.status)), '[]'),
      'placements', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'referral_id', p.referral_id, 'status', p.status,
                     'guarantee_until', p.guarantee_until,
                     'reasons', to_jsonb(array_remove(array[
                        case when p.guarantee_until is not null and p.guarantee_until >= app.today_et() and p.status <> 'cancelled' then 'guarantee' end,
                        case when p.status in ('hire_reported', 'invoiced', 'payment_partially_verified', 'commission_payable') then 'payout_not_confirmed' end,
                        case when p.status = 'disputed' or exists (select 1 from public.disputes d where d.placement_id = p.id and d.status = 'open') then 'open_dispute' end],
                        null)))
                     order by p.created_at)
                     from public.placements p
                    where (p.source_org_id = p_org or p.target_org_id = p_org)
                      and app.referral_in_settlement_scope(p.referral_id)
                      and (p.status not in ('settled', 'cancelled')
                           or (p.status = 'settled' and p.guarantee_until >= app.today_et()))), '[]'),
      'all_settled', not app.org_has_open_obligations(p_org)) end);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_decide_conduct_case(uuid, uuid, text, text, text[], boolean, text, text, date)',
    'public.admin_apply_immediate_hold(uuid, text, text, date, uuid, text[], text, text, text, boolean)',
    'public.admin_lift_sanction(uuid, uuid, text)',
    'public.request_sanction_review(uuid, uuid, text, uuid[])',
    'public.admin_decide_sanction_review(uuid, text, text, text)',
    'public.admin_conduct_incident_options(uuid)',
    'public.admin_send_incident_notice(uuid, uuid[], uuid[], text, text, text, text)',
    'public.get_incident_notice(uuid, uuid)', 'public.get_network_standing(uuid)', 'public.admin_org_conduct_file(uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
