"use client";

import { ActionForm } from "@/components/shared/action-form";

import Link from "next/link";
import { useActionState, useMemo, useState, type ReactNode } from "react";
import {
  Briefcase,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Eye,
  EyeOff,
  FileText,
  Globe,
  Laptop,
  Lock,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  TrendingUp,
  Wallet,
  type LucideIcon,
  Plane,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/shared/card";
import { FormField } from "@/components/shared/form-field";
import { FormMessage } from "@/components/shared/form-message";
import { SubmitButton } from "@/components/shared/submit-button";
import { NativeSelect } from "@/components/shared/native-select";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { SkillChips } from "@/components/shared/skill-chips";
import { StatusPill, type Tone } from "@/components/shared/status-pill";
import { ScoreRing } from "@/features/matching/components/score-ring";
import { LEGAL_BASIS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { useFormatter, useGlobalT, useT } from "@/i18n/client";
import { DISCLOSURE_FIELDS, type DisclosureKey } from "../disclosure";
import { submitReferral } from "../actions";

/** The sourcing recruiter's own view of the candidate, pre-formatted on the server. */
export type ComposerCandidate = {
  id: string;
  name: string;
  headline: string | null;
  summary: string | null;
  location: string | null;
  seniority: string | null;
  available: string | null;
  salary: string | null;
  skills: string[];
  languages: string[];
  arrangements: string[];
  email: string | null;
  phone: string | null;
  /** Readable mobility lines (travel, relocation, work authorization, passport yes/no). */
  mobility: string[];
  experience: { title: string; company: string | null; period: string }[];
};

/** The partner's job and why the candidate matches it. */
export type ComposerJob = {
  title: string;
  client: string;
  org: string;
  facts: { icon: "location" | "arrangement" | "contract" | "salary" | "seniority"; label: string }[];
  requiredSkills: string[];
  score: number;
  band: { label: string; tone: Tone };
  reasons: string[];
  gaps: string[];
};

const FACT_ICON: Record<ComposerJob["facts"][number]["icon"], LucideIcon> = {
  location: MapPin,
  arrangement: Laptop,
  contract: Briefcase,
  salary: Wallet,
  seniority: TrendingUp,
};

const IDENTIFYING = new Set<string>(DISCLOSURE_FIELDS.filter((f) => f.identifying).map((f) => f.key));
const norm = (s: string) => s.trim().toLowerCase();

export function SubmitReferralForm({
  orgSlug,
  matchId,
  recipient,
  jobTitle,
  candidate: c,
  job,
  consents,
  documents,
}: {
  orgSlug: string;
  matchId: string;
  recipient: string;
  jobTitle: string;
  candidate: ComposerCandidate;
  job: ComposerJob;
  consents: { id: string; evidence: string; obtained_at: string; expires_at: string | null }[];
  documents: { id: string; name: string; ready: boolean }[];
}) {
  const t = useT("referrals");
  const tg = useGlobalT();
  const fmt = useFormatter();
  const [state, action] = useActionState(submitReferral.bind(null, orgSlug), null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const [selected, setSelected] = useState<Set<DisclosureKey>>(() => new Set(DISCLOSURE_FIELDS.filter((f) => f.default).map((f) => f.key)));
  const [docs, setDocs] = useState<string[]>([]);
  const [consentId, setConsentId] = useState(consents[0]?.id ?? "new");
  // Default: the candidate confirms by email (needs an address); the recorded path stays available.
  const [authMethod, setAuthMethod] = useState<"candidate_email" | "recorded">(c.email ? "candidate_email" : "recorded");
  const [preview, setPreview] = useState(false);

  const on = (k: DisclosureKey) => selected.has(k);
  const flip = (k: DisclosureKey) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const label = (k: DisclosureKey) => t(`disclosure.${k}`);
  const identifying = DISCLOSURE_FIELDS.filter((f) => f.identifying && selected.has(f.key));

  // In the partner preview, hidden content disappears instead of being dimmed.
  const show = (k: DisclosureKey) => !preview || on(k);

  const have = new Set(c.skills.map(norm));
  const required = new Set(job.requiredSkills.map(norm));
  const matched = c.skills.filter((s) => required.has(norm(s)));
  const missing = job.requiredSkills.filter((s) => !have.has(norm(s)));
  const ordered = [...matched, ...missing, ...c.skills.filter((s) => !required.has(norm(s)))];

  const toggle = (k: DisclosureKey) => (preview ? null : <ShareToggle on={on(k)} identifying={IDENTIFYING.has(k)} field={label(k)} onClick={() => flip(k)} />);

  return (
    <ActionForm action={action} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {[...selected].map((k) => <input key={k} type="hidden" name="fields" value={k} />)}

      {/* ------------------------------------------------------------------ Candidate profile */}
      <div className="grid min-w-0 gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="radiogroup" aria-label={t("composer.viewOwn")} className="inline-flex rounded-full border border-border/60 bg-card p-1 text-sm">
            {[false, true].map((p) => (
              <button
                key={String(p)}
                type="button"
                role="radio"
                aria-checked={preview === p}
                onClick={() => setPreview(p)}
                className={cn("inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium transition-colors", preview === p ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
              >
                {p ? <Eye className="size-4" aria-hidden /> : null}
                {p ? t("composer.viewPartner", { partner: recipient }) : t("composer.viewOwn")}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground tabular-nums">{t("composer.sharingCount", { count: selected.size, total: DISCLOSURE_FIELDS.length })}</p>
        </div>
        {fe?.fields ? <p role="alert" className="text-xs font-medium text-danger">{fe.fields[0]}</p> : null}

        {/* Intro card: cover, avatar, name, headline, key facts */}
        <Panel className="overflow-hidden p-0">
          <div className="h-24 bg-gradient-to-r from-tile-blue via-tile-lilac to-tile-yellow sm:h-28" aria-hidden />
          <div className="px-6 pb-6">
            <div className="-mt-12 flex items-end justify-between gap-3">
              {show("full_name") ? (
                <InitialsAvatar name={c.name} className="size-24 text-2xl ring-4 ring-card" />
              ) : (
                <span className="grid size-24 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground ring-4 ring-card" aria-hidden>
                  <Lock className="size-7" />
                </span>
              )}
              {!preview ? (
                <Link href={`/workspace/${orgSlug}/candidates/${c.id}`} className="mb-1 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  {t("composer.openProfile")}
                </Link>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className={cn("text-2xl font-semibold tracking-tight", !show("full_name") && "text-muted-foreground", !preview && !on("full_name") && "opacity-50")}>
                {show("full_name") ? c.name : t("composer.anonymous")}
              </h2>
              {toggle("full_name")}
            </div>

            {c.headline && show("headline") ? (
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className={cn("text-[15px] text-pretty", !on("headline") && "opacity-50")}>{c.headline}</p>
                {toggle("headline")}
              </div>
            ) : null}

            <ul className="mt-4 flex flex-wrap gap-2">
              {c.location ? factChip("location", MapPin, c.location) : null}
              {c.seniority ? factChip("seniority", TrendingUp, c.seniority) : null}
              {c.available ? factChip("availability", CalendarDays, c.available) : null}
            </ul>
            {!preview ? <p className="mt-4 text-xs text-muted-foreground">{t("composer.shareHint")}</p> : null}
          </div>
        </Panel>

        {section(
          t("composer.about"),
          "summary",
          c.summary ? <p className="text-[15px] leading-relaxed whitespace-pre-line text-muted-foreground">{c.summary}</p> : <Empty>{t("composer.noSummary")}</Empty>,
        )}

        {section(t("composer.skills"), "skills", (
          <div className="grid gap-2">
            <SkillChips skills={ordered} has={new Set(matched)} missing={new Set(missing)} />
            {job.requiredSkills.length ? <p className="text-xs text-muted-foreground">{t("composer.skillsVsJob")}</p> : null}
          </div>
        ))}

        {section(t("composer.experience"), "experience", (
          c.experience.length ? (
            <ol className="grid gap-4">
              {c.experience.map((e, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground" aria-hidden>
                    <Building2 className="size-5" />
                  </span>
                  <div className="min-w-0 border-b border-border/60 pb-4 text-sm last:border-0">
                    <p className="font-semibold">{e.title}</p>
                    {e.company ? <p>{e.company}</p> : null}
                    <p className="text-muted-foreground">{e.period}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>{t("composer.noExperience")}</Empty>
          )
        ))}

        <Panel className="p-6">
          <h3 className="mb-4 text-lg font-semibold tracking-tight">{t("composer.details")}</h3>
          <dl className="grid gap-4">
            {detailRow("languages", Globe, c.languages.length ? <SkillChips skills={c.languages} /> : "—")}
            {detailRow("work_arrangements", Laptop, c.arrangements.length ? <SkillChips skills={c.arrangements} /> : "—")}
            {detailRow("salary_expectation", Wallet, c.salary ?? "—")}
            {detailRow("mobility", Plane, c.mobility.length ? <span className="grid gap-0.5">{c.mobility.map((l) => <span key={l}>{l}</span>)}</span> : "—")}
          </dl>
        </Panel>

        <Panel className="p-6">
          <h3 className="mb-4 text-lg font-semibold tracking-tight">{t("composer.contact")}</h3>
          {c.email || c.phone ? (
            <dl className="grid gap-4">
              {c.email ? detailRow("email", Mail, c.email) : null}
              {c.phone ? detailRow("phone", Phone, c.phone) : null}
            </dl>
          ) : (
            <Empty>{t("composer.noContact")}</Empty>
          )}
        </Panel>

        <Panel className="p-6">
          <h3 className="mb-4 text-lg font-semibold tracking-tight">{t("composer.documents")}</h3>
          {documents.length === 0 ? (
            <Empty>{t("form.noDocuments")}</Empty>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {documents.map((d) => (
                <Label key={d.id} className={cn("flex items-center gap-3 rounded-2xl border border-border/60 p-3 font-normal", preview && !docs.includes(d.id) && "hidden")}>
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted" aria-hidden><FileText className="size-4" /></span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.name}</span>
                  {!d.ready ? <span className="text-xs text-muted-foreground">{t("form.awaitingScan")}</span> : null}
                  <Checkbox name="documentIds" value={d.id} disabled={!d.ready || preview} checked={docs.includes(d.id)} onCheckedChange={(v) => setDocs((l) => (v === true ? [...l, d.id] : l.filter((x) => x !== d.id)))} />
                </Label>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* ------------------------------------------------------------------ Job + submission */}
      <aside className="grid min-w-0 gap-4">
        <Panel className="p-6">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("composer.submittingFor")}</p>
          <div className="mt-3 flex items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-tile-blue text-tile-foreground" aria-hidden>
              <Briefcase className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg leading-tight font-semibold tracking-tight">{job.title}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{job.client} · {job.org}</p>
            </div>
          </div>
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {job.facts.map((f) => {
              const Icon = FACT_ICON[f.icon];
              return (
                <li key={f.icon} className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-1 text-xs font-medium">
                  <Icon className="size-3.5 text-muted-foreground" aria-hidden /> {f.label}
                </li>
              );
            })}
          </ul>

          <div className="mt-5 border-t border-border/60 pt-5">
            <div className="flex items-center gap-3">
              <ScoreRing score={job.score} className="size-12" />
              <div>
                <p className="text-sm font-semibold">{t("composer.match")}</p>
                <StatusPill tone={job.band.tone} label={job.band.label} className="mt-1 text-xs" />
              </div>
            </div>
            <ul className="mt-4 grid gap-1.5 text-sm">
              {job.reasons.slice(0, 4).map((r) => <li key={r} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{r}</li>)}
              {job.reasons.length > 4 ? <li className="pl-6 text-xs text-muted-foreground">{t("composer.seeMore", { count: job.reasons.length - 4 })}</li> : null}
              {job.gaps.map((g) => <li key={g} className="flex gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />{g}</li>)}
            </ul>
          </div>
        </Panel>

        <Panel className="grid gap-5 p-6">
          <h2 className="text-lg font-semibold tracking-tight">{t("composer.submitTitle", { partner: recipient })}</h2>

          <div className="grid gap-3">
            <div>
              <h3 className="text-sm font-semibold">{t("composer.authTitle")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("form.authBefore")} <strong>{recipient}</strong> {t("form.authAnd")} <strong>{jobTitle}</strong>{t("form.authAfter")}
              </p>
            </div>
            <input type="hidden" name="authMethod" value={authMethod} />
            <div role="radiogroup" aria-label={t("form.authMethod")} className="grid gap-2">
              <AuthOption
                selected={authMethod === "candidate_email"}
                disabled={!c.email}
                icon={Mail}
                title={t("form.methodEmail")}
                body={c.email ? t("form.methodEmailHint", { email: c.email, partner: recipient }) : t("form.methodEmailMissing")}
                onSelect={() => setAuthMethod("candidate_email")}
              />
              <AuthOption
                selected={authMethod === "recorded"}
                icon={ShieldCheck}
                title={t("form.methodRecorded")}
                body={t("form.methodRecordedHint")}
                onSelect={() => setAuthMethod("recorded")}
              />
            </div>
            {authMethod === "recorded" ? (
              <>
                {consents.length ? (
                  <FormField id="consentId" label={t("form.authorization")}>
                    <NativeSelect id="consentId" name="consentId" value={consentId} onChange={(e) => setConsentId(e.target.value)}>
                      {consents.map((x) => <option key={x.id} value={x.id}>{t("form.recorded", { date: fmt.date(x.obtained_at), evidence: x.evidence.slice(0, 60) })}</option>)}
                      <option value="new">{t("form.newAuthorization")}</option>
                    </NativeSelect>
                  </FormField>
                ) : <input type="hidden" name="consentId" value="new" />}
                {consentId === "new" ? (
                  <>
                    <FormField id="newConsentBasis" label={t("form.legalBasis")} hint={t("form.legalBasisHint")}>
                      <NativeSelect id="newConsentBasis" name="newConsentBasis" defaultValue="consent">
                        {(Object.keys(LEGAL_BASIS) as (keyof typeof LEGAL_BASIS)[]).map((v) => <option key={v} value={v}>{tg(`labels.legalBasis.${v}`)}</option>)}
                      </NativeSelect>
                    </FormField>
                    <FormField id="newConsentEvidence" label={t("form.evidence")} error={fe?.newConsentEvidence} hint={t("form.evidenceHint")}>
                      <Textarea id="newConsentEvidence" name="newConsentEvidence" rows={3} />
                    </FormField>
                  </>
                ) : null}
                <Label className="flex items-start gap-2.5 rounded-2xl bg-muted/50 p-3 leading-5 font-normal">
                  <Checkbox name="confirmInterest" className="mt-0.5" />
                  <span className="text-sm">{t("form.confirmInterest")}</span>
                </Label>
                {fe?.confirmInterest ? <p role="alert" className="text-xs font-medium text-danger">{fe.confirmInterest[0]}</p> : null}
              </>
            ) : null}
          </div>

          <FormField id="note" label={t("composer.noteTitle")}>
            <Textarea id="note" name="note" rows={3} placeholder={t("form.notePlaceholder")} />
          </FormField>

          <div className="grid gap-2 border-t border-border/60 pt-5">
            {identifying.length ? (
              <p className="rounded-2xl bg-warning-soft p-3 text-sm text-warning">{t("form.identifyingWarning", { fields: identifying.map((f) => label(f.key).toLocaleLowerCase(fmt.tag)).join(", ") })}</p>
            ) : (
              <p className="flex items-start gap-2 text-sm text-muted-foreground"><Lock className="mt-0.5 size-4 shrink-0" aria-hidden /> {t("form.anonymous")}</p>
            )}
            <p className="flex items-start gap-2 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> {t("form.revocation")}</p>
          </div>
          <FormMessage state={state} />
          <SubmitButton size="lg" className="w-full" pendingLabel={t("form.submitting")}>{t("form.submit")}</SubmitButton>
        </Panel>
      </aside>
    </ActionForm>
  );

  // ---- Local building blocks (closures over the share state) ----------------------------------

  function section(title: string, k: DisclosureKey, children: ReactNode) {
    return (
      <Panel className="p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
          {toggle(k)}
        </div>
        {show(k) ? <div className={cn("transition-opacity", !on(k) && "opacity-45")}>{children}</div> : hiddenNote()}
      </Panel>
    );
  }

  function detailRow(k: DisclosureKey, Icon: LucideIcon, children: ReactNode) {
    return (
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground" aria-hidden><Icon className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <dt className="text-xs text-muted-foreground">{label(k)}</dt>
          <dd className={cn("mt-1 text-sm font-medium break-words", !show(k) ? "text-muted-foreground" : !on(k) && "opacity-45")}>
            {show(k) ? children : <span className="inline-flex items-center gap-1.5 font-normal"><EyeOff className="size-3.5" aria-hidden />{t("composer.hiddenSection", { partner: recipient })}</span>}
          </dd>
        </div>
        {toggle(k)}
      </div>
    );
  }

  function factChip(k: DisclosureKey, Icon: LucideIcon, text: string) {
    if (!show(k)) return null;
    const shared = on(k);
    const content = (
      <>
        <Icon className="size-3.5" aria-hidden />
        <span className={cn(!shared && "line-through")}>{text}</span>
        {!preview ? (shared ? <Eye className="size-3.5 text-success" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />) : null}
      </>
    );
    const cls = cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm", shared ? "border-border bg-card" : "border-dashed border-border text-muted-foreground");
    return (
      <li>
        {preview ? (
          <span className={cls}>{content}</span>
        ) : (
          <button type="button" aria-pressed={shared} aria-label={shared ? t("composer.hide", { field: label(k) }) : t("composer.share", { field: label(k) })} onClick={() => flip(k)} className={cn(cls, "transition-colors hover:border-foreground/30")}>
            {content}
          </button>
        )}
      </li>
    );
  }

  function hiddenNote() {
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
        <EyeOff className="size-4 shrink-0" aria-hidden /> {t("composer.hiddenSection", { partner: recipient })}
      </p>
    );
  }
}

/** Eye pill that shares or hides one disclosure field. Identifying fields turn amber once shared. */
function ShareToggle({ on, identifying, field, onClick }: { on: boolean; identifying: boolean; field: string; onClick: () => void }) {
  const t = useT("referrals");
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? t("composer.hide", { field }) : t("composer.share", { field })}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        on
          ? identifying
            ? "border-warning/30 bg-warning-soft text-warning"
            : "border-success/30 bg-success-soft text-success"
          : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      )}
    >
      {on ? <Eye className="size-3.5" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />}
      {on ? t("composer.shared") : t("composer.hidden")}
      {identifying ? <span className="sr-only">· {t("form.identifying")}</span> : null}
    </button>
  );
}

/** One way of authorizing the share, as a selectable card (radio semantics). */
function AuthOption({ selected, disabled, icon: Icon, title, body, onSelect }: { selected: boolean; disabled?: boolean; icon: LucideIcon; title: string; body: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex items-start gap-3 rounded-2xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        selected ? "border-foreground bg-muted/40" : "border-border/60 hover:border-foreground/30",
      )}
    >
      <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2", selected ? "border-foreground" : "border-border")} aria-hidden>
        {selected ? <span className="size-1.5 rounded-full bg-foreground" /> : null}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium"><Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />{title}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{body}</span>
      </span>
    </button>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
