# Acceptance: Referral-level claims and two-sided hire reporting (N3)

Owner: Product Manager · Date: 2026-11-16 · Brief: [`brief.md`](./brief.md) rev. 2 (BR-1 to BR-45) · Spec: [`spec.md`](./spec.md) rev. 2.2 (104 ACs) · Decisions: PD-066 to PD-081 ([`decisions.md`](../../product/decisions.md))

Inputs read: `qa-report.md` (first pass FAIL, then "Round 1 re-check" PASS), `design-review.md`, `copy-review.md`, `backend.md` (§11, §25 to §28), `frontend.md` (D2.4, fix loop round 1), `brief.md`, `spec.md` §9. Spot checks in the repo: `admin.validation.resolutionLong` and `authCheck.evidenceDueAt` are wired in `src/features/admin/actions.ts` and `hire-report-admin.tsx`.

## Verdict: **ACCEPTED**, with launch gates and follow-ups

QA-N3-01 to 09 and design B-1 to B-3 are fixed and verified. No blocker or major is open in QA, design or copy. Commands (QA, real output): lint and typecheck exit 0; 308 unit tests; N3 integration 96 / 96; N3 E2E 5 / 5; regression E2E 41 / 41 (N1, N9, N2, N10, Journey A, review-regression, auth). The main session confirmed lint, typecheck and unit results.

Acceptance is of the **build**. Several items below block the **founding-group launch** or the **hosted push**, not acceptance. Three failures in the full integration run are outside N3 and triaged in §4.

## 1. Verdict per business rule

42 BRs accepted, 2 Shoulds not built (deferred), 1 moved to N7.

| BR | Verdict | Evidence / condition |
|---|---|---|
| BR-1 client-name gate | **Accepted** | AC-1 to 4; E2E N2 / review-regression. PD-077: internal referrals gated too. Ops check before push (§3, item 10) |
| BR-2 server-only delivery recording | **Accepted** | AC-5; grants test, E2E N9 8/8. Dispute playbook drops the "sent is recruiter-influenced" line |
| BR-3 governing referral | **Accepted** | AC-9, 10; key union tested on commit-only and delivery-only |
| BR-4 hire eligibility | **Accepted** | AC-6 to 8; window + 9 months, legacy, `delivered_at` rule (PD-074) |
| BR-5 coverage test (admin) | **Accepted** | AC-11; admin checklist is static text by design |
| BR-6 reporting tail | **Accepted, ⚖️ Q-2** | AC-12; constants single-sourced. Launch-gated on rule 6.3 text |
| BR-7 B records from any counting referral | **Accepted** | AC-13 to 15; PD-077 pipeline-owner waiver; happy path unchanged |
| BR-8 what B enters | **Accepted** | AC-16 to 19, 31; date bounds, other role, `hire_terms_changed` |
| BR-9 deemed agreement | **Accepted, flag off** | AC-20 to 24. `deemed_agreement_enabled` false in every environment; ⚖️ Q-1 (§3) |
| BR-10 same placement path for reports | **Accepted** | AC-25 |
| BR-11 released and record-only hires | **Accepted** | AC-26, 27; money discarded; QA-N3-04 fixed |
| BR-12 sister-org hire | **Accepted as amended** | Admin note only (PD-069 cut 4, PD-073); AC-28 |
| BR-13 record duty, `late` marker | **Accepted** | AC-29; admin-only, no `late` in member payloads or org audit |
| BR-14 invoice clock | **Accepted (workspace)** | AC-30: both sides show the chip. Admin view deferred to Ops SQL / X9 (PD-079) |
| BR-15 `non_permanent_engagement` | **Accepted, ⚖️ Q-3** | AC-18; helper wording is a draft |
| BR-16 offer-stage nudge (Should) | **Not built** | PD-069 cut 1. Backlog, not gating |
| BR-17 eligibility and generic refusal | **Accepted** | AC-34 to 36, 38 to 40; 11 causes byte-identical, raw responses compared |
| BR-18 report content and evidence | **Accepted** | AC-41, 42; N1 pipeline generalised, `javascript:` / `data:` refused |
| BR-19 visibility | **Accepted** | AC-44 to 46; B never gets links or files; A never gets client name or key |
| BR-20 rate limits | **Accepted** | AC-37; per-user limit fixed (QA-N3-02) on all four RPCs |
| BR-21 release block | **Accepted** | AC-47, 10; both release paths guarded |
| BR-22 competing records | **Accepted** | AC-48, 49, 67 |
| BR-23 answer deadline and reminders | **Accepted** | AC-43, 51; missed-sweep case fixed (QA-N3-05) |
| BR-24 confirm | **Accepted** | AC-52; `report_confirmed` origin fixed (QA-N3-06) |
| BR-25 contest | **Accepted** | AC-53 to 55; `not_this_client` statement admin-only |
| BR-26 rebuttal | **Accepted** | AC-56 |
| BR-27 admin decision | **Accepted** | AC-57 to 60; uphold on in-progress referrals fixed (QA-N3-01) |
| BR-28 admin tools | **Accepted with deviation** | AC-61: normalised client keys plus the job's current name, not names at submission and delivery (PD-079; follow-up before launch) |
| BR-29 silence | **Accepted, data-gated** | AC-62 to 65, 103: every unanswered report goes to the admin queue until N7; deemed branch tested with seeded delivery rows |
| BR-30 reopen of a deemed confirmation | **Moved to N7** | PD-073. N7 acceptance condition. Deemed confirmation can't be enabled without it |
| BR-31 fee-pending placement | **Accepted** | AC-68 to 71; no invoice, payment or allocation while pending; toast fixed (QA-N3-04) |
| BR-32 money bounds | **Accepted** | AC-72; Q-5 matrix incl. int8 max, 10^12 boundary, table constraints |
| BR-33 money disagreements | **Accepted** | AC-73; dispute round trip keeps finance blocked |
| BR-34 release from declined / rejected | **Accepted** | AC-74, 75 |
| BR-35 ownership line | **Accepted** | AC-76, 77; B's line identical on released and non-released referrals |
| BR-36 HA-9 signal | **Accepted as Ops SQL** | AC-78; all 11+5 blocks of `docs/ops/n3-hire-signals.sql` run |
| BR-37 authorization check and void | **Accepted** | AC-79 to 82; design B-1 fixed (entry point on a contested objection) |
| BR-38 record-created note | **Accepted** | AC-83 |
| BR-39 confirmation destination (Should) | **Not built** | PD-069 cut 1. Backlog |
| BR-40 admin flags | **Accepted** | AC-84 to 86; HA-6, late, overdue, unanswered in product; HA-1 query fixed (QA-N3-03); HA-1 and HA-9 as Ops SQL |
| BR-41 no counterpart statistics | **Accepted** | AC-87 |
| BR-42 notifications and audit | **Accepted** | AC-88, 89; no employer, statement, link, client name or key in notifications or audit |
| BR-43 privacy | **Accepted, ⚖️ Q-4** | AC-90; admin-only evidence, no purge. Retention awaits counsel |
| BR-44 edge cases | **Accepted** | AC-91 to 94; HE-3 re-record → X6; HE-11 per N10 settlement mode (PD-079, QA-N3-09 closed) |
| BR-45 no record while B's own objection is open | **Accepted** | AC-102 |

## 2. Check against the brief

- **Scope:** every Must is met except the items the brief moved (BR-30 to N7, metrics and HA-1 / HA-9 to Ops SQL, sister-org tick to admin note). Shoulds BR-16, BR-39 and the admin employer signal are not built (PD-069 cut 1) and aren't needed for the promise.
- **Prerequisites:** S2 and O-1 shipped in drop 1. Must 0b (N2 leftovers, PD-072) done.
- **Never-cut items:** all hold: generic refusal and rate limits, files admin-only, per-client release block, deemed-confirmation data gate (both branches tested), fee-pending with no invented fee, RD-029 void, money bounds.
- **Constraints:** security checklist in `qa-report.md` §4 passes: `guard()` and Zod on every action, tenant from `getRequestContext`, bare `not_found` for foreign ids, 36 N3 functions SECURITY DEFINER with `search_path = ''`, closed `app` tables, 60-second signed URLs audited per side, XSS payloads render as text. The one gap in that checklist: raw multipart posts to the action endpoints weren't tried (code review only).
- **Effort:** inside the accepted range (PD-073). The fix loop was one round.
- **Metrics (brief §4):** measured by Ops SQL (`docs/ops/n3-hire-signals.sql`) from the first placements. Baselines start at the founding-group launch; the PM reviews 12 weeks after launch (lagging targets are estimates).
- **Platform share:** normal rate on the fee collected, no surcharge (PD-071). Nothing in the build adds one.

## 3. Launch-gated items (not acceptance blockers)

| # | Item | Owner | Gate |
|---|---|---|---|
| 1 | **Counsel Q-1 to Q-4 ⚖️** sent to counsel and answered. Q-1 deemed agreement; Q-2 filing tail; Q-3 "what counts as a hire"; Q-4 candidate contact and evidence retention (PIA, Privacy Policy line). **Sending is the user's own action; still pending** | user, counsel | Launch (and item 2) |
| 2 | **`deemed_agreement_enabled` stays false in production** until counsel answers Q-1 yes **and** N10 rules acceptance is live. Flag off = record-only hires on never-accepted referrals, and 6.3 says so | user (flag), backend (script) | Launch |
| 3 | **Network Rules 6.3 / 6.4 / 7.2** (`docs/content/network-rules-n3.md`, with the related-org sentence, PD-076) merge into `network-rules/{en,fr-CA,pt-BR}.md` **after counsel review** under P0-1; 7.2 deemed-confirmation sentence keeps its "ships with N7" marker; 4.8 / 7.1 term edits ride along | ux-writer, founder, counsel | Launch (rules text) |
| 4 | **Store client names at submission and delivery** (PD-079): closed `app` tables, admin-only, shown in the admin hire-report detail. Can't be backfilled, so it ships **before the first real referral** | backend → frontend | Before launch, before the N3 hosted push |
| 5 | **Browser and visual pass** (extend N1 AC-61/62 and N2 F-2): dark mode, 375px, fr wrapping, keyboard paths, and the dialogs not yet seen (S7 / S8 / S13 to S16). QA saw 375px en / fr / pt only on the referral page, the report dialog and the admin queue and detail. fr button wraps (`panel.confirm`, `feePending.enter`, `authCheck.request`, the placement status chip) and the 87-character auth-check checkbox are unverified. A blocker found reopens N3 for that screen | qa-engineer, product-designer | Launch |
| 6 | **B-2 / B-3 contrast not tool-measured.** Both lines now use `text-foreground` on `bg-warning-soft` with a warning icon, which meets the spec's token pair, but nobody measured it. Check in the pass above (light and dark) | qa-engineer | Launch |
| 7 | **N7 items:** BR-30 reopen; per-recipient delivery and bounce records so deemed confirmation can run; `fee_details_due_at` on the report view so the deemed line shows a date and not "—" (gap 7); hire-report-filed email (required before launch) | backend, ux-writer, QA (N7) | Launch; deemed confirmation stays unreachable until done |
| 8 | **Holiday calendar:** seed 2030 by **2028-06-01** (start dates accepted up to today + 548 days; PD-077). Recurring operations updated | backend-engineer | 2028-06-01 |
| 9 | **Hosted push order:** N1, N9, N2, N10 (`20261116001000`–`001700`) and N3 (`20261117*`) in timestamp order, never N3 without the N10 bodies it was built on (PD-078); record-scope md5 `dcd27209…` checked first; only on the user's request | user, Ops | Hosted push |
| 10 | **Two new hosted counts before the N3 push (Needs user decision if real):** (a) referral-open jobs with no usable client name. BR-1 hides them from partners until the owner adds one (recommendation: push; owners fix from the nudge). (b) delivered external referrals on jobs with no client key; must be 0 or test data, otherwise the PM revisits rule 6.3 "any role" (PD-076) | Ops, user | Hosted push |
| 11 | **Dispute playbook:** add the hire-report queue (unanswered / notice not delivered, fee details overdue, ≤ 1 candidate contact per dispute, Invoice overdue by Ops SQL); drop the "sent is recruiter-influenced" line (BR-2) | PM, platform admins | Launch |

## 4. Triaged items outside N3

| Item | Severity | Triage | Owner | Due |
|---|---|---|---|---|
| **`journey.test.ts` "making a candidate unavailable removes them from B's counts"** fails on a clean stack and alone (657 vs 657: the count doesn't drop). N3 doesn't touch matching or `get_job_match_summary`. The test doesn't assert the update's error, so the cause is open: candidate update refused, or the candidate isn't counted. Green at the start of QA's first pass | **major** (regression, not N3) | Not an N3 blocker. Triage first: add an assertion on the update error to learn which; then fix. Treated as a regression because Journey A is a launch-checklist suite | **main session assigns; fix by backend-engineer (matching / candidates)**; qa-engineer adds the error assertion | Before launch; before the next hosted push (PD-081) |
| `network-rules-qa.test.ts` fixture interference (`partner_activity_restricted`) in the full run; passes alone 27 / 27 | minor | N10's file (uncommitted) | N10 session QA | Before N10 acceptance |
| Concurrent sessions on the shared DB make flag-dependent tests flaky (N3 `afterEach` toggles the global flag; `matches` growth causes drain timeouts) | process | **QA runs are serialised** (PD-078): one session runs the full suite at a time, announced; no QA run counts while another session migrates or resets | main session | Standing |
| Earlier-known: N1 AC-66 30 s `drainQueue` budget; `onboarding` and `documents` E2E stale | known | Already in Engineering hygiene | qa-engineer | Before launch |

## 5. Follow-ups (added to the roadmap)

| Follow-up | Where | Gating |
|---|---|---|
| Client names at commit and delivery (item 4 above) | Engineering hygiene | Before launch |
| Admin "Invoice overdue" view | X9 (Ops SQL until then) | No |
| `hire_already_recorded` returns `{placementId}`, then the dialog shows **Open placement** / **Open referral** instead of **Refresh page** (AC-36, gap 3) | N3 follow-up batch | No |
| Business days left on admin deadlines (`deadline_business_days_left`, gap 4); exported types for hire-state and admin payloads (gaps 1, 2) | N3 follow-up batch | No |
| Design polish P-1, P-3 to P-14 (focus after `objection_open`, 44px download and summary targets, visible SHA-256 label, colon i18n, evidence type `aria-required`, pending labels, decision-dialog state and Reject style, delivery-record labels, same-person icon, task-row link key) and copy findings 11, 12 | N3 follow-up batch; one app-wide fr-spacing pass for copy 11 | No (P-1 to P-4 before the browser pass if cheap) |
| Unit test for `monthYear` with `YYYY-MM` input (design gap 9) | N3 follow-up batch | No |
| Not verified, accepted: AC-32 (pipeline drop on Hired from `accepted` / `interviewing`, code only), AC-50 (N10 hire link, code only), AC-40 and AC-91 (code only), raw multipart posts to action endpoints | Browser pass (item 5) | No |
| Shoulds BR-16, BR-39, employer signal | Backlog | No |
| HE-3 cancel and re-record after a fall-off | X6 | No |
| Strategist S-N3-1 (live referral past its window and N1's duplicate check) | Open, non-blocking; no N1 change | No |

## 6. Definition of done

| DoD item | Status |
|---|---|
| Every Must BR has ACs that pass in `qa-report.md` with real output; no open blocker or major | **Met** |
| `deemed_agreement_enabled` exists, defaults false, both branches tested; deemed-confirmation branch tested with seeded delivery rows | **Met** |
| Network Rules 6.3, 6.4, 7.2 drafts in en / fr-CA / pt-BR with ⚖️ and "ships with N7" markers | **Met** (`network-rules-n3.md`); merge after counsel (item 3) |
| `design-review.md` and `copy-review.md` have no open blocker; en / fr-CA / pt-BR complete | **Met.** Blockers B-1 to B-3 fixed; polish and visual pass open (items 5, 6) |
| `backend.md`, `frontend.md`; `domain-model.md`, `product-flows.md`, `security-and-privacy.md` updated | Backend and frontend docs: met. The three shared docs were part of drop-2's scope; the PM didn't re-read them in this acceptance, so **backend-engineer confirms in the first follow-up batch** |
| Migrations applied locally only; record-scope rule respected; N1, N2, N9 suites green | **Met** (md5 unchanged `dcd27209…`; no hosted push) |
| Launch checklist carries the gates | **Done** with this acceptance |
| Process (PD-080): processes started and stopped by PID reported | **Met** in the re-check; one earlier incident (dev server) logged in PD-080 |
| Roadmap N3 `accepted`; `implementation-plan.md` in sync | **Done** |

## 7. Still needs the user

- **Send Q-1 to Q-4 to counsel** (own action; pending). Everything legal in §3 waits on it.
- **Hosted push** only on the user's request, after the checks in §3 items 9 and 10 (any real data there is a **Needs user decision**).
- **Counsel and founder approval** of the Network Rules text (P0-1), including the 6.3 related-org sentence.
- Tell the N10 session about the shared-DB rules (PD-078) if not already done.
