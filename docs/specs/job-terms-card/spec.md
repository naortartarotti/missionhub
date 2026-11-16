# Job terms card, frozen into the agreement (N2)

Status: **copy final, ready for build** (§5 finalized by ux-writer-marketing, 268 keys per locale; backend drop 1 in parallel)
Slug: `job-terms-card`
Inputs: [`brief.md`](./brief.md) **rev. 2** (BR-1 to BR-38 in N2; BR-39 to BR-41 deferred), [`recruiting-input.md`](./recruiting-input.md) (incl. §12), RD-022 to RD-028, **RD-031 to RD-035**, PD-044 to PD-049, **PD-050 to PD-052** (scope trim, answers to Q-1 to Q-12, strategist folding).
Owner: Product Designer · 2026-11-15 (rev. 2)

**Rev. 2 changes (brief §11.1):**
- **Moved to the appendix "Deferred: N2.1 / N3"** (text kept so N2.1 and N3 build from one definition):
  - the terms-worsening flag and its S11 panel (N2.1);
  - two admin metrics (N2.1);
  - the below-band alert (N2.1);
  - every BR-40 client-name element (N3).
- The moved ACs keep their numbers, marked "moved".
- **Admin overview keeps two counts only:** partner-visible jobs with complete terms, and referral-open jobs hidden for missing terms (2.8, S11, AC-76).
- **Expected share** comes from the **frozen estimate** A was shown (`fee_estimate_minor`), identically for both sides. With no frozen estimate, both sides see `jobs.terms.shareAtHire.{pctBase,pctTotalCash}`, which names the share percent and the fee rate. The live band and live `share_salary` are never read (S6, S7, AC-63).
- **Sent list** shows basis and rate (or flat amount + currency), with no money share. Legacy rows show "Terms not recorded" (2.4, AC-63).
- **Forged or other-job `termsVersionId`** → `terms_changed` with this job's current version (AC-26).
- **Error codes** aligned with backend: `hire_terms_fixed`, `amendment_after_hire`, `amendment_window_after_delivery`, `amendment_no_change`, `amendment_legacy_referral`. The interim `hire_terms_pending` uses the generic error.
- **New ACs:**
  - AC-73: legacy pending referral delivered on a card-less job;
  - AC-74: no ownership date on undelivered referrals;
  - AC-75: `currency_mismatch` nudge, brief rev. 2 BR-3 / scenario 19;
  - AC-76: the two admin counts.
- §9 is answered (PD-051).

> **How to read this spec.** BR-# are the brief's business rules (rev. 2). This spec doesn't change any of them. BR-39 (as revised by RD-032), BR-40 and BR-41 are deferred. Their design is kept in the appendix "Deferred: N2.1 / N3". The design questions in §9 are all answered (PD-051).
> **Letters.** T1–T11 are the card fields (brief BR-1). **C** = computed fee, **I** = invoiced fee, **P** = a verified client payment (net). These letters appear only in this spec. The UI says "computed fee" and "invoiced fee".
> **⚖️ draft** marks strings that ship with the "draft pending legal review" marker until counsel signs off (brief §8.3): the network-rule lines, the attestation, the frozen-terms and floor wording, and the amendment rule.
> **Strategist decisions folded in:**
> - **RD-031:** the terms are a **floor**, not a cap. When I > C, the partner shares the upside. I is this hire's placement fee only, retainer included.
> - **RD-032:** BR-39 is revised (appendix, N2.1).
> - **RD-033:** both client keys count, which is an N3 input with no UI in N2.
> - **RD-034:** the I ≠ C reasons include "client invoiced in another currency".
> - **RD-035:** amendments can be recorded only before the hire.
> **Patterns reused from N1** (`docs/specs/duplicate-prior-presentation/spec.md`):
> - Submit outcomes are **returned results rendered in the submit panel**, never toasts (`terms_changed` joins `created` / `stopped` / `pending_warning` / `identifier_required`).
> - `AlertTitle` gets the `line-clamp-none whitespace-normal text-pretty` override.
> - In-app notifications are English in SQL (PD-026).
> - Hidden options are **not rendered**, rather than shown disabled, unless this spec says otherwise.

---

## 1. Problem & users

A sourcing recruiter commits a candidate without knowing the job's economics. The fee basis is lost, the fee can be hidden, and guarantee, payment terms, search type and window aren't on the job at all. The split is frozen only at acceptance. At hire, the hiring recruiter types the fee, currency and guarantee freely and can change the job's fee at any time without a trace. N2 makes the terms the sourcing recruiter **saw** the terms of the referral, the agreement, the hire and the ledger (brief §1, §4).

| Role | Org role(s) | Job to be done in N2 |
|---|---|---|
| **Hiring recruiter** (org B) | Holders of `jobs:write` (organization admin, recruiter manager, and recruiters who can edit jobs today) to edit the card. All members read it. | Declare the job's terms for partners once, in under 2 minutes, and update them when the client contract changes. Report the hire from the referral's terms by entering the actual salary. Explain any fee difference. |
| **Sourcing recruiter** (org A) | Holders of `referrals:submit` | Read the terms before investing a candidate, submit under a known version, confirm the agreement on the same terms, and see the computed fee and their share at hire, including any difference and its reason. |
| **Platform admin** | `/admin` | Record a concierge terms amendment when both orgs ask in writing (before the hire). Read the two terms counts. Use the referral's terms in disputes. (The worsening flag is N2.1.) |
| **Candidate** (not a user) | `/candidate/[token]` | Nothing changes. The candidate never sees a fee, terms or salary figures from N2. |
| **Connectors / API** | service | Create and update jobs as today, but can't publish terms or open a job to partners (BR-4, BR-6). No UI. |

---

## 2. Flows

### 2.1 Hiring side: fill in the terms card (BR-1, BR-2, BR-4 to BR-6, BR-9, BR-10, BR-33)

Entry: Jobs › New job (`/workspace/[orgSlug]/jobs/new`) and Jobs › job › Edit (`/workspace/[orgSlug]/jobs/[jobId]/edit`). Both use `JobForm`. The current **Placement fee** panel (`CommissionFields`, amount-only mode) is **removed**. The **Partner referrals** panel is followed by a new **Terms for partners** panel (`TermsFields`, anchor `#terms`), which renders only while **Open this job to partner recruiters** is ticked.

**Happy path, new job**
1. The form opens with **Open this job to partner recruiters** ticked (today's default stays) and the terms card prefilled with the BR-1 defaults: basis **% of base salary**, rate empty, no minimum, **Contingent, shared**, guarantee **90 days** + **Replacement, then pro-rata refund**, payment terms **30** days, ownership window **6 months**. **Show partners the salary band and fee estimate** (`share_salary`) is **on** (BR-10), and the direct-client attestation is unticked.
2. The recruiter enters the rate (for example 20). The preview box shows the estimated fee from the salary band midpoint and the three shares (T10 split), labelled as estimates. With no salary band, the box shows "Add a salary band to see an estimate."
3. They tick the attestation and select **Publish** (or **Save draft**).
4. The server validates the job and the card with the same Zod schema, saves the job and, in the same transaction, publishes **terms version 1** through the terms RPC with the attestation (user + time). Redirect to the job page with the existing flash.

**Happy path, edit**
1. The card is prefilled from the job's **current terms version**. The version line reads "Terms version {n} · published {date} by {name}".
2. The attestation checkbox is **always unticked on load**. It becomes **required only when this save will publish a new version**, which means the card has no version yet or a T1–T9 value differs from the current version (client-side diff; the server decides). While nothing differs, the checkbox shows no "required" marker and a save doesn't need it (BR-4, BR-5, PD-051 Q-2).
3. As soon as a T1–T9 value differs, a muted note appears above the attestation: "Saving publishes terms version {n+1}." If the job has **at least one referral** (any status), a second line appears (BR-33): "{count} referrals were sent under earlier terms and keep them. Partners with live referrals are told the terms changed."
4. **Save changes** → job update + new version in one transaction. If no T1–T9 value changed, no version is created (BR-5). Description, skills and other job fields never create a version.

**Opening an existing job to partners** (the toggle goes from off to on)
- If the job has **never** been open to partners and has no version, `share_salary` is switched **on** when the toggle is ticked, and the user can switch it off before saving (BR-10). A job that already has a value keeps it (PD-047).
- The card appears, prefilled with the current version if one exists, otherwise with the defaults.

**Closing a job to partners** (toggle off)
- The card panel is hidden and its fields aren't submitted. No version is created or removed. Existing versions stay, and reopening prefills from the current version. Existing referrals are unaffected.

**Unhappy paths ("open to referrals" errors, BR-6)**

All of these are refused by the server even if the client-side checks are bypassed. **The whole save is refused** (the job isn't saved as private). The form keeps every value.

| Case | Client behaviour (before submit) | Server result |
|---|---|---|
| Toggle on, card incomplete (no rate / no flat amount, attestation unticked while a version would be published, out-of-range value) | Field errors appear on submit (not while typing) | Field errors on each invalid field (`fieldErrors`), plus the summary `jobs.errors.termsIncomplete` in `FormMessage`. Focus moves to the first invalid field. |
| Toggle on, contract type ≠ `permanent` | As soon as both hold, an inline warning appears under the toggle (`jobs.form.terms.permanentOnly`, warning tone) and the contract type field gets `aria-describedby` to it | Field error on `contractType`: `jobs.validation.permanentForReferrals` |
| Toggle off | No card, no checks | Any contract type and no card are accepted (BR-6) |
| Version conflict (two editors) | — | Existing "changed in the meantime" error. Nothing is published. |

**Drafts:** the checks apply whenever the toggle is on, **including Save draft** (BR-6 rev. 2, PD-051 Q-3).

The client name stays optional, with N1's hint unchanged. Requiring it on referral-open jobs is N3 (BR-40, appendix).

### 2.2 Hiring side: nudge on existing jobs (BR-7)

A job is **hidden from partners** when `accepts_external_referrals` is on and it fails BR-3 for one of these reasons:
- **(a) No complete terms version.** This is every referral-open job at migration time.
- **(b) Contract type ≠ `permanent`.**
- **(c) `currency_mismatch`:** on a % basis, the current version's currency differs from the job's current salary currency. This happens, for example, when a connector changed the salary currency (BR-3 rev. 2, PD-051 Q3).

If more than one reason applies, show the first in the order (a), (b), (c). Status `active` isn't part of the nudge. Drafts and closed jobs aren't "hidden", they're just not live.

1. **Jobs list:** each such row replaces the "Open to partners" chip with a warning chip: (a) `jobs.nudge.chipTerms` "Hidden from partners: add terms", (b) `jobs.nudge.chipPermanent` "Hidden from partners: not permanent", (c) `jobs.nudge.chipCurrency` "Hidden from partners: check fee currency". Above the list, when at least one active job is hidden, a warning banner reads `jobs.nudge.listBanner` ({count}). The banner has no button, because the rows are links.
2. **Job page:** the matching banner (the "one banner under the numbers" pattern) gets a new state with priority over "Matching live":
   - warning tone, `EyeOff` icon;
   - title `jobs.nudge.title`;
   - body (a) `jobs.nudge.bodyTerms` / (b) `jobs.nudge.bodyPermanent` / (c) `jobs.nudge.bodyCurrency`;
   - for `jobs:write` holders only, a CTA: (a) and (c) **Add terms** / **Review terms** → `/edit#terms`, (b) **Edit job** → `/edit`. In case (c), saving the card publishes a new version in the salary currency. Members without `jobs:write` see the banner without the CTA.
3. Existing referrals on the job keep their status and can proceed (BR-7). The referral pages show no nudge.
4. The nudge disappears once the job is partner-visible again.

### 2.3 Sourcing side: read the terms and submit (BR-3, BR-8 to BR-15)

Entry points:
- **Opportunities** list and triage (`/workspace/[orgSlug]/opportunities`): the share figure follows the gating rule.
- The **match-review screen**, which is the composer (`/workspace/[orgSlug]/opportunities/[matchId]`, `SubmitReferralForm`). This is the opportunity view and the submit screen in one page, and the terms card sits there.

**Happy path**
1. The composer's aside shows, in this order: the job panel (unchanged), the new **Terms for this job** panel (`TermsSummary variant="partner"`, §3 S5), then the submit panel.
2. The submit panel adds one line above the submit button with a `FileCheck2` icon: `referrals.form.termsLine` "You're submitting under terms version {version} ({date})." On the candidate-confirms path, a second muted line follows: `referrals.form.termsLineConfirm` "These terms apply even if the candidate confirms later."
3. The form posts the **terms version id** it rendered (hidden input `termsVersionId`).
4. Outcome `created`: unchanged redirect. In the same transaction as the insert, the referral stores the terms version id, the default commission rule id/version **at that moment**, the client key (BR-11; the key goes to the closed table, BR-15), and the **fee estimate A was shown** (`fee_estimate_minor`). That's the flat amount, or the % estimate when `share_salary` allowed it, otherwise NULL (BR-11 rev. 2).

**Outcome `terms_changed` (BR-12)**: a returned result, not an error.
1. The version posted isn't the job's current version. The server creates no referral, sends no email, writes no fingerprint and no consent row, and writes one audit event only.
2. The submit panel shows **S5-e** (§3): a warning `Alert` with title `termsChanged.title` and body `termsChanged.description` ({partner}, {date}). It takes focus and is scrolled into view, as in N1.
3. The **Terms for this job** panel re-renders with the new version. Every row whose value differs from the version A saw gets a **Changed** badge (`jobs.terms.changedBadge`, info tone, icon + text). The payload carries the new version so the form **keeps its client state**: selected fields, documents, authorization method, note and idempotency key. A full reload is also acceptable, as long as that state survives (frontend's choice; record it in `frontend.md`).
4. The submit button reads **Submit under new terms** (`termsChanged.submit`) until the next submit, and the terms line shows the new version.
5. Resubmitting posts the new version id → normal outcomes.

**Interplay with N1's pending warning (BR-12)**
- Step 1 → `pending_warning`. Then B publishes a new version. Step 2 (**Submit anyway**) → `terms_changed`. S1-c (the warning) is replaced by S5-e, the acknowledgement tick is **reset**, and the next submit runs the full sequence again from step 1.
- Order of checks on the server: preconditions → **terms version** → duplicate check. A stale version therefore returns `terms_changed` before any fingerprint work, so a stale view can't trigger a stop and no stop is written.

**Unhappy paths**

| Case | Behaviour |
|---|---|
| Job stopped being partner-visible (closed, toggled off, made non-permanent) | The existing "opportunity no longer available" error (the same as a closed job today). No reason is given (BR-3). |
| `termsVersionId` is an older version of this job, belongs to another job, or is a UUID that matches no version (forged) | `terms_changed` with **this job's** current version (S5-e). Nothing about the other job is returned, and the response is the same whether or not the id exists elsewhere, so it can't be used to test for existence (IDOR-safe, brief §11.1 item 11). |
| `termsVersionId` missing or not a UUID | Zod refuses it; the existing generic error (`errors.invalidFields`) shows |
| Rate limit | Existing `errors.rateLimited`. `terms_changed` counts toward the 30/h submission limit like N1's outcomes. |
| Candidate-confirmed path, B changes terms while the request waits; resend | The referral keeps the version A submitted under. The resend doesn't re-snapshot (BR-14). The candidate page never shows terms. |

### 2.4 Both sides: the referral's terms (BR-13, BR-16 to BR-19, BR-31, BR-36, BR-37)

1. **Referral page** (`/workspace/[orgSlug]/referrals/[referralId]`): a new **Terms** panel in the aside, above the collaboration agreement panel, for both sides (§3 S6). It shows the referral's **effective terms**: the snapshot, or the latest amendment if one exists. It also shows the job version number and date.
   - **A's expected share** = the **frozen estimate** × the snapshot rule's sourcing share, shown **identically to both sides** (BR-11, BR-36, PD-051 Q4).
   - With no frozen estimate (a % job with the estimate hidden at commit), both sides see `jobs.terms.shareAtHire.{pctBase,pctTotalCash}` (for example "45% of the fee (fee: 20% of the base salary at hire)") and no amount.
   - The live band and live `share_salary` are never read.
2. **Legacy referrals** (no snapshot): the panel shows `jobs.terms.notRecorded` "Terms not recorded (sent before the terms card)", and everything else on the page is unchanged (BR-37).
3. **Job has newer terms:** when the job's current version is newer than the referral's, a muted line reads `referrals.detail.terms.newerOnJob` ("This job's terms are now version {current}. This referral keeps version {version}."). It's shown to both sides.
4. **Agreement panel, before acceptance:** the copy changes from "created from the current commission rule" to `detail.agreement.pendingSnapshot`. The split shown is the **snapshot rule**.
5. **Ownership footer** (timeline panel):
   - **Delivered:** the existing "Ownership protected until {date}." The date is now delivery + T9 months (BR-18), or + 12 months for legacy referrals (BR-19).
   - **Not delivered** (`awaiting_candidate`, sourcing side only): `referrals.detail.ownershipStartsAtDelivery` ("Ownership starts when the referral is delivered: {count} months for this client."). The ownership column is NULL until delivery, so **no ownership date renders anywhere** for an undelivered referral (BR-19). Legacy undelivered referrals use the same line with 12.
   - N1's released / ended / already-presented variants stay as they are.
6. **Sent list** (`?tab=sent`): **no money share** (PD-050 option c). Each row shows the referral's basis and rate, or flat amount + currency code, from its snapshot, using the short form `jobs.terms.feeShort.*` ("20% of base" / "CAD 15,000 flat"). Legacy rows show `jobs.terms.notRecorded`. Any existing share column or figure is removed from the sent list.
7. **Legacy referral awaiting the candidate on a job with no terms** (BR-3 delivery exception, BR-7, PD-051 Q-1): the candidate's confirmation delivers it under today's check (active, open, org not suspended). Ownership = delivery + 12 months, and the agreement follows the legacy path.

### 2.5 Sourcing side: confirm the agreement (BR-16, BR-36)

1. After B accepts, the agreement is created from the snapshot (BR-16), or as today for legacy referrals (BR-17). A sees **Review & confirm terms**, which now opens `AgreementDialog` (§3 S7) instead of the generic `ConfirmDialog`.
2. The dialog shows the **same effective terms and split** as the referral page's Terms panel (same component, `variant="compact"`), with version and date. A's expected share comes from the frozen estimate, or `jobs.terms.shareAtHire.*` when there's no estimate, with the same rule as 2.4. It also shows the ⚖️ draft description.
3. **Confirm agreement** → the existing action and the existing toast.
4. **Amended referral:** the dialog shows the amended terms with an "Amended on {date}" label.
5. **Legacy referral:** the split only, plus the "Terms not recorded" line.
6. **Errors:** version conflict or generic errors render inline (`role="alert"`), and the dialog stays open.

### 2.6 Hiring side: report the hire (BR-21 to BR-26, BR-29; RD-031, RD-034)

Entry points (both use `ReportHireDialog`):
- the referral page action bar (status `offer`, agreement active);
- the pipeline board, by dropping a card on **Hired**.

Both pass the same terms data, so the dialog variant is identical.

**Variant by effective terms**

| Variant | Inputs | Computed fee (C) |
|---|---|---|
| `pct_base` | First-year annual base salary ({currency}), start date | round(rate × base). If a minimum fee is set: max(that, minimum). |
| `pct_total_cash` | Base salary ({currency}), target bonus ({currency}, required, ≥ 0), start date | round(rate × (base + bonus)), at least the minimum |
| `flat` | Start date only (BR-22 rev. 2, PD-051 Q9) | The frozen amount |
| Legacy (no snapshot) | Today's fields: fee, currency (CAD/USD/EUR/GBP/BRL), start date, guarantee days 0–365 | — (free entry, BR-26) |

**Happy path (snapshot)**
1. The dialog opens with a read-only **Terms** box: basis + rate (or flat amount), minimum fee, currency, guarantee length + remedy, client payment terms, and "Terms version {n} · {date}" (or "Amended on {date}"). Values are plain text, never disabled inputs (brief §7). There's **no currency picker and no guarantee field** (BR-21).
2. B enters the base (and the bonus) and the start date. A live result box (`aria-live="polite"`) shows **Computed fee {C}** and a breakdown line: "{rate} × {amount}", or "Minimum fee applies", or "Flat fee". It also shows **Guarantee ends {date}** once the start date is entered (start + days), or "No guarantee" when days = 0 (BR-25). The UI figure uses the TS mirror of the database computation (BR-22).
3. **Invoiced fee is different** is a checkbox, unticked by default, which means I = C (BR-23). When ticked, three fields appear:
   - **Invoiced fee ({currency})**: required, > 0, ≠ C.
   - **Reason**: required, from `labels.feeDifferenceReason` (list below).
   - **Note**: optional, ≤ 500 characters. Its hint says both organizations see it and asks for no candidate names or contact details.

   A difference line shows "Difference: {signed amount}". A neutral consequence line (⚖️ draft) depends on the direction:
   - I < C: `hire.lowerConsequence`. {partner}'s share stays calculated on the computed fee, so the hiring side's own share covers the difference and can go below zero. {partner} is notified.
   - I > C: `hire.higherConsequence`. The split applies to the invoiced fee, so every share follows it, and {partner} is notified.
4. **Record hire** → the placement stores C, I, base (and bonus), the reason and note, the terms version (or amendment) used, the snapshot currency, and `guarantee_until`. Redirect to the placement as today. When I ≠ C, A gets an in-app notification with both amounts and the reason (BR-24).

**I ≠ C reasons** (`labels.feeDifferenceReason`; **final**, shared with backend as check constraint, Zod enum and TS type, PD-051 Q-5)

| Value | Label |
|---|---|
| `client_discount` | Client negotiated a lower fee |
| `client_contract_rate` | Client contract sets a different fee |
| `client_invoiced_other_currency` | Client invoiced in another currency (RD-034) |
| `invoice_correction` | Invoice correction or rounding |
| `other` | Other (the note becomes **required**) |

The below-band alert (BR-41) is **N2.1** (appendix). The N2 hire dialog has no band check.

**Unhappy paths**
- Validation (inline): base missing or ≤ 0, bonus missing on total cash, start date missing, invoiced fee equal to C ("Enter a different amount, or untick 'Invoiced fee is different'"), reason missing, note missing when the reason is `other`.
- Forged call passing a currency or guarantee for a snapshot referral → server refuses with `hire_terms_fixed`. The UI never sends it (BR-25).
- Snapshot fields (base, bonus, invoiced fee, reason) sent for a legacy referral → refused with `terms_not_recorded`. Legacy fields (fee, currency, guarantee) sent for a snapshot referral → refused with `hire_terms_fixed`.
- **Between backend drops** (drop 1 only, PD-050): the old `report_hire` refuses snapshot referrals with `hire_terms_pending`. The dialog shows the existing generic error (`errors.generic`). There's no dedicated copy, because the code is removed in drop 2, before QA.
- Version conflict → existing error with a refresh.
- **Legacy referral:** an info `Alert` at the top, `hire.legacyTitle` / `hire.legacyDescription`, then today's fields unchanged.

### 2.7 Both sides: the placement and commissions (BR-24, BR-27, BR-28, BR-30; RD-031, PD-049)

1. **Placement page** (`/workspace/[orgSlug]/commissions/[placementId]`): a new **Fee** panel above the three share tiles, for both sides (§3 S9). It shows the terms version and basis, the reported base (and target bonus), the computed fee, the invoiced fee, and, when they differ, the difference, the reason label and the note.
2. **Difference callout**, neutral tone, side-specific (§5.7 copy):
   - **I < C**
     - Sourcing side: "{partner} invoiced less than the computed fee. Your share is calculated on the computed fee ({computed}) and becomes payable as the client pays." The callout also gives a pointer to the existing **Open dispute** action.
     - Hiring side: "You invoiced less than the computed fee. {partner}'s share is calculated on the computed fee, so your share covers the difference." When the projected job-owner share is negative, add "Your projected share is {amount}: you pay this part of {partner}'s share from your own funds, directly to {partner}."
   - **I > C** (RD-031, both sides; same neutral wording, no "bonus" or "penalty" words): "The invoiced fee is higher than the computed fee. The terms set a minimum, so every share is calculated on the invoiced fee."
3. **Share tiles**
   - Projected values use the BR-27 formula with P = I.
   - Allocated values come from the ledger as today.
   - The **job-owner tile can show a negative amount**. Render the minus sign from the formatter and put a one-line explanation under it (`detail.negativeShareHint`). Use no danger colour, because this is an obligation and not an error.
   - The **platform tile** adds a basis line: `collected` → "Calculated on the fee collected" (PD-049, the shipped value); `frozen` → "Calculated on the computed fee". The line shows only when I ≠ C.
4. **Ledger table:** a negative job-owner allocation is an `allocation` entry, not a reversal. Show it with a minus sign in normal foreground colour; don't apply the muted styling used for reversals.
5. **Commissions list:**
   - The **Fee** column shows I, plus a sub-line "Computed {C}" when C ≠ I.
   - The **Your share** column may be negative (minus sign, with the sub-line "Projected" as today).
   - KPI totals sum signed amounts in the org currency (unchanged rule: no conversion).
6. **Legacy placements:** the Fee panel shows only "Placement fee {fee}" and "Terms not recorded (sent before the terms card)". Allocation is unchanged (BR-30).
7. *(Below-band row moved to N2.1, appendix.)*

### 2.8 Platform admin: amendments and terms counts (BR-34, BR-35, brief §4)

**Concierge amendment (Must)**
1. `/admin` sidebar › Finance › **Referral terms** (new item) → `/admin/referrals`. The page has one lookup field, "Referral link or ID". Admins paste the referral URL or ID from the written requests. **Find referral** → `/admin/referrals/[referralId]`. If nothing matches: inline error `admin.referralTerms.notFound`.
2. The detail page shows:
   - job title, hiring org, sourcing org, status, delivered date (or "Not delivered"), and placement (link, if any);
   - the client exactly **as partners see it** ("Confidential" or the name). The real confidential name and candidate data are never shown here; the candidate label is the only candidate reference;
   - **Effective terms** (`TermsSummary variant="admin"`);
   - **History**: the original job version (v{n}, {date}), then each amendment ({date}, admin name, reason, the two request references). The reason and references are **admin-only**.
3. **Record an amendment** form, shown only when the referral has a snapshot **and** no placement exists, **in any referral status** (including declined or withdrawn; PD-051 Q-6):
   - the T1–T9 fields (the same `TermsFields` component, `mode="amend"`), prefilled with the effective terms;
   - T6 isn't editable (the original attestation is carried over), and the split is shown read-only;
   - **T9 is disabled** on delivered referrals, with the hint `admin.referralTerms.windowLocked` (BR-35);
   - required: **Reason** (10–1,000 characters; hint: admins only, no candidate data), **Hiring organization's written request** and **Sourcing organization's written request** (reference text, 3–200 characters each, for example "email 2026-11-14 from J. Tremblay"), and the checkbox **Both organizations asked for this change in writing**.
4. **Record amendment** opens a confirmation dialog: title `amendConfirmTitle`, a list of the changed fields ("Guarantee: 90 days → 60 days"), and a description saying both orgs are notified, the original stays visible, and it can't be undone. Buttons: **Cancel** · **Record amendment**.
5. On confirm, the server writes a referral-scoped version (repointing an existing agreement to it, if there is one), writes the audit event, and notifies both orgs in-app. Toast `admin.referralTerms.messages.recorded`, and the history updates.
6. **Blocked states** (the form isn't rendered; one line explains why):
   - a placement exists → `blockedHired` (RD-035);
   - legacy referral → `blockedLegacy`.
7. **Server refusals** (if raced or forged): `amendment_after_hire`, `amendment_window_after_delivery`, `amendment_no_change`, `amendment_legacy_referral`. Each renders inline at the top of the form.
8. Non-admins get the existing `/admin` 404, and the RPC refuses.

**Terms counts (Must, brief §4, PD-051 Q-7)**

The `/admin` overview shows two counts from the existing admin metrics:
- partner-visible jobs with complete terms;
- referral-open jobs hidden for missing terms.

They load with N1's pattern: a failed load shows the generic error, never zeros (§3 S11). The terms-worsening flag (BR-39 as revised by RD-032) and the other metrics are **N2.1** (appendix).

### 2.9 Hiring side: prior-presentation objection look-back (BR-20)

In the N1 objection dialog (`PriorPresentationClaimDialog`), the date field's lower bound becomes delivery − **the referral's T9 months**, using the same month arithmetic as BR-18 (ET, end-of-month clamp). Legacy referrals keep 6 months.

The date input's `min` and the hint use the same bound. The hint gains one sentence, `claim.priorDateWindowHint` ("This referral's ownership window is {count} months, so you can go back {count} months."), shown for snapshot referrals only. The existing range sentence with dates is unchanged. An out-of-range date is refused client-side with `referrals.claim.validation.priorDateTooOld`, a plural with `{count}` = the referral's look-back months (T9, or 6 for legacy) and `{date}` = the bound. Server-side, it's refused with `errors.claim_date_invalid`, which carries no number. Nothing else in N1 changes.

### 2.10 Terms change notifications (BR-32, BR-33)

On a new job version (not an amendment), each **source org** with a live referral on the job gets **one** in-app notification of kind `job.terms_changed`. Live means `awaiting_candidate`, `submitted`, `under_review`, `info_requested`, `accepted`, `interviewing` or `offer`.
- Recipients are the distinct members who submitted that org's live referrals on the job, falling back to the org's admins (N1 Q-D8 pattern, PD-051 Q-8).
- The text names the hiring org and the job, never a candidate.
- Partners browsing the job see "Terms updated on {date}" for 30 days (S4, S5).

### 2.11 Unhappy paths across flows

| Case | Behaviour |
|---|---|
| **No permission** | Card editing needs `jobs:write`; members without it get the existing read-only job page, with no nudge CTA. Submit needs `referrals:submit`. Hire needs the hiring side as today. A wrong-side call gets "Referral not found." Non-admins on `/admin/referrals*` get a 404. |
| **Empty** | Card with no salary band: no estimate ("Add a salary band to see an estimate."). Opportunities with no visible jobs: the existing empty state. Admin counts of 0 show "0" (a failed load shows the error instead). Admin lookup before searching: description only. |
| **Invalid input** | Field-level errors (`FormField` pattern) in the card, the hire dialog and the amendment form. |
| **Rate-limited** | Submission 30/h (incl. `terms_changed`). Job saves and amendments have no new limit. |
| **Revoked authorization** | The referral keeps its terms. The Terms panel is unchanged. |
| **Expired candidate link** | No delivery, so no ownership date. The referral keeps its snapshot. |
| **Suspended org** | Can't act (existing). Its jobs aren't partner-visible (existing rule). Notifications still go to source orgs. |
| **Job closed / reopened / reposted** | Snapshots survive. A reposted job starts at its own version 1 (it's a new job). |
| **Internal referral** | Same snapshot. The Terms panel shows the split with the existing internal note (0 sourcing). The card on the composer shows the normal split, and the internal note appears on the referral after submission, as today. |

---

## 3. Screens & states

No new workspace routes. Two new admin routes. **New** = new component; **Extended** = existing.

| # | Screen / component | Route | New / extended | Components (`src/components/ui` + shared) |
|---|---|---|---|---|
| S1 | Job form, Terms for partners | `/workspace/[orgSlug]/jobs/new`, `/jobs/[jobId]/edit` (`JobForm`) | **New** `TermsFields` (replaces `CommissionFields`) | `RadioGroup`, `Input`, `NativeSelect`, `Checkbox`, `Label`, `Switch` (share_salary), `Alert`, `FormField`, `Panel` |
| S2 | Jobs list nudge | `/workspace/[orgSlug]/jobs` | Extended | `Alert`, chip (existing pill pattern) |
| S3 | Job page: banner, terms panel, KPI tile, visibility list | `/workspace/[orgSlug]/jobs/[jobId]` | Extended + `TermsSummary variant="owner"` | `Panel`, `Button`, `KpiTile` |
| S4 | Opportunities list / triage share figure | `/workspace/[orgSlug]/opportunities` | Extended | existing cards |
| S5 | Composer: Terms for this job + submit panel | `/workspace/[orgSlug]/opportunities/[matchId]` | **New** `TermsSummary variant="partner"`, `NetworkRules`; extended `SubmitReferralForm` | `Panel`, `Alert`, `Badge`, `SubmitButton` |
| S6 | Referral page Terms panel, ownership footer, agreement copy; Sent list | `/workspace/[orgSlug]/referrals/[referralId]`, `?tab=sent` | **New** `ReferralTermsPanel` | `Panel`, `StatusPill`, `details` disclosure |
| S7 | Agreement confirmation | inside S6 | **New** `AgreementDialog` (replaces `ConfirmAgreementButton`'s `ConfirmDialog`) | `Dialog`, `Button` |
| S8 | Hire dialog | S6 and pipeline board | Extended `ReportHireDialog` | `Dialog`, `Input`, `Checkbox`, `NativeSelect`, `Textarea`, `Alert`, `FormField` |
| S9 | Placement Fee panel, share tiles, ledger; commissions list | `/workspace/[orgSlug]/commissions/[placementId]`, `/commissions` | **New** `PlacementFeePanel`; extended | `Panel`, `Alert`, `StatTile` |
| S10 | Admin referral terms: lookup + detail + amendment | `/admin/referrals`, `/admin/referrals/[referralId]` | **New** routes, `AmendTermsForm` | `Input`, `Button`, `Panel`, `Dialog`, `TermsFields mode="amend"`, `Textarea`, `Checkbox` |
| S11 | Admin overview: two terms counts | `/admin` | **New** `TermsCountsPanel` (small) | `Panel`, `SectionTitle` |
| S12 | Objection dialog date hint | inside S6 / review queue | Extended `PriorPresentationClaimDialog` | — |
| S13 | Notifications | `/workspace/[orgSlug]/notifications` | Extended (3 kinds) | existing |

**Money display rule (all N2 surfaces, BR-38 rev. 2).** Every amount shows its **ISO currency code**, with no exceptions on N2 surfaces, including the sent list, S13 notifications and the admin pages. `f.money` formats CAD as plain "$" in `en-CA` and `fr-CA`, which is ambiguous next to USD. On S1, S3 to S11, amounts use **currency-code display** ("CAD 20,000.00", fr "20 000,00 CAD", pt "CAD 20.000,00"). Frontend adds an option such as `f.money(minor, cur, { code: true })` (Intl `currencyDisplay: "code"`); this is a new formatter option, not string concatenation. Estimates take a tilde: "~CAD 20,000". Percentages use `Intl` percent (fr "20 %"), with up to 2 decimals and no trailing zeros (20 %, 22,5 %).

### Shared component: `TermsSummary`

One read-only renderer for a terms object (job version, referral snapshot or amendment). It's used by S3, S5, S6, S7, S8 (Terms box), S10. It's a `dl`, with each row being label (`text-xs text-muted-foreground`) + value (`text-sm font-medium`, wraps).

| Row | Value format | Variants |
|---|---|---|
| Version line (header) | `terms.versionLine` "Terms version {version} · {date}", or `terms.amendedLine` "Amended on {date}" + `details` "Original terms" | all |
| Placement fee | `pct_base`: `terms.fee.pctBase` "{rate} of first-year base salary"; `pct_total_cash`: `terms.fee.pctTotalCash` "{rate} of first-year total cash (base + target bonus)"; `flat`: `terms.fee.flat` "{amount} flat fee" | all |
| Minimum fee | `terms.minimum` "{amount}" (row only if set) | all |
| Currency | `terms.currencyPct` "{currency} (the salary currency)" on % bases when no amount on screen shows it; omitted on flat | all |
| Estimate box | see S5 | partner, owner |
| Search type | `labels.searchType.*` + one-line description `terms.searchTypeHint.*` | all (hint: partner, owner) |
| Guarantee | `terms.guarantee` "{count} days from the start date · {remedy}", or `terms.noGuarantee` "No guarantee". On partner and owner variants, "No guarantee" renders as an info-tone row with an `Info` icon (E-7). | all |
| Client payment terms | `terms.paymentTerms` "Net {count} days from the invoice (issued at the start date)" | all |
| Ownership window | `terms.window` "{count} months from delivery" | all |
| Commission split | `terms.split` "Sourcing {sourcing} · Hiring {hiring} · Platform {platform}" + muted `terms.splitRule` "{rule} v{version}" | all (referral: snapshot rule) |
| Client | "Confidential" / name, per `client_confidential` | partner |
| Direct client | `terms.directClient` "The hiring recruiter states it holds the fee agreement with the end client." | partner, referral |
| Expected share | see S6 | referral, compact |

Variants: `owner` (S3), `partner` (S5), `referral` (S6), `compact` (S7, S8: no hints and no network rules), `admin` (S10). In `partner` with `changedFrom` set, rows that differ get the **Changed** badge.

### `NetworkRules`

A heading `terms.network.title` "Network rules for every job", a `ul` of 5 lines (`terms.network.ownership`, `.priorPresentation`, `.response`, `.payout`, `.tax`), all ⚖️ draft, then the marker `terms.network.draftMarker`. It always renders expanded on S5 and inside a `details` ("Network rules") on S6.

### S1 Job form: Terms for partners (`TermsFields`)

The panel (`id="terms"`, `scroll-mt-24`) has the heading `form.terms.title`, the description `form.terms.description`, and at the top right the version pill: neutral `StatusPill` "Version {n} · {date}", or "Not published yet" on new jobs and jobs without a version.

Sections are stacked, each a `fieldset` + `legend`:

1. **Placement fee** (`legend form.terms.feeLegend`)
   - **T1:** `RadioGroup` (`aria-label` = legend) rendered as 3 option cards in `grid sm:grid-cols-3`, each with a label + a 1-line hint (`form.terms.basis.*`, `form.terms.basisHint.*`). The total-cash hint includes the Brazil note (Should 4) as a second sentence, shown only when the salary currency is BRL.
   - **% bases**, in `grid sm:grid-cols-2`:
     - **T2 Fee rate**: `Input inputMode="decimal"` with a `%` adornment, placeholder "e.g. 20". Validation 1–50, ≤ 2 decimals.
     - **T3 Minimum fee (optional)**: amount `Input` with the currency code adornment = salary currency.
     - Under both, the read-only line `form.terms.currencyFollowsSalary` "Fee currency: {currency}, the same as the salary." It updates live when the salary currency changes.
   - **Flat**, in `grid sm:grid-cols-2`: **T2 Flat fee** amount (> 0) and **T4 Currency** `NativeSelect` (CAD, USD, EUR, GBP, BRL). There's no minimum field.
   - **Preview box** (existing `splitPreview` styling): "Estimated fee ~{fee}" + three shares + hint `form.terms.previewHint`. On total cash, add "plus {rate} of the target bonus". With no band, show `form.terms.previewNoBand`. With a flat basis, the preview shows exact shares of the flat amount (no tilde), labelled "If hired".
2. **Search type** (`legend form.terms.searchLegend`): **T5** `RadioGroup`, 3 vertical options with hints. The retained hint is `form.terms.searchHint.retained` ("the split applies to the total fee, retainer included", RD-026).
3. **Guarantee** (`legend form.terms.guaranteeLegend`), in `grid sm:grid-cols-2`:
   - **T7 length**: `NativeSelect` (None, 30, 60, 90, 120, 180 days).
   - **Remedy**: `RadioGroup`, 4 vertical options. It is **not rendered** when the length is None. In its place, the muted line `form.terms.noGuaranteeNote` appears.
4. **Payment and ownership**, in `grid sm:grid-cols-2`:
   - **T8**: `Input type="number"` min 0, max 90, with a "days" adornment and the hint `form.terms.paymentHint`.
   - **T9**: `NativeSelect` 6–12 months, with the hint `form.terms.windowHint` (⚖️ draft: "can't be shorter than your client contract's introduction period").
5. **Salary visibility:** a `Switch` + `Label` `form.terms.shareSalary`, hint `form.terms.shareSalaryHint` (the rate + estimate reveal the salary, BR-9). This replaces the "Compensation band" checkbox in the visibility fieldset. That fieldset keeps Description and Location; **"Expected placement fee" is removed** (BR-9).
6. **Commission split** (read-only, T10): a `dl` with three parts + `form.terms.splitNote` ("Set by MissionHub. Each referral keeps the split in force when it's submitted."). There are no inputs.
7. **Direct client (T6):** a bordered box with `Checkbox` + `Label` `form.terms.attestation` ⚖️ and the hint `form.terms.attestationHint`. A "Required to publish" marker shows only when a version will be published. On edit, a muted line above it reads "Last attested by {name} on {date}".
8. **Version notes** (muted, `aria-live="polite"`): `form.terms.willPublish` and, if referrals exist, `form.terms.existingReferrals` ({count}).

| State | What shows |
|---|---|
| Default (new) | BR-1 defaults, "Not published yet" |
| Default (edit) | Current version prefilled, attestation unticked, no version note |
| Changed (edit) | Version notes + attestation marked required |
| Open + not permanent | Warning line under the toggle (2.1) |
| Error | Field errors + `jobs.errors.termsIncomplete` summary; focus on the first invalid field |
| Loading | Existing `SubmitButton` pending labels |
| Success | Existing redirect + flash (`detail.flashUpdated` / `flashPublished`) |
| Disabled | Rate and minimum inputs aren't disabled when there's no band (unlike today's % mode); only the preview is empty |

### S2 Jobs list

| State | What shows |
|---|---|
| Hidden jobs exist (≥ 1 active) | A warning `Alert` above the list: `jobs.nudge.listBanner` (plural {count}) |
| Row, hidden (a) / (b) / (c) | Warning chip `nudge.chipTerms` / `nudge.chipPermanent` / `nudge.chipCurrency` (icon `EyeOff` + text) in place of "Open to partners". The chip **wraps** (`whitespace-normal`, `text-pretty`, no `truncate` or `line-clamp`; icon `shrink-0`, top-aligned). The fr text is 42–45 characters and takes 2 lines at 375px (§5.11). Don't shorten the text to fit. |
| None hidden | Unchanged |

### S3 Job page

- **Banner:** the new "Hidden from partners" state (2.2) takes priority over the existing states when it applies.
- **KPI tile "Placement fee"** → label `detail.feeTerms` "Fee terms", value a short form: "20% of base" / "CAD 15,000 flat" / "—" when there's no version.
  - The value **wraps** (no `truncate`; `text-pretty break-words`). The fr `feeShort.pctTotalCash` value is 31 characters.
  - The tiles are 2-up below `xl` (`grid-cols-2`), so below `sm` this tile's value renders at **`text-lg`** instead of the KPI's large size. Alternatively, make this tile span both columns (`col-span-2 sm:col-span-1`); frontend picks one and records it in `frontend.md`.
  - Either way, no fr value is clipped at 375px (§5.11).
- **New Panel "Terms for partners"** in the right column, above "What partners see": `TermsSummary variant="owner"` + "Edit terms" link (`jobs:write`). With no version: empty state `detail.termsEmpty` + **Add terms** (`jobs:write`).
- **"What partners see" list:** the "Placement fee" row is removed and an always-shown row "Terms for partners" is added. "Compensation band" follows `share_salary`.

### S4 Opportunities list and triage

- Each job card's share figure:
  - **flat** → "{share}" (exact, code display) + "Your share if hired";
  - **% with `share_salary` on** → "~{share}" + "Your estimated share";
  - **% with `share_salary` off** → the basis text ("20% of base") in `text-sm` + "Fee"; no amount.
- **Terms updated** chip (info) when a version other than v1 was published in the last 30 days.
- Sort **Highest earnings**: jobs without an amount sort last, then by rate.
- The server never sends the band, the estimated fee or the share for % jobs with `share_salary` off (AC-21).

### S5 Composer

**Terms for this job panel** (`Panel p-6`):
- heading `terms.partnerTitle`, version line, and the "Terms updated on {date}" chip when it applies;
- `TermsSummary variant="partner"`;
- an **estimate box** (`rounded-2xl bg-muted/40 p-3`):
  - % with `share_salary` on: "Estimated fee ~{fee} · Your estimated share ~{share} ({percent})" + `terms.estimateHint` ("From the salary band midpoint. At hire, the fee is computed from the actual salary. Shares are before sales tax.");
  - % with `share_salary` off: `terms.estimateHidden` ("{partner} keeps the salary band private, so no estimate is shown.");
  - flat: "Your share if hired {share} ({percent})" + "Before sales tax.";
- `NetworkRules` at the bottom.

**Submit panel states** (added to N1's S1-a to S1-d):

| State | What shows |
|---|---|
| **S5-a Default** | N1 S1-a + the terms line (+ the confirm-path line) above the submit button |
| **S5-e Terms changed** | A warning `Alert` above the submit button (`role="alert"`, `tabIndex=-1`, focus + scroll into view, `ALERT_TITLE` override): title `termsChanged.title`, body `termsChanged.description`. The terms panel shows the new version with **Changed** badges. The submit button label is `termsChanged.submit`; pending label "Submitting…". If S1-c was showing, it's replaced and the tick reset. |
| Loading | "Submitting…" |
| Error | Existing `FormMessage` (rate limit, opportunity gone) |
| Success | Unchanged redirect |

### S6 Referral page

**Terms panel** (`ReferralTermsPanel`), in the aside above the agreement panel:

| Sub-state | Side | What shows |
|---|---|---|
| S6-a Snapshot | both | Title `detail.terms.title`, `TermsSummary variant="referral"`, an **Expected share** row (BR-36), and the `NetworkRules` `details` |
| S6-b Amended | both | The amended line + `details` "Original terms" with the snapshot (the reason isn't shown) |
| S6-c Newer job version | both | Muted line `detail.terms.newerOnJob` |
| S6-d Legacy | both | `Info` icon + `jobs.terms.notRecorded`; no rows |
| S6-e Placement exists | both | The Expected share row is replaced by "Computed fee {C} · invoiced {I}" with a link to the placement |

**Expected share row** = the frozen estimate (`fee_estimate_minor`) × the snapshot rule's sourcing share (the backend's `get_referral_terms.expected_share_minor`). It's **identical for both sides** (PD-051 Q4):
- flat → exact share (the estimate is the flat amount), no tilde;
- % with a frozen estimate → "~{share}";
- % without a frozen estimate (hidden from A at commit) → `jobs.terms.shareAtHire.pctBase` / `.pctTotalCash` ("{percent} of the fee (fee: {rate} of the base salary at hire)"; `{percent}` = snapshot sourcing share, `{rate}` = fee rate), with no amount, on **both** sides;
- internal referrals → the existing internal note, no amount;
- the live band and live `share_salary` are never read.

The ownership footer and agreement copy follow 2.4.

**Sent list** (`?tab=sent`): one muted line per row with the snapshot's short basis (`jobs.terms.feeShort.*`, currency code on flat), or `jobs.terms.notRecorded` for legacy rows. There's no share amount (PD-050 option c).

### S7 Agreement confirmation (`AgreementDialog`)

- `DialogContent sm:max-w-lg max-h-[90dvh]`, scrollable body, sticky footer.
- Title `agreement.title`; description `agreement.descriptionSnapshot` ⚖️ (or the legacy `agreement.description`).
- Body: `TermsSummary variant="compact"` + the Expected share row exactly as in S6 (frozen estimate, or `jobs.terms.shareAtHire.*`).
- Footer: **Cancel** (outline) · **Confirm agreement**.
- Loading "Working…"; error inline `role="alert"`; success = existing toast + close.

### S8 Hire dialog (`ReportHireDialog`)

- `DialogContent sm:max-w-lg max-h-[90dvh]`, scrollable body, sticky footer.
- Order: header → Terms box (muted, `compact`) → inputs → result box → difference checkbox + fields → `FormMessage` → footer **Cancel** · **Record hire** ("Recording…").
- Amount inputs carry the currency code in the label ("First-year base salary (CAD)") and use `inputMode="decimal"`.
- The **result box** is `role="status" aria-live="polite"`: "Computed fee" in `text-lg font-semibold tabular-nums`, with the breakdown in `text-xs text-muted-foreground`.
- The difference fields render only when the box is ticked. Unticking clears them.
- The **legacy variant** is today's dialog + the info `Alert` at the top.

### S9 Placement page and commissions list

**`PlacementFeePanel`**: a `dl` in `grid sm:grid-cols-2 lg:grid-cols-4`.

| Cell | Content |
|---|---|
| Terms | "Version {n}" (or "Amended {date}") + short basis "20% of base" |
| Reported salary | Base; on total cash also "Target bonus {amount}"; flat → "—" (row hidden) |
| Computed fee | {C} + breakdown |
| Invoiced fee | {I} |

When I ≠ C, a full-width row underneath shows "Difference {signed}" · reason label · quoted note (or "No note."), then the side-specific callout (2.7), which is `role="status"`. Both are neutral (`bg-muted/50`, `Info` icon), not warning or danger.

**Share tiles:**
- negative job-owner amount + `detail.negativeShareHint`;
- platform basis line when I ≠ C;
- the projected/allocated labels stay as today.

**Commissions list:** see 2.7.

| State | What shows |
|---|---|
| I = C | Fee panel without the difference row or callout |
| I < C (owner share positive) | Difference row + callouts |
| I < C (owner share negative) | + negative tile + extra callout sentence |
| I > C | Difference row + RD-031 callout |
| Legacy | Placement fee + "Terms not recorded" |

### S10 Admin referral terms

| Screen | States |
|---|---|
| `/admin/referrals` | Default: PageHeader `referralTerms.title` / `description`, a lookup form (`Input` labelled `lookupLabel`, hint `lookupHint`, **Find referral**). Loading "Finding…". Not found: inline field error. |
| `/admin/referrals/[id]` | Header + meta `dl`; **Effective terms** panel; **History** panel (an `ol`, newest last); **Record an amendment** panel, or a blocked line. The confirmation `Dialog` shows the changed-field list. Loading "Recording…". Errors inline at the top of the form. Success toast + history refresh. |

The amendment form fields follow S1 field components and copy (no attestation, split read-only). T9 has `disabled` + `aria-describedby` → `windowLocked` when delivered. Reason `Textarea` (counter). Two reference `Input`s. Confirmation `Checkbox`.

**Buttons:** the **Record amendment** button (`amendSubmit`, fr 27 characters) and the confirmation dialog's footer (**Cancel** · **Record amendment**) stack **full width below `sm`** (`w-full sm:w-auto`, primary on top in the dialog), at ≥ 44px height (§5.11).

### S11 Admin overview: terms counts (Must)

A small `Panel` titled `admin.termsMetrics.title`, placed next to N1's duplicate-protection metrics panel. It holds a `dl` with two items:
- `admin.termsMetrics.completeTerms` (partner-visible jobs with complete terms);
- `admin.termsMetrics.hiddenJobs` (referral-open jobs hidden for missing terms).

Values use `f.number`. **Load error:** `role="alert"` with `errors.generic` in place of the `dl` (a failed load must not read as zeros, the N1 pattern). Footer: the existing `overview.privacyNote`. The flag list and the other metrics are N2.1 (appendix).

### S12 Objection dialog

The date hint gains `claim.priorDateWindowHint` (2.9). `min` = the snapshot bound.

### S13 Notifications (in-app, English in SQL, PD-026; emailed later by N7)

| Kind | Recipient | Text |
|---|---|---|
| `job.terms_changed` | Source org (2.10) | "{org} updated the terms for {job}. Your referrals keep the terms they were sent under." |
| `placement.fee_difference` | The referral's submitter, falling back to the source org's admins (BR-24 rev. 2) | "{org} reported a hire for {job} with an invoiced fee of {invoiced} instead of the computed {computed}. Reason: {reason}." |
| `referral_terms_amended` | Both orgs' referral participants, falling back to owners/admins | "A platform admin recorded a terms amendment on the referral for {job}, at both organizations' written request." |

Kind names follow brief §11.2 item 9. The amendment kind's exact name is the backend's choice; record it in `backend.md`. Amounts in SQL text use the ISO code ("CAD 20,000.00"). There's no candidate data in any of them.

### Mobile (375px) notes

- **Job form card:** one column. Option cards full width, each ≥ 44px tall, with the whole card as the hit area. The rate and minimum fields stack. Adornments (%, CAD, days) stay inside the input and don't wrap. The preview `dl` stacks to one column. The version pill wraps under the heading. fr labels (~25% longer) wrap; no truncation.
- **Jobs list:** chips sit under the title and wrap to 2 lines in fr (no truncation). The banner is full width.
- **Job page:** the Fee terms KPI value wraps, at `text-lg` below `sm` (or the tile is full width; S3).
- **Composer:** the aside stacks below the profile in the order job → terms → submit, so A passes the terms on the way to the button. On S5-e, scroll the alert into view and move focus to it. Changed badges sit under the value, not beside it.
- **Referral page:** the Terms panel stacks in the aside order. The `details` summary is ≥ 44px.
- **Dialogs (S7, S8, S10 confirm):** full width minus 16px, body scrolls, footer sticky. Buttons stack full width below `sm` with the primary on top. The result box stays visible above the difference fields.
- **Placement page:** the Fee `dl` collapses to one column. Callouts are full width. Tiles stack (the existing `md:grid-cols-3`).
- **Commissions list:** the existing horizontal scroll table stays (`min-w-[760px]`). The "Computed {C}" sub-line wraps in its cell.
- **Admin:** single column. History items stack. **Record amendment** and the confirmation footer buttons are full width below `sm`.

Light and dark both use the existing tokens (`*-soft` pairs, `muted`, `info`, `warning`). No new colours.

---

## 4. Data & permissions

| Role | Can see | Can do |
|---|---|---|
| **Hiring org member** | Its jobs' terms versions (all), attestation user/time, referral snapshots and amendments on its referrals (not the reason or references), the placement's C, I, base, bonus, reason and note | With `jobs:write`: edit the card (publishes versions through the RPC), open or close to partners. Report hires (snapshot or legacy path). |
| **Sourcing org member** | The **current** version of partner-visible jobs, only through partner-visibility reads (never history, never non-visible jobs); its referrals' snapshot / amendment; the placement's C, I, base, bonus, reason and note | Submit with a version id. Confirm the agreement. Dispute a placement (existing). |
| **Platform admin** | Everything above, plus amendment reasons and request references, and the two terms counts. **Not** the real confidential client name outside disputes, and no candidate data on S10. | Record amendments (pre-hire). |
| **Candidate** | Nothing from N2 | — |
| **Org C / anon** | Nothing | — |
| **Connectors / API** | — | Create and update jobs without terms. Can't publish a version or set `accepts_external_referrals = true`. |

**Must never cross tenants / never be exposed**
- The **client key** (commit snapshot) is never returned, logged, displayed or written into audit metadata (BR-15). N1's delivery key is unchanged.
- For % jobs with `share_salary` off, the **salary band, estimated fee and estimated share are not in any partner payload** (list, triage, detail, `terms_changed` payload). Hiding them in the UI isn't enough (BR-9, R-5).
- Partners never receive the job's terms history, non-current versions, attestation user identity or `jobs` private fields. A version id from another job returns "not found" (IDOR).
- Hiring orgs still never receive candidate ids. Raw `matches` stay unexposed.
- Amendment reasons and request references are admin-only (BR-38).
- The admin amendment page doesn't show the real client name when the job is confidential (consistent with N1: admins see it only in dispute resolution).

**New PII and sensitive data (for `docs/security-and-privacy.md` and the N7 PIA)**
- **Reported base salary and target bonus at hire**: compensation data about a hired person. Visible to both orgs of the referral, and to admins in placement disputes. Never shown to candidates.
- **Hire difference note**: free text visible to both orgs. The hint forbids candidate names and contact details.
- **Amendment reason** and **request references**: admin-only free text. The hint forbids candidate data.
- The attestation records a user id and time on each version (member data, already in scope).

---

## 5. Copy (final: ux-writer-marketing, 2026-11-15)

**Status: final for en / fr-CA / pt-BR.** I didn't edit any JSON. **frontend-engineer** adds the UI keys (steps 5a/5b). **backend-engineer** adds the §5.9 `errors.*` codes and the §5.10 notification texts. All three locales must land together, since fr and pt are type-checked against en.

**Conventions.** Follow [`docs/content/voice-and-tone.md`](../../content/voice-and-tone.md). The N2 terms are in its **glossary §5.6**.
- **Money.** `{amount}`, `{fee}`, `{share}`, `{computed}`, `{invoiced}` and `{minimum}` arrive pre-formatted with **currency-code display**: en "CAD 20,000.00", fr "20 000,00 CAD", pt "CAD 20.000,00". Estimates arrive with the tilde already in the string ("~{fee}"). No string contains a currency symbol, and no string builds an amount from pieces.
- **Other placeholders.** `{rate}` and `{percent}` are `Intl` percents (fr "20 %", pt "20%"). `{date}` comes from `f.date()` in the short format. `{currency}`, `{termsCurrency}` and `{salaryCurrency}` are ISO codes.
- **Plurals** are `{ "one": …, "other": … }` objects with `{count}` in both branches. fr and pt treat 0 as `one`.
- **fr typography.** Use the straight apostrophe `'` (the baseline in the existing fr files). Put a **non-breaking space** (U+00A0) before `:` and inside « ». The tables below show it as a normal space. Write `%` through `Intl`, never by hand.
- **Words.** "Frozen" is used only for the split. Elsewhere, say "can't be changed for this referral". No string says MissionHub moves, sends, holds or pays money. Fee differences and negative shares are stated neutrally: no "penalty", "bonus", "debt" or "owe", and no danger tone.
- **Markers.** ⚖️ = ships with the draft marker until counsel signs off (brief §8.3). **new** = a key that wasn't in the design draft. **changed** = an existing key whose value (or shape) changes. **reuse** = use the existing key; don't add one.
- **Count:** 268 keys per locale (§5.1 to §5.9), plus 3 notification texts (§5.10).

### 5.1 Enums (`labels`)

15 keys. The job form's option cards (T1, T5) and the remedy radios use these labels, so there are no duplicate `jobs.form.terms.basis.*` keys.

| Key | en | fr-CA | pt-BR |
|---|---|---|---|
| `labels.feeBasis.pct_base` | % of base salary | % du salaire de base | % do salário-base |
| `labels.feeBasis.pct_total_cash` | % of total cash | % de la rémunération globale | % da remuneração total |
| `labels.feeBasis.flat` | Flat fee | Honoraires forfaitaires | Taxa fixa |
| `labels.searchType.contingent_exclusive` | Contingent, exclusive | Au succès, exclusif | Por sucesso, exclusiva |
| `labels.searchType.contingent_shared` | Contingent, shared | Au succès, non exclusif | Por sucesso, não exclusiva |
| `labels.searchType.retained` | Retained | Avec provision | Com adiantamento |
| `labels.guaranteeRemedy.replacement_only` | Replacement only | Remplacement seulement | Somente reposição |
| `labels.guaranteeRemedy.replacement_then_prorata` | Replacement, then pro-rata refund | Remplacement, puis remboursement au prorata | Reposição e, depois, reembolso proporcional |
| `labels.guaranteeRemedy.prorata_refund` | Pro-rata refund | Remboursement au prorata | Reembolso proporcional |
| `labels.guaranteeRemedy.full_refund` | Full refund | Remboursement complet | Reembolso integral |
| `labels.feeDifferenceReason.client_discount` | Client negotiated a lower fee | Le client a négocié des honoraires plus bas | O cliente negociou uma taxa menor |
| `labels.feeDifferenceReason.client_contract_rate` | Client contract sets a different fee | Le contrat client prévoit d'autres honoraires | O contrato com o cliente prevê outra taxa |
| `labels.feeDifferenceReason.client_invoiced_other_currency` | Client invoiced in another currency | Client facturé dans une autre devise | Cliente faturado em outra moeda |
| `labels.feeDifferenceReason.invoice_correction` | Invoice correction or rounding | Correction de facture ou arrondi | Correção de fatura ou arredondamento |
| `labels.feeDifferenceReason.other` | Other | Autre | Outro |

The `placement.fee_difference` notification (§5.10) is written in English in SQL. Its `{reason}` must use exactly the en labels above, so N7 can map them back to the code.

### 5.2 Shared terms display (`jobs.terms`)

54 keys. The same renderer (`TermsSummary`, `NetworkRules`) is used on S3, S5, S6, S7, S8 and S10. The job form reuses `searchTypeHint.*` for its T5 option hints (no `jobs.form.terms.searchHint.*` keys).

**Header, chips, row labels**

| Key | en | fr-CA | pt-BR | Notes |
|---|---|---|---|---|
| `jobs.terms.partnerTitle` | Terms for this job | Conditions de ce poste | Termos desta vaga | S5 panel heading |
| `jobs.terms.versionLine` | Terms version {version} · {date} | Version {version} des conditions · {date} | Versão {version} dos termos · {date} | |
| `jobs.terms.amendedLine` | Amended on {date} at both organizations' request | Modifiées le {date} à la demande des deux organisations | Alterados em {date} a pedido das duas organizações | fr agrees with *conditions* (f. pl.), pt with *termos* (m. pl.) |
| `jobs.terms.originalTerms` | Original terms | Conditions initiales | Termos originais | `details` summary. fr avoids *d'origine*, which is taken by *recruteur d'origine* |
| `jobs.terms.updatedChip` | Terms updated on {date} | Conditions modifiées le {date} | Termos atualizados em {date} | Chip on S4 and S5. fr uses *modifiées* rather than *mises à jour* to save 5 characters |
| `jobs.terms.changedBadge` | Changed | Modifié | Alterado | Badge under the value. Announced with the row ("Guarantee, 60 days, changed") |
| `jobs.terms.rows.fee` | Placement fee | Honoraires de placement | Taxa de colocação | |
| `jobs.terms.rows.minimum` | Minimum fee | Honoraires minimaux | Taxa mínima | |
| `jobs.terms.rows.currency` | Fee currency | Devise des honoraires | Moeda da taxa | Same text as the existing `jobs.form.feeCurrency` |
| `jobs.terms.rows.searchType` | Search type | Type de mandat | Tipo de busca | |
| `jobs.terms.rows.guarantee` | Guarantee | Garantie | Garantia | |
| `jobs.terms.rows.paymentTerms` | Client payment terms | Conditions de paiement du client | Prazo de pagamento do cliente | |
| `jobs.terms.rows.window` | Ownership window | Période de propriété | Período de titularidade | |
| `jobs.terms.rows.split` | Commission split | Partage de la commission | Divisão da comissão | |
| `jobs.terms.rows.client` | Client | Client | Cliente | |
| `jobs.terms.rows.directClient` | Direct client | Client direct | Cliente direto | |
| `jobs.terms.rows.expectedShare` | Your expected share | Votre part attendue | Sua parte esperada | Sourcing side. fr/pt don't use *prévue/prevista*, which are reserved for the ledger state "Projected" |
| `jobs.terms.rows.expectedShareTarget` | Sourcing recruiter's expected share | Part attendue du recruteur d'origine | Parte esperada do recrutador de origem | Hiring side, same value |

**Row values**

| Key | en | fr-CA | pt-BR | Notes |
|---|---|---|---|---|
| `jobs.terms.fee.pctBase` | {rate} of first-year base salary | {rate} du salaire de base de la première année | {rate} do salário-base do primeiro ano | |
| `jobs.terms.fee.pctTotalCash` | {rate} of first-year total cash (base + target bonus) | {rate} de la rémunération globale de la première année (salaire de base + prime cible) | {rate} da remuneração total do primeiro ano (salário-base + bônus-alvo) | |
| `jobs.terms.fee.flat` | {amount} flat fee | Honoraires forfaitaires de {amount} | Taxa fixa de {amount} | |
| `jobs.terms.feeShort.pctBase` | {rate} of base | {rate} du salaire de base | {rate} do salário-base | KPI tile (S3), sent list, S9 Terms cell |
| `jobs.terms.feeShort.pctTotalCash` | {rate} of total cash | {rate} de la rémunération globale | {rate} da remuneração total | Same places. See §5.11 for the KPI tile |
| `jobs.terms.feeShort.flat` | {amount} flat | {amount} (forfait) | {amount} (taxa fixa) | "CAD 15,000 flat" / "15 000 CAD (forfait)" / "CAD 15.000 (taxa fixa)" |
| `jobs.terms.currencyPct` | {currency}, the salary currency | {currency}, la devise du salaire | {currency}, a moeda do salário | |
| `jobs.terms.searchTypeHint.contingent_exclusive` | The client gives this job only to the hiring recruiter. The fee is due only on a hire. | Le client confie ce poste uniquement au recruteur du poste. Les honoraires ne sont dus qu'en cas d'embauche. | O cliente trabalha esta vaga só com o recrutador da vaga. A taxa só é devida se houver contratação. | |
| `jobs.terms.searchTypeHint.contingent_shared` | The client may also use other agencies or its own team. The fee is due only on a hire. | Le client peut aussi faire appel à d'autres agences ou à sa propre équipe. Les honoraires ne sont dus qu'en cas d'embauche. | O cliente também pode usar outras agências ou a própria equipe. A taxa só é devida se houver contratação. | |
| `jobs.terms.searchTypeHint.retained` | Part of the fee is paid upfront (retainer). The split applies to the total fee, retainer included. | Une partie des honoraires est payée d'avance (provision). Le partage s'applique au total des honoraires, provision comprise. | Parte da taxa é paga antecipadamente (adiantamento). A divisão vale para a taxa total, adiantamento incluído. | RD-026, Should 4 |
| `jobs.terms.guarantee` | one: {count} day from the start date · {remedy} · other: {count} days from the start date · {remedy} | one: {count} jour à partir de la date d'entrée en fonction · {remedy} · other: {count} jours à partir de la date d'entrée en fonction · {remedy} | one: {count} dia a partir da data de início · {remedy} · other: {count} dias a partir da data de início · {remedy} | plural. `{remedy}` = `labels.guaranteeRemedy.*` |
| `jobs.terms.noGuarantee` | No guarantee | Aucune garantie | Sem garantia | Info-tone row on partner/owner (E-7) |
| `jobs.terms.noGuaranteeHint` | The client gets no replacement or refund if the hire leaves early. | Le client n'obtient ni remplacement ni remboursement si la personne embauchée part tôt. | O cliente não tem reposição nem reembolso se a pessoa contratada sair cedo. | Partner and owner variants |
| `jobs.terms.paymentTerms` | one: Net {count} day from the invoice (issued at the start date) · other: Net {count} days from the invoice (issued at the start date) | one: Net {count} jour après la facture (émise à la date d'entrée en fonction) · other: Net {count} jours après la facture (émise à la date d'entrée en fonction) | one: {count} dia após a fatura (emitida na data de início) · other: {count} dias após a fatura (emitida na data de início) | plural. Used when T8 ≥ 1 |
| `jobs.terms.paymentTermsZero` | Due on the invoice date (issued at the start date) | Payable à la date de la facture (émise à la date d'entrée en fonction) | À vista, na data da fatura (emitida na data de início) | **new**. Used when T8 = 0 instead of "Net 0 days" |
| `jobs.terms.window` | one: {count} month from delivery · other: {count} months from delivery | one: {count} mois à compter de la transmission · other: {count} mois à compter de la transmission | one: {count} mês a partir da entrega · other: {count} meses a partir da entrega | plural |
| `jobs.terms.split` | Sourcing {sourcing} · Hiring {hiring} · Platform {platform} | Origine {sourcing} · Poste {hiring} · Plateforme {platform} | Origem {sourcing} · Vaga {hiring} · Plataforma {platform} | Also the read-only split on the job form (T10) |
| `jobs.terms.splitRule` | {rule} v{version} | {rule} v{version} | {rule} v{version} | |
| `jobs.terms.directClient` | The hiring recruiter states it holds the fee agreement directly with the end client. | Le recruteur du poste déclare détenir l'entente d'honoraires directement avec le client final. | O recrutador da vaga declara ter o contrato de taxa diretamente com o cliente final. | ⚖️ draft |
| `jobs.terms.clientConfidential` | Confidential | Confidentiel | Confidencial | Value of the Client row |

**Estimates and expected share**

| Key | en | fr-CA | pt-BR | Notes |
|---|---|---|---|---|
| `jobs.terms.estimate` | Estimated fee ~{fee} · Your estimated share ~{share} ({percent}) | Honoraires estimés ~{fee} · Votre part estimée ~{share} ({percent}) | Taxa estimada ~{fee} · Sua parte estimada ~{share} ({percent}) | % basis, `share_salary` on |
| `jobs.terms.estimateHint` | From the salary band midpoint. At hire, the fee is computed from the actual salary. Shares are before sales tax. | Selon le milieu de la fourchette salariale. À l'embauche, les honoraires sont calculés sur le salaire réel. Les parts sont avant taxes. | Com base no ponto médio da faixa salarial. Na contratação, a taxa é calculada sobre o salário real. As partes são antes de impostos. | |
| `jobs.terms.estimateHidden` | {partner} keeps the salary band private, so no estimate is shown. | {partner} garde la fourchette salariale confidentielle : aucune estimation n'est affichée. | {partner} mantém a faixa salarial privada, por isso não mostramos estimativa. | % basis, `share_salary` off |
| `jobs.terms.flatShare` | Your share if hired: {share} ({percent}) | Votre part en cas d'embauche : {share} ({percent}) | Sua parte se houver contratação: {share} ({percent}) | Flat basis, exact amount, no tilde |
| `jobs.terms.flatShareHint` | Before sales tax. Payable once the client's payment is verified. | Avant taxes. À verser une fois le paiement du client vérifié. | Antes de impostos. A pagar quando o pagamento do cliente for verificado. | |
| `jobs.terms.shareAtHire.pctBase` | {percent} of the fee (fee: {rate} of the base salary at hire) | {percent} des honoraires (honoraires : {rate} du salaire de base à l'embauche) | {percent} da taxa (taxa: {rate} do salário-base na contratação) | **changed shape**: the draft's single string is now an object by basis. Expected share row with no frozen estimate, both sides. `{percent}` = snapshot sourcing share, `{rate}` = fee rate. See note 1 |
| `jobs.terms.shareAtHire.pctTotalCash` | {percent} of the fee (fee: {rate} of total cash at hire) | {percent} des honoraires (honoraires : {rate} de la rémunération globale à l'embauche) | {percent} da taxa (taxa: {rate} da remuneração total na contratação) | Same, total-cash basis |
| `jobs.terms.notRecorded` | Terms not recorded (sent before the terms card) | Conditions non enregistrées (recommandation antérieure aux conditions du poste) | Termos não registrados (indicação anterior aos termos da vaga) | Legacy label wherever terms would appear (BR-37) |

*Note 1.* The draft's "{rate} of the salary at hire" sat in a row labelled "Your expected share". "20% of the salary at hire" would read as A's share when it's actually the whole fee. The final string names both numbers. It also covers total cash, where "salary" would be wrong. **AC-34 and AC-63 quote the draft wording. QA should check against these keys**, and the designer may update the AC text.

**Network rules** (`NetworkRules`, all ⚖️ draft, shown with `draftMarker`)

| Key | en | fr-CA | pt-BR | Notes |
|---|---|---|---|---|
| `jobs.terms.network.title` | Network rules for every job | Règles du réseau pour tous les postes | Regras da rede para todas as vagas | |
| `jobs.terms.network.ownership` | Ownership: a delivered referral keeps first position with this client and its affiliates, for any role, for the job's ownership window from delivery. | Propriété : une recommandation transmise conserve sa priorité auprès de ce client et de ses sociétés affiliées, pour tout poste, pendant la période de propriété du poste à compter de la transmission. | Titularidade: uma indicação entregue mantém a prioridade com este cliente e suas afiliadas, para qualquer vaga, durante o período de titularidade da vaga, contado da entrega. | ⚖️ draft ("affiliates", RD-003) |
| `jobs.terms.network.priorPresentation` | Prior presentation: the hiring recruiter has 5 business days after delivery to file an objection, with evidence. | Présentation antérieure : le recruteur du poste a 5 jours ouvrables après la transmission pour déposer une objection, pièces justificatives à l'appui. | Apresentação anterior: o recrutador da vaga tem 5 dias úteis após a entrega para registrar uma objeção, com comprovantes. | ⚖️ draft |
| `jobs.terms.network.response` | Response: the hiring recruiter acts on a delivered referral within 5 business days. If there's no action after 10 business days, the sourcing recruiter may submit the candidate to other jobs, and the referral keeps its first position with this client. | Réponse : le recruteur du poste donne suite à une recommandation transmise dans les 5 jours ouvrables. Sans suite après 10 jours ouvrables, le recruteur d'origine peut soumettre le candidat à d'autres postes, et la recommandation conserve sa priorité auprès de ce client. | Resposta: o recrutador da vaga dá retorno a uma indicação entregue em até 5 dias úteis. Sem retorno após 10 dias úteis, o recrutador de origem pode enviar o candidato para outras vagas, e a indicação mantém a prioridade com este cliente. | ⚖️ draft. **Final** (PD-051 Q-12). Avoids "release" / *libérer* / *liberar*. Says ownership is kept (RD-007). "acts on" matches RD-007 (accept, decline or request info) |
| `jobs.terms.network.payout` | Payout: the hiring recruiter pays the sourcing recruiter's share directly, within 5 business days of receiving the client's payment. The share isn't held back for the guarantee. | Versement : le recruteur du poste verse directement la part du recruteur d'origine dans les 5 jours ouvrables suivant la réception du paiement du client. La part n'est pas retenue pendant la garantie. | Repasse: o recrutador da vaga paga a parte do recrutador de origem diretamente, em até 5 dias úteis após receber o pagamento do cliente. A parte não fica retida durante a garantia. | ⚖️ draft (RD-027). "directly" makes clear MissionHub doesn't move the money |
| `jobs.terms.network.tax` | Sales tax: shares are before sales tax. Each organization adds the tax that applies when it invoices. | Taxes : les parts sont avant taxes. Chaque organisation ajoute les taxes applicables lorsqu'elle facture. | Impostos: as partes são antes de impostos. Cada organização inclui os impostos aplicáveis ao faturar. | ⚖️ draft (accountant). Doesn't name GST/HST/QST |
| `jobs.terms.network.draftMarker` | Draft network rules, pending legal review. | Ébauche des règles du réseau, en attente de révision juridique. | Rascunho das regras da rede, pendente de revisão jurídica. | Always shown under the list until N7 |
| `jobs.terms.network.summary` | Network rules | Règles du réseau | Regras da rede | `details` summary on S6 |

### 5.3 Job form (`jobs.form.terms`, `jobs.validation`, `jobs.errors`)

54 keys. T1 option labels use `labels.feeBasis.*`, T5 uses `labels.searchType.*` + `jobs.terms.searchTypeHint.*`, and remedy options use `labels.guaranteeRemedy.*`. The T10 split uses `jobs.terms.split` / `jobs.terms.splitRule`.

**Panel and fee section**

| Key | en | fr-CA | pt-BR | Notes |
|---|---|---|---|---|
| `jobs.form.terms.title` | Terms for partners | Conditions pour les partenaires | Termos para parceiros | |
| `jobs.form.terms.description` | Partners see these terms before they submit a candidate. Each referral keeps the terms in force when it was submitted. | Les partenaires voient ces conditions avant de soumettre un candidat. Chaque recommandation conserve les conditions en vigueur au moment de sa soumission. | Os parceiros veem estes termos antes de enviar um candidato. Cada indicação mantém os termos vigentes no momento do envio. | |
| `jobs.form.terms.notPublished` | Not published yet | Pas encore publiées | Ainda não publicados | Version pill. Agrees with *conditions* / *termos* |
| `jobs.form.terms.versionPill` | Version {version} · {date} | Version {version} · {date} | Versão {version} · {date} | |
| `jobs.form.terms.feeLegend` | Placement fee | Honoraires de placement | Taxa de colocação | |
| `jobs.form.terms.basisHint.pct_base` | Computed at hire from the first-year base salary. | Calculés à l'embauche sur le salaire de base de la première année. | Calculada na contratação sobre o salário-base do primeiro ano. | |
| `jobs.form.terms.basisHint.pct_total_cash` | Computed at hire from base salary plus target bonus. Equity, signing bonus, benefits and relocation aren't included. | Calculés à l'embauche sur le salaire de base plus la prime cible. Les actions, la prime d'embauche, les avantages sociaux et les frais de réinstallation ne sont pas inclus. | Calculada na contratação sobre o salário-base mais o bônus-alvo. Ações, bônus de contratação, benefícios e auxílio-mudança não entram. | R-10 |
| `jobs.form.terms.basisHint.pct_total_cash_br` | Check whether your client contract counts the 13th salary and the 1/3 vacation bonus in total cash. | Vérifiez si votre contrat client inclut le 13e salaire et le tiers de vacances (1/3 de férias) dans la rémunération globale. | Confira se o seu contrato com o cliente inclui o 13º salário e o 1/3 de férias na remuneração total. | Should 4. Second sentence of the total-cash hint, only when the salary currency is BRL. It says to check, not what the law requires |
| `jobs.form.terms.basisHint.flat` | A fixed amount, whatever the salary. | Un montant fixe, quel que soit le salaire. | Um valor fixo, seja qual for o salário. | |
| `jobs.form.terms.rate` | Fee rate | Taux des honoraires | Percentual da taxa | Adornment `%` (`aria-hidden`) |
| `jobs.form.terms.ratePlaceholder` | e.g. 20 | p. ex. 20 | ex.: 20 | |
| `jobs.form.terms.minimum` | Minimum fee (optional) | Honoraires minimaux (facultatif) | Taxa mínima (opcional) | Adornment = salary currency code |
| `jobs.form.terms.minimumHint` | Applies when the computed fee is lower. | S'appliquent si les honoraires calculés sont inférieurs. | Vale quando a taxa calculada for menor. | |
| `jobs.form.terms.flatAmount` | Flat fee | Honoraires forfaitaires | Taxa fixa | Next to the Currency select |
| `jobs.form.terms.currency` | Currency | Devise | Moeda | |
| `jobs.form.terms.currencyFollowsSalary` | Fee currency: {currency}, the same as the salary. | Devise des honoraires : {currency}, la même que celle du salaire. | Moeda da taxa: {currency}, a mesma do salário. | Live line, % bases |
| `jobs.form.terms.previewTitle` | Estimate | Estimation | Estimativa | |
| `jobs.form.terms.previewFee` | Estimated fee ~{fee} | Honoraires estimés ~{fee} | Taxa estimada ~{fee} | |
| `jobs.form.terms.previewBonus` | plus {rate} of the target bonus | plus {rate} de la prime cible | mais {rate} do bônus-alvo | Lower case on purpose: it follows `previewFee` on the same line |
| `jobs.form.terms.previewFlat` | If hired | En cas d'embauche | Se houver contratação | |
| `jobs.form.terms.previewHint` | From the salary band midpoint. The fee is computed at hire from the actual salary. | Selon le milieu de la fourchette salariale. Les honoraires sont calculés à l'embauche sur le salaire réel. | Com base no ponto médio da faixa salarial. A taxa é calculada na contratação sobre o salário real. | |
| `jobs.form.terms.previewNoBand` | Add a salary band to see an estimate. | Ajoutez une fourchette salariale pour voir une estimation. | Adicione uma faixa salarial para ver uma estimativa. | |

**Search type, guarantee, payment, window, visibility, split**

| Key | en | fr-CA | pt-BR | Notes |
|---|---|---|---|---|
| `jobs.form.terms.searchLegend` | Search type | Type de mandat | Tipo de busca | |
| `jobs.form.terms.guaranteeLegend` | Guarantee | Garantie | Garantia | |
| `jobs.form.terms.guaranteeLength` | Length | Durée | Duração | |
| `jobs.form.terms.guaranteeNone` | No guarantee | Aucune garantie | Sem garantia | Option |
| `jobs.form.terms.guaranteeDays` | one: {count} day · other: {count} days | one: {count} jour · other: {count} jours | one: {count} dia · other: {count} dias | plural, options 30–180 |
| `jobs.form.terms.remedy` | If the hire leaves during the guarantee | Si la personne embauchée part pendant la garantie | Se a pessoa contratada sair durante a garantia | Radio-group legend |
| `jobs.form.terms.noGuaranteeNote` | Partners will see that there's no guarantee. | Les partenaires verront qu'il n'y a aucune garantie. | Os parceiros verão que não há garantia. | |
| `jobs.form.terms.paymentTerms` | Client payment terms | Conditions de paiement du client | Prazo de pagamento do cliente | |
| `jobs.form.terms.paymentDays` | days | jours | dias | Adornment (`aria-hidden`; the hint says "days") |
| `jobs.form.terms.paymentHint` | Days the client has to pay after the invoice. The invoice is issued at the start date. | Nombre de jours dont le client dispose pour payer après la facture. La facture est émise à la date d'entrée en fonction. | Dias que o cliente tem para pagar após a fatura. A fatura é emitida na data de início. | |
| `jobs.form.terms.window` | Ownership window | Période de propriété | Período de titularidade | |
| `jobs.form.terms.windowMonths` | one: {count} month · other: {count} months | one: {count} mois · other: {count} mois | one: {count} mês · other: {count} meses | plural, options 6–12 |
| `jobs.form.terms.windowHint` | How long a delivered referral keeps first position with this client. It can't be shorter than the introduction period in your client contract. | Durée pendant laquelle une recommandation transmise conserve sa priorité auprès de ce client. Elle ne peut pas être plus courte que la période de présentation prévue dans votre contrat client. | Por quanto tempo uma indicação entregue mantém a prioridade com este cliente. Não pode ser menor que o período de apresentação do seu contrato com o cliente. | ⚖️ draft (A-5) |
| `jobs.form.terms.shareSalary` | Show partners the salary band and fee estimate | Montrer aux partenaires la fourchette salariale et l'estimation des honoraires | Mostrar aos parceiros a faixa salarial e a estimativa da taxa | Switch label |
| `jobs.form.terms.shareSalaryHint` | With a % fee, the estimate reveals the salary, so the band and the estimate are shown or hidden together. Partners always see the rate. | Avec des honoraires en %, l'estimation révèle le salaire : la fourchette et l'estimation sont donc affichées ou masquées ensemble. Les partenaires voient toujours le taux. | Com taxa em %, a estimativa revela o salário, então a faixa e a estimativa aparecem ou ficam ocultas juntas. Os parceiros sempre veem o percentual. | BR-9 |
| `jobs.form.terms.splitTitle` | Commission split | Partage de la commission | Divisão da comissão | |
| `jobs.form.terms.splitNote` | Set by MissionHub. Each referral keeps the split in force when it's submitted. | Fixé par MissionHub. Chaque recommandation conserve le partage en vigueur au moment de sa soumission. | Definida pelo MissionHub. Cada indicação mantém a divisão vigente no momento do envio. | |

**Attestation, version notes, contract type**

| Key | en | fr-CA | pt-BR | Notes |
|---|---|---|---|---|
| `jobs.form.terms.attestation` | We hold the fee agreement directly with the end client. | Nous détenons l'entente d'honoraires directement avec le client final. | Temos o contrato de taxa diretamente com o cliente final. | ⚖️ draft (attestation) |
| `jobs.form.terms.attestationHint` | Jobs you hold for another agency can't be open to partner referrals. | Un poste que vous gérez pour une autre agence ne peut pas être ouvert aux recommandations de partenaires. | Vagas que você atende para outra agência não podem ser abertas a indicações de parceiros. | E-16 |
| `jobs.form.terms.attestationRequired` | Required to publish | Requis pour publier | Obrigatório para publicar | Marker, only when a version will be published |
| `jobs.form.terms.lastAttested` | Last confirmed by {name} on {date} | Dernière confirmation par {name} le {date} | Última confirmação por {name} em {date} | AC-7 |
| `jobs.form.terms.willPublish` | Saving publishes terms version {version}. | L'enregistrement publiera la version {version} des conditions. | Ao salvar, a versão {version} dos termos será publicada. | Live region |
| `jobs.form.terms.existingReferrals` | one: {count} referral was sent under earlier terms and keeps them. Partners with referrals in progress are told the terms changed. · other: {count} referrals were sent under earlier terms and keep them. Partners with referrals in progress are told the terms changed. | one: {count} recommandation a été envoyée selon des conditions antérieures et les conserve. Les partenaires qui ont des recommandations en cours seront avisés du changement. · other: {count} recommandations ont été envoyées selon des conditions antérieures et les conservent. Les partenaires qui ont des recommandations en cours seront avisés du changement. | one: {count} indicação foi enviada com termos anteriores e continua com eles. Os parceiros com indicações em andamento serão avisados da mudança. · other: {count} indicações foram enviadas com termos anteriores e continuam com eles. Os parceiros com indicações em andamento serão avisados da mudança. | plural, BR-33. Shown only when count ≥ 1. "in progress" replaces the draft's "live" (plainer) |
| `jobs.form.terms.permanentOnly` | Only permanent jobs can be open to partner referrals. Change the contract type or turn off partner referrals. | Seuls les postes permanents peuvent être ouverts aux recommandations de partenaires. Changez le type de contrat ou désactivez les recommandations de partenaires. | Só vagas efetivas podem ser abertas a indicações de parceiros. Mude o tipo de contrato ou desative as indicações de parceiros. | Inline warning under the toggle |

**Validation and form error**

| Key | en | fr-CA | pt-BR | Notes |
|---|---|---|---|---|
| `jobs.validation.feeRateRange` | Enter a rate from 1 to 50, with up to 2 decimals | Entrez un taux de 1 à 50, avec au plus 2 décimales | Informe um percentual de 1 a 50, com até 2 casas decimais | |
| `jobs.validation.flatAmountRequired` | Enter a flat fee above 0 | Entrez des honoraires forfaitaires supérieurs à 0 | Informe uma taxa fixa maior que 0 | Covers both empty and 0 (AC-2) |
| `jobs.validation.minimumPositive` | Enter a minimum fee above 0, or leave it empty | Entrez des honoraires minimaux supérieurs à 0, ou laissez le champ vide | Informe uma taxa mínima maior que 0 ou deixe em branco | |
| `jobs.validation.remedyRequired` | Choose what happens if the hire leaves | Choisissez ce qui se passe si la personne embauchée part | Escolha o que acontece se a pessoa contratada sair | |
| `jobs.validation.paymentDaysRange` | Enter 0 to 90 days | Entrez de 0 à 90 jours | Informe de 0 a 90 dias | |
| `jobs.validation.attestationRequired` | Confirm you hold the fee agreement with the end client | Confirmez que vous détenez l'entente d'honoraires avec le client final | Confirme que você tem o contrato de taxa com o cliente final | |
| `jobs.validation.permanentForReferrals` | Choose Permanent, or turn off partner referrals | Choisissez Permanent, ou désactivez les recommandations de partenaires | Escolha Efetivo ou desative as indicações de parceiros | Names `labels.contractType.permanent` in each locale |
| `jobs.errors.termsIncomplete` | Complete the terms for partners to open this job to partner referrals. | Remplissez les conditions pour les partenaires afin d'ouvrir ce poste aux recommandations de partenaires. | Preencha os termos para parceiros para abrir esta vaga a indicações de parceiros. | `FormMessage` summary |

Forged values (a 45-day guarantee, a 13-month window, an unsupported currency, a minimum on a flat fee) never come from the UI, so they get the existing `errors.invalidFields`. They have no keys of their own.

### 5.4 Jobs list and job page (`jobs.nudge`, `jobs.detail`)

16 keys. Reasons, in priority order: (a) `Terms`, (b) `Permanent`, (c) `Currency` = `currency_mismatch`.

| Key | en | fr-CA | pt-BR | Notes |
|---|---|---|---|---|
| `jobs.nudge.chipTerms` | Hidden from partners: add terms | Masqué aux partenaires : conditions à ajouter | Oculta para parceiros: adicione os termos | Warning chip + `EyeOff`. fr 45 characters, pt 41 (§5.11) |
| `jobs.nudge.chipPermanent` | Hidden from partners: not permanent | Masqué aux partenaires : poste non permanent | Oculta para parceiros: vaga não efetiva | fr 44, pt 39 |
| `jobs.nudge.chipCurrency` | Hidden from partners: check fee currency | Masqué aux partenaires : devise à vérifier | Oculta para parceiros: confira a moeda | (c) `currency_mismatch`. fr 42, pt 38 |
| `jobs.nudge.listBanner` | one: {count} active job is hidden from partners. Open it to see what's missing. · other: {count} active jobs are hidden from partners. Open each one to see what's missing. | one: {count} poste actif est masqué aux partenaires. Ouvrez-le pour voir ce qui manque. · other: {count} postes actifs sont masqués aux partenaires. Ouvrez chacun d'eux pour voir ce qui manque. | one: {count} vaga ativa está oculta para parceiros. Abra-a para ver o que falta. · other: {count} vagas ativas estão ocultas para parceiros. Abra cada uma para ver o que falta. | plural. **Changed from the draft**: the draft said "until you add its terms", which is wrong for reasons (b) and (c). Shown only when count ≥ 1 |
| `jobs.nudge.title` | Hidden from partners | Masqué aux partenaires | Oculta para parceiros | Job-page banner title |
| `jobs.nudge.bodyTerms` | Partners can't see this job or submit to it until you add its terms for partners. Referrals you already received aren't affected. | Les partenaires ne peuvent ni voir ce poste ni y soumettre de candidat tant que vous n'avez pas ajouté ses conditions pour les partenaires. Les recommandations déjà reçues ne sont pas touchées. | Os parceiros não podem ver esta vaga nem enviar candidatos até você adicionar os termos para parceiros. As indicações já recebidas não são afetadas. | (a) |
| `jobs.nudge.bodyPermanent` | Only permanent jobs can be open to partner referrals. Change the contract type, or turn off partner referrals. Referrals you already received aren't affected. | Seuls les postes permanents peuvent être ouverts aux recommandations de partenaires. Changez le type de contrat ou désactivez les recommandations de partenaires. Les recommandations déjà reçues ne sont pas touchées. | Só vagas efetivas podem ser abertas a indicações de parceiros. Mude o tipo de contrato ou desative as indicações de parceiros. As indicações já recebidas não são afetadas. | (b) |
| `jobs.nudge.bodyCurrency` | The fee currency in this job's terms ({termsCurrency}) no longer matches its salary currency ({salaryCurrency}). Partners can't see this job until you review and save its terms, which publishes new terms in {salaryCurrency}. Referrals you already received keep their terms. | La devise des honoraires dans les conditions de ce poste ({termsCurrency}) ne correspond plus à la devise du salaire ({salaryCurrency}). Les partenaires ne voient pas ce poste tant que vous n'avez pas revu et enregistré ses conditions, ce qui publiera de nouvelles conditions en {salaryCurrency}. Les recommandations déjà reçues conservent leurs conditions. | A moeda da taxa nos termos desta vaga ({termsCurrency}) não corresponde mais à moeda do salário ({salaryCurrency}). Os parceiros não veem esta vaga até você revisar e salvar os termos, o que publica novos termos em {salaryCurrency}. As indicações já recebidas mantêm os termos que tinham. | (c) `currency_mismatch` (AC-75). Says what happened, how to fix it and what saving does. It doesn't blame the connector or imply any conversion |
| `jobs.nudge.ctaTerms` | Add terms | Ajouter les conditions | Adicionar termos | (a). Also the S3 empty-state button (reuse) |
| `jobs.nudge.ctaReview` | Review terms | Revoir les conditions | Revisar termos | (c) |
| `jobs.nudge.ctaEdit` | Edit job | Modifier le poste | Editar vaga | (b) |
| `jobs.detail.feeTerms` | Fee terms | Conditions d'honoraires | Termos da taxa | KPI tile label. Value = `jobs.terms.feeShort.*`, or `common.none` "—" |
| `jobs.detail.termsTitle` | Terms for partners | Conditions pour les partenaires | Termos para parceiros | Panel heading |
| `jobs.detail.termsEmpty` | No terms yet. Partners can't see this job until you add them. | Aucune condition pour l'instant. Les partenaires ne voient pas ce poste tant que vous ne les avez pas ajoutées. | Ainda não há termos. Os parceiros não veem esta vaga até você adicioná-los. | Empty state + `jobs.nudge.ctaTerms` |
| `jobs.detail.editTerms` | Edit terms | Modifier les conditions | Editar termos | Link, `jobs:write` only |
| `jobs.detail.visible.terms` | Terms for partners | Conditions pour les partenaires | Termos para parceiros | "What partners see" row, always shown |

### 5.5 Opportunities (`opportunities`)

3 keys. The "Terms updated" chip reuses `jobs.terms.updatedChip`. The share figure uses code display: "CAD 6,750" flat, "~CAD 9,000" estimated.

| Key | en | fr-CA | pt-BR | Notes |
|---|---|---|---|---|
| `opportunities.jobGroup.shareIfHired` | Your share if hired | Votre part en cas d'embauche | Sua parte se houver contratação | Flat basis |
| `opportunities.jobGroup.shareEstimated` | Your estimated share | Votre part estimée | Sua parte estimada | % basis, `share_salary` on |
| `opportunities.jobGroup.feeOnly` | Fee | Honoraires | Taxa | % basis, `share_salary` off. Value = `jobs.terms.feeShort.*` |

### 5.6 Composer, referral page, agreement, hire, objection (`referrals`)

45 keys. Reused as they are: `referrals.hire.startDate`, `.recording`, `.submit`, `.title`; `referrals.validation.enterStartDate`; `referrals.agreement.trigger`, `.confirm`, `.description` (legacy dialog); `referrals.detail.agreement.openPlacement` (link on S6-e); `referrals.detail.ownership` ("Ownership protected until {date}.", delivered). The hire dialog's Terms box uses `TermsSummary variant="compact"` (§5.2 keys).

**Composer (S5)**

| Key | en | fr-CA | pt-BR | Notes |
|---|---|---|---|---|
| `referrals.form.termsLine` | You're submitting under terms version {version} ({date}). | Vous soumettez selon la version {version} des conditions ({date}). | Você está enviando com a versão {version} dos termos ({date}). | `FileCheck2` icon |
| `referrals.form.termsLineConfirm` | These terms apply even if the candidate confirms later. | Ces conditions s'appliquent même si le candidat confirme plus tard. | Estes termos valem mesmo que o candidato confirme depois. | Candidate-confirms path |
| `referrals.termsChanged.title` | The terms for this job changed | Les conditions de ce poste ont changé | Os termos desta vaga mudaram | S5-e |
| `referrals.termsChanged.description` | {partner} published new terms on {date}. Nothing was sent. Review the changes marked below, then submit again. | {partner} a publié de nouvelles conditions le {date}. Rien n'a été envoyé. Vérifiez les changements indiqués ci-dessous, puis soumettez de nouveau. | {partner} publicou novos termos em {date}. Nada foi enviado. Confira as mudanças marcadas abaixo e envie de novo. | |
| `referrals.termsChanged.submit` | Submit under new terms | Soumettre à ces conditions | Enviar com os novos termos | en 22, fr 26, pt 26 characters (≤ 30, §5.11). Pending label reuses the existing "Submitting…" |

**Referral page (S6) and agreement (S7)**

| Key | en | fr-CA | pt-BR | Notes |
|---|---|---|---|---|
| `referrals.detail.terms.title` | Terms | Conditions | Termos | Panel title |
| `referrals.detail.terms.newerOnJob` | This job's terms are now version {current}. This referral keeps version {version}. | Les conditions de ce poste en sont maintenant à la version {current}. Cette recommandation conserve la version {version}. | Os termos desta vaga estão agora na versão {current}. Esta indicação mantém a versão {version}. | Both sides |
| `referrals.detail.terms.placementLine` | Computed fee {computed} · invoiced {invoiced} | Honoraires calculés {computed} · facturés {invoiced} | Taxa calculada {computed} · faturada {invoiced} | S6-e |
| `referrals.detail.ownershipStartsAtDelivery` | one: Ownership starts when the referral is delivered: {count} month with this client. · other: Ownership starts when the referral is delivered: {count} months with this client. | one: La propriété commence à la transmission de la recommandation : {count} mois auprès de ce client. · other: La propriété commence à la transmission de la recommandation : {count} mois auprès de ce client. | one: A titularidade começa quando a indicação for entregue: {count} mês com este cliente. · other: A titularidade começa quando a indicação for entregue: {count} meses com este cliente. | plural. Sourcing side, undelivered. Never shows a date (AC-37, AC-74) |
| `referrals.detail.agreement.pendingSnapshot` | Created when the hiring recruiter accepts, from the terms and split this referral was submitted under. The split is frozen for this referral. | Créée lorsque le recruteur du poste accepte, à partir des conditions et du partage en vigueur à la soumission. Le partage est figé pour cette recommandation. | Criado quando o recrutador da vaga aceitar, com os termos e a divisão vigentes no envio. A divisão fica congelada para esta indicação. | Replaces `detail.agreement.pending` for snapshot referrals |
| `referrals.agreement.title` | Confirm the collaboration agreement? | Confirmer l'entente de collaboration? | Confirmar o acordo de colaboração? | **changed** (value). It's now a question, because the dialog commits A (voice §3.4). Button stays `agreement.confirm` |
| `referrals.agreement.descriptionSnapshot` | These are the terms this referral was submitted under on {date}. They can't be changed for this referral unless both organizations ask MissionHub in writing before a hire. The network rules are a draft pending legal review. | Voici les conditions selon lesquelles cette recommandation a été soumise le {date}. Elles ne peuvent pas être modifiées pour cette recommandation, sauf si les deux organisations le demandent par écrit à MissionHub avant l'embauche. Les règles du réseau sont une ébauche en attente de révision juridique. | Estes são os termos com que esta indicação foi enviada em {date}. Eles não podem ser alterados para esta indicação, a menos que as duas organizações peçam por escrito ao MissionHub antes da contratação. As regras da rede são um rascunho pendente de revisão jurídica. | ⚖️ draft (frozen terms, amendment rule) |

**Hire dialog (S8)**

| Key | en | fr-CA | pt-BR | Notes |
|---|---|---|---|---|
| `referrals.hire.descriptionSnapshot` | Creates the placement from the terms this referral was submitted under. Commission stays projected until the client's payment is verified. | Crée le placement à partir des conditions de cette recommandation. La commission reste prévue jusqu'à ce que le paiement du client soit vérifié. | Cria a colocação com os termos desta indicação. A comissão fica prevista até o pagamento do cliente ser verificado. | fr uses *prévue* (glossary ledger state), not *projetée* |
| `referrals.hire.termsTitle` | Terms | Conditions | Termos | |
| `referrals.hire.base` | First-year base salary ({currency}) | Salaire de base de la première année ({currency}) | Salário-base do primeiro ano ({currency}) | % bases |
| `referrals.hire.baseHint` | From the accepted offer. Both organizations see this amount; the candidate doesn't. | Selon l'offre acceptée. Les deux organisations voient ce montant; le candidat, non. | Conforme a oferta aceita. As duas organizações veem este valor; o candidato, não. | |
| `referrals.hire.bonus` | Target bonus ({currency}) | Prime cible ({currency}) | Bônus-alvo ({currency}) | Total cash only |
| `referrals.hire.bonusHint` | Annual target bonus in the offer. Enter 0 if there's none. Don't include equity, signing bonus, benefits or relocation. | Prime cible annuelle prévue dans l'offre. Entrez 0 s'il n'y en a pas. N'incluez pas les actions, la prime d'embauche, les avantages sociaux ni les frais de réinstallation. | Bônus-alvo anual previsto na oferta. Informe 0 se não houver. Não inclua ações, bônus de contratação, benefícios nem auxílio-mudança. | |
| `referrals.hire.computedFee` | Computed fee | Honoraires calculés | Taxa calculada | Result box |
| `referrals.hire.breakdownRate` | {rate} × {amount} | {rate} × {amount} | {rate} × {amount} | Also used by the S9 Computed fee cell (reuse) |
| `referrals.hire.breakdownMinimum` | Minimum fee applies | Les honoraires minimaux s'appliquent | Vale a taxa mínima | Same |
| `referrals.hire.breakdownFlat` | Flat fee | Honoraires forfaitaires | Taxa fixa | Same |
| `referrals.hire.guaranteeEnds` | Guarantee ends {date} | Fin de la garantie : {date} | A garantia termina em {date} | |
| `referrals.hire.noGuarantee` | No guarantee | Aucune garantie | Sem garantia | |
| `referrals.hire.differentToggle` | Invoiced fee is different | Les honoraires facturés sont différents | A taxa faturada é diferente | Checkbox |
| `referrals.hire.invoiced` | Invoiced fee ({currency}) | Honoraires facturés ({currency}) | Taxa faturada ({currency}) | |
| `referrals.hire.invoicedHint` | This hire's fee to the client, retainer included. Don't include other services. | Les honoraires facturés au client pour cette embauche, provision comprise. N'incluez pas d'autres services. | A taxa cobrada do cliente por esta contratação, adiantamento incluído. Não inclua outros serviços. | **new** (BR-23, RD-031) |
| `referrals.hire.reason` | Reason | Motif | Motivo | Options = `labels.feeDifferenceReason.*` |
| `referrals.hire.note` | Note (optional) | Note (facultative) | Nota (opcional) | |
| `referrals.hire.noteRequired` | Note | Note | Nota | **new**. Label when reason = `other` |
| `referrals.hire.noteHint` | Both organizations see this note. Don't include candidate names or contact details. | Les deux organisations voient cette note. N'incluez pas le nom ni les coordonnées du candidat. | As duas organizações veem esta nota. Não inclua nomes nem contatos de candidatos. | |
| `referrals.hire.difference` | Difference: {amount} | Écart : {amount} | Diferença: {amount} | Signed amount, code display |
| `referrals.hire.lowerConsequence` | {partner}'s share stays based on the computed fee, so your share covers the difference and can go below zero. {partner} is notified. | La part de {partner} reste établie sur les honoraires calculés : votre part couvre donc l'écart et peut devenir négative. {partner} sera avisé. | A parte de {partner} continua baseada na taxa calculada, então sua parte cobre a diferença e pode ficar negativa. {partner} será avisado. | ⚖️ draft (floor wording). I < C |
| `referrals.hire.higherConsequence` | Shares are never calculated on less than the computed fee. When you invoice more, every share follows the invoiced fee. {partner} is notified. | Les parts ne sont jamais établies sur moins que les honoraires calculés. Si vous facturez plus, chaque part suit les honoraires facturés. {partner} sera avisé. | As partes nunca são calculadas sobre menos que a taxa calculada. Se você faturar mais, todas as partes acompanham a taxa faturada. {partner} será avisado. | ⚖️ draft (floor wording, RD-031). I > C. **Changed from the draft**: "The terms set a minimum" was easy to confuse with the minimum fee (T3) |
| `referrals.hire.legacyTitle` | Terms not recorded | Conditions non enregistrées | Termos não registrados | Info alert |
| `referrals.hire.legacyDescription` | This referral was sent before the terms card. Enter the fee, currency and guarantee as agreed with {partner}. | Cette recommandation a été envoyée avant les conditions du poste. Entrez les honoraires, la devise et la garantie convenus avec {partner}. | Esta indicação foi enviada antes dos termos da vaga. Informe a taxa, a moeda e a garantia combinadas com {partner}. | |

**Validation and objection (S12)**

| Key | en | fr-CA | pt-BR | Notes |
|---|---|---|---|---|
| `referrals.validation.baseRequired` | Enter a base salary above 0 | Entrez un salaire de base supérieur à 0 | Informe um salário-base maior que 0 | Covers both missing and ≤ 0 |
| `referrals.validation.bonusRequired` | Enter the target bonus, or 0 | Entrez la prime cible, ou 0 | Informe o bônus-alvo ou 0 | |
| `referrals.validation.invoicedSame` | Enter a different amount, or untick “Invoiced fee is different” | Entrez un montant différent, ou décochez « Les honoraires facturés sont différents » | Informe um valor diferente ou desmarque “A taxa faturada é diferente” | Curly quotes / guillemets (no `\"`) |
| `referrals.validation.invoicedPositive` | Enter an invoiced fee above 0 | Entrez des honoraires facturés supérieurs à 0 | Informe uma taxa faturada maior que 0 | **new** |
| `referrals.validation.reasonRequired` | Choose a reason | Choisissez un motif | Escolha um motivo | |
| `referrals.validation.noteRequiredOther` | Add a note to explain the difference | Ajoutez une note pour expliquer l'écart | Adicione uma nota explicando a diferença | |
| `referrals.validation.noteTooLong` | Keep the note to 500 characters or fewer | Limitez la note à 500 caractères | Use no máximo 500 caracteres na nota | **new** |
| `referrals.claim.priorDateWindowHint` | one: This referral's ownership window is {count} month, so you can go back {count} month. · other: This referral's ownership window is {count} months, so you can go back {count} months. | one: La période de propriété de cette recommandation est de {count} mois : vous pouvez donc remonter jusqu'à {count} mois. · other: La période de propriété de cette recommandation est de {count} mois : vous pouvez donc remonter jusqu'à {count} mois. | one: O período de titularidade desta indicação é de {count} mês, então você pode voltar até {count} mês. · other: O período de titularidade desta indicação é de {count} meses, então você pode voltar até {count} meses. | plural. Snapshot referrals only (AC-38) |
| `referrals.claim.validation.priorDateTooOld` | one: Enter a date on or after {date} ({count} month before delivery) · other: Enter a date on or after {date} ({count} months before delivery) | one: Entrez une date à partir du {date} ({count} mois avant la transmission) · other: Entrez une date à partir du {date} ({count} mois avant la transmission) | one: Informe uma data a partir de {date} ({count} mês antes da entrega) · other: Informe uma data a partir de {date} ({count} meses antes da entrega) | **changed** (value and shape). It used to be a string that said "6 months". Now it's a plural with `{count}` = the referral's look-back (T9, or 6 for legacy). Frontend passes `count` |

### 5.7 Commissions (`commissions`)

20 keys. The S9 Computed fee breakdown reuses `referrals.hire.breakdown*`, and the "Open dispute" pointer reuses `commissions.forms.openDispute`. The legacy panel also shows `jobs.terms.notRecorded`.

| Key | en | fr-CA | pt-BR | Notes |
|---|---|---|---|---|
| `commissions.detail.fee.title` | Fee | Honoraires | Taxa | Panel title |
| `commissions.detail.fee.terms` | Terms | Conditions | Termos | Cell label |
| `commissions.detail.fee.version` | Version {version} | Version {version} | Versão {version} | |
| `commissions.detail.fee.amended` | Amended on {date} | Modifiées le {date} | Alterados em {date} | |
| `commissions.detail.fee.base` | Base salary | Salaire de base | Salário-base | |
| `commissions.detail.fee.bonus` | Target bonus {amount} | Prime cible {amount} | Bônus-alvo {amount} | |
| `commissions.detail.fee.computed` | Computed fee | Honoraires calculés | Taxa calculada | |
| `commissions.detail.fee.invoiced` | Invoiced fee | Honoraires facturés | Taxa faturada | |
| `commissions.detail.fee.difference` | Difference {amount} | Écart {amount} | Diferença {amount} | Signed |
| `commissions.detail.fee.note` | “{note}” | « {note} » | “{note}” | **new**. Quoted hire note (stored text, never translated) |
| `commissions.detail.fee.noNote` | No note. | Aucune note. | Sem nota. | |
| `commissions.detail.fee.legacyFee` | Placement fee {fee} | Honoraires de placement {fee} | Taxa de colocação {fee} | **new**. Legacy placements (2.7 item 6) |
| `commissions.detail.fee.lowerSource` | {partner} invoiced less than the computed fee. Your share is still based on the computed fee ({computed}) and becomes payable as the client's payments are verified. If you disagree with the difference, you can open a dispute. | {partner} a facturé moins que les honoraires calculés. Votre part reste établie sur les honoraires calculés ({computed}) et devient à verser à mesure que les paiements du client sont vérifiés. Si vous n'êtes pas d'accord avec l'écart, vous pouvez ouvrir un litige. | {partner} faturou menos que a taxa calculada. Sua parte continua baseada na taxa calculada ({computed}) e fica a pagar à medida que os pagamentos do cliente forem verificados. Se não concordar com a diferença, você pode abrir uma disputa. | ⚖️ draft (floor wording). Sourcing side, I < C. fr avoids *contester*, which belongs to objections |
| `commissions.detail.fee.lowerTarget` | You invoiced less than the computed fee. {partner}'s share stays based on the computed fee, so your share covers the difference. | Vous avez facturé moins que les honoraires calculés. La part de {partner} reste établie sur les honoraires calculés : votre part couvre donc l'écart. | Você faturou menos que a taxa calculada. A parte de {partner} continua baseada na taxa calculada, então sua parte cobre a diferença. | ⚖️ draft (floor wording). Hiring side, I < C |
| `commissions.detail.fee.negativeTarget` | Your projected share is {amount}. This is the part of {partner}'s share that the invoiced fee doesn't cover. You pay it to {partner} directly. | Votre part prévue est de {amount}. C'est la portion de la part de {partner} que les honoraires facturés ne couvrent pas. Vous la versez directement à {partner}. | Sua parte prevista é de {amount}. Esse é o valor da parte de {partner} que a taxa faturada não cobre. Você o paga diretamente a {partner}. | Hiring side, negative projected share. **Changed from the draft**: dropped "from your own funds" (it read as blame). Says who pays whom, with no "owe" or "debt" |
| `commissions.detail.fee.higher` | The invoiced fee is higher than the computed fee. Shares are never calculated on less than the computed fee, so every share follows the invoiced fee. | Les honoraires facturés dépassent les honoraires calculés. Les parts ne sont jamais établies sur moins que les honoraires calculés : chaque part suit donc les honoraires facturés. | A taxa faturada é maior que a taxa calculada. As partes nunca são calculadas sobre menos que a taxa calculada, então todas acompanham a taxa faturada. | ⚖️ draft (floor wording, RD-031). Both sides. No "bonus" or "penalty" |
| `commissions.detail.negativeShareHint` | Below zero because the invoiced fee is lower than the computed fee. | Négative parce que les honoraires facturés sont inférieurs aux honoraires calculés. | Negativa porque a taxa faturada é menor que a taxa calculada. | Under the job-owner tile. No danger colour |
| `commissions.detail.platformBasis.collected` | Calculated on the fee collected | Établie sur les honoraires encaissés | Baseada na taxa recebida | Platform tile, only when I ≠ C. Shipped value (PD-049) |
| `commissions.detail.platformBasis.frozen` | Calculated on the computed fee | Établie sur les honoraires calculés | Baseada na taxa calculada | Test value. fr/pt avoid "calculée sur les honoraires calculés" |
| `commissions.table.computedSub` | Computed {amount} | Calculés : {amount} | Calculada: {amount} | Sub-line in the Fee column when C ≠ I |

### 5.8 Admin (`admin`)

50 keys. The admin console may say "ID" (staff-only, voice §3.10). The amendment form reuses the §5.3 field labels, hints and validation. In `changeLine`, `{field}` = the `jobs.terms.rows.*` label, and `{from}` / `{to}` = the formatted values.

**Lookup and meta**

| Key | en | fr-CA | pt-BR | Notes |
|---|---|---|---|---|
| `admin.nav.referralTerms` | Referral terms | Conditions des recommandations | Termos das indicações | Sidebar › Finance |
| `admin.referralTerms.title` | Referral terms | Conditions des recommandations | Termos das indicações | |
| `admin.referralTerms.description` | Find a referral to see its terms, or record an amendment both organizations asked for in writing. | Trouvez une recommandation pour voir ses conditions ou enregistrer une modification demandée par écrit par les deux organisations. | Encontre uma indicação para ver os termos ou registrar uma alteração pedida por escrito pelas duas organizações. | |
| `admin.referralTerms.lookupLabel` | Referral link or ID | Lien ou identifiant de la recommandation | Link ou ID da indicação | |
| `admin.referralTerms.lookupHint` | Paste the referral link from the organizations' written request. | Collez le lien de la recommandation tiré de la demande écrite des organisations. | Cole o link da indicação que está no pedido por escrito das organizações. | |
| `admin.referralTerms.find` | Find referral | Trouver la recommandation | Buscar indicação | fr 25 characters |
| `admin.referralTerms.finding` | Finding… | Recherche… | Buscando… | |
| `admin.referralTerms.notFound` | No referral matches this link or ID. Check it and try again. | Aucune recommandation ne correspond à ce lien ou à cet identifiant. Vérifiez-le et réessayez. | Nenhuma indicação corresponde a este link ou ID. Confira e tente de novo. | Inline field error |
| `admin.referralTerms.meta.job` | Job | Poste | Vaga | **new** (S10 meta `dl`) |
| `admin.referralTerms.meta.hiringOrg` | Hiring organization | Organisation du poste | Organização da vaga | **new** |
| `admin.referralTerms.meta.sourcingOrg` | Sourcing organization | Organisation d'origine | Organização de origem | **new** |
| `admin.referralTerms.meta.status` | Status | Statut | Status | **new**. Value = `labels.referralStatus.*` |
| `admin.referralTerms.meta.delivered` | Delivered | Transmise le | Entregue em | **new**. Value = date, or `notDelivered` |
| `admin.referralTerms.meta.placement` | Placement | Placement | Colocação | **new** |
| `admin.referralTerms.meta.viewPlacement` | Open placement | Ouvrir le placement | Abrir colocação | **new**. Link |
| `admin.referralTerms.meta.noPlacement` | No placement | Aucun placement | Sem colocação | **new** |
| `admin.referralTerms.meta.client` | Client | Client | Cliente | **new**. Value as partners see it ("Confidential" or the name) |
| `admin.referralTerms.meta.candidate` | Candidate | Candidat | Candidato | **new**. Value = candidate label only |

**Terms, history, amendment form**

| Key | en | fr-CA | pt-BR | Notes |
|---|---|---|---|---|
| `admin.referralTerms.effective` | Effective terms | Conditions en vigueur | Termos vigentes | |
| `admin.referralTerms.history` | History | Historique | Histórico | |
| `admin.referralTerms.historyOriginal` | Original: job terms version {version} · {date} | Initiales : version {version} des conditions du poste · {date} | Original: versão {version} dos termos da vaga · {date} | |
| `admin.referralTerms.historyAmendment` | Amendment · {date} · {admin} | Modification · {date} · {admin} | Alteração · {date} · {admin} | |
| `admin.referralTerms.historyReason` | Reason: {reason} | Motif : {reason} | Motivo: {reason} | **new**. Admin-only |
| `admin.referralTerms.historyRequests` | Written requests: hiring organization “{hiring}” · sourcing organization “{sourcing}” | Demandes écrites : organisation du poste « {hiring} » · organisation d'origine « {sourcing} » | Pedidos por escrito: organização da vaga “{hiring}” · organização de origem “{sourcing}” | **new**. Admin-only |
| `admin.referralTerms.amendTitle` | Record an amendment | Enregistrer une modification | Registrar uma alteração | Panel title |
| `admin.referralTerms.amendDescription` | Only when both organizations asked in writing, before a hire is reported. The original terms stay visible to both. | Seulement si les deux organisations l'ont demandé par écrit, avant qu'une embauche soit déclarée. Les conditions initiales restent visibles pour les deux. | Somente quando as duas organizações pediram por escrito, antes de uma contratação ser informada. Os termos originais continuam visíveis para ambas. | ⚖️ draft (amendment rule) |
| `admin.referralTerms.attestationCarried` | The hiring organization's direct-client statement carries over from the original terms. | La déclaration de client direct de l'organisation du poste est reprise des conditions initiales. | A declaração de cliente direto da organização da vaga é mantida dos termos originais. | **new**. T6 isn't editable |
| `admin.referralTerms.splitLocked` | The split can't be amended. | Le partage ne peut pas être modifié. | A divisão não pode ser alterada. | **new**. Under the read-only split |
| `admin.referralTerms.windowLocked` | This referral was delivered on {date}. The ownership window can't change after delivery. | Cette recommandation a été transmise le {date}. La période de propriété ne peut plus changer après la transmission. | Esta indicação foi entregue em {date}. O período de titularidade não pode mudar depois da entrega. | `aria-describedby` of the disabled T9 |
| `admin.referralTerms.reason` | Reason | Motif | Motivo | |
| `admin.referralTerms.reasonHint` | Only platform admins see this. 10 to 1,000 characters. Don't include candidate names or contact details. | Seuls les administrateurs de la plateforme le voient. 10 à 1000 caractères. N'incluez pas le nom ni les coordonnées du candidat. | Só admins da plataforma veem. De 10 a 1.000 caracteres. Não inclua nomes nem contatos de candidatos. | |
| `admin.referralTerms.requestHiring` | Hiring organization's written request | Demande écrite de l'organisation du poste | Pedido por escrito da organização da vaga | |
| `admin.referralTerms.requestSourcing` | Sourcing organization's written request | Demande écrite de l'organisation d'origine | Pedido por escrito da organização de origem | |
| `admin.referralTerms.requestHint` | Where to find it, e.g. email of Nov 14 from the organization admin. 3 to 200 characters. | Où la retrouver, p. ex. courriel du 14 nov. de l'administrateur de l'organisation. 3 à 200 caractères. | Onde encontrar, ex.: e-mail de 14 nov. do administrador da organização. De 3 a 200 caracteres. | Shared by both reference fields. The example names no person |
| `admin.referralTerms.bothAsked` | Both organizations asked for this change in writing. | Les deux organisations ont demandé ce changement par écrit. | As duas organizações pediram esta alteração por escrito. | Checkbox |
| `admin.referralTerms.validation.reasonLength` | Enter a reason of 10 to 1,000 characters | Entrez un motif de 10 à 1000 caractères | Informe um motivo de 10 a 1.000 caracteres | **new** |
| `admin.referralTerms.validation.requestLength` | Enter a reference of 3 to 200 characters | Entrez une référence de 3 à 200 caractères | Informe uma referência de 3 a 200 caracteres | **new**. Both reference fields |
| `admin.referralTerms.validation.bothAskedRequired` | Confirm both organizations asked in writing | Confirmez que les deux organisations l'ont demandé par écrit | Confirme que as duas organizações pediram por escrito | **new** |

**Confirmation, outcomes, blocked states, metrics**

| Key | en | fr-CA | pt-BR | Notes |
|---|---|---|---|---|
| `admin.referralTerms.amendSubmit` | Record amendment | Enregistrer la modification | Registrar alteração | Form button and dialog confirm. fr 27 characters (stacked full width below `sm`) |
| `admin.referralTerms.amendConfirmTitle` | Record this terms amendment? | Enregistrer cette modification des conditions? | Registrar esta alteração dos termos? | |
| `admin.referralTerms.amendConfirmDescription` | Both organizations are notified, and the original terms stay visible. You can't undo this, but you can record another amendment before a hire is reported. | Les deux organisations seront avisées, et les conditions initiales resteront visibles. Vous ne pourrez pas annuler cette action, mais vous pourrez enregistrer une autre modification avant qu'une embauche soit déclarée. | As duas organizações serão avisadas, e os termos originais continuam visíveis. Não é possível desfazer, mas você pode registrar outra alteração antes de uma contratação ser informada. | Above the `ul` of `changeLine` items |
| `admin.referralTerms.changeLine` | {field}: {from} → {to} | {field} : {from} → {to} | {field}: {from} → {to} | "Guarantee: 90 days → 60 days" |
| `admin.referralTerms.recording` | Recording… | Enregistrement… | Registrando… | |
| `admin.referralTerms.messages.recorded` | Amendment recorded. Both organizations were notified. | Modification enregistrée. Les deux organisations ont été avisées. | Alteração registrada. As duas organizações foram avisadas. | Toast |
| `admin.referralTerms.blockedHired` | A hire was reported on {date}. Terms can't be amended after a hire; fee differences go through the hire report and disputes. | Une embauche a été déclarée le {date}. Les conditions ne peuvent pas être modifiées après une embauche; les écarts d'honoraires passent par la déclaration d'embauche et les litiges. | Uma contratação foi informada em {date}. Os termos não podem ser alterados depois da contratação; diferenças de taxa são tratadas no registro da contratação e em disputas. | RD-035 |
| `admin.referralTerms.blockedLegacy` | This referral was sent before the terms card. There are no recorded terms to amend. | Cette recommandation a été envoyée avant les conditions du poste. Il n'y a aucune condition enregistrée à modifier. | Esta indicação foi enviada antes dos termos da vaga. Não há termos registrados para alterar. | |
| `admin.referralTerms.notDelivered` | Not delivered | Non transmise | Não entregue | |
| `admin.termsMetrics.title` | Terms for partners | Conditions pour les partenaires | Termos para parceiros | S11 panel |
| `admin.termsMetrics.completeTerms` | Partner-visible jobs with complete terms | Postes visibles par les partenaires avec conditions complètes | Vagas visíveis a parceiros com termos completos | |
| `admin.termsMetrics.hiddenJobs` | Referral-open jobs hidden for missing terms | Postes ouverts aux recommandations masqués faute de conditions | Vagas abertas a indicações ocultas por falta de termos | Load error = `errors.generic`, never 0 |

### 5.9 Errors (`errors`, root; snake_case = RPC codes)

11 keys. Each one says what happened and how to fix it. None names an id, another organization or an internal code.

| Key | en | fr-CA | pt-BR | Notes |
|---|---|---|---|---|
| `errors.terms_incomplete` | Complete the terms for partners to open this job to partner referrals. | Remplissez les conditions pour les partenaires afin d'ouvrir ce poste aux recommandations de partenaires. | Preencha os termos para parceiros para abrir esta vaga a indicações de parceiros. | |
| `errors.referrals_require_permanent` | Only permanent jobs can be open to partner referrals. Change the contract type, or turn off partner referrals. | Seuls les postes permanents peuvent être ouverts aux recommandations de partenaires. Changez le type de contrat ou désactivez les recommandations de partenaires. | Só vagas efetivas podem ser abertas a indicações de parceiros. Mude o tipo de contrato ou desative as indicações de parceiros. | Fix sentence added |
| `errors.terms_attestation_required` | Confirm you hold the fee agreement with the end client to publish these terms. | Confirmez que vous détenez l'entente d'honoraires avec le client final pour publier ces conditions. | Confirme que você tem o contrato de taxa com o cliente final para publicar estes termos. | |
| `errors.hire_terms_fixed` | This referral's currency and guarantee come from its terms and can't be entered. Refresh and try again. | La devise et la garantie de cette recommandation viennent de ses conditions et ne peuvent pas être saisies. Actualisez la page et réessayez. | A moeda e a garantia desta indicação vêm dos termos dela e não podem ser informadas. Atualize a página e tente de novo. | |
| `errors.fee_difference_reason_required` | Choose a reason for the different invoiced fee. | Choisissez un motif pour l'écart d'honoraires facturés. | Escolha um motivo para a taxa faturada diferente. | |
| `errors.amendment_after_hire` | A hire was already reported. Terms can't be amended after a hire. | Une embauche a déjà été déclarée. Les conditions ne peuvent pas être modifiées après une embauche. | Uma contratação já foi informada. Os termos não podem ser alterados depois da contratação. | |
| `errors.amendment_window_after_delivery` | The ownership window can't change on a delivered referral. Keep the current window. | La période de propriété ne peut pas changer pour une recommandation transmise. Conservez la période actuelle. | O período de titularidade não pode mudar em uma indicação entregue. Mantenha o período atual. | |
| `errors.amendment_no_change` | Change at least one term to record an amendment. | Modifiez au moins une condition pour enregistrer une modification. | Altere pelo menos um termo para registrar uma alteração. | |
| `errors.amendment_legacy_referral` | This referral has no recorded terms to amend. | Cette recommandation n'a aucune condition enregistrée à modifier. | Esta indicação não tem termos registrados para alterar. | |
| `errors.terms_not_recorded` | This referral was sent before the terms card, so its fee, currency and guarantee are entered by hand. Refresh and try again. | Cette recommandation a été envoyée avant les conditions du poste : ses honoraires, sa devise et sa garantie se saisissent manuellement. Actualisez la page et réessayez. | Esta indicação foi enviada antes dos termos da vaga, então a taxa, a moeda e a garantia são informadas manualmente. Atualize a página e tente de novo. | |
| `errors.claim_date_invalid` | Pick a date before this referral was delivered, within the dates shown under the field. | Choisissez une date antérieure à la transmission de la recommandation, entre les dates indiquées sous le champ. | Escolha uma data anterior à entrega da indicação, dentro das datas indicadas abaixo do campo. | **changed** (value). The old text hard-coded "6 months", but the look-back is now T9 (6–12) for snapshot referrals. It takes no parameter, since `msg()` RPC markers carry none. The field hint (`claim.priorDateHint`) shows the dates |

These codes are the shared list from brief §11.2 item 10, plus `claim_date_invalid`. `hire_terms_pending` (drop 1 only) maps to the existing `errors.generic` and gets no key of its own. `terms_changed` is an outcome, not an error. A stale or forged `termsVersionId` uses S5-e, and a non-UUID uses `errors.invalidFields`. If backend needs a code that isn't listed here, it should use `errors.generic` and tell ux-writer. It shouldn't write new user-facing text.

### 5.10 Notifications (S13; English in SQL, PD-026)

The en text is final, and backend writes it into SQL. fr and pt are ready for N7's localized pipeline. Backend doesn't use them in N2. Amounts use the ISO code ("CAD 20,000.00"). No candidate data appears, and no text says MissionHub moves money.

| Kind | en (final, SQL) | fr-CA (for N7) | pt-BR (for N7) | Notes |
|---|---|---|---|---|
| `job.terms_changed` | {org} updated the terms for {job}. Your referrals keep the terms they were sent under. | {org} a mis à jour les conditions du poste {job}. Vos recommandations conservent les conditions selon lesquelles elles ont été envoyées. | {org} atualizou os termos da vaga {job}. Suas indicações mantêm os termos com que foram enviadas. | Once per source org (2.10) |
| `placement.fee_difference` | {org} reported a hire for {job} with an invoiced fee of {invoiced} instead of the computed {computed}. Reason: {reason}. | {org} a déclaré une embauche pour {job} avec des honoraires facturés de {invoiced} au lieu des {computed} calculés. Motif : {reason}. | {org} informou uma contratação para {job} com taxa faturada de {invoiced} em vez da taxa calculada de {computed}. Motivo: {reason}. | `{reason}` = en label from `labels.feeDifferenceReason` (§5.1). Neutral, with both numbers |
| `referral_terms_amended` (name: backend's choice) | A platform admin recorded a terms amendment on the referral for {job}, at both organizations' written request. Review the new terms on the referral. | Un administrateur de la plateforme a enregistré une modification des conditions de la recommandation pour {job}, à la demande écrite des deux organisations. Consultez les nouvelles conditions dans la recommandation. | Um admin da plataforma registrou uma alteração dos termos da indicação para {job}, a pedido por escrito das duas organizações. Veja os novos termos na indicação. | Both orgs. Never includes the reason or the references (admin-only) |

### 5.11 Truncation and layout risks (fr ~25% longer; checked at 375px)

Character counts include spaces and assume a typical value (date "15 nov. 2026" = 12 characters).

| String | en | fr | pt | Risk at 375px | What to do |
|---|---|---|---|---|---|
| `jobs.nudge.chipTerms` / `chipPermanent` / `chipCurrency` | 31 / 35 / 40 | **45 / 44 / 42** | 41 / 39 / 38 | **Medium.** About 43 characters fit on one `text-xs` chip line in a jobs-list row. fr wraps to 2 lines | The chip must allow wrapping (`whitespace-normal`, no `truncate` or `line-clamp`). It sits under the title (spec mobile note). Don't shorten fr by dropping "aux partenaires": the chip text must stand alone (voice §6.9) |
| `jobs.terms.updatedChip` | 29 | 36 | 34 | Low on the S4 card | Allow wrapping. fr already uses *modifiées* to save 5 characters |
| `referrals.termsChanged.submit` | 22 | 26 | 26 | OK (≤ 30) | — |
| `admin.referralTerms.amendSubmit` | 16 | 27 | 19 | OK. Footer buttons stack full width below `sm` | — |
| `jobs.nudge.ctaTerms` / `ctaReview` / `detail.editTerms` / `ctaEdit` | 9 / 12 / 10 / 8 | 22 / 21 / 23 / 17 | 16 / 14 / 13 / 11 | OK (≤ 25) | — |
| `jobs.detail.feeTerms` value (`feeShort.pctTotalCash`) | "20% of total cash" 17 | "20 % de la rémunération globale" **31** | "20% da remuneração total" 24 | **Medium.** The KPI value is large type in a narrow tile | The KPI value must wrap (no `truncate`). If the tile is 2-up at 375px, render this tile's value at `text-lg` or make the tile full width |
| `labels.feeBasis.pct_total_cash` option card | 15 | 28 | 22 | Low. Wraps to 2 lines on `sm:grid-cols-3` | Cards grow in height. Equal heights per row |
| `labels.guaranteeRemedy.replacement_then_prorata` | 33 | 43 | 43 | Low. Vertical radios, wraps | 44px minimum row height. Wrap OK |
| `referrals.hire.differentToggle` | 25 | 39 | 27 | Low. Checkbox label, full-row hit area | Wrap OK |
| `jobs.form.terms.shareSalary` | 46 | 78 | 61 | Low. Switch row | The label wraps beside the switch. Keep the switch top-aligned |
| `jobs.terms.notRecorded` (sent-list muted line) | 47 | 77 | 62 | Low. Muted line under the row | Wrap OK |
| Version pill `versionPill` | ~24 | ~24 | ~23 | OK | Short date format |
| `jobs.terms.split` | ~45 | ~47 | ~45 | OK. Wraps in `dl` | — |

**Hard-coded text to avoid:** "%" and currency adornments come from `Intl` or the currency code, never from a translated string. "v{version}" is the same in all locales.

---

## 6. Accessibility (WCAG 2.1 AA)

**Keyboard and focus**
- **Job form card:** Tab moves basis radio group (arrows switch) → rate → minimum (or flat amount → currency) → search type group → guarantee length → remedy group → payment days → window → share_salary switch (Space) → attestation (Space) → form buttons.
  - When the basis changes, focus stays on the radio and the dependent fields swap in place below it, announced by the version-note live region only when relevant.
  - After a server error, focus moves to the first invalid field.
  - Deep link `#terms` focuses the panel heading (`tabIndex=-1`).
- **Composer:** the terms panel is read in order before the submit panel. On S5-e, focus moves to the alert. The Changed badges have text and are announced with each row ("Guarantee, 60 days, changed").
- **Agreement and hire dialogs:** focus starts on the title (agreement) or the first input (hire). The result box is `role="status"`. Ticking "Invoiced fee is different" reveals the fields right after the checkbox in DOM order. Unticking returns focus to the checkbox. Esc closes without changes. Focus returns to the trigger.
- **Admin amendment:** form order follows S1. The disabled T9 has `aria-describedby` to the lock hint. The confirmation dialog lists changes as a `ul`.

**Labels and semantics**
- Every enum is a labelled `RadioGroup` (`role="radiogroup"` with `aria-labelledby` = legend) or a labelled select. `fieldset`/`legend` per card section.
- Read-only terms (S5 to S8) are `dl` text, **never disabled inputs** (brief §7).
- Amount inputs include the currency in the visible label. Adornments are `aria-hidden` when the label already says it.
- Chips and pills pair an icon (`aria-hidden`) with text ("Hidden from partners: add terms"; "Changed"; "Terms updated on …").
- Negative amounts are read with their sign. The explanatory hint is linked to the tile with `aria-describedby`.
- The network rules are a real `ul` with a heading. On S6, the `details`/`summary` is natively accessible.

**Contrast and targets**
- Warning and info use the existing `*-soft` token pairs (≥ 4.5:1 in light and dark). Neutral callouts use `bg-muted/50` + `text-foreground`, not muted text, for the main sentence.
- Every interactive element is ≥ 44 × 44 px at 375px: option cards, radio rows, switch row, checkbox labels (full-row hit area), `details` summaries, and the nudge CTA.
- Reflow at 320/375px with no horizontal scroll, except the existing commissions table scroller. fr text wraps (no `line-clamp` on alert titles or chips).

---

## 7. Acceptance criteria

"A" = sourcing org, "B" = hiring org, "C" = another org. **Partner-visible** = BR-3 predicate. **Snapshot referral** = committed after N2, with a terms version. **Legacy referral** = no snapshot. Unless stated, submission ACs hold on **both** authorization paths, and money examples use CAD with currency-code display.

### Terms card on the job form
- **AC-1** (BR-1, BR-2, BR-10) Given a member with `jobs:write` opens New job, then:
  - the Terms for partners panel shows: basis "% of base salary" selected, rate empty, minimum empty, "Contingent, shared", 90 days + "Replacement, then pro-rata refund", 30 days, 6 months, share_salary **on**, attestation unticked, and "Not published yet";
  - the split shows the current default rule's name, version and three percentages as text, with no input.
- **AC-2** (BR-1 T2) Given a % basis:
  - rates 0.99, 50.01, 22.555 and empty are refused with `feeRateRange` (empty when open: also `termsIncomplete`);
  - rates 1, 50, 22.5 and 22.55 are accepted;
  - given flat, an amount of 0 or empty is refused, and 15000 is accepted.
- **AC-3** (BR-1 T3) Given basis = flat, then the minimum field isn't rendered and isn't submitted. A forged submission with a minimum on a flat basis is refused. A minimum of 0 is refused, and empty means none.
- **AC-4** (BR-1 T4) Given a % basis, then the fee currency is shown as text equal to the salary currency and changes immediately when the salary currency changes. Given flat, then the currency select offers exactly CAD, USD, EUR, GBP and BRL. A forged other currency is refused.
- **AC-5** (BR-1 T7) Given guarantee length None, then no remedy group is rendered and the version stores remedy = null. Given 30 to 180, then a remedy is required. A forged length of 45, or a remedy with None, is refused.
- **AC-6** (BR-1 T8, T9) Payment days −1, 91 and 30.5 are refused, while 0 and 90 are accepted. The window offers 6 to 12 only, and a forged 5 or 13 is refused.
- **AC-7** (BR-1 T6, BR-4) Given a save that would publish a version, when the attestation is unticked, then the save is refused with `attestationRequired` and nothing is saved. When ticked, the new version records the user and time, and the job page shows "Last confirmed by {name} on {date}" on the next edit.
- **AC-8** (BR-5) Given a job with version n:
  - when the owner saves with no T1–T9 change (and with the attestation unticked), the save succeeds and the version stays n;
  - when only the description or skills change, the version stays n;
  - when one T1–T9 value changes (attestation ticked), version n+1 exists and is current.
  - The note "Saving publishes terms version {n+1}" appears only while a T1–T9 value differs.
- **AC-9** (BR-4) Direct `update` and `delete` on terms versions are refused for an org admin, a recruiter, a platform admin, and the service-role ingest path. Inserts happen only through the terms RPC, which refuses a caller without `jobs:write` on the org. Connector and `/api/v1/jobs` writes can't create a version or set `accepts_external_referrals = true`.
- **AC-10** (BR-6) Given the toggle is on:
  - when the card is incomplete, then the save (including **Save draft**) is refused: field errors on each invalid field, the summary `termsIncomplete`, focus on the first invalid field, and the job unchanged;
  - when the contract type isn't permanent, the inline warning appears immediately and the save is refused with `permanentForReferrals` on contract type.
  - Given the toggle is off, a contract job with no card saves.
- **AC-11** (BR-10, PD-047) Given an existing job that was never open to partners and has share_salary off, when the owner ticks Open to partners, then share_salary switches on (and can be switched off before saving). Given an existing open job with share_salary off, editing keeps it off.
- **AC-12** (BR-9) The job form has no "Expected placement fee" toggle. The job page's "What partners see" list has no placement-fee row and shows "Terms for partners" as always shown.
- **AC-13** (BR-33) Given a job with 3 referrals (any statuses), when the owner changes a term, then the note "3 referrals were sent under earlier terms and keep them…" shows. Given a job with no referrals, the note doesn't show.
- **AC-14** *Moved to N3 (BR-40; see the appendix).*

### Existing jobs and partner visibility
- **AC-15** (BR-7) Given an active referral-open job with no terms version, then:
  - the jobs list shows the "Hidden from partners: add terms" chip and the banner with the count;
  - the job page shows the "Hidden from partners" banner with **Add terms** → `/edit#terms` for `jobs:write` holders, and with no button for others;
  - given a non-permanent referral-open job, the chip, body and CTA use the permanent variant;
  - existing referrals on both jobs can still be moved through their statuses.
- **AC-16** (BR-3) Given each of: status ≠ active; open toggle off; contract ≠ permanent; no version. Then for an A member:
  - the job is absent from the opportunities list and triage;
  - its composer URL returns not found;
  - `submit_referral` and `submit_referral_for_candidate` called directly return the same error as for a non-existent job, with no reason.
  - When the job becomes partner-visible again, it reappears.
- **AC-17** (BR-3, BR-7) Given a hidden job, then B still lists it in its own jobs list with the nudge, and no member of C or A receives any field of it.

### Partner card before submitting
- **AC-18** (BR-8) Given a partner-visible job, then the composer's Terms for this job panel shows:
  - basis and rate (or flat amount), the minimum fee if set, the currency, search type with hint, guarantee (or "No guarantee" with its hint), payment terms, ownership window, and the split with rule name and version;
  - the client as "Confidential" or the name per `client_confidential`, the direct-client line, and "Terms version {n} · {date}";
  - the five network-rule lines with the draft marker.
- **AC-19** (BR-9) Given a % job with share_salary **off**, then the composer, opportunities list and triage show basis and rate but **no** estimated fee, estimated share or band, and the action/RPC payloads contain none of them. Given share_salary **on**, they show "~" estimates labelled as estimates.
- **AC-20** (BR-9) Given a flat job (share_salary off), then the flat amount and "Your share if hired" (45% of it, exact) are shown. Given a % job with a minimum fee and share_salary off, the minimum is shown.
- **AC-21** (BR-33) Given a job whose version 2 was published on day D, then "Terms updated on {D}" shows on the opportunities card and the composer until D + 30 days and is gone on D + 31. A job with only version 1 never shows it.
- **AC-22** (BR-8, BR-36) The opportunities share figure uses the job's current version and the current default rule. Sorting by Highest earnings puts jobs without an amount after jobs with one.

### Submit, snapshot and `terms_changed`
- **AC-23** (BR-11) Given A submits under version n on the recorded path (and separately the candidate-confirms path), then in the same transaction as the referral insert:
  - the referral stores version n's id, the commission rule id and version that is default at that moment, and the client key (in the closed table);
  - the submit panel had shown "You're submitting under terms version n ({date})".
- **AC-24** (BR-12) Given A opened the composer at version 1 and B then publishes version 2, when A submits, then:
  - the outcome is `terms_changed`; no referral, candidate email, fingerprint, consent row or notification exists; one audit event exists;
  - S5-e shows with focus on the alert, the terms panel shows version 2 with Changed badges on exactly the rows that differ, and A's selected fields, documents, authorization method and note are unchanged;
  - when A selects **Submit under new terms**, the referral is created with version 2.
- **AC-25** (BR-12) Given step 1 returned `pending_warning` and B then publishes a new version, when A ticks and selects **Submit anyway**, then the outcome is `terms_changed`, S1-c is replaced by S5-e, the tick is cleared, and no referral exists.
- **AC-26** (BR-12, IDOR) A submit whose `termsVersionId` is any of the following returns `terms_changed` carrying **this job's** current version, and creates no referral:
  - an older version of the same job;
  - a version of another org's job;
  - a random UUID.

  The payload contains nothing from the other job, and the response shape is identical in all three cases. A missing or non-UUID `termsVersionId` returns the generic invalid-fields error.
- **AC-27** (BR-14) Given a candidate request created under version 1, when B publishes version 2 and A resends the link and the candidate confirms, then the referral keeps version 1. Its ownership date = confirmation delivery + version 1's window. The candidate page shows no fee, rate, salary figure or terms in any state.
- **AC-28** (BR-13, BR-31) Given a referral under version 1 in each status (awaiting_candidate, submitted, accepted, offer, hired, declined, withdrawn, cancelled), when B publishes version 2, then every referral page still shows version 1 and its values.
- **AC-29** (BR-15) The commit client key appears in no action payload, RPC result, page HTML, log line or `audit_events.metadata`. The N1 regression suite (duplicate stop, pending warning, sticky stop, objection, contest, release) passes unchanged.
- **AC-30** (BR-32) Given A1 has a live referral (`interviewing`) and A2 has only declined and withdrawn referrals on job J, when B publishes a new version, then A1 receives exactly one `job.terms_changed` notification naming B and J and no candidate, and A2 receives none. Given A1 has 3 live referrals on J, it still receives one.

### Agreement
- **AC-31** (BR-16) Given A submitted under rule R1 and the platform publishes default rule R2 before B accepts, when B accepts, then the agreement has R1's id, name, version and bps and references the referral's terms version. The agreement dialog and referral page show R1's split.
- **AC-32** (BR-16) Given an internal referral with a snapshot, when accepted, then the agreement has 0 sourcing bps, with sourcing + job-owner bps going to the job owner, from the snapshot rule.
- **AC-33** (BR-17) Given a legacy referral, when accepted after N2, then the agreement is built as today (the current default rule) and `terms_version` text is unchanged.
- **AC-34** (BR-36) Given an agreement awaiting the sourcing side, when A opens **Review & confirm terms**, then the dialog shows the same values, version, date and expected share as the referral page's Terms panel: the frozen estimate, or, when there's none, `jobs.terms.shareAtHire.pctBase` / `.pctTotalCash` by basis, with no amount. Given a legacy referral, it shows the split and "Terms not recorded (sent before the terms card)".

### Ownership window
- **AC-35** (BR-18) Given a snapshot referral with a 6-month window delivered on Aug 31 (ET), then `ownership_protected_until` = Feb 28 (Feb 29 in a leap year), set in the same transaction as `delivered_at`. A 12-month window delivered on Jan 15 gives Jan 15 next year.
- **AC-36** (BR-19) Given a legacy referral delivered after N2, then ownership = delivery + 12 months. Stored ownership dates on referrals delivered before N2 are unchanged. No insert sets an ownership date before delivery.
- **AC-37** (BR-19) Given an `awaiting_candidate` snapshot referral with an 8-month window, then the sourcing side's footer reads "Ownership starts when the referral is delivered: 8 months with this client." with no date.

### Look-back
- **AC-38** (BR-20) Given a snapshot referral with a 12-month window delivered on date D, then the objection dialog accepts a prior-process date of D − 11 months, its date `min` is D − 12 months, and the hint includes "ownership window is 12 months". Given a 6-month window, D − 11 months is refused:
  - client-side with `referrals.claim.validation.priorDateTooOld`, rendered with `{count}` = 6 and `{date}` = D − 6 months;
  - on a forged call, server-side with `errors.claim_date_invalid`, which has no number.

  Given a legacy referral, the bound stays D − 6 months, `priorDateTooOld` renders with `{count}` = 6, and the window sentence isn't shown. With a 12-month window, `priorDateTooOld` renders with `{count}` = 12.

### Hire
- **AC-39** (BR-21) Given a snapshot referral at `offer`, when B opens Report hire (from the referral page and by dropping on Hired in the pipeline), then the Terms box shows basis, rate/amount, minimum, currency, guarantee and remedy, and payment terms as text. No currency or guarantee input exists.
- **AC-40** (BR-22) Given `pct_base` 20% and base CAD 100,000.00, then the dialog shows Computed fee CAD 20,000.00 with "20% × CAD 100,000.00", and the placement stores contracted C = 2,000,000 minor.
- **AC-41** (BR-22) Given `pct_total_cash` 15% with a minimum of CAD 12,000.00, base 60,000 and bonus 5,000, then C = CAD 12,000.00 with "Minimum fee applies". With base 90,000 and bonus 10,000, C = CAD 15,000.00. The bonus is required (0 allowed).
- **AC-42** (BR-22) Given flat CAD 15,000.00, then no salary input shows and C = CAD 15,000.00. For a test set including half-cent results, the TS mirror's C equals the database's C.
- **AC-43** (BR-25) Given guarantee 90 days and start Mar 1, then the dialog shows "Guarantee ends May 30" and `guarantee_until` = start + 90 days. Given None, it shows "No guarantee" and `guarantee_until` is null.
- **AC-44** (BR-23) Given "Invoiced fee is different" is unticked, then I = C. Given it's ticked:
  - I = C is refused with `invoicedSame`; a missing reason is refused; reason `other` without a note is refused;
  - the reason list has exactly the 5 values in 2.6, including "Client invoiced in another currency";
  - with I = 15,000 and reason `client_discount`, the placement stores C, I, base (and bonus), reason, note and terms version.
- **AC-45** (BR-24) Given I ≠ C, then A's submitting member (or, if they've left, the source org's admins) receives one `placement.fee_difference` notification with both amounts (currency codes) and the reason label. Given I = C, no notification.
- **AC-46** (BR-25) A direct `report_hire` call for a snapshot referral that passes a currency or a guarantee is refused (`hire_terms_fixed`). The old `report_hire` signature doesn't exist, and the api-surface allow-list matches.
- **AC-47** (BR-26, BR-37) Given a legacy referral, then the dialog shows the "Terms not recorded" alert and today's fee, currency and guarantee fields, and recording works. A legacy-style call on a snapshot referral is refused, and a snapshot-style call on a legacy referral is refused.
- **AC-48** (BR-34, BR-29) Given a referral amended to 15% before the hire, then the hire dialog shows "Amended on {date}", computes C at 15%, and the placement references the amendment.
- **AC-49** *Moved to N2.1 (BR-41; see the appendix).*

### Commissions
- **AC-50** (BR-24) Given a snapshot placement, then both orgs see the Fee panel with terms version and basis, base (and bonus), computed fee and invoiced fee. When they differ, the panel also shows the difference, reason label and note.
- **AC-51** (BR-27, PD-049) Given 45/45/10 with platform basis `collected`, C = CAD 20,000.00 and I = CAD 15,000.00, then projected tiles show sourcing CAD 9,000.00, platform CAD 1,500.00 ("Calculated on the fee collected") and job owner CAD 4,500.00. The sourcing side sees `lowerSource` with a pointer to Open dispute, and the hiring side sees `lowerTarget`.
- **AC-52** (BR-27) Given C = CAD 20,000.00 and I = CAD 8,000.00 (collected), then the projected job-owner share is −CAD 1,800.00, shown with a minus sign, `negativeShareHint` and the `negativeTarget` sentence, and without danger colour. After a verified full client payment of CAD 8,000.00, the ledger allocates sourcing 9,000.00, platform 800.00 and job owner −1,800.00 (an allocation entry, not reversal styling), and settlement completes.
- **AC-53** (BR-27, RD-031) Given I ≥ C, then allocations equal today's `allocate_minor` split of each payment. Given I = CAD 25,000.00 > C = CAD 20,000.00, sourcing projected = CAD 11,250.00, and both sides see the neutral `higher` sentence.
- **AC-54** (BR-27) Given I < C and a verified partial payment of P = I ÷ 2, then each allocated share = half of its projected share, ±1 minor unit with the remainder going to the job owner, and SQL equals TS on the parity set.
- **AC-55** (BR-28) Given a test rule with platform basis `frozen` and C = 20,000, I = 15,000, then platform projected = CAD 2,000.00 with "Calculated on the computed fee". Agreements keep the basis they were created with.
- **AC-56** (BR-24) The commissions list shows I in the Fee column with "Computed {C}" when they differ, and a negative share with its sign. KPI totals sum signed amounts in the org currency.
- **AC-57** (BR-30, BR-37) Legacy placements show "Placement fee" and "Terms not recorded (sent before the terms card)", and their allocations are unchanged.

### Concierge amendment
- **AC-58** (BR-34) Given a snapshot referral with no placement, when a platform admin records an amendment changing the guarantee from 90 to 60 days (with reason, both request references and the confirmation tick), then:
  - a referral-scoped version exists;
  - both orgs' referral pages show "Amended on {date}…" with 60 days and an "Original terms" disclosure showing 90 days;
  - an audit event exists, and both orgs receive `referral_terms_amended`;
  - a later agreement confirmation and hire use 60 days;
  - if an agreement already existed, it now references the amendment.

  The same amendment on a **declined** referral without a placement is also accepted (PD-051 Q-6).
- **AC-59** (BR-34, RD-035) Given a placement exists, then the amendment form isn't rendered (`blockedHired`), and a direct RPC call is refused with `amendment_after_hire`. Given a legacy referral, the form isn't rendered (`blockedLegacy`), and the RPC is refused with `amendment_legacy_referral`.
- **AC-60** (BR-35) Given a delivered referral, then T9 is disabled with `windowLocked`, and a forged T9 change is refused (`amendment_window_after_delivery`). Given an undelivered referral, a T9 change is accepted and delivery uses the amended window. No amendment changes the ownership date, claim deadline, split, rule or client key.
- **AC-61** (BR-34, BR-38) The reason and request references are visible on `/admin/referrals/[id]` only, never in either org's payloads. Submitting with no changed term is refused (`amendment_no_change`). A non-admin gets 404 on both admin routes, and the RPC refuses.
- **AC-62** (§4) `/admin/referrals/[id]` for a job with a hidden client shows "Confidential", never the real name, and shows no candidate data other than the candidate label.

### Display
- **AC-63** (BR-11, BR-36, PD-050, PD-051 Q4) Given a snapshot referral, then both sides' referral pages show the Terms panel with the effective terms, version and date.
  - **Estimate shown at submit:** A submitted a % job with `share_salary` on (estimate CAD 20,000.00, sourcing 45%). Then B changes the band, turns `share_salary` off, publishes a new version, and the platform publishes a new rule. **Both sides** still see "~CAD 9,000.00", and so does the agreement dialog.
  - **Estimate hidden at submit:** A submitted with `share_salary` off. **Both sides** see `jobs.terms.shareAtHire.pctBase` (for 45/45/10 and 20% of base, en: "45% of the fee (fee: 20% of the base salary at hire)") with no amount, even after B turns `share_salary` on. A `pct_total_cash` referral uses `.pctTotalCash`.
  - **Flat:** both sides see the exact share.
  - **Sent list:** each row shows the snapshot's short basis ("20% of base" / "CAD 15,000 flat") and no money share. Legacy rows show "Terms not recorded (sent before the terms card)".
- **AC-64** (BR-36) Given the job's current version is newer than the referral's, then both sides see "This job's terms are now version {m}. This referral keeps version {n}."
- **AC-65** (BR-37) Given a legacy referral, then the referral page, agreement dialog, hire dialog and placement page each show "Terms not recorded (sent before the terms card)", and every other display is as today.

### Terms-worsening flag
- **AC-66** *Moved to N2.1 (BR-39 rev. RD-032; see the appendix).*
- **AC-67** *Moved to N2.1 (appendix).*
- **AC-68** *Moved to N2.1 (appendix).*

### Rev. 2 additions
- **AC-73** (BR-3 delivery exception, BR-7, BR-19, PD-051 Q-1) Given a legacy referral (no snapshot) in `awaiting_candidate` on a job that is active and open to referrals but has **no terms version**, when the candidate confirms, then:
  - the referral is delivered;
  - `ownership_protected_until` = delivery + 12 months, and the sourcing side's footer reads "Ownership protected until {date}";
  - on acceptance, the agreement follows the legacy path;
  - both sides see "Terms not recorded (sent before the terms card)".

  Given a **snapshot** referral whose job became closed or non-permanent while the request was pending, the confirmation is refused as today.
- **AC-74** (BR-19) Given any undelivered referral (snapshot or legacy, including after the migration), then its stored ownership date is NULL, and no page, list, dialog, payload or notification shows an ownership or protection date for it. The sourcing side sees only "Ownership starts when the referral is delivered: {count} months with this client."
- **AC-75** (BR-3 rev. 2, BR-7, PD-051 Q3) Given a % job with terms in CAD, when a connector changes the job's salary currency to USD, then:
  - the job is hidden from partners on every surface in AC-16;
  - the owner sees the chip "Hidden from partners: check fee currency" and the job-page banner `bodyCurrency` with both currencies, plus **Review terms** for `jobs:write` holders;
  - saving the card publishes a new version in USD, and the job is visible again;
  - referrals already submitted keep CAD terms.
- **AC-76** (brief §4, PD-051 Q-7) The `/admin` overview shows exactly two terms counts: partner-visible jobs with complete terms, and referral-open jobs hidden for missing terms. The values match the BR-3 predicate on a seeded dataset. When the load fails, the panel shows the generic error alert, not zeros. No other N2 terms metric or flag list is shown.

### Copy, privacy and accessibility
- **AC-69** (BR-38) Every card label, enum value, network-rule line and frozen-term value renders in en, fr and pt from structured fields. Switching locale changes them all, and no snapshot holds free text other than the amendment reason (admin) and the hire note.
- **AC-70** (§3 money rule, BR-38 rev. 2) Every N2 money amount shows its ISO currency code (no bare "$"). This covers the job form, job page, opportunities, composer, referral page, sent list, agreement and hire dialogs, placement page and list, admin pages, and the notification text. Estimates carry "~". No N2 string says MissionHub moves, sends or pays money.
- **AC-71** (§4) The reported base and bonus are visible to both orgs of the placement and to platform admins, and never to the candidate or any other org.
- **AC-72** (§6) At 375px in light and dark:
  - the job form card, composer terms panel, hire dialog and placement Fee panel have no horizontal scroll, no truncated fr text, and every control is ≥ 44 × 44 px;
  - every enum is a labelled radio group or select;
  - read-only terms are text, not disabled inputs;
  - S5-e takes focus;
  - the hire result box is announced politely;
  - in fr, the nudge chips wrap to 2 lines without truncation;
  - the Fee terms KPI value wraps (at `text-lg`, or in a full-width tile) without clipping;
  - **Record amendment** and its confirmation footer buttons are full width (§5.11).

### Traceability (BR → AC)

| BR | AC | BR | AC |
|---|---|---|---|
| BR-1 | AC-1 to AC-7 | BR-22 | AC-40, AC-41, AC-42 |
| BR-2 | AC-1 | BR-23 | AC-44 |
| BR-3 | AC-16, AC-17, AC-73, AC-75 | BR-24 | AC-45, AC-50, AC-56 |
| BR-4 | AC-7, AC-9 | BR-25 | AC-43, AC-46 |
| BR-5 | AC-8 | BR-26 | AC-47 |
| BR-6 | AC-10 | BR-27 | AC-51 to AC-54 |
| BR-7 | AC-15, AC-17, AC-73, AC-75 | BR-28 | AC-51, AC-55 |
| BR-8 | AC-18, AC-22 | BR-29 | AC-48 |
| BR-9 | AC-12, AC-19, AC-20 | BR-30 | AC-57 |
| BR-10 | AC-1, AC-11 | BR-31 | AC-28 |
| BR-11 | AC-23, AC-63 | BR-32 | AC-30 |
| BR-12 | AC-24, AC-25, AC-26 | BR-33 | AC-13, AC-21 |
| BR-13 | AC-28 | BR-34 | AC-48, AC-58, AC-59, AC-61 |
| BR-14 | AC-27 | BR-35 | AC-60 |
| BR-15 | AC-29 | BR-36 | AC-22, AC-34, AC-63, AC-64 |
| BR-16 | AC-31, AC-32 | BR-37 | AC-47, AC-57, AC-65 |
| BR-17 | AC-33, AC-73 | BR-38 | AC-61, AC-69, AC-70 |
| BR-18 | AC-35, AC-27 | BR-39 to BR-41 | deferred (appendix) |
| BR-19 | AC-36, AC-37, AC-73, AC-74 | — | AC-70 to AC-72, AC-76 (cross-cutting) |
| BR-20 | AC-38 | | |
| BR-21 | AC-39 | | |

**Moved (numbers kept, not tested in N2):** AC-14 → N3; AC-49, AC-66, AC-67, AC-68 → N2.1. **Active in N2:** 71 ACs (AC-1 to AC-76, minus the 5 moved).

**Brief QA scenarios → AC:** 1 → AC-10, 15, 16 · 2 → AC-8, 9 · 3 → AC-24 · 4 → AC-27 · 5 → AC-31 · 6 → AC-35, 36 · 7 → AC-38 · 8 → AC-39 to 47 · 9 → AC-44, 45, 51 to 55 · 10 → AC-58 to 61 · 11 → AC-21, 30 · 12 → AC-19, 20, 27, 29 · 13 → AC-9 · 14 → AC-25, 29 · 15 → AC-73 · 16 → AC-63 · 17 → AC-74 · 18 → AC-58, 59 · 19 → AC-75.

---

## 8. Out of scope

Per brief §5 Won't:
- Guarantee-limited reversals and the replacement first right (X6).
- An in-product two-party amendment flow.
- Per-job partner share (L2).
- Contract/temp splits.
- A free-text note on the card.
- Industry/size on confidential cards.
- The CV-harvesting flag.
- N3 ownership enforcement, hire reports and authorization challenge (RD-033's union of keys is an N3 input).
- The founding-member rate.
- Notification emails (N7).
- The platform invoice (X1).
- **Rev. 2 (PD-050):**
  - terms-worsening flag, extra admin metrics and below-band alert → N2.1;
  - client-name gate → N3 (appendix);
  - post-hire credit-note handling → X6 / X1 (R-11).

Design-level exclusions:
- No terms history visible to partners.
- No diff view on the job page.
- No "accept new terms" step for existing referrals.
- No candidate-facing change.
- No admin UI for publishing the platform basis (a rule value).
- No new workspace routes.

---

## 9. Open questions

**All design questions answered** ([PD-051](../../product/decisions.md); brief rev. 2 §11.1). The spec reflects every answer.

| # | Question | Answer | Where |
|---|---|---|---|
| Q-1 | Pre-N2 pending referral on a card-less job: deliver or refuse? | **Answered:** legacy referrals deliver under today's check. Snapshot referrals use the full predicate at delivery (BR-3 exception). | 2.4 item 7, AC-73 |
| Q-2 | Re-tick the attestation on every version? | **Answered:** yes, on every save that creates a version, not on no-op saves (BR-4). | 2.1, AC-7, AC-8 |
| Q-3 | Card required on drafts open to partners? | **Answered:** yes, whatever the status (BR-6). | 2.1, AC-10 |
| Q-4 | Which estimate do the referral page, agreement dialog and sent list use? | **Answered (default overridden):** the **frozen estimate** A was shown, identically for both sides. Otherwise `jobs.terms.shareAtHire.*`. Never the live band or live `share_salary`. The sent list shows no money share. | 2.4, 2.5, S6, S7, AC-63 |
| Q-5 | I ≠ C reasons | **Answered:** the five codes in 2.6 are final and shared with backend. | 2.6, §5.1, AC-44 |
| Q-6 | Admin amendment entry point and statuses | **Answered:** routes confirmed; any status without a placement; **two** reference fields (hiring org, sourcing org). | 2.8, S10, AC-58 |
| Q-7 | N2 metrics on the admin overview? | **Answered (partly):** two counts only. The flag list and the other metrics are N2.1. | 2.8, S11, AC-76, appendix |
| Q-8 | Notification recipients | **Answered:** the submitter(s), falling back to the source org's admins (N1 pattern). | 2.10, S13, AC-30, AC-45 |
| Q-9 | Base salary on flat-fee hires? | **Answered:** no base or bonus on flat (BR-22). | 2.6, AC-42 |
| Q-10 | Tilde-less flat share | **Answered:** confirmed, with the "Payable once…" hint. | S5, §5.2 |
| Q-11 | Band source for the below-band alert | **Answered:** the alert is N2.1. The default is deleted. N2.1 freezes the band minimum at commit in a closed `app` table (BR-41). | appendix |
| Q-12 | Show the unenforced response rule? | **Answered:** keep it as a ⚖️ draft line (N4 is a launch gate). The wording must not say "release" or imply that ownership is lost. ux-writer owns the final string. | §5.2 `network.response` |

**Strategist items:** S-N2-1 to S-N2-5 are answered (RD-031 to RD-035, PD-052) and folded in. BR-39 as revised by RD-032 is in the appendix (N2.1). The reason list has RD-034's value.

**Counsel ⚖️ (N7, not blocking):** network-rule lines, attestation, window hint, frozen-terms and floor wording in the agreement, hire and commissions copy, amendment wording.

**Notes for engineering (no PM decision needed)**
- Submit outcomes add `terms_changed`, whose payload carries the new current version (id, number, date, terms, `changedFrom`) so the form keeps state. Record it in `backend.md`.
- Partner payloads must include `share_salary`-gated fields **only** when allowed (AC-19). The `terms_changed` payload follows the same gating.
- The hire dialog (referral page **and** pipeline board) needs the effective terms and the partner name.
- The referral page and agreement dialog read `get_referral_terms.expected_share_minor` (frozen estimate × snapshot sourcing bps; NULL → `jobs.terms.shareAtHire.*`, which needs the snapshot sourcing bps and fee rate). The sent list reads per-referral basis, rate or flat amount and currency, with no share.
- The placement view model needs C, I, base, bonus, reason, note, terms version/amendment, platform basis, and BR-27 projected shares (TS mirror).
- `f.money` needs a currency-code display option (§3).
- The admin lookup: the frontend parses the pasted URL to an id. The admin-only RPC returns the S10 meta or `not_found`.
- **Backend drops (PD-050):** between drop 1 and drop 2, the hire dialog for snapshot referrals hits `hire_terms_pending`, which shows the generic error. Frontend builds S8 against the drop 2 contract (`backend.md` v2).

---

## Appendix: Deferred to N2.1 / N3

Kept verbatim (lightly trimmed) so N2.1 and N3 build from one definition (PD-050). **None of this is built, tested or shown in N2.** The AC numbers are reserved.

### A.1 Terms-worsening flag (N2.1; BR-39 as revised by RD-032)

A job is flagged on the `/admin` overview when either condition holds. The flag only displays; no automatic action follows.
- **(a)** A version was published **within 30 days after any delivered referral on the job**, and that version is **worse for partners** than the previous version on at least one of:
  - lower rate, or lower flat amount (same currency);
  - lower or removed minimum fee;
  - any fee-basis change except `pct_base` → `pct_total_cash`;
  - currency change on a flat fee;
  - longer guarantee;
  - remedy moved towards refund (replacement only < replacement then pro-rata < pro-rata refund < full refund);
  - longer client payment terms;
  - shorter ownership window;
  - search type downgrade, ranked retained > contingent exclusive > contingent shared.
- **(b)** More than 2 versions in any 30-day window.

**Panel** (`TermsFlagsPanel`), next to N1's "Organizations to review" panel:
- each flagged job is an `li` linking to `/admin/organizations/[orgId]`, showing the avatar, "{job} · {org}" and one muted line per reason;
- empty state "No jobs flagged.";
- a load error shows `role="alert"` generic (never the empty text);
- footer "Flags only. No automatic action.".

**Extra metrics (N2.1):** hires with invoiced ≠ computed (30 days); terms amendments (30 days). They're read with SQL in N2.

**Copy (draft):**
- `admin.termsFlags.title` "Terms changes to review"
- `admin.termsFlags.reason.worse` "Worse for partners within 30 days of a delivered referral: {fields}"
- `admin.termsFlags.reason.frequent` (one/other) "Terms changed {count} times in 30 days"
- `admin.termsFlags.field.*`: rate · minimum fee · fee basis · flat-fee currency · guarantee length · guarantee remedy · payment terms · ownership window · search type
- `admin.termsFlags.empty` "No jobs flagged."
- `admin.termsFlags.note` "Flags only. No automatic action."
- `admin.termsMetrics.feeDifferences` "Hires with a fee difference (30 days)"
- `admin.termsMetrics.amendments` "Terms amendments (30 days)"

**Reserved ACs:**
- **AC-66** Given job J has any delivered referral on day D, when B publishes, within D + 30 days, a version worse on any one listed field, then J is flagged with that field named.
- **AC-67** Given base → total cash, a higher rate, a shorter guarantee, fewer payment days, a longer window or a search type upgrade only, or no delivered referral in the previous 30 days, then (a) doesn't fire.
- **AC-68** Given 3 versions within 30 days, then J is flagged "Terms changed 3 times in 30 days". There's no automatic action. The panel shows the empty and error states correctly.

### A.2 Below-band alert (N2.1; BR-41)

- **Rule:** the reported base (base + bonus on total cash) is more than 20% below the band minimum **frozen at commit**. The minimum is stored in a closed `app` table, never on `referrals`. It doesn't apply to flat fees.
- **Hire dialog:** a non-blocking warning line under the base input. Copy `referrals.hire.belowBand`: "The salary entered ({amount}) is more than 20% below the job's salary band minimum when this referral was submitted ({minimum}). {partner} will see both amounts."
- **Placement page:** a warning row on the sourcing side. Copy `commissions.detail.fee.belowBand`: "Reported salary {amount} is more than 20% below the job's salary band minimum when this referral was submitted ({minimum})."
- **Reserved AC-49:** given a frozen minimum of CAD 100,000.00, a base of CAD 79,000.00 shows the line without blocking, and A's placement page shows the row. CAD 80,000.00 shows nothing.

### A.3 Real client name to open a job to partners (N3; BR-40)

- **Job form:** while "Open to partners" is ticked, the client field's hint becomes `jobs.form.clientRequiredForPartners` ("Required to open this job to partners. If 'Hide client' is on, the name stays internal: partners never see it."). Saving without a non-placeholder name is refused with field error `jobs.validation.clientRequiredForPartners` ("Enter the client's name to open this job to partners").
- **Server code:** `client_name_required_for_referrals`.
- Connector and API jobs without a name can't be opened.
- **Nudge:** a fourth reason (`no_client_name`) with its own chip and body.
- **Reserved AC-14:** given the toggle is on and no client name, the save is refused. With "Hide client" ticked, the name is saved and never appears in any partner payload. A connector/API job without a name can't be opened.
