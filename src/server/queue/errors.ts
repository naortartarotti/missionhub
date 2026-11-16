/**
 * Message and code of a thrown value, without its payload. PostgREST errors are plain objects
 * ({ message, code, details, hint }), not Error instances, so String(e) gave "[object Object]"
 * (QA-PRE-01). `details` and `hint` can echo row values, so they're never logged.
 */
export function describeError(e: unknown): { message: string; code: string | null } {
  if (e instanceof Error) return { message: e.message.slice(0, 500), code: "code" in e && typeof e.code === "string" ? e.code : null };
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; code?: unknown };
    return {
      message: typeof o.message === "string" && o.message ? o.message.trim().slice(0, 500) : "Unknown error",
      code: typeof o.code === "string" ? o.code : null,
    };
  }
  return { message: String(e).slice(0, 500), code: null };
}
