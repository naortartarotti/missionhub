"use client";

import { SUPPORTED_CURRENCIES } from "@/lib/money/currency";
import { ActionForm } from "@/components/shared/action-form";

import { useActionState, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  BadgeCheck, Building2, Check, ChevronDown, CircleSlash, Ellipsis, FileText, Globe, Handshake, House, Laptop, Link2, Mail, Map, MapPin,
  Minus, PencilLine, Phone, Plane, PlaneTakeoff, Plus, Sheet, ShieldCheck, Shuffle, Sparkles, UserRound, type LucideIcon,
} from "lucide-react";
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
import { TONE, type Tone } from "@/components/shared/tones";
import { useGlobalT, useT } from "@/i18n/client";

const SOURCES = ["manual", "resume_upload", "csv_import", "referral", "other"] as const;
const CURRENCIES = SUPPORTED_CURRENCIES;
const LANGUAGE_SUGGESTIONS = ["english", "french", "portuguese", "spanish"];
const TRAVEL = ["none", "occasional", "frequent"] as const;
const RELOCATION = ["none", "region", "country", "international"] as const;

const ARRANGEMENT_ICON: Record<keyof typeof ARRANGEMENT, LucideIcon> = { remote: Laptop, hybrid: Shuffle, onsite: Building2 };
const TRAVEL_ICON: Record<(typeof TRAVEL)[number], LucideIcon> = { none: House, occasional: Plane, frequent: PlaneTakeoff };
const RELOCATION_ICON: Record<(typeof RELOCATION)[number], LucideIcon> = { none: House, region: MapPin, country: Map, international: Globe };
const SOURCE_ICON: Record<(typeof SOURCES)[number], LucideIcon> = { manual: PencilLine, resume_upload: FileText, csv_import: Sheet, referral: Handshake, other: Ellipsis };

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

const CHIP_BASE =
  "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.97]";
const chip = (active: boolean, tone: Tone) => cn(CHIP_BASE, active ? TONE[tone].selected : TONE[tone].idle);

type Option = { value: string; label: string; icon?: LucideIcon };

function ChipContent({ o, active }: { o: Option; active: boolean }) {
  const Icon = active ? Check : o.icon;
  return (
    <>
      {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
      {o.label}
    </>
  );
}

/** Coloured icon badge + title + one-line explanation that opens each panel. */
function SectionHeader({ icon: Icon, tone, title, body }: { icon: LucideIcon; tone: Tone; title: string; body?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", TONE[tone].badge)}>
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {body ? <p className="mt-0.5 text-sm text-muted-foreground">{body}</p> : null}
      </div>
    </div>
  );
}

/** Input with a leading icon; the icon carries the meaning, so the label is announced but not shown. */
function IconInput({ icon: Icon, label, error, hint, ...props }: { icon: LucideIcon; label: string; error?: string | string[]; hint?: string } & React.ComponentProps<typeof Input>) {
  const msg = Array.isArray(error) ? error[0] : error;
  return (
    <div className="grid content-start gap-1">
      <div className="relative">
        <Icon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input {...props} aria-label={label} placeholder={props.placeholder ?? label} aria-invalid={msg ? true : undefined} className="pl-9" />
      </div>
      {msg ? <p role="alert" className="text-xs font-medium text-danger">{msg}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Single-choice pills backed by a hidden input. Clicking the active pill clears it when `clearable`. */
function ChoiceChips({
  name,
  label,
  options,
  defaultValue,
  clearable,
  tone = "neutral",
  onValueChange,
}: {
  name: string;
  label: string;
  options: Option[];
  defaultValue?: string;
  clearable?: boolean;
  tone?: Tone;
  onValueChange?: (v: string) => void;
}) {
  const [value, setValueState] = useState(defaultValue ?? "");
  const setValue = (v: string) => {
    setValueState(v);
    onValueChange?.(v);
  };
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
            className={chip(value === o.value, tone)}
          >
            <ChipContent o={o} active={value === o.value} />
          </button>
        ))}
      </div>
      <input type="hidden" name={name} value={value} />
    </fieldset>
  );
}

/** Multi-choice pills: real checkboxes, so the form posts repeated values. */
function ToggleChips({ name, label, options, defaultValue = [], tone = "neutral" }: { name: string; label: string; options: Option[]; defaultValue?: string[]; tone?: Tone }) {
  const [on, setOn] = useState<string[]>(defaultValue);
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input
              type="checkbox"
              name={name}
              value={o.value}
              checked={on.includes(o.value)}
              onChange={(e) => setOn((xs) => (e.target.checked ? [...xs, o.value] : xs.filter((x) => x !== o.value)))}
              className="peer sr-only"
            />
            <span className={cn(chip(on.includes(o.value), tone), "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50")}>
              <ChipContent o={o} active={on.includes(o.value)} />
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ChipList({ id, name, label, hint, error, placeholder, defaultValue, suggestions, tone }: { id: string; name: string; label: string; hint?: string; error?: string | string[]; placeholder: string; defaultValue?: string; suggestions?: string[]; tone?: Tone }) {
  const [items, setItems] = useState(() => splitList(defaultValue));
  return (
    <FormField id={id} label={label} hint={hint} error={error}>
      <TagInput id={id} value={items} onChange={setItems} placeholder={placeholder} suggestions={suggestions} max={60} tone={tone} describedBy={hint ? `${id}-hint` : undefined} />
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
  const [on, setOn] = useState(Boolean(defaultChecked));
  return (
    <Label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-2xl border p-3.5 font-normal transition-colors",
        on ? "border-success/40 bg-success-soft" : "border-border hover:border-foreground/30",
      )}
    >
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg transition-colors", on ? "bg-success text-background" : "bg-muted text-muted-foreground")}>
        <ShieldCheck className="size-4" aria-hidden />
      </span>
      <span className="flex-1 text-sm">{children}</span>
      <Checkbox name={name} checked={on} onCheckedChange={(v) => setOn(v === true)} />
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

  const [name, setName] = useState(d.fullName ?? "");
  const [relocation, setRelocation] = useState(d.relocationScope ?? "");
  const [passport, setPassport] = useState(d.hasPassport ?? "");
  // Follow-up questions only appear when they apply; existing data keeps them visible on edit.
  const showDestinations = relocation === "international" || (!relocation && Boolean(d.relocationDestinations));
  const showPassportCountries = passport === "yes" || (!passport && Boolean(d.passportCountries));

  return (
    <ActionForm action={formAction} className="grid gap-5" noValidate>
      <Panel className="grid gap-6 p-6">
        <SectionHeader icon={UserRound} tone="orange" title={t("form.identityTitle")} body={t("form.identityBody")} />
        <div className="flex items-center gap-4">
          <span
            className={cn(
              "grid size-16 shrink-0 place-items-center rounded-2xl text-xl font-semibold transition-colors",
              name.trim() ? "bg-tile-yellow text-tile-foreground" : "bg-muted text-muted-foreground",
            )}
            aria-hidden
          >
            {name.trim() ? initials(name) : <UserRound className="size-7" />}
          </span>
          <div className="grid flex-1 gap-2">
            <FormField id="fullName" label={t("form.fullName")} error={fe?.fullName} required>
              <Input id="fullName" name="fullName" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" className="h-11 text-base font-medium" />
            </FormField>
          </div>
        </div>
        <FormField id="headline" label={t("form.headline")} error={fe?.headline}>
          <Input id="headline" name="headline" defaultValue={d.headline} placeholder={t("form.headlineHint")} />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <IconInput icon={Mail} id="email" name="email" type="email" label={t("form.email")} defaultValue={d.email} autoComplete="off" error={fe?.email} />
          <IconInput icon={Phone} id="phone" name="phone" type="tel" label={t("form.phone")} defaultValue={d.phone} autoComplete="off" error={fe?.phone} />
          <IconInput icon={Link2} id="linkedinUrl" name="linkedinUrl" type="url" inputMode="url" label={t("form.linkedin")} placeholder={`${t("form.linkedin")} · linkedin.com/in/…`} defaultValue={d.linkedinUrl} autoComplete="off" error={fe?.linkedinUrl} />
          <IconInput icon={MapPin} id="postalCode" name="postalCode" label={t("form.postalCode")} hint={t("form.postalCodeHint")} defaultValue={d.postalCode} autoComplete="off" error={fe?.postalCode} />
        </div>
      </Panel>

      <Panel className="grid gap-6 p-6">
        <SectionHeader icon={Sparkles} tone="blue" title={t("form.matchingTitle")} body={t("form.matchingBody")} />

        <ChipList id="skills" name="skills" label={t("form.skills")} error={fe?.skills} placeholder={t("form.skillsPlaceholder")} defaultValue={d.skills} tone="blue" />

        <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto]">
          <ChoiceChips
            name="seniority"
            label={t("form.seniority")}
            clearable
            tone="violet"
            defaultValue={d.seniority}
            options={(Object.keys(SENIORITY) as (keyof typeof SENIORITY)[]).map((v) => ({ value: v, label: tg(`labels.seniority.${v}`) }))}
          />
          <YearsStepper defaultValue={d.yearsExperience} error={fe?.yearsExperience} label={t("form.yearsExperience")} t={t} />
        </div>
        {fe?.seniority ? <p role="alert" className="-mt-4 text-xs font-medium text-danger">{fe.seniority}</p> : null}

        <ChipList id="languages" name="languages" label={t("form.languages")} error={fe?.languages} placeholder={t("form.languagesPlaceholder")} defaultValue={d.languages} suggestions={LANGUAGE_SUGGESTIONS} tone="green" />

        <ToggleChips
          name="workArrangements"
          label={t("form.arrangements")}
          tone="orange"
          defaultValue={d.workArrangements}
          options={(Object.keys(ARRANGEMENT) as (keyof typeof ARRANGEMENT)[]).map((v) => ({ value: v, label: tg(`labels.arrangement.${v}`), icon: ARRANGEMENT_ICON[v] }))}
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
        <SectionHeader icon={Globe} tone="green" title={t("form.mobilityTitle")} body={t("form.mobilityBody")} />
        <ChoiceChips
          name="travelAvailability"
          label={t("form.travel")}
          clearable
          tone="blue"
          defaultValue={d.travelAvailability}
          options={TRAVEL.map((v) => ({ value: v, label: t(`mobility.travel.${v}`), icon: TRAVEL_ICON[v] }))}
        />
        <div className="grid gap-4">
          <ChoiceChips
            name="relocationScope"
            label={t("form.relocation")}
            clearable
            tone="green"
            defaultValue={d.relocationScope}
            onValueChange={setRelocation}
            options={RELOCATION.map((v) => ({ value: v, label: t(`mobility.relocation.${v}`), icon: RELOCATION_ICON[v] }))}
          />
          {showDestinations ? (
            <div className="border-l-2 border-success/30 pl-4">
              <CountryMultiSelect id="relocationDestinations" name="relocationDestinations" label={t("form.destinations")} hint={t("form.destinationsHint")} error={fe?.relocationDestinations} defaultValue={splitList(d.relocationDestinations)} tone="green" />
            </div>
          ) : null}
        </div>
        <div className="grid gap-4 border-t border-border/60 pt-6">
          <ChoiceChips
            name="hasPassport"
            label={t("form.passport")}
            clearable
            tone="violet"
            defaultValue={d.hasPassport}
            onValueChange={setPassport}
            options={[
              { value: "yes", label: t("mobility.passport.yes"), icon: BadgeCheck },
              { value: "no", label: t("mobility.passport.no"), icon: CircleSlash },
            ]}
          />
          {showPassportCountries ? (
            <div className="border-l-2 border-violet/30 pl-4">
              <CountryMultiSelect id="passportCountries" name="passportCountries" label={t("form.passportCountries")} hint={t("form.passportCountriesHint")} error={fe?.passportCountries} defaultValue={splitList(d.passportCountries)} max={10} tone="violet" />
            </div>
          ) : null}
        </div>
        <CountryMultiSelect id="workAuthorization" name="workAuthorization" label={t("form.workAuthorization")} hint={t("form.workAuthorizationHint")} error={fe?.workAuthorization} defaultValue={splitList(d.workAuthorization)} tone="blue" />
      </Panel>

      <Panel className="grid gap-5 p-6">
        <SectionHeader icon={ShieldCheck} tone="violet" title={t("form.sourceTitle")} />
        <ChoiceChips
          name="source"
          label={t("form.source")}
          tone="violet"
          defaultValue={d.source ?? "manual"}
          options={SOURCES.map((v) => ({ value: v, label: t(`form.sources.${v}`), icon: SOURCE_ICON[v] }))}
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
