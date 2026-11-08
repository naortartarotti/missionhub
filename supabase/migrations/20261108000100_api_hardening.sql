-- API surface hardening (defense in depth).
--
-- The browser never talks to PostgREST directly, but PostgREST is publicly reachable with the
-- publishable key, and a signed-in user's JWT lives in their cookies. So every grant below is part
-- of the public API and must be the minimum that RLS and the RPCs need.

-- ---------------------------------------------------------------------------
-- 1. Internal helpers in schema `app` are not an API.
--    Postgres grants EXECUTE to PUBLIC by default. Revoke it, then re-grant only the helpers
--    that RLS policies evaluate as the calling role. Trigger functions and helpers called from
--    SECURITY DEFINER functions run as the owner and need no grant.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema app from public, anon, authenticated;

grant execute on function
  app.is_member(uuid),
  app.has_role(uuid, public.membership_role[]),
  app.is_platform_admin(),
  app.shares_org_with(uuid),
  app.is_partner_org(uuid),
  app.can_see_referral(uuid),
  app.can_see_placement(uuid),
  app.referral_side(uuid),
  app.normalize_tags(text[])  -- called by the invoker triggers candidates_normalize / jobs_normalize
to authenticated;

revoke usage on schema app from anon;

-- ---------------------------------------------------------------------------
-- 2. Tables: anon has no policies anywhere, so it gets no privileges at all.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

-- ---------------------------------------------------------------------------
-- 3. authenticated: drop privileges that no RLS policy (or only an RPC) uses.
--    RLS already denies these; removing the grant makes the denial structural.
-- ---------------------------------------------------------------------------
revoke all on public.background_jobs from authenticated;          -- worker only (service_role)
revoke all on public.matches from authenticated;                  -- read through get_opportunities / get_job_match_summary
revoke insert, update, delete on public.audit_events from authenticated; -- written by app.audit()
revoke insert, update, delete on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;  -- mark as read
revoke insert, delete on public.organization_invitations from authenticated; -- create_invitation()
revoke insert, delete on public.organization_memberships from authenticated; -- create_organization() / accept_invitation()
revoke insert, delete on public.organizations from authenticated;            -- create_organization()
revoke insert, delete on public.profiles from authenticated;                 -- handle_new_user()
revoke update, delete on public.referral_messages from authenticated;        -- append-only thread
revoke delete on public.candidate_consents from authenticated;               -- revocation is an update, never a delete
revoke update, delete on public.audit_events from authenticated;

-- ---------------------------------------------------------------------------
-- 4. Objects created by later migrations must not be born open.
-- ---------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema app revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Per-user rate limiting for server actions (fixed window, stored in Postgres so it holds
--    across server instances). The key is always derived from auth.uid() here, never from the
--    caller, so a user can only ever consume their own quota.
-- ---------------------------------------------------------------------------
create table app.rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null check (bucket ~ '^[a-z0-9_.:-]{1,64}$'),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (user_id, bucket, window_start)
);
alter table app.rate_limits enable row level security; -- no policies: only reachable via the function below

create or replace function public.consume_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_window timestamptz;
  v_hits integer;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if p_limit < 1 or p_limit > 10000 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid_rate_limit' using errcode = '22023';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into app.rate_limits as r (user_id, bucket, window_start, hits)
  values (v_uid, p_bucket, v_window, 1)
  on conflict (user_id, bucket, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  -- Opportunistic cleanup of this user's expired windows keeps the table small.
  delete from app.rate_limits where user_id = v_uid and window_start < now() - interval '1 day';
  return v_hits <= p_limit;
end $$;

revoke execute on function public.consume_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.consume_rate_limit(text, integer, integer) to authenticated;
