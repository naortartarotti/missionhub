# Frontend: Job terms card (N2)

Owner: Frontend Engineer · Date: 2026-11-15 · Built against `backend.md` v1 (drop 1), `spec.md` (copy final), `brief.md` rev. 2.

## 5a: drop-1 surfaces

Not in 5a: the hire dialog (S8), the placement Fee panel and commissions list (S9), and the admin amendment and terms-counts pages (S10, S11). They're in the 5b section below, built against `backend.md` v2.

### Routes touched (no new routes)

| Route | Change | Spec |
|---|---|---|
| `/workspace/[orgSlug]/jobs/new` | The terms card replaces `CommissionFields`. Defaults to BR-1, with `share_salary` on | S1, 2.1 |
| `/workspace/[orgSlug]/jobs/[jobId]/edit` | Card prefilled from `getJobsTermsState`. `#terms` focuses the card heading | S1, 2.1 |
| `/workspace/[orgSlug]/jobs` | Nudge chips (a/b/c) and the `listBanner` count | S2, 2.2 |
| `/workspace/[orgSlug]/jobs/[jobId]` | "Hidden from partners" banner with the CTA by reason, a Fee terms KPI, a "Terms for partners" panel and the "What partners see" row | S3, 2.2 |
| `/workspace/[orgSlug]/opportunities` | Share figure by basis, "Terms updated" chip, Highest-earnings sort | S4 |
| `/workspace/[orgSlug]/opportunities/[matchId]` | "Terms for this job" panel, the terms line, `termsVersionId`, and S5-e `terms_changed` | S5, 2.3 |
| `/workspace/[orgSlug]/referrals/[referralId]` | Terms panel (both sides), `AgreementDialog`, `pendingSnapshot` copy, ownership footer | S6, S7, 2.4, 2.5 |
| `/workspace/[orgSlug]/referrals?tab=sent` | One muted line per referral: short basis, or "Terms not recorded". No share | S6, 2.4.6 |
| Objection dialog (referral page and review queue) | Look-back bound from the server, window hint, `priorDateTooOld` `{count}` | S12, 2.9 |

### Components and modules

| File | What |
|---|---|
| `src/i18n/format.ts` | `f.money(minor, cur, { code, approx, whole })`. `code` uses Intl `currencyDisplay: "code"`; `approx` adds a leading `~`. Also new: `f.percent(bps)` (Intl percent, up to 2 decimals). Every N2 amount uses `code: true` |
| `src/features/jobs/terms-display.ts` | `TermsView` / `SplitView`, adapters from the contract (`termsFromState`, `termsFromPartner`, `termsFromRow`, `splitFromPartner`), `feeShort`, `feeLong`, `shareAtHire`, `changedRows` (Changed badges), `shareFigure` (S4), `compareEarnings` (AC-22) |
| `src/features/jobs/nudge.ts` | `hiddenReasonOf` (only `no_terms`, `not_permanent`, `currency_mismatch`) and the chip keys |
| `src/features/jobs/terms-context.ts` | Server only. `getDefaultRule` (T10 name, version, bps) and `getJobTermsContext` (owner row + form context) |
| `src/features/jobs/components/terms-fields.tsx` | **New** `TermsFields` (S1). Posts the backend.md §4.1 FormData names |
| `src/features/jobs/components/terms-summary.tsx` | **New** `TermsSummary` (variants `owner`, `partner`, `referral`, `compact`; `admin` is reserved for 5b), `Row`, `NetworkRules` (expanded, or `collapsible`) |
| `src/features/referrals/components/referral-terms.tsx` | **New** `ReferralTermsPanel` (S6), `ExpectedShareRow`, `AgreementDialog` (S7) |
| `src/features/jobs/components/job-form.tsx` | Placement fee panel removed, `shareFee` removed, Compensation checkbox moved to the card's Switch. Contract type is now controlled, with the `permanentOnly` warning under the toggle. Focus moves to the first invalid field after a refused save. When the job is closed, hidden inputs keep the `share_*` choices |
| `src/features/jobs/components/commission-fields.tsx` | **Deleted** (replaced by `TermsFields`) |
| `src/features/referrals/components/submit-referral-form.tsx` | `PartnerTermsPanel`, hidden `termsVersionId`, terms lines, S5-e alert and button label |
| `src/features/referrals/components/referral-actions.tsx` | `ConfirmAgreementButton` removed (replaced by `AgreementDialog`) |
| `src/features/referrals/components/claim-dialog.tsx`, `claim-context.ts` | `ClaimContext` gains `lookbackMonths`, `priorDateMin` and `snapshot`. `priorDateRange(deliveredAt, months, serverMin)` is exported |
| `src/components/shared/kpi-tile.tsx`, `stat-tile.tsx` | Optional `valueClassName` (KPI) and `wrap` (StatTile) so text values wrap instead of being clipped |
| `matching/components/opportunity-card.tsx`, `job-match-row.tsx`, `overview/components/best-opportunities.tsx`, `opportunities/page.tsx` | S4 share figures with currency codes. No amount when the server sends none |

### Decisions recorded here, as the spec asks

- **`terms_changed` keeps the form state without a reload.** The action returns the current card (`PartnerTerms`). The form swaps it in and keeps the old card as `previous` for the Changed badges. It also resets N1's acknowledgement tick and posts the new `terms_version_id`. Fields, documents, authorization method, note and idempotency key stay as they were (React state; `ActionForm` doesn't reset). The alert takes focus and scrolls into view through the existing N1 result effect.
- **Fee terms KPI (S3):** the tile stays 2-up. The value renders at `text-lg` below `sm`, `text-2xl` up to `xl` and `text-3xl` above, and wraps (`text-pretty break-words`). No `col-span` change.
- **Nudge scope:** chips and the banner count apply to **active** referral-open jobs only. Drafts and closed jobs aren't "hidden" (spec 2.2). The banner count covers every active open job of the org, whatever the list filters.
- **Opening a never-open job** switches `share_salary` on only if the job had no version and was closed when the form loaded (BR-10, PD-047). New jobs default to on.
- **Composer estimate box on internal jobs:** `get_opportunities` sends no share for internal jobs, so the box is omitted. The rest of the card renders as usual.
- **Client row (partner variant):** `listOpportunities` already localizes the SQL placeholder `"Confidential client"`. Either form renders `jobs.terms.clientConfidential`.
- **Ownership footer:** a date shows only when `delivered_at` and `ownership_protected_until` are both set. `awaiting_candidate` shows `ownershipStartsAtDelivery` with `{count}` = the effective T9, or 12 for legacy referrals. Other undelivered states show the existing `ownershipNotDelivered`. N1 states (released, ended, already presented) are unchanged.
- **Forms** follow the neighbouring job-form pattern (`useActionState` + `ActionForm`, server-side `jobFormSchema`), not react-hook-form. Field errors arrive from the same Zod schema.

### i18n

All 268 §5 keys were added verbatim in en, fr and pt. They were parsed from the spec tables by a script, with U+00A0 before `:` and inside « » in fr; plurals use `{one, other}`. 247 keys are new, 19 were already identical (the backend's `errors.*` and `jobs.validation.*`), and 2 changed:
- `referrals.agreement.title` (now a question);
- `referrals.claim.validation.priorDateTooOld` (now a plural with `{count}`).

`errors.terms_not_recorded` (fr) gained the missing non-breaking space. The §5.7 commissions and §5.8 admin keys are in place for 5b. `messages.test.ts` (same keys and placeholders in all locales) passes.

Keys used in 5a:
- `labels.feeBasis.*`, `labels.searchType.*`, `labels.guaranteeRemedy.*`;
- `jobs.terms.*`, `jobs.form.terms.*`, `jobs.nudge.*`;
- `jobs.detail.{feeTerms,termsTitle,termsEmpty,editTerms,visible.terms}`;
- `opportunities.jobGroup.{shareIfHired,shareEstimated,feeOnly}`;
- `referrals.form.{termsLine,termsLineConfirm}`, `referrals.termsChanged.*`;
- `referrals.detail.{terms.title,ownershipStartsAtDelivery,agreement.pendingSnapshot}`;
- `referrals.agreement.{title,descriptionSnapshot}`;
- `referrals.claim.{priorDateWindowHint,validation.priorDateTooOld}`.

### AC coverage (5a screens)

| AC | Where | Status |
|---|---|---|
| AC-1 | S1 defaults; T10 as text with rule name and version | Built |
| AC-2 to AC-6 | S1 fields; refusals come from `jobFormSchema` (backend) shown inline; T3 not rendered on flat; no remedy group at None; window 6–12 select | Built (UI side) |
| AC-7 | Attestation re-ticked per new version, "Required to publish" marker, "Last confirmed by {name} on {date}" | Built |
| AC-8, AC-13 | Client diff (`termsDiffer`) drives `willPublish` and `existingReferrals {count}` | Built |
| AC-10 | Field errors and summary, focus on the first invalid field; `permanentOnly` warning under the toggle with `aria-describedby` on contract type | Built |
| AC-11 | `share_salary` behaviour | Built |
| AC-12 | No placement-fee toggle; "What partners see" has the "Terms for partners" row and no fee row | Built |
| AC-15, AC-75 | Chips, banner, job-page banner (a/b/c) with CTAs for `jobs:write` holders only | Built (b and c checked visually; (a) can't be seeded, see below) |
| AC-17 | Owner list keeps hidden jobs, with the nudge | Built |
| AC-18 to AC-21 | Composer card, estimate gating, flat share, minimum fee, "Terms updated" chip (S4 and S5) | Built |
| AC-22 | `compareEarnings` (unit-tested) | Built |
| AC-23 | Terms line plus the confirm-path line | Built |
| AC-24, AC-25 | S5-e, Changed badges, "Submit under new terms", tick reset | Built; AC-24 exercised end to end |
| AC-26 | Same S5-e for any id (server behaviour) | UI ready |
| AC-34 | `AgreementDialog` shows the same terms, split and expected share; legacy variant shows the split + "Terms not recorded" | Built |
| AC-37, AC-74 | Ownership footer never shows a date before delivery | Built |
| AC-38 | `min` and validation from `claim_prior_date_min` / `lookback_months`; window sentence for snapshot referrals only | Built (unit-tested; not exercised in the browser) |
| AC-63 | Expected share: exact on flat, `~` on % with an estimate, `shareAtHire.*` without one, both sides; sent list shows `feeShort` or "Terms not recorded" | Built |
| AC-64 | "This job's terms are now version {m}" | Built in 5b (see below) |
| AC-65 | Referral page, agreement dialog | Built; hire dialog and placement page in 5b |
| AC-69, AC-70 | Structured fields in 3 locales; currency codes on every 5a amount | Built on 5a surfaces |
| AC-72 | 375px reflow, ≥ 44px targets, radio groups and selects, `dl` text, S5-e focus, fr chips and KPI wrap | Checked for 5a surfaces (see below) |

### Visual check (local stack only, `next start -p 3107` through the guarded wrapper, stopped afterwards)

- Local demo seed, plus local-only variants: `share_salary` on, a flat CAD 15,000 v2, a contract job and a USD-salary job with CAD terms.
- **Owner pages** (jobs list, job page for the currency-mismatch, % and flat jobs, edit `#terms`, new job), at en light 1280, fr dark 375, pt light 375, fr light 1280 and en dark 375: horizontal overflow 0 on all 30 captures. The fr chips wrap to 2 lines.
- **Partner pages:**
  - opportunities (en, fr, pt);
  - the composer for the estimate, flat and hidden-band jobs (en light 1280, fr dark 375, pt light 375);
  - `terms_changed`: v3 published while the composer was open; focus landed on `#terms-changed`, the Changed badges showed, and the resubmit created the referral with an 8-month ownership date;
  - the referral page on both sides;
  - the agreement dialog in en, fr and pt (focus on the title);
  - the sent list.
- **Overflow found that 5a didn't introduce:**
  - composer at 375: 43px when the candidate email is long (Contact row "Hidden" pill);
  - referral page at 375: fr 18px, pt 33px from the "Open candidate" button and agreement status pill in the section titles.
- **Not checked visually:**
  - nudge reason (a) `no_terms`: the referral-flag guard refuses to create an open job without a card, even through the service role;
  - the objection dialog;
  - a legacy referral's Terms panel;
  - an amended referral (v2).

### Contract gaps and notes for the next steps (as of 5a; items 1–4 and 6 are resolved in 5b)

1. **AC-64 / spec 2.4.3:** there is no newer-job-version number for the referral page in v1 (backend.md §4.4 says v2).
2. **T10 name and version on the job form:** no drop-1 query returned the default rule's name and version, so `getDefaultRule` (in `terms-context.ts`) reads `commission_rules` through RLS, like `getActiveSplit`. Backend may want to move it into `commissions/queries.ts`.
3. **Presentation type:** `get_referral_presentation` returns `lookback_months` and `claim_prior_date_min`, but the TS types in `referrals/queries.ts` don't declare them yet. `claim-context.ts` reads them with a local type widening; backend can add them to `PresentationBase`. `ownership_protected_until` there is also nullable now.
4. **S6-e** (placement exists: computed vs invoiced) needs v2 placement fields; it's left to 5b.
5. **E2E (QA-owned):** `tests/e2e/review-regression.spec.ts` publishes a new job without filling the card. It will now get the BR-6 refusal and needs a rate and the attestation.
6. The pipeline board's hire flow still reads the live job's `expected_fee_minor` (hire dialog, 5b).

## 5b: drop-2 surfaces

Built against `backend.md` v2 (§3.7 to §3.7d, §4.6 to §4.8, §7).

### Routes touched

| Route | Change | Spec |
|---|---|---|
| `/workspace/[orgSlug]/referrals/[referralId]` | New `ReportHireDialog`; S6-e (computed · invoiced and a link to the placement, replacing the expected share once hired); AC-64 "newer terms" line; hiring side no longer reads the live job's fee | S6, S8, 2.4.3, 2.6 |
| `/workspace/[orgSlug]/referrals?tab=pipeline` | The hire dialog on drop uses the referral's effective terms; cards show the referral's own `feeShort` instead of the live job fee | S8 |
| `/workspace/[orgSlug]/commissions/[placementId]` | Fee panel, difference row, side-specific neutral callouts, floored projection (`projectedSplit(I, agreement, C)`), negative job-owner tile with hint, platform-basis line, ledger styling, code display on all amounts | S9, 2.7 |
| `/workspace/[orgSlug]/commissions` | Fee column I + "Computed {C}" sub-line; share from the floored projection; code display (KPI tiles too) | S9, 2.7.5 |
| `/admin` | Terms panel with the two counts (`partner_visible_jobs`, `referral_open_without_terms`); a failed load shows `errors.generic`, never zeros | S11 |
| `/admin/referrals` (**new**) | Lookup: a `next/form` GET (`?q=`); the server parses a link or id, redirects to the detail page, or shows `notFound` inline | S10 |
| `/admin/referrals/[referralId]` (**new**) | Meta, effective terms, history with admin-only notes, amendment form or a blocked line | S10, 2.8 |

### Components and modules

| File | What |
|---|---|
| `src/features/referrals/components/report-hire-dialog.tsx` | **New** `ReportHireDialog`. Snapshot variants (`pct_base`, `pct_total_cash`, `flat`): read-only Terms box (`TermsSummary compact`), base and bonus with the currency in the label, start date, live result box (`role="status"`, `computeFee`, breakdown "rate × amount" / "Minimum fee applies" / "Flat fee", guarantee end or "No guarantee"), "Invoiced fee is different" with invoiced fee, signed difference, the I < C or I > C consequence, reason select (5 codes), note (required label for `other`, counter, 500 max). Legacy: info alert + today's fields. Posts the §4.6 FormData; the variant and currency come from `getReferralTerms`, never the form |
| `src/features/referrals/components/referral-actions.tsx` | Old `ReportHireDialog` removed |
| `src/features/referrals/components/referral-terms.tsx` | `ReferralTermsPanel` adds the `placement` prop (S6-e) and the AC-64 line (`jobCurrentVersionNo > snapshot.version_no`) |
| `src/features/pipeline/{queries.ts,stages.ts}`, `components/pipeline-board.tsx` | `job:jobs(expected_fee_minor, fee_currency)` replaced by the snapshot embed; `getReferralTerms` for `offer` cards (`hireTerms`); card shows `feeShort` with the "Fee terms" title |
| `src/features/admin/components/amend-terms-form.tsx` | **New** `AmendTermsForm`: `TermsFields mode="amend"`, reason (counter), two request references, the "both asked" checkbox. "Record amendment" validates on the client (spec keys), computes the changed rows (`changedRows` + the same display texts) and opens the confirmation dialog listing `changeLine` items. Confirm posts `amendReferralTerms`. Server refusals (`errors.amendment_*`) render inline at the top. Success: toast + refresh; the form remounts keyed on the effective version |
| `src/features/jobs/components/terms-fields.tsx` | `mode="amend"`: admin title and description, no pill, preview, salary switch, attestation or version notes; "The split can't be amended"; the attestation-carried note. `windowLockedHint` disables T9 (the value goes in a hidden input) with `aria-describedby` to the lock hint |
| `src/features/admin/referral-lookup.ts` | `referralIdFrom` (link or id) and `isUuid` |
| `src/features/admin/components/admin-sidebar-nav.tsx` | Finance › Referral terms |
| `src/i18n/format.ts` | `signed` option (Intl `signDisplay: "exceptZero"`) for differences |

### Contract tidy-ups done in 5b
- `getDefaultRule` moved into `src/features/commissions/queries.ts` (`terms-context.ts` re-exports it).
- `PresentationBase.ownership_protected_until` is now `string | null`; `TargetPresentation` declares `lookback_months` and `claim_prior_date_min` (the local widening in `claim-context.ts` is gone).
- `getReferralDetail` reads `placements(id, status, currency, contracted_fee_minor, computed_fee_minor)` for S6-e.
- `amendSchema` (`src/features/admin/actions.ts`): reason, references and the checkbox used the dispute message `admin.validation.reason` ("at least 5 characters"). They now use the spec keys `admin.referralTerms.validation.{reasonLength,requestLength,bothAskedRequired}`. Message keys only; no behaviour change.
- The overview already used `listPlacements`, which includes `computed_fee_minor`, so its projected total already respects the floor through `summarizeForOrg`. No change needed.

### Overflow fixes (pre-N2, N1 AC-62)
- `SectionTitle` wraps (`flex-wrap`, `min-w-0` title): fixes the fr/pt referral page at 375 (18 and 33px → 0).
- Composer contact list: `grid-cols-[minmax(0,1fr)]` and `overflow-wrap:anywhere` on detail values: long email 43px → 0.
- Placement page: root and inner grids use `minmax(0,1fr)` tracks (fr 82–108px, pt 31–41px → 0).
- Admin overview "New organizations" list track (fr 375: 26px). Fixed in code but not re-measured.

### AC coverage (5b)

| AC | Status |
|---|---|
| AC-39 | Terms box is text, no currency or guarantee input, from the referral page and the pipeline drop |
| AC-40 | 20% × CAD 100,000.00 → CAD 20,000.00 shown live (checked) |
| AC-41 | Total cash + minimum: base 60,000 + bonus 5,000 at 15% with a CAD 12,000 minimum (screenshot; bonus required by the server) |
| AC-42 | Flat: no salary input, C = flat amount (checked; hire recorded) |
| AC-43 | Guarantee end = start + days; "No guarantee" at 0 |
| AC-44 | Toggle, 5 reasons, required note for `other`, inline field errors from §4.6 |
| AC-47, AC-65 | Legacy alert + today's fields; "Terms not recorded" on the placement page (built; no legacy referral exists locally, so not seen) |
| AC-48 | "Amended on {date}" in the hire Terms box (built; not exercised with a hire after amendment) |
| AC-50 to AC-53, AC-55 | Fee panel, difference, callouts, negative tile with hint and no danger colour, platform basis line. Checked with C = 20,000, I = 8,000: sourcing CAD 9,000.00, job owner −CAD 1,800.00, platform CAD 800.00 |
| AC-54 | Ledger rows show the server's allocations; negative allocations aren't muted. Not exercised (no payment recorded) |
| AC-56 | List Fee column with "Computed {C}"; signed share |
| AC-57 | Legacy Fee panel (built; not seen) |
| AC-58 to AC-62 | Amendment end to end on a delivered referral at `offer` (guarantee 90 → 60): confirmation dialog, toast, history with reason and references, both referral pages show "Amended on…" + "Original terms"; hired referral shows `blockedHired`; T9 locked with the delivery-date hint; the client shows "Confidential", the candidate only by label |
| AC-64 | "This job's terms are now version 3. This referral keeps version 2." (fr checked) |
| AC-70 | Code display on every amount on the hire dialog, placement page, commissions list and admin pages |
| AC-76 | Admin terms panel (two counts, generic error on failure) |

### Visual check (local stack, `next start -p 3107` through the guarded wrapper, stopped afterwards)
- **Local data:**
  - three snapshot referrals taken to `offer` via local RPCs: % base (SSE v3), total cash 15% + CAD 12,000 minimum (Staff v2), and flat CAD 15,000 (Data Engineer);
  - hires recorded through the UI: % base with I = 8,000 (`client_discount`, note) and flat with I = C;
  - one amendment recorded through the admin UI.
- **Captures:**
  - hire dialog at en light 1280, fr dark 375 and pt light 375 (top and scrolled), plus total cash and flat in en;
  - pipeline at en 1280 and fr dark 375;
  - placement page on both sides at en/fr/pt, light and dark, 375 and 1280;
  - commissions list on both sides;
  - admin overview, lookup (not found), detail before and after, confirmation dialog (pt 375), detail for a hired referral and at 375;
  - amended referral page on both sides.
- **Overflow:** 0 everywhere after the fixes, except the admin overview at fr 375, fixed in code but not re-measured.
- **Not checked visually:**
  - legacy referral variants (hire alert, legacy Fee panel, legacy agreement dialog): no legacy referral exists locally, and the referral-flag guard prevents creating the card-less setup;
  - the I > C callout;
  - `frozen` platform basis;
  - ledger rows after a verified payment;
  - a pipeline drop opening the hire dialog (the same component and props as the referral page; drag not automated).

### Server behaviour gaps
None blocking.
- The admin detail has no workspace route to link the placement to (admins aren't org members), so the Placement meta shows the hire date, without a link.
- `amendment_reason_required`, `hire_base_invalid`, `fee_difference_not_allowed` and `fee_difference_note_too_long` map to `errors.generic` by design; the UI validates first.
- **E2E (QA-owned), carried over from 5a:** `tests/e2e/review-regression.spec.ts` publishes a job without filling the card. `journey.spec.ts` fills "Contracted placement fee", which now only exists on legacy referrals; snapshot hires need "First-year base salary".

## Fix round (design-review, copy-review, QA, backend v2.1)

### Design blocking
- **B-1:** the triage panel's "Your share" tile passes `wrap`, and the "Posted" tile too, since it was also clipped in fr. Re-measured at 375 fr/pt: no tile clipped.
- **B-2:** below `sm`, the opportunities job and candidate card headers stack, with the share figure under the meta line. From `sm` up, a text figure can shrink (`sm:max-w-[45%]`) and an amount stays `shrink-0`.
  - Re-measuring exposed a horizontal overflow at 375 that wasn't caught before: fr 311px, pt 318px. Each wrapping grid's track grew to the min-content width of the match rows.
  - Fixed with `grid-cols-[minmax(0,1fr)]` on the page, list and group grids, and `JobMatchRow` now wraps its actions under the name below `sm`.
  - Re-measured: 0px in fr and pt at 375; 0px at 1280 en.
- **B-3:**
  - the `share_salary` row is now one `Label` (`min-h-11`, switch top-aligned);
  - job page **Edit terms** has `min-h-11 sm:min-h-8` (measured 44px);
  - S6-e **Open placement** is `inline-flex min-h-11` (not re-measured: the reset DB has no hired referral).
- **B-4:** the amendment confirmation restores focus in `onCloseAutoFocus`. After Cancel or Esc, focus returns to **Record amendment**. After a server refusal it goes to the first invalid field (`focusFirstInvalid`, radio groups included) or to the top message.

### Design polish included
- **P-1:** after a refused **Record hire**, focus moves to the first invalid field or to the message, scrolled into view.
- **P-2:** the action state lives in a form mounted with the dialog content, so reopening clears the last errors.
- **P-3:** closing the hire dialog opened from the pipeline (menu or drop) returns focus to that card's menu button.
- **P-5 / copy P11:** `CharCount` renders outside the hint (visible with an error) and is read with `common.charCount`.
- **P-6:** the S6-e row label is `commissions.detail.fee.title`.
- **P-7, copy P12:** legacy pipeline cards show "Terms not recorded"; the "Fee terms" label is read via `sr-only`.
- **P-9:** the composer terms panel has `role="region"`.
- **P-10:** salary bands use code display on S3, S4 and S5.
- **P-12:** focus-first-invalid handles radio groups.
- **P-13:** the rate and minimum inputs announce their unit (`%`, the currency code, and the "Fee currency: …" line).
- **P-15:** the KPI icon disc is `shrink-0`.
- **P-18:** the admin counts show `errors.generic` unless both fields are numbers.
- **P-22:** the agreement dialog title is `leading-snug`.
- **Not done:** P-4 (needs a placeholder key from ux-writer), P-8, P-11, P-14, P-16 (the S3 owner estimate stays fee-only by choice), P-17, P-20 (open question Q-R1), P-21.

### Copy
- **B1:** new `referrals.agreement.descriptionSnapshot` in en/fr/pt; the `{date}` argument is dropped.
- **P1–P7:** applied verbatim.
- **New keys:**
  - `errors.hire_terms_changed`;
  - `referrals.detail.terms.newerOnJobAmended`, shown when the referral is amended;
  - `common.charCount`;
  - `jobs.terms.internalShare`, the internal value of the Expected share row.
- **P10:** the 18 keys (`jobs.form.{commission … feeCurrency}`, `jobs.detail.placementFee`, `jobs.detail.visible.placementFee`) were confirmed unused (no static or dynamic reference in `src/`) and removed in all three locales.
- **E2E:** `tests/e2e/journey.spec.ts` and `tests/e2e/job-terms-card.spec.ts` now assert that "Placement fee" (exact) and "Guarantee (days)" are absent on snapshot hires. Before the rename these were negative checks on labels that no longer existed, so they passed for the wrong reason.

### QA
- **QA-N2-04:** the owner overview counts only partner-visible jobs (`getJobsTermsState(...).partner_visible`) for `setup.hasOpenJob`, the open-job count and partner fits.

### Backend v2.1 (§7.1)
1. The hire dialog posts `termsVersionId` = `getReferralTerms().effective.id`. On `errors.hire_terms_changed` it keeps the typed values, calls `router.refresh()` (the new terms and version id flow in through props) and shows the message as a warning alert at the top. Recorded in `backend.md` §7.
2. The job form never posts a minimum on flat, or a remedy when the guarantee is None: those inputs aren't rendered in those states. The amend form shares the component.
3. A null expected share renders `shareAtHire.*`, so an amended referral with a frozen estimate is covered.

### Environment note
The local database was reset by another workstream during this round. The demo seed and variants were re-run locally through the wrapper before re-measuring.

### Pre-existing overflow (QA-PRE-03, QA-PRE-04; N1 AC-62)
- **QA-PRE-03:** the job page's root, the two-column grid, both column grids and the "Candidates submitted to you" list now use `minmax(0,1fr)` tracks, so truncated labels can't widen the page.
- **QA-PRE-04:** the overview pipeline hover label is `w-max max-w-full` and wraps (`text-pretty`) inside its track instead of `whitespace-nowrap`.
- **Measured** at 375 in en, fr and pt on reseeded local data, with a job that had 2 received referrals: 0px on the job page and on both orgs' overviews.
- **E2E:** QA's `test.fail()` markers for both cases in `tests/e2e/job-terms-card.spec.ts` were removed, so they now run as normal tests.

### F-1: amendment currency (backend v2.4)
- **Currency used:** `/admin/referrals/[id]` passes `AdminReferralTerms.pct_amendment_currency` to `AmendTermsForm`.
  - On a % basis it is the currency of the minimum-fee adornment and unit text (`TermsFields salaryCurrency`) and of the confirmation diff. A flat → % switch therefore lists "Fee currency: CAD → USD" when the currencies differ.
  - On a flat basis, the flat currency select still applies.
  - The amend form shows no preview (unchanged), so there's nothing else to relabel.
- **No usable currency:** when `pct_amendment_currency` is null, the % basis cards are disabled. The existing `errors.terms_incomplete` copy shows as helper text, linked with `aria-describedby`. No new strings.
- **Payload:** the form no longer posts `currency`; the server ignores it anyway.
