import { getRequestContext, can } from "@/server/auth/context";
import { PageHeader } from "@/components/shared/page-header";
import { SettingsNav } from "@/components/layout/settings-nav";

export default async function SettingsLayout({ children, params }: LayoutProps<"/w/[orgSlug]/settings">) {
  const { orgSlug } = await params;
  const ctx = await getRequestContext(orgSlug);
  const items = [
    { href: `/w/${orgSlug}/settings`, label: "Organization" },
    { href: `/w/${orgSlug}/settings/team`, label: "Team" },
    ...(can(ctx, "privacy:manage") ? [{ href: `/w/${orgSlug}/settings/privacy`, label: "Privacy requests" }] : []),
    ...(can(ctx, "audit:read") ? [{ href: `/w/${orgSlug}/settings/audit`, label: "Audit log" }] : []),
  ];
  return (
    <div className="grid gap-6">
      <PageHeader title="Settings" description={`Manage ${ctx.organizationName}.`} />
      <SettingsNav items={items} />
      {children}
    </div>
  );
}
