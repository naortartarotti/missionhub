import Link from "next/link";
import type { ReactNode } from "react";
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
  Info,
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
  RotateCcw,
  Ban,
  CalendarClock,
} from "lucide-react";
import { PIPELINE_STAGES, type PipelineStage } from "@/features/pipeline/stages";
import { getPipelineOwnership } from "@/features/pipeline/queries";
import { getRequestContext } from "@/server/auth/context";
import { getPartnerJobAvailability, listMyConductReports } from "@/features/network-rules/queries";
import { supportEmail } from "@/features/network-rules/page-data";
import { ReportProblemButton, type RightTool } from "@/features/network-rules/components/report-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { getReferralDetail, getReferralHireState, getReferralPresentation, getReferralTerms } from "@/features/referrals/queries";
import { AgreementDialog, ReferralTermsPanel } from "@/features/referrals/components/referral-terms";
import { getClaimContext } from "@/features/referrals/claim-context";
import { ClaimPanel } from "@/features/referrals/components/claim-panel";
import { getHireReports } from "@/features/hire-reports/queries";
import { HireReportDialog } from "@/features/hire-reports/components/hire-report-dialog";
import { HireReportPanel } from "@/features/hire-reports/components/hire-report-panel";
import { AuthCheckPanel } from "@/features/hire-reports/components/auth-check";
import { PriorPresentationClaimDialog } from "@/features/referrals/components/claim-dialog";
import { ReleaseDialog } from "@/features/referrals/components/release-dialogs";
import { GrantDownload, MessageForm, ResendCandidateButton, TransitionButtons } from "@/features/referrals/components/referral-actions";
import { ReportHireDialog } from "@/features/referrals/components/report-hire-dialog";
import { HireResultHost } from "@/features/referrals/components/hire-result";
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
import { REFERRAL_STATUS, commissionRuleLabel, type ARRANGEMENT, type SENIORITY } from "@/lib/labels";
import { bpsToPercent } from "@/lib/money/format";
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

/** A hire recorded without a split (record-only: released, or no confirmed agreement with the flag off). */
const isNoSplit = (rec: { kind: string } | null) => rec?.kind === "no_split";

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
  // N10 (BR-34): referral pages stay open in settlement mode for in-flight / open-obligation referrals.
  const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
  const [t, tg, f, tp, tc] = await Promise.all([getT("referrals"), getGlobalT(), getFormatter(), getT("pipeline"), getT("candidate")]);
  const [d, pres, terms, hire, hireReports] = await Promise.all([
    getReferralDetail(ctx, referralId),
    getReferralPresentation(ctx, referralId),
    getReferralTerms(ctx, referralId),
    getReferralHireState(ctx, referralId),
    getHireReports(ctx, referralId),
  ]);
  if (!d && ctx.settlementMode) {
    // S22-d (PD-058 item 9): a referral that left the settlement scope is "closed", not a not-found.
    const tn = await getT("network");
    return (
      <div className="mx-auto grid max-w-2xl gap-6 py-10">
        <EmptyState
          icon={CircleAlert}
          title={tn("settlement.referralClosedTitle")}
          description={tn("settlement.referralClosedDescription")}
          action={<Button asChild className="min-h-11"><Link href={`/workspace/${orgSlug}/referrals`}>{tn("settlement.goReferrals")}</Link></Button>}
        />
      </div>
    );
  }
  if (!d) notFound();
  // N3 (backend.md §3.2): side-shaped hire state. B's payload is identical with and without a release (AC-27).
  const targetHire = hire?.side === "target" ? hire : null;
  const sourceHire = hire?.side === "source" ? hire : null;
  const hireRecord = hire?.hire_record ?? null;
  const noSplit = isNoSplit(hireRecord);
  const voided = hire?.ownership === "void";
  // E1: Record hire shows when the server says B may record, and also while B's own objection is open (V0, BR-45).
  // Recording waives the pipeline-owner rule for the hired move only (PD-077), so it isn't hidden by the lock.
  const showRecord = !!targetHire && !voided && (targetHire.can_record || targetHire.variant === "objection_open");
  // S4-b (BR-17): Report a hire on A's side when the client-visible filing conditions hold (`can_report`).
  const showReport = !!sourceHire?.can_report && !voided;
  // S4-g (BR-37): A's evidence panel while a check with an evidence request is open, or after sending until decided.
  const authCheck = sourceHire?.auth_check && sourceHire.auth_check.status === "open" && (sourceHire.auth_check.evidence_due_at || sourceHire.auth_check.evidence_at) ? sourceHire.auth_check : null;
  const { referral: r, side, agreement } = d;
  // N1 presentation state, side-specific (the hiring side never receives the release flag, BR-25).
  const source = pres?.side === "source" ? pres : null;
  const target = pres?.side === "target" ? pres : null;
  const claim = pres?.claim ?? null;
  const claimCtx = await getClaimContext(ctx, r, pres);
  const canRelease = Boolean(source?.can_release);
  // Candidate-confirmed referrals: delivery status of the private link (sourcing side only, via RLS).
  const { data: request } =
    side === "source"
      ? await ctx.db
          .from("referral_candidate_requests")
          .select("destination, expires_at, sent_at, token_issued_at, last_attempt_at, viewed_at, confirmed_at, profile_changes")
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
      ? await ctx.db.from("jobs").select("required_skills, preferred_skills").eq("id", r.job_id).maybeSingle()
      : { data: null };

  const statusLabel = tg(`labels.referralStatus.${r.status}`);
  const closed = CLOSED_STATUSES.has(r.status);
  const lastEvent = d.events.at(-1);
  // `claim_rejected` is a system code on the admin's "back to review" event; its banner explains it.
  // N10 RD-047: an admin's stale close names the termination only to the terminated org's own side.
  const staleText = ctx.settlementKind === "terminated" ? t("detail.closedStaleOwn") : t("detail.closedStalePartner");
  const reasonText = (reason: string | null | undefined) =>
    reason === "closed_stale_by_admin"
      ? staleText
      : reason && reason !== "claim_rejected" ? (isDeclineReason(reason) ? t(`declineReasons.${reason}`) : t("detail.reasonQuote", { reason })) : null;
  // `actor_kind` names who recorded an event; legacy rows without it: no side meant the candidate.
  const who = (actorSide: string | null, actorKind?: string | null) =>
    actorKind === "admin"
      ? t("detail.adminActor")
      : actorKind === "system"
      ? t("detail.systemActor")
      : actorKind === "candidate" || actorSide === null
        ? t("detail.candidateActor")
        : actorSide === side
          ? t("detail.you")
          : partner;
  const legacyHint = (reason: string | null | undefined) => (reason === "duplicate" ? t("detail.legacyDuplicateHint") : null);
  const inReview = ["submitted", "under_review", "info_requested"].includes(r.status);

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
  const ownerActions = !lockedToOwner && (awaiting || d.transitions.length > 0 || (side === "source" && agreement?.status === "pending_source") || canRelease || !!claimCtx);
  const hasActions = ownerActions || showRecord || showReport;
  // N9: a rotated request whose issuance or email failed keeps the old `sent_at` but has no live link
  // (`token_issued_at` null), so it counts as "not sent yet" with Resend as the primary action.
  const requestNotSent = !!request && (!request.sent_at || !request.token_issued_at);
  const awaitingBody = () => {
    if (!request) return null;
    const email = request.destination;
    if (isPast(request.expires_at)) return t("detail.next.awaitingExpired", { email, date: f.date(request.expires_at) });
    if (requestNotSent || !request.sent_at) return t("detail.next.awaitingNotSent", { email });
    const sent = t("detail.next.awaitingSent", { email, time: f.relative(request.sent_at), date: f.date(request.expires_at), partner });
    return request.viewed_at ? `${sent} ${t("detail.next.awaitingViewed", { time: f.relative(request.viewed_at) })}` : sent;
  };
  const next: { tone: Tone; icon: LucideIcon; title: string; body: string | null; hint?: string | null } = awaiting
    ? { tone: "warning", icon: Mail, title: t("detail.next.awaitingCandidate"), body: awaitingBody() }
    : voided
    ? // S4-f (BR-37): every N3 action is hidden; only the sourcing side learns the reason (PD-075).
      { tone: "neutral", icon: Ban, title: t("detail.next.void"), body: side === "source" ? t("detail.next.voidSource") : null }
    : r.status === "hired" && noSplit && hireRecord
    ? // S4-e: hired without a split (record-only: released, or no confirmed agreement with the flag off).
      side === "target"
      ? { tone: "success", icon: Trophy, title: t("detail.next.hiredNoSplit"), body: hireRecord.no_split_reason === "released" ? t("detail.next.hiredNoSplitTargetReleased") : t("detail.next.hiredNoSplitTargetNoAgreement") }
      : {
          tone: "success",
          icon: Trophy,
          title: t("detail.next.hiredNoSplit"),
          body: t("detail.next.hiredNoSplitSource", { partner, date: f.date(hireRecord.recorded_at) }),
          hint: hireRecord.no_split_reason === "no_agreement" ? t("detail.next.hiredNoSplitSourceRule") : null,
        }
    : r.status === "already_presented"
    ? { tone: "neutral", icon: Info, title: t("detail.next.alreadyPresented"), body: t("detail.next.alreadyPresentedBody", { partner }) }
    : side === "source" && r.status === "declined" && r.decline_reason === "prior_presentation"
    ? {
        tone: st.tone,
        icon: X,
        title: t("detail.next.claimFiledSource", { partner }),
        body: claim?.status === "open" ? t("detail.next.claimFiledSourceBody", { partner, when: f.etDateTime(claim.contest_deadline_at) }) : null,
      }
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
          hint: legacyHint(lastEvent?.reason),
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

  // ---- S12 ownership footer (BR-35, spec §2.12), from get_referral_hire_state.ownership. The hiring side never
  // learns of a release: its payload has no `released`, so its line is the same either way (AC-76).
  const ownershipLine = ((): { text: string; filing?: boolean } | null => {
    if (!hire) return null;
    if (side === "source" && r.status === "already_presented") return { text: t("detail.ownershipNotDelivered") };
    switch (hire.ownership) {
      case "released":
        return sourceHire?.released_at ? { text: t("detail.ownershipReleased", { date: f.date(sourceHire.released_at) }) } : null;
      case "ended":
        return { text: t("detail.ownershipEnded") };
      case "void":
        return { text: t("detail.ownershipVoid") };
      case "not_delivered":
        // N2 BR-19: no date before delivery; B shows no line.
        return side === "source" ? { text: t("detail.ownershipStartsAtDelivery", { count: terms?.recorded ? terms.effective.ownership_months : 12 }) } : null;
      case "protected":
        if (!hire.protected_until) return null;
        return { text: side === "source" ? t("detail.protectedUntil", { date: f.date(hire.protected_until) }) : t("detail.protectedUnlessReleased", { date: f.date(hire.protected_until) }) };
      case "closed": {
        // Window ended, not in progress: A sees its filing limit (BR-6), B sees nothing.
        if (!sourceHire?.report_until || !sourceHire.report_tail_until) return null;
        if (!isPast(sourceHire.report_until)) return { filing: true, text: t("hireReport.limit", { date: f.date(sourceHire.report_until) }) };
        if (!isPast(sourceHire.report_tail_until)) return { filing: true, text: t("hireReport.limitTail", { date: f.date(sourceHire.report_tail_until), windowEnd: f.date(sourceHire.window_end ?? sourceHire.report_until) }) };
        return { filing: true, text: t("hireReport.limitClosed", { date: f.date(sourceHire.report_tail_until) }) };
      }
      default:
        return null;
    }
  })();

  // N10 report entry point (S7): every status, both sides, held org and settlement mode; never on
  // internal referrals or for platform admins (they open admin cases, §2.8). Reporter-only line after filing.
  const canReport = !r.internal && !ctx.user.isPlatformAdmin;
  const [myReports, partnerJob] = await Promise.all([
    canReport ? listMyConductReports(ctx, "mine", r.id).catch(() => []) : Promise.resolve([]),
    // RD-048: the "no longer part of" line on the partner's closed referral with a terminated, settled job owner.
    side === "source" && closed ? getPartnerJobAvailability(ctx, { jobId: r.job_id }).catch(() => null) : Promise.resolve(null),
  ]);
  const myReport = myReports.find((x) => x.is_mine) ?? null;
  const sourceClaim = source?.claim as { can_contest?: boolean } | null | undefined;
  const rightTool: RightTool = {
    position: side === "target" ? (claimCtx ? { label: "file", href: "#referral-actions" } : "text") : sourceClaim?.can_contest ? { label: "contest", href: "#referral-actions" } : "text",
    // N3 §2.5: the hire line links Report a hire when the button would show; otherwise plain text.
    hire: side === "source" ? (showReport ? { href: `/workspace/${orgSlug}/referrals/${r.id}?reportHire=1`, label: t("hireReport.trigger") } : { text: t("hireReport.rightToolUnavailable", { org: partner }) }) : false,
    amount: d.placement ? { href: `/workspace/${orgSlug}/commissions/${d.placement.id}` } : "text",
    noAnswer: side,
  };
  const tn = await getT("network");

  return (
    // One shrinkable track: the sticky header's truncated title and the action bar can't widen the page at 375px (AC-62).
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {/* QA-N3-04: the record-only result state, outside anything the hire re-renders away. */}
      {side === "target" ? <HireResultHost /> : null}
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
        actions={
          <>
            <StatusPill tone={st.tone} icon={r.status === "already_presented" ? Info : undefined} label={statusLabel} />
            {canReport ? <ReportProblemButton orgSlug={orgSlug} target={{ referralId: r.id }} orgName={partner} rightTool={rightTool} supportEmail={supportEmail()} /> : null}
          </>
        }
      />
      {myReport ? (
        <p className="-mt-3 text-sm text-muted-foreground">
          {tn("report.youReported", { date: f.etDate(myReport.created_at) })}{" "}
          <Link href={`/workspace/${orgSlug}/reports/${myReport.id}`} className="font-medium text-foreground underline underline-offset-4">{tn("report.youReportedLink")}</Link>
        </p>
      ) : null}
      {partnerJob?.status === "no_longer_member" ? <p className="-mt-3 text-sm text-muted-foreground">{tn("partner.noLongerMember", { org: partnerJob.org_name })}</p> : null}
      {sp.submitted ? <Flash message={t("detail.submittedFlash", { partner })} /> : null}
      {sp.awaiting && request ? <Flash message={t("detail.awaitingFlash", { email: request.destination, partner })} /> : null}
      {sp.notSent ? (
        <div role="alert" className="flex items-start gap-2 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {t("detail.awaitingNotSentFlash")}
        </div>
      ) : null}
      {/* BR-38 (S4-i): the sourcing side only; never the hiring side. */}
      {sourceHire?.record_created_at ? (
        <p className="flex items-start gap-2 rounded-2xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {t("detail.recordCreated", { date: f.date(sourceHire.record_created_at) })}
        </p>
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

      {r.claim_rejected_at && inReview ? (
        <div role="status" className="flex items-start gap-2 rounded-2xl bg-info-soft px-4 py-3 text-sm">
          <RotateCcw className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          <span>
            {side === "target"
              ? t("detail.claimRejected.target", { date: f.date(r.claim_rejected_at) })
              : t("detail.claimRejected.source", { date: f.date(r.claim_rejected_at), partner })}
          </span>
        </div>
      ) : null}

      {/* Where it stands + what happens next */}
      <section className="grid gap-3">
        <Panel className="p-6">
          <ol className="grid grid-cols-5 gap-2" aria-label={t("sent.progress", { step: current + 1, total: REFERRAL_STAGES.length })}>
            {REFERRAL_STAGES.map((s, i) => {
              // QA-N3-08: a hire recorded from any status (N3 BR-7) only ticks the stages the referral really
              // reached; a declined → hired referral doesn't show Under review / Interviewing / Offer as done.
              const skipped = r.status === "hired" && i > 0 && i < current && !reachedAt.has(i);
              const done = !skipped && (i < current || (i === current && (r.status === "hired" || !closed)));
              const stopped = closed && i === current;
              // "Already presented" isn't anyone's error: a neutral stopped marker (S2-b).
              const neutralStop = stopped && r.status === "already_presented";
              const isCurrent = i === current && !closed && r.status !== "hired";
              return (
                <li key={s} className="min-w-0" aria-current={i === current ? "step" : undefined}>
                  <div className={cn("h-1.5 rounded-full", neutralStop ? "bg-muted-foreground/60" : stopped ? "bg-danger" : done ? "bg-foreground" : "bg-border")} />
                  <div className="mt-3 flex items-center gap-1.5">
                    {neutralStop ? (
                      <span className="grid size-4 shrink-0 place-items-center rounded-full bg-muted-foreground/70 text-white dark:text-black" aria-hidden><Info className="size-2.5" strokeWidth={3} /></span>
                    ) : stopped ? (
                      <span className="grid size-4 shrink-0 place-items-center rounded-full bg-danger text-white dark:text-black" aria-hidden><X className="size-2.5" strokeWidth={3} /></span>
                    ) : done && !isCurrent ? (
                      <span className="grid size-4 shrink-0 place-items-center rounded-full bg-foreground text-background" aria-hidden><Check className="size-2.5" strokeWidth={3} /></span>
                    ) : (
                      <span className={cn("size-4 shrink-0 rounded-full border-2", isCurrent ? "border-foreground" : "border-border")} aria-hidden />
                    )}
                    <p className={cn("truncate text-xs sm:text-sm", i <= current && !skipped ? "font-medium" : "text-muted-foreground")}>
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

        <div id="referral-actions" className="flex scroll-mt-28 flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-border/60 bg-card px-4 py-3">
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", TONE_SOFT[next.tone])} aria-hidden>
            <next.icon className="size-4" />
          </span>
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">{next.title}</span>
            {next.body ? <span className="text-muted-foreground"> · {next.body}</span> : null}
            {next.hint ? <span className="mt-1 block text-xs text-muted-foreground">{next.hint}</span> : null}
          </p>
          {hasActions ? (
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              {ownerActions && side === "source" && agreement?.status === "pending_source" ? <AgreementDialog orgSlug={orgSlug} referralId={r.id} terms={terms} agreement={agreement} /> : null}
              {ownerActions && awaiting ? <ResendCandidateButton orgSlug={orgSlug} referralId={r.id} primary={!request || requestNotSent || isPast(request.expires_at)} /> : null}
              {ownerActions ? <TransitionButtons
                orgSlug={orgSlug}
                referralId={r.id}
                version={r.version}
                transitions={d.transitions}
                side={side}
                status={r.status}
                withdraw={source ? { canRelease: source.can_release_on_withdraw, counts: source.counts, partner, ownershipUntil: r.ownership_protected_until ?? "" } : undefined}
                afterNegative={claimCtx ? <PriorPresentationClaimDialog orgSlug={orgSlug} ctx={claimCtx} /> : null}
              /> : null}
              {ownerActions && canRelease ? <ReleaseDialog orgSlug={orgSlug} referralId={r.id} partner={partner} ownershipUntil={r.ownership_protected_until ?? ""} /> : null}
              {showRecord && targetHire ? (
                <ReportHireDialog orgSlug={orgSlug} referralId={r.id} hire={targetHire} terms={terms} partner={partner} defaultCurrency={ctx.currency} />
              ) : null}
              {showReport && sourceHire ? (
                <HireReportDialog
                  key={sp.reportHire ? "open" : "closed"}
                  orgSlug={orgSlug}
                  referralId={r.id}
                  partner={partner}
                  deliveredAt={sourceHire.delivered_at}
                  tail={!!sourceHire.report_tail}
                  windowEnd={sourceHire.window_end}
                  defaultOpen={!!sp.reportHire}
                />
              ) : null}
            </div>
          ) : null}
          {/* S4-b: A's filing limit under the action bar (BR-6). */}
          {showReport && sourceHire?.report_until ? (
            <p className="flex w-full items-start gap-2 text-xs text-pretty text-muted-foreground">
              <CalendarClock className="mt-px size-3.5 shrink-0" aria-hidden />
              {sourceHire.report_tail && sourceHire.report_tail_until
                ? t("hireReport.limitTail", { date: f.date(sourceHire.report_tail_until), windowEnd: f.date(sourceHire.window_end) })
                : t("hireReport.limit", { date: f.date(sourceHire.report_until) })}
            </p>
          ) : null}
          {lockedToOwner ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Lock className="size-4 shrink-0" aria-hidden />
              {ownership.name ? tp("ownedBy", { name: ownership.name }) : tp("ownerOnlyUnknown")}
            </p>
          ) : null}
          {side === "target" && !ctx.settlementMode && PIPELINE_STAGES.includes(r.status as PipelineStage) ? (
            <Button variant="ghost" asChild>
              <Link href={`/workspace/${orgSlug}/referrals?tab=pipeline&job=${r.job_id}`}>
                <KanbanSquare className="size-4" aria-hidden />
                {tp("viewInPipeline")}
              </Link>
            </Button>
          ) : null}
        </div>
        {claim && source ? <ClaimPanel side="source" claim={source.claim!} orgSlug={orgSlug} referralId={r.id} partner={partner} /> : null}
        {claim && target ? <ClaimPanel side="target" claim={target.claim!} orgSlug={orgSlug} referralId={r.id} partner={partner} authCheckRequestedAt={targetHire?.auth_check_requested_at ?? null} /> : null}
        {authCheck ? <AuthCheckPanel orgSlug={orgSlug} referralId={r.id} check={authCheck} /> : null}
        {/* S4-c: the hire report panel, after a closed objection when both exist. */}
        {hireReports?.length ? (
          <HireReportPanel
            reports={hireReports}
            side={side}
            orgSlug={orgSlug}
            referralId={r.id}
            partner={partner}
            ownOrg={(side === "source" ? r.source_org?.name : r.target_org?.name) ?? ""}
            windowEnd={sourceHire?.window_end ?? hire?.protected_until ?? null}
            confirm={targetHire && targetHire.can_record ? { hire: targetHire, terms, defaultCurrency: ctx.currency } : null}
          />
        ) : null}
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
          {/* The profile the partner approved */}
          <Panel className="grid gap-6 p-6">
            <SectionTitle
              action={side === "source" && d.candidateId && !ctx.settlementMode ? (
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

        <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
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

          {/* N2 (S6): the terms this referral was sent under, both sides (BR-36, BR-37). */}
          {terms ? (
            <ReferralTermsPanel
              terms={terms}
              side={side}
              noSplit={noSplit}
              placement={d.placement && d.placement.contracted_fee_minor !== null && d.placement.currency ? { href: `/workspace/${orgSlug}/commissions/${d.placement.id}`, currency: d.placement.currency, invoicedMinor: d.placement.contracted_fee_minor, computedMinor: d.placement.computed_fee_minor } : null}
            />
          ) : null}

          {/* Commission split. Hidden on referrals that closed before any agreement existed. */}
          {agreement || !closed ? (
            <Panel className="p-6">
              <SectionTitle
                action={agreement ? (
                  // N3 BR-9: an agreement created from the snapshot at hire time shows the deemed pill instead.
                  <StatusPill
                    tone={agreement.status === "active" ? "success" : "warning"}
                    icon={Handshake}
                    label={hire?.agreement?.origin === "deemed" ? t("detail.agreement.deemed") : agreement.status === "active" ? t("detail.agreement.confirmed") : t("detail.agreement.awaiting")}
                    className="text-xs"
                    wrap
                  />
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
                  <p className="text-xs text-muted-foreground">{t("detail.agreement.rule", { rule: commissionRuleLabel(agreement.rule_name, tg), version: String(agreement.rule_version), terms: agreement.terms_version })}</p>
                  {hire?.agreement?.origin === "deemed" && hire.agreement.deemed_at ? <p className="text-sm text-pretty text-muted-foreground">{t("detail.agreement.deemedLine", { date: f.date(hire.agreement.deemed_at) })}</p> : null}
                  {d.placement ? <Button variant="outline" asChild><Link href={`/workspace/${orgSlug}/commissions/${d.placement.id}`}>{t("detail.agreement.openPlacement")}</Link></Button> : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{noSplit ? t("detail.agreement.none") : terms?.recorded ? t("detail.agreement.pendingSnapshot") : t("detail.agreement.pending")}</p>
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
                      <p className="text-xs text-muted-foreground">{who(e.actor_side, e.actor_kind)} · {f.date(e.created_at)}</p>
                      {reason ? <p className="mt-1.5 rounded-xl bg-muted/60 px-3 py-2 text-sm text-pretty">{reason}</p> : null}
                      {legacyHint(e.reason) ? <p className="mt-1 text-xs text-muted-foreground">{legacyHint(e.reason)}</p> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
            {ownershipLine ? (
              <p className="mt-5 flex items-start gap-2 border-t border-border/60 pt-4 text-xs text-pretty text-muted-foreground">
                {ownershipLine.filing ? <CalendarClock className="mt-px size-3.5 shrink-0" aria-hidden /> : <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden />}
                {ownershipLine.text}
              </p>
            ) : null}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
