import { assertCan, getRequestContext } from "@/server/auth/context";
import { PrivacyRequestActions, PrivacyRequestForm } from "@/features/compliance/components/privacy-requests";
import { Panel } from "@/components/shared/card";
import { SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { formatDate, isPast } from "@/lib/labels";

export const metadata = { title: "Privacy requests" };

export default async function PrivacyPage({ params }: PageProps<"/w/[orgSlug]/settings/privacy">) {
  const { orgSlug } = await params;
  const ctx = await getRequestContext(orgSlug);
  assertCan(ctx, "privacy:manage");
  const { data } = await ctx.db.from("privacy_requests").select("*").eq("organization_id", ctx.organizationId).order("created_at", { ascending: false });
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
      <Panel>
        <SectionTitle>Log a data-subject request</SectionTitle>
        <p className="mb-4 text-sm text-muted-foreground">Candidates aren't users, so requests arrive by email or phone. Log them here to track deadlines. Draft process — legal review required.</p>
        <PrivacyRequestForm orgSlug={orgSlug} />
      </Panel>
      <Panel>
        <SectionTitle>Requests</SectionTitle>
        {(data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No requests logged.</p> : (
          <ul className="divide-y divide-border/60">
            {data!.map((r) => {
              const overdue = r.status !== "completed" && r.status !== "rejected" && isPast(r.due_at);
              return (
                <li key={r.id} className="grid gap-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium capitalize">{r.kind} · <span className="font-normal text-muted-foreground">{r.requester_contact}</span></p>
                    <StatusPill tone={r.status === "completed" ? "success" : overdue ? "danger" : "warning"} label={overdue ? "Overdue" : r.status.replace("_", " ")} />
                  </div>
                  <p className="text-sm text-muted-foreground">Due {formatDate(r.due_at)}{r.resolution ? ` · ${r.resolution}` : ""}</p>
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
