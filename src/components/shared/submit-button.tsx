"use client";

import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { useActionFormPending } from "./action-form";
import type { ComponentProps } from "react";

export function SubmitButton({ children, pendingLabel, ...props }: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const status = useFormStatus();
  const ctxPending = useActionFormPending();
  const pending = status.pending || ctxPending;
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {pending ? (pendingLabel ?? "Saving…") : children}
    </Button>
  );
}
