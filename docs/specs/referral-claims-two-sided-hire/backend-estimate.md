# Backend estimate: Referral-level claims and two-sided hire reporting (N3)

Owner: Backend Engineer · Date: 2026-11-16 · Step 3b of the brief's team plan. This is read-only: no N3 migration is written, because `spec.md` doesn't exist yet.
Inputs: `brief.md` rev. 1 (approved 2026-11-16, PD-071: U-N3-1 = (a) no surcharge; `deemed_agreement_enabled` off in production; PD-069 bar and cut list), `recruiting-input.md`, PD-059, PD-064, PD-067, PD-070. Code: working tree as of 2026-11-16, including N2 through `20261116000900`.

---

## 0. Summary

| | |
|---|---|
| **Must, before buffer** | **21.0 days** (drop 1: 9.5, drop 2: 11.5). Range 19 to 24 |
| **Fix-loop buffer (15%, PD-059)** | 3.15 |
| **Must total** | **~24.2 days** (range ~22 to 27.5) |
| **Money-bounds line (PD-059)** | 0.5, included above (§6) |
| **Must 0b (N2 leftovers, PD-072)** | **Done 2026-11-16** in this session (actual ~0.5 d; the 0.75 d budget sits outside the bar). See `job-terms-card/backend.md` v2.5 |
| **Shoulds** (BR-16, BR-39, employer signal) | 1.25 d, excluded (PD-069 cut 1) |
| **Against the 18-day bar (PD-069)** | **Over by 3.0 days.** The PD-069 cut list (2) to (4) saves 0.85, leaving **20.15 before buffer, ~23.2 with it**. That's still over the bar and at the top of the user-accepted range (~18–23). **PM decision needed** (§10.1). |

Why this is 3.25 days above the PM's 17.75 (brief §9.1 without Must 0b), block by block:

| PM block | PM | Here | Δ |
|---|---|---|---|
| Prerequisites (BR-1, BR-2) | 1.5 | 1.25 | −0.25 |
| B's record path, incl. eligibility (1.0) and the R-10 status-reader audit (0.75), neither priced separately | 3.0 | 5.0 | +2.0 |
| Fee-pending (placement nullability ripple, R-A) | 1.5 | 1.75 | +0.25 |
| Release, block, HA-9, ownership line | 0.75 | 0.75 | 0 |
| Hire reports, incl. generalizing the N1 evidence pipeline (1.0) | 3.0 | 3.5 | +0.5 |
| Answer, silence gate, reopen | 2.5 | 3.0 | +0.5 |
| Admin | 2.0 | 1.75 | −0.25 |
| RD-029 | 1.25 | 1.5 | +0.25 |
| Flags and metrics | 0.75 | 0.75 | 0 |
| Notifications, audit, api-surface, docs (+ `backend.md` v1) | 1.0 | 1.25 | +0.25 |
| Money-bounds line | 0.5 | 0.5 | 0 |
| **Total** | **17.75** | **21.0** | **+3.25** |

**Top risks** (§8): the placement nullability ripple (R-A), the status-machine change (R-B), record-scope copies (R-C, PD-064), the N7 delivery contract shape (R-D), and the holiday calendar horizon (R-E).

---

## 1. Code facts that shape the design (checked 2026-11-16)

| # | Fact | Where | Consequence |
|---|---|---|---|
| F1 | `report_hire` requires `status = 'offer'`, an `active` agreement, and target-side record scope (`app.sees_referral_as_target`). It takes `p_terms_version` (`hire_terms_changed`), bounds base, bonus and I, and writes `placements` + `referral_status_events` (`from_status` hard-coded `'offer'`). | `20261116000600_terms_fee_bounds.sql` (live body) | It's extended rather than forked: drop and recreate with new optional args (no overload), keeping the happy path byte-identical (BR-7). `from_status` becomes `r.status` |
| F2 | `placements`: `referral_id UNIQUE`, `agreement_id NOT NULL`, `contracted_fee_minor NOT NULL > 0`, `start_date NOT NULL`. Placement statuses: `hire_reported … cancelled`. | `20261107000500_finance.sql` | Fee-pending (BR-31) needs a new status and three nullable columns with a status-tied check. A record-only hire (BR-11, flag off) is **not** a placement, so it gets its own table |
| F3 | No user-facing path sets a placement to `cancelled`. `app.placement_transition` is internal. | finance | HE-3's "existing fall-off flow" doesn't exist for placements → Q-PM-4 |
| F4 | `collaboration_agreements`: one per referral (`UNIQUE`), `status pending_source / active / terminated`; `app.guard_agreement_update` freezes the snapshot columns. | `20261107000500`, `20261116000100` | A deemed agreement inserts a row (or activates the pending one) with a new `origin` column. The guard trigger must allow `pending_source → active` with `origin = 'deemed'` only from inside the RPC |
| F5 | `disputes.kind in ('placement','prior_presentation')`, `disputes_target` check, `disputes_one_open_referral` partial unique index, `outcome in ('claim_upheld','claim_rejected')`. | `20261113000300:331` | Add the kind `hire_report` (target = referral + report), outcomes `hire_upheld / hire_rejected / hire_void`. "One open dispute per referral" holds for free |
| F6 | `app.presentation_counts` = delivered ∧ `ownership_protected_until > now()` ∧ ¬`already_presented` ∧ `void_reason is null` ∧ no upheld/final claim. | `20261113000300:405` | BR-4 is a **different** predicate (in-progress never expires; + 9 months tail; released → record-only). New `app.hire_eligibility(referral)`. `presentation_counts` stays unchanged (S-N3-1 default) |
| F7 | `app.referral_presentations.void_reason in ('released','prior_presentation_upheld','already_presented')`; client key at delivery; release flag source-only. Commit key in `app.referral_commit_keys` (N2). | `20261113000300:203`, `20261116000100:116` | BR-37 adds `void_reason = 'authorization_void'`. BR-3/BR-21 use `{commit_key, delivery_key}`, with nulls ignored |
| F8 | `record_candidate_request_delivery` is granted to `authenticated` and called with the **user** client from `candidate-request.ts:51/56/70`. Its live body is the record-scope copy. | `20261111000200:680`, `20261115000300:1042` | BR-2: revoke from `authenticated`, call it through the service-role client right after the email send (new allowed service-role use → `architecture.md`), or fold it into `issue_candidate_request_token` |
| F9 | Record-scope copies (`20261115000300`, never edited): `withdraw_referral`, `release_referral`, `transition_referral`, `open_dispute`, `record_candidate_request_delivery`, `get_referral_presentation`, `assert_referable`, the `app.sees_*` and `app.notify_*` helpers. `resolve_dispute` (`20261113000600`) and `presentation_admin_metrics` (`20261116000200`) aren't copied there. | grep | PD-064: each N3 change starts from the **live** body (`pg_get_functiondef` after `db:reset`), not from a file guess (§7) |
| F10 | Maintenance: the worker calls `runPresentationMaintenance` every 10 min (service-role RPCs `finalize_due_claims`, purges). | `src/server/queue/worker.ts:57` | N3 clocks (reminders day 5/8, silence, fee details overdue, decision overdue, RD-029 5-day) go into one new service-role RPC `run_hire_report_maintenance()`, called from the same loop |
| F11 | `app.add_business_days` raises `holiday_calendar_exhausted` past the seeded years (seeded through **2029**). | `20261113001100:367` | A B-entered start date in 2030 makes `invoice_due_at` raise. It must be mapped (bounded start date, §6) → R-E |
| F12 | `app.job_partner_visible` / `app.job_hidden_reason` centralise the partner predicate (N2). `app.client_key()` returns NULL for placeholders. | `20261116000100/0200` | BR-1 is one new hidden reason plus a refusal in `save_job_terms`, not a hunt across surfaces |
| F13 | `consume_rate_limit` is per user, fixed window. | foundation | BR-20's per-org "3 pending, 10 per rolling 90 days" is a count query in the filing RPC, not the rate-limit table |
| F14 | N1 claim evidence: `app.referral_claim_files` is keyed on `target_org_id` + `claim_id`; register/list/remove/authorize RPCs and the scan worker are claim-specific. | `20261113000300:285`, `claim-evidence.ts` | Generalize to an `owner_kind` (`claim` / `hire_report` / `hire_contest` / `authorization_check`) + `owner_id` + `uploader_org_id` rather than three copies. Same bucket, scan, SHA-256 and 60 s URLs |

---

## 2. Schema plan per BR

New closed tables live in `app` (no grants beyond `postgres`) unless a member must read rows through RLS. Every new public table has RLS on, explicit policies, `anon` nothing, `authenticated` SELECT only where a policy uses it, and writes only through RPCs.

| BR | Schema |
|---|---|
| BR-1 | No table. `app.job_hidden_reason` gains `no_client_name` (external referrals only; internal exempt). `save_job_terms` refuses opening without a key (`client_name_required`). |
| BR-2 | Grant change only: `revoke execute on record_candidate_request_delivery from authenticated`. |
| BR-3, BR-8 | `public.hire_records` (one per referral, the "first valid record", BR-22): `referral_id UNIQUE`, `kind` (`placement` · `record_only_released` · `record_only_no_agreement`), `placement_id` (nullable FK), `recorded_by`, `recorded_by_side` (`target` / `report_confirmed` / `report_deemed` / `report_upheld`), `offer_accepted_on date null`, `start_date date null`, `hired_job_id uuid null` (B's job at the same client), `hired_role_title text null ≤ 120`, `related_org_hire boolean`, `late boolean` (admin-only column, see RLS), `prior_status referral_status`, `created_at`. RLS: target side (record scope) and admins see everything. The source side sees the row through a view/RPC without `late`, and without `hired_job_id` / title when the hiring side kept them private (spec). |
| BR-4 | Function `app.hire_eligibility(p_referral) returns text` (`eligible` · `record_only` · reason code), STABLE SECURITY DEFINER. Window end = `ownership_protected_until`; legacy = `delivered_at + 12 months`. The two tail constants live in `app.hire_report_constants()` (BR-6 says single constants). |
| BR-9 | `app.platform_settings (key text primary key, value jsonb, updated_at, updated_by)` with an audit trigger, no grants, written only by the service role or an operator. Row `deemed_agreement_enabled = false` by default (§10 Q-PM-1 on "on in local/test"). `collaboration_agreements.origin text not null default 'confirmed' check (origin in ('confirmed','deemed'))`, plus `deemed_at`. |
| BR-13 | `hire_records.late` computed at insert. |
| BR-14 | `placements.invoice_due_at timestamptz null` (set when `start_date` is known). |
| BR-15 | The `placements.fee_difference_reason` check, the Zod enum and the TS type gain `non_permanent_engagement`. |
| BR-12 | `hire_records.related_org_hire` plus an admin-only computed `related_org_verified` (does a shared active member exist; uses N1's related-org helper). |
| BR-17 to BR-20 | `public.hire_reports`: `referral_id`, `source_org_id`, `target_org_id`, `filed_by`, `status` (`pending` · `contested` · `confirmed` · `closed_by_record` · `deemed` · `upheld` · `rejected` · `void` · `admin_queue`), `employer_text ≤ 200`, `start_month date` (first of month), `role_text ≤ 120`, `learned_via` enum, `statement 20–2000`, `tail_statement boolean` (+6 to +9 months), `answer_due_at`, `rebuttal_due_at`, `decision_due_at`, `restarted_at` (once), `resolved_at`, `outcome_visible_to_source` (`not_upheld` / `not_this_client`), `attested_at`. Partial unique `(referral_id) where status in pending states`. `public.hire_report_evidence` (type enum, `item_date ≤ today`, `captured_on`, `url https:` admin-only column, `side` source/target, `report_id`). `employer_text` and URL columns are revoked column-wise from `authenticated` and served through RPCs (BR-19). |
| BR-21 | No table: `release_referral` / `withdraw_referral(p_release)` check for a pending report at the same hiring org whose key set intersects. |
| BR-23 to BR-27 | `disputes.kind` + `hire_report`, `disputes.hire_report_id`, new outcomes; contest payload on `hire_reports` (`contest_reason` enum, `contest_statement`, `offer_accepted_on`, `process_started_on`). Admin fields: `disputes.candidate_contacts smallint default 0`, `disputes.client_confirmation text check (in ('requested','provided','refused'))`. |
| BR-29, BR-30 | **N7 data contract** (PD-070), table `app.email_deliveries`: `id`, `notification_kind text`, `entity_type text`, `entity_id uuid`, `recipient_user_id uuid`, `provider_message_id text`, `status text check (in ('queued','sent','delivered','bounced','complained','failed'))`, `status_at timestamptz`, `created_at`. Unique `(provider_message_id, status)`. Service-role writes only, no grants. **Gate:** for `hire_report.filed` on the report, there's a delivered row with no bounced/complained/failed row for (a) the job owner **and** (b) at least one other distinct active `org_admin` / `recruiter_manager` of B at filing time. N3 creates the table empty; QA seeds it by service role; N7 fills it. `hire_reports.deemed_at` and `reopened_at`. |
| BR-31 | `placement_status` + `fee_pending`; `placements.contracted_fee_minor`, `start_date` and `agreement_id`(*) nullable with the check `(status = 'fee_pending') = (contracted_fee_minor is null)`, and `start_date` non-null unless fee-pending; `fee_details_due_at`, `fee_details_entered_at`; `placements.estimate_minor` copied from `referrals.fee_estimate_minor` for display. (*) `agreement_id` stays NOT NULL if a deemed or confirmed agreement always exists for a placement (it does under BR-10), so only two columns change. |
| BR-34 | No table: `release_referral` accepts `declined` / `rejected` with the N1 guards plus no placement and no pending report (BR-21). |
| BR-35 | No table: `get_referral_terms_context` (or the referral page query) returns `protected_until` and `in_progress`. The release flag is never returned to B. |
| BR-36, BR-40 | Flags computed in `presentation_admin_metrics` / a new `hire_report_admin_flags()` (admin-only), no table. |
| BR-37 | `app.authorization_checks` (`referral_id`, `requested_by_kind` (`stopped_submitter` / `candidate` / `hiring_side_dispute`), `evidence_due_at`, `status`, `decided_by`, `decision`, `note`); `void_reason` + `authorization_void`; `candidate_consents.disputed_at`. Files through the generalized pipeline (F14). |
| BR-38 | No table: the consent-evidence RPC adds `candidate_created_at` when it's ≤ 30 days before token issuance (source side and admins only). |

---

## 3. RPC plan per BR (all SECURITY DEFINER, `search_path = ''`, membership and side re-checked, on the api-surface allow-list unless marked service-role)

| BR | RPC / function | Notes |
|---|---|---|
| BR-1 | `save_job_terms` (re-copy, live body `20261116000600`) | `client_name_required` when opening without a key; `get_jobs_terms_state` returns `no_client_name` |
| BR-2 | (grant) + `issue_candidate_request_token` or service-role call | N9 suite re-run |
| BR-3, BR-4, BR-7 to BR-15 | **`report_hire` v3** (drop + recreate; old signature gone). New optional args: `p_offer_accepted_on`, `p_hired_job`, `p_hired_role_title`, `p_related_org_hire`, `p_report` (when confirming, BR-24) | Order: side → version → `hire_eligibility` (generic `hire_not_eligible`) → existing placement/record (`hire_already_recorded`) → released → record-only; no confirmed agreement → flag on: deemed agreement, flag off: record-only → `hire_terms_changed` (R-8) → N2 money checks → insert `hire_records` (+ `placements`) → close a pending report as `closed_by_record` (BR-22) → notifications. Keeps the `offer` + `active` path identical |
| BR-31 | `complete_fee_details(p_placement, p_expected_version, p_terms_version, p_start_date, p_base, p_bonus, p_invoiced, p_reason, p_note)` | Same N2 money bounds and reasons; sets `invoice_due_at`; refuses if not `fee_pending` |
| BR-31 | `record_invoice`, `record_payment_evidence`, `review_payment_evidence`, `open_dispute` (re-copies) | Refuse on `fee_pending` (`fee_details_pending`); live bodies via `pg_get_functiondef` |
| BR-34, BR-21 | `release_referral`, `withdraw_referral` (re-copies from record-scope bodies) | `declined` / `rejected`; refuse with a placement or a pending report at that client (generic `release_not_allowed`) |
| BR-6, BR-17 to BR-20, BR-22 | `file_hire_report(p_referral, p_acting_org, p_payload jsonb, p_evidence jsonb, p_file_ids uuid[], p_idempotency_key)`; `get_hire_report(p_report)` (side-shaped view); `list_hire_reports(p_org)` | Every refusal = `hire_report_unavailable` except `rate_limited` and `hire_already_recorded`. Files must be clean and hashed. Returns `file_until` for A |
| F14 | `register_evidence_file`, `list_evidence_files`, `remove_evidence_file`, `authorize_evidence_file` (generalized; claim RPC names kept as thin wrappers so N1 doesn't change) | Admin-only download for hire-report and contest files |
| BR-24 | Through `report_hire(p_report)` | |
| BR-25 | `contest_hire_report(p_report, p_reason, p_statement, p_offer_accepted_on, p_process_started_on, p_evidence, p_file_ids)` | Opens the `hire_report` dispute; one open per referral |
| BR-26 | `rebut_hire_report(p_report, p_statement, p_evidence, p_file_ids)` | Once, before `rebuttal_due_at` |
| BR-27, BR-28 | `admin_decide_hire_report(p_report, p_outcome, p_resolution, p_finding_not_this_client)`, `admin_get_hire_report(p_report)`, `admin_set_hire_dispute_fields(...)`, `admin_restart_answer_clock(p_report, p_note)` (cut item 2), `compare_dispute_contacts` (kind check extended) | Upheld → BR-9/BR-10 placement path in fee-pending |
| BR-29, BR-30 | `run_hire_report_maintenance()` (**service-role only**): reminders, silence branch (deemed vs admin queue), overdue flags, RD-029 expiry. `admin_reopen_deemed(p_report, p_reason)` | Deemed only through the delivery gate; suspended B → admin queue (BR-44) |
| BR-37, BR-38 | `admin_open_authorization_check`, `submit_authorization_evidence` (source side), `admin_decide_authorization_check`; consent-evidence read extended | Void: `void_reason`, consent disputed, flag, and a pending report fails (HE-12) |
| BR-40, BR-41 | `presentation_admin_metrics` re-copy (+ hire-report counts) and `hire_report_admin_flags()` | Admin only |
| BR-42 | Notification kinds (English in SQL, PD-026): `hire_report.filed`, `.reminder`, `.contested`, `.rebutted`, `.decided`, `.deemed`, `.closed_by_record`, `placement.deemed_agreement`, `hire.record_only`, `placement.fee_details_overdue`, `authorization_check.requested/decided` | Audit metadata: ids and enums only |

**Server Actions** (`src/features/hires/{schemas,actions,queries,domain}.ts`, new domain): `recordHire`, `completeFeeDetails`, `fileHireReport`, `contestHireReport`, `rebutHireReport`, plus `src/features/admin/actions.ts` for the decide, reopen, restart, fields and authorization actions. Each runs in `guard()`, takes the tenant from `getRequestContext`, uses Zod (the same schema as the form), and rate-limits the sensitive ones (`hire.report` using the N1 disputes bucket 5/h, `hire.record` 30/h, `admin.hire` 60/h).

---

## 4. Job plan (worker)

- `run_hire_report_maintenance()` joins `runPresentationMaintenance` on the 10-minute loop. It's idempotent, so each step uses `… where reminded_d5_at is null` style markers.
  1. Reminders at business days 5 and 8 (in-app now; N7 emails later).
  2. At `answer_due_at`: the delivery gate → `deemed` (placement in fee-pending via BR-10, honouring the flag) or `admin_queue`. A suspended B always goes to `admin_queue`.
  3. `fee_details_due_at` passed → admin task "rule 6.4 notice due".
  4. `decision_due_at` passed → overdue flag.
  5. `evidence_due_at` passed on an authorization check → admin task (the admin voids; no automatic void, BR-37 says the admin decides "no answer = invalid", so it's flagged for one click).
  6. An invoice not recorded by `invoice_due_at` → the "Invoice overdue" display is computed at read time (no job).
- No new queue job kinds. The evidence scan reuses `claim_evidence.scan` once generalized (F14).

---

## 5. Referral-status readers touched (R-10)

Statuses `submitted … offer`, `declined`, `withdrawn`, `rejected` and `cancelled` can now go to `hired` through `report_hire` v3 only. `transition_referral` keeps refusing those moves, and the RPC writes `referral_status_events (from = prior status)`. Readers to check and adjust:

| Reader | Change |
|---|---|
| `src/features/pipeline/stages.ts`, `queries.ts`, `pipeline-board.tsx` | The `hired` column can hold cards that were never `accepted`. Readers assume `offer → hired`; checked, and the frontend decides display |
| `src/features/overview/data.ts:25/128` | The hired count now includes non-offer hires (metric "self-recorded on non-`offer`", BR-4 metrics) |
| `src/features/referrals/review.ts`, `candidates/queries.ts`, `jobs/[jobId]/page.tsx`, `referrals/[referralId]/page.tsx`, `opportunities/page.tsx` | Status-filter lists include `hired` from any prior status; no logic assumes an agreement exists for `hired` (a record-only hire has none) |
| `app.presentation_counts`, `presentation_check`, `submission_gate` | Unchanged. `hired` inside the window counts as today; after the window, a hired referral stops counting for duplicates (S-N3-1 default) |
| SLA release sweep, `finalize_due_claims`, `decline_pending_for_job` | Must skip `hired` (already do via status lists; verified per body at build) |
| `get_sent_referral_jobs`, `get_referral_presentation`, `get_referral_terms_context` | Return `hired` + `hire_record.kind` so A sees "a hire was recorded" (BR-11) |
| Commissions domain (`summarizeForOrg`, `projectedSplit`, `allocate.ts`) | `fee_pending` and null fee → no projection, an estimate label only |

---

## 6. Money-bounds line (PD-059, BR-32): 0.5 d

Checklist, enforced at the RPC **and** by a table check, with the N2 bounds:
- `report_hire` v3 and `complete_fee_details`: base, bonus ≤ 10^12; I in `[ceil(C/100), 100·C]` and ≤ 10^12 (numeric comparison); legacy fee ≤ 10^12.
- `placements.estimate_minor` copied from `fee_estimate_minor` (already in (0, 10^12] or null); a display estimate computed at read time fails closed per row (`app.estimate_share_safe`).
- Dates as money-adjacent bounds: `start_date` and `offer_accepted_on` within [delivery − 1 year, today + 18 months] so `add_business_days` never hits an unseeded year (F11) → `hire_dates_invalid`.
- No new money inputs in hire reports (A never enters amounts; rule 7.5).
- Tests: direct RPC calls with 9×10^18, 10^12 + 1, 0, negative → mapped codes; check constraints with service-role inserts.

---

## 7. Record-scope rule (PD-064)

Functions N3 redefines that have copies in `20261115000300_recruiter_record_scope.sql`: `withdraw_referral`, `release_referral`, `open_dispute`, `record_candidate_request_delivery` (grant only, body untouched if possible), and possibly `get_referral_presentation`. `report_hire`'s record-scope copy has the pre-N2 signature, which N2 already dropped, so N3 copies from `20261116000600`.

Procedure: after `npm run db:reset`, take each live body with `select pg_get_functiondef('public.fn(...)'::regprocedure)`, apply the N3 edits marked `-- N3` with a script that asserts each edit applies once, and add them in new migrations after `20261116000900`. Check the record-scope md5 (`dcd27209…`) before every reset and at push. Re-run `recruiter-record-scope.test.ts` plus the N1, N2 and N9 suites on each drop.

---

## 8. Risks

| # | Risk | Mitigation |
|---|---|---|
| R-A | **Placement nullability ripple.** `contracted_fee_minor` and `start_date` nullable reach `record_invoice`, `record_payment_evidence`, `review_payment_evidence`, `allocate_placement` callers, `open_dispute`, the commissions TS domain and the generated types (`number` → `number \| null`) | A status-tied check constraint; every finance RPC refuses `fee_pending` first; TS readers narrowed by status; a grep-based test that no finance RPC lacks the guard |
| R-B | **Status machine.** Terminal statuses becoming `hired` breaks assumptions (pipeline, metrics, N1) | Only `report_hire` v3 can do it; `transition_referral` unchanged; §5 reader list; QA regression |
| R-C | **Record-scope copies override N3** (PD-064, brief R-7) | §7 procedure, md5 at each reset |
| R-D | **The N7 delivery contract doesn't match the provider's events.** Brief R-6: no bounces → deemed never runs | The table shape (§2) is minimal and provider-neutral; N7 maps webhooks into it. Until then the gate is false and every unanswered report goes to the admin queue (safe default) |
| R-E | **Holiday calendar horizon** (seeded through 2029): any clock landing in 2030+ raises | Date bounds (§6); clean mapping of `holiday_calendar_exhausted` → generic error; seeding 2030 is an Ops item before 2029 |
| R-F | **Fishing through the filing RPC** (R-2): timing or error differences leak whether a client key matches | All eligibility refusals share one code and run the same queries; no early return on a key mismatch; the per-org count limits |
| R-G | **Deemed agreement races a late B acceptance** | Both paths lock the referral row `for update`; the agreement is unique per referral |
| R-H | **Evidence pipeline generalization regresses N1** | Thin wrappers keep the N1 RPC names and shapes; N1 suite + E2E re-run |
| R-I | **Amendment race on new record paths** (brief R-8) | `p_terms_version` on `report_hire` v3 and `complete_fee_details` (`hire_terms_changed`) |
| R-J | **The deemed flag is enabled by mistake** | Closed table, no member or app-session write, audit trigger, defaults false in every environment (Q-PM-1) |

---

## 9. Tests (inside each item's days)

- Integration per drop: tenant isolation and IDOR on every new RPC (other org → not-found shape, anon refused), permission per role (owner, manager, recruiter, other org, platform admin), the BR-4 eligibility matrix by status, both flag branches, the delivery-gate matrix with seeded rows, money bounds, release block across keys, generic refusal identity, maintenance idempotency.
- Unit: the eligibility/tail date math (TS mirror for display), the late marker, the generalized evidence schemas.
- api-surface allow-list: every new public RPC listed deliberately; `run_hire_report_maintenance` stays service-role only.
- Regression: N1, N2 (incl. `terms-amend-*`), N9, record scope, Journey A.

---

## 10. Effort (backend days, tests included per item)

### Drop 1 (brief step 6a), 9.5 d

| Item | BR | Days |
|---|---|---|
| Client-name gate: hidden reason, publish refusal, nudge data, connector/API path, tests | BR-1 | 0.75 |
| Server-only delivery recording: grant, service-role call, `architecture.md`, N9 re-run | BR-2 | 0.5 |
| Governing referral and `app.hire_eligibility` (windows, legacy, released, tail constants) | BR-3, BR-4, (BR-6 constants) | 1.0 |
| Referral-status reader audit and adjustments | R-10 | 0.75 |
| `report_hire` v3: any status, `hire_records`, deemed agreement + `platform_settings` flag + audit, record-only (released / flag off), other role, sister org, late marker, invoice clock, `non_permanent_engagement`, notifications, Zod/action | BR-7 to BR-15 | 3.25 |
| Fee-pending placements: status, nullable columns and checks, `complete_fee_details`, finance-RPC guards, TS domain, `fee_details_due_at`, admin task | BR-31 | 1.75 |
| **Money-bounds line** | BR-32 | 0.5 |
| Release from declined/rejected (+ block hook used in drop 2), HA-9 data, ownership-line data | BR-34 to BR-36 | 0.75 |
| `backend.md` v1, api-surface | — | 0.25 |
| **Drop 1 subtotal** | | **9.5** |

### Drop 2 (brief step 6b), 11.5 d

| Item | BR | Days |
|---|---|---|
| Hire reports: tables, `file_hire_report` (eligibility, tail +6/+9 with statement, generic refusal, per-org limits, second-report rule, competing records), side-shaped reads, release-block activation | BR-6, BR-17 to BR-22 | 2.5 |
| Evidence pipeline generalization (A's report, B's contest, RD-029 files; N1 wrappers) | BR-18, BR-25, BR-37 | 1.0 |
| Answer: confirm via v3, contest + `hire_report` dispute, rebuttal, stored clocks, reminders, silence gate + `app.email_deliveries` contract, restart once, reopen, suspended party | BR-23 to BR-30, BR-44 | 3.0 |
| Admin: decide (3 outcomes), admin view (both client names, files, notes), dispute fields, same-person extension, overdue flag, queue listing | BR-27, BR-28 | 1.75 |
| Authorization check and void; record-created note | BR-37, BR-38 | 1.5 |
| Flags (HA-1, HA-6, HA-9, late, overdue) and metrics | BR-40, BR-41 | 0.75 |
| Notifications (≈ 13 kinds), audit discipline, privacy, `backend.md` v2, `domain-model.md`, `security-and-privacy.md`, `architecture.md`, `product-flows.md` | BR-42, BR-43 | 1.0 |
| **Drop 2 subtotal** | | **11.5** |

| | Days |
|---|---|
| **Must before buffer** | **21.0** |
| **Fix-loop buffer 15%** | 3.15 |
| **Must total** | **~24.2** (range ~22 to 27.5) |
| Must 0b (N2 leftovers) | done, ~0.5 actual, outside the bar |
| Shoulds: BR-16 nudge 0.25, BR-39 destination 0.5, employer signal 0.5 | 1.25, excluded |

### 10.1 Against the PD-069 bar (18 d before buffer)

| PD-069 cut | Saves | Running total |
|---|---|---|
| (1) Shoulds | already excluded | 21.0 |
| (2) "Restart the answer clock once" → admin decides on the record only | 0.25 | 20.75 |
| (3) HA-1 and HA-9 flags → Ops SQL | 0.35 | 20.4 |
| (4) Sister-org tick → admin note | 0.25 | **20.15** (~23.2 with buffer) |

That's still **2.15 days over the bar** after the whole cut list. Options for the PM (none touches a "never cut" item):
- **(a) Accept ~20.15 before buffer** (~23.2 total). That's the top edge of the user-accepted ~18–23, so tell the user.
- **(b) Defer BR-30 reopen to N7** (it can't be reached until N7 writes delivery rows; the data gate itself stays): −0.5.
- **(c) Metrics counts to Ops SQL** like the flags in cut (3), keeping HA-6 and the overdue flags in the queue: −0.4.
- **(d) Keep the `app.email_deliveries` table and the gate (never cut), but move the positive "deemed" branch and its seeded-delivery tests to N7.** Before N7 the gate is always false anyway: −0.5. This conflicts with brief §10 DoD ("deemed branch tested with seeded delivery records"), so the PM would have to change it.
- (b)+(c)+(d) → **18.75** before buffer (~21.6 total), about 0.75 over the bar. I don't see further honest cuts without touching a never-cut rule.

My recommendation: **(a) or (a)+(b)**. Dropping the deemed branch (d) saves little and moves risk into N7.

---

## 11. Ambiguities for the PM (default in bold; none blocks the spec)

1. **Q-PM-1 (BR-9, flag default).** "On in local and test, off in production": a migration can't tell environments apart, and the repo has no `seed.sql`. **Default: false in every environment. Tests turn it on per case through the service role; a local script (`npm run db:flag:deemed`) turns it on for dev.** The alternative is a seed file that `db:reset` applies. It's safe either way, but "on in local" needs a decision.
2. **Q-PM-2 (BR-7/BR-11, status of a record-only hire).** Does a record-only hire (released, or flag off) move the referral to `hired`? BR-7 says "the referral moves to hired". BR-11 is silent. **Default: yes, `hired`, with `hire_records.kind` telling the split story.** This affects pipeline, metrics and N1 counts.
3. **Q-PM-3 (BR-4 legacy, no `delivered_at`).** Pre-N1 referrals may have no `delivered_at`, and BR-4 requires "delivered". **Default: legacy referrals use `submitted_at` as delivery for eligibility only (12 + 9 months).** Otherwise legacy hires can't be recorded at all.
4. **Q-PM-4 (HE-3 / BR-44, fall-off).** No placement fall-off/cancel flow exists (F3), and `placements.referral_id` is UNIQUE. "A later start can be recorded again" needs either a cancel path plus a partial unique index, or reusing the cancelled placement. **Default: out of N3. An admin cancels through a support path; re-recording after a fall-off is a follow-up.** Otherwise +0.75 d.
5. **Q-PM-5 (BR-30, "Workatent's own logs show the notice failed").** A deemed confirmation needs delivered and no-bounce rows. Late failure could only come from a later bounce or complaint event, or from an admin-attested platform incident. **Default: reopen is allowed when a bounced/complained/failed row for that notice arrives after `deemed_at`, or when the admin records an incident reference.** Free-text "logs" isn't enforceable.
6. **Q-PM-6 (BR-13, late marker on confirm).** Is a hire confirmed from A's report (BR-24) or completed after an upheld report also checked for `late`? **Default: yes for B's confirm (it's B's record), no for deemed or upheld (B didn't record).**
7. **Q-PM-7 (BR-14, invoice clock on fee-pending placements).** Without a start date there's no `invoice_due_at`. **Default: set when the fee details (with start date) are entered.**
8. **Q-PM-8 (BR-12, sister org).** Does the server verify the relation? **Default: no block. The tick is stored and admins see a computed `related_org_verified` (shared active member).** If cut (4) applies, this becomes the admin note.
9. **Q-PM-9 (BR-21, keys of the other referrals).** Is "client key matches either key of the reported referral" compared against the other referrals' commit **and** delivery keys? **Default: union on both sides.**
10. **Q-PM-10 (BR-31, legacy fee-pending).** An upheld report on a legacy referral has no snapshot currency. **Default: B enters currency + fee (legacy free entry, N2 BR-26) in `complete_fee_details`; no estimate is shown.**
11. **Q-PM-11 (BR-17 "members who may withdraw").** **Default: record scope (RD-036): candidate owner or manager of A, as `withdraw_referral` checks today.**
12. **Q-PM-12 (Must 0b wording).** The brief says the form "reloads with the new currency" on a stale refusal. Backend refuses with `errors.stale_version` ("This record changed in the meantime. Refresh and try again.") and nothing is written. The admin form doesn't call `router.refresh()` by itself yet. **Default: frontend adds a refresh on that error (one line) in N3 drop 1 frontend, or the copy stands.**
