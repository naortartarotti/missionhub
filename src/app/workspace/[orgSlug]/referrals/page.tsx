import Link from "next/link";
import { ArrowLeftRight, CheckCircle2 } from "lucide-react";
import { getRequestContext } from "@/server/auth/context";
import { getReferralDetail, listReceivedQueue, listSentByJob, receivedCounts, receivedJobs, type QueueRow, type ReceivedJob } from "@/features/referrals/queries";
import { BUCKET_KEYS, CLOSED_STATUSES, DECIDABLE, REFERRAL_STAGES, STAGE_INDEX, PAGE_SIZE, QUEUE_SORTS, isDeclineReason, salaryFit, skillCoverage, waitTone, type Bucket, type FitEvidence, type QueueSort, type Snapshot } from "@/features/referrals/review";
import { QueueJobFilter, QueueList, ReviewPanel, type PanelView, type QueueGroup, type ReqCheck, type RowView } from "@/features/referrals/components/review-queue";
import { evidenceText } from "@/features/matching/evidence";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Panel } from "@/components/shared/card";
import { StatusPill } from "@/components/shared/status-pill";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { JOB_STATUS, REFERRAL_STATUS } from "@/lib/labels";
import { DIRECTION_STYLE } from "@/features/referrals/components/direction-badge";
import { ScoreRing } from "@/features/matching/components/score-ring";
import { bpsToPercent } from "@/lib/money/format";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";
import type { Formatter } from "@/i18n/format";
import type { GlobalTranslator, Paths, Translator } from "@/i18n/translate";
import type { Messages } from "@/i18n/messages";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  return { title: (await getT("referrals"))("title") };
}

const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export default async function ReferralsPage({ params, searchParams }: PageProps<"/workspace/[orgSlug]/referrals">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await getRequestContext(orgSlug);
  const [t, tg, f] = await Promise.all([getT("referrals"), getGlobalT(), getFormatter()]);
  const pendingCount = await receivedCounts(ctx).then((c) => c.review);
  // Land on "Received" when submissions are waiting for a decision (matches the sidebar badge).
  const tab: "sent" | "received" = sp.tab === "received" || (!sp.tab && pendingCount > 0) ? "received" : "sent";
  // Sent and Received are separate pages in the sidebar ("Referrals sent" / "Referrals received"),
  // so each view stands alone here with its own title, without a direction switcher.
  return (
    <div className="grid gap-6">
      <PageHeader title={t(`pages.${tab}.title`)} description={t(`pages.${tab}.description`)} />
      {tab === "sent" ? <SentTable orgSlug={orgSlug} /> : <ReceivedQueue orgSlug={orgSlug} sp={sp} t={t} tg={tg} f={f} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Received: the review queue

async function ReceivedQueue({ orgSlug, sp, t, tg, f }: { orgSlug: string; sp: Record<string, string | string[] | undefined>; t: Translator<"referrals">; tg: GlobalTranslator; f: Formatter }) {
  const ctx = await getRequestContext(orgSlug);
  const bucket = pick(BUCKET_KEYS, sp.bucket, "review") as Bucket;
  const sort = pick(QUEUE_SORTS, sp.sort, "fit") as QueueSort;
  const jobId = str(sp.job);
  const page = Math.max(1, Number(sp.page) || 1);
  const selectedId = str(sp.r);

  const [jobs, counts, { rows, total }, detail] = await Promise.all([
    receivedJobs(ctx),
    receivedCounts(ctx, jobId),
    listReceivedQueue(ctx, { bucket, jobId, sort, page }),
    selectedId ? getReferralDetail(ctx, selectedId) : Promise.resolve(null),
  ]);
  const jobById = new Map(jobs.map((j) => [j.id, j]));

  const base = `/workspace/${orgSlug}/referrals`;
  const state = { tab: "received", bucket, sort, job: jobId, page: page > 1 ? String(page) : undefined };
  const qs = (patch: Record<string, string | undefined>) => {
    const next = { ...state, ...patch };
    const defaults: Record<string, string> = { bucket: "review", sort: "fit" };
    return `${base}?${new URLSearchParams(Object.entries(next).filter(([k, v]) => v && defaults[k] !== v) as [string, string][])}`;
  };

  const allTotal = counts.review + counts.active + counts.closed;
  if (!jobId && allTotal === 0) {
    return (
      <EmptyState
        icon={ArrowLeftRight}
        title={t("empty.received.title")}
        description={t("empty.received.description")}
        action={<Button variant="outline" asChild><Link href={`/workspace/${orgSlug}/jobs`}>{t("empty.received.action")}</Link></Button>}
      />
    );
  }

  const rowViews: RowView[] = rows.map((r) => toRowView(r, jobById.get(r.job_id), { bucket, selected: r.id === selectedId, href: r.id === selectedId ? qs({}) : qs({ r: r.id }), t, tg, f }));
  // Group this page's referrals by job, in the order the sort put them (best/oldest/newest first).
  const groups: QueueGroup[] = [];
  rows.forEach((r, i) => {
    let g = groups.find((x) => x.id === r.job_id);
    if (!g) {
      const job = jobById.get(r.job_id);
      const pending = job?.pending ?? 0;
      g = {
        id: r.job_id,
        eyebrow: t("direction.yourJob"),
        title: job?.title ?? r.job_title_snapshot,
        meta: pending ? t("queue.group.waiting", { count: pending }) : t("queue.group.noneWaiting"),
        jobHref: `/workspace/${orgSlug}/jobs/${r.job_id}`,
        jobLinkLabel: t("queue.group.viewJob"),
        rows: [],
      };
      groups.push(g);
    }
    g.rows.push(rowViews[i]);
  });
  const idx = rows.findIndex((r) => r.id === selectedId);
  const neighbour = idx >= 0 ? (rows[idx + 1] ?? rows[idx - 1]) : undefined;
  const panel =
    detail && detail.side === "target"
      ? toPanelView(detail, jobById.get(detail.referral.job_id), {
          orgSlug,
          closeHref: qs({}),
          nextHref: neighbour ? qs({ r: neighbour.id }) : qs({}),
          t,
          tg,
          f,
        })
      : null;

  const jobOptions = jobs.map((j) => ({ id: j.id, label: j.pending ? t("queue.jobOption", { title: j.title, count: j.pending }) : j.title }));
  const hrefFor = Object.fromEntries([["", qs({ job: undefined, page: undefined, r: undefined })], ...jobs.map((j) => [j.id, qs({ job: j.id, page: undefined, r: undefined })])]);

  return (
    <div
      className={cn(
        "grid lg:items-start lg:transition-[grid-template-columns] lg:duration-500 lg:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        panel ? "lg:grid-cols-[minmax(0,1fr)_30rem]" : "lg:grid-cols-[minmax(0,1fr)_0rem]",
      )}
    >
      <div className="grid min-w-0 content-start gap-4">
        {/* Toolbar: stage tabs · job filter · sort */}
        <div className="flex flex-wrap items-center gap-3">
          <nav aria-label={t("queue.bucketNav")} className="flex flex-wrap gap-1 rounded-full border border-border bg-card p-1">
            {BUCKET_KEYS.map((b) => (
              <Link
                key={b}
                href={qs({ bucket: b, page: undefined, r: undefined })}
                aria-current={bucket === b ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                  bucket === b ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`queue.buckets.${b}`)}
                {counts[b] ? <span className="text-xs tabular-nums opacity-70">{counts[b]}</span> : null}
              </Link>
            ))}
          </nav>
          {jobs.length > 1 ? <QueueJobFilter value={jobId ?? ""} options={jobOptions} allLabel={t("queue.allJobs")} hrefFor={hrefFor} /> : null}
          {total > 1 ? (
            <div role="group" aria-label={t("queue.sortLabel")} className="ml-auto inline-flex items-center gap-1 text-sm">
              {QUEUE_SORTS.map((s) => (
                <Link
                  key={s}
                  href={qs({ sort: s, page: undefined })}
                  aria-current={sort === s ? "true" : undefined}
                  className={cn("rounded-full px-3 py-1.5 font-medium transition-colors", sort === s ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {t(`queue.sorts.${s}`)}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        {rows.length === 0 ? (
          bucket === "review" ? (
            <EmptyState icon={CheckCircle2} title={t("queue.caughtUp.title")} description={t("queue.caughtUp.description")} />
          ) : (
            <Panel className="text-sm text-muted-foreground">{t("queue.emptyBucket")}</Panel>
          )
        ) : (
          <QueueList groups={groups} orgSlug={orgSlug} />
        )}
        <Pagination
          base={base}
          params={Object.fromEntries(Object.entries({ tab: "received", bucket, sort, job: jobId }).filter(([, v]) => v)) as Record<string, string>}
          page={page}
          total={total}
          pageSize={PAGE_SIZE}
        />
      </div>
      <div className="min-w-0 lg:sticky lg:top-[calc(var(--page-header-h,5.5rem)_+_1rem)] lg:overflow-hidden lg:py-1 lg:pr-1 lg:pl-6">
        {panel ? <ReviewPanel view={panel} orgSlug={orgSlug} /> : null}
      </div>
    </div>
  );
}

type Ctx = { t: Translator<"referrals">; tg: GlobalTranslator; f: Formatter };

const seniorityText = (s: Snapshot, { t, tg }: Ctx) =>
  [s.seniority ? tg(`labels.seniority.${s.seniority}` as Paths<Messages>) : null, s.years_experience != null ? t("detail.fields.years", { count: s.years_experience }) : null]
    .filter(Boolean)
    .join(" · ");

const salaryText = (s: Snapshot, f: Formatter) =>
  s.salary_expectation_min != null || s.salary_expectation_max != null
    ? [s.salary_expectation_min, s.salary_expectation_max].filter((v) => v != null).map((v) => f.money(v, s.salary_currency ?? "CAD", { whole: true })).join(" – ")
    : null;

function toRowView(r: QueueRow, job: ReceivedJob | undefined, o: Ctx & { bucket: Bucket; selected: boolean; href: string }): RowView {
  const snap = (r.profile?.snapshot ?? null) as Snapshot | null;
  const cov = job && job.required_skills.length ? skillCoverage(snap, job) : null;
  const facts = snap ? [seniorityText(snap, o), snap.location ?? null, snap.available_from ? o.t("queue.availableFrom", { date: o.f.date(snap.available_from) }) : null].filter(Boolean) as string[] : [];
  const pending = o.bucket === "review";
  return {
    id: r.id,
    href: o.href,
    selected: o.selected,
    label: r.candidate_label,
    score: r.fit_score,
    partner: r.source_org?.name ?? "",
    ago: o.f.relative(r.submitted_at),
    wait: waitTone(r.submitted_at),
    status: pending && r.status === "submitted" ? null : { label: o.tg(`labels.referralStatus.${r.status}`), tone: REFERRAL_STATUS[r.status].tone },
    facts,
    salary: job ? salaryFit(snap, job) : null,
    coverage: cov ? { has: cov.has.length, total: job!.required_skills.length } : null,
    docs: r.grants?.[0]?.count ?? 0,
    revoked: Boolean(r.sharing_revoked_at),
    selectable: pending,
  };
}

type Detail = NonNullable<Awaited<ReturnType<typeof getReferralDetail>>>;

function toPanelView(d: Detail, job: ReceivedJob | undefined, o: Ctx & { orgSlug: string; closeHref: string; nextHref: string }): PanelView {
  const { t, tg, f } = o;
  const r = d.referral;
  const snap = (d.profile?.snapshot ?? null) as Snapshot | null;
  const evidence = (r.fit_evidence ?? { reasons: [], gaps: [] }) as FitEvidence;
  const gapFactors = new Set(evidence.gaps.map((g) => g.factor));
  const notShared = t("queue.notShared");
  const checks: ReqCheck[] = [];
  if (snap) {
    const sen = seniorityText(snap, o);
    checks.push({
      label: t("detail.fields.seniority"),
      value: sen ? (job?.seniority ? t("queue.vsRequirement", { value: sen, req: tg(`labels.seniority.${job.seniority}` as Paths<Messages>) }) : sen) : notShared,
      state: !sen ? "unknown" : gapFactors.has("seniority") || gapFactors.has("experience") ? "warn" : "ok",
    });
    const sal = salaryText(snap, f);
    const fit = job ? salaryFit(snap, job) : null;
    const budget = job?.salary_max != null ? f.money(job.salary_max, job.salary_currency, { whole: true }) : null;
    checks.push({
      label: t("detail.fields.salary"),
      value: sal ? (budget ? t("queue.vsBudget", { value: sal, budget }) : sal) : notShared,
      state: !sal ? "unknown" : fit === "above" ? "warn" : "ok",
    });
    const loc = [snap.location, snap.work_arrangements?.map((a) => tg(`labels.arrangement.${a}` as Paths<Messages>)).join(", "), snap.open_to_relocation ? t("detail.fields.openToRelocation") : null]
      .filter(Boolean)
      .join(" · ");
    checks.push({ label: t("detail.fields.location"), value: loc || notShared, state: !loc ? "unknown" : gapFactors.has("location") ? "warn" : "ok" });
    checks.push({
      label: t("detail.fields.available"),
      value: snap.available_from ? f.date(snap.available_from) : snap.available_from === null ? t("queue.notSet") : notShared,
      state: snap.available_from ? "ok" : "unknown",
    });
    if (snap.languages) {
      checks.push({ label: t("detail.fields.languages"), value: snap.languages.join(", ") || "—", state: gapFactors.has("languages") ? "warn" : "ok" });
    }
  }
  const cov = job && job.required_skills.length ? skillCoverage(snap, job) : null;
  const lastMsg = d.messages.at(-1);
  const partner = r.source_org?.name ?? "";
  const status = { label: tg(`labels.referralStatus.${r.status}`), tone: REFERRAL_STATUS[r.status].tone };
  const declined = r.status === "declined" && isDeclineReason(r.decline_reason) ? ` · ${t(`declineReasons.${r.decline_reason}`)}` : "";
  return {
    id: r.id,
    version: r.version,
    label: r.candidate_label,
    headline: snap?.headline ?? null,
    score: r.fit_score,
    partner,
    ago: f.relative(r.submitted_at),
    wait: waitTone(r.submitted_at),
    status: { ...status, label: status.label + declined },
    revoked: Boolean(r.sharing_revoked_at),
    identity: snap ? ([snap.full_name, snap.email, snap.phone].filter(Boolean) as string[]) : [],
    checks,
    skills: cov && job ? { required: job.required_skills, has: cov.has, missing: cov.missing, bonus: cov.bonus } : null,
    // Skills and salary are already shown above; keep the remaining matching notes.
    gaps: evidence.gaps.filter((g) => !["skills", "preferred_skills", "compensation"].includes(g.factor)).map((g) => evidenceText(g, tg)),
    summary: snap?.summary ?? null,
    experience: (snap?.experience ?? []).map((e) => ({
      title: e.title,
      meta: [e.company, `${e.start_date ? f.date(e.start_date) : "?"} – ${e.end_date ? f.date(e.end_date) : t("detail.present")}`].filter(Boolean).join(" · "),
    })),
    grants: d.grants,
    messages: {
      count: d.messages.length,
      last: lastMsg
        ? { who: lastMsg.author_side === "target" ? t("detail.you") : lastMsg.author?.full_name || t("detail.partnerRecruiter", { partner }), body: lastMsg.body, ago: f.relative(lastMsg.created_at) }
        : null,
    },
    agreement: d.agreement
      ? t("queue.agreementLine", { sourcing: bpsToPercent(d.agreement.sourcing_bps), owner: bpsToPercent(d.agreement.job_owner_bps), platform: bpsToPercent(d.agreement.platform_bps) })
      : null,
    decision: r.sharing_revoked_at ? "none" : DECIDABLE.has(r.status) ? "decide" : r.status === "info_requested" ? "waiting" : "none",
    fullHref: `/workspace/${o.orgSlug}/referrals/${r.id}`,
    closeHref: o.closeHref,
    nextHref: o.nextHref,
  };
}

// ---------------------------------------------------------------------------
// Sent: unchanged table


async function SentTable({ orgSlug }: { orgSlug: string }) {
  const ctx = await getRequestContext(orgSlug);
  const [t, tg, f, groups] = await Promise.all([getT("referrals"), getGlobalT(), getFormatter(), listSentByJob(ctx)]);
  const base = `/workspace/${orgSlug}/referrals`;
  if (groups.length === 0) {
    return (
      <EmptyState
        icon={ArrowLeftRight}
        title={t("empty.sent.title")}
        description={t("empty.sent.description")}
        action={<Button variant="outline" asChild><Link href={`/workspace/${orgSlug}/opportunities`}>{t("empty.sent.action")}</Link></Button>}
      />
    );
  }
  return (
    <div className="grid gap-4">
      {groups.map((g) => (
        <section key={g.jobId} aria-label={g.title} className="overflow-hidden rounded-3xl border border-border/60 bg-card">
          <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border/60 px-5 py-3.5">
            <div className="min-w-0">
              <p className="mb-0.5 inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <span className={cn("size-1.5 rounded-full", DIRECTION_STYLE.outbound.dot)} aria-hidden />
                {t("sent.eyebrow", { partner: g.partner })}
              </p>
              <h3 className="truncate text-base font-semibold tracking-tight">{g.title}</h3>
              <p className="text-xs text-muted-foreground">{t("sent.candidates", { count: g.referrals.length })}</p>
            </div>
            <div className="text-right">
              {g.job ? (
                <>
                  <StatusPill tone={JOB_STATUS[g.job.status].tone} label={t("sent.jobStatus", { status: tg(`labels.jobStatus.${g.job.status}`) })} />
                  <p className="mt-1 text-xs text-muted-foreground">{t("sent.jobUpdated", { time: f.relative(g.job.updatedAt) })}</p>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">{t("sent.jobStatusUnknown")}</span>
              )}
            </div>
          </header>
          <ul className="divide-y divide-border/50">
            {g.referrals.map((r) => {
              const closed = CLOSED_STATUSES.has(r.status);
              const stage = STAGE_INDEX[r.status] ?? 0;
              const ev = r.lastEvent;
              return (
                <li key={r.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 px-5 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
                  {/* Same fit score the hiring recruiter sees for this submission (frozen at submit). */}
                  {r.fit_score != null ? <ScoreRing score={r.fit_score} className="size-11 [&_span]:text-xs" /> : <span className="size-11" aria-hidden />}
                  <div className="min-w-0 self-center">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                      <Link href={`${base}/${r.id}`} className="font-medium underline-offset-4 hover:underline">{r.candidate?.full_name ?? r.candidate_label}</Link>
                      {r.candidate ? (
                        <Link href={`/workspace/${orgSlug}/candidates/${r.candidate.id}`} className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                          {t("sent.openCandidate")}
                        </Link>
                      ) : null}
                    </div>
                    {/* What the partner sees instead of the name until contact details are disclosed. */}
                    {r.candidate ? <p className="truncate text-xs text-muted-foreground">{t("sent.partnerSees", { label: r.candidate_label })}</p> : null}
                    {ev && ev.to_status !== "submitted" ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {ev.actor_side === "target"
                          ? t("sent.movedBy", { partner: g.partner, status: tg(`labels.referralStatus.${ev.to_status}`), time: f.relative(ev.created_at) })
                          : t("sent.movedByYou", { status: tg(`labels.referralStatus.${ev.to_status}`), time: f.relative(ev.created_at) })}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">{t("sent.submittedAt", { time: f.relative(r.submitted_at) })}</p>
                    )}
                    {ev?.reason ? <p className="mt-1.5 rounded-xl bg-muted/60 px-3 py-2 text-sm text-pretty">{isDeclineReason(ev.reason) ? t(`declineReasons.${ev.reason}`) : t("detail.reasonQuote", { reason: ev.reason })}</p> : null}
                  </div>
                  <div className="col-start-2 grid justify-items-start gap-2 sm:col-start-auto sm:justify-items-end">
                    <StatusPill tone={REFERRAL_STATUS[r.status].tone} label={tg(`labels.referralStatus.${r.status}`)} />
                    {/* Progress through the hiring recruiter's pipeline; closed referrals show no track. */}
                    {closed ? null : (
                      <ol className="flex items-center gap-1" aria-label={t("sent.progress", { step: stage + 1, total: REFERRAL_STAGES.length })}>
                        {REFERRAL_STAGES.map((s, i) => (
                          <li key={s} title={tg(`labels.referralStatus.${s}`)} className={cn("h-1.5 w-6 rounded-full", i <= stage ? "bg-foreground" : "bg-border")} />
                        ))}
                      </ol>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
