# Network Rules: acceptance, conduct reports and network hold (N10)

Status: **frozen** · 2026-11-16 (PD-058). Changes after this date go through the PM and are logged in the change log at the end.
Slug: `network-rules-enforcement`
Inputs: [`brief.md`](./brief.md) rev. 2 (BRs binding; §9.0 N10-D13 to N10-D38), PD-053 to PD-058 (`docs/product/decisions.md`; N10-D1 to N10-D38 adopted, U-N10-1 to U-N10-5 answered, RD-048 approved in PD-057), Network Rules v1 draft (`docs/content/network-rules/en.md`), voice-and-tone §5.7, N1 spec (`docs/specs/duplicate-prior-presentation/spec.md`) for the evidence pipeline, business-day deadlines and the admin dispute queue.
Owner: Product Designer · 2026-11-15 (draft) · 2026-11-16 (frozen)

> **How to read this spec.** BR-# are the brief's business rules, EC-# its engineering constraints, N10-D# the PM decisions (PD-056, PD-058). This spec doesn't change any of them. Every product question the spec raised is decided (§9). The only open items are copy and counsel items, listed in §9.
>
> **Copy.** §5 is final (ux-writer-marketing, 2026-11-16). Flows, screens and ACs reference its keys; where a sentence is quoted in §2–§7 it's for reading convenience, and the §5 key wins. The keys §9 listed as missing were added on 2026-11-16 (copy-only; see the change log), so every key the flows reference is in §5.
>
> **Strategist answers built ([`recruiting-input.md`](./recruiting-input.md), RD-044 to RD-049).** They replace the PM defaults of brief §9.2. Places that use them are tagged **[RD-04x]**:
> - **RD-044 (S-N10-1):** 9 categories in recruiter language, including a payout-behaviour category. The form shows only the categories that fit the entry point and the reporter's side (5 to 9 options). A "use the right tool" block routes position, hire and amount questions to their own flows. The "possible 9.4" marker is admin-only. The admin records its own triage category, and metrics use it.
> - **RD-045 (S-N10-2):** 4 reporter outcomes. Every outcome screen says the report doesn't change the referral, first position or amounts owed. On a 2.3 breach finding, the admin sends affected orgs a factual incident notice, which never names the sanction.
> - **RD-046 (S-N10-3):** in-flight continuity confirmed, including `awaiting_candidate`. No freeze of received profiles. No sanction level cuts profile access in v1 (settlement mode keeps read access).
> - **RD-047 (S-N10-4):** suspended orgs keep full in-flight continuity. For **terminated** orgs only, an admin can close an in-flight referral that has been inactive for 60 days as `cancelled` (the sourcing side keeps its ownership window).
> - **RD-048 (S-N10-5), approved by the founder (PD-057):** while a terminated org is still settling, partners see the same neutral sentence. After settlement ends, they see the "no longer part of" sentence (`network.partner.noLongerMember`; the same sentence covers voluntary exits). The founder chose its en wording (PD-065) and counsel checks it (C-7); the behaviour is decided.
> - **RD-049 (S-N10-6):** every notice (regular and immediate) carries a fixed, non-editable line listing all possible outcomes up to termination. The decision form offers only the rules cited in the notice. **Should:** an immediate hold with no decision 10 business days after its response window closes shows as overdue to admins (no automatic lift).
>
> **Backend estimate reconciled ([`backend-estimate.md`](./backend-estimate.md)) and decided (PD-058).**
> - **Settlement mode:** option (a) **in full** (3.75 days, under the 4-day bar). This spec designs full (a). There's no trimmed variant, and fallback (b) is dropped (U-N10-2 closed).
> - **Conduct case storage (N10-D14):** conduct cases live **only in closed `app.conduct_*` tables. No `public.disputes` row is ever created** for a conduct case. The admin queue merges `admin_list_conduct_cases()` with today's disputes reads (§2.12).
> - **Settlement scope (N10-D31, N10-D33):** settlement mode shows in-flight referrals and open obligations only (BR-37 definition), never closed history.
> - **First-access gate (N10-D13, N10-D17):** enforced in the database for every authenticated write, with a closed exempt list (§2.2). It applies in settlement mode, with the personal statement only.
> - **`set_organization_suspension` is dropped (N10-D15).** No UI, no allow-list entry, no service-role operator tool.
> - The backend's designer questions (§7 items 8–11) are answered in §9 "Decisions on backend questions".
>
> **Legal-nature strings** are marked **⚖️ draft**: acceptance statements, notice templates, decision texts and settlement-mode text. They ship as drafts until counsel signs off (C-1, C-3, C-4, C-5, C-7; full list §5.17).
>
> **Terms (glossary §5.7):** **conduct report** (button **Report a problem**), **network hold**, **sanction**, **warning**, **suspension**, **termination**, **review**, **breach**, **notice**. "Case" is the admin's word for the queue item. Members see "report" (reporter) or "notice" (reported org). Code identifiers (`app.conduct_*`, `network_hold`, `rules_not_accepted`) aren't user-facing.

---

## 1. Problem & users

The Network Rules aren't binding today. Nobody accepts them, a breach can't be reported in the product, and the only sanction is a full suspension. That suspension also cuts the innocent partners off from their referrals in progress and stops the suspended org from paying what it owes (brief §1). N10 makes the rules a versioned agreement with proof of acceptance. It adds a two-click conduct report, a fair notice → response → decision → review path, a proportionate network hold, and a settlement mode that keeps obligations alive.

| Role | Where | Job to be done in N10 |
|---|---|---|
| **Org admin** (`org_admin`) | Workspace | Accept the rules for the org when creating it and on each material version. Accept personally. Receive notices, respond once, request one review. Understand exactly what a hold or suspension blocks (Network standing page). Report a problem, and follow the reports the org's members sent (PD-058, Q-D6). |
| **Recruiter manager** (`recruiter_manager`) | Workspace | Accept personally. Report a problem. Keep working on referrals in progress whatever the partner's or own org's state. Sees banners only, no sanction details. |
| **Recruiter** (`recruiter`) | Workspace | Same as recruiter manager, within RD-036 record scope (own records only). |
| **Partner org** (any org with a referral or job relationship with a restricted org) | Workspace | Keep its in-flight referrals, payouts and refunds moving. Learn nothing beyond "{Org} isn't taking new referrals right now." (BR-14). |
| **Platform admin A** (decider) | `/admin` | Publish rules versions. Triage conduct reports within 2 business days. Write notices, decide, apply a sanction or an immediate hold (2.3 / 4.8 only). Lift sanctions. |
| **Platform admin B** (reviewer) | `/admin` | Review a sanction decided by another admin (9.6). Can confirm, reduce or overturn, never increase. Lift a termination decided by another admin, only to correct an error (N10-D29). |
| **Candidate** (not a user) | `/candidate/[token]` | Out of scope (BR-11). Candidate pages are never affected by a restriction (delivery continues, BR-13). |
| **N5 applicant** (future) | N5 application | Read the versions page (BR-4). N5 owns the application surface. |

---

## 2. Flows

### 2.0 State model the UI reads (EC-7)

`getRequestContext(orgSlug)` exposes, for the **caller's own org only**, the values below. The UI never derives them on the client. The database stays the gate.

| Field | Values | Source |
|---|---|---|
| `restriction` | `null` · `terminated` · `suspended` · `network_hold` · `rules_not_accepted` (· `network_pending` with N5) | The BR-12 predicate, with its precedence |
| `settlementMode` | `true` when `restriction ∈ {suspended, terminated}` and the org still has access (BR-33, BR-37) | Backend |
| `rules.current` | `{ id, label, effectiveAt }` | Latest published, `effective_at ≤ now` |
| `rules.upcoming` | `{ id, label, effectiveAt, type }` or `null` | Published, `effective_at > now` |
| `rules.memberAcceptedAny` | boolean | Any member acceptance by the user, any version (BR-7) |
| `rules.memberAcceptedCurrent` / `memberAcceptedUpcoming` | boolean | Member acceptance of that version |
| `rules.orgAcceptedCurrent` / `orgAcceptedUpcoming` | `{ at, byName? }` or `null` (`byName` only for `org_admin`) | Org acceptance of that version |
| `rules.userRestricted` | boolean: `memberAcceptedAny && !memberAcceptedCurrent` (BR-9 b) | Derived server-side |
| `quebec` | boolean: N5 province = QC; until N5, org `locale` starts with `fr` (BR-10) | Backend |

`listMemberships()` also returns `settlementMode` per org, so the switcher can mark it (BR-33).

**Rules locale.** The app's UI locales are `en` / `fr` / `pt`, and the rules text locales are `en` / `fr-CA` / `pt-BR`. Mapping: `fr → fr-CA`, `pt → pt-BR`, `en → en`. **Default rules locale** = `fr-CA` when `quebec` is true, otherwise the mapping of the user's UI locale. `?lang=en|fr-CA|pt-BR` overrides it. The rules text is wrapped in an element with the matching `lang` attribute.

### 2.1 Joining: create an org with acceptance (BR-5, BR-6, BR-10)

Applies to today's onboarding form (`/onboarding`, `OnboardingForm`). When N5's application replaces it, the same step moves there unchanged (N5 spec).

1. The stepper gains a step: **Workspace → Profile → Network Rules → Review** (4 steps; `onboarding.steps.rules`).
2. **Network Rules step** renders the acceptance block S1 in the **onboarding variant**:
   - the current version's label and effective date;
   - the language switch (default: the UI locale mapping. There's no org yet, so the Québec proxy is the UI locale `fr`; see Q-D3);
   - the optional summary (U-N10-4, only if the content exists and counsel cleared it);
   - the full text;
   - **two separate checkboxes**, both unticked and both required (Q-D1):
     - "I've read the Network Rules and I accept them personally." ⚖️ draft
     - "I accept the Network Rules on behalf of {organization name}, and I'm authorized to do so." ⚖️ draft (`{organization name}` comes from step 1)
3. **Continue** is disabled until both boxes are ticked. A status line above it says why (`network.accept.needBoth`), and the button has `aria-describedby` pointing to that line (N1 pattern).
4. **Review** step adds a row: "Network Rules {label}: accepted ({language})" with **Edit**, which goes back to step 3.
5. **Create workspace** sends `rulesVersionId`, `rulesLocale`, `acceptOrg=true` and `acceptMember=true` with the form. The server creates the org and records **both** acceptances in the same transaction, with the locale shown and that locale's SHA-256 (BR-5). A call without them is refused (`rules_acceptance_required`), and the org isn't created.
6. **Unhappy paths:**
   - **The version changed while the form was open** (a new version became current): the server returns `rules_version_changed`. The form goes back to step 3, which reloads the current version with both boxes unticked, and shows the inline alert `network.accept.versionChanged`.
   - **Switching language after ticking** unticks both boxes. The status line announces "The language changed. Tick the statements again." (`network.accept.languageChanged`).
   - **No published version exists** (a fresh local DB without seed): step 3 shows `network.accept.noVersion` ("The Network Rules aren't available right now. Try again later.") and creation is blocked. Seed always publishes one (BR-11).

### 2.2 First access: the hard gate (BR-7, BR-11)

**Who:** any member with `rules.memberAcceptedAny = false`. That covers invited members and **every existing user on N10's release day** (R-9). Platform admins in `/admin` are never gated (BR-11).

**Order for invited members:** accepting the invitation (`accept_invitation`, the existing invite flow) happens **before** the gate and is never blocked by it. The gate starts once the membership exists: the first `/workspace/[orgSlug]/…` route after accepting the invitation shows the gate.

**Exempt list (BR-7, closed; the backend documents it in `backend.md`).** These calls work for a user who hasn't accepted. Everything else that writes is refused with `rules_acceptance_required`:

| Exempt call | Why |
|---|---|
| `accept_network_rules` | It's the acceptance itself |
| `create_organization` | It records both acceptances in the same call (BR-6, §2.1) |
| `accept_invitation` | The gate starts once the membership exists |
| Sign-out and org switch | The gate keeps them (item 2) |
| Marking one's own notifications read | Harmless, and the activity popover stays usable |
| Platform-admin RPCs under `/admin` | Platform admins are never gated (BR-11) |
| Candidate-token RPCs and service-role worker paths | Not users |

The gate screen offers only the matching controls (org switcher, sign out, version history). Reading `/network-rules` is a read, so it isn't on the list but always works (§2.5).

1. The member opens any `/workspace/[orgSlug]/…` route. The workspace layout renders the **gate screen** (S1, gate variant) **instead of** the sidebar navigation and the page content. The URL doesn't change, so after acceptance the page the member asked for loads (`router.refresh()`).
2. The gate keeps:
   - the logo;
   - the **org switcher** (still works, BR-7);
   - the **account menu** (profile link removed, sign out kept);
   - a link **Version history** → `/network-rules?org={slug}`.
   No other navigation is shown.
3. Statements depend on the role and the org's state:

   | Viewer | Org accepted current version? | Statements shown | Required |
   |---|---|---|---|
   | `recruiter`, `recruiter_manager` | any | Personal only | Personal |
   | `org_admin` | yes | Personal only, plus the info line "{org} accepted these rules on {date}." | Personal |
   | `org_admin` | no | Personal **and** on behalf of the org | Both (Q-D1, N10-D18) |
   | any role, **org in settlement mode** | any | Personal only (no org line) | Personal (N10-D18; status line `network.accept.needOne`) |

4. **Accept and continue** is disabled until the required boxes are ticked (status line + `aria-describedby`). On success the gate disappears, the requested page renders and a toast confirms (`network.accept.done`).
5. **Writes before acceptance (N10-D13):** the gate is enforced **in the database for every authenticated write**, not only in the UI: every workspace Server Action (`getRequestContext` / `guard`), every authenticated writing RPC, the `with check` of every client-writable table policy and the storage insert policies refuse with `rules_acceptance_required`, except the exempt list above (AC-19, AC-143). The UI can't normally send them (the gate replaces the page). If a stale tab sends one, the generic action error shows `network.errors.acceptanceRequired` with a **Review the rules** link (`network.errors.reviewRulesLink`) that reloads the page.
6. **Leaving instead** (rule 1.5, 10.3, C-6): below the Accept button, the line "Don't want to accept? Contact {support} to leave the network." `{support}` is a `mailto:` link to the configured support address. The line is hidden when no address is configured (PD-025 pattern).
7. **Residual R-7:** direct PostgREST reads before acceptance aren't blocked. No UI change is needed (it's documented in `security-and-privacy.md`).

### 2.3 Material version: notice period and re-acceptance (BR-3, BR-8, BR-9, BR-39)

1. A platform admin publishes a `material` (or `legally_required`) version V with `effective_at` in the future (§2.4). Every member gets the `network_rules.published` notification (S24).
2. **During the notice period** (publication → `effective_at`), every member who hasn't accepted V sees the **notice banner** (B5, S3) on every workspace page:
   > "Network Rules {label} take effect on {date}. Review the changes and accept them before then."
   It has two actions: **Review and accept** (→ `/workspace/[orgSlug]/accept-rules?v={label}`) and **What changed** (→ `/network-rules?org={slug}#upcoming`).
   - An `org_admin` whose org hasn't accepted V also sees the org line: "{org} hasn't accepted yet. An org admin needs to accept for it." Once the org has accepted, the admin's banner goes away when they've also accepted personally.
   - The banner can't be dismissed (BR-8 "persistent"). It's compact: one line on desktop, two lines plus actions on 375px.
   - **Nothing is blocked** before `effective_at`.
3. **Accept page** `/workspace/[orgSlug]/accept-rules` renders S1 (re-acceptance variant) for the version in `?v` (default: upcoming if there is one, otherwise current):
   - the **change summary** at the top (required for every version after the first);
   - the full text, a link **Compare with the version you accepted** (opens the previous version on `/network-rules/{label}` in a new tab), and the statements per the table in 2.2.
   - On success: toast, then a redirect to `?next` (validated with `safeNext`, default overview).
   - If V is already accepted (all required statements), the page shows "You've accepted Network Rules {label} on {date}." with **Back**.
4. **Effective date reached** (`effective_at`, 00:00 ET):
   - **Org-level (BR-9 a):** an org with no org acceptance of V gets `restriction = rules_not_accepted` (§2.6). Its `org_admin`s and its members who haven't accepted get `network_rules.effective_not_accepted` (S24). Org banner B3 replaces B5. Any `org_admin` accepting for the org lifts it **immediately**: the next request has `restriction = null`, and jobs become partner-visible again without being reopened. No file entry is created and nothing shows on the Network standing page.
   - **Per user (BR-9 b, N10-D3):** a member who accepted an earlier version but not V gets user banner B4. They can't open jobs to partners or submit referrals (§2.6.4). Everything else continues.
5. **Non-material version:** effective at publication, members are notified, no acceptance is needed and no banner shows. The versions page lists it with its summary.
6. **`legally_required`:** same as material but may take effect sooner. The banner and the versions page show the stored legal reason inside the change summary (BR-3).
7. **Settlement mode (BR-9 c):** banners B3, B4 and B5 aren't shown in settlement mode, and re-acceptance isn't needed to settle. The accept page stays reachable from the versions page.

### 2.4 Platform admin: publish a rules version (BR-1, BR-2, BR-3)

1. `/admin/network-rules` (new sidebar item **Network Rules** in the *Compliance* group): the current version, the upcoming one and the history. Drafts are listed separately at the top.
2. **New version** → `/admin/network-rules/new`. The button is disabled, with the hint `admin.networkRules.upcomingExists`, when an upcoming version already exists (BR-1: at most one).
3. **Form (S6):**
   - **Label:** text, pattern `^\d+\.\d+$`, unique.
   - **Type:** radio. `initial` is shown only when no version has ever been published. Otherwise the options are `material` (default, with the hint "When in doubt, publish as material."), `non_material` and `legally_required`.
   - **Effective date** (date input; the time is always 00:00 ET, shown as text):
     - `material`: min = today + 30 calendar days, and the hint shows the earliest date;
     - `legally_required`: any date ≥ today, plus a required **Legal reason** (20–1,000 characters);
     - `initial` and `non_material`: hidden, with the line "Takes effect when you publish."
   - **Change summary** per locale: three textareas (en, fr-CA, pt-BR), each 20–2,000 characters, required except for `initial`.
   - **Full text** per locale: three large textareas (monospace, Markdown), required. A per-locale **Preview** tab renders the Markdown as members will see it.
   - **Approval reference:** text, required (5–300 characters). Hint: "Who approved this text and when, e.g. Founder + counsel approval, 2026-12-01."
4. **Live marker check (client-side, advisory):** under each text, a list of the forbidden markers found (`<!--`, `[TODO`, `[placeholder`, `⚖️`), each with its line number. **Publish** stays enabled. The server is authoritative (BR-2 b) and returns the same list as field errors.
5. **Save draft** stores a draft (editable, deletable, not visible to members). **Publish** opens a confirm dialog:
   - Title: "Publish Network Rules {label}?"
   - Body depends on the type: material ("Members will be notified now and must accept by {date}. Published versions can't be changed or deleted."), non-material ("It takes effect now. Members will be notified. …"), and so on.
   - Confirm: **Publish**.
6. The server refuses with field errors (S6 error states) when:
   - a locale is missing (`missing_locale`);
   - a marker is found (`marker_found`, per locale and line);
   - the effective date breaks BR-3 (`effective_date`);
   - an upcoming version already exists (`upcoming_exists`);
   - the reason is missing for `legally_required`;
   - the label is a duplicate.
7. **Success:** toast "Network Rules {label} published.", then a redirect to the list. The published row shows the SHA-256 per locale (short form, full value in a tooltip and on copy) and is read-only. There's no Edit or Delete on a published row, in the UI or in the database.

### 2.5 Versions page (BR-4, rule 10.1, 10.6)

Route: **`/network-rules`** (top level, outside `/workspace`). It needs a signed-in user, but no membership, no acceptance and no org state, so it works during the gate, in settlement mode, for N5 applicants and for users with no org. A signed-out visitor is redirected to sign-in (U-N10-1: no public page).

1. **Shell:** logo, a **Back** link (to `?from`, validated with `safeNext`; default: the user's first workspace, or `/onboarding`) and the account menu. There's no workspace sidebar.
2. **Header:** "Network Rules", then the language switch (`SegmentedNav`: Français · English · Português; Français first when the default is fr-CA). Choosing a language sets `?lang=` and doesn't change the UI locale.
3. **Your status** (only with `?org={slug}` for an org the user is an active member of):
   - "You accepted {label} on {date}." or "You haven't accepted {label} yet." with **Review and accept**;
   - for `org_admin`: also "{org} accepted {label} on {date}." or "{org} hasn't accepted {label}."
4. **Upcoming** (if any; anchor `#upcoming`): card with label, "Takes effect on {date}", type badge, the change summary (with the legal reason for `legally_required`), and **Read the full text** (→ `/network-rules/{label}`).
5. **Current version:** label, "In effect since {date}", a table of contents (anchors to the sections "1. Membership and acceptance" … "10. Changes to these rules"), then the full text. Under the text, a **Fingerprint** disclosure shows the SHA-256 of the displayed locale.
6. **History:** a table (cards at 375px) with label, type, effective date, change summary (`ExpandableText`, 2 lines) and **Read** (→ `/network-rules/{label}`).
7. **`/network-rules/[label]`:** the same layout for one version (upcoming or past). Unknown label or a draft → not found.
8. **Empty:** no published version → `EmptyState` "The Network Rules aren't published yet."
9. **Entry points:**
   - workspace sidebar footer link **Network Rules** (above the account menu, all roles, all states);
   - the gate and the accept page;
   - banners B3, B4 and B5;
   - the Network standing page;
   - the onboarding step;
   - the N6a purpose notice (N6a adds the link).

### 2.6 Org with a partner-activity restriction: hold or rules not accepted (BR-12, BR-13, BR-38, N10-D4, N10-D5)

Applies when `restriction ∈ {network_hold, rules_not_accepted}`. Suspension and termination use settlement mode (§2.10). Internal work isn't touched.

1. **Banner** on every workspace page (all members, S3):
   - **B2 `network_hold`:** "Your organization is on a network hold. You can't open jobs to partners, submit referrals or receive new ones. Referrals in progress continue as usual." For `org_admin`, add **View network standing** (→ `/settings/standing`). Other roles get no link and no details.
   - **B3 `rules_not_accepted`:** "{org} hasn't accepted Network Rules {label}, in effect since {date}. Until an org admin accepts, you can't open jobs to partners or submit referrals. Referrals in progress continue." For `org_admin`, add **Review and accept**. For others: "Ask an org admin to accept."
2. **Jobs (owner org only):**
   - **Job detail:** the existing "Hidden from partners" banner (`jobs.nudge.title`) gets two new bodies, `jobs.nudge.bodyHold` and `jobs.nudge.bodyRules`. The CTA is **View network standing** (org_admin, hold), **Review and accept** (org_admin, rules) or none.
   - **Jobs list:** the chip "Hidden from partners" with the reason "Network hold" or "Rules not accepted".
   - **Restriction first** (backend Q8, accepted): these reasons take precedence over the job-level reasons (`not_open`, `no_terms`, `not_permanent`, `currency_mismatch`).
     - The org-level cause is the one the owner can't fix on the job, so showing a terms nudge would send them to the wrong fix.
     - `NUDGE_REASONS` is extended with `network_hold` and `rules_not_accepted` first.
     - `org_suspended` (suspended or terminated) moves first too, but no job page is reachable in settlement mode anyway.
   - **Job form:** the "Open to partner referrals" toggle stays editable (BR-12.2). When the org is restricted, a helper line under it says: "Saved, but hidden from partners while {reason sentence}." Terms and settings are unchanged, so jobs come back automatically when the restriction lifts.
3. **Opportunities (`/opportunities` and `/opportunities/[matchId]`):** the page renders the **restricted state** (S20-c) before any match lookup:
   - an `EmptyState` with the `PauseCircle` icon, title "Partner opportunities are paused", body per reason, and a CTA for org_admin.
   - The sidebar item stays, but its badge is hidden.
4. **Submitting:**
   - **Org-level:** the composer can't be reached through the UI. A stale composer or a direct call gets `partner_activity_restricted`. The submit panel shows an inline alert, "You can't submit referrals while {reason sentence}." Not a toast.
   - **Per user (BR-9 b):** the composer loads, but the submit panel is replaced by "Accept Network Rules {label} to submit referrals." with **Review and accept**. The server also refuses with `rules_acceptance_required`.
   - **Per user, jobs:** switching a job from closed to open to partners, or creating a job open to partners, is refused with `rules_acceptance_required` (Q-D4). The toggle shows the same helper with **Review and accept**.
5. **Receiving:** a partner's submission to the org's job is refused with the existing hidden-job outcome (BR-12.4). The restricted org sees nothing.
6. **In-flight referrals (BR-13, RD-046):** no change at all, including `awaiting_candidate` referrals delivered during a hold, and no freeze of received shared profiles, on referrals submitted before the restriction started, in both directions:
   - status actions, objections and contests;
   - release and withdraw, messages, candidate-request resend;
   - delivery on candidate confirmation, hire report;
   - placements, invoices, payout, refunds and disputes.
   No banner is added to the referral page itself.
7. **Report a problem** stays available on in-flight referrals (BR-15).
8. **Lift:** the next request has `restriction = null`. Banners go, jobs are partner-visible again and matches return within one matching cycle (EC-2). There's no "lifted" banner. `org_admin`s get `sanction.lifted` (holds only).

### 2.7 What partners see (BR-14, BR-42, RD-048)

1. **Opportunities list:** the restricted org's jobs and the matches against them are gone, with no explanation (like any hidden job).
2. **Old opportunity link** (`/opportunities/[matchId]` for a match the caller's org had against a now-restricted owner): the page renders **S21 "job unavailable"**. The page header carries the job title as the caller last saw it, and the only body sentence is:
   > **"{Org} isn't taking new referrals right now."**
   plus **Back to opportunities**. That's the same sentence, from the same key (`network.partner.notTakingReferrals`), for hold, rules not accepted, network pending, suspension, and termination **while the terminated org is still settling** (byte-identical per locale).
   - **Who gets the sentence:** `get_partner_job_availability` answers only to orgs that have a referral on that job or a live match row for it. Any other direct link gets the generic not-found, so the sentence can't be used to probe an org's standing (backend Q9, accepted).
   - The result is `available | not_taking_referrals | no_longer_member | not_found`, never the reason.
3. **Terminated and settled (RD-048, approved, PD-057):** once a terminated org's settlement mode has ended, S21 shows the "no longer part of" sentence from **`network.partner.noLongerMember`** instead. The same sentence will later cover voluntary exits after settlement, so it never states a cause.
   - **Wording:** the build renders the key, never a hard-coded string. Its en text is "{org} is no longer part of the Workatent network." (founder choice, PD-065), and counsel checks it (C-7). Changing the en value doesn't change the design.
   - **Where it shows:** S21 on old links, and a muted line on the partner's **closed** referral history with that org (the referral page, under the header, from the partner side).
   - **Where it never shows:** lists or notifications.
   - **If the termination is lifted** (§2.13, N10-D29): the sentence stops and the org's state decides what partners see again.
4. **Existing in-flight referrals:** nothing changes (status, actions, messages, terms panel, payout). The referral page has no job header for partners today, so no sentence is added while a referral is in flight. If a job link is added later, it must land on S21.
5. **A stale composer submit** to a restricted job gets the existing hidden-job outcome (no new copy).
6. **Nowhere else:** no reason, level, warning, report or case shows to another org in the UI, the API, matching explanations, notifications or `job_hidden_reason` read from another org. The Verified badge simply disappears with N5 (rule 1.6), without explanation.

### 2.8 Report a problem (BR-15 to BR-19, BR-25, rule 8.1)

**Entry points (all active members, any role):**
- **(a) Referral page**, both sides, every status including closed ones: a `Flag` icon button **Report a problem** in the `PageHeader` actions, next to the status pill (ghost variant, size sm; icon plus visible label from 640px, icon-only with `aria-label` below 640px). Also shown in a held org and in settlement mode (BR-15).
- **(b) Opportunity detail** (`/opportunities/[matchId]`, the partner job): the same button in the `PageHeader` actions. The reported org is the job owner. It isn't shown on S21 or the restricted state (no visible job).

**Not shown:** to platform admins (they open admin-initiated cases, §2.12), on internal referrals between related orgs (Q-D7), or on the candidate page.

1. Select **Report a problem** → the **Report dialog (S8)** opens. The header reads "Report a problem with {org}". `{org}` is the other side of the referral, or the job owner, **as the server resolves it** for display. The submit call sends only `referralId` or `matchId`, and the server derives the reported org (BR-15).
2. **Fields, in order:**
   1. An intro paragraph:
      - "Use this if you think {org} broke the Network Rules. A report deals with behaviour. It doesn't decide who was first, whether a hire happened or what's owed."
      - (8.2) "If it isn't urgent, you can first try the referral messages. That's optional."
   2. **"Use the right tool" block** (RD-044): a compact list (a `Disclosure`, **open by default**, titled "Is this about position, a hire or money?"). Each line links an action the reporter can already take **on this referral**, and a line shows only when it applies to the reporter's side and the referral's state:
      - "Was your candidate already presented, or who was first?" → **File objection** (hiring side, when eligible) or **Contest objection** (sourcing side, when an open objection exists). Otherwise the plain text: "Objections are filed from the referral within 5 business days of delivery."
      - "Was your candidate hired?" → the N3 hire report when N3 ships. Until then: "Write to {org} in the referral messages. If they don't answer, contact {support}."
      - "Is an amount wrong or unpaid?" → **Open a dispute** on the placement (when a placement exists). Otherwise the plain text.
      - "No answer from the partner?" → "That isn't a breach. You can withdraw the referral, or wait for the response deadline."
      - Selecting a link closes the report dialog (with the discard confirm if the form has content) and opens that flow.
      - On a job report (entry point b), only the amount and no-answer lines show, as plain text.
   3. **What's the problem?** A radio group of the categories that **fit this entry point and the reporter's side** (RD-044; the server derives the side and returns the list, and the server accepts any of the 9 values). They show in this order, with "Something else" always last:

      | # | Category (key) | Referral, reporter is sourcing | Referral, reporter is hiring | Partner job |
      |---|---|---|---|---|
      | 1 | went_around: They went around me to the candidate or the client | ✓ | ✓ | — |
      | 2 | misused: They used what I shared for something else | ✓ | ✓ | — |
      | 3 | shared_outside: They shared my information outside their organization | ✓ | ✓ | — |
      | 4 | hire_payout: They didn't report a hire, or didn't pay my share on time | ✓ | — | — |
      | 5 | false_info: False or forged information | ✓ | ✓ | ✓ |
      | 6 | job_terms: The job or its terms aren't real or honest | ✓ | — | ✓ |
      | 7 | discrimination: Discrimination | ✓ | ✓ | ✓ |
      | 8 | retaliation: Retaliation, public accusations or a bad-faith report | ✓ | ✓ | ✓ |
      | 9 | other: Something else | ✓ | ✓ | ✓ |

      That gives 9 options for the sourcing side, 7 for the hiring side and 5 on a partner job.
      - Each option has a label and a one-line description.
      - Category 4 carries the extra hint "A report doesn't collect the money. For an amount, open a placement dispute."
      - **No reporter-visible marker** shows which categories can lead to an immediate hold (admin-only, R-1).
   4. **What happened?** Textarea, 20–4,000 characters, with a live counter ("{n} / 4,000") announced politely when near the limit. Hint: "Facts, dates and where it happened. Share only the candidate or client details we need."
   5. **When did it happen?** Optional date input, max today, plus an optional checkbox "The date is approximate."
   6. **Evidence (optional):** the N1 evidence upload list (extract `ClaimForm`'s upload rows into a shared `EvidenceUploadList`): up to 5 files, PDF / PNG / JPEG, 10 MB each. Row states: uploading → processing → ready / rejected / upload failed. Hint: "Only Workatent admins can open these files. {org} never sees them."
   7. **Honest identity note** (an info box, `Info` icon, not dismissible), R-2, BR-16: `network.report.identity` (referral) or `network.report.identityJob` (partner job). It promises only what the product does (accepted by the lead, 2026-11-16): the reporter's **name is never shown** to {org}; their **organization is named only if the admin decides {org} needs it to respond fairly** (the S14 option); {org} may still guess; retaliation is a breach (7.1).
   8. **Attestation** checkbox, required, unticked ⚖️ draft (8.5): "I'm reporting this in good faith, and it's accurate to the best of my knowledge. I understand that a report made in bad faith is a breach."
3. **Send report** stays disabled while any file is uploading, processing or rejected (status line plus `aria-describedby`, N1 pattern). Other validation (category, length, attestation) runs on submit with field errors, and focus moves to the first invalid field.
4. **Success:** the dialog content swaps to the **sent state**:
   - check icon;
   - "Report sent";
   - "We aim to respond within 2 business days, by {when} ET. We'll tell you the outcome.";
   - **View your report** (→ `/workspace/[orgSlug]/reports/[caseId]`) and **Close**.
   - Focus moves to the "Report sent" heading.
   The reporter gets the `conduct_report.received` notification (S24). The reporting org's audit gets `conduct_report.filed` (case id only, BR-40).
5. **After filing**, the referral page shows the **reporter only** a muted line under the header: "You reported a problem on {date}. View report" (`network.report.youReported` + `youReportedLink`). It isn't shown to the reporter's colleagues, including org admins, who find the report in **Reports › Your organization** (§2.9). Nothing changes for the other side (BR-19).
6. **Unhappy paths:**
   - **Not a party / can't see the job / forged id:** not found (the dialog shows `network.report.errors.notFound` and closes on **Close**).
   - **Self-report** (the reported org equals the caller's org, for example on an internal referral): `report_self` → "You can't report your own organization." The entry point is hidden there anyway.
   - **Rate limit (BR-25):**
     - 6th report by the user in 24 h: "You've sent 5 reports in the last 24 hours. Try again later, or email {support} if it's urgent."
     - 11th for the org: "Your organization has sent 10 reports in the last 24 hours. …"
     The form keeps its content.
   - **Files:** the N1 states and messages (rejected, failed, too big, wrong type).
   - **Network error:** the generic error, and the form keeps its content.
   - **Closing the dialog** with content: the shared `ConfirmDialog` asks "Discard this report?". Uploaded objects are discarded and orphans cleaned up server-side (N1 pattern).

### 2.9 Reporter: status and outcome (BR-18, BR-20, BR-23, RD-045)

Routes: `/workspace/[orgSlug]/reports` (list) and `/workspace/[orgSlug]/reports/[caseId]` (detail).

**Who can read a report (PD-058, Q-D6, N10-D23):** the **reporting user** and the **reporting org's `org_admin`s**, through reporter-view RPCs that return only the reporter-side content below. **Access follows active membership of the reporting org:**
- a reporter who leaves the org (or is deactivated) loses access, and the report stays with the org;
- an `org_admin` who stops being an admin, or leaves, loses access to colleagues' reports;
- other roles in the reporting org (`recruiter_manager`, `recruiter`) read only the reports they sent themselves;
- any other org: not found.

Entry points:
- the sent state;
- the notification;
- the line on the referral (reporter only);
- an account-menu item **Your reports** (`network.reports.menu`), shown when the user has sent at least one report, or, for an `org_admin`, when any member of the org has.

1. **List:**
   - **Non-admin roles:** one list, no tabs: the reports they sent.
   - **`org_admin`:** two tabs (`Tabs`, synced to `?tab=mine|org`, default `mine`): **Sent by you** (`network.reports.tabs.mine`) and **Your organization** (`network.reports.tabs.org`). The org tab has the intro `network.reports.orgDescription` and lists every report sent by a member of the org, the admin's own included, newest first.
   - **Cards** (one column): category label, `network.reports.about` (reported org · sent date), status pill and **Open** (`network.reports.open`, `aria-label` `openAria`). On the org tab, each card also shows `network.reports.sentBy` ("Sent by {name}"), or `sentByFormer` when the reporter is no longer an active member.
   - **Empty:** `EmptyState` `network.reports.empty` + `emptyDescription` (mine), `network.reports.orgEmpty` (org tab). No CTA.
2. **Detail:**
   - title `network.reports.detailTitle`; for an `org_admin` reading a colleague's report, `sentBy` / `sentByFormer` sits under the title;
   - what was sent (`network.reports.youSent`): category, text, date, file names with size (no download after submission for anyone but platform admins; Q-D8, N10-D35);
   - the status timeline;
   - the outcome.
3. **Reporter statuses** (mapped from the admin state; the reporter never sees "notice sent", the org's response, the finding or the sanction):

   | Admin state | Reporter sees (pill + line) |
   |---|---|
   | new | **Received**: "We aim to respond by {when} ET." |
   | info requested (from the reporter) | **Your input needed**: the admin's question, a reply form (text 20–4,000, plus optional files with the same pipeline and limits) and the deadline if the admin set one |
   | notice sent / response window / deciding / review | **In review**: "We're looking into it. We'll tell you the outcome." |
   | closed at triage | **Closed without a finding**, plus the admin's reason (BR-20 c, shown to the reporter) |
   | decided: no breach | **No breach found** |
   | decided: not enough evidence | **Not enough evidence to act**: "You can send a new report if you have new evidence." |
   | decided: breach found (any level, including a finding with no sanction) | **Action taken**: "We found a breach and took action under the Network Rules." |

   - **Every closed outcome** (all four) also shows the fixed line "This report doesn't change your referral, your first position or any amount owed." It links the referral (when the report came from one) so the reporter finds its normal tools (RD-045).
   - **Never shown to the reporter:** the sanction level, the finding text, the org's response, whether a review was requested.
   - **After a review** (RD-045):
     - If the review changes the outcome category (for example, an overturn turns "Action taken" into "No breach found"), the reporter's outcome updates, and they get `conduct_report.outcome_updated` with no detail.
     - If the review only reduces the level, nothing changes for the reporter.
   - **Data-incident notice (RD-045, ⚖️):** if the reporter's org is among the orgs an admin sends a 2.3 incident notice to (§2.12 item 9), that notice reaches the org's admins separately. It isn't part of the report view.
4. **Reply to an information request:** one reply per request, **by the reporting user only** (PD-058 gives org admins read access, not a reply). **Send reply** is confirmed with a toast, and the status goes back to **Received / In review**. Late replies (after an admin-set deadline) are refused with `conduct_reply_closed`.
   - An `org_admin` reading a colleague's report sees the question but no reply form.
   - If the reporter has left the org, nobody on the reporting side can reply: the report shows **Looking into it** (`network.reports.status.inReview`) to the org admins, and the platform admin sees the reporter as former member on the case page and decides without the reply.
5. **Outcome notifications when the reporter has left (N10-D23):** `conduct_report.closed` and `conduct_report.outcome_updated` go to the reporting user while they're an active member of the reporting org; otherwise to that org's `org_admin`s, with the `titleOrg` title (§5.15). `conduct_report.received` and `info_requested` go to the reporting user only (an info request to a reporter who has left creates no notification; the admin sees "former member" on the case).

### 2.10 Settlement mode: suspended or terminated org (BR-33 to BR-38, rule 9.5, RD-047)

Full option (a) (backend estimate §1). Pages opt in to settlement mode (`getRequestContext(slug, { allowSettlement: true })`), and **every other route is denied by default**. The backend owns the opt-in list (`backend.md`), and the frontend renders S22-c for denied routes instead of not-found.

- **Scope (N10-D31, N10-D33):** "in flight" means `referral_in_settlement_scope`, which uses the BR-37 open-obligation definition: a referral in a non-terminal status; a placement not `settled` or `cancelled`; a placement **still inside its guarantee (`guarantee_until` ≥ today), even if already settled**; or an open dispute or claim on any of those. **Closed referral and placement history isn't shown** in settlement mode (decided, data minimization; book-keeping records via support).
- **First access (N10-D17, N10-D18):** a member who never accepted any version still meets the first-access gate in settlement mode, and can accept there. The gate shows the **personal statement only**, whatever the role and whether the org accepted (status line `network.accept.needOne`; §5.1 note). After accepting, the member lands on the settlement home or the page they asked for. Re-acceptance of later versions isn't needed (BR-9 c, AC-34).

1. **Switcher:** the org reappears in the org switcher with a small pill "Settlement mode" (`network.settlement.marker`; neutral tone, text not colour). The trigger shows it under the role label for the current org.
2. **Banner B6** (all members, every page, not dismissible):
   - *Suspended:* "{org} is suspended. You can still finish referrals in progress, settle commissions and answer disputes. Your obligations to partners continue." ⚖️ draft
   - *Terminated:* "{org} was removed from the network on {date}. You can finish referrals in progress and settle commissions until each one is settled. After that, this workspace closes." ⚖️ draft
   - `org_admin`: **View network standing**.
3. **Navigation in settlement mode:**
   - **Home:** the settlement home (S22-b), replacing the dashboard.
   - **Referrals:** only in-flight and open-obligation referrals (the database filters them).
   - **Commissions.**
   - **Agency › Team:** shown to roles that see it today; read and deactivate only.
   - **Agency › Settings:** for org_admin, the settings tabs show only **Network standing**, and the Team tab is read-only.
   - **Network Rules** footer link.
   - **Hidden:** Opportunities, Candidates and Jobs.
4. **Settlement home (S22-b):**
   - a heading, then the B6 text expanded into "What you can still do" (a list with links): referrals in progress (count), commissions with open steps (count), disputes to answer (count), network standing (org_admin);
   - "What's paused": candidates, jobs, opportunities, imports, AI features, connectors and API keys, invitations, settings changes.
   All counts come from backend reads scoped to in-flight records.
5. **Blocked routes** (every route outside BR-34, for example `/candidates`, `/jobs/new` or `/settings/connectors`): the **settlement-mode page** (S22-c) renders in place of the page, with HTTP 200 and no broken screen:
   - "This page isn't available in settlement mode."
   - the same "What you can still do" list;
   - **Go to referrals**.
6. **On allowed pages,** controls that lead to blocked areas are hidden:
   - on the referral page, **Open candidate** (sourcing side);
   - on the job owner's side, the **View in pipeline** link (the pipeline board isn't in BR-34; Q-D10);
   - job links.
   Actions in BR-13 / BR-34 stay. A forged call to a blocked action gets `settlement_mode_unavailable` from the server and the generic error shows `network.errors.settlementUnavailable`.
6a. **An action that takes a referral out of scope (PD-058 item 9).** When a member's action on the referral page closes the referral and it no longer has an open obligation (for example decline, withdraw, release, or the last payout confirmed after the guarantee ended), the referral leaves the settlement list:
   - the action succeeds and the toast `network.settlement.referralClosed` confirms it;
   - the page stays where it is and re-renders as the **referral-closed state**: `EmptyState` with `referralClosedTitle` + `referralClosedDescription` and the button **Go to referrals** (`network.settlement.goReferrals`), not a not-found and not the S22-c blocked page;
   - the same state shows if the member reloads that URL or opens it from a notification later;
   - the Referrals list and the settlement-home counts no longer include it on the next render.
   If the action closes the referral but an obligation remains (a placement still in guarantee, an open dispute), the referral stays in scope and the page renders normally with its new status.
7. **Team in settlement mode:** the member list is visible, and **Deactivate** is available to `org_admin`s (the dedicated `deactivate_member_in_settlement` action). **Invite** and role changes are hidden.
   - **The last active `org_admin` can't be deactivated, and an admin can't deactivate themselves** (backend Q10, accepted). Without an admin, nobody could answer notices, request a review or confirm payouts as an admin, which would break rule 9.5.
   - For the last admin, the **Deactivate** control is hidden, and a direct call is refused with `last_admin` ("Your organization needs at least one active org admin.").
8. **End:**
   - *Suspension lifted:* normal access on the next request. `org_admin`s get `sanction.lifted`.
   - *Terminated and settled:* members lose access (not found, and the org leaves the switcher), as today. There's no in-app warning before the last obligation closes. The banner already says the workspace closes after settlement.
9. **Reporting:** **Report a problem** works on in-flight referrals (BR-34.4).
10. **Stale referrals of a terminated org (RD-047):** in-flight referrals stay fully workable for both sides. When a platform admin closes a stale referral (§2.13 item 3), both sides see the status **Cancelled** with the timeline reason "Closed by Workatent: no activity for 60 days after the organization left the network."
    - That reason is shown to the **terminated org's side** only.
    - **The partner sees** "Closed by Workatent after a long period with no activity." It names no termination, which is consistent with BR-14 while the org is settling.
    - The sourcing side's ownership window is unchanged, and the footer keeps its standard line.
    - Suspended orgs have no such action.

### 2.11 Reported org: notice, response, decision, review (BR-21, BR-22, BR-23, BR-31, BR-32)

**Network standing page** `/workspace/[orgSlug]/settings/standing`: `org_admin` only, as a new settings tab **Network standing** (also in settlement mode). Other roles get not found and see no tab.

1. **Notice received:** the org's `org_admin`s get `conduct.notice_sent` (or `sanction.immediate_hold`), which links to the case page. The notification has no allegation text (BR-39).
2. **Standing page (S10):**
   - **Current standing card:** a status pill and a line:
     - Good standing ("No active sanctions.")
     - Warning active ("Warning until {date}.")
     - Network hold ("Since {date}." plus "Planned review: {date}" if set, informational)
     - Suspended
     - Removed from the network
     The card also has a "What this means" disclosure listing what's blocked and what continues (copy shared with B2/B6). `rules_not_accepted` isn't a sanction: it shows as a separate info row, "Network Rules {label} not accepted", with **Review and accept** (BR-9 a: nothing on the file).
   - **Open notices:** one card per case with an open step. It shows the rules cited, the date sent, the deadline (`BusinessDeadline`: "{when} ET · N business days left") and **Open**.
   - **History:** a table of sanctions and closed cases (date, level or outcome, status: active / expired / lifted / reduced / overturned). Warnings show "Expired on {date}" after 12 months (BR-26).
   - **Rules acceptance:** the org's acceptance per version (label, accepted on, by name). **Should:** members who haven't accepted the current or upcoming version (names only).
   - **Data incident notices** (RD-045, ⚖️; only when the org has received one): a separate section headed "Notices about your partners' data handling", so it isn't read as a sanction on this org.
     - Each card shows the date and the referrals concerned, and **Open** goes to `/settings/standing/incidents/[noticeId]`.
     - **The incident page** shows the admin's factual text:
       - which referral(s), linked when the org can still open them;
       - what information;
       - when, and to whom if known;
       - the **fixed guidance line**, chosen by the recipient's side on the referrals concerned (lead decision, 2026-11-16):
         - **sourcing side:** `network.incident.guidance` (revoke / withdraw / release advice);
         - **hiring side** (for example, the client's or the job's details leaked): a second fixed variant, `network.incident.guidanceHiring` (§5.9). It must not give the revoke / withdraw / release advice, which doesn't apply to a hiring org;
         - an org on both sides across the referrals concerned gets both lines, sourcing first.
         The line is copied into the stored notice per recipient at send time, in the notice's language (§5.0), like `guidance` today.
     - It **never** names a sanction.
3. **Case page (S11)** `/settings/standing/[caseId]`:
   - **Notice:** the admin's text, exactly as sent. It has:
     - a heading (`network.notice.heading` or `headingImmediate`);
     - the rules cited (number plus title), and under them the version they come from (`network.notice.version`, "From Network Rules {label}"; one version per notice, N10-D21);
     - what is alleged and when;
     - the evidence summary;
     - the response deadline;
     - the reporting org's name, only if the admin chose to name it;
     - **the fixed possible-outcomes line** (RD-049, ⚖️, part of the stored notice, never editable by the admin): "After the response period, we may decide no action, a warning, a network hold, a suspension or termination. A decision can be reviewed once by a different platform admin."
     It **never** includes the raw report, files or the reporting user (BR-21).
   - **Respond (BR-22)** before the deadline, any `org_admin`, **once**:
     - textarea 20–8,000 characters with a counter, plus optional files (the same `EvidenceUploadList`; hint: "Only Workatent admins can open these files.");
     - before sending, a confirm dialog: "Send your response? You can send one response, and you can't edit it after sending.";
     - after sending: "Response sent on {when} ET by {name}", read-only, with file names. Other admins see the same.
   - **Follow-up questions** (admin → org): each shows the question, the optional deadline and one reply field (text 20–4,000 plus files). Without a deadline: "No deadline. Reply when you can."
   - **Deadline passed** without a response: the form is replaced by "The response window closed on {when} ET. Workatent will decide on the record (rule 7.2)." A late submit gets `conduct_response_closed`.
   - **Decision** (once recorded) ⚖️ draft:
     - the date and **who decided, never by name**: `network.decision.decidedOn` ("Decided on {date} by a Workatent platform admin"; PD-058, Q-D13, N10-D28). No platform admin's name or id reaches any member-readable response;
     - the outcome (no breach / not enough evidence / breach found);
     - the finding text and the rules cited, plus "Decided using rule 7.4" if the residual-test flag is set (transparency; Q-D11);
     - the sanction with its effects and dates;
     - the review deadline.
     - The decision never cites rules outside the notice (RD-049).
   - **Request a review (BR-31):**
     - shown only for a decision with a sanction level, or a breach finding with no level (Q-D12), before the stored deadline, when no review has been requested yet;
     - dialog: reason (20–8,000) plus files, and the line "A different platform admin will review the decision. The sanction stays in effect during the review.";
     - confirm: **Request review**.
   - **After a review request:** `network.case.reviewRequested` (date and the org's own admin who asked). Then the review outcome: confirmed / reduced to {level} / overturned (`network.case.review.*`), with the reviewer's written reason and `network.case.review.reviewedOn` ("…by a different Workatent platform admin"). The reviewer isn't named either (Q-D13).
   - **Termination lifted to correct an error** (§2.13): the decision panel shows the sanction status "Lifted on {date}" (`labels.sanctionStatus.lifted`), and the org gets `sanction.lifted`. The lifting admin and the reason aren't shown to the org.
4. **Unhappy paths:**
   - a second response: `conduct_response_exists`;
   - a second review: `review_already_requested`;
   - after the review deadline: `review_window_closed`;
   - a non-admin member opening the URL: not found;
   - another org: not found.

### 2.12 Platform admin: conduct queue, triage, notice, decision, immediate hold, review

**Queue (S12)**, `/admin/disputes`:
- **Sources (N10-D14):** the page merges today's `disputes` reads (placement, prior presentation) with `admin_list_conduct_cases()` (conduct, from the closed `app.conduct_*` tables). No conduct case ever has a `public.disputes` row.
- A `SegmentedNav` filter: **All · Placement · Prior presentation · Conduct**, with counts of open items.
- **Sort for conduct** (RD-044): cases whose reporter or admin category is `shared_outside` (3) or `false_info` (5) come first, with a **"Possible 9.4"** badge (admin-only). Then by first-response target, oldest first.
- Conduct cards show:
  - the `Conduct` type badge and the category label. When the admin has set its triage category, both show: "Admin: {category} · Reporter: {category}";
  - "{reported org} reported by {reporter org}", or "Opened by Workatent" for admin-initiated cases;
  - the filing date;
  - the **first response target** (`BusinessDeadline`, label "First response by") until a first response exists;
  - after that, the current step's deadline;
  - a state pill (New · Waiting for reporter · Notice sent · Response received · Window closed · Decided · Review requested · Needs a second admin · Closed);
  - a **bad-faith signal** line when the reporter org has ≥ 1 report closed as "no breach" in the last 12 months: "{reporter org}: {n} earlier reports found no breach." (BR-25);
  - **Open case** (→ `/admin/disputes/conduct/[caseId]`).
- Cases past their first-response target show the deadline in its "overdue" form, with text, not only colour. There's no automatic action (BR-20).
- **Should (RD-049):** an immediate-hold case with no decision 10 business days after its response window closed shows the pill **"Decision overdue"** and sorts to the top of the queue. It's counted on the admin metrics card. There's no automatic lift.
- `/admin` *Needs attention* counts open conduct cases inside the existing "Open disputes" tile.

**Case page (S13)** `/admin/disputes/conduct/[caseId]`: two columns on desktop (record on the left, actions on the right, sticky); one column on 375px with the actions after the record.

1. **Record:**
   - parties: reported org (link to the admin org page), reporter org and user (admin only, BR-43), plus the referral or job context link;
   - category, text, date (+ approximate);
   - files: name, size, SHA-256, **Download**, which reuses `AdminEvidenceDownload` (60-second signed URL, audited);
   - the reporter thread (questions and replies);
   - the notice(s), the org's response and files, follow-ups, the decision, the review;
   - the org's **context**: active warnings, sanctions in the last 12 months, open cases.
   - Language hint: "{org} works in {language}" (N1 `dispute.languageHint` pattern).
2. **Triage actions** (state `new` or `info_requested`):
   - **Admin category** (RD-044): a `NativeSelect` with the 9 categories, prefilled with the reporter's choice, required before any first response. It's saved with the first triage action (or on its own with **Save category**). Metrics use this value, and the reporter's label stays stored and shown.
   - **Send notice** → the notice composer (S14);
   - **Ask the reporter** → a dialog with the question (20–2,000) and an optional deadline (business days, 1–10). The message is reporter-only;
   - **Close without a finding** → a dialog with the reason radio (No rule engaged · Amount owed: placement dispute or rule 7.5 · Duplicate case · Other) and a reason text the reporter will read (20–1,000; hint: "The reporter will read this."). Confirm: **Close case**.
   - **Apply immediate hold** (S16): **shown only when the reported org has no active network hold (immediate or decided), isn't suspended (legacy suspensions included) and isn't terminated** (N10-D16). It **is** shown on an org restricted only for `rules_not_accepted` (or N5 `network_pending`), since that isn't a sanction. On a restricted org the button isn't rendered at all (no disabled state); the admin uses **Send notice** on the new case, and the existing effect stays.
3. **Notice composer (S14):**
   - language select (en / fr-CA / pt-BR; default: the org's locale. **Should:** "Bilingual (fr-CA + en)" for Québec orgs);
   - **Date of the conduct** (`admin.conduct.notice.conductDate`, hint `conductDateHint`; PD-058, Q-D2, N10-D21): a required date input, **prefilled** from the report's "When did it happen?" date, otherwise the filing date (admin-initiated cases: empty, required). Max today; min the effective date of the first published version (outside that range the server refuses with a field error: `admin.conduct.notice.conductDateBeforeRules` before the first version, `network.report.errors.dateFuture` for a future date);
   - **Rules version** (`admin.conduct.notice.rulesVersion`, hint `rulesVersionHint`): a `NativeSelect` listing the published versions that have taken effect (no drafts, no upcoming version), each as `rulesVersionOption` ("Version {label} · in force from {date}"). It **defaults to the version in force on the conduct date** and re-defaults when that date changes, unless the admin picked a version by hand. The admin may pick another version that was in force during the alleged period. **One version per notice**; the notice stores it;
   - **The org's acceptance of the chosen version** (info only, never blocks): `orgAcceptedVersion` ("{org} accepted this version on {date}.") or `orgNotAcceptedVersion`, as a muted line with the `Info` icon under the select, updated when the version changes;
   - **Rules cited** (hint `rulesHint`): a multi-select (`Combobox`, multi) of rule numbers with their first words, grouped by section, **from the chosen version only**. At least one is required. When the version changes, rules whose number exists in the new version stay selected and the others are dropped; the live count (`rulesSelected`) announces the change;
   - **What is alleged** (20–4,000);
   - **When** (free text, for example "Between 3 and 10 March 2027", 3–200);
   - **Evidence summary** (20–4,000). Hint: "Summarize the evidence. Don't paste the report or name the reporter. Keep candidate and client details to what they need to respond (8.4).";
   - **Name the reporting organization** checkbox, unticked by default, with the hint "Only if they need it to respond fairly.";
   - the **fixed possible-outcomes line** (RD-049), shown read-only in the composer and the preview with a lock icon and "Added to every notice". It can't be edited or removed;
   - a read-only **Response deadline:** "{when} ET (10 business days after sending)", computed by the server when the notice is sent and shown as a preview;
   - a **Preview** pane showing exactly what the org's admins will see.
   - **Send notice** opens a confirm dialog: "Send this notice to {org}'s admins? You can't edit it after sending." Then the state becomes `notice_sent`, the deadline, the version and the rules cited are stored and frozen, and `conduct.notice_sent` goes out.
   - **Server checks:** the version must be published and already in effect; every rule cited must exist in that version; the possible-outcomes line is added by the server (AC-133, AC-147).
4. **Response window:** the case shows the deadline. **Ask a follow-up** (question plus an optional deadline ≤ 10 business days) is available. The decision form is disabled until the response is received or the deadline has passed, with the hint "You can decide once {org} responds or the window closes on {when} ET." (BR-27).
5. **Decision form (S15):**
   - **Outcome** radio: No breach · Not enough evidence · Breach found.
   - For **Breach found:**
     - rules cited: checkboxes limited to **the rules cited in the notice** used for the decision, **from that notice's version**, all ticked by default, at least one required (RD-049, N10-D21). Hint `admin.conduct.decision.rulesFromNotice`. The server refuses rules outside the notice, or from another version (`decision_rules_not_in_notice`);
     - **Finding** (50–8,000; the org will read it) ⚖️;
     - **Residual test (7.4)** checkbox;
     - **Sanction** radio: No sanction (first minor breach only) · Warning · Network hold · Suspension · Termination.
       - *No sanction* (12-month rule, PD-058, Q-D5, N10-D24): **disabled** when the org has, in the last 12 months, any **non-overturned sanction or breach finding**, with or without a level (an earlier "Finding, no sanction" counts; overturned decisions and legacy pre-N10 suspensions don't). The disabled radio carries the hint `admin.conduct.decision.noneDisabled`, linked with `aria-describedby`. The **database enforces the same rule**: a direct call recording no level is refused with `no_sanction_not_allowed` (proposed code; backend confirms the name in `backend.md`), shown as `admin.conduct.errors.noSanctionNotAllowed` in an inline `Alert` at the top of the form. Whether the breach is "minor" stays the admin's judgement, open to review.
       - *Network hold:* an optional **Planned review date** (informational).
       - *Suspension* and *Termination:* a required **Why isn't a network hold enough?** (20–2,000; BR-30).
       - *Termination:* the extra line "They can reapply after 12 months (rule 9.7). Settlement mode lasts until their referrals and placements are settled."
   - Above the radio, the **context panel**: active warnings, and sanctions and no-level breach findings in the last 12 months (level or "Finding, no sanction", date, status). Overturned entries show with their status but don't disable *No sanction*. Legacy pre-N10 suspensions aren't listed (no sanction record, BR-29).
   - **After an immediate hold** (BR-28), the sanction options read: **Lift the hold** · **Keep the hold** · **Change to a warning** · **Suspension** · **Termination** (RD-049).
     - Escalating above the hold on the same notice is offered **only when that notice carries the possible-outcomes line**. Every notice sent through N10 does.
     - For a notice without it (a legacy or malformed row), Suspension and Termination are disabled, with the hint "This notice didn't list every possible outcome. Send a new notice to decide a higher level."
     - Escalating shows the confirm line: "Use this only if the facts and rules are the ones in the notice. New facts or rules need a new notice."
   - **Record decision** opens a confirm dialog that restates the outcome and the effect ("{org} will be on a network hold from now on. Its jobs will be hidden from partners."). It notifies both sides (S24) and stores the review deadline (10 business days).
6. **Immediate hold (S16)**, a two-step dialog:
   - **Step 1:**
     - "Apply an immediate network hold";
     - a **Ground** radio with only two options:
       - "Rule 2.3: shared information outside their organization";
       - "Rule 4.8: forged evidence or false candidate confirmations";
     - then the notice fields (S14). The heading is fixed to "Immediate network hold under rule 9.4", and the rules cited are prefilled with the ground (other rules can be added).
   - **Step 2:** "Apply the hold and send the notice now? {org}'s jobs will be hidden from partners right away. Their referrals in progress continue. Their 10 business days to respond start now." with **Back** · **Cancel** · **Apply hold and send notice**.
   - The server creates the hold **and** the notice in one transaction (BR-28). Any other ground is refused (`immediate_hold_ground_invalid`).
   - **Already restricted (N10-D16):** the action isn't offered on an org with an active hold, a suspension or a termination (S13 item 2, S18). If the org became restricted after the page loaded (stale page) or the RPC is called directly, the server refuses with **`org_already_restricted`** and creates nothing (no hold, no notice). The dialog stays open on step 2 with an inline `Alert` (`admin.conduct.errors.alreadyRestricted`), the confirm button is removed, and **Cancel** returns to the case, where the admin can use **Send notice**.
   - There's no immediate suspension or termination in the UI.
7. **Review panel (S17)** (state `review_requested`):
   - It shows the org's review request and files, the decision and the decider's name.
   - **The decider, or the admin who applied the immediate hold:** the panel reads "You decided this, so another platform admin must review it." and has no controls. The server also refuses (`review_not_allowed`).
   - **Another admin:** an **Outcome** radio:
     - Confirm;
     - Reduce (then a level select listing **only lower levels plus "Lift"**);
     - Overturn ("The sanction is lifted and won't count for 12 months.").
     Plus a **Reason** (50–8,000; the org reads it) and **Record review**. Increasing the level isn't possible in the UI, and the server refuses it (`review_cannot_increase`).
   - With **no second active platform admin**, the queue pill and the panel read "Needs a second admin" (the backend provides `has_eligible_reviewer`).
8. **Lifting a sanction** outside a review: from the admin org page (§2.13), with a required reason, audited. Holds and suspensions: any platform admin. A termination: only to correct an error, by an admin other than the one who decided it (N10-D29).
9. **Data-incident notice (RD-045, ⚖️):** after a decision of **Breach found** that cites rule 2.3, the case page shows the action **Send incident notice**. It opens a dialog:
   - **Affected organizations:** checkboxes listing the orgs that are parties to the referral(s) linked to the case, plus a referral picker to add other referrals of the sanctioned org. The sanctioned org itself isn't listed.
   - **Referrals concerned:** a multi-select from the same set.
   - **What information** (20–2,000), **When** (3–200), **To whom, if known** (optional, ≤ 500).
   - The fixed guidance line(s) (read-only, lock icon, `admin.conduct.incident.guidanceLocked`) and a preview. The server picks the variant per recipient from its side on the referrals concerned (sourcing: `network.incident.guidance`; hiring: `network.incident.guidanceHiring`; both sides: both). The preview has one tab per variant in use and labels which orgs get which (tab labels `admin.conduct.incident.variantSourcing` / `variantHiring`, org list `variantRecipients`).
   - **Send** opens a confirm dialog: "Send this incident notice to {n} organizations? It doesn't mention any sanction."
   It can be sent more than once (for example, when new affected referrals are found). Each send notifies the selected orgs' `org_admin`s (`conduct.incident_notice`, no allegation text) and is audited with no sanction data (§2.15). The text is written by the admin. The UI never pre-fills it from the finding.

### 2.13 Admin org page: sanction file replaces the Suspend button (BR-29, BR-32, BR-37)

`/admin/organizations/[orgId]`:

1. **Header actions:** `SuspendButton` is **removed**. In its place:
   - a **standing pill**: Active · Warning active · Network hold · Suspended · Terminated (settling) · Terminated. A second, info-tone pill "Rules not accepted" shows when that applies. Demo stays as today;
   - **Open conduct case** → `/admin/disputes/conduct/new?org={orgId}` (S18);
   - **Lift…** (`admin.orgDetail.lift`, outline), shown when a hold or a suspension is active (legacy suspensions included, item 4). The `ConfirmDialog` has a required reason (`liftHoldTitle` / `liftSuspensionTitle`, with their descriptions; reason label `liftReason`, validation `admin.validation.reason`).
     - Lifting a hold ends the restriction.
     - Lifting a suspension ends settlement mode.
   - **Lift termination…** (`admin.orgDetail.liftTermination`, outline; PD-058, Q-D14, N10-D29), shown when the org is terminated (settling or settled), **only to correct an error found after the decision**:
     - **Hidden for the deciding admin** (the `decided_by` of the termination). In its place, a muted line `admin.orgDetail.liftTerminationSelf` ("You decided this termination, so another platform admin must lift it.").
     - **Any other platform admin** opens a `ConfirmDialog`: title `liftTerminationTitle`, body `liftTerminationDescription` (error correction only; settlement mode ends, members get full access again, the termination won't count in later decisions, the org's admins are notified), a **required** reason textarea `liftTerminationReason` ("What was the error?"; kept in the audit log, admin-only; validation `admin.validation.reason`), confirm `liftTerminationConfirm`.
     - **On confirm:** the termination is marked lifted (it no longer counts under 9.2), `terminated_at` and `suspended_at` are cleared, settlement mode ends (members of a settled org regain access and the org returns to their switcher), matching is re-queued, the "no longer part of" sentence stops, `sanction.lifted` is audited (reason in admin metadata only) and notified to the org's admins (no reason). Toast `terminationLifted`.
     - **A direct call by the deciding admin** is refused (`errors.liftNotAllowed`; backend names the code), and nothing changes. A call with an empty reason is refused.
   - The description line `orgDetail.suspendedSince` is replaced by the standing line (`admin.orgDetail.standingSince`: level, since date, case link `caseLink`).
2. **New panel, "Network standing"** (full width, before Members):
   - sanctions file (level, decided on, by, case link, status, expiry);
   - open cases (state, next deadline);
   - rules acceptance (org-accepted version and date; members not accepted: count, and the list on expand).
3. **New panel, "Remaining obligations"** (terminated or suspended orgs only). It lists exactly the BR-37 open obligations (N10-D33), on either side of the org:
   - referrals in progress (non-terminal status; list: partner, job, status, link to `/admin/referrals/[id]`);
   - placements with an open obligation, each with its reason tag: **guarantee running** (`obligation.guarantee`; this includes a placement **already settled but still inside its guarantee**, `guarantee_until` ≥ today) · payout not confirmed · refund due · open dispute (or claim);
   - For a terminated org: `obligationsHint` ("Settlement mode ends when this list is empty."). When it's empty: `allSettled`. A settled placement in guarantee keeps the list non-empty, so settlement mode continues until the guarantee ends (AC-108).
   - **Close stale referral (RD-047, terminated orgs only):** referrals with no stage change, message or event for **60 days** carry a "No activity for {n} days" tag and a **Close as cancelled…** action.
     - The `ConfirmDialog` has a required reason (kept in the audit log, admin-only) and the line: "Both sides will see it as cancelled. The sourcing side keeps its ownership window."
     - Referrals with less than 60 days of inactivity have no action. Staleness is a prompt, not a trigger, so nothing closes automatically.
     - It isn't offered for suspended orgs.
     - Closing the last stale referral doesn't end settlement mode while any other BR-37 obligation remains (for example a settled placement still in guarantee); that row stays on the list.
4. **Legacy suspensions** (Q-D15, N10-D30; orgs with `suspended_at` set before N10 and no sanction record):
   - standing pill `admin.orgDetail.legacySuspended` ("Suspended (before N10)") instead of "Suspended";
   - **Lift…** is the only sanction action on it (same dialog as a suspension: `liftSuspensionTitle` / `Description`, required reason). **Open conduct case** stays available, because escalation needs a new case and notice;
   - the org is in **settlement mode** like any suspended org (B6, S22, remaining-obligations panel; no stale close, since it isn't terminated);
   - the sanctions file shows no row for it (no record is fabricated), it doesn't count under 9.2 and isn't listed in the decision context panel;
   - lifting it ends settlement mode, is audited as `sanction.lifted` with a null sanction id and notified to the org's admins.
5. `set_organization_suspension` is **dropped** (N10-D15): no UI, not executable by `authenticated`, not on the api-surface allow-list, and `setSuspension` / `SuspendButton` are deleted (BR-29).

**Admin-initiated case (S18)** `/admin/disputes/conduct/new?org=`:
- org (prefilled; if missing, an org combobox);
- category (the same 9, unfiltered; it's also the admin category);
- source radio: Confirmation found invalid (RD-029) · Objection found fabricated (N1) · Other;
- optional referral link (a combobox of the org's referrals);
- description (20–4,000, admin-internal);
- optional files.
**Open case** → the case page in state `new`. The same notice → response → decision → review steps follow (BR-24). There's no reporter, so the queue reads "Opened by Workatent", and the reporter-facing status doesn't exist.

### 2.14 Notifications (BR-39, PD-026)

In-app only in this release. Each event is a distinct `kind` with PII-free params; the English title and body are written in SQL (PD-026), and the i18n keys in §5.12 are ready for the localisation follow-up. **No notification contains allegation text, the category, the reporter, the finding or the sanction level.** Each links to the right page. Full list: S24.

### 2.15 Audit (BR-40)

| Event | Org on the event | Visible in |
|---|---|---|
| `network_rules.published` | null | Admin audit |
| `network_rules.org_accepted`, `network_rules.member_accepted` | the org | Org audit + admin |
| `conduct_report.filed` (case id only) | reporter org | Reporter org audit + admin |
| triage events (`conduct.info_requested`, `conduct.closed_at_triage`, `conduct.reporter_replied`) | null | Admin only |
| `conduct.notice_sent`, `conduct.response_submitted`, `conduct.followup_*`, `conduct.decided`, `sanction.applied`, `sanction.lifted`, `sanction.immediate_hold`, `sanction.review_requested`, `sanction.reviewed`, `settlement_mode.entered` / `.exited` | reported org | Reported org audit + admin. Metadata never has the reporter user or org, the report text or the category |

| `conduct.incident_notice_sent` (RD-045) | each recipient org (one event per org) | Recipient org audit + admin. Metadata: notice id and referral ids only. No sanction, case outcome or reporter |
| `referral.closed_stale_by_admin` (RD-047) | both referral orgs | Both org audits + admin. Reason text is admin-only |
| `conduct.admin_category_set` | null | Admin only |

The org audit page (`/settings/audit`) gets labels for the new actions (`settings.audit.actions.*`, §5.14).

**Who in the org sees which events (BR-32, lead decision 2026-11-16).** Today `audit_select` lets `org_admin` **and `recruiter_manager`** read their org's audit. Sanction-related events would tell recruiter managers that a notice, a sanction or a report exists, which BR-32 reserves to `org_admin`s. So:
- **`org_admin` only** (plus platform admins): `conduct_report.filed`, every `conduct.*` event, every `sanction.*` event, `settlement_mode.entered` / `.exited` and `conduct.incident_notice_sent`. The restriction applies in the database (the `audit_select` policy, or the read RPC behind `/settings/audit`), not only in the page, so a direct select by a `recruiter_manager` doesn't return them (AC-149).
- **Unchanged for roles that read the audit today:** `network_rules.org_accepted`, `network_rules.member_accepted` and `referral.closed_stale_by_admin` (the last is visible on the referral itself anyway).
- Non-admin members still see the restriction banner (BR-38), which is the only signal BR-32 allows them.

---

## 3. Screens & states

All screens: light and dark, 375px and ≥ 1024px, strings via i18n, no colour-only meaning. **Reused components:**
- UI kit: `Button`, `Checkbox`, `RadioGroup`, `Textarea`, `Input`, `Dialog`, `Tabs`, `Badge`, `Tooltip`, `Table`, `Skeleton`, `Alert`, `Separator`;
- shared: `Panel`, `PageHeader`, `SectionTitle`, `StatusPill`, `EmptyState`, `FormField`, `FormMessage`, `SubmitButton`, `ConfirmDialog`, `SegmentedNav`, `Disclosure`, `ExpandableText`, `Combobox`, `Flash`;
- features: `BusinessDeadline`, `AdminEvidenceDownload`, and the N1 upload rows extracted as `EvidenceUploadList`.

**New shared pieces:** `RulesText` (safe Markdown renderer with raw HTML disabled; frontend picks the library, see Q-D16), `NetworkBanner`, `AcceptanceBlock`, `ReportDialog`.

| # | Screen | Route | Components | Loading | Empty | Error | Success / other |
|---|---|---|---|---|---|---|---|
| S1 | **Acceptance block** (variants: onboarding, gate, re-accept) | in `/onboarding`, the workspace layout, `/workspace/[orgSlug]/accept-rules` | `AcceptanceBlock`: header (label, effective date), `SegmentedNav` language switch, optional summary `Disclosure` (open by default, labelled "Summary (not part of the rules)"), change summary (re-accept), `RulesText` with a table of contents, `Checkbox` ×1–2, status line, `SubmitButton`, leave line | `Skeleton` text block. The Accept button is disabled while loading | No published version: `network.accept.noVersion`, button hidden | `rules_version_changed`: inline `Alert`, reload with boxes unticked. Network error: `FormMessage` | Toast `network.accept.done`, gate removed / redirect. Already accepted: "You've accepted … on {date}." **Disabled:** Accept until the required boxes are ticked |
| S2 | Onboarding step "Network Rules" | `/onboarding` | Existing stepper (4 steps), S1 onboarding variant, Review row | as S1 | as S1 | `rules_acceptance_required` / `rules_version_changed` → back to step 3 with an alert | Workspace created with both acceptances |
| S3 | **Network banners** B2–B6 | every workspace page, top of `<main>`, above the page header | `NetworkBanner`: icon + title + body + up to 2 actions, `role="status"` | Server-rendered, no loading | — | — | Precedence: B6 settlement > B2 hold > B3 rules (org) > B4 per user > B5 notice period. **At most 2** are stacked: the highest restriction banner (B6/B2/B3/B4) plus B5 if it applies (except in settlement mode, where only B6 shows) |
| S4 | **Versions page** | `/network-rules`, `/network-rules/[label]` | Minimal shell, `PageHeader`, `SegmentedNav` (language), status `Panel`, upcoming `Panel`, `RulesText` + TOC, `Disclosure` (SHA-256), history `Table` / cards | Route `loading.tsx` skeleton | `EmptyState` "The Network Rules aren't published yet." | Unknown label → not found. Load error → route `error.tsx` | — |
| S5 | Admin rules list | `/admin/network-rules` | `PageHeader` + **New version** button, drafts list, current / upcoming `Panel`s, history `Table` (label, type, effective, published, approval ref, SHA-256 short ×3) | Skeleton | "No version published yet." + **New version** | Generic | **Disabled:** New version when upcoming exists (hint) |
| S6 | Admin publish form | `/admin/network-rules/new`, `/admin/network-rules/[id]/edit` (draft) | `FormField`s, `RadioGroup` (type), date `Input`, `Tabs` per locale (Text · Preview), `Textarea`s, marker list, `ConfirmDialog` | `SubmitButton` pending | — | Field errors: `missing_locale` (on the locale tab, with a tab badge "1 error"), `marker_found` (list with lines), `effective_date` (shows the earliest allowed), `upcoming_exists`, duplicate label | Toast + redirect. Draft saved toast |
| S7 | **Report entry points** | referral page header; opportunity detail header | `Button` ghost sm with the `Flag` icon | — | — | — | Hidden for platform admins, on internal referrals, on S21 / restricted state. After filing: reporter-only line on the referral |
| S8 | **Report dialog** | dialog over S7 | `Dialog` (max-w-xl; full-height sheet style at < 640px), "use the right tool" `Disclosure` with links, `RadioGroup` (5–9 options per context), `Textarea` + counter, date `Input` + `Checkbox`, `EvidenceUploadList`, info box, attestation `Checkbox`, status line, `SubmitButton` | Pending: "Sending…" | — | Field errors; `notFound`; `report_self`; rate limits (inline `Alert` at the top); file states | Sent state (heading focus, **View your report**, **Close**). **Disabled:** Send while files aren't ready |
| S9 | **Your reports** (reporter and reporting org's admins) | `/workspace/[orgSlug]/reports` (`?tab=mine\|org` for `org_admin`), `/reports/[caseId]` | `PageHeader`, `Tabs` (org_admin only: **Sent by you** · **Your organization**), cards (+ `sentBy` / `sentByFormer` on the org tab), `StatusPill`, timeline, reply form (`Textarea` + `EvidenceUploadList`, reporting user only) | Skeleton | `network.reports.empty` + `emptyDescription` (mine); `network.reports.orgEmpty` (org tab) | Not the reporter and not an `org_admin` of the reporting org, former member, other org, unknown → not found | Reply sent toast. Outcome shown per the §2.9 table. Org admin on a colleague's report: no reply form. Reporter left: no reply form, status "Looking into it" |
| S10 | **Network standing** | `/workspace/[orgSlug]/settings/standing` | Settings tab, standing `Panel` + `StatusPill` + `Disclosure`, open notices (cards with `BusinessDeadline`), history `Table` / cards, acceptance `Panel` | Skeleton | Good standing + "No notices." | Not org_admin → not found | — |
| S11 | **Case page (org side)** | `/workspace/[orgSlug]/settings/standing/[caseId]` | Notice `Panel` (read-only, `lang` = notice language), response form, follow-ups, decision `Panel`, review request `Dialog` | Skeleton | — | `conduct_response_closed`, `conduct_response_exists`, `review_window_closed`, `review_already_requested`: inline `Alert` | Response sent (read-only view). Review requested. **Disabled:** Send while files aren't ready |
| S12 | **Admin disputes queue** | `/admin/disputes` | Existing page + `SegmentedNav` filter, conduct card (`Badge`, `StatusPill`, `BusinessDeadline`, bad-faith line) | Existing | Existing `EmptyState` (per filter: "No open conduct cases.") | Card load error: the existing "never drop it silently" fallback | — |
| S13 | **Admin case page** | `/admin/disputes/conduct/[caseId]` | Two-column layout, record `Panel`s, files with `AdminEvidenceDownload`, action `Panel` (sticky ≥ 1024px) | Skeleton | — | Not found for non-admins (admin layout already 404s) | State-dependent actions (§2.12) |
| S14 | Notice composer | panel / dialog inside S13 | `NativeSelect` (language), date `Input` (conduct date, prefilled), `NativeSelect` (rules version, defaulting to the version in force on that date), muted `Info` line (org's acceptance of that version), multi `Combobox` (rules of that version), `Textarea`s, `Checkbox`, locked possible-outcomes line, deadline preview, `Tabs` (Edit · Preview), `ConfirmDialog` | `SubmitButton` pending | No published version → `admin.conduct.notice.rulesEmpty`, send disabled | Field errors (conduct date out of range: `admin.conduct.notice.conductDateBeforeRules` / `network.report.errors.dateFuture`; version not in effect, rule not in version) | Notice sent toast, state change. **Info, not blocking:** `orgNotAcceptedVersion` |
| S15 | Decision form | inside S13 | `RadioGroup` (outcome, sanction), context `Panel`, `Textarea`s, `Checkbox` (7.4), date `Input`, `ConfirmDialog` | pending | — | `sanction_notice_required`, `sanction_reason_required`, `decision_rules_not_in_notice`, `no_sanction_not_allowed` (inline `Alert`, `admin.conduct.errors.noSanctionNotAllowed`), version conflict | **Disabled:** whole form before the response or deadline (hint); *No sanction* disabled with hint `noneDisabled` when a non-overturned sanction or breach finding exists in 12 months |
| S16 | Immediate hold dialog | from S13 / S18 | 2-step `Dialog`, `RadioGroup` (2 grounds), S14 fields | pending | — | `immediate_hold_ground_invalid`; `org_already_restricted` → inline `Alert` `admin.conduct.errors.alreadyRestricted` on step 2, confirm removed | Toast `admin.conduct.hold.done`. **Hidden** (not disabled) on an org with an active hold, suspension or termination; shown on `rules_not_accepted` |
| S17 | Review panel | inside S13 | `RadioGroup`, `NativeSelect` (lower levels), `Textarea` | pending | — | `review_not_allowed`, `review_cannot_increase` | "Needs a second admin" state |
| S18 | Admin-initiated case | `/admin/disputes/conduct/new` | `Combobox` (org, referral), `RadioGroup`, `Textarea`, `EvidenceUploadList` | pending | — | Field errors | Redirect to S13 |
| S19 | Admin org page changes | `/admin/organizations/[orgId]` | Standing pill(s) (incl. `legacySuspended`), **Open conduct case**, **Lift…** `ConfirmDialog` (reason), **Lift termination…** `ConfirmDialog` (required error reason), "Network standing" and "Remaining obligations" `Panel`s | Existing | `noSanctions` / `noObligations` | Generic; termination lift by the decider → `errors.liftNotAllowed` | Lift toasts (`holdLifted`, `suspensionLifted`, `terminationLifted`). **Hidden:** Lift termination… for the deciding admin, replaced by the `liftTerminationSelf` line. Legacy suspension: Lift… only |
| S20 | **Restricted-org states** | job detail, jobs list, job form, `/opportunities`, `/opportunities/[matchId]`, composer | (a) nudge banner bodies + chip reasons; (b) job-form helper; (c) restricted `EmptyState` (`PauseCircle`); (d) composer: org-level inline `Alert`, per-user blocked submit panel with **Review and accept** | — | (c) is the empty state | `partner_activity_restricted`, `rules_acceptance_required` inline | — |
| S21 | **Partner: job unavailable** | `/opportunities/[matchId]` (partner) | `PageHeader` (job title), one `Panel` with `Info` icon + the BR-14 sentence, **Back to opportunities** | — | — | No referral or live match with that job → generic not-found | Same sentence (`network.partner.notTakingReferrals`) for every reason. Terminated and settled → `network.partner.noLongerMember` (RD-048, approved; en wording per PD-065) |
| S25 | **Data incident notice** (recipient org) | `/workspace/[orgSlug]/settings/standing/incidents/[noticeId]` (org_admin) | `Panel` with the admin's text, referral links, fixed guidance line for the recipient's side (`guidance` sourcing, `guidanceHiring` hiring, both if both) | Skeleton | — | Not a recipient → not found | — |
| S26 | **Send incident notice** (admin) | dialog in S13 after a 2.3 breach finding | `Checkbox` list (orgs), multi `Combobox` (referrals), `Textarea`s, locked guidance line(s), preview per variant in use (tabs `variantSourcing` / `variantHiring`, each with `variantRecipients`), `ConfirmDialog` | pending | No affected org listed → `admin.conduct.incident.orgsEmpty` | Field errors | Toast `admin.conduct.incident.done` |
| S27 | **Close stale referral** (admin) | S19 remaining-obligations list (terminated orgs) | "No activity for {n} days" tag, `ConfirmDialog` with reason | pending | — | `not_stale` / `not_terminated` inline | Row leaves the list. Toast |
| S22 | **Settlement mode** | (a) switcher marker; (b) settlement home at `/overview`; (c) settlement-mode page on blocked routes; (d) referral-closed state on a referral page that left scope; (e) first-access gate, personal statement only | `OrgSwitcher` pill, B6, `Panel` lists with counts and links; (d) `EmptyState` + **Go to referrals**; (e) S1 gate variant with one `Checkbox` | Skeleton counts | Counts of 0 show `network.settlement.nothingLeft` | Count load error → list without counts (`loadCountsError`) | (d) toast `network.settlement.referralClosed`, then `referralClosedTitle` + `referralClosedDescription` (§2.10 item 6a) |
| S23 | Team acceptance column **(Should)** | `/settings/team` (org_admin) | Column "Network Rules": `StatusPill` "Accepted {label}" / "Not accepted yet" | — | — | — | — |
| S24 | Notifications | activity popover / `/notifications` | Existing list | — | — | — | §5.12 kinds |

**Mobile (375px) notes:**
- **S1:** the rules text runs in the page flow, not inside a nested scroll box. A **Skip to acceptance** link (visible on focus and as a text link under the header) jumps to the statements. The statements, the status line and the button sit in a normal block at the end. They aren't sticky, because a sticky footer with two long checkboxes would cover most of a 375px screen. Checkbox rows are full-width labels with a ≥ 44px tap height. The language switch scrolls sideways (`SegmentedNav`), and its items get `min-h-11`.
- **S3 banners:** icon + title on line 1, body wraps, actions become full-width stacked buttons below 640px. Two stacked banners must not push the page header below the fold on a 667px-tall screen: B5 collapses to its title plus **Review and accept** under 640px, with the body behind a **Details** disclosure.
- **S4:** the TOC is a `Disclosure` "Contents" above the text. History is cards.
- **S8:** the dialog fills the viewport (inset 0, rounded top), with a sticky dialog header (title + close) and a sticky footer holding only **Send report**. The body scrolls. Category radios have their descriptions under each label.
- **S10 / S11:** history as cards. `BusinessDeadline` wraps between the date and the days left (existing behaviour).
- **S12–S17:** single column, actions after the record. Dialogs are full-height. The rule picker `Combobox` opens as a full-width popover.
- **S20 / S21 / S22:** standard `EmptyState` / `Panel` widths, with CTAs full-width.
- **Referral header (S7):** the icon-only button below 640px has `aria-label="Report a problem"` and a `Tooltip`. It wraps under the status pill if needed (the existing header already wraps; AC-62 of N2 must keep holding: no horizontal scroll).

---

## 4. Data & permissions

| Role | Can see | Can do |
|---|---|---|
| **org_admin** (own org) | Own acceptance status and the org's. The org's restriction reason (banner). Network standing: own org's notices, responses, follow-ups, decisions, sanctions, reviews, org acceptances, and (Should) members not accepted. **Conduct reports sent by any member of the org** (reporter view, §2.9; PD-058, Q-D6), with the sender's name or "former member". Sanction-related org audit events (§2.15). | Accept personally and for the org. Report a problem (referral either side, partner job). Respond to notices (once per case), answer follow-ups, request a review (once per decision). Everything in §2.6 / §2.10 per state. **Not:** reply to an info request on a colleague's report. |
| **recruiter_manager** | Own acceptance status. The restriction banner (no details, no standing link). Own reports. Org audit events except the sanction-related ones (§2.15). | Accept personally. Report a problem. In-flight work. |
| **recruiter** | Same as recruiter_manager, within RD-036 scope (own referrals only, so the report entry point shows only on referrals they can open). | Same as recruiter_manager. |
| **Reporting user** (while an active member of the reporting org) | Their own report: category, text, date, file names, status per §2.9, the triage-close reason, the outcome category, and admin questions to them. **Not**: the notice, the response, the finding, the sanction, the reported org's standing. After leaving the org: nothing. | Reply to info requests. |
| **Reporting org's `org_admin`s** | The same reporter view of every report sent by a member of the org, plus the sender's name (or "former member"). Same exclusions as the reporting user. Outcome notifications when the reporter has left (N10-D23). | Read only (no reply). |
| **Reporting org's other members** (`recruiter_manager`, `recruiter`) | Their own reports only. Not colleagues' reports, and not `conduct_report.filed` in the audit (§2.15). | — |
| **Reported org's members other than org_admin** | The banner for the org's restriction only. | In-flight work. |
| **Partner org** (any other org) | Only the BR-14 sentence on S21, and only if it has a referral on, or a live match with, that job. After a terminated org has settled: `network.partner.noLongerMember` (RD-048, approved). Restricted jobs vanish from opportunities. If named by an admin as affected by a 2.3 breach: the incident notice (org_admin only, S25). | Unchanged in-flight work with the restricted org. |
| **Platform admin** (any) | Everything about conduct cases: reporter user and org, report text and files (signed URLs, audited), notices, responses, decisions, sanctions, the bad-faith signal, acceptance records, remaining obligations, deciding and reviewing admins' names. | Publish versions. Triage, notice, follow-up, decide, immediate hold (2.3 / 4.8, only on an org not already held, suspended or terminated), lift a hold or a suspension, lift another admin's termination to correct an error, open admin-initiated cases. No acceptance needed in `/admin`. |
| **Platform admin, decider / hold applier** | Same. | **Can't** review their own decision or the decision on a hold they applied, and **can't** lift a termination they decided (DB refuses). |
| **Platform admin, reviewer** (≠ decider) | Same. | Confirm, reduce or overturn a requested review. Never increase. |
| **Candidate** | Nothing new. Delivery on confirmation continues in every org state (BR-13). | — |
| **Anonymous** | Nothing. `/network-rules` redirects to sign-in. | — |

**Must never cross tenants / never be exposed** (BR-18, BR-19, BR-21, BR-40, BR-42, BR-43):
- the **reporter's identity** (user and org) to the reported org, unless the admin names the org in the notice. Never the user;
- the **report text, category and files** to anyone but platform admins, the reporting user and the reporting org's `org_admin`s (text and file names only, through the reporter-view RPCs; never the files themselves);
- **response files** to anyone but platform admins;
- **conduct case data** to any non-admin. It lives only in closed `app.conduct_*` tables that no member role can select, and **no `public.disputes` row exists** for a conduct case (N10-D14). Members reach only the shaped views of §2.9 (reporting side) and §2.11 (reported org's admins);
- **platform admins' names or ids** (decider, reviewer, hold applier, lifter) to any member (N10-D28);
- **sanction-related audit events** to non-`org_admin` members (§2.15, BR-32);
- the **sanction or case outcome** in a data-incident notice (RD-045). Recipients see only the factual incident text;
- the **admin triage category** and the "Possible 9.4" tag to anyone but platform admins;
- the **existence of a conduct case** to the reported side through any side effect: release option, objection or contest eligibility, `disputes_open_guard`, X11 pause, N3 (BR-19);
- the **restriction reason, sanctions, warnings, cases, standing** to any other org: in UI, API, matching explanations, notifications or `job_hidden_reason` read from another org. A held job is indistinguishable from any hidden job except for the BR-14 sentence on S21;
- **allegation text** in any notification or email (BR-39);
- a **sanctioned org's details** to its own non-admin members (banner only);
- existing N1 / N2 rules still hold: job owners never see candidate ids, and raw `matches` are never exposed (S21 returns only the owner org name and the stored job title).

**New PII:**
- **Report and response content and files** may include candidate and client personal information (accepted as necessary evidence, BR-43). Canadian storage, admin-only, 60-second signed URLs, audited access. Extends the PD-024 admin-access exceptions in `security-and-privacy.md`. No purge in v1 (U-N10-5). Listed in the N7 PIA.
- **Report text read by the reporting org's `org_admin`s (PD-058, Q-D6):** a widened audience inside the same org for text the member wrote (it may name candidates or client contacts). No new data is collected; files stay admin-only. The report form's `whatHint` already asks for minimal detail. Note it in the N7 PIA with the rest.
- **Acceptance records:** user id, org id, version, locale, SHA-256, timestamp. No IP or user agent (brief Won't, C-1).
- **Notices, findings and review reasons** written by admins may name people. The guidance hint in S14 asks admins to minimize.

---

## 5. Copy

**Final copy** (ux-writer-marketing, 2026-11-16), including PD-058 (brief rev. 2 §9.0). en is the source; fr = fr-CA, pt = pt-BR. Glossary: `docs/content/voice-and-tone.md` §5.7 (updated with the N10 terms used here). **The frontend-engineer adds these keys to the JSON files**; no message file was edited in this step.

### 5.0 Rules for implementing this copy

- **Namespaces.** New namespace **`network`** (register it in `messages/<locale>/index.ts` for en, fr and pt). Additions go to `onboarding`, `jobs`, `opportunities`, `referrals`, `settings`, `admin` and `labels`. No new keys in `common` or `errors`: use `common.actions.back` / `cancel` / `close` / `edit` where a generic action is needed. Server error codes map to the keys in §5.16.
- **⚖️ = legal draft.** Keys marked ⚖️ ship as drafts until counsel signs off (C-1, C-3, C-4, C-5, C-7). Don't reword them in code. The full list is in §5.17.
- **Plurals** are JSON objects (`src/i18n/README.md`), not inline ICU: rows `key.one` / `key.other`, and both contain `{count}`. fr and pt treat 0 as `one`.
- **Links inside a sentence** use `…Before` / `…After` keys, with the support address as the link text in between (it's data, never translated). If no support address is configured, use the `…NoSupport` key instead.
- **Numbers in validation** use `{min}` / `{max}`, formatted with `f.number` (so fr shows "4 000" and pt "4.000").
- **Deadlines:** `{when}` is the formatted date and time. en writes `{when} ET`, fr `{when} HE`, pt `{when} (horário de Toronto)` in sentences and `{when} (Toronto)` in compact lines (voice-and-tone §6.5).
- **Templates in the notice's language.** Keys under `network.notice.*`, `network.decision.*`, `network.incident.intro` / `guidance` / `guidanceHiring` and `network.case.review.*` (outcome lines) are rendered in the **language of the notice** chosen by the admin, not in the viewer's UI locale (S11 and S25 wrap them in `lang`). The possible-outcomes line (`network.notice.possibleOutcomes`) and the incident guidance lines (`network.incident.guidance`, `network.incident.guidanceHiring`, per recipient's side) are **copied into the stored record at send time**, in that language (bilingual: fr-CA first, then en). Later copy changes never alter a sent notice.
- **fr typography.** Write a no-break space (U+00A0) before `:` and inside « », as in the rest of the fr files; the tables below show a regular space. The new `network.json` uses the curly apostrophe `’`. When adding to an existing fr file that uses straight `'` (`jobs`, `settings`, `admin`, `onboarding`, `referrals`, `opportunities`, `labels`), switch to `'` so each file keeps one style (voice-and-tone §6.2).
- **fr agreement.** fr never makes an adjective agree with `{org}` (a name of unknown gender). Strings for the member's own org say « votre organisation »; admin strings put « L'organisation {org} » first where agreement is needed. pt does the same with « A organização {org} ».
- **Who decided is never named to members** (PD-058, Q-D13): org-facing copy says "a Workatent platform admin" / « un administrateur de la plateforme Workatent » / "um admin da plataforma Workatent", never a name. Admin-only screens may show names.
- **Never shown to members:** sanction level in notifications, the reporter's identity (except the org, when the admin ticks the option), the admin category, "Possible 9.4".
- **fr length.** Buttons, pills, tabs and chips were checked against the +30% budget (voice-and-tone §6.3). Where fr went over, the fr text was shortened rather than the layout widened (e.g. « Restreindre et envoyer l'avis », « Statut réseau »). Banners and dialog bodies wrap and have no limit.

### 5.1 Acceptance: onboarding step, first-access gate, re-acceptance (S1, S2)

The Network Rules are a named document: **Network Rules** / **Règles du réseau** / **Regras da rede**. With a version, fr and pt put the version first ("version {label} des Règles du réseau", "versão {label} das Regras da rede").

| Key | en | fr | pt |
|---|---|---|---|
| `onboarding.steps.rules` | Network Rules | Règles du réseau | Regras da rede |
| `onboarding.titles.rules` | Accept the Network Rules | Accepter les Règles du réseau | Aceite as Regras da rede |
| `onboarding.titles.rulesDescription` | Every organization accepts these rules to join the network, and so does every member. | Chaque organisation accepte ces règles pour adhérer au réseau, tout comme chaque membre. | Toda organização aceita estas regras para entrar na rede, assim como cada membro. |
| `onboarding.review.rules` | Network Rules | Règles du réseau | Regras da rede |
| `onboarding.review.rulesValue` | Version {label}, accepted in {language} | Version {label}, acceptée en {language} | Versão {label}, aceita em {language} |
| `onboarding.review.editRules` | Review rules | Revoir les règles | Revisar as regras |
| `network.accept.title` | Network Rules {label} | Règles du réseau, version {label} | Regras da rede, versão {label} |
| `network.accept.gateIntro` | Before you use Workatent, read and accept the Network Rules. They set out how members share information, contact candidates and resolve problems. | Avant d’utiliser Workatent, lisez et acceptez les Règles du réseau. Elles expliquent comment les membres partagent l’information, communiquent avec les candidats et règlent les problèmes. | Antes de usar o Workatent, leia e aceite as Regras da rede. Elas explicam como os membros compartilham informações, falam com candidatos e resolvem problemas. |
| `network.accept.reacceptIntro` | The Network Rules are changing. Read what changed, then accept version {label}. | Les Règles du réseau changent. Lisez ce qui change, puis acceptez la version {label}. | As Regras da rede vão mudar. Veja o que mudou e aceite a versão {label}. |
| `network.accept.effective` | In effect since {date} | En vigueur depuis le {date} | Em vigor desde {date} |
| `network.accept.effectiveFuture` | Takes effect on {date} | Entre en vigueur le {date} | Entra em vigor em {date} |
| `network.accept.language` | Language of the rules | Langue des règles | Idioma das regras |
| `network.accept.languageOption.frCA` | Français | Français | Français |
| `network.accept.languageOption.en` | English | English | English |
| `network.accept.languageOption.ptBR` | Português | Português | Português |
| `network.accept.languageInline.en` | English | anglais | inglês |
| `network.accept.languageInline.frCA` | French | français | francês |
| `network.accept.languageInline.ptBR` | Portuguese | portugais | português |
| `network.accept.languageShownSr` | Rules shown in {language}. | Règles affichées en {language}. | Regras exibidas em {language}. |
| `network.accept.summaryTitle` ⚖️ | Summary (not part of the rules) | Résumé (ne fait pas partie des règles) | Resumo (não faz parte das regras) |
| `network.accept.changesTitle` | What changed | Ce qui change | O que mudou |
| `network.accept.compare` | Compare with the version you accepted | Comparer avec la version que vous avez acceptée | Comparar com a versão que você aceitou |
| `network.accept.newTabSr` | (opens in a new tab) | (s’ouvre dans un nouvel onglet) | (abre em uma nova aba) |
| `network.accept.skip` | Skip to acceptance | Aller à l’acceptation | Ir para o aceite |
| `network.accept.contents` | Contents | Table des matières | Sumário |
| `network.accept.statementsLegend` | Your acceptance | Votre acceptation | Seu aceite |
| `network.accept.member` ⚖️ | I’ve read the Network Rules and I accept them personally. | J’ai lu les Règles du réseau et je les accepte personnellement. | Li as Regras da rede e as aceito pessoalmente. |
| `network.accept.org` ⚖️ | I accept the Network Rules on behalf of {org}, and I have the authority to do so. | J’accepte les Règles du réseau au nom de {org}, et j’ai le pouvoir de le faire. | Aceito as Regras da rede em nome de {org} e tenho poderes para isso. |
| `network.accept.orgAlready` | {org} accepted these rules on {date}. | {org} a accepté ces règles le {date}. | {org} aceitou estas regras em {date}. |
| `network.accept.needOne` | Tick the box to continue. | Cochez la case pour continuer. | Marque a caixa para continuar. |
| `network.accept.needBoth` | Tick both boxes to continue. | Cochez les deux cases pour continuer. | Marque as duas caixas para continuar. |
| `network.accept.languageChanged` | The language changed. Tick the boxes again. | La langue a changé. Cochez les cases de nouveau. | O idioma mudou. Marque as caixas de novo. |
| `network.accept.submit` | Accept and continue | Accepter et continuer | Aceitar e continuar |
| `network.accept.submitting` | Accepting… | Acceptation… | Aceitando… |
| `network.accept.submitReaccept` | Accept version {label} | Accepter la version {label} | Aceitar a versão {label} |
| `network.accept.done` | Network Rules accepted. | Règles du réseau acceptées. | Regras da rede aceitas. |
| `network.accept.already` | You accepted Network Rules {label} on {date}. | Vous avez accepté la version {label} des Règles du réseau le {date}. | Você aceitou a versão {label} das Regras da rede em {date}. |
| `network.accept.versionChanged` | A new version of the Network Rules is now in effect. Read it and accept it to continue. | Une nouvelle version des Règles du réseau est en vigueur. Lisez-la et acceptez-la pour continuer. | Uma nova versão das Regras da rede está em vigor. Leia e aceite para continuar. |
| `network.accept.noVersion` | The Network Rules aren’t available right now. Try again later. | Les Règles du réseau ne sont pas accessibles pour le moment. Réessayez plus tard. | As Regras da rede não estão disponíveis no momento. Tente de novo mais tarde. |
| `network.accept.required` | Accept the Network Rules to create your organization. | Acceptez les Règles du réseau pour créer votre organisation. | Aceite as Regras da rede para criar sua organização. |
| `network.accept.saveError` | We couldn’t save your acceptance. Check your connection and try again. | Nous n’avons pas pu enregistrer votre acceptation. Vérifiez votre connexion et réessayez. | Não foi possível salvar seu aceite. Verifique sua conexão e tente de novo. |
| `network.accept.leaveBefore` | Don’t want to accept? Email | Vous ne voulez pas accepter? Écrivez à | Não quer aceitar? Escreva para |
| `network.accept.leaveAfter` | to leave the network. | pour quitter le réseau. | para sair da rede. |
| `network.accept.history` | Version history | Historique des versions | Histórico de versões |

Notes:
- The org statement says "I have the authority" / « j’ai le pouvoir » / "tenho poderes", not "authorized": **authorization** is reserved for the candidate's record (glossary §5.3).
- "Tick the box" replaces "Tick the statement": shorter, and pt "declaração" is the glossary word for *attestation*.
- In settlement mode, the gate shows the personal statement only (PD-058, Q-D1), so it uses `needOne`.
- `onboarding.review.rulesValue` takes `{language}` from `languageInline.*` (lower case mid-sentence in fr and pt).

### 5.2 Banners B2–B6 (S3)

`network.banner.cta.accept` and `network.banner.cta.standing` are the **only** keys for "Review and accept" and "View network standing", wherever those actions appear (banners, job nudge, job form, composer, opportunities, standing page).

| Key | en | fr | pt |
|---|---|---|---|
| `network.banner.hold.title` | Your organization is on a network hold | Votre organisation fait l’objet d’une restriction réseau | Sua organização está com restrição de rede |
| `network.banner.hold.body` | You can’t open jobs to partners, submit referrals or receive new ones. Referrals in progress continue as usual. | Vous ne pouvez pas ouvrir de postes aux partenaires, soumettre de recommandations ni en recevoir de nouvelles. Les recommandations en cours se poursuivent normalement. | Você não pode abrir vagas para parceiros, enviar indicações nem receber novas. As indicações em andamento continuam normalmente. |
| `network.banner.rules.title` | Network Rules {label} not accepted | Version {label} des Règles du réseau non acceptée | Versão {label} das Regras da rede não aceita |
| `network.banner.rules.body` | {org} hasn’t accepted the version in effect since {date}. Until an organization admin accepts it, you can’t open jobs to partners or submit referrals. Referrals in progress continue. | {org} n’a pas accepté la version en vigueur depuis le {date}. Tant qu’un administrateur de l’organisation ne l’a pas acceptée, vous ne pouvez pas ouvrir de postes aux partenaires ni soumettre de recommandations. Les recommandations en cours se poursuivent. | {org} não aceitou a versão em vigor desde {date}. Até um administrador da organização aceitar, você não pode abrir vagas para parceiros nem enviar indicações. As indicações em andamento continuam. |
| `network.banner.rules.askAdmin` | Ask an organization admin to accept it. | Demandez à un administrateur de l’organisation de l’accepter. | Peça a um administrador da organização para aceitar. |
| `network.banner.user.title` | Accept Network Rules {label} | Acceptez la version {label} des Règles du réseau | Aceite a versão {label} das Regras da rede |
| `network.banner.user.body` | Until you accept the version in effect since {date}, you can’t submit referrals or open jobs to partners. Everything else works as usual. | Tant que vous n’avez pas accepté la version en vigueur depuis le {date}, vous ne pouvez pas soumettre de recommandations ni ouvrir de postes aux partenaires. Le reste fonctionne normalement. | Até você aceitar a versão em vigor desde {date}, não pode enviar indicações nem abrir vagas para parceiros. O resto funciona normalmente. |
| `network.banner.notice.title` | Network Rules {label} take effect on {date} | La version {label} des Règles du réseau entre en vigueur le {date} | A versão {label} das Regras da rede entra em vigor em {date} |
| `network.banner.notice.body` | Review the changes and accept them before that date. | Prenez connaissance des changements et acceptez-les avant cette date. | Veja as mudanças e aceite antes dessa data. |
| `network.banner.notice.orgPending` | {org} hasn’t accepted yet. An organization admin needs to accept for it. | {org} n’a pas encore accepté. Un administrateur de l’organisation doit accepter en son nom. | {org} ainda não aceitou. Um administrador da organização precisa aceitar em nome dela. |
| `network.banner.settlement.suspended.title` | Your organization is suspended | Votre organisation est suspendue | Sua organização está suspensa |
| `network.banner.settlement.suspended.body` ⚖️ | You can still finish referrals in progress, settle commissions and answer disputes. Your obligations to partners continue. | Vous pouvez encore finaliser les recommandations en cours, régler les commissions et répondre aux litiges. Vos obligations envers les partenaires continuent. | Você ainda pode concluir as indicações em andamento, acertar as comissões e responder a disputas. Suas obrigações com os parceiros continuam. |
| `network.banner.settlement.terminated.title` | Your organization was removed from the network on {date} | Votre organisation a été retirée du réseau le {date} | Sua organização foi retirada da rede em {date} |
| `network.banner.settlement.terminated.body` ⚖️ | You can finish referrals in progress and settle commissions and disputes. When everything is settled, your organization’s members lose access to Workatent. | Vous pouvez finaliser les recommandations en cours et régler les commissions et les litiges. Une fois tout réglé, les membres de votre organisation n’auront plus accès à Workatent. | Você pode concluir as indicações em andamento e acertar comissões e disputas. Quando tudo estiver acertado, os membros da sua organização perdem o acesso ao Workatent. |
| `network.banner.cta.standing` | View network standing | Voir le statut réseau | Ver situação na rede |
| `network.banner.cta.accept` | Review and accept | Examiner et accepter | Revisar e aceitar |
| `network.banner.cta.changes` | What changed | Voir les changements | Ver as mudanças |
| `network.banner.cta.details` | Details | Détails | Detalhes |

Notes:
- B6 titles say "Your organization" instead of `{org}`: the reader is a member of that org, and fr/pt avoid agreeing with a name.
- B6 terminated no longer says "this workspace closes" ("workspace" isn't a product object, glossary §4). It says who loses access and when.

### 5.3 Versions page (S4) and version types

The **Back** link uses `common.actions.back`.

| Key | en | fr | pt |
|---|---|---|---|
| `network.versions.metaTitle` | Network Rules | Règles du réseau | Regras da rede |
| `network.versions.title` | Network Rules | Règles du réseau | Regras da rede |
| `network.versions.description` | The rules every organization and member accepts to use the Workatent network. | Les règles que chaque organisation et chaque membre acceptent pour utiliser le réseau Workatent. | As regras que cada organização e cada membro aceitam para usar a rede Workatent. |
| `network.versions.current` | Current version: {label} | Version en vigueur : {label} | Versão atual: {label} |
| `network.versions.inEffect` | In effect since {date} | En vigueur depuis le {date} | Em vigor desde {date} |
| `network.versions.upcoming` | Upcoming version: {label} | Prochaine version : {label} | Próxima versão: {label} |
| `network.versions.takesEffect` | Takes effect on {date} | Entre en vigueur le {date} | Entra em vigor em {date} |
| `network.versions.readFull` | Read the full text | Lire le texte complet | Ler o texto completo |
| `network.versions.history` | Version history | Historique des versions | Histórico de versões |
| `network.versions.historyCaption` | Published versions of the Network Rules | Versions publiées des Règles du réseau | Versões publicadas das Regras da rede |
| `network.versions.col.version` | Version | Version | Versão |
| `network.versions.col.type` | Type | Type | Tipo |
| `network.versions.col.effective` | In effect from | En vigueur à partir du | Em vigor a partir de |
| `network.versions.col.changes` | What changed | Ce qui a changé | O que mudou |
| `network.versions.read` | Read version {label} | Lire la version {label} | Ler a versão {label} |
| `network.versions.fingerprint` | Fingerprint (SHA-256) | Empreinte (SHA-256) | Impressão digital (SHA-256) |
| `network.versions.fingerprintHint` | A unique code for this exact text, in this language. It shows which text was accepted. | Un code unique pour ce texte exact, dans cette langue. Il permet de savoir quel texte a été accepté. | Um código único para este texto exato, neste idioma. Ele mostra qual texto foi aceito. |
| `network.versions.statusTitle` | Your status | Votre statut | Sua situação |
| `network.versions.youAccepted` | You accepted version {label} on {date}. | Vous avez accepté la version {label} le {date}. | Você aceitou a versão {label} em {date}. |
| `network.versions.youHaveNot` | You haven’t accepted version {label} yet. | Vous n’avez pas encore accepté la version {label}. | Você ainda não aceitou a versão {label}. |
| `network.versions.orgAccepted` | {org} accepted version {label} on {date}. | {org} a accepté la version {label} le {date}. | {org} aceitou a versão {label} em {date}. |
| `network.versions.orgHasNot` | {org} hasn’t accepted version {label}. | {org} n’a pas accepté la version {label}. | {org} não aceitou a versão {label}. |
| `network.versions.legalReason` | Why this change takes effect sooner: {reason} | Pourquoi ce changement entre en vigueur plus tôt : {reason} | Por que esta mudança entra em vigor antes: {reason} |
| `network.versions.empty` | The Network Rules aren’t published yet. | Les Règles du réseau ne sont pas encore publiées. | As Regras da rede ainda não foram publicadas. |
| `network.versions.footerLink` | Network Rules | Règles du réseau | Regras da rede |
| `labels.rulesVersionType.initial` | First version | Première version | Primeira versão |
| `labels.rulesVersionType.material` | Material change | Modification importante | Mudança relevante |
| `labels.rulesVersionType.non_material` | Minor change | Modification mineure | Mudança menor |
| `labels.rulesVersionType.legally_required` | Required by law | Exigée par la loi | Exigida por lei |

Notes: fr "modification importante" and pt "mudança relevante" are the words rule 10.2 uses in each file. `read` names the version so the link makes sense out of context (screen-reader link lists).

### 5.4 Restricted org, partner view and shared errors (S20, S21)

The draft's `{reason}` fragments (`jobs.form.reason.*`, `referrals.composer.restricted`) are replaced by **whole sentences per reason**: glued fragments can't be reordered in fr and pt (voice-and-tone §6.8). The CTAs use `network.banner.cta.accept` / `cta.standing`, and the non-admin line uses `network.banner.rules.askAdmin`.

| Key | en | fr | pt |
|---|---|---|---|
| `network.partner.notTakingReferrals` | {org} isn’t taking new referrals right now. | {org} n’accepte pas de nouvelles recommandations pour le moment. | {org} não está recebendo novas indicações no momento. |
| `network.partner.noLongerMember` ⚖️ | {org} is no longer part of the Workatent network. | {org} ne fait plus partie du réseau Workatent. | {org} não faz mais parte da rede Workatent. |
| `network.partner.back` | Back to opportunities | Retour aux occasions | Voltar para oportunidades |
| `referrals.detail.closedStaleOwn` | Closed by Workatent: no activity for 60 days after your organization was removed from the network. | Fermée par Workatent : aucune activité pendant 60 jours après le retrait de votre organisation du réseau. | Encerrada pelo Workatent: sem atividade por 60 dias após a retirada da sua organização da rede. |
| `referrals.detail.closedStalePartner` | Closed by Workatent after a long period with no activity. | Fermée par Workatent après une longue période sans activité. | Encerrada pelo Workatent após um longo período sem atividade. |
| `network.team.lastAdmin` | Your organization needs at least one active organization admin. | Votre organisation doit garder au moins un administrateur actif. | Sua organização precisa de pelo menos um administrador ativo. |
| `jobs.nudge.bodyHold` | Your organization is on a network hold, so partners can’t see this job. Its settings are saved, and it’s visible again when the hold ends. Referrals you already received aren’t affected. | Votre organisation fait l’objet d’une restriction réseau, alors les partenaires ne voient pas ce poste. Ses paramètres sont conservés, et il redevient visible à la fin de la restriction. Les recommandations déjà reçues ne sont pas touchées. | Sua organização está com restrição de rede, então os parceiros não veem esta vaga. As configurações estão salvas, e ela volta a ficar visível quando a restrição terminar. As indicações já recebidas não são afetadas. |
| `jobs.nudge.bodyRules` | Your organization hasn’t accepted the current Network Rules, so partners can’t see this job. It’s visible again as soon as an organization admin accepts them. Referrals you already received aren’t affected. | Votre organisation n’a pas accepté les Règles du réseau en vigueur, alors les partenaires ne voient pas ce poste. Il redevient visible dès qu’un administrateur de l’organisation les accepte. Les recommandations déjà reçues ne sont pas touchées. | Sua organização não aceitou as Regras da rede em vigor, então os parceiros não veem esta vaga. Ela volta a ficar visível assim que um administrador da organização aceitar. As indicações já recebidas não são afetadas. |
| `jobs.nudge.chipHold` | Hidden from partners: network hold | Masqué aux partenaires : restriction réseau | Oculta para parceiros: restrição de rede |
| `jobs.nudge.chipRules` | Hidden from partners: rules not accepted | Masqué aux partenaires : règles non acceptées | Oculta para parceiros: regras não aceitas |
| `jobs.form.restrictedHold` | Saved, but hidden from partners while your organization is on a network hold. | Enregistré, mais masqué aux partenaires tant que votre organisation fait l’objet d’une restriction réseau. | Configuração salva, mas a vaga fica oculta para parceiros enquanto sua organização estiver com restrição de rede. |
| `jobs.form.restrictedRules` | Saved, but hidden from partners until an organization admin accepts the current Network Rules. | Enregistré, mais masqué aux partenaires tant qu’un administrateur de l’organisation n’a pas accepté les Règles du réseau en vigueur. | Configuração salva, mas a vaga fica oculta para parceiros até um administrador da organização aceitar as Regras da rede em vigor. |
| `jobs.form.userMustAccept` | Accept Network Rules {label} to open jobs to partners. | Acceptez la version {label} des Règles du réseau pour ouvrir des postes aux partenaires. | Aceite a versão {label} das Regras da rede para abrir vagas para parceiros. |
| `jobs.form.errors.userMustAccept` | Accept Network Rules {label} before you open a job to partners. Then save again. | Acceptez la version {label} des Règles du réseau avant d’ouvrir un poste aux partenaires, puis enregistrez de nouveau. | Aceite a versão {label} das Regras da rede antes de abrir uma vaga para parceiros. Depois, salve de novo. |
| `opportunities.restricted.title` | Partner opportunities are paused | Les occasions des partenaires sont en pause | As oportunidades de parceiros estão pausadas |
| `opportunities.restricted.hold` | Your organization is on a network hold, so you can’t see partner jobs or submit referrals. Referrals in progress continue. | Votre organisation fait l’objet d’une restriction réseau : vous ne voyez pas les postes des partenaires et ne pouvez pas soumettre de recommandations. Les recommandations en cours se poursuivent. | Sua organização está com restrição de rede, então você não vê vagas de parceiros nem pode enviar indicações. As indicações em andamento continuam. |
| `opportunities.restricted.rules` | Your organization hasn’t accepted Network Rules {label}, so you can’t see partner jobs or submit referrals. Referrals in progress continue. | Votre organisation n’a pas accepté la version {label} des Règles du réseau : vous ne voyez pas les postes des partenaires et ne pouvez pas soumettre de recommandations. Les recommandations en cours se poursuivent. | Sua organização não aceitou a versão {label} das Regras da rede, então você não vê vagas de parceiros nem pode enviar indicações. As indicações em andamento continuam. |
| `referrals.composer.restrictedHold` | You can’t submit referrals while your organization is on a network hold. | Vous ne pouvez pas soumettre de recommandations tant que votre organisation fait l’objet d’une restriction réseau. | Você não pode enviar indicações enquanto sua organização estiver com restrição de rede. |
| `referrals.composer.restrictedRules` | You can’t submit referrals until an organization admin accepts the current Network Rules. | Vous ne pouvez pas soumettre de recommandations tant qu’un administrateur de l’organisation n’a pas accepté les Règles du réseau en vigueur. | Você não pode enviar indicações até um administrador da organização aceitar as Regras da rede em vigor. |
| `referrals.composer.userMustAccept` | Accept Network Rules {label} to submit referrals. | Acceptez la version {label} des Règles du réseau pour soumettre des recommandations. | Aceite a versão {label} das Regras da rede para enviar indicações. |
| `network.errors.acceptanceRequired` | Accept the current Network Rules to do this. | Acceptez les Règles du réseau en vigueur pour faire cette action. | Aceite as Regras da rede em vigor para fazer isso. |
| `network.errors.reviewRulesLink` | Review the rules | Voir les règles | Ver as regras |
| `network.errors.partnerActivityRestricted` | Your organization can’t do this while new partner activity is paused. Referrals in progress aren’t affected. | Votre organisation ne peut pas faire cette action pendant que les nouvelles activités avec les partenaires sont en pause. Les recommandations en cours ne sont pas touchées. | Sua organização não pode fazer isso enquanto novas atividades com parceiros estão pausadas. As indicações em andamento não são afetadas. |
| `network.errors.settlementUnavailable` | This isn’t available while your organization is in settlement mode. | Cette action n’est pas offerte pendant que votre organisation est en mode finalisation. | Isso não está disponível enquanto sua organização estiver em modo de finalização. |

Notes:
- **BR-14 sentence** (`notTakingReferrals`): one key, byte-identical for hold, rules not accepted, network pending, suspension and termination while settling (AC-49). fr and pt reuse the wording of rule 9.1 in their rules files.
- **`noLongerMember`** en text chosen by the founder (PD-065): "is no longer part of", consistent with the glossary (member = person) and with fr/pt. The key name stays `noLongerMember`. Counsel C-7 checks the wording. It is also the muted line on the partner's closed referral with that org.
- `closedStaleOwn` is shown only to the terminated org's side. `closedStalePartner` names no cause (BR-14).
- `jobs.form.errors.userMustAccept` is the inline error when `rules_acceptance_required` refuses switching a job to open, or creating an open job (PD-058, Q-D4). Saving other edits to an already-open job isn't refused, so the message only covers opening.
- The self-deactivation refusal reuses the existing `onboarding.errors.selfChange`.

### 5.5 Report a problem (S7, S8)

**Which "use the right tool" lines show** (RD-044; the server says which apply):

| Line | Sourcing side | Hiring side | Partner job (b) |
|---|---|---|---|
| `position` + link or `positionText` | **Contest objection** when an open objection exists, otherwise `positionText` | **File objection** when filing is allowed, otherwise `positionText` | not shown |
| `hire` + `hireText…` | shown (until N3, the text; then the N3 hire report) | not shown (the hiring side reports hires itself) | not shown |
| `amount` + **Open a dispute** or `amountText` | link when a placement exists, otherwise text | same | text only |
| `noAnswer` + text | `noAnswerText` | `noAnswerTextHiring` | `noAnswerTextJob` |

`messagesFirst` shows on referral reports only (a partner job has no messages).

| Key | en | fr | pt |
|---|---|---|---|
| `network.report.button` | Report a problem | Signaler un problème | Relatar um problema |
| `network.report.buttonAria` | Report a problem with {org} | Signaler un problème avec {org} | Relatar um problema com {org} |
| `network.report.title` | Report a problem with {org} | Signaler un problème avec {org} | Relatar um problema com {org} |
| `network.report.intro` | Use this if you think {org} broke the Network Rules. A report is about behaviour. It doesn’t decide who was first, whether a hire happened or what’s owed. | Utilisez ce formulaire si vous pensez que {org} a enfreint les Règles du réseau. Un signalement porte sur un comportement. Il ne décide pas qui a la priorité, s’il y a eu une embauche ni ce qui est dû. | Use este formulário se você acha que {org} descumpriu as Regras da rede. Um relato trata de conduta. Ele não decide quem tem a prioridade, se houve contratação nem o que é devido. |
| `network.report.messagesFirst` | If it isn’t urgent, you can first try the referral messages. That’s optional. | Si ce n’est pas urgent, vous pouvez d’abord essayer les messages de la recommandation. C’est facultatif. | Se não for urgente, você pode tentar primeiro as mensagens da indicação. Isso é opcional. |
| `network.report.rightTool.title` | Is this about first position, a hire or money? | S’agit-il de priorité, d’embauche ou d’argent? | É sobre prioridade, contratação ou dinheiro? |
| `network.report.rightTool.position` | Is this about who presented the candidate first? | Est-ce une question de priorité : qui a présenté le candidat en premier? | É sobre quem apresentou o candidato primeiro? |
| `network.report.rightTool.positionText` | Objections are filed from the referral within 5 business days of delivery. If the other side files one, you can contest it from the referral. | Les objections se déposent à partir de la recommandation, dans les 5 jours ouvrables suivant sa transmission. Si l’autre partie en dépose une, vous pouvez la contester à partir de la recommandation. | As objeções são registradas na própria indicação, em até 5 dias úteis após a entrega. Se a outra parte registrar uma, você pode contestar na indicação. |
| `network.report.rightTool.fileObjection` | File objection | Déposer une objection | Registrar objeção |
| `network.report.rightTool.contestObjection` | Contest objection | Contester l’objection | Contestar objeção |
| `network.report.rightTool.hire` | Was your candidate hired? | Votre candidat a-t-il été embauché? | Seu candidato foi contratado? |
| `network.report.rightTool.hireTextBefore` | Write to {org} in the referral messages. If they don’t answer, email | Écrivez à {org} dans les messages de la recommandation. Sans réponse, écrivez à | Escreva para {org} nas mensagens da indicação. Se não responderem, escreva para |
| `network.report.rightTool.hireTextAfter` | . | . | . |
| `network.report.rightTool.hireTextNoSupport` | Write to {org} in the referral messages. | Écrivez à {org} dans les messages de la recommandation. | Escreva para {org} nas mensagens da indicação. |
| `network.report.rightTool.amount` | Is an amount wrong or unpaid? | Un montant est-il erroné ou impayé? | Algum valor está errado ou não foi pago? |
| `network.report.rightTool.openDispute` | Open a dispute | Ouvrir un litige | Abrir disputa |
| `network.report.rightTool.amountText` | Amounts are settled with a dispute on the placement, not with a report. | Les montants se règlent par un litige sur le placement, pas par un signalement. | Valores são resolvidos com uma disputa na colocação, não com um relato. |
| `network.report.rightTool.noAnswer` | No answer from the partner? | Pas de réponse du partenaire? | O parceiro não responde? |
| `network.report.rightTool.noAnswerText` | That isn’t a breach. You can withdraw the referral, or wait for the response deadline. | Ce n’est pas un manquement. Vous pouvez retirer la recommandation ou attendre la fin du délai de réponse. | Isso não é uma violação. Você pode retirar a indicação ou esperar o prazo de resposta. |
| `network.report.rightTool.noAnswerTextHiring` | That isn’t a breach. You can decline the referral if you can’t move forward. | Ce n’est pas un manquement. Vous pouvez refuser la recommandation si vous ne pouvez pas avancer. | Isso não é uma violação. Você pode recusar a indicação se não puder avançar. |
| `network.report.rightTool.noAnswerTextJob` | That isn’t a breach of the Network Rules. | Ce n’est pas un manquement aux Règles du réseau. | Isso não é uma violação das Regras da rede. |
| `network.report.category` | What’s the problem? | Quel est le problème? | Qual é o problema? |
| `labels.conductCategory.went_around` | They went around me to the candidate or the client | Ils m’ont contourné auprès du candidat ou du client | Passaram por cima de mim com o candidato ou o cliente |
| `labels.conductCategory.misused` | They used what I shared for something else | Ils ont utilisé ce que j’ai partagé à d’autres fins | Usaram o que compartilhei para outra finalidade |
| `labels.conductCategory.shared_outside` | They shared my information outside their organization | Ils ont communiqué mes renseignements à l’extérieur de leur organisation | Compartilharam minhas informações fora da organização deles |
| `labels.conductCategory.hire_payout` | They didn’t report a hire, or didn’t pay my share on time | Ils n’ont pas déclaré une embauche ou n’ont pas versé ma part à temps | Não informaram uma contratação ou não fizeram o repasse da minha parte no prazo |
| `labels.conductCategory.false_info` | False or forged information | Renseignements faux ou falsifiés | Informações falsas ou falsificadas |
| `labels.conductCategory.job_terms` | The job or its terms are fake or misleading | Le poste ou ses conditions sont fictifs ou trompeurs | A vaga ou os termos são falsos ou enganosos |
| `labels.conductCategory.discrimination` | Discrimination | Discrimination | Discriminação |
| `labels.conductCategory.retaliation` | Retaliation, public accusations or a bad-faith report | Représailles, accusations publiques ou signalement de mauvaise foi | Retaliação, acusações públicas ou relato de má-fé |
| `labels.conductCategory.other` | Something else | Autre chose | Outro problema |
| `network.report.categoryHint.went_around` | For example, they contacted your client about the job or fee, or your candidate behind your back. | Par exemple, ils ont joint votre client au sujet du poste ou des honoraires, ou votre candidat à votre insu. | Por exemplo, falaram com seu cliente sobre a vaga ou a taxa, ou com seu candidato sem você saber. |
| `network.report.categoryHint.misused` | For example, they used your candidate for other jobs, added them to their database or reposted your job. | Par exemple, ils ont proposé votre candidat pour d’autres postes, l’ont ajouté à leur base de données ou ont republié votre poste. | Por exemplo, usaram seu candidato para outras vagas, adicionaram ao banco de dados deles ou republicaram sua vaga. |
| `network.report.categoryHint.shared_outside` | For example, they sent a candidate’s resume to another agency or company. | Par exemple, ils ont envoyé le CV d’un candidat à une autre agence ou entreprise. | Por exemplo, enviaram o currículo de um candidato para outra agência ou empresa. |
| `network.report.categoryHint.hire_payout` | For example, the client hired your candidate and it wasn’t reported, or your payout is late. | Par exemple, le client a embauché votre candidat sans que ce soit déclaré, ou votre versement est en retard. | Por exemplo, o cliente contratou seu candidato e isso não foi informado, ou seu repasse está atrasado. |
| `network.report.categoryHint.false_info` | For example, a candidate who never agreed, a fake confirmation, false evidence or a false hire report. | Par exemple, un candidat qui n’a jamais accepté, une fausse confirmation, de fausses pièces justificatives ou une fausse déclaration d’embauche. | Por exemplo, um candidato que nunca concordou, uma confirmação falsa, comprovantes falsos ou um registro de contratação falso. |
| `network.report.categoryHint.job_terms` | For example, no real opening, a stale job, wrong terms, or pressure to change the terms. | Par exemple, aucun poste réel à pourvoir, un poste périmé, des conditions inexactes ou des pressions pour changer les conditions. | Por exemplo, vaga que não existe, vaga desatualizada, termos errados ou pressão para mudar os termos. |
| `network.report.categoryHint.discrimination` | Unfair treatment of a candidate based on a ground protected by human rights laws. | Traitement injuste d’un candidat fondé sur un motif protégé par les lois sur les droits de la personne. | Tratamento injusto de um candidato com base em um motivo protegido pelas leis de direitos humanos. |
| `network.report.categoryHint.retaliation` | For example, they punished you for a report, accused you in public or reported you in bad faith. | Par exemple : des mesures contre vous après un signalement, des accusations publiques ou un signalement de mauvaise foi. | Por exemplo, puniram você por um relato, acusaram você em público ou relataram você de má-fé. |
| `network.report.categoryHint.other` | Another rule you think was broken. | Une autre règle qui, selon vous, a été enfreinte. | Outra regra que você acha que foi descumprida. |
| `network.report.hirePayoutMoney` | A report doesn’t collect the money. For an amount, open a dispute on the placement. | Un signalement ne permet pas de récupérer l’argent. Pour un montant, ouvrez un litige sur le placement. | Um relato não cobra o valor. Para cobrar um valor, abra uma disputa na colocação. |
| `network.report.what` | What happened? | Que s’est-il passé? | O que aconteceu? |
| `network.report.whatHint` | Facts, dates and where it happened. Share only the candidate or client details we need. | Les faits, les dates et l’endroit où c’est arrivé. Ne donnez que les renseignements sur le candidat ou le client dont nous avons besoin. | Fatos, datas e onde aconteceu. Compartilhe só os dados do candidato ou do cliente de que precisamos. |
| `network.report.counter` | {count} / {max} | {count} / {max} | {count} / {max} |
| `network.report.counterSr` | {count} of {max} characters used | {count} caractères sur {max} | {count} de {max} caracteres |
| `network.report.when` | When did it happen? (optional) | Quand est-ce arrivé? (facultatif) | Quando aconteceu? (opcional) |
| `network.report.approximate` | The date is approximate. | La date est approximative. | A data é aproximada. |
| `network.report.files` | Evidence (optional) | Pièces justificatives (facultatif) | Comprovantes (opcional) |
| `network.report.filesHint` | Up to 5 files: PDF, PNG or JPEG, 10 MB each. Only Workatent platform admins can open them. {org} never sees them. | Jusqu’à 5 fichiers : PDF, PNG ou JPEG, 10 Mo chacun. Seuls les administrateurs de la plateforme Workatent peuvent les ouvrir. {org} ne les voit jamais. | Até 5 arquivos: PDF, PNG ou JPEG, 10 MB cada. Só os admins da plataforma Workatent podem abrir esses arquivos. {org} nunca os vê. |
| `network.report.identity` | We never show your name to {org}. We name your organization only if they need it to respond fairly. Only two organizations are on a referral, so they may still guess who reported it. Retaliating against a report is a breach (rule 7.1). | Nous ne montrons jamais votre nom à {org}. Nous nommons votre organisation seulement si c’est nécessaire pour qu’elle puisse répondre équitablement. Comme une recommandation ne réunit que deux organisations, elle pourrait quand même deviner l’origine du signalement. Les représailles contre un signalement sont un manquement (règle 7.1). | Nunca mostramos seu nome para {org}. Só informamos sua organização se for necessário para uma resposta justa. Como só duas organizações participam de uma indicação, ela ainda pode deduzir quem fez o relato. Retaliar um relato é uma violação (regra 7.1). |
| `network.report.identityJob` | We never show your name to {org}. We name your organization only if they need it to respond fairly. They may still be able to tell where the report came from. Retaliating against a report is a breach (rule 7.1). | Nous ne montrons jamais votre nom à {org}. Nous nommons votre organisation seulement si c’est nécessaire pour qu’elle puisse répondre équitablement. Elle pourrait quand même deviner l’origine du signalement. Les représailles contre un signalement sont un manquement (règle 7.1). | Nunca mostramos seu nome para {org}. Só informamos sua organização se for necessário para uma resposta justa. Ela ainda pode deduzir de onde veio o relato. Retaliar um relato é uma violação (regra 7.1). |
| `network.report.attest` ⚖️ | I’m reporting this in good faith, and it’s accurate to the best of my knowledge. I understand that a report made in bad faith is a breach. | Je fais ce signalement de bonne foi et il est exact au meilleur de ma connaissance. Je comprends qu’un signalement fait de mauvaise foi est un manquement. | Faço este relato de boa-fé e ele é verdadeiro até onde sei. Entendo que um relato de má-fé é uma violação. |
| `network.report.submit` | Send report | Envoyer le signalement | Enviar relato |
| `network.report.sending` | Sending… | Envoi… | Enviando… |
| `network.report.filesWaiting` | Wait until every file is checked. | Attendez que chaque fichier soit vérifié. | Aguarde a verificação de todos os arquivos. |
| `network.report.removeRejected` | Remove the file that can’t be used. | Retirez le fichier qui ne peut pas être utilisé. | Remova o arquivo que não pode ser usado. |
| `network.report.errorSummary.one` | Fix {count} field to send your report. | Corrigez {count} champ pour envoyer le signalement. | Corrija {count} campo para enviar o relato. |
| `network.report.errorSummary.other` | Fix {count} fields to send your report. | Corrigez {count} champs pour envoyer le signalement. | Corrija {count} campos para enviar o relato. |
| `network.report.sentTitle` | Report sent | Signalement envoyé | Relato enviado |
| `network.report.sentBody` | We aim to respond within 2 business days, by {when} ET. We’ll tell you the outcome. | Nous visons à répondre dans les 2 jours ouvrables, d’ici le {when} HE. Nous vous informerons du résultat. | Buscamos responder em até 2 dias úteis, até {when} (horário de Toronto). Vamos informar o resultado. |
| `network.report.view` | View your report | Voir votre signalement | Ver seu relato |
| `network.report.discardTitle` | Discard this report? | Abandonner ce signalement? | Descartar este relato? |
| `network.report.discardBody` | What you wrote and the files you added will be lost. | Votre texte et les fichiers ajoutés seront perdus. | O texto e os arquivos que você adicionou serão perdidos. |
| `network.report.discardConfirm` | Discard report | Abandonner le signalement | Descartar relato |
| `network.report.youReported` | You reported a problem on {date}. | Vous avez signalé un problème le {date}. | Você relatou um problema em {date}. |
| `network.report.youReportedLink` | View report | Voir le signalement | Ver relato |
| `network.report.errors.notFound` | We couldn’t find this referral or job. | Nous n’avons pas trouvé cette recommandation ou ce poste. | Não encontramos esta indicação ou vaga. |
| `network.report.errors.self` | You can’t report your own organization. | Vous ne pouvez pas signaler votre propre organisation. | Você não pode relatar sua própria organização. |
| `network.report.errors.userLimitBefore` | You’ve sent 5 reports in the last 24 hours. Try again later, or email | Vous avez envoyé 5 signalements au cours des dernières 24 heures. Réessayez plus tard, ou écrivez à | Você enviou 5 relatos nas últimas 24 horas. Tente de novo mais tarde ou escreva para |
| `network.report.errors.userLimitAfter` | if it’s urgent. | si c’est urgent. | se for urgente. |
| `network.report.errors.userLimitNoSupport` | You’ve sent 5 reports in the last 24 hours. Try again later. | Vous avez envoyé 5 signalements au cours des dernières 24 heures. Réessayez plus tard. | Você enviou 5 relatos nas últimas 24 horas. Tente de novo mais tarde. |
| `network.report.errors.orgLimitBefore` | Your organization has sent 10 reports in the last 24 hours. Try again later, or email | Votre organisation a envoyé 10 signalements au cours des dernières 24 heures. Réessayez plus tard, ou écrivez à | Sua organização enviou 10 relatos nas últimas 24 horas. Tente de novo mais tarde ou escreva para |
| `network.report.errors.orgLimitAfter` | if it’s urgent. | si c’est urgent. | se for urgente. |
| `network.report.errors.orgLimitNoSupport` | Your organization has sent 10 reports in the last 24 hours. Try again later. | Votre organisation a envoyé 10 signalements au cours des dernières 24 heures. Réessayez plus tard. | Sua organização enviou 10 relatos nas últimas 24 horas. Tente de novo mais tarde. |
| `network.report.errors.category` | Choose what the problem is. | Choisissez le type de problème. | Escolha qual é o problema. |
| `network.report.errors.attest` | Confirm that you’re reporting in good faith. | Confirmez que vous faites ce signalement de bonne foi. | Confirme que você está relatando de boa-fé. |
| `network.report.errors.dateFuture` | The date can’t be in the future. | La date ne peut pas être dans le futur. | A data não pode ser no futuro. |

Notes:
- **Identity note corrected.** The draft said "We don't show your name or your organization". That isn't true: the admin can name the reporting org in the notice (§2.12, S14). The final text promises only what the product does: the name never, the org only if needed. ⚖️ not required, but the PM should know the promise changed.
- Category hints moved from `labels.conductCategory.<value>Hint` to `network.report.categoryHint.<value>`: `labels` holds enum display values only (voice-and-tone §8.3). Admin screens use `labels.conductCategory.*` too.
- fr uses « ils » for the reported org in the category labels: it's how recruiters talk, and these are first-person statements. fr avoids *transmettre* (reserved for **deliver**) and uses *communiquer*.
- `job_terms` en changed from "aren't real or honest" to "are fake or misleading" (plainer, and easier to localize).
- The length error uses the shared `network.validation.length` (§5.8).
- Nothing on this form shows which categories can lead to an immediate hold (R-1, AC-128).

### 5.6 Reports: reporter and reporting org's admins (S9; RD-045; PD-058 Q-D6)

PD-058: the reporting user **and the reporting org's `org_admin`s** can read a report. Access follows membership of the reporting org. The page shows two tabs to `org_admin`s ("Sent by you", "Your organization"); other roles see only their own list and no tabs. The four outcomes always carry `outcome.noChange`.

| Key | en | fr | pt |
|---|---|---|---|
| `network.reports.title` | Your reports | Vos signalements | Seus relatos |
| `network.reports.description` | Problems you reported to Workatent. Only you and your organization’s admins can see them. | Les problèmes que vous avez signalés à Workatent. Seuls vous et les administrateurs de votre organisation pouvez les voir. | Problemas que você relatou ao Workatent. Só você e os administradores da sua organização podem vê-los. |
| `network.reports.menu` | Your reports | Vos signalements | Seus relatos |
| `network.reports.tabs.mine` | Sent by you | Envoyés par vous | Enviados por você |
| `network.reports.tabs.org` | Your organization | Votre organisation | Sua organização |
| `network.reports.orgDescription` | Reports sent by members of {org}. Only organization admins see this list. | Signalements envoyés par des membres de {org}. Seuls les administrateurs de l’organisation voient cette liste. | Relatos enviados por membros de {org}. Só administradores da organização veem esta lista. |
| `network.reports.sentBy` | Sent by {name} | Envoyé par {name} | Enviado por {name} |
| `network.reports.sentByFormer` | Sent by a former member | Envoyé par un ancien membre | Enviado por um ex-membro |
| `network.reports.empty` | You haven’t reported a problem. | Vous n’avez signalé aucun problème. | Você não relatou nenhum problema. |
| `network.reports.emptyDescription` | To report a problem, use Report a problem on a referral or a partner job. | Pour signaler un problème, utilisez « Signaler un problème » dans une recommandation ou un poste de partenaire. | Para relatar um problema, use “Relatar um problema” em uma indicação ou vaga de parceiro. |
| `network.reports.orgEmpty` | No one in {org} has reported a problem. | Personne chez {org} n’a signalé de problème. | Ninguém em {org} relatou um problema. |
| `network.reports.about` | About {org} · sent {date} | Concernant {org} · envoyé le {date} | Sobre {org} · enviado em {date} |
| `network.reports.open` | Open | Ouvrir | Abrir |
| `network.reports.openAria` | Open the report about {org} | Ouvrir le signalement concernant {org} | Abrir o relato sobre {org} |
| `network.reports.detailTitle` | Report about {org} | Signalement concernant {org} | Relato sobre {org} |
| `network.reports.status.received` | Received | Reçu | Recebido |
| `network.reports.status.receivedBody` | We aim to respond by {when} ET. | Nous visons à répondre d’ici le {when} HE. | Buscamos responder até {when} (horário de Toronto). |
| `network.reports.status.input` | Your input needed | Votre réponse est requise | Aguardando sua resposta |
| `network.reports.status.inputBody` | Workatent has a question for you. Reply below. | Workatent a une question pour vous. Répondez ci-dessous. | O Workatent tem uma pergunta para você. Responda abaixo. |
| `network.reports.status.inputDeadline` | Reply by {when} ET. | Répondez d’ici le {when} HE. | Responda até {when} (horário de Toronto). |
| `network.reports.status.inReview` | Looking into it | En examen | Em análise |
| `network.reports.status.inReviewBody` | We’ll tell you the outcome when it’s decided. | Nous vous informerons du résultat dès qu’il sera décidé. | Vamos informar o resultado assim que houver uma decisão. |
| `network.reports.outcome.action` | Action taken | Mesures prises | Medidas tomadas |
| `network.reports.outcome.actionBody` | We found a breach and took action under the Network Rules. | Nous avons constaté un manquement et pris des mesures selon les Règles du réseau. | Constatamos uma violação e tomamos medidas conforme as Regras da rede. |
| `network.reports.outcome.noBreach` | No breach found | Aucun manquement constaté | Nenhuma violação constatada |
| `network.reports.outcome.noBreachBody` | We looked into it and didn’t find a breach of the Network Rules. | Nous avons examiné la situation et n’avons pas constaté de manquement aux Règles du réseau. | Analisamos e não constatamos violação das Regras da rede. |
| `network.reports.outcome.notEnough` | Not enough evidence to act | Pièces insuffisantes pour agir | Comprovantes insuficientes para agir |
| `network.reports.outcome.notEnoughBody` | We couldn’t confirm a breach with the evidence we have. You can send a new report if you have new evidence. | Les pièces justificatives disponibles ne permettent pas de confirmer un manquement. Vous pouvez envoyer un nouveau signalement si vous avez de nouvelles pièces. | Os comprovantes disponíveis não permitem confirmar uma violação. Você pode enviar um novo relato se tiver novos comprovantes. |
| `network.reports.outcome.closed` | Closed without a finding | Fermé sans constat | Encerrado sem constatação |
| `network.reports.outcome.closedBody` | Workatent closed this report without deciding whether a breach happened. | Workatent a fermé ce signalement sans se prononcer sur un manquement. | O Workatent encerrou este relato sem decidir se houve violação. |
| `network.reports.outcome.triageReason` | Reason: {reason} | Motif : {reason} | Motivo: {reason} |
| `network.reports.outcome.noChange` | This report doesn’t change your referral, your first position or any amount owed. | Ce signalement ne change rien à votre recommandation, à votre priorité ni aux montants dus. | Este relato não muda sua indicação, sua prioridade nem nenhum valor devido. |
| `network.reports.outcome.openReferral` | Open the referral | Ouvrir la recommandation | Abrir a indicação |
| `network.reports.outcome.updated` | Outcome updated on {date}. | Résultat mis à jour le {date}. | Resultado atualizado em {date}. |
| `network.reports.youSent` | What you sent | Ce que vous avez envoyé | O que você enviou |
| `network.reports.field.category` | Problem | Problème | Problema |
| `network.reports.field.what` | What happened | Ce qui s’est passé | O que aconteceu |
| `network.reports.field.when` | When | Quand | Quando |
| `network.reports.field.approximate` | (approximate) | (approximative) | (aproximada) |
| `network.reports.field.files` | Files | Fichiers | Arquivos |
| `network.reports.field.noFiles` | No files | Aucun fichier | Nenhum arquivo |
| `network.reports.field.filesNote` | Files can’t be downloaded after sending. Only platform admins can open them. | Les fichiers ne peuvent pas être téléchargés après l’envoi. Seuls les administrateurs de la plateforme peuvent les ouvrir. | Os arquivos não podem ser baixados depois do envio. Só os admins da plataforma podem abri-los. |
| `network.reports.timeline.title` | Status | Suivi | Andamento |
| `network.reports.timeline.sent` | Sent · {when} ET | Envoyé · {when} HE | Enviado · {when} (Toronto) |
| `network.reports.timeline.question` | Question from Workatent · {when} ET | Question de Workatent · {when} HE | Pergunta do Workatent · {when} (Toronto) |
| `network.reports.timeline.replied` | Reply sent · {when} ET | Réponse envoyée · {when} HE | Resposta enviada · {when} (Toronto) |
| `network.reports.timeline.closed` | Closed · {when} ET | Fermé · {when} HE | Encerrado · {when} (Toronto) |
| `network.reports.question` | Question from Workatent | Question de Workatent | Pergunta do Workatent |
| `network.reports.reply` | Your reply | Votre réponse | Sua resposta |
| `network.reports.replyHint` | Answer the question. You can send one reply, with files if they help. | Répondez à la question. Vous pouvez envoyer une seule réponse, avec des fichiers au besoin. | Responda à pergunta. Você pode enviar uma única resposta, com arquivos se ajudarem. |
| `network.reports.replySubmit` | Send reply | Envoyer la réponse | Enviar resposta |
| `network.reports.replySent` | Reply sent. | Réponse envoyée. | Resposta enviada. |
| `network.reports.replyClosed` | The time to reply ended on {when} ET. | Le délai pour répondre a pris fin le {when} HE. | O prazo para responder terminou em {when} (horário de Toronto). |
| `network.reports.yourReply` | Reply sent on {when} ET | Réponse envoyée le {when} HE | Resposta enviada em {when} (horário de Toronto) |

Notes:
- **"Looking into it" / « En examen » / "Em análise"**, not "In review": **review** is reserved for the 9.6 review of a sanction (glossary §5.7), and the reporter never learns whether one was requested.
- `outcome.updated` doesn't say why the outcome changed. "After a review" would reveal that a review was requested (RD-045).
- When an `org_admin` opens a colleague's report, "What you sent" still labels the content; `sentBy` / `sentByFormer` sits under the title. The "Your input needed" reply form stays with the reporting user (PD-058 doesn't give org admins a reply). If the reporter has left, the reply form doesn't show and the status stays "Looking into it".
- `outcome.notEnough` uses the glossary word for evidence (*pièces*, *comprovantes*).

### 5.7 Network standing page, org side (S10)

`org_admin` only. "What this means" for a suspension or termination reuses `network.settlement.continuesList` / `pausedList` (§5.10). Deadlines on cards use `BusinessDeadline` with the label `deadlineLabel`.

| Key | en | fr | pt |
|---|---|---|---|
| `settings.nav.standing` | Network standing | Statut réseau | Situação na rede |
| `network.standing.title` | Network standing | Statut réseau | Situação na rede |
| `network.standing.description` | Notices, decisions and sanctions for {org}. Only organization admins see this page. | Avis, décisions et sanctions de {org}. Seuls les administrateurs de l’organisation voient cette page. | Avisos, decisões e sanções de {org}. Só administradores da organização veem esta página. |
| `network.standing.current` | Current standing | Statut actuel | Situação atual |
| `network.standing.good` | Good standing | En règle | Regular |
| `network.standing.goodBody` | No active sanctions. | Aucune sanction en cours. | Nenhuma sanção ativa. |
| `network.standing.warning` | Warning active | Avertissement en cours | Advertência ativa |
| `network.standing.warningUntil` | Counts until {date}. | Compte jusqu’au {date}. | Conta até {date}. |
| `network.standing.hold` | Network hold | Restriction réseau | Restrição de rede |
| `network.standing.since` | Since {date}. | Depuis le {date}. | Desde {date}. |
| `network.standing.plannedReview` | We plan to reassess it on {date}. | Nous prévoyons de la réévaluer le {date}. | Planejamos reavaliar em {date}. |
| `network.standing.plannedReviewHint` | The hold doesn’t end automatically on this date. | La restriction ne prend pas fin automatiquement à cette date. | A restrição não termina automaticamente nessa data. |
| `network.standing.suspended` | Suspended | Suspendue | Suspensa |
| `network.standing.suspendedBody` | Your organization is in settlement mode. | Votre organisation est en mode finalisation. | Sua organização está em modo de finalização. |
| `network.standing.terminated` | Removed from the network | Retirée du réseau | Retirada da rede |
| `network.standing.terminatedBody` | Since {date}. Your organization is in settlement mode until everything is settled. | Depuis le {date}. Votre organisation est en mode finalisation jusqu’à ce que tout soit réglé. | Desde {date}. Sua organização fica em modo de finalização até tudo ser acertado. |
| `network.standing.whatThisMeans` | What this means | Ce que cela signifie | O que isso significa |
| `network.standing.meaning.pausedTitle` | Paused | En pause | Pausado |
| `network.standing.meaning.continuesTitle` | Continues | Se poursuit | Continua |
| `network.standing.meaning.holdPaused` | Opening jobs to partners, submitting referrals and receiving new referrals. | Ouvrir des postes aux partenaires, soumettre des recommandations et en recevoir de nouvelles. | Abrir vagas para parceiros, enviar indicações e receber novas indicações. |
| `network.standing.meaning.holdContinues` | Referrals in progress, hire reports, invoices, payouts, refunds and disputes. Your internal work: candidates, jobs, pipeline and team. | Les recommandations en cours, les déclarations d’embauche, les factures, les versements, les remboursements et les litiges. Votre travail interne : candidats, postes, pipeline et équipe. | Indicações em andamento, registros de contratação, faturas, repasses, reembolsos e disputas. Seu trabalho interno: candidatos, vagas, pipeline e equipe. |
| `network.standing.meaning.warning` | A warning doesn’t limit your work. It counts for 12 months if another breach is found. | Un avertissement ne limite pas votre travail. Il compte pendant 12 mois si un autre manquement est constaté. | Uma advertência não limita seu trabalho. Ela conta por 12 meses se outra violação for constatada. |
| `network.standing.rulesRow` | Network Rules {label} not accepted | Version {label} des Règles du réseau non acceptée | Versão {label} das Regras da rede não aceita |
| `network.standing.rulesRowBody` | This isn’t a sanction. It ends as soon as an organization admin accepts. | Ce n’est pas une sanction. Cela prend fin dès qu’un administrateur de l’organisation accepte. | Isso não é uma sanção. Termina assim que um administrador da organização aceitar. |
| `network.standing.openNotices` | Open notices | Avis en cours | Avisos em aberto |
| `network.standing.noNotices` | No open notices. | Aucun avis en cours. | Nenhum aviso em aberto. |
| `network.standing.noticeRules` | Rules cited: {rules} | Règles citées : {rules} | Regras citadas: {rules} |
| `network.standing.noticeSent` | Sent {date} | Envoyé le {date} | Enviado em {date} |
| `network.standing.deadlineLabel` | Response deadline | Date limite de réponse | Prazo de resposta |
| `network.standing.open` | Open notice | Ouvrir l’avis | Abrir aviso |
| `network.standing.history` | History | Historique | Histórico |
| `network.standing.historyEmpty` | No sanctions or closed notices. | Aucune sanction ni aucun avis fermé. | Nenhuma sanção nem aviso encerrado. |
| `network.standing.historyCaption` | Sanctions and closed notices | Sanctions et avis fermés | Sanções e avisos encerrados |
| `network.standing.col.date` | Date | Date | Data |
| `network.standing.col.result` | Outcome | Résultat | Resultado |
| `network.standing.col.status` | Status | Statut | Status |
| `network.standing.acceptance` | Network Rules acceptance | Acceptation des Règles du réseau | Aceite das Regras da rede |
| `network.standing.acceptedBy` | Version {label} accepted on {date} by {name} | Version {label} acceptée le {date} par {name} | Versão {label} aceita em {date} por {name} |
| `network.standing.notAcceptedOrg` | Version {label} not accepted yet | Version {label} pas encore acceptée | Versão {label} ainda não aceita |
| `network.standing.notAcceptedMembers` | Members who haven’t accepted version {label} | Membres qui n’ont pas accepté la version {label} | Membros que não aceitaram a versão {label} |
| `network.standing.allMembersAccepted` | Every member has accepted version {label}. | Tous les membres ont accepté la version {label}. | Todos os membros aceitaram a versão {label}. |
| `labels.sanctionStatus.active` | Active | En cours | Ativa |
| `labels.sanctionStatus.expired` | Expired on {date} | Expirée le {date} | Expirada em {date} |
| `labels.sanctionStatus.lifted` | Lifted on {date} | Levée le {date} | Encerrada em {date} |
| `labels.sanctionStatus.reduced` | Reduced on review | Réduite après révision | Reduzida na revisão |
| `labels.sanctionStatus.overturned` | Overturned on review | Annulée après révision | Anulada na revisão |
| `labels.sanctionLevel.none` | Finding, no sanction | Constat sans sanction | Constatação sem sanção |
| `labels.sanctionLevel.warning` | Warning | Avertissement | Advertência |
| `labels.sanctionLevel.network_hold` | Network hold | Restriction réseau | Restrição de rede |
| `labels.sanctionLevel.suspension` | Suspension | Suspension | Suspensão |
| `labels.sanctionLevel.termination` | Termination | Exclusion | Exclusão |
| `labels.conductOutcome.no_breach` | No breach found | Aucun manquement constaté | Nenhuma violação constatada |
| `labels.conductOutcome.not_enough` | Not enough evidence | Pièces insuffisantes | Comprovantes insuficientes |
| `labels.conductOutcome.breach` | Breach found | Manquement constaté | Violação constatada |

Notes:
- The planned date for a hold is **not** called a "review" (that word is reserved for rule 9.6). It says "reassess", and the hint says it isn't an end date.
- `labels.conductOutcome.*` replaces the draft's `network.case.outcome.*`: enum labels live in `labels`, and the admin decision form uses the same three.
- pt "Encerrada" for a lifted sanction, because "suspender a restrição" would collide with **suspensão** (level 3). Glossary §5.7, "lift".

### 5.8 Case page, org side: notice, response, decision, review (S11) ⚖️

**Two kinds of keys.** `network.case.*` is the page around the notice, in the viewer's UI locale. `network.notice.*`, `network.decision.*` and `network.case.review.*` (outcome lines) are **template text in the notice's language** (§5.0). Every template key is a legal draft ⚖️ (C-3, C-5).

**Notice template** (regular notice and immediate hold, BR-21, BR-28, RD-049). Order on the page: heading → intro → (immediate only) holdEffects → rules → alleged → when → evidence → reportedBy (only if the admin ticked it) → deadline → howToRespond → possibleOutcomes.

| Key | en | fr | pt |
|---|---|---|---|
| `network.notice.heading` ⚖️ | Notice under rules 8.3 and 9.3 | Avis selon les règles 8.3 et 9.3 | Aviso conforme as regras 8.3 e 9.3 |
| `network.notice.headingImmediate` ⚖️ | Immediate network hold under rule 9.4 | Restriction réseau immédiate selon la règle 9.4 | Restrição de rede imediata conforme a regra 9.4 |
| `network.notice.intro` ⚖️ | Workatent received information that {org} may have broken the Network Rules. This notice tells you what is alleged and gives you 10 business days to respond. Nothing has been decided yet. | Workatent a reçu de l’information selon laquelle {org} pourrait avoir enfreint les Règles du réseau. Cet avis vous indique ce qui est reproché et vous donne 10 jours ouvrables pour répondre. Rien n’a encore été décidé. | O Workatent recebeu informações de que {org} pode ter descumprido as Regras da rede. Este aviso informa o que é alegado e dá 10 dias úteis para você responder. Nada foi decidido ainda. |
| `network.notice.introImmediate` ⚖️ | Under rule 9.4, Workatent put {org} on a network hold on {date}, because of a possible breach of rule {rule}. This notice tells you what is alleged. You have 10 business days to respond. No other decision has been made. | En vertu de la règle 9.4, Workatent a imposé une restriction réseau à {org} le {date}, en raison d’un possible manquement à la règle {rule}. Cet avis vous indique ce qui est reproché. Vous avez 10 jours ouvrables pour répondre. Aucune autre décision n’a été prise. | Conforme a regra 9.4, o Workatent aplicou uma restrição de rede a {org} em {date}, por uma possível violação da regra {rule}. Este aviso informa o que é alegado. Você tem 10 dias úteis para responder. Nenhuma outra decisão foi tomada. |
| `network.notice.holdEffects` ⚖️ | While the hold lasts, your jobs are hidden from partners, and you can’t submit referrals or receive new ones. Referrals in progress continue as usual. | Pendant la restriction, vos postes sont masqués aux partenaires, et vous ne pouvez pas soumettre de recommandations ni en recevoir de nouvelles. Les recommandations en cours se poursuivent normalement. | Durante a restrição, suas vagas ficam ocultas para parceiros, e você não pode enviar indicações nem receber novas. As indicações em andamento continuam normalmente. |
| `network.notice.rules` ⚖️ | Rules concerned | Règles en cause | Regras envolvidas |
| `network.notice.ruleItem` ⚖️ | Rule {number}: {title} | Règle {number} : {title} | Regra {number}: {title} |
| `network.notice.version` ⚖️ | From Network Rules {label} | Selon la version {label} des Règles du réseau | Conforme a versão {label} das Regras da rede |
| `network.notice.alleged` ⚖️ | What is alleged | Ce qui est reproché | O que é alegado |
| `network.notice.when` ⚖️ | When | Quand | Quando |
| `network.notice.evidence` ⚖️ | Summary of the evidence | Résumé des pièces justificatives | Resumo dos comprovantes |
| `network.notice.reportedBy` ⚖️ | Reported by {org} | Signalé par {org} | Relatado por {org} |
| `network.notice.deadline` ⚖️ | Respond by {when} ET | Répondez d’ici le {when} HE | Responda até {when} (horário de Toronto) |
| `network.notice.howToRespond` ⚖️ | Any organization admin can send one response from your Network standing page, with files if they help. If you don’t respond by the deadline, Workatent will decide on the record (rule 7.2). | Tout administrateur de l’organisation peut envoyer une seule réponse à partir de la page Statut réseau, avec des fichiers au besoin. Sans réponse à la date limite, Workatent décidera selon le dossier (règle 7.2). | Qualquer administrador da organização pode enviar uma única resposta pela página Situação na rede, com arquivos se ajudarem. Sem resposta até o prazo, o Workatent decidirá com base no registro (regra 7.2). |
| `network.notice.possibleOutcomes` ⚖️ **fixed** | After the response period, Workatent may decide to take no action, or to give a warning, a network hold, a suspension or termination. If there’s a finding or a sanction, your organization can ask once for a review by a different platform admin. | Après le délai de réponse, Workatent peut décider de ne prendre aucune mesure, ou d’imposer un avertissement, une restriction réseau, une suspension ou une exclusion. En cas de constat ou de sanction, votre organisation peut demander une seule fois une révision par un autre administrateur de la plateforme. | Depois do prazo de resposta, o Workatent pode decidir não tomar nenhuma medida ou aplicar uma advertência, uma restrição de rede, uma suspensão ou uma exclusão. Se houver uma constatação ou uma sanção, sua organização pode pedir uma única vez a revisão por outro admin da plataforma. |
| `network.notice.bilingualNote` ⚖️ | French version above. | Version anglaise ci-dessous. | Versão em inglês abaixo. |

- **`possibleOutcomes` is fixed (RD-049, AC-133).** It's copied into every stored notice, regular and immediate, in the notice's language. The composer shows it read-only with a lock icon. Admins can't edit or remove it. It lists every level, so an escalation on the same notice is possible (§2.12 item 5). For an immediate hold, "take no action" means the hold is lifted. Counsel (C-3) decides whether this line is enough to support an escalation on the same notice. An optional sentence counsel may add: "We'll decide only on the facts and rules in this notice."
- **Heading:** the draft said "rule 8.3". The notice is also the 9.3 written notice before any sanction, so it cites both. Admin-initiated cases use the same heading (8.3 says "we tell the reported organization", whoever reported it).
- **`version`** (PD-058, Q-D2): one version per notice, the one in force on the date of the conduct, shown under the rules list.

**Case page chrome** (UI locale):

| Key | en | fr | pt |
|---|---|---|---|
| `network.case.metaTitle` | Notice | Avis | Aviso |
| `network.case.back` | Back to network standing | Retour au statut réseau | Voltar para situação na rede |
| `network.case.noticeTitle` | Notice | Avis | Aviso |
| `network.case.sentOn` | Sent on {when} ET | Envoyé le {when} HE | Enviado em {when} (horário de Toronto) |
| `network.case.languageNote` | This notice is in {language}. | Cet avis est en {language}. | Este aviso está em {language}. |
| `network.case.respond` | Your response | Votre réponse | Sua resposta |
| `network.case.respondHint` | Explain what happened and attach anything that helps. Only Workatent platform admins can open your files. Your response isn’t shared with other organizations. | Expliquez ce qui s’est passé et joignez tout ce qui peut aider. Seuls les administrateurs de la plateforme Workatent peuvent ouvrir vos fichiers. Votre réponse n’est pas communiquée aux autres organisations. | Explique o que aconteceu e anexe o que puder ajudar. Só os admins da plataforma Workatent podem abrir seus arquivos. Sua resposta não é compartilhada com outras organizações. |
| `network.case.respondSubmit` | Send response | Envoyer la réponse | Enviar resposta |
| `network.case.respondConfirmTitle` | Send your response? | Envoyer votre réponse? | Enviar sua resposta? |
| `network.case.respondConfirmBody` | Your organization can send one response, and it can’t be changed after sending. | Votre organisation peut envoyer une seule réponse, qui ne pourra plus être modifiée. | Sua organização pode enviar uma única resposta, e ela não pode ser alterada depois. |
| `network.case.responded` | Response sent on {when} ET by {name} | Réponse envoyée le {when} HE par {name} | Resposta enviada em {when} (horário de Toronto) por {name} |
| `network.case.respondedToast` | Response sent. Workatent will read it before deciding. | Réponse envoyée. Workatent en tiendra compte avant de décider. | Resposta enviada. O Workatent vai considerá-la antes de decidir. |
| `network.case.windowClosed` | The response window closed on {when} ET. Workatent will decide on the record (rule 7.2). | Le délai de réponse a pris fin le {when} HE. Workatent décidera selon le dossier (règle 7.2). | O prazo de resposta terminou em {when} (horário de Toronto). O Workatent decidirá com base no registro (regra 7.2). |
| `network.case.followup` | Follow-up question | Question complémentaire | Pergunta complementar |
| `network.case.followupDeadline` | Reply by {when} ET | Répondez d’ici le {when} HE | Responda até {when} (horário de Toronto) |
| `network.case.followupNoDeadline` | No deadline. Reply when you can. | Aucune date limite. Répondez dès que possible. | Sem prazo. Responda quando puder. |
| `network.case.followupReply` | Your reply | Votre réponse | Sua resposta |
| `network.case.followupSubmit` | Send reply | Envoyer la réponse | Enviar resposta |
| `network.case.followupSent` | Reply sent. | Réponse envoyée. | Resposta enviada. |
| `network.case.followupReplied` | Reply sent on {when} ET by {name} | Réponse envoyée le {when} HE par {name} | Resposta enviada em {when} (horário de Toronto) por {name} |
| `network.case.followupClosed` | The time to reply ended on {when} ET. | Le délai pour répondre a pris fin le {when} HE. | O prazo para responder terminou em {when} (horário de Toronto). |
| `network.case.files` | Files | Fichiers | Arquivos |
| `network.case.filesHint` | Up to 5 files: PDF, PNG or JPEG, 10 MB each. Only Workatent platform admins can open them. | Jusqu’à 5 fichiers : PDF, PNG ou JPEG, 10 Mo chacun. Seuls les administrateurs de la plateforme Workatent peuvent les ouvrir. | Até 5 arquivos: PDF, PNG ou JPEG, 10 MB cada. Só os admins da plataforma Workatent podem abri-los. |

`{name}` in `responded` / `followupReplied` is the org's own admin who sent it, never a platform admin.

**Decision template** (notice language, ⚖️). The outcome value uses `labels.conductOutcome.*` in the notice language.

| Key | en | fr | pt |
|---|---|---|---|
| `network.decision.title` ⚖️ | Decision | Décision | Decisão |
| `network.decision.decidedOn` ⚖️ | Decided on {date} by a Workatent platform admin | Décidée le {date} par un administrateur de la plateforme Workatent | Decidida em {date} por um admin da plataforma Workatent |
| `network.decision.outcome` ⚖️ | Outcome | Résultat | Resultado |
| `network.decision.noBreachBody` ⚖️ | Workatent didn’t find a breach of the Network Rules. No sanction applies. | Workatent n’a pas constaté de manquement aux Règles du réseau. Aucune sanction ne s’applique. | O Workatent não constatou violação das Regras da rede. Nenhuma sanção se aplica. |
| `network.decision.notEnoughBody` ⚖️ | Workatent didn’t find enough evidence to decide that a breach happened. No sanction applies. | Workatent n’a pas trouvé assez de pièces justificatives pour conclure à un manquement. Aucune sanction ne s’applique. | O Workatent não encontrou comprovantes suficientes para concluir que houve violação. Nenhuma sanção se aplica. |
| `network.decision.finding` ⚖️ | Finding | Constat | Constatação |
| `network.decision.rules` ⚖️ | Rules breached | Règles enfreintes | Regras descumpridas |
| `network.decision.residual` ⚖️ | Decided using rule 7.4, because no specific rule covered this case. | Décidé selon la règle 7.4, car aucune règle précise ne couvrait ce cas. | Decidido com base na regra 7.4, porque nenhuma regra específica cobria este caso. |
| `network.decision.sanction` ⚖️ | Sanction | Sanction | Sanção |
| `network.decision.effects.none` ⚖️ | The finding is recorded on your organization’s file. No sanction applies. | Le constat est inscrit au dossier de votre organisation. Aucune sanction ne s’applique. | A constatação fica registrada no histórico da sua organização. Nenhuma sanção se aplica. |
| `network.decision.effects.warning` ⚖️ | This warning counts for 12 months, until {date}. It doesn’t limit your work. | Cet avertissement compte pendant 12 mois, jusqu’au {date}. Il ne limite pas votre travail. | Esta advertência conta por 12 meses, até {date}. Ela não limita seu trabalho. |
| `network.decision.effects.hold` ⚖️ | From {date}, your jobs are hidden from partners, and you can’t submit referrals or receive new ones. Referrals in progress continue. The hold lasts until Workatent lifts it. | À partir du {date}, vos postes sont masqués aux partenaires, et vous ne pouvez pas soumettre de recommandations ni en recevoir de nouvelles. Les recommandations en cours se poursuivent. La restriction dure jusqu’à ce que Workatent la lève. | A partir de {date}, suas vagas ficam ocultas para parceiros, e você não pode enviar indicações nem receber novas. As indicações em andamento continuam. A restrição vale até o Workatent encerrá-la. |
| `network.decision.effects.holdLifted` ⚖️ | The network hold is lifted from {date}. | La restriction réseau est levée à partir du {date}. | A restrição de rede foi encerrada em {date}. |
| `network.decision.effects.suspension` ⚖️ | From {date}, your organization is suspended and in settlement mode. You can finish referrals in progress, settle commissions and answer disputes. Nothing else is available until the suspension is lifted. | À partir du {date}, votre organisation est suspendue et en mode finalisation. Vous pouvez finaliser les recommandations en cours, régler les commissions et répondre aux litiges. Rien d’autre n’est offert tant que la suspension n’est pas levée. | A partir de {date}, sua organização está suspensa e em modo de finalização. Você pode concluir as indicações em andamento, acertar as comissões e responder a disputas. Nada mais fica disponível até a suspensão ser encerrada. |
| `network.decision.effects.termination` ⚖️ | From {date}, your organization is removed from the network. You can finish referrals in progress and settle commissions and disputes until each one is settled. Your organization can apply again after 12 months (rule 9.7). | À partir du {date}, votre organisation est retirée du réseau. Vous pouvez finaliser les recommandations en cours et régler les commissions et les litiges jusqu’au règlement de chacun. Votre organisation pourra présenter une nouvelle demande d’adhésion après 12 mois (règle 9.7). | A partir de {date}, sua organização é retirada da rede. Você pode concluir as indicações em andamento e acertar comissões e disputas até cada uma ser encerrada. Sua organização pode pedir para entrar de novo após 12 meses (regra 9.7). |
| `network.decision.reviewLine` ⚖️ | You can request one review by {when} ET. A different platform admin will review the decision. The sanction stays in effect during the review. | Vous pouvez demander une seule révision d’ici le {when} HE. Un autre administrateur de la plateforme révisera la décision. La sanction reste en vigueur pendant la révision. | Você pode pedir uma única revisão até {when} (horário de Toronto). Outro admin da plataforma vai revisar a decisão. A sanção continua valendo durante a revisão. |
| `network.decision.reviewLineFinding` ⚖️ | You can request one review by {when} ET. A different platform admin will review the finding. | Vous pouvez demander une seule révision d’ici le {when} HE. Un autre administrateur de la plateforme révisera le constat. | Você pode pedir uma única revisão até {when} (horário de Toronto). Outro admin da plataforma vai revisar a constatação. |

- A "keep the hold" decision after an immediate hold uses `effects.hold` with the hold's start date. "Change to a warning" uses `effects.warning` plus `effects.holdLifted`.
- The hold planned-reassessment date, if set, shows with `network.standing.plannedReview` + `plannedReviewHint`.
- `effects.none` says the finding is "recorded on your organization's file". Whether a no-sanction finding counts toward the 12-month rule is now decided (PD-058, Q-D5: it does). The text doesn't promise either way.

**Review request and outcome:**

| Key | en | fr | pt |
|---|---|---|---|
| `network.case.reviewDeadline` | Review deadline | Date limite de révision | Prazo para revisão |
| `network.case.requestReview` | Request a review | Demander une révision | Pedir revisão |
| `network.case.reviewDialogTitle` | Request a review of this decision? | Demander la révision de cette décision? | Pedir a revisão desta decisão? |
| `network.case.reviewDialogBody` | A different platform admin will review the decision. The sanction stays in effect during the review. Your organization can request one review. | Un autre administrateur de la plateforme révisera la décision. La sanction reste en vigueur pendant la révision. Votre organisation peut demander une seule révision. | Outro admin da plataforma vai revisar a decisão. A sanção continua valendo durante a revisão. Sua organização pode pedir uma única revisão. |
| `network.case.reviewDialogBodyFinding` | A different platform admin will review the finding. Your organization can request one review. | Un autre administrateur de la plateforme révisera le constat. Votre organisation peut demander une seule révision. | Outro admin da plataforma vai revisar a constatação. Sua organização pode pedir uma única revisão. |
| `network.case.reviewReason` | Why should the decision change? | Pourquoi la décision devrait-elle changer? | Por que a decisão deveria mudar? |
| `network.case.reviewReasonHint` | Point to the facts or rules the decision got wrong. You can add files. | Indiquez les faits ou les règles que la décision a mal appréciés. Vous pouvez joindre des fichiers. | Aponte os fatos ou as regras que a decisão avaliou mal. Você pode anexar arquivos. |
| `network.case.reviewSubmit` | Request review | Demander la révision | Pedir revisão |
| `network.case.reviewRequestedToast` | Review requested. We’ll let you know the outcome. | Révision demandée. Le résultat vous sera communiqué. | Revisão solicitada. Vamos avisar o resultado. |
| `network.case.reviewRequested` | Review requested on {date} by {name} | Révision demandée le {date} par {name} | Revisão solicitada em {date} por {name} |
| `network.case.review.confirmed` ⚖️ | Review: decision confirmed | Révision : décision confirmée | Revisão: decisão confirmada |
| `network.case.review.reduced` ⚖️ | Review: sanction reduced to {level} | Révision : sanction réduite (nouveau niveau : {level}) | Revisão: sanção reduzida para {level} |
| `network.case.review.lifted` ⚖️ | Review: sanction lifted | Révision : sanction levée | Revisão: sanção encerrada |
| `network.case.review.overturned` ⚖️ | Review: decision overturned. The sanction is lifted and won’t count in later decisions. | Révision : décision annulée. La sanction est levée et ne comptera pas dans les décisions futures. | Revisão: decisão anulada. A sanção foi encerrada e não conta em decisões futuras. |
| `network.case.review.reason` ⚖️ | Reason for the review outcome | Motifs de la révision | Motivo da revisão |
| `network.case.review.reviewedOn` ⚖️ | Reviewed on {date} by a different Workatent platform admin | Révisée le {date} par un autre administrateur de la plateforme Workatent | Revisada em {date} por outro admin da plataforma Workatent |
| `network.case.errors.closed` | The response window has closed. You can’t send a response now. | Le délai de réponse est terminé. Vous ne pouvez plus envoyer de réponse. | O prazo de resposta terminou. Não é mais possível enviar resposta. |
| `network.case.errors.exists` | Your organization has already responded. Refresh the page to see the response. | Votre organisation a déjà répondu. Actualisez la page pour voir la réponse. | Sua organização já respondeu. Atualize a página para ver a resposta. |
| `network.case.errors.reviewClosed` | The time to request a review has ended. | Le délai pour demander une révision est terminé. | O prazo para pedir revisão terminou. |
| `network.case.errors.reviewExists` | A review was already requested for this decision. | Une révision a déjà été demandée pour cette décision. | Já foi pedida uma revisão desta decisão. |
| `network.case.errors.replyClosed` | The time to reply has ended. | Le délai pour répondre est terminé. | O prazo para responder terminou. |
| `network.validation.length` | Write between {min} and {max} characters. | Écrivez entre {min} et {max} caractères. | Escreva entre {min} e {max} caracteres. |

- `{level}` in `review.reduced` is `labels.sanctionLevel.*` in the notice language; `{name}` in `reviewRequested` is the org's own admin.
- **No platform admin is named to the org** (PD-058, Q-D13): `decidedOn` and `reviewedOn` say "a Workatent platform admin".
- `network.validation.length` is the shared length error for every textarea in the `network` namespace (report, reply, response, review reason).

### 5.9 Data incident notice, recipient side (S25) ⚖️

| Key | en | fr | pt |
|---|---|---|---|
| `network.incident.section` | Notices about how a partner handled your information | Avis sur le traitement de vos renseignements par un partenaire | Avisos sobre como um parceiro tratou suas informações |
| `network.incident.sectionHint` | These notices are about another organization. They aren’t about your organization’s standing. | Ces avis concernent une autre organisation. Ils ne portent pas sur le statut de votre organisation. | Estes avisos são sobre outra organização. Não tratam da situação da sua organização. |
| `network.incident.title` ⚖️ | Data incident notice | Avis d’incident lié à des renseignements | Aviso de incidente com dados |
| `network.incident.cardSent` | Sent {date} | Envoyé le {date} | Enviado em {date} |
| `network.incident.cardReferrals.one` | {count} referral concerned | {count} recommandation visée | {count} indicação envolvida |
| `network.incident.cardReferrals.other` | {count} referrals concerned | {count} recommandations visées | {count} indicações envolvidas |
| `network.incident.intro` ⚖️ | Workatent found that a partner organization shared information from your referrals outside its organization. Here’s what we know. | Workatent a constaté qu’une organisation partenaire a communiqué des renseignements provenant de vos recommandations à l’extérieur de son organisation. Voici ce que nous savons. | O Workatent constatou que uma organização parceira compartilhou informações das suas indicações fora da organização dela. Veja o que sabemos. |
| `network.incident.referrals` | Referrals concerned | Recommandations visées | Indicações envolvidas |
| `network.incident.referralUnavailable` | A referral you can no longer open | Une recommandation que vous ne pouvez plus ouvrir | Uma indicação que você não pode mais abrir |
| `network.incident.what` | What information | Renseignements concernés | Informações envolvidas |
| `network.incident.when` | When | Quand | Quando |
| `network.incident.toWhom` | Shared with | Communiqués à | Compartilhadas com |
| `network.incident.toWhomUnknown` | Unknown | Inconnu | Desconhecido |
| `network.incident.guidance` ⚖️ **fixed** | If your candidate revokes their authorization, the other organization loses access to the shared profile and documents on Workatent right away. This doesn’t recall copies they already downloaded. Withdrawing the referral keeps your first position. Releasing the candidate gives it up. | Si votre candidat révoque son autorisation, l’autre organisation perd immédiatement l’accès au profil partagé et aux documents dans Workatent. Cela ne récupère pas les copies déjà téléchargées. Retirer la recommandation conserve votre priorité. Libérer le candidat vous la fait perdre. | Se seu candidato revogar a autorização, a outra organização perde na hora o acesso ao perfil compartilhado e aos documentos no Workatent. Isso não recupera cópias já baixadas. Retirar a indicação mantém sua prioridade. Liberar o candidato faz você perder a prioridade. |
| `network.incident.guidanceHiring` ⚖️ **fixed** | Workatent can’t recall information once it has been shared. This notice doesn’t change your jobs or your referrals in progress. If the information is about your client, you may want to tell them. | Workatent ne peut pas récupérer des renseignements une fois qu’ils ont été communiqués. Cet avis ne change rien à vos postes ni à vos recommandations en cours. Si les renseignements concernent votre client, vous voudrez peut-être l’en informer. | O Workatent não consegue recuperar informações depois que elas foram compartilhadas. Este aviso não muda suas vagas nem suas indicações em andamento. Se as informações forem sobre seu cliente, talvez seja bom avisá-lo. |

Notes:
- The page and the notification never name the sanction, the case outcome or the reporter (RD-045). The intro says a sharing was *found*. That reveals a finding, which RD-045 accepts. Counsel checks it (C-4).
- **Guidance line corrected.** The draft said the other org "loses access right away". On Workatent that's true, but downloaded copies stay with them. The final line says so, so a sourcing recruiter doesn't tell their candidate more than is true.
- **Two fixed guidance lines, one per side** (§2.11, lead decision 2026-11-16). `guidance` is for a recipient on the **sourcing** side of the referrals concerned; `guidanceHiring` is for a recipient on the **hiring** side (for example, its client's or its job's details leaked). An org on both sides gets both, `guidance` first. Each is copied into the stored notice in the notice's language (§5.0).
- **`guidanceHiring` gives no revoke / withdraw / release advice** (those tools belong to the sourcing side, glossary §5.3). It says only what is true for any hiring org: Workatent can't pull back what was shared, and the notice changes nothing on its jobs or referrals (the same promise RD-045 makes to reporters). The last sentence is a suggestion, not a duty: it doesn't say the org *must* tell its client, or anyone else. Whether a hiring org has its own duties (to its client, the client's staff or the CAI) is for counsel (RD-045, C-4); if counsel wants such a sentence, it replaces the last one.
- `intro` and the `conduct.incident_notice` body ("information from your referrals") were checked for hiring-side recipients: on the hiring side, "your referrals" are the referrals received on its jobs, so the same text works for both sides and no variant is needed.
- fr title avoids « incident de confidentialité », the Law 25 term of art, until counsel says Workatent should use it (C-4).
- Back link: `network.case.back`. Open button on cards: `network.standing.open`.

### 5.10 Settlement mode (S22) ⚖️

New term: **settlement mode** / **mode finalisation** / **modo de finalização** (glossary §5.7). fr avoids « mode règlement » (it reads as "payment method", and *règlement* also means "regulation"). pt avoids « liquidação » (it reads as insolvency). The B6 banner (§5.2) carries the legal-draft sentences. The standing link in "What you can still do" uses `settings.nav.standing`.

| Key | en | fr | pt |
|---|---|---|---|
| `network.settlement.marker` | Settlement mode | Mode finalisation | Modo de finalização |
| `network.settlement.homeTitle` | Settlement mode | Mode finalisation | Modo de finalização |
| `network.settlement.canDo` | What you can still do | Ce que vous pouvez encore faire | O que você ainda pode fazer |
| `network.settlement.referrals.one` | {count} referral in progress | {count} recommandation en cours | {count} indicação em andamento |
| `network.settlement.referrals.other` | {count} referrals in progress | {count} recommandations en cours | {count} indicações em andamento |
| `network.settlement.placements.one` | {count} placement with open steps | {count} placement avec des étapes à terminer | {count} colocação com etapas pendentes |
| `network.settlement.placements.other` | {count} placements with open steps | {count} placements avec des étapes à terminer | {count} colocações com etapas pendentes |
| `network.settlement.disputes.one` | {count} dispute to answer | {count} litige auquel répondre | {count} disputa para responder |
| `network.settlement.disputes.other` | {count} disputes to answer | {count} litiges auxquels répondre | {count} disputas para responder |
| `network.settlement.nothingLeft` | Nothing left to settle here. | Rien à régler ici. | Nada a acertar aqui. |
| `network.settlement.paused` | What’s paused | Ce qui est en pause | O que está pausado |
| `network.settlement.pausedList` | Candidates, jobs, opportunities, imports, AI features, connectors and API keys, invitations and settings changes. | Candidats, postes, occasions, importations, fonctions d’IA, connecteurs et clés d’API, invitations et changements de paramètres. | Candidatos, vagas, oportunidades, importações, recursos de IA, conectores e chaves de API, convites e alterações de configurações. |
| `network.settlement.continuesList` | Referrals in progress, hire reports, invoices, payouts, refunds and disputes, plus Network standing and the team list. | Recommandations en cours, déclarations d’embauche, factures, versements, remboursements et litiges, ainsi que le statut réseau et la liste de l’équipe. | Indicações em andamento, registros de contratação, faturas, repasses, reembolsos e disputas, além da situação na rede e da lista da equipe. |
| `network.settlement.blockedTitle` | This page isn’t available in settlement mode | Cette page n’est pas offerte en mode finalisation | Esta página não está disponível no modo de finalização |
| `network.settlement.blockedDescription` | Your organization can only finish referrals in progress and settle what’s owed. | Votre organisation peut seulement finaliser les recommandations en cours et régler ce qui est dû. | Sua organização só pode concluir as indicações em andamento e acertar o que é devido. |
| `network.settlement.goReferrals` | Go to referrals | Aller aux recommandations | Ir para indicações |
| `network.settlement.loadCountsError` | We couldn’t load the counts. The links still work. | Nous n’avons pas pu charger les nombres. Les liens fonctionnent quand même. | Não foi possível carregar os números. Os links continuam funcionando. |
| `network.settlement.teamReadOnly` | In settlement mode, you can only deactivate members. Invitations and role changes are paused. | En mode finalisation, vous pouvez seulement désactiver des membres. Les invitations et les changements de rôle sont en pause. | No modo de finalização, você só pode desativar membros. Convites e mudanças de função estão pausados. |
| `network.settlement.referralClosed` | Referral closed. It no longer appears in settlement mode. | Recommandation fermée. Elle n’apparaît plus en mode finalisation. | Indicação encerrada. Ela não aparece mais no modo de finalização. |
| `network.settlement.referralClosedTitle` | This referral is closed | Cette recommandation est fermée | Esta indicação foi encerrada |
| `network.settlement.referralClosedDescription` | Closed referrals aren’t shown in settlement mode. Your other referrals in progress are still in the list. | Les recommandations fermées ne sont pas affichées en mode finalisation. Vos autres recommandations en cours sont toujours dans la liste. | Indicações encerradas não aparecem no modo de finalização. Suas outras indicações em andamento continuam na lista. |

Notes:
- "Placements with open steps" replaces "Commissions with open steps": **commission** is the whole area (glossary §5.4), the countable object is the placement. The link still goes to Commissions.
- **Referral closed** (PD-058 item 9): `referralClosed` is the toast after an action that closes the referral (decline, withdraw, release, hire completed with nothing left owed…). If the member is still on that referral page, or reloads it, the page shows `referralClosedTitle` + `referralClosedDescription` + **Go to referrals** instead of a not-found.
- Zero counts show `nothingLeft` instead of "0 referrals" (voice-and-tone §6.7).

### 5.11 Admin: rules versions (S5, S6)

Admin copy is operational and precise (voice-and-tone §3.10). `{locale}` shows as "en", "fr-CA" or "pt-BR" (codes, same in every UI language).

| Key | en | fr | pt |
|---|---|---|---|
| `admin.nav.networkRules` | Network Rules | Règles du réseau | Regras da rede |
| `admin.networkRules.title` | Network Rules versions | Versions des Règles du réseau | Versões das Regras da rede |
| `admin.networkRules.description` | Publish versions of the rules members accept. Published versions can’t be changed or deleted. | Publiez les versions des règles que les membres acceptent. Une version publiée ne peut être ni modifiée ni supprimée. | Publique as versões das regras que os membros aceitam. Versões publicadas não podem ser alteradas nem excluídas. |
| `admin.networkRules.new` | New version | Nouvelle version | Nova versão |
| `admin.networkRules.upcomingExists` | A version is already scheduled. You can publish another after it takes effect. | Une version est déjà prévue. Vous pourrez en publier une autre après son entrée en vigueur. | Já há uma versão programada. Você pode publicar outra depois que ela entrar em vigor. |
| `admin.networkRules.drafts` | Drafts | Brouillons | Rascunhos |
| `admin.networkRules.current` | Current | En vigueur | Atual |
| `admin.networkRules.upcoming` | Upcoming | À venir | Próxima |
| `admin.networkRules.history` | History | Historique | Histórico |
| `admin.networkRules.empty` | No version published yet. | Aucune version publiée. | Nenhuma versão publicada. |
| `admin.networkRules.emptyDescription` | Members can’t join or use the network until a version is published. | Les membres ne peuvent ni adhérer au réseau ni l’utiliser tant qu’aucune version n’est publiée. | Os membros não podem entrar nem usar a rede até uma versão ser publicada. |
| `admin.networkRules.col.label` | Version | Version | Versão |
| `admin.networkRules.col.type` | Type | Type | Tipo |
| `admin.networkRules.col.effective` | In effect from | En vigueur le | Em vigor desde |
| `admin.networkRules.col.published` | Published | Publiée le | Publicada em |
| `admin.networkRules.col.approval` | Approval | Approbation | Aprovação |
| `admin.networkRules.col.fingerprint` | SHA-256 (en · fr-CA · pt-BR) | SHA-256 (en · fr-CA · pt-BR) | SHA-256 (en · fr-CA · pt-BR) |
| `admin.networkRules.copyFingerprint` | Copy SHA-256 | Copier le SHA-256 | Copiar SHA-256 |
| `admin.networkRules.copied` | Copied. | Copié. | Copiado. |
| `admin.networkRules.label` | Version label | Numéro de version | Número da versão |
| `admin.networkRules.labelHint` | For example 1.1 or 2.0. | Par exemple 1.1 ou 2.0. | Por exemplo, 1.1 ou 2.0. |
| `admin.networkRules.type` | Type of change | Type de modification | Tipo de mudança |
| `admin.networkRules.typeHint` | When in doubt, publish as a material change. | En cas de doute, publiez-la comme modification importante. | Na dúvida, publique como mudança relevante. |
| `admin.networkRules.typeDescription.initial` | The first version. Takes effect when you publish. | La première version. En vigueur dès la publication. | A primeira versão. Entra em vigor ao publicar. |
| `admin.networkRules.typeDescription.material` | Members must accept it. It takes effect 30 days or more after publication. | Les membres doivent l’accepter. Elle entre en vigueur au moins 30 jours après sa publication. | Os membros precisam aceitar. Entra em vigor 30 dias ou mais após a publicação. |
| `admin.networkRules.typeDescription.non_material` | Wording or clarity only. Takes effect when you publish. No acceptance needed. | Formulation ou clarté seulement. En vigueur dès la publication. Aucune acceptation requise. | Só redação ou clareza. Entra em vigor ao publicar. Não precisa de aceite. |
| `admin.networkRules.typeDescription.legally_required` | A law requires the change. It can take effect sooner. Members must accept it. | Une loi exige le changement. Elle peut entrer en vigueur plus tôt. Les membres doivent l’accepter. | Uma lei exige a mudança. Pode entrar em vigor antes. Os membros precisam aceitar. |
| `admin.networkRules.effective` | Takes effect on (00:00 ET) | Entre en vigueur le (0 h HE) | Entra em vigor em (00:00, horário de Toronto) |
| `admin.networkRules.effectiveMin` | Earliest date for a material change: {date} | Date la plus proche pour une modification importante : {date} | Data mais próxima para uma mudança relevante: {date} |
| `admin.networkRules.effectiveNow` | Takes effect when you publish. | Entre en vigueur dès la publication. | Entra em vigor ao publicar. |
| `admin.networkRules.legalReason` | Legal reason | Motif juridique | Motivo legal |
| `admin.networkRules.legalReasonHint` | Members see this with the change summary. | Les membres le voient avec le résumé des changements. | Os membros veem isso com o resumo das mudanças. |
| `admin.networkRules.summary` | Change summary ({locale}) | Résumé des changements ({locale}) | Resumo das mudanças ({locale}) |
| `admin.networkRules.summaryHint` | What changed, in plain words. Members read this before accepting. | Ce qui change, en mots simples. Les membres le lisent avant d’accepter. | O que mudou, em palavras simples. Os membros leem isso antes de aceitar. |
| `admin.networkRules.text` | Full text ({locale}) | Texte complet ({locale}) | Texto completo ({locale}) |
| `admin.networkRules.textHint` | Paste the publish-ready Markdown for this language. | Collez le Markdown prêt à publier pour cette langue. | Cole o Markdown pronto para publicação neste idioma. |
| `admin.networkRules.tabText` | Text | Texte | Texto |
| `admin.networkRules.tabPreview` | Preview | Aperçu | Visualização |
| `admin.networkRules.tabErrors.one` | {count} error | {count} erreur | {count} erro |
| `admin.networkRules.tabErrors.other` | {count} errors | {count} erreurs | {count} erros |
| `admin.networkRules.markers` | Remove before publishing: | À retirer avant de publier : | Remova antes de publicar: |
| `admin.networkRules.markerLine` | Line {line}: {marker} | Ligne {line} : {marker} | Linha {line}: {marker} |
| `admin.networkRules.noMarkers` | No review markers found. | Aucune marque de révision trouvée. | Nenhuma marca de revisão encontrada. |
| `admin.networkRules.approval` | Approval reference | Référence d’approbation | Referência da aprovação |
| `admin.networkRules.approvalHint` | Who approved this text and when, e.g. Founder and counsel approval, Dec 1, 2026. | Qui a approuvé ce texte et quand, p. ex. approbation de la direction et des avocats, 1er déc. 2026. | Quem aprovou este texto e quando, ex.: aprovação do fundador e do jurídico, 1º dez. 2026. |
| `admin.networkRules.saveDraft` | Save draft | Enregistrer le brouillon | Salvar rascunho |
| `admin.networkRules.draftSaved` | Draft saved. | Brouillon enregistré. | Rascunho salvo. |
| `admin.networkRules.deleteDraft` | Delete draft | Supprimer le brouillon | Excluir rascunho |
| `admin.networkRules.deleteDraftTitle` | Delete this draft? | Supprimer ce brouillon? | Excluir este rascunho? |
| `admin.networkRules.deleteDraftDescription` | The draft is deleted for good. Published versions aren’t affected. | Le brouillon sera supprimé définitivement. Les versions publiées ne sont pas touchées. | O rascunho será excluído de vez. As versões publicadas não são afetadas. |
| `admin.networkRules.draftDeleted` | Draft deleted. | Brouillon supprimé. | Rascunho excluído. |
| `admin.networkRules.publish` | Publish | Publier | Publicar |
| `admin.networkRules.publishing` | Publishing… | Publication… | Publicando… |
| `admin.networkRules.publishTitle` | Publish Network Rules {label}? | Publier la version {label} des Règles du réseau? | Publicar a versão {label} das Regras da rede? |
| `admin.networkRules.publishMaterial` | Members are notified now and must accept by {date}. Published versions can’t be changed or deleted. | Les membres sont avisés maintenant et doivent accepter d’ici le {date}. Une version publiée ne peut être ni modifiée ni supprimée. | Os membros são avisados agora e precisam aceitar até {date}. Versões publicadas não podem ser alteradas nem excluídas. |
| `admin.networkRules.publishLegal` | Members are notified now and must accept by {date}. They see the legal reason with the change summary. Published versions can’t be changed or deleted. | Les membres sont avisés maintenant et doivent accepter d’ici le {date}. Ils voient le motif juridique avec le résumé des changements. Une version publiée ne peut être ni modifiée ni supprimée. | Os membros são avisados agora e precisam aceitar até {date}. Eles veem o motivo legal com o resumo das mudanças. Versões publicadas não podem ser alteradas nem excluídas. |
| `admin.networkRules.publishNow` | It takes effect now, and members are notified. No acceptance is needed. Published versions can’t be changed or deleted. | Elle entre en vigueur maintenant, et les membres sont avisés. Aucune acceptation n’est requise. Une version publiée ne peut être ni modifiée ni supprimée. | Ela entra em vigor agora, e os membros são avisados. Não é preciso aceite. Versões publicadas não podem ser alteradas nem excluídas. |
| `admin.networkRules.publishInitial` | It takes effect now. Every member must accept it before using the network. Published versions can’t be changed or deleted. | Elle entre en vigueur maintenant. Chaque membre doit l’accepter avant d’utiliser le réseau. Une version publiée ne peut être ni modifiée ni supprimée. | Ela entra em vigor agora. Cada membro precisa aceitar antes de usar a rede. Versões publicadas não podem ser alteradas nem excluídas. |
| `admin.networkRules.published` | Network Rules {label} published. | Version {label} des Règles du réseau publiée. | Versão {label} das Regras da rede publicada. |
| `admin.networkRules.errors.missingLocale` | Add the {locale} text. | Ajoutez le texte en {locale}. | Adicione o texto em {locale}. |
| `admin.networkRules.errors.missingSummary` | Add the {locale} change summary. | Ajoutez le résumé des changements en {locale}. | Adicione o resumo das mudanças em {locale}. |
| `admin.networkRules.errors.marker` | Remove the review markers from the {locale} text. | Retirez les marques de révision du texte en {locale}. | Remova as marcas de revisão do texto em {locale}. |
| `admin.networkRules.errors.effective` | A material change can take effect on {date} at the earliest. | Une modification importante peut entrer en vigueur au plus tôt le {date}. | Uma mudança relevante pode entrar em vigor a partir de {date}. |
| `admin.networkRules.errors.effectivePast` | Choose today or a later date. | Choisissez aujourd’hui ou une date ultérieure. | Escolha hoje ou uma data posterior. |
| `admin.networkRules.errors.labelFormat` | Use a label like 1.1 or 2.0. | Utilisez un numéro comme 1.1 ou 2.0. | Use um número como 1.1 ou 2.0. |
| `admin.networkRules.errors.labelTaken` | This label is already used. Choose another. | Ce numéro est déjà utilisé. Choisissez-en un autre. | Este número já foi usado. Escolha outro. |
| `admin.networkRules.errors.legalReason` | Write a legal reason of {min} to {max} characters. | Rédigez un motif juridique de {min} à {max} caractères. | Escreva um motivo legal de {min} a {max} caracteres. |
| `admin.networkRules.errors.approval` | Enter who approved this text and when ({min} to {max} characters). | Indiquez qui a approuvé ce texte et quand ({min} à {max} caractères). | Informe quem aprovou este texto e quando ({min} a {max} caracteres). |

Notes:
- The hint date is written in the locale's short form, not ISO (voice-and-tone §6.5).
- The publish-ready text comes from `docs/content/network-rules/PUBLISHING.md` (strips the review markers that `marker_found` refuses).

### 5.12 Admin: conduct queue and case (S12–S18, S26)

Admin-only words: **case** / **dossier** / **caso**, **reporter** / **signalant** / **autor do relato** (glossary §5.7). Members never see them. Category labels: `labels.conductCategory.*` (§5.5). Outcome radio labels: `labels.conductOutcome.*`. Sanction radio labels: `labels.sanctionLevel.*` (§5.7). Download uses the existing `AdminEvidenceDownload` copy.

**Queue (S12):**

| Key | en | fr | pt |
|---|---|---|---|
| `labels.disputeType.conduct` | Conduct | Conduite | Conduta |
| `admin.disputes.filter.label` | Filter cases | Filtrer | Filtrar |
| `admin.disputes.filter.all` | All | Tous | Todos |
| `admin.disputes.filter.placement` | Placement | Placement | Colocação |
| `admin.disputes.filter.priorPresentation` | Prior presentation | Présentation antérieure | Apresentação anterior |
| `admin.disputes.filter.conduct` | Conduct | Conduite | Conduta |
| `admin.disputes.filter.countSr.one` | {count} open item | {count} élément ouvert | {count} item em aberto |
| `admin.disputes.filter.countSr.other` | {count} open items | {count} éléments ouverts | {count} itens em aberto |
| `admin.conduct.emptyFilter` | No open conduct cases. | Aucun dossier de conduite ouvert. | Nenhum caso de conduta em aberto. |
| `admin.conduct.reportedBy` | {reported} · reported by {reporter} | {reported} · signalement de {reporter} | {reported} · relato de {reporter} |
| `admin.conduct.openedByWorkatent` | {reported} · opened by Workatent | {reported} · ouvert par Workatent | {reported} · aberto pelo Workatent |
| `admin.conduct.filedOn` | Filed {when} ET | Déposé le {when} HE | Registrado em {when} (Toronto) |
| `admin.conduct.firstResponseBy` | First response by | Première réponse d’ici le | Primeira resposta até |
| `admin.conduct.stepDeadline` | Next step by | Prochaine étape d’ici le | Próxima etapa até |
| `admin.conduct.badFaith.one` | {org}: {count} report in the last 12 months found no breach. | {org} : {count} signalement des 12 derniers mois sans manquement constaté. | {org}: {count} relato nos últimos 12 meses sem violação constatada. |
| `admin.conduct.badFaith.other` | {org}: {count} reports in the last 12 months found no breach. | {org} : {count} signalements des 12 derniers mois sans manquement constaté. | {org}: {count} relatos nos últimos 12 meses sem violação constatada. |
| `admin.conduct.open` | Open case | Ouvrir le dossier | Abrir caso |
| `admin.conduct.state.new` | New | Nouveau | Novo |
| `admin.conduct.state.waiting_reporter` | Waiting for reporter | En attente du signalant | Aguardando o autor do relato |
| `admin.conduct.state.notice_sent` | Notice sent | Avis envoyé | Aviso enviado |
| `admin.conduct.state.response_received` | Response received | Réponse reçue | Resposta recebida |
| `admin.conduct.state.window_closed` | Window closed | Délai terminé | Prazo encerrado |
| `admin.conduct.state.decided` | Decided | Décidé | Decidido |
| `admin.conduct.state.review_requested` | Review requested | Révision demandée | Revisão solicitada |
| `admin.conduct.state.needs_second_admin` | Needs a second admin | Deuxième administrateur requis | Requer outro admin |
| `admin.conduct.state.closed` | Closed | Fermé | Encerrado |
| `admin.conduct.decisionOverdue` | Decision overdue | Décision en retard | Decisão atrasada |
| `admin.conduct.possible94` | Possible 9.4 | 9.4 possible | Possível 9.4 |
| `admin.conduct.categories` | Admin: {admin} · Reporter: {reporter} | Admin : {admin} · Signalant : {reporter} | Admin: {admin} · Autor: {reporter} |
| `admin.conduct.languageHint` | {org} works in {language}. Write the notice in French, or bilingually, for organizations in Québec. | {org} travaille en {language}. Rédigez l’avis en français, ou en version bilingue, pour les organisations du Québec. | {org} trabalha em {language}. Escreva o aviso em francês, ou bilíngue, para organizações do Québec. |

**Case page and triage (S13):**

| Key | en | fr | pt |
|---|---|---|---|
| `admin.conduct.case.title` | Conduct case · {org} | Dossier de conduite · {org} | Caso de conduta · {org} |
| `admin.conduct.case.back` | Back to disputes | Retour aux litiges | Voltar para disputas |
| `admin.conduct.case.parties` | Parties | Parties | Partes |
| `admin.conduct.case.reported` | Reported organization | Organisation signalée | Organização relatada |
| `admin.conduct.case.reporter` | Reporter | Signalant | Autor do relato |
| `admin.conduct.case.reporterValue` | {name} · {org} | {name} · {org} | {name} · {org} |
| `admin.conduct.case.context` | Context | Contexte | Contexto |
| `admin.conduct.case.referralLink` | Open referral | Ouvrir la recommandation | Abrir indicação |
| `admin.conduct.case.jobLink` | Open job | Ouvrir le poste | Abrir vaga |
| `admin.conduct.case.report` | Report | Signalement | Relato |
| `admin.conduct.case.date` | Date of the conduct | Date des faits | Data dos fatos |
| `admin.conduct.case.dateApprox` | {date} (approximate) | {date} (approximative) | {date} (aproximada) |
| `admin.conduct.case.dateNone` | Not given | Non indiquée | Não informada |
| `admin.conduct.case.files` | Files | Fichiers | Arquivos |
| `admin.conduct.case.fileMeta` | {size} · SHA-256 {hash} | {size} · SHA-256 {hash} | {size} · SHA-256 {hash} |
| `admin.conduct.case.download` | Download {name} | Télécharger {name} | Baixar {name} |
| `admin.conduct.case.thread` | Questions to the reporter | Questions au signalant | Perguntas ao autor do relato |
| `admin.conduct.case.history` | {org} in the last 12 months | {org} au cours des 12 derniers mois | {org} nos últimos 12 meses |
| `admin.conduct.case.historyEmpty` | No warnings, sanctions or open cases. | Aucun avertissement, aucune sanction, aucun dossier ouvert. | Nenhuma advertência, sanção ou caso em aberto. |
| `admin.conduct.case.actions` | Actions | Actions | Ações |
| `admin.conduct.adminCategory` | Admin category | Catégorie (admin) | Categoria (admin) |
| `admin.conduct.adminCategoryHint` | Required before the first response. Metrics use this category. The reporter never sees it. | Obligatoire avant la première réponse. Les statistiques utilisent cette catégorie. Le signalant ne la voit jamais. | Obrigatória antes da primeira resposta. As métricas usam esta categoria. O autor do relato nunca a vê. |
| `admin.conduct.saveCategory` | Save category | Enregistrer la catégorie | Salvar categoria |
| `admin.conduct.categorySaved` | Category saved. | Catégorie enregistrée. | Categoria salva. |
| `admin.conduct.sendNotice` | Send notice | Envoyer un avis | Enviar aviso |
| `admin.conduct.askReporter` | Ask the reporter | Questionner le signalant | Perguntar ao autor |
| `admin.conduct.closeTriage` | Close without a finding | Fermer sans constat | Encerrar sem constatação |
| `admin.conduct.applyHold` | Apply immediate hold | Restreindre immédiatement | Aplicar restrição imediata |
| `admin.conduct.askTitle` | Ask the reporter a question | Poser une question au signalant | Fazer uma pergunta ao autor do relato |
| `admin.conduct.askQuestion` | Question | Question | Pergunta |
| `admin.conduct.askHint` | Only the reporter sees this. {org} doesn’t. | Seul le signalant la voit. {org} ne la voit pas. | Só o autor do relato vê. {org} não vê. |
| `admin.conduct.askDeadline` | Reply deadline (optional) | Date limite de réponse (facultatif) | Prazo de resposta (opcional) |
| `admin.conduct.deadlineOption.one` | {count} business day | {count} jour ouvrable | {count} dia útil |
| `admin.conduct.deadlineOption.other` | {count} business days | {count} jours ouvrables | {count} dias úteis |
| `admin.conduct.deadlineNone` | No deadline | Aucune date limite | Sem prazo |
| `admin.conduct.askSubmit` | Send question | Envoyer la question | Enviar pergunta |
| `admin.conduct.askSent` | Question sent to the reporter. | Question envoyée au signalant. | Pergunta enviada ao autor do relato. |
| `admin.conduct.closeTitle` | Close this case without a finding? | Fermer ce dossier sans constat? | Encerrar este caso sem constatação? |
| `admin.conduct.closeDescription` | No notice is sent to {org}. The reporter sees “Closed without a finding” and your message. | Aucun avis n’est envoyé à {org}. Le signalant voit « Fermé sans constat » et votre message. | Nenhum aviso é enviado para {org}. O autor do relato vê “Encerrado sem constatação” e sua mensagem. |
| `admin.conduct.closeReason` | Reason | Motif | Motivo |
| `admin.conduct.closeReasonOption.no_rule` | No rule engaged | Aucune règle en cause | Nenhuma regra envolvida |
| `admin.conduct.closeReasonOption.amount` | Amount owed: placement dispute or rule 7.5 | Montant dû : litige sur le placement ou règle 7.5 | Valor devido: disputa na colocação ou regra 7.5 |
| `admin.conduct.closeReasonOption.duplicate` | Duplicate case | Dossier en double | Caso duplicado |
| `admin.conduct.closeReasonOption.other` | Other | Autre | Outro |
| `admin.conduct.closeMessage` | Message to the reporter | Message au signalant | Mensagem ao autor do relato |
| `admin.conduct.closeReasonHint` | The reporter will read this. | Le signalant lira ce message. | O autor do relato vai ler isto. |
| `admin.conduct.closeConfirm` | Close case | Fermer le dossier | Encerrar caso |
| `admin.conduct.closed` | Case closed. The reporter was notified. | Dossier fermé. Le signalant a été avisé. | Caso encerrado. O autor do relato foi avisado. |
| `admin.conduct.orgWillRead` | {org} will read this. | {org} lira ce texte. | {org} vai ler isto. |

**Notice composer (S14)**, with the PD-058 (Q-D2) fields: conduct date, rules version, the org's acceptance of that version.

| Key | en | fr | pt |
|---|---|---|---|
| `admin.conduct.notice.title` | Notice to {org} | Avis à {org} | Aviso para {org} |
| `admin.conduct.notice.language` | Notice language | Langue de l’avis | Idioma do aviso |
| `admin.conduct.notice.languageBilingual` | Bilingual (fr-CA + en) | Bilingue (fr-CA + en) | Bilíngue (fr-CA + en) |
| `admin.conduct.notice.conductDate` | Date of the conduct | Date des faits | Data dos fatos |
| `admin.conduct.notice.conductDateHint` | Prefilled from the report. It sets which rules version applies. | Prérempli à partir du signalement. Elle détermine la version des règles qui s’applique. | Preenchida a partir do relato. Ela define qual versão das regras se aplica. |
| `admin.conduct.notice.conductDateBeforeRules` | No Network Rules were in force on this date. Choose {date} or later. | Aucune version des Règles du réseau n’était en vigueur à cette date. Choisissez le {date} ou une date ultérieure. | Nenhuma versão das Regras da rede estava em vigor nessa data. Escolha {date} ou uma data posterior. |
| `admin.conduct.notice.rulesVersion` | Rules version | Version des règles | Versão das regras |
| `admin.conduct.notice.rulesVersionOption` | Version {label} · in force from {date} | Version {label} · en vigueur depuis le {date} | Versão {label} · em vigor desde {date} |
| `admin.conduct.notice.rulesVersionHint` | Defaults to the version in force on the date of the conduct. One version per notice. | Par défaut, la version en vigueur à la date des faits. Une seule version par avis. | Por padrão, a versão em vigor na data dos fatos. Uma versão por aviso. |
| `admin.conduct.notice.orgAcceptedVersion` | {org} accepted this version on {date}. | {org} a accepté cette version le {date}. | {org} aceitou esta versão em {date}. |
| `admin.conduct.notice.orgNotAcceptedVersion` | {org} didn’t accept this version. | {org} n’a pas accepté cette version. | {org} não aceitou esta versão. |
| `admin.conduct.notice.rules` | Rules cited | Règles citées | Regras citadas |
| `admin.conduct.notice.rulesHint` | Only rules from the chosen version. The decision can cite only these rules. | Seulement des règles de la version choisie. La décision ne pourra citer que ces règles. | Só regras da versão escolhida. A decisão só pode citar estas regras. |
| `admin.conduct.notice.rulesSelected.one` | {count} rule selected | {count} règle sélectionnée | {count} regra selecionada |
| `admin.conduct.notice.rulesSelected.other` | {count} rules selected | {count} règles sélectionnées | {count} regras selecionadas |
| `admin.conduct.notice.rulesEmpty` | No published rules version. | Aucune version des règles publiée. | Nenhuma versão das regras publicada. |
| `admin.conduct.notice.alleged` | What is alleged | Ce qui est reproché | O que é alegado |
| `admin.conduct.notice.when` | When | Quand | Quando |
| `admin.conduct.notice.whenPlaceholder` | e.g. Between Mar 3 and Mar 10, 2027 | p. ex. entre le 3 et le 10 mars 2027 | ex.: entre 3 e 10 de março de 2027 |
| `admin.conduct.notice.evidence` | Evidence summary | Résumé des pièces justificatives | Resumo dos comprovantes |
| `admin.conduct.notice.evidenceHint` | Summarize the evidence. Don’t paste the report or name the reporter. Keep candidate and client details to what they need to respond (rule 8.4). | Résumez les pièces justificatives. Ne collez pas le signalement et ne nommez pas le signalant. Limitez les renseignements sur les candidats et les clients à ce qui est nécessaire pour répondre (règle 8.4). | Resuma os comprovantes. Não cole o relato nem cite o autor. Limite os dados de candidatos e clientes ao necessário para a resposta (regra 8.4). |
| `admin.conduct.notice.nameReporter` | Name the reporting organization | Nommer l’organisation qui a fait le signalement | Informar a organização que fez o relato |
| `admin.conduct.notice.nameReporterHint` | Only if they need it to respond fairly. | Seulement si c’est nécessaire pour répondre équitablement. | Só se for necessário para uma resposta justa. |
| `admin.conduct.notice.outcomesLocked` | Added to every notice | Ajoutée à chaque avis | Incluída em todo aviso |
| `admin.conduct.notice.deadline` | Response deadline: {when} ET (10 business days after sending) | Date limite de réponse : {when} HE (10 jours ouvrables après l’envoi) | Prazo de resposta: {when} (horário de Toronto), 10 dias úteis após o envio |
| `admin.conduct.notice.tabEdit` | Edit | Modifier | Editar |
| `admin.conduct.notice.tabPreview` | Preview | Aperçu | Visualização |
| `admin.conduct.notice.previewHint` | This is exactly what {org}’s admins will see. | Voici exactement ce que verront les administrateurs de {org}. | É exatamente isso que os administradores de {org} vão ver. |
| `admin.conduct.notice.confirmTitle` | Send this notice to {org}’s admins? | Envoyer cet avis aux administrateurs de {org}? | Enviar este aviso aos administradores de {org}? |
| `admin.conduct.notice.confirmDescription` | You can’t edit it after sending. Their 10 business days to respond start now. | Vous ne pourrez plus le modifier après l’envoi. Leurs 10 jours ouvrables pour répondre commencent maintenant. | Não será possível editar depois do envio. Os 10 dias úteis para resposta começam agora. |
| `admin.conduct.notice.sent` | Notice sent to {org}. | Avis envoyé à {org}. | Aviso enviado para {org}. |
| `admin.conduct.followup` | Ask a question | Poser une question | Fazer uma pergunta |
| `admin.conduct.followupTitle` | Ask {org} a follow-up question | Poser une question complémentaire à {org} | Fazer uma pergunta complementar para {org} |
| `admin.conduct.followupHint` | {org}’s admins can reply once. | Les administrateurs de {org} peuvent répondre une fois. | Os administradores de {org} podem responder uma vez. |
| `admin.conduct.followupSent` | Question sent to {org}. | Question envoyée à {org}. | Pergunta enviada para {org}. |
| `admin.conduct.decideLocked` | You can decide once {org} responds or the window closes on {when} ET. | Vous pourrez décider dès que {org} aura répondu ou à la fin du délai, le {when} HE. | Você poderá decidir quando {org} responder ou quando o prazo terminar, em {when} (horário de Toronto). |

- The follow-up dialog's submit button reuses `admin.conduct.askSubmit` ("Send question").
- `orgNotAcceptedVersion` is information only (PD-058). It doesn't block the notice: the org is bound by joining, and C-2 covers the gap between versions.
- **Conduct-date field errors** (§2.12 item 3, AC-147). `conductDateBeforeRules` shows under the date field when the date is earlier than the first published version's effective date; `{date}` is that effective date (the same value as the field's `min`), formatted with `f.date`. A future date reuses `network.report.errors.dateFuture` ("The date can't be in the future."): same rule, same words as the report form, so no admin duplicate. Both are field errors (`FormMessage`), not alerts.

**Decision form (S15):**

| Key | en | fr | pt |
|---|---|---|---|
| `admin.conduct.decision.title` | Decision | Décision | Decisão |
| `admin.conduct.decision.outcome` | Outcome | Résultat | Resultado |
| `admin.conduct.decision.rules` | Rules breached | Règles enfreintes | Regras descumpridas |
| `admin.conduct.decision.rulesFromNotice` | Only rules cited in the notice. To rely on another rule, send a new notice. | Seulement les règles citées dans l’avis. Pour invoquer une autre règle, envoyez un nouvel avis. | Só as regras citadas no aviso. Para usar outra regra, envie um novo aviso. |
| `admin.conduct.decision.finding` | Finding | Constat | Constatação |
| `admin.conduct.decision.findingHint` | {org} will read this. State the facts and how they break the rules cited. | {org} lira ce texte. Exposez les faits et en quoi ils enfreignent les règles citées. | {org} vai ler isto. Descreva os fatos e como eles descumprem as regras citadas. |
| `admin.conduct.decision.residual` | Residual test (rule 7.4) | Critère résiduel (règle 7.4) | Critério residual (regra 7.4) |
| `admin.conduct.decision.residualHint` | Tick if no specific rule covered this case. {org} will see that rule 7.4 was used. | Cochez si aucune règle précise ne couvrait ce cas. {org} verra que la règle 7.4 a été appliquée. | Marque se nenhuma regra específica cobria este caso. {org} verá que a regra 7.4 foi usada. |
| `admin.conduct.decision.sanction` | Sanction | Sanction | Sanção |
| `admin.conduct.decision.sanctionDescription.none` | First minor breach only. The finding is recorded. | Premier manquement mineur seulement. Le constat est inscrit au dossier. | Só para a primeira violação leve. A constatação fica registrada. |
| `admin.conduct.decision.sanctionDescription.warning` | Counts for 12 months. No other effect. | Compte pendant 12 mois. Aucun autre effet. | Conta por 12 meses. Nenhum outro efeito. |
| `admin.conduct.decision.sanctionDescription.network_hold` | No new partner activity. Referrals in progress continue. Lasts until lifted. | Aucune nouvelle activité avec les partenaires. Les recommandations en cours se poursuivent. Dure jusqu’à la levée. | Nenhuma nova atividade com parceiros. As indicações em andamento continuam. Vale até ser encerrada. |
| `admin.conduct.decision.sanctionDescription.suspension` | Settlement mode: only referrals in progress and what’s owed. Lasts until lifted. | Mode finalisation : seulement les recommandations en cours et ce qui est dû. Dure jusqu’à la levée. | Modo de finalização: só indicações em andamento e o que é devido. Vale até ser encerrada. |
| `admin.conduct.decision.sanctionDescription.termination` | Removed from the network. Settlement mode until everything is settled. Can reapply after 12 months. | Retrait du réseau. Mode finalisation jusqu’au règlement complet. Nouvelle demande possible après 12 mois. | Retirada da rede. Modo de finalização até tudo ser acertado. Pode pedir para entrar de novo após 12 meses. |
| `admin.conduct.decision.noneDisabled` | Not available: {org} has a sanction or a breach finding in the last 12 months that wasn’t overturned. | Non offert : {org} a une sanction ou un constat de manquement non annulé au cours des 12 derniers mois. | Indisponível: {org} tem uma sanção ou constatação de violação não anulada nos últimos 12 meses. |
| `admin.conduct.decision.plannedReview` | Planned reassessment date (optional) | Date de réévaluation prévue (facultatif) | Data prevista de reavaliação (opcional) |
| `admin.conduct.decision.plannedReviewHint` | For planning only. The hold doesn’t end on this date. | À titre indicatif. La restriction ne prend pas fin à cette date. | Só para planejamento. A restrição não termina nessa data. |
| `admin.conduct.decision.whyNotHold` | Why isn’t a network hold enough? | Pourquoi une restriction réseau ne suffit-elle pas? | Por que uma restrição de rede não basta? |
| `admin.conduct.decision.terminationNote` | They can reapply after 12 months (rule 9.7). Settlement mode lasts until their referrals and placements are settled. | L’organisation pourra présenter une nouvelle demande après 12 mois (règle 9.7). Le mode finalisation dure jusqu’au règlement de ses recommandations et placements. | A organização pode pedir para entrar de novo após 12 meses (regra 9.7). O modo de finalização dura até as indicações e colocações dela serem encerradas. |
| `admin.conduct.decision.afterHold.lift` | Lift the hold | Lever la restriction | Encerrar a restrição |
| `admin.conduct.decision.afterHold.keep` | Keep the hold | Maintenir la restriction | Manter a restrição |
| `admin.conduct.decision.afterHold.warning` | Change to a warning | Remplacer par un avertissement | Trocar por uma advertência |
| `admin.conduct.decision.sameNotice` | Use this only if the facts and rules are the ones in the notice. New facts or rules need a new notice. | N’utilisez cette option que si les faits et les règles sont ceux de l’avis. De nouveaux faits ou de nouvelles règles exigent un nouvel avis. | Use isto só se os fatos e as regras forem os do aviso. Fatos ou regras novos exigem um novo aviso. |
| `admin.conduct.decision.noStakesLine` | This notice didn’t list every possible outcome. Send a new notice to decide a higher level. | Cet avis n’énumérait pas toutes les issues possibles. Envoyez un nouvel avis pour décider d’un niveau plus élevé. | Este aviso não listava todos os resultados possíveis. Envie um novo aviso para decidir um nível mais alto. |
| `admin.conduct.decision.context` | Active warnings and sanctions in the last 12 months | Avertissements en cours et sanctions des 12 derniers mois | Advertências ativas e sanções dos últimos 12 meses |
| `admin.conduct.decision.contextEmpty` | None. | Aucun. | Nenhuma. |
| `admin.conduct.decision.record` | Record decision | Enregistrer la décision | Registrar decisão |
| `admin.conduct.decision.confirmTitle` | Record this decision? | Enregistrer cette décision? | Registrar esta decisão? |
| `admin.conduct.decision.confirm.noSanction` | No sanction applies. {org}’s admins are notified and can read the decision. | Aucune sanction ne s’applique. Les administrateurs de {org} sont avisés et peuvent lire la décision. | Nenhuma sanção se aplica. Os administradores de {org} são avisados e podem ler a decisão. |
| `admin.conduct.decision.confirm.none` | The finding is recorded on {org}’s file, with no sanction. Its admins are notified. | Le constat est inscrit au dossier de {org}, sans sanction. Ses administrateurs sont avisés. | A constatação fica registrada no histórico de {org}, sem sanção. Os administradores são avisados. |
| `admin.conduct.decision.confirm.warning` | {org} gets a warning that counts for 12 months. Its admins are notified. | {org} reçoit un avertissement qui compte pendant 12 mois. Ses administrateurs sont avisés. | {org} recebe uma advertência que conta por 12 meses. Os administradores são avisados. |
| `admin.conduct.decision.confirm.hold` | {org} will be on a network hold from now on. Its jobs will be hidden from partners. Referrals in progress continue. | {org} fera l’objet d’une restriction réseau dès maintenant. Ses postes seront masqués aux partenaires. Les recommandations en cours se poursuivent. | {org} fica com restrição de rede a partir de agora. As vagas dela ficarão ocultas para parceiros. As indicações em andamento continuam. |
| `admin.conduct.decision.confirm.holdKeep` | {org}’s network hold continues until it’s lifted. | La restriction réseau de {org} se poursuit jusqu’à sa levée. | A restrição de rede de {org} continua até ser encerrada. |
| `admin.conduct.decision.confirm.holdLift` | {org}’s network hold ends now. Its jobs become visible to partners again. | La restriction réseau de {org} prend fin maintenant. Ses postes redeviennent visibles pour les partenaires. | A restrição de rede de {org} termina agora. As vagas dela voltam a ficar visíveis para parceiros. |
| `admin.conduct.decision.confirm.suspension` | {org} will be suspended from now on and enter settlement mode. Members can only finish referrals in progress and settle what’s owed. | L’organisation {org} sera suspendue dès maintenant et passera en mode finalisation. Ses membres pourront seulement finaliser les recommandations en cours et régler ce qui est dû. | A organização {org} será suspensa a partir de agora e entrará em modo de finalização. Os membros só poderão concluir as indicações em andamento e acertar o que é devido. |
| `admin.conduct.decision.confirm.termination` | {org} will be removed from the network now and enter settlement mode until everything is settled. It can reapply after 12 months. | L’organisation {org} sera retirée du réseau dès maintenant et passera en mode finalisation jusqu’au règlement complet. Elle pourra présenter une nouvelle demande après 12 mois. | A organização {org} será retirada da rede agora e entrará em modo de finalização até tudo ser acertado. Ela poderá pedir para entrar de novo após 12 meses. |
| `admin.conduct.decision.confirmReporter` | The reporter will see “{outcome}”. | Le signalant verra « {outcome} ». | O autor do relato verá “{outcome}”. |
| `admin.conduct.decision.recorded` | Decision recorded. {org}’s admins were notified. | Décision enregistrée. Les administrateurs de {org} ont été avisés. | Decisão registrada. Os administradores de {org} foram avisados. |

- `confirmReporter` shows only when the case has a reporter; `{outcome}` is `network.reports.outcome.*` (the four reporter outcomes) in the admin's UI locale.
- `whyNotHold` uses `admin.conduct.orgWillRead` as its hint. The Q-D5 refusal (PD-058) shows `noneDisabled` in the UI and `errors.noSanctionNotAllowed` on a direct call (§5.16).

**Immediate hold (S16), review (S17), incident notice (S26), admin-initiated case (S18), errors:**

| Key | en | fr | pt |
|---|---|---|---|
| `admin.conduct.hold.title` | Apply an immediate network hold | Appliquer une restriction réseau immédiate | Aplicar uma restrição de rede imediata |
| `admin.conduct.hold.step1` | Step 1 of 2: ground and notice | Étape 1 sur 2 : motif et avis | Etapa 1 de 2: motivo e aviso |
| `admin.conduct.hold.step2` | Step 2 of 2: confirm | Étape 2 sur 2 : confirmation | Etapa 2 de 2: confirmação |
| `admin.conduct.hold.ground` | Ground (rule 9.4) | Motif (règle 9.4) | Motivo (regra 9.4) |
| `admin.conduct.hold.ground23` | Rule 2.3: shared information outside their organization | Règle 2.3 : communication de renseignements à l’extérieur de l’organisation | Regra 2.3: compartilhou informações fora da organização |
| `admin.conduct.hold.ground48` | Rule 4.8: forged evidence or false candidate confirmations | Règle 4.8 : pièces justificatives falsifiées ou fausses confirmations de candidats | Regra 4.8: comprovantes falsificados ou confirmações falsas de candidatos |
| `admin.conduct.hold.groundHint` | Only these two grounds allow a hold before the organization responds. | Seuls ces deux motifs permettent une restriction avant la réponse de l’organisation. | Só esses dois motivos permitem uma restrição antes da resposta da organização. |
| `admin.conduct.hold.confirmTitle` | Apply the hold and send the notice now? | Appliquer la restriction et envoyer l’avis maintenant? | Aplicar a restrição e enviar o aviso agora? |
| `admin.conduct.hold.confirmDescription` | {org}’s jobs will be hidden from partners right away. Their referrals in progress continue. Their 10 business days to respond start now. | Les postes de {org} seront masqués aux partenaires immédiatement. Ses recommandations en cours se poursuivent. Ses 10 jours ouvrables pour répondre commencent maintenant. | As vagas de {org} ficarão ocultas para parceiros na hora. As indicações em andamento continuam. O prazo de 10 dias úteis para resposta começa agora. |
| `admin.conduct.hold.submit` | Apply hold and send notice | Restreindre et envoyer l’avis | Aplicar restrição e enviar aviso |
| `admin.conduct.hold.done` | Hold applied. Notice sent to {org}. | Restriction appliquée. Avis envoyé à {org}. | Restrição aplicada. Aviso enviado para {org}. |
| `admin.conduct.review.title` | Review | Révision | Revisão |
| `admin.conduct.review.request` | Review request from {org} | Demande de révision de {org} | Pedido de revisão de {org} |
| `admin.conduct.review.decidedBy` | Decided by {name} | Décidé par {name} | Decidido por {name} |
| `admin.conduct.review.selfBlocked` | You decided this, so another platform admin must review it. | Vous avez rendu cette décision : un autre administrateur de la plateforme doit la réviser. | Você tomou esta decisão, então outro admin da plataforma precisa revisá-la. |
| `admin.conduct.review.selfBlockedHold` | You applied this hold, so another platform admin must review it. | Vous avez appliqué cette restriction : un autre administrateur de la plateforme doit la réviser. | Você aplicou esta restrição, então outro admin da plataforma precisa revisá-la. |
| `admin.conduct.review.needsSecond` | Needs a second admin. No other platform admin can review this yet. | Deuxième administrateur requis. Aucun autre administrateur de la plateforme ne peut encore réviser ce dossier. | Requer outro admin. Nenhum outro admin da plataforma pode revisar este caso ainda. |
| `admin.conduct.review.outcome` | Outcome | Résultat | Resultado |
| `admin.conduct.review.confirm` | Confirm the decision | Confirmer la décision | Confirmar a decisão |
| `admin.conduct.review.reduce` | Reduce the sanction | Réduire la sanction | Reduzir a sanção |
| `admin.conduct.review.overturn` | Overturn the decision | Annuler la décision | Anular a decisão |
| `admin.conduct.review.overturnHint` | The sanction is lifted and won’t count in later decisions. | La sanction est levée et ne comptera pas dans les décisions futures. | A sanção é encerrada e não conta em decisões futuras. |
| `admin.conduct.review.newLevel` | New level | Nouveau niveau | Novo nível |
| `admin.conduct.review.liftOption` | Lift the sanction | Lever la sanction | Encerrar a sanção |
| `admin.conduct.review.reason` | Reason | Motifs | Motivo |
| `admin.conduct.review.record` | Record review | Enregistrer la révision | Registrar revisão |
| `admin.conduct.review.recorded` | Review recorded. {org}’s admins were notified. | Révision enregistrée. Les administrateurs de {org} ont été avisés. | Revisão registrada. Os administradores de {org} foram avisados. |
| `admin.conduct.incident.action` | Send incident notice | Envoyer un avis d’incident | Enviar aviso de incidente |
| `admin.conduct.incident.title` | Send a data incident notice | Envoyer un avis d’incident lié à des renseignements | Enviar um aviso de incidente com dados |
| `admin.conduct.incident.intro` | Tell affected organizations what happened to their information. Write facts only. Don’t mention the decision, the sanction or the reporter. | Informez les organisations touchées de ce qui est arrivé à leurs renseignements. Exposez seulement les faits. Ne mentionnez ni la décision, ni la sanction, ni le signalant. | Informe às organizações afetadas o que aconteceu com as informações delas. Escreva só fatos. Não mencione a decisão, a sanção nem o autor do relato. |
| `admin.conduct.incident.orgs` | Affected organizations | Organisations touchées | Organizações afetadas |
| `admin.conduct.incident.orgsEmpty` | Add a referral to find affected organizations. | Ajoutez une recommandation pour trouver les organisations touchées. | Adicione uma indicação para encontrar as organizações afetadas. |
| `admin.conduct.incident.referrals` | Referrals concerned | Recommandations visées | Indicações envolvidas |
| `admin.conduct.incident.addReferral` | Add a referral | Ajouter une recommandation | Adicionar indicação |
| `admin.conduct.incident.what` | What information | Renseignements concernés | Informações envolvidas |
| `admin.conduct.incident.when` | When | Quand | Quando |
| `admin.conduct.incident.toWhom` | To whom, if known (optional) | À qui, si on le sait (facultatif) | Para quem, se souber (opcional) |
| `admin.conduct.incident.guidanceLocked` | Added to every incident notice | Ajoutée à chaque avis d’incident | Incluída em todo aviso de incidente |
| `admin.conduct.incident.variantSourcing` | Sourcing side | Recruteur d’origine | Recrutador de origem |
| `admin.conduct.incident.variantHiring` | Hiring side | Recruteur du poste | Recrutador da vaga |
| `admin.conduct.incident.variantRecipients` | Recipients: {orgs} | Destinataires : {orgs} | Destinatários: {orgs} |
| `admin.conduct.incident.send` | Send notice | Envoyer l’avis | Enviar aviso |
| `admin.conduct.incident.confirm.one` | Send this incident notice to {count} organization? It doesn’t mention any sanction. | Envoyer cet avis d’incident à {count} organisation? Il ne mentionne aucune sanction. | Enviar este aviso de incidente para {count} organização? Ele não menciona nenhuma sanção. |
| `admin.conduct.incident.confirm.other` | Send this incident notice to {count} organizations? It doesn’t mention any sanction. | Envoyer cet avis d’incident à {count} organisations? Il ne mentionne aucune sanction. | Enviar este aviso de incidente para {count} organizações? Ele não menciona nenhuma sanção. |
| `admin.conduct.incident.done.one` | Incident notice sent to {count} organization. | Avis d’incident envoyé à {count} organisation. | Aviso de incidente enviado para {count} organização. |
| `admin.conduct.incident.done.other` | Incident notice sent to {count} organizations. | Avis d’incident envoyé à {count} organisations. | Aviso de incidente enviado para {count} organizações. |
| `admin.conduct.newCase` | Open conduct case | Ouvrir un dossier de conduite | Abrir caso de conduta |
| `admin.conduct.newCaseTitle` | Open a conduct case | Ouvrir un dossier de conduite | Abrir um caso de conduta |
| `admin.conduct.newCaseOrg` | Organization | Organisation | Organização |
| `admin.conduct.newCaseCategory` | Category | Catégorie | Categoria |
| `admin.conduct.newCaseSource` | Source | Source | Origem |
| `admin.conduct.source.rd029` | Confirmation found invalid | Confirmation jugée invalide | Confirmação considerada inválida |
| `admin.conduct.source.n1` | Objection found fabricated | Objection jugée fabriquée | Objeção considerada fabricada |
| `admin.conduct.source.other` | Other | Autre | Outra |
| `admin.conduct.newCaseReferral` | Related referral (optional) | Recommandation liée (facultatif) | Indicação relacionada (opcional) |
| `admin.conduct.newCaseDescription` | Description | Description | Descrição |
| `admin.conduct.newCaseDescriptionHint` | Only platform admins see this. The organization sees only the notice you send. | Seuls les administrateurs de la plateforme voient ce texte. L’organisation voit seulement l’avis que vous envoyez. | Só admins da plataforma veem isto. A organização vê apenas o aviso que você enviar. |
| `admin.conduct.newCaseFiles` | Files (optional) | Fichiers (facultatif) | Arquivos (opcional) |
| `admin.conduct.newCaseSubmit` | Open case | Ouvrir le dossier | Abrir caso |
| `admin.conduct.newCaseCreated` | Case opened. | Dossier ouvert. | Caso aberto. |
| `admin.conduct.errors.alreadyRestricted` | {org} is already on a network hold, suspended or removed from the network. An immediate hold isn’t possible. | L’organisation {org} fait déjà l’objet d’une restriction réseau, d’une suspension ou d’une exclusion. Une restriction immédiate n’est pas possible. | A organização {org} já está com restrição de rede, suspensa ou retirada da rede. Não é possível aplicar uma restrição imediata. |
| `admin.conduct.errors.noSanctionNotAllowed` | “No sanction” isn’t allowed: {org} has a sanction or a breach finding in the last 12 months that wasn’t overturned. Choose a level. | « Aucune sanction » n’est pas permis : {org} a une sanction ou un constat de manquement non annulé au cours des 12 derniers mois. Choisissez un niveau. | “Sem sanção” não é permitido: {org} tem uma sanção ou constatação de violação não anulada nos últimos 12 meses. Escolha um nível. |
| `admin.conduct.errors.reasonRequired` | Explain why a network hold isn’t enough. | Expliquez pourquoi une restriction réseau ne suffit pas. | Explique por que uma restrição de rede não basta. |
| `admin.conduct.errors.groundInvalid` | An immediate hold is allowed only under rule 2.3 or 4.8. | Une restriction immédiate n’est permise qu’en vertu de la règle 2.3 ou 4.8. | Uma restrição imediata só é permitida pela regra 2.3 ou 4.8. |
| `admin.conduct.errors.cannotIncrease` | A review can’t increase the sanction. To go higher, send a new notice. | Une révision ne peut pas alourdir la sanction. Pour aller plus loin, envoyez un nouvel avis. | Uma revisão não pode aumentar a sanção. Para ir além, envie um novo aviso. |

- The review reason uses `admin.conduct.orgWillRead` as its hint. The incident preview tab reuses `admin.conduct.notice.tabPreview`.
- **Incident guidance variants (S26).** `variantSourcing` / `variantHiring` label each locked guidance line and each preview tab, one per variant in use (one variant in use: one tab, still labelled, so the admin sees which line goes out). Each tab starts with `variantRecipients`; `{orgs}` is the org names joined with the locale's list format (`Intl.ListFormat`, "A, B and C" / « A, B et C » / "A, B e C"). An org on both sides is listed in both tabs. The labels use the glossary's side names (§5.1: *recruteur d'origine* / *du poste*, *recrutador de origem* / *da vaga*); fr runs a little over the +30% tab budget, which the dialog's tab row absorbs (admin-only, no truncation).
- **`alreadyRestricted`** (`org_already_restricted`, PD-058 Q7): the action is hidden on a held, suspended or terminated org, so this only shows on a stale page or a direct call. It's still available on `rules_not_accepted`.
- The draft's admin-org-page stale keys moved to §5.13.

### 5.13 Admin org page (S19, S27)

Replaces `SuspendButton` and `admin.suspension.*` on this page (those keys can be removed once no UI uses them). The lift reasons reuse the existing `admin.validation.reason`. The "Partner" column reuses `admin.orgDetail.partner`.

| Key | en | fr | pt |
|---|---|---|---|
| `admin.orgDetail.standing` | Network standing | Statut réseau | Situação na rede |
| `admin.orgDetail.standingPill.active` | Active | Active | Ativa |
| `admin.orgDetail.standingPill.warning` | Warning active | Avertissement en cours | Advertência ativa |
| `admin.orgDetail.standingPill.hold` | Network hold | Restriction réseau | Restrição de rede |
| `admin.orgDetail.standingPill.suspended` | Suspended | Suspendue | Suspensa |
| `admin.orgDetail.standingPill.terminatedSettling` | Terminated (settling) | Exclue (finalisation) | Excluída (finalização) |
| `admin.orgDetail.standingPill.terminated` | Terminated | Exclue | Excluída |
| `admin.orgDetail.rulesNotAccepted` | Rules not accepted | Règles non acceptées | Regras não aceitas |
| `admin.orgDetail.legacySuspended` | Suspended (before N10) | Suspendue (avant N10) | Suspensa (antes do N10) |
| `admin.orgDetail.standingSince` | {level} since {date} | {level} depuis le {date} | {level} desde {date} |
| `admin.orgDetail.caseLink` | View case | Voir le dossier | Ver caso |
| `admin.orgDetail.lift` | Lift… | Lever… | Encerrar… |
| `admin.orgDetail.liftHoldTitle` | Lift the network hold on {org}? | Lever la restriction réseau de {org}? | Encerrar a restrição de rede de {org}? |
| `admin.orgDetail.liftHoldDescription` | Its jobs become visible to partners again, and it can submit and receive referrals. Its admins are notified. | Ses postes redeviennent visibles pour les partenaires, et l’organisation peut de nouveau soumettre et recevoir des recommandations. Ses administrateurs sont avisés. | As vagas voltam a ficar visíveis para parceiros, e a organização pode enviar e receber indicações. Os administradores são avisados. |
| `admin.orgDetail.liftSuspensionTitle` | Lift the suspension of {org}? | Lever la suspension de {org}? | Encerrar a suspensão de {org}? |
| `admin.orgDetail.liftSuspensionDescription` | Settlement mode ends, and members get full access again. Its admins are notified. | Le mode finalisation prend fin, et les membres retrouvent un accès complet. Ses administrateurs sont avisés. | O modo de finalização termina, e os membros voltam a ter acesso completo. Os administradores são avisados. |
| `admin.orgDetail.liftReason` | Reason (kept in the audit log) | Motif (conservé dans le journal d’audit) | Motivo (fica no log de auditoria) |
| `admin.orgDetail.liftHoldConfirm` | Lift hold | Lever la restriction | Encerrar restrição |
| `admin.orgDetail.liftSuspensionConfirm` | Lift suspension | Lever la suspension | Encerrar suspensão |
| `admin.orgDetail.holdLifted` | Network hold lifted. | Restriction réseau levée. | Restrição de rede encerrada. |
| `admin.orgDetail.suspensionLifted` | Suspension lifted. | Suspension levée. | Suspensão encerrada. |
| `admin.orgDetail.liftTermination` | Lift termination… | Lever l’exclusion… | Encerrar exclusão… |
| `admin.orgDetail.liftTerminationTitle` | Lift the termination of {org}? | Lever l’exclusion de {org}? | Encerrar a exclusão de {org}? |
| `admin.orgDetail.liftTerminationDescription` | Use this only to correct an error found after the decision. Settlement mode ends, members get full access again, and the termination won’t count in later decisions. Its admins are notified. | À utiliser seulement pour corriger une erreur découverte après la décision. Le mode finalisation prend fin, les membres retrouvent un accès complet, et l’exclusion ne comptera pas dans les décisions futures. Ses administrateurs sont avisés. | Use só para corrigir um erro descoberto depois da decisão. O modo de finalização termina, os membros voltam a ter acesso completo, e a exclusão não conta em decisões futuras. Os administradores são avisados. |
| `admin.orgDetail.liftTerminationReason` | What was the error? (kept in the audit log) | Quelle était l’erreur? (conservé dans le journal d’audit) | Qual foi o erro? (fica no log de auditoria) |
| `admin.orgDetail.liftTerminationConfirm` | Lift termination | Lever l’exclusion | Encerrar exclusão |
| `admin.orgDetail.terminationLifted` | Termination lifted. | Exclusion levée. | Exclusão encerrada. |
| `admin.orgDetail.liftTerminationSelf` | You decided this termination, so another platform admin must lift it. | Vous avez décidé cette exclusion : un autre administrateur de la plateforme doit la lever. | Você decidiu esta exclusão, então outro admin da plataforma precisa encerrá-la. |
| `admin.orgDetail.sanctions` | Sanctions | Sanctions | Sanções |
| `admin.orgDetail.noSanctions` | No sanctions. | Aucune sanction. | Nenhuma sanção. |
| `admin.orgDetail.col.level` | Level | Niveau | Nível |
| `admin.orgDetail.col.decided` | Decided | Décidée le | Decidida em |
| `admin.orgDetail.col.by` | By | Par | Por |
| `admin.orgDetail.col.case` | Case | Dossier | Caso |
| `admin.orgDetail.col.status` | Status | Statut | Status |
| `admin.orgDetail.col.expires` | Expires | Expire le | Expira em |
| `admin.orgDetail.col.job` | Job | Poste | Vaga |
| `admin.orgDetail.openCases` | Open cases | Dossiers ouverts | Casos em aberto |
| `admin.orgDetail.noOpenCases` | No open cases. | Aucun dossier ouvert. | Nenhum caso em aberto. |
| `admin.orgDetail.nextDeadline` | Next deadline: {when} ET | Prochaine échéance : {when} HE | Próximo prazo: {when} (Toronto) |
| `admin.orgDetail.rulesAcceptance` | Rules acceptance | Acceptation des règles | Aceite das regras |
| `admin.orgDetail.orgAccepted` | Organization accepted version {label} on {date}. | L’organisation a accepté la version {label} le {date}. | A organização aceitou a versão {label} em {date}. |
| `admin.orgDetail.orgNotAccepted` | Organization hasn’t accepted version {label}. | L’organisation n’a pas accepté la version {label}. | A organização não aceitou a versão {label}. |
| `admin.orgDetail.membersNotAccepted.one` | {count} member hasn’t accepted version {label}. | {count} membre n’a pas accepté la version {label}. | {count} membro não aceitou a versão {label}. |
| `admin.orgDetail.membersNotAccepted.other` | {count} members haven’t accepted version {label}. | {count} membres n’ont pas accepté la version {label}. | {count} membros não aceitaram a versão {label}. |
| `admin.orgDetail.showNames` | Show names | Afficher les noms | Mostrar nomes |
| `admin.orgDetail.obligations` | Remaining obligations | Obligations restantes | Obrigações pendentes |
| `admin.orgDetail.obligationsHint` | Settlement mode ends when this list is empty. | Le mode finalisation prend fin quand cette liste est vide. | O modo de finalização termina quando esta lista estiver vazia. |
| `admin.orgDetail.noObligations` | No remaining obligations. | Aucune obligation restante. | Nenhuma obrigação pendente. |
| `admin.orgDetail.allSettled` | All settled. Members no longer have access. | Tout est réglé. Les membres n’ont plus accès. | Tudo acertado. Os membros não têm mais acesso. |
| `admin.orgDetail.referralsInProgress` | Referrals in progress | Recommandations en cours | Indicações em andamento |
| `admin.orgDetail.placementsOpen` | Placements with an open obligation | Placements avec une obligation en cours | Colocações com obrigação pendente |
| `admin.orgDetail.obligation.guarantee` | Guarantee running | Garantie en cours | Garantia em andamento |
| `admin.orgDetail.obligation.payout` | Payout not confirmed | Versement non confirmé | Repasse não confirmado |
| `admin.orgDetail.obligation.refund` | Refund due | Remboursement dû | Reembolso devido |
| `admin.orgDetail.obligation.dispute` | Open dispute | Litige ouvert | Disputa aberta |
| `admin.orgDetail.stale.one` | No activity for {count} day | Aucune activité depuis {count} jour | Sem atividade há {count} dia |
| `admin.orgDetail.stale.other` | No activity for {count} days | Aucune activité depuis {count} jours | Sem atividade há {count} dias |
| `admin.orgDetail.closeStale` | Close as cancelled… | Fermer comme annulée… | Encerrar como cancelada… |
| `admin.orgDetail.closeStaleTitle` | Close this referral as cancelled? | Fermer cette recommandation comme annulée? | Encerrar esta indicação como cancelada? |
| `admin.orgDetail.closeStaleDescription` | Both sides will see it as cancelled. The sourcing side keeps its ownership window. | Les deux parties la verront comme annulée. Le recruteur d’origine conserve sa période de propriété. | As duas partes vão vê-la como cancelada. O recrutador de origem mantém o período de titularidade. |
| `admin.orgDetail.closeStaleReason` | Reason (kept in the audit log, admins only) | Motif (conservé dans le journal d’audit, administrateurs seulement) | Motivo (fica no log de auditoria, só para admins) |
| `admin.orgDetail.closeStaleConfirm` | Close as cancelled | Fermer comme annulée | Encerrar como cancelada |
| `admin.orgDetail.staleClosed` | Referral closed as cancelled. | Recommandation fermée comme annulée. | Indicação encerrada como cancelada. |
| `admin.orgDetail.errors.notStale` | This referral had activity in the last 60 days, so it can’t be closed this way. | Cette recommandation a eu de l’activité au cours des 60 derniers jours : elle ne peut pas être fermée ainsi. | Esta indicação teve atividade nos últimos 60 dias, então não pode ser encerrada assim. |
| `admin.orgDetail.errors.notTerminated` | Only referrals of an organization removed from the network can be closed this way. | Seules les recommandations d’une organisation retirée du réseau peuvent être fermées ainsi. | Só indicações de uma organização retirada da rede podem ser encerradas assim. |
| `admin.orgDetail.errors.liftNotAllowed` | Another platform admin must lift this termination. | Un autre administrateur de la plateforme doit lever cette exclusion. | Outro admin da plataforma precisa encerrar esta exclusão. |

Notes:
- **Lift termination…** (PD-058, Q-D14): an error-correction path only, reason required, by an admin other than the decider. For the decider, the button is replaced by `liftTerminationSelf`; a direct call gets `errors.liftNotAllowed`. The org gets `sanction.lifted` (§5.15), which doesn't say why.
- **"Suspended (before N10)"** is the PM's label (PD-058, Q-D15). It's admin-only, so the release name is acceptable. It has **Lift…** only and uses `liftSuspensionTitle` / `Description`.
- Admin pills say "Terminated" / « Exclue » / "Excluída": admin language may name the level. Members read "Removed from the network".
- "Placements with an open obligation" includes a settled placement still in its guarantee (PD-058, BR-37): `obligation.guarantee`.

### 5.14 Team column (S23, Should) and org audit labels

Audit action keys are the event names with dots replaced by underscores (a dot would nest the JSON key).

| Key | en | fr | pt |
|---|---|---|---|
| `settings.team.rulesColumn` | Network Rules | Règles du réseau | Regras da rede |
| `settings.team.rulesAccepted` | Version {label} accepted | Version {label} acceptée | Versão {label} aceita |
| `settings.team.rulesNotAccepted` | Not accepted yet | Pas encore acceptée | Ainda não aceita |
| `settings.audit.actions.network_rules_org_accepted` | Network Rules accepted for the organization | Règles du réseau acceptées pour l’organisation | Regras da rede aceitas pela organização |
| `settings.audit.actions.network_rules_member_accepted` | Network Rules accepted by a member | Règles du réseau acceptées par un membre | Regras da rede aceitas por um membro |
| `settings.audit.actions.conduct_report_filed` | Conduct report sent | Signalement envoyé | Relato de conduta enviado |
| `settings.audit.actions.conduct_notice_sent` | Notice received from Workatent | Avis reçu de Workatent | Aviso recebido do Workatent |
| `settings.audit.actions.conduct_response_submitted` | Response to a notice sent | Réponse à un avis envoyée | Resposta a um aviso enviada |
| `settings.audit.actions.conduct_followup_sent` | Follow-up question received | Question complémentaire reçue | Pergunta complementar recebida |
| `settings.audit.actions.conduct_followup_answered` | Follow-up question answered | Réponse à une question complémentaire envoyée | Pergunta complementar respondida |
| `settings.audit.actions.conduct_decided` | Decision recorded | Décision enregistrée | Decisão registrada |
| `settings.audit.actions.sanction_applied` | Sanction applied | Sanction appliquée | Sanção aplicada |
| `settings.audit.actions.sanction_lifted` | Sanction lifted | Sanction levée | Sanção encerrada |
| `settings.audit.actions.sanction_immediate_hold` | Immediate network hold applied | Restriction réseau immédiate appliquée | Restrição de rede imediata aplicada |
| `settings.audit.actions.sanction_review_requested` | Review requested | Révision demandée | Revisão solicitada |
| `settings.audit.actions.sanction_reviewed` | Review decided | Révision tranchée | Revisão decidida |
| `settings.audit.actions.settlement_mode_entered` | Settlement mode started | Mode finalisation commencé | Modo de finalização iniciado |
| `settings.audit.actions.settlement_mode_exited` | Settlement mode ended | Mode finalisation terminé | Modo de finalização encerrado |
| `settings.audit.actions.conduct_incident_notice_sent` | Data incident notice received | Avis d’incident lié à des renseignements reçu | Aviso de incidente com dados recebido |
| `settings.audit.actions.referral_closed_stale_by_admin` | Referral closed by Workatent (no activity) | Recommandation fermée par Workatent (aucune activité) | Indicação encerrada pelo Workatent (sem atividade) |

**Who sees these labels (decided, §2.15, AC-149):** the `conduct_*`, `sanction_*`, `settlement_mode_*` and `conduct_incident_*` events (and `conduct_report_filed`) are returned to `org_admin`s only, so recruiter managers never see these labels. The acceptance labels and `referral_closed_stale_by_admin` stay visible to every role that reads the audit today.

### 5.15 Notifications (S24)

In-app only. Each kind's en title and body are written in SQL (PD-026) **exactly as the en column below**; the keys `network.notifications.<kind>.title|body` (dots in the kind become underscores) are ready for the localisation follow-up. **No notification carries allegation text, the category, the reporter, the finding or the sanction level** (BR-39, AC-112). Params are PII-free: `{label}`, `{date}`, `{when}`.

| Kind → link | Recipients |
|---|---|
| `network_rules.published` → `/network-rules#upcoming` | all members |
| `network_rules.effective_not_accepted` → accept page | org admins (org not accepted) + members who haven't accepted |
| `network_rules.reminder` (Should) → accept page | members who haven't accepted, 7 days before |
| `conduct_report.received` → report page | reporter |
| `conduct_report.info_requested` → report page | reporter |
| `conduct_report.closed` → report page | reporter; **if the reporter has left, the reporting org's org admins** (PD-058, Q-D6), with `titleOrg` |
| `conduct_report.outcome_updated` → report page | same as `closed`, with `titleOrg` when sent to org admins |
| `conduct.incident_notice` → S25 | org admins of each selected affected org |
| `conduct.notice_sent` → case page | reported org admins |
| `sanction.immediate_hold` → case page | reported org admins |
| `conduct.followup` → case page | reported org admins |
| `conduct.response_received` → admin case | platform admins |
| `conduct.decided` → case page | reported org admins |
| `sanction.lifted` → standing page | reported org admins (hold, suspension, termination lifted) |
| `sanction.review_requested` → admin case | platform admins |
| `sanction.reviewed` → case page | reported org admins |
| `conduct_report.reply_received` (proposed) → admin case | platform admins |
| `conduct.followup_answered` (proposed) → admin case | platform admins |

| Key | en | fr | pt |
|---|---|---|---|
| `network.notifications.network_rules_published.title` | Network Rules {label} published | Version {label} des Règles du réseau publiée | Versão {label} das Regras da rede publicada |
| `network.notifications.network_rules_published.bodyAccept` | Read what changed and accept it by {date}. | Lisez ce qui change et acceptez-la d’ici le {date}. | Veja o que mudou e aceite até {date}. |
| `network.notifications.network_rules_published.bodyInfo` | Read what changed. No action needed. | Lisez ce qui change. Aucune action requise. | Veja o que mudou. Nenhuma ação necessária. |
| `network.notifications.network_rules_effective_not_accepted.title` | Network Rules {label} are now in effect | La version {label} des Règles du réseau est en vigueur | A versão {label} das Regras da rede está em vigor |
| `network.notifications.network_rules_effective_not_accepted.body` | Accept it to open jobs to partners and submit referrals again. | Acceptez-la pour pouvoir de nouveau ouvrir des postes aux partenaires et soumettre des recommandations. | Aceite para voltar a abrir vagas para parceiros e enviar indicações. |
| `network.notifications.network_rules_reminder.title` | Network Rules {label} take effect in 7 days | La version {label} des Règles du réseau entre en vigueur dans 7 jours | A versão {label} das Regras da rede entra em vigor em 7 dias |
| `network.notifications.network_rules_reminder.body` | Review and accept it before {date}. | Examinez-la et acceptez-la avant le {date}. | Revise e aceite antes de {date}. |
| `network.notifications.conduct_report_received.title` | We received your report | Nous avons reçu votre signalement | Recebemos seu relato |
| `network.notifications.conduct_report_received.body` | We aim to respond by {when} ET. | Nous visons à répondre d’ici le {when} HE. | Buscamos responder até {when} (horário de Toronto). |
| `network.notifications.conduct_report_info_requested.title` | Workatent has a question about your report | Workatent a une question sur votre signalement | O Workatent tem uma pergunta sobre seu relato |
| `network.notifications.conduct_report_info_requested.body` | Open your report to reply. | Ouvrez votre signalement pour répondre. | Abra seu relato para responder. |
| `network.notifications.conduct_report_closed.title` | Your report is closed | Votre signalement est fermé | Seu relato foi encerrado |
| `network.notifications.conduct_report_closed.titleOrg` | A report from your organization is closed | Un signalement de votre organisation est fermé | Um relato da sua organização foi encerrado |
| `network.notifications.conduct_report_closed.body` | Open it to see the outcome. | Ouvrez-le pour voir le résultat. | Abra para ver o resultado. |
| `network.notifications.conduct_report_outcome_updated.title` | The outcome of your report changed | Le résultat de votre signalement a changé | O resultado do seu relato mudou |
| `network.notifications.conduct_report_outcome_updated.titleOrg` | The outcome of a report from your organization changed | Le résultat d’un signalement de votre organisation a changé | O resultado de um relato da sua organização mudou |
| `network.notifications.conduct_report_outcome_updated.body` | Open it to see the outcome. | Ouvrez-le pour voir le résultat. | Abra para ver o resultado. |
| `network.notifications.conduct_incident_notice.title` | Workatent sent you a data incident notice | Workatent vous a envoyé un avis d’incident lié à des renseignements | O Workatent enviou um aviso de incidente com dados |
| `network.notifications.conduct_incident_notice.body` | It concerns information from your referrals. Open it to read the details. | Il concerne des renseignements provenant de vos recommandations. Ouvrez-le pour lire les détails. | Ele envolve informações das suas indicações. Abra para ler os detalhes. |
| `network.notifications.conduct_notice_sent.title` | You have a notice from Workatent | Vous avez reçu un avis de Workatent | Você recebeu um aviso do Workatent |
| `network.notifications.conduct_notice_sent.body` | Read it and respond by {when} ET. | Lisez-le et répondez d’ici le {when} HE. | Leia e responda até {when} (horário de Toronto). |
| `network.notifications.sanction_immediate_hold.title` | You have an urgent notice from Workatent | Vous avez reçu un avis urgent de Workatent | Você recebeu um aviso urgente do Workatent |
| `network.notifications.sanction_immediate_hold.body` | Read it now. You can respond until {when} ET. | Lisez-le dès maintenant. Vous pouvez répondre jusqu’au {when} HE. | Leia agora. Você pode responder até {when} (horário de Toronto). |
| `network.notifications.conduct_followup.title` | Workatent has a follow-up question | Workatent a une question complémentaire | O Workatent tem uma pergunta complementar |
| `network.notifications.conduct_followup.body` | Open the notice to reply. | Ouvrez l’avis pour répondre. | Abra o aviso para responder. |
| `network.notifications.conduct_response_received.title` | Response received on a conduct case | Réponse reçue dans un dossier de conduite | Resposta recebida em um caso de conduta |
| `network.notifications.conduct_response_received.body` | Open the case to read it. | Ouvrez le dossier pour la lire. | Abra o caso para ler. |
| `network.notifications.conduct_decided.title` | Workatent recorded a decision | Workatent a rendu une décision | O Workatent registrou uma decisão |
| `network.notifications.conduct_decided.body` | Read it on your Network standing page. | Consultez-la sur la page Statut réseau. | Leia na página Situação na rede. |
| `network.notifications.sanction_lifted.title` | A sanction on your organization was lifted | Une sanction visant votre organisation a été levée | Uma sanção da sua organização foi encerrada |
| `network.notifications.sanction_lifted.body` | See the details on your Network standing page. | Consultez les détails sur la page Statut réseau. | Veja os detalhes na página Situação na rede. |
| `network.notifications.sanction_review_requested.title` | Review requested on a conduct case | Révision demandée dans un dossier de conduite | Revisão solicitada em um caso de conduta |
| `network.notifications.sanction_review_requested.body` | Another platform admin must review the decision. | Un autre administrateur de la plateforme doit réviser la décision. | Outro admin da plataforma precisa revisar a decisão. |
| `network.notifications.sanction_reviewed.title` | Your review request was decided | Votre demande de révision a été tranchée | Seu pedido de revisão foi decidido |
| `network.notifications.sanction_reviewed.body` | See the outcome on your Network standing page. | Consultez le résultat sur la page Statut réseau. | Veja o resultado na página Situação na rede. |
| `network.notifications.conduct_report_reply_received.title` | The reporter replied on a conduct case | Le signalant a répondu dans un dossier de conduite | O autor do relato respondeu em um caso de conduta |
| `network.notifications.conduct_report_reply_received.body` | Open the case to read the reply. | Ouvrez le dossier pour lire la réponse. | Abra o caso para ler a resposta. |
| `network.notifications.conduct_followup_answered.title` | Follow-up answered on a conduct case | Réponse à une question complémentaire dans un dossier de conduite | Pergunta complementar respondida em um caso de conduta |
| `network.notifications.conduct_followup_answered.body` | Open the case to read the reply. | Ouvrez le dossier pour lire la réponse. | Abra o caso para ler a resposta. |

Notes:
- **`sanction.immediate_hold` title changed.** The draft said "Your organization is on a network hold", which names the level in a notification (against BR-39 and AC-112). "Urgent notice" is enough: the B2 banner already tells members about the hold.
- `network_rules.published` uses `bodyAccept` for material and legally required versions, `bodyInfo` for non-material ones.
- The two **proposed** admin kinds (reporter reply, follow-up answer) aren't in S24. The backend confirms whether to add them; drop the keys if not.
- `conduct_report.received` and `info_requested` always go to the reporting user.

### 5.16 Server error codes → keys

| Code (server) | Where it shows | Key |
|---|---|---|
| `rules_acceptance_required` (onboarding) | S2 alert, back to step 3 | `network.accept.required` |
| `rules_acceptance_required` (workspace action, stale tab) | generic action error + link | `network.errors.acceptanceRequired` + `network.errors.reviewRulesLink` |
| `rules_acceptance_required` (job switched to open, Q-D4) | job form, inline | `jobs.form.errors.userMustAccept` |
| `rules_acceptance_required` (composer, per user) | submit panel | `referrals.composer.userMustAccept` |
| `rules_version_changed` | S1/S2 inline alert | `network.accept.versionChanged` |
| `partner_activity_restricted` | composer inline alert | `referrals.composer.restrictedHold` / `restrictedRules` (generic fallback `network.errors.partnerActivityRestricted`) |
| `settlement_mode_unavailable` | generic action error | `network.errors.settlementUnavailable` |
| `report_self` | report dialog | `network.report.errors.self` |
| report not found / forged id | report dialog | `network.report.errors.notFound` |
| report rate limit (user / org) | report dialog, top alert | `network.report.errors.userLimit…` / `orgLimit…` |
| `conduct_reply_closed` | reporter reply / follow-up reply | `network.reports.replyClosed` / `network.case.errors.replyClosed` |
| `conduct_response_closed` | S11 | `network.case.errors.closed` |
| `conduct_response_exists` | S11 | `network.case.errors.exists` |
| `review_already_requested` | S11 | `network.case.errors.reviewExists` |
| `review_window_closed` | S11 | `network.case.errors.reviewClosed` |
| `last_admin` | Team in settlement mode | `network.team.lastAdmin` |
| self-deactivation | Team in settlement mode | `onboarding.errors.selfChange` (existing) |
| `upcoming_exists` | S5/S6 | `admin.networkRules.upcomingExists` |
| `missing_locale` | S6 tab | `admin.networkRules.errors.missingLocale` / `missingSummary` |
| `marker_found` | S6 list | `admin.networkRules.errors.marker` + `markerLine` |
| `effective_date` | S6 | `admin.networkRules.errors.effective` / `effectivePast` |
| duplicate label | S6 | `admin.networkRules.errors.labelTaken` |
| conduct date before the first published version (field error) | S14 / S16 | `admin.conduct.notice.conductDateBeforeRules` |
| conduct date in the future (field error) | S14 / S16 | `network.report.errors.dateFuture` (reused) |
| `sanction_notice_required` | S15 | `admin.conduct.decideLocked` |
| `sanction_reason_required` | S15 | `admin.conduct.errors.reasonRequired` |
| no-level refused under the 12-month rule (Q-D5) | S15 | `admin.conduct.errors.noSanctionNotAllowed` |
| `decision_rules_not_in_notice` | S15 | `admin.conduct.decision.rulesFromNotice` |
| `immediate_hold_ground_invalid` | S16 | `admin.conduct.errors.groundInvalid` |
| `org_already_restricted` | S16 | `admin.conduct.errors.alreadyRestricted` |
| `review_not_allowed` | S17 | `admin.conduct.review.selfBlocked` / `selfBlockedHold` |
| `review_cannot_increase` | S17 | `admin.conduct.errors.cannotIncrease` |
| termination lift by the decider | S19 | `admin.orgDetail.errors.liftNotAllowed` |
| `not_stale` / `not_terminated` | S27 | `admin.orgDetail.errors.notStale` / `notTerminated` |
| any text length | all network textareas | `network.validation.length` |
| version conflict, network error | anywhere | existing generic errors |

### 5.17 Items for counsel and the founder

**⚖️ Legal drafts (ship as drafts until counsel signs off):**
- C-1: `network.accept.member`, `network.accept.org` (two separate statements; "authority" wording), `network.accept.summaryTitle` (the summary must not read as changing the rules).
- C-3 / C-5: the notice template (`network.notice.*`), especially the fixed **`possibleOutcomes`** line (is it enough to escalate on the same notice? should "We'll decide only on the facts and rules in this notice" be added?), the heading "rules 8.3 and 9.3", the decision template (`network.decision.*`), review outcome lines (`network.case.review.*`), French-first or bilingual notices for Québec orgs.
- C-4: the incident notice (`network.incident.title`, `intro`, the two fixed guidance lines **`guidance`** (sourcing side) and **`guidanceHiring`** (hiring side)). Should fr use « incident de confidentialité » (the Law 25 term)? Does saying "Workatent found" create duties for Workatent? For `guidanceHiring`: is "you may want to tell them" (the client) the right level, or should the line point hiring orgs to their own duties, and to whom (client, client's staff, CAI; RD-045)?
- C-7: `network.partner.noLongerMember` (en wording chosen by the founder, PD-065).
- `network.report.attest` (good-faith attestation, rule 8.5) and the B6 bodies (`network.banner.settlement.*.body`, rule 9.5).

**Still open (not counsel):**
1. **Backend:** two **proposed** admin notification kinds, `conduct_report.reply_received` and `conduct.followup_answered` (§5.15). Their keys are written and counted; if `backend.md` doesn't add the kinds, drop the four `network.notifications.*` keys and the key count goes down by 4.
2. **Founder and counsel, with P0-1 (optional, PD-058):** rule 9.6 could say "a sanction or a breach finding", to match the review of no-sanction findings (Q-D12). It's a change to the rules text, not to this copy; no key depends on it.

Resolved on 2026-11-16 and removed from this list: the "no longer part of" wording (PD-065); the corrected identity promise in the report form (accepted by the lead, §2.8 "Honest identity note"); the hiring-side incident guidance (lead decision (b), now `network.incident.guidanceHiring`, §5.9); org audit labels and recruiter managers (sanction-related events limited to `org_admin`s, §2.15, AC-149).

**Key count:** 826 keys per locale (en, fr, pt identical trees): §5.1 44 · §5.2 18 · §5.3 29 · §5.4 24 · §5.5 77 · §5.6 54 · §5.7 54 · §5.8 78 · §5.9 15 · §5.10 21 · §5.11 68 · §5.12 218 · §5.13 67 · §5.14 20 · §5.15 39 (plural branches count as separate keys). Added on 2026-11-16: `network.incident.guidanceHiring` (§5.9); `admin.conduct.notice.conductDateBeforeRules` and `admin.conduct.incident.variantSourcing` / `variantHiring` / `variantRecipients` (§5.12).

---

## 6. Accessibility

WCAG 2.2 AA (brief §7; above the template's 2.1 AA).

- **Acceptance (S1):**
  - Keyboard path: language switch → **Skip to acceptance** → TOC → rules text → statements → Accept → leave line.
  - The skip link is the first focusable element after the header.
  - Checkboxes are native `Checkbox` with a visible `<label>`, **never pre-ticked**.
  - The disabled Accept button has `aria-describedby` → status line (`aria-live="polite"`).
  - A language change moves focus to the rules heading and announces "Rules shown in {language}" plus the untick message.
  - The rules text sits in `<article lang="fr-CA|en|pt-BR">` with real headings (`h2` per section). Rule numbers stay inline text.
  - Readable at 375px (no horizontal scroll, `text-pretty`, line length ≤ 75ch on desktop).
  - Focus on the gate lands on the `h1` at load.
- **Banners (S3):** `role="status"` (not `alert`; they're persistent), an icon plus text, and actions as real links or buttons. They're never colour-only: each has an icon and a title. They're announced once on load, not on every navigation.
- **Report dialog (S8):**
  - Focus trap. Initial focus on the dialog title, then the first radio.
  - The category `RadioGroup` has a `legend`, and each description is linked with `aria-describedby`.
  - The counter announces at 3,800+ characters.
  - The upload list is `aria-live="polite"` (N1).
  - Errors: an error summary at the top with links to the fields. Focus moves to the first invalid field.
  - The sent state moves focus to its heading.
  - Esc with content opens the discard confirm.
- **Deadlines:** always "{when} ET · N business days left" as text (`BusinessDeadline`). The overdue state uses text ("Overdue by N business days"), not colour only.
- **Admin forms (S14–S17):**
  - Every field labelled. The multi `Combobox` announces selected rules ("3 rules selected").
  - Sanction radios have descriptions.
  - Disabled options carry their reason as hint text linked with `aria-describedby`.
  - Confirm dialogs restate the effect in text.
- **Status changes** (response sent, review requested, decision recorded): a toast plus the page region updating with `aria-live="polite"`.
- **PD-058 additions:**
  - Reports tabs (S9, org_admin): Radix `Tabs` (arrow keys between tabs, `Tab` into the panel); the active tab is in the URL so Back works; each tab ≥ 44px tall at 375px.
  - Notice composer (S14): the conduct date, version select and rule picker are labelled fields in that order; the acceptance line under the version select is linked with `aria-describedby` and announced politely when it changes.
  - Settlement referral-closed state (S22-d): after the toast, focus moves to the state's heading.
  - Lift termination (S19): for the deciding admin the button is absent (not disabled), and the `liftTerminationSelf` line is plain text in the header actions area, so screen readers reach it in the same place.
- **Touch targets** ≥ 44px:
  - language switch items, banner actions, checkbox rows (whole label row clickable), report button (icon-only `size-11` below 640px), radio rows, settlement-home links.
- **Contrast:** status pills and banners use the existing `*-soft` tokens with the strong text colour, already AA in light and dark. The "Settlement mode" pill uses the neutral tone (`bg-muted text-muted-foreground`), checked at ≥ 4.5:1 for 11–12px text. If it fails in dark mode, the frontend uses `text-foreground`.
- **Reduced motion:** no new animation beyond existing dialog transitions.

---

## 7. Acceptance criteria

Tags: **[BR-x]** brief rule (rev. 2), **[R x.y]** Network Rules promise (brief §8), **[QA n]** brief §11 scenario, **[RD-04x]** strategist decision, **[N10-Dn]** PM decision, **(Should)** not blocking acceptance. Settlement ACs are for full option (a) (decided, PD-058). Where an AC names a copy key, the test checks the key's rendered value in the current locale, not a hard-coded English string.

### A. Rules versions and the versions page

- **AC-1** Given a platform admin on `/admin/network-rules/new`, When they publish with any of en / fr-CA / pt-BR text missing, Then the publish is refused with `missing_locale`, the locale tab shows the error, and no version is created. [BR-2 a] [QA 1]
- **AC-2** Given a text containing `<!--`, `[TODO`, `[placeholder` or `⚖️`, When the admin publishes, Then it is refused with `marker_found` listing the locale and line, and the client-side marker list showed the same markers before submit. [BR-2 b] [QA 1]
- **AC-3** Given type `material` and an effective date earlier than publication + 30 calendar days, When published, Then it is refused with `effective_date` and the message shows the earliest allowed date. With a date ≥ 30 days, it publishes with `effective_at` at 00:00 ET on that date. [BR-3] [R 10.2] [QA 1]
- **AC-4** Given type `legally_required` with an effective date sooner than 30 days, When published without a legal reason, Then it is refused. With a reason of 20+ characters, it publishes, and the reason appears in the change summary on `/network-rules`. [BR-3] [QA 1]
- **AC-5** Given type `non_material` (or `initial`), When published, Then it takes effect at publication, no banner or acceptance is required for non-material, and members get `network_rules.published`. [BR-3] [BR-39]
- **AC-6** Given an upcoming version exists, When an admin opens `/admin/network-rules`, Then **New version** is disabled with the hint, and a direct publish of another future-dated version is refused with `upcoming_exists`. [BR-1]
- **AC-7** Given the publish form, When the approval reference is empty, Then publish is refused. When provided, it's stored and shown in the history table. [BR-2]
- **AC-8** Given a published version, When anyone (including a platform admin) tries to update or delete it through the UI or PostgREST, Then there's no UI control and the database refuses. The SHA-256 per locale shown equals the SHA-256 of the stored text. [BR-1] [EC-4] [QA 1]
- **AC-9** Given a non-admin member, When they call the publish RPC directly, Then it is refused. [BR-2] [BR-41]
- **AC-10** Given a signed-in user (member in any org state, including settlement mode, gated user, or user with no org), When they open `/network-rules`, Then they see the current version in full, the upcoming version with its effective date and summary if any, and the history with change summaries. A signed-out visitor is redirected to sign-in. [BR-4] [R 10.1] [QA 7]
- **AC-11** Given `/network-rules/{label}` for a published version, Then that version's text and summary render. For a draft or unknown label, not found. [BR-4]
- **AC-12** Given `/network-rules?org={slug}` for an org whose `quebec` is true, When the page opens without `?lang`, Then the rules text is in French (fr-CA), Français is first in the switch, and the article has `lang="fr-CA"`. Choosing English shows the English text without changing the UI locale. [BR-10] [R 10.6]
- **AC-13** Given the workspace sidebar in any org state, Then a **Network Rules** footer link to `/network-rules?org={slug}` is present for every role. [BR-4]

### B. Acceptance

- **AC-14** Given a user on `/onboarding`, When they reach the Network Rules step, Then the current version renders with two unticked checkboxes (personal, on behalf of the org), and **Continue** is disabled with a status line until both are ticked. [BR-5] [BR-6]
- **AC-15** Given both statements ticked, When **Create workspace** succeeds, Then the org exists with one org acceptance and one member acceptance of that version, each storing the user, the org, the locale shown and the SHA-256 that equals the published hash for that locale, and audit events `network_rules.org_accepted` and `network_rules.member_accepted`. [BR-5] [BR-6] [QA 2]
- **AC-16** Given a direct call to the org-creation action or RPC without acceptance arguments (or with an unknown, draft or stale version id), When called, Then the org isn't created and the error is `rules_acceptance_required` (or `rules_version_changed`). [BR-6] [QA 2]
- **AC-17** Given the user ticked both statements, When they switch the language, Then both boxes are unticked and the change is announced. [BR-10] [§6]
- **AC-18** Given a member with no member acceptance of any version, When they open any `/workspace/[orgSlug]/…` route, Then the gate renders instead of the navigation and page. Only the org switcher, sign out and the version-history link are available. [BR-7] [QA 3]
- **AC-19** Given a gated member, When any workspace Server Action or writing member RPC is called directly, Then it returns `rules_acceptance_required` and nothing is written. [BR-7] [QA 3]
- **AC-20** Given a gated `recruiter` or `recruiter_manager`, Then only the personal statement shows. Given a gated `org_admin` whose org already accepted, Then only the personal statement plus "{org} accepted these rules on {date}." show. Given a gated `org_admin` whose org hasn't accepted the current version, Then both statements show and both are required. (Settlement mode: AC-144.) [BR-5] [BR-7] [N10-D18]
- **AC-21** Given a gated member who accepts, When the action succeeds, Then the page they requested renders without navigating away, a toast confirms, and a member acceptance exists with the locale shown and its SHA-256. [BR-5] [BR-7] [QA 3]
- **AC-22** Given a user who accepted in org A, When they open org B (another membership), Then no gate shows (member acceptance is per user × version). [BR-5] [N10-D2]
- **AC-23** Given a platform admin who has never accepted, When they use `/admin`, Then no gate or acceptance is required. [BR-11]
- **AC-24** Given a support address is configured, Then the gate shows the "Contact {support} to leave the network" line. With none configured, the line is hidden. [§2.2] [C-6]
- **AC-25** Given a material version V is published with `effective_at` in the future, Then every member who hasn't accepted V sees banner B5 with the effective date and the **Review and accept** and **What changed** links on every workspace page, and nothing is blocked before `effective_at`. [BR-8] [R 10.2] [QA 4]
- **AC-26** Given B5 shows to an `org_admin` whose org hasn't accepted V, Then the banner adds the org-pending line, and on `/workspace/[orgSlug]/accept-rules?v=V` both statements show. After both are accepted, B5 disappears for that admin. [BR-8] [R 10.2]
- **AC-27** Given V is published, Then org acceptance and member acceptance of V are stored as separate records. An org acceptance doesn't create member acceptances for other members, and a member acceptance doesn't create an org acceptance. [BR-5] [R 10.2]
- **AC-28** Given `effective_at` of V has passed and the org has no org acceptance of V, Then `restriction = rules_not_accepted`, banner B3 shows to all members (with **Review and accept** for org_admins, "Ask an org admin to accept." for others), and no sanction, notice or standing-file entry exists. [BR-9 a] [R 10.3] [QA 4]
- **AC-29** Given an org in `rules_not_accepted`, When any `org_admin` accepts V for the org, Then on the next request `restriction` is null, its partner-open jobs are partner-visible again without being reopened, and B3 is gone. [BR-9 a] [BR-12.1] [R 10.3] [QA 4]
- **AC-30** Given V is in effect, the org accepted V, and a member accepted an earlier version but not V, Then that member sees banner B4. Submitting a referral (both paths, internal included) and opening a job to partners return `rules_acceptance_required`. All in-flight referral actions, internal candidates, jobs and pipeline work continue. [BR-9 b] [N10-D3] [R 10.3] [QA 5]
- **AC-31** Given the per-user restricted member opens the composer, Then the submit panel shows "Accept Network Rules {label} to submit referrals." with **Review and accept**, and no submit button. [BR-9 b] [§2.6]
- **AC-32** Given `effective_at` of V passes, Then `network_rules.effective_not_accepted` goes to the org's `org_admin`s (if the org hasn't accepted) and to members who haven't accepted, with no allegation or sanction content. [BR-39]
- **AC-33** Given an org whose locale starts with `fr` (until N5 province), When a member opens the gate or the accept page, Then the rules open in French first. They can switch to English, and if they accept in English the record stores `en`. [BR-10] [R 10.6] [QA 6]
- **AC-34** Given an org in settlement mode, Then banners B3, B4 and B5 aren't shown, and no BR-34 action requires re-acceptance. [BR-9 c]
- **AC-35** Given the seed script, When `npm run db:reset` runs, Then a version is published from the drafts with markers stripped, and demo users and demo orgs have acceptances (no gate for demo logins). [BR-11]
- **AC-36** Given a version becomes current while a user has the acceptance screen open, When they accept the old one, Then the server returns `rules_version_changed`, and the screen reloads the new version with boxes unticked. [§2.1] [§2.3]

### C. Partner-activity restriction (hold and rules not accepted)

- **AC-37** Given an org with `restriction ∈ {network_hold, rules_not_accepted}`, Then its partner-open jobs are absent from every partner's opportunities, and their settings (open to partners, terms) are unchanged in the database. [BR-12.1] [R 9.1] [QA 8]
- **AC-38** Given the restricted org's job detail, Then the owner org's members see the "Hidden from partners" banner with `bodyHold` or `bodyRules`, and the jobs list shows the chip "Network hold" / "Rules not accepted". A member of any other org reading `job_hidden_reason` or `get_jobs_terms_state` gets no such reason. [BR-12.1] [BR-42]
- **AC-39** Given the restricted org saves "Open to partner referrals" on a job, Then the save succeeds, the job stays hidden, and the form shows the restricted helper. [BR-12.2]
- **AC-40** Given the restricted org, When a member submits a referral through either submit path, an internal referral or the API, Then it is refused with `partner_activity_restricted`, and the composer shows the inline alert (not a toast). [BR-12.3] [R 9.1] [QA 9]
- **AC-41** Given a partner submits to a restricted org's job (stale composer or direct call), Then it is refused with exactly the outcome a hidden job already produces, with no reason. [BR-12.4] [N10-D4] [R 9.1] [QA 9]
- **AC-42** Given the restricted org opens `/opportunities` or `/opportunities/[matchId]`, Then the restricted state shows ("Partner opportunities are paused", reason body, CTA for org_admin), and the nav badge is hidden. [BR-12.5]
- **AC-43** Given matches existed for the org's jobs and candidates before the restriction, Then during it they're hidden in both directions. After the lift, they're visible again (or recomputed) within one matching cycle. [BR-12.5] [EC-2] [QA 14]
- **AC-44** Given a referral submitted before the restriction started (one `submitted`, one `awaiting_candidate`), When the candidate confirms during the restriction, Then the referral is delivered. Then the restricted org can review, accept, interview, offer and report the hire, and the partner can withdraw, release, message and object. Placements, invoices, payment evidence, payout confirmation and refunds work for both sides. No access to received shared profiles or documents is frozen. [BR-13] [N10-D4] [R 9.1] [QA 10] [RD-046]
- **AC-45** Given a referral with the restricted org, Then neither side's referral page shows any new banner, status or control change caused by the restriction. [BR-13] [BR-14]
- **AC-46** Given a held org, Then internal work (own candidates, jobs not open to partners, pipeline, team, settings) is unchanged. [BR-13]
- **AC-47** Given banner B2 (hold), Then all members see it. Only `org_admin`s get **View network standing**, and other roles see no link and no details. [BR-38] [BR-32]
- **AC-48** Given a partner opens an old opportunity link for a match against a restricted org's job, Then S21 renders with the job title and only "{Org} isn't taking new referrals right now." plus **Back to opportunities**. (Callers with no referral or live match on that job: AC-137.) [BR-14] [R 9.1] [QA 8]
- **AC-49** Given the restriction reason is hold, rules not accepted, network pending, suspension, or termination while the org is still settling, Then the S21 sentence is byte-identical across reasons in each locale (one key). [BR-14] [N10-D5] [QA 13, as amended by RD-048] [RD-048]
- **AC-50** Given any partner-facing surface (opportunities list, referral detail, matching explanations, notifications, `job_hidden_reason` via another org, API responses), Then none reveals the hold, the restriction reason, warnings, sanctions or cases. [BR-14] [BR-42] [R 9.1] [QA 11]
- **AC-51** Given a hold is lifted, Then on the next request the banner is gone, jobs are partner-visible again without reopening, and `org_admin`s get `sanction.lifted`. [BR-12] [BR-39] [QA 8]

### D. Conduct reports

- **AC-52** Given an active member (any role) on a referral their org is party to, either side, any status, Then **Report a problem** shows in the header. On the opportunity detail of a visible partner job, it shows too. Platform admins don't see it, and it isn't shown on internal referrals, S21 or the restricted state. [BR-15] [R 8.1] [QA 15]
- **AC-53** Given the report dialog is submitted from a referral, Then the case's reported org is the other side, derived server-side. From the opportunity detail, it's the job owner. The client sends only the referral or match id. [BR-15] [R 8.1] [QA 15]
- **AC-54** Given a forged `referralId` or `matchId` of a referral or job the caller's org isn't party to or can't see, When the report RPC is called, Then it returns not-found and no case is created. Given a self-report (reported org = caller org), Then `report_self`. [BR-15] [BR-41] [QA 15]
- **AC-55** Given the report form, Then it requires a category (from the options for that context, AC-126), what happened (20–4,000 characters) and the attestation (unticked by default). The date (+ approximate) and files are optional. Invalid input shows field errors and focus moves to the first one. [BR-16] [BR-17]
- **AC-56** Given the form, Then it shows the "messages first is optional" line, the honest identity note (referral or job variant) mentioning retaliation (7.1), and the files hint saying only admins can open files. [BR-16] [R 8.2] [R-2]
- **AC-57** Given files, Then the N1 pipeline applies: PDF / PNG / JPEG only, ≤ 5 files, ≤ 10 MB each, scan gate, worker SHA-256, Canadian storage. **Send report** is disabled until every file is ready. A rejected file must be removed. [BR-16] [QA 16]
- **AC-58** Given a report is sent, Then a conduct case exists with the reporter's org and user, the reported org and the referral or job reference. Category, text, date and files live only in the closed `app.conduct_*` tables that no member role can select, and no `public.disputes` row is created (N10-D14). The dialog shows the sent state with the first-response target (2 business days, stored at filing, holidays skipped), and the reporter gets `conduct_report.received`. [BR-18] [BR-20] [R 8.1] [QA 19]
- **AC-59** Given the new case, Then it appears in `/admin/disputes` under **Conduct** and **All** with category, parties, filing date and the "First response by" deadline. [BR-18] [BR-20] [R 8.1]
- **AC-60** Given any non-admin (the reporter, the reporter org's members of any role, the reported org), When they select from `public.disputes`, any exposed table or `audit_events`, or call any member RPC, Then no conduct case row or content is returned, with two exceptions only: the reporter-view RPCs of §2.9 (for the reporting user and the reporting org's `org_admin`s, AC-66 / AC-145), and the reporting org's `conduct_report.filed` audit row with the case id only (`org_admin`s, AC-149). `public.disputes` contains no row for any conduct case. [BR-18] [BR-40] [EC-3] [N10-D14] [QA 17] [QA 23]
- **AC-61** Given report or response files, When anyone other than a platform admin requests a signed URL (the reported org, the reporter, or the reporter's colleagues), Then it is refused. A platform admin's download is a 60-second signed URL and is audited. [BR-43] [QA 16]
- **AC-62** Given an open conduct case on a referral, Then the release option, objection and contest eligibility, prior-presentation and placement disputes, `disputes_open_guard`, the one-open-dispute index, the X11 pause and N3 checks behave exactly as if no conduct case existed, for both sides. [BR-19] [EC-3] [N10-D11] [QA 18]
- **AC-63** Given a user has sent 5 reports in a rolling 24 h (or their org has sent 10), When they send another, Then it is refused with the matching rate-limit message and the form keeps its content. [BR-25] [QA 24]
- **AC-64** Given a held org or an org in settlement mode, When a member reports on an in-flight referral, Then the report is accepted. [BR-15] [BR-34.4] [QA 12]
- **AC-65** Given a report was sent, Then the reporting user sees "You reported a problem on {date}. View report" on that referral. Their colleagues and the other side don't. [§2.8] [BR-19]
- **AC-66** Given the reporter on `/reports/[caseId]`, Then they see only their own category, text, date, file names, status and outcome per the §2.9 mapping. A `recruiter` or `recruiter_manager` colleague, a member of any other org, and anyone who is no longer an active member of the reporting org get not found. (Reporting org's `org_admin`s: AC-145.) [BR-18] [BR-23] [RD-045] [N10-D23]
- **AC-67** Given an admin asks the reporter for more information, Then the reporter gets `conduct_report.info_requested`, sees **Your input needed** with the question, and can send one reply (text plus optional files). The reported org sees nothing. [BR-20 b]
- **AC-68** Given an admin closes a case without a finding, Then the reporter sees **Closed without a finding** plus the admin's reason, and gets `conduct_report.closed`. The reported org sees nothing (no notice was sent). [BR-20 c] [QA 19]
- **AC-69** Given an admin sends a notice, Then the reported org's `org_admin`s get `conduct.notice_sent` with no allegation text. The notice on S11 contains the rules cited, what is alleged and when, the admin's evidence summary and the deadline. It never contains the report text, files or the reporting user, and it names the reporting org only when the admin ticked that option. [BR-21] [R 8.3] [R 8.4] [QA 20]
- **AC-70** Given a notice is sent, Then the response deadline is 10 business days after sending (N1 helper), stored and frozen. A later holiday-table change doesn't move it. [BR-21] [EC-6] [QA 20]
- **AC-71** Given an `org_admin` of the reported org before the deadline, When they send a response (20–8,000 characters plus optional files) and confirm, Then it is stored once and shown read-only to all the org's admins. A second response returns `conduct_response_exists`. [BR-22] [QA 21]
- **AC-72** Given the deadline has passed with no response, Then S11 shows the window-closed text, a response returns `conduct_response_closed`, and the admin's decision form becomes enabled. [BR-22] [R 7.2] [QA 21]
- **AC-73** Given an admin follow-up with or without a deadline (≤ 10 business days), Then the org's admins can reply once per follow-up, before the deadline if one is set. [BR-22]
- **AC-74** Given a decision is recorded, Then the reported org's admins see the outcome, the finding, the rules, the 7.4 flag if set, the sanction with its effects and the review deadline, and "decided by a Workatent platform admin" (`network.decision.decidedOn`, no name; AC-148). The reporter sees only one of the four outcome categories ("Action taken" / "No breach found" / "Not enough evidence to act" / "Closed without a finding"), plus the no-change line, with no level, finding text or response. [BR-23] [R 8.4] [QA 22] [RD-045]
- **AC-75** Given a non-org_admin member of the reported org, When they open `/settings/standing` or a case URL, Then not found. They see only the banner for the org's restriction. [BR-32]
- **AC-76** Given a platform admin opens an admin-initiated case (S18) against an org, Then it follows the same notice, response, decision and review steps, the queue shows "Opened by Workatent", and no reporter view exists. [BR-24]
- **AC-77** Given a conduct card whose reporter org has reports closed as "no breach" in the last 12 months, Then the card shows the bad-faith signal line. No automatic action follows. [BR-25] [R 8.5]
- **AC-78** Given a case past its first-response target with no first response, Then the queue shows the overdue state in text, and no automatic action occurs. [BR-20]

### E. Sanctions, immediate hold and review

- **AC-79** Given a conduct case with no notice sent, or with a notice whose deadline hasn't passed and no response, When the decision or sanction RPC is called (UI or direct), Then it is refused with `sanction_notice_required`. In the UI, the decision form is disabled with the "You can decide once…" hint. [BR-27] [R 9.3] [R 9.4] [QA 25]
- **AC-80** Given a notice with a response submitted, or a passed deadline, When the admin records a decision, Then it succeeds, both sides are notified per S24, and the review deadline (10 business days) is stored. [BR-27] [BR-23] [BR-31]
- **AC-81** Given a platform admin applies an immediate hold with ground `2.3` or `4.8`, Then in one transaction the hold is active (`restriction = network_hold`) and a notice with the heading "Immediate network hold under rule 9.4" exists, with a response deadline of 10 business days from that moment. The org's admins get `sanction.immediate_hold` at once. [BR-28] [R 9.4] [QA 26]
- **AC-82** Given a direct call to the immediate-hold RPC with any other ground (`3.4`, empty, forged string), or an attempt at an immediate suspension or termination, Then it is refused (`immediate_hold_ground_invalid`) and nothing is created. The UI offers only the two grounds. [BR-28] [EC-5] [R 9.4] [QA 26]
- **AC-83** Given an immediate hold whose response window ended (response or deadline), When the admin decides, Then the options are lift, keep, change to warning, suspension or termination. Escalation is allowed on the same notice only when that notice carries the possible-outcomes line, and the confirm line about the same facts and rules shows. On a notice without the line, a direct call escalating above the current level is refused. [BR-28] [N10-D8] [RD-049]
- **AC-84** Given the decision form with Suspension or Termination, When "Why isn't a network hold enough?" is empty, Then it is refused (UI and direct call, `sanction_reason_required`). [BR-30] [QA 27]
- **AC-85** Given the decision form, Then the context panel lists the org's active warnings, and its sanctions and no-level breach findings from the last 12 months (overturned ones marked as such). *No sanction* is disabled with the `noneDisabled` hint when any non-overturned one exists (server refusal: AC-146). [BR-30] [N10-D7] [N10-D24]
- **AC-86** Given a warning is decided, Then the standing page shows it as active until decided + 12 months, then as "Expired on {date}". It no longer appears in the decision context or 9.2 counting, and stays visible in history. [BR-26] [QA 29]
- **AC-87** Given a network hold is decided, Then the same effects as AC-37 to AC-51 apply. An optional planned review date shows on the standing page and the admin org page, and nothing lifts automatically. [BR-26]
- **AC-88** Given a suspension or termination is decided, Then `suspended_at` (or `terminated_at`) is set and settlement mode applies (AC-F). [BR-26] [BR-33]
- **AC-89** Given `/admin/organizations/[orgId]`, Then there's no Suspend or Reinstate button. The header shows the standing pill, **Open conduct case**, **Lift…** (when a hold or suspension is active) and **Lift termination…** (when terminated, per AC-142). `set_organization_suspension` doesn't exist for `authenticated`, isn't on the api-surface allow-list, and no UI or service-role path calls it. [BR-29] [N10-D10] [N10-D15] [QA 30] [QA 41]
- **AC-90** Given **Lift…**, When the reason is empty, Then it is refused. With a reason, the sanction ends, `sanction.lifted` is audited and notified, and the standing file shows "Lifted on {date}". [BR-29] [BR-40]
- **AC-91** Given a sanction decision, When an `org_admin` of the sanctioned org requests a review within 10 business days (stored deadline) with a reason, Then it is accepted, and platform admins get `sanction.review_requested`. A second request returns `review_already_requested`. After the deadline, `review_window_closed`. [BR-31] [R 9.6] [QA 28]
- **AC-92** Given a review request, When the deciding admin (or the admin who applied the immediate hold) tries to record the review (UI or direct call), Then the UI shows the self-blocked message with no controls, and the database refuses (`review_not_allowed`). [BR-31] [EC-5] [R 9.6] [QA 28]
- **AC-93** Given a different platform admin reviews, Then they can confirm, reduce (only lower levels or lift are selectable) or overturn, with a required reason. A direct call that increases the level is refused (`review_cannot_increase`). [BR-31] [R 9.6] [QA 28]
- **AC-94** Given a review overturns a sanction, Then its effect is lifted, the entry shows "Overturned on review", and it's excluded from 12-month counting in later decision contexts. [BR-31] [QA 28]
- **AC-95** Given a review is pending, Then the sanction stays in effect. Given no eligible second admin exists, Then the queue and the case show "Needs a second admin". [BR-31]
- **AC-96** Given an `org_admin` on `/settings/standing`, Then they see the current standing with "What this means", open notices with deadlines as "{when} ET · N business days left", history with statuses, and rules acceptance. `rules_not_accepted` appears as an info row, not as a sanction. [BR-32] [BR-9 a]
- **AC-97** Given the admin org page, Then the "Network standing" panel shows the same file (sanctions, open cases, acceptance), alongside the existing details. [BR-32]

### F. Settlement mode (full option a, RD-047)

- **AC-98** Given an org is suspended or terminated with open obligations, Then its active members see it in the org switcher with the "Settlement mode" pill and can open it (no not-found). [BR-33] [R 9.5] [QA 31]
- **AC-99** Given settlement mode, Then banner B6 (suspended or terminated variant) shows on every page, with **View network standing** for org_admin. [BR-38] [R 9.5]
- **AC-100** Given settlement mode, When a member works an in-flight referral (either side), Then they can read it, message, report a hire, object, contest, release, withdraw, resend the candidate request, and move it through interview and offer. Only in-flight and open-obligation referrals (BR-37 definition, a settled placement still in guarantee included) are listed, never closed history. [BR-34.1] [R 9.5] [N10-D31] [N10-D33] [QA 31] [RD-047]
- **AC-101** Given settlement mode, Then the org can record invoices, payment evidence, payout confirmations and refunds, and complete existing guarantee steps on its placements. [BR-34.2] [R 9.5] [QA 31]
- **AC-102** Given settlement mode, Then the org can respond to and contest disputes on those referrals and placements. [BR-34.3] [R 9.5] [QA 31]
- **AC-103** Given settlement mode and an `org_admin`, Then the Network standing page works (read, respond, request a review), and `/network-rules` is reachable. [BR-34.4] [BR-34.5] [QA 31]
- **AC-104** Given settlement mode, Then Team shows the member list and **Deactivate** for `org_admin`s. **Invite** and role changes are hidden and refused server-side. Deactivating the last active `org_admin`, or oneself, is hidden in the UI and refused (`last_admin`). [BR-34.6]
- **AC-105** Given settlement mode, When a member opens a route outside BR-34 (candidates, jobs, opportunities, imports, connectors, settings other than Network standing), Then the settlement-mode page renders (not an error or not-found). Opportunities, Candidates and Jobs are absent from the nav. [BR-35]
- **AC-106** Given settlement mode, When candidate, job, matching, AI, import, export, connector, API-key or invitation actions are called directly (UI action, PostgREST, RPC or API key), Then they're refused (`settlement_mode_unavailable`, or the existing RLS denial), and no candidate, job or matching data is readable beyond in-flight referral snapshots. [BR-35] [BR-36] [QA 32]
- **AC-107** Given an active org (not suspended), Then every existing permission and RLS behaviour is unchanged (regression suite for `is_member` users). [BR-36] [R-4] [QA 32]
- **AC-108** Given a terminated org with one placement in its guarantee period (whether or not it's already settled), Then settlement mode lasts until the guarantee ends and every obligation is closed. After that, its members get not-found and the org leaves their switcher, and the admin org page shows "All settled". Before that, the admin sees the remaining-obligations list. [BR-37] [R 9.5] [QA 33]
- **AC-109** Given a suspension is lifted, Then on the next request members have normal access and B6 is gone. [BR-37]
- **AC-110** Given the partner of a suspended org with an in-flight referral, Then the partner completes it and confirms its payout record with no admin involvement, and the referral page shows no change caused by the suspension. [BR-13] [BR-34] [R 9.5] [QA 34]
- **AC-111** Given settlement mode on the referral page, Then **Open candidate** and links into blocked areas are hidden, and BR-13 actions remain. [BR-35] [§2.10]

### G. Notifications and audit

- **AC-112** Given each event in S24, Then a notification of that distinct `kind` is created for exactly the listed recipients, with PII-free params, and its title and body contain no allegation text, category, reporter, finding or sanction level. [BR-39] [QA 20]
- **AC-113** Given a conduct case runs from filing to review, Then the reporter org's audit contains only `conduct_report.filed` (case id). The reported org's audit starts at `conduct.notice_sent` (or `sanction.immediate_hold`), and none of its events carry the reporter user or org, the report text or the category. Triage events have org null. [BR-40] [QA 23]
- **AC-114** Given publish, acceptances, report filed, triage, notice, response, decision, sanction applied or lifted, immediate hold, review requested or decided, and settlement-mode entry or exit, Then each writes an audit event with PII-free metadata. [BR-40]

### H. Security (cross-cutting)

- **AC-115** Given every new RPC, Then it's `SECURITY DEFINER` with `search_path = ''`, re-checks membership and role (or `app.is_platform_admin()`), takes the org from server context (never from client input), and is on the `api-surface` allow-list. [BR-41]
- **AC-116** Given a member of org C (unrelated), When they call any N10 member RPC with ids from orgs A or B (case, notice, report, referral, job), Then not found with no data. [BR-41] [BR-42]
- **AC-117** Given a restricted org, When it tries a direct PostgREST insert or update that would submit a referral or make a job partner-visible, Then it is refused. [BR-12] [§7 brief]

### I. Accessibility and responsive

- **AC-118** Given the acceptance screen at 375px, Then the text has no horizontal scroll, **Skip to acceptance** works, checkboxes are unticked with ≥ 44px rows, the whole flow works by keyboard alone, and the disabled button's reason is announced. [§6] [brief §7]
- **AC-119** Given banners, deadlines, status pills and sanction states, Then each conveys meaning with text and an icon (never colour alone), deadlines read "{when} ET · N business days left", and contrast is ≥ AA in light and dark. [§6]
- **AC-120** Given the report dialog, Then focus is trapped, errors are summarized and linked, the upload list announces changes, and the sent state receives focus. [§6]

### J. Should (non-blocking)

- **AC-121 (Should)** Given an `org_admin` on Team or Network standing, Then they see which members haven't accepted the current or upcoming version (names only, own org). [Should 1]
- **AC-122 (Should)** Given 7 days before `effective_at`, Then members who haven't accepted get `network_rules.reminder`. [Should 2]
- **AC-123 (Should)** Given a hold with a planned review date that is reached, Then platform admins see a "review by" reminder in the queue. [Should 3]
- **AC-124 (Should)** Given `/admin`, Then a metrics card shows the brief §4 metrics. [Should 4]
- **AC-125 (Should)** Given a Québec reported org, Then the notice composer offers "Bilingual (fr-CA + en)" templates. [Should 5] [C-5]
- **AC-140 (Should)** Given an immediate-hold case with no decision 10 business days after its response window closed, Then the queue shows "Decision overdue" in text and sorts it first, and the hold stays in effect (no automatic lift). [RD-049]

### K. Strategist and backend reconciliation (RD-044 to RD-049, backend §7)

- **AC-126** Given the report dialog, Then the category options are exactly those for the context: 9 for the sourcing side of a referral, 7 for the hiring side (no "didn't report a hire or pay", no "job or terms"), 5 on a partner job. They're in the RD-044 order with "Something else" last. A direct call with any of the 9 values is accepted. [BR-17] [RD-044]
- **AC-127** Given the report dialog on a referral, Then the "use the right tool" block is open by default and shows only lines that apply. The objection link shows only when filing or contesting is currently allowed for that side, and the dispute link only when a placement exists. Selecting a link opens that flow (after the discard confirm if the form has content). [RD-044]
- **AC-128** Given any reporter-facing surface (form, report page, notifications), Then nothing indicates which categories can lead to an immediate hold. Given the admin queue, Then cases in categories 3 or 5 (reporter or admin) carry "Possible 9.4" and sort first. [RD-044] [R-1]
- **AC-129** Given an admin triages a case, Then they must set the admin category (prefilled with the reporter's) before the first response. Both labels show on the card and the case. The reporter never sees the admin category. [RD-044]
- **AC-130** Given a closed report with any of the four outcomes, Then the reporter's page shows "This report doesn't change your referral, your first position or any amount owed." and, for referral reports, a link to the referral. [RD-045]
- **AC-131** Given a review overturns a decision so that the reporter's category changes, Then the reporter's outcome updates and they get `conduct_report.outcome_updated` with no detail. Given a review that only reduces the level, Then nothing changes for the reporter. [RD-045] [BR-31]
- **AC-132** Given a "Breach found" decision citing rule 2.3, Then the admin can send an incident notice to selected affected orgs (not the sanctioned org). Each selected org's `org_admin`s get `conduct.incident_notice` and can read S25 (referrals, what, when, to whom if known, the fixed guidance line for their side: `network.incident.guidance` for a sourcing-side recipient, `network.incident.guidanceHiring` for a hiring-side recipient, both for an org on both sides; the stored notice keeps the line(s) sent). Neither the notice nor the notification names the sanction, the outcome or the reporter. Non-recipient orgs get not found. The action isn't offered on decisions that don't cite 2.3. [RD-045] [BR-42]
- **AC-133** Given any notice (regular, follow-up excluded, or immediate hold), Then the stored notice contains the fixed possible-outcomes line. The composer shows it read-only, and a direct call can't omit or alter it. [RD-049] [BR-21] [BR-28]
- **AC-134** Given the decision form, Then the rules offered are only those cited in the notice used, from that notice's version. A direct call citing another rule, or a rule from another version, is refused (`decision_rules_not_in_notice`). [RD-049] [N10-D21] [QA 36]
- **AC-135** Given a terminated org in settlement mode with an in-flight referral that has had no stage change, message or event for ≥ 60 days, Then the admin org page offers **Close as cancelled…** with a required reason. On confirm, the referral is `cancelled`, both sides see Cancelled with their side's timeline text (the partner's names no termination), and the sourcing side's ownership window is unchanged. Referrals inactive for less than 60 days, and suspended orgs, have no action, and a direct call is refused (`not_stale` / `not_terminated`). The remaining-obligations list uses the BR-37 definition: a placement already settled but still inside its guarantee is listed (`obligation.guarantee`), so closing the last stale referral doesn't end settlement mode while that placement's guarantee runs. [RD-047] [BR-37] [N10-D33] [N10-D34] [QA 40]
- **AC-136** Given a terminated org whose settlement mode has ended, When a former partner opens an old opportunity link or its closed referral with that org, Then they see the `network.partner.noLongerMember` sentence (rendered from the key, whatever its approved en wording) and no cause. While the org was still settling, the neutral sentence applied (AC-49). If the termination is lifted (AC-142), the sentence stops. [RD-048] [PD-057] [BR-14] [QA 13]
- **AC-137** Given a partner org with no referral on, and no live match with, a restricted org's job, When it opens a direct link to that job, Then it gets the generic not-found, not the BR-14 sentence (anti-enumeration). [BR-42] [backend Q9]
- **AC-138** Given a restricted org's job that also has a job-level hidden reason (for example `no_terms`), Then the owner sees the restriction reason (`network_hold` / `rules_not_accepted` / `org_suspended`) first. [BR-12.1] [backend Q8]
- **AC-139** Given conduct cases stored only in `app.conduct_*` (N10-D14), Then the admin queue (S12) lists them through `admin_list_conduct_cases()` merged with today's disputes reads: the **Conduct** and **All** filters and the open-item counts include them, the `/admin` "Open disputes" tile counts them, and placement and prior-presentation cards and counts are unchanged. [BR-18] [N10-D14] [backend §3]

### L. PM decisions of rev. 2 (PD-058, N10-D13 to N10-D38)

- **AC-141** Given a reported org with an active network hold (immediate or decided), a suspension (legacy included) or a termination, When a platform admin opens its case (S13) or S18, Then **Apply immediate hold** isn't rendered. When the immediate-hold RPC is called anyway (stale page or direct call), Then it's refused with `org_already_restricted`, no hold and no notice are created, and S16 shows `admin.conduct.errors.alreadyRestricted` with no confirm button. Given an org restricted only for `rules_not_accepted` (or `network_pending`), Then the action is shown and a valid immediate hold succeeds (AC-81). [BR-28] [N10-D16] [QA 39]
- **AC-142** Given a terminated org (settling or settled) on `/admin/organizations/[orgId]`:
  - When the platform admin who decided the termination opens the page, Then **Lift termination…** isn't rendered and the `liftTerminationSelf` line shows instead; When that admin calls the lift RPC directly, Then it's refused (`errors.liftNotAllowed`) and nothing changes.
  - When another platform admin confirms the dialog with an empty reason, Then it's refused (UI and direct call).
  - When another platform admin confirms with a reason, Then the termination shows "Lifted on {date}" and no longer counts in 12-month contexts; `terminated_at` and `suspended_at` are cleared and settlement mode ends (members of a settled org regain access and see the org in their switcher again); matching is re-queued; partners no longer see `noLongerMember` (AC-136); `sanction.lifted` is audited with the reason in admin-only metadata; and the org's `org_admin`s get `sanction.lifted` with no reason and no admin name. [BR-26] [BR-29] [N10-D29] [QA 41]
- **AC-143** Given a user with no member acceptance of any version, When they make any authenticated write outside the exempt list (a direct PostgREST insert or update on any client-writable table, a storage upload, any writing RPC on the allow-list, any workspace Server Action), Then it's refused with `rules_acceptance_required` and nothing is written. When they call an exempt-list operation (`accept_network_rules`; `create_organization` with acceptance; `accept_invitation`; sign-out; org switch; marking their own notifications read), Then it works. A generated test over the RPC allow-list fails if a new writing RPC skips the gate. [BR-7] [N10-D13] [QA 3] [QA 41]
- **AC-144** Given a member who never accepted any version, in an org in settlement mode (any role, including an `org_admin` whose org hasn't accepted the current version), When they open the workspace, Then the gate shows **only the personal statement** (no org statement, status line `network.accept.needOne`). When they accept, Then a member acceptance is stored, no org acceptance is required or created, and they can then do the BR-34 settlement actions. No re-acceptance banner or requirement applies afterwards (AC-34). [BR-7] [BR-9 c] [N10-D17] [N10-D18] [QA 41]
- **AC-145** Given a report sent by member M of org R:
  - When an active `org_admin` of R opens `/reports?tab=org`, Then the report is listed with "Sent by {M's name}"; When they open it, Then they see the same reporter view as M (AC-66) and no reply form.
  - Given M has left R, Then R's `org_admin`s see "Sent by a former member", M gets not found on the report, and `conduct_report.closed` / `outcome_updated` go to R's `org_admin`s with the `titleOrg` title.
  - Given an `org_admin` of R stops being an admin or leaves, Then they get not found on colleagues' reports.
  - A non-admin member of R sees no **Your organization** tab, and a direct call to the org list RPC returns nothing beyond their own reports. [BR-15] [BR-43] [N10-D23] [QA 41]
- **AC-146** Given a reported org with a non-overturned sanction or breach finding (any level, including "Finding, no sanction") decided in the last 12 months, Then *No sanction* is disabled with `noneDisabled`, and a direct decision call with "breach found" and no level is refused (`no_sanction_not_allowed`, shown as `admin.conduct.errors.noSanctionNotAllowed`) and nothing is recorded. Given the only earlier entries are overturned, older than 12 months, or a legacy pre-N10 suspension, Then *No sanction* is available and accepted. [BR-23] [BR-30] [N10-D7] [N10-D24]
- **AC-147** Given the notice composer on a case whose report has a conduct date D, Then **Date of the conduct** is prefilled with D (filing date if none), **Rules version** defaults to the version in force on D and lists only published versions already in effect, the org's acceptance of the chosen version shows (`orgAcceptedVersion` / `orgNotAcceptedVersion`) without blocking, and the rule picker lists only that version's rules. When sent, Then the notice stores the version, and S11 shows `network.notice.version` with its label under the rules. A direct call with a draft or upcoming version, or a rule number that isn't in the chosen version, is refused and no notice is created. [BR-17] [BR-21] [N10-D21] [QA 36]
- **AC-148** Given any member-facing surface (S11 decision and review, S10 history, notifications, member RPC responses), Then no platform admin's name or id appears: the decision reads `network.decision.decidedOn` ("…by a Workatent platform admin") and the review `network.case.review.reviewedOn` ("…by a different Workatent platform admin"). Admin screens (S13, S17, S19) still show names. [BR-23] [N10-D28]
- **AC-149** Given an org with conduct and sanction activity (`conduct_report.filed`, `conduct.*`, `sanction.*`, `settlement_mode.*`, `conduct.incident_notice_sent`), When a `recruiter_manager` (or `recruiter`) opens `/settings/audit` or selects `audit_events` directly, Then none of those events are returned; `network_rules.*` acceptance events and `referral.closed_stale_by_admin` still are, for the roles that read the audit today. An `org_admin` and platform admins see all of them. [BR-32] [BR-40]
- **AC-150** Given an org with `suspended_at` set before N10 and no sanction record, Then the admin org page shows the `legacySuspended` pill, **Lift…** as the only sanction action (plus **Open conduct case**), no row in the sanctions file, and the remaining-obligations panel with no stale-close action. Members are in settlement mode (AC-98 to AC-111). The legacy suspension isn't listed in decision contexts and doesn't disable *No sanction*. Lifting it with a reason ends settlement mode and notifies the org's admins with `sanction.lifted`. [BR-29] [N10-D30]
- **AC-151** Given settlement mode and a referral whose only remaining scope is the referral itself, When a member's action closes it (for example withdraw or decline), Then the action succeeds, the toast `network.settlement.referralClosed` shows, the page re-renders as the referral-closed state (`referralClosedTitle`, `referralClosedDescription`, **Go to referrals**), reloading that URL shows the same state (not a not-found or the blocked page), and the referral is gone from the Referrals list and the settlement-home counts. Given the closed referral still has an open obligation (a placement in guarantee), Then it stays listed and the page renders normally. [BR-34] [BR-37] [N10-D31]

### Traceability

| BR | ACs |
|---|---|
| BR-1 | 6, 8, 11 |
| BR-2 | 1, 2, 7, 9 |
| BR-3 | 3, 4, 5 |
| BR-4 | 10, 11, 13 |
| BR-5 | 14, 15, 20, 21, 22, 26, 27 |
| BR-6 | 14, 15, 16 |
| BR-7 | 18, 19, 20, 21, 143, 144 |
| BR-8 | 25, 26 |
| BR-9 | 28, 29, 30, 31, 34, 96, 144 |
| BR-10 | 12, 17, 33 |
| BR-11 | 23, 35 |
| BR-12 | 37–43, 51, 117, 138 |
| BR-13 | 44, 45, 46, 110 |
| BR-14 | 45, 48, 49, 50, 136, 137 |
| BR-15 | 52, 53, 54, 64, 145 |
| BR-16 | 55, 56, 57 |
| BR-17 | 55, 126, 147 |
| BR-18 | 58, 59, 60, 66, 139 |
| BR-19 | 62, 65 |
| BR-20 | 58, 67, 68, 78 |
| BR-21 | 69, 70, 133, 147 |
| BR-22 | 71, 72, 73 |
| BR-23 | 66, 74, 80, 130, 131, 146, 148 |
| BR-24 | 76 |
| BR-25 | 63, 77 |
| BR-26 | 86, 87, 88, 142 |
| BR-27 | 79, 80 |
| BR-28 | 81, 82, 83, 133, 140, 141 |
| BR-29 | 89, 90, 142, 150 |
| BR-30 | 84, 85, 146 |
| BR-31 | 91–95, 131 |
| BR-32 | 47, 75, 96, 97, 149 |
| BR-33 | 88, 98 |
| BR-34 | 100–104, 110, 151 |
| BR-35 | 105, 106, 111 |
| BR-36 | 106, 107 |
| BR-37 | 100, 108, 109, 135, 151 |
| BR-38 | 47, 99 |
| BR-39 | 5, 32, 51, 112 |
| BR-40 | 60, 113, 114, 149 |
| BR-41 | 9, 54, 115, 116 |
| BR-42 | 38, 50, 116, 132, 137 |
| BR-43 | 61, 145 |
| BR-44 | (no UI; backend/PIA) |

| Strategist decision | ACs |
|---|---|
| RD-044 | 126, 127, 128, 129 |
| RD-045 | 66, 74, 130, 131, 132 |
| RD-046 | 44 |
| RD-047 | 100, 135 |
| RD-048 (approved, PD-057) | 49, 136 |
| RD-049 | 83, 133, 134, 140 (Should) |

| PM decision (PD-058) | ACs |
|---|---|
| N10-D13 full DB gate, exempt list | 19, 143 |
| N10-D14 `app.conduct_*` only | 58, 60, 139 |
| N10-D15 drop `set_organization_suspension` | 89 |
| N10-D16 immediate hold refused on restricted org | 141 |
| N10-D17 / D18 gate in settlement mode, both statements elsewhere | 20, 144 |
| N10-D20 per-user "open to partners" transition | 30 |
| N10-D21 notice version | 134, 147 |
| N10-D23 reporting-org admins read reports | 66, 145 |
| N10-D24 no level refused under the 12-month rule | 85, 146 |
| N10-D26 incident notice to org admins | 132 |
| N10-D28 no admin named to the org | 74, 148 |
| N10-D29 termination lift | 142 |
| N10-D30 legacy suspensions | 150 |
| N10-D31 / D33 settlement scope, open obligation | 100, 108, 135, 151 |
| Lead decision (BR-32): sanction audit events | 149 |

| Rule (brief §8) | ACs |
|---|---|
| 8.1 | 52, 53, 58, 59 |
| 9.1 (level 2) | 37, 40, 41, 44, 48, 50 |
| 9.4 | 79, 81, 82 |
| 9.5 | 98–103, 108, 110 |
| 9.6 | 91, 92, 93 |
| 10.1 | 10 |
| 10.2 | 3, 25, 26, 27 |
| 10.3 | 28, 29, 30 |
| 10.6 | 12, 33 |

QA scenarios 1–34: each is cited in the ACs above as [QA n]. QA 1 → AC-1–4 and 8; QA 2 → 15, 16; QA 3 → 18, 19, 21; QA 4 → 25, 28, 29; QA 5 → 30; QA 6 → 33; QA 7 → 10; QA 8 → 37, 48, 51; QA 9 → 40, 41; QA 10 → 44; QA 11 → 50; QA 12 → 64; QA 13 → 49; QA 14 → 43; QA 15 → 52–54; QA 16 → 57, 61; QA 17 → 60; QA 18 → 62; QA 19 → 58, 68; QA 20 → 69, 70, 112; QA 21 → 71, 72; QA 22 → 74; QA 23 → 60, 113; QA 24 → 63; QA 25 → 79; QA 26 → 81, 82; QA 27 → 84; QA 28 → 91–94; QA 29 → 86; QA 30 → 89; QA 31 → 98, 100–103; QA 32 → 106, 107; QA 33 → 108; QA 34 → 110.

QA scenarios 35–41 (brief rev. 2): QA 35 → 126, 128, 129; QA 36 → 133, 134, 147; QA 37 → 74, 130, 131; QA 38 → 132; QA 39 → 141; QA 40 → 108, 135; QA 41 → 19, 143 (gate writes and exempt list), 144 (accept in settlement mode, then settle), 145 (reporting-org admin reads; former member can't), 142 (termination lift), 89 (`set_organization_suspension` gone).

---

## 8. Out of scope

From the brief's Won't list, plus design-level exclusions:
- paid peer review, automatic sanctions or escalation, automatic hold lift;
- watermarking; org blocking (X8);
- any fee, fine or compensation (PD-053.1);
- self-serve "leave the network" (only the support line, §2.2);
- a general "Report a problem" with no referral or job context (support address, 8.1 interim text);
- freezing a held org's access to shared profiles on in-flight referrals (RD-046). The "pause received shared profiles" effect on a 2.3 finding is a follow-up with X11, after N3. Pausing deliveries during a 2.3 hold waits on counsel C-4;
- automatic closing of stale referrals (RD-047: admin action only);
- a public logged-out rules page (U-N10-1);
- IP or user agent on acceptances (C-1);
- the reapplication flow after termination (N5 reads `terminated_at`);
- localized in-app notification rendering (the PD-026 follow-up in N7), and emails (N7, N8);
- an emergency lock outside the ladder (U-N10-3), including a service-role suspend tool (N10-D15);
- stacking an immediate hold on an org already held, suspended or terminated (N10-D16);
- a reply by the reporting org's `org_admin`s to an info request on a colleague's report (N10-D23 grants reading only);
- closed referral or placement history in settlement mode (N10-D31; book-keeping records via support);
- "Report a problem" on internal referrals between related orgs (Q-D7);
- a downloadable or printable PDF of the rules (follow-up if requested);
- a scroll-to-bottom requirement before accepting (C-1 may ask for it; the build doesn't force it);
- reporters downloading their own submitted files after sending (Q-D8).

---

## 9. Open questions

**Status:** every product question in this spec is **decided (PD-058)**. All copy keys are in §5. What's left is counsel review and the two open items in §5.17 (backend notification kinds; optional rule 9.6 wording), listed at the end of this section. None of it changes a flow, a screen or an AC.

**Strategist:** S-N10-1 to S-N10-6 are answered (RD-044 to RD-049) and built. RD-048 is approved by the founder (PD-057) and its en wording is decided (PD-065).

**Decisions on backend questions** (backend-estimate §7, items 8–11):

| # | Backend question | Designer decision |
|---|---|---|
| 8 | Should the org-restriction reason show before job-level hidden reasons? | **Yes, restriction first** (§2.6 item 2, AC-138). The owner can't fix it on the job, so a terms nudge would send them to the wrong fix. |
| 9 | Show the BR-14 sentence only to orgs with a referral on, or a live match with, that job? | **Yes** (§2.7, AC-137). Others get the generic not-found. It prevents probing an org's standing. |
| 10 | Refuse deactivating the last org admin in settlement mode? | **Yes, and self-deactivation too** (§2.10 item 7, AC-104). Without an admin, nobody can respond to notices, request a review or act as admin on payouts. |
| 11 | How do the two acceptance statements appear at joining? | **Two separate, unticked checkboxes** (personal; on behalf of {org} with authority), **both required** to continue. The onboarding action sends `p_personal = true` and `p_for_org = true` in one call (§2.1, AC-14/15). Counsel C-1 confirms. |

**Engineering dependencies:**
- **S21:** `get_partner_job_availability` returns `available | not_taking_referrals | no_longer_member | not_found` plus the owner org name and the caller's last-seen job title. `no_longer_member` applies to a terminated org whose settlement has ended (RD-048, approved) and stops if the termination is lifted.
- **Rule picker:** uses `network_rules_versions.rule_numbers` (backend §5.1) **of the version chosen in the composer** (N10-D21). The first words per rule are needed for labels, either extracted at publish or derived from the text. The composer also needs "version in force on date D" and the org's acceptance of a given version.
- **Decision rule subset:** the RPC checks `rules ⊂ notice.rules_cited` within `notice.rules_version_id` (AC-134). The possible-outcomes line is stored with the notice, with a `has_outcomes_line` flag (AC-133, AC-83).
- **Flags and lists:** a `has_eligible_reviewer` flag for S17. Counts for S22-b. The stale-referral list (`last_activity_at`) for S27. The affected-org candidate list for S26, **with each org's side** on the referrals concerned (for the guidance variant). The termination's `decided_by` compared with the viewer, for S19 (a boolean like `can_lift_termination`, never the id to members).
- **Reporter-view RPCs:** own list, org list (`org_admin`), detail; access checked against active membership of the reporting org at call time (AC-145).
- **Audit visibility:** `audit_select` (or the audit read RPC) filters sanction-related actions to `org_admin` (AC-149).
- **New notification kinds:** `conduct_report.outcome_updated` and `conduct.incident_notice`. The backend estimate's ~12 kinds become ~16 (small add to line H). `closed` / `outcome_updated` fall back to the reporting org's `org_admin`s when the reporter has left.
- **Error codes to confirm in `backend.md`:** `no_sanction_not_allowed` (AC-146) and the termination-lift refusal (AC-142) are proposed names; §5.16 maps them by description.
- **Scope:** PD-058 puts the total at about 16.5 d inside 14–18 d; the backend re-estimates at build start.

**For the PM (from the backend estimate, affecting the UI): decided (PD-058).**

| Backend question | Decision | Where in this spec |
|---|---|---|
| Q1 first-access gate in the DB for every write? | **Yes**, closed exempt list (N10-D13) | §2.2, AC-19, AC-143 |
| Q2 / BR-18 storage | **`app.conduct_*` only, no `public.disputes` row** (N10-D14) | §0, §2.12, §4, AC-58, AC-60, AC-139 |
| Q3 settlement scope | **In-flight and open obligations only**, no closed history (N10-D31) | §2.10, AC-100 |
| Q4 settled placement in guarantee | **Is an open obligation** (N10-D33, BR-37) | §2.10, §2.13, AC-108, AC-135 |
| Q5 gate in settlement mode | **Applies**, accepting available, personal statement only (N10-D17, D18) | §2.2, §2.10, AC-144 |
| Q6 `set_organization_suspension` | **Dropped** (N10-D15) | §2.13 item 5, AC-89 |
| Q7 immediate hold on a restricted org | **Refused** (`org_already_restricted`); allowed on `rules_not_accepted` (N10-D16) | §2.12, S16, AC-141 |

**For the PM (product rules): all decided (PD-058).** The last column is the decision the build implements; Q-D6 and Q-D14 changed from the earlier spec defaults.

| # | Question | Decision (PD-058) |
|---|---|---|
| Q-D1 | Must an `org_admin` whose org hasn't accepted tick **both** statements at the gate? | **Decided (PD-058, N10-D18):** yes, two separate unticked checkboxes, both required. In settlement mode, the personal one only. Counsel C-1 confirms. §2.2, AC-20, AC-144. |
| Q-D2 | Which rules version does a notice cite (BR-21 vs BR-17)? | **Decided (PD-058, N10-D21):** the version in force on the conduct date (prefilled), the admin may pick another version in force during the period, the org's acceptance of it is shown (info), one version per notice; the decision cites only that notice's rules. §2.12 item 3, AC-134, AC-147. |
| Q-D3 | Québec detection at onboarding? | **Decided (PD-058, N10-D19):** UI locale `fr` → fr-CA first; the N5 province field later. §2.1. |
| Q-D4 | Per-user restriction on "open jobs to partners"? | **Decided (PD-058, N10-D20):** refuse only the transition to open (or creating an open job), `rules_acceptance_required`; edits to open jobs allowed. §2.6, AC-30. |
| Q-D5 | "No sanction only for a first minor breach": DB or UI? | **Decided (PD-058, N10-D24):** disabled in the UI **and** refused in the DB when the org has a non-overturned sanction or breach finding in 12 months (`no_sanction_not_allowed`); "minor" stays admin judgement. §2.12 item 5, AC-85, AC-146. |
| Q-D6 | Who on the reporting side reads a report; what if the reporter leaves? | **Decided (PD-058, N10-D23), changed from the earlier default:** the reporting user **and the reporting org's `org_admin`s**; access follows active membership of that org; the report stays with the org; outcome notifications fall back to the org's admins. Placement: **tabs on the Reports page** (Sent by you · Your organization), not on Network standing, which is about the org as the reported party. §2.9, S9, AC-66, AC-145. |
| Q-D7 | Report on internal referrals? | **Decided (PD-058, N10-D22):** no (hidden); support covers exceptions. |
| Q-D8 | Reporter downloads own files? | **Decided (PD-058, N10-D35):** no; names and sizes only. |
| Q-D9 | Reporter outcome after an overturn? | **Decided (RD-045):** updates when the category changes, no-detail notification. AC-131. |
| Q-D10 | Pipeline board in settlement mode? | **Decided (PD-058, N10-D32):** hidden. §2.10 item 6. |
| Q-D11 | Reported org sees the 7.4 flag? | **Decided (PD-058, N10-D25):** yes; counsel may adjust the wording (C-3). |
| Q-D12 | Review of a "breach found, no level" finding? | **Decided (PD-058, N10-D27):** yes. |
| Q-D13 | Name the reviewing admin to the org? | **Decided (PD-058, N10-D28):** no, and **not the deciding admin either** ("a Workatent platform admin" / "a different platform admin"). §2.11, AC-148. |
| Q-D14 | Lift a termination outside a review? | **Decided (PD-058, N10-D29), changed from the earlier default:** yes, only to correct an error, by a platform admin other than the decider, reason required, audited. Hidden for the decider and refused on a direct call. §2.13 item 1, S19, AC-142. |
| Q-D15 | Orgs suspended before N10? | **Decided (PD-058, N10-D30):** "Suspended (before N10)" with **Lift…** only; settlement mode applies; no fabricated record. §2.13 item 4, AC-150. |
| Q-D16 | Markdown renderer? | **Decided (PD-058, N10-D36):** frontend's choice; raw HTML off, `https:` / `mailto:` links only, `rel="noopener noreferrer"`, noted in `frontend.md`. |
| Q-D17 | Incident notice recipients? | **Decided (PD-058, N10-D26):** recipient orgs' `org_admin`s only. AC-132. |

**AC-140 stays a Should** (overdue immediate-hold flag, N10-D38).

**Design calls made while applying PD-058** (within the decisions, no new business rule; flag if the PM disagrees):
- Who counts as "the decider" for the termination lift is the sanction's `decided_by` (BR-26 wording). A reviewer who **confirmed** the termination isn't excluded, because the brief excludes only the decider. If the PM wants confirmers excluded too, it's one more check in AC-142.
- Lift termination is offered on settling and settled terminations alike (the brief doesn't limit it; an error found after settlement is the case N10-D29 describes).
- An info request to a reporter who has left gets no reply from the reporting side; org admins don't inherit the reply (PD-058 grants reading only).

**For ux-writer-marketing: done (2026-11-16, copy-only, no flow, screen or AC change).**
1. **`network.incident.guidanceHiring`** ⚖️ **fixed**: added to §5.9 (counsel C-4). Used in §2.11, S25, S26, AC-132.
2. **Guidance variant labels in S26:** `admin.conduct.incident.variantSourcing` / `variantHiring` (tab and line labels) plus `variantRecipients` ("Recipients: {orgs}") for the org list, in §5.12. Used in §2.12 item 9.
3. **Conduct-date field errors in S14:** `admin.conduct.notice.conductDateBeforeRules` (before the first published version) in §5.12; the future date reuses `network.report.errors.dateFuture`. Mapped in §5.16. Used in §2.12 item 3, AC-147.
4. **Optional gate line: dropped.** The gate already shows the only controls that work (org switcher, sign out, version history) and nothing else, so a line naming them repeats what's on screen. On a 375px screen it would push the statements further down a page that is already long. It would also be incomplete (marking notifications read is exempt too) and could read as a promise about what's allowed. `gateIntro` and the leave line already tell the member what to do.
- No other key is missing: the reporting-org list (§5.6), Lift termination (§5.13), `org_already_restricted` (§5.12), the no-level error (§5.12), the settlement "referral closed" state (§5.10), the version selector (§5.12), legacy suspension (§5.13) and the admin-anonymity lines (§5.8) are all in §5.

**For the founder:**
- **RD-048 en wording:** decided (PD-065): "{org} is no longer part of the Workatent network." Counsel C-7 still checks it.
- U-N10-1 to U-N10-5 are answered (PD-056). U-N10-4's summary slot is built but renders only if counsel clears content. P0-1 text approval gates the first real version, not the build.

**For counsel (ship as drafts, don't block the build):** C-1, C-3, C-4 (now including `guidanceHiring`), C-5, C-7 (§5.17).

---

## Change log

| Date | Change | By |
|---|---|---|
| 2026-11-15 | Draft: flows, screens, ACs AC-1 to AC-140, strategist decisions RD-044 to RD-049, backend estimate reconciled. | Product Designer |
| 2026-11-16 | §5 copy finalized (en / fr / pt), including PD-058 strings. | ux-writer-marketing |
| 2026-11-16 | **Frozen.** Applied PD-058 (brief rev. 2, N10-D13 to N10-D38) and the lead's decisions on ux-writer items: storage (`app.conduct_*` only) and settlement scope decided, RD-048 approved (PD-057), fallback (b) removed; first-access gate in the DB with the BR-7 exempt list, `accept_invitation` before the gate, personal-only gate in settlement mode; reporting-org `org_admin`s read their org's reports (Reports page tabs), outcome notifications fall back to them; notice composer conduct date, version selector and acceptance info; "no sanction" refused in the DB under the 12-month rule; immediate hold hidden and refused on restricted orgs; Lift termination (not by the decider); legacy "Suspended (before N10)"; no platform admin named to the org; settlement "referral closed" state; BR-37 obligations (settled placement in guarantee); identity promise as corrected by ux-writer; hiring-side incident guidance variant (key needed); sanction-related audit events limited to `org_admin`; RD-048 sentence referenced by key. New ACs AC-141 to AC-151 (total 151; 6 Should). §9 all decided. | Product Designer |
| 2026-11-16 | **Copy-only, after freeze** (no flow, screen, permission or AC change). Added the keys §9 listed as missing: `network.incident.guidanceHiring` ⚖️ (§5.9), `admin.conduct.notice.conductDateBeforeRules`, `admin.conduct.incident.variantSourcing` / `variantHiring` / `variantRecipients` (§5.12); future conduct date reuses `network.report.errors.dateFuture`; optional gate line dropped (§9). Key references added to §2.11, §2.12, S14, S26, §5.0, §5.16. §5.17 trimmed to open items; resolved PM notes in §5.9 and §5.14 replaced by the decisions. Stale "§5.17 item 1" references now point to PD-065. Key count 821 → 826 per locale. | ux-writer-marketing |
