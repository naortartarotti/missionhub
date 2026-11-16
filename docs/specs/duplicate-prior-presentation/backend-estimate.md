# Backend estimate: duplicate and prior-presentation protection (N1)

Owner: Backend Engineer · Date: 2026-11-12 · Step 1 (day-1 estimate) of the team plan in [`brief.md`](./brief.md) rev. 2
Status: estimate only. No code, migration or other doc was changed.

## 1. Recommendation

**Include the client key (BR-23) in this release. Don't take the PD-013 fallback.**

The client key adds about **1.5 to 1.75 engineering days** on top of the same-job check, which fits inside the ~2-day limit. Most of the cost of the feature is in machinery that the same-job check needs anyway: fingerprints, the BR-4 counting rule, both submit paths, sticky stops and the delivery re-check. The client scope adds one normaliser, one closed table with a trigger, one extra column on the per-referral presentation row, and one more condition in three queries.

Deferring it would cost more later. BR-23 / PD-014 says the client key is **snapshotted at delivery**. If we ship same-job only, every referral delivered before the follow-up has no real snapshot, and the follow-up has to backfill from the job's client name as it is at that later time, which breaks PD-014 for those referrals. If the PM still chooses the fallback, the snapshot column should ship and be filled from day 1 (about 0.5 day), with only the query condition deferred.

**The client scope only helps if jobs have a client name.** Today `client_name` is optional when `client_confidential` is true, and new jobs default to confidential (`src/features/jobs/schemas.ts:62`, `jobs.client_confidential default true`). Without a product change many jobs will have no key, and client-level hits will stay rare however well the key is built. See Q-PM-1.

## 2. What the current code does (verified 2026-11-12)

| Area | Current state | Impact on N1 |
|---|---|---|
| `jobs.client_name` | `text`, nullable, ≤ 160 chars; `client_confidential boolean default true`. Partners never read `jobs` directly (`jobs_select` = members only); they get the client name through `get_opportunities` / matching RPCs, masked when confidential. Jobs are also written by connectors and `/api/v1/jobs` (service role). | The key has to be computed by a **DB trigger**, not in the server action, so connector, API and UI writes all get it. It must not be stored on `jobs` (own members can `select *`) or on `referrals` (the sourcing org can read that row, and the key is a normalised confidential client name). It belongs in closed tables. |
| `referrals.submitted_at` | `default now()` at **insert**, including `awaiting_candidate` rows. `respond_candidate_request` overwrites it at confirmation. | **BR-4 can't use "`submitted_at` set" as the delivery test.** A referral withdrawn while `awaiting_candidate` has `submitted_at` set but was never delivered. We need a real `delivered_at` column, backfilled from `referral_shared_profiles.created_at` (the snapshot is only written at delivery). |
| `app.assert_referable` | Locks the submitter's candidate row and checks one live referral per candidate record and job (`duplicate_referral`, 23505). Called by `submit_referral` and `submit_referral_for_candidate`. | The fingerprint check, identifier requirement and sticky stop go here. The candidate-row lock doesn't serialise two different records of the same person, so the check needs its own lock (R-5). |
| `app.deliver_referral` | Shared by both paths. Writes the consent link, label, snapshot and grants, then notifies and audits. Called from `submit_referral` and `respond_candidate_request`. | This is where the delivery re-check (BR-8), the client-key snapshot, `delivered_at` and `claim_deadline_at` go. That puts it in one place for both paths. |
| `respond_candidate_request` | Granted to **`anon`** (token-only). Lets the candidate edit `phone` (not email or LinkedIn) before confirming, then delivers. | Fingerprints must be recomputed here **inside the DB** from the updated row. Hashes passed in from the app could be forged by anyone holding the token (R-1). |
| `referral_candidate_links` | Source-only RLS; `consent_id` nullable since candidate confirmation. | We get the candidate record for sticky stops and fingerprint recompute from here. No schema change. |
| Decline reasons | Column check and `review_referral` both allow `duplicate`; `decline_referrals` calls `review_referral`. TS list in `src/features/referrals/review.ts:8`. | Remove `duplicate` from the **RPC** allow-list and the TS list. Keep it valid in the **column** check so legacy rows stay valid (BR-11, BR-30). Add `prior_presentation` to the column check only (it's set by the claim RPC, never by `review_referral`). |
| `disputes` | `placement_id not null`, one open per placement, RLS `can_see_placement(placement_id)`. `resolve_dispute` always restores the placement status. The admin page (`src/app/admin/disputes/page.tsx`) embeds `placements`. | `placement_id` becomes nullable. Add `referral_id`, `claim_id` and `kind`. The RLS policy, the one-open index and `resolve_dispute` all need to branch on kind, and the admin page embed must accept a null placement (Frontend). |
| Secrets | Vault is already in use (`connection_set_secret`, `vault.decrypted_secrets`). `pgcrypto` is in `extensions` (`hmac()` available). No `unaccent`. | The HMAC key can live in Vault and be applied with `extensions.hmac` inside SECURITY DEFINER functions. Accents are stripped with `translate()`, with no new extension. |
| Scheduling | No pg_cron. The worker calls `enqueue_due_connector_syncs` on a timer with the service-role client. | Finalising uncontested claims and the purges can use the same worker hook. Correctness must not depend on it (lazy evaluation in the counting predicate). |
| Storage | `candidate-documents` (member policies by path) and `referral-documents` (no end-user policies, signed URLs after `authorize_referral_document`). Both PDF/DOCX ≤ 10 MB. | The evidence bucket follows the `referral-documents` pattern for reads. It needs its own MIME list (PDF, PNG, JPEG) and an insert policy for the claiming org. |

## 3. Client key (BR-23): the extra work over same-job

| # | Work item | Days |
|---|---|---|
| CK-1 | `app.client_key(text) returns text`, immutable SQL. Does lowercase, trim, accent strip (`translate`), punctuation to space, collapse whitespace, then strips trailing legal-form tokens in a loop (so "ABC Corp. Inc." → "abc"). The placeholder list returns null. Covers `ltée`/`ltee` and `s.e.n.c.`/`senc` after punctuation removal. | 0.25 |
| CK-2 | Closed table `job_client_keys` and a SECURITY DEFINER trigger on `jobs` (after insert or update of `client_name`). Backfill in the migration. | 0.25 |
| CK-3 | `client_key` column on the closed per-referral presentation row, written in `deliver_referral` (snapshot) and at pending submission (current key). Backfill for existing referrals from the current job key (Q-PM-5). | 0.15 |
| CK-4 | Scope condition in three places: the hit query (`p.target_org_id = j.organization_id and p.client_key = v_key`, only when `v_key is not null`), the sticky-stop lookup and the BR-26 evidence picker. Plus index `(target_org_id, client_key)`. | 0.25 |
| CK-5 | Tests: a table of normaliser cases (legal forms, placeholders, accents, fr/pt placeholders) and strategist scenarios 1–5 (cross-org negative, byte-identical messages, snapshot after an edit). | 0.5 |
| CK-6 | `backend.md` / domain-model notes for the key. | 0.1 |
| | **Total** | **1.5 (range 1.5–1.75)** |

The normaliser is easy to test without exposing an RPC: the integration test creates jobs with the case table's client names as fixtures and asserts hit or no-hit. A pure TS mirror for unit tests isn't needed, because the key is only ever computed in SQL. One implementation means nothing can drift.

## 4. Effort for the whole feature (backend only)

Estimates are for one engineer who knows this codebase. They include the integration tests for each part. Shared test infrastructure is listed separately.

| Part | Scope | Days |
|---|---|---|
| P1. Status enum | `already_presented` added in its **own** migration (a new enum value can't be used in the same transaction). Add to `hidden_from_target`, transitions (none out of it) and labels. | 0.25 |
| P2. Business days | `network_holidays` table (closed), seed 2026–2028 (ON ∪ QC, observed), `app.add_business_days(timestamptz, int)` (event day excluded, deadline at 23:59:59 `America/Toronto` on the Nth business day), `app.business_days_left(timestamptz)`. Scenarios 25–30 incl. DST. Shared with N4. | 1.0 |
| P3. Delivery timestamps and deadlines | `referrals.delivered_at` (+ backfill from snapshots), `claim_deadline_at` set at delivery (+ backfill per BR-28), `review_clock_started_at`, `claim_rejected_at`, `released_at`, `presentation_void` (`released` / `prior_presentation_upheld` / `already_presented`). | 0.5 |
| P4. Fingerprint core (same-job) | Vault key + `app.fingerprint_hmac`. SQL normalisers: email (trim/lower; plus-alias is Should, +0.1), LinkedIn (`linkedin.com/in/<slug>`), phone to E.164 (NANP exact; other countries via a calling-code table and trunk-0 strip). Closed `referral_presentations` and `referral_fingerprints` tables. `app.referral_counts()` predicate (BR-4 incl. lazy "final uncontested"). Hit check in `assert_referable` (stop / pending warning), identifier requirement (BR-10), advisory lock per hiring org, re-check and `already_presented` closure in `deliver_referral` (both paths, BR-8), candidate page "already sent" result from `respond_candidate_request`. Submit RPCs change their return shape (R-4). Fingerprint backfill for existing referrals. | 4.0 |
| P5. Client key | Section 3. | 1.5 |
| P6. Sticky stops | Closed `sticky_stops` (candidate id, hiring org, job, client key, expires +30 d), written on stop and closure, checked before the fingerprint check. Purge in maintenance. | 0.5 |
| P7. Release | `withdraw_referral(p_referral, p_reason, p_expected_version, p_release, p_acting_org)` wrapping `transition_referral`, atomic, irreversible. Should: `release_referral` for already withdrawn or cancelled referrals (Q-7). | 0.5 |
| P8. Decline reasons | RPC allow-list change, TS list, legacy handling. | 0.25 |
| P9. Claims | `referral_claims` (unique per referral), `referral_claim_files`, `claim-evidence` bucket and insert policy, scan + SHA-256 by the worker, `file_prior_presentation_claim` (window, status, attestation, date rules, evidence ownership, BR-26 re-check, decline with `prior_presentation`, frozen `contest_deadline_at`, notify, audit, rate limit 10/h), `list_claim_evidence_referrals` (picker), `get_referral_claim` (side-specific shape), `authorize_claim_evidence` (claiming org + admins, signed 60 s, audited). | 2.75 |
| P10. Referral disputes | `disputes` alterations + RLS + one-open-per-referral index, `contest_prior_presentation_claim`, `resolve_dispute` branch (upheld: final + flag; rejected: back to `submitted` outside the transitions table, flags, fresh clock, notifications), admin read RPC for both referrals and the first-submitter info. | 1.25 |
| P11. Maintenance | `finalize_due_claims()` (materialise `final` + audit), sticky-stop purge, fingerprint purge per BR-21, all service-role, called from the worker timer. | 0.5 |
| P12. Notifications, audit, i18n error keys | All BR-20 events (PII-free metadata), error markers. | 0.5 |
| P13. Should items | Abuse-flag query (BR-29), admin metrics counts. | 0.5 |
| P14. Server actions and queries | `guard()` wrappers for new RPCs, submit-action result changes, `review.ts`, regenerated types. | 0.75 |
| P15. Shared test work | api-surface allow-list, cross-tenant and IDOR suite, privacy tests (no closed table readable, no hit-scope leak), journey updates. | 1.5 |
| P16. Docs | `backend.md`, `domain-model.md`, `security-and-privacy.md`, `.env.example`, `architecture.md` (new service-role use for evidence signing). | 0.5 |
| | **Total** | **≈ 16.75 (range 16–19)** |

Same-job only would be ≈ 15.25. The client key is about 10% of the backend work.

## 5. Data model sketch

All new tables: RLS enabled, **no policies and no grants** to `anon`/`authenticated` unless stated. Every function is SECURITY DEFINER with `set search_path = ''` and fully qualified names.

```sql
-- M1 (own file): enum value
alter type public.referral_status add value if not exists 'already_presented';

-- M2: business days
create table public.network_holidays (day date primary key, name text not null, jurisdictions text[] not null);
-- seed 2026-2028 (see 8.3 for the dates that need confirmation)
app.add_business_days(p_event timestamptz, p_n int) returns timestamptz   -- stable; event's local date never counts
app.business_days_left(p_deadline timestamptz) returns int               -- for read RPCs; no TS mirror needed

-- M3: presentation core
alter table public.referrals
  add column delivered_at timestamptz,             -- null until delivered; BR-4 delivery test
  add column claim_deadline_at timestamptz,        -- frozen at delivery (BR-28)
  add column released_at timestamptz,              -- BR-25
  add column presentation_void text check (presentation_void in ('released','prior_presentation_upheld','already_presented')),
  add column claim_rejected_at timestamptz,        -- BR-18 flag
  add column review_clock_started_at timestamptz;  -- BR-18, read by N4
-- decline_reason column check: + 'prior_presentation' (keep 'duplicate' for legacy rows)

create table public.job_client_keys (               -- closed; trigger-maintained
  job_id uuid primary key references public.jobs (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_key text not null);                         -- row absent = no key (placeholder / empty)
create index on public.job_client_keys (organization_id, client_key);

create table public.referral_presentations (        -- closed; one row per referral that ever reached the check
  referral_id uuid primary key references public.referrals (id) on delete cascade,
  target_org_id uuid not null, job_id uuid not null,
  client_key text,                                   -- snapshot at delivery (current key while pending)
  key_version smallint not null);
create index on public.referral_presentations (target_org_id, client_key) where client_key is not null;
create index on public.referral_presentations (job_id);

create table public.referral_fingerprints (         -- closed (BR-2)
  referral_id uuid references public.referral_presentations (referral_id) on delete cascade,
  kind text check (kind in ('email','phone','linkedin')),
  hash bytea not null,                               -- HMAC-SHA256(key_vN, kind || ':' || normalised)
  primary key (referral_id, kind));
create index on public.referral_fingerprints (hash);

create table public.sticky_stops (                  -- closed (BR-24); ids + client key only
  id bigint generated always as identity primary key,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  target_org_id uuid not null, job_id uuid not null, client_key text,
  reason text not null check (reason in ('stop','already_presented')),
  expires_at timestamptz not null);                  -- created_at + 30 days
create index on public.sticky_stops (candidate_id, target_org_id) ;

app.referral_counts(r public.referrals) returns boolean
  -- delivered_at is not null and ownership_protected_until > now() and presentation_void is null
  -- and status <> 'already_presented' and no claim (upheld | final | open-past-contest-deadline-uncontested)

-- M4: claims
create table public.referral_claims (               -- closed; read via get_referral_claim (side-specific)
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null unique references public.referrals (id),   -- BR-27 one per referral, ever
  target_org_id uuid not null, filed_by uuid not null, filed_at timestamptz not null default now(),
  evidence_kind text not null check (evidence_kind in ('file','referral')),
  evidence_referral_id uuid references public.referrals (id),          -- never returned to the sourcing side
  prior_process_date date not null,
  attested_at timestamptz not null,
  note text check (char_length(note) <= 2000),
  contest_deadline_at timestamptz not null,                             -- frozen (BR-28)
  status text not null check (status in ('open','contested','upheld','rejected','final')),
  finalized_at timestamptz);
create table public.referral_claim_files (          -- closed
  id uuid primary key, claim_id uuid references public.referral_claims (id),  -- null until claim filed
  referral_id uuid not null, target_org_id uuid not null,
  storage_path text not null unique, file_name text, mime_type text, size_bytes int,
  sha256 text,                                        -- set by worker from the stored object, then immutable
  uploaded_at timestamptz not null default now(), scan_status public.document_scan_status not null default 'pending');
-- bucket 'claim-evidence': private, PDF/PNG/JPEG, 10 MB; insert policy for members of target org on
--   path {target_org_id}/{referral_id}/{uuid}.{ext}; no select policy (signed URLs via authorize_claim_evidence)

-- M5: referral disputes
alter table public.disputes
  alter column placement_id drop not null,
  add column kind text not null default 'placement' check (kind in ('placement','prior_presentation')),
  add column referral_id uuid references public.referrals (id),
  add column claim_id uuid references public.referral_claims (id),
  add constraint disputes_target check ((kind = 'placement') = (placement_id is not null)
                                        and (kind = 'prior_presentation') = (referral_id is not null and claim_id is not null));
create unique index disputes_one_open_referral on public.disputes (referral_id) where status = 'open';
-- policy: can_see_placement(placement_id) or (referral_id is not null and app.can_see_referral(referral_id)) or is_platform_admin()
```

**RPC changes** (new ones added to the api-surface allow-list on purpose):

- **Changed:** `submit_referral` and `submit_referral_for_candidate` (return type becomes an outcome; drop and recreate). `respond_candidate_request` (new `already_sent` result). `review_referral` and `decline_referrals` (reason list). `resolve_dispute` (branching).
- **New, authenticated:** `withdraw_referral`, `release_referral` (Should), `file_prior_presentation_claim`, `list_claim_evidence_referrals`, `get_referral_claim`, `authorize_claim_evidence`, `contest_prior_presentation_claim`, `get_referral_dispute` (admin).
- **New, service-role only:** `finalize_due_claims`, `purge_presentation_data`, `rotate_fingerprint_key` (recompute).

## 6. Migration plan

| Order | File (indicative) | Contents | Backfill |
|---|---|---|---|
| 1 | `20261113000100_already_presented_status.sql` | Enum value only | — |
| 2 | `20261113000200_business_days.sql` | Holidays table + seed, helpers | — |
| 3 | `20261113000300_presentation_core.sql` | Referral columns, decline-reason change, `job_client_keys` + trigger, `referral_presentations`, `referral_fingerprints`, Vault key, normalisers, `referral_counts`, `sticky_stops`, rewrites of `assert_referable` / `deliver_referral` / both submit RPCs / `respond_candidate_request`, `withdraw_referral` / `release_referral` | `delivered_at` from `referral_shared_profiles.created_at`. `claim_deadline_at` = `add_business_days(delivered_at, 5)`. `job_client_keys` for all jobs. `referral_presentations.client_key` from the current job key (Q-PM-5). Fingerprints from current candidate identifiers via `referral_candidate_links` (delivered-and-counting and pending referrals only). |
| 4 | `20261113000400_prior_presentation_claims.sql` | Claims, files, bucket + policies, claim RPCs | — |
| 5 | `20261113000500_referral_disputes.sql` | `disputes` changes, policy, contest, `resolve_dispute` | — |
| 6 | `20261113000600_presentation_maintenance.sql` | Finalise and purge functions, abuse-flag query | — |

Locally: `npm run db:reset` + `npm run db:types`. Hosted: `supabase db push` only when the user asks. Migration 3 is the big one. It could be split further (key/table setup, then function rewrites) to make review easier, at no extra cost.

## 7. Riskiest parts

1. **Where the HMAC key lives (R-1, blocker for the design; conflicts with brief §7).** The brief says "HMAC secret in env only". But `submit_referral*` is executable by `authenticated` and `respond_candidate_request` by `anon`. If the app computes hashes and passes them to the RPC, anyone can call the RPC directly through PostgREST with made-up or missing hashes and skip the check. That is exactly the A-2 evasion. Hashing must happen **inside the DB**, so the key must be readable by SECURITY DEFINER functions. **Proposal:** the key lives in **Supabase Vault** (the pattern already used for connector secrets). It is created by a provisioning step from env var `PRESENTATION_FINGERPRINT_KEY` (placeholder in `.env.example`, service role only, never in the client bundle), or generated in Vault by the migration if we don't need an off-DB copy. `key_version` supports rotation. Rotation = recompute from the *current* candidate identifiers, so the "identifiers at delivery" are lost for old referrals (acceptable? see Q-PM-6). Needs a decision before step 2 (security, not a business rule; may need the user).
2. **`submitted_at` isn't the delivery time (R-2).** It's set at insert for `awaiting_candidate` rows. Using it for BR-4 would make never-delivered withdrawn referrals block others. Fix: `delivered_at` + backfill (included in P3). QA must test "withdrawn while awaiting the candidate" → doesn't count.
3. **A stop must persist a record, but exceptions roll back (R-4).** BR-6 wants a sticky-stop row and an audit event when we stop. A plpgsql `raise` rolls both back. So the submit RPCs must **return** an outcome (`created` / `stopped` / `pending_warning` / `identifier_required`) instead of raising. That changes the return type of both submit RPCs and the server-action contract on both submit paths and the match-review screen. The pending warning (BR-7) works as a two-step submit: the first call returns `pending_warning` with no side effects except the audit event, and the second call passes `p_acknowledge_pending = true`. That stays inside a real submission (BR-22), with no standalone check endpoint. Designer should confirm the flow.
4. **Race between two records of the same person (R-5, A-8).** The candidate-row lock only covers one record. Check-then-deliver needs `pg_advisory_xact_lock` keyed on the hiring org (simple, and contention is low at our volume) in both `assert_referable` and `deliver_referral`. Needs a concurrency integration test (two parallel confirmations).
5. **Phone normalisation in SQL (R-6).** Postgres has no libphonenumber. NANP (+1, which covers our CA/US core) can be exact. Other countries use a calling-code table and trunk-0 strip, which is approximate. The failure mode is a **missed** hit, never a false stop. Acceptable under R-1 in the brief; flag it to QA.
6. **Evidence SHA-256 must come from trusted code (R-7).** If the upload action computes the hash and passes it to an RPC, a direct RPC call could record any hash. The worker (service role) must read the stored object, compute SHA-256 and set it once (immutable afterwards). The claim can only be filed once each file is `clean` and hashed. This adds a short wait in the claim form (upload → "processing" → ready), which the designer needs to know about. Signing evidence URLs is a new service-role use, so `architecture.md` must be updated.
7. **Client-key leakage (R-8).** The key is a normalised confidential client name. Storing it on `jobs` or `referrals` would expose it (the sourcing org reads `referrals`). It is only kept in closed tables, and the api-surface test must prove none of them are reachable.
8. **Rejected claim returns to `submitted` (R-9).** That is not in `referral_transitions`. `resolve_dispute` must set the status directly (admin-only path), clear `decline_reason` and `decided_at`, write a status event and bump `version`. Easy to get subtly wrong for the UI's stale-version checks.
9. **Lazy finality (R-10).** No cron exists, so "uncontested past deadline = final" must be part of `referral_counts()` and the claim read shape, not only the worker sweep. Otherwise a stopped worker would keep a claimed referral counting.
10. **Size of migration 3.** It rewrites five core functions that every referral goes through. Regression risk for both submit paths is the main schedule risk (the journey test covers part of it).

## 8. Questions for the product-manager

| # | Question | Default if unanswered | Blocks |
|---|---|---|---|
| Q-PM-1 | **Require a client name (internal-only, never shared) on every job that accepts external referrals?** Today it's optional for confidential jobs, and confidential is the default, so client scope may rarely fire. Needs a job-form change (Frontend/design) and a decision for imported/connector jobs without a name. | Keep optional. Track the share of referral-open jobs with no key in the admin metrics. | Usefulness of BR-23, not the build |
| Q-PM-2 | HMAC key in **Vault** (DB-side hashing), with the env var as provisioning source only, instead of "env only" (Risk 1). | Vault | Step 2 start of P4 |
| Q-PM-3 | **Observed-date substitutes** in the holiday seed. Weekend holidays already don't count; the question is whether a weekday substitute is added. Proposal, following Ontario practice: 2026-12-28 (Boxing Day, Sat), 2027-12-27 and 2027-12-28 (Christmas and Boxing Day, Sat/Sun), 2028-01-03 (New Year, Sat). **No** substitute for 2028-06-24 (Sat; Québec moves only a Sunday 24 June) or 2028-07-01 (Sat; federal moves only a Sunday). Please confirm or correct before the seed is written. | As proposed | P2 seed |
| Q-PM-4 | **Internal referrals** (orgs that share a member, `referrals.internal = true`): do they take part in the duplicate check and claims like any other referral? | Yes, same rules | No |
| Q-PM-5 | Referrals delivered **before N1** have no client-key snapshot. Backfill from the job's client name at migration time (PD-014 can't apply retroactively)? | Yes | No |
| Q-PM-6 | Key rotation recomputes fingerprints from **current** candidate identifiers, not those at delivery. The fingerprint backfill does the same. OK? | Yes | No |
| Q-PM-7 | Does `client_confidential` change anything for the key? Proposal: no. The key is computed from the name whatever the flag, because the flag only controls display to partners. | No effect | No |
| Q-PM-8 | May the **hiring side see** that a referral was *released* (the `released_at` / `presentation_void` columns are on `referrals`, which both sides read), or should release be source-only? BR-25 only says "no notification". | Hiring side sees "withdrawn" only. The release flag is returned to the source side and admins only (source-only via a column-level read RPC or a separate closed table, +0.25 d) | No |
| Q-PM-9 | Pending-hit warning as a **two-step submit** (Risk 3). For product-designer to confirm in `spec.md`. | Two-step | Spec of submit flow |

Nothing here blocks starting P1–P3 and the data-model work today.
