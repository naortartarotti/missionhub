# Acceptance: candidate-confirmation integrity (N9)

Owner: Product Manager · Date: 2026-11-15 · Brief: [`brief.md`](./brief.md) · Decisions: PD-041 to PD-043 ([`decisions.md`](../../product/decisions.md)), building on PD-035, PD-038 to PD-040

Inputs read: `brief.md` (BR-1 to BR-12, scenarios 1–12, DoD), `backend.md` (§1 to §7, deviations D-1 to D-9), `qa-report.md` (round 1 and §5 fix verification, final verdict PASS). Spot checks in the repo: `docs/security-and-privacy.md` (N9 section), `docs/architecture.md` (service-role entry and maintenance sweep), the referral page's `requestNotSent` rule (m-2 fix). No `spec.md`, `design-review.md` or `copy-review.md` exist, by design: the brief's team plan skipped design and copy because N9 has no screen, state or string change.

## Verdict: **ACCEPTED**, with follow-ups

QA's final verdict is PASS, with no open blocker, major or minor. X-1 is closed: QA couldn't obtain or forge a candidate token or confirmation as a recruiter, as anon or from another org through any path tried, including raw PostgREST with every role and profile header. Every BR and every scenario passes. The DoD docs are updated. All nine backend deviations keep every BR intact and are accepted. The open decision D-8 is settled below (BR-12 kept as built).

Nothing below blocks acceptance. One item (R-2 hosted count) is a **hosted-push precondition**, and one (O-1) is scheduled into N3 because N3 is where "sent" evidence starts to back fee entitlement.

N9 status: `accepted` in the roadmap and `docs/implementation-plan.md`; ticked on the launch checklist.

## 1. Check against the brief

### Scope

| Brief item | Result | Evidence |
|---|---|---|
| Must 1: token generated in the DB, raw token only through a service-role path, `p_token_hash` removed | Met | BR-1, BR-2, BR-4 rows; scenarios 1–3 |
| Must 2: resend follows the same rule | Met | Scenario 2, 6; BR-10 |
| Must 3: pending pre-N9 requests invalidated; recruiter resends from the existing UI | Met | BR-7; MIG run on a real pre-N9 DB, 36/36 checks; QA-E recruiter view |
| Must 4: audit for issuance and invalidation, no token or hash anywhere | Met | BR-3, BR-8; whole-DB `pg_dump` grep, container and server log grep: 0 hits |
| Must 5: N1 interplay intact | Met | BR-9 to BR-11; N1 suites green, 0 skipped; N1 E2E 7/7 |
| Must 6: candidate page, confirm/decline, referral page and Resend keep working, no UI or copy change | Met. One behaviour fix inside an existing state (m-2, below), no new strings | Scenario 5, 6, 7; QA-E 8/8 |
| Must 7: forging test helpers rewritten on the service-role path | Met. Three R2-1 `invalid_token` tests retired and replaced with stronger oracle tests | `qa-report.md` §1 "N1 regression and retired tests" |
| Should 8: evidence notes an email change in the 30 days before issuance | Met, with D-8 (email **updates** only), confirmed in PD-042 | BR-12 rows; scenario 12 (29 days dated, 31 days nothing) |
| Won't list | Respected. X-2 not closed (PD-040), sending stays synchronous, no SMS/TTL/page change, manual path untouched | `backend.md` §2, §3 |

### Business rules and constraints
- BR-1 to BR-12: all PASS in `qa-report.md` §1.
- Scenarios 1–12: all PASS. Scenario 7 also covers a crash during a resend after the m-2 fix.
- Security: issuance RPC is `SECURITY DEFINER`, `search_path = ''`, no EXECUTE for `public` / `anon` / `authenticated` / `authenticator`, and it refuses any call carrying a user JWT. Not in the api-surface allow-list.
- Privacy: `token_issued_at` / `token_issued_by` readable by the source org; `token_hash` ungranted (7 probes plus `HEAD count=exact`, no hash oracle). The one unplanned data store, `app.candidate_email_changes`, is accepted in PD-042 (§2 below).
- i18n / accessibility: no new or changed strings. The m-2 fix reuses the existing `awaitingNotSent` state and the existing primary-button variant.
- Migrations: applied locally only (`20261115000100`, `20261115000200`). Hosted push waits for the user and the R-2 check.

### Definition of done
| DoD item | Result |
|---|---|
| Every BR and scenario passes in `qa-report.md` | Yes (round 2: lint, typecheck, 105 unit, 202 integration with 0 skipped, build, E2E 15/15) |
| No open blocker or major | Yes. m-1 and m-2 (minors) fixed and verified |
| `backend.md`, `architecture.md`, `security-and-privacy.md` updated | Yes |
| PM acceptance | This file |

Not verified by QA, and accepted: the full E2E suite (only the N1 and N9 specs touch this path; "full E2E suite green" is already a launch-checklist item), pg_graphql (not installed), the hosted DB (by rule).

## 2. Decisions on open items

| # | Item | Decision | Owner | Reasoning |
|---|---|---|---|---|
| D-8 | BR-12 counts only email **updates**, not a candidate record created with that address | **Confirmed, BR-12 kept as built** (PD-042) | PM (done); strategist for the N3 treatment | BR-12 is evidence only, and the update route is the cheap, likely abuse (edit a real candidate's email). Record creation already has a stored date (`candidates.created_at`), so N3 can use it with no new storage if the strategist says "added recently" matters. Dropping BR-12 would remove working, tested evidence for nothing. Extending it now would reopen backend and QA on an S item for a question the strategist hasn't answered. Q-1 is sharpened to ask explicitly about a **new candidate record** created shortly before the request |
| — | New internal table `app.candidate_email_changes` (not anticipated by the brief's privacy line) | **Accepted** (PD-042) | backend-engineer (owns it); user/counsel for the Privacy Policy line | Dates only, no addresses, non-exposed schema, RLS on with no policies, no grants to any PostgREST role, 60-day retention by the 10-minute sweep and on next change, deleted on anonymisation. It is the minimum needed to make BR-12 true. Added next to fingerprints on the launch checklist's Privacy Policy item |
| O-1 | Any source-org member can call `record_candidate_request_delivery(p_ok = true)` and set "sent" without an email (pre-existing) | **Follow-up, scheduled as an N3 prerequisite** (PD-043). Not fixed in N9 | backend-engineer → qa-engineer | It can't forge a confirmation: the token only exists in the email, and "issued" is server-set and in the evidence. It only lets a recruiter misstate the send time. That matters once evidence backs fee entitlement, which is N3. Direction for the N3 brief: revoke the RPC from `authenticated` and call it only from the server's service-role path (the same place issuance runs), or have the server record delivery inside the issuance path. Interim: the dispute playbook treats "issued" as authoritative and "sent" as recruiter-influenced |
| O-3 | If the email is already null at anonymisation, an older change row stays until the 60-day sweep | **Accepted, low-priority hygiene** (PD-043) | backend-engineer | Dates only, bounded at 60 days, no address. Fix (trigger also fires on `anonymized_at`, like `candidates_anonymized_fingerprints`) batches with the next migration that touches `candidates`. Not gating |
| R-2 | Hosted count of pre-N9 confirmed referrals before `supabase db push` | **Hosted-push precondition, on the launch checklist (Ops)** next to N1's storage-trigger check (PD-043) | user (runs the push) + backend-engineer | Run `select count(*) from public.referral_candidate_requests where confirmed_at is not null;` on the hosted DB immediately before the push (every confirmed row is pre-N9 at that point). If 0, or all test data: push. If any are real: **Needs user decision**, recommendation keep them and record them in the audit log as pre-N9 (PD-039) |
| D-7 | An old pre-N9 link to an answered request shows its state, but `respond` returns `request_expired` | **Accepted** (PD-041) | — | Strict BR-6. The page never calls respond in confirmed/declined states, so no user impact |
| D-1 to D-6, D-9 | Other backend deviations | **Accepted** (PD-041) | — | Each is stricter or equal to the brief (deny by default, one "no token" state, no dead link minted, token never in `actions.ts`) and every BR still holds. D-9: `send_number` counts issuances, which equal email attempts |
| m-2 | Referral page showed "Email sent" after a failed resend with no live link | **Accepted as fixed** | — | Behaviour fix inside an existing state, no new strings, no layout change. No design or copy review needed |

## 3. Follow-ups

| Follow-up | Where | Owner | Gate |
|---|---|---|---|
| R-2 hosted count of confirmed pre-N9 requests before `supabase db push`; Needs user decision if any are real | Launch checklist (Ops), push precondition | user + backend-engineer | Hosted push |
| O-1: make `record_candidate_request_delivery` server-only (or fold delivery recording into the issuance path) | N3 brief, prerequisite | backend-engineer → qa-engineer | N3 (and so launch) |
| Dispute playbook: "issued" is authoritative, "sent" is recruiter-influenced until O-1 ships | Launch checklist (Ops), dispute playbook line | platform admins / PM | Launch |
| Q-1 sharpened: does a confirmation count for first position and fee entitlement when the candidate's email was changed, **or the candidate record was created**, shortly before the request? Window, and fallback treatment | Roadmap strategist questions; due before the N3 brief | recruitment-strategist | N3 brief |
| O-3: change-log trigger also fires on `anonymized_at` | Engineering hygiene | backend-engineer | Not gating |
| Email-change dates (60 days) stated in the Privacy Policy next to fingerprints | Launch checklist (Legal) | user / counsel | Launch |

## 4. Needs user decision
- **R-2 at push time only:** if the hosted DB holds real confirmed pre-N9 referrals, keep them (recommended, noted in the audit) or remove them. Nothing to decide until the user asks for the hosted push.
- **Hosted push timing** remains the user's call (N1 and N9 migrations together; storage-trigger check and R-2 count first).
