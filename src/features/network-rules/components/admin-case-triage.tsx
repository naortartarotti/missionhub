"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleAlert, Info, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { NativeSelect } from "@/components/shared/native-select";
import { useFormatter, useGlobalT, useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/actions/result";
import { applyImmediateHold, closeConductCase, requestConductInfo, sendConductFollowup, sendConductNotice, setConductCategory } from "../admin-actions";
import { CONDUCT_CATEGORIES, IMMEDIATE_HOLD_GROUNDS, RULES_LOCALES, type ConductCategory, type RulesLocale } from "../domain";
import { conductCloseSchema, conductFollowupSchema, conductInfoRequestSchema, conductNoticeSchema, immediateHoldSchema } from "../schemas";
import { TextField, addWeekdays, fill, groupRules, noticeLanguageFor, todayEt, useLengthError, type NoticeTemplates } from "./admin-case-shared";

/** admin_conduct_notice_context (backend.md §3.5). */
export type NoticeContext = {
  default_conduct_date: string | null;
  first_effective_on: string | null;
  org_locale: string | null;
  default_version_id: string | null;
  versions: {
    id: string;
    label: string;
    effective_at: string;
    effective_on: string | null;
    type: string;
    rules: Partial<Record<RulesLocale, { number: string; excerpt: string }[]>>;
    sections: { number: string; title: string }[] | Partial<Record<RulesLocale, { number: string; title: string }[]>>;
    org_accepted_at: string | null;
  }[];
};

const dialogClass =
  "flex max-h-[100dvh] flex-col gap-0 overflow-hidden p-0 max-sm:inset-0 max-sm:h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-3xl";

function useRunner() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult<unknown>>, done: string, onOk?: () => void, onError?: (r: Extract<ActionResult<unknown>, { ok: false }>) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        if (onError) onError(r);
        else toast.error(r.error);
        return;
      }
      toast.success(done);
      onOk?.();
      router.refresh();
    });
  return { pending, run };
}

/**
 * S13 triage actions (state new / info requested): admin category (required before any first
 * response, saved with the first action), Send notice, Ask the reporter, Close without a finding,
 * and Apply immediate hold (only rendered when the server says it's allowed, N10-D16).
 */
export function TriagePanel({
  caseId,
  orgName,
  category,
  adminCategory,
  canTriage,
  canAskReporter,
  canNotice,
  canHold,
  hasReporter,
  noticeContext,
  templates,
}: {
  caseId: string;
  orgName: string;
  category: ConductCategory;
  adminCategory: ConductCategory | null;
  canTriage: boolean;
  canAskReporter: boolean;
  canNotice: boolean;
  canHold: boolean;
  hasReporter: boolean;
  noticeContext: NoticeContext | null;
  templates: NoticeTemplates;
}) {
  const t = useT("admin");
  const tg = useGlobalT();
  const uid = useId();
  const [cat, setCat] = useState<ConductCategory>(adminCategory ?? category);
  const { pending, run } = useRunner();
  // The admin category must exist before any first response (AC-129): saved first when missing or changed.
  const ensureCategory = async (): Promise<ActionResult> => (adminCategory === cat ? { ok: true } : setConductCategory({ caseId, category: cat }));
  const withCategory = (fn: () => Promise<ActionResult<unknown>>) => async () => {
    const c = await ensureCategory();
    if (!c.ok) return c;
    return fn();
  };

  return (
    <div className="grid gap-4">
      {canTriage || canNotice ? (
        <div className="grid gap-2">
          <Label htmlFor={`${uid}-cat`} className="text-sm font-medium">{t("conduct.adminCategory")}</Label>
          <NativeSelect id={`${uid}-cat`} value={cat} onChange={(e) => setCat(e.target.value as ConductCategory)} aria-describedby={`${uid}-cat-hint`}>
            {CONDUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{tg(`labels.conductCategory.${c}`)}</option>
            ))}
          </NativeSelect>
          <p id={`${uid}-cat-hint`} className="text-xs text-muted-foreground">{t("conduct.adminCategoryHint")}</p>
          <Button variant="outline" size="sm" className="min-h-11 justify-self-start sm:min-h-8" disabled={pending || adminCategory === cat} onClick={() => run(() => setConductCategory({ caseId, category: cat }), t("conduct.categorySaved"))}>
            {t("conduct.saveCategory")}
          </Button>
        </div>
      ) : null}
      <div className="grid gap-2">
        {canNotice ? <NoticeDialog mode="notice" caseId={caseId} orgName={orgName} ctx={noticeContext} templates={templates} hasReporter={hasReporter} beforeSend={ensureCategory} /> : null}
        {canTriage && canAskReporter ? <AskReporterDialog caseId={caseId} orgName={orgName} send={withCategory} /> : null}
        {canTriage ? <CloseDialog caseId={caseId} orgName={orgName} send={withCategory} /> : null}
        {canHold ? <NoticeDialog mode="hold" caseId={caseId} orgName={orgName} ctx={noticeContext} templates={templates} hasReporter={hasReporter} beforeSend={ensureCategory} /> : null}
      </div>
    </div>
  );
}

function DeadlineSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const t = useT("admin");
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t("conduct.deadlineNone")}</option>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <option key={n} value={n}>{t("conduct.deadlineOption", { count: n })}</option>
      ))}
    </NativeSelect>
  );
}

function AskReporterDialog({ caseId, orgName, send }: { caseId: string; orgName: string; send: (fn: () => Promise<ActionResult<unknown>>) => () => Promise<ActionResult<unknown>> }) {
  const t = useT("admin");
  const tg = useGlobalT();
  const uid = useId();
  const len = useLengthError();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [due, setDue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { pending, run } = useRunner();
  const submit = () => {
    const input = { caseId, question: q, dueBusinessDays: due ? Number(due) : null };
    const e = len(q, 20, 2000);
    if (e || !conductInfoRequestSchema.safeParse(input).success) return setErr(e ?? tg("errors.invalidFields"));
    run(send(() => requestConductInfo(input)), t("conduct.askSent"), () => setOpen(false), (r) => setErr(r.error));
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="min-h-11 w-full sm:min-h-10">{t("conduct.askReporter")}</Button>
      </DialogTrigger>
      <DialogContent className={dialogClass}>
        <div className="grid gap-4 overflow-y-auto p-6">
          <DialogTitle>{t("conduct.askTitle")}</DialogTitle>
          <DialogDescription>{t("conduct.askHint", { org: orgName })}</DialogDescription>
          <TextField label={t("conduct.askQuestion")} value={q} onChange={setQ} max={2000} error={err} required />
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-due`} className="text-sm font-medium">{t("conduct.askDeadline")}</Label>
            <DeadlineSelect id={`${uid}-due`} value={due} onChange={setDue} />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button className="min-h-11 sm:min-h-10" disabled={pending} onClick={submit}>{pending ? tg("common.actions.working") : t("conduct.askSubmit")}</Button>
            <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => setOpen(false)}>{tg("common.actions.cancel")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CloseDialog({ caseId, orgName, send }: { caseId: string; orgName: string; send: (fn: () => Promise<ActionResult<unknown>>) => () => Promise<ActionResult<unknown>> }) {
  const t = useT("admin");
  const tg = useGlobalT();
  const len = useLengthError();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<"no_rule" | "amount" | "duplicate" | "other">("no_rule");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { pending, run } = useRunner();
  const submit = () => {
    const input = { caseId, reasonCode: code, reason };
    const e = len(reason, 20, 1000);
    if (e || !conductCloseSchema.safeParse(input).success) return setErr(e ?? tg("errors.invalidFields"));
    run(send(() => closeConductCase(input)), t("conduct.closed"), () => setOpen(false), (r) => setErr(r.error));
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="min-h-11 w-full sm:min-h-10">{t("conduct.closeTriage")}</Button>
      </DialogTrigger>
      <DialogContent className={dialogClass}>
        <div className="grid gap-4 overflow-y-auto p-6">
          <DialogTitle>{t("conduct.closeTitle")}</DialogTitle>
          <DialogDescription>{t("conduct.closeDescription", { org: orgName })}</DialogDescription>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{t("conduct.closeReason")}</legend>
            <RadioGroup value={code} onValueChange={(v) => setCode(v as typeof code)} className="gap-2" aria-label={t("conduct.closeReason")}>
              {(["no_rule", "amount", "duplicate", "other"] as const).map((c) => (
                <Label key={c} className="flex min-h-11 items-center gap-3 rounded-2xl border border-border/60 px-3 font-normal has-[[data-state=checked]]:border-foreground">
                  <RadioGroupItem value={c} /> {t(`conduct.closeReasonOption.${c}`)}
                </Label>
              ))}
            </RadioGroup>
          </fieldset>
          <TextField label={t("conduct.closeMessage")} hint={t("conduct.closeReasonHint")} value={reason} onChange={setReason} max={1000} error={err} required />
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button variant="destructive" className="min-h-11 sm:min-h-10" disabled={pending} onClick={submit}>{pending ? tg("common.actions.working") : t("conduct.closeConfirm")}</Button>
            <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => setOpen(false)}>{tg("common.actions.cancel")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * S14 notice composer, and S16 (two-step immediate hold) when `mode === "hold"`. The version
 * defaults to the one in force on the conduct date and re-defaults when the date changes, unless
 * picked by hand; rules come from the chosen version only (kept across a version change when the
 * number exists). The possible-outcomes line is fixed and added by the server.
 */
export function NoticeDialog({
  mode,
  caseId,
  orgName,
  ctx,
  templates,
  hasReporter,
  beforeSend,
}: {
  mode: "notice" | "hold";
  caseId: string;
  orgName: string;
  ctx: NoticeContext | null;
  templates: NoticeTemplates;
  hasReporter: boolean;
  beforeSend: () => Promise<ActionResult>;
}) {
  const t = useT("admin");
  const tn = useT("network");
  const tg = useGlobalT();
  const f = useFormatter();
  const uid = useId();
  const len = useLengthError();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [confirm, setConfirm] = useState(false);
  const today = todayEt();
  const versions = ctx?.versions ?? [];
  const versionFor = (date: string) => [...versions].filter((v) => (v.effective_on ?? v.effective_at.slice(0, 10)) <= date).sort((a, b) => b.effective_at.localeCompare(a.effective_at))[0] ?? null;
  const [language, setLanguage] = useState<RulesLocale>(noticeLanguageFor(ctx?.org_locale));
  const [conductDate, setConductDate] = useState(ctx?.default_conduct_date ?? "");
  const [versionId, setVersionId] = useState(ctx?.default_version_id ?? (conductDate ? versionFor(conductDate)?.id : null) ?? versions[0]?.id ?? "");
  const [versionTouched, setVersionTouched] = useState(false);
  const [ground, setGround] = useState<(typeof IMMEDIATE_HOLD_GROUNDS)[number] | "">("");
  const [rules, setRules] = useState<string[]>([]);
  const [allegation, setAllegation] = useState("");
  const [when, setWhen] = useState("");
  const [evidence, setEvidence] = useState("");
  const [nameReporter, setNameReporter] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [alert, setAlert] = useState<{ code?: string; text: string } | null>(null);
  const [pending, start] = useTransition();

  const version = versions.find((v) => v.id === versionId) ?? null;
  const versionRules = version?.rules[language] ?? version?.rules.en ?? [];
  const versionSections = (Array.isArray(version?.sections) ? version?.sections : (version?.sections as Partial<Record<RulesLocale, { number: string; title: string }[]>> | undefined)?.[language]) ?? [];
  const groups = groupRules(versionRules, versionSections);
  const tpl = templates[language];

  const changeDate = (d: string) => {
    setConductDate(d);
    if (!versionTouched && d) {
      const v = versionFor(d);
      if (v) changeVersion(v.id, false);
    }
  };
  const changeVersion = (id: string, byHand: boolean) => {
    const next = versions.find((v) => v.id === id);
    const nums = new Set((next?.rules[language] ?? next?.rules.en ?? []).map((r) => r.number));
    setRules((rs) => rs.filter((n) => nums.has(n)));
    setVersionId(id);
    if (byHand) setVersionTouched(true);
  };
  const pickGround = (g: (typeof IMMEDIATE_HOLD_GROUNDS)[number]) => {
    setGround(g);
    setRules((rs) => (rs.includes(g) ? rs : [...rs, g]));
  };
  const toggleRule = (n: string, on: boolean) => setRules((rs) => (on ? [...rs, n] : rs.filter((x) => x !== n)));

  const input = { caseId, language, conductDate, rulesVersionId: versionId, rulesCited: rules, allegation, allegedWhen: when, evidenceSummary: evidence, nameReporter };
  const validate = () => {
    const e: Record<string, string | null> = {
      allegation: len(allegation, 20, 4000),
      when: len(when, 3, 200),
      evidence: len(evidence, 20, 4000),
      rules: rules.length ? null : t("conduct.notice.rulesHint"),
      conductDate: !conductDate ? tg("errors.invalidFields") : conductDate > today ? tn("report.errors.dateFuture") : ctx?.first_effective_on && conductDate < ctx.first_effective_on ? t("conduct.notice.conductDateBeforeRules", { date: f.date(ctx.first_effective_on) }) : null,
      ground: mode === "hold" && !ground ? t("conduct.hold.groundHint") : null,
    };
    const ok = Object.values(e).every((x) => !x) && (mode === "hold" ? immediateHoldSchema.safeParse({ ...input, ground }).success : conductNoticeSchema.safeParse(input).success);
    setErrors(e);
    return ok;
  };

  const send = () =>
    start(async () => {
      setAlert(null);
      const c = await beforeSend();
      if (!c.ok) {
        setAlert({ text: c.error });
        return;
      }
      const r = mode === "hold" ? await applyImmediateHold({ ...input, ground }) : await sendConductNotice(input);
      if (!r.ok) {
        if (r.code === "conduct_date_before_rules") setErrors((e) => ({ ...e, conductDate: t("conduct.notice.conductDateBeforeRules", { date: f.date(ctx?.first_effective_on) }) }));
        else if (r.code === "conduct_date_future") setErrors((e) => ({ ...e, conductDate: tn("report.errors.dateFuture") }));
        const text =
          r.code === "org_already_restricted"
            ? t("conduct.errors.alreadyRestricted", { org: orgName })
            : r.code === "immediate_hold_ground_invalid"
              ? t("conduct.errors.groundInvalid")
              : r.error;
        setAlert({ code: r.code, text });
        setConfirm(false);
        return;
      }
      toast.success(mode === "hold" ? t("conduct.hold.done", { org: orgName }) : t("conduct.notice.sent", { org: orgName }));
      setConfirm(false);
      setOpen(false);
      router.refresh();
    });

  const restricted = alert?.code === "org_already_restricted";
  const deadline = f.etDateTime(addWeekdays(10).toISOString());
  const ruleTitle = (n: string) => versionRules.find((r) => r.number === n)?.excerpt ?? "";

  const preview = (
    <div lang={language} className="grid gap-3 rounded-2xl border border-border/60 p-4 text-sm">
      <p className="text-xs text-muted-foreground">{t("conduct.notice.previewHint", { org: orgName })}</p>
      <p className="text-base font-semibold">{mode === "hold" ? tpl.headingImmediate : tpl.heading}</p>
      <p>{mode === "hold" ? fill(tpl.introImmediate, { org: orgName, date: f.etDate(new Date().toISOString()), rule: ground }) : fill(tpl.intro, { org: orgName })}</p>
      {mode === "hold" ? <p>{tpl.holdEffects}</p> : null}
      <p className="font-semibold">{tpl.rules}</p>
      <ul className="list-disc pl-5">{rules.map((n) => <li key={n}>{fill(tpl.ruleItem, { number: n, title: ruleTitle(n) })}</li>)}</ul>
      {version ? <p className="text-xs text-muted-foreground">{fill(tpl.version, { label: version.label })}</p> : null}
      <p className="font-semibold">{tpl.alleged}</p>
      <p className="whitespace-pre-line">{allegation}</p>
      <p className="font-semibold">{tpl.when}</p>
      <p>{when}</p>
      <p className="font-semibold">{tpl.evidence}</p>
      <p className="whitespace-pre-line">{evidence}</p>
      <p className="font-semibold">{fill(tpl.deadline, { when: deadline })}</p>
      <p>{tpl.howToRespond}</p>
      <p className="flex items-start gap-2 rounded-xl bg-muted p-3"><Lock className="mt-0.5 size-4 shrink-0" aria-hidden />{tpl.possibleOutcomes}</p>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setStep(1); setAlert(null); } }}>
      <DialogTrigger asChild>
        <Button variant={mode === "hold" ? "destructive" : "default"} className="min-h-11 w-full sm:min-h-10">{mode === "hold" ? t("conduct.applyHold") : t("conduct.sendNotice")}</Button>
      </DialogTrigger>
      <DialogContent className={dialogClass}>
        <div className="sticky top-0 border-b border-border/60 bg-background px-6 pt-6 pb-4">
          <DialogTitle className="pr-8">{mode === "hold" ? t("conduct.hold.title") : t("conduct.notice.title", { org: orgName })}</DialogTitle>
          {mode === "hold" ? <DialogDescription className="mt-1">{step === 1 ? t("conduct.hold.step1") : t("conduct.hold.step2")}</DialogDescription> : <DialogDescription className="sr-only">{t("conduct.notice.title", { org: orgName })}</DialogDescription>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {alert ? (
            <div role="alert" className="mb-4 flex items-start gap-2 rounded-2xl bg-danger-soft px-3.5 py-3 text-sm text-danger">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> <span>{alert.text}</span>
            </div>
          ) : null}
          {!ctx || versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("conduct.notice.rulesEmpty")}</p>
          ) : mode === "hold" && step === 2 ? (
            <div className="grid gap-4">
              <p className="text-base font-semibold">{t("conduct.hold.confirmTitle")}</p>
              <p className="text-sm">{t("conduct.hold.confirmDescription", { org: orgName })}</p>
            </div>
          ) : (
            <Tabs defaultValue="edit" className="gap-4">
              <TabsList>
                <TabsTrigger value="edit" className="min-h-11 sm:min-h-8">{t("conduct.notice.tabEdit")}</TabsTrigger>
                <TabsTrigger value="preview" className="min-h-11 sm:min-h-8">{t("conduct.notice.tabPreview")}</TabsTrigger>
              </TabsList>
              <TabsContent value="edit" className="grid gap-5">
                {mode === "hold" ? (
                  <fieldset className="grid gap-2">
                    <legend className="mb-1 text-sm font-medium">{t("conduct.hold.ground")}</legend>
                    <p className="text-xs text-muted-foreground">{t("conduct.hold.groundHint")}</p>
                    <RadioGroup value={ground} onValueChange={(v) => pickGround(v as (typeof IMMEDIATE_HOLD_GROUNDS)[number])} className="gap-2" aria-label={t("conduct.hold.ground")} aria-invalid={errors.ground ? true : undefined}>
                      {IMMEDIATE_HOLD_GROUNDS.map((g) => (
                        <Label key={g} className="flex min-h-11 items-center gap-3 rounded-2xl border border-border/60 px-3 font-normal has-[[data-state=checked]]:border-foreground">
                          <RadioGroupItem value={g} /> {g === "2.3" ? t("conduct.hold.ground23") : t("conduct.hold.ground48")}
                        </Label>
                      ))}
                    </RadioGroup>
                    {errors.ground ? <p role="alert" className="text-xs font-medium text-danger">{errors.ground}</p> : null}
                  </fieldset>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${uid}-lang`} className="text-sm font-medium">{t("conduct.notice.language")}</Label>
                    <NativeSelect id={`${uid}-lang`} value={language} onChange={(e) => setLanguage(e.target.value as RulesLocale)}>
                      {RULES_LOCALES.map((l) => <option key={l} value={l}>{l}</option>)}
                    </NativeSelect>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${uid}-date`} className="text-sm font-medium">{t("conduct.notice.conductDate")}</Label>
                    <Input id={`${uid}-date`} type="date" className="h-11 sm:h-10" max={today} min={ctx.first_effective_on ?? undefined} value={conductDate} onChange={(e) => changeDate(e.target.value)} aria-invalid={errors.conductDate ? true : undefined} aria-describedby={errors.conductDate ? `${uid}-date-error` : `${uid}-date-hint`} />
                    {errors.conductDate ? <p id={`${uid}-date-error`} role="alert" className="text-xs font-medium text-danger">{errors.conductDate}</p> : <p id={`${uid}-date-hint`} className="text-xs text-muted-foreground">{t("conduct.notice.conductDateHint")}</p>}
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${uid}-version`} className="text-sm font-medium">{t("conduct.notice.rulesVersion")}</Label>
                  <NativeSelect id={`${uid}-version`} value={versionId} onChange={(e) => changeVersion(e.target.value, true)} aria-describedby={`${uid}-version-hint ${uid}-accepted`}>
                    {versions.map((v) => <option key={v.id} value={v.id}>{t("conduct.notice.rulesVersionOption", { label: v.label, date: f.etDate(v.effective_at) })}</option>)}
                  </NativeSelect>
                  <p id={`${uid}-version-hint`} className="text-xs text-muted-foreground">{t("conduct.notice.rulesVersionHint")}</p>
                  <p id={`${uid}-accepted`} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {version?.org_accepted_at ? t("conduct.notice.orgAcceptedVersion", { org: orgName, date: f.etDate(version.org_accepted_at) }) : t("conduct.notice.orgNotAcceptedVersion", { org: orgName })}
                  </p>
                </div>
                <fieldset className="grid gap-2">
                  <legend className="mb-1 text-sm font-medium">{t("conduct.notice.rules")}</legend>
                  <p className="text-xs text-muted-foreground">{t("conduct.notice.rulesHint")}</p>
                  <div className="max-h-72 overflow-y-auto rounded-2xl border border-border/60 p-3" lang={language}>
                    {groups.map((g) => (
                      <div key={g.number} className="mb-3 grid gap-1 last:mb-0" role="group" aria-label={`${g.number}. ${g.title}`}>
                        <p className="text-xs font-semibold text-muted-foreground">{g.number}. {g.title}</p>
                        {g.rules.map((r) => (
                          <Label key={r.number} className="flex min-h-11 items-start gap-2.5 rounded-xl px-2 py-1.5 text-sm font-normal hover:bg-muted sm:min-h-9">
                            <Checkbox checked={rules.includes(r.number)} onCheckedChange={(v) => toggleRule(r.number, v === true)} className="mt-0.5" />
                            <span><span className="font-medium">{r.number}</span> {r.excerpt}</span>
                          </Label>
                        ))}
                      </div>
                    ))}
                  </div>
                  <p aria-live="polite" className="text-xs text-muted-foreground">{t("conduct.notice.rulesSelected", { count: rules.length })}</p>
                  {errors.rules ? <p role="alert" className="text-xs font-medium text-danger">{errors.rules}</p> : null}
                </fieldset>
                <TextField label={t("conduct.notice.alleged")} value={allegation} onChange={setAllegation} max={4000} error={errors.allegation} lang={language} required />
                <div className="grid gap-1.5">
                  <Label htmlFor={`${uid}-when`} className="text-sm font-medium">{t("conduct.notice.when")}</Label>
                  <Input id={`${uid}-when`} value={when} maxLength={200} lang={language} placeholder={t("conduct.notice.whenPlaceholder")} onChange={(e) => setWhen(e.target.value)} aria-invalid={errors.when ? true : undefined} aria-describedby={errors.when ? `${uid}-when-error` : undefined} />
                  {errors.when ? <p id={`${uid}-when-error`} role="alert" className="text-xs font-medium text-danger">{errors.when}</p> : null}
                </div>
                <TextField label={t("conduct.notice.evidence")} hint={t("conduct.notice.evidenceHint")} value={evidence} onChange={setEvidence} max={4000} error={errors.evidence} lang={language} required />
                {hasReporter ? (
                  <Label className="flex min-h-11 items-start gap-2.5 rounded-2xl bg-muted/50 p-3 font-normal">
                    <Checkbox checked={nameReporter} onCheckedChange={(v) => setNameReporter(v === true)} className="mt-0.5" />
                    <span className="grid gap-0.5"><span className="text-sm">{t("conduct.notice.nameReporter")}</span><span className="text-xs text-muted-foreground">{t("conduct.notice.nameReporterHint")}</span></span>
                  </Label>
                ) : null}
                <div className="grid gap-1 rounded-2xl bg-muted p-3 text-sm" lang={language}>
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Lock className="size-3.5" aria-hidden />{t("conduct.notice.outcomesLocked")}</p>
                  <p>{tpl.possibleOutcomes}</p>
                </div>
                <p className="text-sm font-medium">{t("conduct.notice.deadline", { when: deadline })}</p>
              </TabsContent>
              <TabsContent value="preview">{preview}</TabsContent>
            </Tabs>
          )}
        </div>
        {ctx && versions.length ? (
          <div className="sticky bottom-0 flex flex-col gap-2 border-t border-border/60 bg-background px-6 py-4 sm:flex-row-reverse">
            {mode === "hold" && step === 2 ? (
              <>
                {restricted ? null : (
                  <Button variant="destructive" className="min-h-11 sm:min-h-10" disabled={pending} onClick={send}>
                    {pending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                    {t("conduct.hold.submit")}
                  </Button>
                )}
                {restricted ? null : <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => setStep(1)}>{tg("common.actions.back")}</Button>}
                <Button variant="ghost" className="min-h-11 sm:min-h-10" onClick={() => setOpen(false)}>{tg("common.actions.cancel")}</Button>
              </>
            ) : (
              <>
                <Button
                  variant={mode === "hold" ? "destructive" : "default"}
                  className="min-h-11 sm:min-h-10"
                  disabled={pending}
                  onClick={() => {
                    if (!validate()) return;
                    if (mode === "hold") setStep(2);
                    else setConfirm(true);
                  }}
                >
                  {mode === "hold" ? tg("common.actions.next") : t("conduct.sendNotice")}
                </Button>
                <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => setOpen(false)}>{tg("common.actions.cancel")}</Button>
              </>
            )}
          </div>
        ) : null}
        {mode === "notice" ? (
          <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={t("conduct.notice.confirmTitle", { org: orgName })} description={t("conduct.notice.confirmDescription")} confirmLabel={t("conduct.sendNotice")} onConfirm={async () => void send()} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** "Ask a follow-up" during the response window (admin → org). */
export function FollowupDialog({ noticeId, orgName }: { noticeId: string; orgName: string }) {
  const t = useT("admin");
  const tg = useGlobalT();
  const uid = useId();
  const len = useLengthError();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [due, setDue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { pending, run } = useRunner();
  const submit = () => {
    const input = { noticeId, question: q, dueBusinessDays: due ? Number(due) : null };
    const e = len(q, 20, 2000);
    if (e || !conductFollowupSchema.safeParse(input).success) return setErr(e ?? tg("errors.invalidFields"));
    run(() => sendConductFollowup(input), t("conduct.followupSent", { org: orgName }), () => setOpen(false), (r) => setErr(r.error));
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="min-h-11 w-full sm:min-h-10">{t("conduct.followup")}</Button>
      </DialogTrigger>
      <DialogContent className={dialogClass}>
        <div className="grid gap-4 overflow-y-auto p-6">
          <DialogTitle>{t("conduct.followupTitle", { org: orgName })}</DialogTitle>
          <DialogDescription>{t("conduct.followupHint", { org: orgName })}</DialogDescription>
          <TextField label={t("conduct.askQuestion")} value={q} onChange={setQ} max={2000} error={err} required />
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-due`} className="text-sm font-medium">{t("conduct.askDeadline")}</Label>
            <DeadlineSelect id={`${uid}-due`} value={due} onChange={setDue} />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button className="min-h-11 sm:min-h-10" disabled={pending} onClick={submit}>{pending ? tg("common.actions.working") : t("conduct.askSubmit")}</Button>
            <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => setOpen(false)}>{tg("common.actions.cancel")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
