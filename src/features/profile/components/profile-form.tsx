"use client";

import { useActionState, useState } from "react";
import { ActionForm } from "@/components/shared/action-form";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { FormMessage } from "@/components/shared/form-message";
import { SubmitButton } from "@/components/shared/submit-button";
import { TagInput } from "@/features/organizations/components/tag-input";
import { REGIONS, SPECIALTIES } from "@/features/organizations/components/onboarding-form";
import { useGlobalT, useT } from "@/i18n/client";
import { updateProfile } from "../actions";

type Profile = { fullName: string; email: string; headline: string; specialties: string[]; regions: string[] };

export function ProfileForm({ profile }: { profile: Profile }) {
  const t = useT("profile");
  const to = useT("onboarding");
  const tg = useGlobalT();
  const [state, action] = useActionState(updateProfile, null);
  const [specialties, setSpecialties] = useState(profile.specialties);
  const [regions, setRegions] = useState(profile.regions);
  const fe = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <ActionForm action={action} className="grid max-w-xl gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="fullName" label={t("fields.fullName")} error={fe?.fullName} required>
          <Input id="fullName" name="fullName" defaultValue={profile.fullName} maxLength={120} autoComplete="name" aria-invalid={!!fe?.fullName} />
        </FormField>
        <FormField id="email" label={t("fields.email")} hint={t("fields.emailHint")}>
          <Input id="email" value={profile.email} readOnly disabled aria-describedby="email-hint" />
        </FormField>
      </div>
      <FormField id="headline" label={t("fields.headline")} hint={to("profile.headlineHint")} error={fe?.headline}>
        <Input id="headline" name="headline" defaultValue={profile.headline} maxLength={160} placeholder={to("profile.headlinePlaceholder")} />
      </FormField>
      <div className="grid gap-2">
        <label htmlFor="specialties" className="text-sm font-medium">{to("profile.specialties")}</label>
        <TagInput id="specialties" value={specialties} onChange={setSpecialties} suggestions={SPECIALTIES.map((k) => to(`suggestions.specialties.${k}`))} placeholder={to("profile.tagPlaceholder")} />
        <input type="hidden" name="specialties" value={specialties.join(", ")} />
      </div>
      <div className="grid gap-2">
        <label htmlFor="regions" className="text-sm font-medium">{to("profile.regions")}</label>
        <TagInput id="regions" value={regions} onChange={setRegions} suggestions={REGIONS.map((k) => to(`suggestions.regions.${k}`))} placeholder={to("profile.tagPlaceholder")} />
        <input type="hidden" name="regions" value={regions.join(", ")} />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="justify-self-start">{tg("common.actions.save")}</SubmitButton>
    </ActionForm>
  );
}
