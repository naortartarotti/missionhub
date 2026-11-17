-- Agencies and connectors.
--
-- 1. Imports carry their origin: candidates and jobs can arrive from the public API or a connector.
-- 2. Portfolio transfer: an org admin hands a departing recruiter's candidates and jobs to a teammate.
-- 3. API keys: per-organization keys for the public REST API (/api/v1). Only a SHA-256 hash is stored.
-- 4. Connectors: an organization connects an external system (ATS job board, spreadsheet, …).
--    Secrets live in Supabase Vault, never in a table. Syncs run on the background queue.
-- 5. External references: map an external id to the Workatent record so a sync never duplicates.

-- ---------------------------------------------------------------------------
-- 1. Origin of imported records
-- ---------------------------------------------------------------------------
alter table public.candidates drop constraint candidates_source_check;
alter table public.candidates add constraint candidates_source_check
  check (source in ('manual', 'csv_import', 'resume_upload', 'referral', 'other', 'api', 'integration'));

alter table public.jobs add column source text not null default 'manual'
  check (source in ('manual', 'import', 'csv_import', 'api', 'integration'));

create index candidates_org_linkedin_idx on public.candidates (organization_id, lower(linkedin_url)) where linkedin_url is not null;
create index if not exists candidates_org_email_idx on public.candidates (organization_id, lower(email)) where email is not null;

-- ---------------------------------------------------------------------------
-- 2. Portfolio transfer
-- ---------------------------------------------------------------------------
create or replace function public.transfer_member_portfolio(p_org uuid, p_from uuid, p_to uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_candidates integer;
  v_jobs integer;
  v_connections integer;
begin
  if not app.has_role(p_org, array['org_admin']::public.membership_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from = p_to then
    raise exception 'invalid_transfer' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organization_memberships where organization_id = p_org and user_id = p_from) then
    raise exception 'owner_not_member' using errcode = '42501';
  end if;
  -- The new owner must be active; the owner guard trigger re-checks it on every row.
  if not exists (select 1 from public.organization_memberships where organization_id = p_org and user_id = p_to and status = 'active') then
    raise exception 'owner_not_member' using errcode = '42501';
  end if;

  update public.candidates set owner_id = p_to where organization_id = p_org and owner_id = p_from and status <> 'deleted';
  get diagnostics v_candidates = row_count;
  update public.jobs set owner_id = p_to where organization_id = p_org and owner_id = p_from;
  get diagnostics v_jobs = row_count;
  update public.connections set owner_id = p_to where organization_id = p_org and owner_id = p_from;
  get diagnostics v_connections = row_count;

  perform app.audit(p_org, 'membership.portfolio_transferred', 'user', p_from,
    jsonb_build_object('to_user', p_to, 'candidates', v_candidates, 'jobs', v_jobs, 'connections', v_connections));
  return jsonb_build_object('candidates', v_candidates, 'jobs', v_jobs, 'connections', v_connections);
end $$;

-- ---------------------------------------------------------------------------
-- 3. API keys
-- ---------------------------------------------------------------------------
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  prefix text not null check (char_length(prefix) between 8 and 20), -- shown in the UI to tell keys apart
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  -- Fixed-window rate limit, maintained by api_key_authenticate().
  window_started_at timestamptz not null default now(),
  window_count integer not null default 0
);
create index api_keys_org_idx on public.api_keys (organization_id, created_at desc);
alter table public.api_keys enable row level security;

create policy api_keys_select on public.api_keys for select to authenticated
  using (app.has_role(organization_id, array['org_admin', 'recruiter_manager']::public.membership_role[]));
create policy api_keys_insert on public.api_keys for insert to authenticated
  with check (app.has_role(organization_id, array['org_admin', 'recruiter_manager']::public.membership_role[]) and created_by = auth.uid());
create policy api_keys_update on public.api_keys for update to authenticated
  using (app.has_role(organization_id, array['org_admin', 'recruiter_manager']::public.membership_role[]))
  with check (app.has_role(organization_id, array['org_admin', 'recruiter_manager']::public.membership_role[]));
revoke all on public.api_keys from anon, authenticated;
grant select (id, organization_id, name, prefix, created_by, created_at, last_used_at, revoked_at) on public.api_keys to authenticated;
grant insert (organization_id, name, prefix, key_hash, created_by) on public.api_keys to authenticated;
grant update (revoked_at) on public.api_keys to authenticated;

-- Resolves a key for the public API (service role only): checks it is live, that its creator is
-- still an active member, and consumes one request from a 120-requests-per-minute window.
create or replace function public.api_key_authenticate(p_hash text)
returns table (key_id uuid, organization_id uuid, created_by uuid, allowed boolean)
language plpgsql security definer set search_path = '' as $$
declare
  k public.api_keys;
begin
  select * into k from public.api_keys a
   where a.key_hash = p_hash and a.revoked_at is null
   for update;
  if not found then return; end if;
  if not exists (
    select 1 from public.organization_memberships m join public.organizations o on o.id = m.organization_id
    where m.organization_id = k.organization_id and m.user_id = k.created_by and m.status = 'active' and o.suspended_at is null
  ) then
    return;
  end if;
  if k.window_started_at < now() - interval '1 minute' then
    update public.api_keys set window_started_at = now(), window_count = 1, last_used_at = now() where id = k.id;
    return query select k.id, k.organization_id, k.created_by, true;
  elsif k.window_count >= 120 then
    return query select k.id, k.organization_id, k.created_by, false;
  else
    update public.api_keys set window_count = window_count + 1, last_used_at = now() where id = k.id;
    return query select k.id, k.organization_id, k.created_by, true;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Connectors
-- ---------------------------------------------------------------------------
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null check (provider ~ '^[a-z0-9_-]{2,40}$'),
  name text not null check (char_length(name) between 1 and 120),
  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  config jsonb not null default '{}', -- non-secret settings only (board name, sheet link, what to import)
  secret_id uuid,                     -- vault.secrets id; read only by the sync worker
  owner_id uuid not null references auth.users (id), -- imported records belong to this member
  sync_interval_minutes integer not null default 60 check (sync_interval_minutes between 15 and 10080),
  next_sync_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_error text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index connections_org_idx on public.connections (organization_id, created_at desc);
create index connections_due_idx on public.connections (next_sync_at) where status = 'active';
create trigger connections_updated_at before update on public.connections
  for each row execute function app.set_updated_at();
create trigger connections_owner_guard before insert or update of owner_id, organization_id on public.connections
  for each row execute function app.guard_owner_membership();
alter table public.connections enable row level security;

create policy connections_select on public.connections for select to authenticated
  using (app.is_member(organization_id));
create policy connections_insert on public.connections for insert to authenticated
  with check (app.has_role(organization_id, array['org_admin', 'recruiter_manager']::public.membership_role[]) and created_by = auth.uid());
create policy connections_update on public.connections for update to authenticated
  using (app.has_role(organization_id, array['org_admin', 'recruiter_manager']::public.membership_role[]))
  with check (app.has_role(organization_id, array['org_admin', 'recruiter_manager']::public.membership_role[]));
create policy connections_delete on public.connections for delete to authenticated
  using (app.has_role(organization_id, array['org_admin', 'recruiter_manager']::public.membership_role[]));
revoke all on public.connections from anon, authenticated;
grant select (id, organization_id, provider, name, status, config, owner_id, sync_interval_minutes, next_sync_at,
              last_sync_at, last_error, created_by, created_at, updated_at) on public.connections to authenticated;
grant insert (organization_id, provider, name, config, owner_id, sync_interval_minutes, created_by) on public.connections to authenticated;
grant update (name, status, config, owner_id, sync_interval_minutes, next_sync_at) on public.connections to authenticated;
grant delete on public.connections to authenticated;

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  trigger text not null check (trigger in ('manual', 'schedule', 'upload')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  created_count integer not null default 0,
  updated_count integer not null default 0,
  unchanged_count integer not null default 0,
  closed_count integer not null default 0,
  failed_count integer not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index sync_runs_connection_idx on public.sync_runs (connection_id, started_at desc);
alter table public.sync_runs enable row level security;
create policy sync_runs_select on public.sync_runs for select to authenticated using (app.is_member(organization_id));
revoke all on public.sync_runs from anon, authenticated;
grant select on public.sync_runs to authenticated;

-- Stores or replaces a connection's secret in Vault. Called by a member who may manage connectors.
create or replace function public.connection_set_secret(p_connection uuid, p_secret text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.connections;
begin
  select * into c from public.connections where id = p_connection for update;
  if not found or not app.has_role(c.organization_id, array['org_admin', 'recruiter_manager']::public.membership_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_secret is null or char_length(p_secret) = 0 then
    if c.secret_id is not null then delete from vault.secrets where id = c.secret_id; end if;
    update public.connections set secret_id = null where id = c.id;
    return;
  end if;
  if char_length(p_secret) > 4000 then raise exception 'invalid_secret' using errcode = '22023'; end if;
  if c.secret_id is null then
    update public.connections
       set secret_id = vault.create_secret(p_secret, 'connection:' || c.id, 'Workatent connector credential')
     where id = c.id;
  else
    perform vault.update_secret(c.secret_id, p_secret);
  end if;
  perform app.audit(c.organization_id, 'connection.secret_set', 'connection', c.id, '{}');
end $$;

-- The decrypted secret, for the sync worker only (service role).
create or replace function public.connection_get_secret(p_connection uuid) returns text
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret
    from public.connections c join vault.decrypted_secrets s on s.id = c.secret_id
   where c.id = p_connection;
$$;

-- Vault rows are not removed by the FK cascade, so a deleted connection takes its secret with it.
create or replace function app.connections_drop_secret() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.secret_id is not null then delete from vault.secrets where id = old.secret_id; end if;
  return old;
end $$;
create trigger connections_drop_secret after delete on public.connections
  for each row execute function app.connections_drop_secret();

-- "Sync now" from the UI.
create or replace function public.request_connection_sync(p_connection uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.connections;
begin
  select * into c from public.connections where id = p_connection;
  if not found or not app.has_role(c.organization_id, array['org_admin', 'recruiter_manager']::public.membership_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.enqueue('connector.sync', c.id::text, jsonb_build_object('connection_id', c.id, 'trigger', 'manual'));
end $$;

-- Called by the worker loop: queues every active connection that is due and moves its next slot.
create or replace function public.enqueue_due_connector_syncs() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer := 0;
  c record;
begin
  for c in
    select id, sync_interval_minutes from public.connections
     where status = 'active' and next_sync_at <= now()
     order by next_sync_at
     limit 200
     for update skip locked
  loop
    perform app.enqueue('connector.sync', c.id::text, jsonb_build_object('connection_id', c.id, 'trigger', 'schedule'));
    update public.connections set next_sync_at = now() + make_interval(mins => c.sync_interval_minutes) where id = c.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- 5. External references
-- ---------------------------------------------------------------------------
create table public.external_refs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source text not null check (char_length(source) between 2 and 80), -- 'api' or 'connection:<id>'
  connection_id uuid references public.connections (id) on delete set null,
  entity_type text not null check (entity_type in ('candidate', 'job')),
  external_id text not null check (char_length(external_id) between 1 and 200),
  entity_id uuid not null,
  content_hash text,
  seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, source, entity_type, external_id)
);
create index external_refs_entity_idx on public.external_refs (entity_type, entity_id);
create index external_refs_connection_idx on public.external_refs (connection_id, entity_type, seen_at);
alter table public.external_refs enable row level security;
create policy external_refs_select on public.external_refs for select to authenticated using (app.is_member(organization_id));
revoke all on public.external_refs from anon, authenticated;
grant select on public.external_refs to authenticated;

-- ---------------------------------------------------------------------------
-- Grants on functions
-- ---------------------------------------------------------------------------
revoke execute on function
  public.transfer_member_portfolio(uuid, uuid, uuid),
  public.api_key_authenticate(text),
  public.connection_set_secret(uuid, text),
  public.connection_get_secret(uuid),
  public.request_connection_sync(uuid),
  public.enqueue_due_connector_syncs(),
  app.connections_drop_secret()
from public, anon, authenticated, service_role;
grant execute on function
  public.transfer_member_portfolio(uuid, uuid, uuid),
  public.connection_set_secret(uuid, text),
  public.request_connection_sync(uuid)
to authenticated;
grant execute on function
  public.api_key_authenticate(text),
  public.connection_get_secret(uuid),
  public.enqueue_due_connector_syncs()
to service_role;
