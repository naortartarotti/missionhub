-- N1 part 3 of 7: presentation data model, fingerprints, client key, counting rule, backfills.
--
-- Everything that could identify a person or a confidential client lives in the non-exposed
-- `app` schema (PostgREST never serves it) with RLS on and no grants: fingerprints, client keys,
-- the per-referral presentation row (client-key snapshot + release flag), sticky stops, the
-- admin-only hit log and the claim tables. Only SECURITY DEFINER functions read them.
--
-- Fingerprint key (BR-1, BR-33, PD-018): a random 32-byte key generated into Supabase Vault by
-- this migration when absent (each environment gets its own). No env var, no app copy. Hashing is
-- HMAC-SHA256 over "<kind>:<normalised value>", computed only in this database from the stored
-- candidate row. `key_version` on every fingerprint supports a service-role recompute.

-- ---------------------------------------------------------------------------
-- 1. Referral columns readable by both sides (nothing sensitive)
-- ---------------------------------------------------------------------------
alter table public.referrals
  add column delivered_at timestamptz,              -- set only at delivery (EC-2); BR-4 delivery test
  add column claim_deadline_at timestamptz,         -- frozen at delivery: 5 business days (BR-28)
  add column claim_rejected_at timestamptz,         -- set when an admin rejects a claim (BR-18)
  add column review_clock_started_at timestamptz;   -- fresh review clock after a rejected claim (N4 reads it)

alter table public.referrals drop constraint referrals_decline_reason_check;
alter table public.referrals add constraint referrals_decline_reason_check check (decline_reason in (
  'salary', 'skills', 'seniority', 'location', 'availability', 'position_filled', 'other',
  'duplicate',            -- legacy only (BR-11, BR-30): no RPC accepts it any more
  'prior_presentation'    -- set only by file_prior_presentation_claim
));

-- Who caused an event when there is no user actor: 'candidate' (confirmation page), 'system'
-- (Workatent closed it, BR-8) or 'admin' (a platform admin resolved a claim). Null = legacy rule
-- (actor_side null meant the candidate).
alter table public.referral_status_events
  add column actor_kind text check (actor_kind in ('candidate', 'system', 'admin'));

-- ---------------------------------------------------------------------------
-- 2. Fingerprint key in Vault
-- ---------------------------------------------------------------------------
create table app.presentation_config (
  id boolean primary key default true check (id),
  key_version smallint not null default 1 check (key_version >= 1),
  rotated_at timestamptz
);
alter table app.presentation_config enable row level security;
revoke all on app.presentation_config from public, anon, authenticated;
insert into app.presentation_config (id, key_version) values (true, 1) on conflict do nothing;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'presentation_fingerprint_key_v1') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'presentation_fingerprint_key_v1',
      'Workatent N1 fingerprint HMAC key (never leaves the database)');
  end if;
end $$;

create or replace function app.fingerprint_key_version() returns smallint
language sql stable security definer set search_path = '' as $$
  select key_version from app.presentation_config where id;
$$;

create or replace function app.fingerprint_key(p_version smallint) returns bytea
language sql stable security definer set search_path = '' as $$
  select decode(s.decrypted_secret, 'hex') from vault.decrypted_secrets s
   where s.name = 'presentation_fingerprint_key_v' || p_version::text;
$$;

-- ---------------------------------------------------------------------------
-- 3. Normalisers (pure SQL; one implementation, nothing to drift)
-- ---------------------------------------------------------------------------
create table app.country_calling_codes (
  country char(2) primary key,
  calling_code text not null check (calling_code ~ '^[0-9]{1,4}$'),
  keeps_trunk_zero boolean not null default false
);
alter table app.country_calling_codes enable row level security;
revoke all on app.country_calling_codes from public, anon, authenticated;
insert into app.country_calling_codes (country, calling_code, keeps_trunk_zero) values
  ('GB','44',false),('IE','353',false),('FR','33',false),('BE','32',false),('NL','31',false),('LU','352',false),
  ('DE','49',false),('AT','43',false),('CH','41',false),('IT','39',true),('ES','34',false),('PT','351',false),
  ('DK','45',false),('SE','46',false),('NO','47',false),('FI','358',false),('IS','354',false),('PL','48',false),
  ('CZ','420',false),('SK','421',false),('HU','36',false),('RO','40',false),('BG','359',false),('GR','30',false),
  ('HR','385',false),('SI','386',false),('RS','381',false),('UA','380',false),('EE','372',false),('LV','371',false),
  ('LT','370',false),('TR','90',false),('IL','972',false),('AE','971',false),('SA','966',false),('EG','20',false),
  ('MA','212',false),('DZ','213',false),('TN','216',false),('NG','234',false),('KE','254',false),('ZA','27',false),
  ('SN','221',false),('CI','225',false),('CM','237',false),('IN','91',false),('PK','92',false),('BD','880',false),
  ('LK','94',false),('CN','86',false),('HK','852',false),('TW','886',false),('JP','81',false),('KR','82',false),
  ('PH','63',false),('VN','84',false),('TH','66',false),('MY','60',false),('SG','65',false),('ID','62',false),
  ('AU','61',false),('NZ','64',false),('MX','52',false),('BR','55',false),('AR','54',false),('CL','56',false),
  ('CO','57',false),('PE','51',false),('VE','58',false),('EC','593',false),('UY','598',false),('PY','595',false),
  ('BO','591',false),('CR','506',false),('PA','507',false),('GT','502',false),('HT','509',false),('CU','53',false),
  ('IR','98',false),('LB','961',false),('JO','962',false),('RU','7',false),('KZ','7',false);

-- trim + lowercase; plus-alias removed from the local part (Should item); null when not an email.
create or replace function app.norm_email(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v text := lower(btrim(coalesce(p, '')));
begin
  if v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return null; end if;
  v := regexp_replace(v, '^([^@+]+)\+[^@]*@', '\1@');
  if v ~ '^@' then return null; end if;
  return v;
end $$;

-- E.164. Exact for NANP (+1); other countries use the calling-code table and drop a trunk 0.
-- Returns null when the number can't be normalised (BR-1: skipped, never guessed).
create or replace function app.norm_phone(p_phone text, p_country text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  raw text := lower(btrim(coalesce(p_phone, '')));
  d text;
  cc app.country_calling_codes;
  ctry text := upper(btrim(coalesce(p_country, '')));
  nanp text[] := array['CA','US','PR','VI','GU','AS','MP','BS','BB','AI','AG','VG','KY','BM','GD','TC','MS','SX',
                       'LC','DM','VC','DO','TT','KN','JM'];
begin
  if raw = '' then return null; end if;
  raw := regexp_replace(raw, '\s*(ext\.?|extension|x|#)\s*[0-9]+\s*$', '');
  d := regexp_replace(raw, '[^0-9]', '', 'g');
  if d = '' then return null; end if;

  if raw ~ '^\+' or d ~ '^00' then
    if d ~ '^00' and raw !~ '^\+' then d := substr(d, 3); end if;
  elsif d ~ '^011' and (ctry = '' or ctry = any (nanp)) then
    d := substr(d, 4);
  elsif ctry = '' or ctry = any (nanp) then
    if length(d) = 11 and d ~ '^1' then d := substr(d, 2); end if;
    if length(d) <> 10 then return null; end if;
    d := '1' || d;
  else
    select * into cc from app.country_calling_codes where country = ctry;
    if not found then return null; end if;
    if not cc.keeps_trunk_zero then d := regexp_replace(d, '^0', ''); end if;
    d := cc.calling_code || d;
  end if;

  if d ~ '^1' then
    if d !~ '^1[2-9][0-9]{2}[2-9][0-9]{6}$' then return null; end if;
  elsif length(d) not between 8 and 15 or d ~ '^0' then
    return null;
  end if;
  return '+' || d;
end $$;

-- linkedin.com/in/<slug>, lowercased, no protocol, subdomain, query, fragment or trailing slash.
create or replace function app.norm_linkedin(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v text := lower(btrim(coalesce(p, '')));
  slug text;
begin
  if v = '' then return null; end if;
  v := regexp_replace(v, '^[a-z]+://', '');
  v := regexp_replace(v, '^([a-z0-9-]+\.)*linkedin\.com', 'linkedin.com');
  slug := substring(v from '^linkedin\.com/in/([^/?#[:space:]]+)');
  if slug is null or slug = '' then return null; end if;
  return 'linkedin.com/in/' || slug;
end $$;

-- Client key (BR-23): lowercase, accents stripped, punctuation dropped, whitespace collapsed,
-- trailing legal forms removed; placeholders give no key (null).
create or replace function app.client_key(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v text := lower(btrim(coalesce(p, '')));
  toks text[];
  legal text[] := array['inc','incorporated','ltd','limited','ltee','corp','corporation','co','llc','llp','lp',
                        'senc','enr','sa','sas','gmbh','plc'];
  placeholders text[] := array['', 'confidential', 'confidentiel', 'confidentielle', 'confidencial', 'undisclosed',
                               'stealth', 'client', 'na', 'tbd', 'confidentialclient', 'clientconfidential',
                               'clientconfidentiel', 'clientconfidentielle', 'clienteconfidencial', 'undisclosedclient',
                               'stealthstartup', 'cliente'];
begin
  v := replace(replace(replace(replace(v, 'ß', 'ss'), 'æ', 'ae'), 'œ', 'oe'), '&', ' ');
  v := translate(v, 'àáâãäåāăąçćčďèéêëēėęěìíîïīįñńňòóôõöøōőùúûüūůűýÿžźżśšłđ',
                    'aaaaaaaaacccdeeeeeeeeiiiiiinnnoooooooouuuuuuuyyzzzssld');
  v := regexp_replace(v, '[.''’]', '', 'g');        -- "s.e.n.c." -> "senc", "corp." -> "corp"
  v := regexp_replace(v, '[^a-z0-9]+', ' ', 'g');
  v := btrim(regexp_replace(v, '\s+', ' ', 'g'));
  if replace(v, ' ', '') = any (placeholders) then return null; end if;
  toks := string_to_array(v, ' ');
  while cardinality(toks) > 1 and toks[cardinality(toks)] = any (legal) loop
    toks := toks[1:cardinality(toks) - 1];
  end loop;
  v := array_to_string(toks, ' ');
  if replace(v, ' ', '') = any (placeholders) then return null; end if;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Closed tables
-- ---------------------------------------------------------------------------
create table app.job_client_keys (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_key text not null,
  updated_at timestamptz not null default now()
);
create index job_client_keys_org_key_idx on app.job_client_keys (organization_id, client_key);

-- One row per referral. client_key: the job's key at delivery (snapshot, BR-23); for a pending
-- referral the job's *current* key is used instead. released_* / void_reason: the BR-4 exits,
-- readable by the sourcing side and admins only (BR-25, PD-020).
create table app.referral_presentations (
  referral_id uuid primary key references public.referrals (id) on delete cascade,
  source_org_id uuid not null references public.organizations (id),
  target_org_id uuid not null references public.organizations (id),
  job_id uuid not null references public.jobs (id),
  candidate_id uuid references public.candidates (id) on delete set null,
  client_key text,
  released_at timestamptz,
  released_by uuid references auth.users (id),
  void_reason text check (void_reason in ('released', 'prior_presentation_upheld', 'already_presented')),
  voided_at timestamptz,
  created_at timestamptz not null default now()
);
create index referral_presentations_target_key_idx on app.referral_presentations (target_org_id, client_key) where client_key is not null;
create index referral_presentations_job_idx on app.referral_presentations (job_id);
create index referral_presentations_candidate_idx on app.referral_presentations (candidate_id);

create table app.referral_fingerprints (
  referral_id uuid not null references app.referral_presentations (referral_id) on delete cascade,
  kind text not null check (kind in ('email', 'phone', 'linkedin')),
  hash bytea not null,
  key_version smallint not null,
  created_at timestamptz not null default now(),
  primary key (referral_id, kind)
);
create index referral_fingerprints_hash_idx on app.referral_fingerprints (hash);

create table app.sticky_stops (
  id bigint generated always as identity primary key,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  source_org_id uuid not null references public.organizations (id),
  target_org_id uuid not null references public.organizations (id),
  job_id uuid not null references public.jobs (id) on delete cascade,
  client_key text,
  reason text not null check (reason in ('stop', 'already_presented')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sticky_stops_candidate_idx on app.sticky_stops (candidate_id, target_org_id, expires_at);

-- Admin-only hit log (metrics, abuse flags, support lookups). Holds no identifiers, no hashes and
-- no client key. earlier_internal is the PD-022 attribute: admin-only, never in audit metadata.
create table app.presentation_hits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source_org_id uuid not null references public.organizations (id) on delete cascade,
  source_user_id uuid references auth.users (id) on delete set null,
  target_org_id uuid not null references public.organizations (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  referral_id uuid references public.referrals (id) on delete set null,
  outcome text not null check (outcome in ('stop', 'sticky', 'warn', 'closure', 'identifier_required')),
  scope text check (scope in ('job', 'client')),
  earlier_internal boolean,
  audit_event_id bigint                -- the member-visible audit event; its id is the support reference
);
create index presentation_hits_source_idx on app.presentation_hits (source_org_id, created_at);
create index presentation_hits_created_idx on app.presentation_hits (created_at);

-- Prior-presentation claims (RPCs in 20261113000500). Here because the counting rule reads them.
create table app.referral_claims (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null unique references public.referrals (id) on delete cascade,  -- BR-27
  source_org_id uuid not null references public.organizations (id),
  target_org_id uuid not null references public.organizations (id),
  filed_by uuid not null references auth.users (id),
  filed_at timestamptz not null default now(),
  evidence_kind text not null check (evidence_kind in ('file', 'referral')),
  evidence_referral_id uuid references public.referrals (id),
  prior_process_date date not null,
  attested_at timestamptz not null,
  note text check (char_length(note) <= 2000),
  contest_deadline_at timestamptz not null,                 -- frozen at filing (BR-28)
  status text not null default 'open' check (status in ('open', 'contested', 'upheld', 'rejected', 'final')),
  contested_at timestamptz,
  resolved_at timestamptz,
  resolution text check (char_length(resolution) <= 2000),
  finalized_at timestamptz,
  check ((evidence_kind = 'referral') = (evidence_referral_id is not null))
);
create index referral_claims_status_idx on app.referral_claims (status, contest_deadline_at);
create index referral_claims_target_idx on app.referral_claims (target_org_id, filed_at);

create table app.referral_claim_files (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals (id) on delete cascade,
  target_org_id uuid not null references public.organizations (id),
  claim_id uuid references app.referral_claims (id),
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
create index referral_claim_files_referral_idx on app.referral_claim_files (referral_id) where removed_at is null;
create index referral_claim_files_claim_idx on app.referral_claim_files (claim_id);

-- Upload time and SHA-256 are frozen (BR-15): a file can't be swapped.
create or replace function app.guard_claim_file() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.storage_path <> old.storage_path or new.size_bytes <> old.size_bytes or new.mime_type <> old.mime_type
     or new.uploaded_at <> old.uploaded_at or new.referral_id <> old.referral_id or new.target_org_id <> old.target_org_id
     or (old.sha256 is not null and new.sha256 is distinct from old.sha256)
     or (old.claim_id is not null and new.claim_id is distinct from old.claim_id) then
    raise exception 'immutable_record' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger referral_claim_files_guard before update on app.referral_claim_files
  for each row execute function app.guard_claim_file();

alter table app.job_client_keys enable row level security;
alter table app.referral_presentations enable row level security;
alter table app.referral_fingerprints enable row level security;
alter table app.sticky_stops enable row level security;
alter table app.presentation_hits enable row level security;
alter table app.referral_claims enable row level security;
alter table app.referral_claim_files enable row level security;
revoke all on app.job_client_keys, app.referral_presentations, app.referral_fingerprints, app.sticky_stops,
  app.presentation_hits, app.referral_claims, app.referral_claim_files from public, anon, authenticated;
revoke all on sequence app.sticky_stops_id_seq from public, anon, authenticated;

-- Referral-level disputes (RPCs in 20261113000600): `disputes` gains a kind and a referral target.
alter table public.disputes
  alter column placement_id drop not null,
  add column kind text not null default 'placement' check (kind in ('placement', 'prior_presentation')),
  add column referral_id uuid references public.referrals (id) on delete restrict,
  add column claim_id uuid references app.referral_claims (id) on delete restrict,
  add column outcome text check (outcome in ('claim_upheld', 'claim_rejected'));
alter table public.disputes add constraint disputes_target check (
  (kind = 'placement' and placement_id is not null and referral_id is null and claim_id is null)
  or (kind = 'prior_presentation' and placement_id is null and referral_id is not null and claim_id is not null));
alter table public.disputes drop constraint disputes_reason_check;
alter table public.disputes add constraint disputes_reason_check check (char_length(reason) between 5 and 4000);
create unique index disputes_one_open_referral on public.disputes (referral_id) where status = 'open';
create index disputes_claim_idx on public.disputes (claim_id);

-- ---------------------------------------------------------------------------
-- 5. Client key maintenance (every job write: UI, connectors, /api/v1/jobs)
-- ---------------------------------------------------------------------------
create or replace function app.sync_job_client_key() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := app.client_key(new.client_name);
begin
  if v_key is null then
    delete from app.job_client_keys where job_id = new.id;
  else
    insert into app.job_client_keys (job_id, organization_id, client_key)
    values (new.id, new.organization_id, v_key)
    on conflict (job_id) do update set client_key = excluded.client_key, updated_at = now();
  end if;
  return null;
end $$;
create trigger jobs_client_key after insert or update of client_name on public.jobs
  for each row execute function app.sync_job_client_key();

-- ---------------------------------------------------------------------------
-- 6. Fingerprints from the stored candidate row
-- ---------------------------------------------------------------------------
create or replace function app.candidate_fingerprints(p_candidate uuid)
returns table (fp_kind text, fp_hash bytea)
language plpgsql stable security definer set search_path = '' as $$
declare
  c record;
  v_key bytea := app.fingerprint_key(app.fingerprint_key_version());
begin
  if v_key is null then raise exception 'fingerprint_key_missing' using errcode = 'P0001'; end if;
  select x.email::text as email, x.phone, x.linkedin_url, x.location_country into c
    from public.candidates x where x.id = p_candidate;
  if not found then return; end if;
  return query
    select v.k, extensions.hmac(convert_to(v.k || ':' || v.val, 'UTF8'), v_key, 'sha256')
      from (values ('email', app.norm_email(c.email)),
                   ('phone', app.norm_phone(c.phone, c.location_country)),
                   ('linkedin', app.norm_linkedin(c.linkedin_url))) v(k, val)
     where v.val is not null;
end $$;

create or replace function app.write_fingerprints(p_referral uuid, p_candidate uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
  v_ver smallint := app.fingerprint_key_version();
begin
  delete from app.referral_fingerprints where referral_id = p_referral;
  insert into app.referral_fingerprints (referral_id, kind, hash, key_version)
  select p_referral, f.fp_kind, f.fp_hash, v_ver from app.candidate_fingerprints(p_candidate) f;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 7. BR-4: does this referral count as a presentation right now?
--    "Final uncontested" is evaluated lazily (EC-7): an open claim past its contest deadline
--    already stops the referral counting, whether or not the worker has swept it.
-- ---------------------------------------------------------------------------
create or replace function app.presentation_counts(p_referral uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select r.delivered_at is not null
       and r.ownership_protected_until > now()
       and r.status <> 'already_presented'
       and p.void_reason is null
       and not exists (
         select 1 from app.referral_claims c
          where c.referral_id = r.id
            and (c.status in ('upheld', 'final') or (c.status = 'open' and c.contest_deadline_at <= now())))
      from public.referrals r
      left join app.referral_presentations p on p.referral_id = r.id
     where r.id = p_referral), false);
$$;

-- Effective claim status: 'open' past its contest deadline reads as 'final' (EC-7).
create or replace function app.claim_effective_status(p_status text, p_contest_deadline timestamptz) returns text
language sql stable set search_path = '' as $$
  select case when p_status = 'open' and p_contest_deadline <= now() then 'final' else p_status end;
$$;

-- ---------------------------------------------------------------------------
-- 8. The check (BR-3, BR-5, BR-10, BR-24). Never across hiring orgs.
--    outcome: identifier_required | sticky | stop | pending | clear
-- ---------------------------------------------------------------------------
create or replace function app.presentation_check(p_candidate uuid, p_job uuid, p_exclude uuid default null)
returns table (outcome text, scope text, earlier_internal boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_target uuid;
  v_key text;
  v_hashes bytea[];
  v_ver smallint := app.fingerprint_key_version();
  v_same_job boolean;
  v_internal boolean;
begin
  select j.organization_id into v_target from public.jobs j where j.id = p_job;
  select k.client_key into v_key from app.job_client_keys k where k.job_id = p_job;
  select array_agg(f.fp_hash) into v_hashes from app.candidate_fingerprints(p_candidate) f;

  if coalesce(cardinality(v_hashes), 0) = 0 then
    return query select 'identifier_required'::text, null::text, null::boolean;
    return;
  end if;

  if exists (
    select 1 from app.sticky_stops s
     where s.candidate_id = p_candidate and s.target_org_id = v_target and s.expires_at > now()
       and (s.job_id = p_job or (v_key is not null and s.client_key = v_key))
  ) then
    return query select 'sticky'::text, null::text, null::boolean;
    return;
  end if;

  select (p.job_id = p_job), r.internal into v_same_job, v_internal
    from app.referral_fingerprints f
    join app.referral_presentations p on p.referral_id = f.referral_id
    join public.referrals r on r.id = f.referral_id
   where f.hash = any (v_hashes) and f.key_version = v_ver
     and (p_exclude is null or f.referral_id <> p_exclude)
     and p.target_org_id = v_target
     and (p.job_id = p_job or (v_key is not null and p.client_key = v_key))
     and app.presentation_counts(r.id)
   order by (p.job_id = p_job) desc
   limit 1;
  if found then
    return query select 'stop'::text, case when v_same_job then 'job' else 'client' end, v_internal;
    return;
  end if;

  select (p.job_id = p_job), r.internal into v_same_job, v_internal
    from app.referral_fingerprints f
    join app.referral_presentations p on p.referral_id = f.referral_id
    join public.referrals r on r.id = f.referral_id
    left join app.job_client_keys jk on jk.job_id = p.job_id
   where f.hash = any (v_hashes) and f.key_version = v_ver
     and (p_exclude is null or f.referral_id <> p_exclude)
     and p.target_org_id = v_target
     and r.status = 'awaiting_candidate'
     and (p.job_id = p_job or (v_key is not null and jk.client_key = v_key))
   order by (p.job_id = p_job) desc
   limit 1;
  if found then
    return query select 'pending'::text, case when v_same_job then 'job' else 'client' end, v_internal;
    return;
  end if;

  return query select 'clear'::text, null::text, null::boolean;
end $$;

-- Serialises check + delivery per hiring org (EC-3): two records of the same person don't share
-- a row lock. Transaction-scoped; released at commit or rollback.
create or replace function app.lock_hiring_org(p_org uuid) returns void
language sql security definer set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended('n1-presentation:' || p_org::text, 0));
$$;

-- Records a check outcome: admin-only hit row, sticky stop when stopping or closing, and audit.
-- Member-visible audit (source org) carries no scope, identifier, hash, client key or other
-- referral; the scope goes to a platform-only event (organization_id null) and the hit log.
-- Returns the support reference: the first 8 characters of the member-visible audit event id
-- (PD-025). Same shape for every stop, sticky stops included.
create or replace function app.record_presentation_outcome(
  p_source_org uuid, p_target_org uuid, p_job uuid, p_candidate uuid, p_referral uuid,
  p_outcome text, p_scope text, p_internal boolean
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_hit uuid;
  v_key text;
  v_audit bigint;
  v_action text := case p_outcome
    when 'stop' then 'referral.submission_stopped'
    when 'sticky' then 'referral.submission_stopped'
    when 'warn' then 'referral.pending_warning'
    when 'identifier_required' then 'referral.identifier_required'
    when 'closure' then 'referral.closed_already_presented' end;
begin
  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_source_org, auth.uid(), v_action,
          case when p_outcome = 'closure' then 'referral' else 'job' end,
          case when p_outcome = 'closure' then p_referral else p_job end, '{}')
  returning id into v_audit;

  insert into app.presentation_hits (source_org_id, source_user_id, target_org_id, job_id, referral_id, outcome, scope,
                                     earlier_internal, audit_event_id)
  values (p_source_org, auth.uid(), p_target_org, p_job, p_referral, p_outcome, p_scope, p_internal, v_audit)
  returning id into v_hit;

  if p_outcome in ('stop', 'closure') then
    select k.client_key into v_key from app.job_client_keys k where k.job_id = p_job;
    insert into app.sticky_stops (candidate_id, source_org_id, target_org_id, job_id, client_key, reason, expires_at)
    values (p_candidate, p_source_org, p_target_org, p_job, v_key,
            case when p_outcome = 'stop' then 'stop' else 'already_presented' end, now() + interval '30 days');
  end if;

  if p_outcome = 'sticky' then
    perform app.audit(null, 'referral.sticky_stop', 'job', p_job, jsonb_build_object('hit', v_hit));
  elsif p_outcome in ('stop', 'warn', 'closure') then
    perform app.audit(null, 'referral.fingerprint_hit', 'job', p_job,
      jsonb_build_object('hit', v_hit, 'scope', p_scope, 'outcome', p_outcome));
  end if;
  return left(v_audit::text, 8);
end $$;

-- ---------------------------------------------------------------------------
-- 9. BR-21 / O-1 provisional default: anonymising a candidate deletes its fingerprints on
--    referrals without an open dispute.
-- ---------------------------------------------------------------------------
create or replace function app.on_candidate_anonymized() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from app.referral_fingerprints f
   using app.referral_presentations p
   where p.referral_id = f.referral_id and p.candidate_id = new.id
     and not exists (select 1 from public.disputes d where d.referral_id = p.referral_id and d.status = 'open');
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Backfills (BR-23, BR-28, BR-34, PD-014, PD-020)
-- ---------------------------------------------------------------------------
-- Client keys for every existing job.
insert into app.job_client_keys (job_id, organization_id, client_key)
select j.id, j.organization_id, app.client_key(j.client_name) from public.jobs j
 where app.client_key(j.client_name) is not null;

-- delivered_at from the shared-profile snapshot (written only at delivery); deadline from it.
update public.referrals r
   set delivered_at = p.created_at,
       claim_deadline_at = app.add_business_days(p.created_at, 5)
  from public.referral_shared_profiles p
 where p.referral_id = r.id and r.delivered_at is null;

-- One presentation row per referral; pre-N1 snapshot = the job's key now.
insert into app.referral_presentations (referral_id, source_org_id, target_org_id, job_id, candidate_id, client_key, created_at)
select r.id, r.source_org_id, r.target_org_id, r.job_id, l.candidate_id, k.client_key, r.created_at
  from public.referrals r
  left join public.referral_candidate_links l on l.referral_id = r.id
  left join app.job_client_keys k on k.job_id = r.job_id
on conflict (referral_id) do nothing;

-- Fingerprints for counting and pending referrals, from current identifiers (BR-34).
do $$
declare v record;
begin
  for v in
    select p.referral_id, p.candidate_id from app.referral_presentations p
      join public.referrals r on r.id = p.referral_id
     where p.candidate_id is not null
       and (r.status = 'awaiting_candidate' or app.presentation_counts(r.id))
  loop
    perform app.write_fingerprints(v.referral_id, v.candidate_id);
  end loop;
end $$;

revoke execute on function
  app.fingerprint_key_version(), app.fingerprint_key(smallint), app.norm_email(text), app.norm_phone(text, text),
  app.norm_linkedin(text), app.client_key(text), app.guard_claim_file(), app.sync_job_client_key(),
  app.candidate_fingerprints(uuid), app.write_fingerprints(uuid, uuid), app.presentation_counts(uuid),
  app.claim_effective_status(text, timestamptz), app.presentation_check(uuid, uuid, uuid), app.lock_hiring_org(uuid),
  app.record_presentation_outcome(uuid, uuid, uuid, uuid, uuid, text, text, boolean), app.on_candidate_anonymized()
from public, anon, authenticated;

-- Pre-existing gap found while testing BR-23 on connector / API job writes: the invoker trigger
-- jobs_normalize calls app.normalize_tags, which 20261108000100 revoked from PUBLIC and granted to
-- authenticated only, so every service-role job insert (connectors, /api/v1/jobs) failed with
-- "permission denied for function normalize_tags". The service role needs the same grant.
grant execute on function app.normalize_tags(text[]) to service_role;
