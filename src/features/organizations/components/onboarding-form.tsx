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
import { useGlobalT, useT } from "@/i18n/client";
import { translateMarked } from "@/i18n/translate";

type Kind = "agency" | "independent";
type Data = { kind: Kind; name: string; slug: string; currency: string; headline: string; specialties: string[]; regions: string[] };

const STEPS = ["kind", "workspace", "profile", "review"] as const;
const SPECIALTIES = ["software", "data", "product", "design", "sales", "finance", "healthcare", "executive"] as const;
const REGIONS = ["ontario", "quebec", "bc", "alberta", "remoteCanada", "us", "remoteWorld"] as const;

export function OnboardingForm({ firstName }: { firstName?: string }) {
  const t = useT("onboarding");
  const tg = useGlobalT();
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
        setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), [translateMarked(tg, i.message)]])));
        return;
      }
    }
    setErrors({});
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => setStep((s) => Math.max(0, s - 1));
  const isAgency = data.kind === "agency";

  const titles: [string, string][] = [
    [firstName ? t("titles.kindNamed", { name: firstName }) : t("titles.kind"), t("titles.kindDescription")],
    [t("titles.workspace"), t("titles.workspaceDescription")],
    [t("titles.profile"), t("titles.profileDescription")],
    [t("titles.review"), t("titles.reviewDescription")],
  ];

  return (
    <div className="grid gap-7">
      <Stepper step={step} onJump={(i) => i < step && setStep(i)} />

      <div className="grid gap-1.5">
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">{titles[step][0]}</h1>
        <p className="text-[15px] text-muted-foreground">{titles[step][1]}</p>
        <p className="sr-only" aria-live="polite">{t("stepStatus", { current: step + 1, total: STEPS.length, label: t(`steps.${STEPS[step]}`) })}</p>
      </div>

      {step < 3 ? (
        <form onSubmit={next} className="grid gap-6" noValidate>
          {step === 0 ? (
            <div role="radiogroup" aria-label={t("kind.label")} className="grid gap-3 sm:grid-cols-2">
              {([
                { v: "agency", icon: Building2, t: t("kind.agency"), d: t("kind.agencyDescription"), tone: "bg-tile-blue" },
                { v: "independent", icon: UserRound, t: t("kind.independent"), d: t("kind.independentDescription"), tone: "bg-tile-yellow" },
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
              <FormField id="name" label={isAgency ? t("workspace.agencyName") : t("workspace.displayName")} error={errors.name} required>
                <Input
                  id="name"
                  autoFocus
                  value={data.name}
                  placeholder={isAgency ? t("workspace.agencyPlaceholder") : t("workspace.displayPlaceholder")}
                  onChange={(e) => setData((d) => ({ ...d, name: e.target.value, slug: slugTouched ? d.slug : slugify(e.target.value) }))}
                  aria-invalid={!!errors.name}
                />
              </FormField>
              <FormField id="slug" label={t("workspace.url")} error={errors.slug} hint={t("workspace.urlHint")} required>
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
              <FormField id="currency" label={t("workspace.currency")} hint={t("workspace.currencyHint")}>
                <NativeSelect id="currency" value={data.currency} onChange={(e) => set("currency", e.target.value)}>
                  {ONBOARDING_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </NativeSelect>
              </FormField>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-5">
              <FormField id="headline" label={t("profile.headline")} hint={t("profile.headlineHint")}>
                <Input id="headline" autoFocus maxLength={160} value={data.headline} placeholder={t("profile.headlinePlaceholder")} onChange={(e) => set("headline", e.target.value)} />
              </FormField>
              <div className="grid gap-2">
                <label htmlFor="specialties" className="text-sm font-medium">{t("profile.specialties")}</label>
                <TagInput id="specialties" value={data.specialties} onChange={(v) => set("specialties", v)} suggestions={SPECIALTIES.map((k) => t(`suggestions.specialties.${k}`))} placeholder={t("profile.tagPlaceholder")} />
              </div>
              <div className="grid gap-2">
                <label htmlFor="regions" className="text-sm font-medium">{t("profile.regions")}</label>
                <TagInput id="regions" value={data.regions} onChange={(v) => set("regions", v)} suggestions={REGIONS.map((k) => t(`suggestions.regions.${k}`))} placeholder={t("profile.tagPlaceholder")} />
              </div>
            </div>
          ) : null}

          <Nav step={step} onBack={back}>
            {step === 2 ? (
              <Button type="button" variant="ghost" onClick={() => next()}>{t("profile.skip")}</Button>
            ) : null}
            <Button type="submit" size="lg">{tg("common.actions.continue")} <ArrowRight className="size-4" aria-hidden /></Button>
          </Nav>
        </form>
      ) : (
        <ActionForm action={action} className="grid gap-6" noValidate>
          {(["kind", "name", "slug", "currency", "headline"] as const).map((k) => <input key={k} type="hidden" name={k} value={data[k]} />)}
          <input type="hidden" name="specialties" value={data.specialties.join(", ")} />
          <input type="hidden" name="regions" value={data.regions.join(", ")} />

          <div className="grid gap-3">
            <Summary label={t("review.organization")} editLabel={t("review.editOrganization")} onEdit={() => setStep(0)}>{isAgency ? t("review.agency") : t("review.independent")}</Summary>
            <Summary label={t("review.workspace")} editLabel={t("review.editWorkspace")} onEdit={() => setStep(1)}>
              <span className="block font-medium">{data.name}</span>
              <span className="block text-muted-foreground">missionhub.app/w/{data.slug} · {data.currency}</span>
            </Summary>
            <Summary label={t("review.profile")} editLabel={t("review.editProfile")} onEdit={() => setStep(2)}>
              {data.headline || data.specialties.length || data.regions.length ? (
                <>
                  {data.headline ? <span className="block font-medium">{data.headline}</span> : null}
                  <span className="block text-muted-foreground">{[...data.specialties, ...data.regions].join(" · ") || t("review.noTags")}</span>
                </>
              ) : <span className="text-muted-foreground">{t("review.notFilled")}</span>}
            </Summary>
          </div>

          <div className="grid gap-3 rounded-3xl bg-muted/70 p-5">
            <p className="text-sm font-semibold">{t("review.protectionTitle")}</p>
            {[
              { icon: ShieldCheck, t: t("review.protectionPrivate") },
              { icon: EyeOff, t: t("review.protectionAnonymized") },
              { icon: Handshake, t: t("review.protectionConsent") },
            ].map((x) => (
              <p key={x.t} className="flex items-start gap-3 text-sm text-muted-foreground">
                <x.icon className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden /> {x.t}
              </p>
            ))}
          </div>

          {state && !state.ok && !state.fieldErrors?.slug && !state.fieldErrors?.name ? <FormMessage state={state} /> : null}
          <Nav step={step} onBack={back}>
            <SubmitButton size="lg" pendingLabel={t("review.creating")}>{t("review.create")} <ArrowRight className="size-4" aria-hidden /></SubmitButton>
          </Nav>
        </ActionForm>
      )}
    </div>
  );
}

function Stepper({ step, onJump }: { step: number; onJump: (i: number) => void }) {
  const t = useT("onboarding");
  return (
    <nav aria-label={t("progress")}>
      <ol className="flex items-center gap-2">
        {STEPS.map((key, i) => {
          const label = t(`steps.${key}`);
          const done = i < step;
          const current = i === step;
          return (
            <li key={key} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => onJump(i)}
                disabled={!done && !current}
                aria-current={current ? "step" : undefined}
                aria-label={done ? t("stepCompleted", { label }) : current ? t("stepCurrent", { label }) : label}
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
  const tg = useGlobalT();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
      {step > 0 ? (
        <Button type="button" variant="outline" onClick={onBack}><ArrowLeft className="size-4" aria-hidden /> {tg("common.actions.back")}</Button>
      ) : <span />}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Summary({ label, editLabel, onEdit, children }: { label: string; editLabel: string; onEdit: () => void; children: ReactNode }) {
  const tg = useGlobalT();
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-border p-4 text-sm">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
      <Button type="button" variant="ghost" size="sm" onClick={onEdit} aria-label={editLabel}><Pencil className="size-3.5" aria-hidden /> {tg("common.actions.edit")}</Button>
    </div>
  );
}
