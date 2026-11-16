"use client";

import { SUPPORTED_CURRENCIES } from "@/lib/money/currency";
import { ActionForm } from "@/components/shared/action-form";
import { focusFirstInvalid } from "@/components/shared/focus-invalid";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { CircleAlert, EyeOff, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/shared/form-field";
import { SubmitButton } from "@/components/shared/submit-button";
import { LocationFields } from "@/components/shared/location-fields";
import { FormMessage } from "@/components/shared/form-message";
import type { JobNetworkState } from "@/features/network-rules/job-network";
import { Panel } from "@/components/shared/card";
import { NativeSelect } from "@/components/shared/native-select";
import type { ActionResult } from "@/lib/actions/result";
import { ARRANGEMENT, CONTRACT, SENIORITY } from "@/lib/labels";
import { useGlobalT, useT } from "@/i18n/client";
import { suggestFromDescription } from "../actions";
import { TermsFields, type TermsFormContext } from "./terms-fields";

export type JobDefaults = Partial<{
  title: string;
  clientName: string;
  clientConfidential: boolean;
  description: string;
  requiredSkills: string;
  preferredSkills: string;
  seniority: string;
  minYearsExperience: string;
  workArrangement: string;
  locationCity: string;
  locationRegion: string;
  locationCountry: string;
  languages: string;
  contractType: string;
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  acceptsExternalReferrals: boolean;
  shareDescription: boolean;
  shareSalary: boolean;
  shareLocation: boolean;
  travelRequirement: string;
  visaSponsorship: boolean;
  relocationSupport: boolean;
}>;

const CURRENCIES = SUPPORTED_CURRENCIES;

export function JobForm({
  orgSlug,
  action,
  defaults = {},
  cancelHref,
  isNew,
  autoFilled = [],
  actionsTarget,
  terms,
  network,
}: {
  orgSlug: string;
  action: (state: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  defaults?: JobDefaults;
  cancelHref: string;
  isNew: boolean;
  /** Fields pre-filled by an import; marked so the recruiter knows what to double-check. */
  autoFilled?: readonly string[];
  /** When set, the form's buttons render here (e.g. the page header) instead of below the form. */
  actionsTarget?: HTMLElement | null;
  /** N2 terms card context: current version (if any), referral count and the default split. */
  terms: TermsFormContext;
  /** N10 (S20-b): why an open job is hidden from partners at org level, or that this member must accept first. */
  network?: JobNetworkState;
}) {
  const [state, formAction] = useActionState(action, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const d = defaults;
  const [pending, start] = useTransition();
  const t = useT("jobs");
  const tg = useGlobalT();
  const descRef = useRef<HTMLTextAreaElement>(null);
  const [required, setRequired] = useState(d.requiredSkills ?? "");
  const [seniority, setSeniority] = useState(d.seniority ?? "");
  const [years, setYears] = useState(d.minYearsExperience ?? "");
  const [arrangement, setArrangement] = useState(d.workArrangement ?? "hybrid");
  const [external, setExternal] = useState(d.acceptsExternalReferrals ?? true);
  const [confidential, setConfidential] = useState(d.clientConfidential ?? true);
  const [salaryMin, setSalaryMin] = useState(d.salaryMin ?? "");
  const [salaryMax, setSalaryMax] = useState(d.salaryMax ?? "");
  const [salaryCurrency, setSalaryCurrency] = useState(d.salaryCurrency ?? "CAD");
  const [contractType, setContractType] = useState(d.contractType ?? "permanent");
  // BR-10: on for a new job; an existing job keeps its value (PD-047), except that opening a job that
  // was never open and has no terms version switches it on (it can be switched off before saving).
  const [shareSalary, setShareSalary] = useState(d.shareSalary ?? isNew);
  const [shareDescription, setShareDescription] = useState(d.shareDescription ?? true);
  const [shareLocation, setShareLocation] = useState(d.shareLocation ?? true);
  const [initiallyOpen] = useState(d.acceptsExternalReferrals ?? true);
  const toggleExternal = (on: boolean) => {
    setExternal(on);
    if (on && !initiallyOpen && !terms.current) setShareSalary(true);
  };
  const notPermanent = external && contractType !== "permanent";
  const formRef = useRef<HTMLFormElement>(null);
  // After a refused save, move focus to the first invalid field (spec 2.1, AC-10).
  useEffect(() => {
    if (!fe || !Object.keys(fe).length) return;
    focusFirstInvalid(formRef.current);
  }, [fe]);
  const auto = (k: keyof JobDefaults) =>
    autoFilled.includes(k) ? (
      <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-info-soft px-1.5 py-px align-middle text-[10px] font-semibold text-info">
        <Sparkles className="size-2.5" aria-hidden />
        {t("import.autoBadge")}
      </span>
    ) : null;

  const suggest = () =>
    start(async () => {
      const text = descRef.current?.value ?? "";
      if (text.trim().length < 40) {
        toast.error(t("form.suggestTooShort"));
        return;
      }
      const r = await suggestFromDescription(orgSlug, text);
      if (!r.ok || !r.data) return;
      const { skills, seniority: s, years: y, arrangement: a } = r.data;
      if (skills.length) setRequired((prev) => [...new Set([...prev.split(",").map((x) => x.trim()).filter(Boolean), ...skills])].join(", "));
      if (s && !seniority) setSeniority(s);
      if (y !== null && !years) setYears(String(y));
      if (a) setArrangement(a);
      toast.success(t("form.suggested", { count: skills.length }));
    });

  // `form` ties the buttons to this form even when portaled outside it (into the page header);
  // the portal keeps them in this React tree, so they still see the form's pending state.
  const formId = useId();
  const buttons = (
    <>
      <Button variant="outline" asChild><Link href={cancelHref}>{t("form.cancel")}</Link></Button>
      {isNew ? (
        <>
          <SubmitButton form={formId} variant="secondary" name="status" value="draft">{t("form.saveDraft")}</SubmitButton>
          <SubmitButton form={formId} name="status" value="active">{t("form.publish")}</SubmitButton>
        </>
      ) : (
        <SubmitButton form={formId}>{t("form.saveChanges")}</SubmitButton>
      )}
    </>
  );

  return (
    <ActionForm ref={formRef} id={formId} action={formAction} className="grid grid-cols-[minmax(0,1fr)] gap-5" noValidate>
      <Panel className="grid gap-5 p-6">
        <h2 className="text-base font-semibold">{t("form.role")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField badge={auto("title")} id="title" label={t("form.title")} error={fe?.title} required>
            <Input id="title" name="title" defaultValue={d.title} required />
          </FormField>
          <FormField badge={auto("contractType")} id="contractType" label={t("form.contractType")} error={fe?.contractType}>
            <NativeSelect
              id="contractType"
              name="contractType"
              value={contractType}
              onChange={(e) => setContractType(e.target.value)}
              aria-invalid={fe?.contractType ? true : undefined}
              aria-describedby={[fe?.contractType ? "contractType-error" : null, notPermanent ? "permanent-only" : null].filter(Boolean).join(" ") || undefined}
            >
              {(Object.keys(CONTRACT) as (keyof typeof CONTRACT)[]).map((v) => <option key={v} value={v}>{tg(`labels.contract.${v}`)}</option>)}
            </NativeSelect>
          </FormField>
          {/* The hint follows "Hide client" (BR-32): optional internal name vs. the shown name's duplicate benefit. Never a key or match count.
              N3 BR-1: while the job is open to partners the name is required (the server refuses the whole save
              otherwise, drafts included), and the hint says so. `#client` is the nudge CTA's anchor (spec §2.1). */}
          <div id="client" className="scroll-mt-24">
            <FormField
              badge={auto("clientName")}
              id="clientName"
              label={t("form.client")}
              error={fe?.clientName}
              required={external}
              hint={
                external ? (
                  <span className="text-pretty">{t("form.clientRequiredForPartners")}</span>
                ) : confidential ? (
                  <span className="flex items-start gap-1.5 text-pretty"><EyeOff className="mt-px size-3.5 shrink-0" aria-hidden />{t("form.clientInternalHint")}</span>
                ) : (
                  t("form.clientDuplicateHint")
                )
              }
            >
              <Input
                id="clientName"
                name="clientName"
                defaultValue={d.clientName}
                aria-required={external ? true : undefined}
                aria-describedby={fe?.clientName ? "clientName-error" : "clientName-hint"}
                aria-invalid={fe?.clientName ? true : undefined}
              />
            </FormField>
          </div>
          {/* Aligned to the Hiring client input (label row 20px + 6px gap), even when that field shows an error. */}
          <Label className="flex min-h-11 items-center gap-2 self-start font-normal sm:mt-[26px] sm:h-10 sm:min-h-0">
            <Checkbox name="clientConfidential" checked={confidential} onCheckedChange={(v) => setConfidential(v === true)} />
            {t("form.hideClient")}
          </Label>
        </div>
        <FormField badge={auto("description")} id="description" label={t("form.description")} hint={t("form.descriptionHint")}>
          <Textarea id="description" name="description" ref={descRef} rows={8} defaultValue={d.description} />
        </FormField>
        <Button type="button" variant="secondary" onClick={suggest} disabled={pending} className="h-auto min-h-11 max-w-full justify-self-start py-2 text-left whitespace-normal sm:min-h-10">
          <Wand2 className="size-4" aria-hidden /> {pending ? t("form.analyzing") : t("form.suggest")}
        </Button>
      </Panel>

      <Panel className="grid gap-5 p-6">
        <h2 className="text-base font-semibold">{t("form.requirements")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField badge={auto("requiredSkills")} id="requiredSkills" label={t("form.requiredSkills")} error={fe?.requiredSkills} hint={t("form.requiredSkillsHint")}>
            <Input id="requiredSkills" name="requiredSkills" value={required} onChange={(e) => setRequired(e.target.value)} />
          </FormField>
          <FormField badge={auto("preferredSkills")} id="preferredSkills" label={t("form.niceToHave")}>
            <Input id="preferredSkills" name="preferredSkills" defaultValue={d.preferredSkills} />
          </FormField>
          <FormField badge={auto("seniority")} id="seniority" label={t("form.seniority")}>
            <NativeSelect id="seniority" name="seniority" value={seniority} onChange={(e) => setSeniority(e.target.value)}>
              <option value="">{t("form.notSpecified")}</option>
              {(Object.keys(SENIORITY) as (keyof typeof SENIORITY)[]).map((v) => <option key={v} value={v}>{tg(`labels.seniority.${v}`)}</option>)}
            </NativeSelect>
          </FormField>
          <FormField badge={auto("minYearsExperience")} id="minYearsExperience" label={t("form.minYears")} error={fe?.minYearsExperience}>
            <Input id="minYearsExperience" name="minYearsExperience" inputMode="decimal" value={years} onChange={(e) => setYears(e.target.value)} />
          </FormField>
          <FormField badge={auto("languages")} id="languages" label={t("form.languages")} hint={t("form.languagesHint")}>
            <Input id="languages" name="languages" defaultValue={d.languages} />
          </FormField>
          <FormField badge={auto("workArrangement")} id="workArrangement" label={t("form.workArrangement")}>
            <NativeSelect id="workArrangement" name="workArrangement" value={arrangement} onChange={(e) => setArrangement(e.target.value)}>
              {(Object.keys(ARRANGEMENT) as (keyof typeof ARRANGEMENT)[]).map((v) => <option key={v} value={v}>{tg(`labels.arrangement.${v}`)}</option>)}
            </NativeSelect>
          </FormField>
        </div>
        <LocationFields
          defaults={{ country: d.locationCountry ?? "CA", region: d.locationRegion, city: d.locationCity }}
          labels={{ country: t("form.country"), region: t("form.region"), city: t("form.city") }}
          errors={{ country: fe?.locationCountry, region: fe?.locationRegion, city: fe?.locationCity }}
          badges={{ country: auto("locationCountry"), region: auto("locationRegion"), city: auto("locationCity") }}
        />
        <div className="grid gap-4 sm:grid-cols-3 sm:items-end">
          <FormField id="travelRequirement" label={t("form.travel")}>
            <NativeSelect id="travelRequirement" name="travelRequirement" defaultValue={d.travelRequirement ?? ""}>
              <option value="">{t("form.notSpecified")}</option>
              {(["none", "occasional", "frequent"] as const).map((v) => <option key={v} value={v}>{tg(`labels.travel.${v}`)}</option>)}
            </NativeSelect>
          </FormField>
          <Label className="flex h-10 items-center gap-2 font-normal">
            <Checkbox name="visaSponsorship" defaultChecked={d.visaSponsorship ?? false} /> {t("form.visaSponsorship")}
          </Label>
          <Label className="flex h-10 items-center gap-2 font-normal">
            <Checkbox name="relocationSupport" defaultChecked={d.relocationSupport ?? false} /> {t("form.relocationSupport")}
          </Label>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField badge={auto("salaryMin")} id="salaryMin" label={t("form.salaryMin")} error={fe?.salaryMin}><Input id="salaryMin" name="salaryMin" inputMode="decimal" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} /></FormField>
          <FormField badge={auto("salaryMax")} id="salaryMax" label={t("form.salaryMax")} error={fe?.salaryMax}><Input id="salaryMax" name="salaryMax" inputMode="decimal" value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} /></FormField>
          <FormField badge={auto("salaryCurrency")} id="salaryCurrency" label={t("form.currency")}>
            <NativeSelect id="salaryCurrency" name="salaryCurrency" value={salaryCurrency} onChange={(e) => setSalaryCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</NativeSelect>
          </FormField>
        </div>
      </Panel>

      <Panel className="grid gap-5 p-6">
        <h2 className="text-base font-semibold">{t("form.partnerReferrals")}</h2>
        <Label className="flex items-start gap-3 rounded-2xl border border-border p-4 leading-5 font-normal">
          <Checkbox name="acceptsExternalReferrals" checked={external} onCheckedChange={(v) => toggleExternal(v === true)} className="mt-0.5" />
          <span>
            <span className="block font-medium">{t("form.openToPartners")}</span>
            <span className="block text-sm text-muted-foreground">
              {t("form.openToPartnersHint")}
            </span>
          </span>
        </Label>
        {external && network?.restriction ? (
          <p role="status" className="flex items-start gap-2 rounded-2xl bg-warning-soft px-3 py-2.5 text-sm text-warning">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="text-pretty">{network.restriction === "network_hold" ? t("form.restrictedHold") : t("form.restrictedRules")}</span>
          </p>
        ) : null}
        {external && !network?.restriction && network?.userMustAcceptLabel ? (
          <p role="status" className="flex flex-wrap items-start gap-2 rounded-2xl bg-warning-soft px-3 py-2.5 text-sm text-warning">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="text-pretty">{t("form.userMustAccept", { label: network.userMustAcceptLabel })}</span>
            <a href={network.acceptHref} className="font-medium text-foreground underline underline-offset-4">{tg("network.banner.cta.accept")}</a>
          </p>
        ) : null}
        {notPermanent ? (
          <p id="permanent-only" role="status" className="flex items-start gap-2 rounded-2xl bg-warning-soft px-3 py-2.5 text-sm text-warning">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="text-pretty">{t("form.terms.permanentOnly")}</span>
          </p>
        ) : null}
        {external ? (
          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-medium">{t("form.visibleTitle")}</legend>
            <p className="-mt-1 text-xs text-muted-foreground">{t("form.visibleHint")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Label className="flex min-h-11 items-center gap-2 font-normal sm:min-h-0">
                <Checkbox name="shareDescription" checked={shareDescription} onCheckedChange={(v) => setShareDescription(v === true)} /> {t("form.shareDescription")}
              </Label>
              <Label className="flex min-h-11 items-center gap-2 font-normal sm:min-h-0">
                <Checkbox name="shareLocation" checked={shareLocation} onCheckedChange={(v) => setShareLocation(v === true)} /> {t("form.shareLocation")}
              </Label>
            </div>
          </fieldset>
        ) : (
          // Closing a job to partners keeps its visibility choices for when it reopens.
          <>
            {shareDescription ? <input type="hidden" name="shareDescription" value="on" /> : null}
            {shareLocation ? <input type="hidden" name="shareLocation" value="on" /> : null}
            {shareSalary ? <input type="hidden" name="shareSalary" value="on" /> : null}
          </>
        )}
      </Panel>

      {/* N2: the card renders (and posts) only while the job is open to partners (spec 2.1). */}
      {external ? (
        <TermsFields
          ctx={terms}
          salaryMin={salaryMin}
          salaryMax={salaryMax}
          salaryCurrency={salaryCurrency}
          shareSalary={shareSalary}
          onShareSalaryChange={setShareSalary}
          errors={fe}
        />
      ) : null}

      <FormMessage state={state && !state.ok && state.code === "rules_acceptance_required" && network ? { ...state, error: t("form.errors.userMustAccept", { label: network.userMustAcceptLabel ?? "" }) } : state} />
      {actionsTarget === undefined ? <div className="flex flex-wrap justify-end gap-2">{buttons}</div> : actionsTarget ? createPortal(buttons, actionsTarget) : null}
    </ActionForm>
  );
}
