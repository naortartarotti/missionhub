# Backend estimate (day 1): Network Rules enforcement (N10)

Owner: Backend Engineer · Date: 2026-11-15 · Inputs: `brief.md` rev. 1 (BR-1..BR-44, EC-1..EC-8, team plan step 1), PD-056.
Method: read the brief and the migrations, then checked the **live local catalog** (all 53 migrations applied, last `20261116000400`) with `pg_policies` / `pg_get_functiondef`, because many helpers have been redefined across migrations. Function and policy names below are the current definitions. This is an estimate only: no migration and no application code was written.

## 0. Summary

| Item | Result |
|---|---|
| **EC-1 recommendation** | **Option (a) in full**, built as approach (i): a separate "settling member" helper. Do **not** change `app.is_member`. |
| **EC-1 cost** | **3.75 engineering days**, under the 4-day bar with a thin margin (0.25 d). Trimmed (a) saves only about 0.5 d (§1.6), so it isn't worth the extra product complexity. |
| Why it fits | Every referral, placement, dispute, message, grant and shared-profile policy, and about 20 RPCs, go through **two functions**: `app.user_sees_referral_as_source` and `app.user_sees_referral_as_target`. Changing those two, plus about 12 named spots, opens the whole in-flight graph. Candidate, job, matching, connector and API policies keep `is_member` and stay closed. |
| **EC-2** | One predicate, `app.org_partner_restriction(org)`. `app.job_partner_visible` is split into job-level `app.job_partner_open(j)` AND "no org restriction". Delivery uses `job_partner_open` only. Matches are **hidden at read time, never expired**, and they come back as soon as the restriction lifts. The suspension path stops expiring matches and queues a re-match on lift. |
| **EC-3** | Recommend conduct cases live **entirely in `app.conduct_*` tables, with no `public.disputes` row** (needs PM sign-off; it changes the wording of BR-18). That meets BR-19 by construction. Keeping the brief's `public.disputes kind='conduct'` row means patching **12 existing "open dispute" sites** and adding a permanent risk for N3 (§3). |
| **EC-8** | **Yes**, new service-role uses: worker scan and hash of conduct files, 60 s admin signed URLs, deleting our own just-uploaded or orphaned objects. All follow the N1 pattern. `docs/architecture.md` must list them. |
| **Total N10 backend** | **About 15.25 engineering days** (range 14–18), broken down in §6. Option (b) would save about 3.25 d. |

---

## 1. EC-1: settlement mode

### 1.1 How access works today (verified)

- `app.is_member(org)`, `app.has_role(org, roles)`, `app.user_is_member(user, org)` and `app.user_sees_all(user, org)` all require `organizations.suspended_at is null` (`20261107000100_foundation.sql:118-143`, user variants in `20261115000300_recruiter_record_scope.sql`).
- `getRequestContext()` calls `notFound()` when `suspended_at` is set (`src/server/auth/context.ts:94`). `listMemberships()` filters suspended orgs out (`context.ts:67`).
- `set_organization_suspension` (`20261107001200_platform_admin.sql:4`) expires every match in both directions.
- `organizations.suspended_at` isn't client-writable: column-level UPDATE is granted only on `name, locale, kind, default_currency, country`.
- **The key fact:** the referral graph has a narrow chokepoint.
  - `app.can_see_referral`, `app.sees_referral_as_source/target`, `app.can_see_placement`, `app.can_see_shared_profile`, `app.sees_grant_as_source`, `app.referral_side`, `app.source_referral`, `app.target_referral` and `app.can_read_referral_terms` all resolve to `app.user_sees_referral_as_source(uid, r)` / `app.user_sees_referral_as_target(uid, r)`.
  - Those two call `app.user_is_member` and `app.user_sees_all`. RD-036 record scope (owner of the candidate, or owner of the job) is applied inside them.

### 1.2 Approaches compared

| | (i) Separate settling helper (recommended) | (ii) Change `app.is_member` |
|---|---|---|
| Change | New `app.user_is_settling_member(user, org)` and `app.user_sees_all_settling(user, org)`. They're used only inside the two referral-visibility functions and about 12 named referral, placement and dispute spots. | Drop the `suspended_at` condition from `is_member`, `has_role`, `user_is_member` and `user_sees_all`. Then add `and not app.org_in_settlement(org)` to every policy and RPC that must stay closed. |
| Default | **Deny.** Anything not explicitly switched over stays closed to a suspended org, exactly as today. | **Allow.** Every policy or RPC that is missed or added later leaks candidates, jobs, connectors or API keys to a suspended org. |
| Surface to edit | 4 policies redefined, about 10 functions redefined, 3 new helpers (§1.3). | About 35 policies across 20 tables, 3 storage policies, and about 15 RPCs with inline `is_member` / `has_role` checks (`get_opportunities`, `assert_referable`, `can_manage_job`, `create_invitation`, `connection_set_secret`, `anonymize_candidate`, `transfer_member_portfolio`, …). |
| Regression risk | Medium and contained: the hot helper is changed by adding an **OR branch**. The existing integration suites cover the normal branch. | High: R-4 in its worst form. One missed `and not settlement` is a cross-surface data exposure. |
| Estimate | **3.75 d** | About 6–7 d, and harder to prove correct. |

**Decision: (i).**

### 1.3 Design of (i)

New helpers in `app` (SECURITY DEFINER, `search_path = ''`, revoked from `public, anon`, granted to `authenticated` only where RLS evaluates them):

- `app.org_settlement_state(org) returns text`:
  - `null`: the org is active;
  - `'settlement'`: `suspended_at` is set, or `terminated_at` is set and open obligations remain;
  - `'closed'`: terminated and settled (BR-37).
- `app.org_has_open_obligations(org) returns boolean` (BR-37). It is true when any of these exists:
  - a referral of the org (either side) in a non-terminal status;
  - a placement in `hire_reported`, `invoiced`, `payment_partially_verified`, `commission_payable` or `disputed`;
  - a placement with `guarantee_until >= current_date`;
  - an open dispute on either.
  The same function feeds the admin "remaining obligations" list.
- `app.referral_in_settlement_scope(r uuid) returns boolean` (BR-34 "in progress or with open obligations"). It is true for:
  - a non-terminal referral;
  - an open claim or dispute;
  - a placement with an open obligation as above.
  Closed history stays hidden in settlement mode (BR-36).
- `app.user_is_settling_member(user, org)`: an active membership in an org whose `org_settlement_state = 'settlement'`. `app.user_sees_all_settling(user, org)` is the same with role in (`org_admin`, `recruiter_manager`).

Redefinitions. Each one keeps today's branch unchanged and adds `OR (settling-branch AND app.referral_in_settlement_scope(r.id))`:

| Object | Change |
|---|---|
| `app.user_sees_referral_as_source` | Add the settling branch, with the same RD-036 owner-of-candidate test. |
| `app.user_sees_referral_as_target` | Add the settling branch, with the same owner-of-job test and the `hidden_from_target` filter. |
| `app.acting_side` | It calls `app.is_member(p_acting_org)` first, so `transition_referral` with an acting org (and through it `review_referral`) would refuse. Accept a settling membership. |
| `app.notify_eligible` | It uses `user_sees_all`, so the suspended org's admins and managers would miss referral-scoped notifications. Use the settling variant. |
| `app.is_partner_org` | It uses `is_member`. Settling members need the counterpart org's name on referral and placement embeds (`getReferralDetail`, `getPlacement` embed `organizations`). |
| `app.can_upload_claim_evidence` (storage `claim_evidence_insert`) | It uses `is_member(v_org)`, so N1 objection files would be refused in settlement. Accept a settling membership. |
| `public.get_sent_referral_jobs` | Inline `is_member(p_org)` → member or settling. |
| `public.record_candidate_request_delivery` | Inline `is_member(organization_id)` → member or settling (candidate-request resend, BR-13). |
| `public.issue_candidate_request_token` | Inline `o.suspended_at is null` → active or settlement. |
| `public.respond_candidate_request` | Delivery uses `job_partner_visible`, and the legacy branch checks `suspended_at`. Switch to `job_partner_open` (shared with EC-2). Without this, `awaiting_candidate` referrals of a held **or** suspended target can't be delivered, which breaks BR-13. |
| `public.api_key_authenticate` | Already refuses suspended orgs. Make sure `terminated_at` also implies refusal: termination sets `suspended_at` too (§5.3), so no change is needed if that invariant holds. Add a test. |

Policies redefined (DDL):

| Policy | Change |
|---|---|
| `organizations_select` | `is_member(id) OR app.is_settling_member(id) OR is_platform_admin()`. The settling member reads its own org row, for the switcher and the banner. |
| `memberships_select` | Add `OR app.is_settling_member(organization_id)` (team list read, BR-34.6). |
| `job_terms_versions_select` | Target side: `is_member(organization_id)` → also allow a settling member for versions referenced by in-scope referrals. Reuse `can_read_referral_terms` and extend it to the target side. Needed for the placement detail embed `terms:job_terms_versions` and for the hire dialog. |
| `jobs_select` | Add a **read-only** path: a settling member reads its own jobs that carry an in-scope referral. `receivedJobs` and the received queue read `public.jobs`. `jobs_insert` and `jobs_update` are unchanged. *Alternative (0.25 d cheaper):* rewrite those two queries on `referrals.job_title_snapshot` and leave `jobs_select` alone. |
| `disputes_select` | The `prior_presentation` branch uses `is_member(opened_by_org)` → member or settling. The `placement` branch already goes through `can_see_placement`. |
| `memberships_update` | Unchanged (`has_role`, so closed). BR-34.6 "deactivate a member" goes through a new small RPC `deactivate_member_in_settlement(p_org, p_membership)` (org_admin, settling, status `active` → `suspended` only, never self, audited). That keeps role changes impossible. |

Opened implicitly through the two helpers, with no DDL. Each needs a positive and a negative test:
- `referrals_select`, `referral_status_events_select`, `referral_messages_select` / `_insert`, `referral_grants_select`, `referral_profiles_select`;
- `agreements_select`, `placements_select`, `placement_events_select`, `invoices_select`, `evidence_select`, `ledger_select`, `disputes_select` (placement kind);
- RPCs: `transition_referral`, `review_referral`, `decline_referrals`, `withdraw_referral`, `release_referral`, `confirm_agreement`, `report_hire`, `record_invoice`, `record_payment_evidence`, `review_payment_evidence`, `open_dispute`, `file_prior_presentation_claim`, `contest_prior_presentation_claim`, `register_claim_evidence`, `list_claim_evidence_files`, `remove_claim_evidence`, `list_claim_evidence_referrals`, `authorize_claim_evidence`, `authorize_referral_document`, `get_referral_presentation`, `get_referral_terms_context`, `rotate_candidate_request_token`.

**Stay closed to a suspended org, unchanged.** These form the regression matrix (BR-35, BR-36, QA scenario 32):
- candidate tables: `candidates_*`, `candidate_documents_*`, `candidate_consents_*`, `candidate_experiences_all`, `external_refs_select`, `referral_candidate_links_select`, `referral_candidate_requests_select`, `referral_doc_sources_select`;
- jobs, connectors and API keys: `jobs_insert` / `_update`, `connections_*`, `sync_runs_select`, `api_keys_*`;
- org administration: `invitations_*`, `organizations_update`, `memberships_update`, `privacy_requests_rw`, `audit_select`;
- matching: `match_feedback_rw`;
- storage: `candidate_docs_*`, `candidate_photos_*`;
- RPCs: `get_opportunities`, `get_job_match_summary`, `mark_matches_seen`, `set_match_triage` / `assert_own_match`, `submit_referral*` / `assert_referable`, `save_job_terms` / `can_manage_job`, `create_invitation`, `connection_set_secret`, `request_connection_sync`, `anonymize_candidate`, `transfer_member_portfolio`, `audit_document_access`, `api_key_authenticate`.

> *Check during the build:* if the source-side referral page needs `referral_candidate_requests` (resend state) or the candidate name from `referral_candidate_links`, expose it through a scoped RPC. Opening those policies is the alternative, and I wouldn't take it. The page already has `referrals.candidate_label`.

### 1.4 Request context and routes

- `RequestContext` gains:
  - `mode: 'normal' | 'settlement'`;
  - `restriction: null | 'terminated' | 'suspended' | 'network_hold' | 'rules_not_accepted' | 'network_pending'` (own org only, EC-7);
  - `rules: { accepted: boolean; currentVersionId; upcoming?: { id; effectiveAt; acceptedByMe; acceptedByOrg } }`.
  It's read in one RPC call, `get_my_org_state(p_org)` (membership-checked), so the client never derives it.
- `getRequestContext(slug, opts?: { allowSettlement?: boolean })`:
  - `closed` org: `notFound()` (as today);
  - `settlement` org, without the opt-in: `notFound()` from pages, and `msg("errors.settlement_mode")` from actions (thrown as an `AuthorizationError` subtype that `guard()` maps).
  This makes the routes **default-deny**. Only BR-34 call sites opt in: about 20 referral and commission actions, about 6 queries and pages, the new standing and conduct actions, and team read plus deactivate.
- `listMemberships()` drops the `suspended_at is null` filter, uses `org_settlement_state`, excludes `closed`, and returns `settlement: boolean` for the switcher marker.
- Frontend owns the settlement shell and the "not available in settlement mode" page. Backend owns the opt-in list, which is documented in `backend.md`.

### 1.5 Estimate for (a), full

| Work | Days |
|---|---|
| Helpers (`org_settlement_state`, `org_has_open_obligations`, `referral_in_settlement_scope`, settling member / sees-all), `terminated_at` column | 0.5 |
| Redefine the 2 referral helpers, `acting_side`, `notify_eligible`, `is_partner_org`, `can_upload_claim_evidence`, 3 RPC inline checks, delivery switch; 5 policies; `deactivate_member_in_settlement` | 1.0 |
| `getRequestContext` / `listMemberships` / `get_my_org_state`, the opt-in parameter, wiring the BR-34 actions and queries, error key | 0.75 |
| Integration tests: settlement isolation matrix (each closed policy and RPC above → empty or refused); each BR-34 action works; RD-036 record scope in settlement; partner completes the referral and confirms payout (scenario 34); terminated-settled loses access (scenario 33); full existing suite as regression for active orgs | 1.25 |
| `backend.md` section, review and fix buffer | 0.25 |
| **Total** | **3.75 d** (bar ≤ 4 d) |

### 1.6 Trimmed (a) and (b)

- **Trimmed (a)** (hire report, payout, refund, dispute answers, messages only) isn't cheaper here. The helper change opens every BR-13 action at once. Narrowing it would mean **adding** per-transition refusals in `transition_referral` for interview and offer, plus tests. Saving: about 0.5 d (fewer opt-in call sites and tests), partly eaten by the new refusals. Not recommended.
- **(b)** saves about 3.25 d. About 0.5 d stays either way: the match-expiry removal and delivery switch are needed for EC-2. Rule 9.5 would need the user's new approval of rewritten text (U-N10-2).

**Recommendation: (a) in full.**

---

## 2. EC-2: one partner-activity restriction predicate

### 2.1 Where it lives

`app.org_partner_restriction(p_org uuid) returns text`: SECURITY DEFINER, STABLE, revoked from `authenticated` (never callable through PostgREST). Precedence per BR-12:

1. `'terminated'`: `organizations.terminated_at is not null`
2. `'suspended'`: `organizations.suspended_at is not null`
3. `'network_hold'`: an active sanction (`app.org_sanctions` with `level = 'network_hold'`, `lifted_at` null and `overturned_at` null)
4. `'rules_not_accepted'`: a current version exists (`effective_at <= now()`, published) **and** there's no org acceptance of it. This is computed lazily, so the effective date "fires" with no cron.
5. *(N5 slot)* `'network_pending'`: N5 extends this function. It doesn't add a second predicate.

Per user: `app.user_partner_restriction(p_user, p_org)` returns the org reason first, then:
- `'rules_acceptance_required'` when the user has no member acceptance at all (BR-7);
- `'rules_not_accepted_user'` when the user hasn't accepted the current version (BR-9 b).

### 2.2 Composition

- Split `app.job_partner_visible` (`20261116000100_terms_schema.sql:220`):
  - `app.job_partner_open(j)`: today's job-level conditions (active, open, permanent, current terms, currency), **without** the inline suspended check;
  - `app.job_partner_visible(j) := app.job_partner_open(j) and app.org_partner_restriction(j.organization_id) is null`.
  Every existing caller keeps the name: `get_opportunities`, `assert_referable`, `assert_own_match`, `mark_matches_seen`, `get_jobs_terms_state`, `presentation_admin_metrics`.
- `app.job_hidden_reason(j)`: add `'network_hold'` and `'rules_not_accepted'`, and keep `'org_suspended'` for suspended or terminated. It's called only from `get_jobs_terms_state` (owner, `is_member`-checked, `20261116000200_terms_publish_visibility.sql:216`), so it never reaches a partner. *Open question:* should the restriction reason take precedence over job-level reasons? Today `org_suspended` comes after them. I propose restriction first.
- **Submit** (BR-12.3, BR-12.4): `app.assert_referable`, which both `submit_referral` and `submit_referral_for_candidate` call, so internal related-org referrals are included:
  - **Source side, new:** `app.user_partner_restriction(auth.uid(), c.organization_id)` non-null → raise `partner_activity_restricted` (or `rules_acceptance_required`). This is the caller's own information, so no leak.
  - **Target side:** already `job_partner_visible(j)` → the same `job_not_open_for_referrals` as any hidden job (BR-14, BR-42).
  - The API has no submit endpoint (`src/app/api/v1/{candidates,jobs,me}`). Any future one must call these RPCs.
- **Open to partners** (BR-12.2, BR-9 b): `save_job_terms` is the only path that sets `accepts_external_referrals` (`app.guard_job_referral_flag` requires `app.job_terms_rpc`). The org-level restriction doesn't block saving. The per-user check refuses with `partner_activity_restricted` when the caller's user restriction is `rules_*`.
- **Delivery** doesn't use the predicate (BR-13): `respond_candidate_request` uses `job_partner_open`.

### 2.3 Matches: hide, don't expire

- **Read-time hiding** (no writes, so no data loss):
  - `get_opportunities`: add `app.org_partner_restriction(p_org) is null`, so the restricted org sees no opportunities. Jobs of restricted orgs are already hidden through `job_partner_visible`.
  - `get_job_match_summary`: exclude `m.candidate_org_id` with a restriction. When the job's own org is restricted, return zero counts.
  - `assert_own_match` (`set_match_triage`) and `mark_matches_seen`: refuse when the caller's org is restricted.
- **Worker:**
  - A hold or `rules_not_accepted` doesn't change the worker. It keeps computing, so matches are fresh at lift and reappear at once, with the same `match_id` and `match_triage` state.
  - Suspended and terminated orgs are still skipped (`matching-service.ts:101,142`).
- **`set_organization_suspension`** is replaced by the sanction RPC (§5). The new suspension path **doesn't expire matches**. On lift, it calls `app.enqueue('match.job' | 'match.candidate', …)` for the org's open jobs and active candidates, so stale rows refresh within one cycle (scenario 14). Rows expired by past suspensions are re-activated by the upsert (`expired_at: null`, `onConflict candidate_id,job_id`, `matching-service.ts:83`).
- **BR-14 sentence:** a partner-facing RPC `get_partner_job_availability(p_job, p_acting_org)` returns `'available' | 'not_taking_referrals' | 'not_found'`. It answers only when the caller's org has a referral on that job or a live match row for it. Otherwise it returns `not_found`, which stops it from becoming an org-standing oracle. It never returns the reason.

Estimate: **1.25 d** (§6, line D).

---

## 3. EC-3: conduct case storage and isolation

### 3.1 Recommended: no `public.disputes` row

All content and the queue entry live in the non-exposed `app` schema (`supabase/config.toml` exposes `public, graphql_public` only):
- `app.conduct_cases`;
- `app.conduct_case_files`;
- `app.conduct_notices`;
- `app.conduct_responses`;
- `app.conduct_messages`;
- `app.conduct_decisions`.

`/admin/disputes` lists them through `admin_list_conduct_cases()` (platform admin) next to today's `from("disputes")` queries (`src/app/admin/disputes/page.tsx:30-31`).

**Why:** today 12 sites treat any open `public.disputes` row on a referral as blocking or meaningful:

| Site | Effect of a conduct row there |
|---|---|
| index `disputes_one_open_referral` (unique on `referral_id where status='open'`) | Blocks an N1 prior-presentation dispute (BR-19 breach) |
| trigger `app.disputes_open_guard` | `dispute_already_open` for the partner |
| `app.release_allowed` | Hides the release option, which leaks the report |
| `public.contest_prior_presentation_claim` | Refuses a contest |
| `public.get_referral_presentation` (`v_open_dispute`) | Exposes "open dispute" to both sides |
| `app.on_candidate_anonymized`, `public.purge_presentation_data`, `public.rotate_fingerprint_key` | Changes N1 retention and fingerprint behaviour |
| `public.resolve_dispute` / `resolve_prior_presentation_dispute` | Would need explicit kind refusal |
| `public.platform_metrics`, `src/features/admin/queries.ts:11` | Wrong counts |
| `disputes_select`, constraints `disputes_kind_check` / `disputes_target`, `reason` 5..4000 NOT NULL | Must be relaxed for conduct |

With separate tables, none of those change, BR-19 holds **by construction**, and N3 (the next writer of "open dispute" checks) can't regress it. Cost: about 0.5 d **less** than the disputes-row option.

**Needs PM sign-off:** BR-18 says "a `public.disputes` row with `kind = 'conduct'`". The intent (one admin queue, content in closed tables, admin-only) is fully kept.

### 3.2 If the PM keeps the `public.disputes` row

- `kind` check plus a `conduct` branch in `disputes_target`. `referral_id` is nullable for job or admin-initiated cases; a placeholder goes in `reason`.
- `disputes_select`: add `kind <> 'conduct' and (…)`.
- `disputes_one_open_referral`: becomes `where status='open' and kind <> 'conduct'`.
- Add `and d.kind <> 'conduct'` to the 8 functions listed above, plus kind guards in both resolve RPCs.
- A test per site. +0.5 d, and N3 inherits the rule "every open-dispute test excludes conduct".

### 3.3 Isolation rules (either option)

- **Party derivation:**
  - `file_conduct_report(p_acting_org, p_referral | p_job, …)` resolves the reported org from `referrals` through `app.can_see_referral` (either side, settling included), or from `jobs` through `app.job_partner_visible`, or via a referral the caller has on that job.
  - A forged or unrelated id → `not_found`. Self-report → `not_found`.
  - The org always comes from server context.
- **Rate limits** (BR-25): `consume_rate_limit` per user (5/24 h), plus an in-RPC count per org (10/24 h).
- **Files:** the N1 pipeline reused with a new private bucket `conduct-evidence`:
  - path `{case}/{uuid}.{ext}`;
  - storage insert policy `app.can_upload_conduct_evidence(name)`: the uploader's own draft case, file count < 5;
  - `register_conduct_evidence` → worker scan and SHA-256 → `record_conduct_evidence_scan` (service-role only);
  - **no** member read path. Admins read through `authorize_conduct_evidence` (audited), then a 60 s signed URL.
- **Reads:**
  - the reporter: `get_my_conduct_report(p_case)`, its own content, status and outcome category only (BR-23);
  - the reported org's `org_admin`: notices, its response and decisions, only from notice onward, via `get_network_standing(p_org)`. It never returns the reporter's user, org (unless the admin set `name_reporter`), text, files or category.
- **Audit** (BR-40):
  - the reporter org: `conduct_report.filed` with `{case_id}` only;
  - the reported org: events from the notice onward, with no reporter fields;
  - triage: `organization_id = null`, so `audit_select` shows it to platform admins only.

---

## 4. EC-8: service role

New uses, all mirroring N1 (`docs/architecture.md` §Service-role):
1. Worker handler `conduct_evidence.scan`: reads the object, checks the signature, computes SHA-256, calls `record_conduct_evidence_scan`. The handler is generalized from `src/server/queue/handlers/claim-evidence.ts`.
2. `getAdminConductEvidenceUrl`: a 60 s signed URL after `authorize_conduct_evidence` succeeded and audited the access.
3. Removing our own just-uploaded object when `register_conduct_evidence` fails. Deleting orphans returned by a `purge_orphan_conduct_files` maintenance step.

No other new service-role use:
- the matching re-queue on lift is an in-database `app.enqueue`;
- acceptances, sanctions and settlement are all user-session SECURITY DEFINER RPCs;
- rules publishing is an admin user-session RPC.

---

## 5. Schema and RPC sketches

### 5.1 Rules versions and acceptances

```
public.network_rules_versions
  id, label text unique, type enum(initial|material|non_material|legally_required),
  status enum(draft|published), published_at, effective_at, legally_required_reason,
  approval_reference, rule_numbers text[]          -- extracted at publish: ^\*\*(\d+\.\d+)\*\* (en.md format)
public.network_rules_version_texts
  version_id, locale enum(en|fr-CA|pt-BR), body text, change_summary text, sha256 text  -- PK(version_id, locale)
```

- RLS:
  - `select` to `authenticated` where `status='published'` (versions page, BR-4, any org state, N5 applicants);
  - drafts are read only through admin RPCs;
  - no insert, update or delete grants;
  - trigger `app.prevent_mutation` on published rows (EC-4).
- `publish_network_rules_version(p_label, p_type, p_effective_at, p_texts jsonb, p_summaries jsonb, p_reason, p_approval_ref)`:
  - platform admin only;
  - refuses a missing locale, or any of `<!--`, `[TODO`, `[placeholder`, `⚖️` (BR-2);
  - `initial` only if none exists; `material` needs `effective_at >= (published_at::date + 30)` at 00:00 America/Toronto; `legally_required` needs a reason; `non_material` is effective now;
  - at most one upcoming version;
  - computes `sha256` with `extensions.digest`, checks that `rule_numbers` are the same across locales, and audits.
  - Draft save is `save_network_rules_draft`.

```
public.network_rules_org_acceptances    (org_id, version_id, accepted_by, locale, sha256, accepted_at)  unique(org_id, version_id)
public.network_rules_member_acceptances (user_id, version_id, org_context_id, locale, sha256, accepted_at) unique(user_id, version_id)
```

- Select: own member rows; org rows for members of that org. The "who hasn't accepted" Should feature is an org_admin RPC.
- Inserts only through `accept_network_rules(p_org, p_version, p_locale, p_for_org, p_personal)`:
  - `p_for_org` requires `org_admin`, member or settling;
  - stores that locale's `sha256` from the version text, never from the client;
  - idempotent; audited as `network_rules.org_accepted` / `member_accepted`.
- `create_organization` gains `p_rules_version`, `p_locale`. It records both acceptances in the same transaction and refuses without them (BR-6). The old overload is dropped, and the api-surface allow-list is updated.
- First-access gate (BR-7): `app.assert_rules_accepted()` (raises `rules_acceptance_required`), enforced in:
  - (1) `getRequestContext` for actions, with an exempt list: accept, versions, sign out, switch org;
  - (2) every authenticated writing RPC, about 35;
  - (3) the `with check` of client-writable table policies, about 15: candidates, jobs, consents, documents, experiences, connections, api_keys, memberships, organizations, invitations, match_feedback, referral_messages, privacy_requests, and the storage inserts.
  See §7 Q1 for a cheaper residual option.

### 5.2 Conduct and sanction tables (app schema)

```
app.conduct_cases      id, reported_org_id, reporter_org_id?, reporter_user_id?, referral_id?, job_id?, opened_by_admin?,
                       category enum(8), description, occurred_on?, good_faith_at, status enum(filed|info_requested|
                       notice_sent|responded|decided|closed), first_response_due_at (stored, add_business_days(+2)),
                       outcome enum(no_breach|insufficient_evidence|breach)?, closed_reason?, created_at
app.conduct_notices    id, case_id, kind enum(standard|immediate_hold|follow_up), rules_cited text[] (⊂ version.rule_numbers),
                       rules_version_id, allegation, evidence_summary, name_reporter bool, sent_by, sent_at,
                       response_due_at (stored: add_business_days(sent_at, 10); follow_up ≤ 10, optional)
app.conduct_responses  id, notice_id UNIQUE (one response), org_id, author_id, body (20..8000), submitted_at  + files
app.conduct_decisions  id, case_id, notice_id, outcome, finding, residual_test bool, decided_by, decided_at,
                       review_request_due_at (stored, +10 business days)
app.org_sanctions      id, org_id, case_id, decision_id?, notice_id, level enum(warning|network_hold|suspension|termination),
                       immediate_ground enum('2.3','4.8')?, why_not_hold text?, applied_by, applied_at,
                       expires_at? (warning: +12 months), planned_review_on?, lifted_at?, lifted_by?, lift_reason?,
                       overturned_at?, supersedes_id?
                       CHECK (immediate_ground is null or level = 'network_hold')
                       CHECK (level not in ('suspension','termination') or length(btrim(why_not_hold)) >= 20)
app.sanction_reviews   id, decision_id UNIQUE (once per decision), requested_by, request_text, requested_at,
                       reviewer_id?, outcome enum(confirm|reduce|overturn)?, new_level?, decided_at?
```

`organizations` gains `terminated_at`. `suspended_at` stays, as a denormalized effect that only the sanction RPCs maintain. It's what `user_is_member`, `api_key_authenticate`, `assert_pairable` and the matching worker already read. **Termination also sets `suspended_at`**, so every existing "suspended" check covers termination.

### 5.3 Sanction RPCs

`decide_conduct_case(p_case, p_notice, p_outcome, p_finding, p_residual, p_level?, p_why_not_hold?, p_planned_review_on?)`, in one transaction:
1. `app.is_platform_admin()`, else `forbidden`. Lock the case `for update`.
2. **Prior notice (BR-27, EC-5):** `p_notice` belongs to the case, `sent_at is not null`, and either a response row exists or `now() >= response_due_at`. Else `notice_window_open`.
3. Same-notice escalation after an immediate hold (N10-D8): allowed when `p_notice.kind = 'immediate_hold'`. New facts need a new notice (admin discipline; the RPC records which notice was used).
4. `p_level in (suspension, termination)` requires `p_why_not_hold`. Breach with no level is allowed only as a finding (N10-D7).
5. Insert the decision, with `review_request_due_at` from `app.add_business_days(now(), 10)`. Insert the sanction. Apply effects:
   - hold: the predicate reads `org_sanctions`;
   - suspension: `suspended_at = now()`;
   - termination: `terminated_at` plus `suspended_at`.
6. When the case came from an immediate hold, mark that sanction superseded or lifted per the decision (lift, keep, change to a warning, escalate).
7. Notify the org's `org_admin`s (kind `network.sanction_applied`, no allegation text), notify the reporter with the outcome category, and write the audits (BR-40).

`apply_immediate_hold(p_case, p_ground, p_rules_cited, p_allegation, p_evidence_summary, p_name_reporter)`, in one transaction (BR-28):
1. Platform admin. `p_ground` is cast to the enum `('2.3','4.8')`, so anything else fails with `invalid_ground` before any write. `p_rules_cited` must include `p_ground`.
2. Refuse if an active hold already exists for the org.
3. Insert `conduct_notices(kind='immediate_hold', response_due_at = add_business_days(now(), 10))` **and** `org_sanctions(level='network_hold', immediate_ground, applied_by = auth.uid())` in the same statement block. The org is restricted from that point (predicate).
4. Notify the `org_admin`s now. Audit.

`lift_sanction(p_sanction, p_reason)`:
- platform admin, a reason is required;
- clears `suspended_at` and `terminated_at` effects when no other active suspension or termination remains;
- re-queues matching; audit and notify.

`request_sanction_review(p_org, p_decision, p_text)`:
- `org_admin`, member or settling, of the sanctioned org;
- `now() < review_request_due_at`;
- the unique key gives one review per decision.

`decide_sanction_review(p_review, p_outcome, p_new_level?)`:
- platform admin;
- **`auth.uid() <> decision.decided_by` and `auth.uid() <>` every `applied_by` of an immediate hold on the case**, else `reviewer_conflict` (BR-31, EC-5);
- `p_new_level` must rank lower than the current level (or lift) for `reduce`, else `review_cannot_increase`;
- `overturn` sets `overturned_at`, which excludes it from 9.2 counting, and lifts the effects.

`get_network_standing(p_org)`: `org_admin` (member or settling) or platform admin. `admin_org_conduct_file(p_org)`: adds the remaining obligations (`org_has_open_obligations` detail) and the bad-faith signal (BR-25).

`set_organization_suspension`: revoke `execute` from `authenticated`, remove it from the `AUTHENTICATED_RPCS` allow-list and remove `setSuspension` / `SuspendButton` (BR-29, scenario 30). Keep it service-role only for an operator, or drop it (§7 Q6).

---

## 6. Full N10 backend estimate

| # | Area | Days |
|---|---|---|
| A | Rules versions: tables, immutability, publish and draft RPCs (markers, BR-3 dates in ET, one upcoming, SHA-256, rule numbers), versions read | 1.0 |
| B | Acceptances: tables, `accept_network_rules`, `create_organization` change, context state, seed acceptances (`scripts/seed-demo.mts`) | 0.75 |
| C | First-access gate in the DB (about 35 writing RPCs, about 15 write policies, storage) plus actions, with a generated test over the RPC list | 1.25 |
| D | Restriction predicate, `job_partner_open` split, hidden reasons, submit, open-to-partners per user, match hide and restore, re-queue on lift, BR-14 availability RPC | 1.25 |
| E | Conduct cases: tables, report RPC (party derivation, rate limits), evidence pipeline (bucket, storage policy, register, worker scan, admin URL, orphan purge), reporter view, admin list and detail, triage (info request, close), notice, response, outcome, admin-initiated cases | 2.5 |
| F | Sanctions: decide, immediate hold, lift, review request and decision, standing and admin file RPCs, warning expiry, suspension RPC retirement | 2.0 |
| G | **Settlement mode (EC-1, option (a) full)** | **3.75** |
| H | Notifications (about 12 distinct kinds, PII-free params) and audit visibility rules | 0.75 |
| I | Cross-cutting security tests: BR-42 leakage matrix (partner surfaces, `job_hidden_reason`, notifications, `audit_events`), forged direct calls (scenarios 25–28), api-surface allow-list | 0.75 |
| J | Docs: `backend.md` (contract), `domain-model.md`, `security-and-privacy.md`, `architecture.md` | 0.75 |
| K | Type regeneration, lint and typecheck fixes, review buffer | 0.5 |
| | **Total** | **15.25 d** (range 14–18) |

Variants:
- conduct as a `public.disputes` row: **+0.5 d**;
- trimmed (a): **about −0.5 d**;
- (b) instead of (a): **about −3.25 d**;
- accepting the R-7-style residual for direct PostgREST writes (C done only in actions plus partner RPCs): **−0.75 d**.

Sequencing: A, B and D can start now (data model). E and F need the spec contracts. N5's spec is needed before D is final (the `network_pending` slot and the onboarding acceptance in BR-6).

---

## 7. Open questions

**For the PM**

1. **BR-7 scope in the database.** The brief blocks "every member RPC that writes". Doing that in the DB is line C (1.25 d, about 50 touch points). The alternative: gate in `getRequestContext`/`guard` (every action) plus the partner RPCs only, and record direct-PostgREST writes before first acceptance as a residual next to R-7 (−0.75 d). Recommendation: the full DB gate. It's mechanical, and "when in doubt, deny".
2. **BR-18:** may conduct cases live only in `app.conduct_*` tables (no `public.disputes` row), still shown in `/admin/disputes`? Recommended (§3.1).
3. **BR-34 scope:** may a suspended org read its **closed** referral history? The estimate assumes no: in-scope means in progress or open obligation (`referral_in_settlement_scope`). Reading closed history would save about 0.25 d but goes against BR-36.
4. **BR-37:** confirm the "open obligation" definition: non-terminal referral; placement not `settled` / `cancelled`; `guarantee_until >= today`; open dispute or claim. Is a settled placement still in guarantee an obligation? The estimate assumes yes.
5. **Settlement and the first-access gate:** a member of a suspended org who never accepted any version: does BR-7's hard gate apply in settlement mode? BR-9 c only waives re-acceptance. Proposal: yes, accepting is allowed in settlement mode.
6. **`set_organization_suspension`:** drop it, or keep it as a service-role-only operator tool? Proposal: drop (U-N10-3: no emergency lock).
7. **Immediate hold while a hold is active, or on an org already suspended:** refuse (proposal), or stack?

**For the designer**

8. **`job_hidden_reason` precedence:** show the restriction reason before job-level reasons (`not_open`, `no_terms`, …)? Proposal: restriction first.
9. **BR-14 sentence availability:** answered only to orgs with a referral on, or a live match to, that job (anti-enumeration). For any other direct link, the partner sees the generic not-found. OK?
10. **Settlement team page:** read plus "Deactivate" only (no role edits). Deactivation through a dedicated action. Confirm that deactivating the last active `org_admin` is refused.
11. **Acceptance at joining:** one action records both org and personal acceptance (`p_for_org` and `p_personal`). The UI must send both explicit statements (C-1).

## 8. Top risks

1. **Hot-helper change (R-4):** `user_sees_referral_as_source/target` run on every referral and placement row read. Mitigation: OR-branch only; the settling branch costs an indexed membership lookup that short-circuits for non-suspended orgs; a regression matrix of the closed policies; the whole existing integration suite.
2. **Delivery regression:** `respond_candidate_request` uses `job_partner_visible`, so adding the hold there without the `job_partner_open` split would silently block `awaiting_candidate` referrals of held orgs (BR-13, scenario 10).
3. **Conduct leakage through existing dispute logic:** 12 sites if conduct uses `public.disputes`. Removed entirely by §3.1.
4. **Hidden `is_member` uses on referral paths** (embeds of `organizations` and `job_terms_versions`, `acting_side`, `notify_eligible`, storage policy). Each is listed in §1.3, but a missed one shows up as an empty field or a `forbidden` in settlement mode, not a leak. That's the right failure direction, but QA scenario 31 must walk every BR-34 action.
5. **Margin on EC-1 is 0.25 d.** Both the `referral_candidate_requests` / links dependency on the source referral page and the `jobs_select` read path are inside the estimate, but either one could cost more.
