"use client";

import { ActionForm } from "@/components/shared/action-form";

import { useActionState, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Sparkles, Wand2 } from "lucide-react";
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
import { Panel } from "@/components/shared/card";
import { NativeSelect } from "@/components/shared/native-select";
import type { ActionResult } from "@/lib/actions/result";
import { ARRANGEMENT, CONTRACT, SENIORITY } from "@/lib/labels";
import { useGlobalT, useT } from "@/i18n/client";
import { suggestFromDescription } from "../actions";

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
  expectedFee: string;
  feeCurrency: string;
  acceptsExternalReferrals: boolean;
  shareDescription: boolean;
  shareSalary: boolean;
  shareLocation: boolean;
  travelRequirement: string;
  visaSponsorship: boolean;
  relocationSupport: boolean;
  shareFee: boolean;
}>;

const CURRENCIES = ["CAD", "USD", "EUR", "GBP", "BRL"];

export function JobForm({
  orgSlug,
  action,
  defaults = {},
  cancelHref,
  isNew,
  autoFilled = [],
  actionsTarget,
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
    <ActionForm id={formId} action={formAction} className="grid gap-5" noValidate>
      <Panel className="grid gap-5 p-6">
        <h2 className="text-base font-semibold">{t("form.role")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField badge={auto("title")} id="title" label={t("form.title")} error={fe?.title} required>
            <Input id="title" name="title" defaultValue={d.title} required />
          </FormField>
          <FormField badge={auto("contractType")} id="contractType" label={t("form.contractType")}>
            <NativeSelect id="contractType" name="contractType" defaultValue={d.contractType ?? "permanent"}>
              {(Object.keys(CONTRACT) as (keyof typeof CONTRACT)[]).map((v) => <option key={v} value={v}>{tg(`labels.contract.${v}`)}</option>)}
            </NativeSelect>
          </FormField>
          <FormField badge={auto("clientName")} id="clientName" label={t("form.client")} error={fe?.clientName}>
            <Input id="clientName" name="clientName" defaultValue={d.clientName} />
          </FormField>
          {/* Aligned to the Hiring client input (label row 20px + 6px gap), even when that field shows an error. */}
          <Label className="flex items-center gap-2 self-start font-normal sm:mt-[26px] sm:h-10">
            <Checkbox name="clientConfidential" checked={confidential} onCheckedChange={(v) => setConfidential(v === true)} />
            {t("form.hideClient")}
          </Label>
        </div>
        <FormField badge={auto("description")} id="description" label={t("form.description")} hint={t("form.descriptionHint")}>
          <Textarea id="description" name="description" ref={descRef} rows={8} defaultValue={d.description} />
        </FormField>
        <Button type="button" variant="secondary" onClick={suggest} disabled={pending} className="justify-self-start">
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
          <FormField badge={auto("salaryMin")} id="salaryMin" label={t("form.salaryMin")} error={fe?.salaryMin}><Input id="salaryMin" name="salaryMin" inputMode="decimal" defaultValue={d.salaryMin} /></FormField>
          <FormField badge={auto("salaryMax")} id="salaryMax" label={t("form.salaryMax")} error={fe?.salaryMax}><Input id="salaryMax" name="salaryMax" inputMode="decimal" defaultValue={d.salaryMax} /></FormField>
          <FormField badge={auto("salaryCurrency")} id="salaryCurrency" label={t("form.currency")}>
            <NativeSelect id="salaryCurrency" name="salaryCurrency" defaultValue={d.salaryCurrency ?? "CAD"}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</NativeSelect>
          </FormField>
        </div>
      </Panel>

      <Panel className="grid gap-5 p-6">
        <h2 className="text-base font-semibold">{t("form.partnerReferrals")}</h2>
        <Label className="flex items-start gap-3 rounded-2xl border border-border p-4 leading-5 font-normal">
          <Checkbox name="acceptsExternalReferrals" checked={external} onCheckedChange={(v) => setExternal(v === true)} className="mt-0.5" />
          <span>
            <span className="block font-medium">{t("form.openToPartners")}</span>
            <span className="block text-sm text-muted-foreground">
              {t("form.openToPartnersHint")}
            </span>
          </span>
        </Label>
        {external ? (
          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-medium">{t("form.visibleTitle")}</legend>
            <p className="-mt-1 text-xs text-muted-foreground">{t("form.visibleHint")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ["shareDescription", t("form.shareDescription"), d.shareDescription ?? true],
                ["shareLocation", t("form.shareLocation"), d.shareLocation ?? true],
                ["shareSalary", t("form.shareSalary"), d.shareSalary ?? false],
                ["shareFee", t("form.shareFee"), d.shareFee ?? true],
              ].map(([name, label, def]) => (
                <Label key={name as string} className="flex items-center gap-2 font-normal">
                  <Checkbox name={name as string} defaultChecked={def as boolean} /> {label as string}
                </Label>
              ))}
            </div>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <FormField id="expectedFee" label={t("form.expectedFee")} error={fe?.expectedFee} hint={t("form.expectedFeeHint")}>
                <Input id="expectedFee" name="expectedFee" inputMode="decimal" defaultValue={d.expectedFee} />
              </FormField>
              <FormField id="feeCurrency" label={t("form.feeCurrency")}>
                <NativeSelect id="feeCurrency" name="feeCurrency" defaultValue={d.feeCurrency ?? "CAD"}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</NativeSelect>
              </FormField>
            </div>
          </fieldset>
        ) : null}
      </Panel>

      <FormMessage state={state} />
      {actionsTarget === undefined ? <div className="flex flex-wrap justify-end gap-2">{buttons}</div> : actionsTarget ? createPortal(buttons, actionsTarget) : null}
    </ActionForm>
  );
}
