/**
 * Optional RPC arguments. The generated types mark SQL parameters without a default as required
 * strings, but the N10 RPCs accept null for these (e.g. file_conduct_report's referral-or-match pair)
 * and validate it themselves. supabase-js sends JSON null.
 */
export function orNull<T>(value: T | null | undefined): T {
  return (value ?? null) as T;
}
