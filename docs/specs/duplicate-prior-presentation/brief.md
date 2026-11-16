# Brief: Duplicate and prior-presentation protection

Owner: Product Manager · Date: 2026-11-13 (rev. 4.2, QA round 1 decisions; rev. 4.1 2026-11-12) · Roadmap item: **N1** ([`roadmap.md`](../../product/roadmap.md)) · Status: **accepted 2026-11-15** ([`acceptance.md`](./acceptance.md), PD-034)
Slug: `duplicate-prior-presentation`
Decision trail: PD-002, PD-003, PD-009, PD-011, PD-012, PD-013 (+ addendum), PD-014, PD-015, PD-016 to PD-033 ([`decisions.md`](../../product/decisions.md)); RD-003, RD-004, RD-013 to RD-021 ([strategy decisions](../../strategy/decisions.md)); recruiting input: [`recruiting-input.md`](./recruiting-input.md) (§10 for RD-019 to RD-021); backend estimate: [`backend-estimate.md`](./backend-estimate.md); QA: [`qa-report.md`](./qa-report.md).

**What changed in rev. 4.2 (QA round 1, verdict FAIL):** B-1 and m-1 to m-5 are backend fixes with no rule change. The decisions below cover the spec conflicts and gaps QA found:
- **B-2 → PD-029.** Referral evidence (BR-26) is judged **at the claimed referral's delivery**: window and release are evaluated as of that `delivered_at`. A release made later changes nothing the hiring side can read, including the picker and the filing result. A release before that delivery makes the referral ineligible. BR-25/AC-68 name this as the one accepted residual (R-18). Rewritten: BR-26, BR-25 (last sentence).
- **B-3 → PD-030.** N1 emails move to a notification-email follow-up, a launch gate in N7 (one pipeline for all kinds, built with PD-026). In-app is N1's channel, and the claim-filed email is required before launch. Rewritten: Must 10, BR-20 (note).
- **m-8 → PD-031.** A client-scope stop that lets an org's own earlier submitter infer a shared confidential client is accepted as residual R-19, with a follow-up question to the strategist.
- **m-9 → PD-032.** Expired candidate requests aren't pending, the sweep purges their fingerprints, and a resend recomputes them. Rewritten: BR-5, BR-21 (note).
- **m-6, m-5 → PD-033.** An indeterminate upload indicator is enough (AC-65). The support reference becomes a random opaque token (amends PD-025).
- **Spec ACs changed:** AC-5 (reference), AC-17, AC-31, AC-57, AC-65, AC-68; **new** AC-76. See §9 "Rev. 4.2 deltas". New QA scenarios 47–49; scenario 17 rewritten.

**What changed in rev. 4.1 (spec questions, mid-build):** All ten of the designer's questions (spec §9, Q-D1 to Q-D10) are decided, and every default is kept. Additions and narrowings:
- **Q-D1:** Admins get a dispute-scoped, audited "same person" signal (match / no match / not available per channel, no values). Admin evidence download is limited to claims with a dispute. `security-and-privacy.md` must record both exceptions (PD-024).
- **Q-D2:** The support mailto comes from one env var, with an opaque reference on every stop and no prefilled body. The address is `Needs user decision` (PD-025).
- **Q-D6:** In-app notifications stay English for N1. Localising all notification kinds becomes a launch-gate follow-up in roadmap N7 (PD-026).
- **Q-D8:** Closure notifications fall back to the org's owners and admins when the submitter is no longer active (PD-028).
- **Q-D9:** Revoked referrals also qualify as referral evidence (PD-028).
- **Q-D10:** The footer is unchanged in N1, and N3 must revisit it (PD-027, R-17).
- **Glossary:** the "claim" conflict goes to ux-writer (PD-028).

No BR is rewritten. BR-15 and BR-18 are narrowed by PD-024 (see the notes on them). See §8 "Answered by the PM after the spec" and the §9 rev. 4.1 deltas.

**What changed in rev. 4 (small, mid-build):** Q-7, Q-8, Q-9 closed by RD-019, RD-020, RD-021. **Release from an already withdrawn or cancelled referral moves from Should to Must** with guard conditions and the same two-step confirmation (PD-021, BR-25). Release from `declined` / `rejected` referrals: **Won't this release**, first follow-up (PD-021). Admin-only "earlier referral was internal" attribute: **Should**, capped at ~0.25 day, closed storage only; internal-routing flag: **Won't** (PD-022, BR-31). Job-form helper gets the strategist's "what you lose without a name" angle (BR-32, ux-writer). "Real client name required on referral-open jobs" added to the roadmap as an N3 prerequisite (PD-023). Rewritten: BR-25, BR-31, BR-32. New QA scenarios 42–46. No other BR changes.

**What changed in rev. 3:** Backend estimated the client key at ~1.5 days, so the **full scope ships; no fallback** (PD-013 addendum, PD-016). The backend's contract changes are now constraints (§7.1): submit RPCs return outcomes, `delivered_at` replaces `submitted_at` as the delivery test, advisory lock per hiring org, evidence SHA-256 computed by the worker, `architecture.md` update. Fingerprint key in **Supabase Vault, hashing only in the database** (PD-018; replaces "HMAC secret in env only"). Client name stays optional, explained as internal-only (PD-017, new BR-32). Holiday substitutes confirmed (PD-019, appendix A). Internal referrals, backfills, key rotation, confidential flag and release visibility decided (PD-020, new BR-31, BR-33, BR-34). Rewritten: BR-1, BR-3, BR-4, BR-6, BR-7, BR-8, BR-12, BR-15, BR-17, BR-23, BR-25, BR-26, BR-28. Q-7 still open (not settled by RD-015). New strategist questions Q-8, Q-9 (non-blocking).

**What changed in rev. 2:** Q-1 to Q-6 answered by the strategist (RD-013 to RD-018). Rewritten: BR-3, BR-4, BR-6, BR-9, BR-10, BR-12, BR-15, BR-16, BR-17, BR-18 (plus smaller edits to BR-8, BR-14, BR-19, BR-20, BR-22). New: BR-23 to BR-30 (client key, sticky stop, release, referral evidence, one claim per referral, frozen deadlines, abuse flag, legacy declines). O-1 still needs the user.

## 1. Problem

Three gaps, verified in the code on 2026-11-12:

1. **Double submissions across agencies.** `app.assert_referable` blocks only "one live referral per candidate *record* × job". The same person held by two orgs (or twice in one org) is two records, so both can be submitted to the same job, or to another of the hiring org's jobs for the same client. The hiring recruiter finds out by recognising a name in two shared profiles, and the client may already have the CV.
2. **Evidence-free `duplicate` declines.** `review_referral` and `decline_referrals` accept `duplicate` as a decline reason with no evidence, no time limit and nothing shown to the sourcing recruiter. "We already had them" is the classic backdoor move, and today it costs nothing.
3. **No dispute without a placement.** `open_dispute` takes a placement id. A sourcing recruiter who thinks a duplicate decline is false has no in-product path.

Split networks call "who presented first" the #1 source of fee fights (product-assessment §3.1–§3.2, §3.9; market-and-positioning §2.2 on NPA "procuring cause" and Top Echelon "but for"). The three real conflicts are described in [`recruiting-input.md`](./recruiting-input.md) §1.1.

## 2. Users and roles

| Role | Need |
|---|---|
| **Sourcing recruiter** (org A member; P1 Isabelle, P2 Marc) | Know *before* contacting the candidate that someone already presented them to this hiring partner for this job or client. Be protected from a false "we already had them". Keep first position when the process stalls or the candidate pulls out. |
| **Hiring recruiter** (org B member; P3 Priya) | Not receive the same person twice. Be able to say "we already had this candidate for this client" in a legitimate, fast (under 2 minutes), evidenced way. |
| **Platform admin** | Resolve contested prior-presentation claims from a queue, with the evidence. See orgs whose stop or rejected-claim pattern looks abusive. |
| **Candidate** (non-user) | Contacted once per job/client. Their confirmation decides between racing recruiters. |

## 3. Evidence

- **RD-004** (decided): first confirmed presentation wins; privacy-preserving duplicate check at submission; prior-presentation claim within 5 business days with dated evidence; no evidence-free `duplicate` decline; contested claims go to a referral-level dispute.
- **RD-003** (decided): "presented" = delivered to the job owner after candidate confirmation or recorded authorization; ownership is "same end client, any role"; an unanswered referral still counts as presented.
- **RD-013** scope: same job + same hiring org × normalised client key, never across hiring orgs. **RD-014** stop, required identifier, sticky stop. **RD-015** withdrawn/cancelled keep first position, explicit release. **RD-016** no evidence file for the sourcing side, referral-as-evidence, attestation. **RD-017** contest window, one claim, outcomes, rejected-claim flag. **RD-018** business-day calendar.
- [`recruiting-input.md`](./recruiting-input.md): market practice (§1), abuse cases A-1 to A-11 (§3), Canada/Québec specifics (§6), O-1 recommendation (§7), revisit signals (§9).
- `docs/strategy/product-assessment.md` §3.1, §3.2, §3.9; `docs/strategy/recommendations-for-pm.md` item #1.

## 4. Goal and success metrics

**Goal:** make "first confirmed presentation wins" true in the product, so duplicate fights become rare and a duplicate decline always carries evidence.

| Type | Metric | Target | How we measure |
|---|---|---|---|
| Leading | Fingerprint hits per 100 submission attempts, split by hit scope (job / client) | Baseline. Revisit if client-level hits > 30% of hits with complaints (RD-013) | Audit event on each hit (PII-free: job id, hit scope, outcome stop/warn; no identifiers, no other referral id) |
| Leading | Share of jobs open to external referrals that have a client key (BR-32) | Baseline; if < 50% after the founding cohort's first 4 weeks, revisit making the internal client name required (PD-017) | Count of `job_client_keys` rows ÷ referral-open jobs (admin metrics) |
| Leading | Submission drop-off at the identifier requirement (BR-10) | Baseline; revisit if noticeable (RD-014) | Submission attempts rejected for "no identifier" vs completed |
| Leading | Wrong-stop support tickets per 200 stops | ≤ 1 (RD-014) | Support tag `wrong-stop` ÷ stop audit events |
| Leading | Prior-presentation claims per 100 delivered referrals | Baseline; investigate any org above 3× the network rate | Claims table |
| Leading | % of duplicate-type declines with evidence | 100% (by construction) | Claims table vs declines |
| Leading | Contest rate (contested ÷ claims) | Watch; < 5% combined with sourcing-org churn after claims = trust problem (RD-016) | Claims vs referral disputes |
| Leading | Release usage (releases ÷ withdrawals) | Watch (RD-015) | Release audit events |
| Lagging | Duplicate-related disputes per 100 delivered referrals | < 1 **[estimate, calibrate after 12 weeks]**; above that, pull L3 forward | Referral disputes with type `prior_presentation` |
| Lagging | Contested claims resolved within 5 business days | ≥ 90% | Dispute opened → resolved, counted with the BR-17 helper |
| Lagging | Share of contested claims rejected | < 40%; above that, tighten penalties (RD-017) | Dispute resolutions |
| Lagging | Sourcing orgs that submit again within 30 days after receiving a prior-presentation claim | Watch (trust signal) | Referral submissions by org |

Add the counts and the abuse flags (BR-29) to the platform admin metrics page (`/admin`) so they're visible without SQL (Should, see §5).

## 5. Scope

### Must (this release)
1. **Fingerprint duplicate check** at submission, on both paths (recorded authorization and candidate-confirmed), and again at delivery, scoped to **same job** and **same hiring org + same client key** (BR-3, BR-23). Both scopes ship in this release (PD-016).
2. **Stop** on a hit against a presentation; **warn and allow** on a hit against a pending referral; **one neutral message** that reveals nothing about the other referral or which scope matched (BR-6, BR-7, BR-9).
3. **At least one usable identifier** required for every referral, both paths (BR-10).
4. **Sticky stop**: 30 days, same candidate record × same job or client (BR-24).
5. **Withdrawn and cancelled referrals keep first position**; **explicit, irreversible release** offered in the withdraw dialog **and, under the BR-25 guard conditions, later from a referral that is already `withdrawn` or `cancelled`** (BR-4, BR-25; *rev. 4:* moved from Should, RD-019, PD-021).
6. **Remove `duplicate` as a manual decline reason** (single and bulk). Replace it with a **prior-presentation claim**: prior-process date + evidence (file *or* an earlier MissionHub referral) + attestation, within 5 business days of delivery, one per referral (BR-11 to BR-14, BR-26, BR-27).
7. **Sourcing side sees the claim** (date, prior-process date, evidence type, upload time, SHA-256, note, contest deadline), never the file (BR-15).
8. **Contest → referral-level dispute** in the existing admin disputes queue; upheld / rejected outcomes; uncontested claims become final (BR-16, BR-18).
9. **Business-day helper with the ON ∪ QC holiday table** (seeded 2026–2028 by migration), deadlines frozen when the clock starts (BR-17, BR-28). Shared with N4.
10. Notifications (in-app) and audit events for every step (BR-20). *(rev. 4.2, PD-030)* Emails for these events are **not** in this release. They ship with the notification-email follow-up (launch gate, roadmap N7), and the claim-filed email is required before the founding-group launch.
11. en / fr-CA / pt-BR copy, glossary entry for "prior presentation"; release dialog copy; attestation text (draft pending counsel, see C-1, C-6).
12. **Job form:** the client name field explains that it is internal-only when the job is confidential and **what the hiring org loses without it** (protection across the client's other roles, and citing an earlier MissionHub referral from another job as evidence). It stays **optional** (BR-32, PD-017, RD-020).

**Build branch (RD-013, PD-013 addendum, PD-016): full scope.** The day-1 estimate put the client key at ~1.5 engineering days (under the ~2-day limit), so this release ships both the job scope and the client scope. The fallback and its follow-up are not used. Deferring would also have broken the delivery-time snapshot (PD-014) for every referral delivered in between.

### Should (this release if it fits, otherwise first follow-up)
- **Admin abuse flags** (BR-29): org with > 5 stops in 7 days, or 2 rejected claims in 90 days. An admin-metrics line is enough in v1.
- Admin metrics card for the §4 metrics.
- Normalise email plus-aliases (`name+tag@`) before hashing.
- ~~Release from an already withdrawn or cancelled referral~~ *rev. 4:* moved to Must 5 (RD-019, PD-021).
- *(rev. 4, RD-021, PD-022)* **Admin-only "earlier referral was internal" attribute** on each fingerprint hit (BR-31). Only if it fits in ~0.25 day; otherwise it moves to the follow-up with BR-29.
- In the admin resolution form, show each org's preferred language as a hint (Québec orgs get French or bilingual resolutions; operational rule, counsel to confirm, C-5).

### Won't (this release)
- Duplicate check **across hiring orgs** (RD-013: never, not just later).
- Fuzzy matching (names, different emails/phones): Later (L3, PD-010).
- Checking against the hiring org's own candidate database or ATS: that's what the evidenced claim is for, and it would leak the hiring org's pipeline.
- Revealing the first submitter, the client name or the hit scope to anyone except platform admins resolving a dispute.
- Evidence file access for the sourcing side, redacted sharing, admin evidence summaries, `.eml` evidence, automatic file-metadata extraction: Later (RD-016).
- Admin UI to edit the holiday calendar: changes go through a migration until there's a need (PD-014). Holidays are seeded 2026–2028.
- Per-province calendars, year-end slowdown rule: Later (RD-018).
- Per-org client entity, "consider for another job" action: Later (RD-013).
- "Ask admins to verify the first presentation's authorization" for stopped submitters, consent-level tiebreak: Later (A-3).
- Claim retraction by the hiring side during a dispute: Later.
- Reminder before the contest deadline: N4 (reminders); the deadline is shown on the claim panel.
- *(rev. 4, PD-021)* **Release from `declined` or `rejected` referrals** (RD-019 extension): first follow-up, not this release. They keep first position meanwhile (BR-4); the sourcing side can ask support.
- *(rev. 4, PD-022)* **Internal-routing flag** (internal referrals cause > half of a hiring org's stops against outside partners, ≥ 5 in 30 days, RD-021): follow-up with the BR-29 abuse flags, reading the attribute above if it shipped.
- *(rev. 4, PD-023)* **Requiring a real client name on referral-open jobs**: N3 prerequisite (RD-020), tracked on the roadmap; pulled forward if coverage < 50% after 4 weeks.
- Ownership-window enforcement, sourcing-side hire reports, claims on declined/released referrals, blocking release once a hire is reported on the referral's client (RD-019): N3. N1 only sets the flags N3 reads (BR-18, BR-25).
- Changing ownership dates: no change (PD-009). Look-back aligned to each job's declared window: after N2.
- Response SLA and auto-release: N4. N1 only records the fresh review-clock start after a rejected claim (BR-18).

## 6. Business rules

**Fingerprint**
- **BR-1** At submission the system computes a fingerprint set for the candidate from up to three identifiers: normalised email (trimmed, lowercased), normalised phone (E.164, using the candidate's country when no prefix is given; skipped if it can't be normalised), normalised LinkedIn profile (`linkedin.com/in/<slug>`, lowercased, no protocol, `www`, query or trailing slash). Each identifier is stored as a **keyed hash** (HMAC-SHA256 with a secret held in Supabase Vault), never in clear and never as a plain unsalted hash. *(rev. 3, PD-018)* Normalising and hashing happen **only inside the database**, in `SECURITY DEFINER` functions, from the stored candidate row (or the row as edited on the confirmation page). No RPC accepts hashes or normalised identifiers from the caller, so a direct PostgREST call can't skip or forge the check.
- **BR-2** Fingerprints are stored per referral in a table with **no grants** to `anon` or `authenticated` and no RLS read policy. Only `SECURITY DEFINER` functions read them. They're never returned to any client, log or audit metadata.
- **BR-3** *(rewritten, RD-013)* A **hit** is any one identifier hash equal to one on another referral that **counts** (BR-4) or is **pending** (BR-5), where the other referral is either (a) **for the same job**, or (b) **for a job of the same hiring org with the same client key** (BR-23). The other referral can come from any sourcing org, including the submitter's own. **Never across hiring orgs**: a referral to org C's job never produces a hit for org B's job, whatever the client name. A job without a client key is checked at job scope only. Both (a) and (b) ship in this release (PD-016).

**Which earlier referral counts**
- **BR-4** *(rewritten, RD-003, RD-015)* An earlier referral **counts as a presentation** when it has been delivered (*rev. 3:* `delivered_at` set; **not** `submitted_at`, which is set at insert even for referrals still awaiting the candidate, PD-016) and is inside its ownership window (`ownership_protected_until` > now), **whatever its current status**, including `submitted`, `under_review`, `info_requested`, `accepted`, `interviewing`, `offer`, `hired`, `rejected`, `declined` (any reason, including legacy `duplicate`, BR-30), **`withdrawn` and `cancelled`**. It **stops counting** only when:
  1. the sourcing side **released** the candidate (BR-25);
  2. a prior-presentation claim against it was **upheld**, or became **final** uncontested (BR-18);
  3. it was **closed as already presented** (BR-8; it never counted).
- **BR-5** An earlier referral still **awaiting the candidate** is *pending*, not a presentation (RD-004.1: the timestamp is delivery, not the draft). `candidate_declined` is neither pending nor a presentation. *(rev. 4.2, PD-032)* An `awaiting_candidate` referral whose candidate request has **expired** is neither pending nor a presentation either: it can't be delivered, so it warns no one. The maintenance sweep deletes its fingerprints, and its status doesn't change. A **resend** recomputes its fingerprints in the database from the candidate's current identifiers, and it's pending again from then. Resend runs no stop check, and the delivery re-check (BR-8) decides.

**At submission**
- **BR-6** *(confirmed, RD-014)* If a hit matches a **presentation** (BR-4): the submission is **stopped** before any email goes to the candidate and before any referral is created. The submitter sees the neutral message (BR-9) and a way to contact support if they think it's wrong. No override. The stop creates a sticky-stop record (BR-24) and an audit event. *(rev. 3, PD-016)* A stop, a pending warning and a missing identifier are **returned outcomes** of the submit call (`created` / `stopped` / `pending_warning` / `identifier_required`), not errors, so the sticky-stop record and the audit event persist. The UI shows them as results of the submission, not as a generic error.
- **BR-7** If a hit matches only a **pending** referral (BR-5): the submitter is warned that the candidate may already be in process with this hiring partner and may continue. Whichever referral is delivered first wins (BR-8). *(rev. 3, PD-020)* This is a **two-step submit**: the first call returns `pending_warning` and has no side effect other than the audit event (no referral, no email). The submitter explicitly acknowledges the warning, and the second call is the same submission with the acknowledgement. There is no standalone check endpoint (BR-22). The second call re-runs the full check, so a presentation that appears in between causes a stop.
- **BR-8** **At delivery** (candidate confirmation, or immediately on the recorded-authorization path) the check (BR-3, BR-24) runs again with the identifiers as they are at that moment (the candidate may have edited their phone on the confirmation page). If a presentation now exists, the later referral is **not delivered**: it moves to a closed status `already_presented`, the hiring side never sees it, the sourcing side is told (neutral message), and a sticky-stop record is created (PD-014). The candidate sees a neutral "this application was already sent" state. Two pending referrals racing (R-4, A-8): the first delivered wins, the other closes. *(rev. 3, PD-016)* The check and the delivery are serialised per hiring org (transaction-level advisory lock in both the submission check and delivery), because two candidate records of the same person don't share a row lock. Delivery sets `delivered_at`, `claim_deadline_at` and the client-key snapshot in the same transaction.
- **BR-9** *(rewritten, RD-013)* The stop, warning and closure messages never reveal the other org, recruiter, date, status, count, the client's name, or **whether the match was on this job or another role at the same client**. One message for all cases, identical whether the earlier referral came from the submitter's own org or another. Copy says "already presented", never "can't be hired" or anything implying the candidate may not be hired (C-6).
- **BR-10** *(replaced, RD-014)* Every referral needs **at least one usable identifier** (email, phone that normalises to E.164, or LinkedIn profile URL), on **both** submit paths. Without one, the submission is refused with a message asking for contact details; nothing is sent. (The candidate-confirmed path already needs an email.) Existing record-level dedup still applies.

**Prior-presentation claim (replaces the `duplicate` decline)**
- **BR-11** `duplicate` is removed from the decline reasons accepted by `review_referral` and `decline_referrals`. Existing declines with `duplicate` stay as they are (history is not rewritten) and render with a "legacy" label (see BR-30).
- **BR-12** *(rewritten, RD-016, RD-017)* The hiring side may file **one** prior-presentation claim on a delivered referral **before its `claim_deadline_at`** (5 business days after delivery, BR-17, BR-28), while the referral is `submitted`, `under_review` or `info_requested`. Accepting the referral ends the option (accepting acknowledges the introduction). The clock **does not pause** for `info_requested` (A-6). The claim requires:
  - (a) **evidence**: at least one file (ATS export, email as PDF or image) **or** an earlier MissionHub referral (BR-26);
  - (b) for file evidence, the **date the candidate was last in process with this client**: before the claimed referral's `delivered_at` and no more than 6 months before it. Contacts made after delivery don't qualify (A-5). For referral evidence the date is that referral's `delivered_at`, filled in by the system;
  - (c) an **attestation** checkbox ("true and accurate; false claims can lead to suspension"; final wording by ux-writer, counsel check C-1);
  - (d) an optional note (shown to the sourcing side; the form says so).
  Filing the claim declines the referral with reason `prior_presentation`. While the claim is open, the referral still counts as a presentation.
- **BR-13** After `claim_deadline_at` the claim option disappears and the referral stands (RD-004.3). The hiring side can still decline for any other reason.
- **BR-14** Claims are not available in bulk decline (A-9).
- **BR-15** *(rewritten, RD-016)* Evidence files follow the document pipeline: private bucket separate from candidate documents, Canadian storage like candidate documents, MIME/size allow-list, SHA-256, scan gate, 60-second signed URLs, audited access. **File access: the claiming org and platform admins only.** The sourcing side sees: that a claim was filed, the claim date, the declared prior-process date, the evidence type(s), each file's upload time and SHA-256, the note, and the contest deadline. For referral evidence the sourcing side sees only "earlier referral through MissionHub", never which referral, org or date beyond the prior-process date. SHA-256 and upload time are frozen at upload (a file can't be swapped). *(rev. 3, PD-016)* The SHA-256 is computed by the **worker** (service role) from the stored object, recorded once and immutable afterwards; it is never accepted from the app or the browser. Each uploaded file is therefore **processing** (scan + hash) for a short time before it is ready; the claim can be filed only when every attached file is `clean` and hashed. A file that fails the scan can't be attached and must be removed. The claim deadline is checked when the claim is filed, not at upload.

**Contest and dispute**
- **BR-16** *(rewritten, RD-017)* The sourcing side may **contest** a claim before `contest_deadline_at` (**10 business days after the claim**, BR-17, BR-28). Contesting is free and opens a **referral-level dispute** (type `prior_presentation`) in the admin disputes queue. `disputes` gains a referral reference; placement disputes keep working unchanged. A referral can have at most one open dispute. **No contest by the deadline: the claim becomes final** (same effect as upheld).
- **BR-17** *(rewritten, RD-018, PD-015)* Business days = Monday–Friday in `America/Toronto`, **minus the network holiday table** (union of Ontario and Québec statutory holidays, observed dates, seeded 2026–2028: New Year's Day, Family Day, Good Friday, Easter Monday, Victoria Day / National Patriots' Day, 24 June, Canada Day, Labour Day, Thanksgiving, Christmas Day, Boxing Day). Not included: Civic Holiday, 30 September, Remembrance Day, 24 and 31 December. **Counting:** the day of the triggering event never counts; the deadline is **23:59:59 ET on the Nth business day after the event's local date** (delivered Friday 18:00 → end of the following Friday; delivered on a weekend or holiday → counting starts the next business day). Deadlines are shown as a date and time with "ET" plus "N business days left". One shared helper; N4 reuses it. No Easter calculation in code. *(rev. 3, PD-019)* "Observed dates" includes weekday **substitutes** when Christmas, Boxing Day or New Year's Day fall on a weekend (2026-12-28, 2027-12-27, 2027-12-28, 2028-01-03). No substitute for 24 June or Canada Day on a Saturday (2028), because Québec and federal practice move only a Sunday. Full seed in appendix A.
- **BR-18** *(rewritten, RD-017)* The platform admin resolves with a written resolution:
  - **Upheld** (claim valid): the decline stands; the referral **stops counting** as a presentation and is flagged `prior_presentation_upheld` so N3 treats it as no ownership. Ownership date unchanged (PD-009). A claim that becomes **final uncontested** has the same effect.
  - **Rejected** (claim invalid): the referral returns to `submitted`, flagged "claim rejected", with a **fresh review clock** (N1 stores the clock start; N4 enforces the 5-business-day SLA). The hiring side may accept or decline for another reason, **but can't claim again** (BR-27). The referral counted as a presentation throughout; ownership date unchanged. The sourcing side is notified and may withdraw (keeping first position, BR-4).
  - Admins can see the first-submitter information and both referrals (for referral evidence) needed to decide; nothing else changes visibility. *(rev. 4.1, PD-024)* "Both referrals" means metadata only: no candidate name or label, no profile. For referral evidence, the admin also gets the "same person" signal (email / phone / LinkedIn: match / no match / not available) from an admin-only, audited RPC. Admin evidence-file download (BR-15) applies only to claims that have a dispute. A claim found fabricated is handled as a network-rules breach under RD-002 (admin action outside this flow; suspension possible).
- **BR-19** Disputes rate limit (5/h) covers contests; claims get their own bucket (10/h per user); release has no separate limit (it's a withdraw option).

**Client key, sticky stop, release, referral evidence** *(new)*
- **BR-23** *(RD-013)* Each job gets a **client key**, computed server-side on job save (and backfilled for existing jobs), never returned to any client: lowercase, trim, strip accents, collapse whitespace, drop punctuation; strip trailing legal forms (inc, incorporated, ltd, limited, ltée/ltee, corp, corporation, co, llc, llp, lp, senc/s.e.n.c., enr, sa, sas, gmbh, plc); **placeholders mean no client key**: confidential, confidentiel/confidentielle, confidencial, undisclosed, stealth, client, n/a, na, tbd, "-", empty. The key used for an earlier referral is the one **stored on the referral at delivery**, so a later edit of the job's client name doesn't move existing referrals in or out of scope (PD-014). *(rev. 3, PD-016, PD-020)* The key is computed by a **database trigger** on every job write (UI, connectors, `/api/v1/jobs`), whatever `client_confidential` says (that flag only controls display to partners). It is stored only in closed tables, never on `jobs` or `referrals`. While a referral is pending, the job's current key is used; at delivery it is snapshotted. Referrals delivered **before N1** get their snapshot backfilled from the job's client name at migration time (PD-014 can't apply retroactively).
- **BR-24** *(RD-014)* **Sticky stop:** once a candidate record has been stopped (BR-6) or closed as already presented (BR-8) for a job, any submission of **that candidate record** to the same job, or to a job of the same hiring org with the same client key, is stopped for **30 days** from the stop, even if its identifiers were edited and even if the earlier presentation stops counting in the meantime. Same neutral message; audited as `sticky_stop`. Sticky-stop records hold ids and the client key only (no identifiers) and are purged after 30 days.
- **BR-25** *(RD-015)* **Release:** the withdraw dialog offers a separate, unticked, irreversible option: "Release this candidate for this client: another partner may present them and this referral earns nothing" (final words by ux-writer). Same roles that may withdraw. Confirming requires an explicit second step. A released referral stops counting (BR-4) and is flagged `released` so N3 treats it as no ownership. Release is audited; no notification to the hiring side beyond the withdrawal itself. *(rev. 3, PD-020)* **The release flag is visible to the sourcing side and platform admins only.** The hiring side sees "withdrawn" and nothing more, in the UI and via the API (the flag must not be readable from the hiring side's `referrals` select). N3 reads it server-side. *(rev. 4.2, PD-029)* **One accepted residual (R-18):** a referral released **before** another referral of the same person was delivered to the hiring side isn't eligible as referral evidence against that later referral (BR-26). The hiring side can infer that release from the picker. A release made **after** that delivery changes nothing the hiring side can read through any surface, including the BR-26 picker and the claim filing result.
  - *(rev. 4, RD-019, PD-021)* **Two entry points, one rule.** (1) The withdraw dialog (live referral, as above). (2) **Release later**, on a referral that is already `withdrawn` (by the sourcing side) or `cancelled` (by the hiring side, so the sourcing side never saw a withdraw dialog). Both are **Must**.
  - **Guard conditions (both entry points):** the option is offered only when **all** hold: (a) the referral **was delivered** (`delivered_at` set); (b) it **still counts** (BR-4: inside its ownership window, not already released, no prior-presentation claim against it upheld or final, not closed as already presented); (c) **no dispute is open on it** (a referral-level dispute, or a placement dispute on a placement from it). If any fails, the option is **hidden** (not shown disabled). The release RPC re-checks all three server-side and refuses otherwise; a call from the hiring side or another org gets "not found".
  - **Same as the dialog:** same roles that may withdraw, same irreversible warning wording, same **explicit second confirmation step**, same `released` flag, same audit event, no notification to the hiring side. The hiring side keeps seeing "withdrawn" or "cancelled" and nothing more.
  - **Not in this release:** release from `declined` or `rejected` referrals (RD-019 extension, first follow-up, PD-021); release from live referrals without withdrawing (never, RD-019). Hiring side can never release or request a release.
- **BR-26** *(RD-016; rewritten rev. 4.2, PD-029)* **Referral as evidence:** in the claim form the hiring side may pick, instead of a file, an earlier referral E for the claimed referral C. E qualifies when **all** of these hold:
  1. **its own org received** E, for the same job as C or for a job with the same client key (C's snapshot);
  2. E was **delivered before** C's `delivered_at`;
  3. **at C's `delivered_at`**, E was inside its ownership window (`ownership_protected_until` > C's `delivered_at`) and **not released** (`released_at` null or later than C's `delivered_at`);
  4. **now**, no prior-presentation claim against E has been upheld or become final, and E isn't `already_presented`.

  Revoked and internal referrals qualify on the same terms (PD-028, BR-31). The picker lists exactly the referrals that qualify, and the system re-checks on submit. Every non-qualifying citation gets the same `claim_referral_invalid` result, whatever the reason. A release or window end **after** C's delivery doesn't change the picker, the filing result or the resolution (release gives up only the releaser's own position, RD-019). Admins see both referrals, including the release date. The sourcing side sees "earlier referral through MissionHub" only.
- **BR-27** *(RD-017)* **One claim per referral**, whatever its outcome. After a rejection, the claim option never returns for that referral.
- **BR-28** *(RD-018)* Deadlines are **computed and stored when the clock starts**: `claim_deadline_at` at delivery, `contest_deadline_at` when the claim is filed. Holiday-table edits apply to new deadlines only; a live deadline never moves. Referrals delivered before N1 ships get `delivered_at` backfilled from their shared-profile snapshot time (the snapshot is only written at delivery) and `claim_deadline_at` computed from that `delivered_at` with the same helper; if it's already past, no claim is possible (PD-014, PD-016). Referrals that were never delivered (for example withdrawn while awaiting the candidate) get no `delivered_at` and never count.
- **BR-29** *(Should, RD-017, A-1)* **Admin abuse flags:** an org is flagged on the admin metrics page when it has **> 5 stops in 7 days** (as sourcing side) **[estimate, calibrate]** or **2 rejected claims in 90 days** (as hiring side). Flag only; no automatic action.
- **BR-30** Legacy `duplicate` declines count as presentations like any other decline (BR-4); they can't be claimed or contested retroactively.

**Rev. 3 additions** *(PD-017, PD-018, PD-020)*
- **BR-31** **Internal referrals** (between related orgs that share a member, `referrals.internal = true`) follow the same rules as any other referral: they are checked, they count as presentations, they can be stopped, closed, released and claimed against. RD-003 defines "presented" as delivered to the job owner after confirmation or authorization, and an internal referral meets that definition. The commission rule for internal referrals is unchanged. *(rev. 4)* **Confirmed by RD-021, in both directions:** an internal presentation stops outside partners, and an earlier outside presentation stops an internal referral (this direction closes the split-laundering route through a sister org, so it is not optional). QA scenarios 39 and 44.
  - *(Should, rev. 4, PD-022)* **Admin-only "earlier referral was internal" attribute:** on each fingerprint hit, record a boolean saying whether the matched earlier referral was internal. It must live **only in a closed, admin-readable place**: **not** in `audit_events.metadata`, because org admins and recruiter managers can read their org's audit events (policy `audit_select`), and the submitter must never learn it (BR-9). If no admin-only hit store exists and creating one costs more than ~0.25 day, drop it to the follow-up. The **flag** computed from it is Won't this release (§5).
- **BR-32** **Client name on jobs stays optional.** It is required only when the job is not confidential (as today). When the job is confidential, the form says the name is internal-only, never shown to partners, and used to catch duplicate submissions across the org's jobs for this client. Jobs from connectors and the API without a name are accepted and get no key. A required field would not force a real name anyway, because placeholders such as "Confidential" give no key (BR-23). Coverage is measured (§4). *(rev. 4, RD-020)* Recording the real end client internally is normal agency practice; it stays **optional in N1** and becomes **required on referral-open jobs before N3** (roadmap, PD-023). **Helper angle for the ux-writer:** give the hiring org its own reason to fill it in. Without a client name it is protected only on this job: it can receive the same person again for the client's other roles, and it can't cite an earlier MissionHub referral from another job as evidence (BR-26). The helper keeps the internal-only statement (never shown to partners; platform admins see it only when resolving a dispute, RD-020) and must not suggest the name is required.
- **BR-33** **Fingerprint key handling** (security constraint, not optional): the key exists only in Supabase Vault. The migration generates it if it is absent (each environment has its own key). The app, the browser, `.env` files and logs never hold it. Only `SECURITY DEFINER` functions in the non-exposed `app` schema read it, and they are revoked from `public`, `anon` and `authenticated`. Rotation (or loss of the key) is done by a service-role-only recompute from the candidates' **current** identifiers, with a `key_version` on every fingerprint. Rotation happens only on suspected compromise. Document it in `backend.md` and `security-and-privacy.md`.
- **BR-34** **Fingerprint backfill:** fingerprints for referrals that exist before N1 (counting and pending only) are computed from the candidates' current identifiers, like a rotation. Identifiers as they were at an old delivery are not recoverable. That is accepted: the usual failure mode is a missed hit; a wrong stop from a changed identifier is the same risk as R-5 and goes through the support path.

**Notifications and audit**
- **BR-20** Notify the sourcing side when a claim is filed (with the contest deadline); notify both sides when a dispute opens and when it's resolved; notify the submitter on a BR-8 closure. The claim window expiring and a claim becoming final uncontested send no notification (the claim panel shows the state). Audit: fingerprint hit (scope and outcome only), submission stopped, sticky stop, submission refused for no identifier, referral closed as already presented, release, claim filed (evidence type), claim final, contest opened, dispute resolved. Audit metadata stays PII-free (no hashes, no identifiers, no client key, no other referral id in events visible to members). *(rev. 4.2, PD-030)* In this release the channel is **in-app only**. Emails for these four events come with the notification-email follow-up (launch gate, roadmap N7), and the claim-filed email is required before the founding-group launch.

**Data protection**
- **BR-21** Fingerprints exist only to enforce first presentation. They are deleted when the referral's ownership window has passed and no dispute is open. Candidate anonymisation deletes the candidate's fingerprints on referrals outside any open dispute; provisional default, **needs user/counsel confirmation** (O-1). Correctness never depends on the purge: the check always applies BR-4 to the referral, whether or not its fingerprints still exist.
  - *Strategist recommendation for O-1 ([`recruiting-input.md`](./recruiting-input.md) §7; user's call ⚖️):* keep fingerprints while the referral counts as a presentation or a dispute on it is open, delete otherwise; on anonymisation delete immediately except on referrals with an open dispute (a sourcing org that anonymises a candidate gives up first position). Keep claim records (dates, evidence type, SHA-256, note, resolution) with the referral's audit history. Delete **evidence files 12 months after the claim becomes final** unless a placement or dispute involving the same candidate and client is open; counsel to check against limitation periods (ON 2 years, QC 3 years).
  - Until O-1 is answered, this release builds the fingerprint purge per BR-21 as written and **no automatic deletion of evidence files**; the evidence purge ships with the O-1 answer, which is needed before the founding-cohort launch (N7 PIA).
  - *(rev. 4.2, PD-032)* The purge also deletes the fingerprints of `awaiting_candidate` referrals whose candidate request has expired (BR-5).
- **BR-22** Probing defence (A-1): the check only runs inside a real submission (active candidate owned by the caller, active job open to referrals, sharing authorization present, at least one identifier), under the existing 30/h submission limit, and every hit is audited. No standalone "check this email" endpoint. Abuse flags per BR-29.

## 7. Constraints

- **Security:** all checks in `SECURITY DEFINER` RPCs that re-check membership and side; new tables (fingerprints, sticky stops, claims, holidays) closed by default; client key never selectable by members; `tests/integration/api-surface.test.ts` must stay green (no new table or RPC exposed beyond the allow-list). *(rev. 3, supersedes "HMAC secret in env only")* Fingerprint key in Supabase Vault, hashing only in the database, no caller-supplied hashes (BR-1, BR-33, PD-018). No env var for the key and no `.env.example` entry for it. QA must show that calling the submit RPCs and `respond_candidate_request` directly through PostgREST with forged or extra arguments can't skip the check.
- **Privacy:** the duplicate check must not reveal another org's pipeline or client (BR-9). Evidence files may contain client, third-party and candidate data: same handling and Canadian storage as candidate documents. Update `docs/security-and-privacy.md` (new pseudonymous data, retention, evidence bucket) and `docs/domain-model.md` (new tables, `already_presented` status, flags, dispute target, client key).
- **i18n:** every string in en, fr-CA, pt-BR via the message files; follow the glossary (sourcing recruiter / hiring recruiter; recommandation / indicação). New glossary entries "prior presentation" and "release (a candidate)" (fr-CA and pt-BR terms set by the ux-writer).
- **Accessibility:** WCAG 2.2 AA. Stop/warning messages and deadlines announced as text (not colour only), deadline shown as a date/time with "ET" plus "N business days left", status icon + text, keyboard path through the claim form, evidence picker, file upload and release confirmation, 375px layout.
- **Copy:** no claim that MissionHub guarantees payment or decides ownership in law; the platform records and applies network rules (copy-audit 9.8 spirit). "Already presented", never "can't be hired" (C-6).

### 7.1 Engineering contract changes accepted as constraints (rev. 3, PD-016)

From [`backend-estimate.md`](./backend-estimate.md) §2, §7. These are part of the scope, not options.

| # | Constraint | Why | Who it affects |
|---|---|---|---|
| EC-1 | `submit_referral` and `submit_referral_for_candidate` **return an outcome** (`created` / `stopped` / `pending_warning` / `identifier_required`) instead of raising on a stop. The pending warning is a two-step submit with an explicit acknowledgement argument. `respond_candidate_request` gets an `already_sent` result. | A raised exception rolls back the sticky-stop row and the audit event that BR-6 requires. | Backend (return types, drop and recreate), frontend (server-action results on both submit paths and match review), design (result states), QA |
| EC-2 | New `referrals.delivered_at`, set only at delivery and backfilled from the shared-profile snapshot. All "delivered" tests (BR-4, BR-12, BR-26, BR-28) use it. | `submitted_at` is set at insert, so a referral withdrawn while awaiting the candidate would wrongly count. | Backend, QA (test "withdrawn while awaiting the candidate doesn't count") |
| EC-3 | Transaction-level **advisory lock per hiring org** in both the submission check and delivery. | Two records of the same person don't share a row lock (A-8, R-4). | Backend, QA (concurrency test: two parallel confirmations) |
| EC-4 | Evidence **SHA-256 computed by the worker** from the stored object, set once, immutable. Claim can be filed only when all files are clean and hashed. | A hash sent from the app could be forged by a direct RPC call. | Backend, worker, design ("processing" state), frontend |
| EC-5 | **`docs/architecture.md` updated** for the new service-role uses: the worker reading and hashing evidence objects, signing evidence URLs, and the maintenance calls (`finalize_due_claims`, purges, key recompute). | Service role is only allowed where `architecture.md` says so. | Backend (docs), QA (review) |
| EC-6 | Client key computed by a database trigger on `jobs` and kept in closed tables only (BR-23). | Covers connector and API writes; a key on `jobs` or `referrals` would leak a confidential client name. | Backend, QA (privacy tests) |
| EC-7 | "Final uncontested" is evaluated lazily in the counting rule and the claim read shape, not only by the worker sweep. | No cron; a stopped worker must not keep a claimed referral counting. | Backend, QA |
| EC-8 | A rejected claim sets the referral back to `submitted` through the admin-only resolve path (outside the transitions table): clears decline fields, writes a status event, bumps `version`. | Keeps stale-version checks in the UI correct. | Backend, frontend, QA |

## 8. Risks and open questions

### Answered by the strategist

| # | Question | Answer | Decision |
|---|---|---|---|
| Q-1 | Same job only, same hiring org + client, or across hiring orgs? | Same job **and** same hiring org + client key; never across hiring orgs. Fallback: same-job first if the client key costs > ~2 days | **Answered**, [RD-013](../../strategy/decisions.md) → BR-3, BR-9, BR-23, PD-013 |
| Q-2 | Stop or warn on a hit against a presentation? | Stop; warn only on pending. Identifier required; sticky stop 30 days | **Answered**, [RD-014](../../strategy/decisions.md) → BR-6, BR-10, BR-24 |
| Q-3 | Do withdrawn/cancelled referrals keep first position? | Yes, until released, claim upheld/final, or closed as already presented | **Answered**, [RD-015](../../strategy/decisions.md) → BR-4, BR-25 |
| Q-4 | May the sourcing side open the evidence file? | No; sees metadata, hash and note. New evidence type: earlier MissionHub referral. Attestation | **Answered**, [RD-016](../../strategy/decisions.md) → BR-12, BR-15, BR-26 |
| Q-5 | Contest window; effect of a rejected claim? | 10 business days; uncontested = final; one claim; rejected → back to `submitted`, fresh review clock | **Answered**, [RD-017](../../strategy/decisions.md) → BR-16, BR-18, BR-27, BR-29 |
| Q-6 | Holidays and time zone? | Mon–Fri ET minus ON ∪ QC statutory holidays; event day excluded; frozen deadlines | **Answered**, [RD-018](../../strategy/decisions.md) → BR-17, BR-28, PD-015 |
| Q-7 | Release from an already withdrawn or cancelled referral? | Yes; "when withdrawing" was where the option appears, not a time limit. Only if delivered, still counts, no open dispute; same two-step confirmation. Declined/rejected: recommended extension, PM's timing | **Answered (rev. 4)**, [RD-019](../../strategy/decisions.md) → BR-25, PD-021 (Must; declined/rejected later) |
| Q-8 | Recording the real end client internally; require it? | Normal practice. Optional in N1; required on referral-open jobs before N3; helper should say what the hiring org loses without it | **Answered (rev. 4)**, [RD-020](../../strategy/decisions.md) → BR-32 unchanged in substance, PD-023 (roadmap) |
| Q-9 | Internal referrals count and can be stopped? | Yes, both directions. Optional admin-only "earlier referral internal" attribute + flag | **Answered (rev. 4)**, [RD-021](../../strategy/decisions.md) → BR-31, PD-022 (attribute Should, flag Won't) |

### Answered by the PM after the backend estimate (rev. 3)

| # | Question ([`backend-estimate.md`](./backend-estimate.md) §8) | Answer | Decision |
|---|---|---|---|
| Branch | Client key in this release or fallback? | Full scope; ~1.5 days < ~2-day limit | PD-013 addendum, PD-016 |
| Q-PM-1 | Require an internal-only client name on referral-open jobs? | No, keep optional; explain it as internal-only; measure coverage. Recruiting-practice part goes to the strategist (Q-8) | PD-017 → BR-32 |
| Q-PM-2 | Where does the HMAC key live? | Vault only, hashing in the database, no caller-supplied hashes, no env var. Security constraint | PD-018 → BR-1, BR-33, §7 |
| Q-PM-3 | Observed-date substitutes in the seed? | Confirmed as proposed | PD-019 → BR-17, appendix A |
| Q-PM-4 | Internal referrals in the check and claims? | Yes, same rules (RD-003 definition); strategist confirmation requested (Q-9) | PD-020 → BR-31 |
| Q-PM-5 | Backfill pre-N1 client-key snapshots from the current job name? | Yes | PD-020 → BR-23 |
| Q-PM-6 | Rotation and backfill recompute from current identifiers? | Yes; rotation only on suspected compromise | PD-020 → BR-33, BR-34 |
| Q-PM-7 | Does `client_confidential` affect the key? | No | PD-020 → BR-23 |
| Q-PM-8 | May the hiring side see the release flag? | No; sourcing side and admins only | PD-020 → BR-25 |
| Q-PM-9 | Pending warning as a two-step submit? | Yes; the designer specifies the screens | PD-020 → BR-7, EC-1 |

### Answered by the PM after the spec (rev. 4.1)

| # | Question | Answer | Where |
|---|---|---|---|
| Q-D1 | What admins see to judge "same person" | (b): metadata + dispute-scoped, audited signal RPC (enums only); no candidate name/label/profile; evidence download only for disputed claims; `security-and-privacy.md` updated | PD-024 → BR-15, BR-18 |
| Q-D2 | Support path for wrong stops | `mailto:` from one env var; subject "Stopped referral {reference}"; reference = ~~first 8 chars of the stop's audit event id~~ *(rev. 4.2, PD-033)* a random opaque token stored on the hit row, on every stop; no prefilled body; line hidden if unset; address `Needs user decision`; launch-checklist item | PD-025 → R-5 |
| Q-D3 | Prior-process date boundary | Strictly before the delivery's ET date; lower bound 6 months before, inclusive | PD-028 → BR-12 |
| Q-D4 | Evidence file types and limits | PDF/PNG/JPEG, ≤ 5 files, 10 MB each; no CSV/XLSX/DOCX | PD-028 → BR-15 |
| Q-D5 | Who sees the contest reason | Admins only; both sides read the resolution | PD-028 → BR-16 |
| Q-D6 | Language of in-app notifications | English-in-SQL for N1, one distinct `kind` per event; emails localised; all-kinds localisation is a launch gate in N7 | PD-026 → BR-20 |
| Q-D7 | Claim-window indicator in the queue | No | PD-028 |
| Q-D8 | Who gets the closure notification | Submitting member; fallback to sourcing org owners + admins if inactive | PD-028 → BR-20 |
| Q-D9 | Claims on revoked referrals | Allowed while status and deadline allow it; revoked-but-counting referrals also qualify as referral evidence | PD-028 → BR-12, BR-26 |
| Q-D10 | Hiring-side footer on released referrals | Unchanged in N1; N3 revisits | PD-027 → R-17 |
| Glossary | "claim" vs the Avoid list for "dispute" | ux-writer settles; must also stay distinct from N3's sourcing-side claims; code identifiers unchanged | PD-028 |

### Still open

| # | Question / risk | Owner | Default until answered | Blocks |
|---|---|---|---|---|
| O-1 | Retention of fingerprints and evidence files; effect of candidate anonymisation (BR-21). Pseudonymous personal data ⚖️. Strategist recommendation next to BR-21. | **user** (+ counsel) · `Needs user decision` | BR-21 as written; no automatic evidence-file deletion | Not design or build. Blocks the evidence purge and founding-cohort launch (N7 PIA) |
| R-1 | Exact-match hashes miss people with different emails/phones. Partly covered by referral evidence (BR-26). | PM | Measure; L3 later | — |
| R-2 | Enumeration (A-1): a recruiter types someone's email into a candidate to learn whether they were presented. Residual leak: "someone presented this person to this hiring partner for this client". Acceptable in a vetted network (RD-002). | eng | BR-22 controls, BR-29 flag; QA tests it | — |
| R-3 | Hiring recruiters stop declining as "duplicate" and pick another reason to avoid the evidence burden, including right after a rejected claim. | PM | Watch the decline-reason mix after launch (also an RD-007 signal) | — |
| R-4 | Candidate-confirmed path: both referrals pending, both confirmations (same person, two links). | design, eng | BR-8: first delivered wins, the second closes | — |
| R-5 | False positives (recycled phone, shared family email) stop a legitimate submission with no override. | PM, eng | Support path in the stop message; admins can see the hit; track wrong-stop tickets (§4) | — |
| R-6 | Loose client keys (common names, leftover placeholders) cause wrong client-level stops; tight ones miss. | eng, PM | BR-23 rules; revisit if client-level hits > 30% with complaints | — |
| R-7 | Identifier requirement adds friction for imported candidates without contact details. | design | Inline prompt to add contact details; track drop-off (§4) | — |
| R-8 | A candidate who wants a different recruiter is stuck until the first one releases. | PM | Industry-normal (RD-015); watch complaints | — |
| R-9 | Stale referrals after a long dispute (candidate moved on). | PM | Sourcing side may withdraw; admins target 5 business days | — |
| R-10 | ~~Client-scope fallback leaves the client's other opening uncaught~~ Closed: fallback not used (PD-016). | — | — | — |
| R-11 | Low client-key coverage: confidential is the default and the name is optional, so client-level hits may stay rare (BR-32). | PM | Internal-only explanation on the job form; coverage metric (§4); revisit at < 50% after 4 weeks | — |
| R-12 | Evidence still processing when the claim deadline passes (upload near the deadline). | design, eng | Processing normally takes seconds; the form shows the deadline next to the upload; the deadline is checked at filing | — |
| R-13 | Phone normalisation in SQL is exact for +1 numbers and approximate for other countries. | eng, QA | Accepted: the failure mode is a missed hit, not a false stop; QA notes it | — |
| R-14 | Migration 3 rewrites the core submit and delivery functions: regression risk on both submit paths. | eng, QA | Split migration 3 for review if useful; journey tests on both paths | — |
| R-15 | *(rev. 4, RD-019)* Hiring side pressures the sourcing side off-platform to release ("release or we stop sending you jobs"). | PM | Irreversible "earns nothing" warning; watch releases followed within 14 days by another org's referral of the same person to the same hiring org | — |
| R-17 | *(rev. 4.1, PD-027)* The hiring side keeps seeing "Ownership protected until {date}." on a released referral, which is no longer true. It may hold back from a candidate who was freed. | PM | Accepted for N1 (no enforcement yet); N3 must make the hiring-side display true without revealing the release | — |
| R-18 | *(rev. 4.2, PD-029)* The hiring side can infer from the BR-26 picker that a withdrawn/cancelled referral, still inside its window, was released **before** another partner's referral of the same person arrived. A release after that arrival is invisible. | PM | Accepted residual. It's inherent: when the fingerprints match, the later referral's existence already implies the release. The PD-020 harm doesn't apply because the later referral holds first position. Recorded in `security-and-privacy.md` | — |
| R-19 | *(rev. 4.2, PD-031)* A sourcing org that presented X to B's J1 and is stopped on B's confidential J2 can infer that J2 has J1's client (and learns it if J1's client was shown). | PM, strategist | Accepted residual for N1, recorded in `security-and-privacy.md`. Strategist follow-up: route own-org client-scope hits to "consider for another job" (RD-013 Later). Revisit on a hiring-org complaint or when own-org hits are > ~20% of client-scope hits | — |
| R-16 | *(rev. 4, RD-021)* Internal CV-bombing: a sister org bulk-submits on the recorded-authorization path to lock outside partners out. | PM, eng | Attestation, RD-002 breach; admin attribute (Should) now, flag in the follow-up; if it fires, require the candidate-confirmed path for internal referrals that count against outside partners (strategist) | — |

### Counsel items ⚖️ (not legal advice; owner: user + counsel, via N7)

| # | Item | Effect on this release |
|---|---|---|
| C-1 | **Network rules** must state: first confirmed presentation wins for the window; **withdrawal doesn't end the introduction, release is the only way to give it up** (RD-015); claims need dated evidence within 5 business days; false or fabricated claims can lead to suspension (RD-002), backing the attestation text. | Attestation and release copy ship as drafts; final wording after counsel |
| C-2 | **Procedural fairness:** whether the network rules must give the contesting party access to the evidence (RD-016). Commercial default: no file access. | Build per BR-15; could change later |
| C-3 | **Fingerprints are personal information** (pseudonymous, re-identifiable by key holder) under PIPEDA and Law 25: stated purpose, minimal retention, safeguards. Candidate-facing authorization text and privacy notice should say contact details are used to check for duplicate submissions (copy-audit 9.6). The N7 PIA lists the fingerprint table and evidence bucket. | ux-writer drafts the consent-text addition; counsel approves before launch |
| C-4 | **Evidence files carry third-party data** (other agencies, client staff, candidate): Canadian storage, audited access, withheld from the sourcing side partly for this reason. | Covered by BR-15 |
| C-5 | **Bill 96 / Charter of the French Language:** the network rules governing claims and disputes are an adhesion contract and must be available in French first; admin resolutions to Québec orgs in French or bilingual. | In-product copy covered by fr-CA; resolution-language hint is Should |
| C-6 | **Competition Act** (no-poach, since 23 June 2023): first-presentation rules allocate fees between agencies, they don't stop a hire. Product copy must say "already presented", never "can't be hired"; counsel confirms the network rules don't read as a no-poach between member agencies. | Copy rule in BR-9 and §7 |
| C-7 | **Evidence retention vs limitation periods** (ON 2 years, QC 3 years) for the O-1 recommendation of 12 months. | Part of O-1 |
| C-8 | *(rev. 4, RD-020)* Network-rules expectation that members record the real end client internally, and whether internal-only storage fits typical client NDA clauses. | None in N1 (field optional); needed before the N3 requirement |

**Nothing in this section blocks design or backend from starting.** Copy that is legal in nature (attestation, release warning, consent-text addition) ships as reviewed drafts and is finalised after counsel, before the founding-cohort launch.

## 9. Team plan

Ordered. Parallel steps are marked ‖. The strategist steps are done (RD-013 to RD-021).

**Rev. 4.2 deltas (QA round 1 fix loop; order: 1 ‖ 2 → 3 → 4 → 5):**
1. **product-designer** (spec only, parallel with backend):
   - **AC-5:** reference = random opaque token, unique per stop (PD-033).
   - **AC-17:** drop "(and an email when email is configured)". Add "No email in N1 (PD-030)".
   - **AC-31:** rewrite per BR-26 rev. 4.2. Split R4 into R4a (released **before** the claimed referral's delivery: not listed, forged citation → `claim_referral_invalid`) and R4b (released **after** it: listed, and the filing succeeds). Add R7: window ended after the claimed referral's delivery but before filing → listed.
   - **AC-57:** add "In-app only in N1. The S10 email column is deferred (PD-030)."
   - **AC-65:** "(with progress)" → "with an in-progress indicator and the text Uploading (a percentage isn't required, PD-033)".
   - **AC-68:** add the R-18 exception sentence.
   - **New AC-76** (BR-5, BR-21, PD-032), worded as in the delta below.
   - S10: mark the email column "deferred, PD-030", keeping the keys. S5 picker: update the eligibility note. Data & permissions table: add R-18 and R-19. BR→AC map: add AC-76 under BR-5 and BR-21.
2. ‖ **backend-engineer:** B-1, m-1 to m-5 (in progress). Plus the PD-029 picker/filing rule, the PD-032 expiry rule, and the `security-and-privacy.md` residuals R-18 and R-19. Integration tests for each.
3. **frontend-engineer:** small. Remove any "email sent" wording tied to these four events if present. Keep the indeterminate upload bar with the "Uploading" text status announced (`aria-live`). No other UI change: the picker renders what the RPC returns.
4. **qa-engineer:** rerun. Flip the B-2 `it.fails` test into a passing test of PD-029, and add scenarios 47–49. Verify that B-1, m-1 to m-5 are fixed and that the AC-17/AC-57/AC-65 amendments hold.
5. **product-designer ‖ ux-writer-marketing** (reviews, step 6), then **product-manager** acceptance.
- **ux-writer-marketing:** no new strings. The `emails.*` keys stay in the message files for the follow-up. Skip, except the review in step 5.

**Rev. 4.1 in-flight deltas** (spec Q-D1 to Q-D10; relay, no new agent step):
- **product-designer:** mark Q-D1 to Q-D10 answered in spec §9 with the PD links. Remove "(Pending Q-D2)" and "(Pending Q-D4)". Make these changes in S8, the data & permissions table and AC-43/AC-44:
  - The "same person" signal: three rows, each match / no match / not available. Referral evidence only. Never values.
  - Admins see no candidate name or label.
  - Admin file download only for claims with a dispute.

  Hide the S1-d support line when no support address is configured, and keep the reference on every stop. The contest form hint says the reason goes to admins only. In AC-17, add the fallback to owners and admins when the submitter is inactive. In AC-27/S2-i and the BR-26 picker, revoked referrals behave like the rest.
- **backend-engineer:** add the admin-only signal RPC (PD-024, allow-list, audit, enums only) and scope admin evidence download to disputed claims. Update `docs/security-and-privacy.md` (Platform admins). Add the support env var to `.env.example` and include the opaque reference in every `stopped` payload. Add the closure-notification fallback, and use one distinct `kind` per new notification event. Keep the file allow-list as is.
- **ux-writer-marketing:** settle the "claim" glossary conflict (PD-028). Write the final support strings, the contest-reason hint and the signal labels in en / fr-CA / pt-BR.
- **qa-engineer:** add tests for the PD-024 RPC: non-admin refused, file-evidence dispute refused, no values or hashes returned, audited. Test that admin download on an undisputed claim is refused, the reference is present on sticky stops, the closure fallback works and a claim on a revoked referral is allowed.

**Rev. 4 in-flight deltas** (relay to agents already working; no new agent step):
- **product-designer:** update `spec.md` S2-g and AC-22 (release later) from Should to Must, with the BR-25 guard conditions (delivered, still counts, no open dispute; hidden otherwise), the **two-step** confirmation instead of the one-step dialog, and "cancelled" shown as-is to the hiring side. Apply the same guards to the withdraw-dialog release option. The internal attribute has no UI in this release (stored, not displayed); note it in the data & permissions table as admin-only. Mark Q-7 to Q-9 closed.
- **backend-engineer:** `release_referral` is Must, not Should; re-check the three guards server-side (also in `withdraw_referral` when `p_release` is true); internal-attribute boolean only in a closed admin-only store, ~0.25-day cap.
- **ux-writer-marketing:** job-form client-name helper with the RD-020 angle (BR-32); release-later entry point and second-step confirmation strings reuse the BR-25 wording.
- **qa-engineer:** scenarios 42–46.

| Step | Agent | Delivers | Depends on |
|---|---|---|---|
| 0 ‖ | **user** | Answer O-1 (retention), or accept BR-21 + the strategist's recommendation. Engage counsel on C-1 to C-8 (via N7). | — (not blocking steps 1–4) |
| 0 | **recruitment-strategist** | ~~Q-7, Q-8, Q-9~~ **Done** (RD-019 to RD-021). | — |
| 1 | **backend-engineer** (day 1) | ~~Estimate the client key~~ **Done** ([`backend-estimate.md`](./backend-estimate.md)): ~1.5 days, full scope (PD-016). | — |
| 1 ‖ | **product-designer** | `spec.md` from the template. Flows and states for: (a) submission stop and pending warning in both submit paths and from the match review screen, incl. the identifier-required state (BR-10) and the support path; (b) BR-8 "already presented" closure for the sourcing side and the candidate page; (c) withdraw dialog with the release option and its confirmation step (BR-25), plus release from a withdrawn/cancelled referral (*rev. 4:* Must, guarded, two-step); (d) hiring-side claim form: file upload **or** earlier-referral picker, prior-process date, attestation, note, deadline in ET with business days left; (e) sourcing-side claim panel (metadata, SHA-256, upload time, contest deadline, final state) + contest; (f) "claim rejected" flag on a referral back in review; (g) admin disputes queue with referral disputes next to placement disputes, both referrals visible for referral evidence, resolution form; (h) admin abuse flags (Should); (i) legacy `duplicate` label. **Rev. 3 additions:** (j) submit outcomes as result states, not errors, and the two-step pending-warning acknowledgement (EC-1, BR-7); (k) evidence file states in the claim form: uploading → processing → ready / rejected by scan, with submit disabled until all files are ready (EC-4, BR-15, R-12); (l) job form client-name helper when confidential (BR-32); (m) release flag visible to the sourcing side and admins only, hiring side sees "withdrawn" (BR-25); (n) internal referrals behave like any other (BR-31, no special UI). Data & permissions table, ACs (AC-#) mapped to BR-#. | — (all BRs final) |
| 2 ‖ | **backend-engineer** | Per [`backend-estimate.md`](./backend-estimate.md) §4–§6 and the §7.1 constraints (EC-1 to EC-8). Migration(s) and `backend.md`: fingerprint table (closed), Vault key + in-database HMAC helper (BR-33, no env var), client key via trigger in closed tables + snapshot at delivery (full scope), `delivered_at` + backfills (BR-28, BR-34), release flag readable by sourcing side and admins only (BR-25), check in `assert_referable` and at delivery (both paths) with BR-4 counting rules, pending-hit handling, identifier requirement, sticky-stop table + purge, `already_presented` status, release on withdraw + flag, decline-reason change, claims table (one per referral, attestation, file or referral evidence, frozen SHA-256/upload time) + evidence bucket + scan gate, contest RPC, `disputes` extended to referrals, admin resolve (upheld/rejected, back to `submitted`, review-clock start), finalisation of uncontested claims at `contest_deadline_at`, holiday table seeded 2026–2028 + business-day helper + stored deadlines + backfill of `claim_deadline_at`, notifications, audit, rate limits, fingerprint purge job (BR-21 as written), abuse-flag query (Should), client-key coverage count for admin metrics, integration tests (incl. api-surface, cross-tenant, forged direct RPC calls, concurrency, normaliser cases), regenerated types, `docs/architecture.md` update for the new service-role uses (EC-5). Apply **locally** with `npm run db:reset` + `npm run db:types`; the hosted project gets `supabase db push` only when the user asks. | Step 1 estimate (scope of client key only); can start data model immediately |
| 3 ‖ | **ux-writer-marketing** | Final strings in spec §5 for en / fr-CA / pt-BR, glossary entries "prior presentation" and "release", message files. The single neutral stop/closure message (BR-9, both scopes, no "can't be hired"), pending warning, identifier-required message, candidate-page "already sent" state, release warning, attestation text, consent-text addition for duplicate checks (C-3). Legal-nature strings marked "draft pending counsel". | Step 1 draft of `spec.md` |
| 4 | **frontend-engineer** | UI per `spec.md` and `frontend.md`: submit-flow stop/warning/identifier states handled as returned outcomes with the two-step acknowledgement (EC-1), evidence processing states (EC-4), job-form client-name helper (BR-32), withdraw dialog with release, claim form with file upload and referral picker, claim panel and contest, "claim rejected" flag, admin queue and resolution changes, abuse flags (Should), removal of `duplicate` from decline UIs (single and bulk), legacy label, loading/empty/error/success states, 375px. | Steps 1 (spec), 2 (RPCs), 3 (keys) |
| 5 | **qa-engineer** | `qa-report.md`: every AC; every BR-# traced; the scenarios listed below; privacy tests (no first-submitter, client or scope leak; no fingerprint, client key or sticky-stop row readable via PostgREST; evidence access by role); cross-tenant; both submit paths. | Step 4 |
| 6 ‖ | **product-designer** → `design-review.md`; **ux-writer-marketing** → `copy-review.md` | Review of the built UI against `spec.md` and the glossary. | Step 4 |
| 7 | **product-manager** | `acceptance.md`, roadmap status update. (No client-scope follow-up: fallback not used.) | Steps 5, 6 |

No agent is skipped: the feature has UI, data, copy and privacy surfaces.

### QA scenarios named by the strategist

From [`recruiting-input.md`](./recruiting-input.md) §2–§3 and RD-013 to RD-018. Each must appear in `qa-report.md`.

**Scope and client key (RD-013)**
1. Same person presented to B's job J1 at client "ABC Inc." → submission to B's job J2 at client "abc" (legal form, case, punctuation differ) is stopped.
2. Two of B's jobs with client "Confidential" / "confidentiel" / "N/A" / empty → no client-level hit between them; job-level still works.
3. Same person presented to org C's job at client "ABC" → submission to org B's job at client "ABC" is **not** stopped (never across hiring orgs).
4. Job-level hit and client-level hit produce byte-identical messages; own-org and other-org earlier referrals produce identical messages.
5. Editing the job's client name after delivery doesn't change whether the earlier referral is in scope (snapshot).

**Stop, identifiers, sticky stop (RD-014)**
6. Submission with no email, no normalisable phone and no LinkedIn is refused on both paths; nothing sent.
7. A-2 evasion: stopped record, identifiers edited (email deleted, phone changed), resubmitted to the same job and to another job at the same client within 30 days → stopped (sticky); after 30 days → normal check.
8. Delivery re-check: candidate edits phone on the confirmation page to match a presentation → closed as already presented, sticky stop created.
9. A-1 fishing: repeated submissions with target emails hit the 30/h limit, every hit audited, > 5 stops in 7 days flags the org (Should); no standalone check endpoint exists.
10. A-8 / R-4 race: two pending referrals, candidate confirms both → first delivered wins, the second closes; hiring side sees one.
11. Pending hit → warning, submission allowed.

**First position (RD-015)**
12. A-7: presentation withdrawn by the sourcing side → a second partner is still stopped; cancelled by the hiring side → still stopped; job cancelled and same role reposted at the same client → still stopped.
13. Withdraw with release → second partner can submit; release is irreversible and audited; withdraw without release keeps first position.
14. `candidate_declined` and `awaiting_candidate` referrals don't stop anyone (pending warning only for the latter).
15. Declined for another reason, rejected, hired, legacy `duplicate` decline → all still count inside the window; outside the window → don't count.

**Claims and evidence (RD-016, RD-017)**
16. Claim with file evidence: prior-process date after `submitted_at` → refused; more than 6 months before → refused (A-4, A-5); attestation unticked → refused.
17. *(rewritten rev. 4.2, PD-029)* Claim with referral evidence: picker lists only B's referrals for the same job or client delivered before the claimed referral, counting **at the claimed referral's delivery** (in window, not released then), with no upheld/final claim now. A referral delivered later, released before the claimed referral's delivery, or upheld can't be picked (also enforced server-side, same error for every reason).
18. Sourcing side sees date, prior-process date, evidence type, upload time, SHA-256, note and contest deadline; can't open or sign a URL for the file via UI or API (A-11); sees "earlier referral through MissionHub" only for referral evidence.
19. A-6: claim allowed in `info_requested`; clock doesn't pause; claim refused after `claim_deadline_at` and after accept.
20. A-9: no claim in bulk decline; second claim on the same referral refused, including after a rejection.
21. Uncontested past `contest_deadline_at` → final; referral stops counting; flagged for N3; a second partner can then submit.
22. Upheld → decline stands, referral stops counting, flagged; ownership date unchanged.
23. Rejected → back to `submitted`, "claim rejected" flag, review-clock start recorded, claim option gone, ownership date unchanged, both sides notified, sourcing side can still withdraw and keeps first position.
24. Two rejected claims in 90 days flag the hiring org (Should).

**Business days (RD-018)**
25. Delivered Friday 18:00 ET → claim deadline 23:59:59 ET the following Friday.
26. Delivered on Saturday, and on a holiday (e.g., 24 June, Boxing Day) → counting starts the next business day.
27. Window spanning Good Friday + Easter Monday, Family Day, and Christmas–Boxing Day → each skipped.
28. Civic Holiday, 30 September, Remembrance Day, 24/31 December → counted as business days.
29. Editing the holiday table after a claim → live `claim_deadline_at` / `contest_deadline_at` unchanged; new deadlines use the edit.
30. DST changeover week → deadline still 23:59:59 local ET.
31. Pre-existing delivered referrals get a backfilled `claim_deadline_at`; past ones show no claim option.

**Copy (C-6)**
32. No stop, closure or candidate-page string says or implies the candidate can't be hired, in any of the three languages.

**Added in rev. 3 (PM, from the backend estimate)**

33. Referral withdrawn while awaiting the candidate (never delivered) → doesn't count and stops no one (EC-2).
34. Two parallel candidate confirmations for two records of the same person → exactly one delivered (EC-3).
35. Direct PostgREST calls to the submit RPCs and `respond_candidate_request` with forged or extra arguments can't skip or alter the check; no RPC accepts hashes; the Vault key and the HMAC helper aren't reachable by `anon` / `authenticated` (BR-1, BR-33).
36. A stop leaves a sticky-stop row and an audit event (outcome returned, not raised); the pending warning's first call creates no referral and sends no email (EC-1, BR-7).
37. Claim can't be filed while a file is processing or scan-rejected; the SHA-256 shown to the sourcing side equals the worker's hash of the stored object (EC-4).
38. Hiring side can't read the release flag through the UI or the API (BR-25).
39. Internal referral as the earlier presentation → an outside partner is stopped (BR-31).
40. Job written by a connector or `/api/v1/jobs` gets a client key; a confidential job with a real client name gets a key; the key is not readable from `jobs`, `referrals` or any exposed RPC (BR-23, EC-6).
41. Holiday substitutes 2026-12-28, 2027-12-27, 2027-12-28 and 2028-01-03 are skipped; 2028-06-26 and 2028-07-03 count as business days (PD-019).

**Added in rev. 4 (RD-019 to RD-021)**

42. Release later: a delivered, still-counting `withdrawn` referral and a delivered, still-counting `cancelled` referral each show **Release candidate** to the sourcing side; confirming takes two explicit steps; afterwards a second partner can submit; the hiring side still sees "withdrawn" / "cancelled" and can't read the flag (BR-25).
43. Release option hidden and the RPC refused (direct call too) when: never delivered; outside the ownership window; already released; claim upheld or final; closed as already presented; a dispute open on it; status `declined` or `rejected`; caller is the hiring side or another org. Same guards apply to the withdraw-dialog option (withdrawing while awaiting the candidate shows no release option).
44. Earlier **outside** presentation → a later **internal** referral of the same person to the same job/client is stopped (RD-021, laundering direction).
45. Internal-attribute (if shipped): recorded on hits against an internal earlier referral; not readable from `audit_events` by org admins/managers, nor by any member via PostgREST; stop message byte-identical to scenario 4.
46. Job-form helper text for confidential jobs shows in en / fr-CA / pt-BR and the field stays optional.

**Added in rev. 4.2 (QA round 1)**

47. QA's B-2 repro (PD-029): A withdraws R1 without releasing; A1's R2 is delivered; B's picker on R2 lists R1; A releases R1. Then B's picker on R2 **still** lists R1, filing a claim citing R1 succeeds, and an admin can uphold it. Variant: R1 released **before** R2's delivery → R1 not listed, forged citation → `claim_referral_invalid` (same code as a referral delivered later).
48. Expired request (PD-032): A's `awaiting_candidate` referral of X to J1 with `expires_at` in the past → A1's submission of X to J1 gets no warning (`created`). After the maintenance sweep, the referral has no fingerprints and its status is unchanged. A resends the link → fingerprints exist again, and a new submission by A2 gets `pending_warning`. If A1's referral was delivered in between, A's later confirmation closes as `already_presented`.
49. Notifications (PD-030): the four N1 events create the in-app notification, and no email send is attempted for them. No N1 copy claims an email was sent.

## 10. Definition of done

- Every AC in `spec.md` (as amended in rev. 4.2, incl. AC-76) passes in `qa-report.md`; every BR-# is traced to at least one test; the 49 scenarios above are covered (45 only if the Should attribute shipped).
- *(rev. 4.2)* `docs/security-and-privacy.md` records residuals R-18 and R-19. The roadmap lists the notification-email follow-up as a launch gate (PD-030).
- No open blocker in `qa-report.md`, `design-review.md` or `copy-review.md`.
- Constraints EC-1 to EC-8 (§7.1) implemented and documented in `backend.md`.
- O-1 answered or the default accepted by the user (needed for launch, not for acceptance of the build); legal-nature strings marked as drafts until counsel signs off (C-1, C-3).
- `docs/domain-model.md`, `docs/security-and-privacy.md`, `docs/product-flows.md` and `docs/architecture.md` updated (no `.env.example` entry for the fingerprint key, BR-33); `api-surface` test green in CI.
- Roadmap N1 status set to `accepted`.

## Appendix A. Holiday seed 2026–2028 (PD-019)

Observed dates on weekdays only (weekend dates never count anyway). Substitutes marked *.

| Holiday | 2026 | 2027 | 2028 |
|---|---|---|---|
| New Year's Day | Thu 01-01 | Fri 01-01 | Mon 01-03* (Jan 1 is Sat) |
| Family Day (ON) | Mon 02-16 | Mon 02-15 | Mon 02-21 |
| Good Friday | Fri 04-03 | Fri 03-26 | Fri 04-14 |
| Easter Monday (QC) | Mon 04-06 | Mon 03-29 | Mon 04-17 |
| Victoria Day / National Patriots' Day | Mon 05-18 | Mon 05-24 | Mon 05-22 |
| Fête nationale (QC) | Wed 06-24 | Thu 06-24 | none (Sat, not moved) |
| Canada Day | Wed 07-01 | Thu 07-01 | none (Sat, not moved) |
| Labour Day | Mon 09-07 | Mon 09-06 | Mon 09-04 |
| Thanksgiving | Mon 10-12 | Mon 10-11 | Mon 10-09 |
| Christmas Day | Fri 12-25 | Mon 12-27* (Sat) | Mon 12-25 |
| Boxing Day (ON) | Mon 12-28* (Sat) | Tue 12-28* (Sun) | Tue 12-26 |

Backend verifies each date against the Ontario ESA and CNESST sources before seeding; any correction is a PM-notified change, applied to new deadlines only (BR-28).
