# Frontend: duplicate and prior-presentation protection (N1)

Owner: Frontend Engineer · 2026-11-12 · Inputs: `spec.md` (S1–S11, §5 final copy), `backend.md`, `brief.md` rev. 4.1.
No new routes. Every surface extends an existing screen. ADR-0003 respected (no Cache Components; all pages stay request-time).
User-facing term: **objection** (code stays `claim*`).

## Routes touched

| Route | Change |
|---|---|
| `/workspace/[orgSlug]/opportunities/[matchId]` | Passes `hasLinkedin` to the composer (S1-b). |
| `/workspace/[orgSlug]/referrals/[referralId]` | Reads `getReferralPresentation`. Adds S2-b, S2-c, S2-d, S2-e, S2-f, S2-g, S2-h, S2-i. Uses the timeline actor from `actor_kind`. |
| `/workspace/[orgSlug]/referrals?tab=received` | Row chip, panel banner, objection context for the open panel, decline callout, bulk hint, revoked-referral objection button (S4). |
| `/workspace/[orgSlug]/referrals?tab=sent` | "Contest by {when} ET" chip on open objections. `already_presented` pill with no track. Legacy label (S6). |
| `/candidate/[token]` | `already_sent` terminal state, focus on the h1 (S7). |
| `/workspace/[orgSlug]/jobs/new`, `/jobs/[jobId]/edit` | Client-name hint switches with "Hide client" (S11). |
| `/admin/disputes` | Type badges, `ReferralDisputeCard`, uphold/reject, "same person" block, evidence download, history outcome pill (S8). |
| `/admin` | "Organizations to review" and "Duplicate protection" panels (S9, Should). |

## Components

| Component | File | Spec |
|---|---|---|
| `SubmitReferralForm` (extended) + `StopState` | `src/features/referrals/components/submit-referral-form.tsx` | S1-a…d. Outcomes are rendered from the action's returned `data.outcome`; `FormMessage` only shows `ok:false` errors. Two-step pending warning: hidden `acknowledgePendingWarning=true` once ticked; same idempotency key. Focus and scroll to the result. Support line is hidden when `supportEmail` is null; `mailto:` has a subject and no body. |
| `BusinessDeadline` + `deadline.ts` helpers | `components/business-deadline.tsx`, `features/referrals/deadline.ts` | S5-x. ET formatting via new formatter methods `etDateTime` / `etDateTimeShort` / `etDate` (`src/i18n/format.ts`). Business days left always come from the server. |
| `WithdrawDialog`, `ReleaseDialog` | `components/release-dialogs.tsx` | S3 / S3b. Rendered only when `can_release_on_withdraw` / `can_release`; otherwise absent. Each step focuses its title. `release_not_allowed` shows inline, and closing then refreshes the page. |
| `TransitionButtons` (extended) | `components/referral-actions.tsx` | `withdraw` prop (opens WithdrawDialog when the guards hold; "keeps first position" toast only when `counts`). `afterNegative` slot (File objection). Mobile: full-width buttons in rank order. |
| `ClaimPanel` (+ contest dialog, copy SHA, download) | `components/claim-panel.tsx` | S2-d. The sourcing side gets "File N" + time + SHA only; the hiring side gets name + download. The contest reason is never shown. |
| `ClaimForm`, `PriorPresentationClaimDialog` | `components/claim-dialog.tsx` | S5. Upload on select, polling every 2 s while any file is `pending`, states uploading → processing → ready / rejected / failed, cancel, retry, remove (focus moves to the next row). Submit is disabled with a visible reason line. Client checks use `fileClaimSchema` plus the PD-028 date range. Unfiled uploads are removed on unmount. |
| `DeclineDialog` (extended) | `components/review-queue.tsx` | S4. Objection callout (single, eligible only) swaps to `ClaimForm` inside the same dialog. The form stays mounted while going **Back** so files keep processing. Bulk shows `queue.bulkClaimHint`. |
| `getClaimContext` | `src/features/referrals/claim-context.ts` (server-only) | Builds the form context (deadline, delivery, picker options) only when `can_claim`. |
| `ConfirmDialog` (extended) | `src/components/shared/confirm-dialog.tsx` | `reasonHint` (aria-describedby), `reasonMinLength`, `reasonMaxLength`, inline `fieldErrors.reason`. |
| `FocusHeading` | `src/components/shared/focus-heading.tsx` | Focuses the h1 of a result page (S7). |
| `ClaimDisputeResolution`, `AdminEvidenceDownload`, `SamePersonBlock` | `src/features/admin/components/referral-dispute-controls.tsx` | S8. The block loads on mount (skeleton, error with "Try again") and shows pills only, never values. |

Small read changes in `src/features/referrals/queries.ts`: `listReceivedQueue` also selects `claim_rejected_at, review_clock_started_at`; `getReferralDetail` events also select `actor_kind`. `review.ts`: `isDeclineReason` now labels `prior_presentation` (display only; still not selectable).

## i18n

All 232 §5 keys are in `en`, `fr` and `pt`, verbatim (script-checked against the spec tables). In fr, the spaces before `:` and inside `« »` are U+00A0 for the new keys. Keys were added or updated in `referrals`, `labels`, `candidate`, `jobs`, `admin` and `emails`. `errors.*` came from backend and match §5.8 exactly.
No frontend-invented copy. Existing keys reused: `common.actions.cancel/working/tryAgain`, `common.yes/no`, `referrals.actions.reason`, `referrals.queue.revoked`, `referrals.success.released` (as the admin "released" flag line), `labels.claimStatus.upheld` / `labels.referralStatus.already_presented` (flags).
Test change: `src/i18n/__tests__/messages.test.ts` now compares placeholder **sets**, because the final fr/pt copy repeats `{partner}` where en uses a pronoun.
`emails.*` keys are present but unused: N1 is in-app only (PD-030).

## AC → screen

| AC | Where |
|---|---|
| AC-1, 2, 5, 7, 9, 11, 14, 72 (UI part) | S1-d stop state: same text for every stop, reference only in the mailto subject |
| AC-8, 63, 64 (UI part) | S1-c two-step, Cancel, Submit anyway; S1-b/c/d rendered from outcomes, no toast |
| AC-12, 13 | S1-b client-side (disabled submit + Edit candidate) and server `identifier_required` |
| AC-15, 16, 69, 74 (UI) | S7 `already_sent` |
| AC-17 | S2-b (pill + Info icon, neutral banner, "Workatent" actor (admin events: `detail.adminActor`), not-delivered footer, no actions, commission hidden); S6 pill with no track |
| AC-19, 20, 21 | S3 WithdrawDialog (release option only with `can_release_on_withdraw`; Back keeps reason and tick; toasts) |
| AC-22, 22a | S3b ReleaseDialog only with `can_release`; footer "Released on…" |
| AC-23, 68 (UI) | Hiring side: no release flag in the view model; standard footer |
| AC-24, 26 | Decline chips without "Already in process"; bulk hint, no callout |
| AC-25 | Legacy label + `legacyDuplicateHint` in the banner and timeline |
| AC-27, 33, 35, 47 | Entry points only from `can_claim` (callout, File objection button, revoked-panel button); window-closed error with Back; rejected chip and banners |
| AC-28, 34, 52 (display) | `BusinessDeadline` (ET, server days left) |
| AC-29, 30, 31, 65, 67 | S5 field errors, file checks before upload, picker, file states, disabled submit + reason line, upload-area deadline |
| AC-32, 37, 39, 40, 41, 42, 45 (display) | S2-d panel per side and status; contest dialog with admins-only hint |
| AC-43, 44, 48, 49 | S8 card, "same person" (referral evidence only), download on disputed claims, placement card unchanged, language hint |
| AC-50, 51 | S9 panels |
| AC-60 | Updated `candidate.consent` and `form.methodRecordedHint` |
| AC-70 | S11 hint switch, `aria-describedby`, no required marker |
| AC-59, 61, 62 | Copy verbatim; keyboard and focus as in §6; 375px checks below |

## Verified in the running app

Local Supabase only. I served the production build with `next start` on :3100, using env vars exported for that process from `supabase status`. The user's own `next dev` on :3000 was left alone. The demo seed and a few SQL fixtures were added to the **local** DB. Screenshots were taken with Playwright.

- **Composer:** S1-b (375, fr); stop S1-d (desktop; focus on the title; support line hidden without `SUPPORT_EMAIL`); pending warning S1-c (375; disabled until ticked; Cancel restores; Submit anyway creates).
- **Candidate page:** S7 `already_sent` (375, fr, focus on the h1).
- **Hiring side:** decline callout → objection form → upload of a valid PDF and a forged PDF (Ready with SHA / "can't be used"); submit disabled, then enabled after Remove; validation errors.
- **Objection panel:** both sides (desktop; 375 dark fr). SHA wraps; no file name on the sourcing side.
- **Sourcing side:** sent chip (375 dark pt); contest dialog (hint linked) → "Contested on…"; withdraw dialog steps 1 and 2 (Back keeps reason and tick), withdraw toast; release later 2 steps → footer "Released on…", button gone.
- **Hiring-side privacy:** no release text in the rendered page; standard footer.
- **Admin:** disputes card (file evidence, download, resolve-by); reject → hiring-side chip, banner, no callout, no File objection button.
- **Other screens:** admin overview panels; job form hint (375, fr).
- **Not visually checked:** the "same person" block with live data (no referral-evidence dispute in the demo data); the picker with options; the claim-window-closed error; uphold.
- **375px overflow:** fixed in the review round below.

## Review round (design-review.md, copy-review.md · 2026-11-15)

**Blocking:**
- **B-1 (AC-49).** The language hint matches the org locale on its language part (`fr-CA` → Français). It's hidden only when both orgs have no locale.
- **B-2 (AC-62).** Below `sm`, these controls are now ≥ 44px: objection-form footer and window-closed Back; withdraw and release footers at both steps; `ConfirmDialog` buttons (contest, admin resolution, every other use); claim-panel Copy SHA-256 and Download (`size-11 sm:size-10`); S1-c Cancel; admin Download and Try again; the Hide client row; the objection date input. Desktop sizes are unchanged.
- **B-2, dialog close button.** The shared `DialogContent` close X has a 44×44 hit area below `sm` (32px from `sm` up). Its label is localized with `common.actions.close`.
- **B-3 (AC-62).** The cause was page-root `grid` containers with an implicit `auto` column. Such a column grows to its children's min-content, and the sticky header's truncated `h1` counts at full width. The fix gives those grids `grid-cols-[minmax(0,1fr)]`, on these pages:
  - composer page root and form;
  - new-job flow root, inner grid and import panel; edit-job root; job form;
  - referral page root, inner columns and aside;
  - admin overview root and inner grids.

  The composer view toggle may wrap. The existing "Suggest requirements" button on the job form wraps too: it was the fr overflow.
- **B-4.** The `BusinessDeadline` date can wrap, and "· N days left" stays together. Confirmed in pt at 375px in the S5 header: "sex., 20 de nov., 23:59 (horário de Toronto) · 5 dias úteis restantes" wraps without overflow.

**Polish:**
- `SubmitButton`: pending always disables, even when a `disabled` prop is passed (no double submit).
- Inline validation instead of silently disabled buttons (AC-40), using existing keys only:
  - contest: `referrals.validation.contestReason`;
  - withdraw and Continue: `referrals.validation.addNote`, the same message as the server's;
  - admin resolution: `admin.validation.resolution`;
  - mechanism: new `ConfirmDialog` prop `reasonTooShort`.
- AC-61 focus:
  - S1-c Cancel → Submit candidate;
  - S3 / S3b Back → the step-1 title;
  - S4 File objection → "Back to decline reasons", and Back → the callout button;
  - S5 Try again → the row's Cancel upload button;
  - S5 field errors → the file button or the first picker option (the picker error is now linked with `aria-describedby`).
- Error states use existing keys (`errors.generic`):
  - S9 flags: no longer a false "No organizations flagged.";
  - S9 metrics;
  - S8 card when `get_referral_dispute` fails or returns not found: minimal card with the type badge and an error line, never dropped.
- Copy review:
  - P6: new key `referrals.claim.file.retryOrRemove`, shown when only failed uploads block submit.
  - P7: an upload refused with `claim_window_closed` marks the row "can't be used" (no Try again) and shows "Back to decline reasons".
  - P8: new key `admin.disputes.quote` for the note, the contest reason and the closed-list quotes. fr uses « » with U+00A0.
  - P9: new keys `admin.disputes.claim.flagReleased` and `.flagUpheld`.
  - All new keys use the copy-review text verbatim in en/fr/pt.
- Uploading rows have `aria-busy`. Their "Uploading…" is announced through the separate sr-only live region, with the file name, so `aria-busy` doesn't swallow the announcement.
- S2-b: a neutral stopped marker (`Info`, muted) for `already_presented` on the progress track.
- S8 history: outcome pills use `Check` (upheld) and `RotateCcw` (rejected). Flag lines have an `Info` icon.

**Verified (local Supabase only, production build on :3100 via the wrapper, Playwright, 375px):**
- 0px horizontal overflow in en, fr and pt on: composer, job form (new), referral page on both sides, received queue with the panel open, sent list, admin disputes.
- Objection dialog in pt, fr (dark) and en: no element wider than the dialog; close button 44×44 with label "Fechar" / "Fermer" / "Close". The remaining controls under 44px are radios and checkboxes inside ≥ 44px label rows.
- Hiring-side action bar (pt, dark): full-width buttons in rank order, 44px tall.
- The local DB had been reset in the meantime, so I re-seeded demo data (local only).

**QA F-3 (composer, 4px at 375px):** the composer's two inner columns (profile and aside) were grids with an implicit `auto` track, so long names in the view toggle and cards widened them. Both now use `grid-cols-[minmax(0,1fr)]`. Result: `tests/e2e/review-regression.spec.ts` ("composer and admin overview") passes against the local build on :3100, and the demo composer measures 0px overflow at 375px in en/fr/pt.

**Still open:**
- `/admin` overflows by 26px at 375px. The cause is the existing "Newest organizations" panel, which N1 didn't touch; the N1 panels fit. S9 isn't listed in AC-62.
- Polish items 11 (same-named orgs in flags), 14 ("Resolve by" without days left, a backend gap) and 17 (32px targets on desktop) aren't done.

## Backend contract gaps (reported, not changed)

1. ✅ **Fixed (migration `20261113000800_presentation_contract_fixes.sql` + `fileClaimRpcArgs`, see backend.md). Was blocking: `fileClaim` always failed.** It passes `undefined` for `p_evidence_referral` (file path) or `p_prior_process_date` (referral path). JSON drops those keys, and PostgREST then can't find `file_prior_presentation_claim(...)` because the RPC has no defaults. Log: "Could not find the function public.file_prior_presentation_claim(p_acting_org, p_attested, …) in the schema cache". The fix is to pass `null` (or give those parameters `default null`). Verified locally: the same call with nulls succeeds.
2. **Closed (AC-65 amended, PD-029).** Upload progress: indeterminate bar with "Uploading…", announced through the file list's polite live region (with the file name). No percentage; the `{percent}%` part of `claim.file.uploading` isn't rendered.
3. **Closed (brief rev. 4.2).** The picker renders what the RPC returns. It supports an optional `revoked` field, but none is required.
4. **No business days left for "Resolve by".** `ReferralDispute.dispute.resolve_by` comes without a days-left count, so the admin card shows only the date.
5. **Toast keys with missing parameters.** `referrals.success.withdrawn` now needs `{date}`, but `withdrawReferral` returns it without one. The UI builds its own toasts (withdraw, objection filed, contest). Any other caller showing the server message would print `{date}`.
6. **Done.** Admin actor: `referrals.detail.adminActor` (en/fr/pt) is used in the referral page's `who()` for `actor_kind = "admin"`; `system` keeps "Workatent".
7. **Closed (PD-030).** N1 notifications are in-app only. The `emails.*` keys stay unused, and no N1 UI text says an email was sent (closure, objection filed, dispute opened, dispute resolved).
