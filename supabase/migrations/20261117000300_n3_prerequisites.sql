-- N3 drop 1 prerequisites (docs/specs/referral-claims-two-sided-hire/backend.md v1).
--
-- BR-1 client-name gate: a job is partner-visible only with a real client name (a client key; N1 BR-23
--   placeholders give none). The owner-only hidden reason gains `no_client_name`, after N2's terms,
--   permanent and currency reasons. Opening a job to partners without a key is refused for every path
--   (`client_name_required_for_referrals`, trigger `jobs_referral_open_client_name` on the false -> true transition).
--   In-flight referrals are unaffected: delivery uses app.job_partner_open, which doesn't change.
-- BR-2 server-only delivery: record_candidate_request_delivery is no longer callable by members. It takes
--   the actor like issue_candidate_request_token and runs only for the service role (the app's email path).
--   The old 3-argument signature is dropped (no overload left behind).
-- Bodies: app.job_partner_visible / app.job_hidden_reason = 20261116001300 (N10, live); edits marked "-- N3".

create or replace function app.job_partner_visible(j public.jobs) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.job_partner_open(j) and app.org_partner_restriction(j.organization_id) is null
     and app.client_key(j.client_name) is not null;  -- N3 BR-1
$$;

create or replace function app.job_hidden_reason(j public.jobs) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when app.job_partner_visible(j) then null
    when app.org_partner_restriction(j.organization_id) in ('terminated', 'suspended') then 'org_suspended'
    when app.org_partner_restriction(j.organization_id) = 'network_hold' then 'network_hold'
    when app.org_partner_restriction(j.organization_id) = 'rules_not_accepted' then 'rules_not_accepted'
    when not j.accepts_external_referrals then 'not_open'
    when (app.current_job_terms(j.id)).id is null then 'no_terms'
    when j.contract_type <> 'permanent' then 'not_permanent'
    when (app.current_job_terms(j.id)).fee_basis <> 'flat'
         and (app.current_job_terms(j.id)).currency <> j.salary_currency then 'currency_mismatch'
    when app.client_key(j.client_name) is null then 'no_client_name'  -- N3 BR-1
    else 'not_active'
  end;
$$;

-- BR-1: opening to partners needs a client key, whoever opens it (save_job_terms, service role, connectors).
create function app.guard_job_open_client_name() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.accepts_external_referrals and (tg_op = 'INSERT' or not coalesce(old.accepts_external_referrals, false))
     and app.client_key(new.client_name) is null then
    raise exception 'client_name_required_for_referrals' using errcode = '22023';
  end if;
  return new;
end $$;
revoke execute on function app.guard_job_open_client_name() from public, anon, authenticated;
-- Named to fire after N2's jobs_referral_flag_guard (only save_job_terms opens a job), so that refusal keeps its code.
create trigger jobs_referral_open_client_name before insert or update of accepts_external_referrals on public.jobs
  for each row execute function app.guard_job_open_client_name();

-- BR-2. Body = 20261116001300 (live) with the actor passed in, as in issue_candidate_request_token.
drop function public.record_candidate_request_delivery(uuid, boolean, text);
create function public.record_candidate_request_delivery(p_referral uuid, p_actor uuid, p_ok boolean, p_error text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Defence in depth on top of the grants: a user session (JWT with a subject) is never accepted.
  if auth.uid() is not null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_referral is null or p_actor is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.referrals r
                   join public.organization_memberships m on m.organization_id = r.source_org_id
                   join public.organizations o on o.id = m.organization_id
                  where r.id = p_referral and m.user_id = p_actor and m.status = 'active'
                    and (o.suspended_at is null or app.org_settlement_state(o.id) = 'settlement'))
     or not app.user_sees_referral_as_source(p_actor, p_referral) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.referral_candidate_requests
     set sent_at = case when p_ok then now() else sent_at end,
         send_count = send_count + case when p_ok then 1 else 0 end,
         last_attempt_at = now(),
         last_send_error = case when p_ok then null else left(coalesce(p_error, 'failed'), 200) end
   where referral_id = p_referral;
end $$;
revoke execute on function public.record_candidate_request_delivery(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.record_candidate_request_delivery(uuid, uuid, boolean, text) to service_role;
