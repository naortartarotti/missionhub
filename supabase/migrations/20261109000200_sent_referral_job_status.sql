-- Partner job status for the "Referrals sent" page.
--
-- jobs RLS only lets the owning org read a job, so a sourcing recruiter could not see whether the
-- partner's job they submitted to is still open, paused, filled or closed. This exposes ONLY the
-- status (and when it last changed) of jobs the caller's org has submitted at least one referral
-- to; no other job column is returned.

create function public.get_sent_referral_jobs(p_org uuid)
returns table (job_id uuid, status public.job_status, status_updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_member(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select j.id, j.status, j.updated_at
    from public.jobs j
    where exists (select 1 from public.referrals r where r.job_id = j.id and r.source_org_id = p_org);
end $$;

revoke execute on function public.get_sent_referral_jobs(uuid) from public, anon;
grant execute on function public.get_sent_referral_jobs(uuid) to authenticated;
