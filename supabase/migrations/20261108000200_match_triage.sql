-- Match triage: lets the sourcing organization work its opportunities like an inbox
-- (new → saved / dismissed → submitted). State is per organization, never visible to the
-- job owner. Like `matches`, the table is only reachable through security-definer functions.

create table public.match_triage (
  match_id uuid not null references public.matches (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  state text check (state in ('saved', 'dismissed')),
  dismiss_reason text check (dismiss_reason in ('salary', 'location', 'seniority', 'skills', 'candidate_not_interested', 'other')),
  seen_at timestamptz,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  primary key (organization_id, match_id),
  check (dismiss_reason is null or state = 'dismissed')
);
alter table public.match_triage enable row level security; -- intentionally no policies
revoke all on public.match_triage from anon, authenticated;

-- Internal guard: the match must belong to the caller's organization (sourcing side).
create or replace function app.assert_own_match(p_org uuid, p_match uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_member(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.matches m where m.id = p_match and m.candidate_org_id = p_org) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end $$;
revoke execute on function app.assert_own_match(uuid, uuid) from public, anon, authenticated;

create or replace function public.set_match_triage(p_org uuid, p_match uuid, p_state text, p_reason text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.assert_own_match(p_org, p_match);
  if p_state is not null and p_state not in ('saved', 'dismissed') then
    raise exception 'invalid_state' using errcode = '22023';
  end if;
  insert into public.match_triage as t (match_id, organization_id, state, dismiss_reason, seen_at, updated_by, updated_at)
  values (p_match, p_org, p_state, case when p_state = 'dismissed' then p_reason end, now(), auth.uid(), now())
  on conflict (organization_id, match_id) do update
    set state = excluded.state,
        dismiss_reason = excluded.dismiss_reason,
        seen_at = coalesce(t.seen_at, excluded.seen_at),
        updated_by = excluded.updated_by,
        updated_at = now();
end $$;

create or replace function public.mark_matches_seen(p_org uuid, p_matches uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
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
  where m.id = any (p_matches) and m.candidate_org_id = p_org
  on conflict (organization_id, match_id) do update set seen_at = coalesce(t.seen_at, now());
end $$;

-- Return type changes (triage + fee share + job age), so the function is recreated.
drop function if exists public.get_opportunities(uuid, uuid, uuid);
create function public.get_opportunities(p_org uuid, p_candidate uuid default null, p_match uuid default null)
returns table (
  match_id uuid,
  candidate_id uuid,
  candidate_name text,
  candidate_headline text,
  job_id uuid,
  job_title text,
  job_org_name text,
  client_label text,
  seniority public.seniority_level,
  work_arrangement public.work_arrangement,
  contract_type public.contract_type,
  location text,
  description text,
  required_skills text[],
  preferred_skills text[],
  salary_min bigint,
  salary_max bigint,
  salary_currency char(3),
  expected_fee_minor bigint,
  fee_currency char(3),
  your_share_minor bigint,
  score smallint,
  band public.match_band,
  reasons jsonb,
  gaps jsonb,
  blockers jsonb,
  model_version text,
  refreshed_at timestamptz,
  matched_at timestamptz,
  job_posted_at timestamptz,
  referral_id uuid,
  referral_status text,
  triage_state text,
  dismiss_reason text,
  is_new boolean
)
language plpgsql stable security definer set search_path = '' as $$
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
    case when j.share_fee and v_sourcing_bps is not null then (j.expected_fee_minor * v_sourcing_bps) / 10000 end,
    m.score, m.band, m.reasons, m.gaps, m.blockers, m.model_version, m.refreshed_at,
    m.created_at, j.created_at,
    r.id, r.status::text,
    t.state, t.dismiss_reason, (t.seen_at is null)
  from public.matches m
  join public.candidates c on c.id = m.candidate_id
  join public.jobs j on j.id = m.job_id
  join public.organizations o on o.id = j.organization_id
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
    and m.expired_at is null
    and c.status = 'active_for_matching'
    and j.status = 'active' and j.accepts_external_referrals
    and o.suspended_at is null
    and (p_candidate is null or c.id = p_candidate)
    and (p_match is null or m.id = p_match)
  order by m.score desc, m.refreshed_at desc;
end $$;

revoke execute on function public.get_opportunities(uuid, uuid, uuid) from public, anon;
revoke execute on function public.set_match_triage(uuid, uuid, text, text) from public, anon;
revoke execute on function public.mark_matches_seen(uuid, uuid[]) from public, anon;
grant execute on function public.get_opportunities(uuid, uuid, uuid) to authenticated;
grant execute on function public.set_match_triage(uuid, uuid, text, text) to authenticated;
grant execute on function public.mark_matches_seen(uuid, uuid[]) to authenticated;
