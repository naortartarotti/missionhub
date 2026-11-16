-- N10 part 8 of 8: who in an org reads conduct and sanction audit events (BR-32, BR-40, AC-149).
--
-- audit_select let org_admin and recruiter_manager read their org's audit. Conduct- and
-- sanction-related events would tell a recruiter manager that a report, a notice or a sanction exists,
-- which BR-32 reserves to org admins. The restriction is in the policy, so a direct select by a
-- recruiter_manager doesn't return them either. network_rules.* acceptances and
-- referral.closed_stale_by_admin stay visible to the roles that read the audit today.

create or replace function app.is_sanction_audit_action(p_action text) returns boolean
language sql immutable set search_path = '' as $$
  select p_action like 'conduct\_report.%' or p_action like 'conduct.%' or p_action like 'sanction.%'
      or p_action like 'settlement\_mode.%';
$$;
revoke execute on function app.is_sanction_audit_action(text) from public, anon;
grant execute on function app.is_sanction_audit_action(text) to authenticated;

drop policy audit_select on public.audit_events;
create policy audit_select on public.audit_events for select to authenticated
  using ((organization_id is not null
          and (app.has_role(organization_id, array['org_admin']::public.membership_role[])
               or (app.has_role(organization_id, array['recruiter_manager']::public.membership_role[])
                   and not app.is_sanction_audit_action(action))))
         or app.is_platform_admin());
