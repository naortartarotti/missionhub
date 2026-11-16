# QA report: Network Rules enforcement (N10)

Owner: QA Engineer · Date: 2026-11-16 · Branch `n10-network-rules` (commit 9a2d5d3, which already includes the three QA test files; the only change since is an unused-import fix in `network-rules-qa.test.ts`, uncommitted)
Inputs: `brief.md` rev. 2 (BR-1 to BR-44), `spec.md` (AC-1 to AC-151; Should: AC-121 to AC-125 and AC-140), `backend.md` (contract and §11 deviations), `frontend.md` (§3, 15 gaps). PD-084: the legal text ships as drafts, so draft wording is not counted as a defect.
Environment: local Supabase only (`127.0.0.1:55321` / `:55322`), with env overrides from `supabase status`. `.env.local` (hosted) was neither edited nor used. The E2E server is an isolated copy of the tree on `:3140` with a local-only `.env.local` in the copy. No commit, no push, no `db push`, no migration edits.

## Round 2 verdict (re-test of the round-1 fixes, 2026-11-16): **PASS**

Every round-1 bug is fixed and verified. The probes around the fixes found nothing new. No blocker or major is open. AC-32 is deferred by the lead (the PM records it) and is counted as accepted.

### Fix verification

| Bug | Fix (uncommitted, `backend.md` §12) | Verified by | Result |
|---|---|---|---|
| QA-N10-01 (blocker) | `20261116001800_n10_qa_fixes.sql`: the three columns are revoked for `authenticated` / `anon`; `public.admin_organizations` view for platform admins | QA-N10-01 (flipped to `it`); new round-2 probes; backend's new `network-rules-restriction` test | **Fixed** |
| QA-N10-04 (major) | `safeNext` refuses control characters, whitespace (incl. Unicode) and backslashes, needs exactly one leading `/`, and checks the origin with `new URL` | QAu QA-N10-04; new round-2 battery; QAe QA-N10-04 in Chromium (the Back link stays on origin) | **Fixed** |
| QA-N10-05 (major) | `accept_network_rules` checks the required version for the current version, and the version itself for an upcoming one | QA-N10-05 (rolled-back transaction); new round-2 upcoming-version probe | **Fixed** |
| QA-N10-02 | `candidate_photos_delete` checks the gate | QA-N10-02 | **Fixed** |
| QA-N10-03 | Trigger `audit_mask_platform_admin` nulls a platform admin's `actor_id` on org rows of sanction audit actions and writes an org-null admin copy | QA-N10-03; round-2 audit probe | **Fixed** |
| QA-N10-06 | `result.ts:75-76` → `…userLimitNoSupport` / `orgLimitNoSupport` (keys exist); `schemas.ts:66` → `errors.labelFormat` | Code + key lookup | **Fixed** |
| QA-N10-07 | Tautological assertion removed from `network-rules-conduct.test.ts` | Diff | **Fixed** |
| AC-32 | Deferred (lead) | — | **Accepted** (PM to record) |

### Round-2 probes (new tests, all passing)

**`tests/integration/network-rules-qa.test.ts`, 5 new tests:**
- **Revoked columns.** For a partner member and for the suspended org's own member, all of these are refused:
  - `select *`;
  - an explicit select of each column;
  - ordering by each column;
  - a filter on each column (it either errors or returns no rows, so it can't be used as an oracle);
  - an embedded select through `referrals → organizations!referrals_target_org_id_fkey(suspended_at, suspended_reason)`.

  The safe columns (`id, name`) still work.
- **`admin_organizations`.** It returns zero rows (and a zero count) to org admins, recruiters and the suspended org itself. A platform admin gets the row including `suspended_reason`. The view can't be written to.
- **Catalog search.** Only one view reads `organizations` (`admin_organizations`). The public RPCs whose source reads the columns are `admin_org_conduct_file`, `admin_list_hire_reports`, `admin_get_hire_report`, `admin_close_stale_referral` and `admin_lift_sanction`, all checking `is_platform_admin()`, plus `get_my_org_state`, which answers for the caller's own org and is `not_found` for a partner. No member RPC serializes whole org rows (`to_jsonb(o)` / `row_to_json`).
- **App code.** No user-client select of the three columns remains. The admin pages use the view. `matching-service.ts` reads them with the service role (the worker), which is unchanged.
- **Audit.** The reported org reads only its own rows. Platform-admin actions show `actor_id = null`. Member actions keep their actor. The org-null admin copy holds the admin id and isn't readable by the org.
- **Acceptance (upcoming version, rolled-back transaction).**

  | Who | Statements sent | Result |
  |---|---|---|
  | `org_admin` whose org hasn't accepted the upcoming version | personal only | `rules_acceptance_required` |
  | same `org_admin` | personal + org | ok |
  | recruiter | personal | ok |

  N10-D18 still holds for upcoming versions.

**`src/features/network-rules/__tests__/qa.test.ts`, 2 new tests: `safeNext` battery.**
- 24 hostile inputs return the fallback: tab, LF, CR, VT, FF and NUL after the slash; a leading tab or space; NBSP, U+2028, U+3000; backslash variants; `//` and `///`; `https:`, `http://` and `javascript:` schemes; empty string; no leading slash; more than 2,048 characters.
- For those inputs plus `/%2F%2F…`, `/.//…`, `/..//…`, `/%5C…`, `/@…` and `/?next=//…`, the returned value always resolves to the app origin.
- Normal in-app targets (with query and hash) are kept.

**`tests/e2e/network-rules-qa.spec.ts`, 1 new test: admin pages on the new view.**
- `/admin` renders.
- `/admin/organizations?status=suspended&q=…` lists the suspended org with the "Suspended" pill (the filter on `suspended_at` goes through the view).
- `/admin/organizations/[id]` shows "Suspended (before N10)" and **Lift…**.
- The held org's page renders.

### Round-2 AC changes

| AC | Round 1 | Round 2 |
|---|---|---|
| AC-20 | Partial | Pass (test) |
| AC-50 | Fail | Pass (test) |
| AC-143 | Partial | Pass (test) |
| AC-148 | Partial | Pass (test) |
| AC-32 | Fail | Accepted (deferred) |

**Totals: 145 Must ACs.**
- Pass: 126
- Partial: 15 (AC-4, 25, 26, 30, 44, 72, 73, 85, 86, 95, 101, 102, 103, 127, 151)
- Accepted/deferred: 1 (AC-32)
- Not verified: 3 (AC-118 to AC-120, accessibility)

The partials are mostly UI states QA didn't render, and settlement-mode money and dispute flows. The minor frontend gaps 8 and 11 behind AC-151 and AC-127 stay open as minors.

### Round-2 commands (local stack only; same env overrides as §6)

```
npm run lint        → exit 0
npx tsc --noEmit    → exit 0
npm test            → Test Files 35 passed (35) · Tests 313 passed (313)
npx vitest run -c vitest.integration.config.mts --testTimeout=240000 --hookTimeout=400000 \
  tests/integration/network-rules-{gate,restriction,conduct,settlement,versions,qa}.test.ts tests/integration/api-surface.test.ts
                    → Test Files 7 passed (7) · Tests 120 passed (120)   (no expected fails left)
E2E_BASE_URL=http://localhost:3140 npx playwright test tests/e2e/network-rules.spec.ts tests/e2e/network-rules-qa.spec.ts
                    → 11 passed (34.0s)
```

**Still open, not blocking:**
- The minor frontend gaps 1–3 and 8–11.
- Accessibility (AC-118 to AC-120) has had no axe or keyboard pass.
- The full integration suite wasn't re-run. The round-1 attempt couldn't finish on the shared stack (§6.1). The round-2 fixes touch `organizations` grants for every feature. App code was grepped for user-client reads of the three columns (none left), and the N10, admin and settlement paths pass. The PM should still note that other features' suites weren't re-run against the revoke.

---

## Round 1 verdict (superseded): **FAIL**

| # | Severity | Owner | Summary |
|---|---|---|---|
| QA-N10-01 | **Blocker** | backend | Partners can read the other org's `suspended_at`, `terminated_at` and `suspended_reason` through PostgREST. This breaks BR-42 and AC-50, which are hard constraints. |
| QA-N10-04 | **Major** | frontend | Open redirect via `?next=` on `/accept-rules` and `?from=` on `/network-rules`. `safeNext` lets `/\t/evil.example` through. Reproduced in a real browser. |
| QA-N10-05 | **Major** | backend | A never-accepted `org_admin` can't pass the gate once any non-material version is current. The UI offers the personal statement only, and the RPC then demands the org statement. This is frontend gap 14, now reproduced. |
| AC-32 | **Major** (Must AC not built) | backend; PM to decide | `network_rules.effective_not_accepted` isn't sent at the effective date (backend §11.2). |
| QA-N10-02 | Minor | backend | `candidate_photos_delete` doesn't check the gate. A gated member can delete candidate photos (AC-143). |
| QA-N10-03 | Minor | backend | Conduct and sanction audit rows on the reported org carry the platform admin's user id in `actor_id`, readable by its `org_admin`s (AC-148, N10-D28). |
| QA-N10-06 | Minor | backend | Two frontend gaps are confirmed: `N10_ERROR_KEYS` points at missing keys (`network.report.errors.userLimit` / `orgLimit`), and `rulesDraftSchema` uses a non-§5 key. |
| QA-N10-07 | Minor (test quality) | backend | The BR-19 assertion in `network-rules-conduct.test.ts` is tautological (`release_allowed(x) == release_allowed(x)`). QA added a real before/after test. |

The rest of the server contract holds up under adversarial testing. Nothing leaked in these areas:
- IDOR with forged org, case, notice, follow-up, referral and match ids;
- the reporter's identity reaching the reported org;
- conduct content outside `app.conduct_*`;
- the sanction-ladder checks (prior notice, closed grounds, reviewer ≠ decider or hold applier, no increase, termination-lift rule, decided once);
- settlement scope (closed history and candidates stay closed);
- storage policies on `conduct-evidence`;
- Markdown / XSS in the rules text.

**Test counts (actual runs, this commit):**

| Run | Result |
|---|---|
| Unit | 308 passed + 1 expected fail (35 files) |
| N10 integration (5 backend suites + QA suite + api-surface) | 110 passed + 4 expected fail (7 files) |
| N10 E2E | 10/10 (incl. 1 expected fail) |
| Full integration | not completed on the shared stack (stopped after 47 min; see §6.1) |

Each expected fail is a reproduced bug, written as `it.fails` / `test.fail`. It turns red once fixed; then drop `.fails`.

---

## 1. Tests added (tests only)

| File | Content |
|---|---|
| `tests/integration/network-rules-qa.test.ts` (new, 27 tests: 23 pass + 4 `it.fails`) | **IDOR:** an unrelated org's admin calls 16 member RPCs with S/T ids → bare `not_found`, no ids or names in the error; `get_partner_job_availability` → `{status:not_found}`; reporter-side vs org-side RPCs swapped; `deactivate_member_in_settlement` with another org's membership; forged / both / neither match ids. **Reporter identity:** after notice, follow-up, response and decision, every surface the reported org can read (case RPC, standing, org state, notifications, case audit rows, `disputes`) is free of the reporter user id, email and name, the reporting org id and name, the report text, the category and the platform admin ids. Naming the reporter names the org only. Recruiters of the reporting org see no case audit row. **Partners:** S21 status is identical for held and suspended owners (keys `status, org_name, job_title` only); submits get `job_not_open_for_referrals`; no org state, standing or acceptances of the partner; QA-N10-01. **Settlement:** a closed referral, its messages and events are invisible; no message insert on it; a live one still works; the candidate behind a live referral is unreadable; own jobs with no in-scope referral are unreadable and unwritable; no new submission; no writes to the org's sanction columns or settings. **Ladder:** 9 admin RPCs refused for members; lift via another org's id; decision on a notice of another case; decided once; a warning can't be "lifted"; ground variants `"2.3 "`, `" 4.8"`, `"4.80"`, `"2,3"`; termination without "why not a hold"; review after the stored deadline. **Validation:** report text 19 / 4,001 / blank, unknown or empty category, future date, attestation, 6 files, unknown file, 4,000 accepted, a cross-side category accepted (AC-126); locale, no statement, org statement by a recruiter, unknown version; response 19 / 8,001 / 8,000. **Storage** (see §4). **Gate:** report, response and evidence by a gated admin; QA-N10-02; `accept_network_rules` exempt with the fr-CA hash. **BR-19** before/after snapshot. QA-N10-05 (one rolled-back transaction: nothing is visible to other sessions, no publish notification). **Org rate limit:** the 11th report from an org (3 users) is refused, with 10 cases created. |
| `src/features/network-rules/__tests__/qa.test.ts` (new, 8: 7 pass + 1 `it.fails`) | Hostile Markdown (`<script>`, `javascript:` links, `<img onerror>`, `<iframe>`, `<style>`) renders as escaped text through `RulesText` (`renderToStaticMarkup`): no element or attribute from the text, slug-only ids. Zod boundaries for report, response, reply, follow-up, review, acceptance, immediate-hold ground, decision and lift. `safeNext` refuses `//`, absolute, `\` and `javascript:`; QA-N10-04 (`/\t/`, `/\n/`, `/\r/`). |
| `tests/e2e/network-rules-qa.spec.ts` (new, 7: 6 pass + 1 `test.fail`) | Held-org recruiter: B2 without the standing link; `/settings/standing` not found (AC-47, AC-75). Held org: opportunities paused (AC-42). Settlement: B6, settlement home, `/candidates` → S22-c, Candidates / Jobs / Opportunities missing from the nav (AC-98, 99, 105). Versions page: signed out → sign-in; a gated member can read it (AC-10). A French org opens fr-CA first (AC-12, AC-33). Onboarding Rules step: 2 unticked boxes, Continue disabled with `needBoth`; a language switch unticks both and shows `languageChanged`; org and member acceptances are stored with `fr-CA` (AC-14, 15, 17). QA-N10-04 in the browser. |

No application code was changed.

## 2. AC table

Legend:
- **Pass (test):** an automated test proves it.
- **Pass (code):** verified by reading the code; no test.
- **Partial:** part of the AC is proven, part is open or failing.
- **Fail.**
- **NV:** not verifiable by QA this round.

Test file shorthand: `V` versions, `G` gate, `R` restriction, `C` conduct, `S` settlement (all `tests/integration/network-rules-*.test.ts`); `QA` = `network-rules-qa.test.ts`; `QAu` = unit QA; `E` = `tests/e2e/network-rules.spec.ts`; `QAe` = `tests/e2e/network-rules-qa.spec.ts`.

### A. Rules versions

| AC | Result | Evidence |
|---|---|---|
| 1 | Pass (test) | V "refuses a missing locale…" (`missing_locale`). Form shows `code`/`detail`: code |
| 2 | Pass (test) | V `marker_found`; unit `domain.test.ts` `findRulesMarkers` |
| 3 | Pass (test) | V `effective_date`; "publishes a material version at 00:00 ET" |
| 4 | Partial | V `legal_reason_required`. Reason shown on `/network-rules`: NV |
| 5 | Pass (test) | V: `network_rules.published` notification |
| 6 | Pass (test) | V `upcoming_exists`. Button disabled with hint: code `admin/network-rules/page.tsx:42` |
| 7 | Pass (test) | V `approval_reference_required` |
| 8 | Pass (test) | V immutable for PostgREST and service role; SHA per locale |
| 9 | Pass (test) | V; QA member admin-RPC sweep (`publish_network_rules_version` forbidden) |
| 10 | Pass (test) | QAe versions page (signed out → sign-in; gated member reads it) |
| 11 | Pass (test) | V drafts invisible; page `notFound()` for unknown label: code |
| 12 | Pass (test) | QAe fr-CA first (`lang="fr-CA"`, Français first) |
| 13 | Pass (code) | `workspace/[orgSlug]/layout.tsx:53` `rulesHref` |

### B. Acceptance

| AC | Result | Evidence |
|---|---|---|
| 14 | Pass (test) | QAe onboarding Rules step |
| 15 | Pass (test) | V "org creation needs both statements…" (SHA, audit); QAe locale stored |
| 16 | Pass (test) | V `rules_acceptance_required` / `rules_version_changed` |
| 17 | Pass (test) | QAe language switch unticks + `languageChanged` |
| 18 | Pass (test) | E "first access: the gate…" |
| 19 | Pass (test) | G PostgREST / RPC / storage; QA gated report / response / evidence |
| 20 | **Partial** | V N10-D18 base cases pass. **QA-N10-05**: after a non-material version, an `org_admin` is offered the personal statement only and the RPC refuses it |
| 21 | Pass (test) | E toast + record; QA fr-CA hash |
| 22 | Pass (code) | `gate_required` = never accepted any version (per user) |
| 23 | Pass (test) | G "platform admins are never gated" |
| 24 | Pass (code) | `rules-gate.tsx:51` `supportEmail()` |
| 25 | Partial | Server state V. B5 rendering NV |
| 26 | Partial | V separate acceptances. B5 org-pending line NV |
| 27 | Pass (test) | V "neither record implies the other" |
| 28 | Pass (test) | V `rules_not_accepted`, no sanction row. B3 rendering: code |
| 29 | Pass (test) | V AC-29 |
| 30 | Partial | V partner submit and open-to-partners refused. Internal-referral path not tested |
| 31 | Pass (code) | `opportunities/[matchId]/page.tsx:148-153` |
| 32 | **Fail** | Not built (backend §11.2) |
| 33 | Pass (test) | QAe fr-CA first; QA acceptance stores the shown locale |
| 34 | Pass (code) | `network-banners.tsx` hidden in settlement mode |
| 35 | Pass (test) | Local DB has v1.0 published by `seed.sql`; helpers / demo seed accept |
| 36 | Pass (test) | V `rules_version_changed` |

### C. Partner-activity restriction

| AC | Result | Evidence |
|---|---|---|
| 37 | Pass (test) | R AC-37 |
| 38 | Pass (test) | R AC-38/138 (no reason for other orgs) |
| 39 | Pass (test) | R "can still save open to partners" |
| 40 | Pass (test) | R both submit paths → `partner_activity_restricted`. There is no referral API to test |
| 41 | Pass (test) | R; QA held + suspended owners |
| 42 | Pass (test) | QAe opportunities paused |
| 43 | Pass (test) | R lift |
| 44 | Partial | R accept, agreement, interview, messages, awaiting delivery. Placements, invoices and refunds under a hold not exercised |
| 45 | Pass (code) | No restriction branch on the referral page |
| 46 | Pass (test) | R internal edits |
| 47 | Pass (test) | QAe recruiter sees B2 without link; E admin sees B2 |
| 48 | Pass (test) | R S21 availability |
| 49 | Pass (test) | QA identical status for hold and suspension |
| 50 | **Fail** | **QA-N10-01** (sanction columns readable by partners). R notifications / audit clean |
| 51 | Pass (test) | R lift; C `sanction.lifted` |

### D. Conduct reports

| AC | Result | Evidence |
|---|---|---|
| 52 | Pass (test) | E button + dialog. Hidden for internal referrals and platform admins: code `referrals/[referralId]/page.tsx:395` |
| 53 | Pass (test) | C |
| 54 | Pass (test) | C; QA IDOR sweep |
| 55 | Pass (test) | E validation; QAu schema boundaries; QA DB validation |
| 56 | Pass (code) | `report-dialog.tsx` |
| 57 | Pass (test) | C evidence pipeline; QA storage |
| 58 | Pass (test) | C |
| 59 | Pass (test) | E admin queue card |
| 60 | Pass (test) | C; QA identity sweep (see QA-N10-03 for the admin id) |
| 61 | Pass (test) | C |
| 62 | Pass (test) | QA before/after (C's version is tautological, QA-N10-07) |
| 63 | Pass (test) | C user limit; QA org limit |
| 64 | Pass (test) | C AC-64 |
| 65 | Pass (test) | E "You reported a problem on" |
| 66 | Pass (test) | C readers |
| 67 | Pass (test) | C |
| 68 | Pass (test) | C close + notification |
| 69 | Pass (test) | C; QA name-reporter variant |
| 70 | Pass (test) | C |
| 71 | Pass (test) | C |
| 72 | Partial | C/QA: window closed unlocks the decision. `conduct_response_closed` on a late response not asserted |
| 73 | Partial | QA one follow-up reply. Follow-up deadline expiry not tested |
| 74 | Pass (test) | C |
| 75 | Pass (test) | C; QAe |
| 76 | Pass (test) | C admin cases. "Opened by MissionHub" label: code |
| 77 | Pass (code) | `bad_faith_count` in `admin_list_conduct_cases` and the card |
| 78 | Pass (code) | card overdue text |

### E. Sanctions, immediate hold, review

| AC | Result | Evidence |
|---|---|---|
| 79 | Pass (test) | C |
| 80 | Pass (test) | C |
| 81 | Pass (test) | C; E |
| 82 | Pass (test) | C; QA variants |
| 83 | Pass (test) | C |
| 84 | Pass (test) | C suspension; QA termination |
| 85 | Partial | `no_sanction_allowed` C. Context panel NV |
| 86 | Partial | Expiry stored C. "Expired on" rendering NV |
| 87 | Pass (test) | R + C |
| 88 | Pass (test) | C termination sets both dates |
| 89 | Pass (test) | G + `api-surface.test.ts`; grep finds no caller |
| 90 | Pass (test) | C lift |
| 91 | Pass (test) | C; QA `review_window_closed` |
| 92 | Pass (test) | C (decider and hold applier) |
| 93 | Pass (test) | C |
| 94 | Pass (test) | C |
| 95 | Partial | `has_eligible_reviewer` computed. Queue label NV |
| 96 | Pass (code) | standing page |
| 97 | Pass (code) | `admin-org-standing.tsx` |

### F. Settlement mode

| AC | Result | Evidence |
|---|---|---|
| 98 | Pass (test) | S; QAe |
| 99 | Pass (test) | QAe B6 |
| 100 | Pass (test) | S; QA closed history |
| 101 | Partial | Invoices, payment evidence and refunds in settlement not tested |
| 102 | Partial | Dispute response / contest in settlement not tested |
| 103 | Partial | `get_network_standing` is opted in (code). Not tested in settlement |
| 104 | Pass (test) | S team |
| 105 | Pass (test) | QAe S22-c + nav |
| 106 | Pass (test) | S; QA |
| 107 | Pass (test) | S regression; full integration suite §6 |
| 108 | Pass (test) | S termination end |
| 109 | Pass (test) | C legacy lift |
| 110 | Pass (test) | S partner works its side |
| 111 | Pass (code) | Settlement guards on the referral page |

### G. Notifications and audit

| AC | Result | Evidence |
|---|---|---|
| 112 | Pass (test) | C notification bodies |
| 113 | Pass (test) | C; QA |
| 114 | Pass (test) | C (each step audited) |

### H. Security

| AC | Result | Evidence |
|---|---|---|
| 115 | Pass (test) | `api-surface.test.ts` |
| 116 | Pass (test) | QA IDOR sweep |
| 117 | Pass (test) | R; V. The separate open redirect is QA-N10-04 |

### I. Accessibility

| AC | Result | Evidence |
|---|---|---|
| 118–120 | NV | Code has skip link, aria-pressed, live regions and ≥ 44px rows. No axe or keyboard pass this round |

### J. Should (non-blocking)

| AC | Result | Evidence |
|---|---|---|
| 121 | Partial | `members_not_accepted` in standing |
| 122–125 | Not built | Accepted (Should) |
| 140 | Partial | `decision_overdue` computed |

### K. Reconciliation

| AC | Result | Evidence |
|---|---|---|
| 126 | Pass (test) | C 9/7/5; QA cross-side category accepted |
| 127 | Partial | Frontend gap 11 (links don't open the dialogs) |
| 128 | Pass (test) | C `possible_94`; not in reporter payloads |
| 129 | Pass (test) | C `admin_category_required` |
| 130 | Pass (code) | reporter page |
| 131 | Pass (test) | C |
| 132 | Pass (test) | C |
| 133 | Pass (test) | C |
| 134 | Pass (test) | C |
| 135 | Pass (test) | S |
| 136 | Pass (test) | S |
| 137 | Pass (test) | R; QA |
| 138 | Pass (test) | R |
| 139 | Pass (test) | E queue; code `admin/queries.ts:9-19` |

### L. PM decisions

| AC | Result | Evidence |
|---|---|---|
| 141 | Pass (test) | C |
| 142 | Pass (test) | C |
| 143 | **Partial** | G catalog + exempt list. **QA-N10-02** storage delete |
| 144 | Pass (test) | S |
| 145 | Pass (test) | C |
| 146 | Pass (test) | C |
| 147 | Pass (test) | C |
| 148 | **Partial** | No admin name or id in RPCs (C, QA). **QA-N10-03** audit `actor_id` |
| 149 | Pass (test) | C; QA |
| 150 | Pass (test) | C |
| 151 | Partial | Frontend gap 8 (toast) |

**Totals: 145 Must ACs.**
- Pass: 122 (13 of them by code review only: AC-13, 22, 24, 31, 34, 45, 56, 77, 78, 96, 97, 111, 130)
- Partial: 18 (AC-4, 20, 25, 26, 30, 44, 72, 73, 85, 86, 95, 101, 102, 103, 127, 143, 148, 151)
- Fail: 2 (AC-32, AC-50)
- NV: 3 (AC-118–120)

Should: AC-121 and AC-140 partial; AC-122–125 not built.

## 3. Bugs

### QA-N10-01 · Blocker · backend: partner orgs read sanction columns

The partner can read the other org's suspension date, termination date and the free-text `suspended_reason` written by the dropped legacy `set_organization_suspension`. BR-42 and AC-50 say nothing reveals sanctions to partners.

**Why it happens:**
- The `organizations_select_partners` policy (`20261107001400_partner_org_visibility.sql`) exposes the whole row to any org with a referral relationship.
- `authenticated` has a column SELECT grant on `suspended_at`, `terminated_at` (new in N10) and `suspended_reason`.
- N10 also extended `app.is_partner_org` to settling orgs (`20261116001400`).

**Repro:**
1. Org S has a referral with org O.
2. Set O's `suspended_at`, `terminated_at` and `suspended_reason`.
3. As S, run `from('organizations').select('suspended_at, terminated_at, suspended_reason').eq('id', O)`. The row comes back with all three values.

**Test:** `QA-N10-01` in `network-rules-qa.test.ts`.

**Fix:** revoke column SELECT on those three columns for `authenticated` and serve the own org's values through `get_my_org_state`, as is already done. Alternatively, a partner view limited to `id, name`.

### QA-N10-04 · Major · frontend: open redirect after accepting the rules

`safeNext` (`src/features/auth/schemas.ts:30`) accepts `"/\t/evil.example"`, `"/\n/…"` and `"/\r/…"`. The WHATWG parser strips the tab or newline, which gives `//evil.example`.

Affected:
- `accept-rules/page.tsx:31`: `router.push(nextHref)` after accepting, and the Back link;
- `versions-page.tsx:38`: the `?from=` Back link.

**Repro:** open `/workspace/<slug>/accept-rules?next=%2F%09%2Fevil.example%2Fphish`. The Back link resolves to `http://evil.example/phish` (Playwright, real Chromium).

**Tests:** `QAu` and `QAe` "QA-N10-04".

**Fix:** reject any control character or whitespace before validating, or resolve with `new URL(next, origin)` and require the same origin. The helper is shared with sign-in, so check that flow too.

### QA-N10-05 · Major · backend: gate deadlock for new org admins after a non-material version

This is frontend gap 14, confirmed.

**The mismatch:**
- `get_my_org_state` computes `org_accepted_current` against the **required** version, so it is set. The gate therefore shows the personal statement only (AC-20).
- `accept_network_rules` (`20261116001300_partner_restriction.sql:756-761`) requires an org acceptance with `effective_at >=` the **accepted** version. A personal-only acceptance of the current non-material version is refused with `rules_acceptance_required`.
- Result: an `org_admin` who never accepted can't pass the gate.

It isn't live yet: only v1.0 is published. It triggers as soon as the first non-material version is published.

**Repro:** in a rolled-back transaction, publish 9.990 `non_material` as current; a gated `org_admin` of an org that accepted 1.0 calls `accept_network_rules(personal only)`. Result: `accept=rules_acceptance_required; gate_required=true; ui_org_accepted=true`.

**Fix (backend):** compare against the required version, `x.effective_at >= coalesce(required.effective_at, v.effective_at)`.

### AC-32 · Major (Must, not built) · backend

There is no scheduler step for `network_rules.effective_not_accepted`. The restriction itself works without it (it is computed lazily), and B3 shows. The **PM** decides whether to defer it.

### QA-N10-02 · Minor · backend: gated member deletes candidate photos

The storage policy `candidate_photos_delete` lacks `app.assert_rules_gate()`, while every insert policy has it.

**Repro:** a gated `org_admin` calls `storage.from('candidate-photos').remove([path])`; the object is gone.

**Fix:** add the gate to the delete policy.

### QA-N10-03 · Minor · backend: platform admin id in the reported org's audit

`conduct.notice_sent`, `conduct.decided`, `sanction.applied` and the other rows on the reported org store `actor_id` = the platform admin. The org's `org_admin`s read it through `audit_events`. The audit page shows "System", because the profile isn't readable, but the raw id tells admins apart (N10-D28).

**Fix:** null `actor_id` on org-visible copies (keep it in the org-null admin copy), or mask it in the policy.

### QA-N10-06 · Minor · backend: missing i18n keys

| Location | Problem | Fix |
|---|---|---|
| `src/lib/actions/result.ts:73-74` | Maps to `network.report.errors.userLimit` / `orgLimit`, which don't exist | Use the existing `…Before` / `After` / `NoSupport` keys, or add the two keys |
| `schemas.ts` | `admin.networkRules.errors.label` | `errors.labelFormat` |

These are frontend gaps 4 and 5.

### QA-N10-07 · Minor (test) · backend

`network-rules-conduct.test.ts` "a conduct case isn't an open dispute…" compares a value with itself. The QA test now covers BR-19.

## 4. Security findings

| Probe | Result |
|---|---|
| Tenant isolation / IDOR (forged org, case, notice, follow-up, referral, match, membership) | **Pass.** Bare `not_found` everywhere; errors carry no ids or names (QA). |
| First-access gate | **Pass, one gap.** Catalog tests (G) cover tables, writing functions and the exempt flag. QA adds the N10 RPCs and storage. **QA-N10-02** (candidate photo delete). `audit_events` / `notifications` have a table-level `TRUNCATE` grant to `authenticated`. PostgREST can't issue TRUNCATE, so this is pre-existing hygiene and not exploitable today. |
| Permissions by role | **Pass.** Recruiter / manager → `not_found` on standing, case, response, review. Org statement by a recruiter → `forbidden`. 9 admin RPCs refused for members. |
| Reporter identity | **Pass,** except the admin id (QA-N10-03). No reporter user, org, text or category on any reported-org surface; naming the reporter gives the org name only. |
| Restriction reason vs partners | **Fail: QA-N10-01.** S21, submits, notifications, `job_hidden_reason` and opportunities are clean. |
| Settlement mode scope | **Pass.** Only in-scope referrals. Closed history, messages, events, candidates and jobs are closed; no writes on closed referrals; no new submissions; no self-unsuspend (column grant). |
| Sanction ladder / review bypass | **Pass.** Prior notice; closed grounds incl. whitespace variants; notice of another case; decided once; lift via a wrong org id; warning not liftable; termination-lift rule; reviewer ≠ decider or hold applier; no increase; stored review deadline. |
| Input validation | **Pass.** DB and Zod boundaries match spec §5.16 (QA, QAu). |
| Markdown / XSS (rules text, report text, file names) | **Pass.** `RulesText` escapes everything and turns no link into a URL. Report text renders as React text, and there's no `dangerouslySetInnerHTML` in N10. Evidence file names are sanitized server-side (`<`, `>` removed). |
| Open redirect | **Fail: QA-N10-04.** |
| `conduct-evidence` storage | **Pass.** Own path in a member org only. `admin/` only for that admin. Strict names: no `.html`, `.PDF`, nested paths or `..`. Bucket MIME list refuses `text/html`. No select, sign, list, overwrite or delete for uploaders. A former member can't upload. Registration checks owner and MIME (a PNG under `.pdf` is refused) and refuses a double registration. Cross-org and cross-user drafts can't be attached or removed. The admin-only signed URL is audited (C). Residual, minor: the 20-draft cap counts registered files only, so unregistered uploads aren't capped (same as the N1 pattern). |
| Rate limits | **Pass.** 5 / user and 10 / org per 24 h (C, QA). Upload limit 30 / h in the action (code). |

## 5. Frontend §3 gaps and backend deviations

**Frontend gaps:**

| # | Gap | Classification |
|---|---|---|
| 1 | Admin evidence not polled or removed | Minor (server checks the scan; orphan purge) |
| 2 | Referral id field instead of a combobox | Minor, accepted |
| 3 | Admin queue weekday count without holidays | Minor |
| 4 | Schema key | Minor (QA-N10-06) |
| 5 | Error keys | Minor (QA-N10-06) |
| 6 | Summary disclosure | Accepted (no content) |
| 7 | Bilingual notices | Accepted (Should) |
| 8 | S22-d toast | Minor (AC-151 partial) |
| 9 | Stale-tab link | Minor |
| 10 | S22-c through not-found, HTTP 200 | Minor |
| 11 | Right-tool links | Minor (AC-127 partial) |
| 12 | ClaimForm | Accepted |
| 13 | Rule picker | Accepted |
| 14 | Gate edge case | **Major** (QA-N10-05) |
| 15 | Scheduler | **Major** (AC-32) |

**Backend §11:**

| # | Deviation | Classification |
|---|---|---|
| 1 | N3 interplay | Accepted; the catalog test passes with N3 tables gated |
| 2 | No scheduler notifications | **Major** (AC-32) |
| 3 | No exit event for "terminated and settled" | Minor (AC-114 for that edge) |
| 4 | No "refund due" tag | Minor |
| 5 | Hosted rollout order | Accepted; must be in the release checklist: publish v1 with `db push` |
| 6 | Bilingual notices / reminders | Accepted (Should) |
| 7 | Copied lines | Accepted |
| 8 | Statement-level gate, admin exemption | Accepted |
| 9 | Pages that need the opt-in | Resolved by frontend |
| 10 | Job reports need an unrestricted org | Accepted |
| 11 | Internal referrals return `report_self` | Accepted |
| 12 | N9 test superseded | Accepted |

**Extra residuals:**
- R-7: reads before acceptance are allowed. Accepted. Since pages render the gate in the layout, the page segment's data may still be streamed. That stays within R-7.
- Running `network-rules-versions.test.ts` briefly makes a material version effective for the whole shared stack, which restricts every other org until cleanup. This is a test-hygiene risk for parallel sessions; consider a rolled-back transaction like the QA-N10-05 repro.

## 6. Commands and actual results

All integration and E2E runs used `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…` and `SUPABASE_SECRET_KEY=sb_secret_…` (local keys from `supabase status`). The suite's `assertLocalSupabase` guard passed.

```
npm run lint        → EXIT 0 (1 warning: unused import in my QA test, fixed; `npx eslint` on the 3 QA files → clean)
npm run typecheck   → EXIT 0
npm test            → Test Files 35 passed (35) · Tests 308 passed | 1 expected fail (309)

npx vitest run -c vitest.integration.config.mts --testTimeout=240000 --hookTimeout=400000 \
  tests/integration/network-rules-{gate,restriction,conduct,settlement,versions,qa}.test.ts tests/integration/api-surface.test.ts
                    → Test Files 7 passed (7) · Tests 110 passed | 4 expected fail (114)

E2E_BASE_URL=http://localhost:3140 npx playwright test tests/e2e/network-rules.spec.ts tests/e2e/network-rules-qa.spec.ts
                    → 10 passed (33.0s)   (incl. QA-N10-04 as expected fail)
```

**Timeouts.** With the default 30 s / 60 s timeouts, two backend tests and the restriction suite's `beforeAll` timed out in `drainQueue()`. The shared stack holds about 3.5 M matches and other sessions' queued jobs. With longer timeouts they pass. This is environment load, not N10.

**Other e2e.** `tests/e2e/onboarding.spec.ts` (not N10) fails at step 1. It expects the old "How do you work?" kind step, which another feature's onboarding change removed. It is stale test code. N10's Rules step is covered by `network-rules-qa.spec.ts` instead.

### 6.1 Full suites (`test:integration`, `test:e2e`)

**Full integration (`npx vitest run -c vitest.integration.config.mts --testTimeout=240000 --hookTimeout=400000`): not completed.**
- I stopped it after 47 minutes. On this shared stack (about 3.5 M matches, other sessions' queues and parallel runs), `terms-card.test.ts` alone took 2,169 s.
- Output before the stop: `terms-card.test.ts` 27 tests, 3 failed. These are N2 tests running under this load.
- An earlier attempt the same day also showed failures in `n3-qa.test.ts` (5) and N1 reminder tests (`holiday_calendar_exhausted`: no 2030 holiday seed). Those belong to other features' work in progress and don't touch N10 code paths.
- **This report doesn't claim full-suite green.** The N10 suites above passed in full.

**Full e2e (`E2E_BASE_URL=http://localhost:3140 npx playwright test`, 55 tests, 41 min):** 28 passed, 5 failed, 8 skipped, 14 did not run. None of the failures is N10:

| Spec | Failure | Cause |
|---|---|---|
| `candidate-confirmation-integrity.spec.ts` | Skipped | Needs the N9 email-capture harness |
| `documents.spec.ts` | `setInputFiles` 60 s timeout | Load |
| `duplicate-presentation.spec.ts:110` | Expects `support@example.test` | My E2E copy set `SUPPORT_EMAIL=support@missionhub.test` to test AC-24. QA environment artifact, not a bug; the rest of that serial file then didn't run |
| `job-terms-card.spec.ts:251` | 375px sweep timed out at 60 s | Load |
| `journey.spec.ts:143` | Record-hire navigation timeout | No local worker; N3 flow under load |
| `onboarding.spec.ts` | Stale | Expects the removed "How do you work?" step |

The N10 specs in that run: `network-rules.spec.ts` 3/3, and `network-rules-qa.spec.ts` 7/7 (incl. the QA-N10-04 expected fail).

**Not run or not verified:**
- a11y tooling (axe, keyboard pass) for AC-118 to AC-120;
- dark mode and a pt locale visual pass;
- settlement-mode invoices and disputes (AC-101, AC-102).
