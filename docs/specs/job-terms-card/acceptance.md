# Acceptance: Job terms card, frozen into the agreement (N2)

Owner: Product Manager · Date: 2026-11-16 · Slug: `job-terms-card` · Roadmap: **N2**
Read against [`brief.md`](./brief.md) rev. 2: [`spec.md`](./spec.md) (71 active ACs), [`backend.md`](./backend.md) v2.3, [`frontend.md`](./frontend.md) (5a, 5b, fix round, QA-PRE-03/04), [`qa-report.md`](./qa-report.md) (final verdict PASS after fix round 3), [`design-review.md`](./design-review.md), [`copy-review.md`](./copy-review.md). Decisions: PD-044 to PD-052, **PD-059 to PD-064** (this acceptance).

## Verdict: **ACCEPTED**, with one docs-only condition

N2 does what the brief set out to do. Before A commits a candidate, A sees the job's structured terms. Those exact terms become the agreement, the hire report and the ledger, and B can't change them afterwards without a recorded concierge amendment. All five trust breaks in recruiting-input §1.4 are closed: an unseen guarantee, a discount at offer, restructuring the fee, a short window claimed after the fact, and an undisclosed shared search.

**Condition (docs only, no code, doesn't reopen QA):** the brief's definition of done asks for `docs/domain-model.md` and `docs/security-and-privacy.md` to be updated. Neither mentions N2 yet (no terms versions, snapshot columns, `platform_basis`, placement C/I/base/bonus, or the closed `app.referral_commit_keys` / `app.terms_amendment_notes`). Owner: **backend-engineer**. Due: before the N3 brief is handed to backend, and before any hosted push. I updated `docs/product-flows.md` myself. The launch-checklist line for N2 is ticked: the product is accepted, and the docs gap is tracked as follow-up F-0.

The main session independently confirmed lint, typecheck, 234 unit tests and the N2 / N9 / record-scope integration suites (134 passed). QA's final runs are 317/317 integration (H1) and 35/35 E2E across N1, N9, N2, review-regression and the journey.

---

## 1. Definition of done (brief §10)

| DoD item | Evidence | Result |
|---|---|---|
| Every Must BR and Should 4 has ACs in `spec.md` that pass in `qa-report.md` with real output; no open blocker or major | qa-report §4.1–4.3: 71 active ACs, BR-1 to BR-38, 19 scenarios PASS. QA-N2-02 to 09 and QA-PRE-01/03/04 are fixed and verified (§8–§10). No open N2 blocker or major. Should 4 (Brazil and retainer helpers) is in spec §5 and shipped | **Met** (UI-only gaps, §3.4) |
| BR-39 to BR-41 out of N2 | AC-14 → N3; AC-49, AC-66, AC-67, AC-68 → N2.1 (qa-report §4.1) | **Met** |
| Both drops landed; `hire_terms_pending` gone | qa-report §2: one `report_hire` overload, and no function body contains `hire_terms_pending`. backend.md v2 header | **Met** |
| Design and copy reviews have no open blocker; en / fr-CA / pt-BR complete | Design B-1 to B-4 fixed (frontend.md fix round; QA 375px loop, 0px overflow on 30 page × locale checks). Copy B1 fixed (`descriptionSnapshot`). `messages.test.ts` shows the same keys in all three locales | **Met** |
| U-1 recorded; rule basis `collected` | PD-049. The agreement in QA-E 3 references 4500 bps, `collected` | **Met** |
| `backend.md`, `frontend.md` written; domain-model, product-flows, security-and-privacy updated | backend.md v2.3 and frontend.md complete. product-flows updated by PM today. **domain-model and security-and-privacy not updated** | **Partly met** → F-0 |
| Migrations local only; hosted-push precondition on the launch checklist | backend.md, qa-report environment notes (guarded wrapper, `127.0.0.1` only). Launch checklist extended today (§5) | **Met** |
| Roadmap N2 accepted, launch-checklist line ticked, implementation plan in sync | Done in this acceptance | **Met** |

## 2. Against the brief

### 2.1 Scope
- **All 14 Musts shipped.** The PD-050 trim (c) is honoured: the sent list shows basis and rate per referral, with no share (BR-36; AC-63 server-side).
- **Should 4 shipped.** Shoulds 1 and 3 went to N2.1 and Should 2 to N3, as PD-050 decided.
- **No Won't item crept in.**

### 2.2 Business rules worth calling out
- **BR-3 (one predicate everywhere):** QA searched the live DB for inline copies of the flag check. Only the predicate itself, `on_job_change`, `save_job_terms` and the legacy delivery branch read it, as designed. A hidden job returns the same error as a job that doesn't exist (AC-16).
- **BR-12 (`terms_changed`):** null, stale, foreign, random and amendment ids all get the same response, with no side effect and a rate-limit count (AC-24 to AC-26). No existence oracle.
- **BR-27 / BR-28 (floor, `collected`):** SQL ↔ TS parity holds on 400 allocation cases and 200 fee cases. After the round-3 rewrite, `allocate_minor` uses exact numeric and matches TS across the boundary cases. The I ≥ C path still equals today's split.
- **N1 / N9 intact (BR-14, BR-15, BR-20):** N1 E2E 7/7 and N9 E2E 8/8. The commit key never appears in any response or in audit metadata.
- **Record scope (RD-036):** the 8 copied functions differ from `20261115000300` only by `-- N2` edits, and the md5 is unchanged (qa-report §2). See §4, coordination risk.

### 2.3 Deviations accepted
- **backend.md §8 items 1 to 10, all accepted:**
  - the job and the card aren't saved in one transaction (deterministic refusals happen before any write);
  - no `job.terms_published` audit event (the version row is the record);
  - `terms_changed` for forged ids;
  - an RLS read plus a context RPC instead of a single `get_referral_terms`;
  - `not_found` for non-admins on the admin lookup.
  None of them weakens a BR.
- **P16 (copy-review) and QA-N2-05 were real trust fixes** and are accepted as built:
  - `report_hire(p_terms_version)` refuses a hire dialog that was opened before an amendment (`hire_terms_changed`);
  - the expected share goes null when an amendment changes the fee.
  This tightens BR-36 for amended referrals (decision PD-060).
- **Fee and payment bounds (≤ 10^12 minor units)** on flat and minimum fees, I, the base and payment evidence are accepted as product rules. No real fee comes near them.

### 2.4 Metrics (brief §4): instrumentation status
| Metric | Can we measure it at launch? |
|---|---|
| % partner-visible jobs with a complete card | Yes, 100% by construction. Admin overview count (AC-76) |
| Referral-open jobs completing the card within 14 days | Yes, by SQL on `job_terms_versions` (first version vs ship date). Baseline = the hosted count taken before the push (§5) |
| Submissions per active partner job | Yes, by SQL. **Baseline needed:** Ops records the pre-push value with the hosted counts |
| % hires with I ≠ C | SQL until the N2.1 panel |
| Card completion time < 2 min | Founding-member usability sessions (not instrumented, by design) |
| Terms disputes per 100 accepted referrals; "terms" decline/dispute reason | Concierge tagging until a category field exists |
| Window ≠ 6 months; amendments per 20 referrals | SQL until N2.1 |
| Worsening flag | N2.1 |

No metric is blocked. The only new action is to record the submissions-per-job baseline at push time (launch checklist, Ops).

---

## 3. Known items: judgement and owner

### 3.1 Effort: about 16.5 backend days against ~14.25 accepted (decision PD-059)
- **The overrun is accepted.** It's +2.25 days (about 16%), at the top of the range we accepted (12.5–16.5), not outside it.
- **Where it went:** the build itself fit. The overrun came from three review rounds that found real defects:
  - a cross-tenant availability bug, where one org's absurd fee blanked other orgs' opportunity lists (QA-N2-07);
  - every submission failing on a zero salary band, BR-10's default case (QA-N2-09);
  - a hire recorded at a fee the user never saw after an amendment (P16);
  - QA-PRE-01, the pre-existing matching-at-scale failure that N2 relies on, because publishing a card is what triggers matching. It isn't N2 scope, but shipping N2 without it would have made new partner jobs undiscoverable.
  Security, tenant isolation and money correctness are hard constraints, so this was the right use of time. Trimming any of it to hold the estimate would have been the wrong call.
- **What we learn:**
  1. R-13's end-of-drop-1 checkpoint doesn't appear in the files, and it wouldn't have caught this anyway, because the overrun came in the fix loop.
  2. Estimates for money features should carry an explicit **fix-loop buffer of about 15%**, plus an **input-bounds line item**: every money input bounded at the RPC and the table, and every estimate failing closed per row.
  3. **Applied to the open work:** the N10 estimate (about 16.5 d) and the N3 estimate must show both lines. Backend includes the bounds checklist in `backend.md` as standard (PD-059).

### 3.2 Design polish not done
| Item | Judgement | Owner · when |
|---|---|---|
| **P-4** reason placeholder ("—" reads like a value) | Polish. Needs a key | ux-writer (key `referrals.hire.reasonPlaceholder` en/fr/pt) → frontend · **N2.1** |
| **P-8** no "Changed" badge when only a % job's currency changes | Edge of AC-24; the job is hidden on a currency mismatch anyway until republished | frontend · **N2.1** |
| **P-11** "CAD" fallback when `fee_currency` is null | Can't happen on a partner-visible job (the terms currency is NOT NULL), but a guessed currency label is a trust smell | frontend · **N2.1** |
| **P-14** "Edit terms" deep link on a closed-to-partners job lands nowhere | Polish | frontend · **N2.1** |
| **P-16** owner estimate box shows the fee only | **Accepted as built** (PD-061). B needs the fee, and B's split is on the referral and placement pages. Recorded so design doesn't re-raise it | — closed |
| **P-17** negative amount hint not announced (`aria-describedby` on a `<p>`) | Accessibility, AA-relevant on the placement page | frontend · **N2.1** (checked in the launch accessibility pass) |
| **P-20** amendment form uses the flat currency when switching flat → % | **Decided via Q-R1** (§3.3). Needs a small fix **before launch** (F-1) | backend + frontend · **before launch** |
| **P-21** inputs and selects are 40px | Design-system item, not N2 | frontend · Engineering hygiene (with N1 polish item 17) |
| Copy P8, P9, P14 (admin date-prefix label, unused `viewPlacement`, amendment forged-value message) | Not recorded as applied in frontend.md. Admin-only | ux-writer confirms → frontend · **N2.1** |

### 3.3 Q-R1 answered (decision PD-062)
**Question:** when an admin amendment switches the basis from flat to %, is the % currency the job's current salary currency or the referral's original currency?

**Answer: the job's current salary currency. This is what the server already does** (`admin_amend_referral_terms`, `20261116000600:216–219`).
- BR-1 T4 says a % fee is computed on the salary, so it is in the salary's currency. The base B reports at hire is in that currency.
- A referral that was flat has no "original %" currency. The flat currency was B's invoicing choice and says nothing about the salary.
- If the job's salary currency changed after the snapshot, the current one is the best evidence of what the candidate will be paid in. Both orgs requested the amendment in writing, and the admin confirms it on screen.
- % → % amendments keep the effective currency (server, unchanged). That's right, since the hire base is entered in it.

**What must change (F-1, before launch):** today the UI is the problem, not the server.
- The amendment form labels and **parses** amounts with the effective (flat) currency. The confirmation would show the wrong code.
- A minimum fee typed in a currency with a different minor-unit exponent would be stored at the wrong scale.

Fix:
- **backend-engineer:**
  - `admin_get_referral_terms` returns the job's `salary_currency`;
  - the RPC refuses a flat → % amendment when the job has no salary currency (`terms_incomplete`, never a raw NOT NULL error);
  - integration test: flat CAD → % on a USD job stores USD.
- **frontend-engineer:** when the chosen basis is % and the effective basis is flat, the form, the confirmation diff and the posted `currency` use that salary currency.
- **qa-engineer:** re-runs AC-58 and AC-60 plus the new case.

Effort: about 0.5 d in total. No hosted impact (no amendments exist). It isn't a blocker for acceptance, because concierge amendments only start with the founding group. It is a launch-checklist item.

### 3.4 UI-only ACs not re-run by QA (qa-report §4.1, §7)
- **The UI-only gaps are accepted for N2 acceptance** (PD-063). Every one of these ACs passes at the server layer, and frontend's visual pass and the code-only design review covered the screens:
  - AC-11, AC-13, AC-15 chips, AC-52/53 tiles, AC-56, AC-63 hiring-side and sent list, AC-65;
  - AC-69 fr/pt walk-through, AC-72 hire dialog and Fee panel at 375px;
  - legacy dialog variants.
- **Legacy variants are the real gap.** No legacy referral exists locally, so the legacy hire alert, the legacy Fee panel, the legacy agreement dialog and AC-65 were never rendered. The hosted DB may hold pre-N2 referrals.
- **Owner: qa-engineer, before launch**, in the same browser session as N1's AC-61/AC-62 accessibility pass:
  - seed a legacy referral through a service-role fixture and walk the legacy variants;
  - run the listed ACs in en, fr and pt at 375px and in dark mode;
  - product-designer spot-checks.
  A blocker found there reopens N2 for that screen only.

### 3.5 QA-PRE-02: `get_opportunities` has no pagination and is capped at 1,000 rows
- Pre-existing, not N2. It's now user-visible as "1,000 new", which is a **wrong number** shown to a member, a small trust issue.
- At founding-group scale (30–50 orgs, ≥ 150 jobs) no candidate gets close to 1,000 live matches, so it can't occur at launch. It grows with the network, though.
- **Decision (PD-063):** Engineering hygiene, merged with the existing journey-test row. **Owners:** backend-engineer (a page or limit parameter, plus a separate exact count) → frontend-engineer (a "1,000+" or paged list). **Due: before launch** (S). Never shown silently truncated.

### 3.6 N1 QA AC-66 30 s budget on a long-lived local stack
- This is a test-infra effect of millions of match rows on a local DB that's never reset. It isn't a regression: the run passed after a reset (R3), and CI runs on a fresh `supabase start`.
- **Owner: qa-engineer.** Either the test drains only its own jobs, or the suite documents "reset before a full run". Batched with Engineering hygiene, due before launch (full suite green). Don't widen the timeout blindly (QA's call stands).

### 3.7 E-19 post-hire credit-note gap
Already decided (PD-052, R-11): the "short-paid" marker and the admin allocation adjustment go to **X6**, and X1 consumes them. It can't occur before the first placements. Until then, the dispute playbook settles it off-ledger and records the outcome. That sentence is now in the Ops playbook item of the launch checklist. No new action.

### 3.8 N2.1 and S2
- **N2.1 grows slightly:** BR-39 (worsening flag, RD-032), BR-41 (below-band alert, closed `app` table), the admin metrics panel, **plus the N2 polish batch** in §3.2. It's not a launch gate, it's S, and it's sequenced after N3's build starts (PD-064).
- **S2 (client-name gate):** unchanged. It stays the **N3 prerequisite** (PD-050, roadmap N3), and the N3 brief includes it.

---

## 4. Coordination risk: record-scope migration copies (PD-064)
- Another session of the user owns `supabase/migrations/20261115000300_recruiter_record_scope.sql` (uncommitted). N2 redefines 8 of its functions as copies with `-- N2` edits:
  - `assert_referable`, `assert_own_match`, `mark_matches_seen`;
  - `get_opportunities`, `get_sent_referral_jobs`, `get_referral_presentation`;
  - `report_hire`, `review_payment_evidence`.
- Postgres keeps the **last** definition. Any later edit to the record-scope file is therefore silently overridden by N2's copies, unless it's re-synced into a migration that sorts after N2.
- QA verified the copies against md5 `dcd272097bdb90c8311662bf3752e01e`.
- **Rules:**
  1. Nobody edits `20261115000300` again. Any change to those 8 functions goes in a **new** migration dated after `20261116000700`, starting from the N2 body.
  2. Before any hosted push, check the record-scope file's md5. If it differs from `dcd27209…`, stop and have backend re-sync and QA re-run `recruiter-record-scope.test.ts` plus the N2 suites.
  3. The user's other session should know this. The main session tells the user (**Needs user attention**).
- On the launch checklist (Ops) and in the roadmap (N2 notes, Engineering hygiene).

## 5. Hosted push (only when the user asks): N1, N9 and N2 go together
Preconditions, all on the launch checklist (Ops):
1. **N1:** the migration role can create the `storage.objects` trigger (existing item).
2. **N9:** the R-2 count of confirmed pre-N9 requests (existing item).
3. **N2 counts:** referral-open jobs (they become hidden until their card is completed) and undelivered pre-N2 referrals. Real member data → **Needs user decision** (recommendation: push; owners complete cards from the nudge). Also record the **submissions-per-partner-job baseline** for the N2 metric.
4. **N2 check constraints:**
   - `select count(*) from public.payment_evidence where amount_minor > 1000000000000;` must be 0, or migration `20261116000700` aborts.
   - `job_terms_versions` is created in the same push, so its bound check (`20261116000600`) can only fail if a partial earlier push left rows. Confirm that the table doesn't exist or is empty.
5. **Record-scope md5** unchanged (§4).
6. After the push, confirm that migrations `20261116000100` to `20261116000700` are applied and that `report_hire` has one overload.

No push of N2 without N1 and N9 (N2's copies depend on their function bodies), and none without the user's request.

---

## 6. Follow-ups

| # | Item | Owner | Due | Blocks |
|---|---|---|---|---|
| F-0 | Update `docs/domain-model.md` (terms versions, snapshot columns, nullable ownership date, `platform_basis`, placement C/I/base/bonus/reason, BR-27 allocation) and `docs/security-and-privacy.md` (base/bonus visibility, closed `app.referral_commit_keys` and `app.terms_amendment_notes`, money bounds) | backend-engineer | Before the N3 backend handoff and before any hosted push | N2 DoD closure |
| F-1 | Q-R1 / P-20: flat → % amendment currency in the admin form (§3.3) | backend → frontend → qa | Before launch | launch checklist |
| F-2 | Browser pass of the UI-only ACs and legacy variants, en/fr/pt, 375px, dark (§3.4) | qa-engineer, product-designer spot-check | Before launch (with N1 AC-61/62) | launch checklist |
| F-3 | QA-PRE-02 pagination and an exact count (§3.5) | backend → frontend | Before launch | — |
| F-4 | N1 AC-66 test budget on long-lived stacks (§3.6) | qa-engineer | Before launch | full-suite-green item |
| F-5 | Polish batch P-4, P-8, P-11, P-14, P-17; copy P8, P9, P14 | ux-writer → frontend | With N2.1 | — |
| F-6 | P-21 input height 44px | frontend | Engineering hygiene | — |
| F-7 | Record-scope md5 check and re-sync rule (§4) | backend / Ops | Every hosted push; every edit to those 8 functions | hosted push |
| F-8 | Fix-loop buffer and money-bounds line in the N3 and N10 estimates (§3.1) | backend-engineer | At each estimate | — |
| — | E-19 → X6 / X1 (PD-052); S2 → N3 prerequisite; S1, S3, metrics panel → N2.1 | as roadmap | as roadmap | — |

## 7. Needs the user
- **Hosted push** of N1 + N9 + N2: only on your request, after the §5 checks. If the counts show real member data, it's your call (recommendation: push).
- **Coordination:** tell the session that owns `20261115000300_recruiter_record_scope.sql` not to edit it any further. Changes to those 8 functions go in a new migration after N2 (§4).
- Nothing in N2 waits on a pricing or legal decision. The ⚖️ counsel items (brief §8.3) ship as draft lines and go to N7.

## 8. Recommended next step
**The N3 brief (referral-level claims and two-sided hire reporting).** Every input is now in place:
- N1, N9 and N2 are accepted;
- RD-029, RD-030 and RD-033 are decided;
- N9's O-1 and the S2 client-name gate are its listed prerequisites.

N3 is the next launch gate on the build track, and it's what makes the ownership window N2 now stores enforceable. In parallel:
- F-0 (docs, backend);
- the N10 spec freeze, already under way.

F-1 to F-4 are small and can be done by whichever agent is free before N3 QA.
