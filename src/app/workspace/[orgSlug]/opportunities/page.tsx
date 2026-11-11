import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox, Sparkles } from "lucide-react";
import { getRequestContext } from "@/server/auth/context";
import { listOpportunities, needsDecision, type Opportunity } from "@/features/matching/queries";
import { countReferralsByCandidate, type CandidateReferralStats } from "@/features/candidates/queries";
import { MarkSeen } from "@/features/matching/components/mark-seen";
import { MatchPanel, type OpportunityView } from "@/features/matching/components/opportunity-card";
import { JobMatchRow } from "@/features/matching/components/job-match-row";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";
import type { Formatter } from "@/i18n/format";
import type { GlobalTranslator, Translator } from "@/i18n/translate";
import { cn } from "@/lib/utils";
import { InternalBadge } from "@/features/matching/components/internal-badge";

export async function generateMetadata() {
  return { title: (await getT("opportunities"))("title") };
}

type T = Translator<"opportunities">;

// Labels live in `opportunities.views.<key>`, `.sorts.<key>` and `.groupBy.<key>`.
// Submitted matches are not a view: once sent, a match becomes a referral and lives in Referrals sent.
const VIEWS = [{ key: "review" }, { key: "saved" }, { key: "dismissed" }, { key: "not_eligible" }] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

const SORTS = [{ key: "fit" }, { key: "earnings" }] as const;
type SortKey = (typeof SORTS)[number]["key"];

const GROUPS = [{ key: "job" }, { key: "candidate" }] as const;
type GroupKey = (typeof GROUPS)[number]["key"];

function inView(o: Opportunity, view: ViewKey) {
  switch (view) {
    case "review":
      return needsDecision(o) && o.triage_state !== "saved";
    case "saved":
      return needsDecision(o) && o.triage_state === "saved";
    case "dismissed":
      return o.band !== "not_eligible" && !o.referral_id && o.triage_state === "dismissed";
    case "not_eligible":
      return o.band === "not_eligible";
  }
}

const pick = <T extends readonly { key: string }[]>(list: T, v: unknown, fallback: T[number]["key"]) =>
  (list.find((x) => x.key === v)?.key ?? fallback) as T[number]["key"];

export default async function OpportunitiesPage({ params, searchParams }: PageProps<"/workspace/[orgSlug]/opportunities">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  // The old "Submitted" tab moved to Referrals sent.
  if (sp.view === "submitted") redirect(`/workspace/${orgSlug}/referrals?tab=sent`);
  const ctx = await getRequestContext(orgSlug);
  const [t, tg, f] = await Promise.all([getT("opportunities"), getGlobalT(), getFormatter()]);
  const candidate = typeof sp.candidate === "string" ? sp.candidate : undefined;
  const jobFilter = typeof sp.job === "string" ? sp.job : undefined;
  // `band` is the pre-inbox parameter; keep old links working.
  const legacyView = sp.band === "not_eligible" ? "not_eligible" : undefined;
  const view = pick(VIEWS, sp.view ?? legacyView, "review") as ViewKey;
  const sort = pick(SORTS, sp.sort, "fit") as SortKey;
  const group = pick(GROUPS, sp.group, "job") as GroupKey;

  const [allRaw, activeCandidates] = await Promise.all([
    listOpportunities(ctx, { candidateId: candidate }),
    ctx.db.from("candidates").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organizationId).eq("status", "active_for_matching"),
  ]);
  // `?job=` (from the dashboard) narrows the page to one partner job.
  const all = jobFilter ? allRaw.filter((o) => o.job_id === jobFilter) : allRaw;
  const hasActive = (activeCandidates.count ?? 0) > 0;
  const counts = Object.fromEntries(VIEWS.map((v) => [v.key, all.filter((o) => inView(o, v.key)).length])) as Record<ViewKey, number>;
  const newCount = all.filter((o) => inView(o, "review") && o.is_new).length;

  const earnings = (o: Opportunity) => o.your_share_minor ?? -1;
  const rows = (all.filter((o) => inView(o, view)) as unknown as OpportunityView[]).sort((a, b) =>
    sort === "earnings" ? earnings(b as never) - earnings(a as never) || b.score - a.score : b.score - a.score,
  );

  const byCandidate = group === "candidate" && !candidate && !jobFilter;
  const referralStats = byCandidate ? await countReferralsByCandidate(ctx, [...new Set(rows.map((o) => o.candidate_id))]) : new Map<string, CandidateReferralStats>();

  const unseen = rows.filter((o) => o.is_new).map((o) => o.match_id);

  const base = `/workspace/${orgSlug}/opportunities`;
  const qs = (patch: Record<string, string | undefined>) => {
    const next = { view, sort, group, ...(candidate ? { candidate } : {}), ...(jobFilter ? { job: jobFilter } : {}), ...patch };
    const defaults: Record<string, string> = { view: "review", sort: "fit", group: "job" };
    const entries = Object.entries(next).filter(([k, v]) => v && defaults[k] !== v) as [string, string][];
    return entries.length ? `${base}?${new URLSearchParams(entries)}` : base;
  };

  // Split view: `?match=<id>` opens that match's details beside the list. Filters/tabs drop it (qs omits it).
  const selectedId = typeof sp.match === "string" ? sp.match : undefined;
  const selected = selectedId ? (all.find((o) => o.match_id === selectedId) as unknown as OpportunityView | undefined) : undefined;
  const detail: Detail = (o) => ({
    detailHref: o.match_id === selected?.match_id ? qs({}) : qs({ match: o.match_id }),
    selected: o.match_id === selected?.match_id,
  });

  return (
    <div className="grid gap-6">
    <PageHeader title={t("title")} description={t("description")} />
    {/* The panel column animates between 0 and its width, so the list narrows/widens smoothly. */}
    <div
      className={cn(
        "grid lg:items-start lg:transition-[grid-template-columns] lg:duration-500 lg:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        selected ? "lg:grid-cols-[minmax(0,1fr)_30rem]" : "lg:grid-cols-[minmax(0,1fr)_0rem]",
      )}
    >
    <div className="grid min-w-0 content-start gap-6">
      <MarkSeen orgSlug={orgSlug} ids={unseen} />

      {jobFilter ? (
        <p className="text-sm text-muted-foreground">
          {t("filteredByJob")} <Link href={base} className="font-medium text-foreground underline-offset-4 hover:underline">{tg("common.actions.showAll")}</Link>
        </p>
      ) : null}
      {candidate ? (
        <p className="text-sm text-muted-foreground">
          {t("filteredByCandidate")} <Link href={base} className="font-medium text-foreground underline-offset-4 hover:underline">{tg("common.actions.showAll")}</Link>
        </p>
      ) : null}

      {/* One toolbar row: status tabs on the left, sort on the right. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t("statusNav")} className="flex flex-wrap gap-1 rounded-full border border-border bg-card p-1">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={qs({ view: v.key })}
              title={t(`views.${v.key}.hint`)}
              aria-current={view === v.key ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                view === v.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`views.${v.key}.label`)}
              {counts[v.key] ? <span className={cn("tabular-nums text-xs", view === v.key ? "opacity-70" : "opacity-60")}>{counts[v.key]}</span> : null}
              {v.key === "review" && newCount ? <span className="sr-only">{t("newCount", { count: newCount })}</span> : null}
            </Link>
          ))}
        </nav>
        {rows.length > 1 ? (
          <div className="flex flex-wrap items-center gap-3">
            {/* Grouping only matters with more than one candidate or job in play. */}
            {!candidate && !jobFilter ? <Toggle label={t("controls.groupBy")} items={GROUPS.map((g) => ({ key: g.key, label: t(`groupBy.${g.key}`), href: qs({ group: g.key }) }))} current={group} /> : null}
            <Toggle label={t("controls.sort")} items={SORTS.map((o) => ({ key: o.key, label: t(`sorts.${o.key}`), href: qs({ sort: o.key }) }))} current={sort} />
          </div>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <Empty t={t} view={view} hasActive={hasActive} orgSlug={orgSlug} counts={counts} qs={qs} hasAny={all.length > 0} />
      ) : (
        byCandidate ? (
          <CandidateGroups t={t} f={f} rows={rows} orgSlug={orgSlug} sort={sort} detail={detail} referralStats={referralStats} />
        ) : (
          <JobGroups t={t} tg={tg} f={f} rows={rows} orgSlug={orgSlug} sort={sort} detail={detail} />
        )
      )}
    </div>
    {/* Fixed-width panel inside a clipping column: content never reflows while the column animates. */}
    <div className="min-w-0 lg:sticky lg:top-[calc(var(--page-header-h,5.5rem)_+_1rem)] lg:overflow-hidden lg:py-1 lg:pr-1 lg:pl-6">
      {selected ? <MatchPanel opp={selected} orgSlug={orgSlug} closeHref={qs({})} /> : null}
    </div>
    </div>
    </div>
  );
}

function Toggle({ label, items, current }: { label: string; items: { key: string; label: string; href: string }[]; current: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-1 text-sm">
      {items.map((o) => (
        <Link
          key={o.key}
          href={o.href}
          aria-current={current === o.key ? "true" : undefined}
          className={cn("rounded-full px-3 py-1.5 font-medium transition-colors", current === o.key ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

function groupBy(rows: OpportunityView[], key: (o: OpportunityView) => string, sort: SortKey) {
  const map = new Map<string, OpportunityView[]>();
  for (const o of rows) map.set(key(o), [...(map.get(key(o)) ?? []), o]);
  const metric = (items: OpportunityView[]) =>
    sort === "earnings" ? Math.max(...items.map((o) => o.your_share_minor ?? -1)) : Math.max(...items.map((o) => o.score));
  return [...map.values()].sort((a, b) => metric(b) - metric(a));
}

type Detail = (o: OpportunityView) => { detailHref: string; selected: boolean };

function JobGroups({ t, tg, f, rows, orgSlug, sort, detail }: { t: T; tg: GlobalTranslator; f: Formatter; rows: OpportunityView[]; orgSlug: string; sort: SortKey; detail: Detail }) {
  return (
    <div className="grid gap-4">
      {groupBy(rows, (o) => o.job_id, sort).map((items) => {
        const j = items[0];
        const meta = [j.job_org_name, j.client_label, [tg(`labels.arrangement.${j.work_arrangement}`), j.location].filter(Boolean).join(" · ")];
        return (
          <section key={j.job_id} aria-label={j.job_title} className="rounded-3xl border border-border/60 bg-card p-2">
            <header className="flex items-start justify-between gap-4 px-4 pt-3 pb-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold tracking-tight">{j.job_title}</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{t("jobGroup.candidates", { count: items.length })}</span>
                  {j.internal ? <InternalBadge org={j.job_org_name} /> : null}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{meta.join("  ·  ")}</p>
              </div>
              {j.your_share_minor ? (
                <div className="shrink-0 text-right">
                  <p className="text-lg font-semibold tabular-nums text-success">{f.money(j.your_share_minor, j.fee_currency ?? "CAD", { whole: true })}</p>
                  <p className="text-xs text-muted-foreground">{t("jobGroup.share")}</p>
                </div>
              ) : null}
            </header>
            <div className="grid gap-0.5 border-t border-border/60 pt-1.5">
              {items.map((o) => <JobMatchRow key={o.match_id} opp={o} orgSlug={orgSlug} {...detail(o)} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Same matches, one card per candidate: "where can I place this person?" */
function CandidateGroups({
  t,
  f,
  rows,
  orgSlug,
  sort,
  detail,
  referralStats,
}: {
  t: T;
  f: Formatter;
  rows: OpportunityView[];
  orgSlug: string;
  sort: SortKey;
  detail: Detail;
  referralStats: Map<string, CandidateReferralStats>;
}) {
  return (
    <div className="grid gap-4">
      {groupBy(rows, (o) => o.candidate_id, sort).map((items) => {
        const c = items[0];
        const best = items.reduce((m, o) => ((o.your_share_minor ?? 0) > (m.your_share_minor ?? 0) ? o : m), items[0]);
        const refs = referralStats.get(c.candidate_id);
        const refDetail = refs ? [refs.open ? t("candidateGroup.inProgress", { count: refs.open }) : null, refs.hired ? t("candidateGroup.hired", { count: refs.hired }) : null].filter(Boolean).join(" · ") : "";
        return (
          <section key={c.candidate_id} aria-label={c.candidate_name} className="rounded-3xl border border-border/60 bg-card p-2">
            <header className="flex items-start justify-between gap-4 px-4 pt-3 pb-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold tracking-tight">
                    <Link href={`/workspace/${orgSlug}/candidates/${c.candidate_id}`} className="underline-offset-4 hover:underline">{c.candidate_name}</Link>
                  </h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{t("candidateGroup.jobs", { count: items.length })}</span>
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{c.candidate_headline ?? t("card.noHeadline")}</p>
                {/* Track record so far: how often this person was already sent out, and how that went. */}
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {refs ? (
                    <Link href={`/workspace/${orgSlug}/candidates/${c.candidate_id}?tab=referrals`} className="underline-offset-4 hover:text-foreground hover:underline">
                      <span className="font-medium text-foreground">{t("candidateGroup.referrals", { count: refs.total })}</span>
                      {refDetail ? ` · ${refDetail}` : null}
                    </Link>
                  ) : (
                    t("candidateGroup.noReferrals")
                  )}
                </p>
              </div>
              {best.your_share_minor ? (
                <div className="shrink-0 text-right">
                  <p className="text-lg font-semibold tabular-nums text-success">{f.money(best.your_share_minor, best.fee_currency ?? "CAD", { whole: true })}</p>
                  <p className="text-xs text-muted-foreground">{t("candidateGroup.bestShare")}</p>
                </div>
              ) : null}
            </header>
            <div className="grid gap-0.5 border-t border-border/60 pt-1.5">
              {items.map((o) => <JobMatchRow key={o.match_id} opp={o} orgSlug={orgSlug} subject="job" {...detail(o)} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Empty({
  t,
  view,
  hasActive,
  hasAny,
  orgSlug,
  counts,
  qs,
}: {
  t: T;
  view: ViewKey;
  hasActive: boolean;
  hasAny: boolean;
  orgSlug: string;
  counts: Record<ViewKey, number>;
  qs: (p: Record<string, string | undefined>) => string;
}) {
  if (!hasActive) {
    return (
      <EmptyState
        icon={Sparkles}
        title={t("empty.inactive.title")}
        description={t("empty.inactive.description")}
        action={<Button asChild><Link href={`/workspace/${orgSlug}/candidates?status=draft`}>{t("empty.inactive.action")}</Link></Button>}
      />
    );
  }
  const key = view === "review" ? (hasAny ? "caughtUp" : "none") : view;
  const copy = { title: t(`empty.${key}.title`), description: t(`empty.${key}.description`) };
  const action =
    view !== "review" && counts.review ? (
      <Button variant="outline" asChild><Link href={qs({ view: "review" })}>{t("empty.reviewCount", { count: counts.review })}</Link></Button>
    ) : view === "review" && counts.saved ? (
      <Button variant="outline" asChild><Link href={qs({ view: "saved" })}>{t("empty.openSaved", { count: counts.saved })}</Link></Button>
    ) : undefined;
  return <EmptyState icon={view === "review" ? Inbox : Sparkles} title={copy.title} description={copy.description} action={action} />;
}
