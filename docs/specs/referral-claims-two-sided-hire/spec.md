# Referral-level claims and two-sided hire reporting (N3)

Status: **ready for copy** (frozen 2026-11-16 for ux-writer-marketing §5; then backend drop 1 / drop 2, frontend)
Slug: `referral-claims-two-sided-hire`
Inputs: [`brief.md`](./brief.md) **rev. 2** (BR-1 to BR-45, §12 "Rev. 2 delta for design"), [`recruiting-input.md`](./recruiting-input.md), RD-029, RD-030, RD-033, RD-036, **RD-050 to RD-056**, PD-021, PD-024, PD-027, PD-028, PD-043, PD-064, PD-066 to PD-070, **PD-071 to PD-076**. Patterns: N1 [`spec`](../duplicate-prior-presentation/spec.md), N2 [`spec`](../job-terms-card/spec.md) (appendix A.3 for the client-name gate), N10 [`spec`](../network-rules-enforcement/spec.md) §2.8 (Report a problem) and §2.10 (settlement mode).
Owner: Product Designer · 2026-11-16 (rev. 2 applied)

> **User checkpoint (PD-071).** The user approved the brief with the recommended options:
> - **U-N3-1:** the normal platform share on the fee collected, with **no surcharge** (RD-056). Nothing in this spec adds a surcharge field, label or ledger line.
> - **U-N3-2:** `deemed_agreement_enabled` is **off in production**. Q-2 to Q-4 ship as **launch-gated drafts** (⚖️).
> - **U-N3-3:** effort accepted, reconciled to ~22.1 backend days in PD-073.

> **Rev. 2 changes in this spec (brief §12, PD-073 to PD-076).**
> - **Removed.** The AC numbers are kept and each is marked with where it went:
>   - the admin **Reopen** action, its states, copy and notifications (BR-30 → **N7**; AC-66 moved to N7);
>   - the admin **Restart answer clock** action (BR-29, PD-069 cut 2; AC-65 rewritten: the admin decides on the record only);
>   - the **related-org tick** in the record dialog (BR-12 → an **admin note** on the hire record; AC-28 rewritten);
>   - the **HA-1** and **HA-9** flag rows and the **metrics counts** on the admin overview (→ **Ops SQL** until the N2.1 metrics panel; AC-78, AC-84 and AC-95 moved to Ops SQL);
>   - re-recording a hire after a fall-off (BR-44, PD-074 → **X6**; AC-92 moved to X6).
> - **Added:**
>   - the `objection_open` state in the record dialog (BR-45, AC-102);
>   - "no active job owner → admin queue" (BR-29, AC-103);
>   - the N2 leftover QA-N2-12 refresh on `errors.stale_version` (PD-072, PD-074 Q-PM-12, AC-104).
> - **Changed:**
>   - HA-1 counts reports closed by B's own record (AC-84, Ops SQL);
>   - `deemed_agreement_enabled` defaults to false in every environment (AC-24);
>   - the late marker never applies to deemed or upheld hires, and doesn't apply within 5 business days after B's objection is rejected (AC-29, AC-102);
>   - fee-pending placements on legacy referrals use free entry and show no estimate (AC-68).
> - Every *(default, Q-D#)* tag is resolved (§9).

> **Rev. 2.1 (PD-077, drop 1 backend answers).**
> - Internal referrals follow the client-name gate, with no exemption (AC-3, §2.1).
> - Recording a hire waives the pipeline-owner rule for the `hired` move only, and the `offer` happy path doesn't regress (AC-14).
> - Declined, `submitted` and SLA-released referrals record as V3 or V4, never V2 (AC-15, §2.3).
> - Start and acceptance dates must lie within [delivery − 1 year, today + 548 days], or the server returns `hire_dates_invalid` (AC-16, §2.3).
> - `report_hire` returns `not_found` to anyone who can't act (§5 placeholder for ux-writer).

> **Rev. 2.2 (PD-079, QA round 1 product calls; plus the designer amendments from `design-review.md`).**
> - A suspended org follows N10 settlement mode: it keeps acting on in-flight referrals, the deadline rules stay, and a suspended B is never deemed (AC-93, §2.10, §2.16).
> - The admin side of **Invoice overdue** is an Ops SQL query, with no admin UI in N3; X9 builds it (AC-30, §2.4).
> - The admin detail labels the normalized client keys truthfully. Names at submission and delivery come with the pre-launch follow-up (AC-61, §2.9).
> - The deemed line's fee-details date is an N7 acceptance condition (AC-63 note).
> - Designer amendments:
>   - dialog footers follow the app convention (primary button on top below `sm`; S3, §6);
>   - the N10 hire link closes the report dialog without a discard confirm (§2.5).

> **How to read this spec.**
> - BR-# are the brief's business rules (rev. 2). This spec doesn't change any of them. Every design question in §9 is answered (PD-071, PD-074, PD-075).
> - **A** = the sourcing org (the referral's source org). **B** = the hiring org (the job-owner org). **"A member who may act"** on A's side means the candidate's owner or an `org_admin` / `recruiter_manager` of A, which is the set that may withdraw today (RD-036). On B's side it means the **job owner** or an `org_admin` / `recruiter_manager` of B (RD-036, BR-7).
> - **Counting / hire-eligible** follow BR-4. **Governing referral** follows BR-3. **Pending report** follows BR-21 (filed, awaiting answer, unanswered in the admin queue, contested, or in dispute).
> - **Business days** use the N1 helper (RD-018). Every deadline is **stored when its clock starts** and is shown with the N1 `BusinessDeadline` component ("{when} ET · N business days left").
> - **⚖️ draft** marks strings that ship with the "draft pending legal review" marker until counsel signs off (Q-1 to Q-4, P0-1).
> - **Gated** marks UI that is built and tested but can't occur in production yet: deemed agreement (flag off, Q-1 + N10) and deemed confirmation (needs N7 delivery records, PD-066, PD-070). Reopening a deemed confirmation is built by N7, not N3 (BR-30, PD-073).
>
> **Patterns reused, not reinvented:**
> - **N1:** the claim-evidence upload pipeline (uploading → processing → ready / rejected, scan, SHA-256 by the worker, 60-second signed URLs). Hidden options are **not rendered** rather than disabled. Submit outcomes are **returned results**, not toasts. `AlertTitle` gets the `line-clamp-none whitespace-normal text-pretty` override. The two-step irreversible release dialog. The admin "same person" block. The admin referral-dispute card.
> - **N2:** `ReportHireDialog` (terms box, computed fee, I ≠ C), the frozen estimate display rule (BR-36), the nudge chips and banner, `hire_terms_changed`.
> - **N10:** "Report a problem" → "Use the right tool" line for hires.
>
> **Terminology (decided, PD-075 Q-D2).**
> - "**Objection**" stays N1's user-facing word for B's prior-presentation claim.
> - "**Hire report**" / "**Report a hire**" is A's new action (RD-050).
> - B's action is "**Record hire**".
> - B's trigger and dialog title change from "Report hire" to "Record hire" / "Record a hire". This is **copy only**: BR-7 keeps the happy-path behaviour and fields. ux-writer owns the glossary entry (voice-and-tone §5).
> - Code names (`report_hire`, `reportHire`) don't change.

---

## 1. Problem & users

"Ownership protected until {date}" is a date with nothing behind it. Most backdoor hires happen on referrals that were declined, withdrawn or left to lapse, and today nobody can record those hires. Often the sourcing recruiter is the only one who learns of the hire, and has no path in the product. An honest hiring recruiter has no clean way to self-report a late hire or a hire into another role. N3 lets either side record a hire on the referral that governs it. The hire leads to a placement on the frozen terms unless an objective exit applies (brief §1, §4).

| Role | Org role(s) | Job to be done in N3 |
|---|---|---|
| **Hiring recruiter** (org B) | Job owner; `org_admin`, `recruiter_manager` (RD-036) | Record a hire from any referral that still counts, including a hire into another role at the same client, a late hire, or a hire by a related org (recorded like any other), in under 2 minutes. Answer a hire report: confirm it, or contest it with evidence. Enter fee details on a fee-pending placement. Open a job to partners only with a real client name. |
| **B's other members** | Plain `recruiter` who isn't the job owner | Nothing new. They don't see the referral (RD-036). |
| **Sourcing recruiter** (org A) | Candidate owner; `org_admin`, `recruiter_manager` | File a hire report with dated evidence when they learn their candidate was hired. Add one rebuttal. See the outcome. Release a candidate stuck behind a declined or rejected referral. Know how long they can still report. |
| **Platform admin** | `/admin` | Decide contested and unanswered hire reports on the record, with both client names, the evidence files and the "same person" signal. Run authorization checks and void invalid confirmations. Work the overdue tasks (fee details, rule 6.4 notices, late records) and the HA-6 flag. Add a note to a hire record (for example, a related-org hire). HA-1, HA-9 and the metrics are read through Ops SQL in N3. |
| **Candidate** | not a user | Nothing in N3 is shown to them. An admin may contact them outside the product (⚖️ Q-4). |
| **Other orgs** (org C, including a second hiring org on the same client) | — | See nothing. Nothing is decided across hiring orgs (RD-013, HE-5). |

---

## 2. Flows

### 2.0 Shared rules for every flow

**Hire-eligible (BR-4).** All of these must hold:
- the referral is delivered (`delivered_at` set);
- it isn't `already_presented`;
- it has no upheld or final prior-presentation objection;
- it isn't void (BR-37);
- it has **no hire record yet** (placement or record-only). There's one hire record per referral. Cancelling a placement and re-recording a later start go to X6; until then Ops handles them through support (BR-44, PD-074).

**B's own objection (BR-45).** While B's prior-presentation objection on the referral is open or contested, B can't record a hire on it (`objection_open`, §2.3). After the objection is rejected, B records normally. After it's upheld or final, the referral no longer counts.

It must also be **either**:
- in progress (`submitted`, `under_review`, `info_requested`, `accepted`, `interviewing`, `offer`), **or**
- closed, with now ≤ window end + 9 months. For legacy referrals the window end is delivery + 12 months.

`awaiting_candidate` and `candidate_declined` are never eligible. A released referral is eligible **only for B's record-only hire** (BR-11).

**Who can act.** On B's side, the job owner and B's managers. On A's side, the members who may withdraw. Everyone else in either org doesn't see the action. A forged call from them gets "Referral not found" (`referrals.errors.notFound`, the existing no-leak pattern).

**Deadlines** shown in the UI, all stored:

| Deadline | Field | Value |
|---|---|---|
| Answer | `answer_due_at` | filing + 10 business days |
| Rebuttal | `rebuttal_due_at` | contest + 5 business days |
| Admin decision | `decide_by` | rebuttal deadline + 10 business days |
| Fee details | `fee_details_due_at` | establishment + 10 business days |
| Invoice | `invoice_due_at` | start date + 10 business days |
| Right-to-represent evidence | `evidence_due_at` | request + 5 business days |
| Filing limit | — | window end + 6 months (+ 9 with the statement) |

**Hidden, not disabled.** Every N3 action that a rule refuses is **not rendered**. It is never shown disabled with a reason. Exceptions are named in the screen tables (for example, the filing-limit line).

### 2.1 Hiring side: real client name to open a job to partners (BR-1)

This builds N2 appendix A.3 as written, plus the items below.

Entry: `JobForm` (`/workspace/[orgSlug]/jobs/new`, `/workspace/[orgSlug]/jobs/[jobId]/edit`).

1. While **Open this job to partner recruiters** is ticked, the client-name field shows a "required" marker. Its hint switches to `jobs.form.clientRequiredForPartners`, linked with `aria-describedby`. With "Hide client" ticked, the hint also says the name stays internal (N1's internal-only meaning stays).
2. Save (including **Save draft**, the same as N2's terms checks) with the toggle on and a name that's empty or on the N1 BR-23 placeholder list ("Confidential", "confidentiel", "N/A", "TBD", …) → **the whole save is refused**. The field error is `jobs.validation.clientRequiredForPartners` and the server code is `client_name_required_for_referrals`. Focus moves to the field, and the form keeps every value.
3. Toggle off → the name is optional again (N1 behaviour, no marker).
4. **Internal referrals** to related orgs follow the same gate (PD-077: internal referrals already need the job open to partners, so there's no exemption). A related org that wants to refer adds the client name, which also gives it client-scope protection.
5. **Nudge on existing jobs.** The nudge gets a fourth reason, (d) `no_client_name`, after N2's (a) terms, (b) not permanent and (c) currency. It shows on the job list and the job page:
   - **Job list chip:** `jobs.nudge.chipClientName` "Hidden from partners: add the client's name".
   - **Banner body:** `jobs.nudge.bodyClientName`.
   - **CTA** (for `jobs:write` holders only): **Add client name** → `/edit#client`.

   The list banner count includes these jobs. In-flight referrals on the job aren't affected and their pages show no nudge.
6. Connector and API jobs without a name can be created and saved, but the open-to-partners flag is refused on them (no UI).
7. **Never shown to partners:** the name isn't in any partner listing, opportunity, referral payload, notification or RPC that A can call (rule 4.5). Platform admins see it only in disputes and on the hire-report admin view (§2.9).

### 2.2 Server-only delivery recording (BR-2)

There's no new UI. The "sent" / "viewed" lines on the sourcing side's referral page keep reading `referral_candidate_requests` as they do today. After BR-2, only the server's issuance path writes `sent_at`. No member action, form or button can set or change it. The **Resend** button keeps working through the server path (N9). A direct call from a source-org member to `record_candidate_request_delivery` is refused (AC-5).

### 2.3 Hiring side: record a hire from any counting referral (BR-3, BR-7 to BR-16, BR-22)

**Entry points.** All three open the same `ReportHireDialog`, in the variant chosen by the server.

| Entry | Where | Shown when |
|---|---|---|
| **E1 Referral page action bar** | `/workspace/[orgSlug]/referrals/[referralId]`, B side | The viewer may act (§2.0), and the referral is hire-eligible (BR-4) or released and inside the record-only range (BR-11, see V5). The button also shows while B's own objection is open or contested; the dialog then opens in the V0 state (BR-45). On `offer` with an active agreement it's the **primary** button, as today. In every other status it's an **outline** button labelled **Record hire**, placed after the transition buttons. |
| **E2 Pipeline board** | `?tab=pipeline`, dropping a card on **Hired** | From `accepted`, `interviewing` or `offer` (PD-075). Today it works from `offer` only. |
| **E3 Hire report panel → Confirm** | B side of the report panel (§2.6) | A report is awaiting B's answer, or is unanswered in the admin queue. The dialog opens **prefilled** (BR-24). |

**Variants.** The server picks the variant and returns it with the referral's terms (`getReferralTerms` + `hireVariant`). The client never decides it. The variant is computed so that **V5 can't be told apart from V2 / V3 / V4 before submit** (BR-11, BR-25 of N1, AC-27).

| Variant | When | Fields | Notice at the top of the dialog | On submit |
|---|---|---|---|---|
| **V0 Own objection open** (BR-45) | B's prior-presentation objection on this referral is `open` or `contested` | **None.** No form | Info `Alert` `hire.objectionOpenTitle` / `hire.objectionOpenBody` ("You can record the hire once the objection is decided."). There's one button, **Close** | Nothing. A forged submit returns `objection_open` and writes nothing. |
| **V1 Happy path** | `offer` + agreement `active` | Exactly as today, N2 S8 (BR-7). No new fields (PD-075) | — | Placement, as today. The referral moves to `hired`. |
| **V2 Any status, confirmed agreement** | agreement `active`, not `offer`: `accepted`, `interviewing`, or `withdrawn` / `rejected` / `cancelled` after acceptance. A declined, `submitted` or SLA-released referral has no agreement, so it's V3 or V4, never V2 (PD-077) | **Common fields** (below) + N2 fee fields | Info line `hire.anyStatusNote` ("This referral is {status}. You can still record the hire: the referral's terms apply.") | Placement on the existing agreement. The referral moves to `hired`, and the previous status stays in the timeline and the audit log. |
| **V3 Deemed agreement** (flag **on**) | no confirmed agreement (never accepted, or agreement `pending_source`) | Common fields + N2 fee fields | Info `Alert` ⚖️ `hire.deemedTitle` / `hire.deemedBody` ({partner}, terms version and date, split) | The agreement is created from the snapshot and marked **deemed**, then the placement is created. A is notified. A isn't asked to confirm. |
| **V4 No agreement, flag off** | no confirmed agreement, `deemed_agreement_enabled` off | Common fields only. **No fee fields** | Neutral `Alert` ⚖️ `hire.noAgreementTitle` / `hire.noAgreementBody` (no placement will be created; the hire is recorded for both organizations) | **Record-only hire** (BR-9 flag off): no placement, no agreement, no split. The referral moves to `hired` (BR-11). A is notified. |
| **V5 Released** | A released the referral | **Same fields as the variant it would otherwise be** (V2, V3 or V4), with no notice about release | Same as V2, V3 or V4 | **Record-only hire** (BR-11). Money inputs are **discarded, not stored**; dates and role are kept (BR-11). The dialog then switches to the **result state** `hire.recordOnlyResult` ("Hire recorded. This referral doesn't carry a split."). A is notified. |
| **V6 Legacy** (no snapshot) | pre-N2 referral | Common fields + today's legacy free entry (fee, currency, guarantee), the legacy alert as today, and the legacy default rule version in force at submission (HE-8) | Legacy alert (existing) | As V2, V3 or V4, depending on the agreement and the flag. |

**Common fields (V2 to V6).** They go above the N2 terms box, in this order:
1. **Offer accepted on** (`Input type=date`, ≤ today). Next to it is a checkbox **I don't know the acceptance date** (`acceptanceUnknown`). When it's ticked, the date input is hidden and cleared, and the hint under **Start date** reads `hire.startUsedForTiming` ("We'll use the start date for timing.").
2. **Start date** (`Input type=date`, required, ≥ the acceptance date when one is given). A future date is allowed (notice periods).
   - **Date bounds (PD-077):** the start date and the acceptance date must both lie within [delivery − 1 year, today + 548 days]. A date outside that range, or a missing start date, gives the field error `hire_dates_invalid` on that date field. The hint under the start date gives the range as dates.
3. **Role hired into** (`RadioGroup`, labelled group):
   - **This job: {job title}** (default).
   - **Another role at this client.** When selected, a required **Job title** input appears (≤ 120 characters, `CharCount`). Its hint `hire.otherRoleHint` asks for no candidate details. **Not rendered** when the referral's job had no client key (BR-3, AC-11). The fee fields then compute on the base entered for that role (snapshot rate × base, with the minimum fee).

There's **no related-org field** (BR-12 rev. 2, PD-073). A hire by a related org of B is recorded like any other hire. When an admin learns of one, they add a note on the hire record (§2.14).
4. Then the N2 block: the **Terms** box, base (and bonus), the computed fee, **Invoiced fee is different** with its reason (the list now includes `non_permanent_engagement`, ⚖️ helper, BR-15) and the note.

**Happy path (V2).**
1. B opens a referral that was withdrawn after acceptance → **Record hire** → V2 opens with the note "This referral is Withdrawn…".
2. B enters the acceptance date, the start date, keeps "This job", enters the base, and the computed fee updates (`aria-live`).
3. **Record hire** → the server re-checks eligibility, the role and the terms version (`hire_terms_changed`, R-8). It creates the placement with `invoice_due_at` = start + 10 business days, computes `late` (BR-13, admin-only) and stores the timestamps the Ops HA-9 query reads (BR-36). If a report is pending, it closes it as **confirmed by the hiring recruiter**, and closes any open `hire_report` dispute on it (BR-22). It moves the referral to `hired` and writes the audit event.
4. The redirect goes to the placement page with the existing created flash. N2 behaviour: "Placement created… Next: record the client invoice."

**Result states (rendered in the dialog, not toasts).**
- **V0 / `objection_open`:**
  - When the dialog opens on V0, it shows only the info alert and **Close**, and focus moves to the alert title.
  - If the objection is filed while the dialog is open (by a colleague), submit returns `objection_open`. The form body is then replaced by the same alert, with **Close**. Nothing is written.
- **V4 and V5:** the dialog body is replaced by a success `Alert` with title `hire.recordOnlyTitle` and body `hire.recordOnlyResult` (V5) or `hire.noAgreementResult` (V4). There's one button, **Done**, which closes the dialog and refreshes the page. Focus moves to the alert title.

**Unhappy paths.**

| Case | Behaviour |
|---|---|
| The referral stopped being eligible while the dialog was open (upheld objection, void, placement recorded by a colleague) | Server `hire_not_eligible` → inline `role="alert"` at the top of the form ("This referral can't take a hire record any more. Refresh to see why."), with **Refresh**. Nothing is written. |
| Terms amended meanwhile | `hire_terms_changed` (existing N2 behaviour). |
| A colleague recorded first (version conflict) | Existing "changed in the meantime" error. |
| "Another role" chosen on a referral whose job has no client key (forged call) | `hire_not_eligible`. |
| B's own objection on the referral is open or contested (BR-45) | `objection_open` → the V0 result state. Nothing is written. |
| Acceptance date after the start date, or in the future | Field errors (`hire.validation.acceptanceAfterStart`, `hire.validation.acceptanceFuture`). |
| Start or acceptance date missing, before delivery − 1 year, or after today + 548 days | Field error `hire_dates_invalid` (PD-077). Nothing is written. |
| A member who can't act (forged call to `report_hire`) | `not_found` → "Referral not found." (no existence oracle, PD-077). |
| Money out of bounds | Field error per N2 bounds (BR-32). |
| Rate limit | Existing `errors.rateLimited` (N2 bucket). |

**Late record (BR-13).** The server never blocks a late record and never tells B it is late. The `late` marker is computed and shown **to admins only**. It's set when the record is made more than 5 business days after the start date, or more than 5 business days after the stated acceptance date. The rules:
- **V1:** the start-date rule only.
- **B's confirm of a report (E3):** checked like any B record.
- **Deemed and upheld hires:** never marked (B didn't record them).
- **Within 5 business days after B's own objection on that referral is rejected:** not marked (BR-45).

It feeds the admin task list (§2.14).

**Offer-stage nudge (BR-16, Should).** After 30 calendar days in `offer`, B (the job owner and managers) gets one in-app notification. The referral page shows a one-line info banner above the action bar: `hire.offerNudge` ("Was the offer accepted? Record the hire so {partner}'s share is set up."). Its link-button **Record hire** opens E1. The banner shows once per referral. It goes away on dismiss (stored per referral, not per user) or on any status change.

### 2.4 Fee-pending placement, fee details and invoice clock (BR-14, BR-31 to BR-33)

**When.** A placement is created **without fee details** after a **deemed confirmation** (gated, N7) or an **upheld** report (§2.9). Both go through BR-9 / BR-10, so with the flag off and no confirmed agreement, the result is a record-only hire, not a fee-pending placement (AC-25).

**Placement status.** The new status `fee_pending` gets the label `labels.placementStatus.fee_pending` ("Fee details pending") with warning tone and a `Clock` icon. Its description is `labels.placementStatusDescription.fee_pending`.

**Placement page** (`/workspace/[orgSlug]/commissions/[placementId]`):
- **Fee panel** (S9 of N2) is replaced by the **Fee-pending panel**:
  - title `commissions.feePending.title` ("Fee details pending from the hiring recruiter");
  - the estimate line: the frozen submission estimate when one exists, `commissions.feePending.estimate` ("Estimate at submission: {amount}"), always labelled as an estimate (N2 BR-36). With no estimate, `commissions.feePending.rateOnly` ("{rate} of the salary at hire"). For flat terms, `commissions.feePending.flat` ("Fee per the terms: {amount}"). On a **legacy** referral (no snapshot), no estimate or rate line is shown; instead the muted line `commissions.feePending.legacy` reads "Terms not recorded: the hiring recruiter enters the fee." (PD-074);
  - the established line: `commissions.feePending.established` ("Hire established on {date}: {how}"), where {how} = `deemed` / `upheld`;
  - the deadline: `BusinessDeadline` with the label `commissions.feePending.due` (`fee_details_due_at`). After the deadline, the line reads `commissions.feePending.overdue` ("Fee details were due {when}").
- **Share tiles:** the three shares show percentages only, with "—" for amounts and `commissions.feePending.noAmounts` ("Amounts appear once the hiring recruiter enters the fee details."). Workatent never invents a fee.
- **Actions:**
  - **B side:** a primary **Enter fee details** button opens `FeeDetailsDialog`. This is `ReportHireDialog`'s snapshot fields without the common fields, prefilled with the start date if known. It has start date, base (and bonus), the computed fee, and I ≠ C with its reason and note. On a legacy referral it uses the legacy free entry instead (fee, currency, start date; N2 BR-26). On save, the placement moves to `pending_client_payment` as a normal N2 placement, and `invoice_due_at` = start + 10 business days.
  - **Hidden until the fee details exist:** **Record client invoice**, **Record client payment**, **Record payout** and every allocation. The RPCs refuse them (`placement_fee_pending`).
  - **Open a dispute** stays available (BR-33).
- **A side:** the same panel and estimate, with no actions except **Open a dispute** and **Open referral**.

**Commissions list** (`/workspace/[orgSlug]/commissions`):
- Fee-pending rows show the status pill and no amount ("—"), with the estimate in muted text.
- Rows with `invoice_due_at` past and no invoice recorded show a warning chip `commissions.invoiceOverdue` ("Invoice overdue") with a `Clock` icon. Both sides see it (BR-14). It disappears once an invoice is recorded. Admins read it through a documented Ops SQL query; there's no admin UI in N3, and X9 builds it (PD-079).

**Overdue fee details.** At `fee_details_due_at` with no fee details:
- B (the job owner and managers) gets the notification `fee_details.overdue`;
- an admin task "Rule 6.4 notice due" appears in `/admin/hire-reports` (§2.14);
- nothing is paused and nothing is sanctioned automatically.

The admin records **Notice sent** (date + optional note, admin-only) on the placement. The task shows "Notice sent on {date}" and stays listed until the fee details exist.

### 2.5 Sourcing side: file a hire report (BR-6, BR-17 to BR-20)

**Entry points.**
- **Referral page, A side:** an outline button **Report a hire** (`hireReport.trigger`, `BadgeCheck` icon) in the action bar. Shown when the viewer may act and the client-visible conditions hold (below).
- **N10 Report a problem → "Was your candidate hired?"** That line now links **Report a hire** when the button would show. Otherwise it shows the plain text `hireReport.rightToolUnavailable`. Selecting the link closes the report dialog and opens the hire-report dialog, with no discard confirm, the same as N10's other "right tool" links (design-review gap 8).

**Client-visible conditions** (all are facts A already sees on its own referral, so showing or hiding the button leaks nothing):
- the referral is delivered, not released, and not `awaiting_candidate` / `candidate_declined` / `already_presented` / void / objection upheld or final;
- it has no hire record (otherwise the placement or record-only banner shows);
- now ≤ window end + 9 months;
- no pending report on it;
- no open objection or dispute on it;
- fewer than 2 rejected reports on it.

The rate limit and the second-report evidence rule are checked **only on submit**.

**Filing-limit line (BR-6).** It's shown to A only, under the button and in the ownership footer (§2.12):
- before window end + 6 months: `hireReport.limit` ("You can report a hire until {date}.");
- between + 6 and + 9 months: `hireReport.limitTail` ("You can report a hire until {date} if the client's selection process started before {windowEnd}.");
- after + 9 months: the button isn't rendered, and the footer reads `hireReport.limitClosed` ("Hire reporting closed on {date}.").

**Dialog `HireReportDialog`** (`Dialog`, `sm:max-w-lg`, `max-h-[90dvh]`, scrolling body, sticky footer):
1. **Header:** title `hireReport.title` ("Report a hire to {partner}"), description `hireReport.description` (what B sees, that files and links are seen by Workatent admins only, B's 10-business-day answer window, and that release is paused while the report is pending).
2. **Tail statement** (shown only between + 6 and + 9 months): a required checkbox `hireReport.tailStatement` ("The client's selection process that led to this hire (first interview or assessment) started before {windowEnd}."). Its hint says at least one evidence item must back it. **Which item** backs it is chosen with a per-item checkbox "This item shows when the process started" (`hireReport.item.backsTail`). At least one item must be ticked (BR-6, PD-068).
3. **The hire:**
   - **Employer as you know it** (required, ≤ 200 characters). The hint says {partner} reads it.
   - **Approximate start**: a month select plus a year select (required). The range is from the delivery month to the current month + 3 (PD-075).
   - **Role, if known** (optional, ≤ 120).
   - **How you learned of it** (required `NativeSelect`, `labels.hireLearnedVia.*`, PD-075: the candidate told me · public profile change · company announcement · a mutual contact · other).
4. **Evidence** (labelled `fieldset`). Between 1 and 5 items (PD-075), each a bordered card with:
   - **Type** (`labels.hireEvidenceType.*`): candidate's written message · company announcement or org chart · public profile change · third-party statement · other;
   - **Date of the item** (required, ≤ today);
   - **Captured on** (optional, ≤ today, ≥ the item date);
   - **Link** (optional, must start with `https://`);
   - **Remove item** (shown when there's more than 1 item).

   **Add another item** sits under the list. A muted line `hireReport.weightHint` says a screenshot with no link or date is accepted but weighs less.
5. **Files** (optional, ≤ 5 per filing, PDF / PNG / JPEG, 10 MB each). This is the N1 upload list exactly: uploading → processing → ready / rejected / upload failed, with `aria-live`. Each file attaches to the report, not to an item.
6. **Statement** (required, 20–2,000 characters, `CharCount`). The hint says {partner} reads it.
7. **Attestation** (required checkbox ⚖️ `hireReport.attestation`, rule 4.8).
8. **Footer:** **Cancel** · **File hire report**. The submit button is disabled while any file is uploading or processing, or any file was rejected. A status line linked with `aria-describedby` says why (`hireReport.file.waiting` / `hireReport.file.removeRejected`), as in N1. Other validation runs on submit with field errors.

**Outcomes on submit (returned results).**

| Outcome | UI |
|---|---|
| `filed` | The dialog closes. Toast `hireReport.messages.filed` ("Hire report filed. {partner} has until {when} ET to answer."). The page refreshes and shows the report panel (§2.6). |
| `hire_report_unavailable` (generic: not eligible, out of tail, pending report, open objection or dispute, two rejections, second report without newer evidence, released, void, another org's referral) | An inline `Alert` at the top of the form, `errors.hire_report_unavailable` ("You can't file a hire report on this referral right now."), plus the hint `hireReport.unavailableHint` (use the referral messages, rule 7.1). The form keeps its values. **Same text and the same payload shape for every cause** (AC-36). |
| `hire_report_rate_limited` | Inline `Alert` `errors.hire_report_rate_limited` ("Your organization has reached the limit for hire reports. Try again later."). |
| `hire_already_recorded` | Inline `Alert` `errors.hire_already_recorded` ("{partner} already recorded this hire."), with the link-button **Open placement**, or **Open referral** for a record-only hire. |
| `hire_report_files_not_ready` (forged) | Inline error. The UI never sends it. |
| Field errors | Under each field. Focus moves to the first invalid field. |
| Per-user rate limit (5/h, the N1 disputes bucket) | Existing `errors.rateLimited`. |

**Closing with uploaded files** discards them (N1 behaviour). Orphans are cleaned up server-side.

### 2.6 Hire report panel, both sides (BR-19, BR-21 to BR-30)

`HireReportPanel` renders under the action bar, in the same slot as the N1 claim panel, whenever a report exists on the referral. Only the latest report is expanded. Earlier closed reports collapse into one line each ("Report filed {date}: {outcome}").

**Header:** title `hireReport.panel.title` ("Hire report"), with the status pill (`labels.hireReportStatus.*`, icon + text) on the right.

**Rows (`dl`):**

| Row | B side (hiring) | A side (sourcing) |
|---|---|---|
| Filed | {when} ET, by "{partner}" | {when} ET, by "You" / the member name |
| Employer as reported | text | text |
| Approximate start | month year | same |
| Role | text or "Not given" | same |
| How they learned | label | same |
| Tail statement | shown when made: `hireReport.panel.tailMade` | same |
| Evidence items | per item: type, item date, captured on. **No link.** The muted line `hireReport.panel.linksHidden` | per item: type, dates, **link** (`https:` only, `rel="noopener noreferrer"`, opens in a new tab) |
| Files | per file: "File {n}", upload time, SHA-256 with **Copy**. **No name, no type, no download.** The muted line `hireReport.panel.filesHidden` | per file: **file name**, size, upload time, SHA-256, **Download** (60-second signed URL, disabled until clean) |
| Statement | quoted | quoted |
| Answer deadline (while awaiting) | `BusinessDeadline` + actions | `BusinessDeadline` |
| Contest (once contested) | reason label, statement, own evidence (types, dates, own files with download) | reason label (`not_this_client` → "Not this client"), statement **(hidden for `not_this_client`, BR-25)**, evidence types and dates. **No files.** |
| Rebuttal (once filed) | statement, item types and dates, "File {n}" + SHA-256 | own statement, items, files |
| Outcome | status line + resolution (§2.9) | status line + resolution (not shown for "not this client") |

**Status pills and lines** (`labels.hireReportStatus`):

| Status | Tone / icon | B line | A line | B actions | A actions |
|---|---|---|---|---|---|
| `awaiting_answer` | warning / `Clock` | `panel.status.awaitingTarget` ("Answer by {when} ET: confirm and record the hire, or contest it.") | `panel.status.awaitingSource` ("{partner} has until {when} ET to answer.") + `panel.releasePaused` | **Confirm and record hire** (primary, E3) · **Contest** (outline) | — |
| `unanswered` (admin queue) | info / `Scale` | `panel.status.unansweredTarget` ("The answer deadline passed. A platform admin is reviewing the report. You can still record the hire.") | `panel.status.unansweredSource` ("{partner} didn't answer by the deadline. A platform admin is reviewing the report.") | **Record hire** only (E3) (BR-29) | — |
| `contested` (rebuttal window) | info / `Scale` | `panel.status.contestedTarget` ("Contested. {partner} can add a rebuttal until {when} ET. Then a platform admin decides.") | `panel.status.contestedSource` ("{partner} contested this report. You can add one rebuttal until {when} ET.") | **Ask for an authorization check** (§2.13) | **Add rebuttal** |
| `in_review` (after the rebuttal or its deadline) | info / `Scale` | `panel.status.inReview` ("A platform admin is reviewing the report.") | same | **Ask for an authorization check** | — |
| `confirmed` | success / `Check` | `panel.status.confirmedTarget` ("You confirmed this hire on {date}.") | `panel.status.confirmedSource` ("{partner} confirmed this hire on {date}.") | — | — |
| `closed_by_record` | success / `Check` | `panel.status.closedByRecordTarget` ("Closed: you recorded the hire on {date}.") | `panel.status.closedByRecordSource` ("Closed: confirmed by the hiring recruiter on {date}.") | — | — |
| `deemed_confirmed` (gated, N7) | success / `Check` | `panel.status.deemedTarget` ("Confirmed on {date}: no answer by the deadline after the notice was emailed to you and another admin of {org}. Enter the fee details by {when} ET."). The `{when}` date is an N7 acceptance condition and may show "—" in N3 (PD-079) | `panel.status.deemedSource` ("Confirmed on {date}: {partner} didn't answer by the deadline.") | link **Enter fee details** (to the placement) | — |
| `upheld` | success / `Check` | `panel.status.upheld` ("Upheld by a platform admin on {date}. The hire counts.") + resolution | same + resolution | link to the placement | link to the placement |
| `rejected` | neutral / `X` | `panel.status.rejected` ("Not upheld by a platform admin on {date}.") + resolution | same + resolution, **or** `panel.status.notThisClient` ("Not this client.") with **no resolution text** when the finding was `not_this_client` | — | **Report a hire** may show again (BR-17 second-report rule) |
| `void` | neutral / `Ban` | `panel.status.voidTarget` ("Closed by a platform admin on {date}. This referral no longer counts.") (PD-075) | `panel.status.voidSource` ("Closed on {date}: a platform admin found the candidate's confirmation invalid. This referral no longer counts.") | — | — |

**Release paused line (BR-21).** On A's side only, while the report is pending: `hireReport.panel.releasePaused` ("While this report is pending, you can't release this candidate for this client."). B never sees it.

### 2.7 Hiring side: confirm or contest (BR-23 to BR-25)

**Notice.** On filing, the job owner and **every** `org_admin` and `recruiter_manager` of B get the in-app notification `hire_report.filed`. Reminders `hire_report.reminder` go out at business days 5 and 8, once each. If the job owner was deactivated, the others still get them and **clocks don't pause** (HE-10). Emails come with N7.

**Confirm (BR-24).** **Confirm and record hire** opens `ReportHireDialog` in the right variant (V2 to V6), prefilled:
- the role: "Another role at this client" with the report's role text, when the report gives a role that differs from the job title; otherwise "This job";
- the start date: empty, with the hint `hire.reportedStart` ("{partner} reported a start around {month}.");
- the fee fields from the snapshot, as usual.

On submit: the placement (or record-only hire), report status `confirmed`, and A is notified (`hire_report.confirmed`).

**Contest (BR-25).** **Contest** opens `ContestHireReportDialog`:
1. Title `hireContest.title` ("Contest this hire report?"). The description says a platform admin decides, {partner} can add one rebuttal, and a false contest breaks rule 4.8 ⚖️.
2. **Reason** (`RadioGroup`, required, `labels.hireContestReason.*`, exactly four options):
   - `not_hired`: "The candidate wasn't hired by the client, its affiliates, agents, EOR or payroll provider" ⚖️ (Q-3);
   - `outside_window`: "The offer was accepted outside the protection";
   - `different_person`: "It's a different person";
   - `not_this_client`: "The employer isn't this referral's client".

   There's no "we already had them" option. The hint `hireContest.noPriorHint` says objections were the place for that.
3. **Fields by reason:**
   - `outside_window`: **Offer accepted on** (required date, ≤ today) **and** **Selection process started on** (required date, ≤ the acceptance date).
   - every reason: **Statement** (required, 20–2,000). The hint varies by reason:
     - `hireContest.statementHint`: "{partner} reads this. Don't name your client.";
     - for `not_this_client`: `hireContest.statementHintAdmin`: "Only Workatent admins read this." (BR-25 rev. 2).
   - **Documents** (optional, N1 upload list, ≤ 5). The hint says only Workatent admins see the files, for example the client's written statement, shared with your permission.
   - **Attestation** (required ⚖️ `hireContest.attestation`).
4. **Footer:** **Cancel** · **Contest report**, disabled while files aren't ready (N1 pattern).
5. On submit: a referral-level dispute of kind `hire_report` is created; `rebuttal_due_at` = contest + 5 business days; A is notified (`hire_report.contested`); the panel moves to `contested`. Toast `hireContest.messages.contested`.

**Unhappy paths.**
- Contest after `answer_due_at` → `hire_report_answer_closed`. The button isn't rendered after the deadline. A forged call gets this code.
- Another open dispute on the referral → `dispute_already_open` (one open dispute per referral).
- `outside_window` without both dates → field errors.
- Files not ready (forged) → `hire_report_files_not_ready`.
- Rate limit → the disputes bucket, `errors.rateLimited`.

### 2.8 Sourcing side: rebuttal (BR-26)

**Add rebuttal** (A side, `contested`, before `rebuttal_due_at`) opens `HireRebuttalDialog`:
- title `hireRebuttal.title`, and a description saying it can be added **once** and the admin then decides on the record;
- `BusinessDeadline` (`rebuttal_due_at`);
- **Statement** (required, 20–2,000);
- **Evidence items** (optional, 0–5, the same card as §2.5);
- **Files** (optional, ≤ 5);
- **Attestation** ⚖️.

On submit, the panel moves to `in_review`, B is notified (`hire_report.rebuttal`), and the button disappears. A second rebuttal or a late one → `hire_rebuttal_closed`. At `rebuttal_due_at` with no rebuttal, the panel moves to `in_review` and nobody is notified.

### 2.9 Platform admin: queue, decision and tools (BR-5, BR-27 to BR-29)

**Queue.** The new route `/admin/hire-reports` (`AdminHireReportsPage`) has sections in this order. Each section is a `Panel` with a count and an empty line.
1. **To decide:** contested reports past their rebuttal step (`in_review`), and `unanswered` reports. Each row shows a type pill (`Contested` / `Unanswered: notice not delivered`), the two orgs, the job title, the filed date, and `BusinessDeadline` for `decide_by`, with an **Overdue** chip after it. Rows link to the detail.
2. **Waiting on a party:** `awaiting_answer`, `contested` inside the rebuttal window, and open authorization checks waiting for A's evidence. Read-only rows with the deadline.
3. **Admin tasks:** fee details overdue ("Rule 6.4 notice due" / "Notice sent on {date}") and late hire records. Each row links to the placement's admin view or the referral's admin page. (HA-9 releases aren't listed: Ops SQL, BR-36.)
4. **Recently closed** (last 20): outcome pill and date, including deemed confirmations (gated).

`/admin` overview: the "Needs attention" panel gets a third tile, **Hire reports**. Its count is section 1 + section 3 fee-overdue tasks with no notice sent (PD-075). The `kpi.attention` total includes it.

`/admin/disputes`: `hire_report` disputes show a compact card with the badge `labels.disputeType.hire_report` ("Hire report"), the two orgs, the job, the dates, and **Open hire report** → the detail. The decision happens only on the detail, so there's one decision surface.

**Detail.** The new route `/admin/hire-reports/[reportId]` (`AdminHireReportPage`), 404 for non-admins. It uses the layout of the N1 `ReferralDisputeCard`, as a page:
- **Header:** "{A} → {B}", job title, the status pill, and `BusinessDeadline` (`decide_by`, or `answer_due_at` while waiting). Organization pills: `Suspended` (danger) when either org is suspended. The language hint (existing `dispute.languageHint`).
- **Referral facts (RD-033, BR-5):**
  - the **normalized client key** at submission and at delivery, plus the **client name on the job today**. They're labelled exactly "Normalized client key (at submission)", "Normalized client key (at delivery)" and "Client name on the job today"; no label may say "client name" for a key. Names at submission and delivery come with the pre-launch follow-up (PD-079);
  - delivery date and window end;
  - window end + 3 months (tail) and the filing limits;
  - legacy yes / no;
  - the status history with dates. The admin reads whether the referral was in progress at the time of the offer from it.
  - Under these sits a static **coverage checklist** (`admin.hireReports.coverage.*`, text only, no computed verdict): (1) in progress at the offer; (2) offer accepted inside the window; (3) process started inside the window and offer within 3 months after it. Next to it, the list of things that are never a defence. The server never evaluates coverage (BR-5).
- **Report (A):** every field, the tail statement, every evidence item with its **link**, every file with name, size, SHA-256 and **Download** (60-second signed URL, audited), the statement, the filer.
- **Answer (B):** the contest reason, the dates (`outside_window`), the statement, the files (download), the attestation time. Or "No answer" for unanswered reports.
- **Rebuttal (A):** when filed.
- **Signals:**
  - the **same person** block (PD-024, extended to hire reports: identifiers of the referral's candidate compared with nothing, or with the other referral when HE-5 applies; Same · Different · Not available);
  - the **record-created note** (BR-38);
  - any **email-change note** from the candidate confirmation;
  - **flags** on either org (HA-6) and on this referral (late). HA-1 and HA-9 aren't shown (Ops SQL, BR-40);
  - *(Should)* **employer signal**: "Employer matches a client key: Yes / No".
- **Delivery records** (for the silence branch): per recipient, delivered / bounced / none. Before N7 this shows `admin.hireReports.noDeliveryRecords` ("No email delivery records (emails start with N7)").
- **Admin fields (BR-28)**, saved with **Save notes** and audited, never shown to A or B:
  - **Candidate contacted**: a number stepper 0–5. A hint shows when > 1: "At most one contact is expected.";
  - **Client's written confirmation**: `NativeSelect` with not requested / requested / provided / refused. The hint says a refusal counts against {B} (rule 7.2);
  - an **internal note** (≤ 2,000).
- **Authorization check** sub-panel (§2.13).
- **Actions** (by status):

| Status | Actions |
|---|---|
| `in_review` | **Uphold report** · **Reject report** |
| `unanswered` | **Uphold report** · **Reject report** (on the record, rule 7.2). There's no restart of the answer clock (BR-29 rev. 2). |
| others, including `deemed_confirmed` | none (read-only). Reopening a deemed confirmation comes with N7 (BR-30). |

- **Uphold report** (`ConfirmDialog` with resolution):
  - the title asks the question; the body says the hire counts on this referral and what follows:
    - with a confirmed agreement, or the flag on: "A placement is created with fee details pending from {B}, due in 10 business days.";
    - otherwise (flag off, no agreement): "The hire is recorded without a split." ⚖️;
  - a **written resolution** (required, 20–2,000). The hint says both organizations read it, and not to name the client;
  - confirm **Uphold report**.
- **Reject report**:
  - a **Finding** (`RadioGroup`, required): not hired · outside the protection · different person · **not this client**. The hint says for "not this client" the sourcing side sees only "Not this client" and not the resolution;
  - a **written resolution** (required);
  - confirm **Reject report**.
  - Rejections count toward A's two-per-referral limit and the HA-6 flag.
- **No amount anywhere** in the admin decision (rule 7.5). There are no money fields.

**Outcomes and notifications.** `hire_report.decided` goes to both orgs. A's text for `not_this_client` says only "not this client". Upheld leads to the fee-pending placement (§2.4) or a record-only hire (flag off, no agreement).

### 2.10 Silence at the answer deadline (BR-29, BR-44 HE-11) — gated on N7

At `answer_due_at`, with no confirm, contest or B record, the maintenance sweep runs:
- **Deemed confirmed** only if **all** hold:
  - the `hire_report.filed` email was recorded **delivered** with **no bounce** for the **job owner** and for **at least one other** `org_admin` or `recruiter_manager` of B (two distinct people);
  - **and** B isn't suspended.

  Then the report moves to `deemed_confirmed`, the placement is created **fee-pending** (or a record-only hire when the flag is off and there's no agreement), and both sides are notified (`hire_report.deemed`).
- **Otherwise** the report moves to `unanswered` and appears in the admin queue as "Unanswered: notice not delivered". A and B see the `unanswered` lines (§2.6). The admin decides on the record. There's no restart of the answer clock (BR-29 rev. 2).
- **No active job owner** (deactivated or removed, HE-10): the condition can't be met, so the report is never deemed and goes to the admin queue, even with delivered records for two managers (BR-29 rev. 2, AC-103).

**Before N7** there are no delivery records, so every unanswered report takes the second branch. QA seeds delivery records with the service role to test the first branch (AC-63, AC-64). There's no flag for this.

**Reopen (BR-30) is not in N3.** N7 builds it together with the delivery records, and N7 can't enable deemed confirmation without it (PD-073). No reopen action, state, deadline or copy ships in N3.

**A suspended party (N10 settlement mode, HE-11, PD-079).**
- **B suspended:** B can still contest and record on in-flight referrals. If B hasn't answered by `answer_due_at`, the report goes to `unanswered`, **never deemed**, even with delivery records.
- **A suspended:** A can still open the referral, file and rebut. If A hasn't rebutted by `rebuttal_due_at`, the report moves to `in_review` as usual.
- Admins can decide either way, and admin views show the `Suspended` pill. The settlement-mode shell (banner, navigation) is N10's.

### 2.11 Release from declined or rejected referrals, and the release block (BR-21, BR-34)

**Release later** (N1 S2-g, `ReleaseDialog`, two steps, irreversible) now also shows on `declined` and `rejected` referrals, A side, when **all** hold:
- N1's guards: (a) delivered; (b) still counts; (c) no open dispute;
- **(d) no placement** on it (live or record-only hire);
- **(e) no pending report** on **any** referral of A's org at this hiring org whose client key matches **either** key of the reported referral (BR-21, union rule).

If any guard fails, the button **isn't rendered**. The same five guards apply to the withdraw dialog's release checkbox (N1 S3). The RPC re-checks all of them and refuses with the existing `release_not_allowed`. The copy, the steps and the toasts are N1's, unchanged. The release flag stays invisible to B everywhere (N1 BR-25).

### 2.12 Ownership line (BR-35)

The timeline panel footer (N1 S2-h) changes as follows. Rows are evaluated top to bottom, and the first match wins.

| Situation | A side (sourcing) | B side (hiring) |
|---|---|---|
| Released | N1 `detail.ownershipReleased` {date} (unchanged) | **Same as "delivered, protected"** (B never learns of a release) |
| Upheld or final objection | N1 `detail.ownershipEnded` | same |
| Void (BR-37) | `detail.ownershipVoid` ("This referral no longer counts.") | same |
| `already_presented` | N1 `detail.ownershipNotDelivered` | (never visible to B) |
| Not delivered | N2 `detail.ownershipStartsAtDelivery` (no date) | no line |
| Delivered, in progress, or now ≤ window end | `detail.protectedUntil` ("Protected while in progress and until {date} ET.") | `detail.protectedUntil` + `detail.protectedUnlessReleased` ("Protected while in progress and until {date} ET, unless the sourcing recruiter released the candidate.") |
| Delivered, not in progress, window ended | **The filing-limit line** (`hireReport.limit` / `limitTail` / `limitClosed`, §2.5) | no line |

The old `detail.ownership` key is retired. The B line is **identical** on released and unreleased referrals (AC-76).

### 2.13 Authorization check (BR-37, BR-38)

**Who starts it.** Only a platform admin opens a check. There are three triggers:
1. **A stopped submitter** asks through support (the N1 stop reference). The admin opens the check from `/admin/referrals/[referralId]`. The first submitter isn't revealed.
2. **The candidate** asks (support). Same entry point.
3. **The hiring side** inside a contested objection or hire-report dispute uses **Ask for an authorization check** on its panel (N1 claim panel while the objection is `contested`; hire report panel while `contested` / `in_review`):
   - a dialog with a required **Reason** (20–2,000, admin-only) and optional files (N1 pipeline, admin-only);
   - **Send request**, then the toast `authCheck.messages.requested`;
   - the panel shows "Authorization check requested on {date}";
   - the request appears on the admin hire-report or dispute view with **Open authorization check**.

   It can be used once per dispute. A second request → `auth_check_already_requested`.

**Admin opens it** (`OpenAuthCheckDialog`):
- **Requested by** (`RadioGroup`: stopped submitter · candidate · hiring side in a dispute; the third is preselected when coming from a request);
- **The challenger brought evidence** (checkbox);
- a read-only line saying whether the confirmation carries a **recent-change note** (record created within 30 days of issuance, or a destination email change).

On **Open check**:
- if the note exists **or** the box is ticked → an **evidence request** goes to A: `evidence_due_at` = now + 5 business days, and the notification `auth_check.requested` goes to the source org (candidate owner + managers);
- otherwise the check opens with no request, and the admin decides on the record (PD-075, RD-029).

**Source org view.** On the referral page, A side only, there's an `AuthCheckPanel` above the report or claim panel:
- the title `authCheck.title` ("Authorization check");
- the body `authCheck.body` (Workatent needs independent evidence that the candidate agreed to be represented, for example the candidate's dated message from a channel other than the confirmation mailbox) ⚖️;
- `BusinessDeadline`;
- a form with a statement (required, 20–2,000), files (N1 pipeline, 1–5, required) and the attestation ⚖️, and the button **Send evidence**. After sending: "Evidence sent on {date}. A platform admin is reviewing it."

B never sees this panel.

**Admin decides** on the check sub-panel, with A's files (download) and the admin field "Candidate contacted through an identifier the source org didn't set" (counts into BR-28's total):
- **Valid** → the check closes and nothing changes;
- **Invalid** (the candidate denies, the mailbox is recruiter-controlled, or no answer by `evidence_due_at`) → `ConfirmDialog` with a resolution (⚖️ voiding wording). On confirm:
  - the referral is **void**: it stops counting and loses first position (the duplicate check no longer stops on it);
  - no fee;
  - the consent is marked **disputed**;
  - the RD-002 breach-review flag is set;
  - a pending report on it closes as `void` and its dispute closes;
  - a later report is refused (`hire_report_unavailable`, HE-12);
  - the source org gets `auth_check.decided`.

  When `evidence_due_at` passes with nothing sent, the admin sees "No evidence by the deadline" and **Mark invalid** is preselected. It never happens automatically.

**Record-created note (BR-38).** When the candidate record was created within 30 days before token issuance, "Candidate record created on {date}." shows in:
- the **sourcing side's** candidate-confirmation block on the referral page (next to sent / viewed / confirmed);
- the admin views (hire report detail, authorization check, N1 referral dispute card).

It never shows to the hiring side.

### 2.14 Admin flags, tasks, hire-record note and Ops SQL (BR-12, BR-36, BR-40, BR-41)

**In the product:**
- **Organizations to review** (existing `/admin` panel, N1) gains one line per org: `flags.rejectedHireReports` ("{count} rejected hire reports in 90 days", HA-6, ≥ 2). The existing note says these are flags only.
- **Admin tasks** (`/admin/hire-reports` section 3), one row each:
  - **Late record** (BR-13): placement or record-only hire, with the recorded date vs start + 5 business days;
  - **Fee details overdue** (BR-31): **Record notice sent**.

  Plus the decision-overdue chips and `unanswered` rows (sections 1 and 2). **No automatic action** from any flag.
- **Hire-record admin note** (BR-12 rev. 2). On `/admin/referrals/[referralId]`, when the referral has a hire record (placement or record-only), a **Hire record** panel shows:
  - the record kind (placement / without a split);
  - recorded on, the acceptance date (or "unknown"), the start date, the role and the `late` marker;
  - an **Admin note** (`Textarea`, ≤ 2,000) with **Save note**. Its hint suggests, for example, "Hired by a related organization of {B} (shared member)". The note is audited, admin-only, and never in an A or B payload.

  The same note shows read-only on the hire-report detail.

**Through Ops SQL until the N2.1 metrics panel (PD-069 cut 3, PD-073). No in-product UI in N3.**
- **HA-1:** a hiring org with ≥ 2 hires in 12 months that A first reported and that ended `confirmed`, `deemed_confirmed`, `upheld` **or `closed_by_record`** (PD-075).
- **HA-9:** a release within 14 days before a hire record (any kind) at the same client, by either key.
- **The brief §4 metrics counts.**

The queries are documented in `backend.md` (Ops SQL section) and read the stored timestamps and statuses.

- **No counterpart statistics** (BR-41): no member surface shows counts or outcomes about another org's reports or answers.

### 2.15 Notifications (BR-42)

All of these are in-app, with PII-free params and English text in SQL (PD-026). N7 adds the emails and localisation. Recipients on B's side are the job owner + `org_admin`s + `recruiter_manager`s. On A's side they're the candidate owner + managers (RD-036). The text is in §5.9.

| Kind | To | Trigger |
|---|---|---|
| `hire_report.filed` | B | A files |
| `hire_report.reminder` | B | business days 5 and 8, while awaiting |
| `hire_report.contested` | A | B contests |
| `hire_report.rebuttal` | B | A adds a rebuttal |
| `hire_report.decided` | A, B | the admin upholds or rejects (A's text has no resolution for "not this client") |
| `hire_report.deemed` | A, B | deemed confirmation (gated) |
| `hire_report.closed_by_record` | A | B records while a report is pending |
| `hire_report.confirmed` | A | B confirms through the report |
| `hire.recorded_deemed_agreement` | A | B records on a referral with no confirmed agreement, flag on |
| `hire.recorded_without_split` | A | a record-only hire (released or flag off) |
| `fee_details.overdue` | B | `fee_details_due_at` passes |
| `auth_check.requested` | A | an evidence request |
| `auth_check.decided` | A | valid or invalid |
| `hire.offer_nudge` (Should) | B | 30 days in `offer` |

### 2.16 Gated and edge states, in one place

| State | What the UI does |
|---|---|
| **Flag off** (production default) | V3 never appears. B sees V4 on referrals with no confirmed agreement. Upheld or deemed reports on those referrals become record-only hires. The admin uphold dialog says so. Rule 6.3 copy says so ⚖️. |
| **Flag on** (false by default in every environment. Tests turn it on per case through the service role, and a local script turns it on for development. Production only after counsel Q-1 + N10, PD-074) | V3 is offered. The agreement panel on both sides shows the pill `detail.agreement.deemed` ("Created from the referral's terms") and the line `detail.agreement.deemedLine`. |
| **Before N7** | `deemed_confirmed` never occurs. Reopen isn't built (N7). Every unanswered report goes to the admin queue. The admin detail shows "No email delivery records". Rule 7.2's deemed sentence carries "ships with N7" (ux-writer). |
| **Suspended B** (N10 settlement mode, PD-079) | B can still contest and record on in-flight referrals. If B hasn't answered at the deadline, the report goes to `unanswered`, never deemed. The admin sees the `Suspended` pill. |
| **Suspended A** (N10 settlement mode, PD-079) | A can still open the referral, file and rebut. Deadlines run. If there's no rebuttal by the deadline, the report goes to `in_review`, and the admin decides on the record. |
| **No active job owner (HE-10)** | Notices go to B's admins and managers, and clocks don't pause. Deemed needs the job owner's delivered email, so the report is never deemed and goes to the admin queue (BR-29 rev. 2, AC-103). |
| **B's own objection open (BR-45)** | **Record hire** opens V0 (`objection_open`). After a rejection, B records normally, and a record within 5 business days of the decision isn't late. After an upheld or final objection, the referral doesn't count. |
| **Internal referral (HE-14)** | Same flows and copy. Placements keep 0 sourcing bps. A report only records the hire. |
| **Week-2 leaver (HE-2)** | The hire stands. The existing guarantee and fall-off flow use the snapshot. |
| **Reneged before start (HE-3)** | It isn't a hire. There's one hire record per referral and no placement cancel flow in N3. Cancelling and re-recording a later start go to **X6**; until then Ops handles them through support with an audit note (BR-44, PD-074). |
| **Revoked authorization (HE-9)** | Doesn't block a report or a record. |

### 2.17 Unhappy paths across flows

| Case | Behaviour |
|---|---|
| **No permission** | Actions aren't rendered. A forged call from the other side, a plain recruiter who isn't the owner, or another org → "Referral not found." (no leak). Non-admins on `/admin/hire-reports*` → the existing 404. |
| **Empty** | Admin queue sections: `admin.hireReports.empty.*` per section. Commissions with no fee-pending rows: unchanged. A referral with no report: no panel. |
| **Invalid input** | Field-level errors, focus on the first invalid field (N1 / N2 patterns). |
| **Rate-limited** | Report filing: org limits get their own code (`hire_report_rate_limited`); the user 5/h bucket uses `errors.rateLimited`. Contest and rebuttal share the disputes bucket. Hire records use the N2 bucket. |
| **Revoked / expired** | Expired answer, rebuttal or evidence window: the action isn't rendered and a forged call gets its closed code. Revoked authorization doesn't block (HE-9). |
| **Suspended org** | §2.16. |
| **Void referral** | Every N3 action disappears. The ownership line reads "no longer counts". |
| **Network / generic** | Existing `errors.generic` inline in the open dialog. The dialog stays open with the values kept. |

### 2.18 N2 leftovers built in drop 1 (Must 0b, PD-072)

N3 builds no new screens for these. One behaviour is specified here for frontend:
- **QA-N2-12, admin amendment form** (`/admin/referrals/[referralId]`, `AmendTermsForm`). When a flat → % amendment is refused with `errors.stale_version` (the job's salary currency changed since the form was rendered), the form shows the existing error inline, and the page calls `router.refresh()`. The form then re-renders with the current % currency, and nothing is written. The error copy stays as it is (PD-074 Q-PM-12, AC-104).
- **QA-N2-10** (field error on `flatCurrency`) and **QA-N2-11** (`errors.amendment_legacy_referral` for both % and flat posts on legacy referrals) are backend behaviours with the existing copy. They're covered by the N2 regression in AC-99.

---

## 3. Screens & states

No new workspace routes. Two new admin routes.

| # | Screen / component | Route | New / extended | Components (`src/components/ui` + shared) | Loading | Empty | Error | Success |
|---|---|---|---|---|---|---|---|---|
| S1 | Job form, client-name gate | `/workspace/[orgSlug]/jobs/new`, `…/jobs/[jobId]/edit` | Extended (`JobForm`) | `FormField`, `Input`, `Checkbox` | `SubmitButton` "Saving…" | — | field error + `FormMessage` | existing redirect + flash |
| S2 | Job list + job page nudge (d) | `/workspace/[orgSlug]/jobs`, `…/jobs/[jobId]` | Extended | `StatusPill`, `Alert`, `Button` | — | — | — | the nudge disappears |
| S3 | Record hire dialog V0–V6 + result | from S4, pipeline, S6 | Extended (`ReportHireDialog`) | `Dialog`, `Alert`, `RadioGroup`, `Input type=date`, `Checkbox`, `FormField`, `NativeSelect`, `Textarea`, `CharCount`, `SubmitButton` | "Recording…" | — | inline `role="alert"` / field errors; V0 `objection_open` state | redirect (placement) or result state (V4/V5) |
| S4 | Referral page (both sides) | `/workspace/[orgSlug]/referrals/[referralId]` | Extended | `Panel`, `StatusPill`, `Button` | existing `loading.tsx` | — | existing | — |
| S5 | Hire report dialog (A) | from S4, N10 Report a problem | **New** (`HireReportDialog`) | `Dialog`, `Checkbox`, `Input`, `NativeSelect`, `Textarea`, `CharCount`, N1 file list, `Button` | "Filing…" | — | inline `Alert` (outcome) / field errors | toast + panel |
| S6 | Hire report panel (both sides) | inside S4 | **New** (`HireReportPanel`) | `Panel`, `StatusPill`, `BusinessDeadline`, `Button`, `Tooltip` (copy) | — | not rendered | — | — |
| S7 | Contest dialog (B) | from S6 | **New** (`ContestHireReportDialog`) | `Dialog`, `RadioGroup`, `Input type=date`, `Textarea`, N1 file list, `Checkbox` | "Contesting…" | — | inline / field | toast |
| S8 | Rebuttal dialog (A) | from S6 | **New** (`HireRebuttalDialog`) | same as S5 subset | "Sending…" | — | inline / field | toast |
| S9 | Fee-pending placement + fee details dialog | `/workspace/[orgSlug]/commissions/[placementId]` | Extended + **new** (`FeePendingPanel`, `FeeDetailsDialog`) | `Panel`, `StatusPill`, `BusinessDeadline`, `Dialog` (N2 fields) | "Saving…" | — | inline / field | toast `commissions.feeDetails.saved`, the page re-renders as a normal placement |
| S10 | Commissions list chips | `/workspace/[orgSlug]/commissions` | Extended | `StatusPill` | — | existing | — | — |
| S11 | Release later on declined / rejected | inside S4 | Extended (`ReleaseDialog`) | as N1 | "Working…" | — | `release_not_allowed` inline | N1 toast |
| S12 | Ownership footer | inside S4 | Extended | text + `ShieldCheck` | — | — | — | — |
| S13 | Authorization check: request (B), evidence (A) | inside S4 | **New** (`RequestAuthCheckDialog`, `AuthCheckPanel`) | `Dialog`, `Panel`, N1 file list, `Textarea`, `Checkbox` | "Sending…" | — | inline / field | toast + panel line |
| S14 | Admin hire-report queue | `/admin/hire-reports` | **New** | `PageHeader`, `Panel`, `SectionTitle`, `StatusPill`, `Badge`, `BusinessDeadline`, `EmptyState` | route `loading.tsx` (skeleton rows) | per-section empty line; whole page `EmptyState` when all empty | `errors.generic` per failed section (never zeros) | — |
| S15 | Admin hire-report detail | `/admin/hire-reports/[reportId]` | **New** | `Panel`, `Badge`, `StatusPill`, `BusinessDeadline`, `ConfirmDialog` (resolution), `RadioGroup`, `NativeSelect`, `Input type=number`, `Textarea`, `AdminEvidenceDownload`, `SamePersonBlock` | skeleton | — | 404 for an unknown id; a section error inline | toast + status re-render |
| S16 | Admin auth-check sub-panel + open dialog | inside S15, `/admin/referrals/[referralId]` | **New** (`AuthCheckAdminPanel`, `OpenAuthCheckDialog`) | `Panel`, `Dialog`, `RadioGroup`, `Checkbox`, `ConfirmDialog` | "Working…" | "No authorization check" | inline | toast |
| S17 | Admin disputes: hire-report card | `/admin/disputes` | Extended | `Panel`, `Badge`, `Button` | — | existing | — | — |
| S18 | Admin overview: attention tile, HA-6 flag line (no metrics panel: Ops SQL) | `/admin` | Extended | `Panel`, `KpiTile`, `StatusPill` | — | `flags.empty` | `errors.generic` | — |
| S19 | Notifications | `/workspace/[orgSlug]/notifications` | Extended (new kinds) | existing | — | — | — | — |
| S20 | N10 Report a problem, hire line | N10 S8 | Extended | `Button` (link) | — | — | — | — |
| S21 | Admin referral page: Hire record panel + admin note; amendment form refresh (QA-N2-12) | `/admin/referrals/[referralId]` | Extended | `Panel`, `Textarea`, `CharCount`, `Button` | "Saving…" | panel not rendered without a hire record | inline `role="alert"`; `errors.stale_version` → inline + `router.refresh()` | toast `admin.hireRecord.noteSaved` |

### S3 Record hire dialog: layout

`DialogContent` `sm:max-w-lg`, `max-h-[90dvh]`, scrolling body, sticky footer (as today).
- **V0:** the header, then the info `Alert`, then the footer with **Close** only. There's no form.
- **Order:** header → notice (V2: info line; V3: info `Alert` ⚖️; V4: neutral `Alert` ⚖️) → common fields (acceptance date + unknown checkbox, start date, role group) → the N2 terms box → fee inputs → result box → I ≠ C → the form message.
- **V4 has no terms box and no fee inputs.** It shows one muted line with the referral's terms version (`hire.noAgreementTermsLine`) so B knows which terms would have applied.
- **Disabled:** **Record hire** is never disabled before submit (validation runs on submit). While submitting, every button is disabled.
- **Result state (V4 / V5):** the body is replaced by a success `Alert` (`CheckCircle2`, `role="status"`). The footer shows only **Done**. Esc and **Done** both close and refresh.
- **Mobile 375px:** the date inputs stack. The role radios stack, each label wraps, and each row is ≥ 44px. The footer buttons are full width and follow the app's dialog-footer convention: below `sm` the primary sits on top (design-review P-2). The "primary last" rule applies to the referral action bar and the panel action rows, not to dialog footers.

### S4 Referral page: what changes

| Sub-state | Side | What shows |
|---|---|---|
| S4-a Record hire button | B | §2.3 E1. Outline on non-`offer` statuses, after the transition buttons. Primary on `offer`. |
| S4-b Report a hire button + limit line | A | §2.5. Outline. The limit line sits under the action bar as muted text with a `CalendarClock` icon. |
| S4-c Hire report panel | both | S6, under the action bar (the N1 claim panel slot). If both a closed objection and a report exist, the objection panel goes first. |
| S4-d Hired with placement | both | Existing "Hired" banner. The agreement panel shows the `deemed` pill when deemed. |
| S4-e Hired without a split (record-only) | both | Next-step banner: `success` tone, `Trophy` icon, title `detail.next.hiredNoSplit` ("Hired: recorded without a split"). Body for B: `detail.next.hiredNoSplitTarget` (released: "This referral doesn't carry a split."; flag off: "No placement: the referral had no confirmed agreement." ⚖️). Body for A: `detail.next.hiredNoSplitSource` ("{partner} recorded a hire on {date}. No placement was created.") + flag-off line ⚖️ (`detail.next.hiredNoSplitSourceRule`, rule 7.5). No commission panel amounts. The agreement panel says `detail.agreement.none`. |
| S4-f Void | both | Next-step banner: neutral, `Ban` icon, `detail.next.void` ("This referral no longer counts."). A gets an extra line with the reason (`detail.next.voidSource`). Every N3 action is hidden. |
| S4-g Auth check panel | A | S13, while a check with an evidence request is open, or after A sent evidence until the decision. |
| S4-h Offer nudge (Should) | B | Info banner (§2.3). |
| S4-i Record-created note | A | In the candidate-confirmation block: muted line `detail.recordCreated` {date}. |

**Action bar at 375px:** the N1 rule. Every button is `w-full sm:w-auto` and the bar stacks in rank order: negative → secondary (Record hire / Report a hire, Release candidate) → primary last. The labels don't truncate, and every button is ≥ 44px.

### S6 Hire report panel: layout

- A `Panel` with an `h2` title, the status pill on the right, and the status line under the title.
- `dl` rows as in §2.6. On mobile, `dt` sits above `dd`. From `sm` up, it's a two-column grid (`sm:grid-cols-[12rem_1fr]`).
- **Evidence items:** a `ul`, each `li` "Type · {date} · captured {date}", plus the link (A side) on its own line with `break-all`.
- **Files:** the N1 row pattern. The SHA-256 is full, monospace, `text-xs break-all`, with a **Copy** icon button (`size="icon"`, ≥ 44px).
- **Actions** sit at the panel bottom, right-aligned on desktop and full width stacked on mobile (primary last).
- **Collapsed earlier reports:** a `Disclosure` "Earlier reports ({count})".

### S9 Fee-pending placement: layout

- `PageHeader` with the status pill `Fee details pending`. The status description is underneath.
- `FeePendingPanel` replaces the fee panel. It has a `dl` with the estimate / rate line and the established line, and `BusinessDeadline`. **Enter fee details** (B only, primary) sits at the panel's end.
- The share tiles show percentages, "—" and the no-amounts hint.
- The action panel shows **Open a dispute** and **Open referral** only.
- At 375px the panel stacks and the button is full width.

### S14 / S15 Admin: layout

- **S14:** one column on mobile; on desktop, sections are full-width panels whose rows are cards in a `lg:grid-cols-2` grid. The **Overdue** chip is warning tone, text plus icon.
- **S15:** a two-column desktop grid (`lg:grid-cols-2`):
  - left: referral facts + coverage checklist, report, answer, rebuttal;
  - right: signals, delivery records, admin fields, authorization check;
  - actions in a sticky bottom bar on desktop, and a normal block at the end on mobile.

  Every block is a `section` with a heading.

---

## 4. Data & permissions

| Data | B (job owner, managers) | B other recruiters | A (candidate owner, managers) | A other recruiters | Platform admin | Candidate |
|---|---|---|---|---|---|---|
| Record hire action, variants | ✓ (act) | — | — | — | read | — |
| Released flag on the referral | **never** (no field, no RPC, no copy before the record) | — | ✓ | — | ✓ | — |
| Record-only hire (exists, date) | ✓ | — | ✓ | — | ✓ | — |
| Hire-record admin note (e.g. a related-org hire, BR-12) | **never** | — | **never** | — | ✓ | — |
| `late` marker | **never** | — | **never** | — | ✓ | — |
| `deemed_agreement_enabled` value | implied by the variant; not writable | — | not writable | — | read; written only by the service-role path, audited | — |
| Client name / key (both) | B's own job only, as today | as today | **never** | — | ✓ (dispute, hire report detail) | — |
| Hire report: employer text, start month, role, how learned, statement, evidence types and dates, tail statement | ✓ | — | ✓ (own) | — | ✓ | **never** |
| Hire report: evidence **links**, **file names and contents** | **never** (SHA-256 + upload time only) | — | ✓ (own) | — | ✓ | **never** |
| Contest: reason, dates, statement | ✓ (own) | — | reason (`not_this_client` → "not this client"), dates, statement **except `not_this_client`** (BR-25) | — | ✓ | — |
| Contest files | ✓ (own) | — | **never** | — | ✓ | — |
| Rebuttal | text, types, dates, hashes | — | ✓ (own) | — | ✓ | — |
| Admin fields (candidate contacted, client confirmation, notes), same-person signal, delivery records, flags | **never** | — | **never** | — | ✓ | — |
| Resolution text | ✓ | — | ✓, except a `not_this_client` rejection | — | ✓ | — |
| Authorization check: request, evidence, record-created note | B's own request only (that it was requested) | — | ✓ (own evidence, the note) | — | ✓ | — |
| Fee-pending estimate | ✓ | — | ✓ | — | ✓ | — |
| Invoice overdue chip | ✓ | — | ✓ | — | Ops SQL only, no UI in N3 (PD-079) | — |
| Hire-report counts or outcomes about another org | **never** | — | **never** | — | ✓ (HA-6 flag in the product; HA-1, HA-9 and metrics through Ops SQL) | — |

**Must never cross tenants or be exposed:**
- The client name or key never reaches A in any payload: report RPC results, refusals, notifications, audit metadata (rule 4.5, BR-1, BR-19).
- Every refusal to A on filing returns one code (`hire_report_unavailable`), except the rate limit and an existing placement (BR-17).
- B never receives candidate ids beyond today's, and never the release flag before recording.
- Hire-report outcomes never show to counterparts as statistics (BR-41).
- Raw `matches` are untouched.
- Every new RPC re-resolves referral, report, dispute, check and placement ids through RLS. Another org gets not-found, and anon is refused.
- The `deemed_agreement_enabled` setting isn't writable by any member, by the app's user session or by an RPC callable by `authenticated`.

**New PII (flag for `security-and-privacy.md`, ⚖️ Q-4):**
- **Employer text, approximate start month and role** of the candidate's new job (A's report). Minimised, visible to A, B and admins, never in notifications or audit.
- **Evidence files and links** about the new employer, and B's contest documents (possibly the client's written statement). Admin-only (beyond the uploader), Canadian storage, 60-second signed URLs, audited downloads. **No automatic purge in N3.** Retention is set by counsel in the N7 PIA.
- **Right-to-represent evidence** (the candidate's message). Admin-only beyond the source org.
- **Admin candidate-contact count and client-confirmation status.** Admin-only.
- **Email delivery records per recipient** (the N7 data contract). Admin-only.

---

## 5. Copy (final, ux-writer-marketing, 2026-11-16)

**Status:** final en / fr-CA / pt-BR for every key. **frontend-engineer adds the keys** to `src/i18n/messages/{en,fr,pt}/<namespace>.json`; ux-writer didn't edit the JSON. Keys keep the designer's names; short keys (`hire.*`, `hireReport.*`, `panel.*`, `detail.*`) are under `referrals`, and `panel.*` is `referrals.hireReport.panel.*`.

**Conventions** (N1 §5 and `docs/content/voice-and-tone.md`):
- `{when}` = date + time in `America/Toronto`, `{date}` = date only. Deadline suffix: en `{when} ET`, fr `{when} HE`, pt `{when} (horário de Toronto)` in sentences and `{when} (Toronto)` in compact lines.
- Plurals have `{count}` in both branches (fr and pt treat 0 as "one").
- fr: straight apostrophe `'` (as in the current fr files), « » for quotes, a space before `:` (non-breaking in JSON: U+00A0), no space before `?` / `!` / `;`. en and pt: curly quotes “ ”.
- **⚖️** = legal wording pending counsel (N7, P0-1). These strings ship as drafts. Each ⚖️ row says which counsel item applies (Q-1 deemed agreement, Q-3 what counts as a hire, Q-4 privacy, RD-029 voiding, 4.8 attestations, 7.2/7.5 rules). **⚖️ N7** = also only reachable after N7 (deemed confirmation).
- In-app notifications stay English in SQL (PD-026). §5.9 gives fr and pt for N7 to localize.

**Glossary** (`voice-and-tone.md` §5.8, updated with this spec):
- **record a hire** (B) = Enregistrer l'embauche / Registrar contratação. **hire report** (A) = déclaration d'embauche (f.) / relato de contratação (m.). "Claim" isn't used in member-facing copy.
- **contest**, **rebuttal** (réplique / réplica), **Fee details pending**, **hire recorded without a split**, **authorization check**, **Not this client**, **void** (invalidée / invalidada). "Objection" stays N1's word, and a contest opens a **dispute**.

**Renames of existing keys** (value changes only; the key names stay so no code moves):

| Key | Current en / fr / pt | New en | New fr-CA | New pt-BR |
|---|---|---|---|---|
| `pipeline.reportHire` | Report hire / Déclarer l'embauche / Registrar contratação | Record hire | Enregistrer l'embauche | Registrar contratação *(unchanged)* |
| `referrals.hire.trigger` | Report hire / Déclarer une embauche / Informar contratação | Record hire | Enregistrer l'embauche | Registrar contratação |
| `referrals.hire.title` | Report a successful hire / Déclarer une embauche réussie / Informar uma contratação | Record a hire | Enregistrer une embauche | Registrar uma contratação |
| `admin.blockedHired` | A hire was reported on {date}. … the hire report and disputes. (fr/pt similar) | A hire was recorded on {date}. Terms can't be amended after a hire. Fee differences are handled with the invoiced fee and its reason, or in a placement dispute. | Une embauche a été enregistrée le {date}. Les conditions ne peuvent plus être modifiées après une embauche. Les écarts d'honoraires se règlent avec les honoraires facturés et leur motif, ou dans un litige sur le placement. | Uma contratação foi registrada em {date}. Os termos não podem ser alterados depois da contratação. Diferenças de taxa são tratadas pela taxa faturada e seu motivo, ou em uma disputa sobre a colocação. |
| `labels.placementStatus.hire_reported` | Hire reported / Embauche déclarée / Contratação informada | Hire recorded | Embauche enregistrée | Contratação registrada |
| `referrals.hire.submit` | Record hire / Consigner l'embauche / Registrar contratação | Record hire *(unchanged)* | Enregistrer l'embauche | Registrar contratação *(unchanged)* |
| `errors.amendment_after_hire` | A hire was already reported. … (fr déclarée, pt informada) | A hire was already recorded. Terms can't be amended after a hire. | Une embauche a déjà été enregistrée. Les conditions ne peuvent pas être modifiées après une embauche. | Uma contratação já foi registrada. Os termos não podem ser alterados depois da contratação. |
| `errors.hire_terms_changed` | … then report the hire again. (fr déclarez, pt informe) | … then record the hire again. | … puis enregistrez l'embauche de nouveau. | … e registre a contratação de novo. |
| `admin.amendDescription`, `admin.amendConfirmDescription` | … before a hire is reported. (fr déclarée, pt informada) | … before a hire is recorded. | … avant qu'une embauche soit enregistrée. | … antes de uma contratação ser registrada. |

These four rows were added after the frontend's check (frontend.md §5 gap 9) and are **already applied in the JSON** by ux-writer, together with the three new keys `hire.startRange`, `hire.refresh` and `hire.deemedBodyLegacy`. Only the changed words are shown for the long strings; the rest of each string is unchanged.

`labels.placementStatusDescription.hire_reported` doesn't change ("Projected commission — not yet invoiced."). Check `referrals.hire.description` against N2's copy when adding the N3 keys; it doesn't say "report".

### 5.1 Job form and nudge (`jobs`)

| Key | en | fr-CA | pt-BR |
|---|---|---|---|
| `jobs.form.clientRequiredForPartners` | Required to open this job to partners. If you hide the client's name, partners never see it. | Obligatoire pour ouvrir ce poste aux partenaires. Si vous masquez le nom du client, les partenaires ne le voient jamais. | Obrigatório para abrir esta vaga a parceiros. Se você ocultar o nome do cliente, os parceiros nunca o veem. |
| `jobs.validation.clientRequiredForPartners` | Enter the client's real name to open this job to partners | Entrez le vrai nom du client pour ouvrir ce poste aux partenaires | Informe o nome real do cliente para abrir esta vaga a parceiros |
| `jobs.nudge.chipClientName` | Hidden from partners: add the client's name | Invisible aux partenaires : ajoutez le nom du client | Oculta para parceiros: adicione o nome do cliente |
| `jobs.nudge.bodyClientName` | Partners can't see this job until it has the client's real name. If you hide the client's name, it stays internal. Referrals already received aren't affected. | Les partenaires ne voient pas ce poste tant qu'il n'a pas le vrai nom du client. Si vous masquez le nom du client, il reste interne. Les recommandations déjà reçues ne sont pas touchées. | Os parceiros não veem esta vaga até ela ter o nome real do cliente. Se você ocultar o nome do cliente, ele fica interno. As indicações já recebidas não são afetadas. |
| `jobs.nudge.ctaClientName` | Add client name | Ajouter le nom du client | Adicionar nome do cliente |
| `errors.client_name_required_for_referrals` | Enter the client's real name to open this job to partners. | Entrez le vrai nom du client pour ouvrir ce poste aux partenaires. | Informe o nome real do cliente para abrir esta vaga a parceiros. |

### 5.2 Record hire dialog (`referrals.hire`)

| Key | en | fr-CA | pt-BR |
|---|---|---|---|
| `hire.trigger` | Record hire *(rename, see above)* | Enregistrer l'embauche | Registrar contratação |
| `hire.title` | Record a hire | Enregistrer une embauche | Registrar uma contratação |
| `hire.anyStatusNote` | This referral's status is {status}. You can still record the hire: the referral's terms apply. | Statut de cette recommandation : {status}. Vous pouvez quand même enregistrer l'embauche : les conditions de la recommandation s'appliquent. | Status desta indicação: {status}. Você ainda pode registrar a contratação: valem os termos da indicação. |
| `hire.acceptedOn` | Offer accepted on | Offre acceptée le | Oferta aceita em |
| `hire.acceptanceUnknown` | I don't know the acceptance date | Je ne connais pas la date d'acceptation | Não sei a data do aceite |
| `hire.startUsedForTiming` | We'll use the start date to check the timing. | Nous utiliserons la date d'entrée en fonction pour vérifier les délais. | Vamos usar a data de início para verificar os prazos. |
| `hire.startRange` (hint under the start date; `errors.hire_dates_invalid` points here) | Allowed dates: {min} to {max} | Dates permises : du {min} au {max} | Datas permitidas: de {min} a {max} |
| `hire.roleGroup` | Role hired into | Poste occupé | Vaga ocupada |
| `hire.roleThisJob` | This job: {job} | Ce poste : {job} | Esta vaga: {job} |
| `hire.roleOther` | Another role at this client | Un autre poste chez ce client | Outra vaga neste cliente |
| `hire.otherRoleTitle` | Job title | Titre du poste | Título da vaga |
| `hire.otherRoleHint` | The title of the role they were hired into. Don't add candidate details. The fee uses this referral's terms and the salary for this role. | Le titre du poste pour lequel la personne a été embauchée. N'ajoutez aucun renseignement sur le candidat. Les honoraires suivent les conditions de cette recommandation et le salaire de ce poste. | O título da vaga em que a pessoa foi contratada. Não inclua dados do candidato. A taxa segue os termos desta indicação e o salário desta vaga. |
| `hire.objectionOpenTitle` | Your objection on this referral is still open | Votre objection sur cette recommandation est toujours ouverte | Sua objeção nesta indicação ainda está aberta |
| `hire.objectionOpenBody` | You can record the hire once your prior-presentation objection is decided. If it's upheld, this referral no longer counts. | Vous pourrez enregistrer l'embauche une fois votre objection pour présentation antérieure tranchée. Si elle est retenue, cette recommandation ne compte plus. | Você poderá registrar a contratação depois que sua objeção por apresentação anterior for decidida. Se ela for mantida, esta indicação deixa de contar. |
| `hire.close` | Close | Fermer | Fechar |
| `hire.refresh` (button in the `hire_not_eligible` alert) | Refresh page | Actualiser la page | Atualizar página |
| `errors.objection_open` | Your prior-presentation objection on this referral is still open. Record the hire once it's decided. | Votre objection pour présentation antérieure sur cette recommandation est toujours ouverte. Enregistrez l'embauche une fois qu'elle sera tranchée. | Sua objeção por apresentação anterior nesta indicação ainda está aberta. Registre a contratação depois que ela for decidida. |
| `hire.reportedStart` | {partner} reported a start around {month}. | {partner} a déclaré une entrée en fonction vers {month}. | {partner} relatou um início por volta de {month}. |
| `hire.deemedTitle` ⚖️ Q-1 | This referral has no confirmed agreement | Cette recommandation n'a pas d'entente confirmée | Esta indicação não tem acordo confirmado |
| `hire.deemedBody` ⚖️ Q-1 | Recording the hire creates the agreement from the terms {partner} submitted under (version {version}, {date}) and the split frozen then. {partner} is told and doesn't need to confirm. | Enregistrer l'embauche crée l'entente à partir des conditions de la soumission de {partner} (version {version}, {date}) et du partage figé à ce moment. {partner} en est avisé et n'a rien à confirmer. | Registrar a contratação cria o acordo a partir dos termos do envio de {partner} (versão {version}, {date}) e da divisão congelada naquele momento. {partner} é avisado e não precisa confirmar. |
| `hire.deemedBodyLegacy` ⚖️ Q-1 (V3 on a legacy referral: no terms version or date) | Recording the hire creates the agreement from the split in force when {partner} submitted this referral. {partner} is told and doesn't need to confirm. | Enregistrer l'embauche crée l'entente à partir du partage en vigueur quand {partner} a soumis cette recommandation. {partner} en est avisé et n'a rien à confirmer. | Registrar a contratação cria o acordo a partir da divisão vigente quando {partner} enviou esta indicação. {partner} é avisado e não precisa confirmar. |
| `hire.noAgreementTitle` ⚖️ Q-1 | No placement will be created | Aucun placement ne sera créé | Nenhuma colocação será criada |
| `hire.noAgreementBody` ⚖️ Q-1 | This referral has no confirmed agreement, so the hire is recorded for both organizations without a split. | Cette recommandation n'a pas d'entente confirmée : l'embauche est donc enregistrée pour les deux organisations, sans partage. | Esta indicação não tem acordo confirmado, então a contratação é registrada para as duas organizações, sem divisão. |
| `hire.noAgreementTermsLine` | This referral was sent under terms version {version} ({date}). | Cette recommandation a été soumise selon la version {version} des conditions ({date}). | Esta indicação foi enviada com a versão {version} dos termos ({date}). |
| `hire.recordOnlyTitle` | Hire recorded | Embauche enregistrée | Contratação registrada |
| `hire.recordOnlyResult` | This referral doesn't carry a split. No placement was created. | Cette recommandation ne donne pas lieu à un partage. Aucun placement n'a été créé. | Esta indicação não gera divisão. Nenhuma colocação foi criada. |
| `hire.noAgreementResult` ⚖️ Q-1 | No placement was created, because the referral had no confirmed agreement. {partner} was told. | Aucun placement n'a été créé, car la recommandation n'avait pas d'entente confirmée. {partner} en a été avisé. | Nenhuma colocação foi criada, porque a indicação não tinha acordo confirmado. {partner} foi avisado. |
| `hire.done` | Done | Terminé | Concluir |
| `hire.validation.acceptanceAfterStart` | The acceptance date must be on or before the start date | La date d'acceptation doit être le même jour ou avant la date d'entrée en fonction | A data do aceite deve ser igual ou anterior à data de início |
| `hire.validation.acceptanceFuture` | Enter a date that isn't in the future | Entrez une date qui n'est pas dans le futur | Informe uma data que não esteja no futuro |
| `hire.validation.otherRoleTitle` | Enter the job title (120 characters or fewer) | Entrez le titre du poste (120 caractères ou moins) | Informe o título da vaga (até 120 caracteres) |
| `hire.offerNudge` (Should) | Was the offer accepted? Record the hire so {partner}'s share is set up. | L'offre a-t-elle été acceptée? Enregistrez l'embauche pour que la part de {partner} soit établie. | A oferta foi aceita? Registre a contratação para que a parte de {partner} seja definida. |
| `labels.feeDifferenceReason.non_permanent_engagement` ⚖️ Q-3 | Non-permanent engagement (contractor, PJ, EOR, payroll provider) | Engagement non permanent (travailleur autonome, EOR, fournisseur de paie) | Contratação não permanente (PJ, autônomo, EOR, empresa de folha de pagamento) |
| `hire.nonPermanentHint` ⚖️ Q-3 | Contractor, PJ, EOR, payroll-provider, affiliate and other-agency engagements count as hires. The referral's terms still set {partner}'s share unless {partner} agreed in writing beforehand. | Les engagements comme travailleur autonome, par un EOR, un fournisseur de paie, une société affiliée ou une autre agence comptent comme des embauches. Les conditions de la recommandation fixent quand même la part de {partner}, sauf accord écrit préalable de {partner}. | Contratações como PJ ou autônomo, por EOR, empresa de folha de pagamento, empresa do mesmo grupo ou outra agência contam como contratação. Os termos da indicação continuam definindo a parte de {partner}, salvo concordância prévia por escrito de {partner}. |
| `errors.hire_not_eligible` | A hire can't be recorded on this referral any more. Refresh the page to see why. | Il n'est plus possible d'enregistrer une embauche sur cette recommandation. Actualisez la page pour savoir pourquoi. | Não é mais possível registrar uma contratação nesta indicação. Atualize a página para ver o motivo. |
| `errors.hire_dates_invalid` (PD-077, field error on the start or acceptance date) | Enter a date within the allowed range shown under the start date. | Entrez une date comprise dans la plage permise indiquée sous la date d'entrée en fonction. | Informe uma data dentro do intervalo permitido, indicado abaixo da data de início. |
| `referrals.errors.notFound` *(existing, no change; `report_hire` `not_found` maps here, PD-077)* | Referral not found. | Recommandation introuvable. | Indicação não encontrada. |

### 5.3 Hire report: dialog (`referrals.hireReport`)

| Key | en | fr-CA | pt-BR |
|---|---|---|---|
| `hireReport.trigger` | Report a hire | Déclarer une embauche | Relatar contratação |
| `hireReport.title` | Report a hire to {partner} | Déclarer une embauche à {partner} | Relatar uma contratação a {partner} |
| `hireReport.description` | Tell {partner} you believe the client hired this candidate. {partner} sees your statement, the employer and the dates of your evidence. Only Workatent admins see files and links. {partner} has 10 business days to answer. While the report is pending, you can't release this candidate for this client. | Indiquez à {partner} que, selon vous, le client a embauché ce candidat. {partner} voit votre explication, l'employeur et les dates de vos pièces justificatives. Seuls les administrateurs de Workatent voient les fichiers et les liens. {partner} a 10 jours ouvrables pour répondre. Tant que la déclaration est en attente, vous ne pouvez pas libérer ce candidat pour ce client. | Avise {partner} de que, na sua avaliação, o cliente contratou este candidato. {partner} vê a sua explicação, o empregador e as datas dos seus comprovantes. Só os admins do Workatent veem arquivos e links. {partner} tem 10 dias úteis para responder. Enquanto o relato estiver pendente, você não pode liberar este candidato para este cliente. |
| `hireReport.limit` | You can report a hire until {date}. | Vous pouvez déclarer une embauche jusqu'au {date}. | Você pode relatar uma contratação até {date}. |
| `hireReport.limitTail` | You can report a hire until {date} if the client's selection process started before {windowEnd}. | Vous pouvez déclarer une embauche jusqu'au {date} si le processus de sélection du client a commencé avant le {windowEnd}. | Você pode relatar uma contratação até {date} se o processo seletivo do cliente começou antes de {windowEnd}. |
| `hireReport.limitClosed` | Hire reporting closed on {date}. | La période pour déclarer une embauche s'est terminée le {date}. | O prazo para relatar uma contratação terminou em {date}. |
| `hireReport.tailStatement` ⚖️ Q-2 | The client's selection process that led to this hire (first interview or assessment) started before {windowEnd}. | Le processus de sélection du client qui a mené à cette embauche (première entrevue ou évaluation) a commencé avant le {windowEnd}. | O processo seletivo do cliente que levou a esta contratação (primeira entrevista ou avaliação) começou antes de {windowEnd}. |
| `hireReport.tailHint` | Mark at least one evidence item that shows when the process started. | Indiquez au moins une pièce justificative qui montre quand le processus a commencé. | Marque pelo menos um comprovante que mostre quando o processo começou. |
| `hireReport.item.backsTail` | This item shows when the process started | Cette pièce montre quand le processus a commencé | Este comprovante mostra quando o processo começou |
| `hireReport.employer` | Employer, as you know it | Employeur, tel que vous le connaissez | Empregador, como você o conhece |
| `hireReport.employerHint` | {partner} reads this. | {partner} lit ce champ. | {partner} lê este campo. |
| `hireReport.startMonth` | Approximate start | Entrée en fonction approximative | Início aproximado |
| `hireReport.role` | Role, if known | Poste, si vous le connaissez | Cargo, se souber |
| `hireReport.learnedVia` | How you learned of it | Comment vous l'avez appris | Como você soube |
| `hireReport.evidence` | Evidence | Pièces justificatives | Comprovantes |
| `hireReport.evidenceHint` | Add at least one dated item. | Ajoutez au moins une pièce datée. | Adicione pelo menos um comprovante datado. |
| `hireReport.item.type` | Type | Type | Tipo |
| `hireReport.item.date` | Date of the item | Date de la pièce | Data do comprovante |
| `hireReport.item.captured` | Captured on (optional) | Capturée le (facultatif) | Capturado em (opcional) |
| `hireReport.item.link` | Link (optional) | Lien (facultatif) | Link (opcional) |
| `hireReport.item.linkHint` | Starts with https://. Only Workatent admins see it. | Commence par https://. Seuls les administrateurs de Workatent le voient. | Começa com https://. Só os admins do Workatent o veem. |
| `hireReport.item.add` | Add another item | Ajouter une autre pièce | Adicionar outro comprovante |
| `hireReport.item.remove` | Remove item {n} | Retirer la pièce {n} | Remover comprovante {n} |
| `hireReport.weightHint` | A screenshot with no link or date is accepted, but it counts for less. | Une capture d'écran sans lien ni date est acceptée, mais elle a moins de poids. | Uma captura de tela sem link nem data é aceita, mas tem menos peso. |
| `hireReport.files` | Files (optional) | Fichiers (facultatif) | Arquivos (opcional) |
| `hireReport.filesHint` ⚖️ Q-4 | PDF, PNG or JPEG. Up to 5 files, 10 MB each. Only Workatent admins see them. {partner} sees when each was uploaded and its SHA-256. | PDF, PNG ou JPEG. Jusqu'à 5 fichiers, 10 Mo chacun. Seuls les administrateurs de Workatent les voient. {partner} voit le moment du téléversement et le SHA-256 de chacun. | PDF, PNG ou JPEG. Até 5 arquivos, de até 10 MB cada. Só os admins do Workatent os veem. {partner} vê quando cada um foi carregado e o SHA-256. |
| `hireReport.statement` | Statement | Explication | Explicação |
| `hireReport.statementHint` | What you know and how you know it. {partner} reads this. 20–2000 characters. | Ce que vous savez et comment vous le savez. {partner} lit ce texte. 20 à 2000 caractères. | O que você sabe e como sabe. {partner} lê este texto. 20 a 2000 caracteres. |
| `hireReport.attestation` ⚖️ 4.8 | I confirm this report is true and complete to the best of my knowledge (Network Rules 4.8). | Je confirme que cette déclaration est vraie et complète, au meilleur de ma connaissance (Règles du réseau, règle 4.8). | Confirmo que este relato é verdadeiro e completo, até onde sei (Regras da rede, regra 4.8). |
| `hireReport.submit` | File hire report | Déposer la déclaration | Enviar relato |
| `hireReport.filing` | Filing… | Dépôt en cours… | Enviando… |
| `hireReport.file.waiting` | Wait until every file is checked. | Attendez que chaque fichier soit vérifié. | Aguarde até que todos os arquivos sejam verificados. |
| `hireReport.file.removeRejected` | Remove the file that can't be used. | Retirez le fichier qui ne peut pas être utilisé. | Remova o arquivo que não pode ser usado. |
| `hireReport.unavailableHint` | If you have a question for {partner}, write in the referral messages. | Si vous avez une question pour {partner}, écrivez dans les messages de la recommandation. | Se você tiver uma pergunta para {partner}, escreva nas mensagens da indicação. |
| `hireReport.rightToolUnavailable` | Hire reports are filed from the referral, with dated evidence, while it still counts. Otherwise, write to {org} in the referral messages. | Une déclaration d'embauche se dépose à partir de la recommandation, avec des pièces justificatives datées, tant qu'elle compte. Sinon, écrivez à {org} dans les messages de la recommandation. | Relatos de contratação são enviados a partir da indicação, com comprovantes datados, enquanto ela conta. Caso contrário, escreva para {org} nas mensagens da indicação. |
| `hireReport.messages.filed` | Hire report filed. {partner} has until {when} ET to answer. | Déclaration d'embauche déposée. {partner} a jusqu'au {when} HE pour répondre. | Relato de contratação enviado. {partner} tem até {when} (horário de Toronto) para responder. |
| `errors.hire_report_unavailable` | You can't file a hire report on this referral right now. | Vous ne pouvez pas déposer de déclaration d'embauche sur cette recommandation pour le moment. | Não é possível enviar um relato de contratação nesta indicação no momento. |
| `errors.hire_report_rate_limited` | Your organization has reached the limit for hire reports. Try again later. | Votre organisation a atteint la limite de déclarations d'embauche. Réessayez plus tard. | Sua organização atingiu o limite de relatos de contratação. Tente novamente mais tarde. |
| `errors.hire_already_recorded` | {partner} already recorded this hire. You can see it on the placement. | {partner} a déjà enregistré cette embauche. Vous la voyez dans le placement. | {partner} já registrou esta contratação. Você pode vê-la na colocação. |
| `errors.hire_report_files_not_ready` | Wait until every file is checked, then file again. | Attendez que chaque fichier soit vérifié, puis déposez de nouveau. | Aguarde até que todos os arquivos sejam verificados e envie de novo. |
| `hireReport.validation.employer` | Enter the employer (200 characters or fewer) | Entrez l'employeur (200 caractères ou moins) | Informe o empregador (até 200 caracteres) |
| `hireReport.validation.startMonth` | Choose the month and year | Choisissez le mois et l'année | Escolha o mês e o ano |
| `hireReport.validation.itemDate` | Enter a date that isn't in the future | Entrez une date qui n'est pas dans le futur | Informe uma data que não esteja no futuro |
| `hireReport.validation.capturedBefore` | The capture date can't be before the item's date | La date de capture ne peut pas précéder la date de la pièce | A data de captura não pode ser anterior à data do comprovante |
| `hireReport.validation.link` | Enter a link that starts with https:// | Entrez un lien qui commence par https:// | Informe um link que comece com https:// |
| `hireReport.validation.statement` | Write 20–2000 characters | Écrivez de 20 à 2000 caractères | Escreva de 20 a 2000 caracteres |
| `hireReport.validation.tail` | Confirm when the process started and mark the item that shows it | Confirmez quand le processus a commencé et indiquez la pièce qui le montre | Confirme quando o processo começou e marque o comprovante que mostra isso |
| `labels.hireLearnedVia.*` | candidate: The candidate told me · profile: Public profile change · announcement: Company announcement · contact: A mutual contact · other: Other | candidate : Le candidat me l'a dit · profile : Changement de profil public · announcement : Annonce de l'entreprise · contact : Une connaissance commune · other : Autre | candidate: O candidato me contou · profile: Mudança no perfil público · announcement: Anúncio da empresa · contact: Um contato em comum · other: Outro |
| `labels.hireEvidenceType.*` | candidate_message: Candidate's written message · company_announcement: Company announcement or org chart · profile_change: Public profile change · third_party: Third-party statement · other: Other | candidate_message : Message écrit du candidat · company_announcement : Annonce ou organigramme de l'entreprise · profile_change : Changement de profil public · third_party : Témoignage d'un tiers · other : Autre | candidate_message: Mensagem escrita do candidato · company_announcement: Anúncio ou organograma da empresa · profile_change: Mudança no perfil público · third_party: Depoimento de terceiro · other: Outro |

### 5.4 Hire report: panel (`referrals.hireReport.panel`, `labels`)

| Key | en | fr-CA | pt-BR |
|---|---|---|---|
| `panel.title` | Hire report | Déclaration d'embauche | Relato de contratação |
| `panel.filedBy` | Filed {when} ET by {who} | Déposée le {when} HE par {who} | Enviado em {when} (Toronto) por {who} |
| `panel.notGiven` | Not given | Non précisé | Não informado |
| `panel.tailMade` | The sourcing recruiter stated that the selection process started before {windowEnd}. | Le recruteur d'origine a déclaré que le processus de sélection a commencé avant le {windowEnd}. | O recrutador de origem declarou que o processo seletivo começou antes de {windowEnd}. |
| `panel.linksHidden` | Only {partner} and Workatent admins can see the links. | Seuls {partner} et les administrateurs de Workatent peuvent voir les liens. | Só {partner} e os admins do Workatent podem ver os links. |
| `panel.filesHidden` | Only {partner} and Workatent admins can see the files. | Seuls {partner} et les administrateurs de Workatent peuvent voir les fichiers. | Só {partner} e os admins do Workatent podem ver os arquivos. |
| `panel.releasePaused` | While this report is pending, you can't release this candidate for this client. | Tant que cette déclaration est en attente, vous ne pouvez pas libérer ce candidat pour ce client. | Enquanto este relato estiver pendente, você não pode liberar este candidato para este cliente. |
| `panel.earlier` | Earlier reports ({count}) | Déclarations précédentes ({count}) | Relatos anteriores ({count}) |
| `panel.earlierLine` | Filed {date}: {outcome} | Déposée le {date} : {outcome} | Enviado em {date}: {outcome} |
| `panel.status.awaitingTarget` | Answer by {when} ET: confirm and record the hire, or contest it. | Répondez d'ici le {when} HE : confirmez et enregistrez l'embauche, ou contestez-la. | Responda até {when} (horário de Toronto): confirme e registre a contratação, ou conteste o relato. |
| `panel.status.awaitingSource` | {partner} has until {when} ET to answer. | {partner} a jusqu'au {when} HE pour répondre. | {partner} tem até {when} (horário de Toronto) para responder. |
| `panel.status.unansweredTarget` | The answer deadline has passed. A platform admin is reviewing the report. You can still record the hire. | Le délai de réponse est passé. Un administrateur de la plateforme examine la déclaration. Vous pouvez encore enregistrer l'embauche. | O prazo de resposta terminou. Um admin da plataforma está analisando o relato. Você ainda pode registrar a contratação. |
| `panel.status.unansweredSource` | {partner} didn't answer by the deadline. A platform admin is reviewing the report. | {partner} n'a pas répondu dans le délai. Un administrateur de la plateforme examine la déclaration. | {partner} não respondeu no prazo. Um admin da plataforma está analisando o relato. |
| `panel.status.contestedTarget` | Contested. {partner} can add a rebuttal until {when} ET. Then a platform admin decides. | Contestée. {partner} peut ajouter une réplique jusqu'au {when} HE. Ensuite, un administrateur de la plateforme décide. | Contestado. {partner} pode apresentar uma réplica até {when} (horário de Toronto). Depois, um admin da plataforma decide. |
| `panel.status.contestedSource` | {partner} contested this report. You can add one rebuttal until {when} ET. | {partner} a contesté cette déclaration. Vous pouvez ajouter une réplique jusqu'au {when} HE. | {partner} contestou este relato. Você pode apresentar uma réplica até {when} (horário de Toronto). |
| `panel.status.inReview` | A platform admin is reviewing the report. | Un administrateur de la plateforme examine la déclaration. | Um admin da plataforma está analisando o relato. |
| `panel.status.confirmedTarget` | You confirmed this hire on {date}. | Vous avez confirmé cette embauche le {date}. | Você confirmou esta contratação em {date}. |
| `panel.status.confirmedSource` | {partner} confirmed this hire on {date}. | {partner} a confirmé cette embauche le {date}. | {partner} confirmou esta contratação em {date}. |
| `panel.status.closedByRecordTarget` | Closed: you recorded the hire on {date}. | Fermée : vous avez enregistré l'embauche le {date}. | Encerrado: você registrou a contratação em {date}. |
| `panel.status.closedByRecordSource` | Closed: the hiring recruiter confirmed the hire on {date}. | Fermée : le recruteur du poste a confirmé l'embauche le {date}. | Encerrado: o recrutador da vaga confirmou a contratação em {date}. |
| `panel.status.deemedTarget` ⚖️ N7, 7.2 | Confirmed on {date}: no answer by the deadline, after the notice reached two people at {org} by email. Enter the fee details by {when} ET. | Confirmée le {date} : aucune réponse dans le délai, après que l'avis est parvenu par courriel à deux personnes de {org}. Entrez les détails des honoraires d'ici le {when} HE. | Confirmado em {date}: sem resposta no prazo, depois que o aviso chegou por e-mail a duas pessoas de {org}. Informe os detalhes da taxa até {when} (horário de Toronto). |
| `panel.status.deemedSource` ⚖️ N7 | Confirmed on {date}: {partner} didn't answer by the deadline. | Confirmée le {date} : {partner} n'a pas répondu dans le délai. | Confirmado em {date}: {partner} não respondeu no prazo. |
| `panel.status.upheld` | Upheld by a platform admin on {date}. The hire counts. | Retenue par un administrateur de la plateforme le {date}. L'embauche compte. | Mantido por um admin da plataforma em {date}. A contratação conta. |
| `panel.status.rejected` | Not upheld by a platform admin on {date}. | Non retenue par un administrateur de la plateforme le {date}. | Não mantido por um admin da plataforma em {date}. |
| `panel.status.notThisClient` | Not this client. | Pas ce client. | Não é este cliente. |
| `panel.status.voidTarget` | Closed by a platform admin on {date}. This referral no longer counts. | Fermée par un administrateur de la plateforme le {date}. Cette recommandation ne compte plus. | Encerrado por um admin da plataforma em {date}. Esta indicação deixou de contar. |
| `panel.status.voidSource` ⚖️ RD-029 | Closed on {date}: a platform admin found the candidate's confirmation invalid. This referral no longer counts. | Fermée le {date} : un administrateur de la plateforme a jugé la confirmation du candidat invalide. Cette recommandation ne compte plus. | Encerrado em {date}: um admin da plataforma considerou inválida a confirmação do candidato. Esta indicação deixou de contar. |
| `panel.confirm` | Confirm and record hire | Confirmer et enregistrer l'embauche | Confirmar e registrar contratação |
| `panel.contest` | Contest | Contester | Contestar |
| `panel.addRebuttal` | Add rebuttal | Ajouter une réplique | Apresentar réplica |
| `panel.resolution` | Resolution: “{text}” | Résolution : « {text} » | Resolução: “{text}” |
| `labels.hireReportStatus.*` | awaiting_answer: Awaiting answer · unanswered: With an admin · contested: Contested · in_review: With an admin · confirmed: Confirmed · closed_by_record: Confirmed · deemed_confirmed: Confirmed (no answer) · upheld: Upheld · rejected: Not upheld · void: Closed | awaiting_answer : En attente de réponse · unanswered : En examen · contested : Contestée · in_review : En examen · confirmed : Confirmée · closed_by_record : Confirmée · deemed_confirmed : Réputée confirmée · upheld : Retenue · rejected : Non retenue · void : Fermée | awaiting_answer: Aguardando resposta · unanswered: Em análise · contested: Contestado · in_review: Em análise · confirmed: Confirmado · closed_by_record: Confirmado · deemed_confirmed: Confirmado (sem resposta) · upheld: Mantido · rejected: Não mantido · void: Encerrado |
| `labels.hireContestReason.*` ⚖️ Q-3 | not_hired: Not hired by the client, its affiliates, agents, EOR or payroll provider · outside_window: Offer accepted outside the protection · different_person: A different person · not_this_client: Not this client | not_hired : Pas embauché par le client, ses sociétés affiliées, ses mandataires, un EOR ou un fournisseur de paie · outside_window : Offre acceptée hors de la protection · different_person : Une autre personne · not_this_client : Pas ce client | not_hired: Não contratado pelo cliente, empresas do grupo, agentes, EOR ou empresa de folha de pagamento · outside_window: Oferta aceita fora da proteção · different_person: Outra pessoa · not_this_client: Não é este cliente |
| `labels.disputeType.hire_report` | Hire report | Déclaration d'embauche | Relato de contratação |

fr agreement: report statuses agree with *déclaration* (f.); pt with *relato* (m.). `deemed_confirmed` in en stays "Confirmed (no answer)" (plainer than "deemed"); fr uses the legal *Réputée confirmée*, pt "Confirmado (sem resposta)". `panel.status.notThisClient` is the only outcome the sourcing side sees for that finding.

### 5.5 Contest, rebuttal and authorization check (`referrals`)

| Key | en | fr-CA | pt-BR |
|---|---|---|---|
| `hireContest.title` | Contest this hire report? | Contester cette déclaration d'embauche? | Contestar este relato de contratação? |
| `hireContest.description` ⚖️ 4.8, 7.2 | A platform admin decides on the record. {partner} can add one rebuttal within 5 business days. A false contest breaks Network Rules 4.8. | Un administrateur de la plateforme décide selon le dossier. {partner} peut ajouter une réplique dans les 5 jours ouvrables. Une contestation fausse enfreint la règle 4.8 des Règles du réseau. | Um admin da plataforma decide com base no histórico. {partner} pode apresentar uma réplica em até 5 dias úteis. Uma contestação falsa descumpre a regra 4.8 das Regras da rede. |
| `hireContest.reason` | Reason | Motif | Motivo |
| `hireContest.noPriorHint` | “We already had this candidate” isn't a reason here. That was the objection, within 5 business days of delivery. | « Nous avions déjà ce candidat » n'est pas un motif ici. C'était l'objet de l'objection, dans les 5 jours ouvrables suivant la transmission. | “Nós já tínhamos este candidato” não é um motivo aqui. Isso era a objeção, em até 5 dias úteis após a entrega. |
| `hireContest.acceptedOn` | Offer accepted on | Offre acceptée le | Oferta aceita em |
| `hireContest.processStarted` | Selection process started on | Processus de sélection commencé le | Processo seletivo iniciado em |
| `hireContest.processHint` | The first interview or assessment for the role they were hired into. | La première entrevue ou évaluation pour le poste occupé. | A primeira entrevista ou avaliação para a vaga em que a pessoa foi contratada. |
| `hireContest.statement` | Statement | Explication | Explicação |
| `hireContest.statementHint` | {partner} reads this. Don't name your client. | {partner} lit ce texte. Ne nommez pas votre client. | {partner} lê este texto. Não cite o nome do seu cliente. |
| `hireContest.statementHintAdmin` | Only Workatent admins read this. | Seuls les administrateurs de Workatent lisent ce texte. | Só os admins do Workatent leem este texto. |
| `hireContest.files` | Documents (optional) | Documents (facultatif) | Documentos (opcional) |
| `hireContest.filesHint` | Only Workatent admins see these. For example, the client's written statement, shared with the client's permission. | Seuls les administrateurs de Workatent les voient. Par exemple, la déclaration écrite du client, transmise avec sa permission. | Só os admins do Workatent os veem. Por exemplo, a declaração por escrito do cliente, compartilhada com a permissão dele. |
| `hireContest.attestation` ⚖️ 4.8 | I confirm this contest is true and complete to the best of my knowledge (Network Rules 4.8). | Je confirme que cette contestation est vraie et complète, au meilleur de ma connaissance (Règles du réseau, règle 4.8). | Confirmo que esta contestação é verdadeira e completa, até onde sei (Regras da rede, regra 4.8). |
| `hireContest.submit` | Contest report | Contester la déclaration | Contestar relato |
| `hireContest.messages.contested` | Report contested. {partner} can add a rebuttal until {when} ET. | Déclaration contestée. {partner} peut ajouter une réplique jusqu'au {when} HE. | Relato contestado. {partner} pode apresentar uma réplica até {when} (horário de Toronto). |
| `hireContest.validation.dates` | Enter both dates. The process can't start after the offer was accepted. | Entrez les deux dates. Le processus ne peut pas commencer après l'acceptation de l'offre. | Informe as duas datas. O processo não pode começar depois do aceite da oferta. |
| `errors.hire_report_answer_closed` | The time to answer this report has ended. You can still record the hire. | Le délai pour répondre à cette déclaration est terminé. Vous pouvez encore enregistrer l'embauche. | O prazo para responder a este relato terminou. Você ainda pode registrar a contratação. |
| `hireRebuttal.title` | Add your rebuttal | Ajouter votre réplique | Apresentar sua réplica |
| `hireRebuttal.description` | You can add one rebuttal. After that, a platform admin decides on the record. | Vous pouvez ajouter une seule réplique. Ensuite, un administrateur de la plateforme décide selon le dossier. | Você pode apresentar uma única réplica. Depois, um admin da plataforma decide com base no histórico. |
| `hireRebuttal.submit` | Send rebuttal | Envoyer la réplique | Enviar réplica |
| `hireRebuttal.messages.sent` | Rebuttal sent. A platform admin will decide. | Réplique envoyée. Un administrateur de la plateforme décidera. | Réplica enviada. Um admin da plataforma vai decidir. |
| `errors.hire_rebuttal_closed` | You can't add a rebuttal: the time to add one has ended, or one was already sent. | Vous ne pouvez pas ajouter de réplique : le délai est terminé ou une réplique a déjà été envoyée. | Não é possível apresentar réplica: o prazo terminou ou uma réplica já foi enviada. |
| `authCheck.request` | Ask for an authorization check | Demander une vérification de l'autorisation | Pedir verificação da autorização |
| `authCheck.requestTitle` | Ask Workatent to check the candidate's authorization? | Demander à Workatent de vérifier l'autorisation du candidat? | Pedir ao Workatent que verifique a autorização do candidato? |
| `authCheck.requestBody` ⚖️ Q-4 | A platform admin checks whether the candidate really agreed to be presented by {partner}. Only admins read your reason. | Un administrateur de la plateforme vérifie si le candidat a vraiment accepté d'être présenté par {partner}. Seuls les administrateurs lisent votre motif. | Um admin da plataforma verifica se o candidato realmente concordou em ser apresentado por {partner}. Só os admins leem o seu motivo. |
| `authCheck.reason` | Why you're asking | Pourquoi vous le demandez | Por que você está pedindo |
| `authCheck.requestSubmit` | Send request | Envoyer la demande | Enviar pedido |
| `authCheck.messages.requested` | Request sent to Workatent. | Demande envoyée à Workatent. | Pedido enviado ao Workatent. |
| `authCheck.requestedLine` | Authorization check requested on {date}. | Vérification de l'autorisation demandée le {date}. | Verificação da autorização pedida em {date}. |
| `errors.auth_check_already_requested` | An authorization check was already requested for this dispute. | Une vérification de l'autorisation a déjà été demandée pour ce litige. | Uma verificação da autorização já foi pedida para esta disputa. |
| `authCheck.title` | Authorization check | Vérification de l'autorisation | Verificação da autorização |
| `authCheck.body` ⚖️ RD-029 | Workatent needs independent evidence that the candidate agreed to be represented by you. For example, the candidate's dated message from a channel other than the confirmation email. If nothing is sent by the deadline, the referral may stop counting. | Workatent a besoin d'une pièce justificative indépendante montrant que le candidat a accepté que vous le représentiez. Par exemple, un message daté du candidat reçu par un autre moyen que le courriel de confirmation. Si rien n'est envoyé avant la date limite, la recommandation pourrait cesser de compter. | O Workatent precisa de um comprovante independente de que o candidato concordou em ser representado por você. Por exemplo, uma mensagem datada do candidato recebida por outro canal que não o e-mail de confirmação. Se nada for enviado até o prazo, a indicação pode deixar de contar. |
| `authCheck.statement` | What you're sending | Ce que vous envoyez | O que você está enviando |
| `authCheck.files` | Evidence | Pièces justificatives | Comprovantes |
| `authCheck.attestation` ⚖️ 4.8 | I confirm this evidence is genuine (Network Rules 4.8). | Je confirme que ces pièces justificatives sont authentiques (Règles du réseau, règle 4.8). | Confirmo que estes comprovantes são autênticos (Regras da rede, regra 4.8). |
| `authCheck.submit` | Send evidence | Envoyer les pièces | Enviar comprovantes |
| `authCheck.sentLine` | Evidence sent on {date}. A platform admin is reviewing it. | Pièces justificatives envoyées le {date}. Un administrateur de la plateforme les examine. | Comprovantes enviados em {date}. Um admin da plataforma está analisando. |
| `detail.recordCreated` | Candidate record created on {date}. | Profil du candidat créé le {date}. | Perfil do candidato criado em {date}. |

`authCheck.body`: the deadline shows next to it with the existing N1 deadline component. `detail.recordCreated` is shown only to the source org and admins (BR-38). en keeps "record" (an audit context, glossary §5.2); fr and pt use *profil* / *perfil* because *fiche* / *ficha* are on the avoid list.

### 5.6 Referral page states and ownership (`referrals.detail`)

| Key | en | fr-CA | pt-BR |
|---|---|---|---|
| `detail.protectedUntil` ⚖️ 6.3 | Protected while in progress and until {date} ET. | Protégée tant qu'elle est en cours et jusqu'au {date} HE. | Protegida enquanto estiver em andamento e até {date} (horário de Toronto). |
| `detail.protectedUnlessReleased` ⚖️ 6.3 | Protected while in progress and until {date} ET, unless the sourcing recruiter released the candidate. | Protégée tant qu'elle est en cours et jusqu'au {date} HE, sauf si le recruteur d'origine a libéré le candidat. | Protegida enquanto estiver em andamento e até {date} (horário de Toronto), a menos que o recrutador de origem tenha liberado o candidato. |
| `detail.ownershipVoid` | This referral no longer counts. | Cette recommandation ne compte plus. | Esta indicação deixou de contar. |
| `detail.next.hiredNoSplit` | Hire recorded without a split | Embauche enregistrée sans partage | Contratação registrada sem divisão |
| `detail.next.hiredNoSplitTargetReleased` | This referral doesn't carry a split. | Cette recommandation ne donne pas lieu à un partage. | Esta indicação não gera divisão. |
| `detail.next.hiredNoSplitTargetNoAgreement` ⚖️ Q-1 | No placement: the referral had no confirmed agreement. | Aucun placement : la recommandation n'avait pas d'entente confirmée. | Nenhuma colocação: a indicação não tinha acordo confirmado. |
| `detail.next.hiredNoSplitSource` | {partner} recorded a hire on {date}. No placement was created. | {partner} a enregistré une embauche le {date}. Aucun placement n'a été créé. | {partner} registrou uma contratação em {date}. Nenhuma colocação foi criada. |
| `detail.next.hiredNoSplitSourceRule` ⚖️ Q-1, 7.5 | The referral had no confirmed agreement. If you believe a share is owed, Network Rules 7.5 sets out the next steps. | La recommandation n'avait pas d'entente confirmée. Si vous estimez qu'une part vous est due, la règle 7.5 des Règles du réseau décrit les prochaines étapes. | A indicação não tinha acordo confirmado. Se você entende que uma parte é devida, a regra 7.5 das Regras da rede descreve os próximos passos. |
| `detail.next.void` | This referral no longer counts. | Cette recommandation ne compte plus. | Esta indicação deixou de contar. |
| `detail.next.voidSource` ⚖️ RD-029 | A platform admin found the candidate's confirmation invalid. | Un administrateur de la plateforme a jugé la confirmation du candidat invalide. | Um admin da plataforma considerou inválida a confirmação do candidato. |
| `detail.agreement.deemed` ⚖️ Q-1 | Created from the referral's terms | Créée à partir des conditions de la recommandation | Criado a partir dos termos da indicação |
| `detail.agreement.deemedLine` ⚖️ Q-1 | Created on {date} from the terms and split frozen at submission, because the hire was recorded before the agreement was confirmed. | Créée le {date} à partir des conditions et du partage figés à la soumission, parce que l'embauche a été enregistrée avant la confirmation de l'entente. | Criado em {date} a partir dos termos e da divisão congelados no envio, porque a contratação foi registrada antes da confirmação do acordo. |
| `detail.agreement.none` | No agreement: the hire was recorded without a split. | Aucune entente : l'embauche a été enregistrée sans partage. | Nenhum acordo: a contratação foi registrada sem divisão. |

`detail.next.hiredNoSplit` was "Hired: recorded without a split". It's now the glossary term on its own, which avoids fr/pt gender agreement with the status label.

### 5.7 Commissions (`commissions`, `labels`)

| Key | en | fr-CA | pt-BR |
|---|---|---|---|
| `labels.placementStatus.fee_pending` | Fee details pending | Détails des honoraires en attente | Detalhes da taxa pendentes |
| `labels.placementStatusDescription.fee_pending` | The hire counts. The hiring recruiter still needs to enter the start date, salary and invoiced fee. | L'embauche compte. Le recruteur du poste doit encore entrer la date d'entrée en fonction, le salaire et les honoraires facturés. | A contratação conta. O recrutador da vaga ainda precisa informar a data de início, o salário e a taxa faturada. |
| `commissions.feePending.title` | Fee details pending from the hiring recruiter | Détails des honoraires attendus du recruteur du poste | Detalhes da taxa aguardando o recrutador da vaga |
| `commissions.feePending.estimate` | Estimate at submission: ~{amount} | Estimation à la soumission : ~{amount} | Estimativa no envio: ~{amount} |
| `commissions.feePending.rateOnly` | {rate} of the salary at hire | {rate} du salaire à l'embauche | {rate} do salário na contratação |
| `commissions.feePending.flat` | Fee in the terms: {amount} | Honoraires prévus aux conditions : {amount} | Taxa prevista nos termos: {amount} |
| `commissions.feePending.legacy` | Terms not recorded: the hiring recruiter enters the fee. | Conditions non enregistrées : le recruteur du poste entre les honoraires. | Termos não registrados: o recrutador da vaga informa a taxa. |
| `commissions.feePending.established` | Hire established on {date}: {how} | Embauche établie le {date} : {how} | Contratação estabelecida em {date}: {how} |
| `commissions.feePending.how.deemed` ⚖️ N7 | no answer to the hire report | aucune réponse à la déclaration d'embauche | sem resposta ao relato de contratação |
| `commissions.feePending.how.upheld` | hire report upheld by a platform admin | déclaration d'embauche retenue par un administrateur de la plateforme | relato de contratação mantido por um admin da plataforma |
| `commissions.feePending.due` | Fee details due | Date limite des détails des honoraires | Prazo dos detalhes da taxa |
| `commissions.feePending.overdue` | Fee details were due {when} ET. | Les détails des honoraires étaient attendus le {when} HE. | Os detalhes da taxa venceram em {when} (horário de Toronto). |
| `commissions.feePending.noAmounts` | Amounts appear once the hiring recruiter enters the fee details. | Les montants paraîtront quand le recruteur du poste aura entré les détails des honoraires. | Os valores aparecem quando o recrutador da vaga informar os detalhes da taxa. |
| `commissions.feePending.enter` | Enter fee details | Entrer les détails des honoraires | Informar detalhes da taxa |
| `commissions.feeDetails.title` | Enter fee details | Entrer les détails des honoraires | Informar detalhes da taxa |
| `commissions.feeDetails.saved` | Fee details saved. Next: record the client invoice. | Détails des honoraires enregistrés. Prochaine étape : enregistrer la facture du client. | Detalhes da taxa salvos. Próximo passo: registrar a fatura do cliente. |
| `commissions.invoiceOverdue` | Invoice overdue | Facture en retard | Fatura atrasada |
| `errors.placement_fee_pending` | Enter the fee details first. | Entrez d'abord les détails des honoraires. | Informe primeiro os detalhes da taxa. |

`commissions.feePending.estimate` gains a tilde (glossary §6.6: estimated amounts carry "~"). `commissions.feePending.flat` is a fixed term, not an estimate, so it has no tilde. `commissions.feePending.due` is a label with a date next to it.

### 5.8 Admin (`admin`)

| Key | en | fr-CA | pt-BR |
|---|---|---|---|
| `admin.overview.queues.hireReports` | Hire reports | Déclarations d'embauche | Relatos de contratação |
| `admin.hireReports.title` | Hire reports | Déclarations d'embauche | Relatos de contratação |
| `admin.hireReports.description` | Contested and unanswered hire reports, authorization checks and overdue duties. You decide whether a hire counts, never the amount. | Déclarations d'embauche contestées ou sans réponse, vérifications de l'autorisation et obligations en retard. Vous décidez si une embauche compte, jamais du montant. | Relatos de contratação contestados ou sem resposta, verificações da autorização e obrigações atrasadas. Você decide se uma contratação conta, nunca o valor. |
| `admin.hireReports.sections.decide` | To decide | À trancher | Para decidir |
| `admin.hireReports.sections.waiting` | Waiting on a party | En attente d'une partie | Aguardando uma das partes |
| `admin.hireReports.sections.tasks` | Tasks | Tâches | Tarefas |
| `admin.hireReports.sections.closed` | Recently closed | Fermées récemment | Encerrados recentemente |
| `admin.hireReports.empty.decide` | Nothing to decide. | Rien à trancher. | Nada para decidir. |
| `admin.hireReports.empty.waiting` | Nothing waiting. | Rien en attente. | Nada aguardando. |
| `admin.hireReports.empty.tasks` | No tasks. | Aucune tâche. | Nenhuma tarefa. |
| `admin.hireReports.type.contested` | Contested | Contestée | Contestado |
| `admin.hireReports.type.unanswered` | Unanswered: notice not delivered | Sans réponse : avis non livré | Sem resposta: aviso não entregue |
| `admin.hireReports.overdue` | Overdue | En retard | Atrasado |
| `admin.hireReports.decideBy` | Decide by | Trancher d'ici le | Decidir até |
| `admin.hireReports.clientKeyCommit` (PD-079, AC-61) | Normalized client key (at submission): {key} | Clé client normalisée (à la soumission) : {key} | Chave de cliente normalizada (no envio): {key} |
| `admin.hireReports.clientKeyDelivery` (PD-079, AC-61) | Normalized client key (at delivery): {key} | Clé client normalisée (à la transmission) : {key} | Chave de cliente normalizada (na entrega): {key} |
| `admin.hireReports.jobClientToday` (PD-079, AC-61) | Client name on the job today: {client} | Nom du client sur le poste aujourd'hui : {client} | Nome do cliente na vaga hoje: {client} |
| `admin.hireReports.clientCommit` *(deprecated; relabelled, delete after the switch)* | Normalized client key (at submission): {client} | Clé client normalisée (à la soumission) : {client} | Chave de cliente normalizada (no envio): {client} |
| `admin.hireReports.clientDelivery` *(deprecated; relabelled, delete after the switch)* | Normalized client key (at delivery): {client} | Clé client normalisée (à la transmission) : {client} | Chave de cliente normalizada (na entrega): {client} |

PD-079 key labels: `clientCommit` / `clientDelivery` are relabelled in the JSON so today's screen (`src/app/admin/hire-reports/[reportId]/page.tsx` lines 137–138) no longer calls a key a client name. The frontend switches those lines to `clientKeyCommit` / `clientKeyDelivery` (param `{key}`), adds `jobClientToday` (param `{client}`), then deletes the two deprecated keys in all three locales. **Spelling:** en uses "Normalized" (Canadian -ize, voice-and-tone §6.10), not "Normalised" as in §2.9 and AC-61. Those two lines should read "Normalized" too.
| `admin.hireReports.windowEnd` | Ownership window ends {date} | Fin de la période de propriété : {date} | Fim do período de titularidade: {date} |
| `admin.hireReports.tailEnd` | Re-engagement tail ends {date} | Fin du délai de réembauche : {date} | Fim do prazo de recontratação: {date} |
| `admin.hireReports.coverage.title` | Coverage test (you apply it) | Critères de couverture (à appliquer par vous) | Critérios de cobertura (você aplica) |
| `admin.hireReports.coverage.one` | The referral was in progress when the offer was made. | La recommandation était en cours au moment de l'offre. | A indicação estava em andamento quando a oferta foi feita. |
| `admin.hireReports.coverage.two` | The offer was accepted inside the window (start date if the acceptance date is unknown). | L'offre a été acceptée pendant la période (date d'entrée en fonction si la date d'acceptation est inconnue). | A oferta foi aceita dentro do período (data de início se a data do aceite for desconhecida). |
| `admin.hireReports.coverage.three` | The selection process started inside the window, and the offer was accepted within 3 months after it ended. | Le processus de sélection a commencé pendant la période, et l'offre a été acceptée dans les 3 mois suivant sa fin. | O processo seletivo começou dentro do período, e a oferta foi aceita em até 3 meses depois do fim dele. |
| `admin.hireReports.coverage.never` | Never a defence inside the protection: “we found them ourselves”, “they applied directly”, “through another agency”, “a different role”, “the referral was declined or withdrawn”. | Jamais une défense pendant la protection : « nous l'avons trouvé nous-mêmes », « il a postulé directement », « par une autre agence », « un autre poste », « la recommandation a été refusée ou retirée ». | Nunca é defesa durante a proteção: “nós o encontramos por conta própria”, “ele se candidatou diretamente”, “por outra agência”, “outra vaga”, “a indicação foi recusada ou retirada”. |
| `admin.hireReports.noDeliveryRecords` | No email delivery records (emails start with N7). | Aucune donnée de livraison des courriels (les courriels arrivent avec N7). | Nenhum registro de entrega de e-mail (os e-mails chegam com o N7). |
| `admin.hireReports.candidateContacted` | Candidate contacted (times) | Candidat joint (nombre de fois) | Candidato contatado (vezes) |
| `admin.hireReports.candidateContactedHint` ⚖️ Q-4 | At most one contact is expected. | On s'attend à un seul contact au plus. | Espera-se no máximo um contato. |
| `admin.hireReports.clientConfirmation.label` | Client's written confirmation | Confirmation écrite du client | Confirmação por escrito do cliente |
| `admin.hireReports.clientConfirmationHint` ⚖️ 7.2 | A refusal counts against {org} (Network Rules 7.2). | Un refus compte contre {org} (Règles du réseau, règle 7.2). | Uma recusa pesa contra {org} (Regras da rede, regra 7.2). |
| `admin.hireReports.clientConfirmation.{not_requested,requested,provided,refused}` | not_requested: Not requested · requested: Requested · provided: Provided · refused: Refused | not_requested : Non demandée · requested : Demandée · provided : Fournie · refused : Refusée | not_requested: Não pedida · requested: Pedida · provided: Fornecida · refused: Recusada |
| `admin.hireReports.saveNotes` | Save notes | Enregistrer les notes | Salvar notas |
| `admin.hireReports.uphold` | Uphold report | Retenir la déclaration | Manter relato |
| `admin.hireReports.upholdTitle` | Uphold this hire report? | Retenir cette déclaration d'embauche? | Manter este relato de contratação? |
| `admin.hireReports.upholdBodyPlacement` | The hire counts on this referral. A placement is created with fee details pending from {org}, due in 10 business days. Both organizations are notified. | L'embauche compte sur cette recommandation. Un placement est créé avec des détails des honoraires attendus de {org} dans les 10 jours ouvrables. Les deux organisations sont avisées. | A contratação conta nesta indicação. Uma colocação é criada com os detalhes da taxa pendentes de {org}, com prazo de 10 dias úteis. As duas organizações são avisadas. |
| `admin.hireReports.upholdBodyNoSplit` ⚖️ Q-1 | The hire counts, but this referral has no confirmed agreement, so it's recorded without a split. Both organizations are notified. | L'embauche compte, mais cette recommandation n'a pas d'entente confirmée : elle est donc enregistrée sans partage. Les deux organisations sont avisées. | A contratação conta, mas esta indicação não tem acordo confirmado, então ela é registrada sem divisão. As duas organizações são avisadas. |
| `admin.hireReports.reject` | Reject report | Rejeter la déclaration | Rejeitar relato |
| `admin.hireReports.rejectTitle` | Reject this hire report? | Rejeter cette déclaration d'embauche? | Rejeitar este relato de contratação? |
| `admin.hireReports.finding.label` | Finding | Constat | Constatação |
| `admin.hireReports.finding.{not_hired,outside_window,different_person,not_this_client}` | not_hired: Not hired · outside_window: Outside the protection · different_person: Different person · not_this_client: Not this client | not_hired : Pas embauché · outside_window : Hors de la protection · different_person : Autre personne · not_this_client : Pas ce client | not_hired: Não contratado · outside_window: Fora da proteção · different_person: Outra pessoa · not_this_client: Não é este cliente |
| `admin.hireReports.findingHint` | For “Not this client”, the sourcing side sees only “Not this client”, not your resolution. | Pour « Pas ce client », le recruteur d'origine voit seulement « Pas ce client », pas votre résolution. | Para “Não é este cliente”, o recrutador de origem vê só “Não é este cliente”, não a sua resolução. |
| `admin.hireReports.resolution` | Written resolution | Résolution écrite | Resolução por escrito |
| `admin.hireReports.resolutionHint` | Both organizations read it. Don't name the client. | Les deux organisations la lisent. Ne nommez pas le client. | As duas organizações leem. Não cite o nome do cliente. |
| `admin.hireReports.noticeSent` | Record notice sent | Consigner l'avis envoyé | Registrar aviso enviado |
| `admin.hireReports.noticeSentLine` | Rule 6.4 notice sent on {date}. | Avis selon la règle 6.4 envoyé le {date}. | Aviso pela regra 6.4 enviado em {date}. |
| `admin.hireReports.task.feeOverdue` | Rule 6.4 notice due: fee details overdue since {date} | Avis selon la règle 6.4 à envoyer : détails des honoraires en retard depuis le {date} | Aviso pela regra 6.4 a enviar: detalhes da taxa atrasados desde {date} |
| `admin.hireReports.task.late` | Late hire record: recorded {date}, start {start} | Embauche enregistrée en retard : le {date}, entrée en fonction le {start} | Contratação registrada com atraso: em {date}, início em {start} |
| `admin.hireRecord.title` | Hire record | Embauche enregistrée | Contratação registrada |
| `admin.hireRecord.kind.placement` | Placement | Placement | Colocação |
| `admin.hireRecord.kind.noSplit` | Recorded without a split | Enregistrée sans partage | Registrada sem divisão |
| `admin.hireRecord.recordedOn` | Recorded on {date} | Enregistrée le {date} | Registrada em {date} |
| `admin.hireRecord.acceptance` | Offer accepted: {date} | Offre acceptée : {date} | Oferta aceita: {date} |
| `admin.hireRecord.acceptanceUnknown` | Offer accepted: unknown | Offre acceptée : date inconnue | Oferta aceita: data desconhecida |
| `admin.hireRecord.start` | Start date: {date} | Entrée en fonction : {date} | Data de início: {date} |
| `admin.hireRecord.role` | Role: {role} | Poste : {role} | Vaga: {role} |
| `admin.hireRecord.late` | Late record | Enregistrement en retard | Registro com atraso |
| `admin.hireRecord.note` | Admin note | Note d'administration | Nota do admin |
| `admin.hireRecord.noteHint` | Only platform admins see this. For example: “Hired by a related organization of {org} (shared member).” | Seuls les administrateurs de la plateforme voient cette note. Par exemple : « Embauché par une organisation liée à {org} (membre commun). » | Só os admins da plataforma veem esta nota. Por exemplo: “Contratado por uma organização relacionada a {org} (membro em comum).” |
| `admin.hireRecord.saveNote` | Save note | Enregistrer la note | Salvar nota |
| `admin.hireRecord.noteSaved` | Note saved. | Note enregistrée. | Nota salva. |
| `admin.hireReports.employerSignal` (Should) | Employer matches a client key: {value} | L'employeur correspond à une clé client : {value} | O empregador corresponde a uma chave de cliente: {value} |
| `admin.authCheck.open` | Open authorization check | Ouvrir une vérification de l'autorisation | Abrir verificação da autorização |
| `admin.authCheck.requestedBy.label` | Requested by | Demandée par | Pedida por |
| `admin.authCheck.requestedBy.{submitter,candidate,hiring_side}` | submitter: Stopped submitter (via support) · candidate: Candidate · hiring_side: Hiring side, in a dispute | submitter : Soumission bloquée (par le soutien) · candidate : Candidat · hiring_side : Recruteur du poste, dans un litige | submitter: Envio bloqueado (pelo suporte) · candidate: Candidato · hiring_side: Recrutador da vaga, em uma disputa |
| `admin.authCheck.challengerEvidence` | The challenger brought evidence | Le demandeur a fourni des pièces justificatives | Quem pediu apresentou comprovantes |
| `admin.authCheck.recentChange` | Recent-change note: {value} | Note de changement récent : {value} | Nota de alteração recente: {value} |
| `admin.authCheck.valid` | Mark valid | Marquer valide | Marcar como válida |
| `admin.authCheck.invalid` | Mark invalid | Marquer invalide | Marcar como inválida |
| `admin.authCheck.invalidTitle` ⚖️ RD-029 | Void this referral? | Invalider cette recommandation? | Invalidar esta indicação? |
| `admin.authCheck.invalidBody` ⚖️ RD-029, Q-4 | The referral stops counting and loses first position. No fee is owed on it. The consent is marked disputed, and the case is flagged for breach review. A pending hire report closes. You can't undo this. | La recommandation cesse de compter et perd sa priorité. Aucuns honoraires ne sont dus sur elle. Le consentement est marqué comme contesté, et le dossier est signalé pour examen d'un manquement. Une déclaration d'embauche en attente est fermée. Cette action est irréversible. | A indicação deixa de contar e perde a prioridade. Nenhuma taxa é devida sobre ela. O consentimento é marcado como contestado, e o caso é sinalizado para análise de violação. Um relato de contratação pendente é encerrado. Não é possível desfazer. |
| `admin.authCheck.noEvidence` | No evidence by the deadline. | Aucune pièce justificative dans le délai. | Nenhum comprovante no prazo. |
| `admin.flags.rejectedHireReports` | { one: "{count} rejected hire report in 90 days", other: "{count} rejected hire reports in 90 days" } | { one: "{count} déclaration d'embauche rejetée en 90 jours", other: "{count} déclarations d'embauche rejetées en 90 jours" } | { one: "{count} relato de contratação rejeitado em 90 dias", other: "{count} relatos de contratação rejeitados em 90 dias" } |

Admin changes from the draft: `windowEnd` says "Ownership window" (glossary T9) instead of "Protection window". `invalidTitle` says "referral" instead of "presentation", because admins see referrals everywhere else; the glossary verb is **void** / *invalider* / *invalidar*. fr `admin.hireReports.sections.closed` and the type and status labels agree with *déclaration* (f.); pt agrees with *relato* (m.). "Consent" in `invalidBody` is allowed: it names the legal-basis record (glossary §5.3).

*Removed in rev. 2 (no keys ship in N3):* the restart and reopen keys and their errors (BR-29, BR-30 → N7), `admin.flags.hireReportsFirstByA` and `admin.hireReports.task.releaseBeforeHire` (HA-1 / HA-9 → Ops SQL), the `admin.hireMetrics.*` panel (→ Ops SQL), `admin.hireReports.sections.deemed` / `empty.deemed`, and `hire.sisterOrg` / `sisterOrgHint` (BR-12 → admin note).

### 5.9 In-app notifications (English in SQL, PD-026)

In N3 the SQL writes en only (PD-026). fr and pt are final text for N7 to localize; nothing else uses them yet.

| Kind | en | fr-CA | pt-BR |
|---|---|---|---|
| `hire_report.filed` | {source} filed a hire report on {candidate label} for {job}. Answer by {when} ET. | {source} a déposé une déclaration d'embauche pour {candidate label}, poste {job}. Répondez d'ici le {when} HE. | {source} enviou um relato de contratação sobre {candidate label}, vaga {job}. Responda até {when} (horário de Toronto). |
| `hire_report.reminder` | Reminder: the hire report from {source} on {candidate label} needs an answer by {when} ET. | Rappel : la déclaration d'embauche de {source} pour {candidate label} attend une réponse d'ici le {when} HE. | Lembrete: o relato de contratação de {source} sobre {candidate label} precisa de resposta até {when} (horário de Toronto). |
| `hire_report.contested` | {target} contested your hire report on {candidate label}. You can add one rebuttal by {when} ET. | {target} a contesté votre déclaration d'embauche pour {candidate label}. Vous pouvez ajouter une réplique d'ici le {when} HE. | {target} contestou seu relato de contratação sobre {candidate label}. Você pode apresentar uma réplica até {when} (horário de Toronto). |
| `hire_report.rebuttal` | {source} added a rebuttal to the hire report on {candidate label}. A platform admin will decide. | {source} a ajouté une réplique à la déclaration d'embauche pour {candidate label}. Un administrateur de la plateforme décidera. | {source} apresentou uma réplica ao relato de contratação sobre {candidate label}. Um admin da plataforma vai decidir. |
| `hire_report.decided` | A platform admin decided the hire report on {candidate label}: {outcome}. | Un administrateur de la plateforme a tranché la déclaration d'embauche pour {candidate label} : {outcome}. | Um admin da plataforma decidiu o relato de contratação sobre {candidate label}: {outcome}. |
| `hire_report.deemed` ⚖️ N7 | The hire report on {candidate label} is confirmed: no answer by the deadline. | La déclaration d'embauche pour {candidate label} est réputée confirmée : aucune réponse dans le délai. | O relato de contratação sobre {candidate label} foi considerado confirmado: sem resposta no prazo. |
| `hire_report.closed_by_record` | {target} recorded the hire of {candidate label}. Your hire report is closed. | {target} a enregistré l'embauche de {candidate label}. Votre déclaration d'embauche est fermée. | {target} registrou a contratação de {candidate label}. Seu relato de contratação foi encerrado. |
| `hire_report.confirmed` | {target} confirmed your hire report on {candidate label}. | {target} a confirmé votre déclaration d'embauche pour {candidate label}. | {target} confirmou seu relato de contratação sobre {candidate label}. |
| `hire.recorded_deemed_agreement` ⚖️ Q-1 | {target} recorded the hire of {candidate label}. The agreement was created from the referral's terms. | {target} a enregistré l'embauche de {candidate label}. L'entente a été créée à partir des conditions de la recommandation. | {target} registrou a contratação de {candidate label}. O acordo foi criado a partir dos termos da indicação. |
| `hire.recorded_without_split` | {target} recorded a hire of {candidate label}. No placement was created. | {target} a enregistré une embauche de {candidate label}. Aucun placement n'a été créé. | {target} registrou uma contratação de {candidate label}. Nenhuma colocação foi criada. |
| `fee_details.overdue` | Fee details for {candidate label} were due {when} ET. Enter them on the placement. | Les détails des honoraires pour {candidate label} étaient attendus le {when} HE. Entrez-les dans le placement. | Os detalhes da taxa de {candidate label} venceram em {when} (horário de Toronto). Informe-os na colocação. |
| `auth_check.requested` | Workatent needs evidence of the candidate's authorization for {candidate label} by {when} ET. | Workatent a besoin de pièces justificatives de l'autorisation du candidat pour {candidate label} d'ici le {when} HE. | O Workatent precisa de comprovantes da autorização do candidato para {candidate label} até {when} (horário de Toronto). |
| `auth_check.decided` | The authorization check on {candidate label} is closed: {outcome}. | La vérification de l'autorisation pour {candidate label} est fermée : {outcome}. | A verificação da autorização de {candidate label} foi encerrada: {outcome}. |
| `hire.offer_nudge` (Should) | Was the offer to {candidate label} accepted? Record the hire. | L'offre faite à {candidate label} a-t-elle été acceptée? Enregistrez l'embauche. | A oferta para {candidate label} foi aceita? Registre a contratação. |

**`{outcome}` values** (one fixed word list, no resolution text):

| Notification | Who | en | fr-CA | pt-BR |
|---|---|---|---|---|
| `hire_report.decided` | sourcing side | upheld · not upheld · not this client | retenue · non retenue · pas ce client | mantido · não mantido · não é este cliente |
| `hire_report.decided` | hiring side | upheld · not upheld · closed | retenue · non retenue · fermée | mantido · não mantido · encerrado |
| `auth_check.decided` | source org | valid · invalid: the referral no longer counts ⚖️ RD-029 | valide · invalide : la recommandation ne compte plus | válida · inválida: a indicação deixou de contar |

**Params:** `{candidate label}` is the partner-visible label, never the name for B. No notification carries an employer, client name, evidence text or resolution text. The hiring side never sees "not this client" as a separate value, because it already knows its client (the value is "not upheld").

### 5.10 Truncation and layout risks

Lengths checked against en (fr ≈ +25 %, pt ≈ +15 %):
- **Buttons over ~32 characters in fr:** `panel.confirm` « Confirmer et enregistrer l'embauche » (35), `commissions.feePending.enter` « Entrer les détails des honoraires » (33), `authCheck.request` « Demander une vérification de l'autorisation » (43). Let them wrap to two lines; don't truncate. For `authCheck.request` inside a dispute toolbar, use a full-width secondary button on mobile (375 px).
- **Status chips:** `labels.placementStatus.fee_pending` « Détails des honoraires en attente » (33) and pt "Detalhes da taxa pendentes" (26) are longer than any current chip. Let the chip wrap to two lines; never truncate it with an ellipsis. `commissions.invoiceOverdue`: fr « Facture en retard » and pt "Fatura atrasada" both fit.
- **Alert titles:** fr titles in S3 / S5 / S7 are 30–40 % longer (`hire.objectionOpenTitle`, `hire.deemedTitle`, `hireContest.title`). The `AlertTitle` override (no truncation) is required.
- **Role radio labels** with a long job title wrap (`hire.roleThisJob`).
- **Admin coverage checklist** and `coverage.never` are long text: no `line-clamp`.
- **Deadline lines** in pt use "(horário de Toronto)" in sentences (+20 characters). In compact rows (`panel.filedBy`) pt uses "(Toronto)".

### 5.11 Strings drafted by the frontend, reviewed (copy review, 2026-11-16)

From `frontend.md` §D2.2. All are in the JSON with these values. **Bold** = changed in review; the rest are approved as drafted. Short keys are under `referrals` (`hireReport.*`, `hireContest.*`) or `admin`.

| Key | en | fr-CA | pt-BR |
|---|---|---|---|
| `hireReport.item.legend` | Item {n} | Pièce {n} | Comprovante {n} |
| `hireReport.month` | Month | Mois | Mês |
| `hireReport.year` | Year | Année | Ano |
| `hireReport.validation.learnedVia` | Choose how you learned of it | Choisissez comment vous l'avez appris | Escolha como você soube |
| `hireReport.validation.itemType` | Choose the type | Choisissez le type | Escolha o tipo |
| `hireReport.validation.attestation` | **Check the box to confirm** | Cochez la case pour confirmer | Marque a caixa para confirmar |
| `hireReport.validation.role` | **Use 120 characters or fewer for the role** | **Le poste doit compter 120 caractères ou moins** | **Use até 120 caracteres no cargo** |
| `hireContest.validation.reason` | Choose a reason | Choisissez un motif | Escolha um motivo |
| `hireReport.panel.rows.employer` | Employer as reported | Employeur déclaré | Empregador informado |
| `hireReport.panel.rows.role` | Role | Poste | Cargo |
| `hireReport.panel.rows.learnedVia` | **How the sourcing recruiter learned** | **Comment le recruteur d'origine l'a appris** | **Como o recrutador de origem soube** |
| `hireReport.panel.rows.tail` | **Selection process start** | **Début du processus de sélection** | **Início do processo seletivo** |
| `hireReport.panel.rows.files` | Files | Fichiers | Arquivos |
| `hireReport.panel.rows.contest` | Contest | Contestation | Contestação |
| `hireReport.panel.rows.rebuttal` | Rebuttal | Réplique | Réplica |
| `hireReport.panel.itemCaptured` | captured {date} | capturée le {date} | capturado em {date} |
| `hireReport.panel.newTab` | (opens in a new tab) | (s'ouvre dans un nouvel onglet) | (abre em uma nova aba) |
| `admin.nav.hireReports` | Hire reports | Déclarations d'embauche | Relatos de contratação |
| `admin.hireReports.empty.all` | No hire reports, checks or tasks right now. | Aucune déclaration, vérification ou tâche pour le moment. | Nenhum relato, verificação ou tarefa no momento. |
| `admin.hireReports.detail.facts` | Referral facts | Faits sur la recommandation | Dados da indicação |
| `admin.hireReports.detail.answer` | Answer from {org} | Réponse de {org} | Resposta de {org} |
| `admin.hireReports.detail.noAnswer` | No answer. | Aucune réponse. | Sem resposta. |
| `admin.hireReports.detail.rebuttal` | Rebuttal from {org} | Réplique de {org} | Réplica de {org} |
| `admin.hireReports.detail.signals` | Signals | Signaux | Sinais |
| `admin.hireReports.detail.deliveryRecords` | Email delivery records | Données de livraison des courriels | Registros de entrega de e-mail |
| `admin.hireReports.detail.adminFields` | **Admin follow-up** | **Suivi de l'administration** | **Acompanhamento do admin** |
| `admin.hireReports.detail.note` | **Admin note** | **Note d'administration** | **Nota do admin** |
| `admin.hireReports.detail.delivered` | Delivered {date} | Transmise le {date} | Entregue em {date} |
| `admin.hireReports.detail.legacy` | **Terms not recorded (sent before the terms card): {value}** | **Conditions non enregistrées (recommandation antérieure aux conditions du poste) : {value}** | **Termos não registrados (indicação anterior aos termos da vaga): {value}** |
| `admin.hireReports.detail.history` | Status history | Historique des statuts | Histórico de status |
| `admin.hireReports.detail.emailChanged` | Candidate email changed on {date}. | Courriel du candidat modifié le {date}. | E-mail do candidato alterado em {date}. |
| `admin.hireReports.detail.notesSaved` | Notes saved. | Notes enregistrées. | Notas salvas. |
| `admin.hireReports.detail.decided` | Decision saved. Both organizations were notified. | Décision enregistrée. Les deux organisations ont été avisées. | Decisão salva. As duas organizações foram avisadas. |
| `admin.hireReports.detail.sentOn` | Sent on | Envoyé le | Enviado em |
| `admin.hireReports.detail.noticeSaved` | Notice recorded. | Avis consigné. | Aviso registrado. |
| `admin.hireReports.detail.chooseFinding` | Choose a finding | Choisissez un constat | Escolha uma constatação |
| `admin.hireReports.detail.openReport` | Open hire report | Ouvrir la déclaration d'embauche | Abrir relato de contratação |
| `admin.hireReports.detail.filed` | Filed {date} | Déposée le {date} | Enviado em {date} |
| `admin.authCheck.candidateContacted` ⚖️ Q-4 | **I contacted the candidate through contact details the sourcing recruiter didn't provide** | **J'ai joint le candidat par des coordonnées que le recruteur d'origine n'a pas fournies** | **Contatei o candidato por um contato que o recrutador de origem não forneceu** |
| `admin.authCheck.opened` | Authorization check opened. | Vérification de l'autorisation ouverte. | Verificação da autorização aberta. |
| `admin.authCheck.decided` | Authorization check closed. | Vérification de l'autorisation fermée. | Verificação da autorização encerrada. |
| `admin.authCheck.none` | No authorization check | Aucune vérification de l'autorisation | Nenhuma verificação da autorização |
| `admin.authCheck.evidenceDue` | Evidence due | Date limite des pièces | Prazo dos comprovantes |
| **`admin.authCheck.evidenceDueAt`** *(new)* | Evidence due {when} ET | Pièces justificatives attendues d'ici le {when} HE | Comprovantes até {when} (horário de Toronto) |
| `admin.authCheck.chooseRequester` | Choose who asked for the check | Choisissez qui a demandé la vérification | Escolha quem pediu a verificação |
| `admin.authCheck.status.{open,valid,invalid}` ⚖️ RD-029 | Open · Valid · Invalid: referral void | Ouverte · Valide · Invalide : recommandation invalidée | Aberta · Válida · Inválida: indicação invalidada |
| **`admin.validation.resolutionLong`** *(new)* | Write a resolution of 20 to 2,000 characters. | Rédigez une résolution de 20 à 2 000 caractères. | Escreva uma resolução de 20 a 2.000 caracteres. |

**For the frontend and backend to wire:**
- `admin.validation.resolutionLong` replaces `admin.validation.resolution` wherever the minimum is 20: `src/features/admin/actions.ts` lines 236 (hire-report decision) and 286 (`decideCheckSchema`), and `src/features/admin/components/hire-report-admin.tsx` lines 156 and 368. `admin.validation.resolution` (5 characters) stays for the N1 and placement dispute schemas (actions.ts lines 27 and 40) and `referral-dispute-controls.tsx`.
- `admin.authCheck.evidenceDueAt` replaces the JSX `{t("authCheck.evidenceDue")}: {…}` concatenation at `hire-report-admin.tsx` line 392 (fr needs a space before the colon, and fr and pt need to reorder the sentence). Pass `when = f.etDateTime(check.evidence_due_at)`. `evidenceDue` can stay as a column label.

---

## 6. Accessibility (WCAG 2.1 AA)

**Keyboard paths and focus order**
- **Record hire dialog:**
  - **V0:** focus moves to the alert title, then **Close**.
  - **Tab order:** notice → acceptance date → unknown checkbox → start date → role radios (arrow keys) → title input (when shown) → base / bonus → I ≠ C checkbox → its fields → Cancel → Record hire.
  - **Unknown checkbox:** ticking it removes the date input from the tab order, and focus stays on the checkbox.
  - **Errors:** after a server error, focus moves to the alert. After a field error, focus moves to the first invalid field.
  - **Result state:** focus moves to the result title, then **Done**. On close, focus returns to the trigger.
- **Hire report dialog:**
  - **Tab order:** tail checkbox (when shown) → employer → month → year → role → how learned → each item card (type → date → captured → link → backs-tail checkbox → Remove item) → Add another item → file button → file row actions → statement → attestation → Cancel → File hire report.
  - **Add another item** moves focus to the new item's Type select. **Remove item** moves focus to the previous item's Type, or to **Add another item**.
  - The item list is an `ol` with `aria-label` "Evidence items". Each card is a `fieldset` with a `legend` "Item {n}".
  - The upload list is `aria-live="polite"` (N1).
  - The disabled submit has a visible reason linked with `aria-describedby`.
- **Contest dialog:** reason `radiogroup` → the conditional dates (they appear after the radio group and are announced through `aria-live="polite"` on their container) → statement → files → attestation → buttons. The statement hint changes with the reason, and `aria-describedby` follows the visible hint.
- **Panels:** every panel is a `section` with an `h2`. The status line comes right after the heading and is read before the rows. Copy and download buttons follow reading order.
- **Admin detail:** sections with headings. The actions come last in DOM order even when sticky. Each `ConfirmDialog` puts focus on its first field (the radio group or the resolution).

**Labels and announcements**
- Every status pill (hire report status, placement `fee_pending`, Overdue, Invoice overdue, Suspended, deemed agreement) pairs a `aria-hidden` icon with text. Colour is never the only signal.
- Deadlines are text ("{when} ET · 3 business days left", "Ends today"), from `BusinessDeadline`.
- The month and year selects share a `fieldset` with the `legend` "Approximate start".
- Checkbox rows (unknown date, tail statement, attestations) are wrapped in their `Label`, so the full text is the target.
- Links in the A-side evidence open in a new tab with the visually hidden text "(opens in a new tab)".
- The computed fee box keeps N2's `aria-live="polite"`.
- Result states and inline outcome alerts use `role="alert"` (refusals) or `role="status"` (success).

**Contrast and targets**
- Warning, info and success alerts use the `*-soft` token pairs in `globals.css` (≥ 4.5:1 in light and dark). Hash text is `text-foreground`, monospace.
- Every interactive element is ≥ 44 × 44 px: Copy, Remove item, Remove file, the number stepper buttons, radio rows and checkbox rows. Use `size="icon"` or pad the hit area.
- Reflow at 320 / 375 px with no horizontal scroll. fr wraps, with no `line-clamp` on alert titles or status lines.

---

## 7. Acceptance criteria

Roles: **B-owner** = the job owner; **B-mgr** = B `org_admin` / `recruiter_manager`; **B-rec** = a B recruiter who isn't the owner. **A-owner** = the candidate owner; **A-mgr**; **A-rec** = another A recruiter. **C** = another org. Unless stated, the test turns `deemed_agreement_enabled` **on** through the service role (it defaults to false everywhere, PD-074). Business days per RD-018. ACs marked **moved** keep their number and aren't tested in N3.

### A. Prerequisites (BR-1, BR-2)
- **AC-1** (BR-1) Given B-owner edits a job with **Open to partners** ticked and the client name empty, "Confidential", "N/A" or another N1 placeholder, when they save (including Save draft), then the whole save is refused with the field error `jobs.validation.clientRequiredForPartners`, the job isn't saved, and the form keeps every value. With a real name and **Hide client** ticked, the save succeeds, and the name appears in no partner listing, opportunity, referral payload, notification or RPC response that an A member can call.
- **AC-2** (BR-1) Given an existing referral-open job with no client key, then it is hidden from partners: absent from every partner listing, and both submit RPCs refuse it with the existing "no longer available" error. B's job list shows the chip `jobs.nudge.chipClientName`. The job page shows the banner with **Add client name** for `jobs:write` holders only. When several reasons apply, the order is (a) terms, (b) permanent, (c) currency, (d) client name. Adding a real name removes the nudge, and the job is partner-visible again.
- **AC-3** (BR-1) Given that hidden job has in-flight referrals, then they keep their status and can move through every transition. Internal referrals from a related org follow the same gate: a job without a real client name accepts no new internal referral either (PD-077).
- **AC-4** (BR-1) Given a connector or `/api/v1/jobs` job with no client name, then it can be created and updated, but setting it open to partners is refused (`client_name_required_for_referrals`).
- **AC-5** (BR-2) Given an A member, when they call `record_candidate_request_delivery` directly with any arguments, then the call is refused (no execute grant) and `sent_at` is unchanged. Issuing or resending through the server path records `sent_at`. The N9 suite passes.

### B. Eligibility, governing referral, coverage, tail (BR-3 to BR-6)
- **AC-6** (BR-4, BR-7) Given B-owner views a delivered referral, then **Record hire** is shown for each of `submitted`, `under_review`, `info_requested`, `accepted`, `interviewing`, `offer`, and for `declined`, `withdrawn`, `rejected`, `cancelled` and SLA-released while now ≤ window end + 9 months. It isn't rendered for `awaiting_candidate`, `candidate_declined` (never visible to B anyway), a referral without `delivered_at`, objection upheld or final, void, an existing hire record, or closed past window end + 9 months. (While B's own objection is open or contested, the button opens V0: AC-102.)
- **AC-7** (BR-4) Given a legacy referral, then the closed-referral limit is delivery + 12 months + 9 months.
- **AC-8** (BR-4) Given any ineligible referral from AC-6, when B-owner calls the record action directly, then it returns `hire_not_eligible` and nothing is written (no placement, no status change, no audit event other than the refusal).
- **AC-9** (BR-3) Given a referral whose job had no client key, then the **Another role at this client** option isn't rendered, and a forged call with an other-role title returns `hire_not_eligible`. Given a job with a client key, the option is shown.
- **AC-10** (BR-3, BR-21, BR-36) Given A has referral R1 (commit key K1, delivery key K2) and R2 at the same hiring org with only key K2 (or only K1), then the union rule applies: R2 is treated as the same client for the release block (AC-47) and in the data the Ops HA-9 query reads (AC-78, moved to Ops SQL). Given R3 at a **different** hiring org with key K1, then R3 is never affected.
- **AC-11** (BR-5) Given a closed referral whose window ended 4 months ago, when B records a hire or A files a report, then the server accepts it, because it refuses only on eligibility and the tail, never on coverage. The admin detail shows the window end, the tail end and the three-point coverage checklist as static text, with no computed verdict.
- **AC-12** (BR-6) Given A-owner on a closed referral:
  - with now ≤ window end + 6 months, the filing-limit line shows `hireReport.limit` with that date, and filing needs no tail statement;
  - between + 6 and + 9 months, the line shows `limitTail`, the dialog shows the tail statement, and filing without the statement or without a ticked backing item is refused with field errors;
  - after + 9 months, **Report a hire** isn't rendered, the footer shows `limitClosed`, and a forged filing returns `hire_report_unavailable`.

  B never sees any filing-limit line.

### C. The hiring side records a hire (BR-7 to BR-16)
- **AC-13** (BR-7) Given a referral in `offer` with an active agreement, when B-owner records the hire, then the dialog (V1) has exactly the N2 fields with no common fields, the placement is created as before, and the referral moves to `hired`. Only the trigger and title copy change (PD-075).
- **AC-14** (BR-7, RD-036, PD-077) Given a referral, then B-owner and B-mgr see **Record hire** and B-rec doesn't see the referral. A members never see it. A forged call from B-rec, A or C returns `not_found` ("Referral not found"). Recording a hire waives the pipeline-owner rule for the `hired` move only:
  - **Happy path doesn't regress.** Given a referral in `offer` with an active agreement, accepted by member M, when record scope shows M the referral, then M can still record the hire, as before N3.
  - **Other moves stay owner-only.** Given a B-mgr who isn't the pipeline owner, then they can record the hire, but every other transition on that referral (for example `interviewing` → `offer`, or a decline) is still refused by the pipeline-owner rule.
- **AC-15** (BR-7, PD-077) Given a referral with an active agreement in `accepted`, `interviewing`, or `withdrawn` / `rejected` / `cancelled` after acceptance, when B-owner records the hire, then:
  - the dialog is V2;
  - the placement is created on the existing agreement;
  - the referral moves to `hired`;
  - the timeline shows the earlier status event and then `Hired`;
  - the audit log records the previous status.

  Given a `declined`, `submitted` or SLA-released referral, which has no agreement, then the dialog is **never V2**. It's V4 with the flag off (a record-only hire, no split) or V3 with the flag on (a deemed agreement). The referral moves to `hired`, and the previous status stays in the timeline and the audit log.
- **AC-16** (BR-8) Given V2 to V6:
  - an acceptance date after the start date or in the future gives a field error;
  - ticking **I don't know the acceptance date** hides and clears the date and shows the hint;
  - the record then stores acceptance as unknown and uses the start date for timing;
  - the start date is required, and a future start date is accepted;
  - a start or acceptance date later than today + 548 days, or earlier than delivery − 1 year, gives the field error `hire_dates_invalid` and nothing is written. A missing start date gives it too on a forged call. The same bound applies on V1, on the Confirm path and in **Enter fee details** (PD-077).
- **AC-17** (BR-8) Given **Another role at this client** with the title "Senior Analyst" and a base of 100,000 on 20 % `pct_base` terms with a 25,000 minimum, then the computed fee shows 25,000 ("Minimum fee applies"), the placement stores the role title, and both sides' placement pages show it. A missing title or one over 120 characters gives a field error.
- **AC-18** (BR-8, BR-15) Given the I ≠ C toggle, then the reason list includes **Non-permanent engagement** with its ⚖️ helper. The value `non_permanent_engagement` is accepted by the Zod schema, the TS type and the database constraint, and it shows on both sides' placement fee panel.
- **AC-19** (BR-8, HE-7, HE-8) Given a legacy referral, then V6 shows the common fields plus today's free fee entry and legacy alert, and the placement uses the legacy default rule version in force at submission. Given a snapshot referral in a foreign currency, then no currency picker is shown and the snapshot currency is used with no conversion.
- **AC-20** (BR-9) Given the flag is on and a referral was never accepted (status `submitted`), when B-owner opens **Record hire**, then V3 shows the ⚖️ deemed notice with the terms version and date. On submit:
  - an agreement is created from the referral's effective terms (the snapshot, or the latest concierge amendment) and the commission rule version stored at submission, marked deemed;
  - the placement is created;
  - A isn't asked to confirm;
  - A gets `hire.recorded_deemed_agreement`;
  - both sides' agreement panels show the `deemed` pill and line.
- **AC-21** (BR-9) Given the flag is on and an agreement in `pending_source` (accepted, A never confirmed), then the same as AC-20 applies: the pending agreement becomes active as deemed, and no second agreement is created.
- **AC-22** (BR-9, HE-14) Given an internal referral with no confirmed agreement and the flag on, then the deemed agreement has 0 sourcing bps.
- **AC-23** (BR-9) Given the flag is **off** and a referral with no confirmed agreement, then **Record hire** opens V4 (no fee fields, the ⚖️ notice). On submit:
  - a record-only hire is stored, with no placement, agreement, split or ledger row;
  - the dialog shows the `noAgreementResult` result state;
  - the referral moves to `hired` (BR-11);
  - B's page shows S4-e with the no-agreement body, and A's page shows S4-e with the rule 7.5 line;
  - A gets `hire.recorded_without_split`;
  - the admin sees the record.
- **AC-24** (BR-9, PD-067) Given any member of any org, or the app's authenticated session, then no table write, RPC or Server Action can change the flag. Each attempt is refused. A change through the service-role path writes an audit event. The flag defaults to **false in every environment**, local and test included. Tests turn it on per case through the service role (PD-074).
- **AC-25** (BR-10) Given a referral with no confirmed agreement and a report that is then upheld (or deemed, with seeded records): with the flag on, a **fee-pending** placement on a deemed agreement is created; with the flag off, a record-only hire is created and the admin uphold dialog shows `upholdBodyNoSplit`.
- **AC-26** (BR-11) Given A released the referral, when B-owner records a hire, then:
  - before submit, the dialog matches the variant the referral would otherwise get (V2, V3 or V4), with no release notice;
  - after submit, the result state reads "Hire recorded. This referral doesn't carry a split.";
  - no placement, agreement, split or ledger row exists, the money inputs aren't stored, and the dates and role are (BR-11);
  - A gets `hire.recorded_without_split`, and A's page shows S4-e;
  - the admin sees the record.
- **AC-27** (BR-11, N1 BR-25) Given two otherwise identical referrals, one released and one not, then before any hire is recorded, B's referral page, button, dialog variant, footer and every payload B can read are byte-identical apart from ids and names.
- **AC-28** (BR-12) *Rewritten in rev. 2: the related-org tick moved to an admin note (PD-073).* Given any record dialog variant, then it has no related-org field, and a forged related-org argument is ignored. Given a referral with a hire record, then a platform admin can save an **Admin note** (≤ 2,000) on the **Hire record** panel of `/admin/referrals/[referralId]`. The save is audited, the note shows read-only on the hire-report detail, and it's absent from every A and B payload and page.
- **AC-29** (BR-13) Given a B record (any variant, including B's confirm of a report) made more than 5 business days after the start date, or more than 5 business days after the stated acceptance date, then the record is accepted and marked `late`. The marker appears only in admin views (the task list, the hire-record panel and the hire-report detail), and no A or B payload contains it. A record within both limits isn't marked. On V1 (no acceptance date), only the start-date rule applies. Deemed and upheld hires are never marked `late`.
- **AC-30** (BR-14) Given a placement recorded with start date S, then `invoice_due_at` = S + 10 business days is stored at record time and isn't moved by a later holiday-table edit. When now > `invoice_due_at` with no client invoice, both sides' commissions list rows and placement page show **Invoice overdue**. After an invoice is recorded, the chip disappears. The admin reads it through the documented Ops SQL query (no admin UI in N3; X9, PD-079).
- **AC-31** (BR-8, R-8) Given the terms were amended after the dialog opened, when B submits on any new path (V2, V3, V6, Confirm), then `hire_terms_changed` is returned and nothing is written (the N2 behaviour).
- **AC-32** (E2, PD-075) Given a referral in `accepted` or `interviewing` on the pipeline board, when B-owner drops it on **Hired**, then the same dialog variant opens as from the referral page. Cancelling leaves the card where it was.
- **AC-33** (BR-16, Should) Given a referral has been in `offer` for 30 calendar days, then B-owner and B-mgr get `hire.offer_nudge` once, and the referral page shows the nudge banner with **Record hire**. After dismissing it, or after any status change, it doesn't show again for that referral.

### D. The sourcing side reports a hire (BR-17 to BR-22)
- **AC-34** (BR-17) Given A-owner or A-mgr on a delivered, unreleased referral with no placement, no pending report, no open objection or dispute, fewer than 2 rejected reports, inside the tail, then **Report a hire** is shown. A-rec doesn't see the referral. B never sees the button.
- **AC-35** (BR-17, R-2) Given each refusal cause, when A calls the filing action directly, then each returns `hire_report_unavailable` with the **same payload shape and text**. The causes:
  - not eligible (`awaiting_candidate`, `candidate_declined`, `already_presented`, upheld or final objection, void);
  - released;
  - out of the tail;
  - a pending report;
  - an open objection or dispute;
  - two rejections;
  - a second report without a newer item;
  - a referral id from another org, or a random UUID.

  No report row is created, and no response reveals the client name, key or cause.
- **AC-36** (BR-17, BR-22) Given B already recorded the hire (placement or record-only), when A files, then `hire_already_recorded` is returned, with a link to the placement (or the referral for a record-only hire) that A can already open.
- **AC-37** (BR-20) Given A's org has 3 pending reports, then a 4th filing returns `hire_report_rate_limited`. Given 10 reports filed in the rolling 90 days, then the 11th returns it too. Given one user files 6 reports in an hour (across referrals), then the 6th gets `errors.rateLimited`.
- **AC-38** (BR-17) Given a first report on referral R was rejected on date D, then a second report needs at least one item dated after D, or it returns `hire_report_unavailable`. After two rejected reports on R, any further filing returns `hire_report_unavailable`, and **Report a hire** isn't rendered.
- **AC-39** (BR-17, HE-13) Given an open prior-presentation objection or dispute on R, then filing is refused (generic) and the button isn't rendered. After it resolves with the referral still counting, filing is allowed, and the new report's `answer_due_at` counts from its own filing.
- **AC-40** (BR-17, HE-9) Given the candidate revoked the sharing authorization after delivery, then A can still file and B can still record.
- **AC-41** (BR-18) Given the dialog, then filing is refused with field errors when:
  - the employer is missing or over 200 characters;
  - the start month or year is missing;
  - the role is over 120 characters;
  - "how you learned" is missing;
  - there are no evidence items;
  - an item has no type or no date, or a date in the future;
  - a capture date is before the item date or in the future;
  - a link doesn't start with `https://`;
  - the statement is under 20 or over 2,000 characters;
  - the attestation is unticked.

  A screenshot item with no link and no capture date is accepted.
- **AC-42** (BR-18) Given files are attached, then each goes through uploading → processing → ready / rejected (the N1 pipeline: PDF / PNG / JPEG only, ≤ 10 MB, ≤ 5 files, scan, SHA-256 by the worker, Canadian storage). **File hire report** is disabled with a reason while any file isn't ready. A forged filing with an unready file returns `hire_report_files_not_ready`. Closing the dialog discards the uploads.
- **AC-43** (BR-18, BR-23) Given a valid filing, then:
  - the report is `awaiting_answer`, with `answer_due_at` = filing + 10 business days stored;
  - B-owner and every B-mgr get `hire_report.filed`;
  - A sees the toast and the panel;
  - an audit event is written with no employer text, no evidence content and no client data.
- **AC-44** (BR-19) Given B-owner views the panel, then they see the statement, employer text, start month, role, how learned, the tail statement, and each item's type, item date and capture date, plus "File {n}", upload time and SHA-256 per file. They see **no link, no file name or type, and no download**, and no B payload contains links, file names or storage paths.
- **AC-45** (BR-19, rule 4.5) Given A views the referral, the report, refusals or any notification in N3 flows, then no client name or client key appears anywhere. A sees its own links and files (name, download through a 60-second signed URL).
- **AC-46** (BR-19, BR-27) Given a report rejected with the finding `not_this_client`, then A sees only "Not this client." (no resolution text, in the panel and the notification). B sees the resolution.
- **AC-47** (BR-21) Given a pending report on R1 (keys K1 / K2), then **Release candidate** and the withdraw dialog's release checkbox aren't rendered on every referral of A's org at B whose key matches K1 or K2. Direct release calls return `release_not_allowed`. Once the report reaches a final state (confirmed, closed by record, deemed, upheld, rejected, void), release is offered again where N1's guards hold. B's payloads show no difference before, during or after.
- **AC-48** (BR-22) Given a report in `awaiting_answer`, `unanswered`, `contested` or `in_review`, when B records the hire on that referral, then the report closes as `closed_by_record`, any open `hire_report` dispute on it closes (BR-22), A gets `hire_report.closed_by_record`, and A's panel shows "Closed: confirmed by the hiring recruiter on {date}."
- **AC-49** (BR-22, HE-5) Given B1 and B2 each have a counting referral of the same person at the same client, then each records on its own referral independently. Neither org sees the other's referral, record or report, and nothing in one changes the other.
- **AC-50** (N10 §2.8) Given A opens **Report a problem** on a referral where **Report a hire** would show, then the line "Was your candidate hired?" links **Report a hire**, which closes the N10 dialog and opens S5, with no discard confirm (the same as N10's other links; design-review gap 8). Otherwise it shows `hireReport.rightToolUnavailable` as plain text.

### E. The hiring side's answer (BR-23 to BR-30)
- **AC-51** (BR-23, HE-10) Given a report filed on day 0, then `hire_report.reminder` goes to B-owner and every B-mgr at business days 5 and 8, once each, only while it's `awaiting_answer`. Given the job owner was deactivated, then the managers still get every notice, and `answer_due_at` doesn't move.
- **AC-52** (BR-24) Given B-owner selects **Confirm and record hire**, then the record dialog opens in the right variant with the role prefilled from the report (another role when the role differs from the job title), the start date empty with the hint "{partner} reported a start around {month}.", and the fee fields from the snapshot. On submit, the placement (or record-only hire) is created, the report is `confirmed`, and A gets `hire_report.confirmed`.
- **AC-53** (BR-25) Given **Contest**, then exactly four reasons are offered, with no "we already had them". `outside_window` without both dates, or with the process start after the acceptance, gives field errors. Each reason without a statement or attestation gives field errors. On a valid contest:
  - a dispute of kind `hire_report` is created;
  - `rebuttal_due_at` = contest + 5 business days is stored;
  - A gets `hire_report.contested`;
  - the panel shows `contested`.
- **AC-54** (BR-25) Given another dispute is open on the referral, then contesting returns `dispute_already_open`. After `answer_due_at`, **Contest** isn't rendered, and a forged contest returns `hire_report_answer_closed`.
- **AC-55** (BR-25, BR-19) Given a contest, then A sees:
  - the reason label (for `not_this_client`, "Not this client");
  - the dates for `outside_window`;
  - B's statement, except for `not_this_client`, where the statement is admin-only (BR-25 rev. 2);
  - each item's type and date.

  A never sees B's files. The admin sees everything.
- **AC-56** (BR-26) Given a contested report, then A-owner can send one rebuttal before `rebuttal_due_at`. A second rebuttal, or one after the deadline, returns `hire_rebuttal_closed`, and the button isn't rendered. B gets `hire_report.rebuttal`. At the deadline with no rebuttal, the report moves to `in_review` with no notification.
- **AC-57** (BR-27) Given a report enters `in_review`, then `decide_by` = rebuttal deadline + 10 business days is stored. After it, the admin queue shows **Overdue**. The report never resolves itself.
- **AC-58** (BR-27, BR-31) Given the admin upholds with a resolution, then a fee-pending placement is created through BR-9 / BR-10, both orgs get `hire_report.decided`, and both panels show "Upheld… The hire counts." with the resolution and a link to the placement.
- **AC-59** (BR-27) Given the admin rejects with a finding other than `not_this_client`, then both sides see "Not upheld…" with the resolution. The rejection counts toward A's per-referral limit (AC-38) and HA-6 (AC-85). No placement is created.
- **AC-60** (BR-27, rule 7.5) Given the uphold and reject dialogs and their RPCs, then they accept no amount, fee, salary or currency field. A forged money argument is ignored or refused, and the placement amounts stay empty until B enters them.
- **AC-61** (BR-28) Given the admin opens the detail, then it shows:
  - the normalized client key at submission and at delivery, labelled "Normalized client key (at submission)" / "(at delivery)", and "Client name on the job today". Names at submission and delivery come with the pre-launch follow-up (PD-079);
  - the same-person block;
  - every evidence link and file (download through a 60-second signed URL, each download audited);
  - the record-created and email-change notes;
  - both statements and the rebuttal;
  - delivery records;
  - org and referral flags.

  The admin can save "Candidate contacted" (0–5) and "Client's written confirmation" (four values) and a note, each audited. None of these fields appear in any A or B payload.
- **AC-62** (BR-29) Given a report reaches `answer_due_at` with no answer and **no** delivery records, then it moves to `unanswered`, appears in the admin queue as "Unanswered: notice not delivered", is never deemed, and no placement is created.
- **AC-63** (BR-29, gated) Given delivered, non-bounced records (seeded by the service role) for the job owner **and** one other B-mgr, when `answer_due_at` passes with no answer, then the report becomes `deemed_confirmed`, a fee-pending placement (or a record-only hire with the flag off and no agreement) is created, and both get `hire_report.deemed`. The admin detail shows the report read-only, with no Reopen action. *Note (PD-079):* the fee-details date in B's `panel.status.deemedTarget` line ("…by {when} ET") is an **N7 acceptance condition** (`fee_details_due_at` in the report view). In N3 it may show "—", and QA doesn't fail AC-63 on it.
- **AC-64** (BR-29) Given any of these, then the report goes to `unanswered`, never deemed:
  - delivered records for the job owner only;
  - for the job owner and a manager where either record has a bounce;
  - the same person counted twice.

  The no-active-job-owner case is AC-103.
- **AC-65** (BR-29) *Rewritten in rev. 2: the restart was removed (PD-069 cut 2, PD-073).* Given an `unanswered` report, then the admin can only uphold or reject it on the record (AC-58, AC-59). No **Restart answer clock** action is rendered, no restart RPC exists on the `api-surface` allow-list, and `answer_due_at` never changes after filing.
- **AC-66** (BR-30) **Moved to N7** (PD-073). Reopening a deemed confirmation is built and tested with N7's delivery records. N3 ships no Reopen action, `reopened` state, `reopen_until` field or reopen copy.
- **AC-67** (BR-22, BR-29) Given an `unanswered` report, then B sees **Record hire** (not **Contest**) on the panel, and recording closes the report as `closed_by_record`.

### F. Fee-pending placements (BR-31 to BR-33)
- **AC-68** (BR-31) Given a fee-pending placement:
  - both sides see the status **Fee details pending**;
  - the panel title;
  - with a frozen estimate, "Estimate at submission: {amount}" labelled as an estimate;
  - with none on a % basis, "{rate} of the salary at hire";
  - on flat terms, "Fee per the terms: {amount}";
  - on a legacy referral, no estimate, and the line "Terms not recorded: the hiring recruiter enters the fee." **Enter fee details** then uses legacy free entry (PD-074);
  - the established line;
  - `BusinessDeadline` for `fee_details_due_at` = establishment + 10 business days, stored;
  - share tiles with percentages and "—" for amounts.

  No computed or invoiced amount is invented anywhere.
- **AC-69** (BR-31) Given a fee-pending placement, then **Record client invoice**, **Record client payment** and **Record payout** aren't rendered on either side, and direct calls to the invoice, evidence and allocation RPCs return `placement_fee_pending`. **Open a dispute** is available to both.
- **AC-70** (BR-31, BR-14) Given B-owner enters the fee details (start date, base, bonus, I ≠ C with reason), then the placement becomes a normal N2 placement (computed fee, floor, ledger rules unchanged), `invoice_due_at` = start + 10 business days is stored, and the toast "Fee details saved. Next: record the client invoice." shows.
- **AC-71** (BR-31) Given `fee_details_due_at` passes with no fee details, then B gets `fee_details.overdue`, the placement page shows "Fee details were due {when} ET.", and `/admin/hire-reports` lists the task "Rule 6.4 notice due". The admin can record **Notice sent** (date + note), and the task then shows "Rule 6.4 notice sent on {date}" and stays until the fee details exist. No job, org or member is paused or restricted automatically.
- **AC-72** (BR-32, PD-059) Given every money input added or reused by N3 (base, bonus, invoiced fee on V2 / V3 / V6 / Confirm / FeeDetails), when an oversized, negative or non-integer value is sent directly to the RPC, then it's refused at the RPC and by the table constraint with the N2 bounds. An estimate that can't be computed shows the rate-only line, never a wrong amount.
- **AC-73** (BR-33) Given a money disagreement on a placement from N3, then the existing placement dispute is used, and `resolve_dispute` behaviour and allocations are unchanged (the X6 regression).

### G. Release and ownership line (BR-34 to BR-36)
- **AC-74** (BR-34) Given a delivered, still-counting `declined` or `rejected` referral with no open dispute, no placement and no pending report at that client, then A-owner sees **Release candidate**. The N1 two-step dialog releases it, the toast and the A footer follow N1, and B sees no change in any payload or page.
- **AC-75** (BR-34) Given the same referral with a placement (live or record-only), or a pending report at the client (either key), or any N1 guard failing, then the button and the withdraw-dialog checkbox aren't rendered, and a direct call returns `release_not_allowed`.
- **AC-76** (BR-35) Given a delivered referral inside its window or in progress:
  - A sees "Protected while in progress and until {date} ET.";
  - B sees "Protected while in progress and until {date} ET, unless the sourcing recruiter released the candidate.";
  - B's line is identical whether or not A released;
  - A's released referral keeps N1's "Released on {date}" line.
- **AC-77** (BR-35, BR-6) Given an undelivered referral, then no date appears on either side. Given a delivered referral that isn't in progress and whose window ended, then B sees no protection line, and A sees the filing-limit line (AC-12). Upheld or final objection referrals show `ownershipEnded`. Void referrals show `ownershipVoid`.
- **AC-78** (BR-36) **Moved to Ops SQL** (PD-073). In N3: given A released referral R at client K on day D, and a hire record (placement or record-only, on any referral at B for client K by either key) on day D + 1 … D + 14, then the release and record timestamps are stored. The documented Ops HA-9 query in `backend.md` returns the pair, and doesn't return it for a hire on day D + 15. No admin task or flag is rendered, and nothing is shown to A or B.

### H. Authorization check (BR-37, BR-38)
- **AC-79** (BR-37) Given a contested objection or a `contested` / `in_review` hire report, then B-owner sees **Ask for an authorization check**. Sending a reason (20–2,000) creates a request visible on the admin view, and B's panel shows "Authorization check requested on {date}". A second request returns `auth_check_already_requested`. A never sees B's reason or files.
- **AC-80** (BR-37) Given the admin opens a check (from `/admin/referrals/[id]` or the hire-report detail) with requester "candidate", and the confirmation has a recent-change note **or** the challenger brought evidence, then:
  - `evidence_due_at` = now + 5 business days is stored;
  - A gets `auth_check.requested`;
  - A's referral page shows `AuthCheckPanel` with the deadline;
  - A-owner can send a statement and 1–5 files (N1 pipeline, admin-only);
  - B sees nothing of this.

  Given neither the note nor evidence, then no request goes to A and the admin decides on the record (PD-075).
- **AC-81** (BR-37, HE-12) Given the admin marks the check **invalid** (or after `evidence_due_at` with nothing sent, with **Mark invalid**), then:
  - the referral is void: it stops counting, a new submission of the same candidate to that client is no longer stopped by it, and no placement or fee is possible;
  - the consent is marked disputed;
  - the breach-review flag is set;
  - a pending report on it closes as `void` and its dispute closes;
  - A's and B's panels show the void lines (B sees no reason, PD-075);
  - a later filing returns `hire_report_unavailable`;
  - A gets `auth_check.decided`.

  It never happens without an admin action.
- **AC-82** (BR-37) Given the admin marks the check **valid**, then the check closes, nothing else changes, and A gets `auth_check.decided`.
- **AC-83** (BR-38) Given the candidate record was created within 30 days before token issuance, then "Candidate record created on {date}." shows on A's referral page (candidate-confirmation block) and on the admin views. It doesn't show for 31+ days. It never appears in any B payload or page.

### I. Flags, visibility, notifications, privacy, edge cases (BR-40 to BR-44)
- **AC-84** (BR-40 HA-1) **Moved to Ops SQL** (PD-073; definition changed by PD-075). `backend.md` documents an Ops HA-1 query. Given hiring org B has 2 hires in the last 12 months that A first reported and whose reports ended `confirmed`, `deemed_confirmed`, `upheld` **or `closed_by_record`**, then the query returns B. With 1 such hire, it doesn't. No HA-1 line, flag or count is rendered anywhere in the product.
- **AC-85** (BR-40 HA-6) Given sourcing org A has 2 rejected reports in 90 days, then it's listed with `flags.rejectedHireReports`.
- **AC-86** (BR-40) Given late records, fee-details-overdue placements, decisions past `decide_by` and `unanswered` reports, then each appears in `/admin/hire-reports` in its section, and none triggers an automatic restriction, pause or notice.
- **AC-87** (BR-41) Given any A or B member, then no page, payload or notification shows counts, rates or outcomes of another org's hire reports or answers.
- **AC-88** (BR-42) Given each event in §2.15, then the matching in-app notification goes to exactly the listed recipients (RD-036 scope), in English. Its params contain no client name or key, employer text, evidence content, resolution text or candidate identifiers (B gets the partner-visible label only).
- **AC-89** (BR-42) Given every N3 state change (record, report filed / answered / contested / rebutted / decided / deemed, fee details, notice sent, auth check opened / evidence / decided, release, flag change, admin field saves, hire-record note saves, evidence downloads), then an audit event exists whose metadata has no client name or key, employer text, evidence content or candidate identifiers.
- **AC-90** (BR-43) Given employer text and evidence, then they never appear on the candidate page, in notifications or in audit metadata. Files and links are reachable only by the uploader's org (own files) and platform admins. No scheduled job deletes them in N3.
- **AC-91** (BR-44 HE-2) Given a recorded hire whose candidate leaves in week 2, then the placement stands, and the existing guarantee and fall-off flow uses the snapshot's guarantee and remedy.
- **AC-92** (BR-44 HE-3, BR-4) **Moved to X6** (PD-074). In N3: given a referral with a hire record, then **Record hire** isn't rendered and a second record returns `hire_not_eligible` (one hire record per referral). Cancelling and re-recording are handled by Ops through support with an audit note.
- **AC-93** (BR-44 HE-11) Given B is suspended (N10 settlement mode), then B can still contest and record on in-flight referrals. If B hasn't answered when `answer_due_at` passes, the report goes to `unanswered` and is never deemed, even with delivered records for two B people. Given A is suspended, then A can still open the referral, file and rebut. If A hasn't rebutted when `rebuttal_due_at` passes, the report moves to `in_review`. The admin can decide in both cases, and admin views show the `Suspended` pill.
- **AC-94** (BR-44 HE-14) Given an internal referral, then record, report, contest, rebuttal, decision and release work with the same copy, and any placement has 0 sourcing bps.
- **AC-95** (brief §4) **Moved to Ops SQL** (PD-073). The brief §4 metrics counts are documented Ops queries in `backend.md`. `/admin` shows no **Hire records** metrics panel in N3.
- **AC-96** (§7 security) Given every new RPC and Server Action (record variants, fee details, file / contest / rebuttal / answer, release, auth check request / evidence / open / decide, admin decide / notes / notice / hire-record note, flag read), when called with another org's ids, then the result is not-found with no leak. When called by anon, it's refused. Every new RPC is on the `api-surface` allow-list, `SECURITY DEFINER` with `search_path = ''`.
- **AC-97** (BR-39, Should) Given the candidate-confirmed path, when the candidate email equals the email of any member of the source org (or is on the source org's verified non-freemail domain, if one exists), then submission is refused with a field error on the destination.
- **AC-98** (Should, employer signal) Given a report, then the admin detail shows "Employer matches a client key: Yes / No". No A or B payload contains the signal or its inputs.
- **AC-99** (§7 record scope, R-7, R-10) The N1, N2 and N9 suites, `recruiter-record-scope.test.ts` and Journey A E2E pass. Pipeline, metrics and the N1 duplicate check treat `hired`-from-any-status referrals correctly (every reader listed in `backend-estimate.md`).
- **AC-100** (i18n) Every N3 string exists in en, fr and pt with the keys in §5. Users never see "claim" for N3 objects. "Hire report" (A) and "Record hire" (B) are used as in the glossary.
- **AC-101** (§6) At 375 px, every N3 screen (S3, S5–S9, S11–S13) has no horizontal scroll, every action is ≥ 44 px and labels wrap. The keyboard paths in §6 work. Light and dark meet AA contrast.

### J. Added in rev. 2 (BR-45, BR-29, PD-072)
- **AC-102** (BR-45, BR-13) Given B-owner filed a prior-presentation objection on referral R that is `open` or `contested`, when B-owner selects **Record hire** (or drops R on **Hired**), then the dialog opens in the V0 state: the `hire.objectionOpenTitle` / `objectionOpenBody` alert and **Close**, with no form. A forged record call returns `objection_open` and writes nothing. Then:
  - after the objection is **rejected**, **Record hire** opens the normal variant. A record made within 5 business days after the decision isn't marked `late`, even if it's more than 5 business days after the start or acceptance date. After that window, AC-29 applies;
  - after the objection is **upheld** or becomes **final**, **Record hire** isn't rendered, and a forged call returns `hire_not_eligible`.
- **AC-103** (BR-29, HE-10) Given B has no active job owner on the job (deactivated or removed), and delivered, non-bounced records exist for two other B managers (seeded), when `answer_due_at` passes with no answer, then the report moves to `unanswered`, appears in the admin queue as "Unanswered: notice not delivered", and is never deemed. No placement is created, and the managers kept getting every notice and reminder.
- **AC-104** (PD-072 QA-N2-12, PD-074 Q-PM-12) Given an admin has the amendment form open on a referral whose job's salary currency then changes, when they post a flat → % amendment, then nothing is written, the existing `errors.stale_version` message shows inline, and the page refreshes (`router.refresh()`), so the form re-renders with the current % currency. A second post from the refreshed form succeeds.

### BR → AC map

| BR | ACs |
|---|---|
| BR-1 | AC-1, 2, 3, 4 |
| BR-2 | AC-5 |
| BR-3 | AC-9, 10 |
| BR-4 | AC-6, 7, 8, 92 (moved to X6) |
| BR-5 | AC-11 |
| BR-6 | AC-12, 77 |
| BR-7 | AC-6, 13, 14, 15 |
| BR-8 | AC-16, 17, 18, 19, 31 |
| BR-9 | AC-20, 21, 22, 23, 24 |
| BR-10 | AC-25 |
| BR-11 | AC-26, 27 |
| BR-12 | AC-28 |
| BR-13 | AC-29, 102 |
| BR-14 | AC-30, 70 |
| BR-15 | AC-18 |
| BR-16 | AC-33 |
| BR-17 | AC-34, 35, 36, 38, 39, 40 |
| BR-18 | AC-41, 42 |
| BR-19 | AC-44, 45, 46, 55 |
| BR-20 | AC-37 |
| BR-21 | AC-10, 47 |
| BR-22 | AC-36, 48, 49, 67 |
| BR-23 | AC-43, 51 |
| BR-24 | AC-52 |
| BR-25 | AC-53, 54, 55 |
| BR-26 | AC-56 |
| BR-27 | AC-57, 58, 59, 60 |
| BR-28 | AC-61 |
| BR-29 | AC-62, 63, 64, 65, 67, 103 |
| BR-30 | AC-66 (moved to N7) |
| BR-31 | AC-68, 69, 70, 71 |
| BR-32 | AC-72 |
| BR-33 | AC-73 |
| BR-34 | AC-74, 75 |
| BR-35 | AC-76, 77 |
| BR-36 | AC-10, 78 (moved to Ops SQL) |
| BR-37 | AC-79, 80, 81, 82 |
| BR-38 | AC-83 |
| BR-39 | AC-97 |
| BR-40 | AC-84 (moved to Ops SQL), 85, 86 |
| BR-41 | AC-87 |
| BR-42 | AC-88, 89 |
| BR-43 | AC-90 |
| BR-44 | AC-51, 91, 92 (moved to X6), 93, 94, 103 |
| BR-45 | AC-102 |
| Brief §4 metrics | AC-95 (moved to Ops SQL) |
| Must 0b (PD-072) | AC-104, AC-99 (N2 regression) |

### Brief §9.2 QA scenarios → ACs

1 → AC-1 to 4 · 2 → AC-5 · 3 → AC-6, 8, 15, 102 · 4 → AC-20, 23, 24 · 5 → AC-9, 10, 17 · 6 → AC-26 (HA-9 part: AC-78, Ops SQL) · 7 → AC-29, 30 · 8 → AC-35 to 37, 44, 45 · 9 → AC-12 · 10 → AC-47 · 11 → AC-48 · 12 → AC-52 to 54 · 13 → AC-56 · 14 → AC-58, 59, 46, 81 · 15 → AC-62 to 65, 103 (restart steps removed) · 16 → AC-66 (moved to N7, not tested in N3) · 17 → AC-68, 69, 71 · 18 → AC-72 · 19 → AC-74, 75 · 20 → AC-76, 77 · 21 → AC-79 to 83 · 22 → AC-96 · 23 → AC-93 · 24 → AC-99, 104.

---

## 8. Out of scope

- An evidence-free "did you hire X?" inquiry (RD-050). Suspicions go in referral messages.
- Workatent setting or estimating any amount. The admin never enters money (rule 7.5).
- Allocation changes on upheld money disputes, "short-paid" markers, guarantee-limited reversals (X6).
- Automatic pause or sanction of any org. The rule 6.4 ladder comes with N10. N3 records the notice only.
- Decisions across two hiring orgs on one client (RD-013, HE-5).
- Counterpart-visible hire-report statistics (RD-053).
- **A platform-share surcharge** on report-surfaced hires (U-N3-1 answered: no surcharge).
- Email notifications, reminders, delivery and bounce records (N7, PD-070). The data contract is in `backend-estimate.md`.
- N10 settlement-mode UI for hire reports (N10 adds them to its opt-in list).
- Automatic purge of evidence (counsel, N7 PIA).
- Temp-to-perm or contract splits.
- Shared-profile access expiry (X11).
- Any change to N1's duplicate-check meaning of "counts" (strategist S-N3-1, PM default: no change).
- Candidate-facing UI of any kind.
- Network Rules 6.3 / 6.4 / 7.2 text (ux-writer, step 3c; the related-org sentence per PD-076).
- **Rev. 2 removals (PD-073, PD-074):**
  - reopening a deemed confirmation (BR-30 → N7, which can't enable deemed confirmation without it);
  - restarting the answer clock (cut);
  - the related-org tick (→ admin note);
  - HA-1, HA-9 and the metrics counts in the product (→ Ops SQL until the N2.1 metrics panel);
  - cancelling a placement and re-recording after a fall-off (→ X6).

## 9. Open questions (for the PM unless noted)

> **Answered by the PM 2026-11-16 (brief rev. 2; PD-071, PD-074, PD-075).** Every default is confirmed **except Q-D17 (changed) and Q-D18 (changed)**. The spec changes to apply are in brief §12 ("Rev. 2 delta for design"). Remove the *(default, Q-D#)* tags once applied.
>
> | # | Decision |
> |---|---|
> | Q-D1 | Recorded: PD-071 (U-N3-1 no surcharge, U-N3-2 posture, U-N3-3 effort accepted). Effort reconciled to ~22.1 backend days in PD-073 |
> | Q-D2 | **Default confirmed.** B's trigger and dialog become "Record hire" / "Record a hire"; ux-writer owns the glossary (already drafted in voice-and-tone §5.8) |
> | Q-D3 | **Default confirmed.** Record-only → `hired` + S4-e banner (BR-11) |
> | Q-D4 | **Default confirmed.** Money inputs discarded on released referrals; dates and role kept (BR-11) |
> | Q-D5 | **Default confirmed.** V1 happy path unchanged; late marker uses the start date only (BR-13) |
> | Q-D6 | **Default confirmed.** `not_this_client` statement admin-only; hint on other reasons (BR-25) |
> | Q-D7 | **Default confirmed** (five values) |
> | Q-D8 | **Default confirmed** (1–5 items report, 0–5 rebuttal and contest; 5 files per filing) |
> | Q-D9 | **Default confirmed** (delivery month to current month + 3) |
> | Q-D10 | **Default confirmed.** No contest after the deadline; Record hire stays (BR-29) |
> | Q-D11 | **Default confirmed.** The `hire_report` dispute closes as confirmed by the hiring recruiter (BR-22) |
> | Q-D12 | **Default confirmed** (B sees no reason; A sees it) |
> | Q-D13 | **Default confirmed** (no note and no challenger evidence → decide on the record; matches RD-029) |
> | Q-D14 | **Default confirmed** (drop on Hired from `accepted` / `interviewing` opens the same dialog) |
> | Q-D15 | **Default confirmed** |
> | Q-D16 | **Default confirmed.** No active job owner → never deemed, admin queue (BR-29) |
> | Q-D17 | **Changed:** a report closed by B's own record **counts** for HA-1 (it was first reported by A). HA-1 is Ops SQL in N3 (PD-069 cut 3), so AC-84 becomes a documented query, not a UI flag |
> | Q-D18 | **Changed:** **refused** while B's own objection on that referral is open or contested (`objection_open`, BR-45); after a rejected objection, a record within 5 business days isn't late. Add the result state and an AC |
> | S-N3-1 | Still open with the strategist; no N1 change |
>
> **Applied by the designer 2026-11-16:** brief §12 items 1–5 and PD-073 to PD-076 are in this spec. Every *(default, Q-D#)* tag is resolved, and the spec is frozen for copy. No design question is open.

Original questions, kept for traceability:

| # | Question | Default in this spec | Affects |
|---|---|---|---|
| **Q-D1** | Record the user's 2026-11-16 checkpoint answers (U-N3-1 no surcharge; U-N3-2 flag off in production, Q-2 to Q-4 as launch-gated drafts) in `docs/product/decisions.md`. Also confirm the **U-N3-3 effort** answer: it wasn't included in what I was given. | Build assumes no surcharge and flag off | — |
| **Q-D2** | **Terminology (PM + ux-writer).** Rename B's "Report hire" to "Record hire" so it doesn't collide with A's "Report a hire", and update the glossary entry "hire report" (today it describes B's hire). Copy only; BR-7 behaviour unchanged. | Renamed | AC-13, AC-100, §5.2 |
| **Q-D3** | Does a **record-only hire** (released referral, or flag off) move the referral to `hired`? BR-7 says the referral moves to `hired` but BR-11 doesn't say. `hired` with no placement touches pipeline and metrics readers (R-10). | Yes, `hired` + the S4-e "recorded without a split" banner | AC-23, AC-26 |
| **Q-D4** | On a **released** referral, B fills the same form as a normal one (so the release isn't revealed before the record, N1 BR-25). Are the money inputs stored or discarded? | **Discarded**: not stored, no split | AC-26 |
| **Q-D5** | The **happy-path** V1 dialog stays unchanged (BR-7), so it has no acceptance date, other-role or sister-org field. The late marker on V1 then uses the start date only. Accept, or add the acceptance date to V1? | Unchanged; start-date rule only | AC-13, AC-29 |
| **Q-D6** | **Security (rule 4.5).** BR-25 lets A read B's contest statement. For `not_this_client` that free text is the likeliest place for B to name its client. Proposal: B's statement is **admin-only for `not_this_client`** (A sees the reason "Not this client" only). For the other reasons, a hint asks B not to name the client. | Admin-only for `not_this_client` | AC-55, §2.6, §4 |
| **Q-D7** | Values of "how A learned" (BR-18 says enum without values). | The candidate told me · public profile change · company announcement · a mutual contact · other | §5.3 |
| **Q-D8** | Limits on evidence **items** per report and rebuttal, and whether the 5-file cap is per filing (report, rebuttal and contest each get their own 5). | 1–5 items (report), 0–5 (rebuttal); 5 files per filing | AC-41, AC-42 |
| **Q-D9** | Allowed range for the **approximate start month**. | Delivery month to current month + 3 | AC-41 |
| **Q-D10** | After `answer_due_at` (report `unanswered`), can B still contest? BR-22 keeps B's record open. | No contest; **Record hire** still available | AC-54, AC-67 |
| **Q-D11** | BR-22 + BR-21: when B records while a report is **contested / in dispute**, does the `hire_report` dispute close too? | Yes, closes as confirmed by the hiring recruiter | AC-48 |
| **Q-D12** | On **void**, what does B see? Saying "confirmation invalid" tells B about a breach finding against A. | B: "Closed by a platform admin. This referral no longer counts." (no reason). A: with the reason. | AC-81 |
| **Q-D13** | Authorization check with **no** recent-change note and **no** challenger evidence: does the admin still ask A for evidence, or decide on the record? | Decide on the record (no request to A) | AC-80 |
| **Q-D14** | Pipeline: may B drop a card on **Hired** from `accepted` / `interviewing` (not only `offer`)? | Yes, the same dialog | AC-32 |
| **Q-D15** | What the admin overview **Hire reports** tile counts. | "To decide" + fee-overdue tasks without a notice sent | §2.9 |
| **Q-D16** | Deemed condition when the **job owner is deactivated** (HE-10): BR-29 requires the job owner's delivered email. Two managers don't qualify. | Never deemed: admin queue | AC-64 |
| **Q-D17** | HA-1 counts hires "first reported by A and confirmed, deemed or upheld". Does a report closed by B's own record (`closed_by_record`) count? | Doesn't count (B self-recorded) | AC-84 |
| **Q-D18** | B recording a hire on a referral where **B's own prior-presentation objection** is open or contested: allowed? The brief has no rule. | Allowed; the objection and its dispute continue, and the admin sees both | §2.3 |
| — (strategist) | S-N3-1 is still open (brief §8.2). | No N1 change | — |
