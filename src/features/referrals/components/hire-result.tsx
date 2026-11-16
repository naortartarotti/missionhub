"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/i18n/client";

/**
 * QA-N3-04: a record-only hire (V4 / V5) revalidates the page, which removes the **Record hire** trigger, and with it
 * the dialog, before the dialog can show its result. The result is handed to this module-level store instead, and
 * `HireResultHost` (mounted where the trigger lives, outside anything the hire changes) renders the result state
 * (spec S3: success alert, focus on the title, **Done** / Esc closes and refreshes).
 */
export type HireResult = { noSplitReason: "released" | "no_agreement"; partner: string };

let current: HireResult | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function publishHireResult(r: HireResult) {
  current = r;
  emit();
}
function clear() {
  current = null;
  emit();
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function HireResultHost() {
  const t = useT("referrals");
  const router = useRouter();
  const result = useSyncExternalStore(subscribe, () => current, () => null);
  const titleRef = useRef<HTMLDivElement>(null);
  // A result left over from another page (navigation away mid-dialog) never shows here.
  useEffect(() => clear, []);
  const close = () => {
    clear();
    router.refresh();
  };
  return (
    <Dialog open={!!result} onOpenChange={(o) => (o ? null : close())}>
      <DialogContent
        className="flex max-h-[90dvh] flex-col gap-0 rounded-3xl p-0 sm:max-w-lg"
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          titleRef.current?.focus();
        }}
      >
        <DialogHeader className="px-6 pt-6 pb-4 text-left">
          <DialogTitle className="pr-8">{t("hire.title")}</DialogTitle>
        </DialogHeader>
        {result ? (
          <div className="px-6 pb-4">
            <Alert role="status" className="rounded-2xl border-success/30 bg-success-soft text-success">
              <CheckCircle2 aria-hidden />
              <AlertTitle ref={titleRef} tabIndex={-1} className="line-clamp-none whitespace-normal text-pretty outline-none">{t("hire.recordOnlyTitle")}</AlertTitle>
              <AlertDescription className="text-foreground">
                {result.noSplitReason === "released" ? t("hire.recordOnlyResult") : t("hire.noAgreementResult", { partner: result.partner })}
              </AlertDescription>
            </Alert>
          </div>
        ) : null}
        <DialogFooter className="border-t border-border/60 px-6 py-4">
          <DialogClose asChild>
            <Button type="button" className="min-h-11 w-full sm:min-h-10 sm:w-auto">{t("hire.done")}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
