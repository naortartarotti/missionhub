import { notFound } from "next/navigation";
import { assertCan, getRequestContext } from "@/server/auth/context";
import { getCandidate } from "@/features/candidates/queries";
import { updateCandidate } from "@/features/candidates/actions";
import { CandidateForm } from "@/features/candidates/components/candidate-form";
import { PageHeader } from "@/components/shared/page-header";
import { minorToMajorString } from "@/lib/money/format";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("candidates"))("edit.metaTitle") };
}

export default async function EditCandidatePage({ params }: PageProps<"/w/[orgSlug]/candidates/[candidateId]/edit">) {
  const { orgSlug, candidateId } = await params;
  const ctx = await getRequestContext(orgSlug);
  assertCan(ctx, "candidates:write");
  const c = await getCandidate(ctx, candidateId);
  if (!c || c.status === "deleted") notFound();
  const cur = c.salary_currency ?? ctx.currency;
  const t = await getT("candidates");
  return (
    <div className="grid gap-6">
      <PageHeader title={t("edit.title", { name: c.full_name })} description={t("edit.description")} />
      <div className="grid w-full gap-6">
      <CandidateForm
        action={updateCandidate.bind(null, orgSlug, candidateId)}
        cancelHref={`/w/${orgSlug}/candidates/${candidateId}`}
        submitLabel={t("edit.submit")}
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
    </div>
  );
}
