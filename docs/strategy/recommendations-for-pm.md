# Recommendations for the product-manager

Owner: Recruitment Strategist · First version: 2026-11-12
Inputs: `market-and-positioning.md`, `product-assessment.md`, `decisions.md`.

Effort is a rough estimate inferred from the codebase:
- **S** = days: copy, config or a small RPC/UI;
- **M** = 1–3 weeks: new tables or RPCs plus UI;
- **L** = more than 3 weeks, or depends on an external vendor or partner.

Prioritisation: **Now** = needed before inviting the founding cohort (trust minimum). **Next** = needed to reach liquidity in the first niche × region cells. **Later** = expansion.

The north-star metric for the period is **verified placements per month in the corridor**. Leading indicators: % of active candidates with a Strong partner match, median job-owner first response, and platform fee collected / due.

---

## Now

### 1. Duplicate and prior-presentation protection
- **Problem:** The same person in two agencies' databases can be submitted twice to one job. Job owners can decline as `duplicate` with no evidence. This is the most common split fee fight and the classic backdoor excuse.
- **For:** sourcing recruiters (P1, P2) and job owners (P3).
- **Build:**
  - a keyed-hash fingerprint (normalized email, phone, LinkedIn) checked at submission against referrals to the same job and client, with a warning before the candidate is contacted;
  - a prior-presentation claim by B within 5 business days, with dated evidence, visible to A;
  - remove evidence-free `duplicate` declines.
- **Impact:** removes the #1 dispute category and makes "first confirmed presentation wins" enforceable.
- **Signal:** duplicate-related disputes per 100 referrals; % of `duplicate` declines with evidence; fingerprint hits.
- **RD:** RD-004 · **Effort:** M

### 2. Referral-level claims and two-sided hire reporting
- **Problem:** Ownership protection is only a date on screen. Disputes exist only after B reports a hire. A can't flag a backdoor, and only the paying party reports hires.
- **For:** sourcing recruiters, and MissionHub revenue.
- **Build:**
  - "Report a hire / raise a claim" on any referral inside the ownership window, including declined, released and withdrawn ones;
  - B must confirm (which creates the placement) or contest (which opens a referral dispute in the admin queue);
  - ownership window computed per RD-003.
- **Impact:** makes "Split placements, without the risk" credible, and protects the platform fee.
- **Signal:** claims opened and resolved; % of claims converted to placements; time to resolution.
- **RD:** RD-003, RD-009 · **Effort:** M (extends `disputes` to referrals and adds a confirm/contest RPC and state)

### 3. Job terms card, frozen into the agreement
- **Problem:** Sourcing recruiters don't see fee basis, guarantee, payment terms, exclusivity or ownership window before they submit. The guarantee is entered only at hire.
- **For:** sourcing recruiters choosing what to work on, and both sides in disputes.
- **Build:** On the job, B sets:
  - fee % and basis (base / total comp);
  - guarantee days and type (refund / replacement);
  - payment terms;
  - exclusive vs contingent;
  - ownership window (6–12 months, default 6).

  Show the card on opportunities and in the submit flow, and freeze it into `collaboration_agreements` on accept.
- **Impact:** fewer disputes, better job selection by partners, a foundation for a per-job split later.
- **Signal:** submissions per active partner job; disputes that cite terms; % of jobs with complete terms.
- **RD:** RD-003, RD-005, RD-006 · **Effort:** M

### 4. Response SLA, reminders and released referrals
- **Problem:** Nothing makes job owners respond, and black-hole submissions kill sourcing-side engagement.
- **For:** sourcing recruiters, and network health.
- **Build:**
  - business-day timers (5-day SLA);
  - reminders at 2 and 4 days (in-app now, email when the adapter exists);
  - auto-release at 10 days, with ownership still applying;
  - per-org response metrics stored for reputation.
- **Impact:** faster cycles and repeat submissions.
- **Signal:** median first response (target ≤ 3 business days); released-referral rate (< 15%).
- **RD:** RD-007 · **Effort:** S–M (the worker queue already exists)

### 5. Curated onboarding and member verification
- **Problem:** Any org can join and open jobs network-wide. There's no trust signal, and Ontario members legally need to know their partner is licensed ⚖️.
- **For:** all members; platform admins.
- **Build:**
  - application fields (business identity, references, licence numbers by province);
  - an admin approval queue in `/admin` (pattern exists);
  - a "network pending" state that keeps an org's jobs and candidates out of matching until approved (single-player features stay available);
  - a verified badge for counterparts.
- **Impact:** a trust baseline, fewer bad actors, a launch story ("verified network").
- **Signal:** approval time; disputes per approved org; % of applicants approved.
- **RD:** RD-002, RD-010 · **Effort:** M

### 6. Pricing and trust copy cleanup
- **Problem:** "Free to start" misleads, and "workspace" conflicts with the glossary.
- **For:** prospects; the ux-writer.
- **Build:** apply RD-011 now. Apply RD-012 once the user decides RD-008. Add a plain pricing FAQ (success fee only, founding rate if approved).
- **Impact:** credibility with sceptical recruiters.
- **Signal:** signup conversion; pricing questions in demos.
- **RD:** RD-008, RD-011, RD-012 · **Effort:** S

## Next

### 7. Platform invoice and collection discipline
- **Problem:** The platform fee is a remittance recorded by the payer, with no invoice, due date or consequence.
- **For:** MissionHub revenue.
- **Build (if the user approves RD-009):**
  - a MissionHub invoice record when the client payment is verified (net 15, tax fields);
  - reminders;
  - overdue > 30 days pauses new partner activity for that org;
  - an admin collections view.
- **Impact:** predictable revenue, and a signal of member health.
- **Signal:** days from client payment verified to fee received; % collected ≤ 45 days.
- **RD:** RD-009 · **Effort:** M

### 8. Partner reputation (counterpart-visible)
- **Problem:** Recruiters can't judge a partner before submitting or accepting.
- **For:** both sides.
- **Build:** on referral and opportunity screens, show:
  - median response time;
  - % of referrals answered;
  - placements completed;
  - % paid on time;
  - verified badge.

  Visible to counterparts only, never public rankings.
- **Impact:** trust compounds. Good partners attract submissions.
- **Signal:** submissions to jobs from high-reputation orgs vs others; churn of low-reputation orgs.
- **RD:** RD-007, RD-002 · **Effort:** M (depends on #4's metrics)

### 9. Private partner circles and "invite a partner to this job"
- **Problem:** Cold start. Boutiques also prefer to split with people they already trust.
- **For:** job owners (P3) and boutiques (P2); liquidity.
- **Build:**
  - per-job visibility: whole network vs selected partner orgs;
  - invite a known recruiter by email to a specific job (they join through the curated flow, fast-tracked by the inviter's reference).
- **Impact:** brings existing informal splits on-platform, and invites drive network growth.
- **Signal:** invites sent → orgs approved → first referral; share of placements from circles vs open network.
- **RD:** RD-001, RD-002 · **Effort:** M

### 10. Own-pipeline matching (single-player value)
- **Problem:** In thin weeks a new member sees no partner matches and churns.
- **For:** P1 and P2 during cold start.
- **Build:** match an org's own active candidates to its own jobs. The engine exists; today same-org pairs are excluded in `matching-service.ts`. Label these "your pipeline". No referral flow and no commission.
- **Impact:** day-one value, and keeps data fresh for network matching.
- **Signal:** weekly active orgs during their first 30 days; % of new orgs still active at day 30.
- **RD:** RD-001 · **Effort:** M

### 11. Candidate freshness and missing matching signals
- **Problem:** Stale candidates create false Strong matches and embarrassing submissions. Notice period, industry and "already interviewed at this client" aren't modeled.
- **For:** job owners (quality) and sourcing recruiters (credibility).
- **Build:**
  - last-confirmed date, with candidates dropping out of matching after N days (nudge first);
  - notice period / availability and industry as engine inputs (bump the model version);
  - optional "previous contact with client" field on the candidate.
- **Impact:** higher accept rate on referrals.
- **Signal:** submission → accept rate; decline reasons `availability` / `skills`.
- **RD:** — (product-assessment §3.8) · **Effort:** M

### 12. Québec compliance pack ⚖️
- **Problem:** Law 25 requires a PIA before transferring personal information outside Québec (OpenAI, email vendors, any non-Canadian hosting), plus notice to individuals and French-language consent.
- **For:** Québec members (the beachhead).
- **Build, with counsel:**
  - a PIA and subprocessor list;
  - the AI toggle per org, defaulting off for Québec orgs until the PIA is done;
  - finalised fr-CA consent texts (copy-audit 9.6);
  - verified data-residency statement (copy-audit 9.9).
- **Impact:** removes a launch blocker in Québec and becomes a selling point.
- **Signal:** counsel sign-off; Québec org activation rate.
- **RD:** RD-001 · **Effort:** S–M (mostly legal and copy; an org-level AI setting is small)

## Later

### 13. ATS connectors for boutiques and mid-size (Bullhorn first, then JobAdder, Loxo, Recruit CRM)
- **Problem:** P2 and P4 won't re-key data. Connectors are listed as "coming soon".
- **For:** boutique owners, mid-size agencies.
- **Impact:** unlocks the next segment and a larger supply of jobs.
- **Signal:** jobs synced per connected org; activation of connected orgs.
- **RD:** RD-001 · **Effort:** L each (vendor API terms, OAuth app registration)

### 14. Per-job partner share
- **Problem:** Exclusive or retained job owners may refuse 45/45.
- **Build:** a bounded per-job split on the terms card (e.g. 40/50 to 50/40). The platform fee stays fixed and is frozen into the agreement.
- **Signal:** jobs opened by orgs that previously kept jobs private.
- **RD:** RD-005 · **Effort:** S–M (after #3)

### 15. Cross-border corridor (Canada ↔ US remote), then Brazil domestic network
- **Problem:** Growth beyond the corridor once cells are liquid.
- **Build:**
  - **US:** salary range required for US roles (pay transparency); a currency/FX evidence rule for cross-border splits ⚖️ tax.
  - **Brazil:** a CLT/PJ job field, fee basis incl. 13th salary and bonus, SMS/WhatsApp candidate confirmation (`sms` channel exists), LGPD SCCs with vendors ⚖️, *nota fiscal* fields.
- **Impact:** new markets that reuse mobility matching and existing locales.
- **Signal:** liquidity metrics per new cell (see `market-and-positioning.md` §5).
- **RD:** RD-001 · **Effort:** L

---

## Suggested sequencing
1. **Sprint block A (trust minimum):** #1, #2, #3 in parallel where possible (#3 feeds #2's ownership window), then #4. Do #6 immediately.
2. **Sprint block B (launch gate):** #5, #12 (legal in parallel from day one, RD-010 counsel opinion too). Then invite the founding cohort.
3. **During the cohort:** #7 (if RD-009 is approved), #10, #9, #8, #11.
4. **After 20 placements:** revisit RD-001/RD-005/RD-008 with real data, then #13–#15.

## Decisions the user must make before the PM commits
- RD-008 pricing (10% list, founding 5%?)
- RD-009 platform-fee contract and collection ⚖️
- RD-010 licensing opinion ⚖️
- RD-012 pricing line on the landing page
