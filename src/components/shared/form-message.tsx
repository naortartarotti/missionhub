import { CircleAlert, CircleCheck } from "lucide-react";
import type { ActionResult } from "@/lib/actions/result";

export function FormMessage({ state }: { state: ActionResult<unknown> | null }) {
  if (!state) return null;
  if (state.ok && !state.message) return null;
  const ok = state.ok;
  const text = ok ? state.message : state.error;
  return (
    <div
      role={ok ? "status" : "alert"}
      className={`flex items-start gap-2 rounded-2xl px-3.5 py-3 text-sm ${ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}
    >
      {ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <span>{text}</span>
    </div>
  );
}
