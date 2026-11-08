import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/server/env";
import type { Database } from "@/server/db/database.types";

/**
 * User-scoped Supabase client. Every query runs as the signed-in user, so Postgres RLS
 * applies as defense in depth on top of the server-side authorization in services.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}

export type UserClient = Awaited<ReturnType<typeof createClient>>;
