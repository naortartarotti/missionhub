-- N3 drop 2 (docs/specs/referral-claims-two-sided-hire/backend.md v2): schema for hire reports, answers,
-- authorization checks and the N7 delivery-record contract. Every table is closed (`app`, no grants): members
-- read and write only through SECURITY DEFINER RPCs, which shape each side's view (BR-19, BR-25).
--
--   app.hire_reports            A's hire report and its lifecycle (BR-6, BR-17 to BR-29)
--   app.hire_report_items       dated evidence items of the report, the rebuttal (BR-18, BR-26)
--   app.hire_evidence_files     files for hire reports, contests, rebuttals and RD-029 checks: the N1 pipeline
--                               generalized (own bucket `hire-evidence`, same scan and SHA-256 rules)
--   app.auth_check_requests     the hiring side's request for an authorization check inside a dispute (BR-37)
--   app.authorization_checks    RD-029 checks opened by a platform admin (BR-37)
--   app.email_deliveries        N7 data contract: per-recipient delivery / bounce records (BR-29, PD-070)
--   public.disputes             + kind `hire_report`, `hire_report_id`, hire outcomes and admin fields (BR-25, BR-28)
--   candidate_consents          + disputed_at (BR-37)

-- ---------------------------------------------------------------------------
-- 1. Hire reports
-- ---------------------------------------------------------------------------
create table app.hire_reports (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals (id) on delete restrict,
  source_org_id uuid not null references public.organizations (id),
  target_org_id uuid not null references public.organizations (id),
  filed_by uuid not null references auth.users (id),
  filed_at timestamptz not null default now(),
  status text not null default 'awaiting_answer' check (status in ('awaiting_answer', 'unanswered', 'contested', 'in_review',
    'confirmed', 'closed_by_record', 'deemed_confirmed', 'upheld', 'rejected', 'void')),
  employer_text text not null check (char_length(employer_text) between 1 and 200),
  start_month date not null check (extract(day from start_month) = 1),
  role_text text check (role_text is null or char_length(role_text) between 1 and 120),
  learned_via text not null check (learned_via in ('candidate', 'profile', 'announcement', 'contact', 'other')),
  statement text not null check (char_length(statement) between 20 and 2000),
  tail_statement boolean not null default false,
  attested_at timestamptz not null,
  answer_due_at timestamptz not null,
  reminded_d5_at timestamptz,
  reminded_d8_at timestamptz,
  -- Contest (BR-25)
  contest_reason text check (contest_reason in ('not_hired', 'outside_window', 'different_person', 'not_this_client')),
  contest_statement text check (contest_statement is null or char_length(contest_statement) between 20 and 2000),
  contest_offer_accepted_on date,
  contest_process_started_on date,
  contested_by uuid references auth.users (id),
  contested_at timestamptz,
  contest_attested_at timestamptz,
  rebuttal_due_at timestamptz,
  -- Rebuttal (BR-26)
  rebuttal_statement text check (rebuttal_statement is null or char_length(rebuttal_statement) between 20 and 2000),
  rebuttal_by uuid references auth.users (id),
  rebuttal_at timestamptz,
  -- Admin (BR-27, BR-28)
  decide_by timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id),
  resolution text check (resolution is null or char_length(resolution) between 20 and 2000),
  finding text check (finding in ('not_hired', 'outside_window', 'different_person', 'not_this_client')),
  candidate_contacts smallint not null default 0 check (candidate_contacts between 0 and 5),
  client_confirmation text not null default 'not_requested'
    check (client_confirmation in ('not_requested', 'requested', 'provided', 'refused')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 2000),
  dispute_id uuid,
  placement_id uuid references public.placements (id),
  check ((contest_reason = 'outside_window') = (contest_offer_accepted_on is not null and contest_process_started_on is not null)
         or contest_reason is null),
  check (contest_process_started_on is null or contest_process_started_on <= contest_offer_accepted_on),
  check ((status = 'rejected') = (finding is not null))
);
-- One pending report per referral (BR-17).
create unique index hire_reports_one_pending on app.hire_reports (referral_id)
  where status in ('awaiting_answer', 'unanswered', 'contested', 'in_review');
create index hire_reports_source_idx on app.hire_reports (source_org_id, filed_at desc);
create index hire_reports_target_idx on app.hire_reports (target_org_id, status);
create index hire_reports_status_idx on app.hire_reports (status, answer_due_at);

create table app.hire_report_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references app.hire_reports (id) on delete cascade,
  part text not null check (part in ('report', 'rebuttal')),
  position smallint not null check (position between 1 and 5),
  type text not null check (type in ('candidate_message', 'company_announcement', 'profile_change', 'third_party', 'other')),
  item_date date not null,
  captured_on date,
  url text check (url is null or (url ~ '^https://' and char_length(url) <= 2000)),
  backs_tail boolean not null default false,
  check (captured_on is null or captured_on >= item_date),
  unique (report_id, part, position)
);

-- ---------------------------------------------------------------------------
-- 2. Evidence files (the N1 pipeline, generalized)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hire-evidence', 'hire-evidence', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

create table app.hire_evidence_files (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals (id) on delete cascade,
  owner_kind text not null check (owner_kind in ('hire_report', 'hire_contest', 'hire_rebuttal', 'auth_request', 'auth_evidence')),
  owner_id uuid,  -- the report / check / request once filed; null while a draft
  uploader_org_id uuid not null references public.organizations (id),
  uploaded_by uuid not null references auth.users (id),
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 160),
  mime_type text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  uploaded_at timestamptz not null,
  scan_status public.document_scan_status not null default 'pending',
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  scanned_at timestamptz,
  removed_at timestamptz
);
create index hire_evidence_files_draft_idx on app.hire_evidence_files (referral_id, owner_kind, uploader_org_id) where owner_id is null and removed_at is null;
create index hire_evidence_files_owner_idx on app.hire_evidence_files (owner_id);

-- Filed files are immutable; the hash is written once by the scan (N1 EC-4 rule).
create function app.guard_hire_evidence_file() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.id, new.referral_id, new.owner_kind, new.uploader_org_id, new.uploaded_by, new.storage_path, new.file_name, new.mime_type,
      new.size_bytes, new.uploaded_at) is distinct from
     (old.id, old.referral_id, old.owner_kind, old.uploader_org_id, old.uploaded_by, old.storage_path, old.file_name, old.mime_type,
      old.size_bytes, old.uploaded_at)
     or (old.owner_id is not null and new.owner_id is distinct from old.owner_id)
     or (old.sha256 is not null and new.sha256 is distinct from old.sha256)
     or (old.owner_id is not null and new.removed_at is distinct from old.removed_at) then
    raise exception 'immutable_record' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function app.guard_hire_evidence_file() from public, anon, authenticated;
create trigger hire_evidence_files_guard before update on app.hire_evidence_files
  for each row execute function app.guard_hire_evidence_file();
create trigger hire_evidence_files_no_delete before delete on app.hire_evidence_files
  for each row execute function app.prevent_mutation();

-- Uploads go to `hire-evidence/{uploader org}/{referral}/{uuid}.{pdf|png|jpg}`, by a member of an org that is a
-- side of the referral and sees it (record scope). The RPC that registers the file re-checks the purpose.
create function app.can_upload_hire_evidence(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid;
  v_ref uuid;
begin
  if p_name is null or p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|png|jpg)$' then return false; end if;
  v_org := split_part(p_name, '/', 1)::uuid;
  v_ref := split_part(p_name, '/', 2)::uuid;
  return app.is_member_or_settling(v_org)
     and exists (select 1 from public.referrals r where r.id = v_ref
                   and ((r.source_org_id = v_org and app.sees_referral_as_source(r.id))
                        or (r.target_org_id = v_org and app.sees_referral_as_target(r.id))));
end $$;
grant execute on function app.can_upload_hire_evidence(text) to authenticated;
create policy hire_evidence_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'hire-evidence' and app.can_upload_hire_evidence(name) and app.assert_rules_gate());
-- No select / update / delete policies: reads are 60-second signed URLs, deletion is server-side.

-- Direct uploads count where the write commits (as N1's R2-2): 30 per user per hour.
create function app.on_hire_evidence_object() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if new.bucket_id <> 'hire-evidence' then return new; end if;
  v_user := coalesce(auth.uid(), nullif(new.owner_id, '')::uuid);
  if v_user is null then return new; end if;
  if not app.consume_rate_limit_for(v_user, 'storage.hire_evidence', 30, 3600) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function app.on_hire_evidence_object() from public, anon, authenticated;
create trigger hire_evidence_upload_limit before insert on storage.objects
  for each row execute function app.on_hire_evidence_object();

-- ---------------------------------------------------------------------------
-- 3. Authorization checks (RD-029, BR-37)
-- ---------------------------------------------------------------------------
create table app.auth_check_requests (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals (id) on delete cascade,
  dispute_kind text not null check (dispute_kind in ('prior_presentation', 'hire_report')),
  dispute_ref uuid not null,  -- the claim id or the hire report id
  requested_by uuid not null references auth.users (id),
  requested_by_org uuid not null references public.organizations (id),
  reason text not null check (char_length(reason) between 20 and 2000),
  requested_at timestamptz not null default now(),
  unique (dispute_kind, dispute_ref)
);

create table app.authorization_checks (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals (id) on delete cascade,
  request_id uuid references app.auth_check_requests (id),
  requested_by_kind text not null check (requested_by_kind in ('submitter', 'candidate', 'hiring_side')),
  challenger_evidence boolean not null default false,
  recent_change_note boolean not null default false,
  opened_by uuid not null references auth.users (id),
  opened_at timestamptz not null default now(),
  evidence_due_at timestamptz,
  evidence_statement text check (evidence_statement is null or char_length(evidence_statement) between 20 and 2000),
  evidence_by uuid references auth.users (id),
  evidence_at timestamptz,
  status text not null default 'open' check (status in ('open', 'valid', 'invalid')),
  candidate_contacted boolean not null default false,
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  resolution text check (resolution is null or char_length(resolution) between 20 and 2000),
  breach_review boolean not null default false
);
create unique index authorization_checks_one_open on app.authorization_checks (referral_id) where status = 'open';

alter table public.candidate_consents add column disputed_at timestamptz;

-- ---------------------------------------------------------------------------
-- 4. N7 data contract: per-recipient email delivery records (BR-29, PD-070). Empty until N7 writes it; the
--    silence gate reads it. Service role only.
-- ---------------------------------------------------------------------------
create table app.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_kind text not null,
  entity_type text not null,
  entity_id uuid not null,
  recipient_user_id uuid not null references auth.users (id),
  provider_message_id text,
  status text not null check (status in ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed')),
  status_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (provider_message_id, status)
);
create index email_deliveries_entity_idx on app.email_deliveries (entity_type, entity_id, notification_kind);

-- ---------------------------------------------------------------------------
-- 5. Disputes: a referral-level kind for contested hire reports (BR-25)
-- ---------------------------------------------------------------------------
alter table public.disputes add column hire_report_id uuid references app.hire_reports (id) on delete restrict;
alter table public.disputes drop constraint disputes_kind_check;
alter table public.disputes add constraint disputes_kind_check check (kind in ('placement', 'prior_presentation', 'hire_report'));
alter table public.disputes drop constraint disputes_outcome_check;
alter table public.disputes add constraint disputes_outcome_check check (outcome in ('claim_upheld', 'claim_rejected',
  'hire_upheld', 'hire_rejected', 'hire_void', 'hire_closed_by_record'));
alter table public.disputes drop constraint disputes_target;
alter table public.disputes add constraint disputes_target check (
  (kind = 'placement' and placement_id is not null and referral_id is null and claim_id is null and hire_report_id is null)
  or (kind = 'prior_presentation' and placement_id is null and referral_id is not null and claim_id is not null and hire_report_id is null)
  or (kind = 'hire_report' and placement_id is null and referral_id is not null and claim_id is null and hire_report_id is not null));
alter table app.hire_reports add constraint hire_reports_dispute_fk foreign key (dispute_id) references public.disputes (id);

-- disputes_select (live, N10 20261116001400): hire_report disputes are read by platform admins only; each side
-- reads its own view through get_hire_reports.
drop policy disputes_select on public.disputes;
create policy disputes_select on public.disputes for select to authenticated using (
  (kind = 'placement' and app.can_see_placement(placement_id))
  or (kind = 'prior_presentation' and (app.is_platform_admin() or (app.is_member_or_settling(opened_by_org) and app.can_see_referral(referral_id))))
  or (kind = 'hire_report' and app.is_platform_admin()));  -- N3

-- ---------------------------------------------------------------------------
-- 6. Closed tables: RLS on, no grants; N10's rules gate on every table member or admin RPCs write.
-- ---------------------------------------------------------------------------
alter table app.hire_reports enable row level security;
alter table app.hire_report_items enable row level security;
alter table app.hire_evidence_files enable row level security;
alter table app.auth_check_requests enable row level security;
alter table app.authorization_checks enable row level security;
alter table app.email_deliveries enable row level security;
revoke all on app.hire_reports, app.hire_report_items, app.hire_evidence_files, app.auth_check_requests,
  app.authorization_checks, app.email_deliveries from public, anon, authenticated;
select app.attach_rules_gate('app.hire_reports'::regclass);
select app.attach_rules_gate('app.hire_report_items'::regclass);
select app.attach_rules_gate('app.hire_evidence_files'::regclass);
select app.attach_rules_gate('app.auth_check_requests'::regclass);
select app.attach_rules_gate('app.authorization_checks'::regclass);
