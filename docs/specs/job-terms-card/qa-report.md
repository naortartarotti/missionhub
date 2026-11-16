# QA report: Job terms card (N2)

Owner: QA Engineer · Date: 2026-11-15 · Step 6 of the team plan · Inputs: `brief.md` rev. 2 (BR-1 to BR-41, S1/S2/S3 deferred), `spec.md` (71 active ACs), `backend.md` v2, `frontend.md` (5a + 5b), `recruiting-input.md`, `backend-estimate.md` (E1–E6).
Environment: local Supabase only (`127.0.0.1:55321/55322`), through the guarded wrapper. `.env.local` (hosted) was neither edited nor used. No hosted push.

## Final verdict (after fix round 3, 2026-11-16): **PASS**

- **No open N2 blocker or major. All QA findings are fixed and verified**, from QA-N2-02 to QA-N2-09 and QA-PRE-01, 03 and 04 (§10).
- **N1 and N9 don't regress, and record scope holds** (record-scope md5 unchanged; `get_opportunities` keeps the record-scope filter).
- **Results:** lint, typecheck and unit pass (234). Integration H1 passed 317/317. H2 hit only the known N1 QA AC-66 30 s `drainQueue` budget, which comes from local data growth, not a regression (see §10.3). E2E is 35/35 across N1, N9, N2, review-regression and the journey.
- **Still open for the PM (pre-existing, not N2):**
  - QA-PRE-02 (minor, backend): `get_opportunities` has no pagination and is capped at 1,000 rows.
  - The N1 QA test's 30 s budget on a large local stack (test infra).
- **Not re-run by QA** (unchanged from §7): the UI-only ACs listed in §4.1.

### Verdict after fix round 2 (superseded): FAIL on QA-N2-09, now fixed

- **Round 2 verified.** QA-N2-07 is fixed for fees on every write path (both RPCs, check constraints, the service role), and `get_opportunities` now fails closed per row. QA-PRE-03 and QA-PRE-04 are fixed. Lint, typecheck and unit pass; integration is clean twice in a row with no reset (307 passed plus 4 expected-fail); E2E is 35/35 across N1, N9, N2 (incl. the two flipped tests), review-regression and the journey. See §9.
- **Open N2 major: QA-N2-09 (backend).** A salary band of 0–0, or min 0 with a blank max, combined with `share_salary` on (BR-10's default for new open jobs) makes `app.terms_estimate` return **0**. Both submit RPCs then insert `fee_estimate_minor = 0`, which violates `referrals.fee_estimate_minor > 0` inside the no-raise block, so **every partner's submission to that job returns `failed`** on both authorization paths. The job form and the connector both accept a 0 salary. The bug dates back to drop 1; this round's estimate work exposed it. **Fix:** return NULL when the estimate is ≤ 0 (one line in `terms_estimate`), so the composer also stops showing "~CAD 0".
- **Open minor: QA-N2-08 (backend).** An absurd client payment amount (P ≈ 9×10^18; `record_payment_evidence` has no upper bound) still overflows raw in `allocate_minor` on the I ≥ C path.
- After the fixes, drop `.fails` on QA-N2-09 (× 3) and QA-N2-08 in `tests/integration/terms-card-qa.test.ts`.

### Verdict after fix round 1 (superseded): FAIL on QA-N2-07, now fixed

- **Every item of the fix round is verified fixed** (§8): QA-PRE-01, P16, QA-N2-02 (for I and base), QA-N2-03, QA-N2-04, QA-N2-05, QA-N2-06, the frontend design and copy items, and the opportunities grid. N1 and N9 don't regress (E2E N1 7/7, N9 8/8). Record scope still holds.
- **Open N2 major: QA-N2-07 (backend).** `save_job_terms` and `admin_amend_referral_terms` accept any positive bigint as a flat or minimum fee. One hiring org that publishes an absurd fee (e.g. 9×10^18 minor) makes **`get_opportunities` fail as a whole (`bigint out of range`) for every partner whose candidates match that job**. `report_hire` on such a job also fails with a raw overflow. This is a cross-tenant availability bug in N2 code. The fix is small: bound `flat_fee_minor` and `min_fee_minor` (e.g. ≤ 10^12, like the base and I bounds) in both RPCs and as a check constraint.
- **Open pre-existing items, PM to schedule:**
  - QA-PRE-03 (major, frontend): the job page scrolls 169–208px horizontally at 375px once a job has received referrals.
  - QA-PRE-02 (minor, backend): opportunities silently capped at 1,000. Now visible in the UI as "1,000 new".
  - QA-PRE-04 (minor, frontend): the overview pipeline label overflows 11px at 375px.
- Re-run QA-N2-07 after the fix. The two `it.fails` cases (07a, 07b) flip to failing once it's fixed; then drop `.fails`.

### Earlier verdict (before the fix round): PASS for N2, with one pre-existing major (QA-PRE-01)

- **No N2 blocker or major.** Every Must BR and active AC passes at the server layer. The main journeys pass end to end through the UI: publish a card, the partner sees it, `terms_changed`, submit under v2, confirm the agreement, hire with I < C, placement split, admin amendment.
- **N1 and N9 don't regress.** Integration suites pass, plus E2E N1 7/7 and N9 8/8.
- **Record scope (RD-036) holds.** The 8 functions N2 copied from `20261115000300_recruiter_record_scope.sql` differ from it only by the `-- N2` edits; nothing was reverted. `recruiter-record-scope.test.ts` passes, and every N2 notification follows record scope (new QA tests).
- **Five N2 minors** (QA-N2-02 to QA-N2-06) and **two pre-existing scale issues** (QA-PRE-01 major, QA-PRE-02 minor). QA-PRE-01 makes newly published jobs undiscoverable once a job reaches a few hundred candidates. It isn't caused by N2, but N2 depends on it: publishing a card is what triggers job matching. **PM decision:** accept N2 now and schedule QA-PRE-01 before launch (recommended), or hold.
- Some UI-only ACs were checked by frontend's visual pass but not re-run by QA (AC-11, AC-13, AC-56, AC-65, AC-69, AC-72, parts of others). They're marked in the table.

---

## 1. What I added or changed (tests only)

| File | Change |
|---|---|
| `tests/integration/terms-card-qa.test.ts` | **New, 27 tests.** Every path that opens a job (user insert, user upsert, anon, colleague, outsider, platform admin, rate limit, the real connector `upsertJobs`). Visibility: draft, paused, closed, reactivation, "same error as a job that doesn't exist", composer row, exact admin counts. `terms_changed` on both RPCs for null, stale, foreign, random and **amendment** ids: identical shape, no request, fingerprint, hit or notification, and the 31st attempt is rate limited. Snapshot, agreement and placement immutability for the service role. Terms-version RLS for record scope. Every forged hire input, including a `transition_referral` → hired bypass. Fee-difference and terms-change recipients under record scope, with a fallback when the submitter leaves. Allocation boundaries SQL ↔ TS. Amendment abuse and side effects (no oracle, T9 applies at delivery, dates, split and rule untouched, no reason in org payloads). Estimate leakage and the candidate payload. Toronto day boundary. Internal and legacy agreements. Client-key absence. Base and bonus visibility |
| `src/features/jobs/__tests__/terms-schema-qa.test.ts` | **New, 48 cases.** Exact AC-2 to AC-6 and AC-10 boundary values against `jobFormSchema`. Two `it.fails` cases document QA-N2-03 (drop `.fails` once fixed) |
| `tests/e2e/job-terms-card.spec.ts` | **New, 6 journeys** (§3) |
| `tests/e2e/review-regression.spec.ts` | Fixed (frontend 5a note 5): publishing fills a rate and the attestation. Added: a non-terms edit keeps 1 version (AC-8), and a draft opened to partners with an empty card is refused with nothing created (AC-10) before the private draft saves |
| `tests/e2e/journey.spec.ts` | Fixed (frontend 5b note): the snapshot hire posts "First-year base salary (CAD)", asserts no fee or currency input, and checks the computed CAD 20,000.00. Also: opens the composer by match id (the shared list holds other suites' jobs), selects the recorded-authorization radio (N9 made email the default), verifies evidence on `/admin/evidence` (moved from `/admin` by other admin work), uses unique wire references per run, and creates the job before the candidate (QA-PRE-01) |
| `tests/integration/helpers.ts` | `opportunityFor(user, org, candidate, job)`: reads one pair through `get_opportunities(p_match)` (QA-PRE-02) |
| `tests/integration/terms-card.test.ts`, `journey.test.ts`, `recruiter-record-scope.test.ts` | List-wide `get_opportunities` lookups replaced by `opportunityFor` (QA-PRE-02). The job is created before the candidates (QA-PRE-01). The assertions are unchanged |
| `tests/integration/candidate-confirmation-integrity-qa.test.ts` | The N9 "DB-wide dump grep" now streams `pg_dump` through `grep -F` with a 300 s timeout. The local DB (3.3 GB) no longer fits in a Node string (`0x1fffffe8`). Same assertions |

QA harness (scratchpad, not app code): a `--require` preload that answers `https://api.resend.com/` inside the web process and writes each message to a capture dir (the N9 E2E stand-in). Nothing reached the network.

---

## 2. Record-scope (RD-036) copy check

The bodies were diffed after stripping comments and whitespace, against the latest earlier definition of each function. The record-scope migration md5 is still `dcd272097bdb90c8311662bf3752e01e`, as backend recorded.

| Function | N2 file | Differences from `20261115000300` besides formatting |
|---|---|---|
| `app.assert_referable` | `…0200` | Status/flag/suspension check → `app.job_partner_visible(j)` (N2) |
| `app.assert_own_match` | `…0200` | + `exists (… job_partner_visible)` (N2) |
| `public.mark_matches_seen` | `…0200` | + same predicate (N2) |
| `public.get_opportunities` | `…0200` | Return type, terms columns, estimate, predicate (N2). **Record-scope filter `c.owner_id = auth.uid() or app.sees_all(p_org)` kept** |
| `public.get_sent_referral_jobs` | `…0200` | Fee and share columns removed (N2). `sees_referral_as_source` kept |
| `public.get_referral_presentation` | `…0300` | + `lookback_months`, `claim_prior_date_min` (N2) |
| `public.report_hire` | `…0400` | v2 body. **`app.sees_referral_as_target` access check kept** |
| `public.review_payment_evidence` | `…0400` | Allocation and memos only (N2). Access check (admin or source-side payout) kept |

The other redefined functions (`submit_referral*`, `respond_candidate_request`, `deliver_referral`, `create_agreement_for_referral`, `file_prior_presentation_claim`) differ from their own latest definitions (`qa_round2`, N9, `presentation_submit`, `related_org_referrals`, `qa_fixes`) only by `-- N2` edits. N9's token, consent-evidence and delivery re-check code is intact. Live DB: one `report_hire` overload; no function body contains `hire_terms_pending`.

---

## 3. E2E journeys (new `tests/e2e/job-terms-card.spec.ts`)

1. **B publishes a job with a card** (AC-1, AC-7): defaults (rate empty, 90 days, 6 months, split "Sourcing 45% · Hiring 45% · Platform 10%", "Not published yet"). Publishing without the attestation is refused and nothing is created. With it, version 1 is stored with B as attester, `share_salary` on and the job open.
2. **The partner sees the card; `terms_changed`; submit** (AC-18, AC-19, AC-23, AC-24): the composer shows 20%, "Confidential", "Terms version 1", the estimate "~CAD 9,900" and "You're submitting under terms version 1". B publishes 22% meanwhile. Submit shows `#terms-changed`, focused, with v2 at 22%. Evidence is kept and no referral exists. **Submit under new terms** creates the referral with v2 and a frozen estimate of 2,420,000.
3. **Agreement on the frozen terms** (AC-34, AC-63): B hides and changes the band after the commit. A's page and dialog still show 22%, "Terms version 2" and "~CAD 10,890.00". The agreement references v2, 4500 bps, `collected`.
4. **Hire with I < C** (AC-39, AC-40, AC-44, AC-45, AC-50, AC-51, AC-71): no fee, currency or guarantee input. Base 100,000 shows the computed CAD 22,000.00. Invoiced 15,000 shows "Difference −CAD 7,000.00". A missing reason is refused with nothing recorded, then "Client negotiated a lower fee". The placement stores C 2,200,000, I 1,500,000, the base and the reason. The hiring side's tiles show CAD 9,900.00 / 1,500.00 / 3,600.00 and `lowerTarget`. The submitter alone gets `placement.fee_difference` with "CAD 15,000.00 instead of the computed CAD 22,000.00". A's page shows `lowerSource`, 9,900.00 and the base.
5. **Concierge amendment** (AC-58, AC-60, AC-61, AC-62): a non-admin gets no admin page. The admin looks the referral up by a pasted link. The client shows as "Confidential", never the real name. T9 is disabled after delivery. The guarantee goes 90 → 60 with reason, both references and the tick. The confirmation lists "90 days → 60 days", then the toast. The amendment row exists and the agreement is repointed. Both orgs' pages show "Amended on…", 60 days and "Original terms", with no reason or references.
6. **Hidden job** (AC-16): after the job becomes a contract job, its composer URL shows "not available" and the opportunities list drops it.

---

## 4. Traceability

Legend:
- **BE-C** `terms-card.test.ts` (25) · **BE-H** `terms-hire-ledger.test.ts` (18) · **QA-I** `terms-card-qa.test.ts` (27) · **RS** `recruiter-record-scope.test.ts`
- **QA-U** `terms-schema-qa.test.ts` · **U** backend and frontend unit files (`terms.test.ts`, `terms-schema.test.ts`, `allocate-placement.test.ts`, `terms-display.test.ts`, `prior-date-range.test.ts`, `commissions/domain.test.ts`)
- **QA-E n** = journey n in §3 · **E-RR** review-regression · **E-J** journey · **N1-E** / **N9-E** the N1 / N9 E2E specs
- "server" = verified at the RPC/RLS layer; the UI part relies on frontend's visual check

### 4.1 Acceptance criteria (71 active)

| AC | Tests | Result |
|---|---|---|
| AC-1 defaults, T10 read-only | QA-E 1 | PASS (search type and remedy defaults not asserted) |
| AC-2 rate / flat bounds | QA-U AC-2 (0.99, 50.01, 22.555, empty refused; 1, 50, 22.5, 22.55 accepted; flat 0 and empty refused, 15000 accepted), U | PASS |
| AC-3 minimum | QA-U (0 refused, empty = none), BE-C (RPC refuses min on flat) | **PASS with deviation**: the form schema drops a forged minimum on flat instead of refusing it (QA-N2-03) |
| AC-4 currency | QA-U (5 allowed, JPY/XXX refused, % takes the salary currency), BE-C | PASS (server). Live UI update of the currency text not re-checked |
| AC-5 guarantee | QA-U (45/365/−30 refused, remedy required), BE-C | **PASS with deviation**: a remedy with None is dropped, not refused (QA-N2-03) |
| AC-6 payment and window | QA-U (−1, 91, 30.5 refused; 0, 90 accepted; 5, 13, 6.5 refused), BE-C | PASS |
| AC-7 attestation | QA-E 1, BE-C | PASS ("Last confirmed by" on the next edit not asserted) |
| AC-8 no-op saves | BE-C, E-RR (non-terms edit keeps 1 version), QA-I (no-op notifies nobody) | PASS |
| AC-9 immutability, RPC-only | BE-C (owner and service role), QA-I (colleague, outsider, platform admin, anon, connector, user insert/upsert, rate limit) | PASS |
| AC-10 BR-6 refusals | E-RR (draft open with empty card refused, nothing created; private draft saves), QA-U, BE-C | PASS (focus on the first invalid field not asserted) |
| AC-11 share_salary toggle | (none) | Not re-run by QA (frontend visual) |
| AC-12 no fee toggle | U (retired fields ignored) | PASS (server). UI not re-run |
| AC-13 existing-referrals note | `get_jobs_terms_state.referral_count` (BE-C) | Not re-run in UI |
| AC-15 nudge | BE-C and QA-I hidden reasons (`no_terms`, `not_permanent`, `currency_mismatch`) | PASS (server). Chips not re-run |
| AC-16 hidden on every surface | BE-C, QA-I (draft/paused/closed/reactivated, error identical to a missing job, `p_match` empty), QA-E 6 | PASS |
| AC-17 owner still lists it, others get nothing | BE-C (owner reasons; others `forbidden`) | PASS |
| AC-18 partner card | QA-E 2 | PASS (each network-rule line not asserted) |
| AC-19 estimate gating | QA-I (RPC row has no estimate, share or band; minimum shown), QA-E 2 ("~" estimate) | PASS |
| AC-20 flat share / minimum shown | BE-C (flat estimate), QA-I (minimum in payload) | PASS (server) |
| AC-21 "Terms updated" 30 days | QA-I (v1 none; v2 shown; backdated 29 days shown, 31 days gone) | PASS (server) |
| AC-22 earnings sort | U `compareEarnings` | PASS (unit) |
| AC-23 snapshot at commit | BE-C, QA-E 2 (terms line) | PASS |
| AC-24 `terms_changed` | BE-C, QA-I, QA-E 2 | PASS ("Changed" badges not asserted) |
| AC-25 pending warning re-check | BE-C | PASS (server) |
| AC-26 forged / foreign / random ids | BE-C, QA-I (+ null and amendment ids, identical shape) | PASS (RPC). Action-level non-UUID → Zod by code |
| AC-27 resend keeps v1; candidate page | BE-C, QA-I (candidate payload has no fee, rate, terms or salary), N9-E | PASS |
| AC-28 snapshots never change | BE-C, QA-I (service role refused on every snapshot column) | PASS |
| AC-29 client key never exposed; N1 suite | QA-I (no audit metadata, no reader function, absent from both sides' rows), N1 integration + N1-E 7/7 | PASS |
| AC-30 change notifications | BE-C, QA-I (3 live referrals → 1 to the submitter only; fallback to managers, never a colleague; none to the hiring side) | PASS |
| AC-31 commit rule | BE-C, QA-E 3 | PASS |
| AC-32 internal snapshot | QA-I (0 / 9000 / 1000 from the commit rule) | PASS |
| AC-33 legacy agreement | QA-I (current default rule, no terms reference) | PASS |
| AC-34 agreement dialog | QA-E 3 | PASS (legacy dialog variant not re-run) |
| AC-35 Toronto months | BE-C, QA-I (UTC 02:00 on Sep 1 = Aug 31 ET → Feb 28; leap Feb 29) | PASS |
| AC-36 legacy +12, no date before delivery | BE-C, QA-I | PASS |
| AC-37 footer before delivery | BE-C (date null) | PASS (server). Footer text not re-run |
| AC-38 look-back | BE-C (12 vs 6 through real claims; server bound), U `prior-date-range` | PASS |
| AC-39 hire terms read-only | QA-E 4, E-J | PASS (pipeline drop not automated) |
| AC-40 % of base | QA-E 4, E-J, BE-H | PASS |
| AC-41 total cash + minimum | BE-H, QA-I (AC-71 test) | PASS |
| AC-42 flat; parity | BE-H (200 fee parity cases) | PASS |
| AC-43 guarantee end | QA-I (Mar 1 + 90 = May 30), BE-H (0 → null) | PASS |
| AC-44 I ≠ C reasons | BE-H (5 codes), QA-I (whitespace note, 501 chars, I = C + reason, negative I), QA-E 4 | PASS |
| AC-45 fee-difference notification | BE-H, QA-I (record scope + fallback), QA-E 4 | PASS |
| AC-46 currency/guarantee refused; old signature gone | BE-H, QA-I, `pg_proc` count = 1, api-surface | PASS |
| AC-47 legacy hire | BE-H (both directions refused) | PASS (server). Legacy dialog not re-run |
| AC-48 amended hire | BE-H (18%), QA-I (amended to flat USD: no base, USD placement) | PASS (server) |
| AC-50 Fee panel both sides | QA-E 4 | PASS |
| AC-51 collected split | QA-E 4 (C 22,000 / I 15,000), QA-I SQL case | PASS |
| AC-52 negative job owner | BE-H, QA-I (C 20,000 / I 8,000 → −1,800.00) | PASS (server). Negative tile not re-run |
| AC-53 I ≥ C | BE-H, QA-I | PASS (server) |
| AC-54 partial payments | BE-H, QA-I (P = I/2; three payments within 1 unit each) | PASS |
| AC-55 frozen basis | BE-H, QA-I | PASS (server) |
| AC-56 list Fee column / KPIs | (none) | Not re-run by QA |
| AC-57 legacy placements | BE-H, QA-I (legacy = `allocate_minor`) | PASS (server) |
| AC-58 amendment | BE-H, QA-I, QA-E 5 | PASS |
| AC-59 after hire / legacy | BE-H | PASS (server) |
| AC-60 T9 and delivery | QA-I (undelivered T9 used at delivery; delivered refused; dates, split and rule untouched), QA-E 5 | PASS |
| AC-61 admin-only notes, no-change, 404 | BE-H, QA-I (no oracle: same error for real and random ids), QA-E 5 | PASS |
| AC-62 confidential client | QA-E 5, BE-H | PASS |
| AC-63 frozen estimate display | QA-E 3 (sourcing side + dialog), BE-C | PASS (hiring-side view, "hidden at submit" variant and sent list not re-run) |
| AC-64 newer job version line | BE-H (`get_referral_terms_context`) | PASS (server) |
| AC-65 legacy displays | (none) | Not re-run by QA |
| AC-69 three locales | `messages.test.ts` (same keys and placeholders) | Partial: no QA locale walk-through |
| AC-70 currency codes | QA-E 2–5 (every amount asserted with "CAD"), notification text | PASS on the screens covered |
| AC-71 base visibility | QA-I (both sides' eligible members and platform admin; not colleagues, other orgs or anon), QA-E 4 | PASS |
| AC-72 375px / a11y | E-RR (375px job form, composer, admin; no horizontal scroll), QA-E 2 (S5-e focus) | Partial: hire dialog and Fee panel at 375px not re-run |
| AC-73 legacy delivery on a card-less job | BE-C, QA-I | PASS (server) |
| AC-74 no date before delivery | BE-C, QA-I | PASS (server) |
| AC-75 connector currency change | QA-I (real `upsertJobs`: hidden with `currency_mismatch`; re-save needs attestation, v2 in USD, visible again; referral keeps CAD) | PASS (server) |
| AC-76 admin counts | BE-C, QA-I (equal to the predicate on the live data; non-admins `forbidden`), E-RR (panel renders) | PASS |

Moved and not tested: AC-14 (N3), AC-49, AC-66, AC-67, AC-68 (N2.1).

### 4.2 Business rules

| BR | Covered by | Result |
|---|---|---|
| BR-1 card fields | AC-1 to AC-7 rows | PASS (QA-N2-03 minor) |
| BR-2 T10 read-only | QA-E 1 | PASS |
| BR-3 one predicate everywhere (+ delivery exception) | AC-16, AC-17, AC-73, AC-75; inline copies searched in the live DB (only `on_job_change`, the predicate itself, `save_job_terms` and the legacy branch of `respond_candidate_request` read the flag) | PASS |
| BR-4 immutable, RPC-only, connectors can't open | AC-9; QA-I connector | PASS |
| BR-5 version only on a T1–T9 change | AC-8 | PASS |
| BR-6 card + permanent, drafts included | AC-10 | PASS |
| BR-7 existing jobs hidden, referrals proceed | BE-C, QA-I | PASS |
| BR-8 partner card | AC-18 | PASS |
| BR-9 `share_fee` retired; estimate gated | AC-19, AC-20 | PASS |
| BR-10 `share_salary` default on | QA-E 1 (new job) | PASS (existing-job case not re-run) |
| BR-11 snapshot incl. frozen estimate | AC-23, QA-E 2–3 | PASS |
| BR-12 `terms_changed` | AC-24 to AC-26 | PASS |
| BR-13 snapshot never edited | AC-28 | PASS |
| BR-14 N9 intact | AC-27, N9 suites | PASS |
| BR-15 commit key closed | AC-29 | PASS |
| BR-16 agreement from the snapshot | AC-31, AC-32 | PASS |
| BR-17 legacy agreement | AC-33 | PASS |
| BR-18 window at delivery (ET) | AC-35 | PASS |
| BR-19 legacy +12; null before delivery | AC-36, AC-74 | PASS |
| BR-20 look-back | AC-38 | PASS |
| BR-21 to BR-26 hire | AC-39 to AC-48 | PASS |
| BR-27 to BR-30 ledger | AC-51 to AC-57 | PASS (QA-N2-02 minor) |
| BR-31 to BR-33 changes | AC-21, AC-28, AC-30 | PASS |
| BR-34, BR-35 amendment | AC-58 to AC-62 | PASS (QA-N2-05 minor) |
| BR-36, BR-37 display | AC-63 to AC-65 | PASS (server). UI partially re-run |
| BR-38 i18n, currency codes | AC-69, AC-70 | Partial (see AC rows) |
| BR-39 to BR-41 | deferred | n/a |

### 4.3 Brief QA scenarios (19)

| # | Tests | Result |
|---|---|---|
| 1 | BE-C, QA-I, E-RR, QA-E 6 | PASS |
| 2 | BE-C (owner and service role), QA-I (colleague, platform admin, anon) | PASS |
| 3 | BE-C, QA-I, QA-E 2 | PASS |
| 4 | BE-C | PASS |
| 5 | BE-C | PASS |
| 6 | BE-C, QA-I | PASS |
| 7 | BE-C | PASS |
| 8 | BE-H, QA-I | PASS |
| 9 | BE-H, QA-I, QA-E 4, E-J (settles through the snapshot path) | PASS |
| 10 | BE-H, QA-I, QA-E 5 | PASS |
| 11 | BE-C, QA-I | PASS |
| 12 | QA-I, BE-C | PASS |
| 13 | BE-C, QA-I (real connector code) | PASS |
| 14 | N1 and N9 integration suites, N1-E 7/7, N9-E 8/8, BE-C pending-warning re-check | PASS |
| 15 | BE-C, QA-I | PASS |
| 16 | QA-E 3 (sourcing side), BE-C | PASS (hiring-side view and sent list not re-run) |
| 17 | BE-C, QA-I | PASS |
| 18 | BE-H (declined allowed, legacy refused, repoint), QA-I | PASS |
| 19 | QA-I | PASS |

---

## 5. Bugs and findings

| ID | Severity | Owner | Finding |
|---|---|---|---|
| QA-PRE-01 | **major** (pre-existing, not introduced by N2) | backend | **Job-side matching fails with "URI too long" once a job has a few hundred skill-reachable candidates.** `recomputeForJob` pages 500 candidates and calls `hasProcessingAuthorization(db, ids)`, which puts up to 500 UUIDs (~18 KB) in one PostgREST `in.(…)` URL (`src/features/matching/infrastructure/matching-service.ts:25`, `:27–33`, `:162`). N2 impact: opening a job through `save_job_terms` fires `on_job_change` → `match.job`, so a job whose card is published after the candidates exist never matches them. It stays invisible on partners' opportunities until each candidate is re-scored. It also blocks the "reappears" half of AC-16 at scale. The worker logs the error as `"[object Object]"` (`src/server/queue/worker.ts:47`: a PostgREST error isn't an `Error`). **Repro:** on the local stack, `recomputeForJob(admin, '<a job with many matching candidates>')` → `{"message":"URI too long\n"}`. The local queue holds 529 dead and 48 failed `match.job` jobs. **Fix:** chunk the `in()` (≤ 100 ids) or move the consent check into SQL; serialise `e.message` in the worker |
| QA-PRE-02 | minor (pre-existing) | backend | **`get_opportunities` has no pagination, and PostgREST silently caps it at `max_rows = 1000`** (`supabase/config.toml:18`). An org or candidate with more than 1,000 live matches loses the lowest-scored rows with no signal. On the local stack each candidate now has about 1,830 matches, which made list-based integration tests flaky in the second run. The composer (`p_match`) is unaffected. N2 redefined the function without changing this. **Fix:** a `limit`/cursor, or an explicit cap plus a "more" UI |
| QA-N2-02 | minor | backend | **`app.allocate_placement` raises a raw `bigint out of range`** when a share exceeds int8. This needs I to be tiny compared with C and P (`select app.allocate_placement(10000000000, 4500, 4500, 1000, 'collected', 10000000000, 1)`), so `review_payment_evidence` fails with an unmapped SQL error, and the TS mirror (BigInt) diverges at that extreme (`20261116000400_terms_hire_ledger_amend.sql:82–93`). Only absurd inputs reach it (B reports I = 1 minor unit). Fix: bound I (e.g. I ≥ 1% of C, or a clean `invalid_fee`) in `report_hire`. Test: QA-I "fails loudly…" |
| QA-N2-03 | minor | backend | **`jobFormSchema` silently drops a forged minimum on a flat basis and a forged remedy with no guarantee**, where AC-3 and AC-5 say "refused" (`src/features/jobs/schemas.ts`; the backend unit test `terms-schema.test.ts:35`/`:58` asserts the drop). Nothing wrong is stored, because the RPC refuses both. Fix: refine to a field error, or have design accept "ignored". Test: QA-U `it.fails` × 2 |
| QA-N2-04 | minor | frontend | **The owner overview counts N2-hidden jobs as open.** `src/features/overview/data.ts:58–64` selects active ∧ open without the predicate, and this drives `setup.hasOpenJob` and `partnerFits` (`:135–141`). An owner whose only open job has no card (or is a contract or currency-mismatch job) sees partner-fit totals for a job no partner can see, and the setup step is marked done. Fix: use `get_jobs_terms_state(...).partner_visible` |
| QA-N2-05 | minor | design → backend | **The expected share ignores an amendment.** `getReferralTerms` computes `expectedShareMinor` from the frozen `fee_estimate_minor` × the snapshot sourcing bps (`src/features/referrals/queries.ts:281–284`), even when an amendment changed the rate or basis (20% → 15%, or % → flat). The referral page and agreement dialog then show a share that matches neither the effective terms nor what the hire will compute. BR-36 says "frozen estimate" but doesn't cover amendments. Design or PM decide: hide the amount (show `shareAtHire.*`) when `amended`, or recompute it. Code-evident; not exercised in the UI |
| QA-N2-06 | minor (test infra) | backend | Backend integration tests use the host clock (`new Date().toISOString()`) as the `since` bound for notifications, while rows carry the Docker VM's `now()`. A few ms of skew made my first amendment-notification check miss real rows. The QA file uses `clock_timestamp()` from the DB; `terms-card.test.ts:422` and `terms-hire-ledger.test.ts:126/253` could flake the same way |

Out of N2 scope, reported for the owners of other work in the tree (not fixed, not N2): `tests/e2e/documents.spec.ts` (the candidate profile no longer has an "Upload resume" control) and `tests/e2e/onboarding.spec.ts` (heading "How do you work?" is now "Set up your organization"). Both come from uncommitted candidate-profile and onboarding changes. Owner: frontend.

---

## 6. Commands run (real results)

`W` = `…/scratchpad/local-env.sh` (guarded wrapper, refuses anything but `127.0.0.1`). One wrapped process per invocation.

| Command | Result |
|---|---|
| `W npm run test:integration` (baseline, before QA changes) | 10 files, **261 passed** |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | 22 files, **222 passed, 2 expected fail** (QA-N2-03 `it.fails`) |
| `W npx vitest run -c vitest.integration.config.mts tests/integration/terms-card-qa.test.ts` | 23/23 then 27/27 after additions |
| `W npm run test:integration`, run 1 (after the dump-grep fix) | 11 files, **288 passed** |
| `W npm run test:integration`, run 2 (no reset) | 6 failed / 282 passed. Five were the `max_rows` truncation (QA-PRE-02) on list-wide lookups (journey, record scope, 3 QA); one was `TypeError: fetch failed` (local API under load). Fixed in the tests (`opportunityFor`, job-first ordering) |
| `W npm run test:integration`, R1–R4 (after those fixes, no reset between any of them) | see §6.1 |
| `W npm run build` | exit 0 |
| `W next start -p 3117` + `W npm run worker` (first run, no email stand-in) | full E2E: 10 passed, 4 failed, 8 skipped (N9 needs the stand-in), 12 did not run (serial). The N1 stop test needs `SUPPORT_EMAIL` (environment, as in the N9 report) |
| `W env NODE_OPTIONS=--require <stand-in> QA_EMAIL_CAPTURE_DIR=… RESEND_API_KEY=<fake> SUPPORT_EMAIL=support@example.test next start -p 3117` | started |
| `W env E2E_BASE_URL=http://localhost:3117 QA_EMAIL_CAPTURE_DIR=… QA_SERVER_LOG=… npx playwright test` | **30 passed, 3 failed, 1 did not run.** N2 6/6, N1 7/7, N9 8/8, review-regression 2/2, auth 2/2, journey 5/6. Failed: `documents` and `onboarding` (non-N2, §5), and journey "admin verifies" (evidence moved to `/admin/evidence`) |
| `W env E2E_BASE_URL=… npx playwright test tests/e2e/journey.spec.ts` (after the fix) | **7 passed** |
| `W env E2E_BASE_URL=… npx playwright test tests/e2e/job-terms-card.spec.ts` | **6 passed** (also within the full run) |

The web server and my worker were stopped afterwards. A second `npm run worker` started at 21:10 by another session (connected to a remote HTTPS host, not the local stack) was left alone.

### 6.1 Final integration runs (11 files, 288 tests each, no reset between runs)

| Run | Result | The one failure |
|---|---|---|
| R1 | 287 passed, 1 failed | N9 QA "issuance audit…": `TypeError: fetch failed` right after the multi-minute DB dump test (idle keep-alive socket dropped). Fixed in the test: the dump skips `public.matches` data |
| R2 | 287 passed, 1 failed | N1 QA "the deadline is checked at filing… (AC-66)": 30 s timeout inside `drainQueue()`, which re-runs ~44 failing `match.job` retries (QA-PRE-01) |
| R3 | **288 passed** | (none) |
| R4 | 287 passed, 1 failed | Same N1 QA AC-66 drain timeout as R2 |

In all four runs every N2 suite (`terms-card` 25, `terms-hire-ledger` 18, `terms-card-qa` 27), `recruiter-record-scope`, `api-surface`, both N9 suites, `journey` and `tenant-isolation` passed. The only recurring failure is an N1 QA test whose 30 s budget is eaten by the failing-matcher backlog: an environment effect of QA-PRE-01 on a 3.3 GB local stack (2.3M match rows), not a product regression. Fixing QA-PRE-01 (or `supabase db reset`) removes it. I didn't widen that test's timeout so the symptom stays visible.

## 7. Not verified

- QA didn't walk through the fr / pt UI and checked 375px only on the pages E-RR covers (AC-69, AC-72 partial).
- UI-only states: share_salary auto-on for an existing never-open job (AC-11), the existing-referrals note (AC-13), nudge chips (AC-15), commissions list (AC-56), legacy displays (AC-65), negative tile and `higher` sentence (AC-52, AC-53), the hire dialog from a pipeline drop, and the hiring-side frozen estimate and sent list (AC-63). All are covered at the server layer above.
- The migration step itself (setting existing undelivered dates to NULL, not recomputing delivered ones) was checked by reading `20261116000100:117–119` and the invariant query, not by replaying a pre-N2 dump.

---

## 8. Fix verification (fix round: backend.md v2.1 + migration `20261116000500_terms_review_fixes.sql`; frontend.md "Fix round")

Environment: another session reset the local DB during the round (migrations through `…0500` applied; record-scope md5 still `dcd27209…`). I re-seeded through the test fixtures and didn't touch that session's processes. Its 21:10 worker is connected to a remote host; I left it alone.

### 8.1 Item by item

| Item | How verified | Result |
|---|---|---|
| **QA-PRE-01** matching chunked (100 ids), `describeError` | `matching-scale.test.ts` (620 candidates) passes. The worker drained a backlog of 170 match jobs on a stack with 4,147 candidates and 1,246 open jobs: 170 `job.ok`, 0 `job.failed`. **Backlog recovery** (QA-I "QA-PRE-01 backlog"): a dead `match.job` doesn't block new work (`app.enqueue` dedups only `queued` rows); requeuing it scores every existing candidate; any matching-relevant job edit enqueues a fresh job. The reset removed the old dead rows; on a stack that still has them, run `update public.background_jobs set status = 'queued', attempts = 0, last_error = null, run_at = now() where kind = 'match.job' and status = 'dead';` | **FIXED** (requeue procedure documented here; backend.md doesn't mention it) |
| **P16** `report_hire(p_terms_version)` → `hire_terms_changed` | QA-I "P16…": amendment recorded after the dialog read the version; then the stale snapshot id, null, omitted, a random uuid, another referral's effective id, another referral's amendment id and the job's current version are each refused with `hire_terms_changed`, with no placement, status still `offer` and no hire notification. A colleague still gets `forbidden` first. The correct amended id hires at 15%. A legacy referral with any `p_terms_version` gets `terms_not_recorded`, and without one still hires. **UI** (QA-E "fix round (P16)"): admin amends 20% → 15% while the dialog is open. **Record hire** shows the `hire_terms_changed` message, nothing is recorded, the typed base is kept, the auto-refresh shows "CAD 15,000.00", and resubmitting records C = 1,500,000 on the amendment. The action compares the posted id with a fresh server read, and the RPC re-checks under the row lock | **FIXED** |
| **QA-N2-02** I and base bounded; allocation raises `invalid_fee` | QA-I: I = 19,999 and 200,000,001 against C 2,000,000 → `hire_base_invalid`; I = 20,000 (C/100) accepted; base > 10^12 → `hire_base_invalid`. `allocate_placement` overflow → `invalid_fee`. SQL ↔ TS parity and the E1–E6 boundary cases still pass | **FIXED** for I and base. **Gap → QA-N2-07** (flat and minimum fees are unbounded) |
| **QA-N2-03** schema refuses a minimum on flat and a remedy with None | QA-U: both former `it.fails` are now plain passing tests (48/48). **UI** (QA-E "fix round (QA-N2-03)"): typing a minimum, switching to flat and choosing "No guarantee" publishes cleanly (flat 1,500,000, min null, remedy null). The hidden fields aren't posted | **FIXED** |
| **QA-N2-04** overview counts only partner-visible jobs | Code: `src/features/overview/data.ts:10/60` filter `getJobsTermsState(...).partner_visible` | **FIXED** (code review) |
| **QA-N2-05** expected share follows the effective terms | QA-I via `getReferralTerms`: frozen estimate 900,000; a guarantee-only amendment keeps it (both sides); a rate amendment → null (both sides); a flat amendment → exactly 450,000 | **FIXED** |
| **QA-N2-06** `dbNow` helper | `tests/integration/helpers.ts:213` | **FIXED** |
| Backend-flagged QA test bug (foreign rule) | `terms-card-qa` now picks a rule ≠ the referral's own, or inserts a retired one, and asserts they differ | **FIXED (QA)** |
| Frontend design B-1…B-4, polish, opportunities grid (311px) | QA-E "fix round (B-2 and shared components)", 375px in **en, fr and pt**, sourcing side: opportunities, referral page, sent list, placement, commissions. Hiring side: jobs list, job edit (card), received list, referral page, placement. **0px overflow on all 30 page × locale checks.** E-RR 375px job form, composer and admin overview pass | **FIXED**. Separate pre-existing issues found: QA-PRE-03, QA-PRE-04 |
| Shared components (focus helpers, kpi-tile, page grids) on N1/N9 screens | N1-E 7/7 (composer stop and warning, objection dialog with file, contest, admin reject, release, candidate page) and N9-E 8/8 (candidate page, resend, crash and failure flows, log check). The hiring side's received list (review queue) is in the 375px loop | **No regression** |
| Stale-key removal (copy P10) | Diffed `jobs.json` against HEAD: 7 removed leaf keys (the others were added and removed within the uncommitted tree). None is referenced statically, and the only dynamic `t(\`detail.${…}\`)` keys (`pipeline*`) exist in en, fr and pt. `messages.test.ts` passes. Every N2, N1 and N9 page rendered in E2E without a missing-key fallback | **No breakage** |

### 8.2 New findings in the fix round

| ID | Severity | Owner | Finding |
|---|---|---|---|
| **QA-N2-07** | **major** | backend | **Unbounded flat and minimum fees.** `save_job_terms` (`20261116000200`, validation block) and `admin_amend_referral_terms` (`20261116000400`) only check `> 0`. With `p_flat_fee_minor` or `p_min_fee_minor` = 9×10^18:<br>(a) `report_hire`'s new bound `v_i > v_c * 100` overflows → raw `bigint out of range` (`20261116000500:76`);<br>(b) **`get_opportunities` computes `allocate_minor(est.fee, …)` for that job and the whole RPC fails** for every partner org whose candidates match it. One hiring org can blank other orgs' opportunities lists. Reproduced with psql as an authenticated member: `ERROR: bigint out of range … app.allocate_minor … get_opportunities`. The same error made a backend test fail in run F1 while my probe jobs were open.<br>Tests: QA-I `QA-N2-07a` and `QA-N2-07b` (`it.fails` × 2 each; they close their jobs afterwards). Probe jobs left by earlier runs were closed (`accepts_external_referrals = false`).<br>**Fix:** bound both fees (≤ 10^12) in both RPCs plus a table check, and/or have `get_opportunities` guard the estimate |
| QA-PRE-03 | major (pre-existing; identical markup in HEAD) | frontend | **Job page horizontal scroll at 375px once a job has received referrals**: en 169px, fr 203px, pt 208px. The "Candidates submitted to you" list's `truncate` labels sit in an unconstrained grid track (`src/app/workspace/[orgSlug]/jobs/[jobId]/page.tsx:208` outer grid without a `minmax(0,1fr)` mobile track, `:243` list). This is the same class of issue as design B-2; frontend's checks didn't catch it because the reset DB had no received referrals. QA-E `QA-PRE-03` (`test.fail`) |
| QA-PRE-04 | minor (pre-existing) | frontend | Overview pipeline bar hover label ("Interviewing · 0 · 0% of the pipeline", `absolute bottom-full left-0`) overflows 11px at 375px in en. QA-E `QA-PRE-04` (`test.fail`) |
| QA-PRE-02 (update) | minor (pre-existing) | backend | Now visible in the UI: the opportunities page shows "To review 1000, 1,000 new", and the journey's job falls off the list on the large stack. The journey no longer asserts the list content |

### 8.3 Tests changed in this round (tests only)
- `tests/integration/terms-card-qa.test.ts`:
  - foreign-rule fix;
  - new **fix round verification** block: P16 ×2, QA-N2-02 bounds, QA-N2-05, QA-PRE-01 backlog;
  - QA-N2-07a and 07b (`it.fails`, with cleanup).
- `tests/e2e/job-terms-card.spec.ts`:
  - new: QA-N2-03 UI publish, P16 amend-while-open, 375px en/fr/pt loop, QA-PRE-03 and QA-PRE-04 (`test.fail`);
  - candidates get unique emails, because support's shared email and client would trigger N1 stops.
- `tests/e2e/journey.spec.ts`: the list assertion is relaxed (QA-PRE-02).

### 8.4 Commands (fix round; `W` = guarded wrapper, local stack only)

| Command | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | 24 files, **231 passed** (the QA-N2-03 cases are now plain passes) |
| `W npm run test:integration`, F1 | 1 failed / 297 passed / 2 expected-fail. Failure: `terms-card` BR-32 `get_opportunities` returned null. Cause: my QA-N2-07 probe jobs were open → `bigint out of range` (this is the finding). Probe jobs closed; tests now clean up |
| `W npm run test:integration`, F2 | **12 files, 298 passed, 4 expected-fail** (QA-N2-07a/b) |
| `W npm run test:integration`, F3 (directly after F2, no reset) | 1 failed / 297 passed / 4 expected-fail. Failure: N1 QA "the deadline is checked at filing… (AC-66)" 30 s timeout inside `drainQueue`. Matching now succeeds, but the stack holds 4,147 candidates × 1,246 open jobs (3.0M match rows), so a drain does real work. Test-budget effect of data growth, not a regression |
| `W npm run build` | exit 0 |
| `W env NODE_OPTIONS=--require <Resend stand-in> … next start -p 3117` + `W npm run worker` | worker: 170 `job.ok`, 0 `job.failed` |
| `W env E2E_BASE_URL=http://localhost:3117 QA_EMAIL_CAPTURE_DIR=… QA_SERVER_LOG=… npx playwright test` N2 + N1 + N9 + review-regression + journey | **28 passed** (N9 8/8, N1 7/7, N2 11/11 incl. 2 expected-fail `test.fail`, review-regression 2/2). Journey stopped at its list assertion (QA-PRE-02), then relaxed |
| `W … npx playwright test tests/e2e/journey.spec.ts` | **7 passed** |
| `W … npx playwright test tests/e2e/job-terms-card.spec.ts` | **11 passed** (2 of them expected failures) |

The web server and my worker were stopped. The other session's worker was not touched.

---

## 9. Fix round 2 verification (backend.md v2.2 + migration `20261116000600_terms_fee_bounds.sql`; frontend.md QA-PRE-03/04)

Environment: the local DB was the same one as in round 1, not reset again; migrations through `…0600` applied; record-scope md5 unchanged (`dcd27209…`). My web server and worker were stopped afterwards. The other session's 21:10 worker was not touched.

### 9.1 Review of the backend's edits to my tests
The backend's 07b counted a `terms_incomplete` refusal at publish as a pass but made the refusal **optional** (`if (refused !== null)`). Once refused, no huge-value job existed, so the test no longer proved that `get_opportunities` fails closed per row. It also looked the normal job up in the full list, which is capped at 1,000 rows (QA-PRE-02) and so is flaky. **Replaced** with strict tests:

| Test | What it proves | Result |
|---|---|---|
| QA-N2-07a (flat, minimum) | Publishing 9×10^18 → `terms_incomplete`; exactly 10^12 accepted; 10^12 + 1 refused | PASS |
| QA-N2-07b (flat, minimum) | The same values through **an admin amendment** → `terms_incomplete`; through **a service-role insert** into `job_terms_versions` → `job_terms_(flat|min)_fee_bound` check violation | PASS |
| QA-N2-07c | **Absurd salary band** (9×10^18 on both bounds, `share_salary` on; jobs don't bound salaries): the whole `get_opportunities` list returns without error, the normal job is still there (`p_match`), the bad row has `estimated_fee_minor` and `estimated_share_minor` null, and submitting to it works with `fee_estimate_minor` null. **This is the per-row fail-closed proof the original 07b intended** | PASS |
| QA-N2-07e | Connector/API path: `jobInputSchema` refuses salaries above 10^10 major units (accepts 10^10). The API can't inject an absurd band; the user client can (covered by 07c) | PASS |
| QA-N2-09 (× 3, `it.fails`) | Zero band (0–0, and min 0 / max blank) with `share_salary` on: the recorded and candidate paths should create the referral. **They return `failed`** | **BUG (major)** |
| QA-N2-08 (`it.fails`) | `allocate_placement(9e18, …, C = I)` should raise `invalid_fee`; it raises a raw `bigint out of range` | **BUG (minor)** |

Other probes:
- `report_hire` bounds are now compared in numeric (code review, `…0600`).
- `terms_estimate` returns NULL for a 2×10^12 flat fee and for an absurd band.
- `get_opportunities` keeps the record-scope filter.

### 9.2 Items

| Item | Result |
|---|---|
| QA-N2-07 fee bounds (RPCs, constraints, service role, amendments) | **FIXED** (07a, 07b) |
| QA-N2-07 `get_opportunities` fails closed per row | **FIXED** (07c, absurd band) |
| QA-N2-07 `report_hire` numeric bounds | **FIXED** (code review; 07a can no longer reach it because huge fees can't be stored) |
| QA-PRE-03 job page overflow at 375px | **FIXED**: QA-E "QA-PRE-03" passes as a normal test |
| QA-PRE-04 overview label overflow | **FIXED**: QA-E "QA-PRE-04" passes as a normal test |
| N2 375px loop (en/fr/pt, 30 checks) | still 0px |

### 9.3 New findings in round 2

| ID | Severity | Owner | Finding |
|---|---|---|---|
| **QA-N2-09** | **major** | backend | `app.terms_estimate` (`20261116000600`, `greatest(…, coalesce(p_min_fee_minor, 0))`) returns 0 for a zero or tiny band. `submit_referral` and `submit_referral_for_candidate` insert it as `fee_estimate_minor`, violating `CHECK (fee_estimate_minor > 0)` inside the no-raise block, so the outcome is `failed` for every partner, every time, and each attempt counts toward the rate limit. **Repro:** `select app.terms_estimate('pct_base', 2000, null, null, true, 0, 0)` → `0`. A job with `salary_min = 0` (form "0", or connector `salary.min: 0`), a blank or 0 max, `share_salary` on and a % card → any submission returns `failed`. **Fix:** `if v is null or v <= 0 or v > 10^12 then return null`. Tests: QA-N2-09 × 3 (`it.fails`) |
| QA-N2-08 | minor | backend | `record_payment_evidence` accepts any positive amount; on the I ≥ C (or legacy) path `allocate_placement` → `allocate_minor` overflows raw for P ≈ 9×10^18. Only absurd input reaches it, and it only affects that placement's review. **Fix:** bound the amount (≤ 10^12, like I) or wrap `allocate_minor` like the floor path. Test: QA-N2-08 (`it.fails`) |

Not verified in the browser: how the opportunity card renders a 9×10^18 salary band (the server returns it as stored when `share_salary` is on).

### 9.4 Commands (round 2; `W` = guarded wrapper, local stack only)

| Command | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | 24 files, **232 passed** |
| `W npm run test:integration`, G1 | **12 files, 307 passed, 4 expected-fail** (QA-N2-09 × 3, QA-N2-08) |
| `W npm run test:integration`, G2 (directly after G1, no reset) | **12 files, 307 passed, 4 expected-fail** |
| `W npm run build` | exit 0 |
| `W env NODE_OPTIONS=--require <Resend stand-in> … next start -p 3117` + `W npm run worker` | worker: 0 `job.failed` |
| `W env E2E_BASE_URL=http://localhost:3117 QA_EMAIL_CAPTURE_DIR=… QA_SERVER_LOG=… npx playwright test` N2 + N1 + N9 + review-regression + journey | **35 passed**: N9 8/8, N1 7/7, N2 11/11 (incl. QA-PRE-03 and QA-PRE-04, now normal tests, P16 amend-while-open, the QA-N2-03 UI publish, the 375px en/fr/pt loop), review-regression 2/2, journey 7/7 |

---

## 10. Fix round 3 verification (backend.md v2.3 + migration `20261116000700_terms_estimate_payment_bounds.sql`)

The migration is applied locally (latest version `20261116000700`). The record-scope md5 is unchanged (`dcd27209…`).

### 10.1 Items

| Item | How verified | Result |
|---|---|---|
| **QA-N2-09**: the estimate returns NULL for ≤ 0 | QA-N2-09 × 3 (now plain tests): 0–0 on the recorded path, min 0 / max blank on the recorded path, and 0–0 on the candidate path all return `created`. **New probe:** a 1–1 minor-unit band (estimate rounds to 0) freezes `fee_estimate_minor` null, submits on both paths, and the opportunities row has no estimate | **FIXED** |
| **QA-N2-08**: payment evidence bounded at 10^12; allocation bounded; `allocate_minor` in exact numeric | QA-N2-08 (now a plain test): `allocate_placement(9e18, …, I = C)` → `invalid_fee`. **New probes:** `record_payment_evidence` with 10^12 + 1 → `invalid_fee`, with exactly 10^12 → accepted; a service-role insert of 9×10^15 → `invalid_fee` (trigger); `allocate_placement(10^12 + 1, …)` on the legacy path → `invalid_fee`. `allocate_minor` SQL equals TS `allocateMinor` for 28 cases: ±1, ±3, 7, 123,456,789,011, 999,999,999,999 and ±10^12, across the 45/45/10, 33.33/33.34/33.33, 0/90/10 and 1/1/9998 splits | **FIXED** |
| Backend's rescaled SQL↔TS boundary case (P = I = 9×10^11, C = 9.5×10^11, `frozen`) | Same I < C frozen-basis path as before. The intermediate product (≈ 8.6×10^26) is still far beyond 2^53, so it still tests exact arithmetic; it just stays under the new payment bound | **Acceptable** |

### 10.2 Probe: zero or out-of-range money written into a CHECK column inside a no-raise block
- **Where the risk is:** the live DB has only two functions with `exception when others` around inserts, `submit_referral` and `submit_referral_for_candidate`. Inside those blocks they write `referrals`, `candidate_consents`, the candidate links, `app.referral_presentations`, `app.referral_commit_keys` and `referral_status_events`; through `deliver_referral` they also write shared profiles, document grants and messages; the candidate path also writes `referral_candidate_requests`.
- **Money:** the only money column among those tables' CHECK constraints is `referrals.fee_estimate_minor > 0`. It's now always NULL or within [1, 10^12] (QA-N2-09 tests plus the 1–1 probe).
- **Text:** the checked text columns are already validated or trimmed before the insert (consent scope and evidence, status reason ≤ 2000 via `left`, message body ≤ 4000 via `left`). One text column isn't covered: the candidate-path request note (`referral_candidate_requests.note` ≤ 4000) is inserted untrimmed, so a direct call with a note over 4000 characters returns a mapped `failed` outcome. That's N9 text, not money; the Server Action limits the note first. Noted, not a bug.
- **Outside no-raise blocks:**
  - `report_hire` with a computed fee that rounds to 0 (base = 1 minor unit) returns a mapped `invalid_fee` or `hire_base_invalid`, never a raw violation of `placements.computed_fee_minor > 0` (new probe).
  - The ledger has no money CHECKs, so zero-amount allocations are legal.

### 10.3 Commands (round 3; `W` = guarded wrapper, local stack only)

| Command | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | 24 files, **234 passed** |
| `W npm run test:integration`, H1 | **12 files, 317 passed** (no expected failures left) |
| `W npm run test:integration`, H2 (directly after H1, no reset) | 316 passed, 1 failed: N1 QA "the deadline is checked at filing… (AC-66)", 30 s timeout inside `drainQueue()`. This is the same environment effect seen in rounds 1–2: real matching work on a local stack with thousands of candidates × jobs. Every N2, N9, record-scope and journey test passed |
| `W npm run build` | exit 0 |
| `W env NODE_OPTIONS=--require <Resend stand-in> … next start -p 3117` + `W npm run worker` | worker: 0 `job.failed` |
| `W env E2E_BASE_URL=http://localhost:3117 QA_EMAIL_CAPTURE_DIR=… QA_SERVER_LOG=… npx playwright test` N2 + N1 + N9 + review-regression + journey | **35 passed** (N9 8, N1 7, N2 11, review-regression 2, journey 7) |

---

## 11. F-0/F-1 re-check (2026-11-16)

Scope: follow-up **F-1** (acceptance.md §3.3, PD-062; backend.md "v2.4 / F-1"; frontend.md "F-1") and **F-0** (docs). Migration `20261116000800_terms_amendment_currency.sql` is applied locally (latest version `20261116000800`). The record-scope md5 was checked before and after: `dcd272097bdb90c8311662bf3752e01e`, unchanged. No db reset was needed or done. Local stack only (`127.0.0.1:55321/55322`) through a guarded wrapper (`W`, scratchpad `local-env.sh`: presets every Supabase variable to the local stack so dotenv/@next/env never take hosted values; refuses non-`127.0.0.1` URLs and port 3000; email and OpenAI disabled). No hosted access, no `.env.local` edit, port 3000 never used.

### Verdict: **PASS**

F-1 works as contracted at the RPC, the Server Action and the UI. No blocker, no major. Two minor findings and three doc notes below; none blocks launch.

### 11.1 AC / item → tests → result

| Item | Test(s) | Result |
|---|---|---|
| **AC-58** (amendment recorded, notifications, audit, both sides see it) | E2E "a platform admin records a concierge amendment… (AC-58, AC-61)"; integration `terms-card-qa` "concierge amendment abuse…" ×3; `terms-hire-ledger` amendments | PASS |
| **AC-60** (T9 locked after delivery, forged T9 refused, undelivered T9 used at delivery, nothing else moves) | `terms-card-qa` "undelivered referral: a T9 amendment applies at delivery…", "delivered referral: … no ownership date, claim deadline, split or rule…" | PASS |
| **F-1 server rule**: flat CAD → % on a USD job stores USD; lookup returns `job_salary_currency` / `pct_amendment_currency`; % → % keeps USD after salary moves to EUR | `terms-hire-ledger` "F-1" ×2 (backend) | PASS |
| **F-1 server refusal**: flat → % with no salary currency → `terms_incomplete`, never NOT NULL, nothing written | `terms-hire-ledger` "F-1" (rolled-back DDL) | PASS |
| **F-1 action, exponent**: flat CAD → % on a **JPY** job, minimum "150000" + forged `currency=CAD` → stored `pct_base:JPY:150000` (CAD parsing would give 15,000,000); "1500.50" → `minimumPositive` field error, nothing written | new `terms-amend-action-qa` #1 | PASS |
| **F-1 action, forged currency ignored**: USD job, minimum "12,500.25" + `currency=xx` → `pct_base:USD:1250025`; then salary → EUR, `currency=EUR` posted → still USD (% → %) | `terms-amend-action-qa` #2 | PASS |
| **Flat amendment**: `flatCurrency=GBP` + forged `currency=BRL` → `flat:GBP`; no `flatCurrency` → refused; `flatCurrency=JPY` → refused; nothing extra written | `terms-amend-action-qa` #3 | PASS (see QA-N2-10) |
| **% basis with `pct_amendment_currency` null** (salary currency nulled; constraint relaxed and restored in `finally`): `pct_base`, `pct_total_cash`, `garbage`, `""` → `errors.terms_incomplete`; flat still works; column NOT NULL again after | `terms-amend-action-qa` #4 | PASS |
| **Non-admin callers** (sourcing admin, hiring admin, outsider org): `errors.forbidden` for an existing and an unknown id alike (no oracle); `admin_get_referral_terms` → `not_found`, so `pct_amendment_currency` doesn't leak; 0 versions written | `terms-amend-action-qa` #5 | PASS |
| **Unknown / malformed id, anon**: unknown id (flat and %) → `errors.not_found`; `"not-a-uuid'; drop table x;--"` → `errors.invalidFields`, input not echoed; anonymous caller → `errors.forbidden` | `terms-amend-action-qa` #6 | PASS |
| **Other forged fields**: no `bothRequested` → field error; `flatFee`/`flatCurrency`/`p_both_requested=false`/`p_flat_currency` posted on a % basis are dropped, stored `pct_base:USD`, no flat amount | `terms-amend-action-qa` #7 | PASS |
| **Legacy referral** (no snapshot): flat → `errors.amendment_legacy_referral`; % → `errors.terms_incomplete`; 0 versions | `terms-amend-action-qa` #8 | PASS (note, QA-N2-11) |
| **F-1 UI**: flat CAD referral on a USD job; admin picks "% of base salary", minimum 5000 → the minimum unit shows **USD** (no CAD); the confirmation lists "Fee currency" CAD → USD and "USD 5,000.00"; stored `pct_base:USD`, rate 2000, min 500000, no flat amount | new E2E "F-1 re-check: flat CAD → % on a USD-salaried job…" | PASS |

How the action tests work: `tests/integration/terms-amend-action-qa.test.ts` calls the real `amendReferralTerms` with forged `FormData` (real `guard`, Zod, `getSessionUser`, lookup and RPC against the local DB). Only the Next request plumbing is replaced: `createClient()` returns the acting test user's signed-in client (RLS and `auth.uid()` apply), `getGlobalT()` returns message keys, and `revalidatePath` is a no-op.

Code review notes (no finding): the action reads the lookup before parsing and overwrites any posted `currency` with `flatCurrency` (flat) or `pct_amendment_currency` (%); `p_flat_currency` is sent only on flat; `p_both_requested` is hard-coded `true` after the `bothRequested === "on"` check. The RPC's new guard runs before the bounds check, so the error is never a raw NOT NULL error. `pct_amendment_currency` matches the RPC's currency choice in every branch (effective %, effective flat, no effective version).

### 11.2 Findings

| ID | Severity | Owner | Finding |
|---|---|---|---|
| **QA-N2-12** | minor | backend (+ frontend) | **The stored % currency can differ from the one the admin confirmed.** The form labels and the confirmation use `pct_amendment_currency` from page load. The action reads the lookup again at submit, and the RPC reads `jobs.salary_currency` again. Neither checks it against what the admin saw. **Repro:** flat CAD referral on a USD job; the admin opens `/admin/referrals/<id>`, picks % and types minimum 5000 (confirmation shows "USD 5,000.00"). Before they confirm, B changes the job's salary currency to JPY. Result: the amendment is stored as `pct_base:JPY`, min 5000 (≈ USD 33). With "5000.50" the admin gets an unexplained `minimumPositive` error instead. Only flat → % is affected; % → % keeps the effective currency. It's rare (concierge only, B must edit the job during the admin's session), so it doesn't block launch. **Fix:** post the currency shown (hidden `expectedPctCurrency`). The action refuses with a stale-terms error when it differs from the fresh lookup, and the RPC could take a `p_expected_currency` too. Not covered by a test: the race can't be made deterministic without a hook. |
| **QA-N2-10** | minor (cosmetic, forged-only) | frontend/backend (action schema) | A flat post with no `flatCurrency` returns `{error: errors.invalidFields, fieldErrors: {currency: [errors.terms_incomplete]}}`. The error lands on the derived `currency` key, which the form doesn't render, not on `flatCurrency`: the base object fails, so the transform's `flatCurrency` issue never runs. The real form always posts a select value, so only forged posts reach it. `src/features/admin/actions.ts:127` and `:176`. Asserted as observed in `terms-amend-action-qa` #3. |
| **QA-N2-11** | note | backend | On a legacy referral the action answers `% → errors.terms_incomplete` but `flat → errors.amendment_legacy_referral`: the `pct_amendment_currency` null check (`actions.ts:175`) runs before the RPC's legacy check. The page never renders the form for legacy referrals, so only forged posts see it. Both errors are mapped and nothing is written. Consistent with backend.md ("Null (or no recorded terms) → … refused"). |

### 11.3 F-0 docs check (`docs/domain-model.md`, `docs/security-and-privacy.md`)

I checked each claim against the code and the local DB (`pg_trigger`, `information_schema.role_table_grants`, `pg_proc.proacl`, migration bodies). **Accurate:**
- The amendment rules: admin-only, before a hire, any status, snapshot only, two references + reason, no split/rule/client-key/date change, T9 refused after delivery, the agreement repointed. The **F-1 currency sentence** ("unchanged on % → %; flat → % takes the job's current salary currency (refused without one)") matches the RPC.
- `job_terms_versions` is insert-only by trigger (`job_terms_versions_immutable` BEFORE UPDATE OR DELETE, all roles). `authenticated` has SELECT only; `anon` has nothing.
- `app.terms_amendment_notes` and `app.referral_commit_keys` grant nothing beyond `postgres`, and `anon` has no `app` usage. RLS is on.
- Both admin RPCs are on the `api-surface.test.ts` allow-list (line 69). Rate limit `admin.amend` 30/h. Non-admin `admin_get_referral_terms` → `not_found`.
- T1–T9 ranges (rate 1–50 %, guarantee set, payment 0–90, window 6–12) and the 10^12 bounds.

**Inaccurate or incomplete (doc fixes, owner backend-engineer; none blocks):**
1. `docs/domain-model.md` "Snapshot at commit": `fee_estimate_minor` is said to be "null when the salary band was private, absent or yields 0". It is also null when the estimate is above 10^12 or the computation fails (`app.terms_estimate` returns NULL outside (0, 10^12]; QA-N2-07c). security-and-privacy states it correctly.
2. `docs/security-and-privacy.md` N2 section: the amendment bullet doesn't say that non-admin callers of `admin_amend_referral_terms` get `forbidden`, while `admin_get_referral_terms` gives `not_found`. That's an intentional asymmetry (backend.md §8.8) worth recording so nobody "fixes" it.
3. Pre-existing, not F-0: `docs/security-and-privacy.md` "Open items" still says "Rate limiting is currently Supabase Auth's built-in only; add app-level limits". That contradicts the app-level rate-limit table in the same file (e.g. `admin.amend` 30/h, `consume_rate_limit`). Stale since commit `23aba6c`.

### 11.4 Commands (`W` = guarded wrapper, local stack only)

| Command | Result |
|---|---|
| `md5 supabase/migrations/20261115000300_recruiter_record_scope.sql` (before and after) | `dcd272097bdb90c8311662bf3752e01e` both times |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 (`next typegen && tsc --noEmit`) |
| `npm test` | 24 files, **234 passed** |
| `W npx vitest run -c vitest.integration.config.mts tests/integration/terms-amend-action-qa.test.ts` | **8 passed** |
| `W npm run test:integration` | **13 files, 326 passed, 1 failed**: `duplicate-presentation-qa` "the deadline is checked at filing… (AC-66)" — `Error: Test timed out in 30000ms` (the same `drainQueue()` environment timeout as rounds 1–3). Every N2 test passed, including the backend F-1 tests and the 8 new ones |
| `W npx vitest run … duplicate-presentation-qa.test.ts -t "AC-66"` | 6 passed, 52 skipped (passes alone) |
| `W npm run build` | exit 0 |
| `W npx next start -p 3117` + `W npm run worker` | started; worker log: 0 `job.failed` |
| `E2E_BASE_URL=http://localhost:3117 W npx playwright test tests/e2e/job-terms-card.spec.ts`, first try (before the worker was started) | 2 passed, 1 failed (`match was not computed — is the worker running`), 9 did not run |
| the same, with the worker | **12 passed** (N2 11 + the new F-1 E2E), 49.3 s |

Not run: the N1/N9/journey/review-regression E2E specs. F-1 doesn't touch them, and no admin-amendment flow lives there.

Environment notes:
- The worker printed `injected env (1) from .env.local`: one variable the wrapper doesn't preset was loaded. Every Supabase URL/key was preset to the local stack (dotenv doesn't override), and the local-stack assertions passed. I didn't read `.env.local`.
- The user's `next dev` on port 3000 (pid 51118), which was running at the start, was **no longer running** at the end of this session. My cleanup only targeted `next start -p 3117` and `scripts/worker.mts`, and nothing was bound to port 3000 by me. It may have exited during `next build` (same `.next` dir), or the user may have stopped it. Restart it with `npm run dev` if needed.

### 11.5 Test files changed (tests only)
- New: `tests/integration/terms-amend-action-qa.test.ts` (8 tests: Server Action forged-payload probes).
- Edited: `tests/e2e/job-terms-card.spec.ts` (+1 test, "F-1 re-check: flat CAD → % on a USD-salaried job…").
