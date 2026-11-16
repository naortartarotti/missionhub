# Frontend: Referral-level claims and two-sided hire reporting (N3), drop 1

Owner: Frontend Engineer · Date: 2026-11-16 · Built against `spec.md` rev. 2.1 (PD-077), `backend.md` v1, `brief.md` rev. 2.
Scope: the drop-1 surfaces only (brief §9 step 7a). Hire reports, contest, rebuttal, authorization check and the admin queue (`/admin/hire-reports`) come with drop 2.

No migrations, RPCs, `actions.ts` or `queries.ts` were edited. Where the contract was missing something, the request is in §5.

---

## 1. Screens

| # | Screen | Route | What changed | Files |
|---|---|---|---|---|
| S1 | Job form, client-name gate (BR-1) | `/workspace/[orgSlug]/jobs/new`, `…/jobs/[jobId]/edit` | While **Open this job to partner recruiters** is ticked, the client field shows the required marker and `aria-required`, and its hint switches to `jobs.form.clientRequiredForPartners` (linked with `aria-describedby`). The server's field error `jobs.validation.clientRequiredForPartners` renders inline, focus moves to the first invalid field (existing pattern), and the form keeps its values. The field is wrapped in `#client` (the nudge CTA's anchor). | `src/features/jobs/components/job-form.tsx` |
| S2 | Nudge, reason (d) `no_client_name` | `/workspace/[orgSlug]/jobs`, `…/jobs/[jobId]` | `NUDGE_REASONS` gets `no_client_name` after the N2 three, so the list chip `jobs.nudge.chipClientName`, the list banner count, and the job-page banner (`nudge.bodyClientName` + **Add client name** → `/edit#client`, `jobs:write` only) all follow. | `src/features/jobs/nudge.ts`, `src/app/workspace/[orgSlug]/jobs/[jobId]/page.tsx` |
| S3 | Record hire dialog, V0–V6 + result states | from S4 (E1) and the pipeline board (E2) | Rewritten around the server's `get_referral_hire_state` (see §2). | `src/features/referrals/components/report-hire-dialog.tsx`, `src/features/referrals/hire-dates.ts`, `src/features/referrals/hire-dialog-data.ts` |
| S3/E2 | Pipeline drop on **Hired** | `?tab=pipeline` | Hired accepts drops from `accepted`, `interviewing` and `offer` (PD-075). The hire state loads on demand (skeleton dialog meanwhile). The drop isn't blocked by "awaiting split" any more, because V3 / V4 handle referrals with no confirmed agreement. The hire move doesn't require the card's pipeline-owner flag (PD-077 waiver); other moves still do. Cancelling leaves the card where it was. | `src/features/pipeline/components/pipeline-board.tsx`, `src/features/pipeline/stages.ts` |
| S4 | Referral page | `/workspace/[orgSlug]/referrals/[referralId]` | Reads `getReferralHireState` alongside the existing reads. **Record hire** (E1) renders when `can_record`, or when `variant = objection_open` (V0). It's primary on the happy path and outline otherwise, after the transition buttons. It also shows when the pipeline lock hides the other buttons (waiver). S4-e next-step banner for hires recorded without a split (B: released / no-agreement body; A: `hiredNoSplitSource` plus the 7.5 rule line when there was no agreement). S4-f void banner (A gets the reason line). The agreement panel shows the `detail.agreement.deemed` pill and `deemedLine` when `agreement.origin = deemed`, and `detail.agreement.none` after a no-split hire. | `src/app/workspace/[orgSlug]/referrals/[referralId]/page.tsx` |
| S12 | Ownership footer (BR-35) | inside S4 | Driven by `hire.ownership`: `released` → N1 line (A only); `ended`; `void` → `detail.ownershipVoid`; `not_delivered` → `ownershipStartsAtDelivery` (A) / no line (B); `protected` → `detail.protectedUntil` (A) / `detail.protectedUnlessReleased` (B, identical with or without a release); `closed` → A's filing-limit line (`hireReport.limit` / `limitTail` / `limitClosed` from `report_until` / `report_tail_until` / `window_end`, `CalendarClock` icon), B no line. `already_presented` on A keeps `ownershipNotDelivered`. `detail.ownership` is retired (removed from all three locales). | same |
| S9 | Fee-pending placement | `/workspace/[orgSlug]/commissions/[placementId]` | When the fee isn't set yet, the fee panel becomes the **Fee-pending panel**. It shows the title, the estimate line (legacy / flat / `~estimate` / rate only, never an invented amount), the established line with `how` (`deemed` / `upheld`), and the deadline: "Fee details due" + `{when} ET`, or `feePending.overdue` once past. B gets **Enter fee details** while the status is `fee_pending`. The `noAmounts` hint sits above the share tiles (they already show % and "—"). Invoice, payment and payout stay hidden; **Open a dispute** and **Open referral** stay. The header pill uses `Clock` and wraps; an **Invoice overdue** chip shows next to it (BR-14). | `src/app/workspace/[orgSlug]/commissions/[placementId]/page.tsx`, `src/features/commissions/components/fee-details-dialog.tsx`, `src/features/commissions/placement-signals.ts` |
| S9 | `FeeDetailsDialog` | inside S9 | The PD-077 range hint `hire.startRange` sits under the start date (the floor comes from `get_referral_hire_state.delivered_at`, read on the placement page). Then the snapshot fee block (start date, base / bonus, computed fee, I ≠ C + reason incl. `non_permanent_engagement` and its hint, note), or legacy free entry (fee, currency, start date, guarantee). Prefilled start date when known. Posts `completeFeeDetails` with the placement version. On success: toast `commissions.feeDetails.saved`, the dialog closes, and the page re-renders as a normal placement. `hire_terms_changed` / `stale_version` refresh the page and keep the values. | `src/features/commissions/components/fee-details-dialog.tsx` |
| S10 | Commissions list | `/workspace/[orgSlug]/commissions` | Fee-pending rows: "—" plus the estimate line in muted text, and the status pill (wraps, `Clock`). Any row with `invoice_due_at` past and no invoice gets the **Invoice overdue** chip (both sides). | `src/app/workspace/[orgSlug]/commissions/page.tsx`, `src/features/commissions/placement-signals.ts` |
| S11 | Release from declined / rejected (BR-34) | inside S4 | No component change was needed. **Release candidate** already renders from `get_referral_presentation.can_release`, which the backend extended to `declined` / `rejected` (and refuses after a hire). The doc comment was updated. | `src/features/referrals/components/release-dialogs.tsx` (comment only) |
| S21 | Admin hire-record panel + note (BR-12, BR-13) | `/admin/referrals/[referralId]` | Rendered only when `admin_get_hire_record` returns a record. It shows the kind pill (placement / without a split), the **Late record** pill (admin-only), recorded on, acceptance date or "unknown", start date and role. **Admin note** (`Textarea`, max 2,000, `CharCount`) with **Save note** → `saveHireRecordNote`, toast `admin.hireRecord.noteSaved`, `router.refresh()`. Errors go inline (`role="alert"`) with focus back on the field. | `src/features/admin/components/hire-record-panel.tsx`, `src/app/admin/referrals/[referralId]/page.tsx` |

States: loading uses the existing workspace `loading.tsx`, plus the pipeline's skeleton dialog. Errors use the workspace `error.tsx`, inline `role="alert"` in dialogs, and field errors. Disabled/pending: every dialog button is disabled while its action is pending, and Submit shows "Recording…" / "Saving…". Empty: the panels aren't rendered (no hire record, no fee-pending rows).

---

## 2. Record hire dialog (S3), variant by variant

Props: `hire: HireDialogState` (the target payload's `status`, `version`, `delivered_at`, `variant`, `legacy`, `other_role_allowed`, `job_title`) and `terms` (`getReferralTerms`). The client never decides the variant.

| Variant | Rendered |
|---|---|
| V0 `objection_open` | Header, then an info `Alert` (`hire.objectionOpenTitle` / `objectionOpenBody`, focus on the title when it opens), then **Close**. No form. If `errors.objection_open` comes back on submit (a colleague filed meanwhile), the form is replaced by the same alert and **Close**. |
| V1 `happy` | The N2 dialog unchanged: snapshot or legacy fields, no common fields. Trigger/title copy renamed. |
| V2 `confirmed` | Info line `hire.anyStatusNote` ({status} = localized status label), then the common fields, then the N2 block. |
| V3 `deemed` | Info `Alert` `hire.deemedTitle` / `hire.deemedBody` ({partner}, snapshot version and date), or `hire.deemedBodyLegacy` ({partner}) on a legacy referral, then the common fields and the N2 block. |
| V4 `no_agreement` | Neutral `Alert` `hire.noAgreementTitle` / `noAgreementBody`, then the common fields only, then the muted `hire.noAgreementTermsLine`. No terms box and no fee inputs. |
| V5 (released) | Never returned by the server; renders as V2 / V3 / V4. |
| V6 `legacy` | Legacy free entry replaces the snapshot block inside V1 / V2 / V3. |
| Result (V4 / V5) | The body is replaced by a success `Alert` (`role="status"`, focus on the title): `hire.recordOnlyTitle` + `recordOnlyResult` (released) or `noAgreementResult` ({partner}). **Done** (or Esc) closes the dialog and refreshes the page. |
| Placement | The action redirects to `/commissions/{id}?created=1` (unchanged). |

Common fields: **Offer accepted on** (`type=date`, max today) with **I don't know the acceptance date**. Ticking it hides and clears the date, keeps focus on the checkbox, and shows `hire.startUsedForTiming` under the start date. Then **Start date** (required). Then **Role hired into** (`fieldset`/`legend`, `RadioGroup`): **This job: {job}** (wraps), plus **Another role at this client**, which is only rendered when `other_role_allowed`. That option reveals **Job title** (required, 120 max, `CharCount`, `hire.otherRoleHint`). There is no related-org field (AC-28).

Errors:
- `hire_terms_changed`: the existing warning alert, and the page refreshes.
- `hire_not_eligible`: a warning `role="alert"` at the top with a **Refresh page** button (`hire.refresh`, ≥ 44px on mobile) that calls `router.refresh()`. There's no automatic refresh.
- `hire_dates_invalid` (PD-077): checked **before posting**. `src/features/referrals/hire-dates.ts` mirrors the bound [delivery − 366 days, today + 548 days] in ET. The start date is required and in range; the acceptance date is in range when given. A failure gives the field error `errors.hire_dates_invalid` on that field, with focus on it. Under each date input, `hire.startRange` ("Allowed dates: {min} to {max}", dates formatted for the locale) stays visible even when the error shows, because the error points to it. Start date: floor to today + 548 days. Acceptance date: floor to today. The line is linked to the input with `aria-describedby`. The date inputs also carry `min` / `max`.
- Acceptance future / after start, and other-role title: field errors from the action.
- Money: the N2 field errors. Generic errors: `FormMessage` inline.

Mobile (375px): the date grid stacks, radio rows are ≥ 44px and wrap, footer buttons are full width with the primary last, and button labels wrap (`h-auto whitespace-normal`) instead of truncating.

---

## 3. i18n keys (en / fr / pt, exact §5 text; fr colons use U+00A0)

Renamed values: `pipeline.reportHire`, `referrals.hire.trigger`, `referrals.hire.title`, `admin.referralTerms.blockedHired` (§5 `admin.blockedHired`), `labels.placementStatus.hire_reported`.

Added or replaced (backend drafts overwritten with §5):
- `jobs.form.clientRequiredForPartners`, `jobs.validation.clientRequiredForPartners`, `jobs.nudge.chipClientName` / `bodyClientName` / `ctaClientName`.
- `errors.client_name_required_for_referrals`, `errors.objection_open`, `errors.hire_not_eligible`, `errors.hire_dates_invalid`, `errors.placement_fee_pending`.
- `referrals.hire.startRange`, `refresh`, `deemedBodyLegacy` (added by the ux-writer; wired by frontend).
- `referrals.hire.anyStatusNote`, `acceptedOn`, `acceptanceUnknown`, `startUsedForTiming`, `roleGroup`, `roleThisJob`, `roleOther`, `otherRoleTitle`, `otherRoleHint`, `objectionOpenTitle`, `objectionOpenBody`, `close`, `deemedTitle`, `deemedBody`, `noAgreementTitle`, `noAgreementBody`, `noAgreementTermsLine`, `recordOnlyTitle`, `recordOnlyResult`, `noAgreementResult`, `done`, `nonPermanentHint`, `validation.acceptanceAfterStart` / `acceptanceFuture` / `otherRoleTitle`.
- `referrals.hireReport.limit` / `limitTail` / `limitClosed` (A's ownership footer).
- `referrals.detail.protectedUntil`, `protectedUnlessReleased`, `ownershipVoid`, `next.hiredNoSplit`, `next.hiredNoSplitTargetReleased`, `next.hiredNoSplitTargetNoAgreement`, `next.hiredNoSplitSource`, `next.hiredNoSplitSourceRule`, `next.void`, `next.voidSource`, `agreement.deemed`, `agreement.deemedLine`, `agreement.none`. Removed: `referrals.detail.ownership`.
- `labels.placementStatus.fee_pending`, `labels.placementStatusDescription.fee_pending`, `labels.feeDifferenceReason.non_permanent_engagement`.
- `commissions.feePending.title`, `estimate`, `rateOnly`, `flat`, `legacy`, `established`, `how.deemed`, `how.upheld`, `due`, `overdue`, `noAmounts`, `enter`; `commissions.feeDetails.title` / `saved`; `commissions.invoiceOverdue`.
- `admin.hireRecord.title`, `kind.placement`, `kind.noSplit`, `recordedOn`, `acceptance`, `acceptanceUnknown`, `start`, `role`, `late`, `note`, `noteHint`, `saveNote`, `noteSaved`; `admin.hireReports.noticeSentLine`.

Not added (drop 2 or Should): the rest of `hireReport.*`, `panel.*`, `authCheck.*`, `admin.hireReports.*` queue keys, `hire.reportedStart`, `hire.offerNudge`, `detail.recordCreated`.

---

## 4. AC coverage (UI side; server behaviour is backend's / QA's)

| AC | Where | Status |
|---|---|---|
| AC-1 | S1 marker, hint, inline field error, values kept | UI done (server refuses) |
| AC-2 | S2 chip, banner, order (d) last, CTA for `jobs:write` | Done |
| AC-3, AC-4, AC-5 | — | Server-only, no UI |
| AC-6, AC-92 | E1 renders from `can_record` (or V0); not rendered after a hire record / void | Done |
| AC-13 | V1 unchanged, copy renamed | Done |
| AC-14 | Button only for B; the pipeline lock doesn't hide **Record hire**; pipeline hire move ignores the card's owner flag | Done (UI); `not_found` is the action's |
| AC-15 | V2 note with the localized status; declined / submitted render V3 / V4 per the server | Done |
| AC-16 | Acceptance/unknown/hint, start required, future start OK, `hire_dates_invalid` as a field error (client pre-check) on V1–V6 and fee details | Done, see gaps 1–2 |
| AC-17 | Other-role title (required, 120, CharCount), computed fee with minimum | Done |
| AC-18 | Reason list incl. **Non-permanent engagement** + ⚖️ hint; TS/Zod enum | Done (added to `FEE_DIFFERENCE_REASONS`, gap 7) |
| AC-19 | V6 legacy free entry + legacy alert inside any variant; no currency picker on snapshot | Done |
| AC-20, AC-21 | V3 notice; deemed pill and line on both sides' agreement panel | Done |
| AC-23 | V4 + `noAgreementResult` result; S4-e both sides | Done |
| AC-26, AC-27 | V5 renders the server's variant (no release notice); `recordOnlyResult`; B's footer identical | Done |
| AC-28 | No related-org field; admin note on S21 | Done |
| AC-29 | `late` pill on S21 only | Done (task list is drop 2) |
| AC-30 | Invoice overdue chip on list and placement page | Done (admin view is drop 2) |
| AC-31 | `hire_terms_changed` alert + refresh on every path | Done |
| AC-32 | Pipeline drop from accepted / interviewing / offer opens the same variant; cancel keeps the card | Done |
| AC-68 | Fee-pending panel lines, established line, deadline, "—" amounts + hint | Done, see gap 4 (no business-days-left) |
| AC-69 | Finance actions hidden while pending; dispute stays | Done |
| AC-70 | Fee details dialog, toast | Done |
| AC-71 | "Fee details were due {when} ET." on the placement page | Done (admin task is drop 2) |
| AC-74, AC-75 | Release button from `can_release` | Done (server decides) |
| AC-76, AC-77 | Ownership footer per `hire.ownership`; A's filing-limit line | Done |
| AC-100 | All drop-1 keys in en / fr / pt with the §5 text | Done |
| AC-101 | 375px: stacked/wrapping layouts, ≥ 44px targets in new UI, no `line-clamp` on alert titles, chips wrap | Built to spec, **not visually verified** |
| AC-102 | V0 state on open and on a forged/raced submit | Done |
| AC-104 | `AmendTermsForm` refresh | Done by backend (v1 §6) |

---

## 5. Gaps and contract requests

1. **Backend request: `hire_dates_invalid` as a field error.** `reportHire` and `completeFeeDetails` map the RPC's `hire_dates_invalid` to `errors.generic` (backend.md §7), but rev. 2.1 wants a field error on the date. The dialogs pre-check the bound, so the RPC error only shows up on a race or a clock skew. Ask: return `fieldErrors: { startDate: ["errors.hire_dates_invalid"] }` (or `offerAcceptedOn`) from both actions.
2. ~~Copy missing: the start-date range hint.~~ **Resolved:** `hire.startRange` is wired under the start date (record dialog V1–V6 and fee details) and under the acceptance date.
3. ~~Copy missing: a "Refresh" button label.~~ **Resolved:** `hire.refresh` is the button in the `hire_not_eligible` alert; the automatic refresh was removed.
4. **Backend request: business days left for `fee_details_due_at`.** `BusinessDeadline` needs a server-computed `left` (holiday calendar). No read returns it, so S9 shows "Fee details due · {when} ET" without "N business days left". Ask: expose `fee_details_business_days_left` (e.g. a small `get_placement_fee_state(p_placement)`, or a column in a placement view).
5. ~~The fee-details dialog can't check the date floor.~~ **Resolved:** the placement page reads `delivered_at` from `get_referral_hire_state` (both sides receive it), so the floor is pre-checked and shown in the range hint.
6. ~~Copy: V3 on a legacy referral.~~ **Resolved:** `hire.deemedBodyLegacy` replaces `hire.deemedBody` when the referral is legacy.
7. **Backend note:** `FEE_DIFFERENCE_REASONS` (`src/lib/money/terms.ts`) didn't include `non_permanent_engagement`, so the Zod enum in `reportHireSchema` refused it (AC-18). I added it in the shared lib constant. No backend-owned file was edited.
8. **New frontend-owned server files for backend review:**
   - `src/features/referrals/hire-dialog-data.ts` (`loadHireDialog`): a read-only Server Action for the pipeline, `guard` + `referrals:review` + `get_referral_hire_state` + `getReferralTerms`. Non-target or invisible → `referrals.errors.notFound`.
   - `src/features/commissions/placement-signals.ts`: RLS read of `placements.invoice_due_at` + `invoice_records` and the fee-pending estimate.

   Either can move into `queries.ts` / `actions.ts` once drop 2 settles.
9. ~~Copy consistency: fr `referrals.hire.submit`.~~ Handled by the ux-writer in the JSON (§5 drift rows).
10. **Not built in drop 1:** BR-16 offer nudge (Should), BR-38 record-created note, the hire-report panels and dialogs, `/admin/hire-reports` (late / fee-overdue tasks and **Record notice sent**: `listAdminHireTasks` / `recordFeeNotice` are unused so far), and the read-only admin note on the hire-report detail.
11. **Visual check not done.** Another `next dev` instance already serves this checkout on port 3000, and Next refuses a second dev server in the same directory. I didn't use or stop it, so light/dark/375px weren't checked in a browser. QA/design review should cover S3, S4, S9–S12 and S21 at 375px in fr.

---

# Drop 2 (backend.md v2, §14–§25)

Built against `spec.md` rev. 2.1 and `backend.md` v2. No migrations, RPCs, `actions.ts` or `queries.ts` were edited. Two shared files outside my area got small additive edits; they're listed in §D2.4.

## D2.1 Screens

| # | Screen | Route | What it does | Files |
|---|---|---|---|---|
| S4-b | **Report a hire** (A) + filing-limit line | `/workspace/[orgSlug]/referrals/[referralId]` | Outline button with `BadgeCheck`, rendered when `get_referral_hire_state.can_report`. The `hireReport.limit` / `limitTail` line (`CalendarClock`) sits under the action bar. `?reportHire=1` opens the dialog; N10's Report a problem link uses it. | page, `src/features/hire-reports/components/hire-report-dialog.tsx` |
| S5 | `HireReportDialog` | from S4-b | Tail statement (only when `report_tail`, with the per-item "backs tail" box). Employer (200, `CharCount`). Approximate start as a month + year `fieldset`: delivery month to current + 3, localized month names. Role (120). How learned. 1–5 evidence cards (`ol` of `fieldset`s, focus management per §6). Files: N1 rows on the `hire-evidence` bucket, purpose `hire_report`. Statement (20–2,000). Attestation. Submit is disabled with a linked status line while files aren't ready. Outcomes: filed → toast + refresh. The generic refusal (`errors.hire_report_unavailable` + `hireReport.unavailableHint`, same text for every cause), the org rate limit, and `errors.hire_already_recorded` (+ **Refresh page**) render inline and keep every value. Field errors are checked client-side first, then mapped from the server. | `hire-report-dialog.tsx`, `evidence-items.tsx`, `hire-evidence-list.tsx`, `src/features/hire-reports/form-helpers.ts` |
| S6 | `HireReportPanel` (both sides) | inside S4, after the claim panel | All 10 statuses, with tone and icon per §2.6 and the side-specific status lines. `BusinessDeadline` for the answer and rebuttal windows (server `*_business_days_left`). Rows in a `dl` (one column on mobile, `12rem 1fr` from `sm`). Evidence items: A sees `https:` links in a new tab with sr-only text; B sees the `linksHidden` line. Files: own files get name, size, **Download** (60-second URL, disabled until clean) and SHA-256 + **Copy**; counterpart files get "File {n}", upload time and SHA-256, plus the `filesHidden` line. Contest: the reason (A sees "Not this client"; the statement is hidden when the server nulls it). Rebuttal. Resolution (absent for A on `not_this_client`). A's `releasePaused` line while pending (BR-21). B's `authCheck.requestedLine`. Earlier reports collapse into a `details` list. | `hire-report-panel.tsx` |
| E3 | Confirm / Record hire from the panel | S6 | B, `awaiting_answer`: **Confirm and record hire** (primary) + **Contest**. B, `unanswered`: **Record hire** only. Both open `ReportHireDialog` with `report={id, role, startMonth}`: hidden `reportId` (closes as `confirmed`), the role prefilled as "Another role" when it differs from the job title, and the `hire.reportedStart` line. | `report-hire-dialog.tsx` |
| S7 | `ContestDialog` | S6 (B) | Four reasons (`RadioGroup`, `labels.hireContestReason.*`, `noPriorHint`). The `outside_window` dates appear inside an `aria-live` container. The statement hint switches to `statementHintAdmin` for `not_this_client`. Documents (`hire_contest`). Attestation. Server errors (`hire_report_answer_closed`, `dispute_already_open`, …) render inline. | `answer-dialogs.tsx` |
| S8 | `RebuttalDialog` | S6 (A, `can_rebut`) | `BusinessDeadline` in the header. Statement, 0–5 items, files (`hire_rebuttal`), attestation. `hire_rebuttal_closed` renders inline. | `answer-dialogs.tsx` |
| S13 | `RequestAuthCheckDialog` (B) / `AuthCheckPanel` (A) | S6 / above the panels | B: reason (20–2,000) + files (`auth_request`), shown when `can_request_auth_check` and not yet requested. A: `authCheck.title` / `body`, `BusinessDeadline` (`evidence_business_days_left`), and a form (statement, 1–5 files `auth_evidence`, attestation) while `can_send_evidence`. After sending, the `sentLine` shows. B never sees A's panel. | `auth-check.tsx` |
| S4-i | Record-created note (A) | S4 | `detail.recordCreated` from `record_created_at` (source side only). | page |
| S20 | N10 Report a problem, hire line | N10 dialog | `RightTool.hire` now also accepts `{href, label}` (links **Report a hire** → `?reportHire=1`; closes the N10 dialog through its existing `onNavigate`) or `{text}` (`hireReport.rightToolUnavailable`). `true` keeps N10's support sentence for its other callers. | `src/features/network-rules/components/report-dialog.tsx` (additive) |
| S9 | Fee details | `/workspace/[orgSlug]/commissions/[placementId]` | `getPlacementFeeState`: `BusinessDeadline` with "N business days left", `fee_details_overdue` → the overdue line, and `start_date_min` / `start_date_max` as the dialog's window and range hint. `hire_dates_invalid` comes back as a field error. | page, `fee-details-dialog.tsx` |
| S14 | `/admin/hire-reports` | new | Sections: to decide (type pill, orgs, job, filed date, "Decide by {when} ET", **Overdue** chip, Suspended pill), waiting (status pill or "Authorization check"), tasks (AC-29 late records and AC-71 fee overdue with **Record notice sent** → `recordFeeNotice`, or the `noticeSentLine`), recently closed. A failed read shows `errors.generic` per section and never reads as empty. When everything is empty, the page shows an `EmptyState`. `loading.tsx` skeleton. | `src/app/admin/hire-reports/page.tsx`, `loading.tsx` |
| S15 | `/admin/hire-reports/[reportId]` | new | 404 for a bad or unknown id. Header "{A} → {B}", status, Suspended, deadline + Overdue. Left column: referral facts (both client keys, the job's current client name, delivery, window and tail ends, legacy, status history) + the static coverage checklist, the report (links, files with audited download), the answer, the rebuttal. Right column: signals (same-person block from the payload, record-created, email-changed, HA-6, late, hire-record note), delivery records or `noDeliveryRecords`, admin fields (contacts 0–5 with the > 1 hint, client confirmation, note → `saveHireReportFields`), the authorization-check sub-panel. Decision bar last in the DOM, sticky on desktop: **Uphold** (body `upholdBodyPlacement` / `upholdBodyNoSplit` from `uphold_creates_placement`) and **Reject** (finding `RadioGroup` + hint), each with a written resolution. No money fields. | `src/app/admin/hire-reports/[reportId]/page.tsx`, `src/features/admin/components/hire-report-admin.tsx` |
| S16 | Authorization check (admin) | S15 and `/admin/referrals/[referralId]` | B's requests (reason + files). **Open authorization check**: requested by (preselects "hiring side" when B asked), challenger evidence, read-only recent-change note. An open check shows the evidence due date, `noEvidence` (and preselects **Mark invalid**), A's statement + files, then **Mark valid** or **Mark invalid** (the irreversible `invalidTitle` / `invalidBody` dialog) with a resolution and "candidate contacted". Decided checks show outcome, date and resolution. | `hire-report-admin.tsx`, admin referral page |
| S17 | `/admin/disputes` | extended | `hire_report` disputes get a compact card (badge, job, orgs, dates, **Open hire report**). They're no longer offered the placement **Resolve** controls. Counted in "All". | `src/app/admin/disputes/page.tsx` |
| S18 | `/admin` overview | extended | Third attention tile **Hire reports** (decide section + fee-overdue tasks without a notice; a failed read shows an error pill, not 0), included in `kpi.attention`. HA-6 lines (`flags.rejectedHireReports`) in Organizations to review. Sidebar item **Hire reports** (labels now wrap instead of truncating). | `src/app/admin/page.tsx`, `admin-sidebar-nav.tsx` |

## D2.2 i18n

- **From §5, verbatim, en/fr/pt** (fr colons with U+00A0): `referrals.hire.reportedStart`; every `referrals.hireReport.*` dialog key; `hireReport.panel.*` incl. all `panel.status.*`; `hireContest.*`; `hireRebuttal.*`; `authCheck.*`; `detail.recordCreated`; `labels.hireLearnedVia.*`, `labels.hireEvidenceType.*`, `labels.hireReportStatus.*`, `labels.hireContestReason.*`; `admin.overview.queues.hireReports`, `admin.hireReports.*`, `admin.authCheck.*`, `admin.flags.rejectedHireReports`.
- **Key-shape deviation:** §5.8 uses `admin.hireReports.clientConfirmation`, `admin.hireReports.finding` and `admin.authCheck.requestedBy` both as a label and as a value namespace. JSON can't hold both, so the label is `….label` and the values sit beside it (`….clientConfirmation.not_requested`, …). ux-writer: please mirror this in §5.
- **Frontend drafts, not in §5 (please review or replace):**
  - `referrals.hireReport.item.legend` ("Item {n}"), `hireReport.month`, `hireReport.year`;
  - `hireReport.validation.learnedVia` / `itemType` / `attestation` / `role`, `hireContest.validation.reason`;
  - `hireReport.panel.rows.employer` / `role` / `learnedVia` / `tail` / `files` / `contest` / `rebuttal`, `hireReport.panel.itemCaptured`, `hireReport.panel.newTab`;
  - `admin.nav.hireReports` (same text as the §5 title);
  - `admin.hireReports.detail.*`: facts, answer, noAnswer, rebuttal, signals, deliveryRecords, adminFields, note, delivered, legacy, history, emailChanged, notesSaved, decided, sentOn, noticeSaved, chooseFinding, openReport, filed;
  - `admin.hireReports.empty.all`;
  - `admin.authCheck.candidateContacted`, `opened`, `decided`, `none`, `evidenceDue`, `chooseRequester`, `status.open` / `valid` / `invalid`.
- **Reused existing keys:** N1 `claim.file.*`, `claim.addFiles`, `claim.validation.fileType` / `fileSize` / `tooManyFiles`, `claim.panel.fileN` / `uploaded` / `sha` / `copyShaAria` / `copied` / `download` / `scanning` / `filed` / `evidence`, `claim.filesHint`, `claim.file.none`; admin `disputes.claim.samePerson*`, `labels.identifierMatch.*`, `orgs.suspended`, `validation.resolution`; `hire.refresh`.

## D2.3 AC coverage (UI side)

| AC | Where | Status |
|---|---|---|
| AC-12 | A's limit lines (action bar + footer); the button hides after + 9 months (`can_report`); tail statement + per-item box; tail field error | Done |
| AC-34 | Report a hire from `can_report`; B never sees it | Done |
| AC-35 | One inline alert for `hire_report_unavailable` whatever the cause | Done |
| AC-36 | `hire_already_recorded` inline + Refresh page | Partial: gap 3 |
| AC-37 | Org limit inline; per-user `errors.rateLimited` inline | Done |
| AC-38, AC-39 | Button follows `can_report` | Done (server rules) |
| AC-41 | Client and server field errors per field and per item; a screenshot item without link or date passes | Done |
| AC-42 | N1 upload rows, submit disabled with a reason, drafts discarded on close | Done |
| AC-43 | Toast with the deadline, panel after refresh | Done |
| AC-44, AC-45 | Side-shaped rendering: B gets no links, names or downloads; A gets its own links and files | Done (payload is the server's) |
| AC-46 | "Not this client." without a resolution, for A | Done |
| AC-47 | A's `releasePaused` line; Release / checkbox follow `can_release` | Done |
| AC-48 | `closed_by_record` lines (§5 copy) | Done |
| AC-52 | Confirm opens the right variant, role prefill, `reportedStart` line, `reportId` posted | Done |
| AC-53 | Four reasons, conditional dates, field errors, toast | Done |
| AC-54 | Contest hidden when `can_contest` is false; `dispute_already_open` inline | Done |
| AC-55 | A sees the reason, dates and (server-gated) statement; never B's files | Done |
| AC-56 | Rebuttal once, hidden after; `hire_rebuttal_closed` inline | Done |
| AC-57 | Overdue chip on queue and detail | Done |
| AC-58, AC-59 | Uphold / reject dialogs with resolution; panels show the outcome + resolution + placement link | Done |
| AC-60 | No money fields in the admin decision | Done |
| AC-61 | Detail: client keys (not names, gap 6), files with audited links, signals, delivery records, audited fields | Done except gap 6 |
| AC-62 | "Unanswered: notice not delivered" pill in To decide | Done |
| AC-65 | Only uphold / reject, no restart | Done |
| AC-67 | `unanswered`: **Record hire** only | Done |
| AC-29 | Late task in the queue + late pill on the detail (the hire-record panel was drop 1) | Done |
| AC-71 | Fee-overdue task with **Record notice sent** / `noticeSentLine`; placement page overdue line | Done |
| AC-79 | Request dialog, requested line, once (button hidden; `auth_check_already_requested` inline) | Done |
| AC-80 | Admin open dialog; A's panel with deadline and evidence form | Done |
| AC-81 | Mark invalid (irreversible dialog), `noEvidence` preselect; void lines from drop 1 | Done |
| AC-82 | Mark valid | Done |
| AC-83 | Record-created note on A's page and the admin detail | Done |
| AC-85 | HA-6 line on `/admin` and in detail signals | Done |
| AC-86 | Queue sections and tasks; no automatic action | Done |
| AC-50 | N10 hire line links / plain text | Done (see gap 8) |
| AC-68 | Fee-pending deadline now with business days left | Done |
| AC-30 | Admin view of Invoice overdue | Not done (gap 5) |
| AC-101 | 375px layouts built to spec: stacked actions, full-width wrapping buttons, ≥ 44px targets, chips and labels wrap | Not visually verified |

## D2.4 Gaps, deviations and requests

1. **Backend: the v2 hire-state keys aren't in the exported types.** `can_report`, `report_tail`, `pending_report_id`, `record_created_at`, `auth_check`, `auth_check_requested_at` are read through `src/features/hire-reports/hire-state.ts`. Please fold them into `SourceHireState` / `TargetHireState` in `referrals/queries.ts`.
2. **Backend: admin payloads are typed `Record<string, unknown>`.** `getAdminHireReport` and `getAdminAuthorizationChecks` have no types, so the frontend typed them from the SQL (`AdminHireReportDetail` in the detail page, `AdminAuthChecks` in `hire-report-admin.tsx`). Please export real types.
3. **Backend: `hire_already_recorded` has no target.** Spec §2.5 wants **Open placement** (or **Open referral**), but the action returns only the message, no placement id. The UI offers **Refresh page** (the page then shows the placement or no-split banner). Request: return `{placementId}` in the error data.
4. **Backend: no business days left for admin deadlines.** `admin_list_hire_reports` and `admin_get_hire_report` return no business-days-left, so queue and detail show "{when} ET" + Overdue instead of the full `BusinessDeadline`. Request: add `deadline_business_days_left`.
5. **AC-30, admin side, not built.** There is no admin placement view to put **Invoice overdue** on. Both workspace sides show it (drop 1). Needs a product decision (e.g. a task row) or an admin placement page.
6. **AC-61, client names.** The detail shows both client **keys** and the job's current client name, because names aren't stored at commit or delivery (backend v2 §25). Filing limits aren't listed separately: the window and tail ends are shown.
7. **`deemed_confirmed` (gated, N7):** `panel.status.deemedTarget` needs `{when}` = the fee-details deadline, which `get_hire_reports` doesn't return; it renders "—" until N7. Request: add `fee_details_due_at` to the report view.
8. **N10 file edited (additive):** `RightTool.hire` in `src/features/network-rules/components/report-dialog.tsx`. Spec §2.5 asks for a discard confirm before switching dialogs; N10's links already close the report without one, so the hire link follows N10's pattern. N10 owner: please review.
9. **Shared formatter:** added `monthYear` to `src/i18n/format.ts` ("March 2027" / "mars 2027").
10. **Admin language hint** (`dispute.languageHint`) isn't shown on the detail: the payload carries no org languages.
11. **`admin.validation.resolution`** says "5 to 2,000 characters", but the hire-report and auth-check resolutions need 20 (backend schemas). The forms check 20 and show that message. ux-writer / backend: align the copy.
12. **The same-person block** reads `signals.same_person` from the payload (always "not available" today, backend v2 §25) instead of the N1 per-dispute comparison action.
13. **Visual check not done.** Another `next dev` owns this checkout on port 3000; I didn't use or stop it. QA/design: check S5–S8, S13–S16 at 375px in fr (long titles, chips, radio labels), light and dark.

---

# Fix loop, round 1 (qa-report.md, design-review.md, copy-review.md, backend v2.1, PD-079)

## R1.1 Fixed

| Item | Fix | Files |
|---|---|---|
| **QA-N3-04 (major)**, record-only result (AC-23, AC-26) | `HireForm` calls `reportHire` directly instead of through `useActionState`. A record-only result goes into a small client store (`publishHireResult`), and the dialog closes. `HireResultHost` is mounted at the top of the referral page (B side) and on the pipeline board, outside anything the hire re-renders away, and renders the S3 result state: success alert with `role="status"`, focus on the title, **Done** / Esc closes and refreshes. A placement still redirects inside the action. | `src/features/referrals/components/hire-result.tsx` (new), `report-hire-dialog.tsx`, referral page, `pipeline-board.tsx` |
| **QA-N3-04 (major)**, fee-details toast (AC-70) | `completeFeeDetails` is called directly, and the toast fires from the resolved promise, before the revalidated page drops the dialog. | `fee-details-dialog.tsx` |
| **QA-N3-08**, stepper | When `hired`, a stage counts as done only if the referral really reached it (`reachedAt`). A declined → hired referral no longer ticks Under review / Interviewing / Offer, and their labels are muted. | referral page |
| **QA-N3-08**, Terms panel | New `noSplit` prop on `ReferralTermsPanel`: no split, no expected share, and one row `detail.agreement.none` after a hire recorded without a split. | `referral-terms.tsx`, referral page |
| **Design B-1 (AC-79)** | `ClaimPanel` (B side, objection `contested`) renders `RequestAuthCheckDialog`, or `authCheck.requestedLine` once `get_referral_hire_state.auth_check_requested_at` is set. | `claim-panel.tsx`, referral page |
| **Design B-2 / B-3 (AA)** | "Fee details were due…" and "No evidence by the deadline." now use foreground text on `bg-warning-soft`, with the icon in the warning colour. | placement page, `hire-report-admin.tsx` |
| P-1 | The raced `objection_open` state moves focus to its alert title. | `report-hire-dialog.tsx` |
| P-3, P-4 | Download buttons are `min-h-11 min-w-11` on every breakpoint; the earlier-reports `summary` is `min-h-11`. | `hire-report-panel.tsx`, `hire-report-admin.tsx` |
| P-5 | Visible "SHA-256" label above the hash (N1 pattern), in the panel and the admin views. | same |
| P-6 | No hard-coded colons after labels: contest dates and the client name are `dt`/`dd` pairs; the HA-6 line uses label + value; the evidence due date uses `admin.authCheck.evidenceDueAt` with `f.etDateTime`. | panel, admin detail, `hire-report-admin.tsx` |
| P-9 | Evidence **Type** gets the required marker and `aria-required`. | `evidence-items.tsx` |
| P-11 | Uphold and Reject keep separate resolution text and errors. **Reject report** uses the default (non-destructive) confirm; **Mark invalid** stays destructive. | `hire-report-admin.tsx` |
| P-14 | The task-row link reads "Open referral" (`commissions.detail.openReferral`). | `src/app/admin/hire-reports/page.tsx` |
| Design gap 9 | Unit test for `monthYear`: `YYYY-MM` and full dates in en/fr/pt, no day shift. | `src/i18n/__tests__/month-year.test.ts` |
| Copy finding 1 | `admin.validation.resolutionLong` (20 to 2,000) in the hire-report decision and the auth-check decision. | `hire-report-admin.tsx` |
| Copy finding 4 | `admin.authCheck.evidenceDueAt`. | same |
| Copy findings 2, 3, 5–9 | Value-only changes in the JSON; the keys are unchanged and already wired. | — |
| **PD-079 (AC-61)** | The admin detail shows `admin.hireReports.clientKeyCommit` / `clientKeyDelivery` ({key}) and `jobClientToday` ({client}). The deprecated `clientCommit` / `clientDelivery` keys are deleted from en/fr/pt. | admin detail, `admin.json` ×3 |
| **Backend v2.1**, types | `src/features/hire-reports/hire-state.ts` is deleted. The page and `auth-check.tsx` use the exported `TargetHireState` / `SourceHireState` / `SourceAuthCheck`. The admin detail uses `AdminHireReportDetail`, and the auth-check panel `AdminAuthorizationChecks`. The same-person block maps `match` / `no_match` / `not_available` straight to `labels.identifierMatch.*`. | referral page, admin pages, `hire-report-admin.tsx` |
| **Backend v2.1**, AC-36 | `hire_already_recorded` now carries `target.placementId`. The inline alert links **Open placement** (`pipeline.openPlacement`) to `/commissions/{id}`, or offers **Open referral** (`pipeline.openReferral`, refreshes this page) for a hire recorded without a split. | `hire-report-dialog.tsx` |
| **Backend v2.1**, admin deadlines | The queue rows and the detail header use `BusinessDeadline` with `deadline_business_days_left` / `decide_` / `answer_` / `rebuttal_business_days_left`, followed by the Overdue chip. | admin queue and detail |

## R1.2 Not changed (with reason)

- **P-2:** the footer order follows the app convention; the designer is amending S3.
- **P-7:** pill vs "Not this client." line on A's side is a PM / ux-writer call.
- **P-10:** "Working…" pending labels; there are no §5 keys for "Contesting…" / "Sending…".
- **P-12, P-13:** gated until N7 (delivery records) and real same-person comparisons.
- **P-8 / gap 7:** the `deemedTarget` "{when}" still renders "—". It's gated (N7); the designer recorded it as an N7 acceptance condition.
- **P-9, list label:** the evidence `ol` keeps `aria-label` = `hireReport.evidence` ("Evidence"). An "Evidence items" key isn't in §5.

## R1.3 Gaps updated

- D2.4 gaps 1, 2, 3 and 4 are **resolved** (backend v2.1).
- Gap 6: superseded by PD-079 (normalized keys + today's job name).
- Gap 11: resolved (`resolutionLong`).
- Still open: gap 5 (no admin view of Invoice overdue, AC-30, PM decision); gap 13 (no visual check: port 3000 is the user's dev server, and I didn't touch it or any of its processes).
- backend.md doesn't describe v2.1 yet; the wiring follows the code in `queries.ts` / `actions.ts` (`target.placementId`, the `*_business_days_left` fields).
