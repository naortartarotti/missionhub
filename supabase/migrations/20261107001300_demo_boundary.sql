-- Demo data must never mix with real data: no matches or referrals across the is_demo boundary,
-- and no new pairing involving a suspended organization.
create or replace function app.assert_pairable(p_a uuid, p_b uuid, p_is_insert boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a public.organizations;
  b public.organizations;
begin
  select * into a from public.organizations where id = p_a;
  select * into b from public.organizations where id = p_b;
  if a.is_demo is distinct from b.is_demo then
    raise exception 'demo_boundary: demo and real organizations cannot be paired' using errcode = '42501';
  end if;
  if p_is_insert and (a.suspended_at is not null or b.suspended_at is not null) then
    raise exception 'organization_suspended' using errcode = '42501';
  end if;
end $$;

create or replace function app.guard_match_pair() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.assert_pairable(new.candidate_org_id, new.job_org_id, tg_op = 'INSERT');
  return new;
end $$;

create or replace function app.guard_referral_pair() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.assert_pairable(new.source_org_id, new.target_org_id, true);
  return new;
end $$;

create trigger matches_pair_guard before insert or update of candidate_org_id, job_org_id on public.matches
  for each row execute function app.guard_match_pair();
create trigger referrals_pair_guard before insert on public.referrals
  for each row execute function app.guard_referral_pair();

delete from public.matches m
using public.organizations a, public.organizations b
where a.id = m.candidate_org_id and b.id = m.job_org_id and a.is_demo is distinct from b.is_demo;
