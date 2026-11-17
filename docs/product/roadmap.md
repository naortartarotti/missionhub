# Workatent product roadmap

Owner: Product Manager · First version: 2026-11-12 · Updated 2026-11-15 with the Top Echelon analysis outcomes (PD-055); 2026-11-16 N2 accepted (PD-059 to PD-064); 2026-11-16 N3 brief ready (PD-066 to PD-070) · Next review: when N1–N3 are accepted, or when the user decides RD-008/009/010/012, whichever comes first.

Inputs: `docs/strategy/` (all four files, esp. `decisions.md`, `recommendations-for-pm.md` and `network-rules-v1.md`), `docs/research/top-echelon-policies-analysis.md` (§5, §6), `docs/content/network-rules/` (member-facing drafts), `docs/implementation-plan.md`, `docs/content/copy-audit.md`, the code on 2026-11-12 and 2026-11-15. Prioritisation calls are logged in [`decisions.md`](./decisions.md) (PD-###).

**Goal of this period:** invite a founding group of 30–50 vetted recruiting orgs in the Montréal–Toronto corridor (RD-001, RD-002) with a product whose core promise, "Split placements, without the risk", is true.

**North-star metric:** verified placements per month in the corridor.
**Leading indicators:** % of active candidates with a Strong partner match · median hiring-recruiter first response (business days) · duplicate/ownership disputes per 100 delivered referrals · platform fee collected / due.
**Watch metric (no product):** % of org pairs that close one placement on Workatent and then stop, with both orgs still active (RD-008 signal). We don't charge on off-platform splits (non-circumvention rejected, PD-053.1); this metric only tells us whether product value is keeping pairs on-platform.

Effort: **S** = days · **M** = 1–3 weeks · **L** = more than 3 weeks or vendor-dependent (strategist scale).
Status values: `brief ready` · `not started` · `blocked: <decision>` · `in progress` · `accepted`.

## Pending user decisions and what they block

| Decision | Blocks | Does NOT block |
|---|---|---|
| **RD-008** pricing (10% list, 5% founding rate) | N6b pricing line and FAQ · X7 founding rate in commission rules · X1 invoice amounts · **inviting the founding group** (we can't recruit members without telling them the price) | All of N1–N5, N6a, N8 build work |
| **RD-009** platform-fee collection ⚖️ | X1 platform invoice · the collaboration agreement template in N7 (whether Workatent is a named party) → therefore the launch gate | N1–N5 build. N3 two-sided hire reporting ships under today's remittance model (PD-008) |
| **RD-010** licensing posture ⚖️ | **Launch gate** (inviting the first recruiters) · final wording of the licence fields and Verified badge in N5 · positioning copy that could read as "we find you candidates" | All build work. N5 collects licence numbers anyway (RD-002) |
| **N1 support address** (PD-025) | The N1 stop's support line in production (launch checklist) | N1 build (the line is hidden while unset) |
| **RD-012** "Free to start" | N6b landing hero line | Everything else. Interim option (drop the line with no replacement) also needs the user's OK, see PD-004 |
| ~~**U-1 / RD-025 (b)**~~ **decided 2026-11-15: collected (PD-049)** | — | — |
| ~~**RD-056 / U-N3-1**~~ **decided 2026-11-16: normal rate on the fee collected, no surcharge (PD-071)** | — | — |
| **N3 counsel questions Q-1 to Q-4** ⚖️ (posture approved, PD-071; **sending to counsel is pending, user**) | Turning on `deemed_agreement_enabled` in production (Q-1); launch text of rules 6.3/6.4 (Q-2, Q-3); PIA line (Q-4) | N3 build (PD-067) |
| **Network Rules v1 text approval** (P0-1, PD-053.7) ⚖️ — founder and counsel approve the drafts in `docs/content/network-rules/` | **Launch gate** (members accept the rules at joining, N10). Also fills the placeholders: effective date, fee terms (6.8, needs RD-008/009/012), support address (8.1, PD-025), 7.5 and 10.6 values | N10 build (it versions whatever text is approved; the build uses the draft) |
| **Dispute clause details** (P0-5, PD-053.2) ⚖️ — arbitration institution, seat (Toronto or Montréal), governing law, language, costs. Counsel proposes, founder decides | Rule 7.5 text → launch gate | All build work |
| **Competition-law opinion** (P0-6) ⚖️ (Competition Act s.45), then RD-039's post-hire non-solicit (`Needs user decision`; strategist recommends 6 months after start, placements only) | Final wording of rules 3.4–3.6 (launch gate, legal checklist). Any post-process non-solicit: v1 is during-process only (PD-053.5), so the post-process scope waits for the opinion and doesn't block launch. Rule 3.3 (transaction channel, PD-054) isn't a non-solicit and doesn't depend on it | N10 build |
| **Rules summary on the acceptance screen** (network-rules README, founder item 2) — optional ~150-word non-binding summary ⚖️ | N10 acceptance screen copy only | N10 build |

---

## Now: trust minimum and launch gate

Ordered by priority. Everything in Now must be true before the founding group is invited (see the launch checklist below).

### N1. Duplicate and prior-presentation protection
- **Problem:** The same person in two agencies' databases can be submitted twice to one job (dedup is per candidate *record* × job). A hiring recruiter can decline a referral as `duplicate` with no evidence, the classic backdoor excuse. Contested "we already had them" claims have no dispute path, because disputes need a placement.
- **Target user:** sourcing recruiters (P1 Isabelle, P2 Marc); hiring recruiters (P3 Priya), who also don't want to pay twice or fight a client over a duplicate CV.
- **Expected impact:** removes the #1 split-fee dispute category; makes "first confirmed presentation wins" enforceable; lays the referral-level dispute foundation N3 reuses.
- **Metric:** duplicate-related disputes per 100 delivered referrals; fingerprint hits per 100 submissions; % of prior-presentation declines with evidence (100% by construction); claim contest rate.
- **RD:** RD-004 (and RD-003 for what "presented" means).
- **Dependencies:** none on pending user decisions. Strategist questions Q-1…Q-9 all answered (RD-013 to RD-021). Fingerprint retention (O-1) needs a privacy call (user/counsel, default proposed); needed for launch, not the build.
- **Effort:** M · **Status:** **accepted** 2026-11-15 (PD-034) → [`acceptance.md`](../specs/duplicate-prior-presentation/acceptance.md), [`brief.md`](../specs/duplicate-prior-presentation/brief.md). Built and applied **locally only**. The hosted push waits for the user and the `storage.objects` trigger check (launch checklist).
- **N1 follow-ups:**
  - Candidate-confirmation integrity (QA X-1) → **N9** (accepted 2026-11-15, PD-041).
  - Notification emails, including the required claim-filed email → **N7** (PD-030, launch gate).
  - Live keyboard and dark-mode pass (AC-61, AC-62) → launch checklist (PD-034).
  - Yearly holiday seed → "Recurring operations" (PD-037).
  - Hosted-push trigger check, full E2E suite green → launch checklist.
  - Test isolation, N1 polish → "Engineering hygiene".
  - Unused keys `referrals.success.claimFiled` / `contested` → N6a.
  - Release from declined/rejected, internal-routing flag, ownership display on released referrals → N3 (already listed).

### N2. Job terms card, frozen into the agreement
- **Problem:** Sourcing recruiters don't see fee basis, guarantee, payment terms, exclusivity or ownership window before submitting. The guarantee is only entered at hire. New referrals still get a fixed 12-month ownership date that over-promises versus most client contracts.
- **Target user:** sourcing recruiters choosing what to work on; both sides in a dispute.
- **Expected impact:** fewer terms disputes, better job selection by partners, and the per-job ownership window that N3 enforces (RD-003: default 6 months, range 6–12; existing referrals keep 12).
- **Metric:** % of partner jobs with complete terms; submissions per active partner job; disputes citing terms; % of hires where the invoiced fee differs from the computed one.
- **RD:** RD-003, RD-005, RD-006, **RD-022 to RD-028, RD-031 to RD-035**.
- **Scope (PD-044 to PD-047, PD-050 to PD-052):** card T1–T10, immutable terms versions, partner-visibility gate (permanent only; existing referral-open jobs hidden until the card is completed), snapshot at commit (terms + rule version + client key + the estimate A saw, `terms_changed` outcome), agreement from the snapshot, window from the snapshot (legacy keeps 12 months), N1 look-back on the snapshot window, snapshot-driven hire dialog, partner share floored at the frozen terms (RD-025 a, RD-031), change notifications, concierge amendment. Should: Brazil/retainer helper text only. **PD-044 fallback triggered (PD-050):** client-name gate → N3 prerequisite; worsening flag and below-band alert → **N2.1**; sent list shows no money share. Guarantee-limited reversals and the E-19 credit-note gap → X6.
- **Dependencies:** U-1 decided (collected, PD-049). Strategist S-N2-1 to S-N2-5 answered (RD-031 to RD-035). Migrations local only; hosted push on the user's request after the Ops count (launch checklist), never drop 1 alone.
- **Effort:** M–L (backend ~14.25 days accepted (PD-050); actual about 16.5 days, top of the accepted range, because of three review rounds that fixed real money and availability defects (PD-059)) · **Status:** **accepted** 2026-11-16 (PD-059 to PD-064) → [`acceptance.md`](../specs/job-terms-card/acceptance.md), [`brief.md`](../specs/job-terms-card/brief.md). QA PASS after fix round 3. Built and applied **locally only** (migrations `20261116000100` to `20261116000700`). The hosted push goes **together with N1 and N9**, only on the user's request, after the launch-checklist checks (Ops).
- **N2 follow-ups (acceptance §6):**
  - F-0 docs: `domain-model.md` and `security-and-privacy.md` don't describe N2 yet → backend-engineer, before the N3 backend handoff and any hosted push (the one open DoD item).
  - F-1 Q-R1 answered (PD-062): a flat → % amendment takes the job's current salary currency (as the server does). The admin form must show, parse and post that currency → backend + frontend + QA, ~0.5 d, **before launch**.
  - F-2 browser pass of the UI-only ACs and the legacy variants (en/fr/pt, 375px, dark) → qa-engineer with N1's AC-61/62 pass, **before launch** (launch checklist).
  - F-3 QA-PRE-02 pagination and F-4 N1 AC-66 test budget → Engineering hygiene, before launch.
  - F-5 design and copy polish (P-4, P-8, P-11, P-14, P-17; copy P8, P9, P14) → N2.1. P-16 (owner estimate fee-only) accepted as built (PD-061). P-21 → Engineering hygiene.
  - **Coordination risk (PD-064):** N2 redefines 8 functions of `20261115000300_recruiter_record_scope.sql` (owned by another session) as copies. That file must not be edited again; changes to those functions go in a new migration after `20261116000700`, starting from the N2 body. Its md5 (`dcd27209…`) is checked before every hosted push (launch checklist, Ops; Engineering hygiene).
  - E-19 credit-note gap → X6 / X1 (PD-052). Client-name gate (S2) → N3 prerequisite.

### N2.1. Terms follow-up: worsening flag and below-band alert (from N2, PD-050)
- **Problem:** B can worsen a job's terms for future partners right after receiving referrals (A-1), or report a base far below the band it advertised (A-8, E-3), and nothing surfaces it.
- **Target user:** platform admins (flag); sourcing recruiters (below-band alert).
- **Expected impact:** catches bait-and-switch patterns before they become disputes; gives A both numbers at hire.
- **Metric:** worsening flag firing rate (> 5% of partner jobs → revisit RD-024); disputes citing a low base.
- **Scope:** N2 BR-39 as rewritten per RD-032 (flag on the admin overview, any-delivery timing, extended list); BR-41 below-band alert against the band minimum **frozen at commit** in a closed `app` table (PD-051); the admin N2 metrics panel (I ≠ C hires, amendments, 30 days; spec S11). **Plus the N2 polish batch (PD-063):** design P-4 (reason placeholder, needs a ux-writer key), P-8, P-11, P-14, P-17; copy P8, P9, P14.
- **Dependencies:** N2 accepted (2026-11-16). Design and ACs already drafted in the N2 spec appendix. Estimate with the money-bounds line and fix-loop buffer (PD-059).
- **Effort:** S (backend ~1.5 days + admin UI + polish) · **Status:** not started, ready for a short brief update. Not a launch gate; after N3's build starts.

### N3. Referral-level claims and two-sided hire reporting
- **Brief rev. 1 (2026-11-16, PD-066 to PD-070):** [`brief.md`](../specs/referral-claims-two-sided-hire/brief.md), 44 BRs. Two paths on one governing referral: B records a hire from any counting referral (any status, other role, sister org, record-only on released referrals); A files a hire report with dated evidence; B confirms or contests; one rebuttal; admin upholds, rejects or voids. Fee-pending placements with the frozen estimate; release from declined/rejected; ownership line on both sides; RD-029 authorization check; admin flags HA-1/HA-6/HA-9.
  - **Prerequisites built first inside N3 (drop 1):** S2 client-name gate (BR-1) and O-1 server-only delivery (BR-2). N2 F-0 docs before the backend handoff.
  - **Gated:** silence = deemed confirmation only after **N7** emails with delivery and bounce records (PD-066, PD-070); until then unanswered reports go to the admin queue. Deemed-agreement placements on never-accepted referrals behind `deemed_agreement_enabled`, **off in production** until counsel Q-1 and N10 acceptance (PD-067). Q-2 to Q-4 ⚖️ ship as launch-gated drafts. Rule 6.4 sanctions and settlement-mode access → N10.
  - **User checkpoint done 2026-11-16 (PD-071):** U-N3-1 = normal platform share on the fee collected, no surcharge (RD-056 decided); U-N3-2 counsel posture approved (sending to counsel pending, user); U-N3-3 effort accepted.
  - **Scope addition (PD-072):** N2 leftovers QA-N2-12 (refuse a flat → % amendment when the salary currency changed), QA-N2-10, QA-N2-11 and three doc fixes in backend drop 1.
- **Problem:** Ownership protection is a date on screen with nothing behind it (`ownership_protected_until` is stored, never enforced). Only the job-owner org can call `report_hire`, i.e. the party that owes money is the only one who can report the hire, and only from `offer`. A sourcing recruiter who suspects a backdoor has no in-product path.
- **Target user:** sourcing recruiters; honest hiring recruiters who need to self-report late or other-role hires; Workatent revenue.
- **Expected impact:** makes "Split placements, without the risk" credible in the first demo; protects the platform fee.
- **Metric:** hire reports → placements (≥ 50% [estimate]); median report → resolution ≤ 15 business days; self-recorded hires on non-`offer` referrals > 0; contested reports upheld < 30% [estimate]; fee-pending placements > 20 business days → 0; client-key coverage on referral-open jobs 100%.
- **RD:** RD-003 (window and scope), RD-007 (released referrals keep ownership), RD-029, RD-030, RD-033, **RD-050 to RD-056**. RD-009 only for the revenue follow-through, which is X1.
- **Dependencies:** N1 (referral-level disputes, accepted), N2 (per-job ownership window and terms snapshot, **accepted** 2026-11-16, PD-059), **N9** (accepted 2026-11-15, PD-041). Strategist inputs complete: Q-1 → RD-029, S-1 → RD-030 (PD-048); S-N2-3 answered by RD-033: ownership scope is the union of the commit key and the delivery key, and hire matching checks either. Not blocked by RD-009 (PD-008).
- **From RD-029 (candidate confirmations, PD-048):** a confirmation counts for first position and fee even after a recent email change or record creation (no downgrade, no waiting period, nothing shown to the hiring side). Evidence adds "Candidate record created on {date}" when created within 30 days before issuance (source org and admins only). **Must:** admin authorization check, requestable by a stopped submitter (PD-025 support path, first submitter not revealed), the candidate, or the hiring side in a claim or hire dispute. The source org has 5 business days to give independent right-to-represent evidence. If invalid, the presentation is void (no first position, no fee), the consent is marked disputed and the case goes to RD-002 breach review. **Should:** refuse confirmation destinations equal to a source-org member's email or on its own verified domain (not freemail).
- **From RD-030 (sourcing-side hire reports, PD-048):** eligible on any delivered referral that still counts, **withdrawn included**, unless explicitly released (never on `already_presented`, `awaiting_candidate`, `candidate_declined`). The sourcing side gives employer, approximate start month, role if known, how it learned, at least one dated evidence item and an attestation (no offer letter). Hiring side sees statement, evidence type, dates and hash; files are admin-only. 10 business days to confirm (completes the hire from the N2 snapshot) or contest (not hired by client/affiliates; outside the window, with dated evidence; different person; not this client, revealed only as "not this client"). Silence → deemed confirmed and a referral dispute auto-opens for the fee details (**Should:** pause B's new partner jobs until recorded). The hire counts if the offer was accepted (else start) within the window; reports allowed until 6 months after the window ⚖️. Rate limit; 2 rejected reports in 90 days flag the sourcing org. Needs the N7 notification emails (deemed confirmation on silence).
- **Also in N3 from N9 (PD-043):** O-1 prerequisite. `record_candidate_request_delivery` becomes server-only (or delivery is recorded inside the service-role issuance path), so the "sent" time in consent evidence can't be set by a recruiter without an email.
- **Prerequisite (RD-020, PD-023): real client name required on referral-open jobs.** Before N3 ships, jobs open to **external** referrals need a real, non-placeholder client name (BR-23 placeholder list), kept internal-only. Connector and API jobs without one can be created but can't be opened to external referrals until it's added. Problem: "same end client, any role" ownership can't be enforced without a client identity, so a blank name is a split-free backdoor. Target user: sourcing recruiters (protection), hiring orgs (clear rule). Metric: client-key coverage on referral-open jobs → 100%. Effort: S (job form, open-to-referrals gate, copy, migration nudge for existing jobs). **Pull forward** if coverage is below 50% after the founding cohort's first 4 weeks. Counsel: network-rules wording and client-NDA fit ⚖️ (N1 brief C-8). Status: not started.
- **Also in N3 from N1 (RD-019):** block release once a hire is reported on the referral's client; decide release from `declined`/`rejected` referrals if the N1 follow-up hasn't shipped it (PD-021). Make the hiring-side ownership display true for released referrals without revealing the release (PD-027, N1 R-17).
- *(The RD-029, RD-030, O-1, client-name and RD-019 notes above are the pre-brief inputs; the brief supersedes them where they differ: RD-030's silence bullet and "pause B's partner jobs" Should are replaced by RD-053.)*
- **Effort:** **L** (PD-069): backend ~20.4 days incl. money-bounds line and 15% fix-loop buffer (range ~18–23; bar 18 days before buffer, cut list in PD-069), frontend ~11, designer 3.5, ux-writer 3.5 (incl. Network Rules 6.3, 6.4, 7.2), QA ~5. Two backend drops, one QA. **Reconciled (PD-073): backend 19.25 days before buffer, ~22.1 with it** (inside the accepted range; reopen → N7, metrics and HA-1/HA-9 → Ops SQL). Must 0b done. · **Status:** **accepted** 2026-11-16 (PD-081) → [`acceptance.md`](../specs/referral-claims-two-sided-hire/acceptance.md), [`brief.md`](../specs/referral-claims-two-sided-hire/brief.md) rev. 2. QA PASS after fix round 1 (N3 integration 96/96, N3 E2E 5/5, regression E2E 41/41, 308 unit tests, lint and typecheck clean). Built and applied **locally only** (migrations `20261117*`, on the same branch and DB as N10). 42 of 45 BRs accepted; BR-16 and BR-39 (Shoulds) not built; BR-30 moved to N7.
  - **N3 launch gates (acceptance §3):** counsel Q-1 to Q-4 (user sends, pending); `deemed_agreement_enabled` off in production; Network Rules 6.3 / 6.4 / 7.2 merge after counsel; client names stored at commit and delivery before the first real referral (PD-079); browser and visual pass incl. measured contrast of design B-2 / B-3; N7 items (BR-30, delivery and bounce records, `fee_details_due_at`); holiday seed 2030 by 2028-06-01; two hosted counts before the push.
  - **N3 follow-ups (acceptance §5):** `{placementId}` in `hire_already_recorded`, business days left on admin deadlines, exported hire-state and admin types, design polish P-1 and P-3 to P-14, `monthYear` unit test; admin "Invoice overdue" → X9; HE-3 → X6; Shoulds → backlog.

### N4. Response SLA, reminders and released referrals
- **Problem:** Nothing makes hiring recruiters respond. Black-hole submissions kill sourcing-side engagement.
- **Target user:** sourcing recruiters; network health.
- **Expected impact:** faster cycles, repeat submissions, and the response data reputation (X2) needs.
- **Metric:** median first response (target ≤ 3 business days); released-referral rate (< 15%).
- **RD:** RD-007.
- **Dependencies:** business-day calendar built in N1 (reused). Email reminders need the production email provider (N8); in-app reminders don't.
- **Effort:** S–M · **Status:** not started

### N5. Curated onboarding and member verification
- **Problem:** Any org can sign up and open jobs to the whole network. No trust signal. Ontario members must not knowingly use an unlicensed recruiter ⚖️.
- **Target user:** all members; platform admins.
- **Expected impact:** a trust baseline, fewer bad actors, a true "verified network" launch story.
- **Metric:** approval time (target ≤ 5 business days); % of applicants approved; disputes per approved org.
- **RD:** RD-002; RD-010 for licence wording.
- **Dependencies:** build not blocked. Licence-field and badge wording wait on RD-010 counsel opinion ⚖️. Admins must be staffed to review (ops).
- **Effort:** M · **Status:** not started

### N6a. Glossary and copy cleanup (no pricing)
- **Problem:** "Workspace" still appears in marketing CTAs and onboarding; copy-audit §3–§8 (tone, fr-CA, pt-BR, mechanics, hard-coded text) are open; "Ownership protected until {date}" implies an enforcement that doesn't exist yet.
- **Target user:** prospects and members; the ux-writer.
- **Expected impact:** credibility with sceptical recruiters; consistent fr-CA (beachhead).
- **Metric:** copy-audit open findings → 0 for §3–§8; signup conversion (watch, not target).
- **RD:** RD-011 (decided).
- **Dependencies:** none. ux-writer-marketing only (plus a frontend pass for 3.9 and 6.7). The non-legal parts of §9 (9.2, 9.10) are included; ⚖️ items 9.4–9.9 go to N7.
- **Also from N1 acceptance:** delete the unused keys `referrals.success.claimFiled` and `referrals.success.contested` in en / fr / pt (backend no longer returns them).
- **Also from the Top Echelon analysis (P0-4, PD-055): purpose notice on received data.** On the received referral (hiring side) and on shared-document download: "Shared only for {job}. Don't use it for anything else or share it outside your organization", with a link to the Network Rules (rules 2.1–2.3). ux-writer (en / fr-CA / pt-BR) + frontend; no backend. The link target goes live with N10; until then the notice ships without the link. Metric: 100% of received-referral screens show the notice; misuse reports per 100 delivered referrals (watch, from N10).
- **Effort:** S · **Status:** not started (can start immediately, in parallel with everything)

### N6b. Pricing line and pricing FAQ
- **Problem:** "Free to start" (`landing:hero.note`) likely misleads; the success-fee model isn't stated anywhere.
- **Target user:** prospects.
- **Expected impact:** removes a credibility risk and a demo objection.
- **Metric:** pricing questions in demos; signup conversion.
- **RD:** RD-008, RD-012.
- **Dependencies:** **blocked: RD-008 and RD-012 (user)**. Interim: remove the line without replacement, if the user agrees (PD-004).
- **Effort:** S · **Status:** blocked: RD-008, RD-012

### N7. Legal and Québec compliance pack ⚖️
- **Problem:** No counsel-reviewed Terms, Privacy Policy, collaboration agreement / network rules (ownership, duplicates, SLA, non-solicit, guarantee). Law 25 requires a PIA before personal information leaves Québec (OpenAI, email vendors). Consent texts and residency claims are unverified (copy-audit 9.4–9.9).
- **Target user:** all members, Québec members first (beachhead); candidates.
- **Expected impact:** removes the launch blocker; becomes a selling point in Québec.
- **Metric:** counsel sign-off per document; Québec org activation rate.
- **RD:** RD-001, RD-002, RD-003, RD-004, RD-006, RD-010; RD-009 for the agreement structure.
- **Dependencies:** **RD-010 (user, counsel)**; **RD-009 (user)** decides whether Workatent is a party to the agreement. Product work inside: org-level AI setting defaulting off for Québec orgs until the PIA is done (S), final fr-CA consent texts, residency statement once N8 confirms the region. **Localised in-app notifications** (S; backend + frontend + ux-writer). Every notification kind is rendered from `kind` + PII-free params with en / fr-CA / pt-BR keys, replacing the English titles written in SQL (PD-026). **Notification emails** (S–M, ~2 days; backend + ux-writer + QA, built in the same pass): an outbox job per notification and a worker handler (a service-role use that `architecture.md` must list), rendered from `kind` + params in the recipient's locale and sent idempotently through `sendEmail`. It covers every kind, including N1's closure, claim filed, dispute opened and dispute resolved. The **claim-filed email is required** before launch, because it starts a 10-business-day contest window (PD-030). **For N3 (PD-070):** the hire-report notice goes to B's job owner and every org admin and manager, plus reminders and outcomes, and each email is **recorded per recipient as delivered or bounced** (bounce events from the N8 provider) in the store N3's BR-29 reads. Without it, deemed confirmation never runs and every unanswered hire report goes to the admin queue. The hire-report-filed email is required before launch. **N7 also builds N3's BR-30** (admin reopen of a deemed confirmation, PD-073, PD-074); deemed confirmation can't be enabled without it. **N7 acceptance conditions for N3:** BR-30 built; the hire-report view returns `fee_details_due_at`, so the deemed-confirmed line shows the fee-details date instead of "—" (N3 gap 7, PD-079). Depends on N8 (production email provider). Moved up from Next (PD-005).
- **Network Rules (Top Echelon analysis, PD-053, PD-055):** the conduct content of the network rules now exists as drafts (`docs/strategy/network-rules-v1.md`, member-facing `docs/content/network-rules/{en,fr-CA,pt-BR}.md`). Counsel work added to this pack: P0-1 text review (Bill 96, CCQ 1435–1437, the ⚖️ index in each file), **P0-5** dispute clause (negotiation → mediation → arbitration; Workatent decides platform effects only), **P0-6** competition-law opinion on rules 3.4–3.6, French version offered first in Québec and which version governs (10.6). Acceptance and enforcement product work is **N10**.
- **Effort:** S–M product, L calendar (counsel) · **Status:** not started. Counsel engagement should start now (user).

### N8. Production readiness for launch
- **Problem:** The hosted Supabase region isn't confirmed as `ca-central-1`; email delivery isn't confirmed in production (candidate confirmation links and reminders depend on it); document scanning is heuristic only ("not a full AV") while documents cross tenants; `security-and-privacy.md` still lists app-level rate limiting as open.
- **Target user:** everyone (security and privacy are hard constraints).
- **Expected impact:** no launch-day privacy or security incident; a true "hosted in Canada" statement.
- **Metric:** checklist items closed; zero unscanned documents shared.
- **RD:** RD-001 (Québec/Law 25); `security-and-privacy.md`.
- **Dependencies:** user/ops for vendor accounts (email, AV scanner). Not blocked by pricing.
- **Effort:** S–M · **Status:** not started (PD-006)

### N9. Candidate-confirmation integrity (QA X-1)
- **Problem:** `submit_referral_for_candidate` takes the confirmation token **hash** from the caller. A recruiter calling the RPC directly can pick a token, send its hash, then call `respond_candidate_request` with it, and the referral is "confirmed by the candidate" with no candidate involved. This predates N1 (`20261111000200_candidate_confirmation.sql`). N1's duplicate rules still hold, because the delivery re-check runs. But since N1, a delivered referral holds **first position** against other agencies, and RD-003 defines "presented" as delivered after candidate confirmation or recorded authorization. A forged confirmation is a false consent record that wins first position, and N3 will turn first position into fee entitlement.
- **Target user:** sourcing recruiters competing for the same candidate; candidates (consent); platform admins resolving disputes (the evidence must be true).
- **Expected impact:** "confirmed by the candidate" means what it says. One forgery route to first position is closed before launch.
- **Metric:** a direct RPC call with a caller-chosen token can't confirm (QA test); 0 candidate-confirmed referrals without a server-issued token.
- **RD:** RD-003, RD-004.
- **Fix direction:** superseded by PD-038. Returning the token from an `authenticated` RPC would hand it to the recruiter, who can call that RPC directly. Integration helpers that forge tokens must change with it. A resend (`rotate_candidate_request_token`) follows the same rule.
- **Dependencies:** none. Can run in parallel with N2. **N3 depends on it.**
- **Team:** backend-engineer → qa-engineer (forged direct call refused, both confirmation and resend; candidate path E2E still green). No design or copy work, because the flow is unchanged for users.
- **Decided design (PD-038 to PD-040):** the token is generated in the database and returned only by a service-role-only issuance RPC that the Server Action calls after the user-session RPC; `p_token_hash` is dropped from both public RPCs. Pending pre-N9 requests are expired and recruiters resend from the existing UI (no copy change). A recruiter-controlled candidate email (X-2) is out of N9; a strategist question is due before the N3 brief.
- **Effort:** S · **Status:** **accepted** 2026-11-15 (PD-041) → [`acceptance.md`](../specs/candidate-confirmation-integrity/acceptance.md), [`brief.md`](../specs/candidate-confirmation-integrity/brief.md). Built and applied **locally only** (migrations `20261115000100`, `20261115000200`). The hosted push waits for the user, the N1 storage-trigger check and the R-2 count (launch checklist).
- **N9 follow-ups (PD-042, PD-043):**
  - BR-12 kept as built: only email **updates** count (D-8). Whether a recently created candidate record should count is part of strategist Q-1, before the N3 brief.
  - `app.candidate_email_changes` (dates only, 60 days) accepted; stated in the Privacy Policy → launch checklist (Legal).
  - R-2 hosted count of confirmed pre-N9 requests before `supabase db push` → launch checklist (Ops).
  - O-1: `record_candidate_request_delivery` is callable by any source-org member, so "sent" in the evidence is recruiter-influenced → **N3 prerequisite**; dispute playbook treats "issued" as authoritative meanwhile.
  - O-3: change rows of a candidate whose email was already null at anonymisation wait for the 60-day sweep → "Engineering hygiene".

### N10. Network Rules: acceptance, conduct reports and network hold (P0-2 + P0-3, PD-055)
- **Problem:** Members join without accepting any rules, so the conduct rules (data use, client contact, honest representation) aren't binding and can't be enforced. There's no way to report a breach that isn't tied to a placement or a prior-presentation objection. The only sanction is full suspension (`organizations.suspended_at`), which also hurts partners with referrals in progress. And because a suspended org gets not-found on every workspace route (`src/server/auth/context.ts`), it **can't settle what it owes** (partner shares, refunds, dispute answers), which contradicts rule 9.5.
- **Target user:** all members (hiring recruiters who share jobs and data, sourcing recruiters who share candidates); platform admins who enforce.
- **Expected impact:** the rules become a binding, versioned agreement. Breaches have a fast, proportionate response that doesn't punish innocent partners. The "vetted network" story is backed by enforcement.
- **Metric:** 0 active users without acceptance of the current version; median time to accept a new version; first admin response to a conduct report ≤ 2 business days (rule 8.4); % of reports resolved in ≤ 10 business days; 0 full suspensions used where a hold would have done; sanctions overturned on review (RD-037 signal).
- **RD / PD:** PD-053.3 (ladder, immediate-hold list), PD-053.4 (30-day notice), PD-054; RD-037 (residual test, effects in-platform only), RD-039, RD-043 (conduct that gets reported); Network Rules v1 sections 1, 8, 9, 10.
- **Scope (must):**
  - **A. Versioned acceptance (P0-2, rules 1.1, 10.1–10.3).** Rules versions (number, effective date, material flag, change summary, text per locale). Acceptance by the `org_admin` at joining (N5 application) and by **every user** on first access. Each acceptance records user, org, version, locale and time, and is audited. Material change: **30 days' notice** in-app and by email (N7), then re-acceptance. **On the effective date, an org that hasn't accepted can't start new partner activity** (open jobs to partners, submit referrals, accept new ones); referrals in progress continue and no breach is recorded (rule 10.3). In Québec the French version is offered first (rule 10.6). The per-user gate before the effective date is set in the brief.
  - **B. Conduct reports (P0-3, rule 8).** "Report a problem" on the referral and on the partner job → a new `conduct` dispute type in `/admin/disputes` (no placement or objection needed), with category, description and optional attachment (reusing the N1 evidence upload and its limits). The reported org gets the allegation in writing and **10 business days** to respond (rule 8.3). Files go to admins, not the other side (RD-016). The admin records the outcome on the ladder. Replaces the interim support-email sentence in rule 8.1.
  - **C. Sanction ladder and partial network hold (rule 9).** Four levels: warning (on file, counts 12 months) → **network hold** (org state: no opening jobs to partners, no submitting, no accepting new referrals; in-flight referrals continue; partners see only "not taking new referrals"; Verified badge removed, rule 1.6 with N5) → suspension → termination. Written notice and 10 business days to respond before any sanction (9.3). **Immediate hold without prior notice only for data shared outside the org (rule 2.3) and forged evidence or false candidate confirmations (rule 4.8)**, with notice within **1 business day** (9.4); nothing else qualifies. **One review** on request within 10 business days, by a **different platform admin** than the one who decided (9.6), enforced server-side.
  - **D. "Suspended but can settle obligations" (rule 9.5).** N10 must close the suspension gap, one of two ways, decided in the brief with the backend estimate: (a) **settlement mode** for suspended and terminated orgs: members can reach only what's needed to settle in-flight obligations (commissions and payout records, refunds, disputes and referral messages on existing referrals), with no new activity, matching or editing; or (b) an **explicit written admin procedure** (the org sends payout evidence by email and an admin records it, both visible in the audit log). **PM recommendation: (a).** Rule 9.5 is a promise to partners who are owed money, and (b) makes admins operate a member's money records. (b) is acceptable only as a documented fallback if (a) breaks the effort bar, and then rule 9.5 must describe it truthfully.
- **Won't (this release):** paid peer review panel (P2-2); automatic sanctions; document watermarking (P2-5); org blocking (X8); any fee or compensation for a breach (PD-053.1, RD-039).
- **Acceptance conditions (rules promises that must be true before the rules are published):** 9.1 level 2 ("Partners see only that you aren't taking new referrals"); 9.5 (obligations can be settled during a hold, suspension or after termination, per D); 10.1 (current version and change summary always available); 10.2 (30-day notice and re-acceptance by the org admin and every member); 10.3 (new partner activity blocked after the effective date, in-flight continues); 9.4 and 9.6 as enforced deadlines and reviewer rule; 8.1 "Report a problem" live. The other publication promises (4.5, 6.6, 8.4) are on the launch checklist.
- **Dependencies:** **N5** (same onboarding surface; org-admin acceptance happens in the application). Reuses N1's dispute infrastructure and business-day calendar. Notice emails (30-day notice, rule 8.3 and 9.4 notices) need N7 notification emails and N8's email provider; in-app first. Two platform admins (launch checklist, Ops) for rule 9.6. The published version needs P0-1 approval (founder + counsel), the build doesn't. Strategist content S-TE-1 to S-TE-3 done (RD-037, RD-039; rules draft).
- **Team plan (per analysis §6.4):**
  1. **recruitment-strategist** — domain content done (`network-rules-v1.md`, RD-037 to RD-043). Only if the brief raises them: final conduct-report categories and what a held org's partners see on existing referrals (short `recruiting-input.md`).
  2. **product-manager** — `docs/specs/network-rules-enforcement/brief.md` (BR-#, the D decision, per-user gate, ACs to inherit the acceptance conditions above).
  3. **product-designer** — `spec.md`: acceptance (joining, first access, new version, effective-date gate), conduct report flow and admin queue, sanction and hold states, review request, settlement mode.
  4. **ux-writer-marketing** — rules acceptance copy (en / fr-CA / pt-BR, French first in Québec), conduct report, notices, hold and settlement-mode copy. (The P0-4 purpose notice is in N6a and can run earlier.)
  5. **backend-engineer** — rules versions and acceptances, effective-date gate on partner actions, `conduct` dispute type, hold state enforced in the referral, job-visibility and matching RPCs, sanction log and review with the second-admin check, settlement mode in `getRequestContext` and RLS. ‖ Can start after spec, in parallel with step 4 (different files).
  6. **frontend-engineer** — after steps 4 and 5.
  7. **qa-engineer** — every AC × role, held and suspended org states, forged direct calls (held org submits, same admin reviews own sanction), in-flight referrals unaffected.
- **Effort:** M (P0-2 S, P0-3 S–M, settlement mode S–M); backend about 16.5 engineering days (estimate 15.25 d + rev. 2 delta) · **Status:** **ACCEPTED WITH CONDITIONS (2026-11-16, PD-082)** → [`acceptance.md`](../specs/network-rules-enforcement/acceptance.md). Built ahead of N5's spec (PD-084); QA round 2 PASS (126 of 145 Must ACs pass, AC-32 deferred by PD-083, 15 partial, 3 accessibility ACs not verified); round-1 blocker and majors fixed. Fix migration `20261116001800_n10_qa_fixes.sql` is uncommitted. **Not launched.** Conditions before launch: publish v1 of the Rules in the same window as `supabase db push`; counsel review (C-1, C-3, C-4, C-5, C-7), text ships as drafts until then; hosted push only on the user's request, in timestamp order with two platform admins; one full integration run on a clean stack (backend's 530/530 is not QA-verified); accessibility and browser pass (AC-118 to AC-120); named owners for conduct reports and reviews; scripted check of settlement-mode money and dispute paths (AC-101, AC-102).
  - **Follow-ups (not gating):**
    - **Scheduler notifications (PD-083):** `network_rules.effective_not_accepted` (AC-32) and the 7-day reminder, one worker step, backend about 0.5 to 1 day [estimate]. **Must exist before the first material or legally required Rules version is published;** not needed for v1.
    - **Minor frontend gaps** (`frontend.md` §3 gaps 1 to 3 and 8 to 11): admin evidence polling, referral picker, holiday-aware weekday count, S22-d toast, stale-tab link, S22-c status, direct links to the objection and dispute dialogs (AC-127, AC-151). Next admin or frontend pass.
    - **Bilingual notices** (Should, counsel C-5): build only if counsel requires fr-CA + en notices for Québec orgs. Also update the outcome and incident lines by migration if counsel changes the wording.
    - **Should items left:** admin metrics card, planned-review reminder, org-admin "who hasn't accepted" list (AC-121 to AC-125). Scheduled when capacity allows.
    - **Backend minors:** `settlement_mode.exited` event for "terminated and settled", "refund due" obligation tag; move `network-rules-versions.test.ts` to a rolled-back transaction.

---

## Engineering hygiene (small, owned, not features)

| Item | Problem | Owner | Due | Status |
|---|---|---|---|---|
| **Opportunities pagination (QA-PRE-02) and test isolation** | `get_opportunities` has no pagination; PostgREST `max_rows = 1000` silently drops the lowest-scored rows, and the UI now shows "1,000 new", a wrong number shown to a member. Can't happen at founding-group scale, but it grows with the network. QA already moved tests to `opportunityFor` (`p_match`). Fix: a page/limit parameter plus an exact count (backend), then a paged list or "1,000+" (frontend). Never silently truncated (PD-063, N2 F-3) | backend-engineer → frontend-engineer | Before launch | not started |
| **N1 AC-66 test budget (N2 F-4)** | On a long-lived local stack (millions of match rows), N1 QA "deadline checked at filing" exceeds its 30 s `drainQueue` budget. Test infra, not a regression (passes after a reset; CI starts fresh). Drain only the test's own jobs, or document "reset before a full run". Don't widen the timeout blindly | qa-engineer | Before launch (full suite green) | not started |
| **Record-scope copies (N2 F-7, PD-064)** | N2 redefines 8 functions of `20261115000300_recruiter_record_scope.sql` (another session's file) as copies. Postgres keeps the last definition, so a later edit to that file is silently overridden. Rule: never edit that file again; changes to those 8 functions go in a new migration after `20261116000700`, starting from the N2 body; QA re-runs `recruiter-record-scope.test.ts` + N2 suites | backend-engineer (every change); Ops (md5 check at push) | Standing rule | active |
| **Parallel N10 and N3 builds (PD-078)** | Another session builds N10 in the same tree and local DB (migrations `20261116001000`–`001700`); N3's are `20261117*`. Postgres keeps the last definition, so a shared function (`app.job_partner_visible`, `app.job_hidden_reason`, submit RPCs, release/withdraw, `open_dispute`, notification helpers) redefined from a stale body silently drops the other feature's checks; a `db:reset` by one session wipes the other's local data. Rule: start every redefinition from the live body after a reset that includes both features; backend lists overlapping functions in `backend.md`; QA runs N3 + N10 + record-scope suites; announce resets; hosted push of N3 only with (or after) the N10 migrations it was built on. User tells the N10 session | backend-engineer (both sessions), qa-engineer, Ops at push | Standing until both are pushed | active |
| **Client names at commit and delivery (N3 gap 6, PD-079)** | Admins see both normalised client keys and the job's **current** client name, not the names at submission and delivery, so a rename (HA-11) isn't visible in a dispute. Store the name text at commit and delivery in closed `app` tables (admin-only, not in audit metadata), show it in the admin hire-report detail. Can't be backfilled, so before the first real referral | backend-engineer → frontend-engineer | Before launch (before the hosted push of N3) | not started |
| **`journey.test.ts` regression, "making a candidate unavailable removes them from B's counts" (PD-081)** | Fails on a clean stack and alone (657 vs 657, the count doesn't drop). Not N3 (matching and `get_job_match_summary` untouched); green at the start of N3 QA. The test doesn't assert the candidate update's error, so the cause is open: update refused, or candidate not counted. Journey A is a launch-checklist suite, so it's a major regression | main session assigns; backend-engineer (matching / candidates); qa-engineer adds the error assertion first | Before launch and before the next hosted push | **done 2026-11-16**: test race, not an app bug. Every fixture candidate matches jobB, so matches created concurrently (other sessions, worker) offset the drop. The test now reads B's count, applies A's update under RLS, and re-reads in one REPEATABLE READ transaction (`after = before − 1`); 19/19 three times, and 4/4 while `n3-qa` ran in parallel |
| **QA runs serialised across sessions (PD-078, PD-081)** | Concurrent integration runs toggle the global `deemed_agreement_enabled` flag (N3 `afterEach`) and grow `matches`, so flag tests and drain-based tests flake; `network-rules-qa.test.ts` (N10 session) fails 2 tests in the full run and passes alone. One full run at a time, announced; none counts while another session migrates or resets. N10 QA owns its file | main session; N10 session QA | Standing | active |
| **Process hygiene for agents (PD-080)** | QA's `pkill -f` stopped the user's `npm run dev`. Stop only own processes by recorded PID; never port 3000 or the user's dev server; announce `db:reset`; report started/stopped processes. Main session to add it to the feature-team skill and qa-engineer definition with the user's OK | all agents; main session | Standing | active |
| **Input height 44px (N2 P-21)** | `input.tsx` and `native-select.tsx` are 40px; AC-72 asks 44px. Design-system item, batch with N1 polish item 17 | frontend-engineer | Not gating | not started |
| **Stale E2E specs** | Three pre-existing failures outside N1: `onboarding.spec.ts` (removed step), `journey.spec.ts` (`Evidence` label, plus 6 serial follow-ups), `documents.spec.ts` (upload label). The launch checklist needs a green suite. | qa-engineer | Before launch | not started |
| **N9 change-log on anonymisation (O-3)** | If a candidate's email is already null when anonymised, an earlier `app.candidate_email_changes` row (dates only) stays until the 60-day sweep. Make the trigger also fire on `anonymized_at`, like `candidates_anonymized_fingerprints` (PD-043). | backend-engineer | Batch with the next migration touching `candidates` | not started |
| **N1 polish** | Design review items 11 (same-named orgs in the abuse flags: add a second identifier) and 17 (32px targets at `sm`+ → 44px); `/admin` overflows 26px at 375px because of the pre-existing "Newest organizations" panel. | frontend-engineer | Not gating; batch with the next frontend pass | not started |

## Recurring operations

| Item | Rule | Owner | Next due | Why |
|---|---|---|---|---|
| **Holiday table seed (N1, PD-037, cadence moved by PD-077)** | By **1 June each year**, `app.network_holidays` covers the **next two calendar years** (Ontario ESA + CNESST sources, PD-019 substitute rules, PM notified, migration only, PD-014). Seeded today: 2026–2029. Earlier than the old 1 October because N3 accepts start dates up to today + 548 days, and the invoice clock runs from them | backend-engineer | **2028-06-01** (seed 2030). From about 2028-07-01 an accepted start date can fall in 2030 | Past the last seeded year, `add_business_days` raises `holiday_calendar_exhausted`, so **deliveries fail**, not just deadlines. N4 reuses the helper. |

## Next: during the founding group (liquidity)

| # | Item | Problem → impact | Target user | Metric | RD | Dependencies | Effort | Status |
|---|---|---|---|---|---|---|---|---|
| X1 | **Platform invoice and collection discipline** | The platform fee is a remittance recorded by the payer, no invoice, no due date → predictable revenue | Workatent | days client-payment-verified → fee received; % collected ≤ 45 days | RD-009 | **blocked: RD-009, RD-008** (user); tax registration ⚖️. Invoice amounts must honour X6's short-paid marker and allocation adjustments (E-19, PD-052) | M | blocked |
| X2 | **Partner reputation (counterpart-only)** | Recruiters can't judge a partner before submitting → good partners attract submissions | both sides | submissions to high-reputation jobs vs others | RD-007, RD-002 | N4 metrics, N5 badge | M | not started |
| X3 | **Private partner circles and "invite a partner to this job"** | Cold start; boutiques split with people they trust → brings informal splits on-platform | P2, P3 | invites → approved orgs → first referral | RD-001, RD-002 | N5 (invitees go through curation, fast-tracked) | M | not started |
| X4 | **Own-pipeline matching** | Thin weeks → no matches → churn. Engine excludes same-org pairs today → day-one value | P1, P2 | % of new orgs active at day 30 | RD-001 | none | M | not started |
| X5 | **Candidate and job freshness, missing signals** | Stale candidates cause false Strong matches → higher accept rate. **Plus job freshness (P1-5, RD-042, PD-055):** stale partner jobs burn sourcing goodwill. Every 30 days from opening to partners or the last confirmation, the hiring side confirms "still open, terms current" (reminder day 30); no confirmation by **day 37** → job paused for partners (in-flight continues, one click reopens, terms unchanged). Confirm action, a terms edit, or accepting/moving a referral counts; connector syncs don't. "Job filled" decline → prompt to close the job. Makes rule 4.6's last two sentences publishable | P3 (quality), P1 | submission → accept rate; `availability`/`skills` declines; % of partner jobs confirmed within 30 days; "Job filled" declines per 100 deliveries; % auto-paused (> 30% → revisit) | RD-042 (assessment §3.8) | N2 (terms versions) | M | not started |
| X6 | **Fall-off and replacement flow** | No fall-off event, no replacement path, no sourcing partner first right → guarantees handled consistently | both sides | fall-off rate; disputes over replacements | RD-006, RD-027 | N2 (guarantee terms frozen). Also takes RD-027's guarantee-limited reversals: a refund beyond the snapshot's guarantee is B's alone (PD-044). **Also takes E-19 (PD-052):** a "short-paid" marker on placements and an admin allocation adjustment on an upheld dispute (today `resolve_dispute` only closes it), so a post-hire credit note can't dodge the RD-025 floor | M | not started (PD-007) |
| X7 | **Founding-member rate in commission rules** | Founding orgs need their rate applied in agreements and the ledger | founding orgs | % of founding-org agreements on the right rule | RD-008, RD-005 | **blocked: RD-008** (user); strategist S-2 | S–M | blocked |
| X8 | **Org blocking (NOGO)** (P1-1) | A member who had a bad experience with another org has no way to stop working with it short of a conduct report → fewer repeat disputes, members stay. Settings → "Blocked organizations" (`org_admin` only, RD-036). Two-way for matching and new referrals; in-flight referrals continue; the blocked org isn't notified; visible to platform admins | both sides | blocks per org (expected low); 0 new disputes between blocked pairs | — (analysis P1-1) | none (filter in matching and in the referral submit check) | S–M | not started |
| X9 | **Payout deadline reminders and late flag** (P1-2) | *(Also takes N3's admin view of "Invoice overdue", PD-079; Ops SQL until then.)* Rule 6.6: the hiring side pays the sourcing share within 5 business days after the client's payment reaches it. Nothing tracks it → late payouts are invisible. Count 5 business days from verified client payment (N1 calendar); remind the hiring side at day 3 and 5; mark "late" for the sourcing side and admins; feeds "% paid on time" (RD-007). **Build with N4 (same SLA and reminder pattern) or X2** | sourcing recruiters; network health | median verified payment → payout confirmed ≤ 5 business days; % paid on time ≥ 90% | RD-027, RD-007 | N4 reminder pattern; email reminders need N7/N8. Gates the rule 6.6 sentence "Late payouts show in your record" (launch checklist) | S | not started |
| X10 | **"Spoke with the candidate" attestation** (P1-6) | On the recorded-authorization path, "approved sharing" is vague, so CV-bombing is a grey area → a specific, challengeable statement. **Reword the existing `referrals.form.confirmInterest`** (no second checkbox): I or a member of my org spoke with the candidate about this job; they're interested and approved sharing; this record is true. No interview requirement. Add the decline reason **"Candidate wasn't aware or isn't interested"** to compare paths | P3 (quality), candidates | new decline reason on recorded vs confirmed path (> 2× or > 5 per 100 deliveries → revisit, RD-041) | RD-041 | none (ux-writer + backend enum + frontend) | S | not started |
| X11 | **Shared-profile access expiry** (P1-4, PD-053.6) | The hiring side keeps the sourcing side's shared profile and documents forever → reuse of old CVs, Law 25 / PIPEDA minimization ⚖️. Timings per **RD-038**: no expiry in progress; end of the ownership window if closed but still counting; 30 days if the sourcing side has no stake; 30 days after the guarantee end (or start) if hired; paused during any open dispute, claim or hire report; immediate on revocation. Metadata, agreement, ledger stay; "Shared profile available until {date}" from closure. Makes rule 2.6's last sentence publishable. **Backlog (RD-046, PD-058): "pause received shared profiles"** on a rule 2.3 breach finding at suspension or termination level, chosen by the admin; applies only to referrals where the sanctioned org is the hiring side; each affected sourcing org then resumes sharing or keeps it paused per referral. It's the real containment tool for a data leak, since no ladder level cuts received-profile access in v1 (N10 R-5). Moves earlier, as a 2.3-only option, if counsel C-4 requires containment before a finding | sourcing recruiters, candidates | % of eligible referrals expired = 100%; "restore access" requests (> 1 per 50 → revisit) | RD-038, RD-046 | **after N3** (claims, hire reports, ownership window enforced); the backlog item reuses N10's sanction and incident-notice records; N7 PIA for messages, names on hired records and the optional earlier document expiry ⚖️ | M | not started |

## Later: expansion (after ~20 verified placements and RD-001/005/008 revisited with data)

| # | Item | Why later | RD | Effort |
|---|---|---|---|---|
| L1 | ATS connectors: Bullhorn, then JobAdder, Loxo, Recruit CRM | Unlocks boutiques and mid-size; vendor terms and OAuth apps | RD-001 | L each |
| L2 | Per-job partner share (bounded, e.g. 40/50 to 50/40) | Only once N2 exists and exclusive/retained owners ask for it | RD-005 | S–M |
| L3 | Fuzzy duplicate detection (beyond exact identifier hashes) | Measure N1's miss rate first | RD-004 | M |
| L4 | Cross-border corridor (Canada ↔ US remote), then Brazil domestic | Liquidity is local; Canada cells first | RD-001 | L |

## Not doing (and why)
Payments, escrow or wallets (money-services exposure ⚖️, just removed) · **non-circumvention fee on off-platform splits and a pre-existing-partner declaration** (analysis P1-3, rejected by the founder in PD-053.1; the "pairs that stop after one placement" signal stays as a watch metric only, see top) · Workatent as binding arbiter of money disputes (PD-053.2) · post-process client non-solicit before the competition-law opinion (PD-053.5) · employer/client portal (competes with members) · a full ATS · contract/temp splits · public candidate marketplace or blasts · AI auto-submission or auto-outreach · retained/executive search workflows · per-referral fee negotiation · public reputation leaderboards. Source: `product-assessment.md` §6; reaffirmed in PD-010. Network-rules exclusions: PD-053, analysis §5 "Fora".

---

## Sequencing

```
Day 1, in parallel:  N6a (ux-writer)   N7 counsel engagement (user)   N8 vendor setup (user/ops)
Build track:         N1 (accepted) ─┬─► N3 ─► N4 ─► N5 ─► N10
                     N2 (accepted) ─┤   (N2.1 after N3's build starts; not a launch gate)
                     N9 (accepted) ─┘
Launch gate:         N1–N5 + N9 + N10 accepted + N6a + N7 (incl. Network Rules P0-1/P0-5/P0-6) + N8 + RD-008/009/010 decided (+ N6b if RD-012 decided)
During the group:    X4, X3, X2, X5 (+ job freshness), X6, X8, X9 (with N4 or X2), X10;  X11 after N3;  X1 and X7 as soon as RD-009 / RD-008 are decided
```

N1 and N2 can share the design and backend agents in sequence or overlap, since they touch different tables. N5 is last in the build track because its gate (network pending) matters only at invitation time, but its admin queue must be live before the first application arrives. N10 follows N5 because org-admin acceptance lives in the same application surface; its brief and spec can be written while N3–N5 build, so only its backend and frontend wait for N5's spec. X9 is small and can be pulled into N4 if the founder wants rule 6.6's "late payouts show in your record" sentence published at launch (see launch checklist).

## Open questions for the recruitment-strategist

- **N1:** Q-1…Q-9 answered (RD-013 to RD-021). Two non-blocking follow-ups: confirm PD-029's reading of RD-016 ("counting when the claimed referral was delivered"); PD-031, should an org's own earlier client-scope presentation route to "consider for another job" instead of a stop?
- **Q-1** → answered by RD-029; **S-1** → answered by RD-030 (both folded into N3, PD-048).
- **N2:** S-N2-1 to S-N2-5 answered (RD-031 to RD-035, PD-052).
- **Network rules:** S-TE-1 to S-TE-7 answered (RD-037 to RD-043, PD-055). **N10 follow-ups S-N10-1 to S-N10-6 answered** (RD-044 to RD-049, folded into the brief rev. 2 by PD-058):
  - conduct categories;
  - the outcome the reporter learns;
  - the 9.1 "accept new ones" reading, and a shared-profile freeze on 2.3 holds;
  - in-flight continuity during suspension;
  - what partners see for a terminated org;
  - escalation after an immediate hold.
- **S-N3-1 (non-blocking, N3 brief §8.2):** should an in-progress referral past its ownership window keep counting for N1's duplicate check, as RD-052 makes it count for hires? Default until answered: no N1 change.
- **S-2 (X7, if RD-008 is approved):** With a 5% founding rate, how are the 5 freed points shared: equally (47.5/47.5/5) or some other way? Does the founding rate apply when only one of the two orgs is a founding member?

## Launch readiness for the founding group

Everything below must be true before the first recruiter is invited.

**Product**
- [x] N1 duplicate and prior-presentation protection accepted (`acceptance.md`, 2026-11-15).
- [ ] N1 live accessibility pass: keyboard-only paths (AC-61) and 375px dark mode (AC-62) run in a browser by qa-engineer, spot-checked by product-designer. A blocker found here reopens N1 (PD-034).
- [x] N9 candidate-confirmation integrity accepted (QA X-1; no caller-chosen confirmation token) (`acceptance.md`, 2026-11-15, PD-041).
- [x] N2 job terms card accepted; new referrals get the job's ownership window, not a fixed 12 months (`acceptance.md`, 2026-11-16, PD-059). Docs closeout F-0 open (backend-engineer).
- [ ] N2 F-1 (Q-R1, PD-062): the admin amendment form shows, parses and posts the job's salary currency on a flat → % amendment; QA re-runs AC-58, AC-60 and the new case.
- [ ] N2 F-2: browser pass of N2's UI-only ACs (AC-11, AC-13, AC-15 chips, AC-52/53 tiles, AC-56, AC-63 hiring side and sent list, AC-65, AC-69, AC-72) and the legacy variants (hire alert, Fee panel, agreement dialog; legacy referral seeded by fixture), en/fr/pt, 375px, dark mode. Same session as N1's AC-61/62 pass; product-designer spot-checks. A blocker reopens N2 for that screen.
- [ ] Opportunities never silently capped at 1,000 (QA-PRE-02, Engineering hygiene).
- [x] N3 referral-level claims and two-sided hire reporting accepted (`acceptance.md`, 2026-11-16, PD-081); "Ownership protected until" is backed by a claim path. Its gates are the items below and acceptance §3.
- [ ] N3 browser and visual pass (dark mode, 375px, fr wrapping, keyboard, S7 / S8 / S13 to S16 dialogs), with measured contrast for design B-2 / B-3; same session as N1 AC-61/62 and N2 F-2. A blocker reopens N3 for that screen.
- [ ] N3 client names stored at commit and delivery (PD-079), before the first real referral and before the N3 hosted push.
- [x] `journey.test.ts` "making a candidate unavailable removes them from B's counts" fixed and Journey A green (triaged regression, PD-081).
- [ ] `deemed_agreement_enabled` turned on in production **only** after counsel answers N3 Q-1 yes and N10 rules acceptance is live; otherwise it stays off and rule 6.3 says hires on never-accepted referrals carry no split (PD-067).
- [ ] N7 hire-report emails live with per-recipient delivery and bounce records, plus the BR-30 reopen, so deemed confirmation can run (PD-070, PD-073).
- [ ] Hosted DB: delivered external referrals on jobs without a client key = 0 (or test data); otherwise the PM revisits rule 6.3's "any role" (PD-076).
- [ ] Dispute playbook: drop the "sent is recruiter-influenced" line once N3 BR-2 (O-1) ships; add the hire-report queue (unanswered, notice not delivered; fee details overdue; ≤ 1 candidate contact per dispute).
- [ ] N4 SLA reminders and release live (in-app at least).
- [ ] N5 curated onboarding: application, admin approval queue, network-pending gate, Verified badge.
- [ ] N10 accepted with conditions (PD-082, `acceptance.md`): **publish v1 of the Rules in the same window as `supabase db push`**; counsel review done; full integration suite run once on a clean stack; accessibility pass AC-118 to AC-120; settlement-mode money paths checked (AC-101, AC-102); no material Rules version published until the scheduler step exists (PD-083).
- [ ] N10 Network Rules accepted: versioned acceptance per org and per user, 30-day notice and re-acceptance, effective-date gate on new partner activity (10.1–10.3); `conduct` reports with "Report a problem" (8.1); 4-level ladder with partial network hold (9.1), immediate hold only for 2.3 / 4.8 with notice within 1 business day (9.4), one review by a different admin (9.6); suspended or terminated orgs can settle obligations, or the written admin procedure is in place and 9.5 says so (9.5).
- [ ] **Rules promises are true before the rules are published** (network-rules README, founder item 3). Each sentence ships only if the product does it; otherwise ux-writer wraps it in a "ships with" marker and the founder approves the published text without it:
  - 9.1 level 2, 9.5, 10.1–10.3 → N10 acceptance conditions.
  - 4.5 "Only platform admins see it" (end client) → the N3 client-name prerequisite is live and QA confirms no partner-facing view or RPC returns the client name (RD-020).
  - 6.6 "Late payouts show in your record" → X9 live, **or** the sentence marked "ships with X9" (PM recommendation: the marker; X9 stays in Next unless the founder wants it at launch).
  - 8.4 "We aim to respond within 2 business days" → named conduct-report owners staffed (Ops below).
  - 1.6, 2.6 (last sentence), 4.6 (last two sentences), 8.1 → already marked "ships with N5 / access expiry / P1-5 / P0-3" in the drafts; publish only what has shipped.
- [ ] N6a copy cleanup done in en, fr-CA, pt-BR; no "workspace" in CTAs.
- [ ] N6b pricing line live, or "Free to start" removed with the user's approval.
- [ ] Support address configured, so the N1 stop shows its support line (PD-025; address: user decision).
- [ ] In-app notifications localised in en, fr-CA, pt-BR (N7, PD-026).
- [ ] Notification emails live, including N1's claim-filed email (N7, PD-030).
- [ ] E2E covers: duplicate stopped at submission, prior-presentation claim and contest, referral claim → placement.
- [ ] Full E2E suite green, with the stale onboarding, journey and documents specs fixed (Engineering hygiene).

**Legal ⚖️** (counsel, user decides)
- [ ] RD-010: Ontario and Québec counsel opinions on Workatent's licensing status, and licence wording for members.
- [ ] Terms of Service and Privacy Policy reviewed; sign-up checkbox links to them (copy-audit 9.7).
- [ ] Collaboration agreement / network rules: ownership window and scope, first-presentation and prior-presentation rules, SLA and release, non-solicit, guarantee wording without enforcement claims (RD-003/004/006/007; copy-audit 9.8). Structure depends on RD-009.
- [ ] **P0-1 Network Rules v1 text approved** by counsel and the founder (drafts in `docs/content/network-rules/{en,fr-CA,pt-BR}.md`; every ⚖️ marker cleared; placeholders filled: effective date, 6.8 fee terms, 8.1 support address, 7.5, 10.6) (PD-053.7).
- [ ] **P0-5 dispute clause** (rule 7.5): negotiation on the platform → mediation → commercial arbitration; Workatent decides platform effects only and provides records (PD-053.2). Counsel proposes institution, seat (Toronto or Montréal), governing law, language and costs (placeholders until then); founder decides. Check fit with RD-009 and RD-010.
- [ ] **P0-6 competition-law opinion** (Competition Act s.45(1)(b), s.45(1.1), s.45(4)) on rules 3.4–3.6. v1 is during-process only (PD-053.5); any post-process non-solicit (RD-039 recommendation) waits for the opinion and a user decision.
- [ ] **French first in Québec** (Bill 96): the French rules are offered first to Québec orgs at acceptance (N10), and counsel decides which version governs (rule 10.6). CCQ 1435–1437 adhesion-contract review.
- [ ] Law 25 PIA and subprocessor list; AI processing off for Québec orgs until done.
- [ ] Candidate consent texts in fr-CA and en reviewed (copy-audit 9.6); statutory-deadline and legal-basis hints fixed (9.4, 9.5).
- [ ] Fingerprint (N1) retention and purpose stated in the Privacy Policy, together with N9's candidate email-change dates (no addresses, 60 days, used as consent evidence; PD-042).
- [ ] CASL check on candidate confirmation and reminder emails.
- [ ] **N3 counsel items (PD-067, posture approved PD-071; pending: the user sends them to counsel):** Q-1 deemed agreement on never-accepted referrals (gates the production flag); Q-2 filing tail of window + 6 months (+3 with the re-engagement tail) as a platform rule only; Q-3 "client and its affiliates, agents, EOR, payroll provider" and contractor/PJ engagements as hires; Q-4 admin candidate contact and hire-report evidence retention (proposed: dispute closed + 2 years) in the PIA and Privacy Policy. Plus rules 6.3, 6.4, 7.2 text under P0-1.
- [ ] Sales-tax position on the platform fee (GST/HST/QST), if RD-009 makes Workatent invoice.

**Business (user)**
- [ ] RD-008 decided: list rate and founding rate are what we tell invitees.
- [ ] RD-009 decided, or explicitly deferred with the interim remittance model written into the agreement.
- [ ] Founding list: 30–50 target orgs in the three niches; each commits to opening ≥ 3 jobs; ≥ 150 active jobs seeded (market-and-positioning §5).

**Ops**
- [ ] Hosted Supabase confirmed in `ca-central-1`; backups / point-in-time recovery on.
- [ ] **Before the N1 hosted push** (`supabase db push`, only when the user asks): confirm that the migration role can create the `claim_evidence_upload_limit` trigger on `storage.objects` (migration `20261113001100_qa_round2.sql`), then confirm after the push that the trigger exists and refuses the 31st upload in an hour. If the privilege is missing, don't push. Backend switches to signed upload URLs issued by a rate-limited RPC (PD-037).
- [ ] **Before the N9 hosted push** (same push, only when the user asks): count confirmed candidate requests on the hosted DB immediately before pushing: `select count(*) from public.referral_candidate_requests where confirmed_at is not null;` (all are pre-N9 at that point and can't be proven genuine). If 0 or all test data, push. If any are real: **Needs user decision**, recommendation keep them and record them in the audit log as pre-N9 (PD-039, PD-043). After the push, confirm both N9 migrations applied (`20261115000100`, `20261115000200`).
- [ ] **Before the N2 hosted push** (only when the user asks; **N1, N9 and N2 are pushed together**, never N2 alone, N2 acceptance §5):
  - count referral-open jobs (they become invisible to partners until their card is completed) and undelivered pre-N2 referrals on the hosted DB. If 0 or all test data, push. If any are real member data: **Needs user decision** (recommendation: push; owners complete cards from the nudge) (N2 brief §7). Record the submissions-per-partner-job baseline for the N2 metric at the same time;
  - `select count(*) from public.payment_evidence where amount_minor > 1000000000000;` must be 0, otherwise migration `20261116000700` aborts. Confirm `public.job_terms_versions` doesn't exist yet (or is empty), so the `20261116000600` bound check can't abort;
  - **record-scope md5:** `supabase/migrations/20261115000300_recruiter_record_scope.sql` must still be `dcd272097bdb90c8311662bf3752e01e`. If not, stop: backend re-syncs N2's 8 copied functions in a new migration and QA re-runs record-scope + N2 suites (PD-064);
  - N2 docs closeout F-0 done;
  - after the push: migrations `20261116000100` to `20261116000700` applied; `report_hire` has one overload; no function body contains `hire_terms_pending`.
- [ ] Holiday table covers the next two calendar years (Recurring operations, PD-037); from 2028 the seed is due by 1 June (2030 by 2028-06-01, PD-077).
- [ ] **Before the N3 hosted push** (with N1, N9, N2, N10; only on the user's request): (a) count referral-open jobs with no usable client name on the hosted DB (BR-1 hides them from partners until fixed; if real, **Needs user decision**, recommendation: push, owners fix from the nudge); (b) count delivered external referrals on jobs with no client key (0 or test data, otherwise the PM revisits rule 6.3 "any role", PD-076); (c) record-scope md5; (d) `deemed_agreement_enabled` = false after the push.
- [ ] N3 and N10 hosted push in timestamp order (N10 `20261116001000`–`001800` before N3 `20261117*`), never N3 without the N10 bodies it was built on (PD-078).
- [ ] Production email provider configured, SPF/DKIM set, monitored reply address (copy-audit 9.10).
- [ ] Real malware scanning wired into `scanDocument`.
- [ ] At least two platform admins (four-eyes verification needs two), named owners for the approval queue (≤ 5 business days) and disputes, with a short dispute playbook. The playbook treats a confirmation's "issued" time as authoritative and "sent" as recruiter-influenced until N9 O-1 ships in N3 (PD-043). It applies the referral's frozen terms snapshot (guarantee, fee basis) in fee disputes, and settles a post-hire client credit note (E-19) off-ledger, recording the outcome in the dispute, until X6 ships the short-paid marker (PD-052). Named owners for **conduct reports** staffed for a first response within 2 business days (rule 8.4) and for sanction reviews by a second admin (rule 9.6); the playbook covers the sanction ladder, the closed immediate-hold list (9.4) and the residual "but for" test with its limits (RD-037).
- [ ] A support channel and concierge plan for the first referrals (chase responses, mediate).
- [ ] Liquidity dashboard per niche × region (market-and-positioning §5 metrics).
