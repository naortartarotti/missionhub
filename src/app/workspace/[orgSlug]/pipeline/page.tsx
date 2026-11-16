import { redirect } from "next/navigation";

/** The pipeline moved into Referrals as a tab; keep old links and bookmarks working. */
export default async function PipelineRedirect({ params, searchParams }: PageProps<"/workspace/[orgSlug]/pipeline">) {
  const { orgSlug } = await params;
  const { job } = await searchParams;
  const qs = new URLSearchParams({ tab: "pipeline", ...(typeof job === "string" && job ? { job } : {}) });
  redirect(`/workspace/${orgSlug}/referrals?${qs}`);
}
