/** FormData → plain object; keys listed in `arrays` are collected with getAll(). */
export function formToObject(formData: FormData, arrays: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (typeof v !== "string") continue;
    if (arrays.includes(k)) continue;
    out[k] = v;
  }
  for (const k of arrays) out[k] = formData.getAll(k).filter((v): v is string => typeof v === "string" && v !== "");
  return out;
}
