import { notFound } from "next/navigation";
import { assertCan, getRequestContext } from "@/server/auth/context";
import { getCandidate } from "@/features/candidates/queries";
import { updateCandidate } from "@/features/candidates/actions";
import { CandidateForm } from "@/features/candidates/components/candidate-form";
import { PageHeader } from "@/components/shared/page-header";
import { minorToMajorString } from "@/lib/money/format";

export const metadata = { title: "Edit candidate" };

export default async function EditCandidatePage({ params }: PageProps<"/w/[orgSlug]/candidates/[candidateId]/edit">) {
  const { orgSlug, candidateId } = await params;
  const ctx = await getRequestContext(orgSlug);
  assertCan(ctx, "candidates:write");
  const c = await getCandidate(ctx, candidateId);
  if (!c || c.status === "deleted") notFound();
  const cur = c.salary_currency ?? ctx.currency;
  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <PageHeader title={`Edit ${c.full_name}`} description="Changes to matching attributes trigger a background re-match." />
      <CandidateForm
        action={updateCandidate.bind(null, orgSlug, candidateId)}
        cancelHref={`/w/${orgSlug}/candidates/${candidateId}`}
        submitLabel="Save changes"
        defaults={{
          fullName: c.full_name,
          email: c.email ?? "",
          phone: c.phone ?? "",
          headline: c.headline ?? "",
          summary: c.summary ?? "",
          locationCity: c.location_city ?? "",
          locationRegion: c.location_region ?? "",
          locationCountry: c.location_country ?? "",
          openToRelocation: c.open_to_relocation,
          workArrangements: c.work_arrangements,
          seniority: c.seniority ?? "",
          yearsExperience: c.years_experience?.toString() ?? "",
          skills: c.skills.join(", "),
          languages: c.languages.join(", "),
          tags: c.tags.join(", "),
          salaryMin: c.salary_expectation_min !== null ? minorToMajorString(c.salary_expectation_min, cur) : "",
          salaryMax: c.salary_expectation_max !== null ? minorToMajorString(c.salary_expectation_max, cur) : "",
          salaryCurrency: cur,
          availableFrom: c.available_from ?? "",
          notes: c.notes ?? "",
          source: c.source,
          sourceDetail: c.source_detail ?? "",
          legalBasis: c.legal_basis,
          privacyNoticeGiven: Boolean(c.privacy_notice_given_at),
        }}
      />
    </div>
  );
}
