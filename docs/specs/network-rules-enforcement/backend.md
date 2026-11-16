# Backend: Network Rules enforcement (N10)

Owner: Backend Engineer · 2026-11-16 · Inputs: `brief.md` rev. 2 (BR-1 to BR-44, N10-D1 to N10-D38), `spec.md` (frozen, AC-1 to AC-151), `backend-estimate.md`, PD-066 (build now, legal text as drafts, the designer calls as written).
Status: built and applied **locally only** (`supabase db reset`). Not pushed. This file is the contract for frontend and QA.

## 0. Summary

| Area | What exists |
|---|---|
| Rules versions | `public.network_rules_versions` + `_version_texts` (per locale). DB normalizes CRLF/CR → LF and computes SHA-256, the rule list and the section list itself. Published rows are immutable for every role, service role included. Publish / draft RPCs for platform admins. Local seed publishes v1.0 from the stripped drafts. |
| Acceptance | Per org × version and per user × version, append-only, locale + SHA-256 stored. `accept_network_rules`, `create_organization` v2 (acceptance required, old overload dropped). |
| First-access gate | Enforced **in the database** by a statement-level trigger (`zz_rules_gate`) on every writable table + storage insert policies; app layer refuses Server Actions early. Closed exempt list (§4). Generated catalog test fails if a new table or writing function skips it. |
| Restriction | One predicate `app.org_partner_restriction(org)` (terminated > suspended > network_hold > rules_not_accepted). `app.job_partner_visible` = `app.job_partner_open` ∧ no restriction. Submits refused by a BEFORE INSERT trigger on `referrals`. Delivery uses `job_partner_open`. Matches hidden on read, never expired; re-queued on lift. |
| Conduct cases | Closed `app.conduct_*` tables only; **no `public.disputes` row** (BR-19 by construction). Report, evidence pipeline (`conduct-evidence` bucket), reporter views, admin triage, notices (fixed outcomes line), responses, follow-ups, decisions, 2.3 incident notices, admin-initiated cases. |
| Sanctions | `app.org_sanctions`, `app.sanction_reviews`. Prior notice, closed immediate-hold grounds, "why not a hold", 12-month no-level rule, reviewer ≠ decider / hold applier, no increase, termination lift ≠ decider: all in the DB. `set_organization_suspension` dropped. |
| Settlement mode | Option (a) in full, approach (i): a "settling member" branch in `app.user_sees_referral_as_source/_target` + named spots. `app.is_member` unchanged (default deny). Request context default-denies settlement orgs unless the caller opts in. |
| Audit | Conduct / sanction / settlement events readable only by `org_admin` (+ platform admins) in the policy itself. |

## 1. Migrations (in order, all new)

| File | Content |
|---|---|
| `20261116001000_network_rules_versions.sql` | enums `network_rules_version_type`, `network_rules_locale`; versions, texts, acceptances (+ RLS, immutability triggers); version helpers; `save_network_rules_draft`, `delete_network_rules_draft`, `publish_network_rules_version`, `admin_list_network_rules`, `admin_get_network_rules_version`; `create_organization` v2 (drops the 3-arg overload). |
| `20261116001100_network_rules_gate.sql` | `app.rules_gate_ok`, `app.assert_rules_gate`, `app.enforce_rules_gate`, `app.attach_rules_gate(regclass)`; trigger on every public table except the exempt ones + `app.referral_claims` / `app.referral_claim_files`; storage insert policies re-created with the gate; `accept_invitation` exempt flag. |
| `20261116001200_conduct_sanctions_schema.sql` | `organizations.terminated_at`; all `app.conduct_*`, `app.org_sanctions`, `app.sanction_reviews`, incident tables (RLS on, no policies, no grants, gated); bucket `conduct-evidence`; state helpers (`org_settlement_state`, `referral_in_settlement_scope`, settling-member helpers, `org_partner_restriction`, `user_partner_restriction`); fixed texts (outcomes line, incident guidance); notification helpers. |
| `20261116001300_partner_restriction.sql` | `job_partner_open` / `job_partner_visible` / `job_hidden_reason`; triggers `referrals_a_restriction`, `jobs_open_rules`; `assert_own_match`, `mark_matches_seen`, `get_job_match_summary`, `get_opportunities` (restricted org → empty); `app.requeue_org_matching`; `get_partner_job_availability`; `get_my_org_state`; `list_my_organizations`; `accept_network_rules`; delivery switch in `respond_candidate_request`; exempt flag in `get_candidate_request`; settlement opt-in in `issue_candidate_request_token`, `get_sent_referral_jobs`, `record_candidate_request_delivery` (the latter later replaced by N3's service-role version, which keeps the check). |
| `20261116001400_settlement_mode.sql` | `user_sees_referral_as_source/_target`, `acting_side`, `notify_eligible`, `is_partner_org`, `can_upload_claim_evidence`, `can_read_referral_terms` redefined; policies `organizations_select`, `memberships_select`, `jobs_select`, `disputes_select`; `deactivate_member_in_settlement`; `get_settlement_summary`; `admin_close_stale_referral`. |
| `20261116001500_conduct_reports.sql` | Evidence RPCs + storage policy `conduct_evidence_insert`; report RPCs; reporter views; admin queue / case / triage / notice / follow-up; org-side case page, response, follow-up reply. |
| `20261116001600_sanctions.sql` | Drops `set_organization_suspension`; decision, immediate hold, lift, review request/decision, incident notices, standing, admin org file; final `app.no_sanction_allowed`. |
| `20261116001700_conduct_audit_visibility.sql` | `audit_select` policy: sanction-related actions for `org_admin` only. |

`supabase/seed.sql` (new, **generated** by `npx tsx scripts/build-network-rules-seed.mts`, local `db reset` only): publishes v1.0 `initial` from `docs/content/network-rules/{en,fr-CA,pt-BR}.md` stripped with the PUBLISHING.md procedure (P0-3 shipped; N5, access expiry, P1-5 not shipped; remaining `[TODO: x]` → `(draft: x)`). Approval reference "Local seed: unapproved drafts (P0-1 pending)". Never reaches a hosted DB (`db push` doesn't run seeds).

**PD-064.** `20261115000300_recruiter_record_scope.sql` was not edited. `user_sees_referral_as_source/_target` and `notify_eligible` were redefined in a new migration starting from that latest body (normal branch byte-for-byte). `recruiter-record-scope.test.ts` and the N2 suites were re-run (§10).

## 2. Data model

### 2.1 Public tables (RLS on)

| Table | Select | Writes |
|---|---|---|
| `network_rules_versions` (id, label `^\d+\.\d+$` unique, type, status `draft`/`published`, effective_on, effective_at, published_at, legal_reason, approval_reference, rule_numbers text[]) | `authenticated`: published only | RPC only; published rows: update/delete refused (`immutable_record`) for every role |
| `network_rules_version_texts` (version_id, locale, body, change_summary, sha256, rules jsonb `[{number, excerpt}]`, sections jsonb `[{number, title}]`) | `authenticated`: texts of published versions | RPC only; trigger derives body normalization + sha256 + rules + sections; frozen once the version is published |
| `network_rules_org_acceptances` (org, version, accepted_by, locale, sha256, accepted_at; unique org×version) | org admins of that org (active or settling), platform admins | `accept_network_rules`, `create_organization`; update refused |
| `network_rules_member_acceptances` (user, version, organization_id = org context, locale, sha256, accepted_at; unique user×version) | own rows, platform admins | same |

`organizations.terminated_at` (not client-writable). `suspended_at` stays the denormalized effect; termination sets both.

### 2.2 Closed `app` tables (no grants, no policies; RPC access only)

`conduct_cases`, `conduct_messages` (reporter thread), `conduct_notices` (stores `language`, `rules_version_id`, `rules_cited`, `conduct_date`, `outcomes_line` + `has_outcomes_line`, `immediate_ground`, frozen `response_due_at`), `conduct_responses` (one per notice), `conduct_followups`, `conduct_decisions` (one per case; frozen `review_request_due_at`), `org_sanctions` (`level`, `immediate_ground`, `expires_at` for warnings, `ended_at` + `end_reason` lifted/reduced/overturned/superseded), `sanction_reviews` (one per decision), `conduct_files`, `conduct_incident_notices`, `conduct_incident_recipients` (`sides`, copied `guidance` lines).

### 2.3 Key definitions

- **Current version**: latest published with `effective_at <= now()`. **Required version**: latest effective of type ≠ `non_material`. **Upcoming**: published, `effective_at > now()` (at most one).
- "Accepted the version in force" = accepted any version whose `effective_at` ≥ the required version's (accepting the upcoming version early counts).
- `app.org_partner_restriction(org)`: `terminated` | `suspended` | `network_hold` (active hold sanction) | `rules_not_accepted` (required version exists and no org acceptance satisfying it) | null. N5 extends this same function for `network_pending`.
- `app.user_partner_restriction(user, org)`: the org reason, else `rules_acceptance_required` (never accepted) or `rules_not_accepted_user` (accepted only an older version).
- `app.org_settlement_state(org)`: null (active) · `settlement` (suspended, or terminated with an open obligation) · `closed` (terminated, nothing open).
- **Open obligation** (BR-37, N10-D33), `app.referral_in_settlement_scope(r)`: referral non-terminal; or a placement not settled/cancelled; or a **settled placement with `guarantee_until >= today ET`**; or an open dispute (referral or its placement) or an open/contested claim.
- Sanction active: `ended_at is null` and (warning ⇒ `expires_at > now()`; warnings last 12 months).
- Business-day deadlines (EC-6), computed and stored when the clock starts with `app.add_business_days`: first response +2, notice response +10, follow-up/info request +1..10 (optional), review request +10.

## 3. RPCs

All `SECURITY DEFINER`, `search_path = ''`, executable by `authenticated` only (except the service-role ones), on the api-surface allow-list. Member RPCs take `p_org` and **re-check** the caller's membership; anything not visible is `not_found`. Admin RPCs check `app.is_platform_admin()` (`forbidden` otherwise, unless noted). JSON keys are snake_case.

### 3.1 Rules and acceptance

| RPC | Args | Returns / notes | Errors |
|---|---|---|---|
| `accept_network_rules` | `p_org, p_version, p_locale ('en'\|'fr-CA'\|'pt-BR'), p_personal bool, p_for_org bool` | `{ member_accepted, org_accepted }` for that version. **Gate-exempt**, works in settlement mode. `p_for_org` needs org_admin. An org_admin of a non-settling org that hasn't accepted the version (or later) must send both (N10-D18). Current or upcoming version only. Idempotent. Audits `network_rules.org_accepted` / `member_accepted` (metadata: label, locale, sha256). | `not_found` (not a member / closed org), `rules_acceptance_required` (nothing ticked, unknown/draft version, admin without the org statement), `rules_version_changed` (published but no longer current/upcoming), `forbidden` (org statement by a non-admin), `invalid_locale` |
| `create_organization` | `p_name, p_slug, p_kind='agency', p_rules_version, p_rules_locale, p_accept_org, p_accept_member` | org id. Both acceptances in the same transaction (BR-6). Gate-exempt. | `rules_acceptance_required`, `rules_version_changed` (must be the **current** version), `slug_taken` |
| `get_my_org_state` | `p_org` | see §3.1.1 | `not_found` (not an active member, or org closed) |
| `list_my_organizations` | — | rows `{ id, slug, name, is_demo, role, settlement_mode }`; closed orgs excluded | — |
| `publish_network_rules_version` (admin) | `p_label, p_type, p_effective_on date, p_texts {en,fr-CA,pt-BR}, p_summaries {..}, p_legal_reason, p_approval_reference, p_draft uuid?` | version id. `initial` (only if none published) / `non_material`: effective now. `material`: `p_effective_on ≥ today ET + 30`, effective 00:00 America/Toronto. `legally_required`: reason 20–1,000, date ≥ today. Summaries 20–2,000 per locale except `initial`. Notifies every active member once (`network_rules.published`). Audits `network_rules.published` (org null). | `missing_locale` (DETAIL JSON `[{locale, field: 'text'\|'summary'}]`), `marker_found` (DETAIL JSON `[{locale, line, marker}]`), `effective_date` (DETAIL = earliest allowed date `YYYY-MM-DD`), `upcoming_exists`, `label_taken`, `legal_reason_required`, `approval_reference_required` (5–300), `initial_exists`, `initial_required`, `rule_numbers_mismatch` (DETAIL = locale), `invalid_label`, `invalid_type`, `forbidden` |
| `save_network_rules_draft` (admin) | `p_draft uuid?, p_label, p_type, p_effective_on, p_texts, p_summaries, p_legal_reason?, p_approval_reference?` | draft id (no marker check; texts hashed too) | `label_taken`, `invalid_label`, `invalid_type`, `not_found` |
| `delete_network_rules_draft` (admin) | `p_draft` | — | `not_found` (also for a published version) |
| `admin_list_network_rules` | — | `[{ id, label, type, status, effective_on, effective_at, published_at, legal_reason, approval_reference, rule_numbers, is_current, is_upcoming, texts: { <locale>: { sha256, change_summary } } }]` | `forbidden` |
| `admin_get_network_rules_version` | `p_version` | version row + `texts: { <locale>: { body, change_summary, sha256, rules, sections } }` | `forbidden`, `not_found` |

Members read the versions page straight from the tables (RLS, published only): see `getRulesVersions` / `getRulesVersionByLabel` (§6).

#### 3.1.1 `get_my_org_state(p_org)` → (also exposed on `RequestContext`, §5)

```json
{
  "role": "org_admin",
  "restriction": null | "terminated" | "suspended" | "network_hold" | "rules_not_accepted",
  "settlement_mode": false,
  "settlement_kind": null | "suspended" | "terminated",
  "suspended_at": null, "terminated_at": null,
  "quebec": false,                       // org locale starts with "fr" (until N5's province)
  "rules": {
    "current":  { "id", "label", "effective_at", "type" } | null,
    "required": { "id", "label", "effective_at" } | null,
    "upcoming": { "id", "label", "effective_at", "type" } | null,
    "gate_required": false,              // current exists and the user never accepted any version (BR-7)
    "member_accepted_any": true,
    "member_accepted_current": true,     // accepted the required version or a later one
    "member_accepted_upcoming": false,
    "org_accepted_current": { "at", "by_name" } | null,   // by_name only for org_admin; {at:null} when no required version
    "org_accepted_upcoming": { "at", "by_name" } | null,
    "user_restricted": false             // accepted an older version but not the one in force (BR-9 b)
  }
}
```

### 3.2 Restriction, partner view, settlement

| RPC | Args | Returns / notes | Errors |
|---|---|---|---|
| `get_partner_job_availability` | `p_org, p_match?, p_job?` | `{status:'not_found'}` or `{ status: 'available'\|'not_taking_referrals'\|'no_longer_member', org_name, job_title }`. Answers only when `p_org` (caller's org) has a live match (record scope) or a visible sourcing-side referral on that job; else `not_found` (AC-137). Never a reason. `no_longer_member` = terminated org whose settlement ended; reverts if the termination is lifted. | — |
| `get_settlement_summary` | `p_org` | `{ referrals_in_progress, commissions_open, disputes_to_answer }` (record scope) | `not_found` |
| `deactivate_member_in_settlement` | `p_org, p_membership` | Org admin of a settling org only. Sets membership `suspended`. Audits `membership.deactivated`. | `not_found`, `self_change`, `last_admin` |
| `admin_close_stale_referral` (admin) | `p_referral, p_reason (5–2,000)` | Sets `cancelled`; status event `reason = 'closed_stale_by_admin'`, `actor_kind = 'admin'`, `actor_id = null`; notifies both sides (`referral.status`); audits `referral.closed_stale_by_admin` on both orgs (no reason) + admin audit with reason. Ownership window untouched. | `not_terminated` (no terminated settling party), `not_stale` (activity < 60 days: max of created_at, status events, messages), `invalid_transition` (already terminal), `reason_required` |

Matching RPCs (existing, behaviour changed): `get_opportunities` returns nothing for a restricted `p_org`; restricted owners' jobs are hidden for everyone (via `job_partner_visible`); `set_match_triage` → `not_found` and `mark_matches_seen` → no-op for a restricted org; `get_job_match_summary` returns zeros for a restricted owner and excludes restricted candidate orgs.

### 3.3 Conduct reports (member side)

| RPC | Args | Returns / notes | Errors |
|---|---|---|---|
| `get_conduct_report_context` | `p_org, p_referral? \| p_match?` (exactly one) | `{ reported_org_name, side: 'source'\|'target'\|'job', categories: [...] }` (9 / 7 / 5, "other" last) | `not_found`, `report_self` (own org, related orgs, internal referral) |
| `file_conduct_report` | `p_org, p_referral, p_match, p_category, p_description (20–4,000), p_occurred_on date?, p_occurred_approx, p_attested, p_file_ids uuid[] (≤5, clean, own drafts)` | `{ case_id, first_response_due_at }`. Any of the 9 categories accepted. Works in a held org and in settlement mode on in-scope referrals. Job reports need an unrestricted active org with a live match. Audits `conduct_report.filed` on the reporting org (case id only). Notifies the reporter. | `not_found`, `report_self`, `report_rate_limited_user` (5 / user / rolling 24 h), `report_rate_limited_org` (10 / org / 24 h), `conduct_attestation_required`, `conduct_category_invalid`, `conduct_text_invalid`, `conduct_date_future`, `conduct_files_not_ready`, `conduct_file_invalid`, `conduct_too_many_files` |
| `list_my_conduct_reports` | `p_org, p_scope 'mine'\|'org' = 'mine', p_referral?` | `[{ id, category, created_at, reported_org_name, referral_id, source, status, is_mine, sent_by_name, sent_by_former }]`. `org` scope only for org_admins; anyone else gets own reports only. `sent_by_*` only in org scope. | `not_found` |
| `get_conduct_report` | `p_org, p_case` | reporter view: `{ id, category, description, occurred_on, occurred_approx, created_at, first_response_due_at, reported_org_name, source, referral_id (null if no longer visible), status, outcome, closed_reason_code, closed_reason, closed_at, outcome_updated_at, files: [{file_name, size_bytes}], thread: [{ id, question, due_at, asked_at, reply: {body, at, files} \| null }], can_reply, open_question_id, is_mine, sent_by_name, sent_by_former }`. Reporter (active member) or the reporting org's org_admins. Never the admin category, notice, response, finding, level or review. | `not_found` |
| `reply_conduct_info_request` | `p_org, p_case, p_body (20–4,000), p_file_ids` | reporting user only; one reply to the open question | `not_found`, `conduct_reply_closed` (no open question, already answered, deadline passed), `conduct_text_invalid` |

**Reporter `status`**: `received` · `input_needed` (reporter only) · `in_review` · `closed` (triage close; show `closed_reason`) · `action_taken` · `no_breach` · `insufficient_evidence`. After an overturn: `no_breach` (`outcome_updated_at` set).

### 3.4 Conduct evidence

| RPC | Notes |
|---|---|
| upload | Storage `conduct-evidence`, path `{org_id}/{user_id}/{uuid}.{pdf\|png\|jpg}` (member, active or settling) or `admin/{user_id}/{uuid}.{ext}` (platform admin). Policy also requires the rules gate; ≤ 20 open drafts per user. |
| `register_conduct_evidence(p_storage_path, p_file_name)` | → `{ id, file_name, mime_type, size_bytes, uploaded_at, scan_status }`. MIME/size from the stored object. Queues `conduct_evidence.scan`. Errors `conduct_file_invalid`. |
| `list_conduct_draft_files(p_ids uuid[]?)` | caller's unattached drafts (polling) |
| `remove_conduct_draft_file(p_file)` | → storage path (server deletes with service role). `not_found`, `immutable_record` (attached). |
| `authorize_conduct_evidence(p_file)` | **platform admin only** (`not_found` for anyone else), attached + clean (`conduct_files_not_ready`); audits `conduct_evidence.accessed` (org null) → path for a 60 s signed URL. |
| `conduct_evidence_scan_target`, `record_conduct_evidence_scan`, `purge_orphan_conduct_files` | **service role only** (worker). |

### 3.5 Admin conduct queue and case

| RPC | Args | Notes / errors |
|---|---|---|
| `admin_list_conduct_cases` | `p_open_only = false` | `[{ id, source, state, status, category, admin_category, possible_94, reported_org {id,name}, reporter_org {id,name}\|null, created_at, first_response_due_at, first_response_at, next_deadline, open, bad_faith_count, decision_overdue }]`, sorted overdue → possible 9.4 → first-response target. `state` ∈ `new, waiting_for_reporter, notice_sent, response_received, window_closed, decided, review_requested, needs_second_admin, closed`. |
| `admin_get_conduct_case` | `p_case` | full record incl. reporter user `{id,name,email,active_member}`, files (with sha256, purpose), thread, notices (with response, follow-ups, `window_closed`), decision (+ review, admin names), sanctions, incident notices, `org_context {history, open_cases}`, `immediate_hold`, `can_apply_immediate_hold`, `no_sanction_allowed`, `has_eligible_reviewer`, `viewer_can_review`, `viewer_is_hold_applier`, `incident_allowed`. |
| `admin_set_conduct_category` | `p_case, p_category` | audits `conduct.admin_category_set` (org null) |
| `admin_request_conduct_info` | `p_case, p_question (20–2,000), p_due_business_days 1..10?` | needs admin category (`admin_category_required`); status `info_requested`; notifies the reporter if still active. `invalid_transition`, `conduct_deadline_invalid`. |
| `admin_close_conduct_case` | `p_case, p_reason_code ('no_rule'\|'amount'\|'duplicate'\|'other'), p_reason (20–1,000, reporter reads it)` | new / info_requested only; notifies reporter (fallback org admins). |
| `admin_open_conduct_case` | `p_org, p_category, p_admin_source ('confirmation_invalid'\|'objection_fabricated'\|'other'), p_referral?, p_description (20–4,000), p_file_ids` | → case id (admin category = category). |
| `admin_conduct_notice_context` | `p_case, p_conduct_date?` | `{ default_conduct_date, first_effective_on, org_locale, default_version_id (in force on the date), versions: [{ id, label, effective_at, effective_on, type, rules: {<locale>: [{number, excerpt}]}, sections, org_accepted_at }] }` (effective versions only) |
| `admin_send_conduct_notice` | `p_case, p_language, p_conduct_date, p_rules_version, p_rules_cited text[], p_allegation (20–4,000), p_alleged_when (3–200), p_evidence_summary (20–4,000), p_name_reporter` | → notice id. Server copies the fixed outcomes line (language) and freezes `response_due_at` (+10 business days). Can be sent again on the same case (new facts). Notifies org admins `conduct.notice_sent`; audits `conduct.notice_sent` on the reported org. Errors `admin_category_required`, `invalid_transition`, `invalid_language`, `conduct_date_required`, `conduct_date_future`, `conduct_date_before_rules`, `notice_version_invalid` (draft / upcoming / unknown), `notice_rule_not_in_version`, `conduct_text_invalid`. |
| `admin_send_conduct_followup` | `p_notice, p_question (20–2,000), p_due_business_days?` | notifies `conduct.followup`; audits `conduct.followup_sent` |
| `admin_decide_conduct_case` | `p_case, p_notice, p_outcome ('no_breach'\|'insufficient_evidence'\|'breach'), p_finding (50–8,000 for breach), p_rules_cited, p_residual, p_level (null\|'warning'\|'network_hold'\|'suspension'\|'termination'), p_why_not_hold?, p_planned_review_on?` | → decision id. **After an immediate hold**: level null = lift the hold, `network_hold` = keep it, `warning` = lift + warning, suspension/termination = supersede. Stores `review_request_due_at` for breach decisions. Notifies org admins `conduct.decided` and the reporter `conduct_report.closed`. Errors: `sanction_notice_required` (notice not of the case, window open with no response, or escalation to suspension/termination on a notice without the outcomes line), `decision_rules_not_in_notice`, `sanction_reason_required`, `no_sanction_not_allowed`, `conduct_outcome_invalid`, `conduct_level_invalid`, `conduct_text_invalid`, `invalid_transition`. |
| `admin_apply_immediate_hold` | `p_case, p_ground ('2.3'\|'4.8'), p_language, p_conduct_date, p_rules_version, p_rules_cited (ground added), p_allegation, p_alleged_when, p_evidence_summary, p_name_reporter` | → `{ notice_id, sanction_id, response_due_at }`; hold + notice in one transaction. Errors: `immediate_hold_ground_invalid` (checked first, nothing written), `org_already_restricted` (active hold, suspension incl. legacy, termination; nothing written), `admin_category_required`, plus the notice errors. Allowed on `rules_not_accepted`. |
| `admin_lift_sanction` | `p_org, p_sanction? (null = legacy pre-N10 suspension), p_reason (5–2,000)` | Holds, suspensions, terminations. Clears effects when no other suspension/termination remains; re-queues matching; audits `sanction.lifted` on the org (no reason) + admin audit with reason; notifies `sanction.lifted`. Errors: `lift_not_allowed` (termination by its decider), `reason_required`, `invalid_transition` (warning), `not_found`. |
| `admin_decide_sanction_review` | `p_review, p_outcome ('confirm'\|'reduce'\|'overturn'), p_new_level ('warning'\|'network_hold'\|'suspension'\|'none')?, p_reason (50–8,000)` | reduce → strictly lower level (`none` = lift); overturn → ends every active sanction of the case, sets `overturned_at` (excluded from 12-month counting), reporter gets `conduct_report.outcome_updated`. Errors: `review_not_allowed` (decider or immediate-hold applier), `review_cannot_increase`, `already_reviewed`, `conduct_text_invalid`. |
| `admin_conduct_incident_options` | `p_case` | `[{ referral_id, job_title, candidate_label, status, created_at, linked, counterpart_org {id,name}, counterpart_side }]` (sanctioned org's non-internal referrals, ≤ 200) |
| `admin_send_incident_notice` | `p_case, p_recipient_orgs uuid[], p_referrals uuid[] (≤50), p_information (20–2,000), p_when (3–200), p_to_whom (≤500)?, p_language` | → notice id. Each recipient's side(s) computed; guidance line(s) copied (sourcing first). Notifies each recipient's org admins `conduct.incident_notice`; audits per recipient (notice id, referral ids). Errors `incident_not_allowed` (no non-overturned breach citing 2.3), `incident_recipient_invalid` (sanctioned org or not a counterparty), `not_found` (referral not of the sanctioned org). |
| `admin_org_conduct_file` | `p_org` | `{ standing, restriction, settlement_state, suspended_at, terminated_at, legacy_suspended, active {hold_id, suspension_id, termination_id}, can_lift_termination, sanctions [... with applied_by_name, decided_by_name, end_note], open_cases, acceptances, members_not_accepted, obligations: { referrals [{id, status, job_title, partner_org_name, last_activity_at, inactive_days, stale_closable}], placements [{id, referral_id, status, guarantee_until, reasons: ['guarantee'\|'payout_not_confirmed'\|'open_dispute']}], all_settled } \| null }` |

### 3.6 Reported org (org_admin, active or settling)

| RPC | Args | Notes / errors |
|---|---|---|
| `get_network_standing` | `p_org` | `{ standing {level, since, planned_review_on, expires_at, sanction_id, legacy}, restriction, rules_not_accepted {version_id,label,effective_at}\|null, open_notices [{case_id, notice_id, kind, rules_cited, sent_at, response_due_at, business_days_left, responded, open_followups}], history {sanctions [...status], cases [{case_id, outcome, level, decided_at, overturned_at, review_status, can_request_review, review_request_due_at}]}, acceptances [{version_id,label,accepted_at,accepted_by_name,locale}], members_not_accepted [{user_id,name,accepted_current,accepted_upcoming}], incident_notices [{id,sent_at,referral_count}] }`. `not_found` for non-admins. |
| `get_conduct_case_for_org` | `p_org, p_case` | Only from the first notice. `{ id, status, notices [{ id, kind, language, rules_version_label, rules_cited [{number, excerpt}] (notice language), conduct_date, allegation, alleged_when, evidence_summary, reporter_org_name (only if named), outcomes_line, immediate_ground, sent_at, response_due_at, business_days_left, can_respond, response {body, submitted_at, author_name, files}, followups [{id, question, due_at, asked_at, reply_body, replied_at, reply_by_name, can_reply}] }], decision {outcome, finding, rules_cited, residual_test, level, planned_review_on, decided_at, review_request_due_at, overturned_at, can_request_review, sanctions [...], review {requested_at, requested_by_name, outcome, new_level, reason, decided_at}}\|null, immediate_hold {applied_at,status,ended_at}\|null }`. **No reporter user, report text, category, files, or any platform admin name/id** (N10-D28). |
| `submit_conduct_response` | `p_org, p_notice, p_body (20–8,000), p_file_ids` | one per notice before the deadline; notifies platform admins `conduct.response_received`. `conduct_response_exists`, `conduct_response_closed` (DETAIL = deadline ISO). |
| `reply_conduct_followup` | `p_org, p_followup, p_body (20–4,000), p_file_ids` | one per follow-up; notifies admins `conduct.followup_answered`. `conduct_response_exists`, `conduct_reply_closed`. |
| `request_sanction_review` | `p_org, p_case, p_text (20–8,000), p_file_ids` | → review id. Breach decisions only (with or without level). Notifies platform admins. `review_already_requested`, `review_window_closed` (DETAIL = deadline), `not_found`. |
| `get_incident_notice` | `p_org, p_notice` | recipient org admins only: `{ id, sent_at, language, information, occurred, to_whom, sides, guidance [{variant:'sourcing'\|'hiring', text}], referrals [{id, job_title, candidate_label}] (null fields when the org can no longer open it) }`. Never the sanction, outcome or reporter. |

## 4. First-access gate (BR-7): what is exempt

Refusal code everywhere: `rules_acceptance_required`.

| Layer | Mechanism |
|---|---|
| Database (authoritative) | Statement-level trigger `zz_rules_gate` (BEFORE INSERT/UPDATE/DELETE) on every public table except the exempt ones, on `app.referral_claims`, `app.referral_claim_files` and every `app.conduct_*` / sanction table. Fires inside SECURITY DEFINER RPCs too (so **every writing RPC is gated without per-RPC code**). Storage insert policies (`candidate-documents`, `candidate-photos`, `claim-evidence`, `conduct-evidence`) call `app.assert_rules_gate()`. Zero-row writes are refused too. |
| Server Actions | `getRequestContext` throws `RulesAcceptanceRequiredError` in a Server Action (detected by the `Next-Action` header) when `rules.gateRequired`, unless `rulesGateExempt`. Pages never throw for the gate: render the gate screen from `ctx.rules.gateRequired`. |

**Exempt (closed list):**
- `accept_network_rules`, `create_organization` (records the acceptance), `accept_invitation` (gate starts once the membership exists): they set the transaction-local flag `app.rules_gate_exempt`. Clients can't set it (PostgREST runs one RPC per transaction; `set_config` isn't exposed; tested).
- Marking one's own notifications read (`notifications` is outside the gate; the column grant only allows `read_at`). Server actions `markAllRead` / `openNotification` pass `rulesGateExempt`.
- Sign-out, org switch (no DB write).
- Platform admins (`app.is_platform_admin()`), everywhere in the DB (BR-11). The workspace Server Action check still applies to a platform admin who is also a member.
- Candidate-token RPCs `get_candidate_request`, `respond_candidate_request` (flag set; the actor is the candidate even when a signed-in user's browser calls them); service role / worker / anon (no `auth.uid()`).
- Tables outside the gate: `notifications`, `audit_events`, `background_jobs`, `matches`, the four `network_rules_*` tables, `app.rate_limits`, and app side tables written only by gated parent writes (list in `network-rules-gate.test.ts`). Consequence: RPCs that only write `audit_events` (`audit_document_access`, `authorize_referral_document`, `authorize_claim_evidence`, `authorize_conduct_evidence`) are treated as reads with access logging and aren't gated; `consume_rate_limit` isn't gated.
- No published version at all: nothing to accept, no gate (N10 is inert until v1 is published; see §11).
- Residual R-7: reads through PostgREST before acceptance aren't blocked.

**Adding a table later:** call `select app.attach_rules_gate('schema.table');` in its migration. The generated test (`gate coverage over the catalog`) fails for any public table without the trigger and for any function that writes an ungated, non-exempt table.

## 5. Request context, settlement opt-in (EC-1, EC-7)

`getRequestContext(orgSlug, opts?: { allowSettlement?: boolean; rulesGateExempt?: boolean })` (`src/server/auth/context.ts`) now adds:

```ts
restriction: OrgRestriction | null;       // own org only
settlementMode: boolean; settlementKind: "suspended" | "terminated" | null;
quebec: boolean;
rules: { current, required, upcoming, gateRequired, memberAcceptedAny, memberAcceptedCurrent,
         memberAcceptedUpcoming, orgAcceptedCurrent, orgAcceptedUpcoming, userRestricted };
```

- **Default deny:** a settlement-mode org without `allowSettlement` → pages `notFound()` (exactly as before N10), Server Actions `SettlementModeError` → `settlement_mode_unavailable`. A closed org → `notFound()` always.
- To render S22-c (blocked route page) instead of not-found, a page calls `getRequestContext(slug, { allowSettlement: true })` and renders S22-c when `ctx.settlementMode`. To render the gate, read `ctx.rules.gateRequired`. `isSettlementModeError(e)` is exported from `src/server/auth/errors.ts`.
- `listMemberships()` now returns `settlementMode` per org and includes settlement orgs (closed excluded), via `list_my_organizations`.

**Opt-in list (`allowSettlement: true`) today:** every action in `src/features/referrals/actions.ts` **except `submitReferral`** (transition, review, decline, message, confirm agreement, report hire, document URL, resend candidate request, withdraw, release, claim evidence upload/list/remove/URL, file claim, contest); all of `src/features/commissions/actions.ts` (invoice, evidence, review evidence, open dispute); `src/features/notifications/actions.ts` (also gate-exempt); every member action in `src/features/network-rules/actions.ts`. Pages: none yet (frontend opts in per BR-34: layout, overview/settlement home, referrals list + detail, commissions, settings/standing, settings/team (read), reports, accept-rules, notifications).

**What the DB opens in settlement mode** (settling member, in-scope referrals only, RD-036 record scope kept): referrals and everything hanging off them via `can_see_referral` (status events, messages incl. insert, grants, shared profiles, agreements, placements, placement events, invoices, evidence, ledger, placement disputes) and the RPCs routed through `source_referral` / `target_referral` / `acting_side` (transition, review, decline, withdraw, release, confirm agreement, report hire, invoices, payment evidence, open dispute, N1 claims/contest/evidence, resend candidate request); `organizations_select` (own org), `memberships_select`, `jobs_select` (read-only own jobs behind an in-scope referral), `disputes_select` (prior-presentation branch), `job_terms_versions` (both sides of in-scope referrals), partner org names, settling admins/managers in referral notifications. **Stays closed:** candidates and their documents/consents/experiences, job writes, matching, opportunities, connectors, sync runs, API keys (`api_key_authenticate` already refuses suspended orgs; termination sets `suspended_at`), invitations, org settings, memberships update (use `deactivate_member_in_settlement`), audit, privacy requests, candidate storage.

## 6. Server Actions and query helpers (`src/features/network-rules/`)

Results are `ActionResult`; failures carry `code` (server code, §8) and, where useful, `detail` (DB DETAIL string, e.g. marker JSON or a deadline).

**Member actions** (`actions.ts`, all via `guard()` + Zod in `schemas.ts`):

| Action | Input | Data | Permission |
|---|---|---|---|
| `acceptNetworkRules(orgSlug, input)` | `{ versionId, locale, personal, forOrg }` | `{ memberAccepted, orgAccepted }` | any member; gate-exempt; settlement OK |
| `getConductReportContext(orgSlug, input)` | `{ referralId? \| matchId? }` | `{ reportedOrgName, side, categories }` | any member |
| `uploadConductEvidence(orgSlug, prev, formData{file})` | PDF/PNG/JPEG ≤ 10 MB | `ConductFile` | any member; rate limit `conduct.upload` 30/h |
| `getConductDraftFiles(orgSlug, fileIds?)` | — | `ConductFile[]` | any member |
| `removeConductDraftFile(orgSlug, fileId)` | — | — | uploader |
| `fileConductReport(orgSlug, input)` | `{ referralId? \| matchId?, category, description, occurredOn?, occurredApprox?, attested: true, fileIds? }` | `{ caseId, firstResponseDueAt }` | any member |
| `replyToConductInfoRequest(orgSlug, input)` | `{ caseId, body, fileIds? }` | — | reporting user |
| `submitConductResponse(orgSlug, input)` | `{ noticeId, body, fileIds? }` | — | org_admin |
| `replyToConductFollowup(orgSlug, input)` | `{ followupId, body, fileIds? }` | — | org_admin |
| `requestSanctionReview(orgSlug, input)` | `{ caseId, text, fileIds? }` | — | org_admin |
| `deactivateMemberInSettlement(orgSlug, input)` | `{ membershipId }` | — | `team:manage` (org_admin) |

**Admin actions** (`admin-actions.ts`, platform admin session + DB check): `saveNetworkRulesDraft`, `deleteNetworkRulesDraft`, `publishNetworkRulesVersion` (rate limit 20/h), `setConductCategory`, `requestConductInfo`, `closeConductCase`, `openConductCase`, `sendConductNotice`, `applyImmediateHold`, `sendConductFollowup`, `decideConductCase`, `liftSanction`, `decideSanctionReview`, `sendIncidentNotice`, `closeStaleReferral`, `getAdminConductEvidenceUrl` (60 s signed URL), `uploadAdminConductEvidence` (path `admin/{user}/…`). Input schemas in `schemas.ts` (`rulesDraftSchema`, `rulesPublishSchema`, `conduct*Schema`, `immediateHoldSchema`, `liftSanctionSchema`, `reviewDecisionSchema`, `incidentNoticeSchema`, `staleCloseSchema`). Rules texts: `{ en, "fr-CA", "pt-BR" }` objects.

**Queries** (`queries.ts`, server-only, user client): `getRulesVersions(db)` → `{ current, upcoming, history }`; `getRulesVersionByLabel(db, label, locale)` → `{ version, text, summaries } | null` (draft/unknown → null); `getRulesVersionText(db, versionId, locale)`; `listMyConductReports(ctx, scope, referralId?)`; `getConductReport(ctx, caseId)`; `getNetworkStanding(ctx)`; `getConductCaseForOrg(ctx, caseId)`; `getIncidentNotice(ctx, noticeId)`; `getPartnerJobAvailability(ctx, { matchId? | jobId? })`; `getSettlementSummary(ctx)`. Not-found → `null`. Types in `types.ts`.

**Admin queries** (`admin-queries.ts`): `listNetworkRules`, `getNetworkRulesVersion`, `listConductCases(db, openOnly)`, `getConductCase`, `getConductNoticeContext`, `getIncidentOptions`, `getOrgConductFile` (JSON as §3). `getAdminQueues` (`src/features/admin/queries.ts`) now adds open conduct cases to `disputes` and exposes `conduct` (AC-139).

**Domain** (`domain.ts`, pure, unit-tested): `normalizeRulesText`, `rulesSha256` (= DB hash), `findRulesMarkers` (live marker list for S6), `extractRuleNumbers`, `stripForPublish` (PUBLISHING.md procedure), `rulesLocaleFor`, `defaultRulesLocale({quebec, uiLocale, override})`, `earliestMaterialEffectiveDate`, `categoriesForSide`, `isPossibleImmediateHold`, `sanctionRank`, `reductionOptions`, constants.

**Other changed app code:** `createOrganization` (organizations/actions.ts) now sends `rulesVersionId`, `rulesLocale`, `acceptOrg`, `acceptMember` (form fields; checkboxes `on`/`true`) and creates the org **before** the profile update (the gate refuses the profile write otherwise). `setSuspension` / `SuspendButton` deleted (BR-29) and removed from both admin org pages (no replacement UI: frontend adds the S19 controls). `openNotification` follows app-level links (`/network-rules…`, `/admin/…`) as-is.

## 7. Notifications (in-app; en title/body written in SQL exactly as spec §5.15; PII-free)

| Kind | Recipients | Link |
|---|---|---|
| `network_rules.published` | every active member once (body `bodyAccept` with `{date}` for material/legally required with a future date, else `bodyInfo`) | `/network-rules#upcoming` (app-level) |
| `conduct_report.received` | reporting user | `/reports/{case}` |
| `conduct_report.info_requested` | reporting user (none if they left) | `/reports/{case}` |
| `conduct_report.closed` | reporting user; if they left, the reporting org's org admins with the `titleOrg` title | `/reports/{case}` |
| `conduct_report.outcome_updated` | same as closed; only when a review overturns | `/reports/{case}` |
| `conduct.notice_sent` | reported org's org admins | `/settings/standing/{case}` |
| `sanction.immediate_hold` | reported org's org admins | `/settings/standing/{case}` |
| `conduct.followup` | reported org's org admins | `/settings/standing/{case}` |
| `conduct.decided` | reported org's org admins | `/settings/standing/{case}` |
| `sanction.lifted` | org admins (hold, suspension, termination, legacy) | `/settings/standing` |
| `sanction.reviewed` | org admins | `/settings/standing/{case}` |
| `conduct.incident_notice` | each recipient org's org admins | `/settings/standing/incidents/{notice}` |
| `conduct.response_received` | platform admins (org null) | `/admin/disputes/conduct/{case}` (app-level) |
| `sanction.review_requested` | platform admins | same |
| `conduct_report.reply_received` | platform admins | same |
| `conduct.followup_answered` | platform admins | same |

**Decision on the two proposed admin kinds:** both are **added** (`conduct_report.reply_received`, `conduct.followup_answered`). They mirror `conduct.response_received`, cost nothing, and without them a reply or follow-up answer would sit unseen against the 2-business-day / decision targets. Keep their four keys.

Not built: `network_rules.effective_not_accepted` and `network_rules.reminder` (no scheduler; §11). Notification bodies never contain allegation text, category, reporter, finding or level; `{when}` is "Mon D, YYYY, H:MM AM" ET.

## 8. Error codes

`toActionError` maps these to the default keys below and returns them in `code` (screens with a context key switch on `code`, spec §5.16). Keys are built untyped; until the frontend adds them they render as the key.

| Code | Default key |
|---|---|
| `rules_acceptance_required` | `network.errors.acceptanceRequired` |
| `rules_version_changed` | `network.accept.versionChanged` |
| `partner_activity_restricted` | `network.errors.partnerActivityRestricted` |
| `settlement_mode_unavailable` | `network.errors.settlementUnavailable` |
| `report_self` · `report_rate_limited_user` · `report_rate_limited_org` | `network.report.errors.self` · `.userLimit` · `.orgLimit` |
| `conduct_reply_closed` · `conduct_response_closed` · `conduct_response_exists` | `network.reports.replyClosed` · `network.case.errors.closed` · `.exists` |
| `review_already_requested` · `review_window_closed` | `network.case.errors.reviewExists` · `.reviewClosed` |
| `last_admin` · `self_change` | `network.team.lastAdmin` · `onboarding.errors.selfChange` |
| `upcoming_exists` · `missing_locale` · `marker_found` · `effective_date` · `label_taken` | `admin.networkRules.upcomingExists` · `.errors.missingLocale` · `.errors.marker` · `.errors.effective` · `.errors.labelTaken` |
| `conduct_date_before_rules` · `conduct_date_future` | `admin.conduct.notice.conductDateBeforeRules` · `network.report.errors.dateFuture` |
| `sanction_notice_required` · `sanction_reason_required` · `no_sanction_not_allowed` · `decision_rules_not_in_notice` | `admin.conduct.decideLocked` · `admin.conduct.errors.reasonRequired` · `admin.conduct.errors.noSanctionNotAllowed` · `admin.conduct.decision.rulesFromNotice` |
| `immediate_hold_ground_invalid` · `org_already_restricted` | `admin.conduct.errors.groundInvalid` · `admin.conduct.errors.alreadyRestricted` |
| `review_not_allowed` · `review_cannot_increase` | `admin.conduct.review.selfBlocked` (use `selfBlockedHold` when `viewer_is_hold_applier`) · `admin.conduct.errors.cannotIncrease` |
| `lift_not_allowed` | `admin.orgDetail.errors.liftNotAllowed` (the spec's proposed "termination lift" code) |
| `not_stale` · `not_terminated` | `admin.orgDetail.errors.notStale` · `.notTerminated` |
| generic (code kept, `errors.generic` shown; UI validates first) | `rule_numbers_mismatch`, `initial_exists`, `initial_required`, `approval_reference_required`, `legal_reason_required`, `invalid_label`, `invalid_type`, `invalid_locale`, `invalid_language`, `conduct_category_invalid`, `conduct_text_invalid`, `conduct_attestation_required`, `conduct_file_invalid`, `conduct_files_not_ready`, `conduct_too_many_files`, `conduct_deadline_invalid`, `conduct_reason_invalid`, `conduct_outcome_invalid`, `conduct_level_invalid`, `conduct_date_required`, `notice_version_invalid`, `notice_rule_not_in_version`, `admin_category_required`, `incident_not_allowed`, `incident_recipient_invalid` |

`no_sanction_not_allowed` is the confirmed name (AC-146). `submit_referral` / `submit_referral_for_candidate` return codes as the **outcome** (existing `app.safe_error_code` pattern): the composer receives `partner_activity_restricted` / `rules_acceptance_required` / `job_not_open_for_referrals` through `submitReferral`'s existing `toActionError({ message: outcome })` path.

## 9. Audit (BR-40)

| Event | Org on the event | Metadata |
|---|---|---|
| `network_rules.published` | null | label, type, effective_at |
| `network_rules.org_accepted`, `.member_accepted` | the org | label, locale, sha256 |
| `conduct_report.filed` | reporting org | `{}` (entity = case id) |
| `conduct.info_requested`, `conduct.reporter_replied`, `conduct.closed_at_triage`, `conduct.admin_category_set`, `conduct.opened_by_admin`, `conduct_evidence.accessed` | null | ids / codes only |
| `conduct.notice_sent`, `conduct.followup_sent`, `conduct.response_submitted`, `conduct.followup_answered`, `conduct.decided`, `sanction.applied`, `sanction.immediate_hold`, `sanction.lifted`, `sanction.review_requested`, `sanction.reviewed`, `settlement_mode.entered`/`.exited` | reported org | ids, outcome, level, ground; never reporter user/org, report text or category; lift reasons only in the org-null copy |
| `conduct.incident_notice_sent` | each recipient org (+ an org-null admin copy) | notice id, referral ids |
| `referral.closed_stale_by_admin` | both referral orgs (+ org-null copy with reason) | from status |
| `membership.deactivated` | the org | `{settlement_mode: true}` |

`audit_select`: `org_admin` reads everything of its org; `recruiter_manager` no longer reads `conduct_report.*`, `conduct.*`, `sanction.*`, `settlement_mode.*` (AC-149).

## 10. Tests and how each area is covered

Integration (`tests/integration/`, local stack): `network-rules-versions.test.ts` (12), `network-rules-gate.test.ts` (11, incl. the generated catalog checks), `network-rules-restriction.test.ts` (9), `network-rules-conduct.test.ts` (28), `network-rules-settlement.test.ts` (11); shared fixtures `n10-helpers.ts`. Unit: `src/features/network-rules/__tests__/domain.test.ts` (16: hashing incl. CRLF and the seed fingerprints, markers, publish-copy procedure, locales, categories, ladder, schemas). Test helpers: `createUser` records a personal acceptance of the current version unless `{ acceptRules: false }`; `createOrg` accepts for the org and personally; `tests/e2e/support.ts` and `scripts/seed-demo.mts` do the same.

AC coverage server-side (by test file): A (AC-1–9, 11) versions; B (AC-15, 16, 19, 21, 22, 27–30, 36, 143, 144) versions + gate + settlement; C (AC-37–51, 117, 137, 138) restriction + versions; D (AC-53, 54, 57, 58, 60–64, 66–75, 77, 113, 126, 128–130, 145, 147) conduct; E (AC-79–95, 141, 142, 146, 150) conduct; F (AC-98–108, 110, 135, 136, 151 (scope part)) settlement; G (AC-112–114) conduct; H (AC-115 via api-surface, AC-116) all; AC-149 conduct; AC-89 gate (`set_organization_suspension` absent). UI-only ACs (layout, a11y, copy, AC-10/12/13/14/17/18/20/23–26/31–35 rendering, AC-52/55/56/59/65/76/78/96/97/109/111/118–125/127/131 rendering, AC-139 page merge, AC-140 pill) are frontend's; their server data is in place.

## 11. Known gaps and notes for frontend / QA / PM

1. **Parallel N3 work.** N3's migrations (`20261117000100`+, another session) run after N10 and build on it: they keep `app.job_partner_visible = job_partner_open ∧ no restriction` (adding the client-key test), attach the gate to `public.hire_records` and its app tables, and replace `record_candidate_request_delivery` with a service-role version that keeps the settlement-mode check. The generated gate test flagged N3's tables while they were still ungated and passes now. Any later feature adding a table must call `app.attach_rules_gate`.
2. **No scheduler notifications.** `network_rules.effective_not_accepted` (AC-32) and `network_rules.reminder` (Should) need a time trigger; the restriction itself is computed lazily (no cron needed), but nothing fires at the effective date. Follow-up: a worker maintenance step that detects versions that became effective since the last run.
3. **`settlement_mode.exited` for "terminated and settled"** isn't written (the end is computed lazily when the last obligation closes; no event). Entered/exited are written for apply/lift.
4. **"Refund due"** isn't derivable from the current data; the obligations list tags `guarantee`, `payout_not_confirmed`, `open_dispute`.
5. **Hosted rollout:** with no published version the gate and `rules_not_accepted` are inert, but `create_organization` refuses (spec §2.1). Publish v1 in the same release window as `supabase db push`, or onboarding is blocked. Every existing user then meets the gate (R-9, expected).
6. **Bilingual notices (Should, C-5)** not built: one language per notice. Overdue-hold flag (Should) is computed (`decision_overdue`); planned-review reminder and metrics card (Should) not built.
7. **Guidance and outcome lines** are stored as copied text (⚖️ drafts from spec §5.8/§5.9) in `app.notice_outcomes_line` / `app.incident_guidance_line`. If counsel changes them, update those functions in a new migration (sent notices keep their stored text).
8. **Statement-level gate:** a gated user's zero-row write is refused too; reads are never affected. Platform admins are exempt in the DB even when acting as members (the Server Action check still gates them in the workspace).
9. **Pages still `notFound()` for settlement orgs** until the frontend passes `allowSettlement: true` (default deny preserved; nothing leaks in the meantime).
10. **Job reports** require the reporting org to be unrestricted (a restricted org has no partner opportunities, so it has no visible partner job). Referral reports work in any state.
11. **Internal referrals** (related orgs) return `report_self` on a direct call (Q-D7).
12. **`candidate-confirmation-integrity-qa.test.ts`**: the pre-N10 assertion "a suspended source org can neither rotate nor issue a token" was superseded by BR-13/BR-34.1 (resend continues in settlement mode). The test now asserts the resend works and a deactivated member is still refused.
