import Link from "next/link";
import { ScrollText } from "lucide-react";
import { canSeeAgency, getRequestContext, listMemberships } from "@/server/auth/context";
import { countOpportunitiesToReview } from "@/features/matching/queries";
import { countPendingReceivedReferrals } from "@/features/referrals/queries";
import { getGlobalT } from "@/i18n/server";
import { Logo } from "@/components/layout/logo";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { OrgSwitcher } from "@/components/layout/org-switcher";
import { AccountMenu } from "@/components/layout/account-menu";
import { MobileNav } from "@/components/layout/mobile-nav";
import { DashboardOnly } from "@/components/layout/dashboard-only";
import { ActivityPopover } from "@/features/notifications/components/activity-popover";
import { ActivityProvider } from "@/features/notifications/components/activity-context";
import { getSettlementSummary, listMyConductReports } from "@/features/network-rules/queries";
import { NetworkBanners } from "@/features/network-rules/components/network-banners";
import { SettlementProvider, type SettlementInfo } from "@/features/network-rules/components/settlement";
import { RulesGate } from "@/features/network-rules/components/rules-gate";

export default async function WorkspaceLayout({ children, params }: LayoutProps<"/workspace/[orgSlug]">) {
  const { orgSlug } = await params;
  // N10 (BR-34): the layout opts in to settlement mode; every page still defaults to deny and opts in
  // on its own. A blocked page's notFound() renders S22-c through ./not-found.tsx.
  const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
  const [t, memberships] = await Promise.all([getGlobalT(), listMemberships()]);
  const switcher = (
    <OrgSwitcher
      current={{ slug: ctx.organizationSlug, name: ctx.organizationName, roleLabel: t(`labels.role.${ctx.membershipRole}`), settlementMode: ctx.settlementMode }}
      memberships={memberships}
    />
  );

  // BR-7 first-access gate: replaces the navigation and the page; the URL stays, so after accepting
  // the requested page renders (router.refresh in the gate).
  if (ctx.rules.gateRequired) {
    return <RulesGate ctx={ctx} switcher={switcher} />;
  }

  const restricted = ctx.restriction === "network_hold" || ctx.restriction === "rules_not_accepted";
  const isOrgAdmin = ctx.membershipRole === "org_admin";
  const [unread, recent, incoming, newMatches, reports, settlementCounts] = await Promise.all([
    ctx.db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId).is("read_at", null),
    ctx.db.from("notifications").select("id, title, body, read_at, created_at").eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(8),
    ctx.settlementMode ? Promise.resolve(0) : countPendingReceivedReferrals(ctx),
    ctx.settlementMode || restricted ? Promise.resolve(0) : countOpportunitiesToReview(ctx),
    // "Your reports" in the account menu: own reports, or (org admin) any report from the org.
    listMyConductReports(ctx, isOrgAdmin ? "org" : "mine").catch(() => []),
    ctx.settlementMode ? getSettlementSummary(ctx).catch(() => null) : Promise.resolve(null),
  ]);
  // The opportunities badge is hidden while partner activity is paused (§2.6 item 3).
  const badges = { opportunities: newMatches, notifications: unread.count ?? 0, referrals: incoming };
  const settlement: SettlementInfo | null = ctx.settlementMode ? { orgSlug, isOrgAdmin, counts: settlementCounts } : null;
  const rulesHref = `/network-rules?org=${encodeURIComponent(orgSlug)}&from=${encodeURIComponent(`/workspace/${orgSlug}/overview`)}`;

  const activityItems = recent.data ?? [];
  // Desktop has no top bar: each page's sticky PageHeader is the header; the dashboard's carries the bell.
  // Organization (switch) sits at the top, team and settings in the nav's Agency section; the person's own account menu at the bottom.
  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex items-center justify-between gap-2">
        <Link href={`/workspace/${orgSlug}/overview`} className="rounded-xl px-2 py-1">
          <Logo />
        </Link>
      </div>
      <div className="mb-6 lg:mb-8">{switcher}</div>
      <SidebarNav orgSlug={orgSlug} badges={badges} showAgency={canSeeAgency(ctx)} settlement={ctx.settlementMode} />
      <div className="mt-auto pt-6">
        {ctx.isDemo ? (
          <div className="mb-3 rounded-2xl bg-tile-yellow p-4 text-tile-foreground">
            <p className="text-sm font-semibold">{t("common.demo.title")}</p>
            <p className="mt-0.5 text-xs opacity-80">{t("common.demo.body")}</p>
          </div>
        ) : null}
        {/* N10 §2.5: the versions page, for every role and org state. */}
        <Link href={rulesHref} className="mb-2 flex min-h-11 items-center gap-3 rounded-2xl px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
          <ScrollText className="size-4" aria-hidden />
          {t("network.versions.footerLink")}
        </Link>
        <div className="border-t border-sidebar-border pt-3">
          <AccountMenu orgSlug={orgSlug} user={ctx.user} reportsHref={reports.length ? `/workspace/${orgSlug}/reports` : null} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-background">
      <a href="#main" className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        {t("common.skipToContent")}
      </a>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-[260px] shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar px-5 py-8 lg:block">{sidebar}</aside>
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile only: menu, logo and (on the dashboard) the bell; the sidebar is hidden here. */}
          <header className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-8 lg:hidden">
            <div className="flex items-center gap-3">
              <MobileNav>{sidebar}</MobileNav>
              <Logo compact />
            </div>
            <DashboardOnly>
              <ActivityPopover orgSlug={orgSlug} items={activityItems} unread={badges.notifications} />
            </DashboardOnly>
          </header>
          <main id="main" className="flex-1 px-4 pb-12 sm:px-8 lg:px-10">
            {/* S3: restriction / notice banners, above the page header (BR-38, BR-8). */}
            <NetworkBanners ctx={ctx} />
            <SettlementProvider value={settlement}>
              <ActivityProvider orgSlug={orgSlug} items={activityItems} unread={badges.notifications}>
                {children}
              </ActivityProvider>
            </SettlementProvider>
          </main>
        </div>
      </div>
    </div>
  );
}
