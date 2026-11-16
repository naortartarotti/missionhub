-- N2 job terms card, drop 1, part 2 of 3: publishing terms and the partner-visibility gate.
--
--   BR-4/BR-5/BR-6  public.save_job_terms: the only writer of terms versions and of the move of
--                   jobs.accepts_external_referrals to true (guard trigger, every role).
--   BR-32           One in-app notification per source org with a live referral on a new version.
--   BR-3/BR-7       app.job_partner_visible on every partner surface: get_opportunities,
--                   assert_referable (both submit RPCs), match triage, admin metrics.
--   BR-33           get_opportunities.terms_updated_at; get_jobs_terms_state for the owner (nudge).
--   BR-28           publish_commission_rule takes the platform basis.
--
-- Bodies of functions redefined here are copied from their live definitions
-- (20261115000300_recruiter_record_scope.sql unless stated); N2 changes are marked "-- N2".

-- ---------------------------------------------------------------------------
-- 1. Opening a job to referrals goes through save_job_terms only (BR-4, BR-6)
-- ---------------------------------------------------------------------------
-- The RPC sets the transaction-local GUC app.job_terms_rpc; PostgREST exposes no way to set it.
-- Rows already open at migration time are untouched (no false → true transition).
create or replace function app.guard_job_referral_flag() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.accepts_external_referrals
     and (tg_op = 'INSERT' or not old.accepts_external_referrals)
     and coalesce(current_setting('app.job_terms_rpc', true), '') <> 'on' then
    raise exception 'terms_incomplete' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function app.guard_job_referral_flag() from public, anon, authenticated;
create trigger jobs_referral_flag_guard before insert or update of accepts_external_referrals on public.jobs
  for each row execute function app.guard_job_referral_flag();

-- ---------------------------------------------------------------------------
-- 2. Notifications to the members who submitted (BR-32, PD-051 Q-8)
-- ---------------------------------------------------------------------------
-- Each still-active submitter who still sees one of the referrals gets one notification (scoped by
-- that referral's link, so app.notify_org applies record scope). If none does, one notification
-- goes to whoever may see the most recent referral (candidate owner + managers).
create or replace function app.notify_submitters_or_fallback(
  p_org uuid, p_referrals uuid[], p_kind text, p_title text, p_body text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s record;
  v_sent integer := 0;
  v_latest uuid;
begin
  for s in
    select distinct on (r.source_user_id) r.source_user_id as user_id, r.id
      from public.referrals r
     where r.id = any (p_referrals) and r.source_org_id = p_org
       and app.user_sees_referral_as_source(r.source_user_id, r.id)
     order by r.source_user_id, r.created_at desc
  loop
    perform app.notify_org(p_org, p_kind, p_title, p_body, '/referrals/' || s.id, s.user_id);
    v_sent := v_sent + 1;
  end loop;
  if v_sent = 0 then
    select r.id into v_latest from public.referrals r
     where r.id = any (p_referrals) and r.source_org_id = p_org order by r.created_at desc limit 1;
    if v_latest is not null then
      perform app.notify_org(p_org, p_kind, p_title, p_body, '/referrals/' || v_latest);
    end if;
  end if;
end $$;
revoke execute on function app.notify_submitters_or_fallback(uuid, uuid[], text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. save_job_terms (BR-1, BR-4 to BR-6, BR-32)
-- ---------------------------------------------------------------------------
create function public.save_job_terms(
  p_job uuid,
  p_open boolean,
  p_fee_basis public.fee_basis default null,          -- null with p_open = false: close only, no version
  p_rate_bps integer default null,                    -- % bases
  p_flat_fee_minor bigint default null,               -- flat
  p_min_fee_minor bigint default null,                -- % bases, optional
  p_flat_currency char(3) default null,               -- flat; % bases use jobs.salary_currency
  p_search_type public.search_type default null,
  p_attested boolean default false,                   -- T6, required when a version is created
  p_guarantee_days integer default null,
  p_guarantee_remedy public.guarantee_remedy default null,  -- null iff 0 days
  p_payment_terms_days integer default null,
  p_ownership_months integer default null
) returns table (terms_version_id uuid, version_no integer, created boolean, notified_orgs integer)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  j public.jobs;
  cur public.job_terms_versions;
  v_currency char(3);
  v_created boolean := false;
  v_notified integer := 0;
  v_org_name text;
  s record;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  perform app.enforce_rate_limit('job.terms', 60, 3600);
  select * into j from public.jobs where id = p_job for update;
  -- Edit rights on the job: its owner or a manager (RD-012). Anything else looks like a missing job.
  if not found or not app.can_manage_job(j.id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  cur := app.current_job_terms(j.id);

  if p_fee_basis is null then
    -- No card: only closing is possible (BR-6). No version is created or removed.
    if coalesce(p_open, false) then raise exception 'terms_incomplete' using errcode = '22023'; end if;
    if j.accepts_external_referrals then
      update public.jobs set accepts_external_referrals = false where id = j.id;
    end if;
    return query select cur.id, cur.version_no, false, 0;
    return;
  end if;

  -- T4: % bases use the job's salary currency (any currency, PD-051 Q3); flat declares one of five.
  v_currency := case when p_fee_basis = 'flat' then upper(btrim(coalesce(p_flat_currency, ''))) else j.salary_currency end;
  if (p_fee_basis = 'flat' and (p_flat_fee_minor is null or p_flat_fee_minor <= 0 or p_rate_bps is not null
                                or p_min_fee_minor is not null or v_currency not in ('CAD', 'USD', 'EUR', 'GBP', 'BRL')))
     or (p_fee_basis <> 'flat' and (p_rate_bps is null or p_rate_bps not between 100 and 5000 or p_flat_fee_minor is not null
                                    or (p_min_fee_minor is not null and p_min_fee_minor <= 0)))
     or p_search_type is null
     or p_guarantee_days is null or p_guarantee_days not in (0, 30, 60, 90, 120, 180)
     or ((p_guarantee_days = 0) <> (p_guarantee_remedy is null))
     or p_payment_terms_days is null or p_payment_terms_days not between 0 and 90
     or p_ownership_months is null or p_ownership_months not between 6 and 12 then
    raise exception 'terms_incomplete' using errcode = '22023';
  end if;

  -- BR-5: a version only when a T1–T9 value differs from the current one (attestation ignored).
  if cur.id is null or (cur.fee_basis, cur.rate_bps, cur.flat_fee_minor, cur.min_fee_minor, cur.currency, cur.search_type,
                        cur.guarantee_days, cur.guarantee_remedy, cur.payment_terms_days, cur.ownership_months)
                       is distinct from
                       (p_fee_basis, p_rate_bps, p_flat_fee_minor, p_min_fee_minor, v_currency, p_search_type,
                        p_guarantee_days::smallint, p_guarantee_remedy, p_payment_terms_days::smallint, p_ownership_months::smallint) then
    -- BR-4 (PD-051 Q-2): T6 is ticked on every save that creates a version.
    if not coalesce(p_attested, false) then raise exception 'terms_attestation_required' using errcode = '22023'; end if;
    insert into public.job_terms_versions (job_id, organization_id, kind, version_no, fee_basis, rate_bps, flat_fee_minor,
      min_fee_minor, currency, search_type, direct_client_attested_by, direct_client_attested_at, guarantee_days,
      guarantee_remedy, payment_terms_days, ownership_months, created_by)
    values (j.id, j.organization_id, 'job', coalesce(cur.version_no, 0) + 1, p_fee_basis, p_rate_bps, p_flat_fee_minor,
      p_min_fee_minor, v_currency, p_search_type, auth.uid(), now(), p_guarantee_days, p_guarantee_remedy,
      p_payment_terms_days, p_ownership_months, auth.uid())
    returning * into cur;
    v_created := true;
  end if;

  if coalesce(p_open, false) then
    -- BR-6: permanent only, whatever the job's status (drafts included).
    if j.contract_type <> 'permanent' then raise exception 'referrals_require_permanent' using errcode = '22023'; end if;
    if not j.accepts_external_referrals then
      perform set_config('app.job_terms_rpc', 'on', true);
      update public.jobs set accepts_external_referrals = true where id = j.id;
      perform set_config('app.job_terms_rpc', '', true);
    end if;
  elsif j.accepts_external_referrals then
    update public.jobs set accepts_external_referrals = false where id = j.id;
  end if;

  if v_created then
    -- BR-32: every version after the first notifies source orgs with a live referral on the job.
    if cur.version_no > 1 then
      select o.name into v_org_name from public.organizations o where o.id = j.organization_id;
      for s in
        select r.source_org_id as org, array_agg(r.id) as refs
          from public.referrals r
         where r.job_id = j.id
           and r.status in ('awaiting_candidate', 'submitted', 'under_review', 'info_requested', 'accepted', 'interviewing', 'offer')
         group by r.source_org_id
      loop
        perform app.notify_submitters_or_fallback(s.org, s.refs, 'job.terms_changed', 'Job terms updated',
          coalesce(v_org_name, 'The hiring recruiter') || ' updated the terms for ' || j.title
            || '. Your referrals keep the terms they were sent under.');
        v_notified := v_notified + 1;
      end loop;
    end if;
    -- No audit event: the immutable version row is the record (created_by, created_at, attestation),
    -- and N1 guarantees the hiring side's audit trail on a job holds no presentation trace (AC-56).
  end if;

  return query select cur.id, cur.version_no, v_created, v_notified;
end $$;
revoke execute on function public.save_job_terms(uuid, boolean, public.fee_basis, integer, bigint, bigint, char, public.search_type,
  boolean, integer, public.guarantee_remedy, integer, integer) from public, anon;
grant execute on function public.save_job_terms(uuid, boolean, public.fee_basis, integer, bigint, bigint, char, public.search_type,
  boolean, integer, public.guarantee_remedy, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Owner view of the gate (BR-7 nudge, BR-33 form notice)
-- ---------------------------------------------------------------------------
create function public.get_jobs_terms_state(p_org uuid, p_job uuid default null)
returns table (
  job_id uuid,
  partner_visible boolean,
  hidden_reason text,
  terms_version_id uuid,
  version_no integer,
  published_at timestamptz,
  published_by_name text,
  fee_basis public.fee_basis,
  rate_bps integer,
  flat_fee_minor bigint,
  min_fee_minor bigint,
  currency char(3),
  search_type public.search_type,
  attested_by_name text,
  attested_at timestamptz,
  guarantee_days integer,
  guarantee_remedy public.guarantee_remedy,
  payment_terms_days integer,
  ownership_months integer,
  referral_count integer
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_member(p_org) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select j.id, app.job_partner_visible(j), app.job_hidden_reason(j),
           v.id, v.version_no, v.created_at, pc.full_name,
           v.fee_basis, v.rate_bps, v.flat_fee_minor, v.min_fee_minor, v.currency, v.search_type,
           pa.full_name, v.direct_client_attested_at,
           v.guarantee_days::integer, v.guarantee_remedy, v.payment_terms_days::integer, v.ownership_months::integer,
           -- Referrals the hiring side can know about (hidden statuses never counted).
           (select count(*)::integer from public.referrals r where r.job_id = j.id and not app.hidden_from_target(r.status))
      from public.jobs j
      left join lateral (select x.* from app.current_job_terms(j.id) x) v on true
      left join public.profiles pc on pc.id = v.created_by
      left join public.profiles pa on pa.id = v.direct_client_attested_by
     where j.organization_id = p_org and (p_job is null or j.id = p_job)
     order by j.updated_at desc;
end $$;
revoke execute on function public.get_jobs_terms_state(uuid, uuid) from public, anon;
grant execute on function public.get_jobs_terms_state(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Opportunities: predicate + the partner card (BR-3, BR-8, BR-9, BR-33, T10)
-- ---------------------------------------------------------------------------
-- Return type changes: the live fee and share_fee columns are gone; the current terms version,
-- the current default rule and the gated estimate are returned instead.
drop function public.get_opportunities(uuid, uuid, uuid);
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
  terms_version_id uuid,
  terms_version_no integer,
  terms_published_at timestamptz,
  terms_updated_at timestamptz,
  fee_basis public.fee_basis,
  rate_bps integer,
  flat_fee_minor bigint,
  min_fee_minor bigint,
  fee_currency char(3),
  search_type public.search_type,
  guarantee_days integer,
  guarantee_remedy public.guarantee_remedy,
  payment_terms_days integer,
  ownership_months integer,
  rule_name text,
  rule_version integer,
  sourcing_bps integer,
  job_owner_bps integer,
  platform_bps integer,
  estimated_fee_minor bigint,
  estimated_share_minor bigint,
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
  v_rule public.commission_rules;
begin
  if not app.is_member(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- N2: T10 is the current default rule (BR-2).
  select * into v_rule from public.commission_rules cr where cr.is_default and cr.retired_at is null order by cr.version desc limit 1;
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
    -- N2: the current terms version (BR-8) and the "terms updated" line (BR-33).
    v.id, v.version_no, v.created_at,
    case when v.version_no > 1 and v.created_at > now() - interval '30 days' then v.created_at end,
    v.fee_basis, v.rate_bps, v.flat_fee_minor, v.min_fee_minor, v.currency, v.search_type,
    v.guarantee_days::integer, v.guarantee_remedy, v.payment_terms_days::integer, v.ownership_months::integer,
    v_rule.name, v_rule.version, v_rule.sourcing_bps, v_rule.job_owner_bps, v_rule.platform_bps,
    -- N2: estimate gated by share_salary on % bases (BR-9); share = the sourcing part of the split.
    est.fee,
    case when est.fee is not null and v_rule.id is not null and not rel.internal
         then (app.allocate_minor(est.fee, array[v_rule.sourcing_bps, v_rule.job_owner_bps, v_rule.platform_bps]))[1] end,
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
  cross join lateral (select x.* from app.current_job_terms(j.id) x) v
  cross join lateral (select app.terms_estimate(v.fee_basis, v.rate_bps, v.flat_fee_minor, v.min_fee_minor,
                                                j.share_salary, j.salary_min, j.salary_max) as fee) est
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
    and (c.owner_id = auth.uid() or app.sees_all(p_org))
    and m.expired_at is null
    and c.status = 'active_for_matching'
    and app.job_partner_visible(j)  -- N2: BR-3 (replaces active ∧ open ∧ org not suspended)
    and (p_candidate is null or c.id = p_candidate)
    and (p_match is null or m.id = p_match)
  order by m.score desc, m.refreshed_at desc;
end $$;
revoke execute on function public.get_opportunities(uuid, uuid, uuid) from public, anon;
grant execute on function public.get_opportunities(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Submit precondition (V2, both submit RPCs)
-- ---------------------------------------------------------------------------
create or replace function app.assert_referable(p_candidate uuid, p_job uuid, p_fields text[])
returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.candidates;
  j public.jobs;
  v_allowed text[] := array['full_name','email','phone','headline','summary','location','seniority','skills',
                            'languages','work_arrangements','salary_expectation','availability','experience','mobility'];
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;

  select * into c from public.candidates where id = p_candidate for update;
  if not found or not app.is_member(c.organization_id) or not app.can_access_candidate(c.id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if c.status <> 'active_for_matching' then
    raise exception 'candidate_not_active' using errcode = 'P0001';
  end if;

  select * into j from public.jobs where id = p_job;
  -- N2: BR-3 predicate (includes the org-suspension check that used to follow).
  if not found or not app.job_partner_visible(j) or j.organization_id = c.organization_id then
    raise exception 'job_not_open_for_referrals' using errcode = 'P0001';
  end if;

  if p_fields is null or cardinality(p_fields) = 0 or not (p_fields <@ v_allowed) then
    raise exception 'invalid_disclosure_fields' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.referral_candidate_links l join public.referrals r on r.id = l.referral_id
    where l.candidate_id = c.id and r.job_id = j.id
      and r.status not in ('declined', 'withdrawn', 'rejected', 'cancelled', 'candidate_declined', 'already_presented')
  ) then
    raise exception 'duplicate_referral' using errcode = '23505';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Match triage (V5): matches of jobs that aren't partner-visible behave as missing
-- ---------------------------------------------------------------------------
create or replace function app.assert_own_match(p_org uuid, p_match uuid)
returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_member(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.matches m where m.id = p_match and m.candidate_org_id = p_org
                   and app.can_access_candidate(m.candidate_id)
                   and exists (select 1 from public.jobs j where j.id = m.job_id and app.job_partner_visible(j))) then  -- N2
    raise exception 'not_found' using errcode = 'P0002';
  end if;
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
  where m.id = any (p_matches) and m.candidate_org_id = p_org and app.can_access_candidate(m.candidate_id)
    and exists (select 1 from public.jobs j where j.id = m.job_id and app.job_partner_visible(j))  -- N2
  on conflict (organization_id, match_id) do update set seen_at = coalesce(t.seen_at, now());
end $$;

-- ---------------------------------------------------------------------------
-- 8. Sent referrals: job status only; the terms come from each referral's snapshot (BR-36, PD-050 c)
-- ---------------------------------------------------------------------------
drop function public.get_sent_referral_jobs(uuid);
create function public.get_sent_referral_jobs(p_org uuid)
returns table (job_id uuid, status public.job_status, status_updated_at timestamptz, internal boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_member(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select j.id, j.status, j.updated_at, s.internal
    from public.jobs j
    cross join lateral (
      select bool_and(r.internal) as internal
      from public.referrals r where r.job_id = j.id and r.source_org_id = p_org and app.sees_referral_as_source(r.id)
    ) s
    where exists (select 1 from public.referrals r where r.job_id = j.id and r.source_org_id = p_org and app.sees_referral_as_source(r.id));
end $$;
revoke execute on function public.get_sent_referral_jobs(uuid) from public, anon;
grant execute on function public.get_sent_referral_jobs(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Admin metrics (V7, brief §11.2 item 12). Body from 20261113000700; two keys added.
-- ---------------------------------------------------------------------------
create or replace function public.presentation_admin_metrics(p_days integer default 30) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_since timestamptz;
  v_out jsonb;
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  v_since := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
  select jsonb_build_object(
    'days', least(greatest(coalesce(p_days, 30), 1), 365),
    'hits_job', (select count(*) from app.presentation_hits h where h.created_at >= v_since and h.scope = 'job'),
    'hits_client', (select count(*) from app.presentation_hits h where h.created_at >= v_since and h.scope = 'client'),
    'stops', (select count(*) from app.presentation_hits h where h.created_at >= v_since and h.outcome in ('stop', 'sticky')),
    'sticky_stops', (select count(*) from app.presentation_hits h where h.created_at >= v_since and h.outcome = 'sticky'),
    'pending_warnings', (select count(*) from app.presentation_hits h where h.created_at >= v_since and h.outcome = 'warn'),
    'identifier_refusals', (select count(*) from app.presentation_hits h where h.created_at >= v_since and h.outcome = 'identifier_required'),
    'closures', (select count(*) from app.presentation_hits h where h.created_at >= v_since and h.outcome = 'closure'),
    'delivered', (select count(*) from public.referrals r where r.delivered_at >= v_since),
    'claims', (select count(*) from app.referral_claims c where c.filed_at >= v_since),
    'contested', (select count(*) from app.referral_claims c where c.filed_at >= v_since and c.contested_at is not null),
    'releases', (select count(*) from app.referral_presentations p where p.released_at >= v_since),
    'withdrawals', (select count(*) from public.referral_status_events e where e.created_at >= v_since and e.to_status = 'withdrawn'),
    'open_referral_disputes', (select count(*) from public.disputes d where d.kind = 'prior_presentation' and d.status = 'open'),
    'resolved_referral_disputes', (select count(*) from public.disputes d where d.kind = 'prior_presentation' and d.resolved_at >= v_since),
    'resolved_within_5_business_days', (select count(*) from public.disputes d where d.kind = 'prior_presentation'
                                          and d.resolved_at >= v_since and d.resolved_at <= app.add_business_days(d.created_at, 5)),
    'claims_rejected', (select count(*) from public.disputes d where d.kind = 'prior_presentation'
                          and d.resolved_at >= v_since and d.outcome = 'claim_rejected'),
    'referral_open_jobs', (select count(*) from public.jobs j where j.status = 'active' and j.accepts_external_referrals),
    'referral_open_jobs_with_client_key', (select count(*) from public.jobs j join app.job_client_keys k on k.job_id = j.id
                                            where j.status = 'active' and j.accepts_external_referrals),
    -- N2: partner-visible jobs (all have complete terms by construction) and open jobs hidden for missing terms.
    'partner_visible_jobs', (select count(*) from public.jobs j where app.job_partner_visible(j)),
    'referral_open_without_terms', (select count(*) from public.jobs j
                                     where j.status = 'active' and j.accepts_external_referrals
                                       and not exists (select 1 from public.job_terms_versions v where v.job_id = j.id and v.kind = 'job'))
  ) into v_out;
  return v_out;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Commission rule publishing takes the platform basis (BR-28). Body from 20261107000500.
-- ---------------------------------------------------------------------------
drop function public.publish_commission_rule(text, integer, integer, integer);
create function public.publish_commission_rule(
  p_name text, p_sourcing integer, p_job_owner integer, p_platform integer,
  p_platform_basis public.platform_basis default 'collected'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_version integer;
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(max(version), 0) + 1 into v_version from public.commission_rules where name = p_name;
  update public.commission_rules set is_default = false, retired_at = now() where is_default;
  insert into public.commission_rules (name, version, sourcing_bps, job_owner_bps, platform_bps, platform_basis, is_default, created_by)
  values (p_name, v_version, p_sourcing, p_job_owner, p_platform, coalesce(p_platform_basis, 'collected'), true, auth.uid())
  returning id into v_id;
  perform app.audit(null, 'commission_rule.published', 'commission_rule', v_id,
    jsonb_build_object('sourcing_bps', p_sourcing, 'job_owner_bps', p_job_owner, 'platform_bps', p_platform,
                       'platform_basis', coalesce(p_platform_basis, 'collected')));
  return v_id;
end $$;
revoke execute on function public.publish_commission_rule(text, integer, integer, integer, public.platform_basis) from public, anon;
grant execute on function public.publish_commission_rule(text, integer, integer, integer, public.platform_basis) to authenticated;
