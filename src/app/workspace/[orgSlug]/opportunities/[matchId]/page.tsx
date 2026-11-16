import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getPartnerJobAvailability } from "@/features/network-rules/queries";
import { supportEmail } from "@/features/network-rules/page-data";
import { ReportProblemButton } from "@/features/network-rules/components/report-dialog";
import { OpportunitiesRestricted, PartnerJobUnavailable, isPartnerRestricted } from "@/features/network-rules/components/restricted-states";
import { assertCan, getRequestContext } from "@/server/auth/context";
import { asEvidence, listOpportunities, partnerTerms } from "@/features/matching/queries";
import { getCandidate } from "@/features/candidates/queries";
import { PageHeader } from "@/components/shared/page-header";
import { SubmitReferralForm, type ComposerCandidate, type ComposerJob } from "@/features/referrals/components/submit-referral-form";
import { BAND } from "@/lib/labels";
import { getFormatter, getGlobalT, getLocale, getT } from "@/i18n/server";
import { INTL_LOCALE } from "@/i18n/config";
import { countryNamer, mobilityLines } from "@/features/candidates/mobility";
import { evidenceText } from "@/features/matching/evidence";

export async function generateMetadata() {
  return { title: (await getT("opportunities"))("review.title") };
}

export default async function ReviewMatchPage({ params }: PageProps<"/workspace/[orgSlug]/opportunities/[matchId]">) {
  const { orgSlug, matchId } = await params;
  const ctx = await getRequestContext(orgSlug);
  const [t, tr, tg, f] = await Promise.all([getT("opportunities"), getT("referrals"), getGlobalT(), getFormatter()]);
  assertCan(ctx, "referrals:submit");
  // N10 S20-c: restricted org → the paused state before any match lookup.
  if (isPartnerRestricted(ctx)) return <OpportunitiesRestricted ctx={ctx} title={t("review.title")} />;
  const [opp] = await listOpportunities(ctx, { matchId });
  if (!opp) {
    // S21 (BR-14): an old link to a job whose owner isn't taking referrals gets the one neutral sentence;
    // the RPC answers not_found unless this org has a referral or a live match on that job.
    const availability = await getPartnerJobAvailability(ctx, { matchId }).catch(() => ({ status: "not_found" as const }));
    if (availability.status === "not_taking_referrals" || availability.status === "no_longer_member") {
      return <PartnerJobUnavailable orgSlug={orgSlug} status={availability.status} orgName={availability.org_name} jobTitle={availability.job_title} />;
    }
    notFound();
  }

  const [candidate, { data: consents }, { data: documents }, { data: experiences }] = await Promise.all([
    getCandidate(ctx, opp.candidate_id),
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
    ctx.db.from("candidate_experiences").select("title, company, start_date, end_date").eq("candidate_id", opp.candidate_id).order("start_date", { ascending: false }),
  ]);
  if (!candidate) notFound();

  const money = (v: number | null, cur: string) => (v != null ? f.money(v, cur, { whole: true }) : null);
  const range = (min: number | null, max: number | null, cur: string) => [money(min, cur), money(max, cur)].filter(Boolean).join(" – ") || null;

  const countryName = countryNamer(INTL_LOCALE[await getLocale()]);
  const mobility = mobilityLines(
    {
      travel: candidate.travel_availability,
      relocation: candidate.relocation_scope ?? (candidate.open_to_relocation ? "country" : null),
      destinations: candidate.relocation_destinations,
      workAuthorization: candidate.work_authorization,
      hasPassport: candidate.has_passport,
    },
    tg,
    countryName,
  );
  const profile: ComposerCandidate = {
    id: candidate.id,
    name: candidate.full_name,
    headline: candidate.headline,
    summary: candidate.summary,
    location: [candidate.location_city, candidate.location_region, candidate.location_country].filter(Boolean).join(", ") || null,
    seniority:
      [candidate.seniority ? tg(`labels.seniority.${candidate.seniority}`) : null, candidate.years_experience != null ? tr("composer.yearsShort", { count: candidate.years_experience }) : null]
        .filter(Boolean)
        .join(" · ") || null,
    available: candidate.available_from ? tr("composer.availableFrom", { date: f.date(candidate.available_from) }) : null,
    salary: range(candidate.salary_expectation_min, candidate.salary_expectation_max, candidate.salary_currency ?? ctx.currency),
    skills: candidate.skills,
    languages: candidate.languages,
    arrangements: [...candidate.work_arrangements.map((a) => tg(`labels.arrangement.${a}`)), ...(candidate.open_to_relocation ? [tr("composer.relocation")] : [])],
    email: candidate.email,
    phone: candidate.phone,
    hasLinkedin: Boolean(candidate.linkedin_url?.trim()),
    mobility,
    experience: (experiences ?? []).map((e) => ({
      title: e.title,
      company: e.company,
      period: `${e.start_date ? f.date(e.start_date) : "?"} – ${e.end_date ? f.date(e.end_date) : tr("detail.present")}`,
    })),
  };

  // N2 (BR-38): the job's band sits next to code-display terms amounts, so it uses the ISO code too.
  const codeMoney = (v: number | null) => (v != null ? f.money(v, opp.salary_currency, { whole: true, code: true }) : null);
  const salary = [codeMoney(opp.salary_min), codeMoney(opp.salary_max)].filter(Boolean).join(" – ") || null;
  const job: ComposerJob = {
    title: opp.job_title,
    client: opp.client_label,
    org: opp.job_org_name,
    facts: [
      ...(opp.location ? [{ icon: "location" as const, label: opp.location }] : []),
      ...(opp.work_arrangement ? [{ icon: "arrangement" as const, label: tg(`labels.arrangement.${opp.work_arrangement}`) }] : []),
      ...(opp.contract_type ? [{ icon: "contract" as const, label: tg(`labels.contract.${opp.contract_type}`) }] : []),
      ...(opp.seniority ? [{ icon: "seniority" as const, label: tg(`labels.seniority.${opp.seniority}`) }] : []),
      ...(salary ? [{ icon: "salary" as const, label: salary }] : []),
    ],
    requiredSkills: opp.required_skills ?? [],
    score: opp.score,
    band: { label: tg(`labels.band.${opp.band}`), tone: BAND[opp.band].tone },
    reasons: asEvidence(opp.reasons).map((r) => evidenceText(r, tg)),
    gaps: asEvidence(opp.gaps).map((r) => evidenceText(r, tg)),
  };

  const tn = await getT("network");
  const rulesLabel = ctx.rules.required?.label ?? ctx.rules.current?.label ?? "";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={t("review.heading")}
        description={t("review.description", { candidate: opp.candidate_name, job: opp.job_title, client: opp.client_label, org: opp.job_org_name })}
        actions={
          ctx.user.isPlatformAdmin ? null : (
            <ReportProblemButton orgSlug={orgSlug} target={{ matchId }} orgName={opp.job_org_name} rightTool={{ position: null, hire: false, amount: "text", noAnswer: "job" }} supportEmail={supportEmail()} />
          )
        }
      />
      <SubmitReferralForm
        orgSlug={orgSlug}
        matchId={matchId}
        recipient={opp.job_org_name}
        jobTitle={opp.job_title}
        candidate={profile}
        job={job}
        consents={consents ?? []}
        documents={(documents ?? []).map((d) => ({ id: d.id, name: d.file_name, ready: d.scan_status === "clean" }))}
        terms={partnerTerms(opp)}
        codeMessages={{
          partner_activity_restricted: ctx.restriction === "network_hold" ? tr("composer.restrictedHold") : tr("composer.restrictedRules"),
          rules_acceptance_required: tr("composer.userMustAccept", { label: rulesLabel }),
        }}
        blocked={
          ctx.rules.userRestricted ? (
            <div className="grid gap-3 rounded-2xl bg-warning-soft p-4 text-sm">
              <p className="font-medium">{tr("composer.userMustAccept", { label: rulesLabel })}</p>
              <Button asChild className="min-h-11 w-full">
                <Link href={`/workspace/${orgSlug}/accept-rules?v=${encodeURIComponent(rulesLabel)}&next=${encodeURIComponent(`/workspace/${orgSlug}/opportunities/${matchId}`)}`}>{tn("banner.cta.accept")}</Link>
              </Button>
            </div>
          ) : undefined
        }
      />
    </div>
  );
}
