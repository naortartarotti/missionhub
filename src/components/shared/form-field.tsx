import { Label } from "@/components/ui/label";
import type { ReactNode } from "react";

export function FormField({
  id,
  label,
  hint,
  error,
  required,
  badge,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | string[];
  required?: boolean;
  /** Small marker shown next to the label (e.g. "Auto-filled"). */
  badge?: ReactNode;
  children: ReactNode;
}) {
  const msg = Array.isArray(error) ? error[0] : error;
  // content-start: when a neighbour in the same row is taller (hint/error), this cell stretches;
  // without it the grid spreads the extra height between label and control, misaligning inputs.
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {required ? <span className="text-danger" aria-hidden> *</span> : null}
        {badge}
      </Label>
      {children}
      {hint && !msg ? <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p> : null}
      {msg ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
