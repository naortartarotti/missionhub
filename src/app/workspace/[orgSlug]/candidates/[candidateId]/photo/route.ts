import { getRequestContext, can } from "@/server/auth/context";

/**
 * Streams a candidate's photo after the same tenant check as the profile page. Photos live in a private
 * bucket and the CSP only allows same-origin images, so they are never exposed by a public or signed URL.
 */
export async function GET(_: Request, { params }: { params: Promise<{ orgSlug: string; candidateId: string }> }) {
  const { orgSlug, candidateId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(candidateId)) return new Response(null, { status: 404 });
  const ctx = await getRequestContext(orgSlug);
  if (!can(ctx, "candidates:read")) return new Response(null, { status: 404 });
  const { data: cand } = await ctx.db.from("candidates").select("photo_path").eq("id", candidateId).eq("organization_id", ctx.organizationId).maybeSingle();
  if (!cand?.photo_path) return new Response(null, { status: 404 });
  const { data: file, error } = await ctx.db.storage.from("candidate-photos").download(cand.photo_path);
  if (error || !file) return new Response(null, { status: 404 });
  return new Response(file, {
    headers: {
      "Content-Type": file.type || "image/jpeg",
      // The URL carries a version (?v=…) that changes with the file, so it can be cached privately.
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
