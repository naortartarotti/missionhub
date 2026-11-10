import Link from "next/link";
import { ArrowDownLeft, ArrowRight, CheckCircle2, CircleDollarSign, Handshake, MessageCircleQuestion, Sparkles, type LucideIcon } from "lucide-react";
import { Panel } from "@/components/shared/card";
import { waitTone } from "@/features/referrals/review";
import { cn } from "@/lib/utils";
import { getFormatter, getT } from "@/i18n/server";
import type { OverviewData } from "../data";

/** Icon chip colors follow the referral direction language: inbound = blue, outbound = lilac. */
const KIND = {
  referral: { icon: ArrowDownLeft, chip: "bg-tile-blue" },
  matches: { icon: Sparkles, chip: "bg-tile-lilac" },
  info: { icon: MessageCircleQuestion, chip: "bg-tile-lilac" },
  agreement: { icon: Handshake, chip: "bg-tile-lilac" },
  payout: { icon: CircleDollarSign, chip: "bg-tile-green" },
} satisfies Record<string, { icon: LucideIcon; chip: string }>;

type Status = { label: string; tone: "neutral" | "warn" | "late" | "info" };

export type AttentionItemView = {
  key: string;
  kind: keyof typeof KIND;
  title: string;
  /** The job (or other subject) the action is about. */
  subject?: string;
  description?: string;
  status?: Status;
  action: string;
  href: string;
};

const STATUS_STYLE: Record<Status["tone"], string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-info-soft text-info",
  warn: "bg-warning-soft text-warning",
  late: "bg-danger-soft text-danger",
};

/**
 * The dashboard's action queue, in priority order: referrals to decide, match decisions, then the
 * other steps that are waiting on this organization. Only real, actionable items; no invented urgency.
 */
export async function AttentionQueue({ base, data }: { base: string; data: OverviewData }) {
  const [t, f] = await Promise.all([getT("overview"), getFormatter()]);
  const a = data.attention;

  const items: AttentionItemView[] = [
    ...a.referrals.map((r): AttentionItemView => {
      const wait = waitTone(r.submittedAt);
      return {
        key: `r-${r.id}`,
        kind: "referral",
        title: t("attention.referral.title"),
        subject: r.jobTitle,
        description: r.partner ? t("attention.referral.body", { candidate: r.candidate, partner: r.partner }) : r.candidate,
        status: { label: f.relative(r.submittedAt), tone: wait === "ok" ? "neutral" : wait },
        action: t("attention.referral.action"),
        href: `${base}/referrals?tab=received&r=${r.id}`,
      };
    }),
    ...(a.referralsTotal > a.referrals.length
      ? [{
          key: "r-more",
          kind: "referral" as const,
          title: t("attention.moreReferrals.title", { count: a.referralsTotal - a.referrals.length }),
          action: t("attention.moreReferrals.action"),
          href: `${base}/referrals?tab=received`,
        }]
      : []),
    ...(data.canMatch && a.matches.count > 0
      ? [{
          key: "matches",
          kind: "matches" as const,
          title: t("attention.matches.title"),
          description: t("attention.matches.body", { count: a.matches.jobs }),
          status: a.matches.fresh ? { label: t("attention.matches.fresh", { count: a.matches.fresh }), tone: "info" as const } : undefined,
          action: t("attention.matches.action"),
          href: `${base}/opportunities`,
        }]
      : []),
    ...a.infoRequests.map((r): AttentionItemView => ({
      key: `i-${r.id}`,
      kind: "info",
      title: t("attention.info.title"),
      subject: r.jobTitle,
      description: r.candidate,
      action: t("attention.info.action"),
      href: `${base}/referrals/${r.id}`,
    })),
    ...(a.infoRequestsTotal > a.infoRequests.length
      ? [{
          key: "i-more",
          kind: "info" as const,
          title: t("attention.moreInfo.title", { count: a.infoRequestsTotal - a.infoRequests.length }),
          action: t("attention.moreInfo.action"),
          href: `${base}/referrals?tab=sent`,
        }]
      : []),
    ...a.agreements.map((r): AttentionItemView => ({
      key: `a-${r.id}`,
      kind: "agreement",
      title: t("attention.agreement.title"),
      subject: r.jobTitle,
      description: r.candidate,
      action: t("attention.agreement.action"),
      href: `${base}/referrals/${r.id}`,
    })),
    ...a.payouts.map((p): AttentionItemView => ({
      key: `p-${p.id}`,
      kind: "payout",
      title: t("attention.payout.title"),
      subject: p.jobTitle,
      description: p.candidate,
      action: t("attention.payout.action"),
      href: `${base}/wallet/placements/${p.id}`,
    })),
  ];

  return (
    <section aria-labelledby="attention-title">
      <Panel className="p-2 sm:p-3">
        <h2 id="attention-title" className="px-3 pb-1 pt-2 text-lg font-semibold tracking-tight">{t("attention.title")}</h2>
        {items.length ? (
          <ul className="divide-y divide-border/60">
            {items.map((item) => (
              <li key={item.key}>
                <AttentionItem item={item} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col gap-3 px-3 pb-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-3 text-sm font-medium">
              <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
              {t("attention.empty.title")}
            </p>
            <div className="flex shrink-0 gap-2 pl-8 sm:pl-0">
              <Link href={`${base}/candidates/new`} className="rounded-full border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted">{t("attention.empty.addCandidate")}</Link>
              <Link href={`${base}/jobs/new`} className="rounded-full border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted">{t("attention.empty.newJob")}</Link>
            </div>
          </div>
        )}
      </Panel>
    </section>
  );
}

function AttentionItem({ item }: { item: AttentionItemView }) {
  const { icon: Icon, chip } = KIND[item.kind];
  return (
    <Link
      href={item.href}
      className="group flex min-h-14 items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-2"
    >
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full text-tile-foreground", chip)} aria-hidden>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold">{item.title}</span>
          {item.subject ? <span className="min-w-0 truncate text-sm text-foreground/80">{item.subject}</span> : null}
        </span>
        {item.description ? <span className="mt-0.5 block truncate text-sm text-muted-foreground">{item.description}</span> : null}
        {item.status ? (
          <span className={cn("mt-1.5 inline-flex rounded-full px-2 py-0.5 text-xs font-medium md:hidden", STATUS_STYLE[item.status.tone])}>{item.status.label}</span>
        ) : null}
      </span>
      {item.status ? (
        <span className={cn("hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-medium md:inline-flex", STATUS_STYLE[item.status.tone])}>{item.status.label}</span>
      ) : null}
      <span className="hidden shrink-0 items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium transition-colors group-hover:border-foreground/20 sm:inline-flex">
        {item.action}
        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground sm:hidden" aria-hidden />
    </Link>
  );
}
