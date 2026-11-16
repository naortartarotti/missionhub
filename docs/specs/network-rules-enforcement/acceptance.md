# Acceptance: Network Rules enforcement (N10)

Owner: Product Manager · Date: 2026-11-16 · Brief: [`brief.md`](./brief.md) rev. 2 (BR-1 to BR-44) · Spec: `spec.md` (AC-1 to AC-151) · Inputs: [`qa-report.md`](./qa-report.md) (round 2 PASS, round 1 kept below it), [`backend.md`](./backend.md) (§11 deviations, §12 fixes), [`frontend.md`](./frontend.md) §3 · Decisions: PD-056 to PD-058, PD-084 (build now), PD-082 and PD-083 ([`decisions.md`](../../product/decisions.md))

## Decision: **ACCEPTED WITH CONDITIONS**

N10 meets the brief. Every hard constraint (tenant isolation, reporter identity, partners never learn a sanction, prior notice, reviewer different from decider, closed settlement scope) was tested adversarially and holds. The blocker and both majors from round 1 are fixed and re-verified. What stays open is a deferred Must AC with a safe workaround (AC-32), minor UI gaps, and items that are launch gates rather than build work (counsel, accessibility, hosted rollout).

Accepted means the feature can go to the hosted push. It does not mean launch: the conditions in section 4 close first.

## 1. What was built

- **Rules versions (BR-1 to BR-4):** immutable versions with a SHA-256 per locale, three locales, a marker check at publish, notice by type, an admin publish screen with an approval reference, and a versions page for every signed-in member.
- **Acceptance (BR-5 to BR-11):** org and member acceptance, append-only, with locale and hash stored. Acceptance at org creation, a database-enforced first-access gate for every authenticated write (with a closed exempt list and a generated catalog test), re-acceptance with 30 days' notice, the effective-date gate, and French first for Québec orgs.
- **One restriction predicate (BR-12 to BR-14):** `terminated > suspended > network_hold > rules_not_accepted`. Jobs hidden, no submitting or receiving, no matching. In-flight work continues. Partners see only the neutral sentence.
- **Conduct reports (BR-15 to BR-25):** "Report a problem" on referrals and partner jobs. Cases live in closed `app.conduct_*` tables and are not an open dispute for any other rule (BR-19). Context-filtered categories, evidence through the N1 pipeline, triage, notice with the fixed outcomes line, one response, four reporter outcomes, the 2.3 incident notice, admin-initiated cases, and rate limits.
- **Sanction ladder (BR-26 to BR-32):** warning, network hold, suspension, termination. Prior notice enforced in the database, immediate hold only on 2.3 and 4.8 with the notice in the same transaction, one review by a different admin, and the Network standing page. `set_organization_suspension` is dropped.
- **Settlement mode (BR-33 to BR-38):** option (a) in full, for in-flight referrals and open obligations only, with the admin close of stale referrals for terminated orgs.
- **Notifications and audit (BR-39, BR-40):** in-app, PII-free, with the reporter's identity absent from every reported-org surface and the admin id masked on org-visible audit rows (QA-N10-03).

Migrations `20261116001000` to `20261116001700`, plus the uncommitted fix migration `20261116001800_n10_qa_fixes.sql`.

## 2. Acceptance criteria coverage

Source: QA round 2. 145 Must ACs.

| Result | Count | ACs |
|---|---|---|
| Pass | 126 | Includes the round-1 failures now fixed: AC-20, AC-50, AC-143, AC-148. 13 pass by code review only (AC-13, 22, 24, 31, 34, 45, 56, 77, 78, 96, 97, 111, 130). |
| Deferred, accepted | 1 | AC-32 (PD-083) |
| Partial | 15 | AC-4, 25, 26, 30, 44, 72, 73, 85, 86, 95, 101, 102, 103, 127, 151 |
| Not verified | 3 | AC-118 to AC-120 (accessibility) |

Should: AC-121 and AC-140 partial (server data in place, UI partly); AC-122 to AC-125 not built.

**The partials are not a hidden risk.** For each, the server side is proven; what's open is a UI state QA didn't render (AC-4, 25, 26, 85, 86, 95), a settlement-mode path QA didn't exercise (AC-101, 102, 103), a narrow test gap (AC-30 internal referrals, AC-44 placements and refunds under a hold, AC-72, AC-73), or a minor frontend gap (AC-127, AC-151). The settlement money and dispute paths (AC-101, 102) are the ones with trust weight, so they get a pre-launch check (condition 7).

## 3. Open gaps and classification

Classes: **Blocker** (stops acceptance), **Launch gate** (must close before launch, not a build task), **Pre-push** (must close before the hosted push), **Follow-up** (scheduled, doesn't gate), **Accepted** (no further work).

| # | Gap | Class | Owner | Disposition |
|---|---|---|---|---|
| G-1 | AC-32 `network_rules.effective_not_accepted` not sent (no scheduler; backend §11.2, frontend 15) | Follow-up, **before the first material version is published** | backend-engineer | PD-083. The restriction itself is computed lazily, so it works with no notification. v1 is `initial` and needs no effective-date notification. |
| G-2 | Reminder 7 days before an effective date (Should) | Follow-up, with G-1 | backend-engineer | Same worker step as G-1 |
| G-3 | Accessibility not tested (AC-118 to AC-120): no axe, keyboard or screen-reader pass | **Launch gate** | qa-engineer, then frontend-engineer | Code has the right hooks (skip link, aria-pressed, live regions, 44px rows). Needs a real pass on gate, accept, report dialog, standing page, admin case and settlement screens. |
| G-4 | Counsel review of the rules and draft legal copy (C-1, C-3, C-4, C-5, C-7, 10.6) | **Launch gate** | user (sends to counsel) | PD-084: ships as drafts. Copy keys and `app.notice_outcomes_line` / `app.incident_guidance_line` change by migration if counsel edits; sent notices keep their stored text. |
| G-5 | Hosted rollout order: with no published version, `create_organization` refuses | **Pre-push** | user / backend | Publish v1 in the same window as `supabase db push` (condition 1) |
| G-6 | Full integration suite not re-run by QA after the fix migration (revoke on `organizations` touches every feature) | **Pre-push** | main session | Backend reports 530/530 after the fix migration. That is a backend claim, not QA-verified (condition 4). |
| G-7 | Bilingual notices (Should, C-5); one language per notice today | Follow-up | product-designer / backend | Depends on counsel C-5. Build only if counsel says Québec notices must be bilingual. |
| G-8 | Planned-review reminder, admin metrics card, org-admin "who hasn't accepted" list beyond `members_not_accepted` (Should, AC-121 to AC-125) | Follow-up | PM to schedule | The metrics in brief §4 are measurable by Ops SQL meanwhile, as for N3. |
| G-9 | Minor frontend gaps 1, 2, 3 (admin evidence not polled or removed, referral id field, weekday count without holidays) | Follow-up (batch with the next admin frontend pass) | frontend-engineer | Server checks the scan; no member impact |
| G-10 | Minor gaps 8, 9, 10, 11 (S22-d toast, stale-tab link, S22-c at HTTP 200, right-tool links not opening dialogs) | Follow-up | frontend-engineer | Gaps 8 and 11 are the reason AC-151 and AC-127 are partial. Gap 11: link directly to the objection and dispute dialogs. |
| G-11 | Gaps 6, 12, 13 (summary disclosure, ClaimForm, rule picker), gap 7 | Accepted | none | Summary has no content (founder item 2, optional). ClaimForm untouched to avoid N1 conflicts. |
| G-12 | Backend §11.3 (no event for "terminated and settled"), §11.4 (no "refund due" tag) | Follow-up | backend-engineer | Minor. The exit is computed lazily and the obligations list shows the open items. |
| G-13 | QA-N10-06 and the other round-1 minors | Closed | — | Fixed and verified in round 2 |
| G-14 | R-7: reads before acceptance are allowed (writes are blocked) | Accepted | — | Brief R-7. The org's acceptance already binds it (rule 1.2). |
| G-15 | Backend §11 items 1, 5 to 12 (other than above) | Accepted | — | N3 interplay, hosted order (see G-5), copied lines, statement-level gate, job reports need an unrestricted org, internal referrals, superseded N9 assertion |
| G-16 | `network-rules-versions.test.ts` briefly makes a material version effective for the whole shared stack | Follow-up (test hygiene) | qa-engineer | Move to a rolled-back transaction, as QA-N10-05 does. PD-081 already serialises full runs across sessions. |
| G-17 | Test-env noise in QA's full runs (timeouts under load, stale `onboarding.spec.ts`, `duplicate-presentation` env artifact) | Accepted for N10 | — | Not N10. The stale specs are already in Engineering hygiene. |

## 4. Pre-launch conditions

Items 1 to 4 are about the hosted push; 5 to 7 gate launch.

1. **Publish v1 of the Rules in the same window as `supabase db push`.** Without a published version, onboarding is blocked (`create_organization` refuses) while the gate stays inert. After publishing, every existing user meets the first-access gate once (expected, R-9). Publishing needs the approval reference (founder and counsel, or an explicit founder decision to publish the draft). Marker-free text only (BR-2).
2. **Counsel review** of the Rules and the legal copy (G-4). If the founder wants to launch before counsel replies, that is a `Needs user decision` and v1 stays labelled as a draft in the approval reference.
3. **Hosted migration push**, only when the user asks, by `supabase db push` (never MCP):
   - push in timestamp order: N10 `20261116001000` to **`20261116001800`** before N3 `20261117*` (PD-078);
   - confirm at least two active platform admins first (rule 9.6 needs a second reviewer);
   - after the push, confirm the three `organizations` columns are not selectable by `authenticated` and `public.admin_organizations` exists.
4. **Full integration suite, clean stack, one run.** The backend's 530/530 after the fix migration is accepted as the working number but not as acceptance evidence, because QA's round 2 ran only the N10 suites. Before the push, the main session runs the full integration suite once on a freshly reset local stack (announced, per PD-078 and PD-081) and records the real output. Any failure outside N10 is triaged as a regression from the `organizations` revoke until shown otherwise.
5. **Accessibility pass for AC-118 to AC-120** (G-3), plus the browser pass the other features also owe (dark mode, 375px, fr and pt wrapping). A blocker found there reopens the screen.
6. **Staffing for conduct reports** (launch checklist): named owners for a first response within 2 business days and for second-admin reviews, with the playbook for the ladder, the closed immediate-hold list and the residual test.
7. **Settlement-mode money paths (AC-101, AC-102):** one scripted check, local, that a suspended org can record payment evidence, confirm a payout, record a refund and answer a dispute on an in-flight referral. QA didn't exercise these in round 2, and rule 9.5 is a promise to partners who are owed money.

**Not conditions:** AC-32 and the reminder (G-1, G-2) don't gate the push or the launch of v1. They gate the first **material** version (PD-083).

## 5. Designer calls from PD-084, revisited

Confirmed as built, no change:
- only `decided_by` can't lift a termination;
- Lift is offered on both settling and settled terminations;
- nobody answers info requests once the reporter has left.

## 6. Follow-ups, in order

1. **Before launch:** conditions 1 to 7 above; the stale `journey` and `onboarding` specs (already Engineering hygiene).
2. **Before the first material Rules version:** the scheduler step for AC-32 and the 7-day reminder (backend, one maintenance-worker step; N7 adds the emails).
3. **Next frontend pass:** minor gaps 1 to 3 and 8 to 11 (G-9, G-10), including the direct links to the objection and dispute dialogs.
4. **After counsel:** bilingual notices if C-5 requires them; update the outcome and incident lines by migration if the wording changes.
5. **Scheduled by the PM when capacity allows:** the metrics card and the planned-review reminder (G-8).

## 7. Metrics to start measuring at launch

Per brief §4, by Ops SQL until a card exists: active users without acceptance of the current version (target 0), median days to accept a new version, first admin response to a conduct report within 2 business days, reports closed at triage, full suspensions used where a hold would have done (target 0).
