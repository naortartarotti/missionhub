# Ops SQL

Read-only queries for operators, run with a database role (Supabase SQL editor or psql), never through the app or
PostgREST. They read closed `app` tables. Results are admin signals only: they're never shown to an organization and
never trigger an action.

| File | What |
|---|---|
| `hosted-worker.sql` | One-time setup, not read-only: pg_cron + pg_net call `/api/cron/worker` every minute on the hosted project (the serverless stand-in for `npm run worker`). The secret goes in Vault and must match Vercel's `CRON_SECRET` |
| `n3-hire-signals.sql` | N3 HA-9 (release shortly before a hire), HA-1 (hires first reported by the sourcing side, valid once N3 drop 2 ships), and the N3 brief §4 metrics, until the N2.1 metrics panel (PD-069, PD-073) |
