"use client";

import { ActionForm } from "@/components/shared/action-form";

import { useActionState, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/shared/form-field";
import { SubmitButton } from "@/components/shared/submit-button";
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
  shareFee: boolean;
}>;

const CURRENCIES = ["CAD", "USD", "EUR", "GBP", "BRL"];

export function JobForm({
  orgSlug,
  action,
  defaults = {},
  cancelHref,
  isNew,
}: {
  orgSlug: string;
  action: (state: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  defaults?: JobDefaults;
  cancelHref: string;
  isNew: boolean;
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

  return (
    <ActionForm action={formAction} className="grid gap-5" noValidate>
      <Panel className="grid gap-5 p-6">
        <h2 className="text-base font-semibold">{t("form.role")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="title" label={t("form.title")} error={fe?.title} required>
            <Input id="title" name="title" defaultValue={d.title} required />
          </FormField>
          <FormField id="contractType" label={t("form.contractType")}>
            <NativeSelect id="contractType" name="contractType" defaultValue={d.contractType ?? "permanent"}>
              {(Object.keys(CONTRACT) as (keyof typeof CONTRACT)[]).map((v) => <option key={v} value={v}>{tg(`labels.contract.${v}`)}</option>)}
            </NativeSelect>
          </FormField>
          <FormField id="clientName" label={t("form.client")} error={fe?.clientName}>
            <Input id="clientName" name="clientName" defaultValue={d.clientName} />
          </FormField>
          <Label className="flex items-center gap-2 self-end pb-2.5 font-normal">
            <Checkbox name="clientConfidential" checked={confidential} onCheckedChange={(v) => setConfidential(v === true)} />
            {t("form.hideClient")}
          </Label>
        </div>
        <FormField id="description" label={t("form.description")} hint={t("form.descriptionHint")}>
          <Textarea id="description" name="description" ref={descRef} rows={8} defaultValue={d.description} />
        </FormField>
        <Button type="button" variant="secondary" onClick={suggest} disabled={pending} className="justify-self-start">
          <Wand2 className="size-4" aria-hidden /> {pending ? t("form.analyzing") : t("form.suggest")}
        </Button>
      </Panel>

      <Panel className="grid gap-5 p-6">
        <h2 className="text-base font-semibold">{t("form.requirements")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="requiredSkills" label={t("form.requiredSkills")} error={fe?.requiredSkills} hint={t("form.requiredSkillsHint")}>
            <Input id="requiredSkills" name="requiredSkills" value={required} onChange={(e) => setRequired(e.target.value)} />
          </FormField>
          <FormField id="preferredSkills" label={t("form.niceToHave")}>
            <Input id="preferredSkills" name="preferredSkills" defaultValue={d.preferredSkills} />
          </FormField>
          <FormField id="seniority" label={t("form.seniority")}>
            <NativeSelect id="seniority" name="seniority" value={seniority} onChange={(e) => setSeniority(e.target.value)}>
              <option value="">{t("form.notSpecified")}</option>
              {(Object.keys(SENIORITY) as (keyof typeof SENIORITY)[]).map((v) => <option key={v} value={v}>{tg(`labels.seniority.${v}`)}</option>)}
            </NativeSelect>
          </FormField>
          <FormField id="minYearsExperience" label={t("form.minYears")} error={fe?.minYearsExperience}>
            <Input id="minYearsExperience" name="minYearsExperience" inputMode="decimal" value={years} onChange={(e) => setYears(e.target.value)} />
          </FormField>
          <FormField id="languages" label={t("form.languages")} hint={t("form.languagesHint")}>
            <Input id="languages" name="languages" defaultValue={d.languages} />
          </FormField>
          <FormField id="workArrangement" label={t("form.workArrangement")}>
            <NativeSelect id="workArrangement" name="workArrangement" value={arrangement} onChange={(e) => setArrangement(e.target.value)}>
              {(Object.keys(ARRANGEMENT) as (keyof typeof ARRANGEMENT)[]).map((v) => <option key={v} value={v}>{tg(`labels.arrangement.${v}`)}</option>)}
            </NativeSelect>
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="locationCity" label={t("form.city")}><Input id="locationCity" name="locationCity" defaultValue={d.locationCity} /></FormField>
          <FormField id="locationRegion" label={t("form.region")}><Input id="locationRegion" name="locationRegion" defaultValue={d.locationRegion} /></FormField>
          <FormField id="locationCountry" label={t("form.country")} error={fe?.locationCountry}><Input id="locationCountry" name="locationCountry" maxLength={2} defaultValue={d.locationCountry ?? "CA"} /></FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="salaryMin" label={t("form.salaryMin")} error={fe?.salaryMin}><Input id="salaryMin" name="salaryMin" inputMode="decimal" defaultValue={d.salaryMin} /></FormField>
          <FormField id="salaryMax" label={t("form.salaryMax")} error={fe?.salaryMax}><Input id="salaryMax" name="salaryMax" inputMode="decimal" defaultValue={d.salaryMax} /></FormField>
          <FormField id="salaryCurrency" label={t("form.currency")}>
            <NativeSelect id="salaryCurrency" name="salaryCurrency" defaultValue={d.salaryCurrency ?? "CAD"}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</NativeSelect>
          </FormField>
        </div>
      </Panel>

      <Panel className="grid gap-5 p-6">
        <h2 className="text-base font-semibold">{t("form.partnerReferrals")}</h2>
        <Label className="flex items-start gap-3 rounded-2xl border border-border p-4 font-normal">
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
            <div className="grid gap-4 sm:grid-cols-2">
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
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" asChild><Link href={cancelHref}>{t("form.cancel")}</Link></Button>
        {isNew ? (
          <>
            <SubmitButton variant="secondary" name="status" value="draft">{t("form.saveDraft")}</SubmitButton>
            <SubmitButton name="status" value="active">{t("form.publish")}</SubmitButton>
          </>
        ) : (
          <SubmitButton>{t("form.saveChanges")}</SubmitButton>
        )}
      </div>
    </ActionForm>
  );
}
