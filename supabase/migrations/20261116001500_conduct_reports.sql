-- N10 part 6 of 8: conduct reports, evidence, reporter views, triage, notices, responses
-- (BR-15 to BR-25, BR-40, BR-43, EC-3, EC-6).
--
-- Every function here is SECURITY DEFINER with search_path = ''. Member RPCs take the org from the
-- caller (p_org is re-checked against the caller's membership, never trusted) and answer "not_found"
-- for anything the caller can't see. Admin RPCs check app.is_platform_admin(). The reported org's
-- side never receives the reporter user, the report text, its category or its files; the reporting
-- side never receives the notice, the response, the finding or the sanction.

-- ---------------------------------------------------------------------------
-- Evidence pipeline (N1 pattern, private bucket `conduct-evidence`)
--   member path: {org_id}/{user_id}/{uuid}.{pdf|png|jpg}   admin path: admin/{user_id}/{uuid}.{ext}
--   upload (storage policy) -> register_conduct_evidence (draft row, scan queued) -> worker scan +
--   SHA-256 (record_conduct_evidence_scan, service role) -> attached by the filing RPC (clean only).
-- ---------------------------------------------------------------------------
create or replace function app.can_upload_conduct_evidence(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uuid constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
begin
  if p_name is null or auth.uid() is null then return false; end if;
  if (select count(*) from app.conduct_files f
       where f.uploaded_by = auth.uid() and f.attached_at is null and f.removed_at is null) >= 20 then
    return false;
  end if;
  if p_name ~ ('^admin/' || v_uuid || '/' || v_uuid || '\.(pdf|png|jpg)$') then
    return app.is_platform_admin() and split_part(p_name, '/', 2)::uuid = auth.uid();
  end if;
  if p_name ~ ('^' || v_uuid || '/' || v_uuid || '/' || v_uuid || '\.(pdf|png|jpg)$') then
    return split_part(p_name, '/', 2)::uuid = auth.uid()
       and app.is_member_or_settling(split_part(p_name, '/', 1)::uuid);
  end if;
  return false;
end $$;
revoke execute on function app.can_upload_conduct_evidence(text) from public, anon;
grant execute on function app.can_upload_conduct_evidence(text) to authenticated;

create policy conduct_evidence_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'conduct-evidence' and app.can_upload_conduct_evidence(name) and app.assert_rules_gate());
-- No select / update / delete policies: platform admins read through signed URLs; deletion is server-side.

create or replace function app.conduct_file_json(f app.conduct_files, p_admin boolean) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', f.id, 'file_name', f.file_name, 'mime_type', f.mime_type, 'size_bytes', f.size_bytes,
                            'uploaded_at', f.uploaded_at, 'scan_status', f.scan_status)
         || case when p_admin then jsonb_build_object('sha256', f.sha256) else '{}'::jsonb end;
$$;
revoke execute on function app.conduct_file_json(app.conduct_files, boolean) from public, anon, authenticated;

create or replace function public.register_conduct_evidence(p_storage_path text, p_file_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o record;
  v_org uuid;
  v_mime text;
  v_size bigint;
  v_ext text;
  v_name text;
  f app.conduct_files;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if not app.can_upload_conduct_evidence(p_storage_path) then raise exception 'conduct_file_invalid' using errcode = '22023'; end if;
  if split_part(p_storage_path, '/', 1) <> 'admin' then v_org := split_part(p_storage_path, '/', 1)::uuid; end if;
  select so.metadata, so.created_at into o from storage.objects so
   where so.bucket_id = 'conduct-evidence' and so.name = p_storage_path and so.owner_id = auth.uid()::text;
  if not found or exists (select 1 from app.conduct_files x where x.storage_path = p_storage_path) then
    raise exception 'conduct_file_invalid' using errcode = '22023';
  end if;
  v_mime := o.metadata->>'mimetype';
  v_size := nullif(o.metadata->>'size', '')::bigint;
  v_ext := substring(p_storage_path from '\.([a-z]+)$');
  if v_mime is null or v_size is null or v_size < 1 or v_size > 10485760
     or not ((v_ext = 'pdf' and v_mime = 'application/pdf') or (v_ext = 'png' and v_mime = 'image/png')
             or (v_ext = 'jpg' and v_mime = 'image/jpeg')) then
    raise exception 'conduct_file_invalid' using errcode = '22023';
  end if;
  v_name := left(btrim(regexp_replace(coalesce(p_file_name, ''), '[^[:alnum:]._ ()-]', '_', 'g')), 160);
  if v_name = '' then v_name := 'evidence.' || v_ext; end if;
  insert into app.conduct_files (organization_id, uploaded_by, storage_path, file_name, mime_type, size_bytes, uploaded_at)
  values (v_org, auth.uid(), p_storage_path, v_name, v_mime, v_size, o.created_at)
  returning * into f;
  perform app.enqueue('conduct_evidence.scan', f.id::text, jsonb_build_object('file_id', f.id));
  return app.conduct_file_json(f, false);
end $$;

-- The caller's draft files (upload-list polling). p_ids narrows to the given files.
create or replace function public.list_conduct_draft_files(p_ids uuid[] default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(app.conduct_file_json(f, false) order by f.uploaded_at), '[]'::jsonb)
    from app.conduct_files f
   where f.uploaded_by = auth.uid() and f.attached_at is null and f.removed_at is null
     and (p_ids is null or f.id = any (p_ids));
$$;

-- Removes one of the caller's draft files; returns the path so the server deletes the object.
create or replace function public.remove_conduct_draft_file(p_file uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  f app.conduct_files;
begin
  select * into f from app.conduct_files where id = p_file and uploaded_by = auth.uid() for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if f.attached_at is not null then raise exception 'immutable_record' using errcode = 'P0001'; end if;
  if f.removed_at is null then update app.conduct_files set removed_at = now() where id = f.id; end if;
  return f.storage_path;
end $$;

-- Worker (service role).
create or replace function public.conduct_evidence_scan_target(p_file uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', f.id, 'storage_path', f.storage_path, 'mime_type', f.mime_type, 'size_bytes', f.size_bytes)
    from app.conduct_files f where f.id = p_file and f.removed_at is null and f.scan_status = 'pending';
$$;

create or replace function public.record_conduct_evidence_scan(p_file uuid, p_verdict text, p_sha256 text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  f app.conduct_files;
begin
  if p_verdict not in ('clean', 'rejected') then raise exception 'invalid_verdict' using errcode = '22023'; end if;
  if p_verdict = 'clean' and (p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$') then
    raise exception 'invalid_sha256' using errcode = '22023';
  end if;
  select * into f from app.conduct_files where id = p_file for update;
  if not found or f.removed_at is not null or f.scan_status <> 'pending' then return; end if;
  update app.conduct_files
     set scan_status = p_verdict::public.document_scan_status,
         sha256 = case when p_verdict = 'clean' then p_sha256 end, scanned_at = now()
   where id = f.id;
end $$;

-- Drafts never attached within 24 h: marked removed; the worker deletes the objects.
create or replace function public.purge_orphan_conduct_files() returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  v_paths text[];
begin
  with x as (
    update app.conduct_files set removed_at = now()
     where attached_at is null and removed_at is null and uploaded_at < now() - interval '24 hours'
    returning storage_path)
  select coalesce(array_agg(storage_path), '{}') into v_paths from x;
  return v_paths;
end $$;

-- BR-43: platform admins only, attached clean files only, audited per download (org null).
create or replace function public.authorize_conduct_evidence(p_file uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  f app.conduct_files;
begin
  if not app.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into f from app.conduct_files where id = p_file and removed_at is null and attached_at is not null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if f.scan_status <> 'clean' then raise exception 'conduct_files_not_ready' using errcode = 'P0001'; end if;
  perform app.audit(null, 'conduct_evidence.accessed', 'conduct_case', f.case_id, jsonb_build_object('file_id', f.id));
  return f.storage_path;
end $$;

-- Attaches the caller's clean draft files to a case step (at most 5 per step).
create or replace function app.attach_conduct_files(p_files uuid[], p_case uuid, p_purpose text, p_owner_ref uuid, p_org uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[] := array(select distinct x from unnest(coalesce(p_files, '{}')) x);
  v_ok integer;
begin
  if cardinality(v_ids) = 0 then return; end if;
  if cardinality(v_ids) > 5 then raise exception 'conduct_too_many_files' using errcode = 'P0001'; end if;
  select count(*) into v_ok from app.conduct_files f
   where f.id = any (v_ids) and f.uploaded_by = auth.uid() and f.attached_at is null and f.removed_at is null
     and f.organization_id is not distinct from p_org;
  if v_ok <> cardinality(v_ids) then raise exception 'conduct_file_invalid' using errcode = '22023'; end if;
  if exists (select 1 from app.conduct_files f where f.id = any (v_ids) and f.scan_status <> 'clean') then
    raise exception 'conduct_files_not_ready' using errcode = 'P0001';
  end if;
  update app.conduct_files set case_id = p_case, purpose = p_purpose, owner_ref = p_owner_ref, attached_at = now()
   where id = any (v_ids);
end $$;
revoke execute on function app.attach_conduct_files(uuid[], uuid, text, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Report target and categories (BR-15, BR-17)
-- ---------------------------------------------------------------------------
create or replace function app.conduct_categories_for(p_side text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_side
    when 'source' then array['went_around', 'misused', 'shared_outside', 'hire_payout', 'false_info', 'job_terms',
                             'discrimination', 'retaliation', 'other']
    when 'target' then array['went_around', 'misused', 'shared_outside', 'false_info', 'discrimination', 'retaliation', 'other']
    else array['false_info', 'job_terms', 'discrimination', 'retaliation', 'other']
  end;
$$;

-- Resolves what the caller (as p_org) may report: the other side of a referral it is party to, or the
-- owner of a partner job it can see through its own live match. Raises not_found / report_self.
create or replace function app.conduct_report_target(p_org uuid, p_referral uuid, p_match uuid,
  out reported_org uuid, out side text, out referral_id uuid, out job_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.referrals;
  v_job public.jobs;
  v_cand uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if (p_referral is null) = (p_match is null) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_referral is not null then
    select * into r from public.referrals x where x.id = p_referral;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if r.source_org_id = p_org and app.sees_referral_as_source(r.id) then
      side := 'source'; reported_org := r.target_org_id;
    elsif r.target_org_id = p_org and app.sees_referral_as_target(r.id) then
      side := 'target'; reported_org := r.source_org_id;
    else
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    -- Q-D7 / N10-D22: no report on internal referrals between related orgs (support covers them).
    if r.internal or reported_org = p_org then raise exception 'report_self' using errcode = 'P0001'; end if;
    referral_id := r.id; job_id := r.job_id;
    return;
  end if;
  if not app.is_member(p_org) or app.org_partner_restriction(p_org) is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select m.candidate_id into v_cand from public.matches m
   where m.id = p_match and m.candidate_org_id = p_org and m.expired_at is null;
  select j.* into v_job from public.jobs j
   where j.id = (select m.job_id from public.matches m where m.id = p_match and m.candidate_org_id = p_org and m.expired_at is null);
  if v_cand is null or v_job.id is null or not app.can_access_candidate(v_cand) or not app.job_partner_visible(v_job) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_job.organization_id = p_org or app.orgs_share_member(p_org, v_job.organization_id) then
    raise exception 'report_self' using errcode = 'P0001';
  end if;
  side := 'job'; reported_org := v_job.organization_id; job_id := v_job.id;
end $$;
revoke execute on function app.conduct_report_target(uuid, uuid, uuid) from public, anon, authenticated;

-- The report dialog's header and category list (the server derives the side, BR-17).
create or replace function public.get_conduct_report_context(p_org uuid, p_referral uuid default null, p_match uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  t record;
begin
  select * into t from app.conduct_report_target(p_org, p_referral, p_match);
  return jsonb_build_object(
    'reported_org_name', (select o.name from public.organizations o where o.id = t.reported_org),
    'side', t.side,
    'categories', to_jsonb(app.conduct_categories_for(t.side)));
end $$;

-- BR-15 to BR-18, BR-25. Returns { case_id, first_response_due_at }.
create or replace function public.file_conduct_report(
  p_org uuid, p_referral uuid, p_match uuid, p_category text, p_description text,
  p_occurred_on date, p_occurred_approx boolean, p_attested boolean, p_file_ids uuid[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t record;
  c app.conduct_cases;
begin
  select * into t from app.conduct_report_target(p_org, p_referral, p_match);
  if p_category is null or not (p_category = any (app.conduct_categories())) then
    raise exception 'conduct_category_invalid' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_description, ''))) not between 20 and 4000 then
    raise exception 'conduct_text_invalid' using errcode = '22023';
  end if;
  if p_occurred_on is not null and p_occurred_on > app.today_et() then
    raise exception 'conduct_date_future' using errcode = '22023';
  end if;
  if not coalesce(p_attested, false) then raise exception 'conduct_attestation_required' using errcode = '22023'; end if;

  -- BR-25: 5 per user and 10 per org per rolling 24 hours.
  perform pg_advisory_xact_lock(hashtext('conduct.report.' || p_org::text));
  if (select count(*) from app.conduct_cases x
       where x.reporter_user_id = auth.uid() and x.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'report_rate_limited_user' using errcode = 'P0001';
  end if;
  if (select count(*) from app.conduct_cases x
       where x.reporter_org_id = p_org and x.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'report_rate_limited_org' using errcode = 'P0001';
  end if;

  insert into app.conduct_cases (reported_org_id, source, reporter_org_id, reporter_user_id, reporter_side, referral_id,
                                 job_id, category, description, occurred_on, occurred_approx, good_faith_at,
                                 first_response_due_at)
  values (t.reported_org, case when t.side = 'job' then 'job' else 'referral' end, p_org, auth.uid(), t.side,
          t.referral_id, t.job_id, p_category, btrim(p_description), p_occurred_on,
          coalesce(p_occurred_approx, false) and p_occurred_on is not null, now(), app.add_business_days(now(), 2))
  returning * into c;
  perform app.attach_conduct_files(p_file_ids, c.id, 'report', c.id, p_org);

  -- BR-40: the reporting org's only audit event; case id only.
  perform app.audit(p_org, 'conduct_report.filed', 'conduct_case', c.id, '{}');
  perform app.notify_org(p_org, 'conduct_report.received', 'We received your report',
    'We aim to respond by ' || app.fmt_et(c.first_response_due_at) || ' ET.', '/reports/' || c.id, auth.uid());
  return jsonb_build_object('case_id', c.id, 'first_response_due_at', c.first_response_due_at);
end $$;

-- ---------------------------------------------------------------------------
-- Reporter side (BR-15 readers, BR-23, N10-D23): the reporting user and the reporting org's
-- org_admins, while active members of the reporting org (settling included).
-- ---------------------------------------------------------------------------
create or replace function app.conduct_reporter_outcome(p_case uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when c.status = 'closed' then 'closed'
    when d.id is null then null
    when d.overturned_at is not null then 'no_breach'
    when d.outcome = 'breach' then 'action_taken'
    else d.outcome
  end
  from app.conduct_cases c left join app.conduct_decisions d on d.case_id = c.id
  where c.id = p_case;
$$;

-- received · input_needed · in_review · closed · action_taken · no_breach · insufficient_evidence
create or replace function app.conduct_reporter_status(p_case uuid, p_reporter_view boolean) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(app.conduct_reporter_outcome(c.id), case
    when c.status = 'info_requested' and p_reporter_view then 'input_needed'
    when c.status = 'new' then 'received'
    else 'in_review'
  end)
  from app.conduct_cases c where c.id = p_case;
$$;

-- Access: 'reporter' (the reporting user, active member) · 'org_admin' · null (no access).
create or replace function app.conduct_reporter_access(p_org uuid, p_case uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when c.reporter_user_id = auth.uid() and app.is_member_or_settling(p_org) then 'reporter'
    when app.has_role_or_settling(p_org, array['org_admin']::public.membership_role[]) then 'org_admin'
  end
  from app.conduct_cases c
  where c.id = p_case and c.reporter_org_id = p_org and c.source <> 'admin';
$$;
revoke execute on function app.conduct_reporter_outcome(uuid), app.conduct_reporter_status(uuid, boolean),
  app.conduct_reporter_access(uuid, uuid), app.conduct_categories_for(text) from public, anon, authenticated;

create or replace function app.reporter_is_active(p_case uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.conduct_cases c join public.organization_memberships m
                   on m.organization_id = c.reporter_org_id and m.user_id = c.reporter_user_id and m.status = 'active'
                  where c.id = p_case);
$$;
revoke execute on function app.reporter_is_active(uuid) from public, anon, authenticated;

-- p_scope 'mine' (default) or 'org' (org_admin only; anyone else gets only their own reports).
create or replace function public.list_my_conduct_reports(p_org uuid, p_scope text default 'mine', p_referral uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_admin boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if not app.is_member_or_settling(p_org) then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_admin := coalesce(p_scope, 'mine') = 'org' and app.has_role_or_settling(p_org, array['org_admin']::public.membership_role[]);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'category', c.category, 'created_at', c.created_at,
      'reported_org_name', o.name, 'referral_id', c.referral_id, 'source', c.source,
      'status', app.conduct_reporter_status(c.id, c.reporter_user_id = auth.uid()),
      'is_mine', c.reporter_user_id = auth.uid(),
      'sent_by_name', case when v_admin and app.reporter_is_active(c.id) then (select p.full_name from public.profiles p where p.id = c.reporter_user_id) end,
      'sent_by_former', v_admin and not app.reporter_is_active(c.id))
      order by c.created_at desc)
      from app.conduct_cases c join public.organizations o on o.id = c.reported_org_id
     where c.reporter_org_id = p_org and c.source <> 'admin'
       and (c.reporter_user_id = auth.uid() or v_admin)
       and (p_referral is null or c.referral_id = p_referral)), '[]');
end $$;

create or replace function public.get_conduct_report(p_org uuid, p_case uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_access text := app.conduct_reporter_access(p_org, p_case);
  c app.conduct_cases;
  v_active boolean;
  v_open record;
begin
  if v_access is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into c from app.conduct_cases where id = p_case;
  v_active := app.reporter_is_active(c.id);
  select q.id, q.due_at into v_open from app.conduct_messages q
   where q.case_id = c.id and q.kind = 'question'
     and not exists (select 1 from app.conduct_messages r where r.parent_id = q.id)
   order by q.created_at desc limit 1;
  return jsonb_build_object(
    'id', c.id, 'category', c.category, 'description', c.description,
    'occurred_on', c.occurred_on, 'occurred_approx', c.occurred_approx,
    'created_at', c.created_at, 'first_response_due_at', c.first_response_due_at,
    'reported_org_name', (select o.name from public.organizations o where o.id = c.reported_org_id),
    'source', c.source,
    'referral_id', case when c.referral_id is not null and app.can_see_referral(c.referral_id) then c.referral_id end,
    'status', app.conduct_reporter_status(c.id, v_access = 'reporter' and v_active),
    'outcome', app.conduct_reporter_outcome(c.id),
    'closed_reason_code', case when c.status = 'closed' then c.closed_reason_code end,
    'closed_reason', case when c.status = 'closed' then c.closed_reason end,
    'closed_at', coalesce(c.closed_at, (select d.decided_at from app.conduct_decisions d where d.case_id = c.id)),
    'outcome_updated_at', (select rv.decided_at from app.conduct_decisions d join app.sanction_reviews rv on rv.decision_id = d.id
                            where d.case_id = c.id and d.overturned_at is not null),
    'files', coalesce((select jsonb_agg(jsonb_build_object('file_name', f.file_name, 'size_bytes', f.size_bytes) order by f.uploaded_at)
                         from app.conduct_files f where f.case_id = c.id and f.purpose in ('report', 'reporter_reply')
                          and f.removed_at is null), '[]'),
    'thread', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', q.id, 'question', q.body, 'due_at', q.due_at, 'asked_at', q.created_at,
                 'reply', (select jsonb_build_object('body', r.body, 'at', r.created_at,
                             'files', coalesce((select jsonb_agg(jsonb_build_object('file_name', f.file_name, 'size_bytes', f.size_bytes))
                                                  from app.conduct_files f where f.owner_ref = r.id and f.removed_at is null), '[]'))
                             from app.conduct_messages r where r.parent_id = q.id))
                 order by q.created_at)
               from app.conduct_messages q where q.case_id = c.id and q.kind = 'question'), '[]'),
    'can_reply', v_access = 'reporter' and v_active and c.status = 'info_requested' and v_open.id is not null
                 and (v_open.due_at is null or now() <= v_open.due_at),
    'open_question_id', case when v_access = 'reporter' and c.status = 'info_requested' then v_open.id end,
    'is_mine', v_access = 'reporter',
    'sent_by_name', case when v_access = 'org_admin' and v_active then (select p.full_name from public.profiles p where p.id = c.reporter_user_id) end,
    'sent_by_former', v_access = 'org_admin' and not v_active);
end $$;

create or replace function public.reply_conduct_info_request(p_org uuid, p_case uuid, p_body text, p_file_ids uuid[] default '{}')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  c app.conduct_cases;
  q app.conduct_messages;
  v_reply uuid;
begin
  if app.conduct_reporter_access(p_org, p_case) is distinct from 'reporter' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into c from app.conduct_cases where id = p_case for update;
  select * into q from app.conduct_messages m
   where m.case_id = c.id and m.kind = 'question'
     and not exists (select 1 from app.conduct_messages r where r.parent_id = m.id)
   order by m.created_at desc limit 1;
  if c.status <> 'info_requested' or q.id is null or (q.due_at is not null and now() > q.due_at) then
    raise exception 'conduct_reply_closed' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 20 and 4000 then
    raise exception 'conduct_text_invalid' using errcode = '22023';
  end if;
  insert into app.conduct_messages (case_id, kind, parent_id, body, author_id)
  values (c.id, 'reply', q.id, btrim(p_body), auth.uid()) returning id into v_reply;
  perform app.attach_conduct_files(p_file_ids, c.id, 'reporter_reply', v_reply, p_org);
  update app.conduct_cases set status = 'new' where id = c.id;
  perform app.audit(null, 'conduct.reporter_replied', 'conduct_case', c.id, '{}');
  perform app.notify_platform_admins('conduct_report.reply_received', 'The reporter replied on a conduct case',
    'Open the case to read the reply.', '/admin/disputes/conduct/' || c.id);
end $$;

-- Reporter-facing notifications. received / info_requested go to the reporting user only; closed /
-- outcome_updated fall back to the reporting org's org_admins when the reporter has left (N10-D23).
create or replace function app.notify_conduct_reporter(p_case uuid, p_kind text, p_title text, p_title_org text, p_body text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  c app.conduct_cases;
begin
  select * into c from app.conduct_cases where id = p_case;
  if c.source = 'admin' or c.reporter_org_id is null then return; end if;
  if app.reporter_is_active(c.id) then
    perform app.notify_org(c.reporter_org_id, p_kind, p_title, p_body, '/reports/' || c.id, c.reporter_user_id);
  elsif p_title_org is not null then
    perform app.notify_org_admins(c.reporter_org_id, p_kind, p_title_org, p_body, '/reports/' || c.id);
  end if;
end $$;
revoke execute on function app.notify_conduct_reporter(uuid, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin: queue, case, triage (BR-18, BR-20, BR-24, BR-25)
-- ---------------------------------------------------------------------------
create or replace function app.case_hold_appliers(p_case uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct s.applied_by), '{}') from app.org_sanctions s
   where s.case_id = p_case and s.immediate_ground is not null;
$$;

create or replace function app.has_eligible_reviewer(p_case uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
     where p.is_platform_admin
       and p.id is distinct from (select d.decided_by from app.conduct_decisions d where d.case_id = p_case)
       and not (p.id = any (app.case_hold_appliers(p_case))));
$$;

-- new · waiting_for_reporter · notice_sent · response_received · window_closed · decided ·
-- review_requested · needs_second_admin · closed
create or replace function app.conduct_admin_state(p_case uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  c app.conduct_cases;
  n app.conduct_notices;
begin
  select * into c from app.conduct_cases where id = p_case;
  if c.status = 'closed' then return 'closed'; end if;
  if c.status = 'decided' then
    if exists (select 1 from app.conduct_decisions d join app.sanction_reviews rv on rv.decision_id = d.id
                where d.case_id = c.id and rv.decided_at is null) then
      return case when app.has_eligible_reviewer(c.id) then 'review_requested' else 'needs_second_admin' end;
    end if;
    return 'decided';
  end if;
  if c.status = 'notice_sent' then
    select * into n from app.conduct_notices where case_id = c.id order by sent_at desc limit 1;
    if exists (select 1 from app.conduct_responses r where r.notice_id = n.id) then return 'response_received'; end if;
    if now() >= n.response_due_at then return 'window_closed'; end if;
    return 'notice_sent';
  end if;
  if c.status = 'info_requested' then return 'waiting_for_reporter'; end if;
  return 'new';
end $$;

-- The decision can be recorded on a notice once the response arrived or the window closed (BR-27).
create or replace function app.notice_window_closed(p_notice uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.conduct_notices n
                  where n.id = p_notice
                    and (now() >= n.response_due_at or exists (select 1 from app.conduct_responses r where r.notice_id = n.id)));
$$;

-- BR-23 / N10-D24: "no sanction" is allowed only with no non-overturned sanction or breach finding
-- in the last 12 months (other cases; legacy pre-N10 suspensions have no record and don't count).
create or replace function app.no_sanction_allowed(p_org uuid, p_exclude_case uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from app.conduct_decisions d
                      where d.organization_id = p_org and d.case_id is distinct from p_exclude_case
                        and d.outcome = 'breach' and d.overturned_at is null
                        and d.decided_at > now() - interval '12 months')
     and not exists (select 1 from app.org_sanctions s
                      where s.organization_id = p_org and s.case_id is distinct from p_exclude_case
                        and s.applied_at > now() - interval '12 months'
                        and s.end_reason is distinct from 'overturned');
$$;

create or replace function app.sanction_status(s app.org_sanctions) returns text
language sql stable set search_path = '' as $$
  select case
    when s.end_reason is not null then s.end_reason
    when s.level = 'warning' and s.expires_at <= now() then 'expired'
    else 'active'
  end;
$$;

-- The org's 12-month context for the decision form (AC-85): sanctions and no-level findings.
create or replace function app.org_conduct_context(p_org uuid, p_admin boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x->>'at' desc), '[]') from (
    select jsonb_build_object('kind', 'sanction', 'id', s.id, 'case_id', s.case_id, 'level', s.level,
             'at', s.applied_at, 'status', app.sanction_status(s), 'expires_at', s.expires_at,
             'immediate', s.immediate_ground is not null)
           || case when p_admin then jsonb_build_object('applied_by_name', (select p.full_name from public.profiles p where p.id = s.applied_by)) else '{}'::jsonb end as x
      from app.org_sanctions s
     where s.organization_id = p_org and (s.applied_at > now() - interval '12 months' or app.sanction_active(s))
    union all
    select jsonb_build_object('kind', 'finding', 'id', d.id, 'case_id', d.case_id, 'level', null, 'at', d.decided_at,
             'status', case when d.overturned_at is not null then 'overturned' else 'active' end)
      from app.conduct_decisions d
     where d.organization_id = p_org and d.outcome = 'breach' and d.level is null
       and d.decided_at > now() - interval '12 months'
  ) t;
$$;

revoke execute on function app.case_hold_appliers(uuid), app.has_eligible_reviewer(uuid), app.conduct_admin_state(uuid),
  app.notice_window_closed(uuid), app.no_sanction_allowed(uuid, uuid), app.sanction_status(app.org_sanctions),
  app.org_conduct_context(uuid, boolean) from public, anon, authenticated;

create or replace function public.admin_list_conduct_cases(p_open_only boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(card order by (card->>'decision_overdue')::boolean desc, (card->>'possible_94')::boolean desc,
                                  card->>'first_response_due_at')
    from (
      select jsonb_build_object(
        'id', c.id, 'source', c.source, 'state', app.conduct_admin_state(c.id), 'status', c.status,
        'category', c.category, 'admin_category', c.admin_category,
        'possible_94', c.category in ('shared_outside', 'false_info') or coalesce(c.admin_category, '') in ('shared_outside', 'false_info'),
        'reported_org', jsonb_build_object('id', ro.id, 'name', ro.name),
        'reporter_org', case when rp.id is not null then jsonb_build_object('id', rp.id, 'name', rp.name) end,
        'created_at', c.created_at, 'first_response_due_at', c.first_response_due_at,
        'first_response_at', c.first_response_at,
        'next_deadline', (select n.response_due_at from app.conduct_notices n where n.case_id = c.id
                           and c.status = 'notice_sent' order by n.sent_at desc limit 1),
        'open', c.status not in ('closed', 'decided') or exists (
                  select 1 from app.conduct_decisions d join app.sanction_reviews rv on rv.decision_id = d.id
                   where d.case_id = c.id and rv.decided_at is null),
        'bad_faith_count', case when c.reporter_org_id is not null then (
           select count(*) from app.conduct_cases x join app.conduct_decisions d on d.case_id = x.id
            where x.reporter_org_id = c.reporter_org_id and x.id <> c.id
              and (d.outcome = 'no_breach' or d.overturned_at is not null)
              and d.decided_at > now() - interval '12 months') else 0 end,
        -- Should (RD-049): immediate hold with no decision 10 business days after its window closed.
        'decision_overdue', c.status = 'notice_sent' and exists (
           select 1 from app.conduct_notices n left join app.conduct_responses r on r.notice_id = n.id
            where n.case_id = c.id and n.kind = 'immediate_hold'
              and now() > app.add_business_days(least(n.response_due_at, coalesce(r.submitted_at, n.response_due_at)), 10))
      ) as card
      from app.conduct_cases c
      join public.organizations ro on ro.id = c.reported_org_id
      left join public.organizations rp on rp.id = c.reporter_org_id
    ) t
    where not coalesce(p_open_only, false) or (card->>'open')::boolean), '[]');
end $$;

create or replace function public.admin_get_conduct_case(p_case uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c app.conduct_cases;
  d app.conduct_decisions;
  v_hold app.org_sanctions;
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from app.conduct_cases where id = p_case;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into d from app.conduct_decisions where case_id = c.id;
  select * into v_hold from app.org_sanctions s where s.case_id = c.id and s.immediate_ground is not null
   order by s.applied_at desc limit 1;
  return jsonb_build_object(
    'id', c.id, 'source', c.source, 'status', c.status, 'state', app.conduct_admin_state(c.id),
    'category', c.category, 'admin_category', c.admin_category, 'admin_source', c.admin_source,
    'possible_94', c.category in ('shared_outside', 'false_info') or coalesce(c.admin_category, '') in ('shared_outside', 'false_info'),
    'description', c.description, 'occurred_on', c.occurred_on, 'occurred_approx', c.occurred_approx,
    'created_at', c.created_at, 'first_response_due_at', c.first_response_due_at, 'first_response_at', c.first_response_at,
    'closed_reason_code', c.closed_reason_code, 'closed_reason', c.closed_reason, 'closed_at', c.closed_at,
    'reporter_side', c.reporter_side, 'referral_id', c.referral_id, 'job_id', c.job_id,
    'reported_org', (select jsonb_build_object('id', o.id, 'name', o.name, 'locale', o.locale, 'slug', o.slug,
                       'restriction', app.org_partner_restriction(o.id))
                       from public.organizations o where o.id = c.reported_org_id),
    'reporter_org', (select jsonb_build_object('id', o.id, 'name', o.name) from public.organizations o where o.id = c.reporter_org_id),
    'reporter_user', case when c.reporter_user_id is not null then (select jsonb_build_object('id', p.id, 'name', p.full_name,
                       'email', p.email, 'active_member', app.reporter_is_active(c.id)) from public.profiles p where p.id = c.reporter_user_id) end,
    'opened_by_admin_name', (select p.full_name from public.profiles p where p.id = c.opened_by_admin),
    'files', coalesce((select jsonb_agg(app.conduct_file_json(f, true) || jsonb_build_object('purpose', f.purpose, 'owner_ref', f.owner_ref)
                         order by f.uploaded_at) from app.conduct_files f where f.case_id = c.id and f.removed_at is null), '[]'),
    'thread', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'parent_id', m.parent_id, 'body', m.body,
                         'due_at', m.due_at, 'created_at', m.created_at,
                         'author_name', (select p.full_name from public.profiles p where p.id = m.author_id)) order by m.created_at)
                         from app.conduct_messages m where m.case_id = c.id), '[]'),
    'notices', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', n.id, 'kind', n.kind, 'language', n.language, 'rules_version_id', n.rules_version_id,
                 'rules_version_label', (select v.label from public.network_rules_versions v where v.id = n.rules_version_id),
                 'rules_cited', to_jsonb(n.rules_cited), 'conduct_date', n.conduct_date, 'allegation', n.allegation,
                 'alleged_when', n.alleged_when, 'evidence_summary', n.evidence_summary, 'name_reporter', n.name_reporter,
                 'reporter_org_name', n.reporter_org_name, 'outcomes_line', n.outcomes_line, 'has_outcomes_line', n.has_outcomes_line,
                 'immediate_ground', n.immediate_ground, 'sent_at', n.sent_at, 'response_due_at', n.response_due_at,
                 'sent_by_name', (select p.full_name from public.profiles p where p.id = n.sent_by),
                 'window_closed', app.notice_window_closed(n.id),
                 'response', (select jsonb_build_object('id', r.id, 'body', r.body, 'submitted_at', r.submitted_at,
                                'author_name', (select p.full_name from public.profiles p where p.id = r.author_id))
                                from app.conduct_responses r where r.notice_id = n.id),
                 'followups', coalesce((select jsonb_agg(jsonb_build_object('id', fu.id, 'question', fu.question, 'due_at', fu.due_at,
                                 'asked_at', fu.asked_at, 'reply_body', fu.reply_body, 'replied_at', fu.replied_at,
                                 'reply_by_name', (select p.full_name from public.profiles p where p.id = fu.reply_by)) order by fu.asked_at)
                                 from app.conduct_followups fu where fu.notice_id = n.id), '[]'))
                 order by n.sent_at) from app.conduct_notices n where n.case_id = c.id), '[]'),
    'decision', case when d.id is not null then jsonb_build_object(
                 'id', d.id, 'notice_id', d.notice_id, 'outcome', d.outcome, 'finding', d.finding,
                 'rules_cited', to_jsonb(d.rules_cited), 'residual_test', d.residual_test, 'level', d.level,
                 'why_not_hold', d.why_not_hold, 'planned_review_on', d.planned_review_on, 'decided_at', d.decided_at,
                 'decided_by', d.decided_by, 'decided_by_name', (select p.full_name from public.profiles p where p.id = d.decided_by),
                 'review_request_due_at', d.review_request_due_at, 'overturned_at', d.overturned_at,
                 'review', (select jsonb_build_object('id', rv.id, 'request_text', rv.request_text, 'requested_at', rv.requested_at,
                              'requested_by_name', (select p.full_name from public.profiles p where p.id = rv.requested_by),
                              'outcome', rv.outcome, 'new_level', rv.new_level, 'reason', rv.reason, 'decided_at', rv.decided_at,
                              'reviewer_name', (select p.full_name from public.profiles p where p.id = rv.reviewer_id))
                              from app.sanction_reviews rv where rv.decision_id = d.id)) end,
    'sanctions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'level', s.level, 'immediate_ground', s.immediate_ground,
                   'applied_at', s.applied_at, 'applied_by_name', (select p.full_name from public.profiles p where p.id = s.applied_by),
                   'expires_at', s.expires_at, 'status', app.sanction_status(s), 'ended_at', s.ended_at, 'end_note', s.end_note)
                   order by s.applied_at) from app.org_sanctions s where s.case_id = c.id), '[]'),
    'incident_notices', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'sent_at', i.sent_at, 'referral_ids', to_jsonb(i.referral_ids),
                   'recipients', (select jsonb_agg(jsonb_build_object('organization_id', x.organization_id, 'sides', to_jsonb(x.sides)))
                                    from app.conduct_incident_recipients x where x.notice_id = i.id)) order by i.sent_at)
                   from app.conduct_incident_notices i where i.case_id = c.id), '[]'),
    'org_context', jsonb_build_object(
      'history', app.org_conduct_context(c.reported_org_id, true),
      'open_cases', (select count(*) from app.conduct_cases x where x.reported_org_id = c.reported_org_id
                       and x.id <> c.id and x.status not in ('closed', 'decided'))),
    'immediate_hold', case when v_hold.id is not null then jsonb_build_object('id', v_hold.id, 'ground', v_hold.immediate_ground,
                        'status', app.sanction_status(v_hold), 'applied_by', v_hold.applied_by) end,
    'can_apply_immediate_hold', c.status in ('new', 'info_requested', 'notice_sent')
        and coalesce(app.org_partner_restriction(c.reported_org_id), 'rules_not_accepted') = 'rules_not_accepted'
        and not exists (select 1 from app.org_sanctions s where s.organization_id = c.reported_org_id
                         and s.level = 'network_hold' and s.ended_at is null),
    'no_sanction_allowed', app.no_sanction_allowed(c.reported_org_id, c.id),
    'has_eligible_reviewer', app.has_eligible_reviewer(c.id),
    'viewer_can_review', auth.uid() is distinct from d.decided_by and not (auth.uid() = any (app.case_hold_appliers(c.id))),
    'viewer_is_hold_applier', auth.uid() = any (app.case_hold_appliers(c.id)),
    'incident_allowed', d.outcome = 'breach' and d.overturned_at is null and '2.3' = any (d.rules_cited));
end $$;

create or replace function app.admin_case_for_update(p_case uuid) returns app.conduct_cases
language plpgsql security definer set search_path = '' as $$
declare
  c app.conduct_cases;
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from app.conduct_cases where id = p_case for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  return c;
end $$;
revoke execute on function app.admin_case_for_update(uuid) from public, anon, authenticated;

create or replace function public.admin_set_conduct_category(p_case uuid, p_category text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c app.conduct_cases := app.admin_case_for_update(p_case);
begin
  if p_category is null or not (p_category = any (app.conduct_categories())) then
    raise exception 'conduct_category_invalid' using errcode = '22023';
  end if;
  update app.conduct_cases set admin_category = p_category where id = c.id;
  perform app.audit(null, 'conduct.admin_category_set', 'conduct_case', c.id, jsonb_build_object('category', p_category));
end $$;

-- RD-044 / AC-129: the admin category is required before any first response.
create or replace function app.require_admin_category(c app.conduct_cases) returns void
language plpgsql stable set search_path = '' as $$
begin
  if c.admin_category is null then raise exception 'admin_category_required' using errcode = 'P0001'; end if;
end $$;
revoke execute on function app.require_admin_category(app.conduct_cases) from public, anon, authenticated;

create or replace function public.admin_request_conduct_info(p_case uuid, p_question text, p_due_business_days integer default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  c app.conduct_cases := app.admin_case_for_update(p_case);
begin
  perform app.require_admin_category(c);
  if c.source = 'admin' or c.status not in ('new', 'info_requested') then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_question, ''))) not between 20 and 2000 then
    raise exception 'conduct_text_invalid' using errcode = '22023';
  end if;
  if p_due_business_days is not null and p_due_business_days not between 1 and 10 then
    raise exception 'conduct_deadline_invalid' using errcode = '22023';
  end if;
  insert into app.conduct_messages (case_id, kind, body, due_at, author_id)
  values (c.id, 'question', btrim(p_question),
          case when p_due_business_days is not null then app.add_business_days(now(), p_due_business_days) end, auth.uid());
  update app.conduct_cases set status = 'info_requested', first_response_at = coalesce(first_response_at, now()) where id = c.id;
  perform app.audit(null, 'conduct.info_requested', 'conduct_case', c.id, '{}');
  perform app.notify_conduct_reporter(c.id, 'conduct_report.info_requested', 'Workatent has a question about your report',
    null, 'Open your report to reply.');
end $$;

create or replace function public.admin_close_conduct_case(p_case uuid, p_reason_code text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c app.conduct_cases := app.admin_case_for_update(p_case);
begin
  perform app.require_admin_category(c);
  if c.status not in ('new', 'info_requested') then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  if p_reason_code is null or p_reason_code not in ('no_rule', 'amount', 'duplicate', 'other') then
    raise exception 'conduct_reason_invalid' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 20 and 1000 then
    raise exception 'conduct_text_invalid' using errcode = '22023';
  end if;
  update app.conduct_cases
     set status = 'closed', closed_reason_code = p_reason_code, closed_reason = btrim(p_reason), closed_at = now(),
         closed_by = auth.uid(), first_response_at = coalesce(first_response_at, now())
   where id = c.id;
  perform app.audit(null, 'conduct.closed_at_triage', 'conduct_case', c.id, jsonb_build_object('reason_code', p_reason_code));
  perform app.notify_conduct_reporter(c.id, 'conduct_report.closed', 'Your report is closed',
    'A report from your organization is closed', 'Open it to see the outcome.');
end $$;

-- BR-24: an admin-initiated case (no reporter).
create or replace function public.admin_open_conduct_case(
  p_org uuid, p_category text, p_admin_source text, p_referral uuid, p_description text, p_file_ids uuid[] default '{}'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.organizations o where o.id = p_org) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_category is null or not (p_category = any (app.conduct_categories())) then
    raise exception 'conduct_category_invalid' using errcode = '22023';
  end if;
  if p_admin_source is null or p_admin_source not in ('confirmation_invalid', 'objection_fabricated', 'other') then
    raise exception 'conduct_reason_invalid' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_description, ''))) not between 20 and 4000 then
    raise exception 'conduct_text_invalid' using errcode = '22023';
  end if;
  if p_referral is not null and not exists (select 1 from public.referrals r where r.id = p_referral
                                              and p_org in (r.source_org_id, r.target_org_id)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into app.conduct_cases (reported_org_id, source, referral_id, admin_source, opened_by_admin, category, admin_category,
                                 description, first_response_due_at)
  values (p_org, 'admin', p_referral, p_admin_source, auth.uid(), p_category, p_category, btrim(p_description),
          app.add_business_days(now(), 2))
  returning id into v_id;
  perform app.attach_conduct_files(p_file_ids, v_id, 'admin', v_id, null);
  perform app.audit(null, 'conduct.opened_by_admin', 'conduct_case', v_id, jsonb_build_object('organization_id', p_org));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Notices (BR-21, BR-28, N10-D21, RD-049, EC-6)
-- ---------------------------------------------------------------------------

-- The composer's choices: effective versions (each with its rule list and the org's acceptance),
-- the default conduct date and the version in force on it.
create or replace function public.admin_conduct_notice_context(p_case uuid, p_conduct_date date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c app.conduct_cases;
  v_date date;
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from app.conduct_cases where id = p_case;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_date := coalesce(p_conduct_date, c.occurred_on, case when c.source <> 'admin' then (c.created_at at time zone 'America/Toronto')::date end);
  return jsonb_build_object(
    'default_conduct_date', coalesce(c.occurred_on, case when c.source <> 'admin' then (c.created_at at time zone 'America/Toronto')::date end),
    'first_effective_on', (select min(v.effective_on) from public.network_rules_versions v where v.status = 'published'),
    'org_locale', (select o.locale from public.organizations o where o.id = c.reported_org_id),
    'default_version_id', (select v.id from public.network_rules_versions v
                            where v.status = 'published' and v.effective_at <= now() and v_date is not null
                              and v.effective_at <= app.rules_effective_at(v_date + 1)
                            order by v.effective_at desc limit 1),
    'versions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'label', v.label, 'effective_at', v.effective_at, 'effective_on', v.effective_on, 'type', v.type,
        'rules', (select jsonb_object_agg(t.locale::text, t.rules) from public.network_rules_version_texts t where t.version_id = v.id),
        'sections', (select jsonb_object_agg(t.locale::text, t.sections) from public.network_rules_version_texts t where t.version_id = v.id),
        'org_accepted_at', (select a.accepted_at from public.network_rules_org_acceptances a
                             where a.organization_id = c.reported_org_id and a.version_id = v.id))
        order by v.effective_at desc)
      from public.network_rules_versions v where v.status = 'published' and v.effective_at <= now()), '[]'));
end $$;

create or replace function app.create_conduct_notice(
  c app.conduct_cases, p_kind text, p_ground text, p_language text, p_conduct_date date, p_rules_version uuid,
  p_rules_cited text[], p_allegation text, p_alleged_when text, p_evidence_summary text, p_name_reporter boolean
) returns app.conduct_notices
language plpgsql security definer set search_path = '' as $$
declare
  v public.network_rules_versions;
  v_rules text[] := array(select distinct btrim(x) from unnest(coalesce(p_rules_cited, '{}')) x where btrim(x) <> '');
  n app.conduct_notices;
begin
  if p_language is null or p_language not in ('en', 'fr-CA', 'pt-BR') then raise exception 'invalid_language' using errcode = '22023'; end if;
  if p_conduct_date is null then raise exception 'conduct_date_required' using errcode = '22023'; end if;
  if p_conduct_date > app.today_et() then raise exception 'conduct_date_future' using errcode = '22023'; end if;
  if p_conduct_date < (select min(x.effective_on) from public.network_rules_versions x where x.status = 'published') then
    raise exception 'conduct_date_before_rules' using errcode = '22023';
  end if;
  select * into v from public.network_rules_versions x where x.id = p_rules_version and x.status = 'published' and x.effective_at <= now();
  if not found then raise exception 'notice_version_invalid' using errcode = '22023'; end if;
  if cardinality(v_rules) = 0 or not (v_rules <@ v.rule_numbers) then
    raise exception 'notice_rule_not_in_version' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_allegation, ''))) not between 20 and 4000
     or char_length(btrim(coalesce(p_alleged_when, ''))) not between 3 and 200
     or char_length(btrim(coalesce(p_evidence_summary, ''))) not between 20 and 4000 then
    raise exception 'conduct_text_invalid' using errcode = '22023';
  end if;
  insert into app.conduct_notices (case_id, organization_id, kind, language, rules_version_id, rules_cited, conduct_date, allegation,
                                   alleged_when, evidence_summary, name_reporter, reporter_org_name, outcomes_line,
                                   has_outcomes_line, immediate_ground, sent_by, response_due_at)
  values (c.id, c.reported_org_id, p_kind, p_language, v.id, v_rules, p_conduct_date, btrim(p_allegation), btrim(p_alleged_when),
          btrim(p_evidence_summary), coalesce(p_name_reporter, false) and c.reporter_org_id is not null,
          case when coalesce(p_name_reporter, false) then (select o.name from public.organizations o where o.id = c.reporter_org_id) end,
          app.notice_outcomes_line(p_language), true, p_ground, auth.uid(), app.add_business_days(now(), 10))
  returning * into n;
  update app.conduct_cases set status = 'notice_sent', first_response_at = coalesce(first_response_at, now()) where id = c.id;
  return n;
end $$;
revoke execute on function app.create_conduct_notice(app.conduct_cases, text, text, text, date, uuid, text[], text, text, text, boolean)
  from public, anon, authenticated;

create or replace function public.admin_send_conduct_notice(
  p_case uuid, p_language text, p_conduct_date date, p_rules_version uuid, p_rules_cited text[],
  p_allegation text, p_alleged_when text, p_evidence_summary text, p_name_reporter boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c app.conduct_cases := app.admin_case_for_update(p_case);
  n app.conduct_notices;
begin
  perform app.require_admin_category(c);
  if c.status not in ('new', 'info_requested', 'notice_sent') then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  n := app.create_conduct_notice(c, 'standard', null, p_language, p_conduct_date, p_rules_version, p_rules_cited,
                                 p_allegation, p_alleged_when, p_evidence_summary, p_name_reporter);
  -- BR-40: the reported org's audit starts here, with no reporter data.
  perform app.audit(c.reported_org_id, 'conduct.notice_sent', 'conduct_case', c.id, jsonb_build_object('notice_id', n.id));
  perform app.notify_org_admins(c.reported_org_id, 'conduct.notice_sent', 'You have a notice from Workatent',
    'Read it and respond by ' || app.fmt_et(n.response_due_at) || ' ET.', '/settings/standing/' || c.id);
  return n.id;
end $$;

create or replace function public.admin_send_conduct_followup(p_notice uuid, p_question text, p_due_business_days integer default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  n app.conduct_notices;
  c app.conduct_cases;
  v_id uuid;
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into n from app.conduct_notices where id = p_notice;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  c := app.admin_case_for_update(n.case_id);
  if c.status not in ('notice_sent', 'decided') then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_question, ''))) not between 20 and 2000 then
    raise exception 'conduct_text_invalid' using errcode = '22023';
  end if;
  if p_due_business_days is not null and p_due_business_days not between 1 and 10 then
    raise exception 'conduct_deadline_invalid' using errcode = '22023';
  end if;
  insert into app.conduct_followups (notice_id, question, due_at, asked_by)
  values (n.id, btrim(p_question), case when p_due_business_days is not null then app.add_business_days(now(), p_due_business_days) end,
          auth.uid())
  returning id into v_id;
  perform app.audit(c.reported_org_id, 'conduct.followup_sent', 'conduct_case', c.id, jsonb_build_object('followup_id', v_id));
  perform app.notify_org_admins(c.reported_org_id, 'conduct.followup', 'Workatent has a follow-up question',
    'Open the notice to reply.', '/settings/standing/' || c.id);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Reported org (org_admin, active or settling): case page, response, follow-up replies
-- ---------------------------------------------------------------------------
create or replace function app.reported_org_case(p_org uuid, p_case uuid, p_lock boolean) returns app.conduct_cases
language plpgsql security definer set search_path = '' as $$
declare
  c app.conduct_cases;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if not app.has_role_or_settling(p_org, array['org_admin']::public.membership_role[]) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_lock then
    select * into c from app.conduct_cases where id = p_case and reported_org_id = p_org for update;
  else
    select * into c from app.conduct_cases where id = p_case and reported_org_id = p_org;
  end if;
  -- The org sees a case only from its first notice onward (BR-40).
  if c.id is null or not exists (select 1 from app.conduct_notices n where n.case_id = c.id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return c;
end $$;
revoke execute on function app.reported_org_case(uuid, uuid, boolean) from public, anon, authenticated;

create or replace function public.get_conduct_case_for_org(p_org uuid, p_case uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c app.conduct_cases := app.reported_org_case(p_org, p_case, false);
  d app.conduct_decisions;
begin
  select * into d from app.conduct_decisions where case_id = c.id;
  -- No reporter user, report text, category, files or platform-admin identity (BR-21, N10-D28).
  return jsonb_build_object(
    'id', c.id, 'status', c.status,
    'notices', coalesce((select jsonb_agg(jsonb_build_object(
        'id', n.id, 'kind', n.kind, 'language', n.language,
        'rules_version_label', (select v.label from public.network_rules_versions v where v.id = n.rules_version_id),
        'rules_cited', (select coalesce(jsonb_agg(r order by o), '[]') from public.network_rules_version_texts t,
                          jsonb_array_elements(t.rules) with ordinality as e(r, o)
                         where t.version_id = n.rules_version_id and t.locale = n.language::public.network_rules_locale
                           and r->>'number' = any (n.rules_cited)),
        'conduct_date', n.conduct_date, 'allegation', n.allegation, 'alleged_when', n.alleged_when,
        'evidence_summary', n.evidence_summary, 'reporter_org_name', case when n.name_reporter then n.reporter_org_name end,
        'outcomes_line', n.outcomes_line, 'immediate_ground', n.immediate_ground,
        'sent_at', n.sent_at, 'response_due_at', n.response_due_at,
        'business_days_left', app.business_days_left(n.response_due_at, now()),
        'can_respond', not exists (select 1 from app.conduct_responses r where r.notice_id = n.id) and now() < n.response_due_at,
        'response', (select jsonb_build_object('body', r.body, 'submitted_at', r.submitted_at,
                       'author_name', (select p.full_name from public.profiles p where p.id = r.author_id),
                       'files', coalesce((select jsonb_agg(jsonb_build_object('file_name', f.file_name, 'size_bytes', f.size_bytes))
                                           from app.conduct_files f where f.owner_ref = r.id and f.removed_at is null), '[]'))
                       from app.conduct_responses r where r.notice_id = n.id),
        'followups', coalesce((select jsonb_agg(jsonb_build_object('id', fu.id, 'question', fu.question, 'due_at', fu.due_at,
                        'asked_at', fu.asked_at, 'reply_body', fu.reply_body, 'replied_at', fu.replied_at,
                        'reply_by_name', (select p.full_name from public.profiles p where p.id = fu.reply_by),
                        'can_reply', fu.replied_at is null and (fu.due_at is null or now() <= fu.due_at)) order by fu.asked_at)
                        from app.conduct_followups fu where fu.notice_id = n.id), '[]'))
        order by n.sent_at) from app.conduct_notices n where n.case_id = c.id), '[]'),
    'decision', case when d.id is not null then jsonb_build_object(
        'outcome', d.outcome, 'finding', d.finding, 'rules_cited', to_jsonb(d.rules_cited), 'residual_test', d.residual_test,
        'level', d.level, 'planned_review_on', d.planned_review_on, 'decided_at', d.decided_at,
        'review_request_due_at', d.review_request_due_at, 'overturned_at', d.overturned_at,
        'can_request_review', d.outcome = 'breach' and d.review_request_due_at is not null and now() < d.review_request_due_at
                              and not exists (select 1 from app.sanction_reviews rv where rv.decision_id = d.id),
        'sanctions', coalesce((select jsonb_agg(jsonb_build_object('level', s.level, 'applied_at', s.applied_at,
                        'expires_at', s.expires_at, 'status', app.sanction_status(s), 'ended_at', s.ended_at,
                        'planned_review_on', s.planned_review_on) order by s.applied_at)
                        from app.org_sanctions s where s.case_id = c.id), '[]'),
        'review', (select jsonb_build_object('requested_at', rv.requested_at,
                     'requested_by_name', (select p.full_name from public.profiles p where p.id = rv.requested_by),
                     'outcome', rv.outcome, 'new_level', rv.new_level, 'reason', rv.reason, 'decided_at', rv.decided_at)
                     from app.sanction_reviews rv where rv.decision_id = d.id)) end,
    'immediate_hold', (select jsonb_build_object('applied_at', s.applied_at, 'status', app.sanction_status(s), 'ended_at', s.ended_at)
                         from app.org_sanctions s where s.case_id = c.id and s.immediate_ground is not null
                         order by s.applied_at desc limit 1));
end $$;

create or replace function public.submit_conduct_response(p_org uuid, p_notice uuid, p_body text, p_file_ids uuid[] default '{}')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  n app.conduct_notices;
  c app.conduct_cases;
  v_id uuid;
begin
  select * into n from app.conduct_notices where id = p_notice;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  c := app.reported_org_case(p_org, n.case_id, true);
  if exists (select 1 from app.conduct_responses r where r.notice_id = n.id) then
    raise exception 'conduct_response_exists' using errcode = 'P0001';
  end if;
  if now() >= n.response_due_at then
    raise exception 'conduct_response_closed' using errcode = 'P0001', detail = app.iso_utc(n.response_due_at);
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 20 and 8000 then
    raise exception 'conduct_text_invalid' using errcode = '22023';
  end if;
  insert into app.conduct_responses (notice_id, organization_id, author_id, body)
  values (n.id, p_org, auth.uid(), btrim(p_body)) returning id into v_id;
  perform app.attach_conduct_files(p_file_ids, c.id, 'response', v_id, p_org);
  perform app.audit(p_org, 'conduct.response_submitted', 'conduct_case', c.id, jsonb_build_object('notice_id', n.id));
  perform app.notify_platform_admins('conduct.response_received', 'Response received on a conduct case',
    'Open the case to read it.', '/admin/disputes/conduct/' || c.id);
end $$;

create or replace function public.reply_conduct_followup(p_org uuid, p_followup uuid, p_body text, p_file_ids uuid[] default '{}')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  fu app.conduct_followups;
  c app.conduct_cases;
begin
  select f.* into fu from app.conduct_followups f where f.id = p_followup for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  c := app.reported_org_case(p_org, (select n.case_id from app.conduct_notices n where n.id = fu.notice_id), true);
  if fu.replied_at is not null then raise exception 'conduct_response_exists' using errcode = 'P0001'; end if;
  if fu.due_at is not null and now() > fu.due_at then raise exception 'conduct_reply_closed' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 20 and 4000 then
    raise exception 'conduct_text_invalid' using errcode = '22023';
  end if;
  update app.conduct_followups set reply_body = btrim(p_body), reply_by = auth.uid(), replied_at = now() where id = fu.id;
  perform app.attach_conduct_files(p_file_ids, c.id, 'followup_reply', fu.id, p_org);
  perform app.audit(p_org, 'conduct.followup_answered', 'conduct_case', c.id, jsonb_build_object('followup_id', fu.id));
  perform app.notify_platform_admins('conduct.followup_answered', 'Follow-up answered on a conduct case',
    'Open the case to read the reply.', '/admin/disputes/conduct/' || c.id);
end $$;

-- Grants: member and admin RPCs to authenticated (each checks access inside); worker RPCs to service_role.
do $$
declare f text;
begin
  foreach f in array array[
    'public.register_conduct_evidence(text, text)', 'public.list_conduct_draft_files(uuid[])',
    'public.remove_conduct_draft_file(uuid)', 'public.authorize_conduct_evidence(uuid)',
    'public.get_conduct_report_context(uuid, uuid, uuid)',
    'public.file_conduct_report(uuid, uuid, uuid, text, text, date, boolean, boolean, uuid[])',
    'public.list_my_conduct_reports(uuid, text, uuid)', 'public.get_conduct_report(uuid, uuid)',
    'public.reply_conduct_info_request(uuid, uuid, text, uuid[])',
    'public.admin_list_conduct_cases(boolean)', 'public.admin_get_conduct_case(uuid)',
    'public.admin_set_conduct_category(uuid, text)', 'public.admin_request_conduct_info(uuid, text, integer)',
    'public.admin_close_conduct_case(uuid, text, text)',
    'public.admin_open_conduct_case(uuid, text, text, uuid, text, uuid[])',
    'public.admin_conduct_notice_context(uuid, date)',
    'public.admin_send_conduct_notice(uuid, text, date, uuid, text[], text, text, text, boolean)',
    'public.admin_send_conduct_followup(uuid, text, integer)',
    'public.get_conduct_case_for_org(uuid, uuid)', 'public.submit_conduct_response(uuid, uuid, text, uuid[])',
    'public.reply_conduct_followup(uuid, uuid, text, uuid[])'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['public.conduct_evidence_scan_target(uuid)', 'public.record_conduct_evidence_scan(uuid, text, text)',
                           'public.purge_orphan_conduct_files()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
