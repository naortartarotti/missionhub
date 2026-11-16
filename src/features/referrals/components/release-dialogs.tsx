"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useFormatter, useGlobalT, useT } from "@/i18n/client";
import { releaseReferral, withdrawReferral } from "../actions";

/**
 * Moves focus to the current step's title when the step changes (§6), including on Back. The
 * first render is left to the dialog's own initial focus.
 */
function useStepFocus(step: number) {
  const ref = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    ref.current?.focus();
  }, [step]);
  return ref;
}

/** 44px tall below `sm` (AC-62), unchanged on desktop. */
const BTN = "min-h-11 sm:min-h-10";

/**
 * S3: withdraw a delivered referral, optionally releasing the candidate for this client (BR-25).
 * Rendered only when the three release guards hold (`can_release_on_withdraw`); otherwise the
 * plain reason dialog stays and the release option is simply absent.
 */
export function WithdrawDialog({ orgSlug, referralId, version, partner, ownershipUntil, label }: { orgSlug: string; referralId: string; version: number; partner: string; ownershipUntil: string; label: string }) {
  const t = useT("referrals");
  const tg = useGlobalT();
  const f = useFormatter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState("");
  const [release, setRelease] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const titleRef = useStepFocus(step);
  const date = f.date(ownershipUntil);

  const reset = () => {
    setStep(1);
    setReason("");
    setRelease(false);
    setError(null);
    setReasonError(null);
  };
  // An empty reason is reported inline (same message as the server's), never by a silently disabled button.
  const reasonOk = () => {
    if (reason.trim()) return true;
    setReasonError(t("validation.addNote"));
    document.getElementById("withdraw-reason")?.focus();
    return false;
  };
  const submit = () =>
    start(async () => {
      const r = await withdrawReferral(orgSlug, { referralId, reason: reason.trim(), version, release });
      if (!r.ok) {
        const fe = r.fieldErrors?.reason?.[0] ?? null;
        setReasonError(fe);
        setError(fe ? null : r.error);
        if (fe) setStep(1);
        return;
      }
      // This dialog only renders while the referral still counts, so "keeps first position" is true.
      toast.success(release ? t("success.withdrawnReleased") : t("success.withdrawn", { date }));
      setOpen(false);
      reset();
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="min-h-11 w-full sm:min-h-0 sm:w-auto">{label}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl sm:max-w-md">
        {step === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">{t("withdraw.title")}</DialogTitle>
              <DialogDescription>{t("withdraw.description", { partner, date })}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="withdraw-reason">
                {t("actions.reason")}
                <span className="text-danger" aria-hidden> *</span>
              </Label>
              <Textarea
                id="withdraw-reason"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (reasonError && e.target.value.trim()) setReasonError(null);
                }}
                rows={3}
                maxLength={2000}
                required
                aria-invalid={reasonError ? true : undefined}
                aria-describedby={reasonError ? "withdraw-reason-error" : undefined}
              />
              {reasonError ? <p id="withdraw-reason-error" role="alert" className="text-xs font-medium text-danger">{reasonError}</p> : null}
            </div>
            <div className="rounded-2xl border border-border p-3">
              <Label className="flex min-h-11 items-start gap-2.5 font-normal leading-5">
                <Checkbox checked={release} onCheckedChange={(v) => setRelease(v === true)} className="mt-0.5" aria-describedby="withdraw-release-hint" />
                <span className="text-sm font-medium">{t("withdraw.release")}</span>
              </Label>
              <p id="withdraw-release-hint" className="mt-1 pl-6.5 text-xs text-muted-foreground">{t("withdraw.releaseHint", { partner })}</p>
            </div>
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
            <DialogFooter className="gap-2">
              <Button variant="outline" className={BTN} disabled={pending} onClick={() => setOpen(false)}>{tg("common.actions.cancel")}</Button>
              {release ? (
                <Button className={BTN} onClick={() => reasonOk() && setStep(2)}>{t("withdraw.continue")}</Button>
              ) : (
                <Button variant="destructive" className={BTN} disabled={pending} onClick={() => reasonOk() && submit()}>
                  {pending ? tg("common.actions.working") : t("withdraw.confirm")}
                </Button>
              )}
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle ref={titleRef} tabIndex={-1} className="leading-snug outline-none">{t("withdraw.releaseConfirmTitle")}</DialogTitle>
              <DialogDescription>{t("withdraw.releaseConfirmDescription", { partner })}</DialogDescription>
            </DialogHeader>
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
            <DialogFooter className="gap-2">
              <Button variant="ghost" className={BTN} disabled={pending} onClick={() => { setError(null); setStep(1); }}>{t("withdraw.back")}</Button>
              <Button variant="outline" className={BTN} disabled={pending} onClick={() => setOpen(false)}>{tg("common.actions.cancel")}</Button>
              <Button variant="destructive" className={BTN} disabled={pending} onClick={submit}>
                {pending ? tg("common.actions.working") : t("withdraw.releaseConfirm")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * S3b: release later, on a withdrawn, cancelled, declined or rejected referral (N1 BR-25; N3 BR-34, S11).
 * Rendered only when the backend says every guard holds (`can_release`: delivered, still counts, no open
 * dispute, no hire record; drop 2 adds the per-client report block). Two explicit steps; neither alone releases.
 */
export function ReleaseDialog({ orgSlug, referralId, partner, ownershipUntil }: { orgSlug: string; referralId: string; partner: string; ownershipUntil: string }) {
  const t = useT("referrals");
  const tg = useGlobalT();
  const f = useFormatter();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const titleRef = useStepFocus(step);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setStep(1);
          // A refused release means a guard stopped holding: refresh so the button disappears.
          if (error) router.refresh();
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="min-h-11 w-full sm:min-h-0 sm:w-auto">{t("release.trigger")}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl sm:max-w-md">
        {step === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle ref={titleRef} tabIndex={-1} className="leading-snug outline-none">{t("release.title")}</DialogTitle>
              <DialogDescription>{t("release.description", { partner, date: f.date(ownershipUntil) })}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" className={BTN} onClick={() => setOpen(false)}>{tg("common.actions.cancel")}</Button>
              <Button className={BTN} onClick={() => setStep(2)}>{t("release.continue")}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle ref={titleRef} tabIndex={-1} className="leading-snug outline-none">{t("release.confirmTitle")}</DialogTitle>
              <DialogDescription>{t("release.confirmDescription", { partner })}</DialogDescription>
            </DialogHeader>
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
            <DialogFooter className="gap-2">
              <Button variant="ghost" className={BTN} disabled={pending} onClick={() => setStep(1)}>{t("release.back")}</Button>
              <Button variant="outline" className={BTN} disabled={pending} onClick={() => setOpen(false)}>{tg("common.actions.cancel")}</Button>
              <Button
                variant="destructive"
                className={BTN}
                disabled={pending || !!error}
                onClick={() =>
                  start(async () => {
                    const r = await releaseReferral(orgSlug, { referralId });
                    if (!r.ok) return setError(r.error);
                    toast.success(t("success.released"));
                    setOpen(false);
                    setStep(1);
                  })
                }
              >
                {pending ? tg("common.actions.working") : t("release.confirm")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
