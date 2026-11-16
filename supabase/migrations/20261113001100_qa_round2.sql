-- N1 QA round 2 fixes (qa-report.md R2-1, R2-2, r2-m2, r2-m3, r2-m4, r2-m5).
--
-- R2-1 / r2-m2  Submit RPCs: nothing raises after the duplicate check any more. Anything that can
--               fail is validated before the gate (incl. a token hash already in use, returned as
--               outcome `invalid_token` so the attempt is still counted); races after the gate are
--               returned as a stable code in `outcome`. The rate-limit hit, hit log and audit of a
--               checked attempt therefore always commit. Claims and contests keep raising (a failed
--               validation is not counted, as QA's AC-36 test requires; no check oracle runs there).
-- R2-2          Storage upload limit counted by a trigger on the committed storage.objects insert
--               (the RLS policy's writes were discarded by Storage's permission dry-run).
-- r2-m3         Stable error codes instead of raw constraint errors on the N1 RPCs.
-- r2-m4         2029 holidays seeded (ON ∪ QC, PD-019 convention). The guard stays for 2030+.
-- r2-m5         open_dispute enforces the shared `dispute.open` 5/h bucket itself.

-- Maps an error caught after the gate to a stable code (never a constraint name).
create or replace function app.safe_error_code(p_state text, p_message text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_state in ('P0001', 'P0002', '22023', '42501', '28000') and p_message ~ '^[a-z_]{3,60}$' then p_message
    when p_state = '23505' then 'conflict'
    else 'failed'
  end;
$$;
revoke execute on function app.safe_error_code(text, text) from public, anon, authenticated;

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

  -- R2-1: nothing may raise after the gate (a raise would roll back the rate-limit hit and the hit
  -- log). Everything that can fail was validated above; races are turned into a returned code.
  begin
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
  exception when others then
    return query select app.safe_error_code(sqlstate, sqlerrm), null::uuid, null::text;
    return;
  end;
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

  -- R2-1: a token hash already in use would fail the insert after the check. Refuse it here, as a
  -- returned (so counted) code, before any check runs.
  if exists (select 1 from public.referral_candidate_requests q where q.token_hash = p_token_hash) then
    return query select 'invalid_token'::text, null::uuid, false, null::text, null::text;
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
  exception when others then
    return query select app.safe_error_code(sqlstate, sqlerrm), null::uuid, false, null::text, null::text;
    return;
  end;
  return query select 'created'::text, v_ref, true, c.email::text, null::text;
end $$;

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

  if exists (select 1 from public.referral_candidate_requests q where q.token_hash = p_token_hash and q.referral_id <> p_referral) then
    raise exception 'invalid_token' using errcode = '22023';  -- r2-m3: stable code, no constraint name
  end if;
  update public.referral_candidate_requests
     set token_hash = p_token_hash, destination = v_email,
         expires_at = now() + make_interval(days => least(greatest(coalesce(p_ttl_days, 14), 1), 30))
   where referral_id = p_referral;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- PD-032: the referral is pending again; its fingerprints are recomputed from the current
  -- candidate row (they may have been purged while the link was expired). No stop check here.
  perform app.write_fingerprints(r.id, (select l.candidate_id from public.referral_candidate_links l where l.referral_id = r.id));
  perform app.audit(r.source_org_id, 'referral.candidate_request_resent', 'referral', r.id, '{}');
  return v_email;
end $$;

create or replace function public.open_dispute(p_placement uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p public.placements;
  v_org uuid;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  -- r2-m5: the shared 5/h disputes bucket is enforced here too (the action no longer consumes it).
  perform app.enforce_rate_limit('dispute.open', 5, 3600);
  if p_reason is null or char_length(btrim(p_reason)) not between 10 and 4000 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  select * into p from public.placements where id = p_placement for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_org := case when app.is_member(p.source_org_id) then p.source_org_id
                when app.is_member(p.target_org_id) then p.target_org_id end;
  if v_org is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p.status in ('settled', 'cancelled') then raise exception 'placement_locked' using errcode = 'P0001'; end if;
  if exists (select 1 from public.disputes d where d.placement_id = p.id and d.status = 'open') then
    raise exception 'dispute_already_open' using errcode = 'P0001';
  end if;
  insert into public.disputes (placement_id, opened_by, opened_by_org, reason)
  values (p.id, auth.uid(), v_org, p_reason) returning id into v_id;
  update public.placements set status_before_dispute = status where id = p.id;
  perform app.placement_transition(p.id, 'disputed', 'Dispute opened');
  perform app.notify_org(case when v_org = p.source_org_id then p.target_org_id else p.source_org_id end,
    'placement.disputed', 'A placement was disputed', 'A partner opened a dispute. Platform review is pending.', '/commissions/' || p.id);
  perform app.audit(v_org, 'dispute.opened', 'placement', p.id, jsonb_build_object('dispute_id', v_id));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- R2-2: count evidence uploads where the write commits.
-- ---------------------------------------------------------------------------
create or replace function app.consume_rate_limit_for(p_user uuid, p_bucket text, p_limit integer, p_window integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window) * p_window);
  v_hits integer;
begin
  insert into app.rate_limits as r (user_id, bucket, window_start, hits)
  values (p_user, p_bucket, v_window, 1)
  on conflict (user_id, bucket, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  return v_hits <= p_limit;
end $$;

create or replace function app.on_claim_evidence_object() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if new.bucket_id <> 'claim-evidence' then return new; end if;
  v_user := coalesce(auth.uid(), nullif(new.owner_id, '')::uuid);
  if v_user is null then return new; end if;  -- service-role writes are not user uploads
  if not app.consume_rate_limit_for(v_user, 'storage.claim_evidence', 30, 3600) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger claim_evidence_upload_limit before insert on storage.objects
  for each row execute function app.on_claim_evidence_object();

-- The policy no longer consumes (its write never persisted); the trigger is the counter.
create or replace function app.can_upload_claim_evidence(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid;
  v_ref uuid;
begin
  if p_name is null or p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|png|jpg)$' then return false; end if;
  v_org := split_part(p_name, '/', 1)::uuid;
  v_ref := split_part(p_name, '/', 2)::uuid;
  return app.is_member(v_org)
     and exists (select 1 from public.referrals r where r.id = v_ref and r.target_org_id = v_org
                   and not app.hidden_from_target(r.status))
     and app.claim_blocker(v_ref) is null;
end $$;

-- ---------------------------------------------------------------------------
-- r2-m3: races on unique constraints in the claim and contest paths get stable codes.
-- ---------------------------------------------------------------------------
create or replace function app.claims_unique_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from app.referral_claims c where c.referral_id = new.referral_id) then
    raise exception 'claim_already_filed' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger referral_claims_unique_guard before insert on app.referral_claims
  for each row execute function app.claims_unique_guard();

create or replace function app.disputes_open_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'open' and new.referral_id is not null
     and exists (select 1 from public.disputes d where d.referral_id = new.referral_id and d.status = 'open') then
    raise exception 'dispute_already_open' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger disputes_open_guard before insert on public.disputes
  for each row execute function app.disputes_open_guard();

-- ---------------------------------------------------------------------------
-- r2-m4: 2029 seed. Verified 2026-11-13 against the Ontario ESA "Public holidays" list and the
-- CNESST "Statutory holidays" list (1 July on a Sunday -> 2 July; 24 June on a Sunday -> 25 June,
-- Loi sur la fête nationale). Easter 2029 = 1 April (computed). Christmas and Boxing Day 2029 fall
-- on Tuesday and Wednesday (no substitutes needed). PD-019 convention.
-- ---------------------------------------------------------------------------
insert into app.network_holidays (day, name, jurisdictions) values
  ('2029-01-01', 'New Year''s Day', '{ON,QC}'),
  ('2029-02-19', 'Family Day', '{ON}'),
  ('2029-03-30', 'Good Friday', '{ON,QC}'),
  ('2029-04-02', 'Easter Monday', '{QC}'),
  ('2029-05-21', 'Victoria Day / National Patriots'' Day', '{ON,QC}'),
  ('2029-06-25', 'Fête nationale du Québec (observed; 24 June is a Sunday)', '{QC}'),
  ('2029-07-02', 'Canada Day (observed; 1 July is a Sunday)', '{ON,QC}'),
  ('2029-09-03', 'Labour Day', '{ON,QC}'),
  ('2029-10-08', 'Thanksgiving', '{ON,QC}'),
  ('2029-12-25', 'Christmas Day', '{ON,QC}'),
  ('2029-12-26', 'Boxing Day', '{ON}')
on conflict (day) do nothing;

revoke execute on function app.consume_rate_limit_for(uuid, text, integer, integer), app.on_claim_evidence_object(),
  app.claims_unique_guard(), app.disputes_open_guard()
from public, anon, authenticated;
