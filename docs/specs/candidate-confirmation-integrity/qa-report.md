# QA report: candidate-confirmation integrity (N9)

Owner: QA Engineer · Date: 2026-11-15 · Brief: [`brief.md`](brief.md) (BR-1 to BR-12, §7 scenarios 1–12) · Backend: [`backend.md`](backend.md) (D-1 to D-9) · Closes X-1 from [`duplicate-prior-presentation/qa-report.md`](../duplicate-prior-presentation/qa-report.md)

## Verdict: **PASS**

No blockers and no majors. X-1 is closed: I couldn't obtain or forge a candidate token or confirmation as a recruiter, as anon, or from another org through any path I tried. The two minors from round 1 (m-1, m-2) are **fixed and verified** (§5). The observations below don't block acceptance.

One decision is still open for PM: **D-8** (only email *updates* count for BR-12, not a candidate created with that address). Backend asked PM to confirm it or drop BR-12.

Environment: local stack only, everything through the guarded wrapper `local-env.sh` (it refuses unless the URL is `127.0.0.1`). `.env.local` and the hosted project were not touched. The user's own dev server on port 3000 was left alone.

For E2E I rebuilt the app and served it with `next start -p 3100`, plus `npm run worker`, both through the wrapper. The server ran with:
- `RESEND_API_KEY` set, so email counts as configured;
- `SUPPORT_EMAIL=support@example.test`, which the N1 stop test expects;
- a `--require` preload (QA harness in the scratchpad, not app code) that answers for `https://api.resend.com/` inside the process. It writes each message to a capture directory, and answers 422 when a `FAIL` flag file exists. **Nothing reached the network.**

Both processes were stopped afterwards.

---

## 1. BR / scenario → test → result

Files:
- **QA-I**: `tests/integration/candidate-confirmation-integrity-qa.test.ts` (new, 23 tests)
- **BE-I**: `tests/integration/candidate-confirmation-integrity.test.ts` (backend, 17 tests, re-run)
- **QA-E**: `tests/e2e/candidate-confirmation-integrity.spec.ts` (new, 8 tests)
- **MIG**: the real migration run (§3), with the scratchpad scripts `seed.cjs` and `assert.cjs`
- **N1-I** / **N1-Q** / **N1-E**: the N1 suites `duplicate-presentation.test.ts`, `duplicate-presentation-qa.test.ts` and `duplicate-presentation.spec.ts`

| Rule / scenario | Tests | Result |
|---|---|---|
| **BR-1** DB-only generation, ≥256-bit CSPRNG, no caller token/hash | BE-I "service role issues a 256-bit base64url token…". QA-I "the only token-shaped arguments left…": the source check shows submit inserts `null` and has no `digest` / `gen_random_bytes`; `p_token`/hash args exist only on get/respond, invitations and API keys; only rotate (sets null) and issue write `token_hash` | PASS |
| **BR-2** raw token only from a function anon/authenticated can't execute | QA-I "raw PostgREST…" covers anon key, user JWT, user JWT + secret apikey, GET and `Content-Profile: app`; all refused (403), nothing issued, no audit. QA-I "no role a recruiter can assume holds EXECUTE…": no EXECUTE for anon/authenticated/authenticator/PUBLIC; they aren't members of service_role/postgres; `SECURITY DEFINER`, `search_path=""`. BE-I scenario 3 | PASS |
| **BR-3** token never in ActionResult, redirect, notification, audit, response_meta, log, error or readable column; hash never exposed | QA-I "token_hash can't be selected, filtered, ordered, embedded or counted…": 7 probes plus `HEAD count=exact`, all refused, so there is no hash oracle. QA-I "anon RPCs never echo…". QA-I "full flow… DB-wide dump grep": `pg_dump --data-only` of the whole DB has no raw token; the rotated-out hash appears nowhere; each live hash appears exactly once, on its own request row; `pg_stat_statements` has neither. QA-E happy path: the token isn't in the recruiter URL or page HTML. QA-E log test, and §3 container-log grep | PASS |
| **BR-4** old signatures dropped, not overloaded; api-surface | QA-I "every dropped-signature call shape is PGRST202" (named, partial, full, anon, GET). N1-I replacement test. `api-surface.test.ts` green (issuance not allow-listed). MIG "old signatures gone" | PASS |
| **BR-5** issuance re-checks; each issuance replaces the earlier token | BE-I scenario 9. QA-I "two parallel issuances…": exactly one token, the others `token_already_issued`, one audit row (5 rounds × 3 parallel). QA-I "rotate racing issue…": 8 rounds; a returned token is either the live one or dead, never a second live link. QA-I "another org (or the hiring side)…": X, B and the platform admin are refused as actor and can't rotate. QA-I "suspended source org…" | PASS |
| **BR-6** respond needs `token_issued_at`; get never answers `pending` without it | BE-I "pre-N9 shape…". QA-I scenario 8 (in-transaction `get` → expired with no `candidate` / `fields`; accept and decline → `request_expired`). MIG K1/K2/K6 | PASS |
| **BR-7** migration expires unanswered pre-N9 requests; answered ones untouched | **MIG** (real pre-N9 DB, §3): 36/36 checks. QA-I scenario 8 statement test. QA-E "pre-N9 request after the migration…" | PASS |
| **BR-8** audit: issued (send number), resent, invalidated (actor null, `n9_token_reset`); `token_issued_at` in evidence and audit | QA-I "issuance audit holds only the send number…" (`[a,{send_number:1}]`, `[a2,{send_number:2}]`; resent `{}`; hiring side sees none; no notifications). MIG and QA-I scenario 8 (one invalidated row per request, the source org). BE-I scenario 4 (`token_issued_at` in the confirm audit). QA-E happy path (evidence `issued … sent …`) | PASS |
| **BR-9** N1 unchanged; `invalid_token` gone | N1-I and N1-Q, all green, 0 skipped. N1-Q "R2-1 under N9…" and "race under N9…". N1-I "N9: a p_token_hash call is refused before the database…" | PASS |
| **BR-10** 10/h resend limit inside rotate, counted once | BE-I scenario 2. QA-I "a rate-limited rotate changes nothing…": the live link survives, expiry is unchanged, 10 resent audits, the limit is per user. QA-I "refused rotates… don't burn the window" (D-1), and the action no longer calls `rateLimit(…candidate_resend…)`. **QA-E resend**: 9 direct + 1 UI resend succeed, the 11th direct one is `rate_limited`, so the action counts exactly once; the UI shows the rate-limit message and the live link survives | PASS |
| **BR-11** BR-7 requests not pending until resent; resend recomputes fingerprints without a stop check | QA-I "an invalidated request (post-migration shape) isn't pending…": `presentation_check` goes `pending` → `clear` → (resend) `pending`. N1-I PD-032 test. N1-Q scenario 48 tail | PASS |
| **BR-12** evidence notes an email change in the 30 days before issuance | BE-I BR-12 tests. QA-I "logs real changes only…" (same value, citext case-only and other columns aren't logged; creation isn't logged, D-8; prune >60 days on the next change). QA-I "a change before a resend counts…; a change after issuance isn't claimed; the boundary is 30 days" (29 days → dated, 31 days → nothing). QA-I "evidence never carries an address other than the destination" | PASS (see m-1, D-8) |
| BR-12 internal table `app.candidate_email_changes` | QA-I "is closed to every PostgREST role…": no grants to anon/authenticated/authenticator/PUBLIC, RLS on with 0 policies, trigger function not executable, sequence not usable, schema not exposed (`Accept-Profile: app` refused), columns `candidate_id, changed_at, id` only | PASS (m-1 fixed, §5) |
| **Sc 1** forgery refused (submit) | BE-I scenario 1, QA-I dropped-signature test, N1-I replacement | PASS |
| **Sc 2** forgery refused (resend) | BE-I scenario 2, QA-I replay test | PASS |
| **Sc 3** issuance not reachable | BE-I scenario 3, QA-I raw PostgREST and role tests, api-surface | PASS |
| **Sc 4** no hash leak | BE-I scenario 4, QA-I column probes and DB-wide dump grep | PASS |
| **Sc 5** happy path E2E; decline; `already_sent` | QA-E "happy path" (the token comes from the captured email; the candidate edits the headline and confirms; status `submitted`; evidence has issued/sent and `Candidate updated: headline.`). QA-E "decline path". N1-E "candidate page: already sent" (AC-69) | PASS |
| **Sc 6** resend | QA-E "resend…" (old link → "Invalid link" with no confirm button; new link confirms), QA-I replay, BR-10 rows | PASS |
| **Sc 7** crash between steps | QA-E "crash between the user RPC and issuance…" (issuance EXECUTE revoked from service_role for the submit): `?notSent=1`, flash, "has not been sent yet", no email, hash/issued/sent all null, `last_send_error=failed`; Resend issues and sends a working link | PASS (crash during a *resend*: m-2 fixed, §5) |
| **Sc 8** migration | **MIG** (real `db reset --version 20261113001100`, seed through the old RPCs, `supabase migration up`). QA-I statement test (the exact statement read from the migration file, run in a transaction with seed and asserts, then rolled back). QA-E recruiter view ("The link sent to … expired on …", "Resend to create a new one.", Resend recovers; old link "This link has expired", then "Invalid link" after the resend) | PASS |
| **Sc 9** issuance re-checks | BE-I scenario 9, QA-I actor and suspended-org tests | PASS |
| **Sc 10** N1 regression | N1-I and N1-Q (all green, 0 skipped), N1-E 7/7, QA-I BR-11 | PASS |
| **Sc 11** logs | QA-E log test: email sent and email failing (422); the server log has no `/candidate/…`, no token, no hash (≥6 tokens checked). The only email line is `[email] Resend rejected message 422 {…"Invalid \`to\` field."}`. Container logs (§3): 0 hits | PASS |
| **Sc 12** BR-12 | BE-I and QA-I BR-12 tests | PASS |

### N1 regression and retired tests (task 3)
- **Retired:** the three skipped R2-1 `invalid_token` tests. They are replaced with tests proving the oracle stays closed under the new flow:
  - `duplicate-presentation.test.ts` "N9: a p_token_hash call is refused before the database (no check, no hit); requests start with no hash": PGRST202, no presentation hit, 0 rate-limit hits; real submissions count once each and store no hash.
  - `duplicate-presentation-qa.test.ts` "R2-1 under N9: presented vs clear only differ by the gate outcome…": 30 alternating presented/clear attempts give `stopped` / `created` only, no raw error, 30 hits, then `rate_limited` for both kinds; 15 null-hash requests coexist.
  - `duplicate-presentation-qa.test.ts` "race under N9: parallel candidate submissions never raise after the gate…": 6 rounds of parallel submissions sharing one idempotency key. Outcomes are only `created` / `stopped` / `conflict`, there are no constraint names, exactly one referral per key, and both attempts are counted.
- **Backend's edits to my N1 helpers:**
  - Both `submitForCandidate` helpers now get the token from `issueCandidateToken(referralId, submitter)`, which is the real service-role path, and only when created.
  - The forged-args list still tests extra arguments (`p_fingerprints`, `p_client_key`), so it still gets PGRST202.
  - r2-m3 now expects `request_closed` on a declined request, and scenario 48 rotates then issues.
  - `createCandidate` / `createJob` now use unique email and client per call. Every test that needs a collision passes an explicit shared email.

  None of this weakens an assertion.

---

## 2. Bugs

| # | Severity | Owner | Bug |
|---|---|---|---|
| m-1 | minor | backend | **Fixed (§5).** **`app.candidate_email_changes` rows are not always pruned.** `docs/security-and-privacy.md:100` says "pruned after 60 days", but pruning only runs on the candidate's *next* email change (`app.on_candidate_email_change`, migration lines 44–51). Rows for a candidate whose email never changes again stay forever. **Repro:** `anonymize_candidate` sets `email = null`, which fires the trigger and *adds* a row; after erasure nothing ever prunes it (test: QA-I "BUG (minor, backend): anonymizing a candidate writes a change row that is never pruned", which asserts the current 2 rows). **Expected:** no rows after anonymization, and a scheduled prune, for example in `purge_presentation_data` / presentation maintenance. **Actual:** the rows stay. The rows hold only the candidate id and a timestamp, so this is low risk, but the privacy doc is inaccurate. |
| m-2 | minor | frontend | **Fixed (§5).** **A failed resend still shows the stale "sent" state with no live link.** Rotate kills the old link. If issuance or the send then fails, `sent_at` keeps the earlier value. The referral page (`src/app/workspace/[orgSlug]/referrals/[referralId]/page.tsx:219–225, 392`) shows "Email sent to {email} {time}. The link expires on {new date}.", and Resend isn't the primary action, even though no link exists. The toast does say "We couldn't email the candidate…" at the time. This behaviour predates N9 for send failures; N9 adds the issuance-failure route. **Repro:** QA-E "BUG (minor): a resend whose issuance fails still shows 'Email sent … expires on' with no live link". **Suggested fix:** treat `token_issued_at` null (already granted to the source org) as `awaitingNotSent` with Resend as primary. No copy change needed. |

### Observations (not N9 bugs)
- **O-1 (pre-existing, backend, for N3 disputes):** `record_candidate_request_delivery(p_referral, p_ok, p_error)` is granted to `authenticated`, and any source-org member can call it directly with `p_ok = true`. That sets `sent_at = now()` and the "sent …" time in the consent evidence, without any email. It can't forge a confirmation: `token_issued_at` stays server-set, and it is now in the evidence (BR-8). Treat "sent" in the evidence as recruiter-influenced; "issued" is authoritative.
- **O-2 (D-7, accepted):** an old pre-N9 link to an *answered* request still shows `confirmed` / `declined` on the page, but `respond_candidate_request` now raises `request_expired` instead of the idempotent answer. MIG confirms it. The page never calls respond in those states, so there is no user impact.
- **R-2:** the MIG run shows that a pre-N9 confirmation forged by the recruiter (they chose K3, then confirmed) survives the migration untouched, as designed. The hosted count is still **not checked** (backend.md §1). It's needed before `supabase db push`.

---

## 3. Commands run (real results)

All commands ran through `local-env.sh` (abbreviated `W`) unless noted.

| Command | Result |
|---|---|
| `W npm run lint` (before my changes) | exit 0 |
| `W npm run typecheck` (before) | exit 0 |
| `W npm test` (before) | 13 files, **105 passed** |
| `supabase db reset --local --version 20261113001100` | DB at `20261113001100` (pre-N9) |
| `W node seed.cjs` (old RPCs: submit/rotate with `p_token_hash`) | 6 referrals: pending, rotated, confirmed (**X-1 reproduced**: the recruiter-chosen K3 confirmed through anon `respond_candidate_request`), declined, already-expired, other-org pending; K1/K2/K6 `pending` before N9 |
| `supabase migration up --local` | `Applying migration 20261115000100_candidate_confirmation_integrity.sql... Local database is up to date.` |
| `W node assert.cjs` | **36/36 PASS, "ALL PASS"** (§1 BR-7/BR-8 row; includes byte-identical answered rows, referrals and consents, exactly 3 invalidated audits, Resend recovery) |
| `W npm run test:integration` (run 1, on the migrated DB) | 7 files, **199 passed**, 0 skipped (37.9 s) |
| `W npm run test:integration` (run 2, no reset in between) | 7 files, **199 passed**, 0 skipped (58.6 s) |
| `W env NEXT_PUBLIC_APP_URL=http://localhost:3100 RESEND_API_KEY=… npx next build` | exit 0 |
| `W npx playwright test tests/e2e/duplicate-presentation.spec.ts` (first server, without `SUPPORT_EMAIL`) | 1 failed: "stop…" timed out waiting for the "Contact Workatent support" link, because `SUPPORT_EMAIL` wasn't set on the server (environment, not N9). Re-run below |
| `W env E2E_BASE_URL=http://localhost:3100 QA_EMAIL_CAPTURE_DIR=… QA_SERVER_LOG=… npx playwright test tests/e2e/duplicate-presentation.spec.ts tests/e2e/candidate-confirmation-integrity.spec.ts` (server restarted with `SUPPORT_EMAIL`) | **15 passed** (37.3 s): N9 8/8, N1 7/7 |
| N9 spec alone, first server | 8 passed (20.1 s) |
| `docker logs --since 30m` for kong, rest, db and auth, grepped for the 8 captured tokens and their SHA-256 | 0 hits in every container |
| `grep -c candidate/` in the server and worker logs | 0 / 0 |
| `W npm run lint` (after) | exit 0. One warning in my new file (unused const), fixed; `eslint` on the 4 touched test files is then clean |
| `W npm run typecheck` / `W npx tsc --noEmit -p .` (after) | exit 0 / clean |
| `W npm test` (after) | **105 passed** |
| `W npx vitest run -c vitest.integration.config.mts` (the two N9 files, after the lint fix) | **40 passed** |

Not run:
- The full E2E suite. Only the N1 spec and the new N9 spec touch the candidate page or the candidate-email path; the other specs are unchanged by N9.
- pg_graphql: the extension isn't installed locally, so there is no GraphQL path to test.
- The hosted R-2 count: no hosted access, by rule.

## 4. Test files changed (tests only)
- `tests/integration/candidate-confirmation-integrity-qa.test.ts` (new)
- `tests/e2e/candidate-confirmation-integrity.spec.ts` (new). It is skipped unless `QA_EMAIL_CAPTURE_DIR` is set on a server running the email stand-in.
- `tests/integration/duplicate-presentation.test.ts` (retired 1 skipped R2-1 test, replaced)
- `tests/integration/duplicate-presentation-qa.test.ts` (retired 2 skipped R2-1 tests, replaced; dropped the unused `randomBytes` import)

---

## 5. Fix verification (round 2, 2026-11-15)

**Final verdict: PASS.** m-1 and m-2 are fixed. No open blocker, major or minor.

### m-1: change-log retention (backend, `20261115000200_email_change_retention.sql`)
- **Review:**
  - `app.on_candidate_email_change()` deletes all of a candidate's rows and inserts none when `new.anonymized_at is not null`. `anonymize_candidate` sets `anonymized_at` and `email = null` in one UPDATE, so the trigger fires with the new row.
  - `purge_presentation_data()` deletes rows older than 60 days and returns `email_changes`. Its grants are still service_role only.
  - The migration cleans up existing rows once.
  - The BR-12 evidence query is unchanged, and so is the 30-day window.
- **Backend's change to my test:** the BUG test is renamed "m-1 fixed: anonymizing a candidate leaves no change rows" and now expects `0` instead of the buggy `2`. The setup is unchanged: a real email change first, so a row exists before anonymizing; then the real `anonymize_candidate` RPC as the org admin. **This is correct and nothing is weakened.** It asserts the fixed behaviour on the same path that exposed the bug. All my other BR-12 tests are untouched and pass, including "prune >60 days on the next change", the 29/31-day boundary, and table privileges.
- **Backend's new tests** (in `candidate-confirmation-integrity.test.ts`) pass:
  - anonymization leaves 0 rows;
  - the purge drops a 61-day row and keeps a 59-day row;
  - `runPresentationMaintenance` prunes;
  - `purge_presentation_data` is refused for anon and authenticated.
- **Observation O-3 (not a bug):** a candidate whose email is *already null* when anonymized keeps an earlier change row until the 60-day sweep removes it. The trigger only fires on an email change. I checked this with psql in a transaction that I rolled back: after anonymize, 1 row was left. The row holds only dates, and the sweep removes it within 60 days. If wanted, the trigger could also fire on `anonymized_at`, like `candidates_anonymized_fingerprints`.

### m-2: stale "sent" state after a failed resend (frontend, referral page)
- **Review:** the page now selects `token_issued_at`. `requestNotSent = !sent_at || !token_issued_at` gives `awaitingNotSent`, and `ResendCandidateButton primary={!request || requestNotSent || isPast(expires_at)}`. The expired check still runs first, so BR-7 requests still show "expired, resend". No copy change.
- **E2E:** the repro is now a passing test, "m-2 fixed: a resend whose issuance fails shows 'not sent yet' with Resend as the primary action; Resend recovers". After the failed resend:
  - in the DB, `sent_at` is set and `token_issued_at` is null;
  - the page shows "The email to {email} has not been sent yet." and no longer shows "Email sent to …";
  - Resend uses the primary variant (`bg-primary`);
  - the old link shows "Invalid link".
  
  Clicking Resend then sends a new email. The page goes back to "Email sent to …" with Resend secondary, and the new link shows the confirm button.

### Commands (round 2, all through `local-env.sh`)
| Command | Result |
|---|---|
| `npm run lint` | exit 0, no warnings |
| `npm run typecheck` | exit 0 |
| `npm test` | 13 files, **105 passed** |
| `npm run test:integration` (DB at `20261115000200`) | 7 files, **202 passed**, 0 skipped (44.0 s) |
| `next build` (`NEXT_PUBLIC_APP_URL=http://localhost:3100`, `RESEND_API_KEY` stand-in) | exit 0 |
| `next start -p 3100` (with `SUPPORT_EMAIL=support@example.test` and the email-capture preload) + `npm run worker`; `playwright test candidate-confirmation-integrity.spec.ts duplicate-presentation.spec.ts` | **15 passed** (33.9 s): N9 8/8, N1 7/7 |
| `grep -c candidate/` in the server and worker logs | 0 / 0 |
| Issuance EXECUTE for service_role after the crash tests | restored (`t`) |

Both processes were stopped afterwards. Port 3000, `.env.local` and the hosted project were not touched.

Still open, outside QA: **D-8** (PM confirmation) and the **R-2** hosted count before `supabase db push`.
