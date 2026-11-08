/**
 * Tests and the demo seed create users, organizations and candidates. They must only ever
 * run against a local Supabase stack — never a hosted project, whatever APP_ENV says.
 */
export function assertLocalSupabase(what: string) {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    /* handled below */
  }
  const local = ["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"].includes(host) || host.endsWith(".localhost");
  if (!local) {
    throw new Error(
      `${what} refused to run: NEXT_PUBLIC_SUPABASE_URL points to "${host || raw || "(unset)"}", not a local Supabase stack. ` +
        "Start the local stack (npm run db:start) and point .env.local at it, or put hosted keys in a separate file such as .env.production.local.",
    );
  }
}
