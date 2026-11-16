# Backend: candidate-confirmation integrity (N9)

Owner: Backend Engineer · Date: 2026-11-15 · Brief: [`brief.md`](brief.md) (BR-1 to BR-12) · Decisions: PD-038 to PD-040

Status: built and green locally. Not pushed to the hosted project.

There is no UI, copy or i18n change. The candidate page, the confirm and decline actions, the recruiter's referral page and the Resend button all keep their current contracts.

## 1. Migration

`supabase/migrations/20261115000100_candidate_confirmation_integrity.sql` (one file, after N1's `20261113001100`). Applied locally with `npm run db:reset`; types regenerated with `npm run db:types`.

### Data model

| Object | Change |
|---|---|
| `public.referral_candidate_requests.token_hash` | Now **nullable**. Null means "no usable token": a new request, a request just rotated, or a request whose issuance failed. Unique and format checks unchanged. Still **no column grant** to any PostgREST role. |
| `public.referral_candidate_requests.token_issued_at` (`timestamptz`, new) | Set by issuance only. `select` granted to `authenticated` (RLS: source-org members). |
| `public.referral_candidate_requests.token_issued_by` (`uuid` → `auth.users`, `on delete set null`, new) | The actor passed to issuance (always the session user). `select` granted to `authenticated`. |
| `app.candidate_email_changes (id, candidate_id, changed_at)` (new, BR-12) | One row per change of `candidates.email`. Stores **dates only, no addresses**. Non-exposed schema, RLS on, no policies, all privileges revoked from `public` / `anon` / `authenticated`. Cascades on candidate delete. Retention 60 days (30-day window plus the 30-day maximum link TTL), enforced by the maintenance sweep and on the next change; anonymisation deletes all of the candidate's rows (§7, QA m-1). |
| Trigger `candidates_email_change` | `after update of email on public.candidates`, `when old.email is distinct from new.email`. Runs `app.on_candidate_email_change()` (SECURITY DEFINER, execute revoked). |

### BR-7 / BR-8 invalidation (runs once, in the migration)

Every request with these properties gets `expires_at = now()`, and `token_issued_at` stays null:
- the referral is `awaiting_candidate`;
- the request is unanswered (`confirmed_at` and `declined_at` null);
- `token_issued_at` is null;
- `expires_at > now()`.

Each expired request gets one `audit_events` row: `action = 'referral.candidate_request_invalidated'`, `actor_id` null, `entity_type = 'referral'`, `entity_id` = the referral, and `metadata = {"reason": "n9_token_reset"}`.

Answered requests aren't touched. The stored hash is kept, so the old link resolves and shows the existing **expired** state (BR-6 below). Requests already past their expiry are left as they are and get no audit row (deviation D-4).

**Manual check** (`psql`, the exact statement taken from the migration, on a simulated pre-N9 request with a known token):
- `get_candidate_request` returned `expired`;
- `respond_candidate_request` raised `request_expired`;
- one audit row was written, with actor null and `{"reason": "n9_token_reset"}`;
- answered requests were byte-identical before and after (md5 of the rows).

QA scenario 8 owns the full migration test.

### R-2: confirmed referrals that predate N9

| Database | Confirmed pre-N9 requests | Notes |
|---|---|---|
| Local, before `db:reset` (2026-11-15) | **13** confirmed, 13 declined, 164 unanswered and still in date | All integration-test fixtures (`*@example.com`, test orgs). They were wiped by the reset |
| Local, after `db:reset` (the migration ran on an empty DB, no seed) | **0** | |
| Hosted | **not checked** | Out of scope here, since no hosted tools are allowed. Count before `supabase db push` with `select count(*) from public.referral_candidate_requests where confirmed_at is not null;` If real ones exist: **Needs user decision** (brief R-2) |

## 2. RPCs (PostgREST surface)

### Dropped (BR-4)
- `submit_referral_for_candidate(uuid, uuid, text[], uuid[], text, text /*p_token_hash*/, text, integer, boolean)`
- `rotate_candidate_request_token(uuid, text /*p_token_hash*/, integer)`

A call that still passes `p_token_hash` gets PostgREST **`PGRST202`** ("Could not find the function"). No overload exists.

### `submit_referral_for_candidate` (user session, `authenticated`)
```
submit_referral_for_candidate(
  p_candidate uuid, p_job uuid, p_fields text[], p_document_ids uuid[], p_idempotency_key text,
  p_note text default null, p_ttl_days integer default 14, p_acknowledge_pending boolean default false
) returns table (outcome text, referral_id uuid, created boolean, destination text, reference text)
```
- The body is N1's (`20261113001100`) minus the token-hash checks. The order is unchanged:
  1. `referral.submit` 30/h is consumed first;
  2. idempotency check;
  3. `assert_referable`;
  4. `candidate_email_missing`;
  5. documents;
  6. `submission_gate` (`stopped` / `pending_warning` / `identifier_required`);
  7. the no-raise block that maps errors to `conflict` / `failed` / precondition codes.
- The request is inserted with `token_hash = null`, `token_issued_at = null`, and `sent_at` null.
- The result is the same five columns as before. **No token or hash** is returned.
- The `invalid_token` outcome **no longer exists** (BR-9).

### `rotate_candidate_request_token` (user session, `authenticated`)
```
rotate_candidate_request_token(p_referral uuid, p_ttl_days integer default 14) returns text  -- the destination email
```
In order:
1. `unauthenticated` (28000) if there is no session.
2. **`referral.candidate_resend` 10/h consumed** (BR-10). An over-limit call raises `rate_limited`, and its own hit rolls back.
3. `forbidden` (42501) if the referral doesn't exist or the caller isn't an active member of the source org.
4. `request_closed` if the referral isn't `awaiting_candidate`.
5. `candidate_email_missing`.

Then it does the following:
- sets `token_hash`, `token_issued_at` and `token_issued_by` to null, so the **old link dies at once** (`get_candidate_request` returns `null` and `respond_candidate_request` raises `not_found`);
- sets `destination` to the candidate's current email;
- sets `expires_at = now() + ttl` (ttl clamped to 1..30 days);
- recomputes fingerprints with no stop check (PD-032, BR-11);
- writes the audit event `referral.candidate_request_resent` with `{}`.

### `issue_candidate_request_token` (new, **service_role only**)
```
issue_candidate_request_token(p_referral uuid, p_actor uuid) returns text  -- raw token, 43 chars base64url
```
- Grants: `revoke execute from public, anon, authenticated`; `grant execute to service_role`. It is also **not** in the api-surface allow-list.
- Defence in depth: any call carrying a user JWT (`auth.uid()` not null) raises `forbidden`.

Checks, in order (each raises; nothing is written on failure):

| Condition | Error |
|---|---|
| A user JWT is present | `forbidden` (42501) |
| `p_referral` or `p_actor` is null, or the referral is unknown | `not_found` (P0002) |
| `p_actor` isn't an **active** member of the referral's **source** org, or that org is suspended | `forbidden` (42501) |
| The referral isn't `awaiting_candidate` | `request_closed` |
| The request is missing | `not_found` |
| The request is answered | `request_closed` |
| `token_hash` is not null (a live token, or a pre-N9 hash): rotate first | `token_already_issued` |
| `expires_at < now()`: rotate first | `request_expired` |

On success it:
- generates the token: `rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=')`. That is 256 bits from pgcrypto's CSPRNG, 43 characters, accepted by the page (`/^[A-Za-z0-9_-]{32,128}$/`) and by the candidate actions' validator;
- stores `token_hash = sha256(token)` as hex, `token_issued_at = now()` and `token_issued_by = p_actor`;
- writes the audit event `referral.candidate_request_issued`: actor `p_actor`, metadata `{"send_number": n}`, where n counts this referral's issuances (1, 2, …);
- returns the token once.

### `get_candidate_request(p_token)` (anon and authenticated, unchanged signature)
- New state rule (BR-6): after `confirmed` / `declined` / `already_sent` / `closed`, a request with `token_issued_at is null` answers **`expired`**. It never answers `pending`, so no profile data is returned.
- Everything else is unchanged.

### `respond_candidate_request(p_token, p_accept, p_profile, p_reason, p_meta)` (anon and authenticated, unchanged signature)
- New check (BR-6): right after the token lookup, a request with `token_issued_at is null` raises **`request_expired`**. This covers accept and decline (deviation D-7).
- Consent evidence (BR-8, BR-12) is now:
  `Candidate confirmed through the private link emailed to {destination} (issued {token_issued_at}, sent {sent_at|n/a}, confirmed {now} UTC).[ Candidate email changed on {YYYY-MM-DD}.][ Candidate updated: {fields}.]`
- The "email changed" sentence uses the latest `app.candidate_email_changes.changed_at` within `[token_issued_at - 30 days, token_issued_at]`. Only **updates** of the email count, not the email set at candidate creation (deviation D-8).
- The `referral.candidate_confirmed` audit metadata is `{"profile_changes": [...], "token_issued_at": "<timestamptz>"}`.
- The N1 delivery re-check, `already_sent`, the decline path and the notifications are unchanged.

### Unchanged
`record_candidate_request_delivery(p_referral, p_ok, p_error)` (`authenticated`).

## 3. Server Actions and server module

### `src/features/referrals/candidate-request.ts`
- `newCandidateToken()` **deleted**. `candidateRequestUrl` is now module-private.
- `emailCandidateRequest(ctx, { referralId, to, jobTitle, partner, candidateName? }): Promise<{ sent: boolean; reason?: "not_configured" | "failed" }>`. The **`token` input is removed**: the function now issues the token itself (deviation D-2). It runs in this order:
  1. If email isn't configured, it calls `record_candidate_request_delivery(false, "not_configured")` and returns `not_configured`. **No token is issued** (deviation D-3).
  2. It calls `issue_candidate_request_token` with `createAdminClient()`, `p_actor = ctx.user.id`, and checks the result against `/^[A-Za-z0-9_-]{43}$/`. On any error it records `failed` and returns `failed`, with no message and no log.
  3. It renders and sends the email, puts the URL only in it, then records the delivery outcome as before.
- It never throws, and never returns or logs the token.

### `submitReferral(orgSlug, prevState, formData)` · `referrals:submit`
- Input and result shapes are unchanged: `ActionResult<SubmitOutcome>`, or a redirect to `/workspace/{slug}/referrals/{id}?awaiting=1|notSent=1` for the candidate path.
- `submit_referral_for_candidate` is called without `p_token_hash`.
- When `data.created` is true, the action calls `emailCandidateRequest`. If it doesn't send (issuance failure included), the redirect carries `notSent=1`, which is an existing state.
- Generic outcome handling is unchanged. The comment no longer lists `invalid_token`.

### `resendCandidateRequest(orgSlug, referralId)` · `referrals:submit`
- Input and result are unchanged. Success message: `referrals.success.candidateEmailResent`. Failures: `referrals.errors.emailNotConfigured` or `referrals.errors.candidateEmailFailed`.
- The action no longer calls `rateLimit(..., "referral.candidate_resend", ...)`. The limit is counted once, inside the RPC (BR-10). An over-limit resend maps to `errors.rateLimited`, as before.
- The call sequence is:
  1. `parse(id, referralId)`;
  2. an RLS-scoped lookup of the source-org referral (`referrals.errors.notFound`);
  3. `rotate_candidate_request_token(p_referral, p_ttl_days)`;
  4. `emailCandidateRequest`.

### i18n keys used for errors
All existing; nothing added:
- `errors.rateLimited`, `errors.forbidden`, `errors.request_closed`, `errors.request_expired`, `errors.candidate_email_missing`, `errors.not_found`, `errors.generic`;
- `referrals.errors.notFound`, `referrals.errors.emailNotConfigured`, `referrals.errors.candidateEmailFailed`;
- `referrals.success.candidateEmailResent`.

`token_already_issued` never reaches the UI: issuance errors are swallowed and shown as "not sent".

## 4. Things Frontend and QA must know
- **Frontend: nothing to change.** The referral page reads `destination, expires_at, sent_at, last_attempt_at, viewed_at, confirmed_at, profile_changes`, all still granted. BR-7 requests show the existing `detail.next.awaitingExpired`, with Resend as the primary action.
- **Crash between steps (R-3)** leaves `token_hash` null and `sent_at` null. The page shows `awaitingNotSent`, and Resend runs rotate, issue and email.
- **Test helper:** `issueCandidateToken(referralId, actorId)` in `tests/integration/helpers.ts` returns a real server-issued token through the service-role path. The E2E helper `pending()` in `tests/e2e/duplicate-presentation.spec.ts` calls the same RPC through `admin()`.
- To replace a live token in a test, call `rotate_candidate_request_token` as the recruiter first. Issuing twice raises `token_already_issued`.
- **Retired by backend (skipped, not deleted; QA retires them, brief R-5):**
  - `duplicate-presentation.test.ts`: "a reused token hash is refused before the check…";
  - `duplicate-presentation-qa.test.ts`: "R2-1 fixed: a reused token hash answers invalid_token…" and "race: two parallel candidate submissions with the same fresh hash…".
- **Minimally updated to the new flow, so the suite stays green:**
  - both `submitForCandidate` helpers;
  - the forged-arguments list (dropped `p_token_hash` from the two `submit_referral_for_candidate` entries, so they still test the extra argument);
  - the r2-m3 rotate assertion (now `request_closed` on a declined request instead of `invalid_token`);
  - scenario 48 tail (rotate, then `issueCandidateToken`);
  - `identifier_required` candidate-path call;
  - PD-032 resend call.

## 5. Deviations from brief §3 (all BRs still hold)

| # | Deviation | Why |
|---|---|---|
| D-1 | An over-limit resend (the 11th) raises `rate_limited`, and its own hit rolls back: 10 committed hits, not 11. Rotates that fail later (`forbidden`, `request_closed`, …) also roll back their hit | Same semantics as N1's `enforce_rate_limit` in the submit RPCs. Each successful resend counts exactly once |
| D-2 | `emailCandidateRequest` issues the token itself (its `token` parameter is gone), instead of the action calling issuance and passing the token in | The raw token never exists in `actions.ts` or in any value an action can return (BR-3) |
| D-3 | When email isn't configured, no token is issued | No channel would carry it. Resend issues one once email works. The UI state is identical (`not_configured`) |
| D-4 | BR-7 expires only requests still in date (`expires_at > now()`), and audits those | Already-expired requests are already ended, and their recruiter-visible expiry date stays truthful. Their old links can't answer anyway (BR-6) |
| D-5 | Rotate also nulls `token_issued_at` and `token_issued_by`, not only the hash | Keeps "no token" as one state. Issuance sets all three |
| D-6 | Issuance also refuses expired requests (`request_expired`) and answered requests (`request_closed`). The live-token refusal uses a new code, `token_already_issued` | Deny by default. A dead link is never minted. None of these codes reach the UI |
| D-7 | `respond_candidate_request` checks `token_issued_at` before the idempotent `confirmed` / `declined` returns. An old pre-N9 link to an answered request now raises `request_expired` on respond | Strict BR-6. The page still shows `confirmed` / `declined` via `get_candidate_request`, which only calls respond on `pending` |
| D-8 | BR-12 needs one new internal table (`app.candidate_email_changes`, dates only). The brief's privacy line expected only the two new columns. Only email **updates** count, not the creation of a candidate with that email | There was no record of when an email changed. The table holds no address and is unreadable by any user role. Whether "added recently" should also count is Q-1 for the strategist (brief §9). **PM: please confirm, or drop BR-12** |
| D-9 | `send_number` counts issuances for the referral, not successful sends (`send_count`) | Issuance happens before the send result is known, and one issuance is one email attempt |

## 6. Files
- `supabase/migrations/20261115000100_candidate_confirmation_integrity.sql` (new)
- `supabase/migrations/20261115000200_email_change_retention.sql` (new, QA m-1)
- `src/server/db/database.types.ts`: regenerated. It also picks up pre-existing drift, such as `api_keys` and column ordering, that was in the DB but not in the committed file.
- `src/features/referrals/candidate-request.ts`, `src/features/referrals/actions.ts`, `src/server/supabase/admin.ts` (allowed-caller comment)
- `tests/integration/candidate-confirmation-integrity.test.ts` (new), `tests/integration/helpers.ts`, `tests/integration/api-surface.test.ts`, `tests/integration/duplicate-presentation.test.ts`, `tests/integration/duplicate-presentation-qa.test.ts`, `tests/e2e/duplicate-presentation.spec.ts`
- `docs/architecture.md`, `docs/security-and-privacy.md`

## 7. QA m-1 fix: change-log retention (`20261115000200_email_change_retention.sql`)

QA found that rows were pruned only on the candidate's next email change, and that `anonymize_candidate` (email set to null) added a row nothing ever removed.

- **Anonymisation:** `app.on_candidate_email_change()` now deletes every row of the candidate and inserts none when `new.anonymized_at is not null`. `anonymize_candidate` sets `anonymized_at` and `email = null` in the same UPDATE, so this covers it. It also covers any future path that does the same. `anonymize_candidate` itself is unchanged.
- **Scheduled prune:** `purge_presentation_data()` also runs `delete from app.candidate_email_changes where changed_at < now() - interval '60 days'`. Its result gains a key: `{"fingerprints": n, "sticky_stops": n, "email_changes": n}`. It already runs every 10 minutes from the worker (`runPresentationMaintenance` in `src/server/queue/handlers/claim-evidence.ts`), so no app code changed. Grants are unchanged (service_role only, restated in the migration). Correctness never depends on the sweep: the evidence query only looks at the 30 days before issuance.
- **One-off cleanup in the migration:** deletes existing rows of anonymised candidates and rows older than 60 days.
- **Tests:**
  - `candidate-confirmation-integrity.test.ts`:
    - anonymisation leaves 0 rows;
    - the purge deletes a 61-day row and keeps a 59-day row, and `email_changes >= 1`;
    - `runPresentationMaintenance` (the worker entry point) prunes too;
    - `purge_presentation_data` is refused for anon and authenticated.
  - The QA test "BUG (minor, backend): anonymizing … never pruned" asserted the buggy count (2). I flipped it to the fixed expectation (0) and renamed it "m-1 fixed: …".
