# Design review: N3 referral-level claims and two-sided hire reporting

Reviewer: Product Designer · 2026-11-16 · Against `spec.md` **rev. 2.1** (PD-077) and `frontend.md` §1–3, §D2.1–D2.4.
**Method: code review only.** No browser was available (port 3000 belongs to the user), so nothing was checked visually: light/dark, 375px rendering and fr/pt wrapping are unverified. Every finding below comes from reading the components, routes and Tailwind classes. QA should still do the 375px / fr / dark pass that frontend.md D2.4 item 13 asks for.

**Verdict: 3 blocking findings, 14 polish findings.** The variant logic, side-shaped rendering, generic refusals, hidden-not-disabled rule and focus management largely match the spec. The blockers are one missing entry point and two contrast failures, all small fixes.

---

## Blocking

| # | Where | AC / section | Finding | Fix |
|---|---|---|---|---|
| **B-1** | `src/features/referrals/components/claim-panel.tsx` | **AC-79**, §2.13 trigger 3 | **Ask for an authorization check** only renders on the hire report panel. Spec and AC-79 also require it on B's N1 objection panel while the objection is `contested`. Backend already supports it (`request_authorization_check` accepts "a `contested` objection", backend.md v2). Today a hiring recruiter in a contested prior-presentation dispute has no way to ask. | Render `RequestAuthCheckDialog` in `ClaimPanel` (target side, claim status `contested`, not yet requested). Show `authCheck.requestedLine` after the request, as on the hire report panel. |
| **B-2** | `src/app/workspace/[orgSlug]/commissions/[placementId]/page.tsx` line 83 | **AC-101** (AA contrast), AC-71 | The overdue line "Fee details were due {when} ET." is `text-sm text-warning` on the card. Light `--warning` `#b8651a` on white is about **4.3:1**, under the 4.5:1 AA minimum for normal-size text. | Use the N1 pattern: `text-foreground` text with the warning-colored `Clock` icon. Or put the line on `bg-warning-soft`, the token pair the spec cites (§6). |
| **B-3** | `src/features/admin/components/hire-report-admin.tsx` line 393 | **AC-101**, AC-81 | Same failure for the admin "No evidence by the deadline." line (`font-medium text-warning`, normal size). | Same fix as B-2. |

---

## Polish (not blocking; fix in the fix loop if cheap)

| # | Where | AC / section | Finding | Suggested fix |
|---|---|---|---|---|
| P-1 | `report-hire-dialog.tsx` (raced `objection_open`) | AC-102, §2.3 result states, §6 | On open, V0 moves focus to the alert title. But when `objection_open` comes back on submit, the form unmounts and the replacement `ObjectionOpen` gets no `titleRef`, so focus falls to `body`. | Pass a ref and focus the title in an effect, as the record-only result state does. |
| P-2 | All N3 dialog footers (`DialogFooter` `flex-col-reverse`; `AnswerFooter` / hire-report footer `flex-col` with the primary first) | S3 layout, §2.6 actions | Spec S3 says the primary goes **last** on mobile. The shared footer pattern puts it **on top** at 375px. The panel action rows and the referral action bar do put it last. **This is the app-wide pattern, not an N3 regression**, so I'm not asking for a change here. | **Spec amendment (mine):** S3's "primary last" will follow the existing dialog-footer convention (primary on top). The action-bar rule stays. |
| P-3 | `hire-report-panel.tsx` `Files`, `hire-report-admin.tsx` `AdminHireFiles` | AC-101, §6 targets | The icon-only **Download** button is `size="sm"` with `min-h-11` but no minimum width (about 40px wide at 375px). Desktop drops to `sm:min-h-8`. | Add `min-w-11` (and keep 44px on desktop, per spec §6 "every interactive element"). |
| P-4 | `hire-report-panel.tsx` earlier-reports `<summary>` | AC-101 | `min-h-9` (36px) target. | `min-h-11`. |
| P-5 | `hire-report-panel.tsx` `Files` | §2.6, N1 §6 pattern | The SHA-256 label is screen-reader only. The N1 claim panel shows a visible "SHA-256" label. | Show the label (the `claim.panel.sha` key exists). |
| P-6 | `hire-report-panel.tsx`, admin detail (`acceptedOn: {date}`) | §5 conventions | A colon is hard-coded after an i18n label. fr needs U+00A0 before the colon, and the sentence order differs. | Use a key with `{date}` (ux-writer), or render label and value as a `dt`/`dd` pair. |
| P-7 | `hire-report-panel.tsx` A side, `rejected` + `not_this_client` | AC-46, BR-19 | The line correctly reads "Not this client." with no resolution, but the pill still says "Not upheld". It's not a leak, just two messages. | For A on that finding, either drop the pill label to the neutral "Closed", or accept as is. PM / ux-writer call; low priority. |
| P-8 | `hire-report-panel.tsx` `deemed_confirmed` (target) | §2.6, gap 7 | `when: f.etDateTime(null)` renders "Enter the fee details by — ET". It's gated (N7), so it can't occur in production. It will show in QA's seeded AC-63 run. | See the gap 7 judgement below. |
| P-9 | `evidence-items.tsx` | AC-41, §6 | **Type** is required (validated) but its label has no `*` and the select has no `aria-required`. The `ol` aria-label is "Evidence", not "Evidence items". | Add the marker and `aria-required`. Use `hireReport.panel.*`, or a new key, for the list label. |
| P-10 | `answer-dialogs.tsx` | S7 / S8 loading | Pending labels use the generic "Working…" where §3 says "Contesting…" / "Sending…". The keys aren't in §5. | ux-writer: add `hireContest.contesting` / `hireRebuttal.sending`, or accept "Working…". |
| P-11 | `hire-report-admin.tsx` `HireReportDecision` | S15 | Uphold and Reject share one `resolution` state, so text typed for a reject is prefilled into the uphold dialog after cancel (and vice versa). Reject also uses the destructive (red) confirm. Rejecting is a decision, not a destructive or irreversible action (voice §3.4). | Separate state per dialog, or clear it on close. Use the default style for **Reject report**, and keep destructive for **Mark invalid** (void is irreversible). |
| P-12 | Admin detail, delivery records | §2.9, gated | The raw `status` string and a UUID prefix are shown untranslated. Gated until N7. | Map to labels (delivered / bounced) and the member's name when N7 lands. |
| P-13 | Admin detail, same-person block | AC-61, gap 12 | Always a neutral `Minus` icon, whatever the value. Today it's always "not available" (backend v2 §25). | Reuse the N1 icon/tone per value when real comparisons exist. |
| P-14 | `/admin/hire-reports` task rows | S14 | The link to the referral's admin page reads `referralTerms.title` ("Referral terms"), which doesn't describe the destination from a task row. | A dedicated key ("Open referral"). |

**Checked and OK (no finding):** ACs on the tested paths.
- **Record hire dialog (AC-13 to 17, 20, 23, 26, 27, 102, 104):** the server picks the variant, and V5 renders as V2/V3/V4 with no release hint. V4 has no fee block. The record-only result state has focus and refreshes on close. The PD-077 date pre-check is a field error, with the range hint linked through `aria-describedby`. The role `fieldset`/`legend` rows are ≥ 44px. "Another role" is hidden without a client key.
- **Referral page:** Record hire survives the pipeline lock (AC-14). The void and no-split banners and the ownership footer branches match §2.12 (AC-76, 77).
- **Hire report dialog:** the generic refusal is one text (AC-35). The upload rows match N1. Submit is disabled with a linked reason (AC-42). Evidence-card focus management matches §6.
- **Panel:** side-shaped links and files (AC-44, 45). `releasePaused` shows for A only (AC-47). Confirm / Record hire / Contest follow the server flags (AC-52, 54, 67).
- **Contest:** exactly four reasons, the conditional dates in `aria-live`, and the admin-only hint for `not_this_client` (AC-53, 55).
- **Commissions:** the fee-pending panel, actions hidden while pending, the Invoice overdue chips (AC-68, 69, 30 workspace side).
- **Admin:** no money fields (AC-60), no restart or reopen (AC-65, 66), HA-6 only (AC-85), and the decision bar last in the DOM and sticky on desktop.

---

## Frontend gaps (frontend.md §D2.4): judgement

| Gap | Verdict | Reasoning |
|---|---|---|
| **3**: `hire_already_recorded` offers **Refresh page** instead of **Open placement** / **Open referral** | **Acceptable, not a blocker.** Record as a deviation from §2.5 / AC-36. | It only happens on a race: **Report a hire** is hidden once a hire record exists, so A must have had the dialog open while B recorded. After the refresh, A's referral page shows the placement link (agreement panel) or the no-split banner, which is one extra step to the same destination. The values A typed are lost, but the report can't be filed anyway. QA should test AC-36 as "inline alert → refresh → placement link / no-split banner visible". Backend's `{placementId}` in the error data is a cheap follow-up. When it lands, switch the button to the spec's link. |
| **6**: admin detail shows the commit / delivery **client keys** plus the job's current name, not the names at commit and delivery | **Acceptable for N3, not a blocker.** Record as a deviation from AC-61. | `app.client_key` is a readable normalised name (lowercase, accents and legal suffixes stripped: "ABC Inc." → "abc"), not a hash. It's enough for the admin to judge "not this client" and to see a rename (the current name differs from both keys). Two asks: (1) the labels should tell the admin these are normalised (ux-writer: "Client at submission (normalised): {client}"); (2) PM should log the backend follow-up to store the names (backend v2 §25), because an admin quoting a normalised key in a resolution looks odd. The resolution hint already says not to name the client. |
| **7**: `deemedTarget` renders "{when}" as "—" because `get_hire_reports` doesn't return `fee_details_due_at` | **Acceptable for N3, not a blocker. It's a blocker for N7.** | `deemed_confirmed` can't occur in production before N7 writes delivery records (PD-066), and the line sits next to the **Enter fee details** link, where the real deadline shows. Add "`fee_details_due_at` on the report view, and the deemed line renders a real date" to the **N7 acceptance conditions**, next to BR-30 reopen (PD-073). Until then, frontend could drop the sentence's second half when the date is null rather than print "—" (needs a ux-writer key). Optional. |
| **9**: shared `monthYear` formatter in `src/i18n/format.ts` | **Acceptable.** | Additive, locale-driven (`Intl.DateTimeFormat`, `month: "long", year: "numeric"`, UTC), and handles `YYYY-MM` input without a day shift. It gives "March 2027" / "mars 2027" / "março de 2027", matching the glossary's lowercase month convention in fr/pt. The only ask is a unit test for the `YYYY-MM` path, so a future timezone change doesn't shift months. |

**Other D2.4 items, noted but not asked:**
- **Gap 5** (no admin view of **Invoice overdue**, AC-30): needs a PM decision. My suggestion is an admin task row in section 3 rather than a new placement page.
- **Gap 8** (N10 link without the discard confirm): consistent with N10's own links. I accept it and will amend §2.5.
- **Gap 11** (resolution length copy says 5, the forms need 20): ux-writer/backend to align. Currently a user-facing inaccuracy in a validation message.

---

## Spec amendments I'll make (designer-owned, no rule change)

1. S3 / §6: the dialog footer follows the app convention (primary on top at < `sm`); "primary last" applies to the action bar and panel action rows (P-2).
2. §2.5: the N10 hire link closes the report dialog without the discard confirm, like N10's other links (gap 8).
3. §2.9: the admin facts show normalised client keys plus the job's current name until names are stored (gap 6).
