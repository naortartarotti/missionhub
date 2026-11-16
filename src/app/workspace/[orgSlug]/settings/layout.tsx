import { getRequestContext, can } from "@/server/auth/context";
import { PageHeader } from "@/components/shared/page-header";
import { SettingsNav } from "@/components/layout/settings-nav";
import { getT } from "@/i18n/server";

export default async function SettingsLayout({ children, params }: LayoutProps<"/workspace/[orgSlug]/settings">) {
  const { orgSlug } = await params;
  // N10 (BR-34): the layout opts in to settlement mode; each settings page still opts in (team,
  // standing) or stays default-deny (organization, connectors, privacy, audit → S22-c).
  const [ctx, t] = await Promise.all([getRequestContext(orgSlug, { allowSettlement: true }), getT("settings")]);
  const standing = ctx.membershipRole === "org_admin" ? [{ href: `/workspace/${orgSlug}/settings/standing`, label: t("nav.standing") }] : [];
  // Org-wide settings only; personal preferences (language, theme) live in the account menu.
  const items = ctx.settlementMode
    ? [{ href: `/workspace/${orgSlug}/settings/team`, label: t("nav.team") }, ...standing]
    : [
        { href: `/workspace/${orgSlug}/settings`, label: t("nav.organization") },
        { href: `/workspace/${orgSlug}/settings/team`, label: t("nav.team") },
        { href: `/workspace/${orgSlug}/settings/connectors`, label: t("nav.connectors") },
        ...(can(ctx, "privacy:manage") ? [{ href: `/workspace/${orgSlug}/settings/privacy`, label: t("nav.privacy") }] : []),
        ...(can(ctx, "audit:read") ? [{ href: `/workspace/${orgSlug}/settings/audit`, label: t("nav.audit") }] : []),
        ...standing,
      ];
  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description", { name: ctx.organizationName })} />
      <SettingsNav items={items} />
      {children}
    </div>
  );
}
