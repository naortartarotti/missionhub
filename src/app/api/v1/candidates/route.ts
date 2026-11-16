import { apiError, apiOk, authenticate, pageParams, readItems, validateItems } from "@/server/api/v1";
import { candidateInputSchema, MAX_BATCH } from "@/server/ingest/schema";
import { summarize, upsertCandidates } from "@/server/ingest/upsert";

/**
 * POST /api/v1/candidates — create or update candidates (one object, or { items: [...] }, ≤ 100).
 * Send `externalId` (your system's id) so repeating the call updates instead of duplicating.
 * GET /api/v1/candidates?limit=&page=&updated_since= — list the organization's candidates.
 */

export async function POST(req: Request) {
  const ctx = await authenticate(req);
  if (ctx instanceof Response) return ctx;
  const body = await readItems(req, MAX_BATCH);
  if (body instanceof Response) return body;
  const parsed = validateItems(candidateInputSchema, body.items);
  if (parsed instanceof Response) return parsed;
  const results = await upsertCandidates(
    ctx.db,
    {
      organizationId: ctx.organizationId,
      ownerId: ctx.ownerId,
      source: "api",
      origin: "api",
      sourceDetail: "API",
      defaultCurrency: ctx.organization.default_currency,
    },
    parsed.data,
  );
  const summary = summarize(results);
  return apiOk({ summary, results }, summary.created > 0 ? 201 : 200);
}

export async function GET(req: Request) {
  const ctx = await authenticate(req);
  if (ctx instanceof Response) return ctx;
  const p = pageParams(req);
  let q = ctx.db
    .from("candidates")
    .select("id, full_name, email, headline, skills, seniority, status, location_city, location_country, source, created_at, updated_at", { count: "exact" })
    .eq("organization_id", ctx.organizationId)
    .neq("status", "deleted")
    .order("updated_at", { ascending: false })
    .range(p.from, p.to);
  if (p.updatedSince) {
    if (Number.isNaN(Date.parse(p.updatedSince))) return apiError(400, "invalid_parameter", "updated_since must be an ISO 8601 date.");
    q = q.gte("updated_at", new Date(p.updatedSince).toISOString());
  }
  const { data, count, error } = await q;
  if (error) return apiError(500, "internal", "Something went wrong. Try again.");
  return apiOk({ data, page: p.page, limit: p.limit, total: count ?? 0 });
}
