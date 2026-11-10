-- Related organizations: two orgs that share at least one active member.
--
-- Matching across them still runs (a recruiter with two agencies may genuinely want to place a
-- candidate from one into a job of the other), but it is NOT a partner collaboration:
--   * opportunities are flagged `internal` and show no partner share;
--   * a referral between related orgs is frozen as `internal` at submission;
--   * accepting an internal referral creates an agreement with NO sourcing commission: the
--     sourcing share goes to the job owner, the platform fee is unchanged.
-- This removes the incentive to refer your own candidate to your own job to collect both sides.

create or replace function app.orgs_share_member(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_a <> p_b and exists (
    select 1
    from public.organization_memberships ma
    join public.organization_memberships mb on mb.user_id = ma.user_id
    where ma.organization_id = p_a and ma.status = 'active'
      and mb.organization_id = p_b and mb.status = 'active'
  );
$$;
revoke execute on function app.orgs_share_member(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Referrals: frozen `internal` flag
-- ---------------------------------------------------------------------------
alter table public.referrals add column internal boolean not null default false;

-- Existing referrals: classify by today's memberships (best available signal).
update public.referrals set internal = app.orgs_share_member(source_org_id, target_org_id);

create or replace function app.set_referral_internal() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.internal := app.orgs_share_member(new.source_org_id, new.target_org_id);
  return new;
end $$;
revoke execute on function app.set_referral_internal() from public, anon, authenticated;

create trigger referrals_set_internal before insert on public.referrals
  for each row execute function app.set_referral_internal();

-- The flag is decided once, at submission; later membership changes don't rewrite history.
create or replace function app.guard_referral_internal() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.internal is distinct from old.internal then
    raise exception 'referral internal flag is immutable' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger referrals_guard_internal before update of internal on public.referrals
  for each row execute function app.guard_referral_internal();

-- ---------------------------------------------------------------------------
-- Agreement: internal referrals get no sourcing commission
-- ---------------------------------------------------------------------------
create or replace function app.create_agreement_for_referral(p_referral uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_rule public.commission_rules;
  v_internal boolean;
  v_id uuid;
begin
  select * into v_rule from public.commission_rules where is_default and retired_at is null;
  if not found then raise exception 'no_default_commission_rule' using errcode = 'P0001'; end if;
  select internal into v_internal from public.referrals where id = p_referral;
  insert into public.collaboration_agreements (referral_id, rule_id, rule_name, rule_version,
    sourcing_bps, job_owner_bps, platform_bps, target_accepted_by, target_accepted_at)
  values (p_referral, v_rule.id,
    case when v_internal then v_rule.name || ' (internal)' else v_rule.name end,
    v_rule.version,
    case when v_internal then 0 else v_rule.sourcing_bps end,
    case when v_internal then v_rule.sourcing_bps + v_rule.job_owner_bps else v_rule.job_owner_bps end,
    v_rule.platform_bps, auth.uid(), now())
  on conflict (referral_id) do nothing
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Opportunities: flag related-org jobs, no partner share for them
-- ---------------------------------------------------------------------------
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
  is_new boolean,
  internal boolean
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
    and m.expired_at is null
    and c.status = 'active_for_matching'
    and j.status = 'active' and j.accepts_external_referrals
    and o.suspended_at is null
    and (p_candidate is null or c.id = p_candidate)
    and (p_match is null or m.id = p_match)
  order by m.score desc, m.refreshed_at desc;
end $$;

revoke execute on function public.get_opportunities(uuid, uuid, uuid) from public, anon;
grant execute on function public.get_opportunities(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Referrals sent: no partner share when every referral to that job was internal
-- ---------------------------------------------------------------------------
drop function if exists public.get_sent_referral_jobs(uuid);
create function public.get_sent_referral_jobs(p_org uuid)
returns table (
  job_id uuid,
  status public.job_status,
  status_updated_at timestamptz,
  expected_fee_minor bigint,
  fee_currency char(3),
  your_share_minor bigint,
  internal boolean
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
      j.id, j.status, j.updated_at,
      case when j.share_fee then j.expected_fee_minor end,
      case when j.share_fee then j.fee_currency end,
      case when j.share_fee and v_sourcing_bps is not null and not s.internal
           then (j.expected_fee_minor * v_sourcing_bps) / 10000 end,
      s.internal
    from public.jobs j
    cross join lateral (
      select bool_and(r.internal) as internal
      from public.referrals r where r.job_id = j.id and r.source_org_id = p_org
    ) s
    where exists (select 1 from public.referrals r where r.job_id = j.id and r.source_org_id = p_org);
end $$;

revoke execute on function public.get_sent_referral_jobs(uuid) from public, anon;
grant execute on function public.get_sent_referral_jobs(uuid) to authenticated;
