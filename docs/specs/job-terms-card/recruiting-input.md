# Recruiting input: Job terms card, frozen into the agreement (N2)

Owner: Recruitment Strategist · Date: 2026-11-15 · Roadmap: N2 (and the N3 prerequisites it feeds) · Decisions: **RD-022 to RD-030** ([`decisions.md`](../../strategy/decisions.md)), building on RD-003, RD-005, RD-006, RD-007, RD-015, RD-020.
⚖️ = flag for counsel, not legal advice. **[Estimate]** / **[experience-based]** = not measured; calibrate with founding-cohort data.

---

## 0. What exists today (2026-11-15, code read)

| Term | Where it lives today | Problem |
|---|---|---|
| Fee | `jobs.expected_fee_minor` + `fee_currency`. The form lets you type a % of the salary midpoint, but **only the resulting amount is stored** (`commission-fields.tsx`) | The basis (% of base, flat) is lost. A partner sees an amount that is really an estimate, and B can later claim "it was 18%, not that number". |
| Fee visibility | `jobs.share_fee` (default true), a per-job toggle | B can hide the fee from partners entirely, so A submits blind. |
| Split | `commission_rules` (45/45/10, versioned), copied into `collaboration_agreements` **at acceptance** (`create_agreement_for_referral` on `accepted`) | Frozen too late. A committed the candidate at submission, under whatever was live then. |
| Guarantee | Typed **at hire** in the report dialog (`guaranteeDays`, 0–365, default 90; `report_hire`) | The party that owes the refund picks the guarantee after the fact. This is the RD-006 dispute. |
| Payment terms, exclusivity, retainer, minimum fee | Nowhere | — |
| Ownership window | `referrals.ownership_protected_until = now() + 12 months` at delivery, hard-coded in four functions | Over-promises against most client contracts (RD-003). Not tied to any job term. |
| Hire fee | `report_hire(p_fee_minor, p_currency, …)` free entry, any of CAD/USD/EUR/GBP/BRL | No link to the job's terms. B can report any number in any currency. |
| Job edits | `jobs` rows are freely updatable, fee included, with no history | Bait-and-switch is undetectable. |
| `terms_version` | A text default `'draft-2026-11 (legal review required)'` on the agreement | Fine as the network-rules version. It isn't the job's commercial terms. |

---

## 1. How these terms really work between agencies

### 1.1 The two contracts behind every split
A split placement sits on two contracts. Mixing them up causes most terms disputes.
1. **B ↔ end client** (the fee agreement / terms of business). This sets the fee, the guarantee, the payment terms, the "introduction" window and exclusivity. Only B has it, and B often can't show it (client NDA).
2. **A ↔ B** (the split agreement). In networks this is mostly the network rules plus the job order's published terms. The job-side recruiter publishes the client's terms, and the candidate-side recruiter decides whether to work the job on that basis.

So the job-side recruiter can only promise what its client contract gives it. That's why RD-003 ties the window to B's client terms, and why RD-006 ties the guarantee to them too. The card is **B's declaration of its client contract's relevant terms**, made before A invests a candidate.

### 1.2 What mature networks require
- **Confirm the fee before submitting.** NPAworldwide: "The fee should ALWAYS be confirmed prior to submitting candidates to a client". A candidate-side partner can set a **minimum client fee**. The job-side member may not submit that candidate to a client paying less unless it gets "specific, written, ADVANCE permission" ([NPA, minimum fee](https://members.npaworldwide.com/Stories/minimum-fee-field-explained)).
- **Retainers are shared.** NPA "requires a split of the total fee, inclusive of a retainer or engagement fee". The job-order holder must clarify these before presenting the partner's candidate. Without written agreement, it owes 47.5% of its **published** fee ([NPA, retainers and engagement fees](https://members.npaworldwide.com/Stories/sharing-retainers-and-engagement-fees)). In other words, **the published terms are the default when nothing else was agreed in writing.**
- **Pay the partner when paid, fast, and don't hold for the guarantee.** NPA requires paying the partner "by the close of the next business day" after the client pays. Payment terms or a guarantee period can't justify holding the share back. For splits, "replacing a candidate is preferable to a fully refundable fee" ([NPA, paying your partners](https://members.npaworldwide.com/stories/paying-your-partners)).
- **Default 50/50 between recruiters.** NPA presumes 47.5/47.5/5 ([NPA, split arrangements](https://members.npaworldwide.com/Stories/split-fee-arrangements-between-members)). Ours is 45/45/10 (RD-005; the platform rate is RD-008, user).

### 1.3 Market ranges (for defaults and sanity checks, not rules)
| Term | Canada (ON/QC) | US | Brazil |
|---|---|---|---|
| Contingent fee | 15–25% of first-year pay; entry ~15–18%, mid ~20–22%, exec 25%+ ([IQ Partners](https://www.iqpartners.com/blog/how-do-recruitment-agencies-get-paid/), [RecruitBPM](https://recruitbpm.com/blog/recruitment-fees)) | 20–25% typical **[experience-based]** | 15–25% ([Randstad BR FAQ](https://insights.randstad.com.br/hubfs/Inbound%20program/SME/SME-CJ5%20optimized%202023/Randstad%20-%20FAQs.pdf)), up to 30% ([calculator guide](https://www.freelasemcrise.com.br/calculadoras/preco/consultor-rh)) |
| Fee base | Base salary in most contracts; some use total first-year compensation, which matters for sales and finance roles ([RecruitBPM](https://recruitbpm.com/blog/recruitment-fees)) | Base, or base + target bonus | Often **total annual pay (base + target bonus)** ([contract template](https://forms-legal.com/pt/brasil/business/services/recruitment-services-contract-brazil)). Whether the 13th salary and vacation bonus are in the base must be explicit **[experience-based]** |
| Guarantee | 30–180 days, **90 most common**, replacement as the usual remedy ([Quantum service agreement](https://quantum.ca/service-agreement)) | 60–90 days, replacement or pro-rata refund **[experience-based]** | Replacement ("reposição") at no new fee within a set period, often ~3 months ([template](https://forms-legal.com/pt/brasil/business/services/recruitment-services-contract-brazil), [guide](https://www.freelasemcrise.com.br/calculadoras/preco/consultor-rh)) |
| Invoice / client payment | Invoice at start; net days negotiated. I found no source confirming a standard "net 30" ([template](https://forms-legal.com/canada/business/contracts/recruitment-agreement-canada)) | Net 30 common **[experience-based]** | 15–30 days, against a *nota fiscal* **[experience-based]** |
| Introduction window | 6–12 months is industry standard ([IQ Partners](https://www.iqpartners.com/blog/how-do-recruitment-agencies-get-paid/)) | 6–12 months | 6–12 months **[experience-based]** |
| Retained / engaged | Small engagement fee credited against the final fee | 1/3 – 1/3 – 1/3 for exec | 1/3 upfront for exec ([template](https://forms-legal.com/pt/brasil/business/services/recruitment-services-contract-brazil)) |

### 1.4 Where trust breaks today
1. **"I didn't know the guarantee was 6 months."** A finds out at fall-off that its share reverses under a term it never saw (RD-006).
2. **"The fee was 22%, then it was 15%."** B discounts the fee to win or keep the client at offer stage, and A's share shrinks without A being asked. Sometimes B gets something in return elsewhere (a retained search, a volume deal) that A never shares in.
3. **"That was the retainer, it's not part of the fee."** The fee is restructured so the shareable part shrinks.
4. **"Our client terms are only 6 months."** The window is claimed short after the hire happened at month 8.
5. **"The client also uses two other agencies."** A didn't know the job was shared, so the candidate had already reached the client through another agency. This is legitimate, but A should have known the risk up front.

---

## 2. What the card shows and when (RD-022)

### 2.1 Required before a job can be open to partner referrals
Partners see every field below **before they submit**. None of them can be hidden from partners on a referral-open job. The `share_fee` toggle can no longer hide the terms from partners. Whether a money **estimate** is shown follows `share_salary` instead (see §2.3).

| # | Field | Values | Default |
|---|---|---|---|
| T1 | **Fee basis** | % of first-year **base salary** · % of first-year **total cash** (base + target bonus) · **flat fee** | % of base |
| T2 | **Fee rate or amount** | % (1–50) or a flat amount | none, must be entered |
| T3 | **Minimum fee** (optional, % bases only) | amount | none |
| T4 | **Fee currency** | % bases: the salary currency. Flat: declared | CAD |
| T5 | **Search type** | Contingent, exclusive · Contingent, shared (the client also uses other agencies or its own team) · Retained / engaged (part of the fee is paid upfront; the split applies to the **total** fee, RD-026) | Contingent, shared |
| T6 | **Direct client** | Attestation: "We hold the fee agreement with the end client". Required | — |
| T7 | **Guarantee** | Length: none / 30 / 60 / 90 / 120 / 180 days from the start date. Remedy: replacement only · replacement, then pro-rata refund · pro-rata refund · full refund | 90 days · replacement, then pro-rata refund |
| T8 | **Client payment terms** | Net days from the invoice (0–90); invoice issued at the start date | 30 |
| T9 | **Ownership window** | 6–12 months, whole months | 6 (RD-003) |
| T10 | **Split** | Read-only: current commission rule and version (45/45/10 today) | from `commission_rules` |
| T11 | **Real client name** | Internal-only (RD-020). Required before N3 for jobs open to external referrals (PD-023). Shown on the card only as "Client: confidential" or the name, according to `client_confidential` | — |

### 2.2 Shown on every card as fixed network rules (not per job)
- Ownership: same end client (and its affiliates ⚖️), any role, for the job's window, from delivery (RD-003).
- Prior presentation: the hiring side has 5 business days after delivery to claim it, with evidence (RD-004).
- Response: the hiring side answers within 5 business days; unanswered referrals are released after 10 (RD-007, N4).
- Partner payout: **within 5 business days of the client's payment reaching the hiring side**, not held for the guarantee (RD-027).
- Shares are **before sales tax**. Each party invoices the next with the tax that applies (GST/HST/QST in Canada; *nota fiscal* in Brazil) ⚖️ (accountant).

### 2.3 Fee estimate and salary confidentiality
- On a % basis, **rate + estimated fee** reveals the salary band (salary = fee ÷ rate). So the money estimate (fee and the partner's expected share) is shown **only when `share_salary` is on**. The rate and basis are always shown.
- Recommend `share_salary` defaults to **on** for referral-open jobs. Compensation fit is the most common reason a submission fails. Since 1 January 2026, Ontario employers with 25+ employees must publish a pay range in public postings anyway, so confidentiality arguments for Ontario roles are weaker ([DLA Piper](https://www.dlapiper.com/insights/publications/2024/12/ontario-confirms-new-regulation-addressing-pay-transparency-and-job-posting-requirements)). Several US states have similar posting laws ⚖️.

### 2.4 What can be decided later, and what can't
| Can't be negotiated after submission (frozen) | Reported at hire, with evidence, not negotiated | Never on the card (network rules, N7) |
|---|---|---|
| T1–T10, plus the client key (T11, internal) | Actual first-year base (and target bonus, on a total-cash basis); offer-accepted date; start date; invoiced fee (computed from the snapshot; any difference needs a reason, see RD-025) | Non-solicit and off-limits between members; the dispute procedure; suspension |

**No per-referral negotiation** (RD-005, PD-010). The only post-submission change is a **two-party amendment** that A explicitly accepts (RD-024).

### 2.5 Contract type
Referral-open jobs: **permanent only** at launch. Contract, temporary and contract-to-hire splits involve sharing margin, which is out of scope ("Not doing": contract/temp splits). The job form keeps the other types for private jobs. Contract-to-hire (fee on conversion) is a Later candidate if members ask.

---

## 3. What gets frozen, and when (RD-023)

### 3.1 Freeze point: when the sourcing side commits
- Each time the card changes, a new **immutable job-terms version** is created. Versions are never edited.
- The referral records the terms version **in force when the sourcing side submits**:
  - recorded-authorization path: at submission, which is also delivery;
  - candidate-confirmed path: when the candidate request is created. If B changes the terms while the request is awaiting the candidate, the referral keeps the version A submitted under.
- The **commission rule version** is frozen at the same moment (not at acceptance as today). If the platform publishes a new rule between submission and acceptance, the referral keeps the one A saw. This matters for X7 (founding rate) and any RD-008 change.
- The submit screen shows the terms A is committing under ("You're sending this candidate under these terms"). That snapshot is what gets stored, not a later read of the job.
- The **client key** is frozen with the snapshot (internal-only). A later rename of the job's client, or flipping it to "confidential", can't move the referral out of "same end client" scope (abuse A-6).
- The ownership date = **delivery time + the snapshot's window** (T9). First position is still timed at delivery (RD-004.1). Two different moments, on purpose: terms protect A's decision, delivery protects the race.

### 3.2 At acceptance
`create_agreement_for_referral` **copies the referral's snapshot** (split and terms) into the agreement. It doesn't read the live job or the current default rule. A's agreement confirmation confirms those same terms, so the agreement can never show different terms from what A submitted under.

### 3.3 At hire
- The guarantee length and remedy come **from the snapshot**. The hire dialog shows them read-only. The free `guaranteeDays` field goes away.
- The currency comes from the snapshot. The free currency picker goes away.
- On a % basis, B enters the actual first-year base (plus target bonus on a total-cash basis) and the fee is computed: rate × base, at least the minimum fee. On a flat basis, the fee is the frozen amount. B may record a different invoiced amount only with a reason (RD-025).
- Guarantee end = start date + the snapshot's length.

### 3.4 Existing referrals (pre-N2)
- They keep their 12-month ownership date (RD-003, PD-009).
- They have no terms snapshot. They're labelled "terms not recorded (sent before the terms card)", and the hire dialog keeps today's free entry for them only.
- Pre-launch, these should all be test data. No migration should invent terms for them.

### 3.5 Existing jobs
A job open to partner referrals without a complete card stops being visible to partners until the card is completed. Pre-launch, this costs a few test jobs. The UI should nudge owners to complete it.

---

## 4. Terms changes once referrals exist (RD-024)
1. **New terms apply to new submissions only.** Every referral already submitted (any status, including withdrawn) keeps its snapshot.
2. **Partners with a live referral on the job are told** that the terms changed and that their referrals keep the terms they were sent under. Partners browsing the job see a "terms updated on {date}" line for 30 days.
3. **Amendments to an existing referral** (for example, the client renegotiated the fee mid-search) need **A's explicit acceptance**. They're recorded as a new agreement version, with a reason, and audited. A can refuse, and the snapshot stands. The hiring side can't make acceptance a condition of moving the candidate forward (network rule ⚖️).
   - **Build order:** in N2 the snapshot is immutable, and a mutually agreed amendment is recorded by a platform admin when both orgs ask in writing (concierge). An in-product two-party amendment flow is Later, built only if amendments become frequent (> 1 per 20 accepted referrals **[estimate]**).
4. **Admin flags (Should):** a job whose fee rate or guarantee gets **worse for partners within 30 days after it received a referral**, or whose terms change more than twice in 30 days. Flag only, no automatic action.
5. **Close and repost doesn't reset anything.** Snapshots and client-scope ownership survive, because ownership is per client, not per job.

---

## 5. Edge cases recruiters will hit

| # | Case | Rule |
|---|---|---|
| E-1 | **% of base vs flat** | T1 declares it. % bases compute from the actual base at hire. Flat fees are fixed whatever the salary. Minimum fee (T3) applies to % bases only. |
| E-2 | **Total cash vs base** | On "total cash", the base for the fee = annual base + **target** bonus in the offer. Equity, benefits, signing bonus and relocation are excluded unless B's card says otherwise in a note (Later). Brazil: say whether the 13th salary and the 1/3 vacation bonus are in the base (fr/pt helper text). |
| E-3 | **Salary outside the band at hire** | No issue: % bases use the actual base. A large drop below the band's minimum (> 20% **[estimate]**) shows the sourcing side both numbers and allows a dispute. |
| E-4 | **Currency** | One currency per snapshot. On % bases, fee currency = salary currency (a USD-paid remote role has a USD fee). MissionHub never converts. If the client pays in another currency, B records the converted amount actually received, and the split applies to that. FX difference is B's risk on flat fees and shared pro rata on % fees **[experience-based]**. |
| E-5 | **Retainer / engagement fee** | Split on the **total** fee, retainer included, when T5 = retained/engaged (RD-026). An upfront portion invoiced before the referral was delivered is still part of the total for the split (NPA norm). Per-job share adjustment for retained owners (40/50) is L2 (RD-005). |
| E-6 | **Replacement vs refund (RD-006)** | The snapshot's remedy decides. Replacement: shares stand, no new fee, A has first right for 10 business days. Refund: all shares reverse pro rata, only up to what the **snapshot's** guarantee allows. If B refunds more, or later than the snapshot permits (for example, it granted the client a longer guarantee), the extra is B's alone. Fall-off flow is X6 (PD-007). |
| E-7 | **No guarantee** | Allowed ("none"). Shown prominently, because it raises B's risk, not A's. |
| E-8 | **Confidential client** | Partners see "Client: confidential" plus location, seniority and the terms. Industry and size band are a Should. The real name is frozen internally (T11). A hire report naming a different employer is matched server-side against the frozen key. A never learns the client from a match (see RD-030). |
| E-9 | **Exclusive vs shared contingent** | Shared jobs carry the risk that the client already had the candidate through another agency. B can claim prior presentation within 5 business days with evidence, including the other agency's earlier submission to the client (RD-004: "the job owner or its client"). Exclusive jobs make that rare. Declaring "exclusive" falsely is a network-rules breach if it surfaces in a dispute. |
| E-10 | **Hire into a different role at the same client** (RD-003 "any role") | The referral's frozen terms apply, computed on the actual base of the role hired. |
| E-11 | **Hire by an affiliate, or as a contractor / PJ / through an EOR or another agency** | Counts as a hire for ownership. On % bases, the base is the annualised fixed pay ⚖️ (clause wording). Brazil: a "permanent" role filled as PJ is common and must not escape the split. |
| E-12 | **Multiple openings** | Each hire is its own placement under its own referral's snapshot. |
| E-13 | **B's client doesn't pay (bad debt)** | Paid when paid: A's share is due only on client money received (the ledger already works this way). The shortfall is shared pro rata. |
| E-14 | **B lost the client before the hire** | B's own client contract window decides what B can collect. That's why the window equals B's client terms (RD-003). |
| E-15 | **Internal referrals (related orgs)** | Same snapshot mechanics for the record, with no sourcing share (RD-005, RD-021). |
| E-16 | **B is itself a sub-vendor** (another agency's job) | Not allowed on referral-open jobs (T6). Re-brokered jobs create fee chains no one can verify. |
| E-17 | **Counter-offer or fall-off before the start date** | No hire, no fee. The referral returns to the normal flow. |
| E-18 | **Window and look-back** | The ownership window and the prior-presentation look-back (today a fixed 6 months, N1 BR-12) both use the snapshot's window (RD-028). |

---

## 6. Abuse cases

| # | Abuse | Who | Product defence |
|---|---|---|---|
| A-1 | **Bait-and-switch fee:** advertise 25% to attract candidates, lower it after seeing them | B | Snapshot at A's commit; partners notified; worsening-after-referral flag (RD-023, RD-024) |
| A-2 | **Discount at offer:** B cuts the client fee to close and reports the lower fee | B | Frozen fee is the basis for **A's share** unless A agreed in writing beforehand; a reported difference needs a reason; A can dispute (RD-025) |
| A-3 | **Fee restructuring:** move part of the fee into a "retainer", "consulting" or another deal with the client | B | Split on the total fee including retainers (RD-026). A disguised fee is a network-rules breach; admins can ask for the client invoice in a dispute |
| A-4 | **Guarantee inflation:** declare 30 days, then refund under a 6-month guarantee and reverse A's share | B | Reversals are limited to the snapshot's guarantee (E-6) |
| A-5 | **Short window:** declare 6 months when the client contract gives 12 | B | 6-month floor (RD-003). Network rule: the window must not be shorter than B's client terms ⚖️. Admins may ask for the clause in a dispute. Signal: hires in months 7–12 after a 6-month window |
| A-6 | **Client rename:** rename the client or mark it confidential after the referral to slip out of client scope | B | Client key frozen in the snapshot (§3.1) |
| A-7 | **Close and repost** to reset terms or ownership | B | Snapshots and client scope survive (§4.5) |
| A-8 | **Low reported base:** hide the salary, then report a low base at hire | B | Base at hire is reported with an attestation. In a dispute, admins may require an offer-letter excerpt (base only). E-3 alerts A |
| A-9 | **CV harvesting:** attractive terms to pull profiles, never accepting through the split | B | Anonymised counts until submission (existing). RD-007 SLA. Flag jobs with ≥ 10 received referrals and 0 accepts in 60 days **[estimate]** |
| A-10 | **False "exclusive"** to justify a lower share later | B | No share variation until L2. Breach if it surfaces |
| A-11 | **Pressure to amend:** "accept 15% or the candidate doesn't move forward" | B | An amendment needs A's acceptance. The network rule forbids conditioning ⚖️. A can open a dispute. Watch amendment frequency per hiring org |
| A-12 | **False hire reports** to harass or fish for confidential clients | A | RD-030: attestation, evidence, rate limit, rejected-report tracking |
| A-13 | **Recruiter-controlled candidate email** to fake a confirmation | A | RD-029: counts, but is evidenced and challengeable; voided if invalid |

---

## 7. Rules the product must enforce (for the brief)
1. A referral-open job has a complete card (T1–T9, T6 attested). Partners always see T1–T10.
2. Terms versions are immutable. A referral stores the terms version and commission-rule version from the moment the sourcing side commits, plus the frozen client key.
3. The agreement is created from the referral's snapshot, never from the live job or the current default rule.
4. `ownership_protected_until` = delivery + the snapshot window, for new referrals only. Existing referrals are unchanged.
5. The hire report takes the guarantee and currency from the snapshot. The fee is computed from the snapshot and the reported base. A different invoiced amount needs a reason and notifies the sourcing side (RD-025).
6. A terms change never alters an existing snapshot. Partners with live referrals are notified.
7. Referral-open jobs are permanent only.
8. The prior-presentation look-back uses the snapshot window.
9. All card labels and the frozen terms render in en, fr-CA and pt-BR from structured fields (no free text in the snapshot except an optional note, Later).

---

## 8. What success looks like
- **Sourcing side (A):** chooses jobs on known economics. No surprise at hire or fall-off. Metric: submissions per active partner job; "terms" as a decline or dispute reason → near 0.
- **Hiring side (B):** declares once, in a structured way. Fewer "you never told me" fights. Metric: % of partner jobs with complete terms (100% by construction for new jobs); time to complete the card (< 2 minutes **[estimate]**).
- **Candidate:** unaffected. The fee is never shown to candidates.
- **MissionHub:** disputes citing terms per 100 accepted referrals (target < 2 **[estimate]**); share of jobs declaring a window other than 6 months (RD-003 signal: > 20% suggests a different default).

---

## 9. Local and global notes
- **Québec** ⚖️: the card and frozen terms must exist in French. For Québec parties, the collaboration agreement and network rules likely must be offered in French first (Charter of the French language as amended in 2022; contracts of adhesion). The amendment rule and the "share floored at frozen terms" rule should be checked against Civil Code rules on contracts of adhesion and abusive clauses. CNESST licensing scope is under RD-010. QST applies to shares invoiced between Québec registrants (accountant).
- **Ontario** ⚖️: ESA recruiter licensing (RD-010). Pay-range posting rules since 2026-01-01 (§2.3).
- **US (Later, L4):** fees 20–25%; guarantees 60–90 days. State pay-transparency laws affect salary visibility. Agency-to-agency non-solicit clauses are common. At-will employment means more early fall-offs, so the guarantee remedy matters more. Currency USD. Cross-border CAD↔USD: E-4.
- **Brazil (Later, L4):** fee often on total annual pay. State the 13th salary and vacation bonus treatment (E-2). PJ engagements count as hires (E-11). Each party issues a *nota fiscal* for its share. LGPD applies to evidence files. Currency BRL. Replacement-first guarantees are the norm, which fits RD-006(b).

---

## 10. Answers to the pre-N3 questions (summary; full entries in `decisions.md`)

### Q-1 → RD-029: recently changed email or recently created candidate record
**A confirmation counts** for first position and fee entitlement, with no downgrade and no waiting period.
- **Why:** creating a record and getting the candidate's consent on the same day is the **normal** fresh-sourcing flow: you find someone, call them and submit. Imports and connector syncs also create "new" records for people an agency has known for years, and candidates often switch from a work email to a personal one. A rule keyed on recency would mostly hit honest recruiters. Downgrading to "recorded authorization" changes nothing, because both count equally for first position (RD-003), so it would neither deter nor protect anyone.
- **What instead:**
  1. **Evidence:** the consent line also notes "Candidate record created on {date}" when it was created in the 30 days before the link was issued (same window as BR-12). Visible to the source org and to platform admins. **Not shown to the hiring side.**
  2. **Challenge path (N3, Must):** an admin authorization check, which can be requested by a stopped submitter (via the PD-025 support path, without learning who was first), by the candidate, or by the hiring side in a claim or hire dispute. If the confirmation carries a recent-change note, or the challenger brings evidence, the source org has **5 business days** to give independent right-to-represent evidence: the candidate's own dated message from a channel other than the confirmation mailbox. The admin may also contact the candidate through an identifier the source org didn't set.
  3. **If invalid** (the candidate denies it, the mailbox is recruiter-controlled, or the source org doesn't answer): the presentation is **void**, with no first position and no fee, the same effect as an upheld claim. The consent record is marked disputed and the case goes to RD-002 breach review. It isn't converted into a recorded authorization, because no honest attestation was ever made.
  4. **Cheap guard (Should):** refuse a confirmation destination that equals a source-org member's email or sits on the source org's own verified domain (not on freemail domains).
- **Market practice:** right-to-represent in agency and vendor-portal recruiting is a dated written statement from the candidate (an email reply or an e-signed RTR form) naming the agency, the client and the role. No one verifies who owns the mailbox. Disputes are settled after the fact by asking the candidate and checking the dated paper trail **[experience-based]**. MissionHub's server-issued link already exceeds that. The mailbox gap is closed the way the market closes it: after the fact, by asking the candidate, with voiding as the penalty.

### S-1 → RD-030: sourcing-side hire report
- **Who can report, and on what:** the sourcing org, on any delivered referral that **still counts**: submitted, info requested, accepted, interview, offer (if B hasn't reported), declined (except through an upheld or final prior-presentation claim), rejected, cancelled, released by SLA, **and withdrawn** (yes, the same as declined and released, per RD-015), unless the sourcing side released the candidate. Not on `already_presented`, `awaiting_candidate`, `candidate_declined`, or explicitly released referrals.
- **What the sourcing side must provide:**
  - the employer as the sourcing side knows it;
  - the approximate start month, and the role if known;
  - how it learned of the hire;
  - **at least one dated evidence item**: the candidate's written word (message or email), a public profile change (screenshot with URL and capture date), a company announcement, or other;
  - an attestation.
  - An offer letter is **not** required. A backdoor victim rarely has one, and it's sensitive personal data.
- **Visibility:** B sees the statement, the evidence type and dates, and the hash. The files are for admins only, symmetric with RD-016 (they're often the candidate's private messages).
- **Hiring side:** **10 business days** to confirm or contest (RD-018 calendar), with reminders at 5 and 8.
  - **Confirm:** complete the hire report from the snapshot.
  - **Contest:** pick a reason, attest, and add evidence where it's provable:
    - not hired by the client or its affiliates (attestation; admin may ask for more);
    - offer accepted outside the window (dated evidence required);
    - different person;
    - the employer isn't this referral's client. The sourcing side learns only "not this client", never the name.
  - The "we already had them" reason isn't available after the 5-day prior-presentation window (RD-004.3).
- **Silence:** after 10 business days without a response, the hire is **deemed confirmed**. A referral dispute opens automatically for the fee details. Recommended (Should): pause B's new partner jobs until the fee details are recorded.
- **Timing:** the hire counts if the offer was accepted (or, if that date is unknown, employment started) within the ownership window. The sourcing side can report until 6 months after the window ends ⚖️ (statutory limitation periods are longer and stay available off-platform).
- **Anti-abuse:** a rate limit on reports per org. Two rejected reports in 90 days flag the sourcing org for admin review. A fabricated report is an RD-002 breach. RD-019 already blocks release while a hire report is pending on the referral's client.

---

## 11. Needs user decision
- **RD-025 (b):** when B discounts the fee without A's prior written consent, A's share is computed on the frozen terms. Should **MissionHub's platform share** also be computed on the frozen terms, or on the fee actually collected? **Recommendation: on the fee actually collected.** MissionHub shouldn't profit from a penalty between members, and staying neutral helps in disputes. This is a revenue question, so it goes to the user (with RD-008/RD-009).
- **Counsel ⚖️** (for N7, not blocking the build): the clause wording for frozen terms, the amendment rule and the ban on conditioning; "client and its affiliates"; contractor/PJ/EOR hires counting as hires; the window not being shorter than B's client terms; the 6-month reporting tail; French-first agreement for Québec parties; sales tax on shares.
- **Update 2026-11-15:** RD-025 (b) was decided by the user: the platform share is on the fee **collected** (PD-049, brief U-1).

---

## 12. Answers to the brief's strategist questions (S-N2-1 to S-N2-5)

| Q | Answer | Decision | BR impact |
|---|---|---|---|
| S-N2-1 | **Floor, not cap.** A's share is on max(C, I); when B invoices more, A shares the upside. I is this hire's placement fee only (retainer included, separate services excluded). | RD-031 | None (confirms BR-27) |
| S-N2-2 | List confirmed (a longer guarantee **is** worse for A: longer reversal exposure). **Add:** any basis change except base → total cash (flat ↔ % can't be compared); flat currency changed; longer net payment days; search type order retained > exclusive > shared. **Timing:** within 30 days after **any** delivered referral, not just the first. | RD-032 | **Changes BR-39** |
| S-N2-3 | **Both keys.** Ownership scope = union of the commit key and the delivery key; N3 hire matching checks either. Renames after delivery change nothing. N1 keeps the delivery key only. | RD-033 | None in N2 (input to N3) |
| S-N2-4 | **Accepted for N2.** FX on the invoice itself is already B's through the floor; only invoice-to-receipt drift is shared pro rata, like any short payment. Add "client invoiced in another currency" to the I ≠ C reasons. Watch for post-hire credit notes used to dodge the floor. | RD-034 | None (spec reason list only) |
| S-N2-5 | **Confirmed: before the hire only.** After the hire, a fee cut A agrees to is a dispute settlement with both orgs' written agreement, not a terms amendment. | RD-035 | None (confirms BR-29, BR-34) |

**E-4 restated (replaces "FX difference is B's risk on flat fees"):** on a flat fee, the FX effect of B invoicing its client in a currency other than the card's is B's, enforced by the floor when it makes I < C. The movement between invoice and receipt is shared pro rata like any collection shortfall (E-13), in both directions.

**Edge case added (E-19), post-hire credit note:** B reports I = C, then grants its client a credit note, so the lower payment looks like non-payment and is shared pro rata. That is the A-2 discount moved past the hire. A sees I and every payment and can dispute. A credit note granted without a guarantee or collection reason is B's alone. Today an upheld dispute can't adjust allocations (`resolve_dispute` only closes the dispute), so that's for X6 / X1, together with a "short-paid" marker.
