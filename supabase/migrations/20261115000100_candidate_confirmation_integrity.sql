-- N9 Candidate-confirmation integrity (docs/specs/candidate-confirmation-integrity, PD-038 to PD-040).
--
-- Before N9 the caller chose the candidate link's token (it passed its SHA-256 to
-- submit_referral_for_candidate / rotate_candidate_request_token, both granted to `authenticated`),
-- so a recruiter could confirm "as the candidate" through respond_candidate_request.
--
--   BR-1/BR-4  The p_token_hash signatures are dropped. The user-session RPCs create or rotate the
--              request with no usable token (token_hash and token_issued_at null).
--   BR-2/BR-5  issue_candidate_request_token(p_referral, p_actor) generates the token in the database
--              and returns it once. Only service_role can execute it (the Server Action, admin client,
--              actor taken from the session). It re-checks membership, status and "no live token".
--   BR-6       respond_candidate_request needs token_issued_at; get_candidate_request never answers
--              `pending` without it.
--   BR-7/BR-8  Unanswered pre-N9 requests are expired and audited (reason n9_token_reset).
--   BR-10      The 10/h resend limit is enforced inside rotate_candidate_request_token.
--   BR-12      Consent evidence notes a candidate email change in the 30 days before issuance.
-- N1 (BR-9, BR-11) is otherwise unchanged: the submit body is the 20261113001100 one minus the
-- token-hash checks.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.referral_candidate_requests alter column token_hash drop not null;
alter table public.referral_candidate_requests
  add column token_issued_at timestamptz,
  add column token_issued_by uuid references auth.users (id) on delete set null;
-- Readable by the source org like the other request columns. token_hash stays ungranted (BR-3).
grant select (token_issued_at, token_issued_by) on public.referral_candidate_requests to authenticated;

-- ---------------------------------------------------------------------------
-- BR-12 input: when a candidate's email changed (dates only, never the addresses). Internal,
-- unreadable by any PostgREST role; kept 60 days (30-day window + 30-day maximum link TTL).
-- ---------------------------------------------------------------------------
create table app.candidate_email_changes (
  id bigint generated always as identity primary key,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  changed_at timestamptz not null default now()
);
create index candidate_email_changes_candidate_idx on app.candidate_email_changes (candidate_id, changed_at desc);
alter table app.candidate_email_changes enable row level security;
-- No policies: nothing but SECURITY DEFINER functions reads or writes it.
revoke all on app.candidate_email_changes from public, anon, authenticated;

create or replace function app.on_candidate_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from app.candidate_email_changes
   where candidate_id = new.id and changed_at < now() - interval '60 days';
  insert into app.candidate_email_changes (candidate_id) values (new.id);
  return new;
end $$;
revoke execute on function app.on_candidate_email_change() from public, anon, authenticated;
create trigger candidates_email_change after update of email on public.candidates
  for each row when (old.email is distinct from new.email)
  execute function app.on_candidate_email_change();

-- ---------------------------------------------------------------------------
-- BR-7 / BR-8: every unanswered pre-N9 request is ended. Its old link (hash kept, token_issued_at
-- null) shows the existing "expired" state; the recruiter resends from the existing UI.
-- Requests already past their expiry are already ended and left as they are.
-- ---------------------------------------------------------------------------
with expired as (
  update public.referral_candidate_requests q
     set expires_at = now()
    from public.referrals r
   where r.id = q.referral_id
     and r.status = 'awaiting_candidate'
     and q.confirmed_at is null and q.declined_at is null
     and q.token_issued_at is null
     and q.expires_at > now()
  returning q.referral_id, q.organization_id
)
insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, metadata)
select e.organization_id, null, 'referral.candidate_request_invalidated', 'referral', e.referral_id,
       jsonb_build_object('reason', 'n9_token_reset')
  from expired e;

-- ---------------------------------------------------------------------------
-- BR-4: the caller-chosen-token signatures are dropped (not overloaded).
-- ---------------------------------------------------------------------------
drop function public.submit_referral_for_candidate(uuid, uuid, text[], uuid[], text, text, text, integer, boolean);
drop function public.rotate_candidate_request_token(uuid, text, integer);

create function public.submit_referral_for_candidate(
  p_candidate uuid,
  p_job uuid,
  p_fields text[],
  p_document_ids uuid[],
  p_idempotency_key text,
  p_note text default null,
  p_ttl_days integer default 14,
  p_acknowledge_pending boolean default false
) returns table (outcome text, referral_id uuid, created boolean, destination text, reference text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  c public.candidates;
  j public.jobs;
  v_existing uuid;
  v_ref uuid;
  g record;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  -- BR-9: the 30/h submit limit is still consumed before anything else runs (AC-18).
  perform app.enforce_rate_limit('referral.submit', 30, 3600);
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;

  select r.id into v_existing from public.referrals r where r.idempotency_key = p_idempotency_key;
  if v_existing is not null then
    if not app.can_see_referral(v_existing) then raise exception 'forbidden' using errcode = '42501'; end if;
    return query select 'created'::text, v_existing, false, null::text, null::text;
    return;
  end if;

  perform app.assert_referable(p_candidate, p_job, p_fields);
  select * into c from public.candidates where id = p_candidate;
  select * into j from public.jobs where id = p_job;

  if c.email is null or btrim(c.email::text) = '' then
    raise exception 'candidate_email_missing' using errcode = 'P0001';
  end if;
  perform app.assert_documents_shareable(c.id, p_document_ids);

  select * into g from app.submission_gate(c.id, j.id, c.organization_id, j.organization_id, p_acknowledge_pending);
  if g.gate_outcome is not null then
    return query select g.gate_outcome, null::uuid, false, null::text, g.gate_reference;
    return;
  end if;

  -- R2-1: nothing may raise after the gate; races become a returned code.
  begin

  insert into public.referrals (job_id, source_org_id, source_user_id, target_org_id, idempotency_key,
                                job_title_snapshot, candidate_label, status)
  values (j.id, c.organization_id, auth.uid(), j.organization_id, p_idempotency_key, j.title,
          app.referral_label(c.id, p_fields), 'awaiting_candidate')
  returning id into v_ref;

  insert into public.referral_candidate_links (referral_id, candidate_id, organization_id, consent_id)
  values (v_ref, c.id, c.organization_id, null);
  insert into app.referral_presentations (referral_id, source_org_id, target_org_id, job_id, candidate_id)
  values (v_ref, c.organization_id, j.organization_id, j.id, c.id);
  perform app.write_fingerprints(v_ref, c.id);

  -- N9: no usable token yet. issue_candidate_request_token (service role) issues it.
  insert into public.referral_candidate_requests (referral_id, organization_id, candidate_id, channel, destination,
    token_hash, requested_fields, requested_document_ids, note, expires_at)
  values (v_ref, c.organization_id, c.id, 'email', c.email::text, null, p_fields,
          coalesce(p_document_ids, '{}'), nullif(btrim(coalesce(p_note, '')), ''),
          now() + make_interval(days => least(greatest(coalesce(p_ttl_days, 14), 1), 30)));

  insert into public.referral_status_events (referral_id, from_status, to_status, actor_id, actor_side, reason)
  values (v_ref, null, 'awaiting_candidate', auth.uid(), 'source', null);

  perform app.audit(c.organization_id, 'referral.submitted', 'referral', v_ref,
    jsonb_build_object('fields', to_jsonb(p_fields), 'documents', coalesce(cardinality(p_document_ids), 0),
                       'awaiting_candidate', true));
  exception when others then
    return query select app.safe_error_code(sqlstate, sqlerrm), null::uuid, false, null::text, null::text;
    return;
  end;
  return query select 'created'::text, v_ref, true, c.email::text, null::text;
end $$;

-- Resend: authorizes, counts the resend, kills the current link and re-arms the request. The new
-- token comes from issue_candidate_request_token. Returns only the destination.
create function public.rotate_candidate_request_token(p_referral uuid, p_ttl_days integer default 14)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  v_email text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  -- BR-10: counted here, once per resend, so direct PostgREST calls count too.
  perform app.enforce_rate_limit('referral.candidate_resend', 10, 3600);
  select * into r from public.referrals where id = p_referral for update;
  if not found or not app.is_member(r.source_org_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.status <> 'awaiting_candidate' then raise exception 'request_closed' using errcode = 'P0001'; end if;

  select c.email::text into v_email
    from public.referral_candidate_links l join public.candidates c on c.id = l.candidate_id
   where l.referral_id = p_referral;
  if v_email is null or btrim(v_email) = '' then
    raise exception 'candidate_email_missing' using errcode = 'P0001';
  end if;

  update public.referral_candidate_requests
     set token_hash = null, token_issued_at = null, token_issued_by = null, destination = v_email,
         expires_at = now() + make_interval(days => least(greatest(coalesce(p_ttl_days, 14), 1), 30))
   where referral_id = p_referral;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- PD-032 / BR-11: the referral is pending again; its fingerprints are recomputed from the current
  -- candidate row (they may have been purged while the link was expired). No stop check here.
  perform app.write_fingerprints(r.id, (select l.candidate_id from public.referral_candidate_links l where l.referral_id = r.id));
  perform app.audit(r.source_org_id, 'referral.candidate_request_resent', 'referral', r.id, '{}');
  return v_email;
end $$;

-- ---------------------------------------------------------------------------
-- BR-1/BR-2/BR-5: the only place a candidate token is created, and the only place it is returned.
-- service_role only; the Server Action passes the session user as p_actor.
-- ---------------------------------------------------------------------------
create function public.issue_candidate_request_token(p_referral uuid, p_actor uuid)
returns text
language plpgsql security definer set search_path = '' as $$
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
                    and m.status = 'active' and o.suspended_at is null) then
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
end $$;

-- ---------------------------------------------------------------------------
-- Candidate page RPCs. Copied from 20261113000400 (N1) with the N9 changes marked "N9".
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
  v_chk record;
  v_email_changed timestamptz;
  p jsonb := coalesce(p_profile, '{}');
begin
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

  update public.referrals
     set status = 'submitted', version = version + 1, submitted_at = now(),
         ownership_protected_until = now() + interval '12 months'
   where id = r.id;
  insert into public.referral_status_events (referral_id, from_status, to_status, actor_id, actor_side, reason, actor_kind)
  values (r.id, 'awaiting_candidate', 'submitted', null, null, null, 'candidate');

  perform app.deliver_referral(r.id, v_consent, q.requested_fields, q.requested_document_ids, q.note, r.source_user_id, true);

  perform app.notify_org(r.source_org_id, 'referral.candidate_confirmed', 'Candidate confirmed the referral',
    r.job_title_snapshot || ' — sent to ' || v_partner, '/referrals/' || r.id, r.source_user_id);
  perform app.audit(r.source_org_id, 'referral.candidate_confirmed', 'referral', r.id,
    jsonb_build_object('profile_changes', to_jsonb(v_changed), 'token_issued_at', q.token_issued_at));  -- N9 BR-8
  return 'confirmed';
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.submit_referral_for_candidate(uuid, uuid, text[], uuid[], text, text, integer, boolean) from public, anon;
revoke execute on function public.rotate_candidate_request_token(uuid, integer) from public, anon;
grant execute on function public.submit_referral_for_candidate(uuid, uuid, text[], uuid[], text, text, integer, boolean) to authenticated;
grant execute on function public.rotate_candidate_request_token(uuid, integer) to authenticated;

-- BR-2: no PostgREST user role can obtain a token.
revoke execute on function public.issue_candidate_request_token(uuid, uuid) from public, anon, authenticated;
grant execute on function public.issue_candidate_request_token(uuid, uuid) to service_role;

-- The candidate has no account: the token is the credential (unchanged grants).
revoke execute on function public.get_candidate_request(text) from public;
revoke execute on function public.respond_candidate_request(text, boolean, jsonb, text, jsonb) from public;
grant execute on function public.get_candidate_request(text) to anon, authenticated;
grant execute on function public.respond_candidate_request(text, boolean, jsonb, text, jsonb) to anon, authenticated;
