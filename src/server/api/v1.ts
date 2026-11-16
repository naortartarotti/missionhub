import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { createAdminClient, type AdminClient } from "@/server/supabase/admin";

/**
 * Public REST API (v1). Authenticated by an organization API key:
 *   Authorization: Bearer mh_live_…
 * Only the SHA-256 of a key is stored. Every response is JSON; errors are { error: { code, message } }.
 * Requests carry candidate data, so nothing from a body is ever logged.
 */

export const API_KEY_PREFIX = "mh_live_";

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export type ApiContext = {
  db: AdminClient;
  keyId: string;
  organizationId: string;
  ownerId: string;
  organization: { name: string; slug: string; default_currency: string };
};

export function apiError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status, headers: { "cache-control": "no-store" } });
}

export function apiOk(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

/** Resolves the key or returns the error response to send. */
export async function authenticate(req: Request): Promise<ApiContext | NextResponse> {
  const header = req.headers.get("authorization") ?? "";
  const key = header.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!key || !key.startsWith(API_KEY_PREFIX) || key.length > 100) {
    return apiError(401, "unauthorized", "Send your API key as `Authorization: Bearer mh_live_…`.");
  }
  let db: AdminClient;
  try {
    db = createAdminClient();
  } catch {
    return apiError(503, "unavailable", "The API is not configured on this server.");
  }
  const { data, error } = await db.rpc("api_key_authenticate", { p_hash: hashApiKey(key) });
  if (error) return apiError(500, "internal", "Something went wrong. Try again.");
  const row = data?.[0];
  if (!row) return apiError(401, "unauthorized", "This API key is invalid or was revoked.");
  if (!row.allowed) return apiError(429, "rate_limited", "Too many requests: the limit is 120 per minute per key.");
  const { data: org } = await db.from("organizations").select("name, slug, default_currency").eq("id", row.organization_id).single();
  if (!org) return apiError(401, "unauthorized", "This API key is invalid or was revoked.");
  return { db, keyId: row.key_id, organizationId: row.organization_id, ownerId: row.created_by, organization: org };
}

/** Reads a JSON body (≤ 1 MB) shaped as one object or `{ "items": [...] }`. */
export async function readItems(req: Request, max: number): Promise<{ items: unknown[] } | NextResponse> {
  const text = await req.text();
  if (text.length > 1_000_000) return apiError(413, "payload_too_large", "The body must be at most 1 MB.");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return apiError(400, "invalid_json", "The body must be valid JSON.");
  }
  const items = body && typeof body === "object" && "items" in body ? (body as { items: unknown }).items : [body];
  if (!Array.isArray(items) || items.length === 0) return apiError(400, "invalid_body", "Send one object, or { \"items\": [ … ] }.");
  if (items.length > max) return apiError(400, "too_many_items", `Send at most ${max} items per request.`);
  return { items };
}

/** Validates each item; returns parsed items or a 422 listing every problem by index and field. */
export function validateItems<S extends z.ZodType>(schema: S, items: unknown[]): { data: z.output<S>[] } | NextResponse {
  const data: z.output<S>[] = [];
  const problems: { index: number; field: string; message: string }[] = [];
  items.forEach((item, index) => {
    const r = schema.safeParse(item);
    if (r.success) data.push(r.data);
    else for (const i of r.error.issues) problems.push({ index, field: i.path.join(".") || "(item)", message: i.message });
  });
  if (problems.length) return apiError(422, "validation_failed", "Some items are invalid. Nothing was saved.", problems.slice(0, 100));
  return { data };
}

export function pageParams(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 25));
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  return { limit, page, from: (page - 1) * limit, to: page * limit - 1, updatedSince: url.searchParams.get("updated_since") };
}
