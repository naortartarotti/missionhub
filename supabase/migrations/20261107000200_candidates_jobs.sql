-- Private candidate inventory and jobs. Both are strictly tenant-scoped.

create type public.candidate_status as enum ('draft', 'active_for_matching', 'unavailable', 'archived', 'deleted');
create type public.job_status as enum ('draft', 'active', 'paused', 'closed', 'filled', 'cancelled');
create type public.work_arrangement as enum ('remote', 'hybrid', 'onsite');
create type public.seniority_level as enum ('intern', 'junior', 'mid', 'senior', 'lead', 'principal', 'executive');
create type public.legal_basis as enum ('consent', 'contract', 'legitimate_interest', 'other_documented');
create type public.consent_kind as enum ('processing', 'job_sharing');
create type public.document_scan_status as enum ('pending', 'clean', 'rejected');
create type public.contract_type as enum ('permanent', 'contract', 'temporary', 'contract_to_hire');

-- Normalize a skill list: lowercase, trimmed, de-duplicated, empties removed.
create or replace function app.normalize_tags(p text[]) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct t order by t), '{}')
  from (select lower(btrim(x)) as t from unnest(coalesce(p, '{}')) x) s
  where t <> '';
$$;

-- ---------------------------------------------------------------------------
-- Candidates
-- ---------------------------------------------------------------------------
create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  owner_id uuid not null references auth.users (id),
  status public.candidate_status not null default 'draft',
  full_name text not null check (char_length(full_name) between 1 and 160),
  email extensions.citext,
  phone text check (char_length(phone) <= 40),
  headline text check (char_length(headline) <= 200),
  summary text check (char_length(summary) <= 5000),
  location_city text,
  location_region text,
  location_country char(2),
  open_to_relocation boolean not null default false,
  work_arrangements public.work_arrangement[] not null default '{}',
  seniority public.seniority_level,
  years_experience numeric(4,1) check (years_experience between 0 and 70),
  skills text[] not null default '{}',
  languages text[] not null default '{}',
  tags text[] not null default '{}',
  salary_expectation_min bigint check (salary_expectation_min >= 0),
  salary_expectation_max bigint check (salary_expectation_max >= 0),
  salary_currency char(3) check (salary_currency ~ '^[A-Z]{3}$'),
  available_from date,
  notes text check (char_length(notes) <= 10000),
  -- Provenance & privacy
  source text not null default 'manual' check (source in ('manual', 'csv_import', 'resume_upload', 'referral', 'other')),
  source_detail text,
  processing_purpose text not null default 'Recruitment and placement services',
  legal_basis public.legal_basis not null default 'consent',
  privacy_notice_given_at timestamptz,
  last_reviewed_at timestamptz,
  retention_until date,
  anonymized_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint candidates_salary_range check (
    salary_expectation_min is null or salary_expectation_max is null or salary_expectation_min <= salary_expectation_max
  )
);
create index candidates_org_status_idx on public.candidates (organization_id, status, updated_at desc);
create index candidates_org_owner_idx on public.candidates (organization_id, owner_id);
create index candidates_skills_idx on public.candidates using gin (skills);
create index candidates_org_email_idx on public.candidates (organization_id, email) where email is not null;
create trigger candidates_updated_at before update on public.candidates
  for each row execute function app.set_updated_at();

create or replace function app.candidates_normalize() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.skills := app.normalize_tags(new.skills);
  new.languages := app.normalize_tags(new.languages);
  new.tags := app.normalize_tags(new.tags);
  new.location_country := upper(new.location_country);
  return new;
end $$;
create trigger candidates_normalize before insert or update on public.candidates
  for each row execute function app.candidates_normalize();

create table public.candidate_experiences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  title text not null,
  company text,
  start_date date,
  end_date date,
  description text check (char_length(description) <= 4000),
  created_at timestamptz not null default now()
);
create index candidate_experiences_candidate_idx on public.candidate_experiences (candidate_id);

create table public.candidate_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  sha256 text not null,
  scan_status public.document_scan_status not null default 'pending',
  extracted_text text,
  uploaded_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index candidate_documents_candidate_idx on public.candidate_documents (candidate_id);

-- Processing and job-specific sharing authorizations. Never deleted; revoked instead.
create table public.candidate_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  kind public.consent_kind not null,
  legal_basis public.legal_basis not null default 'consent',
  job_id uuid, -- set for job_sharing; FK added below (jobs belong to another tenant)
  scope text not null check (char_length(scope) <= 1000),
  evidence text not null check (char_length(evidence) between 5 and 2000),
  obtained_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  recorded_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint consent_job_required check (kind <> 'job_sharing' or job_id is not null)
);
create index candidate_consents_candidate_idx on public.candidate_consents (candidate_id, kind) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  owner_id uuid not null references auth.users (id),
  status public.job_status not null default 'draft',
  title text not null check (char_length(title) between 2 and 160),
  client_name text check (char_length(client_name) <= 160),
  client_confidential boolean not null default true,
  description text not null default '' check (char_length(description) <= 20000),
  required_skills text[] not null default '{}',
  preferred_skills text[] not null default '{}',
  location_city text,
  location_region text,
  location_country char(2),
  work_arrangement public.work_arrangement not null default 'hybrid',
  seniority public.seniority_level,
  min_years_experience numeric(4,1) check (min_years_experience between 0 and 70),
  languages text[] not null default '{}',
  contract_type public.contract_type not null default 'permanent',
  salary_min bigint check (salary_min >= 0),
  salary_max bigint check (salary_max >= 0),
  salary_currency char(3) not null default 'CAD' check (salary_currency ~ '^[A-Z]{3}$'),
  expected_fee_minor bigint check (expected_fee_minor >= 0),
  fee_currency char(3) not null default 'CAD' check (fee_currency ~ '^[A-Z]{3}$'),
  accepts_external_referrals boolean not null default false,
  -- What other organizations may see BEFORE a referral. Title, seniority, arrangement & skills always shown.
  share_description boolean not null default true,
  share_salary boolean not null default false,
  share_location boolean not null default true,
  share_fee boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_salary_range check (salary_min is null or salary_max is null or salary_min <= salary_max)
);
create index jobs_org_status_idx on public.jobs (organization_id, status, updated_at desc);
create index jobs_marketplace_idx on public.jobs (status, accepts_external_referrals) where status = 'active';
create index jobs_required_skills_idx on public.jobs using gin (required_skills);
create trigger jobs_updated_at before update on public.jobs
  for each row execute function app.set_updated_at();

create or replace function app.jobs_normalize() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.required_skills := app.normalize_tags(new.required_skills);
  new.preferred_skills := app.normalize_tags(new.preferred_skills);
  new.languages := app.normalize_tags(new.languages);
  new.location_country := upper(new.location_country);
  return new;
end $$;
create trigger jobs_normalize before insert or update on public.jobs
  for each row execute function app.jobs_normalize();

alter table public.candidate_consents
  add constraint candidate_consents_job_fk foreign key (job_id) references public.jobs (id) on delete restrict;

-- ---------------------------------------------------------------------------
-- Tenant-consistency guards: child rows must belong to the parent's org; owners must be members.
-- ---------------------------------------------------------------------------
create or replace function app.guard_candidate_child() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.candidates c where c.id = new.candidate_id and c.organization_id = new.organization_id) then
    raise exception 'tenant_mismatch' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger candidate_experiences_guard before insert or update on public.candidate_experiences
  for each row execute function app.guard_candidate_child();
create trigger candidate_documents_guard before insert or update on public.candidate_documents
  for each row execute function app.guard_candidate_child();
create trigger candidate_consents_guard before insert or update on public.candidate_consents
  for each row execute function app.guard_candidate_child();

create or replace function app.guard_owner_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = new.organization_id and m.user_id = new.owner_id and m.status = 'active'
  ) then
    raise exception 'owner_not_member' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger candidates_owner_guard before insert or update of owner_id, organization_id on public.candidates
  for each row execute function app.guard_owner_membership();
create trigger jobs_owner_guard before insert or update of owner_id, organization_id on public.jobs
  for each row execute function app.guard_owner_membership();

-- organization_id is immutable on tenant rows.
create or replace function app.guard_org_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger candidates_org_immutable before update on public.candidates
  for each row execute function app.guard_org_immutable();
create trigger jobs_org_immutable before update on public.jobs
  for each row execute function app.guard_org_immutable();

-- Consents: evidence fields are immutable; only revocation may be recorded.
create or replace function app.guard_consent_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.revoked_at is not null then
    raise exception 'consent already revoked' using errcode = 'P0001';
  end if;
  if (new.kind, new.legal_basis, new.job_id, new.scope, new.evidence, new.obtained_at, new.candidate_id, new.recorded_by)
     is distinct from
     (old.kind, old.legal_basis, old.job_id, old.scope, old.evidence, old.obtained_at, old.candidate_id, old.recorded_by) then
    raise exception 'consent evidence is immutable; revoke and record a new authorization' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger candidate_consents_guard_update before update on public.candidate_consents
  for each row execute function app.guard_consent_update();
create trigger candidate_consents_no_delete before delete on public.candidate_consents
  for each row execute function app.prevent_mutation();

-- ---------------------------------------------------------------------------
-- RLS: only members of the owning organization. No cross-tenant policy exists on these tables.
-- ---------------------------------------------------------------------------
alter table public.candidates enable row level security;
alter table public.candidate_experiences enable row level security;
alter table public.candidate_documents enable row level security;
alter table public.candidate_consents enable row level security;
alter table public.jobs enable row level security;

create policy candidates_select on public.candidates for select to authenticated
  using (app.is_member(organization_id) and status <> 'deleted');
create policy candidates_insert on public.candidates for insert to authenticated
  with check (app.is_member(organization_id) and created_by = auth.uid());
create policy candidates_update on public.candidates for update to authenticated
  using (app.is_member(organization_id)) with check (app.is_member(organization_id));

create policy candidate_experiences_all on public.candidate_experiences for all to authenticated
  using (app.is_member(organization_id)) with check (app.is_member(organization_id));

create policy candidate_documents_select on public.candidate_documents for select to authenticated
  using (app.is_member(organization_id) and deleted_at is null);
create policy candidate_documents_insert on public.candidate_documents for insert to authenticated
  with check (app.is_member(organization_id) and uploaded_by = auth.uid());
create policy candidate_documents_update on public.candidate_documents for update to authenticated
  using (app.is_member(organization_id)) with check (app.is_member(organization_id));

create policy candidate_consents_select on public.candidate_consents for select to authenticated
  using (app.is_member(organization_id));
create policy candidate_consents_insert on public.candidate_consents for insert to authenticated
  with check (app.is_member(organization_id) and recorded_by = auth.uid());
create policy candidate_consents_update on public.candidate_consents for update to authenticated
  using (app.is_member(organization_id)) with check (app.is_member(organization_id));

create policy jobs_select on public.jobs for select to authenticated
  using (app.is_member(organization_id));
create policy jobs_insert on public.jobs for insert to authenticated
  with check (app.is_member(organization_id) and created_by = auth.uid());
create policy jobs_update on public.jobs for update to authenticated
  using (app.is_member(organization_id)) with check (app.is_member(organization_id));

-- Hard deletes are not exposed; status transitions + privacy workflow handle removal.
revoke delete on public.candidates, public.jobs, public.candidate_documents from authenticated, anon;
-- Scanner-owned columns cannot be set by end users.
revoke update on public.candidate_documents from authenticated;
grant update (deleted_at) on public.candidate_documents to authenticated;

-- ---------------------------------------------------------------------------
-- Privacy requests from data subjects (candidates are not users).
-- ---------------------------------------------------------------------------
create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  candidate_id uuid references public.candidates (id) on delete set null,
  kind text not null check (kind in ('access', 'correction', 'withdrawal', 'deletion')),
  requester_contact text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed', 'rejected')),
  due_at timestamptz not null default now() + interval '30 days',
  resolution text,
  handled_by uuid references auth.users (id),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger privacy_requests_updated_at before update on public.privacy_requests
  for each row execute function app.set_updated_at();
alter table public.privacy_requests enable row level security;
create policy privacy_requests_rw on public.privacy_requests for all to authenticated
  using (app.has_role(organization_id, array['org_admin','recruiter_manager']::public.membership_role[]))
  with check (app.has_role(organization_id, array['org_admin','recruiter_manager']::public.membership_role[]));

-- Anonymize a candidate (deletion request). Irreversible; keeps referential/financial history intact.
create or replace function public.anonymize_candidate(p_candidate uuid, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.candidates where id = p_candidate;
  if v_org is null or not app.has_role(v_org, array['org_admin','recruiter_manager']::public.membership_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.candidates set
    full_name = 'Anonymized candidate', email = null, phone = null, headline = null, summary = null,
    notes = null, location_city = null, tags = '{}', status = 'deleted', anonymized_at = now()
  where id = p_candidate;
  delete from public.candidate_experiences where candidate_id = p_candidate;
  update public.candidate_documents set deleted_at = now(), extracted_text = null where candidate_id = p_candidate;
  update public.candidate_consents set revoked_at = now(), revoked_reason = 'candidate anonymized'
   where candidate_id = p_candidate and revoked_at is null;
  perform app.audit(v_org, 'candidate.anonymized', 'candidate', p_candidate, jsonb_build_object('reason', left(p_reason, 200)));
end $$;
revoke execute on function public.anonymize_candidate(uuid, text) from public, anon;
grant execute on function public.anonymize_candidate(uuid, text) to authenticated;
