"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Bookmark, BookmarkCheck, Building2, CheckCircle2, CircleAlert, Info, Lock, MapPin, RotateCcw, ThumbsDown, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { StatusPill } from "@/components/shared/status-pill";
import { StatTile } from "@/components/shared/stat-tile";
import { SkillChips } from "@/components/shared/skill-chips";
import { Disclosure } from "@/components/shared/disclosure";
import { BAND, type REFERRAL_STATUS, type ARRANGEMENT, type CONTRACT, type SENIORITY } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { setMatchTriage } from "../actions";
import { DISMISS_REASONS, isSubmitted, type DismissReason, type TriageState } from "../triage";
import { ScoreRing } from "./score-ring";
import { useFormatter, useGlobalT, useT } from "@/i18n/client";
import { evidenceText, type StoredEvidence } from "../evidence";

type Evidence = StoredEvidence;
export type OpportunityView = {
  match_id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_headline: string | null;
  job_id: string;
  job_title: string;
  job_org_name: string;
  client_label: string;
  seniority: keyof typeof SENIORITY | null;
  work_arrangement: keyof typeof ARRANGEMENT;
  contract_type: keyof typeof CONTRACT;
  location: string | null;
  description: string | null;
  required_skills: string[];
  preferred_skills: string[];
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  expected_fee_minor: number | null;
  fee_currency: string | null;
  your_share_minor: number | null;
  score: number;
  band: keyof typeof BAND;
  reasons: Evidence[];
  gaps: Evidence[];
  blockers: Evidence[];
  model_version: string;
  refreshed_at: string;
  matched_at: string;
  job_posted_at: string;
  referral_id: string | null;
  referral_status: keyof typeof REFERRAL_STATUS | null;
  triage_state: TriageState;
  dismiss_reason: DismissReason | null;
  is_new: boolean;
};


/** "~$8,400 for you" — the sourcing recruiter's estimated share of the placement fee. */
export function ShareChip({ opp, className }: { opp: Pick<OpportunityView, "your_share_minor" | "fee_currency">; className?: string }) {
  const t = useT("opportunities");
  const f = useFormatter();
  if (!opp.your_share_minor) return null;
  return (
    <span className={cn("inline-flex items-center rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success tabular-nums", className)} title={t("share.title")}>
      {t("share.chip", { amount: f.money(opp.your_share_minor, opp.fee_currency ?? "CAD", { whole: true }) })}
    </span>
  );
}

export function NewDot() {
  const t = useT("opportunities");
  return <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-background">{t("card.new")}</span>;
}

function EvidenceList({ items, icon: Icon, className, empty }: { items: Evidence[]; icon: typeof CheckCircle2; className: string; empty: string }) {
  const tg = useGlobalT();
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="grid gap-2">
      {items.map((e, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} aria-hidden />
          <span>{evidenceText(e, tg)}</span>
        </li>
      ))}
    </ul>
  );
}

// --- Skill chips -------------------------------------------------------------------------------
// The engine reports skill overlap as evidence ("Missing required skills: a, b"). Read it back so the
// panel can show chips instead of sentences. Works for keyed (v2) and English-only (v1) rows.
const SKILL_KEYS = new Set(["requiredSkillsMatched", "requiredSkillsMissing", "preferredSkills"]);
const SKILL_PREFIXES: Record<string, string> = {
  requiredSkillsMatched: "Matches required skills: ",
  requiredSkillsMissing: "Missing required skills: ",
  preferredSkills: "Also has: ",
};
function skillsFrom(items: StoredEvidence[], key: string): Set<string> {
  const e = items.find((x) => x.key === key || (!x.key && x.label.startsWith(SKILL_PREFIXES[key])));
  if (!e) return new Set();
  const raw = e.vars?.skills !== undefined ? String(e.vars.skills) : e.label.slice(SKILL_PREFIXES[key].length);
  return new Set(raw.replace(/\s\+\d+ more$/, "").split(", ").filter(Boolean));
}
const isSkillEvidence = (e: StoredEvidence) =>
  (e.key ? SKILL_KEYS.has(e.key) : Object.values(SKILL_PREFIXES).some((p) => e.label.startsWith(p)));

/** Full explanation of one match. Rendered in the split-view panel, or in a sheet where there's no panel. */
function MatchDetail({ opp, orgSlug, headerAction, inPanel = false }: { opp: OpportunityView; orgSlug: string; headerAction?: React.ReactNode; inPanel?: boolean }) {
  const t = useT("opportunities");
  const tg = useGlobalT();
  const f = useFormatter();
  const submitted = isSubmitted(opp);
  const canAct = !submitted && opp.band !== "not_eligible";
  const currency = opp.fee_currency ?? "CAD";
  const salary =
    opp.salary_min !== null || opp.salary_max !== null
      ? `${f.money(opp.salary_min, opp.salary_currency ?? "CAD", { whole: true })} – ${f.money(opp.salary_max, opp.salary_currency ?? "CAD", { whole: true })}`
      : tg("common.notShared");

  const missingRequired = skillsFrom(opp.gaps, "requiredSkillsMissing");
  const hasRequired = new Set(opp.required_skills.filter((s) => !missingRequired.has(s)));
  const hasPreferred = skillsFrom(opp.reasons, "preferredSkills");
  const strengths = opp.reasons.filter((e) => !isSkillEvidence(e));
  const gaps = opp.gaps.filter((e) => !isSkillEvidence(e));
  const bandDot = opp.band === "strong" ? "bg-success" : opp.band === "potential" ? "bg-amber-500" : "bg-danger";

  return (
    // grid-cols-1 = minmax(0, 1fr): truncated lines must not widen the panel.
    <div className={cn("grid grid-cols-1 gap-6", !(canAct || (submitted && opp.referral_id)) && "pb-6 lg:pb-7")}>
      {/* Header: score + role, one line of context, who it's for */}
      <header className="flex items-start gap-4">
        <ScoreRing score={opp.score} className="size-16 [&_span]:text-base" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold leading-tight tracking-tight">{opp.job_title}</h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">{opp.job_org_name} · {opp.client_label}</p>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <span className={cn("size-2 rounded-full", bandDot)} aria-hidden />
              {tg(`labels.band.${opp.band}`)}
              <span className="inline-flex cursor-help text-muted-foreground" title={t("panel.scoreInfo", { time: f.relative(opp.refreshed_at) })} aria-label={t("panel.scoreInfo", { time: f.relative(opp.refreshed_at) })}>
                <Info className="size-3.5" aria-hidden />
              </span>
            </span>
            <span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
              <User className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{opp.candidate_name}</span>
            </span>
          </p>
        </div>
        {headerAction}
      </header>

      {/* Key numbers */}
      <div className="grid grid-cols-3 gap-2">
        <StatTile label={t("panel.share")} value={opp.your_share_minor ? f.money(opp.your_share_minor, currency, { whole: true }) : "—"} tone={opp.your_share_minor ? "success" : undefined} />
        <StatTile label={t("panel.fee")} value={opp.expected_fee_minor ? f.money(opp.expected_fee_minor, currency, { whole: true }) : "—"} />
        <StatTile label={t("panel.posted")} value={f.relative(opp.job_posted_at)} />
      </div>

      {/* Skills */}
      <section className="grid gap-2.5">
        <h3 className="text-sm font-semibold">{t("panel.skills")}</h3>
        <SkillChips skills={opp.required_skills} has={hasRequired} missing={missingRequired} />
        {opp.preferred_skills.length ? (
          <>
            <h4 className="mt-1 text-xs font-medium text-muted-foreground">{t("panel.niceToHave")}</h4>
            <SkillChips skills={opp.preferred_skills} has={hasPreferred} missing={new Set()} />
          </>
        ) : null}
      </section>

      {/* Fit */}
      {strengths.length || gaps.length || opp.blockers.length ? (
        <section className="grid gap-5">
          {strengths.length ? (
            <div className="grid content-start gap-2">
              <h3 className="text-sm font-semibold">{t("panel.strengths")}</h3>
              <EvidenceList items={strengths} icon={CheckCircle2} className="text-success" empty="" />
            </div>
          ) : null}
          <div className="grid content-start gap-2">
            <h3 className="text-sm font-semibold">{t("panel.gaps")}</h3>
            <EvidenceList items={[...opp.blockers, ...gaps]} icon={CircleAlert} className="text-amber-500" empty={t("panel.noGaps")} />
          </div>
        </section>
      ) : null}

      {/* Role details */}
      <section className="grid gap-3">
        <h3 className="text-sm font-semibold">{t("panel.details")}</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div><dt className="text-xs text-muted-foreground">{t("sheet.seniority")}</dt><dd className="mt-0.5 font-medium">{opp.seniority ? tg(`labels.seniority.${opp.seniority}`) : "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{t("sheet.contract")}</dt><dd className="mt-0.5 font-medium">{tg(`labels.contract.${opp.contract_type}`)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{t("panel.workSetup")}</dt><dd className="mt-0.5 font-medium">{tg(`labels.arrangement.${opp.work_arrangement}`)}{opp.location ? ` · ${opp.location}` : ""}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{t("sheet.compensation")}</dt><dd className="mt-0.5 font-medium">{salary}</dd></div>
        </dl>
        {opp.description ? (
          <Disclosure summary={t("panel.description")}>{opp.description}</Disclosure>
        ) : (
          <p className="text-xs text-muted-foreground">{t("sheet.descriptionHidden")}</p>
        )}
      </section>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3.5 shrink-0" aria-hidden />
        {t("panel.private")}
      </p>

      {/* Sticky actions */}
      {canAct || (submitted && opp.referral_id) ? (
        <div className={cn("sticky bottom-0 flex items-center gap-2 border-t border-border/60 bg-card py-4", inPanel ? "-mx-6 px-6 lg:-mx-7 lg:px-7" : "-mx-6 px-6")}>
          {canAct ? <TriageActions opp={opp} orgSlug={orgSlug} compact /> : null}
          {canAct && opp.triage_state !== "dismissed" ? (
            <Button className="ml-auto flex-1" asChild>
              <Link href={`/w/${orgSlug}/opportunities/${opp.match_id}`}>{t("card.reviewSubmit")} <ArrowRight className="size-4" aria-hidden /></Link>
            </Button>
          ) : null}
          {submitted && opp.referral_id ? (
            <Button variant="outline" className="flex-1" asChild>
              <Link href={`/w/${orgSlug}/referrals/${opp.referral_id}`}>{tg(`labels.referralStatus.${opp.referral_status!}`)}</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MatchSheet({ opp, orgSlug, triggerVariant }: { opp: OpportunityView; orgSlug: string; triggerVariant: "ghost" | "outline" }) {
  const t = useT("opportunities");
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant={triggerVariant} size="sm">{t("sheet.trigger")}</Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto px-6 pt-6 sm:max-w-lg">
        <SheetHeader className="sr-only">
          <SheetTitle>{opp.job_title}</SheetTitle>
          <SheetDescription>{t("sheet.description", { client: opp.client_label, org: opp.job_org_name, candidate: opp.candidate_name })}</SheetDescription>
        </SheetHeader>
        <MatchDetail opp={opp} orgSlug={orgSlug} />
      </SheetContent>
    </Sheet>
  );
}

/**
 * Split-view detail panel: sits beside the list (not over it) on large screens, full screen on
 * small ones. The open match lives in the URL (`?match=`), so it survives reloads and can be shared.
 */
export function MatchPanel({ opp, orgSlug, closeHref }: { opp: OpportunityView; orgSlug: string; closeHref: string }) {
  const t = useT("opportunities");
  const router = useRouter();
  const ref = useRef<HTMLElement>(null);
  const [closing, setClosing] = useState(false);
  const close = useCallback(() => {
    // Play the exit animation, then drop `?match=` (the list column then widens back smoothly).
    setClosing(true);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => router.replace(closeHref, { scroll: false }), reduced ? 0 : 200);
  }, [closeHref, router]);
  useEffect(() => {
    ref.current?.scrollTo({ top: 0, behavior: "smooth" });
    ref.current?.focus({ preventScroll: true });
  }, [opp.match_id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-label={t("sheet.trigger")}
      data-state={closing ? "closing" : "open"}
      className="match-panel fixed inset-2 z-40 overflow-y-auto rounded-[2rem] border border-border/60 bg-card px-6 pt-6 shadow-xl outline-none lg:static lg:inset-auto lg:z-auto lg:max-h-[calc(100dvh_-_var(--page-header-h,5.5rem)_-_2.5rem)] lg:w-[28.25rem] lg:shadow-sm lg:px-7 lg:pt-7"
    >
      {/* Keyed so switching matches cross-fades the content instead of replaying the whole entrance. */}
      <div key={opp.match_id} className="match-panel-content">
        <MatchDetail
          opp={opp}
          orgSlug={orgSlug}
          inPanel
          headerAction={
            <Button variant="outline" size="icon" className="shrink-0" onClick={close} aria-label={t("panel.close")}>
              <X className="size-4" aria-hidden />
            </Button>
          }
        />
      </div>
    </aside>
  );
}

/** Save / Not a fit / Restore. Private to your organization; the hiring recruiter never sees it. */
export function TriageActions({ opp, orgSlug, compact = false }: { opp: OpportunityView; orgSlug: string; /** Icon-only buttons (labels in tooltip + aria-label). */ compact?: boolean }) {
  const t = useT("opportunities");
  const tg = useGlobalT();
  const [pending, start] = useTransition();
  const first = opp.candidate_name.split(" ")[0];
  const run = (state: TriageState, reason: DismissReason | null, message: string) =>
    start(async () => {
      const r = await setMatchTriage(orgSlug, { matchId: opp.match_id, state, reason });
      if (!r.ok) toast.error(r.error);
      else
        toast.success(message, {
          action: state !== opp.triage_state ? { label: tg("common.actions.undo"), onClick: () => void setMatchTriage(orgSlug, { matchId: opp.match_id, state: opp.triage_state, reason: opp.dismiss_reason }) } : undefined,
        });
    });

  if (opp.triage_state === "dismissed") {
    return (
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(null, null, t("triage.restored"))} className="relative z-10">
        <RotateCcw className="size-4" aria-hidden /> {t("triage.restore")}
      </Button>
    );
  }
  return (
    <>
      {opp.triage_state === "saved" ? (
        <Button variant="ghost" size={compact ? "icon" : "sm"} disabled={pending} onClick={() => run(null, null, t("triage.unsaved"))} aria-label={t("triage.unsaveAria", { name: first, job: opp.job_title })} title={compact ? t("triage.saved") : undefined} className="relative z-10">
          <BookmarkCheck className="size-4 fill-current" aria-hidden /> {compact ? null : t("triage.saved")}
        </Button>
      ) : (
        <Button variant="ghost" size={compact ? "icon" : "sm"} disabled={pending} onClick={() => run("saved", null, t("triage.savedToast", { name: first }))} aria-label={t("triage.saveAria", { name: first, job: opp.job_title })} title={compact ? t("triage.save") : undefined} className="relative z-10">
          <Bookmark className="size-4" aria-hidden /> {compact ? null : t("triage.save")}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size={compact ? "icon" : "sm"} disabled={pending} aria-label={t("triage.notFitAria", { name: first, job: opp.job_title })} title={compact ? t("triage.notFit") : undefined} className="relative z-10">
            <ThumbsDown className="size-4" aria-hidden /> {compact ? null : t("triage.notFit")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("triage.why")}</DropdownMenuLabel>
          {DISMISS_REASONS.map((key) => (
            <DropdownMenuItem key={key} onSelect={() => run("dismissed", key, t("triage.dismissedToast"))}>
              {t(`dismissReasons.${key}`)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/**
 * One candidate × job match.
 * - `context="list"`: standalone card (job title, candidate underneath).
 * - `context="job"`: row inside a job group — the candidate is the headline.
 * - `context="candidate"`: row inside a candidate group — the job is the headline.
 */
export function OpportunityCard({
  opp,
  orgSlug,
  context = "list",
  showCandidate = true,
  detailHref,
  selected = false,
}: {
  opp: OpportunityView;
  orgSlug: string;
  context?: "list" | "job" | "candidate";
  /** When set, "Why this match" opens the split-view panel at this URL instead of a sheet. */
  detailHref?: string;
  selected?: boolean;
  /** @deprecated use context="candidate" */
  showCandidate?: boolean;
}) {
  const t = useT("opportunities");
  const tg = useGlobalT();
  const ctx = context === "list" && !showCandidate ? "candidate" : context;
  const submitted = isSubmitted(opp);
  const canAct = !submitted && opp.band !== "not_eligible";
  const nested = ctx !== "list";

  const jobMeta = (
    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      <span className="inline-flex items-center gap-1"><Building2 className="size-3.5" aria-hidden />{t("card.via", { client: opp.client_label, org: opp.job_org_name })}</span>
      <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{tg(`labels.arrangement.${opp.work_arrangement}`)}{opp.location ? ` · ${opp.location}` : ""}</span>
    </p>
  );

  return (
    // Container query: the row layout follows the card's own width, so it adapts when the split-view panel is open.
    <article
      className={cn(
        "@container transition-colors",
        nested ? "rounded-2xl px-3 py-3 hover:bg-muted/50" : "rounded-3xl border border-border/60 bg-card p-5",
        selected && (nested ? "bg-muted" : "border-foreground/40 ring-1 ring-foreground/20"),
        opp.triage_state === "dismissed" && "opacity-70",
      )}
    >
      <div className="flex flex-col gap-4 @4xl:flex-row @4xl:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-4">
      <ScoreRing score={opp.score} className={nested ? "size-12" : undefined} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {ctx === "job" ? (
            <h4 className="text-[15px] font-semibold">
              <Link href={`/w/${orgSlug}/candidates/${opp.candidate_id}`} className="underline-offset-4 hover:underline">{opp.candidate_name}</Link>
            </h4>
          ) : (
            <h3 className={cn("font-semibold", nested ? "text-[15px]" : "text-base")}>{opp.job_title}</h3>
          )}
          {opp.is_new && canAct ? <NewDot /> : null}
          <StatusPill tone={BAND[opp.band].tone} label={tg(`labels.band.${opp.band}`)} />
          {ctx !== "job" ? <ShareChip opp={opp} /> : null}
        </div>
        {ctx === "job" ? (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {opp.candidate_headline ?? t("card.noHeadline")}
            {" · "}
            {opp.gaps.length ? t("card.gapsToCheck", { count: opp.gaps.length }) : t("card.noGaps")}
          </p>
        ) : (
          jobMeta
        )}
        {ctx === "list" ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm">
            <User className="size-3.5 text-muted-foreground" aria-hidden />
            <span className="text-muted-foreground">{t("card.yourCandidate")} </span>
            <Link href={`/w/${orgSlug}/candidates/${opp.candidate_id}`} className="font-medium underline-offset-4 hover:underline">{opp.candidate_name}</Link>
            {opp.candidate_headline ? <span className="text-muted-foreground"> · {opp.candidate_headline}</span> : null}
          </p>
        ) : null}
        {opp.triage_state === "dismissed" && opp.dismiss_reason ? (
          <p className="mt-1 text-xs text-muted-foreground">{t("card.dismissedReason", { reason: t(`dismissReasons.${opp.dismiss_reason}`) })}</p>
        ) : null}
      </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 @4xl:justify-end">
        {submitted && opp.referral_id ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/w/${orgSlug}/referrals/${opp.referral_id}`}>{tg(`labels.referralStatus.${opp.referral_status!}`)}</Link>
          </Button>
        ) : null}
        {canAct ? <TriageActions opp={opp} orgSlug={orgSlug} /> : null}
        {detailHref ? (
          <Button variant={selected ? "secondary" : submitted || canAct ? "ghost" : "outline"} size="sm" asChild>
            <Link href={detailHref} scroll={false} aria-current={selected ? "true" : undefined}>{t("sheet.trigger")}</Link>
          </Button>
        ) : (
          <MatchSheet opp={opp} orgSlug={orgSlug} triggerVariant={submitted || canAct ? "ghost" : "outline"} />
        )}
        {canAct && opp.triage_state !== "dismissed" ? (
          <Button size="sm" asChild>
            <Link href={`/w/${orgSlug}/opportunities/${opp.match_id}`}>{t("card.reviewSubmit")}</Link>
          </Button>
        ) : null}
      </div>
      </div>
    </article>
  );
}
