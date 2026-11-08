-- Platform administration use cases. Platform admins never get policy access to candidate data;
-- exceptional PII access is a documented, out-of-band procedure (docs/security-and-privacy.md).

create or replace function public.set_organization_suspension(p_org uuid, p_suspend boolean, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_suspend and coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required' using errcode = '22023'; end if;
  update public.organizations
     set suspended_at = case when p_suspend then now() end,
         suspended_reason = case when p_suspend then left(p_reason, 500) end
   where id = p_org;
  -- Effects: members lose access (app.is_member checks suspended_at); its jobs stop matching.
  if p_suspend then
    update public.matches set expired_at = now() where (job_org_id = p_org or candidate_org_id = p_org) and expired_at is null;
  end if;
  perform app.audit(p_org, case when p_suspend then 'organization.suspended' else 'organization.reinstated' end,
    'organization', p_org, jsonb_build_object('reason', left(coalesce(p_reason, ''), 200)));
end $$;

-- Aggregated, PII-free platform metrics.
create or replace function public.platform_metrics()
returns table (organizations bigint, active_jobs bigint, active_candidates bigint, referrals bigint, placements bigint,
               pending_evidence bigint, open_disputes bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select
    (select count(*) from public.organizations where not is_demo),
    (select count(*) from public.jobs where status = 'active'),
    (select count(*) from public.candidates where status = 'active_for_matching'),
    (select count(*) from public.referrals),
    (select count(*) from public.placements),
    (select count(*) from public.payment_evidence where status = 'pending'),
    (select count(*) from public.disputes where status = 'open');
end $$;

revoke execute on function public.set_organization_suspension(uuid, boolean, text) from public, anon;
revoke execute on function public.platform_metrics() from public, anon;
grant execute on function public.set_organization_suspension(uuid, boolean, text) to authenticated;
grant execute on function public.platform_metrics() to authenticated;
