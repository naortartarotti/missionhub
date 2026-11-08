-- MissionHub foundation: identity, organizations, memberships, invitations, audit, notifications.
-- Security model: RLS is defense in depth. Server code ALSO validates tenant context.
-- Private helper functions live in schema `app` which is not exposed through the Data API.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

create schema if not exists app;
revoke all on schema app from public, anon;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.membership_role as enum ('org_admin', 'recruiter_manager', 'recruiter');
create type public.membership_status as enum ('active', 'suspended');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.organization_kind as enum ('agency', 'independent');

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function app.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function app.prevent_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'immutable_record: % rows cannot be modified or deleted; record a compensating entry instead', tg_table_name
    using errcode = 'P0001';
end $$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email extensions.citext not null,
  full_name text not null default '' check (char_length(full_name) <= 120),
  headline text check (char_length(headline) <= 160),
  specialties text[] not null default '{}',
  regions text[] not null default '{}',
  is_platform_admin boolean not null default false,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function app.set_updated_at();

create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- Users may not promote themselves to platform admin.
create or replace function app.guard_profile_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.is_platform_admin is distinct from old.is_platform_admin
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden: platform admin flag can only be changed by the platform' using errcode = '42501';
  end if;
  if new.email is distinct from old.email and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden: email is managed by authentication' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function app.guard_profile_update();

-- ---------------------------------------------------------------------------
-- Organizations & memberships
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$'),
  kind public.organization_kind not null default 'agency',
  country char(2) not null default 'CA',
  default_currency char(3) not null default 'CAD' check (default_currency ~ '^[A-Z]{3}$'),
  locale text not null default 'en-CA',
  is_demo boolean not null default false,
  suspended_at timestamptz,
  suspended_reason text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_updated_at before update on public.organizations
  for each row execute function app.set_updated_at();

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.membership_role not null default 'recruiter',
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index organization_memberships_user_idx on public.organization_memberships (user_id, status);
create trigger organization_memberships_updated_at before update on public.organization_memberships
  for each row execute function app.set_updated_at();

-- Authorization helpers. SECURITY DEFINER so RLS policies can call them without recursion.
create or replace function app.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = p_org
      and m.user_id = auth.uid()
      and m.status = 'active'
      and o.suspended_at is null
  );
$$;

create or replace function app.has_role(p_org uuid, p_roles public.membership_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = p_org
      and m.user_id = auth.uid()
      and m.status = 'active'
      and o.suspended_at is null
      and m.role = any (p_roles)
  );
$$;

create or replace function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_platform_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function app.shares_org_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.organization_memberships a
    join public.organization_memberships b on b.organization_id = a.organization_id
    where a.user_id = auth.uid() and a.status = 'active'
      and b.user_id = p_user
  );
$$;

grant execute on all functions in schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Invitations (token stored hashed)
-- ---------------------------------------------------------------------------
create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email extensions.citext not null,
  role public.membership_role not null default 'recruiter',
  token_hash text not null unique,
  status public.invitation_status not null default 'pending',
  invited_by uuid references auth.users (id) on delete set null,
  accepted_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index organization_invitations_pending_uniq
  on public.organization_invitations (organization_id, email) where status = 'pending';
create trigger organization_invitations_updated_at before update on public.organization_invitations
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Audit events (immutable, PII-free metadata by convention)
-- ---------------------------------------------------------------------------
create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations (id) on delete set null,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_events_org_idx on public.audit_events (organization_id, created_at desc);
create index audit_events_entity_idx on public.audit_events (entity_type, entity_id);
create trigger audit_events_immutable before update or delete on public.audit_events
  for each row execute function app.prevent_mutation();

create or replace function app.audit(
  p_org uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb default '{}'
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_org, auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'));
$$;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  email_status text not null default 'not_configured'
    check (email_status in ('not_configured', 'disabled', 'queued', 'sent', 'failed')),
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

create table public.notification_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  in_app boolean not null default true,
  email boolean not null default false,
  primary key (user_id, kind)
);

-- Notify every active member of an org (optionally restricted to a single user).
create or replace function app.notify_org(
  p_org uuid, p_kind text, p_title text, p_body text, p_link text, p_only_user uuid default null
) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, organization_id, kind, title, body, link)
  select m.user_id, p_org, p_kind, p_title, p_body, p_link
  from public.organization_memberships m
  where m.organization_id = p_org and m.status = 'active'
    and (p_only_user is null or m.user_id = p_only_user)
    and not exists (
      select 1 from public.notification_preferences np
      where np.user_id = m.user_id and np.kind = p_kind and np.in_app = false
    );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.audit_events enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or app.shares_org_with(id) or app.is_platform_admin());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Organizations: members read; org admins update. Creation goes through create_organization().
create policy organizations_select on public.organizations for select to authenticated
  using (app.is_member(id) or app.is_platform_admin());
create policy organizations_update on public.organizations for update to authenticated
  using (app.has_role(id, array['org_admin']::public.membership_role[]))
  with check (app.has_role(id, array['org_admin']::public.membership_role[]));

create policy memberships_select on public.organization_memberships for select to authenticated
  using (user_id = auth.uid() or app.is_member(organization_id) or app.is_platform_admin());
create policy memberships_update on public.organization_memberships for update to authenticated
  using (app.has_role(organization_id, array['org_admin']::public.membership_role[]))
  with check (app.has_role(organization_id, array['org_admin']::public.membership_role[]));

create policy invitations_select on public.organization_invitations for select to authenticated
  using (app.has_role(organization_id, array['org_admin','recruiter_manager']::public.membership_role[]));
create policy invitations_update on public.organization_invitations for update to authenticated
  using (app.has_role(organization_id, array['org_admin']::public.membership_role[]))
  with check (app.has_role(organization_id, array['org_admin']::public.membership_role[]));

create policy audit_select on public.audit_events for select to authenticated
  using (
    (organization_id is not null
      and app.has_role(organization_id, array['org_admin','recruiter_manager']::public.membership_role[]))
    or app.is_platform_admin()
  );

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notification_prefs_all on public.notification_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Restrict which columns end-users can update.
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke update on public.organization_memberships from authenticated;
grant update (role, status) on public.organization_memberships to authenticated;
revoke update on public.organizations from authenticated;
grant update (name, locale, default_currency, kind) on public.organizations to authenticated;

-- ---------------------------------------------------------------------------
-- Use-case RPCs
-- ---------------------------------------------------------------------------
create or replace function public.create_organization(p_name text, p_slug text, p_kind public.organization_kind default 'agency')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  insert into public.organizations (name, slug, kind, created_by)
  values (trim(p_name), lower(trim(p_slug)), p_kind, auth.uid())
  returning id into v_org;
  insert into public.organization_memberships (organization_id, user_id, role)
  values (v_org, auth.uid(), 'org_admin');
  perform app.audit(v_org, 'organization.created', 'organization', v_org, '{}');
  return v_org;
exception when unique_violation then
  raise exception 'slug_taken' using errcode = '23505';
end $$;

create or replace function public.create_invitation(p_org uuid, p_email text, p_role public.membership_role)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_id uuid;
begin
  if not app.has_role(p_org, array['org_admin']::public.membership_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- Expire stale pending invitation for the same email.
  update public.organization_invitations set status = 'revoked'
   where organization_id = p_org and email = lower(p_email) and status = 'pending';
  insert into public.organization_invitations (organization_id, email, role, token_hash, invited_by)
  values (p_org, lower(trim(p_email)), p_role, encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid())
  returning id into v_id;
  perform app.audit(p_org, 'invitation.created', 'invitation', v_id, jsonb_build_object('role', p_role));
  return v_token; -- shown once to the inviter; only the hash is stored
end $$;

create or replace function public.accept_invitation(p_token text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.organization_invitations;
  v_email text;
  v_slug text;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  select email into v_email from public.profiles where id = auth.uid();
  select * into v_inv from public.organization_invitations
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
   for update;
  if not found or v_inv.status <> 'pending' then
    raise exception 'invitation_invalid' using errcode = 'P0002';
  end if;
  if v_inv.expires_at < now() then
    update public.organization_invitations set status = 'expired' where id = v_inv.id;
    raise exception 'invitation_expired' using errcode = 'P0002';
  end if;
  if lower(v_inv.email) <> lower(v_email) then
    raise exception 'invitation_email_mismatch' using errcode = '42501';
  end if;
  insert into public.organization_memberships (organization_id, user_id, role)
  values (v_inv.organization_id, auth.uid(), v_inv.role)
  on conflict (organization_id, user_id) do update set status = 'active', role = excluded.role;
  update public.organization_invitations
     set status = 'accepted', accepted_by = auth.uid()
   where id = v_inv.id;
  perform app.audit(v_inv.organization_id, 'invitation.accepted', 'invitation', v_inv.id, '{}');
  select slug into v_slug from public.organizations where id = v_inv.organization_id;
  return v_slug;
end $$;

revoke execute on function public.create_organization(text, text, public.organization_kind) from public, anon;
revoke execute on function public.create_invitation(uuid, text, public.membership_role) from public, anon;
revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.create_organization(text, text, public.organization_kind) to authenticated;
grant execute on function public.create_invitation(uuid, text, public.membership_role) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
