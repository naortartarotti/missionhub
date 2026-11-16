import { notFound } from "next/navigation";
import { assertCan, getRequestContext } from "@/server/auth/context";
import { getJob } from "@/features/jobs/queries";
import { updateJob } from "@/features/jobs/actions";
import { JobForm } from "@/features/jobs/components/job-form";
import { jobNetworkState } from "@/features/network-rules/job-network";
import { PageHeader } from "@/components/shared/page-header";
import { minorToMajorString } from "@/lib/money/format";
import { getT } from "@/i18n/server";
import { getJobTermsContext } from "@/features/jobs/terms-context";

export async function generateMetadata() {
  return { title: (await getT("jobs"))("edit.metaTitle") };
}

export default async function EditJobPage({ params }: PageProps<"/workspace/[orgSlug]/jobs/[jobId]/edit">) {
  const { orgSlug, jobId } = await params;
  const ctx = await getRequestContext(orgSlug);
  assertCan(ctx, "jobs:write");
  const j = await getJob(ctx, jobId);
  if (!j) notFound();
  const [t, terms] = await Promise.all([getT("jobs"), getJobTermsContext(ctx, jobId)]);
  const m = (v: number | null, c: string) => (v === null ? "" : minorToMajorString(v, c));
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title={t("edit.title", { title: j.title })} description={t("edit.description")} />
      <div className="grid w-full gap-6">
      <JobForm
        orgSlug={orgSlug}
        action={updateJob.bind(null, orgSlug, jobId)}
        cancelHref={`/workspace/${orgSlug}/jobs/${jobId}`}
        isNew={false}
        terms={terms.form}
        network={jobNetworkState(ctx, `/workspace/${orgSlug}/jobs/${jobId}/edit`)}
        defaults={{
          title: j.title,
          clientName: j.client_name ?? "",
          clientConfidential: j.client_confidential,
          description: j.description,
          requiredSkills: j.required_skills.join(", "),
          preferredSkills: j.preferred_skills.join(", "),
          seniority: j.seniority ?? "",
          minYearsExperience: j.min_years_experience?.toString() ?? "",
          workArrangement: j.work_arrangement,
          locationCity: j.location_city ?? "",
          locationRegion: j.location_region ?? "",
          locationCountry: j.location_country ?? "",
          languages: j.languages.join(", "),
          contractType: j.contract_type,
          salaryMin: m(j.salary_min, j.salary_currency),
          salaryMax: m(j.salary_max, j.salary_currency),
          salaryCurrency: j.salary_currency,
          acceptsExternalReferrals: j.accepts_external_referrals,
          shareDescription: j.share_description,
          shareSalary: j.share_salary,
          shareLocation: j.share_location,
          travelRequirement: j.travel_requirement ?? "",
          visaSponsorship: j.visa_sponsorship,
          relocationSupport: j.relocation_support,
        }}
      />
    </div>
    </div>
  );
}
