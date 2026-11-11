"use client";

import { ActionForm } from "@/components/shared/action-form";

import { useActionState, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/shared/form-field";
import { LocationFields } from "@/components/shared/location-fields";
import { CountryMultiSelect } from "@/components/shared/country-multi-select";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormMessage } from "@/components/shared/form-message";
import { Panel } from "@/components/shared/card";
import { TagInput } from "@/features/organizations/components/tag-input";
import type { ActionResult } from "@/lib/actions/result";
import { ARRANGEMENT, LEGAL_BASIS, SENIORITY } from "@/lib/labels";
import { NativeSelect } from "@/components/shared/native-select";
import { cn } from "@/lib/utils";
import { useGlobalT, useT } from "@/i18n/client";

const SOURCES = ["manual", "resume_upload", "csv_import", "referral", "other"] as const;
const CURRENCIES = ["CAD", "USD", "EUR", "GBP", "BRL"];
const LANGUAGE_SUGGESTIONS = ["english", "french", "portuguese", "spanish"];
const TRAVEL = ["none", "occasional", "frequent"] as const;
const RELOCATION = ["none", "region", "country", "international"] as const;

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
  linkedinUrl: string;
  postalCode: string;
  travelAvailability: string;
  relocationScope: string;
  relocationDestinations: string;
  hasPassport: string;
  passportCountries: string;
  workAuthorization: string;
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

const splitList = (s?: string) =>
  (s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const chip = (active: boolean) =>
  cn(
    "inline-flex items-center rounded-full border px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
    active ? "border-foreground bg-foreground text-background" : "border-border bg-background text-foreground hover:border-foreground/40",
  );

/** Single-choice pills backed by a hidden input. Clicking the active pill clears it when `clearable`. */
function ChoiceChips({
  name,
  label,
  options,
  defaultValue,
  clearable,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  clearable?: boolean;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => setValue(clearable && value === o.value ? "" : o.value)}
            className={chip(value === o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <input type="hidden" name={name} value={value} />
    </fieldset>
  );
}

/** Multi-choice pills: real checkboxes, so the form posts repeated values. */
function ToggleChips({ name, label, options, defaultValue = [] }: { name: string; label: string; options: { value: string; label: string }[]; defaultValue?: string[] }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input type="checkbox" name={name} value={o.value} defaultChecked={defaultValue.includes(o.value)} className="peer sr-only" />
            <span className={cn(chip(false), "peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50")}>
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ChipList({ id, name, label, hint, error, placeholder, defaultValue, suggestions }: { id: string; name: string; label: string; hint?: string; error?: string | string[]; placeholder: string; defaultValue?: string; suggestions?: string[] }) {
  const [items, setItems] = useState(() => splitList(defaultValue));
  return (
    <FormField id={id} label={label} hint={hint} error={error}>
      <TagInput id={id} value={items} onChange={setItems} placeholder={placeholder} suggestions={suggestions} max={60} describedBy={hint ? `${id}-hint` : undefined} />
      <input type="hidden" name={name} value={items.join(", ")} />
    </FormField>
  );
}

function YearsStepper({ defaultValue, error, label, t }: { defaultValue?: string; error?: string | string[]; label: string; t: (k: "form.decrease" | "form.increase" | "form.years") => string }) {
  const [v, setV] = useState(defaultValue ?? "");
  const n = Number(v) || 0;
  const step = (d: number) => setV(String(Math.min(70, Math.max(0, n + d))));
  return (
    <FormField id="yearsExperience" label={label} error={error}>
      <div className="flex h-10 w-fit items-center rounded-xl border border-input bg-background">
        <Button type="button" variant="ghost" size="icon" className="size-10 rounded-l-xl rounded-r-none" onClick={() => step(-1)} aria-label={t("form.decrease")}>
          <Minus className="size-4" aria-hidden />
        </Button>
        <input
          id="yearsExperience"
          name="yearsExperience"
          inputMode="numeric"
          value={v}
          onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, "").slice(0, 4))}
          placeholder="–"
          className="w-12 bg-transparent text-center text-sm tabular-nums outline-none"
        />
        <span className="pr-1 text-xs text-muted-foreground">{t("form.years")}</span>
        <Button type="button" variant="ghost" size="icon" className="size-10 rounded-l-none rounded-r-xl" onClick={() => step(1)} aria-label={t("form.increase")}>
          <Plus className="size-4" aria-hidden />
        </Button>
      </div>
    </FormField>
  );
}

/** Collapsible group for optional fields. Starts open when it already holds data or an error. */
function More({ title, hint, open, children }: { title: string; hint?: string; open: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group rounded-2xl border border-border/70 bg-background/50">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        {title}
        {hint ? <span className="font-normal text-muted-foreground">· {hint}</span> : null}
      </summary>
      <div className="grid gap-4 px-4 pb-4 pt-1">{children}</div>
    </details>
  );
}

function ToggleRow({ name, defaultChecked, children }: { name: string; defaultChecked?: boolean; children: ReactNode }) {
  return (
    <Label className="flex w-fit cursor-pointer items-center gap-2.5 font-normal">
      <Checkbox name={name} defaultChecked={defaultChecked} /> {children}
    </Label>
  );
}

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

  const detailsOpen = Boolean(d.salaryMin || d.salaryMax || d.availableFrom || d.summary || fe?.salaryMin || fe?.salaryMax || fe?.salaryCurrency || fe?.availableFrom || fe?.summary);
  const sourceOpen = Boolean(d.sourceDetail || d.notes || (d.legalBasis && d.legalBasis !== "consent") || fe?.notes);

  return (
    <ActionForm action={formAction} className="grid gap-5" noValidate>
      <Panel className="grid gap-5 p-6">
        <div>
          <h2 className="text-base font-semibold">{t("form.identityTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("form.identityBody")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="fullName" label={t("form.fullName")} error={fe?.fullName} required>
            <Input id="fullName" name="fullName" defaultValue={d.fullName} required autoComplete="off" />
          </FormField>
          <FormField id="headline" label={t("form.headline")} error={fe?.headline}>
            <Input id="headline" name="headline" defaultValue={d.headline} placeholder={t("form.headlineHint")} />
          </FormField>
          <FormField id="email" label={t("form.email")} error={fe?.email}>
            <Input id="email" name="email" type="email" defaultValue={d.email} autoComplete="off" />
          </FormField>
          <FormField id="phone" label={t("form.phone")} error={fe?.phone}>
            <Input id="phone" name="phone" type="tel" defaultValue={d.phone} autoComplete="off" />
          </FormField>
          <FormField id="linkedinUrl" label={t("form.linkedin")} error={fe?.linkedinUrl}>
            <Input id="linkedinUrl" name="linkedinUrl" type="url" inputMode="url" defaultValue={d.linkedinUrl} placeholder="https://www.linkedin.com/in/…" autoComplete="off" />
          </FormField>
          <FormField id="postalCode" label={t("form.postalCode")} hint={t("form.postalCodeHint")} error={fe?.postalCode}>
            <Input id="postalCode" name="postalCode" defaultValue={d.postalCode} autoComplete="off" />
          </FormField>
        </div>
      </Panel>

      <Panel className="grid gap-6 p-6">
        <div>
          <h2 className="text-base font-semibold">{t("form.matchingTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("form.matchingBody")}</p>
        </div>

        <ChipList id="skills" name="skills" label={t("form.skills")} error={fe?.skills} placeholder={t("form.skillsPlaceholder")} defaultValue={d.skills} />

        <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto]">
          <ChoiceChips
            name="seniority"
            label={t("form.seniority")}
            clearable
            defaultValue={d.seniority}
            options={(Object.keys(SENIORITY) as (keyof typeof SENIORITY)[]).map((v) => ({ value: v, label: tg(`labels.seniority.${v}`) }))}
          />
          <YearsStepper defaultValue={d.yearsExperience} error={fe?.yearsExperience} label={t("form.yearsExperience")} t={t} />
        </div>
        {fe?.seniority ? <p role="alert" className="-mt-4 text-xs font-medium text-danger">{fe.seniority}</p> : null}

        <ChipList id="languages" name="languages" label={t("form.languages")} error={fe?.languages} placeholder={t("form.languagesPlaceholder")} defaultValue={d.languages} suggestions={LANGUAGE_SUGGESTIONS} />

        <ToggleChips
          name="workArrangements"
          label={t("form.arrangements")}
          defaultValue={d.workArrangements}
          options={(Object.keys(ARRANGEMENT) as (keyof typeof ARRANGEMENT)[]).map((v) => ({ value: v, label: tg(`labels.arrangement.${v}`) }))}
        />

        <div className="grid gap-3">
          <LocationFields
            defaults={{ country: d.locationCountry ?? "CA", region: d.locationRegion, city: d.locationCity }}
            labels={{ country: t("form.country"), region: t("form.region"), city: t("form.city") }}
            errors={{ country: fe?.locationCountry, region: fe?.locationRegion, city: fe?.locationCity }}
          />
        </div>

        <More title={t("form.moreDetails")} hint={t("form.moreDetailsHint")} open={detailsOpen}>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <fieldset className="grid gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">{t("form.salaryRange")}</legend>
              <div className="flex items-center gap-2">
                <NativeSelect id="salaryCurrency" name="salaryCurrency" defaultValue={d.salaryCurrency ?? "CAD"} aria-label={t("form.currency")} className="w-24">
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </NativeSelect>
                <Input id="salaryMin" name="salaryMin" inputMode="decimal" defaultValue={d.salaryMin} placeholder={t("form.salaryFrom")} aria-label={t("form.salaryMin")} />
                <span className="text-muted-foreground" aria-hidden>–</span>
                <Input id="salaryMax" name="salaryMax" inputMode="decimal" defaultValue={d.salaryMax} placeholder={t("form.salaryTo")} aria-label={t("form.salaryMax")} />
              </div>
              {[fe?.salaryMin, fe?.salaryMax, fe?.salaryCurrency].flat().filter(Boolean)[0] ? (
                <p role="alert" className="text-xs font-medium text-danger">
                  {[fe?.salaryMin, fe?.salaryMax, fe?.salaryCurrency].flat().filter(Boolean)[0]}
                </p>
              ) : null}
            </fieldset>
            <FormField id="availableFrom" label={t("form.availableFrom")} error={fe?.availableFrom}>
              <Input id="availableFrom" name="availableFrom" type="date" defaultValue={d.availableFrom} />
            </FormField>
          </div>
          <FormField id="summary" label={t("form.summary")} error={fe?.summary}>
            <Textarea id="summary" name="summary" rows={4} defaultValue={d.summary} />
          </FormField>
        </More>
      </Panel>

      <Panel className="grid gap-6 p-6">
        <div>
          <h2 className="text-base font-semibold">{t("form.mobilityTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("form.mobilityBody")}</p>
        </div>
        <ChoiceChips
          name="travelAvailability"
          label={t("form.travel")}
          clearable
          defaultValue={d.travelAvailability}
          options={TRAVEL.map((v) => ({ value: v, label: t(`mobility.travel.${v}`) }))}
        />
        <ChoiceChips
          name="relocationScope"
          label={t("form.relocation")}
          clearable
          defaultValue={d.relocationScope}
          options={RELOCATION.map((v) => ({ value: v, label: t(`mobility.relocation.${v}`) }))}
        />
        <CountryMultiSelect id="relocationDestinations" name="relocationDestinations" label={t("form.destinations")} hint={t("form.destinationsHint")} error={fe?.relocationDestinations} defaultValue={splitList(d.relocationDestinations)} />
        <div className="grid gap-6 border-t border-border/60 pt-6">
          <ChoiceChips
            name="hasPassport"
            label={t("form.passport")}
            clearable
            defaultValue={d.hasPassport}
            options={[
              { value: "yes", label: t("mobility.passport.yes") },
              { value: "no", label: t("mobility.passport.no") },
            ]}
          />
          <CountryMultiSelect id="passportCountries" name="passportCountries" label={t("form.passportCountries")} hint={t("form.passportCountriesHint")} error={fe?.passportCountries} defaultValue={splitList(d.passportCountries)} max={10} />
          <CountryMultiSelect id="workAuthorization" name="workAuthorization" label={t("form.workAuthorization")} hint={t("form.workAuthorizationHint")} error={fe?.workAuthorization} defaultValue={splitList(d.workAuthorization)} />
        </div>
      </Panel>

      <Panel className="grid gap-5 p-6">
        <h2 className="text-base font-semibold">{t("form.sourceTitle")}</h2>
        <ChoiceChips
          name="source"
          label={t("form.source")}
          defaultValue={d.source ?? "manual"}
          options={SOURCES.map((v) => ({ value: v, label: t(`form.sources.${v}`) }))}
        />
        <ToggleRow name="privacyNoticeGiven" defaultChecked={d.privacyNoticeGiven}>
          {t("form.privacyNotice")}
        </ToggleRow>
        <More title={t("form.moreSource")} open={sourceOpen}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="sourceDetail" label={t("form.sourceDetail")}>
              <Input id="sourceDetail" name="sourceDetail" defaultValue={d.sourceDetail} placeholder={t("form.sourceDetailHint")} />
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
          <FormField id="notes" label={t("form.notes")} hint={t("form.notesHint")} error={fe?.notes}>
            <Textarea id="notes" name="notes" rows={3} defaultValue={d.notes} />
          </FormField>
        </More>
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
