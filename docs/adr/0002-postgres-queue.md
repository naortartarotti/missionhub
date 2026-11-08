# ADR 0002 — Postgres-backed job queue
**Decision:** `background_jobs` table + `claim_background_jobs` (SKIP LOCKED) + a Node worker; DB triggers enqueue in the same transaction as the change.
**Why:** Durable, transactional enqueue, zero extra infrastructure, works locally. Dedup on (kind, key) while queued; exponential backoff; dead-letter after 5 attempts; stale-lock recovery. **Swap path:** Supabase Queues/pgmq or a managed queue behind `runOnce`.
