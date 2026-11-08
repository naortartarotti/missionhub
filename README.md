# MissionHub

A private, permission-based referral marketplace for recruiters. Recruiter A's private candidates are matched to recruiter B's open jobs. B sees only anonymized match counts until A submits a candidate with documented authorization. Accepted referrals run through a permission-aware workflow and end in an auditable 45/45/10 commission ledger (configurable and versioned).

> Product & engineering spec: see `docs/`. Legal templates and privacy notes are **drafts — legal review required**.

## Quick start (local, no external credentials)

Requirements: Node 22+, Docker, Supabase CLI.

```bash
npm install
npm run db:start          # local Supabase on ports 553xx (API http://127.0.0.1:55321, Studio :55323, Mailpit :55324)
cp .env.example .env.local   # paste the keys printed by `supabase start`
npm run db:reset          # apply migrations
npm run db:seed:demo      # optional: synthetic demo orgs (clearly labelled)
npm run dev               # web (http://localhost:3000) + background worker
```

Demo accounts (synthetic, local only) — password `Demo-password-2026`:
- `alex@agency-a.demo`: Agency A, owns candidates
- `blair@agency-b.demo`: Agency B, owns jobs
- `ops@missionhub.demo`: platform admin (`/admin`)

## Scripts
| Script | Purpose |
|---|---|
| `npm run dev` | Next.js + worker |
| `npm run worker` / `worker:once` | Process background jobs (matching, document scan, referral document copy/purge) |
| `npm run lint` · `typecheck` · `test` · `build` | Quality gates (`npm run check` runs all) |
| `npm run test:integration` | RLS, IDOR and end-to-end journey tests against the local Supabase |
| `npm run test:e2e` | Playwright UI journey (match → referral → agreement → hire → invoice → verified payments → settled). Reuses a running `npm run dev` (web + worker) or starts one. First run: `npx playwright install chromium` |

CI (`.github/workflows/ci.yml`) runs lint, typecheck and unit tests, then starts a throwaway local Supabase, checks generated DB types for drift, and runs integration tests, a production build and the Playwright suite.
| `npm run db:types` | Regenerate `src/server/db/database.types.ts` |

## Hosted Supabase
```bash
supabase link --project-ref <ref>
supabase db push
```
Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and `NEXT_PUBLIC_APP_URL` in your host (e.g. Vercel). Run the worker as a separate long-lived process. Prefer the `ca-central-1` region.

## Integrations
| Integration | Status without config |
|---|---|
| AI (resume extraction / embeddings) | Off. Deterministic matching and manual entry. |
| Email | Off. In-app notifications only; the UI says email wasn't sent. |
| Payments | Not integrated by design. Manual, evidence-based ledger; no funds move through the platform. |

## Known limitations
See `docs/implementation-plan.md` → *Remaining*. Notable gaps: no Playwright UI E2E or CI workflow yet, the document scanner is heuristic (not a full antivirus), and there is no app-level rate limiting beyond Supabase Auth's.
