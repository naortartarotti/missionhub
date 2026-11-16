"use client";

import { useEffect, useId, useRef, useState, useTransition, type BaseSyntheticEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type ResolverResult } from "react-hook-form";
import { CheckCircle2, CircleAlert, Flag, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useFormatter, useGlobalT, useT } from "@/i18n/client";
import { translateMarked } from "@/i18n/translate";
import { cn } from "@/lib/utils";
import { fileConductReport, getConductReportContext } from "../actions";
import { fileReportSchema } from "../schemas";
import type { ConductCategory } from "../domain";
import type { ReportContext } from "../types";
import { EvidenceUploadList, useEvidenceBlockReason, type EvidenceState } from "./evidence-upload-list";
import { SupportSentence } from "./support-sentence";

/**
 * "Use the right tool" lines (RD-044), decided on the server for this referral and side. Links close
 * the report and take the member to the existing flow on the page or the placement.
 */
export type RightTool = {
  position: { label: "file" | "contest"; href: string } | "text" | null;
  /**
   * `true`: N10's support sentence. N3 §2.5 (AC-50): `{href, label}` links **Report a hire** on the referral
   * (closes this dialog); `{text}` is the plain `hireReport.rightToolUnavailable` line.
   */
  hire: boolean | { href: string; label: string } | { text: string };
  amount: { href: string } | "text";
  noAnswer: "source" | "target" | "job";
};

type Target = { referralId: string; matchId?: never } | { matchId: string; referralId?: never };
type Values = { category: string; description: string; occurredOn: string; occurredApprox: boolean; attested: boolean };
type FieldKey = keyof Values;

const todayEt = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** S7 entry point + S8 dialog (§2.8). Hidden by the caller for platform admins and internal referrals. */
export function ReportProblemButton({ orgSlug, target, orgName, rightTool, supportEmail }: { orgSlug: string; target: Target; orgName: string; rightTool: RightTool; supportEmail: string | null }) {
  const t = useT("network");
  const [open, setOpen] = useState(false);
  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="min-h-11 min-w-11 sm:min-h-8" aria-label={t("report.buttonAria", { org: orgName })} onClick={() => setOpen(true)}>
              <Flag className="size-4" aria-hidden />
              <span className="hidden sm:inline">{t("report.button")}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent className="sm:hidden">{t("report.button")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {open ? <ReportDialog orgSlug={orgSlug} target={target} rightTool={rightTool} supportEmail={supportEmail} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ReportDialog({ orgSlug, target, rightTool, supportEmail, onClose }: { orgSlug: string; target: Target; rightTool: RightTool; supportEmail: string | null; onClose: () => void }) {
  const t = useT("network");
  const tg = useGlobalT();
  const f = useFormatter();
  const router = useRouter();
  const uid = useId();
  const [ctx, setCtx] = useState<ReportContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [files, setFiles] = useState<EvidenceState | null>(null);
  const [serverError, setServerError] = useState<{ code?: string; text: string } | null>(null);
  const [sent, setSent] = useState<{ caseId: string; due: string } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pending, start] = useTransition();
  const filedRef = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const sentHeading = useRef<HTMLHeadingElement>(null);
  const blockReason = useEvidenceBlockReason(files);
  const today = todayEt();

  useEffect(() => {
    let live = true;
    getConductReportContext(orgSlug, target).then((r) => {
      if (!live) return;
      if (r.ok && r.data) setCtx(r.data);
      else setLoadError(!r.ok && r.code === "report_self" ? t("report.errors.self") : t("report.errors.notFound"));
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toInput = (v: Values) => ({
    ...target,
    category: v.category,
    description: v.description,
    occurredOn: v.occurredOn || null,
    occurredApprox: v.occurredApprox,
    attested: v.attested,
    fileIds: files?.readyIds ?? [],
  });
  const form = useForm<Values>({
    defaultValues: { category: "", description: "", occurredOn: "", occurredApprox: false, attested: false },
    // Same schema as fileConductReport; the copy for each field comes from §5.5.
    resolver: async (values) => {
      const errors: Partial<Record<FieldKey, { type: string; message: string }>> = {};
      const r = fileReportSchema.safeParse(toInput(values));
      if (!r.success) {
        for (const issue of r.error.issues) {
          const p = issue.path[0] as string;
          if (p === "category") errors.category ??= { type: "validate", message: t("report.errors.category") };
          else if (p === "description") errors.description ??= { type: "validate", message: translateMarked(tg, issue.message) };
          else if (p === "attested") errors.attested ??= { type: "validate", message: t("report.errors.attest") };
          else if (p === "occurredOn") errors.occurredOn ??= { type: "validate", message: tg("errors.invalidFields") };
        }
      }
      if (values.occurredOn && values.occurredOn > today) errors.occurredOn = { type: "validate", message: t("report.errors.dateFuture") };
      return (Object.keys(errors).length ? { values: {}, errors } : { values, errors: {} }) as unknown as ResolverResult<Values>;
    },
  });
  const { errors } = form.formState;
  const description = useWatch({ control: form.control, name: "description" }) ?? "";
  const category = useWatch({ control: form.control, name: "category" }) ?? "";
  const occurredApprox = useWatch({ control: form.control, name: "occurredApprox" });
  const attested = useWatch({ control: form.control, name: "attested" });
  const dirty = form.formState.isDirty || (files?.count ?? 0) > 0;
  const errorCount = Object.keys(errors).length;

  const requestClose = () => {
    if (!sent && dirty && !pending) setConfirmDiscard(true);
    else onClose();
  };

  const submit = (e?: BaseSyntheticEvent) => form.handleSubmit(
    (v) =>
      start(async () => {
        setServerError(null);
        const r = await fileConductReport(orgSlug, toInput(v));
        if (!r.ok) {
          const fe = r.fieldErrors ?? {};
          if (fe.description?.[0]) form.setError("description", { message: fe.description[0] });
          if (fe.attested?.[0]) form.setError("attested", { message: t("report.errors.attest") });
          if (fe.category?.[0]) form.setError("category", { message: t("report.errors.category") });
          if (!Object.keys(fe).length) {
            const text =
              r.code === "conduct_date_future"
                ? (form.setError("occurredOn", { message: t("report.errors.dateFuture") }), null)
                : r.code === "report_self"
                  ? t("report.errors.self")
                  : r.error;
            if (text !== null) setServerError({ code: r.code, text });
            requestAnimationFrame(() => errorRef.current?.focus());
          }
          return;
        }
        filedRef.current = true;
        setSent({ caseId: r.data!.caseId, due: r.data!.firstResponseDueAt });
        router.refresh();
        requestAnimationFrame(() => sentHeading.current?.focus());
      }),
    (errs) => {
      const order: FieldKey[] = ["category", "description", "occurredOn", "attested"];
      const first = order.find((k) => errs[k]);
      requestAnimationFrame(() => document.getElementById(`${uid}-${first}`)?.focus());
    },
  )(e);

  const orgName = ctx?.reportedOrgName ?? "";
  const rateLimit = serverError?.code === "report_rate_limited_user" ? "user" : serverError?.code === "report_rate_limited_org" ? "org" : null;

  return (
    <>
      <Dialog open onOpenChange={(o) => (o ? null : requestClose())}>
        <DialogContent className="flex max-h-[100dvh] flex-col gap-0 overflow-hidden p-0 max-sm:inset-0 max-sm:h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:rounded-t-3xl sm:max-h-[90dvh] sm:max-w-xl sm:rounded-3xl">
          {sent ? (
            <div className="grid gap-4 p-6">
              <CheckCircle2 className="size-8 text-success" aria-hidden />
              <DialogTitle asChild>
                <h2 ref={sentHeading} tabIndex={-1} className="text-xl font-semibold outline-none">{t("report.sentTitle")}</h2>
              </DialogTitle>
              <DialogDescription className="text-[15px] text-foreground">{t("report.sentBody", { when: f.etDateTime(sent.due) })}</DialogDescription>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild className="min-h-11 sm:min-h-10">
                  <Link href={`/workspace/${orgSlug}/reports/${sent.caseId}`}>{t("report.view")}</Link>
                </Button>
                <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={onClose}>{tg("common.actions.close")}</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="sticky top-0 z-10 border-b border-border/60 bg-background px-6 pt-6 pb-4">
                <DialogTitle className="pr-8 leading-snug">{ctx ? t("report.title", { org: orgName }) : t("report.button")}</DialogTitle>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                {loadError ? (
                  <div className="grid gap-4">
                    <DialogDescription role="alert" className="flex items-start gap-2 text-sm text-danger">
                      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {loadError}
                    </DialogDescription>
                    <Button variant="outline" className="min-h-11 justify-self-start" onClick={onClose}>{tg("common.actions.close")}</Button>
                  </div>
                ) : !ctx ? (
                  <div className="grid gap-3" aria-busy="true">
                    <DialogDescription className="sr-only">{t("report.button")}</DialogDescription>
                    <Skeleton className="h-16 rounded-2xl" />
                    <Skeleton className="h-40 rounded-2xl" />
                    <Skeleton className="h-24 rounded-2xl" />
                  </div>
                ) : (
                  <form id={`${uid}-form`} noValidate onSubmit={(e) => void submit(e)} className="grid gap-5">
                    <DialogDescription asChild>
                      <div className="grid gap-2 text-sm text-foreground">
                        <p className="text-pretty">{t("report.intro", { org: orgName })}</p>
                        {ctx.side !== "job" ? <p className="text-pretty text-muted-foreground">{t("report.messagesFirst")}</p> : null}
                      </div>
                    </DialogDescription>

                    {serverError ? (
                      <div ref={errorRef} tabIndex={-1} role="alert" className="flex items-start gap-2 rounded-2xl bg-danger-soft px-3.5 py-3 text-sm text-danger outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                        {rateLimit === "user" ? (
                          <SupportSentence before={t("report.errors.userLimitBefore")} after={t("report.errors.userLimitAfter")} noSupport={t("report.errors.userLimitNoSupport")} email={supportEmail} />
                        ) : rateLimit === "org" ? (
                          <SupportSentence before={t("report.errors.orgLimitBefore")} after={t("report.errors.orgLimitAfter")} noSupport={t("report.errors.orgLimitNoSupport")} email={supportEmail} />
                        ) : (
                          <span>{serverError.text}</span>
                        )}
                      </div>
                    ) : null}
                    {errorCount > 1 ? <p role="status" className="text-sm font-medium text-danger">{t("report.errorSummary", { count: errorCount })}</p> : null}

                    <RightToolBlock tool={rightTool} side={ctx.side} orgName={orgName} supportEmail={supportEmail} onNavigate={onClose} />

                    <fieldset className="grid gap-2">
                      <legend id={`${uid}-category-label`} className="mb-2 text-sm font-medium">{t("report.category")}</legend>
                      <RadioGroup
                        id={`${uid}-category`}
                        value={category}
                        onValueChange={(v) => form.setValue("category", v, { shouldDirty: true, shouldValidate: form.formState.isSubmitted })}
                        aria-labelledby={`${uid}-category-label`}
                        aria-invalid={errors.category ? true : undefined}
                        aria-describedby={errors.category ? `${uid}-category-error` : undefined}
                        className="gap-2"
                      >
                        {ctx.categories.map((c) => (
                          <Label key={c} className="flex min-h-11 items-start gap-3 rounded-2xl border border-border/60 p-3 font-normal has-[[data-state=checked]]:border-foreground">
                            <RadioGroupItem value={c} className="mt-0.5" aria-describedby={`${uid}-hint-${c}`} />
                            <span className="grid gap-0.5">
                              <span className="text-sm font-medium">{tg(`labels.conductCategory.${c as ConductCategory}`)}</span>
                              <span id={`${uid}-hint-${c}`} className="text-xs text-muted-foreground">
                                {t(`report.categoryHint.${c as ConductCategory}`)}
                                {c === "hire_payout" ? <span className="mt-1 block font-medium text-foreground">{t("report.hirePayoutMoney")}</span> : null}
                              </span>
                            </span>
                          </Label>
                        ))}
                      </RadioGroup>
                      {errors.category ? <p id={`${uid}-category-error`} role="alert" className="text-xs font-medium text-danger">{errors.category.message}</p> : null}
                    </fieldset>

                    <div className="grid gap-1.5">
                      <Label htmlFor={`${uid}-description`} className="text-sm font-medium">{t("report.what")}</Label>
                      <Textarea
                        id={`${uid}-description`}
                        rows={6}
                        maxLength={4000}
                        aria-invalid={errors.description ? true : undefined}
                        aria-describedby={[errors.description ? `${uid}-description-error` : `${uid}-description-hint`, `${uid}-counter`].join(" ")}
                        {...form.register("description")}
                      />
                      {errors.description ? (
                        <p id={`${uid}-description-error`} role="alert" className="text-xs font-medium text-danger">{errors.description.message}</p>
                      ) : (
                        <p id={`${uid}-description-hint`} className="text-xs text-muted-foreground">{t("report.whatHint")}</p>
                      )}
                      <p id={`${uid}-counter`} className="text-right text-xs text-muted-foreground tabular-nums" aria-live={description.length > 3800 ? "polite" : "off"}>
                        <span aria-hidden>{t("report.counter", { count: description.length, max: 4000 })}</span>
                        <span className="sr-only">{t("report.counterSr", { count: description.length, max: 4000 })}</span>
                      </p>
                    </div>

                    <div className="grid gap-1.5">
                      <Label htmlFor={`${uid}-occurredOn`} className="text-sm font-medium">{t("report.when")}</Label>
                      <Input
                        id={`${uid}-occurredOn`}
                        type="date"
                        max={today}
                        className="h-11 max-w-xs sm:h-10"
                        aria-invalid={errors.occurredOn ? true : undefined}
                        aria-describedby={errors.occurredOn ? `${uid}-occurredOn-error` : undefined}
                        {...form.register("occurredOn")}
                      />
                      {errors.occurredOn ? <p id={`${uid}-occurredOn-error`} role="alert" className="text-xs font-medium text-danger">{errors.occurredOn.message}</p> : null}
                      <Label className="flex min-h-11 items-center gap-2.5 text-sm font-normal">
                        <Checkbox checked={occurredApprox} onCheckedChange={(v) => form.setValue("occurredApprox", v === true, { shouldDirty: true })} />
                        {t("report.approximate")}
                      </Label>
                    </div>

                    <EvidenceUploadList orgSlug={orgSlug} label={t("report.files")} hint={t("report.filesHint")} onChange={setFiles} filedRef={filedRef} />

                    <p className="flex items-start gap-2 rounded-2xl bg-info-soft px-3.5 py-3 text-sm text-foreground">
                      <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
                      <span className="text-pretty">{ctx.side === "job" ? t("report.identityJob", { org: orgName }) : t("report.identity", { org: orgName })}</span>
                    </p>

                    <div className="grid gap-1.5">
                      <Label className="flex min-h-11 items-start gap-2.5 rounded-2xl bg-muted/50 p-3 leading-5 font-normal">
                        <Checkbox
                          id={`${uid}-attested`}
                          checked={attested}
                          onCheckedChange={(v) => form.setValue("attested", v === true, { shouldDirty: true, shouldValidate: form.formState.isSubmitted })}
                          className="mt-0.5"
                          aria-invalid={errors.attested ? true : undefined}
                          aria-describedby={errors.attested ? `${uid}-attested-error` : undefined}
                        />
                        <span className="text-sm">{t("report.attest")}</span>
                      </Label>
                      {errors.attested ? <p id={`${uid}-attested-error`} role="alert" className="text-xs font-medium text-danger">{errors.attested.message}</p> : null}
                    </div>
                  </form>
                )}
              </div>
              {ctx && !loadError ? (
                <div className="sticky bottom-0 grid gap-2 border-t border-border/60 bg-background px-6 py-4">
                  {blockReason ? <p id={`${uid}-status`} className="text-sm text-muted-foreground">{blockReason}</p> : null}
                  <Button type="submit" form={`${uid}-form`} className="min-h-11 sm:min-h-10 sm:justify-self-end" disabled={pending || !!blockReason} aria-describedby={blockReason ? `${uid}-status` : undefined}>
                    {pending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                    {pending ? t("report.sending") : t("report.submit")}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title={t("report.discardTitle")}
        description={t("report.discardBody")}
        confirmLabel={t("report.discardConfirm")}
        destructive
        onConfirm={async () => {
          setConfirmDiscard(false);
          onClose();
        }}
      />
    </>
  );
}

function RightToolBlock({ tool, side, orgName, supportEmail, onNavigate }: { tool: RightTool; side: ReportContext["side"]; orgName: string; supportEmail: string | null; onNavigate: () => void }) {
  const t = useT("network");
  const link = (href: string, label: string) => (
    <Link href={href} onClick={onNavigate} className="font-medium underline underline-offset-4">
      {label}
    </Link>
  );
  const job = side === "job";
  return (
    <details open className="group rounded-2xl border border-border/60 px-4 py-3 text-sm">
      <summary className="min-h-9 cursor-pointer font-medium">{t("report.rightTool.title")}</summary>
      <ul className="mt-2 grid gap-3">
        {!job && tool.position ? (
          <li className="grid gap-0.5">
            <span className="font-medium">{t("report.rightTool.position")}</span>
            <span className={cn("text-muted-foreground")}>
              {tool.position === "text" ? t("report.rightTool.positionText") : link(tool.position.href, tool.position.label === "file" ? t("report.rightTool.fileObjection") : t("report.rightTool.contestObjection"))}
            </span>
          </li>
        ) : null}
        {!job && tool.hire ? (
          <li className="grid gap-0.5">
            <span className="font-medium">{t("report.rightTool.hire")}</span>
            <span className="text-muted-foreground">
              {typeof tool.hire === "object" && "href" in tool.hire ? (
                link(tool.hire.href, tool.hire.label)
              ) : typeof tool.hire === "object" ? (
                <span className="text-pretty">{tool.hire.text}</span>
              ) : (
                <SupportSentence before={t("report.rightTool.hireTextBefore", { org: orgName })} after={t("report.rightTool.hireTextAfter")} noSupport={t("report.rightTool.hireTextNoSupport", { org: orgName })} email={supportEmail} />
              )}
            </span>
          </li>
        ) : null}
        <li className="grid gap-0.5">
          <span className="font-medium">{t("report.rightTool.amount")}</span>
          <span className="text-muted-foreground">{!job && tool.amount !== "text" ? link(tool.amount.href, t("report.rightTool.openDispute")) : t("report.rightTool.amountText")}</span>
        </li>
        <li className="grid gap-0.5">
          <span className="font-medium">{t("report.rightTool.noAnswer")}</span>
          <span className="text-muted-foreground">
            {side === "job" ? t("report.rightTool.noAnswerTextJob") : side === "target" ? t("report.rightTool.noAnswerTextHiring") : t("report.rightTool.noAnswerText")}
          </span>
        </li>
      </ul>
    </details>
  );
}
