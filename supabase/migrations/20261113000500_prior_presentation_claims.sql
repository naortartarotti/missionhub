-- N1 part 5 of 7: prior-presentation claims (BR-11 to BR-15, BR-26 to BR-28) and the side-specific
-- read model of a referral's presentation state.
--
-- Evidence files (EC-4, BR-15):
--   1. The hiring side uploads each file to the private `claim-evidence` bucket at
--      {target_org_id}/{referral_id}/{uuid}.{pdf|png|jpg} (insert policy below; no select policy).
--   2. register_claim_evidence() records it, reading MIME type and size from the stored object
--      (never from the caller), and queues `claim_evidence.scan`.
--   3. The worker (service role) downloads the object, checks its signature, computes SHA-256 and
--      calls record_claim_evidence_scan(). SHA-256 and upload time are then frozen.
--   4. file_prior_presentation_claim() accepts only files that are clean and hashed.
-- Files are read only through 60-second signed URLs issued after authorize_claim_evidence()
-- (claiming org, or a platform admin when the claim has a dispute), audited per download.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('claim-evidence', 'claim-evidence', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- ISO-8601 UTC, used as the error DETAIL of *_window_closed so the app can show the deadline.
create or replace function app.iso_utc(p timestamptz) returns text
language sql immutable set search_path = '' as $$
  select to_char(p at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
$$;

-- The referral, seen from the hiring side acting as p_acting_org. Anything else is "not found".
create or replace function app.target_referral(p_referral uuid, p_acting_org uuid, p_lock boolean default false)
returns public.referrals
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if p_lock then
    select * into r from public.referrals where id = p_referral for update;
  else
    select * into r from public.referrals where id = p_referral;
  end if;
  if not found or not app.is_member(r.target_org_id) or app.hidden_from_target(r.status)
     or (p_acting_org is not null and p_acting_org <> r.target_org_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return r;
end $$;

-- Same, from the sourcing side.
create or replace function app.source_referral(p_referral uuid, p_acting_org uuid, p_lock boolean default false)
returns public.referrals
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if p_lock then
    select * into r from public.referrals where id = p_referral for update;
  else
    select * into r from public.referrals where id = p_referral;
  end if;
  if not found or not app.is_member(r.source_org_id)
     or (p_acting_org is not null and p_acting_org <> r.source_org_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return r;
end $$;

-- Null when a claim may be filed on this referral now; otherwise the error code (BR-12, BR-13, BR-27).
create or replace function app.claim_blocker(p_referral uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when r.claim_rejected_at is not null or exists (select 1 from app.referral_claims c where c.referral_id = r.id)
      then 'claim_already_filed'
    when r.delivered_at is null or r.status not in ('submitted', 'under_review', 'info_requested')
      then 'claim_not_allowed'
    when r.claim_deadline_at is null or now() >= r.claim_deadline_at
      then 'claim_window_closed'
  end
  from public.referrals r where r.id = p_referral;
$$;

-- Storage insert predicate (runs as the uploading user through RLS).
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
grant execute on function app.can_upload_claim_evidence(text) to authenticated;

create policy claim_evidence_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'claim-evidence' and app.can_upload_claim_evidence(name));
-- No select / update / delete policies: reads are signed URLs, deletion is server-side.

-- Earlier referrals the hiring org may cite (BR-26): received by the same org, same job or same
-- client key (snapshots), delivered before the claimed referral, still counting. Revoked sharing
-- doesn't disqualify (PD-027).
create or replace function app.evidence_referral_ok(p_claimed uuid, p_evidence uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.referrals r
      join app.referral_presentations rp on rp.referral_id = r.id
      join public.referrals er on er.id = p_evidence
      join app.referral_presentations ep on ep.referral_id = er.id
     where r.id = p_claimed
       and er.id <> r.id
       and er.target_org_id = r.target_org_id
       and er.delivered_at is not null and r.delivered_at is not null
       and er.delivered_at < r.delivered_at
       and (er.job_id = r.job_id or (rp.client_key is not null and ep.client_key = rp.client_key))
       and app.presentation_counts(er.id)
  );
$$;

-- ---------------------------------------------------------------------------
-- Evidence files
-- ---------------------------------------------------------------------------
create or replace function public.register_claim_evidence(
  p_referral uuid, p_storage_path text, p_file_name text, p_acting_org uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  o record;
  v_mime text;
  v_size bigint;
  v_ext text;
  v_name text;
  v_id uuid;
  v_block text;
begin
  r := app.target_referral(p_referral, p_acting_org, true);
  v_block := app.claim_blocker(r.id);
  if v_block is not null then
    raise exception '%', v_block using errcode = 'P0001', detail = coalesce(app.iso_utc(r.claim_deadline_at), '');
  end if;

  if p_storage_path is null
     or p_storage_path !~ ('^' || r.target_org_id::text || '/' || r.id::text || '/[0-9a-f-]{36}\.(pdf|png|jpg)$') then
    raise exception 'claim_file_invalid' using errcode = '22023';
  end if;
  select so.metadata, so.created_at into o from storage.objects so
   where so.bucket_id = 'claim-evidence' and so.name = p_storage_path and so.owner_id = auth.uid()::text;
  if not found then raise exception 'claim_file_invalid' using errcode = '22023'; end if;
  if exists (select 1 from app.referral_claim_files f where f.storage_path = p_storage_path) then
    raise exception 'claim_file_invalid' using errcode = '22023';
  end if;

  v_mime := o.metadata->>'mimetype';
  v_size := nullif(o.metadata->>'size', '')::bigint;
  v_ext := substring(p_storage_path from '\.([a-z]+)$');
  if v_mime is null or v_size is null or v_size < 1 or v_size > 10485760
     or not ((v_ext = 'pdf' and v_mime = 'application/pdf') or (v_ext = 'png' and v_mime = 'image/png')
             or (v_ext = 'jpg' and v_mime = 'image/jpeg')) then
    raise exception 'claim_file_invalid' using errcode = '22023';
  end if;

  if (select count(*) from app.referral_claim_files f
       where f.referral_id = r.id and f.claim_id is null and f.removed_at is null) >= 5 then
    raise exception 'claim_too_many_files' using errcode = 'P0001';
  end if;

  v_name := left(btrim(regexp_replace(coalesce(p_file_name, ''), '[^[:alnum:]._ ()-]', '_', 'g')), 160);
  if v_name = '' then v_name := 'evidence.' || v_ext; end if;

  insert into app.referral_claim_files (referral_id, target_org_id, uploaded_by, storage_path, file_name, mime_type,
                                        size_bytes, uploaded_at)
  values (r.id, r.target_org_id, auth.uid(), p_storage_path, v_name, v_mime, v_size, o.created_at)
  returning id into v_id;
  perform app.enqueue('claim_evidence.scan', v_id::text, jsonb_build_object('file_id', v_id));
  return jsonb_build_object('id', v_id, 'file_name', v_name, 'mime_type', v_mime, 'size_bytes', v_size,
                            'uploaded_at', o.created_at, 'scan_status', 'pending', 'sha256', null);
end $$;

-- Files uploaded for a claim not yet filed (status polling for the claim form).
create or replace function public.list_claim_evidence_files(p_referral uuid, p_acting_org uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
begin
  r := app.target_referral(p_referral, p_acting_org);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', f.id, 'file_name', f.file_name, 'mime_type', f.mime_type,
                                        'size_bytes', f.size_bytes, 'uploaded_at', f.uploaded_at,
                                        'scan_status', f.scan_status, 'sha256', f.sha256) order by f.uploaded_at)
      from app.referral_claim_files f
     where f.referral_id = r.id and f.claim_id is null and f.removed_at is null), '[]'::jsonb);
end $$;

-- Removes a draft file (not yet attached to a claim). Returns the storage path so the server can
-- delete the object with the service role after this check.
create or replace function public.remove_claim_evidence(p_file uuid, p_acting_org uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  f app.referral_claim_files;
begin
  select * into f from app.referral_claim_files where id = p_file for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform app.target_referral(f.referral_id, p_acting_org);
  if f.claim_id is not null then raise exception 'immutable_record' using errcode = 'P0001'; end if;
  if f.removed_at is null then
    update app.referral_claim_files set removed_at = now() where id = f.id;
  end if;
  return f.storage_path;
end $$;

-- Worker (service role): what to scan.
create or replace function public.claim_evidence_scan_target(p_file uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', f.id, 'storage_path', f.storage_path, 'mime_type', f.mime_type, 'size_bytes', f.size_bytes)
    from app.referral_claim_files f
   where f.id = p_file and f.removed_at is null and f.scan_status = 'pending';
$$;

-- Worker (service role): verdict + SHA-256 of the stored object. Set once.
create or replace function public.record_claim_evidence_scan(p_file uuid, p_verdict text, p_sha256 text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  f app.referral_claim_files;
begin
  if p_verdict not in ('clean', 'rejected') then raise exception 'invalid_verdict' using errcode = '22023'; end if;
  if p_verdict = 'clean' and (p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$') then
    raise exception 'invalid_sha256' using errcode = '22023';
  end if;
  select * into f from app.referral_claim_files where id = p_file for update;
  if not found or f.removed_at is not null or f.scan_status <> 'pending' then return; end if;
  update app.referral_claim_files
     set scan_status = p_verdict::public.document_scan_status,
         sha256 = case when p_verdict = 'clean' then p_sha256 else null end,
         scanned_at = now()
   where id = f.id;
end $$;

-- Authorizes one evidence download: a member of the claiming (hiring) org, or a platform admin
-- when the claim has a dispute (open or resolved, PD-024). Clean files only. Audited per call.
-- Returns the storage path; the server then signs a 60-second URL with the service role.
create or replace function public.authorize_claim_evidence(p_file uuid, p_acting_org uuid default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  f app.referral_claim_files;
  v_dispute uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select * into f from app.referral_claim_files where id = p_file and removed_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  if p_acting_org is not null then
    if p_acting_org <> f.target_org_id or not app.is_member(f.target_org_id) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if f.scan_status <> 'clean' then raise exception 'claim_files_not_ready' using errcode = 'P0001'; end if;
    perform app.audit(f.target_org_id, 'claim_evidence.accessed', 'referral', f.referral_id,
      jsonb_build_object('file_id', f.id));
    return f.storage_path;
  end if;

  if not app.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  select d.id into v_dispute from public.disputes d
   where d.claim_id = f.claim_id and f.claim_id is not null
   order by d.created_at desc limit 1;
  if v_dispute is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if f.scan_status <> 'clean' then raise exception 'claim_files_not_ready' using errcode = 'P0001'; end if;
  perform app.audit(null, 'claim_evidence.accessed', 'dispute', v_dispute, jsonb_build_object('file_id', f.id));
  return f.storage_path;
end $$;

-- ---------------------------------------------------------------------------
-- Referral evidence picker (BR-26)
-- ---------------------------------------------------------------------------
create or replace function public.list_claim_evidence_referrals(p_referral uuid, p_acting_org uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
begin
  r := app.target_referral(p_referral, p_acting_org);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'referral_id', er.id, 'candidate_label', er.candidate_label, 'job_title', er.job_title_snapshot,
             'source_org_name', o.name, 'delivered_at', er.delivered_at, 'status', er.status)
           order by er.delivered_at desc)
      from public.referrals er
      join public.organizations o on o.id = er.source_org_id
     where er.target_org_id = r.target_org_id
       and er.delivered_at is not null and er.delivered_at < r.delivered_at
       and app.evidence_referral_ok(r.id, er.id)), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Filing the claim: declines the referral with reason prior_presentation (BR-12).
-- ---------------------------------------------------------------------------
create or replace function public.file_prior_presentation_claim(
  p_referral uuid,
  p_expected_version integer,
  p_evidence_kind text,
  p_file_ids uuid[],
  p_evidence_referral uuid,
  p_prior_process_date date,
  p_attested boolean,
  p_note text,
  p_acting_org uuid
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

-- ---------------------------------------------------------------------------
-- Side-specific read model for the referral page (BR-15, BR-25, PD-020).
-- The hiring side never receives the release flag; the sourcing side never receives file names,
-- types, sizes, file ids or which referral was cited; nobody but admins gets the contest reason.
-- ---------------------------------------------------------------------------
create or replace function public.get_referral_presentation(p_referral uuid, p_acting_org uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  p app.referral_presentations;
  c app.referral_claims;
  v_side text;
  v_counts boolean;
  v_claim_status text;
  v_ended boolean;
  v_open_dispute boolean;
  v_claim jsonb;
  v_out jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select * into r from public.referrals where id = p_referral;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_acting_org = r.source_org_id and app.is_member(r.source_org_id) then
    v_side := 'source';
  elsif p_acting_org = r.target_org_id and app.is_member(r.target_org_id) and not app.hidden_from_target(r.status) then
    v_side := 'target';
  else
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select * into p from app.referral_presentations where referral_id = r.id;
  select * into c from app.referral_claims where referral_id = r.id;
  v_counts := app.presentation_counts(r.id);
  v_claim_status := case when c.id is not null then app.claim_effective_status(c.status, c.contest_deadline_at) end;
  v_ended := v_claim_status in ('upheld', 'final') or p.void_reason = 'prior_presentation_upheld';
  v_open_dispute := exists (select 1 from public.disputes d where d.referral_id = r.id and d.status = 'open');

  v_out := jsonb_build_object(
    'side', v_side,
    'status', r.status,
    'version', r.version,
    'delivered_at', r.delivered_at,
    'ownership_protected_until', r.ownership_protected_until,
    'claim_deadline_at', r.claim_deadline_at,
    'claim_business_days_left', app.business_days_left(r.claim_deadline_at),
    'claim_rejected_at', r.claim_rejected_at,
    'review_clock_started_at', r.review_clock_started_at
  );

  if v_side = 'source' then
    v_out := v_out || jsonb_build_object(
      'ownership_state', case
        when r.status = 'already_presented' or r.delivered_at is null then 'not_delivered'
        when p.void_reason = 'released' then 'released'
        when v_ended then 'ended'
        when r.ownership_protected_until <= now() then 'expired'
        else 'protected' end,
      'counts', v_counts,
      'released_at', p.released_at,
      'can_release', r.status in ('withdrawn', 'cancelled') and app.release_allowed(r.id),
      'can_release_on_withdraw', r.status in ('submitted', 'under_review', 'info_requested', 'accepted', 'interviewing', 'offer')
                                 and app.release_allowed(r.id));
  else
    v_out := v_out || jsonb_build_object(
      'ownership_state', case
        when v_ended then 'ended'
        when r.ownership_protected_until <= now() then 'expired'
        else 'protected' end,
      'can_claim', app.claim_blocker(r.id) is null);
  end if;

  if c.id is not null then
    v_claim := jsonb_build_object(
      'id', c.id,
      'status', v_claim_status,
      'filed_at', c.filed_at,
      'prior_process_date', c.prior_process_date,
      'evidence_kind', c.evidence_kind,
      'note', c.note,
      'contest_deadline_at', c.contest_deadline_at,
      'contest_business_days_left', case when v_claim_status = 'open' then app.business_days_left(c.contest_deadline_at) end,
      'contested_at', c.contested_at,
      'resolved_at', c.resolved_at,
      'resolution', c.resolution,
      'finalized_at', case when v_claim_status = 'final' then coalesce(c.finalized_at, c.contest_deadline_at) end);
    if v_side = 'source' then
      v_claim := v_claim || jsonb_build_object(
        'files', coalesce((select jsonb_agg(jsonb_build_object('n', x.n, 'uploaded_at', x.uploaded_at, 'sha256', x.sha256) order by x.n)
                             from (select row_number() over (order by f.uploaded_at, f.id) as n, f.uploaded_at, f.sha256
                                     from app.referral_claim_files f where f.claim_id = c.id) x), '[]'::jsonb),
        'can_contest', v_claim_status = 'open' and now() < c.contest_deadline_at and not v_open_dispute);
    else
      v_claim := v_claim || jsonb_build_object(
        'evidence_referral_id', c.evidence_referral_id,
        'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'file_name', f.file_name, 'mime_type', f.mime_type,
                                                              'size_bytes', f.size_bytes, 'uploaded_at', f.uploaded_at,
                                                              'sha256', f.sha256, 'scan_status', f.scan_status)
                                            order by f.uploaded_at, f.id)
                             from app.referral_claim_files f where f.claim_id = c.id), '[]'::jsonb));
    end if;
  end if;
  return v_out || jsonb_build_object('claim', v_claim);
end $$;

revoke execute on function
  app.iso_utc(timestamptz), app.target_referral(uuid, uuid, boolean), app.source_referral(uuid, uuid, boolean), app.claim_blocker(uuid),
  app.evidence_referral_ok(uuid, uuid)
from public, anon, authenticated;

revoke execute on function
  public.register_claim_evidence(uuid, text, text, uuid), public.list_claim_evidence_files(uuid, uuid),
  public.remove_claim_evidence(uuid, uuid), public.claim_evidence_scan_target(uuid),
  public.record_claim_evidence_scan(uuid, text, text), public.authorize_claim_evidence(uuid, uuid),
  public.list_claim_evidence_referrals(uuid, uuid),
  public.file_prior_presentation_claim(uuid, integer, text, uuid[], uuid, date, boolean, text, uuid),
  public.get_referral_presentation(uuid, uuid)
from public, anon, authenticated;
grant execute on function
  public.register_claim_evidence(uuid, text, text, uuid), public.list_claim_evidence_files(uuid, uuid),
  public.remove_claim_evidence(uuid, uuid), public.authorize_claim_evidence(uuid, uuid),
  public.list_claim_evidence_referrals(uuid, uuid),
  public.file_prior_presentation_claim(uuid, integer, text, uuid[], uuid, date, boolean, text, uuid),
  public.get_referral_presentation(uuid, uuid)
to authenticated;
grant execute on function public.claim_evidence_scan_target(uuid), public.record_claim_evidence_scan(uuid, text, text)
to service_role;
