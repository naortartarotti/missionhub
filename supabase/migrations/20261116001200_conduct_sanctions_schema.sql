-- N10 part 3 of 8: conduct cases, sanctions, org state helpers (BR-12, BR-18, BR-26, BR-33, BR-37).
--
-- Storage (EC-3, N10-D14): every conduct table lives in the closed `app` schema (not exposed by
-- PostgREST), with RLS enabled, no policies and no grants. Members reach shaped views only through
-- SECURITY DEFINER RPCs (parts 5 and 6). There is never a public.disputes row for a conduct case, so
-- no existing "open dispute" check (disputes_open_guard, the one-open-dispute index, release_allowed,
-- contest eligibility, metrics, N3) can see one (BR-19 by construction).
--
-- Sanctions (BR-26): app.org_sanctions is the record. organizations.suspended_at / terminated_at are
-- the denormalized effects the existing checks read; only the sanction RPCs (part 6) change them.
-- Termination also sets suspended_at, so every existing "suspended" check covers it.

alter table public.organizations add column terminated_at timestamptz;
-- (Column-level UPDATE grants on organizations stay name, locale, kind, default_currency, country:
--  terminated_at is never client-writable.)

-- ---------------------------------------------------------------------------
-- Conduct cases
-- ---------------------------------------------------------------------------
create or replace function app.conduct_categories() returns text[]
language sql immutable set search_path = '' as $$
  select array['went_around', 'misused', 'shared_outside', 'hire_payout', 'false_info', 'job_terms',
               'discrimination', 'retaliation', 'other'];
$$;

create table app.conduct_cases (
  id uuid primary key default gen_random_uuid(),
  reported_org_id uuid not null references public.organizations (id),
  source text not null check (source in ('referral', 'job', 'admin')),
  reporter_org_id uuid references public.organizations (id),
  reporter_user_id uuid references auth.users (id) on delete set null,
  reporter_side text check (reporter_side in ('source', 'target', 'job')),
  referral_id uuid references public.referrals (id),
  job_id uuid references public.jobs (id),
  admin_source text check (admin_source in ('confirmation_invalid', 'objection_fabricated', 'other')),
  opened_by_admin uuid references auth.users (id),
  category text not null check (category = any (app.conduct_categories())),
  admin_category text check (admin_category is null or admin_category = any (app.conduct_categories())),
  description text not null check (char_length(description) between 20 and 4000),
  occurred_on date,
  occurred_approx boolean not null default false,
  good_faith_at timestamptz,
  status text not null default 'new' check (status in ('new', 'info_requested', 'notice_sent', 'decided', 'closed')),
  first_response_due_at timestamptz not null,
  first_response_at timestamptz,
  closed_reason_code text check (closed_reason_code in ('no_rule', 'amount', 'duplicate', 'other')),
  closed_reason text check (closed_reason is null or char_length(closed_reason) between 20 and 1000),
  closed_at timestamptz,
  closed_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  check (source = 'admin' or (reporter_org_id is not null and good_faith_at is not null and reporter_side is not null)),
  check (source <> 'admin' or (reporter_org_id is null and opened_by_admin is not null and admin_source is not null)),
  check (source <> 'referral' or referral_id is not null),
  check (source <> 'job' or job_id is not null),
  check (reporter_org_id is null or reporter_org_id <> reported_org_id)
);
create index conduct_cases_reported on app.conduct_cases (reported_org_id, created_at desc);
create index conduct_cases_reporter on app.conduct_cases (reporter_org_id, created_at desc);
create index conduct_cases_reporter_user on app.conduct_cases (reporter_user_id, created_at desc);

-- Reporter thread: admin questions to the reporter and the reporter's one reply per question.
create table app.conduct_messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references app.conduct_cases (id) on delete cascade,
  kind text not null check (kind in ('question', 'reply')),
  parent_id uuid references app.conduct_messages (id),
  body text not null check (char_length(body) between 20 and 4000),
  due_at timestamptz,
  author_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((kind = 'reply') = (parent_id is not null)),
  check (kind = 'question' or due_at is null)
);
create unique index conduct_messages_one_reply on app.conduct_messages (parent_id) where kind = 'reply';

create table app.conduct_notices (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references app.conduct_cases (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  kind text not null check (kind in ('standard', 'immediate_hold')),
  language text not null check (language in ('en', 'fr-CA', 'pt-BR')),
  rules_version_id uuid not null references public.network_rules_versions (id),
  rules_cited text[] not null check (cardinality(rules_cited) between 1 and 40),
  conduct_date date not null,
  allegation text not null check (char_length(allegation) between 20 and 4000),
  alleged_when text not null check (char_length(alleged_when) between 3 and 200),
  evidence_summary text not null check (char_length(evidence_summary) between 20 and 4000),
  name_reporter boolean not null default false,
  reporter_org_name text,
  -- RD-049 / AC-133: the fixed possible-outcomes line, copied by the server in the notice language.
  outcomes_line text,
  has_outcomes_line boolean not null default false,
  immediate_ground text check (immediate_ground in ('2.3', '4.8')),
  sent_by uuid not null references auth.users (id),
  sent_at timestamptz not null default now(),
  response_due_at timestamptz not null,
  check ((kind = 'immediate_hold') = (immediate_ground is not null)),
  check (has_outcomes_line = (outcomes_line is not null))
);
create index conduct_notices_case on app.conduct_notices (case_id, sent_at);

create table app.conduct_responses (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null unique references app.conduct_notices (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  author_id uuid references auth.users (id) on delete set null,
  body text not null check (char_length(body) between 20 and 8000),
  submitted_at timestamptz not null default now()
);

create table app.conduct_followups (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references app.conduct_notices (id) on delete cascade,
  question text not null check (char_length(question) between 20 and 2000),
  due_at timestamptz,
  asked_by uuid not null references auth.users (id),
  asked_at timestamptz not null default now(),
  reply_body text check (reply_body is null or char_length(reply_body) between 20 and 4000),
  reply_by uuid references auth.users (id) on delete set null,
  replied_at timestamptz
);

create table app.conduct_decisions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references app.conduct_cases (id) on delete cascade,
  notice_id uuid not null references app.conduct_notices (id),
  organization_id uuid not null references public.organizations (id),
  outcome text not null check (outcome in ('no_breach', 'insufficient_evidence', 'breach')),
  finding text check (finding is null or char_length(finding) between 50 and 8000),
  rules_cited text[] not null default '{}',
  residual_test boolean not null default false,
  level text check (level in ('warning', 'network_hold', 'suspension', 'termination')),
  why_not_hold text check (why_not_hold is null or char_length(why_not_hold) between 20 and 2000),
  planned_review_on date,
  decided_by uuid not null references auth.users (id),
  decided_at timestamptz not null default now(),
  -- BR-31: set for every "breach found" decision (with or without a level), else null.
  review_request_due_at timestamptz,
  overturned_at timestamptz,
  check (outcome = 'breach' or (level is null and finding is null)),
  check (outcome <> 'breach' or (finding is not null and cardinality(rules_cited) >= 1)),
  check (level is null or level not in ('suspension', 'termination') or why_not_hold is not null)
);
create index conduct_decisions_org on app.conduct_decisions (organization_id, decided_at desc);

create table app.org_sanctions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  case_id uuid not null references app.conduct_cases (id),
  decision_id uuid references app.conduct_decisions (id),
  notice_id uuid references app.conduct_notices (id),
  level text not null check (level in ('warning', 'network_hold', 'suspension', 'termination')),
  immediate_ground text check (immediate_ground in ('2.3', '4.8')),
  why_not_hold text,
  planned_review_on date,
  applied_by uuid not null references auth.users (id),
  applied_at timestamptz not null default now(),
  expires_at timestamptz,
  ended_at timestamptz,
  end_reason text check (end_reason in ('lifted', 'reduced', 'overturned', 'superseded')),
  ended_by uuid references auth.users (id),
  end_note text,
  supersedes_id uuid references app.org_sanctions (id),
  check (immediate_ground is null or level = 'network_hold'),
  check (level <> 'warning' or expires_at is not null),
  check ((ended_at is null) = (end_reason is null))
);
create index org_sanctions_org on app.org_sanctions (organization_id, applied_at desc);
create index org_sanctions_active on app.org_sanctions (organization_id, level) where ended_at is null;

create table app.sanction_reviews (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null unique references app.conduct_decisions (id),
  organization_id uuid not null references public.organizations (id),
  requested_by uuid references auth.users (id) on delete set null,
  request_text text not null check (char_length(request_text) between 20 and 8000),
  requested_at timestamptz not null default now(),
  reviewer_id uuid references auth.users (id),
  outcome text check (outcome in ('confirm', 'reduce', 'overturn')),
  new_level text check (new_level in ('warning', 'network_hold', 'suspension', 'none')),
  reason text check (reason is null or char_length(reason) between 50 and 8000),
  decided_at timestamptz,
  check ((outcome is null) = (decided_at is null))
);

-- Evidence files (report, reporter replies, responses, follow-up replies, review requests, admin).
create table app.conduct_files (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references app.conduct_cases (id),
  purpose text check (purpose in ('report', 'reporter_reply', 'response', 'followup_reply', 'review_request', 'admin')),
  owner_ref uuid,
  organization_id uuid references public.organizations (id),
  uploaded_by uuid not null references auth.users (id),
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 160),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  uploaded_at timestamptz not null,
  scan_status public.document_scan_status not null default 'pending',
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  scanned_at timestamptz,
  attached_at timestamptz,
  removed_at timestamptz,
  check ((attached_at is null) = (case_id is null))
);
create index conduct_files_draft on app.conduct_files (uploaded_by) where attached_at is null and removed_at is null;
create index conduct_files_case on app.conduct_files (case_id);

-- 2.3 data-incident notices (RD-045) and their recipients.
create table app.conduct_incident_notices (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references app.conduct_cases (id),
  decision_id uuid not null references app.conduct_decisions (id),
  language text not null check (language in ('en', 'fr-CA', 'pt-BR')),
  referral_ids uuid[] not null check (cardinality(referral_ids) between 1 and 50),
  information text not null check (char_length(information) between 20 and 2000),
  occurred text not null check (char_length(occurred) between 3 and 200),
  to_whom text check (to_whom is null or char_length(to_whom) <= 500),
  sent_by uuid not null references auth.users (id),
  sent_at timestamptz not null default now()
);
create table app.conduct_incident_recipients (
  notice_id uuid not null references app.conduct_incident_notices (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  sides text[] not null,
  -- The fixed guidance line(s) for the recipient's side(s), copied at send time in the notice language.
  guidance jsonb not null,
  primary key (notice_id, organization_id)
);
create index conduct_incident_recipients_org on app.conduct_incident_recipients (organization_id);

do $$
declare t text;
begin
  foreach t in array array['app.conduct_cases', 'app.conduct_messages', 'app.conduct_notices', 'app.conduct_responses',
                           'app.conduct_followups', 'app.conduct_decisions', 'app.org_sanctions', 'app.sanction_reviews',
                           'app.conduct_files', 'app.conduct_incident_notices', 'app.conduct_incident_recipients'] loop
    execute format('alter table %s enable row level security', t);
    execute format('revoke all on %s from public, anon, authenticated', t);
    perform app.attach_rules_gate(t::regclass);
  end loop;
end $$;

-- Private bucket for conduct evidence (BR-16): PDF / PNG / JPEG, 10 MB. No select policy: only
-- platform admins read, through 60-second signed URLs issued after authorize_conduct_evidence().
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('conduct-evidence', 'conduct-evidence', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Org state (BR-12, BR-33, BR-37)
-- ---------------------------------------------------------------------------
create or replace function app.today_et() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Toronto')::date;
$$;

create or replace function app.referral_terminal(p_status public.referral_status) returns boolean
language sql immutable set search_path = '' as $$
  select p_status in ('candidate_declined', 'declined', 'withdrawn', 'hired', 'rejected', 'cancelled', 'already_presented');
$$;

-- BR-37 / N10-D33: a referral with an open obligation, on either side:
--   a non-terminal status; a placement not settled or cancelled; a settled placement still inside its
--   guarantee; or an open dispute or claim on the referral or its placement.
create or replace function app.referral_in_settlement_scope(p_referral uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.referrals r where r.id = p_referral and not app.referral_terminal(r.status))
      or exists (select 1 from public.placements p
                  where p.referral_id = p_referral
                    and (p.status not in ('settled', 'cancelled')
                         or (p.status = 'settled' and p.guarantee_until is not null and p.guarantee_until >= app.today_et())))
      or exists (select 1 from public.disputes d
                  where d.status = 'open'
                    and (d.referral_id = p_referral
                         or d.placement_id in (select p.id from public.placements p where p.referral_id = p_referral)))
      or exists (select 1 from app.referral_claims c
                  where c.referral_id = p_referral
                    and app.claim_effective_status(c.status, c.contest_deadline_at) in ('open', 'contested'));
$$;

create or replace function app.org_has_open_obligations(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.referrals r
                  where (r.source_org_id = p_org or r.target_org_id = p_org)
                    and app.referral_in_settlement_scope(r.id));
$$;

-- null: active · 'settlement': suspended, or terminated with open obligations · 'closed': terminated
-- and settled (members lose access; partners see "no longer part of", RD-048).
create or replace function app.org_settlement_state(p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when o.suspended_at is null and o.terminated_at is null then null
    when o.terminated_at is not null and not app.org_has_open_obligations(o.id) then 'closed'
    else 'settlement'
  end
  from public.organizations o where o.id = p_org;
$$;

-- Settling member: an active membership in an org in settlement mode. Used only by the referral
-- visibility helpers and the named settlement spots (part 7); app.is_member is unchanged (EC-1).
create or replace function app.user_is_settling_member(p_user uuid, p_org uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  -- Cheap membership test first: for active orgs and non-members this returns before any
  -- obligation lookup (the hot referral-visibility path, R-4).
  if p_user is null or not exists (
    select 1 from public.organization_memberships m
      join public.organizations o on o.id = m.organization_id
     where m.organization_id = p_org and m.user_id = p_user and m.status = 'active'
       and o.suspended_at is not null) then
    return false;
  end if;
  return app.org_settlement_state(p_org) = 'settlement';
end $$;

create or replace function app.user_sees_all_settling(p_user uuid, p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.user_is_settling_member(p_user, p_org) and exists (
    select 1 from public.organization_memberships m
     where m.organization_id = p_org and m.user_id = p_user and m.status = 'active'
       and m.role in ('org_admin', 'recruiter_manager'));
$$;

create or replace function app.is_settling_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.user_is_settling_member(auth.uid(), p_org);
$$;

-- Active member or settling member (evaluated in that order).
create or replace function app.is_member_or_settling(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when app.is_member(p_org) then true else app.is_settling_member(p_org) end;
$$;

create or replace function app.has_role_or_settling(p_org uuid, p_roles public.membership_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when app.has_role(p_org, p_roles) then true
    else app.is_settling_member(p_org) and exists (
      select 1 from public.organization_memberships m
       where m.organization_id = p_org and m.user_id = auth.uid() and m.status = 'active' and m.role = any (p_roles))
  end;
$$;

-- An active sanction: not ended, and (for a warning) not expired (12 months, rule 9.2).
create or replace function app.sanction_active(s app.org_sanctions) returns boolean
language sql stable set search_path = '' as $$
  select s.ended_at is null and (s.level <> 'warning' or s.expires_at > now());
$$;

-- BR-12, EC-2: the single partner-activity restriction predicate, with its precedence.
-- Never exposed to other orgs (not executable by authenticated).
create or replace function app.org_partner_restriction(p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when o.terminated_at is not null then 'terminated'
    when o.suspended_at is not null then 'suspended'
    when exists (select 1 from app.org_sanctions s
                  where s.organization_id = o.id and s.level = 'network_hold' and s.ended_at is null) then 'network_hold'
    when not app.org_accepted_required(o.id) then 'rules_not_accepted'
    -- (N5 'network_pending' extends this function; it doesn't add a second predicate.)
  end
  from public.organizations o where o.id = p_org;
$$;

-- BR-9 b: the org reason first, then the user's own acceptance state.
create or replace function app.user_partner_restriction(p_user uuid, p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    app.org_partner_restriction(p_org),
    case
      when p_user is null then null
      when app.rules_current_version() is null then null
      when not app.user_accepted_any(p_user) then 'rules_acceptance_required'
      when not app.user_accepted_required(p_user) then 'rules_not_accepted_user'
    end);
$$;

revoke execute on function app.today_et(), app.referral_terminal(public.referral_status),
  app.referral_in_settlement_scope(uuid), app.org_has_open_obligations(uuid), app.org_settlement_state(uuid),
  app.user_is_settling_member(uuid, uuid), app.user_sees_all_settling(uuid, uuid), app.sanction_active(app.org_sanctions),
  app.org_partner_restriction(uuid), app.user_partner_restriction(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function app.is_settling_member(uuid), app.is_member_or_settling(uuid),
  app.has_role_or_settling(uuid, public.membership_role[]) from public, anon;
-- RLS policies (organizations, memberships, jobs, disputes, acceptances) evaluate these as the user.
grant execute on function app.is_settling_member(uuid), app.is_member_or_settling(uuid),
  app.has_role_or_settling(uuid, public.membership_role[]) to authenticated;

-- Org acceptances: org admins (active or settling) and platform admins (BR-5, standing page).
create policy network_rules_org_acceptances_select on public.network_rules_org_acceptances for select to authenticated
  using (app.has_role_or_settling(organization_id, array['org_admin']::public.membership_role[]) or app.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Fixed texts copied into stored records (RD-049, RD-045), per notice language. ⚖️ drafts (§5.8/§5.9).
-- ---------------------------------------------------------------------------
create or replace function app.notice_outcomes_line(p_language text) returns text
language sql immutable set search_path = '' as $$
  select case p_language
    when 'fr-CA' then 'Après le délai de réponse, Workatent peut décider de ne prendre aucune mesure, ou d’imposer un avertissement, une restriction réseau, une suspension ou une exclusion. En cas de constat ou de sanction, votre organisation peut demander une seule fois une révision par un autre administrateur de la plateforme.'
    when 'pt-BR' then 'Depois do prazo de resposta, o Workatent pode decidir não tomar nenhuma medida ou aplicar uma advertência, uma restrição de rede, uma suspensão ou uma exclusão. Se houver uma constatação ou uma sanção, sua organização pode pedir uma única vez a revisão por outro admin da plataforma.'
    else 'After the response period, Workatent may decide to take no action, or to give a warning, a network hold, a suspension or termination. If there’s a finding or a sanction, your organization can ask once for a review by a different platform admin.'
  end;
$$;

create or replace function app.incident_guidance_line(p_variant text, p_language text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_variant = 'sourcing' and p_language = 'fr-CA' then 'Si votre candidat révoque son autorisation, l’autre organisation perd immédiatement l’accès au profil partagé et aux documents dans Workatent. Cela ne récupère pas les copies déjà téléchargées. Retirer la recommandation conserve votre priorité. Libérer le candidat vous la fait perdre.'
    when p_variant = 'sourcing' and p_language = 'pt-BR' then 'Se seu candidato revogar a autorização, a outra organização perde na hora o acesso ao perfil compartilhado e aos documentos no Workatent. Isso não recupera cópias já baixadas. Retirar a indicação mantém sua prioridade. Liberar o candidato faz você perder a prioridade.'
    when p_variant = 'sourcing' then 'If your candidate revokes their authorization, the other organization loses access to the shared profile and documents on Workatent right away. This doesn’t recall copies they already downloaded. Withdrawing the referral keeps your first position. Releasing the candidate gives it up.'
    when p_language = 'fr-CA' then 'Workatent ne peut pas récupérer des renseignements une fois qu’ils ont été communiqués. Cet avis ne change rien à vos postes ni à vos recommandations en cours. Si les renseignements concernent votre client, vous voudrez peut-être l’en informer.'
    when p_language = 'pt-BR' then 'O Workatent não consegue recuperar informações depois que elas foram compartilhadas. Este aviso não muda suas vagas nem suas indicações em andamento. Se as informações forem sobre seu cliente, talvez seja bom avisá-lo.'
    else 'Workatent can’t recall information once it has been shared. This notice doesn’t change your jobs or your referrals in progress. If the information is about your client, you may want to tell them.'
  end;
$$;

-- "Mon DD, YYYY, H:MM AM" in America/Toronto, for notification bodies ({when} ET).
create or replace function app.fmt_et(p timestamptz) returns text
language sql stable set search_path = '' as $$
  select to_char(p at time zone 'America/Toronto', 'FMMon FMDD, YYYY, FMHH12:MI AM');
$$;

revoke execute on function app.notice_outcomes_line(text), app.incident_guidance_line(text, text), app.fmt_et(timestamptz)
  from public, anon, authenticated;

-- Platform-admin notifications (no org): one row per platform admin. Links are absolute /admin paths.
create or replace function app.notify_platform_admins(p_kind text, p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, organization_id, kind, title, body, link)
  select p.id, null, p_kind, p_title, p_body, p_link from public.profiles p where p.is_platform_admin;
$$;

-- An org's active org_admins (settling orgs included) as notification recipients.
create or replace function app.notify_org_admins(p_org uuid, p_kind text, p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, organization_id, kind, title, body, link)
  select m.user_id, p_org, p_kind, p_title, p_body, p_link
    from public.organization_memberships m
   where m.organization_id = p_org and m.status = 'active' and m.role = 'org_admin'
     and not exists (select 1 from public.notification_preferences np
                      where np.user_id = m.user_id and np.kind = p_kind and np.in_app = false);
$$;
revoke execute on function app.notify_platform_admins(text, text, text, text), app.notify_org_admins(uuid, text, text, text, text)
  from public, anon, authenticated;
