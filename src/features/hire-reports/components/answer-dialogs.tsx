"use client";

import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/shared/form-field";
import { CharCount } from "@/components/shared/char-count";
import { focusFirstInvalid } from "@/components/shared/focus-invalid";
import { BusinessDeadline } from "@/features/referrals/components/business-deadline";
import { todayEt } from "@/features/referrals/hire-dates";
import { cn } from "@/lib/utils";
import { useGlobalT, useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/actions/result";
import { contestHireReport, rebutHireReport } from "../actions";
import { HIRE_CONTEST_REASONS } from "../schemas";
import { EvidenceItems, itemsToPost, validateItems, type ItemDraft, type ItemErrors } from "./evidence-items";
import { EMPTY_EVIDENCE, HireEvidenceList, useHireEvidenceBlockReason, type HireEvidenceState } from "./hire-evidence-list";

const BTN = "h-auto min-h-11 w-full whitespace-normal sm:min-h-10 sm:w-auto";

/** Dialog shell shared by the answer forms: the form mounts on open, so state never leaks between attempts. */
export function AnswerDialog({ trigger, title, description, children }: { trigger: ReactNode; title: string; description: ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 rounded-3xl p-0 sm:max-w-lg">
        <DialogHeader className="px-6 pt-6 pb-4 text-left">
          <DialogTitle className="pr-8 leading-snug">{title}</DialogTitle>
          <DialogDescription asChild><div className="grid gap-2 text-pretty">{description}</div></DialogDescription>
        </DialogHeader>
        {open ? children(() => setOpen(false)) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Footer with the N1 "why is submit disabled" status line. */
export function AnswerFooter({ pending, blockReason, label, pendingLabel, onSubmit, onCancel, destructive }: { pending: boolean; blockReason: string | null; label: string; pendingLabel: string; onSubmit: () => void; onCancel: () => void; destructive?: boolean }) {
  const tg = useGlobalT();
  const uid = useId();
  return (
    <div className="grid gap-2 border-t border-border/60 bg-background px-6 py-4">
      {blockReason ? <p id={`${uid}-status`} className="text-sm text-pretty text-muted-foreground">{blockReason}</p> : null}
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
        <Button variant={destructive ? "destructive" : "default"} className={BTN} disabled={pending || !!blockReason} aria-describedby={blockReason ? `${uid}-status` : undefined} onClick={onSubmit}>
          {pending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          {pending ? pendingLabel : label}
        </Button>
        <Button variant="outline" className={BTN} disabled={pending} onClick={onCancel}>{tg("common.actions.cancel")}</Button>
      </div>
    </div>
  );
}

export function ServerAlert({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <Alert role="alert" className="rounded-2xl border-danger/30 bg-danger-soft text-danger">
      <CircleAlert aria-hidden />
      <AlertDescription className="text-pretty text-foreground">{text}</AlertDescription>
    </Alert>
  );
}

export function Attestation({ checked, onChange, text, error }: { checked: boolean; onChange: (v: boolean) => void; text: string; error?: string }) {
  const uid = useId();
  return (
    <div className="grid gap-1.5">
      <Label className="flex min-h-11 items-start gap-3 rounded-2xl bg-muted/50 p-3 leading-5 font-normal">
        <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" aria-required aria-invalid={error ? true : undefined} aria-describedby={error ? `${uid}-error` : undefined} />
        <span className="text-sm text-pretty">{text}</span>
      </Label>
      {error ? <p id={`${uid}-error`} role="alert" className="text-xs font-medium text-danger">{error}</p> : null}
    </div>
  );
}

function useSubmit(after: (r: ActionResult) => void) {
  const [pending, start] = useTransition();
  return { pending, run: (fn: () => Promise<ActionResult>) => start(async () => after(await fn())) };
}

/** S7 ContestHireReportDialog (BR-25, spec §2.7): exactly four reasons; dates only for `outside_window`. */
export function ContestDialog({ orgSlug, referralId, reportId, partner }: { orgSlug: string; referralId: string; reportId: string; partner: string }) {
  const t = useT("referrals");
  return (
    <AnswerDialog
      trigger={<Button variant="outline" className={BTN}>{t("hireReport.panel.contest")}</Button>}
      title={t("hireContest.title")}
      description={<p>{t("hireContest.description", { partner })}</p>}
    >
      {(close) => <ContestForm orgSlug={orgSlug} referralId={referralId} reportId={reportId} partner={partner} onDone={close} />}
    </AnswerDialog>
  );
}

function ContestForm({ orgSlug, referralId, reportId, partner, onDone }: { orgSlug: string; referralId: string; reportId: string; partner: string; onDone: () => void }) {
  const t = useT("referrals");
  const tg = useGlobalT();
  const router = useRouter();
  const uid = useId();
  const today = todayEt();
  const [reason, setReason] = useState("");
  const [accepted, setAccepted] = useState("");
  const [started, setStarted] = useState("");
  const [statement, setStatement] = useState("");
  const [attested, setAttested] = useState(false);
  const [files, setFiles] = useState<HireEvidenceState>(EMPTY_EVIDENCE);
  const [errors, setErrors] = useState<Partial<Record<"reason" | "dates" | "statement" | "attestation", string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const filedRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const blockReason = useHireEvidenceBlockReason(files);
  const outside = reason === "outside_window";
  const adminOnly = reason === "not_this_client";

  const { pending, run } = useSubmit((r) => {
    if (r.ok) {
      filedRef.current = true;
      toast.success(r.message ?? t("hireContest.submit"));
      onDone();
      router.refresh();
      return;
    }
    const fe = r.fieldErrors ?? {};
    setErrors({ dates: fe.offerAcceptedOn?.[0], statement: fe.statement?.[0], reason: fe.reason ? t("hireContest.validation.reason") : undefined, attestation: fe.attestation ? t("hireReport.validation.attestation") : undefined });
    setServerError(Object.keys(fe).length ? null : r.error);
    requestAnimationFrame(() => { if (!focusFirstInvalid(bodyRef.current)) bodyRef.current?.scrollTo({ top: 0 }); });
  });

  const submit = () => {
    const e: typeof errors = {};
    if (!reason) e.reason = t("hireContest.validation.reason");
    if (outside && (!accepted || !started || started > accepted || accepted > today)) e.dates = t("hireContest.validation.dates");
    if (statement.trim().length < 20 || statement.trim().length > 2000) e.statement = t("hireReport.validation.statement");
    if (!attested) e.attestation = t("hireReport.validation.attestation");
    setErrors(e);
    if (Object.keys(e).length) return requestAnimationFrame(() => focusFirstInvalid(bodyRef.current));
    const fd = new FormData();
    fd.set("reportId", reportId);
    fd.set("reason", reason);
    fd.set("statement", statement.trim());
    if (outside) {
      fd.set("offerAcceptedOn", accepted);
      fd.set("processStartedOn", started);
    }
    for (const id of files.readyIds) fd.append("fileIds", id);
    fd.set("attestation", "on");
    run(() => contestHireReport(orgSlug, referralId, null, fd));
  };

  return (
    <>
      <div ref={bodyRef} className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-6 pb-4">
        <ServerAlert text={serverError} />
        <fieldset className="grid gap-2">
          <legend id={`${uid}-reason`} className="mb-1 text-sm font-medium">{t("hireContest.reason")}<span className="text-danger" aria-hidden> *</span></legend>
          <RadioGroup value={reason} onValueChange={setReason} aria-labelledby={`${uid}-reason`} aria-describedby={errors.reason ? `${uid}-reason-error` : `${uid}-reason-hint`} aria-invalid={errors.reason ? true : undefined} className="gap-2">
            {HIRE_CONTEST_REASONS.map((r) => (
              <Label key={r} className="flex min-h-11 items-start gap-3 rounded-2xl border border-border p-3 leading-5 font-normal has-[[data-state=checked]]:border-foreground">
                <RadioGroupItem value={r} className="mt-0.5" />
                <span className="text-sm text-pretty">{tg(`labels.hireContestReason.${r}`)}</span>
              </Label>
            ))}
          </RadioGroup>
          {errors.reason ? <p id={`${uid}-reason-error`} role="alert" className="text-xs font-medium text-danger">{errors.reason}</p> : <p id={`${uid}-reason-hint`} className="text-xs text-pretty text-muted-foreground">{t("hireContest.noPriorHint")}</p>}
        </fieldset>

        {/* The conditional dates are announced when they appear (§6). */}
        <div aria-live="polite">
          {outside ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id={`${uid}-accepted`} label={t("hireContest.acceptedOn")} required error={errors.dates}>
                <Input id={`${uid}-accepted`} type="date" max={today} value={accepted} onChange={(e) => setAccepted(e.target.value)} aria-required aria-invalid={errors.dates ? true : undefined} aria-describedby={errors.dates ? `${uid}-accepted-error` : undefined} />
              </FormField>
              <FormField id={`${uid}-started`} label={t("hireContest.processStarted")} required hint={t("hireContest.processHint")}>
                <Input id={`${uid}-started`} type="date" max={accepted || today} value={started} onChange={(e) => setStarted(e.target.value)} aria-required aria-invalid={errors.dates ? true : undefined} aria-describedby={`${uid}-started-hint`} />
              </FormField>
            </div>
          ) : null}
        </div>

        <FormField id={`${uid}-statement`} label={t("hireContest.statement")} required hint={adminOnly ? t("hireContest.statementHintAdmin") : t("hireContest.statementHint", { partner })} error={errors.statement}>
          <Textarea id={`${uid}-statement`} rows={5} maxLength={2000} value={statement} onChange={(e) => setStatement(e.target.value)} aria-required aria-invalid={errors.statement ? true : undefined} aria-describedby={errors.statement ? `${uid}-statement-error` : `${uid}-statement-hint`} />
          <CharCount count={statement.length} max={2000} />
        </FormField>

        <HireEvidenceList orgSlug={orgSlug} referralId={referralId} kind="hire_contest" label={t("hireContest.files")} hint={t("hireContest.filesHint")} onChange={setFiles} filedRef={filedRef} />

        <Attestation checked={attested} onChange={setAttested} text={t("hireContest.attestation")} error={errors.attestation} />
      </div>
      <AnswerFooter pending={pending} blockReason={blockReason} label={t("hireContest.submit")} pendingLabel={tg("common.actions.working")} onSubmit={submit} onCancel={onDone} />
    </>
  );
}

/** S8 HireRebuttalDialog (BR-26, spec §2.8): once, before `rebuttal_due_at`. */
export function RebuttalDialog({ orgSlug, referralId, reportId, partner, dueAt, left }: { orgSlug: string; referralId: string; reportId: string; partner: string; dueAt: string | null; left: number | null }) {
  const t = useT("referrals");
  return (
    <AnswerDialog
      trigger={<Button className={BTN}>{t("hireReport.panel.addRebuttal")}</Button>}
      title={t("hireRebuttal.title")}
      description={<>
        <p>{t("hireRebuttal.description")}</p>
        {dueAt ? <BusinessDeadline at={dueAt} left={left} className="text-foreground" /> : null}
      </>}
    >
      {(close) => <RebuttalForm orgSlug={orgSlug} referralId={referralId} reportId={reportId} partner={partner} onDone={close} />}
    </AnswerDialog>
  );
}

function RebuttalForm({ orgSlug, referralId, reportId, partner, onDone }: { orgSlug: string; referralId: string; reportId: string; partner: string; onDone: () => void }) {
  const t = useT("referrals");
  const tg = useGlobalT();
  const router = useRouter();
  const uid = useId();
  const today = todayEt();
  const [statement, setStatement] = useState("");
  const [attested, setAttested] = useState(false);
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [files, setFiles] = useState<HireEvidenceState>(EMPTY_EVIDENCE);
  const [errors, setErrors] = useState<Partial<Record<"statement" | "attestation", string>>>({});
  const [itemErrors, setItemErrors] = useState<ItemErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const filedRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const blockReason = useHireEvidenceBlockReason(files);

  const { pending, run } = useSubmit((r) => {
    if (r.ok) {
      filedRef.current = true;
      toast.success(r.message ?? t("hireRebuttal.submit"));
      onDone();
      router.refresh();
      return;
    }
    const fe = r.fieldErrors ?? {};
    setErrors({ statement: fe.statement?.[0], attestation: fe.attestation ? t("hireReport.validation.attestation") : undefined });
    setServerError(Object.keys(fe).length ? (fe.items?.[0] ?? null) : r.error);
    requestAnimationFrame(() => focusFirstInvalid(bodyRef.current));
  });

  const submit = () => {
    const e: typeof errors = {};
    if (statement.trim().length < 20 || statement.trim().length > 2000) e.statement = t("hireReport.validation.statement");
    if (!attested) e.attestation = t("hireReport.validation.attestation");
    const ie = validateItems(items, today, { date: t("hireReport.validation.itemDate"), captured: t("hireReport.validation.capturedBefore"), link: t("hireReport.validation.link"), type: t("hireReport.validation.itemType") });
    setErrors(e);
    setItemErrors(ie);
    if (Object.keys(e).length || Object.keys(ie).length) return requestAnimationFrame(() => focusFirstInvalid(bodyRef.current));
    const fd = new FormData();
    fd.set("reportId", reportId);
    fd.set("statement", statement.trim());
    fd.set("items", itemsToPost(items));
    for (const id of files.readyIds) fd.append("fileIds", id);
    fd.set("attestation", "on");
    run(() => rebutHireReport(orgSlug, referralId, null, fd));
  };

  return (
    <>
      <div ref={bodyRef} className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-6 pb-4">
        <ServerAlert text={serverError} />
        <FormField id={`${uid}-statement`} label={t("hireReport.statement")} required error={errors.statement}>
          <Textarea id={`${uid}-statement`} rows={5} maxLength={2000} value={statement} onChange={(e) => setStatement(e.target.value)} aria-required aria-invalid={errors.statement ? true : undefined} aria-describedby={errors.statement ? `${uid}-statement-error` : undefined} />
          <CharCount count={statement.length} max={2000} />
        </FormField>
        <fieldset className={cn("grid gap-2")}>
          <legend className="text-sm font-medium">{t("hireReport.evidence")}</legend>
          <EvidenceItems items={items} setItems={setItems} errors={itemErrors} min={0} today={today} tail={false} />
        </fieldset>
        <HireEvidenceList orgSlug={orgSlug} referralId={referralId} kind="hire_rebuttal" label={t("hireReport.files")} hint={t("hireReport.filesHint", { partner })} onChange={setFiles} filedRef={filedRef} />
        <Attestation checked={attested} onChange={setAttested} text={t("hireReport.attestation")} error={errors.attestation} />
      </div>
      <AnswerFooter pending={pending} blockReason={blockReason} label={t("hireRebuttal.submit")} pendingLabel={tg("common.actions.working")} onSubmit={submit} onCancel={onDone} />
    </>
  );
}
