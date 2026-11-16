-- N3 Ops SQL (docs/specs/referral-claims-two-sided-hire, PD-069 cut 3, PD-073): HA-1, HA-9 and the brief §4
-- metrics are read with these queries until the N2.1 metrics panel. Admin signals only: never shown to an org,
-- never an automatic action (BR-40, BR-41).
--
-- How to run: as an operator with a read-only role on the database (Supabase SQL editor or psql). They read
-- closed `app` tables, so they can't run through PostgREST or the app. Each block starts with "-- name:" and ends
-- with a blank line followed by the next block; tests/integration/n3-record-hire.test.ts executes HA-9 verbatim.
-- Dates are compared in America/Toronto. Client keys use the BR-3 union (commit key ∪ delivery key).

-- name: ha9_release_before_hire
-- HA-9 (BR-36): a release on day D followed by a hire record (placement or without a split, on any referral at the
-- same hiring org for the same client, by either key) on day D … D + 14.
select rel.referral_id                 as released_referral_id,
       rel.source_org_id               as releasing_org_id,
       rel.target_org_id               as hiring_org_id,
       rel.released_at,
       h.referral_id                   as hired_referral_id,
       h.kind                          as hire_kind,
       h.created_at                    as hire_recorded_at
  from app.referral_presentations rel
  join public.hire_records h
    on h.target_org_id = rel.target_org_id
   and (h.created_at at time zone 'America/Toronto')::date - (rel.released_at at time zone 'America/Toronto')::date between 0 and 14
   and h.created_at >= rel.released_at
 where rel.released_at is not null
   and app.referral_client_keys(rel.referral_id) && app.referral_client_keys(h.referral_id)
 order by h.created_at desc;

-- name: metric_client_key_coverage
-- Brief §4: client-key coverage on referral-open jobs (100 % by construction after BR-1).
select count(*) filter (where app.client_key(j.client_name) is not null) as open_jobs_with_key,
       count(*)                                                          as open_jobs
  from public.jobs j
 where j.accepts_external_referrals and j.status = 'active';

-- name: metric_self_recorded_non_offer
-- Brief §4: hires the hiring side self-recorded on referrals that weren't in `offer` (last 90 days).
select count(*) filter (where h.prior_status <> 'offer') as self_recorded_non_offer,
       count(*)                                          as self_recorded_total
  from public.hire_records h
 where h.origin = 'target_record' and h.created_at >= now() - interval '90 days';

-- name: metric_record_duty
-- Brief §4: share of the hiring side's own records made within the 5-business-day duty (BR-13 `late`).
select count(*) filter (where not x.late) as on_time,
       count(*)                           as total,
       round(100.0 * count(*) filter (where not x.late) / nullif(count(*), 0), 1) as on_time_pct
  from public.hire_records h
  join app.hire_record_admin x on x.hire_record_id = h.id
 where h.origin in ('target_record', 'report_confirmed') and h.created_at >= now() - interval '90 days';

-- name: metric_fee_pending_age
-- Brief §4 / BR-31: fee-pending placements by age in business days since establishment (target: none > 20).
select p.id as placement_id, p.target_org_id, p.established_how, p.established_at, p.fee_details_due_at,
       app.business_days_left(now(), p.established_at) as business_days_open,  -- business days from establishment to now
       n.notice_sent_on
  from public.placements p
  left join app.placement_fee_notices n on n.placement_id = p.id
 where p.status = 'fee_pending' and p.fee_details_entered_at is null
 order by p.established_at;

-- name: ha1_hires_first_reported_by_source
-- HA-1 (BR-40, PD-075): a hiring org with ≥ 2 hires in the last 12 months that the sourcing side first reported and
-- whose reports ended confirmed, deemed_confirmed, upheld or closed_by_record.
select r.target_org_id as hiring_org_id, count(distinct r.referral_id) as hires_first_reported_by_source
  from app.hire_reports r
 where r.status in ('confirmed', 'deemed_confirmed', 'upheld', 'closed_by_record')
   and r.resolved_at >= now() - interval '12 months'
 group by r.target_org_id
having count(distinct r.referral_id) >= 2
 order by 2 desc;

-- name: metric_report_resolution_time
-- Brief §4: median time from filing to resolution, in business days (target ≤ 15), last 90 days.
select percentile_cont(0.5) within group (order by app.business_days_left(r.resolved_at, r.filed_at)) as median_business_days,
       count(*) as resolved_reports
  from app.hire_reports r
 where r.resolved_at is not null and r.resolved_at >= now() - interval '90 days';

-- name: metric_reports_to_placements
-- Brief §4: share of resolved reports that established a hire (target ≥ 50 %), last 90 days.
select count(*) filter (where r.status in ('confirmed', 'closed_by_record', 'deemed_confirmed', 'upheld')) as reports_to_hire,
       count(*) filter (where r.resolved_at is not null) as resolved_reports,
       round(100.0 * count(*) filter (where r.status in ('confirmed', 'closed_by_record', 'deemed_confirmed', 'upheld'))
             / nullif(count(*) filter (where r.resolved_at is not null), 0), 1) as pct
  from app.hire_reports r
 where r.filed_at >= now() - interval '90 days';

-- name: metric_contested_upheld
-- Brief §4: share of contested reports that were upheld (target < 30 %), last 90 days.
select count(*) filter (where r.status = 'upheld') as upheld,
       count(*) filter (where r.status in ('upheld', 'rejected')) as decided,
       round(100.0 * count(*) filter (where r.status = 'upheld') / nullif(count(*) filter (where r.status in ('upheld', 'rejected')), 0), 1) as pct
  from app.hire_reports r
 where r.contested_at is not null and r.resolved_at >= now() - interval '90 days';

-- name: metric_placements_first_reported_by_source
-- Brief §4: share of hire records (last 90 days) that a sourcing-side report surfaced first (watch, no target).
select count(*) filter (where h.origin in ('report_confirmed', 'report_deemed', 'report_upheld')
                           or exists (select 1 from app.hire_reports r where r.referral_id = h.referral_id and r.status = 'closed_by_record')) as first_by_source,
       count(*) as hire_records
  from public.hire_records h
 where h.created_at >= now() - interval '90 days';

-- name: metric_candidate_contacts_per_dispute
-- Brief §4: admin candidate contacts per decided hire-report dispute (target ≤ 1), last 90 days.
select avg(r.candidate_contacts)::numeric(5, 2) as avg_contacts, max(r.candidate_contacts) as max_contacts, count(*) as decided
  from app.hire_reports r
 where r.status in ('upheld', 'rejected') and r.resolved_at >= now() - interval '90 days';

-- "Deemed confirmations later reopened" comes with N7 (BR-30).
