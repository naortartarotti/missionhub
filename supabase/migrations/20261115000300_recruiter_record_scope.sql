-- Recruiter record scope (RD-036, founder decision 2026-11-15).
--
-- Inside an agency, a plain `recruiter` sees only their own records. `org_admin` and
-- `recruiter_manager` see the whole agency ("agency-wide", app.sees_all).
--
--   candidates + child rows (experiences, documents, consents, referral links/requests, storage
--   objects, external refs) .... candidates.owner_id = auth.uid()
--   jobs ......................... readable by every member; insert/update by the owner (or manager)
--   referrals, sent .............. the caller owns the referral's candidate
--   referrals, received .......... the caller owns the target job
--   referral messages, events, grants, shared profiles, agreements .... follow the referral
--   placements, ledger, invoices, payment evidence, placement disputes . follow the referral
--   matches / opportunities ...... only the caller's own candidates
--   notifications ................ referral/placement notifications go only to members who can
--                                  see that record (owner + managers), never the whole org
--
-- RLS is not enough on its own: SECURITY DEFINER functions bypass it, so every definer function
-- that acts on candidates, referrals, matches or placements on behalf of the caller is redefined
-- below with the same rule (see docs/specs/recruiter-record-scope/backend.md for the full audit,
-- including the functions deliberately left alone).
--
-- When a record's owner leaves the agency, their records stay owned by them: only managers see
-- them until an org admin moves the portfolio with transfer_member_portfolio().

-- ---------------------------------------------------------------------------
-- 1. Visibility helpers
-- ---------------------------------------------------------------------------

-- Agency-wide roles. Used in RLS policies (executable by authenticated).
create or replace function app.sees_all(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.has_role(p_org, array['org_admin', 'recruiter_manager']::public.membership_role[]);
$$;

-- User-parameterised cores. Internal only: used by the auth.uid() wrappers below, by notification
-- fan-out (which runs for other users) and by service-role RPCs that receive a server-supplied actor.
create or replace function app.user_is_member(p_user uuid, p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and exists (
    select 1
      from public.organization_memberships m
      join public.organizations o on o.id = m.organization_id
     where m.organization_id = p_org and m.user_id = p_user
       and m.status = 'active' and o.suspended_at is null
  );
$$;

create or replace function app.user_sees_all(p_user uuid, p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and exists (
    select 1
      from public.organization_memberships m
      join public.organizations o on o.id = m.organization_id
     where m.organization_id = p_org and m.user_id = p_user
       and m.status = 'active' and o.suspended_at is null
       and m.role in ('org_admin', 'recruiter_manager')
  );
$$;

create or replace function app.user_can_access_candidate(p_user uuid, p_candidate uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.candidates c
     where c.id = p_candidate
       and app.user_is_member(p_user, c.organization_id)
       and (c.owner_id = p_user or app.user_sees_all(p_user, c.organization_id))
  );
$$;

-- Sourcing side: member of the source org AND (manager OR owner of the referral's candidate).
create or replace function app.user_sees_referral_as_source(p_user uuid, p_referral uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.referrals r
     where r.id = p_referral
       and app.user_is_member(p_user, r.source_org_id)
       and (app.user_sees_all(p_user, r.source_org_id)
            or exists (select 1
                         from public.referral_candidate_links l
                         join public.candidates c on c.id = l.candidate_id
                        where l.referral_id = r.id and c.organization_id = r.source_org_id
                          and c.owner_id = p_user))
  );
$$;

-- Hiring side: member of the target org, referral not hidden from the target, AND (manager OR
-- owner of the target job).
create or replace function app.user_sees_referral_as_target(p_user uuid, p_referral uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.referrals r
     where r.id = p_referral
       and not app.hidden_from_target(r.status)
       and app.user_is_member(p_user, r.target_org_id)
       and (app.user_sees_all(p_user, r.target_org_id)
            or exists (select 1 from public.jobs j
                        where j.id = r.job_id and j.organization_id = r.target_org_id
                          and j.owner_id = p_user))
  );
$$;

-- Session wrappers (auth.uid()). Used in RLS policies and definer RPCs.
create or replace function app.can_access_candidate(p_candidate uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.user_can_access_candidate(auth.uid(), p_candidate);
$$;

create or replace function app.sees_referral_as_source(p_referral uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.user_sees_referral_as_source(auth.uid(), p_referral);
$$;

create or replace function app.sees_referral_as_target(p_referral uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.user_sees_referral_as_target(auth.uid(), p_referral);
$$;

-- Job writes (edit, status, releasing pending referrals): the owner or a manager.
create or replace function app.can_manage_job(p_job uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.jobs j
     where j.id = p_job
       and app.is_member(j.organization_id)
       and (j.owner_id = auth.uid() or app.sees_all(j.organization_id))
  );
$$;

-- Storage paths {organization_id}/{candidate_id}/{file}: the candidate must live in that org and the
-- caller must have access to it. Malformed paths are refused instead of raising a cast error.
create or replace function app.can_access_candidate_object(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uuid constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  v_org uuid;
  v_candidate uuid;
begin
  if p_name is null or p_name !~* ('^' || v_uuid || '/' || v_uuid || '/[^/]+$') then return false; end if;
  v_org := split_part(p_name, '/', 1)::uuid;
  v_candidate := split_part(p_name, '/', 2)::uuid;
  return exists (select 1 from public.candidates c where c.id = v_candidate and c.organization_id = v_org)
     and app.can_access_candidate(v_candidate);
end $$;

-- Shared profile snapshot: sourcing side always; hiring side while sharing is not revoked.
create or replace function app.can_see_shared_profile(p_referral uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.sees_referral_as_source(p_referral)
      or (app.sees_referral_as_target(p_referral)
          and exists (select 1 from public.referrals r where r.id = p_referral and r.sharing_revoked_at is null));
$$;

-- Which candidate document backs a shared grant: sourcing side only.
create or replace function app.sees_grant_as_source(p_grant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.referral_document_grants g
     where g.id = p_grant and app.sees_referral_as_source(g.referral_id)
  );
$$;

-- Referral visibility used by many policies (messages, events, grants, agreements) and RPCs.
create or replace function app.can_see_referral(p_referral uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.sees_referral_as_source(p_referral) or app.sees_referral_as_target(p_referral);
$$;

-- Placements and everything hanging off them follow their referral. Platform admins unchanged.
create or replace function app.can_see_placement(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_platform_admin() or exists (
    select 1 from public.placements x
     where x.id = p
       and (app.sees_referral_as_source(x.referral_id) or app.sees_referral_as_target(x.referral_id))
  );
$$;

create or replace function app.referral_side(p_referral uuid) returns public.referral_side
language sql stable security definer set search_path = '' as $$
  select case
    when app.sees_referral_as_source(p_referral) then 'source'::public.referral_side
    when app.sees_referral_as_target(p_referral) then 'target'::public.referral_side
  end;
$$;

revoke execute on function
  app.sees_all(uuid),
  app.user_is_member(uuid, uuid),
  app.user_sees_all(uuid, uuid),
  app.user_can_access_candidate(uuid, uuid),
  app.user_sees_referral_as_source(uuid, uuid),
  app.user_sees_referral_as_target(uuid, uuid),
  app.can_access_candidate(uuid),
  app.sees_referral_as_source(uuid),
  app.sees_referral_as_target(uuid),
  app.can_manage_job(uuid),
  app.can_access_candidate_object(text),
  app.can_see_shared_profile(uuid),
  app.sees_grant_as_source(uuid)
from public, anon, authenticated;

-- RLS predicates: the policies run as the caller, so the caller needs EXECUTE (app is not exposed
-- through PostgREST). The user_* cores stay closed.
grant execute on function
  app.sees_all(uuid),
  app.can_access_candidate(uuid),
  app.sees_referral_as_source(uuid),
  app.sees_referral_as_target(uuid),
  app.can_manage_job(uuid),
  app.can_access_candidate_object(text),
  app.can_see_shared_profile(uuid),
  app.sees_grant_as_source(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Notifications: referral and placement events reach only the members who can see the record
-- ---------------------------------------------------------------------------

-- Who in p_org may be told about this referral: managers, or the owner of the side's record
-- (candidate on the sourcing side, job on the hiring side). No "hidden from target" filter: the
-- caller decided the event is deliverable. A null referral means "managers only".
create or replace function app.notify_eligible(p_user uuid, p_org uuid, p_referral uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.user_sees_all(p_user, p_org) or (p_referral is not null and exists (
    select 1 from public.referrals r
     where r.id = p_referral
       and ((r.source_org_id = p_org and exists (
               select 1 from public.referral_candidate_links l
                 join public.candidates c on c.id = l.candidate_id
                where l.referral_id = r.id and c.owner_id = p_user))
         or (r.target_org_id = p_org and exists (
               select 1 from public.jobs j where j.id = r.job_id and j.owner_id = p_user)))
  ));
$$;
revoke execute on function app.notify_eligible(uuid, uuid, uuid) from public, anon, authenticated;

-- Every caller passes '/referrals/{id}' or '/commissions/{placement id}' as the link (audited for
-- this migration); the record is derived from it so the 20+ call sites keep their signature.
-- Links of any other shape keep the old org-wide fan-out (no such caller exists today; a new
-- record-scoped notification must use one of the two link shapes).
-- p_only_user: delivered only to that user when they are eligible; if they are not (left the
-- agency, lost the record), it falls back to every eligible member instead of nobody.
create or replace function app.notify_org(p_org uuid, p_kind text, p_title text, p_body text, p_link text,
                                          p_only_user uuid default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uuid constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  v_scoped boolean := false;
  v_ref uuid;
  v_only boolean;
begin
  if p_link ~* ('^/referrals/' || v_uuid || '$') then
    v_scoped := true;
    v_ref := substring(p_link from 12)::uuid;
  elsif p_link ~* ('^/commissions/' || v_uuid || '$') then
    v_scoped := true;
    select x.referral_id into v_ref from public.placements x where x.id = substring(p_link from 14)::uuid;
  end if;

  v_only := p_only_user is not null and exists (
    select 1 from public.organization_memberships m
     where m.organization_id = p_org and m.user_id = p_only_user and m.status = 'active'
       and (not v_scoped or app.notify_eligible(m.user_id, p_org, v_ref)));

  insert into public.notifications (user_id, organization_id, kind, title, body, link)
  select m.user_id, p_org, p_kind, p_title, p_body, p_link
    from public.organization_memberships m
   where m.organization_id = p_org and m.status = 'active'
     and (not v_scoped or app.notify_eligible(m.user_id, p_org, v_ref))
     and (not v_only or m.user_id = p_only_user)
     and not exists (
       select 1 from public.notification_preferences np
        where np.user_id = m.user_id and np.kind = p_kind and np.in_app = false
     );
end $$;
revoke execute on function app.notify_org(uuid, text, text, text, text, uuid) from public, anon, authenticated;

-- The submitter if they still see the referral; otherwise its current candidate owner and the
-- managers (previously: org admins only).
create or replace function app.notify_submitter(p_referral uuid, p_kind text, p_title text, p_body text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
begin
  select * into r from public.referrals where id = p_referral;
  if not found then return; end if;
  perform app.notify_org(r.source_org_id, p_kind, p_title, p_body, '/referrals/' || r.id, r.source_user_id);
end $$;
revoke execute on function app.notify_submitter(uuid, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS policies
-- ---------------------------------------------------------------------------

-- Candidates: owner or manager. Recruiters can only create, and keep, candidates they own.
drop policy if exists candidates_select on public.candidates;
create policy candidates_select on public.candidates for select to authenticated
  using (app.is_member(organization_id) and status <> 'deleted'
         and (owner_id = (select auth.uid()) or app.sees_all(organization_id)));
drop policy if exists candidates_insert on public.candidates;
create policy candidates_insert on public.candidates for insert to authenticated
  with check (app.is_member(organization_id) and created_by = (select auth.uid())
              and (owner_id = (select auth.uid()) or app.sees_all(organization_id)));
drop policy if exists candidates_update on public.candidates;
create policy candidates_update on public.candidates for update to authenticated
  using (app.is_member(organization_id) and (owner_id = (select auth.uid()) or app.sees_all(organization_id)))
  with check (app.is_member(organization_id) and (owner_id = (select auth.uid()) or app.sees_all(organization_id)));

drop policy if exists candidate_experiences_all on public.candidate_experiences;
create policy candidate_experiences_all on public.candidate_experiences for all to authenticated
  using (app.is_member(organization_id) and app.can_access_candidate(candidate_id))
  with check (app.is_member(organization_id) and app.can_access_candidate(candidate_id));

drop policy if exists candidate_documents_select on public.candidate_documents;
create policy candidate_documents_select on public.candidate_documents for select to authenticated
  using (app.is_member(organization_id) and deleted_at is null and app.can_access_candidate(candidate_id));
drop policy if exists candidate_documents_insert on public.candidate_documents;
create policy candidate_documents_insert on public.candidate_documents for insert to authenticated
  with check (app.is_member(organization_id) and uploaded_by = (select auth.uid()) and app.can_access_candidate(candidate_id));
drop policy if exists candidate_documents_update on public.candidate_documents;
create policy candidate_documents_update on public.candidate_documents for update to authenticated
  using (app.is_member(organization_id) and app.can_access_candidate(candidate_id))
  with check (app.is_member(organization_id) and app.can_access_candidate(candidate_id));

drop policy if exists candidate_consents_select on public.candidate_consents;
create policy candidate_consents_select on public.candidate_consents for select to authenticated
  using (app.is_member(organization_id) and app.can_access_candidate(candidate_id));
drop policy if exists candidate_consents_insert on public.candidate_consents;
create policy candidate_consents_insert on public.candidate_consents for insert to authenticated
  with check (app.is_member(organization_id) and recorded_by = (select auth.uid()) and app.can_access_candidate(candidate_id));
drop policy if exists candidate_consents_update on public.candidate_consents;
create policy candidate_consents_update on public.candidate_consents for update to authenticated
  using (app.is_member(organization_id) and app.can_access_candidate(candidate_id))
  with check (app.is_member(organization_id) and app.can_access_candidate(candidate_id));

-- Connector bookkeeping: candidate mappings follow the candidate (job mappings stay org-wide, like jobs).
drop policy if exists external_refs_select on public.external_refs;
create policy external_refs_select on public.external_refs for select to authenticated
  using (app.is_member(organization_id) and (entity_type <> 'candidate' or app.can_access_candidate(entity_id)));

-- Jobs: readable by the whole agency (internal referrals, no duplicate postings); written by the
-- owner or a manager.
drop policy if exists jobs_insert on public.jobs;
create policy jobs_insert on public.jobs for insert to authenticated
  with check (app.is_member(organization_id) and created_by = (select auth.uid())
              and (owner_id = (select auth.uid()) or app.sees_all(organization_id)));
drop policy if exists jobs_update on public.jobs;
create policy jobs_update on public.jobs for update to authenticated
  using (app.is_member(organization_id) and (owner_id = (select auth.uid()) or app.sees_all(organization_id)))
  with check (app.is_member(organization_id) and (owner_id = (select auth.uid()) or app.sees_all(organization_id)));

-- Referrals and their source-only rows.
drop policy if exists referrals_select on public.referrals;
create policy referrals_select on public.referrals for select to authenticated
  using (app.can_see_referral(id));

drop policy if exists referral_links_select on public.referral_candidate_links;
create policy referral_links_select on public.referral_candidate_links for select to authenticated
  using (app.is_member(organization_id) and app.can_access_candidate(candidate_id));

drop policy if exists referral_candidate_requests_select on public.referral_candidate_requests;
create policy referral_candidate_requests_select on public.referral_candidate_requests for select to authenticated
  using (app.is_member(organization_id) and app.can_access_candidate(candidate_id));

drop policy if exists referral_doc_sources_select on public.referral_document_sources;
create policy referral_doc_sources_select on public.referral_document_sources for select to authenticated
  using (app.is_member(organization_id) and app.sees_grant_as_source(grant_id));

drop policy if exists referral_profiles_select on public.referral_shared_profiles;
create policy referral_profiles_select on public.referral_shared_profiles for select to authenticated
  using (app.can_see_shared_profile(referral_id));

-- Messages: author writes only on a side they can see.
drop policy if exists referral_messages_insert on public.referral_messages;
create policy referral_messages_insert on public.referral_messages for insert to authenticated
  with check (author_id = (select auth.uid()) and (
    (author_side = 'source' and app.sees_referral_as_source(referral_id))
    or (author_side = 'target' and app.sees_referral_as_target(referral_id))));
-- referral_messages_select, referral_events_select, referral_grants_select and agreements_select use
-- app.can_see_referral(), redefined above.

-- Placements: follow the referral (ledger, invoices, evidence, events and placement disputes use
-- app.can_see_placement(), redefined above).
drop policy if exists placements_select on public.placements;
create policy placements_select on public.placements for select to authenticated
  using (app.can_see_placement(id));

-- Prior-presentation disputes: the opening org's members who can see the referral.
drop policy if exists disputes_select on public.disputes;
create policy disputes_select on public.disputes for select to authenticated
  using ((kind = 'placement' and app.can_see_placement(placement_id))
      or (kind = 'prior_presentation'
          and (app.is_platform_admin() or (app.is_member(opened_by_org) and app.can_see_referral(referral_id)))));

-- Storage: candidate documents and photos follow the candidate.
drop policy if exists candidate_docs_select on storage.objects;
create policy candidate_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'candidate-documents' and app.can_access_candidate_object(name));
drop policy if exists candidate_docs_insert on storage.objects;
create policy candidate_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'candidate-documents' and app.can_access_candidate_object(name));

drop policy if exists candidate_photos_select on storage.objects;
create policy candidate_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'candidate-photos' and app.can_access_candidate_object(name));
drop policy if exists candidate_photos_insert on storage.objects;
create policy candidate_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'candidate-photos' and app.can_access_candidate_object(name));
drop policy if exists candidate_photos_delete on storage.objects;
create policy candidate_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'candidate-photos' and app.can_access_candidate_object(name));

-- ---------------------------------------------------------------------------
-- 4. SECURITY DEFINER functions that act for the caller: same rule as RLS
-- (generated from the live definitions; only the access predicates change)
-- ---------------------------------------------------------------------------

-- app.acting_side: Acting side requires the caller to see the referral on that side (owner or manager).
CREATE OR REPLACE FUNCTION app.acting_side(p_referral uuid, p_acting_org uuid)
 RETURNS referral_side
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when p_acting_org is null or not app.is_member(p_acting_org) then null
    when p_acting_org = r.source_org_id and app.sees_referral_as_source(r.id) then 'source'::public.referral_side
    when p_acting_org = r.target_org_id and app.sees_referral_as_target(r.id) then 'target'::public.referral_side
  end
  from public.referrals r where r.id = p_referral;
$function$;

-- app.source_referral: Sourcing-side guard used by contest_prior_presentation_claim (and any future source RPC).
CREATE OR REPLACE FUNCTION app.source_referral(p_referral uuid, p_acting_org uuid, p_lock boolean DEFAULT false)
 RETURNS referrals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.referrals;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if p_lock then
    select * into r from public.referrals where id = p_referral for update;
  else
    select * into r from public.referrals where id = p_referral;
  end if;
  if not found or not app.sees_referral_as_source(r.id)
     or (p_acting_org is not null and p_acting_org <> r.source_org_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return r;
end $function$;

-- app.target_referral: Hiring-side guard used by claims and claim evidence RPCs.
CREATE OR REPLACE FUNCTION app.target_referral(p_referral uuid, p_acting_org uuid, p_lock boolean DEFAULT false)
 RETURNS referrals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.referrals;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if p_lock then
    select * into r from public.referrals where id = p_referral for update;
  else
    select * into r from public.referrals where id = p_referral;
  end if;
  if not found or not app.sees_referral_as_target(r.id)
     or (p_acting_org is not null and p_acting_org <> r.target_org_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return r;
end $function$;

-- app.assert_referable: Submitting requires access to the candidate (owner or manager). Same 'forbidden' as before.
CREATE OR REPLACE FUNCTION app.assert_referable(p_candidate uuid, p_job uuid, p_fields text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c public.candidates;
  j public.jobs;
  v_allowed text[] := array['full_name','email','phone','headline','summary','location','seniority','skills',
                            'languages','work_arrangements','salary_expectation','availability','experience','mobility'];
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;

  select * into c from public.candidates where id = p_candidate for update;
  if not found or not app.is_member(c.organization_id) or not app.can_access_candidate(c.id) then
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
end $function$;

-- app.assert_own_match: Match triage only on the caller's own candidates (managers: the agency's).
CREATE OR REPLACE FUNCTION app.assert_own_match(p_org uuid, p_match uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.is_member(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.matches m where m.id = p_match and m.candidate_org_id = p_org
                   and app.can_access_candidate(m.candidate_id)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end $function$;

-- app.can_upload_claim_evidence: Claim-evidence uploads only by whoever sees the referral as the hiring side.
CREATE OR REPLACE FUNCTION app.can_upload_claim_evidence(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_ref uuid;
begin
  if p_name is null or p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|png|jpg)$' then return false; end if;
  v_org := split_part(p_name, '/', 1)::uuid;
  v_ref := split_part(p_name, '/', 2)::uuid;
  return app.is_member(v_org)
     and exists (select 1 from public.referrals r where r.id = v_ref and r.target_org_id = v_org
                   and app.sees_referral_as_target(r.id))
     and app.claim_blocker(v_ref) is null;
end $function$;

-- app.evidence_referral_ok: An earlier referral can be cited as evidence only if the caller sees it as the hiring side
-- (job owner or manager). Only called from user-session RPCs (list_claim_evidence_referrals, file_prior_presentation_claim).
CREATE OR REPLACE FUNCTION app.evidence_referral_ok(p_claimed uuid, p_evidence uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
      from public.referrals r
      join app.referral_presentations rp on rp.referral_id = r.id
      join public.referrals er on er.id = p_evidence
      join app.referral_presentations ep on ep.referral_id = er.id
     where r.id = p_claimed
       and app.sees_referral_as_target(er.id)
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
$function$;

-- public.transition_referral: The 'member of both orgs' branch now needs visibility on both sides.
CREATE OR REPLACE FUNCTION public.transition_referral(p_referral uuid, p_to referral_status, p_reason text, p_expected_version integer, p_acting_org uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  elsif app.sees_referral_as_source(r.id) and app.sees_referral_as_target(r.id) then
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
end $function$;

-- public.decline_referrals: Bulk decline only touches referrals the caller sees as the hiring side.
CREATE OR REPLACE FUNCTION public.decline_referrals(p_ids uuid[], p_reason_code text, p_note text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record;
  n integer := 0;
begin
  if cardinality(p_ids) > 200 then raise exception 'too_many' using errcode = '22023'; end if;
  for r in
    select id, version, target_org_id from public.referrals
     where id = any (p_ids) and status in ('submitted', 'under_review', 'info_requested')
       and app.sees_referral_as_target(id)
  loop
    begin
      -- Always as the hiring side: the row was selected because the caller is a member of it.
      perform public.review_referral(r.id, 'declined', p_reason_code, p_note, r.version, r.target_org_id);
      n := n + 1;
    exception when others then
      if sqlstate = '22023' then raise; end if; -- invalid reason: fail the whole batch
      -- stale version / concurrent change: skip this one
    end;
  end loop;
  return n;
end $function$;

-- public.decline_pending_for_job: Only the job owner or a manager releases a job's pending referrals.
CREATE OR REPLACE FUNCTION public.decline_pending_for_job(p_job uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_ids uuid[];
begin
  select organization_id into v_org from public.jobs where id = p_job;
  if v_org is null or not app.can_manage_job(p_job) then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(array_agg(id), '{}') into v_ids from public.referrals
   where job_id = p_job and target_org_id = v_org and status in ('submitted', 'under_review', 'info_requested');
  if cardinality(v_ids) = 0 then return 0; end if;
  return public.decline_referrals(v_ids, 'position_filled', null);
end $function$;

-- public.withdraw_referral: Sourcing side = candidate owner or manager.
CREATE OR REPLACE FUNCTION public.withdraw_referral(p_referral uuid, p_reason text, p_expected_version integer, p_release boolean DEFAULT false, p_acting_org uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.referrals;
  v_version integer;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select * into r from public.referrals where id = p_referral for update;
  if not found or not app.sees_referral_as_source(r.id)
     or (p_acting_org is not null and p_acting_org <> r.source_org_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if coalesce(p_release, false) and not app.release_allowed(r.id) then
    raise exception 'release_not_allowed' using errcode = 'P0001';
  end if;
  v_version := public.transition_referral(p_referral, 'withdrawn', p_reason, p_expected_version, r.source_org_id);
  if coalesce(p_release, false) then perform app.apply_release(p_referral); end if;
  return v_version;
end $function$;

-- public.release_referral: Sourcing side = candidate owner or manager.
CREATE OR REPLACE FUNCTION public.release_referral(p_referral uuid, p_acting_org uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.referrals;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select * into r from public.referrals where id = p_referral for update;
  if not found or not app.sees_referral_as_source(r.id)
     or (p_acting_org is not null and p_acting_org <> r.source_org_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if r.status not in ('withdrawn', 'cancelled') or not app.release_allowed(r.id) then
    raise exception 'release_not_allowed' using errcode = 'P0001';
  end if;
  perform app.apply_release(r.id);
end $function$;

-- public.confirm_agreement: Sourcing side = candidate owner or manager.
CREATE OR REPLACE FUNCTION public.confirm_agreement(p_referral uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.referrals;
begin
  select * into r from public.referrals where id = p_referral;
  if not found or not app.sees_referral_as_source(r.id) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.collaboration_agreements
     set status = 'active', source_accepted_by = auth.uid(), source_accepted_at = now()
   where referral_id = p_referral and status = 'pending_source';
  if not found then raise exception 'agreement_not_pending' using errcode = 'P0001'; end if;
  perform app.notify_org(r.target_org_id, 'agreement.active', 'Collaboration agreement confirmed',
    r.job_title_snapshot || ' — the partner recruiter confirmed the commission terms.', '/referrals/' || r.id);
  perform app.audit(r.source_org_id, 'agreement.confirmed', 'referral', r.id, '{}');
end $function$;

-- public.report_hire: Hiring side = job owner or manager.
CREATE OR REPLACE FUNCTION public.report_hire(p_referral uuid, p_fee_minor bigint, p_currency character, p_start_date date, p_expected_version integer, p_guarantee_days integer DEFAULT 90)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.referrals;
  a public.collaboration_agreements;
  v_id uuid;
begin
  select * into r from public.referrals where id = p_referral for update;
  if not found or not app.sees_referral_as_target(r.id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.version <> p_expected_version then raise exception 'stale_version' using errcode = 'P0001'; end if;
  if r.status <> 'offer' then raise exception 'invalid_transition: % -> hired', r.status using errcode = 'P0001'; end if;
  select * into a from public.collaboration_agreements where referral_id = r.id and status = 'active';
  if not found then raise exception 'agreement_required' using errcode = 'P0001'; end if;
  if p_fee_minor is null or p_fee_minor <= 0 or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid_fee' using errcode = '22023';
  end if;

  update public.referrals set status = 'hired', version = version + 1 where id = r.id;
  insert into public.referral_status_events (referral_id, from_status, to_status, actor_id, actor_side, reason)
  values (r.id, 'offer', 'hired', auth.uid(), 'target', 'Hire reported');

  insert into public.placements (referral_id, agreement_id, source_org_id, target_org_id, currency,
    contracted_fee_minor, start_date, guarantee_until, reported_by)
  values (r.id, a.id, r.source_org_id, r.target_org_id, p_currency, p_fee_minor, p_start_date,
    p_start_date + greatest(0, p_guarantee_days), auth.uid())
  returning id into v_id;
  insert into public.placement_status_events (placement_id, from_status, to_status, actor_id, reason)
  values (v_id, null, 'hire_reported', auth.uid(), 'Hire reported by job owner');

  perform app.notify_org(r.source_org_id, 'placement.hired', 'Your candidate was hired',
    r.job_title_snapshot || ' — commission is projected until the client payment is verified.', '/commissions/' || v_id);
  perform app.audit(r.target_org_id, 'placement.created', 'placement', v_id,
    jsonb_build_object('fee_minor', p_fee_minor, 'currency', p_currency));
  return v_id;
end $function$;

-- public.get_referral_presentation: Side resolution follows record visibility.
CREATE OR REPLACE FUNCTION public.get_referral_presentation(p_referral uuid, p_acting_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if p_acting_org = r.source_org_id and app.sees_referral_as_source(r.id) then
    v_side := 'source';
  elsif p_acting_org = r.target_org_id and app.sees_referral_as_target(r.id) then
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
end $function$;

-- public.authorize_claim_evidence: Hiring-side downloads need visibility of the referral (admin path unchanged).
CREATE OR REPLACE FUNCTION public.authorize_claim_evidence(p_file uuid, p_acting_org uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  f app.referral_claim_files;
  v_dispute uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select * into f from app.referral_claim_files where id = p_file and removed_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  if p_acting_org is not null then
    if p_acting_org <> f.target_org_id or not app.sees_referral_as_target(f.referral_id) then
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
end $function$;

-- public.authorize_referral_document: Shared documents only for whoever sees the referral.
CREATE OR REPLACE FUNCTION public.authorize_referral_document(p_grant uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  g public.referral_document_grants;
  r public.referrals;
begin
  select * into g from public.referral_document_grants where id = p_grant;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from public.referrals where id = g.referral_id;
  if not (app.sees_referral_as_source(r.id) or app.sees_referral_as_target(r.id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if g.revoked_at is not null or r.sharing_revoked_at is not null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if g.status <> 'available' or g.storage_path is null then
    raise exception 'document_not_ready' using errcode = 'P0001';
  end if;
  perform app.audit(case when app.sees_referral_as_target(r.id) then r.target_org_id else r.source_org_id end,
    'referral_document.accessed', 'referral', r.id, jsonb_build_object('grant_id', g.id));
  return g.storage_path;
end $function$;

-- public.audit_document_access: Candidate documents only for the candidate's owner or a manager.
CREATE OR REPLACE FUNCTION public.audit_document_access(p_document uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  d public.candidate_documents;
begin
  select * into d from public.candidate_documents where id = p_document and deleted_at is null;
  if not found or not app.is_member(d.organization_id) or not app.can_access_candidate(d.candidate_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.audit(d.organization_id, 'document.accessed', 'candidate_document', d.id, '{}');
end $function$;

-- public.rotate_candidate_request_token: Sourcing side = candidate owner or manager.
CREATE OR REPLACE FUNCTION public.rotate_candidate_request_token(p_referral uuid, p_ttl_days integer DEFAULT 14)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.referrals;
  v_email text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  -- BR-10: counted here, once per resend, so direct PostgREST calls count too.
  perform app.enforce_rate_limit('referral.candidate_resend', 10, 3600);
  select * into r from public.referrals where id = p_referral for update;
  if not found or not app.sees_referral_as_source(r.id) then raise exception 'forbidden' using errcode = '42501'; end if;
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
end $function$;

-- public.record_candidate_request_delivery: Sourcing side = candidate owner or manager.
CREATE OR REPLACE FUNCTION public.record_candidate_request_delivery(p_referral uuid, p_ok boolean, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.referral_candidate_requests
     set sent_at = case when p_ok then now() else sent_at end,
         send_count = send_count + case when p_ok then 1 else 0 end,
         last_attempt_at = now(),
         last_send_error = case when p_ok then null else left(coalesce(p_error, 'failed'), 200) end
   where referral_id = p_referral and app.is_member(organization_id) and app.sees_referral_as_source(referral_id);
end $function$;

-- public.issue_candidate_request_token: The actor (session user passed by the server) must see the referral as the sourcing side.
CREATE OR REPLACE FUNCTION public.issue_candidate_request_token(p_referral uuid, p_actor uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if not app.user_sees_referral_as_source(p_actor, r.id) then
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
end $function$;

-- public.open_dispute: The disputing side is resolved from record visibility, not bare membership.
CREATE OR REPLACE FUNCTION public.open_dispute(p_placement uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_org := case when app.sees_referral_as_source(p.referral_id) then p.source_org_id
                when app.sees_referral_as_target(p.referral_id) then p.target_org_id end;
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
end $function$;

-- public.record_invoice: Hiring side = job owner or manager.
CREATE OR REPLACE FUNCTION public.record_invoice(p_placement uuid, p_number text, p_amount_minor bigint, p_tax_minor bigint, p_issued_on date, p_due_on date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  p public.placements;
  v_id uuid;
begin
  select * into p from public.placements where id = p_placement for update;
  if not found or not app.sees_referral_as_target(p.referral_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p.status in ('settled', 'cancelled', 'disputed') then raise exception 'placement_locked' using errcode = 'P0001'; end if;
  insert into public.invoice_records (placement_id, invoice_number, amount_minor, tax_minor, currency, issued_on, due_on, recorded_by)
  values (p.id, p_number, p_amount_minor, coalesce(p_tax_minor, 0), p.currency, p_issued_on, p_due_on, auth.uid())
  returning id into v_id;
  if p.status = 'hire_reported' then
    perform app.placement_transition(p.id, 'invoiced', 'Invoice ' || p_number || ' recorded');
  end if;
  perform app.audit(p.target_org_id, 'placement.invoice_recorded', 'placement', p.id, jsonb_build_object('invoice_id', v_id));
  return v_id;
end $function$;

-- public.record_payment_evidence: Hiring side = job owner or manager.
CREATE OR REPLACE FUNCTION public.record_payment_evidence(p_placement uuid, p_kind evidence_kind, p_amount_minor bigint, p_processing_fee_minor bigint, p_occurred_on date, p_reference text, p_notes text, p_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  p public.placements;
  v_id uuid;
begin
  select id into v_id from public.payment_evidence where idempotency_key = p_idempotency_key;
  if v_id is not null then return v_id; end if;

  select * into p from public.placements where id = p_placement for update;
  if not found or not app.sees_referral_as_target(p.referral_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p.status in ('settled', 'cancelled', 'disputed') then raise exception 'placement_locked' using errcode = 'P0001'; end if;
  if p_kind = 'client_payment' and not exists (select 1 from public.invoice_records where placement_id = p.id) then
    raise exception 'invoice_required' using errcode = 'P0001';
  end if;
  if p_kind in ('sourcing_payout', 'platform_remittance')
     and p.status not in ('commission_payable', 'payment_partially_verified') then
    raise exception 'commission_not_payable' using errcode = 'P0001';
  end if;

  insert into public.payment_evidence (placement_id, kind, amount_minor, processing_fee_minor, currency, occurred_on,
    reference, notes, idempotency_key, recorded_by, recorded_by_org)
  values (p.id, p_kind, p_amount_minor, coalesce(p_processing_fee_minor, 0), p.currency, p_occurred_on,
    p_reference, p_notes, p_idempotency_key, auth.uid(), p.target_org_id)
  returning id into v_id;

  if p_kind = 'sourcing_payout' then
    perform app.notify_org(p.source_org_id, 'commission.payout_reported', 'Payout reported — please confirm receipt',
      'The partner recruiter reported a commission payout. Confirm once the funds arrive.', '/commissions/' || p.id);
  end if;
  perform app.audit(p.target_org_id, 'evidence.recorded', 'placement', p.id,
    jsonb_build_object('evidence_id', v_id, 'kind', p_kind, 'amount_minor', p_amount_minor));
  return v_id;
end $function$;

-- public.review_payment_evidence: Payout receipt is confirmed by the candidate's owner or a manager of the sourcing org.
CREATE OR REPLACE FUNCTION public.review_payment_evidence(p_evidence uuid, p_approve boolean, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  e public.payment_evidence;
  p public.placements;
  a public.collaboration_agreements;
  v_alloc bigint[];
  v_distributable bigint;
  v_received bigint;
  v_sourcing_due bigint;
  v_platform_due bigint;
begin
  select * into e from public.payment_evidence where id = p_evidence for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into p from public.placements where id = e.placement_id for update;
  select * into a from public.collaboration_agreements where id = p.agreement_id;

  if e.recorded_by = auth.uid() then raise exception 'four_eyes_required' using errcode = '42501'; end if;
  if not (
    app.is_platform_admin()
    or (e.kind = 'sourcing_payout' and app.sees_referral_as_source(p.referral_id))
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if e.status <> 'pending' then raise exception 'already_reviewed' using errcode = 'P0001'; end if;
  if p.status = 'disputed' then raise exception 'placement_locked' using errcode = 'P0001'; end if;

  update public.payment_evidence
     set status = case when p_approve then 'verified'::public.evidence_status else 'rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(p_note, 1000)
   where id = e.id;

  if not p_approve then
    perform app.audit(p.target_org_id, 'evidence.rejected', 'placement', p.id, jsonb_build_object('evidence_id', e.id));
    return;
  end if;

  -- Payouts may never exceed the outstanding verified obligation.
  if e.kind = 'sourcing_payout' and e.amount_minor > (
    select coalesce(sum(amount_minor), 0) from public.commission_ledger_entries where placement_id = p.id and party = 'sourcing'
  ) then
    raise exception 'payout_exceeds_balance' using errcode = 'P0001';
  end if;
  if e.kind = 'platform_remittance' and e.amount_minor > (
    select coalesce(sum(amount_minor), 0) from public.commission_ledger_entries where placement_id = p.id and party = 'platform'
  ) then
    raise exception 'remittance_exceeds_balance' using errcode = 'P0001';
  end if;

  if e.kind in ('client_payment', 'client_refund') then
    v_distributable := (e.amount_minor - e.processing_fee_minor) * case when e.kind = 'client_refund' then -1 else 1 end;
    v_alloc := app.allocate_minor(v_distributable, array[a.sourcing_bps, a.job_owner_bps, a.platform_bps]);
    insert into public.commission_ledger_entries
      (placement_id, entry_type, party, organization_id, amount_minor, currency, payment_evidence_id, memo, idempotency_key, created_by)
    values
      (p.id, case when e.kind = 'client_refund' then 'refund' else 'fee_received' end::public.ledger_entry_type,
       'client', null, v_distributable, p.currency, e.id, 'Distributable amount (net of processing fees)', e.id || ':received', auth.uid()),
      (p.id, case when e.kind = 'client_refund' then 'allocation_reversal' else 'allocation' end::public.ledger_entry_type,
       'sourcing', p.source_org_id, v_alloc[1], p.currency, e.id, a.sourcing_bps || ' bps', e.id || ':sourcing', auth.uid()),
      (p.id, case when e.kind = 'client_refund' then 'allocation_reversal' else 'allocation' end::public.ledger_entry_type,
       'job_owner', p.target_org_id, v_alloc[2], p.currency, e.id, a.job_owner_bps || ' bps', e.id || ':job_owner', auth.uid()),
      (p.id, case when e.kind = 'client_refund' then 'allocation_reversal' else 'allocation' end::public.ledger_entry_type,
       'platform', null, v_alloc[3], p.currency, e.id, a.platform_bps || ' bps', e.id || ':platform', auth.uid());
  elsif e.kind = 'sourcing_payout' then
    insert into public.commission_ledger_entries
      (placement_id, entry_type, party, organization_id, amount_minor, currency, payment_evidence_id, memo, idempotency_key, created_by)
    values (p.id, 'payout', 'sourcing', p.source_org_id, -e.amount_minor, p.currency, e.id,
            'Payout to sourcing recruiter verified', e.id || ':payout', auth.uid());
  elsif e.kind = 'platform_remittance' then
    insert into public.commission_ledger_entries
      (placement_id, entry_type, party, organization_id, amount_minor, currency, payment_evidence_id, memo, idempotency_key, created_by)
    values (p.id, 'remittance', 'platform', null, -e.amount_minor, p.currency, e.id,
            'Platform share remittance verified', e.id || ':remittance', auth.uid());
  end if;

  -- Recompute placement state from the ledger (single source of truth).
  select coalesce(sum(amount_minor), 0) into v_received from public.commission_ledger_entries
   where placement_id = p.id and party = 'client';
  select coalesce(sum(amount_minor), 0) into v_sourcing_due from public.commission_ledger_entries
   where placement_id = p.id and party = 'sourcing';
  select coalesce(sum(amount_minor), 0) into v_platform_due from public.commission_ledger_entries
   where placement_id = p.id and party = 'platform';

  if v_received > 0 and v_sourcing_due = 0 and v_platform_due = 0 then
    perform app.placement_transition(p.id, 'settled', 'All obligations verified');
  elsif v_received > 0 then
    perform app.placement_transition(p.id,
      case when (
        select coalesce(sum(case when x.kind = 'client_payment' then x.amount_minor else -x.amount_minor end), 0)
        from public.payment_evidence x
        where x.placement_id = p.id and x.status = 'verified' and x.kind in ('client_payment', 'client_refund')
      ) >= (select coalesce(sum(i.amount_minor), p.contracted_fee_minor) from public.invoice_records i where i.placement_id = p.id)
           then 'commission_payable'::public.placement_status else 'payment_partially_verified' end,
      'Verified evidence ' || e.kind);
  end if;

  if e.kind = 'client_payment' then
    perform app.notify_org(p.source_org_id, 'commission.payable', 'Commission is now payable',
      'The client payment was verified. Your share is recorded in the ledger.', '/commissions/' || p.id);
  end if;
  perform app.audit(p.target_org_id, 'evidence.verified', 'placement', p.id,
    jsonb_build_object('evidence_id', e.id, 'kind', e.kind));
  perform app.audit(p.source_org_id, 'evidence.verified', 'placement', p.id,
    jsonb_build_object('evidence_id', e.id, 'kind', e.kind));
end $function$;

-- public.get_opportunities: Opportunities only for the caller's own candidates (managers: the agency's).
CREATE OR REPLACE FUNCTION public.get_opportunities(p_org uuid, p_candidate uuid DEFAULT NULL::uuid, p_match uuid DEFAULT NULL::uuid)
 RETURNS TABLE(match_id uuid, candidate_id uuid, candidate_name text, candidate_headline text, job_id uuid, job_title text, job_org_name text, client_label text, seniority seniority_level, work_arrangement work_arrangement, contract_type contract_type, location text, description text, required_skills text[], preferred_skills text[], salary_min bigint, salary_max bigint, salary_currency character, expected_fee_minor bigint, fee_currency character, your_share_minor bigint, score smallint, band match_band, reasons jsonb, gaps jsonb, blockers jsonb, model_version text, refreshed_at timestamp with time zone, matched_at timestamp with time zone, job_posted_at timestamp with time zone, referral_id uuid, referral_status text, triage_state text, dismiss_reason text, is_new boolean, internal boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sourcing_bps integer;
begin
  if not app.is_member(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select cr.sourcing_bps into v_sourcing_bps
  from public.commission_rules cr where cr.is_default order by cr.version desc limit 1;
  return query
  select
    m.id, c.id, c.full_name, c.headline,
    j.id, j.title, o.name,
    case when j.client_confidential or j.client_name is null then 'Confidential client' else j.client_name end,
    j.seniority, j.work_arrangement, j.contract_type,
    case when j.share_location then nullif(concat_ws(', ', j.location_city, j.location_region, j.location_country), '') end,
    case when j.share_description then j.description end,
    j.required_skills, j.preferred_skills,
    case when j.share_salary then j.salary_min end,
    case when j.share_salary then j.salary_max end,
    case when j.share_salary then j.salary_currency end,
    case when j.share_fee then j.expected_fee_minor end,
    case when j.share_fee then j.fee_currency end,
    case when j.share_fee and v_sourcing_bps is not null and not rel.internal
         then (j.expected_fee_minor * v_sourcing_bps) / 10000 end,
    m.score, m.band, m.reasons, m.gaps, m.blockers, m.model_version, m.refreshed_at,
    m.created_at, j.created_at,
    r.id, r.status::text,
    t.state, t.dismiss_reason, (t.seen_at is null),
    rel.internal
  from public.matches m
  join public.candidates c on c.id = m.candidate_id
  join public.jobs j on j.id = m.job_id
  join public.organizations o on o.id = j.organization_id
  cross join lateral (select app.orgs_share_member(p_org, j.organization_id) as internal) rel
  left join public.match_triage t on t.match_id = m.id and t.organization_id = p_org
  left join lateral (
    select rl.referral_id as id, rf.status
    from public.referral_candidate_links rl
    join public.referrals rf on rf.id = rl.referral_id
    where rl.candidate_id = c.id and rf.job_id = j.id
    order by rf.created_at desc limit 1
  ) r on true
  where m.candidate_org_id = p_org
    and c.organization_id = p_org
    and (c.owner_id = auth.uid() or app.sees_all(p_org))
    and m.expired_at is null
    and c.status = 'active_for_matching'
    and j.status = 'active' and j.accepts_external_referrals
    and o.suspended_at is null
    and (p_candidate is null or c.id = p_candidate)
    and (p_match is null or m.id = p_match)
  order by m.score desc, m.refreshed_at desc;
end $function$;

-- public.mark_matches_seen: Only the caller's own candidates' matches.
CREATE OR REPLACE FUNCTION public.mark_matches_seen(p_org uuid, p_matches uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.is_member(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if cardinality(p_matches) > 500 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  insert into public.match_triage as t (match_id, organization_id, seen_at, updated_by)
  select m.id, p_org, now(), auth.uid()
  from public.matches m
  where m.id = any (p_matches) and m.candidate_org_id = p_org and app.can_access_candidate(m.candidate_id)
  on conflict (organization_id, match_id) do update set seen_at = coalesce(t.seen_at, now());
end $function$;

-- public.get_sent_referral_jobs: Only jobs of referrals the caller sees as the sourcing side.
CREATE OR REPLACE FUNCTION public.get_sent_referral_jobs(p_org uuid)
 RETURNS TABLE(job_id uuid, status job_status, status_updated_at timestamp with time zone, expected_fee_minor bigint, fee_currency character, your_share_minor bigint, internal boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sourcing_bps integer;
begin
  if not app.is_member(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select cr.sourcing_bps into v_sourcing_bps
  from public.commission_rules cr where cr.is_default order by cr.version desc limit 1;
  return query
    select
      j.id, j.status, j.updated_at,
      case when j.share_fee then j.expected_fee_minor end,
      case when j.share_fee then j.fee_currency end,
      case when j.share_fee and v_sourcing_bps is not null and not s.internal
           then (j.expected_fee_minor * v_sourcing_bps) / 10000 end,
      s.internal
    from public.jobs j
    cross join lateral (
      select bool_and(r.internal) as internal
      from public.referrals r where r.job_id = j.id and r.source_org_id = p_org and app.sees_referral_as_source(r.id)
    ) s
    where exists (select 1 from public.referrals r where r.job_id = j.id and r.source_org_id = p_org and app.sees_referral_as_source(r.id));
end $function$;
