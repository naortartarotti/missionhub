# Brief: Referral-level claims and two-sided hire reporting (N3)

Owner: Product Manager · Date: 2026-11-16 · **Rev. 2** (rev. 1 approved by the user 2026-11-16, PD-071; rev. 2 = estimate reconciliation and answers, PD-073 to PD-076, inside the approved scope and effort range) · Slug: `referral-claims-two-sided-hire` · Roadmap: **N3** (in design)

> **Rev. 2 changes (2026-11-16)**
> - **Estimate (PD-073):** backend 21.0 d before buffer → **19.25 d** after PD-069 cuts (2)–(4) and two more trims: **BR-30 reopen moves to N7** (unreachable before N7; N7 can't turn on deemed confirmation without it) and **metrics counts → Ops SQL** (flags that are admin tasks stay). With the 15% buffer: **~22.1 d**, inside the user-accepted ~18–23. The deemed-confirmation branch and its seeded tests stay (option d rejected).
> - **Cuts applied:** BR-29 has no "restart the clock" (admin decides on the record); BR-12 has no tick (admin note); HA-1 and HA-9 → Ops SQL (BR-36, BR-40); BR-30 → N7.
> - **Answers (PD-074, PD-075):** BR-4 (no `delivered_at` → never eligible, happy path unchanged), BR-9 (flag false in every environment), BR-11 (record-only → `hired`; money inputs discarded on released referrals), BR-13 (late marker rules), BR-14, BR-21 (key union both sides), BR-22 (B's record closes a contested report and its dispute), BR-25 (`not_this_client` statement admin-only), BR-29 (no active job owner → never deemed; no contest after the deadline), BR-31 (legacy fee-pending), BR-40 (HA-1 counts reports closed by B's record), BR-44 (HE-3 re-record → X6), new **BR-45** (no hire record while B's own objection is open).
> - **Rules text (PD-076):** add the related-org sentence to 6.3 (⚖️ under P0-1); no "at that client" sentence, with a launch check instead.

> **Approved at checkpoint (PD-071):** U-N3-1 = (a) normal platform share on the fee collected, no surcharge; U-N3-2 = counsel posture approved (`deemed_agreement_enabled` off in production until counsel Q-1 and N10 acceptance; Q-2 to Q-4 drafts, launch-gated; sending to counsel is the user's action, pending on the launch checklist); U-N3-3 = effort accepted with the PD-069 cut rule. **Scope addition (PD-072):** N2 leftovers from `job-terms-card/qa-report.md` §11 (QA-N2-12, QA-N2-10, QA-N2-11, three doc fixes) join backend drop 1 as Must 0b.
Inputs: [`recruiting-input.md`](./recruiting-input.md) (§4 deadlines and workflows, §5 edge cases, §6 abuse, §7 rules, §11 questions); RD-003, RD-004, RD-015 to RD-021, RD-023, RD-025, RD-027, RD-029, RD-030, RD-033, RD-036, RD-037, RD-047 and **RD-050 to RD-056** ([`decisions.md`](../../strategy/decisions.md)); PD-021, PD-023, PD-024, PD-027, PD-028, PD-030, PD-043, PD-048, PD-049, PD-053, PD-059, PD-064 and **PD-066 to PD-070** ([`decisions.md`](../../product/decisions.md)); accepted N1 [`brief`](../duplicate-prior-presentation/brief.md) / [`acceptance`](../duplicate-prior-presentation/acceptance.md), N2 [`brief`](../job-terms-card/brief.md) / [`acceptance`](../job-terms-card/acceptance.md), N9 [`acceptance`](../candidate-confirmation-integrity/acceptance.md); N10 [`brief`](../network-rules-enforcement/brief.md) rev. 2 (BR-13, settlement mode, ladder).
⚖️ = counsel item (via N7), not legal advice. **Needs user decision** items are in §8.4.

---

## 0. What exists today (code and docs, 2026-11-16)

| Area | Today | Where |
|---|---|---|
| Hire | `report_hire` works only from `offer`, only for the job-owner org, only with an accepted and confirmed collaboration agreement. Snapshot-driven fee since N2 (`compute_fee`, floor RD-031). A hire on a declined, withdrawn, cancelled, SLA-released or never-answered referral **can't be recorded by anyone**. | live body `20261116000600_terms_fee_bounds.sql`; also copied in `20261115000300_recruiter_record_scope.sql` |
| Ownership | `ownership_protected_until` = delivery + snapshot window (N2 BR-18/19). Nothing reads it for hires. | N2 |
| "Counts" | N1 BR-4: delivered, inside the window, any status, minus released / upheld-or-final claim / `already_presented`. | N1 |
| Disputes | Referral-level disputes exist (`prior_presentation`, one open per referral). `open_dispute` takes a placement only. `resolve_dispute` closes, never changes an allocation (RD-034, X6). | `20261113000600`, `20261113001100` |
| Release | Withdraw dialog and "release later" from `withdrawn` / `cancelled` only (N1 BR-25). Not from `declined` / `rejected` (PD-021). | N1 |
| Candidate tokens | Server-issued (N9). **O-1 open:** `record_candidate_request_delivery` is callable by the source org, so "sent" is recruiter-influenced (PD-043). | `20261115000300` (copied body) |
| Client name | Optional on all jobs (N1 BR-32). Placeholders give no client key (N1 BR-23). Jobs without a key are protected at job scope only. | N1 |
| Emails | In-app notifications only. Emails come with N7 (PD-030), which depends on N8's provider. | — |
| Sanctions | Only full suspension, which makes every workspace route not-found. Ladder and settlement mode come with N10 (after N5). | N10 |

**Gap in one line:** the party that owes the money is the only one who can record the hire, and only on the happy path.

---

## 1. Problem

"Ownership protected until {date}" is a date on screen with nothing behind it. Most backdoors happen on referrals that were declined, withdrawn or left to lapse, and today those hires can't be recorded at all. The sourcing recruiter, who is often the only one who learns of the hire (from the candidate or a profile change, months later), has no in-product path. An honest hiring recruiter has no clean way to self-report a late or other-role hire. Without N3, "Split placements, without the risk" isn't true.

## 2. Users and roles

- **Hiring side (B):** job-owner org. The job owner or a manager records hires (RD-036). Org admins and managers receive notices and answer hire reports when the job owner is gone (HE-10).
- **Sourcing side (A):** source org. The members who may withdraw the referral may file a hire report and a rebuttal.
- **Platform admin:** decides contested and unanswered reports, runs the authorization check (RD-029), sees flags.
- **Candidate:** not a party in the product. The admin may contact them outside the product (rule 7.3, Q-4 ⚖️). Nothing in N3 is shown to candidates.

## 3. Evidence

- [`recruiting-input.md`](./recruiting-input.md) §1 (who learns of a hire and when, evidence in practice, where trust breaks), §2–§4 (model, coverage, workflows), §5 (HE-1 to HE-14), §6 (HA-1 to HA-11).
- RD-030 (A's report), RD-050 (two paths, one referral), RD-051 (B's duty), RD-052 (coverage), RD-053 (contest, deemed confirmation, fee details), RD-054 (competing records, release, ownership line), RD-055 (what counts as a hire), RD-029 (authorization challenge).
- N1 acceptance item 11 and N9 acceptance O-1: first position becomes fee entitlement in N3, so consent evidence must be server-set.

## 4. Goal and success metrics

**Goal:** every hire of a covered candidate at the referral's client can be recorded on the referral that governs it, by either side, and leads to a placement on the frozen terms unless an objective exit applies.

| Metric | Type | Target | How measured |
|---|---|---|---|
| Client-key coverage on referral-open jobs | leading | 100% by construction (BR-1) | admin metrics (existing coverage count) |
| Hires self-recorded by B on non-`offer` referrals | leading | > 0 in the first 90 days (honest B uses it) | placements by referral status at record |
| Hire records made within the 5-business-day duty | leading | ≥ 80% **[estimate]** | `late` marker on hire records (BR-13) |
| Median hire report → resolution | leading | ≤ 15 business days | report filed → closed timestamps |
| Fee-pending placements older than 10 business days | leading | 0 open > 20 business days (RD-053 signal) | admin flag (BR-40) |
| Hire reports → placements | lagging | ≥ 50% **[estimate]** | report outcomes |
| Contested reports upheld | lagging | < 30% **[estimate]** | dispute outcomes |
| Share of placements first reported by A | lagging | watch (no target) | report-originated placements / all |
| Deemed confirmations later reopened | lagging | ≈ 0 (only after N7) | reopen events |
| Admin candidate contacts per hire dispute | lagging | ≤ 1 | admin field on the dispute (BR-28) |
| HA-1 / HA-6 / HA-9 flags | signal | revisit RD-051 / RD-030 if HA-1 repeats for the same org after a warning | admin flags |

Admin metrics (rev. 2, PD-073): the counts above are read with **Ops SQL** until the N2.1 metrics panel; backend documents the queries in `backend.md`. Admin-task flags (HA-6, late records, fee overdue, decision overdue, unanswered) stay in the product. Lagging targets are estimates to calibrate 12 weeks after launch.

---

## 5. Scope

### What ships in N3 versus what is gated

| Capability | At N3 acceptance | Gate |
|---|---|---|
| S2 client-name gate, O-1 server-only delivery (prerequisites) | **Live** (built first, drop 1) | none |
| B records a hire from any counting referral **that has a confirmed agreement** (accepted, then declined, withdrawn, rejected, cancelled) | **Live** | none |
| B records a hire on a referral **with no confirmed agreement** (never accepted, or A never confirmed) → placement on a deemed agreement from the snapshot | **Built, behind server flag `deemed_agreement_enabled`** (on in local and test, **off in production**) | ⚖️ **Q-1** counsel yes **and** N10 rules acceptance live. Flag off → record-only hire (BR-11 path) |
| Record-only hire on a released referral | **Live** | none |
| A files a hire report; B confirms or contests; rebuttal; admin decision | **Live** | rule wording ⚖️ Q-2, Q-3 (launch gate, drafts ship) |
| **Silence = deemed confirmation** | **Built, data-gated.** Requires a delivered, non-bounced email to two people of B. Before N7 there are no email delivery records, so **every unanswered report goes to the admin queue as "unanswered, notice not delivered"** | **N7** notification emails with per-recipient delivery and bounce records (needs N8 provider webhooks) |
| Admin reopen of a deemed confirmation (BR-30) | **Moved to N7 (PD-073).** Not built in N3; unreachable before N7 anyway | N7 builds it; deemed confirmation can't be enabled without it |
| Email reminders (day 5 and 8) and emailed notices | In-app only | N7 |
| Fee-pending placements, 10-business-day clock, overdue admin task | **Live** | none |
| Rule 6.4 sanction after overdue fee details or late records | Admin task and manual notice recorded on the placement | **N10** ladder (conduct case, category 4) |
| Hire reports and answers by a suspended org (HE-11) | Pre-N10: a suspended party can't act; its pending reports go to the admin queue at the deadline, never deemed (BR-44) | **N10** settlement mode (N10 BR-13 already lists N3 hire reports) |
| Evidence files about the candidate's new employer; admin contact with the candidate | Built (N1 pipeline, admin-only) | ⚖️ **Q-4**: PIA and Privacy Policy line before launch; no automatic purge in N3 |
| Release from `declined` / `rejected`; ownership line on both sides | **Live** | none |
| RD-029 authorization check and void | **Live** | voiding wording ⚖️ (launch gate) |
| Network Rules 6.3, 6.4, 7.2 text | ux-writer drafts in en / fr-CA / pt-BR | ⚖️ P0-1 founder + counsel; deemed-confirmation sentence marked "ships with N7" |
| Platform share on report-surfaced hires | Normal rate on the fee collected (the existing rule) | **Needs user decision** U-N3-1 (RD-056 / Q-5). A surcharge would be a scope change |

### Must (this release)

0. **Prerequisites, first in the build:** client-name gate on referral-open jobs (BR-1); server-only delivery recording (BR-2). N2 F-0 docs are closed by backend before the N3 backend handoff (N2 acceptance).
0b. **N2 leftovers (PD-072, `job-terms-card/qa-report.md` §11.2–§11.3), backend drop 1:**
   - **QA-N2-12:** a flat → % concierge amendment posts the % currency the admin saw (hidden `expectedPctCurrency`); the action, and the RPC through `p_expected_currency`, **refuse with a stale-terms error when the job's salary currency changed** since the page loaded. Nothing is written; the form reloads with the new currency. Backend + a small frontend change on the admin amendment form.
   - **QA-N2-10:** a flat post without `flatCurrency` returns the field error on `flatCurrency`, not on the derived `currency` key (`src/features/admin/actions.ts`).
   - **QA-N2-11:** on a legacy referral, both % and flat posts return `errors.amendment_legacy_referral` (legacy check before the `pct_amendment_currency` null check).
   - **Doc fixes:** `domain-model.md` `fee_estimate_minor` is also null above 10^12 or when the computation fails; `security-and-privacy.md` records the intended `forbidden` vs `not_found` asymmetry of the two admin amendment RPCs; remove the stale "rate limiting is Supabase Auth's built-in only" open item.
   - QA re-runs `terms-amend-action-qa` and adds a deterministic test for the stale-currency refusal (forged `expectedPctCurrency`).
1. **Governing referral and hire eligibility** (BR-3, BR-4), coverage test for admins (BR-5), reporting tail (BR-6).
2. **B records a hire from any counting referral** (BR-7 to BR-16 except BR-16, which is Should): any status, other role at the same client, sister-org hire, legacy, deemed agreement behind the flag, record-only on released referrals, late marker, invoice clock, new I ≠ C reason.
3. **A's hire report** with dated evidence and attestation, generic refusals, rate limits, visibility rules, release block per client, competing-record rules (BR-17 to BR-22).
4. **B's answer**: confirm, contest with reason and evidence, rebuttal once, admin decision with three outcomes, admin tools, deemed confirmation gated on delivered email, admin queue otherwise, reopen (BR-23 to BR-30).
5. **Fee-pending placements** with the frozen estimate, the 10-business-day clock and overdue admin tasks; money bounds (BR-31 to BR-33).
6. **Release from `declined` / `rejected`**, the ownership line on both sides, the HA-9 flag (BR-34 to BR-36).
7. **RD-029 authorization check**: request, 5-business-day evidence, void; "record created on {date}" evidence note (BR-37, BR-38).
8. **Admin flags and metrics**, no counterpart-visible outcomes, notifications and audit, privacy rules, edge cases (BR-40 to BR-44).
9. **Network Rules 6.3, 6.4, 7.2 text** in en / fr-CA / pt-BR (ux-writer, ⚖️).
10. All strings in en / fr-CA / pt-BR. "Claim" stays N1's word; A's action is a "hire report" (RD-050, PD-028).

### Should
1. **Offer-stage nudge** after 30 calendar days in `offer` (BR-16).
2. **Refuse candidate-confirmation destinations** equal to a source-org member's email (and the org's own verified domain, if one exists) (BR-39).
3. **Admin-only employer signal:** the server computes a client key from A's employer text and shows admins "matches a client key: yes / no". Never returned to A or B.

Shoulds are excluded from the estimate and are the first thing dropped if the backend estimate is over the bar (PD-069).

### Won't (this release)
- An evidence-free "did you hire X?" inquiry (RD-050). Suspicions go in referral messages (rule 7.1, 4.8).
- MissionHub setting or estimating any fee amount (rule 7.5). Admin decisions cover whether the hire counts, never the amount.
- Allocation adjustment on an upheld money dispute, "short-paid" marker, guarantee-limited reversals → **X6** (PD-052).
- Automatic pause or sanction of B (RD-053 replaces RD-030's Should). Sanctions → N10 ladder.
- Decisions across two hiring orgs on the same client (RD-013, HE-5).
- Counterpart-visible hire-report statistics (RD-053).
- Platform-share surcharge on report-surfaced hires (unless the user chooses it, U-N3-1).
- Temp-to-perm or contract splits (not doing).
- Automatic purge of hire-report evidence (counsel sets retention in the N7 PIA, Q-4).
- Shared-profile access expiry (X11, after N3).
- Changing N1's duplicate-check meaning of "counts" (see strategist question S-N3-1).

---

## 6. Business rules

All deadlines use the N1 business-day helper (RD-018): business days, ET, ON ∪ QC holiday table, the event day not counted, **stored when the clock starts**, never moved by holiday edits.

### A. Prerequisites

- **BR-1 Client-name gate (RD-020, PD-023, N2 BR-40).** A job can be opened to **external** referrals only with a real client name: not empty and not a placeholder (N1 BR-23 list), so it has a client key. *(PD-077)* Internal referrals also need the job open to partners, so the gate applies to them too (no exemption, deny by default). The partner-visibility predicate (N2 BR-3) gains the owner-only hidden reason `no_client_name`. Existing referral-open jobs without a key stop being partner-visible until fixed, with the N2 nudge pattern on the job list and job page. In-flight referrals on those jobs are unaffected. Connector and API jobs without a name can be created but not opened to partners. The name stays internal-only: no partner-facing view, RPC or notification returns it (rule 4.5); platform admins see it only in disputes (BR-28).
- **BR-2 Server-only delivery recording (O-1, PD-043).** `record_candidate_request_delivery` is revoked from `authenticated`. Delivery ("sent") is recorded only by the server's service-role path that issues the token and sends the email, or inside the issuance RPC. A recruiter can't set or change "sent" by any direct call. N9's BR-1 to BR-12 still hold. After this ships, the dispute playbook stops treating "sent" as recruiter-influenced.

### B. Governing referral, eligibility and coverage

- **BR-3 Governing referral (RD-050, RD-033).** A hire attaches to the single counting presentation for that candidate × hiring org × client key, using the **union** of the referral's commit key (N2) and delivery key (N1). It governs a hire into **any role** at that client. A referral whose job had no client key governs only hires into that job. Never across hiring orgs.
- **BR-4 Hire-eligible referral.** A referral is hire-eligible when **all** hold: delivered (`delivered_at` set; a referral without it was never delivered and is never eligible, N1 BR-28; the happy path in BR-7 is unchanged whatever the data, PD-074); not `already_presented`; no upheld or final prior-presentation claim; not void (BR-37); no placement yet; and **either** it is in progress (`submitted`, `under_review`, `info_requested`, `accepted`, `interviewing`, `offer`) **or** now ≤ window end + 9 months (legacy referrals: delivery + 12 months + 9). Released referrals are eligible **for a record-only hire by B** (BR-11), never for a placement or for A's report. `awaiting_candidate` and `candidate_declined` are never eligible.
- **BR-5 Coverage test (RD-052), applied by the admin on a contest, never by the server.** A hire is covered if any holds: (1) the referral was in progress at the time of the offer; (2) the offer was accepted inside the window (start date if acceptance is unknown); (3) the client's selection process that led to the hire (first interview or assessment, any role) started inside the window and the offer was accepted within 3 months after the window ended. Never a defence inside the protection: "we found them ourselves", "they applied directly", "came back through another agency", "a different role", "the referral was declined or withdrawn". The only exits are release, an upheld or final claim, `already_presented`, and a void confirmation.
- **BR-6 Reporting tail (RD-030, RD-052, PD-068) ⚖️ Q-2.** A may file a hire report until **window end + 6 months**. From +6 to **+9 months**, filing requires A to state that the client's selection process started inside the window, with a dated evidence item for it; the admin checks it on contest. The server refuses after +9 months, and refuses only on this tail and on eligibility (BR-4, BR-17), never on its own reading of coverage. The two values are single constants. The filing limit is a platform rule and doesn't cut anyone's legal rights (rule 6.3 wording, ⚖️). A sees its own last filing date ("You can report a hire until {date}"); B doesn't.

### C. The hiring side records a hire (RD-051, RD-055)

- **BR-7 Who and from where.** The job owner or a manager of the job-owner org (RD-036) can record a hire from any hire-eligible referral, in any status. On the happy path (`offer` with a confirmed agreement) the existing N2 dialog and behaviour don't change. *(PD-077)* `report_hire` waives the pipeline-owner rule for the `hired` move only; the member who accepted keeps the ability whenever record scope shows them the referral. Anyone who can't act gets `not_found`. Start and acceptance dates lie within [delivery − 1 year, today + 548 days] (`hire_dates_invalid`). The referral moves to `hired`; its previous status stays in the history and the audit log.
- **BR-8 What B enters.** Offer-acceptance date (or "unknown", then the start date is required and used), start date, and the role hired into: this job, or **another role at this client** with its job title (≤ 120 characters, no candidate data). Fee per N2: snapshot rate × the actual base (and bonus) for the role hired into, with the minimum fee (N2 BR-22); invoiced fee I and reason when I ≠ C (N2 BR-23). Legacy referrals keep free entry (N2 BR-26) and the legacy default rule version in force at submission (HE-8). Snapshot currency, no FX (HE-7).
- **BR-9 Deemed agreement (RD-051) ⚖️ Q-1, behind `deemed_agreement_enabled` (PD-067).** When the referral has no confirmed collaboration agreement (never accepted, or accepted but never confirmed by A), the placement creates its agreement from the referral's frozen snapshot (terms version or latest concierge amendment, commission rule version, client keys), marked as deemed from the snapshot. A doesn't confirm anything; A is notified. Internal referrals keep 0 sourcing bps (RD-005). **Flag off:** the hire is stored as a record-only hire (BR-11 behaviour, without the "released" message), visible to both orgs and admins, and A's recourse is rule 7.5. The flag is a closed server-side setting (not user- or org-settable), audited when changed, **off in production until counsel answers Q-1 yes and N10 rules acceptance is live** (launch checklist). *(rev. 2, PD-074)* It defaults to **false in every environment**; tests turn it on per case through the service role, and a local script turns it on for development.
- **BR-10 Upheld, confirmed or deemed reports use the same placement path** (BR-9 included), so the flag governs both B's records and A's reports on referrals without a confirmed agreement.
- **BR-11 Released referral (RD-054).** B can record the hire for the record. No placement, no agreement, no split. At that moment B is told "This referral doesn't carry a split", without a reason. The record-only hire is visible to B and admins; A (who released) sees that a hire was recorded. It feeds the HA-9 check (BR-36). *(rev. 2, PD-074, PD-075)* A record-only hire (released, or flag off) moves the referral to `hired`; the hire record's kind says there's no split. On a released referral B fills the same form as any other (the release isn't revealed before the record), and the **money inputs are discarded**, never stored; dates and role are kept.
- **BR-12 Sister-org hire (RD-051, RD-021).** A hire by a related org of B (shared member) at the same client counts as B's hire. B records it on the referral like any other hire. *(rev. 2, PD-069 cut 4, PD-073)* There's no tick in the form; when an admin learns of a related-org hire, the admin records it as a note on the hire record. The rule is stated in Network Rules 6.3 (PD-076).
- **BR-13 Record duty (rule 6.4, RD-051).** B must record within 5 business days of learning of the offer acceptance, and never later than 5 business days after the start date. The server can't know when B learned, so it doesn't block: a record made more than 5 business days after the start date, or after the stated offer-acceptance date, is marked `late` (admin-only). A late record is a 6.4 signal for an admin (N10 conduct category 4); A's report path stays open until a record exists. *(rev. 2, PD-074, PD-075)* The happy-path dialog has no acceptance date, so there the start-date rule alone applies. B's confirm of a report (BR-24) is checked like any B record; deemed and upheld hires are never marked late (B didn't record). A record made within 5 business days after B's own objection on that referral is decided isn't late (BR-45).
- **BR-14 Invoice clock (RD-051).** `invoice_due_at` = start date + 10 business days, stored at record time (for a fee-pending placement, when the fee details with the start date are entered, PD-074). With no client invoice recorded by then, the placement shows "Invoice overdue" on Commissions to both orgs and admins (feeds X9). Not invoicing, or waiving the fee without A's prior written consent, is a B discount and the N2 floor applies (RD-025, RD-031); no product change beyond the display.
- **BR-15 New I ≠ C reason `non_permanent_engagement` (RD-055) ⚖️ Q-3.** Added to N2 BR-23's list (check constraint, Zod enum, TS type). Contractor, PJ, EOR, payroll provider, affiliate and other-agency engagements are hires; the floor applies unless A agreed in advance. Helper wording is a draft until counsel.
- **BR-16 (Should) Offer-stage nudge.** After 30 calendar days in `offer`, B gets an in-app prompt "Was the offer accepted?" linking to the record form. Once per referral.

### D. The sourcing side reports a hire (RD-030, RD-053, RD-054)

- **BR-17 Eligibility.** A member of A's org who may withdraw the referral may file one hire report when **all** hold: the referral is hire-eligible (BR-4) and not released; within the reporting tail (BR-6); no pending report on it; no open claim or dispute on it (HE-13; the clock of a later report starts at its own filing); fewer than **two** rejected reports on it; a second report carries at least one evidence item dated after the first report's resolution; A's org is under the rate limits (BR-20). Revoked candidate authorization doesn't block it (HE-9). Every refusal returns one generic code (`hire_report_unavailable`), except the rate limit (its own code) and an existing placement (`hire_already_recorded`, pointing to the placement A can already see).
- **BR-18 Report content.** Employer as known (≤ 200 characters); approximate start month (month and year); role if known (≤ 120); how A learned (enum); **at least one dated evidence item**: type (candidate's written message · company announcement or org chart · public profile change · third-party statement · other), the item's date (≤ today), optional capture date and `https:` URL, optional files through the N1 claim-evidence pipeline (PDF / PNG / JPEG, ≤ 5 files, 10 MB each, scan gate, SHA-256 by the worker, Canadian storage, 60-second signed URLs); a statement (20–2,000 characters); the rule 4.8 attestation. No offer letter. A screenshot without URL or date is accepted (weighs less; the form says so). Filing is blocked until every file is clean and hashed.
- **BR-19 Visibility.** B sees: the statement, employer text, start month, role, how learned, each evidence item's type, date and capture date, and each file's upload time and SHA-256. **Files and URLs are admin-only** (RD-016 symmetry). A never sees the client name. When an outcome is "not this client", A sees only that.
- **BR-20 Rate limits [estimate].** Per source org: at most 3 pending reports and 10 filed per rolling 90 days. Per user: the N1 disputes bucket (5/h).
- **BR-21 Release blocked (RD-019, RD-054).** While a report is pending (filed, awaiting answer, contested or in dispute), release is refused on **every** referral of A's org at that hiring org whose client key matches either key of the reported referral (union of commit and delivery keys on **both** sides, PD-074). The option is hidden; the RPC refuses.
- **BR-22 Competing records (RD-054, HE-1, HE-5).** First valid record wins. If B records while A's report is pending (including contested, in dispute or in the admin queue), A's report closes as "confirmed by the hiring recruiter", and an open `hire_report` dispute closes with it (PD-075). A report filed after B's record is refused (`hire_already_recorded`). Two hiring orgs with counting referrals of the same person at the same client each record on their own referral; nothing is decided across them.

### E. The hiring side's answer (RD-053)

- **BR-23 Answer deadline.** `answer_due_at` = filing + 10 business days, stored. In-app reminders at business day 5 and 8 (emails with N7). Recipients: the job owner and every org admin and manager of B (RD-036); clocks don't pause if the job owner left (HE-10).
- **BR-24 Confirm.** Opens B's record form (BR-8) prefilled from the report and the snapshot. Submitting creates the placement (BR-9/BR-10) and closes the report as confirmed. B enters the fee details at that moment.
- **BR-25 Contest.** One reason, with the required evidence:
  - `not_hired` (by the client or its affiliates, agents, EOR or payroll provider ⚖️ Q-3): attestation; optional documents (e.g. the client's written statement, with B's permission);
  - `outside_window`: the dated offer-acceptance date **and** the date the selection process started, both required; optional documents;
  - `different_person`: attestation;
  - `not_this_client`: attestation.
  "We already had them" isn't a reason (RD-004.3). Contesting opens a referral-level dispute of a new kind `hire_report` (one open dispute per referral still holds). B's files are admin-only; A sees the reason (as "not this client" for that reason), B's statement, and evidence types and dates. *(rev. 2, PD-075, rule 4.5)* For `not_this_client`, **B's statement is admin-only** (it's the likeliest place to name the client); for the other reasons the form asks B not to name the client.
- **BR-26 Rebuttal.** A may add one statement and evidence items once, within 5 business days of the contest (stored). Then the admin decides on the record.
- **BR-27 Admin decision.** Target 10 business days after the rebuttal deadline (stored), with an overdue flag and no automatic outcome. Written resolution. Outcomes: **upheld** (the hire counts → placement in fee-pending state, BR-31, via BR-9/BR-10); **rejected** (no hire on this referral; A sees "not upheld", or "not this client" when that was the finding); **void** (the confirmation is invalid, BR-37). The admin decides whether the hire counts, never the amount.
- **BR-28 Admin tools.** In a hire-report dispute or unanswered report, admins see: both client names behind the keys (RD-033), the "same person" signal (PD-024) extended to hire disputes, every file and URL, the record-created and email-change notes, both sides' statements, and the flags. The admin records, as fields on the dispute: "candidate contacted" (count; at most one expected) and "client's written confirmation requested / provided / refused" (a refusal counts against B, rule 7.2). Contact itself happens outside the product (⚖️ Q-4). None of this reaches A.
- **BR-29 Silence (data-gated on N7, PD-066).** At `answer_due_at` with no answer:
  - **deemed confirmed** only if the report notice was emailed to the job owner **and** at least one other org admin or manager of B (two distinct people), each recorded as delivered with no bounce. The placement is created in fee-pending state;
  - **otherwise** the report goes to the admin queue as "unanswered, notice not delivered". The admin decides on the record (upheld or rejected, rule 7.2). *(rev. 2, PD-069 cut 2)* There's no restart of the answer clock.
  Silence never wins on in-app notices alone. Until N7 writes email delivery records, the first branch can't be met, so every unanswered report goes to the admin queue. No flag: the condition reads the delivery records. *(rev. 2, PD-075)* If B has **no active job owner** (HE-10), the condition can't be met: never deemed, admin queue. After `answer_due_at`, B can't contest any more; **Record hire** stays available (BR-22).
- **BR-30 Reopen a deemed confirmation → N7 (rev. 2, PD-073).** Not built in N3. N7 builds it together with the email delivery records, and deemed confirmation can't be enabled without it. Rule for N7: only a platform admin, within 10 business days of the deemed date, only when a bounced, complained or failed delivery row for that notice arrives after the deemed date, or the admin records a platform-incident reference (PD-074); reason required; audited; cancels the fee-pending placement (refused if any payment evidence exists) and restarts the answer clock. "I didn't check" doesn't reopen.

### F. After the hire is established

- **BR-31 Fee-pending placement (RD-053, rule 7.5).** After a deemed confirmation or upheld report, the placement exists without fee details and shows "Fee details pending from the hiring recruiter" plus the frozen estimate from submission when one exists, labelled as an estimate (N2 BR-36), otherwise "{rate} of the salary at hire". MissionHub never invents a fee. No invoice, payment evidence or allocation is possible until B enters the fee details (start date, base, bonus, I and reason). On a legacy referral (no snapshot), B enters currency and fee by legacy free entry (N2 BR-26) and no estimate is shown (PD-074). `fee_details_due_at` = establishment + 10 business days, stored. When overdue: an admin task "rule 6.4 notice due" in the queue; the admin records the notice sent on the placement. No automatic pause or sanction; the ladder comes with N10.
- **BR-32 Money bounds (PD-059).** Every money input (base, bonus, invoiced fee, and anything new) is bounded at the RPC and the table with the N2 bounds; estimates fail closed per row. `backend.md` includes the bounds checklist.
- **BR-33 Money disagreements** (base, discount, engagement type, client terms) go to the existing placement dispute and rule 7.5. N3 doesn't change `resolve_dispute` allocations (X6).

### G. Release and ownership display

- **BR-34 Release from `declined` / `rejected` (RD-054, PD-021).** N1 BR-25's "release later" extends to `declined` and `rejected` referrals with the same guards (delivered, still counts, no open dispute), the same two-step irreversible confirmation, the same `released` flag invisible to B, plus: no placement on it and no pending report at that client (BR-21).
- **BR-35 Ownership line (RD-054, PD-027, N1 R-17).** On every delivered referral, both sides see "Protected while in progress and until {date} ET". The hiring side additionally sees "unless the sourcing recruiter released the candidate". The line is the same whether or not a release happened. Undelivered referrals show no date (N2 BR-19). After the window ends and the referral isn't in progress, neither side sees a protection statement; A sees its filing limit (BR-6).
- **BR-36 HA-9 signal.** A release made within 14 days before a hire record (any kind, BR-7 or BR-11) at the same client is a signal for admins. *(rev. 2, PD-069 cut 3)* Read by **Ops SQL** until the N2.1 metrics panel; no in-product flag in N3. The data (release and record timestamps) is stored either way.

### H. Authorization check (RD-029)

- **BR-37 Challenge and void.** An admin opens an authorization check on a delivered referral when requested by: a stopped submitter (through the support path, first submitter not revealed), the candidate, or the hiring side inside a claim or hire-report dispute (an action in the dispute). If the confirmation carries a recent-change note or the challenger brings evidence, the source org has **5 business days** (stored) to provide independent right-to-represent evidence (the candidate's dated message from a channel other than the confirmation mailbox), uploaded through the N1 pipeline, admin-only. The admin may contact the candidate through an identifier the source org didn't set. **Invalid** (candidate denies, mailbox recruiter-controlled, or no answer): the presentation is **void**: it stops counting, no first position, no fee; the consent is marked disputed; the case is flagged for RD-002 breach review (N10 conduct case once N10 ships). A hire report on a void referral fails (HE-12).
- **BR-38 Evidence note.** The consent evidence adds "Candidate record created on {date}" when the record was created within 30 days before token issuance. Source org and admins only, never the hiring side.
- **BR-39 (Should) Confirmation destination.** The candidate-confirmed path refuses a candidate email equal to a member's email in the source org, and on the source org's own verified domain if the product has one (not freemail).

### I. Admin flags, visibility, notifications, privacy, edge cases

- **BR-40 Admin-only flags, no automatic action.** In the product: HA-6 (a sourcing org with 2 rejected reports in 90 days), late records (BR-13), fee details overdue (BR-31), admin decision overdue (BR-27), unanswered, notice not delivered (BR-29). *(rev. 2, PD-069 cut 3)* By **Ops SQL** until the N2.1 metrics panel: HA-1 (a hiring org with 2 or more hires in 12 months first reported by A and then confirmed, deemed, upheld **or closed by B's own record** **[estimate]**, PD-075) and HA-9 (BR-36).
- **BR-41 No counterpart statistics.** Hire-report outcomes are admin metrics only. Each side sees only its own reports and answers; no member sees counts or outcomes about another org.
- **BR-42 Notifications and audit.** In-app kinds, PII-free params, English-in-SQL per PD-026 (localised and emailed by N7): report filed (B), reminders day 5 and 8 (B), contest (A), rebuttal (B), decision (both), deemed confirmed (both), report closed by B's record (A), hire recorded on a referral without a confirmed agreement (A), record-only hire (A), fee details overdue (B), authorization check requested and decided (source org). Audit events for every state change; metadata has no client name or key, no employer text, no evidence content, no candidate identifiers.
- **BR-43 Privacy (⚖️ Q-4).** Employer text and evidence describe the candidate's new job. Collected only for the hire question; files and URLs admin-only; never shown to candidates or other orgs; not in audit metadata or notifications. No automatic purge in N3: retention is set by counsel in the N7 PIA (strategist proposal: until the dispute closes + 2 years). The Privacy Policy line and the admin candidate-contact purpose are launch-checklist items.
- **BR-44 Edge cases.** HE-2: a hire that ends in week 2 still counts; guarantee and remedy from the snapshot. HE-3: an offer reneged before start isn't a hire. *(rev. 2, PD-074)* There's no placement fall-off or cancel flow today, and one hire record per referral: cancelling a placement and re-recording a later start go to **X6** (fall-off flow); until then Ops handles it through support with an audit note. HE-10: notices go to admins and managers; clocks don't pause. HE-11 *(updated, PD-079)*: N10 settlement mode is in the tree, so a suspended party keeps acting on in-flight referrals (file, rebut, contest, record). A suspended B is never deemed: at `answer_due_at` the report goes to the admin queue. A suspended A with no rebuttal → `in_review`. The admin decides; admin views show Suspended. HE-14: internal referrals follow the same flows; the split stays 0 sourcing bps.

- **BR-45 No hire record while B's own objection is open (rev. 2, PD-075).** B can't record a hire on a referral while its prior-presentation objection on that referral is open or contested (`objection_open`, a specific code: B knows its own objection). Once the objection is decided: rejected → B records normally, and the record isn't late if made within 5 business days after the decision (BR-13); upheld or final → the referral doesn't count, and no hire is recorded on it. Mirrors HE-13 for A.

---

## 7. Constraints

- **Security:** every new write is a `SECURITY DEFINER` RPC with membership and role re-checks, `search_path = ''`, on the `api-surface` allow-list; Server Actions in `guard()` with Zod and the same schema on the form. The tenant comes from `getRequestContext`, never the client. IDOR: referral, report and dispute ids re-resolved through RLS; another org gets not-found. Generic refusals (BR-17) so filing can't probe client names; rate limits (BR-20). B never receives candidate ids beyond today's; A never receives the client name or key. `deemed_agreement_enabled` isn't writable by any member or by the app's user session.
- **Record-scope coordination (PD-064):** `report_hire`, `release_referral`, `withdraw_referral`, `open_dispute` and `record_candidate_request_delivery` all have copies in `20261115000300_recruiter_record_scope.sql`. That file is never edited. Changes go in new migrations after `20261116000700`, each starting from the **latest** body of the function. QA re-runs `recruiter-record-scope.test.ts` and the N1, N2 and N9 suites.
- **Privacy:** BR-43. New personal information (new employer, start month) is minimised and admin-gated. No candidate PII in notes, audit or notifications.
- **Money:** integer minor units, no FX, one currency per snapshot, bounds (BR-32), floor unchanged (N2 BR-27), platform basis `collected` (PD-049).
- **Migrations:** local only (`npm run db:reset` + `npm run db:types`). No hosted push unless the user asks; N3 is pushed with or after N1, N9 and N2, never before them.
- **i18n:** en / fr-CA / pt-BR; fr ~25% longer. "Hire report" vs "claim" kept apart in all three languages (glossary).
- **Accessibility:** WCAG 2.1 AA, 44px targets, deadlines as text with "ET" and business days left (N1 pattern), forms with labelled groups.
- **Next.js 16:** frontend reads `node_modules/next/dist/docs/` (AGENTS.md); no Cache Components (ADR-0003).
- **Local processes (PD-080):** stop only processes you started, by recorded PID (no `pkill` / pattern kills); never touch port 3000 or the user's `npm run dev`; announce any `db:reset` (shared DB, PD-078); list started and stopped processes in your report.

---

## 8. Risks and open questions

### 8.1 Risks
| # | Risk | Mitigation | Owner |
|---|---|---|---|
| R-1 | Estimate overrun (N2 ran to the top of its range; N3 is larger) | Rev. 2: 19.25 d before buffer, ~22.1 with it (PD-073). Drop-1 checkpoint: backend reports if drop 1 passes 10.5 d; if the projected total would pass 23 d with buffer, the PM takes it to the user, no further silent cuts | backend, PM |
| R-2 | Fishing for confidential client names through guessed reports | Counting referrals only, generic refusal, "not this client" only, rate limits, HA-6 flag | backend, QA |
| R-3 | Deemed confirmation on a report B never saw | Data-gated on delivered email to two people (BR-29); admin queue otherwise; reopen only on platform failure | backend, N7 |
| R-4 | Admin queue load before N7 (every unanswered report) | Staffed dispute owners (launch checklist); target 10 business days; N7 is a launch gate anyway | Ops, PM |
| R-5 | Counsel says no to Q-1 (deemed agreement) | Flag off → record-only hires on unaccepted referrals; rule 6.3 tells the truth; A's report path stays | counsel, user |
| R-6 | N7 can't record bounces (no provider webhooks in N8) | Then deemed confirmation never runs and silence always goes to the admin queue; N7 scope addition (PD-070) | N7/N8, user (vendor) |
| R-7 | Record-scope copies silently override N3 changes | PD-064 rule; QA re-runs record-scope suite; md5 check at push | backend, QA, Ops |
| R-8 | A hire recorded at an unseen fee (amendment race) | Reuse N2's `hire_terms_changed` check on every new record path | backend |
| R-9 | Release block leaks a pending report to B | B never sees release options or flags; the block affects only A's own options | backend, QA |
| R-10 | Referral moving from `declined` to `hired` breaks existing status logic (pipeline, metrics, N1 counts) | Backend lists every reader of referral status in the estimate; QA regression on pipeline and N1 | backend, QA |
| R-11 | B can't prove when the selection process started | Admin decides on the record (7.2); refusal to give the client's confirmation counts against B | Ops |
| R-12 | Asking the candidate becomes routine | ≤ 1 contact per dispute tracked (BR-28) | Ops |
| R-13 | Evidence about the candidate's new employer kept without a retention rule | Admin-only, no purge until counsel's PIA retention (Q-4); launch gate | counsel, user |

### 8.2 Strategist questions (non-blocking)
- **S-N3-1:** RD-052 says live referrals never expire for hires. N1 BR-4 (duplicate check) still stops counting a referral at window end, even if it's `interviewing`. Should an in-progress referral past its window also keep counting for the duplicate check, so another agency can't present the same person to the same client while the first process is live? **Default until answered: no N1 change in N3.** If the answer is yes, it's a small N1 predicate change that can join N3's drop 1.

### 8.3 Counsel items ⚖️ (via N7; the user engages counsel)
| # | Question | What ships in N3 meanwhile | Gate |
|---|---|---|---|
| **Q-1** | Is a split owed and enforceable when B never accepted the referral (deemed agreement from the snapshot, relying on Network Rules acceptance N10 and rules 6.1/6.3)? | BR-9/BR-10 built and tested **behind `deemed_agreement_enabled`, off in production**. Flag off = record-only hire | Flag on only after counsel yes **and** N10 acceptance live (launch checklist). If no: flag stays off, 6.3 wording says so |
| **Q-2** | The 6-month filing tail after the window (+3 with the re-engagement tail): acceptable next to provincial limitation periods (ON 2 years, QC 3 years), worded as a platform rule only? | BR-6 ships with 6 / +3 months as constants | Rule 6.3 text approval (P0-1); constants changed if counsel asks |
| **Q-3** | "Client and its affiliates, agents, EORs and payroll providers", and contractor / PJ engagements counting as a hire: wording and fit with members' client contracts | BR-15 reason, BR-25 contest wording and helpers ship as drafts marked ⚖️ | Rule 6.3 / 6.4 text approval (P0-1) |
| **Q-4** | Admin contact with the candidate to verify a hire, and evidence files about the new employer: purpose, consent-text coverage (Law 25 / PIPEDA), retention (proposed: dispute closed + 2 years) | BR-18, BR-28, BR-43 built; no purge | PIA and Privacy Policy line before launch (Legal checklist) |
| — | Voiding wording (RD-029), rule 6.4 duty wording, 7.2 deadlines | Drafts | P0-1 |

### 8.4 Needs user decision
- **U-N3-1 (pricing, RD-056 / Q-5).** See §11 for the exact question. Recommendation: **normal rate on the fee collected, no surcharge.** The build assumes it (zero added days). A surcharge is a scope change (new rule field, ledger change, RD-009 ⚖️), about +1.5–2 backend days plus copy and QA, and would go to counsel.
- **U-N3-2 (legal posture and counsel).** Approve the gating in §8.3 and send Q-1 to Q-4 to counsel now.
- **U-N3-3 (effort).** Accept N3 as **L**: ~20 backend days including the money-bounds line and the 15% fix-loop buffer (range ~18–23), two internal drops, one QA pass.
- **Hosted push:** only on the user's request, after N1, N9 and N2.

---

## 9. Team plan

Agents communicate through `docs/specs/referral-claims-two-sided-hire/`. Done: step 0 (strategist: `recruiting-input.md`, RD-050 to RD-056) and step 1 (this brief, PD-066 to PD-070).

| Step | Agent | Delivers | Runs with | Blocked by |
|---|---|---|---|---|
| 2 | **main session → user** | **Done 2026-11-16 (PD-071).** Checkpoint: U-N3-1, U-N3-2, U-N3-3 (§11) | — | 1 |
| 3a | **product-designer** | `spec.md` from the template: flows incl. sad paths (generic refusal, rate limit, out of tail, flag off, released, claim open, suspended party, notice not delivered), screens and states for: job form client-name gate and nudge; record-hire dialog variants (happy path unchanged, non-`offer` status, deemed agreement notice, other role, sister org, record-only "doesn't carry a split", legacy); A's "Report a hire" form and report panel (both sides); confirm and contest forms; rebuttal; fee-pending placement and invoice overdue on Commissions; release from declined/rejected; ownership line; admin hire-report queue and dispute view (outcomes, client names, same-person, files, candidate-contact and client-confirmation fields, restart clock, reopen); authorization check; flags. ACs Given/When/Then mapped to every BR and to the QA scenarios below. §9 open questions to the PM | 3b, 3c | 2 |
| 3b | **backend-engineer** | (1) N2 F-0 docs closeout (`domain-model.md`, `security-and-privacy.md`), required before the N3 handoff. (2) `backend-estimate.md`: schema and RPC plan, every reader of referral status touched (R-10), record-scope functions to re-copy (PD-064), deemed-confirmation data contract for N7 (delivery and bounce records), **money-bounds line** and **15% fix-loop buffer** lines, estimate per block against the 18-day bar (PD-069), questions for the PM | 3a, 3c | 2 |
| 3c | **ux-writer-marketing** | **Network Rules text changes** in `docs/content/network-rules/{en,fr-CA,pt-BR}.md` (French first for Québec), each marked ⚖️ and with "ships with" markers where needed: **6.3** coverage test (in progress, inside the window, 3-month re-engagement tail; any role; what counts as a hire per RD-055; exits incl. a void confirmation; filing limit window + 6 months, + 3 with the tail, as a platform rule only); **6.4** B records within 5 business days of learning of the offer acceptance and no later than 5 business days after start, client invoice within 10 business days of start, fee details within 10 business days after a confirmation, deemed confirmation or upheld report, A reports with dated evidence, waiving without consent = discount; **7.2** hire report answered in 10 business days, one rebuttal in 5, admin target 10, deemed confirmation only after delivered email (**"ships with N7"** marker), right-to-represent evidence in 5 business days. Glossary in `docs/content/voice-and-tone.md`: "hire report", "record a hire", "fee details pending", kept distinct from "claim/objection" | 3a, 3b | 2 |
| 4 | **product-manager** | **Done 2026-11-16 (rev. 2, PD-073 to PD-076).** Designer applies §12 and freezes `spec.md` | — | 3a, 3b |
| 5 | **ux-writer-marketing** | Final `spec.md` §5 copy, en / fr-CA / pt-BR: all N3 strings, error codes (`hire_report_unavailable`, `hire_already_recorded`, rate limit, out of tail, flag-off record-only, `no_client_name`), notifications, deadline lines, legal drafts marked ⚖️ | 6a | 4 |
| 6a | **backend-engineer, drop 1** | BR-1, BR-2 (prerequisites); Must 0b N2 leftovers (QA-N2-12 incl. the admin form's hidden field, QA-N2-10, QA-N2-11, three doc fixes); BR-3, BR-4; B's record path BR-7 to BR-15 incl. the `deemed_agreement_enabled` flag and record-only hires; fee-pending placements BR-31, BR-32; release and ownership BR-34 to BR-36; tests. `backend.md` **v1** | 5 | 4 |
| 6b | **backend-engineer, drop 2** | Hire reports BR-6, BR-17 to BR-22; answer BR-23 to BR-30 (deemed gate reads delivery records; QA seeds them by service role); authorization check BR-37, BR-38; flags, notifications, audit, privacy BR-40 to BR-44; metrics; tests. `backend.md` **v2**; `domain-model.md`, `security-and-privacy.md`, `architecture.md` (if a service-role use changes) | 7a | 6a |
| 7a | **frontend-engineer, drop-1 surfaces** | Job form gate and nudge, record-hire dialog variants, fee-pending placement and invoice overdue on Commissions, release from declined/rejected, ownership line. i18n from §5 | 6b | 5, 6a (`backend.md` v1) |
| 7b | **frontend-engineer, drop-2 surfaces** | Report form and panels (both sides), confirm/contest/rebuttal, admin queue and dispute view, authorization check, flags. `frontend.md` (routes, components, keys, AC per screen) | — | 6b (`backend.md` v2), 7a |
| 8 | **qa-engineer** | `qa-report.md` on the **complete** N3 (no QA of drop 1 alone): every BR and AC × role × state, scenarios below, N1 / N2 / N9 / record-scope regression, `lint`, `typecheck`, `test`, `test:integration`, `test:e2e` with real output | — | 7b |
| 9 | **product-designer** + **ux-writer-marketing** (review, parallel) | `design-review.md`, `copy-review.md` | each other | 7b (can overlap 8) |
| 10 | fix loop | Blockers and majors to owners, QA re-runs (max 3 rounds) | — | 8, 9 |
| 11 | **product-manager** | `acceptance.md`; roadmap, launch checklist and `implementation-plan.md` updated | — | 10 |

- **Parallel:** 3a ‖ 3b ‖ 3c (different files). 5 ‖ 6a. 6b ‖ 7a: backend owns migrations and `src/features/*/{schemas,actions,queries,domain}.ts`; frontend owns components, routes and messages. The main session checks for file overlap before running 6b and 7a together.
- **recruitment-strategist:** not needed for the build. S-N3-1 can run any time; its answer only matters before drop 1 closes.
- **No hosted push** of drop 1 or of N3 unless the user asks.

### 9.0 Reconciled estimate (rev. 2, PD-073), replaces §9.1 for backend

| Line | Days |
|---|---|
| Backend estimate (`backend-estimate.md` §10), Must before buffer | 21.0 |
| PD-069 cut (2): no restart of the answer clock | −0.25 |
| PD-069 cut (3): HA-1 and HA-9 → Ops SQL | −0.35 |
| PD-069 cut (4): sister-org tick → admin note | −0.25 |
| BR-30 reopen → N7 (option b) | −0.5 |
| Metrics counts → Ops SQL, admin-task flags kept (option c) | −0.4 |
| BR-45 objection-open refusal and late exemption (new) | +0.0 (inside the `report_hire` v3 item; backend flags if not) |
| **Must before buffer** | **19.25** (drop 1 ≈ 9.25, drop 2 ≈ 10.0) |
| Fix-loop buffer 15% | 2.9 |
| **Backend total** | **~22.1**, inside the user-accepted ~18–23 |
| Must 0b (N2 leftovers) | done, ~0.5 actual, outside |
| Shoulds (1.25) | excluded |

Option (d) (move the deemed branch and its seeded tests to N7) is **rejected**: the data gate is a never-cut item and testing both branches now is what proves silence can't win without delivered email. The 18-day PD-069 bar is superseded by the user's accepted range as the hard limit (PD-073). Frontend, design, copy and QA estimates are unchanged except that the reopen action, the restart action, the sister-org tick and the HA-1/HA-9 flag rows drop out of the UI (frontend ~−0.5 d).

### 9.1 Effort estimate (PM, rev. 1, before the backend's day-1 estimate)

| Agent | Work | Days |
|---|---|---|
| backend-engineer | Prerequisites: client-name gate 1.0, O-1 0.5 | 1.5 |
| | B's record path (any status, deemed agreement + flag, other role, sister org, legacy, record-only, late marker, invoice clock, new reason) | 3.0 |
| | Fee-pending placements and fee-details completion, clock, admin task | 1.5 |
| | Release from declined/rejected, per-client release block, HA-9, ownership line data | 0.75 |
| | Hire reports: tables, evidence on the N1 pipeline, filing RPC, eligibility, generic refusal, tail, rate limits, second-report rules, competing records, visibility RPCs | 3.0 |
| | Answer: confirm, contest, `hire_report` dispute kind, rebuttal, stored deadlines and reminders on the maintenance sweep, silence branch (deemed vs admin queue), restart once, reopen, suspended-party rule | 2.5 |
| | Admin: outcomes (upheld / rejected / void), admin view RPCs, dispute fields, overdue flag | 2.0 |
| | RD-029 authorization check, record-created note | 1.25 |
| | Flags and metrics | 0.75 |
| | Notifications, audit, api-surface, docs | 1.0 |
| | **Money-bounds line** (PD-059) | 0.5 |
| | N2 leftovers, Must 0b (PD-072): QA-N2-12 0.5, QA-N2-10 / -11 0.15, docs 0.1 | 0.75 |
| | Subtotal | **18.5** |
| | **Fix-loop buffer 15%** (PD-059) | 2.8 |
| | **Backend total** | **~21.3 (range ~18–23, inside the accepted range)** |
| frontend-engineer | ~9.5 build + 15% buffer | **~11** |
| product-designer | spec 3.0 + review 0.5 | **3.5** |
| ux-writer-marketing | rules 6.3 / 6.4 / 7.2 in three locales 1.0, §5 copy 2.0, review 0.5 | **3.5** |
| qa-engineer | first full pass (re-runs inside the fix-loop buffers) | **~5** |
| product-manager | reconcile 0.5, acceptance 0.5 | **1** |

Shoulds (BR-16, BR-39, employer signal) add ~1 backend day and aren't in the total. **Calendar:** about 6–7 weeks on the backend critical path (spec → drop 1 → drop 2 → frontend drop 2 → QA → fixes), with design, copy and frontend overlapping. Roadmap effort moves from M to **L** (PD-069).

### 9.2 QA scenarios (minimum)
1. Open a job to external referrals with a placeholder client name → refused; existing referral-open job without a key → hidden from partners (every listing and both submit RPCs), owner sees `no_client_name`; internal referral to a related org unaffected; no partner surface returns the client name.
2. Source-org member calls `record_candidate_request_delivery` directly → refused; the server path records "sent"; N9 suite green.
3. B records a hire from each status: `submitted`, `interviewing`, `offer` (unchanged dialog), `declined`, `withdrawn`, `rejected`, `cancelled`, SLA-released; from `awaiting_candidate`, `candidate_declined`, `already_presented`, upheld-claim and void referrals → refused.
4. Never-accepted referral: flag on → deemed agreement from the snapshot, A notified; flag off → record-only hire, no placement; a member or the app session can't change the flag.
5. Other role at the same client (key match on commit key only, on delivery key only) → recorded on the governing referral at the snapshot rate × the new base; a job without a key → only that job.
6. Released referral → record-only, "doesn't carry a split", no allocation; HA-9 flag when the release was within 14 days.
7. Late record → `late` marker (admin only); invoice not recorded 10 business days after start → "Invoice overdue" both sides.
8. A files with valid evidence → B sees statement, types, dates, hashes, not files or URLs; A never sees the client name; filing with a pending report, an open claim, after two rejections, a second report without newer evidence, out of tail, on a released referral, from another org → one generic code; rate limit → its own code; existing placement → `hire_already_recorded`.
9. Filing between window + 6 and + 9 months without the process-start statement → refused; with it → filed; after + 9 → refused.
10. Release while a report is pending → refused on every referral of A's org at that client (either key); allowed again after resolution.
11. B records while A's report is pending → report closed "confirmed by the hiring recruiter".
12. Confirm → prefilled form → placement; contest with each reason and its required evidence (missing dates on `outside_window` refused) → `hire_report` dispute; second open dispute on the referral refused.
13. Rebuttal once within 5 business days; second rebuttal or late rebuttal refused.
14. Admin outcomes: upheld → fee-pending placement; rejected → A sees "not upheld"; `not_this_client` finding → A sees only "not this client"; void → referral stops counting, consent disputed.
15. Silence with no email delivery records → admin queue "unanswered, notice not delivered", never deemed; no restart action exists. With delivered records seeded for the job owner and one admin → deemed; with one recipient only, a bounce, or no active job owner → admin queue. B can't contest after the deadline; Record hire still works.
16. *(rev. 2: reopen moved to N7, PD-073.)* B records a hire while its own objection on the referral is open → `objection_open`; after a rejected objection, a record within 5 business days isn't late (BR-45).
17. Fee-pending placement: no invoice, payment or allocation possible; estimate shown labelled; overdue → admin task; no automatic pause.
18. Money bounds on every new money input (direct RPC calls with oversized values refused).
19. Release from `declined` / `rejected` with the two-step; refused with a placement or a pending report; B can't read the release flag anywhere.
20. Ownership line identical on released and non-released referrals for B; no date on undelivered referrals.
21. Authorization check: request from a hire dispute; no evidence in 5 business days → void; record-created note within 30 days visible to source org and admins only.
22. Cross-tenant and IDOR: every new RPC with another org's ids → not-found without leak; anon refused.
23. Suspended B (pre-N10) at the answer deadline → admin queue, never deemed.
24. Regression: N1 (duplicate stop, claim, contest, release), N2 (hire dialog, amendment, `hire_terms_changed`, ledger floor), N9 (forged token), `recruiter-record-scope.test.ts`, Journey A E2E.

---

## 10. Definition of done

- Every Must BR has ACs in `spec.md` that pass in `qa-report.md` with real command output; no open blocker or major.
- `deemed_agreement_enabled` exists, defaults false in every environment, and both of its branches are tested. The deemed-confirmation branch is tested with seeded delivery records.
- Network Rules 6.3, 6.4, 7.2 drafts updated in en / fr-CA / pt-BR with ⚖️ and "ships with N7" markers.
- `design-review.md` and `copy-review.md` have no open blocker; en / fr-CA / pt-BR complete.
- `backend.md` (with the money-bounds checklist), `frontend.md`; `docs/domain-model.md`, `docs/product-flows.md`, `docs/security-and-privacy.md` (and `architecture.md` if touched) updated.
- Migrations applied locally only; record-scope rule respected; N1, N2, N9 suites green.
- Launch checklist carries: flag on only after counsel Q-1 and N10; N7 hire-report emails with delivery and bounce records; Q-2 to Q-4 counsel items; the "sent" playbook line removed once BR-2 ships.
- Roadmap N3 accepted, `docs/implementation-plan.md` in sync.
- Every agent report states the processes it started and that it stopped each one by PID; the user's dev server was not touched (PD-080).
- Deferred with owners (PD-079): admin "Invoice overdue" → Ops SQL until X9; client names at commit/delivery → Engineering hygiene before launch; deemed line's fee-details date → N7 acceptance.

---

## 12. Rev. 2 delta for design (`spec.md`)

1. §9: every Q-D answered (PD-071, PD-075); replace with the decisions table now in `spec.md` §9.
2. **Remove** (move ACs to "moved to N7 / Ops SQL", keep numbering): the admin **Reopen** action and its states (BR-30 → N7); the admin **Restart answer clock** action (BR-29); the **sister-org tick** in the record dialog (BR-12; admin note on the hire record instead); the **HA-1 and HA-9** flag rows and the metrics counts on the admin overview (Ops SQL). HA-6, late, fee overdue, decision overdue and unanswered stay.
3. **Add:** `objection_open` result in the record dialog when B's own objection is open (BR-45) and an AC; "no active job owner → admin queue" AC (Q-D16, already the default); contest form hint "don't name the client" and `not_this_client` statement admin-only (already the default, confirm AC-55).
4. **Change:** HA-1 definition counts reports closed by B's record (Q-D17, AC-84 → Ops SQL note); the brief's "form reloads" for QA-N2-12 = a `router.refresh()` on `errors.stale_version` (Q-PM-12, frontend drop 1).
5. Header: inputs → brief rev. 2, PD-071 to PD-076; remove the "not in decisions.md yet" note; status → **ready for copy** once 1–4 are applied.

## 11. User checkpoint: exact questions (answered 2026-11-16: (a), approved, accepted; PD-071)

The PD-069 bar applies to the build items only: the 0.75 days of N2 leftovers (Must 0b) are counted outside the 18-day bar.

1. **U-N3-1 (pricing, RD-056 / Q-5).** When a hire is established through the sourcing recruiter's report (a backdoor caught: confirmed, deemed or upheld), should MissionHub's platform share be **(a) the normal rate on the fee actually collected, with no surcharge** (strategist and PM recommendation: keeps MissionHub neutral, consistent with PD-049; consequences for the hiring side go through the conduct ladder, not money; 0 added build days), or **(b) a surcharge on the hiring side** (for example 2× or a flat amount; reads as a penalty clause ⚖️, raises RD-009 questions, about +1.5–2 backend days plus copy, QA and counsel)?
2. **U-N3-2 (counsel, ⚖️).** Do you approve this posture and will you send Q-1 to Q-4 (§8.3) to counsel now: deemed-agreement placements on referrals the hiring side never accepted are built but **stay off in production** until counsel confirms Q-1 and N10 rules acceptance is live; if counsel says no, those hires are recorded without a split and rule 6.3 says so. The filing tail (Q-2), "what counts as a hire" wording (Q-3) and evidence/candidate-contact privacy (Q-4) ship as drafts and are launch-gated.
3. **U-N3-3 (effort).** Do you accept N3 at **~20 backend days** (range ~18–23, including the money-bounds line and 15% fix-loop buffer), about 6–7 weeks of calendar, built in two internal drops with one QA pass? If the backend's day-1 estimate exceeds 18 days before buffer, the PM applies the PD-069 cut list (Shoulds, then admin-convenience items) without cutting any trust or security rule.
