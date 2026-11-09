import { notFound } from "next/navigation";
import { assertCan, getRequestContext } from "@/server/auth/context";
import { asEvidence, listOpportunities } from "@/features/matching/queries";
import { PageHeader } from "@/components/shared/page-header";
import { SubmitReferralForm } from "@/features/referrals/components/submit-referral-form";
import { ScoreRing } from "@/features/matching/components/score-ring";
import { Panel } from "@/components/shared/card";
import { StatusPill } from "@/components/shared/status-pill";
import { BAND } from "@/lib/labels";
import { getGlobalT, getT } from "@/i18n/server";
import { evidenceText } from "@/features/matching/evidence";
import { CheckCircle2, CircleAlert } from "lucide-react";

export async function generateMetadata() {
  return { title: (await getT("opportunities"))("review.title") };
}

export default async function ReviewMatchPage({ params }: PageProps<"/w/[orgSlug]/opportunities/[matchId]">) {
  const { orgSlug, matchId } = await params;
  const ctx = await getRequestContext(orgSlug);
  const [t, tg] = await Promise.all([getT("opportunities"), getGlobalT()]);
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
    <div className="grid gap-6">
      <PageHeader
        title={t("review.heading")}
        description={t("review.description", { candidate: opp.candidate_name, job: opp.job_title, client: opp.client_label, org: opp.job_org_name })}
      />
      <div className="grid w-full gap-6">
      <Panel className="grid gap-5 sm:grid-cols-[auto_1fr]">
        <ScoreRing score={opp.score} className="size-16" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-sm font-semibold">{t("sheet.whyMatches")}</h2>
              <StatusPill tone={BAND[opp.band].tone} label={tg(`labels.band.${opp.band}`)} />
            </div>
            <ul className="grid gap-1.5 text-sm">
              {reasons.map((r, i) => <li key={i} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{evidenceText(r, tg)}</li>)}
            </ul>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">{t("review.gapsToDiscuss")}</h2>
            {gaps.length ? (
              <ul className="grid gap-1.5 text-sm">
                {gaps.map((r, i) => <li key={i} className="flex gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />{evidenceText(r, tg)}</li>)}
              </ul>
            ) : <p className="text-sm text-muted-foreground">{t("sheet.noGaps")}</p>}
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
    </div>
  );
}
