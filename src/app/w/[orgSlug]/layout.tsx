import Link from "next/link";
import { Bell } from "lucide-react";
import { getRequestContext, listMemberships } from "@/server/auth/context";
import { ROLE_LABELS } from "@/server/authorization/permissions";
import { Logo } from "@/components/layout/logo";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { OrgSwitcher } from "@/components/layout/org-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Button } from "@/components/ui/button";

export default async function WorkspaceLayout({ children, params }: LayoutProps<"/w/[orgSlug]">) {
  const { orgSlug } = await params;
  const ctx = await getRequestContext(orgSlug);
  const [memberships, unread, incoming] = await Promise.all([
    listMemberships(),
    ctx.db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId).is("read_at", null),
    ctx.db
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("target_org_id", ctx.organizationId)
      .in("status", ["submitted", "under_review"]),
  ]);
  const badges = { notifications: unread.count ?? 0, referrals: incoming.count ?? 0 };

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link href={`/w/${orgSlug}/overview`} className="mb-8 flex justify-center rounded-xl py-1 lg:mb-10" >
        <Logo />
      </Link>
      <SidebarNav orgSlug={orgSlug} badges={badges} />
      <div className="mt-auto pt-6">
        {ctx.isDemo ? (
          <div className="mb-3 rounded-2xl bg-tile-yellow p-4 text-tile-foreground">
            <p className="text-sm font-semibold">Demo workspace</p>
            <p className="mt-0.5 text-xs opacity-80">All data here is synthetic. Never mix it with real candidates.</p>
          </div>
        ) : null}
        <OrgSwitcher
          current={{ slug: ctx.organizationSlug, name: ctx.organizationName, roleLabel: ROLE_LABELS[ctx.membershipRole] }}
          memberships={memberships}
          user={ctx.user}
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:p-4">
      <a href="#main" className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <div className="mx-auto flex min-h-dvh max-w-[1600px] overflow-hidden bg-background lg:min-h-[calc(100dvh-2rem)] lg:rounded-[2.25rem] lg:shadow-[0_30px_80px_-40px_rgb(0_0_0/0.35)]">
        <aside className="hidden w-[260px] shrink-0 border-r border-sidebar-border bg-sidebar px-5 py-8 lg:block">{sidebar}</aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-8 lg:px-10 lg:pt-8">
            <div className="flex items-center gap-3 lg:hidden">
              <MobileNav>{sidebar}</MobileNav>
              <Logo compact />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <Button variant="outline" size="icon" asChild>
                <Link href={`/w/${orgSlug}/notifications`} aria-label={`Notifications${badges.notifications ? `, ${badges.notifications} unread` : ""}`} className="relative">
                  <Bell className="size-[18px]" aria-hidden />
                  {badges.notifications ? <span className="absolute top-2 right-2.5 size-2 rounded-full bg-danger ring-2 ring-card" aria-hidden /> : null}
                </Link>
              </Button>
            </div>
          </header>
          <main id="main" className="flex-1 px-4 pt-2 pb-12 sm:px-8 lg:px-10">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
