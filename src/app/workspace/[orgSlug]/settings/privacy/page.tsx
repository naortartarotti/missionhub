import { assertCan, getRequestContext } from "@/server/auth/context";
import { PrivacyRequestActions, PrivacyRequestForm } from "@/features/compliance/components/privacy-requests";
import { Panel } from "@/components/shared/card";
import { SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { isPast } from "@/lib/labels";
import { getFormatter, getT } from "@/i18n/server";

const KINDS = ["access", "correction", "withdrawal", "deletion"] as const;
const STATUSES = ["open", "in_progress", "completed", "rejected"] as const;
const isOneOf = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);

export async function generateMetadata() {
  return { title: (await getT("settings"))("privacy.metaTitle") };
}

export default async function PrivacyPage({ params }: PageProps<"/workspace/[orgSlug]/settings/privacy">) {
  const { orgSlug } = await params;
  const [ctx, t, f] = await Promise.all([getRequestContext(orgSlug), getT("settings"), getFormatter()]);
  assertCan(ctx, "privacy:manage");
  const { data } = await ctx.db.from("privacy_requests").select("*").eq("organization_id", ctx.organizationId).order("created_at", { ascending: false });
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
      <Panel>
        <SectionTitle>{t("privacy.logTitle")}</SectionTitle>
        <p className="mb-4 text-sm text-muted-foreground">{t("privacy.logDescription")}</p>
        <PrivacyRequestForm orgSlug={orgSlug} />
      </Panel>
      <Panel>
        <SectionTitle>{t("privacy.requests")}</SectionTitle>
        {(data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{t("privacy.empty")}</p> : (
          <ul className="divide-y divide-border/60">
            {data!.map((r) => {
              const overdue = r.status !== "completed" && r.status !== "rejected" && isPast(r.due_at);
              return (
                <li key={r.id} className="grid gap-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium capitalize">{isOneOf(KINDS, r.kind) ? t(`privacy.kind.${r.kind}`) : r.kind} · <span className="font-normal text-muted-foreground">{r.requester_contact}</span></p>
                    <StatusPill tone={r.status === "completed" ? "success" : overdue ? "danger" : "warning"} label={overdue ? t("privacy.overdue") : isOneOf(STATUSES, r.status) ? t(`privacy.status.${r.status}`) : r.status.replace("_", " ")} />
                  </div>
                  <p className="text-sm text-muted-foreground">{t("privacy.due", { date: f.date(r.due_at) })}{r.resolution ? ` · ${r.resolution}` : ""}</p>
                  {r.status === "open" || r.status === "in_progress" ? <PrivacyRequestActions orgSlug={orgSlug} id={r.id} /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
