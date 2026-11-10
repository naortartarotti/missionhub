import Link from "next/link";
import { getRequestContext, listMemberships } from "@/server/auth/context";
import { countNewOpportunities } from "@/features/matching/queries";
import { getGlobalT } from "@/i18n/server";
import { Logo } from "@/components/layout/logo";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { OrgSwitcher } from "@/components/layout/org-switcher";
import { AccountMenu } from "@/components/layout/account-menu";
import { MobileNav } from "@/components/layout/mobile-nav";
import { DashboardOnly } from "@/components/layout/dashboard-only";
import { ActivityPopover } from "@/features/notifications/components/activity-popover";
import { ActivityProvider } from "@/features/notifications/components/activity-context";

export default async function WorkspaceLayout({ children, params }: LayoutProps<"/w/[orgSlug]">) {
  const { orgSlug } = await params;
  const ctx = await getRequestContext(orgSlug);
  const [t, memberships, unread, recent, incoming, newMatches] = await Promise.all([
    getGlobalT(),
    listMemberships(),
    ctx.db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId).is("read_at", null),
    ctx.db.from("notifications").select("id, title, body, read_at, created_at").eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(8),
    ctx.db
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("target_org_id", ctx.organizationId)
      .in("status", ["submitted", "under_review"]),
    countNewOpportunities(ctx),
  ]);
  const badges = { opportunities: newMatches, notifications: unread.count ?? 0, referrals: incoming.count ?? 0 };

  const activityItems = recent.data ?? [];
  // Desktop has no top bar: each page's sticky PageHeader is the header; the dashboard's carries the bell.
  // Organization (switch, settings) sits at the top; the person's own account menu at the bottom.
  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex items-center justify-between gap-2">
        <Link href={`/w/${orgSlug}/overview`} className="rounded-xl px-2 py-1">
          <Logo />
        </Link>
      </div>
      <div className="mb-6 lg:mb-8">
        <OrgSwitcher
          current={{ slug: ctx.organizationSlug, name: ctx.organizationName, roleLabel: t(`labels.role.${ctx.membershipRole}`) }}
          memberships={memberships}
        />
      </div>
      <SidebarNav orgSlug={orgSlug} badges={badges} />
      <div className="mt-auto pt-6">
        {ctx.isDemo ? (
          <div className="mb-3 rounded-2xl bg-tile-yellow p-4 text-tile-foreground">
            <p className="text-sm font-semibold">{t("common.demo.title")}</p>
            <p className="mt-0.5 text-xs opacity-80">{t("common.demo.body")}</p>
          </div>
        ) : null}
        <div className="border-t border-sidebar-border pt-3">
          <AccountMenu orgSlug={orgSlug} user={ctx.user} />
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
            <ActivityProvider orgSlug={orgSlug} items={activityItems} unread={badges.notifications}>
              {children}
            </ActivityProvider>
          </main>
        </div>
      </div>
    </div>
  );
}
