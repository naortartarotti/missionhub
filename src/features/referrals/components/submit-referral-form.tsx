"use client";

import { ActionForm } from "@/components/shared/action-form";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import {
  Briefcase,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  Globe,
  Info,
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
  RefreshCw,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { type Tone } from "@/components/shared/status-pill";
import { ScoreRing } from "@/features/matching/components/score-ring";
import { LEGAL_BASIS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { useFormatter, useGlobalT, useT } from "@/i18n/client";
import { DISCLOSURE_FIELDS, type DisclosureKey } from "../disclosure";
import { submitReferral, type SubmitOutcome } from "../actions";
import type { ActionResult } from "@/lib/actions/result";
import type { PartnerTerms } from "@/features/matching/queries";
import { NetworkRules, TermsSummary } from "@/features/jobs/components/terms-summary";
import { splitFromPartner, termsFromPartner } from "@/features/jobs/terms-display";

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
  /** Whether a LinkedIn URL is on file (the URL itself isn't needed): one of the three identifiers (BR-10). */
  hasLinkedin: boolean;
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
  terms: initialTerms,
  blocked,
  codeMessages,
}: {
  orgSlug: string;
  matchId: string;
  recipient: string;
  jobTitle: string;
  candidate: ComposerCandidate;
  job: ComposerJob;
  consents: { id: string; evidence: string; obtained_at: string; expires_at: string | null }[];
  documents: { id: string; name: string; ready: boolean }[];
  /** N2 (BR-8): the job's current terms card, from get_opportunities. Its version id is posted (BR-12). */
  terms: PartnerTerms;
  /** N10 (BR-9 b, S20-d): replaces the submit panel when this member must accept the rules first. */
  blocked?: ReactNode;
  /** N10 server codes with context copy (partner_activity_restricted, rules_acceptance_required, spec §5.16). */
  codeMessages?: Record<string, string>;
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

  // N1 submit outcomes (EC-1): results rendered as states in the submit panel, never toasts.
  // "Cancel" on the pending warning dismisses that result; a new submit produces a new one.
  const [dismissed, setDismissed] = useState<ActionResult<SubmitOutcome> | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const outcome = state && state.ok && state.data && state !== dismissed ? state.data : null;
  const stopped = outcome?.outcome === "stopped" ? outcome : null;
  const pendingWarning = outcome?.outcome === "pending_warning";
  // No email, phone or LinkedIn on file: known before submitting (S1-b). The server re-checks.
  const noIdentifier = !c.email && !c.phone && !c.hasLinkedin;
  const identifierAlert = noIdentifier || outcome?.outcome === "identifier_required";
  // N2 `terms_changed` (S5-e): nothing was sent. Re-render the card at the new version with Changed
  // badges against the one the form showed, keep every field, reset N1's acknowledgement tick and post
  // the new version id next time (the payload carries the current card, backend.md §4.2).
  const [card, setCard] = useState<{ terms: PartnerTerms; previous: PartnerTerms | null }>({ terms: initialTerms, previous: null });
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.ok && state.data?.outcome === "terms_changed") {
      const next = state.data.terms;
      setCard((c) => (c.terms.terms_version_id === next.terms_version_id ? c : { terms: next, previous: c.terms }));
      setAcknowledged(false);
    }
  }
  const termsChanged = outcome?.outcome === "terms_changed";
  const resultRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Stop and warning: announce once, move focus there and bring it into view (the aside sits below the profile on mobile).
    if (!state || !state.ok || !state.data || state.data.outcome === "identifier_required") return;
    const el = resultRef.current;
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  }, [state]);

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
    <ActionForm action={action} className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="termsVersionId" value={card.terms.terms_version_id} />
      {[...selected].map((k) => <input key={k} type="hidden" name="fields" value={k} />)}

      {/* ------------------------------------------------------------------ Candidate profile */}
      {/* One shrinkable track per column: long names in the toggle and cards wrap instead of widening the page (AC-62). */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Shrinks and wraps at 375px instead of widening the page (AC-62). */}
          <div role="radiogroup" aria-label={t("composer.viewOwn")} className="inline-flex max-w-full rounded-3xl border border-border/60 bg-card p-1 text-sm">
            {[false, true].map((p) => (
              <button
                key={String(p)}
                type="button"
                role="radio"
                aria-checked={preview === p}
                onClick={() => setPreview(p)}
                className={cn("inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-3xl px-3.5 py-1.5 text-left font-medium transition-colors sm:min-h-0", preview === p ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
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
            // minmax(0,1fr): a long email can't widen the track past the panel at 375px (AC-62).
            <dl className="grid grid-cols-[minmax(0,1fr)] gap-4">
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
      <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
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
              </div>
            </div>
            <ul className="mt-4 grid gap-1.5 text-sm">
              {job.reasons.slice(0, 4).map((r) => <li key={r} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{r}</li>)}
              {job.reasons.length > 4 ? <li className="pl-6 text-xs text-muted-foreground">{t("composer.seeMore", { count: job.reasons.length - 4 })}</li> : null}
              {job.gaps.map((g) => <li key={g} className="flex gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />{g}</li>)}
            </ul>
          </div>
        </Panel>

        <PartnerTermsPanel terms={card.terms} previous={card.previous} partner={recipient} />

        <Panel className="grid gap-5 p-6">
          <h2 className="text-lg font-semibold tracking-tight">{t("composer.submitTitle", { partner: recipient })}</h2>

          {stopped ? (
            <StopState orgSlug={orgSlug} partner={recipient} reference={stopped.reference} supportEmail={stopped.supportEmail} titleRef={resultRef} />
          ) : (
          <>
          {identifierAlert ? (
            <Alert id="identifier-alert" role={noIdentifier ? "status" : "alert"} className="rounded-2xl border-warning/30 bg-warning-soft text-warning">
              <CircleAlert aria-hidden />
              <AlertTitle className={ALERT_TITLE}>{t("form.identifierRequired.title")}</AlertTitle>
              <AlertDescription className="text-foreground">
                <p>{t("form.identifierRequired.description")}</p>
                <Button variant="outline" size="sm" className="mt-1 min-h-11 sm:min-h-8" asChild>
                  <Link href={`/workspace/${orgSlug}/candidates/${c.id}/edit`}>{t("form.identifierRequired.action")}</Link>
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

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
          <p className="flex items-start gap-2 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> {t("form.duplicateCheckNote", { partner: recipient })}</p>
          <FormMessage state={state && !state.ok ? (state.code && codeMessages?.[state.code] ? { ...state, error: codeMessages[state.code] } : state) : null} />
          {termsChanged ? (
            <Alert ref={resultRef} id="terms-changed" role="alert" tabIndex={-1} className="rounded-2xl border-warning/30 bg-warning-soft text-warning outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <RefreshCw aria-hidden />
              <AlertTitle className={ALERT_TITLE}>{t("termsChanged.title")}</AlertTitle>
              <AlertDescription className="text-foreground">
                <p>{t("termsChanged.description", { partner: recipient, date: fmt.date(card.terms.terms_published_at) })}</p>
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-1">
              <p className="flex items-start gap-2 text-sm">
                <FileCheck2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                {t("form.termsLine", { version: card.terms.terms_version_no, date: fmt.date(card.terms.terms_published_at) })}
              </p>
              {authMethod === "candidate_email" ? <p className="pl-6 text-xs text-muted-foreground">{t("form.termsLineConfirm")}</p> : null}
          </div>
          {blocked ? (
            blocked
          ) : pendingWarning ? (
            <div className="grid gap-3">
              <Alert ref={resultRef} id="pending-warning" tabIndex={-1} className="rounded-2xl border-warning/30 bg-warning-soft text-warning outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <CircleAlert aria-hidden />
                <AlertTitle className={ALERT_TITLE}>{t("duplicate.pendingTitle", { partner: recipient })}</AlertTitle>
                <AlertDescription className="text-foreground">
                  <p>{t("duplicate.pendingDescription", { partner: recipient })}</p>
                </AlertDescription>
              </Alert>
              <Label className="flex min-h-11 items-start gap-2.5 rounded-2xl bg-muted/50 p-3 leading-5 font-normal">
                <Checkbox checked={acknowledged} onCheckedChange={(v) => setAcknowledged(v === true)} className="mt-0.5" />
                <span className="text-sm">{t("duplicate.acknowledge")}</span>
              </Label>
              {acknowledged ? <input type="hidden" name="acknowledgePendingWarning" value="true" /> : null}
              <SubmitButton size="lg" className="w-full" disabled={!acknowledged} aria-describedby="pending-warning" pendingLabel={t("form.submitting")}>
                {t("duplicate.submitAnyway")}
              </SubmitButton>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 w-full sm:min-h-10"
                onClick={() => {
                  setDismissed(state);
                  setAcknowledged(false);
                  // The warning (and this button) goes away: put focus on the restored submit button.
                  requestAnimationFrame(() => submitRef.current?.focus());
                }}
              >
                {tg("common.actions.cancel")}
              </Button>
            </div>
          ) : (
            <SubmitButton
              ref={submitRef}
              size="lg"
              className="w-full"
              disabled={noIdentifier}
              aria-describedby={identifierAlert ? "identifier-alert" : termsChanged ? "terms-changed" : undefined}
              pendingLabel={t("form.submitting")}
            >
              {termsChanged ? t("termsChanged.submit") : t("form.submit")}
            </SubmitButton>
          )}
          </>
          )}
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
          <dd className={cn("mt-1 text-sm font-medium [overflow-wrap:anywhere]", !show(k) ? "text-muted-foreground" : !on(k) && "opacity-45")}>
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

/**
 * S5 "Terms for this job": the current version as partners see it (BR-8), the gated estimate (BR-9:
 * the server sends no estimate on % jobs that keep the band private) and the network rules.
 */
function PartnerTermsPanel({ terms, previous, partner }: { terms: PartnerTerms; previous: PartnerTerms | null; partner: string }) {
  const tj = useT("jobs");
  const f = useFormatter();
  const view = termsFromPartner(terms);
  const flat = terms.fee_basis === "flat";
  const percent = f.percent(terms.sourcing_bps);
  const hasEstimate = terms.estimated_fee_minor !== null && terms.estimated_share_minor !== null;
  // Internal jobs carry no share (the agreement gives the sourcing part to the job owner): no box.
  const estimate = flat ? (
    terms.estimated_share_minor !== null ? (
      <div className="grid gap-1 rounded-2xl bg-muted/40 p-3">
        <p className="text-sm font-semibold tabular-nums">{tj("terms.flatShare", { share: f.money(terms.estimated_share_minor, terms.fee_currency, { code: true }), percent })}</p>
        <p className="text-xs text-muted-foreground">{tj("terms.flatShareHint")}</p>
      </div>
    ) : null
  ) : hasEstimate ? (
    <div className="grid gap-1 rounded-2xl bg-muted/40 p-3">
      <p className="text-sm font-semibold text-pretty tabular-nums">
        {tj("terms.estimate", {
          fee: f.money(terms.estimated_fee_minor, terms.fee_currency, { code: true, whole: true }),
          share: f.money(terms.estimated_share_minor, terms.fee_currency, { code: true, whole: true }),
          percent,
        })}
      </p>
      <p className="text-xs text-muted-foreground">{tj("terms.estimateHint")}</p>
    </div>
  ) : terms.internal ? null : (
    <p className="flex items-start gap-2 rounded-2xl bg-muted/40 p-3 text-sm text-muted-foreground">
      <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden />
      {tj("terms.estimateHidden", { partner })}
    </p>
  );
  return (
    <Panel role="region" className="grid gap-4 p-6" aria-labelledby="partner-terms-title">
      <div className="grid gap-1.5">
        <h2 id="partner-terms-title" className="text-lg font-semibold tracking-tight">{tj("terms.partnerTitle")}</h2>
        <p className="text-xs text-muted-foreground">{tj("terms.versionLine", { version: terms.terms_version_no, date: f.date(terms.terms_published_at) })}</p>
        {terms.terms_updated_at ? (
          <span className="inline-flex w-fit max-w-full items-start gap-1.5 rounded-2xl bg-info-soft px-2.5 py-1 text-xs font-medium whitespace-normal text-info">
            <RefreshCw className="mt-px size-3.5 shrink-0" aria-hidden />
            {tj("terms.updatedChip", { date: f.date(terms.terms_updated_at) })}
          </span>
        ) : null}
      </div>
      <TermsSummary
        variant="partner"
        terms={view}
        split={splitFromPartner(terms)}
        client={terms.client_label}
        changedFrom={previous ? termsFromPartner(previous) : null}
        amountShown={flat || hasEstimate}
        estimate={estimate}
      />
      <NetworkRules />
    </Panel>
  );
}

/** AlertTitle clamps to one line by default; N1 titles must wrap (fr runs ~30% longer). */
const ALERT_TITLE = "line-clamp-none whitespace-normal text-pretty";

/**
 * S1-d: the one message for every stop (BR-9, AC-5). Same text for a job- or client-level hit, an
 * earlier referral from any org and a sticky stop; only {partner} and the opaque reference vary.
 */
function StopState({ orgSlug, partner, reference, supportEmail, titleRef }: { orgSlug: string; partner: string; reference: string; supportEmail: string | null; titleRef: Ref<HTMLDivElement> }) {
  const t = useT("referrals");
  // The address comes from a server env var; still refuse anything that isn't a plain address.
  const support = supportEmail && /^[^\s@<>"?&]+@[^\s@<>"?&]+$/.test(supportEmail) ? supportEmail : null;
  return (
    <div className="grid gap-4">
      <Alert className="rounded-2xl bg-muted/40">
        <Info aria-hidden />
        <AlertTitle ref={titleRef} tabIndex={-1} className={cn(ALERT_TITLE, "outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
          {t("duplicate.stopTitle")}
        </AlertTitle>
        <AlertDescription className="text-foreground">
          <p>{t("duplicate.message", { partner })}</p>
          <p>{t("duplicate.stopNext", { partner })}</p>
        </AlertDescription>
      </Alert>
      <Button variant="outline" size="lg" className="w-full" asChild>
        <Link href={`/workspace/${orgSlug}/opportunities`}>{t("duplicate.backToOpportunities")}</Link>
      </Button>
      {support ? (
        <p className="text-sm text-muted-foreground">
          {t("duplicate.supportBefore")}{" "}
          <a className="font-medium text-foreground underline underline-offset-4" href={`mailto:${support}?subject=${encodeURIComponent(t("duplicate.supportSubject", { reference }))}`}>
            {t("duplicate.supportLink")}
          </a>{" "}
          {t("duplicate.supportAfter", { reference })}
        </p>
      ) : null}
    </div>
  );
}
