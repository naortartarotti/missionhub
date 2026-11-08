# Domain model

All money is integer minor units + ISO currency. All tenant rows carry `organization_id`; it is immutable (trigger).

| Area | Tables | Key rules |
|---|---|---|
| Identity & tenancy | `profiles`, `organizations`, `organization_memberships`, `organization_invitations` | Tokens stored hashed; users can't self-promote to platform admin |
| Candidates | `candidates`, `candidate_experiences`, `candidate_documents`, `candidate_consents`, `privacy_requests` | Statuses `draft → active_for_matching → unavailable/archived → deleted (anonymized)`; consents are append-only (revocation only) |
| Jobs | `jobs` | Statuses `draft/active/paused/closed/filled/cancelled`; per-field pre-referral visibility (`share_*`), confidential client |
| Matching | `matches`, `match_feedback`, `background_jobs` | Internal only; `model_version`, `input_hash`, evidence arrays |
| Referrals | `referrals`, `referral_candidate_links` (source-only), `referral_shared_profiles` (immutable snapshot), `referral_document_grants`/`_sources`, `referral_status_events` (immutable), `referral_messages` (immutable), `referral_transitions` (state machine as data) | One live referral per candidate×job; idempotency key; optimistic concurrency (`version`) |
| Finance | `commission_rules` (versioned), `collaboration_agreements` (frozen snapshot), `placements`, `placement_status_events`, `invoice_records`, `payment_evidence`, `commission_ledger_entries` (immutable), `disputes` | Four-eyes verification; ledger is the source of truth for balances |
| Audit & notifications | `audit_events` (immutable, PII-free metadata), `notifications`, `notification_preferences` | |

## Referral state machine
`submitted → under_review | accepted | declined | info_requested | withdrawn`
`info_requested → under_review (source responds) | declined | withdrawn`
`accepted → interviewing* | withdrawn | cancelled` · `interviewing → offer* | rejected | withdrawn | cancelled` · `offer → hired (report_hire only) | rejected | withdrawn | cancelled`
`*` requires an **active** collaboration agreement (created on accept from the default rule, confirmed by the sourcing recruiter).

## Placement & ledger
`hire_reported → invoiced → payment_partially_verified | commission_payable → settled`, any → `disputed` (frozen) → previous status on resolution.
Verified client payment writes: `client:+distributable`, `sourcing/job_owner/platform: allocation` via `app.allocate_minor` (largest remainder, ties to earlier share; mirrored by `src/lib/money/allocate.ts`). Refunds write negative reversals. Payouts/remittances reduce outstanding balances and cannot exceed them. Settled when sourcing and platform balances reach zero.
