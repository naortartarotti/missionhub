-- Referrals: permission-based submissions of A's candidate to B's job.
-- B never receives A's candidate_id. The link lives in referral_candidate_links (source-only RLS).
-- B reads only the immutable approved snapshot (referral_shared_profiles) and granted documents.

create type public.referral_status as enum (
  'submitted', 'under_review', 'info_requested', 'accepted', 'declined', 'withdrawn',
  'interviewing', 'offer', 'hired', 'rejected', 'cancelled'
);
create type public.referral_side as enum ('source', 'target');

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete restrict,
  source_org_id uuid not null references public.organizations (id),
  source_user_id uuid not null references auth.users (id),
  target_org_id uuid not null references public.organizations (id),
  status public.referral_status not null default 'submitted',
  version integer not null default 1,
  idempotency_key text not null unique,
  job_title_snapshot text not null,
  candidate_label text not null, -- e.g. "Senior backend engineer · Toronto" (approved fields only)
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  ownership_protected_until timestamptz not null default now() + interval '12 months',
  sharing_revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_org_id <> target_org_id)
);
create index referrals_source_idx on public.referrals (source_org_id, status, updated_at desc);
create index referrals_target_idx on public.referrals (target_org_id, status, updated_at desc);
create index referrals_job_idx on public.referrals (job_id);
create trigger referrals_updated_at before update on public.referrals
  for each row execute function app.set_updated_at();

create table public.referral_candidate_links (
  referral_id uuid primary key references public.referrals (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id),
  organization_id uuid not null references public.organizations (id),
  consent_id uuid not null references public.candidate_consents (id),
  created_at timestamptz not null default now()
);
create index referral_candidate_links_candidate_idx on public.referral_candidate_links (candidate_id);

create table public.referral_shared_profiles (
  referral_id uuid primary key references public.referrals (id) on delete cascade,
  disclosed_fields text[] not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create trigger referral_shared_profiles_immutable before update or delete on public.referral_shared_profiles
  for each row execute function app.prevent_mutation();

create table public.referral_document_grants (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals (id) on delete cascade,
  storage_path text, -- set once the worker copies the approved file into the referral bucket
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null,
  status text not null default 'pending_copy' check (status in ('pending_copy', 'available', 'failed')),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index referral_document_grants_referral_idx on public.referral_document_grants (referral_id);

-- Source-side private mapping from a grant to the original candidate document.
create table public.referral_document_sources (
  grant_id uuid primary key references public.referral_document_grants (id) on delete cascade,
  candidate_document_id uuid not null references public.candidate_documents (id),
  organization_id uuid not null references public.organizations (id)
);

create table public.referral_status_events (
  id bigint generated always as identity primary key,
  referral_id uuid not null references public.referrals (id) on delete cascade,
  from_status public.referral_status,
  to_status public.referral_status not null,
  actor_id uuid references auth.users (id),
  actor_side public.referral_side,
  reason text check (char_length(reason) <= 2000),
  created_at timestamptz not null default now()
);
create index referral_status_events_referral_idx on public.referral_status_events (referral_id, created_at);
create trigger referral_status_events_immutable before update or delete on public.referral_status_events
  for each row execute function app.prevent_mutation();

create table public.referral_messages (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals (id) on delete cascade,
  author_id uuid not null references auth.users (id),
  author_side public.referral_side not null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index referral_messages_referral_idx on public.referral_messages (referral_id, created_at);
create trigger referral_messages_immutable before update or delete on public.referral_messages
  for each row execute function app.prevent_mutation();

-- Allowed transitions (data, so it is inspectable and testable).
create table public.referral_transitions (
  from_status public.referral_status not null,
  to_status public.referral_status not null,
  actor_side public.referral_side not null,
  requires_reason boolean not null default false,
  requires_active_agreement boolean not null default false,
  primary key (from_status, to_status, actor_side)
);
insert into public.referral_transitions values
  ('submitted',      'under_review',   'target', false, false),
  ('submitted',      'accepted',       'target', false, false),
  ('submitted',      'declined',       'target', true,  false),
  ('submitted',      'info_requested', 'target', true,  false),
  ('submitted',      'withdrawn',      'source', true,  false),
  ('under_review',   'accepted',       'target', false, false),
  ('under_review',   'declined',       'target', true,  false),
  ('under_review',   'info_requested', 'target', true,  false),
  ('under_review',   'withdrawn',      'source', true,  false),
  ('info_requested', 'under_review',   'source', true,  false),
  ('info_requested', 'declined',       'target', true,  false),
  ('info_requested', 'withdrawn',      'source', true,  false),
  ('accepted',       'interviewing',   'target', false, true),
  ('accepted',       'withdrawn',      'source', true,  false),
  ('accepted',       'cancelled',      'target', true,  false),
  ('interviewing',   'offer',          'target', false, true),
  ('interviewing',   'rejected',       'target', true,  false),
  ('interviewing',   'withdrawn',      'source', true,  false),
  ('interviewing',   'cancelled',      'target', true,  false),
  ('offer',          'rejected',       'target', true,  false),
  ('offer',          'withdrawn',      'source', true,  false),
  ('offer',          'cancelled',      'target', true,  false);
  -- offer → hired happens only through report_hire(), which creates the placement atomically.

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.referrals enable row level security;
alter table public.referral_candidate_links enable row level security;
alter table public.referral_shared_profiles enable row level security;
alter table public.referral_document_grants enable row level security;
alter table public.referral_document_sources enable row level security;
alter table public.referral_status_events enable row level security;
alter table public.referral_messages enable row level security;
alter table public.referral_transitions enable row level security;

create or replace function app.can_see_referral(p_referral uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.referrals r
    where r.id = p_referral and (app.is_member(r.source_org_id) or app.is_member(r.target_org_id))
  );
$$;
create or replace function app.referral_side(p_referral uuid) returns public.referral_side
language sql stable security definer set search_path = '' as $$
  select case
    when app.is_member(r.source_org_id) then 'source'::public.referral_side
    when app.is_member(r.target_org_id) then 'target'::public.referral_side
  end
  from public.referrals r where r.id = p_referral;
$$;
grant execute on function app.can_see_referral(uuid), app.referral_side(uuid) to authenticated;

create policy referrals_select on public.referrals for select to authenticated
  using (app.is_member(source_org_id) or app.is_member(target_org_id));
create policy referral_links_select on public.referral_candidate_links for select to authenticated
  using (app.is_member(organization_id));
create policy referral_doc_sources_select on public.referral_document_sources for select to authenticated
  using (app.is_member(organization_id));
-- Target loses access to the snapshot once the candidate's sharing authorization is revoked.
create policy referral_profiles_select on public.referral_shared_profiles for select to authenticated
  using (exists (
    select 1 from public.referrals r where r.id = referral_id
      and (app.is_member(r.source_org_id) or (app.is_member(r.target_org_id) and r.sharing_revoked_at is null))
  ));
create policy referral_grants_select on public.referral_document_grants for select to authenticated
  using (app.can_see_referral(referral_id));
create policy referral_events_select on public.referral_status_events for select to authenticated
  using (app.can_see_referral(referral_id));
create policy referral_messages_select on public.referral_messages for select to authenticated
  using (app.can_see_referral(referral_id));
create policy referral_messages_insert on public.referral_messages for insert to authenticated
  with check (author_id = auth.uid() and app.referral_side(referral_id) = author_side);
create policy referral_transitions_select on public.referral_transitions for select to authenticated using (true);

-- Writes to referral tables happen only through the RPCs below.
revoke insert, update, delete on public.referrals, public.referral_candidate_links, public.referral_shared_profiles,
  public.referral_document_grants, public.referral_document_sources, public.referral_status_events,
  public.referral_transitions from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Submit
-- ---------------------------------------------------------------------------
create or replace function app.build_shared_snapshot(p_candidate uuid, p_fields text[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.candidates;
  v jsonb := '{}';
begin
  select * into c from public.candidates where id = p_candidate;
  if 'full_name' = any(p_fields) then v := v || jsonb_build_object('full_name', c.full_name); end if;
  if 'email' = any(p_fields) then v := v || jsonb_build_object('email', c.email); end if;
  if 'phone' = any(p_fields) then v := v || jsonb_build_object('phone', c.phone); end if;
  if 'headline' = any(p_fields) then v := v || jsonb_build_object('headline', c.headline); end if;
  if 'summary' = any(p_fields) then v := v || jsonb_build_object('summary', c.summary); end if;
  if 'location' = any(p_fields) then
    v := v || jsonb_build_object('location', nullif(concat_ws(', ', c.location_city, c.location_region, c.location_country), ''),
                                 'open_to_relocation', c.open_to_relocation);
  end if;
  if 'seniority' = any(p_fields) then v := v || jsonb_build_object('seniority', c.seniority, 'years_experience', c.years_experience); end if;
  if 'skills' = any(p_fields) then v := v || jsonb_build_object('skills', to_jsonb(c.skills)); end if;
  if 'languages' = any(p_fields) then v := v || jsonb_build_object('languages', to_jsonb(c.languages)); end if;
  if 'work_arrangements' = any(p_fields) then v := v || jsonb_build_object('work_arrangements', to_jsonb(c.work_arrangements)); end if;
  if 'salary_expectation' = any(p_fields) then
    v := v || jsonb_build_object('salary_expectation_min', c.salary_expectation_min,
                                 'salary_expectation_max', c.salary_expectation_max,
                                 'salary_currency', c.salary_currency);
  end if;
  if 'availability' = any(p_fields) then v := v || jsonb_build_object('available_from', c.available_from); end if;
  if 'experience' = any(p_fields) then
    v := v || jsonb_build_object('experience', coalesce((
      select jsonb_agg(jsonb_build_object('title', e.title, 'company', e.company, 'start_date', e.start_date,
                                          'end_date', e.end_date, 'description', e.description)
                       order by e.start_date desc nulls last)
      from public.candidate_experiences e where e.candidate_id = p_candidate), '[]'::jsonb));
  end if;
  return v;
end $$;

create or replace function public.submit_referral(
  p_candidate uuid,
  p_job uuid,
  p_fields text[],
  p_document_ids uuid[],
  p_consent uuid,
  p_idempotency_key text,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c public.candidates;
  j public.jobs;
  k public.candidate_consents;
  v_existing uuid;
  v_ref uuid;
  v_label text;
  v_allowed text[] := array['full_name','email','phone','headline','summary','location','seniority','skills',
                            'languages','work_arrangements','salary_expectation','availability','experience'];
  v_doc public.candidate_documents;
  v_grant uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;

  -- Idempotent replay: same key returns the same referral.
  select id into v_existing from public.referrals where idempotency_key = p_idempotency_key;
  if v_existing is not null then
    if not app.can_see_referral(v_existing) then raise exception 'forbidden' using errcode = '42501'; end if;
    return v_existing;
  end if;

  select * into c from public.candidates where id = p_candidate for update;
  if not found or not app.is_member(c.organization_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if c.status <> 'active_for_matching' then
    raise exception 'candidate_not_active' using errcode = 'P0001';
  end if;

  select * into j from public.jobs where id = p_job;
  if not found or j.status <> 'active' or not j.accepts_external_referrals or j.organization_id = c.organization_id then
    raise exception 'job_not_open_for_referrals' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.organizations o where o.id = j.organization_id and o.suspended_at is not null) then
    raise exception 'job_not_open_for_referrals' using errcode = 'P0001';
  end if;

  select * into k from public.candidate_consents where id = p_consent;
  if not found or k.candidate_id <> c.id or k.kind <> 'job_sharing' or k.job_id <> j.id
     or k.revoked_at is not null or (k.expires_at is not null and k.expires_at < now()) then
    raise exception 'sharing_authorization_missing' using errcode = 'P0001';
  end if;

  if p_fields is null or cardinality(p_fields) = 0 or not (p_fields <@ v_allowed) then
    raise exception 'invalid_disclosure_fields' using errcode = '22023';
  end if;

  -- Duplicate protection: one live referral per candidate & job.
  if exists (
    select 1 from public.referral_candidate_links l join public.referrals r on r.id = l.referral_id
    where l.candidate_id = c.id and r.job_id = j.id
      and r.status not in ('declined', 'withdrawn', 'rejected', 'cancelled')
  ) then
    raise exception 'duplicate_referral' using errcode = '23505';
  end if;

  v_label := concat_ws(' · ',
    coalesce(case when 'headline' = any(p_fields) then c.headline end, initcap(coalesce(c.seniority::text, '')) || ' candidate'),
    case when 'location' = any(p_fields) then nullif(concat_ws(', ', c.location_city, c.location_region), '') end);

  insert into public.referrals (job_id, source_org_id, source_user_id, target_org_id, idempotency_key,
                                job_title_snapshot, candidate_label)
  values (j.id, c.organization_id, auth.uid(), j.organization_id, p_idempotency_key, j.title, left(v_label, 200))
  returning id into v_ref;

  insert into public.referral_candidate_links (referral_id, candidate_id, organization_id, consent_id)
  values (v_ref, c.id, c.organization_id, k.id);

  insert into public.referral_shared_profiles (referral_id, disclosed_fields, snapshot)
  values (v_ref, p_fields, app.build_shared_snapshot(c.id, p_fields));

  foreach v_grant in array coalesce(p_document_ids, '{}') loop
    select * into v_doc from public.candidate_documents
     where id = v_grant and candidate_id = c.id and deleted_at is null and scan_status = 'clean';
    if not found then raise exception 'document_not_shareable' using errcode = 'P0001'; end if;
    with g as (
      insert into public.referral_document_grants (referral_id, file_name, mime_type, size_bytes)
      values (v_ref, v_doc.file_name, v_doc.mime_type, v_doc.size_bytes) returning id
    )
    insert into public.referral_document_sources (grant_id, candidate_document_id, organization_id)
    select g.id, v_doc.id, c.organization_id from g;
  end loop;
  if coalesce(cardinality(p_document_ids), 0) > 0 then
    perform app.enqueue('referral.copy_documents', v_ref::text, jsonb_build_object('referral_id', v_ref));
  end if;

  insert into public.referral_status_events (referral_id, from_status, to_status, actor_id, actor_side, reason)
  values (v_ref, null, 'submitted', auth.uid(), 'source', left(p_note, 2000));

  if p_note is not null and btrim(p_note) <> '' then
    insert into public.referral_messages (referral_id, author_id, author_side, body)
    values (v_ref, auth.uid(), 'source', left(p_note, 4000));
  end if;

  perform app.notify_org(j.organization_id, 'referral.received', 'New candidate submission',
    'A partner recruiter submitted a candidate for ' || j.title, '/referrals/' || v_ref);
  perform app.audit(c.organization_id, 'referral.submitted', 'referral', v_ref,
    jsonb_build_object('fields', to_jsonb(p_fields), 'documents', coalesce(cardinality(p_document_ids), 0)));
  perform app.audit(j.organization_id, 'referral.received', 'referral', v_ref, '{}');
  return v_ref;
end $$;

-- ---------------------------------------------------------------------------
-- Transition
-- ---------------------------------------------------------------------------
create or replace function public.transition_referral(
  p_referral uuid, p_to public.referral_status, p_reason text, p_expected_version integer
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  t public.referral_transitions;
  v_side public.referral_side;
  v_other uuid;
begin
  select * into r from public.referrals where id = p_referral for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_side := app.referral_side(p_referral);
  if v_side is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.version <> p_expected_version then
    raise exception 'stale_version' using errcode = 'P0001';
  end if;

  select * into t from public.referral_transitions
   where from_status = r.status and to_status = p_to and actor_side = v_side;
  if not found then
    raise exception 'invalid_transition: % -> % by %', r.status, p_to, v_side using errcode = 'P0001';
  end if;
  if t.requires_reason and coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if t.requires_active_agreement and not exists (
    select 1 from public.collaboration_agreements a where a.referral_id = r.id and a.status = 'active'
  ) then
    raise exception 'agreement_required' using errcode = 'P0001';
  end if;

  update public.referrals
     set status = p_to, version = version + 1,
         decided_at = case when p_to in ('accepted', 'declined') then now() else decided_at end
   where id = r.id;

  insert into public.referral_status_events (referral_id, from_status, to_status, actor_id, actor_side, reason)
  values (r.id, r.status, p_to, auth.uid(), v_side, left(p_reason, 2000));

  -- Accepting creates the collaboration agreement from the current default commission rule.
  if p_to = 'accepted' then
    perform app.create_agreement_for_referral(r.id);
  end if;

  v_other := case when v_side = 'source' then r.target_org_id else r.source_org_id end;
  perform app.notify_org(v_other, 'referral.status', 'Referral update: ' || replace(p_to::text, '_', ' '),
    r.job_title_snapshot || ' — ' || r.candidate_label, '/referrals/' || r.id);
  perform app.audit(case when v_side = 'source' then r.source_org_id else r.target_org_id end,
    'referral.transition', 'referral', r.id, jsonb_build_object('from', r.status, 'to', p_to));
  return r.version + 1;
end $$;

-- Revoking a job-sharing authorization immediately cuts the target's access to snapshot & documents.
create or replace function app.on_sharing_consent_revoked() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ref record;
begin
  if new.kind = 'job_sharing' and new.revoked_at is not null and old.revoked_at is null then
    for v_ref in
      select r.id, r.target_org_id, r.job_title_snapshot from public.referral_candidate_links l
      join public.referrals r on r.id = l.referral_id
      where l.consent_id = new.id and r.sharing_revoked_at is null
    loop
      update public.referrals set sharing_revoked_at = now(), version = version + 1 where id = v_ref.id;
      update public.referral_document_grants set revoked_at = now() where referral_id = v_ref.id and revoked_at is null;
      perform app.enqueue('referral.purge_documents', v_ref.id::text, jsonb_build_object('referral_id', v_ref.id));
      perform app.notify_org(v_ref.target_org_id, 'referral.sharing_revoked', 'Candidate sharing authorization revoked',
        'Access to the shared profile for ' || v_ref.job_title_snapshot || ' has been removed.', '/referrals/' || v_ref.id);
      perform app.audit(new.organization_id, 'referral.sharing_revoked', 'referral', v_ref.id, '{}');
    end loop;
  end if;
  return new;
end $$;
create trigger candidate_consents_revoke_sharing after update of revoked_at on public.candidate_consents
  for each row execute function app.on_sharing_consent_revoked();

-- Worker callback after copying a granted document into the referral bucket.
create or replace function public.mark_grant_copied(p_grant uuid, p_path text, p_ok boolean)
returns void
language sql security definer set search_path = '' as $$
  update public.referral_document_grants
     set storage_path = case when p_ok then p_path end,
         status = case when p_ok then 'available' else 'failed' end
   where id = p_grant and revoked_at is null;
$$;
revoke execute on function public.mark_grant_copied(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.mark_grant_copied(uuid, text, boolean) to service_role;

revoke execute on function public.submit_referral(uuid, uuid, text[], uuid[], uuid, text, text) from public, anon;
revoke execute on function public.transition_referral(uuid, public.referral_status, text, integer) from public, anon;
grant execute on function public.submit_referral(uuid, uuid, text[], uuid[], uuid, text, text) to authenticated;
grant execute on function public.transition_referral(uuid, public.referral_status, text, integer) to authenticated;
