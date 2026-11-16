# Backend: recruiter record scope (RD-036)

Owner: Backend Engineer · Date: 2026-11-15 · Decision: [RD-036](../../strategy/decisions.md) (founder, 2026-11-15)

Status: built and green locally. **Not pushed to the hosted project.** There is no `brief.md` / `spec.md` for this change: the rules below come from the founder decision as relayed in the task. Product questions are listed in §8.

## 1. Rule

| Role | Sees |
|---|---|
| `org_admin`, `recruiter_manager` | The whole agency (`app.sees_all(org)`), as before. |
| `recruiter` | Only their own records. |

For a `recruiter`:

| Records | Visible / writable when |
|---|---|
| `candidates` | `owner_id = auth.uid()` (read, insert, update). They can't create a candidate owned by a colleague or change `owner_id` to a colleague. |
| `candidate_experiences`, `candidate_documents`, `candidate_consents`, `referral_candidate_links`, `referral_candidate_requests`, `external_refs` (candidate rows), storage `candidate-documents` / `candidate-photos` | The candidate is visible (`app.can_access_candidate`). |
| `jobs` | Read: every member. Insert / update: owner or manager. |
| `referrals`, sourcing side | The caller owns the referral's candidate (`app.sees_referral_as_source`). |
| `referrals`, hiring side | The caller owns the target job, and the referral isn't hidden from the target (`app.sees_referral_as_target`). |
| `referral_messages`, `referral_status_events`, `referral_document_grants`, `collaboration_agreements` | `app.can_see_referral` (either side). |
| `referral_shared_profiles` | Sourcing side, or hiring side while sharing isn't revoked (`app.can_see_shared_profile`). |
| `referral_document_sources` | Sourcing side (`app.sees_grant_as_source`). |
| `placements`, `placement_status_events`, `commission_ledger_entries`, `invoice_records`, `payment_evidence`, `disputes` (placement) | `app.can_see_placement` = the placement's referral is visible (or platform admin). |
| `disputes` (prior presentation) | Platform admin, or member of the opening org who can see the referral. |
| Matches / opportunities | Only the caller's own candidates (`get_opportunities`, `set_match_triage`, `mark_matches_seen`). |
| `notifications` | Already per user. Referral / placement notifications are now only created for members who can see the record. |

When the owner of a record leaves (membership suspended), the record keeps them as owner: only managers see it until an org admin runs `transfer_member_portfolio(org, from, to)` (unchanged RPC, org admin only).

## 2. Migration

`supabase/migrations/20261115000300_recruiter_record_scope.sql`. Applied locally with `supabase migration up --local` (not `db reset`, to keep the shared local data). No table, column or public RPC signature changed, so `database.types.ts` is unchanged (regenerated to a scratch file and diffed: identical). No new public RPC, so the allow-list in `tests/integration/api-surface.test.ts` is unchanged.

### New helpers (schema `app`, all `SECURITY DEFINER`, `stable`, `search_path = ''`)

| Function | Executable by | Meaning |
|---|---|---|
| `app.sees_all(org)` | authenticated (RLS) | Caller is an active `org_admin` / `recruiter_manager` of a non-suspended org. |
| `app.can_access_candidate(candidate)` | authenticated (RLS) | Caller is a member of the candidate's org and owns it or is a manager. |
| `app.sees_referral_as_source(referral)` | authenticated (RLS) | Member of the source org, and manager or owner of the linked candidate. |
| `app.sees_referral_as_target(referral)` | authenticated (RLS) | Member of the target org, referral not hidden from the target, and manager or owner of the job. |
| `app.can_manage_job(job)` | authenticated (RLS) | Member, and owner or manager. |
| `app.can_access_candidate_object(name)` | authenticated (storage RLS) | Path `{org}/{candidate}/{file}`, the candidate is in that org and accessible. Malformed paths → false. |
| `app.can_see_shared_profile(referral)`, `app.sees_grant_as_source(grant)` | authenticated (RLS) | See §1. |
| `app.user_is_member`, `app.user_sees_all`, `app.user_can_access_candidate`, `app.user_sees_referral_as_source`, `app.user_sees_referral_as_target` `(user, …)` | nobody (internal) | Same rules for an explicit user: used by the wrappers, notification fan-out and `issue_candidate_request_token`. |
| `app.notify_eligible(user, org, referral)` | nobody (internal) | Manager of `org`, or owner of the side's record (candidate on the source side, job on the target side). No hidden-status filter. |

### Policies replaced

`candidates_select/insert/update`, `candidate_experiences_all`, `candidate_documents_select/insert/update`, `candidate_consents_select/insert/update`, `external_refs_select`, `jobs_insert/update`, `referrals_select`, `referral_links_select`, `referral_candidate_requests_select`, `referral_doc_sources_select`, `referral_profiles_select`, `referral_messages_insert`, `placements_select`, `disputes_select`, and on `storage.objects`: `candidate_docs_select/insert`, `candidate_photos_select/insert/delete`. `jobs_select` is unchanged. Policies built on `app.can_see_referral` / `app.can_see_placement` (messages, events, grants, agreements, ledger, invoices, evidence, placement events) pick up the new rule through the redefined helpers.

## 3. SECURITY DEFINER audit

134 definer functions exist in `public` + `app` (the whole set was dumped from the local database after the latest migration and each one that touches candidates, referrals, matches, placements or their child tables was read).

### Changed (redefined with `create or replace`; only the access predicate changes, bodies otherwise identical to the live definitions)

| Function | Change |
|---|---|
| `app.can_see_referral` | Either side's new visibility. |
| `app.can_see_placement` | Via the placement's referral (platform admin unchanged). |
| `app.referral_side` | Side from the new visibility. |
| `app.acting_side` | The acting org's side only if the caller sees the referral on that side. |
| `app.source_referral` / `app.target_referral` | Used by `contest_prior_presentation_claim`, `register_claim_evidence`, `list_claim_evidence_files`, `remove_claim_evidence`, `list_claim_evidence_referrals`, `file_prior_presentation_claim`: these are covered without being redefined. |
| `app.assert_referable` | Candidate must be accessible → covers `submit_referral` and `submit_referral_for_candidate` (`forbidden`). |
| `app.assert_own_match` | Match's candidate must be accessible → covers `set_match_triage` (`not_found`). |
| `app.can_upload_claim_evidence` | Hiring-side visibility (storage insert policy on `claim-evidence`). |
| `app.evidence_referral_ok` | An earlier referral can be cited as prior-presentation evidence only if the caller sees it as the hiring side (§8 Q-1). |
| `app.notify_org` | Derives the referral from the link (`/referrals/{id}` or `/commissions/{placement}`) and inserts only for `notify_eligible` members. `p_only_user` falls back to all eligible members when that user isn't eligible (instead of nobody). Other link shapes keep the org-wide fan-out (no caller uses one today). |
| `app.notify_submitter` | Delegates to `notify_org` with the submitter as `p_only_user` (fallback: candidate owner + managers; previously org admins only). |
| `public.transition_referral` | "Member of both orgs" branch now needs visibility on both sides. Covers `review_referral`. |
| `public.decline_referrals` | Selects only referrals the caller sees as the hiring side. |
| `public.decline_pending_for_job` | `app.can_manage_job(job)` (was: any member). |
| `public.withdraw_referral`, `public.release_referral`, `public.confirm_agreement`, `public.rotate_candidate_request_token`, `public.record_candidate_request_delivery` | Sourcing-side visibility (was: source-org membership). |
| `public.report_hire` | Hiring-side visibility. |
| `public.get_referral_presentation` | Side from the new visibility. |
| `public.authorize_claim_evidence` | Acting-org path needs hiring-side visibility (platform-admin path unchanged). |
| `public.authorize_referral_document` | Either side's visibility. |
| `public.audit_document_access` | Candidate must be accessible (gate before the signed URL for candidate documents). |
| `public.issue_candidate_request_token` | The server-supplied actor must see the referral as the sourcing side (`app.user_sees_referral_as_source(p_actor, …)`). |
| `public.open_dispute` | Disputing side from the new visibility. |
| `public.record_invoice`, `public.record_payment_evidence` | Hiring-side visibility. |
| `public.review_payment_evidence` | Payout confirmation by whoever sees the referral as the sourcing side (was: any member of the source org). Platform-admin path unchanged. |
| `public.get_opportunities` | `c.owner_id = auth.uid() or app.sees_all(p_org)`. |
| `public.mark_matches_seen` | Only matches of accessible candidates. |
| `public.get_sent_referral_jobs` | Only referrals the caller sees as the sourcing side. |

### Deliberately left alone

| Function(s) | Reason |
|---|---|
| `app.presentation_check`, `app.submission_gate`, `app.record_presentation_outcome`, `app.write_fingerprints`, `app.candidate_fingerprints`, `app.presentation_counts`, `app.claim_blocker`, `app.release_allowed`, `app.apply_release`, `app.lock_hiring_org` | Duplicate and prior-presentation protection must stay org-wide (and cross-org). Called only after the caller's own access was checked; they return an outcome code, never a colleague's record. |
| `app.deliver_referral`, `app.create_agreement_for_referral`, `app.snapshot_referral_fit`, `app.build_shared_snapshot`, `app.referral_label`, `app.assert_documents_shareable`, `app.placement_transition`, `app.pipeline_owner`, `app.audit`, `app.enqueue`, `app.enforce_rate_limit`, `app.consume_rate_limit_for` | Internal steps, not executable by users, called only from RPCs that checked access first. |
| Triggers: `app.on_candidate_change`, `on_job_change`, `on_consent_change`, `on_document_insert`, `on_candidate_email_change`, `on_candidate_anonymized`, `on_sharing_consent_revoked`, `on_shared_profile_insert`, `on_claim_evidence_object`, `guard_*`, `enforce_pipeline_owner`, `set_referral_internal`, `sync_job_client_key`, `disputes_open_guard`, `claims_unique_guard`, `connections_drop_secret`, `handle_new_user` | Fire on writes that RLS / RPCs already authorized; they maintain derived data. Notifications they send go through the scoped `notify_org`. |
| `public.get_job_match_summary` | Anonymized counts only (no candidate identity), for an agency-visible job. |
| `public.anonymize_candidate`, `public.transfer_member_portfolio`, `public.create_invitation`, `public.request_connection_sync`, `public.connection_set_secret` | Already manager / org-admin only. |
| `public.get_candidate_request`, `public.respond_candidate_request` | Candidate token is the credential (anon). Their notifications go through the scoped `notify_org`. |
| `public.platform_metrics`, `presentation_admin_metrics`, `presentation_abuse_flags`, `get_referral_dispute`, `compare_dispute_contacts`, `resolve_dispute`, `resolve_prior_presentation_dispute`, `get_stop_by_reference`, `set_organization_suspension`, `publish_commission_rule`, `app.admin_referral_card` | Platform admin only. |
| `public.claim_background_jobs`, `complete_background_job`, `fail_background_job`, `enqueue_due_connector_syncs`, `finalize_due_claims`, `purge_presentation_data`, `purge_orphan_claim_files`, `forget_claim_files`, `claim_evidence_scan_target`, `record_claim_evidence_scan`, `mark_grant_copied`, `rotate_fingerprint_key`, `connection_get_secret`, `api_key_authenticate` | Service role / worker only. |
| `public.accept_invitation`, `create_organization`, `consume_rate_limit` | No candidate, referral or placement data. |
| `app.is_member`, `has_role`, `is_platform_admin`, `is_partner_org`, `shares_org_with`, `orgs_share_member`, `hidden_from_target`, business-day and fingerprint-key helpers | Membership / org-level predicates (partner org names, colleague profiles) — not record data. |

Service-role code paths in TypeScript (`src/server/api/v1.ts`, connector sync, ingest upsert, matching worker, queue handlers) are unchanged: they are org-level integrations or workers, not a user session (§8 Q-3).

## 4. Server code

| Symbol | File | Contract |
|---|---|---|
| `AGENCY_WIDE_ROLES`, `seesWholeAgency(role)` | `src/server/authorization/permissions.ts` | `["org_admin", "recruiter_manager"]`; mirrors `app.sees_all`. |
| `canSeeAgency(ctx)` | `src/server/auth/context.ts` | `ctx.membershipRole` is agency-wide. Use it to hide the candidates page `owner=team|mine` filter (and any "team" view) for plain recruiters. |
| `canEditJob(ctx, { owner_id })` | `src/server/auth/context.ts` | Owner or agency-wide role. Use it to hide Edit / status controls on jobs the caller can't change. |
| `countPendingReceivedReferrals(ctx): Promise<number>` | `src/features/referrals/queries.ts` | Head-only count of `referrals` with `target_org_id = ctx.organizationId` and status in `PENDING_BADGE_STATUSES` (`submitted`, `under_review`). Scoped by RLS: own jobs for a recruiter, whole org for managers. Returns 0 on error. Intended for the workspace layout badge (replaces the inline count there). |
| Opportunities badge (`countOpportunitiesToReview` / `fetchAll` in `src/features/matching/queries.ts`) | unchanged code | Per recruiter now, because `get_opportunities` filters by owner. |

No Server Action signature changed. No new i18n keys: denials reuse the existing codes (`forbidden`, `not_found`, RLS denials) and the existing messages (`jobs.errors.notFound` when a non-owner's job update affects 0 rows).

## 5. What Frontend must know

- **Plain recruiters now get empty / 404 results** for colleagues' candidates, referrals and placements (detail pages already `notFound()` on a null read). Nothing to handle beyond that.
- **Hide, don't fail:** use `canSeeAgency(ctx)` for the candidates `owner` filter and `canEditJob(ctx, job)` for job edit / status buttons. A non-owner's `updateJob` / `setJobStatus` returns `jobs.errors.notFound`.
- **Layout badge:** call `countPendingReceivedReferrals(ctx)` instead of the inline referrals count.
- **Counts that change meaning for a plain recruiter** (they are now "mine"): overview candidate counts, received / sent referral stats, placements and money, received queue tabs, `receivedJobs`, `listPipelineJobs` (jobs with *visible* referrals). **Still agency-wide:** job lists and the overview "open jobs" count (jobs stay visible).
- **Settings → Team** (`src/app/workspace/[orgSlug]/settings/team/page.tsx`) counts each member's candidates through RLS: for a plain recruiter every colleague now shows 0 candidates. Show those counts only when `canSeeAgency(ctx)` (jobs counts stay correct).
- The candidates page `othersOwned` count (`neq("owner_id", userId)`) is 0 for plain recruiters, which is consistent with hiding the filter.

## 6. Tests

- `tests/integration/recruiter-record-scope.test.ts` (new, 17 tests): candidates, child rows, storage, owner hand-off, forged owner on insert; jobs read vs. edit, `decline_pending_for_job`; opportunities, triage, mark-seen; submit by a colleague; sent and received visibility (rows, events, messages, shared profile, links, presentation RPC, withdraw, transition, bulk decline, sent-jobs RPC); badge count per role; notifications per role (received, status, hire); placements, agreements, invoices, evidence, disputes; owner suspended → managers only → portfolio transfer → new owner. Managers and admins positive on every surface. A mutation check (reverting `candidates_select` and `can_see_referral` to the old rule) makes 5 of them fail.
- `tests/integration/candidate-confirmation-integrity{,-qa}.test.ts`: the teammate `a2` who acts on `a`'s referrals is now a `recruiter_manager` (a plain recruiter can't any more, which the new file covers).
- `src/server/authorization/__tests__/agency-scope.test.ts` (unit): `seesWholeAgency`, `canSeeAgency`, `canEditJob`.

## 7. Commands

`npx tsc --noEmit` (0), `npx eslint` (0), `npx vitest run` (14 files / 108 tests), integration suite against the local stack (8 files / 219 tests, was 202 before; `.env.local` points at the hosted project, so the run overrides the URL and keys with the local stack's).

## 8. Open questions for the product manager

- **Q-1 Prior-presentation evidence from a colleague's job.** A recruiter filing a "we already had this person" claim can now cite only earlier referrals they can see (on their own jobs). Earlier referrals on a colleague's job for the same client are still blocked automatically at submission (org-wide check), but a manual claim citing them needs a manager. Confirm, or allow agency-wide citing (it would expose colleagues' referral labels to the recruiter).
- **Q-2 Departed owner.** Today: managers see the records, nobody else, until an admin transfers the portfolio. Should suspension trigger a prompt / automatic transfer to the agency admin? Referrals in flight on the hiring side keep the pipeline-owner rule (any member could move a referral whose accepter left), but a plain recruiter can't see it any more, so in practice a manager moves it.
- **Q-3 Public API keys** (`/api/v1`) are org-level and created by managers; they read / write the whole agency's candidates. Keep as an agency-level integration, or scope keys to their creator?
- **Q-4 Covering for a colleague.** A plain recruiter can't act on a colleague's referral (e.g. during leave). Managers can. Is a "delegate" or team concept needed later?
- **Q-5 `source_user_id`.** Sent-referral visibility follows the candidate's *current* owner, not the person who submitted. After a portfolio transfer, the submitter loses the referral. Intended?
