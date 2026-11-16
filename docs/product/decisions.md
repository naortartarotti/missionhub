# Product decisions log

Owner: Product Manager. One entry per decision. Never rewrite a past entry: supersede it with a new one that links back.
Status values: `decided` · `needs user decision` · `superseded by PD-###`. Recruiting-domain decisions live in [`docs/strategy/decisions.md`](../strategy/decisions.md) (RD-###).

---

## PD-001: The first roadmap targets the founding-group launch
- **Date:** 2026-11-12
- **Decision:** Adopt the strategist's Now / Next / Later split. "Now" = what must be true before inviting 30–50 vetted orgs in the Montréal–Toronto corridor. North-star: verified placements per month in the corridor. See [`roadmap.md`](./roadmap.md).
- **Why:** The product's core promise isn't credible to an experienced recruiter until backdoors, duplicates and black holes have an answer (product-assessment §5). Liquidity work only pays off once trust holds.
- **Alternatives:** Liquidity-first (own-pipeline matching, invites) before trust: rejected, because one bad fee fight in a small network costs more than slower growth (RD-002 rationale).
- **Links:** RD-001, RD-002.
- **Status:** decided

## PD-002: First brief is N1, duplicate and prior-presentation protection
- **Date:** 2026-11-12
- **Decision:** Write the first full brief for N1 (`docs/specs/duplicate-prior-presentation/brief.md`).
- **Why:**
  - It is fully decided (RD-004) and needs no pending user decision.
  - It has no product dependency: N3 (claims) needs N2's per-job ownership window; N1 doesn't.
  - It closes the cheapest backdoor (an evidence-free `duplicate` decline) and the most common fee fight (double submission) *before* they happen, rather than resolving them afterwards.
  - It builds referral-level disputes, which N3 reuses. Smallest slice that tests the riskiest assumption: that evidence rules plus a short claim window keep duplicate fights rare.
- **Alternatives:**
  - N3 first: the bigger demo answer ("what if they backdoor me?"), but it depends on N2 and would ship with a placeholder window.
  - N5 first: matters at invitation time, not before; less risk reduced per week of build.
- **Links:** RD-003, RD-004.
- **Status:** decided

## PD-003: Build order N1 ‖ N2 → N3 → N4 → N5
- **Date:** 2026-11-12
- **Decision:** N1 and N2 first (they touch different tables, so they can overlap), then N3, then N4, then N5. N6a, N7 counsel work and N8 vendor setup start on day one in parallel because they don't use the build agents.
- **Why:** N3 needs N1's referral-level disputes and N2's window. N4 reuses N1's business-day calendar. N5's gate matters only at invitation time, but its admin queue must be live before the first application.
- **Alternatives:** Strict strategist order (#1, #2, #3 in parallel): #2 can't be correct before #3's window exists.
- **Links:** RD-003, RD-004, RD-007, RD-002.
- **Status:** decided

## PD-004: Split the copy item; pricing copy waits for the user
- **Date:** 2026-11-12
- **Decision:**
  - **N6a now:** RD-011 ("organization" only, CTAs without the noun), copy-audit §3–§8 and the non-legal §9 items (9.2, 9.10), plus wording for "Ownership protected until {date}" that doesn't imply enforcement until N3 ships.
  - **N6b later:** the RD-012 pricing line and pricing FAQ, after RD-008 and RD-012.
  - **Interim recommendation:** remove "Free to start" now with no replacement, so the site makes no pricing claim either way.
- **Why:** RD-011 is decided and reversible. Pricing copy is a public commitment (user's call). A displayed protection with nothing behind it is a trust risk of the same kind as copy-audit 9.8.
- **Alternatives:** Ship the recommended RD-012 line now: commits to a price the user hasn't approved.
- **Links:** RD-008, RD-011, RD-012; copy-audit §3–§9.
- **Status:** decided for N6a. **Needs user decision** for the interim removal of "Free to start".

## PD-005: Québec compliance moves from Next to Now
- **Date:** 2026-11-12
- **Decision:** The Law 25 work (PIA, subprocessor list, org-level AI setting defaulting off for Québec orgs until the PIA is done, fr-CA consent texts, residency statement) is part of N7 in Now, a launch gate.
- **Why:** Québec is half the beachhead (RD-001). Privacy is a hard constraint: we don't send Québec residents' resumes to a non-Canadian AI vendor without a PIA. The strategist's own sequencing already puts it in the launch block.
- **Alternatives:** Launch in Ontario only first: halves the beachhead and the fr-CA advantage.
- **Links:** RD-001; product-assessment §4; copy-audit 9.6, 9.9.
- **Status:** decided (legal content ⚖️ with counsel)

## PD-006: Production readiness is a roadmap item (N8)
- **Date:** 2026-11-12
- **Decision:** Track Canadian hosting region, production email, real malware scanning and the app-level rate-limit open item as N8 in Now.
- **Why:** Candidate confirmation links depend on email; documents cross tenants with heuristic scanning only; "hosted in Canada" can't be claimed unverified. Security and privacy are not traded for speed.
- **Alternatives:** Leave them in `implementation-plan.md` "Remaining": invisible to the launch gate.
- **Links:** `security-and-privacy.md`; copy-audit 9.9.
- **Status:** decided

## PD-007: Fall-off and replacement flow goes to Next
- **Date:** 2026-11-12
- **Decision:** RD-006's fall-off event (refund vs replacement, sourcing partner's first right) is X6 in Next. In Now, N2 declares and freezes the guarantee terms before submission.
- **Why:** The dispute RD-006 targets most ("I didn't know it was a 6-month guarantee") is solved by N2. Fall-offs can't happen before the first placements (weeks after launch); the ledger already supports `client_refund` reversals, and the concierge can handle the first cases.
- **Alternatives:** Build it in Now: adds an M item to the launch gate for an event that can't occur yet.
- **Links:** RD-006.
- **Status:** decided

## PD-008: Two-sided hire reporting ships without RD-009
- **Date:** 2026-11-12
- **Decision:** N3 (claims and sourcing-side hire reports) creates placements under the current remittance model. MissionHub's own invoice (X1) is a separate item, blocked on RD-009.
- **Why:** Detecting the hire protects the sourcing recruiter whatever the collection model. Coupling it to RD-009 would block the most important trust feature on a legal decision.
- **Alternatives:** Wait for RD-009 and build both together.
- **Links:** RD-003, RD-009.
- **Status:** decided

## PD-009: No silent change to the ownership window before N2
- **Date:** 2026-11-12
- **Decision:** New referrals keep the current 12-month default until N2 ships the per-job window (RD-003: default 6, range 6–12). Existing referrals keep their date. N1 doesn't change ownership dates.
- **Why:** Changing the protection length is a user-visible change to a commercial term. It should ship with the terms card that explains it, not as a side effect.
- **Alternatives:** Switch the default to 6 months now: shortens protection with no explanation on screen.
- **Links:** RD-003.
- **Status:** decided

## PD-010: Reaffirm the "not doing" list
- **Date:** 2026-11-12
- **Decision:** Not now: payments/escrow/wallets, employer portal, full ATS, temp/contract splits, public candidate marketplace, AI auto-submission/outreach, retained search workflows, per-referral negotiation, public leaderboards. Fuzzy duplicate matching is Later (L3), after measuring N1's exact-match miss rate.
- **Why:** Each one either breaks privacy-first positioning, adds regulatory exposure ⚖️, or competes with our own members (product-assessment §6).
- **Links:** RD-004, RD-005, RD-007.
- **Status:** decided

## PD-011: Business-day calendar for claim windows and SLAs (provisional)
- **Date:** 2026-11-12
- **Decision:** One shared business-day helper used by N1 (5-business-day claim window) and N4 (SLA, reminders, release). v1: Monday–Friday in `America/Toronto` (covers Montréal and Toronto), no holidays, until the strategist answers Q-6.
- **Why:** RD-004 and RD-007 both count business days; two implementations would drift.
- **Alternatives:** Calendar days: simpler, but contradicts the decided rules.
- **Links:** RD-004, RD-007.
- **Status:** superseded by PD-015 (holiday handling decided in RD-018)

## PD-012: N1 brief finalised on RD-013 to RD-018; scope adjustments
- **Date:** 2026-11-12
- **Decision:** Adopt the strategist's answers to Q-1 to Q-6 in the N1 brief (rev. 2, now final for design and engineering). Scope calls:
  - **Must:** client-scope check (subject to PD-013), required identifier, 30-day sticky stop, withdrawn/cancelled keep first position with an **explicit release in the withdraw dialog**, referral-as-evidence and attestation in the claim form, one claim per referral, uncontested = final, ON ∪ QC holiday table with frozen deadlines.
  - **Should:** admin abuse flags (> 5 stops in 7 days; 2 rejected claims in 90 days) as an admin-metrics line; release from an already withdrawn/cancelled referral (pending strategist Q-7); org-language hint in the admin resolution form.
  - **Won't:** check across hiring orgs (never); sourcing-side evidence file access; contest-deadline reminder (N4); everything in recruiting-input §8.
- **Why:** Release is Must because RD-015 makes withdrawn referrals block others for the whole window; without release the rule has no exit. Referral evidence is Must because it's the only answer to fingerprint misses before L3 and it's a small picker over referrals B already owns. Abuse flags are Should because they're observability, not enforcement, and the 30/h limit plus audit already bound A-1.
- **Alternatives:** Ship release and referral evidence later: leaves RD-015 and RD-016 half-implemented at launch.
- **Links:** RD-013, RD-014, RD-015, RD-016, RD-017, RD-018; `docs/specs/duplicate-prior-presentation/brief.md`.
- **Status:** decided

## PD-013: Client-scope build fallback for N1
- **Date:** 2026-11-12
- **Decision:** The backend engineer estimates the client key (BR-23: normalisation, backfill, snapshot on referral) on day 1. If it's more than ~2 engineering days, N1 ships with same-job scope and the client scope becomes N1's first follow-up, which **must ship before the founding cohort's first placements**. The neutral message is worded for both scopes from day one. The PM records which branch was taken as an addendum to this entry.
- **Why:** RD-013's own fallback. The rest of N1 (claims, disputes, calendar) doesn't depend on the client key, and placements, where the fee fight would happen, come weeks after launch.
- **Alternatives:** Always ship both scopes together: may delay the whole of N1 for one normalisation component. Ship same-job only with no deadline for the follow-up: leaves the most common real conflict uncaught (RD-013 rationale).
- **Links:** RD-013, RD-003.
- **Status:** decided (branch to be recorded after the estimate)
- **Addendum (2026-11-12): full-scope branch taken.** The backend's day-1 estimate ([`backend-estimate.md`](../specs/duplicate-prior-presentation/backend-estimate.md) §3) puts the client key at ~1.5 engineering days (range 1.5–1.75), under the ~2-day limit. N1 ships the job scope and the client scope together. No fallback, no client-scope follow-up. Detail in PD-016.

## PD-014: N1 implementation interpretations
- **Date:** 2026-11-12
- **Decision:** Product-level calls filling gaps in RD-013 to RD-018, none changing a recruiting rule:
  - A BR-8 closure ("already presented" at delivery) creates a sticky stop, like a submission-time stop.
  - The client key for an earlier referral is snapshotted on the referral at delivery; later edits to the job's client name don't move it in or out of scope.
  - Referrals delivered before N1 ships get `claim_deadline_at` backfilled from `submitted_at`; if already past, no claim.
  - The holiday table is seeded 2026–2028 by migration; no admin editing UI this release (yearly change, migration is enough).
  - Until O-1 is answered, no automatic evidence-file deletion is built; the fingerprint purge follows BR-21 as written.
  - Legacy `duplicate` declines count as presentations and can't be claimed or contested retroactively.
- **Why:** Each keeps the rule deterministic (snapshots and stored deadlines don't move under a live case) or avoids building something whose parameters aren't decided (evidence retention).
- **Alternatives:** Admin holiday editor now (low value before 2028); evidence purge with the strategist's 12 months now (pre-empts a user ⚖️ decision).
- **Links:** RD-013, RD-014, RD-017, RD-018, O-1 in the N1 brief.
- **Status:** decided

## PD-015: Business-day calendar final (supersedes PD-011)
- **Date:** 2026-11-12
- **Decision:** One shared helper for N1 and N4: Monday–Friday in `America/Toronto` minus the union of Ontario and Québec statutory holidays (admin-maintained table, seeded 2026–2028), event day excluded, deadline 23:59:59 ET on the Nth business day, deadlines stored when the clock starts.
- **Why:** RD-018 answered Q-6. No-holiday counting would turn a Christmas-week window into two real days.
- **Alternatives:** See RD-018 (per-org calendars, calendar days).
- **Links:** PD-011, RD-018, RD-004, RD-007.
- **Status:** decided

## PD-016: N1 ships full scope; backend contract changes become constraints
- **Date:** 2026-11-12
- **Decision:**
  - Take the full-scope branch of PD-013 (client key in this release).
  - Adopt as N1 constraints (brief §7.1, EC-1 to EC-8):
    - submit RPCs return outcomes (`created` / `stopped` / `pending_warning` / `identifier_required`) instead of raising, and `respond_candidate_request` returns `already_sent`;
    - new `referrals.delivered_at` is the only delivery test, backfilled from the shared-profile snapshot;
    - transaction-level advisory lock per hiring org in the check and at delivery;
    - evidence SHA-256 computed once by the worker from the stored object, and a claim can be filed only when its files are clean and hashed;
    - `docs/architecture.md` lists the new service-role uses (evidence hashing and signing, maintenance calls, key recompute);
    - client key computed by a trigger and kept in closed tables;
    - lazy "final uncontested";
    - admin-only return to `submitted` on a rejected claim.
- **Why:**
  - The client key is ~10% of the backend work (≈ 1.5 of ≈ 16.75 days). Deferring it would break PD-014's delivery snapshot for every referral delivered in between.
  - Each contract change closes a correctness or security hole found in the code: rolled-back stops, `submitted_at` set at insert, cross-record races, forgeable hashes.
- **Alternatives:**
  - Fallback with the snapshot column only (~0.5 day): saves ~1 day and leaves the most common conflict uncaught.
  - Keep raising on a stop: loses the sticky stop and the audit event (BR-6).
  - App-computed evidence hash: forgeable by a direct RPC call.
- **Links:** PD-013 (addendum), PD-014, RD-013, RD-014, RD-016; [`brief.md`](../specs/duplicate-prior-presentation/brief.md) rev. 3; [`backend-estimate.md`](../specs/duplicate-prior-presentation/backend-estimate.md).
- **Status:** decided

## PD-017: Client name on jobs stays optional, explained as internal-only (N1 Q-PM-1)
- **Date:** 2026-11-12
- **Decision:**
  - Don't require a client name on jobs open to external referrals in this release. It stays required only for non-confidential jobs, as today.
  - When the job is confidential, the job form says the name is internal-only, never shown to partners, and used to catch duplicates across the org's jobs for that client.
  - Connector and API jobs without a name are accepted and get no key.
  - Track the share of referral-open jobs with a client key on the admin metrics page. If it is < 50% after the founding cohort's first 4 weeks, revisit with the strategist.
- **Why:**
  - A required field doesn't produce real names, because "Confidential" and the other placeholders give no key (BR-23). It would add friction to job posting, which drives liquidity, for little gain.
  - The hiring org is the one that benefits from the client scope (it avoids receiving duplicates and can pick referral evidence across jobs), so an explanation aligned with its own interest is the right lever.
  - Whether agencies will, or should be required to, record the end client on a network platform is a recruiting-practice question, so it goes to the strategist (brief Q-8). The default is the one above.
- **Alternatives:**
  - Require the name on referral-open jobs: friction, easy to bypass, and it blocks connector imports.
  - Require it and reject placeholders: pushes users to invent names, which produces wrong client keys.
- **Links:** RD-013, RD-016 (client confidentiality); brief BR-32, Q-8, R-11.
- **Status:** decided (revisit on the Q-8 answer or the coverage signal)

## PD-018: Fingerprint key in Supabase Vault; hashing only in the database (N1 Q-PM-2)
- **Date:** 2026-11-12
- **Decision:** Treat this as a **security constraint, not optional**:
  - The HMAC key exists only in Supabase Vault. The migration generates it if it's absent, so each environment has its own key.
  - The key has no env var, no `.env.example` entry, and never reaches the app, the browser or a log.
  - All normalising and hashing happens in `SECURITY DEFINER` functions in the non-exposed `app` schema, from the stored candidate row. No RPC accepts hashes or normalised identifiers.
  - Rotation, or loss of the key, is handled by a service-role-only recompute from current identifiers with `key_version`. Rotation happens only on suspected compromise.
  - This supersedes the brief rev. 2 line "HMAC secret in env only".
- **Why:**
  - `submit_referral*` is callable by `authenticated` and `respond_candidate_request` by `anon`. If the app computed the hashes, a direct PostgREST call could pass forged or missing hashes and skip the check, which is the A-2 evasion.
  - Vault is already the pattern for connector secrets.
  - An off-database copy adds exposure and no value, because losing the key is recovered by a recompute.
- **Alternatives:**
  - App-side hashing with the key in env: bypassable.
  - Env var as the provisioning source copied into Vault: a second place to leak the key, with no recovery benefit.
- **Links:** RD-014 (A-2), BR-1, BR-22, BR-33; `docs/security-and-privacy.md` (to be updated by backend).
- **Status:** decided

## PD-019: Holiday seed includes weekday substitutes (N1 Q-PM-3)
- **Date:** 2026-11-12
- **Decision:**
  - The 2026–2028 seed adds weekday substitutes for weekend Christmas, Boxing Day and New Year's Day: 2026-12-28, 2027-12-27, 2027-12-28 and 2028-01-03.
  - There is no substitute for 24 June 2028 or 1 July 2028, which both fall on a Saturday: Québec and federal practice move these holidays only when they fall on a Sunday.
  - The full seed is in brief appendix A. Backend verifies it against the Ontario ESA and CNESST sources before seeding.
- **Why:**
  - RD-018 asks for "observed dates", and these weekdays are when businesses in the corridor are actually closed.
  - Under the union principle, an extra day only ever lengthens a window, which harms no one.
  - This applies RD-018's parameters and doesn't change the recruiting rule.
- **Alternatives:**
  - No substitutes: a Christmas-week window would lose up to two real days, which is the failure RD-018 rejects.
  - Also add substitutes for Saturday holidays in Québec: not backed by the provincial rules.
- **Links:** RD-018, PD-015, BR-17, BR-28.
- **Status:** decided (strategist may correct via a migration; applies to new deadlines only)

## PD-020: N1 remaining interpretations after the backend estimate
- **Date:** 2026-11-12
- **Decision:**
  - **Internal referrals** (related orgs that share a member) follow the same duplicate, stop, release and claim rules. Under RD-003, "presented" means delivered to the job owner, and an internal referral is delivered. Strategist confirmation requested (brief Q-9, non-blocking).
  - **Pre-N1 client-key snapshot** is backfilled from the job's client name at migration time.
  - **Rotation and the fingerprint backfill** recompute from the candidates' current identifiers. Identifiers at an old delivery can't be recovered, and that's accepted.
  - **`client_confidential` has no effect on the key.** The flag only controls display to partners.
  - **Release flag:** visible to the sourcing side and platform admins only. The hiring side sees "withdrawn", and the flag must not be readable from the hiring side's `referrals` select (+~0.25 day).
  - **Pending warning:** two-step submit with an explicit acknowledgement. The first call has no side effect except the audit event, and the second call re-runs the full check.
  - **Q-7** (release after the fact) is not settled by RD-015. Its "when withdrawing" wording may be a timing constraint. Keep it as a Should on the "allowed" assumption, pending the strategist.
- **Why:**
  - Each choice keeps the check deterministic and private: no hit-scope or intent leak to the hiring side.
  - None changes a recruiting rule. Where one might (internal referrals, Q-7), the strategist is asked and the default is reversible.
- **Alternatives:**
  - Exclude internal referrals: an outside partner could double-submit a person the hiring org already received through its sister org.
  - Show the release to the hiring side: adds nothing it needs, and signals that the candidate is free to approach.
  - Single-step submit with a dismissible warning: harder to audit as a deliberate acknowledgement.
- **Links:** RD-003, RD-013, RD-015; PD-014; brief BR-7, BR-23, BR-25, BR-31, BR-33, BR-34, Q-7, Q-9.
- **Status:** decided (Q-7 and Q-9 later answered by RD-019 and RD-021, see PD-021 and PD-022)

## PD-021: Release later is Must, guarded; declined/rejected release waits (N1 Q-7)
- **Date:** 2026-11-12
- **Decision:**
  - Release from a referral that is already `withdrawn` or `cancelled` moves from **Should to Must** (brief Must 5, BR-25).
  - Both entry points (the withdraw dialog and release later) offer release only when the referral **was delivered**, **still counts** (BR-4) and has **no open dispute**. Otherwise the option is hidden, and the RPC re-checks all three.
  - Release later uses the same wording, the same **two-step** irreversible confirmation, flag and audit as the dialog. The hiring side sees "withdrawn" or "cancelled" only.
  - Release from `declined` and `rejected` referrals (RD-019's recommended extension) is **not in this release**. It goes to the first follow-up, decided at N1 acceptance.
- **Why:**
  - RD-019 removes the timing doubt. Cancelled referrals and referrals withdrawn before N1 have no other way to be released. Without this, R-8 (candidate stuck) has no answer for them.
  - It is already being built as the Should (`release_referral`). Moving it to Must adds guard checks and a second confirmation step, not a new surface.
  - Declined/rejected would add new entry points on the decline views and an interaction with open claims. The interaction is small but has to be designed, and backend is mid-build. Those referrals keep first position meanwhile, and the sourcing side can go through support. It's a scope widening, not a correctness fix.
  - Hiding the option when the referral was never delivered also removes a meaningless release in the withdraw dialog.
- **Alternatives:**
  - Keep it Should: it could be dropped under time pressure, leaving cancelled referrals unreleasable.
  - Ship declined/rejected now: small, but adds design and QA work mid-build for a less common case.
- **Links:** RD-015, RD-019; brief BR-4, BR-25, Must 5, scenarios 42–43; supersedes the Q-7 line in PD-020.
- **Status:** decided

## PD-022: Internal referrals: admin attribute Should, internal-routing flag Won't (N1 Q-9)
- **Date:** 2026-11-12
- **Decision:**
  - BR-31 is confirmed in both directions (RD-021). No build change.
  - **Should:** record on each fingerprint hit whether the matched earlier referral was internal. It goes in a closed, admin-only store, **never** in `audit_events.metadata`, because org admins and managers read their org's audit events. The cap is ~0.25 day, otherwise it moves to the follow-up.
  - **Won't (this release):** the internal-routing flag (> half of a hiring org's stops against outside partners from internal referrals, ≥ 5 in 30 days). It ships with the BR-29 abuse-flags follow-up.
- **Why:**
  - The stop itself already closes the laundering route. Monitoring only detects the CV-bombing variant, and a founding cohort of 30–50 orgs has few related-org pairs.
  - The attribute is worth recording early because hit history can't be rebuilt later (sticky stops are purged after 30 days, and member-visible audits must stay PII-free). The flag can be computed later from that data.
  - Putting it in the member-readable audit would leak to the submitter's org admins whether the earlier referral was internal (BR-9).
- **Alternatives:** both now (new admin UI mid-build); neither (no data when the signal is needed).
- **Links:** RD-021, RD-002, RD-005; brief BR-9, BR-20, BR-29, BR-31, R-16, scenarios 44–45.
- **Status:** decided

## PD-023: Real client name on referral-open jobs becomes an N3 prerequisite (N1 Q-8)
- **Date:** 2026-11-12
- **Decision:**
  - N1 is unchanged: the client name stays optional (PD-017, BR-32).
  - The job-form helper adds RD-020's angle: without a name, the hiring org gets no protection across the client's other roles and can't cite an earlier referral from another job.
  - Roadmap: before N3 ships, jobs open to **external** referrals require a real, non-placeholder client name. Connector and API jobs without one can be created but can't be opened to external referrals until it's added.
  - Pulled forward if coverage is below 50% after the founding cohort's first 4 weeks.
  - The network-rules expectation and the client-NDA fit go to counsel (brief C-8).
- **Why:** RD-003 ownership is "same end client, any role". N3 can't enforce it without a client identity, and blank names would become a split-free backdoor. Requiring it now would add friction at the adoption point, before members have seen the platform keep the name private.
- **Alternatives:** require now (rejected in PD-017 and RD-020); never require (leaves RD-003 unenforceable).
- **Links:** RD-003, RD-020; PD-017; brief BR-23, BR-26, BR-32, C-8; roadmap N3.
- **Status:** decided (N3 pre-step; counsel check ⚖️ on the rules wording)

## PD-024: Admin "same person" signal and evidence access, dispute-scoped (N1 Q-D1)
- **Date:** 2026-11-12
- **Decision:** Option **(b)**.
  - Admins see metadata only: orgs, job title, client at delivery, dates, status, "still counts". They also get a server-computed **"same person" signal** for the two referrals of a **referral-evidence** dispute: email / phone / LinkedIn, each shown as `match`, `no match` or `not available`.
  - The signal comes from an admin-only `SECURITY DEFINER` RPC. It checks `is_platform_admin`, accepts only a dispute id of type `prior_presentation` whose claim uses referral evidence, and compares the two referrals' stored fingerprints inside the database. It returns enums only, never values or hashes. Each call writes an admin audit event (admin, dispute; no identifiers). It goes on the `api-surface` allow-list.
  - Admins see **no** candidate name or label, no shared profile, no candidate documents. File-evidence disputes get no signal: admins read the files.
  - **Admin evidence-file download** (BR-15) is scoped server-side to claims that have a dispute (open or resolved). It uses the same 60-second signed URL after a passed scan, and every download is audited (AC-44). Claims without a dispute: no admin file access in-app. Investigating a fabricated claim with no dispute goes through the existing out-of-band procedure.
  - **`docs/security-and-privacy.md` must be updated** (backend-engineer, in this release). Under "Platform admins", record these two narrow, audited, dispute-scoped exceptions to "no RLS access to candidate data". Evidence files contain candidate and third-party personal data. The N7 PIA lists both exceptions.
- **Why:**
  - BR-18 requires admins to decide whether two referrals concern the same person. The signal answers that for most referral-evidence disputes without exposing any new candidate data.
  - BR-15 already gives admins the files. Tying access to a dispute keeps it to the one case where an admin has to judge, and makes every access traceable.
  - Privacy is a hard constraint: option (c) would open in-app admin access to shared profiles, which the security model rules out.
- **Alternatives:**
  - (a) metadata only: admins couldn't tell "same person" when the candidate labels differ, so they'd fall back to asking the parties, which is slow and leaks to them.
  - (c) adds both shared profiles: a new PII surface for admins, rejected.
  - Admin file access on every claim: wider than needed.
- **Links:** RD-016, RD-017; PD-018; brief BR-15, BR-18, BR-26, C-3, C-4; spec Q-D1, AC-43, AC-44.
- **Status:** decided

## PD-025: Support path for wrong stops: mailto with an opaque reference (N1 Q-D2)
- **Date:** 2026-11-12
- **Decision:**
  - The stop state (S1-d) shows a `mailto:` link to a support address read from **one server-side env var** (documented in `.env.example`). The subject is "Stopped referral {reference}". There is **no prefilled body**, and the copy asks only for the reference, never for candidate details.
  - **Reference:** the first 8 characters of the stop's audit event id. It is present on **every** stop, including sticky stops, so the `stopped` payload keeps the same shape in every case (AC-5). It carries no identifier, scope or first-submitter information. Admins look it up in the audit log, with no new admin UI.
  - If the env var is unset (local and dev), the support line is hidden. **Setting it is a launch-checklist item** (N8).
  - The address itself is outward-facing: **Needs user decision** (recommendation: a role address on the product domain, for example `support@`, monitored by the platform admins).
- **Why:** R-5 (false positives with no override) needs a way out for users. A mailto is the smallest channel that works with no new surface. An opaque reference lets admins find the hit without putting ids or identifiers into a user-facing message.
- **Alternatives:**
  - An in-app support form: new surface, storage and triage UI, not now.
  - No reference: admins couldn't find the hit without asking for candidate details by email, which is worse for privacy.
- **Links:** brief R-5, BR-9, BR-24, §4 (wrong-stop tickets); spec S1-d, AC-5, Q-D2; roadmap N8.
- **Status:** decided (support address: Needs user decision)

## PD-026: In-app notifications stay English-in-SQL for N1; localisation is a launch follow-up (N1 Q-D6)
- **Date:** 2026-11-12
- **Decision:**
  - N1's new notification kinds follow the existing `app.notify_org` pattern: English title and body written in SQL. **Emails use the recipient's locale.** Each new event gets its **own distinct `kind`**, so the follow-up can map kind to i18n keys.
  - **Follow-up, before the founding-group launch:** render every in-app notification from `kind` + structured, PII-free params with i18n keys (en / fr-CA / pt-BR), for all kinds, not only N1's. It's added to roadmap N7 as product work (S; backend + frontend + ux-writer).
- **Why:**
  - Localising only N1's kinds would need a params column and a second render path mid-build, and would leave every other notification in English anyway.
  - A single pass over all kinds costs about the same and fixes the whole problem.
  - Québec is the beachhead (C-5), so English-only in-app notifications can't ship to the founding group. That makes this a launch gate, not "later".
- **Alternatives:** localise N1's kinds now (partial fix, mid-build rework); leave it for later (fr-CA members would get English notifications at launch).
- **Links:** RD-001; PD-005; brief C-5, BR-20; spec S10, Q-D6; roadmap N7.
- **Status:** decided

## PD-027: Hiring-side ownership footer unchanged on released referrals in N1; N3 must revisit (N1 Q-D10)
- **Date:** 2026-11-12
- **Decision:**
  - N1 keeps the existing hiring-side footer ("Ownership protected until {date}.") on withdrawn and cancelled referrals, released or not (AC-23).
  - **N3 must revisit it** before ownership is enforced. Whatever the hiring side sees then must be true for released referrals without revealing the release (PD-020). This is logged in roadmap N3 and as brief R-17.
- **Why:**
  - In N1, ownership isn't enforced, so the footer drives no outcome.
  - For unreleased withdrawn referrals, the footer is true and useful: they keep first position (BR-4).
  - A neutral footer on all withdrawn referrals would remove true information from the common case to fix a rare one. Showing the truth only on released referrals would leak the release.
  - N6a already flags the footer's wording.
- **Alternatives:** a neutral "Withdrawn on {date}." footer on all withdrawn referrals (loses true info, extra copy and QA mid-build).
- **Links:** RD-007, RD-015, RD-019; PD-020, PD-021; brief BR-4, BR-25, R-8, R-17; spec S2-h, AC-23, Q-D10; roadmap N3, N6a.
- **Status:** decided

## PD-028: Remaining N1 spec questions take the designer's defaults; "claim" glossary goes to ux-writer (N1 Q-D3–Q-D5, Q-D7–Q-D9)
- **Date:** 2026-11-12
- **Decision:**
  - **Q-D3:** The prior-process date must be **strictly before** the delivery's ET date, and no earlier than the same calendar day 6 months before it (both bounds in ET, inclusive of the lower one). Matches AC-29.
  - **Q-D4:** PDF, PNG and JPEG only; up to 5 files; 10 MB each. **No CSV, XLSX or DOCX** this release. Spreadsheets are bulk third-party data with formula-injection risk, and a PDF or screenshot of the ATS record is enough. Revisit if wrong-format support tickets or claim abandonment show up.
  - **Q-D5:** The contest reason is visible to **admins only**. Both sides read the admin's resolution. The contest form's hint says who reads it.
  - **Q-D7:** No claim-window indicator in the queue or panel. It shows only in the decline-dialog callout, the claim form and the referral-page button (R-3, A-9).
  - **Q-D8:** BR-20 closure notification goes to the **submitting member only**. If that member is no longer active in the org, it falls back to the sourcing org's owners and admins, so a closure never notifies no one.
  - **Q-D9:** Claims are allowed on referrals whose sharing authorization was revoked, while status and deadline allow it. Revocation doesn't change who presented first. Revoked referrals that still count also qualify as **referral evidence** (BR-26).
  - **Glossary ("claim"):** the user-facing term goes to **ux-writer-marketing**. It must stay distinct from "dispute" and from N3's sourcing-side referral-level claims (roadmap N3). Code identifiers (`claim*`, `prior_presentation`) don't change whatever the user-facing term is.
- **Why:** Each default is the smallest option and changes no recruiting rule. Q-D8's fallback closes a silent-failure gap at negligible cost. The glossary must be fixed before N3 reuses the word.
- **Alternatives:**
  - Q-D4: accept spreadsheets (new parser/scan surface, more PII).
  - Q-D5: show the reason to the hiring side (invites a two-party argument outside the admin's resolution).
  - Q-D8: whole org (noise).
- **Links:** brief BR-4, BR-12, BR-15, BR-16, BR-20, BR-26, R-3; spec Q-D3–Q-D5, Q-D7–Q-D9, AC-17, AC-27, AC-29, AC-30, §5 glossary row.
- **Status:** decided

## PD-029: Referral evidence is judged at the claimed referral's delivery; a later release changes nothing (N1 QA B-2)
- **Date:** 2026-11-13
- **Context:** QA found that the BR-26 picker (and `claim_referral_invalid` on a forged citation) tells the hiring side that a withdrawn referral was released: it drops out of the picker the moment it's released. BR-25/AC-68 forbid that; AC-31 required it. The spec contradicted itself.
- **Decision:**
  - An earlier referral E qualifies as referral evidence against the claimed referral C when:
    - B's org received it, for the same job or a job with the same client key (unchanged);
    - it was delivered before C's `delivered_at` (unchanged);
    - **at C's `delivered_at`** it was inside its ownership window (`ownership_protected_until > C.delivered_at`) and not released (`released_at` is null or later than `C.delivered_at`);
    - **now**, no claim against it has been upheld or become final, and it isn't `already_presented` (unchanged, and B already knows all of this).
  - So a release made **after** C was delivered doesn't change the picker or the filing result, and the claim can be upheld on that evidence. A referral released **before** C was delivered doesn't qualify. It's left out of the picker and refused with the same `claim_referral_invalid` code as every other ineligible referral.
  - **Accepted residual (brief R-18):** B can infer that a withdrawn or cancelled referral, still inside its window and missing from the picker, was released before C arrived. This can't be removed. When the fingerprints match, C's very existence already tells B the same thing, because an unreleased E would have stopped C. And the PD-020 harm ("signals the candidate is free to approach") doesn't apply, because C now holds first position. BR-25 and AC-68 are amended to name this one exception.
- **Why:**
  - Recruiting logic (RD-019 rationale): release gives up **only the releasing org's own position**. Judging at filing time would let a later release cancel B's valid "we already had them" defence. It would also open a collusion route, where A releases after the fact so that A1 beats B's claim (RD-019's "release sold" risk). Judging at C's delivery answers the real question: was this person already presented to B when C arrived?
  - It follows PD-014 (client key snapshotted at delivery) and BR-28 (deadlines frozen when the clock starts): facts are fixed at delivery.
  - It closes QA's repro completely, with no new UI or state.
- **Alternatives:**
  - List released referrals and settle at admin resolution with a "neutral" outcome: every honest outcome (rejected, refused, not final) still tells B that the evidence didn't qualify, so it leaks the same fact later. Uncontested claims become final without an admin, so A1 would lose on evidence the rules say doesn't qualify.
  - Keep "still counts now" and amend BR-25 to accept the leak: a later release could still defeat a valid claim (the collusion route).
- **Strategist confirmation (non-blocking, reversible):** RD-016 says "delivered earlier, still counting" without saying *when*. This PD reads it as "counting when the claimed referral was delivered". The default stands unless the strategist objects.
- **Links:** RD-015, RD-016, RD-019; PD-014, PD-020; brief BR-25, BR-26, R-18; spec AC-31, AC-68; QA B-2.
- **Status:** decided (strategist confirmation requested)

## PD-030: N1 emails move to a notification-email follow-up; in-app is N1's channel (N1 QA B-3)
- **Date:** 2026-11-13
- **Decision:**
  - N1 ships **in-app notifications only** for closure, claim filed, dispute opened and dispute resolved. Must 10 and AC-17/AC-57 drop "email when configured".
  - **Follow-up: notification emails, a launch gate in N7.** One pipeline for all in-app notification kinds, not only N1's:
    - an outbox job enqueued in the same transaction as the notification;
    - a worker handler that resolves recipients and their locale with the service role, which `architecture.md` must list;
    - templates rendered from `kind` + PII-free params, in en / fr-CA / pt-BR;
    - idempotent sending through `sendEmail`.
    - It's built in the same pass as PD-026's localisation, because both render from `kind` + params. N1's `emails.*` keys (spec §5.10) are kept for it.
  - **Claim filed** is the one deadline-bearing event (10 business days to contest), so its email is **required before the founding-group launch**. The follow-up can't drop it.
- **Size (from the code):** no notification email exists today for any kind. `src/server/email/templates.ts` has only auth, team-invite and candidate-request emails, all sent synchronously from actions or routes. The four N1 events are raised inside SQL, one of them in the anonymous candidate path (`respond_candidate_request`). Building it for N1 alone: backend ~1.5 days (outbox enqueue in 4 SQL paths, worker handler, recipient and locale resolution, idempotency, tests), ux-writer ~0.5 day, QA ~0.5 day, so **~2.5 days**. Most of that is the pipeline, which the follow-up builds once for every kind.
- **Why:**
  - A one-off pipeline for 4 of the product's notification kinds repeats the partial fix PD-026 rejected.
  - Email also adds a new sub-processor flow of personal data (recipient addresses to Resend) that the N7 PIA must cover anyway.
  - N1 isn't in production. Nobody can miss a contest window before launch, and the launch gate covers the risk.
  - In N1, the in-app notification (with the deadline) and the claim panel (deadline in ET, business days left) carry the information.
- **Alternatives:** build it in N1 (~2.5 days, delays acceptance, partial pipeline); drop email entirely (sourcing orgs that don't log in for 2 weeks lose contests, a trust problem).
- **Links:** RD-017; PD-026; brief Must 10, BR-20; spec S10, §5.10, AC-17, AC-57; roadmap N7, N8; QA B-3.
- **Status:** decided

## PD-031: Client-scope stop that reveals a shared client to an org's own earlier submitter: accepted residual (N1 QA m-8)
- **Date:** 2026-11-13
- **Decision:**
  - The scenario: A presented X to B's J1 and later submits X to B's confidential J2 at the same client. A gets the neutral stop and can infer that J2 has J1's client. If J1's client name was shown, A learns J2's client. **Accepted as a residual for N1** (brief R-19). No rule change.
  - The residual is recorded in `docs/security-and-privacy.md`. The inference reveals only that two of B's jobs share a client. It never names a client that wasn't already shown, the hit scope stays hidden in the message (BR-9), and it needs A's own earlier presentation of the same person.
  - **Follow-up question to the strategist (non-blocking):** should a sourcing org's **own** earlier presentation at client scope (not job scope, not a sister org) route to the "consider for another job" path (RD-013, Later) instead of a stop? That would also remove this inference.
- **Why:**
  - Under RD-003 ("same client, any role"), A already holds the introduction for X across that client's roles. In N3, A will learn that its ownership covers J2 anyway.
  - An own-org exemption changes RD-013/BR-3 and BR-9's symmetry mid-QA. It also wouldn't close the wider inference: client-scope stops and sticky stops seen across two jobs hint at a shared client whoever presented first. That is part of R-2.
  - The hiring org chose to record the same client on both jobs.
- **Alternatives:** exempt own-org client-scope hits now (recruiting-rule change without the strategist, partial fix); drop the client scope (rejected by RD-013).
- **Signal to revisit:** a hiring org's complaint that a partner learned a confidential client this way; client-scope hits where the earlier referral is from the submitter's own org (admin store) above ~20% of client-scope hits.
- **Links:** RD-003, RD-013; PD-016, PD-017; brief BR-3, BR-9, R-2, R-19; QA m-8.
- **Status:** decided (strategist follow-up question)

## PD-032: Expired candidate requests aren't pending; their fingerprints are purged; a resend restores them (N1 QA m-9)
- **Date:** 2026-11-13
- **Decision:**
  - An `awaiting_candidate` referral whose candidate request has expired (`expires_at` < now) is **neither pending nor a presentation** (BR-5). It gives no warning to anyone, because it can't be delivered: `respond_candidate_request` refuses expired links.
  - The maintenance sweep **deletes the fingerprints** of such referrals (BR-21: they no longer serve first presentation). There's no status change: the referral stays `awaiting_candidate` and the sourcing side can still resend.
  - A **resend** (`rotate_candidate_request_token`) recomputes the referral's fingerprints in the database from the candidate's current identifiers, so it's pending again from the resend. Resend doesn't run a stop check. The delivery re-check (BR-8) still decides the outcome, as in the AC-16 race.
- **Why:**
  - It removes the perpetual warnings and the fingerprints kept forever.
  - It needs no new status, no new UI and no new copy.
  - Correctness never relied on the pending state, because delivery always re-checks.
- **Alternatives:**
  - Auto-close expired referrals into a new status: new state, UI and copy, and it breaks the existing resend.
  - Run the full stop gate on resend: a new resend outcome in UI and copy for a rare case that the delivery re-check already handles.
  - Wait 30 days after expiry before purging: keeps pseudonymous data with no purpose.
- **Links:** RD-004.1, RD-015; brief BR-5, BR-8, BR-21; spec AC-76 (new); QA m-9.
- **Status:** decided

## PD-033: Upload percentage not required in N1; support reference becomes a random token (N1 QA m-6, m-5)
- **Date:** 2026-11-13
- **Decision:**
  - **m-6:** The claim form's **Uploading** state may use an indeterminate progress indicator, with the text status announced. A percentage isn't required in N1, and AC-65 is amended. It's revisited if a shared upload component gains progress, or if the file limit grows past 10 MB.
  - **m-5 (backend is fixing it):** PD-025's reference changes from "first 8 characters of the audit event id" to a **random opaque token** stored on the hit row. It's on every stop, carries no information and is unique. Admins look it up through the hit. The subject line and the rest of PD-025 are unchanged.
- **Why:**
  - m-6: Files are at most 10 MB and upload in seconds. The indeterminate state plus "Uploading" text meets the accessibility constraint, and upload progress through Server Actions needs a different upload path.
  - m-5: The audit-id prefix leaked platform-wide event volume and stops being unique.
- **Alternatives:** require the percentage (frontend rework of the upload path for little user value).
- **Links:** PD-025; brief §7, R-12; spec AC-5, AC-65, S1-d; QA m-5, m-6.
- **Status:** decided

## PD-034: N1 accepted; AC-61 and AC-62 (dark) verified live before launch, not before acceptance
- **Date:** 2026-11-15
- **Decision:**
  - N1 (duplicate and prior-presentation protection) is **accepted** against brief rev. 4.2.
    - QA final verdict: PASS, with no blockers or majors.
    - Design B-1 to B-4: fixed.
    - Copy: 0 blockers.
    - Every BR and EC is met, and all Should items shipped.
  - AC-61 (keyboard-only) and the dark half of AC-62 weren't run live by QA. They are accepted on the design review's code reading, the applied focus fixes, and frontend's live dark checks at 375px. A **live pass by qa-engineer, spot-checked by product-designer, is a launch-checklist item**. A blocker found there reopens N1.
  - Not gating, and moved to roadmap follow-ups:
    - design polish 11 and 17;
    - the 26px `/admin` overflow from the pre-existing "Newest organizations" panel (S9 isn't in AC-62);
    - the unused `referrals.success.claimFiled` / `contested` keys.
  - Design polish 14 is closed: QA's later E2E asserts the days-left line.
  - The PM added the missing N1 lines to `docs/product-flows.md` (a DoD item).
- **Why:**
  - Nothing known is broken. The gap is evidence, not a defect.
  - N1 isn't in production, so the launch gate covers the risk.
  - Holding acceptance would delay N3, which depends on N1.
  - Desktop 32px targets still exceed WCAG 2.2 AA target size (24px). Our 44px rule is stricter house policy.
- **Alternatives:** hold acceptance for a QA browser run (delays N3 for evidence on a non-production feature); waive the live pass (accessibility is a stated constraint, rejected).
- **Links:** brief §10; spec AC-61, AC-62; `acceptance.md`; `design-review.md`; `qa-report.md`; roadmap N1 and the launch checklist.
- **Status:** decided

## PD-035: Forgeable candidate confirmation (QA X-1) becomes Now item N9: launch gate, before N3
- **Date:** 2026-11-15
- **Decision:** QA's X-1 (the caller supplies the confirmation token hash, so a recruiter can confirm "as the candidate") becomes roadmap item **N9, Candidate-confirmation integrity**:
  - in Now and a launch gate;
  - an **N3 dependency**;
  - size S: backend-engineer → qa-engineer, no design or copy work.

  It isn't an N1 blocker.
- **Why:**
  - It predates N1, and N1's rules still hold because the delivery re-check runs.
  - Since N1, though, delivery holds first position against other agencies, and RD-003 makes candidate confirmation one of the two ways to be "presented". A forged confirmation is a false consent record that wins first position.
  - N3 turns first position into fee entitlement.
  - Security and trust are hard constraints, so this can't ship to the founding group.
- **Alternatives:**
  - Block N1 acceptance on it: punishes N1 for a pre-existing bug and delays N3, while launch is gated anyway.
  - Put it in Next: rejected, because it would launch with forgeable consent evidence.
- **Links:** RD-003, RD-004; QA X-1 (round 3 and final); roadmap N9, N3.
- **Status:** decided

## PD-036: `errors.duplicate_referral` stays an error; it's outside BR-9 (N1 copy-review P12)
- **Date:** 2026-11-15
- **Decision:** Resubmitting the **same candidate record** to a job where it already has a live referral keeps returning `duplicate_referral`, with the actionable copy ("You already submitted this candidate to this job. Open it from your sent referrals.", shipped in en / fr / pt). It doesn't become a neutral `stopped`.
- **Why:**
  - BR-10 keeps the existing record-level dedup.
  - BR-9 governs hits against **another referral of the same person**, where the neutral message protects other orgs' pipelines and clients.
  - Here the earlier referral is the submitting org's own, already visible in its Sent list. The message reveals nothing about another org, client or scope.
  - A neutral stop would hide something the user can already see and would send them to support for nothing.
- **Alternatives:** return `stopped` (less useful, no privacy gain).
- **Links:** brief BR-9, BR-10; `copy-review.md` P12; `qa-report.md` final verification.
- **Status:** decided

## PD-037: N1 operational follow-ups: yearly holiday seed, storage-trigger check before the hosted push, test and E2E hygiene
- **Date:** 2026-11-15
- **Decision:**
  - **Holiday seed:** by **1 October each year**, the table covers the next two calendar years. The process is unchanged (PD-014, PD-019: official sources, migration, PM notified). First action by 2028-10-01 (seed 2030). Owner: backend-engineer. Listed under roadmap "Recurring operations" and on the launch checklist.
  - **Hosted push precondition:**
    - Before `supabase db push` (only when the user asks), verify that the migration role can create the `claim_evidence_upload_limit` trigger on `storage.objects`.
    - After the push, verify that the trigger exists and refuses the 31st upload in an hour.
    - If the privilege is missing, don't push. Backend switches to signed upload URLs from a rate-limited RPC (QA's R2-2 alternative).
    - This is on the launch checklist (Ops).
  - **Test isolation** (`journey.test.ts`, `max_rows = 1000`): qa-engineer, before N3 QA. **Stale E2E specs** (onboarding, journey, documents): qa-engineer, before launch, as "full E2E suite green" on the checklist.
- **Why:**
  - Past the seed, `add_business_days` raises, so deliveries fail. That's an outage, not a cosmetic gap, and a two-year buffer means one missed year isn't fatal.
  - Without the trigger, the evidence upload limit doesn't exist on hosted (R2-2 reopens), or the migration fails mid-push.
  - Flaky and stale tests hide regressions on the paths N3 changes.
- **Alternatives:**
  - A computed calendar (Easter rules in code): rejected by PD-015.
  - Seed many years at once: dates move by statute, so official sources are checked per year.
- **Links:** PD-014, PD-015, PD-019; `backend.md` §11 m-4, §13 R2-2 and r2-m4; QA R2-2; roadmap "Engineering hygiene", "Recurring operations", launch checklist.
- **Status:** decided

## PD-038: N9 design: the database generates the candidate token; only a service-role path returns it
- **Date:** 2026-11-15
- **Decision:**
  - No RPC accepts a token or token hash from its caller. `p_token_hash` is dropped from `submit_referral_for_candidate` and `rotate_candidate_request_token`. The old signatures are dropped, not overloaded.
  - A new `issue_candidate_request_token(p_referral, p_actor)`, which `anon` and `authenticated` can't execute:
    - generates the token in the database;
    - stores the hash and `token_issued_at` / `token_issued_by`;
    - returns the raw token once.
  - The Server Action calls it with the admin client, only after the user-session RPC succeeded, and puts the token only in the candidate's email.
  - `respond_candidate_request` requires `token_issued_at`.
  - The resend limit (10/h) moves into the RPC.
  - Backend may deviate only if every BR in the brief still holds.
- **Why:**
  - Generating the token inside the RPC and returning it doesn't help: the recruiter is the `authenticated` caller and can call PostgREST directly.
  - The raw token must only ever reach a role the recruiter can't use.
  - Synchronous sending keeps the existing "not sent / resend" UI.
- **Alternatives:**
  - Return the token from the user RPC: rejected, because the recruiter receives it.
  - Sign the hash with a server secret checked in the database: works, but needs a secret shared between the app and Vault and more moving parts.
  - Generate in the database and send from a worker outbox: cleanest, but changes email timing and the "not sent" state. Not now.
- **Links:** PD-035; RD-003, RD-004; brief `candidate-confirmation-integrity` §3, BR-1 to BR-6, BR-10; QA X-1.
- **Status:** decided

## PD-039: N9 pending requests created before the fix are expired; recruiters resend
- **Date:** 2026-11-15
- **Decision:**
  - The N9 migration sets `expires_at = now()` on every unanswered `awaiting_candidate` request and audits each one (`referral.candidate_request_invalidated`, reason `n9_token_reset`).
  - Candidates see the existing "This link has expired" state. Recruiters see the existing "expired, resend" state.
  - Answered requests are untouched.
  - Backend reports how many confirmed referrals predate N9.
- **Why:**
  - No stored hash can be shown to be server-generated, so all of them are suspect.
  - Expiring reuses existing states and strings, so there's no design or copy work.
  - Pre-launch, so the cost is a resend on test data.
  - Per PD-032, these requests stop counting as pending for N1 until resent. That's acceptable.
- **Alternatives:**
  - Null the hash: the candidate would see "Invalid link", and the recruiter page would still say "sent".
  - Auto-resend from the migration: a migration can't send email.
  - Leave them: keeps forgeable links alive.
- **Open:** if the hosted DB holds real confirmed pre-N9 referrals when the user pushes, keeping them is a **Needs user decision** (recommendation: keep, noted in the audit).
- **Links:** PD-032, PD-038; brief BR-7, BR-8, BR-11, R-2, R-6.
- **Status:** decided

## PD-040: A recruiter-controlled candidate email (X-2) is out of N9; strategist question before N3
- **Date:** 2026-11-15
- **Decision:**
  - N9 closes the caller-chosen-token route only.
  - A recruiter can still set the candidate's email to a mailbox they control and receive a genuine link. That route is recorded as X-2.
  - N9 adds only evidence (BR-12, Should): the consent notes an email change in the 30 days before issuance.
  - Whether such confirmations count for first position and fee entitlement goes to recruitment-strategist (brief §9 Q-1), answered before the N3 brief.
- **Why:**
  - The fix depends on how much proof of right-to-represent the market expects. That's a domain question, not ours to invent.
  - Blocking or downgrading in N9 would need copy and design, and would grow an S item.
- **Alternatives:**
  - Refuse destinations matching a source-org member's email: cheap but trivially bypassed, and adds an error string. Revisit with the strategist answer.
- **Links:** PD-035, PD-038; RD-003; brief R-1, BR-12, §9; roadmap N3.
- **Status:** decided

## PD-041: N9 accepted; backend deviations D-1 to D-9 accepted
- **Date:** 2026-11-15
- **Decision:**
  - N9 (candidate-confirmation integrity) is **accepted** against its brief. QA final verdict PASS; BR-1 to BR-12 and scenarios 1–12 pass; m-1 and m-2 fixed and verified; no open bugs. `backend.md`, `architecture.md` and `security-and-privacy.md` updated. Ticked on the launch checklist.
  - All backend deviations are accepted, because each is equal to or stricter than the brief and every BR holds:
    - D-1 refused or over-limit rotates roll back their own rate-limit hit;
    - D-2 `emailCandidateRequest` issues the token itself, so it never exists in `actions.ts`;
    - D-3 no token issued when email isn't configured;
    - D-4 BR-7 expires and audits only in-date requests;
    - D-5 rotate also nulls `token_issued_at` / `token_issued_by`;
    - D-6 issuance refuses expired and answered requests (`token_already_issued` for a live token);
    - D-7 an old pre-N9 link to an answered request still shows its state, but `respond` raises `request_expired` (the page never calls respond in those states, so no user impact);
    - D-9 `send_number` counts issuances (one issuance is one email attempt).
  - The m-2 fix (referral page treats `token_issued_at` null as "not sent yet") is a behaviour fix inside an existing state with no string change, so no design or copy review.
- **Why:** X-1 is closed by evidence: no role a recruiter can use can obtain or forge a token, and the whole DB and all logs are clean of tokens and hashes. Accepting unblocks N3.
- **Alternatives:** require idempotent `respond` for pre-N9 answered links (D-7): weakens BR-6 for no user benefit.
- **Links:** PD-035, PD-038 to PD-040; `candidate-confirmation-integrity/acceptance.md`, `backend.md` §5, `qa-report.md`; roadmap N9 and the launch checklist.
- **Status:** decided

## PD-042: BR-12 kept as built (email updates only); `app.candidate_email_changes` accepted
- **Date:** 2026-11-15
- **Decision:**
  - **D-8 confirmed.** BR-12's evidence line counts only **updates** of a candidate's email in the 30 days before issuance, not a candidate record created with that address. BR-12 is not dropped.
  - Strategist Q-1 (N9 brief §9, X-2) is sharpened to ask explicitly whether a **recently created candidate record** should also affect whether a confirmation counts for first position and fee entitlement. The N3 brief applies the answer. Record creation already has a stored date (`candidates.created_at`), so no new storage would be needed.
  - The unplanned internal table `app.candidate_email_changes` is **accepted**: candidate id and change time only (no addresses), non-exposed schema, RLS on with no policies, no grants to any PostgREST role, 60-day retention (10-minute sweep and next change), all rows deleted on anonymisation. It is added to the Privacy Policy item on the launch checklist next to N1 fingerprints.
- **Why:**
  - BR-12 is evidence only. The edit route (change a real candidate's email to one's own mailbox) is the cheap, likely abuse, and it is now visible in disputes.
  - Extending to record creation now would reopen backend and QA on an S item for a domain question the strategist hasn't answered. Dropping BR-12 would discard tested evidence for nothing.
  - There was no record of when an email changed; this table is the minimum to make BR-12 true, and it holds no contact data.
- **Alternatives:** drop BR-12 (loses dispute evidence); also note record creation in the evidence now (premature without Q-1; the date is recoverable later); store old and new addresses (more personal data, rejected).
- **Links:** PD-040; brief BR-12, R-1, §9 Q-1; `backend.md` D-8, §7; `qa-report.md` BR-12 rows, m-1; roadmap N3, strategist questions, launch checklist (Legal).
- **Status:** decided (the N3 treatment waits on the strategist)

## PD-043: N9 follow-ups: R-2 count before the hosted push; O-1 into N3; O-3 as hygiene
- **Date:** 2026-11-15
- **Decision:**
  - **R-2 (push precondition):** immediately before `supabase db push` (only when the user asks), count confirmed candidate requests on the hosted DB with the query in `backend.md` §1. If 0 or all test data, push. If any are real: **Needs user decision** (recommendation: keep them and record them in the audit log as pre-N9, PD-039). On the launch checklist (Ops), next to N1's storage-trigger check.
  - **O-1 (pre-existing):** `record_candidate_request_delivery(p_ok = true)` lets any source-org member set the "sent" time without an email. Not fixed in N9. It becomes an **N3 prerequisite**: the RPC becomes server-only (revoked from `authenticated`, called from the service-role path where issuance runs), or delivery is recorded inside that path. Until then the dispute playbook treats "issued" as authoritative and "sent" as recruiter-influenced. Owner: backend-engineer → qa-engineer.
  - **O-3:** a candidate whose email was already null when anonymised keeps an earlier change row (dates only) until the 60-day sweep. Accepted. The trigger should also fire on `anonymized_at` (like `candidates_anonymized_fingerprints`), batched with the next migration that touches `candidates`. Engineering hygiene, not gating. Owner: backend-engineer.
- **Why:**
  - R-2: pre-N9 confirmations can't be proven genuine (QA reproduced a forged one surviving the migration, as designed). Pre-launch they should all be test data, but that must be checked, not assumed.
  - O-1 can't forge a confirmation (the token exists only in the email, and "issued" is server-set and in the evidence). It only misstates timing, which matters once evidence backs fee entitlement in N3. Fixing it inside N9 would reopen an accepted S item for no launch-time gain, since N3 is a launch gate anyway.
  - O-3 holds no contact data and is bounded at 60 days.
- **Alternatives:** fix O-1 now (re-QA of N9 for a timing-only issue); leave O-1 to after launch (rejected: N3 disputes would rely on recruiter-set times).
- **Links:** PD-037, PD-039, PD-041; `backend.md` §1 R-2, §7; `qa-report.md` O-1, O-3, R-2; roadmap N3, Engineering hygiene, launch checklist (Ops).
- **Status:** decided

## PD-044: N2 brief scope: Must / Should / Won't
- **Date:** 2026-11-15
- **Decision:** Write the N2 brief ([`job-terms-card/brief.md`](../specs/job-terms-card/brief.md)) on RD-022 to RD-028.
  - **Must:** the card (T1–T10), immutable terms versions, the partner-visibility gate (permanent only, complete card; existing jobs hidden until completed), the card shown before submission, the snapshot at commit (terms version, rule version, client key), the agreement from the snapshot, the window from the snapshot, the N1 look-back on the snapshot window, the snapshot-driven hire dialog, the computed partner share (RD-025 a), change handling (RD-024), the **concierge amendment** (admin RPC + minimal form), snapshot displays, en / fr-CA / pt-BR.
  - **Should:** the terms-worsening admin flag; the real client name required to open a job to external referrals (PD-023, pulled into the same gate if it fits); the below-band alert at hire (E-3); Brazil and retainer helper text.
  - **Won't:** guarantee-limited reversals and the replacement first right (X6, PD-007); in-product two-party amendments (Later, RD-024 signal); per-job share (L2); contract/temp splits; card free-text note; industry/size band on confidential cards; the CV-harvesting flag (with N4/X2); everything in RD-029/RD-030 (N3); X7; notification emails (N7).
  - **Fallback:** if backend's day-1 estimate puts the Must work above 12 days, Should 2 returns to N3 and Should 1 to a follow-up. The PM records the branch as an addendum here.
- **Why:**
  - The concierge amendment is Must: without it, A's consent to a lower fee can't be recorded, so the floor in RD-025 a would make every agreed discount look like a breach.
  - The worsening flag is Should: the snapshot already protects every submitted referral. The flag only watches B's behaviour towards future partners (same reasoning as N1's abuse flags, PD-012).
  - The client name shares the form and the gate, so building it here avoids a second pass. It's already scheduled for N3, so dropping it costs nothing.
  - Guarantee-limited reversals need the fall-off event, which can't happen before the first placements. N2 stores the snapshot guarantee X6 needs. Client refunds are admin-verified meanwhile.
- **Alternatives:** amendment Later (leaves consented discounts unrecordable); flag Must (adds admin UI for a signal with no action); X6's reversal limit in N2 (builds half of the fall-off flow).
- **Links:** RD-022 to RD-028, RD-020, RD-006; PD-007, PD-012, PD-023; brief §5, BR-34, BR-39 to BR-41.
- **Status:** decided (fallback branch recorded after the estimate)
- **Addendum 2026-11-15 (fallback triggered, see PD-050):** the backend estimate puts Must at 14.75 days (range 13–17), above the 12-day bar. Applied: Should 2 (client name) **returns to N3** as its prerequisite; Should 1 (worsening flag) **and** Should 3 (below-band alert) move to a follow-up, **N2.1**; Should 4 (helper text, no backend) stays. The remaining overrun is accepted with one trim and two-drop sequencing (PD-050).

## PD-045: N2 freeze contract: verified version at submit, N1 and N9 untouched
- **Date:** 2026-11-15
- **Decision:**
  - Both submit RPCs take the terms version id the submitter was shown. If it's not the job's current version, they return a new outcome `terms_changed` with no side effect other than an audit event.
  - The snapshot (terms version, commission rule version, client key) is written in the user-session submit RPC at commit. Resend and token issuance (N9) never re-snapshot.
  - The snapshot client key lives in a closed `app` table. N1's delivery-time key in `app.referral_presentations`, its deadlines and sticky stops are unchanged.
  - Ownership is set in `app.deliver_referral` (the only delivery path): delivery + snapshot window in calendar months (ET, clamped), or + 12 months without a snapshot. The column default and the hard-coded 12 months in `respond_candidate_request` go away. Stored dates are never recomputed.
  - The N1 look-back uses the claimed referral's snapshot window; legacy referrals keep 6 months.
  - Legacy referrals keep the current agreement, hire and ledger behaviour, labelled "terms not recorded".
- **Why:** RD-023 freezes "what A saw", and reading the job at commit time could store a version A never saw. A returned outcome follows N1's pattern (PD-016). One delivery chokepoint removes the duplicated 12-month logic across function versions.
- **Alternatives:** snapshot the current version silently (A could commit under terms it never saw); move N1's key snapshot to commit (changes accepted N1 behaviour; the divergence goes to the strategist as S-N2-3 instead).
- **Links:** RD-003, RD-023, RD-028; PD-009, PD-014, PD-016, PD-038; brief BR-11 to BR-20.
- **Status:** decided

## PD-046: Partner share floored at the frozen terms; platform basis is a frozen rule field
- **Date:** 2026-11-15
- **Decision:**
  - For a snapshot placement with computed fee C and invoiced fee I, each verified client payment P is allocated with k = P ÷ I: sourcing = sourcing_bps × max(C, I) × k; platform = platform_bps × P (`collected`) or × max(C, I) × k (`frozen`); job owner = the remainder, which can go negative only when B discounted without an amendment. When I ≥ C the split is exactly today's.
  - The platform basis is a new field on `commission_rules`, frozen into the snapshot and the agreement like the bps, so RD-025 (b) is a value, not a rebuild. Both values are built and tested. The seed uses the recommended `collected` until the user decides.
  - A's consent to a lower fee exists only as a concierge amendment before the hire. There's no consent checkbox at hire.
  - Collection shortfalls (non-payment, FX) are shared pro rata in N2 (S-N2-4 to the strategist).
- **Why:** RD-025 a. Max(C, I) treats the frozen terms as a floor (strategist to confirm, S-N2-1). A rule-level field matches how pricing is already versioned, and it can't change existing agreements.
- **Alternatives:** a global setting (would silently change existing agreements); a separate "A share due" table outside the ledger (two sources of truth).
- **Links:** RD-005, RD-008, RD-025; brief BR-27 to BR-30, U-1.
- **Status:** decided for the formula. **Needs user decision** for the platform-basis value (U-1, RD-025 b); N2 acceptance requires it.

## PD-047: `share_fee` retired on referral-open jobs; `share_salary` on by default when first opening to referrals
- **Date:** 2026-11-15
- **Decision:** The `share_fee` toggle leaves the form (the column stays, ignored for referral-open jobs). Basis and rate are always shown to partners. The money estimate on % bases is shown only when `share_salary` is on. `share_salary` defaults to on when a job is opened to referrals for the first time, as a visible toggle on the card. Existing jobs keep their value.
- **Why:** RD-022: terms can't be hidden. Rate + estimate reveals the salary, so the estimate follows `share_salary`. Compensation fit is the most common failure reason, and Ontario pay-range posting weakens confidentiality arguments. Not changing existing jobs avoids a silent disclosure change.
- **Alternatives:** keep `share_salary` off by default (more blind submissions); flip it on existing jobs (silent change of what B discloses).
- **Links:** RD-022; recruiting-input §2.3; brief BR-9, BR-10.
- **Status:** decided (reversible)

## PD-048: N2 in progress; RD-029 and RD-030 folded into N3
- **Date:** 2026-11-15
- **Decision:**
  - Roadmap N2 status → in progress (brief ready, design next).
  - N3 notes take RD-029 (candidate confirmations count; record-creation note in evidence; admin authorization challenge as N3 Must; void if invalid; Should: refuse destinations on the source org's own domain) and RD-030 (sourcing-side hire reports: eligible statuses including withdrawn, dated evidence and attestation, 10 business days to confirm or contest, deemed confirmed on silence with an auto-opened dispute, rate limit and rejected-report flag; Should: pause B's new partner jobs until fee details are recorded). Strategist questions Q-1 and S-1 are closed.
  - S-N2-3 (which client key governs ownership scope) is added to the N3 inputs.
- **Why:** The N3 brief now has all its strategist inputs except S-N2-3, which N2 will have answered by then.
- **Links:** RD-029, RD-030; PD-040, PD-042, PD-043; roadmap N2, N3.
- **Status:** decided

## PD-049: U-1 decided by the user: platform share on the fee actually collected
- **Date:** 2026-11-15
- **Decision:** The user chose **collected** for RD-025 (b). When the hiring side discounts the fee without the sourcing side's prior written consent, MissionHub's platform share is computed on the fee actually collected, not on the frozen terms. The `commission_rules` platform basis ships as `collected` (BR-28); `frozen` stays implemented and tested but unused.
- **Why:** MissionHub stays neutral and doesn't profit from a penalty between members (strategist and PM recommendation).
- **Links:** RD-025 (b); PD-046; N2 brief BR-27, BR-28, §8.4 U-1.
- **Status:** decided (user)

## PD-050: N2 over the 12-day bar: Shoulds out, accept ~14.25 days with trim (c), build in two internal drops
- **Date:** 2026-11-15
- **Decision:**
  - **Shoulds (PD-044 fallback):** S2 client-name gate → back to N3 as its prerequisite (unchanged there). S1 worsening flag (with RD-032's revised definition) and S3 below-band alert → **N2.1** follow-up, together with the admin N2 metrics panel (designer S11). S4 helper text stays (copy + frontend only, 0 backend days).
  - **Option: (a) + (c), delivered in the sequence of (b).**
    - **(c) taken:** the sent-referral list shows no money share, only basis and rate (or the flat amount). A's expected share is shown on the referral page and in the agreement dialog from the frozen estimate. Saves ~0.5 days. Must ≈ **14.25 days** (range ~12.5–16.5), accepted.
    - **(a) taken:** no Must is cut. Every Must closes one of the five trust breaks or protects one of them. The only candidate to cut, the concierge amendment, is what keeps the RD-025 floor from turning every agreed discount into a breach (PD-044).
    - **(b) as sequencing only:** the backend-engineer delivers in two drops, each with a `backend.md` contract version, so frontend and copy start on the card, gate and submit surfaces while hire, ledger, amendment and displays are built. Drop 1: M1–M7, M10, M13 and the matching parts of M14–M16. Drop 2: M8, M9, M11, M12 (trimmed). **The gap is closed, not just accepted:** in drop 1, the existing `report_hire` refuses any referral that has a snapshot (interim error `hire_terms_pending`, removed in drop 2), so no snapshot referral can ever be hired on free entry, even locally. There is **one** QA pass, **one** acceptance and no hosted push of drop 1 alone: N2 is pushed only complete, and only on the user's request.
- **Why:**
  - Nothing is in production and no real hires exist, so (b)'s gap is a local-branch state. The one-line refusal still removes it entirely, so BR-21 holds at every commit, and no QA time is spent on an intermediate state.
  - Accepting 2.25 days over the bar is cheaper than any trim that weakens a trust break. N2 is a launch gate, and the bar was a scope check, not a deadline.
  - Losing the money share on the sent list costs little: the referral page is one click away, and today's list figure is wrong anyway (live fee, current rule).
- **Alternatives:** (b) with the gap accepted (rejected: costs nothing to close); cut the concierge amendment (rejected, PD-044); keep S2 for 0.5 days (rejected: it adds a gate change and copy to an already-over scope, and N3 needs it anyway, so nothing is lost); cut the look-back (rejected: RD-028, 0.5 days, small).
- **Links:** PD-044 addendum; `backend-estimate.md` §0, §11; brief rev. 2 §5, §9.
- **Status:** decided

## PD-051: Answers to backend Q1–Q9 and designer Q-1–Q-12 (N2)
- **Date:** 2026-11-15
- **Decision:**
  - **Q1 / Q-1 (legacy referral pending on a card-less job): deliver.** For a referral **without** a snapshot, the candidate's confirmation delivers under today's check (active ∧ open to referrals ∧ org not suspended), without the version or permanent clauses. Snapshot referrals use the full BR-3 predicate at delivery. BR-7 wins for legacy referrals: the candidate already consented, and B's missing card isn't A's or the candidate's fault.
  - **Q2:** `ownership_protected_until` → NULL on undelivered rows at migration. Yes.
  - **Q3:** % bases accept any currency the money library supports, taken from the job's salary currency; flat bases use the five-currency list. A connector change of salary currency under a % card hides the job (`currency_mismatch`) until the owner republishes. Yes.
  - **Q4 / Q-4: freeze the estimate A saw.** `referrals.fee_estimate_minor` is written at commit **only when it was shown to A** (flat → the flat amount; % → the gated midpoint estimate, at least the minimum); otherwise NULL. Both sides read the frozen value. When it's NULL, both sides see "{rate} of the salary at hire". The live band and live `share_salary` are **never** used after commit (that would contradict BR-36 and let B move the number). Designer default overridden.
  - **Q-11 / band minimum in the snapshot: not now.** S3 moved to N2.1. When it's built, the band minimum frozen at commit goes in a **closed** `app` table, never on `referrals` (readable by A through RLS, so it would leak the salary when `share_salary` is off).
  - **Q5:** amendments on legacy referrals: refused. Yes.
  - **Q6:** `terms_changed` counts toward the 30/h submit limit. Yes.
  - **Q7:** I < C rounding: half-up per payment, job owner takes the remainder, at most 1 minor unit of drift per payment. Yes. Revisit with X1 if invoices need exact totals.
  - **Q8:** an amendment after acceptance repoints `collaboration_agreements.terms_version_id` while no placement exists. Yes.
  - **Q9 / Q-9:** flat fee → no base or bonus at hire. Yes.
  - **Q-2:** re-tick the T6 attestation on every save that **creates** a version; not on no-op saves. Yes.
  - **Q-3:** a draft with "Open to partners" on needs a complete card and permanent. Yes (BR-6 as written; the server's flag guard enforces it whatever the status).
  - **Q-5: one list of five reason codes**, the designer's: `client_discount`, `client_contract_rate`, `client_invoiced_other_currency` (RD-034), `invoice_correction`, `other` (note required). The backend's draft codes are replaced. `retainer_credited` and `base_differs` are rejected: RD-031 says I includes the retainer, and C is already computed on the reported base.
  - **Q-6:** new routes `/admin/referrals` and `/admin/referrals/[referralId]`. Amendments are allowed in **any status without a placement**, closed statuses included: a declined or withdrawn referral can still lead to a hire under N3 (RD-030), at its snapshot terms. BR-35 still applies.
  - **Q-7: partly.** The two counts that come free with the visibility predicate (partner-visible jobs, referral-open jobs hidden for missing terms) ship in N2 on the existing admin metrics (backend V7). The flag panel and the other two metrics (I ≠ C hires, amendments over 30 days) move to N2.1 with S1. Until then, Ops reads them with SQL.
  - **Q-8:** the N1 recipient pattern. `job.terms_changed`: once per source org, addressed to the distinct members of that org who submitted a live referral on the job, with a fallback to the org's admins if none is still a member. `placement.fee_difference`: the submitter of that referral, same fallback.
  - **Q-10:** the exact flat share, without "~", with the hint "Payable once the client's payment is verified." Yes.
  - **Q-12:** show the 5/10-business-day response line, marked ⚖️ draft like every network-rule line. N4 is a launch gate and no partner uses the product before launch, so no member sees the line before it's enforced. If launch order ever changes so N2 is live for members without N4, the line is hidden until N4 ships (frontend flag, PM call at that time). The wording must not use "release" and must not suggest the referral loses ownership (RD-007: released referrals keep it). ux-writer owns the wording.
  - **Currency codes:** every N2 money display shows the ISO code. `f.money` gains a code option (frontend). Accepted as a constraint.
- **Why:** each default protects a BR or trust as written, at no added scope. Q1 and Q4 are the two that change visible behaviour.
- **Links:** `backend-estimate.md` §10; `spec.md` §9; brief rev. 2 BR-1, BR-3, BR-7, BR-11, BR-19, BR-22, BR-23, BR-24, BR-34, BR-36.
- **Status:** decided

## PD-052: RD-031 to RD-035 folded into N2; E-19 gap goes to X6 / X1
- **Date:** 2026-11-15
- **Decision:**
  - **RD-031:** BR-27 confirmed as a floor. BR-23 states that I is this hire's placement fee, retainer included, and separate services excluded.
  - **RD-032:** BR-39 is rewritten with the extended list and "within 30 days after **any** delivered referral". It's built in N2.1 (PD-050).
  - **RD-033:** BR-15's note points to RD-033 (union of the commit and delivery keys for N3). No N2 change. Roadmap N3 inputs are complete.
  - **RD-034:** "Client invoiced in another currency" is an I ≠ C reason (BR-23). Collection shortfalls are shared pro rata in N2.
  - **RD-035:** amendments only before the hire (BR-34 confirmed).
  - **E-19 (post-hire credit note) is a known N2 gap:** B reports I = C, then credits its client, and the shortfall is shared pro rata like non-payment. In N2, A sees I and every payment and can open a dispute, but an upheld dispute can't adjust allocations (`resolve_dispute` only closes it). Backlog: a **"short-paid" marker** on placements and an **admin allocation adjustment on an upheld dispute** go to X6 (fall-off, the same reversal machinery), with X1 consuming them for invoice amounts. Until then the dispute playbook settles it off-ledger and records the outcome in the dispute.
- **Why:** strategist decisions; the only gap is post-hire and can't occur before the first placements, which come after launch.
- **Links:** RD-031 to RD-035; recruiting-input §12; brief rev. 2 BR-15, BR-23, BR-27, BR-39, R-11; roadmap X6, X1.
- **Status:** decided

## PD-053: Network rules and governance, founder decisions on the Top Echelon analysis
- **Date:** 2026-11-15
- **Decision:** the founder answered the seven open questions in `docs/research/top-echelon-policies-analysis.md` §6.1:
  1. **Non-circumvention (P1-3): rejected.** MissionHub does **not** charge its fee on splits that two orgs close off-platform after meeting through a referral. No pre-existing-partner declaration is built. Retention relies on product value (matching, frozen terms, evidence, payout tracking). P1-3 is removed from the plan; the "pairs that stop after one placement" signal (RD-008) is still tracked as a metric only.
  2. **MissionHub's role in disputes (P0-5): platform effects only.** The admin decides in-platform effects (statuses, holds, sanctions, reputation) and provides records as evidence. Money disputes go negotiation → mediation → external commercial arbitration. Institution, seat (Toronto or Montréal), governing law, language and costs are still open, for the lawyer to propose.
  3. **Sanctions (P0-3): 4-level ladder approved.** Warning → partial network hold (no new partner activity; in-flight referrals continue) → suspension → termination. Immediate hold without prior notice only for data leaks and evidence or confirmation fraud; every other step gives notice and a response window.
  4. **Notice for material rule changes (P0-2): 30 days**, with re-acceptance of the new version.
  5. **Client non-solicitation (P0-6): during the process only in v1.** Network Rules v1 forbid contacting the partner's client while a referral is in flight. Any post-process non-solicit waits for the competition-law opinion (Competition Act s.45).
  6. **Expiry of the job owner's access to the shared snapshot (P1-4): approved**, built after N3. Durations come from the strategist (S-TE-2) and retention review (Law 25 / PIPEDA PIA).
  7. **Network Rules text (P0-1):** recruitment-strategist drafts the domain content, ux-writer-marketing produces en / fr-CA / pt-BR (French offered first in Québec), then founder and lawyer approve.
- **Why:** keep MissionHub positioned as software and record (RD-010) rather than an arbiter or agency; prefer proportionate, access-based sanctions because no funds pass through the platform; avoid a non-circumvention clause that would slow founding-group adoption.
- **Alternatives:** non-circumvention for 12 months with exemption for declared partners (rejected by founder); MissionHub as binding arbiter like Top Echelon (rejected); suspension-only sanctions (rejected).
- **Links:** `docs/research/top-echelon-policies-analysis.md` §5, §6; RD-003, RD-008, RD-010.
- **Status:** decided

## PD-054: Network Rules 3.3, the client-contact rule lasts through the guarantee and final payout
- **Date:** 2026-11-15
- **Decision:** Rule 3.3 (the sourcing recruiter never contacts the hiring recruiter's client about the job, candidate, interviews, offer, fee or payment) applies while the referral is in progress and, if there is a hire, until the guarantee ends and the final payout is made. Text updated in `docs/content/network-rules/{en,fr-CA,pt-BR}.md`.
- **Why:** the placement, guarantee and payout are part of the same transaction; a rule ending at hire would let the sourcing side chase late payment directly with the client (RD-039 rationale). This is a channel rule, not a non-solicit, so it is consistent with PD-053.5 (non-solicitation during the process only).
- **Alternatives:** end at hire or closure (rejected: needs a separate late-payment rule and invites client contact during the guarantee).
- **Links:** PD-053, RD-039; `docs/strategy/network-rules-v1.md` rule 3.3.
- **Status:** decided

## PD-055: Roadmap updated with the Top Echelon analysis outcomes (N10, legal gate, Next items)
- **Date:** 2026-11-15
- **Decision:** the founder approved applying the analysis (§5, §6.4) to the roadmap, within PD-053 and PD-054:
  1. **New Now item N10 "Network Rules: acceptance, conduct reports and network hold"** = P0-2 (versioned acceptance per org and per user, 30-day notice and re-acceptance, effective-date gate on new partner activity, rule 10.3) + P0-3 (`conduct` dispute type, 4-level ladder, partial network hold, immediate hold only for data leaks and evidence or confirmation fraud with notice within 1 business day, one review by a second admin, rule 9.6). N10 also owns the **suspension gap**: today `organizations.suspended_at` makes every workspace route not-found (`src/server/auth/context.ts`), so a suspended org can't settle obligations (rule 9.5). N10 adds a "suspended but can settle obligations" mode or, as a documented fallback, a written admin procedure; **PM recommendation: the settlement mode**. Depends on N5 (shared onboarding surface). Team plan per §6.4. Launch gate.
  2. **Legal launch gate** gains P0-1 Network Rules v1 text approval (founder + counsel), P0-5 dispute clause (negotiation → mediation → arbitration, counsel placeholders), P0-6 competition-law opinion (gates rules 3.4–3.6 wording and any post-process non-solicit; v1 during-process only), and French first in Québec. Added to N7's scope.
  3. **P0-4** purpose notice on received referrals and document downloads → N6a.
  4. **Next:** X8 org blocking (P1-1); X9 payout deadline reminders and late flag (P1-2, built with N4 or X2); X10 "spoke with the candidate" attestation by rewording `confirmInterest` plus a new decline reason (P1-6, RD-041); X11 shared-profile access expiry per RD-038, after N3 (P1-4); job freshness (30 days, pause at day 37, "Job filled" prompt) folded into X5 (P1-5, RD-042).
  5. **P1-3 non-circumvention removed** (PD-053.1) and listed under "Not doing"; the RD-008 "pairs that stop after one placement" signal stays as a watch metric only.
  6. **Rules promises as acceptance conditions:** 9.1, 9.5, 10.1–10.3 (plus 9.4, 9.6, 8.1) are N10 acceptance conditions; 4.5 (N3 client-name prerequisite), 6.6 (X9, or the sentence marked "ships with X9", PM recommendation: the marker) and 8.4 (staffing) are launch-checklist items. No rule sentence is published unless the product does it.
- **Why:** N10 is what makes the rules binding and enforceable, and it closes a real trust gap (full suspension hurts innocent partners and blocks settlement). It's sequenced after N5 because acceptance lives in the application. The P1 items are cheap and improve network health, but none is a precondition for a first trustworthy split, so they wait for the founding group. Keeping X9 in Next and marking 6.6's sentence avoids growing the launch scope for a promise we can simply not make yet.
- **Alternatives:** P0-2 inside N5 (rejected: N5 is already M, and hold and conduct reports share the acceptance gate's "no new partner activity" mechanism, so they belong together); pulling X9 into launch (possible, founder's call; it's S and fits N4); P1-3 in X1/X7 as the analysis proposed (rejected by PD-053.1); a written admin procedure as the default for suspended orgs (fallback only: it puts admins in members' money records).
- **Links:** `docs/research/top-echelon-policies-analysis.md` §5, §6.4; PD-053, PD-054; RD-037 to RD-043; `docs/strategy/network-rules-v1.md`; `docs/content/network-rules/README.md`; roadmap N6a, N7, N10, X5, X8–X11, launch checklist.
- **Status:** decided (settlement mode vs admin procedure is finalized in the N10 brief with the backend estimate; publishing 6.6 at launch is the founder's call)

## PD-056: N10 brief accepted at user checkpoint; PM decisions N10-D1 to N10-D12 and user defaults
- **Date:** 2026-11-15
- **Decision:** The founder accepted the N10 brief (`docs/specs/network-rules-enforcement/brief.md`) and its recommendations:
  - PM decisions N10-D1 to N10-D12 (brief §9.1) are adopted as written.
  - **U-N10-1:** no public logged-out rules page at launch; signed-in members and N5 applicants only. Revisit after P0-1 approval.
  - **U-N10-2:** settlement mode (a) is the plan, final after the EC-1 backend estimate (bar ≤ 4 engineering days). Fallback (b) only with a new founder approval of the rewritten rule 9.5.
  - **U-N10-3:** no emergency lock outside the ladder in v1; membership deactivation covers compromised accounts. Counsel asked whether 9.4 needs a legal/security-necessity carve-out.
  - **U-N10-4:** optional ~150-word non-binding rules summary on the acceptance screen: yes, if counsel confirms it can't be read as changing the rules.
  - **U-N10-5:** no automatic purge of conduct cases, files, notices and sanctions in v1; counsel sets retention in the N7 PIA.
- **Next:** in parallel, backend-engineer day-1 estimate (EC-1/2/3/8), product-designer spec, recruitment-strategist `recruiting-input.md` (S-N10-1..6, non-blocking). Build waits for the estimate decision and the N5 spec.
- **Links:** PD-053, PD-054, PD-055; brief §9.1, §9.3.
- **Status:** decided

## PD-057: RD-048 approved, settled terminated orgs show "no longer part of"
- **Date:** 2026-11-15
- **Decision:** The founder approved RD-048. While a terminated org is still settling, partners see the same neutral sentence as every other restriction ("{Org} isn't taking new referrals right now."). Once settlement ends, former partners see "{Org} is no longer part of the MissionHub network." The same sentence covers voluntary exits, so it never reveals a sanction. Spec AC-136 is in scope; QA scenario 13 becomes "identical in every state except terminated or exited after settlement". Counsel still checks the wording (⚖️).
- **Why:** after settlement there is nothing left to protect by staying silent, and partners need to know the org is gone; using one sentence for terminations and voluntary exits keeps sanctions private.
- **Alternatives:** neutral sentence in every state (rejected).
- **Links:** RD-048; `docs/specs/network-rules-enforcement/spec.md` AC-136; brief BR-14.
- **Status:** decided

## PD-058: N10 open questions resolved; brief rev. 2, spec ready to freeze
- **Date:** 2026-11-16
- **Decision:** every open PM question on N10 is answered and folded into `docs/specs/network-rules-enforcement/brief.md` rev. 2 (§9.0, N10-D13 to N10-D38).
  - **Backend estimate §7:**
    1. Q1 (N10-D13): first-access gate **enforced in the DB for every authenticated write** (actions, writing RPCs, client-writable table policies, storage inserts), with a closed exempt list (accept, `create_organization`, `accept_invitation`, sign-out / org switch, own notifications read, platform-admin RPCs, candidate-token and worker paths).
    2. Q2 (N10-D14): conduct cases live **only in closed `app.conduct_*` tables, no `public.disputes` row**; shown in `/admin/disputes` via an admin list RPC. BR-18 reworded, EC-3 updated.
    3. Q3 (N10-D31): settlement mode shows **in-flight referrals and open obligations only**, no closed history. Book-keeping records via support.
    4. Q4 (N10-D33): **a settled placement still in guarantee is an open obligation.** Full definition in BR-37.
    5. Q5 (N10-D17): the **first-access gate applies in settlement mode**; accepting is available there (only re-acceptance is waived).
    6. Q6 (N10-D15): **drop `set_organization_suspension`** entirely; no service-role operator tool (it would be the emergency lock U-N10-3 ruled out).
    7. Q7 (N10-D16): immediate hold **refused** (`org_already_restricted`) on an org with an active hold, a suspension or a termination; allowed on `rules_not_accepted` / `network_pending`.
    - Settlement mode (a) **in full** is final (3.75 d, under the 4-day bar); fallback (b) dropped, U-N10-2 closed.
  - **Designer Q-D1 to Q-D17:**
    - Q-D1 (D18): an `org_admin` whose org hasn't accepted must tick **both** statements (two unticked checkboxes); personal only in settlement mode. Counsel C-1 confirms.
    - Q-D2 (D21): a notice cites the **version in force on the alleged conduct date** (admin can pick another version in force during the period; the org's acceptance of it is shown); one version per notice; the decision cites only that notice's rules. BR-21 corrected.
    - Q-D3 (D19): onboarding uses UI locale `fr` → fr-CA first; N5 province later.
    - Q-D4 (D20): per-user restriction refuses only the transition to open (or creating an open job), code `rules_acceptance_required`; edits to open jobs allowed.
    - Q-D5 (D24): "no level" refused **in the DB** when the org has a non-overturned sanction or breach finding in 12 months; "minor" is admin judgement.
    - Q-D6 (D23): **changed from the spec default:** the reporting user **and the reporting org's `org_admin`s** read a report; access follows membership of the reporting org.
    - Q-D7 (D22): no report on internal referrals. Q-D8 (D35): no download of own files. Q-D10 (D32): no pipeline board in settlement mode.
    - Q-D11 (D25): the reported org sees the residual-test flag. Q-D12 (D27): a no-level finding is reviewable.
    - Q-D13 (D28): **neither** the reviewing nor the deciding admin is named to the org.
    - Q-D14 (D29): **changed from the spec default:** a termination can be lifted outside a review, only to correct an error, by an admin other than the decider, with a reason.
    - Q-D15 (D30): legacy suspensions show as "Suspended (before N10)" with Lift only, get settlement mode, no fabricated record.
    - Q-D16 (D36): frontend picks the Markdown renderer: raw HTML off, `https:` / `mailto:` links only, `rel="noopener noreferrer"`.
    - Q-D17 (D26): incident notice to recipient orgs' `org_admin`s only.
  - **Strategist updates (N10-D37, D38):** BR-17 = RD-044's 9 context-filtered categories, admin-only "possible 9.4", admin category at triage; BR-23 = RD-045's four outcomes, the "doesn't change your referral" line, review-driven updates, and the 2.3 incident notice; BR-21 / BR-28 = RD-049's fixed possible-outcomes line and notice-bound rule picker (N10-D8 amended); BR-37 = RD-047's admin close of stale referrals (60 days [estimate], terminated orgs only); BR-14 and QA scenario 13 = RD-048 (PD-057); R-5 corrected (no ladder level cuts received-profile access; containment is at the 2.3 finding); overdue immediate-hold flag is a Should; "pause received shared profiles" on a 2.3 finding goes to the X11 backlog. Counsel C-3 and C-4 gain the strategist's questions; new C-7 for the "no longer part of" wording. QA scenarios 35–41 added.
- **Spec changes for product-designer** (then mark `spec.md` frozen):
  1. Header and §0 notes: storage decided (`app.conduct_*` only), settlement scope decided, RD-048 approved; drop "pending" wording and the fallback (b) line.
  2. AC-136 and the RD-048 traceability row: remove "pending founder"; §9 "For the user" block: answered.
  3. §2.9 / §2.8 / S-screens and ACs: reporting-org `org_admin`s can read their org's reports (a list on the Reports page or Network standing, designer's call); access follows membership; outcome notification falls back to `org_admin`s when the reporter has left (Q-D6).
  4. §2.12 notice composer: version selector defaulting to the version in force on the conduct date, a conduct-date field prefilled from the report, and the org's acceptance state of the chosen version (info); AC-134 adds "from that notice's version" (Q-D2).
  5. Decision form and AC for "no level": disabled in the UI and refused by the RPC under the 12-month rule; error key needed (Q-D5).
  6. §2.13 admin org page: **Lift termination…** (reason required, hidden for the deciding admin, refused for them by direct call); legacy-suspension row as specified (Q-D14, Q-D15).
  7. §2.11 / §5.7: the deciding admin isn't named either ("a MissionHub platform admin") (Q-D13).
  8. §2.12 immediate hold: hidden and refused (`org_already_restricted`) on held, suspended or terminated orgs; available on `rules_not_accepted` (Q7). Add an AC.
  9. §2.10 settlement mode: confirmation state when an action closes a referral and it leaves the list; settlement first-access gate with the personal statement only; deactivation of self or last `org_admin` refused (already AC-104).
  10. §2.13 / AC-135: stale close counts a settled-in-guarantee placement as an obligation (BR-37 definition) in the remaining-obligations list.
  11. §2.2: the exempt list from BR-7 (for the "what still works" copy); `accept_invitation` before the gate.
  12. §9: replace every PM question and default with "decided (PD-058)"; Q-D6 and Q-D14 defaults change as above; AC-140 stays Should.
  13. Traceability: map QA 35–41 to ACs (most exist: AC-126–129, 133, 134, 130–132, 135; new ACs for item 8 and the termination lift; QA 41 to AC-19 plus a DB-write AC).
  14. ux-writer impact (for §5): reporting-org admin report list, Lift termination dialog, `org_already_restricted`, "no level not allowed" error, settlement "referral closed" confirmation, version selector labels.
- **Why:** security and trust as hard constraints (full DB gate, isolation by construction, no operator back door); fairness for the reported org (rules in force at the time, stakes stated, reasons visible, errors correctable with four eyes); minimization in settlement mode; strategist decisions adopted where they are domain calls.
- **Alternatives:** gate in actions plus partner RPCs only (−0.75 d, rejected: leaves a write residual); conduct as a `public.disputes` row (rejected: 12 sites to patch and a permanent N3 trap); keeping `set_organization_suspension` for operators (rejected: emergency lock outside the ladder); stacking immediate holds (rejected: no added effect, confusing record); reporter-only reading (rejected: report orphaned when the reporter leaves, and the org answers for bad-faith reports); termination changeable only by review (rejected: no audited way to fix a later-found error).
- **Not escalated:** nothing in rev. 2 is pricing, public text beyond what PD-057 approved, or irreversible. Counsel items (C-1, C-3, C-4, C-7) ship as drafts. Optional, under P0-1: the ux-writer may propose rule 9.6 "a sanction or a breach finding".
- **Effort:** backend scope delta about +1.25 d (designer's +1 d for RD-044–049 plus small items), total about 16.5 d, inside 14–18 d; backend re-estimates at build start.
- **Links:** brief rev. 2 §9.0; `backend-estimate.md` §7; `spec.md` §9; `recruiting-input.md`; RD-044 to RD-049; PD-056, PD-057; roadmap N10, X11.
- **Status:** decided

## PD-059: N2 accepted; effort overrun accepted, estimates gain a money-bounds line and a fix-loop buffer
- **Date:** 2026-11-16
- **Decision:**
  - N2 (job terms card) is **accepted** against brief rev. 2.
    - QA's final verdict is PASS after fix round 3: 71 active ACs, BR-1 to BR-38 and 19 scenarios pass.
    - QA-N2-02 to 09 and QA-PRE-01/03/04 are fixed and verified. Design B-1 to B-4 and copy B1 are fixed.
    - N1 and N9 don't regress, and record scope holds.
    - The main session confirmed lint, typecheck, 234 unit tests and the N2/N9/record-scope integration suites (134).
  - One DoD item is open and **docs only**: `domain-model.md` and `security-and-privacy.md` (F-0, backend-engineer, before the N3 backend handoff and any hosted push). The PM updated `product-flows.md`.
  - The launch-checklist line is ticked.
  - **Effort:** about 16.5 backend days against ~14.25 accepted. That's the top of the accepted range (12.5–16.5), and it's **accepted**.
    - The build fit the estimate. The overrun is the review loop, which found a cross-tenant availability bug (QA-N2-07), all submissions failing on a zero band (QA-N2-09), a hire recorded at an unseen fee after an amendment (P16), and pre-existing matching at scale (QA-PRE-01), which N2 depends on.
  - **From now on, backend estimates for money features carry two explicit lines:**
    - money-input bounds: every money input bounded at the RPC and the table, and estimates failing closed per row;
    - a fix-loop buffer of about 15%.
    These apply to N3, N10's build re-estimate and N2.1. `backend.md` includes the bounds checklist.
- **Why:**
  - Security, isolation and money correctness are hard constraints. Every overrun day bought one of them.
  - R-13's end-of-drop-1 checkpoint wouldn't have caught it, because the overrun came after the build. The estimate should price the loop instead.
- **Alternatives:** hold acceptance for the docs (rejected: no product risk, and it would delay the N3 brief); count QA-PRE-01 as out-of-N2 effort (it is, but N2 couldn't ship usefully without it).
- **Links:** `job-terms-card/acceptance.md`; `qa-report.md` §8–§10; PD-050; brief R-13; roadmap N2, launch checklist.
- **Status:** decided

## PD-060: Amendment-aware hire and share accepted as tightening BR-36
- **Date:** 2026-11-16
- **Decision:**
  - `report_hire(p_terms_version)` refuses a hire posted against terms that are no longer effective (`hire_terms_changed`), and the dialog keeps the typed values and refreshes (copy-review P16).
  - The expected share is null (it shows "{rate} of the salary at hire" or the flat share) when an amendment changes the fee (QA-N2-05).
  - Both are accepted as part of BR-36 / BR-21: what a user confirms is always what gets recorded.
- **Why:** without them, a dialog opened before an amendment could record a fee the user never saw. That's the exact trust break N2 exists to close.
- **Links:** `copy-review.md` P16; `qa-report.md` §8.1; `backend.md` §7.1.
- **Status:** decided

## PD-061: N2 design polish triage
- **Date:** 2026-11-16
- **Decision:**
  - **P-16 accepted as built:** the owner's estimate box on the job page shows the fee only. B's split is on the referral and placement pages. Closed.
  - **P-4, P-8, P-11, P-14, P-17 and copy P8, P9, P14 → N2.1** polish batch. P-4 needs a ux-writer key first.
  - **P-21 (40px inputs) → Engineering hygiene**, a design-system item.
  - **P-20 → F-1, before launch** (PD-062).
- **Why:**
  - None of these is a blocker. Each is an edge case (P-8, P-11, P-14), an AA refinement on a page with few users before launch (P-17), or admin-only copy.
  - P-20 is the exception because it can store an amount at the wrong scale.
- **Links:** `design-review.md`; `copy-review.md`; `frontend.md` fix round; acceptance §3.2.
- **Status:** decided

## PD-062: Q-R1, a flat → % amendment takes the job's current salary currency
- **Date:** 2026-11-16
- **Decision:**
  - When a concierge amendment switches a referral's basis from flat to %, the % terms use the **job's current salary currency**. This is what `admin_amend_referral_terms` already does.
  - % → % amendments keep the effective terms' currency (unchanged).
  - **F-1 (before launch, ~0.5 d):**
    - backend returns the job's salary currency from `admin_get_referral_terms` and refuses a flat → % amendment when the job has none (`terms_incomplete`);
    - frontend uses that currency to label, parse and post amounts, and in the confirmation diff when the chosen basis is % and the effective basis is flat;
    - QA re-runs AC-58 and AC-60 plus the new case.
- **Why:**
  - BR-1 T4: a % fee is computed on the salary, and the base B reports at hire is in the salary currency.
  - The flat currency was an invoicing choice with no link to salary, and a flat referral has no earlier % currency.
  - Both orgs requested the amendment in writing, and the admin sees the currency before confirming.
  - Today's form uses the flat currency, so it can show the wrong code and parse a minimum at the wrong scale. Fix it before amendments start, with the founding group.
- **Alternatives:** the referral's flat currency (rejected: a % of a salary paid in another currency would need FX, and N2 has no FX); refusing flat → % amendments (rejected: legitimate restructurings need it, and the concierge path is the only consented route).
- **Not escalated:** domain-light and consistent with BR-1. No strategist question needed.
- **Links:** `design-review.md` P-20 / Q-R1; `20261116000600_terms_fee_bounds.sql:216–219`; brief BR-1, BR-34; acceptance §3.3.
- **Status:** decided

## PD-063: N2 known items: UI-only ACs, QA-PRE-02, AC-66 test budget
- **Date:** 2026-11-16
- **Decision:**
  - **UI-only ACs not re-run by QA** (qa-report §4.1, §7): accepted for N2. Before launch, qa-engineer runs them in a browser together with N1's AC-61/62 pass (F-2): en/fr/pt, 375px, dark mode, and the **legacy variants** seeded by fixture (they were never rendered). A blocker there reopens N2 for that screen.
  - **QA-PRE-02** (`get_opportunities` capped at 1,000 with no pagination, now shown as "1,000 new"): pre-existing. Engineering hygiene, **before launch**: backend adds a page/limit and an exact count, then frontend adds a paged list or "1,000+". A member is never shown a silently truncated count.
  - **N1 AC-66 30 s budget:** test infrastructure on long-lived stacks. qa-engineer fixes it before launch (drain only the test's own jobs, or document a reset). The timeout isn't widened blindly.
- **Why:**
  - All three are covered at the server layer, or can't occur at founding-group scale.
  - The legacy variants and the wrong count are the parts members could actually see, so they're scheduled before launch, not "later".
- **Links:** `qa-report.md` §4.1, §5, §6.1, §7, §10.3; acceptance §3.4–§3.6; roadmap Engineering hygiene, launch checklist.
- **Status:** decided

## PD-064: N2 hosted push conditions and the record-scope coordination rule; N2.1 scope; next step N3
- **Date:** 2026-11-16
- **Decision:**
  - **Push:** N1, N9 and N2 are pushed **together**, only on the user's request. The launch checklist (Ops) adds:
    - the existing N1 storage-trigger check and N9 R-2 count;
    - the N2 counts (referral-open jobs, undelivered pre-N2 referrals) plus the submissions-per-job baseline;
    - `payment_evidence` amounts ≤ 10^12 (otherwise `20261116000700` aborts) and `job_terms_versions` absent or empty (the `0600` bound check);
    - the record-scope md5;
    - F-0 done;
    - post-push checks.
  - **Record-scope coordination:** `20261115000300_recruiter_record_scope.sql` (another session's file) is never edited again. Changes to the 8 functions N2 copies go in a new migration after `20261116000700`, starting from the N2 body, and QA re-runs `recruiter-record-scope.test.ts` and the N2 suites. The md5 `dcd272097bdb90c8311662bf3752e01e` is checked before every hosted push. On the roadmap (N2 notes, Engineering hygiene) and the launch checklist. The user is asked to tell the other session.
  - **N2.1:** BR-39, BR-41, the metrics panel and the N2 polish batch (PD-061). Not a launch gate; after N3's build starts.
  - **S2 (client-name gate)** stays the N3 prerequisite.
  - **Next step: the N3 brief.**
- **Why:**
  - N2's copied function bodies depend on N1's and N9's. Pushing them separately could leave the hosted DB on mixed definitions.
  - Postgres keeps the last definition, so an edit to the earlier file would silently disappear.
  - N3 is the next launch gate, it makes N2's stored window enforceable, and all its inputs are decided.
- **Alternatives:** fold the record-scope edits into N2's files (rejected: not our session's file; copies plus a rule are safer); start N2.1 first (rejected: not a launch gate).
- **Links:** acceptance §4, §5, §8; `backend.md` §8 item 5; `qa-report.md` §2; PD-043; roadmap N2, N2.1, N3, launch checklist.
- **Status:** decided

## PD-065: RD-048 en wording, "no longer part of"
- **Date:** 2026-11-16
- **Decision:** `network.partner.noLongerMember` in en reads "{org} is no longer part of the MissionHub network." This amends the en text approved in PD-057 ("…is no longer a member of…"). fr and pt are unchanged. The key name stays as is.
- **Why:** the glossary keeps "member" for people (voice-and-tone §5.1). The new text also matches fr/pt.
- **Alternatives:** "is no longer a member of" (rejected: breaks the glossary).
- **Links:** PD-057; RD-048; `docs/specs/network-rules-enforcement/spec.md` §2.7, §5 (`network.partner.noLongerMember`), AC-136; counsel C-7.
- **Status:** decided

## PD-066: N3 scope and prerequisite sequence; silence is data-gated on N7
- **Date:** 2026-11-16
- **Decision:**
  - N3 brief rev. 1 (`docs/specs/referral-claims-two-sided-hire/brief.md`): 44 BRs, Must 0–10, three Shoulds (offer nudge, confirmation-destination refusal, admin-only employer signal).
  - **Prerequisites are built first, inside N3 (drop 1):** S2 client-name gate (BR-1, RD-020) and O-1 server-only delivery recording (BR-2, PD-043). N2 F-0 docs are closed by backend before the N3 handoff. S2 isn't a separate item any more.
  - **N7 is not an N3 build prerequisite.** Deemed confirmation on silence (BR-29) is built but reads per-recipient email delivery records that only N7 writes. Until N7 ships, the condition can't be met, so **every unanswered report goes to the admin queue** as "unanswered, notice not delivered". No feature flag: the data is the gate. The admin decides on the record or restarts the answer clock once.
  - Rule 6.4 consequences (late records, overdue fee details) are admin tasks in N3; the ladder is N10. RD-030's "pause B's new partner jobs" Should is dropped (RD-053).
  - Pre-N10, a suspended party can't act; its pending report goes to the admin queue at the deadline and is never deemed (BR-44). N10 settlement mode already lists N3 hire reports (N10 BR-13).
  - PM defaults: B sees evidence types, dates and hashes, but **files and URLs are admin-only**; A sees the contest reason (as "not this client" for that reason); one generic refusal code for filing, except the rate limit and an existing placement; record duty is a `late` marker, not a block (the server can't know when B learned); referral moves to `hired` from any status with history kept.
- **Why:** prerequisites are small and N3 can't be trusted without them (a blank client name is a split-free backdoor; "sent" evidence becomes fee evidence). Waiting for N7 to start N3 would idle the critical path; the data gate makes "silence never wins without delivered email" true at every commit.
- **Alternatives:** ship S2 and O-1 as separate items before N3 (rejected: extra QA and acceptance cycles for ~1.5 days); a feature flag for deemed confirmation (rejected: a flag can be turned on without email; the data condition can't); block late records (rejected: the server doesn't know when B learned).
- **Links:** RD-050 to RD-055, RD-029, RD-030; PD-023, PD-043, PD-050; brief §5, BR-1, BR-2, BR-29, BR-44.
- **Status:** decided

## PD-067: N3 counsel gating: deemed agreement behind a server flag; Q-2 to Q-4 as launch-gated drafts
- **Date:** 2026-11-16
- **Decision:**
  - **Q-1 ⚖️:** placements on referrals with no confirmed agreement (BR-9, BR-10) are built and tested behind `deemed_agreement_enabled`, a closed server-side setting (not member- or org-writable, audited). On in local and test, **off in production** until counsel answers Q-1 yes **and** N10 rules acceptance is live. Flag off: the hire is stored as a record-only hire (the released-referral path), A's recourse is rule 7.5, and rule 6.3 says so.
  - **Q-2 ⚖️:** the filing tail (BR-6) ships with 6 / +3 months as single constants; launch-gated on the rule 6.3 text (P0-1).
  - **Q-3 ⚖️:** "client and its affiliates, agents, EOR, payroll provider" and the `non_permanent_engagement` reason ship as drafts (BR-15, BR-25); launch-gated on P0-1.
  - **Q-4 ⚖️:** evidence about the new employer and admin candidate contact ship (BR-18, BR-28, BR-43) with no automatic purge; launch-gated on the N7 PIA and the Privacy Policy line.
  - All four go on the N7 counsel list. Approval of this posture is a user checkpoint item (U-N3-2).
- **Why:** the fallback (record-only) is already needed for released referrals, so the flag costs little and keeps both counsel outcomes shippable without a rebuild. The other three are wording or retention questions that don't change the build.
- **Alternatives:** wait for counsel before building BR-9 (rejected: idles the build, and the record-only fallback is needed anyway); ship BR-9 unflagged and rely on the launch gate (rejected: no clean fallback if counsel says no).
- **Links:** recruiting-input §11; RD-051, RD-052, RD-055; brief §5, §8.3, BR-9.
- **Status:** decided (posture subject to user approval, U-N3-2)

## PD-068: Filing between window + 6 and + 9 months requires a process-start statement
- **Date:** 2026-11-16
- **Decision:** RD-052 extends the filing tail to 9 months when the re-engagement tail applies, but the server can't know that at filing. A may file until window end + 6 months freely; from + 6 to + 9 months only with a statement that the client's selection process started inside the window, backed by a dated evidence item; the admin checks it on contest. Refused after + 9 months.
- **Why:** keeps the server objective (refuses only on the tail and eligibility, recruiting-input §7.3) while making the 9-month limit reachable only for the case RD-052 created it for.
- **Alternatives:** a flat 9-month tail (rejected: silently extends RD-030's 6 months for every case); 6 months only (rejected: contradicts RD-052).
- **Links:** RD-030, RD-052; brief BR-6.
- **Status:** decided

## PD-069: N3 estimate, bar and cut list; effort M → L
- **Date:** 2026-11-16
- **Decision:**
  - PM estimate: backend 17.75 days including the **money-bounds line** (0.5), plus the **15% fix-loop buffer** (2.65) ≈ **20.4 days** (range ~18–23). Frontend ~11, designer 3.5, ux-writer 3.5, QA ~5, PM 1. Roadmap effort **L**.
  - **Bar:** the backend's day-1 estimate (`backend-estimate.md`) ≤ 18 days before buffer. Over it, cut in this order: (1) the three Shoulds; (2) "restart the answer clock once" → admin decides on the record only; (3) HA-1 and HA-9 flags → Ops SQL until the N2.1 metrics panel; (4) the sister-org tick → admin note on the record.
  - **Never cut:** prerequisites (BR-1, BR-2), generic refusal and rate limits, files admin-only, the per-client release block, the deemed-confirmation data gate, fee-pending with no invented fee, RD-029 void, money bounds.
  - Two internal backend drops (drop 1: prerequisites, B's record path, fee-pending, release and ownership line; drop 2: hire reports, answers, admin, RD-029, flags), **one** QA pass, one acceptance, no hosted push of drop 1.
- **Why:** PD-059 asks every money feature to price the review loop. N3 has more surfaces than N2, which ran to ~16.5 days. The cut list protects trust rules and trims admin convenience first.
- **Alternatives:** split N3 into two roadmap items (rejected: both paths are needed for the launch promise, and one acceptance avoids two regression cycles); move RD-029 to a follow-up (rejected: void interacts with hire disputes, HE-12, and PD-048 made it an N3 Must).
- **Links:** PD-050, PD-059; brief §9.1; roadmap N3.
- **Status:** decided (acceptance of the estimate is a user checkpoint item, U-N3-3)

## PD-070: N7 gains hire-report emails with per-recipient delivery and bounce records
- **Date:** 2026-11-16
- **Decision:** N7's notification-email pass must, for N3: email the hire-report notice to the job owner and every org admin and manager of B, and the reminders and outcomes; **record each email per recipient as delivered or bounced** (needs bounce events from the N8 provider) in the store N3's BR-29 reads. The hire-report-filed email is required before launch, like the claim-filed email (PD-030). Backend's `backend-estimate.md` defines the data contract in N3; N7 fills it.
- **Why:** deemed confirmation must never run on a notice B didn't receive (RD-053). Without bounce records it can't run at all, and every unanswered report loads the admin queue.
- **Alternatives:** treat "sent" as delivered (rejected: RD-053 requires no bounce).
- **Links:** RD-053; PD-030, PD-066; roadmap N7, N8; brief BR-29, R-6.
- **Status:** decided

## PD-071: N3 brief approved at user checkpoint (U-N3-1 to U-N3-3)
- **Date:** 2026-11-16
- **Decision:** The user approved the N3 brief rev. 1 ("Sim, aprovar") with the PM's recommendations:
  - **U-N3-1 (RD-056, pricing): (a).** MissionHub's platform share on hires surfaced by the sourcing side's report is the normal rate on the fee collected (PD-049), with no surcharge. RD-056 is decided; no build change.
  - **U-N3-2 (counsel posture): approved** as in PD-067. `deemed_agreement_enabled` stays off in production until counsel confirms Q-1 and N10 rules acceptance is live. Q-2 to Q-4 ship as drafts and are launch-gated. Sending Q-1 to Q-4 to counsel is the user's own action, tracked as pending on the launch checklist (Legal).
  - **U-N3-3 (effort): accepted.** About 20 backend days (range ~18–23), two internal drops, one QA pass, PD-069 cut rule.
  - Brief marked "rev. 1, approved". Roadmap N3 → **in design**.
- **Why:** user decision on pricing and legal posture; recommendations kept MissionHub neutral and both counsel outcomes shippable.
- **Links:** RD-056; PD-049, PD-066 to PD-070; brief §8.4, §11.
- **Status:** decided (user)

## PD-072: N2 leftovers from the F-0/F-1 re-check join N3 backend drop 1
- **Date:** 2026-11-16
- **Decision:** `job-terms-card/qa-report.md` §11 items go into N3 as Must 0b, built in drop 1:
  - **QA-N2-12:** flat → % amendments post the % currency the admin saw; the action and the RPC (`p_expected_currency`) refuse with a stale-terms error when the job's salary currency changed. Nothing written; form reloads.
  - **QA-N2-10:** field error on `flatCurrency`, not on the derived `currency` key.
  - **QA-N2-11:** legacy referrals get `errors.amendment_legacy_referral` for both % and flat posts.
  - **Three doc fixes:** `fee_estimate_minor` null cases in `domain-model.md`; the intended `forbidden` / `not_found` asymmetry in `security-and-privacy.md`; the stale rate-limit open item removed.
  - Effort +0.75 backend days (+ buffer → total ~21.3, still inside the accepted ~18–23). Counted outside the PD-069 18-day bar.
- **Why:** QA-N2-12 can store an amendment at the wrong currency scale (the trust break PD-060 / PD-062 closed elsewhere); refusing on change is cheap and deterministic. The others are small and touch files N3 drop 1 already opens. One QA pass covers them.
- **Alternatives:** leave them in Engineering hygiene (rejected: QA-N2-12 is a money-correctness issue before amendments start); N2.1 (rejected: not a launch gate, could slip past launch).
- **Links:** `job-terms-card/qa-report.md` §11.2, §11.3; PD-062; brief Must 0b, §9.1.
- **Status:** decided

## PD-073: N3 estimate reconciled at ~22.1 backend days; reopen moves to N7, metrics to Ops SQL
- **Date:** 2026-11-16
- **Decision:**
  - The backend's day-1 estimate is 21.0 days before buffer (~24.2 with it). The PM applies **PD-069 cuts (2)–(4)** (no answer-clock restart; HA-1 and HA-9 to Ops SQL; sister-org tick → admin note) and two more trims:
    - **(b) BR-30 reopen of a deemed confirmation moves to N7.** It can't be reached before N7 writes delivery records. **N7 can't enable deemed confirmation without building BR-30** (N7 acceptance condition).
    - **(c) Metrics counts move to Ops SQL** until the N2.1 metrics panel; the admin-task flags (HA-6, late, fee overdue, decision overdue, unanswered) stay in the product.
  - Result: **19.25 days before buffer, ~22.1 with the 15% buffer**, inside the user-accepted ~18–23 (PD-071). The user's range replaces PD-069's 18-day bar as the hard limit.
  - **(d) rejected:** the deemed branch and its seeded-delivery tests stay in N3 (never-cut data gate; proves silence can't win without delivered email).
  - Drop-1 checkpoint: backend reports if drop 1 passes 10.5 days. If the projected total would pass 23 days, the PM takes it to the user; no further silent cuts.
- **Why:** every trim removes admin convenience or an unreachable path, never a trust rule. (b) has zero exposure because deemed confirmation needs N7, and N7 is a launch gate. (a) alone (~23.2) would sit on the edge of the user's range with no margin for an L feature whose predecessor ran to the top of its range.
- **Not escalated:** within the approved scope and effort range; nothing pricing, legal or irreversible. BR-30 still ships before launch, inside N7.
- **Alternatives:** (a) accept ~23.2 (rejected: no margin); (d) (rejected above); cutting fee-pending or RD-029 (never-cut).
- **Links:** `backend-estimate.md` §10, §10.1; PD-059, PD-069, PD-070, PD-071; brief rev. 2 §9.0.
- **Status:** decided

## PD-074: N3 backend questions Q-PM-1 to Q-PM-12
- **Date:** 2026-11-16
- **Decision:**
  - **Q-PM-1:** `deemed_agreement_enabled` is false in every environment; tests turn it on per case by service role; a local script for development. Default confirmed (BR-9).
  - **Q-PM-2:** a record-only hire moves the referral to `hired`. Confirmed (BR-11).
  - **Q-PM-3: default overridden.** A referral without `delivered_at` was never delivered (N1 BR-28 backfilled every delivered pre-N1 referral) and is **never eligible**. Using `submitted_at` would start a window at submission, against RD-023. The happy path (`offer` + active agreement) is unchanged whatever the data (BR-4).
  - **Q-PM-4:** placement cancel and re-record after a fall-off are out of N3 → **X6**; Ops handles any case through support with an audit note (BR-44).
  - **Q-PM-5:** the reopen rule (bounced/complained/failed row after the deemed date, or an admin-recorded incident reference) is confirmed and handed to N7 with BR-30 (PD-073).
  - **Q-PM-6, Q-PM-7, Q-PM-9, Q-PM-10, Q-PM-11:** defaults confirmed (late marker on B's confirm only; invoice clock set when fee details with the start date are entered; key union on both sides; legacy fee-pending uses free entry with no estimate; record-scope roles for A).
  - **Q-PM-8:** moot after PD-069 cut (4); related-org hires are an admin note.
  - **Q-PM-12:** frontend calls `router.refresh()` on `errors.stale_version` in the admin amendment form (N3 drop 1 frontend); the copy stands.
- **Why:** defaults are sound and keep deny-by-default; Q-PM-3 would have made undelivered referrals hire-eligible.
- **Links:** `backend-estimate.md` §11; brief rev. 2 BR-4, BR-9, BR-11, BR-13, BR-14, BR-21, BR-30, BR-31, BR-44.
- **Status:** decided

## PD-075: N3 designer questions Q-D2 to Q-D18
- **Date:** 2026-11-16
- **Decision:**
  - **Defaults confirmed:** Q-D2 ("Record hire"), Q-D3, Q-D4 (money inputs discarded on released referrals), Q-D5, **Q-D6 (`not_this_client` statement admin-only, rule 4.5)**, Q-D7 to Q-D9, Q-D10 (no contest after the deadline), Q-D11 (B's record closes a contested report and its dispute), Q-D12, Q-D13, Q-D14, Q-D15, Q-D16 (no active job owner → never deemed).
  - **Q-D17 changed:** a report closed by B's own record counts for HA-1. It was first reported by A, which is the backdoor signal (RD-051 "hires first reported by the sourcing side"). HA-1 is Ops SQL in N3.
  - **Q-D18 changed:** B can't record a hire while its own prior-presentation objection on that referral is open or contested (new **BR-45**, code `objection_open`). After a rejected objection, a record within 5 business days isn't late; after an upheld or final one, the referral doesn't count. Allowing it would create a placement on a referral that may stop counting, and there's no placement cancel path (X6). Mirrors HE-13.
- **Why:** protect rule 4.5 and the deny-by-default posture; keep one consistent order between objections and hires on both sides.
- **Links:** `spec.md` §9; brief rev. 2 BR-11, BR-13, BR-22, BR-25, BR-29, BR-40, BR-45, §12.
- **Status:** decided

## PD-076: N3 Network Rules drafts: related-org sentence in; no "at that client" sentence
- **Date:** 2026-11-16
- **Decision:**
  - **Related-org hire (BR-12, RD-021):** the ux-writer adds one sentence to 6.3 in en / fr-CA / pt-BR: a hire by an organization related to the hiring recruiter's (sharing a member) counts as the hiring recruiter's hire. Marked ⚖️ and approved with the rest under P0-1. Product call: members must be told about a rule the product applies to them; "affiliates" covers the client's group, not the hiring recruiter's.
  - **"At that client" for jobs without a client key:** no sentence. After BR-1, every job open to external referrals has a client name, so "any role" is true for every partner referral made after N3. **Launch check instead:** count delivered external referrals on jobs without a client key on the hosted DB; it must be 0 or test data, otherwise the PM revisits the sentence.
  - The fee-details deadline stays in 7.2 as drafted.
- **Why:** both are product truth questions (does the text match what the product does?), not legal positions. Counsel still reviews the final wording under P0-1.
- **Links:** `docs/content/network-rules-n3.md`; RD-021; PD-055 (no rule sentence unless the product does it); brief BR-1, BR-3, BR-12.
- **Status:** decided (wording ⚖️ under P0-1)

## PD-077: N3 drop 1 backend questions (`backend.md` §11)
- **Date:** 2026-11-16
- **Decision:**
  1. **Client-name gate on internal referrals: kept as built (deny by default).** Internal referrals already need the job open to partners, so no internal path to a closed job exists. The gate therefore applies to them too. No exemption (would cost ~0.5 d, a per-viewer predicate in `get_opportunities` and `assert_referable`). A related org that wants to refer adds the client name, which also gives it client-scope protection. Brief BR-1's "internal referrals are exempt" is withdrawn; AC-3's second sentence is removed.
  2. **`report_hire` waiving the pipeline-owner rule for the `hired` move only: confirmed.** BR-7 and RD-036 put the record duty on the org (job owner or any B manager), and a duty only the accepting member could perform would fail when that member is away or gone (HE-10). Every other transition keeps the pipeline-owner rule. Condition: the happy path must not regress. A member who could record the hire before N3 (the accepting member on `offer`) still can whenever record scope lets them see the referral. QA checks it.
  3. **AC-15: accepted.** `accepted → declined` isn't a valid transition, so a declined referral has no agreement. Declined, `submitted` and SLA-released referrals record as V4 (flag off, no split) or V3 (flag on, deemed agreement). The V2 case (active agreement, not `offer`) covers `accepted`, `interviewing`, `withdrawn`, `rejected` and `cancelled` after acceptance.
  4. **Error codes: accepted.** `report_hire` returns `not_found` to anyone who can't act (no existence oracle, spec §2.0), and `hire_dates_invalid` for a missing or out-of-bounds start or acceptance date. Each needs a mapped key (ux-writer).
  5. **Date bound and holiday horizon: accepted.** Start and acceptance dates lie within [delivery − 1 year, today + 548 days] (`hire_dates_invalid`). Because start dates can now reach about 18 months ahead, the holiday-seed cadence in PD-037 moves from 1 October to **1 June each year** (table covers the next two calendar years). The next action is **by 2028-06-01: seed 2030**. From about 2028-07-01, a start date of today + 548 days falls in 2030, and the invoice clock (and deliveries) would raise `holiday_calendar_exhausted`.
- **Why:** deny by default; the duty belongs to the org; no oracles; the clock has to cover every date the server accepts.
- **Links:** `backend.md` §11; brief BR-1, BR-7, BR-8; PD-037; roadmap Recurring operations.
- **Status:** decided

## PD-078: Coordination risk: N10 and N3 built in parallel in the same tree and local DB
- **Date:** 2026-11-16
- **Decision:** another session of the user builds N10 in the same working tree and local database (migrations `20261116001000` to `001700`); N3's migrations are `20261117*`. Rules:
  - **Last definition wins.** For any function both features redefine (likely `app.job_partner_visible` / `app.job_hidden_reason`, the submit RPCs, `release_referral`, `withdraw_referral`, `open_dispute`, the notification helpers, `get_referral_presentation`), each new migration starts from the **live** body after a `db:reset` that includes the other feature's migrations, as PD-064 already requires. N3 (later timestamps) must carry N10's changes; any N10 migration dated after an N3 one must carry N3's.
  - Backend lists the overlapping functions in `backend.md` v2; QA runs the N3 **and** N10 suites (plus record scope) on each pass.
  - `db:reset` by one session wipes the other's local data. Each session announces resets, and no QA run counts while the other session is migrating.
  - **Hosted push:** N3 never goes without the N10 migrations it was built on (or N10's are pushed first, in timestamp order). Push only on the user's request, with the record-scope md5 check.
  - The user is asked to tell the N10 session.
- **Why:** with two sessions, a silently overridden function body is the most likely way to lose a security check, as the record-scope copies showed (PD-064).
- **Links:** PD-064; roadmap Engineering hygiene; N10 brief BR-12.
- **Status:** decided

## PD-079: N3 QA round 1 product calls (QA-N3-09, AC-30 admin, gaps 6 and 7)
- **Date:** 2026-11-16
- **Decision:**
  1. **QA-N3-09: AC-93 follows N10 settlement mode.** N10 settlement mode is now in the tree, so a suspended org keeps acting on in-flight referrals (N10 BR-13 / BR-33): a suspended A can open the referral, file and rebut; a suspended B can contest and record. The deadline rules stay. A suspended B at `answer_due_at` → `unanswered`, never deemed, even with delivered records. A suspended A with no rebuttal at `rebuttal_due_at` → `in_review`. The admin decides in both cases; admin views show the Suspended pill. Brief BR-44 HE-11 updated to match.
  2. **AC-30 admin "Invoice overdue": deferred, no admin task row in N3.** Both workspace sides show the chip (the parties who act). For admins it's a 6.4 signal, read by a documented **Ops SQL** query (like the other N3 counts, PD-073) until **X9** builds late-payment flags and admin views on the same pattern. Keeps the fix round small; no trust rule depends on it.
  3. **Gap 6: client names at commit and delivery.** Names aren't stored today; the admin sees both keys and the job's current client name. **Follow-up, before launch** (Engineering hygiene, backend ~0.5 d + admin label): store the client-name text at commit and at delivery in closed `app` tables (admin-only, never returned to members, no audit metadata), so renames (HA-11) are visible in disputes. Must ship before the first real referral, since it can't be backfilled. **Labels now (admin-only copy):** "Normalised client key (at submission)", "Normalised client key (at delivery)" and "Client name on the job today". No label may say "client name" for a key.
  4. **Gap 7 → N7 acceptance condition.** The deemed-confirmed line needs the fee-details deadline (`fee_details_due_at` in the report view). It can't occur before N7. Added to N7's acceptance conditions next to BR-30.
- **Why:** align with what's built and decided in N10; keep labels truthful to admins; defer only signals with no member impact.
- **Links:** `qa-report.md` QA-N3-09; `design-review.md` gap 5; `frontend.md` D2.4 items 5–7; N10 brief BR-13, BR-33; brief BR-28, BR-44; roadmap N7, X9, Engineering hygiene.
- **Status:** decided

## PD-080: Test-process rule after the QA dev-server incident
- **Date:** 2026-11-16
- **Decision:** during N3 QA, a `pkill -f "scripts/worker.mts"` also matched the worker of the user's `npm run dev` (`concurrently -k`), and the user's dev server stopped; the user reset and restarted. Standing rule for every agent that starts processes (QA, backend, frontend):
  - stop only processes you started, **by the PID you recorded** when starting them; never `pkill` / `killall` / pattern kills;
  - never use or touch port 3000 or the user's `npm run dev` processes; use a dedicated port (e.g. 3117) and say which;
  - never run `db:reset` on the shared local DB without announcing it (PD-078);
  - report in `qa-report.md` / `backend.md` / `frontend.md` which processes were started and that each was stopped.
  Added to the N3 brief DoD and constraints and the roadmap's Engineering hygiene. **Recommendation for the main session:** add the same rule to `.claude/skills/feature-team/SKILL.md` ("Rules for you as lead") and the qa-engineer agent definition, with the user's OK (agent configuration isn't the PM's file).
- **Why:** the user's environment is never collateral for a test run.
- **Links:** `qa-report.md` incident note; PD-078.
- **Status:** decided

## PD-081: N3 accepted; launch gates; `journey.test.ts` regression triaged
- **Date:** 2026-11-16
- **Decision:**
  - **N3 is accepted** against brief rev. 2 (`docs/specs/referral-claims-two-sided-hire/acceptance.md`): 42 of 45 BRs accepted, BR-16 and BR-39 (Shoulds) not built, BR-30 moved to N7. QA PASS after fix round 1; N3 integration 96/96, N3 E2E 5/5, regression E2E 41/41, 308 unit tests, lint and typecheck clean.
  - **Launch-gated, not acceptance blockers:** counsel Q-1 to Q-4 (user sends); `deemed_agreement_enabled` off in production; Network Rules 6.3 / 6.4 / 7.2 merge after counsel; client names at commit and delivery (PD-079) before the first real referral and before the N3 push; browser and visual pass (dark, 375px, fr wrapping, keyboard, remaining dialogs) plus a measured contrast check of design B-2 / B-3; N7 items (BR-30, delivery and bounce records, `fee_details_due_at`); holiday seed for 2030 by 2028-06-01; two hosted counts before the push (referral-open jobs without a client name, delivered external referrals on jobs without a client key).
  - **Regression triaged: `journey.test.ts` "making a candidate unavailable removes them from B's counts".** Fails on a clean stack and alone; N3 doesn't touch matching, so it's **not an N3 blocker**, but it's a **major regression on a launch-checklist suite**. Owner: **main session assigns**, **backend-engineer** fixes (matching / candidates), **qa-engineer** first adds an assertion on the candidate update's error to separate "update refused" from "not counted". Due: before launch and before the next hosted push. Logged under Engineering hygiene.
  - `network-rules-qa.test.ts` fixture interference → N10 session QA. **QA runs are serialised** across sessions (PD-078): one full run at a time, announced, no counting while another session migrates or resets.
- **Why:** every Must trust rule holds and was verified adversarially; the open items are legal, data-dependent, visual or in other features, and each has an owner and a gate. Accepting now lets N4 start; none of the gates can be closed by more N3 build work except item 4 (client names), which is scheduled.
- **Alternatives:** hold acceptance until the browser pass (rejected: the same pass is already a launch-checklist step for N1 and N2, and a blocker found there reopens the screen); count `journey.test.ts` against N3 (rejected: unrelated code path, and it fails alone on a clean stack).
- **Links:** `acceptance.md`; `qa-report.md` Round 1 re-check; PD-066 to PD-080; roadmap N3, Engineering hygiene, launch checklist.
- **Status:** decided

## PD-084: Build N10 now, ahead of N5's spec; legal drafts ship as drafts
- **Note:** first logged as a duplicate PD-066 (commit 9a2d5d3); renumbered to PD-084.
- **Date:** 2026-11-16
- **Decision:** The founder approved building N10 now from the frozen spec, without waiting for N5's spec. N10 builds its own first-access gate and its onboarding pieces; N5 adapts to them later. The counsel items (C-1, C-3, C-4, C-5, C-7) ship as draft text and are changed after counsel review, with no flow change expected. The three designer calls in spec §9 are built as the spec states them: only `decided_by` can't lift a termination; Lift is offered on both settling and settled terminations; nobody answers info requests once the reporter has left. The PM can revisit them at acceptance.
- **Why:** the founder wants N10 running now. The legal text is data (versioned Rules plus copy keys), so changing it later is cheap.
- **Alternatives:** wait for N5's spec (rejected by the founder).
- **Links:** PD-056 to PD-058, PD-065; `docs/specs/network-rules-enforcement/spec.md`.
- **Status:** decided

## PD-082: N10 accepted with conditions
- **Date:** 2026-11-16
- **Decision:**
  - **N10 is accepted** against brief rev. 2 (`docs/specs/network-rules-enforcement/acceptance.md`). QA round 2 is PASS: 126 of 145 Must ACs pass, AC-32 is deferred (PD-083), 15 are partial (UI states or settlement paths not rendered or exercised), 3 are not verified (accessibility, AC-118 to AC-120). The round-1 blocker (QA-N10-01, sanction columns readable by partners) and both majors (open redirect, gate deadlock) are fixed and re-verified.
  - **Conditions before launch:** (1) publish v1 of the Rules in the same window as `supabase db push`, or onboarding is blocked; (2) counsel review of the Rules and legal copy (C-1, C-3, C-4, C-5, C-7), with the text shipping as drafts until then (PD-084); (3) hosted push only when the user asks, in timestamp order (N10 `20261116001000` to `001800` before N3 `20261117*`, PD-078), with two platform admins in place; (4) one full integration run on a clean local stack, because QA's round 2 did not re-run the full suite after the `organizations` column revoke and the backend's 530/530 is not QA-verified; (5) an accessibility and browser pass for AC-118 to AC-120; (6) named owners for conduct reports and reviews; (7) a scripted check of settlement-mode money and dispute paths (AC-101, AC-102).
  - **Follow-ups, not gating:** minor frontend gaps 1 to 3 and 8 to 11; bilingual notices (after counsel C-5); the metrics card and planned-review reminder; the `settlement_mode.exited` event and "refund due" tag; moving the versions test to a rolled-back transaction.
  - The three designer calls in PD-084 are confirmed as built.
- **Why:** every hard constraint (isolation, reporter identity, partner-invisible sanctions, prior notice, second-admin review, closed settlement scope) held under adversarial testing, and the open items are legal, visual, operational or minor. Each has an owner and a gate. Holding acceptance for the accessibility pass would not change the build, since a blocker found there reopens a screen either way.
- **Alternatives:** accept without conditions (rejected: v1 publication, counsel and the full-suite run are real gates); reject until the full suite and accessibility pass are done (rejected: they are verification and launch work, not build gaps).
- **Links:** `acceptance.md`; `qa-report.md` round 2; `backend.md` §11 and §12; `frontend.md` §3; PD-056 to PD-058, PD-084, PD-078, PD-081; roadmap N10, Engineering hygiene, launch checklist.
- **Status:** decided. The legal and publication items are the user's (`Needs user decision` where noted in `acceptance.md`).

## PD-083: AC-32 deferred: no scheduler notification at a rules effective date; reminder Should deferred with it
- **Date:** 2026-11-16
- **Decision:** `network_rules.effective_not_accepted` (AC-32, a Must) and `network_rules.reminder` (7 days before an effective date, a Should) are not built in N10, because the project has no scheduler to detect that a version became effective. The lead deferred AC-32; the PM records it and counts it as accepted.
  - **What still works:** the `rules_not_accepted` restriction is computed lazily, so it applies at the effective date with no job. Members see the persistent banner from publication to the effective date, and the publish notification goes out at publication (BR-8, BR-39). The org-admin Network standing page and the banners show the state. Nothing is blocked wrongly; the only missing piece is a push notification at the effective date.
  - **When it must exist:** before the **first material or legally required version** is published. It is **not needed for v1** (type `initial`, effective at publication, no re-acceptance window). Until it ships, any material version must not be published.
  - **How:** one worker maintenance step that finds versions that became effective since its last run and notifies each org's `org_admin`s and the members who haven't accepted, plus the 7-day reminder in the same step. N7 adds the emails. Backend owner, about 0.5 to 1 day [estimate].
- **Why:** the missing notification is a courtesy on top of a gate that already works, and v1 can't trigger it. Building a scheduler for it now adds infrastructure for no v1 benefit.
- **Alternatives:** build the scheduler now (rejected: out of the N10 effort bar, no v1 use); drop the notification (rejected: a member who hasn't accepted would find out only when blocked, which brief rev. 2 treated as the trust-sensitive moment for material versions).
- **Links:** brief BR-8, BR-9, BR-39, §5 Should; `backend.md` §11.2; `qa-report.md` AC-32; `acceptance.md` G-1, G-2; roadmap N10 follow-ups.
- **Status:** decided
