"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { ActionForm, useActionFormPending } from "@/components/shared/action-form";
import { FormMessage } from "@/components/shared/form-message";
import { SubmitButton } from "@/components/shared/submit-button";
import { focusFirstInvalid } from "@/components/shared/focus-invalid";
import { LegacyFields, SnapshotFields } from "@/features/referrals/components/report-hire-dialog";
import type { ReferralTerms } from "@/features/referrals/components/referral-terms";
import { hireDateBounds, todayEt, validateHireDates } from "@/features/referrals/hire-dates";
import { useGlobalT, useT } from "@/i18n/client";
import { completeFeeDetails } from "../actions";

const BTN = "min-h-11 w-full sm:min-h-10 sm:w-auto";

/**
 * S9 FeeDetailsDialog (BR-31, PD-074): the record-hire dialog's N2 fee block without the common fields, for a
 * fee-pending placement. Snapshot referrals: start date, base (and bonus), computed fee, I ≠ C with its reason.
 * Legacy referrals (no snapshot): free entry. On save the page re-renders as a normal N2 placement.
 */
export function FeeDetailsDialog({
  orgSlug,
  placementId,
  version,
  terms,
  partner,
  defaultCurrency,
  knownStart,
  startMin,
  startMax,
}: {
  orgSlug: string;
  placementId: string;
  /** PD-077 start-date window from `get_placement_fee_state` (null: the server checks it alone). */
  startMin: string | null;
  startMax: string | null;
  /** The placement's version (stale → errors.stale_version). */
  version: number;
  terms: ReferralTerms | null;
  partner: string;
  defaultCurrency: string;
  knownStart: string | null;
}) {
  const t = useT("commissions");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {/* fr « Entrer les détails des honoraires » wraps rather than truncating (spec §5.10). */}
        <Button className="h-auto min-h-11 w-full whitespace-normal sm:min-h-10 sm:w-auto">{t("feePending.enter")}</Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 rounded-3xl p-0 sm:max-w-lg">
        <DialogHeader className="px-6 pt-6 pb-4 text-left">
          <DialogTitle className="pr-8">{t("feeDetails.title")}</DialogTitle>
          <DialogDescription>{t("feePending.title")}</DialogDescription>
        </DialogHeader>
        {open ? (
          <FeeDetailsForm
            orgSlug={orgSlug}
            placementId={placementId}
            version={version}
            terms={terms?.recorded ? terms : null}
            partner={partner}
            defaultCurrency={defaultCurrency}
            knownStart={knownStart}
            startMin={startMin}
            startMax={startMax}
            onDone={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CancelButton({ label }: { label: string }) {
  const pending = useActionFormPending();
  return (
    <DialogClose asChild>
      <Button type="button" variant="outline" className={BTN} disabled={pending}>{label}</Button>
    </DialogClose>
  );
}

function FeeDetailsForm({
  orgSlug,
  placementId,
  version,
  terms,
  partner,
  defaultCurrency,
  knownStart,
  startMin,
  startMax,
  onDone,
}: {
  orgSlug: string;
  placementId: string;
  version: number;
  terms: Extract<ReferralTerms, { recorded: true }> | null;
  partner: string;
  defaultCurrency: string;
  knownStart: string | null;
  startMin: string | null;
  startMax: string | null;
  onDone: () => void;
}) {
  const tc = useT("common");
  const tg = useGlobalT();
  const router = useRouter();
  // Called directly: saving revalidates the page, which drops this dialog (the placement isn't fee-pending any more)
  // before an effect could fire the toast. The toast fires from the promise instead (QA-N3-04, AC-70).
  const [state, setState] = useState<Awaited<ReturnType<typeof completeFeeDetails>> | null>(null);
  const [localErrors, setLocalErrors] = useState<Record<string, string[]> | null>(null);
  const [start, setStart] = useState(knownStart ?? "");
  const formRef = useRef<HTMLFormElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  // PD-077 bounds from the server; the action re-checks both ends (field error `errors.hire_dates_invalid`).
  const fallback = hireDateBounds(null, todayEt());
  const bounds = { min: startMin, max: startMax ?? fallback.max, today: fallback.today };
  const errors = localErrors ?? (state && !state.ok ? state.fieldErrors : undefined);

  useEffect(() => {
    if (!state || state.ok) return;
    if (state.error === tg("errors.hire_terms_changed") || state.error === tg("errors.stale_version")) router.refresh();
    if (!focusFirstInvalid(formRef.current)) messageRef.current?.focus();
  }, [state, router, tg]);
  useEffect(() => {
    if (localErrors) focusFirstInvalid(formRef.current);
  }, [localErrors]);

  const submit = async (fd: FormData) => {
    const invalid = validateHireDates(fd, bounds, tg("errors.hire_dates_invalid"));
    setLocalErrors(invalid);
    if (invalid) return;
    const r = await completeFeeDetails(orgSlug, null, fd);
    if (r.ok) {
      toast.success(r.message ?? tg("commissions.feeDetails.saved"));
      onDone();
      router.refresh();
      return;
    }
    setState(r);
  };

  return (
    <ActionForm ref={formRef} action={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <input type="hidden" name="placementId" value={placementId} />
      <input type="hidden" name="version" value={version} />
      {terms ? <input type="hidden" name="termsVersionId" value={terms.effective.id} /> : null}
      <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-6 pb-4">
        {terms ? (
          <SnapshotFields terms={terms} partner={partner} errors={errors} start={start} setStart={setStart} showStart bounds={bounds} />
        ) : (
          <LegacyFields partner={partner} currency={defaultCurrency} errors={errors} showStart bounds={bounds} defaultStart={knownStart} />
        )}
        <div ref={messageRef} tabIndex={-1} className="outline-none">
          {state && !state.ok && !localErrors ? <FormMessage state={state} /> : null}
        </div>
      </div>
      <DialogFooter className="border-t border-border/60 px-6 py-4">
        <CancelButton label={tc("actions.cancel")} />
        <SubmitButton className={BTN}>{tc("actions.save")}</SubmitButton>
      </DialogFooter>
    </ActionForm>
  );
}
