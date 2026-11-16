-- N2 last fix round (qa-report.md §9).
--
--   QA-N2-09  app.terms_estimate returns NULL (not 0) for a zero estimate (0–0 band, or min 0 with a blank
--             max). Both submit RPCs insert the estimate inside the no-raise block, where 0 violated
--             referrals.fee_estimate_minor > 0 and turned every submission into `failed`.
--   QA-N2-08  Client payment and refund evidence is bounded at 10^12 minor units (trigger, mapped
--             `invalid_fee`; record_payment_evidence itself, a record-scope shared function, is not redefined).
--             app.allocate_placement refuses |P| > 10^12 with `invalid_fee` on every path, and
--             app.allocate_minor computes in exact numeric so it can't overflow (identical results).
-- terms_estimate and allocate_placement are N2's own definitions (000600, 000500); allocate_minor is the
-- original from 20261107000500 rewritten in numeric with the same largest-remainder rule.

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
  -- QA-N2-09: a zero estimate (e.g. a 0–0 band) is no estimate; fee_estimate_minor must be > 0.
  if v is null or v <= 0 or v > 1000000000000 then return null; end if;
  return v::bigint;
exception when others then
  return null;
end $$;

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
  -- QA-N2-08: a net payment or refund above 10^12 minor units is refused on every path (I ≥ C included).
  if abs(p_amount::numeric) > 1000000000000 then raise exception 'invalid_fee' using errcode = '22023'; end if;
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

create or replace function app.allocate_minor(p_amount bigint, p_bps integer[]) returns bigint[]
language plpgsql immutable set search_path = '' as $$
declare
  v_sign integer := case when p_amount < 0 then -1 else 1 end;
  v_abs numeric := abs(p_amount::numeric);
  v_total integer := 0;
  v_base numeric[] := '{}';
  v_rem numeric[] := '{}';
  v_left numeric;
  v_idx integer;
  v_out bigint[] := '{}';
  i integer;
begin
  for i in 1 .. cardinality(p_bps) loop
    if p_bps[i] < 0 then raise exception 'negative share'; end if;
    v_total := v_total + p_bps[i];
  end loop;
  if v_total <> 10000 then raise exception 'shares must total 10000 bps, got %', v_total; end if;
  for i in 1 .. cardinality(p_bps) loop
    v_base := v_base || div(v_abs * p_bps[i], 10000);
    v_rem := v_rem || mod(v_abs * p_bps[i], 10000);
  end loop;
  v_left := v_abs;
  for i in 1 .. cardinality(p_bps) loop v_left := v_left - v_base[i]; end loop;
  while v_left > 0 loop
    v_idx := 1;
    for i in 2 .. cardinality(p_bps) loop
      if v_rem[i] > v_rem[v_idx] then v_idx := i; end if;
    end loop;
    v_base[v_idx] := v_base[v_idx] + 1;
    v_rem[v_idx] := -1;
    v_left := v_left - 1;
  end loop;
  -- Every part is ≤ |p_amount|, so the cast back to bigint can't overflow.
  for i in 1 .. cardinality(p_bps) loop v_out := v_out || (v_base[i] * v_sign)::bigint; end loop;
  return v_out;
end $$;

-- QA-N2-08: evidence amounts above 10^12 minor units are refused for every writer (mapped code).
do $$
begin
  if exists (select 1 from public.payment_evidence where amount_minor > 1000000000000) then
    raise exception 'payment_evidence holds an amount above 10^12 minor units; fix it before applying this migration';
  end if;
end $$;
create or replace function app.guard_payment_evidence_amount() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.amount_minor > 1000000000000 then raise exception 'invalid_fee' using errcode = '22023'; end if;
  return new;
end $$;
revoke execute on function app.guard_payment_evidence_amount() from public, anon, authenticated;
create trigger payment_evidence_amount_bound before insert on public.payment_evidence
  for each row execute function app.guard_payment_evidence_amount();
