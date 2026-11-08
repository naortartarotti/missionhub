import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getRequestContext } from "@/server/auth/context";
import { listOpportunities } from "@/features/matching/queries";
import { OpportunityCard, type OpportunityView } from "@/features/matching/components/opportunity-card";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Opportunities" };

const TABS = [
  { key: "strong", label: "Strong matches" },
  { key: "potential", label: "Potential matches" },
  { key: "not_eligible", label: "Not eligible" },
] as const;

export default async function OpportunitiesPage({ params, searchParams }: PageProps<"/w/[orgSlug]/opportunities">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await getRequestContext(orgSlug);
  const candidate = typeof sp.candidate === "string" ? sp.candidate : undefined;
  const band = (TABS.find((t) => t.key === sp.band)?.key ?? "strong") as (typeof TABS)[number]["key"];
  const all = await listOpportunities(ctx, { candidateId: candidate });
  const counts = Object.fromEntries(TABS.map((t) => [t.key, all.filter((o) => o.band === t.key).length]));
  const rows = all.filter((o) => o.band === band);
  const base = `/w/${orgSlug}/opportunities`;
  const qs = (b: string) => `${base}?${new URLSearchParams({ band: b, ...(candidate ? { candidate } : {}) })}`;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Opportunities for my candidates"
        description="Partner jobs that fit candidates in your private inventory. Scores are indicative and based only on professional attributes; you decide what, if anything, to share."
      />
      {candidate ? (
        <p className="text-sm text-muted-foreground">
          Filtered to one candidate. <Link href={base} className="font-medium text-foreground underline-offset-4 hover:underline">Show all</Link>
        </p>
      ) : null}
      <nav aria-label="Match bands" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={qs(t.key)}
            aria-current={band === t.key ? "page" : undefined}
            className={cn("rounded-full border px-4 py-2 text-sm font-medium transition-colors", band === t.key ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-accent")}
          >
            {t.label} <span className="ml-1 tabular-nums opacity-70">{counts[t.key]}</span>
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title={band === "strong" ? "No strong matches yet" : "Nothing in this group"}
          description="Opportunities appear when your candidates are active for matching and partner recruiters publish jobs open to referrals. Matching refreshes automatically when either side changes."
          action={<Button variant="outline" asChild><Link href={`/w/${orgSlug}/candidates?status=draft`}>Review draft candidates</Link></Button>}
        />
      ) : (
        <div className="grid gap-3">
          {rows.map((o) => <OpportunityCard key={o.match_id} opp={o as unknown as OpportunityView} orgSlug={orgSlug} />)}
        </div>
      )}
    </div>
  );
}
