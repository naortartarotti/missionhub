# Product assessment

Owner: Recruitment Strategist · First version: 2026-11-12 · Basis: the code and migrations in the working tree on that date (including the uncommitted wallet removal and the `wallet → commissions` rename).

> This assessment judges the product against how split recruiting actually works. ⚖️ = needs counsel, not legal advice. **[Estimate]** = my judgement.

---

## 1. What exists today (verified in code)

| Area | What's built | Where |
|---|---|---|
| Tenancy and team | Orgs (`agency` / `independent`), roles, invitations, suspension, country, portfolio transfer when a recruiter leaves | `20261107000100_foundation.sql`, `20261112000200`, `20261112000400` |
| Candidates | CRUD, CSV and resume import (AI optional), consents (append-only), privacy requests, profile with **mobility** (relocation scope and destinations, work authorization, travel, visa) | `features/candidates`, `20261111000300` |
| Jobs | Paste/link/file import, suggested requirements, **expected fee** (amount, or % of the salary midpoint), per-field pre-referral visibility, confidential client, `accepts_external_referrals` | `features/jobs`, `commission-fields.tsx` |
| Matching | Deterministic engine v3: skills (with AI-derived related-skill credit), seniority, years, work arrangement, location, mobility, languages, salary. Strong / Partial / Not eligible bands with explanations. **Network-wide:** every non-demo org's active candidate × every other org's open job. Same-org pairs are excluded. | `features/matching`, `matching-service.ts` |
| Referrals | Field-level snapshot, document grants (copied, 60-second URLs), state machine, messages, **candidate confirmation by private link** (the partner sees nothing until the candidate confirms), revocation, structured decline reasons (incl. `duplicate`), one live referral per candidate record × job, `internal` flag for related orgs | `20261107000400`, `20261108000300`, `20261111000200`, `20261110000400` |
| Commissions | Versioned rules (default 45/45/10), agreement frozen on accept, hire report (job side only) with fee, start date and guarantee days (default 90), invoices, payment evidence, four-eyes verification, immutable ledger, refunds as reversals, disputes on placements | `20261107000500_finance.sql`, `features/commissions` |
| Connectors and API | Spreadsheet and ATS job-board connectors, public REST API with hashed keys, idempotent sync, "never overwrite the team's work" | `docs/connectors.md` |
| Removed | Wallet, Stripe pay-ins and cash-outs (`20261112000100_drop_wallet.sql`). Settlement happens off-platform and is recorded as evidence. | |

## 2. What's strong

1. **Consent architecture that's better than the industry's.** Requiring a separate, job-specific authorization (ideally confirmed by the candidate) before a partner sees anything is exactly what split recruiting lacks. It also creates the **best possible ownership evidence**: a timestamped confirmation from the candidate that recruiter A represents them for job X. Most networks rely on the recruiter's word.
2. **Anonymized demand signals.** Match counts on the job owner's side are a hook ("3 partner candidates fit") that doesn't leak identities. They make job owners want to open roles.
3. **Frozen terms.** The agreement snapshot is created on accept and confirmed by the sourcing side before interviewing can proceed. That's the right moment, and it's enforced by the state machine.
4. **Ledger discipline.** Immutable entries, compensating corrections, four-eyes, and disputes that freeze the placement. This is more rigorous than anything an independent recruiter has today.
5. **Gaming already considered.** The related-org `internal` rule, rate limits, idempotency keys and demo/real isolation are all in place.
6. **Removing the wallet was right.** Holding or moving recruiters' money brings licensing, KYC and chargeback exposure (⚖️ money services). That's out of proportion to the value at this stage. Recording evidence is enough for v1.
7. **Mobility in the matching model.** It's ahead of competitors for cross-border placements (Canada→US remote, relocation to Canada, Brazil→remote).

## 3. Gaps and risks, judged against real recruiter behaviour

Ordered by how fast they would kill trust in a live network.

### 3.1 Backdoor hires: protection is displayed, not enforced 🔴
- Referrals carry `ownership_protected_until` (default **12 months**) and the UI shows "Ownership protected until {date}". Nothing acts on it.
- **Disputes can only be opened on a placement.** Placements exist only after the *job owner* reports a hire. If B declines a candidate (or lets the referral sit), then hires them directly or through the client, A has **no in-product path**: no claim, no dispute, no evidence pack.
- **The `duplicate` decline reason needs no evidence.** Declining "duplicate" is the classic backdoor move: "we already had them". Today it costs B nothing.
- **Only the party that owes money reports the hire.** That's the weakest incentive design possible. It's also Workatent's own revenue risk (the 10% is remitted by the same party).
- **Fix direction:** RD-003 (ownership window bound to the job owner's client terms), RD-004 (first confirmed submission wins, and prior presentation needs evidence within 5 business days), referral-level claims and disputes, and letting the sourcing side report "my candidate told me they were hired", which B must confirm or contest.

### 3.2 Double submissions across agencies 🔴
- Dedup is "one live referral per **candidate record** × job". The same person in two agencies' databases is two records, so both can submit them to the same job. The job owner discovers it only by recognising a name in two snapshots.
- In real life this is the most common source of fee fights. The client says "we already got this CV from agency X".
- **Fix direction:** a privacy-preserving fingerprint at submission. A keyed hash of the normalized email, phone and LinkedIn URL, compared only against referrals to *the same job* (or the same client), never exposed. On a collision, the second submitter is told "this candidate has already been presented for this job" before they spend the candidate's goodwill. The rule is in RD-004.

### 3.3 Guarantees, refunds and replacements 🟠
- `guarantee_until` is recorded at hire (default 90 days) and client refunds reverse the ledger pro rata. That's good. But:
  - there's no **fall-off event** (candidate left or was terminated within the guarantee) and no **replacement flow**;
  - the guarantee is entered *at hire*, after the sourcing recruiter has already done the work, so A never sees the terms before submitting;
  - copy-audit 9.8 is right: the UI must not imply Workatent enforces the guarantee.
- **Fix direction:** RD-006. Show guarantee terms on the job terms card before submission, freeze them into the agreement, and add a "fall-off within guarantee" event with two outcomes (refund → pro-rata reversal of all shares, or replacement → shares stand, and the sourcing partner gets first right to propose the replacement).

### 3.4 Fee terms visible too late 🟠
- Partners see an expected fee and their projected share (`sent_referral_expected_share`). They don't see: fee basis (base vs total comp), payment terms, guarantee, whether the job is **exclusive or contingent and shared with other agencies**, client responsiveness, or how many partner submissions are already in.
- Recruiters choose which split jobs to work on by job quality. A contingent role that 5 agencies are also working is worth a fraction of an exclusive one. **[Estimate]**
- **Fix direction:** a "job terms card" set by B (fee %, basis, guarantee, payment terms, exclusivity, ownership window) that gets frozen into the agreement on accept.

### 3.5 Responsiveness and reputation 🟠
- Nothing pushes the job owner to respond. The #1 complaint about split networks is submissions disappearing into a black hole. **[Estimate, from experience]** No member reputation signal exists either.
- **Fix direction:** RD-007 (response SLA with reminders and auto-release) plus a lightweight partner reputation: median response time, % of referrals answered, % of placements paid on time, disputes. Show it to counterparts, not publicly.

### 3.6 Platform revenue and payment discipline 🟠
- Platform fee = "remittance" recorded by the job owner after the client pays. No invoice comes from Workatent, there's no due date, and nothing happens when it's overdue.
- **Fix direction:** RD-009 (Workatent is a named party to the agreement and records its own invoice; overdue blocks new referrals). Needs a user decision and counsel.

### 3.7 Member trust and vetting 🟠
- Any org can sign up and open jobs to the whole network. There's no business verification, no references, and no licence check.
- ⚖️ **Ontario:** since 1 July 2024, recruiters who find employees for a fee (permanent placements included, even when based outside Ontario) need a licence, and **other recruiters may not knowingly use an unlicensed recruiter**. A split partner is "using" the other recruiter, so members working Ontario roles have a real compliance need to verify their counterparts. ⚖️ **Québec:** CNESST licensing covers personnel placement agencies (staff leasing) and temporary-foreign-worker recruitment agencies. Whether permanent-placement boutiques fall in scope needs counsel. ⚖️ **Workatent itself:** whether a platform that takes a fee per placement and runs matching is a "recruiter" under the Ontario ESA is the most important open legal question (RD-010).
- **Fix direction:** RD-002 (curated network: application, business verification, licence fields where relevant, a verified badge).

### 3.8 Data quality 🟡
- Matching quality depends on structured candidate data: skills, seniority, salary, work authorization. Imported candidates are drafts and recruiters will skip fields. Stale candidates (placed elsewhere, no longer looking) create false Strong matches and embarrassing submissions.
- **Missing signals that predict placements:**
  - notice period / availability date;
  - industry/domain;
  - **last contact date** (freshness);
  - total comp vs base;
  - "already interviewed at this client". This one is critical for duplicates and for a candidate's prior history with a client.
- **Fix direction:** a freshness rule (candidates not confirmed or touched for N days drop out of matching, with a nudge). Add notice period and industry to the engine later.

### 3.9 Abuse cases to design against
| Abuse | Current defence | Gap |
|---|---|---|
| Collecting both halves via a second org | `internal` flag for orgs that share a member | Two colluding people in two orgs. Detect with the same-email domain / payout-entity heuristic at payout time (later). |
| Fishing: opening fake jobs to see who has which candidates | Partners see counts only, never identities | Counts by niche can still reveal pipeline size. Acceptable. Vetting (RD-002) limits fake orgs. |
| Spam submissions to every Strong match | Rate limit 30/h, candidate confirmation | Quality signal: accept rate per sourcing org, shown to job owners (reputation). |
| Poaching the client (A contacts B's client directly) | Confidential client, per-field visibility | Add a non-solicitation clause to the agreement template ⚖️ |
| Poaching the candidate (B re-presents A's candidate to another client) | Snapshot only, documents revocable | Ownership is per job/client. The agreement should say a candidate introduced through Workatent stays A's for any role at B's clients during the window (RD-003) ⚖️ |
| "Duplicate" declines used to dodge a split | None | RD-004: evidence within 5 business days, and the decline is visible to A with the evidence date |

## 4. Local vs global readiness

| Market | Ready | Gaps |
|---|---|---|
| **Canada (ex-Québec)** | Product, CAD, en, consent model, hosting in `ca-central-1` recommended | ⚖️ Ontario recruiter licensing (member verification, Workatent's own status). GST/HST on the platform fee. Real Terms, Privacy Policy and agreement template (copy-audit 9.7). |
| **Québec** | fr-CA UI, separate consent records, privacy requests | ⚖️ Law 25: a PIA is required before transferring personal information outside Québec (OpenAI, email vendors, possibly US hosting); individuals must be told; fines up to C$25M or 4% of worldwide turnover. Consent text in French, clear and separate (copy-audit 9.6). Charter of the French Language applies to the B2B contract and UI. QST on fees. CNESST licensing scope ⚖️. |
| **US** | Multi-currency, mobility and work authorization (TN, H-1B as "authorization" codes) | State pay-transparency laws (salary ranges in postings: the job has salary fields, keep them required for US roles). Non-competes and non-solicits vary by state ⚖️. Crowded split market. Sales tax on SaaS fees varies by state ⚖️. |
| **Brazil** | pt-BR UI, BRL, SMS channel in the schema | ⚖️ LGPD: legal basis, DPO (*encarregado*). International transfers need ANPD standard contractual clauses incorporated verbatim (grace period ended 23 Aug 2025). Fee basis includes the 13th salary and bonus. **CLT vs PJ** must be a job field (changes fee basis and candidate expectations). *Nota fiscal* for platform fees. WhatsApp as the main channel. Withholding taxes on cross-border fees ⚖️. |
| **EU/UK, remote/global** | Mobility, currencies, GDPR-like consent model | GDPR transfers (SCCs), UK IR35 (contract roles only, out of scope). EOR hires: who is "the client" for the fee? Out of scope until there's a cross-border corridor. |
| **Cross-border splits (A in Canada, B in US)** | Ledger supports any currency per placement | Fee currency vs payout currency, FX at payment date, tax on cross-border B2B services ⚖️. Recommendation: allow cross-border splits only when both orgs accept the job currency, and record FX as evidence. |

## 5. Readiness verdict

**Ready for a closed founding cohort in Canada** once the 🔴 items have at least a minimum version. Until then, the product's core promise ("Split placements, without the risk") isn't credible to an experienced recruiter. They'll ask "what happens if they backdoor me?" in the first demo. The honest answer today is "you can message them".

Minimum bar before inviting the cohort:
1. Prior-presentation and duplicate rule with evidence (RD-004) and the cross-org fingerprint at submission.
2. Referral-level claims: A can report a hire or a backdoor suspicion on any referral inside the ownership window.
3. Job terms card frozen into the agreement (fee basis, guarantee, ownership window, exclusivity).
4. Response SLA reminders (RD-007).
5. Curated onboarding (RD-002).
6. Terms, Privacy Policy and collaboration agreement template reviewed by counsel ⚖️ (blocks launch, not build).

## 6. What NOT to build yet

| Don't build | Why |
|---|---|
| **Payments, escrow, wallets** (just removed) | Money-services licensing, KYC and chargebacks ⚖️, for little added trust at small volume. Revisit only when the platform fee is collected reliably *and* members ask for it. |
| **Employer / client portal** | Agencies won't let Workatent near their clients. It also turns Workatent into a Paraform-style competitor to its own members. |
| **A full ATS** (interview scheduling, email sequencing, CRM, career pages) | Agencies already own an ATS. Win through connectors. Single-player features should stay limited to "match and import". |
| **Contract/temp staffing splits** | Timesheets, margin splits and weekly billing are a different product and a different regulation (Ontario THA licensing, Québec staff leasing). |
| **Public candidate marketplace or "hot candidate" blasts** | Breaks privacy-first, the main differentiator, and Law 25/LGPD consent. |
| **AI auto-submission or auto-outreach to candidates** | Submission is a human, consented act. Automating it damages trust and consent evidence. |
| **Retained / executive search workflows** | Retainers, staged fees and shortlists. Small overlap with anonymized matching. |
| **Per-referral fee negotiation** | It creates haggling and disputes. Use a per-job terms card instead (RD-005). |
| **Brazil and US go-to-market** before Canada cells are liquid | Liquidity is local. Spreading thin kills it. |
| **Public reputation scores / leaderboards** | They invite gaming and defamation risk. Show counterpart-only signals first. |
