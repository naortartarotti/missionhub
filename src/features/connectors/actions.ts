"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guard, id, parse, rateLimit } from "@/server/actions/guard";
import { assertCan, getRequestContext } from "@/server/auth/context";
import { createAdminClient } from "@/server/supabase/admin";
import { toActionError, type ActionResult } from "@/lib/actions/result";
import { msg } from "@/i18n/translate";
import { API_KEY_PREFIX, hashApiKey } from "@/server/api/v1";
import { getConnector, SYNC_INTERVALS, type ConnectionConfig, type ConnectorDef } from "./catalog";
import { ConnectorError, fetchRecords, hasFetcher, readSheet, type FetchResult } from "./providers";
import { runUpload } from "./sync";

/** What the "Test" step shows: totals and a few records as they will look in Workatent. */
export type ConnectorPreview = {
  jobs: number;
  candidates: number;
  rejected: number;
  sample: { title: string; subtitle: string; tags: string[] }[];
};

const base = (orgSlug: string) => `/workspace/${orgSlug}/settings/connectors`;

function configSchema(def: ConnectorDef) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of def.fields) {
    let s = z.string().trim().max(500);
    if (f.kind === "url") s = s.regex(/^https:\/\//i, msg("connectors.errors.httpsOnly"));
    if (f.kind === "select" && f.options) s = s.refine((v) => f.options!.includes(v), msg("connectors.errors.invalidOption")) as unknown as z.ZodString;
    shape[f.key] = f.required ? s.min(1, msg("connectors.errors.required")) : s.optional();
  }
  shape.jobStatus = z.enum(["draft", "active"]).optional();
  return z.object(shape);
}

function connectorError(e: unknown): ActionResult<never> {
  if (e instanceof ConnectorError) {
    return { ok: false, error: msg(`connectors.errors.${e.code}`, { column: e.detail ?? "" }) };
  }
  throw e;
}

function previewOf(r: FetchResult): ConnectorPreview {
  const sample = r.jobs
    ? r.jobs.slice(0, 5).map((j) => ({
        title: j.title,
        subtitle: [j.location.city, j.location.country, j.workArrangement, j.contractType].filter(Boolean).join(" · "),
        tags: j.requiredSkills.slice(0, 6),
      }))
    : (r.candidates ?? []).slice(0, 5).map((c) => ({
        title: c.fullName,
        subtitle: [c.headline, c.email, c.location.city].filter(Boolean).join(" · "),
        tags: c.skills.slice(0, 6),
      }));
  return { jobs: r.jobs?.length ?? 0, candidates: r.candidates?.length ?? 0, rejected: r.rejected.length, sample };
}

/** Reads the source with the given settings without saving anything. */
export async function testConnector(orgSlug: string, provider: string, input: Record<string, string>): Promise<ActionResult<ConnectorPreview>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "integrations:manage");
    await rateLimit(ctx.db, "connector.test", 30, 600);
    const def = getConnector(provider);
    if (!def || def.status !== "available" || !hasFetcher(def.id)) return { ok: false, error: msg("connectors.errors.unavailable") };
    const config = parse(configSchema(def), input) as ConnectionConfig;
    try {
      const fetched = await fetchRecords(def.id, config);
      if (!fetched.jobs?.length && !fetched.candidates?.length) return { ok: false, error: msg("connectors.errors.empty") };
      return { ok: true, data: previewOf(fetched) };
    } catch (e) {
      return connectorError(e);
    }
  });
}

const createSchema = z.object({ interval: z.coerce.number().refine((n) => (SYNC_INTERVALS as readonly number[]).includes(n)) });

/** Saves the connection and queues its first sync right away. */
export async function createConnection(
  orgSlug: string,
  provider: string,
  input: Record<string, string> & { interval?: string },
): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "integrations:manage");
    await rateLimit(ctx.db, "connector.create", 20, 3600);
    const def = getConnector(provider);
    if (!def || def.status !== "available" || !hasFetcher(def.id)) return { ok: false, error: msg("connectors.errors.unavailable") };
    const config = parse(configSchema(def), input) as ConnectionConfig;
    const { interval } = parse(createSchema, { interval: input.interval ?? 60 });
    // Never save a connection that cannot read its source.
    try {
      await fetchRecords(def.id, config);
    } catch (e) {
      return connectorError(e);
    }
    const name = config.board ?? config.site ?? config.subdomain ?? def.name;
    const { data, error } = await ctx.db
      .from("connections")
      .insert({
        organization_id: ctx.organizationId,
        provider: def.id,
        name: name.slice(0, 120),
        config,
        owner_id: ctx.userId,
        created_by: ctx.userId,
        sync_interval_minutes: interval,
      })
      .select("id")
      .single();
    if (error) return toActionError(error);
    const { error: qErr } = await ctx.db.rpc("request_connection_sync", { p_connection: data.id });
    if (qErr) return toActionError(qErr);
    revalidatePath(base(orgSlug), "layout");
    return { ok: true, data: { id: data.id }, message: msg("connectors.messages.connected") };
  });
}

const updateSchema = z.object({
  connectionId: id,
  status: z.enum(["active", "paused"]).optional(),
  interval: z.coerce.number().refine((n) => (SYNC_INTERVALS as readonly number[]).includes(n)).optional(),
  jobStatus: z.enum(["draft", "active"]).optional(),
});

export async function updateConnection(orgSlug: string, input: z.input<typeof updateSchema>): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "integrations:manage");
    const v = parse(updateSchema, input);
    const { data: current } = await ctx.db.from("connections").select("config").eq("id", v.connectionId).eq("organization_id", ctx.organizationId).maybeSingle();
    if (!current) return { ok: false, error: msg("connectors.errors.notFoundConnection") };
    const patch: { status?: "active" | "paused"; sync_interval_minutes?: number; config?: ConnectionConfig; next_sync_at?: string } = {};
    if (v.status) {
      patch.status = v.status;
      if (v.status === "active") patch.next_sync_at = new Date().toISOString();
    }
    if (v.interval) patch.sync_interval_minutes = v.interval;
    if (v.jobStatus) patch.config = { ...(current.config as ConnectionConfig), jobStatus: v.jobStatus };
    const { error } = await ctx.db.from("connections").update(patch).eq("id", v.connectionId).eq("organization_id", ctx.organizationId);
    if (error) return toActionError(error);
    revalidatePath(base(orgSlug), "layout");
    return { ok: true, message: msg("connectors.messages.updated") };
  });
}

export async function syncConnectionNow(orgSlug: string, connectionId: string): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "integrations:manage");
    parse(id, connectionId);
    await rateLimit(ctx.db, "connector.sync_now", 30, 3600);
    const { error } = await ctx.db.rpc("request_connection_sync", { p_connection: connectionId });
    if (error) return toActionError(error);
    revalidatePath(base(orgSlug), "layout");
    return { ok: true, message: msg("connectors.messages.syncQueued") };
  });
}

/** Removes the connection. Records it imported stay; they simply stop syncing. */
export async function deleteConnection(orgSlug: string, connectionId: string): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "integrations:manage");
    parse(id, connectionId);
    const { data, error } = await ctx.db.from("connections").delete().eq("id", connectionId).eq("organization_id", ctx.organizationId).select("id");
    if (error) return toActionError(error);
    if (!data?.length) return { ok: false, error: msg("connectors.errors.notFoundConnection") };
    revalidatePath(base(orgSlug), "layout");
    return { ok: true, message: msg("connectors.messages.disconnected") };
  });
}

export type UploadResult = { created: number; updated: number; unchanged: number; failed: number; rejected: { line: number; field: string; message: string }[] };

/** CSV file → candidates or jobs, right now. Logged under one "CSV" connection per organization. */
export async function uploadSheet(orgSlug: string, _: ActionResult<UploadResult> | null, formData: FormData): Promise<ActionResult<UploadResult>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "candidates:write");
    await rateLimit(ctx.db, "connector.upload", 20, 3600);
    const entity = parse(z.enum(["candidates", "jobs"]), formData.get("entity"));
    if (entity === "jobs") assertCan(ctx, "jobs:write");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: msg("connectors.errors.chooseFile") };
    if (file.size > 5 * 1024 * 1024) return { ok: false, error: msg("connectors.errors.fileSize") };
    if (!/\.(csv|txt)$/i.test(file.name)) return { ok: false, error: msg("connectors.errors.csvOnly") };
    let fetched: FetchResult;
    try {
      fetched = readSheet(await file.text(), entity);
    } catch (e) {
      return connectorError(e);
    }
    if (!fetched.jobs?.length && !fetched.candidates?.length) {
      return fetched.rejected.length
        ? { ok: true, data: { created: 0, updated: 0, unchanged: 0, failed: fetched.rejected.length, rejected: fetched.rejected.slice(0, 50) } }
        : { ok: false, error: msg("connectors.errors.empty") };
    }

    // One upload "connection" per organization holds the history; it is never scheduled.
    let { data: conn } = await ctx.db.from("connections").select("id").eq("organization_id", ctx.organizationId).eq("provider", "csv_upload").limit(1).maybeSingle();
    if (!conn) {
      const ins = await ctx.db
        .from("connections")
        .insert({ organization_id: ctx.organizationId, provider: "csv_upload", name: "CSV", config: {}, owner_id: ctx.userId, created_by: ctx.userId, sync_interval_minutes: 10080 })
        .select("id")
        .single();
      if (ins.error) return toActionError(ins.error);
      conn = ins.data;
      await ctx.db.from("connections").update({ status: "paused" }).eq("id", conn.id);
    }
    // The uploader owns what they bring in. Authorization is checked above; the service client
    // only writes into this organization (see src/server/ingest/upsert.ts).
    const db = createAdminClient();
    await db.from("connections").update({ owner_id: ctx.userId, config: { entity } }).eq("id", conn.id);
    const counts = await runUpload(db, conn.id, fetched);
    revalidatePath(`/workspace/${orgSlug}/${entity}`);
    revalidatePath(base(orgSlug), "layout");
    return {
      ok: true,
      data: { created: counts.created, updated: counts.updated, unchanged: counts.unchanged, failed: counts.failed, rejected: fetched.rejected.slice(0, 50) },
      message: msg("connectors.messages.uploaded", { count: counts.created + counts.updated }),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// API keys

const keyName = z.string().trim().min(2, msg("connectors.errors.keyName")).max(80, msg("connectors.errors.keyName"));

/** Creates a key and returns it ONCE; only its hash is stored. */
export async function createApiKey(orgSlug: string, _: ActionResult<{ key: string }> | null, formData: FormData): Promise<ActionResult<{ key: string }>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "integrations:manage");
    await rateLimit(ctx.db, "api_key.create", 10, 3600);
    const name = parse(keyName, formData.get("name"));
    const key = `${API_KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
    const { error } = await ctx.db.from("api_keys").insert({
      organization_id: ctx.organizationId,
      name,
      prefix: key.slice(0, 14),
      key_hash: hashApiKey(key),
      created_by: ctx.userId,
    });
    if (error) return toActionError(error);
    revalidatePath(`${base(orgSlug)}/workatent_api`);
    return { ok: true, data: { key }, message: msg("connectors.messages.keyCreated") };
  });
}

export async function revokeApiKey(orgSlug: string, keyId: string): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "integrations:manage");
    parse(id, keyId);
    const { data, error } = await ctx.db
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", keyId)
      .eq("organization_id", ctx.organizationId)
      .is("revoked_at", null)
      .select("id");
    if (error) return toActionError(error);
    if (!data?.length) return { ok: false, error: msg("connectors.errors.notFoundKey") };
    revalidatePath(`${base(orgSlug)}/workatent_api`);
    return { ok: true, message: msg("connectors.messages.keyRevoked") };
  });
}
