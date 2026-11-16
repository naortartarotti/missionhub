-- N2 review fixes (qa-report.md, copy-review.md; brief rev. 2).
--
--   P16       report_hire takes the effective terms version the dialog showed (p_terms_version). For a
--             snapshot referral a missing or stale version → `hire_terms_changed`, so an amendment recorded
--             while the dialog was open can't produce a fee the user never saw. Old signature dropped.
--   QA-N2-02  report_hire bounds the base (≤ 10^12 minor) and I (ceil(C/100) ≤ I ≤ 100 × C, ≤ 10^12) →
--             `hire_base_invalid`; app.allocate_placement raises `invalid_fee` instead of a raw
--             "bigint out of range" for anything that still wouldn't fit.
-- report_hire is copied from 20261116000400 (N2's own definition); changes are marked "-- N2 review".

drop function public.report_hire(uuid, integer, date, bigint, bigint, bigint, text, text, bigint, char, integer);
create function public.report_hire(
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
    if v_i < (v_c + 99) / 100 or v_i > v_c * 100 or v_i > 1000000000000 then
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
revoke execute on function public.report_hire(uuid, integer, date, uuid, bigint, bigint, bigint, text, text, bigint, char, integer) from public, anon;
grant execute on function public.report_hire(uuid, integer, date, uuid, bigint, bigint, bigint, text, text, bigint, char, integer) to authenticated;

-- QA-N2-02: same allocation as 20261116000400; results that don't fit bigint raise a mapped code.
create or replace function app.allocate_placement(
  p_amount bigint, p_sourcing_bps integer, p_job_owner_bps integer, p_platform_bps integer,
  p_basis public.platform_basis, p_computed bigint, p_invoiced bigint
) returns bigint[]
language plpgsql immutable set search_path = '' as $$
declare
  v_sign integer := case when p_amount < 0 then -1 else 1 end;
  v_abs numeric := abs(p_amount);
  v_s numeric;
  v_p numeric;
begin
  if p_computed is null or p_invoiced is null or p_invoiced >= p_computed then
    return app.allocate_minor(p_amount, array[p_sourcing_bps, p_job_owner_bps, p_platform_bps]);
  end if;
  if p_invoiced <= 0 then raise exception 'invalid_fee' using errcode = '22023'; end if;
  v_s := sign(v_abs) * div(2 * v_abs * p_sourcing_bps * p_computed + p_invoiced::numeric * 10000, 2 * p_invoiced::numeric * 10000);
  v_p := case when p_basis = 'frozen'
              then div(2 * v_abs * p_platform_bps * p_computed + p_invoiced::numeric * 10000, 2 * p_invoiced::numeric * 10000)
              else div(2 * v_abs * p_platform_bps + 10000, 20000) end;
  if v_s > 9223372036854775807 or v_p > 9223372036854775807 or (v_abs - v_s - v_p) < -9223372036854775807 then
    raise exception 'invalid_fee' using errcode = '22023';
  end if;
  return array[(v_sign * v_s)::bigint, (v_sign * (v_abs - v_s - v_p))::bigint, (v_sign * v_p)::bigint];
end $$;
revoke execute on function app.allocate_placement(bigint, integer, integer, integer, public.platform_basis, bigint, bigint) from public, anon, authenticated;
