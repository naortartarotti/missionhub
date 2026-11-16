import Link from "next/link";
import { Info, PauseCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import type { RequestContext } from "@/server/auth/context";
import { getT } from "@/i18n/server";

/** True when partner activity is paused for the caller's org (§2.6; settlement mode has its own page). */
export const isPartnerRestricted = (ctx: Pick<RequestContext, "restriction">) => ctx.restriction === "network_hold" || ctx.restriction === "rules_not_accepted";

/** S20-c: `/opportunities` and `/opportunities/[matchId]` while the org is held or hasn't accepted the rules. */
export async function OpportunitiesRestricted({ ctx, title }: { ctx: RequestContext; title: string }) {
  const [t, tn] = await Promise.all([getT("opportunities"), getT("network")]);
  const isAdmin = ctx.membershipRole === "org_admin";
  const hold = ctx.restriction === "network_hold";
  const label = ctx.rules.required?.label ?? ctx.rules.current?.label ?? "";
  const base = `/workspace/${ctx.organizationSlug}`;
  const cta = isAdmin ? (
    <Button asChild className="min-h-11 w-full sm:w-auto">
      <Link href={hold ? `${base}/settings/standing` : `${base}/accept-rules?v=${encodeURIComponent(label)}`}>{hold ? tn("banner.cta.standing") : tn("banner.cta.accept")}</Link>
    </Button>
  ) : undefined;
  return (
    <div className="grid gap-6">
      <PageHeader title={title} />
      <EmptyState
        icon={PauseCircle}
        title={t("restricted.title")}
        description={hold ? t("restricted.hold") : `${t("restricted.rules", { label })}${isAdmin ? "" : ` ${tn("banner.rules.askAdmin")}`}`}
        action={cta}
      />
    </div>
  );
}

/** S21: an old opportunity link to a job whose owner isn't taking referrals (never a reason, BR-14). */
export async function PartnerJobUnavailable({ orgSlug, status, orgName, jobTitle }: { orgSlug: string; status: "not_taking_referrals" | "no_longer_member"; orgName: string; jobTitle: string }) {
  const t = await getT("network");
  return (
    <div className="grid gap-6">
      <PageHeader title={jobTitle} />
      <Panel className="grid gap-4">
        <p className="flex items-start gap-2 text-[15px]">
          <Info className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          {status === "no_longer_member" ? t("partner.noLongerMember", { org: orgName }) : t("partner.notTakingReferrals", { org: orgName })}
        </p>
        <Button asChild variant="outline" className="min-h-11 w-full justify-self-start sm:w-auto">
          <Link href={`/workspace/${orgSlug}/opportunities`}>{t("partner.back")}</Link>
        </Button>
      </Panel>
    </div>
  );
}
