import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shared/card";
import { PageHeader } from "@/components/shared/page-header";
import { getRequestContext } from "@/server/auth/context";
import { safeNext } from "@/features/auth/schemas";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";
import { AcceptanceBlock } from "@/features/network-rules/components/acceptance-block";
import { getRulesVersions } from "@/features/network-rules/queries";
import { buildAcceptanceTexts, defaultLocaleFor, getMyAcceptances, getRulesVersionById, supportEmail } from "@/features/network-rules/page-data";
import { acceptanceNeeds } from "@/features/network-rules/ui-state";

export async function generateMetadata() {
  return { title: (await getT("network"))("versions.metaTitle") };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * S1 re-acceptance variant (§2.3 item 3). `?v=` picks the version (current or upcoming only; default:
 * upcoming if any, else current); `?next=` (safeNext) is where a successful acceptance goes.
 * Reachable in settlement mode from the versions page (BR-9 c), so it opts in.
 */
export default async function AcceptRulesPage({ params, searchParams }: PageProps<"/workspace/[orgSlug]/accept-rules">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
  const [t, f, tg] = await Promise.all([getT("network"), getFormatter(), getGlobalT()]);
  const overview = `/workspace/${orgSlug}/overview`;
  const nextHref = safeNext(one(sp.next), overview);
  const isOrgAdmin = ctx.membershipRole === "org_admin";

  const { current, upcoming, history } = ctx.rules.current || ctx.rules.upcoming ? await getRulesVersions(ctx.db) : { current: null, upcoming: null, history: [] };
  const wanted = one(sp.v);
  const version = (wanted && [upcoming, current].find((v) => v?.label === wanted)) || upcoming || current;

  if (!version) {
    return (
      <div className="grid gap-6">
        <PageHeader title={tg("network.versions.title")} />
        <Panel>
          <p className="text-sm">{t("accept.noVersion")}</p>
        </Panel>
      </div>
    );
  }

  const isUpcoming = version.id === upcoming?.id;
  const memberAccepted = isUpcoming ? ctx.rules.memberAcceptedUpcoming : ctx.rules.memberAcceptedCurrent;
  const orgAcceptance = isUpcoming ? ctx.rules.orgAcceptedUpcoming : ctx.rules.orgAcceptedCurrent;
  const needs = acceptanceNeeds({ isOrgAdmin, settlementMode: ctx.settlementMode, orgAccepted: Boolean(orgAcceptance?.at), memberAccepted });
  const mine = await getMyAcceptances(ctx.db, ctx.userId);

  if (needs.done) {
    const at = mine.find((a) => a.version_id === version.id)?.accepted_at ?? mine[0]?.accepted_at;
    return (
      <div className="grid gap-6">
        <PageHeader title={tg("network.versions.title")} />
        <Panel className="grid gap-4">
          <p className="flex items-start gap-2 text-[15px]">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
            {t("accept.already", { label: version.label, date: f.etDate(at) })}
          </p>
          <Button asChild variant="outline" className="min-h-11 w-full justify-self-start sm:min-h-9 sm:w-auto">
            <Link href={nextHref}>{tg("common.actions.back")}</Link>
          </Button>
        </Panel>
      </div>
    );
  }

  // "Compare with the version you accepted": the latest version this member accepted before this one.
  const allVersions = [current, ...history].filter((v): v is NonNullable<typeof v> => Boolean(v));
  const previous = allVersions.find((v) => v.id !== version.id && mine.some((a) => a.version_id === v.id));
  const [full, texts, defaultLocale] = await Promise.all([getRulesVersionById(ctx.db, version.id), buildAcceptanceTexts(ctx.db, version.id), defaultLocaleFor(ctx, one(sp.lang))]);
  const history_ = `/network-rules?org=${encodeURIComponent(orgSlug)}&from=${encodeURIComponent(`/workspace/${orgSlug}/accept-rules?v=${version.label}`)}`;

  return (
    <div className="grid gap-6">
      <PageHeader title={tg("network.versions.title")} />
      <AcceptanceBlock
        key={version.id}
        variant="reaccept"
        orgSlug={orgSlug}
        orgName={ctx.organizationName}
        version={{ id: version.id, label: version.label, effectiveAt: version.effective_at, type: version.type, legalReason: full?.legal_reason }}
        texts={texts}
        defaultLocale={defaultLocale}
        needOrg={needs.org}
        orgAcceptedAt={isOrgAdmin && !ctx.settlementMode ? (orgAcceptance?.at ?? null) : null}
        supportEmail={supportEmail()}
        historyHref={history_}
        nextHref={nextHref}
        compareHref={previous ? `/network-rules/${encodeURIComponent(previous.label)}?org=${encodeURIComponent(orgSlug)}` : null}
      />
    </div>
  );
}
