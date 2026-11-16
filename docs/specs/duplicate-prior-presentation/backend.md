# Backend: duplicate and prior-presentation protection (N1)

Owner: Backend Engineer · 2026-11-12 · Inputs: `brief.md` rev. 4.1 (BR-1 to BR-34, EC-1 to EC-8, appendix A), `spec.md`, PD-012 to PD-028, `backend-estimate.md`.
Status: implemented and applied **locally only** (`npm run db:reset` + `npm run db:types`). Not pushed to the hosted project.

This is the contract the frontend builds on. Every action runs inside `guard()`, resolves the tenant from the session (`getRequestContext(orgSlug)`), passes `ctx.organizationId` as the acting org, and re-validates every argument with Zod. Every RPC re-checks the caller's side and answers **`not_found`** to the other side or another org (no leak).

---

## 1. Migrations

| File | Contents |
|---|---|
| `20261113000100_already_presented_status.sql` | Enum value `referral_status.already_presented` (own file: a new enum value can't be used in its own transaction). |
| `20261113000200_business_days.sql` | `app.network_holidays` (closed), seed 2026–2028 (appendix A, verified, see §9), `app.is_business_day`, `app.add_business_days(timestamptz, n)`, `app.business_days_left(deadline, now)`. |
| `20261113000300_presentation_core.sql` | `referrals` columns, decline-reason check, `referral_status_events.actor_kind`, Vault key, normalisers, client key + trigger, closed tables (`app.*`), `disputes` columns, BR-4 counting rule, the check, the per-hiring-org lock, outcome recorder, backfills, `normalize_tags` grant fix (§10). |
| `20261113000400_presentation_submit.sql` | `hidden_from_target` + `already_presented`, `assert_referable`, `deliver_referral` (stamps delivery), **new** `submit_referral` / `submit_referral_for_candidate` (outcomes), `respond_candidate_request` (`already_sent` + re-check), `get_candidate_request` (`already_sent` state), `withdraw_referral`, `release_referral`, `review_referral` (no `duplicate`). |
| `20261113000500_prior_presentation_claims.sql` | `claim-evidence` bucket + insert policy, evidence RPCs, worker RPCs, `file_prior_presentation_claim`, picker, `get_referral_presentation`. |
| `20261113000600_referral_disputes.sql` | Disputes RLS by kind, anonymisation trigger, `resolve_dispute` (placement only), `contest_prior_presentation_claim`, `resolve_prior_presentation_dispute`, `get_referral_dispute`, `compare_dispute_contacts`. |
| `20261113000700_presentation_maintenance.sql` | `finalize_due_claims`, `purge_presentation_data`, `purge_orphan_claim_files`, `forget_claim_files`, `rotate_fingerprint_key`, `presentation_admin_metrics`, `presentation_abuse_flags`. |
| `20261113001100_qa_round2.sql` | QA round 2: nothing raises after the check in the submit RPCs, storage upload limit counted by a trigger, stable error codes, 2029 holidays, `open_dispute` enforces the disputes bucket. See §13. |
| `20261113001000_pm_decisions.sql` | PM decisions on the held items (rev. 4.2): evidence judged at the claimed referral's delivery (PD-029), expired candidate links not pending (PD-032), `get_stop_by_reference` admin lookup (m-5). See §12. |
| `20261113000900_qa_fixes.sql` | QA fixes: rate limits in the database (B-1), acknowledged pending hits logged (m-2), unregistered evidence objects purged (m-3), calendar guard (m-4), random support reference (m-5). See §11. |
| `20261113000800_presentation_contract_fixes.sql` | After the frontend build: defaults on `file_prior_presentation_claim` (`p_evidence_referral`, `p_prior_process_date`, `p_note` = null, `p_attested` = false, `p_acting_org` = null), `revoked` on picker options, `resolve_by_business_days_left` on the admin dispute view. |

### Data model

Columns on `public.referrals` (readable by both sides, nothing sensitive):

| Column | Meaning |
|---|---|
| `delivered_at` | Set only at delivery. **The only delivery test** (EC-2). Null for awaiting / never-delivered / `already_presented`. |
| `claim_deadline_at` | Frozen at delivery: `add_business_days(delivered_at, 5)` (BR-28). |
| `claim_rejected_at` | Set when an admin rejects a claim (BR-18). Shows the "claim rejected" chip/banners. |
| `review_clock_started_at` | Fresh review clock after a rejected claim (N4 reads it). |
| `decline_reason` | Check now allows `prior_presentation` (set by claims only) and keeps `duplicate` (legacy only). |

`referral_status_events.actor_kind` (`candidate` \| `system` \| `admin` \| null): **use it to pick the timeline actor.** `system` = "MissionHub" (`referrals.detail.systemActor`, the `already_presented` closure), `admin` = platform admin (claim rejected → back to `submitted`, `reason = 'claim_rejected'`; **needs a new key, proposed `referrals.detail.adminActor`, copy pending from the ux-writer**; no key was added), `candidate` = the confirmation page. Null = legacy rule (actor_side null meant the candidate).

`public.disputes`: `placement_id` now nullable; new `kind` (`placement` \| `prior_presentation`), `referral_id`, `claim_id`, `outcome` (`claim_upheld` \| `claim_rejected`). Reason length is now 5–4000 (was 10). RLS: placement disputes as before; `prior_presentation` disputes readable by **platform admins and the contesting org only** (the hiring side has no read path to the contest reason, PD-027).

Closed tables, all in the non-exposed `app` schema (PostgREST can't serve them), RLS on, no grants: `app.job_client_keys`, `app.referral_presentations` (client-key snapshot, `released_at`, `void_reason` ∈ `released` / `prior_presentation_upheld` / `already_presented`), `app.referral_fingerprints`, `app.sticky_stops`, `app.presentation_hits` (admin-only hit log incl. the PD-022 `earlier_internal` boolean), `app.referral_claims`, `app.referral_claim_files`, `app.network_holidays`, `app.country_calling_codes`, `app.presentation_config` (current key version).

### Backfills (in migration 3)

- `job_client_keys` for every job.
- `delivered_at` = `referral_shared_profiles.created_at`; `claim_deadline_at` = `add_business_days(delivered_at, 5)` (BR-28). Never-delivered referrals get neither.
- One `referral_presentations` row per referral; pre-N1 client-key snapshot = the job's key at migration time (PD-020).
- Fingerprints for counting and pending referrals from the candidates' **current** identifiers (BR-34).

---

## 2. Fingerprints, client key, counting rule

- **Key** (BR-33, PD-018): random 32 bytes generated into Vault as `presentation_fingerprint_key_v1` by the migration when absent; one per environment. No env var. Read only by `app.fingerprint_key()`.
- **Hash**: `HMAC-SHA256(key, '<kind>:<normalised>')`, kinds `email` / `phone` / `linkedin`, computed by `app.candidate_fingerprints(candidate)` from the **stored** candidate row. No RPC accepts hashes or identifiers.
- **Normalisers** (SQL only): email = trim + lowercase, plus-alias removed (Should item shipped); phone = E.164, exact for NANP (+1, country null treated as NANP), other countries via `app.country_calling_codes` with trunk-0 strip (approximate; a miss, never a false stop, R-13); LinkedIn = `linkedin.com/in/<slug>` lowercased.
- **Client key** (BR-23): trigger `jobs_client_key` on every job insert / `client_name` update (UI, connectors, `/api/v1/jobs`), whatever `client_confidential` says. Lowercase, accents stripped, `.`/`'` dropped (so `S.E.N.C.` → `senc`), other punctuation → space, trailing legal forms stripped (`inc incorporated ltd limited ltee corp corporation co llc llp lp senc enr sa sas gmbh plc`). Placeholders → no key: `confidential confidentiel(le) confidencial undisclosed stealth client cliente n/a na tbd - (empty)` and combos like "Client confidentiel". Snapshotted at delivery; a pending referral uses the job's current key.
- **Counts** (BR-4, `app.presentation_counts`): `delivered_at` set, `ownership_protected_until > now()`, status ≠ `already_presented`, `void_reason` null, and no claim that is `upheld` / `final` / `open` past its `contest_deadline_at` (**lazy finality**, EC-7). Any status otherwise, including withdrawn, cancelled, declined (any reason, legacy `duplicate` too), revoked sharing.
- **Pending** (BR-5): status `awaiting_candidate`.
- **Check** (`app.presentation_check`, under `pg_advisory_xact_lock` per hiring org, EC-3): order = identifier requirement → sticky stop (same candidate record × same job or same client key, 30 days) → hit on a counting referral (same job, or same hiring org + same client key; any sourcing org incl. the submitter's own and internal referrals, both directions, BR-31) → hit on a pending referral → clear. **Never across hiring orgs.**

---

## 3. Server Actions (`src/features/referrals/actions.ts`)

Permission column = `assertCan` permission. All three org roles hold both permissions today.

### `submitReferral(orgSlug, prevState, formData)` · `referrals:submit` · rate limit `referral.submit` 30/h, enforced **inside both submit RPCs** before any check (every attempt counts)

Same form fields as before, plus:

| Field | Type | Notes |
|---|---|---|
| `acknowledgePendingWarning` | `"true"` \| `"on"` \| absent | Second step of the pending warning (BR-7). Send the **same idempotency key** as step 1. |

Result type `ActionResult<SubmitOutcome>`:

| Outcome | How it arrives | Side effects |
|---|---|---|
| `created` | **redirect** to `/workspace/{org}/referrals/{id}?submitted=1` (recorded) or `?awaiting=1` / `?notSent=1` (candidate email), as before | referral created |
| `stopped` | `{ ok: true, data: { outcome: "stopped", reference: string, supportEmail: string \| null } }` | sticky stop + audit; **nothing else** (no referral, no consent, no email, nothing to the hiring side) |
| `pending_warning` | `{ ok: true, data: { outcome: "pending_warning" } }` | audit only |
| `identifier_required` | `{ ok: true, data: { outcome: "identifier_required" } }` | audit only |

- `stopped` has the **same shape** for job-level, client-level, own-org, other-org and sticky stops (AC-5). `reference` = **8 random digits**, unique, generated per stop (since `…0900`, m-5). It's stored on the admin-only hit row (`app.presentation_hits.reference`, linked to the stop's audit event) and in the platform-only `referral.fingerprint_hit` / `referral.sticky_stop` audit metadata, so admins can trace it. It carries no information and **differs per attempt** (QA: compare shape, not bytes, for this field). `supportEmail` = `SUPPORT_EMAIL` env var or `null` → hide the support line when null.
- The recorded path no longer inserts a consent first: the RPC records the new authorization itself **after** the check passes (a stop leaves nothing behind).
- Since `…1100` the RPC may also **return** (not raise) an error code in `outcome` for attempts that must stay counted: `invalid_token` (token hash already in use, refused before the check), or, for a race after the check, `conflict` / `failed` / a precondition code. The action maps any such outcome with `toActionError` (generic or `errors.<code>` message).
- Real failures stay errors (`ok: false`): rate limit (`errors.rateLimited`, from the RPC's `rate_limited`), `referrals.errors.opportunityGone`, `errors.candidate_not_active`, `errors.job_not_open_for_referrals`, `errors.sharing_authorization_missing`, `errors.duplicate_referral` (same candidate **record** already live on this job; kept as an error, outside BR-9 because it concerns the submitter's own referral, copy per copy-review P12), `errors.document_not_shareable`, `errors.candidate_email_missing`.

### `withdrawReferral(orgSlug, { referralId, reason, version, release? })` · `referrals:submit`

Zod: `referralId` uuid, `reason` 1–2000 (required, as today), `version` int > 0, `release` boolean (default false). Result `ActionResult<{ version: number }>`, message `referrals.success.withdrawnReleased`, or `referrals.success.withdrawn` with `{date}` = `ownership_protected_until` formatted in the user's locale, `America/Toronto`, `dateStyle: medium`. With `release: true` it withdraws and releases in **one transaction**; if the release guards fail, nothing happens and the error is `errors.release_not_allowed`. Errors: `errors.not_found` (hiring side / other org), `errors.stale_version`, `errors.invalid_transition`, `errors.reason_required`. Use this action for the withdraw dialog (S3). The existing `transitionReferral(... to: "withdrawn")` still works (no release).

### `releaseReferral(orgSlug, { referralId })` · `referrals:submit`

Release later, only on `withdrawn` or `cancelled`. Message `referrals.success.released`. Errors: `errors.release_not_allowed`, `errors.not_found`. Irreversible. No notification to the hiring side.

**Release guards** (both entry points, BR-25 / PD-021): delivered (`delivered_at` set) **and** still counts (BR-4) **and** no open dispute on the referral or on a placement from it. Never from `declined` / `rejected`, never while awaiting the candidate. Use `can_release` / `can_release_on_withdraw` from `getReferralPresentation` to show or hide the options (hidden, not disabled).

### Evidence files (hiring side) · `referrals:review`

| Action | Input | Result | Notes |
|---|---|---|---|
| `uploadClaimEvidence(orgSlug, referralId, prevState, formData)` | `file` (PDF / PNG / JPEG, ≤ 10 MB) | `ActionResult<ClaimEvidenceFile>` | One file per call, uploads immediately. Rate limit `referral.claim_upload` 30/h in the action (friendly message) **and** `storage.claim_evidence` 30/h counted by a trigger on the committed `storage.objects` insert (direct uploads; a refused upload reads `errors.claim_not_allowed`). Max 5 draft files per referral (`errors.claim_too_many_files`). Refused upload (not claimable / not ours) → `errors.claim_not_allowed`; deadline passed → `errors.claim_window_closed` with `{when}`. |
| `getClaimEvidenceFiles(orgSlug, referralId)` | — | `ActionResult<ClaimEvidenceFile[]>` | Draft files (not yet filed). **Poll every 2 s while any is `pending`.** |
| `removeClaimEvidence(orgSlug, { fileId })` | uuid | `ActionResult` (message `referrals.success.evidenceRemoved`) | Draft files only; deletes the object. |
| `getClaimEvidenceUrl(orgSlug, fileId)` | uuid | `ActionResult<{ url }>` | 60-second signed URL, claiming org only, clean files only, audited (`claim_evidence.accessed`). Rate limit `document.url`. Sourcing side → `errors.not_found`. |

```ts
type ClaimEvidenceFile = { id: string; file_name: string; mime_type: string; size_bytes: number; uploaded_at: string;
  scan_status: "pending" | "clean" | "rejected"; sha256: string | null };
```
UI states: `pending` = "processing", `clean` + `sha256` = ready, `rejected` = must be removed. The SHA-256 is computed by the worker from the stored object and never changes.

### `fileClaim(orgSlug, input)` · `referrals:review` · rate limit `referral.claim` 10/h (enforced in the RPC)

Input: `{ referralId: uuid, version: int, evidenceKind: "file" | "referral", fileIds?: uuid[] (1–5 for file), evidenceReferralId?: uuid (for referral), priorProcessDate?: "YYYY-MM-DD" (for file), attested: true, note?: string ≤ 2000 }`.
RPC arguments are built by `fileClaimRpcArgs(parsed, actingOrg)` (`schemas.ts`), which always sends every key (unused ones as `null`); the RPC also has defaults since `20261113000800`. Both evidence kinds are integration-tested through that builder.
Result `ActionResult<{ claimId, contestDeadlineAt, version }>`, message `referrals.claim.messages.filed` with `{partner}` (sourcing org) and `{when}` (contest deadline, ET formatter).
Zod field errors: `attested` (`referrals.validation.attestationRequired`), `fileIds` / `evidenceReferralId` (`referrals.validation.evidenceRequired`), `priorProcessDate` (`referrals.validation.priorDateRequired`).
Server rules (BR-12, BR-26, BR-27): hiring side; status `submitted` / `under_review` / `info_requested`; `now < claim_deadline_at` (checked at filing, not upload); one claim per referral ever (incl. after rejection); file evidence: every file clean and hashed; date `< delivered date (ET)` and `≥ delivered date − 6 months` (strictly before, Q-D3 default); referral evidence: the date is the cited referral's delivery date (ET), set by the server. Revoked sharing doesn't block (PD-027). Effect: referral `declined` with `decline_reason = prior_presentation`, `contest_deadline_at = add_business_days(now, 10)` frozen, sourcing side notified (`claim.filed`), audit `referral.claim_filed {evidence_kind}`. The referral still counts while the claim is open.
Errors: `errors.stale_version`, `errors.claim_already_filed`, `errors.claim_not_allowed`, `errors.claim_window_closed` (`{when}`), `errors.claim_files_not_ready`, `errors.claim_referral_invalid`, `errors.claim_date_invalid`, `errors.claim_attestation_required`, `errors.claim_evidence_invalid`, `errors.claim_note_too_long`, `errors.not_found`.

### `contestClaim(orgSlug, { referralId, reason })` · `referrals:submit` · rate limit `dispute.open` 5/h (shared, BR-19; enforced in the RPC)

`reason` 5–2000 (`referrals.validation.contestReason`). Opens a `prior_presentation` dispute, claim → `contested`, both orgs notified (`dispute.opened`). Message `referrals.contest.messages.contested`. Errors: `errors.contest_window_closed` (`{when}`), `errors.dispute_already_open`, `errors.claim_not_allowed`, `errors.reason_required`, `errors.not_found`.

### Unchanged signatures, changed behaviour

- `reviewReferral` / `declineReferrals`: `duplicate` and `prior_presentation` are refused (`errors.reason_required`). `DECLINE_REASONS` (`review.ts`) no longer contains `duplicate`; `isDeclineReason` still accepts `duplicate` for labels. Add the label for `prior_presentation` (frontend; `SYSTEM_DECLINE_REASONS` lists both system codes).
- `confirmCandidateRequest`: the RPC may now return `already_sent`; the action redirects to the candidate page as before, and `get_candidate_request` returns `state: "already_sent"` (render S7). Reopening the link keeps returning it.

### `{when}` in window-closed errors

`claim_window_closed` and `contest_window_closed` carry the deadline in the RPC error DETAIL; `uploadClaimEvidence`, `fileClaim` and `contestClaim` turn it into `msg("errors.<code>", { when })`, with `when` formatted in the user's locale (`en-CA` / `fr-CA` / `pt-BR`), `America/Toronto`, `dateStyle: medium`, `timeStyle: short`. The copy appends "ET" itself.

---

## 4. Queries (`src/features/referrals/queries.ts`)

### `getReferralPresentation(ctx, referralId): Promise<ReferralPresentation | null>`

Wraps RPC `get_referral_presentation(p_referral, p_acting_org)`. `null` = not visible from this org. Types exported as `SourcePresentation` / `TargetPresentation`.

Common fields: `side`, `status`, `version`, `delivered_at`, `ownership_protected_until`, `claim_deadline_at`, `claim_business_days_left` (business days after today; **0 = "ends today"**, null = passed), `claim_rejected_at`, `review_clock_started_at`, `ownership_state`, `claim`.

| | Sourcing side | Hiring side |
|---|---|---|
| `ownership_state` | `protected` \| `released` \| `ended` (upheld/final) \| `expired` \| `not_delivered` | `protected` \| `ended` \| `expired` (**never `released`**, BR-25) |
| extra | `counts`, `released_at`, `can_release` (release later), `can_release_on_withdraw` (withdraw dialog option) | `can_claim` (AC-27 entry points) |
| `claim.files` | `{ n, uploaded_at, sha256 }[]` only | `{ id, file_name, mime_type, size_bytes, uploaded_at, sha256, scan_status }[]` |
| `claim` extra | `can_contest` | `evidence_referral_id` (link to the cited referral) |

`claim` common: `id`, `status` (`open` \| `contested` \| `upheld` \| `rejected` \| `final`; an open claim past its deadline already reads `final`), `filed_at`, `prior_process_date`, `evidence_kind`, `note`, `contest_deadline_at`, `contest_business_days_left` (while open), `contested_at`, `resolved_at`, `resolution`, `finalized_at`. The contest reason is never returned here.

### `listClaimEvidenceReferrals(ctx, referralId): Promise<EvidenceReferralOption[]>`

Picker (BR-26): `{ referral_id, candidate_label, job_title, source_org_name, delivered_at, status, revoked }[]` (`revoked` = that referral's sharing authorization was revoked; it still qualifies, PD-027). Eligibility follows PD-029 (§12), newest first: referrals this org received for the same job or the same client key (snapshots), delivered before the claimed one, still counting. Empty array = disable the referral option.

---

## 5. Admin (`src/features/admin/{actions,queries}.ts`)

| Name | Kind | Input | Result | Notes |
|---|---|---|---|---|
| `resolvePriorPresentationDispute` | action | `{ disputeId, claimUpheld: boolean, resolution: 5–2000 }` | message `admin.messages.claimUpheld` / `admin.messages.claimRejected` (by outcome) | Upheld: decline stands, `void_reason = prior_presentation_upheld`, stops counting. Rejected: back to `submitted`, `claim_rejected_at` + `review_clock_started_at` = now, `version + 1`, decline fields cleared, status event `actor_kind = admin`. Both orgs notified (`dispute.resolved`). Errors: `errors.dispute_not_open`, `errors.invalid_dispute_kind`. |
| `resolveDispute` | action (existing) | unchanged | | Placement disputes only; a referral dispute → `errors.invalid_dispute_kind`. |
| `compareDisputeContacts(disputeId)` | action | uuid | `{ email, phone, linkedin }`, each `match` \| `no_match` \| `not_available` | Referral-evidence disputes only (else `errors.invalid_dispute_kind`). Audited `dispute.contacts_compared`. Never values or hashes (PD-024). |
| `getAdminClaimEvidenceUrl(fileId)` | action | uuid | `{ url }` (60 s) | Only for claims **with a dispute** (open or resolved), clean files only, audited per download. |
| `getReferralDispute(db, disputeId)` | query | uuid | `ReferralDispute \| null` | `dispute` (incl. contest `reason`, `outcome`, `resolve_by` = 5 business days after opening, `resolve_by_business_days_left` = business days after today, 0 = today, null once closed or passed), `claim` (+ files with names), `claimed_referral` / `evidence_referral` cards (orgs with `locale` for the language hint, job, client name, `internal`, status, delivery, release / void flags, `still_counts`), `same_client_key`. **No candidate name or label.** |
| `getPresentationMetrics(db, days = 30)` | query | | `PresentationMetrics` (counts only) | hits by scope, stops, sticky stops, pending warnings, identifier refusals, closures, delivered, claims, contested, releases, withdrawals, open / resolved referral disputes, resolved within 5 business days, claims rejected, referral-open jobs and how many have a client key (BR-32 coverage). |
| `getAbuseFlags(db)` | query | | `{ organization_id, organization_name, stops_7d, rejected_claims_90d }[]` | BR-29: > 5 stops in 7 days or ≥ 2 rejected claims in 90 days. Flag only. |

Admin disputes list: select `disputes` as today and branch on `kind`; for `prior_presentation` rows `placement` is null — call `getReferralDispute(id)` for the card (admins can't read `referrals` through RLS). The open-disputes count in `getAdminQueues` already includes both kinds.

---

## 6. RPCs (PostgREST surface)

New, `authenticated` (all added deliberately to `tests/integration/api-surface.test.ts`): `withdraw_referral`, `release_referral`, `register_claim_evidence`, `list_claim_evidence_files`, `remove_claim_evidence`, `authorize_claim_evidence`, `list_claim_evidence_referrals`, `file_prior_presentation_claim`, `get_referral_presentation`, `contest_prior_presentation_claim`, `resolve_prior_presentation_dispute`, `get_referral_dispute`, `compare_dispute_contacts`, `presentation_admin_metrics`, `presentation_abuse_flags`.
Changed (drop + recreate): `submit_referral(p_candidate, p_job, p_fields, p_document_ids, p_consent, p_idempotency_key, p_note?, p_acknowledge_pending?, p_new_consent?) → table(outcome, referral_id, reference)`; `submit_referral_for_candidate(..., p_ttl_days?, p_acknowledge_pending?) → table(outcome, referral_id, created, destination, reference)`. `respond_candidate_request` → `'confirmed' | 'declined' | 'already_sent'`.
Service role only: `claim_evidence_scan_target`, `record_claim_evidence_scan`, `finalize_due_claims`, `purge_presentation_data`, `purge_orphan_claim_files`, `forget_claim_files`, `rotate_fingerprint_key`.
The allow-list also gained the pre-existing candidate-confirmation RPCs that were missing (the test was red before N1), and an `ANON_RPCS` set for the two token-only candidate-page RPCs.

---

## 7. Worker and maintenance

- Job `claim_evidence.scan` (`src/server/queue/handlers/claim-evidence.ts`): downloads the object, signature check (PDF `%PDF-`, PNG, JPEG), PDF active-content heuristic, size match, SHA-256 → `record_claim_evidence_scan`. Not a full AV (same caveat as candidate documents).
- `runMaintenance()` every 10 minutes in `runForever`: `finalize_due_claims` (materialises `final`, audit, no notification), `purge_presentation_data` (BR-21 fingerprints + expired sticky stops), orphan evidence (draft files older than 24 h or removed) deleted from storage.
- Anonymising a candidate deletes its fingerprints on referrals without an open dispute (trigger; BR-21 provisional default, O-1 pending). **No automatic evidence-file deletion** until O-1.

---

## 8. Notifications and audit

In-app notifications (English titles in SQL, PD-026; one kind per event):

| Kind | To | Title |
|---|---|---|
| `referral.already_presented` | the submitter; if no longer an active member, the sourcing org's `org_admin`s (PD-026) | Referral not delivered: already presented |
| `claim.filed` | sourcing org | Prior-presentation objection on your referral |
| `dispute.opened` | both orgs | Objection contested |
| `dispute.resolved` | both orgs | Objection upheld / Objection rejected |

None for: stop, warning, sticky stop, release (beyond the normal withdrawal notification), claim window expiry, claim final. **N1 emails are deferred to N7 by decision (PD-030); this is not a gap in N1.** The `emails.*` keys from spec §5.10 exist for that later work.

Audit (member-visible events have **empty metadata**: no scope, identifiers, hashes, client key or other referral id): `referral.submission_stopped` (source org, entity = job; stops and sticky stops alike), `referral.pending_warning`, `referral.identifier_required`, `referral.closed_already_presented`, `referral.released`, `referral.claim_filed {evidence_kind}`, `referral.claim_contested {dispute_id}`, `referral.claim_final`, `referral.claim_resolved {claim_upheld}`, `claim_evidence.accessed {file_id}`. Platform-only (`organization_id` null): `referral.fingerprint_hit {hit, scope, outcome}`, `referral.sticky_stop {hit}`, `dispute.resolved`, `dispute.contacts_compared`, `presentation.key_rotated`. The PD-022 internal attribute is only in `app.presentation_hits`.

---

## 9. Business days

`app.add_business_days(event, n)`: the event's local date (America/Toronto) never counts; deadline = 23:59:59 local on the n-th business day after it (DST-safe). `app.business_days_left(deadline)`: business days after today up to the deadline date; 0 = ends today; null = passed. The AC-52 table and the AC-28 examples are integration-tested.

Seed verification (2026-11-12): Ontario ESA "Public holidays" page (ontario.ca) and CNESST "Statutory holidays" page (cnesst.gouv.qc.ca) fetched and checked; Easter computed (2026-04-05, 2027-03-28, 2028-04-16); every seeded date's weekday computed. Appendix A is correct as written: substitutes 2026-12-28, 2027-12-27, 2027-12-28, 2028-01-03; no substitute for Saturday 2028-06-24 or 2028-07-01 (CNESST: 1 July moves only from a Sunday; 24 June special rules move only from a Sunday). Note: Ontario's ESA gives a substitute day off rather than a fixed observed date, so the Ontario substitutes are the PD-019 convention, not a statutory date.

---

## 10. Things the frontend (and QA) must know

- Use `withdrawReferral` for the withdraw dialog and `releaseReferral` for release later; both need the explicit second confirmation in the UI (the server can't see it).
- `stopped.reference` is opaque and per attempt; `supportEmail` null → hide the support line.
- Show deadlines from `claim_deadline_at` / `contest_deadline_at` in America/Toronto + "ET", and the server-computed `*_business_days_left`.
- `already_presented` is a status the hiring side never receives; the sourcing side's timeline actor is `actor_kind = 'system'`.
- Admin evidence download only appears for disputed claims; the "same person" signal only for referral-evidence disputes.
- Draft i18n keys added by backend (ux-writer to check): `errors.not_found`, `errors.claim_file_invalid`, `errors.claim_too_many_files`, `errors.claim_attestation_required`, `errors.claim_date_invalid`, `errors.claim_evidence_invalid`, `errors.claim_note_too_long`, `errors.invalid_dispute_kind`; `referrals.validation.{attestationRequired,evidenceRequired,priorDateRequired,contestReason}`; `referrals.success.{withdrawn,withdrawnReleased,released,evidenceRemoved}` (`claimFiled` / `contested` are no longer returned, copy-review P5, and can be deleted); `admin.messages.{claimUpheld,claimRejected}`; `labels.referralStatus.already_presented`. The nine `errors.*` keys of spec §5.8 use the final copy verbatim.
- New env var `SUPPORT_EMAIL` (server-only, optional) in `.env.example`. There is deliberately **no** env var for the fingerprint key.
- Pre-existing bug fixed in migration 3: service-role job writes (connectors, `/api/v1/jobs`) failed with "permission denied for function normalize_tags"; `service_role` now has that grant.
- Integration tests clear the rate-limit windows of their shared fixture users before each test (`app.rate_limits`); the limits themselves are tested with dedicated users.
- Integration tests use `psql` (local only, `SUPABASE_DB_URL` or the default local URL) to reach the closed `app` schema and move clocks.

---

## 11. QA fixes (`20261113000900_qa_fixes.sql`, qa-report.md)

| # | Fix |
|---|---|
| B-1 | Rate limits run in the database, same buckets, refused **before any check** with error `rate_limited` (mapped to `errors.rateLimited`): `referral.submit` 30/h in `submit_referral` and `submit_referral_for_candidate`; `referral.claim` 10/h in `file_prior_presentation_claim`; `dispute.open` 5/h in `contest_prior_presentation_claim` (shared with placement disputes, whose action still consumes it); `storage.claim_evidence` 30/h in the `claim-evidence` insert policy (`app.can_upload_claim_evidence`), so every stored object counts, registered or not. The actions no longer consume `referral.submit`, `referral.claim` or `dispute.open` themselves (no double counting). |
| m-1 | PDF scan (`pdfHasActiveContent` in `claim-evidence.ts`): the whole file (≤ 10 MB) is scanned; `#xx` name escapes are decoded; whole-name match for `/JavaScript /JS /Launch /EmbeddedFile(s) /OpenAction /AA /SubmitForm /ImportData /RichMedia /XFA /GoToE`. `/URI` alone is allowed (links are normal in exported emails); `/AA` is rejected, so "/AA + /URI" is rejected. Compressed streams are still not inspected (heuristic, not AV). |
| m-2 | A pending hit submitted with the acknowledgement on the first call is logged: hit outcome `warn_ack` and platform audit `referral.fingerprint_hit {outcome: "warn_ack"}`. No member-visible event (the `referral.submitted` event covers it). |
| m-3 | `purge_orphan_claim_files()` also returns objects in `claim-evidence` older than 24 h that were never registered; the worker deletes them. |
| m-4 | `app.add_business_days` raises `holiday_calendar_exhausted` when a deadline would fall past the last seeded year. 2029 is now seeded (§13), so the guard fires from ~2029-12-20: **seed 2030 before then** (PD-014: yearly migration; put it on the launch checklist / roadmap). |
| m-5 | Support reference = 8 random digits (`gen_random_bytes`), unique index on `app.presentation_hits.reference`, retried on collision; no longer derived from the audit sequence. |

B-2, B-3 and m-9 were decided by the PM (PD-029, PD-030, PD-032), see §12.

## 12. PM decisions (`20261113001000_pm_decisions.sql`, brief rev. 4.2)

- **PD-029 (B-2), evidence judged at the claimed referral C's delivery.** `app.evidence_referral_ok` (used by `list_claim_evidence_referrals` and `file_prior_presentation_claim`) accepts an earlier referral E only when:
  - **as of `C.delivered_at`:** `E.ownership_protected_until > C.delivered_at` and E was not released before C's delivery (`released_at is null or released_at > C.delivered_at`);
  - **as of now:** E is not `already_presented`, has no `prior_presentation_upheld` flag, and has no upheld, final or lazily final claim;
  - **unchanged:** same hiring org, same job or same client-key snapshot, and E delivered before C.
  Every ineligible reason gives `claim_referral_invalid`. A release after C's delivery no longer changes the picker (scenario 47). The remaining inference is residual R-18.
- **PD-030 (B-3):** N1 emails are deferred to N7.
- **PD-032 (m-9), expired candidate links:**
  - `app.presentation_check` no longer treats an `awaiting_candidate` referral as pending once its request's `expires_at` has passed (no warning);
  - `purge_presentation_data` deletes its fingerprints;
  - `rotate_candidate_request_token` (resend) recomputes them in the database from the current candidate row with `app.write_fingerprints`;
  - a resend runs **no** stop check.
  Scenario 48 / AC-76 is integration-tested.
- **m-5 support lookup:** the random reference is stored on `app.presentation_hits.reference` (unique). New RPC, platform admins only, `get_stop_by_reference(p_reference text) → jsonb`:
  - **returns:** `reference, created_at, outcome, scope, earlier_internal, audit_event_id, source_org {id,name}, target_org {id,name}, job_id, job_title, source_user_id`;
  - **errors:** `forbidden` for non-admins, `not_found` for an unknown reference;
  - **frontend:** query wrapper `getStopByReference(db, reference)` in `src/features/admin/queries.ts`, on the allow-list.
  `stopped` keeps the same shape.

## 13. QA round 2 (`20261113001100_qa_round2.sql`)

| # | Fix |
|---|---|
| R2-1 / r2-m2 | `submit_referral` / `submit_referral_for_candidate`: **nothing raises after the check.**<br>• Everything that can fail is validated before `app.submission_gate`, including a token hash already in use. That case is returned as outcome `invalid_token` before any check runs, so the attempt is counted and reveals nothing.<br>• Everything after the gate runs in an exception block. A race there is returned as a stable code (`app.safe_error_code`: the RPC's own code, `conflict` for unique violations, otherwise `failed`).<br>• The rate-limit hit, the hit row and the audit of every checked attempt therefore commit.<br>• **Claims and contests keep raising** on validation failures, so failed ones aren't counted (QA's AC-36 test requires this). No presentation check runs in them. They lock the referral first, so their unique races can't happen.<br>• `rotate_candidate_request_token` refuses a hash used by another request with `invalid_token` (no stop check runs there, PD-032). |
| R2-2 | The upload limit is counted by `BEFORE INSERT` trigger `claim_evidence_upload_limit` on `storage.objects` (bucket `claim-evidence`; user = `auth.uid()` or the object's `owner_id`). It raises `rate_limited` past 30/h. The counter is written in the transaction that commits the object. The insert policy no longer consumes (Storage discarded that write in its permission dry-run). Tested with 31 real uploads, no pre-fill. |
| r2-m1 | The PDF scan inflates every `/FlateDecode` stream, object streams included (`node:zlib`, 64 MB total budget), and scans the result. A stream that can't be inflated, or that exceeds the budget, rejects the file. `/GoToR` is added to the blocked names. |
| r2-m3 | Stable codes instead of raw constraint errors:<br>• submit paths: see R2-1;<br>• `rotate_candidate_request_token`: `invalid_token`;<br>• claims: `claim_already_filed` (trigger);<br>• referral disputes: `dispute_already_open` (trigger);<br>• `open_dispute`: `dispute_already_open` and `reason_required`. |
| r2-m4 | 2029 seeded from the Ontario ESA and CNESST lists:<br>• 1 Jan; Family Day 19 Feb; Good Friday 30 Mar; Easter Monday 2 Apr (Easter computed as 1 Apr); 21 May;<br>• **25 Jun** (24 Jun is a Sunday) and **2 Jul** (1 Jul is a Sunday), both Québec rules, applied to the union;<br>• 3 Sep; 8 Oct; 25–26 Dec.<br>The guard stays for 2030+. |
| r2-m5 | `open_dispute` enforces `dispute.open` 5/h itself, so the commissions action no longer consumes it. |

## 14. QA round 3: PDF scanner (`src/server/queue/handlers/claim-evidence.ts`, no migration)

- **R3-1, linear scan with a hard time budget.** The stream-dictionary regex was replaced by a single forward walk:
  - `indexOf("stream")` (ignoring `endstream` and keywords not followed by an end-of-line);
  - the dictionary is the text between the previous stream's end and the keyword, so look-backs never overlap and total work is bounded by the file size;
  - then `indexOf("endstream")`.
  The scan checks a 2 s deadline (`pdfHasActiveContent(bytes, timeBudgetMs = 2000)`) in its loops and **rejects** the file if the deadline passes. In unit tests, 10 MB adversarial inputs (repeated `<<`, 200,000 tiny streams, slashes, `/Filter [` runs, bare `stream` words) are rejected or accepted well under a second.
- **R3-m1, fail closed:**
  - **Encryption:** any `/Encrypt` (after name-escape decoding) rejects the file.
  - **Dictionaries:** dictionaries of any length are handled (no 4,000-character window).
  - **Decoded filters:** `FlateDecode` / `Fl` (zlib, 64 MB total decoded budget), `ASCIIHexDecode` / `AHx` and `ASCII85Decode` / `A85`, including chains like `[/ASCII85Decode /FlateDecode]`. The decoded content is scanned.
  - **Image codecs** (`DCT`, `JPX`, `CCITTFax`, `JBIG2`) are skipped on image streams and **rejected on object streams**.
  - **Everything else is rejected:** unknown filters (LZW, RunLength, Crypt…), decode failures, a missing `endstream`, or the size or time budget exceeded.
- **Unchanged:**
  - plain `/URI` links and ordinary compressed PDFs are accepted;
  - `/JavaScript /JS /Launch /EmbeddedFile(s) /OpenAction /AA /SubmitForm /ImportData /RichMedia /XFA /GoToE /GoToR` are rejected.
  This is still a heuristic, not an antivirus.

## 15. QA final: isolated PDF scan (no migration)

- **Stalls are impossible by construction.**
  - The verdict runs in a `node:worker_threads` worker (`src/server/queue/handlers/pdf-scan-worker.mjs`).
  - `evidenceVerdictIsolated(buffer, mime, size, { timeoutMs = 3000 })` in `claim-evidence.ts` **transfers** the bytes. The SHA-256 is computed first, because the buffer is detached afterwards.
  - It enforces a hard wall-clock timeout and sets `resourceLimits` (old generation 384 MB, young generation 64 MB, stack 4 MB).
  - On timeout it calls `worker.terminate()`. Timeout, crash, out-of-memory, an error, or an exit without a verdict all mean **`rejected`**, never accepted.
  - `scanClaimEvidence` uses it.
  - The entry is plain ESM with `execArgv: []`, so it loads the same way under `tsx --conditions=react-server scripts/worker.mts` (checked), vitest and plain node.
- **Pure scan still importable.**
  - The scan lives in `src/server/queue/handlers/pdf-scan.mjs` (types in `pdf-scan.d.mts`).
  - `claim-evidence.ts` re-exports `evidenceVerdict` / `pdfHasActiveContent` for the unit tests.
  - The in-scan budget is 2 s and is checked inside every loop: stream walk, filter chain, ASCII85 decoding, decoded-stream scan.
- **F-1:** the filter chain comes from the **last** `/Filter`, found with `lastIndexOf`, then a bounded tokenizer reads a window of at most 600 characters. An unclosed array inside that window means reject. The `/Filter [` run pattern is now linear.
- **F-2, fail closed:**
  - **Indirect references:** a non-literal `/Filter` (`/Filter 5 0 R`, or a reference inside the array) or an indirect `/DecodeParms` means reject.
  - **Stream keyword:** `stream` must follow its dictionary's `>>` and be followed by optional spaces or tabs, then CRLF or LF. A keyword-looking line in an ambiguous position means reject; the plain word in text (`upstream`, `stream ` mid-sentence) is ignored.
  - **Direct `/Length`:** the stream data is exactly that many bytes, so an `endstream` inside it is data. Data shorter than `/Length` means reject.
  - **No direct `/Length`:** data runs to the first `endstream`, and the decoders are strict. Flate must reach its end (truncation throws), and ASCIIHex / ASCII85 need their EOD marker. Otherwise reject.
- **Tests:**
  - **QA:** the 4 failing tests now pass, unedited.
  - **Worker isolation:** verdicts match the pure scan, the buffer is detached after transfer, and a 10 MB pathological input is rejected through the parent timeout (20 ms timeout, in-scan budget lifted) in milliseconds, without hanging the runner.
  - **Empty input:** rejected.
- **Wrapper guard:** the integration wrapper now refuses to run unless `NEXT_PUBLIC_SUPABASE_URL` is `http://127.0.0.1:*` and a local secret key is set.
