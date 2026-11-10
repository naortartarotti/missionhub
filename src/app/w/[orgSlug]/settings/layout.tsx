import { getRequestContext, can } from "@/server/auth/context";
import { PageHeader } from "@/components/shared/page-header";
import { SettingsNav } from "@/components/layout/settings-nav";
import { getT } from "@/i18n/server";

export default async function SettingsLayout({ children, params }: LayoutProps<"/w/[orgSlug]/settings">) {
  const { orgSlug } = await params;
  const [ctx, t] = await Promise.all([getRequestContext(orgSlug), getT("settings")]);
  // Org-wide settings only; personal preferences (language, theme) live in the account menu.
  const items = [
    { href: `/w/${orgSlug}/settings`, label: t("nav.organization") },
    { href: `/w/${orgSlug}/settings/team`, label: t("nav.team") },
    ...(can(ctx, "privacy:manage") ? [{ href: `/w/${orgSlug}/settings/privacy`, label: t("nav.privacy") }] : []),
    ...(can(ctx, "audit:read") ? [{ href: `/w/${orgSlug}/settings/audit`, label: t("nav.audit") }] : []),
  ];
  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description", { name: ctx.organizationName })} />
      <SettingsNav items={items} />
      {children}
    </div>
  );
}
