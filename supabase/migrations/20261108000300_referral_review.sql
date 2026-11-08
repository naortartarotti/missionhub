-- Referral review queue (job-owner side).
-- 1. Each referral keeps the match score from submission time, plus only the evidence the
--    sourcing recruiter actually disclosed, so the job owner can sort and triage at volume.
-- 2. Declines carry a structured reason code (feedback for the partner, data for reporting).
-- 3. Bulk decline, and declining every pending referral when a job closes.

alter table public.referrals
  add column fit_score smallint check (fit_score between 0 and 100),
  add column fit_evidence jsonb not null default '{"reasons": [], "gaps": []}',
  add column decline_reason text check (decline_reason in (
    'salary', 'skills', 'seniority', 'location', 'availability', 'duplicate', 'position_filled', 'other'
  ));

create index referrals_target_review_idx on public.referrals (target_org_id, status, fit_score desc nulls last, submitted_at);

-- Which disclosed field each evidence factor depends on. Evidence about a field the sourcing
-- recruiter did not disclose is dropped, so the score never "explains" hidden data.
create or replace function app.disclosed_evidence(p_items jsonb, p_fields text[]) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(e), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
  where case e->>'factor'
    when 'skills' then 'skills' = any(p_fields)
    when 'preferred_skills' then 'skills' = any(p_fields)
    when 'seniority' then 'seniority' = any(p_fields)
    when 'experience' then 'seniority' = any(p_fields)
    when 'location' then 'location' = any(p_fields) or 'work_arrangements' = any(p_fields)
    when 'languages' then 'languages' = any(p_fields)
    when 'compensation' then 'salary_expectation' = any(p_fields)
    else false
  end
$$;
revoke execute on function app.disclosed_evidence(jsonb, text[]) from public, anon, authenticated;

create or replace function app.snapshot_referral_fit(p_referral uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_fields text[];
  m public.matches;
begin
  select p.disclosed_fields into v_fields from public.referral_shared_profiles p where p.referral_id = p_referral;
  select mt.* into m
    from public.referral_candidate_links l
    join public.referrals r on r.id = l.referral_id
    join public.matches mt on mt.candidate_id = l.candidate_id and mt.job_id = r.job_id
   where l.referral_id = p_referral;
  if m.id is null or v_fields is null then return; end if;
  update public.referrals
     set fit_score = m.score,
         fit_evidence = jsonb_build_object(
           'reasons', app.disclosed_evidence(m.reasons, v_fields),
           'gaps', app.disclosed_evidence(m.gaps, v_fields))
   where id = p_referral;
end $$;
revoke execute on function app.snapshot_referral_fit(uuid) from public, anon, authenticated;

-- submit_referral inserts the candidate link before the shared profile, so both exist here.
create or replace function app.on_shared_profile_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.snapshot_referral_fit(new.referral_id);
  return new;
end $$;
create trigger referral_shared_profiles_fit after insert on public.referral_shared_profiles
  for each row execute function app.on_shared_profile_insert();

-- Backfill referrals submitted before this migration (uses today's match; best available).
do $$
declare v uuid;
begin
  for v in select id from public.referrals where fit_score is null loop
    perform app.snapshot_referral_fit(v);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Review: transition + structured decline reason in one call.
create or replace function public.review_referral(
  p_referral uuid, p_to public.referral_status, p_reason_code text, p_note text, p_expected_version integer
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_version integer;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_to = 'declined' then
    if p_reason_code is null or p_reason_code not in
       ('salary', 'skills', 'seniority', 'location', 'availability', 'duplicate', 'position_filled', 'other') then
      raise exception 'reason_required' using errcode = '22023';
    end if;
    if p_reason_code = 'other' and v_note is null then
      raise exception 'reason_required' using errcode = '22023';
    end if;
  end if;
  -- The event keeps the note when there is one, otherwise the code (rendered as a label in the UI).
  v_version := public.transition_referral(p_referral, p_to, coalesce(v_note, nullif(p_reason_code, '')), p_expected_version);
  if p_to = 'declined' then
    update public.referrals set decline_reason = p_reason_code where id = p_referral;
  end if;
  return v_version;
end $$;

-- Bulk decline for the job owner. Skips referrals that moved on or aren't the caller's; returns the count declined.
create or replace function public.decline_referrals(p_ids uuid[], p_reason_code text, p_note text default null)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n integer := 0;
begin
  if cardinality(p_ids) > 200 then raise exception 'too_many' using errcode = '22023'; end if;
  for r in
    select id, version from public.referrals
     where id = any (p_ids) and status in ('submitted', 'under_review', 'info_requested')
       and app.is_member(target_org_id)
  loop
    begin
      perform public.review_referral(r.id, 'declined', p_reason_code, p_note, r.version);
      n := n + 1;
    exception when others then
      if sqlstate = '22023' then raise; end if; -- invalid reason: fail the whole batch
      -- stale version / concurrent change: skip this one
    end;
  end loop;
  return n;
end $$;

-- When a job is filled or closed, release every partner still waiting on a decision.
create or replace function public.decline_pending_for_job(p_job uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_ids uuid[];
begin
  select organization_id into v_org from public.jobs where id = p_job;
  if v_org is null or not app.is_member(v_org) then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(array_agg(id), '{}') into v_ids from public.referrals
   where job_id = p_job and target_org_id = v_org and status in ('submitted', 'under_review', 'info_requested');
  if cardinality(v_ids) = 0 then return 0; end if;
  return public.decline_referrals(v_ids, 'position_filled', null);
end $$;

revoke execute on function public.review_referral(uuid, public.referral_status, text, text, integer) from public, anon;
revoke execute on function public.decline_referrals(uuid[], text, text) from public, anon;
revoke execute on function public.decline_pending_for_job(uuid) from public, anon;
grant execute on function public.review_referral(uuid, public.referral_status, text, text, integer) to authenticated;
grant execute on function public.decline_referrals(uuid[], text, text) to authenticated;
grant execute on function public.decline_pending_for_job(uuid) to authenticated;
