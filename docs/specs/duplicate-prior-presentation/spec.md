# Duplicate and prior-presentation protection (N1)

Status: draft (for ux-writer-marketing §5, backend, frontend)
Slug: `duplicate-prior-presentation`
Inputs: [`brief.md`](./brief.md) **rev. 3** (final), [`recruiting-input.md`](./recruiting-input.md), RD-013 to RD-018, PD-013 (+ addendum) to PD-020, engineering constraints EC-1 to EC-8 (brief §7.1).
Owner: Product Designer · 2026-11-12 (updated for brief rev. 3)

> **How to read this spec.** BR-# are the brief's business rules and EC-# its engineering constraints. This spec doesn't change any of them. Where a screen needs a rule the brief doesn't give, the question is listed in §9 with the default the build uses until the PM answers.
> **Full scope (PD-016):** the job scope and the client scope (BR-3a and BR-3b) both ship in this release. The build fallback isn't used, so every AC applies.
> **"Delivered"** always means `referrals.delivered_at` is set (EC-2), never `submitted_at`.
> **⚖️ draft** marks strings that ship as drafts until counsel signs off (C-1, C-3, C-6).
> **Terminology (ux-writer, §5):** users see **prior-presentation objection** / **objection** (fr "objection pour présentation antérieure", pt "objeção por apresentação anterior"). "Claim" is reserved for N3. Code, key and column names (`claim*`, `claim_deadline_at`, `claim_rejected`, `prior_presentation`) stay unchanged. Where this spec still says "claim" in engineering notes, ACs or table names, it means the same object; every visible label comes from §5.

**Rev. 3 changes in this spec:**
- Submit outcomes are results, not error toasts (EC-1).
- The pending warning is an explicit two-step submit (BR-7, PD-020).
- Evidence files go uploading → processing → ready / rejected, and the claim can be filed only when every file is ready (BR-15, EC-4).
- The job form explains the internal-only client name (BR-32, PD-017).
- The release flag is hidden from the hiring side, in the UI and the API (BR-25, PD-020).
- The candidate page has an `already_sent` result (EC-1).
- Internal referrals need no special UI (BR-31, PD-020).
- New ACs: AC-63 to AC-74.

**Rev. 4 changes (brief §9 "Rev. 4 in-flight deltas", RD-019 to RD-021, PD-021 to PD-023):**
- Release later is a **Must**, with a two-step confirmation (S2-g, S3b).
- Three release guards (delivered, still counts, no open dispute) hide the option at both entry points (2.3).
- The hiring side sees "Withdrawn" or "Cancelled" as-is.
- The internal-hit attribute is admin-only, with no UI (§4).
- The job-form helper adds the "what you lose" angle and stays optional (BR-32).
- Q-7 to Q-9 are closed (§8).
- AC-22 was rewritten. New ACs: AC-22a and AC-75 (Should). AC-19, AC-70 and AC-72 were extended for scenarios 42 to 46.

**Rev. 4.2 changes (QA round 1, PD-029 to PD-033):**
- Referral evidence is judged at the objected-to referral's delivery (AC-31, S5 picker; R-18 in §4 and AC-68).
- N1 notifications are in-app only, and emails are deferred (S10, AC-17, AC-57).
- The upload indicator may be indeterminate (AC-65, S5).
- The stop reference is a random token (AC-5, S1-d).
- Expired candidate requests aren't pending (new AC-76).
- R-19 is recorded in §4.
- The scenario map covers 47 to 49.

**Rev. 4.1 changes (PM answers to Q-D1 to Q-D10, PD-024 to PD-028):**
- Admin "same person" block on referral-evidence disputes only. Admin file download only on claims with a dispute (S8, §4, AC-43, AC-44).
- Stop reference on every stop; support line hidden without an address; mailto with a subject and no body (S1-d, AC-5).
- The contest reason hint says admins only (S2-d).
- Closure notification falls back to the sourcing org's owners and admins (S10, AC-17).
- Revoked referrals are claim-eligible and can be used as evidence (AC-27, AC-31, S2-i, S5).
- §9 marks every Q-D answered.

---

## 1. Problem & users

Today the same person can be submitted to the same hiring partner twice. One way is through two candidate records (two orgs, or twice in one org). Another is through a second job at the same client. A hiring recruiter can also decline with "duplicate" without any evidence or deadline, and the sourcing recruiter can't push back. N1 makes "first confirmed presentation wins" true in the product (brief §1, §4).

| Role | Org role(s) | Job to be done in N1 |
|---|---|---|
| **Sourcing recruiter** (org A) | Recruiter, recruiter manager, organization admin (all hold `referrals:submit`) | Learn, before the candidate is contacted, that the candidate was already presented to this hiring partner for this client. Hold first position after withdrawing, unless they choose to release it. See any prior-presentation claim against their referral and contest it for free. |
| **Hiring recruiter** (org B) | Same three roles (all hold `referrals:review`) | Not receive the same person twice. File an evidenced prior-presentation claim in under 2 minutes, within 5 business days. |
| **Platform admin** | `/admin` | Resolve contested claims from the existing disputes queue, with the evidence. See organizations whose pattern looks abusive (Should). |
| **Candidate** (not a user) | Private confirmation page `/candidate/[token]` | Be contacted once per job/client. If they confirm a referral that has already been beaten to delivery, see a calm "already sent" page. |
| **Other organizations** (org C) | — | See nothing. The check never runs across hiring orgs (BR-3). |

---

## 2. Flows

### 2.1 Submit a referral: duplicate check (BR-1, BR-3 to BR-10, BR-22 to BR-24)

Entry: Opportunities › a match › **match-review screen**, which is the composer (`/workspace/[orgSlug]/opportunities/[matchId]`, `SubmitReferralForm`). Both authorization paths ("candidate confirms by email" → `submit_referral_for_candidate`, and "recorded authorization" → `submit_referral`) live in this one form. It's the only place a referral is submitted today, so every state below applies to both paths on this screen. If another submit entry point is added later, it must render the same result states.

**Outcomes are results, not errors (BR-6, EC-1).** Both submit RPCs **return** one of `created` / `stopped` / `pending_warning` / `identifier_required` instead of raising. The Server Action passes the outcome to the form as a typed result: no `toast.error`, no generic `FormMessage`. The form renders the matching result state in the submit panel (S1-b, S1-c, S1-d). Only real failures (rate limit, expired opportunity, version conflict, network) use the existing error display.

**Happy path (no hit)**
1. The sourcing recruiter opens the composer. The submit panel shows a short note that Workatent checks contact details for duplicates (`referrals.form.duplicateCheckNote`).
2. They select **Submit candidate**. The server runs the existing preconditions (active candidate owned by the caller, open job, sharing authorization, ≥ 1 usable identifier), then the duplicate check under the per-hiring-org lock (EC-3), then creates the referral. Outcome `created`: the current redirect to the referral page with `?submitted=1` or `?awaiting=1` is unchanged.

**Pending warning: two-step submit (BR-7, PD-020, EC-1)**
1. **Step 1:** submit → the server finds a hit **only** against a pending referral (`awaiting_candidate`). The call returns `pending_warning`. It creates no referral, sends no email and records no authorization; its only side effect is the audit event.
2. The submit panel shows the pending warning (§3, S1-c), with an **acknowledgement checkbox** (unticked): "I understand. Submit this referral anyway." **Submit anyway** is disabled until the box is ticked. **Cancel** sits next to it.
3. **Step 2:** **Submit anyway** sends the same form again with the acknowledgement argument (`acknowledgePendingWarning=true`) and the same idempotency key. The server re-runs the **full** check:
   - still only pending → `created` (normal redirect);
   - a presentation now exists (the other referral was delivered in between) → `stopped` (S1-d);
   - an identifier became unusable → `identifier_required` (S1-b).
4. **Cancel** clears the warning and the tick and restores the normal submit button. Nothing was created.
5. If the user edits the authorization method, fields or documents after step 1, the acknowledgement stays (it concerns candidate × job, not the payload). Reloading the page drops it, and step 1 runs again.
6. Both calls count against the 30/h submission limit (BR-22).

**Stop (BR-6, BR-24)**
1. Submit (step 1 or step 2) → the hit matches a presentation (BR-4), or a sticky-stop record applies (BR-24). The server creates no referral, sends no candidate email and sends nothing to the hiring side. It writes the sticky-stop record and the audit event, which persist because the outcome is returned rather than raised (EC-1), and returns `stopped`.
2. The submit panel is replaced by the stop state (§3, S1-d): one neutral message, what to do next (**Back to opportunities**), and a support path with an opaque reference (PD-025; hidden if no support address is configured).
3. The rest of the composer stays visible but has no submit button. Reloading the page shows the normal composer again. A new attempt hits the sticky stop and shows the same stop state.
4. The stop response is the **same** whether the match was on this job or on another job at the same client, whether the earlier referral came from the submitter's org or another, and whether it is a live presentation or a sticky stop (BR-9, BR-24).

> Backend note (not a design decision): a stop should leave nothing behind except the audit event and the sticky-stop record. Today the recorded path inserts a new `candidate_consents` row **before** calling `submit_referral` (`src/features/referrals/actions.ts`). Run the check first, or in the same transaction.

**Identifier required (BR-10)**
- *Client side (before submit):* the candidate has no email, no phone and no LinkedIn URL. The submit panel shows the "Add contact details" banner (§3, S1-b) with **Edit candidate**, and **Submit candidate** is disabled.
- *Server side (always):* if no identifier is usable (for example, the only phone number can't be normalised to E.164), the call returns `identifier_required`, sends nothing and writes the audit event. The form renders S1-b in the submit panel (a result state, not an error toast) with the same **Edit candidate** link. A forged call without identifiers gets the same outcome. Identifiers are always read from the stored candidate row inside the database (BR-1), so extra or forged arguments can't change the result.

### 2.2 Delivery re-check and "already presented" closure (BR-8)

1. A candidate-confirmed referral waits in `awaiting_candidate`. The candidate opens the private link and may edit their profile (for example, their phone number), then confirms.
2. At confirmation, `respond_candidate_request` runs the check (BR-3, BR-24) again under the per-hiring-org lock (EC-3), with the identifiers as they are now (the row as edited on the page).
3. **No hit:** delivered as today. `delivered_at`, `claim_deadline_at` and the client-key snapshot are set in the same transaction (BR-8). The page shows the existing "Referral confirmed" state.
4. **Hit against a presentation** (including the other referral of a race that was delivered first, R-4, A-8): the referral moves to the closed status `already_presented`, with no `delivered_at`. The hiring side never sees it (no row, count, notification or audit entry). A sticky-stop record is created.
   - `respond_candidate_request` returns the result **`already_sent`** (EC-1). The confirmation form doesn't show an error. The page re-renders as the terminal **already sent** state (§3, S7). Reopening the link later shows the same state; the confirm form never shows again.
   - The submitting recruiter gets an in-app notification (no email in N1, PD-030; fallback recipients per S10). The referral page shows the neutral closure banner (§3, S2-b).
5. Recorded-authorization path: delivery happens at submission, so the submission check *is* the delivery check. A concurrent race between two submissions resolves in the database: the first one commits and the second is stopped (2.1 stop flow).

### 2.3 Withdraw, with an optional release (BR-4, BR-25)

Release has **two entry points with one rule**, and both are **Must** (BR-25, RD-019, PD-021):
1. the withdraw dialog, on a live referral;
2. **Release later**, on a referral that is already `withdrawn` or `cancelled`.

**Release guards (both entry points).** The release option is shown only when **all three** hold:
- **(a) Delivered:** `delivered_at` is set.
- **(b) Still counts** (BR-4): inside its ownership window, not already released, no prior-presentation claim against it upheld or final, not `already_presented`.
- **(c) No open dispute** on it: no referral-level dispute, and no placement dispute on a placement from it.

If any guard fails, the option is **hidden**, not shown disabled, and no explanation is shown. The release RPC (and withdraw with release) re-checks all three server-side. A call from the hiring side or another org gets "Referral not found."

Entry: referral page (sourcing side) › **Withdraw**. The button already exists in the transition bar.

1. **Never delivered** (`awaiting_candidate`, or any referral without `delivered_at`): unchanged. The existing dialog has no release option, because guard (a) fails.
2. **Delivered** (`submitted`, `under_review`, `info_requested`, `accepted`, `interviewing`, `offer`): the new **Withdraw dialog** opens (§3, S3). It contains the release checkbox only if guards (b) and (c) also hold; otherwise it shows the reason field alone. Contents:
   - the reason field (required, as today);
   - a separate checkbox, **unticked**: "Also release this candidate for this client" ⚖️ draft, with the consequence written below it.
3. **Not ticked** → **Withdraw** withdraws the referral as today. The referral keeps first position until its ownership window ends (BR-4). The dialog says so in one line.
4. **Ticked** → the primary button becomes **Continue**. Step 2 of the same dialog asks "Release this candidate for this client?" and states the consequence and that it can't be undone. The user can go **Back** (reason and tick are kept), **Cancel** (closes the dialog, nothing changes) or **Withdraw and release**.
5. On confirmation, the server withdraws and releases in one transaction, flags the referral `released` and writes the audit event. The hiring side gets only the existing withdrawal notification. The toast says "Withdrawn and released."
   - **Visibility (BR-25, PD-020):** the release flag and every "released" wording are shown only to the sourcing side and platform admins. The hiring side sees the status as it is, `Withdrawn` or `Cancelled`, and nothing more, everywhere (queue, referral page, timeline, ownership footer, pipeline, notifications), and the flag can't be read from the hiring side's `referrals` select or any RPC it can call. The hiring side's ownership footer keeps the standard "Ownership protected until {date}." line even when the referral was released, so the footer doesn't reveal the release.
6. **Release later (Must, RD-019, PD-021):** on a referral that is `withdrawn` (by the sourcing side) or `cancelled` (by the hiring side, so the sourcing side never saw a withdraw dialog), when guards (a), (b) and (c) all hold, the sourcing side sees **Release candidate** in the action bar (§3, S2-g).
   - **Step 1:** dialog "Release this candidate for this client?" with the same consequence wording as the withdraw dialog's release option, and **Cancel** · **Continue**.
   - **Step 2:** an explicit second confirmation with irreversible wording ("You can't undo this."), and **Back** · **Cancel** · **Release permanently**.
   - On confirm: same `released` flag, same audit event, **no** notification to the hiring side. Toast "Candidate released for this client." The button disappears, and the sourcing side's ownership footer reads "Released on {date}…".
   - If a guard stops holding while the dialog is open (for example, a dispute was just opened), the server refuses with `release_not_allowed`. The dialog shows the inline error, and closing it refreshes the page, so the button is gone.
   - **Not in this release:** release from `declined` or `rejected` referrals (first follow-up, PD-021), and release from a live referral without withdrawing (never). The hiring side can never release or ask for a release.

### 2.4 Hiring side: file a prior-presentation objection (BR-11 to BR-15, BR-17, BR-26 to BR-28)

> **Terminology:** the user-facing term is **prior-presentation objection** / **objection** (ux-writer, §5). "Claim" is reserved for N3. BR text and code identifiers (`claim*`, `claim_deadline_at`, `prior_presentation`, the `claims` table) keep the word "claim". This spec uses "objection" for what users see and keeps "claim" only in identifiers and BR quotes.

Entry points (single referral only, never bulk, BR-14):
- **Review panel** (Referrals › Received › select a referral) › **Decline** → the decline dialog shows a callout at the top: "Already had this candidate for this client?" with **File objection**. Selecting it swaps the dialog content to the objection form. **Back to decline reasons** returns to the decline reasons.
- **Referral page** (hiring side) › **File objection** in the action bar, placed with the negative actions.

The entry points appear only when every condition holds (AC-27): the viewer is on the hiring side; status is `submitted`, `under_review` or `info_requested`; now < `claim_deadline_at`; no objection was ever filed on this referral; the referral isn't flagged "objection rejected" (`claim_rejected`).

**Happy path, file evidence**
1. The form header shows the deadline: "{when} ET · N business days left" (BR-17).
2. **Evidence**: radio group, **Upload files** (default) or **Use an earlier Workatent referral**.
3. **Upload area.** The objection deadline is repeated **right next to the upload area**, as one line above the file button (`claim.uploadDeadline`). Users can add 1 to 5 files (PDF, PNG or JPEG; up to 10 MB each; PD-028). **Each file uploads as soon as it is selected**, before the objection is filed (EC-4). Each file row goes through these states:
   - **Uploading** (an in-progress indicator, indeterminate allowed, with the text "Uploading"; a percentage isn't required, PD-033; **Cancel upload**) →
   - **Processing** (spinner, "Checking and fingerprinting…": the worker scans the object and computes its SHA-256; nothing comes from the browser) →
   - **Ready** (check icon, size, uploaded {when} ET, the short SHA-256 shown once the worker sets it) **or**
   - **Rejected** (the scan or allow-list refused the file: "This file can't be used. Remove it to continue.", with **Remove** as the only action). A rejected file blocks submission until it is removed.
   - **Upload failed** (network or size): "Upload failed", with **Try again** and **Remove**.
   Every row has **Remove** (except while processing, where removal still works but discards the object). Rows update by polling the file's status (every 2s while any file is processing; frontend decides the mechanism). The upload list has `aria-live="polite"`.
4. **Date the candidate was last in process with this client**: date input. The allowed range is from (delivery date − 6 months) up to the day before the delivery date, both from `delivered_at` in ET (PD-028). The hint shows the range as dates.
5. **Note** (optional, up to 2,000 characters). The hint says the sourcing recruiter will see it.
6. **Attestation** checkbox, required ⚖️ draft.
7. **Decline and file objection** stays **disabled until every attached file is Ready** (and at least one file is attached on the file path). While it's disabled, a status line above the buttons says why (`claim.file.waiting` / `claim.file.removeRejected` / `claim.file.none`). The button has `aria-describedby` pointing to that line. Other validation (date, attestation) runs on submit with field errors, so those rules are announced rather than silently blocking.
8. On submit, the server validates everything (BR-12), checks that every file is `clean` and hashed (EC-4), and checks the deadline **now**, at filing time; upload time doesn't count (BR-15). It then declines the referral with reason `prior_presentation`, stores `contest_deadline_at` (10 business days, BR-16, BR-28), notifies the sourcing side with that deadline and writes the audit event.
9. The dialog closes. Toast `claim.messages.filed` ("Objection filed. {partner} can contest it until {when} ET."). The queue moves to the next referral, as a normal decline does.

**Happy path, referral evidence (BR-26)**
- Step 2 → **Use an earlier Workatent referral**. A picker lists only referrals that **this org received** for the same job, or for a job with the same client key, that were **delivered before** this referral's `delivered_at` and counted **at that delivery** (in window, not released then), with no upheld or final objection now (BR-26 rev. 4.2, PD-029; full rule in S5 item 5). Internal referrals qualify like any other (BR-31), and so do referrals whose sharing authorization was revoked, as long as they still count (PD-028). Each option shows what the hiring side can already see about that referral: the candidate label, job title, sourcing partner, delivery date and status.
- The prior-process date field is replaced by a read-only line: "Date used: {date} (the earlier referral's delivery date)."
- The rest is the same as the file path. The server re-checks the referral's eligibility on submit.

**Unhappy paths**
- No qualifying earlier referral: the referral option is disabled, with the hint "No earlier referral for this job or client qualifies."
- Validation (inline, field-level; the form keeps the files): no file, date out of range, attestation unticked, file type or size not allowed (refused before upload starts, when detectable client-side).
- A file is still processing or was rejected, and the user forces a submit (a forged call): the server refuses with `claim_files_not_ready`. The UI never sends this, because the button is disabled.
- Closing the dialog with files uploaded but no objection filed discards the uploaded objects. Reopening starts blank (existing `DeclineDialog` unmount behaviour). Orphan objects are cleaned up server-side.
- The deadline passes while the dialog is open (for example, a file is still processing at 23:59 ET): the server refuses with `claim_window_closed`. An inline error at the top of the form says when the window closed and that the user can still decline for another reason. **Back to decline reasons** is offered.
- The referral changed meanwhile (accepted by a colleague, withdrawn): version conflict. The error says the referral changed and the dialog offers a refresh.
- An objection already exists (two tabs): `claim_already_filed`.
- The picked referral no longer qualifies (released, upheld, or the race lost): `claim_referral_invalid`. "Pick another or upload files."
- Rate limit (10/h per user, BR-19): the generic rate-limited error.

### 2.5 Sourcing side: see an objection and contest it (BR-15, BR-16, BR-18, BR-20)

1. Notification (`claim.filed` kind; §5.10 text): {partner} filed a prior-presentation objection on {candidate label}, with the contest deadline. Selecting it opens the referral page.
2. Referral page, sourcing side: the status shows `Declined`. The next-step banner reads "Declined by {partner}: prior presentation", and the **Prior-presentation objection** panel appears under it (§3, S2-d).
3. The panel shows **only**: filed date and time; declared prior-process date; evidence type; per file, "File N", upload time and SHA-256 (no file name, no file type, no download); the note; the contest deadline with business days left. For referral evidence it shows "Earlier referral through Workatent" and the prior-process date only.
4. **Contest objection** opens a dialog with a required reason (5 to 2,000 characters) and the hint that only Workatent admins read it. Confirming opens a referral-level dispute of type `prior_presentation`, notifies both sides and puts the dispute in the admin queue. The panel shows "Contested on {date}. A platform admin is reviewing the objection."
5. **No contest by the deadline:** the objection becomes **final**, with no notification. The panel shows "Final: not contested by {when} ET." The referral stops counting, so another partner may now present the candidate.
6. **Upheld / rejected:** both sides are notified with the admin's written resolution. The panel shows the outcome and the resolution text.

### 2.6 Platform admin: resolve a contested objection (BR-16, BR-18)

1. `/admin` › Needs attention › Open disputes (the count now includes referral disputes) → `/admin/disputes`.
2. Open disputes are listed as today. Each card has a type badge, **Placement** or **Prior presentation**.
3. A prior-presentation card shows (§3, S8): the two organizations (objecting hiring org, contesting sourcing org), job title, delivery date, objection date, prior-process date, evidence type, the hiring side's note, the sourcing side's contest reason, the files (download through a 60-second signed URL, audited), and for referral evidence both referrals side by side. It also shows a "Resolve by" hint (5 business days after the contest, from the §4 target).
4. **Uphold objection** (objection valid) or **Reject objection** (objection invalid). Each opens a confirm dialog that states the effect and requires a written resolution (5 to 2,000 characters). The hint says both organizations will read it.
   - Uphold: the decline stands, the referral stops counting and is flagged `prior_presentation_upheld`, and the ownership date is unchanged.
   - Reject: the referral returns to `submitted`, is flagged "objection rejected" (`claim_rejected`) and gets a fresh review-clock start (stored for N4). No further objection is possible and the ownership date is unchanged.
5. The dispute moves to **Recently closed** with its type and outcome.

### 2.7 Hiring side after a rejected objection (BR-18, BR-27)

- The referral is back in **Received › To review**. Its row has an "Objection rejected" chip. The review panel and the referral page show a banner explaining that a platform admin found the objection invalid and that the hiring side can accept or decline for another reason.
- The decline dialog has **no** objection callout for this referral, and the referral page has no **File objection** button.
- The sourcing side sees "Objection rejected on {date}. This referral is back with {partner} for review." They may withdraw (with or without release) and keep first position if they don't release.

### 2.8 Platform admin: abuse flags and metrics (Should, BR-29, brief §4)

- `/admin` overview gets an **Organizations to review** panel. It lists organizations with more than 5 stops in 7 days (as sourcing side) or 2 rejected claims in 90 days (as hiring side). Each row links to `/admin/organizations/[orgId]`. Flags only; no automatic action.
- `/admin` overview gets a **Duplicate protection** metrics panel with the §4 counts (last 30 days).

### 2.8a Hiring side: client name on the job form (BR-23, BR-32, PD-017)

Entry: Jobs › New job (`/workspace/[orgSlug]/jobs/new`) and Jobs › job › Edit (`/workspace/[orgSlug]/jobs/[jobId]/edit`). Both use `JobForm`.
1. The "Hiring client" field (`clientName`) and the "Hide client" checkbox (`clientConfidential`) stay as they are, including today's rule (name required only when the job isn't confidential, `jobs.validation.clientRequired`).
2. **When "Hide client" is ticked** (the default today), helper text appears under the client name field: `jobs.form.clientInternalHint`. It says:
   - the name is internal only: never shown to partners, and platform admins see it only when resolving a dispute;
   - it's used to catch duplicate referrals across your jobs for this client;
   - what the hiring org loses without it: protection on this job only, so it can receive the same person again for the client's other roles, and it can't cite an earlier Workatent referral from another job as evidence (BR-26, RD-020; final wording by ux-writer).

   The field stays **optional**: no new validation, no "required" marker, no blocking, and the wording must not suggest it's required (BR-32). Becoming required on referral-open jobs is an N3 prerequisite (PD-023), not N1.
3. When "Hide client" is unticked, the existing behaviour stays (name required, shown to partners). A second, shorter hint explains the duplicate benefit: `jobs.form.clientDuplicateHint`.
4. The hint switches immediately when the checkbox changes (client-side), and the field is linked to the current hint with `aria-describedby`.
5. Nothing about the key is ever shown: no "key" wording, no "matched" indicator, no preview of the normalised name (BR-23, EC-6). The key is computed by a database trigger on every write, including connector and `/api/v1/jobs` writes, which get no UI (BR-23).

### 2.8b Internal referrals (BR-31, PD-020)

Internal referrals (`referrals.internal = true`, between related orgs that share a member) follow every flow above **with no special UI**: the same stop, warning, sticky stop, closure, release, claim, contest and admin resolution, with the same copy. The existing internal-commission note on the referral page is unchanged. No surface tells a user that a stop, a claim's referral evidence or a picker entry is internal. The admin dispute card shows the existing referral fields; when the referral is internal, an "Internal" text label next to the org names is allowed there only, because admins already see both orgs.

### 2.9 Unhappy paths across flows

| Case | Behaviour |
|---|---|
| **No permission** | All three org roles hold `referrals:submit` and `referrals:review`, so they behave the same. A member of the *other* side calling a side-specific action (for example, the sourcing side calling "file claim", or the hiring side calling "contest" or "release") gets "Referral not found." (existing `referrals.errors.notFound`, no leak). Non-admins on `/admin/*` get the existing 404. |
| **Empty** | Referral picker with no qualifying referrals (2.4). Admin disputes with no open disputes: the existing empty state, with updated hint copy. Abuse flags with none: "No organizations flagged." Claim note empty: "No note." |
| **Invalid input** | Field-level errors in the claim form, contest dialog, withdraw dialog (reason) and admin resolution, following the existing `FormField` / `ConfirmDialog` patterns. |
| **Rate-limited** | Submission 30/h (stops, pending warnings and identifier refusals all count). Claims 10/h per user. Contests share the disputes bucket (5/h). Release has no limit of its own. The existing `errors.rateLimited` copy is shown inline in the active form or dialog. |
| **Revoked authorization** | A referral whose sharing authorization was revoked still counts as a presentation (BR-4 lists no exception). A claim on a revoked referral is allowed while status and deadline allow it, and a revoked referral that still counts is eligible as referral evidence (PD-028). The revoked banner stays as today. |
| **Expired** | Claim window passed: the claim entry points disappear (BR-13). Contest window passed: the contest button disappears and the claim shows as final. The candidate link expired before confirmation: the existing "expired" page; no delivery, no check. |
| **Suspended org** | Suspended orgs can't act (existing `app.is_member`). Deadlines don't pause. A claim against a suspended sourcing org becomes final if nobody contests it. Admins can still resolve disputes that involve a suspended org. |
| **Ownership window ended / guard fails** | The referral no longer counts (BR-4), or a dispute is open on it. The release option is hidden in the withdraw dialog and in Release later (guards a to c, 2.3). |
| **Candidate anonymized** | Pending O-1 (user). No UI change in N1. |

---

## 3. Screens & states

No new routes. Every surface extends an existing screen. **New** = new component; **Extended** = an existing component or page that changes.

| # | Screen / component | Route | New / extended | Components (`src/components/ui` + shared) |
|---|---|---|---|---|
| S1 | Referral composer, submit panel | `/workspace/[orgSlug]/opportunities/[matchId]` (`SubmitReferralForm`) | Extended | `Alert`/`AlertTitle`/`AlertDescription`, `Button`, `Panel`, `SubmitButton`, `FormMessage` |
| S2 | Referral page (both sides) | `/workspace/[orgSlug]/referrals/[referralId]` | Extended | `Panel`, `StatusPill`, `Button`, `Tooltip` (copy feedback), `ConfirmDialog` |
| S2-d | Prior-presentation claim panel + contest dialog | inside S2 | **New** (`ClaimPanel`, `ContestClaimDialog`) | `Panel`, `StatusPill`, `Button`, `ConfirmDialog` (reason) |
| S3 | Withdraw dialog with release | inside S2 (`TransitionButtons`, `withdrawn`) | **New** (`WithdrawDialog`, replaces the generic `ConfirmDialog` for `withdrawn` only) | `Dialog`, `Textarea`, `Checkbox`, `Label`, `Button` |
| S3b | Release later, two-step (Must) | inside S2, on `withdrawn` / `cancelled` | **New** (`ReleaseDialog`) | `Dialog`, `Button` |
| S4 | Received queue: row, review panel, decline dialog (single + bulk) | `/workspace/[orgSlug]/referrals?tab=received` | Extended | `DeclineDialog`, `ReviewPanel`, `QueueRow`, `StatusPill` |
| S5 | Prior-presentation claim dialog | from S4 and S2 | **New** (`PriorPresentationClaimDialog`) | `Dialog`, `RadioGroup`, `Input type=file`, `Input type=date`, `Textarea`, `Checkbox`, `FormField`, `Button` |
| S5-x | Business-day deadline | S2-d, S5, S7 | **New** (`BusinessDeadline`, shared with N4) | text + `Clock` icon |
| S6 | Sent list | `/workspace/[orgSlug]/referrals?tab=sent` | Extended | `StatusPill` |
| S7 | Candidate confirmation page | `/candidate/[token]` | Extended | `Panel` |
| S8 | Admin disputes | `/admin/disputes` | Extended (+ **new** card variant `ReferralDisputeCard`, resolution buttons) | `Panel`, `StatusPill`, `Badge`, `ConfirmDialog`, `Button` |
| S9 | Admin overview: flags + metrics (Should) | `/admin` | Extended (+ **new** panels) | `Panel`, `SectionTitle`, `StatusPill` |
| S10 | Activity / notifications, emails | `/workspace/[orgSlug]/notifications`, email | Extended (new kinds) | existing |
| S11 | Job form, client name hint | `/workspace/[orgSlug]/jobs/new`, `/workspace/[orgSlug]/jobs/[jobId]/edit` (`JobForm`) | Extended | `FormField` (`hint`), `Checkbox` |

### S1 Referral composer, submit panel

The changes are confined to the "Submit to {partner}" panel in the right column (`aside`). Each state replaces or augments that panel's bottom area. S1-b (server-side), S1-c and S1-d are **result states** driven by the action's returned outcome (`identifier_required`, `pending_warning`, `stopped`). They never appear as a toast or in the generic `FormMessage` (EC-1). The same states apply to both authorization paths.

| State | What shows |
|---|---|
| **S1-a Default** | As today, plus one muted line above the submit button with a `ShieldCheck` icon: `referrals.form.duplicateCheckNote`. |
| **S1-b No identifier** (client knows: no email, no phone and no LinkedIn on the candidate) | A warning `Alert` at the **top** of the panel: title `form.identifierRequired.title`, body `form.identifierRequired.description`, link-button **Edit candidate** → `/workspace/[orgSlug]/candidates/[candidateId]/edit`. **Submit candidate** is `disabled` and has `aria-describedby` pointing to the alert. `ComposerCandidate` needs a `hasLinkedin: boolean` (the URL itself isn't needed). The server-side refusal (`identifier_required`, for example an unusable phone) renders the same alert in place of `FormMessage`. |
| **S1-c Pending warning** (step 1 result) | A warning `Alert` above the submit button (`role="alert"`, focus moved to it): title `duplicate.pendingTitle` (**override `AlertTitle`'s `line-clamp-1`** with `line-clamp-none whitespace-normal text-pretty`; the fr title is about 50 characters plus `{partner}`, §5.11), body `duplicate.pendingDescription`. The same override applies to every N1 `AlertTitle` (S1-b, S1-c, S1-d). Under it, a `Checkbox` + `Label` `duplicate.acknowledge` (unticked, required). Buttons: **Submit anyway** (`duplicate.submitAnyway`, primary, full width, **disabled until the box is ticked**, `aria-describedby` → the alert; pending label "Submitting…") and **Cancel** (ghost). Ticking sets `acknowledgePendingWarning=true` on the next submit. If step 2 returns `stopped` or `identifier_required`, S1-c is replaced by S1-d or S1-b. |
| **S1-d Stopped** | The panel body below the heading is replaced by a neutral `Alert` with the `Info` icon (not destructive styling; this isn't the user's error): title `duplicate.stopTitle`, body `duplicate.message`, then `duplicate.stopNext`. Actions: **Back to opportunities** (outline, → `/workspace/[orgSlug]/opportunities`). Support line `duplicate.supportBefore/Link/After` with `{reference}` (PD-025):
- **Reference:** a random opaque token, unique per stop, stored on the hit row (PD-033, amends PD-025). It is present on **every** stop, sticky stops included, so the `stopped` payload has the same shape in every case. It carries no identifier, scope or first-submitter information.
- **Link:** `mailto:` to the support address from the server-side env var, with subject "Stopped referral {reference}" (URL-encoded) and **no body**.
- **No address configured** (env var unset): the whole support line is hidden; the rest of S1-d is unchanged. The reference stays in the payload, so AC-5 still holds.

No submit button. Focus moves to the alert title (`tabIndex=-1`), and the page scrolls it into view (on mobile the aside sits below the long profile). Override `AlertTitle`'s `line-clamp-1` so fr titles wrap. |
| **Loading** | Existing `SubmitButton` pending label "Submitting…". The panel doesn't change during the check. |
| **Error** | Only real failures (opportunity gone, rate limit, network): existing `FormMessage`. Rate limit: `errors.rateLimited`. |
| **Success** | Outcome `created`: unchanged redirect and flash. |
| **Disabled** | S1-b (submit), S1-c (**Submit anyway** until acknowledged). |

### S2 Referral page

| Sub-state | Side | What shows |
|---|---|---|
| **S2-a Default** | both | Unchanged. |
| **S2-b `already_presented`** | source only (RLS hides it from the target) | Status pill `labels.referralStatus.already_presented` (neutral tone, icon `Info`). Progress track stops at step 1 with the "stopped" marker. Next-step banner: neutral tone, icon `Info`, title `detail.next.alreadyPresented`, body `detail.next.alreadyPresentedBody` (contains the neutral message). Timeline event actor `detail.systemActor` ("Workatent"). Today `actor_side = null` means "candidate", so the backend must mark the system actor distinctly. Ownership footer: `detail.ownershipNotDelivered`. No actions. Commission panel hidden (closed before any agreement). |
| **S2-c Declined with `prior_presentation`** | both | Reason label `declineReasons.prior_presentation`. Source banner: title `detail.next.claimFiledSource` ("Declined by {partner}: prior presentation"), body `detail.next.claimFiledSourceBody`. Target banner: existing "Declined by you" + reason. The claim panel (S2-d) renders directly under the action bar, above the two-column layout. |
| **S2-d Claim panel** | both, different content | See the table below. |
| **S2-e Objection rejected, back in review** | both | Info banner above the action bar (icon `RotateCcw`): target `detail.claimRejected.target`, source `detail.claimRejected.source`. The objection panel shows the "Rejected" outcome. Target: no **File objection** button. |
| **S2-f Legacy `duplicate` decline** | both | Reason label `declineReasons.duplicate` (shows "legacy"), plus a muted hint line under the reason in the banner and timeline: `detail.legacyDuplicateHint`. No claim or contest actions. |
| **S2-g Release** (Must) | source | (a) In the withdraw dialog (S3), only when the release guards hold. (b) **Release later**: on `withdrawn`/`cancelled` when guards (a) delivered, (b) still counts and (c) no open dispute all hold, an outline **Release candidate** button (`release.trigger`) in the action bar. Otherwise the button is **not rendered** (never disabled). It opens the new two-step `ReleaseDialog` (`Dialog`, same structure as S3 step 2), with no reason field. **Step 1:** title `release.title`, description `release.description` ⚖️, footer **Cancel** (outline) · **Continue** (`release.continue`). **Step 2:** title `release.confirmTitle`, description `release.confirmDescription` ⚖️ (irreversible wording), footer **Back** (ghost) · **Cancel** (outline) · **Release permanently** (`release.confirm`, destructive). Focus moves to each step's title. Esc closes with no change. Loading: "Working…" with the other buttons disabled. Error (`release_not_allowed`): inline `role="alert"`. The hiring side never sees the button or any release trace; its status stays `Withdrawn` or `Cancelled`. |
| **S2-h Ownership footer** (timeline panel) | both | The existing `detail.ownership` ("Ownership protected until {date}.") unless: released → `detail.ownershipReleased` {date} (**sourcing side only**; the hiring side keeps the standard line, BR-25); upheld or final claim → `detail.ownershipEnded` (both); `already_presented` → `detail.ownershipNotDelivered` (source only). |
| **S2-j Release flag visibility** | target | No "released" pill, label, timeline entry, footer text or toast ever renders on the hiring side. The hiring-side view model doesn't receive the flag (BR-25, PD-020). |
| **S2-i Objection entry** | target | When eligible (AC-27): outline button **File objection** (`claim.trigger`; keep this short label, §5.11) in the action bar, ranked with the negative actions (left). It opens S5. **Layout at 375px:** the action bar already uses `flex flex-wrap gap-2`, so buttons wrap. On mobile (below `sm`), each action button in that bar is full width (`w-full sm:w-auto`) and the bar stacks in rank order: negative (Decline, File objection) → secondary → primary last, so the main action sits at the bottom near the thumb. No label is truncated, and every button keeps a 44px minimum height. **Revoked referrals are eligible** (PD-028): on a referral with revoked sharing authorization, the button still shows if status and deadline allow it, next to the existing revoked banner. In the review queue, the panel hides the decide buttons for revoked referrals (`decision: "none"`), and that existing behaviour stays. When such a referral is claim-eligible, the panel footer shows one outline button, **File objection**, which opens S5 directly with no **Back** step. |

**S2-d Claim panel** (`Panel`, title `claim.panel.title`, a `StatusPill` with the claim status at the right)

| Row (`dl`) | Target (claiming org) | Source (claimed-against org) |
|---|---|---|
| Filed | `{when}` (date + time ET) | same |
| Candidate last in process with this client | `{date}` | same |
| Evidence | type label; per file: **file name** + upload time + SHA-256 + download button (`GrantDownload` pattern, 60-second signed URL; disabled with "Checking file…" until the scan passes) | type label; per file: **"File {n}"** + upload time + SHA-256. **No name, no type, no download.** A muted line `claim.panel.filesHiddenSource` explains that the files are visible only to the claiming organization and platform admins. |
| Evidence (referral type) | "Earlier referral through Workatent" + a link to that referral (they received it) | "Earlier referral through Workatent" **only** |
| Note | quoted note or `claim.panel.noNote` | same |
| Contest deadline | `BusinessDeadline` (while open) | `BusinessDeadline` + **Contest claim** button (while open) |
| Outcome | status-specific line + resolution text (upheld/rejected) | same |

SHA-256 shows in full, monospace `text-xs break-all`, with an icon button **Copy** (`aria-label` = `claim.panel.copyShaAria` {n}) that confirms with a short tooltip "Copied".

Claim status pill (`labels.claimStatus.*`), with icon and text:

| Status | Tone | Icon | Line under the panel title |
|---|---|---|---|
| `open` | warning | `Clock` | target `claim.panel.status.openTarget` / source `claim.panel.status.openSource` |
| `contested` | info | `Scale` | `claim.panel.status.contested` |
| `final` | neutral | `Lock` | `claim.panel.status.final` {when} |
| `upheld` | neutral | `Check` | `claim.panel.status.upheld` {date} + resolution |
| `rejected` | info | `RotateCcw` | `claim.panel.status.rejected` {date} + resolution |

**Contest dialog** (`ConfirmDialog` with reason): title `contest.title`, description `contest.description`, reason label `contest.reason` (required, 5 to 2,000 characters), plus a **hint under the reason field** saying the reason is read by Workatent platform admins only, not by {partner} (PD-028). The hint is linked to the textarea with `aria-describedby`; the key `referrals.contest.reasonHint` is for ux-writer-marketing to add to §5.5 with the final wording. `ConfirmDialog` has no hint prop today, so frontend extends it or composes the field. Confirm `contest.confirm`. Success toast `contest.messages.contested`.

### S3 Withdraw dialog (`WithdrawDialog`)

Used only for the `withdrawn` transition, and only when the three release guards hold (delivered, still counts, no open dispute; 2.3). If the referral was never delivered, or any guard fails, the existing `ConfirmDialog` (reason only) stays, and the release option is simply absent, never shown disabled.

- **Step 1**: title `withdraw.title`; description `withdraw.description` (says withdrawal keeps first position); `Textarea` reason (required, as today; label `actions.reason`); a bordered box containing a `Checkbox` + `Label` `withdraw.release` (unticked) and, under it, the consequence `withdraw.releaseHint` ⚖️ (always visible, not hidden behind the tick). Footer: **Cancel** (outline) · primary **Withdraw** (`withdraw.confirm`, destructive). When the box is ticked, the primary button becomes **Continue** (`withdraw.continue`).
- **Step 2** (shown only if ticked): title `withdraw.releaseConfirmTitle`; description `withdraw.releaseConfirmDescription` ⚖️; footer: **Back** (ghost) · **Cancel** (outline) · **Withdraw and release** (`withdraw.releaseConfirm`, destructive). Focus moves to the step-2 title.
- **Loading**: the confirm button shows "Working…" (existing `common.actions.working`) and the other buttons are disabled.
- **Error**: inline `role="alert"` under the fields (existing pattern). The dialog stays open.
- **Success**: toast `success.withdrawn` or `success.withdrawnReleased`, and the dialog closes.

### S4 Received queue

| Element | Change |
|---|---|
| `DeclineDialog`, single (count = 1) | The reason chips **no longer include** "Already in process". If the referral is eligible for an objection, a callout box appears **above** the chips: `queue.claimCallout.title`, `queue.claimCallout.description` (includes the deadline "{when} ET"), button **File objection** (`queue.claimCallout.action`, outline). Selecting it swaps the dialog content to S5 inside the same `Dialog`. S5 shows the **Back to decline reasons** link at the top of its body. |
| `DeclineDialog`, bulk (count > 1) | No duplicate chip, no callout. One muted line under the description: `queue.bulkClaimHint`. |
| `QueueRow` | Claim-rejected referrals show the chip `queue.claimRejectedChip` (info tone, `RotateCcw` icon). Their "waiting since" uses the review-clock start instead of `submitted_at`. |
| `ReviewPanel` | Claim-rejected banner (same as S2-e, target copy) under the header. The status label suffix for declines uses the display map (includes `prior_presentation` and legacy `duplicate`). |
| Panel shortcut `d` | Unchanged (opens the decline dialog, where the callout lives). No new shortcut. |
| Closed bucket | `already_presented` never appears on the hiring side. |

`DECLINE_REASONS` (selectable) drops `duplicate`. Add a separate display list that includes `duplicate` (legacy) and `prior_presentation` for labels. `isDeclineReason` must not make `prior_presentation` selectable.

### S5 Prior-presentation claim dialog (`PriorPresentationClaimDialog`)

`DialogContent` `sm:max-w-lg`, `max-h-[90dvh]` with the body scrollable and the footer sticky.

1. **Header**: (when opened from the decline dialog) the **Back to decline reasons** ghost link, then title `claim.title`; description `claim.description` (consequence: declines with "Prior presentation"; what the partner sees and doesn't see; contest window).
2. **Deadline line** (`BusinessDeadline`, `Clock` icon): `claim.deadlineLabel` + "{when} ET · N business days left".
3. **Evidence type**: `RadioGroup` labelled `claim.evidenceType`: `claim.evidenceFile` (+ hint) / `claim.evidenceReferral` (+ hint; disabled with `claim.evidenceReferralNone` when the list is empty).
4. **If file**: `FormField` `claim.files` + hint `claim.filesHint` (types, max 5, 10 MB each). **Directly above the file button**, the deadline line `claim.uploadDeadline` with `BusinessDeadline` (`Clock` icon). Then a visible file button (native `input type=file multiple accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"`, following `candidate-panels.tsx`). Uploads start on selection. Each file row (`li`, file icon, name with `truncate`, size, state, actions):

   | File state | Visual | Text | Actions |
   |---|---|---|---|
   | Uploading | in-progress indicator (`role="progressbar"`). **Indeterminate is enough** (PD-033): no `aria-valuenow`, `aria-busy="true"` on the row, `motion-reduce` static. If a percentage is available it may be shown. | "Uploading" status text, announced via the list's `aria-live`. §5's `claim.file.uploading` contains `{percent}`: when no percentage is available, frontend needs a variant without it; flagged to ux-writer, §5 not changed here. | Cancel upload (`claim.file.cancelAria`) |
   | Processing | spinner (`Loader2`, `motion-reduce` static) | `claim.file.processing` | Remove (`claim.removeFileAria`) |
   | Ready | `CheckCircle2` success | `claim.file.ready` {size} · uploaded {when} ET · SHA-256 first 12 characters + "…" | Remove |
   | Rejected | `XCircle` danger, row `bg-danger-soft` | `claim.file.rejected` | Remove (only action) |
   | Upload failed | `CircleAlert` warning | `claim.file.failed` | Try again (`claim.file.retry`) · Remove |

   An "Add more files" button stays available until 5 files are attached. Then `FormField` `claim.priorDate` (`Input type=date`, `min`/`max` per 2.4) + hint `claim.priorDateHint` {from} {to}.
5. **If referral**: the picker is a radio-card list (`role="radiogroup"`, label `claim.pickReferral`). Each card shows `claim.pickerOption` (candidate label · job · partner · delivered {date}) + status pill. **Eligibility (BR-26 rev. 4.2, PD-029):** the list shows exactly the referrals E that the server returns as qualifying for the objected-to referral C. E qualifies when:
   1. B's org received E, for C's job or for a job with C's client-key snapshot;
   2. E was delivered before C's `delivered_at`;
   3. **at C's `delivered_at`**, E was inside its ownership window and not yet released;
   4. **now**, no objection against E is upheld or final, and E isn't `already_presented`.

   A release or a window end **after** C's delivery doesn't remove E from the list or change the filing result (R-18). Revoked and internal referrals qualify on the same terms (PD-028, BR-31); revoked cards add the existing revoked indicator (`ShieldOff` icon + `queue.revoked` text), and their shared profile stays as limited as it is today. The UI renders what the RPC returns, with no client-side filtering, and shows no release or window information on the cards. Below it, a read-only line `claim.priorDateFromReferral` {date}.
6. **Note**: `Textarea` (max 2,000), label `claim.note`, hint `claim.noteHint`.
7. **Attestation**: `Checkbox` + `Label` `claim.attestation` ⚖️ draft, required.
8. **Footer** (two buttons only, per §5.11): **Cancel** (outline) · **Decline and file objection** (`claim.submit`, destructive; pending label `claim.submitting`). **Back to decline reasons** (`claim.back`) isn't a footer button. It's a ghost link with a `ChevronLeft` icon at the **top of the dialog body**, above the title, shown only when the form was opened from the decline dialog. It's a navigation, not a form action, so it stays usable while files process and it discards nothing. On `sm` and up, the two buttons sit in one row (right-aligned). Below `sm`, they stack full width with the primary on top. On the file path, the submit button is **disabled while any file is uploading, processing, failed or rejected, or when no file is attached**. A status line **above** the buttons, full width, (`claim.file.waiting` {count} / `claim.file.removeRejected` / `claim.file.none`) explains why and is linked with `aria-describedby`. On the referral path, the button doesn't depend on files.

| State | Behaviour |
|---|---|
| Loading (picker) | The picker loads with the dialog (server-provided list). While loading, a 3-row `Skeleton`. |
| Empty (picker) | Referral option disabled + hint. |
| Error | Field errors inline (`FormField error`). Server errors (`claim_window_closed`, `claim_already_filed`, version conflict, `claim_referral_invalid`, rate limit) in a `role="alert"` block at the top of the body; focus moves there. Files stay selected. |
| Disabled | Submit is disabled only for file readiness (EC-4), always with the visible reason line. Date, attestation and evidence-type errors are **not** pre-disabled: they're reported on submit as field errors, so they're announced. |
| Success | Dialog closes, toast `claim.messages.filed` {partner} {when}, queue advances / page refreshes. |

### S5-x `BusinessDeadline`

- Formats the stored timestamp in `America/Toronto` with `Intl` (weekday short, month short, day, hour, minute), followed by the localized "ET" suffix (`deadline.at`).
- Business days left = number of network business days *d* with today's ET date < *d* ≤ the deadline's ET date (computed server-side with the BR-17 helper, passed as a number).
  - left ≥ 1 → `deadline.left` (plural).
  - left = 0 and now < deadline → `deadline.endsToday`.
  - now ≥ deadline → `deadline.closed` {when}.
- Always text plus a `Clock` icon. Colour (warning when left ≤ 1) is decorative only.

### S6 Sent list

- New status pill `already_presented` (neutral). The row has no progress track (closed).
- The reason line shows `declineReasons.prior_presentation`. While the objection is open, an extra chip `sent.claimOpenChip` {when} ("Contest by {when} ET"). In this chip, `{when}` is formatted **without the weekday** (month short, day, time; for example "Nov 20, 11:59 p.m."), and the chip is allowed to **wrap** (`whitespace-normal`, no `truncate`, `rounded-2xl` instead of `rounded-full` when it wraps), per §5.11. The full weekday format stays on the referral page.
- Legacy `duplicate` shows the legacy label.

### S7 Candidate confirmation page

- New terminal result **`already_sent`** (EC-1):
  - `respond_candidate_request` returns it on confirm, and `get_candidate_request` returns `state: "already_sent"` on every later visit.
  - The page adds it to `RequestView.state` and renders it with the existing `Shell` + centred `Panel` pattern (same as `confirmed`/`closed`): icon `CheckCircle2` in the muted tone (not success green, not error red), `h1` `candidate.states.already_sent.title`, body `candidate.states.already_sent.body` {org} {partner} {job}.
  - No buttons. The language switcher stays.
  - After the confirm submit, the form's action result triggers this state in place (no error message, no toast), and focus moves to the `h1`.
  - The page never shows the job's other roles, the other recruiter, a date or "this client".
- The consent sentence gains the duplicate-check addition ⚖️ draft (C-3): `candidate.consent` (updated text). The recorded-authorization hint in the composer gets the matching recruiter-facing line (`form.methodRecordedHint`, updated ⚖️).

### S8 Admin disputes

| Element | Change |
|---|---|
| Page description | `admin.disputes.description` updated to cover placements and prior-presentation claims. |
| Card header | Type badge (`Badge` outline): `labels.disputeType.placement` / `labels.disputeType.prior_presentation`. |
| Placement card | Unchanged (AC-48). |
| `ReferralDisputeCard` | **Header**: `admin.disputes.claim.between` "{target} claims prior presentation · contested by {source}", job title, `Opened {date}`, `Resolve by` (`BusinessDeadline`, 5 business days from opening, a hint only). **Claim**: filed {when}, prior-process date, evidence type, note (quote). **Contest reason** (quote). **Files**: name, size, uploaded {when}, SHA-256, scan status, **Download** (admin action → 60-second signed URL, audited; disabled until the scan passes). Download is available only because this claim has a dispute; the server refuses admin downloads for claims without one (PD-024). **Referral evidence**: two columns, "Claimed referral" and "Earlier referral as evidence", each with the sourcing org, job title, client name as recorded at delivery, delivered {when}, current status, flags (released / upheld / already presented), "Still counts: yes/no". **"Same person" block** (PD-024), **only on disputes whose claim uses earlier-referral evidence**: a small `dl` titled `admin.disputes.claim.samePerson` with exactly three rows, **Email**, **Phone** and **LinkedIn**. Each row shows a `StatusPill` with icon + text: `match` (success, `Check`), `no match` (neutral, `X`) or `not available` (muted, `Minus`; one or both referrals have no such identifier). It **never** shows values, hashes, partial values or which side lacked the identifier. Data comes from the admin-only RPC, which writes an admin audit event per call. Loading: a 3-row `Skeleton`. Error: a short inline error with a retry button; the rest of the card still renders. New copy keys for ux-writer-marketing to add to §5.9: `admin.disputes.claim.samePerson` (block title), `.samePersonEmail` / `.samePersonPhone` / `.samePersonLinkedin`, `labels.identifierMatch.match` / `.no_match` / `.not_available`, and `admin.disputes.claim.samePersonError`. **File-evidence disputes show no block** (admins read the files). The card never shows a candidate name or candidate label, a shared profile or candidate documents. **Language hint** (Should): `admin.dispute.languageHint` {source} {target} with each org's language. |
| Resolution buttons | Prior presentation: **Uphold claim** (`admin.dispute.upholdClaim`) / **Reject claim** (`admin.dispute.rejectClaim`) → `ConfirmDialog` with resolution required, title and description per outcome, and the extra hint `admin.dispute.resolutionVisible` in the description. Placement: unchanged. |
| History | Each entry shows the type badge + outcome pill (`labels.claimStatus.upheld` / `rejected`) for referral disputes. |
| Empty | The existing empty state, `admin.disputes.emptyHint` updated. |
| Loading / error | Existing route `loading.tsx` / error boundary. |

### S9 Admin overview (Should)

- **Organizations to review** panel (`Panel`, `SectionTitle` `admin.flags.title`): rows of `InitialsAvatar` + org name + reason line(s) `admin.flags.stops` {count} / `admin.flags.rejectedClaims` {count}, linking to the org page. Empty: `admin.flags.empty`. Footnote: `admin.flags.note` (flags only, no automatic action).
- **Duplicate protection** panel (`admin.duplicateMetrics.*`): fingerprint hits (job / client), stops, pending warnings, identifier refusals, claims, contest rate, releases, open referral disputes, resolved within 5 business days (%), rejected share (%). Last 30 days. Aggregates only.
- The "Open disputes" queue count includes referral disputes. The attention KPI sums both.

### S10 Notifications and emails

New notification kinds. **N1 is in-app only** (PD-030). In-app titles and bodies stay English strings written by SQL (`app.notify_org`), with a distinct `kind` per event (PD-026). **Emails for these four events are deferred** to the notification-email follow-up, a launch gate in roadmap N7, where the `objection filed` email is required before the founding-group launch. N1 attempts no email send for them, and no N1 copy says an email was sent. The `emails.*` keys in §5.10 stay in the message files for the follow-up, which will send them in the recipient's locale.

| Kind | Recipient | Trigger | Email |
|---|---|---|---|
| `referral.already_presented` | The submitting member. If they're no longer an active member of the sourcing org, the sourcing org's owners and admins (organization admin role) instead, so a closure always notifies someone (PD-028). | BR-8 closure | deferred, PD-030 (`emails.alreadyPresented.*` kept) |
| `claim.filed` (kind name unchanged) | Sourcing org | Objection filed (includes the contest deadline) | deferred, PD-030 (`emails.claimFiled.*` kept; required before launch) |
| `dispute.opened` (`prior_presentation`) | Both orgs | Objection contested | deferred, PD-030 (`emails.disputeOpened.*` kept) |
| `dispute.resolved` (`prior_presentation`) | Both orgs | Objection upheld / rejected | deferred, PD-030 (`emails.disputeResolved.*` kept) |

No notification for: a stop, a pending warning, a sticky stop, release (beyond the existing withdrawal notification), the claim window expiring, or a claim becoming final (BR-20).

### S11 Job form: client name hint

- Under `clientName`, `FormField hint` switches with the checkbox: ticked "Hide client" → `jobs.form.clientInternalHint`; unticked → `jobs.form.clientDuplicateHint`.
- Field optional when hidden (unchanged), required when shown (unchanged, `jobs.validation.clientRequired`). No new error states.
- The hint is muted text with an `EyeOff` icon (internal) or none, and wraps at 375px. The checkbox stays aligned as today. On mobile the field and checkbox stack, and the hint stays directly under the input.
- The job detail page and job list are unchanged.

### Mobile (375px) notes

- Composer: the aside sits below the profile. On S1-c/S1-d, scroll the alert into view and move focus to it. Buttons are full width and stacked.
- `ReviewPanel` is already a fixed full-screen sheet on mobile. The decline and claim dialogs open above it.
- Objection dialog: full width minus 16px, body scrolls. **Back to decline reasons** is a link at the top of the body, not in the footer. The footer holds Cancel and **Decline and file objection**, stacked full width below `sm` (primary on top), with the reason line above them. File rows truncate the name with `min-w-0 truncate`, and the state text wraps to a second line under the name. Progress bar full width. Remove / Try again / Cancel buttons are 44 × 44. The upload-deadline line wraps above the file button.
- Picker cards: one column. The status pill wraps under the text.
- SHA-256: `break-all`, so it wraps to 2 lines. The copy button stays 44 × 44.
- Withdraw dialog: the release box is full width, and the checkbox hit area covers the whole label (≥ 44px tall).
- Admin dispute cards: single column (the existing `lg:grid-cols-2` collapses). The two referral columns stack.
- `BusinessDeadline` wraps between the date and "· N business days left". No truncation.

---

## 4. Data & permissions

| Role | Can see | Can do |
|---|---|---|
| **Sourcing org member** (any role) | Their own stop/warn outcome (the neutral message only). Their referrals, including `already_presented`. On a claim against their referral: filed time, prior-process date, evidence type, per-file upload time + SHA-256, note, contest deadline, status, the admin's resolution. For referral evidence: "Earlier referral through Workatent" only. | Submit (subject to the check). Acknowledge a pending warning. Withdraw, with or without release. Release later from `withdrawn` / `cancelled` (Must). Both release paths only when the three guards hold. Contest a claim before the deadline. |
| **Hiring org member** (any role) | Referrals delivered to them (never `already_presented`). Withdrawn or cancelled referrals show their status as it is, never the release flag. Their own claims, including file names and downloads. The earlier referrals they received (for the picker). The contest status and resolution. | Decline (without `duplicate`). File one claim per eligible referral (file or referral evidence). Accept or decline again after a rejection. |
| **Platform admin** | The disputes queue: both orgs, job title, client name as recorded at delivery, claim metadata, contest reason, both referrals' metadata for referral evidence. **Evidence files only for claims that have a dispute** (open or resolved): download through a 60-second signed URL after the scan passes, each download audited; refused on any claim without a dispute (PD-024). The **"same person" block**, only on referral-evidence disputes: Email / Phone / LinkedIn, each match / no match / not available, **never values or hashes**, each lookup audited (PD-024). **No** candidate name or label, shared profile or candidate documents. Hits in the audit log (scope and outcome; no identifiers). Abuse flags and aggregate metrics. The release flag. The **"earlier referral was internal" attribute** on fingerprint hits (Should, BR-31, PD-022): stored in a closed, admin-only store, **with no UI in this release** (not displayed on any admin screen either; readable by admins through SQL/support tooling only). | Uphold or reject with a written resolution. Download evidence files of disputed claims (audited). |
| **Candidate** | Their own confirmation page, including the "already sent" state. | Confirm or decline as today. |
| **Org C / anon** | Nothing. | Nothing. |

**Must never cross tenants / never be exposed**
- **Fingerprints** (HMAC hashes), the **client key** and **sticky-stop records** are never returned to any client, log or member-visible audit metadata (BR-2, BR-23, BR-24). The tables aren't readable through PostgREST (`api-surface` test).
- The stop, warning and closure responses never reveal the other org, recruiter, date, status, count, client name, or whether the match was job- or client-level (BR-9). This holds for the visible text, the action payload (same outcome code and fields) and the redirect URL.
- The hiring side never sees `already_presented` referrals, stops, warnings or sticky stops. The **release flag** is visible to the sourcing side and platform admins only. The hiring side sees "Withdrawn", and the flag isn't returned by the hiring side's `referrals` select or any RPC it can call (BR-25, PD-020).
- Internal referrals (BR-31) aren't marked as internal anywhere a stop, warning, picker or claim panel is shown.
- The **"earlier referral was internal" hit attribute** (Should, PD-022) is admin-only. It is **not** stored in `audit_events.metadata`, because org admins and recruiter managers can read their org's audit events. It isn't readable by any member through PostgREST, and it never changes the stop message (BR-9). No UI in this release.
- The client name helper text on the job form never reveals a computed key or whether another job shares it (BR-23, EC-6).

**Accepted residuals (rev. 4.2; recorded in `security-and-privacy.md` by backend)**

| # | What can be inferred | By whom | Why accepted | Spec impact |
|---|---|---|---|---|
| **R-18** (PD-029) | From the referral-evidence picker, the hiring side can infer that a withdrawn or cancelled referral, still inside its window, was released **before** another partner's referral of the same person arrived. It isn't listed against that later referral. A release **after** that arrival is invisible. | Hiring org | Inherent: when the fingerprints match, the later referral's existence already implies the release, and the later referral holds first position, so the PD-020 harm doesn't apply. | The picker and filing are judged at the objected-to referral's delivery (S5 item 5, AC-31). This is the one exception to AC-68. No UI shows release information. |
| **R-19** (PD-031) | A sourcing org that presented X to B's J1 and is then stopped on B's confidential J2 can infer that J2 has J1's client, and learns the client if J1's client was shown. | Sourcing org (its own earlier submitter) | Accepted for N1. Strategist follow-up: route own-org client-scope hits to "consider for another job" (RD-013 Later). Revisit on a hiring-org complaint, or when own-org hits are above ~20% of client-scope hits. | None in N1: S1-d stays the single neutral message (AC-5). No extra hint is added for own-org hits, which would make the inference explicit. |
- The sourcing side never gets evidence file names, MIME types, bytes or signed URLs (BR-15, A-11). It never learns which earlier referral, org or date (beyond the prior-process date) was used as referral evidence.
- Job owners still never receive candidate ids. The referral picker uses the hiring side's own referral rows (candidate label + shared profile), as today.
- Raw `matches` stay unexposed. The stop doesn't mark or hide the opportunity, because persisting the outcome in the UI would widen the leak.

**New PII and sensitive data (for `docs/security-and-privacy.md` and the N7 PIA)**
- **Fingerprints**: pseudonymous personal information (keyed hashes of email, phone and LinkedIn). Retention per BR-21 / O-1 ⚖️.
- **Evidence files**: may contain candidate, client and third-party data. Private bucket, Canadian storage, scan gate, audited access ⚖️.
- **Free text**: claim note (shown to the sourcing side), contest reason (admins only, PD-028), admin resolution (shown to both). The hints tell authors not to include client names or contact details.
- **Exception to "platform admins have no access to candidate data"** (`security-and-privacy.md` › Platform admins): BR-15 gives admins in-app access to evidence files, which can contain candidate data. This is decided by the brief. The backend must document it as a scoped, audited exception, and the admin download must be audited per file.

---

## 5. Copy (final; ux-writer-marketing, 2026-11-12)

**Status:** final for en / fr-CA / pt-BR, except the rows marked **⚖️ draft**: they ship as written, with the "draft pending counsel" marker, until counsel signs off (C-1, C-3, C-5, C-6). **Who adds the keys:** backend (`errors`) and frontend (every other namespace) add these strings to `src/i18n/messages/{en,fr,pt}` exactly as written here. ux-writer-marketing did **not** edit the JSON files.

**Conventions** (`docs/content/voice-and-tone.md`):
- `{when}` = date + time formatted in `America/Toronto`; `{date}` = date only. Never write dates in strings.
- Time zone suffix: en `ET`, fr `HE`, pt `(horário de Toronto)` in sentences and `(Toronto)` in chips and file rows.
- Plurals: `{ "one": …, "other": … }`, with `{count}` in **both** branches (fr and pt read 0 as "one").
- fr: the spaces before `:` and inside `« »` are non-breaking (U+00A0) in the JSON. Straight apostrophe `'` in fr, matching `referrals.json`. Curly quotes `“ ”` in en and pt.
- `…Before` / `…Link` / `…After`: no leading or trailing spaces. The component joins them with single spaces.
- **Stored user-facing term:** the object behind every `claim*` key is shown as **"prior-presentation objection"** / **"objection pour présentation antérieure"** / **"objeção por apresentação anterior"** (short: objection / objection / objeção). Key names don't change (PD-028).

**Glossary entries (added to voice guide §5.3 / §5.4):**

| Concept | en | fr-CA | pt-BR | Note |
|---|---|---|---|---|
| Earlier delivered referral that wins | **prior presentation** | **présentation antérieure** | **apresentação anterior** | Decline reason and dispute type. |
| Hiring side's evidenced statement (`claim*` keys) | **prior-presentation objection** (short: **objection**) | **objection pour présentation antérieure** (short: **objection**, f.) | **objeção por apresentação anterior** (short: **objeção**, f.) | **"Claim" is reserved for N3's sourcing-side claims.** "Dispute" stays for what a contest opens. fr *déclaration* is already used for hire reporting. Verb: file / déposer / registrar. |
| Sourcing side's challenge | **contest** | **contester** | **contestar** | A contest opens a **dispute** (litige / disputa). |
| Admin outcome | **uphold / reject** + **resolution** | **retenir / rejeter** + **résolution** | **manter / rejeitar** + **resolução** | |
| Give up first position | **release** (a candidate, for a client) | **libérer** | **liberar** | Sourcing side and admins only. |
| Rank a delivered referral holds | **first position** | **priorité** | **prioridade** | |
| Closed-duplicate status | **Already presented** | **Déjà présenté** | **Já apresentada** | fr matches the existing masculine statuses (Soumis, Retiré); pt the feminine ones. |
| Refused by the check (admin, support) | **stopped** | **bloquée** | **bloqueada** | |
| Reaches the hiring side | **delivered** | **transmise** | **entregue** | |
| Files or earlier referral behind an objection | **evidence** | **pièce justificative** | **comprovante** | Existing term, note broadened. |
| Business day | **business day** | **jour ouvrable** | **dia útil** | |
| Identifier comparison (admin) | **Same · Different · Not available** | **Identique · Différent · Non disponible** | **Igual · Diferente · Indisponível** | Not "match" (that's the candidate × job result). |

**String count:** 232 keys per locale (en, fr, pt), plus 4 in-app notification kinds in English only (§5.10, PD-026). Ten keys are **new** compared with the designer's draft. They're marked *(new)*: `referrals.duplicate.supportSubject`, plus the missing email `preheader`, `heading` and `body` keys in §5.10.

### 5.1 Composer (`referrals`)

**S1-d is one message for every stop (BR-9, AC-5).** `stopTitle`, `message`, `stopNext` and the support line render the same text for a job-level hit, a client-level hit, an earlier referral from the submitter's own org or from another org, and a sticky stop. The only variable parts are `{partner}` (the job's own hiring org, which the submitter already sees) and the opaque `{reference}`. Don't add conditional wording.

| Key | en | fr-CA | pt-BR |
|---|---|---|---|
| `referrals.form.duplicateCheckNote` | Workatent checks the candidate's contact details to make sure they weren't already presented to {partner} for this client. | Workatent compare les coordonnées du candidat pour s'assurer qu'il n'a pas déjà été présenté à {partner} pour ce client. | O Workatent compara os dados de contato do candidato para checar se ele já foi apresentado a {partner} para este cliente. |
| `referrals.form.identifierRequired.title` | Add contact details to submit | Ajoutez des coordonnées pour soumettre | Adicione dados de contato para enviar |
| `referrals.form.identifierRequired.description` | Every referral needs at least one way to reach the candidate: an email, a full phone number with area code, or a LinkedIn profile. | Chaque recommandation exige au moins un moyen de joindre le candidat : un courriel, un numéro de téléphone complet (avec l'indicatif régional) ou un profil LinkedIn. | Toda indicação precisa de pelo menos uma forma de contato com o candidato: e-mail, telefone completo com código de área ou perfil do LinkedIn. |
| `referrals.form.identifierRequired.action` | Edit candidate | Modifier le candidat | Editar candidato |
| `referrals.duplicate.pendingTitle` | This candidate may already be in process with {partner} | Ce candidat est peut-être déjà proposé à {partner} | Este candidato talvez já esteja em processo com {partner} |
| `referrals.duplicate.pendingDescription` | Another referral for this candidate is waiting for the candidate to confirm it. You can still submit. If the other referral reaches {partner} first, this one is closed and {partner} won't receive it. | Une autre recommandation de ce candidat attend la confirmation du candidat. Vous pouvez quand même soumettre. Si l'autre recommandation parvient à {partner} en premier, celle-ci sera fermée et {partner} ne la recevra pas. | Outra indicação deste candidato aguarda a confirmação do candidato. Você ainda pode enviar. Se a outra indicação chegar primeiro a {partner}, esta será encerrada e {partner} não vai recebê-la. |
| `referrals.duplicate.acknowledge` | I understand and want to submit this referral anyway. | Je comprends et je veux soumettre cette recommandation quand même. | Entendi e quero enviar esta indicação mesmo assim. |
| `referrals.duplicate.submitAnyway` | Submit anyway | Soumettre quand même | Enviar mesmo assim |
| `referrals.duplicate.stopTitle` | Candidate already presented | Candidat déjà présenté | Candidato já apresentado |
| `referrals.duplicate.message` ⚖️ draft (C-6) | This candidate has already been presented to {partner} for this client, so this referral can't be submitted. This rule only decides which referral counts for the commission. It doesn't stop {partner} from hiring the candidate. | Ce candidat a déjà été présenté à {partner} pour ce client : cette recommandation ne peut donc pas être soumise. Cette règle détermine seulement quelle recommandation compte pour la commission. Elle n'empêche pas {partner} d'embaucher le candidat. | Este candidato já foi apresentado a {partner} para este cliente, por isso esta indicação não pode ser enviada. Essa regra só define qual indicação conta para a comissão. Ela não impede {partner} de contratar o candidato. |
| `referrals.duplicate.stopNext` | Nothing was sent to the candidate or to {partner}. | Rien n'a été envoyé au candidat ni à {partner}. | Nada foi enviado ao candidato nem a {partner}. |
| `referrals.duplicate.backToOpportunities` | Back to opportunities | Retour aux occasions | Voltar às oportunidades |
| `referrals.duplicate.supportBefore` | Think this is a mistake? | Vous croyez qu'il s'agit d'une erreur? | Acha que é um engano? |
| `referrals.duplicate.supportLink` | Contact Workatent support | Écrivez au soutien Workatent | Fale com o suporte do Workatent |
| `referrals.duplicate.supportAfter` | and give reference {reference}. | en indiquant la référence {reference}. | e informe a referência {reference}. |
| `referrals.duplicate.supportSubject` *(new)* | Stopped referral {reference} | Recommandation bloquée {reference} | Indicação bloqueada {reference} |
| `referrals.form.methodRecordedHint` *(updated)* ⚖️ draft (C-3) | Record how and when the candidate authorized it (e.g. by phone). Workatent uses the candidate's contact details to check for duplicate referrals. | Indiquez comment et quand le candidat a donné son accord (ex. : par téléphone). Workatent utilise les coordonnées du candidat pour détecter les recommandations en double. | Registre como e quando o candidato autorizou (ex.: por telefone). O Workatent usa os dados de contato do candidato para detectar indicações duplicadas. |

Support line rules (PD-025):
- `supportSubject` is the `mailto:` **subject** (URL-encoded) in the viewer's locale. **No body.** The subject holds only the reference: never the candidate's name, contact details, job, partner or org.
- If the support address env var is unset, hide `supportBefore` + `supportLink` + `supportAfter` together. Nothing else in S1-d changes.
- `supportLink` makes sense on its own for screen readers ("Contact Workatent support").

### 5.2 Referral page (`referrals`)

| Key | en | fr-CA | pt-BR |
|---|---|---|---|
| `labels.referralStatus.already_presented` | Already presented | Déjà présenté | Já apresentada |
| `referrals.detail.next.alreadyPresented` | Candidate already presented | Candidat déjà présenté | Candidato já apresentado |
| `referrals.detail.next.alreadyPresentedBody` | The candidate confirmed, but they had already been presented to {partner} for this client, so this referral wasn't delivered. {partner} can't see it, and nothing was shared with them. | Le candidat a confirmé, mais il avait déjà été présenté à {partner} pour ce client : cette recommandation n'a donc pas été transmise. {partner} ne la voit pas et n'a reçu aucune information. | O candidato confirmou, mas já tinha sido apresentado a {partner} para este cliente, por isso esta indicação não foi entregue. {partner} não a vê, e nada foi compartilhado. |
| `referrals.detail.systemActor` | Workatent | Workatent | Workatent |
| `referrals.detail.ownershipNotDelivered` | This referral wasn't delivered, so it holds no ownership. | Cette recommandation n'a pas été transmise : elle ne confère aucune propriété. | Esta indicação não foi entregue, por isso não tem titularidade. |
| `referrals.detail.ownershipReleased` *(sourcing side only)* | Released on {date}. This referral no longer holds ownership for this client. | Candidat libéré le {date}. Cette recommandation n'a plus de propriété pour ce client. | Candidato liberado em {date}. Esta indicação não tem mais titularidade para este cliente. |
| `referrals.detail.ownershipEnded` | No ownership: the prior-presentation objection on this referral was upheld or became final. | Aucune propriété : l'objection pour présentation antérieure visant cette recommandation a été retenue ou est devenue définitive. | Sem titularidade: a objeção por apresentação anterior a esta indicação foi mantida ou se tornou definitiva. |
| `referrals.declineReasons.prior_presentation` | Prior presentation | Présentation antérieure | Apresentação anterior |
| `referrals.declineReasons.duplicate` *(changed)* | Already in process (legacy) | Déjà en processus (ancien motif) | Já em processo (motivo antigo) |
| `referrals.detail.legacyDuplicateHint` | Recorded before evidence was required. No objection or contest is possible. | Enregistré avant que les pièces justificatives soient exigées. Aucune objection ni contestation n'est possible. | Registrado antes da exigência de comprovantes. Não é possível registrar objeção nem contestar. |
| `referrals.detail.next.claimFiledSource` | Declined by {partner}: prior presentation | Refusée par {partner} : présentation antérieure | Recusada por {partner}: apresentação anterior |
| `referrals.detail.next.claimFiledSourceBody` | {partner} says they already had this candidate for this client. Review the objection below. You can contest it until {when} ET. | {partner} affirme avoir déjà eu ce candidat pour ce client. Consultez l'objection ci-dessous. Vous pouvez la contester jusqu'au {when} HE. | {partner} diz que já tinha este candidato para este cliente. Veja a objeção abaixo. Você pode contestá-la até {when} (horário de Toronto). |
| `referrals.detail.claimRejected.target` | Objection rejected on {date}. A platform admin decided the prior-presentation objection wasn't valid. Review this referral again: accept it, or decline it for another reason. | Objection rejetée le {date}. Un administrateur de la plateforme a jugé l'objection pour présentation antérieure non fondée. Examinez de nouveau cette recommandation : acceptez-la ou refusez-la pour un autre motif. | Objeção rejeitada em {date}. Um admin da plataforma considerou a objeção por apresentação anterior improcedente. Analise esta indicação de novo: aceite-a ou recuse-a por outro motivo. |
| `referrals.detail.claimRejected.source` | Objection rejected on {date}. This referral is back with {partner} for review. | Objection rejetée le {date}. Cette recommandation est de nouveau en examen chez {partner}. | Objeção rejeitada em {date}. Esta indicação voltou para análise de {partner}. |
| `referrals.success.withdrawn` | Referral withdrawn. It keeps first position for this client until {date}. | Recommandation retirée. Elle conserve sa priorité pour ce client jusqu'au {date}. | Indicação retirada. Ela mantém a prioridade para este cliente até {date}. |
| `referrals.success.withdrawnReleased` | Referral withdrawn and candidate released. | Recommandation retirée et candidat libéré. | Indicação retirada e candidato liberado. |
| `referrals.success.released` | Candidate released for this client. | Candidat libéré pour ce client. | Candidato liberado para este cliente. |

Notes:
- `success.withdrawn` claims first position, so show it **only** when the withdrawn referral still counts (delivered and guard (b) holds). Other withdrawals keep the existing toast.
- Hiring side: none of the "released" strings ever render there (BR-25). Its footer keeps `detail.ownership`.

### 5.3 Withdraw and release (`referrals`)

Release consequence wording is the same at both entry points (BR-25): "other partners can submit this candidate to {partner} for this client" + "gives up first position". The draft's "this referral earns nothing" is **dropped**: it's a money claim that N3 and the network rules haven't settled (RD-007), so the copy states only what the product does.

| Key | en | fr-CA | pt-BR |
|---|---|---|---|
| `referrals.withdraw.title` | Withdraw this referral? | Retirer cette recommandation? | Retirar esta indicação? |
| `referrals.withdraw.description` ⚖️ draft (C-1) | {partner} is notified. Withdrawing doesn't give up your first position: until {date}, no other partner can submit this candidate to {partner} for this client through Workatent. | {partner} sera avisé. Le retrait ne vous fait pas perdre votre priorité : jusqu'au {date}, aucun autre partenaire ne peut soumettre ce candidat à {partner} pour ce client dans Workatent. | {partner} será avisado. Retirar não faz você perder a prioridade: até {date}, nenhum outro parceiro pode enviar este candidato a {partner} para este cliente pelo Workatent. |
| `referrals.withdraw.release` ⚖️ draft (C-1) | Also release this candidate for this client | Libérer aussi ce candidat pour ce client | Liberar também este candidato para este cliente |
| `referrals.withdraw.releaseHint` ⚖️ draft (C-1) | Other partners can then submit this candidate to {partner} for this client. This referral gives up its first position. | D'autres partenaires pourront alors soumettre ce candidat à {partner} pour ce client. Cette recommandation perd sa priorité. | Outros parceiros poderão enviar este candidato a {partner} para este cliente. Esta indicação perde a prioridade. |
| `referrals.withdraw.confirm` | Withdraw | Retirer | Retirar |
| `referrals.withdraw.continue` | Continue | Continuer | Continuar |
| `referrals.withdraw.releaseConfirmTitle` | Release this candidate for this client? | Libérer ce candidat pour ce client? | Liberar este candidato para este cliente? |
| `referrals.withdraw.releaseConfirmDescription` ⚖️ draft (C-1) | Your referral will be withdrawn and give up its first position. Other partners can then submit this candidate to {partner} for this client. You can't undo this. | Votre recommandation sera retirée et perdra sa priorité. D'autres partenaires pourront alors soumettre ce candidat à {partner} pour ce client. Cette action est irréversible. | Sua indicação será retirada e perderá a prioridade. Outros parceiros poderão enviar este candidato a {partner} para este cliente. Não é possível desfazer. |
| `referrals.withdraw.releaseConfirm` | Withdraw and release | Retirer et libérer | Retirar e liberar |
| `referrals.withdraw.back` | Back | Retour | Voltar |
| `referrals.release.trigger` | Release candidate | Libérer le candidat | Liberar candidato |
| `referrals.release.title` | Release this candidate for this client? | Libérer ce candidat pour ce client? | Liberar este candidato para este cliente? |
| `referrals.release.description` ⚖️ draft (C-1) | This referral is closed but still holds first position for this client until {date}. If you release the candidate, other partners can submit them to {partner} for this client. | Cette recommandation est fermée, mais elle conserve sa priorité pour ce client jusqu'au {date}. Si vous libérez le candidat, d'autres partenaires pourront le soumettre à {partner} pour ce client. | Esta indicação está encerrada, mas mantém a prioridade para este cliente até {date}. Se você liberar o candidato, outros parceiros poderão enviá-lo a {partner} para este cliente. |
| `referrals.release.continue` | Continue | Continuer | Continuar |
| `referrals.release.confirmTitle` | Release permanently? | Libérer définitivement? | Liberar definitivamente? |
| `referrals.release.confirmDescription` ⚖️ draft (C-1) | This referral gives up its first position for this client for good. {partner} isn't notified. You can't undo this. | Cette recommandation perdra définitivement sa priorité pour ce client. {partner} ne sera pas avisé. Cette action est irréversible. | Esta indicação perderá a prioridade para este cliente de vez. {partner} não será avisado. Não é possível desfazer. |
| `referrals.release.back` | Back | Retour | Voltar |
| `referrals.release.confirm` | Release permanently | Libérer définitivement | Liberar definitivamente |

`release.description` no longer interpolates `{status}`: "Withdrawn" / "Cancelled" mid-sentence would need gender agreement in fr and pt. "closed" covers both statuses.

### 5.4 Review queue and claim form (`referrals`)

pt note: "Enviar" is the glossary verb for **submit**, so file uploads use **anexar** (attach) and **carregar** (upload progress), never "enviar".

| Key | en | fr-CA | pt-BR |
|---|---|---|---|
| `referrals.queue.claimCallout.title` | Already had this candidate for this client? | Vous aviez déjà ce candidat pour ce client? | Já tinha este candidato para este cliente? |
| `referrals.queue.claimCallout.description` | Decline with a prior-presentation objection and dated evidence. You can do this until {when} ET. | Refusez avec une objection pour présentation antérieure, appuyée de pièces justificatives datées. Possible jusqu'au {when} HE. | Recuse com uma objeção por apresentação anterior e comprovantes datados. Você pode fazer isso até {when} (horário de Toronto). |
| `referrals.queue.claimCallout.action` | File objection | Déposer une objection | Registrar objeção |
| `referrals.queue.bulkClaimHint` | To file a prior-presentation objection, open one referral at a time. | Pour déposer une objection pour présentation antérieure, ouvrez une recommandation à la fois. | Para registrar uma objeção por apresentação anterior, abra uma indicação por vez. |
| `referrals.queue.claimRejectedChip` | Objection rejected | Objection rejetée | Objeção rejeitada |
| `referrals.claim.trigger` | File objection | Déposer une objection | Registrar objeção |
| `referrals.claim.title` | File a prior-presentation objection | Déposer une objection pour présentation antérieure | Registrar objeção por apresentação anterior |
| `referrals.claim.description` | Filing an objection declines this referral with the reason “Prior presentation”. {partner} sees the dates, the type of evidence and your note, but not your files. They have 10 business days to contest. If they do, a platform admin reviews your evidence. | Déposer une objection refuse cette recommandation avec le motif « Présentation antérieure ». {partner} voit les dates, le type de pièce justificative et votre note, mais pas vos fichiers. {partner} dispose de 10 jours ouvrables pour contester. En cas de contestation, un administrateur de la plateforme examine vos pièces justificatives. | Ao registrar a objeção, esta indicação é recusada com o motivo “Apresentação anterior”. {partner} vê as datas, o tipo de comprovante e sua nota, mas não seus arquivos. {partner} tem 10 dias úteis para contestar. Se contestar, um admin da plataforma analisa seus comprovantes. |
| `referrals.claim.deadlineLabel` | Objection deadline | Date limite de l'objection | Prazo da objeção |
| `referrals.claim.evidenceType` | Evidence | Pièce justificative | Comprovante |
| `referrals.claim.evidenceFile` | Upload files | Téléverser des fichiers | Anexar arquivos |
| `referrals.claim.evidenceFileHint` | An ATS export, or an email saved as PDF or image, that shows the candidate in process with this client. | Une exportation de votre ATS, ou un courriel enregistré en PDF ou en image, qui montre le candidat en processus de recrutement avec ce client. | Uma exportação do seu ATS, ou um e-mail salvo em PDF ou imagem, que mostre o candidato em processo seletivo com este cliente. |
| `referrals.claim.evidenceReferral` | Use an earlier Workatent referral | Utiliser une recommandation antérieure reçue dans Workatent | Usar uma indicação anterior do Workatent |
| `referrals.claim.evidenceReferralHint` | A referral you received for this job or this client before this one. | Une recommandation reçue pour ce poste ou ce client avant celle-ci. | Uma indicação que você recebeu para esta vaga ou este cliente antes desta. |
| `referrals.claim.evidenceReferralNone` | No earlier referral for this job or client can be used. | Aucune recommandation antérieure pour ce poste ou ce client ne peut être utilisée. | Nenhuma indicação anterior para esta vaga ou este cliente pode ser usada. |
| `referrals.claim.files` | Files | Fichiers | Arquivos |
| `referrals.claim.filesHint` | PDF, PNG or JPEG. Up to 5 files, 10 MB each. | PDF, PNG ou JPEG. Jusqu'à 5 fichiers, 10 Mo chacun. | PDF, PNG ou JPEG. Até 5 arquivos, de até 10 MB cada. |
| `referrals.claim.uploadDeadline` | Objection deadline: {when} ET · {left}. Files must finish processing and the objection must be filed by then. | Date limite de l'objection : {when} HE · {left}. Les fichiers doivent être traités et l'objection déposée d'ici là. | Prazo da objeção: {when} (horário de Toronto) · {left}. Os arquivos precisam ser processados e a objeção registrada até lá. |
| `referrals.claim.addFiles` | Add files | Ajouter des fichiers | Adicionar arquivos |
| `referrals.claim.addMoreFiles` | Add more files | Ajouter d'autres fichiers | Adicionar mais arquivos |
| `referrals.claim.removeFileAria` | Remove {name} | Supprimer {name} | Remover {name} |
| `referrals.claim.file.uploading` | Uploading… | Téléversement… | Carregando arquivo… |
| `referrals.claim.file.cancelAria` | Cancel upload of {name} | Annuler le téléversement de {name} | Cancelar o carregamento de {name} |
| `referrals.claim.file.processing` | Checking file… | Vérification du fichier… | Verificando arquivo… |
| `referrals.claim.file.ready` | Ready · {size} · uploaded {when} ET | Prêt · {size} · téléversé le {when} HE | Pronto · {size} · carregado em {when} (Toronto) |
| `referrals.claim.file.rejected` | This file can't be used. Remove it to continue. | Ce fichier ne peut pas être utilisé. Supprimez-le pour continuer. | Este arquivo não pode ser usado. Remova-o para continuar. |
| `referrals.claim.file.failed` | Upload didn't finish. | Le téléversement n'a pas abouti. | O carregamento não foi concluído. |
| `referrals.claim.file.retry` | Try again | Réessayer | Tentar de novo |
| `referrals.claim.file.waiting` | one: "Waiting for {count} file to finish processing" · other: "Waiting for {count} files to finish processing" | one: "En attente du traitement de {count} fichier" · other: "En attente du traitement de {count} fichiers" | one: "Aguardando o processamento de {count} arquivo" · other: "Aguardando o processamento de {count} arquivos" |
| `referrals.claim.file.removeRejected` | To continue, remove the file that can't be used | Pour continuer, supprimez le fichier inutilisable | Para continuar, remova o arquivo que não pode ser usado |
| `referrals.claim.file.none` | Add at least one file | Ajoutez au moins un fichier | Adicione pelo menos um arquivo |
| `referrals.claim.file.selectedSr` | one: "{count} file attached" · other: "{count} files attached" | one: "{count} fichier joint" · other: "{count} fichiers joints" | one: "{count} arquivo anexado" · other: "{count} arquivos anexados" |
| `referrals.claim.priorDate` | Date the candidate was last in process with this client | Dernière date où le candidat était en processus de recrutement avec ce client | Última data em que o candidato esteve em processo seletivo com este cliente |
| `referrals.claim.priorDateHint` | Between {from} and {to} (before this referral was delivered). | Entre le {from} et le {to} (avant la transmission de cette recommandation). | Entre {from} e {to} (antes da entrega desta indicação). |
| `referrals.claim.pickReferral` | Earlier referral | Recommandation antérieure | Indicação anterior |
| `referrals.claim.pickerOption` | {candidate} · {job} · from {partner} · delivered {date} | {candidate} · {job} · de {partner} · transmise le {date} | {candidate} · {job} · de {partner} · entregue em {date} |
| `referrals.claim.priorDateFromReferral` | Date used: {date}, the day the earlier referral was delivered. | Date retenue : {date}, jour de transmission de la recommandation antérieure. | Data usada: {date}, dia em que a indicação anterior foi entregue. |
| `referrals.claim.note` | Note (optional) | Note (facultative) | Nota (opcional) |
| `referrals.claim.noteHint` | {partner} sees this note. Don't include client names or contact details. | {partner} verra cette note. N'y indiquez ni nom de client ni coordonnées. | {partner} vê esta nota. Não inclua nomes de clientes nem dados de contato. |
| `referrals.claim.attestation` ⚖️ draft (C-1) | I confirm this objection and its evidence are true and accurate. I understand that false objections can get my organization suspended from Workatent. | Je confirme que cette objection et ses pièces justificatives sont véridiques et exactes. Je comprends qu'une fausse objection peut entraîner la suspension de mon organisation sur Workatent. | Confirmo que esta objeção e seus comprovantes são verdadeiros e corretos. Entendo que objeções falsas podem levar à suspensão da minha organização no Workatent. |
| `referrals.claim.submit` | Decline and file objection | Refuser et déposer l'objection | Recusar e registrar objeção |
| `referrals.claim.submitting` | Filing objection… | Dépôt de l'objection… | Registrando objeção… |
| `referrals.claim.back` | Back to decline reasons | Retour aux motifs de refus | Voltar aos motivos de recusa |
| `referrals.claim.validation.evidenceRequired` | Upload at least one file, or pick an earlier referral | Téléversez au moins un fichier ou choisissez une recommandation antérieure | Anexe pelo menos um arquivo ou escolha uma indicação anterior |
| `referrals.claim.validation.priorDateRequired` | Enter the date | Entrez la date | Informe a data |
| `referrals.claim.validation.priorDateAfterDelivery` | Enter a date before {date}, when this referral was delivered | Entrez une date antérieure au {date}, jour de transmission de cette recommandation | Informe uma data anterior a {date}, dia da entrega desta indicação |
| `referrals.claim.validation.priorDateTooOld` | Enter a date on or after {date} (6 months before delivery) | Entrez une date à partir du {date} (6 mois avant la transmission) | Informe uma data a partir de {date} (6 meses antes da entrega) |
| `referrals.claim.validation.attestationRequired` | Confirm the statement to file the objection | Cochez la confirmation pour déposer l'objection | Marque a confirmação para registrar a objeção |
| `referrals.claim.validation.fileType` | Upload a PDF, PNG or JPEG file | Téléversez un fichier PDF, PNG ou JPEG | Anexe um arquivo PDF, PNG ou JPEG |
| `referrals.claim.validation.fileSize` | Upload files of 10 MB or less | Téléversez des fichiers de 10 Mo ou moins | Anexe arquivos de até 10 MB |
| `referrals.claim.validation.tooManyFiles` | Upload 5 files at most | Téléversez 5 fichiers au maximum | Anexe no máximo 5 arquivos |
| `referrals.claim.messages.filed` | Objection filed. {partner} can contest it until {when} ET. | Objection déposée. {partner} peut la contester jusqu'au {when} HE. | Objeção registrada. {partner} pode contestá-la até {when} (horário de Toronto). |

Notes:
- `claim.trigger` and `claimCallout.action` are deliberately short. The decline-dialog callout title gives the context, and the dialog title (`claim.title`) names the full object. On the referral page, frontend may add `title`/tooltip = `claim.title`; the visible label stays short for fr.
- `{left}` in `uploadDeadline` is the rendered `deadline.left` / `deadline.endsToday` string (§5.6).
- `file.processing` drops "fingerprinting" (jargon). The SHA-256 shows once the row is Ready.

### 5.5 Claim panel and contest (`referrals`, `labels`)

| Key | en | fr-CA | pt-BR |
|---|---|---|---|
| `referrals.claim.panel.title` | Prior-presentation objection | Objection pour présentation antérieure | Objeção por apresentação anterior |
| `referrals.claim.panel.filed` | Filed | Déposée | Registrada |
| `referrals.claim.panel.priorDate` | Candidate last in process with this client | Dernière date en processus de recrutement avec ce client | Última data em processo seletivo com este cliente |
| `referrals.claim.panel.evidence` | Evidence | Pièces justificatives | Comprovantes |
| `referrals.claim.panel.fileN` | File {n} | Fichier {n} | Arquivo {n} |
| `referrals.claim.panel.uploaded` | Uploaded {when} ET | Téléversé le {when} HE | Carregado em {when} (Toronto) |
| `referrals.claim.panel.sha` | SHA-256 | SHA-256 | SHA-256 |
| `referrals.claim.panel.copyShaAria` | Copy the SHA-256 of file {n} | Copier le SHA-256 du fichier {n} | Copiar o SHA-256 do arquivo {n} |
| `referrals.claim.panel.copied` | Copied | Copié | Copiado |
| `referrals.claim.panel.filesHiddenSource` | Only {partner} can open these files, and platform admins if you contest. The SHA-256 shows that a file hasn't changed since it was uploaded. | Seul {partner} peut ouvrir ces fichiers, ainsi que les administrateurs de la plateforme si vous contestez. Le SHA-256 permet de vérifier qu'un fichier n'a pas changé depuis son téléversement. | Só {partner} pode abrir estes arquivos, além dos admins da plataforma se você contestar. O SHA-256 permite checar que um arquivo não mudou desde o carregamento. |
| `referrals.claim.panel.download` | Download {name} | Télécharger {name} | Baixar {name} |
| `referrals.claim.panel.scanning` | Checking file… | Vérification du fichier… | Verificando arquivo… |
| `referrals.claim.panel.earlierReferral` | Earlier referral through Workatent | Recommandation antérieure reçue dans Workatent | Indicação anterior pelo Workatent |
| `referrals.claim.panel.openEarlierReferral` | Open earlier referral | Ouvrir la recommandation antérieure | Abrir indicação anterior |
| `referrals.claim.panel.note` | Note | Note | Nota |
| `referrals.claim.panel.noNote` | No note. | Aucune note. | Nenhuma nota. |
| `referrals.claim.panel.contestDeadline` | Contest deadline | Date limite de contestation | Prazo para contestar |
| `referrals.claim.panel.resolution` | Resolution from a platform admin | Résolution d'un administrateur de la plateforme | Resolução de um admin da plataforma |
| `referrals.claim.panel.status.openTarget` | {partner} can contest this objection until {when} ET. | {partner} peut contester cette objection jusqu'au {when} HE. | {partner} pode contestar esta objeção até {when} (horário de Toronto). |
| `referrals.claim.panel.status.openSource` | You can contest this objection until {when} ET. Contesting is free: a platform admin reviews the evidence. | Vous pouvez contester cette objection jusqu'au {when} HE. La contestation est gratuite : un administrateur de la plateforme examine les pièces justificatives. | Você pode contestar esta objeção até {when} (horário de Toronto). Contestar é gratuito: um admin da plataforma analisa os comprovantes. |
| `referrals.claim.panel.status.contested` | Contested on {date}. A platform admin is reviewing the objection. | Contestée le {date}. Un administrateur de la plateforme examine l'objection. | Contestada em {date}. Um admin da plataforma está analisando a objeção. |
| `referrals.claim.panel.status.final` | Final: not contested by {when} ET. | Définitive : aucune contestation au {when} HE. | Definitiva: não contestada até {when} (horário de Toronto). |
| `referrals.claim.panel.status.upheld` | Upheld by a platform admin on {date}. | Retenue par un administrateur de la plateforme le {date}. | Mantida por um admin da plataforma em {date}. |
| `referrals.claim.panel.status.rejected` | Rejected by a platform admin on {date}. | Rejetée par un administrateur de la plateforme le {date}. | Rejeitada por um admin da plataforma em {date}. |
| `labels.claimStatus.open` | Open | Ouverte | Aberta |
| `labels.claimStatus.contested` | Contested | Contestée | Contestada |
| `labels.claimStatus.final` | Final | Définitive | Definitiva |
| `labels.claimStatus.upheld` | Upheld | Retenue | Mantida |
| `labels.claimStatus.rejected` | Rejected | Rejetée | Rejeitada |
| `labels.evidenceType.file` | Files | Fichiers | Arquivos |
| `labels.evidenceType.referral` | Earlier referral through Workatent | Recommandation antérieure reçue dans Workatent | Indicação anterior pelo Workatent |
| `referrals.contest.trigger` | Contest objection | Contester l'objection | Contestar objeção |
| `referrals.contest.title` | Contest this objection? | Contester cette objection? | Contestar esta objeção? |
| `referrals.contest.description` | A platform admin reviews the objection and its evidence, then upholds or rejects it. Contesting is free. You and {partner} are both notified of the decision. | Un administrateur de la plateforme examine l'objection et ses pièces justificatives, puis la retient ou la rejette. La contestation est gratuite. Vous et {partner} serez avisés de la décision. | Um admin da plataforma analisa a objeção e os comprovantes e depois a mantém ou rejeita. Contestar é gratuito. Você e {partner} serão avisados da decisão. |
| `referrals.contest.reason` | Why do you disagree with the objection? | Pourquoi êtes-vous en désaccord avec l'objection? | Por que você discorda da objeção? |
| `referrals.contest.reasonHint` *(designer-requested)* | Only Workatent platform admins read this. {partner} doesn't see it. Don't include client names or contact details. | Seuls les administrateurs de la plateforme Workatent lisent ce texte. {partner} ne le voit pas. N'y indiquez ni nom de client ni coordonnées. | Só os admins da plataforma Workatent leem este texto. {partner} não o vê. Não inclua nomes de clientes nem dados de contato. |
| `referrals.contest.confirm` | Contest objection | Contester l'objection | Contestar objeção |
| `referrals.contest.messages.contested` | Objection contested. A platform admin will review it. | Objection contestée. Un administrateur de la plateforme l'examinera. | Objeção contestada. Um admin da plataforma vai analisá-la. |
| `referrals.sent.claimOpenChip` | Contest by {when} ET | Contester d'ici le {when} HE | Contestar até {when} (Toronto) |

Notes:
- `panel.note` no longer interpolates `{partner}`: on the hiring side, `{partner}` would name the sourcing org as the note's author, which is wrong. The `dt` "Note" works on both sides.
- `panel.filesHiddenSource` is sourcing side only. Admins can open files only on objections that have a dispute (PD-024), which is why it says "if you contest".

### 5.6 Deadlines (`referrals`, shared with N4)

| Key | en | fr-CA | pt-BR |
|---|---|---|---|
| `referrals.deadline.at` | {when} ET | {when} HE | {when} (horário de Toronto) |
| `referrals.deadline.left` | one: "{count} business day left" · other: "{count} business days left" | one: "{count} jour ouvrable restant" · other: "{count} jours ouvrables restants" | one: "{count} dia útil restante" · other: "{count} dias úteis restantes" |
| `referrals.deadline.endsToday` | Ends today | Dernier jour | Termina hoje |
| `referrals.deadline.closed` | Closed {when} ET | Terminé le {when} HE | Encerrado em {when} (horário de Toronto) |

Time zone suffix decided: fr-CA **HE** (heure de l'Est, the usual Québec abbreviation); pt-BR **horário de Toronto** ("ET" means nothing to pt-BR readers), shortened to **(Toronto)** in chips and file rows. Recorded in voice guide §6.5.

### 5.7 Candidate page (`candidate`)

The candidate page never mentions the other recruiter, the job's other roles, a date or "this client" (S7). The body names only {org}, {partner} and {job} (AC-69). It doesn't promise anything about the candidate's chances, either way (C-6).

| Key | en | fr-CA | pt-BR |
|---|---|---|---|
| `candidate.states.already_sent.title` | Your profile was already sent | Votre profil a déjà été transmis | Seu perfil já foi enviado |
| `candidate.states.already_sent.body` | {partner} already has your profile through Workatent, so {org} didn't send it again for the {job} role. You don't need to do anything. If you have questions, contact {org}. | {partner} a déjà reçu votre profil par Workatent. {org} ne l'a donc pas transmis de nouveau pour le poste {job}. Vous n'avez rien d'autre à faire. Pour toute question, contactez {org}. | {partner} já recebeu seu perfil pelo Workatent, por isso {org} não o enviou de novo para a vaga {job}. Você não precisa fazer mais nada. Se tiver dúvidas, fale com {org}. |
| `candidate.consent` *(updated)* ⚖️ draft (C-3) | I authorize {org} to share the information above with {partner} for the {job} role. Workatent uses my contact details to check whether my profile was already sent to {partner} for the same company. I know I can withdraw this authorization at any time by contacting {org}. | J'autorise {org} à partager les informations ci-dessus avec {partner} pour le poste {job}. Workatent utilise mes coordonnées pour vérifier si mon profil a déjà été transmis à {partner} pour la même entreprise. Je sais que je peux retirer cette autorisation à tout moment en contactant {org}. | Autorizo {org} a compartilhar as informações acima com {partner} para a vaga {job}. O Workatent usa meus dados de contato para checar se meu perfil já foi enviado a {partner} para a mesma empresa. Sei que posso revogar essa autorização a qualquer momento falando com {org}. |

"Company" (not "client") in candidate-facing text: candidates don't know the recruiter's word "client" (voice guide §3.8).

### 5.8 Errors (`errors`, root, snake_case = RPC codes)

No ids, codes, other orgs or internal details. Errors with `{when}` need `msg()` to pass the parameter. If backend can't pass it, use the same sentence without the date clause, and tell ux-writer so the fallback can be checked.

| Key | en | fr-CA | pt-BR |
|---|---|---|---|
| `errors.identifier_required` | Add an email, a phone number or a LinkedIn profile to this candidate, then submit again. | Ajoutez un courriel, un numéro de téléphone ou un profil LinkedIn à ce candidat, puis soumettez de nouveau. | Adicione um e-mail, um telefone ou um perfil do LinkedIn a este candidato e envie de novo. |
| `errors.claim_window_closed` | The objection deadline passed on {when} ET. You can still decline this referral for another reason. | La date limite de l'objection est passée ({when} HE). Vous pouvez quand même refuser cette recommandation pour un autre motif. | O prazo da objeção terminou em {when} (horário de Toronto). Você ainda pode recusar esta indicação por outro motivo. |
| `errors.claim_already_filed` | An objection was already filed for this referral. Refresh to see it. | Une objection a déjà été déposée pour cette recommandation. Actualisez la page pour la voir. | Já foi registrada uma objeção para esta indicação. Atualize a página para vê-la. |
| `errors.claim_not_allowed` | You can't file an objection on this referral anymore. Refresh to see its current status. | Il n'est plus possible de déposer une objection sur cette recommandation. Actualisez la page pour voir son statut. | Não é mais possível registrar objeção nesta indicação. Atualize a página para ver o status atual. |
| `errors.claim_files_not_ready` | Some files are still processing or can't be used. Wait until they're ready, or remove them. | Certains fichiers sont encore en traitement ou ne peuvent pas être utilisés. Attendez qu'ils soient prêts ou supprimez-les. | Alguns arquivos ainda estão em processamento ou não podem ser usados. Aguarde até ficarem prontos ou remova-os. |
| `errors.claim_referral_invalid` | That referral can't be used as evidence anymore. Pick another one, or upload files. | Cette recommandation ne peut plus servir de pièce justificative. Choisissez-en une autre ou téléversez des fichiers. | Essa indicação não pode mais ser usada como comprovante. Escolha outra ou anexe arquivos. |
| `errors.contest_window_closed` | The contest deadline passed on {when} ET. The objection is final. | La date limite de contestation est passée ({when} HE). L'objection est définitive. | O prazo para contestar terminou em {when} (horário de Toronto). A objeção é definitiva. |
| `errors.dispute_already_open` | A dispute is already open for this referral. A platform admin is reviewing it. | Un litige est déjà ouvert pour cette recommandation. Un administrateur de la plateforme l'examine. | Já existe uma disputa aberta para esta indicação. Um admin da plataforma está analisando. |
| `errors.release_not_allowed` | This candidate can't be released right now. Refresh to see the referral's current status. | Ce candidat ne peut pas être libéré pour le moment. Actualisez la page pour voir le statut de la recommandation. | Não é possível liberar este candidato agora. Atualize a página para ver o status da indicação. |

The stop, the pending warning, the missing identifier and the candidate's `already_sent` are **outcomes, not errors** (EC-1). They render S1-b/c/d and S7, never a toast. `errors.identifier_required` exists only as a fallback for a code path that can't render S1-b. Version conflict and rate limit use the existing `errors.*` keys.

### 5.8a Job form (`jobs`)

`clientInternalHint` opens with "Optional" on purpose: the field must not look required (BR-32, AC-70). It frames the name as a benefit you get if you add it, never as a rule. It states the RD-020 trade-off: without a name, protection covers this job only, and you can't cite an earlier referral from another job.

| Key | en | fr-CA | pt-BR |
|---|---|---|---|
| `jobs.form.clientInternalHint` | Optional. Partners never see this name. Platform admins see it only to resolve a dispute. If you add it, Workatent catches duplicate referrals across all your jobs for this client. If you leave it blank, protection covers this job only, and you can't cite an earlier referral from another job in an objection. | Facultatif. Les partenaires ne voient jamais ce nom. Les administrateurs de la plateforme le voient seulement pour régler un litige. Si vous l'indiquez, Workatent détecte les recommandations en double pour tous vos postes chez ce client. Sinon, la protection couvre seulement ce poste, et vous ne pourrez pas citer une recommandation reçue pour un autre poste dans une objection. | Opcional. Os parceiros nunca veem este nome. Os admins da plataforma só o veem para resolver uma disputa. Se você informar, o Workatent detecta indicações duplicadas em todas as suas vagas deste cliente. Se deixar em branco, a proteção vale só para esta vaga, e você não poderá citar uma indicação recebida para outra vaga numa objeção. |
| `jobs.form.clientDuplicateHint` | Workatent also uses the client name to catch duplicate referrals across all your jobs for this client. | Workatent utilise aussi le nom du client pour détecter les recommandations en double pour tous vos postes chez ce client. | O Workatent também usa o nome do cliente para detectar indicações duplicadas em todas as suas vagas deste cliente. |

### 5.9 Admin (`admin`, `labels`)

| Key | en | fr-CA | pt-BR |
|---|---|---|---|
| `admin.disputes.description` *(changed)* | Disagreements about a placement, its payment, or a contested prior-presentation objection. Each card says what resolving it changes. | Désaccords sur un placement, son paiement ou une objection pour présentation antérieure contestée. Chaque fiche indique l'effet de la résolution. | Divergências sobre uma colocação, o pagamento dela ou uma objeção por apresentação anterior contestada. Cada cartão indica o efeito da resolução. |
| `admin.disputes.emptyHint` *(changed)* | Organizations open disputes from a placement's page, or by contesting a prior-presentation objection. | Les organisations ouvrent un litige depuis la page d'un placement ou en contestant une objection pour présentation antérieure. | As organizações abrem disputas na página da colocação ou ao contestar uma objeção por apresentação anterior. |
| `labels.disputeType.placement` | Placement | Placement | Colocação |
| `labels.disputeType.prior_presentation` | Prior presentation | Présentation antérieure | Apresentação anterior |
| `admin.disputes.claim.between` | Objection from {target} · contested by {source} | Objection de {target} · contestée par {source} | Objeção de {target} · contestada por {source} |
| `admin.disputes.claim.job` | Job: {job} | Poste : {job} | Vaga: {job} |
| `admin.disputes.claim.resolveBy` | Resolve by | Résoudre d'ici le | Resolver até |
| `admin.disputes.claim.filed` | Objection filed {when} ET | Objection déposée le {when} HE | Objeção registrada em {when} (horário de Toronto) |
| `admin.disputes.claim.priorDate` | Candidate last in process with this client: {date} | Dernière date en processus de recrutement avec ce client : {date} | Última data em processo seletivo com este cliente: {date} |
| `admin.disputes.claim.note` | Note from {target} | Note de {target} | Nota de {target} |
| `admin.disputes.claim.contestReason` | Contest reason from {source} | Motif de contestation de {source} | Motivo da contestação de {source} |
| `admin.disputes.claim.files` | Evidence files | Pièces justificatives | Comprovantes |
| `admin.disputes.claim.download` | Download {name} | Télécharger {name} | Baixar {name} |
| `admin.disputes.claim.claimedReferral` | Referral under objection | Recommandation visée par l'objection | Indicação alvo da objeção |
| `admin.disputes.claim.earlierReferral` | Earlier referral used as evidence | Recommandation antérieure citée comme pièce justificative | Indicação anterior usada como comprovante |
| `admin.disputes.claim.delivered` | Delivered {when} ET | Transmise le {when} HE | Entregue em {when} (horário de Toronto) |
| `admin.disputes.claim.clientAtDelivery` | Client at delivery: {client} | Client à la transmission : {client} | Cliente na entrega: {client} |
| `admin.disputes.claim.stillCounts` | Still counts as a presentation: {value} | Compte encore comme présentation : {value} | Ainda conta como apresentação: {value} |
| `admin.disputes.claim.samePerson` *(designer-requested)* | Same person: contact details compared | Même personne : coordonnées comparées | Mesma pessoa: dados de contato comparados |
| `admin.disputes.claim.samePersonEmail` *(designer-requested)* | Email | Courriel | E-mail |
| `admin.disputes.claim.samePersonPhone` *(designer-requested)* | Phone | Téléphone | Telefone |
| `admin.disputes.claim.samePersonLinkedin` *(designer-requested)* | LinkedIn | LinkedIn | LinkedIn |
| `admin.disputes.claim.samePersonError` *(designer-requested)* | The contact details couldn't be compared. Try again. | Impossible de comparer les coordonnées. Réessayez. | Não foi possível comparar os dados de contato. Tente de novo. |
| `labels.identifierMatch.match` *(designer-requested)* | Same | Identique | Igual |
| `labels.identifierMatch.no_match` *(designer-requested)* | Different | Différent | Diferente |
| `labels.identifierMatch.not_available` *(designer-requested)* | Not available | Non disponible | Indisponível |
| `admin.dispute.upholdClaim` | Uphold objection | Retenir l'objection | Manter objeção |
| `admin.dispute.upholdTitle` | Uphold this objection? | Retenir cette objection? | Manter esta objeção? |
| `admin.dispute.upholdDescription` | The objection is valid. The decline stands, and this referral no longer holds first position for this client. Its ownership date doesn't change. | L'objection est fondée. Le refus est maintenu, et cette recommandation perd sa priorité pour ce client. Sa date de propriété ne change pas. | A objeção é procedente. A recusa é mantida, e esta indicação perde a prioridade para este cliente. A data de titularidade não muda. |
| `admin.dispute.rejectClaim` | Reject objection | Rejeter l'objection | Rejeitar objeção |
| `admin.dispute.rejectClaimTitle` | Reject this objection? | Rejeter cette objection? | Rejeitar esta objeção? |
| `admin.dispute.rejectClaimDescription` | The objection isn't valid. The referral goes back to {target} for review, and they can't file another objection on it. It keeps first position, and its ownership date doesn't change. | L'objection n'est pas fondée. La recommandation retourne en examen chez {target}, qui ne pourra pas déposer d'autre objection sur celle-ci. Elle conserve sa priorité, et sa date de propriété ne change pas. | A objeção é improcedente. A indicação volta para análise de {target}, que não poderá registrar outra objeção nela. Ela mantém a prioridade, e a data de titularidade não muda. |
| `admin.dispute.resolutionVisible` | Both organizations read this resolution. Don't include client names or details from the evidence files. | Les deux organisations liront cette résolution. N'y indiquez ni nom de client ni détail tiré des pièces justificatives. | As duas organizações vão ler esta resolução. Não inclua nomes de clientes nem detalhes dos comprovantes. |
| `admin.dispute.languageHint` (Should) ⚖️ draft (C-5) | Languages: {source} · {sourceLanguage}, {target} · {targetLanguage}. Write in French or bilingually for organizations in Québec. | Langues : {source} · {sourceLanguage}, {target} · {targetLanguage}. Rédigez en français ou en version bilingue pour les organisations du Québec. | Idiomas: {source} · {sourceLanguage}, {target} · {targetLanguage}. Escreva em francês ou de forma bilíngue para organizações do Québec. |
| `admin.flags.title` | Organizations to review | Organisations à examiner | Organizações para analisar |
| `admin.flags.stops` | one: "{count} stopped referral in 7 days" · other: "{count} stopped referrals in 7 days" | one: "{count} recommandation bloquée en 7 jours" · other: "{count} recommandations bloquées en 7 jours" | one: "{count} indicação bloqueada em 7 dias" · other: "{count} indicações bloqueadas em 7 dias" |
| `admin.flags.rejectedClaims` | one: "{count} rejected objection in 90 days" · other: "{count} rejected objections in 90 days" | one: "{count} objection rejetée en 90 jours" · other: "{count} objections rejetées en 90 jours" | one: "{count} objeção rejeitada em 90 dias" · other: "{count} objeções rejeitadas em 90 dias" |
| `admin.flags.empty` | No organizations flagged. | Aucune organisation signalée. | Nenhuma organização sinalizada. |
| `admin.flags.note` | Flags are signals for review. Nothing happens automatically. | Ces signalements servent à l'examen. Aucune mesure n'est prise automatiquement. | Os sinais servem para análise. Nada acontece automaticamente. |
| `admin.duplicateMetrics.title` | Duplicate protection (last 30 days) | Protection contre les doublons (30 derniers jours) | Proteção contra duplicidade (últimos 30 dias) |
| `admin.duplicateMetrics.hitsJob` | Duplicates found: same job | Doublons détectés : même poste | Duplicidades: mesma vaga |
| `admin.duplicateMetrics.hitsClient` | Duplicates found: same client | Doublons détectés : même client | Duplicidades: mesmo cliente |
| `admin.duplicateMetrics.stops` | Referrals stopped | Recommandations bloquées | Indicações bloqueadas |
| `admin.duplicateMetrics.pendingWarnings` | Pending warnings | Avertissements (en attente du candidat) | Avisos de confirmação pendente |
| `admin.duplicateMetrics.identifierRefusals` | Refused for missing contact details | Refus pour coordonnées manquantes | Recusas por falta de dados de contato |
| `admin.duplicateMetrics.claims` | Objections filed | Objections déposées | Objeções registradas |
| `admin.duplicateMetrics.contestRate` | Objections contested | Objections contestées | Objeções contestadas |
| `admin.duplicateMetrics.releases` | Candidates released | Candidats libérés | Candidatos liberados |
| `admin.duplicateMetrics.openDisputes` | Open objection disputes | Litiges sur objection ouverts | Disputas de objeção abertas |
| `admin.duplicateMetrics.resolvedOnTime` | Resolved within 5 business days | Résolus en 5 jours ouvrables ou moins | Resolvidas em até 5 dias úteis |
| `admin.duplicateMetrics.rejectedShare` | Objections rejected | Objections rejetées | Objeções rejeitadas |

Notes:
- **"Same person" block:** the pills say **Same / Different / Not available**, not "match", which is the glossary word for a candidate × job result. The block shows the outcome only: no values, hashes or partial values, and nothing about which side lacked an identifier. `not_available` covers "one or both referrals have no such identifier", without saying which. `samePersonError` needs a retry button: use the existing generic `common.actions` retry key if there is one; otherwise frontend asks ux-writer for one.
- `stillCounts` `{value}`: render the existing common Yes / No strings, never a raw boolean.
- `admin.disputes.description` drops "Resolving one returns the placement to its prior status", which is only true for placements. Each card's confirm dialog states its own effect.

### 5.10 Notifications and emails (`emails`; in-app text per PD-026)

**In-app notifications** (English only, written by SQL in `app.notify_org`, PD-026; not in the JSON files):

| Kind | Title | Body |
|---|---|---|
| `referral.already_presented` | Referral not delivered: already presented | {candidate} had already been presented to {partner} for this client, so your referral wasn't delivered. |
| `claim.filed` | Prior-presentation objection on your referral | {partner} filed an objection on your referral of {candidate}. You can contest it until {when} ET. |
| `dispute.opened` (`prior_presentation`) | Objection contested | A platform admin is reviewing the prior-presentation objection on {candidate}. |
| `dispute.resolved` (`prior_presentation`) | Objection upheld · or · Objection rejected (by outcome) | Read the platform admin's resolution on the referral. |

**Emails** (`emails`, recipient's locale). They follow the existing `subject` / `preheader` / `heading` / `body` / `cta` shape, and the shared `chrome` footer. They have no `note`, because they link to the app and not to a token. `disputeOpened` and `disputeResolved` go to **both** orgs, so their text doesn't use `{partner}` (it would name a different org for each recipient). `{outcome}` = `labels.claimStatus.upheld` / `.rejected` in the recipient's locale.

| Key | en | fr-CA | pt-BR |
|---|---|---|---|
| `emails.claimFiled.subject` | {partner} filed an objection on your referral | {partner} a déposé une objection sur votre recommandation | {partner} registrou uma objeção à sua indicação |
| `emails.claimFiled.preheader` | You can contest it until {when} ET. | Vous pouvez la contester jusqu'au {when} HE. | Você pode contestá-la até {when} (horário de Toronto). |
| `emails.claimFiled.heading` *(new)* | Prior-presentation objection on your referral | Objection pour présentation antérieure sur votre recommandation | Objeção por apresentação anterior à sua indicação |
| `emails.claimFiled.body` | {partner} says they already had {candidate} in process for this client, and declined your referral for {job}. On the referral, you can see the dates, the type of evidence and their note. Contesting is free: a platform admin reviews the evidence. | {partner} affirme avoir déjà eu {candidate} en processus de recrutement pour ce client et a refusé votre recommandation pour le poste {job}. Sur la recommandation, vous voyez les dates, le type de pièce justificative et sa note. La contestation est gratuite : un administrateur de la plateforme examine les pièces justificatives. | {partner} diz que já tinha {candidate} em processo seletivo com este cliente e recusou sua indicação para a vaga {job}. Na indicação, você vê as datas, o tipo de comprovante e a nota de {partner}. Contestar é gratuito: um admin da plataforma analisa os comprovantes. |
| `emails.claimFiled.cta` | Review the objection | Voir l'objection | Ver a objeção |
| `emails.disputeOpened.subject` | Objection on {candidate} contested | Objection sur {candidate} contestée | Objeção sobre {candidate} contestada |
| `emails.disputeOpened.preheader` *(new)* | A platform admin is now reviewing it. | Un administrateur de la plateforme l'examine maintenant. | Um admin da plataforma está analisando o caso. |
| `emails.disputeOpened.heading` *(new)* | Objection contested | Objection contestée | Objeção contestada |
| `emails.disputeOpened.body` *(new)* | The prior-presentation objection on the referral of {candidate} for {job} was contested. A platform admin is reviewing the evidence and will write a resolution. Both organizations are notified of the outcome. | L'objection pour présentation antérieure visant la recommandation de {candidate} pour le poste {job} a été contestée. Un administrateur de la plateforme examine les pièces justificatives et rédigera une résolution. Les deux organisations seront avisées du résultat. | A objeção por apresentação anterior à indicação de {candidate} para a vaga {job} foi contestada. Um admin da plataforma está analisando os comprovantes e vai escrever uma resolução. As duas organizações serão avisadas do resultado. |
| `emails.disputeOpened.cta` | Open referral | Ouvrir la recommandation | Abrir indicação |
| `emails.disputeResolved.subject` | Objection on {candidate}: {outcome} | Objection sur {candidate} : {outcome} | Objeção sobre {candidate}: {outcome} |
| `emails.disputeResolved.preheader` *(new)* | Read the platform admin's resolution. | Lisez la résolution de l'administrateur de la plateforme. | Leia a resolução do admin da plataforma. |
| `emails.disputeResolved.heading` *(new)* | A platform admin resolved the objection | Un administrateur de la plateforme a tranché l'objection | Um admin da plataforma resolveu a objeção |
| `emails.disputeResolved.body` *(new)* | A platform admin resolved the prior-presentation objection on the referral of {candidate} for {job}. Outcome: {outcome}. The written resolution is on the referral. | Un administrateur de la plateforme a tranché l'objection pour présentation antérieure visant la recommandation de {candidate} pour le poste {job}. Résultat : {outcome}. La résolution écrite se trouve sur la recommandation. | Um admin da plataforma resolveu a objeção por apresentação anterior à indicação de {candidate} para a vaga {job}. Resultado: {outcome}. A resolução por escrito está na indicação. |
| `emails.disputeResolved.cta` | Read the resolution | Lire la résolution | Ler a resolução |
| `emails.alreadyPresented.subject` | Your referral for {job} wasn't delivered | Votre recommandation pour le poste {job} n'a pas été transmise | Sua indicação para a vaga {job} não foi entregue |
| `emails.alreadyPresented.preheader` *(new)* | Nothing was shared with {partner}. | Rien n'a été transmis à {partner}. | Nada foi compartilhado com {partner}. |
| `emails.alreadyPresented.heading` *(new)* | Referral not delivered | Recommandation non transmise | Indicação não entregue |
| `emails.alreadyPresented.body` | {candidate} confirmed, but they had already been presented to {partner} for this client, so this referral wasn't delivered. | {candidate} a confirmé, mais avait déjà été présenté à {partner} pour ce client : cette recommandation n'a donc pas été transmise. | {candidate} confirmou, mas já tinha sido apresentado a {partner} para este cliente, por isso esta indicação não foi entregue. |
| `emails.alreadyPresented.cta` | Open referral | Ouvrir la recommandation | Abrir indicação |

The `alreadyPresented` email and notification follow BR-9: they name only the submitter's own hiring partner and "this client". They never say who presented first, which job or when, and they never say the candidate can't be hired.

### 5.11 Truncation and layout risks (for frontend and product-designer)

Measured on en → fr character counts. en buttons stay ≤ 25 characters except `claim.submit` (26).

| Where | Strings | Risk | Recommendation |
|---|---|---|---|
| S5 claim dialog footer (`sm:max-w-lg`, 3 buttons in one row) | `claim.back` 23 → fr 26 · `common` Cancel 6 → 7 · `claim.submit` 26 → fr 30 / pt 27 | **Won't fit on one row in fr or pt, and is tight in en** (about 55–63 characters of label plus 3 paddings, in roughly 460px of usable width). | Stack the footer from `sm` down, or move **Back to decline reasons** to a ghost link at the top of the body (it's a navigation, not a form action). |
| S2 action bar, hiring side | `claim.trigger` "File objection" 14 → fr "Déposer une objection" 21 | Wraps next to Accept / Decline / Request info at 375px. | Allow the bar to wrap. Keep the short label. |
| S6 Sent list chip | `sent.claimOpenChip` with `{when}` (weekday + date + time): en about 30, fr about 45, pt about 44 characters | Chips usually `truncate`; the date would be cut. | Let this chip wrap, or render `{when}` without the weekday in chips. |
| S1-c / S1-d alert titles | `duplicate.pendingTitle` fr 50 + `{partner}`; `stopTitle` fr 22 | `AlertTitle` has `line-clamp-1`. The spec overrides it for S1-d only. | Override `line-clamp-1` for S1-c as well. |
| S5 file rows | `file.ready` pt "Pronto · {size} · carregado em {when} (Toronto)" about 50 characters | Second line under the name, at 375px | Wrap is expected (spec says it does); just don't truncate the state text. |
| S11 job form hint | `jobs.form.clientInternalHint` en about 300, fr about 400 characters | 7–9 lines at 375px under the input | Acceptable as helper text. If designer wants it shorter, split it: the first two sentences as the hint, the rest behind a "Why add it?" disclosure. The "Optional" opener must stay visible. |
| Withdraw dialog step 2 footer | Back · Cancel · `withdraw.releaseConfirm` fr "Retirer et libérer" 18 | OK at `sm`; stacks on mobile per §3 | — |
| Status / dispute pills | `labels.claimStatus.*` fr max 10, `labels.identifierMatch.not_available` fr 14, `labels.referralStatus.already_presented` fr 13 | None | — |
| `BusinessDeadline` | `deadline.endsToday` fr "Dernier jour" (chosen over "Se termine aujourd'hui" for length) | None | — |

---

## 6. Accessibility (WCAG 2.2 AA, per brief §7)

**Keyboard paths and focus order**
- **Composer**: Tab order inside the submit panel goes alert (if any) → authorization options → note → submit. On S1-c, focus moves to the warning alert, then the acknowledgement checkbox (Space toggles) → **Submit anyway** (enabled once ticked) → **Cancel**. On S1-d, focus moves to the stop alert title (`tabIndex=-1`), then **Back to opportunities** → support link. The disabled submit (S1-b) has `aria-describedby` = the identifier alert, and **Edit candidate** comes before it in the tab order.
- **Withdraw dialog**: Tab order goes reason → release checkbox (Space toggles) → Cancel → Withdraw/Continue. Step 2: focus on the title, then Back → Cancel → Withdraw and release. Esc closes the dialog without changes at either step. Focus returns to the **Withdraw** trigger.
- **Claim dialog**: Tab order goes **Back to decline reasons** link (top of body, when present) → evidence `RadioGroup` (arrows switch options) → (the deadline line is plain text, read before the file button) → file button → each file row's actions (Cancel upload / Try again / Remove) → date → note → attestation → Cancel → submit. File state changes are announced through the list's `aria-live="polite"` region (for example "invoice.pdf ready", "invoice.pdf can't be used"), without moving focus. When a file is removed, focus moves to the next row's Remove button, or to the file button if none is left. The disabled submit has a visible reason line linked with `aria-describedby`. The referral picker is a `radiogroup`: arrow keys move, Space selects, the first enabled option is focusable. After a server error, focus moves to the error block at the top. After a field error, focus moves to the first invalid field.
- **Claim panel**: copy buttons and downloads are reachable in reading order. **Contest claim** opens a dialog whose focus starts on the reason field.
- **Review panel**: the existing shortcuts (`a`, `d`, `i`, Esc) are unchanged. The claim is reached through `d` → callout button. No single-key shortcut files a claim.
- **Admin**: each dispute card is a `section` with a heading. Its action buttons follow the content.

**Labels and announcements**
- Stop and pending outcomes use `role="alert"` (one announcement per attempt). The deadline is text ("Ends today", "3 business days left"), never colour alone.
- Every status pill (referral status, claim status, dispute type) pairs an icon (`aria-hidden`) with text.
- The file input has a visible label and hint linked with `aria-describedby`. The selected-file list is a `ul` with an `aria-live="polite"` count ("2 files selected").
- The attestation and release checkboxes are wrapped in their `Label` (click target = full text). Their errors are linked with `aria-describedby` and `aria-invalid`.
- The SHA-256 has a visible label "SHA-256" (`dt`). The copy button has `aria-label` = `claim.panel.copyShaAria`. The "Copied" tooltip is also announced via `aria-live="polite"`.
- Date input: label + hint with the allowed range written as dates, not just enforced through `min`/`max`.

- **Candidate page `already_sent`**: after confirming, focus moves to the result `h1`. The state is also the server-rendered page on revisit.
- **Job form**: the client name input's `aria-describedby` points to whichever hint is visible.

**Contrast and targets**
- Warning and info alerts use the `*-soft` token pairs already in `globals.css` (≥ 4.5:1 for body text in light and dark). Monospace hash text uses `text-foreground`, not muted.
- Every interactive element is ≥ 44 × 44 px, including remove-file, copy-hash, the picker cards and the checkbox label rows. The existing `icon-sm` buttons are too small for the new icon buttons; use `size="icon"` or pad the hit area.
- Reflow at 320/375px with no horizontal scroll. fr strings run about 30% longer and must wrap (no `line-clamp` on alert titles).

---

## 7. Acceptance criteria

"Presentation" = an earlier referral that counts under BR-4. "A" = the sourcing org submitting now, "A1" = another sourcing org, "B" = the hiring org, "C" = a different hiring org. Unless an AC says otherwise, each submission AC holds on **both** paths (recorded authorization and candidate-confirmed) and for **each** identifier type (email, phone, LinkedIn).

### Submission check
- **AC-1** (BR-3a, BR-6) Given A1's referral of candidate X to B's job J1 is a presentation, when A submits a record with one matching identifier to J1, then the submission is stopped. No referral row exists, no candidate email is sent, B gets no notification and nothing in its queue, the composer shows S1-d, and audit events "fingerprint hit (scope=job, outcome=stop)" and "submission stopped" exist.
- **AC-2** (BR-3b, BR-23) Given X is presented to B's job J1 with client "ABC Inc.", when A submits X to B's job J2 with client "abc" (and, separately, "A.B.C. Ltée" and "Abc Corporation"), then the submission is stopped with S1-d.
- **AC-3** (BR-23) Given two of B's jobs with client "Confidential", "confidentiel", "N/A" or empty, and X presented to the first, when X is submitted to the second, then there is no stop or warning. Submitting X to the first job itself is still stopped.
- **AC-4** (BR-3) Given X is presented to C's job with client "ABC", when A submits X to B's job with client "ABC", then the submission succeeds normally (no stop, no warning).
- **AC-5** (BR-9) Given four stop situations (job-level hit, client-level hit, earlier referral from A's own org, earlier referral from A1), plus a sticky stop, then the action response has the same outcome code and the same set of fields in all five cases, and the rendered S1-d text is byte-identical apart from the opaque `{reference}`. The reference is present in every case, sticky stops included. It's a **random opaque token, unique per stop** (stored on the hit row; PD-033, amends PD-025), so it differs per stop and carries no scope, source, identifier or id information. The support `mailto:` has the subject "Stopped referral {reference}" and no body. When no support address is configured, the support line is hidden in all five cases alike. The text contains no org or recruiter name other than the job's own hiring org ({partner}), no date, status, count, client name, or "this job / another job" wording.
- **AC-6** (BR-23) Given X was presented to B's J1 when J1's client was "ABC", when B renames J1's client to "XYZ" and A submits X to B's J2 with client "ABC", then the submission is stopped. A submission of X to a B job with client "XYZ" is not stopped by that referral.
- **AC-7** (BR-1) Given a presentation whose candidate has email `Jane.Doe@Example.com `, phone `(416) 555-0100` (country CA) and LinkedIn `https://www.linkedin.com/in/Jane-Doe/?trk=x`, when A submits a record with `jane.doe@example.com`, or `+14165550100`, or `linkedin.com/in/jane-doe`, then each is stopped. (Should) `jane.doe+tag@example.com` is also stopped.
- **AC-8** (BR-5, BR-7, EC-1) Given A1's referral of X to J1 is `awaiting_candidate`, when A submits X to J1, then S1-c shows with the acknowledgement unticked and **Submit anyway** disabled, and no referral exists yet. When A selects **Cancel**, there is still no referral and the normal submit button returns. When A ticks the acknowledgement and selects **Submit anyway**, the referral is created as usual. If A1's referral was delivered between the two attempts, the second attempt is stopped instead (S1-d). See AC-64 for the step-1 side-effect rules.
- **AC-9** (BR-4, BR-30) Given an earlier referral of X to J1, delivered and inside its window, whose current status is any of `submitted`, `under_review`, `info_requested`, `accepted`, `interviewing`, `offer`, `hired`, `rejected`, `declined` (each reason, including legacy `duplicate` and an open `prior_presentation` claim), `withdrawn` (not released) or `cancelled`, when A submits X to J1, then the submission is stopped.
- **AC-10** (BR-4, BR-5) Given an earlier referral of X to J1 that is outside its ownership window, released, claim-upheld, claim-final, `already_presented` or `candidate_declined`, when A submits X to J1, then that referral causes no stop and no warning. An earlier `awaiting_candidate` referral causes the warning only (AC-8).
- **AC-11** (BR-4, A-7) Given X is presented to B's J1 at client "ABC" and B cancels J1 (and the referral), when B posts J3 at client "ABC Inc." and A submits X to J3, then the submission is stopped.

### Identifier requirement
- **AC-12** (BR-10) Given candidate Y has no email, no phone and no LinkedIn, when the composer opens, then S1-b shows, **Submit candidate** is disabled and **Edit candidate** links to Y's edit page. When the submit action is called directly (forged form) on either path, then it returns the outcome `identifier_required` (rendered as S1-b, not as an error toast), nothing is created or sent, and the "submission refused for no identifier" audit event exists.
- **AC-13** (BR-1, BR-10) Given Y's only identifier is a phone that can't be normalised to E.164, when A submits on the recorded path, then the call returns `identifier_required` (S1-b alert in the panel) and nothing is sent.

### Sticky stop
- **AC-14** (BR-24) Given A's record Y was stopped (or closed as already presented) for B's J1 at time T, when A deletes Y's email, changes its phone and resubmits Y to J1 before T + 30 days, then the submission is stopped with the same S1-d and a `sticky_stop` audit event. The same happens for B's J2 with the same client key. It also holds if the earlier presentation stopped counting after T. After T + 30 days, the normal check applies (no stop if nothing counts). The sticky-stop row holds no identifiers.

### Delivery re-check and closure
- **AC-15** (BR-8, BR-9) Given A's referral of Y to J1 is `awaiting_candidate` with no hit, and A1's referral of X to J1 is a presentation, when the candidate edits their phone on the confirmation page to X's phone and confirms, then A's referral becomes `already_presented`. `respond_candidate_request` returns `already_sent`, and the candidate sees S7 "Your profile was already sent" (see AC-69). B has no row, count, notification or member-visible audit entry for it. A sticky-stop record exists for Y × J1.
- **AC-16** (BR-8, R-4, A-8) Given A's and A1's referrals of the same person to J1 are both `awaiting_candidate`, when the candidate confirms A1's link and then A's, then A1's referral is delivered, A's becomes `already_presented`, and B sees exactly one referral.
- **AC-17** (BR-8, BR-20) Given a referral closed as `already_presented`, when A opens it, then S2-b shows: the "Already presented" pill, the neutral banner, the timeline actor "Workatent", the "wasn't delivered" ownership line and no actions. A's submitting recruiter received the in-app notification, and no other A member did. No email in N1 (PD-030). Given the submitting member is no longer an active member of A when the closure happens, then the notification goes instead to A's owners and admins (organization admin role), so it's never sent to no one (PD-028). The Sent list shows the "Already presented" pill with no progress track.

### Probing defence
- **AC-18** (BR-22, BR-19, A-1) Given a member who has made 30 submission attempts in the past hour (any mix of stops, pending warnings, identifier refusals and successes), when they try again, then they get the rate-limit error and no check runs. Every hit has an audit event with job id, scope and outcome only. No RPC or action exists that runs the check outside a submission. Calling `submit_referral` with an inactive candidate, a closed job or a missing authorization fails **before** the check (no hit audit event).

### Withdraw and release
- **AC-19** (BR-25) Given a delivered referral that meets all three release guards (delivered, still counts, no open dispute), when the sourcing side selects **Withdraw**, then S3 opens with the release checkbox **unticked** and its consequence text visible. When the referral was never delivered (for example `awaiting_candidate`), is outside its window, or has an open referral-level or placement dispute, then the withdraw dialog has **no** release option: it's absent, not disabled. A forged withdraw-with-release call in those cases is refused (`release_not_allowed`) and nothing is withdrawn or released.
- **AC-20** (BR-25, BR-4) Given S3 with release ticked, when the user selects **Continue**, then step 2 shows. **Back** keeps the reason and the tick, **Cancel** changes nothing, and **Withdraw and release** withdraws and releases. Afterwards the referral is `withdrawn` and flagged `released`, a release audit event exists, B received only the normal withdrawal notification, A's ownership footer reads "Released on {date}…", no UI offers to undo it, and A1 can now submit X to J1 (or to another B job at the same client) without a stop.
- **AC-21** (BR-4) Given S3 without the tick, when the user withdraws, then the referral is `withdrawn`, not released, the toast says it keeps first position until {date}, and A1's submission of X to J1 is stopped.
- **AC-22** (Must, BR-25, RD-019, PD-021; scenario 42) Given a delivered, still-counting `withdrawn` referral, and separately a delivered, still-counting `cancelled` referral (cancelled by the hiring side), each with no open dispute, then the sourcing side sees **Release candidate** on each. Selecting it opens step 1; **Continue** opens step 2, with irreversible wording; **Release permanently** releases. Neither step alone releases, and **Back** or **Cancel** at either step changes nothing. Afterwards, the referral is flagged `released`, a release audit event exists, no notification reaches the hiring side, the sourcing side's footer reads "Released on {date}…", the button is gone, and a second partner can submit the candidate to that job (and to another job of the hiring org at the same client) without a stop. The hiring side still sees "Withdrawn" or "Cancelled" and can't read the flag through the UI or API (AC-68).
- **AC-22a** (Must, BR-25; scenario 43) Given a referral that fails any guard, then **Release candidate** isn't rendered (not disabled), and a direct call to the release RPC is refused with nothing changed. The failing cases are: never delivered (withdrawn while `awaiting_candidate`); outside the ownership window; already released; claim upheld; claim final; `already_presented`; an open referral-level dispute; an open dispute on a placement from it; status `declined` or `rejected`. A call from the hiring side or another org gets "Referral not found." The same guards hide the withdraw dialog's release option (AC-19).
- **AC-23** (BR-25, BR-20, PD-020) Given any release (withdraw dialog or release later), then no notification or member-visible indication of the release reaches B. B's queue, referral page, timeline, ownership footer and pipeline show "Withdrawn" or "Cancelled" exactly as for an unreleased referral (see AC-68 for the API).

### Decline reasons
- **AC-24** (BR-11) Given the single and bulk decline dialogs, then "Already in process" isn't offered. When `review_referral` or `decline_referrals` is called with `duplicate` or `prior_presentation`, then it's refused. The referral page's free-text decline (`transition_referral`) can't produce the reason code `prior_presentation`.
- **AC-25** (BR-11, BR-30) Given a referral declined with `duplicate` before N1, then both sides see "Already in process (legacy)" with the legacy hint, and neither side gets a claim or contest action. Inside its window it still stops new submissions (AC-9).
- **AC-26** (BR-14, A-9) Given the bulk decline dialog with ≥ 2 referrals selected, then there is no objection callout, and the hint `queue.bulkClaimHint` ("To file a prior-presentation objection, open one referral at a time.") is shown.

### Prior-presentation claim
- **AC-27** (BR-12, BR-13, BR-27) Given a referral on B's side, then the claim callout (decline dialog, single) and the **File prior-presentation claim** button (referral page) show **only if** the status is `submitted`, `under_review` or `info_requested`, now < `claim_deadline_at`, no claim was ever filed and the referral isn't flagged "claim rejected". They're absent after accept, after the deadline, after any claim, and on the sourcing side. A referral whose sharing authorization was **revoked** is eligible under the same conditions: the claim entry shows, and the review panel shows **File objection** in its footer even though its accept and decline buttons stay hidden for revoked referrals (S2-i, PD-028).
- **AC-28** (BR-17) Given a claim deadline of Fri 2026-11-20 23:59:59 ET, when B views the claim form on Wed 2026-11-18 (any time ET), then the deadline reads "Fri, Nov 20, 11:59 p.m. ET · 2 business days left" (en-CA format). On Fri 2026-11-20 it reads "… · Ends today". This holds when the viewer's device is in another time zone.
- **AC-29** (BR-12, A-4, A-5, EC-2) Given the claim form with file evidence on a referral whose `delivered_at` is 2026-11-13 ET, when B enters a prior-process date of 2026-11-13 or later, or earlier than 2026-05-13, or leaves the attestation unticked, or attaches no file, then the claim is refused with the matching field error, files stay attached and nothing is declined. The server enforces the same rules on a forged call.
- **AC-30** (BR-15) Given the claim form, when B selects a file that isn't PDF, PNG or JPEG, a 6th file, or a file over 10 MB, then the matching field error shows and the file isn't uploaded. A file whose signature doesn't match its type is uploaded and then ends **Rejected** (AC-65). Accepted files are stored in the evidence bucket (separate from candidate documents) and are downloadable only after the scan passes. The file life cycle and hash rules are in AC-65 and AC-66.
- **AC-31** (BR-26 rev. 4.2, PD-029) Eligibility is judged **at the objected-to referral C's `delivered_at`** for window and release, and **now** for upheld/final objections and `already_presented`. Given B received these referrals, then the picker lists **exactly R1, R2, R4b and R7**, and filing an objection citing any of them succeeds:
  - **R1:** same job as C, delivered before C, counts.
  - **R2:** same client key as C's snapshot, delivered before C, counts. It may be internal (BR-31) or have its sharing authorization revoked (PD-028).
  - **R3:** delivered after C.
  - **R4a:** released **before** C's delivery.
  - **R4b:** released **after** C's delivery.
  - **R5:** objection against it upheld or final.
  - **R6:** `already_presented`, never visible to B.
  - **R7:** ownership window ended **after** C's delivery but before the objection is filed.

  A forged objection citing R3, R4a or R5 is refused with the same `claim_referral_invalid` result whatever the reason. With referral evidence, the prior-process date equals the cited referral's `delivered_at` date (ET) and isn't editable.
- **AC-32** (BR-12, BR-16, BR-20, BR-28) Given a valid claim, when B files it, then the referral is `declined` with reason `prior_presentation`, `contest_deadline_at` is stored as 10 business days after the filing time (BR-17), A is notified with that deadline, a "claim filed (evidence type)" audit event exists, both sides see the claim panel, and while the claim is open a submission of X to J1 by A1 is stopped.
- **AC-33** (BR-12, BR-13) Given a referral whose `claim_deadline_at` has passed, or that B accepted, when a claim is attempted (forged call, or a dialog left open), then it's refused (`claim_window_closed` / `claim_not_allowed`) and the dialog shows the inline error with **Back to decline reasons**.
- **AC-34** (BR-12, A-6) Given a referral delivered Mon 2026-11-16 that B moved to `info_requested` on Tue and that A answered on Thu, then B can still file a claim until Mon 2026-11-23 23:59:59 ET (no pause), and not after.
- **AC-35** (BR-27) Given a referral that already has a claim (open, final, upheld or rejected), when a second claim is attempted, then it's refused with `claim_already_filed`. After a rejection, the claim callout and button never return for that referral.
- **AC-36** (BR-19) Given a member who filed 10 claims in the past hour, when they file another, then they get the rate-limit error. The submission and dispute buckets are unaffected.

### Sourcing side's view of a claim
- **AC-37** (BR-15) Given a file-evidence claim against A's referral, when A opens the referral, then the claim panel shows exactly: filed time, prior-process date, evidence type, for each file "File N" + upload time + full SHA-256, the note (or "No note."), and the contest deadline with business days left. No file name, MIME type, size or download control appears, and the "files are visible only to…" line is shown.
- **AC-38** (BR-15, A-11) Given A's member session, when any action or RPC that authorizes or signs an evidence file is called with the claim's file ids, then it's refused with no URL and no metadata beyond AC-37. No evidence table or bucket object is readable by A through PostgREST or Storage.
- **AC-39** (BR-15, BR-26) Given a referral-evidence claim, then A sees "Earlier referral through Workatent" and the prior-process date only: no referral id, org, job or link. B sees the same label plus a link to the earlier referral.

### Contest and finality
- **AC-40** (BR-16, BR-19, BR-20) Given an open claim before `contest_deadline_at`, when A contests with a reason of ≥ 5 characters, then a dispute of type `prior_presentation` referencing the referral is created, both orgs are notified, it appears in `/admin/disputes`, the panel shows "Contested on {date}…", and the contest counts against the 5/h disputes bucket. A reason under 5 characters is refused inline.
- **AC-41** (BR-16, BR-18, BR-20) Given an open claim with no contest when `contest_deadline_at` passes, then the claim is `final` with no notification. Both panels show "Final: not contested by {when} ET". The referral is flagged for N3 as no ownership, the ownership footer reads "No ownership…", and A1 can now submit X to J1 without a stop.
- **AC-42** (BR-16) Given `contest_deadline_at` has passed, then **Contest claim** isn't shown, and a forged contest is refused with `contest_window_closed`. Given a referral with an open dispute, a second contest is refused with `dispute_already_open`.

### Admin resolution
- **AC-43** (BR-16, BR-18) Given open placement and prior-presentation disputes, when a platform admin opens `/admin/disputes`, then both kinds are listed with type badges. A prior-presentation card shows both orgs, job title, delivery and claim times, prior-process date, evidence type, note, contest reason, files (name, size, upload time, SHA-256, scan status) and the "Resolve by" deadline. For referral evidence, the claimed and earlier referrals show side by side with org, job, client at delivery, delivery time, status and "still counts".
  - **"Same person" block** (PD-024): it appears **only** on disputes whose claim uses earlier-referral evidence. It has exactly three rows, Email, Phone and LinkedIn, each showing `match`, `no match` or `not available` as icon + text.
    - Given two referrals that share an email, have different phones, and where one has no LinkedIn, the rows read match / no match / not available.
    - No row, tooltip, DOM attribute or network response contains an identifier value, a partial value or a hash.
    - Each load of the block writes an admin audit event (admin, dispute; no identifiers).
    - Calling the RPC as a non-admin, with a placement dispute, or with a file-evidence dispute is refused.
  - **File-evidence disputes show no "same person" block.**
  - No prior-presentation card shows a candidate name or candidate label, a shared profile or candidate documents.
- **AC-44** (BR-15, PD-024) Given a prior-presentation card, when the admin downloads a file, then a 60-second signed URL is issued only after the scan passes, and an audit event records the admin, file and dispute. Given a claim that has **no** dispute (open, final or upheld without a contest), when the admin download action is called for its files (forged call), then it's refused with no URL; admin file access in-app exists only for claims with a dispute, open or resolved. A non-admin requesting `/admin/disputes` gets 404, and the admin download action refuses non-admins.
- **AC-45** (BR-18) Given a contested claim, when the admin selects **Uphold claim** with a resolution of ≥ 5 characters, then the dispute closes as upheld, the referral stays `declined`, is flagged `prior_presentation_upheld` and stops counting, `ownership_protected_until` is unchanged, both orgs are notified, both panels show "Upheld…" with the resolution text, and the dispute appears in history with the "Upheld" pill.
- **AC-46** (BR-18, BR-27) Given a contested claim, when the admin selects **Reject claim** with a resolution, then the referral returns to `submitted`, is flagged "claim rejected", a review-clock start equal to the resolution time is stored, `ownership_protected_until` is unchanged, both orgs are notified, and the referral still stops A1's submissions throughout.
- **AC-47** (BR-18) Given a referral whose objection was rejected (`claim_rejected`), then B's queue row shows the "Objection rejected" chip, B's panel and referral page show the target banner, the decline dialog has no objection callout, the referral page has no **File objection** button, A's page shows the source banner, and A can withdraw (with or without release; without release it keeps first position, AC-21).
- **AC-48** Given a placement dispute, then its card, resolve/reject buttons, effects and copy behave exactly as before N1 (regression).
- **AC-49** (Should, C-5) Given a prior-presentation card, then it shows each org's preferred language and the hint to write in French or bilingually for Québec organizations.

### Abuse flags and metrics (Should)
- **AC-50** (BR-29) Given org A with 6 stops as sourcing side in the past 7 days, then A appears in **Organizations to review** with "6 stopped referrals in 7 days". Given org B with 2 rejected objections in the past 90 days, then B appears with "2 rejected objections in 90 days". With no flagged org, the panel shows "No organizations flagged." Being flagged triggers no automatic action.
- **AC-51** (brief §4) Given activity in the last 30 days, then the Duplicate protection panel shows each §4 count and rate, computed from aggregates only (no candidate, identifier or client data).

### Business days (BR-17, BR-28)
- **AC-52** (BR-17, PD-019) Given the seeded holiday table (brief appendix A), then `claim_deadline_at` (5 business days) is computed as follows, each at 23:59:59 America/Toronto:

| Delivered (ET) | Expected deadline | Covers |
|---|---|---|
| Fri 2026-11-13 18:00 | Fri 2026-11-20 | scenario 25 |
| Sat 2026-11-14 10:00 | Fri 2026-11-20 | weekend start (26) |
| Wed 2026-06-24 (Fête nationale) 09:00 | Thu 2026-07-02 (skips 24 June, 1 July) | holiday start (26, 27) |
| Thu 2026-12-24 12:00 | Tue 2027-01-05 (skips 25 Dec, the substitute 2026-12-28 and 1 Jan; counts 31 Dec) | Christmas–Boxing Day (27, 28, 41) |
| Fri 2027-12-24 12:00 | Wed 2028-01-05 (skips the substitutes 2027-12-27, 2027-12-28 and 2028-01-03; counts 31 Dec) | substitutes (41) |
| Fri 2028-06-23 12:00 | Fri 2028-06-30 (counts Mon 2028-06-26: no substitute for a Saturday 24 June) | 41 |
| Thu 2028-06-29 12:00 | Thu 2028-07-06 (counts Mon 2028-07-03: no substitute for a Saturday 1 July) | 41 |
| Thu 2027-03-25 12:00 | Mon 2027-04-05 (skips Good Friday 26 Mar and Easter Monday 29 Mar) | Easter (27) |
| Fri 2027-02-12 12:00 | Mon 2027-02-22 (skips Family Day 15 Feb) | Family Day (27) |
| Tue 2026-11-10 12:00 | Tue 2026-11-17 (counts Remembrance Day 11 Nov) | 28 |
| Tue 2026-09-29 12:00 | Tue 2026-10-06 (counts 30 Sep) | 28 |
| Fri 2026-07-31 12:00 | Fri 2026-08-07 (counts Civic Holiday 3 Aug) | 28 |
| Fri 2027-03-12 12:00 | Fri 2027-03-19 23:59:59 EDT = 2027-03-20T03:59:59Z (DST starts 14 Mar) | 30 |
| Fri 2026-10-30 12:00 | Fri 2026-11-06 23:59:59 EST = 2026-11-07T04:59:59Z (DST ends 1 Nov) | 30 |

  And `contest_deadline_at` (10 business days) for a claim filed Wed 2026-11-18 is Wed 2026-12-02 23:59:59 ET.
- **AC-53** (BR-28) Given a live `claim_deadline_at` and `contest_deadline_at`, when a holiday row inside their window is added or removed by migration, then both stored deadlines are unchanged, and a referral delivered after the change gets a deadline that uses the edited table.
- **AC-54** (BR-28, EC-2) Given referrals delivered before N1 ships, then each has `delivered_at` backfilled from its shared-profile snapshot time and `claim_deadline_at` computed from that `delivered_at` with the same helper. Never-delivered referrals get neither. Those whose backfilled deadline has passed show no claim entry (AC-27).

### Privacy and tenancy
- **AC-55** (BR-2, BR-23, BR-24, BR-15) Given `anon` and `authenticated` roles, then no fingerprint, client key, sticky-stop, holiday, claim-evidence or evidence-bucket data is selectable through PostgREST or Storage, `jobs` and `referrals` don't expose the client key to members, and `tests/integration/api-surface.test.ts` passes with only the allow-listed new RPCs.
- **AC-56** (BR-9, BR-20) Given any N1 flow, then B never sees A's stops, pending warnings, sticky stops, `already_presented` referrals or release flags. Org C sees nothing. Member-visible audit events carry no identifier, hash, client key or other referral id.
- **AC-57** (BR-20) Given the N1 flows, then notifications go exactly as in S10: the closure goes to the submitter; claim filed to A; dispute opened and dispute resolved to both. None is sent for a stop, warning, sticky stop, release (beyond withdrawal), claim-window expiry or a claim becoming final. In-app only in N1. The S10 email column is deferred (PD-030).
- **AC-58** (BR-21) Given a referral whose ownership window has passed and that has no open dispute, when the purge job runs, then its fingerprints are deleted. A referral inside its window, or with an open dispute, keeps them. Evidence files aren't deleted automatically (pending O-1).

### Copy and accessibility
- **AC-59** (C-6, brief §7) Given every new or changed string in en, fr and pt (stop, warning, closure, candidate page, release, claim), then none says or implies the candidate can't be hired or may not be hired. Every key in §5 exists in all three locale files (type-checked). ⚖️ strings carry the "draft pending counsel" marker in the spec until sign-off.
- **AC-60** (C-3) Given the candidate confirmation page and the recorded-authorization hint, then both include the duplicate-check sentence from §5.7 / §5.1 (draft ⚖️).
- **AC-61** (§6) Given a keyboard-only user, then they can complete: a submission through S1-c (Submit anyway), the withdraw-and-release two-step, the release-later two-step, a file claim (select, remove and re-add files, date, attestation, submit), a referral-evidence claim (arrow-key picker), and a contest. Focus lands as specified in §6 after each outcome or error, and stop and warning outcomes are announced by screen readers.
- **AC-62** (§3 mobile, §6) Given a 375px viewport in light and dark, then S1-b/c/d, S2-d, S3, S5 (including every file-row state), S7, S8 and S11 render with no horizontal scroll, fr strings wrap without truncation, SHA-256 values wrap, and every interactive element is ≥ 44 × 44 px.

### Rev. 3 additions
- **AC-63** (BR-6, BR-10, EC-1) Given each of the outcomes `stopped`, `pending_warning` and `identifier_required`, on both the recorded path and the candidate-confirmed path of the match-review screen (`/workspace/[orgSlug]/opportunities/[matchId]`), when the submit returns, then the form renders S1-d, S1-c or S1-b in the submit panel. No toast appears, the generic `FormMessage` stays empty, and the page doesn't redirect. On `stopped`, the sticky-stop row and the "submission stopped" audit event exist after the call (they weren't rolled back).
- **AC-64** (BR-7, BR-22, EC-1, PD-020) Given a pending-only hit, when step 1 runs, then the only new row is the audit event: no referral, no `referral_candidate_requests` row, no candidate email, no new authorization record and no notification. When step 2 is sent **without** the acknowledgement argument (forged), then it again returns `pending_warning`. When step 2 is sent with it, then the full check runs again: it returns `created` if still pending-only, or `stopped` if a presentation appeared in between (or a sticky stop applies), with the matching state shown. Both calls count toward the 30/h limit.
- **AC-65** (BR-15, EC-4) Given the claim form with file evidence, when B selects a valid file, then its row shows **Uploading** with an in-progress indicator and the text Uploading (a percentage isn't required, PD-033), then **Processing**, then **Ready** with the size, upload time and a short SHA-256. A file that fails the scan shows **Rejected** with **Remove** as its only action. A failed upload shows **Try again** and **Remove**. Throughout, **Decline and file claim** is disabled while any file is uploading, processing, failed or rejected, or none is attached, and the visible reason line says why. Removing the rejected file (with the others ready) enables the button.
- **AC-66** (BR-15, EC-4) Given a claim RPC call (forged) citing a file that is still processing, rejected, or belongs to another org or referral, then it's refused (`claim_files_not_ready` / not found) and nothing is declined. Given a filed claim, the SHA-256 shown to both sides and to admins equals the worker's hash of the stored object, is never accepted from the app or browser, and can't be changed afterwards. The deadline is checked when the claim is filed: a file uploaded before `claim_deadline_at` but filed after it is refused with `claim_window_closed`.
- **AC-67** (BR-15, BR-17) Given the claim form on the file path, then the claim deadline (`{when} ET · N business days left`) is shown directly above the upload area, as well as in the form header.
- **AC-68** (BR-25, PD-020) Given a released referral, when any hiring-side member reads it through the UI, the `referrals` select (PostgREST, with the member's JWT) or any RPC callable by `authenticated`, then no `released` flag or release-derived field is returned. The sourcing side and platform admins can see it. Exception (R-18, PD-029): a referral released before another referral of the same person was delivered isn't eligible as referral evidence against it (AC-31). A release after that delivery changes nothing B can read, including the picker and the filing result.
- **AC-69** (BR-8, EC-1) Given the candidate's confirmation ends in a closure (AC-15, AC-16), then `respond_candidate_request` returns `already_sent`, the page shows the S7 `already_sent` state in place (title, body, muted icon, no buttons, focus on the `h1`), and the body names only {org}, {partner} and {job}. Reopening the same link later shows the same state, never the confirm form, an error or "expired". The state renders in en, fr and pt.
- **AC-70** (BR-32, BR-23, PD-017, RD-020; scenario 46) Given the job form (new and edit) in **en, fr-CA and pt-BR**, when "Hide client" is ticked, then the client name field shows `jobs.form.clientInternalHint` in that locale. The hint says the name is internal only, never shown to partners, used to catch duplicates, and what the hiring org loses without it, with no wording implying the field is required. The field has no required marker, and saving with an empty name succeeds. When it's unticked, the field shows `jobs.form.clientDuplicateHint` and the existing "required" rule applies. The hint switches without a reload, and the field's `aria-describedby` points to the visible hint. No key, match count or normalised name is ever displayed.
- **AC-71** (BR-23, EC-6) Given a job created or updated by a connector or `/api/v1/jobs`, then it gets a client key like a UI-created job. A confidential job with a real client name gets a key. The key isn't readable from `jobs`, `referrals` or any exposed RPC (covered with AC-55).
- **AC-72** (BR-31, PD-020) Given an internal referral of X to B's J1 that is a presentation, when an outside partner A submits X to J1, then the submission is stopped with the same S1-d as AC-1. Conversely (RD-021, scenario 44), given an outside partner's earlier presentation of X to J1 (or to another B job at the same client), when a related org submits X internally, then that internal submission is stopped with the same S1-d. Internal referrals can likewise be warned, closed as already presented, released and claimed against, with the same UI and copy. No N1 surface shown to members labels a referral as internal beyond the existing commission note.
- **AC-73** (BR-4, EC-2) Given A1's referral of X to J1 that was withdrawn while still `awaiting_candidate` (never delivered, no `delivered_at`), when A submits X to J1, then there's no stop and no warning.
- **AC-74** (BR-8, EC-3, BR-1, BR-33) Given two candidate records of the same person with pending referrals to J1, when both candidates' confirmations run in parallel, then exactly one is delivered and the other ends `already_presented` (its page shows `already_sent`). Given direct PostgREST calls to `submit_referral`, `submit_referral_for_candidate` or `respond_candidate_request` with forged or extra arguments (hashes, normalised identifiers, a fake acknowledgement on a stop), then the check can't be skipped or altered, and the fingerprint key and HMAC helper aren't callable by `anon` or `authenticated`.

- **AC-75** (Should, only if shipped; BR-31, BR-9, PD-022; scenario 45) Given a fingerprint hit against an internal earlier referral, then an "earlier referral was internal" attribute is recorded in an admin-only store. It isn't in `audit_events.metadata`, isn't readable by org admins, recruiter managers or any member through PostgREST, and has no UI. The stop message stays byte-identical to AC-5.
- **AC-76** (BR-5, BR-21, PD-032; scenario 48) Given A's `awaiting_candidate` referral of X to J1 whose candidate request has expired (`expires_at` < now):
  - When A1 submits X to J1, the outcome is `created` with no pending warning: an expired request is neither pending nor a presentation.
  - After the maintenance sweep runs, A's referral has no fingerprints and its status is still `awaiting_candidate`. No new status, UI or copy appears, and A can still resend.
  - When A resends the link, the referral's fingerprints are recomputed in the database from the candidate's current identifiers, and a new submission of X to J1 by A2 gets `pending_warning`. The resend itself runs no stop check.
  - If A1's referral was delivered in the meantime, A's later confirmation closes as `already_presented` (BR-8), and the candidate sees `already_sent`.

### Traceability

**BR → AC**

| BR | AC |
|---|---|
| BR-1 | AC-7, AC-13, AC-74 |
| BR-2 | AC-55 |
| BR-3 | AC-1, AC-2, AC-3, AC-4 |
| BR-4 | AC-9, AC-10, AC-11, AC-20, AC-21, AC-73 |
| BR-5 | AC-8, AC-10, AC-76 |
| BR-6 | AC-1, AC-63 |
| BR-7 | AC-8, AC-64 |
| BR-8 | AC-15, AC-16, AC-17, AC-69, AC-74 |
| BR-9 | AC-5, AC-15, AC-56 |
| BR-10 | AC-12, AC-13, AC-63 |
| BR-11 | AC-24, AC-25 |
| BR-12 | AC-27, AC-29, AC-32, AC-33, AC-34 |
| BR-13 | AC-27, AC-33 |
| BR-14 | AC-26 |
| BR-15 | AC-30, AC-37, AC-38, AC-39, AC-44, AC-55, AC-65, AC-66, AC-67 |
| BR-16 | AC-40, AC-41, AC-42, AC-43 |
| BR-17 | AC-28, AC-52, AC-67 |
| BR-18 | AC-41, AC-45, AC-46, AC-47 |
| BR-19 | AC-18, AC-36, AC-40 |
| BR-20 | AC-17, AC-23, AC-32, AC-40, AC-56, AC-57 |
| BR-21 | AC-58, AC-76 |
| BR-22 | AC-18, AC-64 |
| BR-23 | AC-2, AC-3, AC-6, AC-55, AC-70, AC-71 |
| BR-24 | AC-14 |
| BR-25 | AC-19, AC-20, AC-22, AC-22a, AC-23, AC-68 |
| BR-26 | AC-31, AC-39, AC-68 (R-18 exception) |
| BR-27 | AC-35, AC-46 |
| BR-28 | AC-32, AC-53, AC-54 |
| BR-29 | AC-50 |
| BR-30 | AC-9, AC-25 |
| BR-31 | AC-31, AC-72, AC-75 (Should) |
| BR-32 | AC-70 |
| BR-33 | AC-74 |
| BR-34 | AC-55 (backfilled fingerprints closed), AC-74; recompute itself is backend-tested |

**EC → AC**

| EC | AC |
|---|---|
| EC-1 (returned outcomes, two-step, `already_sent`) | AC-8, AC-12, AC-13, AC-63, AC-64, AC-69 |
| EC-2 (`delivered_at`) | AC-29, AC-31, AC-54, AC-73 |
| EC-3 (per-hiring-org lock) | AC-16, AC-74 |
| EC-4 (worker hash, files ready before filing) | AC-65, AC-66 |
| EC-5 (`architecture.md`) | doc review by QA (no UI) |
| EC-6 (client key trigger, closed tables) | AC-55, AC-70, AC-71 |
| EC-7 (lazy "final") | AC-41 (the final state must show even if the worker hasn't run) |
| EC-8 (admin return to `submitted`) | AC-46 (the version bumps, so a stale UI gets the version-conflict error) |

**Strategist scenarios (brief §9) → AC**

| # | AC | # | AC | # | AC | # | AC |
|---|---|---|---|---|---|---|---|
| 1 | AC-2 | 9 | AC-18, AC-50 | 17 | AC-31 | 25 | AC-52 |
| 2 | AC-3 | 10 | AC-16 | 18 | AC-37, AC-38, AC-39 | 26 | AC-52 |
| 3 | AC-4 | 11 | AC-8 | 19 | AC-33, AC-34 | 27 | AC-52 |
| 4 | AC-5 | 12 | AC-9, AC-11 | 20 | AC-26, AC-35 | 28 | AC-52 |
| 5 | AC-6 | 13 | AC-20, AC-21 | 21 | AC-41 | 29 | AC-53 |
| 6 | AC-12, AC-13 | 14 | AC-8, AC-10 | 22 | AC-45 | 30 | AC-52 |
| 7 | AC-14 | 15 | AC-9, AC-10, AC-25 | 23 | AC-46, AC-47 | 31 | AC-54 |
| 8 | AC-15 | 16 | AC-29 | 24 | AC-50 | 32 | AC-59 |
| 33 | AC-73 | 35 | AC-74 | 37 | AC-65, AC-66 | 39 | AC-72 |
| 34 | AC-74 | 36 | AC-63, AC-64 | 38 | AC-68 | 40 | AC-71 |
| 41 | AC-52 | 42 | AC-22 | 43 | AC-22a, AC-19 | 44 | AC-72 |
| 45 | AC-75 (Should) | 46 | AC-70 | 47 | AC-31, AC-68, AC-45 | 48 | AC-76 |
| 49 | AC-57, AC-17 | | | | | | |

---

## 8. Out of scope

All per brief §5 "Won't":
- Checks across hiring orgs (never). Fuzzy matching (L3). Checks against B's own database or ATS.
- Revealing the first submitter, client or hit scope to anyone but platform admins resolving a dispute.
- Evidence access for the sourcing side, redacted sharing, admin evidence summaries, `.eml` evidence, metadata extraction.
- An admin UI for the holiday calendar (migrations only). Per-province calendars, a year-end rule.
- A per-org client entity, "consider for another job", "ask admins to verify the first authorization" (A-3).
- Claim retraction during a dispute. Contest-deadline reminders (N4). SLA enforcement and auto-release (N4; N1 only stores the review-clock start).
- Ownership-window enforcement, sourcing-side hire reports, claims on declined or released referrals (N3).
- *(rev. 4)* Release from `declined` or `rejected` referrals (first follow-up, PD-021). Blocking release once a hire is reported on the referral's client (N3). The internal-routing abuse flag (follow-up with BR-29, PD-022). Requiring a real client name on referral-open jobs (N3 prerequisite, PD-023). Any UI for the internal-hit attribute.
- **Closed strategist questions (rev. 4):**
  - **Q-7 closed** (RD-019, PD-021): release later from `withdrawn` / `cancelled` is a Must, under the three guards (S2-g, S3b, AC-22, AC-22a).
  - **Q-8 closed** (RD-020, PD-023): the client name stays optional in N1, with the "what you lose" helper; it becomes required before N3 (S11, AC-70).
  - **Q-9 closed** (RD-021): internal referrals follow the same rules in both directions, with no special UI (2.8b, AC-72).
- **Design-level exclusions:** no change to the Opportunities list after a stop (no hiding, no badge); no stop history visible to members (audit only); no claim-window indicator in the queue list (Q-D7); no new routes.

## 9. Open questions

**Design questions for the product-manager: all answered** (brief rev. 4.1, [PD-024 to PD-028](../../product/decisions.md)). The spec reflects each answer.

| # | Question | Answer | Decision | Where in the spec |
|---|---|---|---|---|
| Q-D1 | What can a platform admin see to judge "same person"? | **Answered.** Option (b): metadata, plus a server-computed "same person" block (Email / Phone / LinkedIn: match / no match / not available), **only** for referral-evidence disputes. No candidate name or label, no profile, no documents. File-evidence disputes get no block. Admin file download is limited to claims that have a dispute. | [PD-024](../../product/decisions.md) | S8, §4, AC-43, AC-44 |
| Q-D2 | Support path for wrong stops | **Answered.** A `mailto:` to the address in one server-side env var, with subject "Stopped referral {reference}" and no body. The reference (*rev. 4.2, PD-033:* a random opaque token, unique per stop) appears on every stop, sticky stops included. The support line is hidden when the env var is unset. The address itself: **Needs user decision**. | [PD-025](../../product/decisions.md) | S1-d, AC-5 |
| Q-D3 | Prior-process date boundary | **Answered.** Strictly before the delivery's ET date; the lower bound (6 months before) is inclusive. | [PD-028](../../product/decisions.md) | S5, AC-29 (unchanged) |
| Q-D4 | Evidence file types and limits | **Answered.** PDF, PNG, JPEG only; up to 5 files; 10 MB each. No CSV, XLSX or DOCX. | [PD-028](../../product/decisions.md) | S5, AC-30 (unchanged) |
| Q-D5 | Who sees the contest reason? | **Answered.** Admins only. Both sides read the admin's resolution. The contest form says who reads the reason. | [PD-028](../../product/decisions.md) | S2-d contest dialog |
| Q-D6 | Language of in-app notifications | **Answered.** English text in SQL for N1, with a distinct `kind` per event. Emails use the recipient's locale. Localizing all notifications is a launch follow-up (N7). | [PD-026](../../product/decisions.md) | S10 |
| Q-D7 | Claim-window indicator in the queue | **Answered.** No. | [PD-028](../../product/decisions.md) | S4 (unchanged) |
| Q-D8 | Who gets the closure notification | **Answered.** The submitting member. If they're no longer active, the sourcing org's owners and admins. | [PD-028](../../product/decisions.md) | S10, AC-17 |
| Q-D9 | Claims on revoked referrals | **Answered.** Allowed while status and deadline allow it. Revoked referrals that still count are also eligible as referral evidence. | [PD-028](../../product/decisions.md) | AC-27, S2-i, S5 picker, AC-31 |
| Q-D10 | Hiring-side footer on released referrals | **Answered.** Unchanged in N1 (AC-23). N3 must revisit before ownership is enforced. | [PD-027](../../product/decisions.md) | S2-h, AC-23 (unchanged) |

**Needs user decision:** the support email address for wrong stops (PD-025). Recommendation: a role address on the product domain, monitored by platform admins.

**Still open elsewhere (not blocking design)**
- **O-1** (user + counsel): retention of fingerprints and evidence files; effect of anonymisation. AC-58 follows BR-21 as written.
- **Counsel ⚖️:** attestation (C-1), withdraw and release copy (C-1), stop message's C-6 sentence, consent addition (C-3), resolution language (C-5).

**Notes for engineering (no PM decision needed)**
- Outcomes the UI must be able to tell apart from the submit action (EC-1): `created`, `pending_warning`, `stopped`, `identifier_required` (returned results), plus real errors such as `rate_limited`. `stopped` must carry the same payload in every case (AC-5). The acknowledgement argument name (`acknowledgePendingWarning` here) is the backend's choice. Record it in `backend.md`.
- Evidence uploads need: an upload action per file, a status read per file (`uploading` → `processing` → `clean` + `sha256` / `rejected`), a remove action, and the claim RPC accepting file ids that must all be clean and hashed (EC-4). Uploaded-but-unfiled objects need cleanup.
- `transition_referral` events need a system actor distinct from the candidate's (`actor_side = null`) for `already_presented` (S2-b).
- The view model of the referral page needs: claim (status, times, files metadata per side), flags (`released`, `prior_presentation_upheld`, `claim_rejected`), `claim_deadline_at`, business days left (server-computed), and the review-clock start.
