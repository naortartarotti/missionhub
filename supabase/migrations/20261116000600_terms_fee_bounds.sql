-- N2 QA-N2-07 (qa-report.md §8): flat and minimum fees are bounded, and no single job can break a partner's
-- opportunities list.
--
--   * save_job_terms and admin_amend_referral_terms refuse a flat or minimum fee above 10^12 minor units
--     (`terms_incomplete`), the same bound as the base and I at hire (QA-N2-02). Check constraints on
--     job_terms_versions enforce it for every writer.
--   * app.terms_estimate fails closed: an estimate that isn't a finite amount in [0, 10^12] (e.g. from an
--     absurd salary band, which jobs don't bound) is NULL instead of an error. The estimated share uses
--     app.estimate_share_safe, NULL on any error, so get_opportunities never fails as a whole because of one row.
--   * report_hire compares the I bounds in numeric (`v_i > v_c * 100` could overflow).
-- Bodies are N2's own definitions (migrations 000200, 000400, 000500); edits are mapped above.

-- Existing rows must comply before the constraints are added (pre-launch: none exceed it).
do $$
begin
  if exists (select 1 from public.job_terms_versions where flat_fee_minor > 1000000000000 or min_fee_minor > 1000000000000) then
    raise exception 'job_terms_versions holds a fee above 10^12 minor units; fix it before applying this migration';
  end if;
end $$;
alter table public.job_terms_versions
  add constraint job_terms_flat_fee_bound check (flat_fee_minor <= 1000000000000),
  add constraint job_terms_min_fee_bound check (min_fee_minor <= 1000000000000);

create or replace function app.terms_estimate(
  p_fee_basis public.fee_basis, p_rate_bps integer, p_flat_fee_minor bigint, p_min_fee_minor bigint,
  p_share_salary boolean, p_salary_min bigint, p_salary_max bigint
) returns bigint
language plpgsql immutable set search_path = '' as $$
declare
  v numeric;
begin
  if p_fee_basis is null then return null; end if;
  if p_fee_basis = 'flat' then
    v := p_flat_fee_minor;
  elsif not coalesce(p_share_salary, false) or (p_salary_min is null and p_salary_max is null) then
    return null;
  else
    v := greatest(round((coalesce(p_salary_min, p_salary_max)::numeric + coalesce(p_salary_max, p_salary_min)) * p_rate_bps / 20000),
                  coalesce(p_min_fee_minor, 0));
  end if;
  -- Fail closed (QA-N2-07): never an error, never an amount nobody could invoice.
  if v is null or v < 0 or v > 1000000000000 then return null; end if;
  return v::bigint;
exception when others then
  return null;
end $$;

create or replace function app.estimate_share_safe(p_estimate bigint, p_sourcing integer, p_job_owner integer, p_platform integer)
returns bigint
language plpgsql immutable set search_path = '' as $$
begin
  return (app.allocate_minor(p_estimate, array[p_sourcing, p_job_owner, p_platform]))[1];
exception when others then
  return null;
end $$;
revoke execute on function app.terms_estimate(public.fee_basis, integer, bigint, bigint, boolean, bigint, bigint),
  app.estimate_share_safe(bigint, integer, integer, integer) from public, anon, authenticated;

create or replace function public.save_job_terms(
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
  if (p_fee_basis = 'flat' and (p_flat_fee_minor is null or p_flat_fee_minor <= 0 or p_flat_fee_minor > 1000000000000 or p_rate_bps is not null
                                or p_min_fee_minor is not null or v_currency not in ('CAD', 'USD', 'EUR', 'GBP', 'BRL')))
     or (p_fee_basis <> 'flat' and (p_rate_bps is null or p_rate_bps not between 100 and 5000 or p_flat_fee_minor is not null
                                    or (p_min_fee_minor is not null and (p_min_fee_minor <= 0 or p_min_fee_minor > 1000000000000))))
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

create or replace function public.admin_amend_referral_terms(
  p_referral uuid,
  p_reason text,
  p_hiring_request_reference text,
  p_sourcing_request_reference text,
  p_both_requested boolean,
  p_fee_basis public.fee_basis,
  p_search_type public.search_type,
  p_guarantee_days integer,
  p_payment_terms_days integer,
  p_ownership_months integer,
  p_rate_bps integer default null,
  p_flat_fee_minor bigint default null,
  p_min_fee_minor bigint default null,
  p_flat_currency char(3) default null,
  p_guarantee_remedy public.guarantee_remedy default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  base public.job_terms_versions;
  snap public.job_terms_versions;
  v_currency char(3);
  v_id uuid;
  v_no integer;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_hiring text := btrim(coalesce(p_hiring_request_reference, ''));
  v_sourcing text := btrim(coalesce(p_sourcing_request_reference, ''));
  v_body text;
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform app.enforce_rate_limit('admin.amend', 30, 3600);
  select * into r from public.referrals where id = p_referral for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.terms_version_id is null then raise exception 'amendment_legacy_referral' using errcode = 'P0001'; end if;
  -- RD-035: before a hire is reported, in any referral status.
  if exists (select 1 from public.placements p where p.referral_id = r.id) then
    raise exception 'amendment_after_hire' using errcode = 'P0001';
  end if;
  if not coalesce(p_both_requested, false) or char_length(v_reason) not between 10 and 1000
     or char_length(v_hiring) not between 3 and 200 or char_length(v_sourcing) not between 3 and 200 then
    raise exception 'amendment_reason_required' using errcode = '22023';
  end if;

  select * into snap from public.job_terms_versions where id = r.terms_version_id;
  select * into base from public.job_terms_versions where id = app.effective_terms_version(r.id);
  -- T4: % bases keep the referral's fee currency (or the job's salary currency when switching from flat).
  v_currency := case when p_fee_basis = 'flat' then upper(btrim(coalesce(p_flat_currency, '')))
                     when base.fee_basis <> 'flat' then base.currency
                     else (select j.salary_currency from public.jobs j where j.id = r.job_id) end;
  if (p_fee_basis = 'flat' and (p_flat_fee_minor is null or p_flat_fee_minor <= 0 or p_flat_fee_minor > 1000000000000 or p_rate_bps is not null
                                or p_min_fee_minor is not null or v_currency not in ('CAD', 'USD', 'EUR', 'GBP', 'BRL')))
     or (p_fee_basis <> 'flat' and (p_rate_bps is null or p_rate_bps not between 100 and 5000 or p_flat_fee_minor is not null
                                    or (p_min_fee_minor is not null and (p_min_fee_minor <= 0 or p_min_fee_minor > 1000000000000))))
     or p_fee_basis is null or p_search_type is null
     or p_guarantee_days is null or p_guarantee_days not in (0, 30, 60, 90, 120, 180)
     or ((p_guarantee_days = 0) <> (p_guarantee_remedy is null))
     or p_payment_terms_days is null or p_payment_terms_days not between 0 and 90
     or p_ownership_months is null or p_ownership_months not between 6 and 12 then
    raise exception 'terms_incomplete' using errcode = '22023';
  end if;
  if (base.fee_basis, base.rate_bps, base.flat_fee_minor, base.min_fee_minor, base.currency, base.search_type,
      base.guarantee_days, base.guarantee_remedy, base.payment_terms_days, base.ownership_months)
     is not distinct from
     (p_fee_basis, p_rate_bps, p_flat_fee_minor, p_min_fee_minor, v_currency, p_search_type,
      p_guarantee_days::smallint, p_guarantee_remedy, p_payment_terms_days::smallint, p_ownership_months::smallint) then
    raise exception 'amendment_no_change' using errcode = 'P0001';
  end if;
  -- BR-35: the window is anchored at delivery.
  if r.delivered_at is not null and p_ownership_months <> base.ownership_months then
    raise exception 'amendment_window_after_delivery' using errcode = 'P0001';
  end if;

  select coalesce(max(x.version_no), 0) + 1 into v_no from public.job_terms_versions x
   where x.referral_id = r.id and x.kind = 'amendment';
  insert into public.job_terms_versions (job_id, organization_id, kind, version_no, referral_id, amends_version_id,
    fee_basis, rate_bps, flat_fee_minor, min_fee_minor, currency, search_type, direct_client_attested_by,
    direct_client_attested_at, guarantee_days, guarantee_remedy, payment_terms_days, ownership_months, created_by)
  values (snap.job_id, snap.organization_id, 'amendment', v_no, r.id, base.id,
    p_fee_basis, p_rate_bps, p_flat_fee_minor, p_min_fee_minor, v_currency, p_search_type,
    snap.direct_client_attested_by, snap.direct_client_attested_at,  -- T6 carried over (spec 2.8)
    p_guarantee_days, p_guarantee_remedy, p_payment_terms_days, p_ownership_months, auth.uid())
  returning id into v_id;
  insert into app.terms_amendment_notes (version_id, reason, hiring_request_reference, sourcing_request_reference)
  values (v_id, v_reason, v_hiring, v_sourcing);

  -- PD-051 Q8: an existing agreement now points at the amendment (the only allowed agreement change).
  update public.collaboration_agreements set terms_version_id = v_id where referral_id = r.id;

  v_body := 'A platform admin recorded a terms amendment on the referral for ' || r.job_title_snapshot
         || ', at both organizations'' written request. Review the new terms on the referral.';
  perform app.notify_org(r.source_org_id, 'referral.terms_amended', 'Referral terms amended', v_body, '/referrals/' || r.id);
  if not app.hidden_from_target(r.status) then
    perform app.notify_org(r.target_org_id, 'referral.terms_amended', 'Referral terms amended', v_body, '/referrals/' || r.id);
  end if;
  perform app.audit(null, 'referral.terms_amended', 'referral', r.id, jsonb_build_object('version_id', v_id));
  perform app.audit(r.source_org_id, 'referral.terms_amended', 'referral', r.id, jsonb_build_object('version_id', v_id));
  perform app.audit(r.target_org_id, 'referral.terms_amended', 'referral', r.id, jsonb_build_object('version_id', v_id));
  return v_id;
end $$;

create or replace function public.report_hire(
  p_referral uuid,
  p_expected_version integer,
  p_start_date date,
  -- N2 review (copy-review P16): the effective terms version the dialog showed; required for snapshot referrals
  p_terms_version uuid default null,
  -- snapshot referrals
  p_base_minor bigint default null,
  p_bonus_minor bigint default null,
  p_invoiced_fee_minor bigint default null,
  p_difference_reason text default null,
  p_difference_note text default null,
  -- referrals without a snapshot (sent before N2) only
  p_legacy_fee_minor bigint default null,
  p_legacy_currency char(3) default null,
  p_legacy_guarantee_days integer default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  a public.collaboration_agreements;
  v public.job_terms_versions;
  v_id uuid;
  v_c bigint;
  v_i bigint;
  v_cur char(3);
  v_until date;
  v_note text := nullif(btrim(coalesce(p_difference_note, '')), '');
  v_reason text := nullif(btrim(coalesce(p_difference_reason, '')), '');
  v_org text;
  v_label text;
begin
  select * into r from public.referrals where id = p_referral for update;
  if not found or not app.sees_referral_as_target(r.id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.version <> p_expected_version then raise exception 'stale_version' using errcode = 'P0001'; end if;
  if r.status <> 'offer' then raise exception 'invalid_transition: % -> hired', r.status using errcode = 'P0001'; end if;
  select * into a from public.collaboration_agreements where referral_id = r.id and status = 'active';
  if not found then raise exception 'agreement_required' using errcode = 'P0001'; end if;
  if p_start_date is null then raise exception 'invalid_fee' using errcode = '22023'; end if;

  if r.terms_version_id is not null then
    -- N2 review, P16: an amendment recorded while the dialog was open changes C (or the basis). Refuse instead of
    -- recording a fee the user never saw.
    if p_terms_version is null or p_terms_version is distinct from app.effective_terms_version(r.id) then
      raise exception 'hire_terms_changed' using errcode = 'P0001';
    end if;
    -- BR-25: currency and guarantee come from the terms; any attempt to pass them is refused.
    if p_legacy_fee_minor is not null or p_legacy_currency is not null or p_legacy_guarantee_days is not null then
      raise exception 'hire_terms_fixed' using errcode = '22023';
    end if;
    select * into v from public.job_terms_versions where id = app.effective_terms_version(r.id);
    -- BR-22 (PD-051 Q9): % of base → base only; total cash → base + target bonus; flat → nothing.
    if (v.fee_basis = 'pct_base' and (p_base_minor is null or p_base_minor <= 0 or p_bonus_minor is not null))
       or (v.fee_basis = 'pct_total_cash' and (p_base_minor is null or p_base_minor <= 0 or p_bonus_minor is null or p_bonus_minor < 0))
       or (v.fee_basis = 'flat' and (p_base_minor is not null or p_bonus_minor is not null))
       -- N2 review, QA-N2-02: amounts a real offer can't have (keeps C and every allocation inside bigint)
       or p_base_minor > 1000000000000 or p_bonus_minor > 1000000000000 then
      raise exception 'hire_base_invalid' using errcode = '22023';
    end if;
    v_c := app.compute_fee(v.fee_basis, v.rate_bps, v.flat_fee_minor, v.min_fee_minor, p_base_minor, p_bonus_minor);
    v_i := coalesce(p_invoiced_fee_minor, v_c);
    if v_i is null or v_i <= 0 then raise exception 'invalid_fee' using errcode = '22023'; end if;
    -- N2 review, QA-N2-02: I within [ceil(C / 100), 100 × C] and ≤ 10^12 minor units, so k = P / I stays bounded.
    -- QA-N2-07: compared in numeric, so no bound can overflow whatever C is.
    if v_c::numeric > 1000000000000 or v_i::numeric < ceil(v_c::numeric / 100) or v_i::numeric > v_c::numeric * 100
       or v_i > 1000000000000 then
      raise exception 'hire_base_invalid' using errcode = '22023';
    end if;
    if v_i <> v_c then
      -- BR-23: a different invoiced fee needs a reason; `other` needs the note.
      if v_reason is null
         or v_reason not in ('client_discount', 'client_contract_rate', 'client_invoiced_other_currency', 'invoice_correction', 'other')
         or (v_reason = 'other' and v_note is null) then
        raise exception 'fee_difference_reason_required' using errcode = '22023';
      end if;
      if v_note is not null and char_length(v_note) > 500 then raise exception 'fee_difference_note_too_long' using errcode = '22023'; end if;
    elsif v_reason is not null or v_note is not null then
      raise exception 'fee_difference_not_allowed' using errcode = '22023';  -- a reason is refused when I = C
    end if;
    v_cur := v.currency;
    v_until := case when v.guarantee_days = 0 then null else p_start_date + v.guarantee_days end;
  else
    -- BR-26: legacy free entry, enforced by the absence of a snapshot.
    if p_terms_version is not null or p_base_minor is not null or p_bonus_minor is not null or p_invoiced_fee_minor is not null
       or v_reason is not null or v_note is not null then
      raise exception 'terms_not_recorded' using errcode = '22023';
    end if;
    if p_legacy_fee_minor is null or p_legacy_fee_minor <= 0 or p_legacy_fee_minor > 1000000000000
       or coalesce(p_legacy_currency, '') !~ '^[A-Z]{3}$'
       or coalesce(p_legacy_guarantee_days, 90) not between 0 and 365 then
      raise exception 'invalid_fee' using errcode = '22023';
    end if;
    v_i := p_legacy_fee_minor;
    v_cur := p_legacy_currency;
    v_until := p_start_date + coalesce(p_legacy_guarantee_days, 90);
  end if;

  update public.referrals set status = 'hired', version = version + 1 where id = r.id;
  insert into public.referral_status_events (referral_id, from_status, to_status, actor_id, actor_side, reason)
  values (r.id, 'offer', 'hired', auth.uid(), 'target', 'Hire reported');

  insert into public.placements (referral_id, agreement_id, source_org_id, target_org_id, currency,
    contracted_fee_minor, start_date, guarantee_until, reported_by,
    terms_version_id, computed_fee_minor, reported_base_minor, reported_bonus_minor, fee_difference_reason, fee_difference_note)
  values (r.id, a.id, r.source_org_id, r.target_org_id, v_cur, v_i, p_start_date, v_until, auth.uid(),
    v.id, v_c, p_base_minor, p_bonus_minor, case when v_c is not null and v_i <> v_c then v_reason end,
    case when v_c is not null and v_i <> v_c then v_note end)
  returning id into v_id;
  insert into public.placement_status_events (placement_id, from_status, to_status, actor_id, reason)
  values (v_id, null, 'hire_reported', auth.uid(), 'Hire reported by job owner');

  perform app.notify_org(r.source_org_id, 'placement.hired', 'Your candidate was hired',
    r.job_title_snapshot || ' — commission is projected until the client payment is verified.', '/commissions/' || v_id);
  if v_c is not null and v_i <> v_c then
    -- BR-24 (spec §5.10): the submitter (record-scope fallback in app.notify_org), both numbers, the reason.
    select o.name into v_org from public.organizations o where o.id = r.target_org_id;
    v_label := case v_reason
      when 'client_discount' then 'Client negotiated a lower fee'
      when 'client_contract_rate' then 'Client contract sets a different fee'
      when 'client_invoiced_other_currency' then 'Client invoiced in another currency'
      when 'invoice_correction' then 'Invoice correction or rounding'
      else 'Other' end;
    perform app.notify_org(r.source_org_id, 'placement.fee_difference', 'Invoiced fee differs from the computed fee',
      coalesce(v_org, 'The hiring recruiter') || ' reported a hire for ' || r.job_title_snapshot || ' with an invoiced fee of '
        || app.money_code(v_i, v_cur) || ' instead of the computed ' || app.money_code(v_c, v_cur) || '. Reason: ' || v_label || '.',
      '/commissions/' || v_id, r.source_user_id);
  end if;
  -- Base and bonus are compensation data: never in audit metadata (BR-24).
  perform app.audit(r.target_org_id, 'placement.created', 'placement', v_id,
    jsonb_strip_nulls(jsonb_build_object('fee_minor', v_i, 'currency', v_cur, 'computed_fee_minor', v_c, 'terms_version_id', v.id)));
  return v_id;
end $$;

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
         then app.estimate_share_safe(est.fee, v_rule.sourcing_bps, v_rule.job_owner_bps, v_rule.platform_bps) end,  -- N2 QA-N2-07
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
