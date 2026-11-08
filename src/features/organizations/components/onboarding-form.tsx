"use client";

import { ActionForm } from "@/components/shared/action-form";

import { useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Building2, Check, EyeOff, Handshake, Pencil, ShieldCheck, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/shared/form-field";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormMessage } from "@/components/shared/form-message";
import { NativeSelect } from "@/components/shared/native-select";
import { cn } from "@/lib/utils";
import { createOrganization } from "../actions";
import { ONBOARDING_CURRENCIES, slugify, workspaceStepSchema } from "../schemas";
import { TagInput } from "./tag-input";

type Kind = "agency" | "independent";
type Data = { kind: Kind; name: string; slug: string; currency: string; headline: string; specialties: string[]; regions: string[] };

const STEPS = ["How you work", "Workspace", "Your profile", "Review"] as const;
const SPECIALTIES = ["Software engineering", "Data & AI", "Product", "Design", "Sales", "Finance", "Healthcare", "Executive search"];
const REGIONS = ["Ontario", "Quebec", "British Columbia", "Alberta", "Remote Canada", "United States", "Remote worldwide"];

export function OnboardingForm({ firstName }: { firstName?: string }) {
  const [state, action] = useActionState(createOrganization, null);
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Data>({ kind: "agency", name: "", slug: "", currency: "CAD", headline: "", specialties: [], regions: [] });
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const set = <K extends keyof Data>(k: K, v: Data[K]) => setData((d) => ({ ...d, [k]: v }));

  // Move focus to the new step's heading so keyboard and screen-reader users land in context.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    headingRef.current?.focus();
  }, [step]);

  // A server-side error on the workspace fields (e.g. URL taken) sends the user back to fix it.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state && !state.ok && (state.fieldErrors?.slug || state.fieldErrors?.name)) {
      setErrors(state.fieldErrors);
      setStep(1);
    }
  }

  const next = (e?: FormEvent) => {
    e?.preventDefault();
    if (step === 1) {
      const r = workspaceStepSchema.safeParse(data);
      if (!r.success) {
        setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), [i.message]])));
        return;
      }
    }
    setErrors({});
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => setStep((s) => Math.max(0, s - 1));
  const isAgency = data.kind === "agency";

  const titles: [string, string][] = [
    [`Welcome${firstName ? `, ${firstName}` : ""}! How do you work?`, "This tailors your workspace. You can invite teammates later either way."],
    ["Name your workspace", "Candidates and jobs belong to this workspace and are never visible to other organizations."],
    ["Your recruiter profile", "Partners see this when you collaborate on a referral. It's optional; you can fill it in later."],
    ["Ready to go?", "Check the details below, then create your workspace."],
  ];

  return (
    <div className="grid gap-7">
      <Stepper step={step} onJump={(i) => i < step && setStep(i)} />

      <div className="grid gap-1.5">
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">{titles[step][0]}</h1>
        <p className="text-[15px] text-muted-foreground">{titles[step][1]}</p>
        <p className="sr-only" aria-live="polite">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
      </div>

      {step < 3 ? (
        <form onSubmit={next} className="grid gap-6" noValidate>
          {step === 0 ? (
            <div role="radiogroup" aria-label="Organization type" className="grid gap-3 sm:grid-cols-2">
              {([
                { v: "agency", icon: Building2, t: "Agency", d: "A team of recruiters sharing one candidate inventory.", tone: "bg-tile-blue" },
                { v: "independent", icon: UserRound, t: "Independent", d: "A solo recruiter. Bring in collaborators when you grow.", tone: "bg-tile-yellow" },
              ] as const).map((o) => {
                const checked = data.kind === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    onClick={() => set("kind", o.v)}
                    className={cn(
                      "relative grid gap-4 rounded-3xl border-2 p-5 text-left transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                      checked ? "border-foreground" : "border-border hover:border-foreground/40",
                    )}
                  >
                    <span className={cn("grid size-11 place-items-center rounded-2xl text-foreground", o.tone)} aria-hidden><o.icon className="size-5" /></span>
                    <span>
                      <span className="block font-semibold">{o.t}</span>
                      <span className="mt-1 block text-sm text-muted-foreground">{o.d}</span>
                    </span>
                    {checked ? <span className="absolute top-4 right-4 grid size-6 place-items-center rounded-full bg-foreground text-background" aria-hidden><Check className="size-3.5" /></span> : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-4">
              <FormField id="name" label={isAgency ? "Agency name" : "Business or display name"} error={errors.name} required>
                <Input
                  id="name"
                  autoFocus
                  value={data.name}
                  placeholder={isAgency ? "e.g. Northbound Talent" : "e.g. Sam Rivera Recruiting"}
                  onChange={(e) => setData((d) => ({ ...d, name: e.target.value, slug: slugTouched ? d.slug : slugify(e.target.value) }))}
                  aria-invalid={!!errors.name}
                />
              </FormField>
              <FormField id="slug" label="Workspace URL" error={errors.slug} hint="Lowercase letters, numbers and dashes. You can't change it later." required>
                <div className={cn("flex h-10 items-center overflow-hidden rounded-xl border border-input bg-background focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50", errors.slug && "border-danger")}>
                  <span className="shrink-0 border-r border-input bg-muted px-3 text-sm leading-10 text-muted-foreground">missionhub.app/w/</span>
                  <input
                    id="slug"
                    value={data.slug}
                    onChange={(e) => { setSlugTouched(true); set("slug", slugify(e.target.value)); }}
                    aria-invalid={!!errors.slug}
                    className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
                  />
                </div>
              </FormField>
              <FormField id="currency" label="Default currency" hint="Used for fees and commissions. Each placement can still use its own currency.">
                <NativeSelect id="currency" value={data.currency} onChange={(e) => set("currency", e.target.value)}>
                  {ONBOARDING_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </NativeSelect>
              </FormField>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-5">
              <FormField id="headline" label="Headline" hint="One line partners will recognize you by.">
                <Input id="headline" autoFocus maxLength={160} value={data.headline} placeholder="e.g. Tech recruiter for Canadian scale-ups" onChange={(e) => set("headline", e.target.value)} />
              </FormField>
              <div className="grid gap-2">
                <label htmlFor="specialties" className="text-sm font-medium">Specialties</label>
                <TagInput id="specialties" value={data.specialties} onChange={(v) => set("specialties", v)} suggestions={SPECIALTIES} placeholder="Type and press Enter" />
              </div>
              <div className="grid gap-2">
                <label htmlFor="regions" className="text-sm font-medium">Regions you recruit in</label>
                <TagInput id="regions" value={data.regions} onChange={(v) => set("regions", v)} suggestions={REGIONS} placeholder="Type and press Enter" />
              </div>
            </div>
          ) : null}

          <Nav step={step} onBack={back}>
            {step === 2 ? (
              <Button type="button" variant="ghost" onClick={() => next()}>Skip for now</Button>
            ) : null}
            <Button type="submit" size="lg">Continue <ArrowRight className="size-4" aria-hidden /></Button>
          </Nav>
        </form>
      ) : (
        <ActionForm action={action} className="grid gap-6" noValidate>
          {(["kind", "name", "slug", "currency", "headline"] as const).map((k) => <input key={k} type="hidden" name={k} value={data[k]} />)}
          <input type="hidden" name="specialties" value={data.specialties.join(", ")} />
          <input type="hidden" name="regions" value={data.regions.join(", ")} />

          <div className="grid gap-3">
            <Summary label="Organization" onEdit={() => setStep(0)}>{isAgency ? "Agency" : "Independent recruiter"}</Summary>
            <Summary label="Workspace" onEdit={() => setStep(1)}>
              <span className="block font-medium">{data.name}</span>
              <span className="block text-muted-foreground">missionhub.app/w/{data.slug} · {data.currency}</span>
            </Summary>
            <Summary label="Profile" onEdit={() => setStep(2)}>
              {data.headline || data.specialties.length || data.regions.length ? (
                <>
                  {data.headline ? <span className="block font-medium">{data.headline}</span> : null}
                  <span className="block text-muted-foreground">{[...data.specialties, ...data.regions].join(" · ") || "No specialties or regions yet"}</span>
                </>
              ) : <span className="text-muted-foreground">Not filled in yet</span>}
            </Summary>
          </div>

          <div className="grid gap-3 rounded-3xl bg-muted/70 p-5">
            <p className="text-sm font-semibold">How your data is protected</p>
            {[
              { icon: ShieldCheck, t: "Your candidates and jobs stay private to this workspace." },
              { icon: EyeOff, t: "Partners never browse your inventory. They see anonymized match counts only." },
              { icon: Handshake, t: "You choose exactly what to share, per referral, with the candidate's authorization." },
            ].map((x) => (
              <p key={x.t} className="flex items-start gap-3 text-sm text-muted-foreground">
                <x.icon className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden /> {x.t}
              </p>
            ))}
          </div>

          {state && !state.ok && !state.fieldErrors?.slug && !state.fieldErrors?.name ? <FormMessage state={state} /> : null}
          <Nav step={step} onBack={back}>
            <SubmitButton size="lg" pendingLabel="Creating workspace…">Create workspace <ArrowRight className="size-4" aria-hidden /></SubmitButton>
          </Nav>
        </ActionForm>
      )}
    </div>
  );
}

function Stepper({ step, onJump }: { step: number; onJump: (i: number) => void }) {
  return (
    <nav aria-label="Onboarding progress">
      <ol className="flex items-center gap-2">
        {STEPS.map((label, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <li key={label} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => onJump(i)}
                disabled={!done && !current}
                aria-current={current ? "step" : undefined}
                aria-label={`${label}${done ? " (completed, go back)" : current ? " (current)" : ""}`}
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors",
                  done && "bg-foreground text-background hover:opacity-80",
                  current && "cursor-default bg-foreground text-background ring-4 ring-foreground/15",
                  !done && !current && "bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="size-4" aria-hidden /> : i + 1}
              </button>
              <span className={cn("hidden text-xs font-medium whitespace-nowrap sm:inline", current ? "text-foreground" : "text-muted-foreground")}>{label}</span>
              {i < STEPS.length - 1 ? <span className={cn("h-0.5 min-w-3 flex-1 rounded-full", done ? "bg-foreground" : "bg-border")} aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Nav({ step, onBack, children }: { step: number; onBack: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
      {step > 0 ? (
        <Button type="button" variant="outline" onClick={onBack}><ArrowLeft className="size-4" aria-hidden /> Back</Button>
      ) : <span />}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Summary({ label, onEdit, children }: { label: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-border p-4 text-sm">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
      <Button type="button" variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${label.toLowerCase()}`}><Pencil className="size-3.5" aria-hidden /> Edit</Button>
    </div>
  );
}
