"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormMessage } from "@/components/shared/form-message";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { createOrganization } from "../actions";
import { slugify } from "../schemas";

export function OnboardingForm() {
  const [state, action] = useActionState(createOrganization, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  return (
    <form action={action} className="grid gap-6" noValidate>
      <fieldset className="grid gap-4">
        <legend className="mb-1 text-sm font-semibold">Your organization</legend>
        <RadioGroup name="kind" defaultValue="agency" className="grid grid-cols-2 gap-3">
          {[
            { v: "agency", t: "Agency", d: "A team of recruiters" },
            { v: "independent", t: "Independent", d: "Just me, for now" },
          ].map((o) => (
            <Label
              key={o.v}
              htmlFor={`kind-${o.v}`}
              className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-4 has-[[data-state=checked]]:border-foreground"
            >
              <RadioGroupItem id={`kind-${o.v}`} value={o.v} className="mt-0.5" />
              <span>
                <span className="block font-medium">{o.t}</span>
                <span className="block text-xs font-normal text-muted-foreground">{o.d}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
        <FormField id="name" label="Organization name" error={fe?.name} required>
          <Input
            id="name"
            name="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
            required
          />
        </FormField>
        <FormField id="slug" label="Workspace URL" error={fe?.slug} hint={`missionhub.app/w/${slug || "your-agency"}`} required>
          <Input
            id="slug"
            name="slug"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            required
          />
        </FormField>
      </fieldset>
      <fieldset className="grid gap-4">
        <legend className="mb-1 text-sm font-semibold">Your recruiter profile</legend>
        <FormField id="headline" label="Headline" hint="e.g. Tech recruiter for Canadian scale-ups">
          <Input id="headline" name="headline" />
        </FormField>
        <FormField id="specialties" label="Specialties" hint="Comma-separated, e.g. Software, Data, Product">
          <Input id="specialties" name="specialties" />
        </FormField>
        <FormField id="regions" label="Regions" hint="Comma-separated, e.g. Ontario, Quebec, Remote Canada">
          <Input id="regions" name="regions" />
        </FormField>
      </fieldset>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full" pendingLabel="Creating workspace…">
        Create workspace
      </SubmitButton>
    </form>
  );
}
