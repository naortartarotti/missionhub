# Recruiting input: Duplicate and prior-presentation protection (N1)

Owner: Recruitment Strategist · Date: 2026-11-12 · Brief: [`brief.md`](./brief.md) · Decisions: RD-013 to RD-018 ([`decisions.md`](../../strategy/decisions.md)), building on RD-003 and RD-004.
⚖️ = flag for counsel, not legal advice. **[Estimate]** = experience-based, not measured.

---

## 1. How prior-presentation conflicts really play out

### 1.1 The three conflicts recruiters actually have
1. **Two agencies, same person, same client.** The most common one. The candidate is on several agencies' databases (they applied to postings, or two recruiters called them in the same week). Both send the CV. The client, or the job-owning agency, replies to the second: "we already have this CV from agency X". The second agency is angry because it did the screening work and often has the better relationship with the candidate. The first agency may have sent the CV without really talking to the candidate ("CV-bombing" to lock ownership).
2. **"We already had them."** The job owner, or its client, says the candidate was already in their pipeline: an old application, a referral from an employee, an earlier agency introduction. Sometimes it's true. Sometimes it's a backdoor: they liked the candidate, they now have the name and LinkedIn, and they would rather not pay a split. The tell is that the claim comes without dates or proof, or only after the candidate did well in interviews.
3. **Re-entry after a gap.** The candidate was presented, the process stalled or the candidate pulled out, and months later the same person turns up again for another role at the same client, via another agency or directly. Whether the first agency is still owed depends on the window and on who walked away.

### 1.2 What decides these fights in the market
- **First introduction with consent wins**, scoped to the **client company**, for a fixed window. Paraform states it plainly: ownership goes to whoever introduced first, client ownership is company-level, and recruiters can't submit a candidate the client already owns to any role at that client; recruiter-vs-recruiter conflicts are decided by submission date and level of consent ([Paraform, candidate ownership](https://knowledge.paraform.com/articles/5997859648-candidate-ownership)). Vendor portals in ATSs block duplicates at the point of entry and give ownership to the first submitter ([AgencyHub/PitchNHire summary](https://www.pitchnhire.com/answers/how-to-stop-duplicate-vendor-submissions); [Eploy vendor portal](https://support.eploy.co.uk/hc/en-gb/articles/360009305758-Duplicate-Checks-and-Candidate-Ownership-options-in-the-Vendor-Portal)).
- **Sourcing or calling first doesn't count.** Only the submission does ([Paraform](https://knowledge.paraform.com/articles/5997859648-candidate-ownership)). That matches RD-004.1: the timestamp is delivery, not the draft.
- **Client claims have a deadline.** A client that says "we already had them" must say so within the period in its agreement, or the introduction stands ([Paraform](https://knowledge.paraform.com/articles/5997859648-candidate-ownership)). Split networks use the same pattern (NPA "procuring cause", Top Echelon "but for"; see `market-and-positioning.md` §2.2).
- **Consistency beats the perfect rule.** A rule published in advance and applied identically to everyone survives; exceptions for whoever complains loudest destroy it ([PitchNHire](https://www.pitchnhire.com/answers/how-to-stop-duplicate-vendor-submissions)).

### 1.3 Where MissionHub is stronger than a typical network
- The **candidate's own confirmation** gives a timestamp no one can forge, and it proves consent. Networks rely on emails and the recruiter's word.
- The duplicate check happens **before** the candidate is contacted a second time, so the fight never starts.
- The job owner's claim is **dated, evidenced and time-boxed**, and the sourcing side sees it. That removes the free backdoor.

### 1.4 What MissionHub can't know
- The hiring org's own pipeline and its client's ATS. We must not look at them (it would leak B's pipeline to the network), so B's prior possession is proven by evidence, not by a lookup.
- Candidates with different emails and phones on two records (exact hashing misses them; L3 later).
- Whether a recorded authorization was real. The candidate-confirmed path is stronger; the recorded path relies on attestation and the network rules.

---

## 2. Decisions on Q-1 to Q-6

### Q-1 Duplicate scope → RD-013
**Decision:** Check **same job** *and* **same hiring org + same normalised client name** in this release. **Never across two hiring orgs.**

- **Why same hiring org + client:** RD-003 makes ownership "same end client, any role". If A1 presented the person to B's job J1 at client X, a second partner presenting them to B's job J2 at client X can't earn the split either, and B already has the profile. Same-job-only would let the most common real conflict (the client's *other* opening) through.
- **Why not across hiring orgs:** two agencies working the same client have separate contracts with that client, and the client's own "first introduction" rule decides between them, outside our ledger. Free-text client names across orgs would also produce false hits ("ABC" vs "ABC Bank"), and a hit would tell a sourcing recruiter that two agencies work the same client. All cost, no enforceable outcome.
- **Rules for the client key (server-side, on job save, never shown):**
  - lowercase, trim, strip accents, collapse whitespace, drop punctuation;
  - strip trailing legal forms: inc, incorporated, ltd, limited, ltée/ltee, corp, corporation, co, llc, llp, lp, senc/s.e.n.c., enr, sa, sas, gmbh, plc;
  - **treat placeholders as no client**: confidential, confidentiel(le), confidencial, undisclosed, stealth, client, n/a, na, tbd, "-", empty. Otherwise every confidential job in an org would match every other one;
  - a job with no client key is checked at job scope only.
- **One neutral message for both hit types**, so the submitter can't tell whether it was this job or another role at the same client (e.g., "This candidate has already been presented to this hiring partner for this client"; the ux-writer owns the words). The submitter never learns the client's name.
- **Build fallback:** if eng estimates the client key at more than ~2 days, ship same-job first and add the client scope as the first follow-up, **before the founding cohort's first placements**.
- **Later:** a per-org client entity (pick a client instead of typing), and a "consider for another job" action so B can move A1's declined referral to J2 with A1's and the candidate's agreement.

### Q-2 Block or warn → RD-014
**Decision:** **Stop** the submission on a hit against a presentation (BR-6 as written). **Warn and allow** only when the earlier referral is still pending candidate confirmation (BR-7 as written). Plus three anti-evasion rules:

1. **At least one identifier is required for partner referrals** (email, phone or LinkedIn), on both paths. This replaces BR-10's "skip and proceed". Anyone who holds a real authorization to represent someone has a way to reach them, and the candidate-confirmed path needs an email anyway. Without this, deleting the email is a one-click bypass.
2. **Sticky stop:** once a candidate record was stopped for a job, a resubmission of that record to the same job or same client within 30 days is stopped too, even if its identifiers were edited. Audit it.
3. **The delivery re-check (BR-8) stays**, so editing identifiers between submission and confirmation doesn't help.

- **Why stop:** under RD-004.1 the second presentation can't earn the split; warn-and-allow invites "submit anyway and argue later", which is the fight we're preventing. It also spends the candidate's goodwill ("another recruiter called me about the same job?") and makes B receive the same person twice.
- **Rejected:** warn and allow (recreates the duplicate); stop with an override by the submitter (everyone overrides).
- **Risk:** false positives (recycled phone numbers, a shared family email). Rare **[estimate]**; the submitter can contact support, and a platform admin can see the hit. Track support tickets about wrong stops.

### Q-3 Withdrawn and cancelled referrals → RD-015
**Decision:** **Yes, they keep first position** for the rest of their ownership window, for the duplicate check (and, for N3, for ownership). Exceptions:

- The sourcing side may **explicitly release** the candidate when withdrawing (a separate, irreversible choice: "Release this candidate for this client: another partner may present them and this referral earns nothing"). A released referral stops counting.
- A referral whose prior-presentation claim is **upheld**, or which is uncontested after the contest window, stops counting.
- Referrals closed as "already presented" (BR-8) never counted.
- `candidate_declined` and still-`awaiting_candidate` referrals are not presentations (BR-5 unchanged).

- **Why:** the dangerous timing games all run through withdrawal:
  - *Candidate + job owner collusion:* B tells the candidate "pull out of A1's process and come through my friend A2 (or apply directly)". The candidate revokes, A1 must withdraw, and if withdrawal freed the slot, A1 is cut out. Keeping first position makes this pointless.
  - *Cancel-and-repost:* B cancels the accepted referral (or the job) and opens the same role again to shed the split. `cancelled` is a hiring-side action in our state machine, so letting it free the slot would hand B a reset button.
  - Once a candidate is presented to a client, the market treats the introduction as made for the window; walking away from the process doesn't undo it.
- **Rejected:** the brief's default (withdrawn/cancelled don't count): it rewards exactly the collusion above. A grace period after withdrawal: complex, still gameable.
- **Risk:** a candidate who genuinely wants a different recruiter is stuck until A1 releases. That's industry-normal; they can still be hired, and A1's share is what's at stake, not the candidate's job.
- ⚖️ The network rules must say that withdrawal doesn't end the introduction, and that release is the only way to give it up.

### Q-4 Can the sourcing side see the evidence → RD-016
**Decision:** **No file access for the sourcing side in v1.** They see: that a claim was filed, the claim date, the declared prior-process date, the evidence type(s), the file's upload time and SHA-256 (proves it can't be swapped later), B's note, and the deadline to contest. The file itself: the claiming org and platform admins only. Contesting costs A nothing, so A doesn't need the file to decide.

Plus one evidence type the brief lacks: **an earlier MissionHub referral as evidence.** When B received the same person earlier from another partner for the same job or client (the fingerprint missed them, e.g., different emails), B picks that referral in the claim form instead of uploading a file. The system checks it was delivered earlier and is still a presentation (RD-015). Admins see both referrals; the sourcing side sees only "earlier referral through MissionHub", never which one.

- **Why:** evidence files typically show the confidential client's name, other agencies' names and fees, and internal ATS notes. Showing them to A breaks client confidentiality (the reason the client field is confidential) and exposes third parties ⚖️. Mature networks route evidence to a neutral party, not the opponent.
- **Rejected:** full file to A (confidentiality, third-party data, defamation risk); no information to A (then the claim is a black box and contests become reflexive).
- **Later:** B may share a redacted copy with A; admins write a short evidence summary in the resolution; accept native email files (`.eml`) whose headers and signatures prove dates.
- ⚖️ Whether the network rules must give the contesting party access to the evidence (procedural fairness) is for counsel; the default above is the commercial recommendation.

### Q-5 Contest window and rejected claims → RD-017
**Decision:**
- **Contest window: 10 business days from the claim** (brief default confirmed). A needs time to see the notification and ask the candidate "had you applied to this company before?"; candidates take days to answer.
- **No contest by the deadline:** the claim becomes final (same effect as upheld).
- **One claim per referral.** B can't file a second claim after a rejection.
- **Upheld:** the decline stands, the referral stops counting as a presentation (RD-015), and it's flagged so N3 treats it as no ownership. Ownership date not changed (PD-009).
- **Rejected:** the referral goes back to `submitted`, flagged "claim rejected", with a **fresh review clock** (5 business days under RD-007/N4). B may then accept or decline for another reason, but not claim again. The referral counted as a presentation throughout, ownership date unchanged. A is notified and may withdraw if the candidate has moved on (A keeps first position, RD-015).
- **Reputation:** rejected claims are counted per hiring org. Two rejected claims in 90 days flag the org for admin review (Should; an admin-metrics line is enough in v1). A claim proven fabricated is a network-rules breach handled under RD-002 (suspension possible).
- **Rejected:** "stays declined, ownership confirmed": it lets a false claim still kill the candidate's chance at the job, so B loses nothing by lying. Extending the ownership window by the dispute's length: weeks against a 6–12-month window, not worth the complexity.

### Q-6 Business days, holidays, time zone → RD-018
**Decision:**
- **Time zone:** `America/Toronto` (Montréal and Toronto share it). Show deadlines as a date and time with "ET".
- **Business days:** Monday–Friday, **minus a network holiday calendar = the union of Ontario and Québec statutory holidays**: New Year's Day; Family Day (ON); Good Friday; Easter Monday (QC employers may choose it instead of Good Friday); Victoria Day / National Patriots' Day (same Monday); Fête nationale, 24 June (QC); Canada Day; Labour Day; Thanksgiving; Christmas Day; Boxing Day (ON). Sources: [Ontario ESA guide](https://www.ontario.ca/document/your-guide-employment-standards-act-0/public-holidays), [CNESST](https://cnesst.gouv.qc.ca/en/working-conditions/leave/statutory-holidays/statutory-holidays).
  - Not included: Civic Holiday (August), 30 September, Remembrance Day, 24 and 31 December. They aren't statutory in ON or QC under provincial law.
  - The union only ever lengthens a window by a day for the other province, which harms no one, and avoids per-org calendars.
- **Counting:** the day of the triggering event never counts. The deadline is **23:59:59 ET on the Nth business day after the local date of the event.** A referral delivered Friday at 18:00 gives B until the end of the following Friday; one delivered on a holiday or weekend starts counting on the next business day.
- **Freeze deadlines:** compute and store the deadline when the clock starts (`claim_deadline_at`, `contest_deadline_at`). Holiday-table edits apply to new deadlines only, so a live deadline never moves.
- **Calendar data:** a table of dates, seeded for 2026–2028 from the provincial sources (observed dates where a holiday falls on a weekend), maintained by platform admins. No Easter calculation in code.
- **Same helper for N4** (PD-011).
- **Later:** per-province calendars when we have members outside ON/QC; an optional year-end slowdown rule if we see claims missed over the holidays.

---

## 3. Abuse cases the product must withstand

| # | Abuse | Who | Defence in N1 | Residual risk / later |
|---|---|---|---|---|
| A-1 | **Fishing for who holds a candidate:** create a candidate with a target's email, submit to a job, read the stop | Sourcing recruiter | Check runs only inside a real submission with an authorization (BR-22); 30/h limit; every hit audited; one neutral message that reveals no org, date, status, count or whether it was this job or the client (RD-013); no standalone check endpoint. **Add:** flag an org to admins when it has > 5 stops in 7 days or a stop rate far above the network's **[threshold is an estimate, calibrate]** | What leaks is "someone presented this person to this hiring partner for this client". Acceptable in a vetted network (RD-002) |
| A-2 | **Evading the check:** delete or alter email/phone/LinkedIn to slip past | Sourcing recruiter | ≥ 1 identifier required; sticky stop for 30 days; re-check at delivery; B can claim using the earlier MissionHub referral as evidence (RD-014, RD-016) | Fully different identifiers on a new record: L3 fuzzy matching |
| A-3 | **CV-bombing to grab first position:** recorded-authorization submissions with no real consent | Sourcing recruiter | Attestation is audited; false attestation breaches network rules; candidate-confirmed path is the stronger default | **Later:** a stopped submitter can ask admins to verify the first presentation's authorization without learning who it was; an invalid authorization voids first position (consent-level rule, as Paraform applies) |
| A-4 | **Fake evidence:** a fabricated ATS screenshot or doctored email | Hiring recruiter | Prior-process date must precede `submitted_at` and fall within 6 months; attestation checkbox ("true and accurate; false claims can lead to suspension"); SHA-256 and upload time frozen; sourcing side can contest for free; admin can ask for a native export or live check; fabricated = RD-002 breach | **Later:** auto-extract file metadata (creation date) for admins; accept `.eml` with headers |
| A-5 | **Backdated claim after seeing the profile:** B uses the 5 days to contact the candidate directly, then claims "we had them" | Hiring recruiter | Evidence must predate delivery; contacts made after delivery don't qualify; the referral counts as a presentation while the claim is open | Direct hire after a false claim is a backdoor: N3 |
| A-6 | **Last-minute claims:** filed at 23:59 on day 5, or after B used "request info" to extract more | Hiring recruiter | Clock runs from `submitted_at` and **doesn't pause** for `info_requested`; claims only while `submitted`/`under_review`/`info_requested` (accepting = acknowledging the introduction); deadline frozen at delivery | A late but valid claim is legitimate; that's what the window is for |
| A-7 | **Timing games around withdrawal:** candidate + B push A1 to withdraw, then the candidate comes back via A2 or directly; B cancels and reposts | Hiring recruiter, candidate | Withdrawn and cancelled keep first position; only an explicit release by A frees it; same-client scope catches the repost (RD-013, RD-015) | Direct hire: N3 |
| A-8 | **Racing pending referrals:** two partners both send confirmation requests | Sourcing recruiters | First delivered wins, the other closes (BR-8, R-4). In practice the candidate decides by confirming one, which is the fair outcome | None |
| A-9 | **Claim spam to avoid paying:** B claims prior presentation on many referrals | Hiring recruiter | Claims need a file or an earlier referral; one claim per referral; no bulk claims (BR-14); claim rate per org vs network (brief metric); rejected-claim flag (RD-017) | Watch the decline-reason mix (R-3) |
| A-10 | **Self-duplicate inside one org:** two recruiters at A submit the same person | Sourcing org | Same stop, same message (BR-9); internal attribution is the org's business | None |
| A-11 | **Using the claim to learn B's client:** A contests just to see evidence | Sourcing recruiter | No file access for A (RD-016) | None |

---

## 4. Rules the product must enforce (deltas to the brief)

| Brief rule | Change |
|---|---|
| BR-3 | Scope = same job **or** same hiring org + same normalised client key (RD-013). Never across hiring orgs. Placeholders ("confidential"...) = no client key |
| BR-4 | Withdrawn and cancelled referrals **do** count for the rest of their window. They stop counting only when the sourcing side explicitly released them, a claim against them was upheld or went uncontested, or they were closed as "already presented" (RD-015) |
| BR-6 | Confirmed: stop. Add the sticky stop (30 days, same record × same job or client) (RD-014) |
| BR-9 | One message for job-level and client-level hits (RD-013) |
| BR-10 | **Replaced:** partner referrals need at least one identifier (email, phone or LinkedIn) on both paths. "% with ≥ 1 identifier" becomes 100% by construction for partner referrals (RD-014) |
| BR-12 | Evidence = at least one file **or** an earlier MissionHub referral B received for the same job or client, delivered earlier and still counting. Add the attestation checkbox. The 6-month look-back stays (aligns with the job's declared window once N2 ships). One claim per referral (RD-016, RD-017) |
| BR-15 | Confirmed: sourcing side sees date, declared prior-process date, evidence type, upload time, SHA-256, note; not the file. For referral-type evidence: "earlier referral through MissionHub" only (RD-016) |
| BR-16 | Confirmed: 10 business days. Uncontested = final (RD-017) |
| BR-17 | Mon–Fri in `America/Toronto` minus the ON ∪ QC statutory holiday table; event day doesn't count; deadline 23:59:59 ET on day N; deadlines stored at start (RD-018) |
| BR-18 | Confirmed: rejected → back to `submitted`, flagged, fresh review clock, no second claim. Upheld/uncontested → referral stops counting, flagged for N3. Ownership dates unchanged (RD-017) |
| New | Withdraw dialog offers "release this candidate for this client" as a separate, irreversible option (RD-015) |
| New (Should) | Admin flag: org with > 5 stops in 7 days, or 2 rejected claims in 90 days |

---

## 5. Success for each side

- **Sourcing recruiter:** never calls a candidate about a job they're already in; never loses a referral to an unproven "we had them"; sees the claim, its dates and a clear path to contest. Signal: sourcing orgs keep submitting within 30 days after a claim (brief metric).
- **Hiring recruiter:** never gets the same person twice from two partners; can make a legitimate claim in under 2 minutes with a file or an earlier referral. Signal: claims per 100 delivered referrals stays low and evenly spread across orgs.
- **Candidate:** contacted once per job/client; their confirmation decides between racing recruiters.
- **Employer/client:** receives one CV per person, from one agency; no fee argument lands on their desk.
- **MissionHub:** duplicate-related disputes under 1 per 100 delivered referrals **[estimate]**; admins resolve contested claims within 5 business days.

---

## 6. Canada and Québec specifics

- **Fingerprints are personal information.** A keyed hash of an email or phone is pseudonymous, not anonymous: whoever has the key can re-identify. Under PIPEDA and Québec's Law 25 it needs a stated purpose, minimal retention and safeguards ⚖️. The candidate-facing authorization text and privacy notice should say that contact details are used to check for duplicate submissions (copy-audit 9.6) ⚖️. The Law 25 PIA in N7 should list the fingerprint table and evidence bucket.
- **Evidence files carry third-party data** (other agencies, client staff, the candidate). Store them in Canada like candidate documents; access is audited. Disclosure to the sourcing side is withheld partly for this reason (RD-016) ⚖️.
- **French.** Québec members must get the claim, contest and resolution flow in French: the in-product copy is covered by fr-CA. The network rules governing claims and disputes are a standard-form (adhesion) contract and must be available in French first under the Charter of the French Language as amended by Bill 96 ⚖️. Admin resolutions to a Québec org should be written in French or bilingual (operational rule for admins; counsel to confirm).
- **Holidays.** Ontario and Québec statutory holidays differ (Family Day and Boxing Day vs Fête nationale and the Good Friday/Easter Monday option). RD-018 uses the union.
- **Competition Act.** Since 23 June 2023, agreements between unaffiliated employers not to solicit or hire each other's employees are criminal ([Osler backgrounder](https://www.osler.com/en/insights/updates/wage-fixing-and-no-poach-provisions-in-the-competition-act-backgrounder-and-frequently-asked-questi/)). First-presentation rules allocate *fees between agencies*; they don't stop the candidate being hired or an employer hiring. The network rules and product copy must keep that framing: the stop says "already presented", never "this candidate can't be hired" ⚖️ (counsel to confirm the network rules don't read as a no-poach between member agencies).
- **Ontario licensing (RD-010)** is unchanged by N1. Claim and dispute records will matter if a member's licence is questioned; another reason to keep them complete.

---

## 7. O-1 retention (recommendation only; user's call ⚖️)

- **Fingerprints:** keep while the referral counts as a presentation (window open) or a dispute on it is open; delete otherwise. On candidate anonymisation, delete immediately except on referrals with an open dispute. A sourcing org that anonymises a candidate gives up its first position. This is BR-21 as written; I support it.
- **Claim records** (dates, evidence type, SHA-256, note, resolution text): keep with the referral's audit history. They contain no contact identifiers.
- **Evidence files:** delete **12 months after the claim becomes final** (uncontested or resolved), unless a placement or dispute involving the same candidate and client is open. Counsel should check this against limitation periods (Ontario's basic period is 2 years; Québec civil prescription is generally 3 years) and may push it longer ⚖️.

---

## 8. Later (not this release)
- Per-org client entity; "consider for another job" for B.
- Consent-level tiebreak and "ask admins to verify the first presentation" for stopped submitters (A-3).
- Redacted evidence sharing with A; admin evidence summaries; `.eml` evidence; automatic metadata extraction.
- Look-back aligned to each job's declared ownership window (after N2).
- Fuzzy matching (L3).
- Per-province calendars; year-end slowdown rule.
- Claim retraction by B during a dispute (lighter reputation mark than "rejected").

## 9. How we'd know we're wrong
- Support tickets about wrong stops > 1 per 200 stops → identifier normalisation or scope too broad.
- Client-level hits > 30% of all hits with many complaints → client key too loose (placeholders, common names).
- Claims rejected on contest > 40% → B side abusing claims; tighten penalties.
- Contest rate < 5% of claims but sourcing orgs churn after claims → A doesn't trust the process; revisit evidence visibility (RD-016).
- Duplicate-related disputes > 1 per 100 delivered referrals after 12 weeks → exact matching misses too much; pull L3 forward.

---

## 10. Answers to brief rev. 3 questions Q-7 to Q-9 (RD-019 to RD-021)

### Q-7 Release after the fact → RD-019
**Yes.** The sourcing side may release from a `withdrawn` or `cancelled` referral, with the same roles as withdraw and the same two-step irreversible confirmation, flag and audit as BR-25.
- **Offered only when:** the referral was delivered, it still counts (inside its window, not released, no claim upheld or final), and no dispute is open on it. Otherwise the option is hidden. The hiring side still sees only "withdrawn" or "cancelled".
- **Live referrals:** release still requires withdrawing.
- **Why:** release gives up only the releaser's own position. Real release requests arrive weeks after the withdrawal. Sourcing orgs with cancelled referrals never saw a withdraw dialog, and neither did anyone who withdrew before N1.
- **Recommended extension (PM's timing):** `declined` (except while a `prior_presentation` claim is open) and `rejected` referrals. Same logic, since they also keep first position.
- **N3 note:** once N3 records a hire report on the referral's client, release must be blocked.

### Q-8 Internal end-client name → RD-020
**Normal practice. Optional in N1, required before N3.** Agencies always record the client against a job order internally. "Confidential" means not disclosed, not unrecorded. The hesitation is about trusting the platform.
- **N1:** BR-32 unchanged.
- **Job-form helper:** should tell the hiring side what it loses without a name. It gets no protection across the client's other roles, and it can't cite an earlier referral from another job as evidence.
- **Network rules:** members are expected to record the real client on referral-open jobs. The name is internal-only, and admins see it only in disputes ⚖️.
- **Before N3:** referral-open jobs need a real (non-placeholder) client name. Connector and API jobs without one can't be opened to external referrals until it's added. Otherwise "same client, any role" ownership can't be enforced, and blank names become a split-free backdoor.
- **Pull forward** if coverage is below 50% after 4 weeks.
- ⚖️ Counsel to check that internal-only storage fits typical client NDA clauses.

### Q-9 Internal referrals → RD-021
**Same rules, both directions** (BR-31 confirmed). Internal referrals stop outside partners, can be stopped by them, and can be closed, released, claimed against and cited as evidence.
- **Why the stop direction is essential:** internal referrals pay no sourcing share. If they were exempt from the stop, a hiring org could re-route an outside partner's candidate through its sister org and shed the split.
- **Should, admin-only:** record whether the earlier referral in a hit was internal. Flag a hiring org when more than half of its stops against outside partners come from internal referrals, with at least 5 such stops in 30 days **[estimate]**.
- **If that flag fires repeatedly:** require the candidate-confirmed path for internal referrals that would count against outside partners.
- **Never shown to the submitter.**

### Effect on the brief
| Q | Changes the brief? |
|---|---|
| Q-7 | Confirms the Should item. Add the guard conditions to BR-25 (delivered, still counts, no open dispute; hidden otherwise). Decide whether declined/rejected are in this release or later. |
| Q-8 | No change to N1. Two small items: the helper-text angle for the ux-writer, and a roadmap item "client name required on referral-open jobs" as a prerequisite of N3. |
| Q-9 | Confirms BR-31. Optional Should: an admin-only "earlier referral internal" attribute on the hit audit, plus the flag. |
