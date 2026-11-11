-- Candidate confirmation of referrals.
--
-- Instead of the sourcing recruiter recording sharing evidence by hand, the candidate can confirm
-- the referral themselves:
--
--   1. The recruiter submits as usual. submit_referral_for_candidate() creates the referral in
--      `awaiting_candidate` and stores a hashed single-purpose token. The app emails the candidate
--      a private link (only the hash is stored; the raw token exists only in that email).
--   2. Until the candidate answers, the referral is invisible to the hiring organization: no
--      snapshot, no documents, no notification, hidden by RLS.
--   3. On the public page the candidate reviews exactly what will be shared, may update their own
--      profile, then confirms or declines (respond_candidate_request, callable with the token only).
--   4. Confirming records a job_sharing consent with the confirmation as evidence, builds the
--      snapshot from the (possibly updated) profile and delivers the referral (`submitted`) to the
--      partner automatically. Declining closes it as `candidate_declined`; the partner never knows.
--
-- The manual path (recruiter-recorded evidence) still goes through submit_referral().

-- ---------------------------------------------------------------------------
-- Requests
-- ---------------------------------------------------------------------------
create table public.referral_candidate_requests (
  referral_id uuid primary key references public.referrals (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  channel text not null default 'email' check (channel in ('email', 'sms')),
  destination text not null check (char_length(destination) <= 320),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  requested_fields text[] not null,
  requested_document_ids uuid[] not null default '{}',
  note text check (char_length(note) <= 4000),
  expires_at timestamptz not null,
  sent_at timestamptz,
  send_count integer not null default 0,
  last_attempt_at timestamptz,
  last_send_error text check (char_length(last_send_error) <= 200),
  viewed_at timestamptz,
  confirmed_at timestamptz,
  declined_at timestamptz,
  decline_reason text check (char_length(decline_reason) <= 1000),
  consent_id uuid references public.candidate_consents (id),
  profile_changes text[] not null default '{}',
  response_meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index referral_candidate_requests_org_idx on public.referral_candidate_requests (organization_id);
create index referral_candidate_requests_candidate_idx on public.referral_candidate_requests (candidate_id);
create trigger referral_candidate_requests_updated_at before update on public.referral_candidate_requests
  for each row execute function app.set_updated_at();

alter table public.referral_candidate_requests enable row level security;
create policy referral_candidate_requests_select on public.referral_candidate_requests for select to authenticated
  using (app.is_member(organization_id));
-- Writes only through the RPCs below. The token hash and response metadata never leave the database.
revoke all on public.referral_candidate_requests from anon, authenticated;
grant select (referral_id, organization_id, candidate_id, channel, destination, requested_fields, requested_document_ids,
              note, expires_at, sent_at, send_count, last_attempt_at, last_send_error, viewed_at, confirmed_at,
              declined_at, decline_reason, consent_id, profile_changes, created_at, updated_at)
  on public.referral_candidate_requests to authenticated;

-- The candidate link exists from submission (duplicate protection, the recruiter's own lists);
-- the consent is attached when the candidate confirms.
alter table public.referral_candidate_links alter column consent_id drop not null;

insert into public.referral_transitions values
  ('awaiting_candidate', 'withdrawn', 'source', false, false);

-- ---------------------------------------------------------------------------
-- Visibility: the hiring organization sees nothing before the candidate confirms.
-- ---------------------------------------------------------------------------
create or replace function app.hidden_from_target(p_status public.referral_status) returns boolean
language sql immutable set search_path = '' as $$
  select p_status in ('awaiting_candidate', 'candidate_declined');
$$;
grant execute on function app.hidden_from_target(public.referral_status) to authenticated;

drop policy referrals_select on public.referrals;
create policy referrals_select on public.referrals for select to authenticated
  using (app.is_member(source_org_id) or (app.is_member(target_org_id) and not app.hidden_from_target(status)));

drop policy referral_profiles_select on public.referral_shared_profiles;
create policy referral_profiles_select on public.referral_shared_profiles for select to authenticated
  using (exists (
    select 1 from public.referrals r where r.id = referral_id
      and (app.is_member(r.source_org_id)
           or (app.is_member(r.target_org_id) and r.sharing_revoked_at is null and not app.hidden_from_target(r.status)))
  ));

create or replace function app.can_see_referral(p_referral uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.referrals r
    where r.id = p_referral
      and (app.is_member(r.source_org_id) or (app.is_member(r.target_org_id) and not app.hidden_from_target(r.status)))
  );
$$;

create or replace function app.referral_side(p_referral uuid) returns public.referral_side
language sql stable security definer set search_path = '' as $$
  select case
    when app.is_member(r.source_org_id) then 'source'::public.referral_side
    when app.is_member(r.target_org_id) and not app.hidden_from_target(r.status) then 'target'::public.referral_side
  end
  from public.referrals r where r.id = p_referral;
$$;

create or replace function app.acting_side(p_referral uuid, p_acting_org uuid) returns public.referral_side
language sql stable security definer set search_path = '' as $$
  select case
    when p_acting_org is null or not app.is_member(p_acting_org) then null
    when p_acting_org = r.source_org_id then 'source'::public.referral_side
    when p_acting_org = r.target_org_id and not app.hidden_from_target(r.status) then 'target'::public.referral_side
  end
  from public.referrals r where r.id = p_referral;
$$;
revoke execute on function app.acting_side(uuid, uuid) from public, anon, authenticated;

-- Withdrawing a referral the partner never saw must not notify the partner.
create or replace function public.transition_referral(
  p_referral uuid, p_to public.referral_status, p_reason text, p_expected_version integer,
  p_acting_org uuid default null
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  t public.referral_transitions;
  v_side public.referral_side;
  v_other uuid;
begin
  select * into r from public.referrals where id = p_referral for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  if p_acting_org is not null then
    v_side := app.acting_side(p_referral, p_acting_org);
  elsif app.is_member(r.source_org_id) and app.is_member(r.target_org_id) then
    select actor_side into v_side from public.referral_transitions
     where from_status = r.status and to_status = p_to;
    v_side := coalesce(v_side, 'source');
  else
    v_side := app.referral_side(p_referral);
  end if;
  if v_side is null then raise exception 'forbidden' using errcode = '42501'; end if;

  if r.version <> p_expected_version then
    raise exception 'stale_version' using errcode = 'P0001';
  end if;

  select * into t from public.referral_transitions
   where from_status = r.status and to_status = p_to and actor_side = v_side;
  if not found then
    raise exception 'invalid_transition: % -> % by %', r.status, p_to, v_side using errcode = 'P0001';
  end if;
  if t.requires_reason and coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if t.requires_active_agreement and not exists (
    select 1 from public.collaboration_agreements a where a.referral_id = r.id and a.status = 'active'
  ) then
    raise exception 'agreement_required' using errcode = 'P0001';
  end if;

  update public.referrals
     set status = p_to, version = version + 1,
         decided_at = case when p_to in ('accepted', 'declined') then now() else decided_at end
   where id = r.id;

  insert into public.referral_status_events (referral_id, from_status, to_status, actor_id, actor_side, reason)
  values (r.id, r.status, p_to, auth.uid(), v_side, left(p_reason, 2000));

  if p_to = 'accepted' then
    perform app.create_agreement_for_referral(r.id);
  end if;

  if not app.hidden_from_target(r.status) then
    v_other := case when v_side = 'source' then r.target_org_id else r.source_org_id end;
    perform app.notify_org(v_other, 'referral.status', 'Referral update: ' || replace(p_to::text, '_', ' '),
      r.job_title_snapshot || ' — ' || r.candidate_label, '/referrals/' || r.id);
  end if;
  perform app.audit(case when v_side = 'source' then r.source_org_id else r.target_org_id end,
    'referral.transition', 'referral', r.id, jsonb_build_object('from', r.status, 'to', p_to));
  return r.version + 1;
end $$;

-- ---------------------------------------------------------------------------
-- Shared building blocks
-- ---------------------------------------------------------------------------

-- Checks that the caller may refer this candidate to this job right now. Locks the candidate row.
create or replace function app.assert_referable(p_candidate uuid, p_job uuid, p_fields text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.candidates;
  j public.jobs;
  v_allowed text[] := array['full_name','email','phone','headline','summary','location','seniority','skills',
                            'languages','work_arrangements','salary_expectation','availability','experience'];
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

  -- One live referral per candidate & job (a referral awaiting the candidate counts as live).
  if exists (
    select 1 from public.referral_candidate_links l join public.referrals r on r.id = l.referral_id
    where l.candidate_id = c.id and r.job_id = j.id
      and r.status not in ('declined', 'withdrawn', 'rejected', 'cancelled', 'candidate_declined')
  ) then
    raise exception 'duplicate_referral' using errcode = '23505';
  end if;
end $$;
revoke execute on function app.assert_referable(uuid, uuid, text[]) from public, anon, authenticated;

create or replace function app.referral_label(p_candidate uuid, p_fields text[]) returns text
language sql stable security definer set search_path = '' as $$
  select left(concat_ws(' · ',
    coalesce(case when 'headline' = any(p_fields) then c.headline end, initcap(coalesce(c.seniority::text, '')) || ' candidate'),
    case when 'location' = any(p_fields) then nullif(concat_ws(', ', c.location_city, c.location_region), '') end), 200)
  from public.candidates c where c.id = p_candidate;
$$;
revoke execute on function app.referral_label(uuid, text[]) from public, anon, authenticated;

-- Makes a referral visible to the hiring side: consent link, immutable snapshot, document grants,
-- the recruiter's note, notification and audit. Status changes and events stay with the callers.
create or replace function app.deliver_referral(
  p_referral uuid, p_consent uuid, p_fields text[], p_document_ids uuid[], p_note text, p_author uuid,
  p_skip_unavailable_documents boolean default false
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  v_candidate uuid;
  v_doc public.candidate_documents;
  v_doc_id uuid;
  v_granted integer := 0;
begin
  select * into r from public.referrals where id = p_referral;
  select candidate_id into v_candidate from public.referral_candidate_links where referral_id = p_referral;

  update public.referral_candidate_links set consent_id = p_consent where referral_id = p_referral;
  update public.referrals set candidate_label = app.referral_label(v_candidate, p_fields) where id = p_referral;

  insert into public.referral_shared_profiles (referral_id, disclosed_fields, snapshot)
  values (p_referral, p_fields, app.build_shared_snapshot(v_candidate, p_fields));

  foreach v_doc_id in array coalesce(p_document_ids, '{}') loop
    select * into v_doc from public.candidate_documents
     where id = v_doc_id and candidate_id = v_candidate and deleted_at is null and scan_status = 'clean';
    if not found then
      if p_skip_unavailable_documents then continue; end if;
      raise exception 'document_not_shareable' using errcode = 'P0001';
    end if;
    with g as (
      insert into public.referral_document_grants (referral_id, file_name, mime_type, size_bytes)
      values (p_referral, v_doc.file_name, v_doc.mime_type, v_doc.size_bytes) returning id
    )
    insert into public.referral_document_sources (grant_id, candidate_document_id, organization_id)
    select g.id, v_doc.id, r.source_org_id from g;
    v_granted := v_granted + 1;
  end loop;
  if v_granted > 0 then
    perform app.enqueue('referral.copy_documents', p_referral::text, jsonb_build_object('referral_id', p_referral));
  end if;

  if p_note is not null and btrim(p_note) <> '' then
    insert into public.referral_messages (referral_id, author_id, author_side, body)
    values (p_referral, p_author, 'source', left(p_note, 4000));
  end if;

  perform app.notify_org(r.target_org_id, 'referral.received', 'New candidate submission',
    'A partner recruiter submitted a candidate for ' || r.job_title_snapshot, '/referrals/' || p_referral);
  perform app.audit(r.target_org_id, 'referral.received', 'referral', p_referral, '{}');
end $$;
revoke execute on function app.deliver_referral(uuid, uuid, text[], uuid[], text, uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Manual path (recruiter-recorded authorization): same behaviour as before.
-- ---------------------------------------------------------------------------
create or replace function public.submit_referral(
  p_candidate uuid,
  p_job uuid,
  p_fields text[],
  p_document_ids uuid[],
  p_consent uuid,
  p_idempotency_key text,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c public.candidates;
  j public.jobs;
  k public.candidate_consents;
  v_existing uuid;
  v_ref uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;

  select id into v_existing from public.referrals where idempotency_key = p_idempotency_key;
  if v_existing is not null then
    if not app.can_see_referral(v_existing) then raise exception 'forbidden' using errcode = '42501'; end if;
    return v_existing;
  end if;

  perform app.assert_referable(p_candidate, p_job, p_fields);
  select * into c from public.candidates where id = p_candidate;
  select * into j from public.jobs where id = p_job;

  select * into k from public.candidate_consents where id = p_consent;
  if not found or k.candidate_id <> c.id or k.kind <> 'job_sharing' or k.job_id <> j.id
     or k.revoked_at is not null or (k.expires_at is not null and k.expires_at < now()) then
    raise exception 'sharing_authorization_missing' using errcode = 'P0001';
  end if;

  insert into public.referrals (job_id, source_org_id, source_user_id, target_org_id, idempotency_key,
                                job_title_snapshot, candidate_label)
  values (j.id, c.organization_id, auth.uid(), j.organization_id, p_idempotency_key, j.title,
          app.referral_label(c.id, p_fields))
  returning id into v_ref;

  insert into public.referral_candidate_links (referral_id, candidate_id, organization_id, consent_id)
  values (v_ref, c.id, c.organization_id, k.id);

  insert into public.referral_status_events (referral_id, from_status, to_status, actor_id, actor_side, reason)
  values (v_ref, null, 'submitted', auth.uid(), 'source', left(p_note, 2000));

  perform app.deliver_referral(v_ref, k.id, p_fields, p_document_ids, p_note, auth.uid());
  perform app.audit(c.organization_id, 'referral.submitted', 'referral', v_ref,
    jsonb_build_object('fields', to_jsonb(p_fields), 'documents', coalesce(cardinality(p_document_ids), 0)));
  return v_ref;
end $$;

-- ---------------------------------------------------------------------------
-- Candidate-confirmed path
-- ---------------------------------------------------------------------------
create or replace function public.submit_referral_for_candidate(
  p_candidate uuid,
  p_job uuid,
  p_fields text[],
  p_document_ids uuid[],
  p_idempotency_key text,
  p_token_hash text,
  p_note text default null,
  p_ttl_days integer default 14
) returns table (referral_id uuid, created boolean, destination text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  c public.candidates;
  j public.jobs;
  v_existing uuid;
  v_ref uuid;
  v_doc_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_token' using errcode = '22023';
  end if;

  select r.id into v_existing from public.referrals r where r.idempotency_key = p_idempotency_key;
  if v_existing is not null then
    if not app.can_see_referral(v_existing) then raise exception 'forbidden' using errcode = '42501'; end if;
    return query select v_existing, false, null::text;
    return;
  end if;

  perform app.assert_referable(p_candidate, p_job, p_fields);
  select * into c from public.candidates where id = p_candidate;
  select * into j from public.jobs where id = p_job;

  if c.email is null or btrim(c.email::text) = '' then
    raise exception 'candidate_email_missing' using errcode = 'P0001';
  end if;
  if coalesce(cardinality(p_document_ids), 0) > 5 then
    raise exception 'document_not_shareable' using errcode = 'P0001';
  end if;
  foreach v_doc_id in array coalesce(p_document_ids, '{}') loop
    if not exists (select 1 from public.candidate_documents d
                    where d.id = v_doc_id and d.candidate_id = c.id and d.deleted_at is null and d.scan_status = 'clean') then
      raise exception 'document_not_shareable' using errcode = 'P0001';
    end if;
  end loop;

  insert into public.referrals (job_id, source_org_id, source_user_id, target_org_id, idempotency_key,
                                job_title_snapshot, candidate_label, status)
  values (j.id, c.organization_id, auth.uid(), j.organization_id, p_idempotency_key, j.title,
          app.referral_label(c.id, p_fields), 'awaiting_candidate')
  returning id into v_ref;

  insert into public.referral_candidate_links (referral_id, candidate_id, organization_id, consent_id)
  values (v_ref, c.id, c.organization_id, null);

  insert into public.referral_candidate_requests (referral_id, organization_id, candidate_id, channel, destination,
    token_hash, requested_fields, requested_document_ids, note, expires_at)
  values (v_ref, c.organization_id, c.id, 'email', c.email::text, p_token_hash, p_fields,
          coalesce(p_document_ids, '{}'), nullif(btrim(coalesce(p_note, '')), ''),
          now() + make_interval(days => least(greatest(coalesce(p_ttl_days, 14), 1), 30)));

  insert into public.referral_status_events (referral_id, from_status, to_status, actor_id, actor_side, reason)
  values (v_ref, null, 'awaiting_candidate', auth.uid(), 'source', null);

  perform app.audit(c.organization_id, 'referral.submitted', 'referral', v_ref,
    jsonb_build_object('fields', to_jsonb(p_fields), 'documents', coalesce(cardinality(p_document_ids), 0),
                       'awaiting_candidate', true));
  return query select v_ref, true, c.email::text;
end $$;

-- New link for a pending request (resend). The previous link stops working.
create or replace function public.rotate_candidate_request_token(p_referral uuid, p_token_hash text, p_ttl_days integer default 14)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  v_email text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_token' using errcode = '22023';
  end if;
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
     set token_hash = p_token_hash, destination = v_email,
         expires_at = now() + make_interval(days => least(greatest(coalesce(p_ttl_days, 14), 1), 30))
   where referral_id = p_referral;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform app.audit(r.source_org_id, 'referral.candidate_request_resent', 'referral', r.id, '{}');
  return v_email;
end $$;

create or replace function public.record_candidate_request_delivery(p_referral uuid, p_ok boolean, p_error text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.referral_candidate_requests
     set sent_at = case when p_ok then now() else sent_at end,
         send_count = send_count + case when p_ok then 1 else 0 end,
         last_attempt_at = now(),
         last_send_error = case when p_ok then null else left(coalesce(p_error, 'failed'), 200) end
   where referral_id = p_referral and app.is_member(organization_id);
end $$;

-- Public read for the candidate's page. Returns null for unknown tokens. Only a pending request
-- exposes profile data; answered / expired / closed ones return just enough to explain the state.
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
      'available_from', c.available_from
    )
  );
end $$;

-- The candidate's answer. p_profile holds only the fields the candidate may edit (validated by
-- the app as well); keys that are absent are left untouched. Returns the resulting state.
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
                             'salary_expectation_max','salary_currency','available_from'];
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

  -- Answering twice is a no-op that reports the first answer.
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

  -- The job or the candidate may have changed since the recruiter submitted.
  select * into j from public.jobs where id = r.job_id;
  if j.status <> 'active' or not j.accepts_external_referrals
     or exists (select 1 from public.organizations o where o.id = j.organization_id and o.suspended_at is not null) then
    raise exception 'job_not_open_for_referrals' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.candidates c where c.id = q.candidate_id and c.status = 'active_for_matching') then
    raise exception 'candidate_not_active' using errcode = 'P0001';
  end if;

  -- Profile updates (only editable keys that are present).
  select to_jsonb(c) into v_before from public.candidates c where c.id = q.candidate_id for update;
  update public.candidates c set
    full_name = case when p ? 'full_name' and nullif(btrim(p->>'full_name'), '') is not null then left(btrim(p->>'full_name'), 160) else c.full_name end,
    phone = case when p ? 'phone' then nullif(left(btrim(coalesce(p->>'phone', '')), 40), '') else c.phone end,
    headline = case when p ? 'headline' then nullif(left(btrim(coalesce(p->>'headline', '')), 200), '') else c.headline end,
    summary = case when p ? 'summary' then nullif(left(btrim(coalesce(p->>'summary', '')), 5000), '') else c.summary end,
    location_city = case when p ? 'location_city' then nullif(left(btrim(coalesce(p->>'location_city', '')), 100), '') else c.location_city end,
    location_region = case when p ? 'location_region' then nullif(left(btrim(coalesce(p->>'location_region', '')), 100), '') else c.location_region end,
    location_country = case when p ? 'location_country' then nullif(upper(btrim(coalesce(p->>'location_country', ''))), '') else c.location_country end,
    open_to_relocation = case when p ? 'open_to_relocation' then coalesce((p->>'open_to_relocation')::boolean, false) else c.open_to_relocation end,
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

revoke execute on function public.submit_referral_for_candidate(uuid, uuid, text[], uuid[], text, text, text, integer) from public, anon;
revoke execute on function public.rotate_candidate_request_token(uuid, text, integer) from public, anon;
revoke execute on function public.record_candidate_request_delivery(uuid, boolean, text) from public, anon;
grant execute on function public.submit_referral_for_candidate(uuid, uuid, text[], uuid[], text, text, text, integer) to authenticated;
grant execute on function public.rotate_candidate_request_token(uuid, text, integer) to authenticated;
grant execute on function public.record_candidate_request_delivery(uuid, boolean, text) to authenticated;

-- The candidate has no account: the token is the credential.
revoke execute on function public.get_candidate_request(text) from public;
revoke execute on function public.respond_candidate_request(text, boolean, jsonb, text, jsonb) from public;
grant execute on function public.get_candidate_request(text) to anon, authenticated;
grant execute on function public.respond_candidate_request(text, boolean, jsonb, text, jsonb) to anon, authenticated;
