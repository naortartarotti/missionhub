import Link from "next/link";
import { Plus, Search, Upload, Users } from "lucide-react";
import { getRequestContext } from "@/server/auth/context";
import { listCandidates, CANDIDATE_PAGE_SIZE } from "@/features/candidates/queries";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/shared/status-pill";
import { EmptyState } from "@/components/shared/empty-state";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { Panel } from "@/components/shared/card";
import { NativeSelect } from "@/components/shared/native-select";
import { CANDIDATE_STATUS, SENIORITY, relativeTime } from "@/lib/labels";
import { Pagination } from "@/components/shared/pagination";
import { Flash } from "@/components/shared/flash";

export const metadata = { title: "Candidates" };

export default async function CandidatesPage({ params, searchParams }: PageProps<"/w/[orgSlug]/candidates">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await getRequestContext(orgSlug);
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "all";
  const page = Number(sp.page ?? 1) || 1;
  const { rows, total } = await listCandidates(ctx, { q, status, page });
  const base = `/w/${orgSlug}/candidates`;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Candidates"
        description="Your organization's private talent inventory. Other organizations can never browse or search it."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`${base}/import`}>
                <Upload className="size-4" aria-hidden /> Import CSV
              </Link>
            </Button>
            <Button asChild>
              <Link href={`${base}/new`}>
                <Plus className="size-4" aria-hidden /> Add candidate
              </Link>
            </Button>
          </>
        }
      />
      {sp.anonymized ? <Flash message="Candidate anonymized. Personal information was removed; history and finance records remain." /> : null}

      <form className="flex flex-col gap-2 sm:flex-row" role="search" action={base}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="Search by name, headline or exact skill" className="pl-10" aria-label="Search candidates" />
        </div>
        <div className="sm:w-56">
          <NativeSelect name="status" defaultValue={status} aria-label="Filter by status">
            <option value="all">All statuses</option>
            {Object.entries(CANDIDATE_STATUS)
              .filter(([k]) => k !== "deleted")
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q || status !== "all" ? "No candidates match these filters" : "Add your first candidate"}
          description={
            q || status !== "all"
              ? "Try a different search or clear the filters."
              : "Candidates you add stay private to your organization. Activate them for matching to discover partner jobs."
          }
          action={
            <Button asChild>
              <Link href={`${base}/new`}>Add candidate</Link>
            </Button>
          }
        />
      ) : (
        <Panel className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Candidates, {total} total</caption>
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th scope="col" className="px-5 py-3 font-medium">Candidate</th>
                  <th scope="col" className="px-5 py-3 font-medium">Seniority</th>
                  <th scope="col" className="px-5 py-3 font-medium">Top skills</th>
                  <th scope="col" className="px-5 py-3 font-medium">Owner</th>
                  <th scope="col" className="px-5 py-3 font-medium">Updated</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                    <td className="px-5 py-3.5">
                      <Link href={`${base}/${c.id}`} className="flex items-center gap-3 rounded-lg focus-visible:outline-2">
                        <InitialsAvatar name={c.full_name} className="size-9" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{c.full_name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[c.headline, [c.location_city, c.location_region].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "—"}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">{c.seniority ? SENIORITY[c.seniority] : "—"}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{c.skills.slice(0, 3).join(", ") || "—"}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{c.owner?.full_name || "—"}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{relativeTime(c.updated_at)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <StatusPill tone={CANDIDATE_STATUS[c.status].tone} label={CANDIDATE_STATUS[c.status].label} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      <Pagination base={base} params={{ q, status }} page={page} total={total} pageSize={CANDIDATE_PAGE_SIZE} />
    </div>
  );
}
