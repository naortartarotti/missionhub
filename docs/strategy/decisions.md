# Recruiting decisions log

Owner: Recruitment Strategist. One entry per decision. Never rewrite a past entry: supersede it with a new one that links back.
Status values: `decided` · `needs user decision` · `superseded by RD-###`. ⚖️ = needs counsel (not legal advice).
Context for all entries: `market-and-positioning.md`, `product-assessment.md`.

---

## RD-001: Initial ICP, region and niches
- **Date:** 2026-11-12
- **Question:** Who do we win first, where, and in which niches?
- **Decision:** Independent recruiters and boutique agencies (1–15 recruiters) in the **Montréal–Toronto corridor** (Québec and Ontario), focused on **software and data/AI**, **finance and accounting**, and **bilingual FR/EN professional roles**.
- **Rationale:**
  - These buyers feel both pains (orphan candidates, orphan jobs) hardest and already split informally.
  - The owner is both buyer and user, so decisions are fast.
  - Québec rewards MissionHub's fr-CA product and Law 25-grade consent, which no US/UK network offers. Toronto brings job volume.
  - The chosen niches have explicit, structured requirements, which is where deterministic matching works.
- **Rejected:**
  - Mid-size agencies first: ATS lock-in, procurement, internal splits.
  - US first: crowded, Top Echelon and NPA entrenched.
  - Brazil first: LGPD transfers, *nota fiscal*, liquidity starting from zero.
  - Healthcare, trades or executive search: licensing, temp economics, relationship-driven.
  - "All of Canada, all roles": liquidity spread too thin.
- **Risks:** The corridor may be too small for liquidity in three niches at once. Bilingual-role demand may be smaller than assumed.
- **Signal to revisit:** After 12 weeks, any niche with fewer than 50 active partner jobs or under 30% of active candidates with a Strong match gets dropped or replaced. If ≥ 25% of signups come from outside the corridor without being targeted, consider widening.
- **Status:** decided

## RD-002: Curated network at launch
- **Date:** 2026-11-12
- **Question:** Open self-serve network or vetted membership?
- **Decision:** **Curated, by application, for the first 12 months.**
  - **Required to join:** verified business identity (legal name, website, LinkedIn), at least one reference from a recruiter or client, and acceptance of the network rules (ownership, duplicates, SLA, non-solicit).
  - **Licence fields:** Ontario recruiter licence number for orgs working Ontario roles; a Québec licence where applicable ⚖️.
  - **Verified badge:** shown to counterparts.
  - **Joining:** self-serve signup stays open, but jobs and candidates enter the partner network only after approval. Before approval, the org gets single-player features.
- **Rationale:** In split networks, vetting *is* the trust product (NPA requires references and board approval, and Top Echelon screens members). One bad actor early can poison a small network. Ontario prohibits recruiters from knowingly using an unlicensed recruiter, so members need this check anyway.
- **Rejected:**
  - Fully open: fast growth, fragile trust.
  - Invite-only with no application path: too slow and dependent on the founder.
- **Risks:** Friction slows growth. Manual review cost for platform admins.
- **Signal to revisit:** Approval backlog > 5 business days, or < 5% of approved orgs involved in disputes after 6 months. Either means we could loosen.
- **Status:** decided (licence-verification wording ⚖️)

## RD-003: Candidate ownership window
- **Date:** 2026-11-12
- **Question:** How long does a submission protect the sourcing recruiter, and over what scope?
- **Decision:**
  - **Scope.** Once a candidate is presented to a job, a hire of that candidate by the **same end client, in any role**, within the window, earns the split. Presented means delivered to the job owner after candidate confirmation or recorded authorization. A referral left unanswered still counts as presented.
  - **Length.** The window equals the job owner's client-terms window, declared on the job terms card. **Default 6 months, allowed range 6–12 months.**
  - **Existing referrals** keep their current 12-month date (no retroactive change).
  - **What it doesn't cover.** The window doesn't restrict the candidate or other recruiters for *other* clients.
- **Rationale:**
  - The job owner can pay a split only on a fee it can collect from its client. Promising 12 months when the client contract says 6 makes B liable for fees it can't bill, and B will stop opening jobs.
  - 6 months matches common market practice (e.g. BountyJobs' six-month window, agency terms of 6–12 months).
  - The scope (same client, any role) is the industry norm and closes the "we hired them for a different role" loophole.
- **Rejected:**
  - Fixed 12 months, the current default: over-promises to A.
  - Fixed 3 months: too easy to wait out.
  - Ownership tied to the candidate globally: unenforceable, and it violates the candidate's freedom.
- **Risks:** B may declare short client terms to minimise exposure. Mitigated by the 6-month floor. Enforcement still depends on detecting the hire (see RD-004 and the claim flow in the recommendations).
- **Signal to revisit:** Disputes where a hire happened just after the window. > 20% of jobs declaring a window other than 6 months (suggests a different default).
- **Status:** decided as a commercial rule. The collaboration-agreement wording is ⚖️.

## RD-004: Double submissions and prior presentation
- **Date:** 2026-11-12
- **Question:** When two recruiters submit the same person, or the job owner says "we already had them", who gets paid?
- **Decision:**
  1. **First confirmed presentation wins.** For partner referrals, the timestamp is when the referral is delivered to the job owner (`submitted` after candidate confirmation or recorded authorization), not when the draft was created.
  2. **Duplicate check at submission.** A privacy-preserving duplicate check (keyed hash of the normalized email, phone and LinkedIn, scoped to the same job and client) warns the second submitter *before* the candidate is contacted, without revealing who the first submitter was.
  3. **Prior presentation.** If the job owner (or its client) already had the candidate in process for that client within the previous 6 months, B may claim prior presentation, but only **within 5 business days of receiving the referral and with dated evidence** (ATS export, email). A sees the claim and its date.
     - Without a timely claim, the referral stands.
     - A `duplicate` decline without evidence is not allowed.
  4. **Contested claims** go to a platform dispute on the referral, not only on placements.
- **Rationale:** "Who submitted first" fights are the #1 source of split disputes. Rules that need evidence plus a short claim window are how mature networks keep them rare (cf. NPA's "procuring cause", Top Echelon's "but for" test). The candidate's own confirmation timestamp is stronger evidence than anything networks have.
- **Rejected:**
  - Job owner's word decides: invites backdooring.
  - "But for" causation judged case by case with no claim window: slow and subjective.
  - Reveal the first submitter to the second: privacy leak.
- **Risks:** Hash matching misses people with different emails or phones (fuzzy matching later). Evidence uploads add friction for B.
- **Signal to revisit:** Share of disputes about duplicates. Share of `duplicate` declines. Fingerprint hit rate vs manual reports.
- **Status:** decided (evidence handling and dispute procedure ⚖️ in the network rules)

## RD-005: Default split structure
- **Date:** 2026-11-12
- **Question:** Keep 45/45/10? Should it vary by job or referral?
- **Decision:**
  - **Keep 45/45/10 as the single default, applied equally to all partner referrals at launch.**
  - **No per-referral negotiation.**
  - **Next step (later):** a per-job "partner share" set by the job owner on the terms card, within a bounded range. Examples: 40/50 when the job owner runs a retained or exclusive search and does all client work; 50/40 for hard-to-fill roles. The platform fee stays fixed.
  - **Internal referrals** keep their current rule (no sourcing share).
  - The level of the platform fee is a pricing question → RD-008.
- **Rationale:** 50/50 between the two recruiters is the universal norm. 45/45 keeps the recruiter halves equal, so it reads as fair. One default makes the first placements frictionless and the terms easy to explain. Bounded per-job variation fits real exceptions without turning every referral into a negotiation.
- **Rejected:**
  - Free negotiation per referral: haggling, disputes, slower submissions.
  - Platform fee taken only from the job side: hides the cost from A and makes B resist opening jobs.
- **Risks:** Exclusive/retained job owners may refuse to open jobs at 45/45.
- **Signal to revisit:** Decline or "won't open jobs" feedback that cites split terms. Share of jobs kept private by orgs that are otherwise active.
- **Status:** decided

## RD-006: Replacement guarantee handling
- **Date:** 2026-11-12
- **Question:** What happens to the split when a placed candidate leaves within the guarantee?
- **Decision:**
  - **Terms.** The guarantee follows the job owner's client terms, declared on the job terms card *before* submission (default 90 days, matching the current hire-report default) and frozen into the agreement.
  - **On a fall-off within the guarantee, B records one of two outcomes:**
    - **(a) Refund to the client** (full or pro-rata). All three shares reverse pro rata (the ledger already supports `client_refund` reversals), the platform fee included.
    - **(b) Replacement.** Original shares stand, and no new fee is charged on the replacement. The **sourcing partner gets first right to propose a replacement within 10 business days**. If they can't, B fills it, and the original shares still stand. Exception: if B's client terms require a refund because no replacement was found, (a) applies.
  - **No enforcement claims.** MissionHub records the terms and outcome. It doesn't enforce or guarantee them (copy-audit 9.8).
- **Rationale:** It mirrors how splits are usually unwound. Refunds share the pain proportionally, replacements keep the deal whole, and the sourcing partner's first right is a fair chance to protect their share. Showing terms before submission removes the "I didn't know it was a 6-month guarantee" dispute.
- **Rejected:**
  - Holding sourcing payouts until the guarantee ends: slows cash, unusual in splits.
  - The sourcing partner bearing the whole refund: unfair, since the job owner controls the client relationship.
- **Risks:** The replacement-from-B case may feel unfair to B (extra work, no extra fee). Watch it.
- **Signal to revisit:** Fall-off rate. Disputes over replacements. B feedback.
- **Status:** decided (agreement template ⚖️)

## RD-007: Job-owner response SLA and released referrals
- **Date:** 2026-11-12
- **Question:** How do we stop submissions disappearing into a black hole?
- **Decision:**
  - The job owner must act on a delivered referral (accept, decline with reason, or request info) **within 5 business days**.
  - Reminders go out at 2 and 4 business days.
  - After **10 business days** without action the referral is **released**: A is free to submit the candidate elsewhere, and B's response record shows a miss.
  - **Ownership (RD-003) still applies to released referrals.** Ignoring a candidate is not a way around the split.
  - Response metrics feed counterpart-visible reputation: median first response, % answered, % paid on time.
- **Rationale:** Responsiveness is what makes sourcing recruiters keep submitting. Without consequences, job owners treat the network as a free CV feed.
- **Rejected:**
  - No SLA: the black-hole problem.
  - Public leaderboards: gaming, defamation risk.
  - 48-hour SLA: unrealistic for boutiques with client-side delays.
- **Risks:** Job owners declining too fast to protect their metrics. Monitor the decline-reason mix.
- **Signal to revisit:** Median first response > 3 business days, or a released-referral rate > 15%.
- **Status:** decided

## RD-008: Pricing direction
- **Date:** 2026-11-12
- **Question:** How does MissionHub make money at launch?
- **Recommendation:**
  - **Success fee only, no subscription. Keep 10% of the placement fee as the list rate.**
  - **Founding-member rate:** 5% for the first 12 months for the first 50 approved orgs.
  - **Later, test a "Pro" plan for boutiques** (ATS connectors, reporting, private partner circles) with a lower success fee rather than a subscription on top of 10%.
- **Rationale:**
  - Independents won't pay dues before seeing value. Success-only removes the objection.
  - 10% is high next to Top Echelon (about 3% from each recruiter plus dues), but it matches SplitFee UK's reported 45/45/10, and MissionHub offers more (matching, privacy, enforcement).
  - The founding discount buys early liquidity without permanently anchoring a lower price.
- **Rejected:**
  - Subscription plus 10%: double-dipping for small users.
  - Subscription only: no alignment with outcomes, hard sell before liquidity.
  - Charging only the job side: hides the cost from A.
- **Risks:** 10% becomes a reason for off-platform splits once partners have met (disintermediation). Mitigation: ownership protection, ledger and evidence only work on-platform, and the fee feels worth it only if enforcement is real.
- **Signal to revisit:** Split partners who place together on-platform once and then stop while both stay active. Price objections in > 30% of lost deals.
- **Status:** **needs user decision** (pricing and revenue commitment)

## RD-009: Platform fee collection ⚖️
- **Date:** 2026-11-12
- **Question:** How is MissionHub's share actually collected when no funds move through the platform?
- **Recommendation:**
  - **Party to the agreement.** MissionHub becomes a named party to every collaboration agreement.
  - **Own invoice.** MissionHub records its own invoice to the **job-owner org** when the client payment is verified (the moment the share becomes payable), net 15, with sales tax where applicable (GST/HST/QST ⚖️).
  - **Overdue.** An overdue platform invoice (> 30 days) pauses that org's ability to open new jobs to partners or accept new referrals, without touching work already in progress.
  - **Reporting the hire.** The sourcing side may report a hire too (B must confirm or contest), so MissionHub isn't relying on the payer alone.
- **Rationale:** Today the platform fee is a "remittance" recorded by the same party that owes it, with no invoice or due date. That leaves MissionHub's revenue to goodwill.
- **Rejected:**
  - Collecting from both recruiters separately: two invoices, double admin, and A has no cash until B pays A.
  - Bringing back payments now: see `product-assessment.md` §6.
- **Risks:** Contract enforceability and tax registration in each province ⚖️. Friction with job owners.
- **Signal to revisit:** Days from client payment verified to platform fee received. % collected within 45 days.
- **Status:** **needs user decision** (contract structure and legal ⚖️)

## RD-010: Licensing posture ⚖️
- **Date:** 2026-11-12
- **Question:** Does MissionHub need a recruiter licence, and must it verify members' licences?
- **Recommendation:**
  - **Get Ontario counsel's opinion before the founding cohort.** Since 1 July 2024, the Ontario ESA requires a licence for any person who "for a fee" finds or attempts to find employees, permanent roles included and regardless of where the recruiter is located, and it prohibits recruiters from knowingly using unlicensed recruiters. Ask whether a matching platform that takes a per-placement fee falls in scope.
  - **Ask the same of Québec counsel** for CNESST personnel-placement licensing.
  - **Meanwhile:** collect members' licence numbers (RD-002), position MissionHub in the Terms as a software and record-keeping provider rather than a recruiter, and avoid language like "we find you candidates".
- **Rationale:** If MissionHub is in scope, operating unlicensed exposes it and every member who "uses" it. That's existential and irreversible.
- **Rejected:** Ignoring it until scale.
- **Risks:** A licence brings security deposits (Ontario: an irrevocable letter of credit was required initially, since changed for some recruiters), annual renewal and compliance duties.
- **Signal to revisit:** Counsel's opinion. Ministry guidance updates.
- **Status:** **needs user decision** (legal ⚖️)

## RD-011: "Workspace" vs "organization" in marketing (copy-audit §9.1)
- **Date:** 2026-11-12
- **Question:** Keep "workspace" as a marketing exception or use "organization" everywhere?
- **Decision:**
  - **"Organization" stays the only product noun, with no marketing exception.**
  - **Primary CTAs drop the noun:** "Get started" / "Join the network" style. The ux-writer owns the exact words in en, fr-CA and pt-BR.
  - **Onboarding** can describe the org naturally: "your agency, or just you if you're independent".
- **Rationale:**
  - Two words for one thing confuse users once they're inside ("Where's my workspace?").
  - Our ICP thinks in "my agency" / "my desk", not SaaS "workspace". "Organization" is heavy for a solo recruiter, so the answer is to avoid the noun in CTAs, not to add a second term.
  - The route segment `/workspace/` is invisible enough to leave alone.
- **Rejected:** (b) "workspace" as the marketing word, with a documented exception. It splits the glossary and adds a translation burden ×3.
- **Risks:** Minor conversion difference. A/B test later if traffic allows.
- **Signal to revisit:** Support questions about "workspace" vs "organization". CTA conversion.
- **Status:** decided (copy, reversible)

## RD-012: "Free to start" (copy-audit §9.3)
- **Date:** 2026-11-12
- **Question:** Keep the "Free to start" hero note?
- **Recommendation:**
  - **Replace it** with a transparent pricing line in the spirit of: "No subscription · MissionHub earns only when a placement pays out". The ux-writer finalises the wording.
  - **The FAQ and commissions page** state the 10% (or founding rate, per RD-008) plainly.
- **Rationale:**
  - "Free to start" implies a paid tier later and reads as bait to recruiters, who distrust hidden fees.
  - The real model (success fee only) is a selling point and should be stated, not hidden.
  - Transparency is our positioning (terms agreed up front).
- **Rejected:**
  - Keep "Free to start": misleading.
  - Remove all pricing mention: forfeits a strong objection-handler.
- **Risks:** The final wording depends on RD-008. If a subscription tier is introduced later, the line changes.
- **Signal to revisit:** RD-008 outcome.
- **Status:** **needs user decision** (it commits to a public pricing message). Recommended wording above.

## RD-013: Duplicate-check scope (N1 Q-1)
- **Date:** 2026-11-12
- **Question:** Jobs have only a free-text, often confidential client name. Check duplicates on the same job only, on the same hiring org + client, or across hiring orgs?
- **Decision:**
  - Check **same job** and **same hiring org + same normalised client key** in this release. **Never across hiring orgs.**
  - Client key, server-side only: lowercase, no accents or punctuation, trailing legal forms stripped (inc, ltd, ltée, corp, llc…), and **placeholders ("confidential", "confidentiel", "n/a", "tbd", empty…) treated as no client**. A job without a client key is checked at job scope.
  - One neutral message for both hit types, so the submitter can't tell which it was.
  - Build fallback: if the client key costs more than ~2 days, ship same-job first and add the client scope before the founding cohort's first placements.
- **Rationale:** RD-003 ownership is "same client, any role", so a second presentation to another of B's roles at the same client can't earn the split either. Across hiring orgs, each agency's client contract decides, outside our ledger; free-text names would mis-match and a hit would reveal that two agencies work the same client.
- **Rejected:** same job only (misses the client's other opening, the most common real case); across hiring orgs (unreliable, leaky, unenforceable).
- **Risks:** loose client keys (common names) cause wrong stops; tight ones miss. A1's declined referral for J1 blocks others for J2 (consistent with RD-003; "consider for another job" later).
- **Signal to revisit:** client-level hits > 30% of hits with complaints; support tickets about wrong stops.
- **Status:** decided. Detail: `docs/specs/duplicate-prior-presentation/recruiting-input.md`.

## RD-014: Stop vs warn on a duplicate submission (N1 Q-2)
- **Date:** 2026-11-12
- **Question:** On a hit against a delivered presentation, stop the submission or warn and let it through?
- **Decision:**
  - **Stop** on a hit against a presentation. **Warn and allow** only when the earlier referral is still awaiting candidate confirmation (first delivered wins).
  - **At least one identifier (email, phone or LinkedIn) is required for partner referrals** on both submit paths.
  - **Sticky stop:** a candidate record stopped for a job can't be resubmitted to that job or that client for 30 days, even after editing its identifiers.
  - The re-check at delivery stays.
- **Rationale:** the second presentation can't earn the split (RD-004.1); warn-and-allow recreates the fight and spends the candidate's goodwill. Without a required identifier and a sticky stop, deleting the email is a one-click bypass.
- **Rejected:** warn and allow; stop with a submitter override (everyone overrides); identifier optional (bypass).
- **Risks:** false positives (recycled phones, shared emails): support handles them, admins can see the hit. Requiring an identifier adds friction for imported candidates without contact details.
- **Signal to revisit:** wrong-stop support tickets > 1 per 200 stops; submission drop-off at the identifier step.
- **Status:** decided

## RD-015: Withdrawn and cancelled referrals keep first position (N1 Q-3)
- **Date:** 2026-11-12
- **Question:** Does a referral withdrawn by the sourcing side or cancelled by the hiring side keep first position for the rest of its window?
- **Decision:**
  - **Yes**, for the duplicate check now, and as the basis for ownership in N3.
  - It stops counting only if: the sourcing side **explicitly releases** the candidate when withdrawing (separate, irreversible choice); a prior-presentation claim against it is upheld or goes uncontested; or it was closed as "already presented".
  - `awaiting_candidate` and `candidate_declined` are not presentations (unchanged).
- **Rationale:** the timing games run through withdrawal: the job owner and candidate push A to withdraw, then the candidate returns via another partner or directly; or the hiring side cancels and reposts the role. Once a candidate is introduced to a client, the market treats the introduction as made for the window.
- **Rejected:** withdrawn/cancelled don't count (the brief's default: rewards collusion and gives B a reset button via `cancelled`); a grace period after withdrawal (complex, still gameable).
- **Risks:** a candidate who wants a different recruiter is stuck until A releases. Industry-normal.
- **Signal to revisit:** release usage; complaints from candidates or second partners blocked by a withdrawn referral.
- **Status:** decided (network-rules wording ⚖️)

## RD-016: Evidence visibility for the sourcing side (N1 Q-4)
- **Date:** 2026-11-12
- **Question:** May the sourcing side open the prior-presentation evidence file?
- **Decision:**
  - **No file access in v1.** The sourcing side sees: claim filed, claim date, declared prior-process date, evidence type, upload time, SHA-256, B's note and the contest deadline. The file: claiming org and platform admins only.
  - **New evidence type:** an **earlier MissionHub referral** B received for the same job or client (delivered earlier, still counting). The sourcing side sees only "earlier referral through MissionHub".
  - Claim form includes an attestation ("true and accurate; false claims can lead to suspension").
- **Rationale:** evidence often shows the confidential client, other agencies and internal notes. A neutral admin, not the opponent, should weigh it. Contesting is free, so A doesn't need the file to decide. The referral evidence type covers duplicates the fingerprint missed.
- **Rejected:** full file to A (confidentiality, third-party data, defamation risk); nothing shown to A (black box).
- **Risks:** A distrusts claims it can't see. Mitigated by free contest, frozen hash, rejected-claim tracking.
- **Signal to revisit:** low contest rate combined with sourcing-org churn after claims.
- **Status:** decided (procedural-fairness access in the network rules ⚖️)

## RD-017: Contest window and claim outcomes (N1 Q-5)
- **Date:** 2026-11-12
- **Question:** How long can the sourcing side contest a claim, and what happens when a claim is rejected?
- **Decision:**
  - **10 business days from the claim** to contest. Uncontested = final (same as upheld).
  - **One claim per referral.**
  - **Upheld or final:** decline stands; the referral stops counting as a presentation and is flagged so N3 treats it as no ownership. Ownership date unchanged (PD-009).
  - **Rejected:** back to `submitted`, flagged "claim rejected", fresh review clock; B may accept or decline for another reason but not claim again; ownership date unchanged; A may withdraw (keeping first position).
  - Two rejected claims in 90 days flag the hiring org for admin review (Should). A fabricated claim is a network-rules breach (RD-002).
- **Rationale:** 10 business days lets A reach the candidate. Returning to review means a false claim costs B something and gives the candidate the chance the claim took away.
- **Rejected:** stays declined with ownership confirmed (a false claim still kills the candidate's chance, so lying costs nothing); extending the window by the dispute length (not worth it).
- **Risks:** stale referrals after long disputes (candidate moved on). B may decline for another reason right after a rejection; watch the decline-reason mix.
- **Signal to revisit:** > 40% of contested claims rejected; contested claims not resolved within 5 business days.
- **Status:** decided

## RD-018: Business-day calendar (N1 Q-6, PD-011)
- **Date:** 2026-11-12
- **Question:** Do holidays count as business days, and in whose time zone?
- **Decision:**
  - **Time zone:** `America/Toronto`; deadlines shown with "ET".
  - **Business days:** Mon–Fri minus the **union of Ontario and Québec statutory holidays** (New Year's Day, Family Day, Good Friday, Easter Monday, Victoria Day / National Patriots' Day, 24 June, Canada Day, Labour Day, Thanksgiving, Christmas Day, Boxing Day), held in an admin-maintained table seeded for 2026–2028 with observed dates.
  - **Counting:** the event day doesn't count; deadline = 23:59:59 ET on the Nth business day after the event's local date.
  - **Deadlines are computed and stored when the clock starts**; holiday edits affect new deadlines only.
  - Same helper for N4.
- **Rationale:** most members are in ON or QC (RD-001). The union only lengthens a window by a day for the other province and avoids per-org calendars. Stored deadlines never move under a live claim.
- **Rejected:** no holidays (a Christmas-week window becomes 2 real days); per-org provincial calendars (complex, two parties with different clocks); calendar days (contradicts RD-004/RD-007).
- **Risks:** members outside ON/QC get the corridor calendar. Year-end slowdown not covered.
- **Signal to revisit:** claims or contests missed across holiday periods; ≥ 15% of active orgs outside ON/QC.
- **Status:** decided

## RD-019: Release from an already withdrawn or cancelled referral (N1 Q-7)
- **Date:** 2026-11-12
- **Question:** May the sourcing side release a candidate from a referral that is already withdrawn or cancelled, not only in the withdraw dialog?
- **Decision:**
  - **Yes.** "When withdrawing" in RD-015 described where the option first appears. It was not a time limit.
  - **Who:** the sourcing side, with the same roles that may withdraw. The hiring side can never release, and can't ask for a release in the product.
  - **When it's offered:** the referral is `withdrawn` (by the sourcing side) or `cancelled` (by the hiring side); it was delivered (`delivered_at` set); it **still counts** (inside its window, not already released, no claim upheld or final); and **no dispute is open on it**. If any of these fails, the option is hidden.
  - **How:** same wording, the same irreversible two-step confirmation, the same `released` flag and audit event as BR-25. No notification to the hiring side, which still sees only "withdrawn" or "cancelled".
  - **Live referrals** (`submitted` through `offer`) still can't be released without withdrawing. Release ends the sourcing side's claim, so it goes with ending its process.
  - **Extension (recommended, PM decides when it ships):** the same logic fits `declined` (any reason except an open `prior_presentation` claim, legacy `duplicate` included) and `rejected` referrals. They also keep first position (BR-4), and the sourcing side has no other way to free the candidate. No recruiting objection to shipping it now or later.
- **Rationale:**
  - Release only gives up the releasing org's own position. No one else loses anything, so there's no reason to allow it only at one moment.
  - In practice the release request comes **after** the withdrawal: weeks later the candidate says "another agency has a role at that client for me", or the recruiter sees the process is dead. Allowing it only in the dialog would push recruiters to say "no" by default and leave candidates stuck (R-8).
  - Referrals withdrawn or cancelled before N1 ships could otherwise never be released.
  - Cancelled referrals matter most. The sourcing side didn't choose to end the process, so it never saw a withdraw dialog.
- **Rejected:**
  - Release only in the withdraw dialog: an artificial time limit, leaves pre-N1 and cancelled referrals stuck.
  - Release requested by the hiring side, or by the candidate, with the sourcing side approving: brings back the pressure on the sourcing side that RD-015 removed. Off-platform requests are the sourcing org's business.
  - Automatic release after N days withdrawn: rewards waiting it out (the A-7 game).
- **Risks:**
  - The hiring side pressures the sourcing side off-platform to release ("release or we stop sending you jobs"). We can't prevent it. The irreversible "earns nothing" warning makes the cost clear.
  - A release "sold" to a second partner off-platform. It's the releasing org's right; watch for patterns.
  - Release while an N3 hire report or a placement dispute is pending: covered by "no open dispute". N3 must also block release once a hire on that referral's client is reported.
- **Signal to revisit:** releases followed within 14 days by a referral of the same person to the same hiring org from another org, concentrated on a few hiring orgs (suggests pressure); support complaints from sourcing orgs that say they were pushed to release.
- **Status:** decided

## RD-020: Recording the end client on confidential jobs (N1 Q-8)
- **Date:** 2026-11-12
- **Question:** Is it normal and acceptable for agencies to record the real end client on a network platform when it stays internal? Should jobs open to referrals require it?
- **Decision:**
  - **Yes, it's normal practice.** Every agency ATS links a job order to a client company record (for example, Bullhorn's API requires a client corporation to create a job, [StackOne guide](https://hub.stackone.com/connection-guides/ats/bullhorn.md)). "Confidential" in recruiting means "not disclosed to candidates and partners". It doesn't mean "not recorded". Recruiters hesitate because they're not sure they can trust a network platform with the client name, not because recording it is unusual **[experience-based]**. Networks treat sharing client details as a trust question ([NPAworldwide, building trust](https://npaworldwide.com/blog/2025/04/28/building-trust-in-a-recruitment-network/)).
  - **N1: keep it optional** (PD-017 and BR-32 as written). We can't require it until members trust the platform with it, and a required field filled with "Confidential" gives no client key anyway.
  - **Network rules (expectation, not a hard rule yet):** members record the actual end client on jobs open to referrals. It is internal-only, never shown to partners or used in matching displays, and only platform admins see it, when resolving a dispute. ⚖️ wording with C-1.
  - **The job-form helper should give the hiring side its own reason to fill it in.** Without a client name, B is protected only on that job. B won't be protected from receiving the same person for this client's other roles, and can't cite an earlier MissionHub referral from another job as evidence (BR-26). The ux-writer turns this into the helper text.
  - **Required before N3 (ownership enforcement).** For jobs open to external referrals, a real client name (not a placeholder, BR-23) becomes required before N3 ships. Connector and API jobs without one can still be created, but they can't be opened to external referrals until the name is added. **Pull this forward** if coverage is below 50% after the founding cohort's first 4 weeks (PD-017 signal).
- **Rationale:**
  - RD-003 ownership is "same end client, any role". If there's no client identity, a hire into another role at that client can't be linked to the first referral. That's a split-free backdoor for the hiring side, and N3 can't close it. Optional is fine for duplicate protection, but ownership enforcement needs the client recorded.
  - Asking for it in N1, before members have seen the platform keep a confidential name private, would cost adoption. Asking at N3, when members have seen that and placements are at stake, is the norm in split networks (the job owner can't keep a client secret from the network's referee).
- **Rejected:**
  - Required now: friction at the riskiest adoption point, and placeholders get round it.
  - Never required: leaves RD-003's "any role" scope unenforceable and rewards hiring orgs that leave it blank.
  - Showing the client name to partners after acceptance: that's a disclosure decision between the two recruiters, outside this question.
- **Risks:**
  - Some agencies with strict client NDAs refuse to record the name ⚖️ (some client contracts forbid disclosure to third parties, including platforms). At N3 they can keep the job private or open to related orgs only. Counsel should confirm that storing the name with internal-only access fits typical client confidentiality clauses.
  - Junk names ("Client A", "Bank1") that pass the placeholder list. Admins may treat this as a network-rules breach when it shows up in a dispute.
- **Signal to revisit:** client-key coverage on referral-open jobs (brief §4); hiring orgs that leave the name blank and later have a hire reported into another role; support tickets or churn that cite "won't put my client's name in a platform".
- **Status:** decided (network-rules wording and client-NDA fit ⚖️)

## RD-021: Internal referrals and first presentation (N1 Q-9)
- **Date:** 2026-11-12
- **Question:** Do internal referrals (between related orgs that share a member) count as presentations against outside partners, get stopped, and stay open to claims and release, like any other referral?
- **Decision:**
  - **Yes, same rules in both directions** (confirms BR-31). An internal referral that was delivered is a presentation (RD-003). It **stops** outside partners, and it **is stopped** by an earlier outside presentation. It can be closed as already presented, released by the sourcing org, cited as referral evidence by the hiring org (BR-26), and claimed against.
  - **The "is stopped" direction matters most.** Internal referrals pay no sourcing share (RD-005, migration `related_org_referrals`). If they were exempt from the stop, a hiring org could take an outside partner's candidate, have its sister org submit the same person internally, and hire with no split. That's a laundering route, and the stop closes it.
  - **Monitoring (Should, admin-only):** record on the fingerprint-hit audit, in a field **only platform admins** can read, whether the earlier referral was internal. Then admins can see when a hiring org's stops against outside partners mostly come from its own sister org. Flag when internal referrals cause more than half of a hiring org's stops against outside partners, with at least 5 such stops in 30 days **[estimate, calibrate]**. Flag only, no automatic action. The submitter must never see this field (BR-9).
- **Rationale:**
  - When a sister org delivered the candidate, the hiring org really does already have them, just as if it had sourced them itself. An outside partner coming second couldn't earn the split under RD-004.1 anyway. Stopping them saves the candidate a second call.
  - If internal referrals didn't count, B would have to upload a file to prove something MissionHub already knows.
  - Same rules for everyone are what make a published rule last (recruiting-input §1.2).
- **Rejected:**
  - Exclude internal referrals entirely: outside partners double-submit people B already received, and internal referrals become a way to shed the split.
  - Count them as presentations but don't stop them: this is the laundering route above.
  - Count them only on the candidate-confirmed path: it's a sensible tightening if the monitoring flag shows abuse (see Risks), but it's premature now and would treat related orgs worse than any partner.
- **Risks:**
  - **Internal CV-bombing (A-3 variant):** a sister org bulk-submits its database to B's jobs on the recorded-authorization path to lock outside partners out, and it costs B nothing. Same defences as A-3 (attestation, RD-002 breach) plus the admin flag above. If the flag fires repeatedly, require the candidate-confirmed path for internal referrals that would count against outside partners.
  - The shared member can already see the hiring org's received referrals, so the neutral stop message hides less from them. That isn't a leak from the check. It's existing membership visibility.
- **Signal to revisit:** the internal-stop flag above; outside partners complaining that a hiring org's jobs always say "already presented".
- **Status:** decided

## RD-022: Job terms card content (N2)
- **Date:** 2026-11-15
- **Question:** Which terms must a sourcing partner see before submitting, and which are required to open a job to partners?
- **Decision:**
  - **Required to open a job to partner referrals, always visible to partners:** fee basis (% of first-year base · % of first-year total cash, meaning base + target bonus · flat), rate or amount, optional minimum fee (% bases), currency (% bases use the salary currency), search type (contingent exclusive · contingent shared · retained/engaged), a "we hold the fee agreement with the end client" attestation, guarantee length (none/30/60/90/120/180 days from start, default 90) and remedy (replacement only · replacement then pro-rata refund (default) · pro-rata refund · full refund), client payment terms (net days, default 30), ownership window (6–12 months, default 6), and the split shown read-only.
  - `share_fee` can no longer hide terms on referral-open jobs. The money estimate is shown only when `share_salary` is on, because rate + estimate reveals the salary.
  - **Referral-open jobs are permanent only** at launch.
  - Existing referral-open jobs without a complete card are hidden from partners until it's completed.
  - Detail: `docs/specs/job-terms-card/recruiting-input.md` §2.
- **Rationale:** Networks require the fee to be confirmed before submission, and treat the published terms as the default when nothing else was agreed in writing ([NPA minimum fee](https://members.npaworldwide.com/Stories/minimum-fee-field-explained), [NPA retainers](https://members.npaworldwide.com/Stories/sharing-retainers-and-engagement-fees)). Today only an amount is stored: the basis is lost and the guarantee is typed at hire by the party that owes the refund.
- **Rejected:** a free-text terms field (can't be frozen, compared or translated); optional fee visibility (A submits blind); per-job split choice (L2, RD-005); contract and contract-to-hire splits (margin sharing; "not doing").
- **Risks:** card friction for B; "shared" chosen by default to lower expectations; a total-cash basis disputed over what counts as target bonus.
- **Signal to revisit:** time to complete the card; jobs closed to partners after N2 by otherwise active orgs; disputes citing a term the card doesn't cover.
- **Status:** decided

## RD-023: When job terms are frozen (N2)
- **Date:** 2026-11-15
- **Question:** What is frozen into the agreement, and at what moment?
- **Decision:**
  - Card changes create **immutable terms versions**.
  - A referral stores the terms version **and the commission-rule version** in force **when the sourcing side commits**: submission on the recorded path, candidate-request creation on the confirmed path. It also stores the **client key** (internal only).
  - The agreement created at acceptance **copies the referral's snapshot**, never the live job or the current default rule.
  - Ownership date = **delivery + the snapshot's window**. First position stays timed at delivery (RD-004.1).
  - The hire report takes the guarantee and currency from the snapshot, and computes the fee from it (RD-025).
  - Pre-N2 referrals keep 12 months and today's free hire entry, labelled "terms not recorded" (PD-009).
- **Rationale:** A takes the risk when it commits a candidate, not when B accepts, so freezing at acceptance (today) lets B change terms after seeing the candidate. Freezing the client key stops a rename from moving a hire out of "same end client" scope.
- **Rejected:** freeze at acceptance (bait-and-switch window); freeze at delivery on the confirmed path (B could change terms while the candidate is deciding); invent snapshots for legacy referrals (false records).
- **Risks:** A referral submitted under very old terms after many changes. Acceptable: it's the deal A was offered.
- **Signal to revisit:** disputes where B argues it changed terms before receiving the referral.
- **Status:** decided (agreement wording ⚖️)

## RD-024: Terms changes once referrals exist (N2)
- **Date:** 2026-11-15
- **Question:** What happens when the job owner changes terms after partners have submitted?
- **Decision:**
  - New terms apply to **new submissions only**. Every existing referral keeps its snapshot, in any status.
  - Partners with live referrals on the job are notified. Partners browsing see "terms updated on {date}" for 30 days.
  - **Amendments** to an existing referral need **A's explicit acceptance**, a reason, a new agreement version and an audit record. A can refuse. The network rules forbid making acceptance a condition of moving the candidate forward ⚖️.
  - In N2, amendments are recorded by a platform admin on both orgs' written request. An in-product amendment flow comes Later, only if they exceed ~1 per 20 accepted referrals **[estimate]**.
  - Admin flag (Should): fee or guarantee worsened within 30 days after the job received a referral, or more than 2 changes in 30 days.
  - Closing and reposting resets nothing.
- **Rationale:** Published terms in force at submission are the market default (NPA pays on the published fee absent written agreement). Real mid-search client renegotiations exist, so a consent-based amendment beats either rigidity or a unilateral change.
- **Rejected:** apply changes to all live referrals (bait-and-switch); allow only improvements to apply automatically ("better for A" is ambiguous, e.g. a shorter guarantee); per-referral negotiation (PD-010).
- **Risks:** pressure on A to accept amendments (A-11). Admin workload if amendments are common.
- **Signal to revisit:** amendment count per hiring org; disputes citing pressure; the worsening flag firing on > 5% of partner jobs.
- **Status:** decided

## RD-025: Fee basis, hire fee and discounts (N2)
- **Date:** 2026-11-15
- **Question:** How is the fee at hire tied to the card, and what if the hiring side invoices less than the terms?
- **Decision:**
  - (a) At hire, % bases compute **rate × actual first-year base** (plus target bonus on total cash), at least the minimum fee. Flat fees use the frozen amount. The frozen rate applies even if the hire is into a different role at the same client (RD-003).
  - If B records a different invoiced amount, it must give a reason, and A is notified with both numbers and can dispute.
  - **A's share is computed on the frozen terms unless A agreed in writing before the change.**
  - Shortfalls caused by the client not paying, or by a refund the snapshot's guarantee allows, are shared pro rata (paid when paid).
  - Currency: one per snapshot. No conversion by MissionHub. The split applies to the amount actually received when the client pays in another currency.
  - (b) **Platform share when B discounts without consent:** on the fee actually collected, or on the frozen terms? Recommendation: **on the fee actually collected** (MissionHub stays neutral and doesn't profit from a penalty).
- **Rationale:** B's discounting at offer stage, sometimes in exchange for other business, is a classic way the candidate-side partner gets short-changed. NPA requires advance written permission before submitting a partner's candidate below its minimum fee ([NPA](https://members.npaworldwide.com/Stories/minimum-fee-field-explained)).
- **Rejected:** split always on what B invoiced (A bears B's commercial concessions); B pays A on frozen terms even when the client never paid (B can't pay from money it didn't collect; that's not market practice).
- **Risks:** the ledger allocates from client payments today. Flooring A's share means a separate "A share due" computed from the snapshot. That's an engineering cost for the brief.
- **Signal to revisit:** % of hires where the invoiced fee differs from the computed one; disputes on discounts.
- **Status:** (a) decided (agreement wording ⚖️); (b) **decided by the user on 2026-11-15: on the fee collected (PD-049)**. The floor's behaviour when I > C is confirmed in RD-031.

## RD-026: Retainers and engagement fees (N2)
- **Date:** 2026-11-15
- **Question:** Is the split on the total fee or only the success portion when the job is retained or engaged?
- **Decision:**
  - The split applies to the **total placement fee, retainer or engagement payments included**, even where an upfront portion was invoiced before the referral was delivered.
  - B must declare "retained / engaged" on the card.
  - Retained owners who want a smaller partner share wait for L2 (bounded per-job share, RD-005).
- **Rationale:** It's the NPA rule ("a split of the total fee, inclusive of a retainer or engagement fee", to be clarified before presenting the candidate, [NPA](https://members.npaworldwide.com/Stories/sharing-retainers-and-engagement-fees)). Excluding retainers invites fee restructuring (A-3).
- **Rejected:** split the success portion only (gameable; A's share can shrink to nothing).
- **Risks:** retained/exec owners keep jobs private. Fine: retained search isn't our ICP ("not doing").
- **Signal to revisit:** retained jobs opened vs kept private; L2 demand.
- **Status:** decided

## RD-027: Guarantee terms and partner payout timing on the card (N2)
- **Date:** 2026-11-15
- **Question:** How do the guarantee and payment terms apply once frozen?
- **Decision:**
  - The guarantee length and remedy come from the snapshot and run from the start date. The hire dialog shows them read-only.
  - Reversals of A's share are limited to what the snapshot's guarantee allows. A refund beyond it (a longer guarantee B gave its client, or a refund past the period) is B's alone. RD-006 otherwise unchanged.
  - Client payment terms (net days, invoice at start) are informational and frozen.
  - **Network rule:** B pays A's share **within 5 business days of the client's payment reaching B** (RD-018 calendar). It isn't held for the guarantee. Lateness feeds "% paid on time" (RD-007).
- **Rationale:** NPA requires payment by the next business day and forbids holding the share for payment terms or guarantees ([NPA](https://members.npaworldwide.com/stories/paying-your-partners)). 5 business days fits boutiques' weekly payment runs **[experience-based]**.
- **Rejected:** hold payouts until the guarantee ends (rejected in RD-006 too); next business day (unrealistic for small agencies doing manual transfers).
- **Risks:** A must refund its share after a late fall-off it was already paid for. Industry-normal, and the remedy default is replacement first.
- **Signal to revisit:** median days from client payment to verified payout; late-payout disputes.
- **Status:** decided (network-rules wording ⚖️)

## RD-028: Ownership window on the card and prior-presentation look-back (N2)
- **Date:** 2026-11-15
- **Question:** How is the RD-003 window applied per job, and does the N1 look-back follow it?
- **Decision:**
  - B picks 6–12 whole months (default 6).
  - The snapshot fixes it for each referral, starting at delivery. Existing referrals keep 12 months.
  - The network rule says the window must not be shorter than B's client terms ⚖️. Admins may ask for the clause in a dispute.
  - The prior-presentation look-back (fixed 6 months in N1 BR-12) uses the **same snapshot window**.
- **Rationale:** RD-003. The look-back and the window both express B's client "introduction" period, so the rule is symmetric: B's earlier presentation is protected for exactly as long as A's.
- **Rejected:** keeping the look-back fixed at 6 months (asymmetric when the window is 12).
- **Risks:** B declares 6 when its contract says 12 (A-5).
- **Signal to revisit:** hires reported in months 7–12 after a 6-month window; > 20% of jobs choosing a non-default window.
- **Status:** decided

## RD-029: Candidate confirmations after a recent email change or record creation (Q-1, PD-040, PD-042)
- **Date:** 2026-11-15
- **Question:** Should a candidate confirmation count for first position and fee entitlement when the candidate's email was added or changed, or the record was created, shortly before the request? If not, what window and what instead?
- **Decision:**
  - **It counts.** No downgrade, no waiting period, no flag to the hiring side.
  - **Evidence:** besides BR-12's email-change note, the consent line notes "Candidate record created on {date}" when it was created in the **30 days** before issuance (`candidates.created_at`; source org and admins only).
  - **Challenge path (N3, Must):** an admin authorization check, requestable by a stopped submitter (PD-025 support path, identity of the first submitter not revealed), by the candidate, or by the hiring side in a claim or hire dispute.
    - If the confirmation carries a recent-change note, or the challenger brings evidence, the source org has **5 business days** to provide independent right-to-represent evidence: the candidate's dated message from a channel other than the confirmation mailbox.
    - The admin may contact the candidate through an identifier the source org didn't set.
  - **If invalid** (candidate denies, mailbox recruiter-controlled, or no answer): the presentation is **void**, with no first position and no fee (same effect as an upheld claim). The consent is marked disputed, and the case goes to RD-002 breach review. It is not converted into a recorded authorization.
  - **Should:** refuse confirmation destinations equal to a source-org member's email or on the source org's own verified domain (not freemail).
- **Rationale:**
  - Creating a record and confirming the same day is the honest fresh-sourcing flow. Imports and connectors create "new" records for long-known people, and candidates often switch to a personal email. A recency rule mostly hits honest recruiters.
  - Downgrading to recorded authorization changes nothing, because both count equally (RD-003).
  - Market right-to-represent is a dated written statement from the candidate. No one verifies mailbox ownership. Disputes are settled by asking the candidate **[experience-based]**. MissionHub matches that after the fact, with voiding as the deterrent.
- **Rejected:** a 7–30-day cooling-off before recent records can confirm (kills speed, the core value for P1/P2); downgrade to recorded authorization (no effect); show a flag to the hiring side (stigmatises normal behaviour, leaks sourcing timing, becomes a decline pretext); a second factor such as a phone OTP (friction, and the phone is recruiter-entered too).
- **Risks:** fraud succeeds where no one challenges it. Acceptable: an unchallenged forgery harmed no competing agency, and the candidate can still challenge.
- **Signal to revisit:** among challenged confirmations with a recent-change note, the share found invalid. If > 10% **[estimate]**, add a second factor for flagged confirmations only. Challenges per 100 deliveries.
- **Status:** decided (consent-evidence and voiding wording in the network rules ⚖️)

## RD-030: Sourcing-side hire reports (S-1)
- **Date:** 2026-11-15
- **Question:** When the sourcing side reports a hire, what evidence must it give, how long does the hiring side have to confirm or contest, and are withdrawn referrals covered like declined and released ones?
- **Decision:**
  - **Eligible referrals:** any delivered referral that still counts: submitted, info requested, accepted, interview, offer (if B hasn't reported), declined (except through an upheld or final prior-presentation claim), rejected, cancelled, released by SLA, and **withdrawn, yes, same as declined and released (RD-015)**, unless the sourcing side explicitly released it. Never on `already_presented`, `awaiting_candidate`, `candidate_declined` or released referrals.
  - **Sourcing side provides:**
    - the employer as known, the approximate start month, and the role if known;
    - how it learned of the hire;
    - **at least one dated evidence item** (the candidate's written word, a public profile change with URL and capture date, a company announcement, or other);
    - an attestation.
    - No offer letter is required.
  - **Visibility:** the hiring side sees the statement, evidence type, dates and hash. Files are for admins only (symmetric with RD-016).
  - **Hiring side:** **10 business days** to confirm or contest (RD-018 calendar; reminders at 5 and 8).
    - Confirm → complete the hire report from the snapshot.
    - Contest reasons: not hired by the client or affiliates; offer accepted outside the window (dated evidence required); different person; employer isn't this referral's client (the sourcing side learns only "not this client").
    - "Already had them" isn't available after the 5-day claim window (RD-004.3).
    - Contested → referral dispute (N1 infrastructure).
  - **Silence** → the hire is **deemed confirmed**, and a referral dispute opens for the fee details. Should: pause B's new partner jobs until the fee details are recorded.
  - **Timing:** the hire counts if the offer was accepted (or, if unknown, employment started) within the window. Reports are allowed until 6 months after the window ends ⚖️.
  - **Anti-abuse:** a rate limit; 2 rejected reports in 90 days flag the sourcing org for admin review; a fabricated report is an RD-002 breach. RD-019 blocks release while a report is pending on the referral's client.
- **Rationale:** A backdoor victim usually has only the candidate's word or a LinkedIn change, so requiring an offer letter would make the feature useless. The burden shifts to the party that actually knows: B. 10 business days matches the claim contest window (RD-017). Deemed confirmation gives silence a cost, just as an uncontested claim is final. Withdrawn referrals are where the timing games happen (RD-015).
- **Rejected:** offer letter or payroll proof required (unobtainable; sensitive data); auto-create a placement on silence with a guessed fee (the fee needs data only B has, so admin completes it); excluding withdrawn referrals (the collusion route in RD-015).
- **Risks:**
  - Fishing for confidential client names through guessed reports. Mitigated by the rate limit, rejected-report tracking, and only "not this client" being revealed.
  - Deemed confirmation on a wrong report, if B misses notifications. The N7 notification emails are a prerequisite, like the claim-filed email (PD-030).
- **Signal to revisit:** report → placement conversion; contested-and-upheld rate; deemed confirmations later overturned.
- **Status:** decided (the "client and affiliates" and contractor/PJ/EOR-hire wording, and the reporting tail ⚖️)

## RD-031: Frozen terms are a floor, not a cap (N2 S-N2-1)
- **Date:** 2026-11-15
- **Question:** When B invoices more than the computed fee (I > C), does A's share follow I (frozen terms as a floor) or stay at C (always frozen)?
- **Decision:** **Floor.** A's share is computed on max(C, I), as BR-27 says. When I > C, the split is the normal split of what B invoiced, so A shares the upside. Read with PD-049: the platform share is always on the fee collected, so when I ≥ C all three parties get exactly today's split.
  - I is the **placement fee for this hire only** (retainer and engagement payments included, RD-026). Separately invoiced services that aren't part of the placement fee (for example, assessments the client bought on its own) are not in I. Moving placement fee into another invoice is fee restructuring (A-3).
- **Rationale:**
  - Networks split the **total fee actually charged**, and treat the published fee only as the default when nothing else was agreed ([NPA, retainers](https://members.npaworldwide.com/Stories/sharing-retainers-and-engagement-fees), [NPA, split arrangements](https://members.npaworldwide.com/Stories/split-fee-arrangements-between-members)). The frozen terms protect A from B's concessions. They were never meant to let B keep the upside of a candidate A found.
  - The usual reasons for I > C are legitimate and come from the candidate A brought: a signing or guaranteed bonus the client agreed to include, a fee renegotiated up, or B's card understating its client contract. A cap would reward B for under-declaring on the card.
  - A cap also gives B a quiet way to keep money: report I = C and invoice the client more. A floor removes the reason to do that in the first place.
- **Rejected:** always frozen (cap at C): off-market, rewards understated cards, and makes the platform share depend on a number nobody was paid.
- **Risks:** B reports I = C while invoicing more off-platform. Same exposure as today; the dispute playbook may ask for the client invoice.
- **Signal to revisit:** disputes where A alleges an invoice higher than reported; % of hires with I > C (if near 0 while I < C is common, look harder at under-reporting).
- **Status:** decided (floor clause wording ⚖️, already on the counsel list). **No BR change** (confirms BR-27).

## RD-032: What counts as "worse for partners" for the admin flag (N2 S-N2-2)
- **Date:** 2026-11-15
- **Question:** Is the BR-39 list of terms changes that are worse for partners right, including "a longer guarantee is worse for A"?
- **Decision:** Confirmed, with four additions and one timing change. A new version is **worse for partners** when, compared with the previous version, any of these is true:
  1. Lower rate (same % basis), lower flat amount (same currency), or lower or removed minimum fee.
  2. **Basis change** other than `pct_base` → `pct_total_cash`. That includes total cash → base, and any change to or from flat, because % and flat can't be compared without the salary. *(Addition: flat ↔ % flagged.)*
  3. **Flat fee currency changed.** Can't be compared without FX. *(Addition.)*
  4. Longer guarantee. **Yes, longer is worse for A:** under RD-027 A's share can be reversed for as long as the guarantee runs, so a longer guarantee means more time at risk.
  5. Remedy moved towards refund: replacement only < replacement then pro-rata < pro-rata refund < full refund.
  6. Shorter ownership window.
  7. **Longer client payment terms (T8 net days).** A is paid when B is paid, so longer terms delay A's money. *(Addition.)*
  8. **Search type moved down:** retained > contingent exclusive > contingent shared. Retained → contingent counts as well as exclusive → shared. *(Addition: retained in the order.)*
  - **Timing (change):** (a) fires when the worse version is published **within 30 days after any delivered referral on the job**, not only the first. Bait-and-switch happens whenever B has just seen candidates, and a job that got its first referral months ago can keep receiving them.
  - (b) unchanged: more than 2 versions in 30 days.
  - Flag only, admin-only, no automatic action. When unsure, flag: a false positive costs an admin a glance, a missed bait-and-switch costs partner trust.
- **Rationale:** RD-024 / A-1 (bait-and-switch). Each item reduces either A's money, A's protection or how fast A gets paid. The snapshot already protects every submitted referral. The flag is for B's behaviour towards the next partners.
- **Rejected:** fee-only flag (misses guarantee and window games A-4, A-5); treating flat ↔ % as neutral (a hiring org could switch to a low flat fee and never be flagged); first-referral-only timing (misses active jobs).
- **Risks:** noise if hiring orgs routinely tidy cards after their first referrals. Calibrate on founding-cohort data.
- **Signal to revisit:** flag on > 5% of partner jobs (RD-024 signal); flags admins close as "legitimate client renegotiation" more than half the time.
- **Status:** decided. **Changes BR-39** (items 2, 3, 7 and 8 above, and "any delivered referral" instead of "first delivered referral").

## RD-033: Which client key governs ownership scope when the client is renamed while a candidate request is pending (N2 S-N2-3, for N3)
- **Date:** 2026-11-15
- **Question:** On the candidate-confirmed path, if B renames the job's client between commit and delivery, the commit key (BR-11) and N1's delivery key (BR-15) differ. Which governs N3 ownership scope?
- **Decision:** **Both.** A referral's "same end client" scope is the **union** of its commit key and its delivery key when they differ (or the one that exists, when the other is missing because a placeholder name gives no key).
  - Renames **after** delivery never change scope (A-6). Both keys are fixed at that point.
  - N3 hire-report matching ("the employer isn't this referral's client") checks against **either** key. The sourcing side still learns only "not this client".
  - N1's duplicate check, sticky stops and referral evidence keep using the delivery key only (N1 BR-15 intact, no change).
  - **For the N3 brief:** admins resolving a scope dispute need to see which client names produced the two keys, without the names ever reaching the sourcing side. The N3 brief decides how (backend design, not a recruiting rule).
- **Rationale:**
  - The commit key protects what A was promised: B can't move a referral out of scope by renaming during the days the candidate is deciding (RD-023, A-6).
  - The delivery key captures honest corrections: a typo fixed, or a placeholder ("Confidential client") replaced by the real name. In that case the delivery key is the real client and the commit key is empty or wrong.
  - If B actually moved the job to a different client while the request was pending, the candidate went to B under client X's job and is being worked against client Y. B learned of the candidate through this referral and could place them at either. Covering both is what "B can't backdoor what A sent" means. Repurposing a pending job to another client is unusual enough that over-coverage is the right failure mode.
- **Rejected:** commit key only (an honest placeholder → real-name correction leaves the referral with no or the wrong scope); delivery key only (opens the A-6 rename gap for the whole pending period); "ask the admin each time" (no rule, every case a dispute).
- **Risks:** a typo-level difference produces two keys for the same client. Harmless: the union covers the same company twice. A real repurpose gives A a wider scope than B expected; B caused it.
- **Signal to revisit:** referrals where the two keys differ (expected to be rare **[estimate]**); scope disputes where both keys were in play.
- **Status:** decided (scope wording "client and its affiliates" ⚖️, already listed). **No N2 BR change**: N2 already stores both keys. BR-15's open question now points here.

## RD-034: Collection shortfalls, including FX on flat fees, are shared pro rata in N2 (N2 S-N2-4)
- **Date:** 2026-11-15
- **Question:** E-4 says FX shortfalls on flat fees are B's risk, but the ledger can't tell an FX shortfall from non-payment at payment time, so BR-27 shares every collection shortfall pro rata. Acceptable for N2?
- **Decision:** **Accepted for N2,** with E-4 restated so the two don't conflict:
  - **The FX risk that matters is already B's through the floor.** FX on a flat fee only arises when B invoices its client in a currency other than the one it declared on the card, which is B's choice. B then records I in the snapshot currency. If the conversion makes I < C, the floor (BR-27, RD-031) keeps A's share on C, so B carries it.
  - **What is shared pro rata is the drift between invoice and receipt** (rate moves during the net-days term, bank charges on receipt), the same as any short payment (E-13). Over a net-30 term this is normally small **[estimate]**. It also runs both ways: if more arrives, A gets more (k = P ÷ I).
  - The I ≠ C reason list should include **"client invoiced in another currency"**, so FX cases are visible. That's a spec item under BR-23's short list, not a new rule.
  - A can dispute any shortfall. In a dispute the admin may ask for the client invoice and proof of receipt.
- **Rationale:** Splitting a known small residual pro rata is far better than building FX attribution (rates, dates, sources) into the ledger before there's a single cross-currency placement. Canada-first means most snapshots are CAD-on-CAD **[assumption]**.
- **Rejected:** full FX attribution to B now (needs FX rates and a declared invoice currency; disproportionate for launch); forcing card currency = org's home currency (blocks honest USD-paid remote roles, E-4).
- **Risk to watch (applies beyond FX):** the same mechanism lets B dodge the floor **after** the hire. B reports I = C, then grants its client a credit note, and the lower client payment is shared pro rata as if it were non-payment (an A-2 discount moved past the hire). Defences in N2: A sees I and every payment on the commissions page and can dispute; a credit note B grants without a guarantee or collection reason is B's alone (same logic as RD-027's "refund beyond the guarantee is B's alone"). **Later (X6 / X1, Should):** show A and admins a "short-paid" marker when the total verified by the due date + grace is below I, and give admins a way to post an allocation adjustment when a dispute is upheld. Today `resolve_dispute` only closes the dispute with text; it can't change an allocation.
- **Signal to revisit:** disputes citing FX or short payment; flat-fee partner jobs in a currency other than the hiring org's home currency above ~10% **[estimate]**; placements fully settled below I without a refund.
- **Status:** decided. **No BR change** (BR-27 stands; recruiting-input E-4 restated; one reason-list option suggested for the spec).

## RD-035: Concierge amendments only before the hire (N2 S-N2-5)
- **Date:** 2026-11-15
- **Question:** BR-34 allows a concierge amendment to a referral's terms only before a hire is reported. Confirm?
- **Decision:** **Confirmed.** A terms amendment is recorded only before the hire report. After the hire:
  - fee differences are reported by B as I ≠ C with a reason (BR-23), and A's share stays floored (RD-031);
  - if A agrees after the fact to take less (for example, to help B settle a client invoice dispute), that is a **dispute settlement**, recorded by the admin on the placement dispute with both orgs' written agreement. It isn't a terms amendment, because the hire was made under the snapshot.
  - Until dispute resolution can post an allocation adjustment (RD-034 Later), an agreed post-hire reduction is settled between the two orgs, and the dispute resolution text records it.
- **Rationale:**
  - NPA's standard is consent **in advance** ("specific, written, ADVANCE permission", [NPA, minimum fee](https://members.npaworldwide.com/Stories/minimum-fee-field-explained)). Consent after the hire is ratifying a concession B has already made, which is exactly where pressure happens (A-11).
  - An amendment after the hire would also have to recompute C, the guarantee end and allocations already posted. That breaks "the hire is reported from the effective terms" for a rare case.
- **Rejected:** amendments until the first verified client payment (quietly re-opens the discount at offer, A-2, with a retroactive paper trail); no amendments at all (real mid-search client renegotiations exist, RD-024).
- **Risks:** A agrees off-platform to a post-hire cut and the ledger still shows the floored share. It shows up as an unpaid balance B disputes, and the dispute record settles it.
- **Signal to revisit:** placement disputes resolved as "partner agreed to a lower fee after hire" above ~1 per 20 placements **[estimate]**. If so, build a ledger adjustment on dispute resolution (X6).
- **Status:** decided (amendment and no-conditioning wording ⚖️, already listed). **No BR change** (confirms BR-29 and BR-34).

## RD-036: Recruiters see only their own records inside an agency
- **Date:** 2026-11-15
- **Question:** Inside one agency, does every recruiter see every colleague's candidates, referrals and commissions?
- **Decision (founder):** **No.** "A recruiter sees only their own candidates and commissions, not their colleagues'."
  - **Agency-wide roles:** `org_admin` and `recruiter_manager` see the whole agency. Only the plain `recruiter` role is restricted.
  - **Candidates** (and their experiences, documents, consents, photos, matches/opportunities): visible to and editable by their owner only.
  - **Jobs:** stay readable by the whole agency (internal referrals, no duplicate postings). Any recruiter can post a job; only its owner or a manager edits it, changes its status or releases its pending referrals.
  - **Referrals:** sent ones are visible to the candidate's owner; received ones to the target job's owner. Messages, events and documents follow the referral. Non-admin recruiters accept and move referrals on their own jobs.
  - **Placements and commissions** (ledger, invoices, payment evidence, placement disputes): visible to the owner of the referral's candidate (sourcing side) or of the job (hiring side).
  - **Notifications** about a referral or placement go only to the members who can see it (owner + managers), never the whole agency.
- **Rationale:** recruiters inside an agency often work their own book (personal network, own commission). Agency-wide visibility of colleagues' candidates and earnings was not something agencies asked for, and least privilege reduces the exposure of candidate personal information inside the tenant ⚖️.
- **Rejected:** per-team scopes (no team model yet); restricting jobs too (breaks internal referrals and invites duplicate postings).
- **Consequences:**
  - When a recruiter leaves (membership suspended), their records keep them as owner: only managers see them until an org admin moves the portfolio (`transfer_member_portfolio`).
  - A plain recruiter can no longer act on a colleague's referral (for example, cover a colleague's pipeline while they're away). A manager can, or an admin transfers the records.
  - Counters (overview, badges) are per recruiter for the plain role, agency-wide for managers. Job counts stay agency-wide.
- **Open questions:** see `docs/specs/recruiter-record-scope/backend.md` (prior-presentation evidence from a colleague's job, team-page portfolio counts, public API keys).
- **Status:** decided. Implemented in `supabase/migrations/20261115000300_recruiter_record_scope.sql`.

## RD-037: "But for" only as the admin's residual test (S-TE-1, TE-18)
- **Date:** 2026-11-15
- **Question:** Should Top Echelon's "but for" rule (honour the source that led to your action) apply at MissionHub, and how far?
- **Decision:** **Yes, only as a residual test, with hard limits.** Network Rules v1, rule 7.4.
  - **When it applies:** only when no objective rule decides the case. Examples: whether a hire at a client's affiliate or successor is "the same client" (RD-033 scope wording ⚖️); whether a job, client or candidate a member pursued was found through a partner's shared information (rules 2.1–2.2, "sourcing off"); conduct around the client (rules 3.3–3.5).
  - **What it can't do:** override first position (RD-004), extend or ignore the ownership window (RD-003), reverse a claim outcome (RD-017), undo a release (RD-015/019), or create first position for information that was never delivered as a referral.
  - **Evidence:** MissionHub records and dated evidence only (referral events, messages, access logs, hashed uploads). A member's word alone is not enough.
  - **Effect:** in-platform only (PD-053.2): whether a referral counts where a rule is ambiguous, a conduct finding, a sanction on the ladder, and the record. It never sets an amount. The finding is part of the record a member can bring to mediation or arbitration (rule 7.5).
- **Rationale:** RD-004 rejected "but for" as the main test because it is slow and subjective, and that still holds. But no rulebook covers every case. Without a stated fallback, admins decide gaps arbitrarily or not at all. Recruiters already know and accept "but for" as a principle from Top Echelon and NPA's "procuring cause" **[experience-based]**. Fencing it off from the objective rules keeps those predictable.
- **Rejected:** "but for" as a rule that overrides others (Top Echelon p. 16: brings back case-by-case fights and lets anyone reopen a clean outcome); no residual test (gaps get decided ad hoc, which looks arbitrary to the losing side); using it to award fees after the window (contradicts RD-003, and it's a money decision MissionHub doesn't make).
- **Risks:** admins stretch "no rule covers this" to reopen settled outcomes. Mitigated by the hard limits and by second-admin review (rule 9.6).
- **Signal to revisit:** more than 1 in 5 resolved disputes decided on the residual test (it means the objective rules have a gap worth a new rule); reviews (rule 9.6) that overturn residual-test decisions.
- **Status:** decided

## RD-038: When the hiring side's access to a shared profile expires (S-TE-2, TE-20, PD-053.6)
- **Date:** 2026-11-15
- **Question:** The founder approved expiring the hiring recruiter's access to the shared profile and documents after the ownership window (PD-053.6, built after N3). What are the exact timings?
- **Decision:** Access follows the sourcing side's stake. The timing depends on how the referral ended:

  | Referral state | Hiring side keeps access to shared profile and documents until |
  |---|---|
  | In progress (submitted, info requested, accepted, interview, offer) | No expiry while in progress |
  | Closed without a hire, still counting (declined, rejected, withdrawn, cancelled, released by SLA) | End of the ownership window (delivery + snapshot window; 12 months for legacy referrals, PD-009) |
  | Closed with no stake for the sourcing side (sourcing side released the candidate, `already_presented`, or prior-presentation claim upheld or final) | 30 days after the release or closure |
  | Hired | 30 days after the guarantee end date (from the snapshot). If there is no guarantee: 30 days after the start date |
  | Any open dispute, pending claim or pending hire report on the referral | Paused until it is resolved, then 30 days more (or the row above, whichever is later) |
  | Candidate revokes authorization | Immediately (unchanged) |

  - **What stays visible after expiry:** status history, dates, the collaboration agreement, ledger, invoices and payment records, and the referral messages ⚖️ (they can contain personal information, so they need a PIA decision). For **hired** referrals the candidate's name stays as part of the placement and financial record. For the others it is replaced by "Shared profile expired on {date}".
  - **The sourcing side sees no change.** It's their candidate.
  - **Notice:** from closure, the hiring side sees "Shared profile available until {date}" on the referral. No email is needed.
  - **Member duty:** Network Rules 2.6. When access ends, delete copies made outside MissionHub unless the law requires keeping them.
  - **Option for the PIA (not decided here):** documents (resume files) could expire 30 days after closure even while the profile fields stay until the window ends. That's stronger minimization, but the hiring side loses the resume for "silver medallist" re-engagement. Counsel and the PIA (N7) decide whether retention law requires it ⚖️.
- **Rationale:**
  - A declined candidate isn't dead within the window. Roles reopen, and clients come back to their runner-up. When the hiring side re-engages through the same referral, both sides benefit, and the sourcing side's position protects that. So access should last as long as the stake does, and no longer.
  - Once the sourcing side has no stake (it released the candidate, or its referral never counted), the hiring side has no legitimate reason to keep the sourcing side's data. 30 days covers loose ends.
  - After a hire, the hiring side needs the profile through the guarantee for refunds or a replacement (RD-006). By then it has its own direct relationship with the candidate and the client's records.
  - Pausing expiry during disputes keeps the evidence intact.
- **Rejected:** expire at closure (kills legitimate re-engagement within the window and gains little, since the window already protects the sourcing side); keep access forever (the Top Echelon risk: an old resume reused years later, and against Law 25 / PIPEDA minimization ⚖️); one fixed period for every state (ignores the difference between a stake and no stake).
- **Risks:** the hiring side downloads the resume before expiry. We can't prevent it. Rule 2.6, audit logs and watermarking later (P2-5) are the deterrents. There's also more support load ("restore my access"): the answer is a new referral from the sourcing side, not a restore.
- **Signal to revisit:** "restore access" requests above about 1 per 50 expiries **[estimate]**; conduct reports about reusing an expired profile; disputes where evidence was needed after expiry.
- **Status:** decided (retention, messages and the name on hired records ⚖️ in the N7 PIA). Built after N3.

## RD-039: Client non-solicitation and contact with the partner's client (S-TE-3, TE-15, TE-16)
- **Date:** 2026-11-15
- **Question:** What do the v1 rules forbid about contact with the hiring recruiter's client, within PD-053.5 (during the process only), and what should come after the competition-law opinion?
- **Decision (v1):** two separate rules, because they protect different things.
  1. **Transaction channel (rule 3.3):** the sourcing side never contacts the client about *this* referral: the job, the candidate, interviews, the offer, the fee or payment, including late payment. It lasts as long as the referral and the resulting placement (through the guarantee and the final payout). This isn't a non-solicit. It doesn't stop the sourcing side from competing for the client's business. It only says who speaks to the client about a deal the hiring recruiter holds. Late payment is raised on MissionHub (commissions, placement dispute).
  2. **Non-solicitation while in progress (rule 3.4):** from delivery until the referral is hired, declined, rejected, withdrawn, cancelled or released, the sourcing organization (all its members) doesn't offer recruiting services to that client, and doesn't take a direct mandate for the same job without the hiring recruiter's written agreement (RD-043). It applies once the sourcing side knows or learns who the client is (for example, from the candidate on a confidential job).
  - **Exception (rule 3.5):** the sourcing organization worked with that client in the 12 months before delivery (signed terms, an invoice or an active job). It keeps that relationship, but not for this candidate, and without using what it learned from the referral. If it already held the same job directly, RD-043's exception applies. There's no duty to disclose the relationship to the partner. Evidence is needed only if a report challenges it.
  - **Not covered in v1:** the client contacting the sourcing side, on its own initiative, about *other* work. Responding to it isn't solicitation. Forbidding it would be a restriction on the client, which is the riskiest kind under s.45 ⚖️. General marketing (newsletters, public posts) isn't solicitation either.
  - **Enforcement:** conduct report → sanctions ladder. No fee or compensation (consistent with PD-053.1).
- **Recommendation after the competition-law opinion (`Needs user decision`, ⚖️):** if counsel confirms the ancillary-restraint defence (s.45(4)) for a narrow clause, add a post-hire non-solicit: for **6 months after the start date** of a placement made through MissionHub, the sourcing organization doesn't solicit that client for recruiting work. Keep the same 12-month prior-relationship exception, enforce in-platform only, and add no compensation formula. Don't extend it to referrals that closed without a hire, where the sourcing side gained little client knowledge and the restriction would be hardest to justify. 6 months matches the default ownership window (RD-003) and is the shortest period that covers the post-start "while the fee is still being paid" stretch.
- **Rationale:** Not going after the job owner's client is the core promise of every split network (Top Echelon p. 24, NPA's "proprietary interest" norm: [NPA best practices](https://members.npaworldwide.com/stories/best-practices-for-network-success)). Without it, hiring recruiters won't open jobs. Splitting the "channel" rule from the "non-solicit" rule protects the deal for its whole life without depending on the competition opinion for the part that restricts competition. Payment visibility on the commissions page removes the main excuse for contacting the client (late payment).
- **Rejected:** a post-process non-solicit in v1 (PD-053.5); the Top Echelon "split your next two commissions" remedy (off-platform, can't be checked); requiring the sourcing side to disclose its client list ("niche locking", an anti-competitive signal); a channel rule that ends at hire (the sourcing side would contact the client about payment exactly when it matters most).
- **Risks:** the transaction channel rule after the hire could be read as going beyond PD-053.5's "while a referral is in flight". I read the placement as part of the same transaction, so it applies, but **the founder should confirm this reading** (`Needs user decision`, low stakes). There's also the gap after closure: a sourcing recruiter can approach the client the day after a decline. That's accepted until the opinion arrives.
- **Signal to revisit:** conduct reports in the "contact with client" category, especially the ones that fall just after closure or hire; hiring recruiters who keep jobs private and cite fear of client poaching (RD-005 signal).
- **Status:** decided for v1 (within PD-053.5; the post-hire channel reading needs founder confirmation). The post-opinion scope **needs user decision** ⚖️.

## RD-040: Re-placement and off-limits for a placed candidate (S-TE-4, TE-21)
- **Date:** 2026-11-15
- **Question:** If the hiring side later places the same candidate again (another client), does the sourcing side get a split? How long is a placed candidate off-limits, and is ownership shared?
- **Decision:**
  - **No split on re-placement at a different client.** Ownership stays "same client, any role, within the window" (RD-003). A hire at the *same* client within the window is already covered by RD-003.
  - **Off-limits during the guarantee:** neither organization approaches the placed candidate about other jobs until the guarantee period on the snapshot ends (rule 3.6). If the candidate gets in touch first, either side may respond. That's the candidate's freedom.
  - **No shared ownership** after the placement (Top Echelon's 50/50 suggestion rejected).
  - The longer off-limits on the client's side (the hiring recruiter not recruiting its placed candidate out of its own client) belongs to the hiring recruiter's client contract, not to our rules.
- **Rationale:**
  - A split on re-placement at another client is candidate-global ownership by another name. RD-003 rejected that as unenforceable and as a restriction on the candidate. MissionHub also couldn't detect it, because the second placement happens on the hiring side's own desk.
  - The real abuse is limited by market practice: hiring recruiters usually can't poach their own placed candidate from their client for a period set in the client contract. Six to 12 months is common in permanent recruitment terms, though it varies ([Sprintlaw](https://sprintlaw.co.uk/articles/non-circumvention-recruitment-contracts/), [sample terms of business](https://yourrecruit.com/app/uploads/2024/09/yr-terms-of-business_permanent.pdf)).
  - Off-limits during the guarantee protects the shared fee for both sides (a fall-off refunds everyone pro rata, RD-006), so both sides already have the incentive. The rule makes it explicit.
  - Access expiry (RD-038) and rule 2.2 stop the hiring side from reusing the sourcing side's profile to re-place the candidate.
- **Rejected:** a split on any re-placement within 18 months (Top Echelon p. 18: unenforceable, candidate-global, undetectable); a 12-month off-limits for the sourcing side (it restricts a relationship the sourcing side had before the referral, and the candidate); 50/50 shared ownership (no basis to compute it and invites disputes).
- **Risks:** a hiring recruiter re-places a candidate from the sourcing side within months at a non-competing client. The sourcing side feels robbed and has no claim. That's accepted. If it shows up, the response is a conduct finding under rule 2.2 when the shared profile was used, not a fee.
- **Signal to revisit:** conduct reports or support complaints about re-placement by the hiring side within 12 months of a start date. If there are 3 or more credible cases in the first year **[estimate]**, reconsider a narrow re-placement rule after the competition opinion ⚖️ (s.45(1.1) applies to agreements between employers, but counsel should confirm it doesn't reach a candidate off-limits between agencies).
- **Status:** decided (rule 3.6 wording ⚖️). Re-placement product work stays P2 (P2-1) and only follows a signal.

## RD-041: Candidate-contact attestation on the recorded-authorization path (S-TE-5, TE-23, P1-6)
- **Date:** 2026-11-15
- **Question:** Should a sourcing recruiter who records authorization (not the candidate-confirmed path) attest "I spoke with the candidate about this job"?
- **Decision:** **Yes, but by rewording the existing checkbox, not adding a second one.**
  - Today the form already asks for a required confirmation ("I confirmed the candidate is interested in this specific role and approved sharing the selected information", `referrals.form.confirmInterest`) plus a free-text evidence note. The new wording should cover: *I, or a member of my organization, spoke with the candidate about this job; they are interested and approved sharing the selected information; this record is true.* The ux-writer owns the final words.
  - It's an attestation under rule 4.2. A false one is a rule 4.8 breach and can be challenged through the RD-029 path (admin check, candidate contact, void if invalid).
  - **No interview requirement** (Top Echelon asks for "some interview"). A screening call is enough for the attestation.
  - **Measurement (spec item):** add the decline reason "Candidate wasn't aware or isn't interested" so we can compare the two paths.
- **Rationale:** the friction cost is zero because the checkbox exists. The value is that a vague "approved sharing" becomes a specific, attributable statement about a conversation. That's what makes it challengeable and makes CV-bombing (submitting people who were never contacted) a clear breach. The candidate-confirmed path already proves contact by design.
- **Rejected:** a separate second checkbox (adds friction that people click through); requiring an interview (too strict for the speed members expect, and we can't verify it); no attestation (leaves CV-bombing a grey area).
- **Risks:** people click through attestations without reading. The deterrent is that it's challengeable, not the checkbox itself.
- **Signal to revisit:** the new decline reason on the recorded path above 2× the confirmed-path rate, or above 5 per 100 deliveries **[estimate]**. If that happens, require the candidate-confirmed path for that organization (admin setting) or for everyone.
- **Status:** decided. Copy change plus one decline reason. No new rule beyond rule 4.2.

## RD-042: Freshness confirmation for jobs open to partners (S-TE-6, P1-5)
- **Date:** 2026-11-15
- **Question:** How often must a hiring recruiter confirm that a partner-open job is still open?
- **Decision:**
  - **Every 30 days** from opening to partners or from the last confirmation, the hiring side confirms "still open, terms current". Reminder on day 30. **If there's no confirmation by day 37, the job is paused for partners**: it's no longer matched or submittable by partners, and referrals in progress continue. One click reopens it. Pausing doesn't change terms or reset anything (RD-024).
  - **What counts as a confirmation:** the explicit confirm action, editing the job's terms card (a new terms version), or accepting or moving a referral on that job. Connector syncs **don't** count: ATS jobs often stay "open" long after they're stale **[experience-based]**. A "confirm all my partner jobs" list view is fine.
  - **Prompt:** when the hiring side declines a referral with "Job filled", ask right away whether to close the job.
- **Rationale:** stale jobs are the fastest way to burn sourcing recruiters' goodwill. Each wasted submission also spends a candidate conversation. Top Echelon's network auto-expires jobs after 90 days ([Top Echelon](https://pinnacle.topechelon.com/4-steps-for-making-split-placements-in-te-network/)), which is long for contingent roles that often fill or die within weeks **[experience-based]**. 30 days lines up with our other 30-day rhythms (terms-updated notice, RD-024), and activity on the job counts, so a busy job never needs a separate confirmation.
- **Rejected:** 14 days (nagging, and people confirm without thinking); 90-day expiry like Top Echelon (too slow for contingent roles); counting connector syncs (keeps zombie ATS jobs alive); closing instead of pausing (destroys the job's history and annoys the hiring side).
- **Risks:** the hiring side confirms everything blindly. The "Job filled" decline rate is the check.
- **Signal to revisit:** "Job filled" declines above 5 per 100 deliveries **[estimate]** on confirmed jobs (shorten to 14 days, or ask for confirmation at submission); more than 30% of partner jobs auto-paused (too much friction: lengthen to 45 days or count more activity).
- **Status:** decided. Rule 4.6, built as P1-5 within X5.

## RD-043: Honouring the job when the client contacts the sourcing side directly (S-TE-7, TE-25)
- **Date:** 2026-11-15
- **Question:** Top Echelon makes a member who accepted a partner's job decline the same job from any other source, the client included, forever. Does this exist in the Canadian market, and with what scope for MissionHub?
- **Decision:** **Yes, as part of rule 3.4, limited to the same job and to while the referral is in progress.**
  - While the sourcing side has a referral in progress on a job, it doesn't take a direct mandate from the client **for that same job** without the hiring recruiter's written agreement (in the referral messages).
  - If the client contacts the sourcing side about that job or that candidate, the sourcing side sends them back to the hiring recruiter and tells the hiring recruiter in the referral messages within 2 business days.
  - **The candidate already submitted always stays with the referral.** A direct hire of that candidate by the client within the window owes the split anyway (RD-003). The rule is about the sourcing side's other candidates for the same job.
  - **Exception:** the sourcing side already held that same job directly from the client before its first referral. Nobody can honour a job it learned about second. The sourcing side should tell the hiring recruiter before submitting, so the two can agree how to work it (consistent with Top Echelon p. 13 and RD-013: two agencies on the same client sort it out between themselves).
  - Once the referral closes, there's no restriction in v1 (PD-053.5).
- **Rationale:** the situation is real in Canada. Shared contingency (several agencies on one role) is common, and clients learn which agency a candidate came from during interviews. The norm "don't go around the partner who brought you the job" is general split-network etiquette, not a Canadian specialty **[experience-based]**. NPA states it as respecting a fellow member's proprietary interest in a client ([NPA best practices](https://members.npaworldwide.com/stories/best-practices-for-network-success)). I found no Canada-specific published rule. Limiting it to the same job, while the referral is in progress, keeps it within PD-053.5 and within the narrowest restraint counsel needs to assess.
- **Rejected:** Top Echelon's "honour forever, from all sources" (too broad, restricts the client's choice of agency ⚖️, and our members never formally "accept" a job, they see it through matching); no rule (the client goes around the hiring recruiter mid-process, which is the trust breach hiring recruiters fear most); starting the duty when a member *views* the job (matching exposes jobs automatically, so a member can't be bound by what the engine showed them).
- **Risks:** the rule is hard to detect, because it depends on reports from the hiring side (who often learns from its client). That's acceptable, since the norm matters more than detection.
- **Signal to revisit:** conduct reports citing a direct mandate on the same job; hiring recruiters who say a client "went direct" to a partner.
- **Status:** decided (rule 3.4 wording ⚖️ with the s.45 review, P0-6). No product work.

## RD-044: Conduct-report categories and routing (N10 S-N10-1)
- **Date:** 2026-11-15
- **Question:** What categories does "Report a problem" offer, how do they map to the rules, and where does payout conduct go?
- **Decision:**
  - **Nine categories in the server enum**, in the reporter's words:
    1. went around me to the candidate or client (3.1–3.6);
    2. used what I shared for something else (2.1, 2.2, 2.4–2.6);
    3. shared my information outside their org (2.3);
    4. didn't report a hire or didn't pay my share on time (6.3, 6.4, 6.6);
    5. false or forged information (4.1–4.3, 4.8);
    6. job or terms not real or honest (4.4–4.7, 6.1, 6.5);
    7. discrimination (5.1, 5.2);
    8. retaliation, public accusations or a bad-faith report (7.1, 8.5);
    9. something else.
  - **The UI shows only the categories that fit** the entry point and the reporter's side. The server accepts any value.
  - **A "use the right tool" block** routes who-was-first questions to claims, hires to hire reports and amounts to placement disputes.
  - **Payout conduct gets its own category,** because a pattern of non-payment or hidden hires is conduct for the ladder. The money itself stays in placement disputes and rule 7.5.
  - **The "possible 9.4" tag is admin-only** (queue priority for categories 3 and 5). The reporter never sees it.
  - **The admin records its own category at triage.** Metrics and revisit signals use the admin category.
- **Rationale:** recruiters describe what happened, not rule numbers. Unreported hires and slow payment are the top trust breakers in splits **[experience-based]**, and a placement dispute never reaches the ladder. Filtering keeps the visible list short (5 to 9 options) without losing triage signal.
- **Rejected:**
  - the PM's 8 (payout hidden in a mixed category, labels in rule language);
  - 4 or 5 broad categories (loses the 2.3 / 4.8 triage signal);
  - payout conduct only in placement disputes (serial late payers never sanctioned);
  - showing hold eligibility to reporters (gaming).
- **Risks:** category 4 used to collect money. Mitigated by the routing block and the triage close reason. Filtering occasionally hides an applicable category, which "something else" covers.
- **Signal to revisit:** more than 50% closed at triage or more than 30% relabelled **[estimate]**; "something else" above 20% **[estimate]**.
- **Status:** decided. Changes brief BR-17. Details: `docs/specs/network-rules-enforcement/recruiting-input.md`.

## RD-045: What the reporter learns, and the data-incident notice on 2.3 findings (N10 S-N10-2)
- **Date:** 2026-11-15
- **Question:** What does the reporter learn of the outcome of a conduct report?
- **Decision:**
  - **Outcome category only, four outcomes:**
    - action taken;
    - no breach found;
    - not enough evidence to act (may refile with new evidence);
    - closed without a finding (with the reason).
  - **Never shown to the reporter:** the sanction level, the finding text, the response, or review requests.
  - **Reviews:** if a review changes the outcome category, the reporter's outcome updates with a detail-free notification.
  - **Every outcome screen** says the report doesn't change the referral, first position or any amount owed.
  - **Exception:** on a breach found under 2.3, the admin sends each organization whose candidates' or clients' information was shown to be shared a factual incident notice (referrals, what information, when, to whom if known). It doesn't name the sanction. ⚖️
- **Rationale:** levels become gossip in a small market and expose a named competitor ⚖️. Silence pushes reporters to public accusations (rule 7.1). Affected sourcing orgs may have their own duties to the candidate after a confidentiality incident: Law 25 s. 3.5 requires reasonable measures to reduce the risk of injury and notice where the risk of serious injury is present ([LegisQuébec P-39.1](https://www.legisquebec.gouv.qc.ca/en/document/cs/P-39.1%20/20230630)).
- **Rejected:**
  - "sanction applied yes/no" or the level;
  - three outcomes (folds "thin but true" into "no breach");
  - no incident notice.
- **Risks:** reporters infer a hold from vanished jobs (an inference, also caused by the rules gate). The incident notice spreads word of a finding (accepted, since the subject is their candidates' data).
- **Signal to revisit:** repeat reports on the same issue after "action taken"; 7.1 cases citing "MissionHub did nothing"; counsel C-4.
- **Status:** decided. ⚖️ Who notifies the CAI or the candidate (sourcing org, hiring org, MissionHub) is for counsel (C-4).

## RD-046: Network hold scope and containment of a 2.3 leak (N10 S-N10-3)
- **Date:** 2026-11-15
- **Question:** (a) Does 9.1's "accept new ones" mean only that no new referral can reach a held org? (b) Should an immediate 2.3 hold freeze the held org's access to shared profiles it received on in-flight referrals?
- **Decision:**
  - **(a) Yes (N10-D4 confirmed).** Referrals submitted before the hold continue in full, including `awaiting_candidate` and the held org's review and acceptance.
  - **(b) No freeze during the immediate hold.** Containment happens at the **breach finding**: the incident notice (RD-045), candidate revocation (cuts access immediately), and the sourcing org's withdraw/release choice.
  - **Correction:** escalating to suspension doesn't contain a leak, because settlement mode keeps read access to in-flight referrals. No level of the ladder cuts access to received profiles.
  - **Follow-up (with X11, after N3):** an admin-selectable "pause received shared profiles" effect on a 2.3 finding at suspension or termination level. It applies to referrals where the sanctioned org is the hiring side, and each sourcing org can resume per referral.
- **Rationale:** leaks happen by forwarding downloaded resumes, so a freeze recalls nothing. It stalls every innocent partner's candidates before a hearing and is visible to partners (BR-14). The hold already stops new data flowing to the org.
- **Rejected:**
  - automatic freeze on 2.3 holds;
  - freezing downloads only (same stall);
  - admin-chosen freeze at hold time (a discretionary measure before a hearing, against the 9.4 closed list);
  - blocking acceptance of already-delivered referrals.
- **Risks:** a real leaker keeps using profiles during the response window. `awaiting_candidate` referrals submitted before a 2.3 hold can still deliver a fresh profile to the held org. ⚖️ Counsel (C-4): does a "reason to believe" oblige pausing those deliveries?
- **Signal to revisit:** a confirmed 2.3 breach with further leaking between hold and decision; sourcing orgs asking to be told at hold time; counsel's answer.
- **Status:** decided. Brief R-5 mitigation to be corrected; follow-up effect for the X11 backlog.

## RD-047: In-flight continuity for suspended and terminated orgs; stale-referral closing (N10 S-N10-4)
- **Date:** 2026-11-15
- **Question:** During a suspension, may the org keep advancing in-flight referrals, or only close and settle?
- **Decision:**
  - **Full continuity** (BR-34 confirmed): interview, offer, hire report, decline, withdraw, release, messages, payouts, refunds and disputes, on referrals submitted before the sanction.
  - **For terminated orgs only:** an admin may close an in-flight referral with no stage change, message or event for **60 days** **[estimate]** as `cancelled`, with a reason and an audit trail. The ownership window is kept (rule 6.3), so the sourcing side's position is unchanged.
- **Rationale:** the client process continues off-platform anyway. Blocking in-platform steps takes the process off the record (where backdoors happen) and strands the innocent partner's candidates at offer, the costliest fall-off **[experience-based]**. "Close only" pushes the suspended hiring side to decline in-platform and hire off-platform. The stale-closing action stops a terminated org from keeping settlement mode open forever.
- **Rejected:** close and settle only; freezing in-flight referrals; automatic cancellation of stale referrals (some searches legitimately pause for months).
- **Risks:** in-flight referrals used as a back channel (accepted, PD-053.1). 60 days is too short for executive searches (admin discretion).
- **Signal to revisit:** partner tickets about a suspended counterpart unable to act (target 0); terminated orgs still settling after 6 months **[estimate]**.
- **Status:** decided. Adds one admin action to the brief's BR-37 obligations list.

## RD-048: What partners see for a terminated org (N10 S-N10-5)
- **Date:** 2026-11-15
- **Question:** For a terminated org, do partners see "isn't taking new referrals right now" or "is no longer in the network"?
- **Decision:**
  - **While the terminated org is in settlement mode:** the same neutral BR-14 sentence.
  - **Once settlement mode ends:** "{Org} is no longer part of the MissionHub network." It's shown on closed history and old links only, never in lists or notifications.
  - **The same sentence covers voluntary exits** once settled, so it never reveals a sanction. It goes away if the org is readmitted (rule 9.7).
- **Rationale:**
  - Announcing earlier would come before the review is decided. Worse, it makes sourcing partners with pending payouts call the client to secure the fee **[experience-based]**, a 3.3 breach (PD-054).
  - After settlement nobody has a stake, and "right now" would otherwise mislead indefinitely.
- **Rejected:**
  - the neutral sentence forever (misleading);
  - "membership terminated" (discloses a sanction ⚖️);
  - "no longer part of" from the termination date (panic, premature).
- **Risks:** former partners read it as termination (mitigated by sharing the sentence with voluntary exits). QA scenario 13 changes to "identical except terminated or exited after settlement".
- **Signal to revisit:** "is X still in the network?" tickets during settlement; any complaint about the wording ⚖️.
- **Status:** **Needs user decision** (low stakes, partner-facing copy about a member). Recommendation as above.

## RD-049: Escalation on the same notice after an immediate hold (N10 S-N10-6)
- **Date:** 2026-11-15
- **Question:** After an immediate hold and its response window, may the admin go straight to suspension or termination on the same notice?
- **Decision:**
  - **Yes,** if three conditions hold:
    1. the notice carried the fixed, non-editable line listing every possible outcome (no action, warning, hold, suspension, termination). Every notice, regular or immediate, carries it;
    2. the facts and rules are the ones in the notice. The org's own admissions about the same conduct count. New incidents or rules need a new notice, and the hold stays meanwhile;
    3. the BR-30 "why a hold isn't enough" statement is given.
  - The decision form offers only the rules cited in the notice.
  - **Should:** an immediate hold with no decision 10 business days after the window closes shows as overdue to admins. There is no automatic lift.
- **Rationale:** fairness turns on whether the org knew the case and the stakes when it answered ⚖️ (CCQ 1375, C-3). One fixed sentence removes the need for a second 10-day wait that adds no information.
- **Rejected:**
  - escalation always on the same notice (unfair without the stakes line);
  - a new notice for any escalation (delay for nothing);
  - auto-lift on a late decision (rewards a real leaker).
- **Risks:** the stakes line alarms orgs over minor matters (it's routine because it's on every notice). Admins stretch "same facts" (second-admin review, rule picker limited to the notice).
- **Signal to revisit:** reviews reducing escalations on fairness grounds; overdue immediate holds above 1 in 5 **[estimate]**; counsel C-3.
- **Status:** decided (notice wording ⚖️ with C-3).

## RD-050: Two ways to record a hire, both against one referral (N3)
- **Date:** 2026-11-16
- **Question:** What is a "referral-level claim" in N3, and what may each side do?
- **Decision:**
  - **Two paths:** the hiring side **records a hire** (RD-051), or the sourcing side files a **hire report** (RD-030). Both attach to one referral: the single counting presentation for that candidate × hiring org × client key (N1). It governs a hire into any role at that client.
  - **Terminology:** "claim" stays N1's word for the prior-presentation objection (PD-028). The sourcing side's action is a "hire report".
  - **No evidence-free "inquiry" button.** A suspicion with no dated evidence goes in the referral messages (rule 7.1), and the hiring side must answer truthfully (4.8).
- **Rationale:** the party that owes the money can't be the only one who records the hire. An inquiry without evidence becomes a tool for fishing out confidential client names and for harassment.
- **Rejected:**
  - a separate "ownership claim" object next to hire reports (two concepts for one event);
  - an evidence-free inquiry.
- **Risks:** a sourcing recruiter with only a rumour feels unheard. The messages thread and rule 4.8 cover it.
- **Signal to revisit:** referral messages asking "did you hire X?" that are later followed by a confirmed hire report (B ignored the question).
- **Status:** decided. Detail: `docs/specs/referral-claims-two-sided-hire/recruiting-input.md` §2.

## RD-051: The hiring side records hires from any counting referral, within 5 business days (N3)
- **Date:** 2026-11-16
- **Question:** `report_hire` works only from `offer` with an accepted agreement. What is the hiring side's duty and path for other hires?
- **Decision:**
  - **Path:** B records a hire from **any referral that still counts**, in any status, including a hire into another role at the same client. The fee is the snapshot rate × the actual base for the role hired into.
  - **No agreement yet** (the referral was never accepted): the placement uses the referral's frozen snapshot (terms, commission rule, client keys) as the agreement. A doesn't confirm again, because A committed to those terms at submission (RD-023). ⚖️
  - **Released referral:** the hire is recorded for the record only. No placement, no split. B learns at that point that the referral carries no split.
  - **Sister org:** a hire by a related org of B at the same client counts as B's hire.
  - **Deadlines (rule 6.4):**
    - record the hire within **5 business days** of learning of the offer acceptance, and never later than 5 business days after the start date;
    - record the client invoice within **10 business days** of the start date (overdue shown on Commissions, feeds X9);
    - not invoicing, or waiving the fee without A's prior written consent, is a B discount: the floor applies (RD-025, RD-031).
  - **Should:** a nudge after 30 days in `offer`.
- **Rationale:**
  - Most backdoors happen on referrals that were declined, withdrawn or left to lapse. Today those hires can't be recorded at all.
  - Invoicing on the start date is market standard **[experience-based]**. 5 business days matches RD-027's payout rhythm.
  - Honest hiring recruiters need a clean way to self-report a late or other-role hire. Without one, the only path is being reported on.
- **Rejected:**
  - hire only from `offer` (it leaves the backdoor unrecordable);
  - requiring A to re-confirm an agreement (gives B nothing and delays the record);
  - no deadline (6.4 can't be enforced).
- **Risks:**
  - A deemed agreement may not be enforceable without B's acceptance ⚖️ (user Q-1).
  - The duty is unenforceable when no one reports a hire. A's report path and the HA-1 flag cover it.
- **Signal to revisit:** share of hires recorded on non-`offer` referrals; hires first reported by the sourcing side (HA-1 flag: 2 or more confirmed or upheld in 12 months for one hiring org **[estimate]**).
- **Status:** decided (basis of the deemed agreement and the 6.4 wording ⚖️).

## RD-052: Coverage test for a hire: in progress, inside the window, or a 3-month re-engagement tail (N3)
- **Date:** 2026-11-16
- **Question:** Exactly which hires does a referral's protection cover? (This extends RD-030's "timing" bullet.)
- **Decision:** a hire is covered if **any** of these holds:
  1. The referral was **in progress** (submitted through offer) at the time of the offer. Live referrals never expire.
  2. The offer was **accepted inside the window** (delivery + snapshot window), or, if the acceptance date is unknown, employment started inside it.
  3. The client's selection process that led to the hire (first interview or assessment, any role) **started inside the window**, and the offer was accepted **within 3 months** after the window ended.
  - When B contests on timing, it must give dated evidence of the offer acceptance **and** of when the process started.
  - The filing tail stays at 6 months after the window (RD-030 ⚖️), and becomes 9 months when the tail in 3 applies.
  - Inside the protection, these are never defences: "we found them ourselves", "they applied directly", "a different role", "the referral was declined or withdrawn". The only exits are those in rule 6.3 plus a voided confirmation (RD-029).
- **Rationale:**
  - A window that expires on a live process punishes slow clients, not backdoors.
  - The classic slow-walk (decline, re-engage directly near the end, offer the day after) defeats a strict acceptance date. Agency terms typically key the fee to an engagement within the period after the introduction ([Reed](https://resources.reed.com/hubfs/Website/Documents/Terms%20of%20Business/Executive%20Search%20Terms%20of%20Business%20-%20Reed.pdf), [Goodman Masson](https://www.goodmanmasson.com/terms-of-business-for-perm-employment)), and disputes turn on when the process began **[experience-based]**.
  - The tail doesn't expose B to fees it can't bill. In the slow-walk case B places the candidate and collects a fee. If B collects nothing, the shortfall rule applies (RD-025).
  - RD-037 forbids "but for" from extending the window, so the tail has to be an objective rule.
- **Rejected:**
  - strict acceptance date only (rewards the slow-walk);
  - start date as the test (notice periods of 1–3 months in the UK, Brazil and senior Canadian roles would push honest hires out);
  - an open-ended "process started inside" test with no cap (endless exposure).
- **Risks:**
  - B can't always prove when the process started. The admin decides on the record (7.2).
  - Some client contracts don't have such a tail, so B owes on a placement it billed in full. Acceptable.
- **Signal to revisit:** contests on timing that fall in the tail; hires reported in tail months clustered just after 3 months (that would mean the slow-walk moved).
- **Status:** decided (rule 6.3 wording ⚖️).

## RD-053: Hire-report contest, evidence, deemed confirmation and fee details (N3)
- **Date:** 2026-11-16
- **Question:** How are hire reports answered, contested and decided, and what happens when the hiring side stays silent or never enters the fee?
- **Decision:**
  - **Contest reasons and evidence:**
    - not hired by the client or affiliates (attestation, plus documents if any);
    - outside the window (dated acceptance and process-start dates, per RD-052);
    - different person (checked with the admin "same person" signal, PD-024, extended to hire disputes);
    - not this client (checked against both keys, RD-033; the sourcing side sees only "not this client").
  - **Rebuttal:** A may add evidence once, within **5 business days** of the contest.
  - **Admin:** target decision **10 business days** after the rebuttal deadline, with an overdue flag. Outcomes: upheld (the hire counts, placement created), rejected, or void (RD-029).
    - The admin may contact the candidate through an identifier A didn't set, and the client only with B's permission (7.3).
    - If B refuses to provide the client's written confirmation, that counts against B (7.2).
    - A false contest or a fabricated report is a 4.8 breach (immediate hold possible, 9.4).
  - **Deemed confirmation on silence (RD-030)** applies **only if** the notice was emailed to the job owner and at least one admin or manager of B, without a bounce. Otherwise the report goes to the admin queue.
    - Only an admin can reopen it, within 10 business days, and only for a failure MissionHub's own logs show.
  - **Fee details:** B has **10 business days** after a confirmation, deemed confirmation or upheld report to enter them.
    - Until then the placement shows "fee details pending" and the frozen submission estimate, labelled as an estimate.
    - If they're still missing: an admin notice under 6.4, then the N10 ladder. **This replaces RD-030's "Should: pause B's new partner jobs"**, which predates the notice-based ladder.
  - **Visibility:** hire-report outcomes are admin metrics only in N3, never shown to counterparts.
- **Rationale:**
  - The burden goes to the party with the documents.
  - One rebuttal gives fairness without making the dispute endless.
  - Silence can only cost B something if B was actually told. In-app notices alone don't meet that bar.
  - An automatic pause would be a sanction without notice, against N10 rule 9.4's closed list.
  - MissionHub never sets the amount (7.5).
- **Rejected:**
  - deemed confirmation on in-app notice only;
  - unlimited back-and-forth;
  - the admin estimating the fee;
  - an automatic job pause;
  - counterpart-visible hire-report stats (a partner-facing statement about a member, with defamation risk).
- **Risks:**
  - Deemed confirmation waits for N7 emails. Until then, unanswered reports load the admin queue.
  - Asking the candidate becomes routine. Keep it to at most one contact per dispute.
- **Signal to revisit:** median report → resolution above 15 business days; deemed confirmations reopened; fee-pending placements older than 20 business days.
- **Status:** decided. Partly supersedes RD-030 (silence bullet, Should clause only).

## RD-054: Competing reports, released referrals, ownership line, release from declined/rejected (N3)
- **Date:** 2026-11-16
- **Question:** How do N3's records interact with each other, with release, and with the PD-027 display gap?
- **Decision:**
  - **Both sides report:** the first valid record wins. A B record closes A's pending report as "confirmed by the hiring recruiter". A report filed after a B record is refused and points to the placement.
  - **Reports per referral:** one pending report at a time. A second report needs evidence dated after the first resolution. No further reports after two rejections.
  - **Order with claims:** a report is refused while a prior-presentation claim or dispute is open.
  - **Two hiring orgs on one client:** each records on its own referral. Never decided across hiring orgs (RD-013). Each sourcing share follows its own B's collection.
  - **Ownership line, both sides, every referral:** "Protected while in progress and until {date} ET". The hiring side adds "unless the sourcing recruiter released the candidate". It's true for every referral, so it reveals no release (PD-027 / N1 R-17).
  - **Release:** blocked on every referral of that sourcing org at that client while a report is pending. **Release from `declined` / `rejected` ships in N3** (RD-019 extension, PD-021). Releases made within 14 days before a hire record at the same client are flagged for an admin.
- **Rationale:**
  - Enforcing ownership raises the cost of a candidate stuck behind a dead referral, so the release has to be there.
  - One generic line removes the false statement without the leak.
- **Rejected:**
  - showing the release to the hiring side (invites direct approach, RD-019);
  - a per-referral line that changes on release (leaks it).
- **Risks:** the "unless released" wording makes some hiring recruiters ask the sourcing side. That's fine.
- **Signal to revisit:** releases flagged before hires; support questions about the line.
- **Status:** decided.

## RD-055: What counts as a hire for ownership (N3)
- **Date:** 2026-11-16
- **Question:** Does an engagement other than a direct permanent hire by the client count: an affiliate, a contractor or PJ, an EOR or payroll provider, or through another agency?
- **Decision:**
  - **All count** for whether the referral earns the split: employment or a contract for services of the candidate, by the client, its affiliates, or an EOR, PEO, payroll provider or agency acting for it, inside the protection (RD-052).
  - **Money:** B records the fee it invoiced. If it differs from C, B gives a reason: a new reason "non-permanent engagement", or the existing ones. The floor applies unless A agreed in advance (RD-025, RD-031). A claim that B's client terms give a lower fee for that engagement type is a placement dispute (7.5).
  - **Hired through another agency, or the client refuses to pay B:** still a hire. It's a collection shortfall, shared pro rata. If B waives without consent, the floor applies.
- **Rationale:**
  - Contractor or PJ conversion and affiliate hires are the standard way round an introduction fee **[experience-based]**.
  - Courts weigh how "engagement" and "introduction" are defined and whether a hire by an associate falls inside them (2024 DIFC case, [summary](https://legal-wires.com/uae-difc-cases/sct-3562024-nafrin-v-nahlah-2024-difc-sct-356-20241016/)).
  - Referral-open jobs are permanent only (RD-022), so this is about the backdoor, not contract splits.
- **Rejected:**
  - direct permanent hires only (an open loophole);
  - no floor for non-permanent engagements (B would convert to shrink A's share).
- **Risks:**
  - Some client contracts don't charge for contractor engagements, so B collects less. That is shared only if B shows its client terms in a dispute.
  - Wording ⚖️ (RD-030 already lists "client and affiliates" and contractor/PJ/EOR hires).
- **Signal to revisit:** placements with the "non-permanent engagement" reason; disputes over them.
- **Status:** decided in-platform (wording ⚖️, user Q-3).

## RD-056: Platform share on hires surfaced by a sourcing-side report (N3)
- **Date:** 2026-11-16
- **Question:** When a hire is established through A's report (a backdoor caught), does MissionHub take its normal share or a surcharge on the hiring side?
- **Recommendation:** **The normal rate, on the fee collected (PD-049), with no surcharge.** Consequences for the hiring side go through the conduct ladder (HA-1 flag, rule 6.4), not money.
- **Rationale:**
  - MissionHub stays neutral and doesn't profit from members' breaches (PD-049 spirit, PD-053.2).
  - A surcharge would make MissionHub look like a party to the dispute, and it raises RD-009 ⚖️ questions.
- **Rejected:**
  - a 2× or flat surcharge on caught backdoors (a revenue incentive to find breaches, and it reads as a penalty clause ⚖️);
  - no platform share on deemed hires (rewards the backdoor).
- **Risks:** a weaker deterrent than money. The ladder and reputation carry it.
- **Signal to revisit:** HA-1 flags repeating for the same orgs after warnings.
- **Status:** **decided by the user 2026-11-16** — option (a), normal platform share on the fee collected, no surcharge (PD-071).
