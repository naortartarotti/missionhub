import type { ReactNode } from "react";
import type { RequestContext } from "@/server/auth/context";
import { getGlobalT } from "@/i18n/server";
import { Logo } from "@/components/layout/logo";
import { AccountMenu } from "@/components/layout/account-menu";
import { AcceptanceBlock } from "./acceptance-block";
import { buildAcceptanceTexts, defaultLocaleFor, getRulesVersionById, supportEmail } from "../page-data";
import { acceptanceNeeds } from "../ui-state";

/**
 * BR-7 first-access gate (S1 gate variant, S22-e in settlement mode). Rendered by the workspace
 * layout instead of the navigation and the page. Keeps only the logo, the org switcher, the account
 * menu (sign out, no profile link) and the version history link (§2.2 item 2).
 */
export async function RulesGate({ ctx, switcher }: { ctx: RequestContext; switcher: ReactNode }) {
  const t = await getGlobalT();
  const current = ctx.rules.current!;
  const [version, texts, defaultLocale] = await Promise.all([getRulesVersionById(ctx.db, current.id), buildAcceptanceTexts(ctx.db, current.id), defaultLocaleFor(ctx)]);
  const isOrgAdmin = ctx.membershipRole === "org_admin";
  const orgAcceptedAt = ctx.rules.orgAcceptedCurrent?.at ?? null;
  const needs = acceptanceNeeds({ isOrgAdmin, settlementMode: ctx.settlementMode, orgAccepted: Boolean(orgAcceptedAt), memberAccepted: false });
  const historyHref = `/network-rules?org=${encodeURIComponent(ctx.organizationSlug)}&from=${encodeURIComponent(`/workspace/${ctx.organizationSlug}/overview`)}`;
  return (
    <div className="min-h-dvh bg-background">
      <a href="#main" className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        {t("common.skipToContent")}
      </a>
      <header className="border-b border-border/60 bg-sidebar">
        <div className="mx-auto grid max-w-6xl gap-3 px-4 py-4 sm:flex sm:items-center sm:justify-between sm:px-8">
          <Logo />
          <div className="grid gap-2 sm:flex sm:items-center">
            <div className="sm:w-64">{switcher}</div>
            <div className="sm:w-64">
              <AccountMenu orgSlug={ctx.organizationSlug} user={ctx.user} hideProfile />
            </div>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        <h1 className="sr-only">{t("network.versions.title")}</h1>
        <AcceptanceBlock
          key={current.id}
          variant="gate"
          orgSlug={ctx.organizationSlug}
          orgName={ctx.organizationName}
          version={{ id: current.id, label: current.label, effectiveAt: current.effectiveAt, type: current.type, legalReason: version?.legal_reason }}
          texts={texts}
          defaultLocale={defaultLocale}
          needOrg={needs.org}
          orgAcceptedAt={isOrgAdmin && !ctx.settlementMode ? orgAcceptedAt : null}
          supportEmail={supportEmail()}
          historyHref={historyHref}
        />
      </main>
    </div>
  );
}
