import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { AuthorizationError } from "@/server/auth/errors";
import type { UserClient } from "@/server/supabase/server";
import { fromZodError, toActionError, type ActionResult } from "@/lib/actions/result";
import { getGlobalT } from "@/i18n/server";
import { I18N_PREFIX, msg, translateMarked } from "@/i18n/translate";

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
  let result: R | ActionResult<never>;
  try {
    result = await body();
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof InputError) result = e.result;
    else if (e instanceof AuthorizationError) result = { ok: false, error: msg("errors.forbidden") };
    else result = toActionError(e);
  }
  return localize(result);
}

/** Translates `msg(...)`-marked strings (error, field errors, success message) into the user's language. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function localize<R extends ActionResult<any>>(result: R): Promise<R> {
  const marked = (v: unknown) => typeof v === "string" && v.startsWith(I18N_PREFIX);
  const needs = result.ok
    ? marked(result.message)
    : marked(result.error) || Object.values(result.fieldErrors ?? {}).some((list) => list?.some(marked));
  if (!needs) return result;
  const t = await getGlobalT();
  if (result.ok) return { ...result, message: result.message && translateMarked(t, result.message) };
  return {
    ...result,
    error: translateMarked(t, result.error),
    fieldErrors: result.fieldErrors
      ? Object.fromEntries(Object.entries(result.fieldErrors).map(([k, list]) => [k, list?.map((m) => translateMarked(t, m))]))
      : undefined,
  };
}

/** Per-user fixed-window limit enforced in Postgres (holds across server instances). */
export async function rateLimit(db: UserClient, bucket: string, limit: number, windowSeconds: number) {
  const { data, error } = await db.rpc("consume_rate_limit", { p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) throw error;
  if (data !== true) throw new InputError({ ok: false, error: msg("errors.rateLimited") });
}

/** Common schemas for identifiers that arrive from the client. */
export const id = z.uuid(msg("errors.invalidId"));
export const text = (min: number, max: number, message = `Use ${min}–${max} characters`) => z.string().trim().min(min, message).max(max, message);
