# Design review: duplicate and prior-presentation protection (N1)

Reviewer: Product Designer · 2026-11-15
Compared against: `spec.md` (rev. 4.2: S1–S11, §3 mobile notes, §5.11, §6, AC-1 to AC-76), `brief.md` rev. 4.2, `frontend.md`.
Method: **code review plus the frontend's screenshots.** I didn't run the app, because no shell or browser was available in this session, so nothing here is a live keyboard or viewport run. Measurements marked "estimated" are worked out from Tailwind classes and string lengths, not taken from a screenshot.

Priority areas, as requested: AC-61 (keyboard), AC-62 (375px, light and dark), AC-49 to AC-51 (admin overview and dispute card), AC-70 (job-form hint).

## Summary

| Area | Result |
|---|---|
| AC-49 language hint | **Blocking.** It always shows "—" for both orgs. |
| AC-50 / AC-51 admin panels | Render as specified. Polish only: there is no error state. |
| AC-61 keyboard paths | Every path in the AC can be finished with the keyboard alone, with no traps. Focus is lost in five places (polish). |
| AC-62 375px | **Blocking.** Touch targets are under 44px, two N1 pages scroll sideways, and the pt deadline probably overflows. |
| AC-70 job-form hint | Passes code review: the hint switches, `aria-describedby` follows it, there's no required marker and no key wording. One touch-target item is listed under B-2. |
| Hiring-side privacy (release, who presented first, contest reason) | **Passes in the UI.** The target view model has no release field. The target `ownership_state` never comes from `released` (migration `20261113000500` lines 422 and 452–455). `ClaimPanel` never renders the dispute reason. The footer keeps the standard line (`referrals/[referralId]/page.tsx:667-674`). QA's B-2 (a picker leak in the backend) isn't a UI issue and isn't re-reviewed here. |
| States (loading / empty / error / success / disabled / pending) | All present on S1, S2-d, S3, S3b, S5, S7 and the S8 "same person" block. Missing: the S9 error state and the S8 card when the RPC returns `not_found` (polish). |

---

## Blocking

### B-1 · AC-49: the language hint always shows "—" for both organizations
- `src/app/admin/disputes/page.tsx:112`: `lang()` accepts only `isLocale(l)`, which is `"en" | "fr" | "pt"` (`src/i18n/config.ts:14`).
- `organizations.locale` holds BCP 47 tags, with default `'en-CA'` (`supabase/migrations/20261107000100_foundation.sql:92`). The RPC passes them through unchanged (`20261113000600_referral_disputes.sql:141-142`).
- Result: the hint reads "Languages: Demo · Northern Talent Partners · —, Demo · Lakeshore Search · —" (screenshot `s8-admin.png`). The condition at `page.tsx:136` is also always true, so the broken line shows on every card.
- AC-49 requires each org's preferred language. The fix is to map by language prefix (`fr-CA` → `fr`), or to use `Intl.DisplayNames` on the full tag. Keep the line hidden only when both locales are missing.

### B-2 · AC-62 / §6: N1 controls are under 44 × 44px at 375px
`Button` `default` is `h-10` (40px), `icon` is `size-10` (40px) and `sm` is `h-8` (32px) (`src/components/ui/button.tsx:23-29`). AC-62 says "every interactive element is ≥ 44 × 44 px", and §3's mobile notes name the copy button explicitly. These N1 controls fall short on mobile:
- S5 footer, **Decline and file objection** and **Cancel**: `src/features/referrals/components/claim-dialog.tsx:440`, `:444`. The window-closed **Back to decline reasons** button: `:292` (`size="sm"`, no `min-h-11`).
- S3 / S3b footers, at both steps: `src/features/referrals/components/release-dialogs.tsx:109`, `:111`, `:113`, `:127-129`, `:179-180`, `:191-193`.
- Contest dialog and admin resolution dialogs: `src/components/shared/confirm-dialog.tsx:101`, `:104`.
- S2-d **Copy SHA-256** and **Download**: `src/features/referrals/components/claim-panel.tsx:143-146`, `:170-173` (`size="icon"`, 40px). The spec says the copy button stays 44 × 44.
- S1-c **Cancel** (ghost, default height): `src/features/referrals/components/submit-referral-form.tsx:461-464`.
- S8 admin **Download** and the "same person" **Try again**: `src/features/admin/components/referral-dispute-controls.tsx:57-60`, `:115`.
- S11 **Hide client** checkbox row: no minimum height below `sm`, so the hit area is about 20px (`src/features/jobs/components/job-form.tsx:171`).
- The dialog close **X** in every N1 dialog is about 16px plus padding (`src/components/ui/dialog.tsx:71-77`). This is shared shadcn code, but it ships in every N1 dialog.

The S5 file rows (`claim-dialog.tsx:497`, `size-11`) and the action-bar triggers (`min-h-11 … sm:min-h-0`) already do this correctly. Apply the same `min-h-11 sm:min-h-*` pattern to the list above. For the icon buttons, use `size-11`.

### B-3 · AC-62: the composer (S1) and job form (S11) scroll sideways at 375px
- `frontend.md:82` reports horizontal overflow at 375px on both pages, caused by the page header and the composer's view toggle (`submit-referral-form.tsx:179-193`).
- The cause predates N1, but AC-62 requires "no horizontal scroll" on S1-b/c/d and S11, so the AC fails as written.
- Fix the overflow (let the header actions and the toggle wrap or shrink). Alternatively, the PM can formally carve the page chrome out of AC-62. Silently passing it isn't an option.

### B-4 · AC-62 / §3 mobile notes: the `BusinessDeadline` date can't wrap and probably overflows in pt-BR (estimated; verify)
- `src/features/referrals/components/business-deadline.tsx:26` wraps the whole "{when} ET" segment in `whitespace-nowrap`.
- In pt, `deadline.at` is "{when} (horário de Toronto)". With the weekday format that's about 44 characters ("sex., 20 de nov., 23:59 (horário de Toronto)"), roughly 300px at `text-sm`.
- The space available at 375px is about 271px: viewport, minus page padding, minus `Panel p-6`, minus the icon and gap. This applies to the S2-d contest deadline (`claim-panel.tsx:98`) and the S5 header (`claim-dialog.tsx:286`).
- The fr screenshot fits ("ven. 27 nov., 23 h 59 HE"), but there's no pt screenshot of this line.
- §3 says the component wraps between the date and the days left, with no truncation. AC-62 says strings wrap.
- Fix: keep the wrap point at " · ", but allow the date segment itself to wrap (drop `whitespace-nowrap` on the first span, or apply it to the time part only). Downgrade this finding if a pt screenshot at 375px shows it fits.

---

## Polish

1. **S1 Loading: the submit button stays clickable while pending.** `SubmitButton` spreads `{...props}` after its own `disabled` (`src/components/shared/submit-button.tsx:16`). N1 now always passes `disabled={noIdentifier}` or `disabled={!acknowledged}` (`submit-referral-form.tsx:474`, `:458`), so `pending` no longer disables the button. A double click sends two submissions, and both count toward the 30/h limit. The idempotency key prevents a duplicate referral. Fix: `disabled={pending || props.disabled}` after the spread.
2. **AC-61 / S1-c: Cancel drops focus.** The Cancel button unmounts and focus falls to `<body>`, at the top of a very long composer (`submit-referral-form.tsx:465-468`). Move focus to **Submit candidate**.
3. **AC-61 / S3, S3b: Back drops focus.** `useStepFocus` only focuses for step > 1 (`release-dialogs.tsx:15-21`), so **Back** (`:127`, `:191`) leaves focus on the dialog container. Focus the step-1 title, or the release checkbox in S3.
4. **AC-61 / S4: the decline ↔ objection swap drops focus.** **File objection** and **Back to decline reasons** both unmount or hide the focused control (`src/features/referrals/components/review-queue.tsx:527-535`). Focus the S5 title (or the Back link) on entry, and the callout button on return.
5. **AC-61 / S5: Try again drops focus.** The button disappears when the row returns to Uploading (`claim-dialog.tsx:196-200`, `:490-492`). Move focus to the row's Cancel upload button.
6. **§6 / S5: the field-error focus target isn't focusable.** On a submit with an error, focus goes to `evidenceGroup`, which is the RadioGroup root with no tabindex (`claim-dialog.tsx:238`, `:301`). On the referral path with nothing picked, focus therefore doesn't move, and the target would be the evidence-type group, not the picker. The picker error isn't linked with `aria-describedby` (`:389`, `:405`). Focus the first picker radio, and link the error.
7. **AC-40 / §6: minimum-length rules block silently.** **Contest objection** stays disabled until 5 characters with no visible reason (`src/components/shared/confirm-dialog.tsx:106`). The same happens with **Withdraw** / **Continue** until a reason is entered (`release-dialogs.tsx:111`, `:113`). AC-40 says a short reason "is refused inline". Validate on submit with a field error, as S5 does.
8. **S5 table: the Uploading row lacks `aria-busy="true"`** (`claim-dialog.tsx:458`, `:505`).
9. **AC-50 / S9: an error shows as the empty state.** `getAbuseFlags(...).catch(() => null)` then renders "No organizations flagged." (`src/app/admin/page.tsx:35`, `:166-167`), which is a false all-clear. Show a short "Couldn't load flags" line instead.
10. **AC-51 / S9: the metrics error shows a bare "—"** (`admin/page.tsx:34`, `:198-200`). Add a one-line error message.
11. **AC-50 / S9: same-named organizations can't be told apart.** `s9-panels.png` shows four "N1 Agency A" rows (test fixtures). The rows carry no second identifier (`admin/page.tsx:173-177`). Add a muted line with the kind or created date, as the "Newest organizations" panel does.
12. **S8: a dispute card disappears silently.** When `get_referral_dispute` returns `not_found`, the card is dropped (`src/app/admin/disputes/page.tsx:48-52`, `src/features/admin/queries.ts:79`), but the dispute still counts in the sidebar and overview. Render a minimal card with the type badge and an error line.
13. **S8 History / S2-d status table: wrong pill icons.** The outcome pills use the StatusPill tone defaults (a minus sign and a dot) instead of `Check` (upheld) and `RotateCcw` (rejected) (`disputes/page.tsx:89`). The `ReferralColumn` flag line has no icon either (`:226`).
14. **S8 "Resolve by": no business days left.** It shows the date only, without `BusinessDeadline` and days left (`disputes/page.tsx:126-131`). This is a known backend gap (`frontend.md:89`).
15. **S2-b: the stopped marker is red.** For `already_presented`, the progress track's stopped marker uses `bg-danger` with an X (`referrals/[referralId]/page.tsx:353-356`). S2-b asks for a neutral tone, because this isn't the user's error. Use neutral for this status.
16. **§6 / i18n: the dialog close label is English only.** The close button's screen-reader label is hard-coded "Close" (`src/components/ui/dialog.tsx:76`), so fr and pt screen-reader users hear English in every N1 dialog.
17. **§6, desktop: some targets are 32px at `sm` and up.** **Edit candidate** (`submit-referral-form.tsx:367`), the objection callout **File objection** (`review-queue.tsx:561`), **Open earlier referral** (`claim-panel.tsx:71`) and **Uphold** / **Reject objection** (`referral-dispute-controls.tsx:25`, `:36`) use `sm:min-h-8`. §6 asks for ≥ 44px everywhere. AC-62 covers 375px only, hence polish.

---

## Checked and fine (no finding)
- **S1:** outcomes render in the panel, not as toasts, and `FormMessage` is used only for `ok:false`. The pending alert has `role="alert"` and receives focus. The S1-d neutral `Info` alert focuses its title. The support line is hidden without an address. The `mailto:` has a subject and no body. Every N1 `AlertTitle` overrides `line-clamp-1` (fr title wraps in `s1c-mobile.png`).
- **S3 / S3b:** the release option is absent, not disabled, when the guards fail (`referral-actions.tsx:80`, `page.tsx:398`). Back keeps the reason and the tick. `release_not_allowed` shows inline, and closing refreshes the page.
- **S5:** upload on select, polling every 2s, all five row states, Remove focusing the next row, the reason line linked to the disabled submit, a two-button footer with Back as a top link, the window-closed error with Back, and the picker rendering the RPC list as-is.
- **S6:** the chip wraps and drops the weekday (`referrals/page.tsx:408-410`).
- **S7:** `already_sent` with a muted icon, no buttons and focus on the `h1`.
- **S8:** the "same person" block appears on referral evidence only, shows pills only, and has a skeleton and a retry. Downloads appear on disputed claims only.
- **S11 / AC-70:** the hint switches on the client, the `EyeOff` icon shows on the internal hint, `aria-describedby="clientName-hint"` points to the visible hint, there's no required marker when the client is hidden, and the fr hint wraps under the input at 375px (`s11-jobform.png`).
- **AC-61:** every listed path (S1-c, withdraw-and-release, release later, file objection, referral-evidence objection, contest) can be finished with the keyboard alone, with no keyboard traps. The remaining issues are focus placement after some transitions (polish 2–6).
