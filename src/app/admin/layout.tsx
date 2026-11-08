import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, listMemberships } from "@/server/auth/context";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";

export const metadata = { title: { default: "Platform admin", template: "%s · Platform admin" } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireUser();
  if (!user.isPlatformAdmin) notFound(); // do not reveal the admin area exists
  const memberships = await listMemberships();
  return (
    <div className="min-h-dvh lg:p-4">
      <div className="mx-auto min-h-dvh max-w-[1400px] bg-background px-4 py-6 sm:px-8 lg:min-h-[calc(100dvh-2rem)] lg:rounded-[2.25rem] lg:px-10 lg:py-8">
        <header className="mb-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="rounded-full bg-foreground px-2.5 py-1 text-xs font-semibold text-background">Platform admin</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {memberships[0] ? <Button variant="outline" asChild><Link href={`/w/${memberships[0].slug}/overview`}>Back to workspace</Link></Button> : null}
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
