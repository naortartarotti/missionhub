"use client";

import { useActionState, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { ActionForm } from "@/components/shared/action-form";
import { Panel } from "@/components/shared/card";
import { FormField } from "@/components/shared/form-field";
import { FormMessage } from "@/components/shared/form-message";
import { SubmitButton } from "@/components/shared/submit-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CountryMultiSelect } from "@/components/shared/country-multi-select";
import { cn } from "@/lib/utils";
import { useGlobalT, useT } from "@/i18n/client";
import { confirmCandidateRequest, declineCandidateRequest } from "../candidate-actions";

/** The candidate's own data as shown on their page (salary already in major units). */
export type CandidateProfile = {
  fullName: string;
  email: string;
  phone: string;
  headline: string;
  summary: string;
  locationCity: string;
  locationRegion: string;
  locationCountry: string;
  travelAvailability: string;
  relocationScope: string;
  relocationDestinations: string[];
  workAuthorization: string[];
  hasPassport: string;
  workArrangements: string[];
  skills: string;
  languages: string;
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  availableFrom: string;
};

const ARRANGEMENTS = ["remote", "hybrid", "onsite"] as const;
const TRAVEL = ["none", "occasional", "frequent"] as const;
const RELOCATION = ["none", "region", "country", "international"] as const;

const pill = cn(
  "inline-flex items-center rounded-full border border-border px-3.5 py-1.5 text-sm font-medium transition-colors",
  "peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
);

/** Single choice as pills (native radios, so it posts with the form and works with the keyboard). */
function RadioPills({ name, legend, value, options }: { name: string; legend: string; value: string; options: { value: string; label: string }[] }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input type="radio" name={name} value={o.value} defaultChecked={value === o.value} className="peer sr-only" />
            <span className={pill}>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CandidateResponseForm({ token, profile: p, org, partner, job }: { token: string; profile: CandidateProfile; org: string; partner: string; job: string }) {
  const t = useT("candidate");
  const tg = useGlobalT();
  const [state, action] = useActionState(confirmCandidateRequest.bind(null, token), null);
  const [declineState, declineAction] = useActionState(declineCandidateRequest.bind(null, token), null);
  const [declining, setDeclining] = useState(false);
  const fe = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <>
      <ActionForm action={action} className="grid gap-6">
        <Panel className="grid gap-5 p-6 sm:p-8">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t("profile.heading")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("profile.body", { org })}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="fullName" label={t("profile.fullName")} error={fe?.fullName} required>
              <Input id="fullName" name="fullName" defaultValue={p.fullName} autoComplete="name" required maxLength={160} />
            </FormField>
            <FormField id="email" label={t("profile.email")} hint={t("profile.emailHint", { org })}>
              <Input id="email" value={p.email} readOnly disabled />
            </FormField>
            <FormField id="phone" label={t("profile.phone")} error={fe?.phone}>
              <Input id="phone" name="phone" type="tel" defaultValue={p.phone} autoComplete="tel" maxLength={40} />
            </FormField>
            <FormField id="availableFrom" label={t("profile.availableFrom")} error={fe?.availableFrom}>
              <Input id="availableFrom" name="availableFrom" type="date" defaultValue={p.availableFrom} />
            </FormField>
          </div>

          <FormField id="headline" label={t("profile.headline")} error={fe?.headline}>
            <Input id="headline" name="headline" defaultValue={p.headline} maxLength={200} />
          </FormField>
          <FormField id="summary" label={t("profile.summary")} error={fe?.summary}>
            <Textarea id="summary" name="summary" defaultValue={p.summary} rows={5} maxLength={5000} />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField id="locationCity" label={t("profile.city")} error={fe?.locationCity}>
              <Input id="locationCity" name="locationCity" defaultValue={p.locationCity} autoComplete="address-level2" maxLength={100} />
            </FormField>
            <FormField id="locationRegion" label={t("profile.region")} error={fe?.locationRegion}>
              <Input id="locationRegion" name="locationRegion" defaultValue={p.locationRegion} autoComplete="address-level1" maxLength={100} />
            </FormField>
            <FormField id="locationCountry" label={t("profile.country")} error={fe?.locationCountry}>
              <Input id="locationCountry" name="locationCountry" defaultValue={p.locationCountry} maxLength={2} className="uppercase" />
            </FormField>
          </div>


          <fieldset>
            <legend className="mb-2 text-sm font-medium">{t("profile.workArrangements")}</legend>
            <div className="flex flex-wrap gap-2">
              {ARRANGEMENTS.map((a) => (
                <label key={a} className="cursor-pointer">
                  <input type="checkbox" name="workArrangements" value={a} defaultChecked={p.workArrangements.includes(a)} className="peer sr-only" />
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border border-border px-3.5 py-1.5 text-sm font-medium transition-colors",
                      "peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
                    )}
                  >
                    {tg(`labels.arrangement.${a}`)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <FormField id="skills" label={t("profile.skills")} hint={t("profile.skillsHint")} error={fe?.skills}>
            <Textarea id="skills" name="skills" defaultValue={p.skills} rows={2} />
          </FormField>
          <FormField id="languages" label={t("profile.languages")} hint={t("profile.skillsHint")} error={fe?.languages}>
            <Input id="languages" name="languages" defaultValue={p.languages} />
          </FormField>

          <div className="grid gap-5 rounded-2xl border border-border/60 p-4 sm:p-5">
            <div>
              <h3 className="text-sm font-semibold">{tg("candidates.detail.mobilityTitle")}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("profile.mobilityHint", { org })}</p>
            </div>
            <RadioPills name="travelAvailability" legend={tg("candidates.form.travel")} value={p.travelAvailability} options={TRAVEL.map((v) => ({ value: v, label: tg(`candidates.mobility.travel.${v}`) }))} />
            <RadioPills name="relocationScope" legend={tg("candidates.form.relocation")} value={p.relocationScope} options={RELOCATION.map((v) => ({ value: v, label: tg(`candidates.mobility.relocation.${v}`) }))} />
            <CountryMultiSelect id="relocationDestinations" name="relocationDestinations" label={tg("candidates.form.destinations")} error={fe?.relocationDestinations} defaultValue={p.relocationDestinations} />
            <CountryMultiSelect id="workAuthorization" name="workAuthorization" label={tg("candidates.form.workAuthorization")} hint={tg("candidates.form.workAuthorizationHint")} error={fe?.workAuthorization} defaultValue={p.workAuthorization} />
            <RadioPills name="hasPassport" legend={tg("candidates.form.passport")} value={p.hasPassport} options={[{ value: "yes", label: tg("candidates.mobility.passport.yes") }, { value: "no", label: tg("candidates.mobility.passport.no") }]} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField id="salaryMin" label={t("profile.salaryMin")} error={fe?.salaryMin}>
              <Input id="salaryMin" name="salaryMin" inputMode="decimal" defaultValue={p.salaryMin} />
            </FormField>
            <FormField id="salaryMax" label={t("profile.salaryMax")} error={fe?.salaryMax}>
              <Input id="salaryMax" name="salaryMax" inputMode="decimal" defaultValue={p.salaryMax} />
            </FormField>
            <FormField id="salaryCurrency" label={t("profile.currency")} error={fe?.salaryCurrency}>
              <Input id="salaryCurrency" name="salaryCurrency" defaultValue={p.salaryCurrency} maxLength={3} className="uppercase" placeholder="CAD" />
            </FormField>
          </div>
        </Panel>

        <Panel className="grid gap-4 p-6 sm:p-8">
          <Label className="flex items-start gap-2.5 rounded-2xl bg-muted/50 p-4 leading-5 font-normal">
            <Checkbox name="consent" className="mt-0.5" />
            <span className="text-sm">{t("consent", { org, partner, job })}</span>
          </Label>
          {fe?.consent ? <p role="alert" className="text-xs font-medium text-danger">{fe.consent[0]}</p> : null}
          <FormMessage state={state} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => setDeclining(true)}>
              {t("decline")}
            </Button>
            <SubmitButton size="lg" pendingLabel={t("confirming")}>
              <ShieldCheck className="size-4" aria-hidden /> {t("confirm")}
            </SubmitButton>
          </div>
        </Panel>
      </ActionForm>

      <Dialog open={declining} onOpenChange={setDeclining}>
        <DialogContent>
          <ActionForm action={declineAction} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{t("declineTitle")}</DialogTitle>
              <DialogDescription>{t("declineBody", { org, partner })}</DialogDescription>
            </DialogHeader>
            <FormField id="reason" label={t("declineReason")}>
              <Textarea id="reason" name="reason" rows={3} maxLength={1000} />
            </FormField>
            <FormMessage state={declineState} />
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setDeclining(false)}>
                {t("cancel")}
              </Button>
              <SubmitButton variant="destructive" pendingLabel={t("declining")}>
                {t("declineConfirm")}
              </SubmitButton>
            </DialogFooter>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}
