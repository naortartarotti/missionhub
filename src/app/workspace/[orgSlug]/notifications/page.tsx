import { Bell, MailX } from "lucide-react";
import { getRequestContext } from "@/server/auth/context";
import { integrations } from "@/server/env";
import { markAllRead, openNotification } from "@/features/notifications/actions";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Panel } from "@/components/shared/card";
import { Button } from "@/components/ui/button";
import { getFormatter, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("activity"))("title") };
}

export default async function NotificationsPage({ params }: PageProps<"/workspace/[orgSlug]/notifications">) {
  const { orgSlug } = await params;
  const [ctx, t, f] = await Promise.all([getRequestContext(orgSlug), getT("activity"), getFormatter()]);
  const { data } = await ctx.db
    .from("notifications")
    .select("id, kind, title, body, link, read_at, created_at, organizations(slug)")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = data ?? [];
  const unread = rows.filter((n) => !n.read_at).length;
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={unread ? <form action={markAllRead.bind(null, orgSlug)}><Button variant="outline" type="submit">{t("markAllRead")}</Button></form> : null}
      />
      {!integrations.email ? (
        <div className="flex items-start gap-2 rounded-2xl bg-info-soft px-4 py-3 text-sm text-info">
          <MailX className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("emailOff")}
        </div>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState icon={Bell} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <Panel className="divide-y divide-border/60 p-0">
          {rows.map((n) => {
            return (
              <form key={n.id} action={openNotification.bind(null, orgSlug, n.id)}>
                <button type="submit" className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-muted/40 focus-visible:outline-2">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-danger"}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={`block ${n.read_at ? "" : "font-semibold"}`}>{n.title}{!n.read_at ? <span className="sr-only"> ({t("unread")})</span> : null}</span>
                    {n.body ? <span className="block text-sm text-muted-foreground">{n.body}</span> : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{f.relative(n.created_at)}</span>
                </button>
              </form>
            );
          })}
        </Panel>
      )}
    </div>
  );
}
