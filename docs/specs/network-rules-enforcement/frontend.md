# Frontend: Network Rules enforcement (N10)

Owner: Frontend Engineer · 2026-11-16 · Built against `spec.md` (frozen) and `backend.md` (incl. its deviations: `allowSettlement` opt-in + S22-c, `ActionResult.code/detail`, `setSuspension`/`SuspendButton` removed). PD-084: N10 owns the gate and the onboarding Rules step; legal copy ships as the §5 drafts.

## 1. Routes and files

### New routes
| Route | Screen | File |
|---|---|---|
| `/network-rules`, `/network-rules/[label]` (+ `loading`, `error`) | S4 versions page | `src/app/network-rules/**`, `features/network-rules/components/versions-page.tsx`, `versions-view.tsx` |
| `/workspace/[orgSlug]/accept-rules?v=&next=` | S1 re-accept | `src/app/workspace/[orgSlug]/accept-rules/page.tsx` |
| `/workspace/[orgSlug]/reports` (`?tab=mine\|org`), `/reports/[caseId]` | S9 | `src/app/workspace/[orgSlug]/reports/**` |
| `/workspace/[orgSlug]/settings/standing`, `/[caseId]`, `/incidents/[noticeId]` | S10, S11, S25 | `src/app/workspace/[orgSlug]/settings/standing/**` |
| `/workspace/[orgSlug]/not-found.tsx` | S22-c (blocked route in settlement mode) | reads `SettlementProvider` from the layout |
| `/admin/network-rules`, `/new`, `/[id]/edit` | S5, S6 | `src/app/admin/network-rules/**`, `components/rules-version-form.tsx` |
| `/admin/disputes/conduct/[caseId]` | S13–S17, S26 | page + `components/admin-case-triage.tsx`, `admin-case-decision.tsx`, `admin-case-shared.tsx` |
| `/admin/disputes/conduct/new?org=` | S18 | page + `components/admin-new-case-form.tsx` |

### Changed (other features' files: minimal, additive edits)
- `workspace/[orgSlug]/layout.tsx`: `allowSettlement`, gate (`RulesGate`), banners (`NetworkBanners`), settlement nav, footer link **Network Rules**, account-menu **Your reports**, `SettlementProvider`.
- Settlement opt-in (`allowSettlement: true`): `overview` (renders S22-b `SettlementHome`), `referrals` list (no Pipeline tab) + detail, `commissions` list + detail, `notifications`, `settings/layout` (tabs Team + Network standing only), `settings/team` (deactivate only, S23 column).
- `referrals/[referralId]/page.tsx`: **Report a problem** (S7) in the header actions, reporter-only "You reported…" line, `noLongerMember` line (RD-048), `closed_stale_by_admin` reason own/partner, S22-d referral-closed state, Open candidate / View in pipeline hidden in settlement mode, `#referral-actions` anchor. The other session's edits were kept.
- `opportunities` list + `[matchId]`: S20-c restricted state, S21, report button (job report), composer `blocked` (per-user) + `codeMessages`.
- `features/referrals/components/submit-referral-form.tsx`: optional `blocked` and `codeMessages` props.
- `jobs` list/detail/new/edit, `features/jobs/nudge.ts` (`network_hold`, `rules_not_accepted` first + chips), `job-form.tsx` / `job-import.tsx` (`network` prop: S20-b helper, per-user line, `jobs.form.errors.userMustAccept`).
- `onboarding/page.tsx` + `onboarding-form.tsx`: 4-step stepper with the Rules step (S2), Review row, hidden fields `rulesVersionId/rulesLocale/acceptOrg/acceptMember`, `rules_version_changed` → back to step 3.
- `admin/disputes/page.tsx`: SegmentedNav filter (All · Placement · Prior presentation · Conduct, counts) + conduct cards. `admin/organizations/[orgId]`: S19 pills, Open conduct case, Lift…, Lift termination…, Network standing + Remaining obligations panels, S27 stale close. Admin sidebar: **Network Rules** in Compliance.
- `settings/audit/page.tsx`: §5.14 labels (code kept under the label).
- `components/layout/account-menu.tsx` (`hideProfile`, `reportsHref`), `org-switcher.tsx` (settlement pill), `sidebar-nav.tsx` (`settlement`).
- `server/auth/context.ts`: **additive** `suspendedAt` / `terminatedAt` (from `get_my_org_state`) for the B6 terminated date.
- `features/network-rules/domain.ts`: `rulesSha256` moved to `hash.ts` (Node-only) so client forms can import `schemas.ts` without `node:crypto`. Importers updated: `__tests__/domain.test.ts`, `scripts/build-network-rules-seed.mts`, `tests/integration/network-rules-versions.test.ts`.

### New feature components (`src/features/network-rules/`)
`markdown.ts` (safe Markdown → text segments, Q-D16: no HTML, no dependency), `components/rules-text.tsx` (`RulesText`, `RulesToc`), `acceptance-block.tsx` (S1, 3 variants), `rules-gate.tsx`, `network-banners.tsx` (B2–B6 + `Banner`), `report-dialog.tsx` (S7/S8), `evidence-upload-list.tsx` (`EvidenceUploadList`, N1 row states and copy), `conduct-text-form.tsx` (reply / response / follow-up / review: react-hook-form + the action's Zod schema), `review-request-dialog.tsx`, `settlement.tsx` (provider, `SettlementCanDo`, S22-c), `settlement-home.tsx`, `settlement-deactivate.tsx`, `restricted-states.tsx` (S20-c, S21), `support-sentence.tsx`, `copy-hash.tsx`, `admin-conduct-card.tsx`, `admin-org-standing.tsx`, `admin-org-controls.tsx`; pure `ui-state.ts`, `admin-ui.ts`, `locale.ts`, `job-network.ts`; server `page-data.tsx` (texts per locale, notice-language translators, templates).

### i18n
All 826 §5 keys added to en / fr / pt (new `network` namespace registered in the three `index.ts`; additions to `onboarding`, `jobs`, `opportunities`, `referrals`, `settings`, `admin`, `labels`). Trees identical (`messages.test.ts`). fr: no-break space before `:` and inside « »; existing namespaces use straight `'`, `network.json` keeps `’`. `src/i18n/__tests__/n10-copy.test.ts` checks every key against the spec tables in all three locales.

## 2. AC → screen

| AC | Where |
|---|---|
| A: AC-1–13 | S4 versions page (current, upcoming `#upcoming`, history cards/table, fingerprint, empty, not-found for draft/unknown, lang switch `?lang=`, Your status with `?org=`); S5/S6 admin list + form (types, effective-date rules, per-locale summaries/texts, live markers, server field errors from `code`/`detail`, confirm, read-only published rows, SHA short + copy) |
| B: AC-14–36 | S2 onboarding step (two boxes, needBoth, language change unticks, version changed → step 3, noVersion blocks); S1 gate in the workspace layout (role table, settlement personal-only, support leave line, version history, switcher + sign-out kept, toast + refresh); S1 re-accept page (change summary, legal reason, compare link, already-accepted state, `next` via `safeNext`); B3/B4/B5 banners (not in settlement mode). AC-32 notification: backend gap (§3) |
| C: AC-37–51 | B2/B3 banners; job nudge bodies + chips (restriction first); job form helper + per-user line + `userMustAccept` error; S20-c opportunities (badge hidden); composer `restrictedHold/Rules` / `userMustAccept` (blocked panel); S21 one sentence / `noLongerMember`; referral page unchanged for in-flight work |
| D: AC-52–78 | S7 button (both sides, all statuses, hidden for platform admins and internal referrals, icon-only < 640px with aria-label + tooltip); S8 dialog (server-resolved org name, right-tool block, 9/7/5 categories from the server, counter, date max today + approximate, evidence list, identity note, attestation, Send disabled while files block, rate-limit alerts with support link, self/not-found, discard confirm, sent state with focus); S9 list/tabs/detail/status mapping/no-change line/reply (reporter only) |
| E: AC-79–97 | S10/S11 org side (standing card, What this means, rules row, open notices with `BusinessDeadline`, history, acceptance, notice in its language with locked outcomes line, one response with confirm, follow-ups, window closed, decision "by a MissionHub platform admin", review request/outcome without names); S12 queue; S13 triage; S14 composer; S15 decision (12-month rule disable + `noSanctionNotAllowed`, after-hold options, outcomes-line lock, why-not-hold, termination note, confirm text); S16 two-step hold (`org_already_restricted` keeps step 2 without confirm); S17 review (self-blocked, needs second admin, lower levels only); S19 lift / lift termination (decider sees `liftTerminationSelf`) |
| F: AC-98–111 | Switcher pill; B6; settlement nav; S22-b home with counts / `nothingLeft` / `loadCountsError`; S22-c on blocked routes; S22-d referral-closed state; team deactivate only (self/last admin hidden); referrals Pipeline tab hidden; S27 stale close |
| G: AC-112–114 | Notifications: titles/bodies written by the DB (en), links handled by backend `openNotification`; `network.notifications.*` keys ready. Audit labels on `/settings/audit` |
| H: AC-115–117 | No new client Supabase calls (all writes through Server Actions); no `dangerouslySetInnerHTML` (rules text via `markdown.ts`); `next`/`from` via `safeNext` |
| I: AC-118–120 | 375px layouts (full-height dialogs with sticky header/footer, stacked banner CTAs, B5 Details disclosure, cards instead of tables), labels/aria-describedby on all inputs, focus moves (sent heading, error blocks, first invalid field), ≥ 44px targets |
| K: AC-126–139 | Category per side (RD-044), "Possible 9.4" admin-only, admin category required (saved before the first triage action), incident notice with per-side guidance tabs (S26), outcomes line, decision rules from the notice only, AC-137 S21 only via `get_partner_job_availability`, AC-139 conduct in the disputes page |
| L: AC-141–151 | Conduct date + version defaulting in S14 (`conductDateBeforeRules`, `dateFuture`), version acceptance info line, org-admin reports tab (`sentBy`/`sentByFormer`), immediate hold hidden on restricted orgs, lift termination, legacy suspension pill + Lift…, AC-149 audit labels (rows filtered by the DB policy) |

## 3. Known gaps

1. **Admin evidence (S18)**: there's no admin draft-list or draft-remove action, so admin uploads aren't polled (a row shows ready after upload; the server checks the scan when the case opens) and aren't removed on cancel (server orphan purge only).
2. **S18 referral picker**: no admin RPC lists an org's referrals before a case exists, so the field takes a pasted referral link or id (`referralIdFrom`). The spec asks for a combobox.
3. **Admin queue deadlines**: `admin_list_conduct_cases` returns instants only. The "N business days left" hint on admin cards counts Toronto weekdays with no holiday calendar. Member pages use the server's `business_days_left`.
4. **`schemas.ts` uses `i18n:admin.networkRules.errors.label`**, which isn't a §5 key. The form validates first with `errors.labelFormat`, but a server-side field error would still render the key. **Backend: switch it to `errors.labelFormat`.**
5. **`N10_ERROR_KEYS`** maps `report_rate_limited_*` to keys that don't exist (`userLimit`/`orgLimit`, where the spec has Before/After/NoSupport). The report dialog switches on `code`, but any other screen would show the key.
6. **Summary disclosure** ("Summary (not part of the rules)", U-N10-4) isn't rendered: nothing provides the content.
7. **Bilingual notices** (Should, C-5) aren't offered (backend didn't build them).
8. **S22-d toast** `network.settlement.referralClosed` isn't shown after a closing action: those actions live in the shared referral components (their own toast shows). The referral-closed state renders on refresh or reload.
9. **Stale-tab "Review the rules" link** (`network.errors.reviewRulesLink`) isn't added to the generic `FormMessage`. The `acceptanceRequired` text does show.
10. **S22-c through the not-found boundary**: in settlement mode, any `notFound()` under the workspace (a genuinely missing record, or a non-admin opening standing) shows S22-c instead of not-found. HTTP stays 200 because of the segment's `loading.tsx`.
11. **"Use the right tool" links** go to the referral's action bar (`#referral-actions`) or the placement page; they don't open the objection or dispute dialogs directly. An N3 session has since wired its own "Report a hire" link into this block. I kept it.
12. **`ClaimForm` (N1) isn't refactored** onto `EvidenceUploadList`, to avoid editing N1 files in parallel. Same copy and row states.
13. **Rule picker (S14)** is a grouped checkbox list with a live count, not a multi `Combobox`.
14. **Gate edge case**: an org admin whose org accepted the required version while `current` is a later non-material version sees the personal statement only. If the RPC demands both, its error shows.
15. **Scheduler notifications** (`effective_not_accepted`, reminder): backend gap §11.2.

## 4. How to view locally

`.env.local` points at the hosted project, and the shared `npm run dev` on :3000 uses it (no N10 there). To view N10, run a dev server against the local stack (`supabase status` gives the URL and keys), e.g. `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=… SUPABASE_SECRET_KEY=… next dev`. Only one `next dev` runs per checkout; I used an isolated copy on :3100.

- **Gate**: add a user without an acceptance to an org (`createAccount(name, { acceptRules: false })` in `tests/e2e/support.ts`), sign in → any `/workspace/<slug>/…`.
- **Versions**: `/network-rules?org=<slug>`. **Accept page**: `/workspace/<slug>/accept-rules`.
- **Report**: a referral page → **Report a problem**; then `/workspace/<slug>/reports`.
- **Hold / standing / case**: as a platform admin, open the case from `/admin/disputes?filter=conduct` → **Apply immediate hold**. The held org then shows B2, `/settings/standing`, the case page and the S20-c opportunities state.
- **Settlement mode**: decide suspension/termination on a case (or set `suspended_at` locally) → home S22-b, any blocked route S22-c, switcher pill.
- **Admin rules**: `/admin/network-rules` (New version is disabled while one is upcoming).
- **e2e**: `tests/e2e/network-rules.spec.ts` (gate, report, admin immediate hold + B2). Run with the env above and `E2E_BASE_URL` pointing at the local-stack server.
