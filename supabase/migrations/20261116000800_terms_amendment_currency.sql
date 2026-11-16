-- N2 follow-up F-1 (acceptance.md §3.3, PD-062): flat → % amendment currency.
--
--   admin_amend_referral_terms  refuses a flat → % amendment when the job has no usable salary currency
--                               (`terms_incomplete`, never a raw NOT NULL error). The % currency rule is
--                               unchanged: % → % keeps the effective currency; flat → % takes the job's
--                               current salary currency.
--   admin_get_referral_terms    returns `job_salary_currency` and `pct_amendment_currency` (the currency a %
--                               amendment uses), so the admin form labels and parses amounts in it.
-- Bodies are N2's own definitions (20261116000600, 20261116000400); edits are marked "-- F-1".

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
  -- F-1 (PD-062): flat → % takes the job's current salary currency; without one the switch is refused
  -- with a mapped code instead of a raw NOT NULL error.
  if p_fee_basis is not null and p_fee_basis <> 'flat' and base.fee_basis = 'flat'
     and (v_currency is null or v_currency !~ '^[A-Z]{3}$') then
    raise exception 'terms_incomplete' using errcode = '22023';
  end if;
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

create or replace function public.admin_get_referral_terms(p_referral uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.referrals;
  j public.jobs;
  v_terms jsonb;
  v_eff public.job_terms_versions;  -- F-1
begin
  if not app.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into r from public.referrals where id = p_referral;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into j from public.jobs where id = r.job_id;
  select * into v_eff from public.job_terms_versions where id = app.effective_terms_version(r.id);  -- F-1
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', v.id, 'kind', v.kind, 'version_no', v.version_no, 'created_at', v.created_at,
           'created_by_name', pr.full_name, 'fee_basis', v.fee_basis, 'rate_bps', v.rate_bps,
           'flat_fee_minor', v.flat_fee_minor, 'min_fee_minor', v.min_fee_minor, 'currency', v.currency,
           'search_type', v.search_type, 'guarantee_days', v.guarantee_days, 'guarantee_remedy', v.guarantee_remedy,
           'payment_terms_days', v.payment_terms_days, 'ownership_months', v.ownership_months,
           'direct_client_attested_at', v.direct_client_attested_at,
           'reason', n.reason, 'hiring_request_reference', n.hiring_request_reference,
           'sourcing_request_reference', n.sourcing_request_reference)
         order by (v.kind = 'amendment'), v.version_no), '[]'::jsonb)
    into v_terms
    from public.job_terms_versions v
    left join public.profiles pr on pr.id = v.created_by
    left join app.terms_amendment_notes n on n.version_id = v.id
   where v.id = r.terms_version_id or (v.referral_id = r.id and v.kind = 'amendment');
  return jsonb_build_object(
    'referral_id', r.id,
    'job_title', r.job_title_snapshot,
    'candidate_label', r.candidate_label,
    'hiring_org_id', r.target_org_id,
    'hiring_org_name', (select o.name from public.organizations o where o.id = r.target_org_id),
    'sourcing_org_id', r.source_org_id,
    'sourcing_org_name', (select o.name from public.organizations o where o.id = r.source_org_id),
    'status', r.status,
    'delivered_at', r.delivered_at,
    'client_label', case when j.client_confidential or j.client_name is null then 'Confidential client' else j.client_name end,
    'recorded', r.terms_version_id is not null,
    'effective_terms_version_id', app.effective_terms_version(r.id),
    -- F-1 (PD-062): the currency a % amendment uses (and the form must parse in): the effective terms'
    -- currency when they are already %, else the job's current salary currency (null = switch refused).
    'job_salary_currency', j.salary_currency,
    'pct_amendment_currency', case when v_eff.id is null then null
                                   when v_eff.fee_basis <> 'flat' then v_eff.currency
                                   else j.salary_currency end,
    'placement', (select jsonb_build_object('id', p.id, 'created_at', p.created_at) from public.placements p where p.referral_id = r.id),
    'rule', (select jsonb_build_object('name', c.name, 'version', c.version, 'sourcing_bps', c.sourcing_bps,
                                       'job_owner_bps', c.job_owner_bps, 'platform_bps', c.platform_bps, 'platform_basis', c.platform_basis)
               from public.commission_rules c where c.id = coalesce(r.commission_rule_id,
                 (select ag.rule_id from public.collaboration_agreements ag where ag.referral_id = r.id))),
    'history', v_terms);
end $$;
