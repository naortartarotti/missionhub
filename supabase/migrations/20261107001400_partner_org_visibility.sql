-- Counterparties of a referral may see each other's organization record (name/kind),
-- so collaboration screens can show who they are working with. No other cross-org visibility.
create or replace function app.is_partner_org(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.referrals r
    where (r.source_org_id = p_org and app.is_member(r.target_org_id))
       or (r.target_org_id = p_org and app.is_member(r.source_org_id))
  );
$$;
grant execute on function app.is_partner_org(uuid) to authenticated;

create policy organizations_select_partners on public.organizations for select to authenticated
  using (app.is_partner_org(id));
