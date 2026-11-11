import "server-only";
import type { UserClient } from "@/server/supabase/server";
import { listStuckCashouts } from "./wallet-queries";

/** Evidence kinds a platform admin verifies (sourcing payouts are confirmed by the recruiter). */
export const ADMIN_EVIDENCE_KINDS = ["client_payment", "client_refund", "platform_remittance"] as const;

/** Counts behind the sidebar badges and the overview's "needs attention" list. */
export async function getAdminQueues(db: UserClient) {
  const [evidence, disputes, cashouts, charges] = await Promise.all([
    db.from("payment_evidence").select("id", { count: "exact", head: true }).eq("status", "pending").in("kind", [...ADMIN_EVIDENCE_KINDS]),
    db.from("disputes").select("id", { count: "exact", head: true }).eq("status", "open"),
    listStuckCashouts(db),
    db.from("placement_charges").select("id", { count: "exact", head: true }).in("status", ["review", "disputed", "refunded"]),
  ]);
  return {
    evidence: evidence.count ?? 0,
    disputes: disputes.count ?? 0,
    wallets: (cashouts.data?.length ?? 0) + (charges.count ?? 0),
  };
}
export type AdminQueues = Awaited<ReturnType<typeof getAdminQueues>>;

/**
 * Makes free text safe to embed in a PostgREST `or=(…ilike…)` filter: drops the characters that
 * delimit filters or act as wildcards, and caps the length.
 */
export function searchTerm(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/[,()%*\\:"']/g, " ").trim().slice(0, 80) : "";
}

export const ADMIN_PAGE_SIZE = 25;

/** ISO timestamp `days` ago, for "new in the last N days" counts. */
export function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
