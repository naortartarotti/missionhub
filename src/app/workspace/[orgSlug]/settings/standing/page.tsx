import Link from "next/link";
import { notFound } from "next/navigation";
import { ScrollText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shared/card";
import { SectionTitle } from "@/components/shared/page-header";
import { StatusPill, type Tone } from "@/components/shared/status-pill";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BusinessDeadline } from "@/features/referrals/components/business-deadline";
import { getRequestContext } from "@/server/auth/context";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";
import { getNetworkStanding } from "@/features/network-rules/queries";
import { SANCTION_STATUS_TONE, sanctionStatusKey } from "@/features/network-rules/ui-state";

export async function generateMetadata() {
  return { title: (await getT("network"))("standing.title") };
}

const OUTCOME_KEY = { no_breach: "no_breach", insufficient_evidence: "not_enough", breach: "breach" } as const;

/**
 * S10 Network standing (§2.11): org_admin only (the RPC answers not_found to anyone else), also in
 * settlement mode. Notices, decisions and sanctions of this org; never the reporter.
 */
export default async function StandingPage({ params }: PageProps<"/workspace/[orgSlug]/settings/standing">) {
  const { orgSlug } = await params;
  const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
  if (ctx.membershipRole !== "org_admin") notFound();
  const s = await getNetworkStanding(ctx);
  if (!s) notFound();
  const [t, f, tg] = await Promise.all([getT("network"), getFormatter(), getGlobalT()]);
  const base = `/workspace/${orgSlug}/settings/standing`;
  const level = s.standing.level;

  const card: { tone: Tone; label: string; lines: string[] } = (() => {
    if (s.standing.legacy || level === "suspension") return { tone: "danger", label: t("standing.suspended"), lines: [t("standing.suspendedBody")] };
    switch (level) {
      case "termination":
        return { tone: "danger", label: t("standing.terminated"), lines: [t("standing.terminatedBody", { date: f.etDate(s.standing.since) })] };
      case "network_hold":
        return {
          tone: "warning",
          label: t("standing.hold"),
          lines: [t("standing.since", { date: f.etDate(s.standing.since) }), ...(s.standing.planned_review_on ? [t("standing.plannedReview", { date: f.date(s.standing.planned_review_on) }), t("standing.plannedReviewHint")] : [])],
        };
      case "warning":
        return { tone: "warning", label: t("standing.warning"), lines: [t("standing.warningUntil", { date: f.etDate(s.standing.expires_at) })] };
      default:
        return { tone: "success", label: t("standing.good"), lines: [t("standing.goodBody")] };
    }
  })();
  const meaning = (() => {
    if (level === "network_hold") return { paused: t("standing.meaning.holdPaused"), continues: t("standing.meaning.holdContinues") };
    if (level === "suspension" || level === "termination" || s.standing.legacy) return { paused: t("settlement.pausedList"), continues: t("settlement.continuesList") };
    if (level === "warning") return { note: t("standing.meaning.warning") };
    return null;
  })();

  type HistoryRow = { key: string; date: string; result: string; status: string; tone: Tone; href?: string };
  const history: HistoryRow[] = [
    ...s.history.sanctions.map((x) => ({
      key: `s-${x.id}`,
      date: x.applied_at,
      result: tg(`labels.sanctionLevel.${x.level}`),
      status: tg(`labels.sanctionStatus.${sanctionStatusKey(x.status)}`, { date: f.etDate(x.status === "expired" ? x.expires_at : x.ended_at) }),
      tone: SANCTION_STATUS_TONE[x.status],
      href: `${base}/${x.case_id}`,
    })),
    // Closed cases with no sanction row (no breach, not enough evidence, finding with no level).
    ...s.history.cases
      .filter((c) => !s.history.sanctions.some((x) => x.case_id === c.case_id))
      .map((c) => ({
        key: `c-${c.case_id}`,
        date: c.decided_at,
        result: c.outcome === "breach" && !c.level ? tg("labels.sanctionLevel.none") : tg(`labels.conductOutcome.${OUTCOME_KEY[c.outcome]}`),
        status: c.overturned_at ? tg("labels.sanctionStatus.overturned") : "—",
        tone: (c.overturned_at ? "info" : "neutral") as Tone,
        href: `${base}/${c.case_id}`,
      })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const pendingVersion = s.rules_not_accepted ?? null;
  const currentLabel = ctx.rules.required?.label ?? ctx.rules.current?.label;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h2 className="text-xl font-semibold tracking-tight">{t("standing.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("standing.description", { org: ctx.organizationName })}</p>
      </div>

      <Panel className="grid gap-3">
        <SectionTitle>{t("standing.current")}</SectionTitle>
        <StatusPill tone={card.tone} label={card.label} className="justify-self-start" />
        {card.lines.map((l) => (
          <p key={l} className="text-sm text-pretty">{l}</p>
        ))}
        {meaning ? (
          <details className="group rounded-2xl border border-border/60 px-4 py-3 text-sm">
            <summary className="min-h-9 cursor-pointer font-medium">{t("standing.whatThisMeans")}</summary>
            {"note" in meaning ? (
              <p className="mt-2 text-muted-foreground">{meaning.note}</p>
            ) : (
              <dl className="mt-2 grid gap-2">
                <dt className="font-medium">{t("standing.meaning.pausedTitle")}</dt>
                <dd className="text-muted-foreground">{meaning.paused}</dd>
                <dt className="font-medium">{t("standing.meaning.continuesTitle")}</dt>
                <dd className="text-muted-foreground">{meaning.continues}</dd>
              </dl>
            )}
          </details>
        ) : null}
        {pendingVersion ? (
          <div className="grid gap-2 rounded-2xl bg-info-soft px-4 py-3 text-sm sm:flex sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <ScrollText className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
              <div>
                <p className="font-medium">{t("standing.rulesRow", { label: pendingVersion.label })}</p>
                <p className="text-muted-foreground">{t("standing.rulesRowBody")}</p>
              </div>
            </div>
            <Button asChild size="sm" className="min-h-11 w-full sm:min-h-9 sm:w-auto">
              <Link href={`/workspace/${orgSlug}/accept-rules?v=${encodeURIComponent(pendingVersion.label)}`}>{t("banner.cta.accept")}</Link>
            </Button>
          </div>
        ) : null}
      </Panel>

      <section className="grid gap-3" aria-labelledby="open-notices">
        <h2 id="open-notices" className="text-lg font-semibold tracking-tight">{t("standing.openNotices")}</h2>
        {s.open_notices.length === 0 ? (
          <Panel className="flex items-center gap-3 text-sm text-muted-foreground">
            <ShieldCheck className="size-4" aria-hidden /> {t("standing.noNotices")}
          </Panel>
        ) : (
          <ul className="grid gap-3">
            {s.open_notices.map((n) => (
              <li key={n.notice_id}>
                <Panel className="grid gap-3 p-4 sm:flex sm:items-start sm:justify-between">
                  <div className="grid gap-1.5">
                    <p className="font-semibold">{n.kind === "immediate_hold" ? t("notice.headingImmediate") : t("notice.heading")}</p>
                    <p className="text-sm">{t("standing.noticeRules", { rules: n.rules_cited.join(", ") })}</p>
                    <p className="text-sm text-muted-foreground">{t("standing.noticeSent", { date: f.etDate(n.sent_at) })}</p>
                    {!n.responded ? <BusinessDeadline label={t("standing.deadlineLabel")} at={n.response_due_at} left={n.business_days_left < 0 ? null : n.business_days_left} /> : null}
                  </div>
                  <Button asChild variant="outline" size="sm" className="min-h-11 w-full sm:min-h-9 sm:w-auto">
                    <Link href={`${base}/${n.case_id}`}>{t("standing.open")}</Link>
                  </Button>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3" aria-labelledby="standing-history">
        <h2 id="standing-history" className="text-lg font-semibold tracking-tight">{t("standing.history")}</h2>
        {history.length === 0 ? (
          <Panel className="text-sm text-muted-foreground">{t("standing.historyEmpty")}</Panel>
        ) : (
          <>
            <ul className="grid gap-2 md:hidden">
              {history.map((h) => (
                <li key={h.key}>
                  <Panel className="grid gap-2 p-4">
                    <p className="text-sm text-muted-foreground">{f.etDate(h.date)}</p>
                    <p className="font-medium">{h.result}</p>
                    {h.status !== "—" ? <StatusPill tone={h.tone} label={h.status} className="justify-self-start" /> : null}
                    {h.href ? <Link href={h.href} className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">{t("standing.open")}</Link> : null}
                  </Panel>
                </li>
              ))}
            </ul>
            <Panel className="hidden p-0 md:block">
              <Table>
                <TableCaption className="sr-only">{t("standing.historyCaption")}</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("standing.col.date")}</TableHead>
                    <TableHead>{t("standing.col.result")}</TableHead>
                    <TableHead>{t("standing.col.status")}</TableHead>
                    <TableHead><span className="sr-only">{t("standing.open")}</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => (
                    <TableRow key={h.key}>
                      <TableCell className="whitespace-nowrap">{f.etDate(h.date)}</TableCell>
                      <TableCell>{h.result}</TableCell>
                      <TableCell>{h.status !== "—" ? <StatusPill tone={h.tone} label={h.status} /> : "—"}</TableCell>
                      <TableCell>{h.href ? <Link href={h.href} className="text-sm font-medium underline underline-offset-4">{t("standing.open")}</Link> : null}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          </>
        )}
      </section>

      <Panel className="grid gap-3">
        <SectionTitle>{t("standing.acceptance")}</SectionTitle>
        {pendingVersion ? <p className="text-sm font-medium">{t("standing.notAcceptedOrg", { label: pendingVersion.label })}</p> : null}
        <ul className="grid gap-1.5 text-sm">
          {s.acceptances.map((a) => (
            <li key={a.version_id}>{t("standing.acceptedBy", { label: a.label, date: f.etDate(a.accepted_at), name: a.accepted_by_name ?? "—" })}</li>
          ))}
        </ul>
        {currentLabel ? (
          s.members_not_accepted.filter((m) => !m.accepted_current).length ? (
            <div className="grid gap-1.5">
              <p className="text-sm font-medium">{t("standing.notAcceptedMembers", { label: currentLabel })}</p>
              <ul className="list-disc pl-5 text-sm text-muted-foreground">
                {s.members_not_accepted.filter((m) => !m.accepted_current).map((m) => (
                  <li key={m.user_id}>{m.name}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("standing.allMembersAccepted", { label: currentLabel })}</p>
          )
        ) : null}
      </Panel>

      {s.incident_notices.length ? (
        <section className="grid gap-3" aria-labelledby="incident-notices">
          <div className="grid gap-1">
            <h2 id="incident-notices" className="text-lg font-semibold tracking-tight">{t("incident.section")}</h2>
            <p className="text-sm text-muted-foreground">{t("incident.sectionHint")}</p>
          </div>
          <ul className="grid gap-3">
            {s.incident_notices.map((n) => (
              <li key={n.id}>
                <Panel className="grid gap-2 p-4 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{t("incident.title")}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("incident.cardSent", { date: f.etDate(n.sent_at) })} · {t("incident.cardReferrals", { count: n.referral_count })}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="min-h-11 w-full sm:min-h-9 sm:w-auto">
                    <Link href={`${base}/incidents/${n.id}`}>{t("standing.open")}</Link>
                  </Button>
                </Panel>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

