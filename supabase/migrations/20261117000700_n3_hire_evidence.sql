-- N3 drop 2: the evidence-file pipeline for hire reports, contests, rebuttals and authorization checks
-- (BR-18, BR-25, BR-26, BR-37). Same rules as N1 claim evidence (20261113000500/000900): upload to a private
-- bucket, register through an RPC that checks the object the caller just uploaded, scan and SHA-256 by the
-- worker (service role), 60-second signed URLs after an audited authorization, orphan cleanup on the timer.
-- Who may upload what: the sourcing side for `hire_report`, `hire_rebuttal`, `auth_evidence`; the hiring side
-- for `hire_contest`, `auth_request`. Files are readable by the uploader's org and platform admins only.

-- The caller's side on a referral for an acting org (record scope), or null.
create function app.hire_side(p_referral uuid, p_acting_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when r.source_org_id = p_acting_org and app.sees_referral_as_source(r.id) then 'source'
    when r.target_org_id = p_acting_org and app.sees_referral_as_target(r.id) then 'target'
  end
  from public.referrals r where r.id = p_referral;
$$;
revoke execute on function app.hire_side(uuid, uuid) from public, anon, authenticated;

create function app.hire_evidence_side(p_kind text) returns text
language sql immutable set search_path = '' as $$
  select case when p_kind in ('hire_report', 'hire_rebuttal', 'auth_evidence') then 'source'
              when p_kind in ('hire_contest', 'auth_request') then 'target' end;
$$;

create function app.hire_evidence_json(f app.hire_evidence_files) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', f.id, 'file_name', f.file_name, 'mime_type', f.mime_type, 'size_bytes', f.size_bytes,
                            'uploaded_at', f.uploaded_at, 'scan_status', f.scan_status, 'sha256', f.sha256);
$$;

create function public.register_hire_evidence(p_referral uuid, p_owner_kind text, p_storage_path text, p_file_name text, p_acting_org uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o record;
  v_side text;
  v_mime text;
  v_size bigint;
  v_ext text;
  v_name text;
  f app.hire_evidence_files;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  v_side := app.hire_side(p_referral, p_acting_org);
  if v_side is null or v_side is distinct from app.hire_evidence_side(p_owner_kind) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_storage_path is null
     or p_storage_path !~ ('^' || p_acting_org::text || '/' || p_referral::text || '/[0-9a-f-]{36}\.(pdf|png|jpg)$') then
    raise exception 'hire_evidence_invalid' using errcode = '22023';
  end if;
  select so.metadata, so.created_at into o from storage.objects so
   where so.bucket_id = 'hire-evidence' and so.name = p_storage_path and so.owner_id = auth.uid()::text;
  if not found or exists (select 1 from app.hire_evidence_files x where x.storage_path = p_storage_path) then
    raise exception 'hire_evidence_invalid' using errcode = '22023';
  end if;
  v_mime := o.metadata->>'mimetype';
  v_size := nullif(o.metadata->>'size', '')::bigint;
  v_ext := substring(p_storage_path from '\.([a-z]+)$');
  if v_mime is null or v_size is null or v_size < 1 or v_size > 10485760
     or not ((v_ext = 'pdf' and v_mime = 'application/pdf') or (v_ext = 'png' and v_mime = 'image/png')
             or (v_ext = 'jpg' and v_mime = 'image/jpeg')) then
    raise exception 'hire_evidence_invalid' using errcode = '22023';
  end if;
  if (select count(*) from app.hire_evidence_files x
       where x.referral_id = p_referral and x.owner_kind = p_owner_kind and x.uploader_org_id = p_acting_org
         and x.owner_id is null and x.removed_at is null) >= 5 then
    raise exception 'hire_evidence_too_many' using errcode = 'P0001';
  end if;
  v_name := left(btrim(regexp_replace(coalesce(p_file_name, ''), '[^[:alnum:]._ ()-]', '_', 'g')), 160);
  if v_name = '' then v_name := 'evidence.' || v_ext; end if;
  insert into app.hire_evidence_files (referral_id, owner_kind, uploader_org_id, uploaded_by, storage_path, file_name,
                                       mime_type, size_bytes, uploaded_at)
  values (p_referral, p_owner_kind, p_acting_org, auth.uid(), p_storage_path, v_name, v_mime, v_size, o.created_at)
  returning * into f;
  perform app.enqueue('hire_evidence.scan', f.id::text, jsonb_build_object('file_id', f.id));
  return app.hire_evidence_json(f);
end $$;

-- Draft files (not yet filed) of one purpose, for the upload list's polling.
create function public.list_hire_evidence_files(p_referral uuid, p_owner_kind text, p_acting_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if app.hire_side(p_referral, p_acting_org) is distinct from app.hire_evidence_side(p_owner_kind) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return coalesce((select jsonb_agg(app.hire_evidence_json(f) order by f.uploaded_at, f.id)
                     from app.hire_evidence_files f
                    where f.referral_id = p_referral and f.owner_kind = p_owner_kind and f.uploader_org_id = p_acting_org
                      and f.owner_id is null and f.removed_at is null), '[]'::jsonb);
end $$;

-- Removes a draft; returns the storage path the action then deletes (server-side, service role).
create function public.remove_hire_evidence(p_file uuid, p_acting_org uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  f app.hire_evidence_files;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select * into f from app.hire_evidence_files where id = p_file for update;
  if not found or f.owner_id is not null or f.removed_at is not null or f.uploader_org_id <> p_acting_org
     or app.hire_side(f.referral_id, p_acting_org) is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update app.hire_evidence_files set removed_at = now() where id = f.id;
  return f.storage_path;
end $$;

-- Download authorization: the uploader's org (its own files) or a platform admin. Audited; clean files only.
create function public.authorize_hire_evidence(p_file uuid, p_acting_org uuid default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  f app.hire_evidence_files;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select * into f from app.hire_evidence_files where id = p_file and removed_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_acting_org is not null then
    if p_acting_org <> f.uploader_org_id or app.hire_side(f.referral_id, p_acting_org) is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if f.scan_status <> 'clean' then raise exception 'hire_report_files_not_ready' using errcode = 'P0001'; end if;
    perform app.audit(f.uploader_org_id, 'hire_evidence.accessed', 'referral', f.referral_id, jsonb_build_object('file_id', f.id));
    return f.storage_path;
  end if;
  if not app.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  if f.scan_status <> 'clean' then raise exception 'hire_report_files_not_ready' using errcode = 'P0001'; end if;
  perform app.audit(null, 'hire_evidence.accessed', 'referral', f.referral_id, jsonb_build_object('file_id', f.id));
  return f.storage_path;
end $$;

-- Attaches clean drafts of one purpose to a filed object (used by the filing RPCs). Raises
-- hire_report_files_not_ready if any id isn't a clean draft of this caller, purpose and referral.
create function app.attach_hire_evidence(p_referral uuid, p_owner_kind text, p_org uuid, p_file_ids uuid[], p_owner uuid, p_max integer)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer := coalesce(cardinality(p_file_ids), 0);
begin
  if v_n = 0 then return 0; end if;
  if v_n > p_max or (select count(distinct x) from unnest(p_file_ids) x) <> v_n
     or (select count(*) from app.hire_evidence_files f
          where f.id = any (p_file_ids) and f.referral_id = p_referral and f.owner_kind = p_owner_kind
            and f.uploader_org_id = p_org and f.owner_id is null and f.removed_at is null and f.scan_status = 'clean') <> v_n then
    raise exception 'hire_report_files_not_ready' using errcode = 'P0001';
  end if;
  update app.hire_evidence_files set owner_id = p_owner where id = any (p_file_ids);
  return v_n;
end $$;
revoke execute on function app.attach_hire_evidence(uuid, text, uuid, uuid[], uuid, integer) from public, anon, authenticated;

-- Worker (service role): scan target and result, written once.
create function public.hire_evidence_scan_target(p_file uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', f.id, 'storage_path', f.storage_path, 'mime_type', f.mime_type, 'size_bytes', f.size_bytes)
    from app.hire_evidence_files f
   where f.id = p_file and f.removed_at is null and f.scan_status = 'pending';
$$;

create function public.record_hire_evidence_scan(p_file uuid, p_verdict text, p_sha256 text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  f app.hire_evidence_files;
begin
  if auth.uid() is not null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_verdict not in ('clean', 'rejected') then raise exception 'invalid_verdict' using errcode = '22023'; end if;
  if p_verdict = 'clean' and (p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$') then
    raise exception 'invalid_sha256' using errcode = '22023';
  end if;
  select * into f from app.hire_evidence_files where id = p_file for update;
  if not found or f.removed_at is not null or f.scan_status <> 'pending' then return; end if;
  update app.hire_evidence_files
     set scan_status = p_verdict::public.document_scan_status,
         sha256 = case when p_verdict = 'clean' then p_sha256 end, scanned_at = now()
   where id = f.id;
end $$;

-- Drafts never filed (24 h) and objects never registered: the worker deletes the returned paths, then forgets.
create function public.purge_orphan_hire_files() returns setof text
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    update app.hire_evidence_files f set removed_at = coalesce(f.removed_at, now())
     where f.owner_id is null and f.removed_at is null and f.uploaded_at < now() - interval '24 hours'
    returning f.storage_path;  -- removed drafts were deleted by remove_hire_evidence's caller already
  return query
    select o.name from storage.objects o
     where o.bucket_id = 'hire-evidence' and o.created_at < now() - interval '24 hours'
       and not exists (select 1 from app.hire_evidence_files f where f.storage_path = o.name)
     limit 1000;
end $$;

revoke execute on function public.register_hire_evidence(uuid, text, text, text, uuid), public.list_hire_evidence_files(uuid, text, uuid),
  public.remove_hire_evidence(uuid, uuid), public.authorize_hire_evidence(uuid, uuid) from public, anon;
grant execute on function public.register_hire_evidence(uuid, text, text, text, uuid), public.list_hire_evidence_files(uuid, text, uuid),
  public.remove_hire_evidence(uuid, uuid), public.authorize_hire_evidence(uuid, uuid) to authenticated;
revoke execute on function public.hire_evidence_scan_target(uuid), public.record_hire_evidence_scan(uuid, text, text),
  public.purge_orphan_hire_files() from public, anon, authenticated;
grant execute on function public.hire_evidence_scan_target(uuid), public.record_hire_evidence_scan(uuid, text, text),
  public.purge_orphan_hire_files() to service_role;
