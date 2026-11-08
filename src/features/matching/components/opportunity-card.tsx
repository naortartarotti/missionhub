"use client";

import Link from "next/link";
import { ArrowRight, Building2, CheckCircle2, CircleAlert, Info, MapPin, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { StatusPill } from "@/components/shared/status-pill";
import { ARRANGEMENT, BAND, CONTRACT, REFERRAL_STATUS, SENIORITY, relativeTime } from "@/lib/labels";
import { formatMoney } from "@/lib/money/format";
import { ScoreRing } from "./score-ring";

type Evidence = { factor: string; label: string };
export type OpportunityView = {
  match_id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_headline: string | null;
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
  score: number;
  band: keyof typeof BAND;
  reasons: Evidence[];
  gaps: Evidence[];
  blockers: Evidence[];
  model_version: string;
  refreshed_at: string;
  referral_id: string | null;
  referral_status: keyof typeof REFERRAL_STATUS | null;
};

function EvidenceList({ items, icon: Icon, className, empty }: { items: Evidence[]; icon: typeof CheckCircle2; className: string; empty: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="grid gap-2">
      {items.map((e, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} aria-hidden />
          <span>{e.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function OpportunityCard({ opp, orgSlug, showCandidate = true }: { opp: OpportunityView; orgSlug: string; showCandidate?: boolean }) {
  const submitted = opp.referral_status && !["declined", "withdrawn", "rejected", "cancelled"].includes(opp.referral_status);
  const salary =
    opp.salary_min !== null || opp.salary_max !== null
      ? `${formatMoney(opp.salary_min, opp.salary_currency ?? "CAD")} – ${formatMoney(opp.salary_max, opp.salary_currency ?? "CAD")}`
      : null;
  return (
    <article className="flex flex-col gap-4 rounded-3xl border border-border/60 bg-card p-5 sm:flex-row sm:items-center">
      <ScoreRing score={opp.score} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">{opp.job_title}</h3>
          <StatusPill tone={BAND[opp.band].tone} label={BAND[opp.band].label} />
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Building2 className="size-3.5" aria-hidden />{opp.client_label} · via {opp.job_org_name}</span>
          <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{ARRANGEMENT[opp.work_arrangement]}{opp.location ? ` · ${opp.location}` : ""}</span>
        </p>
        {showCandidate ? (
          <p className="mt-2 text-sm">
            <span className="text-muted-foreground">Your candidate: </span>
            <Link href={`/w/${orgSlug}/candidates/${opp.candidate_id}`} className="font-medium underline-offset-4 hover:underline">{opp.candidate_name}</Link>
            {opp.candidate_headline ? <span className="text-muted-foreground"> · {opp.candidate_headline}</span> : null}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {submitted && opp.referral_id ? (
          <Button variant="outline" asChild>
            <Link href={`/w/${orgSlug}/referrals/${opp.referral_id}`}>{REFERRAL_STATUS[opp.referral_status!].label}</Link>
          </Button>
        ) : null}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant={submitted ? "ghost" : "outline"}>Why this match</Button>
          </SheetTrigger>
          <SheetContent className="w-full overflow-y-auto p-6 sm:max-w-lg">
            <SheetHeader className="p-0">
              <SheetTitle className="text-xl">{opp.job_title}</SheetTitle>
              <SheetDescription>{opp.client_label} · shared by {opp.job_org_name}</SheetDescription>
            </SheetHeader>
            <div className="mt-6 flex items-center gap-4 rounded-2xl bg-muted p-4">
              <ScoreRing score={opp.score} />
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Indicative compatibility, not a hiring prediction.</span> Computed by rule-based matching ({opp.model_version}) from professional attributes only, refreshed {relativeTime(opp.refreshed_at)}.
              </p>
            </div>
            <section className="mt-6 grid gap-2">
              <h4 className="text-sm font-semibold">Why it matches</h4>
              <EvidenceList items={opp.reasons} icon={CheckCircle2} className="text-success" empty="No strong signals." />
            </section>
            <section className="mt-6 grid gap-2">
              <h4 className="text-sm font-semibold">Gaps & missing information</h4>
              <EvidenceList items={opp.gaps} icon={CircleAlert} className="text-warning" empty="No notable gaps." />
            </section>
            {opp.blockers.length ? (
              <section className="mt-6 grid gap-2">
                <h4 className="text-sm font-semibold">Eligibility restrictions</h4>
                <EvidenceList items={opp.blockers} icon={Ban} className="text-danger" empty="" />
              </section>
            ) : null}
            <section className="mt-6 grid gap-3 rounded-2xl border border-border p-4 text-sm">
              <h4 className="font-semibold">Role details shared by the job owner</h4>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <dt className="text-muted-foreground">Seniority</dt><dd>{opp.seniority ? SENIORITY[opp.seniority] : "—"}</dd>
                <dt className="text-muted-foreground">Contract</dt><dd>{CONTRACT[opp.contract_type]}</dd>
                <dt className="text-muted-foreground">Compensation</dt><dd>{salary ?? "Not shared"}</dd>
                <dt className="text-muted-foreground">Expected fee</dt><dd>{opp.expected_fee_minor ? formatMoney(opp.expected_fee_minor, opp.fee_currency ?? "CAD") : "Not shared"}</dd>
                <dt className="text-muted-foreground">Required skills</dt><dd>{opp.required_skills.join(", ") || "—"}</dd>
                <dt className="text-muted-foreground">Preferred</dt><dd>{opp.preferred_skills.join(", ") || "—"}</dd>
              </dl>
              {opp.description ? <p className="whitespace-pre-line text-muted-foreground">{opp.description}</p> : <p className="text-muted-foreground">Description not shared before referral.</p>}
            </section>
            <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              The job owner cannot see your candidate. They only see that qualified matches exist, until you choose to submit.
            </p>
            {!submitted && opp.band !== "not_eligible" ? (
              <Button className="mt-6 w-full" size="lg" asChild>
                <Link href={`/w/${orgSlug}/opportunities/${opp.match_id}`}>Review & submit <ArrowRight className="size-4" aria-hidden /></Link>
              </Button>
            ) : null}
          </SheetContent>
        </Sheet>
        {!submitted && opp.band !== "not_eligible" ? (
          <Button asChild>
            <Link href={`/w/${orgSlug}/opportunities/${opp.match_id}`}>Review match</Link>
          </Button>
        ) : null}
      </div>
    </article>
  );
}
