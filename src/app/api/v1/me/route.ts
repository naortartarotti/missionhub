import { apiOk, authenticate } from "@/server/api/v1";

/** GET /api/v1/me — check a key: returns the organization it belongs to. */
export async function GET(req: Request) {
  const ctx = await authenticate(req);
  if (ctx instanceof Response) return ctx;
  return apiOk({ organization: { name: ctx.organization.name, slug: ctx.organization.slug, currency: ctx.organization.default_currency } });
}
