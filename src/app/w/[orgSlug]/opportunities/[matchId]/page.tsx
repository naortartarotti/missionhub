import { notFound } from "next/navigation";
import { assertCan, getRequestContext } from "@/server/auth/context";
import { asEvidence, listOpportunities } from "@/features/matching/queries";
import { PageHeader } from "@/components/shared/page-header";
import { SubmitReferralForm } from "@/features/referrals/components/submit-referral-form";
import { ScoreRing } from "@/features/matching/components/score-ring";
import { Panel } from "@/components/shared/card";
import { StatusPill } from "@/components/shared/status-pill";
import { BAND } from "@/lib/labels";
import { CheckCircle2, CircleAlert } from "lucide-react";

export const metadata = { title: "Review match" };

export default async function ReviewMatchPage({ params }: PageProps<"/w/[orgSlug]/opportunities/[matchId]">) {
  const { orgSlug, matchId } = await params;
  const ctx = await getRequestContext(orgSlug);
  assertCan(ctx, "referrals:submit");
  const [opp] = await listOpportunities(ctx, { matchId });
  if (!opp) notFound();

  const [{ data: consents }, { data: documents }] = await Promise.all([
    ctx.db
      .from("candidate_consents")
      .select("id, evidence, obtained_at, expires_at")
      .eq("organization_id", ctx.organizationId)
      .eq("candidate_id", opp.candidate_id)
      .eq("kind", "job_sharing")
      .eq("job_id", opp.job_id)
      .is("revoked_at", null),
    ctx.db
      .from("candidate_documents")
      .select("id, file_name, scan_status")
      .eq("organization_id", ctx.organizationId)
      .eq("candidate_id", opp.candidate_id)
      .is("deleted_at", null),
  ]);
  const reasons = asEvidence(opp.reasons);
  const gaps = asEvidence(opp.gaps);

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <PageHeader
        title="Review match & submit"
        description={`${opp.candidate_name} → ${opp.job_title} (${opp.client_label}, shared by ${opp.job_org_name})`}
      />
      <Panel className="grid gap-5 sm:grid-cols-[auto_1fr]">
        <ScoreRing score={opp.score} className="size-16" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-sm font-semibold">Why it matches</h2>
              <StatusPill tone={BAND[opp.band].tone} label={BAND[opp.band].label} />
            </div>
            <ul className="grid gap-1.5 text-sm">
              {reasons.map((r, i) => <li key={i} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{r.label}</li>)}
            </ul>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">Gaps to discuss with the candidate</h2>
            {gaps.length ? (
              <ul className="grid gap-1.5 text-sm">
                {gaps.map((r, i) => <li key={i} className="flex gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />{r.label}</li>)}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No notable gaps.</p>}
          </div>
        </div>
      </Panel>
      <SubmitReferralForm
        orgSlug={orgSlug}
        matchId={matchId}
        recipient={opp.job_org_name}
        jobTitle={opp.job_title}
        consents={consents ?? []}
        documents={(documents ?? []).map((d) => ({ id: d.id, name: d.file_name, ready: d.scan_status === "clean" }))}
      />
    </div>
  );
}
