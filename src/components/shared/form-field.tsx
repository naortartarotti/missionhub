import { Label } from "@/components/ui/label";
import type { ReactNode } from "react";

export function FormField({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | string[];
  required?: boolean;
  children: ReactNode;
}) {
  const msg = Array.isArray(error) ? error[0] : error;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {required ? <span className="text-danger" aria-hidden> *</span> : null}
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
