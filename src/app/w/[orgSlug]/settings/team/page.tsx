import { can, getRequestContext } from "@/server/auth/context";
import { ROLE_LABELS } from "@/server/authorization/permissions";
import { InviteForm, MemberControls, RevokeInviteButton } from "@/features/organizations/components/team-manager";
import { Panel } from "@/components/shared/card";
import { SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { formatDate } from "@/lib/labels";

export const metadata = { title: "Team" };

export default async function TeamPage({ params }: PageProps<"/w/[orgSlug]/settings/team">) {
  const { orgSlug } = await params;
  const ctx = await getRequestContext(orgSlug);
  const manage = can(ctx, "team:manage");
  const [{ data: members }, invites] = await Promise.all([
    ctx.db.from("organization_memberships").select("id, role, status, user_id, created_at, profile:profiles!memberships_user_profile_fk(full_name, email)").eq("organization_id", ctx.organizationId).order("created_at"),
    manage ? ctx.db.from("organization_invitations").select("id, email, role, status, expires_at, created_at").eq("organization_id", ctx.organizationId).eq("status", "pending").order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  return (
    <div className="grid gap-6">
      {manage ? (
        <Panel>
          <SectionTitle>Invite a teammate</SectionTitle>
          <p className="mb-4 text-sm text-muted-foreground">Candidates and jobs belong to the organization; each record keeps a responsible owner. Recruiters can manage records and referrals; managers also handle privacy requests and audit; admins manage the team.</p>
          <InviteForm orgSlug={orgSlug} />
          {(invites.data ?? []).length ? (
            <ul className="mt-5 divide-y divide-border/60">
              {invites.data!.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span><span className="font-medium">{i.email}</span> <span className="text-muted-foreground">· {ROLE_LABELS[i.role]} · expires {formatDate(i.expires_at)}</span></span>
                  <RevokeInviteButton orgSlug={orgSlug} invitationId={i.id} />
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
      ) : null}
      <Panel>
        <SectionTitle>Members</SectionTitle>
        <ul className="divide-y divide-border/60">
          {(members ?? []).map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
              <InitialsAvatar name={m.profile?.full_name || m.profile?.email || "?"} className="size-9" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{m.profile?.full_name || "—"}</span>
                <span className="block text-sm text-muted-foreground">{m.profile?.email}</span>
              </span>
              {m.status === "suspended" ? <StatusPill tone="warning" label="Suspended" /> : null}
              {manage ? (
                <MemberControls orgSlug={orgSlug} membershipId={m.id} role={m.role} status={m.status} isSelf={m.user_id === ctx.userId} />
              ) : (
                <span className="text-sm text-muted-foreground">{ROLE_LABELS[m.role]}</span>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
