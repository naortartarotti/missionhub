# Security & privacy

> Draft engineering notes — **not legal advice**. Items marked ⚖️ require review by Canadian counsel.

## Tenant isolation (tested in `tests/integration`)
- RLS on every table; helpers `app.is_member/has_role` ignore suspended orgs and memberships.
- No cross-tenant policy on candidates/jobs/consents/documents. Raw `matches` and `background_jobs` have no policies.
- Job owners never receive a candidate id: the link lives in `referral_candidate_links` (source-only). They read an immutable snapshot of approved fields only.
- IDOR: ids in URLs are always re-resolved through RLS-scoped queries; RPCs re-check membership and side.
- Demo and real organizations can never be paired (DB trigger).

## API surface

The browser never calls Supabase directly. Every read happens in Server Components, and every write goes through a Server Action and then an RLS-checked query or a `SECURITY DEFINER` RPC. Even so, three surfaces are public and are hardened as such:

| Surface | Who can reach it | Controls |
|---|---|---|
| **Server Actions** (`src/features/*/actions.ts`) | Anyone, as a POST with arbitrary arguments, including `.bind()` arguments, which Next.js does **not** encrypt | Every body runs inside `guard()` (`src/server/actions/guard.ts`): tenant resolved from the session, `assertCan` permission check, Zod validation of every argument, safe error mapping (no stack traces or raw DB errors), and a per-user rate limit on sensitive actions. Next.js rejects cross-origin action calls (Origin vs Host check). |
| **PostgREST** (`/rest/v1`) | Anyone with the publishable key, plus a user's own JWT | `anon` has no table, sequence or function privileges. `authenticated` keeps only the privileges an RLS policy uses; tables fed by RPCs or the worker (`matches`, `background_jobs`, `audit_events` writes, etc.) are not writable at all. Internal `app.*` helpers are not executable except the RLS predicates. Default privileges keep new objects closed. |
| **Route handlers** (`/auth/callback`, `/auth/confirm`) | Anyone | Only exchange Supabase codes or OTPs; `next` is restricted to same-site relative paths (`safeNext`). |

`tests/integration/api-surface.test.ts` discovers every exposed table and RPC from PostgREST's own OpenAPI document. It asserts that `anon` can do nothing, and that a signed-in user can call only the allow-listed RPCs. A new table or function that ships with open grants fails CI.

**Rate limits** (per user, fixed window, stored in Postgres via `consume_rate_limit`, so they hold across instances):

| Bucket | Limit |
|---|---|
| Creating organizations | 5/h |
| Invitations | 30/h |
| Accepting invitations | 10 per 10 min |
| Referral submissions | 30/h |
| Referral messages | 60 per 10 min |
| Resume uploads | 30/h |
| CSV import | 10 commits/h, 30 previews/h |
| Document download links | 120 per 10 min |
| Job creation | 60/h |
| Requirement suggestions | 60/h |
| Disputes | 5/h |

Sign-in, sign-up and password-reset limits are enforced per IP by Supabase Auth (`[auth.rate_limit]`).

**Headers.** A per-request nonce CSP is set in `src/proxy.ts`: `script-src 'nonce-…' 'strict-dynamic'`, no `unsafe-eval` in production, `frame-ancestors 'none'`, `form-action 'self'`, and `connect-src 'self'`. Styles allow `'unsafe-inline'` because Radix and sonner set style attributes. The app also sends HSTS, COOP, X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy.

**Body limits.** Server Actions and the proxy buffer accept up to 12 MB, and each action enforces its own cap (resume uploads 10 MB, CSV 2 MB).

**Test guard.** Integration tests, E2E tests and the demo seed refuse to run unless `NEXT_PUBLIC_SUPABASE_URL` is a local stack (`tests/support/assert-local-supabase.ts`).

## Documents
- Private buckets; paths `{org}/{candidate}/{uuid}.ext`; storage RLS checks org membership and candidate ownership.
- Uploads: MIME/size allow-list, SHA-256, server-side signature check (PDF/ZIP magic), active-content heuristics, `scan_status` gate before sharing. ⚠️ Not a full AV — plug a ClamAV/commercial scanner into `scanDocument`.
- Referral documents are **copied** into a separate bucket; target access via 60-second signed URLs issued only after `authorize_referral_document` (audited). Revocation removes access and purges copies.

## Consent / authorization ⚖️
- Processing authorization required before matching; job- and recipient-specific sharing authorization required before submission. Upload ≠ permission to share.
- Records: legal basis, scope, evidence, dates, revocation (append-only). Revocation cuts partner access immediately.
- Data-subject requests logged with 30-day due dates; deletion via irreversible anonymization that preserves financial/audit history.

## Matching fairness
Engine input type excludes names, contact details, photos and protected characteristics (unit-tested). Scores are labelled indicative; humans decide. Language requirements are used only when the job lists them as required — review for proxy effects.

## Finance
Commission ledger: records verified external events. Ledger rows immutable; corrections are compensating entries. Recorder can never verify their own evidence; client payments verified by platform admins, payouts by the receiving recruiter. Idempotency keys on submissions, evidence and ledger entries.

**Wallet (ADR 0005).** Funds are held by the payment provider; wallet balances are an internal double-entry ledger of each organization's claim. Controls enforced in Postgres: zero-sum transactions (deferred constraint trigger), immutable entries, non-negative organization balances (check constraint), balance changes only inside `app.wallet_post` (guard trigger; no table write grants for `authenticated` *or* `service_role`), account locks taken in a fixed order, idempotency keys namespaced per sender. Members can read their organization's wallet; only org admins can move money; recipients are limited to organizations already linked by a referral. Platform admins can freeze outgoing movements. Transfers are disabled platform-wide until MFA, limits and legal review land. `wallet_reconcile()` must return no rows.

**Payments (Stripe).** The webhook authenticates the sender by HMAC over the raw body with a 5-minute replay window, stores a minimized event (ids, amounts, status, our own metadata; no customer details) exactly once, and queues it; money moves only in the worker through service-role RPCs that are idempotent per charge / cash-out. The client is never trusted about payment success: the return URL only shows a notice. Amounts are computed in the database from the commission ledger, never taken from the request. Requests to the provider carry opaque ids and amounts only. Identity and bank details are collected by the provider's hosted onboarding and never touch our database. Provider calls use idempotency keys derived from our ids, so retries cannot double-charge or double-pay. Withdrawals are org-admin only, rate limited, blocked for frozen wallets and off platform-wide by default. **Not yet built:** MFA step-up for withdrawals, per-organization limits, four-eyes approval for large amounts, automatic ledger reversal for refunds/chargebacks, reconciliation against the provider balance.

## Platform admins
No RLS access to candidate data. Exceptional PII access must be an out-of-band, approved and logged procedure (not implemented in-app).

## Other controls
Security headers (`next.config.ts`), same-origin redirect guard, generic auth errors, Zod everywhere, CSV formula-injection guard, privacy-aware logs (ids/timings only), secrets only in env (`.env.example`).

## Open items ⚖️
PIPEDA / Alberta PIPA / Québec Law 25 applicability, cross-border transfers (AI/email vendors — resumes and postings go to OpenAI when `OPENAI_API_KEY` is set, see `docs/ai.md`), CASL, candidate ownership & prior-presentation rules, exclusivity, replacement guarantees, sales tax (GST/HST/QST), invoicing, KYC, payout regulation, chargebacks. Use a Canadian Supabase region (`ca-central-1`). Rate limiting is currently Supabase Auth's built-in only; add app-level limits (e.g. Upstash) before launch.
