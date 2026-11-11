-- Mobility for international roles, end to end:
--   * jobs say whether they involve travel, sponsor visas or help with relocation;
--   * candidate country lists (relocation destinations, passports, work authorization) hold ISO 3166-1
--     alpha-2 codes so matching can compare them with a job's country;
--   * "mobility" becomes a disclosable referral field (travel, relocation, work authorization, and
--     whether the candidate holds a passport; never which countries issued it);
--   * the candidate can review and update their mobility when confirming a referral.

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------
alter table public.jobs
  add column travel_requirement text check (travel_requirement in ('none', 'occasional', 'frequent')),
  add column visa_sponsorship boolean not null default false,
  add column relocation_support boolean not null default false;

-- ---------------------------------------------------------------------------
-- Candidates: country lists are ISO codes
-- ---------------------------------------------------------------------------
create or replace function app.all_iso2(p text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(bool_and(x ~ '^[A-Z]{2}$'), true) from unnest(p) x;
$$;

alter table public.candidates
  add constraint candidates_mobility_iso2 check (
    app.all_iso2(relocation_destinations) and app.all_iso2(passport_countries) and app.all_iso2(work_authorization)
  );

-- ---------------------------------------------------------------------------
-- Sharing: "mobility" disclosure field
-- ---------------------------------------------------------------------------
create or replace function app.build_shared_snapshot(p_candidate uuid, p_fields text[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.candidates;
  v jsonb := '{}';
begin
  select * into c from public.candidates where id = p_candidate;
  if 'full_name' = any(p_fields) then v := v || jsonb_build_object('full_name', c.full_name); end if;
  if 'email' = any(p_fields) then v := v || jsonb_build_object('email', c.email); end if;
  if 'phone' = any(p_fields) then v := v || jsonb_build_object('phone', c.phone); end if;
  if 'headline' = any(p_fields) then v := v || jsonb_build_object('headline', c.headline); end if;
  if 'summary' = any(p_fields) then v := v || jsonb_build_object('summary', c.summary); end if;
  if 'location' = any(p_fields) then
    v := v || jsonb_build_object('location', nullif(concat_ws(', ', c.location_city, c.location_region, c.location_country), ''),
                                 'open_to_relocation', c.open_to_relocation);
  end if;
  if 'seniority' = any(p_fields) then v := v || jsonb_build_object('seniority', c.seniority, 'years_experience', c.years_experience); end if;
  if 'skills' = any(p_fields) then v := v || jsonb_build_object('skills', to_jsonb(c.skills)); end if;
  if 'languages' = any(p_fields) then v := v || jsonb_build_object('languages', to_jsonb(c.languages)); end if;
  if 'work_arrangements' = any(p_fields) then v := v || jsonb_build_object('work_arrangements', to_jsonb(c.work_arrangements)); end if;
  if 'salary_expectation' = any(p_fields) then
    v := v || jsonb_build_object('salary_expectation_min', c.salary_expectation_min,
                                 'salary_expectation_max', c.salary_expectation_max,
                                 'salary_currency', c.salary_currency);
  end if;
  if 'availability' = any(p_fields) then v := v || jsonb_build_object('available_from', c.available_from); end if;
  if 'mobility' = any(p_fields) then
    v := v || jsonb_build_object('mobility', jsonb_build_object(
      'travel', c.travel_availability,
      'relocation', coalesce(c.relocation_scope, case when c.open_to_relocation then 'country' end),
      'destinations', to_jsonb(c.relocation_destinations),
      'work_authorization', to_jsonb(c.work_authorization),
      'has_passport', c.has_passport));
  end if;
  if 'experience' = any(p_fields) then
    v := v || jsonb_build_object('experience', coalesce((
      select jsonb_agg(jsonb_build_object('title', e.title, 'company', e.company, 'start_date', e.start_date,
                                          'end_date', e.end_date, 'description', e.description)
                       order by e.start_date desc nulls last)
      from public.candidate_experiences e where e.candidate_id = p_candidate), '[]'::jsonb));
  end if;
  return v;
end $$;
revoke execute on function app.build_shared_snapshot(uuid, text[]) from public, anon, authenticated;

create or replace function app.assert_referable(p_candidate uuid, p_job uuid, p_fields text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.candidates;
  j public.jobs;
  v_allowed text[] := array['full_name','email','phone','headline','summary','location','seniority','skills',
                            'languages','work_arrangements','salary_expectation','availability','experience','mobility'];
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;

  select * into c from public.candidates where id = p_candidate for update;
  if not found or not app.is_member(c.organization_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if c.status <> 'active_for_matching' then
    raise exception 'candidate_not_active' using errcode = 'P0001';
  end if;

  select * into j from public.jobs where id = p_job;
  if not found or j.status <> 'active' or not j.accepts_external_referrals or j.organization_id = c.organization_id then
    raise exception 'job_not_open_for_referrals' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.organizations o where o.id = j.organization_id and o.suspended_at is not null) then
    raise exception 'job_not_open_for_referrals' using errcode = 'P0001';
  end if;

  if p_fields is null or cardinality(p_fields) = 0 or not (p_fields <@ v_allowed) then
    raise exception 'invalid_disclosure_fields' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.referral_candidate_links l join public.referrals r on r.id = l.referral_id
    where l.candidate_id = c.id and r.job_id = j.id
      and r.status not in ('declined', 'withdrawn', 'rejected', 'cancelled', 'candidate_declined')
  ) then
    raise exception 'duplicate_referral' using errcode = '23505';
  end if;
end $$;
revoke execute on function app.assert_referable(uuid, uuid, text[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Candidate confirmation: show and accept mobility updates
-- ---------------------------------------------------------------------------
create or replace function public.get_candidate_request(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
  if p_token is null or char_length(p_token) not between 32 and 128 then return null; end if;
  select * into q from public.referral_candidate_requests
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found then return null; end if;
  select * into r from public.referrals where id = q.referral_id;

  v_state := case
    when q.confirmed_at is not null then 'confirmed'
    when q.declined_at is not null then 'declined'
    when r.status <> 'awaiting_candidate' then 'closed'
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
end $$;

create or replace function public.respond_candidate_request(
  p_token text, p_accept boolean, p_profile jsonb default '{}', p_reason text default null, p_meta jsonb default '{}'
) returns text
language plpgsql security definer set search_path = '' as $$
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
  p jsonb := coalesce(p_profile, '{}');
begin
  if p_token is null or char_length(p_token) not between 32 and 128 then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into q from public.referral_candidate_requests
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  if q.confirmed_at is not null then return 'confirmed'; end if;
  if q.declined_at is not null then return 'declined'; end if;

  select * into r from public.referrals where id = q.referral_id for update;
  if r.status <> 'awaiting_candidate' then raise exception 'request_closed' using errcode = 'P0001'; end if;
  if q.expires_at < now() then raise exception 'request_expired' using errcode = 'P0001'; end if;

  if not coalesce(p_accept, false) then
    update public.referral_candidate_requests
       set declined_at = now(), decline_reason = nullif(left(btrim(coalesce(p_reason, '')), 1000), ''),
           response_meta = coalesce(p_meta, '{}')
     where referral_id = q.referral_id;
    update public.referrals set status = 'candidate_declined', version = version + 1, decided_at = now() where id = r.id;
    insert into public.referral_status_events (referral_id, from_status, to_status, actor_id, actor_side, reason)
    values (r.id, r.status, 'candidate_declined', null, null, nullif(left(btrim(coalesce(p_reason, '')), 2000), ''));
    perform app.notify_org(r.source_org_id, 'referral.candidate_declined', 'Candidate declined the referral',
      r.job_title_snapshot, '/referrals/' || r.id, r.source_user_id);
    perform app.audit(r.source_org_id, 'referral.candidate_declined', 'referral', r.id, '{}');
    return 'declined';
  end if;

  select * into j from public.jobs where id = r.job_id;
  if j.status <> 'active' or not j.accepts_external_referrals
     or exists (select 1 from public.organizations o where o.id = j.organization_id and o.suspended_at is not null) then
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

  select o.name into v_partner from public.organizations o where o.id = r.target_org_id;
  insert into public.candidate_consents (organization_id, candidate_id, kind, job_id, legal_basis, scope, evidence, recorded_by)
  values (
    r.source_org_id, q.candidate_id, 'job_sharing', r.job_id, 'consent',
    left(format('Share the selected profile fields (%s)%s with %s for "%s"',
                array_to_string(q.requested_fields, ', '),
                case when cardinality(q.requested_document_ids) > 0 then ' and documents' else '' end,
                v_partner, r.job_title_snapshot), 1000),
    left(format('Candidate confirmed through the private link emailed to %s (sent %s, confirmed %s UTC).%s',
                q.destination,
                coalesce(to_char(q.sent_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'), 'n/a'),
                to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI'),
                case when cardinality(v_changed) > 0 then ' Candidate updated: ' || array_to_string(v_changed, ', ') || '.' else '' end), 2000),
    r.source_user_id)
  returning id into v_consent;

  update public.referral_candidate_requests
     set confirmed_at = now(), consent_id = v_consent, profile_changes = v_changed, response_meta = coalesce(p_meta, '{}')
   where referral_id = q.referral_id;

  update public.referrals
     set status = 'submitted', version = version + 1, submitted_at = now(),
         ownership_protected_until = now() + interval '12 months'
   where id = r.id;
  insert into public.referral_status_events (referral_id, from_status, to_status, actor_id, actor_side, reason)
  values (r.id, 'awaiting_candidate', 'submitted', null, null, null);

  perform app.deliver_referral(r.id, v_consent, q.requested_fields, q.requested_document_ids, q.note, r.source_user_id, true);

  perform app.notify_org(r.source_org_id, 'referral.candidate_confirmed', 'Candidate confirmed the referral',
    r.job_title_snapshot || ' — sent to ' || v_partner, '/referrals/' || r.id, r.source_user_id);
  perform app.audit(r.source_org_id, 'referral.candidate_confirmed', 'referral', r.id,
    jsonb_build_object('profile_changes', to_jsonb(v_changed)));
  return 'confirmed';
end $$;

revoke execute on function public.get_candidate_request(text) from public;
revoke execute on function public.respond_candidate_request(text, boolean, jsonb, text, jsonb) from public;
grant execute on function public.get_candidate_request(text) to anon, authenticated;
grant execute on function public.respond_candidate_request(text, boolean, jsonb, text, jsonb) to anon, authenticated;
