# Backend contract: Job terms card (N2), v2.5 (drops 1 + 2 + review fixes + QA-N2-07 to QA-N2-09 + F-1 + QA-N2-10 to QA-N2-12)

Owner: Backend Engineer · Date: 2026-11-15 · Brief rev. 2 (PD-044 to PD-052) · Spec: `spec.md` (copy final in §5)
Scope: the whole N2 backend Must.
- v1 (drop 1, step 4a): M1–M7, M10, M13.
- v2 (drop 2, step 4b): M8 (`report_hire` v2), M9 (ledger), M11 (concierge amendment), trimmed M12 (snapshot reads), plus M14–M16. `hire_terms_pending` is gone from the database (the drop-1 interim function is dropped by migration 4; its text remains only in the historical migration 3, which isn't edited once applied).

Migrations (local only; never pushed to the hosted project):

| File | Content |
|---|---|
| `supabase/migrations/20261116000100_terms_schema.sql` | Enums, `public.job_terms_versions`, referral snapshot columns + guard, `app.referral_commit_keys`, nullable ownership date, `commission_rules.platform_basis`, agreement columns + guard, helpers (`app.job_partner_visible`, `app.current_job_terms`, `app.effective_terms_version`, `app.terms_estimate`, `app.add_months_et`, `app.job_hidden_reason`) |
| `supabase/migrations/20261116000200_terms_publish_visibility.sql` | `save_job_terms`, the jobs referral-flag guard, `get_jobs_terms_state`, `get_opportunities` (new return type), the predicate in `assert_referable` / triage / seen marks, `get_sent_referral_jobs` (fee columns removed), admin metrics, `publish_commission_rule` (+ platform basis) |
| `supabase/migrations/20261116000300_terms_commit_delivery.sql` | Both submit RPCs (`p_terms_version`, `terms_changed`, snapshot), `deliver_referral` (ownership), `respond_candidate_request` (delivery check, no hard-coded 12 months), `create_agreement_for_referral` (snapshot rule), `file_prior_presentation_claim` + `get_referral_presentation` (look-back), `report_hire` (drop-1 interim, superseded by migration 4) |
| `supabase/migrations/20261116000900_terms_amendment_expected_currency.sql` | QA-N2-12: `admin_amend_referral_terms` gains `p_expected_currency char(3) = null` (old 15-arg signature dropped, not overloaded); a % amendment whose stored currency differs → `stale_version` |
| `supabase/migrations/20261116000800_terms_amendment_currency.sql` | F-1: flat → % amendment refused without a usable job salary currency (`terms_incomplete`); `admin_get_referral_terms` returns `job_salary_currency` and `pct_amendment_currency` |
| `supabase/migrations/20261116000700_terms_estimate_payment_bounds.sql` | QA-N2-09: `app.terms_estimate` returns null for an estimate ≤ 0. QA-N2-08: payment/refund evidence ≤ 10^12 minor units (trigger, `invalid_fee`); `app.allocate_placement` refuses \|P\| > 10^12 (`invalid_fee`); `app.allocate_minor` rewritten in exact numeric (identical results, can't overflow) |
| `supabase/migrations/20261116000600_terms_fee_bounds.sql` | QA-N2-07: flat and minimum fees ≤ 10^12 minor units in `save_job_terms`, `admin_amend_referral_terms` and as check constraints; `app.terms_estimate` and the new `app.estimate_share_safe` fail closed (null for the row, never an error); `report_hire` compares its I bounds in numeric |
| `supabase/migrations/20261116000500_terms_review_fixes.sql` | Review round: `report_hire` takes `p_terms_version` (`hire_terms_changed`) and bounds the base and I (`hire_base_invalid`); `app.allocate_placement` raises `invalid_fee` instead of a raw bigint overflow |
| `supabase/migrations/20261116000400_terms_hire_ledger_amend.sql` | Placement fee columns + immutability, `app.compute_fee`, `app.allocate_placement`, `app.money_code`, `report_hire` v2 (old signature dropped), `review_payment_evidence` (allocation), `app.terms_amendment_notes`, `admin_amend_referral_terms`, `admin_get_referral_terms`, `get_referral_terms_context` |

Migrations 3 and 4 copy live function bodies with a script that asserts each N2 edit applies exactly once. Every N2 change is marked `-- N2` in the SQL.

---

## 1. Data model

### 1.1 `public.job_terms_versions` (immutable)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `job_id`, `organization_id` | uuid | `organization_id` = the job's org (trigger) |
| `kind` | `terms_kind` (`job` · `amendment`) | `amendment` rows are written from v2 only |
| `version_no` | int | Per job for `job` rows (1, 2, …), per referral for `amendment` rows |
| `referral_id`, `amends_version_id` | uuid | Amendment rows only |
| `fee_basis` | `fee_basis` (`pct_base` · `pct_total_cash` · `flat`) | T1 |
| `rate_bps` | int 100–5000 | T2 on % bases, otherwise null |
| `flat_fee_minor` | bigint, 0 < x ≤ 10^12 | T2 on flat, otherwise null (bound: QA-N2-07, check constraint) |
| `min_fee_minor` | bigint, 0 < x ≤ 10^12 | T3, % bases only, optional (bound: QA-N2-07, check constraint) |
| `currency` | char(3) | T4: % bases = the job's `salary_currency` at publish; flat ∈ CAD, USD, EUR, GBP, BRL |
| `search_type` | `search_type` (`contingent_exclusive` · `contingent_shared` · `retained`) | T5 |
| `direct_client_attested_by`, `direct_client_attested_at` | uuid, timestamptz | T6, set on every version created |
| `guarantee_days` | smallint ∈ {0, 30, 60, 90, 120, 180} | T7 |
| `guarantee_remedy` | `guarantee_remedy` (`replacement_only` · `replacement_then_prorata` · `prorata_refund` · `full_refund`) | Null iff `guarantee_days` = 0 |
| `payment_terms_days` | smallint 0–90 | T8 |
| `ownership_months` | smallint 6–12 | T9 |
| `created_by`, `created_at` | | |

- Constraints make every row complete. "Current terms" = the highest `version_no` with `kind = 'job'`.
- Insert-only for every role: an update/delete trigger fires for the service role too, and `authenticated` has no insert/update/delete grants.
- RLS select allows three groups:
  - members of `organization_id` (all versions of the org's jobs);
  - the sourcing side of a referral whose `terms_version_id` is the row, or whose id is the amendment's `referral_id` (via `app.sees_referral_as_source`, so record scope applies);
  - platform admins.
- Other partners never read this table. They get the current version only through `get_opportunities`.

### 1.2 Referral snapshot (on `public.referrals`, readable under the existing `referrals_select`)
| Column | Notes |
|---|---|
| `terms_version_id` uuid | The job version the submitter committed under (BR-11). Null = legacy ("terms not recorded") |
| `commission_rule_id` uuid | The default rule at commit |
| `fee_estimate_minor` bigint | > 0 or null. The estimate A was shown (BR-11, PD-051 Q4). Flat → the flat amount. % → the BR-9 estimate (≥ minimum fee) **only if shown** (`share_salary` on and a band). Otherwise null |
| `ownership_protected_until` | **Now nullable.** Set only at delivery: delivery + effective T9 months (ET, end-of-month clamp), or + 12 months for legacy referrals. Undelivered referrals have null (existing undelivered rows were set to null) |

The three snapshot columns are insert-only (trigger, any role). `terms_version_id` must be a `job` version of the referral's own job.
The client key at commit lives in `app.referral_commit_keys`: no grants, never returned, never in audit metadata (BR-15).

### 1.3 Other columns
- `commission_rules.platform_basis` (`collected` · `frozen`, default `collected`): the existing rule is `collected` (PD-049) and the field is immutable like the bps.
- `collaboration_agreements.terms_version_id` (the effective terms at creation; null for legacy) and `platform_basis` (copied from the rule). An amendment repoints `terms_version_id` (the only allowed agreement change, while no placement exists).
- `placements` (drop 2):
  - `contracted_fee_minor` keeps meaning **I**, the invoiced fee;
  - new columns: `terms_version_id` (effective terms used at hire), `computed_fee_minor` (**C**), `reported_base_minor`, `reported_bonus_minor`, `fee_difference_reason` (`client_discount` · `client_contract_rate` · `client_invoiced_other_currency` · `invoice_correction` · `other`), `fee_difference_note` (1–500 chars);
  - constraints: C is null iff the placement is legacy; a reason is present iff C ≠ I; `other` requires a note;
  - the fee facts (I, C, base, bonus, reason, note, currency, start date, guarantee end, terms) are immutable for every role. Only the status moves.
- `app.terms_amendment_notes` (drop 2, closed, no grants, insert-only): `version_id`, `reason` (10–1,000), `hiring_request_reference`, `sourcing_request_reference` (3–200 each). Read only through `admin_get_referral_terms`.

---

## 2. Partner visibility (BR-3)

`app.job_partner_visible(job)` is true when all of these hold:
- `status = 'active'`;
- `accepts_external_referrals`;
- `contract_type = 'permanent'`;
- the owner org isn't suspended;
- a current terms version exists;
- on % bases, that version's currency = the job's current `salary_currency`.

| Surface | Behaviour when not visible |
|---|---|
| `get_opportunities` (lists, opportunity detail `p_match`, composer, overview fit totals) | Row absent |
| `submit_referral`, `submit_referral_for_candidate` (via `app.assert_referable`) | Raise `job_not_open_for_referrals` (same as a closed job) |
| `respond_candidate_request` (candidate-confirmed delivery) | Snapshot referral: raise `job_not_open_for_referrals`. **Legacy referral: today's check only** (active ∧ open ∧ org not suspended; PD-051 Q1) |
| `set_match_triage` | `not_found` |
| `mark_matches_seen` | Skipped silently |
| `presentation_admin_metrics` | Counted in the new keys (§3.8) |

Owners get the reason from `get_jobs_terms_state` (§3.2). Other orgs never get one.

Opening a job (`accepts_external_referrals` false → true, or an insert with true) is refused with `terms_incomplete` for every role, service role included, except inside `save_job_terms`. Jobs open at migration time stay open but hidden until a card is published (BR-7). Connectors and `/api/v1/jobs` never set the flag.

---

## 3. RPCs

All are `SECURITY DEFINER` with `search_path = ''`, granted to `authenticated` only, and on the api-surface allow-list where new.

### 3.1 `save_job_terms` (new)
```
save_job_terms(p_job uuid, p_open boolean,
  p_fee_basis fee_basis = null, p_rate_bps int = null, p_flat_fee_minor bigint = null, p_min_fee_minor bigint = null,
  p_flat_currency char(3) = null, p_search_type search_type = null, p_attested boolean = false,
  p_guarantee_days int = null, p_guarantee_remedy guarantee_remedy = null,
  p_payment_terms_days int = null, p_ownership_months int = null)
→ table(terms_version_id uuid, version_no int, created boolean, notified_orgs int)   -- one row
```
- **Rights:** the job's owner or a manager (`app.can_manage_job`), otherwise `not_found`. Rate limit `job.terms` 60/h.
- **Close only:** `p_fee_basis` null with `p_open = false` sets the flag false. No version is created or removed. Null with `p_open = true` raises `terms_incomplete`.
- **Validation** (BR-1) raises `terms_incomplete` (22023), including a flat or minimum fee above 10^12 minor units (QA-N2-07). On % bases the currency is taken from `jobs.salary_currency`; `p_flat_currency` is ignored.
- **BR-5:** if T1–T9 equal the current version, nothing is created (`created = false`) and the attestation isn't needed. Otherwise `p_attested` must be true (`terms_attestation_required`) and version n+1 is inserted.
- **`p_open = true`:** requires `contract_type = 'permanent'` (`referrals_require_permanent`), whatever the status. `p_open = false` closes the job.
- **BR-32:** on a created version with `version_no > 1`, each source org with a live referral on the job (`awaiting_candidate` to `offer`) is notified once (§6). `notified_orgs` = the number of orgs.
- No audit event: the version row is the record. N1's AC-56 requires the hiring side's audit trail on a job to hold no presentation trace, and a per-job audit row would break that test.

### 3.2 `get_jobs_terms_state(p_org uuid, p_job uuid = null)` (new, owner)
Returns one row per job of `p_org`, or only `p_job`:

`job_id, partner_visible, hidden_reason, terms_version_id, version_no, published_at, published_by_name, fee_basis, rate_bps, flat_fee_minor, min_fee_minor, currency, search_type, attested_by_name, attested_at, guarantee_days, guarantee_remedy, payment_terms_days, ownership_months, referral_count`.

- `hidden_reason` is null when visible, otherwise the first that applies of: `not_open`, `no_terms`, `not_permanent`, `currency_mismatch`, `org_suspended`, `not_active`.
- The nudge (spec 2.2) uses `no_terms`, `not_permanent` and `currency_mismatch`.
- `referral_count` counts referrals the hiring side can know about (statuses hidden from the target are excluded), for the BR-33 form note.
- A caller who isn't a member of `p_org` gets `forbidden`.

### 3.3 `get_opportunities(p_org, p_candidate = null, p_match = null)` (return type changed)
- **Removed:** `expected_fee_minor`, `your_share_minor`. `fee_currency` stays but is now the terms currency.
- **Added:**
  - `terms_version_id, terms_version_no, terms_published_at`;
  - `terms_updated_at`: the version date when `version_no > 1` and the version is less than 30 days old, otherwise null (BR-33);
  - `fee_basis, rate_bps, flat_fee_minor, min_fee_minor, fee_currency, search_type, guarantee_days, guarantee_remedy, payment_terms_days, ownership_months`;
  - `rule_name, rule_version, sourcing_bps, job_owner_bps, platform_bps` (the current default rule, T10);
  - `estimated_fee_minor`: flat → the flat amount. % → rate × band midpoint (half-up), at least the minimum fee, **only when `share_salary`** and a band exists. Otherwise null. **Fails closed** (QA-N2-07, QA-N2-09): any value outside (0, 10^12] (a 0–0 band gives null, never 0), or any computation error (e.g. an absurd salary band, which jobs don't bound), gives null for that row, never an error for the list;
  - `estimated_share_minor`: the sourcing part of `allocate_minor(estimate, rule bps)` via `app.estimate_share_safe` (null on any error). Null when there's no estimate or the job is internal.
- `salary_*` remain gated by `share_salary` as before. The client key is never returned. The record scope from `20261115000300` is unchanged.
- TS helpers: `PartnerTerms` and `partnerTerms(opp)` in `src/features/matching/queries.ts`.

### 3.4 Submit RPCs (dropped and recreated; old signatures no longer exist)
```
submit_referral(p_candidate, p_job, p_fields, p_document_ids, p_consent, p_idempotency_key,
                p_terms_version uuid, p_note = null, p_acknowledge_pending = false, p_new_consent = null)
  → (outcome, referral_id, reference)
submit_referral_for_candidate(p_candidate, p_job, p_fields, p_document_ids, p_idempotency_key,
                p_terms_version uuid, p_note = null, p_ttl_days = 14, p_acknowledge_pending = false)
  → (outcome, referral_id, created, destination, reference)
```
Order of checks:
1. rate limit;
2. idempotent replay returns `created` (no version check on replay);
3. preconditions, now including the predicate;
4. job row `FOR SHARE`, then the **version check**;
5. N1 gate;
6. inside the existing no-raise block: insert with the snapshot.

Outcomes: `created` · `stopped` · `pending_warning` · `identifier_required` · **`terms_changed`**, plus N1's returned codes.
- **`terms_changed`** is returned when `p_terms_version` is null, an older version of this job, another job's version or any other uuid. Nothing is written except one audit event `referral.terms_changed` (source org, entity = the job, metadata `{}`): no referral, consent, fingerprint, hit row, sticky stop or email. It counts toward the 30/h submit limit.
- On N1's two-step pending warning, the acknowledged call re-checks the version.
- A missing default commission rule raises `no_default_commission_rule` before the gate (not expected in practice).
- N9 token issuance and resend are untouched. A resend keeps the original snapshot.

### 3.5 `get_sent_referral_jobs(p_org)` (return type changed)
Returns `job_id, status, status_updated_at, internal`. The fee and share columns are gone (PD-050 c). Per-referral terms come from `listSentByJob` (§4.3).

### 3.6 `get_referral_presentation(p_referral, p_acting_org)` (extended, hiring side only)
Adds two fields:
- `lookback_months` (int): the effective T9, or 6 for legacy referrals;
- `claim_prior_date_min` (ISO date, ET): delivery date − `lookback_months`, end-of-month clamped. Null when undelivered.

These feed the claim dialog's `min`, `claim.priorDateWindowHint` `{count}` and `referrals.claim.validation.priorDateTooOld` `{count}`/`{date}`. The server enforces the same bound and refuses with `claim_date_invalid`.

### 3.7 `report_hire` v2 (drop 2; the old signatures are dropped)
```
report_hire(p_referral uuid, p_expected_version int, p_start_date date,
  p_terms_version uuid = null,                                                   -- review fix: the effective terms version shown
  p_base_minor bigint = null, p_bonus_minor bigint = null,                       -- snapshot referrals
  p_invoiced_fee_minor bigint = null, p_difference_reason text = null, p_difference_note text = null,
  p_legacy_fee_minor bigint = null, p_legacy_currency char(3) = null, p_legacy_guarantee_days int = null)   -- legacy only
→ uuid   -- placement id
```
Access, version, status and agreement checks are unchanged: hiring side (job owner or manager), `stale_version`, status `offer`, active agreement.

**Snapshot referral.** Uses the effective terms (the latest amendment, else the snapshot).
- **`p_terms_version` must equal the effective terms version** (`getReferralTerms().effective.id`), otherwise **`hire_terms_changed`** (P0001, `errors.hire_terms_changed`). A missing value counts as stale. This covers copy-review P16: an amendment recorded while the dialog was open, including a % → flat change that would otherwise silently ignore the posted base. Nothing is written; the UI refreshes the terms.
- Any `p_legacy_*` → `hire_terms_fixed`.
- What B enters depends on the basis:
  - `pct_base`: base > 0, no bonus;
  - `pct_total_cash`: base > 0 and bonus ≥ 0;
  - `flat`: no base, no bonus.
  - Otherwise `hire_base_invalid`.
- C = `app.compute_fee`: round half-up (rate × (base + bonus)), at least the minimum fee; flat = the frozen amount.
- I = `p_invoiced_fee_minor`, or C when omitted.
- When I ≠ C: the reason is required and must be in the list, and `other` needs a note. Otherwise → `fee_difference_reason_required`. A note over 500 chars → `fee_difference_note_too_long`.
- When I = C, passing a reason or note → `fee_difference_not_allowed`.
- **Bounds (QA-N2-02, QA-N2-07)** → `hire_base_invalid`: base and bonus ≤ 10^12 minor units; C ≤ 10^12; ceil(C / 100) ≤ I ≤ 100 × C, and I ≤ 10^12. All compared in numeric, so no bound can overflow. `app.allocate_placement` additionally raises `invalid_fee` (mapped) for any share outside bigint; `allocatePlacement()` (TS) throws `invalid_fee` on the same range.
- Currency = the terms currency. `guarantee_until` = start + guarantee days, or null when 0.

**Legacy referral** (no snapshot):
- Any snapshot param, `p_terms_version` included → `terms_not_recorded`.
- Today's free entry: 0 < fee ≤ 10^12, `^[A-Z]{3}$` currency, guarantee 0–365 (default 90; now enforced in SQL); otherwise `invalid_fee`. C is null.

**Side effects:**
- `placement.hired` as before.
- When I ≠ C: `placement.fee_difference` to the submitter (§6).
- Audit `placement.created` with `{fee_minor: I, currency, computed_fee_minor, terms_version_id}`. **Never the base or bonus.**

Codes without an `errors.*` key map to `errors.generic` by design: `hire_base_invalid`, `fee_difference_not_allowed`, `fee_difference_note_too_long`. The Server Action validates these first with field errors (§4.6).

### 3.7a Ledger allocation (drop 2, BR-27 to BR-30)
`review_payment_evidence` (live body from `20261115000300`; only the allocation and the memos change) splits each verified client payment or refund of net P with:

`app.allocate_placement(P, sourcing_bps, job_owner_bps, platform_bps, agreement.platform_basis, placement.computed_fee_minor, placement.contracted_fee_minor)`

- **Any path:** \|P\| > 10^12 minor units → `invalid_fee` (QA-N2-08). Client payment and refund evidence above 10^12 is already refused at `record_payment_evidence` (a trigger on `payment_evidence`, `invalid_fee`; the record-scope-shared function itself isn't redefined).
- **Legacy (C null) or I ≥ C:** today's `app.allocate_minor`, exactly. It now computes in numeric, so it can't overflow; results are identical.
- **I < C:** with half-up rounding on |P| in exact numeric, and the sign re-applied:
  - sourcing = round(sourcing_bps × C × P / I);
  - platform = round(platform_bps × P) under `collected`, or round(platform_bps × C × P / I) under `frozen`;
  - job owner = P − sourcing − platform, which **can be negative**. The ledger entry is a normal `allocation` with a negative amount.
- Memos on the I < C path: sourcing "4500 bps of the computed fee"; job owner "Remainder after the computed-fee shares".
- Placement status rules are unchanged:
  - `commission_payable` when verified collections ≥ invoice total;
  - `settled` when the sourcing and platform balances reach 0. A negative job-owner balance doesn't block it.
- Payouts are capped at the sourcing balance (on C).
- The seeded rule is `collected` (PD-049). `frozen` is reachable by publishing a rule with `p_platform_basis = 'frozen'`. Both are tested.
- TS mirror: `allocatePlacement()` in `src/lib/money/allocate.ts` (BigInt), parity-tested on 400 random cases. Worked examples are in `backend-estimate.md` §5.

### 3.7b Concierge amendment (drop 2, BR-34, BR-35)
```
admin_amend_referral_terms(p_referral uuid, p_reason text, p_hiring_request_reference text, p_sourcing_request_reference text,
  p_both_requested boolean, p_fee_basis fee_basis, p_search_type search_type, p_guarantee_days int, p_payment_terms_days int,
  p_ownership_months int, p_rate_bps int = null, p_flat_fee_minor bigint = null, p_min_fee_minor bigint = null,
  p_flat_currency char(3) = null, p_guarantee_remedy guarantee_remedy = null,
  p_expected_currency char(3) = null)   -- v2.5 (QA-N2-12)
→ uuid   -- the new amendment version id
```
Checks, in order:
1. Platform admin, otherwise `forbidden`. Rate limit `admin.amend` 30/h.
2. The referral must exist, otherwise `not_found`.
3. Legacy referral → `amendment_legacy_referral`.
4. A placement already exists → `amendment_after_hire`. Any other status is allowed, declined and withdrawn included.
5. Reason 10–1,000 chars, both references 3–200 chars, and `p_both_requested` true; otherwise `amendment_reason_required` (generic copy).
5a. (v2.5) On a % basis with `p_expected_currency` given: the currency the amendment would be stored in differs → `stale_version`.
6. T1–T9 validated as in `save_job_terms` (fees ≤ 10^12 included) → `terms_incomplete`. On % bases the currency stays the effective terms' currency (or the job's salary currency when switching from flat).
7. Identical to the effective terms → `amendment_no_change`.
8. A T9 change on a delivered referral → `amendment_window_after_delivery`.

Effects:
- Inserts an `amendment` version (numbered per referral, `amends_version_id` = previous effective terms, T6 carried over from the snapshot) and the notes row.
- Repoints an existing agreement.
- Notifies both orgs with `referral.terms_amended` (the hiring side only when the referral is visible to it).
- Audits one platform event and one event per org (`{version_id}` only; never the reason or references).
- Ownership date and claim deadlines are never touched. An undelivered referral's T9 change applies at its delivery.

### 3.7c `admin_get_referral_terms(p_referral uuid)` (drop 2, platform admin; otherwise `not_found`)
Returns a JSON object (type `AdminReferralTerms` in `src/features/admin/queries.ts`):
- `referral_id, job_title, candidate_label, hiring_org_id, hiring_org_name, sourcing_org_id, sourcing_org_name, status, delivered_at`;
- `client_label`: the name, or the English placeholder "Confidential client" (localise it). Never the hidden name;
- `recorded`, `effective_terms_version_id`, `placement` (`{id, created_at}` or null), `rule`;
- `history`: the snapshot, then amendments oldest first. Each item has the T1–T9 fields, `created_at` and `created_by_name`; amendments also carry `reason`, `hiring_request_reference` and `sourcing_request_reference`.

### 3.7d `get_referral_terms_context(p_referral uuid)` (drop 2)
Returns `table(job_current_version_no int, job_current_version_at timestamptz)` (zero rows when the job has no version) to anyone who sees the referral (`app.can_see_referral`), otherwise `not_found`. It feeds spec 2.4.3, "This job's terms are now version {current}".

### 3.8 Admin and rules
- `presentation_admin_metrics` adds two keys: `partner_visible_jobs` and `referral_open_without_terms` (active, open, no job version).
- `publish_commission_rule(p_name, p_sourcing, p_job_owner, p_platform, p_platform_basis = 'collected')`.

### 3.9 Unchanged but now snapshot-driven
- `app.create_agreement_for_referral`: snapshot referrals use their commit rule (retired or not), including its name, version, bps and `platform_basis`, and keep the internal transform. `terms_version_id` = effective terms. Legacy referrals behave exactly as before.
- `app.deliver_referral`: the only place the ownership date is set.

---

## 4. Server Actions and queries (contract for the frontend)

### 4.1 Job form: `createJob(orgSlug, prev, formData)`, `updateJob(orgSlug, jobId, prev, formData)` (`src/features/jobs/actions.ts`, schema `jobFormSchema`)
**Removed fields** (ignored if posted): `expectedFee`, `feeCurrency`, `shareFee`. `shareSalary` stays.

**Card fields**, read only when `acceptsExternalReferrals = "on"`:

| FormData name | Value |
|---|---|
| `feeBasis` | `pct_base` · `pct_total_cash` · `flat` |
| `feeRate` | Percent, 1–50, up to 2 decimals ("20", "22.5"); % bases |
| `minimumFee` | Major units in the salary currency; optional; % bases |
| `flatFee` | Major units; flat |
| `flatCurrency` | CAD · USD · EUR · GBP · BRL; flat |
| `searchType` | `contingent_exclusive` · `contingent_shared` · `retained` |
| `guaranteeDays` | `0` · `30` · `60` · `90` · `120` · `180` |
| `guaranteeRemedy` | Remedy enum; omit when `guaranteeDays = 0` |
| `paymentTermsDays` | 0–90 |
| `ownershipMonths` | 6–12 |
| `directClientAttested` | `"on"` |

**Errors** (`ActionResult.fieldErrors`):

| Field | Message key |
|---|---|
| `contractType` | `jobs.validation.permanentForReferrals` |
| `feeRate` | `jobs.validation.feeRateRange` |
| `flatFee` | `jobs.validation.flatAmountRequired` |
| `minimumFee` | `jobs.validation.minimumPositive` |
| `guaranteeRemedy` | `jobs.validation.remedyRequired` |
| `paymentTermsDays` | `jobs.validation.paymentDaysRange` |
| `directClientAttested` | `jobs.validation.attestationRequired` (only when this save would publish a new version, decided against the stored version) |
| `feeBasis`, `flatCurrency`, `searchType`, `guaranteeDays`, `ownershipMonths` (forged values only) | `jobs.errors.termsIncomplete` |

- When any card field fails, the summary `error` is `jobs.errors.termsIncomplete`.
- Every deterministic refusal happens before any write, so the whole save is refused.
- The job row and the card are two writes (user-client job write, then `save_job_terms`). Only a race or the rate limit can fail the second one; the job then stays saved and private, and the RPC error is returned (`errors.terms_incomplete`, `errors.referrals_require_permanent` or `errors.terms_attestation_required`). This is a known deviation from spec 2.1's "same transaction" (§8).

**Prefill:** `getJobsTermsState(ctx, jobId)` (§4.4). `rate_bps` → form value via `bpsToRateInput` (`src/lib/money/terms.ts`). Use `TERMS_DEFAULTS` for a job with no version.

### 4.2 `submitReferral(orgSlug, prev, formData)` (`src/features/referrals/actions.ts`)
- New **required** field `termsVersionId` (uuid): the `terms_version_id` the composer rendered from `get_opportunities`. A non-uuid fails Zod → `errors.invalidFields`.
- New outcome in `ActionResult<SubmitOutcome>.data`:
  ```ts
  { outcome: "terms_changed"; terms: PartnerTerms }   // PartnerTerms = the §3.3 card columns + client_label + internal
  ```
  `terms` is the job's **current** card, re-read through `get_opportunities`.
- If the job stopped being visible meanwhile, the action returns `referrals.errors.opportunityGone`.
- Other outcomes are unchanged. Keep the form state and post the new `terms.terms_version_id` on resubmit.

### 4.3 `listSentByJob(ctx)` (`src/features/referrals/queries.ts`)
Each referral row now carries `terms: { version_no, fee_basis, rate_bps, flat_fee_minor, currency } | null`. Null = legacy ("Terms not recorded"). There is no money share (PD-050 c). The group's `job` status still comes from `get_sent_referral_jobs`.

### 4.4 Other queries
`getJobsTermsState(ctx, jobId?)` (`src/features/jobs/queries.ts`) returns §3.2 rows.

`getReferralTerms(ctx, referralId)` (`src/features/referrals/queries.ts`, RLS read, both sides) returns `null` (not visible), `{ recorded: false }` (legacy) or:
```ts
{ recorded: true,
  snapshot: TermsRow, effective: TermsRow, amended: boolean,     // effective = latest amendment (v2) or snapshot
  shareBps: number,            // snapshot rule sourcing bps (0 when internal) → jobs.terms.shareAtHire {percent}
  feeBasis, rateBps,           // effective → shareAtHire {rate} and pctBase/pctTotalCash
  rule: { name, version, sourcing_bps, job_owner_bps, platform_bps, platform_basis },
  internal: boolean, feeEstimateMinor: number | null,
  expectedShareMinor: number | null,    // from the EFFECTIVE terms (see below); null if internal
  jobCurrentVersionNo: number | null, jobCurrentVersionAt: string | null }
// TermsRow = id, kind, version_no, created_at, fee_basis, rate_bps, flat_fee_minor, min_fee_minor, currency,
//            search_type, guarantee_days, guarantee_remedy, payment_terms_days, ownership_months, direct_client_attested_at
```
- `shareBps`, `feeBasis` and `rateBps` are always present (designer dependency for `jobs.terms.shareAtHire.*`).
- `expectedShareMinor` (QA-N2-05, `expectedShare()` in `src/features/referrals/terms.ts`):
  - effective terms flat → the exact share of the effective flat amount;
  - % terms whose fee is unchanged by any amendment (same basis, rate, minimum, currency) → the frozen estimate × the sourcing share, or null when no estimate was shown;
  - an amendment changed the % fee, or switched flat → % → **null**, so the UI shows `shareAtHire.*`.
- v2 adds `jobCurrentVersionNo` and `jobCurrentVersionAt` (from `get_referral_terms_context`). Show the "newer terms" line when `jobCurrentVersionNo > snapshot.version_no`.

### 4.6 `reportHire(orgSlug, prev, formData)` (drop 2)
The variant and the currency come from `getReferralTerms`, never from the form.

| Variant | FormData | Field errors |
|---|---|---|
| Snapshot | `referralId`, `version`, `startDate`, **`termsVersionId`** (the effective terms id the dialog rendered; mismatch or missing → `errors.hire_terms_changed`), `baseSalary` (major units, % bases), `targetBonus` (total cash; "0" allowed), `invoicedDifferent` ("on"), `invoicedFee`, `differenceReason` (one of the five codes), `differenceNote` | `baseSalary` → `referrals.validation.baseRequired`; `targetBonus` → `bonusRequired`; `invoicedFee` → `invoicedPositive` or `invoicedSame`; `differenceReason` → `reasonRequired`; `differenceNote` → `noteRequiredOther` / `noteTooLong` |
| Legacy | `fee`, `currency`, `guaranteeDays` (unchanged) | As before |

- Posting `fee`/`currency`/`guaranteeDays` for a snapshot referral → `errors.hire_terms_fixed`. Posting snapshot fields for a legacy referral → `errors.terms_not_recorded`.
- Success redirects to the placement as before.
- Use `computeFee` for the live "Computed fee" box (the database is the authority).

### 4.7 Commissions (drop 2)
- `listPlacements` adds `computed_fee_minor` and `agreement.platform_basis`.
- `getPlacement` returns `placement.*`, which now includes C, base, bonus, reason and note, plus `terms` (the effective terms version used at hire: kind, version_no, created_at, T1–T9; null for legacy).
- `projectedSplit(feeMinor, agreement, computedFeeMinor = null)` (`src/features/commissions/domain.ts`) applies BR-27 with P = I. **Pages must pass `placement.computed_fee_minor`** to get the floored, possibly negative job-owner projection. Without it the result is today's split.
- `summarizeForOrg` already passes C.

### 4.8 Admin (drop 2)
- `getAdminReferralTerms(db, referralId)` (`src/features/admin/queries.ts`): §3.7c, or null.
- `amendReferralTerms(prev, formData)` (`src/features/admin/actions.ts`):
  - fields: `referralId`, `currency` (the effective terms' currency, for parsing amounts), the card fields as in §4.1 (`feeBasis`, `feeRate`, `minimumFee`, `flatFee`, `flatCurrency`, `searchType`, `guaranteeDays`, `guaranteeRemedy`, `paymentTermsDays`, `ownershipMonths`), `reason`, `hiringRequestReference`, `sourcingRequestReference`, `bothRequested` ("on");
  - returns `{ ok: true, data: { versionId }, message: admin.referralTerms.messages.recorded }`.
  - Server refusals arrive as `errors.amendment_*`.

### 4.5 Pure helpers (`src/lib/money/terms.ts`)
- Constants: `FEE_BASES`, `SEARCH_TYPES`, `GUARANTEE_DAYS`, `GUARANTEE_REMEDIES`, `FLAT_FEE_CURRENCIES`, `TERMS_DEFAULTS`.
- Functions:
  - `parseRateToBps`, `bpsToRateInput`;
  - `estimateFee` (same result as SQL, for the form preview);
  - `termsDiffer` (BR-5, for "Saving publishes terms version {n+1}");
  - `computeFee` (BR-22, hire dialog);
  - `FEE_DIFFERENCE_REASONS`;
  - `allocatePlacement` and the `PlatformBasis` type in `src/lib/money/allocate.ts`.

---

## 5. Error codes and i18n (keys added verbatim from spec §5)
- `errors.*`: `terms_incomplete`, `referrals_require_permanent`, `terms_attestation_required`, `hire_terms_fixed`, `fee_difference_reason_required`, `amendment_after_hire`, `amendment_window_after_delivery`, `amendment_no_change`, `amendment_legacy_referral`, `terms_not_recorded`. `claim_date_invalid` has the new value. All are mapped in `toActionError`.
- `jobs.validation.*`: the seven keys in §4.1. `jobs.errors.termsIncomplete`.
- `terms_changed` is an outcome, not an error. `hire_terms_pending` no longer exists.
- Codes that deliberately map to `errors.generic` (the UI validates first): `hire_base_invalid`, `fee_difference_not_allowed`, `fee_difference_note_too_long`, `amendment_reason_required`.
- I added only the keys above (en/fr/pt, verbatim from spec §5). Every other §5 key is the frontend's and ux-writer's.

## 6. Notifications (kind names as stored in `notifications.kind`)
| Kind | When | Recipients | Text (en, in SQL) |
|---|---|---|---|
| `job.terms_changed` | `save_job_terms` creates version ≥ 2 | Per source org with a live referral: each distinct submitter who still sees one, linked to their latest such referral. If none does, the members eligible for that org's latest referral (candidate owner + managers, record scope) | "{org} updated the terms for {job}. Your referrals keep the terms they were sent under." |
| `placement.fee_difference` | `report_hire` with I ≠ C | The referral's submitter; if they can't see it any more, the members eligible for the placement (record scope) | "{org} reported a hire for {job} with an invoiced fee of {invoiced} instead of the computed {computed}. Reason: {reason}." (amounts as "CAD 16,000.00"; reason = the en label) |
| `referral.terms_amended` | `admin_amend_referral_terms` | Both orgs: members eligible for the referral (candidate owner / job owner + managers); the hiring side only when the referral is visible to it | "A platform admin recorded a terms amendment on the referral for {job}, at both organizations' written request. Review the new terms on the referral." |

## 7. Frontend must know
- **Drop-1 interim edits done by backend (still in place).**
  - `your_share_minor` → `estimated_share_minor` and `expected_fee_minor` → `estimated_fee_minor` in the opportunities page, best-opportunities, overview data, job-match-row and opportunity-card.
  - `ownershipUntil={r.ownership_protected_until ?? ""}` on the referral page.
  - No UI component was edited in drop 2.
- **Hire dialog** (`referral-actions.tsx` `ReportHireDialog`): it still posts the legacy fields, so it works only for legacy referrals. For snapshot referrals the action returns `errors.hire_terms_fixed` until the dialog posts the §4.6 snapshot fields. Its `currency` prop must come from `getReferralTerms().effective.currency`, not from the live job.
- **Placement page and commissions list:** pass `computed_fee_minor` to `projectedSplit` (§4.7). The job-owner projection can be negative. The ledger can contain a negative `job_owner` `allocation`.
- **Overview** (`src/features/overview/data.ts`): its placements select has no `computed_fee_minor`, so its "projected" total ignores the floor until that select adds the column.
- **Referral page "newer terms" line:** `getReferralTerms().jobCurrentVersionNo`.
- **Admin:**
  - `/admin/referrals/[referralId]` reads `getAdminReferralTerms` and posts `amendReferralTerms`;
  - the lookup page parses the pasted URL or id and navigates; null → `admin.referralTerms.notFound`;
  - show the form only when `recorded && !placement`, and disable T9 when `delivered_at` is set.
- **Composer and job form:** as in v1 (`termsVersionId` required; card fields as in §4.1).
- **Demo seed** (`scripts/seed-demo.mts`) and the test fixtures open jobs through `save_job_terms`.

- **Frontend coordination (fix round, 2026-11-16).** The hire dialog posts `termsVersionId` = `getReferralTerms().effective.id` (snapshot referrals only). On `errors.hire_terms_changed` it keeps the typed values, refreshes the route (new terms and version id) and shows the message at the top. `errors.hire_terms_changed` (en/fr/pt, copy-review P16) was added by frontend.

### 7.1 Review fixes the frontend must know (v2.1 to v2.3)
- **Zero estimate (v2.3, QA-N2-09):** the server never returns or freezes an estimate of 0. `estimated_fee_minor`, `estimated_share_minor` and `fee_estimate_minor` are > 0 or null, and `estimateFee()` (form preview) returns null for 0. Render the estimate only when it isn't null; never render "~CAD 0".
- **Payment amounts (v2.3, QA-N2-08):** a client payment, refund, payout or remittance above 10^12 minor units is refused with `errors.invalid_fee`. `allocatePlacement()` throws `invalid_fee` for \|P\| > 10^12.
- **Fee bounds (v2.2):** the job form and the admin amendment refuse a flat or minimum fee above CAD 10,000,000,000.00 (10^12 minor units). Field errors: `jobs.validation.flatAmountRequired` / `jobs.validation.minimumPositive`. The RPCs return `errors.terms_incomplete`. `MAX_FEE_MINOR` is exported from `src/lib/money/terms.ts`, and `estimateFee()` returns null outside [0, MAX_FEE_MINOR], like SQL.
- **Hire dialog:** post `termsVersionId` = `getReferralTerms().effective.id` (hidden input). On `errors.hire_terms_changed`, refresh the terms. The legacy variant posts no `termsVersionId`.
- **Job form:** a `minimumFee` posted on a flat basis, or a `guaranteeRemedy` posted with `guaranteeDays = 0`, is now **refused** with a field error (`jobs.errors.termsIncomplete`) instead of dropped (AC-3, AC-5). Don't submit hidden fields for the inactive basis or for a "None" guarantee.
- **Expected share:** can now be null on an amended referral even when the frozen estimate exists. Show `shareAtHire.*` then.

## v2.4 / F-1: amendment currency (acceptance.md §3.3, PD-062)

**Rule (server, unchanged except the refusal):** the currency of a % amendment is
- the effective terms' currency when they are already % (% → %);
- the job's **current** `salary_currency` when the effective terms are flat (flat → %);
- a flat amendment uses its declared `p_flat_currency` (CAD · USD · EUR · GBP · BRL).

**`admin_amend_referral_terms`:** a flat → % amendment where the job has no usable salary currency (null, or not `^[A-Z]{3}$`) raises **`terms_incomplete`** (22023), mapped to `errors.terms_incomplete`. It's never a raw NOT NULL error, and nothing is written. Today `jobs.salary_currency` is `NOT NULL DEFAULT 'CAD'`, so this is a defensive guard.

**`admin_get_referral_terms(p_referral)`** adds two keys (types in `AdminReferralTerms`, `src/features/admin/queries.ts`):

| Key | Type | Meaning |
|---|---|---|
| `job_salary_currency` | `string \| null` | The job's current salary currency |
| `pct_amendment_currency` | `string \| null` | The currency a % amendment is stored in, and **the currency the form must label, preview and parse % amounts (minimum fee) in**: the effective terms' currency if they are %, else `job_salary_currency`. Null (or no recorded terms) → a flat → % switch is refused |

**`amendReferralTerms(prev, formData)`** (`src/features/admin/actions.ts`):
- Reads the lookup on the server and parses % amounts in `pct_amendment_currency`, flat amounts in `flatCurrency`. A posted `currency` field is **ignored** and no longer needed.
- `feeBasis` ≠ `flat` with a null `pct_amendment_currency` → `{ ok: false, error: errors.terms_incomplete }`.
- Unknown referral → `errors.not_found`.
- Everything else as in §4.8.

**Frontend:** when the chosen basis is % and the effective basis is flat, show `pct_amendment_currency` in the form labels and in the confirmation diff ("Currency: CAD → USD" when it differs from the effective flat currency).

**Tests** (`tests/integration/terms-hire-ledger.test.ts`, "F-1"):
- A flat CAD referral on a USD-salaried job, amended to % with a minimum, stores `pct_base:USD`. The lookup returns `job_salary_currency = pct_amendment_currency = USD` before the amendment. Once the effective terms are %, a later salary-currency change (EUR) doesn't move `pct_amendment_currency` (USD), and the next % amendment stays USD.
- With the job's salary currency nulled inside a rolled-back transaction (constraint relaxed), a flat → % amendment raises `terms_incomplete`, not a NOT NULL error, and nothing persists. A control run with a currency succeeds.

## v2.5: QA-N2-10 to QA-N2-12 (qa-report.md §11.2) and F-0 doc fixes

**Migration** `20261116000900_terms_amendment_expected_currency.sql` (local only). `admin_amend_referral_terms` is dropped and recreated with one more trailing argument, `p_expected_currency char(3) default null`. There's no overload: the 15-argument signature no longer exists. Grants: `authenticated` only (`anon` and `public` revoked). The name on the `api-surface.test.ts` allow-list is unchanged.

**QA-N2-12, stale % currency.**
- RPC: on a % basis (`p_fee_basis` ≠ `flat`), when `p_expected_currency` is given and differs (case-insensitive) from the currency the amendment would be stored in, it raises **`stale_version`** (P0001). That currency is the effective % currency, or the job's current salary currency on flat → %. Nothing is written. The check runs after the admin, existing-referral, legacy, after-hire and reason checks, and before the F-1 null guard and T1–T9. It's ignored on a flat basis and when null, so direct callers keep the v2.4 behaviour.
- Action `amendReferralTerms`: a new FormData field **`expectedPctCurrency`**, the `pct_amendment_currency` the form showed. On a % basis it's **required**. If it's missing, malformed (not `^[A-Za-z]{3}$` after trim) or different from the fresh lookup's `pct_amendment_currency`, the action returns `{ ok: false, error: errors.stale_version }` before parsing amounts, so the admin never gets a misleading `minimumPositive`. The value is upper-cased and passed to the RPC as `p_expected_currency`, which re-checks it in the same transaction. On a flat basis it's ignored.
- i18n: reuses **`errors.stale_version`** ("This record changed in the meantime. Refresh and try again.", en/fr/pt already present and mapped in `toActionError`). No new keys.
- Frontend (done, minimal): `amend-terms-form.tsx` posts `<input type="hidden" name="expectedPctCurrency" value={pctCurrency ?? ""}>`. The existing form-level error banner renders the refusal. No other UI change.

**QA-N2-10:** a flat post without `flatCurrency` now returns `fieldErrors.flatCurrency = [jobs.errors.termsIncomplete]`, not a derived `currency` key. The derived `currency` is optional in the base schema and checked in the transform for % bases only.

**QA-N2-11:** the action checks `lookup.recorded` right after the lookup. A legacy referral answers **`errors.amendment_legacy_referral`** on every basis, as the RPC does. Before, a % post got `terms_incomplete`.

Action check order (contract): `forbidden` (not a platform admin) → `invalidFields` (malformed `referralId`) → `not_found` → `amendment_legacy_referral` → (%) `terms_incomplete` when `pct_amendment_currency` is null → (%) `stale_version` → field errors → RPC codes.

**Docs (F-0):** `docs/domain-model.md` now says `fee_estimate_minor` is also null above 10^12 or when the computation fails. `docs/security-and-privacy.md` records the intentional `forbidden` (amend) vs `not_found` (lookup) asymmetry and the stale-currency refusal. Its "Open items" line no longer says rate limiting is Supabase built-in only.

**Tests:**
- New: `tests/integration/terms-amend-expected-currency.test.ts`, 8 tests. Action level: a deterministic race (salary currency changed after page load) gives `stale_version` with nothing written, and a fresh page succeeds; missing or malformed values are stale and lower case is normalised; % → % against the effective currency; flat ignores the field; no new oracle for non-admin or legacy callers. RPC level: mismatch → `stale_version`, matching (case-insensitive) → stored, null → no check, flat ignores; ordering after the `forbidden`/`not_found` checks; a single 16-argument function with `anon` execute false and `authenticated` true.
- Edited (QA's `terms-amend-action-qa.test.ts`; behaviour intentionally changed): the form helper posts `expectedPctCurrency` (USD; JPY in the JPY case). The #3 assertion is now `fieldErrors.flatCurrency` (QA-N2-10). The #8 % path is now `amendment_legacy_referral` (QA-N2-11).

## 8. Deviations and notes
1. **Job + card aren't one transaction** (spec 2.1 step 4). Deterministic refusals happen before any write; a race can leave the job saved and private, with the error shown.
2. **No `job.terms_published` audit event** (§3.1). The version row is the audit record.
3. **Forged or other-job `termsVersionId` → `terms_changed`** (brief §11.2 item 11), not "not found".
4. **`getReferralTerms` is an RLS read** plus `get_referral_terms_context` for the job's current version number. There's no single `get_referral_terms` RPC.
5. **Overlap with `20261115000300_recruiter_record_scope.sql`** (another session of the user's, not committed). N2 redefines eight functions that file also defines: `assert_referable`, `assert_own_match`, `mark_matches_seen`, `get_opportunities`, `get_sent_referral_jobs`, `get_referral_presentation`, `report_hire`, `review_payment_evidence`. Each N2 body was copied from that file and differs only by `-- N2` edits. Before migration 4, the file was re-checked: unchanged since 21:53 (md5 `dcd27209…`). **If it changes, the N2 copies must be re-synced.**
6. **Fixtures:**
   - `createJob` publishes a default card (20%, 6-month window = the BR-1 default and the legacy N1 look-back) and opens the job.
   - Submit calls pass `p_terms_version`; the N9 QA `regprocedure` string was updated to the new signature; one N1 connector test no longer inserts an open job.
   - The drop-1 `asPreN2Referral` helper is removed. The journey and record-scope hire tests now use the snapshot path (`p_base_minor: 10_000_000` → C = 2,000,000 at the fixture's 20%).


7. **I < C reason/note rules:** a reason or note is refused when I = C (`fee_difference_not_allowed`, generic copy), and the note is limited to 500 chars.
8. **Admin lookup errors:** a non-admin calling `admin_get_referral_terms` gets `not_found` (no oracle), not `forbidden`.
9. **Matching at scale (QA-PRE-01):** `hasProcessingAuthorization` now looks consents up in chunks of 100 ids (`IN_FILTER_CHUNK`), so job-side matching works with thousands of reachable candidates. The worker logs and stores `code: message` via `describeError()` (`src/server/queue/errors.ts`), never `details`/`hint`/payloads. QA-PRE-02 (`get_opportunities` pagination) is a follow-up.
10. **QA test note:** `terms-card-qa.test.ts` "referral snapshot columns … can't be changed" picks "the oldest rule" as the foreign rule. On a freshly reset DB, before any other suite publishes a rule, that's the referral's own rule, the update is a no-op, and the test fails. It passes in the full suite (earlier files publish rules). I didn't change QA's assertion; QA should pick a rule different from the referral's.## 9. Tests
- **Unit:** `src/lib/money/__tests__/terms.test.ts` (rate parsing, estimate parity cases incl. half-up and minimum, BR-5 diff) and `src/features/jobs/__tests__/terms-schema.test.ts` (card validation, permanent-only, retired fields).
- **Integration:** `tests/integration/terms-card.test.ts`, 25 tests:
  - publishing and roles;
  - immutability (owner and service role);
  - the flag guard (user PATCH, service-role insert and update, connector-style insert);
  - the visibility matrix (legacy, contract, currency mismatch, suspended org) on opportunities, both submit RPCs, triage, seen marks, owner reasons and admin metrics;
  - `terms_changed` (stale, foreign and random ids; no hits, fingerprints or referral; audit; rate-limit count);
  - snapshot (rule, frozen estimate, commit key), estimate gating and freezing;
  - candidate path with change, resend and ownership;
  - pending-warning re-check;
  - agreement from the commit rule;
  - month math (31 Aug + 6, 31 Jan + 1, leap year);
  - legacy vs snapshot delivery on a hidden job;
  - null ownership for undelivered referrals;
  - look-back 12 vs 6 months through real claims;
  - BR-32 notification recipients and text;
  - `hire_terms_pending`.
- **Integration, drop 2:** `tests/integration/terms-hire-ledger.test.ts`, 18 tests:
  - hire variants (% base, total cash with a binding minimum, flat, no guarantee);
  - `hire_terms_fixed`, `hire_base_invalid`, the reason rules and each of the five codes;
  - the I ≠ C notification text and recipient; base and bonus absent from audit;
  - immutable placement facts; legacy free entry and `terms_not_recorded`; hiring-side-only access;
  - ledger: I ≥ C equals today; I < C `collected` with a partial payment, processing fee and settlement; `frozen` with a deep discount and a negative job owner;
  - SQL ↔ TS parity (400 allocation cases, 200 fee cases);
  - amendment: scoping, agreement repoint, notifications, reason admin-only, hire on the amended terms, then `amendment_after_hire`; refusals (non-admin, no change, window after delivery, missing request, legacy); allowed on a declined referral;
  - `get_referral_terms_context` for both sides and `not_found` for others.
- **Review fixes:**
  - `tests/integration/matching-scale.test.ts`: 620 candidates, one job; all scored, no `permissionMissing`. It fails with "URI too long" without the fix.
  - `terms-hire-ledger.test.ts` "review fixes": `hire_terms_changed` after a % → flat amendment (stale, missing, random id), legacy + version refused, I and base bounds, `invalid_fee` on overflow (SQL and TS).
  - Units: `src/server/queue/__tests__/errors.test.ts`, `src/features/referrals/__tests__/expected-share.test.ts`, and the job schema refusals (QA's two `it.fails` flipped to `it`).
  - QA's overflow test now expects `invalid_fee`. Backend `since` bounds use `dbNow()` (DB clock, QA-N2-06).
- **QA-N2-07:**
  - `terms-card.test.ts` "fee bounds and a fail-closed estimate": over-bound flat and minimum refused, 10^12 accepted, check constraint on a direct insert, and an absurd salary band leaving the list working with a null estimate (submit freezes null).
  - `terms-hire-ledger.test.ts` "amendment fee bounds".
  - Unit: `estimateFee` fail-closed, and the schema bounds.
  - QA's four QA-N2-07a/b cases run without `.fails`. In 07b, a publish refused with `terms_incomplete` now counts as a pass, since the huge fee can't be published any more.
- **QA-N2-08/09:**
  - `terms-card.test.ts` "zero salary band": a 0–0 band submits on both paths and freezes null.
  - `terms-hire-ledger.test.ts` "payment amount bound": a 9×10^18 payment → `invalid_fee`; `allocate_minor` gives the same result at normal amounts and no overflow at extreme ones.
  - Units: a zero estimate is null, and `allocatePlacement` refuses \|P\| > 10^12.
  - QA's four QA-N2-08/09 cases run without `.fails`. QA's SQL ↔ TS boundary case with P = 9×10^12 was scaled to the largest legal amounts (P = I = 9×10^11, C = 9.5×10^11).
- **Unit, drop 2:** `src/lib/money/__tests__/allocate-placement.test.ts` (E1–E6, legacy equality, sum = P, BigInt range, `computeFee`).
- `tests/integration/api-surface.test.ts` allow-lists `save_job_terms`, `get_jobs_terms_state`, `admin_amend_referral_terms`, `admin_get_referral_terms` and `get_referral_terms_context`.
