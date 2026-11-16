# Architecture

## Stack
| Concern | Choice | Notes |
|---|---|---|
| Web | Next.js 16 App Router, React 19, strict TypeScript | Server Components + Server Actions; `src/proxy.ts` refreshes sessions (optimistic only) |
| UI | Tailwind v4, shadcn/ui (new-york, Radix primitives), Lucide | Tokens in `src/app/globals.css`, light/dark |
| Data | Supabase Postgres 17, Supabase Auth, private Supabase Storage | Migrations in `supabase/migrations` |
| Validation | Zod at every trust boundary | Forms, actions, CSV rows, matching inputs |
| Jobs | Postgres-backed queue (`background_jobs`, `FOR UPDATE SKIP LOCKED`) + `npm run worker` | Retries with exponential backoff, dead-lettering, lock recovery |
| Tests | Vitest (unit + integration against real local Supabase) | Playwright E2E planned (see implementation plan) |

## Modular monolith
```
src/
  app/                 routes only (thin); /workspace/[orgSlug]/… workspace, /admin platform area
  components/          ui (shadcn), layout, shared
  features/<domain>/   schemas · actions (server) · queries (server) · domain (pure) · components (client) · infrastructure
  server/              env, auth/context, authorization, supabase clients, queue, integrations
  lib/                 money, labels, validation, actions
supabase/migrations/   schema, RLS, RPCs (use cases)
tests/integration/     RLS / IDOR / journey tests
```

## Request flow & tenant context
1. `getRequestContext(orgSlug)` (`src/server/auth/context.ts`) validates the session with Supabase Auth and resolves the organization **from an active membership**, never from client input.
2. Actions call `assertCan(ctx, permission)` (role → permission map in `src/server/authorization/permissions.ts`).
3. All reads/writes use the **user-scoped** Supabase client, so Postgres RLS (`app.is_member`, `app.has_role`) applies as defense in depth.
4. Multi-step or cross-tenant use cases are **SECURITY DEFINER RPCs** that re-check membership/side and run in one transaction: `submit_referral`, `transition_referral`, `report_hire`, `record_payment_evidence`, `review_payment_evidence`, etc.

## Cross-organization matching
- `matches` has RLS enabled and **no policies**. Users never read it.
- The worker (`src/server/queue/worker.ts`) runs `features/matching/infrastructure/matching-service.ts` with the service-role client, using the pure engine in `features/matching/domain/engine.ts`.
- Users read only role-scoped projections: `get_opportunities` (candidate owner: job fields filtered by the job owner's visibility settings) and `get_job_match_summary` (job owner: counts only).
- DB triggers enqueue recomputation on relevant candidate/job/consent changes and **synchronously expire** matches when a job closes or a candidate becomes unavailable.

## Service-role usage (restricted)
Lint rule blocks importing `@/server/supabase/admin` from UI/pages. Allowed: matching service, queue handlers, signing referral-document URLs after `authorize_referral_document`, physical deletion after an RLS-verified soft delete.

Duplicate and prior-presentation protection (N1, `docs/specs/duplicate-prior-presentation/backend.md`) adds these, and only these:
- **Worker, evidence scan** (`src/server/queue/handlers/claim-evidence.ts`, job `claim_evidence.scan`): reads the stored object from the private `claim-evidence` bucket, checks its signature, computes the SHA-256 and records it once through `record_claim_evidence_scan` (service-role-only RPC). The hash never comes from the app or the browser.
- **Signing evidence URLs** (60 s): `getClaimEvidenceUrl` (claiming org) and `getAdminClaimEvidenceUrl` (platform admin, disputed claims only), each **after** `authorize_claim_evidence` succeeded and audited the access.
- **Deleting evidence objects**: `removeClaimEvidence` after `remove_claim_evidence` verified the caller's side; `uploadClaimEvidence` removing its own just-uploaded object when registration fails; the worker deleting orphans returned by `purge_orphan_claim_files`.
- **Maintenance on the worker timer** (every 10 min, `runMaintenance`): `finalize_due_claims`, `purge_presentation_data`, `purge_orphan_claim_files` / `forget_claim_files` (`purge_presentation_data` also prunes N9's `app.candidate_email_changes` older than 60 days). Correctness never depends on it (finality is evaluated lazily).
- **Key rotation**: `rotate_fingerprint_key()` is service-role only and run by an operator on suspected compromise; it is never called by the app.

Candidate-confirmation integrity (N9, `docs/specs/candidate-confirmation-integrity/backend.md`) adds one:
- **Issuing the candidate token** (`src/features/referrals/candidate-request.ts`, `emailCandidateRequest`): calls `issue_candidate_request_token(p_referral, p_actor)` (service-role-only RPC, refuses user JWTs) **only after** the user-session `submit_referral_for_candidate` or `rotate_candidate_request_token` succeeded, with `p_actor = ctx.user.id` from the session. The RPC re-checks membership, status and "no live token". The returned raw token goes only into the candidate email's URL: never returned from the action, logged, or stored.

Referral-level claims and two-sided hire reporting (N3 drop 1, `docs/specs/referral-claims-two-sided-hire/backend.md`) adds these:
- **Recording candidate-request delivery** (same function, BR-2): `record_candidate_request_delivery(p_referral, p_actor, p_ok, p_error)` is service-role only (refuses user JWTs) and runs right after the email send, with `p_actor = ctx.user.id`. The RPC re-checks the actor's source-side membership and record scope. No member can set or change "sent" by a direct call.
- **Maintenance on the worker timer**: `run_hire_maintenance()` (service-role only) notifies the hiring side once when a fee-pending placement's fee details are overdue (BR-31). Drop 2 adds the hire-report clocks.
- **Hire-report evidence** (N3 drop 2, same rules as N1 claim evidence): the worker job `hire_evidence.scan` (`src/server/queue/handlers/hire-evidence.ts`) downloads from the private `hire-evidence` bucket, computes the SHA-256 and records it once via `record_hire_evidence_scan` (service-role-only RPC). `getHireEvidenceUrl` / `getAdminHireEvidenceUrl` sign 60-second URLs only **after** `authorize_hire_evidence` audited the access. `removeHireEvidence` deletes an object after `remove_hire_evidence` verified ownership; the maintenance timer deletes orphans returned by `purge_orphan_hire_files`.
- **Platform settings** (`app.platform_settings`, e.g. `deemed_agreement_enabled`): closed table, no grants; changed only by an operator with a database role or the service role. Every change writes a platform audit event. The app never writes it.

Network Rules enforcement (N10, `docs/specs/network-rules-enforcement/backend.md`, EC-8) adds these, mirroring N1:
- **Worker, conduct evidence scan** (`src/server/queue/handlers/conduct-evidence.ts`, job `conduct_evidence.scan`): reads the stored object from the private `conduct-evidence` bucket, runs the same isolated scan as claim evidence, computes the SHA-256 and records it once through `record_conduct_evidence_scan` (service-role-only RPC).
- **Signing conduct evidence URLs** (60 s): `getAdminConductEvidenceUrl` (platform admin) **after** `authorize_conduct_evidence` succeeded and audited the access. No member read path exists.
- **Deleting conduct evidence objects**: `removeConductDraftFile` after `remove_conduct_draft_file` verified ownership; the upload actions removing their own just-uploaded object when registration fails; the worker deleting drafts returned by `purge_orphan_conduct_files` (maintenance timer).
Acceptances, sanctions, settlement mode and rules publishing are user-session `SECURITY DEFINER` RPCs; the matching re-queue on a lift is an in-database `app.enqueue`. No other service-role use.

## Network Rules gate and settlement mode (N10)
- **First-access gate in the database:** a statement-level trigger (`zz_rules_gate`, `app.attach_rules_gate(regclass)`) on every writable table refuses writes by a signed-in user who never accepted a rules version (`rules_acceptance_required`); it fires inside `SECURITY DEFINER` RPCs too, so every writing RPC is gated without per-RPC code. **Every new table must call `app.attach_rules_gate`** (a generated test fails otherwise). `getRequestContext` refuses Server Actions early; pages render the gate from `ctx.rules.gateRequired`.
- **Settlement mode:** suspended and terminated orgs keep in-flight work through a "settling member" branch in `app.user_sees_referral_as_source/_target` and a few named spots; `app.is_member` is unchanged, so everything else stays closed. `getRequestContext(slug, { allowSettlement: true })` is the opt-in for BR-34 surfaces; without it a settlement org is not-found (pages) or `settlement_mode_unavailable` (actions).
- **One restriction predicate:** `app.org_partner_restriction(org)` feeds `app.job_partner_visible` (with `app.job_partner_open` for job-level conditions), submits (BEFORE INSERT trigger on `referrals`) and matching reads. Delivery uses `job_partner_open` only.

The fingerprint HMAC key itself is never read by any client, service-role included: it lives in Supabase Vault and only `SECURITY DEFINER` functions in the non-exposed `app` schema use it.

## Local development
`supabase start` (ports 553xx, see `supabase/config.toml`), `npm run dev` (web + worker). Deploy web to Vercel; run the worker as a long-lived process (Fly/Render/Railway) or replace the poller with Supabase Cron/Queues (adapter boundary: `runOnce`).
