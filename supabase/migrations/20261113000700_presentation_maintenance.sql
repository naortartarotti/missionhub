-- N1 part 7 of 7: maintenance (service role, called by the worker timer), key rotation, and the
-- admin metrics / abuse flags (Should, BR-29, brief §4).
-- Correctness never depends on these sweeps: "final uncontested" is lazy (EC-7) and the counting
-- rule applies BR-4 whether or not fingerprints were purged (BR-21).

-- Materialises claims whose contest window passed with no contest (BR-16). No notification.
create or replace function public.finalize_due_claims() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  c record;
  n integer := 0;
begin
  for c in
    select * from app.referral_claims where status = 'open' and contest_deadline_at <= now()
     order by contest_deadline_at limit 500 for update skip locked
  loop
    update app.referral_claims set status = 'final', finalized_at = c.contest_deadline_at where id = c.id;
    update app.referral_presentations set void_reason = 'prior_presentation_upheld', voided_at = now()
     where referral_id = c.referral_id and void_reason is null;
    perform app.audit(c.target_org_id, 'referral.claim_final', 'referral', c.referral_id, '{}');
    perform app.audit(c.source_org_id, 'referral.claim_final', 'referral', c.referral_id, '{}');
    n := n + 1;
  end loop;
  return n;
end $$;

-- BR-21 as written: fingerprints go when the ownership window has passed and no dispute is open
-- (or when the referral can never count: never delivered and not pending). Expired sticky stops go.
create or replace function public.purge_presentation_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_fp integer;
  v_sticky integer;
begin
  delete from app.referral_fingerprints f
   using public.referrals r
   where r.id = f.referral_id
     and (r.ownership_protected_until <= now()
          or r.status in ('candidate_declined', 'already_presented')
          or (r.delivered_at is null and r.status <> 'awaiting_candidate'))
     and not exists (select 1 from public.disputes d where d.referral_id = r.id and d.status = 'open');
  get diagnostics v_fp = row_count;
  delete from app.sticky_stops where expires_at <= now();
  get diagnostics v_sticky = row_count;
  return jsonb_build_object('fingerprints', v_fp, 'sticky_stops', v_sticky);
end $$;

-- Evidence uploaded but never filed with a claim: after 24 hours (or once removed) the row is
-- marked removed and the path returned so the worker deletes the object.
create or replace function public.purge_orphan_claim_files() returns setof text
language plpgsql security definer set search_path = '' as $$
begin
  return query
    update app.referral_claim_files f set removed_at = coalesce(f.removed_at, now())
     where f.claim_id is null
       and (f.removed_at is not null or f.uploaded_at < now() - interval '24 hours')
       and f.storage_path is not null
    returning f.storage_path;
end $$;

-- Paths already deleted from storage are forgotten (keeps purge_orphan_claim_files idempotent).
create or replace function public.forget_claim_files(p_paths text[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from app.referral_claim_files where claim_id is null and removed_at is not null and storage_path = any (p_paths);
  get diagnostics n = row_count;
  return n;
end $$;

-- Rotation (BR-33): only on suspected compromise. New Vault key, then every live fingerprint is
-- recomputed from the candidates' current identifiers (BR-34). Service role only.
create or replace function public.rotate_fingerprint_key() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_new smallint := app.fingerprint_key_version() + 1;
  v record;
  n integer := 0;
begin
  perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'presentation_fingerprint_key_v' || v_new::text,
    'MissionHub N1 fingerprint HMAC key (never leaves the database)');
  update app.presentation_config set key_version = v_new, rotated_at = now() where id;
  for v in
    select p.referral_id, p.candidate_id from app.referral_presentations p
      join public.referrals r on r.id = p.referral_id
     where p.candidate_id is not null
       and (r.status = 'awaiting_candidate' or app.presentation_counts(r.id)
            or exists (select 1 from public.disputes d where d.referral_id = r.id and d.status = 'open'))
  loop
    perform app.write_fingerprints(v.referral_id, v.candidate_id);
    n := n + 1;
  end loop;
  delete from app.referral_fingerprints where key_version <> v_new;
  perform app.audit(null, 'presentation.key_rotated', 'presentation_key', null, jsonb_build_object('version', v_new, 'referrals', n));
  return jsonb_build_object('version', v_new, 'referrals', n);
end $$;

-- ---------------------------------------------------------------------------
-- Admin metrics (aggregates only) and abuse flags (flag only, no automatic action)
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
                                            where j.status = 'active' and j.accepts_external_referrals)
  ) into v_out;
  return v_out;
end $$;

create or replace function public.presentation_abuse_flags()
returns table (organization_id uuid, organization_name text, stops_7d integer, rejected_claims_90d integer)
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    with s as (
      select h.source_org_id as org, count(*)::integer as n from app.presentation_hits h
       where h.created_at >= now() - interval '7 days' and h.outcome in ('stop', 'sticky')
       group by h.source_org_id),
    rc as (
      select c.target_org_id as org, count(*)::integer as n from app.referral_claims c
       where c.status = 'rejected' and c.resolved_at >= now() - interval '90 days'
       group by c.target_org_id)
    select o.id, o.name, coalesce(s.n, 0), coalesce(rc.n, 0)
      from public.organizations o
      left join s on s.org = o.id
      left join rc on rc.org = o.id
     where coalesce(s.n, 0) > 5 or coalesce(rc.n, 0) >= 2
     order by coalesce(s.n, 0) desc, coalesce(rc.n, 0) desc;
end $$;

revoke execute on function
  public.finalize_due_claims(), public.purge_presentation_data(), public.purge_orphan_claim_files(),
  public.forget_claim_files(text[]), public.rotate_fingerprint_key(),
  public.presentation_admin_metrics(integer), public.presentation_abuse_flags()
from public, anon, authenticated;
grant execute on function
  public.finalize_due_claims(), public.purge_presentation_data(), public.purge_orphan_claim_files(),
  public.forget_claim_files(text[]), public.rotate_fingerprint_key()
to service_role;
grant execute on function public.presentation_admin_metrics(integer), public.presentation_abuse_flags() to authenticated;
