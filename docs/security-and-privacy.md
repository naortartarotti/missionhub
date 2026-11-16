# Security & privacy

> Draft engineering notes — **not legal advice**. Items marked ⚖️ require review by Canadian counsel.

## Tenant isolation (tested in `tests/integration`)
- RLS on every table; helpers `app.is_member/has_role` ignore suspended orgs and memberships.
- No cross-tenant policy on candidates/jobs/consents/documents. Raw `matches` and `background_jobs` have no policies.
- Job owners never receive a candidate id: the link lives in `referral_candidate_links` (source-only). They read an immutable snapshot of approved fields only.
- IDOR: ids in URLs are always re-resolved through RLS-scoped queries; RPCs re-check membership and side.
- Demo and real organizations can never be paired (DB trigger).

## Record scope inside an agency (RD-036)
- A plain `recruiter` sees only their own records; `org_admin` and `recruiter_manager` see the whole agency (`app.sees_all(org)`).
- **Candidates** and everything hanging off them (experiences, documents, consents, referral links and candidate requests, connector mappings, `candidate-documents` / `candidate-photos` objects, opportunities): `candidates.owner_id = auth.uid()`. Recruiters can't create a candidate for, or hand one to, a colleague.
- **Jobs:** readable by every member; insert/update by the owner or a manager.
- **Referrals:** sourcing side = owner of the referral's candidate (`app.sees_referral_as_source`), hiring side = owner of the target job (`app.sees_referral_as_target`). Messages, events, grants, shared profiles and agreements follow `app.can_see_referral`.
- **Placements, ledger, invoices, payment evidence, placement disputes:** follow the referral (`app.can_see_placement`).
- **Definer functions:** every `SECURITY DEFINER` RPC that acts for the caller on candidates, referrals, matches or placements applies the same helpers (audit in `docs/specs/recruiter-record-scope/backend.md`).
- **Notifications:** `app.notify_org` derives the record from the link (`/referrals/{id}`, `/commissions/{placement}`) and delivers only to members who can see it (owner + managers).
- **Departed owner:** records stay owned by the suspended member; only managers see them until an org admin runs `transfer_member_portfolio`.
- Not scoped by owner: duplicate / prior-presentation checks at submission (org-wide by design, outcome only), job match counts (`get_job_match_summary`, anonymized counts), the public API (`/api/v1`, org-level keys issued by managers), audit log and privacy requests (managers only already).

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
| Disputes (placement disputes and prior-presentation contests; contests enforced in the RPC) | 5/h |
| Referral submissions, also enforced inside both submit RPCs (direct PostgREST calls included) | 30/h |
| Prior-presentation objections (claims), enforced in the RPC | 10/h |
| Claim evidence uploads (action + trigger on the committed `storage.objects` insert, so direct Storage uploads count) | 30/h |
| Candidate-request resends (`referral.candidate_resend`), enforced inside `rotate_candidate_request_token` (direct PostgREST calls included, counted once per resend; N9) | 10/h |
| Publishing job terms or opening/closing a job to partners (`job.terms`), enforced inside `save_job_terms` (N2) | 60/h |
| Concierge terms amendments (`admin.amend`, platform admins), enforced inside `admin_amend_referral_terms` (N2) | 30/h |
| `terms_changed` submissions count toward the 30/h referral-submission limit (N2) | — |

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
Commission ledger: records verified external events. Ledger rows immutable; corrections are compensating entries. Recorder can never verify their own evidence; client payments verified by platform admins, payouts by the receiving recruiter. Idempotency keys on submissions, evidence and ledger entries. N2: placement fee facts (C, I, base, bonus, reason, note, currency, guarantee end, terms version) are immutable for every role; evidence amounts and allocations are bounded at 10^12 minor units and fail with a mapped code, never a raw overflow.

## Platform admins
No RLS access to candidate data. Exceptional PII access must be an out-of-band, approved and logged procedure (not implemented in-app).

**Two narrow, audited, dispute-scoped exceptions (N1, PD-024).** Both apply only to a claim that has a referral-level dispute (open or resolved), both are server-checked (`app.is_platform_admin()` + the dispute link), and both must be listed in the N7 PIA ⚖️:
1. **Evidence file download.** `authorize_claim_evidence` (then a 60-second signed URL) for files of a disputed claim, after a passed scan. Evidence can contain candidate, client and third-party data. Each download writes `claim_evidence.accessed` (admin, dispute id, file id). Undisputed claims: refused.
2. **"Same person" signal.** `compare_dispute_contacts(dispute)` for referral-evidence disputes only: compares the two referrals' stored fingerprints in the database and returns `match` / `no_match` / `not_available` per channel (email, phone, LinkedIn). No values or hashes leave the database. Each call writes `dispute.contacts_compared` (admin, dispute id). The admin dispute view (`get_referral_dispute`) shows no candidate name or label.

## Duplicate and prior-presentation protection (N1)
- **Fingerprints** (pseudonymous personal information ⚖️): HMAC-SHA256 of the normalised email, phone (E.164) and LinkedIn URL, per referral, in `app.referral_fingerprints` (non-exposed schema, RLS on, no grants). Computed **only in the database** from the stored candidate row by `SECURITY DEFINER` functions; no RPC accepts hashes or normalised identifiers. Never returned, logged or put in audit metadata.
- **Key**: generated into **Supabase Vault** by migration (`presentation_fingerprint_key_v1`), one per environment. No env var, no `.env.example` entry, never in the app or a log. Read only by `app.*` functions revoked from `public`/`anon`/`authenticated`. Rotation only on suspected compromise: service-role `rotate_fingerprint_key()` recomputes from current identifiers (`key_version` on every row).
- **Client key** (normalised client name, may be confidential): `app.job_client_keys` (trigger-maintained on every job write) and the per-referral snapshot in `app.referral_presentations`. Never on `jobs` or `referrals`, never returned to members.
- **Sticky stops** (`app.sticky_stops`): ids + client key only, 30 days, purged by the worker.
- **Hit log** (`app.presentation_hits`): admin-only; job id, scope, outcome and the PD-022 "earlier referral was internal" boolean; no identifiers. Member-visible audit events (`referral.submission_stopped`, `referral.pending_warning`, `referral.identifier_required`, `referral.closed_already_presented`) carry empty metadata; the scope goes only to platform-level events (`organization_id` null).
- **Release flag** lives in `app.referral_presentations` and is returned only to the sourcing side (`get_referral_presentation`) and admins. The hiring side's `referrals` select has no release column.
- **Evidence bucket** `claim-evidence`: private, separate from candidate documents, PDF/PNG/JPEG ≤ 10 MB, insert policy for members of the hiring org on `{org}/{referral}/{uuid}.{ext}` while the referral is claimable, no select policy. SHA-256 computed by the worker from the stored object and frozen (trigger). Reads: 60-second signed URLs after `authorize_claim_evidence` (claiming org; admins per the exception above), audited. Files uploaded but never filed, and objects uploaded but never registered, are deleted after 24 h. The PDF heuristic runs in an isolated worker thread. The parent enforces a 3-second wall-clock timeout and memory limits, and terminates the thread on expiry. Timeout, crash or out-of-memory means the file is rejected. Inside the thread, the scan is a single linear pass with a 2-second budget checked in every loop.
  - **What it inspects:** the whole file plus every decoded stream (Flate, ASCIIHex, ASCII85, chained), with name escapes decoded.
  - **Fail closed:** it rejects files that are encrypted, use unknown or undecodable filters, put object streams under image codecs, lack an `endstream`, use an indirect `/Filter` or `/DecodeParms`, have an ambiguous `stream` keyword, or have data shorter than a direct `/Length`. It also rejects files that exceed the size or time budget. With a direct `/Length`, an `endstream` inside the data is just data.
  - It is still not a full AV. The sourcing side never gets names, types, sizes or URLs.
- **Contest reason**: readable by platform admins and the contesting org only (disputes RLS); no read path for the hiring side.
- **Retention (BR-21, O-1 pending ⚖️)**: fingerprints are purged when the ownership window has passed and no dispute is open; anonymising a candidate deletes its fingerprints on referrals without an open dispute. Evidence files are **not** deleted automatically until O-1 is answered.
- **Accepted residuals (rev. 4.2):**
  - **R-18:** the hiring side can infer that an earlier referral was released only if the release happened before a later referral's delivery. In that case the earlier one is not offered as evidence against the later one (PD-029). A release after that delivery changes nothing the hiring side can see.
  - **R-19:** a client-scope stop lets the stopped org's own earlier submitter infer that two of the hiring org's jobs share a client. This happens when that org already presented the person to one job and is stopped on another (BR-3b with BR-9).
- **Probing (A-1)**: the check runs only inside a real submission (30/h), every hit is logged, abuse flags on the admin page (BR-29). No standalone check endpoint.

## Candidate-confirmation links (N9)
The candidate confirms a referral through a private link (`/candidate/{token}`); the token is the only credential. Before N9 the caller chose the token, so a recruiter could confirm "as the candidate" (QA X-1). Now (`docs/specs/candidate-confirmation-integrity/backend.md`, PD-038):
- **Only the database creates tokens**: 32 bytes from `extensions.gen_random_bytes`, base64url (43 chars). No RPC accepts a token or token hash; the old `p_token_hash` signatures are dropped.
- **Only `service_role` receives a token**: `issue_candidate_request_token(p_referral, p_actor)` is revoked from `public`, `anon` and `authenticated` and also refuses any request carrying a user JWT. The Server Action calls it with the admin client after the user's own `submit_referral_for_candidate` / `rotate_candidate_request_token` succeeded, passes the session user as actor (re-checked: active member of the source org, referral `awaiting_candidate`, no live token), and puts the token only in the candidate email's URL.
- **Never exposed**: the raw token is not in any action result, recruiter-side redirect, notification, audit or `response_meta` payload, log or error. `token_hash` has no column grant; `token_issued_at` / `token_issued_by` are readable by the source org.
- **Only server-issued tokens answer**: `respond_candidate_request` refuses (`request_expired`) and `get_candidate_request` never returns `pending` unless `token_issued_at` is set. Unanswered pre-N9 requests were expired by the migration and audited (`referral.candidate_request_invalidated`, reason `n9_token_reset`).
- **Audit**: `referral.candidate_request_issued` (actor, `send_number`), `referral.candidate_request_resent`; the confirmation's consent evidence and audit carry `token_issued_at`.
- **Email-change evidence (BR-12)**: `app.candidate_email_changes` keeps only the candidate id and the change time (no addresses), in the non-exposed schema with RLS on and no grants. Rows older than 60 days are deleted by the 10-minute maintenance sweep (`purge_presentation_data`) and on the candidate's next email change; anonymising a candidate deletes all of its rows. The consent evidence says "Candidate email changed on {date}" when it changed in the 30 days before issuance.
- **Accepted residuals**: the link sits in the email provider's sent log and in platform request logs (operator-only). A recruiter who sets the candidate's email to a mailbox they control still receives a genuine link (X-2, PD-040, out of N9; BR-12 makes it visible in the evidence).

## Job terms card (N2)
Spec: `docs/specs/job-terms-card/backend.md` (v2.5).
- **Terms versions** (`public.job_terms_versions`): RLS select only for members of the job's org, the sourcing side of a referral that references the version (snapshot or amendment; `app.can_read_referral_terms`, record scope applies) and platform admins. `authenticated` has select only; `anon` nothing. Insert-only for every role, service role included (update/delete trigger). Other partners see the **current** version only through `get_opportunities` (partner-visible jobs only; a hidden job is "not found", never a reason).
- **Writes** go only through `SECURITY DEFINER` RPCs with `search_path = ''`:
  - `save_job_terms` (job owner or manager, `app.can_manage_job`): the only writer of job versions and the only path that opens a job to partners. A trigger refuses `accepts_external_referrals` false → true for every role unless set inside this RPC (transaction-local GUC, not settable through PostgREST). Connectors and `/api/v1/jobs` can't open jobs.
  - `admin_amend_referral_terms` (platform admin): amendments before a hire; reason and the two written-request references go to the closed `app.terms_amendment_notes` (no grants), readable only through `admin_get_referral_terms` (platform admin; others get `not_found`). **Intentional asymmetry:** a non-admin caller of `admin_amend_referral_terms` gets `forbidden` (checked before the referral is read, so existing and unknown ids answer alike and nothing leaks), while the lookup `admin_get_referral_terms` answers `not_found` (no oracle that the admin page or referral exists). Don't "align" them. A % amendment takes `p_expected_currency` (the currency the admin confirmed); if the currency it would be stored in has moved, it refuses with `stale_version` and writes nothing (QA-N2-12).
  - `report_hire` (hiring side): takes the terms version shown; refuses currency/guarantee entry for snapshot referrals.
- **Reads:** `get_jobs_terms_state` (members of the job's org; the owner-only hidden reason), `get_referral_terms_context` (either side of a referral, `app.can_see_referral`), `get_opportunities` (estimate gated by `share_salary` on % bases).
- **Allow-list:** `save_job_terms`, `get_jobs_terms_state`, `admin_amend_referral_terms`, `admin_get_referral_terms`, `get_referral_terms_context` are on `tests/integration/api-surface.test.ts`. The submit RPCs and `report_hire` were dropped and recreated (no overloads that could bypass the version check).
- **Client key at commit** (`app.referral_commit_keys`): closed table like N1's keys; never returned, never in audit metadata.
- **Privacy:** the first-year base and target bonus reported at hire are compensation data about the hired person ⚖️ (N7 PIA): visible only to the two orgs of the placement and to platform admins, never to candidates, never in audit metadata. The amendment reason must not contain candidate data (admin form hint). Notifications (`job.terms_changed`, `placement.fee_difference`, `referral.terms_amended`) are PII-free and follow record scope.
- **Bounds and fail-closed reads:** flat and minimum fees, bases, bonuses, invoiced fees and payment evidence ≤ 10^12 minor units (RPC checks + check constraints / trigger); the invoiced fee must be within ceil(C/100) and 100 × C. The partner estimate is null for any value outside (0, 10^12] or any computation error, so one job can't break another org's opportunities list.

## Referral-level claims and two-sided hire reporting (N3, drop 1)
Spec: `docs/specs/referral-claims-two-sided-hire/backend.md` (v1).
- **Client name to open a job (BR-1):** `app.job_partner_visible` requires a client key; a trigger refuses opening a job without one for every role and path. The name stays internal (never in a partner payload).
- **Delivery recording is server-only (BR-2):** `record_candidate_request_delivery` is service-role only and takes the actor (re-checked); members can't set or change "sent". The dispute playbook can stop treating "sent" as recruiter-influenced once this ships.
- **Hire records:** `report_hire` v3 and `complete_fee_details` re-check the hiring side (record scope) and answer `not_found` to anyone else; rate limit `hire.record` 30/h. `public.hire_records` is select-only for either side (insert-only for every role). The release flag never reaches the hiring side before a hire is recorded: the record-hire variant and every B payload are identical for released and unreleased referrals (tested), and invalid money is refused identically before the record.
- **Admin-only facts:** the `late` marker, the hire-record admin note and the fee-notice state live in closed `app.*` tables, read only through platform-admin RPCs (`not_found` otherwise). Org audit events carry no `late` and no note text.
- **`deemed_agreement_enabled`:** closed `app.platform_settings`, no grants; written only by an operator or the service role; every change audited (`platform.setting_changed`); false in every environment by default, off in production until counsel Q-1 and N10 acceptance (PD-067, PD-074).
- **Allow-list:** `complete_fee_details`, `get_referral_hire_state`, `admin_get_hire_record`, `admin_set_hire_record_note`, `admin_list_hire_tasks`, `admin_record_fee_notice`. `run_hire_maintenance` and `record_candidate_request_delivery` are service-role only. New tables carry the N10 rules gate.

## Network Rules enforcement (N10)
Spec: `docs/specs/network-rules-enforcement/backend.md`.
- **Acceptance records** (`network_rules_org_acceptances`, `network_rules_member_acceptances`): user id, org id, version, locale shown and that locale's SHA-256 (computed by the database from the stored, LF-normalized text), timestamp. No IP or user agent (C-1). Append-only (no grants, update refused). Members read their own rows; org acceptances are read by org admins. Published rules versions and texts are immutable for every role, service role included.
- **First-access gate (BR-7):** writes by a user who never accepted any version are refused in the database (table trigger, storage policies). **Residual R-7 (accepted):** reads through PostgREST before acceptance are not blocked; the org's acceptance binds its members (rule 1.2) and every write is blocked.
- **Conduct cases** live only in closed `app.conduct_*` tables (non-exposed schema, RLS on, no grants). No `public.disputes` row exists for a conduct case, so no existing "open dispute" rule can reveal or be blocked by a report (BR-19).
- **Reporter identity (BR-43):** the reporting user and org are visible to platform admins and, for their own org's reports, to the reporting org's `org_admin`s (and the reporting user while an active member). The reported org never receives the reporter user, the report text, the category or the files; the reporting org is named only if the admin ticks "name the reporting organization" on a notice. Reported-org audit events never carry reporter data; the reporting org's only audit event is `conduct_report.filed` (case id).
- **Admin access to conduct files (extends PD-024):** report, reply, response and review-request files are readable by **platform admins only**: `authorize_conduct_evidence` (attached, clean files) then a 60-second signed URL; each download is audited (`conduct_evidence.accessed`, org null). Reporters see file names and sizes only. Files may contain candidate and client personal information, accepted as necessary evidence ⚖️ (N7 PIA). Private `conduct-evidence` bucket, same scan and SHA-256 as N1, drafts deleted after 24 h. No automatic purge of cases, files or sanctions in v1 (U-N10-5 ⚖️).
- **Platform admin anonymity (N10-D28):** no member-readable RPC or row returns a platform admin's name or id (decider, reviewer, hold applier, lifter); admin-only audit copies hold lift and stale-close reasons.
- **Restriction privacy (BR-42):** the restriction reason is returned only to the org's own members (`get_my_org_state`, owner-only `job_hidden_reason`). Partners learn only "not taking new referrals" / "no longer part of the network" through `get_partner_job_availability`, and only with a referral on, or a live match with, the job (anti-enumeration).
- **Sanction audit visibility (AC-149):** `conduct_report.*`, `conduct.*`, `sanction.*` and `settlement_mode.*` audit events are readable by `org_admin` (and platform admins) only, enforced in the `audit_select` policy.
- **Database-enforced fairness rules (EC-5):** prior notice before any sanction, closed immediate-hold grounds (2.3 / 4.8), reviewer different from the decider and the hold applier, no increase on review, termination lift by an admin other than the decider. `set_organization_suspension` is dropped: there's no suspension outside the ladder (U-N10-3).

## N3 drop 2: hire reports, answers, authorization checks
- **All new tables are closed** (`app.*`, no grants, rules gate). Members read and write only through SECURITY DEFINER RPCs that resolve the side from the acting org under record scope. Admin RPCs answer `not_found` to non-admins.
- **No probing (R-2):** every refusal to file is the generic `hire_report_unavailable` (another org's id or a random id included). The exceptions are the org limits and an existing hire record. The payload is validated before the referral is read.
- **Side shaping (BR-19, BR-25):** links, file names and storage paths never reach the hiring side. B's files and its `not_this_client` statement never reach A. A never sees the resolution of a `not_this_client` rejection, in the panel or the notification. `hire_report` disputes are admin-only in `disputes_select`. The admin detail reads the closed commit key (RD-033), platform-admin gated.
- **Files:** private bucket `hire-evidence`. The insert policy admits only a member of a side of the referral (record scope); uploads are limited to 30 per user per hour. The scan and SHA-256 come from the worker (service role), written once. Downloads use 60-second signed URLs after an audited authorization (own org, or a platform admin). Orphans are purged after 24 h. No automatic purge of filed evidence in N3 (retention ⚖️ Q-4).
- **New PII ⚖️ Q-4:** the new job's employer text, start month and role (A, B and admins; never in notifications or audit); evidence links and files; right-to-represent evidence; admin candidate-contact counts and client-confirmation status (admins only); per-recipient email delivery records (service role only).
- **Deemed confirmation** never happens on in-app notices alone: it needs delivered, never-bounced email records for two distinct people of B (N7). Reopen is N7's (BR-30).
- **Void (RD-029)** is only ever an admin decision; the consent is marked disputed and the case flagged for breach review.

## Other controls
Security headers (`next.config.ts`), same-origin redirect guard, generic auth errors, Zod everywhere, CSV formula-injection guard, privacy-aware logs (ids/timings only), secrets only in env (`.env.example`).

## Open items ⚖️
PIPEDA / Alberta PIPA / Québec Law 25 applicability, cross-border transfers (AI/email vendors — resumes and postings go to OpenAI when `OPENAI_API_KEY` is set, see `docs/ai.md`), CASL, candidate ownership & prior-presentation rules, exclusivity, replacement guarantees, sales tax (GST/HST/QST), invoicing, KYC, payout regulation, chargebacks. Use a Canadian Supabase region (`ca-central-1`). App-level rate limits are in place for sensitive actions and RPCs (`consume_rate_limit` / `app.enforce_rate_limit`, Postgres-backed; see the rate-limit table above) on top of Supabase Auth's built-in limits. Open: whether to add an edge/IP-level limiter (e.g. Upstash) for unauthenticated routes before launch.
