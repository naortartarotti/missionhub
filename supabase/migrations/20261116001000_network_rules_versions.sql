-- N10 part 1 of 8: versioned Network Rules and acceptances (BR-1 to BR-6, BR-10, EC-4).
--
-- - public.network_rules_versions / _version_texts: one row per version, one text per locale. The
--   database normalizes line endings (CRLF / CR -> LF) and computes the SHA-256 of the stored text
--   itself (trigger), so the hash always equals sha256(stored body) and never comes from a client.
-- - Published versions and their texts are immutable (no grants + refusing triggers).
-- - Members read published versions through RLS (select only). Drafts are read and written only
--   through platform-admin RPCs.
-- - Acceptances: per org x version (an org_admin "on behalf of") and per user x version (personal,
--   valid in every org of the user, N10-D2). Append-only, written only by accept_network_rules()
--   and create_organization(). Each stores the locale shown and that locale's SHA-256.
--
-- "Current" = the latest published version with effective_at <= now(). Acceptance requirements are
-- driven by the latest effective version that needs acceptance (initial, material,
-- legally_required): a non_material version never re-opens acceptance (BR-3). Accepting any version
-- whose effective_at is >= that one's satisfies it (accepting the upcoming version early counts).

create type public.network_rules_version_type as enum ('initial', 'material', 'non_material', 'legally_required');
create type public.network_rules_locale as enum ('en', 'fr-CA', 'pt-BR');

create table public.network_rules_versions (
  id uuid primary key default gen_random_uuid(),
  label text not null unique check (label ~ '^[0-9]{1,3}\.[0-9]{1,3}$'),
  type public.network_rules_version_type not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  effective_on date,
  effective_at timestamptz,
  published_at timestamptz,
  legal_reason text check (legal_reason is null or char_length(legal_reason) between 20 and 1000),
  approval_reference text check (approval_reference is null or char_length(approval_reference) between 5 and 300),
  rule_numbers text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'draft' or (published_at is not null and effective_at is not null and approval_reference is not null)),
  check (type <> 'legally_required' or status = 'draft' or legal_reason is not null)
);
create index network_rules_versions_effective on public.network_rules_versions (effective_at desc) where status = 'published';

create table public.network_rules_version_texts (
  version_id uuid not null references public.network_rules_versions (id) on delete cascade,
  locale public.network_rules_locale not null,
  body text not null check (char_length(body) between 1 and 200000),
  change_summary text check (change_summary is null or char_length(change_summary) between 20 and 2000),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  -- [{ "number": "2.3", "excerpt": "Keep it inside your organization…" }] in text order (rule picker labels).
  rules jsonb not null default '[]',
  -- [{ "number": "2", "title": "Data use" }] (section headings "## N. Title").
  sections jsonb not null default '[]',
  primary key (version_id, locale)
);

-- Normalizes line endings and derives the hash, the rule list and the section list from the stored
-- body. Runs on every insert and update (drafts), so a client can never supply a hash.
create or replace function app.network_rules_text_derive() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.body := replace(replace(new.body, E'\r\n', E'\n'), E'\r', E'\n');
  if new.change_summary is not null then
    new.change_summary := nullif(btrim(replace(replace(new.change_summary, E'\r\n', E'\n'), E'\r', E'\n')), '');
  end if;
  new.sha256 := encode(extensions.digest(convert_to(new.body, 'UTF8'), 'sha256'), 'hex');
  new.rules := coalesce((
    select jsonb_agg(jsonb_build_object('number', m[1], 'excerpt', left(btrim(regexp_replace(m[2], '\s+', ' ', 'g')), 120)))
      from regexp_matches(new.body, '^\*\*([0-9]+\.[0-9]+)\*\*[ \t]*([^\n]*)$', 'gn') as m), '[]');
  new.sections := coalesce((
    select jsonb_agg(jsonb_build_object('number', m[1], 'title', btrim(m[2])))
      from regexp_matches(new.body, '^## ([0-9]+)\.[ \t]+([^\n]+)$', 'gn') as m), '[]');
  return new;
end $$;

create trigger network_rules_text_derive before insert or update on public.network_rules_version_texts
  for each row execute function app.network_rules_text_derive();

-- EC-4: a published version and its texts can't change or be deleted, by anyone.
create or replace function app.network_rules_guard_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'published' then
    raise exception 'immutable_record: published Network Rules versions cannot be modified or deleted' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger network_rules_guard_version before update or delete on public.network_rules_versions
  for each row execute function app.network_rules_guard_version();

create or replace function app.network_rules_guard_text() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_version uuid;
begin
  if tg_op = 'INSERT' then v_version := new.version_id; else v_version := old.version_id; end if;
  if exists (select 1 from public.network_rules_versions v where v.id = v_version and v.status = 'published') then
    raise exception 'immutable_record: published Network Rules texts cannot be modified or deleted' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger network_rules_guard_text before insert or update or delete on public.network_rules_version_texts
  for each row execute function app.network_rules_guard_text();

alter table public.network_rules_versions enable row level security;
alter table public.network_rules_version_texts enable row level security;
-- BR-4: every signed-in user (any org state, no org, gated) reads published versions.
create policy network_rules_versions_select on public.network_rules_versions for select to authenticated
  using (status = 'published');
create policy network_rules_texts_select on public.network_rules_version_texts for select to authenticated
  using (exists (select 1 from public.network_rules_versions v where v.id = version_id and v.status = 'published'));
revoke all on public.network_rules_versions, public.network_rules_version_texts from anon, authenticated;
grant select on public.network_rules_versions, public.network_rules_version_texts to authenticated;

-- ---------------------------------------------------------------------------
-- Acceptances (append-only)
-- ---------------------------------------------------------------------------
create table public.network_rules_org_acceptances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  version_id uuid not null references public.network_rules_versions (id),
  accepted_by uuid references auth.users (id) on delete set null,
  locale public.network_rules_locale not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  accepted_at timestamptz not null default now(),
  unique (organization_id, version_id)
);

create table public.network_rules_member_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  version_id uuid not null references public.network_rules_versions (id),
  -- The org context where the member accepted (null only for seed/operator rows).
  organization_id uuid references public.organizations (id) on delete set null,
  locale public.network_rules_locale not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  accepted_at timestamptz not null default now(),
  unique (user_id, version_id)
);
create index network_rules_member_acceptances_user on public.network_rules_member_acceptances (user_id);

create or replace function app.network_rules_acceptance_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'immutable_record: acceptances are append-only' using errcode = 'P0001';
end $$;
create trigger network_rules_org_acceptances_immutable before update on public.network_rules_org_acceptances
  for each row execute function app.network_rules_acceptance_immutable();
create trigger network_rules_member_acceptances_immutable before update on public.network_rules_member_acceptances
  for each row execute function app.network_rules_acceptance_immutable();

alter table public.network_rules_org_acceptances enable row level security;
alter table public.network_rules_member_acceptances enable row level security;
-- Own rows only. Org acceptances (with the accepting admin) are read by org admins; other members get
-- "the org accepted" through get_my_org_state(). Platform admins read everything.
create policy network_rules_member_acceptances_select on public.network_rules_member_acceptances for select to authenticated
  using (user_id = (select auth.uid()) or app.is_platform_admin());
-- (The org-acceptance policy is created in part 6, once the settling-member helper exists.)
revoke all on public.network_rules_org_acceptances, public.network_rules_member_acceptances from anon, authenticated;
grant select on public.network_rules_org_acceptances, public.network_rules_member_acceptances to authenticated;

-- ---------------------------------------------------------------------------
-- Version helpers (closed app schema)
-- ---------------------------------------------------------------------------
create or replace function app.rules_current_version() returns uuid
language sql stable security definer set search_path = '' as $$
  select v.id from public.network_rules_versions v
   where v.status = 'published' and v.effective_at <= now()
   order by v.effective_at desc, v.published_at desc limit 1;
$$;

-- The latest effective version that requires acceptance (non_material versions never do).
create or replace function app.rules_required_version() returns public.network_rules_versions
language sql stable security definer set search_path = '' as $$
  select v.* from public.network_rules_versions v
   where v.status = 'published' and v.effective_at <= now() and v.type <> 'non_material'
   order by v.effective_at desc, v.published_at desc limit 1;
$$;

create or replace function app.rules_upcoming_version() returns uuid
language sql stable security definer set search_path = '' as $$
  select v.id from public.network_rules_versions v
   where v.status = 'published' and v.effective_at > now()
   order by v.effective_at asc limit 1;
$$;

-- True when no acceptance-requiring version is in effect, or the org accepted it (or a later one).
create or replace function app.org_accepted_required(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select r.id is null or exists (
    select 1 from public.network_rules_org_acceptances a
      join public.network_rules_versions v on v.id = a.version_id
     where a.organization_id = p_org and v.effective_at >= r.effective_at)
  from (select (app.rules_required_version()).*) r;
$$;

create or replace function app.user_accepted_any(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.network_rules_member_acceptances a where a.user_id = p_user);
$$;

create or replace function app.user_accepted_required(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select r.id is null or exists (
    select 1 from public.network_rules_member_acceptances a
      join public.network_rules_versions v on v.id = a.version_id
     where a.user_id = p_user and v.effective_at >= r.effective_at)
  from (select (app.rules_required_version()).*) r;
$$;

-- The fixed effective time for a date: 00:00 America/Toronto (rule 10.2).
create or replace function app.rules_effective_at(p_day date) returns timestamptz
language sql immutable set search_path = '' as $$
  select (p_day::timestamp) at time zone 'America/Toronto';
$$;

revoke execute on function app.rules_current_version(), app.rules_required_version(), app.rules_upcoming_version(),
  app.org_accepted_required(uuid), app.user_accepted_any(uuid), app.user_accepted_required(uuid),
  app.rules_effective_at(date), app.network_rules_text_derive(), app.network_rules_guard_version(),
  app.network_rules_guard_text(), app.network_rules_acceptance_immutable()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Publishing (platform admin, BR-2, BR-3)
-- ---------------------------------------------------------------------------

-- Validates the three texts: every locale present, no forbidden marker, same rule numbers.
-- Raises with a JSON DETAIL the app turns into field errors.
create or replace function app.network_rules_check_texts(p_texts jsonb, p_summaries jsonb, p_need_summary boolean)
returns void
language plpgsql stable set search_path = '' as $$
declare
  v_locale text;
  v_missing jsonb := '[]';
  v_markers jsonb := '[]';
  v_numbers text[];
  v_first text[];
  v_body text;
begin
  foreach v_locale in array array['en', 'fr-CA', 'pt-BR'] loop
    v_body := btrim(coalesce(p_texts ->> v_locale, ''));
    if v_body = '' then
      v_missing := v_missing || jsonb_build_object('locale', v_locale, 'field', 'text');
    end if;
    if p_need_summary and char_length(btrim(coalesce(p_summaries ->> v_locale, ''))) not between 20 and 2000 then
      v_missing := v_missing || jsonb_build_object('locale', v_locale, 'field', 'summary');
    end if;
  end loop;
  if jsonb_array_length(v_missing) > 0 then
    raise exception 'missing_locale' using errcode = '22023', detail = v_missing::text;
  end if;

  foreach v_locale in array array['en', 'fr-CA', 'pt-BR'] loop
    v_body := replace(replace(p_texts ->> v_locale, E'\r\n', E'\n'), E'\r', E'\n');
    v_markers := v_markers || coalesce((
      select jsonb_agg(jsonb_build_object('locale', v_locale, 'line', t.n, 'marker', mk.m) order by t.n, mk.m)
        from regexp_split_to_table(v_body, E'\n') with ordinality as t(line, n)
        cross join unnest(array['<!--', '[TODO', '[placeholder', '⚖️']) as mk(m)
       where position(mk.m in t.line) > 0), '[]');
  end loop;
  if jsonb_array_length(v_markers) > 0 then
    raise exception 'marker_found' using errcode = '22023', detail = v_markers::text;
  end if;

  foreach v_locale in array array['en', 'fr-CA', 'pt-BR'] loop
    select coalesce(array_agg(m[1]), '{}') into v_numbers
      from regexp_matches(replace(p_texts ->> v_locale, E'\r\n', E'\n'), '^\*\*([0-9]+\.[0-9]+)\*\*', 'gn') m;
    if v_first is null then v_first := v_numbers;
    elsif v_numbers is distinct from v_first then
      raise exception 'rule_numbers_mismatch' using errcode = '22023', detail = v_locale;
    end if;
  end loop;
end $$;
revoke execute on function app.network_rules_check_texts(jsonb, jsonb, boolean) from public, anon, authenticated;

-- Saves (creates or updates) a draft. Drafts aren't checked for markers (they're work in progress).
create or replace function public.save_network_rules_draft(
  p_draft uuid, p_label text, p_type text, p_effective_on date, p_texts jsonb, p_summaries jsonb,
  p_legal_reason text default null, p_approval_reference text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_draft;
  v_locale text;
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_label is null or btrim(p_label) !~ '^[0-9]{1,3}\.[0-9]{1,3}$' then raise exception 'invalid_label' using errcode = '22023'; end if;
  if p_type is null or p_type not in ('initial', 'material', 'non_material', 'legally_required') then
    raise exception 'invalid_type' using errcode = '22023';
  end if;
  if exists (select 1 from public.network_rules_versions v where v.label = btrim(p_label) and v.id is distinct from p_draft) then
    raise exception 'label_taken' using errcode = '23505';
  end if;
  if v_id is null then
    insert into public.network_rules_versions (label, type, effective_on, legal_reason, approval_reference)
    values (btrim(p_label), p_type::public.network_rules_version_type, p_effective_on,
            nullif(btrim(coalesce(p_legal_reason, '')), ''), nullif(btrim(coalesce(p_approval_reference, '')), ''))
    returning id into v_id;
  else
    update public.network_rules_versions
       set label = btrim(p_label), type = p_type::public.network_rules_version_type, effective_on = p_effective_on,
           legal_reason = nullif(btrim(coalesce(p_legal_reason, '')), ''),
           approval_reference = nullif(btrim(coalesce(p_approval_reference, '')), '')
     where id = v_id and status = 'draft';
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  foreach v_locale in array array['en', 'fr-CA', 'pt-BR'] loop
    if btrim(coalesce(p_texts ->> v_locale, '')) <> '' then
      insert into public.network_rules_version_texts (version_id, locale, body, change_summary, sha256)
      values (v_id, v_locale::public.network_rules_locale, p_texts ->> v_locale,
              nullif(btrim(coalesce(p_summaries ->> v_locale, '')), ''), repeat('0', 64))
      on conflict (version_id, locale) do update set body = excluded.body, change_summary = excluded.change_summary;
    else
      delete from public.network_rules_version_texts where version_id = v_id and locale = v_locale::public.network_rules_locale;
    end if;
  end loop;
  return v_id;
end $$;

create or replace function public.delete_network_rules_draft(p_draft uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.network_rules_versions where id = p_draft and status = 'draft';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

-- Publishes a version. p_draft optionally names the draft being published (it becomes the version);
-- the texts and fields passed here are authoritative either way.
create or replace function public.publish_network_rules_version(
  p_label text, p_type text, p_effective_on date, p_texts jsonb, p_summaries jsonb,
  p_legal_reason text, p_approval_reference text, p_draft uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_type public.network_rules_version_type;
  v_today date := (now() at time zone 'America/Toronto')::date;
  v_effective timestamptz;
  v_id uuid;
  v_locale text;
  v_numbers text[];
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_label is null or btrim(p_label) !~ '^[0-9]{1,3}\.[0-9]{1,3}$' then raise exception 'invalid_label' using errcode = '22023'; end if;
  if p_type is null or p_type not in ('initial', 'material', 'non_material', 'legally_required') then
    raise exception 'invalid_type' using errcode = '22023';
  end if;
  v_type := p_type::public.network_rules_version_type;
  if char_length(btrim(coalesce(p_approval_reference, ''))) not between 5 and 300 then
    raise exception 'approval_reference_required' using errcode = '22023';
  end if;
  if exists (select 1 from public.network_rules_versions v where v.label = btrim(p_label)
               and (v.status = 'published' or v.id is distinct from p_draft)) then
    raise exception 'label_taken' using errcode = '23505';
  end if;
  -- Serialize publishes so "one upcoming" and "initial only once" hold under concurrency.
  perform pg_advisory_xact_lock(hashtext('network_rules.publish'));

  perform app.network_rules_check_texts(p_texts, p_summaries, v_type <> 'initial');

  if v_type = 'initial' then
    if exists (select 1 from public.network_rules_versions v where v.status = 'published') then
      raise exception 'initial_exists' using errcode = 'P0001';
    end if;
    v_effective := now();
  elsif not exists (select 1 from public.network_rules_versions v where v.status = 'published') then
    raise exception 'initial_required' using errcode = 'P0001';
  elsif v_type = 'non_material' then
    v_effective := now();
  elsif v_type = 'material' then
    if p_effective_on is null or p_effective_on < v_today + 30 then
      raise exception 'effective_date' using errcode = '22023', detail = (v_today + 30)::text;
    end if;
    v_effective := app.rules_effective_at(p_effective_on);
  else -- legally_required
    if char_length(btrim(coalesce(p_legal_reason, ''))) not between 20 and 1000 then
      raise exception 'legal_reason_required' using errcode = '22023';
    end if;
    if p_effective_on is null or p_effective_on < v_today then
      raise exception 'effective_date' using errcode = '22023', detail = v_today::text;
    end if;
    v_effective := greatest(now(), app.rules_effective_at(p_effective_on));
  end if;

  if v_effective > now() and app.rules_upcoming_version() is not null then
    raise exception 'upcoming_exists' using errcode = 'P0001';
  end if;

  if p_draft is not null then
    if not exists (select 1 from public.network_rules_versions v where v.id = p_draft and v.status = 'draft') then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    v_id := p_draft;
    update public.network_rules_versions set label = btrim(p_label), type = v_type where id = v_id;
  else
    insert into public.network_rules_versions (label, type) values (btrim(p_label), v_type) returning id into v_id;
  end if;

  foreach v_locale in array array['en', 'fr-CA', 'pt-BR'] loop
    insert into public.network_rules_version_texts (version_id, locale, body, change_summary, sha256)
    values (v_id, v_locale::public.network_rules_locale, p_texts ->> v_locale,
            case when v_type = 'initial' then nullif(btrim(coalesce(p_summaries ->> v_locale, '')), '')
                 else btrim(p_summaries ->> v_locale) end,
            repeat('0', 64))
    on conflict (version_id, locale) do update set body = excluded.body, change_summary = excluded.change_summary;
  end loop;

  select coalesce(array_agg(x ->> 'number' order by o), '{}') into v_numbers
    from public.network_rules_version_texts t, jsonb_array_elements(t.rules) with ordinality as e(x, o)
   where t.version_id = v_id and t.locale = 'en';

  update public.network_rules_versions
     set status = 'published', published_at = now(), effective_at = v_effective,
         effective_on = (v_effective at time zone 'America/Toronto')::date,
         legal_reason = case when v_type = 'legally_required' then btrim(p_legal_reason) end,
         approval_reference = btrim(p_approval_reference), rule_numbers = v_numbers
   where id = v_id;

  perform app.audit(null, 'network_rules.published', 'network_rules_version', v_id,
    jsonb_build_object('label', btrim(p_label), 'type', p_type, 'effective_at', v_effective));
  perform app.notify_rules_published(v_id);
  return v_id;
end $$;

-- BR-39: every active member of every org (once per user) gets network_rules.published.
create or replace function app.notify_rules_published(p_version uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.network_rules_versions;
  v_needs boolean;
begin
  select * into v from public.network_rules_versions where id = p_version;
  v_needs := v.type in ('material', 'legally_required') and v.effective_at > now();
  insert into public.notifications (user_id, organization_id, kind, title, body, link)
  select distinct on (m.user_id) m.user_id, m.organization_id, 'network_rules.published',
         'Network Rules ' || v.label || ' published',
         case when v_needs then 'Read what changed and accept it by '
                                 || to_char(v.effective_at at time zone 'America/Toronto', 'FMMonth FMDD, YYYY') || '.'
              else 'Read what changed. No action needed.' end,
         '/network-rules#upcoming'
    from public.organization_memberships m
   where m.status = 'active'
     and not exists (select 1 from public.notification_preferences np
                      where np.user_id = m.user_id and np.kind = 'network_rules.published' and np.in_app = false)
   order by m.user_id, m.created_at;
end $$;
revoke execute on function app.notify_rules_published(uuid) from public, anon, authenticated;

-- Admin reads: the list (drafts included) and one version with its texts.
create or replace function public.admin_list_network_rules() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', v.id, 'label', v.label, 'type', v.type, 'status', v.status, 'effective_on', v.effective_on,
      'effective_at', v.effective_at, 'published_at', v.published_at, 'legal_reason', v.legal_reason,
      'approval_reference', v.approval_reference, 'rule_numbers', to_jsonb(v.rule_numbers),
      'is_current', v.id = app.rules_current_version(), 'is_upcoming', v.id = app.rules_upcoming_version(),
      'texts', coalesce((select jsonb_object_agg(t.locale::text, jsonb_build_object('sha256', t.sha256,
                          'change_summary', t.change_summary)) from public.network_rules_version_texts t
                          where t.version_id = v.id), '{}'))
      order by v.status desc, coalesce(v.effective_at, v.created_at) desc)
    from public.network_rules_versions v), '[]');
end $$;

create or replace function public.admin_get_network_rules_version(p_version uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.network_rules_versions;
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v from public.network_rules_versions where id = p_version;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  return to_jsonb(v) || jsonb_build_object('texts', coalesce((
    select jsonb_object_agg(t.locale::text, jsonb_build_object('body', t.body, 'change_summary', t.change_summary,
             'sha256', t.sha256, 'rules', t.rules, 'sections', t.sections))
      from public.network_rules_version_texts t where t.version_id = v.id), '{}'));
end $$;

revoke execute on function public.save_network_rules_draft(uuid, text, text, date, jsonb, jsonb, text, text),
  public.delete_network_rules_draft(uuid),
  public.publish_network_rules_version(text, text, date, jsonb, jsonb, text, text, uuid),
  public.admin_list_network_rules(), public.admin_get_network_rules_version(uuid)
  from public, anon;
grant execute on function public.save_network_rules_draft(uuid, text, text, date, jsonb, jsonb, text, text),
  public.delete_network_rules_draft(uuid),
  public.publish_network_rules_version(text, text, date, jsonb, jsonb, text, text, uuid),
  public.admin_list_network_rules(), public.admin_get_network_rules_version(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Recording acceptances
-- ---------------------------------------------------------------------------

-- Validates a version the caller wants to accept: published, and current (or upcoming when allowed).
-- Unknown or draft -> rules_acceptance_required; published but superseded -> rules_version_changed.
create or replace function app.rules_acceptable_version(p_version uuid, p_allow_upcoming boolean)
returns public.network_rules_versions
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.network_rules_versions;
begin
  select * into v from public.network_rules_versions where id = p_version and status = 'published';
  if not found then raise exception 'rules_acceptance_required' using errcode = 'P0001'; end if;
  if v.id = app.rules_current_version() then return v; end if;
  if p_allow_upcoming and v.id = app.rules_upcoming_version() then return v; end if;
  raise exception 'rules_version_changed' using errcode = 'P0001';
end $$;
revoke execute on function app.rules_acceptable_version(uuid, boolean) from public, anon, authenticated;

create or replace function app.rules_text_hash(p_version uuid, p_locale text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hash text;
begin
  if p_locale is null or p_locale not in ('en', 'fr-CA', 'pt-BR') then
    raise exception 'invalid_locale' using errcode = '22023';
  end if;
  select t.sha256 into v_hash from public.network_rules_version_texts t
   where t.version_id = p_version and t.locale = p_locale::public.network_rules_locale;
  if v_hash is null then raise exception 'rules_acceptance_required' using errcode = 'P0001'; end if;
  return v_hash;
end $$;
revoke execute on function app.rules_text_hash(uuid, text) from public, anon, authenticated;

-- Inserts the acceptance rows (idempotent) and audits each new one. Internal.
create or replace function app.record_rules_acceptance(
  p_user uuid, p_org uuid, p_version uuid, p_locale text, p_personal boolean, p_for_org boolean
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_hash text := app.rules_text_hash(p_version, p_locale);
  v_label text;
begin
  select label into v_label from public.network_rules_versions where id = p_version;
  if p_for_org then
    insert into public.network_rules_org_acceptances (organization_id, version_id, accepted_by, locale, sha256)
    values (p_org, p_version, p_user, p_locale::public.network_rules_locale, v_hash)
    on conflict (organization_id, version_id) do nothing;
    if found then
      perform app.audit(p_org, 'network_rules.org_accepted', 'network_rules_version', p_version,
        jsonb_build_object('label', v_label, 'locale', p_locale, 'sha256', v_hash));
    end if;
  end if;
  if p_personal then
    insert into public.network_rules_member_acceptances (user_id, version_id, organization_id, locale, sha256)
    values (p_user, p_version, p_org, p_locale::public.network_rules_locale, v_hash)
    on conflict (user_id, version_id) do nothing;
    if found then
      perform app.audit(p_org, 'network_rules.member_accepted', 'network_rules_version', p_version,
        jsonb_build_object('label', v_label, 'locale', p_locale, 'sha256', v_hash));
    end if;
  end if;
end $$;
revoke execute on function app.record_rules_acceptance(uuid, uuid, uuid, text, boolean, boolean) from public, anon, authenticated;

-- BR-6: creating an org requires accepting the current version for the org and personally, in the
-- same transaction. The old 3-argument overload is dropped so no path skips it.
drop function public.create_organization(text, text, public.organization_kind);
create or replace function public.create_organization(
  p_name text, p_slug text, p_kind public.organization_kind default 'agency',
  p_rules_version uuid default null, p_rules_locale text default null,
  p_accept_org boolean default false, p_accept_member boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  -- BR-7 exempt: this call records the acceptance itself.
  perform set_config('app.rules_gate_exempt', 'on', true);
  if p_rules_version is null or not coalesce(p_accept_org, false) or not coalesce(p_accept_member, false) then
    raise exception 'rules_acceptance_required' using errcode = 'P0001';
  end if;
  perform app.rules_acceptable_version(p_rules_version, false);
  perform app.rules_text_hash(p_rules_version, p_rules_locale);

  insert into public.organizations (name, slug, kind, created_by)
  values (trim(p_name), lower(trim(p_slug)), p_kind, auth.uid())
  returning id into v_org;
  insert into public.organization_memberships (organization_id, user_id, role)
  values (v_org, auth.uid(), 'org_admin');
  perform app.audit(v_org, 'organization.created', 'organization', v_org, '{}');
  perform app.record_rules_acceptance(auth.uid(), v_org, p_rules_version, p_rules_locale, true, true);
  return v_org;
exception when unique_violation then
  raise exception 'slug_taken' using errcode = '23505';
end $$;
revoke execute on function public.create_organization(text, text, public.organization_kind, uuid, text, boolean, boolean) from public, anon;
grant execute on function public.create_organization(text, text, public.organization_kind, uuid, text, boolean, boolean) to authenticated;
