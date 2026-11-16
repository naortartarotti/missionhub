-- N1 part 4 of 7: the check on both submit paths and at delivery, release, decline reasons.
--
-- * Submit RPCs return an outcome instead of raising on a stop (EC-1), so the sticky stop and
--   the audit event persist: created | stopped | pending_warning | identifier_required.
--   Real precondition failures (inactive candidate, closed job, missing authorization, live
--   duplicate of the same record) still raise, before the check runs (BR-22).
-- * The pending warning is a two-step submit: p_acknowledge_pending = true on the second call,
--   which re-runs the full check.
-- * Check and delivery are serialised per hiring org with a transaction-level advisory lock (EC-3).
-- * Identifiers are only ever read from the stored candidate row; no argument carries a hash or a
--   normalised identifier (BR-1). Extra or forged arguments can't change the outcome.

-- The hiring side never sees a referral closed as already presented.
create or replace function app.hidden_from_target(p_status public.referral_status) returns boolean
language sql immutable set search_path = '' as $$
  select p_status in ('awaiting_candidate', 'candidate_declined', 'already_presented');
$$;

-- ---------------------------------------------------------------------------
-- Notifications to the submitter, falling back to the org admins when the submitter is no longer
-- an active member (PD-026).
-- ---------------------------------------------------------------------------
create or replace function app.notify_submitter(p_referral uuid, p_kind text, p_title text, p_body text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
begin
  select * into r from public.referrals where id = p_referral;
  if exists (select 1 from public.organization_memberships m
              where m.organization_id = r.source_org_id and m.user_id = r.source_user_id and m.status = 'active') then
    perform app.notify_org(r.source_org_id, p_kind, p_title, p_body, '/referrals/' || r.id, r.source_user_id);
  else
    insert into public.notifications (user_id, organization_id, kind, title, body, link)
    select m.user_id, r.source_org_id, p_kind, p_title, p_body, '/referrals/' || r.id
      from public.organization_memberships m
     where m.organization_id = r.source_org_id and m.status = 'active' and m.role = 'org_admin';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Preconditions (unchanged except that `already_presented` is not a live referral).
-- ---------------------------------------------------------------------------
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
      and r.status not in ('declined', 'withdrawn', 'rejected', 'cancelled', 'candidate_declined', 'already_presented')
  ) then
    raise exception 'duplicate_referral' using errcode = '23505';
  end if;
end $$;

create or replace function app.assert_documents_shareable(p_candidate uuid, p_document_ids uuid[]) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_doc_id uuid;
begin
  if coalesce(cardinality(p_document_ids), 0) > 5 then
    raise exception 'document_not_shareable' using errcode = 'P0001';
  end if;
  foreach v_doc_id in array coalesce(p_document_ids, '{}') loop
    if not exists (select 1 from public.candidate_documents d
                    where d.id = v_doc_id and d.candidate_id = p_candidate and d.deleted_at is null and d.scan_status = 'clean') then
      raise exception 'document_not_shareable' using errcode = 'P0001';
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Delivery: as before, plus delivered_at, the frozen claim deadline, the client-key snapshot and
-- fingerprints recomputed from the identifiers as they are now (BR-8, BR-23, BR-28).
-- Callers hold the hiring-org lock and have run the check.
-- ---------------------------------------------------------------------------
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
  update public.referrals
     set candidate_label = app.referral_label(v_candidate, p_fields),
         delivered_at = now(),
         claim_deadline_at = app.add_business_days(now(), 5)
   where id = p_referral;

  update app.referral_presentations
     set client_key = (select k.client_key from app.job_client_keys k where k.job_id = r.job_id)
   where referral_id = p_referral;
  perform app.write_fingerprints(p_referral, v_candidate);

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

-- Runs the check under the hiring-org lock and turns a non-clear result into a recorded outcome.
-- Returns (outcome, reference); outcome null means "go ahead".
create or replace function app.submission_gate(
  p_candidate uuid, p_job uuid, p_source_org uuid, p_target_org uuid, p_acknowledge_pending boolean
) returns table (gate_outcome text, gate_reference text)
language plpgsql security definer set search_path = '' as $$
declare
  chk record;
  v_ref text;
begin
  perform app.lock_hiring_org(p_target_org);
  select * into chk from app.presentation_check(p_candidate, p_job, null);
  if chk.outcome = 'identifier_required' then
    perform app.record_presentation_outcome(p_source_org, p_target_org, p_job, p_candidate, null, 'identifier_required', null, null);
    return query select 'identifier_required'::text, null::text;
  elsif chk.outcome in ('stop', 'sticky') then
    v_ref := app.record_presentation_outcome(p_source_org, p_target_org, p_job, p_candidate, null, chk.outcome, chk.scope, chk.earlier_internal);
    return query select 'stopped'::text, v_ref;
  elsif chk.outcome = 'pending' and not coalesce(p_acknowledge_pending, false) then
    perform app.record_presentation_outcome(p_source_org, p_target_org, p_job, p_candidate, null, 'warn', chk.scope, chk.earlier_internal);
    return query select 'pending_warning'::text, null::text;
  else
    return query select null::text, null::text;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Recorded-authorization path. The authorization is either an existing job_sharing consent
-- (p_consent) or a new one (p_new_consent = {legal_basis, scope, evidence}) that is recorded
-- here only after the check passes, so a stop leaves nothing behind.
-- ---------------------------------------------------------------------------
drop function public.submit_referral(uuid, uuid, text[], uuid[], uuid, text, text);
create function public.submit_referral(
  p_candidate uuid,
  p_job uuid,
  p_fields text[],
  p_document_ids uuid[],
  p_consent uuid,
  p_idempotency_key text,
  p_note text default null,
  p_acknowledge_pending boolean default false,
  p_new_consent jsonb default null
) returns table (outcome text, referral_id uuid, reference text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  c public.candidates;
  j public.jobs;
  k public.candidate_consents;
  v_existing uuid;
  v_ref uuid;
  v_consent uuid;
  v_basis text;
  v_scope text;
  v_evidence text;
  g record;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;

  select r.id into v_existing from public.referrals r where r.idempotency_key = p_idempotency_key;
  if v_existing is not null then
    if not app.can_see_referral(v_existing) then raise exception 'forbidden' using errcode = '42501'; end if;
    return query select 'created'::text, v_existing, null::text;
    return;
  end if;

  perform app.assert_referable(p_candidate, p_job, p_fields);
  select * into c from public.candidates where id = p_candidate;
  select * into j from public.jobs where id = p_job;

  if p_consent is not null then
    select * into k from public.candidate_consents where id = p_consent;
    if not found or k.candidate_id <> c.id or k.kind <> 'job_sharing' or k.job_id <> j.id
       or k.revoked_at is not null or (k.expires_at is not null and k.expires_at < now()) then
      raise exception 'sharing_authorization_missing' using errcode = 'P0001';
    end if;
    v_consent := k.id;
  elsif p_new_consent is not null and jsonb_typeof(p_new_consent) = 'object' then
    v_basis := coalesce(nullif(p_new_consent->>'legal_basis', ''), 'consent');
    v_scope := btrim(coalesce(p_new_consent->>'scope', ''));
    v_evidence := btrim(coalesce(p_new_consent->>'evidence', ''));
    if v_basis not in ('consent', 'contract', 'legitimate_interest', 'other_documented')
       or char_length(v_scope) not between 1 and 1000 or char_length(v_evidence) not between 5 and 2000 then
      raise exception 'sharing_authorization_missing' using errcode = 'P0001';
    end if;
  else
    raise exception 'sharing_authorization_missing' using errcode = 'P0001';
  end if;
  perform app.assert_documents_shareable(c.id, p_document_ids);

  select * into g from app.submission_gate(c.id, j.id, c.organization_id, j.organization_id, p_acknowledge_pending);
  if g.gate_outcome is not null then
    return query select g.gate_outcome, null::uuid, g.gate_reference;
    return;
  end if;

  if v_consent is null then
    insert into public.candidate_consents (organization_id, candidate_id, kind, job_id, legal_basis, scope, evidence, recorded_by)
    values (c.organization_id, c.id, 'job_sharing', j.id, v_basis::public.legal_basis, v_scope, v_evidence, auth.uid())
    returning id into v_consent;
  end if;

  insert into public.referrals (job_id, source_org_id, source_user_id, target_org_id, idempotency_key,
                                job_title_snapshot, candidate_label)
  values (j.id, c.organization_id, auth.uid(), j.organization_id, p_idempotency_key, j.title,
          app.referral_label(c.id, p_fields))
  returning id into v_ref;

  insert into public.referral_candidate_links (referral_id, candidate_id, organization_id, consent_id)
  values (v_ref, c.id, c.organization_id, v_consent);
  insert into app.referral_presentations (referral_id, source_org_id, target_org_id, job_id, candidate_id)
  values (v_ref, c.organization_id, j.organization_id, j.id, c.id);

  insert into public.referral_status_events (referral_id, from_status, to_status, actor_id, actor_side, reason)
  values (v_ref, null, 'submitted', auth.uid(), 'source', left(p_note, 2000));

  perform app.deliver_referral(v_ref, v_consent, p_fields, p_document_ids, p_note, auth.uid());
  perform app.audit(c.organization_id, 'referral.submitted', 'referral', v_ref,
    jsonb_build_object('fields', to_jsonb(p_fields), 'documents', coalesce(cardinality(p_document_ids), 0)));
  return query select 'created'::text, v_ref, null::text;
end $$;

-- ---------------------------------------------------------------------------
-- Candidate-confirmed path: the referral waits in awaiting_candidate (pending, BR-5) with its
-- fingerprints, and is checked again when the candidate confirms.
-- ---------------------------------------------------------------------------
drop function public.submit_referral_for_candidate(uuid, uuid, text[], uuid[], text, text, text, integer);
create function public.submit_referral_for_candidate(
  p_candidate uuid,
  p_job uuid,
  p_fields text[],
  p_document_ids uuid[],
  p_idempotency_key text,
  p_token_hash text,
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
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_token' using errcode = '22023';
  end if;
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
  return query select 'created'::text, v_ref, true, c.email::text, null::text;
end $$;

-- ---------------------------------------------------------------------------
-- Release (BR-25, RD-019, PD-021). Guards for both entry points: delivered, still counts (BR-4),
-- no open dispute on the referral or on a placement from it. Sourcing side only.
-- ---------------------------------------------------------------------------
create or replace function app.release_allowed(p_referral uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.referrals r where r.id = p_referral and r.delivered_at is not null)
     and app.presentation_counts(p_referral)
     and not exists (select 1 from public.disputes d where d.referral_id = p_referral and d.status = 'open')
     and not exists (select 1 from public.disputes d join public.placements p on p.id = d.placement_id
                      where p.referral_id = p_referral and d.status = 'open');
$$;

create or replace function app.apply_release(p_referral uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  update app.referral_presentations
     set released_at = now(), released_by = auth.uid(), void_reason = 'released', voided_at = now()
   where referral_id = p_referral and void_reason is null
  returning source_org_id into v_org;
  if v_org is null then raise exception 'release_not_allowed' using errcode = 'P0001'; end if;
  -- Source org only; no notification to the hiring side (BR-25).
  perform app.audit(v_org, 'referral.released', 'referral', p_referral, '{}');
end $$;

-- Withdraw, optionally releasing in the same transaction (entry point 1). Without p_release this is
-- exactly transition_referral(..., 'withdrawn', ...).
create or replace function public.withdraw_referral(
  p_referral uuid, p_reason text, p_expected_version integer, p_release boolean default false, p_acting_org uuid default null
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  v_version integer;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select * into r from public.referrals where id = p_referral for update;
  if not found or not app.is_member(r.source_org_id)
     or (p_acting_org is not null and p_acting_org <> r.source_org_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if coalesce(p_release, false) and not app.release_allowed(r.id) then
    raise exception 'release_not_allowed' using errcode = 'P0001';
  end if;
  v_version := public.transition_referral(p_referral, 'withdrawn', p_reason, p_expected_version, r.source_org_id);
  if coalesce(p_release, false) then perform app.apply_release(p_referral); end if;
  return v_version;
end $$;

-- Release later (entry point 2): only on a referral that is already withdrawn or cancelled.
create or replace function public.release_referral(p_referral uuid, p_acting_org uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select * into r from public.referrals where id = p_referral for update;
  if not found or not app.is_member(r.source_org_id)
     or (p_acting_org is not null and p_acting_org <> r.source_org_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if r.status not in ('withdrawn', 'cancelled') or not app.release_allowed(r.id) then
    raise exception 'release_not_allowed' using errcode = 'P0001';
  end if;
  perform app.apply_release(r.id);
end $$;

-- ---------------------------------------------------------------------------
-- Decline reasons (BR-11): `duplicate` is no longer accepted; `prior_presentation` only via a claim.
-- ---------------------------------------------------------------------------
create or replace function public.review_referral(
  p_referral uuid, p_to public.referral_status, p_reason_code text, p_note text, p_expected_version integer,
  p_acting_org uuid default null
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_version integer;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_to = 'declined' then
    if p_reason_code is null or p_reason_code not in
       ('salary', 'skills', 'seniority', 'location', 'availability', 'position_filled', 'other') then
      raise exception 'reason_required' using errcode = '22023';
    end if;
    if p_reason_code = 'other' and v_note is null then
      raise exception 'reason_required' using errcode = '22023';
    end if;
  end if;
  v_version := public.transition_referral(p_referral, p_to, coalesce(v_note, nullif(p_reason_code, '')), p_expected_version, p_acting_org);
  if p_to = 'declined' then
    update public.referrals set decline_reason = p_reason_code where id = p_referral;
  end if;
  return v_version;
end $$;

-- ---------------------------------------------------------------------------
-- Candidate page: `already_sent` state, and the delivery re-check at confirmation (BR-8).
-- Copied from 20261111000400 with the N1 changes marked by comments.
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
  insert into public.referral_status_events (referral_id, from_status, to_status, actor_id, actor_side, reason, actor_kind)
  values (r.id, 'awaiting_candidate', 'submitted', null, null, null, 'candidate');

  perform app.deliver_referral(r.id, v_consent, q.requested_fields, q.requested_document_ids, q.note, r.source_user_id, true);

  perform app.notify_org(r.source_org_id, 'referral.candidate_confirmed', 'Candidate confirmed the referral',
    r.job_title_snapshot || ' — sent to ' || v_partner, '/referrals/' || r.id, r.source_user_id);
  perform app.audit(r.source_org_id, 'referral.candidate_confirmed', 'referral', r.id,
    jsonb_build_object('profile_changes', to_jsonb(v_changed)));
  return 'confirmed';
end $$;


-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function
  app.notify_submitter(uuid, text, text, text), app.assert_referable(uuid, uuid, text[]),
  app.assert_documents_shareable(uuid, uuid[]),
  app.deliver_referral(uuid, uuid, text[], uuid[], text, uuid, boolean),
  app.submission_gate(uuid, uuid, uuid, uuid, boolean), app.release_allowed(uuid), app.apply_release(uuid)
from public, anon, authenticated;

revoke execute on function
  public.submit_referral(uuid, uuid, text[], uuid[], uuid, text, text, boolean, jsonb),
  public.submit_referral_for_candidate(uuid, uuid, text[], uuid[], text, text, text, integer, boolean),
  public.withdraw_referral(uuid, text, integer, boolean, uuid),
  public.release_referral(uuid, uuid)
from public, anon;
grant execute on function
  public.submit_referral(uuid, uuid, text[], uuid[], uuid, text, text, boolean, jsonb),
  public.submit_referral_for_candidate(uuid, uuid, text[], uuid[], text, text, text, integer, boolean),
  public.withdraw_referral(uuid, text, integer, boolean, uuid),
  public.release_referral(uuid, uuid)
to authenticated;

-- The candidate has no account: the token is the credential (unchanged grants).
revoke execute on function public.get_candidate_request(text) from public;
revoke execute on function public.respond_candidate_request(text, boolean, jsonb, text, jsonb) from public;
grant execute on function public.get_candidate_request(text) to anon, authenticated;
grant execute on function public.respond_candidate_request(text, boolean, jsonb, text, jsonb) to anon, authenticated;
