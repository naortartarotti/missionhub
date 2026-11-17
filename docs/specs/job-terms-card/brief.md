# Brief: Job terms card, frozen into the agreement (N2)

Owner: Product Manager · Date: 2026-11-15 · **Rev. 2** · Slug: `job-terms-card` · Roadmap: **N2** (in progress)
Inputs: [`recruiting-input.md`](./recruiting-input.md) (§7 is the rule list this brief enforces; §12 answers S-N2-1 to S-N2-5), RD-003, RD-005, RD-006, RD-007, RD-015, RD-020, **RD-022 to RD-028, RD-031 to RD-035** ([`decisions.md`](../../strategy/decisions.md)); PD-009, PD-014, PD-023, PD-026, **PD-044 to PD-052** ([`decisions.md`](../../product/decisions.md)); [`backend-estimate.md`](./backend-estimate.md); [`spec.md`](./spec.md). RD-029, RD-030 and RD-033 are N3 inputs and are not built here.
⚖️ = counsel item (via N7), not legal advice. **Needs user decision** items are listed in §8.4.

> **Rev. 2 changes (2026-11-15)**
> - **Scope (PD-044 addendum, PD-050):** Must is over the 12-day bar. S2 client-name gate → N3; S1 worsening flag and S3 below-band alert → **N2.1**; S4 stays. Must 13 is trimmed: the sent list shows no money share (option c). The rest of the overrun (~14.25 days) is accepted. Backend delivers in two internal drops; drop 1 makes `report_hire` refuse snapshot referrals until drop 2.
> - **Answers (PD-051):** legacy referrals deliver on card-less jobs (BR-3, BR-7); undelivered ownership dates → NULL (BR-19); any supported salary currency on % bases + `currency_mismatch` (BR-1, BR-3); the estimate A saw is frozen on the referral (BR-11, BR-36); five I ≠ C reason codes (BR-23); notification recipients (BR-24, BR-32); amendments in any status without a placement (BR-34); attestation re-ticked per version (BR-4); flat hires take no base (BR-22); currency codes on every N2 money display (BR-38).
> - **Strategist (PD-052):** RD-031 (floor, I incl. retainer), RD-032 (BR-39 rewritten), RD-033 (BR-15 note), RD-034 (FX reason; shortfalls pro rata), RD-035 (amendments before hire). E-19 post-hire credit-note gap recorded as R-11; "short-paid" marker and admin allocation adjustment → X6 / X1.

---

## 0. What the code does today (verified 2026-11-15)

| Area | Today | File(s) |
|---|---|---|
| Fee | `jobs.expected_fee_minor` + `fee_currency`. The form's "% of salary" mode multiplies the band midpoint and posts **only the amount** (hidden input). Basis and rate are lost. | `src/features/jobs/components/commission-fields.tsx`, `schemas.ts`, `actions.ts` |
| Fee visibility | `jobs.share_fee` (default true) can hide the fee from partners. `share_salary` defaults to false. | `20261107000200_candidates_jobs.sql` |
| Job edits | `saveJob` updates `jobs` directly with the user client (RLS). Connectors and `/api/v1/jobs` also write `jobs` (service role, `src/server/ingest/upsert.ts`), without fee or referral fields. No history of any field. | `src/features/jobs/actions.ts`, `src/server/ingest/upsert.ts` |
| Partner visibility | `active` + `accepts_external_referrals` + other org. The same flag gates internal (related-org) referrals. Contract type is not checked. | `20261111000400_mobility_matching_sharing.sql`, `get_opportunities` |
| Split | `commission_rules` (versioned, immutable bps; one default, 45/45/10 v1). Copied into `collaboration_agreements` **at acceptance** by `app.create_agreement_for_referral` from the **current default rule** (current definition: `20261110000400_related_org_referrals.sql`, internal referrals get 0 sourcing bps). Agreement bps are immutable. `terms_version` is the network-rules text version. | `20261107000500_finance.sql`, `20261110000400_related_org_referrals.sql` |
| Expected share shown to partners | Opportunities, triage and sent-referral views compute the share from the **live** job fee and the **current** default rule; the sourcing side's referral page reads the **live** job fee. | `20261108000200`, `20261109000300`, `20261110000400`, `src/app/workspace/[orgSlug]/referrals/[referralId]/page.tsx:179` |
| Ownership date | `referrals.ownership_protected_until` column default `now() + 12 months` (set at insert; the recorded-authorization path inserts at delivery). The candidate-confirmed path resets it to `now() + 12 months` in `respond_candidate_request`: the live definition is `20261115000100_candidate_confirmation_integrity.sql:498`; the copies in `20261111000200`, `20261111000400` and `20261113000400` are superseded definitions of the same function. All delivery now goes through `app.deliver_referral` (`20261113000400`), which sets `delivered_at`, `claim_deadline_at` and N1's client-key snapshot, but not the ownership date. | listed |
| N1 look-back | Prior-presentation claim refuses a prior-process date earlier than `delivered_at − 6 months` (live: `20261113000900_qa_fixes.sql:345`). Referral evidence and "still counts" read `ownership_protected_until`, so they follow whatever date is stored. | listed |
| Hire | `report_hire(p_referral, p_fee_minor, p_currency, p_start_date, p_expected_version, p_guarantee_days default 90)`: free fee, any 3-letter currency, guarantee 0–365 typed by the job owner. Placement stores `contracted_fee_minor`, `currency`, `guarantee_until`. | `20261107000500_finance.sql:288`, `src/features/referrals/actions.ts:227`, `referral-actions.tsx:195` |
| Ledger | Each verified `client_payment` / `client_refund` is split by the agreement bps with `app.allocate_minor` (largest remainder; TS mirror `src/lib/money/allocate.ts`, parity-tested). There is no notion of a fee the sourcing side is owed independently of what B collected. | `20261107000500_finance.sql:441` |

---

## 1. Problem

A sourcing recruiter (A) commits a candidate without knowing the economics: the fee basis is lost, the fee can be hidden, there is no guarantee, payment terms, search type or window on the job, and the split is frozen only when B accepts. At hire, B, the party that owes the money, types the fee, the currency and the guarantee freely. B can edit the job's fee at any time with no trace. Every new referral still gets 12 months of ownership, which over-promises against most client contracts (RD-003). These are the five trust breaks in recruiting-input §1.4: unseen guarantee, discount at offer, fee restructuring, short window claimed after the fact, undisclosed shared search.

## 2. Users and roles

- **Hiring side (B):** job owner org (`org_admin`, `recruiter_manager`, and whoever holds `jobs:write` today). Declares the card once, edits it when the client contract changes, reports the hire from the snapshot.
- **Sourcing side (A):** reads the card before submitting, submits under a known version, confirms the agreement on the same terms, sees the computed share at hire.
- **Platform admin:** records concierge amendments (RD-024), uses snapshots in disputes (the worsening flag comes in N2.1).
- **Candidate:** unaffected. The fee and terms are never shown to candidates (the N9 candidate page must not change).
- **Connectors / API:** can create and update jobs but can't publish a card or open a job to partners.

## 3. Evidence

- [`recruiting-input.md`](./recruiting-input.md) §1 (market practice: NPA confirm-fee-before-submit, published terms are the default, split on total fee including retainer, pay when paid), §1.4 (trust breaks), §6 (abuse cases A-1 to A-11).
- RD-022 (card content), RD-023 (freeze at commit), RD-024 (changes), RD-025 (fee at hire, discounts), RD-026 (retainers), RD-027 (guarantee, payout timing), RD-028 (window and look-back).
- RD-006 rationale: "I didn't know it was a 6-month guarantee" is the dispute N2 removes (PD-007).

## 4. Goal and success metrics

**Goal:** before A commits a candidate, A sees the job's structured terms; the terms A saw are the terms of the agreement, the hire report and the ledger, and B can't change them afterwards without A's consent.

| Metric | Type | Target | How measured |
|---|---|---|---|
| % of partner-visible jobs with a complete current card | leading | 100% by construction | SQL on the partner-visibility predicate (BR-3); reported on the admin metrics page |
| Existing referral-open jobs that complete the card within 14 days of N2 shipping | leading | ≥ 80% of jobs owned by active orgs | `job_terms_versions` first version date vs ship date |
| Submissions per active partner job (30-day) | leading | no drop vs pre-N2 baseline | referrals per partner-visible job |
| % of hires where invoiced fee ≠ computed fee | leading (watch) | < 10% **[estimate]** | placements with a difference reason |
| Time to complete the card | leading | < 2 minutes **[estimate]** | timed in founding-member usability sessions; **not** instrumented in the product |
| Disputes citing terms per 100 accepted referrals | lagging | < 2 **[estimate]** | admin dispute category (concierge tagging until a category field exists) |
| "Terms" as a decline or dispute reason | lagging | → 0 | decline reasons, dispute tags |
| Jobs declaring a window other than 6 months | signal | > 20% → revisit RD-003 default | terms versions |
| Concierge amendments per 20 accepted referrals | signal | > 1 → build in-product amendments (RD-024) | admin amendment audit events (SQL by Ops until the N2.1 metrics panel) |
| Worsening flag firing | signal | > 5% of partner jobs → revisit RD-024 | admin flag (**N2.1**) |

In N2, the admin metrics page shows only the two counts that come with the predicate: partner-visible jobs and referral-open jobs hidden for missing terms. The I ≠ C and amendment counts are read with SQL until N2.1 (PD-051 Q-7).

## 5. Scope

### Must (this release)
1. **Terms card on the job form** (T1–T9, T10 read-only): fee basis, rate or flat amount, optional minimum fee (% bases), currency rule, search type, direct-client attestation, guarantee length and remedy, client payment terms, ownership window, split shown read-only with rule name and version (BR-1, BR-2).
2. **Immutable terms versions** published only through a server RPC; every card change creates a new version; no-op saves don't (BR-4, BR-5).
3. **Partner-visibility gate:** a job is visible to partners and accepts referrals only if it is active, open to referrals, **permanent**, and has a complete current version. Existing referral-open jobs without one are hidden until completed, with a nudge to owners (BR-3, BR-6, BR-7).
4. **Card shown to partners before submission** (opportunity view and submit screen), with the fixed network-rule lines; money estimate gated by `share_salary`; `share_fee` retired for referral-open jobs (BR-8 to BR-10).
5. **Snapshot at commit**: terms version, commission-rule version and the internal client key stored on the referral when A commits, verified against the version A was shown; a `terms_changed` outcome if it moved (BR-11 to BR-15).
6. **Agreement built from the snapshot**, never the live job or the current default rule (BR-16, BR-17).
7. **Ownership window from the snapshot** at delivery; legacy referrals keep 12 months (BR-18, BR-19).
8. **N1 look-back follows the snapshot window** (BR-20).
9. **Hire dialog driven by the snapshot**: guarantee and currency read-only, fee computed from basis and reported base, different invoiced amount only with a reason and a notification to A; legacy free entry only for referrals without a snapshot (BR-21 to BR-26).
10. **Computed partner share (RD-025 a)** in the ledger: A's share floored at the frozen terms, paid when paid; platform share basis as a frozen rule field so RD-025 (b) is a value, not a rebuild (BR-27 to BR-30).
11. **Change handling (RD-024)**: existing snapshots never change; partners with live referrals notified in-app; "terms updated on {date}" for 30 days (BR-31 to BR-33).
12. **Concierge amendment** by a platform admin (RPC + minimal admin form): referral-scoped new terms version, reason and written-request reference, audit, both orgs notified (BR-34, BR-35).
13. **Snapshot shown wherever terms matter**: both sides' referral page, A's agreement confirmation, the hire dialog, the commissions page; legacy referrals labelled "terms not recorded" (BR-36, BR-37). **Trimmed (PD-050, option c):** the sent-referral list shows the basis and rate (or the flat amount) per referral, **without a money share**; the share is on the referral page and the agreement dialog.
14. All card labels and frozen terms rendered in en / fr-CA / pt-BR from structured fields, with currency codes on every money amount (BR-38).

**Backend effort (estimate):** ~14.25 days (range ~12.5–16.5), above PD-044's 12-day bar, overrun accepted (PD-050). Delivered in two internal drops (§9).

### Should
Fallback triggered (PD-044 addendum, PD-050). **Only Should 4 remains in N2.**
1. ~~Admin terms-worsening flag~~ → **N2.1** (BR-39 kept below, rewritten per RD-032, for that build). Comes with the admin N2 metrics panel (spec S11).
2. ~~Real client name required to open a job to external referrals~~ → **back to N3** as its prerequisite (roadmap N3, PD-023). BR-40 kept below for reference.
3. ~~Below-band alert at hire~~ → **N2.1** (BR-41). When built, the band minimum frozen at commit lives in a closed `app` table (PD-051).
4. **Brazil helper text** on the total-cash basis (13th salary, 1/3 vacation bonus), and the retained/engaged helper ("the split applies to the total fee, retainer included", RD-026). Copy + frontend only.

### Won't (this release)
- **Guarantee-limited reversals** (RD-027: a refund beyond the snapshot's guarantee is B's alone) and the replacement first right: **X6** fall-off flow (PD-007). N2 stores the data X6 needs. Meanwhile client refunds are platform-admin verified (four-eyes), and the dispute playbook applies the snapshot's guarantee.
- **In-product two-party amendment flow** (RD-024): Later, only if amendments exceed ~1 per 20 accepted referrals.
- **Per-job partner share** (L2, RD-005). **Contract / temp / contract-to-hire splits** ("not doing").
- **Optional free-text note on the card** (Later; recruiting-input §7.9).
- **Industry and size band on confidential cards** (E-8 Should): Later, needs new job fields.
- **CV-harvesting flag** (A-9, ≥ 10 received, 0 accepts in 60 days): with N4 / X2, which own response metrics.
- **Ownership enforcement, sourcing-side hire reports, authorization challenge** (RD-029, RD-030): **N3**. N2 only records the snapshot and the window N3 reads.
- **Founding-member rate** (X7, blocked on RD-008). The card shows whatever the current default rule is.
- **Post-hire credit notes (E-19):** a "short-paid" marker and admin allocation adjustment on an upheld dispute → X6 / X1 (PD-052, R-11).
- **Should 1, Should 3 and the admin N2 metrics panel** → N2.1. **Should 2** → N3 (PD-050).
- **Notification emails** for terms changes: N7 pipeline (PD-030) covers every in-app kind.
- **Platform invoice** (X1, RD-009).
- Changing N1 (client-key snapshot at delivery, deadlines, sticky stops) or N9 (token issuance, resend) behaviour beyond BR-14, BR-15 and BR-20.

---

## 6. Business rules

**The card**
- **BR-1** A complete card has: **T1** fee basis (`pct_base` · `pct_total_cash` · `flat`); **T2** rate in basis points 100–5000 (1–50%, two decimals allowed) for % bases, or a flat amount > 0 in minor units; **T3** optional minimum fee > 0, % bases only; **T4** currency: % bases use the job's salary currency (any currency the money library supports, PD-051 Q3), flat declares one of the allowed currencies (CAD, USD, EUR, GBP, BRL); **T5** search type (`contingent_exclusive` · `contingent_shared` · `retained`); **T6** direct-client attestation, required, recorded with user and time on the version; **T7** guarantee days ∈ {0, 30, 60, 90, 120, 180} and remedy (`replacement_only` · `replacement_then_prorata` · `prorata_refund` · `full_refund`), remedy null when days = 0; **T8** client payment terms, integer net days 0–90; **T9** ownership window, integer months 6–12. Defaults: `pct_base`, no rate, no minimum, `contingent_shared`, 90 days `replacement_then_prorata`, net 30, 6 months.
- **BR-2** **T10** (split) is read-only on the card: the current default commission rule's name, version and the three percentages. It isn't part of the job's terms version (the rule version is frozen separately, BR-11).
- **BR-3** **Partner-visible** means: `status = active` ∧ `accepts_external_referrals` ∧ `contract_type = permanent` ∧ the owner org isn't suspended ∧ the job has a **current complete terms version** ∧ on % bases, that version's currency equals the job's current salary currency (otherwise hidden with owner reason `currency_mismatch`, PD-051 Q3). One predicate, applied server-side in every place that lists, matches for display, opens or accepts referrals for a job (opportunities, triage, opportunity detail, both submit RPCs, delivery). A job that isn't partner-visible returns "not found" to other orgs, never a reason. **Delivery exception (PD-051 Q1):** a referral **without** a snapshot is delivered on the candidate's confirmation under today's check (active ∧ open to referrals ∧ org not suspended); snapshot referrals use the full predicate at delivery.
- **BR-4** Terms versions are **immutable**: insert-only, no update or delete for any role (trigger + no grants), numbered per job (1, 2, …), with `created_by`, `created_at` and the T6 attestation. They are written only by a `SECURITY DEFINER` RPC that checks the caller can edit the org's jobs. The T6 attestation must be ticked on **every save that creates a version**, not on no-op saves (PD-051 Q-2). Connectors and `/api/v1/jobs` can't publish a version or set `accepts_external_referrals` to true.
- **BR-5** Saving the job form creates a new version **only if a T1–T9 field changed**. The newest version is the job's current terms. Non-terms job edits (description, skills) never create a version.
- **BR-6** Opening a job to referrals requires a complete card and `permanent`, **whatever the job's status, drafts included** (PD-051 Q-3). The form refuses with field errors otherwise. Private jobs may keep any contract type and need no card.
- **BR-7** **Existing jobs**: a referral-open job with no version (all jobs at migration time) or a non-permanent contract type stops being partner-visible until fixed. No migration invents a version. Owners see a nudge on the job list and job page. Existing referrals on such jobs are unaffected (they keep their status and can proceed), **including a pre-N2 referral still awaiting the candidate: the confirmation delivers it** (BR-3 delivery exception).

**What partners see before submitting**
- **BR-8** Partners see T1–T10 of the current version on every partner-visible job, with the version date, the fixed network-rule lines (recruiting-input §2.2: ownership scope and window from delivery; 5-business-day prior-presentation claim; 5-business-day response, and the referral is free to move on after 10 (RD-007); partner payout within 5 business days of the client's payment reaching B, not held for the guarantee; shares before sales tax), and the client as "confidential" or the name according to `client_confidential`. The network-rule lines are marked as draft network rules until N7 (⚖️). **Response line (PD-051 Q-12):** shown although N4 enforces it; N4 is a launch gate, so no member sees it unenforced. Its wording doesn't use "release" (N1's term) and must not suggest the referral loses ownership (RD-007).
- **BR-9** `share_fee` no longer hides anything on referral-open jobs; the toggle is removed from the form (the column stays, ignored). On % bases the **money estimate** (estimated fee and A's estimated share) is shown only when `share_salary` is on; basis and rate are always shown. Flat amounts and the minimum fee are always shown (they reveal no salary). Estimates are labelled as estimates.
- **BR-10** `share_salary` defaults to **on** for a job being opened to referrals for the first time, as an explicit toggle on the card. Existing jobs keep their current value (PD-047).

**Snapshot at commit**
- **BR-11** When A commits, the referral stores, in the same transaction: the job's **terms version id**, the **commission rule id/version** that is the default at that moment, the **client key** computed from the job's client name at that moment, and the **fee estimate A was shown** (`fee_estimate_minor`: flat → the flat amount; % → the BR-9 estimate, at least the minimum fee, **only if it was shown to A**, otherwise NULL; PD-051 Q4). The live salary band and live `share_salary` are never read for this referral's estimate after commit. Commit = the insert in `submit_referral` (recorded authorization) or `submit_referral_for_candidate` (candidate request created).
- **BR-12** Both submit RPCs take the **terms version id A was shown**. If it isn't the job's current version, the call returns a new outcome **`terms_changed`** (alongside N1's `created` / `stopped` / `pending_warning` / `identifier_required`): no referral, no email, no fingerprint write, an audit event only. The UI re-shows the new terms for A to submit again. On N1's two-step pending warning, the second call re-checks the version. The version check runs **before** N1's submission gate. A `terms_changed` counts toward the 30/h submit limit (PD-051 Q6).
- **BR-13** The snapshot is never edited after commit, in any status (including withdrawn, declined, cancelled, released), except by a concierge amendment (BR-34), which adds a version and never overwrites.
- **BR-14** *(N9 intact)* The snapshot is taken in the user-session submit RPC, not in `issue_candidate_request_token`. A **resend** (`rotate_candidate_request_token`) doesn't re-snapshot: if B changed the terms while the request awaited the candidate, the referral keeps the version A submitted under. The candidate page shows no terms.
- **BR-15** *(N1 intact)* The snapshot client key is stored only in a closed `app` table (no grants, never returned, never in audit metadata), like N1's keys. **N1's own client-key snapshot at delivery** in `app.referral_presentations` and its use by the duplicate check, sticky stops and referral evidence **don't change**. The two keys can differ only if B renames the client while a candidate request is pending. **RD-033:** N3 ownership scope is the union of both keys, and N3 hire matching checks either; renames after delivery change nothing; N1 keeps the delivery key only. No N2 change.

**Agreement**
- **BR-16** `app.create_agreement_for_referral` builds the agreement from the referral's snapshot: rule id, name, version and bps from the **snapshot rule** (internal referrals keep today's transform: 0 sourcing bps, sourcing + job-owner to the job owner), and a reference to the snapshot terms version (or to the latest concierge amendment, BR-34). It never reads the live job or the current default rule for a referral with a snapshot.
- **BR-17** Referrals without a snapshot (committed before N2) get an agreement exactly as today. The agreement's `terms_version` text keeps meaning "network rules version" and is unchanged.

**Ownership window**
- **BR-18** At delivery (`app.deliver_referral`, the single delivery path), `ownership_protected_until` = `delivered_at` + the snapshot's T9 months, as calendar months in `America/Toronto`, clamped to the month's last day (31 Jan + 1 month = 28/29 Feb). Set in the same transaction as `delivered_at`. First position stays timed at delivery (RD-004.1).
- **BR-19** Referrals without a snapshot get `delivered_at + 12 months` at delivery (RD-003, PD-009), including ones committed before N2 and delivered after. Existing stored dates are never recomputed. The column default and `respond_candidate_request`'s hard-coded 12 months are removed so BR-18/BR-19 are the only source. An undelivered referral's ownership date has no meaning: the column becomes nullable, existing **undelivered** rows are set to NULL at migration (PD-051 Q2), and it's never shown as protection.
- *Consequence, intended:* N1's "still counts", fingerprint purge and referral-evidence eligibility read `ownership_protected_until`, so for new referrals N1 protection lasts the job's window (6–12 months) instead of 12. No N1 code change is needed for that.

**N1 look-back**
- **BR-20** The prior-presentation claim's lower bound on the prior-process date becomes `delivered_at − T9 months` of the **claimed referral's** snapshot (same month arithmetic as BR-18). Referrals without a snapshot keep 6 months (N1 BR-12 as built). The claim deadline, contest window, holiday calendar and one-claim rule are untouched. The claim form's date picker and hint use the same bound.

**Hire**
- **BR-21** For a referral with a snapshot, the hire dialog shows the snapshot's basis, rate or amount, minimum fee, currency, guarantee length and remedy **read-only**. There is no currency picker and no guarantee field. The currency of the placement is the snapshot currency.
- **BR-22** **Computed fee (C):** `pct_base`: B enters the actual first-year annual base; `pct_total_cash`: base + target bonus, entered separately; C = round(rate × amount), and at least the minimum fee when set. `flat`: C = the frozen amount, and B enters **no base or bonus** (PD-051 Q9). The frozen rate applies even if the hire is into a different role at the same client (RD-003, E-10). Computed in the database; the UI shows the same figure (TS mirror).
- **BR-23** **Invoiced fee (I):** this hire's placement fee to the client, **retainer included, separate services excluded** (RD-031). Defaults to C. B may enter a different I only with a reason and an optional note (≤ 500 characters, no candidate PII). The placement stores C, I, the reported base (and bonus), the reason, the note and the terms version used. **Reason codes (PD-051 Q-5), one list for design and backend:** `client_discount` · `client_contract_rate` · `client_invoiced_other_currency` (RD-034) · `invoice_correction` · `other` (note required). A reason is refused when I = C.
- **BR-24** When I ≠ C, A is notified in-app with both numbers and the reason, and sees them, the base used and the note on the commissions page, with the existing dispute action. Base and bonus are visible to both orgs on the placement, never to candidates, never in audit metadata. **Recipients (PD-051 Q-8, N1 pattern):** the submitter of that referral, falling back to the source org's admins if the submitter is no longer a member.
- **BR-25** `guarantee_until` = start date + snapshot guarantee days (null when 0). The new `report_hire` signature takes no fee currency or guarantee for snapshot referrals; the server refuses any attempt to pass them. The old signature is dropped (not overloaded) and the `api-surface` allow-list updated.
- **BR-26** **Legacy referrals** (no snapshot) keep today's free entry (fee, currency, guarantee 0–365), enforced server-side by the absence of a snapshot, and show "terms not recorded (sent before the terms card)".

**Computed partner share (RD-025 a) and platform share (RD-025 b)**
- **BR-27** For a placement from a snapshot referral, each verified client payment or refund of net amount P (after processing fees, as today) is allocated with k = P ÷ I:
  - **sourcing** = sourcing_bps × max(C, I) × k (A's share is never computed on less than the frozen terms; paid only on client money received, so non-payment and allowed refunds are shared pro rata: E-13, RD-025);
  - **platform** = platform_bps × P when the agreement's platform basis is `collected`, or platform_bps × max(C, I) × k when it is `frozen` (BR-28);
  - **job owner** = P − sourcing − platform. It can be negative only when I < C without an amendment: B funds A's share of the discount from its own pocket.
  When I ≥ C every party gets exactly today's split (existing `allocate_minor`, unchanged rounding). When I < C, rounding is half-up per payment on |P| in integer minor units (`numeric` in SQL, `BigInt` in TS), the job owner takes the remainder (at most 1 minor unit of drift per payment, PD-051 Q7), and the SQL and TS implementations are parity-tested. **RD-031 confirms the floor:** when I > C, A shares the upside. **RD-034:** every collection shortfall, including invoice-to-receipt FX drift, is shared pro rata in N2; FX on the invoice itself is B's through the floor.
- **BR-28** The platform basis is a field on `commission_rules` (`collected` · `frozen`), frozen into the snapshot rule and the agreement like the bps. **Decided by the user: `collected` (PD-049).** The build implements and tests both values; the migration ships the rule as `collected`. Agreements already created keep their value.
- **BR-29** A's consent to a lower fee exists only as a concierge amendment recorded **before** the hire (BR-34). With an amendment, C is computed from the amended terms, so there's no floor gap. There's no consent checkbox at hire.
- **BR-30** Legacy placements keep today's allocation exactly (C = I).

**Terms changes**
- **BR-31** A terms change never alters an existing snapshot (BR-13). It applies to submissions made from then on.
- **BR-32** On a new version, source orgs with a **live** referral on the job (`awaiting_candidate`, `submitted`, `under_review`, `info_requested`, `accepted`, `interviewing`, `offer`) get one in-app notification each: terms changed, their referrals keep the terms they were sent under. Own distinct `kind`, PII-free, English-in-SQL per PD-026 (localised and emailed by N7). **Recipients (PD-051 Q-8):** the distinct members of that org who submitted a live referral on the job, falling back to the org's admins if none is still a member.
- **BR-33** Partner-visible jobs show "Terms updated on {date}" for 30 days after any version other than the first. When B edits a card on a job that has referrals, the form tells B that existing referrals keep their terms.

**Concierge amendment**
- **BR-34** A platform admin may record an amendment on a referral **with a snapshot**, in **any status**, closed ones included, **before a hire is reported** (RD-035; PD-051 Q5, Q-6), when both orgs asked in writing. Legacy referrals are refused. If an agreement exists, it's repointed to the amendment (the only allowed agreement change, PD-051 Q8). Admin entry point: `/admin/referrals` (lookup) and `/admin/referrals/[referralId]`. The amendment is a new **referral-scoped** terms version (T1–T9 only; never the split, the rule or the client key), a required reason, and **one reference per org's written request** (hiring and sourcing, two fields). It becomes the referral's effective terms for the agreement, the hire and the ledger; the original snapshot stays readable. Audited; both orgs notified in-app. After a hire, fee differences go through the hire report (BR-23) and disputes; a fee cut A agrees to after the hire is a dispute settlement with both orgs' written agreement, not an amendment (RD-035).
- **BR-35** Ownership date and claim deadlines are never moved by an amendment. If the amendment changes T9, it takes effect only for referrals not yet delivered; for delivered ones the admin form refuses a T9 change (the window is anchored at delivery, BR-18).

**Display**
- **BR-36** Both orgs see the referral's effective terms (snapshot or amendment), version number and date on the referral page; A's agreement confirmation shows the same terms. A's expected share on the referral page and the agreement dialog = the frozen `fee_estimate_minor` (BR-11) × the snapshot rule's sourcing bps (exact on flat, labelled as an estimate on % bases); when the estimate is NULL, both sides see "{rate} of the salary at hire" and no amount. Never the live job, the live band, live `share_salary` or the current default rule. **The sent-referral list shows basis and rate (or the flat amount) per referral and no money share** (PD-050, option c). The client key is never displayed.
- **BR-37** Referrals without a snapshot show "terms not recorded (sent before the terms card)" wherever terms would appear, and keep today's displays.

**i18n**
- **BR-38** Every card label, enum value, network-rule line and frozen term renders in en, fr-CA and pt-BR from structured fields. The snapshot holds no free text except the amendment reason and request references (admin-only) and the hire difference note. Every N2 money amount shows its ISO currency code (PD-051).

**Deferred rules (not built in N2; kept so N2.1 and N3 build from one definition, PD-050)**
- **BR-39** *(→ N2.1; rewritten per RD-032)* Admin flag on the admin overview, no automatic action, when either holds: **(a)** a version published **within 30 days after any delivered referral on the job** that is **worse for partners** than the previous version on at least one of: lower rate, or lower flat amount (same currency); lower or removed minimum fee; **any fee-basis change except `pct_base` → `pct_total_cash`** (flat ↔ % can't be compared, so it counts as worse); **flat currency changed**; longer guarantee (longer reversal exposure for A); remedy moved towards refund (replacement only < replacement then pro-rata < pro-rata refund < full refund); **longer client payment terms**; shorter window; **search type downgrade, ranked retained > contingent exclusive > contingent shared**; or **(b)** more than 2 versions in any 30-day window.
- **BR-40** *(→ N3 prerequisite)* A job can't be opened to external referrals without a real client name (non-placeholder per N1 BR-23), internal-only. Applies to the form; connector and API jobs without one can't be opened until it's added.
- **BR-41** *(→ N2.1)* If the reported base is more than 20% below the band minimum **frozen at commit** (stored in a closed `app` table, never on `referrals`, PD-051), the hire and A's commissions view show both numbers with a flag (E-3). Not applicable to flat fees.

---

## 7. Constraints

- **Security:** no direct writes to terms versions, snapshots or placements' computed fields from any client; all through `SECURITY DEFINER` RPCs with membership and role checks, `search_path = ''`, on the `api-surface` allow-list. Server Actions in `guard()` with Zod on every argument; the same Zod schema on the form. IDOR: version ids passed by A are checked to belong to the job and be current. Hiring orgs never receive candidate ids; partners never receive the client key or private job fields.
- **Privacy:** no new candidate PII. Base and bonus at hire are compensation data about a hired person, visible only to the two orgs and admins in disputes; the N7 PIA and Privacy Policy note them. The amendment reason must not contain candidate data (admin form hint).
- **Tenant isolation:** terms versions readable by the owning org; partners read the current version only through partner-visibility RPCs; snapshots readable by the two orgs of the referral.
- **Money:** integer minor units, no FX conversion, one currency per snapshot.
- **Migrations:** local only, `npm run db:reset` + `npm run db:types`. **No hosted push** unless the user asks. Before any hosted push: count referral-open jobs and undelivered pre-N2 referrals on the hosted DB (launch checklist, Ops); if any are real member data, **Needs user decision** (recommendation: proceed; owners complete cards from the nudge).
- **i18n:** en / fr-CA / pt-BR, fr ~25% longer (card layout must not truncate).
- **Accessibility:** WCAG 2.1 AA, 44px targets, labelled radio groups for enums, read-only hire values exposed as text (not disabled inputs).
- **Next.js 16:** frontend reads `node_modules/next/dist/docs/` per `AGENTS.md`; no Cache Components (ADR-0003).

---

## 8. Risks and open questions

### 8.1 Risks
| # | Risk | Mitigation | Owner |
|---|---|---|---|
| R-1 | Card friction: B keeps jobs private | ≤ 2-minute card with defaults; nudge copy explains the benefit; watch "jobs closed to partners by active orgs" | design, ux-writer |
| R-2 | The partner-visibility predicate is missed in one query, so a job without a card stays visible or submittable | one predicate function; QA checks every listing and both submit RPCs directly | backend, QA |
| R-3 | Ledger change breaks today's settlement flows | I ≥ C path uses the unchanged allocation; parity tests SQL ↔ TS; Journey A E2E stays green | backend, QA |
| R-4 | Negative job-owner allocation confuses B or breaks a status computation | commissions page explains "you owe the partner's share of the discount"; QA covers I < C through settlement | design, backend, QA |
| R-5 | Rate + estimate reveal the salary | estimate gated by `share_salary` (BR-9) | design |
| R-6 | Terms change races A's submission | `terms_changed` outcome (BR-12) | backend |
| R-7 | Amendment pressure on A (A-11) | admin-only, both orgs' written requests, audited; network rule ⚖️ | ops, counsel |
| R-8 | Shorter windows shorten N1 protection for new referrals | intended (RD-003); stated in BR-19 and the card | — |
| R-9 | Concierge workload | signal in §4 triggers the in-product flow | PM |
| R-10 | Total-cash disputes over what counts as target bonus | helper text; dispute playbook asks for the offer excerpt (base and bonus only) | ux-writer, ops |
| R-11 | **E-19 post-hire credit note:** B reports I = C, then credits its client; the shortfall looks like non-payment and is shared pro rata, dodging the floor. An upheld dispute can't adjust allocations in N2 (`resolve_dispute` only closes it) | A sees I and every payment and can dispute; the playbook settles it off-ledger and records the outcome; a "short-paid" marker and admin allocation adjustment → X6 / X1 (PD-052). Can't occur before the first placements | ops, PM |
| R-12 | Two-drop build leaves snapshot referrals on free hire entry between drops | drop 1 makes `report_hire` refuse referrals with a snapshot (`hire_terms_pending`); one QA pass after drop 2; no hosted push of drop 1 alone (PD-050) | backend, QA |
| R-13 | Overrun beyond ~14.25 days (range up to ~16.5) | backend reports at the end of drop 1 if it's over 10 days; PM re-plans then, not mid-drop | backend, PM |

### 8.2 Strategist questions: answered (RD-031 to RD-035, recruiting-input §12, PD-052)
- **S-N2-1 → RD-031:** floor, not cap. BR-27 confirmed; BR-23 defines I (retainer included, separate services excluded).
- **S-N2-2 → RD-032:** list confirmed and extended; timing after **any** delivered referral. BR-39 rewritten (built in N2.1).
- **S-N2-3 → RD-033:** union of both keys for N3 ownership scope. N3 input; no N2 change (BR-15).
- **S-N2-4 → RD-034:** shortfalls shared pro rata in N2; "client invoiced in another currency" added to the BR-23 reasons. E-19 gap → R-11.
- **S-N2-5 → RD-035:** amendments only before the hire (BR-34).

### 8.3 Counsel items ⚖️ (via N7, not blocking the build)
Frozen-terms and floor clause wording; the amendment rule and the ban on conditioning; window not shorter than B's client terms; the network-rule lines on the card (payout timing, before-tax shares) shown as draft until N7; French-first agreement for Québec parties; sales tax on shares (accountant); contractor/PJ/EOR hires counting as hires.

### 8.4 Needs user decision
- **Decided by the user on 2026-11-15: collected (PD-049).** **U-1 (RD-025 b, revenue):** when B discounts without A's prior written consent, is Workatent's platform share computed on the fee **actually collected** or on the **frozen terms**? **Recommendation: collected.** Workatent shouldn't profit from a penalty between members, and neutrality helps in disputes; the revenue difference exists only on discounted hires (I < C).
  - Recorded: rule ships `collected` (BR-28). Nothing else waits on the user for N2 except the hosted push.
- **RD-008 / RD-009 unchanged:** the card shows the current default rule (45/45/10) read-only, as the job form already does. No new pricing statement.
- **Hosted push** of N2 migrations: only on the user's request, after the Ops count in §7.

---

## 9. Team plan

Order and parallelism. Each step names its file; agents communicate through `docs/specs/job-terms-card/`.

**Done:** step 0 (U-1 → `collected`, PD-049), 1a (`spec.md` draft, 72 ACs), 1b (`backend-estimate.md`), 2 (this rev. 2: PD-044 addendum, PD-050 to PD-052). Strategist S-N2-1 to S-N2-5 answered (RD-031 to RD-035).

| Step | Agent | Delivers | Runs with | Blocked by |
|---|---|---|---|---|
| 2b | **product-designer** | Apply "Delta for design" (below) to `spec.md`: remove S1/S2/S3 flows, screens, copy and ACs (keep them in an appendix marked N2.1 / N3), close §9 with the PM answers, set status "ready for copy". Short pass | 4a | 2 |
| 3 | **ux-writer-marketing** | Final §5 copy en / fr-CA / pt-BR: glossary entries for fee basis, search type, guarantee remedies, "terms version", "terms not recorded", network-rule lines (marked draft; response line without "release"), `terms_changed`, the five I ≠ C reasons, negative-balance explanation, "{rate} of the salary at hire", Brazil and retainer helpers, `claim_date_invalid` / `priorDateTooOld` with `{months}`, new error codes | 4a | 2b |
| 4a | **backend-engineer**, drop 1 | M1–M7, M10, M13 and their share of M14–M16 (card, versions, flag guard, predicate on every surface, `get_opportunities`, `get_jobs_terms_state`, submit RPCs with `terms_changed` and the frozen estimate, agreement from snapshot, ownership at delivery, look-back), **plus the interim refusal in today's `report_hire` for snapshot referrals** (`hire_terms_pending`). Tests for all of it. `backend.md` **v1** (drop-1 contract) | 2b, 3 | 2 (brief rev. 2 + "Delta for backend") |
| 4b | **backend-engineer**, drop 2 | M8, M9, M11, M12 (trimmed) and the rest of M14–M16: `report_hire` v2 (removes `hire_terms_pending`), `compute_fee`, `allocate_placement` + parity, amendment RPCs + admin lookup, `get_referral_terms`, commissions fields. `backend.md` **v2**; updates `docs/domain-model.md`, `docs/security-and-privacy.md` (`architecture.md` unchanged unless service-role use changes). Reports to the PM at the end of 4a if the running total is > 10 days (R-13) | 5a | 4a |
| 5a | **frontend-engineer**, drop-1 surfaces | Card form section (replaces `commission-fields.tsx`'s amount-only mode), nudge on job list and job page, partner card on opportunities and the composer incl. `terms_changed`, referral-page terms panel and ownership footer, agreement dialog, sent list (basis and rate, no share), claim-dialog bound from the server, `f.money` currency-code option. i18n en/fr/pt from §5 | 4b | 3, 4a (`backend.md` v1) |
| 5b | **frontend-engineer**, drop-2 surfaces | Hire dialog (all variants), placement Fee panel, commissions list and tiles (negative job owner), admin `/admin/referrals` lookup and amendment form, admin metrics two counts. `frontend.md` (routes, components, keys, AC per screen) | — | 4b (`backend.md` v2), 5a |
| 6 | **qa-engineer** | `qa-report.md` on the **complete** N2 (no QA of drop 1 alone): every Must BR and AC, the scenarios below, N1 and N9 regression (integration + E2E), `lint`, `typecheck`, `test`, `test:integration`, `test:e2e` with real output | — | 5b |
| 7 | **product-designer** + **ux-writer-marketing** (review mode, parallel) | `design-review.md`, `copy-review.md` | each other | 5b (can overlap 6) |
| 8 | fix loop | bugs to owners, QA re-runs (max 3 rounds) | — | 6, 7 |
| 9 | **product-manager** | `acceptance.md`, roadmap and implementation-plan updated | — | 8 |

Backend and frontend never edit the same file at the same time: backend owns `src/features/*/{schemas,actions,queries}.ts`, `src/lib/money/*` and migrations; frontend owns components, routes and the formatter. The main session checks for overlap between 4b and 5a. The recruitment-strategist isn't needed: all N2 questions are answered. No hosted push of drop 1, nor of N2, unless the user asks (§7).

### QA scenarios (minimum)
1. Open a job to referrals without a complete card / with a contract job → refused; existing referral-open job without a version → invisible to partners on every listing and refused by both submit RPCs (direct calls), still listed for its owner with the nudge.
2. Card saved twice with no terms change → one version; terms change → version 2; direct update/delete of a version as owner, admin and service paths → refused.
3. A views v1, B publishes v2, A submits with v1 → `terms_changed`, no referral, no email, no fingerprint; resubmits with v2 → created with v2.
4. Confirmed path: request created under v1, B publishes v2, candidate confirms (and after a resend) → referral keeps v1; ownership = delivery + v1 window.
5. New default commission rule published between submission and acceptance → agreement uses the rule at commit.
6. Recorded path with 6-month window delivered on 31 Aug → ownership 28 Feb (ET); legacy referral delivered after N2 → +12 months; stored legacy dates unchanged.
7. Claim on a snapshot referral with a 12-month window accepts a prior-process date 11 months back; a 6-month one refuses it; legacy keeps 6.
8. Hire: % base, total cash (with minimum fee binding), flat (no base accepted); currency and guarantee can't be passed for snapshot referrals (direct RPC); legacy free entry still works only without a snapshot; each of the five reason codes accepted with I ≠ C, refused with I = C, `other` without a note refused.
9. I < C with reason → A notified with both numbers; allocation per BR-27 for both platform values; settlement completes; I ≥ C → identical to today's allocation; SQL ↔ TS parity.
10. Concierge amendment before hire → agreement/hire use amended terms, original visible, both orgs notified, audit; after hire → refused; T9 change on a delivered referral → refused; non-admin → forbidden.
11. Terms change notifies only sources with live referrals, once per org; "terms updated" line shows for 30 days.
12. Estimate hidden when `share_salary` off on % bases, flat amount still shown; candidate page shows no terms; client key absent from every response and audit metadata.
13. Connector / API job writes can't publish terms or open to referrals.
14. N1 regression: duplicate stop, pending warning two-step (now also re-checking the version), sticky stop, claim and contest, release; N9 regression: forged-token refusal, resend.
15. Legacy `awaiting_candidate` referral on a card-less open job → candidate confirms → delivered, +12 months, legacy agreement; a snapshot referral whose job became non-permanent or closed while pending → confirmation refused as today.
16. Frozen estimate: A submits with `share_salary` on → B edits the band and turns `share_salary` off → both sides' referral page still shows the frozen estimate; submitted with it off → both sides see "{rate} of the salary at hire"; sent list shows no amount.
17. Undelivered referrals have a NULL ownership date after migration; no UI shows a protection date for them.
18. Amendment on a declined referral without a placement → allowed; on a legacy referral → refused; repoints an existing agreement.
19. % card in CAD, connector changes salary currency to USD → job hidden from partners, owner reason `currency_mismatch`.

---

## 10. Definition of done

- Every Must BR and Should 4 has ACs in `spec.md` that pass in `qa-report.md` with real command output; no open blocker or major. BR-39 to BR-41 are out of N2 (N2.1 / N3).
- Both backend drops landed; `hire_terms_pending` no longer exists in the code.
- `design-review.md` and `copy-review.md` have no open blocker; en / fr-CA / pt-BR complete.
- U-1 recorded (PD-049); the rule's platform basis is `collected`.
- `backend.md`, `frontend.md` written; `docs/domain-model.md`, `docs/product-flows.md`, `docs/security-and-privacy.md` (and `architecture.md` if touched) updated.
- Migrations applied **locally only**; hosted push precondition added to the launch checklist.
- Roadmap N2 accepted, launch-checklist line ticked, `docs/implementation-plan.md` in sync.

---

## 11. Rev. 2 deltas (apply exactly; PD-050 to PD-052)

### 11.1 Delta for design (`spec.md`, step 2b)
1. **Scope out (move to an appendix "Deferred: N2.1 / N3", keep the text, drop the ACs from §7 and the traceability table):** 2.8 terms-worsening flag and S11 flag panel (N2.1); the two S11 metrics "hires with invoiced ≠ computed" and "terms amendments (30 days)" (N2.1); below-band alert in 2.6, 2.7 item 7 and its AC (N2.1); every BR-40 client-name element in 2.1 / S1 / nudge reasons / copy (N3). Renumber nothing that's kept; mark removed ACs "moved to N2.1/N3" so references stay stable.
2. **Keep on the admin overview (Must):** two counts only, from the existing admin metrics: "partner-visible jobs with complete terms" and "referral-open jobs hidden for missing terms". Same load-error pattern.
3. **Q-4 default overridden (BR-11, BR-36):** the referral page and the agreement dialog show A's expected share from the **frozen estimate** for **both sides**. When there's no frozen estimate, both sides see "{rate} of the salary at hire" and no amount. Never the live band or live `share_salary`. Remove "always shown to the hiring side".
4. **Sent list (2.4 item 6, PD-050 c):** no money share. Show the referral's basis and rate (or flat amount + currency) from its snapshot; legacy rows show "Terms not recorded". Update the AC.
5. **Q-11:** delete the band-source default; the below-band alert is N2.1.
6. **Q-1:** spec default stands (legacy referrals deliver on card-less open jobs). Add an AC: legacy pending referral on a card-less job → confirmation delivers, ownership footer + 12 months.
7. **Q-2, Q-3, Q-5, Q-8, Q-9, Q-10:** defaults confirmed as written. Q-5's five codes are final and shared with backend.
8. **Q-6:** routes confirmed; any status without a placement. The form has **two** reference fields (hiring org, sourcing org) as drafted.
9. **Q-7:** partly: only the two counts in item 2.
10. **Q-12:** keep the response line as a ⚖️ draft line; wording must not say "release" and must not imply ownership is lost (RD-007). ux-writer owns the final string.
11. **Forged / other-job `termsVersionId` (2.3 table):** change to **`terms_changed`** with this job's current version, like an older version. Nothing about the other job is returned (backend's IDOR-safe choice, no existence oracle). A non-UUID value fails Zod as a generic error.
12. **Error codes:** use the shared list in 11.2 item 10 (`hire_terms_fixed`, `amendment_after_hire`, `amendment_window_after_delivery`, `amendment_no_change`, `amendment_legacy_referral`, plus `hire_terms_pending` which needs no UI copy beyond the generic error, since it disappears before QA).
13. **Currency codes** on every N2 money display, via the `f.money` code option (frontend). Confirmed.
14. **Undelivered referrals:** never render an ownership date (the column is NULL). Spec 2.4 item 5 already says this; add an AC if missing.
15. Header: inputs → brief rev. 2, PD-050 to PD-052. §9: mark Q-1 to Q-12 answered with a link to PD-051. Status → "ready for copy".

### 11.2 Delta for backend (`backend-estimate.md` → build, step 4a/4b)
1. **Scope:** drop S1, S2 and S3 from the build. No `terms_worsening_flags`, no `no_client_name` reason or predicate clause, no `band_min_at_hire_minor`. Do **not** add a band-minimum column to `referrals` (it would leak the salary through RLS); N2.1 will use a closed `app` table.
2. **Two drops, one QA (PD-050).** Drop 1 = M1–M7, M10, M13 + matching M14–M16, and in it the existing `report_hire` raises **`hire_terms_pending`** when the referral has `terms_version_id` set (legacy free entry still works). Drop 2 = M8, M9, M11, M12 (trimmed) + remaining M14–M16; it drops the old `report_hire` and with it `hire_terms_pending`. Write `backend.md` v1 after drop 1 and v2 after drop 2. Report the running total to the PM at the end of drop 1 if it's > 10 days.
3. **Q1:** V3 as proposed: legacy referrals (no snapshot) keep today's delivery check; snapshot referrals use `app.job_partner_visible`. Test both.
4. **Q2, Q3, Q5, Q6, Q7, Q8, Q9:** defaults confirmed as written in §10.
5. **Q4:** `referrals.fee_estimate_minor` frozen at commit **only when it was shown to A** (the same gating as `get_opportunities.estimated_fee_minor`; flat → the flat amount). Guard trigger: insert-only. `get_referral_terms.expected_share_minor` = estimate × snapshot sourcing bps (NULL when internal or no estimate). Returned identically to both sides.
6. **M12 trim (option c):** `get_sent_referral_jobs` drops fee/share (as proposed) and the sent list gets per-referral basis, rate or flat amount and currency (embedded select via RLS or `get_referral_terms`, your choice), **no share computation** for the list.
7. **Reason codes (BR-23), replace §2.6's list:** `client_discount`, `client_contract_rate`, `client_invoiced_other_currency`, `invoice_correction`, `other` (note required). Check constraint + Zod enum + TS type.
8. **Amendment:** allowed in any referral status while no placement exists. **Two** reference fields: `app.terms_amendment_notes` gets `hiring_request_reference` and `sourcing_request_reference` (3..200 each) instead of one `request_reference`; `admin_amend_referral_terms` takes both. Refuse a no-op amendment (T1–T9 equal to the effective terms). Add an admin lookup that resolves a referral by id (the frontend parses the URL), returning the meta the admin page needs (job title, both org names, status, delivered date, placement id, client as partners see it), platform admin only, `not_found` otherwise. Allow-list it.
9. **Notifications (Q-8):** `job.terms_changed` once per source org, addressed to the distinct submitters of that org's live referrals on the job, falling back to the org's admins; `placement.fee_difference` to the referral's submitter, same fallback. Follow N1's recipient helper.
10. **Error codes (shared with design):** rename `terms_frozen` → **`hire_terms_fixed`**, `hire_already_reported` (amendment) → **`amendment_after_hire`**, `window_locked` → **`amendment_window_after_delivery`**, `terms_not_recorded` (amendment) → **`amendment_legacy_referral`**; add **`amendment_no_change`** and the interim **`hire_terms_pending`**. Keep `terms_not_recorded` for snapshot params passed to a legacy `report_hire`. Others as in §6.
11. **Forged/other-job version id:** `terms_changed` as proposed (§4.4 step 3). The action re-reads the current version for the UI (via `get_opportunities`); record the payload shape in `backend.md`.
12. **Admin metrics (V7):** add `referral_open_without_terms` and the partner-visible count; nothing else in N2.
13. **Effort:** with the trim, Must ≈ 14.25 days. The additions above (two reference columns, no-op check, admin lookup, recipient pattern, interim refusal) are expected to fit within M11/M4/M8's ranges. Flag it if they don't.
