import Link from "next/link";
import { KanbanSquare } from "lucide-react";
import { can, getRequestContext } from "@/server/auth/context";
import { listPipeline, listPipelineJobs } from "@/features/pipeline/queries";
import { PipelineBoard } from "@/features/pipeline/components/pipeline-board";
import { QueueJobFilter } from "@/features/referrals/components/review-queue";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("pipeline"))("title") };
}

/**
 * Hiring pipeline for accepted referrals: one column per stage, from acceptance to hire.
 * The hiring side (this organization) moves candidates; the partner follows along on the referral.
 */
export default async function PipelinePage({ params, searchParams }: PageProps<"/workspace/[orgSlug]/pipeline">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await getRequestContext(orgSlug);
  const t = await getT("pipeline");
  const jobId = typeof sp.job === "string" && sp.job ? sp.job : undefined;
  const base = `/workspace/${orgSlug}/pipeline`;

  const [{ cards, transitions }, jobs] = await Promise.all([listPipeline(ctx, jobId), listPipelineJobs(ctx)]);
  const canMove = can(ctx, "referrals:review");

  const hrefFor: Record<string, string> = Object.fromEntries([["", base], ...jobs.map((j) => [j.id, `${base}?job=${j.id}`])]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={t("title")}
        description={canMove ? t("description") : t("readOnly")}
        actions={jobs.length > 1 ? <QueueJobFilter value={jobId ?? ""} options={jobs.map((j) => ({ id: j.id, label: j.title }))} allLabel={t("allJobs")} hrefFor={hrefFor} /> : null}
      />
      {cards.length === 0 && !jobId ? (
        <EmptyState
          icon={KanbanSquare}
          title={t("empty.title")}
          description={t("empty.description")}
          action={<Button variant="outline" asChild><Link href={`/workspace/${orgSlug}/referrals?tab=received`}>{t("empty.action")}</Link></Button>}
        />
      ) : (
        <PipelineBoard orgSlug={orgSlug} cards={cards} transitions={transitions} canMove={canMove} showJob={!jobId} currency={ctx.currency} />
      )}
    </div>
  );
}
