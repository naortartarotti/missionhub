"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/shared/form-field";
import { FormMessage } from "@/components/shared/form-message";
import { CharCount } from "@/components/shared/char-count";
import { focusFirstInvalid } from "@/components/shared/focus-invalid";
import { TermsFields } from "@/features/jobs/components/terms-fields";
import { changedRows, feeLong, type SplitView, type TermsRowKey, type TermsView } from "@/features/jobs/terms-display";
import { parseMajorToMinor } from "@/lib/money/format";
import { FEE_BASES, SEARCH_TYPES, parseRateToBps, type FeeBasis, type GuaranteeRemedy, type SearchType } from "@/lib/money/terms";
import type { ActionResult } from "@/lib/actions/result";
import { useFormatter, useGlobalT, useT } from "@/i18n/client";
import { amendReferralTerms } from "../actions";

/** The T1–T9 values the form would post, or null when a value can't be parsed (the server reports it). */
function draftFrom(fd: FormData, effective: TermsView, pctCurrency: string | null): TermsView | null {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const basis = s("feeBasis") as FeeBasis;
  const search = s("searchType") as SearchType;
  if (!(FEE_BASES as readonly string[]).includes(basis) || !(SEARCH_TYPES as readonly string[]).includes(search)) return null;
  const flat = basis === "flat";
  // F-1: a % amendment is stored in `pct_amendment_currency` (the effective % currency, else the job's salary currency).
  const currency = flat ? s("flatCurrency") : pctCurrency;
  if (!currency) return null;
  const rateBps = flat ? null : parseRateToBps(s("feeRate"));
  const minFeeMinor = !flat && s("minimumFee") ? parseMajorToMinor(s("minimumFee"), currency) : null;
  const flatFeeMinor = flat ? parseMajorToMinor(s("flatFee"), currency || "CAD") : null;
  if ((!flat && rateBps === null) || (flat && !flatFeeMinor) || (!flat && s("minimumFee") && !minFeeMinor)) return null;
  const guaranteeDays = Number(s("guaranteeDays"));
  return {
    ...effective,
    feeBasis: basis,
    rateBps,
    flatFeeMinor,
    minFeeMinor,
    currency,
    searchType: search,
    guaranteeDays,
    guaranteeRemedy: guaranteeDays === 0 ? null : ((s("guaranteeRemedy") || null) as GuaranteeRemedy | null),
    paymentTermsDays: Number(s("paymentTermsDays")),
    ownershipMonths: Number(s("ownershipMonths")),
  };
}

const ROWS: TermsRowKey[] = ["fee", "minimum", "currency", "searchType", "guarantee", "paymentTerms", "window"];

/**
 * S10 "Record an amendment" (BR-34, BR-35): the T1–T9 fields prefilled with the effective terms (T6
 * carried over, split read-only, T9 locked after delivery), a reason and one written-request reference
 * per organization. "Record amendment" checks the form, then a confirmation dialog lists the changes.
 */
export function AmendTermsForm({
  referralId,
  effective,
  split,
  windowLockedHint,
  pctCurrency,
}: {
  referralId: string;
  effective: TermsView;
  split: SplitView;
  windowLockedHint: string | null;
  /** `AdminReferralTerms.pct_amendment_currency`: labels, preview and diff for % amounts; null disables a switch to % (F-1). */
  pctCurrency: string | null;
}) {
  const t = useT("admin");
  const tj = useT("jobs");
  const tc = useT("common");
  const tg = useGlobalT();
  const f = useFormatter();
  const router = useRouter();
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const recordRef = useRef<HTMLButtonElement>(null);
  // Where focus goes when the confirmation closes (B-4): the first invalid field after a refusal, else the trigger.
  const closeFocus = useRef<"trigger" | "invalid">("trigger");
  const [result, setResult] = useState<ActionResult<{ versionId: string }> | null>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  const [changes, setChanges] = useState<{ field: string; from: string; to: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const serverErrors = result && !result.ok ? result.fieldErrors : undefined;
  const fe = (k: string) => local[k] ?? serverErrors?.[k]?.[0];

  const value = (k: TermsRowKey, v: TermsView): string => {
    switch (k) {
      case "fee":
        return feeLong(v, tg, f);
      case "minimum":
        return v.minFeeMinor !== null ? f.money(v.minFeeMinor, v.currency, { code: true }) : tg("common.none");
      case "currency":
        return v.currency;
      case "searchType":
        return tg(`labels.searchType.${v.searchType}`);
      case "guarantee":
        return v.guaranteeDays > 0 && v.guaranteeRemedy ? tj("terms.guarantee", { count: v.guaranteeDays, remedy: tg(`labels.guaranteeRemedy.${v.guaranteeRemedy}`) }) : tj("terms.noGuarantee");
      case "paymentTerms":
        return v.paymentTermsDays === 0 ? tj("terms.paymentTermsZero") : tj("terms.paymentTerms", { count: v.paymentTermsDays });
      case "window":
        return tj("terms.window", { count: v.ownershipMonths });
    }
  };
  const label = (k: TermsRowKey) => tj(`terms.rows.${k}`);

  const focusError = () => {
    if (!focusFirstInvalid(formRef.current)) document.getElementById(`${uid}-top`)?.focus();
  };
  const submit = (fd: FormData, fromDialog = false) =>
    start(async () => {
      const r = await amendReferralTerms(null, fd);
      setResult(r);
      if (r.ok) {
        closeFocus.current = "trigger";
        setOpen(false);
        if (r.message) toast.success(r.message);
        router.refresh();
        return;
      }
      // AC-104 (QA-N2-12, PD-074 Q-PM-12): the % currency moved since this page rendered. Nothing was
      // written; keep the inline error and re-render the form with the current currency.
      if (r.error === tg("errors.stale_version")) router.refresh();
      if (fromDialog) {
        // The dialog's close handler moves focus once the form shows the errors.
        closeFocus.current = "invalid";
        setOpen(false);
      } else requestAnimationFrame(focusError);
    });

  const review = () => {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const s = (k: string) => String(fd.get(k) ?? "").trim();
    const errs: Record<string, string> = {};
    if (s("reason").length < 10 || s("reason").length > 1000) errs.reason = t("referralTerms.validation.reasonLength");
    for (const k of ["hiringRequestReference", "sourcingRequestReference"]) if (s(k).length < 3 || s(k).length > 200) errs[k] = t("referralTerms.validation.requestLength");
    if (fd.get("bothRequested") !== "on") errs.bothRequested = t("referralTerms.validation.bothAskedRequired");
    setLocal(errs);
    if (Object.keys(errs).length) {
      setResult(null);
      requestAnimationFrame(() => focusFirstInvalid(form));
      return;
    }
    const draft = draftFrom(fd, effective, pctCurrency);
    // Unparseable card values: let the server return the field errors without a confirmation step.
    if (!draft) return submit(fd);
    const diff = changedRows(effective, draft);
    if (!diff.size) {
      setResult({ ok: false, error: tg("errors.amendment_no_change") });
      requestAnimationFrame(() => document.getElementById(`${uid}-top`)?.focus());
      return;
    }
    setChanges(ROWS.filter((k) => diff.has(k)).map((k) => ({ field: label(k), from: value(k, effective), to: value(k, draft) })));
    closeFocus.current = "trigger";
    setOpen(true);
  };

  return (
    <form ref={formRef} noValidate onSubmit={(e) => e.preventDefault()} className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div id={`${uid}-top`} tabIndex={-1} className="outline-none">
        <FormMessage state={result && !result.ok ? result : null} />
      </div>
      <input type="hidden" name="referralId" value={referralId} />
      {/* QA-N2-12: the % currency shown in the labels and confirmation; the server refuses with stale_version if it moved. */}
      <input type="hidden" name="expectedPctCurrency" value={pctCurrency ?? ""} />
      <TermsFields
        mode="amend"
        ctx={{ current: { ...effective, attestedByName: null, attestedAt: null }, referralCount: 0, split }}
        salaryMin=""
        salaryMax=""
        salaryCurrency={pctCurrency ?? effective.currency}
        shareSalary={false}
        onShareSalaryChange={() => {}}
        errors={serverErrors}
        windowLockedHint={windowLockedHint}
        pctDisabledHint={pctCurrency ? null : tg("errors.terms_incomplete")}
      />
      <div className="grid gap-4 rounded-3xl border border-border/60 bg-card p-6">
        <FormField id={`${uid}-reason`} label={t("referralTerms.reason")} hint={t("referralTerms.reasonHint")} error={fe("reason")} required>
          <Textarea
            id={`${uid}-reason`}
            name="reason"
            rows={4}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={fe("reason") ? true : undefined}
            aria-describedby={fe("reason") ? `${uid}-reason-error` : `${uid}-reason-hint`}
          />
          <CharCount count={reason.length} max={1000} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["hiringRequestReference", "sourcingRequestReference"] as const).map((k) => (
            <FormField key={k} id={`${uid}-${k}`} label={t(k === "hiringRequestReference" ? "referralTerms.requestHiring" : "referralTerms.requestSourcing")} hint={t("referralTerms.requestHint")} error={fe(k)} required>
              <Input id={`${uid}-${k}`} name={k} maxLength={200} aria-invalid={fe(k) ? true : undefined} aria-describedby={fe(k) ? `${uid}-${k}-error` : `${uid}-${k}-hint`} />
            </FormField>
          ))}
        </div>
        <div className="grid gap-1">
          <Label className="flex min-h-11 items-start gap-3 leading-5 font-normal">
            <Checkbox name="bothRequested" className="mt-0.5" aria-invalid={fe("bothRequested") ? true : undefined} aria-describedby={fe("bothRequested") ? `${uid}-both-error` : undefined} />
            <span className="text-sm text-pretty">{t("referralTerms.bothAsked")}</span>
          </Label>
          {fe("bothRequested") ? <p id={`${uid}-both-error`} role="alert" className="pl-7 text-xs font-medium text-danger">{fe("bothRequested")}</p> : null}
        </div>
        <Button ref={recordRef} type="button" onClick={review} disabled={pending} className="min-h-11 w-full sm:min-h-10 sm:w-auto sm:justify-self-end">
          {pending ? t("referralTerms.recording") : t("referralTerms.amendSubmit")}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="rounded-3xl sm:max-w-lg"
          onCloseAutoFocus={(e) => {
            // Opened from state (no DialogTrigger), so Radix has nowhere to return focus: do it here.
            e.preventDefault();
            if (closeFocus.current === "invalid") focusError();
            else recordRef.current?.focus();
            closeFocus.current = "trigger";
          }}
        >
          <DialogHeader className="text-left">
            <DialogTitle className="pr-8">{t("referralTerms.amendConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("referralTerms.amendConfirmDescription")}</DialogDescription>
          </DialogHeader>
          <ul className="grid gap-1.5 text-sm text-pretty">
            {changes.map((c) => <li key={c.field}>{t("referralTerms.changeLine", { field: c.field, from: c.from, to: c.to })}</li>)}
          </ul>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="min-h-11 w-full sm:min-h-10 sm:w-auto" onClick={() => setOpen(false)}>{tc("actions.cancel")}</Button>
            <Button className="min-h-11 w-full sm:min-h-10 sm:w-auto" disabled={pending} onClick={() => formRef.current && submit(new FormData(formRef.current), true)}>
              {pending ? t("referralTerms.recording") : t("referralTerms.amendSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
