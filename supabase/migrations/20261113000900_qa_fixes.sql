-- N1 QA fixes (qa-report.md B-1, m-2, m-3, m-4, m-5). Applied migrations are not edited.
--
-- B-1  Rate limits enforced in the database, same buckets as the Server Actions (which no longer
--      consume them for these calls, so nothing is counted twice): submissions 30/h
--      (`referral.submit`, both submit RPCs, before any check), objections 10/h (`referral.claim`),
--      contests 5/h (`dispute.open`, shared with placement disputes), uploads 30/h in the storage
--      insert policy (`storage.claim_evidence`). Over the limit: error `rate_limited`.
-- m-2  An acknowledged pending hit is still logged (hit outcome `warn_ack`, platform audit).
-- m-3  Objects in `claim-evidence` that were never registered are purged after 24 h.
-- m-4  add_business_days fails loudly (`holiday_calendar_exhausted`) past the seeded years.
-- m-5  The support reference is 8 random digits, unique, stored on the admin-only hit row and in the
--      platform-only audit event; it no longer derives from the global audit sequence.

create or replace function app.enforce_rate_limit(p_bucket text, p_limit integer, p_window integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.consume_rate_limit(p_bucket, p_limit, p_window) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
end $$;
revoke execute on function app.enforce_rate_limit(text, integer, integer) from public, anon, authenticated;

-- m-5 / m-2: hit log changes.
alter table app.presentation_hits add column reference text check (reference ~ '^[0-9]{8}$');
create unique index presentation_hits_reference_idx on app.presentation_hits (reference) where reference is not null;
alter table app.presentation_hits drop constraint presentation_hits_outcome_check;
alter table app.presentation_hits add constraint presentation_hits_outcome_check
  check (outcome in ('stop', 'sticky', 'warn', 'warn_ack', 'closure', 'identifier_required'));

create or replace function app.record_presentation_outcome(
  p_source_org uuid, p_target_org uuid, p_job uuid, p_candidate uuid, p_referral uuid,
  p_outcome text, p_scope text, p_internal boolean
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_hit uuid;
  v_key text;
  v_audit bigint;
  v_ref text;
  v_try integer := 0;
  v_action text := case p_outcome
    when 'stop' then 'referral.submission_stopped'
    when 'sticky' then 'referral.submission_stopped'
    when 'warn' then 'referral.pending_warning'
    when 'identifier_required' then 'referral.identifier_required'
    when 'closure' then 'referral.closed_already_presented' end;
begin
  -- Member-visible event (empty metadata). Acknowledged pending hits have none: the
  -- `referral.submitted` event that follows covers the member side.
  if v_action is not null then
    insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (p_source_org, auth.uid(), v_action,
            case when p_outcome = 'closure' then 'referral' else 'job' end,
            case when p_outcome = 'closure' then p_referral else p_job end, '{}')
    returning id into v_audit;
  end if;

  loop
    -- Opaque support reference for stops: 8 random digits, unique among hits (retried on collision).
    v_ref := case when p_outcome in ('stop', 'sticky') then
      lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 100000000)::text, 8, '0') end;
    begin
      insert into app.presentation_hits (source_org_id, source_user_id, target_org_id, job_id, referral_id, outcome, scope,
                                         earlier_internal, audit_event_id, reference)
      values (p_source_org, auth.uid(), p_target_org, p_job, p_referral, p_outcome, p_scope, p_internal, v_audit, v_ref)
      returning id into v_hit;
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try >= 20 then raise; end if;
    end;
  end loop;

  if p_outcome in ('stop', 'closure') then
    select k.client_key into v_key from app.job_client_keys k where k.job_id = p_job;
    insert into app.sticky_stops (candidate_id, source_org_id, target_org_id, job_id, client_key, reason, expires_at)
    values (p_candidate, p_source_org, p_target_org, p_job, v_key,
            case when p_outcome = 'stop' then 'stop' else 'already_presented' end, now() + interval '30 days');
  end if;

  if p_outcome = 'sticky' then
    perform app.audit(null, 'referral.sticky_stop', 'job', p_job, jsonb_build_object('hit', v_hit, 'reference', v_ref));
  elsif p_outcome in ('stop', 'warn', 'warn_ack', 'closure') then
    perform app.audit(null, 'referral.fingerprint_hit', 'job', p_job,
      jsonb_strip_nulls(jsonb_build_object('hit', v_hit, 'scope', p_scope, 'outcome', p_outcome, 'reference', v_ref)));
  end if;
  return v_ref;
end $$;

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
  elsif chk.outcome = 'pending' then
    -- Acknowledged pending hit (m-2): still a hit, audited for admins; the submission goes ahead.
    perform app.record_presentation_outcome(p_source_org, p_target_org, p_job, p_candidate, null, 'warn_ack', chk.scope, chk.earlier_internal);
    return query select null::text, null::text;
  else
    return query select null::text, null::text;
  end if;
end $$;

create or replace function public.submit_referral(
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
  -- Same bucket as the Server Action used to consume (B-1): direct PostgREST calls are limited
  -- too, and the limit is checked before anything else runs (AC-18).
  perform app.enforce_rate_limit('referral.submit', 30, 3600);
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

create or replace function public.submit_referral_for_candidate(
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
  -- Same bucket as the Server Action used to consume (B-1): direct PostgREST calls are limited
  -- too, and the limit is checked before anything else runs (AC-18).
  perform app.enforce_rate_limit('referral.submit', 30, 3600);
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

create or replace function public.file_prior_presentation_claim(
  p_referral uuid,
  p_expected_version integer,
  p_evidence_kind text,
  p_file_ids uuid[],
  p_evidence_referral uuid default null,
  p_prior_process_date date default null,
  p_attested boolean default false,
  p_note text default null,
  p_acting_org uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  v_block text;
  v_delivered date;
  v_date date;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_claim uuid;
  v_deadline timestamptz;
  v_files integer;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  -- Same bucket as the Server Action used to consume (B-1): direct PostgREST calls are limited
  -- too, and the limit is checked before anything else runs (AC-18).
  perform app.enforce_rate_limit('referral.claim', 10, 3600);
  r := app.target_referral(p_referral, p_acting_org, true);
  if r.version <> p_expected_version then raise exception 'stale_version' using errcode = 'P0001'; end if;
  v_block := app.claim_blocker(r.id);
  if v_block is not null then
    raise exception '%', v_block using errcode = 'P0001', detail = coalesce(app.iso_utc(r.claim_deadline_at), '');
  end if;
  if not coalesce(p_attested, false) then raise exception 'claim_attestation_required' using errcode = '22023'; end if;
  if v_note is not null and char_length(v_note) > 2000 then raise exception 'claim_note_too_long' using errcode = '22023'; end if;

  v_delivered := (r.delivered_at at time zone 'America/Toronto')::date;
  if p_evidence_kind = 'file' then
    if p_evidence_referral is not null then raise exception 'claim_evidence_invalid' using errcode = '22023'; end if;
    if coalesce(cardinality(p_file_ids), 0) not between 1 and 5 then
      raise exception 'claim_evidence_invalid' using errcode = '22023';
    end if;
    select count(*) into v_files from app.referral_claim_files f
     where f.id = any (p_file_ids) and f.referral_id = r.id and f.claim_id is null and f.removed_at is null;
    if v_files <> cardinality(p_file_ids) or v_files <> (select count(distinct x) from unnest(p_file_ids) x) then
      raise exception 'claim_evidence_invalid' using errcode = '22023';
    end if;
    if exists (select 1 from app.referral_claim_files f
                where f.id = any (p_file_ids) and (f.scan_status <> 'clean' or f.sha256 is null)) then
      raise exception 'claim_files_not_ready' using errcode = 'P0001';
    end if;
    v_date := p_prior_process_date;
    if v_date is null or v_date >= v_delivered or v_date < (v_delivered - interval '6 months')::date then
      raise exception 'claim_date_invalid' using errcode = '22023';
    end if;
  elsif p_evidence_kind = 'referral' then
    if coalesce(cardinality(p_file_ids), 0) > 0 or p_evidence_referral is null
       or not app.evidence_referral_ok(r.id, p_evidence_referral) then
      raise exception 'claim_referral_invalid' using errcode = 'P0001';
    end if;
    select (er.delivered_at at time zone 'America/Toronto')::date into v_date
      from public.referrals er where er.id = p_evidence_referral;
  else
    raise exception 'claim_evidence_invalid' using errcode = '22023';
  end if;

  v_deadline := app.add_business_days(now(), 10);
  insert into app.referral_claims (referral_id, source_org_id, target_org_id, filed_by, evidence_kind, evidence_referral_id,
                                   prior_process_date, attested_at, note, contest_deadline_at)
  values (r.id, r.source_org_id, r.target_org_id, auth.uid(), p_evidence_kind,
          case when p_evidence_kind = 'referral' then p_evidence_referral end, v_date, now(), v_note, v_deadline)
  returning id into v_claim;
  if p_evidence_kind = 'file' then
    update app.referral_claim_files set claim_id = v_claim where id = any (p_file_ids);
  end if;

  update public.referrals
     set status = 'declined', decline_reason = 'prior_presentation', decided_at = now(), version = version + 1
   where id = r.id;
  insert into public.referral_status_events (referral_id, from_status, to_status, actor_id, actor_side, reason)
  values (r.id, r.status, 'declined', auth.uid(), 'target', 'prior_presentation');

  perform app.notify_org(r.source_org_id, 'claim.filed', 'Prior-presentation objection on your referral',
    coalesce((select o.name from public.organizations o where o.id = r.target_org_id), 'The partner')
      || ' filed an objection on your referral of ' || r.candidate_label || '. You can contest it until '
      || to_char(v_deadline at time zone 'America/Toronto', 'FMMon FMDD, YYYY, FMHH12:MI AM') || ' ET.',
    '/referrals/' || r.id);
  perform app.audit(r.target_org_id, 'referral.claim_filed', 'referral', r.id,
    jsonb_build_object('evidence_kind', p_evidence_kind));
  return jsonb_build_object('claim_id', v_claim, 'version', r.version + 1, 'contest_deadline_at', v_deadline);
end $$;

create or replace function public.contest_prior_presentation_claim(p_referral uuid, p_reason text, p_acting_org uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  c app.referral_claims;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  -- Same bucket as the Server Action used to consume (B-1): direct PostgREST calls are limited
  -- too, and the limit is checked before anything else runs (AC-18).
  perform app.enforce_rate_limit('dispute.open', 5, 3600);
  r := app.source_referral(p_referral, p_acting_org, true);
  select * into c from app.referral_claims where referral_id = r.id for update;
  if not found then raise exception 'claim_not_allowed' using errcode = 'P0001'; end if;
  if exists (select 1 from public.disputes d where d.referral_id = r.id and d.status = 'open') then
    raise exception 'dispute_already_open' using errcode = 'P0001';
  end if;
  if c.status = 'open' and now() >= c.contest_deadline_at then
    raise exception 'contest_window_closed' using errcode = 'P0001', detail = app.iso_utc(c.contest_deadline_at);
  end if;
  if c.status <> 'open' then raise exception 'claim_not_allowed' using errcode = 'P0001'; end if;
  if char_length(v_reason) not between 5 and 2000 then raise exception 'reason_required' using errcode = '22023'; end if;

  insert into public.disputes (kind, referral_id, claim_id, opened_by, opened_by_org, reason)
  values ('prior_presentation', r.id, c.id, auth.uid(), r.source_org_id, v_reason)
  returning id into v_id;
  update app.referral_claims set status = 'contested', contested_at = now() where id = c.id;

  perform app.notify_org(r.target_org_id, 'dispute.opened', 'Objection contested',
    'A platform admin is reviewing the prior-presentation objection on ' || r.candidate_label || '.', '/referrals/' || r.id);
  perform app.notify_org(r.source_org_id, 'dispute.opened', 'Objection contested',
    'A platform admin is reviewing the prior-presentation objection on ' || r.candidate_label || '.', '/referrals/' || r.id);
  perform app.audit(r.source_org_id, 'referral.claim_contested', 'referral', r.id, jsonb_build_object('dispute_id', v_id));
  return v_id;
end $$;

create or replace function app.add_business_days(p_event timestamptz, p_n integer) returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare
  d date := (p_event at time zone 'America/Toronto')::date;
  n integer := 0;
  v_last date;
begin
  if p_event is null or p_n is null or p_n < 1 or p_n > 260 then
    raise exception 'invalid_business_days' using errcode = '22023';
  end if;
  select make_date(extract(year from max(h.day))::integer, 12, 31) into v_last from app.network_holidays h;
  while n < p_n loop
    d := d + 1;
    -- m-4: past the seeded years holidays would be silently ignored. Fail loudly instead; the fix
    -- is a migration seeding the next year from the official sources.
    if v_last is null or d > v_last then
      raise exception 'holiday_calendar_exhausted' using errcode = 'P0001',
        detail = 'app.network_holidays has no seed for ' || extract(year from d)::text;
    end if;
    if app.is_business_day(d) then n := n + 1; end if;
  end loop;
  return (d + time '23:59:59') at time zone 'America/Toronto';
end $$;

create or replace function app.can_upload_claim_evidence(p_name text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_org uuid;
  v_ref uuid;
begin
  if p_name is null or p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|png|jpg)$' then return false; end if;
  v_org := split_part(p_name, '/', 1)::uuid;
  v_ref := split_part(p_name, '/', 2)::uuid;
  if not (app.is_member(v_org)
          and exists (select 1 from public.referrals r where r.id = v_ref and r.target_org_id = v_org
                        and not app.hidden_from_target(r.status))
          and app.claim_blocker(v_ref) is null) then
    return false;
  end if;
  -- m-3 / B-1: every object written to the bucket counts, whether or not it is registered later.
  -- Own bucket (the action's `referral.claim_upload` check gives the friendly message first).
  return public.consume_rate_limit('storage.claim_evidence', 30, 3600);
end $$;

-- m-3: drafts older than 24 h or removed (as before) plus objects nobody ever registered.
create or replace function public.purge_orphan_claim_files() returns setof text
language plpgsql security definer set search_path = '' as $$
begin
  return query
    update app.referral_claim_files f set removed_at = coalesce(f.removed_at, now())
     where f.claim_id is null
       and (f.removed_at is not null or f.uploaded_at < now() - interval '24 hours')
    returning f.storage_path;
  return query
    select o.name from storage.objects o
     where o.bucket_id = 'claim-evidence' and o.created_at < now() - interval '24 hours'
       and not exists (select 1 from app.referral_claim_files f where f.storage_path = o.name)
     limit 1000;
end $$;

revoke execute on function app.record_presentation_outcome(uuid, uuid, uuid, uuid, uuid, text, text, boolean),
  app.submission_gate(uuid, uuid, uuid, uuid, boolean), app.add_business_days(timestamptz, integer)
from public, anon, authenticated;
