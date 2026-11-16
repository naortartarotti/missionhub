import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/server/db/database.types";

/**
 * Service-role client. BYPASSES RLS.
 * Allowed callers (enforced by review + lint rule in docs/architecture.md):
 *   - src/features/matching/infrastructure (internal cross-org matching)
 *   - src/server/queue (background worker)
 *   - src/server/storage (signed URL issuance AFTER an authorization check)
 *   - src/app/api/v1 (public API, AFTER the API key is verified; every query is scoped to its org)
 *   - src/features/connectors (connector syncs from the worker; uploads AFTER an authorization check)
 *   - src/features/referrals + src/features/admin: signing / deleting claim-evidence objects AFTER the
 *     authorize_claim_evidence / remove_claim_evidence RPC checked the caller (N1, docs/architecture.md)
 *   - src/features/referrals/candidate-request.ts: issue_candidate_request_token, only after the user's
 *     own submit_referral_for_candidate / rotate_candidate_request_token succeeded, actor = session user
 *     (N9, docs/architecture.md)
 * Never import this from UI components, route params handlers without checks, or client code.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_SECRET_KEY is not configured; internal services are unavailable.");
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AdminClient = ReturnType<typeof createAdminClient>;
