-- Pipeline ownership: once a referral is accepted, only the person who accepted it moves it
-- through the hiring stages (interviewing, offer, hired, not selected, cancelled).
--
-- Enforced with a trigger on referrals so both entry points are covered with one rule:
-- transition_referral() and report_hire(). The sourcing side keeps its only move from these
-- stages (withdrawn). Service-role calls (no auth.uid()) are not affected.
--
-- If the owner is no longer an active member of the hiring organization, any member of it may
-- move the referral, so a candidate is never stuck because someone left the team.

create or replace function app.pipeline_owner(p_referral uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select e.actor_id
    from public.referral_status_events e
   where e.referral_id = p_referral and e.to_status = 'accepted'
   order by e.id desc
   limit 1;
$$;
revoke execute on function app.pipeline_owner(uuid) from public, anon, authenticated;

create or replace function app.enforce_pipeline_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null
     or new.status = old.status
     or old.status not in ('accepted', 'interviewing', 'offer')
     or new.status = 'withdrawn' then
    return new;
  end if;

  v_owner := app.pipeline_owner(new.id);
  if v_owner is null or v_owner = auth.uid() then
    return new;
  end if;

  -- Owner left the hiring organization: hand the referral back to the team.
  if not exists (
    select 1 from public.organization_memberships m
     where m.organization_id = new.target_org_id and m.user_id = v_owner and m.status = 'active'
  ) then
    return new;
  end if;

  raise exception 'not_pipeline_owner' using errcode = '42501';
end $$;
revoke execute on function app.enforce_pipeline_owner() from public, anon, authenticated;

drop trigger if exists referrals_enforce_pipeline_owner on public.referrals;
create trigger referrals_enforce_pipeline_owner
  before update of status on public.referrals
  for each row execute function app.enforce_pipeline_owner();
