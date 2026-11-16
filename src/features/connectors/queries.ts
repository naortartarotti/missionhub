import "server-only";
import type { RequestContext } from "@/server/auth/context";
import type { ConnectionConfig } from "./catalog";

const COLUMNS = "id, provider, name, status, config, owner_id, sync_interval_minutes, next_sync_at, last_sync_at, last_error, created_at, owner:profiles!connections_owner_profile_fk(full_name, email)";

export type SyncRun = {
  id: string;
  connection_id: string;
  trigger: string;
  status: string;
  created_count: number;
  updated_count: number;
  unchanged_count: number;
  closed_count: number;
  failed_count: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

/** The organization's connections, newest first, each with its latest run. */
export async function listConnections(ctx: RequestContext, provider?: string) {
  let q = ctx.db.from("connections").select(COLUMNS).eq("organization_id", ctx.organizationId).order("created_at", { ascending: false });
  if (provider) q = q.eq("provider", provider);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as unknown as {
    id: string;
    provider: string;
    name: string;
    status: string;
    config: ConnectionConfig;
    owner_id: string;
    sync_interval_minutes: number;
    next_sync_at: string;
    last_sync_at: string | null;
    last_error: string | null;
    created_at: string;
    owner: { full_name: string | null; email: string } | null;
  }[];
  if (!rows.length) return [];
  const { data: runs } = await ctx.db
    .from("sync_runs")
    .select("*")
    .in("connection_id", rows.map((r) => r.id))
    .order("started_at", { ascending: false })
    .limit(rows.length * 8);
  const byConn = new Map<string, SyncRun[]>();
  for (const r of (runs ?? []) as SyncRun[]) byConn.set(r.connection_id, [...(byConn.get(r.connection_id) ?? []), r]);
  return rows.map((r) => {
    const list = byConn.get(r.id) ?? [];
    return { ...r, runs: list.slice(0, 6), lastRun: list.find((x) => x.status === "succeeded") ?? null, running: list[0]?.status === "running" };
  });
}

export async function listApiKeys(ctx: RequestContext) {
  const { data, error } = await ctx.db
    .from("api_keys")
    .select("id, name, prefix, created_at, last_used_at, revoked_at, creator:profiles!api_keys_creator_profile_fk(full_name, email)")
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as {
    id: string;
    name: string;
    prefix: string;
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
    creator: { full_name: string | null; email: string } | null;
  }[];
}
