import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shared/card";
import { PageHeader } from "@/components/shared/page-header";
import { getRequestContext, getSessionUser, listMemberships } from "@/server/auth/context";
import { createClient } from "@/server/supabase/server";
import { safeNext } from "@/features/auth/schemas";
import { getFormatter, getT } from "@/i18n/server";
import { isRulesLocale, type RulesLocale } from "../domain";
import { getRulesVersionByLabel, getRulesVersions } from "../queries";
import { defaultLocaleFor, getChangeSummaries, getMyAcceptances } from "../page-data";
import { isFutureInstant } from "../ui-state";
import { HistoryTable, RulesLanguageNav, UpcomingCard, VersionText, VersionsEmpty, VersionsShell } from "./versions-view";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * S4 versions page (BR-4): any signed-in user, any org state, no acceptance needed. `label` renders
 * one version (`/network-rules/[label]`); without it, the current version, the upcoming one and history.
 */
export async function NetworkRulesVersionsPage({ searchParams, label }: { searchParams: SP; label?: string }) {
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(label ? `/network-rules/${label}` : "/network-rules")}`);
  const db = await createClient();
  const [t, f, memberships] = await Promise.all([getT("network"), getFormatter(), listMemberships()]);

  // ?org= (an org the user is an active member of, settlement included) drives "Your status" and Québec.
  const orgSlug = one(searchParams.org);
  const member = orgSlug ? memberships.find((m) => m.slug === orgSlug) : undefined;
  const ctx = member ? await getRequestContext(member.slug, { allowSettlement: true }) : null;
  const defaultLocale = await defaultLocaleFor(ctx);
  const langParam = one(searchParams.lang);
  const locale: RulesLocale = isRulesLocale(langParam) ? langParam : defaultLocale;

  const fallbackBack = memberships[0] ? `/workspace/${memberships[0].slug}/overview` : "/onboarding";
  const backHref = safeNext(one(searchParams.from), fallbackBack);
  const keep = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ org: orgSlug, from: one(searchParams.from), lang: langParam, ...extra })) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `?${s}` : "";
  };
  const versionHref = (l: string) => `/network-rules/${encodeURIComponent(l)}${keep({})}`;

  const { current, upcoming, history } = await getRulesVersions(db);
  const header = (
    <>
      <PageHeader title={t("versions.title")} description={t("versions.description")} />
      <RulesLanguageNav active={locale} defaultLocale={defaultLocale} hrefFor={(l) => `${label ? `/network-rules/${encodeURIComponent(label)}` : "/network-rules"}${keep({ lang: l })}`} />
    </>
  );

  if (label) {
    const found = await getRulesVersionByLabel(db, label, locale);
    if (!found) notFound();
    const isFuture = isFutureInstant(found.version.effective_at);
    return (
      <VersionsShell user={user} backHref={backHref}>
        {header}
        <VersionText
          version={found.version}
          text={found.text}
          locale={locale}
          isFuture={isFuture}
          heading={current?.id === found.version.id ? t("versions.current", { label: found.version.label }) : isFuture ? t("versions.upcoming", { label: found.version.label }) : t("accept.title", { label: found.version.label })}
        />
      </VersionsShell>
    );
  }

  if (!current && !upcoming) {
    return (
      <VersionsShell user={user} backHref={backHref}>
        {header}
        <VersionsEmpty />
      </VersionsShell>
    );
  }

  const [summaries, currentText, mine] = await Promise.all([
    getChangeSummaries(db, locale),
    current ? getRulesVersionByLabel(db, current.label, locale) : Promise.resolve(null),
    ctx ? getMyAcceptances(db, user.id) : Promise.resolve([]),
  ]);

  // "Your status" (only with ?org= for an org the user belongs to).
  let status = null;
  if (ctx) {
    const required = ctx.rules.required ?? ctx.rules.current;
    const acceptedAt = mine.find((a) => a.version_id === required?.id)?.accepted_at ?? (ctx.rules.memberAcceptedCurrent ? mine[0]?.accepted_at : undefined);
    const isAdmin = ctx.membershipRole === "org_admin";
    if (required) {
      status = (
        <Panel className="grid gap-3">
          <h2 className="text-base font-semibold">{t("versions.statusTitle")}</h2>
          {ctx.rules.memberAcceptedCurrent && acceptedAt ? (
            <p className="text-sm">{t("versions.youAccepted", { label: required.label, date: f.etDate(acceptedAt) })}</p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm">{t("versions.youHaveNot", { label: required.label })}</p>
              <Button asChild size="sm" className="min-h-11 w-full sm:min-h-9 sm:w-auto">
                <Link href={`/workspace/${ctx.organizationSlug}/accept-rules?v=${encodeURIComponent(required.label)}`}>{t("banner.cta.accept")}</Link>
              </Button>
            </div>
          )}
          {isAdmin ? (
            <p className="text-sm text-muted-foreground">
              {ctx.rules.orgAcceptedCurrent?.at
                ? t("versions.orgAccepted", { org: ctx.organizationName, label: required.label, date: f.etDate(ctx.rules.orgAcceptedCurrent.at) })
                : t("versions.orgHasNot", { org: ctx.organizationName, label: required.label })}
            </p>
          ) : null}
        </Panel>
      );
    }
  }

  return (
    <VersionsShell user={user} backHref={backHref}>
      {header}
      {status}
      {upcoming ? <UpcomingCard version={upcoming} summary={summaries.get(upcoming.id) ?? null} href={versionHref(upcoming.label)} /> : null}
      {current ? <VersionText version={current} text={currentText?.text ?? null} locale={locale} isFuture={false} heading={t("versions.current", { label: current.label })} /> : null}
      <HistoryTable rows={history.map((v) => ({ ...v, summary: summaries.get(v.id) ?? null }))} hrefFor={versionHref} />
    </VersionsShell>
  );
}
