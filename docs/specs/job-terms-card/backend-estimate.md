# Backend estimate: Job terms card, frozen into the agreement (N2)

Owner: Backend Engineer · Date: 2026-11-15 · Step 1b of the brief's team plan (read-only, no migrations written)
Inputs: `brief.md` rev. 1 (BR-1 to BR-41), `recruiting-input.md`, PD-044 to PD-049 (U-1 decided: platform basis `collected`, PD-049), code as of `717102d` + working tree.

---

## 0. Summary

| | |
|---|---|
| **Must total** | **14.75 days** (range 13 to 17) |
| **Should total** | 2.0 days (S1 flag 1.0, S2 client name 0.5, S3 below-band 0.5, S4 helper text 0) |
| **Fallback (PD-044)** | **Triggers** (Must > 12). Should 2 goes back to N3, Should 1 to a follow-up. I'd move Should 3 to the follow-up as well. Even then Must alone is about 2.75 days over the bar. §11 lists the trims the PM could choose from. |
| **U-1** | `collected` ships as the value of the rule's `platform_basis` (existing v1 rule, via the column default). `frozen` is implemented and tested. |

**Top risks** (details in §9):
1. **The visibility predicate gets missed somewhere** (R-2). There are seven SQL surfaces plus two TS readers, and today each one inlines `status = 'active' and accepts_external_referrals`. Mitigation: one `app.job_partner_visible()` function, a grep-based test that no inline copy remains, and a QA call against every surface.
2. **N1's "nothing raises after the gate" invariant (R2-1).** The `terms_changed` check has to run before `app.submission_gate`, and the snapshot inserts have to sit inside the existing post-gate `exception` block. Otherwise a stop or warning could roll back its own sticky stop and audit record.
3. **`ownership_protected_until` becomes nullable.** I checked every N1 reader and they are safe with NULL (§9). The TS types change from `string` to `string | null`, and the release dialog plus `withdrawReferral` currently do `new Date(...)` on that value.
4. **Long N1/N9 function bodies are copied to change one or two lines** (`file_prior_presentation_claim`, `respond_candidate_request`, `review_payment_evidence`, both submit RPCs). A divergence there is a silent regression. Mitigation: copy each body verbatim from its live migration, mark changes with `-- N2`, and re-run the full N1/N9 integration and E2E suites.
5. **Ledger with I < C:** the job-owner allocation can go negative. The amounts involved overflow `bigint` (P × bps × C), so the math must use `numeric` in SQL and `BigInt` in TS, with parity tests.

**Questions for the PM** (non-blocking: each has a recommended default, §10). Q1 (BR-3 vs BR-7 on candidate-confirmed delivery of legacy referrals) is the only one that changes behaviour visibly.

---

## 1. Code facts that shape the design (verified 2026-11-15)

| # | Fact | Where | Consequence |
|---|---|---|---|
| F1 | `referrals.ownership_protected_until` is `NOT NULL DEFAULT now() + 12 months`. Every `awaiting_candidate` row carries commit + 12 months. | `20261107000400_referrals.sql:24` | BR-19 needs the column to be **nullable** with no default. I checked the N1 readers against NULL: §9 R-3. |
| F2 | Connector/API updates patch `contract_type`, `salary_currency` and `client_name` on existing jobs (`present(row)`). They never touch `accepts_external_referrals`; inserts default it to false. | `src/server/ingest/upsert.ts` `jobRow`/`upsertJobs` | A sync can turn an open job non-permanent (the predicate hides it), or change the salary currency under a % card (the predicate hides it: §3). |
| F3 | `jobs_update` RLS is member-wide and all three roles hold `jobs:write`. A signed-in member can PATCH `accepts_external_referrals` directly through PostgREST today. | `20261107000200:299`, `permissions.ts` | N2 adds a guard trigger: false → true only through `save_job_terms` (§2.7). |
| F4 | `respond_candidate_request` re-checks `active ∧ accepts_external_referrals` before delivering. | `20261115000100:396` | BR-3 says the predicate applies at delivery. BR-7 says existing referrals on card-less jobs "can proceed". Q1. |
| F5 | `get_sent_referral_jobs` returns one row per **job** with the live fee and the current default rule. | `20261110000400:184` | BR-36 needs the share per **referral** from its snapshot (§4.10). |
| F6 | `report_hire` doesn't bound `p_guarantee_days` in SQL (`greatest(0, …)`); only Zod caps it at 365. | `20261107000500:288` | The new legacy path enforces 0–365 in SQL. |
| F7 | Placement status uses `contracted_fee_minor` and invoice totals for `commission_payable`. Settlement uses the sourcing and platform balances only. | `review_payment_evidence` | `contracted_fee_minor` keeps meaning **I** (invoiced). C is a new column. A negative job-owner balance doesn't affect status. |
| F8 | `review_payment_evidence` is the only allocation site (the wallet was dropped in `20261112000100`). TS mirror: `src/lib/money/allocate.ts` (`projectedSplit`, `summarizeForOrg` in `src/features/commissions/domain.ts`). | | There is one SQL change point and two TS projections. |
| F9 | The claim dialog computes the 6-month bound client-side (`priorDateRange`). `errors.json` `claim_date_invalid` and `referrals.json` `priorDateTooOld` say "6 months". | `claim-dialog.tsx:45` | The server returns the bound (§4.8). Copy needs a `{months}` parameter (ux-writer). |
| F10 | Test fixtures open jobs by direct insert: `helpers.createJob` (user client, 12 call sites) and `tests/e2e/support.ts` (service role). There are about 33 integration and 4 E2E submit calls. | `tests/` | The fixtures break under the guard trigger and the new submit signatures. This is budgeted as its own item (M14). |
| F11 | `set_match_triage` / `mark_matches_seen` don't check whether the job is still open. | `20261108000200` | BR-3 lists triage, so they get the predicate. |
| F12 | `app.client_key()` returns NULL for placeholder names. N1's key lives in `app.job_client_keys` (trigger) and is copied into `app.referral_presentations` at delivery. | `20261113000300` | The commit key is a separate closed table (BR-15). NULL is a valid snapshot value. |
| F13 | Postgres month arithmetic already clamps to the last day of the month (`'2026-08-31' + 6 months = 2027-02-28`). | | BR-18 needs no custom clamping: `(ts at time zone 'America/Toronto' + n months) at time zone 'America/Toronto'`. |

---

## 2. Schema

### 2.1 Enums (public, because the columns are readable)
```sql
create type public.fee_basis        as enum ('pct_base', 'pct_total_cash', 'flat');
create type public.search_type      as enum ('contingent_exclusive', 'contingent_shared', 'retained');
create type public.guarantee_remedy as enum ('replacement_only', 'replacement_then_prorata', 'prorata_refund', 'full_refund');
create type public.platform_basis   as enum ('collected', 'frozen');
create type public.terms_kind       as enum ('job', 'amendment');
```

### 2.2 `public.job_terms_versions` (job versions and concierge amendments share one table, so one set of constraints)
| Column | Type | Rule |
|---|---|---|
| `id` | uuid pk | |
| `job_id` | uuid not null → jobs, `on delete restrict` | |
| `organization_id` | uuid not null | = job's org (guard trigger, like `guard_candidate_child`) |
| `kind` | terms_kind not null | `job` = a job version. `amendment` = referral-scoped (BR-34) |
| `version_no` | integer not null | `job`: 1, 2, … per job. `amendment`: 1, 2, … per referral. Unique `(job_id, version_no) where kind='job'`, `(referral_id, version_no) where kind='amendment'` |
| `referral_id` | uuid → referrals | not null **iff** `kind = 'amendment'` |
| `amends_version_id` | uuid → job_terms_versions | the version the amendment replaces (amendment only) |
| `fee_basis` | fee_basis not null | T1 |
| `rate_bps` | integer | T2, `between 100 and 5000`; not null iff basis ≠ flat |
| `flat_fee_minor` | bigint | T2, `> 0`; not null iff basis = flat |
| `min_fee_minor` | bigint | T3, `> 0`, null when flat |
| `currency` | char(3) not null | T4, `~ '^[A-Z]{3}$'`; flat → `in ('CAD','USD','EUR','GBP','BRL')`; % → the job's `salary_currency` at publish (checked in the RPC) |
| `search_type` | search_type not null | T5 |
| `direct_client_attested_by` / `_at` | uuid / timestamptz not null | T6 (amendments copy them from the base version) |
| `guarantee_days` | smallint not null | T7, `in (0,30,60,90,120,180)` |
| `guarantee_remedy` | guarantee_remedy | T7, `(guarantee_days = 0) = (guarantee_remedy is null)` |
| `payment_terms_days` | smallint not null | T8, `between 0 and 90` |
| `ownership_months` | smallint not null | T9, `between 6 and 12` |
| `created_by` / `created_at` | uuid / timestamptz not null | |

- **Immutable (BR-4):** `before update or delete … execute app.prevent_mutation()`. This fires for every role, service role included. `revoke insert, update, delete … from authenticated, anon`.
- Index `(job_id, version_no desc) where kind = 'job'` serves the predicate and the "current version" lookup.
- **RLS select** through `app.can_see_terms_version(id)` (SECURITY DEFINER, so no recursion through `referrals`): a member of `organization_id` (the hiring side, which covers its job versions and amendments), **or** a member of the source org of a referral whose `terms_version_id = id` or whose id = `referral_id`, **or** a platform admin. Other partners read the current version **only** through `get_opportunities` (§4.2).
- The amendment's **reason and written-request reference are admin-only** (BR-38). They go in a closed table `app.terms_amendment_notes (version_id pk, reason text 10..1000, request_reference text 3..200)` with no grants, read by an admin RPC.
- "Current complete version" = the highest `version_no` with `kind = 'job'`. Constraints make every row complete and nothing can delete one, so "has a complete current version" ≡ "has any job version". The predicate therefore needs no completeness re-check.

### 2.3 Referral snapshot (BR-11, BR-13)
On `public.referrals` (readable by both orgs under the existing `referrals_select`; not writable by `authenticated`):
- `terms_version_id uuid → job_terms_versions` (the commit snapshot; always `kind='job'`)
- `commission_rule_id uuid → commission_rules` (the default rule at commit)
- `fee_estimate_minor bigint` (**proposal, Q4**: the money estimate A was shown at commit, null when it was hidden by `share_salary` or there was no band; flat → the flat amount)
- `check ((terms_version_id is null) = (commission_rule_id is null))`
- Guard trigger `referrals_guard_terms` (any role): these three columns can only be set at insert and never change (same pattern as `guard_referral_internal`).

Closed key table (BR-15), the same lockdown as N1's `app.*` tables:
```sql
create table app.referral_commit_keys (
  referral_id uuid primary key references public.referrals (id) on delete cascade,
  client_key  text,              -- app.client_key(jobs.client_name) at commit; NULL for placeholders
  created_at  timestamptz not null default now()
);
-- RLS on, no policies, revoke all from public, anon, authenticated. Never returned, never in audit metadata.
```

### 2.4 Effective terms
`app.effective_terms_version(p_referral uuid) returns uuid` returns the latest amendment of the referral if one exists, otherwise `referrals.terms_version_id` (NULL for legacy referrals). The agreement, `deliver_referral` (T9), `report_hire` and the displays all call this one function.

### 2.5 Commission rule platform basis (BR-28)
- `alter table public.commission_rules add column platform_basis public.platform_basis not null default 'collected';` The existing v1 rule becomes `collected` (PD-049). No new rule version is needed.
- `app.guard_rule_update` adds `platform_basis` to the immutable tuple.
- `publish_commission_rule` is dropped and recreated as `(p_name text, p_sourcing int, p_job_owner int, p_platform int, p_platform_basis public.platform_basis default 'collected')`. The name stays on the allow-list.

### 2.6 Agreement and placement
`public.collaboration_agreements`:
- `terms_version_id uuid` (the effective version at creation; NULL for legacy)
- `platform_basis public.platform_basis not null default 'collected'` (copied from the snapshot rule)
- `app.guard_agreement_update` adds `platform_basis` to the immutable tuple. `terms_version_id` may change **only** to an amendment of the same referral while no placement exists (§4.11).

`public.placements` (`contracted_fee_minor` keeps meaning **I**, F7):
- `terms_version_id uuid` (the effective version used at hire)
- `computed_fee_minor bigint` (C, `> 0`), `reported_base_minor bigint` (`> 0`), `reported_bonus_minor bigint` (`>= 0`)
- `fee_difference_reason text check (… in list)`, `fee_difference_note text check (char_length <= 500)`
- `check ((terms_version_id is null) = (computed_fee_minor is null))`
- `check (computed_fee_minor is null or computed_fee_minor = contracted_fee_minor or fee_difference_reason is not null)`
- A guard trigger makes these columns and `contracted_fee_minor`/`currency` immutable (only `status`, `version`, `settled_at` and `status_before_dispute` move).
- Reason list (**the designer owns the labels**): `client_negotiated`, `base_differs`, `fx_received`, `retainer_credited`, `other` (`other` requires a note).
- (S3 only) `band_min_at_hire_minor bigint`.

### 2.7 Jobs
- No new terms columns. `expected_fee_minor`, `fee_currency` and `share_fee` stay. They are ignored for partners and no longer written by the form. They stay readable for the owner's legacy KPI tile until the frontend replaces it.
- **Guard trigger `jobs_referral_flag_guard`** (BEFORE INSERT OR UPDATE OF `accepts_external_referrals`, any role): moving the flag false → true (or inserting true) raises `job_terms_required` unless `current_setting('app.job_terms_rpc', true) = 'on'`. Only `save_job_terms` sets that GUC (`set_config(…, true)`, transaction-local; PostgREST exposes no way to set it). Rows already open at migration time are untouched (no transition). This enforces BR-4 and BR-6 for user JWTs, service role, connectors and the API alike.

---

## 3. Partner-visibility predicate (BR-3)

```sql
create function app.job_partner_visible(j public.jobs) returns boolean
language sql stable security definer set search_path = '' as $$
  select j.status = 'active'
     and j.accepts_external_referrals
     and j.contract_type = 'permanent'
     and not exists (select 1 from public.organizations o where o.id = j.organization_id and o.suspended_at is not null)
     and exists (select 1 from public.job_terms_versions v
                  where v.job_id = j.id and v.kind = 'job'
                    and v.version_no = (select max(x.version_no) from public.job_terms_versions x where x.job_id = j.id and x.kind = 'job')
                    and (v.fee_basis = 'flat' or v.currency = j.salary_currency))
     -- S2 (if shipped): and app.client_key(j.client_name) is not null
$$;
```
- The **currency clause** covers F2: if a connector changes the salary currency under a % card, the job is hidden until the owner republishes (the nudge reason is `currency_mismatch`). Q3.
- The organization-suspension check moves into the predicate, so the surfaces that inline it today don't each have to repeat it.
- A job that isn't partner-visible returns `not_found` / `job_not_open_for_referrals` to other orgs. The **reason** is returned only to the owner (`get_jobs_terms_state`).

### Every place the predicate has to go

| # | Surface | Today | N2 change |
|---|---|---|---|
| V1 | `public.get_opportunities` (opportunities list, opportunity detail via `p_match`, submit screen, overview fit totals via `listOpportunities`) | inline `j.status='active' and j.accepts_external_referrals and o.suspended_at is null` (`20261110000400:170`) | `app.job_partner_visible(j)`; the return type changes (§4.2) |
| V2 | `app.assert_referable` (both submit RPCs) | inline (`20261113000400:63`) | predicate; same error `job_not_open_for_referrals` |
| V3 | `public.respond_candidate_request` (confirmed-path delivery) | inline (`20261115000100:396`) | predicate, with a **legacy exception** for referrals without a snapshot (Q1) |
| V4 | `app.deliver_referral` | no job check (callers check) | none: V2 and V3 cover both callers. A comment documents the invariant |
| V5 | `public.set_match_triage`, `public.mark_matches_seen` (via `app.assert_own_match`) | no job check (F11) | `not_found` / skip when the match's job isn't visible |
| V6 | `public.get_sent_referral_jobs` | live fee for any job with a sent referral | stops returning fee and share (§4.10). It shows the job status only, so the predicate doesn't apply |
| V7 | `public.presentation_admin_metrics` (`referral_open_jobs`) | inline (`20261113000700:129`) | count by the predicate, and add `referral_open_without_terms` (brief §4 metric) |
| V8 | Matching worker (`matching-service.ts:116,137`, `app.on_job_change`) | computes matches for `active ∧ accepts` | **unchanged on purpose.** Matches are never shown except through V1, and leaving them computed means a job shows its matches as soon as its card is published (a new version doesn't touch `jobs`, so nothing would re-trigger matching) |
| V9 | `src/features/overview/data.ts:63`, `jobs/[jobId]/page.tsx:62`, `jobs/page.tsx` (owner's own "open" badge and counts) | `accepts_external_referrals` | read `partner_visible` and `reason` from `get_jobs_terms_state` (§4.3), not a TS copy of the predicate |
| V10 | `get_job_match_summary` (owner counts) | counts unexpired matches | unchanged. The owner page shows the nudge instead of counts when not visible (frontend) |

Test guard: an integration test greps `supabase/migrations/*` for the latest definitions and fails if `accepts_external_referrals` appears in a partner-facing function other than `app.job_partner_visible`, `save_job_terms` and the guard trigger. Plus one direct call per surface V1 to V5 against a card-less job, a contract job, a currency-mismatched job and a suspended org.

---

## 4. RPCs and outcomes

All are `SECURITY DEFINER`, `set search_path = ''`, fully qualified, `revoke … from public, anon`, `grant … to authenticated` unless stated otherwise. Errors are stable lowercase codes mapped to `errors.*` i18n keys.

### 4.1 `public.save_job_terms` (new; BR-4, BR-5, BR-6, BR-32)
```sql
save_job_terms(
  p_job uuid,
  p_fee_basis public.fee_basis, p_rate_bps integer, p_flat_fee_minor bigint, p_min_fee_minor bigint,
  p_currency char(3), p_search_type public.search_type, p_attested boolean,
  p_guarantee_days integer, p_guarantee_remedy public.guarantee_remedy,
  p_payment_terms_days integer, p_ownership_months integer,
  p_open boolean
) returns table (terms_version_id uuid, version_no integer, created boolean, notified_orgs integer)
```
- Locks `jobs` row `FOR UPDATE`. Checks `app.has_role(j.organization_id, {org_admin, recruiter_manager, recruiter})` (= `jobs:write`), otherwise raises `not_found` (P0002).
- Card params all NULL with `p_open = false` closes the job (sets the flag false) and creates no version.
- Validates T1–T9 (`terms_invalid`, 22023; Zod gives the field errors first). For % bases, `p_currency` must equal `jobs.salary_currency` (`terms_currency_mismatch`).
- **No-op (BR-5):** if T1–T9 equal the current job version (attestation ignored), it returns the current version with `created = false`.
- Otherwise it requires `p_attested` (`terms_attestation_required`) and inserts `version_no = max + 1`.
- `p_open = true` requires `contract_type = 'permanent'` (`job_permanent_required`) and a version (`job_terms_required`). It sets the GUC and then `accepts_external_referrals = true`. `p_open = false` sets it false.
- When `version_no > 1` was created: one `app.notify_org(source_org, 'job.terms_changed', …)` per distinct source org with a live referral (`awaiting_candidate, submitted, under_review, info_requested, accepted, interviewing, offer`). English text, PII-free, link `/referrals`.
- Audit `job.terms_published` with `{version_no}` only.
- Rate limit `job.terms` 60/h, consumed inside the RPC.

### 4.2 `public.get_opportunities` (changed return type; BR-8, BR-9, BR-33, T10)
Drops `expected_fee_minor`, `fee_currency`, `your_share_minor` and keeps the other columns. Adds:
`terms_version_id, terms_version_no, terms_published_at, terms_updated_at` (the version date if `version_no > 1` and it is less than 30 days old, otherwise null), `fee_basis, rate_bps, flat_fee_minor, min_fee_minor, fee_currency, search_type, guarantee_days, guarantee_remedy, payment_terms_days, ownership_months`, `rule_name, rule_version, sourcing_bps, job_owner_bps, platform_bps` (current default rule), `estimated_fee_minor`, `estimated_share_minor`.
- Estimate: flat = the flat amount. % bases = `max(round(rate × midpoint(salary_min, salary_max)), min_fee)`, **only when `share_salary`** and a band exists, otherwise null. Share = estimate × `sourcing_bps`, null for `internal`. Basis, rate, minimum fee and the flat amount are always returned.

### 4.3 `public.get_jobs_terms_state(p_org uuid, p_job uuid default null)` (new, owner only)
Returns per job: `job_id, partner_visible boolean, hidden_reason text` (`closed | not_open | not_permanent | no_terms | currency_mismatch | org_suspended`, plus `no_client_name` with S2), the current version (all T fields, `version_no`, `created_at`), and `has_live_referrals boolean` (BR-33 form notice). Membership checked, otherwise `forbidden`. It powers the job list, the job page, the edit form prefill and the nudge (BR-7).

### 4.4 Submit RPCs (changed signatures; BR-11, BR-12, BR-14)
Both are **dropped and recreated** (not overloaded, so no older signature can bypass the check). Each gains `p_terms_version uuid` and keeps its N1/N9 body otherwise:
```sql
submit_referral(p_candidate, p_job, p_fields, p_document_ids, p_consent, p_idempotency_key,
                p_terms_version uuid, p_note default null, p_acknowledge_pending default false, p_new_consent default null)
  returns table (outcome text, referral_id uuid, reference text)
submit_referral_for_candidate(p_candidate, p_job, p_fields, p_document_ids, p_idempotency_key,
                p_terms_version uuid, p_note default null, p_ttl_days default 14, p_acknowledge_pending default false)
  returns table (outcome text, referral_id uuid, created boolean, destination text, reference text)
```
Order of operations (N2 parts in **bold**):
1. unauthenticated check → rate limit `referral.submit` 30/h → idempotency-key validation → **idempotent replay returns `created` (no version check on replay)**
2. `assert_referable` (**now with the predicate**) → consent / email / document checks (unchanged)
3. **`select … from jobs where id = p_job for share`, then the current job version. If `p_terms_version` is null or isn't that id → `app.audit(source_org, 'referral.terms_changed', 'job', p_job, '{}')` and return outcome `terms_changed`** (no referral, no fingerprints, no presentation outcome, no sticky stop, no email). A version id belonging to another job is simply "not current" (IDOR-safe, no oracle).
4. `app.submission_gate` (unchanged: `stopped`, `pending_warning`, `identifier_required`). On the acknowledged second call, step 3 has already re-checked the version (BR-12).
5. Inside the existing R2-1 `begin … exception` block: insert the referral **with `terms_version_id`, `commission_rule_id` = the default rule now, `fee_estimate_minor`**; **insert `app.referral_commit_keys(app.client_key(j.client_name))`**; the rest is unchanged.

Outcomes: `created | stopped | pending_warning | identifier_required | terms_changed` plus the existing returned codes (`conflict`, `failed`, …). `rotate_candidate_request_token` and `issue_candidate_request_token` are **not touched** (BR-14).

### 4.5 `app.create_agreement_for_referral` (BR-16, BR-17)
If `referrals.commission_rule_id` is set, the function reads **that** rule (retired or not): bps, name, version, `platform_basis`. It applies the internal transform as today and stores `terms_version_id = app.effective_terms_version(r)`. Otherwise it keeps today's code path (current default rule, `terms_version_id` NULL). `terms_version` text is unchanged.

### 4.6 Ownership at delivery (BR-18, BR-19)
- `app.add_months_et(p_ts timestamptz, p_months int) returns timestamptz` = `((p_ts at time zone 'America/Toronto') + make_interval(months => p_months)) at time zone 'America/Toronto'` (immutable; Postgres clamps the day, F13).
- `app.deliver_referral` (one statement added to its existing `update public.referrals`): `ownership_protected_until = app.add_months_et(now(), coalesce((select ownership_months from job_terms_versions where id = app.effective_terms_version(p_referral)), 12))`.
- `respond_candidate_request` loses `ownership_protected_until = now() + interval '12 months'` (its body is otherwise copied verbatim from `20261115000100`, plus V3).
- `alter column ownership_protected_until drop default, drop not null`.

### 4.7 Look-back (BR-20)
`file_prior_presentation_claim` (body copied verbatim from `20261113000900`) changes one line: `v_date < (v_delivered - make_interval(months => coalesce(<effective T9>, 6)))::date`. The effective T9 is safe here because BR-35 forbids a T9 amendment after delivery, and claims only exist after delivery.

### 4.8 `get_referral_presentation` (BR-20 date picker)
Adds `claim_prior_date_min` (date, ET) and `lookback_months` for the target side. The claim dialog uses them instead of `priorDateRange`.

### 4.9 `public.report_hire` (new signature; old one dropped; BR-21 to BR-26)
```sql
report_hire(
  p_referral uuid, p_expected_version integer, p_start_date date,
  -- snapshot referrals
  p_base_minor bigint default null, p_bonus_minor bigint default null,
  p_invoiced_fee_minor bigint default null, p_difference_reason text default null, p_difference_note text default null,
  -- legacy referrals only (no snapshot)
  p_legacy_fee_minor bigint default null, p_legacy_currency char(3) default null, p_legacy_guarantee_days integer default null
) returns uuid  -- placement id
```
Membership, version, status and agreement checks are unchanged. Then, with `v = effective terms`:
- **Snapshot:** any `p_legacy_*` not null → `terms_frozen` (22023), which covers BR-25's "refuses any attempt to pass them". By basis:
  - `pct_base`: base > 0 required, bonus must be null.
  - `pct_total_cash`: base > 0 and bonus ≥ 0 required.
  - `flat`: base and bonus must be null.
  - Otherwise `hire_base_invalid`.
  - `C = app.compute_fee(v, base, bonus)` (half-up, `numeric`, ≥ min fee).
  - `I = coalesce(p_invoiced, C)`, which must be > 0.
  - If `I ≠ C`, a reason from the list is required (`other` needs a note), otherwise `fee_difference_reason_required`. If `I = C`, a reason is refused.
  - Currency = `v.currency`. `guarantee_until = case when v.guarantee_days = 0 then null else p_start_date + v.guarantee_days end`.
- **Legacy:** any snapshot param not null → `terms_not_recorded` (22023). Then today's free entry: fee > 0, `^[A-Z]{3}$`, guarantee **0..365 enforced in SQL** (F6).
- `I ≠ C`: `app.notify_org(source_org, 'placement.fee_difference', …)` with both amounts and the reason code (English, no PII).
- Audit `placement.created` with `{fee_minor: I, computed_fee_minor: C, currency, terms_version_id}`. **The base and bonus never go in audit metadata** (compensation data).
- TS mirror `computeFee()` lives in `src/lib/money/terms.ts`, parity-tested against `app.compute_fee`.

### 4.10 Snapshot reads (BR-36, BR-37)
- **`public.get_referral_terms(p_referral uuid, p_acting_org uuid) returns jsonb`** (new). The side is resolved like `get_referral_presentation` (target side never for `hidden_from_target` statuses), otherwise `not_found`. Returns `recorded: boolean` (false means "terms not recorded"), the `snapshot` version fields with number and date, `effective` (the amendment, if any, with number and date, **without the reason**), `rule` (name, version, bps, platform_basis from the snapshot rule, or from the agreement for legacy), and `expected_share_minor` (from `fee_estimate_minor` × snapshot sourcing bps, null when internal or no estimate). Never the client key.
- **`get_sent_referral_jobs`** is dropped and recreated without `expected_fee_minor`, `fee_currency` and `your_share_minor` (status only). The sent list reads per-referral terms through RLS (`referrals.terms_version_id` → `job_terms_versions` → `commission_rules`) or by calling `get_referral_terms` per row (frontend's choice; I'd go with the embedded select).
- Commissions page: the `placements` select adds `computed_fee_minor, reported_base_minor, reported_bonus_minor, fee_difference_reason, fee_difference_note, terms_version_id`, and `agreement.platform_basis`.

### 4.11 Concierge amendment (BR-34, BR-35)
```sql
admin_amend_referral_terms(p_referral uuid, <the 11 T1–T9 params as in 4.1, minus p_attested>,
                           p_reason text, p_request_reference text) returns uuid
admin_get_terms_amendments(p_referral uuid) returns table (... incl. reason, request_reference)
```
- Requires `app.is_platform_admin()` (otherwise `forbidden`). The referral must have a snapshot (otherwise `terms_not_recorded`, Q5). No placement may exist (`hire_already_reported`). A T9 change on a delivered referral → `window_locked`. Reason 10..1000 and reference 3..200 → `amendment_reason_required`.
- Inserts a `kind='amendment'` version (T6 copied from the base) and the note row. If an agreement exists, sets `collaboration_agreements.terms_version_id` to the new id (Q8).
- Notifies both orgs (`referral.terms_amended`). Audits the platform event (`organization_id` null, `{referral_id, version_id}`) and one member event per org without the reason. Ownership and claim deadlines are not touched.

### 4.12 API-surface allow-list
Additions: `save_job_terms`, `get_jobs_terms_state`, `get_referral_terms`, `admin_amend_referral_terms`, `admin_get_terms_amendments` (S1 adds `terms_worsening_flags`). Re-signed under the same names: `submit_referral`, `submit_referral_for_candidate`, `report_hire`, `publish_commission_rule`, `get_opportunities`, `get_sent_referral_jobs`. No anon additions. No service-role use is added (`docs/architecture.md` is unchanged).

---

## 5. Allocation (BR-27 to BR-30)

```sql
app.allocate_placement(p_amount bigint, p_sourcing_bps int, p_job_owner_bps int, p_platform_bps int,
                       p_basis public.platform_basis, p_computed bigint, p_invoiced bigint) returns bigint[]  -- {sourcing, job_owner, platform}
```
- **If `p_computed is null` (legacy) or `p_invoiced >= p_computed`:** `return app.allocate_minor(p_amount, {s, jo, pl})`. This is today's function, unchanged, with today's rounding (BR-27 "exactly today's split", BR-30).
- **Otherwise (I < C)**, with `sign = sign(P)`, `A = |P|` and `rh(n, d) = (2n + d) div (2d)` (round half up on non-negative `numeric`):
  - `sourcing = sign × rh(A × s_bps × C, I × 10000)`
  - `platform = sign × rh(A × pl_bps, 10000)` when `collected`, or `sign × rh(A × pl_bps × C, I × 10000)` when `frozen`
  - `job_owner = P − sourcing − platform` (can be negative)
- `numeric` is mandatory because A × bps × C exceeds `bigint` (10¹⁰ × 10⁴ × 10¹⁰). The TS mirror `allocatePlacement()` in `src/lib/money/allocate.ts` uses `BigInt`. A parity test runs about 500 random cases plus the edge cases below through both implementations.
- Rounding is symmetric (on |P|), so a full refund of a payment reverses it exactly. Per-payment rounding can drift by at most 1 minor unit per party per payment against a single lump sum (Q7).
- `review_payment_evidence` (body copied verbatim) replaces its `allocate_minor` call with `allocate_placement(v_distributable, a.*, a.platform_basis, p.computed_fee_minor, p.contracted_fee_minor)`. Ledger memos become `'4500 bps of computed fee'` on the floor path. `projectedSplit` / `summarizeForOrg` switch to `allocatePlacement(I, …, C)`.

### Worked examples (split 4500 / 4500 / 1000; amounts in minor units, CAD)

**E1. I ≥ C (both bases identical):** base 100,000.00, 20% → C = 2,000,000. B invoices I = 2,200,000 (reason `client_negotiated`, upside). Payment P = 2,200,000.
`allocate_minor(2,200,000)` → sourcing **990,000**, job owner **990,000**, platform **220,000**. Same as today.

**E2. I < C, full payment:** C = 2,000,000, I = 1,600,000 (discount without amendment). P = 1,600,000, k = 1.
| | `collected` (shipping, PD-049) | `frozen` | today (no floor) |
|---|---|---|---|
| sourcing | 0.45 × 2,000,000 = **900,000** | **900,000** | 720,000 |
| platform | 0.10 × 1,600,000 = **160,000** | 0.10 × 2,000,000 = **200,000** | 160,000 |
| job owner | 1,600,000 − 900,000 − 160,000 = **540,000** | **500,000** | 720,000 |

**E3. I < C, partial payments and a processing fee:** same placement. The client pays 803,000 with a 3,000 processing fee, so P = 800,000 and k = 0.5.
- `collected`: sourcing 450,000 · platform 80,000 · job owner 270,000
- `frozen`: sourcing 450,000 · platform 100,000 · job owner 250,000

The second payment of 800,000 gives the same figures again, so the totals equal E2. Status stays `payment_partially_verified` until verified collections reach the invoice total (unchanged rule, F7).

**E4. Rounding:** C = 1,234,567, I = 1,000,000, P = 333,333.
- sourcing = rh(333,333 × 4500 × 1,234,567 / 10¹⁰) = rh(185,184.86) = **185,185**
- `collected`: platform rh(33,333.3) = **33,333**, job owner **114,815**
- `frozen`: platform rh(41,152.19) = **41,152**, job owner **106,996**

**E5. Deep discount, negative job owner:** C = 2,000,000, I = 200,000, P = 200,000.
- `collected`: sourcing 900,000 · platform 20,000 · job owner **−720,000**. B funds A's share of the discount (R-4).
- A's payout cap (`payout_exceeds_balance`) uses the 900,000 sourcing balance, so B can record payouts up to that amount. The placement settles when the sourcing and platform balances reach 0 (unchanged).

**E6. Refund on E2:** a full refund of 1,600,000 gives exactly −900,000 / −540,000 / −160,000 (`collected`).

---

## 6. Server Actions, Zod, queries (backend-owned TS)
- `src/features/jobs/schemas.ts`: add a `termsCardSchema` (T1–T9, rate entered as a percent with 2 decimals → bps, flat in major units → minor). `jobFormSchema` refines: open ⇒ permanent ∧ complete card (BR-6 field errors). `shareFee` and `expectedFee`/`feeCurrency` are removed from the form schema.
- `src/features/jobs/actions.ts`: `toRow` drops `accepts_external_referrals`, `share_fee`, `expected_fee_minor` and `fee_currency`. `createJob` / `updateJob` write the job row (user client) and then call `save_job_terms` (open flag + card) in the same action. On an RPC error the action returns field errors; the job row is already saved (closed).
- `src/features/jobs/queries.ts`: `getJobsTermsState(ctx, jobId?)`.
- `src/features/referrals/schemas.ts`: `submitReferralSchema.termsVersionId: z.uuid()`. `reportHireSchema` becomes a discriminated union (`snapshot` | `legacy`).
- `src/features/referrals/actions.ts`: pass `p_terms_version`, map the `terms_changed` outcome (`SubmitOutcome` gains `{ outcome: "terms_changed" }`), new `reportHire` arguments.
- `src/features/admin/actions.ts`: `amendReferralTerms` (guard, `assertPlatformAdmin`, Zod, rate limit `admin.amend` 30/h).
- `src/lib/money/terms.ts` (`computeFee`, `estimateFee`, `addMonthsEt` for display only) and `allocatePlacement` in `allocate.ts`, all pure and unit-tested.
- New error keys (ux-writer finalises the copy): `terms_invalid`, `terms_currency_mismatch`, `terms_attestation_required`, `job_terms_required`, `job_permanent_required`, `terms_changed`, `terms_frozen`, `terms_not_recorded`, `hire_base_invalid`, `fee_difference_reason_required`, `hire_already_reported`, `window_locked`, `amendment_reason_required`. `claim_date_invalid` gets a `{months}` parameter.

---

## 7. Migration and backfill plan (local only; no hosted push unless the user asks)

| File | Content |
|---|---|
| `2026111600010_terms_schema.sql` | enums; `job_terms_versions` + immutability, RLS, grants, indexes; `app.terms_amendment_notes`; `app.referral_commit_keys`; referral snapshot columns + guard; `commission_rules.platform_basis` + guard; agreement/placement columns + guards; `ownership_protected_until` drop default / not null; `app.job_partner_visible`, `app.effective_terms_version`, `app.add_months_et`, `app.compute_fee`, `app.allocate_placement`; jobs flag guard trigger |
| `2026111600020_terms_publish_visibility.sql` | `save_job_terms`, `get_jobs_terms_state`, `get_opportunities`, `assert_referable`, triage guards, `presentation_admin_metrics`, `publish_commission_rule` |
| `2026111600030_terms_commit_delivery.sql` | both submit RPCs (drop + create), `deliver_referral`, `respond_candidate_request`, `create_agreement_for_referral`, `file_prior_presentation_claim`, `get_referral_presentation` |
| `2026111600040_terms_hire_ledger_amend.sql` | `report_hire` (drop old + create), `review_payment_evidence`, `get_referral_terms`, `get_sent_referral_jobs`, amendment RPCs, grants |

**Backfill (none invents terms, BR-7, BR-17, BR-19):**
- **Jobs:** no versions are created. Open jobs keep `accepts_external_referrals = true` and are hidden by the predicate until the owner publishes a card (then visible immediately, existing matches included, V8). Non-permanent open jobs stay hidden. The nudge comes from `get_jobs_terms_state.hidden_reason`.
- **Referrals:** `terms_version_id` / `commission_rule_id` stay NULL, which means legacy: today's agreement, free hire entry, today's allocation, "terms not recorded". Stored ownership dates on **delivered** referrals are never touched. **Undelivered** rows (`delivered_at is null`) get `ownership_protected_until = null` (Q2). A legacy referral delivered after N2 gets delivery + 12 months from `deliver_referral`.
- **Agreements:** `platform_basis` defaults to `collected`, `terms_version_id` stays NULL. **Placements:** C stays NULL, so allocation is today's exactly.
- **Commission rule v1:** `platform_basis = collected` by default (PD-049).
- **Hosted-push precondition** (launch checklist, Ops). Run read-only first:
  ```sql
  select count(*) from public.jobs where status = 'active' and accepts_external_referrals;          -- become hidden
  select count(*) from public.referrals where delivered_at is null and status = 'awaiting_candidate'; -- legacy, 12 months at delivery
  select count(*) from public.placements;                                                             -- all legacy
  ```
- Locally: `npm run db:reset` then `npm run db:types`. Fixture updates land in the same change (M14).

---

## 8. Tests

**Unit (Vitest):** `computeFee` (each basis, minimum binding, half-up), `allocatePlacement` (I ≥ C equals `allocateMinor`, E2 to E6, both bases, sign symmetry, BigInt range), `addMonthsEt` (31 Jan + 1 = 28/29 Feb, 31 Aug + 6 = 28 Feb, DST), `termsCardSchema` (bounds, remedy null iff 0 days, flat currency list), the `reportHireSchema` union.

**Integration (`tests/integration/terms-card.test.ts` and `terms-ledger.test.ts`):**
- *Immutability:* update and delete of a version as owner, other org, platform admin and service role → refused. Direct insert as `authenticated` → refused.
- *Versioning:* a save with no change → one version. A change → v2. Attestation required. Non-member → `not_found`. Recruiter, manager and admin of the owner org → allowed.
- *Guard:* opening via direct PATCH (user JWT), service-role insert or update, and `/api/v1/jobs` / `upsertJobs` → refused or ignored. Opening a contract job or a job without a card → refused.
- *Visibility matrix:* jobs with no card, contract type, currency mismatch, suspended org, closed status, and a valid card × V1, V2 (both RPCs, direct calls), V3, V5 → not found / refused, with no reason leaked. The owner sees the reason. A grep test checks that no inline predicate remains.
- *Isolation and IDOR:* a third org can't read versions. Source reads only versions referenced by its referrals. Target reads its own. A version id from another job → `terms_changed`. `get_referral_terms` cross-tenant → `not_found`. Client key absent from every response and from audit metadata (scan `audit_events`).
- *Commit:* v1 shown, v2 published, submit → `terms_changed` with no referral, no fingerprint, no hit row, no sticky stop, one audit. Resubmit with v2 → created on v2. Pending-warning two-step with a version change in between → `terms_changed`. Confirmed path: v1, then v2, then resend, then confirm → keeps v1, ownership = delivery + v1 window. New default rule between submit and accept → the agreement uses the commit rule. Internal referral → 0 sourcing bps from the snapshot rule.
- *Ownership:* recorded path with 6 months delivered 31 Aug (clock via SQL) → 28 Feb ET. Legacy delivered after N2 → +12. Stored legacy dates unchanged. Undelivered → NULL.
- *Look-back:* 12-month window accepts 11 months back. 6-month window refuses it. Legacy keeps 6. `claim_prior_date_min` matches.
- *Hire:* % base, total cash (minimum binding), flat. Passing currency or guarantee on a snapshot referral → `terms_frozen`. Legacy free entry works only without a snapshot. I ≠ C without a reason → refused. With a reason → notification to the source with both numbers. Base absent from audit.
- *Ledger:* E1 to E6 through `record_payment_evidence` + `review_payment_evidence` for both bases (a test rule with `frozen`). Settlement completes with a negative job owner. SQL ↔ TS parity on random cases. Journey test (legacy path) unchanged.
- *Amendment:* before hire → agreement, hire and ledger use the amendment, the original stays readable, both orgs notified, reason invisible to members. After hire → refused. T9 on a delivered referral → refused. Non-admin → forbidden.
- *Change notifications:* only sources with live referrals, once per org. `terms_updated_at` appears for 30 days, not on v1.
- *N1/N9 regression:* the existing suites, run unchanged apart from fixtures (duplicate stop, sticky, claim/contest, release, forged token, resend).

**E2E:** fixture updates only (the QA agent owns the new journeys).

---

## 9. Risks to N1/N9 invariants

| # | Invariant | Risk | Mitigation |
|---|---|---|---|
| R-1 | N1 R2-1: nothing raises after the gate; a stop/warning always commits its hit, sticky stop and audit | A terms check after the gate, or a snapshot insert outside the `exception` block, rolls them back | The check sits before the gate as a returned outcome. The snapshot inserts sit inside the existing block. A test asserts a hit row and audit after a `stopped` on a snapshot job |
| R-2 | N1 BR-22 "every attempt counts" | `terms_changed` consumes one of the 30/h submits (after the rate-limit call) | Consistent with N1. A race costs A one attempt (Q6) |
| R-3 | N1 "still counts", purge and evidence read `ownership_protected_until` | NULL on undelivered rows | Checked: `presentation_counts` needs `delivered_at is not null` first; the `purge_presentation_data` OR-chain treats NULL as not-matching; `evidence_referral_ok` needs both `delivered_at`; `get_referral_presentation` returns `not_delivered` before reading the date (source) and target never sees undelivered rows. TS fallout: `referrals/actions.ts:334`, the release dialog, `admin/queries.ts:50`, page line 682 (typecheck catches them) |
| R-4 | N1 protection length | New referrals are protected for 6–12 months instead of 12, so fingerprints purge earlier and evidence eligibility shrinks | Intended (BR-19 consequence). N1 tests that set dates explicitly keep passing. QA adds one "6-month referral stops counting at month 7" case |
| R-5 | N1 per-hiring-org serialisation (EC-3) and deadlocks | A new lock on `jobs` in submit | Order: candidate `FOR UPDATE` → job `FOR SHARE` → advisory lock. `save_job_terms` takes only the job `FOR UPDATE`. `respond_candidate_request` doesn't lock the job. No cycle |
| R-6 | N1 client-key snapshot at delivery (BR-15) | Confusing the two keys | Separate closed table, never joined by N1 code. The divergence goes to S-N2-3 |
| R-7 | N9 token issuance and resend never re-snapshot (BR-14) | Touching `rotate_…` / `issue_…` | Not redefined. A test covers v1 → v2 → resend → confirm |
| R-8 | N9 `respond_candidate_request` integrity (token_issued_at, consent evidence) | Copying a 150-line body to change two statements | Verbatim copy from `20261115000100`, `-- N2` markers, full N9 integration + E2E re-run |
| R-9 | Signatures | Overloading would let a stale caller skip the version check | Drop + create for the submit RPCs and `report_hire`. The allow-list test fails on any leftover overload |
| R-10 | Test fixtures | About 37 call sites and 2 fixture helpers change. A mistake there can mask N1/N9 regressions | Fixture changes are mechanical and isolated (helper returns `{ id, termsVersionId }`). Review the diff of N1/N9 test files for fixture-only changes |
| R-11 | Ledger | The floor path wrongly reached for I ≥ C | Branch on `I >= C` to the untouched `allocate_minor`. Parity and journey tests |

---

## 10. Questions for the PM (default in bold; none blocks step 4)
- **Q1 (BR-3 vs BR-7):** a pre-N2 `awaiting_candidate` referral on a job with no card. The candidate confirms (or confirms after a resend) once N2 is live. Deliver or refuse? **Default: deliver.** Legacy referrals keep today's check (`active ∧ open ∧ not suspended`). Snapshot referrals use the full predicate.
- **Q2:** set `ownership_protected_until` to NULL on existing **undelivered** rows? **Default: yes.** The value is meaningless (BR-19). Delivered dates are untouched.
- **Q3:** % bases: any supported salary currency (the money lib's 29) vs the five flat currencies. And hide the job when a connector changes the salary currency under a % card? **Default: any supported currency; hide with reason `currency_mismatch`.**
- **Q4 (BR-36):** the snapshot has no salary band, so "A's expected share from the snapshot" on % bases needs the estimate A saw. **Default: freeze `fee_estimate_minor` at commit** (null when `share_salary` hid it).
- **Q5:** amendment on a legacy referral? **Default: refuse** (no frozen terms, no floor gap).
- **Q6:** `terms_changed` counts toward the 30/h submit limit. **Default: yes** (N1 consistency).
- **Q7:** I < C rounding. **Default: half-up per payment**, job owner takes the remainder (≤ 1 unit drift per payment). The alternative is cumulative re-allocation on running totals (+0.25 d).
- **Q8:** an amendment after acceptance repoints `collaboration_agreements.terms_version_id` (the only allowed agreement change). **Default: yes**, so the agreement never shows stale terms.
- **Q9:** on a flat basis, the hire asks for no base (so S3 can't flag flat hires). **Default: no base on flat.**

---

## 11. Effort (backend days, tests included per item)

| # | Must item | BR | Days |
|---|---|---|---|
| M1 | Schema: enums, versions table (immutability, RLS, grants), closed key and notes tables, referral/agreement/placement columns and guards, rule `platform_basis`, ownership column | 1, 2, 4, 11, 13, 15, 28 | 1.0 |
| M2 | `save_job_terms` (validation, no-op, numbering, attestation, open/close, BR-32 notifications), jobs flag guard, `get_jobs_terms_state`, job Zod + actions | 1, 4–7, 10, 32, 33 | 1.5 |
| M3 | Predicate + V1/V2/V3/V5/V7; `get_opportunities` new columns (card, gated estimate, T10, `terms_updated_at`); surface tests | 3, 7, 8, 9, 33 | 1.5 |
| M4 | Both submit RPCs (version check, `terms_changed`, lock, snapshot), drop/recreate, action + outcome | 11, 12, 14, 15 | 1.0 |
| M5 | Agreement from the snapshot, `effective_terms_version` | 16, 17 | 0.5 |
| M6 | Ownership at delivery (`add_months_et`, `deliver_referral`, `respond_candidate_request`), nullable column and TS fallout | 18, 19 | 0.75 |
| M7 | Look-back in claims + `claim_prior_date_min` | 20 | 0.5 |
| M8 | `report_hire` v2, `compute_fee` + TS mirror + parity, I ≠ C notification, Zod union | 21–26 | 1.25 |
| M9 | `allocate_placement` + TS mirror + parity, `review_payment_evidence`, commissions projections | 27–30 | 1.25 |
| M10 | Change-handling remainder (30-day line, has-referrals notice) | 31–33 | 0.25 |
| M11 | Concierge amendment RPCs, admin action, agreement repoint, notifications, audit | 34, 35 | 1.25 |
| M12 | `get_referral_terms`, sent-referral per-referral share, commissions placement fields, frozen estimate | 36, 37 | 1.0 |
| M13 | Error codes / i18n keys for backend errors | 38 | 0.25 |
| M14 | N1/N9/journey fixture migration (helpers, about 37 submit calls, E2E support, `report_hire` in the journey) | — | 1.0 |
| M15 | Cross-cutting isolation / IDOR / role / visibility matrix suite | 3, §7 | 1.0 |
| M16 | `db:reset`, `db:types`, allow-list, lint/typecheck fix-ups, `backend.md`, domain-model, security-and-privacy | — | 0.75 |
| | **Must total** | | **14.75** |

| # | Should item | Days |
|---|---|---|
| S1 | Worsening flag RPC `terms_worsening_flags()` (consecutive-version comparison, BR-39) + admin metrics line + tests | 1.0 |
| S2 | Client-name gate (predicate clause + `save_job_terms` refusal + `hidden_reason`), BR-40 | 0.5 |
| S3 | Below-band alert (`band_min_at_hire_minor` at hire, flag in `get_referral_terms`), BR-41 | 0.5 |
| S4 | Brazil / retained helper text | 0 (frontend) |

**Fallback recommendation.** Must is 14.75 days, so PD-044's fallback triggers: S2 goes back to N3 and S1 to a follow-up. I'd also move S3 to the follow-up. That still leaves Must about 2.75 days over the bar, which the PM should know before step 4. Options, without changing any BR's intent:
- (a) **Accept about 15 days.**
- (b) **Ship N2 in two backend drops.**
  - Drop 1 (about 9.5 days: M1–M7, M10, M13–M16 in part) covers the card, the gate, the snapshot, the agreement, the window and the look-back.
  - Drop 2 (about 5.25 days: M8, M9, M11, M12) covers the hire, the ledger, the amendment and the displays.
  - This is safe only if drop 2 lands before any real hire. Pre-launch there are no real placements, but in the gap snapshot referrals would temporarily use the legacy hire entry, which BR-21 forbids, so the PM must accept that.
- (c) **Trim M12** to `get_referral_terms` only. The sent list then shows basis and rate without a money share. This saves about 0.5 days.

S2 alone costs 0.5 days because it shares the predicate. If the PM wants to keep it despite the fallback, it's the cheapest Should to keep.
