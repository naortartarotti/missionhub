-- N10 part 4 of 8: the partner-activity restriction wired in (BR-12 to BR-14, BR-9 b, EC-2).
--
-- - app.job_partner_visible(j) = app.job_partner_open(j) (job-level: active, open, permanent,
--   current terms, currency) AND app.org_partner_restriction(owner) is null. Every existing caller
--   keeps the name (get_opportunities, assert_referable, assert_own_match, mark_matches_seen,
--   get_jobs_terms_state, presentation_admin_metrics), so a restricted org's jobs vanish everywhere.
-- - Delivery (respond_candidate_request) uses job_partner_open only (BR-13).
-- - Submitting: a BEFORE INSERT trigger on referrals refuses a restricted source org
--   (partner_activity_restricted) or a user who hasn't accepted the rules in force
--   (rules_acceptance_required), on every path (both submit RPCs, internal referrals, any future API).
--   A restricted target is refused like any hidden job (job_not_open_for_referrals).
-- - Opening a job to partners: a trigger refuses the closed -> open transition for a user who hasn't
--   accepted the rules in force (BR-9 b, N10-D20). The org-level restriction doesn't block saving
--   (BR-12.2): the job stays hidden by job_partner_visible.
-- - Matches are hidden at read time, never expired: they come back with the same match_id and triage
--   state as soon as the restriction lifts. Lifting a suspension or termination re-queues matching.
-- - get_partner_job_availability (S21) answers only to orgs with a referral on, or a live match with,
--   the job (anti-enumeration), and never returns the reason.
-- Latest bodies copied from the live catalog (20261116000100/000200/000300/000600, 20261115000100,
-- 20261111000200, 20261109000200 lineage); only the marked lines change.

create or replace function app.job_partner_open(j public.jobs) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    j.status = 'active'
    and j.accepts_external_referrals
    and j.contract_type = 'permanent'
    and exists (
      select 1 from app.current_job_terms(j.id) v
       where v.id is not null and (v.fee_basis = 'flat' or v.currency = j.salary_currency)),
    false);
$$;
revoke execute on function app.job_partner_open(public.jobs) from public, anon, authenticated;

create or replace function app.job_partner_visible(j public.jobs) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.job_partner_open(j) and app.org_partner_restriction(j.organization_id) is null;
$$;

-- Owner-only hidden reason (get_jobs_terms_state checks membership). Restriction first (AC-138).
create or replace function app.job_hidden_reason(j public.jobs) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when app.job_partner_visible(j) then null
    when app.org_partner_restriction(j.organization_id) in ('terminated', 'suspended') then 'org_suspended'
    when app.org_partner_restriction(j.organization_id) = 'network_hold' then 'network_hold'
    when app.org_partner_restriction(j.organization_id) = 'rules_not_accepted' then 'rules_not_accepted'
    when not j.accepts_external_referrals then 'not_open'
    when (app.current_job_terms(j.id)).id is null then 'no_terms'
    when j.contract_type <> 'permanent' then 'not_permanent'
    when (app.current_job_terms(j.id)).fee_basis <> 'flat'
         and (app.current_job_terms(j.id)).currency <> j.salary_currency then 'currency_mismatch'
    else 'not_active'
  end;
$$;

-- BR-12.3 / BR-12.4 / BR-9 b on every referral insert.
create or replace function app.guard_referral_restriction() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user text;
begin
  if app.org_partner_restriction(new.source_org_id) is not null then
    raise exception 'partner_activity_restricted' using errcode = 'P0001';
  end if;
  if auth.uid() is not null then
    v_user := app.user_partner_restriction(auth.uid(), new.source_org_id);
    if v_user in ('rules_acceptance_required', 'rules_not_accepted_user') then
      raise exception 'rules_acceptance_required' using errcode = 'P0001';
    end if;
  end if;
  -- Receiving: the same outcome as any hidden job, no reason (BR-14, BR-42).
  if app.org_partner_restriction(new.target_org_id) is not null then
    raise exception 'job_not_open_for_referrals' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function app.guard_referral_restriction() from public, anon, authenticated;
create trigger referrals_a_restriction before insert on public.referrals
  for each row execute function app.guard_referral_restriction();

-- BR-9 b / N10-D20: only the transition to "open to partners" needs the rules in force.
create or replace function app.guard_job_open_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and new.accepts_external_referrals and not coalesce(old.accepts_external_referrals, false)
     and app.user_partner_restriction(auth.uid(), new.organization_id) in ('rules_acceptance_required', 'rules_not_accepted_user') then
    raise exception 'rules_acceptance_required' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function app.guard_job_open_rules() from public, anon, authenticated;
create trigger jobs_open_rules before update of accepts_external_referrals on public.jobs
  for each row execute function app.guard_job_open_rules();

-- Matching: the restricted side sees nothing; restricted counterparts are hidden (BR-12.5).
create or replace function app.assert_own_match(p_org uuid, p_match uuid)
returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_member(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if app.org_partner_restriction(p_org) is not null  -- N10
     or not exists (select 1 from public.matches m where m.id = p_match and m.candidate_org_id = p_org
                   and app.can_access_candidate(m.candidate_id)
                   and exists (select 1 from public.jobs j where j.id = m.job_id and app.job_partner_visible(j))) then  -- N2
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end $$;

create or replace function public.mark_matches_seen(p_org uuid, p_matches uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_member(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if cardinality(p_matches) > 500 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  if app.org_partner_restriction(p_org) is not null then return; end if;  -- N10: nothing visible to mark
  insert into public.match_triage as t (match_id, organization_id, seen_at, updated_by)
  select m.id, p_org, now(), auth.uid()
  from public.matches m
  where m.id = any (p_matches) and m.candidate_org_id = p_org and app.can_access_candidate(m.candidate_id)
    and exists (select 1 from public.jobs j where j.id = m.job_id and app.job_partner_visible(j))  -- N2
  on conflict (organization_id, match_id) do update set seen_at = coalesce(t.seen_at, now());
end $$;

-- Job owner's match counts: zero while the owner is restricted; restricted candidate orgs excluded.
create or replace function public.get_job_match_summary(p_job uuid)
returns table(strong_count integer, potential_count integer, last_refreshed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.jobs where id = p_job;
  if v_org is null or not app.is_member(v_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if app.org_partner_restriction(v_org) is not null then  -- N10 (BR-12.5)
    return query select 0, 0, null::timestamptz;
    return;
  end if;
  return query
  select
    count(*) filter (where m.band = 'strong')::int,
    count(*) filter (where m.band = 'potential')::int,
    max(m.refreshed_at)
  from public.matches m
  join public.candidates c on c.id = m.candidate_id
  where m.job_id = p_job and m.expired_at is null and c.status = 'active_for_matching'
    and app.org_partner_restriction(m.candidate_org_id) is null;  -- N10
end $$;

-- Re-queues matching for an org's open jobs and active candidates (used when a restriction lifts,
-- so rows expired by pre-N10 suspensions are refreshed within one cycle; scenario 14).
create or replace function app.requeue_org_matching(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v uuid;
begin
  for v in select j.id from public.jobs j where j.organization_id = p_org and j.status = 'active' and j.accepts_external_referrals loop
    perform app.enqueue('match.job', v::text, jsonb_build_object('job_id', v), '2 seconds');
  end loop;
  for v in select c.id from public.candidates c where c.organization_id = p_org and c.status = 'active_for_matching' loop
    perform app.enqueue('match.candidate', v::text, jsonb_build_object('candidate_id', v), '2 seconds');
  end loop;
end $$;
revoke execute on function app.requeue_org_matching(uuid) from public, anon, authenticated;

-- S21 (BR-14, AC-48/49/136/137): what a partner may learn about a job it reached directly.
-- Returns { status: available | not_taking_referrals | no_longer_member | not_found, org_name, job_title }.
create or replace function public.get_partner_job_availability(p_org uuid, p_match uuid default null, p_job uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_job uuid := p_job;
  j public.jobs;
  v_status text;
  v_org_name text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if p_org is null or not app.is_member_or_settling(p_org) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if p_match is not null then
    select m.job_id into v_job from public.matches m
     where m.id = p_match and m.candidate_org_id = p_org and m.expired_at is null and app.can_access_candidate(m.candidate_id);
  end if;
  select * into j from public.jobs where id = v_job;
  if not found or j.organization_id = p_org
     or not (exists (select 1 from public.matches m
                      where m.job_id = j.id and m.candidate_org_id = p_org and m.expired_at is null
                        and app.can_access_candidate(m.candidate_id))
             or exists (select 1 from public.referrals r
                         where r.job_id = j.id and r.source_org_id = p_org and app.sees_referral_as_source(r.id))) then
    return jsonb_build_object('status', 'not_found');
  end if;
  v_status := case
    when app.org_settlement_state(j.organization_id) = 'closed' then 'no_longer_member'
    when app.org_partner_restriction(j.organization_id) is not null then 'not_taking_referrals'
    when app.job_partner_visible(j) then 'available'
    else 'not_found'
  end;
  if v_status = 'not_found' then return jsonb_build_object('status', 'not_found'); end if;
  select o.name into v_org_name from public.organizations o where o.id = j.organization_id;
  return jsonb_build_object('status', v_status, 'org_name', v_org_name, 'job_title', j.title);
end $$;
revoke execute on function public.get_partner_job_availability(uuid, uuid, uuid) from public, anon;
grant execute on function public.get_partner_job_availability(uuid, uuid, uuid) to authenticated;

-- EC-7: the caller's own org state, read once per request by getRequestContext.
create or replace function public.get_my_org_state(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  o public.organizations;
  v_role public.membership_role;
  v_state text;
  v_cur public.network_rules_versions;
  v_req public.network_rules_versions;
  v_up public.network_rules_versions;
  v_uid uuid := auth.uid();
  v_org_cur jsonb;
  v_org_up jsonb;
  v_any boolean;
  v_acc_cur boolean;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select m.role into v_role from public.organization_memberships m
   where m.organization_id = p_org and m.user_id = v_uid and m.status = 'active';
  if v_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into o from public.organizations where id = p_org;
  v_state := app.org_settlement_state(p_org);
  if v_state = 'closed' then raise exception 'not_found' using errcode = 'P0002'; end if;

  select * into v_cur from public.network_rules_versions where id = app.rules_current_version();
  v_req := app.rules_required_version();
  select * into v_up from public.network_rules_versions where id = app.rules_upcoming_version();
  v_any := app.user_accepted_any(v_uid);
  v_acc_cur := app.user_accepted_required(v_uid);

  select jsonb_build_object('at', a.accepted_at,
           'by_name', case when v_role = 'org_admin' then (select p.full_name from public.profiles p where p.id = a.accepted_by) end)
    into v_org_cur
    from public.network_rules_org_acceptances a join public.network_rules_versions v on v.id = a.version_id
   where a.organization_id = p_org and v_req.id is not null and v.effective_at >= v_req.effective_at
   order by a.accepted_at desc limit 1;
  if v_up.id is not null then
    select jsonb_build_object('at', a.accepted_at,
             'by_name', case when v_role = 'org_admin' then (select p.full_name from public.profiles p where p.id = a.accepted_by) end)
      into v_org_up
      from public.network_rules_org_acceptances a where a.organization_id = p_org and a.version_id = v_up.id;
  end if;

  return jsonb_build_object(
    'role', v_role,
    'restriction', app.org_partner_restriction(p_org),
    'settlement_mode', coalesce(v_state = 'settlement', false),
    'settlement_kind', case when v_state = 'settlement' then case when o.terminated_at is not null then 'terminated' else 'suspended' end end,
    'suspended_at', o.suspended_at,
    'terminated_at', o.terminated_at,
    'quebec', o.locale ilike 'fr%',
    'rules', jsonb_build_object(
      'current', case when v_cur.id is not null then jsonb_build_object('id', v_cur.id, 'label', v_cur.label,
                   'effective_at', v_cur.effective_at, 'type', v_cur.type) end,
      'required', case when v_req.id is not null then jsonb_build_object('id', v_req.id, 'label', v_req.label,
                   'effective_at', v_req.effective_at) end,
      'upcoming', case when v_up.id is not null then jsonb_build_object('id', v_up.id, 'label', v_up.label,
                   'effective_at', v_up.effective_at, 'type', v_up.type) end,
      'gate_required', v_cur.id is not null and not v_any,
      'member_accepted_any', v_any,
      'member_accepted_current', v_acc_cur,
      'member_accepted_upcoming', v_up.id is not null and exists (
         select 1 from public.network_rules_member_acceptances a where a.user_id = v_uid and a.version_id = v_up.id),
      'org_accepted_current', case when v_req.id is null then jsonb_build_object('at', null, 'by_name', null) else v_org_cur end,
      'org_accepted_upcoming', v_org_up,
      'user_restricted', v_any and not v_acc_cur));
end $$;
revoke execute on function public.get_my_org_state(uuid) from public, anon;
grant execute on function public.get_my_org_state(uuid) to authenticated;

-- EC-7: the org switcher list, settlement-mode orgs included (marked), closed orgs excluded.
create or replace function public.list_my_organizations()
returns table(id uuid, slug text, name text, is_demo boolean, role public.membership_role, settlement_mode boolean)
language sql stable security definer set search_path = '' as $$
  select o.id, o.slug, o.name, o.is_demo, m.role, coalesce(s.state = 'settlement', false)
    from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
    cross join lateral (select app.org_settlement_state(o.id) as state) s
   where m.user_id = auth.uid() and m.status = 'active' and s.state is distinct from 'closed'
   order by m.created_at;
$$;
revoke execute on function public.list_my_organizations() from public, anon;
grant execute on function public.list_my_organizations() to authenticated;


create or replace function public.get_candidate_request(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  q public.referral_candidate_requests;
  r public.referrals;
  c public.candidates;
  j public.jobs;
  v_state text;
  v_recruiter_org text;
  v_recruiter_name text;
  v_partner text;
begin
  -- N10 (BR-7 exempt): the actor is the candidate, not a signed-in member.
  perform set_config('app.rules_gate_exempt', 'on', true);
  if p_token is null or char_length(p_token) not between 32 and 128 then return null; end if;
  select * into q from public.referral_candidate_requests
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found then return null; end if;
  select * into r from public.referrals where id = q.referral_id;

  v_state := case
    when q.confirmed_at is not null then 'confirmed'
    when q.declined_at is not null then 'declined'
    when r.status = 'already_presented' then 'already_sent'
    when r.status <> 'awaiting_candidate' then 'closed'
    when q.token_issued_at is null then 'expired'   -- N9 BR-6: never pending without a server-issued token
    when q.expires_at < now() then 'expired'
    else 'pending'
  end;

  select o.name into v_recruiter_org from public.organizations o where o.id = r.source_org_id;
  select p.full_name into v_recruiter_name from public.profiles p where p.id = r.source_user_id;
  select o.name into v_partner from public.organizations o where o.id = r.target_org_id;

  if v_state <> 'pending' then
    return jsonb_build_object('state', v_state, 'job', jsonb_build_object('title', r.job_title_snapshot, 'org', v_partner),
                              'recruiter', jsonb_build_object('org', v_recruiter_org, 'name', v_recruiter_name));
  end if;

  update public.referral_candidate_requests set viewed_at = coalesce(viewed_at, now()) where referral_id = q.referral_id;
  select * into c from public.candidates where id = q.candidate_id;
  select * into j from public.jobs where id = r.job_id;

  return jsonb_build_object(
    'state', 'pending',
    'expires_at', q.expires_at,
    'recruiter', jsonb_build_object('org', v_recruiter_org, 'name', v_recruiter_name),
    'job', jsonb_build_object(
      'title', j.title,
      'org', v_partner,
      'client', case when j.client_confidential or j.client_name is null then null else j.client_name end,
      'location', case when j.share_location then nullif(concat_ws(', ', j.location_city, j.location_region, j.location_country), '') end,
      'work_arrangement', j.work_arrangement,
      'contract_type', j.contract_type,
      'seniority', j.seniority,
      'description', case when j.share_description then left(j.description, 6000) end
    ),
    'fields', to_jsonb(q.requested_fields),
    'documents', coalesce((select jsonb_agg(d.file_name order by d.file_name) from public.candidate_documents d
                            where d.id = any (q.requested_document_ids) and d.deleted_at is null), '[]'::jsonb),
    'note', q.note,
    'candidate', jsonb_build_object(
      'full_name', c.full_name,
      'email', c.email,
      'phone', c.phone,
      'headline', c.headline,
      'summary', c.summary,
      'location_city', c.location_city,
      'location_region', c.location_region,
      'location_country', c.location_country,
      'open_to_relocation', c.open_to_relocation,
      'work_arrangements', to_jsonb(c.work_arrangements),
      'seniority', c.seniority,
      'years_experience', c.years_experience,
      'skills', to_jsonb(c.skills),
      'languages', to_jsonb(c.languages),
      'salary_expectation_min', c.salary_expectation_min,
      'salary_expectation_max', c.salary_expectation_max,
      'salary_currency', c.salary_currency,
      'available_from', c.available_from,
      'travel_availability', c.travel_availability,
      'relocation_scope', coalesce(c.relocation_scope, case when c.open_to_relocation then 'country' end),
      'relocation_destinations', to_jsonb(c.relocation_destinations),
      'work_authorization', to_jsonb(c.work_authorization),
      'has_passport', c.has_passport
    )
  );
end $function$;

create or replace function public.respond_candidate_request(p_token text, p_accept boolean, p_profile jsonb DEFAULT '{}'::jsonb, p_reason text DEFAULT NULL::text, p_meta jsonb DEFAULT '{}'::jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  q public.referral_candidate_requests;
  r public.referrals;
  j public.jobs;
  v_before jsonb;
  v_after jsonb;
  v_changed text[];
  v_editable text[] := array['full_name','phone','headline','summary','location_city','location_region','location_country',
                             'open_to_relocation','work_arrangements','skills','languages','salary_expectation_min',
                             'salary_expectation_max','salary_currency','available_from','travel_availability',
                             'relocation_scope','relocation_destinations','work_authorization','has_passport'];
  v_partner text;
  v_consent uuid;
  v_chk record;
  v_email_changed timestamptz;
  p jsonb := coalesce(p_profile, '{}');
begin
  -- N10 (BR-7 exempt): the actor is the candidate, not a signed-in member.
  perform set_config('app.rules_gate_exempt', 'on', true);
  if p_token is null or char_length(p_token) not between 32 and 128 then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into q from public.referral_candidate_requests
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- N9 BR-6: only a server-issued token (token_issued_at set) can answer.
  if q.token_issued_at is null then raise exception 'request_expired' using errcode = 'P0001'; end if;

  if q.confirmed_at is not null then return 'confirmed'; end if;
  if q.declined_at is not null then return 'declined'; end if;

  select * into r from public.referrals where id = q.referral_id for update;
  if r.status = 'already_presented' then return 'already_sent'; end if;
  if r.status <> 'awaiting_candidate' then raise exception 'request_closed' using errcode = 'P0001'; end if;
  if q.expires_at < now() then raise exception 'request_expired' using errcode = 'P0001'; end if;

  if not coalesce(p_accept, false) then
    update public.referral_candidate_requests
       set declined_at = now(), decline_reason = nullif(left(btrim(coalesce(p_reason, '')), 1000), ''),
           response_meta = coalesce(p_meta, '{}')
     where referral_id = q.referral_id;
    update public.referrals set status = 'candidate_declined', version = version + 1, decided_at = now() where id = r.id;
    insert into public.referral_status_events (referral_id, from_status, to_status, actor_id, actor_side, reason, actor_kind)
    values (r.id, r.status, 'candidate_declined', null, null, nullif(left(btrim(coalesce(p_reason, '')), 2000), ''), 'candidate');
    perform app.notify_org(r.source_org_id, 'referral.candidate_declined', 'Candidate declined the referral',
      r.job_title_snapshot, '/referrals/' || r.id, r.source_user_id);
    perform app.audit(r.source_org_id, 'referral.candidate_declined', 'referral', r.id, '{}');
    return 'declined';
  end if;

  select * into j from public.jobs where id = r.job_id;
  -- N2 (BR-3 delivery exception, PD-051 Q1): a snapshot referral needs the full partner-visibility
  -- predicate; a referral without a snapshot (committed before N2) keeps today's check (BR-7).
  -- N10 (BR-13, EC-2): delivery uses the job-level predicate only; a partner-activity restriction
  -- (hold, rules not accepted, suspension, termination) never blocks a referral submitted before it.
  if r.terms_version_id is not null then
    if not app.job_partner_open(j) then
      raise exception 'job_not_open_for_referrals' using errcode = 'P0001';
    end if;
  elsif j.status <> 'active' or not j.accepts_external_referrals then
    raise exception 'job_not_open_for_referrals' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.candidates c where c.id = q.candidate_id and c.status = 'active_for_matching') then
    raise exception 'candidate_not_active' using errcode = 'P0001';
  end if;

  select to_jsonb(c) into v_before from public.candidates c where c.id = q.candidate_id for update;
  update public.candidates c set
    full_name = case when p ? 'full_name' and nullif(btrim(p->>'full_name'), '') is not null then left(btrim(p->>'full_name'), 160) else c.full_name end,
    phone = case when p ? 'phone' then nullif(left(btrim(coalesce(p->>'phone', '')), 40), '') else c.phone end,
    headline = case when p ? 'headline' then nullif(left(btrim(coalesce(p->>'headline', '')), 200), '') else c.headline end,
    summary = case when p ? 'summary' then nullif(left(btrim(coalesce(p->>'summary', '')), 5000), '') else c.summary end,
    location_city = case when p ? 'location_city' then nullif(left(btrim(coalesce(p->>'location_city', '')), 100), '') else c.location_city end,
    location_region = case when p ? 'location_region' then nullif(left(btrim(coalesce(p->>'location_region', '')), 100), '') else c.location_region end,
    location_country = case when p ? 'location_country' then nullif(upper(btrim(coalesce(p->>'location_country', ''))), '') else c.location_country end,
    -- The relocation scope, when sent, decides the boolean the matching engine reads.
    open_to_relocation = case
      when p ? 'relocation_scope' then coalesce(nullif(p->>'relocation_scope', ''), 'none') <> 'none'
      when p ? 'open_to_relocation' then coalesce((p->>'open_to_relocation')::boolean, false)
      else c.open_to_relocation end,
    work_arrangements = case when p ? 'work_arrangements'
      then array(select distinct x::public.work_arrangement from jsonb_array_elements_text(p->'work_arrangements') x)
      else c.work_arrangements end,
    skills = case when p ? 'skills'
      then array(select left(btrim(x), 80) from jsonb_array_elements_text(p->'skills') with ordinality s(x, i) where btrim(x) <> '' order by i limit 60)
      else c.skills end,
    languages = case when p ? 'languages'
      then array(select left(btrim(x), 80) from jsonb_array_elements_text(p->'languages') with ordinality s(x, i) where btrim(x) <> '' order by i limit 30)
      else c.languages end,
    salary_expectation_min = case when p ? 'salary_expectation_min' then (p->>'salary_expectation_min')::bigint else c.salary_expectation_min end,
    salary_expectation_max = case when p ? 'salary_expectation_max' then (p->>'salary_expectation_max')::bigint else c.salary_expectation_max end,
    salary_currency = case when p ? 'salary_currency' then nullif(upper(btrim(coalesce(p->>'salary_currency', ''))), '') else c.salary_currency end,
    available_from = case when p ? 'available_from' then nullif(p->>'available_from', '')::date else c.available_from end,
    travel_availability = case when p ? 'travel_availability' then nullif(p->>'travel_availability', '') else c.travel_availability end,
    relocation_scope = case when p ? 'relocation_scope' then nullif(p->>'relocation_scope', '') else c.relocation_scope end,
    relocation_destinations = case when p ? 'relocation_destinations'
      then array(select distinct upper(btrim(x)) from jsonb_array_elements_text(p->'relocation_destinations') x where upper(btrim(x)) ~ '^[A-Z]{2}$' limit 30)
      else c.relocation_destinations end,
    work_authorization = case when p ? 'work_authorization'
      then array(select distinct upper(btrim(x)) from jsonb_array_elements_text(p->'work_authorization') x where upper(btrim(x)) ~ '^[A-Z]{2}$' limit 30)
      else c.work_authorization end,
    has_passport = case when p ? 'has_passport' then (p->>'has_passport')::boolean else c.has_passport end,
    last_reviewed_at = now()
  where c.id = q.candidate_id
  returning to_jsonb(c) into v_after;

  select coalesce(array_agg(k order by k), '{}') into v_changed
    from unnest(v_editable) k where v_before->k is distinct from v_after->k;

  -- Delivery re-check (BR-8) with the identifiers as edited above, under the hiring-org lock (EC-3).
  -- A presentation (or a sticky stop) now in scope closes this referral instead of delivering it.
  perform app.lock_hiring_org(r.target_org_id);
  select * into v_chk from app.presentation_check(q.candidate_id, r.job_id, r.id);
  if v_chk.outcome in ('stop', 'sticky') then
    update public.referral_candidate_requests set response_meta = coalesce(p_meta, '{}'), profile_changes = v_changed
     where referral_id = q.referral_id;
    update public.referrals set status = 'already_presented', version = version + 1, decided_at = now() where id = r.id;
    update app.referral_presentations set void_reason = 'already_presented', voided_at = now() where referral_id = r.id;
    delete from app.referral_fingerprints where referral_id = r.id;
    insert into public.referral_status_events (referral_id, from_status, to_status, actor_id, actor_side, reason, actor_kind)
    values (r.id, 'awaiting_candidate', 'already_presented', null, null, null, 'system');
    perform app.record_presentation_outcome(r.source_org_id, r.target_org_id, r.job_id, q.candidate_id, r.id,
      'closure', v_chk.scope, v_chk.earlier_internal);
    perform app.notify_submitter(r.id, 'referral.already_presented', 'Referral not delivered: already presented',
      r.candidate_label || ' had already been presented to '
        || coalesce((select o.name from public.organizations o where o.id = r.target_org_id), 'the partner')
        || ' for this client, so your referral wasn''t delivered.');
    return 'already_sent';
  end if;

  select o.name into v_partner from public.organizations o where o.id = r.target_org_id;
  -- N9 BR-12: the latest change of the candidate's email in the 30 days before the link was issued.
  select max(e.changed_at) into v_email_changed from app.candidate_email_changes e
   where e.candidate_id = q.candidate_id
     and e.changed_at between q.token_issued_at - interval '30 days' and q.token_issued_at;
  insert into public.candidate_consents (organization_id, candidate_id, kind, job_id, legal_basis, scope, evidence, recorded_by)
  values (
    r.source_org_id, q.candidate_id, 'job_sharing', r.job_id, 'consent',
    left(format('Share the selected profile fields (%s)%s with %s for "%s"',
                array_to_string(q.requested_fields, ', '),
                case when cardinality(q.requested_document_ids) > 0 then ' and documents' else '' end,
                v_partner, r.job_title_snapshot), 1000),
    -- N9 BR-8: the evidence states when the server issued the link; BR-12: a recent email change.
    left(format('Candidate confirmed through the private link emailed to %s (issued %s, sent %s, confirmed %s UTC).%s%s',
                q.destination,
                to_char(q.token_issued_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'),
                coalesce(to_char(q.sent_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'), 'n/a'),
                to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI'),
                case when v_email_changed is not null
                     then ' Candidate email changed on ' || to_char(v_email_changed at time zone 'UTC', 'YYYY-MM-DD') || '.' else '' end,
                case when cardinality(v_changed) > 0 then ' Candidate updated: ' || array_to_string(v_changed, ', ') || '.' else '' end), 2000),
    r.source_user_id)
  returning id into v_consent;

  update public.referral_candidate_requests
     set confirmed_at = now(), consent_id = v_consent, profile_changes = v_changed, response_meta = coalesce(p_meta, '{}')
   where referral_id = q.referral_id;

  -- N2 (BR-19): the ownership date is set by app.deliver_referral below, not here.
  update public.referrals
     set status = 'submitted', version = version + 1, submitted_at = now()
   where id = r.id;
  insert into public.referral_status_events (referral_id, from_status, to_status, actor_id, actor_side, reason, actor_kind)
  values (r.id, 'awaiting_candidate', 'submitted', null, null, null, 'candidate');

  perform app.deliver_referral(r.id, v_consent, q.requested_fields, q.requested_document_ids, q.note, r.source_user_id, true);

  perform app.notify_org(r.source_org_id, 'referral.candidate_confirmed', 'Candidate confirmed the referral',
    r.job_title_snapshot || ' — sent to ' || v_partner, '/referrals/' || r.id, r.source_user_id);
  perform app.audit(r.source_org_id, 'referral.candidate_confirmed', 'referral', r.id,
    jsonb_build_object('profile_changes', to_jsonb(v_changed), 'token_issued_at', q.token_issued_at));  -- N9 BR-8
  return 'confirmed';
end $function$;

create or replace function public.issue_candidate_request_token(p_referral uuid, p_actor uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.referrals;
  q public.referral_candidate_requests;
  v_token text;
  v_send integer;
begin
  -- Defence in depth on top of the grants: a user session (JWT with a subject) is never accepted.
  if auth.uid() is not null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_referral is null or p_actor is null then raise exception 'not_found' using errcode = 'P0002'; end if;

  select * into r from public.referrals where id = p_referral for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.organization_memberships m
                   join public.organizations o on o.id = m.organization_id
                  where m.organization_id = r.source_org_id and m.user_id = p_actor
                    and m.status = 'active'
                    and (o.suspended_at is null or app.org_settlement_state(o.id) = 'settlement')) then  -- N10 settlement mode
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not app.user_sees_referral_as_source(p_actor, r.id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status <> 'awaiting_candidate' then raise exception 'request_closed' using errcode = 'P0001'; end if;

  select * into q from public.referral_candidate_requests where referral_id = r.id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if q.confirmed_at is not null or q.declined_at is not null then
    raise exception 'request_closed' using errcode = 'P0001';
  end if;
  -- A live (or pre-N9) token must be killed by rotate_candidate_request_token first.
  if q.token_hash is not null then raise exception 'token_already_issued' using errcode = 'P0001'; end if;
  if q.expires_at < now() then raise exception 'request_expired' using errcode = 'P0001'; end if;

  -- 32 CSPRNG bytes, base64url without padding: 43 characters, the format the page accepts.
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  update public.referral_candidate_requests
     set token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
         token_issued_at = now(), token_issued_by = p_actor
   where referral_id = r.id;

  select count(*) + 1 into v_send from public.audit_events a
   where a.entity_type = 'referral' and a.entity_id = r.id and a.action = 'referral.candidate_request_issued';
  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (r.source_org_id, p_actor, 'referral.candidate_request_issued', 'referral', r.id,
          jsonb_build_object('send_number', v_send));
  return v_token;
end $function$;

create or replace function public.get_opportunities(p_org uuid, p_candidate uuid DEFAULT NULL::uuid, p_match uuid DEFAULT NULL::uuid)
 RETURNS TABLE(match_id uuid, candidate_id uuid, candidate_name text, candidate_headline text, job_id uuid, job_title text, job_org_name text, client_label text, seniority seniority_level, work_arrangement work_arrangement, contract_type contract_type, location text, description text, required_skills text[], preferred_skills text[], salary_min bigint, salary_max bigint, salary_currency character, terms_version_id uuid, terms_version_no integer, terms_published_at timestamp with time zone, terms_updated_at timestamp with time zone, fee_basis fee_basis, rate_bps integer, flat_fee_minor bigint, min_fee_minor bigint, fee_currency character, search_type search_type, guarantee_days integer, guarantee_remedy guarantee_remedy, payment_terms_days integer, ownership_months integer, rule_name text, rule_version integer, sourcing_bps integer, job_owner_bps integer, platform_bps integer, estimated_fee_minor bigint, estimated_share_minor bigint, score smallint, band match_band, reasons jsonb, gaps jsonb, blockers jsonb, model_version text, refreshed_at timestamp with time zone, matched_at timestamp with time zone, job_posted_at timestamp with time zone, referral_id uuid, referral_status text, triage_state text, dismiss_reason text, is_new boolean, internal boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rule public.commission_rules;
begin
  if not app.is_member(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- N10 (BR-12.5): a restricted org gets no partner opportunities (matches stay stored, hidden).
  if app.org_partner_restriction(p_org) is not null then return; end if;
  -- N2: T10 is the current default rule (BR-2).
  select * into v_rule from public.commission_rules cr where cr.is_default and cr.retired_at is null order by cr.version desc limit 1;
  return query
  select
    m.id, c.id, c.full_name, c.headline,
    j.id, j.title, o.name,
    case when j.client_confidential or j.client_name is null then 'Confidential client' else j.client_name end,
    j.seniority, j.work_arrangement, j.contract_type,
    case when j.share_location then nullif(concat_ws(', ', j.location_city, j.location_region, j.location_country), '') end,
    case when j.share_description then j.description end,
    j.required_skills, j.preferred_skills,
    case when j.share_salary then j.salary_min end,
    case when j.share_salary then j.salary_max end,
    case when j.share_salary then j.salary_currency end,
    -- N2: the current terms version (BR-8) and the "terms updated" line (BR-33).
    v.id, v.version_no, v.created_at,
    case when v.version_no > 1 and v.created_at > now() - interval '30 days' then v.created_at end,
    v.fee_basis, v.rate_bps, v.flat_fee_minor, v.min_fee_minor, v.currency, v.search_type,
    v.guarantee_days::integer, v.guarantee_remedy, v.payment_terms_days::integer, v.ownership_months::integer,
    v_rule.name, v_rule.version, v_rule.sourcing_bps, v_rule.job_owner_bps, v_rule.platform_bps,
    -- N2: estimate gated by share_salary on % bases (BR-9); share = the sourcing part of the split.
    est.fee,
    case when est.fee is not null and v_rule.id is not null and not rel.internal
         then app.estimate_share_safe(est.fee, v_rule.sourcing_bps, v_rule.job_owner_bps, v_rule.platform_bps) end,  -- N2 QA-N2-07
    m.score, m.band, m.reasons, m.gaps, m.blockers, m.model_version, m.refreshed_at,
    m.created_at, j.created_at,
    r.id, r.status::text,
    t.state, t.dismiss_reason, (t.seen_at is null),
    rel.internal
  from public.matches m
  join public.candidates c on c.id = m.candidate_id
  join public.jobs j on j.id = m.job_id
  join public.organizations o on o.id = j.organization_id
  cross join lateral (select app.orgs_share_member(p_org, j.organization_id) as internal) rel
  cross join lateral (select x.* from app.current_job_terms(j.id) x) v
  cross join lateral (select app.terms_estimate(v.fee_basis, v.rate_bps, v.flat_fee_minor, v.min_fee_minor,
                                                j.share_salary, j.salary_min, j.salary_max) as fee) est
  left join public.match_triage t on t.match_id = m.id and t.organization_id = p_org
  left join lateral (
    select rl.referral_id as id, rf.status
    from public.referral_candidate_links rl
    join public.referrals rf on rf.id = rl.referral_id
    where rl.candidate_id = c.id and rf.job_id = j.id
    order by rf.created_at desc limit 1
  ) r on true
  where m.candidate_org_id = p_org
    and c.organization_id = p_org
    and (c.owner_id = auth.uid() or app.sees_all(p_org))
    and m.expired_at is null
    and c.status = 'active_for_matching'
    and app.job_partner_visible(j)  -- N2: BR-3 (replaces active ∧ open ∧ org not suspended)
    and (p_candidate is null or c.id = p_candidate)
    and (p_match is null or m.id = p_match)
  order by m.score desc, m.refreshed_at desc;
end $function$;

create or replace function public.get_sent_referral_jobs(p_org uuid)
 RETURNS TABLE(job_id uuid, status job_status, status_updated_at timestamp with time zone, internal boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.is_member_or_settling(p_org) then  -- N10 settlement mode
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select j.id, j.status, j.updated_at, s.internal
    from public.jobs j
    cross join lateral (
      select bool_and(r.internal) as internal
      from public.referrals r where r.job_id = j.id and r.source_org_id = p_org and app.sees_referral_as_source(r.id)
    ) s
    where exists (select 1 from public.referrals r where r.job_id = j.id and r.source_org_id = p_org and app.sees_referral_as_source(r.id));
end $function$;

create or replace function public.record_candidate_request_delivery(p_referral uuid, p_ok boolean, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.referral_candidate_requests
     set sent_at = case when p_ok then now() else sent_at end,
         send_count = send_count + case when p_ok then 1 else 0 end,
         last_attempt_at = now(),
         last_send_error = case when p_ok then null else left(coalesce(p_error, 'failed'), 200) end
   where referral_id = p_referral and app.is_member_or_settling(organization_id) and app.sees_referral_as_source(referral_id);
end $function$;

-- BR-5, BR-7, BR-9, N10-D17/D18: accept a version personally and/or on behalf of the org.
-- Exempt from the first-access gate. Org acceptance requires org_admin. An org_admin of an org that
-- hasn't accepted the version (or a later one) must give both statements, except in settlement mode
-- (the org-level restriction is moot there; only the personal statement is needed).
-- Returns { member_accepted, org_accepted } for that version.
create or replace function public.accept_network_rules(
  p_org uuid, p_version uuid, p_locale text, p_personal boolean, p_for_org boolean
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.network_rules_versions;
  v_settling boolean;
  v_admin boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  perform set_config('app.rules_gate_exempt', 'on', true);
  if p_org is null or not app.is_member_or_settling(p_org) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not coalesce(p_personal, false) and not coalesce(p_for_org, false) then
    raise exception 'rules_acceptance_required' using errcode = 'P0001';
  end if;
  v := app.rules_acceptable_version(p_version, true);
  perform app.rules_text_hash(v.id, p_locale);
  v_settling := app.is_settling_member(p_org);
  v_admin := app.has_role_or_settling(p_org, array['org_admin']::public.membership_role[]);
  if coalesce(p_for_org, false) and not v_admin then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(p_personal, false) and not coalesce(p_for_org, false) and v_admin and not v_settling
     and not exists (select 1 from public.network_rules_org_acceptances a
                       join public.network_rules_versions x on x.id = a.version_id
                      where a.organization_id = p_org and x.effective_at >= v.effective_at) then
    raise exception 'rules_acceptance_required' using errcode = 'P0001';
  end if;
  perform app.record_rules_acceptance(auth.uid(), p_org, v.id, p_locale, coalesce(p_personal, false), coalesce(p_for_org, false));
  return jsonb_build_object(
    'member_accepted', exists (select 1 from public.network_rules_member_acceptances a where a.user_id = auth.uid() and a.version_id = v.id),
    'org_accepted', exists (select 1 from public.network_rules_org_acceptances a where a.organization_id = p_org and a.version_id = v.id));
end $$;
revoke execute on function public.accept_network_rules(uuid, uuid, text, boolean, boolean) from public, anon;
grant execute on function public.accept_network_rules(uuid, uuid, text, boolean, boolean) to authenticated;
