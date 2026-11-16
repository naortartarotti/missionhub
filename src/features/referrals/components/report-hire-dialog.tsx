"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Info, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ActionForm, useActionFormPending } from "@/components/shared/action-form";
import { FormField } from "@/components/shared/form-field";
import { FormMessage } from "@/components/shared/form-message";
import { SubmitButton } from "@/components/shared/submit-button";
import { CharCount } from "@/components/shared/char-count";
import { focusFirstInvalid } from "@/components/shared/focus-invalid";
import { NativeSelect } from "@/components/shared/native-select";
import { TermsSummary } from "@/features/jobs/components/terms-summary";
import { termsFromRow } from "@/features/jobs/terms-display";
import { parseMajorToMinor } from "@/lib/money/format";
import { computeFee, FEE_DIFFERENCE_REASONS, type FeeDifferenceReason } from "@/lib/money/terms";
import { cn } from "@/lib/utils";
import { useFormatter, useGlobalT, useT } from "@/i18n/client";
import type { Paths } from "@/i18n/translate";
import type { Messages } from "@/i18n/messages";
import { reportHire } from "../actions";
import { publishHireResult } from "./hire-result";
import type { TargetHireState } from "../queries";
import { hireDateBounds, todayEt, validateHireDates } from "../hire-dates";
import type { ReferralTerms } from "./referral-terms";

/** AlertTitle clamps to one line by default; these titles must wrap (fr runs ~30% longer, spec §5.10). */
const ALERT_TITLE = "line-clamp-none whitespace-normal text-pretty";
const BTN = "min-h-11 w-full sm:min-h-10 sm:w-auto";

type Recorded = Extract<ReferralTerms, { recorded: true }>;
type FieldErrors = Record<string, string[] | undefined> | undefined;
const fieldError = (errors: FieldErrors, k: string) => errors?.[k]?.[0];

/** What the dialog needs from `get_referral_hire_state` (target side). The variant is the server's, never the form's. */
/** From the hire report panel's Confirm (BR-24, AC-52). */
export type HireReportPrefill = { id: string; role: string | null; startMonth: string | null };

export type HireDialogState = Pick<TargetHireState, "status" | "version" | "delivered_at" | "variant" | "legacy" | "other_role_allowed" | "job_title">;

/** Start date (YYYY-MM-DD) + days, as an ISO date (UTC calendar arithmetic, like the database). */
function addDays(date: string, days: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * S3 Record hire (N2 S8 + N3 §2.3, variants V0–V6). The server picks the variant (`hire.variant`) and the
 * terms (`getReferralTerms`); V5 (released) is never returned, so a released referral renders exactly like
 * V2 / V3 / V4 until submit (AC-27).
 * - V0 `objection_open`: an info alert and Close, no form (BR-45).
 * - V1 `happy`: today's N2 dialog, no new fields (BR-7).
 * - V2 `confirmed` / V3 `deemed`: common fields (acceptance date or unknown, start date, role) + the N2 fee block.
 * - V4 `no_agreement`: common fields only; a record-only hire, shown as a result state.
 * - V6 = `legacy` on any variant: today's free fee entry instead of the snapshot block.
 */
export function ReportHireDialog({
  orgSlug,
  referralId,
  hire,
  terms,
  partner,
  defaultCurrency,
  open,
  onOpenChange,
  trigger,
  onCloseAutoFocus,
  report,
}: {
  orgSlug: string;
  referralId: string;
  hire: HireDialogState;
  /** E3 Confirm (BR-24): the pending hire report this record answers; prefills the role and the start hint. */
  report?: HireReportPrefill;
  /** `getReferralTerms` for this referral; null is treated as legacy (the server decides anyway). */
  terms: ReferralTerms | null;
  /** The sourcing org (named in the consequence lines and the alerts). */
  partner: string;
  /** Legacy only: the currency preselected in the free-entry picker. */
  defaultCurrency: string;
  /** Controlled mode (e.g. opened by dropping a card on the Hired column). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Custom trigger; pass `null` for no trigger in controlled mode. */
  trigger?: ReactNode | null;
  /** Controlled mode without a trigger: where focus goes on close (e.g. the pipeline card's menu). */
  onCloseAutoFocus?: (e: Event) => void;
}) {
  const t = useT("referrals");
  const variant = hire.variant ?? "happy";
  const recorded = terms?.recorded ? terms : null;
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  const setOpen = (o: boolean) => {
    if (open === undefined) setInnerOpen(o);
    onOpenChange?.(o);
  };
  const objectionTitleRef = useRef<HTMLDivElement>(null);
  const description =
    variant === "objection_open" || variant === "no_agreement" ? null : recorded && !hire.legacy ? t("hire.descriptionSnapshot") : t("hire.description");

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger === null ? null : (
        <DialogTrigger asChild>
          {/* Primary on the N2 happy path; outline after the transition buttons everywhere else (E1). */}
          {trigger ?? <Button variant={variant === "happy" ? "default" : "outline"} className={cn(BTN, "h-auto whitespace-normal")}>{t("hire.trigger")}</Button>}
        </DialogTrigger>
      )}
      <DialogContent
        className="flex max-h-[90dvh] flex-col gap-0 rounded-3xl p-0 sm:max-w-lg"
        onCloseAutoFocus={onCloseAutoFocus}
        onOpenAutoFocus={variant === "objection_open" ? (e) => { e.preventDefault(); objectionTitleRef.current?.focus(); } : undefined}
        {...(description ? {} : { "aria-describedby": undefined })}
      >
        <DialogHeader className="px-6 pt-6 pb-4 text-left">
          <DialogTitle className="pr-8">{t("hire.title")}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {variant === "objection_open" ? (
          <>
            <div className="px-6 pb-4"><ObjectionOpen titleRef={objectionTitleRef} /></div>
            <DialogFooter className="border-t border-border/60 px-6 py-4">
              <DialogClose asChild><Button type="button" className={BTN}>{t("hire.close")}</Button></DialogClose>
            </DialogFooter>
          </>
        ) : (
          // Mounted with the dialog content, so a reopened dialog starts without the last attempt's errors (P-2).
          <HireForm
            orgSlug={orgSlug}
            referralId={referralId}
            hire={hire}
            terms={recorded}
            partner={partner}
            defaultCurrency={defaultCurrency}
            // The result state is shown by HireResultHost (QA-N3-04); this dialog just closes.
            onRecordOnly={() => setOpen(false)}
            report={report}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** V0 (BR-45): B's own prior-presentation objection is open or contested. Focus lands on the title. */
function ObjectionOpen({ titleRef }: { titleRef?: React.RefObject<HTMLDivElement | null> }) {
  const t = useT("referrals");
  return (
    <Alert className="rounded-2xl border-info/30 bg-info-soft text-info">
      <Info aria-hidden />
      <AlertTitle ref={titleRef} tabIndex={-1} className={cn(ALERT_TITLE, "outline-none")}>{t("hire.objectionOpenTitle")}</AlertTitle>
      <AlertDescription className="text-foreground">{t("hire.objectionOpenBody")}</AlertDescription>
    </Alert>
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

function HireForm({
  orgSlug,
  referralId,
  hire,
  terms,
  partner,
  defaultCurrency,
  onRecordOnly,
  report,
}: {
  orgSlug: string;
  referralId: string;
  hire: HireDialogState;
  terms: Recorded | null;
  partner: string;
  defaultCurrency: string;
  onRecordOnly: () => void;
  report?: HireReportPrefill;
}) {
  const t = useT("referrals");
  const tc = useT("common");
  const tg = useGlobalT();
  const f = useFormatter();
  const router = useRouter();
  // Called directly (not through useActionState): a record-only hire revalidates the page and can unmount this
  // dialog before an effect would run, so the result goes to `HireResultHost` from the promise (QA-N3-04).
  const [state, setState] = useState<Awaited<ReturnType<typeof reportHire>> | null>(null);
  // PD-077 date bounds, checked before posting so the error lands on the field (the action maps the RPC's
  // `hire_dates_invalid` to a generic error; backend contract request in frontend.md).
  const [localErrors, setLocalErrors] = useState<Record<string, string[]> | null>(null);
  const [start, setStart] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  const objectionRef = useRef<HTMLDivElement>(null);
  const variant = hire.variant ?? "happy";
  const common = variant !== "happy";
  const legacy = hire.legacy || !terms;
  const err = !state || state.ok ? null : state.error;
  const termsChanged = err === tg("errors.hire_terms_changed");
  const notEligible = err === tg("errors.hire_not_eligible");
  const objection = err === tg("errors.objection_open");
  const errors: FieldErrors = localErrors ?? (state && !state.ok ? state.fieldErrors : undefined);
  const bounds = hireDateBounds(hire.delivered_at, todayEt());

  useEffect(() => {
    if (!state || state.ok) return;
    // Design P-1: the raced objection_open state takes focus on its alert title, like V0 on open.
    if (objection) {
      objectionRef.current?.focus();
      return;
    }
    // The terms moved, or the referral stopped taking a hire: re-read the page (the dialog keeps what B typed).
    // The terms moved: re-read them (N2 behaviour). Not eligible any more: B refreshes with the alert's button.
    if (termsChanged) router.refresh();
    // P-1: bring the problem into view (the body scrolls and the footer button keeps focus otherwise).
    if (!focusFirstInvalid(formRef.current)) {
      messageRef.current?.scrollIntoView({ block: "center" });
      messageRef.current?.focus({ preventScroll: true });
    }
  }, [state, termsChanged, objection, router]);
  useEffect(() => {
    if (localErrors) focusFirstInvalid(formRef.current);
  }, [localErrors]);

  const submit = async (fd: FormData) => {
    const invalid = validateHireDates(fd, bounds, tg("errors.hire_dates_invalid"));
    setLocalErrors(invalid);
    if (invalid) return;
    // A placement redirects inside the action; a record-only hire resolves here.
    const r = await reportHire(orgSlug, null, fd);
    if (r.ok && r.data?.outcome === "record_only") {
      publishHireResult({ noSplitReason: r.data.noSplitReason, partner });
      onRecordOnly();
      return;
    }
    setState(r);
  };

  if (objection) {
    // A colleague filed the objection while the dialog was open: same alert as V0, nothing was written.
    return (
      <>
        <div className="px-6 pb-4"><ObjectionOpen titleRef={objectionRef} /></div>
        <DialogFooter className="border-t border-border/60 px-6 py-4">
          <DialogClose asChild><Button type="button" className={BTN}>{t("hire.close")}</Button></DialogClose>
        </DialogFooter>
      </>
    );
  }

  const statusLabel = tg(`labels.referralStatus.${hire.status}` as Paths<Messages>);
  return (
    <ActionForm ref={formRef} action={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <input type="hidden" name="referralId" value={referralId} />
      <input type="hidden" name="version" value={hire.version} />
      {/* E3: closes the report as confirmed (not closed_by_record), backend.md v2 §14. */}
      {report ? <input type="hidden" name="reportId" value={report.id} /> : null}
      {/* The effective terms version this dialog shows; the server refuses with hire_terms_changed if it moved. */}
      {terms && !hire.legacy && variant !== "no_agreement" ? <input type="hidden" name="termsVersionId" value={terms.effective.id} /> : null}
      <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-6 pb-4">
        {termsChanged || notEligible ? (
          <Alert role="alert" className="rounded-2xl border-warning/30 bg-warning-soft text-warning">
            {notEligible ? <CircleAlert aria-hidden /> : <RefreshCw aria-hidden />}
            <AlertDescription className="grid gap-2 text-foreground">
              <span className="text-pretty">{err}</span>
              {notEligible ? (
                <Button type="button" variant="outline" size="sm" className="h-auto min-h-11 w-full justify-self-start whitespace-normal sm:min-h-9 sm:w-auto" onClick={() => router.refresh()}>
                  <RefreshCw className="size-4" aria-hidden />
                  {t("hire.refresh")}
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {/* Notice per variant (spec S3 order: notice → common fields → terms → fee → result → I ≠ C). */}
        {variant === "confirmed" ? (
          <p className="flex items-start gap-2 rounded-2xl bg-info-soft px-3.5 py-3 text-sm text-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
            <span className="text-pretty">{t("hire.anyStatusNote", { status: statusLabel })}</span>
          </p>
        ) : variant === "deemed" ? (
          <Alert className="rounded-2xl border-info/30 bg-info-soft text-info">
            <Info aria-hidden />
            <AlertTitle className={ALERT_TITLE}>{t("hire.deemedTitle")}</AlertTitle>
            <AlertDescription className="text-foreground">
              {/* V3 + V6: a legacy referral has no terms version or date, so it gets the legacy body. */}
              {terms && !hire.legacy
                ? t("hire.deemedBody", { partner, version: String(terms.snapshot.version_no), date: f.date(terms.snapshot.created_at) })
                : t("hire.deemedBodyLegacy", { partner })}
            </AlertDescription>
          </Alert>
        ) : variant === "no_agreement" ? (
          <Alert className="rounded-2xl border-border bg-muted/50 text-foreground">
            <Info aria-hidden />
            <AlertTitle className={ALERT_TITLE}>{t("hire.noAgreementTitle")}</AlertTitle>
            <AlertDescription className="text-foreground">{t("hire.noAgreementBody")}</AlertDescription>
          </Alert>
        ) : null}

        {report?.startMonth ? (
          <p className="flex items-start gap-2 rounded-2xl bg-muted/50 px-3.5 py-3 text-sm text-pretty">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            {t("hire.reportedStart", { partner, month: f.monthYear(report.startMonth) })}
          </p>
        ) : null}
        {common ? <CommonFields hire={hire} start={start} setStart={setStart} errors={errors} bounds={bounds} reportedRole={report?.role ?? null} /> : null}

        {variant === "no_agreement" ? (
          terms ? <p className="text-xs text-muted-foreground">{t("hire.noAgreementTermsLine", { version: String(terms.snapshot.version_no), date: f.date(terms.snapshot.created_at) })}</p> : null
        ) : legacy ? (
          <LegacyFields partner={partner} currency={defaultCurrency} errors={errors} showStart={!common} bounds={bounds} />
        ) : (
          <SnapshotFields terms={terms!} partner={partner} errors={errors} start={start} setStart={setStart} showStart={!common} bounds={bounds} />
        )}
        <div ref={messageRef} tabIndex={-1} className="outline-none">
          {termsChanged || notEligible ? null : <FormMessage state={localErrors ? null : state} />}
        </div>
      </div>
      <DialogFooter className="border-t border-border/60 px-6 py-4">
        <CancelButton label={tc("actions.cancel")} />
        <SubmitButton className={cn(BTN, "h-auto whitespace-normal")} pendingLabel={t("hire.recording")}>{t("hire.submit")}</SubmitButton>
      </DialogFooter>
    </ActionForm>
  );
}

type Bounds = ReturnType<typeof hireDateBounds>;

const ids = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ") || undefined;

/**
 * PD-077 allowed range, under a date input (`hire.startRange`). It stays visible when the field shows
 * `errors.hire_dates_invalid`, because that error points to it. Rendered only when both ends are known.
 */
export function DateRangeHint({ id, min, max }: { id: string; min: string | null | undefined; max: string | null | undefined }) {
  const t = useT("referrals");
  const f = useFormatter();
  if (!min || !max) return null;
  return <p id={id} className="text-xs text-pretty text-muted-foreground">{t("hire.startRange", { min: f.date(min), max: f.date(max) })}</p>;
}

/** BR-8 common fields (V2–V6): acceptance date or "unknown", start date, role hired into. */
function CommonFields({ hire, start, setStart, errors, bounds, reportedRole }: { hire: HireDialogState; start: string; setStart: (v: string) => void; errors: FieldErrors; bounds: Bounds; reportedRole?: string | null }) {
  const t = useT("referrals");
  const uid = useId();
  const [accepted, setAccepted] = useState("");
  const [unknown, setUnknown] = useState(false);
  // BR-24: "Another role at this client" with the report's role when it differs from the job title.
  const otherFromReport = !!reportedRole?.trim() && hire.other_role_allowed && reportedRole.trim().toLowerCase() !== hire.job_title.trim().toLowerCase();
  const [role, setRole] = useState<"this_job" | "other">(otherFromReport ? "other" : "this_job");
  const [title, setTitle] = useState(otherFromReport ? reportedRole!.trim().slice(0, 120) : "");
  const unknownRef = useRef<HTMLButtonElement>(null);
  const acceptedErr = fieldError(errors, "offerAcceptedOn");
  const startErr = fieldError(errors, "startDate");
  const titleErr = fieldError(errors, "otherRoleTitle");
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          {!unknown ? (
            <FormField id={`${uid}-accepted`} label={t("hire.acceptedOn")} error={acceptedErr}>
              <Input
                id={`${uid}-accepted`}
                name="offerAcceptedOn"
                type="date"
                value={accepted}
                min={bounds.min ?? undefined}
                max={bounds.today}
                onChange={(e) => setAccepted(e.target.value)}
                aria-invalid={acceptedErr ? true : undefined}
                aria-describedby={ids(bounds.min && `${uid}-accepted-range`, acceptedErr && `${uid}-accepted-error`)}
              />
              <DateRangeHint id={`${uid}-accepted-range`} min={bounds.min} max={bounds.today} />
            </FormField>
          ) : null}
          <Label className="flex min-h-11 items-start gap-3 py-2 leading-5 font-normal">
            <Checkbox
              ref={unknownRef}
              name="acceptanceUnknown"
              checked={unknown}
              onCheckedChange={(v) => {
                const on = v === true;
                setUnknown(on);
                // Ticking hides and clears the date; focus stays on the checkbox (spec §6).
                if (on) setAccepted("");
                requestAnimationFrame(() => unknownRef.current?.focus());
              }}
              className="mt-0.5"
            />
            <span className="text-sm text-pretty">{t("hire.acceptanceUnknown")}</span>
          </Label>
        </div>
        <FormField id={`${uid}-start`} label={t("hire.startDate")} required error={startErr} hint={unknown ? t("hire.startUsedForTiming") : undefined}>
          <Input
            id={`${uid}-start`}
            name="startDate"
            type="date"
            value={start}
            min={bounds.min ?? undefined}
            max={bounds.max}
            onChange={(e) => setStart(e.target.value)}
            aria-required
            aria-invalid={startErr ? true : undefined}
            aria-describedby={ids(bounds.min && `${uid}-start-range`, startErr ? `${uid}-start-error` : unknown && `${uid}-start-hint`)}
          />
          <DateRangeHint id={`${uid}-start-range`} min={bounds.min} max={bounds.max} />
        </FormField>
      </div>

      <fieldset className="grid gap-2">
        <legend id={`${uid}-role`} className="mb-1.5 text-sm font-medium">{t("hire.roleGroup")}</legend>
        <RadioGroup name="role" value={role} onValueChange={(v) => setRole(v as "this_job" | "other")} aria-labelledby={`${uid}-role`} className="gap-2">
          <Label className="flex min-h-11 items-start gap-3 rounded-2xl border border-border p-3 leading-5 font-normal">
            <RadioGroupItem value="this_job" className="mt-0.5" />
            <span className="min-w-0 text-sm text-pretty break-words">{t("hire.roleThisJob", { job: hire.job_title })}</span>
          </Label>
          {/* BR-3 / AC-9: not rendered when the referral's job had no client key. */}
          {hire.other_role_allowed ? (
            <Label className="flex min-h-11 items-start gap-3 rounded-2xl border border-border p-3 leading-5 font-normal">
              <RadioGroupItem value="other" className="mt-0.5" />
              <span className="text-sm text-pretty">{t("hire.roleOther")}</span>
            </Label>
          ) : null}
        </RadioGroup>
        {role === "other" && hire.other_role_allowed ? (
          <FormField id={`${uid}-title`} label={t("hire.otherRoleTitle")} required hint={t("hire.otherRoleHint")} error={titleErr}>
            <Input
              id={`${uid}-title`}
              name="otherRoleTitle"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              aria-required
              aria-invalid={titleErr ? true : undefined}
              aria-describedby={titleErr ? `${uid}-title-error` : `${uid}-title-hint`}
            />
            <CharCount count={title.length} max={120} />
          </FormField>
        ) : null}
      </fieldset>
    </>
  );
}

/**
 * The N2 snapshot fee block, shared with the fee-details dialog (S9). Terms are read-only text; B enters the base
 * (and bonus on total cash); the computed fee uses the TS mirror of `app.compute_fee`; a different invoiced fee
 * needs a reason (BR-15 adds non-permanent engagement, with its ⚖️ helper) and a note for "other".
 */
export function SnapshotFields({
  terms,
  partner,
  errors,
  start,
  setStart,
  showStart,
  bounds,
}: {
  terms: Recorded;
  partner: string;
  errors: FieldErrors;
  start: string;
  setStart: (v: string) => void;
  /** False when the common fields already render the start date (V2–V6). */
  showStart: boolean;
  bounds?: Bounds;
}) {
  const t = useT("referrals");
  const tj = useT("jobs");
  const tg = useGlobalT();
  const f = useFormatter();
  const uid = useId();
  const e = terms.effective;
  const cur = e.currency;
  const [base, setBase] = useState("");
  const [bonus, setBonus] = useState("");
  const [different, setDifferent] = useState(false);
  const [invoiced, setInvoiced] = useState("");
  const [reason, setReason] = useState<FeeDifferenceReason | "">("");
  const [note, setNote] = useState("");
  const toggleRef = useRef<HTMLButtonElement>(null);

  const pct = e.fee_basis !== "flat";
  const total = e.fee_basis === "pct_total_cash";
  const baseMinor = pct && base.trim() ? parseMajorToMinor(base, cur) : null;
  const bonusMinor = total ? (bonus.trim() ? parseMajorToMinor(bonus, cur) : null) : null;
  const ready = !pct || (baseMinor !== null && baseMinor > 0 && (!total || bonusMinor !== null));
  const terms4 = { feeBasis: e.fee_basis, rateBps: e.rate_bps, flatFeeMinor: e.flat_fee_minor, minFeeMinor: e.min_fee_minor };
  const computed = ready ? computeFee(terms4, { baseMinor, bonusMinor }) : null;
  const raw = ready && pct ? computeFee({ ...terms4, minFeeMinor: null }, { baseMinor, bonusMinor }) : null;
  const minimumApplies = pct && computed !== null && raw !== null && e.min_fee_minor !== null && raw < e.min_fee_minor;
  const breakdown = !pct
    ? t("hire.breakdownFlat")
    : minimumApplies
      ? t("hire.breakdownMinimum")
      : computed !== null
        ? t("hire.breakdownRate", { rate: f.percent(e.rate_bps ?? 0), amount: f.money((baseMinor ?? 0) + (bonusMinor ?? 0), cur, { code: true }) })
        : null;
  const guaranteeEnd = start ? addDays(start, e.guarantee_days) : null;
  const invoicedMinor = different && invoiced.trim() ? parseMajorToMinor(invoiced, cur) : null;
  const diff = computed !== null && invoicedMinor !== null && invoicedMinor !== computed ? invoicedMinor - computed : null;
  const startErr = fieldError(errors, "startDate");

  return (
    <>
      <section aria-labelledby={`${uid}-terms`} className="grid gap-2 rounded-2xl bg-muted/50 p-4">
        <h3 id={`${uid}-terms`} className="text-sm font-semibold">{t("hire.termsTitle")}</h3>
        <p className="text-xs text-muted-foreground">
          {terms.amended ? tj("terms.amendedLine", { date: f.date(e.created_at) }) : tj("terms.versionLine", { version: terms.snapshot.version_no, date: f.date(terms.snapshot.created_at) })}
        </p>
        <TermsSummary variant="compact" terms={termsFromRow(e)} />
      </section>

      {pct ? (
        <div className={total ? "grid gap-4 sm:grid-cols-2" : "grid gap-4"}>
          <FormField id={`${uid}-base`} label={t("hire.base", { currency: cur })} hint={t("hire.baseHint")} error={fieldError(errors, "baseSalary")}>
            <Input
              id={`${uid}-base`}
              name="baseSalary"
              inputMode="decimal"
              value={base}
              onChange={(ev) => setBase(ev.target.value)}
              aria-invalid={fieldError(errors, "baseSalary") ? true : undefined}
              aria-describedby={fieldError(errors, "baseSalary") ? `${uid}-base-error` : `${uid}-base-hint`}
            />
          </FormField>
          {total ? (
            <FormField id={`${uid}-bonus`} label={t("hire.bonus", { currency: cur })} hint={t("hire.bonusHint")} error={fieldError(errors, "targetBonus")}>
              <Input
                id={`${uid}-bonus`}
                name="targetBonus"
                inputMode="decimal"
                value={bonus}
                onChange={(ev) => setBonus(ev.target.value)}
                aria-invalid={fieldError(errors, "targetBonus") ? true : undefined}
                aria-describedby={fieldError(errors, "targetBonus") ? `${uid}-bonus-error` : `${uid}-bonus-hint`}
              />
            </FormField>
          ) : null}
        </div>
      ) : null}
      {showStart ? (
        <FormField id={`${uid}-start`} label={t("hire.startDate")} error={startErr}>
          <Input
            id={`${uid}-start`}
            name="startDate"
            type="date"
            value={start}
            min={bounds?.min ?? undefined}
            max={bounds?.max}
            onChange={(ev) => setStart(ev.target.value)}
            required
            aria-invalid={startErr ? true : undefined}
            aria-describedby={ids(bounds?.min && `${uid}-start-range`, startErr && `${uid}-start-error`)}
          />
          <DateRangeHint id={`${uid}-start-range`} min={bounds?.min} max={bounds?.max} />
        </FormField>
      ) : null}

      {/* Result box (spec S8): announced politely as the inputs change. */}
      <div role="status" aria-live="polite" className="grid gap-1 rounded-2xl border border-border p-4">
        <p className="text-xs text-muted-foreground">{t("hire.computedFee")}</p>
        <p className="text-lg font-semibold tabular-nums">{computed !== null ? f.money(computed, cur, { code: true }) : tg("common.none")}</p>
        {breakdown ? <p className="text-xs text-muted-foreground">{breakdown}</p> : null}
        <p className="mt-1 text-sm">
          {e.guarantee_days === 0 ? t("hire.noGuarantee") : guaranteeEnd ? t("hire.guaranteeEnds", { date: f.date(guaranteeEnd) }) : null}
        </p>
      </div>

      <Label className="flex min-h-11 items-start gap-3 rounded-2xl bg-muted/40 p-3 leading-5 font-normal">
        <Checkbox
          ref={toggleRef}
          name="invoicedDifferent"
          checked={different}
          onCheckedChange={(v) => {
            const on = v === true;
            setDifferent(on);
            if (!on) {
              // Unticking clears the difference fields (I = C again) and keeps focus on the box.
              setInvoiced("");
              setReason("");
              setNote("");
              requestAnimationFrame(() => toggleRef.current?.focus());
            }
          }}
          className="mt-0.5"
        />
        <span className="text-sm text-pretty">{t("hire.differentToggle")}</span>
      </Label>

      {different ? (
        <div className="grid gap-4">
          <FormField id={`${uid}-invoiced`} label={t("hire.invoiced", { currency: cur })} hint={t("hire.invoicedHint")} error={fieldError(errors, "invoicedFee")}>
            <Input
              id={`${uid}-invoiced`}
              name="invoicedFee"
              inputMode="decimal"
              value={invoiced}
              onChange={(ev) => setInvoiced(ev.target.value)}
              aria-invalid={fieldError(errors, "invoicedFee") ? true : undefined}
              aria-describedby={fieldError(errors, "invoicedFee") ? `${uid}-invoiced-error` : `${uid}-invoiced-hint`}
            />
          </FormField>
          {diff !== null ? (
            <div className="grid gap-1 rounded-2xl bg-muted/50 p-3 text-sm">
              <p className="font-medium tabular-nums">{t("hire.difference", { amount: f.money(diff, cur, { code: true, signed: true }) })}</p>
              <p className="text-pretty">{diff < 0 ? t("hire.lowerConsequence", { partner }) : t("hire.higherConsequence", { partner })}</p>
            </div>
          ) : null}
          <FormField
            id={`${uid}-reason`}
            label={t("hire.reason")}
            error={fieldError(errors, "differenceReason")}
            hint={reason === "non_permanent_engagement" ? <span className="text-pretty">{t("hire.nonPermanentHint", { partner })}</span> : undefined}
          >
            <NativeSelect
              id={`${uid}-reason`}
              name="differenceReason"
              value={reason}
              onChange={(ev) => setReason(ev.target.value as FeeDifferenceReason)}
              aria-invalid={fieldError(errors, "differenceReason") ? true : undefined}
              aria-describedby={fieldError(errors, "differenceReason") ? `${uid}-reason-error` : reason === "non_permanent_engagement" ? `${uid}-reason-hint` : undefined}
            >
              <option value="">{tg("common.none")}</option>
              {FEE_DIFFERENCE_REASONS.map((r) => <option key={r} value={r}>{tg(`labels.feeDifferenceReason.${r}`)}</option>)}
            </NativeSelect>
          </FormField>
          <FormField id={`${uid}-note`} label={reason === "other" ? t("hire.noteRequired") : t("hire.note")} required={reason === "other"} hint={t("hire.noteHint")} error={fieldError(errors, "differenceNote")}>
            <Textarea
              id={`${uid}-note`}
              name="differenceNote"
              rows={3}
              maxLength={500}
              value={note}
              onChange={(ev) => setNote(ev.target.value)}
              aria-invalid={fieldError(errors, "differenceNote") ? true : undefined}
              aria-describedby={fieldError(errors, "differenceNote") ? `${uid}-note-error` : `${uid}-note-hint`}
            />
            <CharCount count={note.length} max={500} />
          </FormField>
        </div>
      ) : null}
    </>
  );
}

/** Legacy free entry (N2 BR-26, PD-074), shared with the fee-details dialog. */
export function LegacyFields({ partner, currency, errors, showStart, bounds, defaultStart }: { partner: string; currency: string; errors: FieldErrors; showStart: boolean; bounds?: Bounds; defaultStart?: string | null }) {
  const t = useT("referrals");
  const uid = useId();
  const startErr = fieldError(errors, "startDate");
  return (
    <>
      <Alert className="rounded-2xl border-info/30 bg-info-soft text-info">
        <Info aria-hidden />
        <AlertTitle className={ALERT_TITLE}>{t("hire.legacyTitle")}</AlertTitle>
        <AlertDescription className="text-foreground">{t("hire.legacyDescription", { partner })}</AlertDescription>
      </Alert>
      <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
        <FormField id={`${uid}-fee`} label={t("hire.fee")} error={fieldError(errors, "fee")}>
          <Input id={`${uid}-fee`} name="fee" inputMode="decimal" required aria-invalid={fieldError(errors, "fee") ? true : undefined} />
        </FormField>
        <FormField id={`${uid}-currency`} label={t("hire.currency")}>
          <NativeSelect id={`${uid}-currency`} name="currency" defaultValue={currency}>
            {["CAD", "USD", "EUR", "GBP", "BRL"].map((c) => <option key={c}>{c}</option>)}
          </NativeSelect>
        </FormField>
      </div>
      {showStart ? (
        <FormField id={`${uid}-start`} label={t("hire.startDate")} error={startErr}>
          <Input id={`${uid}-start`} name="startDate" type="date" required defaultValue={defaultStart ?? undefined} min={bounds?.min ?? undefined} max={bounds?.max} aria-invalid={startErr ? true : undefined} aria-describedby={ids(bounds?.min && `${uid}-start-range`, startErr && `${uid}-start-error`)} />
          <DateRangeHint id={`${uid}-start-range`} min={bounds?.min} max={bounds?.max} />
        </FormField>
      ) : null}
      <FormField id={`${uid}-guarantee`} label={t("hire.guarantee")} error={fieldError(errors, "guaranteeDays")}>
        <Input id={`${uid}-guarantee`} name="guaranteeDays" type="number" min={0} max={365} defaultValue={90} />
      </FormField>
    </>
  );
}
