# QA report: duplicate and prior-presentation protection (N1)

## Structural fix verification (2026-11-15)

Inputs:
- the isolated PDF scan (`evidenceVerdictIsolated` in `claim-evidence.ts`; `pdf-scan.mjs` / `pdf-scan-worker.mjs`; `backend.md` §15);
- the F-1 and F-2 fixes;
- the frontend F-3 fix;
- the guarded wrapper.

Environment: local stack only, through the guarded wrapper. I rebuilt the app and served it with `next start -p 3100`, plus the **real** queue worker (`npm run worker` = `tsx --conditions=react-server scripts/worker.mts`). Both were stopped afterwards. Port 3000 and the hosted project were not touched.

### Verdict: **PASS**

No blockers and no majors are open. F-1, F-2 and F-3 are closed. The scan can no longer stall the queue worker, and the scan thread loads and returns verdicts in the real worker runtime. Every N1 rule, AC and scenario passes.

### 1. The queue worker stays responsive (real worker, real claim flow)
I wrote a load script (scratchpad `load/stall.mjs`, run through the wrapper). As a hiring member, it uploaded pathological ~10 MB files through `claim-evidence` + `register_claim_evidence`, then queued 6 `match.candidate` jobs at the same moment.

| File | Scan job | Verdict |
|---|---|---|
| 10 MB of `/Filter [` + a `stream` keyword (the F-1 pattern; took over an hour before) | done in 0.1 s (429 ms in the worker log) | **rejected** |
| 10 MB of `<<` (R3-1) | done in 0.1 s | clean (no active content, nothing to run) |
| 10 MB of `/` | done in 0.6 s | clean (same) |
| Flate bomb (600 MB of zeros in 611 kB) | done in 0.2 s | **rejected** |
| benign minimal PDF | done in 0.0 s | **clean**: this verdict can only come from the scan thread, because every fallback path returns `rejected`, so the thread loads under `tsx --conditions=react-server` |
| 6 matching jobs queued alongside | all `succeeded` between 0.9 s and 2.6 s | — |

- The whole run took 3.1 s.
- No matching job waited behind a scan for more than the scan itself.
- The worker log shows `job.ok` for each `claim_evidence.scan` (22–429 ms) with no `worker.error`.

The worker still runs a batch's jobs **one after another**, so a scan that hits the 3 s hard timeout delays the rest of its batch by up to 3 s. That cost is bounded (30 uploads/h per hiring member) and the event loop is never blocked, so it is not a finding. The terminate-on-timeout path itself is covered by backend's isolation unit test. QA also ran it in vitest: a 10 MB `/Filter [` file through `evidenceVerdictIsolated` came back **rejected in 130 ms**. I found no input slow enough to reach the 3 s timeout in the real runtime.

### 2. New fail-open ideas against the stricter parser (pure scan)
**Rejected, as expected (fail closed):**
- tiny streams ×200k; a 100-deep ASCIIHex chain;
- `/Filter` beyond the 600-character window; a comment inside `/Filter`; a repeated `/Filter`;
- `/Length` that is short, indirect or huge;
- the word `stream` inside a dictionary string;
- an unfiltered object stream with active names;
- trailing garbage after Flate data;
- indirect `/DecodeParms`;
- a DCT filter on a non-image stream;
- the three F-2 cases and the F-1 pattern (QA unit tests now pass, unedited).

**Accepted, and correctly so:**
- ASCII85 `z` expansion (9 MB → 36 MB decoded) in 67 ms, under the decode budget;
- a Flate xref stream with a PNG predictor;
- DCT on an image XObject.

**Observation, no action needed:** two concatenated zlib members, where the second carries the active catalog, come back `clean`. PDF readers (pdf.js, Acrobat) also stop at the end of the first zlib member, so the payload is never interpreted. Not a bypass.

**Benign regression check:** all real-world PDFs from the previous round are **clean**: two Chrome `page.pdf()` exports (an ATS table with an image and a link; long text), a CUPS text PDF and two Apple system PDFs.

### 3. F-3 and the shared components
- `review-regression.spec.ts` passes. The composer, job new and edit, the jobs list, the admin overview and admin disputes have **no horizontal scroll at 375px**.
- Double-clicking **Publish job** still creates exactly one job, and draft and edit-save still work.

### Commands (real results)

| Command | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | 13 files, **105 passed** (QA scanner tests included, unedited) |
| `local-env.sh npm run test:integration`, run 1 | 5 files, **159 passed** |
| `local-env.sh npm run test:integration`, run 2 (no reset) | **157 passed, 2 failed**. Both failures are in `journey.test.ts` (not N1): "A sees B's job as an opportunity" and "closing a job expires its opportunities". This is the same known `max_rows = 1000` truncation on the grown database (now over 1,500 referral-open jobs). All 4 N1 test files are green in both runs. |
| `E2E_BASE_URL=http://localhost:3100 local-env.sh npx playwright test tests/e2e/duplicate-presentation.spec.ts tests/e2e/review-regression.spec.ts` | **9 passed** (36.6 s) |
| `next build` (local env) | exit 0. `new URL("./pdf-scan-worker.mjs", import.meta.url)` doesn't break the Next build. |

Environment note: the wrapper's guard worked as intended. Twice, a wrapper started in parallel with another wrapper got an empty `supabase status` result (likely a race in the CLI), and the guard **refused to start** instead of falling back to `.env.local`. Start wrapped processes one at a time.

### Still open (not N1 blockers)
- **X-1** (pre-existing, outside N1, backend/PM): the candidate confirmation can be forged because the caller supplies the token hash.
- `journey.test.ts` flakes on a database that keeps growing, because of PostgREST `max_rows = 1000` (not N1; QA/backend test isolation).
- Not verified by QA: keyboard-only paths (AC-61) and dark mode (AC-62).
- Full E2E suite not re-run in this pass. Last run: only the 3 known pre-existing failures plus F-3, now fixed.

---

# Final verification (history)

## Final verification (2026-11-15)

Inputs:
- the scanner rewrite in `claim-evidence.ts` (`backend.md` §14);
- the backend copy fixes P1–P5 and P10–P12;
- the design-review fixes (`frontend.md`, "Review round");
- the admin dispute card now using `BusinessDeadline`.

Environment: local stack only, through the wrapper. I rebuilt the app and served it with `next start -p 3100`, plus a worker started behind a guard that refuses unless the URL is `127.0.0.1` and the secret key is set. Both were stopped afterwards. Port 3000 and the hosted project were not touched.

### Final verdict: **FAIL** (one major, no blockers)

Every N1 rule, AC and scenario still passes. No functional regression was found on the shared components or the non-N1 pages. The one major is again in the PDF scanner: the R3-1 "worker stall" class is **not closed**. One input pattern still makes the scan quadratic and runs past its own 2 s budget.

| # | Severity | Owner | Finding |
|---|---|---|---|
| F-1 | **major** | backend | **Scanner stall via `/Filter [` runs.**<br>• **Where:** `filterChain()` (`claim-evidence.ts`) runs `/\/Filter\s*(\[[^\]]*\]\|…)/g` over a stream's dictionary. The first stream's dictionary is everything before its `stream` keyword, so it can be almost the whole file. Every unclosed `[` rescans to the end of the region, which is quadratic. The 2 s deadline is only checked **between** streams, never inside this regex.<br>• **Measured:** 20k runs (180 kB) take 1.3 s; 80k (720 kB) take **21.9 s**; 200k (1.8 MB) take **138 s**. Extrapolated, a 10 MB file takes over an hour of synchronous work on the worker's event loop.<br>• **Note:** the backend's own adversarial test had `/Filter [` runs **without** a following `stream` keyword, so `filterChain` never ran.<br>• **Repro:** `claim-evidence-qa.test.ts` "BUG (final, major)": 40k runs take ~5.4 s, expected under 2.5 s.<br>• **Fix:** take the last `/Filter` with `lastIndexOf`, then parse its value with a bounded tokeniser (or `[^\]]{0,512}`). Check the deadline inside every loop. Ideally also run the scan in a `worker_thread` and terminate it on timeout, so no single step can block the event loop. |
| F-2 | minor | backend | **Three scanner fail-open gaps** (readers accept these, the walker skips them):<br>• an indirect filter (`/Filter 5 0 R`): the stream is treated as unfiltered, so compressed active content is `clean`;<br>• `stream` followed by spaces before the EOL: the stream is skipped;<br>• compressed bytes that contain the word `endstream` (a stored block followed by a compressed block): the walker cuts at the first `endstream` and inflates only the head, so an `/OpenAction /JavaScript` object stream is `clean`.<br>**Fix:** fail closed on a non-literal `/Filter`, on a `stream` keyword that isn't followed by an EOL, and when the decoded stream ends before the declared `/Length` (or use `/Length` when it is direct). Tests: "BUG (final, minor)" ×3. |
| F-3 | minor | frontend | **The composer still scrolls horizontally at 375px** (design-review B-3 not complete for the composer, AC-62 S1). The view-toggle row (`div.flex.flex-wrap.items-center.justify-between.gap-3`) and the profile cards end at 379px. The job form (new and edit), the jobs list, the admin overview and admin disputes have no overflow at 375px. Test: `tests/e2e/review-regression.spec.ts` (soft check that names the offending elements). |

### Closed since round 3

| Item | Status | Evidence |
|---|---|---|
| R3-1, repeated `<<` | **Fixed** | 1 MB passes the time check (was 9.3 s); 10 MB of `<<` no longer stalls. **But see F-1** (same class, different pattern). |
| R3-m1, encrypted PDF with an unfiltered object stream | **Fixed** (rejected) | unit test |
| R3-m1, dictionary over 4,000 characters | **Fixed** (inflated, rejected) | unit test |
| R3-m1, ASCIIHex / ASCII85 | **Fixed** (decoded, including chains `[/AHx /Fl]`) | unit test plus probe |
| Decompression bomb | Rejected in about 26 ms | unit test |
| Flate chain of 120 nested layers (8.5 MB, about 1 GB of inflation) | Finishes in 152 ms, `clean` (benign content) | probe. The time budget isn't checked inside a chain, but the cost is bounded by the 64 MB decode cap per step and was measured at well under 1 s. |
| 10 MB of `/`, 3.3M `#41` name escapes, 9 MB of ASCII85 | 0.6 s, 0.45 s and 0.17 s | probe |
| Unknown filter, image filter on an object stream, CR-only EOL, `endstream` inside the data of an uncompressed stream | rejected, rejected, rejected, rejected | probe |
| **Benign PDFs** (no regression) | **All `clean`** | Chrome `page.pdf()` exports (an ATS-style table with an image and a link; long text), a CUPS-generated text PDF, two Apple system vector PDFs, and a synthetic Flate + DCT image + URI link file (unit test). |

### Regression check of the shared-component changes
- **`SubmitButton`, always disabled while pending:**
  - Job form: **Publish job** double-clicked creates exactly **one** job (`active`). **Save as draft** creates a `draft`. Edit job **Save changes** persists.
  - The `name="status" value=…` buttons still submit their value.
  - The N1 forms (objection, contest, release, withdraw, admin reject) pass E2E.
- **`grid-cols-[minmax(0,1fr)]` and 44px targets:**
  - No horizontal scroll at 375px on job new, job edit, the jobs list, the admin overview (the "Duplicate protection" and "Organizations to review" panels render) and admin disputes.
  - The composer still overflows by 4px (F-3).
- **Copy changes:**
  - The admin reject toast now reads "Objection rejected. The referral is back in review, and both organizations were notified." I updated the E2E to the new `claimRejected` key.
  - The admin dispute card shows "Resolve by … ET · N business days left" (`BusinessDeadline`), asserted in E2E.
  - `errors.duplicate_referral` stays an error, for the same candidate **record** only. It reveals nothing about another org, so it is consistent with BR-9.

### Commands (final, real results)

| Command | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | 13 files, 102 tests: **98 passed, 4 failed**. The failures are F-1 (1) and F-2 (3), all in `claim-evidence-qa.test.ts`. |
| `local-env.sh npm run test:integration`, run 1 | 5 files, **159 passed** |
| `local-env.sh npm run test:integration`, run 2 (no reset) | **158 passed, 1 failed**: `journey.test.ts` "A sees B's job as an opportunity". This is **not N1** and not a regression. The local database now holds about 1,500 active referral-open jobs from repeated runs, each new candidate matches about 1,500 of them, and PostgREST caps responses at `max_rows = 1000` (`supabase/config.toml:18`). The test's job then falls outside the returned page. Re-running `journey.test.ts` alone: 2 failed, then 0, then 1, with the same cause. All 4 N1 test files were green in both runs. Owner: QA/backend (test isolation; consider pagination in `get_opportunities` consumers). |
| N1 E2E (`duplicate-presentation.spec.ts`) | **7 passed** |
| Regression smoke (`review-regression.spec.ts`, new) | Job-form test passed; the composer/admin test failed on the soft overflow check (F-3); everything else in it passed. |
| Full E2E suite | 20 tests: **10 passed, 4 failed, 6 did not run**. The failures are the 3 known pre-existing ones (`documents.spec.ts`: upload label not found; `journey.spec.ts`: `Evidence` label, plus its 6 serial follow-ups; `onboarding.spec.ts`: removed step) **plus F-3** from the new regression spec. No other failure. |

### Who fixes what
- **backend:** F-1 (major; contained in `filterChain` / the deadline checks), F-2 (minor).
- **frontend:** F-3 (minor).
- **QA/backend:** isolation of `journey.test.ts` on a database that keeps growing (not N1).
- Still open from round 3 and outside N1: **X-1**, recruiter-forgeable candidate confirmation (token hash chosen by the caller).

If PM accepts F-1 as a follow-up (it's a worker-availability risk limited to hiring members during a claim window, at 30 uploads/h each), N1 has no other open issue that blocks acceptance.

---

# Round 3 (history)

## Round 3 (2026-11-13)

Inputs: migration `20261113001100_qa_round2.sql`, `backend.md` §13, and the updated `claim-evidence.ts` worker.
Environment: local stack only, through the wrapper. I rebuilt the app and served it with `next start -p 3100`, plus `npm run worker`, both with the local env. Both were stopped afterwards. Port 3000 and the hosted project were not touched.

### Final verdict: **FAIL** (one major, no blockers)

Every N1 business rule, AC and scenario now passes. R2-1 and R2-2 are fixed, r2-m1 to r2-m5 are fixed, and integration is green twice in a row without a database reset. One major remains, and it was introduced by the r2-m1 fix:

| # | Severity | Owner | Bug |
|---|---|---|---|
| R3-1 | **major** | backend | **The evidence scanner can be stalled with one upload, which blocks the whole worker.** `inflatedStreams` in `src/server/queue/handlers/claim-evidence.ts` uses the regex `/<<((?:(?!>>\s*stream)[\s\S]){0,4000})>>\s*stream\r?\n/g`. It tries up to 4,000 characters, with a lookahead, from **every** `<<`. A valid upload (starts with `%PDF-`, ≤ 10 MB, allowed type) made of repeated `<<` takes **9.3 s per MB**; a 10 MB file took **96 s** in QA. The work is synchronous `evidenceVerdict` code, so it blocks the worker's event loop: matching, evidence scans and maintenance all stop meanwhile. At 30 uploads per hour per hiring member, one member can stall the worker for about 48 minutes in every hour. Repro: `claim-evidence-qa.test.ts` "BUG (round 3, major)" (512 kB takes about 9.3 s; the expected time is under 1 s). **Fix direction:** find streams with a linear scan (`indexOf("stream")`, then look back to the matching `<<` with a bounded search), or tokenise once. Optionally, run the scan in a worker thread with a time limit and reject on timeout. |
| R3-m1 | minor | backend | Three remaining PDF scan gaps, all in the documented "heuristic, not AV" class:<br>• a Flate object stream whose dictionary is longer than 4,000 characters is not inflated, so an `/OpenAction /JavaScript` catalog inside it comes back `clean`;<br>• `/ASCIIHexDecode` and `/ASCII85Decode` object streams are not decoded, so `clean`;<br>• an encrypted PDF (`/Encrypt`) with an unfiltered object stream comes back `clean` because its content can't be inspected.<br>**Suggested fix:** reject any stream whose filters can't be decoded, and any `/Encrypt` file (encrypted Flate streams are already rejected because they can't be inflated). Tests: "BUG (round 3, minor)" ×3. |
| X-1 | **major, pre-existing, outside N1** | backend | **Candidate confirmation can be forged by the recruiter.** `submit_referral_for_candidate` takes the token **hash** from the caller. A recruiter calling the RPC directly can choose a token, send its hash, and then call `respond_candidate_request` with that token, confirming "as the candidate" with no candidate involved. The integration helpers already do exactly this (`submitForCandidate` + `respond`). The flow came from `20261111000200_candidate_confirmation.sql`, before N1. It doesn't change N1's duplicate rules, because the delivery re-check still runs. **It does undermine "delivered after candidate confirmation" (RD-003).** Fix: generate the token server-side inside the RPC and return it once (only the action can email it), or sign the hash with a server secret. Not counted in the N1 verdict, but it should go on the roadmap. |

### Re-verification of round-2 bugs

| Round 2 | Status | Evidence |
|---|---|---|
| R2-1 free "clear?" oracle (reused token hash) | **Fixed** | QA "R2-1 fixed": a presented person and 28 clear people get **byte-identical** answers (`invalid_token`, same JSON). Calls 31 and 32 get `rate_limited`. The counter reads 30 (refused calls roll back only their own hit). There are **0** hit rows for the target job, so no check ran. |
| R2-1 race (two parallel calls, same fresh hash) | **No leak** | QA "race": 6 rounds, and every result was `invalid_token`, `created` or `stopped`. A post-gate `conflict` never appeared without a trace. Code review: everything that can raise is validated before `app.submission_gate`. The gate's rate limit, hit row and audit sit **outside** the post-gate `begin … exception` block, so they always commit. |
| R2-1 other paths | **No oracle** | `rotate_candidate_request_token` refuses a hash already in use with `invalid_token` and runs no check (QA r2-m3 test). Claims and contests run no presentation check. `respond_candidate_request` needs a token. Timing: a reused hash returns before `assert_referable` and the check, so presented and clear cost the same. The remaining difference between presented and clear only exists for **valid** submissions, which are counted, audited and create a referral when clear (R-2, accepted). |
| R2-2 storage limit | **Fixed** | QA "R2-2 fixed": 31 real direct Storage API uploads, no pre-fill. Uploads 1–30 succeed and upload 31 is refused, counted by the `BEFORE INSERT` trigger. |
| r2-m1 `/ObjStm`, `/GoToR` | **Fixed** | Both tests now pass. Decompression bomb (200 MB of zeros in a ~200 kB stream): rejected in 26 ms. Encrypted PDF with Flate streams: rejected. **New: R3-1, R3-m1.** |
| r2-m2 error rollback | **Fixed where it matters** | The submit paths can't raise after the gate. Claims and contests still raise on validation failures by design (AC-36), and they run no check. |
| r2-m3 stable codes | **Fixed** | `invalid_token` on rotate; concurrent duplicate claims give `claim_already_filed` / `stale_version`; concurrent contests give `dispute_already_open` / `claim_not_allowed`. No constraint name, `duplicate key` or table name appears in any error (QA). Code review: `app.safe_error_code` passes only `^[a-z_]{3,60}$` messages from the listed states, everything else becomes `conflict` / `failed`. |
| r2-m4 calendar | **Fixed** | 2029 seeded; the guard is kept for 2030+. The business-day tests are unchanged and pass. |
| r2-m5 `open_dispute` bucket | **Fixed** | Code review (enforced in the RPC). |

### Backend's edit to QA tests (reviewed)
- The oracle test now expects `invalid_token` for the presented person. **This doesn't weaken it**, and I strengthened it: presented and clear answers must be byte-identical, the counter must show every committed attempt, and no hit row may exist (proof that no check ran).
- I also added the parallel-race variant and the stable-code checks.

### Commands (round 3, real results)

| Command | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | 13 files, 94 tests: **90 passed, 4 failed**. The failures are R3-1 (1) and R3-m1 (3), all in `claim-evidence-qa.test.ts`. |
| `local-env.sh npm run test:integration`, run 1 | 5 files, **159 passed** |
| `local-env.sh npm run test:integration`, run 2 (no reset) | 5 files, **159 passed** |
| `E2E_BASE_URL=http://localhost:3100 local-env.sh npx playwright test tests/e2e/duplicate-presentation.spec.ts` | **7 passed** (17.8 s) |

Scanner timings measured in QA, on the local machine:

```
bomb 203848 B   rejected 26 ms
"<<" × 50k      clean    936 ms
"<<" × 200k     clean    3589 ms
"<<" × 500k     clean    9190 ms
10 MB of "<<"   clean    96187 ms
long-dict ObjStm (Flate, /OpenAction)   clean
ASCIIHex ObjStm (/OpenAction)           clean
/Encrypt + unfiltered ObjStm            clean
/Encrypt + Flate ObjStm                 rejected
```

### Status of everything else
- AC-1 to AC-76, BR-1 to BR-34, EC-1 to EC-8 and scenarios 1–49 stay **PASS**, as in rounds 1 and 2, with the PM decisions PD-029 to PD-033 applied.
- Not verified by QA: keyboard-only paths (AC-61), the 375px light/dark layout (AC-62), and the admin panels and job-form hint in the browser (AC-49 to AC-51, AC-70).
- The full E2E suite was not re-run. Its three failures that predate N1 or are unrelated to it (onboarding, journey, documents) are in files N1 doesn't touch.

### Who fixes what
- **backend:** R3-1 (major; a small, contained change in `claim-evidence.ts`), R3-m1 (minor).
- **backend / PM:** X-1 (pre-existing, outside N1); put it on the roadmap.

If the PM accepts R3-1 as a follow-up, nothing else in N1 blocks acceptance.

---

# Round 2 (history)

## Round 2 (2026-11-13)

Inputs: migrations `20261113000900_qa_fixes.sql` and `20261113001000_pm_decisions.sql`, `backend.md` §11–§12, brief rev. 4.2 (PD-029 to PD-033, scenarios 47–49), spec (AC-76; AC-5, AC-17, AC-31, AC-57, AC-65 and AC-68 amended), and the frontend fixes (upload announcement, `referrals.detail.adminActor`).
Environment: same as round 1. Local stack only, through the wrapper. I rebuilt the app and served it with `next start -p 3100`, plus `npm run worker`, both with the local env. Both were stopped afterwards. Port 3000 and the hosted project were not touched.

### Verdict: **FAIL**

There are no blockers and two majors. Most round-1 bugs are fixed and verified:
- B-1 for the submit, claim and contest RPCs;
- B-2 through PD-029, with no release leak after the claimed delivery;
- m-1 for the round-1 bypass cases;
- m-2, m-3, m-4, m-5, m-7, m-9;
- scenarios 47–49 and AC-76.

Two problems remain, both about the probing and abuse defence.

| # | Severity | Owner | Bug |
|---|---|---|---|
| R2-1 | **major** | backend | **The candidate path can be used as a free check oracle.** `submit_referral_for_candidate` runs the gate (rate limit + check) and only then inserts the candidate request. Its `token_hash` is unique and caller-supplied, and `rotate_candidate_request_token` can also set any value. A caller who reuses a known hash gets two different results. If the person was presented, the call returns a normal `stopped`, which is counted and audited. If the person is clear, the call fails with `23505 duplicate key … token_hash_key` after the check has run, and the whole transaction rolls back: the rate-limit hit, the hit row and the audit all disappear, and no referral or email is created. "Not presented" answers are therefore free, unlimited and leave no trace, which breaks BR-22 and AC-18 ("no RPC runs the check outside a submission", "every attempt counts"). Repro: QA "BUG (round 2): reusing a token hash…": 35 probes of clear candidates, all `23505`, and the `referral.submit` counter reads 2. **Fix direction:** validate the uniqueness of the token hash (and anything else that can fail later) **before** `app.submission_gate`, or generate the hash server-side. More generally, nothing that can raise should run after the gate. |
| R2-2 | **major** | backend | **The storage upload limit has no effect.** `app.can_upload_claim_evidence` calls `consume_rate_limit('storage.claim_evidence', 30, 3600)` inside the insert policy. After 31 direct `storage.upload` calls by a fresh hiring member, all 31 succeeded, 31 objects exist, and there is **no** `app.rate_limits` row for that user. Storage evaluates the policy in a context whose writes don't persist (it appears to check the permission in a transaction that is rolled back). The backend's test passes only because it pre-fills the counter with `exhaust()`. Result: unlimited 10 MB uploads per hour while a referral is claimable, cleaned only by the 24-hour orphan sweep (storage and cost abuse). The UI action's own `referral.claim_upload` limit still applies. Repro: QA "BUG (round 2): storage limit counts each upload once…". **Fix direction:** count uploads where the write commits, for example with a trigger on `storage.objects` insert for this bucket that raises past 30 per hour, or route uploads through signed upload URLs issued by a rate-limited RPC. |
| r2-m1 | minor | backend | PDF scan: an `/OpenAction` + `/JavaScript` catalog inside a Flate-compressed `/ObjStm` comes back `clean`. This was already acknowledged as "compressed streams not inspected", but inflating Flate streams with `node:zlib` is cheap and closes the main remaining bypass. `/GoToR` (remote go-to, UNC path, NTLM leak on click) is not blocked either. Tests: `claim-evidence-qa.test.ts` "BUG (round 2…)". |
| r2-m2 | minor | backend | Any error after `consume_rate_limit` rolls back the counter. Failed claims and contests therefore never count. That is harmless today because the same information is readable without a limit through the picker, but it is the root cause of R2-1. |
| r2-m3 | minor | backend | Raw Postgres errors come back through PostgREST for direct callers (for example the constraint name `referral_candidate_requests_token_hash_key`). No PII, but it shows the internals. |
| r2-m4 | minor (ops) | backend / PM | m-4 now fails loudly. Any delivery or claim whose deadline crosses into 2029 raises `holiday_calendar_exhausted`, so submissions and confirmations from about 2028-12-20 would **fail** until 2029 is seeded. Put the yearly seed migration in the launch checklist / roadmap with a date. |
| r2-m5 | minor | backend | Outside N1, but shares N1's bucket: the placement `open_dispute` RPC still relies on the action to consume `dispute.open`, so a direct RPC call skips the shared 5/h bucket. |

### Re-verification of round-1 bugs

| Round 1 | Status | Evidence |
|---|---|---|
| B-1 submit 30/h via RPC | **Fixed** | QA "B-1 fixed": 30 × `stopped`, then 2 × `rate_limited`, exactly 30 hit rows. **But see R2-1.** |
| B-1 claims 10/h, contests 5/h via RPC | **Fixed** | DP "objections (10/h), contests (5/h)…" (`rate_limited` before validation) |
| B-1 storage 30/h | **Not effective** | R2-2 |
| B-2 picker reveals a release | **Fixed (PD-029)** | QA scenario 47: after the release, the picker JSON is byte-identical (including status and revoked), the hiring-side `get_referral_presentation` is identical, filing citing R1 succeeds with the same result keys, and an admin can uphold it. Variant: released before C's delivery gives the same `{message, code, details, hint}` as a referral delivered after C (R-18, accepted). R7 (window ended after C's delivery) is still eligible. Timing: the same query with the same predicates, no branch on release state. Code review of every hiring-side surface (`get_referral_presentation`, `can_claim`, picker, filing, release/withdraw errors = `not_found`) found no other read of the release state. Residual: a sister org's real submission (R-2) |
| B-3 emails | **Deferred (PD-030)** | Scenario 49 test: the four kinds are created in-app with `email_status = not_configured`, and no email job is queued |
| m-1 PDF bypasses (round 1 cases) | **Fixed** | `/JS(`, `#xx` names, `/AA`, content after 2 MB → rejected; `/J#2353` and `/JSONData`, `/AAPL` are not flagged (no false positives). New bypasses: r2-m1 |
| m-2 acknowledged pending hit not audited | **Fixed** | QA "m-2 fixed" (`warn_ack` audit, platform-only) |
| m-3 unregistered objects never purged | **Fixed** | QA "m-3 fixed" (returned by `purge_orphan_claim_files` after 24 h) |
| m-4 calendar ends in 2028 | **Fixed (fails loudly)** | QA business days expects `holiday_calendar_exhausted`; see r2-m4 |
| m-5 sequential reference | **Fixed** | DP m-5 test plus QA lookup: 8 random digits, a sticky stop gets a fresh one, it doesn't appear in member-visible audit, and `get_stop_by_reference` is admin-only (anon, A, B and C refused; malformed input → `not_found`) |
| m-6 upload percentage | **Accepted (PD-033)** | Copy `Uploading…` in en/fr/pt, no `{percent}`; the E2E sees the file row announce "ats-export.pdf Ready · …" |
| m-7 admin actor label | **Fixed** | E2E admin reject: the hiring page timeline shows "Workatent admin"; keys exist in en/fr/pt |
| m-8 confidential client inference | **Accepted (PD-031, R-19)** | — |
| m-9 expired links | **Fixed (PD-032)** | DP AC-76 test plus QA scenario 48 tail (no warning, status unchanged after the sweep, resend runs no check, confirmation → `already_presented` / `already_sent`) |

### Backend's edits to QA tests (reviewed)
- A `beforeEach` that clears `app.rate_limits` for the five shared fixture users. **This does not weaken anything:** every rate-limit test uses users created inside the test (`qa-prober`, `qa-oracle`, `qa-hb`), which are never reset.
- The Christmas-2028 assertion now expects `holiday_calendar_exhausted`. **This does not weaken anything:** it asserts the m-4 guard, and the other business-day cases are unchanged.
- Backend had also already flipped my `it.fails` B-2 test into a weaker scenario-47 check (picker ids only). I replaced it with the stronger version above.
- I fixed a test-data bug in backend's own test (`duplicate-presentation.test.ts:941`): it used a constant token hash `"b".repeat(64)`, which fails with `23505` on any second run against a database that wasn't reset. It now uses a random hash.

### Commands (round 2, real results)

| Command | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | 13 files, 87 tests: **85 passed, 2 failed**. Both are r2-m1 (`/ObjStm`, `/GoToR`). |
| `local-env.sh npm run test:integration` | 5 files, 155 tests: **153 passed, 2 failed**. The failures are R2-1 and R2-2. |
| `E2E_BASE_URL=http://localhost:3100 local-env.sh npx playwright test tests/e2e/duplicate-presentation.spec.ts` | **7 passed** (15.0 s) |

```
× BUG (round 2): reusing a token hash turns the candidate path into an uncounted, unaudited 'is this person clear?' oracle
  answers: duplicate key value violates unique constraint "referral_candidate_requests_token_hash_key"; counted=2: expected 0 to be greater than 0
× BUG (round 2): storage limit counts each upload once: exactly 30 direct uploads per hour, the 31st refused (B-1)
  expected true to be false   (31st upload succeeded; no app.rate_limits row for the user)
× BUG (round 2): rejects /OpenAction hidden in a Flate-compressed object stream (/ObjStm)   Expected "rejected", received "clean"
× BUG (round 2, minor): rejects /GoToR … (UNC/NTLM leak)                                  Expected "rejected", received "clean"
```

The full E2E suite was not re-run in round 2. The three failures from round 1 that predate N1 or are unrelated to it (onboarding, journey, documents) are in files N1 doesn't touch.

E2E selector updated in round 2: the file row now reads "ats-export.pdf Ready · …" (frontend announcement change), so the test matches `/Ready · /` instead of `/^Ready · /`. This is not a product bug.

### New and changed ACs and scenarios

| Item | Test | Result |
|---|---|---|
| AC-5 (random reference) | DP m-5, QA lookup | PASS |
| AC-17 / AC-57 (in-app only) | QA scenario 49, DP + QA closure and fallback | PASS |
| AC-18 | QA B-1 fixed; QA R2-1 | **FAIL (R2-1)** |
| AC-31 (R1, R2, R4b, R7 listed; R3, R4a, R5 refused with the same code) | DP picker + PD-029 tests; QA scenario 47, variant, R7 | PASS |
| AC-36 | DP claims 10/h | PASS |
| AC-65 (indeterminate indicator) | E2E objection (Ready state, file announced) | PASS |
| AC-68 (with the R-18 exception) | QA scenario 47 + variant, release row/version unchanged | PASS |
| AC-76 | DP PD-032 test; QA scenario 48 tail | PASS |
| Scenario 47 | QA | PASS |
| Scenario 48 | DP + QA | PASS |
| Scenario 49 | QA (in-app notifications, `email_status = not_configured`, no email job); `n1-copy` test still green | PASS |
| BR-19 / BR-22 | | **FAIL (R2-1, R2-2)** |
| BR-25 / BR-26 | | PASS (R-18 accepted) |
| BR-5 / BR-21 | | PASS |

All other AC, BR and scenario rows from round 1 were re-run and stay PASS. The round-1 tables below are kept as history; the round-2 statuses above take precedence.

### Who fixes what
- **backend:** R2-1, R2-2 (majors); r2-m1, r2-m2, r2-m3, r2-m5.
- **backend / PM:** r2-m4 (2029 seed date on the roadmap).

---

# Round 1 (history)

Owner: QA Engineer · 2026-11-13 · Inputs: `brief.md` rev. 4.1 (BR-1 to BR-34, EC-1 to EC-8, 46 scenarios), `spec.md` (AC-1 to AC-75), `backend.md`, `frontend.md`, the working-tree diff (N1 migrations `20261113000100` to `000800`, referrals/admin features, worker).
Environment: **local Supabase stack only** (wrapper `local-env.sh`). The app for E2E was a production build served by `next start -p 3100` plus `npm run worker`, both with the local env exported. Port 3000 and the hosted project were not touched. Both processes were stopped afterwards. Note: the `.next` production build now has the local Supabase URL baked in, so rebuild before any `next start` against another project.

## Verdict: **FAIL**

There are no blockers. Three majors stop acceptance: AC-18 fails as written, BR-25 and BR-26/AC-31 conflict in the spec, and the Must 10 email part is not built. The core rules hold under adversarial tests:
- fingerprints, the client key, both scopes and sticky stops
- the counting rule, delivery re-check and lock
- claims, contest, admin resolution and business days
- privacy of fingerprints, keys, files and the contest reason

| # | Severity | Owner | Bug |
|---|---|---|---|
| B-1 | **major** | backend | Rate limits (submission 30/h, claims 10/h, contest 5/h, uploads 30/h) are enforced only in Server Actions. Calling the RPCs or Storage directly through PostgREST with the member's own JWT skips them, so the BR-22 / AC-18 probing defence can be bypassed. |
| B-2 | **major** | design / PM (then backend) | The BR-26 evidence picker (and `claim_referral_invalid` on a forged claim) tells the hiring side that a withdrawn referral was **released** (BR-25, AC-68). The spec requires both behaviours (AC-31 R4), so this is a spec conflict. |
| B-3 | **major** | backend (+ frontend) | No N1 emails are sent (claim filed, dispute opened/resolved, closure). Brief Must 10 and AC-17/AC-57 ("email when configured") are not met. `backend.md` §8 says so. |
| m-1 | minor | backend | The PDF active-content heuristic is easy to bypass (`/JS(`, `#xx` name escapes, `/AA`, content after 2 MB). |
| m-2 | minor | backend | A pending hit sent with `p_acknowledge_pending = true` on the **first** call writes no fingerprint-hit audit (BR-20, AC-18). |
| m-3 | minor | backend | Evidence objects uploaded straight to Storage and never registered are never purged (and skip the upload limit). This contradicts `security-and-privacy.md` ("deleted after 24 h"). |
| m-4 | minor | backend | The holiday table ends on 2028-12-31, with no guard. Deliveries from about 2028-12-22 get deadlines that ignore 2029 holidays, silently. |
| m-5 | minor | backend | The support reference is `left(audit_id::text, 8)` of a global sequence. It leaks platform-wide audit volume between two stops and stops being unique after 10^8 events. |
| m-6 | minor | frontend / backend | No upload percentage (AC-65 "with progress"). An indeterminate bar is shown instead. Already reported in `frontend.md`. |
| m-7 | minor | copy / frontend | No admin actor label: `actor_kind = admin` events read "Workatent" in the timeline. Already reported. |
| m-8 | minor | design / PM | A client-level stop tells a sourcing org that already presented X to J1 that confidential job J2 has the **same client**. This is inherent to BR-3b + BR-9, a residual of R-2. Confirm it is accepted. |
| m-9 | minor | backend / PM | An `awaiting_candidate` referral whose link expired stays "pending" forever. It keeps producing pending warnings, and its fingerprints are never purged (BR-21). |

## Commands run (real results)

| Command | Result |
|---|---|
| `npm run lint` | exit 0 (before and after the new tests) |
| `npm run typecheck` | exit 0 (before and after) |
| `npm test` (baseline, before QA tests) | 10 files, **65 passed** |
| `npm test` (with QA tests) | 13 files, 82 tests: **78 passed, 4 failed**. All 4 failures are m-1 (new `claim-evidence-qa.test.ts`). |
| `local-env.sh npm run test:integration` (baseline) | 4 files, **92 passed** |
| `local-env.sh npm run test:integration` (with QA tests) | 5 files, 140 tests: **136 passed, 3 failed, 1 expected fail**. The failures are B-1, m-2 and m-3. The expected fail is the B-2 design conflict (`it.fails`). |
| `E2E_BASE_URL=http://localhost:3100 local-env.sh npx playwright test tests/e2e/duplicate-presentation.spec.ts` | **7 passed** (16.1 s) |
| `E2E_BASE_URL=http://localhost:3100 local-env.sh npx playwright test` (full suite) | 18 tests: **9 passed, 3 failed, 6 did not run**. All 3 failures predate N1 or are unrelated to it, see below. |

Failure output (abridged):

```
× BUG: the 30/h submission limit is not enforced when submit_referral is called directly through PostgREST
  AssertionError: expected false to be true   (32 direct calls, 0 rate-limit errors; 32 hit rows written)
× BUG: a pending hit sent with the acknowledgement on the first call leaves no fingerprint-hit audit (BR-20, AC-18)
  the pending hit that was acknowledged must still be audited: expected 0 to be greater than 0
× BUG (minor): objects uploaded straight to storage but never registered are never purged
  expected [ Array(1) ] to include '78619180-…/…/….pdf'
× claim evidence verdict: bypasses — /JS( · #hex names · /AA /URI · active content after 2 MB
  Expected: "rejected"  Received: "clean"   (4 tests)
```

Full E2E suite, failures that predate N1 or are unrelated to it (not counted against N1):
- `tests/e2e/onboarding.spec.ts`: stale before N1. It expects a removed onboarding step, as the caller already knew.
- `tests/e2e/journey.spec.ts`: fails at `getByLabel('Evidence')`. The composer has defaulted to "Ask the candidate to confirm by email" since `HEAD` (`useState(c.email ? "candidate_email" : "recorded")` is already in the committed file), and the test never picks the recorded option. Its later steps also use the removed wallet screens, and the 6 serial tests after it didn't run. Owner: frontend/QA, outside N1.
- `tests/e2e/documents.spec.ts`: `getByLabel(/Upload resume/)` is not found on the candidate page. `candidate-panels.tsx` is unchanged from `HEAD`, and the candidate pages are not part of N1. Owner: frontend, outside N1.

## Tests added (tests only, no application code changed)

- `tests/integration/duplicate-presentation-qa.test.ts`: 48 tests. Covers forged and extra arguments, probing and rate limits, leaks to the hiring side, the release flag, lock races on the recorded path, the remaining counting-rule ACs, claim rules, evidence storage abuse, PD-024 admin checks and business-day edges.
- `tests/e2e/duplicate-presentation.spec.ts`: 7 journeys. Stop (candidate path, mailto subject, no body), two-step warning, objection with a file (worker scan to Ready), contest (sourcing side sees SHA only, note XSS rendered as text), admin reject (contest reason visible to the admin only, no candidate name, no same-person block on file evidence), release later (two steps, Escape/Back change nothing, hiring side sees only "Withdrawn"), and the candidate page `already_sent` state on every reopen with focus on the h1.
- `src/server/queue/handlers/__tests__/claim-evidence-qa.test.ts`: PDF heuristic bypasses (m-1).
- `src/features/referrals/__tests__/deadline.test.ts`: the AC-28 deadline line in en-CA, ET wall time in fr and pt, days-left states.
- `src/i18n/__tests__/n1-copy.test.ts`: C-6 / scenario 32 (no "can't be hired" in en, fr or pt) and BR-9 scope words in the neutral copy.

Existing backend file: `tests/integration/duplicate-presentation.test.ts` (DP below). Its claim test has the comment "Revoking the sharing authorization doesn't block a claim" but never revokes anything. QA now covers revocation for real (QA "revoked referral").

## Bugs in detail

### B-1 (major, backend): rate limits can be bypassed through direct RPC / Storage calls
- **Where:** `src/features/referrals/actions.ts:53` (`rateLimit(ctx.db, "referral.submit", 30, 3600)`), `:374` (claim upload), `:425` (claims), `:441` (contest). `public.submit_referral`, `submit_referral_for_candidate`, `file_prior_presentation_claim` and `contest_prior_presentation_claim` (migrations `…0400`, `…0500`, `…0600`) never call `consume_rate_limit`. `security-and-privacy.md` itself lists PostgREST as reachable "with the publishable key plus a user's own JWT".
- **Repro:** run QA "BUG: the 30/h submission limit…". As a fresh member, call `rpc('submit_referral', …)` 32 times in a row for a stopped candidate.
- **Expected (AC-18, BR-22):** attempt 31 and later get the rate-limit error, and no check runs.
- **Actual:** all 32 attempts run the check and write 32 rows to `app.presentation_hits`. The same applies to claims (10/h), contests (5/h, BR-19) and direct `storage.upload` to `claim-evidence` (30/h).
- **Fix direction:** call `app.consume_rate_limit`-style logic inside the RPCs (or inside `app.submission_gate`), with the same buckets. Note that the existing DP file makes more than 30 submissions as one user, so it will need per-test users once this is fixed.

### B-2 (major, design/PM first): the picker reveals releases to the hiring side
- **Where:** `public.list_claim_evidence_referrals` → `app.evidence_referral_ok` → `app.presentation_counts` (migration `…0500`). `file_prior_presentation_claim` returns `claim_referral_invalid` for the same reason.
- **Repro:** QA "DESIGN CONFLICT…" (`it.fails`).
  1. B receives R1 from A, and A withdraws it without releasing.
  2. B receives R2 from A1 for the same job.
  3. B's picker on R2 lists R1.
  4. A releases R1.
  5. B's picker on R2 no longer lists R1.
- **Expected (BR-25, AC-68):** the hiring side can't learn about a release through "any RPC callable by authenticated".
- **Actual:** it can. AC-31 also demands that released referrals (R4) are absent from the picker, so the spec contradicts itself.
- **Options for PM:**
  - list withdrawn or cancelled referrals whatever their release state, and decide at filing time in a way that doesn't reveal it (for example, accept the citation and record the release for the admin);
  - or accept the leak as residual and amend BR-25.

### B-3 (major, backend + frontend): N1 emails are not sent
- `backend.md` §8: "Emails (`emails.*` keys in spec §5.10) are **not** sent by the backend yet". `frontend.md` gap 7 says the same.
- Brief Must 10 and AC-17/AC-57 require "email when configured" for the closure, the claim filed, and the dispute opened and resolved. The in-app notifications are correct (tested).

### m-1 (minor, backend): the PDF scan heuristic can be bypassed
`src/server/queue/handlers/claim-evidence.ts:27` checks `/\/JavaScript|\/JS\s|\/Launch|\/EmbeddedFile|\/OpenAction/` on the first 2 MB only. Each of these comes back `clean`:
- `/JS(app.alert(1))` (no whitespace)
- `/J#61vaScript` and `/Open#41ction` (PDF name escapes)
- `/AA` with `/URI`
- `/OpenAction` after 2 MB

Admins download these files (PD-024). Normalise `#xx` escapes, match `/JS\b`, add `/AA`, `/URI` and `/SubmitForm`, scan the whole file (it is at most 10 MB), or reject PDFs that contain `/ObjStm` streams that can't be inspected.

### m-2 (minor, backend): an acknowledged pending hit is not audited
`app.submission_gate` (migration `…0400`) returns "go ahead" for `pending` + `p_acknowledge_pending` without calling `record_presentation_outcome`. A forged first call with the ack therefore leaves no `referral.fingerprint_hit` (outcome warn) and no hit row. Record a `warn` (or `warn_ack`) hit in that branch too.

### m-3 (minor, backend): unregistered evidence objects are never purged
`purge_orphan_claim_files` only looks at `app.referral_claim_files` rows. An object uploaded with the member's JWT (the insert policy allows it while the referral is claimable) but never registered stays in Storage for good, and this also bypasses the upload limit. Repro: QA "BUG (minor): objects uploaded straight to storage…". Also sweep `storage.objects` in `claim-evidence` that have no row and are older than 24 h.

### m-4 (minor, backend): calendar ends in 2028
`add_business_days('2028-12-22 12:00 ET', 5)` returns `2029-01-02`, with 1 Jan 2029 counted as a business day (QA business-day test, documented). Seed 2029 before it is needed, or make the helper raise or alert when it counts a date past the last seeded year.

### m-5 (minor, backend): the support reference is a global sequence prefix
`record_presentation_outcome` returns `left(v_audit::text, 8)`. Two stops by the same user reveal how many audit events the whole platform wrote in between. After 99,999,999 events the reference is a truncated prefix, so it is ambiguous for support lookups. Use a random opaque token stored on the hit row.

### m-8 (minor, design/PM): client-level stop vs confidential client
If A itself presented X to B's J1 (A knows this), a stop on B's confidential J2 tells A that J2 has J1's client. It follows from BR-3b + BR-9 ("identical whether the earlier referral came from the submitter's own org") and is close to R-2. Please record it as an accepted residual.

### m-9 (minor, backend/PM): expired links stay pending
No sweep moves `awaiting_candidate` referrals whose request has expired. `app.presentation_check` keeps warning on them, and `purge_presentation_data` keeps their fingerprints because the status is still `awaiting_candidate`.

### Residuals noted (no action requested)
- A hiring org's sister org (one shared member) can find out about a release by making a real internal submission. Doing so creates a referral, so it is the usual R-2 enumeration.
- `respond_candidate_request` keeps the candidate's profile edits even when the referral closes as `already_presented`, as specified.

## Probe results (adversarial checklist)

| Probe | Result |
|---|---|
| Direct RPC with forged or extra args (`p_fingerprints`, `p_email_hash`, `p_skip_check`, `p_client_key`, `p_sha256`, `p_mime_type`, `p_size_bytes`, `p_contest_deadline_at`, `p_force`, `p_side`) on 7 RPCs | All refused with `PGRST202`, none silently ignored (QA) |
| Worker-only `record_claim_evidence_scan` / `claim_evidence_scan_target` as anon or a member (forge the SHA) | `permission denied` (QA) |
| Fake acknowledgement on a stop (both paths) | Still `stopped` (QA) |
| Confirmation page editing email or LinkedIn to dodge the re-check; junk or SQL in the phone | Ignored or escaped; closes as `already_sent` (QA) |
| Other tenants' ids: get/list/contest/withdraw/register/remove/authorize/file/release/compare/resolve/get_dispute | `not_found` or `forbidden`, with no data in the error (DP + QA IDOR tests) |
| Hiring side learning the release flag through `referrals` select, `get_referral_presentation`, status events, version or notifications | Nothing changes, the row is byte-identical (QA). **Picker leak: B-2** |
| Hiring side learning the contest reason through presentation, notifications, audit or `disputes` select | Not exposed (QA + E2E) |
| Hiring side learning who presented first or seeing stops | No rows, notifications or audit for stops, warnings, refusals or `already_presented` (QA) |
| Sourcing side getting evidence files through `authorize`, Storage download/list/remove, or names in the panel | Refused or empty; panel shows `n`/`uploaded_at`/`sha256` only (DP + QA + E2E) |
| Stop payload, job hit vs client hit, both paths | Same keys and values except `reference`; member audit rows identical (`metadata {}`) (QA + DP) |
| Platform-only audit (scope, sticky, contacts compared) read by org admins | Empty (QA) |
| Advisory lock: 3 parallel recorded submissions; 2 parallel acknowledged submissions; 2 parallel confirmations | Exactly 1 delivered each time (QA + DP) |
| Business days: Friday 23:59:59 ET, Saturday 00:00, Sunday, Monday; Christmas week 2026 and 2027; holiday delivery; 24 June / 1 July 2027 and 2028; DST; contest over the holidays; days left | All as specified (DP + QA). After 2028: m-4 |
| Evidence: HTML or CSV content type, > 10 MB, `.html` path, PNG under `.pdf`, HTML bytes as PDF, overwrite with upsert, 6th file, cross-org folder | Refused, or `rejected` by the worker; SHA stays true (QA). PDF heuristic: m-1 |
| Rate limits | Correct through the actions; bypassed through PostgREST (B-1) |
| XSS in the claim note and contest reason | Stored verbatim and rendered as text: no `<img>` node, no script dialog (E2E on the sourcing page, the admin card and the hiring page) |
| Admin same-person RPC | Exactly `{email, phone, linkedin}` with enum values; no hash, `\x` or `@`; audited with `metadata {}` and the admin as actor; non-admin, anon and file-evidence calls refused; match / no_match / not_available case verified (QA + DP) |
| Admin evidence download on undisputed (open or final) claims | `not_found` (DP + QA) |

## AC → test → result

DP = `tests/integration/duplicate-presentation.test.ts`, QA = `tests/integration/duplicate-presentation-qa.test.ts`, E2E = `tests/e2e/duplicate-presentation.spec.ts`, U = unit. "Code review" means the item was checked by reading the code only.

| AC | Test(s) | Result |
|---|---|---|
| AC-1 | DP "stops a job-level hit"; E2E stop | PASS |
| AC-2 | DP client-level (Inc./Corporation/Ltée); QA normalisation (Société Générale) | PASS |
| AC-3 | DP placeholders | PASS |
| AC-4 | DP never across hiring orgs | PASS |
| AC-5 | DP same payload shape; QA job vs client on both paths, member audit identical; E2E mailto subject, no body | PASS (reference: m-5) |
| AC-6 | DP snapshot; QA rename second half | PASS |
| AC-7 | DP normalisers incl. plus-alias; QA FR trunk 0, NANP extension | PASS |
| AC-8 | DP pending → ack → created; E2E two-step | PASS |
| AC-9 | DP withdrawn, legacy duplicate; QA 9 statuses | PASS |
| AC-10 | DP window, released, upheld, final; QA candidate_declined | PASS |
| AC-11 | QA cancelled and reposted | PASS |
| AC-12 | DP both paths `identifier_required`, audit | PASS (UI S1-b not E2E-tested) |
| AC-13 | DP unnormalisable phone | PASS |
| AC-14 | DP sticky + expiry; QA sticky after release, columns hold no identifiers | PASS |
| AC-15 | DP phone edited on confirm, B has no audit; QA not_found on every hiring read | PASS |
| AC-16 | DP race and parallel confirms | PASS |
| AC-17 | DP in-app notification and actor `system`; QA submitter only, fallback to org admin | **FAIL (email part, B-3)**; in-app PASS |
| AC-18 | QA direct-RPC limit; QA preconditions before the check | **FAIL (B-1, m-2)**; preconditions PASS |
| AC-19 | DP never delivered refused, `can_release_on_withdraw` | PASS (placement-dispute guard by code review only) |
| AC-20 | DP withdraw + release | PASS |
| AC-21 | DP keeps first position | PASS (toast text not E2E-tested) |
| AC-22 | DP cancelled release later; E2E withdrawn release later, two steps | PASS |
| AC-22a | DP never delivered, declined, outside window, other side/org; QA final → `can_release` false | PASS (open-dispute cases by code review: a withdrawn or cancelled referral can't have an open referral dispute) |
| AC-23 | DP + QA row and presentation unchanged; E2E hiring page | PASS |
| AC-24 | DP RPC refuses duplicate and prior_presentation; QA free-text decline; U review.test | PASS |
| AC-25 | DP legacy counts | PASS (label not E2E-tested) |
| AC-26 | DP bulk refuses | PASS (hint UI not E2E-tested) |
| AC-27 | DP `can_claim` false after deadline and after a claim; QA revoked eligible; E2E "File objection" absent after rejection | PASS |
| AC-28 | DP `business_days_left`; U deadline line | PASS |
| AC-29 | DP date, attestation, side; QA boundaries day-1 and exactly 6 months | PASS |
| AC-30 | QA bucket MIME and size, 6th file, extension mismatch | PASS (client-side field errors not E2E-tested) |
| AC-31 | DP picker, forged citations, revoked flag | PASS, **but see B-2** |
| AC-32 | DP filing effects, notification, deadline frozen, still counts | PASS |
| AC-33 | DP after deadline and after accept | PASS |
| AC-34 | QA info_requested, deadline unchanged | PASS |
| AC-35 | DP second claim, after rejection | PASS |
| AC-36 | Action limit (code review) | **FAIL via direct RPC (B-1)** |
| AC-37 | DP files keys; E2E panel (File 1, SHA, no name, no download) | PASS |
| AC-38 | DP authorize; QA Storage download, list, remove, upload | PASS |
| AC-39 | DP referral evidence hidden from the source | PASS |
| AC-40 | DP contest, dispute visibility, notifications; E2E | PASS (5/h only through the action: B-1) |
| AC-41 | DP lazy final; QA final effects | PASS |
| AC-42 | DP contest window closed, dispute already open | PASS |
| AC-43 | DP admin card has no label; QA same-person enums, audit, refusals, match/no_match/n/a; E2E card, contest reason, no same-person block on file evidence | PASS |
| AC-44 | DP + QA undisputed refused, disputed audited | PASS (`/admin/disputes` 404 for non-admins not re-tested) |
| AC-45 | DP upheld | PASS (panel UI not E2E-tested) |
| AC-46 | DP rejected, version + 1, actor admin; QA stale version, no re-resolve | PASS |
| AC-47 | E2E rejected chip/banner, no File objection; QA `can_release_on_withdraw` after rejection | PASS |
| AC-48 | DP `resolve_dispute` refuses referral disputes | PASS (placement regression is only in the stale journey.spec) |
| AC-49 | Code review (`locale` in the card) | Not E2E-tested |
| AC-50 | DP abuse flags RPC | PASS (panel UI not tested) |
| AC-51 | DP metrics RPC | PASS (panel UI not tested) |
| AC-52 | DP full table; QA extra edges | PASS |
| AC-53 | DP holiday edit | PASS |
| AC-54 | DP backfill invariant | PASS |
| AC-55 | DP closed tables, app functions, vault, jobs columns; api-surface green | PASS |
| AC-56 | QA hiring side and org C see nothing; member audit has no identifiers | PASS |
| AC-57 | DP + QA in-app | **FAIL (email part, B-3)** |
| AC-58 | DP purge, anonymisation; QA open dispute keeps fingerprints | PASS |
| AC-59 | U n1-copy (en/fr/pt), messages parity | PASS |
| AC-60 | Copy keys present (composer hint seen in E2E snapshot) | PASS (candidate page sentence not asserted) |
| AC-61 | — | **Not verified** (keyboard pass not run) |
| AC-62 | — | **Not verified** by QA (frontend reports screenshots) |
| AC-63 | DP outcomes; E2E stop and warning render in the panel, URL unchanged | PASS |
| AC-64 | DP step 1 creates nothing; forged step 2 without ack (code review: same gate) | PASS |
| AC-65 | E2E Ready state, submit disabled until ready; DP + QA rejected file | PASS except progress % (m-6) |
| AC-66 | DP not ready, frozen SHA; QA deadline at filing, other referral's file, duplicate ids | PASS |
| AC-67 | E2E dialog shows the ET deadline above the upload (screenshot) | PASS |
| AC-68 | DP + QA hiring reads; picker | **FAIL (B-2)** |
| AC-69 | DP `already_sent` on reopen; E2E S7, focus h1, reload | PASS |
| AC-70 | Keys in en/fr/pt and wired in `job-form.tsx` (code review) | Not E2E-tested |
| AC-71 | DP connector/API insert gets a key | PASS |
| AC-72 | DP internal both directions | PASS |
| AC-73 | DP withdrawn while awaiting | PASS |
| AC-74 | DP + QA parallel; QA forged args, worker RPCs; DP app/vault unreachable | PASS |
| AC-75 | DP `earlier_internal` only in `app.presentation_hits`, not in audit | PASS |

## BR → test → result

| BR | Tests | Result |
|---|---|---|
| BR-1 | DP normalisers, no caller hashes; QA forged args, FR and NANP | PASS |
| BR-2 | DP closed tables | PASS |
| BR-3 | DP job, client, cross-org | PASS |
| BR-4 | DP + QA all statuses and exits | PASS |
| BR-5 | DP pending; QA candidate_declined | PASS (m-9) |
| BR-6 | DP stop persists sticky + audit; E2E | PASS |
| BR-7 | DP + E2E two-step; QA parallel ack | PASS |
| BR-8 | DP + QA closure, lock | PASS |
| BR-9 | DP + QA payload; U copy | PASS (m-5, m-8) |
| BR-10 | DP both paths | PASS |
| BR-11 | DP + QA | PASS |
| BR-12 | DP + QA date, attestation, status, revoked, info_requested | PASS |
| BR-13 | DP after deadline | PASS |
| BR-14 | DP bulk RPC | PASS |
| BR-15 | DP + QA + E2E files, SHA, access | PASS (m-1, m-3) |
| BR-16 | DP contest, final | PASS |
| BR-17 | DP + QA + U | PASS (m-4) |
| BR-18 | DP upheld/rejected; QA EC-8 | PASS |
| BR-19 | Through the actions only | **FAIL (B-1)** |
| BR-20 | DP + QA in-app and audit | **FAIL (emails B-3; m-2)** |
| BR-21 | DP purge, anonymisation; QA dispute keeps | PASS |
| BR-22 | QA preconditions first; no check endpoint (api-surface) | **FAIL (B-1)** |
| BR-23 | DP trigger, connector, snapshot, placeholders; QA accents | PASS |
| BR-24 | DP + QA | PASS |
| BR-25 | DP + QA + E2E | **FAIL (B-2 leak)**; guards PASS |
| BR-26 | DP picker; QA revoked | PASS (conflicts with BR-25, B-2) |
| BR-27 | DP | PASS |
| BR-28 | DP + QA | PASS |
| BR-29 | DP RPC | PASS (UI not tested) |
| BR-30 | DP legacy counts | PASS |
| BR-31 | DP internal both directions | PASS |
| BR-32 | Code review: keys en/fr/pt, optional field | PASS (not E2E-tested) |
| BR-33 | DP vault/app unreachable; no env var (`.env.example` checked) | PASS |
| BR-34 | DP backfill; QA recompute used in a fixture | PASS |

EC-1 to EC-8: EC-1 PASS (DP/QA/E2E). EC-2 PASS (DP). EC-3 PASS (DP + QA, 3 race shapes). EC-4 PASS (DP/QA/E2E). EC-5 PASS: `docs/architecture.md` lines 41–45 list the worker scan, URL signing, object deletion, maintenance and rotation. EC-6 PASS (DP). EC-7 PASS (DP). EC-8 PASS (DP + QA stale version).

## Strategist scenarios (brief §9) → result

| # | Test | Result | | # | Test | Result |
|---|---|---|---|---|---|---|
| 1 | DP client-level | PASS | | 24 | DP abuse-flags RPC (rejected claims counted by code) | PASS (UI not tested) |
| 2 | DP placeholders | PASS | | 25 | DP AC-52; QA Friday 23:59:59 | PASS |
| 3 | DP cross-org | PASS | | 26 | DP Saturday, 24 June; QA Saturday 00:00, 25 Dec | PASS |
| 4 | DP + QA payload | PASS | | 27 | DP Easter, Family Day, Christmas | PASS |
| 5 | DP snapshot + QA rename | PASS | | 28 | DP Civic, 30 Sep, 11 Nov; QA 24/31 Dec | PASS |
| 6 | DP both paths | PASS | | 29 | DP holiday edit | PASS |
| 7 | DP + QA sticky | PASS | | 30 | DP DST | PASS |
| 8 | DP phone re-check | PASS | | 31 | DP backfill | PASS |
| 9 | QA direct limit; DP flags | **FAIL (B-1)** | | 32 | U n1-copy | PASS |
| 10 | DP race | PASS | | 33 | DP awaiting withdrawn | PASS |
| 11 | DP + E2E warning | PASS | | 34 | DP + QA parallel | PASS |
| 12 | DP withdrawn; QA cancelled + repost | PASS | | 35 | DP + QA forged args | PASS |
| 13 | DP release + keep | PASS | | 36 | DP sticky + audit; step 1 has no side effects | PASS |
| 14 | DP awaiting; QA candidate_declined | PASS | | 37 | DP + QA + E2E | PASS (m-1) |
| 15 | DP + QA statuses, window | PASS | | 38 | DP + QA + E2E | **FAIL (B-2)** |
| 16 | DP + QA dates, attestation | PASS | | 39 | DP internal earlier | PASS |
| 17 | DP picker | PASS | | 40 | DP connector key, closed | PASS |
| 18 | DP + QA + E2E | PASS | | 41 | DP AC-52 rows | PASS |
| 19 | DP after accept/deadline; QA info_requested | PASS | | 42 | DP cancelled; E2E withdrawn | PASS |
| 20 | DP second claim, bulk | PASS | | 43 | DP + QA guards | PASS |
| 21 | DP lazy final | PASS | | 44 | DP outside → internal | PASS |
| 22 | DP upheld | PASS | | 45 | DP attribute closed | PASS |
| 23 | DP rejected; QA + E2E effects | PASS | | 46 | Code review (keys en/fr/pt, optional) | PASS (not E2E-tested) |

## Not run or not verified
- Keyboard-only paths (AC-61), the 375px light/dark layout (AC-62) and the fr/pt layout in the browser were not checked by QA. Frontend reports screenshots in `frontend.md`.
- These UI surfaces were not covered by E2E: the admin "Organizations to review" and "Duplicate protection" panels (AC-49 to AC-51), the job-form hint switching (AC-70), the referral-evidence picker, uphold, the bulk hint (AC-26), the legacy label (AC-25), and the client-side file errors (AC-30). Their server rules are covered by integration tests.
- The placement-dispute release guard (AC-19/AC-22a) was checked by code review only (`app.release_allowed`). Setting up a placement dispute needs the hire/agreement flow, which the stale journey test currently can't drive.
- Email sending: not implemented (B-3), so nothing to test.
