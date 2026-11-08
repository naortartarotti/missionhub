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
  app/                 routes only (thin); /w/[orgSlug]/… workspace, /admin platform area
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

## Local development
`supabase start` (ports 553xx, see `supabase/config.toml`), `npm run dev` (web + worker). Deploy web to Vercel; run the worker as a long-lived process (Fly/Render/Railway) or replace the poller with Supabase Cron/Queues (adapter boundary: `runOnce`).
