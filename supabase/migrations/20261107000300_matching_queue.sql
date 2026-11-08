-- Durable background jobs + cross-organization match store.
-- `matches` has RLS enabled with NO policies: end users can never select it directly.
-- Only the internal matching worker (service role) writes it, and only the minimized,
-- role-scoped projections below (SECURITY DEFINER) read it on behalf of users.

create type public.background_job_status as enum ('queued', 'running', 'succeeded', 'failed', 'dead');
create type public.match_band as enum ('strong', 'potential', 'not_eligible');

create table public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  dedup_key text not null,
  payload jsonb not null default '{}',
  status public.background_job_status not null default 'queued',
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index background_jobs_dedup_queued on public.background_jobs (kind, dedup_key) where status = 'queued';
create index background_jobs_ready_idx on public.background_jobs (status, run_at) where status in ('queued', 'failed');
alter table public.background_jobs enable row level security; -- no policies: service role only

create or replace function app.enqueue(p_kind text, p_dedup text, p_payload jsonb, p_delay interval default '0 seconds')
returns void
language sql security definer set search_path = '' as $$
  insert into public.background_jobs (kind, dedup_key, payload, run_at)
  values (p_kind, p_dedup, p_payload, now() + p_delay)
  on conflict (kind, dedup_key) where status = 'queued' do nothing;
$$;

-- Worker API (service role only).
create or replace function public.claim_background_jobs(p_worker text, p_limit integer default 10)
returns setof public.background_jobs
language plpgsql security definer set search_path = '' as $$
begin
  -- Recover jobs whose worker died mid-flight.
  update public.background_jobs
     set status = 'failed', last_error = 'lock timeout', locked_at = null, locked_by = null
   where status = 'running' and locked_at < now() - interval '5 minutes';

  return query
  update public.background_jobs j
     set status = 'running', attempts = j.attempts + 1, locked_at = now(), locked_by = p_worker
   where j.id in (
     select id from public.background_jobs
      where status in ('queued', 'failed') and run_at <= now()
      order by run_at
      limit p_limit
      for update skip locked
   )
  returning j.*;
end $$;

create or replace function public.complete_background_job(p_id uuid)
returns void
language sql security definer set search_path = '' as $$
  update public.background_jobs
     set status = 'succeeded', finished_at = now(), locked_at = null, last_error = null
   where id = p_id;
$$;

create or replace function public.fail_background_job(p_id uuid, p_error text)
returns void
language sql security definer set search_path = '' as $$
  update public.background_jobs
     set status = case when attempts >= max_attempts then 'dead'::public.background_job_status else 'failed' end,
         last_error = left(p_error, 1000),
         locked_at = null,
         locked_by = null,
         run_at = now() + make_interval(secs => least(3600, power(2, attempts)::int * 5)),
         finished_at = case when attempts >= max_attempts then now() end
   where id = p_id;
$$;

revoke execute on function public.claim_background_jobs(text, integer) from public, anon, authenticated;
revoke execute on function public.complete_background_job(uuid) from public, anon, authenticated;
revoke execute on function public.fail_background_job(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_background_jobs(text, integer) to service_role;
grant execute on function public.complete_background_job(uuid) to service_role;
grant execute on function public.fail_background_job(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Matches
-- ---------------------------------------------------------------------------
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  candidate_org_id uuid not null references public.organizations (id) on delete cascade,
  job_org_id uuid not null references public.organizations (id) on delete cascade,
  score smallint not null check (score between 0 and 100),
  band public.match_band not null,
  -- Evidence arrays: [{ "factor": "skills", "label": "...", "weight": n }] — never free-form PII.
  reasons jsonb not null default '[]',
  gaps jsonb not null default '[]',
  blockers jsonb not null default '[]',
  factor_scores jsonb not null default '{}',
  model_version text not null,
  input_hash text not null,
  refreshed_at timestamptz not null default now(),
  expired_at timestamptz,
  created_at timestamptz not null default now(),
  unique (candidate_id, job_id),
  check (candidate_org_id <> job_org_id)
);
create index matches_candidate_org_idx on public.matches (candidate_org_id, band) where expired_at is null;
create index matches_job_idx on public.matches (job_id, band) where expired_at is null;
alter table public.matches enable row level security; -- intentionally no policies

create table public.match_feedback (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  helpful boolean not null,
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique (match_id, user_id)
);
alter table public.match_feedback enable row level security;
create policy match_feedback_rw on public.match_feedback for all to authenticated
  using (user_id = auth.uid() and app.is_member(organization_id))
  with check (user_id = auth.uid() and app.is_member(organization_id));

-- ---------------------------------------------------------------------------
-- Enqueue recomputation on relevant changes; expire synchronously when ineligible.
-- ---------------------------------------------------------------------------
create or replace function app.on_candidate_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'active_for_matching' then
    update public.matches set expired_at = now()
     where candidate_id = new.id and expired_at is null;
  end if;
  if new.status = 'active_for_matching' then
    perform app.enqueue('match.candidate', new.id::text, jsonb_build_object('candidate_id', new.id), '2 seconds');
  end if;
  return new;
end $$;
create trigger candidates_enqueue_matching after insert or update of
  status, skills, languages, seniority, years_experience, work_arrangements, location_country, location_region,
  location_city, open_to_relocation, salary_expectation_min, salary_expectation_max, salary_currency, headline, summary
  on public.candidates for each row execute function app.on_candidate_change();

create or replace function app.on_job_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'active' or not new.accepts_external_referrals then
    update public.matches set expired_at = now()
     where job_id = new.id and expired_at is null;
  else
    perform app.enqueue('match.job', new.id::text, jsonb_build_object('job_id', new.id), '2 seconds');
  end if;
  return new;
end $$;
create trigger jobs_enqueue_matching after insert or update of
  status, accepts_external_referrals, required_skills, preferred_skills, languages, seniority, min_years_experience,
  work_arrangement, location_country, location_region, location_city, salary_min, salary_max, salary_currency,
  title, description
  on public.jobs for each row execute function app.on_job_change();

-- Consent changes alter eligibility.
create or replace function app.on_consent_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'processing' then
    perform app.enqueue('match.candidate', new.candidate_id::text, jsonb_build_object('candidate_id', new.candidate_id), '2 seconds');
    if new.revoked_at is not null then
      update public.matches set expired_at = now() where candidate_id = new.candidate_id and expired_at is null;
    end if;
  end if;
  return new;
end $$;
create trigger candidate_consents_enqueue after insert or update on public.candidate_consents
  for each row execute function app.on_consent_change();

-- ---------------------------------------------------------------------------
-- Role-scoped projections
-- ---------------------------------------------------------------------------

-- Candidate owner (A): jobs from OTHER organizations that match A's own candidates.
-- Job fields respect the job owner's pre-referral visibility settings.
create or replace function public.get_opportunities(p_org uuid, p_candidate uuid default null, p_match uuid default null)
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
  score smallint,
  band public.match_band,
  reasons jsonb,
  gaps jsonb,
  blockers jsonb,
  model_version text,
  refreshed_at timestamptz,
  referral_id uuid,
  referral_status text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_member(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
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
    m.score, m.band, m.reasons, m.gaps, m.blockers, m.model_version, m.refreshed_at,
    r.id, r.status::text
  from public.matches m
  join public.candidates c on c.id = m.candidate_id
  join public.jobs j on j.id = m.job_id
  join public.organizations o on o.id = j.organization_id
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

-- Job owner (B): only aggregate counts, never identities, IDs, or per-candidate evidence.
create or replace function public.get_job_match_summary(p_job uuid)
returns table (strong_count integer, potential_count integer, last_refreshed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.jobs where id = p_job;
  if v_org is null or not app.is_member(v_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select
    count(*) filter (where m.band = 'strong')::int,
    count(*) filter (where m.band = 'potential')::int,
    max(m.refreshed_at)
  from public.matches m
  join public.candidates c on c.id = m.candidate_id
  where m.job_id = p_job and m.expired_at is null and c.status = 'active_for_matching';
end $$;

revoke execute on function public.get_opportunities(uuid, uuid, uuid) from public, anon;
revoke execute on function public.get_job_match_summary(uuid) from public, anon;
grant execute on function public.get_opportunities(uuid, uuid, uuid) to authenticated;
grant execute on function public.get_job_match_summary(uuid) to authenticated;
