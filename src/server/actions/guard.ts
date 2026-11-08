import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { AuthorizationError } from "@/server/auth/errors";
import type { UserClient } from "@/server/supabase/server";
import { fromZodError, toActionError, type ActionResult } from "@/lib/actions/result";

/**
 * Every exported Server Action is a public POST endpoint: anyone can call it with any arguments,
 * including the ones passed through `.bind()` (those are NOT encrypted by Next.js). This module is
 * the shared boundary for those endpoints.
 */

export class InputError extends Error {
  constructor(public readonly result: ActionResult<never>) {
    super("invalid_input");
    this.name = "InputError";
  }
}

/** Validates untrusted action input; throws an InputError that `guard` turns into a field-error result. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new InputError(fromZodError(r.error));
  return r.data;
}

/**
 * Runs an action body and converts failures into safe ActionResults:
 * - Next.js control flow (redirect / notFound) is re-thrown untouched.
 * - Authorization failures become a generic "no permission" result (no 500, no stack to the client).
 * - Anything unexpected is logged without payloads and returned as a generic error.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function guard<R extends ActionResult<any>>(body: () => Promise<R>): Promise<R | ActionResult<never>> {
  try {
    return await body();
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof InputError) return e.result;
    if (e instanceof AuthorizationError) return { ok: false, error: "You don't have permission to do that." };
    return toActionError(e);
  }
}

/** Per-user fixed-window limit enforced in Postgres (holds across server instances). */
export async function rateLimit(db: UserClient, bucket: string, limit: number, windowSeconds: number) {
  const { data, error } = await db.rpc("consume_rate_limit", { p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) throw error;
  if (data !== true) throw new InputError({ ok: false, error: "You're doing that too often. Wait a moment and try again." });
}

/** Common schemas for identifiers that arrive from the client. */
export const id = z.uuid("Invalid identifier");
export const text = (min: number, max: number, message = `Use ${min}–${max} characters`) => z.string().trim().min(min, message).max(max, message);
