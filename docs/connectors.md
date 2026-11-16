# Connectors and the public API

How external jobs and candidates get into an organization.

## Pieces

| Piece | Where |
|---|---|
| Common input shape (validated) | `src/server/ingest/schema.ts` |
| Idempotent writes, dedup, pausing removed jobs | `src/server/ingest/upsert.ts` |
| Spreadsheet reader (multilingual headers) | `src/server/ingest/sheet.ts` |
| Public REST API (`/api/v1/me`, `/candidates`, `/jobs`) | `src/app/api/v1`, `src/server/api/v1.ts` |
| Connector catalog (shared, no secrets) | `src/features/connectors/catalog.ts` |
| Fetchers (server only) | `src/features/connectors/providers.ts` |
| Sync runner (worker job `connector.sync`) | `src/features/connectors/sync.ts` |
| UI | Settings → Connectors (`/workspace/<org>/settings/connectors`) |
| Tables | `connections`, `sync_runs`, `external_refs`, `api_keys` (migration `20261112000200`) |

## Rules

- **Idempotent.** Every external record has an `externalId` in a namespace (`api` or `connection:<id>`).
  `external_refs` maps it to the MissionHub record; a content hash skips unchanged records.
- **Never overwrite the team's work.** A candidate matched by email or LinkedIn (not by its own ref)
  is linked and only its empty fields are filled.
- **Private by default.** Imported candidates are drafts without a privacy notice: they can't be
  activated for matching or shared until a recruiter records authorization. Imported jobs are drafts
  unless the connection is set to publish them.
- **Read-only.** Connectors never write back to the source.
- **Secrets** go to Supabase Vault through `connection_set_secret`; only the worker reads them
  (`connection_get_secret`, service role). The current connectors need none.
- **API keys** are stored as SHA-256 only; `api_key_authenticate` checks the key, that its creator
  is still an active member, and a 120 requests/minute window.

## Scheduling

The worker (`npm run worker`) calls `enqueue_due_connector_syncs()` every minute; each connection
has its own interval (15 min to 1 day). "Sync now" queues a run immediately. A full-list source
(the ATS job boards) pauses imported jobs it no longer lists; they come back if listed again.

## Adding a connector

1. Add it to `CONNECTORS` in `catalog.ts` (fields the user fills in, entities, `status: "available"`).
2. Write its fetcher in `providers.ts`: return `JobRecord[]` / `CandidateRecord[]` and whether the
   list is complete. Throw `ConnectorError("notFound" | "unreachable" | …)` for clear UI messages.
3. Add its texts under `providers.<id>` in `src/i18n/messages/{en,pt,fr}/connectors.json`.

ATS connectors that need customer credentials or vendor partnership (Bullhorn, JobAdder, Vincere,
Loxo, Recruit CRM, Manatal, Zoho Recruit, Teamtailor, SmartRecruiters, Recruitee) are listed as
"coming soon"; each needs its API terms confirmed and, for OAuth, an app registered with the vendor.
