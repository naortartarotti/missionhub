import "server-only";
import type { UserClient } from "@/server/supabase/server";

/** A withdrawal normally leaves within seconds; one still processing after 15 minutes is stuck. */
export function listStuckCashouts(db: UserClient) {
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  return db
    .from("cashout_requests")
    .select("id, amount_minor, currency, created_at, organization:organizations(name)")
    .eq("status", "requested")
    .lt("created_at", cutoff)
    .order("created_at")
    .limit(50);
}
