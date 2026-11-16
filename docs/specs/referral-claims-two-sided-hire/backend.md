# Backend contract: Referral-level claims and two-sided hire reporting (N3), v1 (drop 1) + v2 (drop 2)

Owner: Backend Engineer · Date: 2026-11-16 · Brief rev. 2 (PD-071 to PD-076) · Spec: `spec.md` rev. 2 (frozen, 104 ACs)
Scope: brief step 6a, drop 1. That's BR-1 and BR-2 (prerequisites), Must 0b (N2 leftovers: shipped in `job-terms-card/backend.md` v2.5, plus AC-104 here), BR-3, BR-4, B's record path BR-7 to BR-15 (with the `deemed_agreement_enabled` flag and hires recorded without a split), BR-45, fee-pending placements BR-31 and BR-32, release and ownership BR-34 to BR-36, the admin note and tasks (BR-12, BR-13, BR-31), and the Ops SQL (HA-9, HA-1 and the metrics).
Not in drop 1: hire reports, answers, admin decisions, deemed confirmation, the authorization check (RD-029), HA-6, and the notifications that belong to them. **Drop 2 is documented from §14 on (v2).** Sections 1–13 are the v1 contract and stay valid; v2 only adds to them, except where §14 says otherwise.

Migrations (local only; never pushed). They run after N10's `20261116001000`–`001700`, which are in the same tree.

| File | Content |
|---|---|
| `supabase/migrations/20261117000100_n3_placement_fee_pending.sql` | `placement_status` + `fee_pending` (own file: enum value) |
| `supabase/migrations/20261117000200_n3_hire_schema.sql` | `app.platform_settings` (+ audit trigger, `deemed_agreement_enabled = false`), agreements `origin` / `deemed_at` (+ guard), placements fee-pending shape and clocks (+ guard), `fee_difference_reason` + `non_permanent_engagement`, `app.placement_fee_notices`, `public.hire_records`, `app.hire_record_admin`, `void_reason` + `authorization_void`, helpers |
| `supabase/migrations/20261117000300_n3_prerequisites.sql` | BR-1: `app.job_partner_visible` / `app.job_hidden_reason` (+ `no_client_name`), trigger `jobs_referral_open_client_name`. BR-2: `record_candidate_request_delivery` dropped and recreated service-role only, with `p_actor` |
| `supabase/migrations/20261117000400_n3_record_hire.sql` | `app.hire_compute`, `app.create_deemed_agreement`, `app.record_hire_kind`, `report_hire` v3 (dropped and recreated), `app.establish_hire` (drop 2's uphold/deemed path), `app.enforce_pipeline_owner` (hire exemption) |
| `supabase/migrations/20261117000500_n3_fee_pending_release_reads.sql` | `complete_fee_details`, finance guards (`record_invoice`, `record_payment_evidence` + triggers), release from declined / rejected (`app.release_allowed`, `release_referral`, `get_referral_presentation`), `get_referral_hire_state`, admin hire record / note / tasks / notice, `run_hire_maintenance` |

Every N3 edit to a copied function is marked `-- N3` in the SQL.

---

## 1. Data model

| Object | Columns / rule | Who reads |
|---|---|---|
| `app.platform_settings` | `key`, `value jsonb`, `updated_at`, `updated_by`. Row `deemed_agreement_enabled` = `false`. Insert/update audited (`platform.setting_changed`, platform-level); delete refused | Nobody through the API (no grants). Read inside RPCs via `app.deemed_agreement_enabled()` |
| `public.hire_records` | One per referral (`referral_id` unique). `kind`: `placement` · `record_only_released` · `record_only_no_agreement`. `placement_id` (set iff `placement`). `origin`: `target_record` (B's record) · `report_confirmed` · `report_deemed` · `report_upheld` (drop 2). `prior_status`, `offer_accepted_on` (null = unknown), `start_date`, `hired_role_title` (≤ 120), `recorded_by`, `created_at`. Insert-only (update/delete trigger, every role) | Either side of the referral (`app.can_see_referral`, record scope) and platform admins. `authenticated`: SELECT only; `anon`: nothing |
| `app.hire_record_admin` | `late` (BR-13), `admin_note` (≤ 2,000), `note_updated_by/at` | Platform admins through RPCs only |
| `collaboration_agreements` | + `origin` (`confirmed` · `deemed`), `deemed_at` (set iff deemed). The origin changes once: `pending_source` + `confirmed` → `active` + `deemed` | As today |
| `placements` | `contracted_fee_minor`, `start_date`, `currency`, `reported_by` may be null **only** while fee details are pending (status `fee_pending`, or `disputed` / `cancelled` coming from it). + `invoice_due_at` (start + 10 business days, BR-14), `established_how` (`deemed` · `upheld`), `established_at`, `fee_details_due_at` (established + 10 business days), `fee_details_entered_at`. Check `placements_fee_shape`. `fee_difference_reason` accepts `non_permanent_engagement` (BR-15) | As today (both orgs, platform admin) |
| `app.placement_fee_notices` | `overdue_notified_at`, `notice_sent_on`, `notice_note`, `notice_recorded_by/at` | Platform admins through RPCs only |
| `app.referral_presentations.void_reason` | + `authorization_void` (written by drop 2's RD-029 decision) | Unchanged |

Helpers (`app`, no grants):
- `app.hire_eligibility(referral)` → `eligible` · `record_only` (released) · `recorded` · `not_eligible` (BR-4);
- `app.referral_window_end(r)` (snapshot window from delivery; legacy: delivery + 12 months);
- `app.referral_client_keys(referral)` (BR-3 union of the commit and delivery keys);
- `app.objection_open(referral)` (BR-45);
- `app.deemed_agreement_enabled()`;
- `app.hire_compute(...)` (N2 fee checks);
- `app.create_deemed_agreement(referral)`;
- `app.record_hire_kind(referral, eligibility)`;
- `app.establish_hire(referral, 'deemed' | 'upheld')`;
- `app.date_et(date)`;
- `app.referral_in_progress(status)`.

**BR-4 in code.** A referral is `not_eligible` when any of these holds:
- its status is `awaiting_candidate`, `candidate_declined`, `already_presented` or `hired`;
- `void_reason` is `prior_presentation_upheld`, `already_presented` or `authorization_void`;
- its objection is upheld or final (effective status);
- it has no `delivered_at`, unless it's `offer` with an active agreement (happy path unchanged, PD-074);
- it's closed (not `submitted` … `offer`) and now > window end + 9 months.

A released referral is `record_only`. A referral with a hire record or a placement is `recorded`.

---

## 2. Prerequisites

### 2.1 BR-1 client-name gate
- `app.job_partner_visible(j)` adds `app.client_key(j.client_name) is not null` (on top of N10's body). Every partner surface uses it (opportunities, `assert_referable` / both submit RPCs, triage, seen marks, terms state, admin metrics).
- `app.job_partner_open(j)` doesn't change, so delivery (`respond_candidate_request`) of in-flight referrals is unaffected (AC-3).
- `app.job_hidden_reason(j)` returns **`no_client_name`** after `no_terms`, `not_permanent` and `currency_mismatch` (spec order a–d). `get_jobs_terms_state` therefore returns it in `hidden_reason`.
- Trigger `jobs_referral_open_client_name` (fires after N2's `jobs_referral_flag_guard`, so that guard keeps its code) refuses `accepts_external_referrals` false → true (or an insert with true) without a key, for every role and path, with **`client_name_required_for_referrals`** (22023). `save_job_terms(p_open => true)` raises it, and the whole transaction rolls back (no version is created).
- Form: `jobFormSchema` refuses an empty or placeholder `clientName` while `acceptsExternalReferrals` is on (drafts included, even with Hide client). Field error `clientName: ["jobs.validation.clientRequiredForPartners"]`. The check runs **before** anything is saved (AC-1). The TS mirror is `clientKey()` in `src/lib/client-key.ts`; an integration test checks its parity with SQL.
- Not done (question Q-1, §11): an exemption for internal referrals.

### 2.2 BR-2 server-only delivery
- `record_candidate_request_delivery(p_referral uuid, p_actor uuid, p_ok boolean, p_error text = null)` is **service_role only** and refuses user JWTs. The old 3-argument signature is dropped.
- It checks that the actor is an active member of the source org (or settling, as N10 allows), and has source-side record scope.
- `emailCandidateRequest` (`candidate-request.ts`) calls it through the admin client after the send, with `p_actor = ctx.user.id`. A member calling it directly gets a privilege error, and `sent_at` doesn't change (AC-5).
- It's off the `api-surface` allow-list.

---

## 3. The hiring side records a hire

### 3.1 `report_hire` v3 (dropped and recreated; one signature)
```
report_hire(p_referral uuid, p_expected_version int, p_start_date date,
  p_terms_version uuid = null, p_base_minor bigint = null, p_bonus_minor bigint = null, p_invoiced_fee_minor bigint = null,
  p_difference_reason text = null, p_difference_note text = null,
  p_legacy_fee_minor bigint = null, p_legacy_currency char(3) = null, p_legacy_guarantee_days int = null,
  p_offer_accepted_on date = null,      -- BR-8: null = unknown (the start date is used for timing)
  p_hired_role_title text = null)       -- BR-3/BR-8: another role at this client (≤ 120)
→ uuid    -- the placement id, or NULL for a hire recorded without a split
```
Checks, in order:
1. Signed in; the referral exists and the caller sees it as the target side (job owner or `org_admin` / `recruiter_manager` of B, RD-036). Otherwise **`not_found`** (was `forbidden` in N2; spec §2.0).
2. Rate limit `hire.record` 30/h → `rate_limited`.
3. `stale_version`.
4. `app.hire_eligibility` not in (`eligible`, `record_only`) → **`hire_not_eligible`**.
5. B's own objection open or contested → **`objection_open`** (BR-45).
6. Dates → **`hire_dates_invalid`**:
   - start required, within [delivery − 366 days, today + 548 days] (ET);
   - acceptance ≤ today, ≤ start, and ≥ the same floor.
7. `p_hired_role_title` over 120 characters, or the referral has no client key → `hire_not_eligible`.
8. Outcome `app.record_hire_kind`:
   - released → **record without a split** (BR-11);
   - active agreement → **placement**;
   - otherwise, flag on → **deemed agreement + placement**; flag off → **record without a split** (V4).
9. Money (`app.hire_compute`, the N2 rules) for placement and deemed outcomes. A released referral is validated exactly like the variant it would otherwise be, then its money is **discarded** (no oracle before the record, AC-26/27). Codes: `hire_terms_changed`, `hire_terms_fixed`, `hire_base_invalid`, `invalid_fee`, `fee_difference_reason_required`, `fee_difference_not_allowed`, `fee_difference_note_too_long`, `terms_not_recorded`.

Effects:
- **Deemed:** a pending agreement becomes `active` + `deemed` (AC-21). With none, one is inserted from the referral's frozen rule (legacy: the default rule whose `effective_from` ≤ `submitted_at`, HE-8), with `terms_version_id` = the effective terms, 0 sourcing bps when internal (HE-14) and `active`. Audit `agreement.deemed` (both orgs).
- **Placement:** as in N2, plus `invoice_due_at = app.add_business_days(start, 10)`.
- **Referral:** → `hired` from **any** eligible status. The status event records the real previous status. The pipeline-owner rule is waived for this move only (§11 Q-2).
- **`hire_records`:** row with `origin = target_record`.
- **`late`:** true when now > start + 5 business days, or now > acceptance + 5 business days. Never within 5 business days after `referrals.claim_rejected_at` (BR-45). Stored only in `app.hire_record_admin`.
- **Notifications** to A (record scope):
  - `placement.hired` (as N2) for a placement on a confirmed agreement;
  - **`hire.recorded_deemed_agreement`** for a deemed agreement, link `/commissions/{id}`;
  - **`hire.recorded_without_split`** for a record without a split, link `/referrals/{id}`;
  - `placement.fee_difference` (as N2; the reason label includes non-permanent engagement).
- **Audit:**
  - `placement.created` (target org, as N2);
  - `referral.hire_recorded` for the target org `{hire_record_id, kind: placement|no_split, prior_status}` and the source org `{hire_record_id, kind}`;
  - a platform-level `referral.hire_recorded` `{…, late}`, the only place `late` appears in audit metadata.

Drop 2 adds here: closing a pending hire report as `closed_by_record` (BR-22), and the `p_report` argument (confirm, BR-24).

### 3.2 `get_referral_hire_state(p_referral uuid, p_acting_org uuid = null)` → jsonb
Side from `p_acting_org`: source when it's the source org and the caller sees the referral as source; target likewise. With null, source is tried first. Otherwise `not_found`. Type `ReferralHireState` (`src/features/referrals/queries.ts`).

Common keys:

| Key | Meaning |
|---|---|
| `side` | `"source"` \| `"target"` |
| `status`, `version`, `delivered_at` | As on the referral |
| `in_progress` | `submitted` … `offer` |
| `protected_until` | Window end (null when undelivered) |
| `ownership` | `released` (source only) · `ended` · `void` · `not_delivered` · `protected` · `closed`. Spec §2.12: `protected` → `detail.protectedUntil` (+ `detail.protectedUnlessReleased` for B); `closed` → A: the filing-limit line, B: no line; `ended` → `detail.ownershipEnded`; `void` → `detail.ownershipVoid`; `not_delivered` → `detail.ownershipStartsAtDelivery`; `released` → `detail.ownershipReleased` |
| `hire_record` | null, or `{kind: "placement"\|"no_split", no_split_reason: "released"\|"no_agreement"\|null, origin, recorded_at, offer_accepted_on, start_date, hired_role_title, placement_id}` |
| `agreement` | null, or `{status, origin: "confirmed"\|"deemed", deemed_at}` (the `detail.agreement.deemed` pill when `origin = "deemed"`) |

Target-only keys:

| Key | Meaning |
|---|---|
| `can_record` | Show **Record hire** (E1/E2) |
| `variant` | `objection_open` (V0) · `happy` (V1) · `confirmed` (V2) · `deemed` (V3) · `no_agreement` (V4) · null |
| `legacy` | true → V6's free fee entry inside the variant |
| `other_role_allowed` | Render "Another role at this client" |
| `job_title` | For "This job: {job}" |

**V5 is never returned.** A released referral gets the variant it would otherwise have, `can_record` true, and `ownership` without `released`. B's payload is identical with and without a release (AC-27, tested byte-for-byte apart from ids and timestamps).

Source-only keys:
- `released_at`;
- `window_end`;
- `report_until` (window end + 6 months);
- `report_tail_until` (+ 9 months), for the filing-limit line (`hireReport.limit` / `limitTail` / `limitClosed`). Drop 2 enforces them on filing.

### 3.3 Server Action `reportHire(orgSlug, prev, formData)` → `ActionResult<HireOutcome>` (`src/features/referrals/actions.ts`)
- FormData: N2's fields (`referralId`, `version`, `startDate`, `termsVersionId`, `baseSalary`, `targetBonus`, `invoicedDifferent`, `invoicedFee`, `differenceReason`, `differenceNote`; legacy `fee`, `currency`, `guaranteeDays`), plus N3's:
  - **`offerAcceptedOn`** (YYYY-MM-DD or empty);
  - **`acceptanceUnknown`** (`"on"`);
  - **`role`** (`this_job` default · `other`);
  - **`otherRoleTitle`**.
  - V1 posts none of the N3 fields. A related-org field doesn't exist; anything posted is ignored (AC-28).
- The action reads `get_referral_hire_state` first. The variant comes from the server, never the form.
  - Not visible → `{ok: false, error: "referrals.errors.notFound"}`;
  - V0 → `errors.objection_open`;
  - `can_record` false → `errors.hire_not_eligible`.
- Field errors:
  - `offerAcceptedOn`: `referrals.hire.validation.acceptanceFuture` / `acceptanceAfterStart`;
  - `otherRoleTitle`: `referrals.hire.validation.otherRoleTitle`;
  - the N2 money keys as before. V4 takes no money (posted money is ignored).
- Results:
  - **placement** → `redirect("/workspace/{org}/commissions/{id}?created=1")`, as today;
  - **record without a split** → `{ok: true, data: {outcome: "record_only", noSplitReason: "released" | "no_agreement"}}`. `released` → `hire.recordOnlyResult`; `no_agreement` → `hire.noAgreementResult`.
- RPC errors go through `toActionError`. `not_found` → `referrals.errors.notFound`.
- Pure helper `hireCommonFields()` in `src/features/referrals/schemas.ts`, which the dialog can reuse. Money parsing is shared with fee details in `src/features/referrals/hire-money.ts` (`parseHireMoney`).

---

## 4. Fee-pending placements (BR-31, BR-14, BR-32)

- **Creation:** only `app.establish_hire(referral, 'upheld' | 'deemed')` creates them (drop 2: the uphold decision and the deemed sweep).
  - Active agreement, or flag on (deemed agreement) → placement `fee_pending`, currency = the snapshot currency (null for legacy), `established_*`, `fee_details_due_at = established + 10 business days`.
  - Flag off and no confirmed agreement → a hire recorded without a split (BR-10, AC-25).
  - The referral → `hired`; `hire_records.origin = report_upheld | report_deemed`; never `late`.
- **`complete_fee_details`**:
  ```
  complete_fee_details(p_placement uuid, p_expected_version int, p_start_date date, p_terms_version uuid = null,
    p_base_minor bigint = null, p_bonus_minor bigint = null, p_invoiced_fee_minor bigint = null, p_difference_reason text = null,
    p_difference_note text = null, p_legacy_fee_minor bigint = null, p_legacy_currency char(3) = null, p_legacy_guarantee_days int = null) → void
  ```
  Checks, in order: target side, else `not_found`; rate limit `hire.record`; `stale_version`; status ≠ `fee_pending` → `placement_locked`; `hire_dates_invalid`; N2 money checks (incl. `hire_terms_changed`). It sets the fee facts once (through a guard on a transaction-local flag), `invoice_due_at`, `fee_details_entered_at`, `reported_by`, then status → `hire_reported` (a normal N2 placement). Audit `placement.fee_details_entered` (target: amounts; source: none).
- **Action `completeFeeDetails(orgSlug, prev, formData)`** (`src/features/commissions/actions.ts`):
  - FormData `placementId`, `version` (the **placement** version), `startDate`, then the N2 fee fields (snapshot) or `fee` / `currency` / `guaranteeDays` (legacy, PD-074);
  - success message `commissions.feeDetails.saved`; field errors as in the record dialog.
- **Finance guards:**
  - `record_invoice` and `record_payment_evidence` return **`placement_fee_pending`** before any other check;
  - BEFORE INSERT triggers on `invoice_records` and `payment_evidence` refuse it for every path, service role included;
  - allocation is unreachable (no evidence possible);
  - `open_dispute` stays available (BR-33).
- **Overdue:** `run_hire_maintenance()` (worker, every 10 minutes) sends **`fee_details.overdue`** to B once per placement and audits it. The admin task is listed by `admin_list_hire_tasks` (§6). Nothing is paused.
- **Invoice overdue chip (BR-14):** read `placements.invoice_due_at < now()` and no `invoice_records` row. No new RPC.
- **Frontend data for the fee-pending panel** (spec §2.4):
  - `placements.status = 'fee_pending'`, `established_how`, `established_at`, `fee_details_due_at`;
  - the estimate from `getReferralTerms(...).feeEstimateMinor` / `rateBps` / `feeBasis` (legacy: `recorded = false` → `commissions.feePending.legacy`);
  - amounts render "—" (`projectedSplit` returns null when the fee is null).

---

## 5. Release and ownership (BR-34, BR-35)
- `release_referral` accepts **`declined`** and **`rejected`** (besides `withdrawn` and `cancelled`). `get_referral_presentation(...).can_release` follows.
- `app.release_allowed` adds "no hire record or placement". This applies to the withdraw dialog's release checkbox too.
- The BR-21 per-client report block comes with drop 2 (no hire reports exist yet).
- Refusals keep `release_not_allowed`. B can't release (`not_found`).
- Ownership line: `get_referral_hire_state.ownership` (§3.2).
- **Pipeline (E2, PD-075):** dropping a card on **Hired** from `accepted`, `interviewing` or `offer` opens the same dialog. Read `get_referral_hire_state` for the variant.

---

## 6. Admin (platform admin only; any other caller gets `not_found`)

| RPC | Input | Returns / effect |
|---|---|---|
| `admin_get_hire_record(p_referral)` | — | null (no hire record) or `{id, referral_id, kind, record_kind, origin, prior_status, recorded_at, offer_accepted_on, start_date, hired_role_title, placement_id, late, admin_note, note_updated_at}` (type `AdminHireRecord`) |
| `admin_set_hire_record_note(p_referral, p_note)` | ≤ 2,000; empty clears | Audit `hire_record.note_saved` (platform-level, no text). Errors `note_too_long`, `not_found`. Rate limit `admin.hire` 60/h |
| `admin_list_hire_tasks()` | — | Rows `{task: "late"\|"fee_overdue", referral_id, placement_id, job_title, candidate_label, source/target org id and name, recorded_at, start_date, offer_accepted_on, fee_details_due_at, notice_sent_on, notice_note}` (type `AdminHireTask`). Fee-overdue rows stay until the fee details exist |
| `admin_record_fee_notice(p_placement, p_sent_on, p_note = null)` | The date is between the establishment date and today; note ≤ 2,000 | Errors `notice_date_invalid`, `note_too_long`, `not_found`. Audit `placement.fee_notice_recorded` |

Actions (`src/features/admin/actions.ts`):
- `saveHireRecordNote({referralId, note})` → `admin.hireRecord.noteSaved`;
- `recordFeeNotice({placementId, sentOn, note?})` → `admin.hireReports.noticeSentLine`.

Queries (`src/features/admin/queries.ts`): `getAdminHireRecord(db, referralId)`, `listAdminHireTasks(db)`.

**AC-104 (done):** `AmendTermsForm` calls `router.refresh()` when the action returns `errors.stale_version`. The inline error stays, and the hidden `expectedPctCurrency` re-renders with the current currency.

---

## 7. Error codes and i18n keys

Codes mapped in `toActionError` (new): `hire_not_eligible`, `objection_open`, `placement_fee_pending`, `client_name_required_for_referrals`. `hire_dates_invalid`, `note_too_long` and `notice_date_invalid` map to `errors.generic` by design: the forms validate them first.

Keys added in en / fr / pt with the spec §5 en text. **The fr and pt text are backend drafts; the ux-writer replaces them with the final §5 copy:**
- `errors.hire_not_eligible`, `errors.objection_open`, `errors.placement_fee_pending`, `errors.client_name_required_for_referrals`;
- `jobs.validation.clientRequiredForPartners`;
- `referrals.hire.validation.acceptanceAfterStart` / `acceptanceFuture` / `otherRoleTitle`;
- `labels.placementStatus.fee_pending`, `labels.placementStatusDescription.fee_pending`;
- `labels.feeDifferenceReason.non_permanent_engagement`;
- `commissions.feeDetails.saved`;
- `admin.hireRecord.noteSaved`;
- `admin.hireReports.noticeSentLine`.

Every other §5 key (dialog copy, banners, panels) is the frontend's and the ux-writer's.

Notification kinds in drop 1 (English in SQL, PD-026): `hire.recorded_deemed_agreement`, `hire.recorded_without_split`, `fee_details.overdue`. The params carry no client name, employer text or candidate identifiers. A gets the partner-visible candidate label.

---

## 8. Money-bounds checklist (PD-059, BR-32)

| Input | RPC bound | Table bound |
|---|---|---|
| Base, bonus (`report_hire`, `complete_fee_details`) | > 0 (bonus ≥ 0), ≤ 10^12 → `hire_base_invalid` | `placements_reported_base_minor_check`, `placements_reported_bonus_minor_check` |
| Computed fee C | ≤ 10^12, numeric comparison | `placements_computed_fee_minor_check` (> 0) |
| Invoiced fee I | > 0, ≥ ceil(C/100), ≤ 100·C, ≤ 10^12 → `hire_base_invalid` / `invalid_fee` | `placements_contracted_fee_minor_check` (> 0) |
| Legacy fee | > 0, ≤ 10^12 → `invalid_fee` | as above |
| Fee-pending placement | No amount at all until fee details | `placements_fee_shape` |
| Dates (start, acceptance) | Bounded so the business-day table covers them → `hire_dates_invalid` | `hire_records` acceptance ≤ start |

The admin enters no money (rule 7.5). Estimates still fail closed per row (N2 `app.terms_estimate`).

---

## 9. Record-scope rule (PD-064) and N10 coordination

Re-copied from the **live** catalog (`pg_get_functiondef` after `db:reset`). `20261115000300_recruiter_record_scope.sql` is never edited (md5 `dcd27209…`, checked before every reset).

| Function | Live source | Change |
|---|---|---|
| `public.release_referral` | `20261115000300` | + `declined`, `rejected` |
| `public.get_referral_presentation` | `20261116000300` | `can_release` statuses |
| `public.record_candidate_request_delivery` | `20261116001300` (N10) | Dropped and recreated with `p_actor`, service role |
| `public.report_hire` | `20261116000600` | v3 |
| `app.job_partner_visible`, `app.job_hidden_reason` | `20261116001300` (N10) | Client key |
| `app.release_allowed` | `20261113000400` | No hire record |
| `public.record_invoice`, `public.record_payment_evidence` | `20261107000500` | `placement_fee_pending` |
| `app.guard_agreement_update` | `20261116000100` | Origin |
| `app.guard_placement_fee` | `20261116000400` | Fee-details completion |
| `app.enforce_pipeline_owner` | `20261110000500` | Hire exemption |

**N10 is being built in the same tree, against the same local DB.** These N3 migrations sort after N10's (`20261116001000`–`001700`). If N10 adds a later migration that redefines any function in the table above, it must start from these N3 bodies, and the reverse is true for N3. N10's settlement mode works through `app.user_sees_referral_as_*` / `app.notify_eligible`, so every N3 RPC that checks `app.sees_referral_as_*` follows it.

---

## 10. Ops SQL (PD-069 cut 3, PD-073)

`docs/ops/n3-hire-signals.sql` (+ `docs/ops/README.md`):
- `ha9_release_before_hire`: AC-78. A test runs it verbatim: within 14 days, by either key, never across hiring orgs.
- `metric_client_key_coverage`, `metric_self_recorded_non_offer`, `metric_record_duty`, `metric_fee_pending_age`.
- `ha1_hires_first_reported_by_source`: valid once drop 2 ships `public.hire_reports`. It counts `closed_by_record` (PD-075).

---

## 11. Deviations and questions for the PM

1. **Q-1 (AC-3, BR-1): internal referrals to a job with no client name.** Today an internal (related-org) referral also needs the job to be open to partners. There's no internal path to a closed job, so AC-3's "a job that isn't open to external partners still receives internal referrals" isn't true before or after N3. I applied the name gate to every referral, internal ones included (deny by default). **Default: keep it.** An exemption would mean a per-viewer predicate in `get_opportunities` and `assert_referable` (~0.5 d).
2. **Q-2 (BR-7 vs the pipeline-owner rule, `20261110000500`).** Once a referral is accepted, only the member who accepted it may move it, `hired` included. BR-7 and AC-14 let the job owner or any B manager record the hire. `report_hire` now waives the pipeline-owner rule for the `hired` move only; transitions are unchanged. **Default: as built.**
3. **Q-3 (AC-15): "a declined referral with an active agreement" can't happen.** `accepted → declined` isn't a valid transition, so a declined referral never has an agreement. With the flag off it records as V4, and with the flag on as V3. AC-15's other statuses (withdrawn, rejected, cancelled, accepted, interviewing) are covered with an active agreement.
4. **`report_hire` answers `not_found` instead of `forbidden`** to anyone who can't act (spec §2.0). It also answers `hire_dates_invalid` (not `invalid_fee`) for a missing start date. No other suite asserted the old codes.
5. **`hire_dates_invalid` start bound** is today + 548 days, so the holiday calendar (seeded through 2029) covers `invoice_due_at`. Ops must seed 2030 before mid-2028.

---

## 12. Tests

- **Integration:** `tests/integration/n3-record-hire.test.ts`, 31 tests:
  - BR-1: refusals through every path, nothing saved, no name leak, `no_client_name`, in-flight referrals carry on, TS ↔ SQL client-key parity;
  - BR-2: grants, actor check, a single function;
  - BR-4 / BR-7: statuses, timeline, happy path, ineligible matrix, window + 9 months, legacy windows, roles (owner, manager; B recruiter, A, C, anon, unknown id);
  - BR-3 / BR-8: other role and minimum fee, no-key refusal, date rules, BR-15 reason, `hire_terms_changed`;
  - BR-9 / BR-11: deemed new and pending, record without a split, flag not writable plus audit, internal 0 bps, released identical payloads, money oracle closed, discarded money;
  - BR-13 / BR-45: late rules, admin-only visibility, `objection_open`, the post-rejection exemption;
  - BR-31 / BR-32: fee-pending shape, finance refusals (RPC and direct insert), dispute allowed, fee details (roles, bounds, stale terms, locked), legacy free entry, establish with the flag off and on, overdue sweep once, tasks, notice;
  - BR-34 / BR-35: release from declined / rejected, refused after a hire; ownership states; side-shaped keys; not found for others;
  - BR-12: admin note, audit without text, length, not found;
  - BR-36: the HA-9 Ops query.
- `tests/integration/api-surface.test.ts`: the six new RPCs are allow-listed; `record_candidate_request_delivery` is removed (now service role).
- **Other suites, intentional behaviour changes:**
  - `duplicate-presentation.test.ts`:
    - the placeholder-scope test now sets the keyless state after the fact and asks `app.presentation_check` (BR-1 forbids opening keyless jobs);
    - declined referrals are now releasable, but not after a hire (BR-34);
    - incidental `client_name: null` fixtures get a real name.
  - `duplicate-presentation-qa.test.ts`: one fixture gets a real name.
  - `terms-hire-ledger.test.ts`, `terms-card-qa.test.ts`, `recruiter-record-scope.test.ts`: `report_hire` answers `not_found` instead of `forbidden`.
- **Dev helper:** `scripts/set-deemed-flag.sh on|off` (local database only, PD-074).
- **Unit:**
  - `src/lib/__tests__/client-key.test.ts`;
  - `src/features/jobs/__tests__/client-name-gate.test.ts`;
  - `src/features/referrals/__tests__/hire-common-fields.test.ts`.

---

## 13. Left for drop 2 (backend.md v2)

- **Hire reports** (BR-6 tail enforcement, BR-17 to BR-22): tables, the generalized N1 evidence pipeline, filing, side-shaped reads, the per-client release block (hook in `app.release_allowed`), and `closed_by_record` in `report_hire`.
- **Answers** (BR-23 to BR-29): confirm via `report_hire(p_report)`, contest and the `hire_report` dispute kind, rebuttal, stored clocks and reminders, the silence gate on `app.email_deliveries` (N7 data contract), the suspended-party and no-active-job-owner rules, uphold / deemed via `app.establish_hire`.
- **Admin:** decide (three outcomes), detail and queue, dispute fields, same-person extension, decision overdue.
- **RD-029 authorization check** (BR-37, BR-38): writes `void_reason = 'authorization_void'`, which this drop already reads.
- **Flags and notifications:** HA-6, the hire-report notification kinds, and the `docs/domain-model.md` / `docs/security-and-privacy.md` / `docs/product-flows.md` updates for N3.


---

# v2 (drop 2), 2026-11-16

Scope: brief step 6b plus PD-077 and the frontend's drop-1 requests (`frontend.md` §5). **Every v1 contract stays valid.** The changes to v1 are listed in §14 and only add arguments, keys or field errors.

| Migration | Content |
|---|---|
| `20261117000600_n3_hire_reports_schema.sql` | `app.hire_reports`, `app.hire_report_items`, `app.hire_evidence_files` + bucket `hire-evidence` (storage insert policy, upload rate limit), `app.auth_check_requests`, `app.authorization_checks`, `app.email_deliveries` (N7 contract), `candidate_consents.disputed_at`, `disputes` kind `hire_report` (+ `hire_report_id`, outcomes, target check), `disputes_select` policy (re-copied from N10), rules gate on the new tables |
| `20261117000700_n3_hire_evidence.sql` | Evidence RPCs: register / list / remove / authorize; scan target and result, orphan purge (service role) |
| `20261117000800_n3_hire_report_flow.sql` | Filing, contest, rebuttal, `get_hire_reports`, the silence gate, `report_hire` v3.1, `complete_fee_details` (PD-077 window), `app.release_allowed` (BR-21), `get_referral_hire_state` v2 keys, `run_hire_maintenance` v2 |
| `20261117000900_n3_hire_admin_authcheck.sql` | Admin queue, detail, fields, decision; HA-6; authorization check (request, open, evidence, decide, admin read) |
| `20261117001000_n3_placement_fee_state.sql` | `get_placement_fee_state` (frontend requests 2 and 3) |

## 14. Changes to v1 contracts (additive)

| v1 item | v2 change |
|---|---|
| `report_hire` (§3.1) | **+ `p_report uuid = null`** (dropped and recreated; named-argument callers are unaffected). Date window (PD-077): start **and** acceptance within **[delivery − 1 year (ET date), today + 548 days]** → `hire_dates_invalid`; acceptance is also ≤ today and ≤ start. On success, a pending hire report closes: `confirmed` when `p_report` is that report and it's `awaiting_answer` / `unanswered` (A gets `hire_report.confirmed`); otherwise `closed_by_record`, which also resolves an open `hire_report` dispute (outcome `hire_closed_by_record`; A gets `hire_report.closed_by_record`) |
| `reportHire` action (§3.3) | + FormData **`reportId`** (from the panel's Confirm). **`hire_dates_invalid` is now a field error**: `fieldErrors.startDate` (or `offerAcceptedOn` for an acceptance below the floor) = `["errors.hire_dates_invalid"]`. It's pre-checked in the action with `hireDateWindow()` (`src/features/referrals/schemas.ts`), and the RPC error maps to `startDate` as a fallback |
| `complete_fee_details` / `completeFeeDetails` (§4) | The same PD-077 window → `fieldErrors.startDate = ["errors.hire_dates_invalid"]` |
| `app.release_allowed` (§5) | + BR-21: no pending hire report from this source org at this hiring org on the same client (key union, both sides), this referral included. `can_release` and the withdraw checkbox follow; refusals stay `release_not_allowed` |
| `get_referral_hire_state` (§3.2) | Target side adds `pending_report_id`, `auth_check_requested_at`. Source side adds `can_report` (the client-visible filing conditions), `report_tail` (filing now needs the tail statement), `pending_report_id`, `record_created_at` (BR-38), `auth_check` (`{id, status, evidence_due_at, evidence_business_days_left, evidence_at, decided_at, can_send_evidence}` or null). No v1 key changed; B's payload still doesn't depend on a release |
| `run_hire_maintenance` (§4) | Returns `{fee_details_overdue, hire_report_reminders, hire_reports_deemed, hire_reports_unanswered, hire_reports_in_review}` |

## 15. Hire reports (sourcing side: BR-6, BR-17 to BR-20)

`file_hire_report(p_referral, p_acting_org, p_employer, p_start_month date, p_role, p_learned_via, p_statement, p_tail_statement, p_items jsonb, p_file_ids uuid[], p_attested)` → `{outcome: "filed", report_id, answer_due_at}`

1. **Payload** (checked first; reveals nothing) → `hire_report_invalid`:
   - employer 1–200; role ≤ 120 (empty = none);
   - `learned_via` ∈ `candidate · profile · announcement · contact · other`;
   - statement 20–2,000; attested;
   - `p_start_month` is the 1st of a month, ≤ current month + 3 (and, after eligibility, ≥ the delivery month);
   - `p_items` 1–5 of `{type ∈ candidate_message · company_announcement · profile_change · third_party · other, item_date ≤ today, captured_on? (≥ item_date, ≤ today), url? (https://, ≤ 2,000), backs_tail?}`;
   - ≤ 5 files.
2. Per-user limit: the N1 disputes bucket `dispute.open` 5/h → `rate_limited`.
3. **One generic code, `hire_report_unavailable`**, for every one of these: not the source side under record scope (including another org's id or a random id); not hire-eligible; released; out of tail (> window end + 9 months); a pending report; an open objection or open dispute; two rejected reports; a second report without an item dated after the first rejection. Exception: **`hire_already_recorded`** when a hire record exists.
4. Between window end + 6 and + 9 months: no tail statement, or no item with `backs_tail` → `hire_report_tail_required` (field-level; the action returns `fieldErrors.tailStatement = ["referrals.hireReport.validation.tail"]`).
5. Org limits: 3 pending, or 10 filed in a rolling 90 days → `hire_report_rate_limited`.
6. Files must be clean drafts (`hire_report`, this org, this referral) → `hire_report_files_not_ready`.

Effects:
- `awaiting_answer`, `answer_due_at` = filing + 10 business days;
- `hire_report.filed` to B (job owner and managers, record scope);
- audit `hire_report.filed` for both orgs (`{report_id}` only).

**`get_hire_reports(p_referral, p_acting_org)`** → newest-first array (type `HireReportView`, `src/features/hire-reports/queries.ts`). Either side, else `not_found`. Side shaping:
- **Links (`items[].url`):** sourcing side only.
- **Files:** each side sees its own files in full (`id, n, file_name, mime_type, size_bytes, uploaded_at, sha256, scan_status`). The other side sees `{n, uploaded_at, sha256}` only.
- **Contest:**
  - B sees its statement and its own files;
  - A sees the reason, the dates and the statement, except for `not_this_client` (statement null) and never B's files.
- **Resolution:** null for A when the finding was `not_this_client` (`not_this_client: true`).
- **Flags:**
  - `can_confirm`: B, while `awaiting_answer` / `unanswered`;
  - `can_contest`: B, `awaiting_answer`, before the deadline;
  - `can_rebut`: A, `contested`, once, before the deadline;
  - `can_request_auth_check` and `auth_check_requested_at`: B.

Statuses: `awaiting_answer · unanswered · contested · in_review · confirmed · closed_by_record · deemed_confirmed · upheld · rejected · void`.

## 16. Answer (BR-23 to BR-29, BR-44)

- **Confirm:** through `report_hire(p_report)` (§14).
- **`contest_hire_report(p_report, p_acting_org, p_reason, p_statement, p_offer_accepted_on, p_process_started_on, p_file_ids, p_attested)`** → `{rebuttal_due_at, dispute_id}`. The target side only, else `not_found`.
  - Rate limit `dispute.open`.
  - Validation → `hire_contest_invalid`: the reason is one of the four; statement 20–2,000; attested; `outside_window` needs both dates, with process start ≤ acceptance ≤ today.
  - Not `awaiting_answer`, or past `answer_due_at` → `hire_report_answer_closed`.
  - Another open dispute on the referral → `dispute_already_open`.
  - Files `hire_contest` → `hire_report_files_not_ready`.
  - Creates a `disputes` row (kind `hire_report`) and sets `rebuttal_due_at` = + 5 business days. Notifies A with `hire_report.contested`.
- **`rebut_hire_report(p_report, p_acting_org, p_statement, p_items, p_file_ids, p_attested)`** → `{decide_by}`. Source side only.
  - Validation → `hire_rebuttal_invalid`. Not contested, already rebutted, or late → `hire_rebuttal_closed`.
  - Sets `in_review`, `decide_by` = rebuttal deadline + 10 business days. Notifies B with `hire_report.rebuttal`.
- **Clocks** (`run_hire_maintenance`, worker every 10 minutes):
  - **Reminders:** at business days 5 and 8, once each, while `awaiting_answer` (`hire_report.reminder` to B).
  - **At `answer_due_at`:** `app.hire_report_deemable` decides. It requires: B not suspended; the job owner still active; a `delivered` `hire_report.filed` record with no bounced, complained or failed record, for the job owner **and** for another active `org_admin` / `recruiter_manager`. If so → `deemed_confirmed` plus `app.establish_hire(..., 'deemed')`, and `hire_report.deemed` to both sides. Otherwise → `unanswered`, `decide_by` = answer deadline + 10 business days.
  - **At `rebuttal_due_at` without a rebuttal:** `in_review`, no notification.
  - There's no restart and no reopen (PD-073).
- **N7 data contract (`app.email_deliveries`):**
  - columns: `notification_kind` (`hire_report.filed`), `entity_type` (`hire_report`), `entity_id` (the report id), `recipient_user_id`, `provider_message_id`, `status` (`queued · sent · delivered · bounced · complained · failed`), `status_at`;
  - unique (`provider_message_id`, `status`);
  - service role only. N7 writes it; QA seeds it.
- **Suspended parties:** with N10 in the tree, settlement-mode members act through N10's helpers (`app.user_sees_referral_as_*`). A B suspended at the deadline is never deemed.

## 17. Evidence files (the N1 pipeline, generalized)

- **Bucket:** `hire-evidence` (private; PDF / PNG / JPEG ≤ 10 MB).
- **Path:** `{acting org}/{referral}/{uuid}.{pdf|png|jpg}`. The storage insert policy (`app.can_upload_hire_evidence` + rules gate) admits a member of a side of the referral under record scope. A trigger limits uploads to 30 per user per hour (`storage.hire_evidence`).
- **Purposes (`owner_kind`):** the sourcing side uploads `hire_report`, `hire_rebuttal` and `auth_evidence`; the hiring side uploads `hire_contest` and `auth_request`.

| RPC | Contract |
|---|---|
| `register_hire_evidence(p_referral, p_owner_kind, p_storage_path, p_file_name, p_acting_org)` | → the file JSON (`{id, file_name, mime_type, size_bytes, uploaded_at, scan_status, sha256}`). Wrong side → `not_found`; bad object or path → `hire_evidence_invalid`; more than 5 drafts → `hire_evidence_too_many`. Enqueues `hire_evidence.scan` |
| `list_hire_evidence_files(p_referral, p_owner_kind, p_acting_org)` | Drafts, for polling |
| `remove_hire_evidence(p_file, p_acting_org)` | → storage path (the action deletes the object) |
| `authorize_hire_evidence(p_file, p_acting_org = null)` | Uploader org (own file) or platform admin (null org); clean only (`hire_report_files_not_ready`); audited `hire_evidence.accessed` |
| `hire_evidence_scan_target`, `record_hire_evidence_scan`, `purge_orphan_hire_files` | Service role only (worker) |

Filing attaches the drafts. Filed files are immutable, and the hash is written once.

Actions (`src/features/hire-reports/actions.ts`):
- `uploadHireEvidence(orgSlug, referralId, ownerKind, prev, formData{file})`;
- `getHireEvidenceFiles(orgSlug, referralId, ownerKind)`;
- `removeHireEvidence(orgSlug, {fileId})`;
- `getHireEvidenceUrl(orgSlug, fileId)` (60-second signed URL);
- admin: `getAdminHireEvidenceUrl(fileId)` (`src/features/admin/actions.ts`).

## 18. Admin (platform admin only, otherwise `not_found`)

| RPC | Contract |
|---|---|
| `admin_list_hire_reports()` | Rows `AdminHireReportRow`. `row_kind` is `report` or `auth_check`; `section` is `decide` (`in_review` / `unanswered`), `waiting` (`awaiting_answer` / `contested` / open checks) or `closed` (last 20). Also `deadline`, `overdue` (past `decide_by`) and the suspended flags. Tasks stay in `admin_list_hire_tasks` (v1) |
| `admin_get_hire_report(p_report)` | Everything (§2.9): `client {commit_key, delivery_key, job_client_name}` (names aren't stored at commit/delivery; the job's current name is shown), delivery and window dates (`tail_end` = window + 3 months, filing limits), `legacy`, `status_history`, the report (links, files), `answer`, `rebuttal`, `signals {same_person (not_available: no second referral to compare), record_created_at, email_changed_at, source_rejected_90d, late, hire_record_note}`, `delivery_records`, `admin {candidate_contacts, client_confirmation, note}`, `auth_check_request`, `auth_check`, `can_decide`, `uphold_creates_placement` (chooses `upholdBodyPlacement` / `upholdBodyNoSplit`) |
| `admin_set_hire_report_fields(p_report, p_candidate_contacts 0–5, p_client_confirmation, p_note ≤ 2,000)` | `hire_admin_fields_invalid`. Audited at platform level, never in a member payload |
| `admin_decide_hire_report(p_report, p_outcome 'upheld'\|'rejected', p_resolution 20–2,000, p_finding = null)` | → `{status, placement_id}`. A finding is required for `rejected` and refused for `upheld` (`hire_decision_invalid`). Only `in_review` / `unanswered` (`invalid_transition`). **Upheld:** `app.establish_hire(..., 'upheld')`, which gives a fee-pending placement, or a hire recorded without a split when the flag is off and there's no agreement (raises `hire_not_eligible` if the referral stopped counting). Closes the dispute (`hire_upheld` / `hire_rejected`). `hire_report.decided` goes to both orgs: A reads "upheld", "not upheld" or "not this client"; B reads "upheld" or "not upheld". No resolution text. No money argument exists |
| `admin_hire_report_flags()` | HA-6: `{organization_id, organization_name, rejected_90d}` where ≥ 2 |

Actions (`src/features/admin/actions.ts`):
- `decideHireReport({reportId, outcome, resolution, finding?})`;
- `saveHireReportFields({reportId, candidateContacts, clientConfirmation, note?})`;
- `openAuthorizationCheck`, `decideAuthorizationCheck` (§19).

Queries (`src/features/admin/queries.ts`): `listAdminHireReports`, `getAdminHireReport`, `listHireReportFlags`, `getAdminAuthorizationChecks`.

The admin overview tile count = the `decide` section + `admin_list_hire_tasks` `fee_overdue` rows with no `notice_sent_on` (computed in the page).

## 19. Authorization check (BR-37, BR-38)

| RPC | Contract |
|---|---|
| `request_authorization_check(p_referral, p_acting_org, p_reason 20–2,000, p_file_ids ≤ 5 = null)` | Target side. Needs a `contested` / `in_review` hire report, or a `contested` objection (`auth_check_not_available`). Once per dispute (`auth_check_already_requested`). Validation → `auth_check_invalid`. Files: `auth_request`. Notifies platform admins (`auth_check.request`) |
| `admin_open_authorization_check(p_referral, p_requested_by 'submitter'\|'candidate'\|'hiring_side', p_challenger_evidence)` | → `{id, evidence_due_at, recent_change_note}`. One open check per referral (`auth_check_already_open`). When there's a recent-change note (record created, or email changed, within 30 days before token issuance) **or** challenger evidence: `evidence_due_at` = + 5 business days and `auth_check.requested` to A. Otherwise the admin decides on the record |
| `submit_authorization_evidence(p_check, p_acting_org, p_statement 20–2,000, p_file_ids 1–5, p_attested)` | Source side, once, before the deadline (`auth_check_closed`). Files: `auth_evidence` |
| `admin_decide_authorization_check(p_check, p_valid, p_resolution 20–2,000, p_candidate_contacted = false)` | **Valid:** closes. **Invalid:** `void_reason = 'authorization_void'` (stops counting, loses first position, no fee), `candidate_consents.disputed_at`, `breach_review = true`, and a pending report → `void` with its dispute closed (`hire_void`). `auth_check.decided` to A. Never automatic |
| `admin_get_authorization_checks(p_referral)` | `{recent_change_note, requests[], checks[]}` with files; `no_evidence_by_deadline` preselects **Mark invalid** |

Actions:
- B and A (`src/features/hire-reports/actions.ts`): `requestAuthorizationCheck(orgSlug, prev, formData{referralId, reason, fileIds})`, `submitAuthorizationEvidence(orgSlug, referralId, prev, formData{checkId, statement, fileIds, attestation})`;
- admin (`src/features/admin/actions.ts`): `openAuthorizationCheck({referralId, requestedBy, challengerEvidence?})`, `decideAuthorizationCheck({checkId, valid, resolution, candidateContacted?})`.

The record-created note for A is `get_referral_hire_state.record_created_at` (source side only) and, for admins, `admin_get_hire_report.signals.record_created_at`.

## 20. Server Actions for the hire-report panel (`src/features/hire-reports/actions.ts`)

| Action | FormData | Result |
|---|---|---|
| `fileHireReport(orgSlug, prev, fd)` | `referralId, employer, startMonth ("YYYY-MM"), role, learnedVia, statement, tailStatement ("on"), items (JSON array of {type, itemDate, capturedOn?, url?, backsTail?}), fileIds[], attestation ("on")` | `{ok, data: {reportId, answerDueAt}, message: hireReport.messages.filed}`. `errors.hire_already_recorded` (with `{partner}`), `errors.hire_report_unavailable`, `errors.hire_report_rate_limited`, `errors.hire_report_files_not_ready`, `errors.rateLimited`, field errors (`referrals.hireReport.validation.*`) |
| `contestHireReport(orgSlug, referralId, prev, fd)` | `reportId, reason, statement, offerAcceptedOn, processStartedOn, fileIds[], attestation` | `hireContest.messages.contested`; `errors.hire_report_answer_closed`, `errors.dispute_already_open`, field error `offerAcceptedOn: hireContest.validation.dates` |
| `rebutHireReport(orgSlug, referralId, prev, fd)` | `reportId, statement, items (JSON), fileIds[], attestation` | `hireRebuttal.messages.sent`; `errors.hire_rebuttal_closed` |
| `requestAuthorizationCheck` / `submitAuthorizationEvidence` | §19 | `authCheck.messages.requested` / `authCheck.sentLine` |

Schemas: `src/features/hire-reports/schemas.ts` (the forms can reuse them). Queries: `getHireReports(ctx, referralId)` (`src/features/hire-reports/queries.ts`). Placement deadline: `getPlacementFeeState(ctx, placementId)` (`src/features/commissions/queries.ts`).

## 21. Frontend drop-1 requests (`frontend.md` §5)

1. **`hire_dates_invalid` as a field error:** done (§14).
2. **Business days left for fee details**, and 3. **the earliest allowed date:** `get_placement_fee_state(p_placement)` → `{placement_id, status, fee_details_due_at, fee_details_business_days_left, fee_details_overdue, delivered_at, start_date_min, start_date_max}`. Either org of the placement, otherwise `not_found`. Query `getPlacementFeeState`.
4. **Review of the frontend-owned server files:**
   - `src/features/referrals/hire-dialog-data.ts` (`loadHireDialog`) is **safe as is**. It runs in `guard`, with `assertCan('referrals:review')`, `parse(id)`, and the user-scoped RPC `get_referral_hire_state` (side-checked) plus `getReferralTerms` (RLS). Non-target viewers get `referrals.errors.notFound`, and the payload is a subset of what the referral page already reads. It can stay where it is; moving it into `actions.ts` buys nothing.
   - `src/features/commissions/placement-signals.ts` is **safe**. It's a `server-only` RLS read (`placements` scoped to the org plus `invoice_records`); `getReferralTerms` is readable by both sides. Note it makes one `getReferralTerms` call per fee-pending placement (N+1; fine at today's volumes).
   - `FEE_DIFFERENCE_REASONS` with `non_permanent_engagement` (`src/lib/money/terms.ts`) matches the DB constraint and `app.hire_compute`. Correct.

## 22. Error codes and i18n (v2)

- **Mapped codes (new):** `hire_report_unavailable`, `hire_report_rate_limited`, `hire_report_files_not_ready`, `hire_report_answer_closed`, `hire_rebuttal_closed`, `auth_check_already_requested`.
- **Handled explicitly in actions:** `hire_already_recorded` (with `{partner}`), `hire_report_tail_required` (field error), `hire_dates_invalid` (field error).
- **Mapped to `errors.generic` by design** (the forms validate first): `hire_report_invalid`, `hire_contest_invalid`, `hire_rebuttal_invalid`, `hire_evidence_invalid`, `hire_evidence_too_many`, `hire_admin_fields_invalid`, `hire_decision_invalid`, `auth_check_invalid`, `auth_check_closed`, `auth_check_not_available`, `auth_check_already_open`.
- **Keys added** with the **final §5 copy** in en / fr / pt, only those backend code references: the seven drop-2 error keys, `labels.disputeType.hire_report`, `referrals.hireReport.messages.filed`, `referrals.hireReport.validation.*`, `referrals.hireContest.messages.contested`, `referrals.hireContest.validation.dates`, `referrals.hireRebuttal.messages.sent`, `referrals.authCheck.messages.requested`, `referrals.authCheck.sentLine`. The drop-1 keys were re-synced to the final copy. Frontend adds every other §5 key.
- **Notification kinds (drop 2):** `hire_report.filed`, `.reminder`, `.contested`, `.rebuttal`, `.decided`, `.deemed`, `.closed_by_record`, `.confirmed`, `auth_check.requested`, `auth_check.decided`, plus `auth_check.request` to platform admins. English in SQL; no client name or key, employer text, evidence content or resolution.

## 23. Overlap with N10 (PD-078)

| Function / object | N10 definition | N3 redefinition | Rule |
|---|---|---|---|
| `app.job_partner_visible` | `20261116001300` | `20261117000300` (+ client key) | N3 carries N10's restriction check |
| `app.job_hidden_reason` | `20261116001300` | `20261117000300` (+ `no_client_name`) | N3 carries N10's restriction reasons |
| `public.record_candidate_request_delivery` | `20261116001300` (3 args, settling members) | `20261117000300` (**dropped**; 4 args, service role, settling actors allowed) | A later N10 migration must not recreate the 3-argument version |
| policy `public.disputes.disputes_select` | `20261116001400` (settling branch) | `20261117000600` (+ `hire_report` admin-only) | N3 carries N10's settling branch |

N3 also **depends on** N10 helpers without redefining them: `app.fmt_et`, `app.notify_platform_admins`, `app.attach_rules_gate` / `app.assert_rules_gate`, `app.is_member_or_settling`, `app.org_settlement_state`, and the settlement versions of `app.user_sees_referral_as_*` / `app.notify_eligible`. Every redefinition above started from the live body after a `db:reset` that included both sessions' migrations; the N3 migrations sort after N10's. The N3, N10 and record-scope suites run in the full integration run (§24).

## 24. Tests (v2)

- `tests/integration/n3-hire-reports.test.ts` (27 tests):
  - filing: happy path; the generic-refusal matrix; payload rules; tail; org limits; second report and two rejections;
  - the evidence pipeline and side-shaped views;
  - the BR-21 block; confirmed vs closed by record;
  - contest, including `not_this_client`, answer closed and dispute already open; rebuttal and its deadline;
  - reminders; the silence gate (no records, deemed, owner only, bounce, same person twice, no active owner, B suspended);
  - uphold (flag on, and flag off with no agreement); reject `not_this_client` and HA-6; admin detail and fields;
  - authorization check, end to end (request, open, evidence, invalid → void) and valid on the record; the BR-38 note;
  - **PD-077:** the date window, and the accepting member recording on the happy path when record scope shows them the referral;
  - `get_placement_fee_state`.
- Unit: `hireDateWindow` (`src/features/referrals/__tests__/hire-common-fields.test.ts`).
- `api-surface.test.ts`: 19 drop-2 RPCs allow-listed; the scan, purge and maintenance RPCs stay service-role only.

## 25. Still open after drop 2

- **Same-person signal:** shows "not available" on hire reports; HE-5 cross-org comparison isn't modelled.
- **Admin detail client names:** there are no client names at commit or delivery, only keys plus the job's current name. Storing the names would be a small follow-up.
- **Shoulds** (BR-16 nudge, BR-39 destination, employer signal): not built (PD-069 cut 1).
- **N7:** BR-30 reopen, and writing `app.email_deliveries`.

---

# v2.1 (fix loop round 1), 2026-11-16

Migration `supabase/migrations/20261117001100_n3_qa_round1.sql`. Bodies were re-copied from the live catalog after the user's reset (76 migrations, both sessions); it was applied with `supabase migration up --local`, without a reset. No N10 function is touched; the PD-078 overlap list (§23) is unchanged.

## 26. Fixes

| Item | Change |
|---|---|
| **QA-N3-01** | `app.establish_hire` sets `app.hire_record_rpc` around the `hired` move, so an admin uphold on `accepted` / `interviewing` / `offer` passes `app.enforce_pipeline_owner`. The waiver still covers only the move to `hired`; every other transition keeps the pipeline-owner rule |
| **QA-N3-02** | `file_hire_report`, `contest_hire_report`, `rebut_hire_report` and `request_authorization_check` now **return** refusals that happen after the per-user rate-limit hit, as `{"error": "<code>"}` (HTTP 200), instead of raising. The hit therefore commits and refused attempts count: the 6th attempt in an hour gets `rate_limited`. This is the N1 submit-RPC pattern (outcomes, not exceptions). The codes are unchanged and the generic refusal is still one identical payload. Files are checked before any write (`app.hire_files_ready`). These still **raise**: `unauthenticated`, `not_found` (side check), payload validation (`*_invalid`) and `rate_limited` itself |
| **QA-N3-03** | The HA-1 Ops query reads `app.hire_reports` and has a test |
| **QA-N3-05** | Reminders: when the day-5 and day-8 reminders are both due in one sweep, B gets two notifications and each timestamp is set |
| **QA-N3-06** | A Confirm (`report_hire(p_report)` on a report that's `awaiting_answer` / `unanswered`) stores `hire_records.origin = 'report_confirmed'`. B's own record keeps `target_record` |
| **QA-N3-07** | Drop-2 Ops metrics: `metric_report_resolution_time`, `metric_reports_to_placements`, `metric_contested_upheld`, `metric_placements_first_reported_by_source`, `metric_candidate_contacts_per_dispute` (`docs/ops/n3-hire-signals.sql`) |
| Copy | The hire-report and auth-check resolution schemas in `src/features/admin/actions.ts` use `admin.validation.resolutionLong` (20–2,000) |

## 27. Contract changes for frontend

1. **Direct RPC callers** of the four RPCs above must read `data.error` (§26). The Server Actions already map it, so their results are unchanged: `errors.<code>`, and the tail case as a field error.
2. **`hire_already_recorded` carries a target** (frontend gap 3). The RPC returns `{error: "hire_already_recorded", placement_id}`, where the placement id is null for a hire recorded without a split. `fileHireReport` returns `{ok: false, error, target: {placementId, referralId}}`. `ActionResult`'s failure branch gains the optional `target?: {placementId?: string | null; referralId?: string}` (additive, `src/lib/actions/result.ts`). Use it for **Open placement** (or **Open referral** when `placementId` is null).
3. **Business days left on admin deadlines** (gap 4):
   - `admin_list_hire_reports` rows add `deadline_business_days_left` (the function was dropped and recreated with the extra column);
   - `admin_get_hire_report` adds `answer_business_days_left`, `rebuttal_business_days_left` and `decide_business_days_left`, each null unless that deadline is open.
4. **`get_hire_reports`** items add `fee_details_due_at` (the established placement's deadline, for `panel.status.deemedTarget`'s `{when}`; `frontend.md` §D2.4 item 7).
5. **Exported types** (gaps 1 and 2):
   - `TargetHireState` adds `pending_report_id` and `auth_check_requested_at`;
   - `SourceHireState` adds `can_report`, `report_tail`, `pending_report_id`, `record_created_at` and `auth_check: SourceAuthCheck | null` (`src/features/referrals/queries.ts`); the frontend helper `hire-state.ts` can go;
   - `getAdminHireReport` returns `AdminHireReportDetail` and `getAdminAuthorizationChecks` returns `AdminAuthorizationChecks` (`src/features/admin/queries.ts`);
   - `AdminHireReportRow` adds `deadline_business_days_left`;
   - `HireReportView` adds `fee_details_due_at`.

## 28. Tests (v2.1)

- QA's `tests/integration/n3-qa.test.ts`: the 5 repros (QA-N3-01 ×3, QA-N3-02, QA-N3-05) now pass. The helpers normalise `{error}` results back to the error object (`asError`). The generic-refusal test clears the per-user window between its many attempts, because refused attempts now count.
- `tests/integration/n3-hire-reports.test.ts` (+4): the `report_confirmed` origin, the `hire_already_recorded` placement id, admin business days left, and the HA-1 query (2 hires vs 1).
