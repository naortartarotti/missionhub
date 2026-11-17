# Recruiting input: Referral-level claims and two-sided hire reporting (N3)

Owner: Recruitment Strategist · 2026-11-16 · For: product-manager (N3 brief), product-designer
Decisions: RD-003, RD-004, RD-015, RD-017 to RD-020, RD-023, RD-025, RD-027, RD-029, RD-030, RD-033, RD-037 and **new RD-050 to RD-056** (`docs/strategy/decisions.md`). Network Rules v1: 4.8, 6.3, 6.4, 7.1 to 7.5.
Labels: **[experience-based]** = practitioner norm, no published source; **[estimate]** = calibrate on founding-group data; ⚖️ = counsel.

---

## 0. What exists today (code and docs, 2026-11-16)

- `report_hire` works only from `offer`, only for the job-owner org, and only with an **active collaboration agreement**. The agreement is created at acceptance and confirmed by the sourcing side. So a hire on a referral that was declined, withdrawn, cancelled, released by SLA or never answered **can't be recorded by anyone**. That is the exact backdoor case.
- `ownership_protected_until` = delivery + the snapshot window (N2). Nothing reads it.
- N2 stores on every post-N2 referral the terms version, commission-rule version, commit and delivery client keys, and the frozen fee estimate. `compute_fee` and the floor (RD-031) already work from the snapshot.
- N1 gives: "counts" (BR-4), one claim per referral, referral-level disputes (`disputes.kind = prior_presentation`), the business-day helper (RD-018), release flags, and the admin "same person" signal (PD-024).
- N9 gives server-issued candidate tokens. O-1 is still open: `record_candidate_request_delivery` is callable by the source org (N3 prerequisite, PD-043).
- `open_dispute` takes a placement only. `resolve_dispute` can't change an allocation (RD-034).
- Network Rules 6.4 says both sides report hires, but sets **no deadline for the hiring side**. 7.2 already says a hire report must be answered within 10 business days.

**Gap in one line:** the party that owes the money is the only one who can record the hire, and only on the happy path.

---

## 1. How it really works

### 1.1 Who reports a hire, and when

| Situation | Who knows first | What happens in the market |
|---|---|---|
| Hire through the referral (happy path) | Hiring recruiter (B) | B tells A at offer acceptance and invoices the client on the start date. NPA and Top Echelon expect B to report and pay promptly; Top Echelon wants a completed placement form with the payment ([TE analysis](../../research/top-echelon-policies-analysis.md) p. 21). |
| Client hires a declined, withdrawn or "dead" candidate later, same or other role | Client, then B (maybe) | The classic backdoor. B often learns from the client and "forgets" the partner, or never learns because the client went direct. **A learns from the candidate or LinkedIn**, often 1–4 months after the start **[experience-based]**. |
| Client hires through another agency or directly after B's introduction | Client | B's client terms usually give B an introduction fee for a set period: 12 months is common in UK terms, some use 6 ([Reed](https://resources.reed.com/hubfs/Website/Documents/Terms%20of%20Business/Executive%20Search%20Terms%20of%20Business%20-%20Reed.pdf), [Goodman Masson](https://www.goodmanmasson.com/terms-of-business-for-perm-employment), [Brook Street](https://www.brookstreet.co.uk/rails/active_storage/blobs/eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaHBBOHNLUUE9PSIsImV4cCI6bnVsbCwicHVyIjoiYmxvYl9pZCJ9fQ==--aabee74b1bce7842b1e5434e5907452fe14914ef/BrookStreetPermTOBs2022.pdf)). Whether B pursues it is B's call. A's share follows what B collects. |
| Hire by the client's affiliate, as a contractor, or through an EOR | Client | The most common way round a fee. Courts look at the contract's definitions of "introduction" and "engagement", and at whether a rejection was final. One 2024 DIFC small-claims case was an affiliate hire after a rejection ([summary](https://legal-wires.com/uae-difc-cases/sct-3562024-nafrin-v-nahlah-2024-difc-sct-356-20241016/)). |

What follows from this:
1. B must be able to record a hire from **any** referral that still counts, not just from `offer`.
2. A needs its own path, because often only A finds out.
3. The test has to be objective. "Who introduced first" is already answered by N1. N3 decides only whether this candidate was hired by this client within this window.

### 1.2 Evidence standards in practice
- **A rarely has documents.** What A has: the candidate's message ("I started at X on Monday"), a LinkedIn change, a company post, or a mutual contact. A rule that demands an offer letter kills the feature (RD-030).
- **B has the documents**: the offer, the signed acceptance date, the start date, the client invoice, and the client's written confirmation. So once A gives a credible, dated signal, **the burden moves to B**.
- **The candidate is the tie-breaker.** Disputes between agencies are settled by asking the candidate **[experience-based]**. The admin may contact the candidate (rule 7.3), and may contact the client only with B's permission (rule 7.3, rule 3.3).

### 1.3 Where time is lost and trust breaks
- B's silence. Mitigated by deemed confirmation (RD-030), which needs working email (§4.4).
- B confirming the hire, then never entering the fee details. Placement stalls at "fee pending" (§4.5).
- Long notice periods. In the UK, Brazil (30-day *aviso prévio*) and for senior roles in Canada, the start date can fall weeks after the offer. So the timing event is **offer acceptance**, not the start date (RD-030, RD-052).
- Slow-walked offers. B declines at month 2, re-engages the candidate directly at month 5, and the offer lands at month 6 + 1 day (§3, RD-052).

---

## 2. The model (RD-050)

**Two ways a hire gets recorded, both tied to one referral:**

| | Hiring side (B) "Record hire" | Sourcing side (A) "Report a hire" |
|---|---|---|
| On which referrals | Any referral that still counts, any status (submitted to offer, declined, rejected, withdrawn, cancelled, released by SLA) | Same list (RD-030); never `already_presented`, `awaiting_candidate`, `candidate_declined`, or a referral A released |
| Effect | Placement created from the snapshot (deemed agreement when B never accepted, RD-051) | Pending hire report → B confirms (completes B's record), contests (dispute), or stays silent (deemed confirmed) |
| Fee details | Entered now | Entered by B when confirming, or within 10 business days after a deemed confirmation or upheld report |

- **Terminology.** "Claim" stays N1's word for B's prior-presentation objection (PD-028). In N3, A's action is a **hire report** filed against a specific referral. The ux-writer keeps the two words apart in all three languages.
- **No "inquiry" without evidence.** A suspicion with no dated item goes in the referral messages (rule 7.1), and B must answer truthfully (rule 4.8). We don't build an evidence-free "did you hire X?" button. It would be used to fish for confidential client names and to harass.
- **The governing referral.** N1 allows only one counting presentation per candidate × hiring org × client key. That referral is the one a hire attaches to, whichever job the hire is into (RD-003 "any role"; RD-025: the frozen rate applies to the other role).

---

## 3. Timing: does this hire fall inside the protection? (RD-052)

A hire is covered when **any** of these is true:
1. **The referral was in progress at the time of the offer.** Statuses `submitted` to `offer` never expire. The window doesn't run out on a live process.
2. **The offer was accepted inside the window** (delivery + snapshot window; 12 months for legacy referrals). If the acceptance date is unknown, the start date is used (RD-030).
3. **Tail for re-engagement:** the client's selection process that led to the hire (first interview or assessment, any role) **started inside the window**, and the offer was accepted **within 3 months after the window ended**.

- The window starts at **delivery** (RD-023), never at the draft or the candidate request.
- **Reporting tail:** A may file a report until **6 months after the window ends** (RD-030 ⚖️; with the re-engagement tail that's up to 9 months after the window). This is a platform filing limit. It doesn't cut anyone's legal rights (⚖️, Q-2).
- **What is never a defence inside the window:** "we found them ourselves later", "the candidate applied directly", "the candidate came back through another agency", "we hired them into a different role", or "the referral was declined/withdrawn". The only exits are the ones in 6.3: release by A, an upheld or final prior-presentation claim, `already_presented`, or a voided confirmation (RD-029).

---

## 4. Workflows, rules and deadlines

All deadlines use RD-018: business days, ET, the ON ∪ QC holiday table, the event day not counted, and stored when the clock starts.

### 4.1 Deadline table

| Clock | Who | Length | Starts | On expiry |
|---|---|---|---|---|
| Record the hire | B | **5 business days** | offer acceptance known to B (or learning of a hire into another role or after closure). Never later than 5 business days after the start date | Late or missing record = rule 6.4 breach → conduct category 4. A's report path stays open |
| Record the client invoice | B | **10 business days** | start date | Shown as overdue on Commissions (feeds X9). Not invoicing at all is a B discount: the floor applies (RD-025) |
| File a hire report | A | until window end + 6 months (+3 with the re-engagement tail) | delivery | Report refused as out of time |
| Confirm or contest | B | **10 business days**, reminders at 5 and 8 | report filed | Deemed confirmed (only if §4.4 holds) |
| Rebuttal after a contest | A | **5 business days**, once | contest filed | Admin decides on the record |
| Admin decision | Admin | target **10 business days** | rebuttal deadline | Overdue flag in the admin queue, no auto-outcome |
| Independent right-to-represent proof, if the confirmation is challenged (RD-029) | A | 5 business days | admin request | Presentation void (no fee) |
| Fee details after a deemed confirmation or upheld report | B | **10 business days** | confirmation or decision | Admin notice under 6.4 → sanctions ladder (RD-053) |
| Offer-stage nudge (Should) | B | 30 calendar days in `offer` | entering `offer` | In-app prompt "Was the offer accepted?" |

### 4.2 B records a hire (RD-051)
- Available from any counting referral, by the job owner or a manager (RD-036). On the happy path (`offer` + active agreement), nothing changes.
- **From a non-accepted referral:** the placement uses the referral's **frozen snapshot** (terms version, commission rule, client keys) as the agreement. A doesn't need to confirm anything, because A committed to those terms at submission (RD-023). ⚖️ The legal basis is the Network Rules acceptance (N10) plus 6.1/6.3 (Q-1).
- **Into another role at the same client:** B records it on the original referral. Fee = the snapshot rate × the actual base for the role hired into, with the minimum fee. The job title of the hired role is recorded.
- **On a released referral:** B can record the hire for the record, but no placement or split is created. B is told then that "this referral doesn't carry a split", because revealing the release at hire time no longer protects anything (RD-054).
- **Sister-org hire:** a hire by a related org of B (shared member) at the same client counts as B's hire. B records it. This closes the RD-021 laundering route on the hire side.

### 4.3 A reports a hire (RD-030 + RD-053)
- Form (RD-030): employer as known, approximate start month, role if known, how A learned, **at least one dated evidence item**, attestation (4.8).
- **Evidence types, strongest first:** candidate's written message (dated, from a channel A doesn't control); company announcement or org chart; public profile change (URL + capture date); third-party statement; other. A screenshot without a URL or date is accepted, but weighs less.
- **Before filing, the server checks** (A sees only a generic "can't file on this referral"): the referral counts, is within the reporting tail, has no pending report and no open dispute, and A is under the rate limit.
- **Visibility:** B sees the statement, evidence type, dates and SHA-256. Files are admin-only (RD-016 symmetry). A never sees the client name. A "not this client" outcome is shown only as that.
- **Release is blocked** on every referral at that client from A's org while a report is pending (RD-019).

### 4.4 B's answer
- **Confirm** → B's "record hire" form, pre-filled from the snapshot. Placement created.
- **Contest**, one reason each, with evidence:

| Reason | Evidence B must give | How the admin checks |
|---|---|---|
| Not hired by the client or its affiliates | Attestation + any document (client's written statement with B's permission) | Weighs A's evidence. May contact the candidate through an identifier A didn't set (RD-029). A false contest is a 4.8 breach |
| Offer accepted outside the window | **Dated** offer-acceptance evidence **and** the date the selection process started (RD-052 tail) | Dates against delivery + window + tail |
| Different person | Attestation | Admin "same person" signal (PD-024) extended to hire disputes |
| Not this referral's client | Attestation (employer differs) | Employer vs **both** client keys (RD-033) + affiliates (⚖️ wording). Admin sees which client names produced the keys; A sees only "not this client" |

- "We already had them" isn't a contest reason. That was the 5-day claim (RD-004.3, RD-030).
- **Deemed confirmation on silence** runs only if the report notice was emailed (N7) to the job owner **and** at least one org admin or manager of B, and the emails didn't bounce. Otherwise the report goes to the admin queue as "unanswered, notice not delivered". Silence never wins on in-app notices alone (RD-053).
- **Reopening a deemed confirmation:** only by an admin, within 10 business days, and only if Workatent's own logs show the notice failed. "I didn't check" doesn't reopen it.

### 4.5 After the hire is established (confirmed, deemed or upheld)
- B enters the fee details (start date, base, bonus on total cash, invoiced fee and reason if I ≠ C) within 10 business days. Until then the placement shows **"fee details pending from the hiring recruiter"**, plus the **frozen estimate** from submission when one exists, labelled as an estimate. Workatent never invents a fee (rule 7.5).
- If B doesn't enter them: the admin sends a rule 6.4 notice, and the ladder applies with notice and a response window (N10). **No automatic pause.** This replaces RD-030's "Should: pause B's new partner jobs", which predates the N10 ladder.
- Money disagreements (base, discount, engagement type) → placement dispute → rule 7.5 (negotiation, mediation, arbitration). The admin's decision covers whether the hire counts, never the amount.

### 4.6 Ownership display (PD-027, N1 R-17)
- **Both sides, every referral:** "Protected while in progress and until {date} ET". The hiring side additionally sees "unless the sourcing recruiter released the candidate". That's true for every referral, so it reveals nothing (RD-054).
- **Release from `declined` / `rejected` ships in N3** (PD-021 deferred it). Once ownership is enforced, a candidate stuck behind a dead declined referral is a real cost to the candidate and to A (RD-054).

---

## 5. Edge cases recruiters will hit

| # | Case | Rule |
|---|---|---|
| HE-1 | Both sides report the same hire | The first valid record wins. If B records while A's report is pending, A's report closes as "confirmed by the hiring recruiter". If A files after B recorded, A is refused and pointed to the placement. |
| HE-2 | Candidate hired, then leaves in week 2 | Hire still counts. Guarantee and remedy come from the snapshot (RD-006, RD-027). |
| HE-3 | Offer accepted, then reneged before start | Not a hire if the person never started. B records the fall-off (existing flow). If the candidate starts later inside the protection, it's a hire again. |
| HE-4 | Client hires through another agency (on or off Workatent) | Still a hire on A's referral with B. B records it. If B's client won't pay B, it's a collection shortfall, shared pro rata (RD-025). If B **waives** its claim without A's prior written consent, the floor applies (RD-025, RD-031). Money → 7.5. |
| HE-5 | Two hiring orgs (B1, B2) each had a counting referral of the same person at the same client (two agencies on one client) | Never decided across hiring orgs (RD-013). Each B records the hire on its own referral, and each A's share follows what its B collects. Admins see both. |
| HE-6 | Hired as contractor, PJ, through an EOR or payroll provider, or by an affiliate | Counts as a hire (RD-055). B records it with the I ≠ C reason "non-permanent engagement" if the client fee differs. Floor and 7.5 apply. ⚖️ wording. |
| HE-7 | Hire into a role in another country or currency | Snapshot currency and rate apply. No FX by Workatent (RD-025, RD-034). |
| HE-8 | Legacy (pre-N2) referral | 12-month window. Free fee entry (BR-26). Deemed agreement uses the legacy default rule version in force at submission. |
| HE-9 | Candidate revoked authorization after delivery | Revocation stops data access, not ownership. The hire still counts. |
| HE-10 | B's member who owned the job left the agency | Notices and deadlines go to org admins and managers (RD-036). Clocks don't pause. |
| HE-11 | B or A is suspended or terminated | Continuity applies (RD-047). Hire reports and answers remain possible in settlement mode. |
| HE-12 | Confirmation challenged during a hire dispute (RD-029) | The challenge runs inside the dispute. If the presentation is void, the hire report fails and the case goes to RD-002 breach review. |
| HE-13 | Hire reported on a referral whose prior-presentation claim is still open | Report refused until the claim resolves (one open dispute per referral). Its 10-business-day clock starts after resolution. |
| HE-14 | Internal referral (related orgs) | Same flows. The split rule is unchanged (no sourcing share, RD-005), so a report only records the hire. |

---

## 6. Abuse vectors and defences

| # | Abuse | Defence |
|---|---|---|
| HA-1 | **Backdoor by B:** decline or let lapse, then hire directly | Record-from-any-referral duty, A's report, deemed confirmation, the RD-052 tail. Flag a hiring org when **2 or more hires in 12 months** were first reported by the sourcing side and confirmed or upheld **[estimate]** → admin review under 6.4. |
| HA-2 | **Slow-walk past the window** | RD-052 tail (process started inside, offer within 3 months). B must give the process-start date when contesting on timing. |
| HA-3 | **Laundering** through a sister org, another of B's jobs, or "client hired via another agency" | One governing referral per client key; sister-org hire = B's hire; HE-4 floor when B waives. |
| HA-4 | **Affiliate, contractor or EOR engagement** | RD-055 counts them. ⚖️ wording. |
| HA-5 | **B and candidate collude** (candidate tells A "no job", denies to the admin) | Public evidence outweighs a bare denial. The admin may ask B for the client's written confirmation, and refusing it counts against B (7.2 "decide on the record"). A false contest is a 4.8 breach and can bring an immediate hold (9.4). |
| HA-6 | **Fake report by A**, alone or with the candidate (pressure, or a hire that really went through another channel) | Attestation, dated evidence, rate limit (3 pending reports per org, 10 per 90 days **[estimate]**), 2 rejected in 90 days → flag (RD-030). Fabrication = 4.8, immediate hold possible. |
| HA-7 | **Fishing for the confidential client** by guessing employers | Reports only on counting referrals, generic refusals, only "not this client" revealed, rate limit. |
| HA-8 | **B confirms, then starves the fee details** | 10-business-day clock → notice → ladder. Frozen estimate shown as evidence. |
| HA-9 | **Pressure on A to release** once B is about to hire | Release blocked while a report is pending. Releases made within 14 days before a hire record on the same client are flagged for admin review (RD-019 signal). |
| HA-10 | **Missed notifications as a strategy** ("we never saw it") | Deemed confirmation needs delivered email to two people. Reopening only for platform-side failure. |
| HA-11 | **Renaming the client to move scope** | Keys frozen at commit and delivery. Union rule (RD-033). |

---

## 7. Rules the product must enforce (for the brief)

1. Hire record by B from any counting referral; deemed agreement from the snapshot; no placement on non-counting referrals (released: record only).
2. A's hire report on counting referrals within the reporting tail; one pending report per referral; second report on the same referral only with evidence dated after the first resolution; none after two rejections.
3. Coverage test per §3 (in progress, inside the window, or the tail), applied by the admin on a contest. The server refuses reports only on the reporting tail and eligibility.
4. Contest reasons and required evidence per §4.4; rebuttal once; admin outcomes: **upheld** (hire counts → placement) / **rejected** (no hire on this referral) / **void** (confirmation invalid, RD-029).
5. Deemed confirmation only with delivered email to two people of B (needs N7). Otherwise to the admin queue.
6. Fee-pending state with the frozen estimate; 10-business-day clock; overdue → admin notice task (no auto-sanction).
7. Release blocked while a report is pending on that client; release from declined/rejected available.
8. Ownership line shown to both sides per §4.6.
9. Admin view: both client names behind the keys (RD-033), the "same person" signal, and evidence files. None of these ever reach A.
10. Prerequisites: S2 client-name gate (RD-020) and O-1 server-only delivery (PD-043).
11. Metrics and flags: HA-1, HA-6, HA-9 flags (admin-only); hire-report outcomes **not** shown to counterparts in N3.

## 8. What success looks like

| Side | Success | Signal |
|---|---|---|
| Sourcing recruiter | "If they hire my candidate, I'll know and get paid" | Reports → placements ≥ 50% **[estimate]**; median report → resolution ≤ 15 business days |
| Hiring recruiter | Clear duty, no ambushes, fair contest | Self-recorded hires on non-`offer` referrals > 0 (honest B's use it); contested-and-upheld rate (A's report upheld) < 30% **[estimate]** |
| Candidate | Not caught in a fee fight, asked at most once | Admin candidate contacts per dispute ≤ 1 |
| Workatent | Platform share protected; neutral | Share of placements first reported by A; deemed confirmations later reopened ≈ 0 |

## 9. Local and global notes

- **Canada (ON, QC):** evidence files hold personal information about the candidate's new job. Collect only for the dispute, keep files admin-only, and set retention (PIPEDA, Law 25 ⚖️, Q-4). Notices, deadlines and admin resolutions in French for Québec orgs (Bill 96, N1 C-5). Ontario licensing (RD-010) doesn't change the flow. Provincial limitation periods (generally 2 years in Ontario, 3 in Québec ⚖️) are separate from our 6-month filing limit, which is a platform rule only.
- **US:** at-will employment means fast starts and fast fall-offs, so the guarantee matters more. Contractor (1099 / corp-to-corp) conversions are a common backdoor (RD-055). Non-competes don't bind the candidate's choice. Our rules allocate fees between agencies, they never stop a hire (C-6 language rule).
- **UK:** introduction-fee periods of 6–12 months are standard (§1.1). Notice periods of 1–3 months make offer acceptance the right timing event. Contractor engagements raise IR35 questions for the client, not for our split. ⚖️ Conduct Regulations 2003 if we ever cover temp-to-perm (not now).
- **Brazil (later):** PJ instead of CLT is a common way to "not hire" **[experience-based]**, so RD-055 matters. LGPD for evidence. The invoice (*nota fiscal*) timing affects the invoice clock. pt-BR copy.
- **Global / EOR:** an EOR, PEO or payroll provider hiring for the client is the client's hire (RD-055 ⚖️ "client and agents" wording).

## 10. Decisions in this document

| RD | Topic | Status |
|---|---|---|
| RD-050 | Two paths, one referral; no evidence-free inquiry; terminology | decided |
| RD-051 | Hiring side records from any counting referral; 5-business-day duty; deemed agreement; invoice clock | decided (⚖️ basis, Q-1) |
| RD-052 | Coverage test: in progress, inside the window, 3-month re-engagement tail | decided (wording ⚖️) |
| RD-053 | Contest evidence, rebuttal, admin target, deemed-confirmation conditions, fee-details clock → ladder (replaces RD-030's pause Should) | decided |
| RD-054 | Competing reports, released referrals, ownership line, declined/rejected release in N3 | decided |
| RD-055 | What counts as a hire (affiliate, contractor/PJ, EOR, another agency) | decided in-platform; wording ⚖️ |
| RD-056 | Platform share on hires surfaced by A's report: same rate, no surcharge | **needs user decision** (pricing) |

## 11. Open questions for the user (not decided here)

- **Q-1 ⚖️** Is a split owed, and enforceable, when B never accepted the referral? The product creates a deemed agreement from the frozen snapshot, relying on Network Rules acceptance (N10) and rules 6.1/6.3. Counsel should confirm. If counsel says no, N3 keeps A's report path but limits "deemed agreement" placements to referrals B accepted, and N10 acceptance becomes a hard prerequisite.
- **Q-2 ⚖️** The 6-month filing tail after the window (+3 with the re-engagement tail): acceptable next to provincial limitation periods, and worded as a platform rule only?
- **Q-3 ⚖️** "Client and its affiliates, agents, EORs and payroll providers" and non-permanent engagements (contractor, PJ) counting as a hire: wording, and fit with members' client contracts.
- **Q-4 ⚖️** Admin contact with the candidate to verify a hire, and evidence files about the candidate's new employer: purpose, consent-text coverage (Law 25 / PIPEDA) and retention. Proposed: files kept until the dispute closes + 2 years, then deleted (PIA N7).
- **Q-5 (pricing, RD-056)** Should Workatent's platform share on a hire surfaced by A's report (backdoor) be the normal rate on the fee collected (recommended), or carry a surcharge on the hiring side? Recommendation: normal rate, no surcharge. That keeps us neutral (PD-049 spirit), and sanctions run through the ladder, not through money.

## 12. Next steps for the PM

1. Write the N3 brief from §4 and §7. Price the estimate with the money-bounds line and fix-loop buffer (PD-059). Deemed agreements, fee-pending placements and dispute types are the money surface.
2. Sequence the prerequisites: S2 client-name gate, O-1, N7 notification emails (deemed confirmation can't run without them, so it ships behind the email check, and silence goes to the admin queue until then).
3. Ask the user Q-5 at the brief checkpoint. Add Q-1 to Q-4 to the counsel list (N7). Q-1 decides whether hire-on-non-accepted referrals are a launch gate or wait for counsel.
4. Network Rules text: 6.3 (coverage test and tail), 6.4 (5-business-day record duty, 10-business-day invoice clock), 7.2 (rebuttal and fee-details clocks) → ux-writer, en/fr-CA/pt-BR, ⚖️.
