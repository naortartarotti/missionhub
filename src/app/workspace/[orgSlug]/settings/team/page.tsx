import { can, getRequestContext } from "@/server/auth/context";
import { InviteForm, MemberControls, RevokeInviteButton, TransferPortfolioButton } from "@/features/organizations/components/team-manager";
import { Panel } from "@/components/shared/card";
import { SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";
import { getNetworkStanding } from "@/features/network-rules/queries";
import { SettlementDeactivateButton } from "@/features/network-rules/components/settlement-deactivate";

export async function generateMetadata() {
  return { title: (await getT("settings"))("team.metaTitle") };
}

export default async function TeamPage({ params }: PageProps<"/workspace/[orgSlug]/settings/team">) {
  const { orgSlug } = await params;
  // N10 (BR-34.6): readable in settlement mode; there, invitations, role changes and transfers are
  // hidden and an org admin can only deactivate members (not themselves, not the last admin).
  const [ctx, t, tg, f, tn] = await Promise.all([getRequestContext(orgSlug, { allowSettlement: true }), getT("settings"), getGlobalT(), getFormatter(), getT("network")]);
  const settling = ctx.settlementMode;
  const manage = can(ctx, "team:manage") && !settling;
  const canDeactivate = can(ctx, "team:manage") && settling;
  // S23 (Should): the Network Rules column for org admins, from the standing read (names only).
  const standing = ctx.membershipRole === "org_admin" ? await getNetworkStanding(ctx).catch(() => null) : null;
  const rulesLabel = ctx.rules.required?.label ?? ctx.rules.current?.label ?? null;
  const notAccepted = new Set((standing?.members_not_accepted ?? []).filter((m) => !m.accepted_current).map((m) => m.user_id));
  const [{ data: members }, invites] = await Promise.all([
    ctx.db.from("organization_memberships").select("id, role, status, user_id, created_at, profile:profiles!memberships_user_profile_fk(full_name, email)").eq("organization_id", ctx.organizationId).order("created_at"),
    manage ? ctx.db.from("organization_invitations").select("id, email, role, status, expires_at, created_at").eq("organization_id", ctx.organizationId).eq("status", "pending").order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  // What each member owns: shown so an admin can hand it over before someone leaves.
  const owned = new Map<string, { candidates: number; jobs: number }>();
  if (manage) {
    await Promise.all(
      (members ?? []).map(async (m) => {
        const [c, j] = await Promise.all([
          ctx.db.from("candidates").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organizationId).eq("owner_id", m.user_id).neq("status", "deleted"),
          ctx.db.from("jobs").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organizationId).eq("owner_id", m.user_id),
        ]);
        owned.set(m.user_id, { candidates: c.count ?? 0, jobs: j.count ?? 0 });
      }),
    );
  }
  const active = (members ?? []).filter((m) => m.status === "active");
  const activeAdmins = active.filter((m) => m.role === "org_admin").length;
  return (
    <div className="grid gap-6">
      {manage ? (
        <Panel>
          <SectionTitle>{t("team.inviteTitle")}</SectionTitle>
          <p className="mb-4 text-sm text-muted-foreground">{t("team.inviteDescription")}</p>
          <InviteForm orgSlug={orgSlug} />
          {(invites.data ?? []).length ? (
            <ul className="mt-5 divide-y divide-border/60">
              {invites.data!.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span><span className="font-medium">{i.email}</span> <span className="text-muted-foreground">· {tg(`labels.role.${i.role}`)} · {t("team.expires", { date: f.date(i.expires_at) })}</span></span>
                  <RevokeInviteButton orgSlug={orgSlug} invitationId={i.id} />
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
      ) : null}
      <Panel>
        <SectionTitle>{t("team.members")}</SectionTitle>
        {settling ? <p className="mb-3 text-sm text-muted-foreground">{tn("settlement.teamReadOnly")}</p> : null}
        <ul className="divide-y divide-border/60">
          {(members ?? []).map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
              <InitialsAvatar name={m.profile?.full_name || m.profile?.email || "?"} className="size-9" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{m.profile?.full_name || "—"}</span>
                <span className="block text-sm text-muted-foreground">
                  {m.profile?.email}
                  {manage && owned.get(m.user_id) ? ` · ${t("team.owns", owned.get(m.user_id)!)}` : null}
                </span>
              </span>
              {standing && rulesLabel && m.status === "active" ? (
                <span className="flex items-center gap-1.5">
                  <span className="sr-only">{t("team.rulesColumn")}: </span>
                  <StatusPill tone={notAccepted.has(m.user_id) ? "warning" : "success"} label={notAccepted.has(m.user_id) ? t("team.rulesNotAccepted") : t("team.rulesAccepted", { label: rulesLabel })} className="text-xs" />
                </span>
              ) : null}
              {m.status === "suspended" ? <StatusPill tone="warning" label={t("team.suspended")} /> : null}
              {canDeactivate && m.status === "active" && m.user_id !== ctx.userId && !(m.role === "org_admin" && activeAdmins <= 1) ? (
                <SettlementDeactivateButton orgSlug={orgSlug} membershipId={m.id} />
              ) : null}
              {manage && m.user_id !== ctx.userId ? (
                <TransferPortfolioButton
                  orgSlug={orgSlug}
                  fromUserId={m.user_id}
                  fromName={m.profile?.full_name || m.profile?.email || ""}
                  owned={owned.get(m.user_id) ?? { candidates: 0, jobs: 0 }}
                  teammates={active.filter((x) => x.user_id !== m.user_id).map((x) => ({ userId: x.user_id, name: x.profile?.full_name || x.profile?.email || "—" }))}
                />
              ) : null}
              {manage ? (
                <MemberControls orgSlug={orgSlug} membershipId={m.id} role={m.role} status={m.status} isSelf={m.user_id === ctx.userId} />
              ) : (
                <span className="text-sm text-muted-foreground">{tg(`labels.role.${m.role}`)}</span>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
