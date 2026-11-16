# Brief: Candidate-confirmation integrity (N9)

Owner: Product Manager · Date: 2026-11-15 · Roadmap item: **N9** ([`roadmap.md`](../../product/roadmap.md)) · Status: **accepted** 2026-11-15 ([`acceptance.md`](./acceptance.md), PD-041 to PD-043)

Decision trail: PD-035 (N9 created), PD-038 to PD-040 ([`decisions.md`](../../product/decisions.md)); RD-003, RD-004 ([strategy decisions](../../strategy/decisions.md)). Source: QA X-1 in [`duplicate-prior-presentation/qa-report.md`](../duplicate-prior-presentation/qa-report.md).

## 1. Problem

The candidate confirms a referral through a private link. Today the **caller** chooses that link's token:

- `submit_referral_for_candidate(..., p_token_hash, ...)` and `rotate_candidate_request_token(p_referral, p_token_hash, ...)` (current versions in `20261113001100_qa_round2.sql`) store whatever hash they receive. Both are granted to `authenticated`.
- `newCandidateToken()` in `src/features/referrals/candidate-request.ts` generates the token in the Server Action. But nothing stops a recruiter calling PostgREST directly: they pick a token, send its SHA-256, then call `respond_candidate_request(p_token)` (granted to `anon`) and confirm "as the candidate".

What that forgery produces:

- a `job_sharing` consent whose evidence says "Candidate confirmed through the private link emailed to …";
- automatic delivery to the hiring partner;
- under N1, **first position** against other agencies, because RD-003 counts candidate confirmation as "presented";
- under N3, fee entitlement.

The rest of N1 still holds, because the delivery re-check runs at confirmation.

**What fixing it needs.** Moving token generation into the RPC and returning the raw token to the caller fixes nothing: the recruiter *is* the caller (`authenticated`). So the raw token must never be returned to any role a recruiter's session can use.

## 2. Scope

### Must
1. Token generated **in the database**. The raw token goes to the Next server only through a **service-role-only** path, and from there only into the candidate's email. The `p_token_hash` parameter is removed from both public RPCs.
2. The resend follows the same rule.
3. Every pending request created before this change is invalidated, and the recruiter resends from the existing UI.
4. Audit for issuance and invalidation, with no token or hash in any audit, log or response.
5. The N1 interplay is kept intact (§4 BR-9 to BR-11).
6. The candidate page, the candidate's confirm and decline actions, the recruiter's referral page and the Resend button keep working, with no UI or copy change.
7. Integration and E2E helpers that forge tokens are rewritten to get a real server-issued token through the service-role path.

### Should
8. The consent evidence states whether the candidate's email address changed in the 30 days before the link was issued (input for disputes; see R-1).

### Won't (this release)
- Stopping a recruiter who sets the candidate's email to a mailbox they control (R-1). That's a separate route with a domain question (PD-040).
- Moving email sending to the worker queue or an outbox. Sending stays synchronous so the "not sent" state on the referral page doesn't change.
- SMS channel, a different TTL, or changes to the candidate page.
- Changes to the manual path (`submit_referral` with recorded authorization). It's labelled as recruiter-recorded, so it makes no claim to come from the candidate.

## 3. Recommended design (backend may deviate only if every BR still holds; record it in `backend.md`)

- **`submit_referral_for_candidate`** (user session, signature without `p_token_hash`) creates the referral and the request with **no usable token** (`token_hash` null, `token_issued_at` null).
- **`rotate_candidate_request_token(p_referral, p_ttl_days)`** (user session, without `p_token_hash`) does the authorization and state checks it does today:
  - consumes the resend rate limit;
  - nulls the current hash, so the old link dies immediately;
  - recomputes fingerprints (PD-032);
  - audits.
- **`issue_candidate_request_token(p_referral, p_actor)`**, new and revoked from `public`, `anon` and `authenticated`:
  - re-checks that `p_actor` is a member of the source org, the referral is `awaiting_candidate` and the request currently has no token;
  - generates 32 random bytes in the database (`extensions.gen_random_bytes`), encoded base64url (43 characters, the same format the page and the action validator accept);
  - stores the SHA-256 hash and sets `token_issued_at` and `token_issued_by`;
  - audits;
  - returns the raw token once.
- **Server Actions** (`submitReferral`, `resendCandidateRequest`):
  - call the user-session RPC first;
  - on success, call the issuance RPC with the admin client, passing `ctx.user.id`;
  - pass the token to `emailCandidateRequest`.
  
  `newCandidateToken()` is deleted. `docs/architecture.md` adds this as an allowed service-role use.

A crash between the two calls leaves a request with no token, and `sent_at` stays null. The page then shows "not sent yet" with Resend as the primary action, which is today's behaviour.

## 4. Business rules

- **BR-1** Only the database generates candidate-request tokens (at least 256 bits from a CSPRNG). No RPC accepts a token or token hash from its caller.
- **BR-2** The raw token is returned only by a function that `anon` and `authenticated` can't execute. The only caller is the Next server, which puts it only in the candidate email's URL.
- **BR-3** The raw token never appears in: an `ActionResult`, a redirect or `revalidatePath` URL on the recruiter side, a notification, an audit or `response_meta` payload, a server log or error message, or any column readable by `authenticated`. The token hash is never exposed either.
- **BR-4** The old public signatures that take `p_token_hash` are **dropped**, not overloaded, so PostgREST can't call them. `api-surface.test.ts` reflects the new surface.
- **BR-5** Issuing a token requires the actor to be a member of the source org, the referral to be `awaiting_candidate`, and the request to have no live token. Each issuance replaces any earlier token, and the earlier link stops working at once.
- **BR-6** `respond_candidate_request` accepts only a token whose request has `token_issued_at` set. Without one it raises `request_expired`. `get_candidate_request` never returns `pending` for such a request: it falls through to the existing non-pending states (expired after BR-7), which carry no profile data.
- **BR-7** The migration ends every pending request created before N9 (`awaiting_candidate`, not answered): `expires_at = now()`, `token_issued_at` stays null. The candidate's old link shows the existing "This link has expired" state. The recruiter sees the existing "expired, resend" state with Resend as the primary action. Answered requests are untouched.
- **BR-8** Audit events (actor, referral; never the token or hash):
  - `referral.candidate_request_issued`, with the send number;
  - `referral.candidate_request_resent`, as today;
  - `referral.candidate_request_invalidated`, one per request the migration expires, actor null, reason `n9_token_reset`.
  
  The confirmation's consent evidence and audit include `token_issued_at`.
- **BR-9** N1 is unchanged: the 30/h `referral.submit` limit is consumed first inside `submit_referral_for_candidate`; the submission gate, fingerprints, `already_sent` and the delivery re-check at confirmation all stay as they are. The `invalid_token` outcome and error go away, because no caller-supplied hash exists to validate. The Server Action's generic outcome handling stays.
- **BR-10** The resend limit (`referral.candidate_resend`, 10/h per user) is enforced **inside** `rotate_candidate_request_token`, so direct calls count too. It's counted once per resend, not again in the action.
- **BR-11** Per PD-032, requests expired by BR-7 are not pending for the N1 check until resent. A resend recomputes their fingerprints and runs no stop check.
- **BR-12** The Should item: the consent evidence adds "Candidate email changed on {date}" when the candidate's email changed in the 30 days before `token_issued_at`. It's backend-generated evidence text, as today, not UI copy.

## 5. Constraints

- **Security and trust:** hard constraints (PD-035). Deny by default: the issuance RPC lives in a schema or grant set that PostgREST roles can't execute. `search_path = ''`, `SECURITY DEFINER`.
- **Privacy:** the only new stored data is `token_issued_at` and `token_issued_by`, both readable by the source org. The hash column stays ungranted.
- **Email:** `emailCandidateRequest` must not log the message or URL. Today `sendEmail` logs only Resend's status and error body; keep it that way. The email provider holding the link in its sent-mail log is accepted, because only the platform operator can see it.
- **Hosting:** the candidate URL appears in platform request logs, which are operator-only and accepted. `referrer: no-referrer` and `noindex` stay on the candidate page.
- **i18n / accessibility:** no new or changed strings, no UI change. The `invalid_token` comment in `actions.ts` is updated.
- **Migrations:** apply locally (`npm run db:reset`, `npm run db:types`). Hosted `supabase db push` only when the user asks.

## 6. Risks and open questions

| # | Risk / question | Owner | Handling |
|---|---|---|---|
| R-1 | **Recruiter-controlled destination (X-2).** The recruiter edits the candidate record, so they can set its email to a mailbox they control and receive a genuine server-issued link. N9 doesn't close this route. | strategist → PM | Out of N9 (PD-040). Strategist question before N3 brief: see §9. BR-12 makes it visible in evidence |
| R-2 | Confirmed referrals created before N9 can't be proven genuine | backend, user | Backend reports the count in `backend.md` (local; and hosted if pushed). Pre-launch, so these are test data. If the hosted DB holds any real ones at push time: **Needs user decision** (recommend leaving them and noting them in the audit log) |
| R-3 | A crash between the user RPC and issuance leaves a request with no token | backend | Covered by the existing "not sent yet" state and Resend (§3). QA scenario 7 |
| R-4 | Admin client misuse: issuance called for the wrong actor or referral | backend, QA | BR-5 re-checks inside the RPC. Server derives the actor from the session only |
| R-5 | Tests that forge tokens break | QA | Expected. Rewrite helpers on the service-role path (Must 7). Retire the R2-1 `invalid_token` tests |
| R-6 | Pending requests on hosted lose N1 pending status until resent (BR-11) | user (push timing) | Accepted pre-launch. Recruiters resend from the existing UI |

## 7. QA scenarios

1. **Forgery refused (submit).** A recruiter calls `submit_referral_for_candidate` directly with `p_token_hash` and gets a PostgREST "function not found" error. With the new signature it succeeds, but no response field contains a token or hash.
2. **Forgery refused (resend).** A direct `rotate_candidate_request_token` call with `p_token_hash` gets "function not found". With the new signature the old link dies, and nothing is returned except the destination.
3. **Issuance not reachable.** `issue_candidate_request_token` called as `anon` and as `authenticated` (own referral) is refused. `api-surface.test.ts` passes.
4. **No hash leak.** A recruiter's session can't read `token_hash` (column select is refused), and no audit, notification or `response_meta` row contains the token or hash (grep the DB after a full flow).
5. **Happy path E2E.** The recruiter submits by candidate email. The token comes from the captured email (or the service-role helper). The candidate views, edits and confirms, and the referral is delivered. The decline path is also covered. `already_sent` (N1 EC-1) still renders.
6. **Resend.** The old link shows the expired or invalid state and can't respond. The new link works. The 11th resend in an hour is refused, including by direct RPC calls (BR-10), and each resend counts once.
7. **Crash between steps.** Submit with issuance forced to fail. The request has no token, the page shows "not sent yet", and Resend issues and sends.
8. **Migration.** Seed a pre-N9 pending request with a known token, then migrate:
   - `get_candidate_request` returns `expired`;
   - `respond_candidate_request` refuses;
   - the recruiter page shows "expired, resend";
   - one `referral.candidate_request_invalidated` audit row exists.
   
   Confirmed and declined requests are unchanged.
9. **Issuance re-checks.** The service-role call is refused for: a non-member actor, a referral not in `awaiting_candidate`, and a request that already holds a live token without a rotate first.
10. **N1 regression.** The `referral.submit` 30/h limit is consumed first. Gate outcomes (`stopped`, `pending_warning`, `identifier_required`) are unchanged. An expired pending request doesn't block a competitor, and after a resend it does again (PD-032).
11. **Logs.** In a full flow with email configured and with email failing, server output contains no `/candidate/` URL or token.
12. **BR-12 (if built).** Change the candidate email, then submit: the evidence carries the change date. An email changed more than 30 days earlier adds nothing.

## 8. Team plan

| Step | Agent | Delivers | Blocks |
|---|---|---|---|
| 1 | **backend-engineer** | Migration (drop old signatures; new user-session RPCs; service-role issuance RPC; `token_hash` nullable; `token_issued_at` / `token_issued_by`; BR-6 check; BR-7 invalidation with BR-8 audit; BR-10 limit; BR-12 if built). Server Action changes in `actions.ts` and `candidate-request.ts`. `api-surface.test.ts` allow-list. `docs/architecture.md` service-role entry. `docs/security-and-privacy.md` note. Regenerated types. Its own integration tests for scenarios 1–4 and 9. `backend.md` with the exact contract, the R-2 count and any deviation from §3. `lint`, `typecheck`, `test` and `test:integration` green | Step 2 |
| 2 | **qa-engineer** | Rewrite the forging helpers in `tests/integration/duplicate-presentation*.test.ts` and `tests/e2e/duplicate-presentation.spec.ts`. Retire the R2-1 `invalid_token` tests. Run scenarios 1–12, plus the N1 candidate-path regression. `qa-report.md` with PASS/FAIL per BR and scenario and real command output | Acceptance |

These steps run in sequence: QA needs the new contract. Not needed for N9:

- **product-designer** and **ux-writer-marketing:** no screen, state or string changes. BR-7 reuses the existing expired states (`candidate.states.expired`, `referrals.detail.next.awaitingExpired`).
- **frontend-engineer:** the Server Action changes are backend-owned, and no component changes.

If backend finds a user-facing change is unavoidable, it stops and reports to PM before building.

**Definition of done:** every BR and scenario passes in `qa-report.md`; no open blocker or major; `backend.md`, `architecture.md` and `security-and-privacy.md` updated; PM acceptance in `acceptance.md`.

## 9. Question for recruitment-strategist (before the N3 brief, not blocking N9)

- **Q-1 (R-1):** A candidate confirmation is only as good as the email address the recruiter entered. For first position and fee entitlement, should a confirmation count when the candidate's email was added or changed shortly before the request? If not, what window applies, and what should happen instead (count as recruiter-recorded authorization, flag for the hiring side, or nothing)? Is there market practice for verifying right-to-represent beyond "the candidate replied"?
- **Q-1 addendum (PD-042, at acceptance):** treat a candidate **record created** shortly before the request the same way as an email change? BR-12 evidence covers only email updates (D-8); the creation date is stored (`candidates.created_at`) but not in the evidence.
