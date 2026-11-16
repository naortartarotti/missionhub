-- N10 part 5 of 8: settlement mode, option (a) in full (BR-33 to BR-37, EC-1, approach (i)).
--
-- app.is_member / has_role / user_is_member / user_sees_all are NOT changed: everything not listed
-- here stays closed to a suspended or terminated org (default deny: candidates, jobs, matching,
-- connectors, API keys, invitations, org settings, audit, privacy requests, storage of candidate
-- files). A "settling member" branch is added only where BR-34 needs it, and only for referrals in
-- settlement scope (app.referral_in_settlement_scope: in progress or with an open obligation).
--
-- PD-064: app.user_sees_referral_as_source / _target and app.notify_eligible were defined in
-- 20261115000300_recruiter_record_scope.sql (never edited). The bodies below start from that latest
-- definition and keep its normal branch byte-for-byte; the settling branch is evaluated only when
-- the normal branch fails (CASE order).

create or replace function app.user_sees_referral_as_source(p_user uuid, p_referral uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.referrals r
     where r.id = p_referral
       and case
         when app.user_is_member(p_user, r.source_org_id) then
           (app.user_sees_all(p_user, r.source_org_id)
            or exists (select 1
                         from public.referral_candidate_links l
                         join public.candidates c on c.id = l.candidate_id
                        where l.referral_id = r.id and c.organization_id = r.source_org_id
                          and c.owner_id = p_user))
         -- N10 settlement mode: same record scope (RD-036), in-scope referrals only.
         when app.user_is_settling_member(p_user, r.source_org_id) then
           app.referral_in_settlement_scope(r.id)
           and (app.user_sees_all_settling(p_user, r.source_org_id)
                or exists (select 1
                             from public.referral_candidate_links l
                             join public.candidates c on c.id = l.candidate_id
                            where l.referral_id = r.id and c.organization_id = r.source_org_id
                              and c.owner_id = p_user))
         else false
       end
  );
$$;

create or replace function app.user_sees_referral_as_target(p_user uuid, p_referral uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.referrals r
     where r.id = p_referral
       and not app.hidden_from_target(r.status)
       and case
         when app.user_is_member(p_user, r.target_org_id) then
           (app.user_sees_all(p_user, r.target_org_id)
            or exists (select 1 from public.jobs j
                        where j.id = r.job_id and j.organization_id = r.target_org_id
                          and j.owner_id = p_user))
         -- N10 settlement mode: same record scope (RD-036), in-scope referrals only.
         when app.user_is_settling_member(p_user, r.target_org_id) then
           app.referral_in_settlement_scope(r.id)
           and (app.user_sees_all_settling(p_user, r.target_org_id)
                or exists (select 1 from public.jobs j
                            where j.id = r.job_id and j.organization_id = r.target_org_id
                              and j.owner_id = p_user))
         else false
       end
  );
$$;

-- transition_referral / review_referral with an acting org (latest: 20261111000200).
create or replace function app.acting_side(p_referral uuid, p_acting_org uuid) returns public.referral_side
language sql stable security definer set search_path = '' as $$
  select case
    when p_acting_org is null or not app.is_member_or_settling(p_acting_org) then null  -- N10
    when p_acting_org = r.source_org_id and app.sees_referral_as_source(r.id) then 'source'::public.referral_side
    when p_acting_org = r.target_org_id and app.sees_referral_as_target(r.id) then 'target'::public.referral_side
  end
  from public.referrals r where r.id = p_referral;
$$;

-- Referral-scoped notifications reach a settling org's admins and managers too (latest: 20261115000300).
create or replace function app.notify_eligible(p_user uuid, p_org uuid, p_referral uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.user_sees_all(p_user, p_org) or app.user_sees_all_settling(p_user, p_org) or (p_referral is not null and exists (
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

-- Counterpart org names on referral / placement embeds (latest: 20261107001400).
create or replace function app.is_partner_org(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.referrals r
    where (r.source_org_id = p_org and app.is_member_or_settling(r.target_org_id))
       or (r.target_org_id = p_org and app.is_member_or_settling(r.source_org_id))
  );
$$;

-- N1 objection files in settlement mode (latest: 20261113001100).
create or replace function app.can_upload_claim_evidence(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid;
  v_ref uuid;
begin
  if p_name is null or p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|png|jpg)$' then return false; end if;
  v_org := split_part(p_name, '/', 1)::uuid;
  v_ref := split_part(p_name, '/', 2)::uuid;
  return app.is_member_or_settling(v_org)  -- N10
     and exists (select 1 from public.referrals r where r.id = v_ref and r.target_org_id = v_org
                   and app.sees_referral_as_target(r.id))
     and app.claim_blocker(v_ref) is null;
end $$;

-- Terms of in-scope referrals for the hiring side too (placement embed, hire dialog; latest: 20261116000100).
create or replace function app.can_read_referral_terms(p_version uuid, p_referral uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.referrals r
     where (r.terms_version_id = p_version or r.id = p_referral)
       and (app.sees_referral_as_source(r.id) or app.sees_referral_as_target(r.id)));
$$;

-- A settling member reads (never writes) its own jobs that carry an in-scope referral.
create or replace function app.settling_job_visible(p_job uuid, p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_settling_member(p_org) and exists (
    select 1 from public.referrals r
     where r.job_id = p_job and r.target_org_id = p_org and app.referral_in_settlement_scope(r.id));
$$;
revoke execute on function app.settling_job_visible(uuid, uuid) from public, anon;
grant execute on function app.settling_job_visible(uuid, uuid) to authenticated;

drop policy organizations_select on public.organizations;
create policy organizations_select on public.organizations for select to authenticated
  using (app.is_member(id) or app.is_settling_member(id) or app.is_platform_admin());

drop policy memberships_select on public.organization_memberships;
create policy memberships_select on public.organization_memberships for select to authenticated
  using (user_id = auth.uid() or app.is_member(organization_id) or app.is_settling_member(organization_id)
         or app.is_platform_admin());

drop policy jobs_select on public.jobs;
create policy jobs_select on public.jobs for select to authenticated
  using (app.is_member(organization_id) or app.settling_job_visible(id, organization_id));

drop policy disputes_select on public.disputes;
create policy disputes_select on public.disputes for select to authenticated
  using ((kind = 'placement' and app.can_see_placement(placement_id))
      or (kind = 'prior_presentation' and (app.is_platform_admin()
          or (app.is_member_or_settling(opened_by_org) and app.can_see_referral(referral_id)))));

-- ---------------------------------------------------------------------------
-- BR-34.6: deactivate a member (security hygiene). Never oneself, never the last active org_admin.
-- ---------------------------------------------------------------------------
create or replace function public.deactivate_member_in_settlement(p_org uuid, p_membership uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.organization_memberships;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if not app.is_settling_member(p_org) or not app.has_role_or_settling(p_org, array['org_admin']::public.membership_role[]) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into m from public.organization_memberships where id = p_membership and organization_id = p_org for update;
  if not found or m.status <> 'active' then raise exception 'not_found' using errcode = 'P0002'; end if;
  if m.user_id = auth.uid() then raise exception 'self_change' using errcode = 'P0001'; end if;
  if m.role = 'org_admin' and not exists (
       select 1 from public.organization_memberships x
        where x.organization_id = p_org and x.status = 'active' and x.role = 'org_admin' and x.id <> m.id) then
    raise exception 'last_admin' using errcode = 'P0001';
  end if;
  update public.organization_memberships set status = 'suspended' where id = m.id;
  perform app.audit(p_org, 'membership.deactivated', 'membership', m.id, jsonb_build_object('settlement_mode', true));
end $$;
revoke execute on function public.deactivate_member_in_settlement(uuid, uuid) from public, anon;
grant execute on function public.deactivate_member_in_settlement(uuid, uuid) to authenticated;

-- S22-b counts, scoped to what the caller can see (record scope applies).
create or replace function public.get_settlement_summary(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if not app.is_member_or_settling(p_org) then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'referrals_in_progress', (
      select count(*) from public.referrals r
       where (r.source_org_id = p_org or r.target_org_id = p_org)
         and app.referral_in_settlement_scope(r.id) and app.can_see_referral(r.id)),
    'commissions_open', (
      select count(*) from public.placements p
       where (p.source_org_id = p_org or p.target_org_id = p_org)
         and (p.status not in ('settled', 'cancelled')
              or (p.status = 'settled' and p.guarantee_until is not null and p.guarantee_until >= app.today_et()))
         and app.can_see_placement(p.id)),
    'disputes_to_answer', (
      select count(*) from public.disputes d
       where d.status = 'open'
         and ((d.placement_id is not null and app.can_see_placement(d.placement_id)
               and exists (select 1 from public.placements p where p.id = d.placement_id
                            and (p.source_org_id = p_org or p.target_org_id = p_org)))
           or (d.kind = 'prior_presentation' and d.referral_id is not null and app.can_see_referral(d.referral_id)
               and exists (select 1 from public.referrals r where r.id = d.referral_id
                            and (r.source_org_id = p_org or r.target_org_id = p_org))))));
end $$;
revoke execute on function public.get_settlement_summary(uuid) from public, anon;
grant execute on function public.get_settlement_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- BR-37 / RD-047: remaining obligations and the stale-referral close (terminated orgs only).
-- ---------------------------------------------------------------------------
create or replace function app.referral_last_activity(p_referral uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select greatest(
    r.created_at,
    (select max(e.created_at) from public.referral_status_events e where e.referral_id = r.id),
    (select max(m.created_at) from public.referral_messages m where m.referral_id = r.id))
  from public.referrals r where r.id = p_referral;
$$;
revoke execute on function app.referral_last_activity(uuid) from public, anon, authenticated;

create or replace function public.admin_close_stale_referral(p_referral uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  v_term uuid;
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 5 and 2000 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  select * into r from public.referrals where id = p_referral for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select o.id into v_term from public.organizations o
   where o.id in (r.source_org_id, r.target_org_id) and o.terminated_at is not null
     and app.org_settlement_state(o.id) = 'settlement'
   limit 1;
  if v_term is null then raise exception 'not_terminated' using errcode = 'P0001'; end if;
  if app.referral_terminal(r.status) then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  if app.referral_last_activity(r.id) > now() - interval '60 days' then
    raise exception 'not_stale' using errcode = 'P0001';
  end if;

  update public.referrals set status = 'cancelled', version = version + 1 where id = r.id;
  -- No admin id on member-readable rows (N10-D28). The reason code drives each side's timeline text.
  insert into public.referral_status_events (referral_id, from_status, to_status, actor_id, actor_side, reason, actor_kind)
  values (r.id, r.status, 'cancelled', null, null, 'closed_stale_by_admin', 'admin');

  if not app.hidden_from_target(r.status) then
    perform app.notify_org(r.target_org_id, 'referral.status', 'Referral update: cancelled',
      r.job_title_snapshot || ' — ' || r.candidate_label, '/referrals/' || r.id);
  end if;
  perform app.notify_org(r.source_org_id, 'referral.status', 'Referral update: cancelled',
    r.job_title_snapshot || ' — ' || r.candidate_label, '/referrals/' || r.id);
  perform app.audit(r.source_org_id, 'referral.closed_stale_by_admin', 'referral', r.id, jsonb_build_object('from', r.status));
  perform app.audit(r.target_org_id, 'referral.closed_stale_by_admin', 'referral', r.id, jsonb_build_object('from', r.status));
  perform app.audit(null, 'referral.closed_stale_by_admin', 'referral', r.id,
    jsonb_build_object('from', r.status, 'terminated_org', v_term, 'reason', left(btrim(p_reason), 2000)));
end $$;
revoke execute on function public.admin_close_stale_referral(uuid, text) from public, anon;
grant execute on function public.admin_close_stale_referral(uuid, text) to authenticated;
