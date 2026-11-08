import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { getRequestContext } from "@/server/auth/context";
import { listReferrals } from "@/features/referrals/queries";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Panel } from "@/components/shared/card";
import { StatusPill } from "@/components/shared/status-pill";
import { Button } from "@/components/ui/button";
import { REFERRAL_STATUS, relativeTime } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const metadata = { title: "Referrals" };

export default async function ReferralsPage({ params, searchParams }: PageProps<"/w/[orgSlug]/referrals">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await getRequestContext(orgSlug);
  const tab = sp.tab === "received" ? "received" : "sent";
  const rows = await listReferrals(ctx, tab);
  const base = `/w/${orgSlug}/referrals`;
  return (
    <div className="grid gap-6">
      <PageHeader title="Referrals" description="Candidates you've submitted to partner jobs, and submissions partners have sent to your jobs." />
      <nav aria-label="Referral direction" className="flex gap-2">
        {(["sent", "received"] as const).map((t) => (
          <Link key={t} href={`${base}?tab=${t}`} aria-current={tab === t ? "page" : undefined}
            className={cn("rounded-full border px-4 py-2 text-sm font-medium", tab === t ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-accent")}>
            {t === "sent" ? "Sent" : "Received"}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title={tab === "sent" ? "No referrals sent yet" : "No submissions received yet"}
          description={tab === "sent" ? "Review opportunities for your candidates and submit the right fit, with their authorization." : "Publish jobs that accept partner referrals to receive pre-qualified candidates."}
          action={<Button variant="outline" asChild><Link href={`/w/${orgSlug}/${tab === "sent" ? "opportunities" : "jobs"}`}>{tab === "sent" ? "View opportunities" : "Manage jobs"}</Link></Button>}
        />
      ) : (
        <Panel className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <caption className="sr-only">{tab === "sent" ? "Sent referrals" : "Received submissions"}</caption>
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th scope="col" className="px-5 py-3 font-medium">Candidate</th>
                  <th scope="col" className="px-5 py-3 font-medium">Job</th>
                  <th scope="col" className="px-5 py-3 font-medium">{tab === "sent" ? "Partner" : "From"}</th>
                  <th scope="col" className="px-5 py-3 font-medium">Updated</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                    <td className="px-5 py-3.5"><Link href={`${base}/${r.id}`} className="font-medium underline-offset-4 hover:underline">{r.candidate_label}</Link></td>
                    <td className="px-5 py-3.5">{r.job_title_snapshot}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{tab === "sent" ? r.target_org?.name : r.source_org?.name}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{relativeTime(r.updated_at)}</td>
                    <td className="px-5 py-3.5 text-right"><StatusPill tone={REFERRAL_STATUS[r.status].tone} label={REFERRAL_STATUS[r.status].label} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
