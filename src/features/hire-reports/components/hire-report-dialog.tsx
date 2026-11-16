"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BadgeCheck, CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/shared/form-field";
import { CharCount } from "@/components/shared/char-count";
import { NativeSelect } from "@/components/shared/native-select";
import { focusFirstInvalid } from "@/components/shared/focus-invalid";
import { cn } from "@/lib/utils";
import { useFormatter, useGlobalT, useT } from "@/i18n/client";
import { fileHireReport } from "../actions";
import { HIRE_LEARNED_VIA } from "../schemas";
import { todayEt } from "@/features/referrals/hire-dates";
import { startMonthRange } from "../form-helpers";
import { EvidenceItems, itemsToPost, newItem, validateItems, type ItemDraft, type ItemErrors } from "./evidence-items";
import { EMPTY_EVIDENCE, HireEvidenceList, useHireEvidenceBlockReason, type HireEvidenceState } from "./hire-evidence-list";

const ALERT_TITLE = "line-clamp-none whitespace-normal text-pretty";
const BTN = "min-h-11 w-full sm:min-h-10 sm:w-auto";

/**
 * S5 HireReportDialog (BR-6, BR-17 to BR-20, spec §2.5). Outcomes are returned results: filed → toast + refresh;
 * the generic refusal, the org rate limit and "already recorded" render inline at the top and keep every value.
 */
export function HireReportDialog({
  orgSlug,
  referralId,
  partner,
  deliveredAt,
  tail,
  windowEnd,
  defaultOpen = false,
}: {
  orgSlug: string;
  referralId: string;
  partner: string;
  deliveredAt: string | null;
  /** Between window end + 6 and + 9 months: the tail statement is required (BR-6). */
  tail: boolean;
  windowEnd: string | null;
  /** Opened from N10's Report a problem link (`?reportHire=1`). */
  defaultOpen?: boolean;
}) {
  const t = useT("referrals");
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className={cn(BTN, "h-auto whitespace-normal")}>
          <BadgeCheck className="size-4" aria-hidden /> {t("hireReport.trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 rounded-3xl p-0 sm:max-w-lg">
        <DialogHeader className="px-6 pt-6 pb-4 text-left">
          <DialogTitle className="pr-8 leading-snug">{t("hireReport.title", { partner })}</DialogTitle>
          <DialogDescription className="text-pretty">{t("hireReport.description", { partner })}</DialogDescription>
        </DialogHeader>
        {open ? <HireReportForm orgSlug={orgSlug} referralId={referralId} partner={partner} deliveredAt={deliveredAt} tail={tail} windowEnd={windowEnd} onDone={() => setOpen(false)} onCancel={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

type Errors = Partial<Record<"employer" | "startMonth" | "learnedVia" | "statement" | "tail" | "items" | "attestation" | "role", string>>;

function HireReportForm({
  orgSlug,
  referralId,
  partner,
  deliveredAt,
  tail,
  windowEnd,
  onDone,
  onCancel,
}: {
  orgSlug: string;
  referralId: string;
  partner: string;
  deliveredAt: string | null;
  tail: boolean;
  windowEnd: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useT("referrals");
  const tp = useT("pipeline");
  const tg = useGlobalT();
  const f = useFormatter();
  const router = useRouter();
  const uid = useId();
  const today = todayEt();
  const range = startMonthRange(deliveredAt, today);
  const [employer, setEmployer] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [role, setRole] = useState("");
  const [learnedVia, setLearnedVia] = useState("");
  const [statement, setStatement] = useState("");
  const [tailMade, setTailMade] = useState(false);
  const [attested, setAttested] = useState(false);
  const [items, setItems] = useState<ItemDraft[]>(() => [newItem()]);
  const [files, setFiles] = useState<HireEvidenceState>(EMPTY_EVIDENCE);
  const [errors, setErrors] = useState<Errors>({});
  const [itemErrors, setItemErrors] = useState<ItemErrors>({});
  const [outcome, setOutcome] = useState<{ kind: "unavailable" | "rate" | "recorded" | "other"; text: string; placementId?: string | null } | null>(null);
  const [pending, start] = useTransition();
  const filedRef = useRef(false);
  const formRef = useRef<HTMLDivElement>(null);
  const outcomeRef = useRef<HTMLDivElement>(null);
  const blockReason = useHireEvidenceBlockReason(files);
  const statusId = `${uid}-status`;

  const years = useMemo(() => {
    const out: string[] = [];
    for (let y = Number(range.from.slice(0, 4)); y <= Number(range.to.slice(0, 4)); y++) out.push(String(y));
    return out;
  }, [range.from, range.to]);
  const monthName = useMemo(() => new Intl.DateTimeFormat(f.tag, { month: "long", timeZone: "UTC" }), [f.tag]);
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).filter((m) => !year || (`${year}-${m}` >= range.from && `${year}-${m}` <= range.to));

  useEffect(() => {
    if (outcome) outcomeRef.current?.focus();
  }, [outcome]);

  const submit = () => {
    const startMonth = year && month ? `${year}-${month}` : "";
    const e: Errors = {};
    if (!employer.trim() || employer.trim().length > 200) e.employer = t("hireReport.validation.employer");
    if (!startMonth || startMonth < range.from || startMonth > range.to) e.startMonth = t("hireReport.validation.startMonth");
    if (!learnedVia) e.learnedVia = t("hireReport.validation.learnedVia");
    if (statement.trim().length < 20 || statement.trim().length > 2000) e.statement = t("hireReport.validation.statement");
    if (tail && (!tailMade || !items.some((i) => i.backsTail))) e.tail = t("hireReport.validation.tail");
    if (!items.length) e.items = t("hireReport.evidenceHint");
    if (!attested) e.attestation = t("hireReport.validation.attestation");
    const ie = validateItems(items, today, {
      date: t("hireReport.validation.itemDate"),
      captured: t("hireReport.validation.capturedBefore"),
      link: t("hireReport.validation.link"),
      type: t("hireReport.validation.itemType"),
    });
    setErrors(e);
    setItemErrors(ie);
    if (Object.keys(e).length || Object.keys(ie).length) {
      requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      return;
    }
    const fd = new FormData();
    fd.set("referralId", referralId);
    fd.set("employer", employer.trim());
    fd.set("startMonth", startMonth);
    fd.set("role", role.trim());
    fd.set("learnedVia", learnedVia);
    fd.set("statement", statement.trim());
    if (tail && tailMade) fd.set("tailStatement", "on");
    fd.set("items", itemsToPost(items));
    for (const id of files.readyIds) fd.append("fileIds", id);
    fd.set("attestation", "on");
    start(async () => {
      const r = await fileHireReport(orgSlug, null, fd);
      if (r.ok) {
        filedRef.current = true;
        toast.success(r.message ?? t("hireReport.panel.title"));
        onDone();
        router.refresh();
        return;
      }
      const fe = r.fieldErrors ?? {};
      if (Object.keys(fe).length) {
        setErrors({
          employer: fe.employer?.[0],
          startMonth: fe.startMonth?.[0],
          learnedVia: fe.learnedVia ? t("hireReport.validation.learnedVia") : undefined,
          statement: fe.statement?.[0],
          tail: fe.tailStatement?.[0],
          items: fe.items?.[0],
          attestation: fe.attestation ? t("hireReport.validation.attestation") : undefined,
          role: fe.role ? t("hireReport.validation.role") : undefined,
        });
        setOutcome(null);
        requestAnimationFrame(() => focusFirstInvalid(formRef.current));
        return;
      }
      // One generic refusal for every eligibility cause (AC-35): same text, same shape.
      const kind =
        r.error === tg("errors.hire_report_unavailable") ? "unavailable"
        : r.error === tg("errors.hire_report_rate_limited") ? "rate"
        : r.error === tg("errors.hire_already_recorded", { partner }) ? "recorded"
        : "other";
      // v2.1 (AC-36): the action names the placement A can already open (null for a hire recorded without a split).
      setOutcome({ kind, text: r.error, placementId: r.target?.placementId ?? null });
    });
  };

  return (
    <>
      <div ref={formRef} className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-6 pb-4">
        {outcome ? (
          <div ref={outcomeRef} tabIndex={-1} className="outline-none">
            <Alert role="alert" className="rounded-2xl border-warning/30 bg-warning-soft text-warning">
              <CircleAlert aria-hidden />
              <AlertDescription className="grid gap-2 text-foreground">
                <span className={ALERT_TITLE}>{outcome.text}</span>
                {outcome.kind === "unavailable" ? <span className="text-pretty text-muted-foreground">{t("hireReport.unavailableHint", { partner })}</span> : null}
                {outcome.kind === "recorded" ? (
                  outcome.placementId ? (
                    <Button variant="outline" size="sm" className="h-auto min-h-11 w-full justify-self-start whitespace-normal sm:w-auto" asChild>
                      <Link href={`/workspace/${orgSlug}/commissions/${outcome.placementId}`}>{tp("openPlacement")}</Link>
                    </Button>
                  ) : (
                    // A hire recorded without a split: the referral page itself shows it once refreshed.
                    <Button type="button" variant="outline" size="sm" className="h-auto min-h-11 w-full justify-self-start whitespace-normal sm:w-auto" onClick={() => { onCancel(); router.refresh(); }}>
                      {tp("openReferral")}
                    </Button>
                  )
                ) : null}
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        {tail ? (
          <div className="grid gap-1.5">
            <Label className="flex min-h-11 items-start gap-3 rounded-2xl bg-muted/50 p-3 leading-5 font-normal">
              <Checkbox
                checked={tailMade}
                onCheckedChange={(v) => setTailMade(v === true)}
                className="mt-0.5"
                aria-required
                aria-invalid={errors.tail ? true : undefined}
                aria-describedby={errors.tail ? `${uid}-tail-error` : `${uid}-tail-hint`}
              />
              <span className="text-sm text-pretty">{t("hireReport.tailStatement", { windowEnd: f.date(windowEnd) })}</span>
            </Label>
            {errors.tail ? (
              <p id={`${uid}-tail-error`} role="alert" className="text-xs font-medium text-danger">{errors.tail}</p>
            ) : (
              <p id={`${uid}-tail-hint`} className="text-xs text-pretty text-muted-foreground">{t("hireReport.tailHint")}</p>
            )}
          </div>
        ) : null}

        <FormField id={`${uid}-employer`} label={t("hireReport.employer")} required hint={t("hireReport.employerHint", { partner })} error={errors.employer}>
          <Input id={`${uid}-employer`} value={employer} maxLength={200} onChange={(e) => setEmployer(e.target.value)} aria-required aria-invalid={errors.employer ? true : undefined} aria-describedby={errors.employer ? `${uid}-employer-error` : `${uid}-employer-hint`} />
          <CharCount count={employer.length} max={200} />
        </FormField>

        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">{t("hireReport.startMonth")}<span className="text-danger" aria-hidden> *</span></legend>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label htmlFor={`${uid}-month`} className="text-xs text-muted-foreground">{t("hireReport.month")}</Label>
              <NativeSelect id={`${uid}-month`} value={month} onChange={(e) => setMonth(e.target.value)} aria-invalid={errors.startMonth ? true : undefined} aria-describedby={errors.startMonth ? `${uid}-start-error` : undefined}>
                <option value="">{tg("common.none")}</option>
                {months.map((m) => <option key={m} value={m}>{monthName.format(new Date(Date.UTC(2026, Number(m) - 1, 1)))}</option>)}
              </NativeSelect>
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`${uid}-year`} className="text-xs text-muted-foreground">{t("hireReport.year")}</Label>
              <NativeSelect id={`${uid}-year`} value={year} onChange={(e) => setYear(e.target.value)} aria-invalid={errors.startMonth ? true : undefined} aria-describedby={errors.startMonth ? `${uid}-start-error` : undefined}>
                <option value="">{tg("common.none")}</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </NativeSelect>
            </div>
          </div>
          {errors.startMonth ? <p id={`${uid}-start-error`} role="alert" className="text-xs font-medium text-danger">{errors.startMonth}</p> : null}
        </fieldset>

        <FormField id={`${uid}-role`} label={t("hireReport.role")} error={errors.role}>
          <Input id={`${uid}-role`} value={role} maxLength={120} onChange={(e) => setRole(e.target.value)} aria-invalid={errors.role ? true : undefined} />
          <CharCount count={role.length} max={120} />
        </FormField>

        <FormField id={`${uid}-learned`} label={t("hireReport.learnedVia")} required error={errors.learnedVia}>
          <NativeSelect id={`${uid}-learned`} value={learnedVia} onChange={(e) => setLearnedVia(e.target.value)} aria-required aria-invalid={errors.learnedVia ? true : undefined} aria-describedby={errors.learnedVia ? `${uid}-learned-error` : undefined}>
            <option value="">{tg("common.none")}</option>
            {HIRE_LEARNED_VIA.map((v) => <option key={v} value={v}>{tg(`labels.hireLearnedVia.${v}`)}</option>)}
          </NativeSelect>
        </FormField>

        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">{t("hireReport.evidence")}<span className="text-danger" aria-hidden> *</span></legend>
          <p className="text-xs text-pretty text-muted-foreground">{t("hireReport.evidenceHint")}</p>
          {errors.items ? <p role="alert" className="text-xs font-medium text-danger">{errors.items}</p> : null}
          <EvidenceItems items={items} setItems={setItems} errors={itemErrors} min={1} today={today} tail={tail} />
          <p className="text-xs text-pretty text-muted-foreground">{t("hireReport.weightHint")}</p>
        </fieldset>

        <HireEvidenceList orgSlug={orgSlug} referralId={referralId} kind="hire_report" label={t("hireReport.files")} hint={t("hireReport.filesHint", { partner })} onChange={setFiles} filedRef={filedRef} />

        <FormField id={`${uid}-statement`} label={t("hireReport.statement")} required hint={t("hireReport.statementHint", { partner })} error={errors.statement}>
          <Textarea id={`${uid}-statement`} rows={5} maxLength={2000} value={statement} onChange={(e) => setStatement(e.target.value)} aria-required aria-invalid={errors.statement ? true : undefined} aria-describedby={errors.statement ? `${uid}-statement-error` : `${uid}-statement-hint`} />
          <CharCount count={statement.length} max={2000} />
        </FormField>

        <div className="grid gap-1.5">
          <Label className="flex min-h-11 items-start gap-3 rounded-2xl bg-muted/50 p-3 leading-5 font-normal">
            <Checkbox checked={attested} onCheckedChange={(v) => setAttested(v === true)} className="mt-0.5" aria-required aria-invalid={errors.attestation ? true : undefined} aria-describedby={errors.attestation ? `${uid}-attest-error` : undefined} />
            <span className="text-sm text-pretty">{t("hireReport.attestation")}</span>
          </Label>
          {errors.attestation ? <p id={`${uid}-attest-error`} role="alert" className="text-xs font-medium text-danger">{errors.attestation}</p> : null}
        </div>
      </div>

      <div className="grid gap-2 border-t border-border/60 bg-background px-6 py-4">
        {blockReason ? <p id={statusId} className="text-sm text-pretty text-muted-foreground">{blockReason}</p> : null}
        <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
          <Button className="h-auto min-h-11 whitespace-normal sm:min-h-10" disabled={pending || !!blockReason} aria-describedby={blockReason ? statusId : undefined} onClick={submit}>
            {pending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {pending ? t("hireReport.filing") : t("hireReport.submit")}
          </Button>
          <Button variant="outline" className="min-h-11 sm:min-h-10" disabled={pending} onClick={onCancel}>{tg("common.actions.cancel")}</Button>
        </div>
      </div>
    </>
  );
}
