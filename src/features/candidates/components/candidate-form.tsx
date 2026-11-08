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
import { SubmitButton } from "@/components/shared/submit-button";
import { FormMessage } from "@/components/shared/form-message";
import { Panel } from "@/components/shared/card";
import type { ActionResult } from "@/lib/actions/result";
import { ARRANGEMENT, LEGAL_BASIS, SENIORITY } from "@/lib/labels";
import { NativeSelect } from "@/components/shared/native-select";

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

  return (
    <ActionForm action={formAction} className="grid gap-5" noValidate>
      <Panel className="grid gap-5 p-6">
        <h2 className="text-base font-semibold">Identity & contact</h2>
        <p className="-mt-3 text-sm text-muted-foreground">
          Visible only to your organization. Never used for matching and never shared unless you explicitly choose to in a referral.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="fullName" label="Full name" error={fe?.fullName} required>
            <Input id="fullName" name="fullName" defaultValue={d.fullName} required />
          </FormField>
          <FormField id="headline" label="Headline" error={fe?.headline} hint="e.g. Senior backend engineer, fintech">
            <Input id="headline" name="headline" defaultValue={d.headline} />
          </FormField>
          <FormField id="email" label="Email" error={fe?.email}>
            <Input id="email" name="email" type="email" defaultValue={d.email} />
          </FormField>
          <FormField id="phone" label="Phone" error={fe?.phone}>
            <Input id="phone" name="phone" type="tel" defaultValue={d.phone} />
          </FormField>
        </div>
      </Panel>

      <Panel className="grid gap-5 p-6">
        <h2 className="text-base font-semibold">Matching profile</h2>
        <p className="-mt-3 text-sm text-muted-foreground">
          Only these professional attributes are used to rank opportunities. Protected characteristics are never collected or used.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="skills" label="Skills" error={fe?.skills} hint="Comma-separated, e.g. TypeScript, React, PostgreSQL">
            <Input id="skills" name="skills" defaultValue={d.skills} />
          </FormField>
          <FormField id="languages" label="Working languages" error={fe?.languages} hint="e.g. English, French">
            <Input id="languages" name="languages" defaultValue={d.languages} />
          </FormField>
          <FormField id="seniority" label="Seniority" error={fe?.seniority}>
            <NativeSelect id="seniority" name="seniority" defaultValue={d.seniority ?? ""}>
              <option value="">Not specified</option>
              {Object.entries(SENIORITY).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="yearsExperience" label="Years of experience" error={fe?.yearsExperience}>
            <Input id="yearsExperience" name="yearsExperience" inputMode="decimal" defaultValue={d.yearsExperience} />
          </FormField>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Work arrangements accepted</legend>
          <div className="flex flex-wrap gap-3">
            {Object.entries(ARRANGEMENT).map(([v, l]) => (
              <Label key={v} className="flex items-center gap-2 rounded-full border border-border px-3.5 py-2 font-normal">
                <Checkbox name="workArrangements" value={v} defaultChecked={d.workArrangements?.includes(v)} />
                {l}
              </Label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="locationCity" label="City" error={fe?.locationCity}>
            <Input id="locationCity" name="locationCity" defaultValue={d.locationCity} />
          </FormField>
          <FormField id="locationRegion" label="Province / state" error={fe?.locationRegion} hint="e.g. ON">
            <Input id="locationRegion" name="locationRegion" defaultValue={d.locationRegion} />
          </FormField>
          <FormField id="locationCountry" label="Country" error={fe?.locationCountry} hint="2-letter code">
            <Input id="locationCountry" name="locationCountry" maxLength={2} defaultValue={d.locationCountry ?? "CA"} />
          </FormField>
        </div>
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox name="openToRelocation" defaultChecked={d.openToRelocation} /> Open to relocation
        </Label>
        <div className="grid gap-4 sm:grid-cols-4">
          <FormField id="salaryMin" label="Salary expectation (min)" error={fe?.salaryMin}>
            <Input id="salaryMin" name="salaryMin" inputMode="decimal" defaultValue={d.salaryMin} />
          </FormField>
          <FormField id="salaryMax" label="Salary expectation (max)" error={fe?.salaryMax}>
            <Input id="salaryMax" name="salaryMax" inputMode="decimal" defaultValue={d.salaryMax} />
          </FormField>
          <FormField id="salaryCurrency" label="Currency" error={fe?.salaryCurrency}>
            <NativeSelect id="salaryCurrency" name="salaryCurrency" defaultValue={d.salaryCurrency ?? "CAD"}>
              {["CAD", "USD", "EUR", "GBP", "BRL"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="availableFrom" label="Available from" error={fe?.availableFrom}>
            <Input id="availableFrom" name="availableFrom" type="date" defaultValue={d.availableFrom} />
          </FormField>
        </div>
        <FormField id="summary" label="Professional summary" error={fe?.summary}>
          <Textarea id="summary" name="summary" rows={4} defaultValue={d.summary} />
        </FormField>
      </Panel>

      <Panel className="grid gap-5 p-6">
        <h2 className="text-base font-semibold">Provenance & privacy</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="source" label="Data source">
            <NativeSelect id="source" name="source" defaultValue={d.source ?? "manual"}>
              <option value="manual">Direct contact / manual entry</option>
              <option value="resume_upload">Resume received</option>
              <option value="csv_import">CSV import</option>
              <option value="referral">Referral</option>
              <option value="other">Other</option>
            </NativeSelect>
          </FormField>
          <FormField id="sourceDetail" label="Source detail" hint="e.g. LinkedIn message, event name">
            <Input id="sourceDetail" name="sourceDetail" defaultValue={d.sourceDetail} />
          </FormField>
          <FormField id="legalBasis" label="Legal basis for processing" hint="Draft options — legal review required">
            <NativeSelect id="legalBasis" name="legalBasis" defaultValue={d.legalBasis ?? "consent"}>
              {Object.entries(LEGAL_BASIS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox name="privacyNoticeGiven" defaultChecked={d.privacyNoticeGiven} /> The candidate received our privacy notice
        </Label>
        <FormField id="notes" label="Private notes" hint="Internal to your organization. Never shared." error={fe?.notes}>
          <Textarea id="notes" name="notes" rows={3} defaultValue={d.notes} />
        </FormField>
        <input type="hidden" name="tags" value={d.tags ?? ""} />
      </Panel>

      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
