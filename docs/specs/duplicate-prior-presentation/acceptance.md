# Acceptance: duplicate and prior-presentation protection (N1)

Owner: Product Manager · Date: 2026-11-15 · Brief: [`brief.md`](./brief.md) rev. 4.2 · Decisions: PD-034 to PD-037 ([`decisions.md`](../../product/decisions.md))

Inputs read: `brief.md` (rev. 4.2), `spec.md` (AC-1 to AC-76), `qa-report.md` (top section "Structural fix verification", 2026-11-15, plus history), `design-review.md`, `copy-review.md`, `backend.md` (§1 to §15), `frontend.md` (incl. "Review round" and QA F-3). Spot checks in the repo: message files (`errors.duplicate_referral`, `referrals.success.*`), the `holiday_calendar_exhausted` guard, the `claim_evidence_upload_limit` trigger, `docs/architecture.md`, `docs/security-and-privacy.md`, `docs/domain-model.md`, `docs/product-flows.md`.

## Verdict: **ACCEPTED**, with follow-ups

The build meets the brief's Must scope, every BR and the engineering constraints. QA's final verdict is PASS, and no blocker or major is open in QA, design or copy. Two accessibility ACs (AC-61, AC-62 dark mode) are accepted on code review plus partial live checks, with a scheduled live pass before launch (PD-034). Nothing below blocks acceptance of the build. Several items do block the **founding-group launch** and are on the launch checklist.

N1 status: `accepted` in the roadmap and `docs/implementation-plan.md`.

## 1. Check against the brief

### Scope

| Brief item | Result | Evidence |
|---|---|---|
| Must 1–4: fingerprint check (both paths, job and client scope), stop / warn, neutral message, identifier required, sticky stop | Met | QA scenarios 1–11, 33–36, 39–41, 44; AC-1 to AC-19 |
| Must 5: first position kept on withdraw/cancel, release in the dialog and release later (guarded, two-step) | Met | Scenarios 12–13, 42–43 |
| Must 6–8: `duplicate` removed, evidenced objection, sourcing-side panel, contest → referral dispute, upheld / rejected / final | Met | Scenarios 16–24, 47 |
| Must 9: business-day helper and holiday table | Met, exceeded: seeded 2026–**2029** with a fail-loud guard for 2030+ | Scenarios 25–31, 41; backend §13 r2-m4 |
| Must 10: in-app notifications and audit; emails deferred (PD-030) | Met as amended. Emails are in N7 and on the launch checklist | Scenario 49 |
| Must 11: en / fr-CA / pt-BR, glossary, legal drafts | Met. Legal strings remain drafts pending counsel (C-1, C-3, C-5, C-6) | `copy-review.md` "Legal" |
| Must 12: job-form client-name helper, optional field | Met | AC-70, scenario 46 |
| Should: abuse flags, metrics card, plus-alias normalisation, internal attribute, language hint | **All shipped** | backend §2, §5, §12; design B-1 fixed |
| Won't list | Respected. No cross-hiring-org check, no fuzzy match, no evidence access for the sourcing side | QA privacy tests |

### Business rules and constraints
- BR-1 to BR-34: traced and PASS (`qa-report.md` round 3 "Status of everything else", reaffirmed in the final section).
- EC-1 to EC-8: implemented and documented in `backend.md` §1–§10. EC-5 is reflected in `docs/architecture.md`.
- Security as a hard constraint: Vault key, hashing in the database, no caller-supplied hashes, api-surface test green. The probing defence (R2-1) and the upload limit (R2-2) were fixed and re-verified. The evidence scanner is isolated in a worker thread with a hard timeout (F-1, F-2 closed). The scanner remains a heuristic, not an antivirus. That is already an N8 launch item.

### Metrics (brief §4)
- **Instrumented:** `getPresentationMetrics` covers hits by scope, stops, sticky stops, pending warnings, identifier refusals, closures, delivered, claims, contests, releases, withdrawals, referral disputes, resolution within 5 business days, rejected claims and client-key coverage. Abuse flags (BR-29) are on `/admin`.
- **Not instrumented in product (acceptable):**
  - "Wrong-stop tickets per 200 stops" needs the support address (PD-025, user) and a support tag.
  - "Sourcing orgs that submit again within 30 days after a claim" is a manual query for now.
- Baselines start at the founding-group launch. The PM reviews them 12 weeks after launch (the lagging targets are estimates to calibrate).

### Definition of done

| DoD item | Status |
|---|---|
| Every AC passes in `qa-report.md` | Met, except AC-61 (keyboard) and the dark half of AC-62. Both are accepted on review with a pre-launch live pass (PD-034) |
| Every BR traced; scenarios 1–49 covered | Met (45 included, because the attribute shipped) |
| `security-and-privacy.md` records R-18, R-19; roadmap lists the email follow-up as a launch gate | Met |
| No open blocker in QA, design or copy | Met. Design B-1 to B-4 fixed (`frontend.md` "Review round"; B-3 completed by F-3, verified by QA's regression spec). Copy: 0 blockers |
| EC-1 to EC-8 implemented and documented | Met |
| O-1 answered or default accepted | **Open, user.** Needed for launch, not for acceptance |
| `domain-model`, `security-and-privacy`, `product-flows`, `architecture` updated | `product-flows.md` had no N1 content. The PM added the N1 flow lines on 2026-11-15. The other three are met |
| Roadmap N1 = `accepted` | Done |

## 2. Rulings on the known items

| # | Item | Ruling | Owner | Why |
|---|---|---|---|---|
| 1 | Design polish 11 (same-named orgs in abuse flags) | **Follow-up, not gating** | frontend-engineer | Admin-only screen and flag-only (no automatic action). An admin can open the org before acting. Fold it into the N1 polish ticket |
| 2 | Design polish 17 (32px targets at `sm`+) | **Follow-up, not gating** | frontend-engineer | AC-62 covers 375px only. 32px still exceeds WCAG 2.2 AA target size (2.5.8, 24px). Our 44px rule is stricter house policy |
| 3 | `/admin` overflows 26px at 375px ("Newest organizations" panel) | **Follow-up, not gating** | frontend-engineer | Pre-existing panel N1 didn't touch. S9 isn't in AC-62. Admin-only, and admins work on desktop |
| 4 | Design polish 14 ("Resolve by" without days left) | **Closed** | — | `frontend.md` lists it as open, but QA's final verification asserts "Resolve by … ET · N business days left" (`BusinessDeadline`) in E2E. QA's evidence is the later one |
| 5 | AC-61 keyboard-only and AC-62 dark mode not verified live | **Accept with a pre-launch live pass** (PD-034) | qa-engineer, product-designer | The design review read every AC-61 path: all complete by keyboard, no traps. The five focus losses were fixed. Frontend checked the objection dialog and action bar live in dark at 375px. What's missing is a full live run, not a known defect. It goes on the launch checklist. If the pass finds a blocker, it reopens N1 |
| 6 | N1 emails deferred (PD-030); claim-filed email required before launch | **Confirmed as a launch gate**, already in N7 | backend, ux-writer, QA (N7) | The contest window is 10 business days. A sourcing org that doesn't log in would lose it without an email |
| 7 | Holiday seed through 2029, guard for 2030+ | **Follow-up, recurring** (PD-037) | backend-engineer | Past the seed, `add_business_days` raises, so **deliveries would fail**, not just deadlines. Cadence: by 1 October each year, the table covers the next two calendar years. First action by 2028-10-01 (seed 2030). Hard limit about 2029-12-20 |
| 8 | Hosted push needs the TRIGGER privilege on `storage.objects` | **Launch checklist and push precondition** (PD-037) | backend-engineer + user (who runs the push) | Without it, migration `20261113001100` fails on the hosted project, or the upload limit doesn't exist there. Verify the privilege before `supabase db push`. If it's missing, the fallback is QA's alternative: signed upload URLs issued by a rate-limited RPC. Hosted push still only when the user asks |
| 9 | Unused keys `referrals.success.claimFiled` / `contested` | **Follow-up, trivial** | ux-writer-marketing (delete keys in en/fr/pt), in N6a | Backend no longer returns them (`backend.md` §10). No user impact |
| 10 | `errors.duplicate_referral` kept as an error (copy-review P12) | **Confirmed: outside BR-9** (PD-036) | — | It fires only for the **same candidate record** already live on **this job**. The submitter's org already sees that referral in its Sent list. BR-10 keeps record-level dedup. BR-9 governs hits against another referral of the same person, and this reveals nothing about another org, client or scope. The actionable copy from P12 is shipped in all three locales |
| 11 | X-1: recruiter can forge the candidate confirmation (caller-supplied token hash) | **Now, new item N9, launch gate, before N3** (PD-035). Not an N1 blocker | backend-engineer, then qa-engineer | It predates N1, and N1's duplicate rules still hold because the delivery re-check runs. But it falsifies the record that a candidate confirmed, and since N1 that record confers first position against other agencies. N3 will turn it into fee entitlement. Security and trust are hard constraints, so it must be fixed before launch and before N3 relies on it |
| 12 | `journey.test.ts` flakes on a grown local DB (`max_rows = 1000`) | **Follow-up, before N3 QA** | qa-engineer (+ backend if pagination is needed) | Not N1. A flaky core journey test hides real regressions, and N3 touches the same paths (R-14). Also check whether `get_opportunities` consumers need pagination. 1,000+ matching jobs per candidate is far off for the founding group, so this is a watch item, not a product bug today |
| 13 | Three pre-existing E2E failures (onboarding, journey, documents) | **Follow-up, launch checklist ("full E2E suite green")** | qa-engineer | The specs are stale after earlier UI changes (removed onboarding step, renamed labels). They're outside N1, but the launch checklist needs a green suite |

## 3. Follow-ups (added to the roadmap)

| Follow-up | Roadmap location | Gating |
|---|---|---|
| N9 Candidate-confirmation integrity (QA X-1) | Now, N9 | Launch gate; N3 dependency |
| Notification emails incl. claim-filed (PD-030) | Now, N7 (existing) | Launch gate |
| Live keyboard + dark-mode pass for N1 (AC-61, AC-62) | Launch checklist | Launch gate |
| `storage.objects` TRIGGER privilege verified before hosted push | Launch checklist (Ops) | Launch gate and push precondition |
| Full E2E suite green (fix stale onboarding, journey, documents specs) | Launch checklist; engineering hygiene | Launch gate |
| `journey.test.ts` isolation on a growing DB | Engineering hygiene | Before N3 QA |
| Yearly holiday seed (next two years covered by 1 October) | Recurring operations | First action by 2028-10-01 |
| N1 polish: design items 11, 17, `/admin` 26px overflow | Engineering hygiene (frontend, S) | Not gating |
| Delete unused `referrals.success.claimFiled` / `contested` | N6a | Not gating |
| Release from `declined` / `rejected` referrals (PD-021) | N3 (existing) | — |
| Internal-routing flag (PD-022), hiring-side ownership display on released referrals (PD-027, R-17), real client name before N3 (PD-023) | N3 (existing) | — |

## 4. Still needs the user
- **O-1**, fingerprint and evidence retention ⚖️ (BR-21; strategist recommendation in the brief). Needed before launch.
- **Support address** for the stop's support line (PD-025). Needed before launch.
- **Counsel** sign-off on the draft legal strings (C-1, C-3, C-5, C-6) via N7.
- **Hosted push:** only on the user's request, and only after the `storage.objects` trigger check.

## 5. Still open with the strategist (non-blocking)
- Confirmation of PD-029's reading of RD-016 ("counting when the claimed referral was delivered").
- PD-031 follow-up: route an org's own earlier client-scope presentation to "consider for another job" instead of a stop.
