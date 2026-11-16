# Recruiting input: Network Rules enforcement (N10)

- **Owner:** Recruitment Strategist · **Date:** 2026-11-15 · **Answers:** brief §9.2, S-N10-1 to S-N10-6
- **Inputs:** [`brief.md`](brief.md) rev. 1, PD-053 to PD-056, [`network-rules-v1.md`](../../strategy/network-rules-v1.md), RD-016, RD-029, RD-037 to RD-043.
- **New decisions:** RD-044 to RD-049 in [`docs/strategy/decisions.md`](../../strategy/decisions.md).
- **Markers:** ⚖️ = for counsel (not legal advice). `Needs user decision` = the founder decides. **[estimate]** / **[experience-based]** = not a measured figure.

## Summary: where this differs from the PM defaults

| # | PM default | My call | Change for the brief/spec |
|---|---|---|---|
| S-N10-1 | BR-17 list of 8 | **9 categories, reworded and re-cut. Each entry point shows only the ones that fit (5 to 9 options).** Payout conduct gets its own category. A "use the right tool" block sends money, first-position and hire questions to their own flows. The "eligible for immediate hold" marker is **admin-only**. | BR-17 list and labels; UI filtering per context; admin category at triage |
| S-N10-2 | Category only | **Category only, with 4 outcomes instead of 3** ("not enough evidence" is separate). **Plus one exception:** when a 2.3 data-leak breach is found, the admin sends each org whose candidates were affected a factual incident notice (what data, when). It never names the sanction. ⚖️ | BR-23 outcome list; new admin action on 2.3 findings |
| S-N10-3 | (a) as written; (b) no freeze, escalate to suspension | (a) **confirmed.** (b) **No freeze during an immediate hold: agreed.** **But escalating to suspension doesn't contain anything**, because settlement mode (BR-34) keeps read access to received shared profiles. The containment point is the **breach finding**, not the hold. In v1, that means the incident notice (S-N10-2) and the candidate's revocation. Follow-up: a "pause received shared profiles" effect on a 2.3 finding. | Remove "escalate to suspension" as the R-5 mitigation; R-5 text; follow-up item |
| S-N10-4 | Full in-flight continuity | **Confirmed.** One addition for **terminated** orgs: an admin can close in-flight referrals that have gone stale (no activity for 60 days **[estimate]**) as cancelled, so settlement mode can't be kept open forever. The sourcing side's ownership window is unaffected. | One admin action on the terminated-org obligations list |
| S-N10-5 | Same neutral sentence | **Same sentence while the org is in settlement mode.** Once settlement mode ends, partners see **"{Org} is no longer part of the MissionHub network."** The same sentence later covers voluntary exits, so it never reveals a sanction. | BR-14 gets a second sentence for one state; QA scenario 13 changes |
| S-N10-6 | Yes, if facts and rules are unchanged | **Yes, on one condition:** every notice, immediate or not, must say that the decision can be any level up to termination. Without that line, escalation needs a new notice. Also flag an immediate hold whose decision is overdue in the admin queue (no automatic lift). | Mandatory line in BR-21/BR-28 templates; overdue flag (Should) |

---

## S-N10-1: Conduct-report categories

### How recruiters will actually use this form

Recruiters don't think in rule numbers. They think "they went around me", "they used my candidate for another job", "they never paid", "the job was fake" **[experience-based]**. In split networks, the complaints that kill partnerships are, roughly in this order:
1. unreported hires (backdoors) and slow or missing payment;
2. going around the partner to the client or candidate;
3. reusing a shared candidate for other work;
4. fake, stale or misdescribed jobs;
5. submitting candidates who never agreed (CV-bombing).

Most of these already have a **money or position tool** in the product:
- the prior-presentation claim (who was first);
- the N3 hire report (a hire happened);
- the placement dispute (an amount).

The conduct report is for the **behaviour**. It is what makes repeat offenders face the ladder. The form must say this plainly. Otherwise reporters will use it to get paid, and admins will close half the queue at triage (the brief's "more than 50% closed at triage" signal).

The PM's category 5 mixes two different things:
- job quality (4.4–4.7);
- payout behaviour (6.3–6.6).

Payout behaviour is the single biggest trust issue in splits, so it needs its own label. A repeat late payer should be visible to admins as a conduct pattern, not only as separate money disputes.

### Decision (RD-044)

**Nine categories in the server enum. The UI shows only the ones that fit the entry point and the reporter's side.** A reporter sees 5 to 9 options, never a list where half don't apply.

| # | Label (ux-writer owns final words) | Rules | Referral, reporter is **sourcing** side | Referral, reporter is **hiring** side | Partner job (opportunity detail) |
|---|---|---|---|---|---|
| 1 | They went around me to the candidate or the client | 3.1–3.6 | yes | yes | — |
| 2 | They used what I shared for something else (other jobs, their database, reposting my job) | 2.1, 2.2, 2.4–2.6 | yes | yes | — |
| 3 | They shared my information outside their organization | 2.3 | yes | yes | — |
| 4 | They didn't report a hire, or didn't pay my share on time | 6.3, 6.4, 6.6 | yes | — | — |
| 5 | False or forged information: candidate never agreed, fake confirmation, false evidence or hire report | 4.1–4.3, 4.8 | yes | yes | yes |
| 6 | The job or its terms aren't real or honest: no real opening, stale, wrong terms, pressure to change terms | 4.4–4.7, 6.1, 6.5 | yes | — | yes |
| 7 | Discrimination | 5.1, 5.2 | yes | yes | yes |
| 8 | Retaliation, public accusations or a bad-faith report | 7.1, 8.5 | yes | yes | yes |
| 9 | Something else | — | yes | yes | yes |

Rules for the product:
- **Order:** as listed, so the most frequent come first **[experience-based]**. "Something else" is always last.
- **Filtering:**
  - The server derives the reporter's side and filters the options shown.
  - The server accepts any of the 9 values. A mislabel costs nothing, because the admin relabels.
  - Filtering reveals nothing to anyone: the reporter already knows its own side.
- **"Use the right tool" block** above the categories (ux-writer owns the words). It links the actions the reporter can already take on that referral:
  - "Was your candidate already presented, or who was first?" → prior-presentation claim / contest (N1).
  - "Was your candidate hired?" → hire report (N3). Until N3 ships: referral messages, then support.
  - "Is an amount wrong or unpaid?" → placement dispute.
  - "No answer from the partner?" → there's nothing to report. Withdraw, or let the response deadline run.

  Category 4 stays available, because a **pattern** of non-payment or hiding a hire is conduct. The form says the conduct report doesn't decide the money (PD-053.2, rule 7.5).
- **Immediate-hold eligibility is admin-only.** Categories 3 and 5 sort to the top of the admin queue with a "possible 9.4" tag. **The reporter never sees that marker.** If they did, reporters would pick those categories to get a fast hold on a competitor (R-1).
- **Admin category at triage:** the admin records its own category (same enum) on the case. The §4 metrics "reports per 100 referrals, by category" and the RD-039 / RD-040 / RD-043 signals use the **admin** category. The reporter's label stays visible for the "closed at triage" signal.
- **Not categories, on purpose:**
  - unresponsiveness (SLAs handle it);
  - "they're a competitor";
  - double submission or "who was first" (the claim flow);
  - fee amount disagreements (the placement dispute).

### Alternatives rejected
- **The PM's 8 as written.** Payout behaviour is hidden inside "jobs, terms or payout", and the labels are in the rules' language rather than the reporter's.
- **Fewer, broader categories (4 or 5).** They lose the 2.3 / 4.8 triage signal and the metric granularity the RD-039 / RD-043 revisit signals need.
- **Payout conduct only in placement disputes.** A placement dispute settles one placement. It never reaches the ladder, so a serial late payer would never be sanctioned.
- **Showing the reporter which categories can trigger an immediate hold.** It invites gaming.

### Risks
- Reporters use category 4 to collect money. Mitigations:
  - the "use the right tool" block;
  - the triage close reason "an amount belongs to a placement dispute" (BR-20 c).
- Context filtering hides a category that does apply in a rare case. "Something else" plus the admin relabel cover it.

### Signal to revisit
- More than 50% of reports closed at triage, or more than 30% relabelled by the admin **[estimate]**: the labels are unclear.
- "Something else" above 20% of reports **[estimate]**: a category is missing.

---

## S-N10-2: What the reporter learns

### Decision (RD-045)

**The reporter gets the outcome category only. There are four outcomes:**

| Outcome shown to the reporter | When |
|---|---|
| **Action taken** | Breach found, with or without a sanction level (N10-D7) |
| **No breach found** | The admin found no breach |
| **Not enough evidence to act.** You can file a new report if you have new evidence. | The admin's "not enough evidence" outcome |
| **Closed without a finding**, with the BR-20 c reason | Closed at triage (no rule engaged, belongs to a placement dispute or rule 7.5, duplicate) |

- **Never shown to the reporter:** the sanction level, the finding text, the response, or whether a review was requested.
- **After a review:** if a review changes the outcome category (for example, "action taken" becomes "no breach found" when a sanction is overturned), the reporter's outcome updates and they get a notification without detail. If a review only reduces the level, nothing changes for the reporter.
- **Every outcome screen says:** "This report doesn't change your referral, your first position or any amount owed." It links the referral's normal tools. Reporters need to hear that their fee rights don't depend on the report.
- **One exception, the data-incident notice (2.3 findings) ⚖️:**
  - **When:** the admin finds a 2.3 breach (information shared outside the org).
  - **What:** the admin sends each organization whose candidates' or clients' information was shown to be shared a **factual notice**: which referral(s), what information, when, to whom if known.
  - **To whom:** every affected organization, not only the reporter, since a leak can involve several sourcing partners.
  - **What it never contains:** the sanction.
  - **Why:** those organizations hold the candidate relationship and may have their own duties. Under Québec's private-sector act, an organization that has reason to believe a confidentiality incident happened must take reasonable measures to reduce the risk of injury. Where the risk of serious injury is present, it must notify the Commission d'accès à l'information and the people concerned ([LegisQuébec P-39.1 s. 3.5](https://www.legisquebec.gouv.qc.ca/en/document/cs/P-39.1%20/20230630); [Gowling WLG on Law 25](https://gowlingwlg.com/en/insights-resources/articles/2022/how-well-do-you-know-quebec-s-law-25)). PIPEDA has a parallel breach regime. **Counsel decides** who the "enterprise" is in this chain (sourcing org, hiring org, MissionHub) and whether MissionHub itself must notify. Add it to C-4.
  - **Product:** an admin action on a "breach found" outcome citing 2.3. It sends an in-case message to selected affected orgs (an admin picks them from the parties of the referrals named in the finding). It's audited and PII-free in notifications, like BR-39.

### Rationale
- **Why not "a sanction was applied" or its level:**
  - In a network this small, a level becomes market gossip within a week **[experience-based]**. It's also a published allegation against a named competitor ⚖️ (defamation risk).
  - It would turn the conduct report into a tool for damaging competitors (R-1).
  - The level belongs to the sanctioned org and its review rights. Rule 8.4 promises "the outcome", not the sanction.
- **Why more than "closed":** reporters who hear nothing stop reporting and take it to WhatsApp groups and LinkedIn, which is exactly the public accusation rule 7.1 forbids **[experience-based]**. "Action taken" is enough to close the loop. Splitting out "not enough evidence" tells the reporter what would change the result.
- **Why the incident notice:** a sourcing recruiter whose candidate's resume was passed to another agency has to be able to tell that candidate. Hiding it to protect the leaker's sanction privacy gets the priorities backwards.

### Alternatives rejected
- **"Sanction applied: yes/no".** Close to the level in effect, and the hold becomes inferable anyway.
- **Showing the level.** Gossip, defamation and weaponisation.
- **Three outcomes (PM default).** Folding "not enough evidence" into "no breach found" tells a reporter with a true but thin case that they were wrong.
- **No incident notice.** It leaves affected orgs blind to a leak of their own candidates' data ⚖️.

### Risks
- "Action taken" plus a partner's jobs vanishing lets the reporter infer a hold. That's acceptable: it's an inference, not a disclosure, and the same disappearance happens for "rules not accepted".
- The incident notice tells several orgs a breach was found, so word will spread. That's accepted, because their candidates' data is the subject. The notice is factual and names no sanction.

### Signal to revisit
- Repeat reports on the same org and issue after "action taken" (reporters don't believe it).
- Public accusations (7.1 cases) that cite "MissionHub did nothing".
- Counsel's C-4 answer on who notifies.

---

## S-N10-3: Reading of 9.1 "accept new ones", and a 2.3 hold vs received shared profiles

### (a) Decision: N10-D4 confirmed (part of RD-046)

**"Can't accept new ones" means no new referral can reach the held org.**
- Every referral **submitted before** the hold continues in full, on both sides, including `awaiting_candidate` ones that get delivered during the hold.
- The held org can still review and accept referrals that were already delivered to it.

**Why:**
- In recruiting, "accepting a referral" is the hiring recruiter agreeing to put a delivered candidate forward. By then the shared profile is already in its hands. Blocking acceptance protects nobody's data. It only strands the sourcing partner's candidate, who then times out of a process they agreed to.
- The partner's first position survives anyway (RD-003, a declined or unanswered referral still counts), so a block wouldn't even move money. It would just make the record worse.
- "In progress starts at submission" is the glossary definition, and partners need one predictable cut-off.

### (b) Decision: no freeze during an immediate 2.3 hold, and containment happens at the finding (part of RD-046)

**During the immediate hold (before any finding):** no freeze of the held org's access to shared profiles or documents on in-flight referrals it received. **The PM default is agreed.**

**Correction to the brief's mitigation:** "escalate to suspension after the window" doesn't contain a leak. BR-34 settlement mode keeps a suspended or terminated org's read access to every in-flight referral, shared profiles included. As written, **no level of the ladder ever cuts access to received profiles.** R-5 should say so, and the mitigation should be the following.

**Containment in v1 happens at the 2.3 breach finding:**
1. **Incident notice** to affected orgs (S-N10-2, RD-045). The sourcing org can then talk to its candidate, and the candidate can **revoke authorization**, which already cuts the hiring side's access immediately.
2. The sourcing org can withdraw or release the referral as it can today. Its ownership window and first position aren't affected by doing so after a 2.3 finding.
   - **Spec check:** withdrawal must keep first position, as it does today (RD-003); only release gives it up.
   - The incident notice should say plainly: "revocation stops access; release gives up your position".
3. The admin's sanction choice (suspension or termination) handles new activity.

**Follow-up (not v1, with X11's access-expiry machinery, after N3):**
- A "pause received shared profiles" effect that the admin can choose on a 2.3 breach finding at suspension or termination level.
- It applies only to referrals where the sanctioned org is the **hiring** side.
- Each affected sourcing org then chooses per referral: resume sharing or leave it paused.
- This is the real containment tool. It belongs after a finding, not before a hearing.

**Rationale for no freeze before a finding:**
- **Little containment value.** Leaks happen by forwarding a downloaded resume to another agency or a client **[experience-based]**. By the time a report arrives, the profiles in question have usually been downloaded. A freeze can't recall them.
- **Real cost to an innocent party.** The hiring recruiter needs the resume to present the candidate to its client (the 2.3 exception). A freeze stops the process for every sourcing partner with a candidate in that org's pipeline, and those partners have done nothing wrong. Their candidates miss offers.
- **It's before a hearing.** The immediate hold is already the strongest measure allowed without notice (9.4, PD-053.3). Cutting off live candidate processes on an allegation goes beyond the closed list's intent, and partners would notice ("my referral froze"), which breaks BR-14.
- **The hold already stops new data flowing:** no new submissions, no matching, no new deliveries from new submissions. That is the containment 9.4 provides.

**Residual gap, accepted:** an `awaiting_candidate` referral submitted to the org **before** the hold can still be delivered during a 2.3 hold, which hands a fresh profile to a suspected leaker. The volume is small, the sourcing partner chose that job, and the candidate confirms. Pausing delivery would be visible to the partner and would break the "in progress continues" promise. **⚖️ counsel (C-4):** does a "reason to believe" under Law 25 s. 3.5 oblige the platform to pause these deliveries? If yes, pausing delivery on 2.3 immediate holds is the minimal change.

### Alternatives rejected
- **Automatic freeze on every 2.3 immediate hold.** It punishes innocent partners and candidates before a hearing, contains little, and is visible to partners.
- **Freezing downloads only.** It blocks the legitimate client send, so it's the same stall under another name.
- **Admin-chosen freeze at hold time.** It reintroduces a discretionary, pre-hearing measure that the closed 9.4 list was designed to avoid.
- **Blocking review and acceptance of already-delivered referrals during a hold.** No data protection gain, real harm to the partner.

### Risks
- A real leaker keeps using received profiles during the 10-business-day window. Mitigations:
  - the admin triages 2.3 reports first (queue sort, S-N10-1);
  - the incident notice follows the finding;
  - candidate revocation is available throughout.
- Counsel decides that containment before a finding is required. Then the follow-up effect moves earlier, as a 2.3-only option.

### Signal to revisit
- A confirmed 2.3 breach where further leaking happened between the hold and the decision.
- Sourcing orgs asking to be told at hold time.
- Counsel's C-4 answer.

---

## S-N10-4: Suspended org and in-flight referrals

### Decision: full in-flight continuity confirmed, plus stale-referral closing for terminated orgs (RD-047)

**A suspended or terminated org keeps every BR-13 action on referrals submitted before the sanction:** interview, offer, hire report, decline, withdraw, release, messages, payouts, refunds and disputes. This isn't limited to closing and settling.

**Why:**
- **The real-world process doesn't stop.**
  - When the suspended org is the **hiring** side: the client is its client, and the client doesn't know or care about MissionHub's sanctions. Interviews and offers will happen anyway, off-platform. Blocking them in-platform only takes them off the record. The sourcing partner loses visibility, and the hire report gets harder to verify. In recruiting, a record that goes dark is where backdoor hires happen **[experience-based]**.
  - When the suspended org is the **sourcing** side: its candidate is in the innocent partner's process. The partner advances the stages, but the sourcing recruiter has to carry the candidate through the offer: counter-offer handling, notice period, start date. If that recruiter can't message, candidates fall off at offer. That's the most expensive fall-off for everyone, and the innocent partner loses its fee.
- **"Close only" creates a perverse incentive.** The suspended hiring side would decline everything in-platform and hire off-platform. RD-003 still protects the fee, but now through a dispute instead of a clean record.
- Interviews and offers on existing referrals are not "new partner activity", which is what the ladder takes away.

**Addition for terminated orgs only:**
- **The loophole:** settlement mode lasts while any referral is in progress (BR-37). A terminated org could keep it open indefinitely by leaving accepted referrals sitting at "interview".
- **The fix:**
  - On the terminated-org obligations list, an admin can **close a stale in-flight referral as `cancelled`**.
  - Stale means no stage change, message or event for **60 days** **[estimate]**.
  - Each closure needs a reason and is audited, and both sides see the status change.
  - Cancellation keeps the ownership window (rule 6.3). The sourcing side's position is unchanged, so a later hire by that client is still owed.
- **Not for suspended orgs.** Their access ends when the suspension is lifted, so there's no loophole to close.
- **Scope:** this is an admin action, not automatic.

### Alternatives rejected
- **Close and settle only (no interview or offer).** It strands candidates, pushes the process off the record, and makes the innocent partner pay for the sanction.
- **Freezing all in-flight referrals during a suspension.** The same harm, more of it.
- **Automatic cancellation of stale referrals for terminated orgs.** Some processes legitimately pause for 2 to 3 months (budget freezes, executive searches). An admin's judgement plus the preserved window is safer.

### Risks
- A suspended org uses in-flight referrals as a back channel to keep working with partners ("let's do the next one off-platform"). That's accepted: it isn't preventable, and the off-platform relationship is the members' own business (PD-053.1).
- 60 days is wrong for executive roles. That's mitigated by admin discretion: stale is a prompt, not a trigger.

### Signal to revisit
- Partner tickets about a suspended counterpart being unable to act (should be 0).
- Terminated orgs still in settlement mode after 6 months **[estimate]**.
- Hires reported after an admin cancellation (the window did its job, but check the cancellations weren't premature).

---

## S-N10-5: What partners see for a terminated org

### Decision: neutral while settling, factual after (RD-048)

| Org state | Partner-facing sentence (job header on existing referrals, old links) |
|---|---|
| Hold, rules not accepted, network pending, suspension | "{Org} isn't taking new referrals right now." (BR-14, unchanged) |
| **Terminated, still in settlement mode** | **Same sentence.** No change on existing referrals. |
| **Terminated, settlement mode ended** (no in-flight referral or open obligation with anyone) | **"{Org} is no longer part of the MissionHub network."** |
| Voluntary exit (support-handled today, self-serve later) once its obligations are settled | The same "no longer part of" sentence |

- "No longer a member" **never states a cause**, and it's shared with voluntary exits, so it doesn't reveal a sanction.
- **Where it appears:** closed referral history, old links, any place the org's name appears to a former partner. Never in a list or a notification.
- **Reapplication:** if a terminated org is readmitted after 12 months (rule 9.7, N5), it's a member again and the sentence goes away.

**Rationale:**
- **Why not "no longer part of" from the termination date:**
  - Termination is reviewable (9.6). Telling partners before the review is decided would announce something we may reverse.
  - More importantly, a sourcing partner who reads "no longer part of" while its payout is pending will panic. It will call the client to secure its fee **[experience-based]**, which is a 3.3 breach (PD-054) and damages the hiring side's client relationship. During settlement, the commissions page, the payout status and the dispute path are the right signals, and they're unchanged.
  - By the time settlement mode ends, no partner has anything at stake with the org, the review window has long passed, and the sentence is low-risk.
- **Why not the neutral sentence forever:** "right now" becomes untrue for a terminated org. The voice-and-tone principle is never to mislead, and a former partner deciding whether to deal with that recruiter off-platform deserves an accurate status.

### Alternatives rejected
- **Neutral sentence forever (PM default).** Misleading over time.
- **"Membership terminated".** Discloses a sanction ⚖️ (defamation risk, small market).
- **"No longer a member" from the termination date.** Panic and client contact during settlement, and premature before the review.

### Risks
- Former partners guess that "no longer part of" means terminated. That's accepted: the same sentence covers voluntary exits, and it's factual.
- The extra state adds one condition to BR-14 and changes QA scenario 13 (byte-identical sentence) to "identical for every state except terminated or exited after settlement".

### Signal to revisit
- Partners asking support "is X still in the network?" during settlement (the neutral sentence is too vague).
- Any complaint from a former member about the "no longer part of" wording ⚖️.

**Needs user decision (low stakes):** this changes partner-facing copy, and the founder owns what's public about a member. My recommendation is as above.

---

## S-N10-6: Escalation on the same notice after an immediate hold

### Decision: yes, only if the notice warned of the possible outcomes (RD-049)

After an immediate hold and its 10-business-day window, the admin may decide any level, including suspension or termination, on the same notice. **Conditions:**
1. **The notice stated the stakes.** Every notice, both BR-21 and the immediate-hold notice under BR-28, must carry a fixed line (ux-writer and counsel own the words): "After the response period, we may decide no action, a warning, a network hold, a suspension or termination."
   - This should be enforced in the template: the line is not editable by the admin.
   - Without it (for example, on a legacy or malformed notice), escalation above the level already in place needs a new notice.
2. **Same facts and same rules.**
   - The decision can rely on the org's own response, including admissions, about the **same alleged conduct**.
   - New incidents or new rules need a **new notice**. The hold can stay in place meanwhile, because it lasts until lifted (BR-26).
3. **Proportionality as usual:** suspension or termination needs the "why a hold isn't enough" statement (BR-30). The decision is reviewable by a different admin (BR-31).

**Fairness guard (Should, admin-side only):**
- An immediate hold is a measure taken before a hearing.
- If no decision is recorded **10 business days after the response window closes**, the case shows as **overdue** in the admin queue and on the admin metrics card.
- There's no automatic lift: lifting a hold on a suspected leaker by timer is worse than a late decision.

**Rationale:**
- **The fairness test is whether the org knew the case and the stakes when it answered.** An org that thinks the worst case is the hold it already has may answer casually, or not at all. Then a termination on that record is a surprise, and procedural-fairness risk under the adhesion contract ⚖️ (CCQ 1375, counsel C-3).
- **Stating the stakes up front** costs one sentence and removes the reason for a second 10-day wait.
- **A second wait helps nobody.** With unchanged facts it adds no information, keeps the hold running longer, and delays the decision partners are waiting on.

### Alternatives rejected
- **Escalation always on the same notice (PM default as written).** It's fair only if the org was warned. Without the stakes line it's the weakest point of the ladder ⚖️.
- **A new notice required for any level above the hold.** A second 10 business days for no new information.
- **Automatic lift if the decision is late.** It could reward a real leaker.

### Risks
- The stakes line scares orgs facing a minor allegation. The copy should be neutral, and the same line on every notice makes it routine rather than a threat.
- Admins stretch "same facts". The review by a second admin covers this, and the finding must cite only rules named in the notice. The decision form should only offer the rules cited in the notice (spec item).

### Signal to revisit
- Reviews that reduce escalated decisions on fairness grounds.
- Overdue immediate holds above 1 in 5 **[estimate]**.
- Counsel's C-3 answer.

---

## What success looks like, by side

| Side | Success |
|---|---|
| **Reporter (sourcing or hiring recruiter)** | Files in under 2 minutes in their own words. Gets a first response within 2 business days and a clear outcome. Never loses a fee right because of a report. Hears about a leak of their own candidates. |
| **Reported org** | Knows the case, the evidence summary and the stakes before any decision (except the two 9.4 cases). Has one response and one review. Can always settle what it owes. |
| **Innocent partner of a sanctioned org** | Notices nothing on in-flight referrals. Its candidates keep moving, and payouts and refunds still work. |
| **Candidate** | Their process isn't frozen by a dispute between recruiters. Can revoke at any time. Is told by their recruiter if their data leaked. |
| **MissionHub** | Fewer public accusations. Sanctions that survive review. No money decisions. A conduct record that shows who the repeat offenders are. |

## Items for counsel ⚖️ (add to the brief's C-list)

- **C-4 addition:** in a 2.3 leak, who is the "enterprise" with Law 25 s. 3.5 / PIPEDA breach duties (sourcing org, hiring org, MissionHub)? Does MissionHub have to notify, or pause deliveries to the held org on a "reason to believe"? (S-N10-2, S-N10-3)
- **C-3 addition:** is the fixed "possible outcomes" line on every notice enough to support escalation on the same notice? (S-N10-6)
- **New:** "{Org} is no longer part of the MissionHub network" for terminated and exited orgs after settlement. Any defamation or privacy concern? (S-N10-5)
