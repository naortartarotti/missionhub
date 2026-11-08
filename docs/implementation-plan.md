# Implementation plan & status

| Phase | Status | Notes |
|---|---|---|
| 0 Plan & docs | ✅ | This folder + ADRs |
| 1 Foundation | ✅ | Auth, orgs, invitations, tenant context, RBAC, shell, candidate & job CRUD, CSV import |
| 2 Matching | ✅ | Deterministic engine, durable queue, opportunities, counts, explanations, document scan pipeline |
| 3 Referrals | ✅ | Snapshots, document grants, state machine, messages, notifications, revocation |
| 4 Finance | ✅ | Versioned rules, frozen agreements, placements, invoices, evidence, four-eyes, ledger, disputes, admin queue |
| 5 Hardening | 🟡 | Remaining below |

## Remaining / next
- ✅ Playwright E2E of Journey A through the UI, including four-eyes payment verification and settlement (`tests/e2e`). Journey B (revocation/expiry) is covered at the integration layer.
- ✅ CI workflow (`.github/workflows/ci.yml`): lint, typecheck, unit, `supabase start` + type-drift check + integration, Playwright (build + start + worker).
- Hosted Supabase project: link + `supabase db push`; Canadian region.
- Email adapter (Resend/Postmark) behind `EMAIL_PROVIDER`; AI adapters (resume extraction, embeddings + pgvector) behind `AI_PROVIDER` with Zod-validated outputs.
- Real malware scanning; app-level rate limiting; candidate experience editor; notification preferences UI; i18n extraction (fr-CA, pt-BR); TanStack Table for very large lists.
