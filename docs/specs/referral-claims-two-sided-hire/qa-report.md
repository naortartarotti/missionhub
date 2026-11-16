# QA report: Referral-level claims and two-sided hire reporting (N3)

Owner: QA Engineer · Date: 2026-11-16 · Inputs: brief rev. 2 (BR-1 to BR-45, §9.2), spec rev. 2.1 (104 ACs), backend.md v1 + v2, frontend.md (drop 1 + drop 2), PD-071 to PD-078.
Environment: local Supabase only (`127.0.0.1:55321/55322`), through the guarded wrapper `local-env.sh`. No hosted project, no `.env.local` values for Supabase. No `db reset` was run. The record-scope md5 was checked before the runs: `dcd272097bdb90c8311662bf3752e01e` (matches).

## Verdict: **FAIL**

There is 1 blocker and 3 majors. Everything else in N3 holds up well under adversarial testing: no-oracle refusals, IDOR, side shaping, `not_this_client` privacy, the evidence pipeline, the money and date bounds, the silence gate with seeded N7 records, the suspended B, and the job-owner-less B. The fixes are small and well located.

| # | Severity | Owner | Bug |
|---|---|---|---|
| QA-N3-01 | **blocker** | backend | The admin **uphold** fails with `not_pipeline_owner` when the referral is still `accepted` / `interviewing` / `offer` |
| QA-N3-02 | major | backend | The per-user filing limit (BR-20, the N1 disputes bucket 5/h) never triggers: refusals roll back their own rate-limit hit |
| QA-N3-03 | major | backend | The HA-1 Ops query (AC-84) fails: `relation "public.hire_reports" does not exist` (the table is `app.hire_reports`) |
| QA-N3-04 | major | frontend | The success feedback is lost after a record-only hire (AC-23 / AC-26 result state) and after fee details (AC-70 toast): the dialog unmounts on revalidation |
| QA-N3-05 | minor | backend | Reminders: when the day-5 and day-8 reminders are both due in one sweep, B gets one notification and both are marked sent (AC-51 "once each") |
| QA-N3-06 | minor | backend | `hire_records.origin = 'report_confirmed'` is never written (a Confirm stores `target_record`). `metric_record_duty` and the documented contract assume it |
| QA-N3-07 | minor | backend (docs) | The drop-2 Ops metrics ("added with backend.md v2") are missing from `docs/ops/n3-hire-signals.sql` |
| QA-N3-08 | minor | frontend | The referral stepper shows Under review / Interviewing / Offer as completed on a referral hired straight from `declined` / `submitted`. The timeline itself is correct. The Terms panel still shows "Sourcing recruiter's expected share 45 %" after a no-split hire |
| QA-N3-09 | minor | PM / design | AC-93 "Given A is suspended, then A can't open the referral" is superseded by N10 settlement mode, which is in the tree. Suspended orgs keep BR-13 actions, N3 hire reports and contests included (N10 brief BR-13). The deadline rules still hold (tested). The AC text needs reconciling |

---

## 1. Commands run (real results)

All commands ran through `/private/tmp/claude-501/…/scratchpad/local-env.sh`. The logs are in `…/scratchpad/qa3/`.

| Command | Result |
|---|---|
| `npm run lint` (before and after the QA edits) | exit 0. 1 warning, in `tests/integration/network-rules-qa.test.ts:3` (an unused `admin`, an N10 file, not N3) |
| `npm run typecheck` | exit 0 on the first run. The final run caught a type error in my new E2E file. After the fix, `tsc --noEmit` exits 0 |
| `npm test` | **34 files, 307 passed, 1 expected fail** (the count grew from 300 during the session: another session added unit tests) |
| `npm run test:integration`, baseline before the QA tests | **463 passed, 1 failed** (464). The failure is `network-rules-conduct` "evidence files…" (`drainQueue()` timed out at 30 s on a backlog of 239 queued `match.*` jobs; environmental, see below) |
| PD-078 combined run: N3 (3 files incl. QA) + N10 (5 files) + record scope | 146 passed, 7 failed, 26 skipped. 5 failures are the N3 bugs above. 2 conduct tests and 2 `beforeAll` hooks (record scope, restriction) **timed out at 60 s** under load on the shared stack (51 jobs stuck `running`) |
| Rerun of the timed-out files alone (record scope, restriction, conduct) | **3 files, 54 passed** (the timeouts were transient load, not a regression; reported per the shared-DB instruction) |
| `tests/integration/n3-qa.test.ts` (new) | **33 tests: 28 passed, 5 failed**. The 5 failures are QA-N3-01 (×3), QA-N3-02 and QA-N3-05. They are intentional repros |
| Full integration, final | see §1.1 |
| `npm run build` | **exit 0**. ⚠️ It ran **in place** (shared `.next`). The user's dev server answered 200 right after the build |
| `next start -p 3117` + worker (`tsx scripts/worker.mts`) | Served E2E. The second start added the QA Resend stand-in (`NODE_OPTIONS=--require harness/resend-standin.cjs`, `SUPPORT_EMAIL=support@example.test`) for the N9 / N1 specs |
| E2E N3 (`referral-claims-two-sided-hire.spec.ts`, new, 4 tests) | **2 passed, 2 failed**. The failures are only the soft QA-N3-04 checks. Every other assertion in those tests passed: the record-only hire is stored, the banner shows, the fee details are saved and the placement becomes `hire_reported` |
| E2E N9 (`candidate-confirmation-integrity`, 8) | **8 passed** |
| E2E N1 (`duplicate-presentation`, 8) | **8 passed** after one intended update (AC-76, see §6) |
| E2E N2 (`job-terms-card`, 12) | **12 passed** after intended updates (BR-1 client name, PD-075 "Record hire") |
| E2E Journey A (`journey`, 7) | **7 passed** after the PD-075 rename |
| E2E `review-regression` (2) | **2 passed** after the BR-1 update |
| E2E `network-rules` (3), `auth` (2) | 5 passed |
| E2E `onboarding` (1), `documents` (1) | **failed, not N3.** The onboarding step 1 heading is now "Welcome, Sam! Set up your organization" (the redesigned onboarding with a Network Rules step). The candidate page has a new layout, and the test's `getByLabel(/Upload resume/)` no longer matches. Both pages are changed in the working tree by other work. Owner: whoever changed those pages / main session |

Environment notes:
- I processed the queue directly only for the scan test (`scanHireEvidence`), because the shared stack's queue had a backlog.
- The `deemed_agreement_enabled` flag was `false` before and after every run (checked).

⚠️ **Incident:** the user's `next dev` on port 3000 (pid 78470) **stopped during my cleanup**. The most likely cause is my `pkill -f "scripts/worker.mts"`, which would also have matched the worker of the user's `npm run dev` (`concurrently -k`, so `next dev` exits with it). I did not restart it, because it runs with the user's own env. **The user needs to restart `npm run dev`.** All my processes (`next start -p 3117`, my worker) are stopped. No process listens on 3117.

### 1.1 Final full integration run

`npm run test:integration` (end of session, 23 files, 584 s): **13 failed | 462 passed | 4 expected fail | 45 skipped (524)**. Other sessions added tests during the day (464 → 524). The failures fall into two groups.

**Group 1: the 5 intentional N3 repros in `n3-qa.test.ts`.** These are QA-N3-01 ×3, QA-N3-02 and QA-N3-05.

**Group 2: environmental timeouts on the shared stack.** These are the other 8 failures and all 45 skipped tests:
- every one is a 30 s `drainQueue()` / scan timeout or a 60 s `beforeAll` timeout, in N1 (`duplicate-presentation*`), `journey`, `recruiter-record-scope`, `network-rules-restriction` and `network-rules-conduct`;
- the exception is one null `get_opportunities` result in `terms-card` "one notification to the submitter…", a statement timeout on the partner list.

Evidence for Group 2:
- **Data volume:** the local DB now holds **16,135,504 `matches`** rows (3,315 jobs, 6,327 candidates, 3,071 referrals). Every queued `match.*` job that `drainQueue()` processes is slow at that volume.
- **No worker:** after my cleanup (and the stop of the user's dev worker, see the incident above), no worker was draining the queue (192 queued, 52 stuck `running`).
- **Draining didn't help:** I drained the queue with a temporary worker (stopped by PID afterwards) and reran the affected files. N1, N2, record scope and journey still timed out the same way: 12 failed, 191 passed. Record scope and journey passed in that rerun; restriction's hook timed out.
- **Same suites were green earlier:** the session-start baseline was **463 / 464**, with N1, N2, N9, journey and record scope all green. The mid-session rerun of record scope, restriction and conduct alone was **54 / 54**.
- **Unchanged since the baseline:** the N1, N2 and record-scope suites are identical, and N3 changed no N1 code path between those runs.

I did **not** `db reset`: the N10 session shares the stack (PD-078). **Recommended:** after both sessions agree, run `db:reset`, then rerun the full suite once. The md5 check (`dcd27209…`) passed at the start of this session.

The PD-078 trio was run together, then rerun alone (see the table above):
- N3: the backend files are fully green; all failures are the intentional repros in `n3-qa`;
- N10 and record scope: green when not starved.

---

## 2. Bugs

### QA-N3-01 (blocker, backend): uphold fails on in-progress referrals
- **Where:** `app.establish_hire` (`20261117000400_n3_record_hire.sql`). It updates `referrals.status = 'hired'` without the transaction flag `app.hire_record_rpc`. `report_hire` sets that flag, and `app.enforce_pipeline_owner` reads it.
- **Effect:** the trigger raises `not_pipeline_owner` (42501) for the platform admin, because the admin isn't the pipeline owner. `admin_decide_hire_report(… 'upheld')` therefore fails, and the admin page shows an error.
- **Scope:**
  - It hits the classic backdoor case: A's report on a referral that B left in `accepted`, `interviewing` or `offer`. So BR-27 / BR-10 / AC-58 can't be met there.
  - The deemed sweep isn't affected, because it runs as the service role with no `auth.uid()`.
  - B's Confirm isn't affected either.
  - Referrals that are `declined`, `withdrawn` or never accepted uphold fine.
- **Repro:** `tests/integration/n3-qa.test.ts` › "QA-12 admin uphold on a referral still in progress" (3 cases).
  1. Accept and confirm the referral (optionally move it to `interviewing` / `offer`).
  2. A files; B contests; A rebuts.
  3. The admin calls `admin_decide_hire_report(rid, 'upheld', …)`.
- **Expected:** a fee-pending placement. **Actual:** `{"code":"42501","message":"not_pipeline_owner"}`.
- **Fix hint:** set `app.hire_record_rpc` around the update in `app.establish_hire`, as `report_hire` does. Migrations after `20261117001000`, starting from the live body (PD-064).

### QA-N3-02 (major, backend): the per-user filing limit is ineffective
- **Where:** `file_hire_report`, `contest_hire_report`, `rebut_hire_report` and `request_authorization_check` call `app.enforce_rate_limit('dispute.open', 5, 3600)`, then **raise** on refusal.
- **Effect:** the raise rolls back the rate-limit row in the same transaction. Only successful calls count.
  - A user can probe `file_hire_report` without limit and always gets `hire_report_unavailable`.
  - The org limit of 3 pending reports is hit before 5 successful filings, so AC-37's third clause ("the 6th filing in an hour gets `errors.rateLimited`") can never occur.
  - The generic code still leaks nothing, so this is defence in depth (R-2). That's why it's major, not blocker.
- **Repro:** `n3-qa.test.ts` › "per user: the 6th filing attempt…". It makes 6 calls with random referral ids. Expected: the 6th is `rate_limited`. Actual: `hire_report_unavailable`.
- **Fix hint:** consume the limit in the Server Action (as N1 does elsewhere with `rateLimit(ctx.db, …)` before the RPC), or return refusals as results instead of raising.

### QA-N3-03 (major, backend): the HA-1 Ops query is broken
- **What:** `docs/ops/n3-hire-signals.sql` › `ha1_hires_first_reported_by_source` reads `public.hire_reports`. The table is `app.hire_reports`.
- **Run:** each block ran in a read-only transaction. The other 5 blocks run fine. HA-1 gives `ERROR: relation "public.hire_reports" does not exist`.
- **Impact:** AC-84 (the N3 part: "the query returns B") fails. There's also no test for HA-1 (HA-9 has one).

### QA-N3-04 (major, frontend): success feedback lost on revalidation
- **Effect:** the dialogs never show their success state.
  - **Record hire** on V4 / V5 should show `hire.recordOnlyTitle` with `noAgreementResult` / `recordOnlyResult` and **Done**. It doesn't.
  - **Enter fee details** should show the toast "Fee details saved. Next: record the client invoice." It doesn't.
- **Why:** the action calls `revalidatePath`. The page re-renders without the trigger: `can_record` is false, or the placement isn't fee-pending any more. That unmounts the dialog before its `useEffect` on the action state runs.
- **Files:** `src/features/referrals/components/report-hire-dialog.tsx` (result at line ~222), `src/features/commissions/components/fee-details-dialog.tsx` (toast at lines 125–129).
- **Repro:** E2E `referral-claims-two-sided-hire.spec.ts`, tests 2 and 3 (soft checks).
  - Screenshot `qa3/v4-after-record.png`: the page shows the S4-e banner "Hire recorded without a split", but no result state.
  - Screenshot `test-results/…fee-pending-placement…/test-failed-2.png`: the placement is already a normal one, with no toast.
- **Impact:**
  - AC-23 and AC-26 ("At that moment B is told…", BR-11): B still learns it from the S4-e banner, so this isn't a blocker.
  - AC-70: the toast is missing.

### QA-N3-05 (minor, backend): reminders merged
- **Where:** in `run_hire_maintenance`, when both the d5 and d8 conditions are true, one `hire_report.reminder` is inserted and both timestamps are set.
- **When it happens:** after a missed sweep (worker down for 3+ business days).
- **Repro:** `n3-qa.test.ts` › "when a sweep misses day 5…". It expects 2 reminders and gets 1.
- The normal cadence (day 5, then day 8, never a third, none once contested) passes.

### QA-N3-06 (minor, backend): `origin` never `report_confirmed`
- A Confirm through `report_hire(p_report)` inserts `hire_records.origin = 'target_record'`. Checked on 11 confirmed reports.
- `backend.md` §1 lists `report_confirmed`, and `metric_record_duty` filters on it.
- Confirmed hires can't be told apart from B's own records in `hire_records` (they can through `app.hire_reports.status = 'confirmed'`).

### QA-N3-07 (minor, docs): drop-2 metrics missing
- `n3-hire-signals.sql` ends with a comment saying the drop-2 metrics were "added with backend.md v2". They aren't there: median report → resolution, reports → placements, contested reports upheld, share of placements first reported by A, contacts per dispute.
- PD-073 moved these counts to Ops SQL, so they need to exist.

### QA-N3-08 (minor, frontend): stepper and terms panel after no-split hires
- On a `declined → hired` referral, the top stepper ticks Under review / Interviewing / Offer. The timeline correctly shows Submitted → Declined → Hired.
- After a no-split hire, the Terms panel still shows "Commission split 45/45/10" and "Sourcing recruiter's expected share: 45 % of the fee", next to "No agreement: the hire was recorded without a split".
- Screenshot: `qa3/v4-after-record.png`.

### QA-N3-09 (minor, PM/design): AC-93 vs N10 settlement mode
- With `suspended_at` set, `app.org_settlement_state` = `settlement`. A suspended A can still file and rebut, and a suspended B can still contest and record, by N10 design.
- What's tested and correct:
  - a suspended B at the deadline goes to `unanswered`, with the control case deemed;
  - a suspended A at the rebuttal deadline goes to `in_review`;
  - the admin queue shows the suspended flag, and the admin can decide.
- AC-93's "A can't open the referral" should be rewritten to the N10 behaviour.

---

## 3. AC / BR → test → result

Legend:
- **R** = `tests/integration/n3-record-hire.test.ts` (backend, 31 tests)
- **H** = `tests/integration/n3-hire-reports.test.ts` (backend, 27 tests)
- **Q** = `tests/integration/n3-qa.test.ts` (QA, new, 33 tests)
- **E** = `tests/e2e/referral-claims-two-sided-hire.spec.ts` (QA, new)
- **Code** = verified by code review only

| AC | BR | Test(s) | Result |
|---|---|---|---|
| AC-1 | BR-1 | R "opening a job to partners needs a real client name…"; E2E N2 / review-regression (form refuses without a name, passes with one) | PASS |
| AC-2 | BR-1 | R "an open job whose name becomes a placeholder is hidden… `no_client_name`" | PASS |
| AC-3 | BR-1 (PD-077) | R (in-flight referrals carry on) | PASS |
| AC-4 | BR-1 | R (`client_name_required_for_referrals` on every path) | PASS |
| AC-5 | BR-2 | R "members can't execute `record_candidate_request_delivery`"; Q-6 (anon / member refused); E2E N9 (8/8, server path records "sent") | PASS |
| AC-6 | BR-4, BR-7 | R "records from withdrawn, rejected…", "refuses ineligible…"; E (Record hire hidden after a record) | PASS |
| AC-7 | BR-4 | R "closed referrals stay eligible until window end + 9 months; legacy…" | PASS |
| AC-8 | BR-4 | R "refuses ineligible referrals with `hire_not_eligible` and writes nothing" | PASS |
| AC-9 | BR-3 | R "another role is refused when the referral carries no client key" | PASS |
| AC-10 | BR-3, BR-21, BR-36 | H (release block, same client); Q-10 (commit-key-only and delivery-key-only both blocked; B2 at the same client unaffected) | PASS |
| AC-11 | BR-5 | R (window ended 4+ months ago: accepted); E (admin coverage checklist, static) | PASS |
| AC-12 | BR-6 | H "BR-6 tail…"; Q-1 (out-of-tail generic) | PASS |
| AC-13 | BR-7 | R "the happy path (offer + active agreement) is unchanged"; E2E Journey A and N2 hire dialog | PASS |
| AC-14 | BR-7, PD-077 | R "only the job owner and B's managers can record…"; H "the member who accepted… still records"; Q-6 (B-rec, A, C: `not_found`, no detail) | PASS (see QA-N3-01 for the related trigger gap on the admin path) |
| AC-15 | BR-7, PD-077 | R; E test 2 (declined → V4, timeline Submitted → Declined → Hired) | PASS (QA-N3-08 stepper cosmetic) |
| AC-16 | BR-8, PD-077 | R "dates…"; H "PD-077 window"; Q-5 (`complete_fee_details` floor / +548 / +549 / null) | PASS |
| AC-17 | BR-8 | R "another role at this client… minimum fee" | PASS |
| AC-18 | BR-8, BR-15 | R "BR-15 non_permanent_engagement…" | PASS |
| AC-19 | BR-8 | R (legacy free entry); Q-5 legacy bounds | PASS |
| AC-20 | BR-9 | R "flag on, never accepted…"; E test 3 (uphold → deemed agreement) | PASS |
| AC-21 | BR-9 | R "pending agreement becomes active as deemed" | PASS |
| AC-22 | BR-9 | R "internal referral… 0 sourcing bps" | PASS |
| AC-23 | BR-9 | R "flag off… recorded without a split"; E test 2 | **FAIL (QA-N3-04: result state not shown)**; data, banner and notification PASS |
| AC-24 | BR-9 | R "the flag isn't writable…"; Q-6 (`app.platform_settings` closed to authenticated / anon) | PASS |
| AC-25 | BR-10 | R; H "uphold with the flag off…" | PASS |
| AC-26 | BR-11 | R "released referral: same variant… money discarded" | **FAIL (QA-N3-04: result state)**; data PASS |
| AC-27 | BR-11 | R (byte-identical payloads); Q-10 (B's hire state identical during a BR-21 block) | PASS |
| AC-28 | BR-12 | R "admin note on a hire record…" | PASS |
| AC-29 | BR-13 | R "late…"; Q-9 (Confirm 30 days after start → late; upheld never late; no `late` in A/B payloads or org audit) | PASS |
| AC-30 | BR-14 | R (`invoice_due_at` stored); frontend chip | PASS for workspace; admin side not built (frontend §D2.4 gap 5, confirmed) |
| AC-31 | BR-8 | R (`hire_terms_changed`); E2E N2 P16 | PASS |
| AC-32 | E2 | Code (`pipeline-board.tsx`); not driven in E2E | Not verified in UI |
| AC-33 | BR-16 (Should) | not built (PD-069 cut 1) | N/A |
| AC-34 | BR-17 | H; E test 1 (button for A, hidden for B, hidden while pending) | PASS |
| AC-35 | BR-17 | H; **Q-1: 11 causes, byte-identical error object** (incl. C, C claiming A's org, A-rec, B, random id, two rejections, second report without a newer item) | PASS |
| AC-36 | BR-17, BR-22 | H; Q-1 (outsiders get the generic code, not `hire_already_recorded`) | PASS (link target missing: frontend gap 3, confirmed) |
| AC-37 | BR-20 | H (3 pending); Q-2 (10 per rolling 90 days, then allowed after 90 days) | 3 / 10: PASS. **Per-user clause FAIL (QA-N3-02)** |
| AC-38 | BR-17 | H "second report… none after two rejections" | PASS |
| AC-39 | BR-17 | H (open objection: generic) | PASS |
| AC-40 | BR-17 | Code (no consent check in `hire_report_open` / `report_hire`) | PASS (code) |
| AC-41 | BR-18 | H "payload rules"; Q-4 (`javascript:`, `data:`, leading space, `HTTPS://`, `http://` links refused) | PASS |
| AC-42 | BR-18 | H; Q-3 (bucket private, 10 MB / types; html and oversize refused by storage; ext ↔ mime; foreign path; another user's object; 6th draft; scan rejects a fake PDF, hashes a real one; unready / foreign / duplicate ids refused) | PASS |
| AC-43 | BR-18, BR-23 | H; Q-8 (B-rec, A and C not notified) | PASS |
| AC-44 | BR-19 | H; Q-3 (A's report and rebuttal parts reach B with no url / name / mime / id); E test 1 (no link in B's HTML, `linksHidden` line) | PASS |
| AC-45 | BR-19 | Q-4 (client name and key absent from every A payload, notification and audit row); E test 1 | PASS |
| AC-46 | BR-19, BR-27 | H; Q-4; E test 1 | PASS |
| AC-47 | BR-21 | H; Q-10 (withdraw-with-release path also guarded) | PASS |
| AC-48 | BR-22 | H "B's record closes a pending report…" | PASS |
| AC-49 | BR-22 | Q-10 (B2 unaffected); Q-6 (B2 gets `not_found` on everything) | PASS |
| AC-50 | N10 | Code (`report-dialog.tsx` additive) | Not driven |
| AC-51 | BR-23 | H; Q-8 (exact day 5 / day 8 cadence, none when contested) | PASS. **Missed-sweep case FAIL (QA-N3-05)** |
| AC-52 | BR-24 | H; Q-7 (Confirm from `unanswered` → `confirmed`, deemed agreement) | PASS |
| AC-53 | BR-25 | H; E test 1 (not_this_client contest via the UI) | PASS |
| AC-54 | BR-25 | H; Q-7 (contest after the deadline → `hire_report_answer_closed`) | PASS |
| AC-55 | BR-25 | H; Q-3 (`not_hired`: A sees the statement, never B's files); Q-4 (`not_this_client`: statement null for A); E test 1 | PASS |
| AC-56 | BR-26 | H | PASS |
| AC-57 | BR-27 | H; Code (overdue chip) | PASS |
| AC-58 | BR-27 | H (never-accepted referral); E test 3; **Q-12** | **FAIL (QA-N3-01)** on accepted / interviewing / offer referrals |
| AC-59 | BR-27 | H | PASS |
| AC-60 | BR-27 | H (forged `p_fee_minor` refused); E test 3 (no money field in the uphold dialog) | PASS |
| AC-61 | BR-28 | H; Q-6 (admin RPCs `not_found` for members) | PASS. Names behind the keys: only the job's current name (frontend gap 6, backend §25, confirmed) |
| AC-62 | BR-29 | H; E test 3 (queue pill "Unanswered: notice not delivered"; "No email delivery records") | PASS |
| AC-63 | BR-29 | H (seeded delivered records → deemed); Q-7 control case | PASS |
| AC-64 | BR-29 | H; Q-7 (`queued` / `sent` only, other notice kinds, a non-member, a plain recruiter as the 2nd person → unanswered) | PASS |
| AC-65 | BR-29 | H; E test 3 (no Restart / Reopen text); api-surface (no restart RPC) | PASS |
| AC-66 | BR-30 | Moved to N7 | N/A |
| AC-67 | BR-22, BR-29 | H; Q-7 | PASS |
| AC-68 | BR-31 | R; E test 3 (panel title) | PASS |
| AC-69 | BR-31 | R (RPC and direct insert refused); Q-9 (dispute round trip keeps finance blocked); E test 3 (no Record client invoice) | PASS |
| AC-70 | BR-31, BR-14 | R; E test 3 (saved, status `hire_reported`) | **FAIL (QA-N3-04: toast)**; data PASS |
| AC-71 | BR-31 | R "overdue fee details…" | PASS |
| AC-72 | BR-32 | R; **Q-5** (base 0 / −1 / 10^12+1 / int8 max / null; bonus −1 / 10^12+1 on `pct_total_cash`; I 0 / −5 / < ceil(C/100) / > 100·C / 10^12+1; missing reason; legacy 0 / −1 / 10^12+1 / lowercase / null currency; non-integer; table constraints via SQL; 10^12 exactly accepted; V2 / V3 / Confirm paths) | PASS |
| AC-73 | BR-33 | Q-9 (`open_dispute` on fee-pending → `disputed` → `resolve_dispute` → back to `fee_pending` → fee details complete) | PASS |
| AC-74 | BR-34 | R; E2E N1 release-later | PASS |
| AC-75 | BR-34 | R; H | PASS |
| AC-76 | BR-35 | R; E2E N1 (B's line identical, updated) | PASS |
| AC-77 | BR-35, BR-6 | R | PASS |
| AC-78 | BR-36 | R (HA-9 Ops query verbatim); Q (each Ops block executed) | PASS (moved part N/A) |
| AC-79 | BR-37 | H; Q-6 (C / B2 / A-as-B `not_found`) | PASS |
| AC-80 | BR-37 | H | PASS |
| AC-81 | BR-37 | H | PASS |
| AC-82 | BR-37 | H | PASS |
| AC-83 | BR-38 | H | PASS |
| AC-84 | BR-40 | Q (Ops block run) | **FAIL (QA-N3-03)** |
| AC-85 | BR-40 | H | PASS |
| AC-86 | BR-40 | H; E test 3 (queue sections) | PASS |
| AC-87 | BR-41 | Q-4, Q-6 (no other-org data) | PASS |
| AC-88 | BR-42 | H; Q-8 (no employer, statement, link, client name or key, candidate id or amount in N3 notifications) | PASS |
| AC-89 | BR-42 | Q-8 (same scan over audit metadata); Q-3 (download audit per side) | PASS |
| AC-90 | BR-43 | Q-3 (no member read / sign of storage objects; uploader org or admin only); Q-8 | PASS |
| AC-91 | BR-44 | Code (guarantee from the snapshot, N2 unchanged) | PASS (code) |
| AC-92 | BR-44 | Moved to X6. The N3 part is in R (second record → `hire_not_eligible`) | PASS |
| AC-93 | BR-44 | H; Q-7 (B suspended → unanswered; A suspended → in_review; admin decides; Suspended flag) | PASS with **QA-N3-09** (AC text vs N10) |
| AC-94 | BR-44 | R (internal 0 bps) | PASS |
| AC-95 | brief §4 | Moved to Ops SQL. Queries run; drop-2 metrics missing (QA-N3-07) | N/A / minor |
| AC-96 | §7 | **Q-6**: every member RPC × {C, C claiming A, C claiming B, B2} → bare `not_found`; side confusion; admin RPCs × {A, B, B-mgr, C}; anon on every N3 RPC; service-role RPCs refused to members; every N3 function SECURITY DEFINER with `search_path=""`; new `app` tables closed; `hire_records` SELECT-only; api-surface allow-list | PASS |
| AC-97 | BR-39 (Should) | not built | N/A |
| AC-98 | Should | not built | N/A |
| AC-99 | §7, R-7, R-10 | N1 / N2 / N9 / record-scope integration (in the full run) and E2E; Journey A | PASS |
| AC-100 | i18n | en / fr / pt key parity script: no missing keys in any N3 namespace (one identical value, `hire.breakdownRate`, a formula) | PASS |
| AC-101 | §6 | **E test 4**: referral page with panel (A, B), the hire report dialog (A), `/admin/hire-reports` and detail, en / fr / pt at 375 px: no horizontal scroll. fr screenshots reviewed | PASS (keyboard paths and dark-mode contrast not checked) |
| AC-102 | BR-45 | R "refused with objection_open… not late" | PASS |
| AC-103 | BR-29 | H | PASS |
| AC-104 | PD-072 | `terms-amend-action-qa` / `terms-amend-expected-currency` in the full run | PASS |

In-scope ACs:
- **Moved, not tested:** AC-66, 78, 84, 92, 95. The spec marks 5 ACs "Moved", not 6. AC-65 and AC-28 are "rewritten" and are tested as rewritten. The N3 residue of AC-78 and AC-84 (the Ops queries) was run.
- **Shoulds, not built:** AC-33, 97, 98.

### Brief §9.2 scenarios

| # | Covered by | Result |
|---|---|---|
| 1 | R BR-1; E2E N2 | PASS |
| 2 | R BR-2; Q-6; E2E N9 | PASS |
| 3 | R | PASS |
| 4 | R; Q-6 | PASS |
| 5 | R; Q-10 | PASS |
| 6 | R; HA-9 Ops | PASS (the result-state UI: QA-N3-04) |
| 7 | R; Q-9 | PASS |
| 8 | H; Q-1; Q-3 | PASS |
| 9 | H | PASS |
| 10 | H; Q-10 | PASS |
| 11 | H | PASS |
| 12 | H; E | PASS |
| 13 | H | PASS |
| 14 | H; Q-4 | Upheld path **FAIL on in-progress referrals (QA-N3-01)**; rest PASS |
| 15 | H; Q-7 | PASS |
| 16 | R | PASS (reopen → N7) |
| 17 | R; Q-9 | PASS |
| 18 | Q-5; R | PASS |
| 19 | R; E2E N1 | PASS |
| 20 | R; E2E N1 | PASS |
| 21 | H | PASS |
| 22 | Q-6 | PASS |
| 23 | Q-7; H | PASS |
| 24 | full integration + E2E N1 / N2 / N9 / Journey A | PASS (see §1) |

---

## 4. Security checklist

- **Forged Server Action args.** Checked by code review of `src/features/hire-reports/actions.ts`, `referrals/actions.ts`, `commissions/actions.ts` and `admin/actions.ts`:
  - every action runs in `guard()`;
  - the tenant comes from `getRequestContext` (`p_acting_org = ctx.organizationId`, never posted);
  - Zod parses every argument, extra keys are stripped, and attestation is `z.literal("on")`;
  - `reportHire` reads the variant from `get_referral_hire_state`;
  - admin actions run through `adminDb()`.
  - The RPC layer refuses forged ids (Q-6). I didn't post raw multipart requests to the action endpoints.
- **IDOR (referral, report, placement, check and file ids).** Q-6, Q-3, H. Bare `not_found`, with no details or hints.
- **`not_this_client` privacy.** No client name, key, candidate id or B statement reaches A (Q-4, E test 1).
- **B never gets file links.** Q-3, H, E test 1. B can't authorize A's files, and members can't sign or download storage objects directly.
- **Uploads.**
  - Types and size are enforced by the bucket, by `register_hire_evidence` (extension ↔ stored mime, 1 B–10 MB) and by the worker's magic-byte scan.
  - ≤ 5 drafts per purpose.
  - Links are 60 s signed URLs (`createSignedUrl(path, 60)` in `getHireEvidenceUrl` and `getAdminHireEvidenceUrl`; code). Each authorization is audited per side (Q-3).
- **Rate limits.**
  - 3 pending and 10 per 90 days: PASS.
  - Per user (5/h): ineffective (QA-N3-02).
  - Uploads: 30/h by trigger (storage), plus 30/h in the action (code).
- **Generic refusal with no oracle.** Q-1: identical error objects across 11 causes.
- **XSS.** Script and `onerror` payloads in the statement and employer render as text for A and B, and no dialog fires (E test 1). `javascript:` / `data:` links are refused at the RPC and the table (Q-4). The only `href={it.url}` sinks are `https://`-only, A's own view, and the admin view.
- **api-surface.** The new RPCs are allow-listed (`api-surface.test.ts`). The service-role RPCs aren't. Q-6 adds SECURITY DEFINER + `search_path=""` for the 36 N3 functions, closed `app` tables, `hire_records` grants, and the bucket config (private, 10 MB, 3 types, no member SELECT / UPDATE / DELETE policy).

## 5. Known gaps from frontend.md §D2.4: status

| Gap | Status |
|---|---|
| 1. v2 hire-state keys not in exported types | Confirmed: read through `hire-reports/hire-state.ts`; typecheck green. Housekeeping |
| 2. Admin payloads typed `Record<string, unknown>` | Confirmed. Housekeeping |
| 3. `hire_already_recorded` without a target | Confirmed (`fileHireReport` returns only the message). AC-36's Open placement link is missing |
| 4. No business days left on admin deadlines | Confirmed: queue and detail show "{when} ET" + Overdue |
| 5. AC-30 admin Invoice overdue not built | Confirmed: no admin placement view |
| 6. AC-61 client names | Confirmed: keys plus the job's current name (screenshot: "Client at submission: zyxw hidden client…" shows the **key**, labelled as the client) |
| 7. `deemedTarget` `{when}` renders "—" | Confirmed by payload: `get_hire_reports` has no `fee_details_due_at` |
| 8. N10 file edited additively | Present; N10 E2E (3) green |
| 10. No admin language hint | Confirmed |
| 11. `admin.validation.resolution` says 5–2,000, the rule is 20 | Confirmed in en |
| 12. Same-person always "not available" | Confirmed (screenshot) |
| 13. Visual check | Done for 375 px en / fr / pt on the referral page (both sides), the hire report dialog and the admin queue / detail: no overflow. Not done: dark mode, keyboard paths, S7 / S8 / S13–S16 dialogs at 375 px |

## 6. Test changes made (tests only)

- **New:**
  - `tests/integration/n3-qa.test.ts` (33 tests, 5 intentional failing repros);
  - `tests/e2e/referral-claims-two-sided-hire.spec.ts` (4 journeys; QA-N3-04 as soft checks).
- **Updated for intended N3 behaviour:**
  - `tests/e2e/journey.spec.ts` and `job-terms-card.spec.ts`: PD-075 "Report hire" → "Record hire" and "Hire reported" → "Hire recorded";
  - `job-terms-card.spec.ts` and `review-regression.spec.ts`: BR-1, a client name is needed to open a job to partners;
  - `duplicate-presentation.spec.ts`: BR-35 / AC-76. B's line always carries "unless the sourcing recruiter released the candidate", so the old `not.toContainText(/releas/i)` became "no release state or action, and the generic AC-76 line".
- **Not changed:** `onboarding.spec.ts` and `documents.spec.ts` (failing on non-N3 page redesigns; owner outside N3).
