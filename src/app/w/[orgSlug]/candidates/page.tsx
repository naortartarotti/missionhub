import Link from "next/link";
import { Plus, Search, Sparkles, Upload, Users } from "lucide-react";
import { getRequestContext } from "@/server/auth/context";
import { listCandidates, CANDIDATE_PAGE_SIZE } from "@/features/candidates/queries";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/shared/status-pill";
import { SkillChips } from "@/components/shared/skill-chips";
import { EmptyState } from "@/components/shared/empty-state";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { Panel } from "@/components/shared/card";
import { NativeSelect } from "@/components/shared/native-select";
import { CANDIDATE_STATUS } from "@/lib/labels";
import { Pagination } from "@/components/shared/pagination";
import { Flash } from "@/components/shared/flash";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("candidates"))("title") };
}

export default async function CandidatesPage({ params, searchParams }: PageProps<"/w/[orgSlug]/candidates">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await getRequestContext(orgSlug);
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "all";
  const page = Number(sp.page ?? 1) || 1;
  const [{ rows, total }, notMatching, othersOwned] = await Promise.all([
    listCandidates(ctx, { q, status, page }),
    ctx.db.from("candidates").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organizationId).eq("status", "draft"),
    ctx.db.from("candidates").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organizationId).neq("owner_id", ctx.userId),
  ]);
  const draftCount = notMatching.count ?? 0;
  // The recruiter column only adds information when someone else on the team owns candidates.
  const showOwner = (othersOwned.count ?? 0) > 0;
  const base = `/w/${orgSlug}/candidates`;
  const [t, tg, f] = await Promise.all([getT("candidates"), getGlobalT(), getFormatter()]);
  const statuses = (Object.keys(CANDIDATE_STATUS) as (keyof typeof CANDIDATE_STATUS)[]).filter((k) => k !== "deleted");

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("list.description")}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`${base}/import`}>
                <Upload className="size-4" aria-hidden /> {t("list.importCsv")}
              </Link>
            </Button>
            <Button asChild>
              <Link href={`${base}/new`}>
                <Plus className="size-4" aria-hidden /> {t("list.addCandidate")}
              </Link>
            </Button>
          </>
        }
      />
      {sp.anonymized ? <Flash message={t("list.anonymized")} /> : null}
      {draftCount > 0 && status !== "draft" ? (
        <div className="flex flex-col gap-3 rounded-3xl border border-border/60 bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-3 text-sm">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              <span className="font-medium">{t("list.notMatching", { count: draftCount })}</span>{" "}
              <span className="text-muted-foreground">{t("list.notMatchingHint")}</span>
            </span>
          </p>
          <Button variant="outline" size="sm" asChild className="shrink-0">
            <Link href={`${base}?status=draft`}>{t("list.showThem")}</Link>
          </Button>
        </div>
      ) : null}

      <form className="flex flex-col gap-2 sm:flex-row" role="search" action={base}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q} placeholder={t("list.searchPlaceholder")} className="pl-10" aria-label={t("list.searchLabel")} />
        </div>
        <div className="sm:w-56">
          <NativeSelect name="status" defaultValue={status} aria-label={t("list.statusFilter")}>
            <option value="all">{t("list.allStatuses")}</option>
            {statuses.map((k) => (
              <option key={k} value={k}>
                {tg(`labels.candidateStatus.${k}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="secondary">
          {t("list.apply")}
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q || status !== "all" ? t("list.emptyFilteredTitle") : t("list.emptyTitle")}
          description={
            q || status !== "all"
              ? t("list.emptyFilteredBody")
              : t("list.emptyBody")
          }
          action={
            <Button asChild>
              <Link href={`${base}/new`}>{t("list.addCandidate")}</Link>
            </Button>
          }
        />
      ) : (
        <Panel className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">{t("list.caption", { total })}</caption>
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th scope="col" className="px-5 py-3 font-medium">{t("list.columns.candidate")}</th>
                  <th scope="col" className="px-5 py-3 font-medium">{t("list.columns.seniority")}</th>
                  <th scope="col" className="px-5 py-3 font-medium">{t("list.columns.skills")}</th>
                  {showOwner ? <th scope="col" className="px-5 py-3 font-medium">{t("list.columns.owner")}</th> : null}
                  <th scope="col" className="px-5 py-3 font-medium">{t("list.columns.updated")}</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">{t("list.columns.status")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                    <td className="px-5 py-4">
                      <Link href={`${base}/${c.id}`} className="flex items-center gap-3 rounded-lg focus-visible:outline-2">
                        <InitialsAvatar name={c.full_name} className="size-10" />
                        <span className="min-w-0">
                          <span className="block truncate text-base font-semibold">{c.full_name}</span>
                          <span className="block truncate text-sm text-muted-foreground">
                            {[c.headline, [c.location_city, c.location_region].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "—"}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-5 py-4">{c.seniority ? tg(`labels.seniority.${c.seniority}`) : "—"}</td>
                    <td className="px-5 py-4">
                      <SkillChips skills={c.skills} max={3} />
                    </td>
                    {showOwner ? <td className="px-5 py-4 text-muted-foreground">{c.owner?.full_name || "—"}</td> : null}
                    <td className="px-5 py-4 text-muted-foreground">{f.relative(c.updated_at)}</td>
                    <td className="px-5 py-4 text-right">
                      <StatusPill tone={CANDIDATE_STATUS[c.status].tone} label={tg(`labels.candidateStatus.${c.status}`)} />
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
