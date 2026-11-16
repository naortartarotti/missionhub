# Domain model

All money is integer minor units + ISO currency. All tenant rows carry `organization_id`; it is immutable (trigger).

| Area | Tables | Key rules |
|---|---|---|
| Identity & tenancy | `profiles`, `organizations`, `organization_memberships`, `organization_invitations` | Tokens stored hashed; users can't self-promote to platform admin |
| Candidates | `candidates`, `candidate_experiences`, `candidate_documents`, `candidate_consents`, `privacy_requests` | Statuses `draft → active_for_matching → unavailable/archived → deleted (anonymized)`; consents are append-only (revocation only) |
| Jobs | `jobs`, `job_terms_versions` (immutable, N2) | Statuses `draft/active/paused/closed/filled/cancelled`; per-field pre-referral visibility (`share_*`; `share_fee` retired for partners by N2), confidential client; opening to partners needs a terms card (see N2 below) |
| Matching | `matches`, `match_feedback`, `background_jobs` | Internal only; `model_version`, `input_hash`, evidence arrays |
| Referrals | `referrals`, `referral_candidate_links` (source-only), `referral_shared_profiles` (immutable snapshot), `referral_document_grants`/`_sources`, `referral_status_events` (immutable), `referral_messages` (immutable), `referral_transitions` (state machine as data) | One live referral per candidate×job; idempotency key; optimistic concurrency (`version`) |
| Finance | `commission_rules` (versioned, `platform_basis`), `collaboration_agreements` (frozen snapshot), `placements` (C, I, base, bonus, difference reason; immutable fee facts), `placement_status_events`, `invoice_records`, `payment_evidence`, `commission_ledger_entries` (immutable), `disputes` | Four-eyes verification; ledger is the source of truth for balances |
| Audit & notifications | `audit_events` (immutable, PII-free metadata), `notifications`, `notification_preferences` | |

## Record ownership inside an agency (RD-036)
`candidates.owner_id` and `jobs.owner_id` (always an active member, trigger-checked) decide who sees what for a plain `recruiter`: their own candidates and the referrals, matches and placements built on them (sourcing side), and the referrals and placements on jobs they own (hiring side). Jobs themselves are readable by the whole agency. `org_admin` and `recruiter_manager` see everything in the agency. Ownership moves only through a manager edit or `transfer_member_portfolio` (org admin).

## Duplicate and prior-presentation protection (N1)
| Area | Tables | Key rules |
|---|---|---|
| Presentation | `referrals.delivered_at` (only delivery test), `claim_deadline_at` (frozen, 5 business days), `claim_rejected_at`, `review_clock_started_at`; closed `app.referral_presentations` (client-key snapshot, release flag, `void_reason`), `app.referral_fingerprints`, `app.job_client_keys`, `app.sticky_stops`, `app.presentation_hits` | A referral **counts** (BR-4) when delivered, inside its ownership window, not released, not closed as already presented and without an upheld / final (incl. lazily final) claim. Check scope: same job, or same hiring org + same client key; never across hiring orgs |
| Claims | closed `app.referral_claims` (one per referral, ever), `app.referral_claim_files` (frozen SHA-256 + upload time) | Status `open → contested → upheld / rejected`, or `open → final` at `contest_deadline_at` (10 business days, frozen) |
| Disputes | `disputes.kind` = `placement` \| `prior_presentation` (+ `referral_id`, `claim_id`, `outcome`) | One open dispute per placement and per referral |
| Calendar | `app.network_holidays` (ON ∪ QC, 2026–2028) | `app.add_business_days`: event day excluded, deadline 23:59:59 America/Toronto |

Decline reasons: `duplicate` is legacy only (no RPC accepts it); `prior_presentation` is set only by filing a claim.

## Job terms card and snapshot (N2)
Spec: `docs/specs/job-terms-card/` (brief BR-1 to BR-38, `backend.md` v2.4). Amounts in minor units are bounded at 10^12 everywhere below.

| Area | Tables | Key rules |
|---|---|---|
| Terms card | `job_terms_versions` (`kind = job`) | T1–T9: fee basis (`pct_base` · `pct_total_cash` · `flat`), rate 1–50 % (bps) or flat amount, optional minimum (% bases), currency (% = the job's salary currency; flat ∈ CAD, USD, EUR, GBP, BRL), search type, direct-client attestation (user + time, per version), guarantee 0/30/60/90/120/180 days + remedy (none when 0), net payment days 0–90, ownership window 6–12 months. **Insert-only for every role** (trigger), complete by constraint, numbered per job. Written only by `save_job_terms`; a save with no T1–T9 change creates no version. The newest version is the job's current terms |
| Partner visibility | `jobs.accepts_external_referrals` + `app.job_partner_visible(job)` | Partner-visible = active ∧ open ∧ `permanent` ∧ owner org not suspended ∧ a current version ∧ (on % bases) version currency = the job's salary currency. One predicate for opportunities, triage, both submit RPCs and snapshot-referral delivery. Opening a job (flag false → true) is possible only inside `save_job_terms` (trigger, every role) |
| Snapshot at commit | `referrals.terms_version_id`, `commission_rule_id`, `fee_estimate_minor`; closed `app.referral_commit_keys` | Written in the same transaction as the referral insert (both submit RPCs), after checking the submitter saw the job's current version (`terms_changed` otherwise). Insert-only. `fee_estimate_minor` is the estimate the submitter was shown (> 0 and ≤ 10^12 minor units, or null when the salary band was private or absent, when the estimate is 0 or above 10^12, or when the computation fails; `app.terms_estimate` returns NULL outside (0, 10^12] and the row is never refused for it). The client key at commit stays in the closed table. Referrals without a snapshot are **legacy** ("terms not recorded") and keep pre-N2 behaviour |
| Amendments | `job_terms_versions` (`kind = amendment`, `referral_id`, `amends_version_id`); closed `app.terms_amendment_notes` | Platform admin only, **before a hire is reported**, in any referral status, on referrals with a snapshot, at both orgs' written request (two references + reason, admin-only). Never changes the split, the rule or the client key; never moves the ownership date or claim deadlines; a T9 change is refused once delivered. % currency: unchanged on % → %; flat → % takes the job's current salary currency (refused without one). The latest amendment is the referral's **effective terms**; the agreement is repointed to it |
| Ownership window | `referrals.ownership_protected_until` (nullable) | Set **only at delivery** (`app.deliver_referral`): delivery + effective T9 months (6–12, calendar months in America/Toronto, end-of-month clamped), or + 12 months for legacy referrals. Null until delivered. The N1 look-back for prior-presentation claims uses the same window (legacy: 6 months) |

**Fees at hire (BR-21 to BR-26).** `report_hire` for a snapshot referral takes the effective terms version the dialog showed (`hire_terms_changed` if an amendment moved it). It computes **C** (`app.compute_fee`): `pct_base` = round half-up(rate × first-year base); `pct_total_cash` = rate × (base + target bonus); at least the minimum fee; `flat` = the frozen amount. Currency and guarantee come from the terms. The **invoiced fee I** defaults to C. A different I needs one of `client_discount`, `client_contract_rate`, `client_invoiced_other_currency`, `invoice_correction`, `other` (+ note), and must satisfy ceil(C/100) ≤ I ≤ 100 × C. `placements.contracted_fee_minor` is I; `computed_fee_minor` is C (null for legacy placements, which keep free entry).

## Hire records (N3 drop 1)
Spec: `docs/specs/referral-claims-two-sided-hire/backend.md` (v1).

| Concept | Where | Rule |
|---|---|---|
| Hire record | `public.hire_records` (one per referral) | Every recorded hire: a **placement**, or a hire **recorded without a split** (released referral, BR-11; or no confirmed agreement while `deemed_agreement_enabled` is off, BR-9). Keeps the previous status, the acceptance date (null = unknown), start date and "another role at this client" title. Insert-only; both sides read it (record scope) |
| Hire eligibility (BR-4) | `app.hire_eligibility` | Delivered (except the `offer` + active agreement happy path), not `already_presented`, no upheld/final objection, not void, no hire record yet; in progress, or closed and now ≤ window end + 9 months (legacy: delivery + 12 + 9). Released → record without a split only. Refused while the hiring side's own objection is open or contested (BR-45) |
| Deemed agreement (BR-9) | `collaboration_agreements.origin = 'deemed'` | Behind the closed flag `app.platform_settings.deemed_agreement_enabled` (false everywhere by default): a hire on a referral with no confirmed agreement creates (or activates the pending) agreement from the frozen snapshot rule; legacy referrals use the default rule in force at submission; internal referrals keep 0 sourcing bps |
| Late marker (BR-13) | `app.hire_record_admin.late` (admin-only) | A record more than 5 business days after the start date or the stated acceptance date; never within 5 business days after the hiring side's own objection was rejected; never on deemed or upheld hires |
| Fee-pending placement (BR-31) | `placements.status = 'fee_pending'`, `established_how`, `fee_details_due_at` | Created only for an upheld or deemed hire report (drop 2): no fee, start date or (legacy) currency until the hiring side enters the fee details (`complete_fee_details`); no invoice, evidence or allocation before that (`placement_fee_pending`) |
| Invoice clock (BR-14) | `placements.invoice_due_at` | Start date + 10 business days, stored when the fee is known |

`awaiting_candidate → submitted (candidate confirms) | already_presented (N1 delivery re-check; closed, hidden from the hiring side) | candidate_declined | withdrawn`
`submitted → under_review | accepted | declined | info_requested | withdrawn`
`declined (prior_presentation) → submitted` only when a platform admin rejects the claim (outside the transitions table)
`info_requested → under_review (source responds) | declined | withdrawn`
`accepted → interviewing* | withdrawn | cancelled` · `interviewing → offer* | rejected | withdrawn | cancelled` · `offer → hired (report_hire only) | rejected | withdrawn | cancelled`
`any hire-eligible status → hired` through `report_hire` only (N3 BR-7: `submitted` … `offer`, and `declined`, `withdrawn`, `rejected`, `cancelled` inside window end + 9 months); the job owner or a manager of B records it, whoever accepted the referral. `transition_referral` is unchanged
`*` requires an **active** collaboration agreement (created on accept from the referral's **snapshot rule**, the default rule at commit, or the current default rule for legacy referrals; confirmed by the sourcing recruiter).

## Hire reports and authorization checks (N3 drop 2)
| Concept | Where | Rule |
|---|---|---|
| Hire report | `app.hire_reports` (closed; side-shaped reads via `get_hire_reports`) | Filed by the sourcing side on a hire-eligible, delivered, unreleased referral, until window end + 6 months (+ 9 with the tail statement and a backing item). One pending report per referral; none after two rejections; a second needs an item dated after the first rejection. Per org: 3 pending, 10 per 90 days. Statuses: `awaiting_answer → contested → in_review → upheld / rejected`; `awaiting_answer → unanswered → upheld / rejected`; `awaiting_answer → deemed_confirmed` (delivery gate, N7); any pending → `confirmed` (B's Confirm) / `closed_by_record` (B's record) / `void` (RD-029) |
| Evidence | `app.hire_report_items`, `app.hire_evidence_files` (bucket `hire-evidence`) | Links and files: the uploader's org and platform admins only; the counterpart sees types, dates and SHA-256 |
| Contest | `disputes.kind = 'hire_report'` + the report's contest fields | One of four reasons; `outside_window` needs both dates. One open dispute per referral. The `not_this_client` statement is admin-only |
| Delivery records | `app.email_deliveries` (N7 writes) | Silence gate: delivered and never bounced for the job owner and another admin/manager of B, B not suspended, the job owner active |
| Authorization check | `app.auth_check_requests`, `app.authorization_checks` | Admin-opened; a 5-business-day evidence request when there's a recent-change note or challenger evidence. Invalid → `void_reason = 'authorization_void'`, consent `disputed_at`, breach-review flag, pending report void |

## Network Rules, conduct cases and sanctions (N10)
Spec: `docs/specs/network-rules-enforcement/` (brief BR-1 to BR-44, `backend.md`).
| Area | Tables | Key rules |
|---|---|---|
| Rules versions | `network_rules_versions` (label, type `initial`/`material`/`non_material`/`legally_required`, status, `effective_at` 00:00 ET, approval reference, `rule_numbers`), `network_rules_version_texts` (per locale: body, change summary, SHA-256, rules, sections) | Published = immutable. Current = latest effective; at most one upcoming; material ≥ 30 days' notice. Non-material versions never re-open acceptance |
| Acceptances | `network_rules_org_acceptances` (org × version, by an `org_admin`), `network_rules_member_acceptances` (user × version, valid in every org) | Append-only; locale + SHA-256 stored. Org creation records both. A user with none can't write (first-access gate) |
| Org state | `organizations.suspended_at`, `terminated_at` (new; termination also sets `suspended_at`) | Restriction predicate `app.org_partner_restriction`: `terminated` > `suspended` > `network_hold` > `rules_not_accepted` (> N5 `network_pending`). Settlement state: active · `settlement` (suspended, or terminated with an open obligation) · `closed` (terminated and settled) |
| Conduct cases | closed `app.conduct_cases` (reporter org/user, reported org, referral/job, category + admin category, status `new`/`info_requested`/`notice_sent`/`decided`/`closed`, frozen first-response target), `app.conduct_messages`, `app.conduct_notices` (version + rules cited, fixed outcomes line, frozen 10-business-day deadline), `app.conduct_responses` (one per notice), `app.conduct_followups`, `app.conduct_decisions` (one per case, frozen review deadline), `app.conduct_files`, `app.conduct_incident_notices` / `_recipients` | No `public.disputes` row. Reporter outcome: action taken · no breach · not enough evidence · closed without a finding |
| Sanctions | closed `app.org_sanctions` (warning 12 months · network hold · suspension · termination; immediate-hold ground 2.3/4.8; ended as lifted/reduced/overturned/superseded), `app.sanction_reviews` (one per decision) | Sanctions only through the ladder RPCs; effects on `organizations` maintained by them. Overturned entries and error-corrected terminations don't count under 9.2 |

**Open obligation** (BR-37): a non-terminal referral; a placement not settled or cancelled; a settled placement still inside its guarantee; an open dispute or claim on either. Settlement mode shows only referrals with an open obligation.

## Placement & ledger
`fee_pending → hire_reported` (N3, fee details entered) `→ invoiced → payment_partially_verified | commission_payable → settled`, any → `disputed` (frozen) → previous status on resolution.
Verified client payment writes: `client:+distributable`, `sourcing/job_owner/platform: allocation` via `app.allocate_placement` (mirrored by `allocatePlacement` in `src/lib/money/allocate.ts`, parity-tested). Refunds write negative reversals. Net amounts above 10^12 minor units are refused (`invalid_fee`).
- **Legacy placement, or I ≥ C:** `app.allocate_minor` exactly (largest remainder, ties to earlier share; exact numeric).
- **I < C (N2, BR-27):** the partner's share is **floored by the terms**: sourcing = sourcing bps × C × P / I. The platform share follows the agreement's frozen `platform_basis`: `collected` (shipped, PD-049) = 10 % of the fee **actually received** P; `frozen` (built, unused) = 10 % × C × P / I. The job owner takes the remainder, which can be negative (B funds the partner's share of a discount). Rounding is half-up per payment on |P|. Payouts/remittances reduce outstanding balances and cannot exceed them. Settled when sourcing and platform balances reach zero.
