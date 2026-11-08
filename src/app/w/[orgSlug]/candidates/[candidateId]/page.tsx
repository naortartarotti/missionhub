import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Sparkles } from "lucide-react";
import { getRequestContext, can } from "@/server/auth/context";
import { getCandidate, getCandidateRelations } from "@/features/candidates/queries";
import { listOpportunities } from "@/features/matching/queries";
import { AnonymizeButton, ConsentPanel, DocumentsPanel, StatusActions } from "@/features/candidates/components/candidate-panels";
import { OpportunityCard, type OpportunityView } from "@/features/matching/components/opportunity-card";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shared/card";
import { SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { Flash } from "@/components/shared/flash";
import { ARRANGEMENT, CANDIDATE_STATUS, LEGAL_BASIS, REFERRAL_STATUS, SENIORITY, formatDate, relativeTime } from "@/lib/labels";
import { formatMoney } from "@/lib/money/format";

export const metadata = { title: "Candidate" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children || "—"}</dd>
    </div>
  );
}

export default async function CandidatePage({ params, searchParams }: PageProps<"/w/[orgSlug]/candidates/[candidateId]">) {
  const { orgSlug, candidateId } = await params;
  const sp = await searchParams;
  const ctx = await getRequestContext(orgSlug);
  const candidate = await getCandidate(ctx, candidateId);
  if (!candidate) notFound();
  const [rel, opportunities] = await Promise.all([
    getCandidateRelations(ctx, candidateId),
    candidate.status === "active_for_matching" ? listOpportunities(ctx, { candidateId }) : Promise.resolve([]),
  ]);
  const canWrite = can(ctx, "candidates:write");
  const st = CANDIDATE_STATUS[candidate.status];
  const salary =
    candidate.salary_expectation_min !== null || candidate.salary_expectation_max !== null
      ? `${formatMoney(candidate.salary_expectation_min, candidate.salary_currency ?? ctx.currency)} – ${formatMoney(candidate.salary_expectation_max, candidate.salary_currency ?? ctx.currency)}`
      : null;
  const hasProcessing = rel.consents.some((c) => c.kind === "processing" && !c.revoked_at);

  return (
    <div className="grid gap-6">
      {sp.created ? <Flash message="Candidate saved as a draft. Record a processing authorization, then activate them for matching." /> : null}
      {sp.updated ? <Flash message="Changes saved. Matching will refresh in the background." /> : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <InitialsAvatar name={candidate.full_name} className="size-14 text-lg" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{candidate.full_name}</h1>
            <p className="truncate text-muted-foreground">{candidate.headline || "No headline"}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={st.tone} label={st.label} />
          {canWrite && candidate.status !== "deleted" ? (
            <Button variant="outline" asChild>
              <Link href={`/w/${orgSlug}/candidates/${candidateId}/edit`}>
                <Pencil className="size-4" aria-hidden /> Edit
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {canWrite ? (
        <Panel className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {candidate.status === "active_for_matching"
              ? "Matching against partner jobs. Partners never see this candidate unless you submit them."
              : hasProcessing
                ? "Ready to activate. Activation lets the platform look for matching partner jobs."
                : "Record a processing authorization below before activating for matching."}
          </p>
          <StatusActions orgSlug={orgSlug} candidateId={candidateId} status={candidate.status} />
        </Panel>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="grid content-start gap-6">
          <Panel>
            <SectionTitle>Profile</SectionTitle>
            <dl className="divide-y divide-border/60">
              <Row label="Email">{candidate.email}</Row>
              <Row label="Phone">{candidate.phone}</Row>
              <Row label="Location">
                {[candidate.location_city, candidate.location_region, candidate.location_country].filter(Boolean).join(", ")}
                {candidate.open_to_relocation ? " · open to relocation" : ""}
              </Row>
              <Row label="Work arrangement">{candidate.work_arrangements.map((a) => ARRANGEMENT[a]).join(", ")}</Row>
              <Row label="Seniority">
                {candidate.seniority ? SENIORITY[candidate.seniority] : null}
                {candidate.years_experience !== null ? ` · ${candidate.years_experience} yrs` : ""}
              </Row>
              <Row label="Skills">{candidate.skills.join(", ")}</Row>
              <Row label="Languages">{candidate.languages.join(", ")}</Row>
              <Row label="Salary expectation">{salary}</Row>
              <Row label="Available from">{candidate.available_from ? formatDate(candidate.available_from) : null}</Row>
              <Row label="Owner">{candidate.owner?.full_name}</Row>
            </dl>
            {candidate.summary ? <p className="mt-4 text-sm whitespace-pre-line text-muted-foreground">{candidate.summary}</p> : null}
          </Panel>

          <section>
            <SectionTitle
              action={
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/w/${orgSlug}/opportunities?candidate=${candidateId}`}>All opportunities</Link>
                </Button>
              }
            >
              Opportunities
            </SectionTitle>
            {candidate.status !== "active_for_matching" ? (
              <Panel className="flex items-center gap-3 text-sm text-muted-foreground">
                <Sparkles className="size-4" aria-hidden /> Activate this candidate to discover matching partner jobs.
              </Panel>
            ) : opportunities.length === 0 ? (
              <Panel className="text-sm text-muted-foreground">No matching partner jobs right now. Matching re-runs whenever this profile or partner jobs change.</Panel>
            ) : (
              <div className="grid gap-3">
                {opportunities.slice(0, 5).map((o) => (
                  <OpportunityCard key={o.match_id} opp={o as unknown as OpportunityView} orgSlug={orgSlug} showCandidate={false} />
                ))}
              </div>
            )}
          </section>

          <Panel>
            <SectionTitle>Referrals</SectionTitle>
            {rel.referrals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not submitted to any partner job yet.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {rel.referrals.map((r) => (
                  <li key={r!.id} className="flex items-center justify-between gap-3 py-3">
                    <Link href={`/w/${orgSlug}/referrals/${r!.id}`} className="font-medium underline-offset-4 hover:underline">{r!.job_title_snapshot}</Link>
                    <span className="flex items-center gap-3 text-sm text-muted-foreground">
                      {relativeTime(r!.updated_at)}
                      <StatusPill tone={REFERRAL_STATUS[r!.status].tone} label={REFERRAL_STATUS[r!.status].label} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="grid content-start gap-6">
          <Panel>
            <SectionTitle>Authorizations</SectionTitle>
            <ConsentPanel orgSlug={orgSlug} candidateId={candidateId} consents={rel.consents} canWrite={canWrite && candidate.status !== "deleted"} />
          </Panel>
          <Panel>
            <SectionTitle>Documents</SectionTitle>
            <DocumentsPanel orgSlug={orgSlug} candidateId={candidateId} documents={rel.documents} canWrite={canWrite && candidate.status !== "deleted"} />
          </Panel>
          <Panel>
            <SectionTitle>Provenance</SectionTitle>
            <dl className="divide-y divide-border/60">
              <Row label="Source">{[candidate.source.replace("_", " "), candidate.source_detail].filter(Boolean).join(" · ")}</Row>
              <Row label="Legal basis">{LEGAL_BASIS[candidate.legal_basis]}</Row>
              <Row label="Purpose">{candidate.processing_purpose}</Row>
              <Row label="Privacy notice">{candidate.privacy_notice_given_at ? formatDate(candidate.privacy_notice_given_at) : "Not recorded"}</Row>
              <Row label="Last reviewed">{formatDate(candidate.last_reviewed_at)}</Row>
              <Row label="Created">{formatDate(candidate.created_at)}</Row>
            </dl>
          </Panel>
          {can(ctx, "candidates:anonymize") && candidate.status !== "deleted" ? (
            <Panel className="border-danger/30">
              <SectionTitle>Privacy request</SectionTitle>
              <p className="mb-4 text-sm text-muted-foreground">
                Handle a deletion request by anonymizing this record. Use Settings → Privacy to log and track the request.
              </p>
              <AnonymizeButton orgSlug={orgSlug} candidateId={candidateId} />
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
