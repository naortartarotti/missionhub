-- N10 QA round 1 fixes (docs/specs/network-rules-enforcement/qa-report.md).
--
-- QA-N10-01 (blocker, BR-42 / AC-50): partner orgs could select another org's suspended_at,
--   terminated_at and suspended_reason through organizations_select_partners. Those columns are no
--   longer selectable by authenticated or anon at all. An org's own state goes through
--   get_my_org_state; platform admins read them through the admin-only view public.admin_organizations;
--   the worker uses the service role.
-- QA-N10-05 (major): accept_network_rules compared the org's acceptance with the version being
--   accepted, so after a non-material version a never-accepted org_admin (shown the personal statement
--   only, because get_my_org_state compares with the required version) was refused. It now compares
--   with the required version for the current version, and with the version itself for an upcoming one.
-- QA-N10-02 (minor, AC-143): the candidate_photos_delete storage policy now requires the rules gate.
-- QA-N10-03 (minor, N10-D28): audit rows a member org can read no longer carry a platform admin's id;
--   the id is kept in an org-null admin copy.

-- ---------------------------------------------------------------------------
-- QA-N10-01
-- ---------------------------------------------------------------------------
revoke select on public.organizations from authenticated, anon;
revoke select (suspended_at, terminated_at, suspended_reason) on public.organizations from authenticated, anon;
grant select (id, name, slug, kind, country, default_currency, locale, is_demo, created_by, created_at, updated_at)
  on public.organizations to authenticated;

-- Platform-admin read of organizations including the sanction columns (admin list, overview, org page).
-- Runs as its owner (no RLS on the base table), so the platform-admin filter is the only gate: any
-- other caller gets zero rows.
create view public.admin_organizations with (security_barrier = true) as
  select o.id, o.name, o.slug, o.kind, o.country, o.default_currency, o.locale, o.is_demo,
         o.suspended_at, o.suspended_reason, o.terminated_at, o.created_by, o.created_at, o.updated_at
    from public.organizations o
   where app.is_platform_admin();
revoke all on public.admin_organizations from public, anon, authenticated;
grant select on public.admin_organizations to authenticated;
comment on view public.admin_organizations is
  'N10 QA-N10-01: organizations with suspension / termination columns, platform admins only (zero rows otherwise).';

-- ---------------------------------------------------------------------------
-- QA-N10-05 (latest body: 20261116001300; only the org-acceptance comparison changes)
-- ---------------------------------------------------------------------------
create or replace function public.accept_network_rules(
  p_org uuid, p_version uuid, p_locale text, p_personal boolean, p_for_org boolean
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.network_rules_versions;
  v_req public.network_rules_versions;
  v_target timestamptz;
  v_settling boolean;
  v_admin boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  perform set_config('app.rules_gate_exempt', 'on', true);
  if p_org is null or not app.is_member_or_settling(p_org) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not coalesce(p_personal, false) and not coalesce(p_for_org, false) then
    raise exception 'rules_acceptance_required' using errcode = 'P0001';
  end if;
  v := app.rules_acceptable_version(p_version, true);
  perform app.rules_text_hash(v.id, p_locale);
  v_settling := app.is_settling_member(p_org);
  v_admin := app.has_role_or_settling(p_org, array['org_admin']::public.membership_role[]);
  if coalesce(p_for_org, false) and not v_admin then raise exception 'forbidden' using errcode = '42501'; end if;
  -- N10-D18: the org statement is needed only when the org hasn't accepted what applies. For the
  -- current version that is the required version (non-material versions never re-open acceptance,
  -- the same rule as get_my_org_state); for an upcoming version it is that version itself.
  v_req := app.rules_required_version();
  v_target := case when v.effective_at > now() then v.effective_at else coalesce(v_req.effective_at, v.effective_at) end;
  if coalesce(p_personal, false) and not coalesce(p_for_org, false) and v_admin and not v_settling
     and not exists (select 1 from public.network_rules_org_acceptances a
                       join public.network_rules_versions x on x.id = a.version_id
                      where a.organization_id = p_org and x.effective_at >= v_target) then
    raise exception 'rules_acceptance_required' using errcode = 'P0001';
  end if;
  perform app.record_rules_acceptance(auth.uid(), p_org, v.id, p_locale, coalesce(p_personal, false), coalesce(p_for_org, false));
  return jsonb_build_object(
    'member_accepted', exists (select 1 from public.network_rules_member_acceptances a where a.user_id = auth.uid() and a.version_id = v.id),
    'org_accepted', exists (select 1 from public.network_rules_org_acceptances a where a.organization_id = p_org and a.version_id = v.id));
end $$;

-- ---------------------------------------------------------------------------
-- QA-N10-02
-- ---------------------------------------------------------------------------
drop policy if exists candidate_photos_delete on storage.objects;
create policy candidate_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'candidate-photos' and app.can_access_candidate_object(name) and app.assert_rules_gate());

-- ---------------------------------------------------------------------------
-- QA-N10-03: no platform admin id on member-readable audit rows.
-- ---------------------------------------------------------------------------
create or replace function app.audit_mask_platform_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.organization_id is not null and new.actor_id is not null
     and (app.is_sanction_audit_action(new.action) or new.action = 'referral.closed_stale_by_admin')
     and exists (select 1 from public.profiles p where p.id = new.actor_id and p.is_platform_admin) then
    -- Keep who did it in an admin-only copy (org null), except where the RPC already writes one.
    if new.action <> 'referral.closed_stale_by_admin' then
      insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, metadata)
      values (null, new.actor_id, new.action, new.entity_type, new.entity_id,
              new.metadata || jsonb_build_object('organization_id', new.organization_id));
    end if;
    new.actor_id := null;
  end if;
  return new;
end $$;
revoke execute on function app.audit_mask_platform_admin() from public, anon, authenticated;
create trigger audit_mask_platform_admin before insert on public.audit_events
  for each row execute function app.audit_mask_platform_admin();
