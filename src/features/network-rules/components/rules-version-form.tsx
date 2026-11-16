"use client";

import { useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/shared/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { useFormatter, useGlobalT, useT } from "@/i18n/client";
import { translateMarked } from "@/i18n/translate";
import type { ActionResult } from "@/lib/actions/result";
import { deleteNetworkRulesDraft, publishNetworkRulesVersion, saveNetworkRulesDraft } from "../admin-actions";
import { RULES_LOCALES, VERSION_TYPES, earliestMaterialEffectiveDate, findRulesMarkers, type RulesLocale, type VersionType } from "../domain";
import { rulesDraftSchema, rulesPublishSchema } from "../schemas";
import { RulesText } from "./rules-text";

type Texts = Record<RulesLocale, string>;
export type RulesDraftValues = {
  draftId: string | null;
  label: string;
  type: VersionType;
  effectiveOn: string;
  texts: Texts;
  summaries: Texts;
  legalReason: string;
  approvalReference: string;
};

const empty: Texts = { en: "", "fr-CA": "", "pt-BR": "" };
const todayEt = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
type Errors = Partial<Record<"label" | "effectiveOn" | "legalReason" | "approvalReference" | "form", string>> & { text?: Partial<Record<RulesLocale, string>>; summary?: Partial<Record<RulesLocale, string>>; markers?: { locale: RulesLocale; line: number; marker: string }[] };

/**
 * S6 publish form (§2.4). The live marker list is advisory (Publish stays enabled); the server is
 * authoritative and returns the same list (`marker_found`, DETAIL = JSON lines) as field errors.
 */
export function RulesVersionForm({ initial, initialAllowed, hasUpcoming }: { initial: RulesDraftValues | null; initialAllowed: boolean; hasUpcoming: boolean }) {
  const t = useT("admin");
  const tg = useGlobalT();
  const f = useFormatter();
  const router = useRouter();
  const uid = useId();
  const [v, setV] = useState<RulesDraftValues>(
    initial ?? { draftId: null, label: "", type: initialAllowed ? "initial" : "material", effectiveOn: "", texts: { ...empty }, summaries: { ...empty }, legalReason: "", approvalReference: "" },
  );
  const [errors, setErrors] = useState<Errors>({});
  const [confirm, setConfirm] = useState(false);
  const [tab, setTab] = useState<RulesLocale>("en");
  const [pending, start] = useTransition();
  const errorRef = useRef<HTMLDivElement>(null);
  const today = todayEt();
  const earliest = earliestMaterialEffectiveDate(today);
  const types = VERSION_TYPES.filter((ty) => (initialAllowed ? ty === "initial" : ty !== "initial"));
  const needsDate = v.type === "material" || v.type === "legally_required";
  const set = <K extends keyof RulesDraftValues>(k: K, val: RulesDraftValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const markers = useMemo(() => Object.fromEntries(RULES_LOCALES.map((l) => [l, findRulesMarkers(v.texts[l])])) as Record<RulesLocale, ReturnType<typeof findRulesMarkers>>, [v.texts]);

  const payload = () => ({
    draftId: v.draftId,
    label: v.label,
    type: v.type,
    effectiveOn: needsDate ? v.effectiveOn || null : null,
    texts: v.texts,
    summaries: v.summaries,
    legalReason: v.type === "legally_required" ? v.legalReason : null,
    approvalReference: v.approvalReference,
  });

  /** Client checks first (same schemas + the spec's per-field copy); the server repeats them. */
  const validate = (publish: boolean): Errors => {
    const e: Errors = {};
    const parsed = (publish ? rulesPublishSchema : rulesDraftSchema).safeParse(payload());
    if (!parsed.success) {
      for (const i of parsed.error.issues) {
        if (i.path[0] === "label") e.label = t("networkRules.errors.labelFormat");
        if (i.path[0] === "approvalReference") e.approvalReference = t("networkRules.errors.approval", { min: 5, max: 300 });
      }
    }
    if (!/^\d{1,3}\.\d{1,3}$/.test(v.label.trim())) e.label = t("networkRules.errors.labelFormat");
    if (!publish) return e;
    for (const l of RULES_LOCALES) {
      if (!v.texts[l].trim()) (e.text ??= {})[l] = t("networkRules.errors.missingLocale", { locale: l });
      if (v.type !== "initial" && (v.summaries[l].trim().length < 20 || v.summaries[l].length > 2000)) (e.summary ??= {})[l] = t("networkRules.errors.missingSummary", { locale: l });
    }
    if (v.type === "material" && (!v.effectiveOn || v.effectiveOn < earliest)) e.effectiveOn = t("networkRules.errors.effective", { date: f.date(earliest) });
    if (v.type === "legally_required") {
      if (!v.effectiveOn || v.effectiveOn < today) e.effectiveOn = t("networkRules.errors.effectivePast");
      if (v.legalReason.trim().length < 20 || v.legalReason.length > 1000) e.legalReason = t("networkRules.errors.legalReason", { min: 20, max: f.number(1000) });
    }
    return e;
  };

  const fromServer = (r: ActionResult<unknown>): Errors => {
    if (r.ok) return {};
    const e: Errors = {};
    let detail: unknown = null;
    try {
      detail = r.detail ? JSON.parse(r.detail) : null;
    } catch {
      detail = r.detail;
    }
    switch (r.code) {
      case "missing_locale":
        for (const d of Array.isArray(detail) ? (detail as { locale: RulesLocale; field: string }[]) : []) {
          if (d.field === "summary") (e.summary ??= {})[d.locale] = t("networkRules.errors.missingSummary", { locale: d.locale });
          else (e.text ??= {})[d.locale] = t("networkRules.errors.missingLocale", { locale: d.locale });
        }
        break;
      case "marker_found":
        e.markers = Array.isArray(detail) ? (detail as Errors["markers"]) : [];
        for (const m of e.markers ?? []) (e.text ??= {})[m.locale] = t("networkRules.errors.marker", { locale: m.locale });
        break;
      case "effective_date":
        e.effectiveOn = typeof r.detail === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.detail) ? t("networkRules.errors.effective", { date: f.date(r.detail) }) : t("networkRules.errors.effectivePast");
        break;
      case "label_taken":
        e.label = t("networkRules.errors.labelTaken");
        break;
      case "invalid_label":
        e.label = t("networkRules.errors.labelFormat");
        break;
      case "legal_reason_required":
        e.legalReason = t("networkRules.errors.legalReason", { min: 20, max: f.number(1000) });
        break;
      case "approval_reference_required":
        e.approvalReference = t("networkRules.errors.approval", { min: 5, max: 300 });
        break;
      case "upcoming_exists":
        e.form = t("networkRules.upcomingExists");
        break;
      default:
        e.form = r.fieldErrors ? translateMarked(tg, Object.values(r.fieldErrors).flat()[0] ?? r.error) : r.error;
    }
    return e;
  };

  const show = (e: Errors) => {
    setErrors(e);
    const firstLocale = RULES_LOCALES.find((l) => e.text?.[l] || e.summary?.[l]);
    if (firstLocale) setTab(firstLocale);
    requestAnimationFrame(() => errorRef.current?.focus());
  };

  const saveDraft = () =>
    start(async () => {
      const e = validate(false);
      if (Object.keys(e).length) return show(e);
      const r = await saveNetworkRulesDraft(payload());
      if (!r.ok) return show(fromServer(r));
      toast.success(t("networkRules.draftSaved"));
      if (!v.draftId && r.data) {
        set("draftId", r.data.id);
        router.replace(`/admin/network-rules/${r.data.id}/edit`);
      } else router.refresh();
    });

  const askPublish = () => {
    const e = validate(true);
    if (Object.keys(e).length) return show(e);
    setErrors({});
    setConfirm(true);
  };

  const publish = async () => {
    const r = await publishNetworkRulesVersion(payload());
    if (!r.ok) {
      setConfirm(false);
      show(fromServer(r));
      return;
    }
    toast.success(t("networkRules.published", { label: v.label }));
    router.push("/admin/network-rules");
  };

  const publishBody =
    v.type === "material"
      ? t("networkRules.publishMaterial", { date: f.date(v.effectiveOn) })
      : v.type === "legally_required"
        ? t("networkRules.publishLegal", { date: f.date(v.effectiveOn) })
        : v.type === "initial"
          ? t("networkRules.publishInitial")
          : t("networkRules.publishNow");
  const tabErrors = (l: RulesLocale) => (errors.text?.[l] ? 1 : 0) + (errors.summary?.[l] ? 1 : 0);
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <form noValidate className="grid gap-6" onSubmit={(e) => e.preventDefault()}>
      {hasErrors ? (
        <div ref={errorRef} tabIndex={-1} role="alert" className="flex items-start gap-2 rounded-2xl bg-danger-soft px-3.5 py-3 text-sm text-danger outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{errors.form ?? tg("errors.invalidFields")}</span>
        </div>
      ) : null}

      <Panel className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id={`${uid}-label`} label={t("networkRules.label")} hint={t("networkRules.labelHint")} error={errors.label} required>
            <Input id={`${uid}-label`} value={v.label} inputMode="decimal" onChange={(e) => set("label", e.target.value)} aria-invalid={errors.label ? true : undefined} aria-describedby={errors.label ? `${uid}-label-error` : `${uid}-label-hint`} />
          </FormField>
          <FormField id={`${uid}-approval`} label={t("networkRules.approval")} hint={t("networkRules.approvalHint")} error={errors.approvalReference} required>
            <Input id={`${uid}-approval`} value={v.approvalReference} maxLength={300} onChange={(e) => set("approvalReference", e.target.value)} aria-invalid={errors.approvalReference ? true : undefined} aria-describedby={errors.approvalReference ? `${uid}-approval-error` : `${uid}-approval-hint`} />
          </FormField>
        </div>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{t("networkRules.type")}</legend>
          {!initialAllowed ? <p className="text-xs text-muted-foreground">{t("networkRules.typeHint")}</p> : null}
          <RadioGroup value={v.type} onValueChange={(x) => set("type", x as VersionType)} className="gap-2" aria-label={t("networkRules.type")}>
            {types.map((ty) => (
              <Label key={ty} className="flex min-h-11 items-start gap-3 rounded-2xl border border-border/60 p-3 font-normal has-[[data-state=checked]]:border-foreground">
                <RadioGroupItem value={ty} className="mt-0.5" aria-describedby={`${uid}-type-${ty}`} />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">{tg(`labels.rulesVersionType.${ty}`)}</span>
                  <span id={`${uid}-type-${ty}`} className="text-xs text-muted-foreground">{t(`networkRules.typeDescription.${ty}`)}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
        </fieldset>

        {needsDate ? (
          <FormField id={`${uid}-effective`} label={t("networkRules.effective")} hint={v.type === "material" ? t("networkRules.effectiveMin", { date: f.date(earliest) }) : undefined} error={errors.effectiveOn} required>
            <Input
              id={`${uid}-effective`}
              type="date"
              className="h-11 max-w-xs sm:h-10"
              min={v.type === "material" ? earliest : today}
              value={v.effectiveOn}
              onChange={(e) => set("effectiveOn", e.target.value)}
              aria-invalid={errors.effectiveOn ? true : undefined}
              aria-describedby={errors.effectiveOn ? `${uid}-effective-error` : `${uid}-effective-hint`}
            />
          </FormField>
        ) : (
          <p className="text-sm text-muted-foreground">{t("networkRules.effectiveNow")}</p>
        )}

        {v.type === "legally_required" ? (
          <FormField id={`${uid}-legal`} label={t("networkRules.legalReason")} hint={t("networkRules.legalReasonHint")} error={errors.legalReason} required>
            <Textarea id={`${uid}-legal`} rows={3} maxLength={1000} value={v.legalReason} onChange={(e) => set("legalReason", e.target.value)} aria-invalid={errors.legalReason ? true : undefined} aria-describedby={errors.legalReason ? `${uid}-legal-error` : `${uid}-legal-hint`} />
          </FormField>
        ) : null}
      </Panel>

      <Tabs value={tab} onValueChange={(x) => setTab(x as RulesLocale)} className="gap-4">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          {RULES_LOCALES.map((l) => (
            <TabsTrigger key={l} value={l} className="min-h-11 sm:min-h-8" translate="no">
              {l}
              {tabErrors(l) ? <span className="ml-1.5 rounded-full bg-danger px-1.5 text-[10px] font-semibold text-white">{t("networkRules.tabErrors", { count: tabErrors(l) })}</span> : null}
            </TabsTrigger>
          ))}
        </TabsList>
        {RULES_LOCALES.map((l) => (
          <TabsContent key={l} value={l} className="grid gap-4">
            {v.type !== "initial" ? (
              <FormField id={`${uid}-summary-${l}`} label={t("networkRules.summary", { locale: l })} hint={t("networkRules.summaryHint")} error={errors.summary?.[l]} required>
                <Textarea
                  id={`${uid}-summary-${l}`}
                  rows={4}
                  maxLength={2000}
                  lang={l}
                  value={v.summaries[l]}
                  onChange={(e) => set("summaries", { ...v.summaries, [l]: e.target.value })}
                  aria-invalid={errors.summary?.[l] ? true : undefined}
                  aria-describedby={errors.summary?.[l] ? `${uid}-summary-${l}-error` : `${uid}-summary-${l}-hint`}
                />
              </FormField>
            ) : null}
            <Tabs defaultValue="text" className="gap-3">
              <TabsList>
                <TabsTrigger value="text" className="min-h-11 sm:min-h-8">{t("networkRules.tabText")}</TabsTrigger>
                <TabsTrigger value="preview" className="min-h-11 sm:min-h-8">{t("networkRules.tabPreview")}</TabsTrigger>
              </TabsList>
              <TabsContent value="text">
                <FormField id={`${uid}-text-${l}`} label={t("networkRules.text", { locale: l })} hint={t("networkRules.textHint")} error={errors.text?.[l]} required>
                  <Textarea
                    id={`${uid}-text-${l}`}
                    rows={18}
                    lang={l}
                    className="font-mono text-xs leading-relaxed"
                    value={v.texts[l]}
                    onChange={(e) => set("texts", { ...v.texts, [l]: e.target.value })}
                    aria-invalid={errors.text?.[l] ? true : undefined}
                    aria-describedby={`${errors.text?.[l] ? `${uid}-text-${l}-error` : `${uid}-text-${l}-hint`} ${uid}-markers-${l}`}
                  />
                </FormField>
              </TabsContent>
              <TabsContent value="preview">
                <Panel className="max-h-[70dvh] overflow-y-auto">{v.texts[l].trim() ? <RulesText body={v.texts[l]} locale={l} /> : <p className="text-sm text-muted-foreground">—</p>}</Panel>
              </TabsContent>
            </Tabs>
            <div id={`${uid}-markers-${l}`} aria-live="polite" className="text-sm">
              {(errors.markers?.filter((m) => m.locale === l) ?? markers[l]).length ? (
                <>
                  <p className="font-medium text-warning">{t("networkRules.markers")}</p>
                  <ul className="mt-1 grid gap-0.5 font-mono text-xs">
                    {(errors.markers?.filter((m) => m.locale === l) ?? markers[l]).map((m, i) => (
                      <li key={i}>{t("networkRules.markerLine", { line: m.line, marker: m.marker })}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-muted-foreground">{t("networkRules.noMarkers")}</p>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        {v.draftId ? (
          <ConfirmDialog
            trigger={<Button type="button" variant="ghost" className="min-h-11 sm:min-h-10">{t("networkRules.deleteDraft")}</Button>}
            title={t("networkRules.deleteDraftTitle")}
            description={t("networkRules.deleteDraftDescription")}
            confirmLabel={t("networkRules.deleteDraft")}
            destructive
            onConfirm={async () => {
              const r = await deleteNetworkRulesDraft(v.draftId!);
              if (r.ok) {
                toast.success(t("networkRules.draftDeleted"));
                router.push("/admin/network-rules");
              }
              return r;
            }}
          />
        ) : null}
        <Button type="button" variant="outline" className="min-h-11 sm:min-h-10" disabled={pending} onClick={saveDraft}>
          {pending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          {t("networkRules.saveDraft")}
        </Button>
        <Button type="button" className="min-h-11 sm:min-h-10" disabled={pending || hasUpcoming} onClick={askPublish} aria-describedby={hasUpcoming ? `${uid}-upcoming` : undefined}>
          {t("networkRules.publish")}
        </Button>
      </div>
      {hasUpcoming ? <p id={`${uid}-upcoming`} className="text-right text-sm text-muted-foreground">{t("networkRules.upcomingExists")}</p> : null}
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={t("networkRules.publishTitle", { label: v.label })} description={publishBody} confirmLabel={t("networkRules.publish")} onConfirm={async () => void (await publish())} />
    </form>
  );
}
