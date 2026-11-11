import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser, listMemberships } from "@/server/auth/context";
import { createClient } from "@/server/supabase/server";
import { Logo } from "@/components/layout/logo";
import { MobileNav } from "@/components/layout/mobile-nav";
import { AccountMenu } from "@/components/layout/account-menu";
import { AdminSidebarNav } from "@/features/admin/components/admin-sidebar-nav";
import { getAdminQueues } from "@/features/admin/queries";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const title = (await getT("admin"))("title");
  return { title: { default: title, template: `%s · ${title}` }, robots: { index: false, follow: false } };
}

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireUser();
  if (!user.isPlatformAdmin) notFound(); // do not reveal the admin area exists
  const db = await createClient();
  const [memberships, t, tc, queues] = await Promise.all([listMemberships(), getT("admin"), getT("common"), getAdminQueues(db)]);
  const workspace = memberships[0]?.slug;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="mb-8 flex items-center gap-2 px-2 lg:mb-10">
        <Link href="/admin" className="rounded-xl py-1">
          <Logo />
        </Link>
        <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background">{t("badge")}</span>
      </div>
      <AdminSidebarNav badges={queues} />
      <div className="mt-auto grid gap-2 pt-6">
        {workspace ? (
          <Link href={`/workspace/${workspace}/overview`} className="flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden /> {t("backToWorkspace")}
          </Link>
        ) : null}
        <div className="border-t border-sidebar-border pt-3">
          <AccountMenu orgSlug={workspace} user={user} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-background">
      <a href="#main" className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        {tc("skipToContent")}
      </a>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-[260px] shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar px-5 py-8 lg:block">{sidebar}</aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 px-4 pt-4 sm:px-8 lg:hidden">
            <MobileNav>{sidebar}</MobileNav>
            <Logo compact />
            <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background">{t("badge")}</span>
          </header>
          <main id="main" className="flex-1 px-4 pb-12 sm:px-8 lg:px-10">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
