import "server-only";
import type { AdminClient } from "@/server/supabase/admin";
import { pauseMissingJobs, summarize, upsertCandidates, upsertJobs, type IngestResult, type IngestScope } from "@/server/ingest/upsert";
import { getConnector, type ConnectionConfig } from "./catalog";
import { ConnectorError, fetchRecords, type FetchResult } from "./providers";

/** Short label stored on imported candidates ("Greenhouse · acme"). */
export function sourceLabel(provider: string, config: ConnectionConfig) {
  const name = getConnector(provider)?.name ?? provider;
  const where = config.board ?? config.site ?? config.subdomain ?? (config.url ? "link" : null);
  return where ? `${name} · ${where}` : name;
}

type ConnectionRow = {
  id: string;
  organization_id: string;
  provider: string;
  status: string;
  config: ConnectionConfig;
  owner_id: string;
  organization: { default_currency: string } | null;
};

async function loadConnection(db: AdminClient, id: string) {
  const { data } = await db
    .from("connections")
    .select("id, organization_id, provider, status, config, owner_id, organization:organizations(default_currency)")
    .eq("id", id)
    .maybeSingle();
  return data as ConnectionRow | null;
}

function scopeFor(c: ConnectionRow): IngestScope {
  return {
    organizationId: c.organization_id,
    ownerId: c.owner_id,
    source: `connection:${c.id}`,
    connectionId: c.id,
    origin: c.provider === "csv_upload" || c.provider === "google_sheets" ? "csv_import" : "integration",
    sourceDetail: sourceLabel(c.provider, c.config),
    defaultCurrency: c.organization?.default_currency ?? "USD",
    defaultJobStatus: c.config.jobStatus === "active" ? "active" : "draft",
  };
}

/** Writes fetched records and returns the run's counters. */
async function ingest(db: AdminClient, c: ConnectionRow, fetched: FetchResult, startedAt: string) {
  const scope = scopeFor(c);
  const results: IngestResult[] = [
    ...(fetched.candidates?.length ? await upsertCandidates(db, scope, fetched.candidates) : []),
    ...(fetched.jobs?.length ? await upsertJobs(db, scope, fetched.jobs) : []),
  ];
  const closed = fetched.complete && fetched.jobs ? await pauseMissingJobs(db, scope, startedAt) : 0;
  const s = summarize(results);
  return { created: s.created, updated: s.updated, unchanged: s.unchanged, failed: s.failed + fetched.rejected.length, closed };
}

async function finishRun(
  db: AdminClient,
  c: ConnectionRow,
  runId: string,
  outcome: { ok: true; counts: Awaited<ReturnType<typeof ingest>> } | { ok: false; code: string },
) {
  const now = new Date().toISOString();
  if (outcome.ok) {
    const k = outcome.counts;
    await db
      .from("sync_runs")
      .update({ status: "succeeded", created_count: k.created, updated_count: k.updated, unchanged_count: k.unchanged, failed_count: k.failed, closed_count: k.closed, finished_at: now })
      .eq("id", runId);
    await db.from("connections").update({ last_sync_at: now, last_error: null, ...(c.status === "error" ? { status: "active" } : {}) }).eq("id", c.id);
  } else {
    await db.from("sync_runs").update({ status: "failed", error: outcome.code, finished_at: now }).eq("id", runId);
    await db.from("connections").update({ last_sync_at: now, last_error: outcome.code, ...(c.provider !== "csv_upload" ? { status: "error" } : {}) }).eq("id", c.id);
  }
}

/** Background job `connector.sync`: pulls the source and writes it into the organization. */
export async function runConnectionSync(db: AdminClient, connectionId: string, trigger: "manual" | "schedule") {
  const c = await loadConnection(db, connectionId);
  if (!c) return { skipped: "missing" };
  if (c.status === "paused" && trigger === "schedule") return { skipped: "paused" };
  const { data: run, error } = await db
    .from("sync_runs")
    .insert({ connection_id: c.id, organization_id: c.organization_id, trigger })
    .select("id, started_at")
    .single();
  if (error) throw error;
  try {
    const fetched = await fetchRecords(c.provider, c.config);
    const counts = await ingest(db, c, fetched, run.started_at);
    await finishRun(db, c, run.id, { ok: true, counts });
    return counts;
  } catch (e) {
    const code = e instanceof ConnectorError ? e.code : "internal";
    await finishRun(db, c, run.id, { ok: false, code });
    // Configuration problems won't fix themselves by retrying; everything else is retried by the queue.
    if (e instanceof ConnectorError) return { failed: code };
    throw e;
  }
}

/** One-off upload (CSV file): records are already read; runs synchronously and is logged as a run. */
export async function runUpload(db: AdminClient, connectionId: string, fetched: FetchResult) {
  const c = await loadConnection(db, connectionId);
  if (!c) throw new ConnectorError("invalidConfig");
  const { data: run, error } = await db
    .from("sync_runs")
    .insert({ connection_id: c.id, organization_id: c.organization_id, trigger: "upload" })
    .select("id, started_at")
    .single();
  if (error) throw error;
  try {
    const counts = await ingest(db, c, fetched, run.started_at);
    await finishRun(db, c, run.id, { ok: true, counts });
    return counts;
  } catch (e) {
    await finishRun(db, c, run.id, { ok: false, code: "internal" });
    throw e;
  }
}
