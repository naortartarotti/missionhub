# Brief: Network Rules: acceptance, conduct reports and network hold

Owner: Product Manager · Date: 2026-11-16 (rev. 2) · Roadmap item: **N10** ([`roadmap.md`](../../product/roadmap.md)) · Status: **brief final; spec ready to freeze** once the designer applies the PD-058 changes (§9.0).
Slug: `network-rules-enforcement`
Decision trail: PD-053 (.3 ladder and immediate-hold list, .4 30-day notice, .7 rules text), PD-054, PD-055, PD-056, PD-057, **PD-058** ([`decisions.md`](../../product/decisions.md)); RD-002, RD-016, RD-017, RD-018, RD-029, RD-037, RD-039, RD-043, **RD-044 to RD-049** ([strategy decisions](../../strategy/decisions.md), [`recruiting-input.md`](recruiting-input.md)); [`backend-estimate.md`](backend-estimate.md); domain source [`network-rules-v1.md`](../../strategy/network-rules-v1.md) (rules 1.x, 7.x, 8.x, 9.x, 10.x); member-facing drafts [`docs/content/network-rules/`](../../content/network-rules/README.md); [`top-echelon-policies-analysis.md`](../../research/top-echelon-policies-analysis.md) §5 P0-2, P0-3.
PM decisions: N10-D1 to N10-D12 (§9.1, logged as PD-056); rev. 2 answers N10-D13 to N10-D38 (§9.0, logged as PD-058).

> **Revision 2 (2026-11-16).** Resolves every open PM question so the spec can be frozen. Sources: backend estimate §7 (Q1–Q7), spec §9 (Q-D1 to Q-D17 and the PM items), strategist RD-044 to RD-049, founder approval of RD-048 (PD-057).
> - **Settlement mode:** option (a) in full is decided (3.75 d, under the 4-day bar). Fallback (b) is dropped. Scope: in-flight referrals and open obligations only (BR-34, BR-37).
> - **Storage:** conduct cases live only in closed `app.conduct_*` tables, with no `public.disputes` row (BR-18 rewritten, EC-3).
> - **First-access gate:** enforced in the database for every authenticated write, with a short exempt list (BR-7). It applies in settlement mode.
> - **Strategist folded in:** 9 context-filtered categories and the admin category (BR-17, BR-20); 4 reporter outcomes and the 2.3 incident notice (BR-23); the fixed possible-outcomes line and the notice-bound rule picker (BR-21, BR-28); stale-referral close for terminated orgs (BR-37); "no longer part of" after settlement (BR-14, RD-048 approved); R-5 corrected; overdue-hold flag (Should); "pause received shared profiles" moved to X11.
> - **Changed rules:** BR-7, BR-9, BR-12, BR-14, BR-15, BR-17, BR-18, BR-19, BR-20, BR-21, BR-23, BR-26, BR-28, BR-29, BR-31, BR-34, BR-37, BR-43, EC-1, EC-3, §5, §9, §10, §11 (scenarios 35–41 added), §12.
> - Nothing new needs the founder. Counsel items C-3, C-4 and C-7 gain the strategist's questions.

## 1. Problem

Verified in the code on 2026-11-15:

1. **Nobody accepts the rules.** `create_organization()` and `accept_invitation()` record no agreement, and the database has no rules version. The conduct rules (data use, client contact, honest representation) aren't binding, and we can't prove which text a member agreed to.
2. **Breaches can't be reported in the product.** `disputes.kind` is limited to `placement` and `prior_presentation`, and each needs a placement or an objection. A breach of rules 2.x to 5.x (CV reused, client approached, confirmation forged) has nowhere to go. The draft rule 8.1 falls back to a support address.
3. **The only sanction is a full suspension.** `set_organization_suspension` sets `organizations.suspended_at` with a free-text reason. There's no notice, no response window and no review. The partners of a suspended org lose their referrals in progress, because:
   - `app.is_member()` and `app.has_role()` return false for a suspended org, and almost every RLS policy depends on them;
   - `getRequestContext()` calls `notFound()` (`src/server/auth/context.ts:94`);
   - `listMemberships()` hides the org;
   - the suspension expires every match in both directions.
4. **Rule 9.5 is false today.** "During a hold or suspension, your obligations continue." A suspended org can't record a hire, confirm a payout, record a refund or answer a dispute, because it can't reach any of it.
5. **No proportionate middle level.** Nothing stops an org from taking new partner work while it keeps what's in flight, which is what PD-053.3 calls a network hold. The partner-visibility predicate (`app.job_partner_visible`, N2) already handles "suspended", so it's the natural place to add the hold.

## 2. Users and roles

| Role | Need |
|---|---|
| **Org admin** (`org_admin`) | Accept the rules for the org at joining and on each material change. Get notices, answer them, request a review. Know exactly what a hold or suspension blocks. |
| **Every member** (`org_admin`, `recruiter_manager`, `recruiter`) | Accept the rules personally before using the network (rule 1.1). Report a breach from the referral or the partner job (8.1). Keep working on referrals in progress whatever happens to the partner org. |
| **Sourcing recruiter / hiring recruiter** (partner of a sanctioned org) | Not be punished for the partner's breach: in-flight referrals, payouts and refunds continue (9.1, 9.5). Learn nothing about the partner's sanctions beyond "not taking new referrals". |
| **Platform admin** | Triage reports within 2 business days. Send notices, decide on the ladder, apply an immediate hold only in the two 9.4 cases. Review another admin's decision (9.6). Publish rules versions. |
| **Founder** (user) | Approves the published rules text (P0-1) and decides the items marked `Needs user decision`. |

## 3. Evidence

- **PD-053.3:** the 4-level ladder; immediate hold without notice only for data leaks and evidence or confirmation fraud; notice and a response window for every other step. **PD-053.4:** 30 days' notice and re-acceptance. **PD-053.2:** Workatent decides platform effects only, never money. **PD-053.7:** French offered first in Québec.
- **PD-055:** N10 scope, acceptance conditions (9.1, 9.5, 10.1–10.3, plus 9.4, 9.6 and 8.1), PM recommendation for settlement mode.
- **Network Rules v1:** 1.1 (org admin accepts for the org, every member accepts), 1.5 (leaving keeps in-flight obligations), 1.6 (badge removed during a hold or suspension), 7.1–7.4, 8.1–8.5, 9.1–9.7, 10.1–10.6.
- **RD-037:** residual "but for" test, effects in-platform only. Reviews by a second admin are its safeguard. **RD-016:** files go to admins, not to the opponent. **RD-017 / RD-018:** 10-business-day rhythm and the business-day calendar. **RD-029:** a confirmation found invalid goes to breach review. **RD-039, RD-043:** client-contact conduct reaches admins through conduct reports.
- **Analysis §5 P0-2, P0-3:** the scope and success metrics (0 active users without acceptance; first response ≤ 2 business days; 0 full suspensions where a hold would do).
- **Network-rules README, founder item 3:** each rule sentence that promises product behaviour ships only if the product does it.

## 4. Goal and success metrics

**Goal:** the rules become a binding, versioned agreement. A breach can be reported in two clicks and gets a fast, fair and proportionate response. Innocent partners keep their in-flight work, and a sanctioned org can still settle what it owes.

| Type | Metric | Target | How we measure |
|---|---|---|---|
| Leading | Active users who can do partner actions without accepting the current version | **0** (by construction) | QA, plus a SQL check on the acceptance tables vs active memberships |
| Leading | Share of active members who have accepted a new material version by its effective date | ≥ 90% **[estimate]** | Member acceptances ÷ active members at `effective_at` |
| Leading | Median days from publication to acceptance of a new version (per member) | ≤ 7 days **[estimate]** | Acceptance timestamps |
| Leading | Orgs still restricted for `rules_not_accepted` 7 days after an effective date | 0 | Restriction predicate snapshot |
| Leading | Admin first response to a conduct report within 2 business days (rule 8.4) | ≥ 90% | Filed → first admin action, with the N1 helper |
| Leading | Conduct reports per 100 delivered referrals, by category | Baseline (watch). Also feeds the RD-039 / RD-043 / RD-040 revisit signals | Conduct cases by category |
| Leading | Share of reports closed at triage (no rule engaged) | Watch. Above 50% means the categories or the copy are unclear | Case outcomes |
| Lagging | Cases decided within 10 business days after the response window closes (response received or deadline passed) | ≥ 80% | Response-window end → decision |
| Lagging | Full suspensions used where a hold would have done | 0 (admin states why a hold isn't enough, BR-30) | Sanction log, reviewed monthly by the PM |
| Lagging | Sanctions reduced or overturned on review | Watch. More than 1 in 5 → revisit admin guidance (RD-037 signal) | Review outcomes |
| Lagging | Decisions resting on the residual test (rule 7.4) | More than 1 in 5 → the rules need a new objective rule (RD-037) | Admin marks "residual test (7.4)" in the finding |
| Lagging | In-flight referrals blocked or cancelled because of a partner's sanction | 0 | QA by construction; support tickets |

*Note:* the roadmap's "% of reports resolved in ≤ 10 business days" can't be measured from filing, because the reported org alone has 10 business days to respond. It's measured from the end of the response window (above).

## 5. Scope

### Must (this release)
1. **Rules versions** (BR-1 to BR-4): versions with label, type, effective date, change summary, full text per locale and SHA-256 per locale. Published versions are immutable. Platform-admin publish screen. A versions page for members showing the current version, the upcoming one and the history with change summaries (rule 10.1).
2. **Acceptance** (BR-5 to BR-11):
   - org acceptance by an `org_admin` at joining;
   - member acceptance at first access (hard gate);
   - re-acceptance of material versions after 30 days' notice;
   - the effective-date gate on new partner activity, org-level and per user (rule 10.3);
   - French first for Québec orgs.
3. **One partner-activity restriction mechanism** (BR-12 to BR-14), used for the network hold, rules not accepted, suspension and termination (and N5's network-pending state, if N5 ships it). It defines exactly what's blocked, what continues and what partners see.
4. **Conduct reports** (BR-15 to BR-25):
   - "Report a problem" on the referral (both sides) and on the partner job;
   - a conduct case shown in `/admin/disputes` (stored in closed `app.conduct_*` tables, BR-18) with context-filtered categories and optional attachments (N1 evidence pipeline);
   - admin triage within 2 business days (target);
   - an admin-written notice to the reported org with a 10-business-day response window;
   - outcome to both sides (four reporter outcomes);
   - the 2.3 incident notice to affected orgs (BR-23);
   - admin-initiated cases.
5. **Sanction ladder** (BR-26 to BR-32):
   - warning, network hold, suspension, termination, all recorded on the org file;
   - prior notice enforced server-side;
   - immediate hold only on grounds 2.3 or 4.8, with the notice created in the same action;
   - one review by a different platform admin, enforced in the database;
   - a "Network standing" page for org admins;
   - full audit trail.

   `set_organization_suspension` is dropped and replaced by the ladder (BR-29).
6. **Settlement mode** for suspended and terminated orgs (BR-33 to BR-38), option (a) in full (decided, PD-058), including the admin close of stale referrals for terminated orgs (BR-37).
7. **Notifications** (in-app; emails when N7 ships) and **audit events** for every step (BR-39, BR-40).
8. en / fr-CA / pt-BR copy for every screen, banner, notice template and notification. The neutral partner sentence (BR-14). Glossary terms from voice-and-tone §5.7 (conduct report, network hold, sanction, review, and so on).
9. `docs/domain-model.md`, `docs/security-and-privacy.md`, `docs/product-flows.md` and `docs/architecture.md` (if there are new service-role uses) updated.

### Should (this release if it fits, otherwise first follow-up)
- Org admins see which members haven't accepted the current or upcoming version (names only, own org).
- A reminder notification 7 days before an effective date to members who haven't accepted.
- Admin "review by" reminder on holds with a planned review date.
- Admin metrics card for the §4 metrics on `/admin`.
- Bilingual notice templates (fr-CA + en) offered to the admin when the reported org is in Québec (counsel C-5).
- **Overdue immediate hold** (RD-049): an immediate-hold case with no decision 10 business days after its response window closed shows "Decision overdue" in the admin queue and on the metrics card, sorted first. No automatic lift.

### Won't (this release)
- Paid peer-review panel (P2-2). Automatic sanctions or automatic escalation. Automatic hold lift.
- Document watermarking (P2-5). Org blocking (X8, a member feature, not a sanction).
- Any fee, fine or compensation for a breach (PD-053.1, RD-039). Money amounts between members stay out (rule 7.5).
- Self-serve "leave the network" or org closure. The acceptance screen points to support for leaving (rule 1.5, 10.3). Follow-up if requested.
- A general "Report a problem" with no referral or job context. The support address covers it (rule 8.1 interim text stays for that case).
- Freezing a held org's access to shared profiles on in-flight referrals (RD-046: no freeze before a finding). The **"pause received shared profiles"** effect on a 2.3 breach finding is backlog in **X11** (after N3). Pausing deliveries during a 2.3 immediate hold waits on counsel C-4.
- Closed referral history in settlement mode (BR-34). The pipeline board in settlement mode (in-flight referrals are worked from the Referrals list and the referral page).
- "Report a problem" on internal referrals between related orgs (support address covers exceptions).
- Reporters downloading their own submitted files (names and sizes only).
- Automatic closing of stale referrals for terminated orgs (admin action only, BR-37).
- A public, logged-out rules page (pending U-N10-1).
- Recording IP address or user agent with acceptances (counsel C-1 may add it later).
- Reapplication flow after termination: N5's application enforces the 12-month wait (9.7) by reading `terminated_at`. N10 only stores the date.

## 6. Business rules

### A. Rules versions (rules 10.1, 10.2, 10.5, 10.6)

- **BR-1 Version record.**
  - **Fields:** a label ("1.0", "1.1", "2.0"), a status (`draft` / `published`) and a **type**:
    - `initial` (only the first version);
    - `material`;
    - `non_material`;
    - `legally_required` (rule 10.5).
  - **Dates and text:** `published_at`, `effective_at`, a **change summary per locale** (required for every version after the first) and the **full text per locale**, `en`, `fr-CA` and `pt-BR`. The text is the Markdown of the approved `docs/content/network-rules/{en,fr-CA,pt-BR}.md`, with every marker stripped.
  - **Hash:** the database computes and stores a SHA-256 of each locale's text at publication.
  - **Immutable:** a published version can't be updated or deleted (no grants, plus a refusing trigger).
  - **Current and upcoming:** the **current** version is the latest published one with `effective_at` ≤ now. A published version with `effective_at` in the future is **upcoming**. At most one upcoming version exists at a time.
- **BR-2 Publishing** is for platform admins only, through an RPC. The RPC refuses a version when:
  - (a) any of the three locales is missing;
  - (b) any locale text contains `<!--`, `[TODO`, `[placeholder` or `⚖️`, so no counsel or "ships with" marker can be published;
  - (c) the effective date breaks BR-3.

  The publish screen requires an **approval reference** (free text, for example "Founder + counsel approval, 2026-12-01"), which is stored with the version. Publishing is audited. The P0-1 approval itself is the founder's, outside the product. The build and QA use the current drafts with markers stripped, in a local or seed version.
- **BR-3 Notice by type:**
  - `initial`: effective at publication.
  - `material`: `effective_at` ≥ 30 calendar days after publication, at 00:00 ET on that day (rule 10.2), and re-acceptance is required.
  - `non_material`: effective at publication, no re-acceptance, change summary required, members notified.
  - `legally_required`: may take effect earlier than 30 days, but requires a written reason (stored, shown in the change summary) and re-acceptance (rule 10.5).

  When the type is unclear, the admin publishes as `material`. Counsel guidance decides edge cases.
- **BR-4 Versions page (rule 10.1).** Every signed-in member, in any org state including settlement mode, and N5 applicants can read:
  - the current version in full;
  - the upcoming version and its effective date, if there is one;
  - the list of past versions with their change summaries.

  The page opens in the member's locale (French first for Québec orgs, BR-10), with a language switch. Linked from the acceptance screens, the workspace navigation or footer (the designer chooses), the N6a purpose notice and the Network standing page. Rule 10.4 (a rule change never changes submitted referrals' terms) needs no product work: N2 snapshots already freeze terms.

### B. Acceptance (rules 1.1, 10.2, 10.3, 10.6)

- **BR-5 Two kinds of acceptance, append-only, audited:**
  - **Org acceptance:** an `org_admin` accepts version V "on behalf of {org}". One record per org × version is enough.
  - **Member acceptance:** a user accepts version V personally, once per user × version. Valid in every org the user belongs to (N10-D2).

  Each record stores the user, the org (the org accepted for, or the org context where the member accepted), the version, the **locale shown**, that locale's **SHA-256** and the timestamp. Audit events are `network_rules.org_accepted` and `network_rules.member_accepted`. When an `org_admin` accepts, one action can record both, with two explicit statements on the screen (the designer decides whether that means one or two checkboxes, and counsel confirms, C-1).
- **BR-6 Joining.** Creating an org requires the creator to accept the current version, both for the org and personally. That means today's onboarding form (`create_organization`), or the N5 application when it replaces it. The server refuses org creation without the acceptance. A direct RPC call can't skip it.
- **BR-7 First access (hard gate).** A user with **no member acceptance of any version** sees the acceptance screen on every workspace route until they accept. Signing out, switching orgs and reading the versions page stay available. This covers invited members and **every existing user when N10 ships** (nobody has accepted yet).
  - **Enforced in the database for every authenticated write (rev. 2, N10-D13):** every workspace Server Action (`getRequestContext` / `guard`), every authenticated writing RPC, the `with check` of every client-writable table policy and the storage insert policies refuse with `rules_acceptance_required`. Backend line C (1.25 d), with a generated test over the RPC allow-list so a new RPC can't skip it.
  - **Exempt list (closed, documented in `backend.md`):** `accept_network_rules`; `create_organization` (it records the acceptance itself, BR-6); `accept_invitation` (the gate starts once the membership exists); sign-out and org switch; marking one's own notifications read; platform-admin RPCs under `/admin` (BR-11); candidate token RPCs and service-role worker paths (not users).
  - **Settlement mode:** the gate applies. Accepting is available there (N10-D17).
  - **For an `org_admin` whose org hasn't accepted the current version:** both statements (personal and on behalf of the org) are required to pass the gate, as two separate unticked checkboxes (N10-D18). In settlement mode only the personal statement is required (the org-level restriction is moot there, BR-9 c).
  - *Residual (R-7):* reads made directly through PostgREST before acceptance aren't blocked. The org's acceptance already binds the org for its members (rule 1.2), and writes are blocked.
- **BR-8 Material version during the notice period.** From publication to `effective_at`:
  - every member sees a persistent banner with the effective date and a link to the change summary;
  - members can accept at any time;
  - org admins also see whether the org has accepted.

  Notifications go out at publication (BR-39). Nothing is blocked before the effective date.
- **BR-9 After the effective date (rule 10.3):**
  - (a) **Org-level:** an org with no org acceptance of the current version gets the restriction reason `rules_not_accepted` (BR-12). No breach is recorded and nothing goes on the org's file. Any `org_admin` accepting lifts it immediately.
  - (b) **Per user:** a member who accepted an earlier version but not the current one **can't do the partner actions in BR-12 items 2–3** until they accept. A persistent banner explains this. Everything else continues, including all in-flight work (N10-D3).
    - "Open jobs to partners" means the **transition**: switching a job from closed to open to partners, or creating a job already open to partners. Editing a job or its terms while it's already open stays allowed (N10-D20).
    - The refusal code is `rules_acceptance_required` (the same as BR-7, one "accept the current rules" message). The org-level restriction uses `partner_activity_restricted`.
  - (c) In settlement mode (BR-33), re-acceptance isn't needed to settle obligations. The first-access gate (BR-7) still applies.
- **BR-10 French first (rule 10.6).** The acceptance screen and the versions page open in **French** when the org is in Québec. "In Québec" means the N5 province field is QC; until N5 provides it, the org's `locale` starts with `fr`. At org creation (no org yet), the user's UI locale `fr` opens fr-CA first (N10-D19). The member can switch language before accepting. The record stores the language shown when they accepted (BR-5). Which language version governs is for counsel (10.6 placeholder), not the product.
- **BR-11 Scope of the gate.** Platform admins working in `/admin` need no acceptance. Demo orgs follow the same rules, and the seed script records acceptances for demo users. Candidates (non-users) are out of scope.

### C. Partner-activity restriction (rules 9.1 level 2, 10.3; shared with suspension and termination)

- **BR-12 One predicate, one list.** A single server-side predicate returns why an org **can't start new partner activity**, in this precedence: `terminated` > `suspended` > `network_hold` > `rules_not_accepted` (> N5 `network_pending`). When any reason applies:
  1. **Its jobs aren't partner-visible.** `app.job_partner_visible` returns false. The job's settings (open to partners, terms) **stay unchanged**, so jobs come back when the restriction lifts and nothing has to be reopened. The owner, and only the owner, sees the hidden reason (`job_hidden_reason`: `network_hold`, `rules_not_accepted`; `org_suspended` already exists). The restriction reason takes precedence over job-level reasons (spec AC-138).
  2. **No opening to partners.** The org can still save "open to partners" on a job (internal configuration, connectors included), but the job stays hidden per item 1 and the owner sees why. In effect, no job of the org is open to partners.
  3. **No submitting.** Both submit paths (recorded authorization and candidate-confirmed), **internal referrals to related orgs included**, and the API refuse with `partner_activity_restricted`. The org's own banner explains why.
  4. **No receiving.** A submission to the org's jobs is refused with the same outcome partners already get for a hidden job, with no reason given. This is how "can't accept new ones" (rule 9.1) works in practice: no new referral can reach the org (N10-D4).
  5. **No partner matching.** The org gets no partner opportunities, its jobs and candidates are excluded from partner matches in both directions, and existing matches are hidden. When the restriction lifts, they come back (or are recomputed) within one matching cycle (backend chooses, EC-2). The org's own non-partner work isn't touched.

  The **per-user** restriction (BR-9 b) applies items 2–3 to that user only.
- **BR-13 What continues (in progress).** Every referral **submitted before the restriction started**, including `awaiting_candidate` ones, continues with every action, for both sides:
  - review, accept, decline, interview, offer, hire report;
  - objections (N1 claims) and contests, N3 claims and hire reports;
  - release and withdraw, referral messages, candidate-request resend;
  - delivery when the candidate confirms;
  - placements, invoices, payment evidence, payout confirmation, refunds, disputes.

  For a hold and for `rules_not_accepted`, internal work (own candidates, own jobs not open to partners, pipeline, team, settings) isn't touched. For suspension and termination, settlement mode applies instead (BR-33).
- **BR-14 What partners see (rule 9.1, "Partners see only that you aren't taking new referrals").**
  - The org's jobs drop out of opportunities like any other hidden job, with no explanation in the list.
  - Where a partner reaches the org's job directly (an old link, or the job header on an existing referral), the only statement is **"{Org} isn't taking new referrals right now."** It's the same sentence for every reason: hold, rules not accepted, suspension, network pending, and **termination while the org is still in settlement mode**.
  - **After settlement mode ends for a terminated org** (RD-048, approved in PD-057): former partners see **"{Org} is no longer part of the Workatent network."** with no cause. The same sentence covers voluntary exits once settled, so it never reveals a sanction. It appears on old links and closed referral history only, never in a list or a notification. It goes away if the org is readmitted (rule 9.7, N5). ⚖️ counsel checks the wording (C-7).
  - **Anti-enumeration:** either sentence is shown only to an org with a referral on, or a live match with, that job. Any other org gets the generic not-found (spec AC-137).
  - **Nothing changes on existing referrals.**
  - No reason, sanction level, warning, report or case is visible to any other org, in the UI, the API, matching explanations or notifications. The Verified badge simply disappears (rule 1.6, with N5) without explanation.

### D. Conduct reports (rules 7.1, 8.1–8.5)

- **BR-15 Entry points and parties.** Any active member can use "Report a problem":
  - (a) on a **referral** their org is party to, either side. The reported org is the other side.
  - (b) on a **partner job** they can see (opportunity detail). The reported org is the job owner.

  The server derives the reported org from the referral or job. It's never taken from the client. A caller who isn't party to the referral, or can't see the job, gets not-found. An org can't report itself. Restricted orgs (hold, settlement mode) can still report on their in-flight referrals. **Internal referrals between related orgs** have no "Report a problem" (N10-D22); the support address covers exceptions.

  **Who reads a report on the reporting side (N10-D23):** the reporting user and the reporting org's `org_admin`s. Access follows membership of the reporting org: a member who leaves loses access, and the report stays with the org. Outcome notifications go to the reporting user, or to the org's `org_admin`s if that user is no longer an active member.
- **BR-16 Report content:**
  - a **category** (BR-17);
  - **what happened** (20–4,000 characters);
  - **when** (a date, optional, approximate allowed);
  - optional **files**, through the N1 claim-evidence pipeline: PDF / PNG / JPEG, up to 5 files, 10 MB each, scan gate, SHA-256 computed by the worker, Canadian storage, 60-second signed URLs, admin-only;
  - a **good-faith attestation** (rule 8.5).

  The form says that trying the referral messages first is optional, never required (8.2). It also says honestly that the other organization may be able to tell where a report came from, and that retaliation is a breach (7.1).
- **BR-17 Categories (RD-044, rev. 2).** Nine values in the server enum, in this order ("Something else" always last). Labels are the ux-writer's; the meaning is fixed:

  | # | Category | Rules | Referral, reporter is sourcing side | Referral, reporter is hiring side | Partner job |
  |---|---|---|---|---|---|
  | 1 | Went around me to the candidate or the client | 3.1–3.6 | yes | yes | — |
  | 2 | Used what I shared for something else | 2.1, 2.2, 2.4–2.6 | yes | yes | — |
  | 3 | Shared my information outside their organization | 2.3 | yes | yes | — |
  | 4 | Didn't report a hire, or didn't pay my share on time | 6.3, 6.4, 6.6 | yes | — | — |
  | 5 | False or forged information (candidate never agreed, fake confirmation, false evidence or hire report) | 4.1–4.3, 4.8 | yes | yes | yes |
  | 6 | The job or its terms aren't real or honest | 4.4–4.7, 6.1, 6.5 | yes | — | yes |
  | 7 | Discrimination | 5.1, 5.2 | yes | yes | yes |
  | 8 | Retaliation, public accusations or a bad-faith report | 7.1, 8.5 | yes | yes | yes |
  | 9 | Something else | — | yes | yes | yes |

  - **Filtering:** the server derives the reporter's side and the UI shows only the categories for that context (9, 7 or 5 options). The server accepts any of the 9 values.
  - **"Use the right tool" block** above the categories links the flows that already exist for position, hire and amount questions (prior-presentation claim or contest, hire report, placement dispute) and says unresponsiveness isn't reportable. Category 4 stays because a **pattern** is conduct; the form says the report doesn't decide money (PD-053.2, rule 7.5).
  - **The "possible 9.4" marker is admin-only.** Categories 3 and 5 (reporter or admin label) carry it and sort first in the admin queue. No reporter-facing surface reveals it (R-1).
  - The category is the reporter's label. The admin records its own category at triage (BR-20). The finding cites rule numbers from the version chosen in the notice (BR-21).
- **BR-18 Storage (rev. 2, N10-D14).** A conduct case is a row in the closed `app.conduct_cases` table (reporter org and user, reported org, the referral or job reference, or none for admin-initiated cases). **There is no `public.disputes` row.** All content (category, description, files, notices, responses, messages, decisions) lives in closed `app.conduct_*` tables in the non-exposed `app` schema and is read only through RPCs. Platform admins see conduct cases in `/admin/disputes` next to placement and prior-presentation disputes, through an admin-only list RPC, with the same filters and counts (spec AC-139). The reporting side reads its own report, status and outcome through an RPC that returns its own content only (BR-15 readers).
- **BR-19 Isolation from the other dispute rules (security constraint).** A conduct case **is not an open dispute** for any other rule. With BR-18 storage this holds by construction, and no existing "open dispute" check changes. QA still proves it:
  - not for `app.disputes_open_guard` or the one-open-dispute-per-referral index;
  - not for the N1 release guard (N1 BR-25 c);
  - not for objection or contest eligibility;
  - not for the X11 access-expiry pause;
  - not for anything in N3.

  It can coexist with a prior-presentation or placement dispute on the same referral. Otherwise the reported side could detect a report (a hidden release option, a refused contest) and a report could be used to block a partner.
- **BR-20 Triage and first response (rule 8.4).** The queue shows a **first-response target** of 2 business days after filing (N1 helper, stored when filed). Before the first response the admin sets the **admin category** (same 9-value enum, prefilled with the reporter's). Both labels show to admins; the reporter never sees the admin category. The §4 "by category" metrics and the RD-039 / RD-040 / RD-043 signals use the admin category; the reporter's label feeds the "closed at triage" and relabel signals (RD-044). The first response is one of:
  - (a) send the notice (BR-21);
  - (b) ask the reporter for more information (in-case message, reporter-only);
  - (c) close without a finding, with a reason the reporter sees (no rule engaged, a money amount belongs to a placement dispute or rule 7.5, a duplicate case).

  There's no automatic action when the target is missed. It's measured (§4).
- **BR-21 Notice to the reported org (rules 8.3, 9.3).** The admin writes the notice from a template:
  - the **rules version** and the rule(s) cited from it (N10-D21). The picker defaults to the version **in force on the alleged conduct date** (the date the admin enters in the notice, prefilled from the report's "when", otherwise the filing date). The admin can choose another published version that was in force during the alleged period. The composer shows whether the reported org had accepted the chosen version. One version per notice; the notice stores it;
  - what is alleged and when;
  - an **evidence summary written by the admin**, with candidate and client information kept to what the org needs to respond (8.4);
  - the response deadline;
  - **the fixed possible-outcomes line** (RD-049; words by ux-writer and counsel, ⚖️): "After the response period, we may decide no action, a warning, a network hold, a suspension or termination." It's stored with every notice (standard and immediate-hold; follow-up questions excluded), shown read-only in the composer, and a direct call can't omit or change it.

  The decision on a case may cite **only rules cited in the notice used, from that notice's version** (refused otherwise, `decision_rules_not_in_notice`). New facts or new rules need a new notice.

  The notice **never** includes the raw report, the reporter's files or the reporting user. The reporting org is named only if the admin decides it's needed for a fair response (default: not named).
  - **Deadline:** 10 business days after the notice is sent (N1 helper, stored and frozen, N1 BR-28 pattern).
  - **Delivery:** to the reported org's `org_admin`s, in-app now and by email with N7. It's readable on the Network standing page (BR-32).
- **BR-22 Response.** Any `org_admin` of the reported org can submit **one** response before the deadline: text of 20–8,000 characters plus optional files (same pipeline, admin-only). The admin may ask follow-up questions in the case. A follow-up gets a deadline only if the admin sets one, at most 10 business days. With no response by the deadline, the admin decides on the record (rule 7.2).
- **BR-23 Outcome (rule 8.4).** The admin records one of:
  - **no breach**;
  - **not enough evidence**;
  - **breach found**, with a written finding citing rules (BR-21 subset), an optional "residual test (7.4)" flag (RD-037), and a sanction (BR-26).
    - **No sanction level** is allowed only for a first minor breach, recorded as a finding with no level (N10-D7). The database refuses it when the org has, in the last 12 months, any non-overturned sanction or breach finding (with or without level). "Minor" is the admin's judgement, open to review (N10-D24).

  **The reported org** gets the full finding, any sanction and the residual-test flag when set (N10-D25). Deciding and reviewing admins aren't named to the org: "a Workatent platform admin" / "a different platform admin" (N10-D28).

  **The reporter gets the outcome category only, four outcomes (RD-045):**
  1. **Action taken:** breach found, with or without a level.
  2. **No breach found.**
  3. **Not enough evidence to act**, with "you can file a new report if you have new evidence".
  4. **Closed without a finding**, with the BR-20 c reason.

  - Never shown to the reporter: the level, the finding text, the response, or whether a review was requested.
  - Every outcome screen says the report doesn't change the referral, first position or any amount owed, and links the referral's tools.
  - If a review changes the outcome **category**, the reporter's outcome updates with a no-detail notification. A review that only reduces the level changes nothing for the reporter.
  - Reporters have no review right; new evidence means a new report.

  **2.3 incident notice (RD-045, ⚖️ C-4).** On a "breach found" decision citing rule 2.3, the admin can send a **factual incident notice** to affected organizations: which referral(s), what information, when, to whom if known, and the fixed guidance that revoking authorization stops access while releasing gives up first position.
  - **Recipients:** orgs the admin selects from the parties of the referrals named in the finding, never the sanctioned org. Delivered to each recipient org's `org_admin`s (in-app now, email with N7), readable only by them (N10-D26). Non-recipients get not-found.
  - **Never contains:** the sanction, the outcome label or the reporter's identity. The notification carries no detail (BR-39). Audited.
  - Not offered on decisions that don't cite 2.3. Whether Workatent itself must notify the CAI or individuals is counsel's (C-4), outside the product.
- **BR-24 Admin-initiated cases.** A platform admin can open a conduct case against an org with no report, for example a confirmation found invalid under RD-029 or an objection found fabricated in an N1 dispute (N1 BR-18). It follows the same notice, response, decision and review steps.
- **BR-25 Abuse limits.** At most 5 reports per user and 10 per org per rolling 24 hours **[estimate]**. Admins see, per org, its reports closed as "no breach", as a bad-faith signal (8.5). A bad-faith finding is a separate case against the reporter's org (category 8, "retaliation, public accusations or a bad-faith report"), never automatic.

### E. Sanctions (rules 9.1–9.7)

- **BR-26 Levels and their effects** (all on the org file, BR-32):
  1. **Warning:** no product effect. Active for 12 months (rule 9.2), then shown as expired.
  2. **Network hold:** restriction reason `network_hold` (BR-12 to BR-14), and the Verified badge is removed (rule 1.6, with N5). It lasts until an admin lifts it. The admin may set a planned review date (informational).
  3. **Suspension:** `suspended_at` plus settlement mode (BR-33).
  4. **Termination:** new `terminated_at` (which also sets `suspended_at`, so every existing suspension check covers it) plus settlement mode until settled (BR-37). Reapplication waits 12 months (rule 9.7, enforced by N5).

  **Lifting:** a warning expires; a hold or suspension is lifted by any platform admin with a reason (BR-29). A **termination** can change through the review (BR-31) or, to correct an error found later, be lifted by a platform admin **other than the one who decided it**, with a required reason, audited (N10-D29). On lift, matching is re-queued and the "no longer part of" sentence stops.
- **BR-27 Prior notice is enforced (rule 9.3).** A sanction can be recorded only on a conduct case where the BR-21 notice was sent **and** either the response was submitted or the deadline has passed. The sanction RPC checks this in the database. The only exception is BR-28.
- **BR-28 Immediate hold (rule 9.4, closed list).**
  - **Grounds:** an admin can apply a network hold without prior notice **only** on ground `2.3` (shared outside the org) or `4.8` (forged evidence or false candidate confirmations). The ground is a closed enum, and any other value is refused.
  - **Notice in the same transaction:** the RPC creates the hold **and** the written notice (BR-21 content including the fixed possible-outcomes line, plus "immediate hold under rule 9.4") together. The org is therefore notified at once, within the 1-business-day promise by construction. The 10-business-day response window starts then.
  - **After the window,** the admin records the decision: lift, keep the hold, change it to a warning, or escalate to suspension or termination. Escalation on the same notice is allowed when the facts and rules are the ones in the notice **and** the notice carries the possible-outcomes line (RD-049). New facts or rules need a new notice; the hold can stay meanwhile (N10-D8 as amended).
  - **Not on an org already restricted by a sanction (N10-D16):** the RPC refuses (`org_already_restricted`) when the org has an active network hold (immediate or decided), is suspended or is terminated, and the UI hides the action. The admin sends a standard notice (BR-21) on the new case instead; the existing effect stays. An org restricted only for `rules_not_accepted` (or N5 `network_pending`) can receive an immediate hold, since that isn't a sanction and would lift on acceptance.
  - **Overdue flag (Should, RD-049):** see §5 Should.
  - An immediate **suspension** doesn't exist.
- **BR-29 Suspension goes through the ladder.** `set_organization_suspension` is **dropped** (execute revoked, function removed, removed from the api-surface allow-list, `setSuspension` / `SuspendButton` deleted). It isn't kept as a service-role operator tool, because that would be the emergency lock U-N10-3 ruled out (N10-D15). Suspension and termination are recorded only through the sanction RPC (BR-27 and BR-28 apply). Lifting any sanction requires a reason and is audited (termination: BR-26). **No emergency lock outside the ladder in v1** (U-N10-3). For a compromised account, the admin deactivates the individual membership (existing `membership_status`), which isn't a sanction.
  - **Legacy suspensions (N10-D30):** an org suspended before N10 (`suspended_at` set, no sanction record) shows on the admin org page as "Suspended (before N10)" with **Lift…** only. It gets settlement mode like any suspended org. No sanction record is fabricated, so it doesn't count under 9.2 and can't be escalated without a new case and notice.
- **BR-30 Choosing the level (rule 9.2)** is the admin's judgement. The decision form shows the org's active warnings and its sanctions from the last 12 months. Choosing **suspension or termination** requires a short statement of **why a network hold isn't enough** (the §4 metric). No automatic escalation.
- **BR-31 Review (rule 9.6).**
  - **Who can request it:** an `org_admin` of the sanctioned org, **once per sanction decision**, within **10 business days** of the decision notice (stored deadline), with text and optional files. A **"breach found, no level"** finding is also reviewable, because it goes on the record (N10-D27). "No breach" and "not enough evidence" outcomes have nothing to review.
  - **Who reviews:** a **platform admin different from the deciding admin.** The database refuses when `auth.uid()` equals `decided_by`, and also when it's the admin who applied the immediate hold.
  - **Outcomes:** **confirm**, **reduce** (lower the level or lift) or **overturn** (effect lifted, entry marked overturned and excluded from 9.2 counting). A review can **never increase** the level.
  - **During the review:** the sanction stays in effect. Target: 10 business days (measured). With no second active platform admin, the case shows "needs a second admin" (launch checklist: two admins).
  - **Scope:** the response window is how an org answers an immediate hold. The review covers the decision taken after that window (N10-D9).
- **BR-32 Network standing page** (`org_admin` of the org, plus platform admins). It shows:
  - active and past sanctions (warnings with their 12-month expiry);
  - notices, deadlines (date and time "ET" plus business days left, N1 pattern), responses and review status;
  - the "Request a review" action.

  Other members see only the banner (BR-38), with no details. It's available in settlement mode. Platform admins see the same file on `/admin/organizations/[orgId]`, alongside the existing details.

### F. Settlement mode (rule 9.5): option (a) in full (decided, PD-058)

Backend estimate EC-1: 3.75 engineering days with a separate "settling member" helper used only by the referral-visibility functions and about 12 named spots; `app.is_member` is unchanged, so everything not listed stays closed by default. Fallback (b) is dropped and rule 9.5's text stands.

- **BR-33 Principle.** While an org is suspended or terminated, its active members can still sign in and open it in **settlement mode**, instead of getting not-found. The org reappears in their org switcher with a "settlement mode" marker. RD-036 record scope still applies (a plain recruiter sees only their own records).
- **BR-34 Available in settlement mode** (scope: records **in progress or with an open obligation** only, as defined in BR-37; **closed referral and placement history is not available**, N10-D31):
  1. Referrals in progress, or with open obligations, on either side: read, messages and every action in BR-13, including interview and offer (RD-047), hire reporting (rule 6.4), objections and contests, release, withdraw. Worked from the Referrals list and the referral page; the pipeline board is not available (N10-D32). When an action closes a referral with no remaining obligation, it leaves the list; the UI confirms that it's closed and no longer shown in settlement mode. Records for the org's own books (past payouts) go through support.
  2. Commissions and placements: invoices, payment evidence, payout confirmation, refunds, and existing guarantee steps.
  3. Disputes on those referrals and placements: respond and contest.
  4. Network standing: read notices, respond, request a review. Conduct reports on in-flight referrals (BR-15), and reading the org's own reports.
  5. The rules versions page and accepting the rules (BR-7). Own profile, sign out.
  6. Team: read the list, and deactivate a member (security hygiene). Deactivating oneself or the last active `org_admin` is refused. No invitations or role changes.
- **BR-35 Not available:** candidates (list, create, edit, import, documents outside in-flight referrals), jobs (create, edit, open to partners), opportunities and matching, AI features, imports and exports, connectors and API keys (the API refuses), invitations, and settings edits. Routes outside BR-34 show a settlement-mode page, not a broken screen.
- **BR-36 Enforced in the database, not only in routes.** Candidate, job and matching data stay closed to a suspended org exactly as today. The BR-34 surfaces open only for in-flight records. Anything not listed is denied by default. `getRequestContext` exposes the mode so pages and actions can refuse early, but RLS and RPCs are the real gate (EC-1).
- **BR-37 End of settlement mode.**
  - **Suspension lifted:** normal access.
  - **Terminated org:** settlement mode lasts until it has no open obligation. After that its members lose access, as today, and BR-14's "no longer part of" sentence applies. Platform admins see the remaining obligations list on the org page. Retention of the org's data afterwards is a counsel item (C-4).
  - **Open obligation (N10-D33)**, on either side of the org:
    - a referral in a non-terminal status;
    - a placement not `settled` or `cancelled` (hire reported, invoiced, payment partially verified, commission payable, disputed);
    - a placement **still inside its guarantee** (`guarantee_until` ≥ today), **even if already settled**: a refund or replacement can still be owed (rule 9.5 "until each referral and placement is settled"; rule 3.3 runs through the guarantee, PD-054);
    - an open dispute or claim on any of those.
  - **Stale referrals, terminated orgs only (RD-047, N10-D34):** on the remaining-obligations list, a platform admin can **close an in-flight referral as `cancelled`** when it has had no stage change, message or event for **60 days [estimate]**. A reason is required, it's audited, and both sides see the status change (the partner's timeline names no termination). The sourcing side's ownership window and first position are unchanged (rule 6.3). Not automatic, and not available for suspended orgs (their access ends at lift). A direct call on a referral inactive for less than 60 days, or of a non-terminated org, is refused.
- **BR-38 Banners** (ux-writer owns the words):
  - **held org:** what's blocked and what continues;
  - **`rules_not_accepted`:** accept to resume partner activity;
  - **per user:** accept to submit or open jobs;
  - **settlement mode:** what you can still do, and that your obligations continue (9.5).

  Org admins get a link to Network standing. Partners see only BR-14.
- **Fallback (b):** dropped. EC-1 came in at 3.75 days, under the bar (PD-058).

### G. Notifications and audit

- **BR-39 Notifications** (in-app in this release, each a distinct `kind` with PII-free params, PD-026; emails with N7). They go out when:
  - a version is published (all members);
  - an effective date is reached without acceptance (that org's `org_admin`s and the members who haven't accepted);
  - a report is received (confirmation to the reporter);
  - a notice is sent (the reported org's `org_admin`s);
  - an immediate hold is applied (the reported org's `org_admin`s);
  - a response arrives (admin queue);
  - an outcome is recorded (both sides), or a review changes the reporter's outcome category (reporter, no detail);
  - a 2.3 incident notice is sent (the recipient orgs' `org_admin`s, no detail);
  - a sanction is applied or lifted (the org's `org_admin`s; members get the banner);
  - a review is requested or decided.

  **Notifications never contain allegation text**: they link to the Network standing page or the report, because emails get forwarded.
- **BR-40 Audit.** Every step is audited: publish, acceptances, report filed, triage action, notice, response, decision, sanction applied or lifted, hold applied, review requested or decided, settlement-mode entry and exit.
  - **In the reporting org's audit**, the only event is `conduct_report.filed` (case id).
  - **In the reported org's audit**, events start when the notice is sent and **never** carry the reporter's user, org, report text or category.
  - Triage events are admin-only (org null). All metadata stays PII-free.

### H. Security and privacy

- **BR-41 Tenant isolation.** Every new RPC is `SECURITY DEFINER` with `search_path = ''`, re-checks membership and role, and takes the org from the server context, never the client. IDs from the URL are re-resolved. New tables are closed by default, with minimal grants. New RPCs go on the `tests/integration/api-surface.test.ts` allow-list. Admin-only RPCs check `app.is_platform_admin()` in the database.
- **BR-42 No leakage to partners.** No partner-facing view, RPC, matching explanation, notification or `job_hidden_reason` returns the hold or restriction reason, warnings, sanctions, conduct cases, or their existence to another org. A held job is indistinguishable from any other hidden job, except for the BR-14 sentence.
- **BR-43 Reporter identity and files.** The reporting user and org are visible to platform admins only (BR-21 exception: the admin may name the org), plus the reporting org's own `org_admin`s for their org's reports (BR-15). Report files and response files are admin-only: 60-second signed URLs, audited access. The reporter sees file names and sizes only, never a download. This extends the PD-024 admin-access exceptions in `security-and-privacy.md`. Candidate and client personal information in attachments is accepted as necessary evidence, with Canadian storage and audit.
- **BR-44 Retention.** Rules versions and acceptances are kept for as long as the org exists, plus the limitation period. Conduct cases, files and sanctions are **kept with no automatic purge in v1**. The retention period is a counsel decision (U-N10-5, ON 2 years and QC 3 years limitation periods). The N7 PIA lists the new tables and files.

## 7. Constraints

- **Security:** BR-41 to BR-43. QA must show that direct PostgREST calls can't:
  - submit or open to partners while restricted;
  - record a sanction without a notice;
  - use any other immediate-hold ground;
  - review their own decision;
  - read conduct rows or content as a non-admin (including the reported org and the reporter's other members, through `disputes` or `audit_events`);
  - re-publish or edit a published version.
- **Privacy:** reporter identity, report text and files never reach the reported org. Partners learn nothing beyond BR-14. Update `docs/security-and-privacy.md` (admin access to conduct files, reporter-identity handling, residual R-7) and `docs/domain-model.md` (versions, acceptances, restriction states, conduct cases, sanctions, `terminated_at`, settlement mode).
- **i18n:** everything in en / fr-CA / pt-BR. Glossary §5.7 (conduct report / signalement / relato de conduta, network hold / restriction réseau / restrição de rede, and so on). The rules text is versioned per locale (BR-1). French first for Québec (BR-10). Admin-written notices are free text in the admin's chosen language. For Québec orgs: French, or bilingual (Should, C-5).
- **Accessibility:** WCAG 2.2 AA. The acceptance screen is fully keyboard-operable, the rules text is readable at 375px, and the acceptance control isn't pre-ticked. Deadlines are shown as a date and time with "ET" plus "N business days left". Banners have an icon and text (never colour only). Status changes are announced. Targets are 44px.
- **Copy:** no claim that Workatent decides money or ownership in law (PD-053.2). Notices are factual (rule, facts, evidence summary). Partners get only BR-14. Legal-nature strings (acceptance statements, notice templates, settlement-mode text) ship as drafts pending counsel.

### 7.1 Engineering constraints

| # | Constraint | Why |
|---|---|---|
| EC-1 | **Settlement mode, decided (rev. 2):** option (a) in full, approach (i) from `backend-estimate.md` §1: a separate "settling member" helper in the two referral-visibility functions plus the ~12 named spots; `app.is_member` unchanged; routes default-deny with an explicit opt-in list in `backend.md`. Estimate 3.75 d against a 4-day bar (0.25 d margin). If the build overruns, the backend reports to the PM before trimming anything; no silent narrowing of BR-34. | `is_member` gates almost every policy. This is the riskiest part of N10. |
| EC-2 | **One restriction predicate** (BR-12) used by `app.job_partner_visible`, `job_hidden_reason`, both submit RPCs, internal referrals and matching. Delivery doesn't use it (BR-13). If N5 defines `network_pending` first, extend that predicate, don't add a second one. The backend chooses hiding or expiring-and-recomputing matches, but matches must come back after a lift. | No duplicated checks that can drift. |
| EC-3 | **Conduct cases entirely in closed `app.conduct_*` tables, no `public.disputes` row (rev. 2).** No existing dispute constraint, index, guard or metric changes; `/admin/disputes` merges the admin list RPC (BR-18, BR-19). Future features that add "open dispute" checks (N3) need no conduct exclusion. | Leak and weaponisation, removed by construction. |
| EC-4 | **Rules text and SHA-256 stored in the database at publication.** Immutable, no update or delete. | Acceptance proves the exact text. |
| EC-5 | **Reviewer ≠ decider, and the closed immediate-hold enum, checked in the database.** | Rules 9.4 and 9.6 must hold against direct calls. |
| EC-6 | **Deadlines computed and stored when the clock starts** (first response, notice response, review request), with the N1 business-day helper. | N1 BR-28 pattern; the holiday table can change. |
| EC-7 | **`getRequestContext` exposes the org's restriction reason (own org only), the user's acceptance state and settlement mode.** The UI never derives them client-side. `listMemberships` includes settlement-mode orgs. | Pages and actions refuse early. The DB is still the gate. |
| EC-8 | **`docs/architecture.md` updated** if the worker scans and hashes conduct files (a new service-role use). | Service-role policy. |

## 8. Acceptance conditions (rules promises, PD-055)

These are the conditions under which the rule sentences can be published. Each must map to at least one AC in `spec.md` and pass in `qa-report.md`.

| Rule | Promise | Condition the product must meet | BR |
|---|---|---|---|
| **8.1** | "Report it from the referral or the job ('Report a problem')" | "Report a problem" works from the referral (both sides) and the partner job, and creates a `conduct` case in `/admin/disputes`. The interim support sentence can then be dropped, except for reports with no context. | BR-15 to BR-18 |
| **9.1 (level 2)** | "You can't open jobs to partners, submit referrals or accept new ones. Referrals in progress continue. Partners see only that you aren't taking new referrals." | Held org: jobs hidden, both submit paths and internal referrals refused, nothing can reach its jobs. Every BR-13 action works on referrals submitted before the hold, on both sides. Partners see only the BR-14 sentence, with no reason anywhere (UI, API, notifications). | BR-12 to BR-14, BR-42 |
| **9.4** | "Only two situations allow an immediate network hold without prior notice … We notify you within 1 business day, and the 10-day response window starts then." | The immediate-hold RPC accepts only `2.3` / `4.8`. The notice is created in the same transaction, and the response deadline is 10 business days from it. Every other sanction is refused without a prior notice plus a response or a passed deadline. | BR-27, BR-28 |
| **9.5** | "During a hold or suspension, your obligations continue … After termination, these obligations still apply until each referral and placement is settled." | Option (a): a suspended or terminated org can record hires, invoices, payment evidence, payout confirmations and refunds, answer disputes and use referral messages on in-flight records, and can't do anything else. A terminated org keeps this until settled (open obligations per BR-37). | BR-33 to BR-37 |
| **9.6** | "You can ask for one review of a sanction within 10 business days. A different platform admin reviews it." | One review per decision (a no-level breach finding included). The request deadline is stored. A review by the deciding admin is refused in the DB. A review can't increase the level. | BR-31 |
| **10.1** | "The current version and a summary of changes are always available on Workatent." | The versions page shows the current version, the upcoming one and the history with summaries, in every org state, including settlement mode. | BR-4 |
| **10.2** | "For material changes, we give 30 days' notice, and your organization admin and every member must accept the new version." | A material version can't take effect sooner than 30 days (unless `legally_required` with a reason). Banner and notification at publication. Org acceptance and member acceptance are recorded separately. | BR-3, BR-5, BR-8 |
| **10.3** | "If your organization hasn't accepted by the effective date, it can't start new partner activity until it does. Referrals in progress continue." | After `effective_at`, an org without org acceptance gets `rules_not_accepted`, with the same effects as a hold and no file entry. In-flight work continues. An `org_admin` accepting lifts it immediately. Members who haven't accepted personally can't submit or open jobs. | BR-9, BR-12, BR-13 |
| 10.6 (product part) | "In Québec, the French version is offered first." | The acceptance screen and versions page open in French for Québec orgs, a language switch is available, and the locale shown is recorded. | BR-10 |

## 9. Risks and open questions

### 9.0 Rev. 2 answers to the open questions (logged as PD-058)

No open PM question remains. Each answer is folded into the BR cited.

| # | Question (source) | Answer | BR |
|---|---|---|---|
| N10-D13 | First-access gate in the DB for all writes, or actions + partner RPCs only? (backend Q1) | **Full DB gate** for every authenticated write, with a closed exempt list. Security is a hard constraint; 0.75 d isn't worth a write residual. | BR-7 |
| N10-D14 | Conduct cases in separate `app.conduct_*` tables, no `public.disputes` row? (backend Q2, spec PM item) | **Yes.** BR-18 rewritten. Same admin queue; isolation by construction; 0.5 d cheaper. | BR-18, BR-19, EC-3 |
| N10-D15 | Drop `set_organization_suspension` or keep it for operators? (backend Q6) | **Drop.** A service-role suspend is the emergency lock U-N10-3 ruled out. If counsel asks for a carve-out, it comes back as a ladder-aware design. | BR-29 |
| N10-D16 | Immediate hold on an org already held or suspended? (backend Q7, spec PM item) | **Refuse** (`org_already_restricted`) on an active hold, suspension or termination; the UI hides it. Use a standard notice instead. Allowed on `rules_not_accepted` / `network_pending`. | BR-28 |
| N10-D17 | Does the first-access gate apply in settlement mode? (backend Q5, spec PM item) | **Yes**, and accepting is available there. Only re-acceptance is waived (BR-9 c). | BR-7, BR-9, BR-34 |
| N10-D18 | Must an `org_admin` whose org hasn't accepted tick both statements at the gate? (Q-D1) | **Yes**, two separate unticked checkboxes, both required. In settlement mode only the personal one. Counsel C-1 confirms. | BR-7 |
| N10-D19 | Québec detection at onboarding? (Q-D3) | UI locale `fr` → fr-CA first; N5 province field once it exists. | BR-10 |
| N10-D20 | Per-user restriction on "open to partners"? (Q-D4) | Refuse only the transition to open (or creating an open job), code `rules_acceptance_required`. Edits to already-open jobs allowed. | BR-9 |
| N10-D21 | Which rules version does a notice and a finding cite? (Q-D2, BR-17 vs BR-21) | **The version in force on the alleged conduct date** (default; admin can pick another version in force during the period; the org's acceptance of it is shown). One version per notice; the decision cites only that notice's rules. BR-21's "current version" wording was wrong. | BR-17, BR-21 |
| N10-D22 | Report on internal referrals between related orgs? (Q-D7) | **No.** Support covers exceptions. | BR-15 |
| N10-D23 | Who reads a report on the reporting side; what if the reporter leaves? (Q-D6) | **The reporting user and the reporting org's `org_admin`s.** Access follows membership of that org; the report stays with the org when the reporter leaves. Changes the spec default (reporter-only, cross-org). | BR-15, BR-43 |
| N10-D24 | "No sanction only for a first minor breach": DB or UI? (Q-D5) | **DB enforces the objective part:** refused if the org has a non-overturned sanction or breach finding in the last 12 months. "Minor" is admin judgement, reviewable. | BR-23 |
| N10-D25 | Does the reported org see the residual-test (7.4) flag? (Q-D11) | **Yes.** The org needs the basis of the decision to use its review. Counsel may adjust wording (C-3). | BR-23 |
| N10-D26 | Incident notice to `org_admin`s only, or also the referral's owner? (Q-D17) | **`org_admin`s only** (smallest slice; founding orgs are small). Revisit if a recipient misses one. | BR-23 |
| N10-D27 | Review of a "breach found, no level" finding? (Q-D12) | **Yes.** It goes on the record. Product exceeding the 9.6 sentence doesn't make it untrue; the ux-writer may propose "a sanction or a breach finding" for the rules draft under P0-1. | BR-31 |
| N10-D28 | Show the reviewing admin's name to the org? (Q-D13) | **No**, and not the deciding admin's either: "a Workatent platform admin" / "a different platform admin". | BR-23 |
| N10-D29 | Lift a termination outside a review? (Q-D14) | **Yes, only to correct an error**, by a platform admin other than the decider, with a reason, audited. Otherwise a wrongful termination found after the review window could only be fixed by an unaudited DB edit. | BR-26 |
| N10-D30 | Orgs suspended before N10? (Q-D15) | "Suspended (before N10)" with **Lift…** only; settlement mode applies; no fabricated sanction record. | BR-29 |
| N10-D31 | Settlement mode: closed history? (backend Q3, spec PM item) | **No closed history.** In-flight and open obligations only (BR-36, data minimization). Book-keeping records via support. | BR-34 |
| N10-D32 | Pipeline board in settlement mode? (Q-D10) | **Hidden.** Referrals list and referral page cover in-flight work. | BR-34 |
| N10-D33 | Open-obligation definition; is a settled placement still in guarantee an obligation? (backend Q4) | **Yes, it is.** Definition in BR-37 (non-terminal referral; placement not settled/cancelled; placement in guarantee even if settled; open dispute or claim). | BR-37 |
| N10-D34 | Stale-referral close for terminated orgs (RD-047) | Admin action on the obligations list, 60 days **[estimate]** of inactivity, reason required, window unchanged. | BR-37 |
| N10-D35 | Reporter downloads own files? (Q-D8) | **No.** Names and sizes only. | BR-43 |
| N10-D36 | Markdown renderer for the rules text? (Q-D16) | Frontend's choice, with constraints: raw HTML disabled, links limited to `https:` / `mailto:` with `rel="noopener noreferrer"`, no new dependency if a small safe option exists, noted in `frontend.md`. | BR-4 |
| N10-D37 | Strategist decisions RD-044 to RD-049 | **Adopted.** 9 context-filtered categories + admin category (BR-17, BR-20); 4 outcomes + incident notice (BR-23); in-flight continuity confirmed (BR-13, BR-34); stale close (BR-37); RD-048 approved by the founder (PD-057, BR-14); fixed possible-outcomes line and notice-bound decision rules (BR-21, BR-28). N10-D8 is amended: same-notice escalation needs the outcomes line. | as listed |
| N10-D38 | Follow-ups from the strategist | R-5 corrected (§9.5). Overdue immediate-hold flag is a **Should** (§5). "Pause received shared profiles" on a 2.3 finding goes to the **X11** backlog (roadmap). | §5, §9.5 |

**Backend scope delta.** The designer's estimate of the new scope from RD-044 to RD-049 is about +1 day (admin category, incident notice, stale close, outcomes line and rule check, `no_longer_member`). Add N10-D23, D24, D29 and the version picker (small). The backend re-estimates at build start; expected total about 16.5 d, inside the 14–18 d range. No change to the 4-day settlement bar.

### 9.1 PM decisions taken in this brief (logged as PD-056)

| # | Decision | Why |
|---|---|---|
| N10-D1 | Settlement mode (a) is the plan, subject to the EC-1 bar (≤ 4 days). Fallback (b) only with the user's approval of the 9.5 text. | Rule 9.5 is a promise to partners who are owed money. (b) puts admins in members' money records (PD-055). |
| N10-D2 | Member acceptance is per user × version, valid in all the user's orgs. Org acceptance is per org × version, by an `org_admin`. | Rule 1.1 has two distinct acts. Multi-org users shouldn't accept the same text twice. |
| N10-D3 | First access is a hard gate. After a new version's effective date, a member who hasn't accepted loses only the partner actions (submit, open to partners), not in-flight work. | A hard gate on re-acceptance would stall partners' in-flight referrals, which contradicts 10.3's "in progress continue". |
| N10-D4 | "Accept new ones" (9.1) means no new referral can reach the org. Referrals submitted before the hold, including `awaiting_candidate`, continue in full, and the held org can review and accept them. | "In progress" starts at submission (glossary). Blocking review would punish the partner. Strategist confirmation, S-N10-3. |
| N10-D5 | One restriction mechanism and one partner-facing sentence for hold, rules gate, suspension, termination and network pending. | Least leakage. One predicate to test. |
| N10-D6 | Notices are written by the admin, never the raw report. The response clock starts when the notice is sent. | Triage protects against weaponised reports (R-1). Rule 8.4 asks us to share what the other side needs and protect candidate and client data. |
| N10-D7 | A "breach found" with no sanction level is allowed only as a recorded finding (first minor breach). | Proportionality (9.2) without inventing a fifth level. |
| N10-D8 | After an immediate hold, the decision can escalate on the same notice if the facts and rules are unchanged **and the notice carries the fixed possible-outcomes line** (amended in rev. 2, RD-049). | The notice already met 9.3. A second 10-day wait would add no fairness. |
| N10-D9 | A review covers the decision taken after the response window. The response window is how an org challenges an immediate hold. | One clear path per step. |
| N10-D10 | `set_organization_suspension` leaves the UI. No emergency lock outside the ladder in v1. Compromised accounts are handled by membership deactivation. | 9.4's closed list. U-N10-3 can reopen it. |
| N10-D11 | Conduct cases are invisible to every other dispute rule (BR-19). | Otherwise a report leaks (hidden release option) and can block a partner. |
| N10-D12 | The reporter learns the outcome category only. | 8.4 says "we tell both sides the outcome". Sanction details belong to the sanctioned org. Strategist confirmation, S-N10-2. |

### 9.2 Questions for the recruitment-strategist: all answered

Answered in [`recruiting-input.md`](recruiting-input.md): S-N10-1 → RD-044, S-N10-2 → RD-045, S-N10-3 → RD-046, S-N10-4 → RD-047, S-N10-5 → RD-048 (founder-approved, PD-057), S-N10-6 → RD-049. Folded in by N10-D37. The table below is kept for the record.

| # | Question | PM default |
|---|---|---|
| S-N10-1 | Final conduct-report categories and their rule mapping (BR-17). Are 8 too many for a reporter? Should "payout conduct" sit here or only in placement disputes? | The BR-17 list of 8 |
| S-N10-2 | What does the reporter learn of the outcome? Category only, or also "a sanction was applied" or its level? | Category only (N10-D12) |
| S-N10-3 | (a) Confirm the reading of 9.1 "accept new ones" and full in-flight continuity during a hold (N10-D4). (b) For an **immediate hold on ground 2.3** (data shared outside), should the held org also lose access to shared profiles and documents on in-flight referrals it *received*, to contain the leak, even though that slows the innocent partner's referral? Also a Law 25 containment question for counsel. | (a) as written. (b) no automatic freeze; the admin can escalate to suspension after the response window |
| S-N10-4 | During a **suspension**, may the suspended org keep advancing in-flight referrals (interview, offer), or only close and settle (hire report, payouts, decline, withdraw)? | Full in-flight continuity (BR-34), so partners' candidates aren't stranded |
| S-N10-5 | What do partners see for a **terminated** org? The same "isn't taking new referrals right now", or "is no longer in the network"? | The same neutral sentence (BR-14) |
| S-N10-6 | After an immediate hold and the response window, may the admin go straight to suspension or termination on the same notice (N10-D8)? | Yes, if the facts and rules are unchanged |

### 9.3 Needs user decision

All answered: U-N10-1 to U-N10-5 in PD-056 (U-N10-2 is now closed: (a) chosen, EC-1 under the bar), RD-048 in PD-057. Rev. 2 adds no founder decision. The table is kept for the record.

| # | Decision | PM recommendation | Blocks |
|---|---|---|---|
| U-N10-1 | Publish the Network Rules on a **public, logged-out page** (outward-facing; useful in sales)? | Not at launch. Signed-in members and N5 applicants only. Revisit after P0-1 approval. | Nothing (Won't by default) |
| U-N10-2 | **Settlement mode (a) vs admin procedure (b)** for rule 9.5 | (a). Final after the EC-1 estimate. (b) only if (a) breaks the bar, and then you approve the rewritten 9.5 text | Backend scope after day 1 |
| U-N10-3 | An **emergency lock** outside the ladder (security incident, court order) ⚖️ | None in v1. Membership deactivation covers compromised accounts. Ask counsel whether the 9.4 closed list needs a "legal or security necessity" carve-out | Nothing for the build |
| U-N10-4 | Optional ~150-word non-binding **rules summary** on the acceptance screen ⚖️ (already on the roadmap) | Yes if counsel confirms it can't be read as changing the rules. It shortens a ~9 to 12-minute read | Acceptance-screen copy only |
| U-N10-5 | **Retention** of conduct cases, files, notices and sanctions ⚖️ | No purge in v1. Counsel sets the period against limitation periods (ON 2 years, QC 3 years), in the N7 PIA | Launch (PIA), not the build |
| (existing) | **P0-1** approval of the rules text, and the placeholders (effective date, 6.8, 8.1 address, 7.5, 10.6) ⚖️ | — | Publishing the first real version (launch gate), not the build |

### 9.4 Counsel items ⚖️ (not legal advice; owner: user + counsel, via N7)

| # | Item | Effect on this release |
|---|---|---|
| C-1 | Clickwrap evidence: is version + locale + SHA-256 + timestamp + user enough, without IP or user agent? Can one action record both org and member acceptance? CCQ 1435–1437 (external clauses must be expressly brought to attention; adhesion contract). | Build per BR-5. Adding fields later is cheap. |
| C-2 | Between a new version's effective date and a member's re-acceptance, does the earlier accepted version still bind that member (BR-9 b)? | None. The product blocks partner actions either way. |
| C-3 | Procedural fairness (CCQ 1375): the notice summarises the evidence and doesn't name the reporter or share the files. Is that enough? Is the immediate hold under 9.4 defensible? **Rev. 2 (RD-049):** is the fixed possible-outcomes line on every notice enough to support escalation on the same notice? Wording of the residual-test flag shown to the org; citing a version the org hadn't accepted on the conduct date (N10-D21). | Build per BR-21 and BR-28. The notice template is a draft. |
| C-4 | Law 25 / PIPEDA: conduct files containing candidate or client personal information, admin access, retention, and a terminated org's data after settlement. **Rev. 2 (RD-045, RD-046):** in a 2.3 leak, who is the "enterprise" with Law 25 s. 3.5 / PIPEDA breach duties (sourcing org, hiring org, Workatent)? Must Workatent notify the CAI or individuals itself? Must it pause deliveries to an org under a 2.3 immediate hold on a "reason to believe"? Incident-notice wording. | BR-43, BR-44, BR-23 incident notice (template is a draft). PIA listing. If counsel requires pausing deliveries, it's a scoped follow-up. |
| C-7 | "{Org} is no longer part of the Workatent network." for terminated and exited orgs after settlement (RD-048): any defamation or privacy concern? | BR-14. Ships as a draft string. |
| C-5 | Bill 96: notices and sanction decisions to Québec orgs in French (or bilingual). Which rules version governs (10.6). | Bilingual templates are a Should. Governing version is text only. |
| C-6 | Rule 10.3 "You can leave instead": is a support-handled exit enough without a self-serve flow? | Won't self-serve. Support path in the copy. |

### 9.5 Risks

| # | Risk | Owner | Mitigation |
|---|---|---|---|
| R-1 | Reports used as a competitive weapon. | PM, admins | Admin triage before any notice (N10-D6), bad-faith rule 8.5, rate limits (BR-25), BR-19 isolation, no automatic effects |
| R-2 | The reported org infers the reporter (a referral has two parties). | design, ux-writer | Honest notice on the form (BR-16), retaliation is a breach (7.1), admin decides whether to name the org |
| R-3 | Admin capacity: 2-business-day first response with two admins. | user (ops) | Launch checklist: named conduct-report owners and two admins. Metric §4 |
| R-4 | Settlement mode touches the most-used authorization helper. RLS regression could leak candidate or job data to a suspended org, or break everyone. | eng, QA | EC-1 estimate and approach review. QA regression: suspended org still can't read candidates or jobs; active orgs unaffected |
| R-5 | A data leak continues through in-flight shared profiles during a 2.3 hold, **and no level of the ladder cuts access to received profiles in v1**: settlement mode (BR-34) keeps read access for suspended and terminated orgs, so escalating to suspension contains nothing (corrected in rev. 2, RD-046). | strategist, counsel | Containment happens at the 2.3 breach finding: the incident notice (BR-23) lets sourcing orgs tell candidates, and candidate revocation cuts access at once; the sourcing org can withdraw (keeps first position) or release. Admins triage "possible 9.4" first (BR-17). Suspension or termination stops new activity only. Follow-up: "pause received shared profiles" on a 2.3 finding, X11 backlog. Counsel C-4 decides whether deliveries must pause during a 2.3 hold. Accepted residual: an `awaiting_candidate` referral submitted before the hold can still be delivered during it. |
| R-6 | Re-acceptance friction on every material change. | PM | Restriction only on partner actions, banner for 30 days, median-time metric, Should reminder at day −7 |
| R-7 | Before first acceptance, a user can still read what their role allows via direct PostgREST. | PM | Accepted residual: writes are blocked and the org's acceptance binds its members (1.2). Recorded in `security-and-privacy.md` |
| R-8 | Québec detection relies on locale until N5 adds a province. | design, eng | BR-10 fallback. The language switch is always available. Switch to the province once N5 ships |
| R-9 | Every existing user hits the first-access gate on N10's release day. | PM | Expected (the founding group joins after N10). Seed and demo users get acceptances |
| R-10 | Matches hidden during a hold don't come back after the lift. | eng, QA | EC-2 requirement, QA scenario 14 |
| R-11 | Admins stretch the residual test (7.4) to reopen settled outcomes. | PM | RD-037 hard limits in admin guidance, "residual test" flag, review by a second admin, metric §4 |

## 10. Team plan

**Status at rev. 2 (2026-11-16):** step 0 done (PD-056, PD-057; counsel items pending via N7), strategist done (RD-044 to RD-049), step 1 done (`backend-estimate.md`, spec draft). **Next, in order:**
1. **product-designer** applies the PD-058 spec changes (list in PD-058 "Spec changes") and marks `spec.md` **frozen**. Small, no new flows except the termination lift and the reporting-org `org_admin` view.
2. **ux-writer-marketing** (step 2 below) on the frozen spec; **backend-engineer** (step 3) can start A, B and D now and the rest on the frozen spec, re-estimating the rev. 2 delta first (§9.0) and reporting to the PM if the total leaves the 14–18 d range.
3. Steps 4 to 7 unchanged.

Ordered. Parallel steps are marked ‖. N10's **spec can be written now**. Backend and frontend build **after N5's spec** (shared onboarding surface and the network-pending predicate, roadmap sequencing). If N10's build starts before N5 ships, BR-6 applies to today's onboarding form.

| Step | Agent | Delivers | Depends on |
|---|---|---|---|
| 0 ‖ | **user** | U-N10-1 to U-N10-5 (none blocks steps 1–4). Counsel engaged on C-1 to C-6 via N7. Two platform admins and named conduct-report owners (ops). P0-1 text approval for the first real version (launch, not build). | — |
| 0 ‖ | **recruitment-strategist** | Short `recruiting-input.md` answering S-N10-1 to S-N10-6. Non-blocking: the designer uses the PM defaults, and the answers land before the spec is frozen (step 1 review). | — |
| 1 | **backend-engineer** (day 1) | `backend-estimate.md`: settlement-mode approach and cost against the 4-day bar (EC-1); where the restriction predicate lives and how matches hide and return (EC-2); conduct storage and isolation from existing dispute guards (EC-3); whether a new service-role use is needed (EC-8). The PM then decides (a) / trimmed (a) / (b) (U-N10-2 if (b)). **Done: (a) in full, 3.75 d (PD-058).** | — |
| 1 ‖ | **product-designer** | `spec.md` from the template. Flows and states for: (a) acceptance at joining (org + member statements), first-access gate, new-version banner and acceptance, effective-date restriction (org banner, per-user banner), French-first and language switch; (b) versions page (current, upcoming, history, summaries); (c) admin publish screen (three locales, type, effective date, approval reference, marker refusal); (d) "Report a problem" on the referral (both sides) and on the opportunity detail: categories, attestation, files (N1 upload states), honest-identity note, confirmation and the reporter's status/outcome view; (e) admin conduct queue in `/admin/disputes`: first-response target, triage actions, notice composer (rule picker, evidence summary, deadline), response view, decision form with the ladder, "why not a hold" field, residual-test flag; (f) immediate hold (closed grounds, notice in the same step); (g) Network standing page (org admins), review request, reviewer screen (second admin, "needs a second admin" state); (h) held-org states on jobs (owner-only hidden reason), submit refusal, opportunities empty state; (i) partner view: the BR-14 sentence, and nothing else changes; (j) settlement mode: switcher marker, banner, allowed surfaces, the "not available in settlement mode" page; (k) admin org page: sanction file, remaining obligations for terminated orgs, replacement of the Suspend button. Data & permissions table (what never crosses tenants: reporter, report, files, reasons). ACs mapped to every BR and to each §8 row. Accessibility per §7. | Brief. Strategist defaults |
| 2 ‖ | **ux-writer-marketing** | Final §5 strings in en / fr-CA / pt-BR: acceptance statements (legal draft), versions page, banners, the BR-14 sentence, report form (categories, attestation, identity note), reporter outcome texts, notice and decision templates (legal draft; bilingual Should), settlement-mode copy, notifications (no allegation text). Glossary §5.7. Also: a **publish-ready stripped copy** procedure for the three rules files (no markers), used once P0-1 is approved. Until then the seed uses the drafts with markers stripped. The optional summary if U-N10-4 is yes. | Step 1 spec draft |
| 3 | **backend-engineer** | Per the estimate, EC-1 to EC-8 and rev. 2 (PD-058). Migrations and `backend.md`: rules versions (immutable, SHA-256, publish RPC with marker refusal and notice rules); org and member acceptances; first-access gate in the DB for every authenticated write with the BR-7 exempt list; conduct cases in `app.conduct_*` only (no `public.disputes` row) with admin category, 9-value enum, notice version and rule subset, fixed outcomes line, four outcomes, 2.3 incident notice, reporting-org readers; immediate hold refused on restricted orgs; no-level check; termination lift by a second admin; stale-referral close; `no_longer_member` in the availability RPC; `set_organization_suspension` dropped; the restriction predicate wired into `job_partner_visible`, `job_hidden_reason`, both submit RPCs, internal referrals and matching (hide and restore); `conduct` kind with closed content tables, admin-only RLS, isolation from `disputes_open_guard` / release guard / other open-dispute tests; report RPC (party derivation, rate limits, N1 evidence pipeline); triage, notice, response, decision RPCs with stored business-day deadlines; sanctions table (levels, `terminated_at`, immediate-hold enum, notice in the same transaction, prior-notice check, "why not a hold"); review RPC (reviewer ≠ decider, no increase); settlement mode in RLS and RPCs plus `getRequestContext` / `listMemberships`; `set_organization_suspension` removed from the UI path; notifications (distinct kinds); audit (BR-40 visibility rules); seed acceptances for demo users. Integration tests: cross-tenant, forged direct calls, api-surface, settlement-mode isolation regression, in-flight continuity. Regenerated types. Docs: `domain-model.md`, `security-and-privacy.md`, `architecture.md` if needed. Applied **locally** only (`npm run db:reset` + `npm run db:types`). Hosted push only when the user asks. | Step 1 estimate (data model can start right away). Step 1 spec for contracts. N5 spec (shared predicate and onboarding) |
| 4 | **frontend-engineer** | UI per `spec.md` and `backend.md`: acceptance screens and gate in the workspace layout, banners, versions page, admin publish screen, "Report a problem" on the referral and opportunity detail, reporter status view, admin conduct queue and decision/notice/immediate-hold/review screens, Network standing page, held-job owner states, partner BR-14 sentence, settlement-mode shell (switcher marker, allowed routes, blocked-route page), admin org page changes. All strings via i18n. All states, 375px, light/dark. | Steps 1 (spec), 2 (keys), 3 (contracts) |
| 5 | **qa-engineer** | `qa-report.md`: every AC × role (org_admin, recruiter_manager, recruiter, partner org, unrelated org, anon, platform admin A, platform admin B) × org state (active, `rules_not_accepted`, hold, suspended, terminated-unsettled, terminated-settled). Every BR traced. Every §8 row proven. The §11 scenarios. Forged direct calls. | Step 4 |
| 6 ‖ | **product-designer** → `design-review.md`; **ux-writer-marketing** → `copy-review.md` | Review of the built UI against the spec and glossary, including French-first and the acceptance screen at 375px. | Step 4 |
| 7 | **product-manager** | `acceptance.md` against this brief and §8. Roadmap N10 status. PD-056 logged. Launch-checklist "rules promises" lines ticked or the sentences marked. | Steps 5, 6 |

No agent is skipped: N10 has UI, data, copy, privacy and legal-draft surfaces.

## 11. QA scenarios (each must appear in `qa-report.md`)

**Versions and acceptance**
1. Publish refused when a locale is missing, a text contains `<!--`, `[TODO` or `⚖️`, or a `material` version has `effective_at` < 30 days. `legally_required` with a reason is accepted earlier. A published version can't be updated or deleted via PostgREST.
2. Org creation without acceptance is refused (UI and direct RPC). With acceptance, both records exist with locale and SHA-256 matching the published text.
3. An invited user who hasn't accepted gets the gate on every workspace route, and writing actions or RPCs return `rules_acceptance_required`. After accepting, normal access.
4. Material v2 published: banner, notification, nothing blocked before `effective_at`. After it, an org without org acceptance: jobs hidden from partners (owner sees `rules_not_accepted`), submits refused, in-flight referrals fully workable on both sides. An `org_admin` accepting lifts it immediately. No sanction or file entry is created.
5. After `effective_at`, a member who hasn't accepted v2 (org accepted) can't submit or open jobs to partners, and can still work in-flight referrals and internal records.
6. A Québec org (locale fr-CA) sees French first, switches to English, accepts: the record stores `en`.
7. The versions page shows current, upcoming and history with summaries, including in settlement mode.

**Restriction and hold**
8. Held org: its partner-open jobs vanish from partners' opportunities. A partner opening an old link sees only the BR-14 sentence. Job settings are unchanged, and the jobs come back on lift without reopening.
9. Held org can't submit on either path, an internal referral or the API. A partner's direct submission to the held org's job is refused with the same outcome as any hidden job.
10. A referral submitted before the hold (one `submitted`, one `awaiting_candidate`): the candidate confirms during the hold → delivered. The held org can review, accept, interview, offer and report the hire. The partner can withdraw, release, message and object. Payouts and refunds work.
11. No partner-facing surface (opportunities, referral detail, matching explanations, notifications, `job_hidden_reason` via another org, API) reveals the hold, the reason, warnings or cases.
12. The held org can still report a problem on an in-flight referral.
13. The same BR-14 sentence for hold, rules gate, suspension and termination while settling (byte-identical in each locale), in every state **except** a terminated (or exited) org after settlement, which shows "{Org} is no longer part of the Workatent network." with no cause. An org with no referral on, or live match with, the job gets the generic not-found in both cases.
14. Matches hidden during a hold return (or are recomputed) within one matching cycle after the lift.

**Conduct reports**
15. Report from the referral (each side) and from the opportunity detail: the reported org is derived server-side. Forged `referral_id` / `job_id` of an unrelated org → not found. Self-report refused.
16. File limits and scan gate as in N1. Files are readable by platform admins only, never by the reported org, nor by the reporter's other members via a signed URL.
17. Conduct rows aren't readable from `disputes` by any member, reporter org or reported org. The reporter sees its own report through the RPC only.
18. A conduct case open on a referral doesn't hide the release option, doesn't block an objection, contest or prior-presentation dispute, and doesn't trip `disputes_open_guard`.
19. First-response target stored at filing (business days, holidays skipped). Triage close → the reporter sees the reason.
20. Notice: rule picker and evidence summary. The reported org's `org_admin`s are notified, and the notification carries no allegation text. The notice never contains the report text, files or reporting user. Deadline = 10 business days, stored and frozen.
21. One response only. After the deadline, the response is refused and the admin can decide.
22. Outcome: the reported org sees the finding and sanction. The reporter sees the category only.
23. Audit: the reporter org's audit has only `conduct_report.filed`. The reported org's audit starts at the notice and contains no reporter identity or report text.
24. Rate limit: the 6th report by a user in 24 h is refused.

**Sanctions and review**
25. A sanction RPC on a case with no notice, or before the deadline with no response → refused (direct call).
26. Immediate hold with ground `2.3` or `4.8` → hold and notice created together, response deadline 10 business days. Any other ground (`3.4`, empty, forged) → refused.
27. Suspension or termination without the "why not a hold" statement → refused.
28. Review requested within 10 business days → accepted. A second request → refused. After the deadline → refused. The deciding admin (and the immediate-hold admin) can't review (direct call refused). The reviewer can confirm, reduce or overturn, but never increase. An overturned warning isn't counted.
29. A warning expires from 9.2 counting after 12 months and stays visible as expired.
30. `set_organization_suspension` isn't reachable from the admin UI. Suspending goes through the ladder.

**Settlement mode**
31. Suspended org: members see the org with the settlement-mode marker and can record a hire, invoice, payment evidence, payout confirmation and refund, answer a dispute, message, and respond to a notice or request a review.
32. Suspended org: candidates, jobs, opportunities, imports, AI, API keys and invitations are refused in the UI **and** via direct PostgREST/RPC. Active orgs are unaffected (regression of `is_member` users).
33. Terminated org with one placement in guarantee: settlement mode until it's settled, then not-found. The admin sees the remaining-obligations list.
34. The partner of a suspended org completes its in-flight referral and confirms its payout record without admin help.

**Rev. 2 additions**
35. Report categories per context: 9 (sourcing side), 7 (hiring side), 5 (partner job); a direct call with any of the 9 values is accepted. No reporter-facing surface shows "possible 9.4". The admin must set the admin category before the first response.
36. Every notice (standard and immediate) stores the fixed possible-outcomes line; a direct call can't omit or change it. A decision citing a rule not in the notice, or from another version, is refused.
37. Reporter outcomes: each of the four shows the right text and the "doesn't change your referral" line. A review overturning a decision updates the reporter's category with a no-detail notification; a level reduction doesn't.
38. A 2.3 breach decision lets the admin send an incident notice to selected affected orgs: their `org_admin`s read it; the sanctioned org and non-recipients get not-found; no sanction, outcome or reporter in the notice or notification. Not offered without 2.3.
39. Immediate hold on an org with an active hold, a suspension or a termination → refused (`org_already_restricted`); on an org restricted only for `rules_not_accepted` → allowed.
40. Terminated org: an admin closes a referral inactive ≥ 60 days as cancelled (reason, audit, ownership window unchanged); < 60 days, or a suspended org → refused. A settled placement still in guarantee keeps the org in settlement mode.
41. First-access gate: a direct PostgREST insert or update on a client-writable table, a storage upload and a writing RPC by a user with no acceptance → refused; every exempt-list call works. A member of a suspended org who never accepted can accept in settlement mode, then settle. The reporting org's `org_admin` reads its member's report; a former member can't. A termination lift by the deciding admin → refused; by another admin with a reason → works. `set_organization_suspension` doesn't exist for `authenticated` or the allow-list.

## 12. Definition of done

- Every AC in `spec.md` passes in `qa-report.md`. Every BR-# is traced to at least one test. Every §8 acceptance condition is proven. The 41 scenarios above are covered.
- No open blocker in `qa-report.md`, `design-review.md` or `copy-review.md`.
- EC-1 to EC-8 are implemented and documented in `backend.md`. Settlement mode (a) in full is logged (PD-058).
- `docs/domain-model.md`, `docs/security-and-privacy.md` (reporter identity, admin access to conduct files, residual R-7), `docs/product-flows.md` and `docs/architecture.md` (if there's a new service-role use) are updated. The `api-surface` test is green.
- Legal-nature strings are marked as drafts until counsel signs off (C-1, C-3, C-5). The first real version is published only after P0-1 (launch, not acceptance of the build).
- Roadmap N10 is set to `accepted`. The launch-checklist "rules promises" items for 8.1, 9.1, 9.4, 9.5, 9.6 and 10.1–10.3 are ticked, or the sentences carry "ships with" markers.
