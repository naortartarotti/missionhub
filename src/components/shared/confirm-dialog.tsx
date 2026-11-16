"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/actions/result";

/** Confirmation dialog with optional required reason. Used for consequential / irreversible actions. */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  destructive,
  reasonLabel,
  reasonRequired,
  reasonHint,
  reasonMinLength = 3,
  reasonMaxLength,
  reasonTooShort,
  onConfirm,
  open: openProp,
  onOpenChange,
}: {
  /** Omit when the dialog is opened from code (`open` / `onOpenChange`). */
  trigger?: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  reasonLabel?: string;
  reasonRequired?: boolean;
  /** Help text under the reason field, linked with aria-describedby (e.g. who reads it). */
  reasonHint?: string;
  /** Minimum length that enables the confirm button when the reason is required (default 3). */
  reasonMinLength?: number;
  reasonMaxLength?: number;
  /**
   * Message shown inline when the reason is shorter than `reasonMinLength`. When set, the confirm
   * button stays enabled and the rule is reported on click instead of blocking silently (AC-40).
   */
  reasonTooShort?: string;
  onConfirm: (reason: string) => Promise<ActionResult<unknown> | void>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useT("common");
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (o: boolean) => {
    setOpenState(o);
    onOpenChange?.(o);
  };
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setReason("");
          setError(null);
          setFieldError(null);
        }
      }}
    >
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm text-muted-foreground">{description}</div>
          </DialogDescription>
        </DialogHeader>
        {reasonLabel ? (
          <div className="grid gap-1.5">
            <Label htmlFor="confirm-reason">
              {reasonLabel}
              {reasonRequired ? <span className="text-danger"> *</span> : null}
            </Label>
            <Textarea
              id="confirm-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={reasonMaxLength}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={[fieldError ? "confirm-reason-error" : null, reasonHint ? "confirm-reason-hint" : null].filter(Boolean).join(" ") || undefined}
            />
            {reasonHint ? <p id="confirm-reason-hint" className="text-xs text-muted-foreground">{reasonHint}</p> : null}
            {fieldError ? <p id="confirm-reason-error" role="alert" className="text-xs font-medium text-danger">{fieldError}</p> : null}
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => setOpen(false)}>
            {t("actions.cancel")}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            className="min-h-11 sm:min-h-10"
            disabled={pending || (reasonRequired && !reasonTooShort && reason.trim().length < reasonMinLength)}
            onClick={() => {
              if (reasonRequired && reasonTooShort && reason.trim().length < reasonMinLength) {
                setFieldError(reasonTooShort);
                document.getElementById("confirm-reason")?.focus();
                return;
              }
              start(async () => {
                const r = await onConfirm(reason.trim());
                if (r && !r.ok) {
                  const fe = r.fieldErrors?.reason?.[0] ?? null;
                  setFieldError(fe);
                  setError(fe ? null : r.error);
                  return;
                }
                if (r && r.ok && r.message) toast.success(r.message);
                setOpen(false);
              });
            }}
          >
            {pending ? t("actions.working") : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
