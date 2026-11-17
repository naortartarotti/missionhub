# Market and positioning

Owner: Recruitment Strategist · First version: 2026-11-12 · Status: initial analysis, to be revisited after the first 20 live placements.

> Conventions: **[Source]** = cited, **[Estimate]** = my judgement from industry experience, not measured data. Vendor figures come mostly from the vendors' own marketing or third-party aggregators. They are labelled as such and should be re-checked before they're used in sales material. ⚖️ = needs counsel. Nothing here is legal advice.

---

## 1. The job Workatent does

Every agency recruiter has two kinds of waste:

1. **Orphan candidates.** These are good, interested people who don't fit any of the recruiter's own open roles. They go stale in the ATS.
2. **Orphan jobs.** These are roles the recruiter won but can't fill fast enough, usually in a niche or location outside their network.

A split placement turns both into revenue. One recruiter has the candidate, another has the job, and they share the fee. Splits have existed for decades, through formal networks (Top Echelon, NPAworldwide) and, far more often, through informal LinkedIn and WhatsApp groups and personal relationships. **[Estimate]** The informal channel is Workatent's real incumbent. Most splits in Canada happen between recruiters who already know each other, on a handshake or a one-page email agreement.

The work is always the same, and recruiters always hate it:
- finding a counterpart;
- trusting them, both to get paid and not to be backdoored;
- agreeing terms;
- avoiding double submissions;
- chasing feedback;
- chasing money.

Workatent's product already automates the first step (matching) and makes the trust steps *recordable*: authorization, frozen agreements, an immutable ledger and an audit trail. It doesn't yet make them *enforceable* (see `product-assessment.md`).

## 2. Market map

### 2.1 Categories

| Category | Who | Model | Relevance to Workatent |
|---|---|---|---|
| **Recruiter-to-recruiter split networks (membership)** | Top Echelon (US), NPAworldwide (global, member-owned), Recruit Alliance (US), SplitFee (UK) | Monthly dues and/or a brokerage % per split. Vetted membership. Shared job and candidate boards. | **Direct competitors.** Same buyer, same job. |
| **Employer-to-agency vendor marketplaces** | BountyJobs, Paraform, Hunt Club, RecruitiFi | The employer posts a role (sometimes with a listing fee). Many agencies or freelance recruiters compete. The platform takes a cut. | Adjacent. They compete for the *job side* (they bring employer demand) and set recruiter expectations on ownership windows and guarantees. |
| **Managed recruiting capacity** | Recruiter.com (legacy) | Started as a split marketplace, then pivoted to selling recruiter capacity and AI sourcing. Assets were sold to Job Mobz in 2024. | **Cautionary tale.** A split marketplace that couldn't sustain liquidity and moved toward employer-paid services. |
| **ATS / recruiting CRMs** | Bullhorn, Loxo, Recruit CRM, Manatal, JobAdder, Vincere, Zoho Recruit | SaaS per seat | Systems of record, not split networks. The Bullhorn Marketplace is an integration catalogue, not a split network (I found no recruiter-to-recruiter placement feature). **Partners via connectors, not competitors**, unless Workatent drifts into being an ATS. |
| **Informal splits** | LinkedIn groups, WhatsApp groups, personal partnerships | Handshake, usually 50/50 | **The real incumbent.** Free and trusted, but unprotected, unrecorded and hard to scale. |

### 2.2 Competitor snapshot

| Player | Economics | Ownership / guarantee | Strengths | Weaknesses vs Workatent |
|---|---|---|---|---|
| **Top Echelon** (US) | 50/50 split. Each side pays a 3% brokerage fee to the network, so each recruiter keeps 47%. Monthly membership was about US$130 in an old (2017-era) post. **[Source: Top Echelon blog; price outdated]** | Network policies, including a no-contact period after placement and a "but for" causation test for disputes. **[Source: Top Echelon policies post]** | Decades of history, a vetted membership, published dispute rules and payment-protection reputation. | US-centric and English-only. Job orders and candidates are marketed openly inside the network, so they aren't privacy-first. Manual matching. Subscription plus fee. |
| **NPAworldwide** | Member-owned. Dues not public. **[Source: NPA site]** | Bylaws: a split applies when the candidate firm was the "procuring cause". No separate split agreement is needed because members agree to network policies. **[Source: NPA]** | Global (about 1,200 recruiters in 30 countries, per its own press release). Strong governance and member vetting (independent firms, two references, board approval). | Club-like and slow to join. Older tooling. Dues before value. |
| **SplitFee** (UK) | Reportedly **45/45/10**, the platform fee only on placement, plus a reported £97/month tier. **[Source: aggregator listing, unverified]** | n/a | Same split structure as Workatent. Shows that 45/45/10 is a model the market can read. | UK only. Young and small. |
| **Recruit Alliance** (US) | About US$75/month after a free trial. **[Source: vendor page]** | Honor period (KB article) | Cheap | Thin liquidity, basic tooling. |
| **BountyJobs** | Reportedly 5% of the placement fee charged by the platform. **[Source: vendor page, conflicting third-party figures]** | Six-month candidate ownership window, 60-day guarantee. **[Source: third-party summary]** | Brings employer demand. Standardised terms. | Employer-to-agency, not recruiter-to-recruiter. Agencies compete rather than collaborate. |
| **Paraform** | Employer fee about 20–25% of first-year salary, plus a job listing fee. Take rate not published. Recruiters reportedly keep about 70%. **[Source: Paraform's own pages and competitor blogs; estimate]** | 90-day guarantee with installment payments (per a competitor comparison) | Strong employer demand in US startups. A slick freelance-recruiter supply side. | US tech startups only. The platform owns the client relationship, which recruiters with their own clients won't accept. |

### 2.3 Fee norms the product must respect

| Market | Typical contingency fee | Guarantee norm | Notes |
|---|---|---|---|
| **Canada** | 15–25% of first-year base. Executive search 20–30%+. **[Source: IQ Partners, Manatal, RecruitBPM]** | 30–90 days, by refund (often pro-rata) or replacement. **[Source: general guides; no Canadian survey found]** | Fee basis varies (base, total cash, total comp). Invoices are usually due on the start date, net 30. **[Estimate]** |
| **US** | 20–30%. Top Echelon reports a network average of about 22.5%, around US$20k per placement. **[Source: Top Echelon]** | 60–90 days | Most crowded split market. |
| **Brazil** | 15–35% of annual compensation, often including target bonus. **[Source: Randstad BR FAQ, contract templates, industry blogs]** | Often a three-month replacement without new fees. **[Source: consultancy listing]** | Annual comp includes the 13th salary and often bonus. CLT vs PJ changes the "salary" definition. Invoicing needs a *nota fiscal*. |
| **Split norm** | 50/50 between candidate side and job side is the default everywhere I've worked. Networks take 0–6% (Top Echelon) or ~10% (SplitFee). | | Workatent's 45/45/10 is a 50/50 with the platform fee taken equally from both sides. That's readable, but **10% is at the top of the range** for a recruiter-to-recruiter network. |

**Implication.** On a C$100k role at 20%, a C$20k fee pays each recruiter C$9k and Workatent C$2k. Under Top Echelon's model each recruiter keeps C$9.4k and pays dues. A 10% platform fee holds up only if Workatent gives clearly more than a job board: privacy, matching, enforcement and payment discipline. See RD-008.

## 3. Where Workatent wins and loses

### Wins (real today, in the code)
1. **Privacy-first matching.** Partners see anonymized match counts. A candidate is revealed only through a submission authorized for a specific job, ideally confirmed by the candidate on their own link (`referral_candidate_requests`). Networks market candidates and job orders openly. For agencies afraid of being poached, and in Québec under Law 25 or Brazil under LGPD, this is a genuine differentiator.
2. **Automatic, two-way matching.** Recruiters don't browse a board. Their candidates surface against partner jobs, and job owners see "3 partner candidates fit" before anyone shares a name. That removes the most time-consuming step of splitting.
3. **Auditable money trail.** Frozen collaboration agreements, an immutable commission ledger, four-eyes verification and disputes that freeze the placement. Informal splits have none of this.
4. **Anti-gaming built in.** Referrals between related organizations (orgs that share a member) are `internal` and pay no sourcing commission, so nobody can collect both halves.
5. **Cross-border readiness in the data model.** Mobility, relocation scope, work authorization and visa sponsorship are matching inputs (`deterministic-v3`). Multi-currency is supported. The UI is trilingual (en, fr-CA, pt-BR). No split network I found offers native fr-CA.
6. **Low-effort supply.** Connectors (ATS job boards, spreadsheets) and a public API mirror an agency's jobs and candidates without re-keying. Resume and job import also work with AI.
7. **No subscription.** That's an easy yes for independents.

### Losses (today)
1. **No liquidity, brand or track record.** Networks sell "you'll get paid", backed by decades of history. Workatent can't yet.
2. **No member vetting.** Any org can open jobs to the whole network. Top Echelon and NPA screen members, and that screening *is* their trust product.
3. **Ownership and backdoor protection is displayed, not enforced.** The 12-month "ownership protected" date has no mechanism behind it. Disputes exist only once a hire is reported. See `product-assessment.md` §3.
4. **Platform revenue depends on the honesty of the party that owes it.** Only the job owner reports the hire. No funds move through Workatent, so the platform fee is a remittance Workatent has to chase.
5. **The fee is higher than Top Echelon's 6%** and there's no reputation layer to justify it yet.
6. **No employer demand generation.** Paraform and BountyJobs bring jobs. Workatent depends on recruiters bringing them.

## 4. Wedge: who to win first

**Decision (RD-001):** start with **independent recruiters and boutique agencies of 1–15 recruiters in Canada**. The beachhead is the **Montréal–Toronto corridor** (Québec and Ontario), in three niches:
- **Software and data/AI**: high fees, plenty of remote and hybrid work, and mobility matters;
- **Finance and accounting**: high volume, standardised skills that match well, and many boutiques;
- **Bilingual (FR/EN) professional roles**: a Québec-specific pain that US/UK networks can't serve.

Why this segment:
- **Independents and boutiques feel both pains hardest.** They have no internal desk to pass orphan candidates to, and no BD capacity to win more jobs. Splits are already part of how they work, informally.
- **They decide in a day.** The owner is the buyer and the user. Mid-size agencies (50+ recruiters) have internal split policies, ATS lock-in (Bullhorn), procurement and legal review. They come later, through ATS connectors.
- **Québec and Ontario together are a defensible start.** Bilingual product, Law 25-grade consent and Canadian hosting give Workatent a moat in Québec. Toronto supplies the job volume. The corridor shares clients, so cross-province splits happen naturally.
- **The niches are where matching works best.** Skills, seniority and salary are explicit, so deterministic matching performs well. Healthcare, construction and trades bring licensing, union and temp-staffing complexity. Executive search is relationship-driven, retained, and resists anonymized matching.

**Not first:**
- Mid-size and enterprise agencies (they need Bullhorn and similar integrations, SSO, reporting);
- the US (crowded, and Top Echelon and NPA are entrenched);
- Brazil (LGPD transfers, *nota fiscal* and PJ/CLT; pt-BR is already built, so it's the natural market #3);
- contract and temp staffing splits (timesheets and margin splits are a different product);
- employers as users.

## 5. Cold start and liquidity plan

A split marketplace has value only when a recruiter's candidates find partner jobs. The scarce side is **good jobs with responsive owners**. **[Estimate]** Candidates are abundant: every recruiter has hundreds of idle profiles. So: **seed jobs first, measure liquidity by niche × region, and never launch a niche without a minimum job density.**

| Phase | Goal | Actions | Exit signal |
|---|---|---|---|
| **0. Founding cohort** (about 8–12 weeks) | 30–50 vetted orgs in the corridor, 150+ active jobs in the three niches | Hand-recruit from the founder's network and LinkedIn split groups. Founding-member terms (reduced platform fee, see RD-008). White-glove onboarding: connect their ATS job board so *all* their jobs mirror in minutes (connector exists). Commit each founding org to opening at least 3 jobs to partners. | ≥ 60% of founding orgs have at least 1 Strong match on a partner job within 14 days of joining |
| **1. First placements** | 10–20 placements, every payment collected | Run the first referrals as a concierge: chase responses, mediate. Publish anonymised success stories with consent. Track time to first response. | Median job-owner first response ≤ 3 business days. ≥ 1 placement per 25 referrals **[Estimate: target to validate]**. Zero unresolved fee disputes. |
| **2. Density by niche** | Open membership by invitation (members invite partners they already split with) | "Invite a partner to this job" (private circles, see recommendations). Referral credits for invites that become active. | Each niche × region cell has ≥ 50 active jobs and ≥ 500 active candidates **[Estimate: threshold to calibrate]** |
| **3. Expand** | New niche or region only when the current cells are liquid | Next: rest of Canada (Vancouver, Calgary), then the Canada→US remote/cross-border corridor, then Brazil (domestic network) | Liquidity metrics per cell (below) |

**Liquidity metrics per niche × region (weekly):**
- % of active candidates with ≥ 1 Strong partner match;
- % of active partner jobs with ≥ 1 Strong match;
- submission → accept rate;
- median time to first job-owner action;
- accepted → hire rate;
- hire → client payment verified (days);
- platform fee collected / due.

**Single-player value, so members stay during thin weeks.** Candidate and job import, resume parsing, the pipeline board and connectors are useful on their own. The cheapest next hook is *matching your own candidates to your own jobs*. Today the engine excludes same-org pairs (`neq("organization_id", …)` in `matching-service.ts`). Single-player value must never become "build a full ATS" (see `product-assessment.md` §6).

## 6. Positioning statement

> **For** independent and boutique recruiters in Canada **who** have great candidates that don't fit their own roles and roles they can't fill alone, **Workatent is** a private referral network **that** matches your candidates to trusted partners' open jobs, and partners' candidates to yours, without exposing anyone until the candidate says yes. **Unlike** split-fee job boards and informal LinkedIn groups, every referral is authorized by the candidate, protected by agreed terms, and tracked to payment in an auditable ledger.

Short version (landing): **"Split placements, without the risk."** Supporting pillars:
1. **Private until the candidate says yes.**
2. **Matched for you, both ways.**
3. **Terms agreed up front, every dollar tracked.**

Claims to avoid until they're true: "you'll always get paid", "backdoor protection", "verified members" (RD-002 makes that one true), "hosted in Canada" (copy-audit 9.9).

## 7. Personas

### P1. Isabelle, independent recruiter (primary)
- **Profile:** solo, ex-agency, Montréal. Tech and data roles. 400 candidates in a spreadsheet or a light ATS (Recruit CRM, Manatal), 6–10 active job orders, 8–15 placements a year. Bilingual.
- **Jobs to be done:** earn on the candidates she can't place herself. Fill job orders outside her network before the client goes to another agency. Look bigger than she is.
- **Pains:** no time for business development. Has been backdoored before. Split partners who ghost. Chasing invoices. Re-keying data.
- **Pays when:** a first split payment lands within one quarter of joining. Matches appear without her doing anything.
- **Churns when:** no Strong matches in the first 30 days. A partner sits on her submission. One bad experience with a fee or ownership fight. Manual double entry.

### P2. Marc, boutique agency owner (primary, economic buyer)
- **Profile:** 6 recruiters, Toronto. Finance and accounting. Uses Bullhorn or JobAdder. Already does 2–5 informal splits a year.
- **Jobs to be done:** make money from the team's idle database. Add capacity on hard roles without hiring. Keep the database when a recruiter leaves (portfolio transfer exists).
- **Pains:** fear of leaking candidates or client names to competitors. Recruiters doing side deals. Admin overhead. Can't see split revenue.
- **Pays when:** split revenue is visible on a dashboard. The ATS syncs automatically. Partners are vetted.
- **Churns when:** it needs manual exports. There's a privacy scare. The team doesn't adopt it. The 10% looks expensive next to what he gets back.

### P3. Priya, job-side account manager (the critical side for liquidity)
- **Profile:** at a boutique. Owns client relationships and has more jobs than her team can fill.
- **Jobs to be done:** fill faster with qualified, *non-duplicate* candidates. Protect the client relationship.
- **Pains:** spammy or unqualified submissions. Candidates the client already saw ("duplicate fee fights"). A partner contacting her client directly. Having to pay a split on a candidate she already had.
- **Pays when:** submissions arrive pre-screened, with candidate confirmation and a clear fit, and she controls what partners see (pre-referral visibility, confidential client).
- **Churns when:** duplicates or poaching happen. Partners approach her client. Referral volume is noisy.

### P4. Agency operations / director (later, mid-size)
- Needs: ATS connectors (Bullhorn first), SSO, roles, reporting, a compliance pack (Law 25 PIA, DPA). Buys on risk reduction and incremental revenue. Long sales cycle. Phase 3+.

### P5. Fernanda, Brazilian *consultora* / hunter (later)
- Boutique *consultoria* in São Paulo. Tech and finance. Works on WhatsApp. Fees 18–25% of annual comp. Clients mix PJ and CLT hires.
- Needs: pt-BR (built), WhatsApp or SMS candidate confirmation (the `sms` channel already exists in the schema), *nota fiscal*-friendly invoicing records, an LGPD-compliant consent trail. Churns on English-centric UX or foreign-currency friction.

### Non-users who shape the product
- **Candidate:** sees one email or SMS and one page. Needs to know who will see what, for which job, and that they can say no. Their confirmation is the strongest trust asset Workatent has, and also the best ownership evidence.
- **Employer client:** not a user. Fears its name leaking. Must never feel that Workatent is "shopping" its role around. Confidential client and per-field visibility handle this.

## Sources
- Top Echelon split economics and membership: [How split placements work (Top Echelon)](https://topechelon.com/?p=84332), [Top 10 fees 2017 / membership](https://pinnacle.topechelon.com/?p=40590), [Network policies](https://pinnacle.topechelon.com/?p=40701), [Typical placement fees](https://topechelon.com/blog/typical-placement-recruitment-fees-average/)
- NPAworldwide: [How NPAworldwide works](https://npaworldwide.com/?p=846), [Press release, network size](https://npaworldwide.com/?p=10476), [Bylaws on procuring cause](https://npaworldwide.com/?p=1167)
- SplitFee (UK): [SaaSHub comparison listing](https://www.saashub.com/compare-membit-vs-split-fee) (aggregator, unverified)
- Recruit Alliance: [Split Alliance](https://recruitalliance.com/splitalliance.aspx), [Honor period](https://kb.recruitalliance.com/24015/kb/article/105858/What%20is%20the%20Honor%20Period)
- BountyJobs: [BountyJobs](https://www.bountyjobs.com/?p=17126), [Split platform roundup](https://www.recruiterslineup.com/top-split-placement-network-platforms-for-independent-recruiters/)
- Paraform: [TechCrunch 2024](https://techcrunch.com/2024/04/15/paraform-a-recruiting-platform-that-connects-recruiters-and-startups-raises-funding), [HeroHunt pricing estimate](https://www.herohunt.ai/blog/paraform-pricing-alternatives-2026/), [Dover comparison](https://www.dover.com/blog/paraform-reviews-pricing-alternatives)
- Recruiter.com: [Help center, splits](https://help.recruiter.com/with-whom-am-i-doing-the-recruiting-placement-fee-splits), [Company history summary](https://yespress.io/recruiter-com)
- Bullhorn Marketplace: [What is the Bullhorn Marketplace](https://www.bullhorn.com/partner-engagement-hub/)
- Canada fees: [IQ Partners](https://www.iqpartners.com/blog/how-do-recruitment-agencies-get-paid/), [Manatal](https://www.manatal.com/blog/recruitment-agency-canada), [RecruitBPM](https://recruitbpm.com/blog/recruitment-fees)
- Brazil fees: [Randstad BR FAQ](https://insights.randstad.com.br/hubfs/Inbound%20program/SME/SME-CJ5%20optimized%202023/Randstad%20-%20FAQs.pdf), [Contract template BR](https://forms-legal.com/pt/brasil/business/services/recruitment-services-contract-brazil), [Psicopedagogia overview](https://psicopedagogia.com.br/conteudo/headhunter-o-que-e-e-como-funciona-na-pratica)
- Ownership norms: [BountyJobs on ownership terms](https://blog.bountyjobs.com/candidate-ownership-terms-a-must-have-in-any-recruitment-agency-contract_), [ERE "but for" in fee fights](https://www.ere.net/articles/why-you-should-never-say-but-for-in-a-fee-fight)
