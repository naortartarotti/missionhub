import Link from "next/link";
import type { ReactNode } from "react";
import { NavHint } from "@/components/layout/nav-hint";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock,
  Eye,
  EyeOff,
  Handshake,
  Mail,
  MessageCircleQuestion,
  MessageSquare,
  Phone,
  ShieldCheck,
  ShieldOff,
  Trophy,
  UserRound,
  X,
  type LucideIcon,
  KanbanSquare,
  Lock,
} from "lucide-react";
import { PIPELINE_STAGES, type PipelineStage } from "@/features/pipeline/stages";
import { getPipelineOwnership } from "@/features/pipeline/queries";
import { getRequestContext } from "@/server/auth/context";
import { getReferralDetail } from "@/features/referrals/queries";
import { ConfirmAgreementButton, GrantDownload, MessageForm, ReportHireDialog, ResendCandidateButton, TransitionButtons } from "@/features/referrals/components/referral-actions";
import { DISCLOSURE_FIELDS, type DisclosureKey } from "@/features/referrals/disclosure";
import { CLOSED_STATUSES, REFERRAL_STAGES, STAGE_INDEX, isDeclineReason, skillCoverage, type FitEvidence } from "@/features/referrals/review";
import { DirectionBadge } from "@/features/referrals/components/direction-badge";
import { ScoreRing } from "@/features/matching/components/score-ring";
import { evidenceText } from "@/features/matching/evidence";
import { Panel } from "@/components/shared/card";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { StatusPill, type Tone } from "@/components/shared/status-pill";
import { StatTile } from "@/components/shared/stat-tile";
import { SkillChips } from "@/components/shared/skill-chips";
import { ExpandableText } from "@/components/shared/expandable-text";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { Flash } from "@/components/shared/flash";
import { Button } from "@/components/ui/button";
import { REFERRAL_STATUS, type ARRANGEMENT, type SENIORITY } from "@/lib/labels";
import { bpsToPercent, minorToMajorString } from "@/lib/money/format";
import { cn } from "@/lib/utils";
import { getFormatter, getGlobalT, getLocale, getT } from "@/i18n/server";
import { INTL_LOCALE } from "@/i18n/config";
import { countryNamer, mobilityLines } from "@/features/candidates/mobility";

export async function generateMetadata() {
  return { title: (await getT("referrals"))("detail.title") };
}

/** Server-rendered per request, so reading the clock here is fine. */
const isPast = (iso: string) => new Date(iso).getTime() < Date.now();

/** Candidate column → label key in the `candidate.profile` namespace (fields they may edit). */
const PROFILE_FIELD_LABEL: Record<string, "fullName" | "phone" | "headline" | "summary" | "city" | "region" | "country" | "openToRelocation" | "workArrangements" | "skills" | "languages" | "salaryMin" | "salaryMax" | "currency" | "availableFrom" | "travel" | "relocation" | "destinations" | "workAuthorization" | "passport"> = {
  full_name: "fullName",
  phone: "phone",
  headline: "headline",
  summary: "summary",
  location_city: "city",
  location_region: "region",
  location_country: "country",
  open_to_relocation: "openToRelocation",
  work_arrangements: "workArrangements",
  skills: "skills",
  languages: "languages",
  salary_expectation_min: "salaryMin",
  salary_expectation_max: "salaryMax",
  salary_currency: "currency",
  available_from: "availableFrom",
  travel_availability: "travel",
  relocation_scope: "relocation",
  relocation_destinations: "destinations",
  work_authorization: "workAuthorization",
  has_passport: "passport",
};

const isDisclosureKey = (k: string): k is DisclosureKey => DISCLOSURE_FIELDS.some((f) => f.key === k);

type Snapshot = Partial<{
  full_name: string;
  email: string;
  phone: string;
  headline: string;
  summary: string;
  location: string;
  open_to_relocation: boolean;
  seniority: keyof typeof SENIORITY;
  years_experience: number;
  skills: string[];
  languages: string[];
  work_arrangements: (keyof typeof ARRANGEMENT)[];
  salary_expectation_min: number;
  salary_expectation_max: number;
  salary_currency: string;
  available_from: string;
  mobility: { travel: string | null; relocation: string | null; destinations: string[]; work_authorization: string[]; has_passport: boolean | null };
  experience: { title: string; company: string | null; start_date: string | null; end_date: string | null; description: string | null }[];
}>;

const TONE_SOFT: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-muted text-muted-foreground",
};

const TONE_DOT: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-muted-foreground/60",
};

/** Key fact in the profile strip (same as the candidate page): small label, prominent value. */
function KeyFact({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="min-w-0 px-4 first:pl-0 sm:border-l sm:border-border/60 sm:first:border-l-0">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 text-base font-semibold text-pretty tabular-nums", muted && "font-normal text-muted-foreground")} title={value}>{value}</dd>
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-xs font-medium text-muted-foreground">{children}</h3>;
}

function Count({ n }: { n: number }) {
  return <span className="ml-2 rounded-full bg-muted px-2 py-0.5 align-middle text-xs font-medium text-muted-foreground tabular-nums">{n}</span>;
}

export default async function ReferralPage({ params, searchParams }: PageProps<"/workspace/[orgSlug]/referrals/[referralId]">) {
  const { orgSlug, referralId } = await params;
  const sp = await searchParams;
  const ctx = await getRequestContext(orgSlug);
  const [t, tg, f, tp, tc] = await Promise.all([getT("referrals"), getGlobalT(), getFormatter(), getT("pipeline"), getT("candidate")]);
  const d = await getReferralDetail(ctx, referralId);
  if (!d) notFound();
  const { referral: r, side, agreement } = d;
  // Candidate-confirmed referrals: delivery status of the private link (sourcing side only, via RLS).
  const { data: request } =
    side === "source"
      ? await ctx.db
          .from("referral_candidate_requests")
          .select("destination, expires_at, sent_at, last_attempt_at, viewed_at, confirmed_at, profile_changes")
          .eq("referral_id", r.id)
          .maybeSingle()
      : { data: null };
  const profileChanges = request?.confirmed_at && request.profile_changes.length
    ? request.profile_changes.map((k) => tc(`profile.${PROFILE_FIELD_LABEL[k] ?? "summary"}`)).join(", ")
    : null;
  const snap = (d.profile?.snapshot ?? null) as Snapshot | null;
  const partner = (side === "source" ? r.target_org?.name : r.source_org?.name) ?? "";
  const st = REFERRAL_STATUS[r.status];
  // Partner jobs are hidden by RLS, so only the job owner can compare the profile with the requirements.
  const { data: job } =
    side === "target"
      ? await ctx.db.from("jobs").select("expected_fee_minor, fee_currency, required_skills, preferred_skills").eq("id", r.job_id).maybeSingle()
      : { data: null };

  const statusLabel = tg(`labels.referralStatus.${r.status}`);
  const closed = CLOSED_STATUSES.has(r.status);
  const lastEvent = d.events.at(-1);
  const reasonText = (reason: string | null | undefined) =>
    reason ? (isDeclineReason(reason) ? t(`declineReasons.${reason}`) : t("detail.reasonQuote", { reason })) : null;
  // Events without a side were recorded by the candidate (confirmation / refusal through their link).
  const who = (actorSide: string | null) => (actorSide === null ? t("detail.candidateActor") : actorSide === side ? t("detail.you") : partner);

  // ---- Progress through the hiring pipeline. A closed referral stops at the furthest stage it reached.
  const reachedAt = new Map<number, string>();
  for (const e of d.events) {
    const i = STAGE_INDEX[e.to_status];
    if (i !== undefined && !reachedAt.has(i)) reachedAt.set(i, e.created_at);
  }
  const furthest = Math.max(0, ...reachedAt.keys());
  const current = closed ? furthest : (STAGE_INDEX[r.status] ?? 0);

  // ---- What happens next: one banner, same pattern as the job page.
  // After acceptance, only the person who accepted moves the referral (enforced in the database too).
  const inPipeline = side === "target" && PIPELINE_STAGES.includes(r.status as PipelineStage) && r.status !== "hired";
  const ownership = inPipeline ? await getPipelineOwnership(ctx, r.id) : null;
  const lockedToOwner = !!ownership && !ownership.canMove;
  const awaiting = r.status === "awaiting_candidate" && side === "source";
  const hasActions = !lockedToOwner && (awaiting || d.transitions.length > 0 || (side === "target" && r.status === "offer") || (side === "source" && agreement?.status === "pending_source"));
  const awaitingBody = () => {
    if (!request) return null;
    const email = request.destination;
    if (isPast(request.expires_at)) return t("detail.next.awaitingExpired", { email, date: f.date(request.expires_at) });
    if (!request.sent_at) return t("detail.next.awaitingNotSent", { email });
    const sent = t("detail.next.awaitingSent", { email, time: f.relative(request.sent_at), date: f.date(request.expires_at), partner });
    return request.viewed_at ? `${sent} ${t("detail.next.awaitingViewed", { time: f.relative(request.viewed_at) })}` : sent;
  };
  const next: { tone: Tone; icon: LucideIcon; title: string; body: string | null } = awaiting
    ? { tone: "warning", icon: Mail, title: t("detail.next.awaitingCandidate"), body: awaitingBody() }
    : r.status === "candidate_declined"
    ? { tone: "neutral", icon: X, title: t("detail.next.candidateDeclined"), body: reasonText(lastEvent?.reason) ?? t("detail.next.candidateDeclinedBody", { partner }) }
    : r.status === "hired"
    ? { tone: "success", icon: Trophy, title: statusLabel, body: t("detail.next.hired") }
    : closed
      ? {
          tone: st.tone,
          icon: X,
          title: lastEvent ? (lastEvent.actor_side === side ? t("detail.next.closedByYou", { status: statusLabel }) : t("detail.next.closedBy", { status: statusLabel, who: partner })) : statusLabel,
          body: reasonText(lastEvent?.reason) ?? t("detail.next.noReason"),
        }
      : r.status === "info_requested" && side === "source"
        ? { tone: "warning", icon: MessageCircleQuestion, title: t("detail.next.infoRequested", { partner }), body: reasonText(lastEvent?.reason) ?? t("detail.guidanceSource") }
        : hasActions
          ? { tone: "info", icon: ArrowRight, title: t("detail.next.yourMove"), body: side === "target" ? t("detail.guidanceTarget") : t("detail.guidanceSource") }
          : { tone: "neutral", icon: Clock, title: t("detail.next.waiting", { partner }), body: reasonText(lastEvent?.reason) ?? t("detail.next.waitingBody") };

  // ---- Profile facts. `undefined` = the field was not disclosed; `null` = disclosed but empty.
  const notShared = t("detail.notShared");
  const seniority = snap?.seniority !== undefined
    ? [snap.seniority ? tg(`labels.seniority.${snap.seniority}`) : null, snap.years_experience != null ? t("detail.fields.years", { count: snap.years_experience }) : null].filter(Boolean).join(" · ") || "—"
    : null;
  const salary = snap?.salary_currency !== undefined
    ? [snap.salary_expectation_min, snap.salary_expectation_max].filter((v) => v != null).map((v) => f.money(v, snap.salary_currency ?? ctx.currency, { whole: true })).join(" – ") || "—"
    : null;
  const keyFacts = snap
    ? [
        { label: t("detail.fields.seniority"), value: seniority },
        { label: t("detail.fields.location"), value: snap.location !== undefined ? snap.location || "—" : null },
        { label: t("detail.fields.available"), value: snap.available_from !== undefined ? (snap.available_from ? f.date(snap.available_from) : "—") : null },
        { label: t("detail.fields.salary"), value: salary },
      ]
    : [];
  const arrangements = snap?.work_arrangements
    ? [...snap.work_arrangements.map((a) => tg(`labels.arrangement.${a}`)), ...(snap.open_to_relocation ? [t("detail.fields.openToRelocation")] : [])]
    : null;
  const mobility = snap?.mobility
    ? mobilityLines(
        {
          travel: snap.mobility.travel,
          relocation: snap.mobility.relocation,
          destinations: snap.mobility.destinations ?? [],
          workAuthorization: snap.mobility.work_authorization ?? [],
          hasPassport: snap.mobility.has_passport,
        },
        tg,
        countryNamer(INTL_LOCALE[await getLocale()]),
      )
    : null;
  const coverage = job && job.required_skills.length ? skillCoverage(snap as Parameters<typeof skillCoverage>[0], job) : null;
  const rawEvidence = (r.fit_evidence ?? null) as FitEvidence | null;
  // Skill coverage is already shown as chips in the profile, so the fit panel keeps the other reasons.
  const evidence = rawEvidence && coverage ? { ...rawEvidence, reasons: rawEvidence.reasons.filter((e) => !["skills", "preferred_skills"].includes(e.factor)) } : rawEvidence;

  return (
    <div className="grid gap-6">
      <NavHint tab={side === "source" ? "sent" : "received"} />
      <PageHeader
        leading={r.fit_score != null ? <ScoreRing score={r.fit_score} className="size-12" /> : <InitialsAvatar name={d.candidateName ?? r.candidate_label} className="size-12 text-base" />}
        eyebrow={
          <span className="inline-flex flex-wrap items-center gap-2">
            <DirectionBadge direction={side === "source" ? "outbound" : "inbound"} label={t(side === "source" ? "direction.outbound.badge" : "direction.inbound.badge")} />
            <span>{side === "source" ? t("detail.sentTo", { partner }) : t("detail.receivedFrom", { partner })} · {f.date(r.submitted_at)}</span>
          </span>
        }
        title={d.candidateName ?? r.candidate_label}
        description={
          d.candidateName
            ? `${t("detail.forJob", { job: r.job_title_snapshot })} · ${t("sent.partnerSees", { label: r.candidate_label })}`
            : t("detail.forJob", { job: r.job_title_snapshot })
        }
        actions={<StatusPill tone={st.tone} label={statusLabel} />}
      />
      {sp.submitted ? <Flash message={t("detail.submittedFlash", { partner })} /> : null}
      {sp.awaiting && request ? <Flash message={t("detail.awaitingFlash", { email: request.destination, partner })} /> : null}
      {sp.notSent ? (
        <div role="alert" className="flex items-start gap-2 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {t("detail.awaitingNotSentFlash")}
        </div>
      ) : null}
      {profileChanges ? (
        <p className="flex items-start gap-2 rounded-2xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          <UserRound className="mt-0.5 size-4 shrink-0" aria-hidden /> {t("detail.profileUpdated", { fields: profileChanges })}
        </p>
      ) : null}

      {r.sharing_revoked_at ? (
        <div role="status" className="flex items-start gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
          <ShieldOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("detail.revoked", { date: f.date(r.sharing_revoked_at) })} {side === "target" ? t("detail.revokedTarget") : t("detail.revokedSource")}
        </div>
      ) : null}

      {/* Where it stands + what happens next */}
      <section className="grid gap-3">
        <Panel className="p-6">
          <ol className="grid grid-cols-5 gap-2" aria-label={t("sent.progress", { step: current + 1, total: REFERRAL_STAGES.length })}>
            {REFERRAL_STAGES.map((s, i) => {
              const done = i < current || (i === current && (r.status === "hired" || !closed));
              const stopped = closed && i === current;
              const isCurrent = i === current && !closed && r.status !== "hired";
              return (
                <li key={s} className="min-w-0" aria-current={i === current ? "step" : undefined}>
                  <div className={cn("h-1.5 rounded-full", stopped ? "bg-danger" : done ? "bg-foreground" : "bg-border")} />
                  <div className="mt-3 flex items-center gap-1.5">
                    {stopped ? (
                      <span className="grid size-4 shrink-0 place-items-center rounded-full bg-danger text-white dark:text-black" aria-hidden><X className="size-2.5" strokeWidth={3} /></span>
                    ) : done && !isCurrent ? (
                      <span className="grid size-4 shrink-0 place-items-center rounded-full bg-foreground text-background" aria-hidden><Check className="size-2.5" strokeWidth={3} /></span>
                    ) : (
                      <span className={cn("size-4 shrink-0 rounded-full border-2", isCurrent ? "border-foreground" : "border-border")} aria-hidden />
                    )}
                    <p className={cn("truncate text-xs sm:text-sm", i <= current ? "font-medium" : "text-muted-foreground")}>
                      {i === current && r.status !== "hired" ? statusLabel : tg(`labels.referralStatus.${s}`)}
                    </p>
                  </div>
                  <p className="mt-0.5 hidden truncate pl-5.5 text-xs text-muted-foreground sm:block">
                    {stopped && lastEvent ? f.date(lastEvent.created_at) : reachedAt.has(i) ? f.date(reachedAt.get(i)!) : " "}
                  </p>
                </li>
              );
            })}
          </ol>
        </Panel>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-border/60 bg-card px-4 py-3">
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", TONE_SOFT[next.tone])} aria-hidden>
            <next.icon className="size-4" />
          </span>
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">{next.title}</span>
            {next.body ? <span className="text-muted-foreground"> · {next.body}</span> : null}
          </p>
          {hasActions ? (
            <div className="flex flex-wrap gap-2">
              {side === "source" && agreement?.status === "pending_source" ? <ConfirmAgreementButton orgSlug={orgSlug} referralId={r.id} /> : null}
              {awaiting ? <ResendCandidateButton orgSlug={orgSlug} referralId={r.id} primary={!request?.sent_at || isPast(request.expires_at)} /> : null}
              <TransitionButtons orgSlug={orgSlug} referralId={r.id} version={r.version} transitions={d.transitions} side={side} status={r.status} />
              {side === "target" && r.status === "offer" && agreement?.status === "active" ? (
                <ReportHireDialog orgSlug={orgSlug} referralId={r.id} version={r.version} currency={job?.fee_currency ?? ctx.currency} defaultFee={job?.expected_fee_minor ? minorToMajorString(job.expected_fee_minor, job.fee_currency) : ""} />
              ) : null}
            </div>
          ) : null}
          {lockedToOwner ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Lock className="size-4 shrink-0" aria-hidden />
              {ownership.name ? tp("ownedBy", { name: ownership.name }) : tp("ownerOnlyUnknown")}
            </p>
          ) : null}
          {side === "target" && PIPELINE_STAGES.includes(r.status as PipelineStage) ? (
            <Button variant="ghost" asChild>
              <Link href={`/workspace/${orgSlug}/pipeline?job=${r.job_id}`}>
                <KanbanSquare className="size-4" aria-hidden />
                {tp("viewInPipeline")}
              </Link>
            </Button>
          ) : null}
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-6">
          {/* The profile the partner approved */}
          <Panel className="grid gap-6 p-6">
            <SectionTitle
              action={side === "source" && d.candidateId ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/workspace/${orgSlug}/candidates/${d.candidateId}`}><UserRound className="size-4" aria-hidden /> {t("detail.openCandidate")}</Link>
                </Button>
              ) : null}
            >
              {side === "target" ? t("detail.approvedProfile") : t("detail.whatYouShared")}
            </SectionTitle>

            {!snap ? (
              <div className="-mt-3 flex items-center gap-3 rounded-2xl bg-muted/50 px-4 py-5 text-sm text-muted-foreground">
                <EyeOff className="size-5 shrink-0" aria-hidden /> {t("detail.notAvailable")}
              </div>
            ) : (
              <>
                {snap.headline && snap.headline !== r.candidate_label ? <p className="-mt-3 text-[15px] font-medium text-pretty">{snap.headline}</p> : null}

                <dl className="grid grid-cols-2 gap-y-4 sm:grid-cols-4">
                  {keyFacts.map((k) => <KeyFact key={k.label} label={k.label} value={k.value ?? notShared} muted={k.value === null} />)}
                </dl>

                <div className="grid gap-6 border-t border-border/60 pt-6 sm:grid-cols-[1.4fr_1fr]">
                  <div className="grid content-start gap-5">
                    {snap.skills ? (
                      <div>
                        <Label>{t("detail.fields.skills")}</Label>
                        {coverage ? (
                          <div className="grid gap-2">
                            <SkillChips skills={job!.required_skills} has={new Set(coverage.has)} missing={new Set(coverage.missing)} />
                            {(() => {
                              const extra = snap.skills.filter((s) => !job!.required_skills.some((q) => q.toLowerCase() === s.trim().toLowerCase()));
                              return extra.length ? <p className="text-xs text-muted-foreground">{t("queue.bonusSkills", { skills: extra.join(", ") })}</p> : null;
                            })()}
                          </div>
                        ) : (
                          <SkillChips skills={snap.skills} emphasis />
                        )}
                      </div>
                    ) : null}
                    {snap.summary ? (
                      <div>
                        <Label>{t("detail.summary")}</Label>
                        <ExpandableText text={snap.summary} lines={4} moreLabel={t("detail.showMore")} lessLabel={t("detail.showLess")} />
                      </div>
                    ) : null}
                  </div>
                  <div className="grid content-start gap-5">
                    {snap.languages ? (
                      <div>
                        <Label>{t("detail.fields.languages")}</Label>
                        <SkillChips skills={snap.languages} />
                      </div>
                    ) : null}
                    {arrangements ? (
                      <div>
                        <Label>{t("detail.fields.arrangement")}</Label>
                        <SkillChips skills={arrangements} />
                      </div>
                    ) : null}
                    {mobility ? (
                      <div>
                        <Label>{t("disclosure.mobility")}</Label>
                        {mobility.length ? (
                          <ul className="grid gap-1 text-sm">{mobility.map((l) => <li key={l}>{l}</li>)}</ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">—</p>
                        )}
                      </div>
                    ) : null}
                    {snap.full_name || snap.email || snap.phone ? (
                      <div>
                        <Label>{t("detail.contact")}</Label>
                        {snap.full_name ? <p className="mb-2 text-sm font-medium">{snap.full_name}</p> : null}
                        <div className="flex flex-wrap gap-2">
                          {snap.email ? (
                            <Button variant="outline" size="sm" className="max-w-full" asChild>
                              <a href={`mailto:${snap.email}`}><Mail className="size-4" aria-hidden /> <span className="truncate">{snap.email}</span></a>
                            </Button>
                          ) : null}
                          {snap.phone ? (
                            <Button variant="outline" size="sm" asChild>
                              <a href={`tel:${snap.phone.replace(/[^\d+]/g, "")}`}><Phone className="size-4" aria-hidden /> {snap.phone}</a>
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {snap.experience?.length ? (
                  <div className="border-t border-border/60 pt-6">
                    <Label>{t("detail.experience")}</Label>
                    <ol className="grid gap-3">
                      {snap.experience.map((e, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-border" aria-hidden />
                          <div className="min-w-0 text-sm">
                            <p><span className="font-medium">{e.title}</span>{e.company ? <span className="text-muted-foreground"> · {e.company}</span> : null}</p>
                            <p className="text-xs text-muted-foreground">{e.start_date ? f.date(e.start_date) : "?"} – {e.end_date ? f.date(e.end_date) : t("detail.present")}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </>
            )}

            {d.grants.length ? (
              <div className={cn(snap && "border-t border-border/60 pt-6")}>
                <Label>{t("detail.sharedDocuments")}</Label>
                <ul className="grid gap-2 sm:grid-cols-2">{d.grants.map((g) => <GrantDownload key={g.id} orgSlug={orgSlug} grant={g} />)}</ul>
              </div>
            ) : null}

            {d.profile ? (
              <p className="flex items-start gap-2 rounded-2xl bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
                <Eye className="mt-px size-3.5 shrink-0" aria-hidden />
                {t("detail.disclosed", {
                  fields: d.profile.disclosed_fields.map((k) => (isDisclosureKey(k) ? t(`disclosure.${k}`) : k)).join(", "),
                  date: f.date(d.profile.created_at),
                })}
              </p>
            ) : null}
          </Panel>

          {/* Conversation between the two recruiters */}
          <Panel className="p-6">
            <SectionTitle>
              {t("detail.messages")}
              {d.messages.length ? <Count n={d.messages.length} /> : null}
            </SectionTitle>
            {d.messages.length ? (
              <ul className="mb-4 grid gap-3">
                {d.messages.map((m) => {
                  const mine = m.author_side === side;
                  const author = mine ? t("detail.you") : m.author?.full_name || t("detail.partnerRecruiter", { partner });
                  return (
                    <li key={m.id} className={cn("flex max-w-[85%] items-end gap-2", mine && "ml-auto flex-row-reverse")}>
                      {!mine ? <InitialsAvatar name={author} className="size-7 text-[10px]" /> : null}
                      <div className={cn("rounded-2xl px-4 py-2.5 text-sm", mine ? "rounded-br-md bg-foreground text-background" : "rounded-bl-md bg-muted")}>
                        <p className={cn("mb-0.5 text-xs", mine ? "opacity-70" : "text-muted-foreground")}>{author} · {f.relative(m.created_at)}</p>
                        <p className="whitespace-pre-line">{m.body}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mb-4 flex items-center gap-3 rounded-2xl bg-muted/50 px-4 py-5 text-sm text-muted-foreground">
                <MessageSquare className="size-5 shrink-0" aria-hidden /> {t("detail.noMessages")}
              </div>
            )}
            <MessageForm orgSlug={orgSlug} referralId={r.id} />
          </Panel>
        </div>

        <aside className="grid min-w-0 gap-6">
          {/* Fit with the job, frozen at submission */}
          {r.fit_score != null && evidence ? (
            <Panel className="p-6">
              <SectionTitle>{t("detail.fit.title")}</SectionTitle>
              <p className="-mt-2 mb-4 text-xs text-muted-foreground">{t("detail.fit.hint")}</p>
              <div className="grid gap-4 text-sm">
                {evidence.reasons.length ? (
                  <div>
                    <Label>{t("detail.fit.strengths")}</Label>
                    <ul className="grid gap-1.5">
                      {evidence.reasons.map((e, i) => <li key={i} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{evidenceText(e, tg)}</li>)}
                    </ul>
                  </div>
                ) : null}
                <div>
                  <Label>{t("detail.fit.gaps")}</Label>
                  {evidence.gaps.length ? (
                    <ul className="grid gap-1.5">
                      {evidence.gaps.map((e, i) => <li key={i} className="flex gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />{evidenceText(e, tg)}</li>)}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">{t("detail.fit.noGaps")}</p>
                  )}
                </div>
              </div>
            </Panel>
          ) : null}

          {/* Commission split. Hidden on referrals that closed before any agreement existed. */}
          {agreement || !closed ? (
            <Panel className="p-6">
              <SectionTitle
                action={agreement ? (
                  <StatusPill tone={agreement.status === "active" ? "success" : "warning"} icon={Handshake} label={agreement.status === "active" ? t("detail.agreement.confirmed") : t("detail.agreement.awaiting")} className="text-xs" />
                ) : null}
              >
                {t("detail.agreement.title")}
              </SectionTitle>
              {/* Agreements frozen before the internal rule keep their split, so the note only shows when it applies. */}
              {r.internal && (!agreement || agreement.sourcing_bps === 0) ? <p className="mb-3 rounded-2xl bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">{t("detail.agreement.internal")}</p> : null}
              {agreement ? (
                <div className="grid gap-4">
                  <div className="grid grid-cols-3 gap-2">
                    <StatTile label={t("detail.agreement.sourcing")} value={bpsToPercent(agreement.sourcing_bps)} />
                    <StatTile label={t("detail.agreement.jobOwner")} value={bpsToPercent(agreement.job_owner_bps)} />
                    <StatTile label={t("detail.agreement.platform")} value={bpsToPercent(agreement.platform_bps)} />
                  </div>
                  <p className="text-xs text-muted-foreground">{t("detail.agreement.rule", { rule: agreement.rule_name, version: String(agreement.rule_version), terms: agreement.terms_version })}</p>
                  {d.placement ? <Button variant="outline" asChild><Link href={`/workspace/${orgSlug}/wallet/placements/${d.placement.id}`}>{t("detail.agreement.openPlacement")}</Link></Button> : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("detail.agreement.pending")}</p>
              )}
            </Panel>
          ) : null}

          {/* Every status change, newest last */}
          <Panel className="p-6">
            <SectionTitle>{t("detail.timeline")}</SectionTitle>
            <ol className="grid">
              {d.events.map((e, i) => {
                const tone = REFERRAL_STATUS[e.to_status].tone;
                const reason = reasonText(e.reason);
                const last = i === d.events.length - 1;
                return (
                  <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
                    {!last ? <span className="absolute top-4 bottom-0 left-[7px] w-px bg-border" aria-hidden /> : null}
                    <span className={cn("relative mt-1 size-[15px] shrink-0 rounded-full ring-4 ring-card", TONE_DOT[tone])} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{tg(`labels.referralStatus.${e.to_status}`)}</p>
                      <p className="text-xs text-muted-foreground">{who(e.actor_side)} · {f.date(e.created_at)}</p>
                      {reason ? <p className="mt-1.5 rounded-xl bg-muted/60 px-3 py-2 text-sm text-pretty">{reason}</p> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="mt-5 flex items-center gap-2 border-t border-border/60 pt-4 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
              {t("detail.ownership", { date: f.date(r.ownership_protected_until) })}
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
