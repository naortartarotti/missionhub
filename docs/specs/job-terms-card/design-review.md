# Design review: Job terms card (N2)

Reviewer: Product Designer · 2026-11-15
Against: `spec.md` rev. 2 (71 active ACs, S1–S13, §3 mobile notes, §5.11, §6), `brief.md` rev. 2, `frontend.md` 5a + 5b.
Method: **code review only** (no browser or shell in this session). Pixel claims below come from the Tailwind classes and token sizes in the code. Items marked "verify" need a quick check at 375px before closing.

**Result: 4 blocking, 22 polish.** Fix the blocking items before acceptance. Polish can ship in a follow-up, but P-1, P-3 and P-10 are worth doing in the same pass.

---

## Blocking

### B-1 · Triage panel: the share amount is clipped at 375px
- **Where:** `src/features/matching/components/opportunity-card.tsx:172`
- **Spec:** AC-19, AC-70, AC-72; §6 (reflow, no clipped text); §5.11.
- **Problem:** the "Your share" `StatTile` has no `wrap`, so `StatTile` applies `truncate`. Below `lg`, `MatchDetail` renders in a sheet: three tiles in `grid-cols-3`, leaving about 80px of text width per tile. Code display makes the value longer than the old "$9,000": "~CAD 9,000", fr "~9 000 CAD", "~CAD 12,500". At 15px semibold these are about 85–95px wide, so they render as "~CAD 9,0…". The partner's key number gets an ellipsis. The Fee tile next to it already passes `wrap`.
- **Fix:** pass `wrap` to the share tile (line 172) too. Optionally drop the value to `text-sm` below `sm`. Verify in fr at 375.

### B-2 · Opportunities job card: the text share figure squeezes the job title at 375px
- **Where:** `src/app/workspace/[orgSlug]/opportunities/page.tsx:227-232`
- **Spec:** S4 (% with `share_salary` off → basis text in `text-sm`); §6 reflow; §5.11 (fr `feeShort.pctTotalCash` = 31 characters).
- **Problem:** the right-hand block is `shrink-0`, so it always takes its full single-line width. When there's no amount, it holds `share.text`. In fr that's "20 % de la rémunération globale", about 210px at `text-sm`. The header has about 295px at 375px, so the title column gets about 60px. A single word of an 18px title ("Développeur") is wider than that and spills over the share text. `text-pretty` on the `p` can't help, because its flex parent never shrinks.
- **Fix:** for the text variant, let the block shrink (`min-w-0 max-w-[45%]`, remove `shrink-0`; keep `shrink-0` only when `share.amount` is set). Or move the text figure under the meta line below `sm`. Verify fr and pt at 375 with a % job whose band is private.

### B-3 · Touch targets under 44px on controls N2 added
- **Spec:** AC-72 ("every control is ≥ 44 × 44 px"); §6 (explicitly lists the "switch row"); §3 mobile notes.
- **Where:**
  1. `src/features/jobs/components/terms-fields.tsx:374-381`: the `share_salary` `Switch` is 32 × 18px (`switch.tsx` default size). The row is a `div`, so only the switch and the label text are hit areas. The padding and the hint aren't.
     - **Fix:** make the whole row the label (wrap it in `<Label htmlFor>` or a `label`, as the attestation and "Open to partners" rows do) with `min-h-11`. Keep the switch top-aligned (§5.11).
  2. `src/app/workspace/[orgSlug]/jobs/[jobId]/page.tsx:305`: **Edit terms** is `Button size="sm"` with no `min-h-11` (about 32px). The empty-state **Add terms** two lines lower (331) has it.
     - **Fix:** add `min-h-11 sm:min-h-8`.
  3. `src/features/referrals/components/referral-terms.tsx:105`: the S6-e **Open placement** link is a standalone `text-xs` link, about 16px tall.
     - **Fix:** `inline-flex min-h-11 items-center sm:min-h-0`, or reuse the outline button already in the agreement panel.

### B-4 · Amendment confirmation: focus is lost when the dialog closes
- **Where:** `src/features/admin/components/amend-terms-form.tsx:191` (the trigger is a plain button that calls `review()`) and `:196-211` (`Dialog` with no `DialogTrigger` and no `onCloseAutoFocus`).
- **Spec:** §6 keyboard path ("Esc closes without changes. Focus returns to the trigger"); S10; this was named as a priority path for this review.
- **Problem:** the dialog is opened from state, so Radix has no trigger to return focus to. **Cancel**, Esc, and a server refusal (which closes the dialog first, line 108) all drop focus to `<body>`. A keyboard user then has to tab through the whole admin page again. For a refusal, the `requestAnimationFrame` focus at line 115 races the close animation's focus restore.
- **Fix:** keep a ref on **Record amendment**. Use `onCloseAutoFocus={(e) => { e.preventDefault(); (errorTarget ?? buttonRef.current)?.focus(); }}`, so focus goes to the first invalid field or the top message after a refusal, and to the button after Cancel or Esc.

---

## Polish

### Hire dialog (S8)
- **P-1** · `src/features/referrals/components/report-hire-dialog.tsx:84-86`. After a refused **Record hire**, focus stays on the footer button. `FormMessage` sits at the bottom of the scrolling body, and field errors can be out of view at 375. They have `role="alert"`, so screen readers hear them, but sighted keyboard and mobile users see no change.
  - **Fix:** after a failed state, focus the first `[aria-invalid="true"]` field (the job-form pattern, `job-form.tsx:109-113`), or else the `FormMessage`. Spec 2.6, §6.
- **P-2** · `report-hire-dialog.tsx:71`. `useActionState` lives at dialog level, so field errors and `FormMessage` survive closing and reopening, while the inputs (which unmount) reset. The user reopens to errors on empty fields.
  - **Fix:** key the form on an open counter, or move the action state into the content.
- **P-3** · `src/features/pipeline/components/pipeline-board.tsx:187-198`. When the dialog opens from the card menu or a drop (`trigger={null}`), focus isn't returned on close. Add `onCloseAutoFocus` pointing at the card's menu trigger. §6 ("Focus returns to the trigger"). This pattern predates N2, but N2 makes the dialog a primary path.
- **P-4** · `report-hire-dialog.tsx:240`. The reason select's empty option uses `common.none` ("—"), which reads like a value. Ask ux-writer for a "Choose a reason" placeholder key, or render an empty label. The `reasonRequired` validation stays as it is.
- **P-5** · `report-hire-dialog.tsx:244` and `amend-terms-form.tsx:165`. The character counter is appended to the hint, and `FormField` hides the hint when an error shows. The counter disappears exactly when the length is the problem (`noteTooLong`, `reasonLength`).
  - **Fix:** render the counter outside the hint/error swap.

### Referral page (S6) and pipeline
- **P-6** · `src/features/referrals/components/referral-terms.tsx:103`. The S6-e row reuses the label `jobs.terms.rows.fee` ("Placement fee"), so the same `dl` has two "Placement fee" rows, one for the basis and one for C · I. Use a distinct label, for example `commissions.detail.fee.title` ("Fee"), or ask ux-writer for a key.
- **P-7** · `src/features/pipeline/queries.ts:74-78` and `pipeline-board.tsx:332`. Legacy referrals now show no fee line on the pipeline card. Before N2 they showed the live job fee; now there's nothing and no "Terms not recorded". BR-37 says to show the legacy label wherever terms would appear.
  - **Fix:** render `jobs.terms.notRecorded` in the muted line when `feeTerms` is null.

### Composer (S5) and terms display
- **P-8** · `src/features/jobs/components/terms-summary.tsx:48,57` with `terms-display.ts:61`. When a % job's currency changes, `changedRows` flags only `currency`. The Currency row is suppressed when an estimate is on screen and no minimum is set, so the change gets no **Changed** badge anywhere.
  - **Fix:** in that case, put the badge on the Placement fee row, or force the Currency row on while `changedFrom` differs. This is an edge case of AC-24.
- **P-9** · `src/features/referrals/components/submit-referral-form.tsx:692`. `aria-labelledby` is set on the `Panel` `div`, which has no role, so it does nothing. Use `<section>` or `role="region"`.
- **P-10** · Salary-band amounts still use symbol display on N2 surfaces, next to code-display terms amounts:
  - `src/app/workspace/[orgSlug]/jobs/[jobId]/page.tsx:91-96` (S3 Compensation);
  - `src/features/matching/components/opportunity-card.tsx:134-137` (S4 triage Compensation);
  - `src/app/workspace/[orgSlug]/opportunities/[matchId]/page.tsx:45-46` (S5 job panel, directly above the Terms panel).

  The §3 money rule covers every amount on S1 and S3–S11, and the CAD/USD "$" ambiguity it targets is sharpest where the band sits next to "~CAD 20,000". Add `code: true`.
- **P-11** · `src/features/jobs/terms-display.ts:165`, `opportunity-card.tsx:133` and `opportunities/page.tsx:269`. If `fee_currency` is null, the code falls back to "CAD". If that ever happens, it would label an amount with a guessed currency. Render no amount instead (the same rule as "no amount when the server sends none").

### Job form (S1) and job page (S3)
- **P-12** · `src/features/jobs/components/terms-fields.tsx:180,320` with `job-form.tsx:111`. The "focus the first invalid field" logic can pick the `RadioGroup` root (`aria-invalid` on a `div` that can't take focus), so focus goes nowhere. That happens for server errors on `feeBasis` or `guaranteeRemedy`.
  - **Fix:** put `aria-invalid` on the checked or first `RadioGroupItem`, or focus `[role=radio][data-state=checked]` inside the group. AC-10.
- **P-13** · `terms-fields.tsx:192-222`. The `%` and currency adornments are `aria-hidden`, but the labels "Fee rate" and "Minimum fee (optional)" don't name the unit. The `currencyFollowsSalary` line isn't in either input's `aria-describedby`, so screen-reader users never hear the currency. §6 says amount inputs include the currency in the visible label.
  - **Fix:** add the currency to the minimum label (as the hire dialog does), or add the follow-salary line's id to `aria-describedby`.
- **P-14** · `jobs/[jobId]/page.tsx:301-305` with `job-form.tsx:303`. On a job closed to partners that has a version, the S3 panel still offers **Edit terms** → `/edit#terms`. The card isn't rendered while the toggle is off, so the deep link lands nowhere.
  - **Fix:** link to `/edit` for closed jobs, or have the form scroll to the toggle when `#terms` has no target.
- **P-15** · `src/components/shared/kpi-tile.tsx:47`. The icon disc has no `shrink-0`. With the Fee terms value now wrapping text, a long fr word can squeeze it. Add `shrink-0`.
- **P-16** · The S3 owner estimate box (`jobs/[jobId]/page.tsx:320-325`) shows the fee only. §3 TermsSummary says the estimate box for the owner follows S5, which includes the three shares. It's fine to keep it fee-only if that's intended. Either record the choice in `frontend.md` or add the shares.

### Placement page (S9)
- **P-17** · `src/app/workspace/[orgSlug]/commissions/[placementId]/page.tsx:157`. `aria-describedby` is set on a static `<p>`, and most screen readers ignore it there. §6 asks that the negative amount be read with its hint.
  - **Fix:** wrap the value and hint in one element with an accessible name, or add the hint as `sr-only` text next to the value.

### Admin (S10, S11)
- **P-18** · `src/app/admin/page.tsx:218`. `f.number(v ?? 0)` renders "0" if a count field comes back null or undefined. A field that's missing would read as zero, the case AC-76 rules out. Show `errors.generic` (or "—") when either field isn't a number.
- **P-19** · `src/app/admin/page.tsx:207-225`. Spec S11 puts `overview.privacyNote` in the terms panel footer. It's only on the neighbouring panel.
- **P-20** · `src/features/admin/components/amend-terms-form.tsx:29,158`. When an amendment switches the basis from flat to %, the % currency becomes the flat currency (`effective.currency`), which may not be the job's salary currency (BR-1 T4). The server decides. This is a question for PM and backend, not a UI fix (see the open question below).

### Shared and system-wide (not introduced by N2)
- **P-21** · `src/components/ui/input.tsx:10` and `src/components/shared/native-select.tsx:11`. Inputs and selects are 40px tall. Labels extend the hit area, so this is acceptable in practice, but strictly it misses AC-72's 44px. Track it as a design-system item rather than N2.
- **P-22** · Copy hand-off: `commissions.kpi.owed` "You owe partners" (`src/i18n/messages/en/commissions.json:11`) sits on the same page as signed, possibly negative, N2 shares. The voice rule for N2 bans "owe". It's a string from before N2; route it to ux-writer `copy-review.md`. Also `DialogTitle` uses `leading-none` (`src/components/ui/dialog.tsx:131`), which makes the wrapping question title in S7 (fr "Confirmer l'entente de collaboration?") look cramped. Override with `leading-snug` in `referral-terms.tsx:178`.

---

## Checked and passing (no action)

| Area | Result | Ref |
|---|---|---|
| Neutral treatment of negative shares and fee differences | Pass. Difference row and callout are `bg-muted/50` + `Info`, with no warning or danger tone. Negative tile is the normal foreground colour. Ledger keeps a negative `allocation` unmuted. The hire dialog's difference box is muted. | `commissions/[placementId]/page.tsx:98-122,157,233`; `report-hire-dialog.tsx:226-231` |
| No screen implies MissionHub moves money | Pass. No N2 string says MissionHub pays, sends or holds money. `network.payout` and `negativeTarget` say "directly". | en `jobs.json`, `commissions.json`, `referrals.json` |
| Partner never sees salary-derived estimates when `share_salary` is off | Pass in the UI. Every partner figure reads the server's `estimated_*` fields with no client computation. A null shows the basis text or `estimateHidden`. The referral page uses only the frozen estimate (by design, BR-36). | `terms-display.ts:160-172`; `submit-referral-form.tsx:665-690`; `referral-terms.tsx:35-47` |
| Legacy "Terms not recorded" | Pass on the referral page (S6-d), agreement dialog, hire dialog (alert title), placement Fee panel, sent list and admin (`blockedLegacy`). Missing on the pipeline card (P-7). | `referral-terms.tsx:57-65,201`; `report-hire-dialog.tsx:267-271`; `commissions/[placementId]/page.tsx:48-55`; `referrals/page.tsx:446-450` |
| Currency codes on N2 amounts | Pass for every terms, estimate, share, fee, difference, KPI and ledger amount (`code: true`, `signed` for differences, tilde on estimates). Salary bands are the exception (P-10). | `format.ts:11-16,68-69` |
| S5-e `terms_changed` | Pass. `role="alert"`, `tabIndex=-1`, focus and `scrollIntoView` (respects reduced motion). The tick is reset and S1-c replaced. The button reads "Submit under new terms". The hidden `termsVersionId` is swapped. Field state is kept (`ActionForm` doesn't reset). | `submit-referral-form.tsx:149-169,473-530` |
| Agreement dialog (S7) | Pass. Focus starts on the title and returns to the trigger. Errors are inline (`role="alert"`) and the dialog stays open. Footer stacks primary-on-top below `sm` (`flex-col-reverse`), at 44px. | `referral-terms.tsx:159-232` |
| Hire result box | Pass. `role="status" aria-live="polite"`. It sits above the difference fields. Unticking clears the fields and returns focus to the checkbox. Amount labels carry the currency. Terms are text, not disabled inputs. | `report-hire-dialog.tsx:142-211` |
| Nudge chips (S2) | Pass. `whitespace-normal text-pretty`, no truncate, icon `shrink-0` and top-aligned. | `jobs/page.tsx:104-110` |
| Fee terms KPI (S3) | Pass. `text-lg` below `sm`, wraps (`text-pretty break-words`), recorded in `frontend.md`. | `jobs/[jobId]/page.tsx:183-189` |
| Record amendment buttons (S10) | Pass. `w-full sm:w-auto`, `min-h-11`, confirm dialog primary on top below `sm`. | `amend-terms-form.tsx:191,205-209` |
| Ownership footer (AC-37, AC-74) | Pass. A date shows only when `delivered_at` and `ownership_protected_until` are both set. `awaiting_candidate` shows `ownershipStartsAtDelivery` with T9 (or 12). | `referrals/[referralId]/page.tsx:686-696` |
| Job form keyboard order (§6) | Pass. Basis → rate → minimum (or flat → currency) → search → guarantee → remedy → payment → window → switch → attestation. `#terms` focuses the heading. Option cards and remedy rows are `min-h-11`. | `terms-fields.tsx` |
| Objection dialog (S12) | Pass. `min` from the server bound, window sentence for snapshot referrals only, `priorDateTooOld` with `{count}`. | `claim-dialog.tsx:95,262,404,417` |

## Not verifiable from code (carry to QA)
- Real overflow at 375 for B-1 and B-2 (the CSS math is strong, but measure it).
- Legacy variants that `frontend.md` couldn't seed: the legacy hire alert, the legacy Fee panel, and the legacy agreement dialog.
- The I > C callout, the `frozen` platform-basis line, and ledger rows after a verified payment.

## Open question for PM (not decided here)
- **Q-R1 (from P-20):** when an admin amendment changes the basis from flat to %, should the % currency be the job's **current salary currency** or the referral's original currency? BR-1 T4 says % follows the salary currency, but an amendment is referral-scoped and the job's salary currency may have changed since the snapshot. Backend's validation decides today. The UI currently assumes the snapshot currency.
