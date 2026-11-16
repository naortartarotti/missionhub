"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useT } from "@/i18n/client";
import { ConductTextForm } from "./conduct-text-form";

/** S11 "Request a review" (BR-31): reason 20–8,000 plus files, one per decision. */
export function ReviewRequestDialog({ orgSlug, caseId, finding, codeMessages }: { orgSlug: string; caseId: string; finding: boolean; codeMessages: Record<string, string> }) {
  const t = useT("network");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="min-h-11 w-full justify-self-start sm:min-h-10 sm:w-auto">{t("case.requestReview")}</Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[100dvh] flex-col gap-0 overflow-hidden p-0 max-sm:inset-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none sm:max-h-[90dvh] sm:max-w-xl sm:rounded-3xl">
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-6 pb-6">
          <DialogTitle className="pr-8 leading-snug">{t("case.reviewDialogTitle")}</DialogTitle>
          <DialogDescription className="mt-2">{finding ? t("case.reviewDialogBodyFinding") : t("case.reviewDialogBody")}</DialogDescription>
          <div className="mt-5">
            <ConductTextForm
              orgSlug={orgSlug}
              kind="reviewRequest"
              targetId={caseId}
              label={t("case.reviewReason")}
              hint={t("case.reviewReasonHint")}
              submitLabel={t("case.reviewSubmit")}
              filesHint={t("case.filesHint")}
              successToast={t("case.reviewRequestedToast")}
              codeMessages={codeMessages}
              onDone={() => setOpen(false)}
              onCancel={() => setOpen(false)}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
