"use client";

import { ActionForm } from "@/components/shared/action-form";

import { useActionState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/shared/form-field";
import { LocationFields } from "@/components/shared/location-fields";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormMessage } from "@/components/shared/form-message";
import { Panel } from "@/components/shared/card";
import type { ActionResult } from "@/lib/actions/result";
import { ARRANGEMENT, LEGAL_BASIS, SENIORITY } from "@/lib/labels";
import { NativeSelect } from "@/components/shared/native-select";
import { useGlobalT, useT } from "@/i18n/client";

const SOURCES = ["manual", "resume_upload", "csv_import", "referral", "other"] as const;

export type CandidateDefaults = Partial<{
  fullName: string;
  email: string;
  phone: string;
  headline: string;
  summary: string;
  locationCity: string;
  locationRegion: string;
  locationCountry: string;
  openToRelocation: boolean;
  workArrangements: string[];
  seniority: string;
  yearsExperience: string;
  skills: string;
  languages: string;
  tags: string;
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  availableFrom: string;
  notes: string;
  source: string;
  sourceDetail: string;
  legalBasis: string;
  privacyNoticeGiven: boolean;
}>;

export function CandidateForm({
  action,
  defaults = {},
  cancelHref,
  submitLabel,
}: {
  action: (state: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  defaults?: CandidateDefaults;
  cancelHref: string;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const d = defaults;
  const t = useT("candidates");
  const tg = useGlobalT();

  return (
    <ActionForm action={formAction} className="grid gap-5" noValidate>
      <Panel className="grid gap-5 p-6">
        <h2 className="text-base font-semibold">{t("form.identityTitle")}</h2>
        <p className="-mt-3 text-sm text-muted-foreground">
          {t("form.identityBody")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="fullName" label={t("form.fullName")} error={fe?.fullName} required>
            <Input id="fullName" name="fullName" defaultValue={d.fullName} required />
          </FormField>
          <FormField id="headline" label={t("form.headline")} error={fe?.headline} hint={t("form.headlineHint")}>
            <Input id="headline" name="headline" defaultValue={d.headline} />
          </FormField>
          <FormField id="email" label={t("form.email")} error={fe?.email}>
            <Input id="email" name="email" type="email" defaultValue={d.email} />
          </FormField>
          <FormField id="phone" label={t("form.phone")} error={fe?.phone}>
            <Input id="phone" name="phone" type="tel" defaultValue={d.phone} />
          </FormField>
        </div>
      </Panel>

      <Panel className="grid gap-5 p-6">
        <h2 className="text-base font-semibold">{t("form.matchingTitle")}</h2>
        <p className="-mt-3 text-sm text-muted-foreground">
          {t("form.matchingBody")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="skills" label={t("form.skills")} error={fe?.skills} hint={t("form.skillsHint")}>
            <Input id="skills" name="skills" defaultValue={d.skills} />
          </FormField>
          <FormField id="languages" label={t("form.languages")} error={fe?.languages} hint={t("form.languagesHint")}>
            <Input id="languages" name="languages" defaultValue={d.languages} />
          </FormField>
          <FormField id="seniority" label={t("form.seniority")} error={fe?.seniority}>
            <NativeSelect id="seniority" name="seniority" defaultValue={d.seniority ?? ""}>
              <option value="">{t("form.notSpecified")}</option>
              {(Object.keys(SENIORITY) as (keyof typeof SENIORITY)[]).map((v) => (
                <option key={v} value={v}>
                  {tg(`labels.seniority.${v}`)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="yearsExperience" label={t("form.yearsExperience")} error={fe?.yearsExperience}>
            <Input id="yearsExperience" name="yearsExperience" inputMode="decimal" defaultValue={d.yearsExperience} />
          </FormField>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("form.arrangements")}</legend>
          <div className="flex flex-wrap gap-3">
            {(Object.keys(ARRANGEMENT) as (keyof typeof ARRANGEMENT)[]).map((v) => (
              <Label key={v} className="flex items-center gap-2 rounded-full border border-border px-3.5 py-2 font-normal">
                <Checkbox name="workArrangements" value={v} defaultChecked={d.workArrangements?.includes(v)} />
                {tg(`labels.arrangement.${v}`)}
              </Label>
            ))}
          </div>
        </fieldset>
        <LocationFields
          defaults={{ country: d.locationCountry ?? "CA", region: d.locationRegion, city: d.locationCity }}
          labels={{ country: t("form.country"), region: t("form.region"), city: t("form.city") }}
          errors={{ country: fe?.locationCountry, region: fe?.locationRegion, city: fe?.locationCity }}
        />
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox name="openToRelocation" defaultChecked={d.openToRelocation} /> {t("form.openToRelocation")}
        </Label>
        <div className="grid gap-4 sm:grid-cols-4">
          <FormField id="salaryMin" label={t("form.salaryMin")} error={fe?.salaryMin}>
            <Input id="salaryMin" name="salaryMin" inputMode="decimal" defaultValue={d.salaryMin} />
          </FormField>
          <FormField id="salaryMax" label={t("form.salaryMax")} error={fe?.salaryMax}>
            <Input id="salaryMax" name="salaryMax" inputMode="decimal" defaultValue={d.salaryMax} />
          </FormField>
          <FormField id="salaryCurrency" label={t("form.currency")} error={fe?.salaryCurrency}>
            <NativeSelect id="salaryCurrency" name="salaryCurrency" defaultValue={d.salaryCurrency ?? "CAD"}>
              {["CAD", "USD", "EUR", "GBP", "BRL"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="availableFrom" label={t("form.availableFrom")} error={fe?.availableFrom}>
            <Input id="availableFrom" name="availableFrom" type="date" defaultValue={d.availableFrom} />
          </FormField>
        </div>
        <FormField id="summary" label={t("form.summary")} error={fe?.summary}>
          <Textarea id="summary" name="summary" rows={4} defaultValue={d.summary} />
        </FormField>
      </Panel>

      <Panel className="grid gap-5 p-6">
        <h2 className="text-base font-semibold">{t("form.sourceTitle")}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="source" label={t("form.source")}>
            <NativeSelect id="source" name="source" defaultValue={d.source ?? "manual"}>
              {SOURCES.map((v) => (
                <option key={v} value={v}>
                  {t(`form.sources.${v}`)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="sourceDetail" label={t("form.sourceDetail")} hint={t("form.sourceDetailHint")}>
            <Input id="sourceDetail" name="sourceDetail" defaultValue={d.sourceDetail} />
          </FormField>
          <FormField id="legalBasis" label={t("form.legalBasis")} hint={t("form.legalBasisHint")}>
            <NativeSelect id="legalBasis" name="legalBasis" defaultValue={d.legalBasis ?? "consent"}>
              {(Object.keys(LEGAL_BASIS) as (keyof typeof LEGAL_BASIS)[]).map((v) => (
                <option key={v} value={v}>
                  {tg(`labels.legalBasis.${v}`)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox name="privacyNoticeGiven" defaultChecked={d.privacyNoticeGiven} /> {t("form.privacyNotice")}
        </Label>
        <FormField id="notes" label={t("form.notes")} hint={t("form.notesHint")} error={fe?.notes}>
          <Textarea id="notes" name="notes" rows={3} defaultValue={d.notes} />
        </FormField>
        <input type="hidden" name="tags" value={d.tags ?? ""} />
      </Panel>

      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" asChild>
          <Link href={cancelHref}>{t("form.cancel")}</Link>
        </Button>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
