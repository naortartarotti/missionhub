-- N1 PM decisions on the held QA items (brief rev. 4.2, PD-029 to PD-033).
--
-- PD-029 (B-2) An earlier referral E is judged as evidence against the claimed referral C as of
--         C's delivery: E's ownership window and release are checked at C.delivered_at (a release
--         after C's delivery no longer changes anything the hiring side sees); "no upheld or final
--         claim, not already presented" is checked now. Same job / client-key snapshot and
--         "delivered before C" as before. Every ineligible reason gives claim_referral_invalid.
-- PD-032 (m-9) A referral awaiting the candidate on an expired link is not pending: the check
--         ignores it and the sweep deletes its fingerprints. A resend (rotate_candidate_request_token)
--         recomputes them in the database. A resend runs no stop check.
-- m-5    Admin lookup of a stop by its opaque support reference.

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
       -- as of C's delivery
       and er.ownership_protected_until > r.delivered_at
       and (ep.released_at is null or ep.released_at > r.delivered_at)
       -- as of now
       and er.status <> 'already_presented'
       and (ep.void_reason is null or ep.void_reason = 'released')
       and not exists (
         select 1 from app.referral_claims c
          where c.referral_id = er.id
            and (c.status in ('upheld', 'final') or (c.status = 'open' and c.contest_deadline_at <= now())))
  );
$$;
revoke execute on function app.evidence_referral_ok(uuid, uuid) from public, anon, authenticated;

create or replace function app.presentation_check(p_candidate uuid, p_job uuid, p_exclude uuid default null)
returns table (outcome text, scope text, earlier_internal boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_target uuid;
  v_key text;
  v_hashes bytea[];
  v_ver smallint := app.fingerprint_key_version();
  v_same_job boolean;
  v_internal boolean;
begin
  select j.organization_id into v_target from public.jobs j where j.id = p_job;
  select k.client_key into v_key from app.job_client_keys k where k.job_id = p_job;
  select array_agg(f.fp_hash) into v_hashes from app.candidate_fingerprints(p_candidate) f;

  if coalesce(cardinality(v_hashes), 0) = 0 then
    return query select 'identifier_required'::text, null::text, null::boolean;
    return;
  end if;

  if exists (
    select 1 from app.sticky_stops s
     where s.candidate_id = p_candidate and s.target_org_id = v_target and s.expires_at > now()
       and (s.job_id = p_job or (v_key is not null and s.client_key = v_key))
  ) then
    return query select 'sticky'::text, null::text, null::boolean;
    return;
  end if;

  select (p.job_id = p_job), r.internal into v_same_job, v_internal
    from app.referral_fingerprints f
    join app.referral_presentations p on p.referral_id = f.referral_id
    join public.referrals r on r.id = f.referral_id
   where f.hash = any (v_hashes) and f.key_version = v_ver
     and (p_exclude is null or f.referral_id <> p_exclude)
     and p.target_org_id = v_target
     and (p.job_id = p_job or (v_key is not null and p.client_key = v_key))
     and app.presentation_counts(r.id)
   order by (p.job_id = p_job) desc
   limit 1;
  if found then
    return query select 'stop'::text, case when v_same_job then 'job' else 'client' end, v_internal;
    return;
  end if;

  select (p.job_id = p_job), r.internal into v_same_job, v_internal
    from app.referral_fingerprints f
    join app.referral_presentations p on p.referral_id = f.referral_id
    join public.referrals r on r.id = f.referral_id
    left join app.job_client_keys jk on jk.job_id = p.job_id
    join public.referral_candidate_requests q on q.referral_id = r.id
   where f.hash = any (v_hashes) and f.key_version = v_ver
     and (p_exclude is null or f.referral_id <> p_exclude)
     and p.target_org_id = v_target
     and r.status = 'awaiting_candidate'
     and q.expires_at >= now()            -- PD-032: an expired link is no longer pending
     and (p.job_id = p_job or (v_key is not null and jk.client_key = v_key))
   order by (p.job_id = p_job) desc
   limit 1;
  if found then
    return query select 'pending'::text, case when v_same_job then 'job' else 'client' end, v_internal;
    return;
  end if;

  return query select 'clear'::text, null::text, null::boolean;
end $$;
revoke execute on function app.presentation_check(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.purge_presentation_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_fp integer;
  v_sticky integer;
begin
  delete from app.referral_fingerprints f
   using public.referrals r
   where r.id = f.referral_id
     and (r.ownership_protected_until <= now()
          or r.status in ('candidate_declined', 'already_presented')
          or (r.delivered_at is null and r.status <> 'awaiting_candidate')
          -- PD-032: awaiting the candidate on an expired link (a resend recomputes them).
          or (r.status = 'awaiting_candidate' and exists (
                select 1 from public.referral_candidate_requests q where q.referral_id = r.id and q.expires_at < now())))
     and not exists (select 1 from public.disputes d where d.referral_id = r.id and d.status = 'open');
  get diagnostics v_fp = row_count;
  delete from app.sticky_stops where expires_at <= now();
  get diagnostics v_sticky = row_count;
  return jsonb_build_object('fingerprints', v_fp, 'sticky_stops', v_sticky);
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

-- Support lookup (m-5): a platform admin finds a stop by the reference shown to the submitter.
create or replace function public.get_stop_by_reference(p_reference text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_reference is null or p_reference !~ '^[0-9]{8}$' then raise exception 'not_found' using errcode = 'P0002'; end if;
  select jsonb_build_object(
      'reference', h.reference, 'created_at', h.created_at, 'outcome', h.outcome, 'scope', h.scope,
      'earlier_internal', h.earlier_internal, 'audit_event_id', h.audit_event_id,
      'source_org', jsonb_build_object('id', so.id, 'name', so.name),
      'target_org', jsonb_build_object('id', tg.id, 'name', tg.name),
      'job_id', h.job_id, 'job_title', j.title, 'source_user_id', h.source_user_id)
      from app.presentation_hits h
      join public.organizations so on so.id = h.source_org_id
      join public.organizations tg on tg.id = h.target_org_id
      left join public.jobs j on j.id = h.job_id
     where h.reference = p_reference
  into v;
  if v is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return v;
end $$;
revoke execute on function public.get_stop_by_reference(text) from public, anon;
grant execute on function public.get_stop_by_reference(text) to authenticated;
