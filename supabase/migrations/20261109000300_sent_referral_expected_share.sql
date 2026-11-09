-- "Referrals sent": also return the partner job's expected fee and the sourcing recruiter's share,
-- computed exactly like get_opportunities (default commission rule's sourcing_bps), and only when the
-- job owner chose to share the fee (share_fee). Return type changes, so the function is recreated.

drop function if exists public.get_sent_referral_jobs(uuid);
create function public.get_sent_referral_jobs(p_org uuid)
returns table (
  job_id uuid,
  status public.job_status,
  status_updated_at timestamptz,
  expected_fee_minor bigint,
  fee_currency char(3),
  your_share_minor bigint
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
      case when j.share_fee and v_sourcing_bps is not null then (j.expected_fee_minor * v_sourcing_bps) / 10000 end
    from public.jobs j
    where exists (select 1 from public.referrals r where r.job_id = j.id and r.source_org_id = p_org);
end $$;

revoke execute on function public.get_sent_referral_jobs(uuid) from public, anon;
grant execute on function public.get_sent_referral_jobs(uuid) to authenticated;
