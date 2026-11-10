import "server-only";
import { assertCan, type RequestContext } from "@/server/auth/context";

export const WALLET_PAGE_SIZE = 25;

export type WalletBalance = { currency: string; available: number; pending: number };

/** Balances per currency for the current organization. RLS already limits rows to its own accounts. */
export async function getWalletBalances(ctx: RequestContext): Promise<WalletBalance[]> {
  assertCan(ctx, "wallet:read");
  const { data, error } = await ctx.db
    .from("wallet_accounts")
    .select("kind, currency, balance_minor")
    .eq("organization_id", ctx.organizationId)
    .order("currency");
  if (error) throw error;
  const byCurrency = new Map<string, WalletBalance>();
  for (const a of data ?? []) {
    const b = byCurrency.get(a.currency) ?? { currency: a.currency, available: 0, pending: 0 };
    if (a.kind === "available") b.available = a.balance_minor;
    if (a.kind === "pending") b.pending = a.balance_minor;
    byCurrency.set(a.currency, b);
  }
  return [...byCurrency.values()];
}

/** Newest-first ledger entries on this organization's accounts. The counterparty's side is never returned. */
export async function listWalletEntries(ctx: RequestContext, page: number) {
  assertCan(ctx, "wallet:read");
  const { data, error, count } = await ctx.db
    .from("wallet_entries")
    .select(
      "id, amount_minor, balance_after_minor, created_at, account:wallet_accounts!inner(kind, currency, organization_id), transaction:wallet_transactions!inner(kind, memo, placement:placements(id, referral:referrals(job_title_snapshot)))",
      { count: "exact" },
    )
    .eq("account.organization_id", ctx.organizationId)
    .order("id", { ascending: false })
    .range((page - 1) * WALLET_PAGE_SIZE, page * WALLET_PAGE_SIZE - 1);
  if (error) throw error;
  return { entries: data ?? [], total: count ?? 0 };
}

export async function getWalletFreeze(ctx: RequestContext) {
  assertCan(ctx, "wallet:read");
  const { data, error } = await ctx.db.from("wallet_freezes").select("frozen_at").eq("organization_id", ctx.organizationId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Payout account status, platform switch and recent withdrawals, for the withdrawals panel. */
export async function getPayoutState(ctx: RequestContext) {
  assertCan(ctx, "wallet:read");
  const [destination, settings, cashouts] = await Promise.all([
    ctx.db.from("payout_destinations").select("details_submitted, payouts_enabled").eq("organization_id", ctx.organizationId).maybeSingle(),
    ctx.db.from("wallet_settings").select("cashouts_enabled").single(),
    ctx.db.from("cashout_requests").select("id, amount_minor, currency, status, created_at").eq("organization_id", ctx.organizationId).order("created_at", { ascending: false }).limit(5),
  ]);
  for (const r of [destination, settings, cashouts]) if (r.error) throw r.error;
  return {
    destination: destination.data,
    cashoutsEnabled: settings.data?.cashouts_enabled ?? false,
    cashouts: cashouts.data ?? [],
  };
}
